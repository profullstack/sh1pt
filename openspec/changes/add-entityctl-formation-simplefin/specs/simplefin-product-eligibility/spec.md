## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R20 Make SimpleFIN a non-bypassable financial-product gate
Priority: P0. Source: OpenPRD 0001 R20.

The system SHALL offer, recommend, refer to for application, or help open a financial product only when that exact product/profile combination has current verified SimpleFIN connectivity. This applies to checking, savings, credit and charge accounts, loans, credit lines, and any future financial-account category. A supported parent deposit account may cover an ordinary debit card only when its transactions appear there and the UI does not promise separate card-account data. Neither a generic bank API nor a CSV/PDF upload substitutes for SimpleFIN support.

#### Scenario: R20-S1 Unverified card blocked
- **WHEN** a credit or charge product has an API, commission or uploaded statements but lacks current exact-profile SimpleFIN qualification
- **THEN** the product cannot be recommended, referred for application or opened through any surface

#### Scenario: R20-S2 Debit inheritance
- **WHEN** an ordinary debit instrument has demonstrated transaction coverage in its qualified parent deposit account
- **THEN** it may be offered under that parent qualification only with accurate disclosure and no promise of a separate card data feed

### Requirement: R21 Verify the specific product, legal profile, and connection route
Priority: P0. Source: OpenPRD 0001 R21.

Compatibility records SHALL distinguish institution, actual account-servicing institution where relevant, product identifier, account type, business versus nonprofit eligibility, operating/service jurisdictions, currency, bank login portal, SimpleFIN server/route, and tested protocol version. Accept either institution-native SimpleFIN or a verified bridge route. A directory listing or a successful personal-account connection is discovery evidence only, not business/nonprofit product qualification. Bridge's current directory limits are not a universal geographic limit of the protocol.

Source notes in OpenPRD 0001: simplefin-overview, bridge-directory.

#### Scenario: R21-S1 Personal evidence does not qualify nonprofit
- **WHEN** an institution directory listing and a successful personal-account login are supplied for a nonprofit product
- **THEN** the product remains unqualified until its actual profile, service jurisdiction, currency, servicer, login portal and route have matching evidence

#### Scenario: R21-S2 Native route qualification
- **WHEN** an institution-native SimpleFIN server outside a Bridge directory region supplies reviewed exact-product evidence
- **THEN** the route is evaluated on approved-server and product requirements rather than rejected solely by Bridge directory geography

### Requirement: R22 Maintain evidence-backed qualification states
Priority: P0. Source: OpenPRD 0001 R22.

The catalog SHALL support candidate, testing, verified, degraded, stale, unsupported, and retired states with a reviewer, evidence references, last_verified_at, reverify_due_at, and applicable restrictions. Default policy is expiry after 30 days without qualifying re-verification; this is a product policy, not a SimpleFIN guarantee. Verification SHALL include a consented real account of the exact target profile, two observations separated by at least one day, and relevant existing posted activity. Demo/sandbox fixtures test software but do not certify a bank. Operational evidence can refresh qualification after review without opening a new account.

#### Scenario: R22-S1 Two observations and evidence
- **WHEN** a reviewer attempts to verify a candidate using only a sandbox fixture, one observation, a different profile or observations less than one day apart
- **THEN** verification is refused until consented real exact-profile evidence includes the required existing posted activity and at least two observations separated by one day

#### Scenario: R22-S2 Qualification expiry
- **WHEN** a verified product reaches reverify_due_at without qualifying reviewed refresh evidence
- **THEN** new distribution is blocked as stale even before a scheduled expiry job runs; review may refresh qualification from valid operational evidence without a new account opening

### Requirement: R23 Test account-type data requirements explicitly
Priority: P0. Source: OpenPRD 0001 R23.

Deposit qualification SHALL confirm account discovery, currency, dated balance, and retrieval of existing posted deposits/withdrawals. Credit/charge qualification SHALL additionally confirm the debt-balance interpretation and available payment/purchase/refund activity; limits, APR, and due dates get separate capability flags. Loan/credit-line qualification SHALL confirm outstanding balance and retrieval of existing draw/repayment activity required by that product's published profile. Missing required data fails qualification. Individual capabilities SHALL be documented instead of treating optional fields as guaranteed. No test may fabricate or initiate financial activity without separate authorization.

