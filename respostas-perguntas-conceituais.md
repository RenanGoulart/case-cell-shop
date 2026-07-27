# Case Técnico - Perguntas Conceituais
### Pergunta 1 — Diagnóstico, trade-offs e arquitetura alvo

01 - Performance da vitrine 
A vitrine consulta o ERP a cada acesso e fica lenta. O negócio precisa reduzir latência sem perder controle sobre preço e disponibilidade.

Causa raiz
- A causa raiz pode ser ocasionada por diferentes motivos, alguns deles são limite de conexões do ERP, consultas não otimizadas, capacidade insuficiente de infraestrutura, tudo isso com o alto volume de requisições ao ERP, faz com que aconteça uma degradação do sistema e por consequência lentidão ao consultar a vitrine.
Impacto para o cliente
- Ao experenciar lentidão na consulta da vitrine, o cliente pode tentar atualizar a página disparando mais consultas, ou pode simplesmente desistir da consulta devido a demora.
Impacto para o negócio
- Para o negócio, é possível que vendas não sejam realizadas por desistência do cliente, ocasionando uma redução na taxa de conversão e perda de receita.
Impacto para a operação
- Para a operação, serão abertos chamados/tickets de reclamação referente a lentidão/erro, será necessário investigação do problema pelo time de sustentação/operações que provavelmente será dificultada pela falta de rastreabilidade no fluxo.
Caminho 1
- A API REST da loja utilizará um banco em memória (Redis), quando houver cache miss a consulta será feita no ERP e posteriormente registrada no banco em memória, se houver indisponibilidade do banco local o fallback será a consulta AS-IS para o ERP. É uma implementação mais rápida, com menor custo inicial e redução de chamadas diretas ao ERP, porém terá que ser desenvolvida uma solução para cache stampede. Existirá um "cold start", uma vez que a primeira requisição precisará ser feita ao ERP.
Caminho 2
- A API REST da loja utilizará de um branco local (PostgreSQL) que precisará ser sincronizado com o ERP através um de um worker que realiza a sincronização completa da vitrine a cada x tempo, ainda existirá o banco em memória (Redis) que agora será utilizado como cache do branco local. Essa implementação aumenta a complexidade, custo e exige sincronização com banco de dados do ERP, porém possibilita filtros e otimizações a nível de banco, reduz a carga de leitura sobre o ERP e consequentemente não depende diretamente da latência do mesmo.

Para já observar uma melhoria poderíamos seguir com o caminho 1, pois tem custo e complexidade baixa, consistência forte e esforço médio, porém tem uma latência inicial alta. Posteriormente podemos seguir com o caminho 2, aumentando custo, esforço e complexidade, mas possuindo maior robustez, menor latência e mais estabilidade na jornada.

---

02 - Consistência de estoque 
Clientes compram o mesmo item sem estoque. A solução precisa reduzir o risco de overselling no checkout.

Causa raiz
- A causa de clientes comprarem o mesmo item, mesmo que não haja estoque do produto se dá quando há múltiplas consultas para disponibilidade de um produto especifico, ambas consultas enxergam que há quantidade suficiente em estoque, com isso a operação prossegue atualizando o estoque simultaneamente, ocasionando overselling no checkout.
Impacto para o cliente
- Possivelmente a compra do cliente será cancelada em algum momento, causando grande frustração ao cliente que seguiu a jornada até o fim sem nenhum feedback. 
Impacto para o negócio
- O problema reduz a confiança do cliente na loja, aumenta número de cancelamentos, há perda de receita e impacto negativo na reputação do sistema.
Impacto para a operação
- Para operação serão aberto chamados/tickets de reclamação, será necessário investigação do problema pelo time de sustentação/operações e possivelmente será necessário ações manuais como cancelamento, estorno do pedido e ajuste do estoque. 
Caminho 1
- Ao iniciar o checkout será utilizado um atomic update para atualizar o estoque do produto no banco de dados local apenas quando houver quantidade suficiente, quando não houver disponibilidade, será retornado um erro tratado, essa operação já impede de haver overselling do lado da loja virtual. Tem complexidade e custo baixo, porém se o ERP recusar a transação será necessário uma compensação para devolver o produto ao estoque.
Caminho 2
- Ao iniciar o checkout será utilizado a criação de reserva em conjunto com o atomic update, assim a reserva reduzirá a disponibilidade para outras compras, porém a redução de estoque só será confirmada após confirmação do pedido pelo ERP, essa operação aumenta a complexidade e o custo, pois irá exigir a persistência da reserva e a limpeza da mesma após expiração ou fim da operação, porém aumenta a robustez da jornada e já abrange a devolução ao estoque em casos de cancelamentos, desistências, etc.

