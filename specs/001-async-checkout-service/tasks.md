# Tasks: Catalogo e Checkout assíncrono

**Input**: Design documents from `/specs/001-async-checkout-service/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are REQUIRED whenever behavior can be tested before implementation.
Idempotency, concurrency, overselling prevention, reservations and expiration, cache, outbox,
retries, duplicate messages, and asynchronous processing MUST have test tasks before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the Node.js, TypeScript, Fastify, Prisma, Redis, RabbitMQ and quality-gate foundation.

- [X] T001 Create npm project metadata, ESM module settings, Node 24 engine, Zod/Fastify schema dependencies and scripts for dev/build/start/lint/format/typecheck/test/verify in package.json
- [X] T002 [P] Configure strict TypeScript ESM compilation and path aliases in tsconfig.json
- [X] T003 [P] Configure Vitest projects for unit, contract, integration and e2e suites in vitest.config.ts
- [X] T004 [P] Configure ESLint flat config with typed TypeScript rules, Node globals, ignores and zero-warning policy in eslint.config.mjs
- [X] T005 [P] Configure Prettier formatting and generated-output ignores in .prettierrc.json and .prettierignore
- [X] T006 [P] Create environment example with local defaults and no production secrets in .env.example
- [X] T007 Create Docker image for api, worker, migrate and test commands in Dockerfile
- [X] T008 Create Docker Compose services for postgres, redis, rabbitmq, migrate, api, worker and test profile in docker-compose.yml
- [X] T009 [P] Create application configuration loader with Zod env validation, typed parsing and fail-fast descriptive errors in src/config/env.ts
- [X] T010 [P] Create shared clock, sleeper, UUID and RNG ports for deterministic tests in src/shared/ports/runtime.ts
- [X] T011 [P] Create test helpers for fake clock, fake sleeper and seeded RNG in tests/helpers/runtime.ts
- [X] T012 Run npm install after package.json is defined and generate package-lock.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure, contracts and persistence that MUST be complete before any user story implementation.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T013 [P] Write failing unit tests for order status transition rules and terminal-state guards in tests/unit/orders/order-state.test.ts
- [X] T014 [P] Write failing unit tests for reservation state transitions and single-release markers in tests/unit/orders/reservation-state.test.ts
- [X] T015 [P] Write failing unit tests for checkout payload validation and canonical JSON hashing in tests/unit/orders/canonical-payload.test.ts
- [X] T016 [P] Write failing unit tests for ERP result classification and 80/10/5/5 distribution using seeded RNG in tests/unit/orders/erp-simulator.test.ts
- [X] T017 Implement order status transition rules in src/modules/orders/domain/order-state.ts
- [X] T018 Implement reservation state transition rules in src/modules/orders/domain/reservation-state.ts
- [X] T019 Implement checkout payload canonicalization, duplicate product rejection and SHA-256 hashing in src/modules/orders/domain/canonical-payload.ts
- [X] T020 Implement ERP simulator decision model and forced/probabilistic result types in src/modules/orders/domain/erp-result.ts
- [X] T021 Define shared domain errors and HTTP-safe error codes in src/shared/errors.ts
- [X] T022 Define Zod schemas for products, checkout, order status, success responses, error envelopes and metrics headers in src/api/schemas/http.ts
- [X] T023 Define Zod order processing message schema and JSON Schema export aligned to contracts/order-processing-message.schema.json in src/worker/schemas/order-processing-message.ts
- [X] T024 Create Prisma schema with products, catalog state, orders, order items, idempotency records, stock reservations, reservation items, processing attempts and outbox events in prisma/schema.prisma
- [X] T025 Create initial migration with PostgreSQL enums, checks, partial indexes, unique constraints and conditional claim indexes in prisma/migrations/001_initial/migration.sql
- [X] T026 Configure Prisma 7 adapter and generated client location in prisma.config.ts
- [X] T027 Write failing integration tests for deterministic Faker seed, idempotent re-run without cache version increment and TTL-only cache renewal in tests/integration/seed.test.ts
- [X] T028 Implement deterministic 50-product Faker seed with non-destructive createMany and no CatalogState/cache-version increment in prisma/seed.ts
- [X] T029 Create Prisma client factory and transaction helper with no network calls inside transactions in src/adapters/database/prisma.ts
- [X] T030 Create Fastify app builder with Zod type provider, requestId, correlationId, error envelope, Swagger/OpenAPI and metrics plugins in src/api/app.ts
- [X] T031 Create API process entrypoint that opens the Fastify socket only from main in src/api/main.ts
- [X] T032 Create worker process entrypoint and lifecycle wiring without business logic in src/worker/main.ts
- [X] T033 Create Redis client adapter shell with health state and namespace constants in src/adapters/cache/redis-client.ts
- [X] T034 Create RabbitMQ connection adapter shell with durable exchange, queue and DLQ declarations in src/adapters/messaging/rabbitmq.ts
- [X] T035 Create Pino logger factory and child-context helpers for HTTP and worker flows in src/observability/logger.ts
- [X] T036 Create Prometheus metric registry factories for API and worker without high-cardinality labels in src/observability/metrics.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in priority order or in parallel where dependencies allow.

---

## Phase 3: User Story 1 - Listar produtos disponíveis (Priority: P1) MVP

**Goal**: List products with price and availability using Redis cache-aside with TTL, direct cache hit without PostgreSQL SELECT and database fallback on miss/failure.

**Independent Test**: Load known catalog data, call `GET /products` before and after cache warm-up, and validate `200`, `204`, direct Redis hit without PostgreSQL SELECT, cache miss/expiration, degraded Redis fallback and OpenAPI coverage.

### Tests for User Story 1

> Write these tests FIRST and confirm each fails for the expected reason.

- [X] T037 [P] [US1] Write failing contract tests for GET /products 200, 204 without body, 503 error envelope and request/correlation headers in tests/contract/products.test.ts
- [X] T038 [P] [US1] Write failing unit tests for direct catalog cache hit without PostgreSQL version check, miss, expired entry, invalid payload and 500ms database artificial delay decisions in tests/unit/catalog/catalog-cache.test.ts
- [X] T039 [P] [US1] Write failing integration tests for Redis GET/SET failure, degraded mode, recovery without version reload, PostgreSQL fallback and 50% faster direct Redis hit with 500ms database artificial delay in tests/integration/catalog-cache.test.ts
- [X] T040 [P] [US1] Write failing integration tests for concurrent cache expiration reads and single-flight refresh behavior in tests/integration/catalog-concurrency.test.ts
- [X] T041 [P] [US1] Write failing OpenAPI snapshot test for /products and /metrics contract coverage in tests/contract/openapi-products.test.ts

### Implementation for User Story 1

- [X] T042 [P] [US1] Define catalog ports for product repository, cache repository and metrics in src/modules/catalog/ports/catalog-ports.ts
- [X] T043 [P] [US1] Implement catalog product mapping and money serialization rules in src/modules/catalog/domain/product.ts
- [X] T044 [US1] Implement ListProductsUseCase with cache-aside, TTL, direct Redis hit without CatalogState/PostgreSQL version validation, 204 empty result, degraded Redis behavior and configurable 500ms artificial database delay for local cache validation in src/modules/catalog/application/list-products.ts
- [X] T045 [US1] Implement Prisma catalog repository for product reads only, removing CatalogState reads from GET /products path in src/adapters/database/catalog-repository.ts
- [X] T046 [US1] Implement Redis catalog cache adapter with key casecellshop:v1:products, TTL, payload validation and circuit breaker in src/adapters/cache/catalog-cache.ts
- [X] T047 [US1] Implement catalog route with Zod request/response schema binding for GET /products in src/api/routes/products.ts
- [X] T048 [US1] Register catalog route and API metrics endpoint in src/api/app.ts
- [X] T049 [US1] Add catalog metrics for duration, hit, miss, Redis failures, fallback and degraded mode transitions in src/observability/catalog-metrics.ts

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Iniciar checkout assíncrono (Priority: P1)

**Goal**: Accept a valid checkout immediately, reduce stock atomically, create reservation and durable outbox work without waiting for ERP.

**Independent Test**: Submit valid and invalid checkouts, including concurrent stock disputes, and validate `202`, all-or-nothing stock reduction, reservation creation, outbox creation and documented errors.

### Tests for User Story 2

> Write these tests FIRST and confirm each fails for the expected reason.

- [X] T050 [P] [US2] Write failing contract tests for POST /checkout 202, 400, 404, 409, error schema and headers in tests/contract/checkout.test.ts
- [X] T051 [P] [US2] Write failing unit tests for checkout input validation, duplicate product rejection and all-or-nothing decision mapping in tests/unit/orders/checkout-validation.test.ts
- [X] T052 [P] [US2] Write failing integration tests for atomic stock update, rollback on second item failure and no negative stock in tests/integration/checkout-stock.test.ts
- [X] T053 [P] [US2] Write failing integration tests for concurrent checkouts with different keys disputing limited stock in tests/integration/checkout-concurrency.test.ts
- [X] T054 [P] [US2] Write failing integration tests proving order, order items, reservation, idempotency record and outbox event commit or rollback together in tests/integration/checkout-transaction.test.ts
- [X] T055 [P] [US2] Write failing message schema test for initial outbox payload against contracts/order-processing-message.schema.json in tests/contract/order-processing-message.test.ts

### Implementation for User Story 2

- [X] T056 [P] [US2] Define order, order item, reservation and outbox ports for checkout in src/modules/orders/ports/order-ports.ts
- [X] T057 [P] [US2] Implement checkout domain validation types and accepted snapshot model in src/modules/orders/domain/checkout.ts
- [X] T058 [US2] Implement AcceptCheckoutUseCase transaction orchestration and 202 response model in src/modules/orders/application/accept-checkout.ts
- [X] T059 [US2] Implement Prisma checkout repository with idempotency claim, product load, ordered conditional stock updates and rollback mapping in src/adapters/database/checkout-repository.ts
- [X] T060 [US2] Implement Prisma reservation and outbox creation inside checkout transaction in src/adapters/database/checkout-repository.ts
- [X] T061 [US2] Implement checkout route with Idempotency-Key header, Zod schema validation and error translation in src/api/routes/checkout.ts
- [X] T062 [US2] Register checkout route in API builder in src/api/app.ts
- [X] T063 [US2] Remove checkout/reservation-driven catalog invalidation from current scope and document that active invalidation belongs to future ERP-local synchronization in src/modules/catalog/application/invalidate-catalog.ts
- [X] T064 [US2] Add checkout metrics for created, invalid, product not found, insufficient stock and accepted latency in src/observability/checkout-metrics.ts

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 - Repetir checkout com segurança (Priority: P1)

**Goal**: Ensure retries, double-clicks and simultaneous requests with the same idempotency key do not create duplicate orders, reservations or outbox events.

**Independent Test**: Repeat the same checkout with reordered JSON, reuse the same key with a different payload and run simultaneous same-key requests to validate replay or conflict behavior.

### Tests for User Story 3

> Write these tests FIRST and confirm each fails for the expected reason.

- [X] T065 [P] [US3] Write failing unit tests for canonical payload equivalence across reordered object properties and items sorted by productId in tests/unit/orders/canonical-payload.test.ts
- [X] T066 [P] [US3] Write failing integration tests for same key and same payload returning the same order without extra reservation or outbox in tests/integration/idempotency-replay.test.ts
- [X] T067 [P] [US3] Write failing integration tests for same key and different payload returning 409 without stock or order changes in tests/integration/idempotency-conflict.test.ts
- [X] T068 [P] [US3] Write failing integration tests for simultaneous same-key same-payload and same-key different-payload requests in tests/integration/idempotency-concurrency.test.ts
- [X] T069 [P] [US3] Write failing contract tests documenting 202 replay and 409 IDEMPOTENCY_CONFLICT examples in tests/contract/checkout-idempotency.test.ts

### Implementation for User Story 3

- [X] T070 [US3] Extend AcceptCheckoutUseCase to return committed replay result when requestHash matches in src/modules/orders/application/accept-checkout.ts
- [X] T071 [US3] Extend Prisma checkout repository to wait for and read the committed idempotency decision after key conflict in src/adapters/database/checkout-repository.ts
- [X] T072 [US3] Add idempotency conflict error mapping without mutating order, stock or reservation in src/api/routes/checkout.ts
- [X] T073 [US3] Add idempotency result logging and metrics for creation, replay and conflict without logging payload in src/observability/checkout-metrics.ts

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: User Story 4 - Consultar status do pedido (Priority: P1)

**Goal**: Return the current status of an order, including terminal error details when applicable, through a documented endpoint.

**Independent Test**: Query an order in each allowed state and query a missing order, validating response body, headers and HTTP status codes.

### Tests for User Story 4

> Write these tests FIRST and confirm each fails for the expected reason.

- [X] T074 [P] [US4] Write failing contract tests for GET /orders/{orderId}/status 200, 400, 404, terminal error and headers in tests/contract/order-status.test.ts
- [X] T075 [P] [US4] Write failing unit tests for order status response mapping and final error exposure in tests/unit/orders/order-status-view.test.ts
- [X] T076 [P] [US4] Write failing integration tests for reading pending, processing, retrying, confirmed, failed and missing orders in tests/integration/order-status.test.ts

### Implementation for User Story 4

- [X] T077 [P] [US4] Define order status query port and response DTO in src/modules/orders/ports/order-status-port.ts
- [X] T078 [US4] Implement GetOrderStatusUseCase with terminal-state stability and error mapping in src/modules/orders/application/get-order-status.ts
- [X] T079 [US4] Implement Prisma order status repository in src/adapters/database/order-status-repository.ts
- [X] T080 [US4] Implement GET /orders/{orderId}/status route with Zod request/response schema binding in src/api/routes/order-status.ts
- [X] T081 [US4] Register order status route in API builder in src/api/app.ts

**Checkpoint**: User Story 4 is independently functional and testable.

---

## Phase 7: User Story 5 - Processar pedido no ERP simulado (Priority: P2)

**Goal**: Publish outbox work, consume messages idempotently, call the configurable ERP simulator and apply retries, timeouts, failures and reservation release rules.

**Independent Test**: Force confirmed, temporarily unavailable, unavailable and timeout outcomes; validate transitions, retry count, outbox scheduling, duplicate-message no-op and final reservation effects.

### Tests for User Story 5

> Write these tests FIRST and confirm each fails for the expected reason.

- [X] T082 [P] [US5] Write failing unit tests for ERP simulator forced results, 1.000-attempt seeded probabilistic distribution with 4 percentage point tolerance and timeout classification without real 60-second waits in tests/unit/orders/erp-simulator.test.ts
- [X] T083 [P] [US5] Write failing unit tests for processing transition decisions, retry exhaustion and reservation release outcomes in tests/unit/orders/order-processing.test.ts
- [X] T084 [P] [US5] Write failing integration tests for outbox claim with FOR UPDATE SKIP LOCKED, lease expiry and stale lockToken protection in tests/integration/outbox-publisher.test.ts
- [X] T085 [P] [US5] Write failing integration tests for RabbitMQ publish confirms, unroutable messages and duplicate publish safety in tests/integration/rabbitmq-publisher.test.ts
- [X] T086 [P] [US5] Write failing integration tests for worker consumer duplicate delivery, terminal no-op and one attempt per order/attempt number in tests/integration/order-consumer-idempotency.test.ts
- [X] T087 [P] [US5] Write failing e2e tests for confirmed, temporarily unavailable, unavailable, timeout, third retry failure and late ERP response in tests/e2e/erp-results.test.ts
- [X] T088 [P] [US5] Write failing integration tests for reservation expiration sweeper and single stock restitution in tests/integration/reservation-expiration.test.ts
- [X] T122 [P] [US5] Write failing integration test proving reservation consume/release does not increment CatalogState/cache generation in tests/integration/processing-reservation-cache-generation.test.ts

### Implementation for User Story 5

- [X] T089 [P] [US5] Implement simulated ERP client with forced mode, probabilistic mode, injected clock, sleeper and RNG in src/adapters/erp/simulated-erp-client.ts
- [X] T090 [US5] Implement outbox publisher polling, claim lease, publisher confirm and conditional published update in src/worker/outbox-publisher.ts
- [X] T091 [US5] Implement RabbitMQ publisher and consumer adapter with durable exchange, classic queue, DLQ, persistent messages, mandatory publish, prefetch=1 and manual ack in src/adapters/messaging/rabbitmq.ts
- [X] T092 [US5] Implement order consumer claim flow that transitions pending/retrying to processing, creates ProcessingAttempt and guards attempt uniqueness in src/worker/order-consumer.ts
- [X] T093 [US5] Implement ERP attempt completion transaction for confirmed, temporarily_unavailable, unavailable and timeout in src/modules/orders/application/finish-processing-attempt.ts
- [X] T094 [US5] Implement retry scheduling by creating one new outbox event with availableAt after retryable ERP outcomes in src/adapters/database/processing-repository.ts
- [X] T095 [US5] Implement reservation consume and release rules inside processing transactions in src/adapters/database/processing-repository.ts
- [X] T117 [US5] Remove catalog generation increment from reservation consume/release paths in src/adapters/database/processing-repository.ts
- [X] T096 [US5] Implement recovery sweeper for abandoned processing attempts and late timeout application in src/worker/recovery-sweeper.ts
- [X] T097 [US5] Implement reservation expirer with FOR UPDATE SKIP LOCKED, order failure and single stock restitution in src/worker/reservation-expirer.ts
- [X] T098 [US5] Wire worker main loop for publisher, consumer, recovery sweeper, reservation expirer and graceful shutdown in src/worker/main.ts

**Checkpoint**: User Story 5 is independently functional and testable.

---

## Phase 8: User Story 6 - Rastrear fluxos e sinais operacionais (Priority: P2)

**Goal**: Provide structured logs and metrics that trace HTTP requests through asynchronous processing and expose cache, retry and failure signals.

**Independent Test**: Execute catalog and checkout flows, then correlate logs and metrics by requestId, correlationId and orderId while verifying metric categories and low-cardinality labels.

### Tests for User Story 6

> Write these tests FIRST and confirm each fails for the expected reason.

- [X] T099 [P] [US6] Write failing contract tests for API /metrics and worker /metrics Prometheus text responses and headers in tests/contract/metrics.test.ts
- [X] T100 [P] [US6] Write failing integration tests for requestId and correlationId propagation from HTTP to outbox and RabbitMQ message in tests/integration/correlation.test.ts
- [X] T101 [P] [US6] Write failing integration tests for structured log fields in HTTP and worker flows without checkout payload logging in tests/integration/structured-logs.test.ts
- [X] T102 [P] [US6] Write failing integration tests for metric counters and histograms covering cache, idempotency, outbox, messages, ERP outcomes, retries and reservation restitution in tests/integration/metrics.test.ts

### Implementation for User Story 6

- [X] T103 [US6] Implement requestId and correlationId Fastify plugin with response headers and request-scoped logger in src/api/plugins/request-context.ts
- [X] T104 [US6] Implement correlation propagation into checkout transaction, outbox payload and RabbitMQ properties in src/modules/orders/application/accept-checkout.ts
- [X] T105 [US6] Implement worker child logger context with correlationId, orderId, attemptNumber and outbox event id in src/worker/order-consumer.ts
- [X] T106 [US6] Implement API and worker metrics endpoints with prom-client registries in src/api/routes/metrics.ts and src/worker/metrics-server.ts
- [X] T107 [US6] Implement no-op TracePort and document trace stub integration point in src/observability/trace.ts
- [ ] T118 [P] [US6] Write failing contract test for Grafana provisioning files, Prometheus datasource and dashboard panels in tests/contract/grafana.test.ts
- [ ] T119 [US6] Provision Grafana Prometheus datasource in observability/grafana/provisioning/datasources/prometheus.yml, dashboard provider in observability/grafana/provisioning/dashboards/dashboards.yml and dashboard JSON in observability/grafana/dashboards/casecellshop-overview.json covering cache, checkout, latency, worker, outbox, retries and failures
- [ ] T120 [P] [US6] Write failing tests for no-op spans at request, cache, repository/outbox and worker boundaries in tests/unit/observability/trace.test.ts
- [ ] T121 [US6] Connect TracePort no-op spans to HTTP request, catalog cache, checkout repository/outbox and worker processing flows

**Checkpoint**: User Story 6 is independently functional and testable.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Complete delivery documentation, validation evidence and consistency checks across all stories.

- [X] T108 [P] Update README with architecture, decisions, trade-offs, limitations, no ERP sync, Docker Compose instructions, validation scenarios and link to PROMPTS.md in README.md
- [X] T109 [P] Update PROMPTS.md with the tasks-generation prompt, purpose and resulting artifact in PROMPTS.md
- [X] T110 [P] Add OpenAPI drift validation comparing generated documentation to specs/001-async-checkout-service/contracts/openapi.yaml in tests/contract/openapi-drift.test.ts
- [X] T111 [P] Add worker contract drift validation for specs/001-async-checkout-service/contracts/worker-openapi.yaml and order-processing-message.schema.json in tests/contract/worker-contract-drift.test.ts
- [X] T112 [P] Add quickstart smoke script covering catalog, checkout, idempotency replay, status, metrics and Docker Compose checks in scripts/quickstart-smoke.ps1
- [ ] T113 Run full local quality gate and fix only valid failures until npm run verify passes with zero warnings in package.json
- [ ] T114 Run Docker Compose validation and fix only valid failures until docker compose --profile test run --rm test npm run verify passes in docker-compose.yml
- [ ] T115 Review delivery-readiness checklist and mark satisfied items with evidence references in specs/001-async-checkout-service/checklists/delivery-readiness.md
- [ ] T116 Final consistency pass across spec.md, plan.md, tasks.md, README.md and PROMPTS.md without changing behavior to fit incorrect implementation in specs/001-async-checkout-service/tasks.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion.
- **Polish (Final Phase)**: Depends on all desired user stories and their verification evidence.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational; MVP scope.
- **US2 (P1)**: Can start after Foundational; uses shared database and API foundation; catalog invalidation is outside current scope unless ERP-local sync is added.
- **US3 (P1)**: Depends on US2 checkout acceptance path because it extends idempotency replay/conflict behavior.
- **US4 (P1)**: Can start after Foundational; becomes more useful after US2 creates orders.
- **US5 (P2)**: Depends on US2 because processing starts from checkout outbox records; uses US4 for status validation.
- **US6 (P2)**: Can start after Foundational, but full traceability evidence depends on US1, US2 and US5 flows.

### Within Each User Story

- Applicable tests MUST be written and MUST fail for the expected reason before implementation.
- Domain rules before application use cases.
- Application use cases before adapters.
- Adapters before routes or worker wiring.
- Contract tests before endpoint or message implementation.
- Integration tests with PostgreSQL/Redis/RabbitMQ real services are required for concurrency, atomicity, outbox and broker behavior.

---

## Parallel Opportunities

- Setup tasks T002, T003, T004, T005, T006, T009, T010 and T011 can run in parallel after T001 starts package definition.
- Foundational tests T013, T014, T015 and T016 can run in parallel; implementations T017, T018, T019 and T020 can run in parallel after their tests fail.
- US1 tests T037, T038, T039, T040 and T041 can run in parallel before catalog implementation.
- US2 tests T050, T051, T052, T053, T054 and T055 can run in parallel before checkout implementation.
- US3 tests T065, T066, T067, T068 and T069 can run in parallel before idempotency implementation.
- US4 tests T074, T075 and T076 can run in parallel before status implementation.
- US5 tests T082, T083, T084, T085, T086, T087, T088 and T122 can run in parallel before worker implementation.
- US6 tests T099, T100, T101, T102, T118 and T120 can run in parallel before observability wiring.
- Polish tasks T108, T109, T110, T111 and T112 can run in parallel after the relevant behavior exists.

## Parallel Example: User Story 1

```text
Task: "T037 Contract test for GET /products in tests/contract/products.test.ts"
Task: "T038 Unit test for catalog cache decisions in tests/unit/catalog/catalog-cache.test.ts"
Task: "T039 Integration test for Redis fallback in tests/integration/catalog-cache.test.ts"
Task: "T040 Integration test for concurrent cache expiration in tests/integration/catalog-concurrency.test.ts"
Task: "T041 OpenAPI snapshot test for products in tests/contract/openapi-products.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "T050 Contract test for POST /checkout in tests/contract/checkout.test.ts"
Task: "T052 Integration test for atomic stock update in tests/integration/checkout-stock.test.ts"
Task: "T053 Integration test for concurrent stock disputes in tests/integration/checkout-concurrency.test.ts"
Task: "T054 Integration test for checkout transaction atomicity in tests/integration/checkout-transaction.test.ts"
Task: "T055 Message schema test in tests/contract/order-processing-message.test.ts"
```

## Parallel Example: User Story 5

```text
Task: "T084 Integration test for outbox claims in tests/integration/outbox-publisher.test.ts"
Task: "T085 Integration test for RabbitMQ publisher confirms in tests/integration/rabbitmq-publisher.test.ts"
Task: "T086 Integration test for duplicate delivery in tests/integration/order-consumer-idempotency.test.ts"
Task: "T087 E2E tests for ERP results in tests/e2e/erp-results.test.ts"
Task: "T088 Integration test for reservation expiration in tests/integration/reservation-expiration.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate `GET /products`, cache hit/miss, 204 empty catalog, degraded Redis fallback, OpenAPI and metrics for catalog.

