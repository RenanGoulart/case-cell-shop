# Feature Specification: Catálogo e Checkout Assíncrono

**Feature Branch**: `001-async-checkout-service`

**Created**: 2026-07-27

**Status**: Ready for Planning

**Input**: Serviço backend com catálogo em cache, checkout assíncrono idempotente, proteção de
estoque, consulta de pedido, ERP simulado, observabilidade e contrato de API previsível.

## Clarifications

### Session 2026-07-27

- Q: Qual resposta deve ser retornada quando não existem produtos? → A: `204 No Content`, sem
  corpo de resposta.
- Q: Como comparar payloads para idempotência e resolver requests simultâneos? → A: Canonicalizar
  o payload ordenando propriedades recursivamente e `items` por `productId`; payloads equivalentes
  convergem para um pedido, e payloads diferentes com a mesma chave geram conflito.
- Q: Quando reduzir o estoque e como tratar checkouts concorrentes? → A: Reduzir a disponibilidade
  atomicamente ao aceitar o checkout; confirmação não reduz novamente, e falha ou expiração
  restitui a quantidade uma única vez.
- Q: Quais resultados, estados e retries devem representar o processamento no ERP simulado? → A:
  Cada tentativa tem 80% de chance de confirmação; indisponibilidade temporária e timeout após 60
  segundos permitem retry, enquanto indisponibilidade total causa falha definitiva.
- Q: Como distribuir os 20% de resultados sem confirmação? → A: 10% de
  `temporarily_unavailable`, 5% de `unavailable` e 5% de `timeout` em cada tentativa.
- Q: Como o serviço deve operar quando o Redis estiver indisponível? → A: Ignorar temporariamente
  o Redis, consultar o banco local e manter catálogo e checkout disponíveis; antes de reutilizar
  o cache após a recuperação, invalidar ou recarregar sua entrada para não servir dados obsoletos.
- Q: Como validar localmente o ganho de tempo do cache se o banco local responde quase
  imediatamente? -> A: O caminho de carregamento do catalogo a partir do banco local deve incluir
  atraso artificial configurável de 500ms apenas para demonstração/teste local de cache; o caminho
  atendido por Redis nao deve aplicar esse atraso. Essa simplificação imita latência de produção e
  deve ser documentada nos artefatos relevantes.
- Q: Qual evidencia estatística usar para o modo probabilístico do ERP sem deixar a suite local
  lenta? -> A: Reduzir a validação para 1.000 tentativas com RNG seeded e tolerância de 4 pontos
  percentuais por resultado, documentando que e uma amostra local reduzida para velocidade.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Listar produtos disponíveis (Priority: P1)

Como cliente, quero listar os produtos para visualizar preço e disponibilidade antes de iniciar
uma compra. Listagens repetidas devem ser rápidas sem apresentar dados mantidos além da validade
definida para o cache.

**Why this priority**: A consulta do catálogo é a entrada da jornada de compra e permite validar
isoladamente o comportamento de cache.

**Independent Test**: Carregar um catálogo conhecido, consultar `GET /products` antes e depois do
aquecimento do cache e confirmar conteúdo, hit/miss, expiração, invalidação e fallback para o
banco local durante indisponibilidade do Redis.

**Acceptance Scenarios**:

1. **Given** produtos disponíveis, **When** o cliente consulta `GET /products`, **Then** recebe
   `200 OK` com identificador, nome, preço, moeda e quantidade disponível de cada produto.
2. **Given** uma entrada de cache válida, **When** a listagem é solicitada novamente, **Then** o
   mesmo catálogo é retornado sem recarregar a fonte local e um cache hit é registrado.
3. **Given** uma entrada de cache expirada, **When** a listagem é solicitada, **Then** a fonte
   local é consultada, o cache é renovado e um cache miss é registrado.
4. **Given** que não existem produtos, **When** a listagem é solicitada, **Then** o serviço retorna
   `204 No Content` sem corpo de resposta.
5. **Given** que o Redis está indisponível e o banco local está disponível, **When** a listagem é
   solicitada, **Then** o cache é ignorado e o serviço retorna o catálogo diretamente do banco
   com `200 OK` ou `204 No Content`.
6. **Given** que o catálogo foi carregado do banco mas sua gravação no Redis falhou, **When** a
   resposta é produzida, **Then** o resultado do banco é retornado e o cache permanece em modo
   degradado.
