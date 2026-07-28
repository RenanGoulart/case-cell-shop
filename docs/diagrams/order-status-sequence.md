# GET /orders/{orderId}/status

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente/Postman
    participant API as API Fastify
    participant Rota as Rota de Status do Pedido
    participant CasoUso as GetOrderStatusUseCase
    participant Repo as PrismaOrderStatusRepository
    participant Postgres as PostgreSQL

    Cliente->>API: GET /orders/{orderId}/status<br/>x-request-id, x-correlation-id
    API->>Rota: Valida headers e parametro UUID da rota

    alt UUID invalido
        Rota-->>API: 400 error envelope
        API-->>Cliente: 400 INVALID_REQUEST
    else UUID valido
        Rota->>CasoUso: execute({ orderId })
        CasoUso->>Repo: Consultar status do pedido
        Repo->>Postgres: SELECT order by id

        alt Pedido existe
            Postgres-->>Repo: orderId, status, updatedAt, finalError
            Repo-->>CasoUso: Snapshot de status
            CasoUso-->>Rota: Snapshot de status
            Rota-->>API: Resposta 200
            API-->>Cliente: orderId/status/updatedAt/finalError?
        else Pedido nao encontrado
            Postgres-->>Repo: Resultado vazio
            Repo-->>CasoUso: ORDER_NOT_FOUND
            CasoUso-->>Rota: 404 error envelope
            Rota-->>API: Resposta 404
            API-->>Cliente: 404 ORDER_NOT_FOUND
        end
    end
```

Pontos principais:

- Esta rota e o contrato de polling para o fluxo assincrono de checkout.
- Os status validos sao `pending`, `processing`, `retrying`, `confirmed` e `failed`.
- `finalError` aparece apenas quando existe um motivo de falha terminal a expor.