### Incremental Delivery

1. Setup + Foundational -> project, schema, tooling and shared ports ready.
2. US1 -> catalog read path and cache behavior.
3. US2 -> async checkout acceptance, stock reservation and outbox persistence.
4. US3 -> idempotency replay/conflict and simultaneous same-key behavior.
5. US4 -> order status query.
6. US5 -> outbox publisher, RabbitMQ consumer, ERP simulator, retries, expiration and duplicate-message safety.
7. US6 -> end-to-end observability and operational metrics.
8. Polish -> README, PROMPTS, contract drift checks, quickstart smoke and full verification.

### Validation Gates

1. For every behavior task, first complete the corresponding failing test task and record that it failed for the expected reason.
2. Run focused tests during each story.
3. Before approving code changes, run `npm run verify` with zero warnings.
4. Before declaring the feature complete, run `docker compose --profile test run --rm test npm run verify`.
5. Keep OpenAPI, README, PROMPTS.md and documented simplifications current; do not change specs to excuse incorrect implementation.

## Notes

- [P] tasks use different files and can run in parallel when their prerequisites are satisfied.
- Story labels map directly to spec user stories.
- Redis, RabbitMQ and ERP are adapters; stock, reservation, idempotency and status rules remain isolated from infrastructure.
- PostgreSQL real integration tests are mandatory evidence for atomic stock update, idempotency claims, outbox claims and overselling prevention.
- Authentication, payment, frontend, cloud deploy, real ERP integration and ERP-local synchronization remain out of scope.
