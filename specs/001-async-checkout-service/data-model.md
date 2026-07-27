# Data Model: Catálogo e Checkout Assíncrono

## Conventions

- PostgreSQL é a fonte autoritativa; Redis e RabbitMQ não armazenam estado de negócio oficial.
- Identificadores persistentes usam UUID gerado pela aplicação ou `gen_random_uuid()`.
- Datas usam `timestamptz` em UTC.
- Dinheiro usa `numeric(12,2)`; quantidade usa `integer`.
- Nomes Prisma seguem `camelCase`; tabelas/colunas SQL usam `snake_case` por `@map`/`@@map`.
- Enums Prisma são materializados como enums PostgreSQL.
- `CHECK`, índices parciais e SQL de claim/update condicional são adicionados pela migration quando
  não forem expressáveis no schema Prisma.

## Enumerations

### OrderStatus

| Value | Meaning |
|-------|---------|
| `PENDING` | Pedido aceito e aguardando a primeira tentativa. |
| `PROCESSING` | Uma tentativa possui lease/token ativo. |
| `RETRYING` | Resultado temporário/timeout persistido e próximo evento agendado. |
| `CONFIRMED` | Estado terminal confirmado pelo ERP simulado. |
| `FAILED` | Estado terminal por falha definitiva, tentativas esgotadas ou reserva expirada. |

### ReservationStatus

| Value | Meaning |
|-------|---------|
| `ACTIVE` | Quantidade já reduzida e ainda reservada. |
| `CONSUMED` | Pedido confirmado; não há nova redução de estoque. |
| `RELEASED` | Quantidade restituída por falha do pedido. |
| `EXPIRED` | Quantidade restituída porque `expiresAt` foi atingido. |

### ProcessingResult

`CONFIRMED`, `TEMPORARILY_UNAVAILABLE`, `UNAVAILABLE` ou `TIMEOUT`.

### OutboxStatus

`PENDING`, `PROCESSING` ou `PUBLISHED`.

### OutboxType

Inicialmente apenas `ORDER_PROCESSING_REQUESTED`. Novos tipos exigem especificação e contrato de
mensagem próprios.

## Entities

### CatalogState

Linha singleton que coordena invalidação entre API e worker.

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `key` | `varchar(32)` | PK; valor único esperado `products`. |
| `version` | `bigint` | NOT NULL, default `1`, `CHECK (version > 0)`. |
| `updatedAt` | `timestamptz` | NOT NULL; atualizado com cada incremento. |

Toda transação que muda campos visíveis do catálogo ou `availableQuantity` executa
`version = version + 1`. O valor acompanha a entrada Redis e invalida logicamente gerações antigas.

### Product

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `id` | `uuid` | PK. |
| `name` | `varchar(160)` | NOT NULL, não vazio após trim. |
| `price` | `numeric(12,2)` | NOT NULL, `CHECK (price >= 0)`. |
| `currency` | `char(3)` | NOT NULL; moeda ISO configurada para o case. |
| `availableQuantity` | `integer` | NOT NULL, `CHECK (available_quantity >= 0)`. |
| `createdAt` | `timestamptz` | NOT NULL. |
| `updatedAt` | `timestamptz` | NOT NULL. |

Não existe endpoint de mutação de produto nesta feature. Seed e mudanças de estoque usam o mesmo
port de persistência para garantir incremento de `CatalogState.version`.

### Dataset do seed local

O seed gera exatamente 50 candidatos com `fakerPT_BR.seed(20260727)`. O Faker fornece nome,
preço em centavos inteiros e disponibilidade inicial; os IDs são derivados deterministicamente do
índice para não depender da sequência interna de UUIDs da biblioteca. Os dois primeiros permanecem:

| Index | Product ID | Purpose |
|-------|------------|---------|
| `1` | `11111111-1111-4111-8111-111111111111` | Primeiro produto dos exemplos de checkout. |
| `2` | `22222222-2222-4222-8222-222222222222` | Segundo produto dos exemplos concorrentes. |
| `3..50` | UUID válido e estável derivado do índice | Completar o catálogo sem introduzir SKU. |

