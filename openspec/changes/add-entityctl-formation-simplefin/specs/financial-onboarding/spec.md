## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R27 Use authorized bank onboarding with accurate institution disclosure
Priority: P0. Source: OpenPRD 0001 R27.

The system SHALL prepare only the information an eligible product requests, prefer provider-hosted identity verification, and obtain the authorized entity representative's consent before starting an application. It SHALL distinguish fintech interfaces from the institution providing the account, disclose applicable product terms, and identify supported operations such as read API, application API, payments, and card management separately. Bank eligibility, nonprofit acceptance, minimums, ownership/residency requirements, and developer access SHALL be verified, not inferred from a generic API page.

Source notes in OpenPRD 0001: mercury-api, column.

#### Scenario: R27-S1 Hosted authorized application
- **WHEN** an exact-profile qualified product has a verified contracted onboarding route and an authorized representative consents
- **THEN** only required information is prepared, hosted identity collection is preferred, and the account-servicing institution, fintech interface, terms and actually supported API operations are disclosed

#### Scenario: R27-S2 Generic API is insufficient
- **WHEN** a provider has an existing-account read API but no confirmed opening entitlement or nonprofit eligibility
- **THEN** no application starts and the missing contractual/profile evidence is shown

### Requirement: R28 Distinguish deposit, debit, charge, and revolving-credit products
Priority: P0. Source: OpenPRD 0001 R28.

The system SHALL label product types accurately and expose fees, payment terms, required guarantees, credit-check type when supplied, and application prerequisites before consent. Debit-card issuance may be a sub-step of a qualified deposit product; charge cards SHALL not be represented as revolving loans. A product approval SHALL never be inferred from entity formation or an EIN. Financial products SHALL be filtered through the mandatory compatibility policy even when a referral commission is available.

#### Scenario: R28-S1 Accurate product disclosure
- **WHEN** a user reviews a deposit, debit, charge or revolving-credit offer
- **THEN** the product type, fees, payment terms, guarantees, supplied credit-check type and prerequisites appear before consent without equating charge with revolving debt

#### Scenario: R28-S2 Formation does not approve credit
- **WHEN** an entity receives incorporation or EIN confirmation but a financial product lacks its own approval or qualification
- **THEN** the account application remains gated regardless of formation status or referral revenue

### Requirement: R29 Coordinate financing without promising credit
Priority: P1. Source: OpenPRD 0001 R29.

The system SHALL implement a gated financing-application workflow for verified loan and credit-line products, with eligibility intake, document requests, submission tracking, provider decisions, and a separately authorized acceptance step. Underwriting and lending remain with the partner. Hard credit pulls, personal guarantees, binding loan acceptance, and drawdowns SHALL require their own explicit approvals and provider disclosures. A declined application SHALL not trigger automatic applications at other lenders. This capability is P1; until a qualifying partner passes all gates, financing is visibly unavailable.

#### Scenario: R29-S1 Financing gate closed
- **WHEN** no verified loan partner has passed its exact-profile, legal, disclosure and contractual gates
- **THEN** all surfaces display financing as unavailable and create no application

#### Scenario: R29-S2 Separate acceptance and no cascade
- **WHEN** an enabled P1 financing application receives an approval or decline
- **THEN** approval still needs separately authorized acceptance, credit checks and guarantees as applicable; decline triggers no other lender application, and V1 drawdowns remain disabled

### Requirement: R30 Keep financial data access separate from money movement
Priority: P0. Source: OpenPRD 0001 R30.

SimpleFIN SHALL be the mandatory read-only connection for every supported account. It SHALL NOT be used or advertised as an account-opening, payment, card-issuance, or lending API. Any write-capable financial operation requires a separate approved provider integration and permission domain. V1 excludes general-purpose account transfers and loan drawdowns. CoinPay may collect platform service fees through its existing supported payment flows, but SHALL not pretend crypto payments directly satisfy government charges or create custody of customer bank funds.

Source notes in OpenPRD 0001: simplefin-overview.

#### Scenario: R30-S1 Read permission cannot move money
- **WHEN** an agent holding SimpleFIN data-read permission asks for a payment, transfer, card issue or loan drawdown
- **THEN** the request is denied and no write-capable provider call is made

#### Scenario: R30-S2 Service fee boundary
- **WHEN** CoinPay processes an approved platform service fee
- **THEN** billing reconciles that service order separately from government/provider submission and no pooled bank balance or direct crypto government-payment claim is created
