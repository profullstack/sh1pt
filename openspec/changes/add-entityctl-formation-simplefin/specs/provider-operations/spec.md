## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R53 Start with disabled vendor candidates and no invented compatibility
Priority: P0. Source: OpenPRD 0001 R53.

The seed catalog SHALL contain no verified financial products. Previously discussed Mercury, Column, and Increase are research candidates only; no compatibility, nonprofit acceptance, production pricing, or onboarding entitlement is asserted by their presence. CorpNet and doola may be evaluated for filings with separately verified scope. The first launch SHALL use a small number of contracted providers, hosted onboarding where suitable, and a reviewed jurisdiction pack rather than assuming universal integration.

#### Scenario: R53-S1 Empty verified seed
- **WHEN** a fresh production catalog is seeded with Mercury, Column, Increase or other research candidates
- **THEN** zero products are verified or application-enabled and no nonprofit acceptance, pricing or onboarding entitlement is inferred

#### Scenario: R53-S2 Provider selection evidence
- **WHEN** an operator selects CorpNet, doola or another filing partner for launch
- **THEN** only independently verified contracted scope may activate, with reviewed jurisdiction capability and hosted/assisted modes accurately labeled

### Requirement: R54 Expose kill switches and recoverable operator workflows
Priority: P0. Source: OpenPRD 0001 R54.

Operators SHALL be able to pause new actions by jurisdiction, provider, product, workflow type, or tenant while preserving read access and existing evidence. Failed operations SHALL have an owner, next action, correlation ID, and bounded retry policy. A paused queue SHALL not retry financial or legal actions when restarted without rechecking current approvals, quote validity, and compatibility. Operational views SHALL report external failure separately from platform failure.

#### Scenario: R54-S1 Granular pause
- **WHEN** an operator pauses a jurisdiction, provider, product, workflow or tenant
- **THEN** new matching external actions stop while authorized reads and retained evidence remain available

#### Scenario: R54-S2 Resume rechecks state
- **WHEN** a paused or failed job resumes after approvals expire or qualification changes
- **THEN** the worker rechecks all current gates before calling a provider and retains an owner, next action, correlation ID and bounded retry with external versus platform failure identified

### Requirement: R55 Test recovery, conformance, and irreversible-action safety
Priority: P0. Source: OpenPRD 0001 R55.

Release acceptance SHALL include deterministic adapter tests, representative product-verification evidence, cross-tenant authorization tests, duplicate-submit and timeout tests, secret/SSRF tests, partial-sync and date-boundary tests, and backup/restore drills. Tests SHALL cover all P0 requirements and every enabled P1 capability. Restoring data SHALL not automatically reissue already completed filings or bank applications. Mock fixtures SHALL never be reported as live bank certification.

#### Scenario: R55-S1 Fault-injection acceptance
- **WHEN** an applicable P0 capability or enabled P1 capability is proposed for release
- **THEN** acceptance evidence covers its scenarios plus adapters, isolation, duplicate/timeout recovery, secrets/SSRF, partial sync, date boundaries and backup/restore drills; mock results are not bank certification

#### Scenario: R55-S2 Restore without redispatch
- **WHEN** database and documents are restored while old outbox jobs include already completed external actions
- **THEN** external mutations start disabled and reconciliation prevents reissuing completed filings, charges or bank applications; measured restore results are recorded

### Requirement: R56 Use phased release gates rather than unbounded launch promises
Priority: P0. Source: OpenPRD 0001 R56.

A planning-only preview may ship with all paid external actions disabled. Production filing SHALL require a reviewed pack and provider/assisted route; production banking SHALL additionally require at least one qualified product for the precise entity profile being advertised. A nonprofit banking launch needs nonprofit-specific evidence, not business-only evidence. Credit/loan categories launch independently only after their own approvals and compatibility tests. International packs and direct embedded-banking expansion are P1 follow-ups, not implied V1 coverage.

#### Scenario: R56-S1 Formation-only preview gate
- **WHEN** no qualified banking product exists but a reviewed planning preview or authorized formation route is ready
- **THEN** only that capability may be enabled and formation-only messaging does not imply available banking

#### Scenario: R56-S2 Exact-profile phased release
- **WHEN** business deposit evidence exists but nonprofit, charge, loan or international evidence does not
- **THEN** only the precise supported profile/category/jurisdiction may launch; all other categories remain independently gated
