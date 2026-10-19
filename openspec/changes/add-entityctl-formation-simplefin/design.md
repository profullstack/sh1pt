## Context

OpenPRD 0001 defines the product requirements; [discovery](discovery.md) identifies current code. The legacy US pack is scaffolded and combines legal/tax concepts. CoinPay already owns imported financial accounts, so a parallel bank-data store would create ownership and secret-management conflicts.

This is a design proposal. Runtime behavior, data migrations and live acceptance evidence are not delivered by the planning bundle.

## Goals / Non-Goals

Implement an independently useful planning preview, then activate formation, deposit banking, and later categories only when their evidence gates pass. Keep nonprofit core software free and financial qualification mandatory across every surface.

The PRD's non-goals apply: no general money movement, loan drawdowns in V1, lending decisions, automatic tax returns, universal jurisdiction support, or fabricated legal/account completion. Financing acceptance workflow R29 is P1 and stays disabled pending its own partner and legal gates.

## Decisions

### 1. Reuse repository boundaries

Extend `packages/core/src/jurisdiction.ts` and `packages/entity/us`; keep `sh1pt build entity` in the existing Commander tree. Use `sites/sh1pt.com` for responsive PWA screens and its `/api/v1` route boundary. Put shared entity policy/domain services in the existing workspace with versioned runtime schemas, imported by route handlers and workers; clients never implement their own consequential policy.

Do not route live operations through `packages/api`'s stub auth. Its Hono presence does not justify a second entity API. Reuse `sites/sh1pt.com/supabase/migrations` for entity SQL. Confirm self-hosted PostgreSQL infrastructure before deploying authoritative records; do not substitute local JSON or SQLite as durable preview storage.

CoinPay extends its existing finance routes, SDK and migrations. It owns secrets, connections, accounts, transactions, qualification records, and account checks. Sh1pt stores stable finance references, application orchestration and minimal authorized readiness evidence. CoinPay owns bank adapter connectivity and billing reconciliation. Both sides verify scoped service identity and organization/account authority; a broad admin key is not an integration contract.

### 2. Version legal structure and state mappings

Represent legal type separately from tax classification, EIN, exemption, election, filing and banking tracks. Migrate legacy `s-corp` values through review: a tax label alone does not establish the underlying LLC/corporation structure. Do not guess missing facts or rewrite signed artifacts. Keep existing pack navigation labels while adding per-action/profile/jurisdiction capabilities with current sources and review dates.

A nonprofit has directors, officers and controllers; sponsor links are not equity. A legacy `parentEntityId` becomes an explicitly typed relationship only with evidence of its meaning. Quarantine ambiguous mappings. Existing global lifecycle values map to narrowly evidenced tracks; `active` alone proves none of formation, exemption or finance readiness.

Readiness is computed from requested tracks and evidence. Denied optional credit does not change accepted formation or an independently verified deposit setup. An account actually opened through the workflow must be separately checked; optional status never exempts an opened account from the aggregate finance requirement. Formation-only choice is recorded after banking unavailability is shown.

### 3. Build reproducible plans without paid side effects

Canonicalize validated inputs and record a snapshot hash plus rules/templates, review dates, sources, dependencies, quote refs, manual tasks and missing facts. Approved snapshots remain append-only at the application level. Changed material inputs create a new version and comparison, invalidating only dependent approvals.

The US-CA plan separates domestic formation, foreign qualification, tax registration and local licensing. Federal EIN, election and exemption modules are separate reviewed rule sets. Collect declared operating facts before recommending a filing state. Unknowns create named review tasks; draft generation never purchases services or starts a bank application. Fake-data demos remain clearly synthetic. A preview with unreviewed rules cannot present legally reviewed personalized conclusions.

### 4. Separate consent requests from authority and signatures

An approval request opens a secure human session; it does not create approval. Bind approval evidence to the actor, entity authority grant, exact enumerated actions, input/document/quote hashes, jurisdiction, terms, currency, spending cap, expiry and revocation. Required provider signatures remain separate.

Authentication, authority to act for the legal entity, account ownership, provider KYC and legal signature each have distinct evidence. Agent credentials can read/draft/request approval; an MCP assertion or CLI flag cannot mint consent. Hard credit pulls, guarantees, debt acceptance and any future drawdown permissions cannot inherit filing consent. V1 excludes drawdowns regardless of an approval record.

### 5. Persist operations and recheck before dispatch

A PostgreSQL transaction creates an operation and outbox event with a uniqueness constraint on tenant/entity/action/idempotency key. Store the canonical payload hash; identical authorized retries return the same operation and changed payloads conflict. Retrying an old operation must still enforce tenant access before returning it.

Worker leases prevent simultaneous dispatch by local workers. Immediately before dispatch, recheck current authority, approval revocation/expiry, quote/terms, budget reservation, capability activation, qualification and kill switches. Persist provider references and sanitized response hashes with the state transition before emitting completion events.

