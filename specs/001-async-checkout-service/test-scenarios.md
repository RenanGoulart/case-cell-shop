# Test Scenarios: Catálogo e Checkout Assíncrono

## TDD Protocol

Para cada cenário comportamental aplicável:

1. escrever o teste e observar falha pelo motivo esperado;
2. implementar o mínimo para passar;
3. refatorar sem mudar o contrato;
4. preservar o teste como regressão.

Relógio, sleeper, RNG e ERP são injetáveis. Testes não aguardam 60 segundos, 5 minutos ou 24 horas
reais. Propriedades do PostgreSQL/RabbitMQ/Redis exigem adapters reais no Compose; mocks não são
evidência de concorrência, atomicidade, TTL, confirm ou redelivery.

## Local Product Seed

| ID      | Level       | Scenario                           | Expected evidence                                                                                               |
| ------- | ----------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| SED-001 | Unit        | Gerar candidatos com seed fixo     | Exatamente 50 produtos determinísticos, únicos e válidos; nomes, preços, moeda e estoque respeitam o modelo.    |
| SED-002 | Unit        | Identidade independente do Faker   | IDs são estáveis por índice e os dois IDs do quickstart ocupam as posições 1 e 2.                               |
| SED-003 | Integration | Executar em banco vazio            | Insere 50 linhas de forma não destrutiva; cache existente continua governado pelo TTL.                          |
| SED-004 | Integration | Reexecutar após consumo de estoque | Permanece com 50 produtos; nenhuma linha ou estoque é sobrescrito e nenhum miss artificial por versão é criado. |
| SED-005 | Integration | Executar em base parcial           | Insere somente os IDs ausentes; renovação de cache continua por TTL/miss.                                       |
| SED-006 | Integration | Produto criado fora do seed        | A linha externa não é removida nem alterada.                                                                    |

## Catalog and Cache

| ID      | Level                | Scenario                            | Expected evidence                                                                                                                 |
| ------- | -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CAT-001 | Contract/E2E         | Catálogo local após seed            | `200`, exatamente 50 entradas em base limpa, schema completo, preço decimal exato e headers de correlação.                        |
| CAT-002 | Contract/Integration | Catálogo vazio                      | `204` e zero bytes de corpo; `[]` pode permanecer em cache.                                                                       |
| CAT-003 | Integration          | Primeiro acesso sem chave Redis     | Query da lista, `SET EX 60`, métrica miss.                                                                                        |
| CAT-004 | Integration          | Segundo acesso com TTL válido       | Retorno Redis direto, métrica hit, conteúdo idêntico e nenhuma consulta ao PostgreSQL.                                            |
| CAT-005 | Integration          | TTL expirado                        | Entrada não é servida; banco recarrega e renova.                                                                                  |
| CAT-006 | Integration          | Checkout enquanto cache está válido | `GET /products` pode retornar snapshot anterior até 60s; checkout continua protegido por PostgreSQL.                              |
| CAT-007 | Unit/Integration     | Redis falha no `GET`                | Circuito abre, PostgreSQL responde `200/204`, métrica error/fallback.                                                             |
| CAT-008 | Integration          | Redis falha no `SET`                | Resposta do banco permanece bem-sucedida; modo degradado.                                                                         |
| CAT-009 | Integration          | Redis falha no `SET`                | Resposta do banco permanece válida; falha é registrada e próxima leitura pode recarregar por miss.                                |
| CAT-010 | Integration          | Redis recupera                      | Cache volta a ser usado pelo TTL normal, sem validação de versão no PostgreSQL.                                                   |
| CAT-011 | Integration          | Redis e PostgreSQL indisponíveis    | `503 CATALOG_UNAVAILABLE` no envelope comum.                                                                                      |
| CAT-012 | Unit/Integration     | Misses simultâneos                  | Single-flight faz uma carga completa por processo; respostas iguais.                                                              |
| CAT-013 | Performance          | Hit vs carga completa               | Carga do banco aplica atraso artificial configurável de 500ms; hit Redis nao aplica esse atraso e fica pelo menos 50% mais rapido |

