# Implementation Plan: Catálogo e Checkout Assíncrono

**Branch**: `001-async-checkout-service` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-async-checkout-service/spec.md`

## Summary

Implementar um backend modular único em Node.js e TypeScript, com Fastify para a API e um worker
separado no mesmo repositório. PostgreSQL/Prisma preservam pedidos, idempotência, estoque,
reservas, tentativas e outbox; Redis acelera o catálogo sem se tornar fonte autoritativa; RabbitMQ
transporta trabalho persistido pela outbox; o ERP permanece um client simulado, configurável e
testável. As regras de domínio não dependem de Fastify, Prisma, Redis, RabbitMQ ou do simulador.

## Technical Context

**Language/Version**: Node.js 24 LTS com TypeScript 6.0, ESM e configuração estrita

**Primary Dependencies**: Fastify 5, Prisma ORM 7 com `@prisma/adapter-pg`, `pg`, cliente Redis
oficial, `amqplib`, Pino 10, `@fastify/swagger` 9, `@fastify/swagger-ui` 5, `@fastify/type-provider-zod`, Zod 4,
`prom-client` 15 e `@faker-js/faker` 10.5 para o seed local. Ferramentas de desenvolvimento: ESLint 10.8,
`@eslint/js` 10.8, `typescript-eslint` 8.65, `globals` 17, Prettier 3.9 e
`eslint-config-prettier` 10; versões exatas permanecem fixadas pelo lockfile

**Storage**: PostgreSQL 18 como fonte autoritativa; Redis 8 como cache não autoritativo com TTL;
RabbitMQ 4.2 como transporte assíncrono

**Testing**: Vitest 4; unitários sem infraestrutura, contratos via `fastify.inject()`, integração
contra PostgreSQL/Redis/RabbitMQ reais do Compose e cenários end-to-end controlados. Toda alteração
de código exige `npm run verify` aprovado, reunindo lint, formatação, typecheck e todos os testes

**Target Platform**: Containers Linux AMD64/ARM64 orquestrados por Docker Compose

**Project Type**: Backend web service modular, um pacote e uma imagem, com processos `api` e
`worker` separados

**API Contract**: OpenAPI 3.0.3 gerado a partir dos schemas Zod reutilizados nas rotas
Fastify sempre que possível, incluindo entradas, respostas de sucesso e erros documentados, e
validado contra `contracts/openapi.yaml`; contrato operacional separado para métricas do worker

**Observability**: Pino em JSON; `requestId` e `correlationId` nos fluxos HTTP, `correlationId` e
`orderId` no worker; registries Prometheus separados para API e worker; trace real fora do escopo,
com port/stub documentado. A entrega deve fechar as lacunas identificadas na auditoria: logs HTTP
devem anexar `correlationId` ao contexto estruturado, as metricas de checkout declaradas devem ser
emitidas no fluxo real, o stub de trace deve ser conectado aos pontos planejados, e o README deve apontar o Grafana
local, o dashboard provisionado, alertas exemplo e runbook usando as metricas Prometheus
coletadas da API e do worker

**Local Execution**: Uma imagem da aplicação usada pelos serviços `api`, `worker` e `migrate`;
`migrate` aplica migrations e executa explicitamente o seed Faker antes da API/worker, além de
PostgreSQL, Redis e RabbitMQ no `docker compose up --build`

**Performance Goals**: 95% dos checkouts validos respondem `202` em ate 1 segundo sem aguardar o
ERP; em validação local, a carga do catalogo a partir do banco aplica atraso artificial
configurável de 500ms para imitar latência de produção, enquanto hit valido no Redis nao aplica
esse atraso e deve ser pelo menos 50% mais rapido; timeout de cada tentativa do ERP em 60 segundos

**Constraints**: TTL do catalogo 60 segundos; atraso artificial configurável de 500ms somente no
caminho local de banco do catalogo para validação de cache; idempotencia 24 horas; reserva 5
minutos; no maximo 3 tentativas do ERP; atraso fixo configurável de 5 segundos entre tentativas;
transacoes sem chamadas de rede; estoque nunca negativo; resposta tardia do ERP ignorada; teste
probabilístico local do ERP com 1.000 tentativas seeded e tolerância de 4 pontos percentuais; ESLint
com zero erros e zero warnings antes de aprovacao

**Scale/Scope**: Case local de demonstração com 50 produtos gerados deterministicamente no seed,
um estoque lógico e uma moeda; uma instância de API e uma de worker por padrão, preservando
correção com consumidores ou publicadores concorrentes sem projetar alta disponibilidade

**Scope Exclusions**: Autenticação, pagamento, front-end, deploy remoto, ERP real, sincronização
ERP–banco local, múltiplos estoques, trace distribuído real e infraestrutura de produção

Não existem itens `NEEDS CLARIFICATION` após a pesquisa da Phase 0.

## Constitution Check

_GATE: aprovado antes da Phase 0 e reavaliado após a Phase 1._

| Gate                           | Status | Evidência no plano                                                                                                                                          |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simplicidade e escopo          | PASS   | Um pacote, uma imagem, API e worker; sem microsserviços, framework de jobs ou capacidades excluídas.                                                        |
| Especificação pronta           | PASS   | A spec define sucessos, erros, concorrência, cache, estados, retries, observabilidade e critérios mensuráveis.                                              |
| TDD e integridade              | PASS   | Testes começam pelas regras puras e cobrem concorrência real, idempotência, reservas, cache, outbox, duplicatas e worker.                                   |
| Qualidade estática e aprovação | PASS   | Flat config tipado, Prettier separado, `--max-warnings=0`, typecheck e todas as suites compõem `npm run verify`, obrigatório para toda alteração de código. |
| Isolamento do negócio          | PASS   | Domínio e casos de uso dependem de ports; adapters implementam Fastify, Prisma, Redis, RabbitMQ e ERP.                                                      |
| Consistência                   | PASS   | Update condicional, claim idempotente único, reserva e outbox pertencem à mesma transação PostgreSQL.                                                       |
| Contrato e observabilidade     | PASS   | Zod/OpenAPI, Pino correlacionado e métricas Prometheus fazem parte dos contratos e testes.                                                                  |
| Execução e integrações         | PASS   | Compose inicia aplicação e dependências; ERP é simulado com resultados forçáveis e probabilísticos.                                                         |
| Documentação e IA              | PASS   | Quickstart, README e PROMPTS.md são entregáveis explícitos; simplificações permanecem documentadas.                                                         |

### Delivery Audit Follow-up

A revisao da implementacao existente nao altera as decisoes aprovadas acima, mas torna explicitas
as pendencias necessarias para que a entrega observe todos os requisitos de avaliacao:

| Area                 | Pendencia planejada                                                                                                                                             | Evidencia esperada                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logs HTTP            | Garantir que logs estruturados do fluxo HTTP incluam `requestId` e `correlationId` no contexto do logger, preservando `orderId` quando houver pedido associado. | Teste de integracao ou contrato que capture log emitido por rota HTTP e valide os campos sem registrar payload sensivel.                          |
| Metricas de checkout | Emitir no fluxo real as metricas de aceite, duracao e rejeicoes de checkout, alem das metricas de idempotencia ja planejadas.                                   | `/metrics` deve expor contadores/histograma apos cenarios de checkout aceito, replay, conflito, produto inexistente ou estoque insuficiente.      |
| Trace stub           | Conectar `TracePort` no-op aos limites request, cache, repositorio/outbox e worker para reivindicar o bonus de trace/span como stub.                            | Teste unitario do port/stub conectado aos limites planejados e README sem sugerir trace distribuido real.                                         |
| README operacional   | Adicionar Grafana local com dashboard provisionado, datasource Prometheus, alerta exemplo e runbook operacional.                                                | README contendo URL do Grafana, dashboard provisionado, paineis, consultas, alerta exemplo e procedimento de resposta usando metricas existentes. |

## Project Structure

### Documentation (this feature)

```text
specs/001-async-checkout-service/
├── plan.md
├── research.md
├── data-model.md
├── test-scenarios.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   ├── worker-openapi.yaml
│   └── order-processing-message.schema.json
└── tasks.md                         # criado somente por /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── app.ts                       # builder testável sem abrir socket
│   ├── main.ts
│   ├── plugins/
│   └── routes/
├── worker/
│   ├── main.ts
│   ├── outbox-publisher.ts
│   ├── order-consumer.ts
│   ├── reservation-expirer.ts
│   └── recovery-sweeper.ts
├── modules/
│   ├── catalog/
│   │   ├── domain/
│   │   ├── application/
│   │   └── ports/
│   └── orders/
│       ├── domain/
│       ├── application/
│       └── ports/
├── adapters/
│   ├── database/
│   ├── cache/
│   ├── messaging/
│   └── erp/
├── observability/
├── config/
├── generated/prisma/
└── shared/
prisma/
├── schema.prisma
├── migrations/
└── seed.ts                         # 50 produtos locais com Faker e insert idempotente
tests/
├── unit/
├── contract/
├── integration/
├── e2e/
└── helpers/
Dockerfile
docker-compose.yml
eslint.config.mjs
.prettierrc.json
.prettierignore
prisma.config.ts
package.json
tsconfig.json
vitest.config.ts
```

**Structure Decision**: organização feature-first para catálogo e pedidos, com domínio,
aplicação e ports próximos. Adapters compartilhados ficam em `src/adapters`; dois entrypoints usam
os mesmos casos de uso e a mesma imagem. Não haverá workspaces, pacotes internos ou repositórios
separados.

## Phase 0: Research Decisions

As decisões e alternativas estão consolidadas em [research.md](./research.md). Os pontos que
orientam o design são:

1. usar Node 24 LTS e dependências em majors compatíveis, fixadas por lockfile;
2. usar Zod como fonte primária para validar variáveis de ambiente, entradas HTTP e schemas de resposta, reutilizando esses schemas na geração OpenAPI sempre que possível;
3. executar SQL parametrizado via Prisma para update condicional e claims que exigem recursos
   específicos do PostgreSQL;
4. usar entrega pelo menos uma vez com publisher confirms, ack manual e consumidor idempotente;
5. agendar retry de negócio criando novo evento de outbox com `availableAt`, evitando plugin ou
   topologia RabbitMQ de delay;
6. retornar diretamente a entrada Redis enquanto ela estiver dentro do TTL, sem consulta leve ao
   PostgreSQL para validar versão; miss, expiração ou payload inválido carregam PostgreSQL e renovam
   o cache. Invalidação ativa só será considerada se houver sincronização ERP-banco local, fora do
   escopo atual;
7. gerar 50 produtos locais com `@faker-js/faker`, seed fixa e IDs derivados do índice, inserindo
   somente ausentes para preservar estoque alterado entre reinícios.
8. usar ESLint flat config com análise TypeScript tipada, Prettier separado e um gate único que
   reprova warnings, falhas de formatação, typecheck ou qualquer suite de testes.

## Phase 1: Design

### Validação de configuração e contratos com Zod

A aplicação valida todas as variáveis de ambiente durante a inicialização usando Zod. Variáveis
obrigatórias ausentes, URLs inválidas, portas fora do intervalo, probabilidades fora de `0..1` ou
valores incompatíveis com enums fazem API, worker, migrate ou test falharem imediatamente com erro
descritivo, antes de abrir socket, conectar workers ou executar fluxos de negócio. Defaults locais
continuam permitidos somente quando documentados em `.env.example` e no quickstart.

As entradas HTTP são definidas e validadas com Zod. Os mesmos schemas Zod devem ser reutilizados na
geração dos contratos OpenAPI sempre que a integração Fastify/Swagger permitir; quando uma conversão
for necessária, o schema convertido deve ser derivado do Zod, não reescrito manualmente. Respostas de
sucesso e envelopes de erro também possuem schemas documentados, incluindo headers de correlação e
códigos HTTP. O contrato versionado de mensagem assíncrona permanece publicado como JSON Schema em
`contracts/order-processing-message.schema.json`, derivado ou validado contra a definição Zod
correspondente.

### Gate estático e aprovação de código

`eslint.config.mjs` usa `@eslint/js`, `typescript-eslint` e `globals.nodeBuiltin` para ESM em
Node.js. Arquivos TypeScript de `src/`, `tests/`, `prisma/`, scripts e configurações estendem
`strictTypeChecked` e `stylisticTypeChecked`, com `parserOptions.projectService` e
`tsconfigRootDir = import.meta.dirname` para usar os mesmos projetos TypeScript do editor e do
`tsc`. O Project Service permite somente o glob raiz `*.config.ts` como default project para
configurações fora do `include`; arquivos JavaScript/MJS recebem regras recomendadas sem typecheck.

Os ignores ficam no próprio flat config: `node_modules/**`, `dist/**`, `coverage/**` e
`src/generated/prisma/**`. Código-fonte, testes, seed e configurações escritas pela equipe não
podem ser ignorados. Diretivas `eslint-disable` exigem descrição e não podem substituir correção de
um erro válido; qualquer exceção de regra deve ser localizada e justificada na revisão.
`reportUnusedDisableDirectives` e `reportUnusedInlineConfigs` ficam em `error` para impedir
supressões ou configurações inline obsoletas.

Prettier permanece uma ferramenta separada: `.prettierrc.json` define o formato,
`.prettierignore` exclui dependências, outputs e código gerado, e `eslint-config-prettier/flat` é
aplicado por último para desligar somente regras conflitantes. Não será usado `eslint-plugin-prettier`,
evitando executar o formatador dentro do linter.

Scripts planejados: `lint` executa `eslint . --max-warnings=0`; `lint:fix` adiciona `--fix` sem
alterar o comportamento do gate; `format` executa `prettier --write .`; `format:check` executa
`prettier --check .`; `typecheck` executa `tsc --noEmit`; `test` executa todas as suites Vitest; e
`verify` encadeia `lint`, `format:check`, `typecheck` e `test`. Toda alteração de código só pode ser
aprovada quando `npm run verify` termina com código `0`; não há baseline de débitos ou warnings
aceitos. O mesmo comando roda no serviço `test` do Docker Compose para evidência reproduzível.

### Seed local do catálogo

`prisma/seed.ts` usa `fakerPT_BR` com seed fixa `20260727` para produzir exatamente 50 candidatos.
O Faker gera nome, preço em centavos e disponibilidade; moeda permanece `BRL`. IDs são derivados
do índice e independem da sequência interna do Faker, preservando os dois IDs usados pelo
quickstart. Nomes são normalizados e limitados a 160 caracteres; preços ficam entre `25.00` e
`5000.00`, com duas casas; disponibilidade fica entre 10 e 100.

O seed executa numa transação `createMany({ skipDuplicates: true })`. A primeira execução insere
50 produtos; repetições não atualizam registros existentes, não restauram estoque consumido e não
removem produtos externos ao seed. Se houver inserções, entradas Redis existentes expiram pelo TTL
normal de 60 segundos; o seed não introduz validação de versão por leitura no PostgreSQL.

Prisma 7 não executa seed automaticamente com migrations. O `prisma.config.ts` registra
`tsx prisma/seed.ts`, e o serviço one-shot `migrate` chama `prisma migrate deploy` seguido de
`prisma db seed` antes de liberar API e worker. Faker e `tsx` permanecem disponíveis nessa imagem
local; o seed não roda no bootstrap HTTP.

### Checkout transacional

1. Validar contrato, rejeitar produtos repetidos e gerar SHA-256 do JSON canônico.
2. Iniciar transação PostgreSQL curta em `READ COMMITTED`.
3. Reivindicar `idempotencyKey` com `INSERT ... ON CONFLICT DO NOTHING`.
4. Para o proprietário da chave, carregar os produtos, ordenar os IDs e executar para cada item
   `UPDATE ... SET available_quantity = available_quantity - quantity WHERE available_quantity >= quantity RETURNING ...`.
5. Criar pedido, snapshots dos itens, reserva ativa, itens da reserva e outbox; associar o pedido
   ao registro de idempotência. O cache do catálogo não é invalidado nessa transação no escopo atual.
6. Confirmar a transação e responder `202`; Redis e RabbitMQ nunca são chamados dentro dela.
7. Em conflito de chave, consultar o registro comprometido: hash igual retorna o pedido existente;
   hash diferente retorna `409 IDEMPOTENCY_CONFLICT`.

### Cache do catálogo

A entrada única armazena `{ products }`, inclusive lista vazia, com TTL de 60 segundos. Em hit, a
API retorna diretamente o payload válido do Redis e não executa `SELECT` no PostgreSQL para validar
versão, geração ou disponibilidade. Miss, expiração, payload inválido ou Redis indisponível carregam
PostgreSQL e atualizam o cache com `SET EX` quando possível. O cache pode refletir um snapshot de até
60 segundos; isso é aceito para listagem porque checkout não usa Redis como autoridade de estoque.
Invalidação ativa após alterações de produtos ou disponibilidade só faria sentido com uma
sincronização ERP-banco local, que não será implementada nesta feature.

Para tornar o ganho do cache mensuravel no ambiente local, o adapter de catalogo aplica um atraso
artificial configurável de 500ms somente quando carrega produtos do PostgreSQL. Esse atraso imita
latência de produção para demonstração/teste, nao e regra de negocio e nunca e aplicado no caminho
de hit Redis.

Erro de Redis abre um circuit breaker local: enquanto degradado, a listagem consulta PostgreSQL.
Na recuperação, a aplicação volta a tentar Redis normalmente, sem consulta de versão no PostgreSQL.
Se PostgreSQL falhar durante miss ou modo degradado e não houver cache acessível dentro do TTL,
retorna `503 CATALOG_UNAVAILABLE`.

### Outbox e RabbitMQ

O worker reivindica pequenos lotes da outbox com `FOR UPDATE SKIP LOCKED`, lease e `lockToken`,
faz commit do claim, publica mensagem persistente e obrigatoriamente roteável, espera publisher
confirm e só então marca `PUBLISHED`. Confirmação perdida pode republicar; isso é esperado.

RabbitMQ usa exchange direct e fila classic duráveis, mensagem persistente, `prefetch=1`, ack
manual e DLQ apenas para envelopes inválidos. Falha de publicação mantém o evento pendente. Retry
temporário do ERP não usa `nack/requeue`: a transação do resultado muda o pedido para `retrying` e
cria exatamente um novo evento de outbox com `availableAt = now + 5s`.

### Consumidor e ERP simulado

Uma constraint única `(orderId, attemptNumber)` e transições condicionais fazem apenas um
consumidor iniciar cada tentativa. `processingToken` e deadline impedem resposta tardia de alterar
o pedido. O ack ocorre depois do commit do resultado. Um sweep recupera tentativas abandonadas e
reservas expiradas. O client ERP recebe relógio e gerador aleatório injetáveis, oferece modos
forçados e distribuição 80/10/5/5, e não representa uma integração externa real.

### Observabilidade

Fastify usa schemas Zod para validar headers de correlação, entradas e respostas HTTP documentadas.
O erro de validação é traduzido para o envelope uniforme antes do log/metrics. Fastify gera/valida
`requestId` e `correlationId`, devolve ambos em headers e persiste a correlação
na outbox. Pino usa child loggers. API e worker têm registries Prometheus independentes; IDs de
alta cardinalidade nunca são labels. `/metrics` da API e do worker são contratos operacionais.
Um `TracePort` no-op documentado preserva o ponto de extensão sem instalar OpenTelemetry.

A atualizacao da entrega deve preservar essa decisao e acrescentar apenas o necessario para cobrir
os requisitos pendentes: o logger HTTP deve receber child context com `requestId` e `correlationId`
em cada request; rotas de checkout devem registrar metricas de aceite, duracao e rejeicoes sem usar
IDs como labels; o worker deve continuar registrando `orderId` e `correlationId`; e o README deve
documentar o dashboard Grafana provisionado, consultas Prometheus, um alerta exemplo e um runbook
curto para cache degradado ou falhas de processamento. O `TracePort` permanece no-op e deve ser
conectado aos spans planejados de request HTTP, leitura/escrita de cache, chamada ao
repositorio/outbox e consumo do worker para reivindicar o bonus de trace/span sem sugerir tracing
distribuido real.

## Test Strategy

Todo comportamento aplicável segue RED → GREEN → REFACTOR. Os testes unitários vêm antes dos
adapters; testes de integração vêm antes do código SQL/conectores; contratos vêm antes das rotas.

- **Unit**: gerador Faker com 50 produtos deterministicos e validos, canonicalizacao/hash, rejeicao
  de duplicados, estados, retry, timeout, expiracao, distribuição com RNG seeded de 1.000 tentativas
  e tolerância de 4 pontos percentuais, cache circuit breaker e decisoes idempotentes.
- **Contract**: todos os status/corpos/headers, `204` sem corpo, erro uniforme, schemas Zod de
  entrada e resposta reutilizados no OpenAPI, e schemas das mensagens.
- **Integration**: seed inicial/repetido/parcial sem reset de estoque, constraint da chave,
  requests simultâneos, rollback multi-item, estoque nunca negativo, Redis hit direto sem SELECT no
  PostgreSQL, miss/TTL/falhas, outbox e claims concorrentes, confirms, redelivery e DLQ.
- **End-to-end**: `202` imediato, progressão do pedido, três tentativas, timeout/resultado tardio,
  falha definitiva, restituição única e rastreabilidade HTTP → outbox → mensagem → worker.

Relógio, sleeper, RNG e ERP são injetados para evitar testes reais de 60 segundos ou 5 minutos.
Ao menos um teste concorrente usa PostgreSQL real; mocks não são aceitos como prova de
atomicidade ou prevenção de overselling.

- **Delivery audit follow-up**: testes devem cobrir log HTTP com `requestId` e `correlationId`,
  metricas de checkout aceito/replay/conflito/rejeicoes em `/metrics`, ausencia de IDs como labels,
  comportamento do `TracePort` no-op conectado aos limites planejados, e presenca no README de
  dashboard, alerta e runbook Grafana/Prometheus equivalente.

Antes de qualquer aprovação, `npm run verify` deve comprovar, nessa ordem, ESLint sem warnings,
formatação Prettier, `tsc --noEmit` e todas as suites. Testes isolados continuam úteis durante TDD,
mas não substituem o gate completo. Mudanças somente documentais podem usar os checks aplicáveis;
qualquer alteração em `.ts`, `.js`, `.mjs`, dependências ou configuração de build/teste é alteração
de código para esse gate.

## Post-Design Constitution Check

**PASS**. O modelo em [data-model.md](./data-model.md), a matriz em
[test-scenarios.md](./test-scenarios.md), os contratos em [contracts/](./contracts/) e o fluxo de
validação em [quickstart.md](./quickstart.md) preservam todos os gates. A simplificação do cache evita uma consulta ao PostgreSQL em todo hit e preserva o objetivo de
velocidade da listagem. O trade-off de snapshot por até 60 segundos está documentado e é aceitável
porque o checkout decide estoque no PostgreSQL com update atômico. Faker permanece restrito à
preparação local, com seed determinística e insert não destrutivo; não altera regras de negócio nem
contratos. O gate ESLint/Prettier/typecheck/testes adiciona somente configuração e
scripts locais, cobre todo código mantido pela equipe e torna explícita a evidência já exigida para
aprovação. Não há outra violação constitucional.

A reavaliacao pos-auditoria permanece PASS para o plano, sem excecao constitucional nova. A entrega,
contudo, somente pode ser declarada concluida quando as evidencias de logs HTTP correlacionados,
metricas reais de checkout, trace stub conectado, e README operacional com Grafana provisionado,
dashboard/alerta/runbook estiverem presentes.

## Complexity Tracking

Nenhuma violação constitucional requer exceção.