A timeout after possible external acceptance enters `reconciling`. Reconcile by the original correlation/order reference; do not create another order when evidence is inconclusive. Lease expiry or restored queue messages never by themselves authorize redispatch. Reconciliation has a bounded retry policy, accountable owner and next action. No provider-wide exactly-once guarantee is asserted.

Version provider-state mappings and event ordering. Keep payment receipt, provider acceptance, government acceptance, legal effective date and documents separate. Late/duplicate events cannot regress acceptance; conflicting evidence requires review. Cancellation can stop unsubmitted tasks and request supported cancellation, but cannot promise legal rollback or refundable fees.

### 6. Make qualification a finance-side policy decision

Qualification key includes institution/servicer, actual product, legal profile, service jurisdictions, currency, login portal, SimpleFIN server/route, protocol version and required-data profile. Catalog seeds begin as disabled candidates with empty evidence. Personal-account success and directory listings do not certify business/nonprofit profiles.

A reviewer can transition to verified only after checking consented real-account evidence, two observations at least 24 hours apart, required existing activity and data interpretation. Default validity is 30 days from qualifying verification; evaluate expiry at request time even if an expiry job has not run. A changed product/profile/route or required-data policy requires matching new evidence. Fixtures never satisfy production evidence validation.

Apply the gate for available listing/selection and again before application or handoff. Qualification decisions are short-lived and bound to the exact profile and operation; any service-issued reference is revalidated rather than trusted as permanent authorization. No generic referral link may escape this check. Research views can show disabled metadata without application links. Admins supply evidence and undergo the same transitions; no override publishes compatibility.

Deposits require balance/date/currency and posted deposit/withdrawal evidence. Ordinary debit instruments can inherit a parent deposit feed only with demonstrated transaction coverage and no separate-feed claim. Charge, credit, loan and credit-line data profiles test liabilities and appropriate existing activity separately; APR/limits/due dates stay independent optional capabilities.

### 7. Verify the opened customer account independently

After bank approval, an authorized account owner links SimpleFIN and maps selected accounts to the legal entity. Check institution/product identity, authorized mapping, currency, dated balance, error scope and requested transaction access. Unassigned or conflicting accounts are quarantined from organization views. A newly opened empty account can pass only when an empty result is legitimate and its already-qualified product has posted-activity evidence. Missing data and a legitimate empty result are distinct.

Keep the account open with `open_connection_pending` when linking fails. Do not infer rejection or close/move money. Reauthentication pauses that customer's refresh; evidence of a product-wide failure pauses new distribution. Preserve last-known data and effective timestamps. Sh1pt consumes redacted readiness/status references, never Access URLs or unrelated accounts.

### 8. Harden the existing SimpleFIN transport and parser

Implement v2-first advertised-version discovery where available and explicit account-request version selection. Pin tested protocol capabilities. Separate v1 and v2 runtime schemas and normalization; malformed v2 cannot trigger a silent fallback. Legacy v1 requires configured policy and visible version. Preserve v2 connection and account identities and structured error scope, including `msg`; unknown error subcodes retain a safe category.

Token exchange runs in a trusted worker with an ephemeral secret reference. No setup token in arguments, events, logs, model prompts or analytics. Encrypt the returned Access URL before acknowledging success; erase setup tokens as soon as no longer required. Ambiguous claims require revoke/reissue guidance, not blind retries.

Use a shared outbound URL policy for claim, access, redirects, metadata, institution and verification URLs. HTTPS and certificate validation are mandatory. Validate allowlisted provider roots, ports, host syntax and resolved public IPs; enforce the checked destination on the actual connection to resist DNS rebinding. Reject private/loopback/link-local/metadata and equivalent IPv6/mapped-address forms. Bound response sizes, timeouts and redirects. Validate each permitted redirect; reject cross-origin credential forwarding. Do not fetch arbitrary optional metadata by default. Test worker and operator entry points as well as user routes.

### 9. Preserve exact money, scoped identity and honest coverage

Reuse CoinPay tables; add upstream v2 connection identity where one platform connection exposes several institution logins with repeated account IDs. Scope transactions through their stable finance account plus source transaction ID; tenant/connection/account validation precedes every upsert. Preserve raw decimal strings and use PostgreSQL numeric or reviewed exact-decimal arithmetic end to end. Do not normalize through JS Number. Document and test existing CoinPay ledger signs before conversion, especially liabilities. Currencies remain separate unless a sourced conversion is disclosed.

Persist requested intervals, returned evidence of coverage, effective balance timestamps and fetched times separately. Absence from a bounded result never deletes a transaction. Pending-to-posted changes need stable IDs or explicit provider replacement evidence; matching description/amount alone is insufficient. Classification keeps transfers, refunds, repayments, loan proceeds and owner contributions out of earned-revenue totals unless supporting evidence establishes otherwise.