7. **Given** que uma alteração de disponibilidade foi confirmada enquanto o Redis estava
   indisponível, **When** o Redis se recupera, **Then** a entrada anterior é invalidada ou
   recarregada do banco antes de voltar a atender listagens.

---

### User Story 2 - Iniciar checkout assíncrono (Priority: P1)

Como cliente, quero enviar os itens do checkout e receber imediatamente um identificador de
pedido para acompanhar o processamento sem aguardar o ERP.

**Why this priority**: A aceitação assíncrona do pedido é o principal resultado de negócio do
serviço.

**Independent Test**: Enviar checkouts válidos e concorrentes contra estoque limitado e confirmar
resposta `202 Accepted` apenas para as operações que conseguirem reduzir a disponibilidade,
criação de reservas integrais, ausência de redução na confirmação e restituição em falha ou
expiração.

**Acceptance Scenarios**:

1. **Given** itens válidos, estoque suficiente e uma chave de idempotência nova, **When** o
   cliente envia `POST /checkout`, **Then** o estoque disponível é reduzido e a reserva é criada
   antes de receber `202 Accepted` com `orderId` e status `pending`.
2. **Given** um checkout aceito, **When** a resposta é devolvida, **Then** o envio ao ERP ainda
   pode ocorrer em segundo plano sem aumentar o tempo de espera do cliente.
3. **Given** quantidade inválida, item inexistente ou chave de idempotência ausente, **When** o
   checkout é solicitado, **Then** nenhum pedido ou reserva é criado e um erro documentado é
   retornado.
4. **Given** estoque insuficiente para qualquer item, **When** o checkout é solicitado, **Then** a
   operação inteira é rejeitada, nenhum item é reservado parcialmente e o estoque não muda.
5. **Given** checkouts concorrentes com chaves distintas disputando estoque limitado, **When** as
   operações são processadas, **Then** somente as que reduzem o estoque condicionalmente recebem
   `202 Accepted`; as demais recebem `409 INSUFFICIENT_STOCK` e o estoque nunca fica negativo.

---

### User Story 3 - Repetir checkout com segurança (Priority: P1)

Como cliente, quero repetir uma solicitação após timeout sem criar outro pedido ou outra reserva.

**Why this priority**: Repetições e duplo clique são esperados em chamadas de rede e não podem
duplicar efeitos comerciais.

**Independent Test**: Repetir o mesmo checkout com a mesma chave, variar apenas a ordem das
propriedades e dos itens, reutilizar a chave com valores diferentes e executar requests
simultâneos, verificando identidade do pedido, ausência de efeitos extras e conflito.

**Acceptance Scenarios**:

1. **Given** uma chave já associada a um checkout, **When** a mesma chave e um payload
   semanticamente equivalente são enviados novamente dentro da janela de idempotência, mesmo com
   propriedades ou itens em outra ordem, **Then** o mesmo `orderId` e o status atual são retornados
   sem novo pedido, reserva ou evento de processamento.
2. **Given** uma chave já associada a um checkout, **When** ela é reutilizada com payload
   diferente, **Then** o serviço retorna `409 Conflict` e não altera pedido nem estoque.
3. **Given** requisições simultâneas com a mesma chave e o mesmo payload, **When** elas são
   processadas, **Then** todas referenciam um único pedido e uma única reserva.
4. **Given** requisições simultâneas com a mesma chave e payloads diferentes, **When** elas são
   processadas, **Then** no máximo uma cria o pedido e as demais retornam `409 Conflict` sem efeito
   adicional.

---

### User Story 4 - Consultar status do pedido (Priority: P1)

Como cliente, quero consultar o status atual do pedido para saber se ele ainda está sendo
processado, foi confirmado ou falhou.

**Why this priority**: A consulta fecha o contrato assíncrono iniciado pela resposta `202`.

**Independent Test**: Consultar um pedido em cada estado permitido e um identificador inexistente,
confirmando o corpo e os códigos de resposta.

**Acceptance Scenarios**:

1. **Given** um pedido existente, **When** o cliente consulta
   `GET /orders/{orderId}/status`, **Then** recebe `200 OK` com `orderId`, status atual e data da
   última atualização.
2. **Given** um pedido inexistente, **When** o status é consultado, **Then** o serviço retorna
   `404 Not Found` com erro documentado.
