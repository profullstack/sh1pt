## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R7 Provide a genuinely free nonprofit software tier
Priority: P0. Source: OpenPRD 0001 R7.

The system SHALL offer nonprofit onboarding, eligibility intake, draft documents, filing coordination, basic compliance reminders, account-health visibility, and portable exports without a platform subscription or platform formation-service fee. Government fees, provider work, registered-agent service, banking charges, and any customer-owned SimpleFIN subscription remain separately disclosed. A new nonprofit may enter this tier while recognition is pending; the application SHALL NOT label it IRS-approved. Optional paid professional services must be separately selected, priced, and consented to.

#### Scenario: R7-S1 Pending nonprofit free tier
- **WHEN** an eligible nonprofit begins onboarding while recognition is pending
- **THEN** core intake, draft preparation, coordination, reminders, account-health visibility and portable exports have zero platform fees and the organization is not labeled IRS-approved

#### Scenario: R7-S2 Optional external service
- **WHEN** a nonprofit is offered professional help or paid provider work
- **THEN** government/provider/bank/agent/SimpleFIN charges are disclosed separately and nothing paid is selected or charged without specific consent

### Requirement: R8 Separate nonprofit incorporation from federal and state exemption
Priority: P0. Source: OpenPRD 0001 R8.

The system SHALL prepare reviewed incorporation and governance material for supported nonprofit profiles, coordinate the state filing, obtain or record an EIN, and then guide the appropriate exemption application. Federal recognition and state tax/charity requirements SHALL have separate statuses and evidence. The streamlined V1 path targets straightforward charitable public-benefit organizations; complex, regulated, foreign, private-foundation, or special-category cases SHALL route to an explicitly supported review/assistance path rather than reuse an unsuitable template. IRS recognition applications use the applicable Pay.gov process; no public submission API is assumed.

Source notes in OpenPRD 0001: irs-exempt.

#### Scenario: R8-S1 Incorporation is not recognition
- **WHEN** a nonprofit receives a state incorporation acceptance and EIN confirmation
- **THEN** federal exemption and state tax/charity tracks remain independent until their own evidence is recorded, with any exemption submission using the supported Pay.gov handoff

#### Scenario: R8-S2 Complex charitable profile
- **WHEN** intake identifies a private foundation, foreign, regulated or special-category case
- **THEN** the standard public-benefit template route is blocked and an actually supported qualified review or assistance route is identified

### Requirement: R9 Apply the complete 1023-EZ eligibility screen
Priority: P0. Source: OpenPRD 0001 R9.

The system SHALL evaluate the current, reviewed IRS eligibility worksheet before selecting Form 1023-EZ. Revenue and asset thresholds alone are insufficient. Every answer SHALL have a user attestation or identified supporting record; unresolved questions or any disqualifying answer prevent the EZ route. The full Form 1023 path SHALL remain available as assisted preparation where contracted support exists. Exemption approval SHALL require the appropriate determination evidence, not payment confirmation.

Source notes in OpenPRD 0001: irs-1023ez.

#### Scenario: R9-S1 Full EZ screen
- **WHEN** a nonprofit meets size thresholds but has a disqualifying or unresolved answer anywhere in the reviewed eligibility worksheet
- **THEN** Form 1023-EZ cannot be selected and the system offers full Form 1023 assisted preparation only where contracted support exists

#### Scenario: R9-S2 Attested eligible screen
- **WHEN** every worksheet answer is supported and the reviewed worksheet permits EZ
- **THEN** preparation may proceed with recorded attestations but a Pay.gov payment receipt alone cannot set recognized

### Requirement: R10 Record legitimate nonprofit governance and authority
Priority: P0. Source: OpenPRD 0001 R10.

The system SHALL collect directors/officers, authorized signers, mission, proposed activities, conflict disclosures, and required governance approvals using jurisdiction-reviewed templates. It SHALL distinguish a nonprofit's public-benefit purpose from a founder's for-profit venture. Free-tier eligibility SHALL NOT be offered as a way to relabel a private business or avoid taxes. Complex insider transactions, ownership-like promises, or incompatible distributions SHALL block the streamlined workflow pending qualified review.

#### Scenario: R10-S1 Documented nonprofit authority
- **WHEN** an organizer supplies mission, activities, directors, officers, conflicts and required governance approvals
- **THEN** the plan records reviewed template versions and the authorized signing roles

#### Scenario: R10-S2 Private benefit conflict
- **WHEN** intake includes incompatible distributions, ownership-like promises or complex insider transactions
- **THEN** the streamlined workflow stops for qualified review and the free nonprofit tier is not presented as a way to relabel a private business
