# Phase 0 Research: Catálogo e Checkout Assíncrono

Todas as decisões técnicas foram resolvidas. Não há `NEEDS CLARIFICATION` pendente.

## 1. Runtime e versões

**Decision**: Node.js 24 LTS, TypeScript 6.0 em ESM estrito, Fastify 5, Prisma ORM 7,
PostgreSQL 18, Redis 8, RabbitMQ 4.2, Vitest 4, Pino 10 e `prom-client` 15. Fixar versões exatas no
`package-lock.json` e imagens por tag de patch ou digest na implementação.

**Rationale**: Node 24 é LTS e satisfaz os requisitos atuais do Prisma e Vitest. TypeScript 6 é a
linha JavaScript madura e amplamente compatível; TypeScript 7 é recente e ainda não oferece API
programática estável para todo o ecossistema. Fastify 5 e os majors escolhidos de Swagger são
compatíveis entre si. Prisma 7 é a linha de produção atual e usa `@prisma/adapter-pg`.

**Alternatives considered**:

- Node 26 Current: rejeitado porque aplicações devem preferir LTS.
- TypeScript 7: rejeitado neste case para reduzir risco de compatibilidade de tooling recém-lançado.
- Prisma 6: funcional, mas manteria uma linha anterior sem benefício para um projeto novo.

