# CaseCellShop Backend

Backend modular em Node.js e TypeScript para demonstrar catálogo com cache, checkout assíncrono, idempotência, controle de estoque por atualização atômica, outbox transacional, worker com retry e observabilidade básica.

## Arquitetura

- API HTTP Fastify em `src/api`, com validação Zod, Swagger/OpenAPI e logs Pino em JSON.
- Worker em processo separado em `src/worker`, responsável por publicar outbox, consumir mensagens, simular ERP, aplicar retries e expirar reservas.
- PostgreSQL é a fonte autoritativa local para catálogo, estoque, pedidos, idempotência, reservas e outbox.
- Prisma é usado para migrations, seed e acesso ao PostgreSQL.
- Redis é usado somente como cache-aside do catálogo, com TTL e fallback para PostgreSQL.
- RabbitMQ transporta eventos de processamento de pedido.
- Docker Compose sobe PostgreSQL, Redis, RabbitMQ, migrations/seed, API, worker, Prometheus, Grafana e profile de teste.

## Decisões principais

- O checkout reduz estoque no aceite da requisição, antes do `202 Accepted`, usando atualização condicional atômica no PostgreSQL para impedir overselling.
- A confirmação pelo ERP não reduz estoque novamente. Falha definitiva, expiração ou abandono restituem a reserva uma única vez.
- A idempotência usa `Idempotency-Key` com hash de payload canônico. O payload é ordenado antes da comparação para evitar falso conflito por ordem de campos ou itens.
- A mesma chave com mesmo payload retorna o mesmo pedido. A mesma chave com payload diferente retorna `409 Conflict`.
- Pedido e evento de outbox são persistidos na mesma transação.
- O consumidor é idempotente pelo estado do pedido e ignora mensagens duplicadas sem repetir efeito final.
- O ERP é simulado e configurável: por padrão, cada tentativa tem 80% de confirmação, 10% de indisponibilidade temporária, 5% de indisponibilidade total e 5% de timeout.
- Zod valida variáveis de ambiente na inicialização. Variável obrigatória ausente ou inválida faz API/worker falhar imediatamente com erro descritivo.
- Zod também valida schemas de entrada da API e é reutilizado na documentação OpenAPI sempre que possível.
- ESLint, Prettier, typecheck e testes compõem o gate obrigatório via `npm run verify`.

## Trade-offs e simplificações

- A aplicação é modular, mas não usa microsserviços. API e worker ficam no mesmo repositório para reduzir complexidade do case.
- Não há autenticação, pagamento, front-end, deploy remoto, ERP real ou sincronização entre ERP e banco local.
- O banco local é a fonte autoritativa desta demonstração. A ausência de sincronização ERP-banco local é intencional e deve ser tratada como simplificação de escopo, não como comportamento de produção.
- O Redis não é fonte de verdade. Em cache hit válido, `GET /products` retorna diretamente o snapshot Redis sem consultar PostgreSQL; se o Redis falhar ou houver miss, o catálogo consulta PostgreSQL e registra métricas de fallback/degradação.
- O catálogo aplica atraso artificial configurável de `CATALOG_DB_ARTIFICIAL_DELAY_MS=500` no caminho PostgreSQL para imitar latência de produção em ambiente local. O hit de Redis não aplica esse atraso nem valida versão no banco, tornando o ganho de cache observável.
- O cache pode ficar até 60 segundos atrás do PostgreSQL. Isso é aceito para listagem; checkout continua protegido por update atômico no PostgreSQL. Invalidação ativa dependeria de sincronização ERP-banco local, fora do escopo.
- O teste estatístico do ERP usa amostra reduzida para manter o feedback rápido; a distribuição alvo continua documentada em 80%/10%/5%/5%.
- Tracing distribuído real é opcional; a rastreabilidade mínima usa `requestId`, `correlationId`, `orderId`, logs estruturados e métricas.

## Contrato HTTP

A documentação Swagger/OpenAPI fica disponível em:

```bash
http://localhost:3000/documentation
```

Contratos estáticos ficam em `specs/001-async-checkout-service/contracts/` e há testes de drift para comparar caminhos/códigos principais com o contrato gerado.

Artefatos para teste manual e entendimento do fluxo:

- Collection Postman: [case-cell-shop.postman_collection.json](./case-cell-shop.postman_collection.json).
- Diagrama `GET /products`: [docs/diagrams/products-sequence.md](./docs/diagrams/products-sequence.md).
- Diagrama `POST /checkout`: [docs/diagrams/checkout-sequence.md](./docs/diagrams/checkout-sequence.md).
- Diagrama `GET /orders/{orderId}/status`: [docs/diagrams/order-status-sequence.md](./docs/diagrams/order-status-sequence.md).

Endpoints principais:

- `GET /products`: retorna `200` com produtos ou `204 No Content` quando não houver conteúdo.
- `POST /checkout`: retorna `202 Accepted` com `orderId` e status inicial; exige `Idempotency-Key`.
- `GET /orders/{orderId}/status`: retorna status atual do pedido.
- `GET /metrics`: expõe métricas Prometheus da API.
- Worker expõe métricas em `http://localhost:9091/metrics`.
- Prometheus local coleta API/worker em `http://localhost:9090`.
- Grafana local fica em `http://localhost:3001` com login `admin`/`casecellshop` e dashboard `CaseCellShop Overview`.

## Execução local

Pré-requisitos: Node.js/npm e Docker com Docker Compose.

Use o mesmo comando em Windows, macOS e Linux para subir toda a stack local:

```bash
npm run start:stack
```

Esse comando cria `.env` a partir de `.env.example` quando `.env` ainda não existe e executa `docker compose up --build --wait`. Ao finalizar, a aplicação fica disponível para uso manual com PostgreSQL, Redis, RabbitMQ, migrations/seed, API, worker, Prometheus e Grafana.

URLs principais após a subida:

- API: `http://localhost:3000`
- Swagger/OpenAPI: `http://localhost:3000/documentation`
- Métricas do worker: `http://localhost:9091/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

## Seed local

O serviço `migrate` executa `prisma migrate deploy` e `prisma db seed`. A seed usa `@faker-js/faker` com seed fixa e cria 50 produtos locais. Reexecuções são não destrutivas para produtos já existentes.

## Observabilidade

- Logs HTTP incluem `requestId` e `correlationId`.
- Fluxos assíncronos preservam `correlationId` e registram `orderId` quando aplicável.
- Métricas cobrem duração HTTP, cache hit/miss/fallback, publicações outbox, mensagens processadas, retries, falhas e resultados do ERP simulado.
- O smoke script valida catálogo, checkout, replay idempotente, status e métricas da API/worker.

### Grafana, alertas e runbook

O Compose provisiona Prometheus e Grafana a partir de `observability/`. O dashboard `CaseCellShop Overview` mostra cache hit/miss, rejeições e aceite de checkout, p95 de latência do aceite, resultados do ERP, outbox, retries e falhas/fallbacks do Redis.

Consultas úteis:

```promql
sum(rate(casecellshop_catalog_cache_hits_total[5m]))
sum(rate(casecellshop_catalog_cache_misses_total[5m]))
sum(rate(casecellshop_checkout_accepted_total[5m]))
sum(rate(casecellshop_checkout_invalid_total[5m])) + sum(rate(casecellshop_checkout_product_not_found_total[5m])) + sum(rate(casecellshop_checkout_insufficient_stock_total[5m])) + sum(rate(casecellshop_checkout_idempotency_conflict_total[5m]))
histogram_quantile(0.95, sum(rate(casecellshop_checkout_accept_duration_ms_bucket[5m])) by (le))
sum(rate(casecellshop_worker_erp_outcomes_total[5m])) by (result)
sum(rate(casecellshop_worker_retries_scheduled_total[5m]))
sum(rate(casecellshop_catalog_redis_failures_total[5m])) by (operation)
```

Alertas exemplos para configurar no Grafana:

```promql
sum(rate(casecellshop_catalog_redis_failures_total[5m])) > 0
sum(rate(casecellshop_worker_outbox_publish_failures_total[5m])) > 0
histogram_quantile(0.95, sum(rate(casecellshop_checkout_accept_duration_ms_bucket[5m])) by (le)) > 1000
```

Runbook curto:

1. Abra o dashboard no Grafana e identifique se a anomalia está em cache, checkout ou worker.
2. Consulte `curl -s http://localhost:3000/metrics` e `curl -s http://localhost:9091/metrics` para confirmar a série bruta.
3. Verifique logs com `docker compose logs api worker` e correlacione por `requestId`, `correlationId` e `orderId`.
4. Para cache degradado, valide Redis com `docker compose ps redis` e force nova leitura de `GET /products`.
5. Para processamento parado, valide RabbitMQ em `http://localhost:15672`, consulte status do pedido e verifique se a outbox volta a publicar após recuperação do broker.

Trace distribuído real não é reivindicado nesta entrega; o projeto mantém o `TracePort` no-op como stub justificável, conectado aos limites de request HTTP, cache, repositório/outbox e worker, além da rastreabilidade por logs e métricas.

## Desenvolvimento

Fluxo esperado:

```bash
npm install
npm run prisma:generate
npm run verify
```

Qualquer alteração de código deve passar em lint, formatação, typecheck e testes antes de ser considerada aprovada.

## Uso de IA

Prompts relevantes e decisões assistidas por IA são registrados em [PROMPTS.md](./PROMPTS.md). Todo código e documentação gerados com apoio de IA devem ser revisados contra especificação, plano, testes, escopo e complexidade.

Este projeto utilizou o Spec Kit do GitHub em conjunto com o Codex.
