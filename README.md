# CaseCellShop Backend

Backend modular em Node.js e TypeScript para demonstrar catálogo com cache, checkout assíncrono, idempotência, controle de estoque por atualização atômica, outbox transacional, worker com retry e observabilidade básica.

## Arquitetura

- API HTTP Fastify em `src/api`, com validação Zod, Swagger/OpenAPI e logs Pino em JSON.
- Worker em processo separado em `src/worker`, responsável por publicar outbox, consumir mensagens, simular ERP, aplicar retries e expirar reservas.
- PostgreSQL é a fonte autoritativa local para catálogo, estoque, pedidos, idempotência, reservas e outbox.
- Prisma é usado para migrations, seed e acesso ao PostgreSQL.
- Redis é usado somente como cache-aside do catálogo, com TTL e fallback para PostgreSQL.
- RabbitMQ transporta eventos de processamento de pedido.
- Docker Compose sobe PostgreSQL, Redis, RabbitMQ, migrations/seed, API, worker e profile de teste.

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
- O Redis não é fonte de verdade. Se o Redis falhar, o catálogo consulta PostgreSQL e registra métricas de fallback/degradação.
- O catálogo aplica atraso artificial configurável de `CATALOG_DB_ARTIFICIAL_DELAY_MS=500` no caminho PostgreSQL para imitar latência de produção em ambiente local. O hit de Redis não aplica esse atraso, tornando o ganho de cache observável.
- O teste estatístico do ERP usa amostra reduzida para manter o feedback rápido; a distribuição alvo continua documentada em 80%/10%/5%/5%.
- Tracing distribuído real é opcional; a rastreabilidade mínima usa `requestId`, `correlationId`, `orderId`, logs estruturados e métricas.

## Contrato HTTP

A documentação Swagger/OpenAPI fica disponível em:

```bash
http://localhost:3000/documentation
```

Contratos estáticos ficam em `specs/001-async-checkout-service/contracts/` e há testes de drift para comparar caminhos/códigos principais com o contrato gerado.

Endpoints principais:

- `GET /products`: retorna `200` com produtos ou `204 No Content` quando não houver conteúdo.
- `POST /checkout`: retorna `202 Accepted` com `orderId` e status inicial; exige `Idempotency-Key`.
- `GET /orders/{orderId}/status`: retorna status atual do pedido.
- `GET /metrics`: expõe métricas Prometheus da API.
- Worker expõe métricas em `http://localhost:9091/metrics`.

## Execução local

Crie ou revise `.env` com as variáveis locais. As variáveis devem ficar somente em arquivos `.env*`; não há env hardcoded na aplicação.

Subir a solução:

```bash
docker compose up --build --wait
```

Verificar serviços:

```bash
docker compose ps
```

Executar smoke de quickstart:

```powershell
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

O serviço `migrate` executa `prisma migrate deploy` e `prisma db seed`. A seed usa `@faker-js/faker` com seed fixa e cria 50 produtos locais. Reexecuções são não destrutivas para produtos já existentes.

## Observabilidade

- Logs HTTP incluem `requestId` e `correlationId`.
- Fluxos assíncronos preservam `correlationId` e registram `orderId` quando aplicável.
- Métricas cobrem duração HTTP, cache hit/miss/fallback, publicações outbox, mensagens processadas, retries, falhas e resultados do ERP simulado.
- O smoke script valida catálogo, checkout, replay idempotente, status e métricas da API/worker.

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