**Sources**: [Node releases](https://nodejs.org/en/about/previous-releases),
[TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
[Prisma requirements](https://www.prisma.io/docs/orm/reference/system-requirements),
[Prisma 7 upgrade](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7),
[Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/).

## 2. Organização modular e processos

**Decision**: um pacote, uma imagem e dois entrypoints compilados: API e worker. Módulos de
catálogo e pedidos contêm domínio, casos de uso e ports; adapters implementam PostgreSQL, Redis,
RabbitMQ e ERP. Builders não abrem sockets nem conexões ao serem importados.

**Rationale**: processos separados isolam o ciclo HTTP do processamento assíncrono sem criar
microsserviços, workspaces, contratos internos duplicados ou deploys independentes. A mesma base
compartilha regras, schemas de mensagens, configuração e observabilidade.

**Alternatives considered**:

- API e worker no mesmo processo: rejeitado pela decisão explícita de execução separada.
- Dois pacotes/repos: rejeitados por complexidade sem requisito.
- Framework adicional de jobs: rejeitado; outbox, RabbitMQ e loops pequenos são suficientes.

## 3. Fastify, schemas e OpenAPI

**Decision**: JSON Schemas literais registrados no Fastify são a fonte de validação, serialização
e geração dinâmica de OpenAPI 3.0.3. Registrar `@fastify/swagger` antes das rotas, usar `$id`/`$ref`,
declarar headers, params, body e cada resposta, e traduzir validações para o envelope comum de erro.

**Rationale**: uma única fonte reduz divergência entre runtime e documentação. Schemas de resposta
impedem exposição de campos internos e permitem testes estruturais do documento gerado.

**Alternatives considered**:

- OpenAPI estático como fonte independente: rejeitado pelo risco de drift.
- Zod/TypeBox: não necessários para o case; adicionariam dependência e conversão.
- Decorators: rejeitados porque JSON Schema já atende Fastify e OpenAPI.

**Sources**: [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/),
[`@fastify/swagger`](https://github.com/fastify/fastify-swagger),
[`@fastify/swagger-ui`](https://github.com/fastify/fastify-swagger-ui).

## 4. Canonicalização e idempotência concorrente

**Decision**: validar primeiro o contrato, rejeitar `productId` repetido conforme a especificação,
ordenar recursivamente chaves de objetos e ordenar `items` por `productId`; gerar SHA-256 do JSON
canônico. Reivindicar a chave numa transação com:

```sql
INSERT INTO idempotency_records (key, request_hash, expires_at)
VALUES ($1, $2, $3)
ON CONFLICT (key) DO NOTHING
RETURNING key;
```

Se uma linha for inserida, a requisição cria todos os efeitos e associa `orderId` antes do commit.
Se não for, uma nova leitura em `READ COMMITTED` compara o hash comprometido: igual retorna o
pedido existente; diferente retorna `409 IDEMPOTENCY_CONFLICT`.

**Rationale**: a constraint única do PostgreSQL é o árbitro entre processos. O request perdedor
aguarda a decisão concorrente sem mutex local. Se o vencedor fizer rollback, outro request pode
assumir a chave. Nenhuma chamada de rede ocorre na transação.

**Alternatives considered**:

- Consultar antes de inserir: rejeitado por race condition.
- Mutex/advisory lock: desnecessário; a constraint única já resolve.
- Guardar somente a chave em `Order`: rejeitado porque o registro explícito suporta hash, retenção
  e consulta atômica com clareza.

**Tests/Risks**: mesma chave/hash sequencial e simultânea; mesma chave/hash com ordens diferentes;
hash diferente; rollback do vencedor; expiração após 24 horas; nunca normalizar silenciosamente a
chave recebida.

**Sources**: [PostgreSQL INSERT/ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html),
[PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

## 5. Estoque, pedido e reserva na mesma transação

**Decision**: usar transação interativa Prisma curta em `READ COMMITTED`. Carregar todos os
produtos para distinguir inexistência de insuficiência e capturar preço/moeda; ordenar IDs; para
cada item executar SQL parametrizado:

```sql
UPDATE products
SET available_quantity = available_quantity - $quantity,
    updated_at = now()
WHERE id = $productId
  AND available_quantity >= $quantity
RETURNING id, available_quantity;
```

Qualquer item sem retorno causa rollback integral. Na mesma transação criar pedido, itens,
reserva, itens da reserva, associação idempotente, incremento da geração do catálogo e evento da
outbox. Responder `202` somente depois do commit.

**Rationale**: o predicado e a redução pertencem ao mesmo comando, eliminando read-modify-write.
A transação protege carrinhos multi-item; a ordem determinística reduz deadlocks. `READ COMMITTED`
é suficiente porque o invariante está no update condicional.

**Alternatives considered**:

- `SELECT` e `UPDATE` sem condição: rejeitado por overselling.
- `SELECT FOR UPDATE`: correto, mas é uma consulta/lock adicional desnecessário.
- `SERIALIZABLE`: aumenta retries sem melhorar o invariante já protegido.
- SQL único com CTEs complexas: rejeitado em favor de clareza para catálogo pequeno.

**Tests/Risks**: última unidade concorrente; carrinhos em ordens inversas; rollback ao falhar o
segundo item; constraint `available_quantity >= 0`; retry curto somente para SQLSTATE de deadlock.

**Sources**: [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions),
[Prisma raw SQL](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries),
[PostgreSQL error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html).

## 6. Outbox transacional

**Decision**: `OutboxEvent` pertence à transação do pedido ou do resultado de processamento. O
publisher reivindica lotes pequenos numa transação curta usando `FOR UPDATE SKIP LOCKED`, status,
lease e `lockToken`; publica fora da transação; marca como publicado somente após publisher
confirm e apenas se ainda possuir o token.

**Rationale**: evita dual write PostgreSQL–RabbitMQ e locks de banco durante I/O de rede. Se o
processo cair depois do confirm e antes do update, o evento será republicado; o sistema assume
at-least-once e neutraliza a duplicata no consumidor.

**Alternatives considered**:

- Publicar diretamente no checkout: rejeitado porque pode perder trabalho após o commit.
- Manter a transação aberta durante publish: rejeitado por contenção e falha de rede.
- Marcar publicado antes do confirm: rejeitado porque pode perder a mensagem.
- CDC ou Kafka: fora do escopo.

**Tests/Risks**: claims concorrentes disjuntos, lease expirado, publisher antigo com token vencido,
nack/timeout/unroutable, e crash depois do confirm.

**Sources**: [PostgreSQL SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html),
[RabbitMQ publisher confirms](https://www.rabbitmq.com/docs/confirms).

## 7. RabbitMQ e retry de negócio

**Decision**: exchange direct durável `orders.exchange`, fila classic durável
`orders.processing`, DLX durável `orders.dlx` e fila `orders.dead`. Mensagens são persistentes,
`mandatory`, com `messageId=outboxEventId`, `correlationId`, `orderId`, `attempt`, `type` e
`occurredAt`. Consumer usa `prefetch=1` e ack manual após commit.

Retry do ERP não usa `nack(requeue=true)` nem plugin de delay. Resultado temporário/timeout cria,
na mesma transação que muda o pedido para `retrying`, novo evento de outbox com `attempt+1` e
`availableAt = now + retryDelay`. O publisher só publica eventos vencidos. O atraso padrão é 5
segundos; 3 timeouts e 2 atrasos totalizam nominalmente 190 segundos, abaixo da reserva de 5
minutos. Falha definitiva é resultado de negócio e recebe ack; apenas envelope inválido vai à DLQ.

**Rationale**: reutilizar `availableAt` evita exchange/filas de retry, plugin e hot loop, mantendo
status e intenção de retry atômicos no PostgreSQL. Retry de publicação não incrementa tentativa
do ERP.

**Alternatives considered**:

- `nack(requeue=true)`: rejeitado por loop imediato e falta de limite de negócio.
- Fila TTL/DLX de retry: correta, mas redundante com o agendamento durável da outbox.
- Plugin delayed-message: rejeitado por infraestrutura adicional.
- Quorum queue: sem benefício de HA num broker único do Compose.

**Tests/Risks**: broker indisponível mantém outbox; confirm perdido gera duplicata; duas mensagens
do mesmo pedido iniciam uma tentativa; envelope inválido vai à DLQ; quarta tentativa nunca existe.

**Sources**: [RabbitMQ reliability](https://www.rabbitmq.com/docs/reliability),
[RabbitMQ queues](https://www.rabbitmq.com/docs/queues),
[RabbitMQ publishers](https://www.rabbitmq.com/docs/publishers).

## 8. Consumidor idempotente, timeout e recuperação

**Decision**: `(orderId, attemptNumber)` é único. A aquisição transiciona condicionalmente
`pending|retrying -> processing`, cria `ProcessingAttempt`, grava `processingToken` e deadline de
60 segundos. Só o token atual pode aplicar resultado. Estado terminal, tentativa concluída ou
mensagem superada são ack/no-op. Resposta após deadline ou token substituído é ignorada.

Um sweep encontra tentativas abandonadas após o deadline e aplica `timeout`. Outro sweep disputa
reservas ativas vencidas: `ACTIVE -> EXPIRED` e restituição de todos os itens na mesma transação.
Confirmação exige reserva ativa e `expiresAt > now`; expiração e confirmação não podem vencer
juntas.

**Rationale**: status, tentativa única e lease tratam redelivery, concorrência e crash sem tabela
genérica de inbox. O estado da reserva é o marcador idempotente de restituição.

**Alternatives considered**:

- Tabela genérica `ProcessedMessage`: reservada para vários fluxos; seria redundante neste case.
- Ack automático: rejeitado porque pode perder trabalho.
- Excluir reserva após finalizar: rejeitado porque remove auditoria e marcador idempotente.

**Tests/Risks**: queda antes/depois do commit, entrega duplicada, timeout e resposta tardia,
expiradores concorrentes, confirmação contra expiração e restituição exatamente uma vez.

## 9. Redis, invalidação e recuperação

**Decision**: cache-aside com uma entrada `casecellshop:v1:products`, incluindo `[]`, formato
`{ catalogVersion, products }` e TTL configurável de 60 segundos. `CatalogState` no PostgreSQL
mantém uma geração monotônica, incrementada na mesma transação de toda mudança de produto ou
disponibilidade.

Em leitura, a API tenta Redis e compara a geração armazenada com a geração leve do PostgreSQL.
Geração igual é hit; miss, payload inválido, expiração ou divergência carrega a lista do banco e
faz `SET EX`. Se o `SET` falhar, ainda retorna os dados. Após commit de mutação, `DEL` é tentado
como otimização. Mesmo que falhe em outro processo, a geração impede servir a entrada obsoleta
quando o banco está acessível.

Falha Redis abre circuit breaker local com timeout curto. Enquanto aberto/half-open, nenhuma
entrada é servida. Na recuperação, obter a geração atual e remover ou substituir a chave antes de
fechar. Se PostgreSQL estiver indisponível, uma entrada Redis dentro do TTL pode ser usada conforme
o contrato; sem cache acessível, retornar `503`.

**Rationale**: apenas `DEL` mais estado degradado em memória não cobre falha assimétrica entre API
e worker. Uma linha de geração é a menor coordenação persistente que garante invalidação entre os
dois processos, mantendo Redis não autoritativo. Single-flight em memória agrupa misses por
processo; lock distribuído não é necessário.

**Alternatives considered**:

- Apenas `DEL` após commit: simples, mas pode servir stale se o worker falhar ao invalidar enquanto
  a API ainda alcança Redis.
- Cache em memória como fallback: rejeitado por divergência entre processos.
- Write-through/write-behind: transforma Redis em caminho crítico.
- Lock distribuído: desnecessário para uma única chave e catálogo pequeno.

**Tests/Risks**: hit/miss/TTL/lista vazia, payload corrompido, falha GET/SET/DEL, fallback, geração
divergente, recuperação antes do primeiro hit, misses concorrentes e Redis+PostgreSQL indisponíveis.

**Sources**: [Redis cache-aside](https://redis.io/docs/latest/develop/use-cases/cache-aside/),
[Redis Node.js cache-aside](https://redis.io/docs/latest/develop/use-cases/cache-aside/nodejs/).

## 10. ERP simulado

**Decision**: um port `ErpClient` recebe `orderId`, itens, tentativa, token idempotente e deadline.
O adapter simulado aceita modo forçado por configuração/teste e modo probabilístico com RNG
injetável: 80% confirmed, 10% temporarily unavailable, 5% unavailable, 5% timeout. Relógio e
sleeper também são ports; timeout não depende de aguardar 60 segundos em testes.

**Rationale**: configuração e injeção tornam todos os caminhos determinísticos e preservam a
regra pura de classificação. O simulador não sincroniza produtos ou estoque e não representa um
ERP real.

**Alternatives considered**:

- Serviço HTTP separado para o simulador: rejeitado; adiciona processo sem requisito.
- Random global e timers reais: rejeitados por testes lentos/flaky.
- Integração real: explicitamente fora do escopo.

## 11. Logs, correlação, métricas e trace

**Decision**: Fastify/Pino geram `requestId`, validam ou geram `correlationId`, retornam headers
`x-request-id` e `x-correlation-id`, e propagam correlação pela outbox e RabbitMQ. Worker cria child
logger com `correlationId`, `orderId`, tentativa e evento. Payload de checkout e credenciais não
são logados.

Usar `prom-client` com registry explícito por processo. API expõe duração HTTP, cache e
idempotência; worker expõe outbox, mensagens, tentativas ERP, retries, reservas e duração. Labels
são limitadas; IDs nunca viram labels. Um `TracePort` no-op documenta o stub opcional.

**Rationale**: registries separados refletem processos separados sem agregador. Logs filhos
preservam contexto. Stub mantém o trace fora do escopo sem impedir evolução.

**Alternatives considered**:

- OpenTelemetry completo: fora do escopo.
- Registry global: dificulta isolamento de testes.
- IDs como labels: rejeitados por cardinalidade ilimitada.

**Sources**: [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/),
[Pino](https://github.com/pinojs/pino), [prom-client](https://github.com/siimon/prom-client).

## 12. Testes e execução local

**Decision**: uma configuração Vitest com suites por diretório. Unitários usam ports falsos;
contratos usam `fastify.inject()`; integração usa Compose real; end-to-end inicia API e worker.
PostgreSQL de teste é isolado, chaves Redis têm namespace por execução e a fila é purgada/isolada.
Concorrência compartilhada é serializada somente nos arquivos que usam a mesma infraestrutura.

Uma imagem Node Debian slim serve `api`, `worker` e `migrate`. Compose inclui PostgreSQL, Redis,
RabbitMQ management e os processos da aplicação; um serviço one-shot aplica `prisma migrate
deploy` e seed antes de API/worker. Prometheus e cloud não são adicionados.

**Rationale**: unitários rápidos protegem domínio; apenas infraestrutura real prova constraints,
locks, atomicidade, confirms e redelivery. A mesma imagem evita divergência entre processos.

**Alternatives considered**:

- Mockar Prisma para overselling: rejeitado porque não prova PostgreSQL.
- Testcontainers: útil, porém Compose já é requisito e reduz ferramentas.
- Prometheus no Compose: desnecessário; endpoints de scrape bastam.

**Sources**: [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/),
[Vitest guide](https://vitest.dev/guide/).

## 13. Seed local de produtos com Faker

**Decision**: adicionar `@faker-js/faker` `10.5.0` como dependência de desenvolvimento e executar
`prisma/seed.ts` explicitamente por `prisma db seed`, registrado em `prisma.config.ts`. O gerador
usa `fakerPT_BR` com seed fixo `20260727` e produz exatamente 50 candidatos. Nomes vêm de
`commerce.productName()` após trim e limite de 160 caracteres; preços são gerados em centavos
inteiros e convertidos para decimal, moeda `BRL`, e disponibilidade inicial fica entre 10 e 100.
Os IDs são derivados do índice, sem UUID aleatório do Faker, preservando os dois IDs usados no
quickstart.

A persistência ocorre em uma transação com `createMany({ skipDuplicates: true })`. Ela insere
apenas produtos ausentes, não atualiza estoque nem dados existentes, não remove produtos externos
e incrementa `CatalogState.version` uma única vez somente quando ao menos uma linha é criada. O
serviço one-shot `migrate` aguarda o PostgreSQL, executa `prisma migrate deploy` e então o seed antes
de liberar API e worker. O seed não roda no bootstrap da API e não representa sincronização com ERP.

**Rationale**: os 50 produtos tornam o catálogo local demonstrável, enquanto RNG e IDs fixos deixam
testes e exemplos reproduzíveis. Inserção não destrutiva permite reexecutar Compose sem restaurar
estoque consumido nem apagar dados criados por outros fluxos. Atualizar a geração apenas quando há
inserção mantém a invalidação do cache coerente sem provocar misses em reexecuções sem mudanças.

**Alternatives considered**:

- `upsert` atualizando todos os produtos: rejeitado porque restauraria estoque e sobrescreveria dados.
- Apagar e recriar o catálogo: rejeitado por ser destrutivo e invalidar referências de pedidos.
- UUIDs aleatórios do Faker ou seed sem RNG fixo: rejeitados por prejudicar reprodutibilidade.
- Acrescentar SKU apenas para o seed: rejeitado porque não existe requisito ou campo no modelo.
- Fixture SQL estática ou seed no bootstrap da API: rejeitados por duplicar caminhos e acoplar startup.

**Test evidence**: unitários validam exatamente 50 candidatos determinísticos, IDs únicos e limites
de campos. Integração cobre banco vazio, reexecução, banco parcialmente preenchido, preservação de
estoque/dados existentes e incremento condicional da geração do catálogo.

**Sources**: [Faker usage and seeding](https://fakerjs.dev/guide/usage),
[Faker localization](https://fakerjs.dev/guide/localization.html),
[Faker commerce API](https://fakerjs.dev/api/commerce),
[Prisma seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding),
[Prisma `createMany`](https://www.prisma.io/docs/orm/prisma-client/queries/crud#create-many-records).