## Checkout and Stock

| ID      | Level                   | Scenario                                      | Expected evidence                                                                                |
| ------- | ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CHK-001 | Contract                | Payload válido e nova chave                   | `202`, `orderId`, `pending`; resposta abaixo de 1s sem ERP.                                      |
| CHK-002 | Unit/Contract           | Lista vazia, quantidade inválida, campo extra | `400 INVALID_REQUEST`, nenhum efeito.                                                            |
| CHK-003 | Unit/Contract           | Mesmo `productId` repetido                    | `400 INVALID_REQUEST`; canonicalização não agrega itens inválidos.                               |
| CHK-004 | Integration             | Produto inexistente                           | `404 PRODUCT_NOT_FOUND`, transação sem efeitos.                                                  |
| CHK-005 | Integration             | Estoque insuficiente                          | `409 INSUFFICIENT_STOCK`, sem reserva parcial.                                                   |
| CHK-006 | Integration             | Segundo item falha após primeiro update       | Rollback restaura integralmente o primeiro item.                                                 |
| CHK-007 | Integration concorrente | Requests disputam última unidade              | Somente quantidade suportada recebe `202`; estoque nunca negativo.                               |
| CHK-008 | Integration concorrente | Carrinhos com produtos em ordem inversa       | Sem deadlock não tratado; resultado tudo-ou-nada.                                                |
| CHK-009 | Integration             | Aceitação completa                            | Pedido, itens, reserva, idempotência e outbox no mesmo commit; cache não participa da transação. |
| CHK-010 | Integration             | Falha injetada em cada etapa transacional     | Nenhum estado parcial comprometido.                                                              |

## Idempotency

| ID      | Level                   | Scenario                                 | Expected evidence                                                    |
| ------- | ----------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| IDE-001 | Unit                    | Chaves JSON e itens em ordens diferentes | Mesmo JSON canônico e mesmo SHA-256.                                 |
| IDE-002 | Integration             | Mesma chave e mesmo hash sequenciais     | Mesmo pedido/status; sem novo estoque, reserva ou outbox.            |
| IDE-003 | Integration             | Mesma chave com payload diferente        | `409 IDEMPOTENCY_CONFLICT`, nenhum efeito adicional.                 |
| IDE-004 | Integration concorrente | 100 requests, mesma chave/hash           | Um pedido, uma reserva, uma redução e uma outbox.                    |
| IDE-005 | Integration concorrente | Mesma chave, hashes diferentes           | No máximo um vencedor; todos os demais em conflito.                  |
| IDE-006 | Integration             | Proprietário sofre rollback              | Claim não fica órfão; concorrente pode concluir.                     |
| IDE-007 | Integration/Fake clock  | Chave dentro e após 24h                  | Replay dentro da janela; limpeza após vencimento sem excluir pedido. |

## Outbox and RabbitMQ

| ID      | Level                   | Scenario                              | Expected evidence                                                       |
| ------- | ----------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| OUT-001 | Integration             | Commit do checkout                    | Evento tentativa 1 disponível e aderente ao JSON Schema.                |
| OUT-002 | Integration concorrente | Dois publishers reivindicam lote      | IDs disjuntos por `SKIP LOCKED`; lease/token presentes.                 |
| OUT-003 | Integration             | RabbitMQ indisponível/nack/unroutable | Evento não vira `PUBLISHED`; retry de publish não altera tentativa ERP. |
| OUT-004 | Integration             | Publisher confirm                     | `PUBLISHED` somente após confirm e com token atual.                     |
| OUT-005 | Integration             | Queda após confirm e antes do update  | Republicação possível; consumidor neutraliza duplicata.                 |
| OUT-006 | Integration             | Lease expira                          | Outro publisher recupera; retorno do publisher antigo não sobrescreve.  |
| OUT-007 | Integration             | Envelope inválido                     | `nack(requeue=false)` e mensagem em `orders.dead`.                      |
| OUT-008 | Integration             | Queda antes do ack                    | RabbitMQ redelivera; decisão já persistida não duplica efeitos.         |