One durable per-connection quota covers daily scheduled, manual, retry and backfill requests. Split history to current provider window limits, overlap incremental windows, coalesce concurrent requests and add jitter. Provider limits are versioned configuration, not inferred from successful HTTP responses. Account-specific request charging follows verified provider policy. Enforce quota across every surface and worker restart. Partial results preserve successful accounts while failed accounts keep prior effective dates and visible warnings. Revocation stops polling.

### 10. Compliance, free entitlements and recovery

Version each obligation's rule, source, applicability trigger, timezone and deadline inputs. Receipt/read/reminder dismissal cannot complete a legal task. Record in-app/email delivery attempts and escalation; recurring paid action needs fresh or still-valid bounded authority. Exports include provenance and coverage, exclude live secrets, and enforce account/tenant scope. Subscription cancellation stops future paid work while honoring the disclosed read/export window and legal retention policy.

Separate nonprofit core entitlements from externally priced procurement. Price examples are dated configuration, not checkout constants. Reserve spend atomically with approved operations; include recurring/minimum/support costs in budget review. Quota pressure cannot silently bill free users or discard legally important records. Advertising or model-training consent is not an access condition.

Audit consequential events with actor/entity, hashes, approvals, provider references, correlation, timestamps and outcomes. Use append-only app permissions plus separately retained integrity checkpoints; database administrators are not physically prevented from rewriting storage. Encrypt documents, use expiring authorized access and exclude sensitive data from PWA caching. AI consumes reviewed, minimized context and treats provider documents/transactions as untrusted data.

Restores begin with external dispatch disabled. Reconcile durable operations against provider references before allowing new work. Run off-host database/document restore drills; record measured RPO/RTO against the proposed 15-minute WAL/four-hour targets. These are not an SLA until demonstrated and separately agreed.

## Risks / Trade-offs

- Existing finance ownership is partly merchant/classification based: explicit legal-entity/account-owner mapping is a prerequisite to reuse, not an assumption of isolation.
- Hosted/assisted onboarding leaves visible human steps but avoids inventing bank API entitlement or fixed embedded-banking costs.
- Fail-closed qualification may result in zero offered accounts; formation-only remains a valid product with accurate messaging.
- Shared policy across two repositories needs versioned service contracts and coordinated migrations. Document ownership and deploy compatibility before changing either side.
- A source-backed planning preview still requires rule/template review for any personalized supported output; fake-data demos can exercise code earlier.

## Migration Plan

1. Recheck discovery and current inventories; approve the identity/deployment mapping and map reviewed LogicSRC schemas.
2. Add compatible versioned contracts, SQL records, scope enforcement and deny-by-default activation configuration; exercise fixture-only behavior.
3. Migrate legacy legal/tax and finance identity records into reviewed or quarantined states. Never infer accepted legal outcomes or account authority from labels.
4. Build independent planning, formation and finance capabilities; expand conformance tests and portable exports.
5. Deploy additive schema and readers before enabling writers; retain old identifiers for reconciliation. If an ID maps ambiguously, stop that migration row for review.
6. Enable preview after relevant review/security checks. Activate formation, exact-profile deposit products and later categories independently with recorded evidence.
7. Roll back by disabling dispatch and deploying compatible code; preserve audit and legal artifacts. Reconcile any already initiated external actions rather than reversing database rows to pretend they did not occur.

## Open Questions

No unanswered question changes the documents or the fail-closed preview contract. The following evidence is required before dependent implementation/activation tasks proceed; each task explicitly requests the artifact rather than assuming an answer.

| Question | Owner | Resolution artifact / gate |
|---|---|---|
| Which deployed tenant/entity IDs and scoped service credentials join sh1pt and CoinPay? | Platform + finance leads | Reviewed identity/mapping contract before cross-service writes |
| Does existing hosting meet self-hosted PostgreSQL and off-host backup requirements? | Infrastructure owner | Deployment inventory and measured restore report |
| Which actual filing provider/assisted route is authorized for each CA/federal action? | Product + qualified reviewer | Reviewed scope, terms, templates, signatures, quotes and contracts |
| Which exact products work for business and separately nonprofit profiles? | Integration lead | Real consented qualification records; otherwise catalog remains unavailable |
| What pricing, retail/embedded Bridge terms and subsidy caps apply? | Procurement/product | Dated agreements, configured budget and cost model before spending |
| Which LogicSRC versions map existing task/run/permission/event records? | Platform lead | Version-pinned mapping document and runtime fixtures before declaring compatibility |

Production evidence and provider communication require their own operator authorization. This design does not authorize an agent to contact providers, open test accounts, move money or sign agreements.