3. **Given** um pedido em estado terminal, **When** novas consultas são realizadas, **Then** o
   status permanece `confirmed` ou `failed`.

---

### User Story 5 - Processar pedido no ERP simulado (Priority: P2)

Como operação, quero que pedidos aceitos sejam enviados em segundo plano ao ERP simulado, com
retry para falhas temporárias e encerramento previsível para falhas definitivas.

**Why this priority**: O processamento assíncrono conclui a jornada sem depender de uma integração
externa real.

**Independent Test**: Executar o simulador em modo probabilístico e forçar separadamente
confirmação, indisponibilidade temporária, indisponibilidade total e timeout, confirmando
probabilidade configurada, limite de 60 segundos, tentativas, transições e efeitos finais.

**Acceptance Scenarios**:

1. **Given** um pedido `pending`, **When** uma tentativa é iniciada, **Then** o pedido muda para
   `processing` antes de chamar o ERP simulado.
2. **Given** retorno `confirmed` do ERP simulado, **When** a tentativa termina, **Then** o pedido
   muda de `processing` para `confirmed` uma única vez.
3. **Given** retorno `temporarily_unavailable`, **When** ainda existe tentativa disponível,
   **Then** o pedido muda de `processing` para `retrying` e uma nova tentativa é agendada.
4. **Given** que o ERP simulado não concluiu em até 60 segundos, **When** o limite é atingido,
   **Then** a tentativa termina como `timeout`, o pedido muda para `retrying` se houver tentativa
   disponível e a resposta tardia é ignorada.
5. **Given** retorno `unavailable`, **When** a tentativa termina, **Then** o pedido muda
   imediatamente de `processing` para `failed` sem retry.
6. **Given** indisponibilidade temporária ou timeout na última tentativa, **When** não existe nova
   tentativa disponível, **Then** o pedido muda para `failed` e sua reserva é restituída.
7. **Given** entrega duplicada do mesmo trabalho assíncrono, **When** ela é consumida, **Then** não
   ocorre nova tentativa, transição terminal nem efeito final duplicado.

---

### User Story 6 - Rastrear fluxos e sinais operacionais (Priority: P2)

Como operação, quero rastrear uma requisição até o processamento do pedido e identificar cache
hit, cache miss, retries, duração e falhas.

**Why this priority**: O comportamento assíncrono e o cache precisam ser diagnosticáveis durante
a demonstração e os testes.

**Independent Test**: Executar uma listagem e um checkout completos e correlacionar os registros
e métricas por requisição, processamento e pedido.

**Acceptance Scenarios**:

1. **Given** uma requisição HTTP, **When** ela é processada, **Then** os registros estruturados do
   fluxo contêm `requestId` e a resposta permite identificar esse mesmo valor.
2. **Given** processamento assíncrono associado a um pedido, **When** uma tentativa ocorre,
   **Then** os registros contêm `correlationId` e `orderId`.
3. **Given** operações de catálogo e processamento, **When** elas terminam, **Then** métricas
   distinguem sucesso, falha, duração, cache hit/miss, fallback, modo degradado e retries conforme
   aplicável.

### Edge Cases

- Duas compras concorrentes tentam consumir a última unidade do mesmo produto.
- Um checkout contém o mesmo produto mais de uma vez, quantidade zero, negativa ou fracionária.
- Um produto deixa de existir entre a listagem e o checkout.
- O cache expira enquanto várias listagens chegam simultaneamente.
- A fonte local do catálogo falha quando não existe entrada de cache válida.
- O Redis falha durante leitura, renovação ou invalidação da entrada do catálogo.
- O Redis se recupera contendo uma entrada criada antes de uma alteração de disponibilidade.
- Redis e banco local estão indisponíveis ao mesmo tempo.
- A resposta do primeiro checkout se perde depois de o pedido ser persistido.
- O mesmo payload chega com propriedades JSON ou itens em ordens diferentes.
- A mesma chave de idempotência chega simultaneamente com payloads diferentes.
- O evento assíncrono é entregue novamente após o pedido já estar em estado terminal.
- A reserva expira antes que um pedido preso em processamento seja concluído.
- O ERP simulado demora mais que o limite de uma tentativa, falha temporariamente ou retorna falha
  definitiva.
- O pedido é consultado durante cada transição, inclusive entre `processing` e `retrying`.

## Scope Boundaries *(mandatory)*

### In Scope