#### Scenario: R23-S1 Required type data missing
- **WHEN** a deposit lacks posted deposits/withdrawals, a credit account lacks required debt/activity interpretation, or a loan lacks required outstanding balance/draw/repayment data
- **THEN** the relevant product fails qualification; optional APR, limits and due dates are recorded as unavailable capabilities rather than guaranteed

#### Scenario: R23-S2 Existing activity only
- **WHEN** verification needs an example of an activity absent from the evidence
- **THEN** the reviewer cannot fabricate transactions or initiate activity without separate authorization and the missing requirement remains unverified

### Requirement: R24 Separate product qualification from a customer account check
Priority: P0. Source: OpenPRD 0001 R24.

Pre-application qualification SHALL use existing operator-authorized evidence, not ask ordinary customers to open unverified products for testing. After bank approval, each actual customer account SHALL be linked, mapped to its legal entity, and verified separately. A new account with no activity may pass an initial account check when an empty result is legitimate and the product already has transaction evidence; it SHALL not be assigned invented transactions. Approved but unlinked accounts remain account_open_connection_pending, not finance_ready.

#### Scenario: R24-S1 Post-opening link failure
- **WHEN** a qualified bank approves an application but the new customer cannot link or map the resulting account
- **THEN** the account remains open_connection_pending, not finance_ready, and the UI explains the next linking action without suggesting the account was rejected

#### Scenario: R24-S2 Legitimate empty account
- **WHEN** an already-qualified product has posted-activity evidence and the newly opened mapped customer account returns legitimate empty activity with required dated balance and currency
- **THEN** the initial account check may pass without fabricated transactions; absent required data or scoped errors still block the check

### Requirement: R25 Block incompatible products at the server as well as in the interface
Priority: P0. Source: OpenPRD 0001 R25.

Compatibility SHALL be enforced in the same server policy for PWA, CLI, API, SDK, and MCP. The gate SHALL run both when a product is selected and immediately before application/handoff. Unsupported/stale products may appear only in an administrative research view or an explanatory unavailable state without application links. There SHALL be no administrator override that publishes an unsupported product as compatible; reviewers must supply evidence and legitimately change qualification state.

#### Scenario: R25-S1 Expiry between selection and dispatch
- **WHEN** a product is verified during selection but stale, degraded or ineligible immediately before application/handoff
- **THEN** the server blocks dispatch and returns an explicit qualification error to every client

#### Scenario: R25-S2 Administrator bypass rejected
- **WHEN** an admin, paid SDK user or MCP client attempts to publish or start an unsupported product with an override parameter
- **THEN** the server rejects the bypass; only a legitimate evidence-reviewed qualification transition can make the product available

### Requirement: R26 Handle breakage without hiding it or moving money
Priority: P0. Source: OpenPRD 0001 R26.

When a connection fails, the system SHALL distinguish customer-specific authentication problems from product-wide degradation. It SHALL alert affected users, retain last-known data with timestamps, and pause new distribution where evidence indicates product failure. Existing unsupported legacy accounts may be inventoried as unverified with restricted metadata, but SHALL not count as supported or bypass onboarding policy. The platform SHALL NOT close accounts, transfer funds, refinance debt, or apply elsewhere automatically when compatibility breaks.

#### Scenario: R26-S1 Customer authentication failure
- **WHEN** one customer loses authentication while product-wide evidence remains valid
- **THEN** polling for the affected connection pauses for reauthorization and last-known account data retains timestamps without automatically downgrading unrelated customers

#### Scenario: R26-S2 Product-wide breakage
- **WHEN** reviewed evidence indicates product-wide connectivity failure
- **THEN** new distribution pauses and affected users are notified; legacy unsupported metadata stays unverified and no account closure, transfer, refinance or replacement application occurs