Cada candidato respeita `name` não vazio com no máximo 160 caracteres, `price` entre `25.00` e
`5000.00` construído sem ponto flutuante intermediário, `currency = BRL` e
`availableQuantity` entre 10 e 100. A faixa positiva mantém todos os itens utilizáveis nos exemplos.

Uma única transação executa `createMany` com `skipDuplicates`, preserva linhas existentes e
incrementa `CatalogState.version` uma vez se `count > 0`; se nenhum produto for criado, a versão
permanece igual. Uma base parcialmente preenchida recebe apenas IDs ausentes. O seed não remove
produtos externos, não restaura estoque, não consulta ERP e não constitui sincronização ERP-local.

### Order

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `id` | `uuid` | PK. |
| `status` | `order_status` | NOT NULL, default `PENDING`. |
| `attemptCount` | `integer` | NOT NULL, default `0`, `CHECK (attempt_count BETWEEN 0 AND 3)`. |
| `requestId` | `uuid` | NOT NULL; request que criou o pedido. |
| `correlationId` | `uuid` | NOT NULL; propagado pela outbox/mensagem. |
| `processingToken` | `uuid` | Nullable; identifica o dono atual de `PROCESSING`. |
| `processingStartedAt` | `timestamptz` | Nullable; preenchido em `PROCESSING`. |
| `processingDeadlineAt` | `timestamptz` | Nullable; início + 60 segundos. |
| `finalErrorCode` | `varchar(64)` | Nullable; apenas em `FAILED`. |
| `createdAt` | `timestamptz` | NOT NULL. |
| `updatedAt` | `timestamptz` | NOT NULL. |

Checks de coerência adicionados por migration:

- `PROCESSING` exige token, início e deadline;
- `CONFIRMED` exige `finalErrorCode IS NULL`;
- `FAILED` exige `finalErrorCode IS NOT NULL`;
- estados que não são `PROCESSING` não mantêm token ativo.

Índice operacional: `(status, processing_deadline_at)` para recuperação de tentativas abandonadas.

### OrderItem

Snapshot comercial do item no momento do checkout.

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `orderId` | `uuid` | FK `Order`, parte da PK. |
| `productId` | `uuid` | FK `Product` com `ON DELETE RESTRICT`, parte da PK. |
| `quantity` | `integer` | NOT NULL, `CHECK (quantity > 0)`. |
| `unitPrice` | `numeric(12,2)` | NOT NULL, `CHECK (unit_price >= 0)`. |
| `currency` | `char(3)` | NOT NULL. |

PK composta `(order_id, product_id)` reforça a regra que rejeita produto repetido. Índice adicional
em `product_id` suporta consulta do relacionamento reverso.

### IdempotencyRecord

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `key` | `varchar(255)` | PK; comparação exata. |
| `requestHash` | `char(64)` | NOT NULL; SHA-256 hexadecimal do payload canônico válido. |
| `orderId` | `uuid` | FK `Order`, UNIQUE, nullable apenas durante a transação proprietária. |
| `expiresAt` | `timestamptz` | NOT NULL; criação + 24 horas. |
| `createdAt` | `timestamptz` | NOT NULL. |

Uma linha comprometida deve sempre ter `orderId`; a aplicação trata linha sem pedido como violação
de integridade. Um job simples do worker remove registros vencidos em lotes; remover o registro não
remove o pedido.

Índice: `(expires_at)` para limpeza. PK e UNIQUE já criam seus próprios índices.

### StockReservation

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `id` | `uuid` | PK. |
| `orderId` | `uuid` | FK `Order`, UNIQUE e NOT NULL. |
| `status` | `reservation_status` | NOT NULL, default `ACTIVE`. |
| `expiresAt` | `timestamptz` | NOT NULL; criação + 5 minutos. |
| `consumedAt` | `timestamptz` | Nullable; somente `CONSUMED`. |
| `releasedAt` | `timestamptz` | Nullable; somente `RELEASED`. |
| `expiredAt` | `timestamptz` | Nullable; somente `EXPIRED`. |
| `createdAt` | `timestamptz` | NOT NULL. |
| `updatedAt` | `timestamptz` | NOT NULL. |

