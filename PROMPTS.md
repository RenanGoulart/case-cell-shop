# AI Prompt Log

## 2026-07-27 — Project constitution

- **Command**: `$speckit-constitution`
- **Purpose**: Establish the governance rules for the CaseCellShop Backend.
- **Prompt summary**: Define eight principles covering bounded scope, specification-first
  development, TDD, domain isolation, checkout consistency and asynchronous processing, OpenAPI
  and observability, Docker Compose with simulated ERP, and responsible AI use. Explicitly
  exclude authentication, payment, front-end, remote deployment, real ERP integration, and
  ERP-to-local-database synchronization.
- **Result**: Ratified `.specify/memory/constitution.md` version 1.0.0 and synchronized the
  dependent Spec Kit templates and commands.

## 2026-07-27 — Catálogo e checkout assíncrono

- **Command**: `$speckit-specify`
- **Purpose**: Especificar o serviço backend principal da CaseCellShop.
- **Prompt summary**: Definir listagem com cache, checkout assíncrono idempotente, proteção contra
  overselling, consulta de status, retries do ERP simulado, rastreabilidade, métricas, OpenAPI e
  erros previsíveis, mantendo autenticação, pagamento, front-end, ERP real e nuvem fora do escopo.
- **Result**: Criada a especificação `specs/001-async-checkout-service/spec.md`.

## 2026-07-27 — Catálogo vazio e idempotência canônica

- **Command**: `$speckit-clarify`
- **Purpose**: Fechar o contrato do catálogo vazio e a comparação idempotente sob concorrência.
- **Prompt summary**: Retornar `204 No Content` sem produtos; canonicalizar payloads ordenando
  propriedades e itens antes da comparação; deduplicar payloads equivalentes e conflitar valores
  diferentes sob a mesma chave, inclusive em requests simultâneos.
- **Result**: Clarificações, cenários, requisitos, regras, contrato, observabilidade, entidades e
  critérios de sucesso atualizados em `specs/001-async-checkout-service/spec.md`.

## 2026-07-27 — Redução concorrente de estoque

- **Command**: `$speckit-clarify`
- **Purpose**: Definir o momento da redução de estoque e o resultado de checkouts concorrentes.
- **Prompt summary**: Reduzir a disponibilidade atomicamente na aceitação do checkout, antes do
  `202 Accepted`; não reduzir novamente na confirmação; restituir uma vez em falha ou expiração.
- **Result**: Cenários, requisitos, regras, entidade, observabilidade e critério concorrente
  atualizados em `specs/001-async-checkout-service/spec.md`.

## 2026-07-27 — Estados e resultados do ERP simulado

- **Command**: `$speckit-clarify`
- **Purpose**: Definir estados do pedido, transições, retries, resultados e timeout do ERP.
- **Prompt summary**: Cada tentativa tem 80% de chance de confirmação; indisponibilidade
  temporária e timeout após 1 minuto permitem retry; indisponibilidade total causa falha
  definitiva. Os demais resultados são distribuídos em 10% temporária, 5% total e 5% timeout.
- **Result**: Cenários, requisitos, regras, observabilidade, entidade e critério de sucesso do
  processamento foram atualizados em `specs/001-async-checkout-service/spec.md`.

## 2026-07-27 — Cache Redis e operação degradada

- **Command**: `$speckit-clarify`
- **Purpose**: Definir expiração, invalidação e fallback do catálogo quando o Redis falhar.
- **Prompt summary**: Tratar o Redis como cache não autoritativo; durante falhas, ignorá-lo e
  consultar o banco local sem bloquear catálogo ou checkout; antes de reabilitar o cache após a
  recuperação, invalidar ou recarregar entradas potencialmente obsoletas.
- **Result**: Cenários, requisitos, regras, contrato, observabilidade, entidade e critérios de
  sucesso atualizados em `specs/001-async-checkout-service/spec.md`.

## 2026-07-27 — Plano técnico do backend

- **Command**: `$speckit-plan`
- **Purpose**: Planejar a implementação do catálogo e checkout assíncrono da CaseCellShop.
- **Prompt summary**: Usar Node.js/TypeScript, Fastify, PostgreSQL/Prisma, Redis cache-aside,
  RabbitMQ, Docker Compose, Vitest, Pino, OpenAPI, métricas e ERP simulado; manter API e worker no
  mesmo repositório com processos separados e regras independentes dos adapters.
- **Result**: Gerados `plan.md`, `research.md`, `data-model.md`, `test-scenarios.md`, contratos
  HTTP/mensagem e `quickstart.md` em `specs/001-async-checkout-service/`.

## 2026-07-27 — Revisão do plano: seed Faker

- **Command**: `$speckit-plan`
- **Purpose**: Adicionar uma massa local representativa ao catálogo sem remover decisões válidas.
- **Prompt summary**: Revisar o plano técnico existente e adicionar seed do banco local com
  `@faker-js/faker` para 50 produtos, preservando conteúdos compatíveis.
- **Result**: Atualizados `plan.md`, `research.md`, `data-model.md`, `test-scenarios.md` e
  `quickstart.md` com geração determinística, execução explícita pelo Prisma, persistência
  não destrutiva, invalidação coerente do cache e testes do seed. Contratos públicos preservados.

## 2026-07-27 — Revisão do plano: ESLint obrigatório

- **Command**: `$speckit-plan`
- **Purpose**: Tornar lint, formatação, typecheck e testes gates objetivos para aprovação de código.
- **Prompt summary**: Configurar ESLint estrito e tipado com Prettier separado, reprovar warnings,
  analisar todo código mantido e exigir `npm run verify` antes de aprovar qualquer alteração.
- **Result**: Atualizados `plan.md`, `research.md`, `test-scenarios.md` e `quickstart.md` com flat
  config, escopo/ignores, scripts, cenários de validação e gate reproduzível pelo Docker Compose.
  Modelo de dados e contratos públicos foram preservados por não sofrerem impacto.
