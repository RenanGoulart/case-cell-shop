<!--
Sync Impact Report
- Alteração de versão: template sem versão -> 1.0.0
- Princípios modificados: nenhum (ratificação inicial)
- Princípios adicionados:
  - I. Simplicidade e Escopo Delimitado
  - II. Especificação Antes da Implementação
  - III. TDD e Integridade dos Testes (INEGOCIÁVEL)
  - IV. Isolamento das Regras de Negócio
  - V. Consistência e Processamento Assíncrono
  - VI. Contrato e Observabilidade
  - VII. Execução e Integrações Simuladas
  - VIII. Uso Responsável de IA
- Seções adicionadas:
  - Escopo Técnico e Restrições
  - Fluxo de Desenvolvimento e Gates de Qualidade
- Seções removidas: seções placeholder do template inicial
- Templates:
  - ✅ atualizado: .specify/templates/plan-template.md
  - ✅ atualizado: .specify/templates/spec-template.md
  - ✅ atualizado: .specify/templates/tasks-template.md
- Comandos Spec Kit:
  - ✅ atualizado: .agents/skills/speckit-specify/SKILL.md
  - ✅ atualizado: .agents/skills/speckit-tasks/SKILL.md
  - ✅ atualizado: .agents/skills/speckit-implement/SKILL.md
- Orientação de execução:
  - ✅ criado: PROMPTS.md
  - ⚠ pendente: README.md não existe e DEVE ser criado antes da conclusão de uma feature
- TODOs posteriores: criar README.md durante a primeira implementação planejada e documentar
  as simplificações de escopo, especialmente a ausência de sincronização entre ERP e banco local
-->
# CaseCellShop Backend Constitution

## Core Principles

### I. Simplicidade e Escopo Delimitado

A solução DEVE implementar apenas o necessário para demonstrar os requisitos do case. Projetos
simples e diretos DEVEM ser preferidos a abstrações prematuras, microsserviços ou infraestrutura
para cenários fora do escopo declarado. Toda decisão que aumente a complexidade DEVE identificar
o requisito concreto atendido e explicar por que uma alternativa mais simples é insuficiente.

Justificativa: este é um case backend com foco definido; complexidade não exigida reduz clareza,
testabilidade e confiança na entrega sem agregar valor demonstrável.

### II. Especificação Antes da Implementação

Toda funcionalidade DEVE começar por uma especificação que defina o comportamento esperado, as
regras de negócio, os cenários de sucesso e erro, os limites de escopo e os critérios de aceite
mensuráveis. Toda mudança de comportamento DEVE começar pela atualização da especificação. Um
defeito de implementação DEVE ser corrigido na implementação; a especificação NÃO DEVE ser
enfraquecida ou reescrita apenas para legitimar um comportamento incorreto.

Justificativa: a especificação é a fonte de intenção e permite rastrear planos, tarefas,
contratos e testes até um resultado acordado.

### III. TDD e Integridade dos Testes (INEGOCIÁVEL)

TDD DEVE ser usado sempre que o comportamento puder ser testado antes da implementação:

1. escrever o teste;
2. confirmar que ele falha pelo motivo esperado;
3. implementar o mínimo necessário para fazê-lo passar;
4. refatorar preservando o comportamento.

Testes NÃO DEVEM ser alterados para acomodar um comportamento que contradiga uma especificação
válida. A cobertura DEVE incluir, quando aplicável, idempotência, concorrência, prevenção de
overselling, reservas e expiração de estoque, cache, outbox transacional, retries, mensagens
duplicadas e processamento assíncrono. Toda exceção ao desenvolvimento test-first DEVE ser
registrada no plano com justificativa concreta e validação compensatória.

Justificativa: os requisitos de maior risco dependem de falhas e concorrência; a integridade dos
testes é necessária para demonstrar correção além do caminho feliz.

### IV. Isolamento das Regras de Negócio

As regras de estoque, reserva, expiração, idempotência e transição de status de pedido DEVEM
permanecer independentes de Fastify, Prisma, banco de dados, cache, fila e ERP simulado. Adapters
de infraestrutura PODEM coordenar persistência e transporte, mas NÃO DEVEM ser proprietários
dessas regras. A separação DEVE permitir testes isolados sem introduzir camadas ou abstrações que
não atendam a um requisito atual.

Justificativa: separar infraestrutura volátil de regras de domínio estáveis facilita o teste do
comportamento crítico e preserva a simplicidade exigida pelo Princípio I.

### V. Consistência e Processamento Assíncrono

O checkout DEVE prevenir overselling por meio de atualização atômica condicional de estoque e
reserva com expiração explícita. Retries, cliques repetidos e mensagens duplicadas NÃO DEVEM
criar pedidos, reservas ou efeitos finais duplicados. O pedido e seu evento de outbox DEVEM ser
persistidos na mesma transação de banco de dados. O processamento da outbox DEVE ser observável,
idempotente e testável, incluindo fluxos de retry e falha.

Justificativa: limites de consistência e entrega duplicada são requisitos centrais do case, não
endurecimento opcional.

### VI. Contrato e Observabilidade

