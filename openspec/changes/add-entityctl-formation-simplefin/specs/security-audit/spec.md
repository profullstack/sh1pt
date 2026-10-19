## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R45 Enforce legal-entity and tenant isolation
Priority: P0. Source: OpenPRD 0001 R45.

Every record access, export, event, secret reference, and background job SHALL be constrained by authorized workspace and entity mappings. A SimpleFIN login that exposes personal and multiple-business accounts SHALL not make all accounts visible to every entity administrator. The account owner SHALL explicitly map accounts; unassigned or conflicting accounts remain quarantined from organization views. Organization membership and account-owner authority SHALL both be checked before a connection is reused. Support staff access requires a logged, time-bounded grant.

#### Scenario: R45-S1 Mixed connection quarantine
- **WHEN** a single login exposes personal and multiple-business accounts
- **THEN** only explicitly mapped accounts enter an entity view, unassigned/conflicting accounts stay quarantined, and both account-owner authority and organization membership are checked

#### Scenario: R45-S2 Tenant and support isolation
- **WHEN** an export, job, event, secret reference or support session targets an unauthorized tenant/entity or an expired support grant
- **THEN** access is denied and support access requires a time-bounded audited grant

### Requirement: R46 Minimize and protect sensitive data
Priority: P0. Source: OpenPRD 0001 R46.

The system SHALL prefer provider-hosted collection of identity documents, SSNs, and payment-card details; collect sensitive fields directly only when necessary and approved. Encrypt sensitive records, provider keys, and documents; restrict decryption to designated services; use expiring authorized download links and access logging. PWA offline caching SHALL exclude financial payloads, identity material, and signed documents by default. Do not store complete card PAN/CVV or bank login passwords. Configure retention by data class and legal obligation, and redact operational logs.

#### Scenario: R46-S1 Sensitive storage and access
- **WHEN** identity documents, provider credentials or signed records are collected where necessary
- **THEN** hosted collection is preferred, stored records are encrypted with designated-service decryption, downloads expire and are authorized/logged, and PAN/CVV or bank passwords are never stored

#### Scenario: R46-S2 Offline and retention controls
- **WHEN** the PWA caches content or a retention/deletion job executes
- **THEN** financial payloads, identity material and signed documents remain uncached by default, logs are redacted and deletion respects data-class policy and holds

### Requirement: R47 Keep AI assistance advisory and bound to evidence
Priority: P0. Source: OpenPRD 0001 R47.

AI agents may explain reviewed rules, identify missing information, or draft nonbinding narratives, but SHALL not invent legal facts, resolve unknown eligibility as true, make attestations, or override deterministic submission policies. Documents, provider messages, and transaction descriptions are untrusted content, not tool instructions. Sensitive identifiers SHALL not enter model prompts by default. Generated legal documents SHALL originate from reviewed templates with provenance and be reviewed by an authorized person before submission.

#### Scenario: R47-S1 Untrusted instructions
- **WHEN** a provider message, uploaded document or transaction description instructs an agent to override policy or disclose identifiers
- **THEN** it is treated as data and cannot change tool authority, attest eligibility or place sensitive identifiers in model context by default

#### Scenario: R47-S2 Reviewed legal draft
- **WHEN** AI assists an explanation or nonbinding narrative with unresolved facts
- **THEN** unknowns remain unresolved, legal artifacts use reviewed templates and provenance, and an authorized person must review before submission

### Requirement: R48 Maintain tamper-evident audit records and safe payment boundaries
Priority: P0. Source: OpenPRD 0001 R48.

The system SHALL record actor, entity, action, input/document hashes, approval reference, provider reference, timestamps, and outcome for consequential events without logging sensitive raw inputs. Use append-only application permissions and separately retained integrity evidence; do not claim that an ordinary database table is physically immutable. CoinPay platform billing SHALL reconcile the approved service order without pooling customer government fees in an internal bank balance. Payment, provider submission, and legal acceptance SHALL each have separate reconciliation records.

#### Scenario: R48-S1 Consequential audit evidence
- **WHEN** an approved external action changes state
- **THEN** append-only application audit records actor/entity/action, hashes, approval/provider refs, times and outcome and separately retained integrity evidence can reveal tampering without recording raw sensitive inputs

#### Scenario: R48-S2 Independent payment reconciliation
- **WHEN** payment succeeds while provider submission or agency acceptance is unresolved
- **THEN** each track retains separate reconciliation evidence and no pooled government-fee bank balance or false legal completion appears

### Requirement: R49 Gate production on legal, contractual, and security readiness
Priority: P0. Source: OpenPRD 0001 R49.

Live external actions SHALL remain disabled until the operator has approved the applicable service terms, privacy/data-processing arrangements, filing authority/signature model, provider contracts, and required professional review. Lending/referral activity requires review of applicable licensing and disclosure obligations before activation. The product SHALL not claim banking, legal, tax-preparation, lending, or regulatory credentials it does not hold. These launch gates do not prevent implementing/test-running the software with non-production fixtures.

#### Scenario: R49-S1 Missing launch authorization
- **WHEN** legal/privacy/processing terms, professional review, filing authority or a required provider contract is absent
- **THEN** the affected live external capability remains disabled while non-production fixtures may run

#### Scenario: R49-S2 Lending disclosure gate
- **WHEN** an operator tries to activate lending/referral activity without applicable licensing/disclosure review
- **THEN** activation is refused and no banking, legal, tax or lending credential is claimed without evidence