- Listagem de produtos com preço, moeda e disponibilidade.
- Cache Redis da listagem com expiração, invalidação, hit/miss, renovação e fallback previsíveis.
- Checkout assíncrono com múltiplos itens e resposta imediata `202 Accepted`.
- Idempotência por chave, detecção de payload conflitante e deduplicação concorrente.
- Reserva de estoque com expiração e proteção contra overselling.
- Agendamento confiável, processamento em segundo plano e retries limitados.
- ERP simulado com sucesso, falha temporária, timeout e falha definitiva.
- Consulta do status do pedido.
- OpenAPI, erros previsíveis, logs estruturados e métricas básicas.

### Out of Scope

- Autenticação, autorização e gestão de usuários.
- Pagamento, cobrança, estorno ou conciliação.
- Front-end ou aplicativo móvel.
- Integração real com ERP e sincronização entre ERP e banco local.
- Deploy em nuvem ou infraestrutura de produção.
- Carrinho persistente, promoções, frete, impostos e múltiplos centros de estoque.

### Simplifications and Limitations

- O banco local é a fonte de produto e estoque para o case; ele não é uma réplica sincronizada do
  ERP.
- O ERP simulado apenas recebe pedidos e devolve resultados configuráveis; ele não mantém um
  catálogo sincronizado nem publica atualizações de estoque.
- Há um único estoque lógico e uma única moeda configurada para todos os produtos.
- Os limites de tempo e retenção usam defaults explícitos nesta especificação e podem ser
  configurados sem alterar as regras observáveis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE disponibilizar `GET /products` para retornar todos os produtos com
  `id`, `name`, `price`, `currency` e `availableQuantity`.
- **FR-002**: O sistema DEVE retornar `204 No Content` sem corpo de resposta quando não houver
  produtos.
- **FR-003**: O sistema DEVE reutilizar uma entrada válida do cache para listagens subsequentes e
  recarregar a fonte local após a expiração.
- **FR-004**: O sistema NÃO DEVE servir uma entrada de cache após seu prazo de validade.
- **FR-005**: O sistema DEVE disponibilizar `POST /checkout` para receber uma chave de
  idempotência e uma lista não vazia de itens com `productId` e quantidade inteira positiva.
- **FR-006**: O sistema DEVE aceitar um checkout válido somente quando todos os itens existirem e
  houver estoque suficiente para a operação completa.
- **FR-007**: O sistema DEVE responder a um checkout aceito com `202 Accepted`, `orderId` e o
  status inicial `pending`, sem aguardar a resposta do ERP simulado.
- **FR-008**: O sistema DEVE processar pedidos aceitos em segundo plano e preservar o trabalho
  pendente mesmo se o processo HTTP terminar após a resposta.
- **FR-009**: O sistema DEVE oferecer modo probabilístico com 80% de `confirmed`, 10% de
  `temporarily_unavailable`, 5% de `unavailable` e 5% de `timeout` em cada tentativa, além de modo
  forçado para validar deterministicamente todos os resultados possíveis.
- **FR-010**: O sistema DEVE disponibilizar `GET /orders/{orderId}/status` para retornar o
  identificador, status atual, data da última atualização e erro final quando aplicável.
- **FR-011**: O sistema DEVE manter os estados `pending`, `processing`, `retrying`, `confirmed` e
  `failed` conforme as transições permitidas nas regras de negócio.
- **FR-012**: O sistema DEVE liberar reservas relacionadas a pedidos que terminem em `failed` ou
  expirem antes de conclusão válida.
- **FR-013**: O sistema DEVE canonicalizar o payload válido antes de comparar a idempotência para
  que diferenças apenas de ordenação não sejam tratadas como conteúdo diferente.
- **FR-014**: O sistema DEVE reduzir o estoque disponível e criar a reserva antes de responder
  `202 Accepted`; a confirmação posterior NÃO DEVE realizar uma segunda redução.
- **FR-015**: O sistema DEVE classificar cada tentativa do ERP simulado como `confirmed`,
  `temporarily_unavailable`, `unavailable` ou `timeout`; ausência de conclusão em até 60 segundos
  DEVE produzir `timeout`.
- **FR-016**: O sistema DEVE tratar o Redis como acelerador não autoritativo e usar o banco local
  como fonte do catálogo quando uma leitura, gravação ou invalidação no Redis falhar.
