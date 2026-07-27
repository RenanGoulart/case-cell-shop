# Quickstart: CaseCellShop Backend

Este guia descreve a validação esperada após a implementação. Ele não substitui os contratos em
[`contracts/`](./contracts/), o modelo em [data-model.md](./data-model.md) nem a matriz completa em
[test-scenarios.md](./test-scenarios.md).

## Prerequisites

- Docker Engine/Desktop com Docker Compose v2.
- Portas locais livres: `3000`, `9091`, `5432`, `6379`, `5672` e `15672`.
- Opcional para execução fora dos containers: Node.js 24 LTS e npm compatível.

Não são necessários PostgreSQL, Redis, RabbitMQ ou Prisma instalados globalmente.

## Planned Compose Services

| Service | Purpose | Local endpoint |
|---------|---------|----------------|
| `postgres` | Fonte autoritativa e migrations | `localhost:5432` |
| `redis` | Cache não autoritativo | `localhost:6379` |
| `rabbitmq` | Broker e management UI | AMQP `localhost:5672`; UI `http://localhost:15672` |
| `migrate` | `prisma migrate deploy` e `prisma db seed` determinístico com Faker; encerra com sucesso | — |
| `api` | Fastify HTTP | `http://localhost:3000` |
| `worker` | Publisher, consumer e sweepers | métricas em `http://localhost:9091` |
| `test` | Suite Vitest sob profile `test` | — |

`api`, `worker`, `migrate` e `test` usam a mesma imagem. API/worker mudam apenas command, portas e
variáveis de processo.

## Configuration

Copie o arquivo de exemplo quando ele existir na implementação:

```bash
cp .env.example .env
```

Defaults locais esperados:

```dotenv
PORT=3000
WORKER_METRICS_PORT=9091
CATALOG_CACHE_TTL_SECONDS=60
IDEMPOTENCY_TTL_HOURS=24
RESERVATION_TTL_SECONDS=300
ERP_ATTEMPT_TIMEOUT_SECONDS=60
ERP_MAX_ATTEMPTS=3
ERP_RETRY_DELAY_SECONDS=5
ERP_MODE=probabilistic
ERP_FORCED_RESULT=
```

Credenciais do Compose são somente locais e devem permanecer no `.env.example`; nenhuma credencial
de produção faz parte desta feature.

## Start Everything

```bash
docker compose up --build --wait
docker compose ps
```

Resultado esperado:

- infraestrutura saudável;
- `migrate` encerrado com código `0`;
- `api` e `worker` em execução;
- migrations aplicadas e 50 produtos locais criados pelo seed Faker;
- documentação disponível em `http://localhost:3000/documentation`.

Se a versão do Compose não aceitar `--wait`, use `docker compose up --build -d` e acompanhe
`docker compose ps`/`docker compose logs` até os serviços ficarem prontos.

## Seed Data

O serviço `migrate` executa explicitamente `prisma db seed`. O gerador usa `fakerPT_BR`, seed fixo
`20260727` e cria 50 candidatos com nomes, preços e disponibilidade local. Os IDs são estáveis; os
dois primeiros continuam disponíveis para os exemplos:

| Index | ID | Initial availability |
|-------|----|----------------------|
| `1` | `11111111-1111-4111-8111-111111111111` | entre 10 e 100 |
| `2` | `22222222-2222-4222-8222-222222222222` | entre 10 e 100 |

Em uma base limpa, confirme a quantidade:

```bash
docker compose exec postgres psql -U casecellshop -d casecellshop -tAc "SELECT count(*) FROM products;"
```

O resultado esperado é `50`. A reexecução `docker compose run --rm migrate` é não destrutiva:
produtos presentes, inclusive estoque já consumido, não são sobrescritos; somente IDs ausentes são
inseridos. Preços e disponibilidade devem ser obtidos por `GET /products`. O seed é uma massa local
e não representa sincronização com ERP.

## Validate the Catalog

Primeira leitura (miss e população):

```bash
curl -i http://localhost:3000/products
```

Segunda leitura dentro de 60 segundos (hit):

```bash
curl -i http://localhost:3000/products
curl -s http://localhost:3000/metrics
```

Esperado:

- `200` com 50 entradas em base limpa, contendo `id`, `name`, `price`, `currency` e `availableQuantity`;
- headers `x-request-id` e `x-correlation-id` em ambas as respostas;
- métricas distinguindo miss e hit;
- o teste de contrato `products-empty` comprova `204` sem corpo para catálogo vazio, sem exigir
  alteração manual do seed.

## Start a Checkout

```bash
curl -i -X POST http://localhost:3000/checkout \
  -H "content-type: application/json" \
  -H "idempotency-key: quickstart-order-001" \
  -H "x-correlation-id: 33333333-3333-4333-8333-333333333333" \
  -d '{"items":[{"productId":"11111111-1111-4111-8111-111111111111","quantity":1},{"productId":"22222222-2222-4222-8222-222222222222","quantity":2}]}'
```

Esperado: `202 Accepted`, `orderId` e status inicial normalmente `pending`, sem aguardar o ERP.
Copie o `orderId` retornado.

## Validate Idempotency

Repita a mesma chave com itens em ordem inversa:

```bash
curl -i -X POST http://localhost:3000/checkout \
  -H "content-type: application/json" \
  -H "idempotency-key: quickstart-order-001" \
  -d '{"items":[{"quantity":2,"productId":"22222222-2222-4222-8222-222222222222"},{"quantity":1,"productId":"11111111-1111-4111-8111-111111111111"}]}'
```