Todo endpoint, schema de sucesso, schema de erro e código HTTP DEVE estar documentado em OpenAPI
e permanecer consistente com o comportamento. Logs estruturados DEVEM incluir `requestId` nos
fluxos HTTP, `correlationId` nos fluxos assíncronos e `orderId` sempre que houver pedido
associado. Cache e processamento assíncrono DEVEM expor métricas aplicáveis de sucesso, falha,
duração, cache hit/miss e retries.

Justificativa: contratos explícitos tornam o serviço verificável, enquanto logs correlacionados
e métricas básicas tornam os fluxos assíncronos e com cache diagnosticáveis.

### VII. Execução e Integrações Simuladas

A solução completa DEVE iniciar por um fluxo simples de Docker Compose. Integrações externas
DEVEM ser simuladas. O ERP simulado DEVE permitir cenários determinísticos de sucesso, falha,
timeout e retry. Autenticação, pagamento, front-end, deploy remoto, integração real com ERP e
sincronização entre ERP e banco local NÃO DEVEM ser implementados. Simplificações e limitações
de escopo DEVEM ser documentadas em `README.md`.

Justificativa: reprodutibilidade local e cenários controlados de falha demonstram o comportamento
exigido sem expandir o case para infraestrutura de produção ou escopo de produto não relacionado.

### VIII. Uso Responsável de IA

Código e documentação produzidos com apoio de IA DEVEM ser revisados quanto à correção,
aderência à especificação, escopo e complexidade antes da aceitação. Prompts relevantes DEVEM ser
registrados em `PROMPTS.md` com data, propósito e artefato ou decisão resultante. Saídas de IA NÃO
DEVEM ignorar a especificação, o ciclo TDD, a revisão ou os gates de qualidade.

Justificativa: IA acelera a entrega, mas não substitui responsabilidade de engenharia nem
evidências de correção.

## Escopo Técnico e Restrições

- A base de implementação DEVE usar Node.js, TypeScript, Fastify, Prisma e Docker Compose.
- O escopo suportado compreende catálogo com cache, checkout assíncrono, controle de estoque por
  atualização atômica condicional, reservas com expiração, idempotência, outbox transacional,
  consulta de status do pedido, observabilidade básica e ERP simulado.
- As escolhas de cache, fila e banco DEVEM ser tão simples quanto os requisitos permitirem e
  DEVEM ser justificadas no plano de implementação.
- A sincronização entre ERP e banco local é intencionalmente excluída. O banco local não é uma
  réplica sincronizada do ERP, e essa limitação DEVE constar em `README.md`.
- Nenhum plano ou tarefa PODE adicionar autenticação, pagamento, front-end, deploy remoto,
  integração real com ERP ou infraestrutura em escala de produção sem emenda constitucional.

## Fluxo de Desenvolvimento e Gates de Qualidade

O trabalho DEVE fluir de `spec.md` para `plan.md`, depois para `tasks.md` e somente então para a
implementação. Cada artefato DEVE rastrear suas decisões até o artefato anterior e esta
constituição.

Antes da implementação, o plano DEVE passar por um Constitution Check que cubra escopo,
simplicidade, isolamento das regras de negócio, limites de consistência, TDD, contratos,
observabilidade, Docker Compose, integrações simuladas, documentação e registro de prompts de IA.
Toda complexidade ou exceção de TDD justificada DEVE ser registrada no plano antes do código.

Uma funcionalidade somente está concluída quando todos os critérios abaixo forem atendidos:

- o comportamento implementado atende à especificação e aos critérios de aceite atuais;
- os testes aplicáveis foram criados pelo ciclo TDD exigido e todos passam;
- o OpenAPI corresponde a cada endpoint, schema de sucesso/erro e código HTTP implementado;
- os logs estruturados e as métricas aplicáveis estão presentes e verificados;
- a solução e os cenários de validação relevantes executam por Docker Compose;
- `README.md`, `PROMPTS.md` e as simplificações de escopo estão atualizados;
- nenhuma complexidade injustificada ou capacidade fora do escopo foi introduzida.

Revisões DEVEM rejeitar mudanças que violem uma regra obrigatória ou que não apresentem
evidências para esses gates de conclusão.

## Governance

Esta constituição governa todas as especificações, planos, tarefas, revisões e decisões de
implementação. Quando outro artefato do projeto entrar em conflito com ela, esta constituição
prevalece.

Emendas DEVEM ser propostas explicitamente, documentar motivação e impacto de migração,
atualizar templates e orientações dependentes e receber aprovação do responsável pelo projeto
antes de entrar em vigor. As versões da constituição seguem versionamento semântico:

- MAJOR para remoção ou redefinição incompatível de princípio ou regra de governança;
- MINOR para novo princípio, nova seção ou obrigação materialmente ampliada;
- PATCH para esclarecimento ou ajuste textual que não altere obrigações.

Toda revisão de especificação e plano DEVE verificar conformidade constitucional. Toda revisão
de implementação DEVE verificar os gates de conclusão e registrar qualquer exceção aprovada. A
conformidade DEVE ser reavaliada após o design e antes de declarar uma funcionalidade concluída.

**Version**: 1.0.0 | **Ratified**: 2026-07-27 | **Last Amended**: 2026-07-27