Seguiria com caminho 1 por ter uma implementação simples, custo baixo, latência baixa, consistência forte e um esforço baixo. Posteriormente como evolução natural implementaria o caminho 2 que adicionaria em custo, complexidade e esforço, mas prepara o sistema para escalar de forma mais robusta. 

---

03 - Resiliência do checkout 
A API do ERP demora para faturar o pedido. A jornada precisa tolerar timeout, retry e processamento assíncrono com rastreabilidade suficiente.

Causa raiz
- O checkout depende de uma chamada síncrona ao ERP e o mesmo pode apresentar lentidão ou indisponibilidade, a ausência de timeout e processamento assíncrono pode manter requisições/conexões abertas contribuindo com a degradação do ERP.
Impacto para o cliente
- Para o cliente pode haver uma demora maior do que a esperada motivando retentivas (criação de pedidos duplicados), desistência/cancelamento da compra e uma má experiência.
Impacto para o negócio
- Para o negócio, é possível que vendas sejam duplicadas ou não sejam realizadas por desistência do cliente, ocasionando uma redução na taxa de conversão e perda de receita.
Impacto para a operação
- Para a operação, serão abertos chamados/tickets de reclamação referente a lentidão/erro, será necessário investigação do problema pelo time de sustentação/operações que provavelmente será dificultada pela falta de rastreabilidade no fluxo.
Caminho 1
- A API REST da loja pode registrar o pedido no banco local, responder para o cliente que o pedido foi recebido (o pedido deve conter uma chave de idempotência para evitar processamentos duplicados) e publicar uma mensagem em uma fila (RabbitMQ) que será processada por um worker que consumirá as mensagens da fila e chamar o ERP para prosseguir com o faturamento, com um timeout tratado, em casos de erro será configurado retry (com exponential backoff) e se o erro persistir a mensagem é enviada para uma DLQ. Em cada pedido deve ser registrado em log o id do pedido, id de correlação, status atual, quantidade de tentativas, horário da última tentativa, erro retornado pelo ERP, horário da próxima tentativa, status final.
Caminho 2
- O caminho 2 segue a implementação do caminho 1 utilizando a fila e o worker com a adição do outbox pattern, o pedido e a mensagem serão registrados no banco evitando uma possível indisponibilidade na publicação da mensagem, a implementação aumenta o custo, complexidade e esforço, mas garante maior confiabilidade que as mensagens serão processadas.

O caminho natural é seguir com o caminho 1 por ter um custo e complexidade menor, porém é preciso salientar que pode haver erros na publicação das mensagens, esse erro pode ser mitigado com um job que procura por pedidos não processados e publique na fila, mas como evolução no caminho 2 é adotado o outbox pattern que aumenta o custo, complexidade e esforço, porém garante confiabilidade.

Visão arquitetural
![[Pasted image 20260723192038.png]]

---
### Pergunta 2 — Cache, invalidação e performance da vitrine

- O cache da vitrine seguirá com cache-aside implementado com o armazenamento em memória Redis, em caso de cache miss, a API consulta no banco de dados local (PostgreSQL) que funciona como um read model dos produtos sincronizados a partir do ERP (fonte da verdade).
- O TTL será um tempo curto e configurável, sendo validado a partir das métricas de acesso, ocorrerá invalidação do cache assim que o worker de sincronização que busca o estoque no ERP atualizar o banco local. Ao evoluir a aplicação podemos adicionar um TTL menor para preço e disponibilidade e maior para descrições e metadados de imagem do produto.
- Para evitar cache stampede, será utilizado um lock no Redis com TTL curto, impedindo consultas massivas no banco local, permitindo a reconstrução do cache enquanto as outras requisições aguardam por um curto período de tempo e tentam novamente. 
- Uma vez que haja indisponibilidade no Redis o valor é resgatado diretamente do banco local. Caso haja indisponibilidade no Redis e no banco local, então é retornado um erro controlado para não redirecionar toda carga para o ERP. Ao evoluir a aplicação seria possível aplicar redundância nas bases de forma que ao menos uma estivesse ativa para maior garantia de retorno da vitrine.
- Para evitar dados antigos, uma boa solução seria registrar o timestamp da última sincronização e quando o dado foi cacheado, podendo definir um limite máximo e forçar invalidação caso ultrapasse o limite.
- Referente às métricas, para validar performance/custo é interessante guardar a taxa de cache hit (sucesso no retorno de cache em relação a taxa de cache miss), a duração da requisição da vitrine, a duração da query para buscar os produtos no banco local. Para validar a confiabilidade do dado, a idade do cache, a idade da sincronização, quando a última sincronização aconteceu com sucesso, a quantidade de falhas de sincronização, a quantidade de divergências de preço/disponibilidade de estoque dos produtos entre o banco local/cache e o ERP.

