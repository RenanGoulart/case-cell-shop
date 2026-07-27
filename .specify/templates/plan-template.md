# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Node.js [version] with TypeScript [version or NEEDS CLARIFICATION]

**Primary Dependencies**: Fastify, Prisma, [minimal cache/queue dependencies or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [Node.js test framework and integration test approach or NEEDS CLARIFICATION]

**Target Platform**: Linux containers orchestrated by Docker Compose

**Project Type**: Backend web service

**API Contract**: [OpenAPI artifact and validation approach or N/A with justification]

**Observability**: [structured log fields and applicable metrics]

**Local Execution**: [Docker Compose services and validation command]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

**Scope Exclusions**: [explicit non-goals and documented simplifications]

## Constitution Check

*GATE: MUST pass before Phase 0 research and MUST be re-checked after Phase 1 design.*

- **Simplicity and scope**: Every component maps to a concrete requirement; rejected simpler
  alternatives are recorded for any added complexity; no excluded capability is introduced.
- **Specification readiness**: Success and error scenarios, business rules, acceptance criteria,
  assumptions, and scope boundaries are complete and testable.
- **TDD and test integrity**: The plan defines test-first coverage and a red-failure checkpoint
  for applicable behavior, including idempotency, concurrency, overselling, reservations,
  cache, outbox, retries, duplicates, and asynchronous processing where relevant.
- **Business-rule isolation**: Stock, reservation, expiration, idempotency, and status rules are
  independently testable without framework or infrastructure dependencies.
- **Consistency**: Atomic stock updates, expiring reservations, transaction boundaries,
  idempotency keys, and duplicate-message behavior are explicit where applicable.
- **Contract and observability**: OpenAPI success/error contracts and HTTP codes are planned;
  logs include required correlation fields; applicable metrics cover outcomes and duration.
- **Execution and integrations**: The feature runs through Docker Compose; external integrations
  are simulated with success, failure, timeout, and retry scenarios as applicable.
- **Documentation and AI**: README simplifications and relevant PROMPTS.md entries are planned.

Any failed gate MUST be resolved before implementation or documented in Complexity Tracking with
a constitutionally valid justification.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── domain/
├── application/
├── infrastructure/
├── http/
└── workers/

prisma/

tests/
├── unit/
├── contract/
└── integration/
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