Índice parcial recomendado pela migration:

```sql
CREATE INDEX stock_reservations_active_expires_idx
ON stock_reservations (expires_at, id)
WHERE status = 'ACTIVE';
```

### ReservationItem

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `reservationId` | `uuid` | FK `StockReservation` com cascade, parte da PK. |
| `productId` | `uuid` | FK `Product` com restrict, parte da PK. |
| `quantity` | `integer` | NOT NULL, `CHECK (quantity > 0)`. |

PK composta `(reservation_id, product_id)` e índice adicional em `product_id`.

### ProcessingAttempt

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `id` | `uuid` | PK. |
| `orderId` | `uuid` | FK `Order`, NOT NULL. |
| `attemptNumber` | `integer` | NOT NULL, `CHECK (attempt_number BETWEEN 1 AND 3)`. |
| `processingToken` | `uuid` | UNIQUE, NOT NULL. |
| `startedAt` | `timestamptz` | NOT NULL. |
| `deadlineAt` | `timestamptz` | NOT NULL. |
| `finishedAt` | `timestamptz` | Nullable. |
| `result` | `processing_result` | Nullable até finalizar. |
| `durationMs` | `integer` | Nullable, `CHECK (duration_ms >= 0)`. |

UNIQUE `(order_id, attempt_number)` impede duas execuções da mesma tentativa. Resultado final é
gravado uma vez; redelivery consulta esta linha antes de chamar o ERP.

Índice: `(deadline_at)` parcial onde `finished_at IS NULL`.

### OutboxEvent

| Field | PostgreSQL | Constraints / Notes |
|-------|------------|---------------------|
| `id` | `uuid` | PK e `messageId` RabbitMQ. |
| `aggregateId` | `uuid` | FK `Order`, NOT NULL. |
| `type` | `outbox_type` | NOT NULL. |
| `attemptNumber` | `integer` | NOT NULL, `CHECK BETWEEN 1 AND 3`. |
| `payload` | `jsonb` | NOT NULL; envelope versionado conforme contrato. |
| `status` | `outbox_status` | NOT NULL, default `PENDING`. |
| `availableAt` | `timestamptz` | NOT NULL; agenda publicação inicial ou retry de negócio. |
| `publishAttempts` | `integer` | NOT NULL, default `0`, `CHECK >= 0`. |
| `lockedAt` | `timestamptz` | Nullable; início do lease. |
| `lockToken` | `uuid` | Nullable; dono do claim atual. |
| `publishedAt` | `timestamptz` | Nullable. |
| `lastError` | `varchar(256)` | Nullable, sanitizado. |
| `createdAt` | `timestamptz` | NOT NULL. |
| `updatedAt` | `timestamptz` | NOT NULL. |

UNIQUE `(aggregate_id, type, attempt_number)` garante um evento de processamento por tentativa.
Índice parcial de polling:

```sql
CREATE INDEX outbox_ready_idx
ON outbox_events (available_at, created_at, id)
WHERE status IN ('PENDING', 'PROCESSING');
```

## Relationships

```text
CatalogState(products)  1 metadata row

Product 1 ─── * OrderItem * ─── 1 Order 1 ─── 1 IdempotencyRecord
   │                                  │
   ├──── * ReservationItem * ─── 1 StockReservation
   │                                  │
   │                                  └────────────── 1 Order
   │
Order 1 ─── * ProcessingAttempt
Order 1 ─── * OutboxEvent
```

Componentes (`OrderItem`, `ReservationItem`) podem usar cascade a partir do pai apenas em limpeza
controlada de dados de teste. `Product` usa restrict para preservar histórico. Pedidos não são
excluídos pelo fluxo funcional.

## State Transitions

### Order