---
### Pergunta 3 — Observabilidade, Datadog ou equivalente

- Será instrumentado logs em diferentes momentos dos fluxos de listagem da vitrine e de checkout, para o GET /products serão implementados logs estruturados no início e fim da requisição, cache hit/miss, consulta ao banco local, falha no cache e erro ao carregar produtos. Para o POST /checkout serão instrumentados logs de validação, idempotência, reserva de estoque, criação de pedido, publicação na fila e retorno ao cliente. Também existirão logs de recebimento da mensagem, tentativas de processamento de pedido, chamada ao ERP, retries e mudanças de status do pedido.
- Os campos obrigatórios para os 2 fluxos seriam: `timestamp`, `level` (refere-se ao tipo de log), `event/action` (ação realizada), `service` (qual componente ocorreu), `requestId`, `correlationId`, `duration` (em milissegundos), `status` e por fim `message` (quando houver mensagem de erro ou descrição relevante). Nos logs do checkout será resgatado o `orderId`, `productId`, `idempotencyKey`, `attempt`, `errorCode`, `erpStatusCode`.
- Sobre as métricas:
	- **Cache**
		- Counters: total de cache hits, total de cache miss, total de erros de cache, total de resposta obsoletas
		- Histograms: duração da requisição da vitrine, duração da operação de preenchimento do cache
		- Gauges: idade do cache da vitrine, idade da última sincronização de sucesso
	- **Checkout**
		- Counters: total de checkouts iniciados, aceitos, rejeitados, falhos e total de falhas e sucessos de reserva
		- Histograms: duração da requisição de checkout, duração do processo de reserva
		- Gauges: quantidade de pedidos pendentes, em processamento e falhos
	- **Fila/Worker**
		- Counters: total de mensagens publicadas, total de mensagens processadas, total de retries do worker, total de mensagens na DLQ, total de falhas de processamento do worker
		- Histograms: tempo de espera na fila, tempo de processamento do worker
		- Gauges: quantidade de mensagens aguardando processamento na fila, idade da mensagem mais antiga aguardando na fila
	- **ERP**
		- Counters: total de requests, sucessos, erros e timeouts para o ERP
		- Histogram: duração da requisição para o ERP
- Para vitrine seria criado um trace que seguiria o fluxo:
	- GET /products -> get no cache -> get no banco local (se ocorrer cache miss) -> set no cache (no caso de cache miss)
- Para o checkout seria criado o seguinte trace:
	- POST /checkout -> valida contrato -> verifica e registra chave de idempotência -> reserva de estoque -> criação de ordem -> publicação da mensagem | worker consome mensagem -> processa pedido -> atualiza status do pedido
- Referente aos SLIs/SLOs iniciais que seriam criados:
	- **Vitrine**
		- Taxa de sucesso do GET /products | 99% das requisições sem erro
		- Latência p95 do GET /products | 95% das requisições em até 300ms (ajustado conforme quantidade de produtos e comportamento real da aplicação)
		- Taxa de respostas com dados dentro do limite de idade definido | 99% das respostas
		- Alertas: taxa de erro do GET /products acima de 5% por 5 minutos, p95 acima de 500ms por 10 minutos (ajustar conforme limite aceitável), falhas de sincronização contínuas, taxa de cache hit abaixo de 90%
	- **Checkout**
		- Taxa de checkout aceitos, tempo até criação e conclusão | 99% das requisições para POST /checkout respondem sem erro
		- Taxa de pedidos que chegam ao estado final | 98% dos pedidos chegam ao estado final em até 5min.
		- Taxa de rejeição por falta de estoque
		- Alertas: Mensagem mais antiga acima de 2min, aumento de pedidos presos com status pendente ou em processamento, alta quantidade de mensagens na DLQ
- Sobre os dashboards:
	- Dashboard que contempla a saúde geral da API, requisições por segundo, taxa de erro e latência
	- Dashboard que contempla fluxo de vitrine/cache, latência do endpoint, idade dos dados, falhas de sincronização, taxa de cache hit/miss
	- Dashboard que contempla fluxo de checkout/estoque e fila/worker, quantidade de checkouts, quantidade de pedidos separados por status, falhas na reserva, rejeições por falta de estoque, tamanho da fila, idade da mensagem mais antiga, tempo de processamento do worker, quantidade de retries, e a quantidade de mensagens na DLQ
