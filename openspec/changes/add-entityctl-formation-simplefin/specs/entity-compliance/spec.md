## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R39 Maintain source-backed recurring obligations
Priority: P0. Source: OpenPRD 0001 R39.

The system SHALL generate jurisdiction- and entity-specific obligations for applicable registry reports, nonprofit returns, charity renewals, tax elections, payroll-related tasks, agent renewals, and other approved rules. Each task SHALL carry authority/source, rule version, trigger, timezone, due-date inputs, owner, and evidence needed for completion. Complex applicability questions SHALL route to review. No universal state, tax, or beneficial-ownership deadline may be hardcoded across all entities. BOI rules SHALL be evaluated separately from bank customer-identification requirements.

Source notes in OpenPRD 0001: fincen.

#### Scenario: R39-S1 Source-backed obligation
- **WHEN** reviewed rules establish an obligation for an entity profile and declared jurisdictions
- **THEN** the task carries rule/source, applicability trigger, timezone, due-date inputs, accountable owner and required completion evidence

#### Scenario: R39-S2 No universal BOI rule
- **WHEN** legacy defaults suggest the same BOI or state deadline for all entities or applicability is unknown
- **THEN** the planner uses the current reviewed applicable rule or creates a review blocker and keeps bank identity checks separate

### Requirement: R40 Make reminders useful without unauthorized filings
Priority: P0. Source: OpenPRD 0001 R40.

The system SHALL support in-app and email reminders, an accountable owner, escalation for overdue items, and an audit trail of delivery attempts. Marking a reminder read SHALL not mark a filing complete. Recurring submissions require either fresh authorization or a still-valid narrowly scoped standing authorization with a fee cap and applicable signatures. A failed email SHALL remain visible as a delivery failure; an alert does not prove legal compliance.

#### Scenario: R40-S1 Reminder is not completion
- **WHEN** a user reads an obligation reminder or an email delivery fails
- **THEN** the obligation stays open until required evidence exists; the delivery/read attempt and any escalation remain visible

#### Scenario: R40-S2 Recurring paid submission
- **WHEN** a recurring obligation becomes due
- **THEN** dispatch requires fresh authority or a still-valid narrowly scoped standing approval with fee cap and all signatures; a reminder does not supply consent

### Requirement: R41 Export records and continue after cancellation
Priority: P0. Source: OpenPRD 0001 R41.

The system SHALL allow authorized export of entity metadata, plan versions, documents, receipts, compliance history, and permitted financial data in portable formats. Exports SHALL include provenance, coverage, and known limitations but never live provider secrets by default. Subscription cancellation SHALL stop future paid platform work while preserving a disclosed read/export period and independently identifying outside obligations. Disconnection SHALL stop financial refresh and expose the provider revocation path. Legal retention/hold policy determines deletion timing; the UI SHALL not promise immediate deletion of legally retained records.

#### Scenario: R41-S1 Portable scoped export
- **WHEN** an authorized actor requests entity, document, compliance and permitted finance records
- **THEN** a protected export includes provenance, coverage and limitations while excluding live provider secrets and unauthorized entities/accounts

#### Scenario: R41-S2 Cancellation and disconnection
- **WHEN** a customer cancels subscription or disconnects data access
- **THEN** future paid platform work or refresh stops as appropriate, a disclosed read/export period and outside obligations remain visible, and retention follows legal holds with a provider revocation path
