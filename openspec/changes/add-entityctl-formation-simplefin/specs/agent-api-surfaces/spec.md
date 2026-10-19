## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R42 Deliver matching mobile-first, desktop, and programmatic surfaces
Priority: P0. Source: OpenPRD 0001 R42.

The system SHALL expose the same capability and approval model through a mobile-first responsive PWA, desktop-browser experience, CLI, REST API, TypeScript SDK, and MCP. The CLI SHALL support readable output and JSON, stable exit/error codes, resumable operation IDs, and a dry-run mode for plans. An installable PWA is the V1 desktop surface; native desktop packaging is not required. An unavailable feature SHALL be unavailable consistently across every client, not merely hidden from one UI.

#### Scenario: R42-S1 Policy parity across surfaces
- **WHEN** the same scoped actor performs equivalent PWA, desktop, CLI, REST, SDK and MCP operations
- **THEN** all observe the same availability, approvals, durable status and next action with typed errors and no UI-only gate

#### Scenario: R42-S2 Accessible resumable preview
- **WHEN** a user saves a draft on mobile, resumes on desktop or requests CLI JSON/dry-run output
- **THEN** the same operation is resumed with keyboard-accessible visible statuses, stable JSON/error/exit contracts and no external side effects; offline caching excludes sensitive data

### Requirement: R43 Use scoped authorization and safe API contracts
Priority: P0. Source: OpenPRD 0001 R43.

APIs SHALL authenticate actor and workspace, enforce entity-scoped read/write permissions, validate typed inputs, and expose stable operation statuses. Consequential mutations SHALL require idempotency and applicable approval references. Integrations SHALL use short-lived/scoped credentials where the deployed identity system supports them; cross-service calls SHALL not use broad human administrator tokens. MCP tools SHALL distinguish read, draft, approve-request, and submit actions and return approval instructions without leaking sensitive payloads. User authentication is not a substitute for legal signing authority.

#### Scenario: R43-S1 Scoped operation access
- **WHEN** an authenticated integration tries to read or mutate an entity outside its authorized workspace/entity scope
- **THEN** the server denies access before returning operation/evidence data, and cross-service identity is scoped rather than a broad human admin token

#### Scenario: R43-S2 Typed gated submit
- **WHEN** a client sends invalid input, no idempotency key or no required approval reference to a consequential endpoint
- **THEN** runtime validation or policy rejects it consistently and MCP returns approval instructions without exposing sensitive payloads

### Requirement: R44 Align LogicSRC contracts without inventing implementations
Priority: P0. Source: OpenPRD 0001 R44.

The implementation SHALL use reviewed LogicSRC schema versions for compatible tasks, runs, permission records, and events where already supported, and document mappings for new entity-operations records. Persist requirement-to-test traceability and execution evidence. New workspace modules, endpoints, and CLI names in this PRD are proposed contracts until integrated; do not assume an unpublished package or compatibility flag is available. New project-owned code SHALL remain FOSS under the host repository's approved open-source license, with configurable product branding; external bank and filing services are not represented as open-source or free. The repository SHALL retain this PRD plus the OpenSpec change artifacts; drafts SHALL not be auto-marked accepted by an agent.

Source notes in OpenPRD 0001: logicsrc-openprd, logicsrc-comparison.

#### Scenario: R44-S1 Reviewed contract mapping
- **WHEN** new entity tasks, runs, permissions or events claim LogicSRC compatibility
- **THEN** the implementation pins reviewed supported schema versions and records mappings and requirement-to-test evidence instead of assuming unpublished APIs

#### Scenario: R44-S2 Draft and FOSS provenance
- **WHEN** this PRD and bundle are imported or implementation code is added
- **THEN** draft status is preserved until an authorized lifecycle decision, both planning formats remain in the repository, and new project-owned code uses the host approved FOSS license with configurable branding
