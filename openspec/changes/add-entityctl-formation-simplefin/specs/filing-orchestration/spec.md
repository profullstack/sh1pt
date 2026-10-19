## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R14 Use explicit filing modes with honest human handoffs
Priority: P0. Source: OpenPRD 0001 R14.

Every filing SHALL identify its mode as direct, provider, assisted, packet-only, or stub. Direct/provider submission requires verified capability, authorization, and a current contract where applicable. Assisted actions SHALL open a secure handoff for the authorized person and resume from captured receipts. Packet-only SHALL never set submitted automatically. CAPTCHA, MFA, attestation, wet-signature, portal restrictions, and legal review SHALL become visible tasks, not obstacles to bypass with stealth browser automation.

#### Scenario: R14-S1 Packet is ready to file
- **WHEN** a packet-only adapter exports completed draft documents
- **THEN** the operation is labeled ready to file and does not become submitted

#### Scenario: R14-S2 Human portal handoff
- **WHEN** a supported assisted filing requires CAPTCHA, MFA, attestation or a wet signature
- **THEN** the authorized person receives a secure visible task and the workflow resumes from captured evidence without bypass automation

### Requirement: R15 Separate provider capabilities from marketing claims
Priority: P0. Source: OpenPRD 0001 R15.

Each provider adapter SHALL expose a verified capability inventory, supported jurisdictions/entity profiles, production activation status, accepted signature forms, payment method, retrieval route, cancellation limits, and status-update mechanism. CorpNet is a formation candidate, not an already contracted integration. Its published documentation currently describes polling rather than available webhooks, so webhook availability SHALL never be presumed. Any provider's nonprofit incorporation and IRS exemption services must be independently confirmed.

Source notes in OpenPRD 0001: corpnet.

#### Scenario: R15-S1 Unconfirmed provider capability
- **WHEN** marketing mentions formation but the exact nonprofit/exemption scope, signatures, status route or contract is unverified
- **THEN** the adapter records that capability as unavailable for production and does not assume webhooks

#### Scenario: R15-S2 Verified adapter inventory
- **WHEN** a contracted provider route is enabled for a profile and jurisdiction
- **THEN** its inventory exposes current scope, modes, signatures, payment/retrieval/status routes and cancellation limits with evidence

### Requirement: R16 Require an itemized, approved quote
Priority: P0. Source: OpenPRD 0001 R16.

Before any paid external action, the system SHALL show government charges, provider service charges, platform charges, recurring obligations, optional add-ons, currency, refund rules, and quote expiry separately. Unknown prices SHALL be marked unknown and block purchase. The approval SHALL bind the quote, legal-entity profile, jurisdiction, document versions, action scope, and maximum amount. A price increase or changed material term requires renewed authorization; no silent upgrade to a paid provider is permitted.

#### Scenario: R16-S1 Unknown or changed price
- **WHEN** a quote has an unknown charge, has expired, exceeds the cap or contains changed material terms
- **THEN** purchase is blocked and the user receives a new itemized quote/approval request with no silent paid upgrade

#### Scenario: R16-S2 Bounded quote approval
- **WHEN** an authorized user approves a complete quote
- **THEN** the approval binds profile, jurisdiction, action, document and quote hashes, currency, cap, recurring charges, optional items, refund terms and expiry

### Requirement: R17 Enforce action-specific authorization
Priority: P0. Source: OpenPRD 0001 R17.

The system SHALL allow draft creation and plan validation under limited agent authority, but government filings, tax elections, banking applications, credit checks, financing acceptance, guarantees, and payments require appropriately scoped user authorization. A bounded approval may cover an explicitly enumerated filing plan with a spending cap; each provider's own required signatures still apply. Authorization SHALL be revocable until the external action becomes irreversible. A CLI flag, unattended run, or MCP client assertion alone SHALL NOT constitute legal consent.

#### Scenario: R17-S1 Agent cannot create consent
- **WHEN** a CLI flag or MCP client asserts approval without the required human authority and signatures
- **THEN** consequential submission fails with approval instructions while permitted draft work remains available

#### Scenario: R17-S2 Revoked or mismatched scope
- **WHEN** an approval is revoked before irreversible dispatch or covers filings but not banking, credit or guarantees
- **THEN** the worker blocks the unauthorized action even if the requester is authenticated

### Requirement: R18 Prevent duplicate filings and charges across retries
Priority: P0. Source: OpenPRD 0001 R18.

All consequential requests SHALL use an idempotency key bound to tenant, entity, action, and payload hash. An identical retry SHALL return the original operation; reuse with a different payload SHALL return a conflict. If the provider outcome is unknown after timeout, the workflow SHALL enter reconciling and look up the original order before attempting anything new. The system SHALL not claim universal exactly-once execution by external providers; unresolved ambiguity requires operator review.

#### Scenario: R18-S1 Idempotent retry and conflict
- **WHEN** concurrent requests use the same tenant/entity/action key with an identical or changed canonical payload
- **THEN** identical authorized requests return the original operation and a changed payload returns IDEMPOTENCY_CONFLICT

#### Scenario: R18-S2 Timeout after paid acceptance
- **WHEN** a provider accepts a paid order but its response is lost before the platform knows the outcome
- **THEN** the operation enters PROVIDER_RECONCILING and looks up the original order; no second order or charge is issued while the result is ambiguous

### Requirement: R19 Persist documentary proof and realistic cancellation states
Priority: P0. Source: OpenPRD 0001 R19.

The system SHALL retain authorized receipts, filing identifiers, accepted documents, rejection reasons, and status provenance. Payment receipt, provider acceptance, government filing acceptance, and legal effective date SHALL remain distinct. Duplicate or older callbacks SHALL not regress a completed state. Cancellation SHALL stop unsubmitted work and request cancellation where supported, but SHALL NOT promise to reverse an already accepted filing, opened account, or nonrefundable fee.

#### Scenario: R19-S1 Older callback after acceptance
- **WHEN** a completed filing receives an older or duplicate provider callback
- **THEN** accepted state and artifacts remain intact and the event is retained with provenance without regressing the outcome

#### Scenario: R19-S2 Cancellation after acceptance
- **WHEN** cancellation is requested after a legal filing or financial account has been accepted
- **THEN** the system shows supported withdrawal/cancellation options and actual fee limits without promising reversal; payment, provider and agency outcomes remain separate
