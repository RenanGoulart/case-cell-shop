# CaseCellShop Backend

Backend modular em Node.js e TypeScript para demonstrar catÃ¡logo com cache, checkout assÃ­ncrono, idempotÃªncia, controle de estoque por atualizaÃ§Ã£o atÃ´mica, outbox transacional, worker com retry e observabilidade bÃ¡sica.

## Arquitetura

- API HTTP Fastify em `src/api`, com validaÃ§Ã£o Zod, Swagger/OpenAPI e logs Pino em JSON.
- Worker em processo separado em `src/worker`, responsÃ¡vel por publicar outbox, consumir mensagens, simular ERP, aplicar retries e expirar reservas.
- PostgreSQL Ã© a fonte autoritativa local para catÃ¡logo, estoque, pedidos, idempotÃªncia, reservas e outbox.
- Prisma Ã© usado para migrations, seed e acesso ao PostgreSQL.
- Redis Ã© usado somente como cache-aside do catÃ¡logo, com TTL e fallback para PostgreSQL.
- RabbitMQ transporta eventos de processamento de pedido.
- Docker Compose sobe PostgreSQL, Redis, RabbitMQ, migrations/seed, API, worker, Prometheus, Grafana e profile de teste.

## DecisÃµes principais

- O checkout reduz estoque no aceite da requisiÃ§Ã£o, antes do `202 Accepted`, usando atualizaÃ§Ã£o condicional atÃ´mica no PostgreSQL para impedir overselling.
- A confirmaÃ§Ã£o pelo ERP nÃ£o reduz estoque novamente. Falha definitiva, expiraÃ§Ã£o ou abandono restituem a reserva uma Ãºnica vez.
- A idempotÃªncia usa `Idempotency-Key` com hash de payload canÃ´nico. O payload Ã© ordenado antes da comparaÃ§Ã£o para evitar falso conflito por ordem de campos ou itens.
- A mesma chave com mesmo payload retorna o mesmo pedido. A mesma chave com payload diferente retorna `409 Conflict`.
- Pedido e evento de outbox sÃ£o persistidos na mesma transaÃ§Ã£o.
- O consumidor Ã© idempotente pelo estado do pedido e ignora mensagens duplicadas sem repetir efeito final.
- O ERP Ã© simulado e configurÃ¡vel: por padrÃ£o, cada tentativa tem 80% de confirmaÃ§Ã£o, 10% de indisponibilidade temporÃ¡ria, 5% de indisponibilidade total e 5% de timeout.
- Zod valida variÃ¡veis de ambiente na inicializaÃ§Ã£o. VariÃ¡vel obrigatÃ³ria ausente ou invÃ¡lida faz API/worker falhar imediatamente com erro descritivo.
- Zod tambÃ©m valida schemas de entrada da API e Ã© reutilizado na documentaÃ§Ã£o OpenAPI sempre que possÃ­vel.
- ESLint, Prettier, typecheck e testes compÃµem o gate obrigatÃ³rio via `npm run verify`.

## Trade-offs e simplificaÃ§Ãµes

- A aplicaÃ§Ã£o Ã© modular, mas nÃ£o usa microsserviÃ§os. API e worker ficam no mesmo repositÃ³rio para reduzir complexidade do case.
- NÃ£o hÃ¡ autenticaÃ§Ã£o, pagamento, front-end, deploy remoto, ERP real ou sincronizaÃ§Ã£o entre ERP e banco local.
- O banco local Ã© a fonte autoritativa desta demonstraÃ§Ã£o. A ausÃªncia de sincronizaÃ§Ã£o ERP-banco local Ã© intencional e deve ser tratada como simplificaÃ§Ã£o de escopo, nÃ£o como comportamento de produÃ§Ã£o.
- O Redis nÃ£o Ã© fonte de verdade. Em cache hit vÃ¡lido, `GET /products` retorna diretamente o snapshot Redis sem consultar PostgreSQL; se o Redis falhar ou houver miss, o catÃ¡logo consulta PostgreSQL e registra mÃ©tricas de fallback/degradaÃ§Ã£o.
- O catÃ¡logo aplica atraso artificial configurÃ¡vel de `CATALOG_DB_ARTIFICIAL_DELAY_MS=500` no caminho PostgreSQL para imitar latÃªncia de produÃ§Ã£o em ambiente local. O hit de Redis nÃ£o aplica esse atraso nem valida versÃ£o no banco, tornando o ganho de cache observÃ¡vel.
- O cache pode ficar atÃ© 60 segundos atrÃ¡s do PostgreSQL. Isso Ã© aceito para listagem; checkout continua protegido por update atÃ´mico no PostgreSQL. InvalidaÃ§Ã£o ativa dependeria de sincronizaÃ§Ã£o ERP-banco local, fora do escopo.
- O teste estatÃ­stico do ERP usa amostra reduzida para manter o feedback rÃ¡pido; a distribuiÃ§Ã£o alvo continua documentada em 80%/10%/5%/5%.
- Tracing distribuÃ­do real Ã© opcional; a rastreabilidade mÃ­nima usa `requestId`, `correlationId`, `orderId`, logs estruturados e mÃ©tricas.

## Contrato HTTP

A documentaÃ§Ã£o Swagger/OpenAPI fica disponÃ­vel em:

```bash
http://localhost:3000/documentation
```

Contratos estÃ¡ticos ficam em `specs/001-async-checkout-service/contracts/` e hÃ¡ testes de drift para comparar caminhos/cÃ³digos principais com o contrato gerado.