Esperado: `202`, mesmo `orderId`, status atual e nenhum novo pedido/reserva/outbox.

Agora altere a quantidade mantendo a chave:

```bash
curl -i -X POST http://localhost:3000/checkout \
  -H "content-type: application/json" \
  -H "idempotency-key: quickstart-order-001" \
  -d '{"items":[{"productId":"11111111-1111-4111-8111-111111111111","quantity":2},{"productId":"22222222-2222-4222-8222-222222222222","quantity":2}]}'
```

Esperado: `409 IDEMPOTENCY_CONFLICT` sem alterar estoque ou pedido.

## Follow the Order

```bash
curl -i http://localhost:3000/orders/ORDER_ID/status
```

Substitua `ORDER_ID`. O estado pode passar por `pending`, `processing`, `retrying` e terminar em
`confirmed` ou `failed`. Repetir a consulta em estado terminal não muda o resultado.

## Redis Failure and Recovery

Esta sequência é intencional e recuperável:

```bash
docker compose stop redis
curl -i http://localhost:3000/products
docker compose start redis
curl -i http://localhost:3000/products
curl -s http://localhost:3000/metrics
```

Esperado:

- durante a falha, `GET /products` usa PostgreSQL e continua `200`/`204`;
- checkout válido não falha somente por Redis;
- métricas registram erro, fallback e modo degradado;
- após a recuperação, a aplicação remove/substitui a entrada antes de voltar a servir hits;
- a geração do catálogo impede uso de disponibilidade anterior a uma mutação.

## RabbitMQ Failure

```bash
docker compose stop rabbitmq
```

Crie um checkout com nova chave. Esperado: `202` porque pedido e outbox estão no PostgreSQL; a
publicação permanece pendente. Depois:

```bash
docker compose start rabbitmq
docker compose logs worker
```

Esperado: a outbox é publicada após o broker voltar e o pedido progride. Retry de publicação não
conta como tentativa do ERP.

## Force ERP Outcomes

Os testes end-to-end executam o worker com cada resultado forçado, sem esperar timers reais:

```bash
docker compose --profile test run --rm test npm run test:e2e -- erp-results
```

Eles comprovam:

- `confirmed` consome a reserva sem segunda redução;
- `temporarily_unavailable` e `timeout` criam retry quando `attempt < 3`;
- timeout ocorre no deadline de 60 segundos e ignora resposta tardia;
- `unavailable` falha imediatamente;
- a terceira falha retryable termina em `failed` e restitui uma vez;
- a distribuição seeded de 10.000 tentativas respeita 80%/10%/5%/5% com tolerância de 1 ponto.

## Run the Approval Gate and Test Suites

O comando obrigatório antes de aprovar qualquer alteração de código é:

```bash
npm run verify
```

Ele executa, em sequência, ESLint com zero warnings, verificação de formatação pelo Prettier,
`tsc --noEmit` e todas as suites Vitest. A evidência reproduzível pelo ambiente do case é:

```bash
docker compose --profile test run --rm test npm run verify
```

Ambos devem encerrar com código `0`. Para diagnóstico ou correção local, os estágios também ficam
disponíveis separadamente:

```bash
npm run lint
npm run lint:fix
npm run format:check
npm run format
npm run typecheck
```

`lint:fix` e `format` modificam arquivos e não substituem a execução posterior de `npm run verify`.

### Suites isoladas

Toda a suite dentro do Compose:

```bash
docker compose --profile test run --rm test npm test
```

Suites separadas:

```bash
docker compose --profile test run --rm test npm run test:unit
docker compose --profile test run --rm test npm run test:contract
docker compose --profile test run --rm test npm run test:integration
docker compose --profile test run --rm test npm run test:e2e
```

Cenários críticos de concorrência:

```bash
docker compose --profile test run --rm test npm run test:integration -- tests/integration/checkout-concurrency.test.ts
docker compose --profile test run --rm test npm run test:integration -- tests/integration/idempotency-concurrency.test.ts
```

Esses testes usam PostgreSQL real; mocks não contam como prova de atomicidade.

## Inspect Contracts and Observability

```bash
curl -s http://localhost:3000/documentation/json
curl -s http://localhost:3000/metrics
curl -s http://localhost:9091/metrics
docker compose logs api worker
```

Validar:

- OpenAPI corresponde a [`contracts/openapi.yaml`](./contracts/openapi.yaml);
- mensagem corresponde a
  [`contracts/order-processing-message.schema.json`](./contracts/order-processing-message.schema.json);
- logs HTTP contêm `requestId`/`correlationId`;
- logs do worker contêm `correlationId`/`orderId`/tentativa;
- métricas não usam IDs como labels.

RabbitMQ management: `http://localhost:15672`. A fila `orders.dead` deve permanecer vazia nos
fluxos válidos; mensagens com envelope inválido são encaminhadas para ela.

## Stop or Reset

Parar mantendo volumes:

```bash
docker compose down
```

Remover também dados locais de PostgreSQL, Redis e RabbitMQ — operação destrutiva e apropriada
somente para reset do ambiente do case:

```bash
docker compose down -v
```

## Documented Limitations

- ERP é um client simulado dentro do worker, não um serviço ou integração real.
- Não há sincronização entre ERP e banco local.
- Não há autenticação, pagamento, front-end, cloud ou trace distribuído real.
- O Compose usa um broker e um banco sem alta disponibilidade.
- Redis acelera leitura; decisões de estoque sempre usam PostgreSQL.