| From | Event / Guard | To | Durable side effects |
|------|---------------|----|----------------------|
| — | Checkout transacional aceito | `PENDING` | Estoque reduzido, reserva ativa, idempotência e outbox tentativa 1. |
| `PENDING` | Claim tentativa 1 | `PROCESSING` | Attempt 1 e token/deadline. |
| `RETRYING` | Claim próxima tentativa | `PROCESSING` | Novo attempt único e token/deadline. |
| `PROCESSING` | `CONFIRMED`, token atual, antes de expirar | `CONFIRMED` | Reserva `ACTIVE -> CONSUMED`; sem nova redução. |
| `PROCESSING` | `TEMPORARILY_UNAVAILABLE` ou `TIMEOUT`, tentativa < 3 | `RETRYING` | Attempt finalizado e nova outbox com `availableAt`. |
| `PROCESSING` | `UNAVAILABLE` | `FAILED` | Reserva `ACTIVE -> RELEASED`, estoque restituído uma vez, geração incrementada. |
| `PROCESSING` | Temporário/timeout na tentativa 3 | `FAILED` | Mesma restituição idempotente. |
| `PENDING|PROCESSING|RETRYING` | Reserva atingiu `expiresAt` | `FAILED` | `RESERVATION_EXPIRED`, reserva expirada e restituição uma vez. |
| `CONFIRMED|FAILED` | Qualquer mensagem/resultado tardio | mesmo estado | No-op e ack/registro de duplicata. |

Transições não listadas são inválidas. Atualizações usam `WHERE status IN (...)` e token esperado;
resultado sem linha alterada é duplicata, estado superado ou conflito de concorrência.

### Reservation

```text
ACTIVE ── confirmação válida ──> CONSUMED
ACTIVE ── falha do pedido ─────> RELEASED
ACTIVE ── expiresAt atingido ──> EXPIRED
```

Estados finais não transitam. Somente a transição que altera uma linha restitui estoque.

### Outbox

```text
PENDING ── claim ──> PROCESSING ── publisher confirm ──> PUBLISHED
   ^                     │
   └── falha/lease vencido ─────────────────────────────┘
```

Um `lockToken` antigo nunca pode marcar ou devolver um claim mais novo.

## Transaction Boundaries

### Accept checkout

Uma transação contém claim idempotente, leitura de produtos, updates condicionais, pedido,
snapshots, reserva, associação da idempotência, geração do catálogo e outbox. Redis/RabbitMQ/ERP
ficam fora.

### Finish ERP attempt

Uma transação valida token/deadline/reserva, finaliza attempt, muda pedido e consome ou libera
reserva. Em retry cria nova outbox; em liberação incrementa catálogo. Ack e Redis ficam depois.

### Expire reservation

Claim com `FOR UPDATE SKIP LOCKED`; transição condicional de reserva; restituição de todos os
itens; falha do pedido; cancelamento lógico de trabalho futuro; incremento da geração. Tudo ou
nada.

### Publish outbox

Claim/lease em transação curta; publish fora; atualização condicional pelo `lockToken` em nova
transação.

## Cache Representation

Redis key: `casecellshop:v1:products`

```json
{
  "catalogVersion": "42",
  "loadedAt": "2026-07-27T12:00:00.000Z",
  "products": []
}
```

`catalogVersion` é string no JSON para preservar `bigint`. `products: []` é cacheável e produz
`204`. Payload inválido é tratado como miss e removido. TTL não é duplicado como fonte de verdade
no payload: a expiração efetiva é do Redis.

## Retention and Cleanup

- Idempotência: 24 horas; limpeza em lotes após `expiresAt`.
- Reservas, attempts e pedidos: preservados durante o case para auditoria/teste.
- Outbox publicada: preservada durante o case; uma política futura de retenção não faz parte desta
  feature.
- Chaves Redis: TTL de 60 segundos; nenhuma limpeza global (`FLUSHDB`).
- DLQ: inspecionada manualmente no ambiente local; não existe replay automático nesta feature.