## Processing, ERP and Retries

| ID      | Level                   | Scenario                                 | Expected evidence                                                          |
| ------- | ----------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| ERP-001 | Unit/E2E                | Resultado forçado `confirmed`            | `pending -> processing -> confirmed`; reserva consumida, sem nova redução. |
| ERP-002 | Unit/E2E                | `temporarily_unavailable`, tentativa < 3 | `processing -> retrying`; exatamente uma outbox futura.                    |
| ERP-003 | Unit/E2E                | Timeout no deadline de 60s               | Resultado `timeout`; retry se permitido.                                   |
| ERP-004 | Unit/E2E                | Resposta chega depois do timeout         | Token/deadline rejeita resposta; nenhuma transição adicional.              |
| ERP-005 | Unit/E2E                | `unavailable`                            | `processing -> failed`, sem retry, restituição única.                      |
| ERP-006 | Unit/E2E                | Temporário/timeout na tentativa 3        | `failed`, código `ERP_RETRIES_EXHAUSTED`, nenhuma tentativa 4.             |
| ERP-007 | Integration concorrente | Duas entregas mesma tentativa            | Uma cria attempt/chama ERP; outra é no-op/ack.                             |
| ERP-008 | Integration             | Mensagem para estado terminal            | No-op/ack, sem chamada ERP ou liberação adicional.                         |
| ERP-009 | Integration/Fake clock  | Retry delay                              | Próxima mensagem não publica antes de 5s e publica depois.                 |
| ERP-010 | Unit estatístico        | RNG seeded, 1.000 tentativas             | Cada taxa a ate 4 pontos percentuais de 80%/10%/5%/5%                      |
| ERP-011 | Integration             | Worker cai durante `PROCESSING`          | Sweep aplica timeout ao deadline e segue regra de retry.                   |

## Reservations

| ID      | Level                   | Scenario                          | Expected evidence                                                                             |
| ------- | ----------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| RSV-001 | Integration/Fake clock  | Reserva atinge 5 minutos          | Pedido falha `RESERVATION_EXPIRED` e estoque é restituído uma vez; cache renova por TTL/miss. |
| RSV-002 | Integration concorrente | Dois expiradores                  | Uma transição `ACTIVE -> EXPIRED` e uma restituição.                                          |
| RSV-003 | Integration concorrente | Confirmação disputa com expiração | Exatamente um estado final; nunca confirmado com reserva expirada.                            |
| RSV-004 | Integration             | Job repete após estado final      | Estoque permanece inalterado.                                                                 |
| RSV-005 | Integration             | Reserva multi-item                | Todos os itens consumidos/restituídos na mesma transação.                                     |

## Status, Contract and Observability

