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
oficial, `amqplib`, Pino 10, `@fastify/swagger` 9, `@fastify/swagger-ui` 5, `prom-client` 15 e
`@faker-js/faker` 10.5 para o seed local. Ferramentas de desenvolvimento: ESLint 10.8,
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

**API Contract**: OpenAPI 3.0.3 gerado dos JSON Schemas das rotas Fastify e validado contra
`contracts/openapi.yaml`; contrato operacional separado para métricas do worker

**Observability**: Pino em JSON; `requestId` e `correlationId` nos fluxos HTTP, `correlationId` e
`orderId` no worker; registries Prometheus separados para API e worker; trace real fora do escopo,
com port/stub documentado

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

*GATE: aprovado antes da Phase 0 e reavaliado após a Phase 1.*

| Gate | Status | Evidência no plano |
|------|--------|--------------------|
| Simplicidade e escopo | PASS | Um pacote, uma imagem, API e worker; sem microsserviços, framework de jobs ou capacidades excluídas. |
| Especificação pronta | PASS | A spec define sucessos, erros, concorrência, cache, estados, retries, observabilidade e critérios mensuráveis. |
| TDD e integridade | PASS | Testes começam pelas regras puras e cobrem concorrência real, idempotência, reservas, cache, outbox, duplicatas e worker. |
| Qualidade estática e aprovação | PASS | Flat config tipado, Prettier separado, `--max-warnings=0`, typecheck e todas as suites compõem `npm run verify`, obrigatório para toda alteração de código. |
| Isolamento do negócio | PASS | Domínio e casos de uso dependem de ports; adapters implementam Fastify, Prisma, Redis, RabbitMQ e ERP. |
| Consistência | PASS | Update condicional, claim idempotente único, reserva e outbox pertencem à mesma transação PostgreSQL. |
| Contrato e observabilidade | PASS | JSON Schema/OpenAPI, Pino correlacionado e métricas Prometheus fazem parte dos contratos e testes. |
| Execução e integrações | PASS | Compose inicia aplicação e dependências; ERP é simulado com resultados forçáveis e probabilísticos. |
| Documentação e IA | PASS | Quickstart, README e PROMPTS.md são entregáveis explícitos; simplificações permanecem documentadas. |

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
2. usar JSON Schema como fonte única para validação, serialização e OpenAPI;
3. executar SQL parametrizado via Prisma para update condicional e claims que exigem recursos
   específicos do PostgreSQL;
4. usar entrega pelo menos uma vez com publisher confirms, ack manual e consumidor idempotente;
5. agendar retry de negócio criando novo evento de outbox com `availableAt`, evitando plugin ou
   topologia RabbitMQ de delay;
6. associar a entrada Redis à geração do catálogo persistida no PostgreSQL para impedir reuso de
   cache obsoleto entre os processos de API e worker;
7. gerar 50 produtos locais com `@faker-js/faker`, seed fixa e IDs derivados do índice, inserindo
   somente ausentes para preservar estoque alterado entre reinícios.
8. usar ESLint flat config com análise TypeScript tipada, Prettier separado e um gate único que
   reprova warnings, falhas de formatação, typecheck ou qualquer suite de testes.

## Phase 1: Design

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
removem produtos externos ao seed. Se houver inserções, `CatalogState.version` é incrementada uma
única vez na mesma transação; se nada mudar, a geração permanece igual.

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
   ao registro de idempotência e incrementar a geração do catálogo.
6. Confirmar a transação e responder `202`; Redis e RabbitMQ nunca são chamados dentro dela.
7. Em conflito de chave, consultar o registro comprometido: hash igual retorna o pedido existente;
   hash diferente retorna `409 IDEMPOTENCY_CONFLICT`.

### Cache do catálogo

A entrada única armazena `{ catalogVersion, products }`, inclusive lista vazia, com TTL de 60
segundos. Toda alteração de disponibilidade incrementa `CatalogState.version` na mesma transação.
Em hit, a versão leve do PostgreSQL valida a geração; divergência força miss, carga atual e
substituição. O `DEL` após commit é uma otimização best-effort, não a garantia de correção.

