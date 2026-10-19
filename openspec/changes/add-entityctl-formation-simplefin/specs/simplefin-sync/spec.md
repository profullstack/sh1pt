## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R31 Provide v2-first, explicit version compatibility
Priority: P0. Source: OpenPRD 0001 R31.

The client SHALL implement and test SimpleFIN v2, query the server's advertised versions where supported, and send an explicit version on account requests. Because v2 is currently a draft, each adapter SHALL record tested capabilities rather than rely on the version string alone. Tested v1 connections may remain available only under an explicitly enabled compatibility policy, labeled as v1; the system SHALL not silently downgrade after malformed v2 data. Newly verified products default to v2. Version-specific parsing SHALL be separated from the internal finance model.

Source notes in OpenPRD 0001: simplefin-v2, simplefin-v1.

#### Scenario: R31-S1 Explicit v2 request
- **WHEN** a newly qualified v2 route is read
- **THEN** the client records advertised/tested capabilities, sends the explicit supported version and validates v2 data before normalization

#### Scenario: R31-S2 Malformed v2 and opt-in v1
- **WHEN** a v2 payload is malformed or a legacy v1 route is selected
- **THEN** malformed v2 fails visibly without downgrade; v1 works only through a tested explicitly enabled policy with its version shown

### Requirement: R32 Claim tokens securely and handle uncertain outcomes
Priority: P0. Source: OpenPRD 0001 R32.

The system SHALL exchange the one-time setup token only in a trusted backend worker, store the resulting Access URL as an encrypted secret, and erase the setup token when no longer needed. It SHALL handle failed claims without blind repeated claims and explain how the user can revoke/reissue a potentially consumed token. No token, URL credentials, or financial payload may appear in analytics, shell arguments, agent transcripts, crash reports, or ordinary logs. The UI SHALL use a secure input; CLI ingestion SHALL use a hidden prompt or standard input.

Source notes in OpenPRD 0001: simplefin-v1.

#### Scenario: R32-S1 Single-use secret claim
- **WHEN** a user connects through a secure form, hidden CLI prompt or stdin
- **THEN** only a trusted worker exchanges the token, stores the Access URL encrypted and erases the ephemeral token; ordinary output, logs, analytics and model transcripts contain neither secret nor financial payload

#### Scenario: R32-S2 Ambiguous consumed token
- **WHEN** a claim times out or the returned credential cannot be durably stored
- **THEN** the system records an uncertain claim and explains revoke/reissue recovery without blindly claiming the same token again

### Requirement: R33 Protect all financial connection URLs from SSRF
Priority: P0. Source: OpenPRD 0001 R33.

The system SHALL validate decoded claim URLs, returned Access URLs, redirects, institution links, and optional currency-metadata URLs before network access. Require HTTPS with valid certificates; block loopback, private, link-local, cloud-metadata, and disallowed destinations; revalidate DNS resolution and every permitted redirect. Production uses approved provider roots and explicit review for additional native SimpleFIN servers. Credentials SHALL never be forwarded to another origin. The same policy applies to operator-submitted verification URLs, not only customer input.

#### Scenario: R33-S1 Unsafe URL blocked
- **WHEN** a customer or operator submits a claim/access/metadata/institution URL resolving to loopback, private, link-local, cloud metadata, disallowed origin or invalid TLS
- **THEN** network access is blocked before secrets or requests reach that destination, including encoded or IPv6-equivalent destinations

#### Scenario: R33-S2 DNS and redirect revalidation
- **WHEN** an approved hostname changes to a disallowed address or a response redirects to another origin
- **THEN** the actual connection and each redirect are checked against URL policy and credentials are never forwarded across origins

### Requirement: R34 Keep account identity, ownership, and money semantics stable
Priority: P0. Source: OpenPRD 0001 R34.

The importer SHALL scope external identifiers by tenant, SimpleFIN server/connection identity, account, and transaction; identical IDs from another connection SHALL never collide. It SHALL preserve raw source amounts and map them through a tested adapter to the existing CoinPay ledger convention. The standard uses positive transaction amounts for money deposited into an account; this must not be confused with a downstream ledger that uses positive amounts for spending. Liability balance interpretation requires product-specific tests. Use exact decimal arithmetic, retain currency, and never combine different currencies without a disclosed conversion.

Source notes in OpenPRD 0001: simplefin-v1.

#### Scenario: R34-S1 Repeated source identifiers
- **WHEN** two tenants, platform connections or v2 institution connections expose the same external account and transaction IDs
- **THEN** separate scoped finance records are preserved and no cross-account overwrite or visibility occurs

