# GET /products

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente/Postman
    participant API as API Fastify
    participant Rota as Rota de Produtos
    participant CasoUso as ListProductsUseCase
    participant Cache as RedisCatalogCache
    participant Redis as Redis
    participant Repo as PrismaCatalogRepository
    participant Postgres as PostgreSQL
    participant Metricas as Metricas Prometheus

    Cliente->>API: GET /products<br/>x-request-id, x-correlation-id
    API->>Rota: Valida headers e contexto da requisicao
    Rota->>CasoUso: execute()
    CasoUso->>Cache: Ler snapshot de produtos
    Cache->>Redis: GET casecellshop:v1:products

    alt Cache hit
        Redis-->>Cache: Snapshot de produtos em cache
        Cache-->>CasoUso: hit(products)
        CasoUso->>Metricas: Registra cache hit
        CasoUso-->>Rota: 200, source=cache, products
    else Cache miss
        Redis-->>Cache: Chave ausente
        Cache-->>CasoUso: miss
        CasoUso->>Metricas: Registra cache miss
        CasoUso->>Repo: Listar produtos
        Repo->>Postgres: SELECT products
        Postgres-->>Repo: Linhas de produtos
        Repo-->>CasoUso: Produtos
        CasoUso->>Cache: Gravar snapshot com TTL
        Cache->>Redis: SET key EX ttlSeconds
        CasoUso-->>Rota: 200/204, source=database
    else Falha no Redis
        Redis--xCache: Erro
        Cache-->>CasoUso: Cache indisponivel
        CasoUso->>Metricas: Registra falha Redis + fallback banco
        CasoUso->>Repo: Listar produtos
        Repo->>Postgres: SELECT products
        Repo-->>CasoUso: Produtos
        CasoUso-->>Rota: 200/204, source=database_fallback
    end

    Rota-->>API: Resposta + x-catalog-source quando 200
    API-->>Cliente: 200 produtos, 204 vazio ou 503 error envelope
```

Pontos principais:

- O Redis conecta durante a inicializacao da API e permanece aberto durante a vida da aplicacao.
- O Redis atua apenas como cache-aside; o PostgreSQL continua sendo a fonte autoritativa.
- Um hit valido no Redis ignora o atraso artificial do PostgreSQL e retorna `x-catalog-source: cache`.