Para tornar o ganho do cache mensuravel no ambiente local, o adapter de catalogo aplica um atraso
artificial configurável de 500ms somente quando carrega produtos do PostgreSQL. Esse atraso imita
latência de produção para demonstração/teste, nao e regra de negocio e nunca e aplicado no caminho
de hit Redis.

Erro de Redis abre um circuit breaker local: enquanto degradado, a listagem consulta PostgreSQL.
Na recuperação, a aplicação obtém a geração atual e remove ou substitui a entrada antes de fechar
o circuito. Se PostgreSQL falhar, uma entrada Redis ainda dentro do TTL pode ser usada; sem fonte
acessível, retorna `503 CATALOG_UNAVAILABLE`.

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

Fastify gera/valida `requestId` e `correlationId`, devolve ambos em headers e persiste a correlação
na outbox. Pino usa child loggers. API e worker têm registries Prometheus independentes; IDs de
alta cardinalidade nunca são labels. `/metrics` da API e do worker são contratos operacionais.
Um `TracePort` no-op documentado preserva o ponto de extensão sem instalar OpenTelemetry.

## Test Strategy

Todo comportamento aplicável segue RED → GREEN → REFACTOR. Os testes unitários vêm antes dos
adapters; testes de integração vêm antes do código SQL/conectores; contratos vêm antes das rotas.

- **Unit**: gerador Faker com 50 produtos deterministicos e validos, canonicalizacao/hash, rejeicao
  de duplicados, estados, retry, timeout, expiracao, distribuição com RNG seeded de 1.000 tentativas
  e tolerância de 4 pontos percentuais, cache circuit breaker e decisoes idempotentes.
- **Contract**: todos os status/corpos/headers, `204` sem corpo, erro uniforme, OpenAPI completo e
  schemas das mensagens.
- **Integration**: seed inicial/repetido/parcial sem reset de estoque, constraint da chave,
  requests simultâneos, rollback multi-item, estoque nunca negativo, geração de catálogo, Redis
  hit/miss/falhas, outbox e claims concorrentes, confirms, redelivery e DLQ.
- **End-to-end**: `202` imediato, progressão do pedido, três tentativas, timeout/resultado tardio,
  falha definitiva, restituição única e rastreabilidade HTTP → outbox → mensagem → worker.

Relógio, sleeper, RNG e ERP são injetados para evitar testes reais de 60 segundos ou 5 minutos.
Ao menos um teste concorrente usa PostgreSQL real; mocks não são aceitos como prova de
atomicidade ou prevenção de overselling.

Antes de qualquer aprovação, `npm run verify` deve comprovar, nessa ordem, ESLint sem warnings,
formatação Prettier, `tsc --noEmit` e todas as suites. Testes isolados continuam úteis durante TDD,
mas não substituem o gate completo. Mudanças somente documentais podem usar os checks aplicáveis;
qualquer alteração em `.ts`, `.js`, `.mjs`, dependências ou configuração de build/teste é alteração
de código para esse gate.

## Post-Design Constitution Check

**PASS**. O modelo em [data-model.md](./data-model.md), a matriz em
[test-scenarios.md](./test-scenarios.md), os contratos em [contracts/](./contracts/) e o fluxo de
validação em [quickstart.md](./quickstart.md) preservam todos os gates. A geração do
catálogo adiciona uma única linha/tabela de metadados; essa complexidade é justificada pela regra
que proíbe reusar cache obsoleto quando API e worker são processos separados. Faker permanece
restrito à preparação local, com seed determinística e insert não destrutivo; não altera regras de
negócio nem contratos. O gate ESLint/Prettier/typecheck/testes adiciona somente configuração e
scripts locais, cobre todo código mantido pela equipe e torna explícita a evidência já exigida para
aprovação. Não há outra violação constitucional.

## Complexity Tracking

Nenhuma violação constitucional requer exceção.