---
### Pergunta 4 — Concorrência, estoque e idempotência

- Uma checagem simples de estoque é insuficiente, pois pode ocorrer uma race condition, quando duas ou mais requisições lerem o mesmo valor antes de uma atualização, ao tentarem atualizar o valor irá ocorrer o problema de overselling.
- Atomic Update: A checagem e atualização do valor acontecem na mesma query, após isso é retornado quantas linhas foram atualizadas, se houver linhas afetadas significa que a operação ocorreu com sucesso, se não houver linhas afetadas o estoque é insuficiente. Foi a solução escolhida levando em consideração a baixa complexidade e escopo do projeto.
- Lock Pessimista: Ocorre dentro de uma transação no banco de dados onde haverá a checagem do produto e posteriormente a atualização, enquanto isso ocorre outras transações não conseguem alterar a linha em questão até o fim da transação. É um pouco mais complexo que o Atomic Update, não foi escolhido, pois pode aumentar a incidência de deadlocks (operações presas).
- Reserva de Estoque: A reserva não elimina a utilização dos outros métodos, ainda é necessário haver Atomic Update ou Lock para prevenir o overselling. É um mecanismo que adiciona robustez ao processo, uma vez que o estoque não é simplesmente subtraído, mas reservado até a conclusão do checkout, seja liberando a reserva em caso de falha ou consumida caso a compra seja efetuada, há também a expiração da reserva para que produtos não fiquem presos indevidamente.
- Distributed Lock: É um lock distribuído que impede que múltiplas instancias processem o mesmo recurso simultaneamente, no contexto de checkout/estoque não é utilizado, mas no contexto de cache da vitrine é utilizado para evitar consulta massiva ao banco local após o TTL (cache stampede). 
- Uma chave de idempotência seria gerada pelo cliente, a API deveria gerar um request hash com o payload do pedido e seria registrado no banco local. Ao receber a mesma chave e mesmo payload (comparado através de request hash) devolve pedido já criado, ao receber mesma chave e payload diferente retorna conflito, se houver a incidência da mesma chave, não é criado novo pedido/reserva. Do lado do worker/fila o reprocessamento pode ser controlado através de status, se estiver `failed` ou `confirmed` não processa novamente, se estiver `pending` ou `retrying` processa. Importante salientar que pode haver outras travas, no front-end por exemplo, redirecionamento, bloqueio do botão de checkout e no back-end pode existir um rate-limit em um API gateway ou reverse proxy para impedir múltiplas requisições do mesmo usuário em um curto período de tempo.
- Para o teste a nível de reserva seria utilizada função que dispara requisições de forma concorrente/paralela, utilizando um banco local real. Para teste de parte assíncrona é possível utilizar código que simula processamento do ERP.
---
### Pergunta 5 — Mensageria, resiliência, contrato e IA

- Publicaria mensagem na fila após gravação do pedido, para evitar inconsistência o pedido seria gravado, e em conjunto um evento também seria gravado em uma tabela outbox que seria lida por um job que publicaria as mensagens na fila. Os possíveis status do pedido seriam `pending`, `processing`, `retrying`, `confirmed` e `failed`.
- A estratégia de retry é o exponential backoff, aumentando o tempo a cada retentativa, e verificando o status a cada processamento para evitar processamento indevido.
- Referente ao OpenAPI:
 **POST /checkout**
Headers:
`Idempotency-Key: uuid`

Body:
```JSON
{
  "items": [
    {
      "productId": "uuid",
      "quantity": 1
    }
  ]
}
```

Response:
```JSON
{
  "orderId": "uuid",
  "status": "pending"
}

// Status code: 202 Accepted
// Erros:
// 400 dados inválidos
// 404 produto não encontrado
// 409 estoque insuficiente/conflito de idempotência
// 500 erro interno
```

**GET /orders/{orderId}/status**
Response:
```JSON
{
  "orderId": "uuid",
  "status": "processing",
  "attemptCount": 3,
  "lastError": null,
  "updatedAt": "..."
}
```

- Os testes mais relevantes são:
	- Criar pedido deve retornar status 202
	- Mesma chave de idempotência deve retornar o mesmo pedido
	- Job publica mensagem pendente da outbox
	- Mensagem duplicada não processa pedido novamente
	- Após exceder tentativas, pedido vai para status `failed`
	- Pedido com status `confirmed` não é processado novamente
	- GET /orders/{orderId}/status retorna o status atual
