## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R11 Check S-election eligibility before offering submission
Priority: P0. Source: OpenPRD 0001 R11.

The system SHALL support LLC and corporation formation independently of an optional S election. The election screen SHALL check the entity and shareholder eligibility rules, share classes, tax year, requested effective date, and required consents. An ordinary corporation-owned subsidiary SHALL NOT be sent through the standard eligible-individual-shareholder path. Specialized subsidiary elections, trust cases, and late-election relief are out of the automated V1 path. The system SHALL not describe S status as universally cheaper or automatically appropriate.

Source notes in OpenPRD 0001: irs-scorp, irs-2553.

#### Scenario: R11-S1 Eligible optional election
- **WHEN** an LLC or corporation requests S treatment and all reviewed shareholder, entity, share-class, tax-year, effective-date and consent checks pass
- **THEN** the system offers the optional election without implying universal savings or changing the underlying legal type

#### Scenario: R11-S2 Corporation owner blocked
- **WHEN** the ordinary shareholder path receives a corporation-owned subsidiary or unsupported trust, specialized or late-relief case
- **THEN** automated S-election submission is blocked for review while otherwise supported formation remains independent

### Requirement: R12 Coordinate EIN applications with authority and duplicate protection
Priority: P0. Source: OpenPRD 0001 R12.

The system SHALL collect the responsible-party information only through secure forms or approved provider collection and require the applicable signed authority for third-party application. It SHALL check for an existing EIN and pending request before submitting a new one, respect current IRS eligibility and application limits, and store confirmation securely. The displayed IRS EIN fee SHALL be zero; any provider assistance fee is separate. Existing entities SHALL not receive a new EIN solely because they connect to this platform.

Source notes in OpenPRD 0001: irs-ein.

#### Scenario: R12-S1 Existing or pending EIN
- **WHEN** an entity already has an EIN or a pending EIN request and is connected to the platform
- **THEN** the system reuses or reconciles that record and submits no duplicate application

#### Scenario: R12-S2 Secure authorized EIN request
- **WHEN** a new eligible entity requests third-party EIN coordination
- **THEN** responsible-party details use secure collection, required signed authority and current IRS limits are checked, the IRS fee is displayed as zero, and confirmation is encrypted

### Requirement: R13 Track election deadlines, signatures, and acceptance
Priority: P0. Source: OpenPRD 0001 R13.

The system SHALL calculate election deadlines from reviewed effective-date rules, show the calculation inputs, obtain every required consent, and use a currently accepted filing route. Form 2553 mail/fax coordination SHALL retain delivery evidence without treating delivery as IRS acceptance. Late or ambiguous elections SHALL stop for review; the product SHALL NOT invent reasonable-cause statements. After an accepted election, the plan SHALL surface payroll and recurring federal/state filing obligations through checklists or approved integrations rather than claim payroll is implemented.

Source notes in OpenPRD 0001: irs-2553, ca-scorp.

#### Scenario: R13-S1 Delivery versus acceptance
- **WHEN** all required Form 2553 signatures are obtained and a reviewed on-time mail/fax route returns delivery proof
- **THEN** the proof and deadline inputs are retained but the election stays submitted until applicable acceptance and effective-date evidence is received

#### Scenario: R13-S2 Late or ambiguous election
- **WHEN** an effective-date calculation is late or ambiguous or a required consent is missing
- **THEN** submission stops for review without generating reasonable-cause claims; accepted elections separately surface payroll and recurring tax checklists