- **FR-017**: A indisponibilidade isolada do Redis NÃO DEVE impedir a listagem de produtos nem
  fazer um checkout válido falhar.
- **FR-018**: Enquanto o Redis estiver degradado, o sistema DEVE ignorá-lo nas listagens; antes de
  reabilitar seu uso, DEVE invalidar a entrada anterior ou recarregá-la do banco local.

### Business Rules

- **BR-001**: Uma entrada de catálogo permanece válida por 60 segundos contados do carregamento;
  após esse prazo, a próxima leitura DEVE renovar a entrada antes de responder.
- **BR-002**: Um checkout DEVE rejeitar lista vazia, produto repetido, produto inexistente e
  quantidade zero, negativa, fracionária ou não numérica sem produzir efeitos parciais.
- **BR-003**: Uma chave de idempotência permanece associada ao resultado por 24 horas após a
  primeira aceitação.
- **BR-004**: A mesma chave com payloads canônicos iguais DEVE retornar o mesmo `orderId` e o
  status atual sem criar pedido, reserva, tentativa ou trabalho assíncrono adicional.
- **BR-005**: A mesma chave com payload canônico diferente DEVE retornar conflito sem alterar
  pedido, reserva ou estoque.
- **BR-006**: Para cada item, a redução DEVE ocorrer somente quando a quantidade disponível for
  maior ou igual à solicitada. Todas as reduções do checkout DEVEM pertencer à mesma transação:
  todas são confirmadas ou nenhuma é aplicada, e a quantidade disponível NUNCA PODE ficar
  negativa.
- **BR-007**: Toda aceitação DEVE reduzir imediatamente a disponibilidade e criar uma reserva
  vinculada ao pedido com expiração de 5 minutos. Confirmação consome a reserva sem reduzir o
  estoque novamente; falha definitiva ou expiração restitui a quantidade uma única vez.
- **BR-008**: O registro de idempotência, o pedido, a reserva e o registro que agenda o
  processamento assíncrono DEVEM ser persistidos como uma única decisão: todos existem ou nenhum
  existe.
- **BR-009**: As transições permitidas são `pending -> processing|failed`,
  `processing -> confirmed|retrying|failed` e `retrying -> processing|failed`. `pending` ou
  `retrying` mudam para `processing` antes de cada tentativa; `confirmed` e `failed` são terminais
  e NÃO PODEM transicionar.
- **BR-010**: Cada pedido PODE realizar no máximo três tentativas totais de envio ao ERP simulado.
- **BR-011**: `temporarily_unavailable` e `timeout` DEVEM consumir uma tentativa e mudar o pedido
  para `retrying` quando houver tentativa restante; sem tentativa restante, DEVEM mudar para
  `failed`. `unavailable` DEVE mudar imediatamente para `failed` sem retry.
- **BR-012**: Entrega duplicada de trabalho assíncrono NÃO PODE duplicar tentativa já concluída,
  transição terminal, liberação de reserva ou efeito final no ERP simulado.
- **BR-013**: Se a reserva expirar antes da confirmação, o pedido DEVE terminar como `failed` com
  motivo `RESERVATION_EXPIRED`, o estoque DEVE ser liberado uma única vez e qualquer resultado
  tardio do ERP simulado NÃO PODE confirmar o pedido.
- **BR-014**: Toda criação, consumo, liberação ou expiração de reserva que altere a disponibilidade
  DEVE invalidar a entrada de cache do catálogo antes da próxima listagem.
- **BR-015**: A canonicalização DEVE ordenar recursivamente as propriedades dos objetos e ordenar
  `items` por `productId`, preservando todos os valores aceitos pelo contrato. Espaçamento,
  formatação e ordem NÃO PODEM alterar o resultado; campos fora do contrato DEVEM ser rejeitados.
- **BR-016**: A reivindicação da chave de idempotência DEVE ser atômica. Entre requests válidos e
  simultâneos, somente um PODE criar os efeitos: os demais DEVEM retornar o mesmo pedido quando o
  payload canônico for igual ou `409 Conflict` quando for diferente.
- **BR-017**: Entre checkouts concorrentes com chaves diferentes, cada operação DEVE observar o
  estoque já comprometido pelas transações concluídas. Uma operação que não conseguir aplicar
  todas as reduções condicionais DEVE reverter integralmente e retornar
  `409 INSUFFICIENT_STOCK`.
