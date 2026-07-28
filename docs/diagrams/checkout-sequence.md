# POST /checkout

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente/Postman
    participant API as API Fastify
    participant Rota as Rota de Checkout
    participant CasoUso as AcceptCheckoutUseCase
    participant Repo as PrismaCheckoutRepository
    participant Postgres as PostgreSQL
    participant Outbox as Tabela Outbox
    participant Publicador as Worker Publicador Outbox
    participant Rabbit as RabbitMQ
    participant Consumidor as Worker Consumidor de Pedido
    participant ERP as ERP Simulado
    participant Metricas as Metricas Prometheus

    Cliente->>API: POST /checkout<br/>Idempotency-Key + payload
    API->>Rota: Valida headers/body e contexto da requisicao
    Rota->>CasoUso: execute(command)
    CasoUso->>Repo: Aceitar checkout em transacao

    Repo->>Postgres: Buscar/criar registro de idempotencia pela chave
    alt Mesma chave e mesmo payload canonico ja aceito
        Postgres-->>Repo: Snapshot do pedido existente
        Repo-->>CasoUso: Replay idempotente
        CasoUso-->>Rota: orderId/status existentes
    else Mesma chave com payload diferente
        Postgres-->>Repo: Conflito de hash do payload
        Repo-->>CasoUso: IDEMPOTENCY_CONFLICT
        CasoUso-->>Rota: 409 error envelope
    else Nova chave de idempotencia
        Repo->>Postgres: Validar produtos
        Repo->>Postgres: Decremento atomico de estoque se houver quantidade
        alt Estoque insuficiente
            Postgres-->>Repo: Nenhuma linha atualizada
            Repo-->>CasoUso: INSUFFICIENT_STOCK
            CasoUso-->>Rota: 409 error envelope
        else Estoque reservado
            Repo->>Postgres: Criar pedido pending + reserva
            Repo->>Outbox: Inserir evento de processamento na mesma transacao
            Postgres-->>Repo: Snapshot do pedido commitado
            Repo-->>CasoUso: orderId/status=pending
            CasoUso-->>Rota: Checkout aceito
        end
    end

    Rota->>Metricas: Registra checkout aceito ou falha
    Rota-->>API: 202 Accepted ou error envelope
    API-->>Cliente: orderId/status quando aceito

    loop Polling do worker
        Publicador->>Outbox: SELECT eventos pending/processing disponiveis FOR UPDATE SKIP LOCKED
        Outbox-->>Publicador: Payload do evento
        Publicador->>Rabbit: Publicar mensagem de processamento do pedido
        Publicador->>Outbox: Marcar evento como publicado
    end

    Rabbit-->>Consumidor: Mensagem de processamento do pedido
    Consumidor->>Postgres: Marcar pedido processing / criar tentativa
    Consumidor->>ERP: Enviar requisicao simulada ao ERP
    alt ERP confirma
        ERP-->>Consumidor: confirmed
        Consumidor->>Postgres: Marcar pedido confirmed e consumir reserva
        Consumidor->>Metricas: Registra ERP confirmed + ack da mensagem
    else Falha recuperavel do ERP
        ERP-->>Consumidor: Falha temporaria/timeout
        Consumidor->>Postgres: Marcar retrying + agendar proxima tentativa na outbox
        Consumidor->>Metricas: Registra retry agendado
    else Falha final do ERP
        ERP-->>Consumidor: Falha final
        Consumidor->>Postgres: Marcar failed e liberar reserva uma unica vez
        Consumidor->>Metricas: Registra ERP failed + estoque restaurado
    end
```

Pontos principais:

- O contrato HTTP e assincrono: sucesso retorna `202 Accepted` com `orderId` e status inicial.
- A venda alem do estoque e impedida antes da resposta por update condicional no PostgreSQL.
- A idempotencia protege retries e duplo clique via `Idempotency-Key` mais hash do payload canonico.
- A entrega ao ERP e simulada pelo worker usando outbox e RabbitMQ.
