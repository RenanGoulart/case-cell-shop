# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Scope Boundaries *(mandatory)*

### In Scope

- [Capability required to demonstrate this feature]

### Out of Scope

- [Explicit non-goal, including constitution exclusions that could otherwise be inferred]

### Simplifications and Limitations

- [Intentional simplification and its externally visible consequence]

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "return the current order status"]
- **FR-002**: System MUST [validation behavior, e.g., "reject invalid quantities"]
- **FR-003**: Clients MUST be able to [key interaction, e.g., "retry checkout safely"]
- **FR-004**: System MUST [data requirement, e.g., "persist related changes atomically"]
- **FR-005**: System MUST [error behavior, e.g., "return a documented stock error"]

*Example of marking unclear requirements:*

- **FR-006**: Stock reservations MUST expire after [NEEDS CLARIFICATION: duration not specified]
- **FR-007**: Idempotency results MUST be retained for [NEEDS CLARIFICATION: window not specified]

### Business Rules

- **BR-001**: [Testable invariant, transition rule, idempotency rule, or consistency boundary]

### Contract and Error Requirements *(include for HTTP or asynchronous interfaces)*

- **CR-001**: [Endpoint or message behavior, success schema, error schema, and status/code]
- **CR-002**: [Duplicate, timeout, retry, or partial-failure behavior]

### Observability Requirements *(include when runtime behavior is involved)*

- **OR-001**: [Required structured log context such as requestId, correlationId, or orderId]
- **OR-002**: [Required success/failure/duration, cache hit/miss, or retry metric]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Dependency on external behavior, e.g., "ERP interactions are provided by the simulator"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