- **BR-018**: No modo probabilístico, cada tentativa DEVE realizar uma seleção independente com
  80% de probabilidade de `confirmed`, 10% de `temporarily_unavailable`, 5% de `unavailable` e 5%
  de `timeout`.
- **BR-019**: Uma tentativa DEVE terminar como `timeout` quando não concluir em até 60 segundos.
  Qualquer resposta recebida depois desse limite NÃO PODE alterar o pedido nem contar como nova
  tentativa.
- **BR-020**: Falha ao invalidar o Redis após uma alteração de disponibilidade NÃO DEVE reverter
  a transação de checkout, consumo, restituição ou expiração; ela DEVE colocar o cache em modo
  degradado para que listagens posteriores consultem o banco local.
- **BR-021**: A recuperação do Redis somente PODE encerrar o modo degradado depois que a entrada
  potencialmente obsoleta tiver sido removida ou substituída por dados atuais do banco local.

### Contract and Error Requirements *(include for HTTP or asynchronous interfaces)*

- **CR-001**: `GET /products` DEVE documentar `200 OK` com a lista quando houver produtos,
  `204 No Content` sem corpo quando o catálogo estiver vazio e `503 CATALOG_UNAVAILABLE` quando a
  fonte local não puder ser consultada e não existir cache válido acessível. A indisponibilidade
  isolada do Redis NÃO DEVE produzir `503` quando o banco local estiver disponível.
- **CR-002**: `POST /checkout` DEVE exigir `Idempotency-Key` e documentar resposta `202` com
  `orderId` e `status`.
- **CR-003**: `POST /checkout` DEVE documentar `400 INVALID_REQUEST`, `404 PRODUCT_NOT_FOUND`,
  `409 INSUFFICIENT_STOCK` e `409 IDEMPOTENCY_CONFLICT`.
- **CR-004**: `GET /orders/{orderId}/status` DEVE documentar resposta `200` e
  `404 ORDER_NOT_FOUND`.
- **CR-005**: Todo erro HTTP DEVE usar o mesmo schema com `code`, `message`, `requestId` e
  `details` opcional, sem expor detalhes internos.
- **CR-006**: Toda resposta HTTP DEVE expor o `requestId` em header documentado.
- **CR-007**: O documento OpenAPI DEVE cobrir todos os endpoints, parâmetros, headers, schemas de
  sucesso, schemas de erro, exemplos e códigos HTTP definidos nesta especificação.

### Observability Requirements *(include when runtime behavior is involved)*

- **OR-001**: Todo log do fluxo HTTP DEVE ser estruturado e conter `requestId`.
- **OR-002**: Todo log de processamento assíncrono DEVE conter `correlationId` e `orderId`; quando
  originado por checkout, o vínculo com o `requestId` inicial DEVE ser preservado.
- **OR-003**: Mudanças de status e tentativas de ERP DEVEM registrar resultado, duração, número da
  tentativa e classificação de falha sem registrar dados sensíveis.
- **OR-004**: O catálogo DEVE expor contadores de cache hit, cache miss, falha de leitura,
  gravação e invalidação, fallback para o banco, entrada e saída do modo degradado e falha de
  carregamento, além da duração da listagem.
- **OR-005**: O processamento assíncrono DEVE expor contadores de sucesso, falha e retry, além da
  duração de cada tentativa.
- **OR-006**: Cada checkout DEVE registrar o resultado de idempotência como criação, replay ou
  conflito, correlacionado por `requestId` e `orderId` quando existir, sem registrar o payload.
- **OR-007**: Cada tentativa de reserva DEVE registrar sucesso ou estoque insuficiente; restituições
  por falha ou expiração DEVEM ser contabilizadas sem duplicidade.
- **OR-008**: Cada tentativa de ERP DEVE registrar um único resultado entre `confirmed`,
  `temporarily_unavailable`, `unavailable` e `timeout`; métricas DEVEM separar os quatro resultados
  e a quantidade de retries.

### Key Entities *(include if feature involves data)*

- **Product**: Item vendável com identificador, nome, preço, moeda e quantidade disponível.
- **Order**: Solicitação aceita com identificador, itens, status, datas, tentativa atual e erro
  final opcional.
- **Order Item**: Produto, quantidade e preço unitário capturado para um pedido.
- **Stock Reservation**: Quantidade já subtraída da disponibilidade por produto e pedido, com
  validade e estado de consumo ou restituição.