#### Scenario: R34-S2 Exact amounts and signs
- **WHEN** a feed includes precise decimal deposits, withdrawals and liabilities in different currencies
- **THEN** raw source values survive import, tested normalization preserves exact amounts and correct ledger signs, and currencies are not silently summed or converted

### Requirement: R35 Respect polling quotas and historical coverage
Priority: P0. Source: OpenPRD 0001 R35.

The scheduler SHALL follow each provider's published limits and use a shared quota for all app surfaces using the same connection. Bridge integration SHALL request no more than its allowed daily budget, fetch history in windows no larger than the documented limit, use jitter, and overlap incremental windows. V1 defaults to one scheduled refresh per day plus quota-controlled user requests; scheduled, manual, retry, and backfill traffic share the budget. Store actual returned coverage; requesting a year SHALL not imply a year was available.

Source notes in OpenPRD 0001: bridge-guide.

#### Scenario: R35-S1 Shared quota across clients
- **WHEN** scheduled, manual, retry and backfill jobs concurrently request one connection
- **THEN** they share a durable provider-specific budget with coalescing/jitter and no quota bypass through a different surface

#### Scenario: R35-S2 Bounded history request
- **WHEN** a user requests one year of history from a provider with bounded request windows and shorter available coverage
- **THEN** requests use allowed windows with incremental overlap and the UI/export records only actual known coverage, including gaps or unknown limits

### Requirement: R36 Reconcile transactions without duplication or invented completeness
Priority: P0. Source: OpenPRD 0001 R36.

The importer SHALL upsert stable source transactions and reconcile pending-to-posted changes using provider evidence rather than merchant/amount alone. It SHALL not delete transactions merely because they are absent from a later bounded window. Transfers, refunds, card repayments, loan proceeds, and owner contributions SHALL remain distinct from earned revenue; uncertain classifications must remain visible. A SimpleFIN sync validates data access, not a complete accounting reconciliation or an audited income statement.

#### Scenario: R36-S1 Stable upsert and pending evidence
- **WHEN** overlapping syncs repeat transactions or a pending transaction posts
- **THEN** the importer uses scoped stable IDs or explicit replacement evidence, does not merge by merchant/amount alone and does not delete records absent from a later bounded window

#### Scenario: R36-S2 Revenue classification uncertainty
- **WHEN** an imported credit could be a transfer, refund, repayment, loan proceeds or owner contribution
- **THEN** it is kept distinct from earned revenue or visibly uncertain and the sync is not described as complete bookkeeping or an audited statement

### Requirement: R37 Expose partial errors and freshness at account level
Priority: P0. Source: OpenPRD 0001 R37.

The system SHALL retain successful account updates even when other accounts fail, while recording account/connection error scope and timestamps. It SHALL handle supported v2 structured errors and v1 error responses, sanitize messages, and distinguish provider payment, authentication, rate-limit, and missing-data failures. Every balance view SHALL show its effective timestamp separately from the time the app fetched it. Partial or stale data SHALL not become current merely because the HTTP response was successful. Revoked access stops polling until reauthorized.

Source notes in OpenPRD 0001: simplefin-v2.

#### Scenario: R37-S1 Partial v2 errors
- **WHEN** a successful HTTP response includes updated account A and an act.missingdata error with msg and scope for account B
- **THEN** A is saved, B retains its prior effective data with a scoped sanitized warning, and fetched time does not replace either balance effective timestamp

#### Scenario: R37-S2 Revoked and legacy errors
- **WHEN** the provider reports revoked credentials, rate limits, payment trouble or supported v1 errors
- **THEN** the system records the appropriate category and account/connection scope, shows limitations and stops revoked polling until reauthorized

### Requirement: R38 Treat credit details and statements as separately sourced capabilities
Priority: P0. Source: OpenPRD 0001 R38.

The system SHALL record whether APR, credit limit, minimum payment, due date, loan schedule, and original statements are available from verified supplemental sources. Missing values SHALL be unavailable, not zero. Bank PDFs SHALL retain issuer/source provenance. Reports generated from transaction data SHALL be labeled generated activity reports, never official monthly/quarterly bank statements. Document upload or supplemental APIs SHALL not make an otherwise incompatible account pass the mandatory SimpleFIN gate.

Source notes in OpenPRD 0001: simplefin-v2.

#### Scenario: R38-S1 Missing supplemental terms
- **WHEN** a verified feed omits APR, credit limit, minimum payment, due date or loan schedule
- **THEN** missing terms display unavailable rather than zero and any supplemental values retain verified source capability/provenance

#### Scenario: R38-S2 Generated report label
- **WHEN** a user generates an activity report or uploads an issuer statement
- **THEN** generated output is labeled as such, issuer PDFs keep provenance, and neither document upgrades an incompatible product to qualified