Artefatos para teste manual e entendimento do fluxo:

- Collection Postman: [case-cell-shop.postman_collection.json](./case-cell-shop.postman_collection.json).
- Diagrama `GET /products`: [docs/diagrams/products-sequence.md](./docs/diagrams/products-sequence.md).
- Diagrama `POST /checkout`: [docs/diagrams/checkout-sequence.md](./docs/diagrams/checkout-sequence.md).
- Diagrama `GET /orders/{orderId}/status`: [docs/diagrams/order-status-sequence.md](./docs/diagrams/order-status-sequence.md).

Endpoints principais:

- `GET /products`: retorna `200` com produtos ou `204 No Content` quando nÃ£o houver conteÃºdo.
- `POST /checkout`: retorna `202 Accepted` com `orderId` e status inicial; exige `Idempotency-Key`.
- `GET /orders/{orderId}/status`: retorna status atual do pedido.
- `GET /metrics`: expÃµe mÃ©tricas Prometheus da API.
- Worker expÃµe mÃ©tricas em `http://localhost:9091/metrics`.
- Prometheus local coleta API/worker em `http://localhost:9090`.
- Grafana local fica em `http://localhost:3001` com login `admin`/`casecellshop` e dashboard `CaseCellShop Overview`.

## ExecuÃ§Ã£o local

Crie ou revise `.env` com as variÃ¡veis locais. As variÃ¡veis devem ficar somente em arquivos `.env*`; nÃ£o hÃ¡ env hardcoded na aplicaÃ§Ã£o.

macOS/Linux:

```bash
cp .env.example .env
npm ci
npm run prisma:generate
docker compose up --build --wait
docker compose ps
```

Smoke manual em macOS/Linux:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/products

ORDER_ID=$(curl -s -X POST http://localhost:3000/checkout \
  -H 'content-type: application/json' \
  -H "idempotency-key: manual-$(date +%s)" \
  -d '{"items":[{"productId":"case-product-001","quantity":1}]}' \
  | node -e "let data=''; process.stdin.on('data', chunk => data += chunk); process.stdin.on('end', () => console.log(JSON.parse(data).orderId));")

curl -i "http://localhost:3000/orders/${ORDER_ID}/status"
curl -s http://localhost:3000/metrics | grep 'casecellshop_'
curl -s http://localhost:9091/metrics | grep 'casecellshop_worker_'
```

Windows/PowerShell:

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:generate
docker compose up --build --wait
docker compose ps
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/quickstart-smoke.ps1
```

Executar gate local:

```bash
npm run verify
```

Executar gate dentro do Docker Compose:

```bash
docker compose --profile test run --rm test npm run verify
```

## Seed local

O serviÃ§o `migrate` executa `prisma migrate deploy` e `prisma db seed`. A seed usa `@faker-js/faker` com seed fixa e cria 50 produtos locais. ReexecuÃ§Ãµes sÃ£o nÃ£o destrutivas para produtos jÃ¡ existentes.

## Observabilidade

- Logs HTTP incluem `requestId` e `correlationId`.
- Fluxos assÃ­ncronos preservam `correlationId` e registram `orderId` quando aplicÃ¡vel.
- MÃ©tricas cobrem duraÃ§Ã£o HTTP, cache hit/miss/fallback, publicaÃ§Ãµes outbox, mensagens processadas, retries, falhas e resultados do ERP simulado.
- O smoke script valida catÃ¡logo, checkout, replay idempotente, status e mÃ©tricas da API/worker.

### Grafana, alertas e runbook

O Compose provisiona Prometheus e Grafana a partir de `observability/`. O dashboard `CaseCellShop Overview` mostra cache hit/miss, rejeiÃ§Ãµes e aceite de checkout, p95 de latÃªncia do aceite, resultados do ERP, outbox, retries e falhas/fallbacks do Redis.

Consultas Ãºteis:

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

1. Abra o dashboard no Grafana e identifique se a anomalia estÃ¡ em cache, checkout ou worker.
2. Consulte `curl -s http://localhost:3000/metrics` e `curl -s http://localhost:9091/metrics` para confirmar a sÃ©rie bruta.
3. Verifique logs com `docker compose logs api worker` e correlacione por `requestId`, `correlationId` e `orderId`.
4. Para cache degradado, valide Redis com `docker compose ps redis` e force nova leitura de `GET /products`.
5. Para processamento parado, valide RabbitMQ em `http://localhost:15672`, consulte status do pedido e verifique se a outbox volta a publicar apÃ³s recuperaÃ§Ã£o do broker.

Trace distribuÃ­do real nÃ£o Ã© reivindicado nesta entrega; o projeto mantÃ©m o `TracePort` no-op como stub justificÃ¡vel, conectado aos limites de request HTTP, cache, repositÃ³rio/outbox e worker, alÃ©m da rastreabilidade por logs e mÃ©tricas.

## Desenvolvimento

Fluxo esperado:

```bash
npm install
npm run prisma:generate
npm run verify
```

Qualquer alteraÃ§Ã£o de cÃ³digo deve passar em lint, formataÃ§Ã£o, typecheck e testes antes de ser considerada aprovada.

## Uso de IA

Prompts relevantes e decisÃµes assistidas por IA sÃ£o registrados em [PROMPTS.md](./PROMPTS.md). Todo cÃ³digo e documentaÃ§Ã£o gerados com apoio de IA devem ser revisados contra especificaÃ§Ã£o, plano, testes, escopo e complexidade.