- **Idempotency Record**: Chave única durante a janela de retenção, representação canônica do
  payload, pedido associado e prazo de expiração.
- **Processing Work**: Registro durável que representa o envio pendente do pedido ao ERP
  simulado e permite deduplicação.
- **Processing Attempt**: Número, correlação, início, limite de 60 segundos, término e resultado
  `confirmed`, `temporarily_unavailable`, `unavailable` ou `timeout` de cada tentativa.
- **Catalog Cache Entry**: Catálogo armazenado no Redis com instante de carregamento e expiração;
  não é fonte autoritativa e pode ser ignorado durante o modo degradado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das listagens com produtos retornam todos os campos definidos e 100% das
  listagens sem produtos retornam `204 No Content` sem corpo de resposta.
- **SC-002**: Em validação local controlada, o carregamento do catalogo a partir do banco local
  aplica um atraso artificial configurável de 500ms para imitar latência de produção; uma listagem
  atendida por cache Redis valido nao aplica esse atraso, tem duração pelo menos 50% menor que a
  carga local simulada, e nenhuma entrada expirada e servida.
- **SC-011**: Em 100% dos cenários de indisponibilidade isolada do Redis com banco local
  disponível, a listagem retorna o resultado atual do banco e checkouts válidos permanecem
  disponíveis; após a recuperação, nenhuma entrada anterior à mudança de disponibilidade é
  servida.
- **SC-003**: Pelo menos 95% dos checkouts válidos recebem confirmação de recebimento em até um
  segundo no ambiente local de aceite, sem aguardar o ERP simulado.
- **SC-004**: Em 100% das repetições e disputas simultâneas testadas, chave e payloads
  semanticamente iguais, inclusive com ordenações diferentes, convergem para o mesmo pedido;
  chave igual e payload diferente não cria efeito adicional e retorna conflito.
- **SC-005**: Em todos os testes concorrentes, o estoque nunca fica negativo, a soma aceita por
  produto nunca supera a disponibilidade inicial, a confirmação não reduz novamente e cada falha
  ou expiração restitui exatamente a quantidade reservada uma única vez.
- **SC-006**: Para cada resultado forçado do ERP, 100% dos pedidos seguem a transição definida e
  alcançam o estado terminal esperado dentro de três tentativas, sem efeitos finais duplicados;
  todo processamento sem conclusão em 60 segundos é classificado como `timeout`.
- **SC-010**: Em uma amostra local reduzida de pelo menos 1.000 tentativas probabilísticas com RNG
  seeded, cada taxa observada fica a ate 4 pontos percentuais da distribuição configurada de
  80%/10%/5%/5%.
- **SC-007**: 100% dos pedidos observados podem ser rastreados do checkout às tentativas de
  processamento usando os identificadores documentados.
- **SC-008**: As métricas distinguem corretamente cache hit/miss, falhas do Redis, fallback,
  entrada e saída do modo degradado, sucesso, falha e retry em 100% dos cenários de aceite
  instrumentados.
- **SC-009**: A validação de contrato confirma cobertura OpenAPI para 100% dos endpoints,
  respostas de sucesso, respostas de erro e códigos HTTP desta especificação.

## Assumptions

- O case usa um único estoque lógico e uma única moeda configurada.
- O TTL padrão do catálogo é 60 segundos.
- A validação local de performance do cache usa atraso artificial configurável de 500ms apenas no
  caminho de carregamento do banco local; esse atraso nao existe no caminho de hit Redis e nao
  representa uma regra de negocio.
- O Redis é um cache não autoritativo; o banco local permanece como fonte do catálogo e estoque.
- A janela padrão de idempotência é 24 horas.
- A reserva de estoque expira após 5 minutos se não houver conclusão válida.
- O processamento permite no máximo três tentativas totais por pedido.
- O simulador usa, por tentativa, 80% de chance de confirmação, 10% de indisponibilidade
  temporária, 5% de indisponibilidade total e 5% de timeout; qualquer resultado pode ser forçado
  em testes determinísticos.
- O teste estatístico do ERP usa 1.000 tentativas com RNG seeded e tolerância de 4 pontos
  percentuais para preservar velocidade no ambiente local.
- O banco local é a fonte de catálogo e estoque; não há sincronização de entrada ou saída com o
  ERP.
- Autenticação, pagamento, front-end, ERP real e deploy em nuvem permanecem fora do escopo.