| ID      | Level            | Scenario                  | Expected evidence                                                                                                                      |
| ------- | ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| API-001 | Contract         | Pedido em cada estado     | `200` com enum, `updatedAt` e erro apenas quando aplicável.                                                                            |
| API-002 | Contract         | UUID inválido/inexistente | `400 INVALID_REQUEST` ou `404 ORDER_NOT_FOUND` previsível.                                                                             |
| API-003 | Contract         | Documento gerado          | Paths, headers, schemas, exemplos e códigos equivalem a `contracts/openapi.yaml`.                                                      |
| API-004 | Contract         | Schema de erro            | Todo erro contém `code`, `message`, `requestId`; nenhum detalhe interno.                                                               |
| OBS-001 | Unit/Integration | HTTP sem IDs              | UUIDs gerados, devolvidos e presentes no log JSON.                                                                                     |
| OBS-002 | Unit/Integration | Correlation UUID válido   | Preservado HTTP → Order → Outbox → RabbitMQ → worker.                                                                                  |
| OBS-003 | Integration      | Logs do worker            | `correlationId`, `orderId`, attempt, result e duração.                                                                                 |
| OBS-004 | Unit/Integration | Métricas API/worker       | Hit/miss/fallback, HTTP, publish, process, retry, falha e duração incrementam uma vez.                                                 |
| OBS-005 | Unit             | Cardinalidade             | Nenhuma métrica usa request/correlation/order ID como label.                                                                           |
| OBS-006 | Contract         | `/metrics`                | Content type e formato Prometheus válidos em `3000` e `9091`.                                                                          |
| OBS-007 | Integration      | Metricas de checkout      | Aceite, duracao, replay, conflito, produto inexistente e estoque insuficiente aparecem em `/metrics` sem labels de alta cardinalidade. |
| OBS-008 | Unit/Integration | Trace stub                | `TracePort` no-op e conectado aos pontos planejados, ou README declara explicitamente que o bonus de trace/span nao e reivindicado.    |
| OBS-009 | Documentation    | README operacional        | Dashboard Grafana provisionado, alerta exemplo e runbook curto documentados com metricas existentes da API/worker.                     |

## Static Quality and Approval Gate

| ID      | Level      | Scenario                             | Expected evidence                                                                                                     |
| ------- | ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| QLT-001 | Tooling    | Lint de todo código mantido          | `npm run lint` cobre `src`, `tests`, `prisma`, scripts e configs e termina com zero erros e zero warnings.            |
| QLT-002 | Tooling    | Código gerado e outputs              | `src/generated/prisma`, `node_modules`, `dist` e `coverage` são ignorados; arquivos mantidos pela equipe não são.     |
| QLT-003 | Tooling    | Regra TypeScript dependente de tipos | Uma fixture inválida é detectada por `strictTypeChecked`, comprovando uso do Project Service; a fixture válida passa. |
| QLT-004 | Tooling    | Conflito de formatação               | `npm run format:check` falha sem alterar arquivos; `npm run format` corrige a fixture.                                |
| QLT-005 | Acceptance | Gate completo                        | `npm run verify` executa lint, format check, typecheck e todas as suites, propagando qualquer código de falha.        |
| QLT-006 | Acceptance | Warning do ESLint                    | Um único warning faz o gate falhar por `--max-warnings=0`; não existe baseline permitido.                             |
| QLT-007 | Compose    | Gate reproduzível                    | `docker compose --profile test run --rm test npm run verify` termina com código `0` em ambiente limpo.                |

## Compose Acceptance

| ID      | Scenario                           | Expected evidence                                                                                                 |
| ------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| CMP-001 | `docker compose up --build --wait` | Migrations e seed Faker criam exatamente 50 produtos em base limpa; API e worker iniciam; dependências saudáveis. |
| CMP-002 | Reinício de API                    | Pedido/outbox persistidos; worker continua independente.                                                          |
| CMP-003 | Reinício de worker                 | Mensagens não confirmadas redeliveram; leases abandonados recuperam.                                              |
| CMP-004 | Reinício de RabbitMQ               | Topologia durável e mensagens persistentes permanecem.                                                            |
| CMP-005 | Gate no profile test               | ESLint, Prettier, typecheck, unit, contract, integration e e2e passam em ambiente limpo.                          |

## Completion Evidence

Uma implementação só pode encerrar as tarefas quando:

- todos os cenários aplicáveis acima passam;
- `npm run verify` termina com código `0`, sem warnings do ESLint;
- OpenAPI gerado e contratos versionados não divergem;
- solução e suites executam pelo Compose;
- README registra arquitetura, comandos, ausencia de sincronizacao ERP-banco, dashboard/alerta/runbook operacional e status do bonus de trace/span;
- PROMPTS.md está atualizado;
- qualquer exceção ao TDD possui justificativa no plano e validação compensatória.
