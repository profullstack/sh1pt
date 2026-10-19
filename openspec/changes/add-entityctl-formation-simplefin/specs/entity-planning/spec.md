## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R1 Extend entityctl rather than create a duplicate product
Priority: P0. Source: OpenPRD 0001 R1.

The system SHALL extend sh1pt's entityctl product area and reuse CoinPay's finance integration boundary for SimpleFIN. Formation records belong to the entity-operations domain; bank connectivity and imported financial data belong to the finance domain. Both SHALL share stable organization/entity references without duplicating secrets, customer balances, or billing records. Existing implementation details must be inventoried before choosing integration paths. The earlier entityctl document is product context, not proof of shipped code.

Source notes in OpenPRD 0001: baseline.

#### Scenario: R1-S1 Reuse finance ownership
- **WHEN** an entity plan references a CoinPay account
- **THEN** sh1pt stores stable authorized references and readiness evidence while balances, transactions, credentials and billing remain owned by CoinPay

#### Scenario: R1-S2 Extend existing entry points
- **WHEN** the entity workflow is integrated into sh1pt
- **THEN** it extends the discovered build entity namespace and existing Next.js app, and the implementation inventory identifies reused records and migration gaps

### Requirement: R2 Model legal structure independently from tax and banking status
Priority: P0. Source: OpenPRD 0001 R2.

The system SHALL store legal entity type, federal/state tax classifications, exemption applications, EIN status, filings, banking applications, account verification, and compliance obligations as separate records. A nonprofit SHALL use officer/director and authorized-controller roles, not a shareholder-ownership model. Parent-company, project, sponsor, and spinout relationships SHALL be typed explicitly; a sponsor relationship must not imply equity ownership. A change in one track SHALL NOT silently mark another track complete.

#### Scenario: R2-S1 Independent legal tracks
- **WHEN** nonprofit incorporation receives accepted agency evidence while exemption and banking remain pending
- **THEN** only formation changes; director/officer/controller roles remain distinct from equity ownership and other readiness tracks remain pending

#### Scenario: R2-S2 Typed sponsor relationship
- **WHEN** an entity records a fiscal sponsor or a legacy parent relationship with uncertain meaning
- **THEN** a sponsor is not inferred to own shares and ambiguous legacy relationship or tax labels create a review task

### Requirement: R3 Collect operating jurisdictions instead of guessing a cheap formation state
Priority: P0. Source: OpenPRD 0001 R3.

The system SHALL collect the proposed formation jurisdiction, principal operating address, owner/controller residency where relevant, places of business, employee locations, regulated activities, and declared expansion plans. It SHALL produce a reviewed registration assessment that distinguishes domestic formation, foreign qualification, tax registration, and local licensing. Unknown facts SHALL create review blockers, not confident conclusions. Selecting an out-of-state formation SHALL NOT suppress home-state obligations. Bank service eligibility SHALL be evaluated by where the institution can serve the entity, not only where its headquarters or branches sit.

#### Scenario: R3-S1 Multiple operating jurisdictions
- **WHEN** a founder selects an out-of-state formation and declares California operations and employees elsewhere
- **THEN** the assessment separately evaluates formation, foreign qualification, tax registration and local licensing for the declared facts without suppressing home-state obligations

#### Scenario: R3-S2 Unknown operating facts
- **WHEN** employee location, regulated activity or relevant residency is unresolved
- **THEN** the plan displays an owned review blocker and does not select a cheaper jurisdiction or eligible bank on an inferred answer

### Requirement: R4 Publish operation-specific jurisdiction support
Priority: P0. Source: OpenPRD 0001 R4.

Every jurisdiction pack SHALL advertise supported entity profiles and a separate capability for each action: name check, document preparation, formation filing, exemption assistance, tax election, ongoing compliance, and financial-product availability. Preserve entityctl's Full, Assisted, Read/Compliance, Stub, and Experimental labels for navigation, but never use Full as a blanket promise of bank approval or direct API filing. V1 production rollout SHALL begin with a reviewed US-CA pack plus applicable US federal workflows; other jurisdictions remain explicitly gated. Earlier global launch aspirations do not confer support in this release.

#### Scenario: R4-S1 Operation-specific support
- **WHEN** a pack advertises Full but lacks an authorized filing or banking route for the requested profile
- **THEN** that operation remains unavailable and Full does not imply bank approval or direct filing

#### Scenario: R4-S2 Initial jurisdiction gate
- **WHEN** a user selects a jurisdiction outside the reviewed US-CA and applicable federal release scope
- **THEN** production actions remain gated while supported read or draft capabilities are labeled separately

### Requirement: R5 Version and explain every plan
Priority: P0. Source: OpenPRD 0001 R5.

The system SHALL create reproducible plan versions containing inputs, selected rules and templates, authoritative source references, review dates, required signatures, dependencies, manual steps, quotes, and unresolved questions. Users SHALL see why each task exists. A material input or rule change SHALL invalidate affected approvals and regenerate a comparison, never silently rewrite signed documents. Planning SHALL not incur provider charges or create external applications.

#### Scenario: R5-S1 Deterministic draft
- **WHEN** the same complete inputs and rule/template versions generate a dry-run plan
- **THEN** the canonical plan snapshot is reproducible and includes sources, review dates, signatures, dependencies, manual steps, quotes and unresolved questions without creating external applications or charges

#### Scenario: R5-S2 Changed signed input
- **WHEN** a material input, quote term, rule or document changes after approval
- **THEN** the system creates a version comparison, invalidates affected approvals and preserves the prior signed snapshot

### Requirement: R6 Define completion by requested tracks
Priority: P0. Source: OpenPRD 0001 R6.

The system SHALL show formation_ready, exemption_ready, finance_ready, and compliance_ready separately, with evidence-backed progress for each requested track. Finance readiness requires every account opened through the workflow to pass post-opening SimpleFIN verification. Optional credit or loan denial SHALL NOT prevent completed formation or an otherwise verified deposit-account setup from being recorded. Customers may expressly choose a formation-only workflow after seeing unavailable banking; they may not bypass compatibility to open an unsupported product through the platform.

#### Scenario: R6-S1 Optional financing denial
- **WHEN** formation is accepted and a deposit account is verified but an optional loan application is declined
- **THEN** formation and verified deposit progress remain recorded and no replacement lender application begins

#### Scenario: R6-S2 Every opened account checked
- **WHEN** two requested accounts are opened and only one passes its mapped-account check
- **THEN** aggregate finance readiness remains false with the unchecked account identified; an explicit formation-only choice remains available after banking limitations are shown
