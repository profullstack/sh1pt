---
openprd: '0.3'
id: '0001'
title: Automate nonprofit and business formation with SimpleFIN-verified accounts
status: Draft
authors:
- anthony@profullstack.com
owner: anthony@profullstack.com
repo: profullstack/sh1pt
created: '2026-09-12'
updated: '2026-09-14'
implementation: null
tags:
- entityctl
- sh1pt
- coinpay
- nonprofit
- formation
- simplefin
- banking
- logicsrc
---

## Problem

Founders and nonprofit organizers must repeat the same identity, entity, filing, tax, and banking information across disconnected providers. Completing one step rarely explains whether the next step is ready, what still needs approval, or what the full recurring cost will be. Agents can help assemble a plan, but treating an exported form, a payment, or a bank application as a completed legal outcome creates unacceptable errors.

This release extends **entityctl inside sh1pt**, with **CoinPay as the finance/connectivity integration boundary**. It adds nonprofit and for-profit formation coordination, controlled EIN and S-election workflows, product-qualified banking/card/loan applications, and ongoing compliance. It does not introduce another independent finance database or a new standalone brand. The prior entityctl PRD remains historical product context; this draft narrows the production rollout and adds the new financial-account constraints. [^baseline]

**Non-negotiable product rule: no verified SimpleFIN compatibility, no supported financial-product recommendation or account-opening workflow.** The bank name alone is never sufficient. Every product must be qualified for its actual business/nonprofit profile and connection route, then each customer's resulting account must pass a separate connection check.

### Document scope and implementation status

This is the release-1 PRD, using LogicSRC **OpenPRD 0.3**, plus a companion **OpenSpec spec-driven change bundle**. OpenPRD is LogicSRC's PRD standard; OpenSpec planning bundles are a complementary format, not another name for the same file. [^logicsrc-openprd] [^logicsrc-comparison] [^openspec]

Repository discovery on September 14, 2026 resolved the host as `profullstack/sh1pt` and the existing finance implementation as `profullstack/coinpayportal`. LogicSRC PRD tooling allocated `0001` in this repository's new `prd/` collection; no existing numbered PRD was overwritten. The historical `docs/prd/entityctl.md` remains in place. The companion change is `openspec/changes/add-entityctl-formation-simplefin/`; its `discovery.md` records existing paths, integration gaps, and the command mapping to `sh1pt build entity`. No existing OpenSpec capability inventory was present, so the bundle uses proposed ADDED capabilities.

All product rules, budgets, timelines of work, endpoints, module names, and qualification thresholds below are **proposed requirements**, not claims of shipped functionality. The supplied source notes report checks on September 12, 2026; import-time checks and their limits are recorded separately in the companion `sources.md`. No provider contract was signed, production bank compatibility tested, company formed, or financial account opened while preparing this specification.

## Goals

Deliver one reusable entity profile and a source-backed, resumable plan that identifies the right formation, tax, registration, and financial-setup steps for the declared operating jurisdictions. Automate supported actions after the right approvals; show every assisted step honestly.

Make the core nonprofit software free, with government/provider costs transparently passed through or paid directly. Offer affordable paid business formation/compliance features without requiring expensive embedded-banking infrastructure for the first release.

Require verified SimpleFIN access for every offered financial account, preserve product-level and account-level evidence, and make data freshness and history limits visible. Support a developer-friendly API even when the financial institution's account-opening process remains hosted or assisted.

Ship the same policy and workflow through PWA/mobile-first web, desktop web, CLI, REST API, SDK, and MCP. Preserve sh1pt/CoinPay's existing architecture where it fits; use self-hosted PostgreSQL for the authoritative write-heavy application records.

### Release boundaries

| Stage | User-visible scope | Required exit evidence |
|---|---|---|
| Preview | Planning, jurisdiction assessment, draft packets, fake-data demos | No live side effects; source/rule review; security tests |
| V1 formation pilot | Reviewed US-CA nonprofit/for-profit workflows and US federal steps | Accepted pack, reviewed templates, authorized provider or assisted filing route, consent and recovery tests |
| V1 banking pilot | Verified deposit products and associated debit instruments, separately enabled per business/nonprofit profile | Product qualification plus customer-account check, bank onboarding authority, exact-profile eligibility |
| V1 extension | Credit/charge products only where verified; financing workflow implementation behind a gate | Each category's own compatibility, disclosure, partner, and approval checks |
| P1 expansion | Activated loan/credit-line integrations, additional US jurisdictions, selected international packs, deeper embedded banking | Independent legal, provider, cost, and SimpleFIN verification gates |

A completed formation-only workflow is useful and may be offered explicitly. It must never be marketed as including available banking when no qualifying financial product exists. Optional financing denial does not undo a successfully formed entity.

## Non-Goals

V1 does not become a bank, hold pooled customer bank funds, underwrite loans, guarantee approvals, or supply unlicensed professional services. It does not automatically elect S status for every business, claim nonprofit incorporation creates tax exemption, or claim a receipt proves agency approval.

V1 excludes general-purpose money movement, loan drawdowns, payroll processing, full bookkeeping, automatic tax-return preparation, a registered-agent marketplace, private-foundation/special-category fast paths, complex cross-border tax structuring, specialized subsidiary elections, securities/cap-table tooling, and DAO/token issuance. Checklist/referral/assisted scope must be clearly labeled.

No unsupported bank, card, or loan may be opened through a bypass. Direct APIs, scraped portals, statements, CSV import, affiliate revenue, or premium subscriptions do not waive SimpleFIN qualification. No universal all-country launch, all-bank directory guarantee, free-government-filings claim, or unlimited retail Bridge resale assumption is allowed.

No rewrite to Turso, SQLite, or libSQL for the authoritative application database. No new bespoke UI framework or native mobile/desktop app is required for V1. A separate SimpleFIN server operated by this platform is not needed for the initial release and cannot be used to relabel an unverified upstream feed as compliant.

## Users

| User | Primary need | Authority boundary |
|---|---|---|
| Nonprofit organizer or director | Free software, legitimate governance, formation and exemption guidance, qualified banking | May authorize only within documented organizational authority |
| Small-business founder | Affordable formation, optional eligible S election, transparent recurring obligations | Must review/sign required filings and account agreements |
| Startup-studio operator | Reuse entity data and maintain parent/project/spinout relationships | Ownership relationships do not bypass tax eligibility |
| Accountant, attorney, or delegated operator | Review plans and supporting evidence without excessive permissions | Professional role does not automatically grant bank or signature authority |
| AI agent/integration developer | Typed API/CLI/MCP plans, tasks, and safe resumable execution | Cannot create legal consent, accept debt, or override qualification |
| Platform support/compliance operator | Resolve exceptions and maintain provider evidence | Time-bounded, audited access; cannot declare unsupported products compatible without evidence |

Initial workflows assume English-language support. Residency, entity type, and jurisdiction eligibility come from reviewed product/rule records, not language preference or inferred personal identity.

## Requirements

P0 means required for the applicable V1 capability. P1 means a gated follow-up; it cannot weaken a P0 requirement. The term SHALL is normative. Source notes describe external constraints; all additional safeguards and verification thresholds are proposed product policy.

### Entity Planning

- R1 [P0] **Extend entityctl rather than create a duplicate product.** The system SHALL extend sh1pt's entityctl product area and reuse CoinPay's finance integration boundary for SimpleFIN. Formation records belong to the entity-operations domain; bank connectivity and imported financial data belong to the finance domain. Both SHALL share stable organization/entity references without duplicating secrets, customer balances, or billing records. Existing implementation details must be inventoried before choosing integration paths. The earlier entityctl document is product context, not proof of shipped code. [^baseline]

- R2 [P0] **Model legal structure independently from tax and banking status.** The system SHALL store legal entity type, federal/state tax classifications, exemption applications, EIN status, filings, banking applications, account verification, and compliance obligations as separate records. A nonprofit SHALL use officer/director and authorized-controller roles, not a shareholder-ownership model. Parent-company, project, sponsor, and spinout relationships SHALL be typed explicitly; a sponsor relationship must not imply equity ownership. A change in one track SHALL NOT silently mark another track complete.

- R3 [P0] **Collect operating jurisdictions instead of guessing a cheap formation state.** The system SHALL collect the proposed formation jurisdiction, principal operating address, owner/controller residency where relevant, places of business, employee locations, regulated activities, and declared expansion plans. It SHALL produce a reviewed registration assessment that distinguishes domestic formation, foreign qualification, tax registration, and local licensing. Unknown facts SHALL create review blockers, not confident conclusions. Selecting an out-of-state formation SHALL NOT suppress home-state obligations. Bank service eligibility SHALL be evaluated by where the institution can serve the entity, not only where its headquarters or branches sit.

- R4 [P0] **Publish operation-specific jurisdiction support.** Every jurisdiction pack SHALL advertise supported entity profiles and a separate capability for each action: name check, document preparation, formation filing, exemption assistance, tax election, ongoing compliance, and financial-product availability. Preserve entityctl's Full, Assisted, Read/Compliance, Stub, and Experimental labels for navigation, but never use Full as a blanket promise of bank approval or direct API filing. V1 production rollout SHALL begin with a reviewed US-CA pack plus applicable US federal workflows; other jurisdictions remain explicitly gated. Earlier global launch aspirations do not confer support in this release.

- R5 [P0] **Version and explain every plan.** The system SHALL create reproducible plan versions containing inputs, selected rules and templates, authoritative source references, review dates, required signatures, dependencies, manual steps, quotes, and unresolved questions. Users SHALL see why each task exists. A material input or rule change SHALL invalidate affected approvals and regenerate a comparison, never silently rewrite signed documents. Planning SHALL not incur provider charges or create external applications.

- R6 [P0] **Define completion by requested tracks.** The system SHALL show formation_ready, exemption_ready, finance_ready, and compliance_ready separately, with evidence-backed progress for each requested track. Finance readiness requires every account opened through the workflow to pass post-opening SimpleFIN verification. Optional credit or loan denial SHALL NOT prevent completed formation or an otherwise verified deposit-account setup from being recorded. Customers may expressly choose a formation-only workflow after seeing unavailable banking; they may not bypass compatibility to open an unsupported product through the platform.

### Nonprofit Formation

- R7 [P0] **Provide a genuinely free nonprofit software tier.** The system SHALL offer nonprofit onboarding, eligibility intake, draft documents, filing coordination, basic compliance reminders, account-health visibility, and portable exports without a platform subscription or platform formation-service fee. Government fees, provider work, registered-agent service, banking charges, and any customer-owned SimpleFIN subscription remain separately disclosed. A new nonprofit may enter this tier while recognition is pending; the application SHALL NOT label it IRS-approved. Optional paid professional services must be separately selected, priced, and consented to.

- R8 [P0] **Separate nonprofit incorporation from federal and state exemption.** The system SHALL prepare reviewed incorporation and governance material for supported nonprofit profiles, coordinate the state filing, obtain or record an EIN, and then guide the appropriate exemption application. Federal recognition and state tax/charity requirements SHALL have separate statuses and evidence. The streamlined V1 path targets straightforward charitable public-benefit organizations; complex, regulated, foreign, private-foundation, or special-category cases SHALL route to an explicitly supported review/assistance path rather than reuse an unsuitable template. IRS recognition applications use the applicable Pay.gov process; no public submission API is assumed. [^irs-exempt]

- R9 [P0] **Apply the complete 1023-EZ eligibility screen.** The system SHALL evaluate the current, reviewed IRS eligibility worksheet before selecting Form 1023-EZ. Revenue and asset thresholds alone are insufficient. Every answer SHALL have a user attestation or identified supporting record; unresolved questions or any disqualifying answer prevent the EZ route. The full Form 1023 path SHALL remain available as assisted preparation where contracted support exists. Exemption approval SHALL require the appropriate determination evidence, not payment confirmation. [^irs-1023ez]

- R10 [P0] **Record legitimate nonprofit governance and authority.** The system SHALL collect directors/officers, authorized signers, mission, proposed activities, conflict disclosures, and required governance approvals using jurisdiction-reviewed templates. It SHALL distinguish a nonprofit's public-benefit purpose from a founder's for-profit venture. Free-tier eligibility SHALL NOT be offered as a way to relabel a private business or avoid taxes. Complex insider transactions, ownership-like promises, or incompatible distributions SHALL block the streamlined workflow pending qualified review.

### Business Tax Elections

- R11 [P0] **Check S-election eligibility before offering submission.** The system SHALL support LLC and corporation formation independently of an optional S election. The election screen SHALL check the entity and shareholder eligibility rules, share classes, tax year, requested effective date, and required consents. An ordinary corporation-owned subsidiary SHALL NOT be sent through the standard eligible-individual-shareholder path. Specialized subsidiary elections, trust cases, and late-election relief are out of the automated V1 path. The system SHALL not describe S status as universally cheaper or automatically appropriate. [^irs-scorp] [^irs-2553]

- R12 [P0] **Coordinate EIN applications with authority and duplicate protection.** The system SHALL collect the responsible-party information only through secure forms or approved provider collection and require the applicable signed authority for third-party application. It SHALL check for an existing EIN and pending request before submitting a new one, respect current IRS eligibility and application limits, and store confirmation securely. The displayed IRS EIN fee SHALL be zero; any provider assistance fee is separate. Existing entities SHALL not receive a new EIN solely because they connect to this platform. [^irs-ein]

- R13 [P0] **Track election deadlines, signatures, and acceptance.** The system SHALL calculate election deadlines from reviewed effective-date rules, show the calculation inputs, obtain every required consent, and use a currently accepted filing route. Form 2553 mail/fax coordination SHALL retain delivery evidence without treating delivery as IRS acceptance. Late or ambiguous elections SHALL stop for review; the product SHALL NOT invent reasonable-cause statements. After an accepted election, the plan SHALL surface payroll and recurring federal/state filing obligations through checklists or approved integrations rather than claim payroll is implemented. [^irs-2553] [^ca-scorp]

### Filing Orchestration

- R14 [P0] **Use explicit filing modes with honest human handoffs.** Every filing SHALL identify its mode as direct, provider, assisted, packet-only, or stub. Direct/provider submission requires verified capability, authorization, and a current contract where applicable. Assisted actions SHALL open a secure handoff for the authorized person and resume from captured receipts. Packet-only SHALL never set submitted automatically. CAPTCHA, MFA, attestation, wet-signature, portal restrictions, and legal review SHALL become visible tasks, not obstacles to bypass with stealth browser automation.

- R15 [P0] **Separate provider capabilities from marketing claims.** Each provider adapter SHALL expose a verified capability inventory, supported jurisdictions/entity profiles, production activation status, accepted signature forms, payment method, retrieval route, cancellation limits, and status-update mechanism. CorpNet is a formation candidate, not an already contracted integration. Its published documentation currently describes polling rather than available webhooks, so webhook availability SHALL never be presumed. Any provider's nonprofit incorporation and IRS exemption services must be independently confirmed. [^corpnet]

- R16 [P0] **Require an itemized, approved quote.** Before any paid external action, the system SHALL show government charges, provider service charges, platform charges, recurring obligations, optional add-ons, currency, refund rules, and quote expiry separately. Unknown prices SHALL be marked unknown and block purchase. The approval SHALL bind the quote, legal-entity profile, jurisdiction, document versions, action scope, and maximum amount. A price increase or changed material term requires renewed authorization; no silent upgrade to a paid provider is permitted.

- R17 [P0] **Enforce action-specific authorization.** The system SHALL allow draft creation and plan validation under limited agent authority, but government filings, tax elections, banking applications, credit checks, financing acceptance, guarantees, and payments require appropriately scoped user authorization. A bounded approval may cover an explicitly enumerated filing plan with a spending cap; each provider's own required signatures still apply. Authorization SHALL be revocable until the external action becomes irreversible. A CLI flag, unattended run, or MCP client assertion alone SHALL NOT constitute legal consent.

- R18 [P0] **Prevent duplicate filings and charges across retries.** All consequential requests SHALL use an idempotency key bound to tenant, entity, action, and payload hash. An identical retry SHALL return the original operation; reuse with a different payload SHALL return a conflict. If the provider outcome is unknown after timeout, the workflow SHALL enter reconciling and look up the original order before attempting anything new. The system SHALL not claim universal exactly-once execution by external providers; unresolved ambiguity requires operator review.

- R19 [P0] **Persist documentary proof and realistic cancellation states.** The system SHALL retain authorized receipts, filing identifiers, accepted documents, rejection reasons, and status provenance. Payment receipt, provider acceptance, government filing acceptance, and legal effective date SHALL remain distinct. Duplicate or older callbacks SHALL not regress a completed state. Cancellation SHALL stop unsubmitted work and request cancellation where supported, but SHALL NOT promise to reverse an already accepted filing, opened account, or nonrefundable fee.

### Simplefin Product Eligibility

- R20 [P0] **Make SimpleFIN a non-bypassable financial-product gate.** The system SHALL offer, recommend, refer to for application, or help open a financial product only when that exact product/profile combination has current verified SimpleFIN connectivity. This applies to checking, savings, credit and charge accounts, loans, credit lines, and any future financial-account category. A supported parent deposit account may cover an ordinary debit card only when its transactions appear there and the UI does not promise separate card-account data. Neither a generic bank API nor a CSV/PDF upload substitutes for SimpleFIN support.

- R21 [P0] **Verify the specific product, legal profile, and connection route.** Compatibility records SHALL distinguish institution, actual account-servicing institution where relevant, product identifier, account type, business versus nonprofit eligibility, operating/service jurisdictions, currency, bank login portal, SimpleFIN server/route, and tested protocol version. Accept either institution-native SimpleFIN or a verified bridge route. A directory listing or a successful personal-account connection is discovery evidence only, not business/nonprofit product qualification. Bridge's current directory limits are not a universal geographic limit of the protocol. [^simplefin-overview] [^bridge-directory]

- R22 [P0] **Maintain evidence-backed qualification states.** The catalog SHALL support candidate, testing, verified, degraded, stale, unsupported, and retired states with a reviewer, evidence references, last_verified_at, reverify_due_at, and applicable restrictions. Default policy is expiry after 30 days without qualifying re-verification; this is a product policy, not a SimpleFIN guarantee. Verification SHALL include a consented real account of the exact target profile, two observations separated by at least one day, and relevant existing posted activity. Demo/sandbox fixtures test software but do not certify a bank. Operational evidence can refresh qualification after review without opening a new account.

- R23 [P0] **Test account-type data requirements explicitly.** Deposit qualification SHALL confirm account discovery, currency, dated balance, and retrieval of existing posted deposits/withdrawals. Credit/charge qualification SHALL additionally confirm the debt-balance interpretation and available payment/purchase/refund activity; limits, APR, and due dates get separate capability flags. Loan/credit-line qualification SHALL confirm outstanding balance and retrieval of existing draw/repayment activity required by that product's published profile. Missing required data fails qualification. Individual capabilities SHALL be documented instead of treating optional fields as guaranteed. No test may fabricate or initiate financial activity without separate authorization.

- R24 [P0] **Separate product qualification from a customer account check.** Pre-application qualification SHALL use existing operator-authorized evidence, not ask ordinary customers to open unverified products for testing. After bank approval, each actual customer account SHALL be linked, mapped to its legal entity, and verified separately. A new account with no activity may pass an initial account check when an empty result is legitimate and the product already has transaction evidence; it SHALL not be assigned invented transactions. Approved but unlinked accounts remain account_open_connection_pending, not finance_ready.

- R25 [P0] **Block incompatible products at the server as well as in the interface.** Compatibility SHALL be enforced in the same server policy for PWA, CLI, API, SDK, and MCP. The gate SHALL run both when a product is selected and immediately before application/handoff. Unsupported/stale products may appear only in an administrative research view or an explanatory unavailable state without application links. There SHALL be no administrator override that publishes an unsupported product as compatible; reviewers must supply evidence and legitimately change qualification state.

- R26 [P0] **Handle breakage without hiding it or moving money.** When a connection fails, the system SHALL distinguish customer-specific authentication problems from product-wide degradation. It SHALL alert affected users, retain last-known data with timestamps, and pause new distribution where evidence indicates product failure. Existing unsupported legacy accounts may be inventoried as unverified with restricted metadata, but SHALL not count as supported or bypass onboarding policy. The platform SHALL NOT close accounts, transfer funds, refinance debt, or apply elsewhere automatically when compatibility breaks.

### Financial Onboarding

- R27 [P0] **Use authorized bank onboarding with accurate institution disclosure.** The system SHALL prepare only the information an eligible product requests, prefer provider-hosted identity verification, and obtain the authorized entity representative's consent before starting an application. It SHALL distinguish fintech interfaces from the institution providing the account, disclose applicable product terms, and identify supported operations such as read API, application API, payments, and card management separately. Bank eligibility, nonprofit acceptance, minimums, ownership/residency requirements, and developer access SHALL be verified, not inferred from a generic API page. [^mercury-api] [^column]

- R28 [P0] **Distinguish deposit, debit, charge, and revolving-credit products.** The system SHALL label product types accurately and expose fees, payment terms, required guarantees, credit-check type when supplied, and application prerequisites before consent. Debit-card issuance may be a sub-step of a qualified deposit product; charge cards SHALL not be represented as revolving loans. A product approval SHALL never be inferred from entity formation or an EIN. Financial products SHALL be filtered through the mandatory compatibility policy even when a referral commission is available.

- R29 [P1] **Coordinate financing without promising credit.** The system SHALL implement a gated financing-application workflow for verified loan and credit-line products, with eligibility intake, document requests, submission tracking, provider decisions, and a separately authorized acceptance step. Underwriting and lending remain with the partner. Hard credit pulls, personal guarantees, binding loan acceptance, and drawdowns SHALL require their own explicit approvals and provider disclosures. A declined application SHALL not trigger automatic applications at other lenders. This capability is P1; until a qualifying partner passes all gates, financing is visibly unavailable.

- R30 [P0] **Keep financial data access separate from money movement.** SimpleFIN SHALL be the mandatory read-only connection for every supported account. It SHALL NOT be used or advertised as an account-opening, payment, card-issuance, or lending API. Any write-capable financial operation requires a separate approved provider integration and permission domain. V1 excludes general-purpose account transfers and loan drawdowns. CoinPay may collect platform service fees through its existing supported payment flows, but SHALL not pretend crypto payments directly satisfy government charges or create custody of customer bank funds. [^simplefin-overview]

### Simplefin Sync

- R31 [P0] **Provide v2-first, explicit version compatibility.** The client SHALL implement and test SimpleFIN v2, query the server's advertised versions where supported, and send an explicit version on account requests. Because v2 is currently a draft, each adapter SHALL record tested capabilities rather than rely on the version string alone. Tested v1 connections may remain available only under an explicitly enabled compatibility policy, labeled as v1; the system SHALL not silently downgrade after malformed v2 data. Newly verified products default to v2. Version-specific parsing SHALL be separated from the internal finance model. [^simplefin-v2] [^simplefin-v1]

- R32 [P0] **Claim tokens securely and handle uncertain outcomes.** The system SHALL exchange the one-time setup token only in a trusted backend worker, store the resulting Access URL as an encrypted secret, and erase the setup token when no longer needed. It SHALL handle failed claims without blind repeated claims and explain how the user can revoke/reissue a potentially consumed token. No token, URL credentials, or financial payload may appear in analytics, shell arguments, agent transcripts, crash reports, or ordinary logs. The UI SHALL use a secure input; CLI ingestion SHALL use a hidden prompt or standard input. [^simplefin-v1]

- R33 [P0] **Protect all financial connection URLs from SSRF.** The system SHALL validate decoded claim URLs, returned Access URLs, redirects, institution links, and optional currency-metadata URLs before network access. Require HTTPS with valid certificates; block loopback, private, link-local, cloud-metadata, and disallowed destinations; revalidate DNS resolution and every permitted redirect. Production uses approved provider roots and explicit review for additional native SimpleFIN servers. Credentials SHALL never be forwarded to another origin. The same policy applies to operator-submitted verification URLs, not only customer input.

- R34 [P0] **Keep account identity, ownership, and money semantics stable.** The importer SHALL scope external identifiers by tenant, SimpleFIN server/connection identity, account, and transaction; identical IDs from another connection SHALL never collide. It SHALL preserve raw source amounts and map them through a tested adapter to the existing CoinPay ledger convention. The standard uses positive transaction amounts for money deposited into an account; this must not be confused with a downstream ledger that uses positive amounts for spending. Liability balance interpretation requires product-specific tests. Use exact decimal arithmetic, retain currency, and never combine different currencies without a disclosed conversion. [^simplefin-v1]

- R35 [P0] **Respect polling quotas and historical coverage.** The scheduler SHALL follow each provider's published limits and use a shared quota for all app surfaces using the same connection. Bridge integration SHALL request no more than its allowed daily budget, fetch history in windows no larger than the documented limit, use jitter, and overlap incremental windows. V1 defaults to one scheduled refresh per day plus quota-controlled user requests; scheduled, manual, retry, and backfill traffic share the budget. Store actual returned coverage; requesting a year SHALL not imply a year was available. [^bridge-guide]

- R36 [P0] **Reconcile transactions without duplication or invented completeness.** The importer SHALL upsert stable source transactions and reconcile pending-to-posted changes using provider evidence rather than merchant/amount alone. It SHALL not delete transactions merely because they are absent from a later bounded window. Transfers, refunds, card repayments, loan proceeds, and owner contributions SHALL remain distinct from earned revenue; uncertain classifications must remain visible. A SimpleFIN sync validates data access, not a complete accounting reconciliation or an audited income statement.

- R37 [P0] **Expose partial errors and freshness at account level.** The system SHALL retain successful account updates even when other accounts fail, while recording account/connection error scope and timestamps. It SHALL handle supported v2 structured errors and v1 error responses, sanitize messages, and distinguish provider payment, authentication, rate-limit, and missing-data failures. Every balance view SHALL show its effective timestamp separately from the time the app fetched it. Partial or stale data SHALL not become current merely because the HTTP response was successful. Revoked access stops polling until reauthorized. [^simplefin-v2]

- R38 [P0] **Treat credit details and statements as separately sourced capabilities.** The system SHALL record whether APR, credit limit, minimum payment, due date, loan schedule, and original statements are available from verified supplemental sources. Missing values SHALL be unavailable, not zero. Bank PDFs SHALL retain issuer/source provenance. Reports generated from transaction data SHALL be labeled generated activity reports, never official monthly/quarterly bank statements. Document upload or supplemental APIs SHALL not make an otherwise incompatible account pass the mandatory SimpleFIN gate. [^simplefin-v2]

### Entity Compliance

- R39 [P0] **Maintain source-backed recurring obligations.** The system SHALL generate jurisdiction- and entity-specific obligations for applicable registry reports, nonprofit returns, charity renewals, tax elections, payroll-related tasks, agent renewals, and other approved rules. Each task SHALL carry authority/source, rule version, trigger, timezone, due-date inputs, owner, and evidence needed for completion. Complex applicability questions SHALL route to review. No universal state, tax, or beneficial-ownership deadline may be hardcoded across all entities. BOI rules SHALL be evaluated separately from bank customer-identification requirements. [^fincen]

- R40 [P0] **Make reminders useful without unauthorized filings.** The system SHALL support in-app and email reminders, an accountable owner, escalation for overdue items, and an audit trail of delivery attempts. Marking a reminder read SHALL not mark a filing complete. Recurring submissions require either fresh authorization or a still-valid narrowly scoped standing authorization with a fee cap and applicable signatures. A failed email SHALL remain visible as a delivery failure; an alert does not prove legal compliance.

- R41 [P0] **Export records and continue after cancellation.** The system SHALL allow authorized export of entity metadata, plan versions, documents, receipts, compliance history, and permitted financial data in portable formats. Exports SHALL include provenance, coverage, and known limitations but never live provider secrets by default. Subscription cancellation SHALL stop future paid platform work while preserving a disclosed read/export period and independently identifying outside obligations. Disconnection SHALL stop financial refresh and expose the provider revocation path. Legal retention/hold policy determines deletion timing; the UI SHALL not promise immediate deletion of legally retained records.

### Agent Api Surfaces

- R42 [P0] **Deliver matching mobile-first, desktop, and programmatic surfaces.** The system SHALL expose the same capability and approval model through a mobile-first responsive PWA, desktop-browser experience, CLI, REST API, TypeScript SDK, and MCP. The CLI SHALL support readable output and JSON, stable exit/error codes, resumable operation IDs, and a dry-run mode for plans. An installable PWA is the V1 desktop surface; native desktop packaging is not required. An unavailable feature SHALL be unavailable consistently across every client, not merely hidden from one UI.

- R43 [P0] **Use scoped authorization and safe API contracts.** APIs SHALL authenticate actor and workspace, enforce entity-scoped read/write permissions, validate typed inputs, and expose stable operation statuses. Consequential mutations SHALL require idempotency and applicable approval references. Integrations SHALL use short-lived/scoped credentials where the deployed identity system supports them; cross-service calls SHALL not use broad human administrator tokens. MCP tools SHALL distinguish read, draft, approve-request, and submit actions and return approval instructions without leaking sensitive payloads. User authentication is not a substitute for legal signing authority.

- R44 [P0] **Align LogicSRC contracts without inventing implementations.** The implementation SHALL use reviewed LogicSRC schema versions for compatible tasks, runs, permission records, and events where already supported, and document mappings for new entity-operations records. Persist requirement-to-test traceability and execution evidence. New workspace modules, endpoints, and CLI names in this PRD are proposed contracts until integrated; do not assume an unpublished package or compatibility flag is available. New project-owned code SHALL remain FOSS under the host repository's approved open-source license, with configurable product branding; external bank and filing services are not represented as open-source or free. The repository SHALL retain this PRD plus the OpenSpec change artifacts; drafts SHALL not be auto-marked accepted by an agent. [^logicsrc-openprd] [^logicsrc-comparison]

### Security Audit

- R45 [P0] **Enforce legal-entity and tenant isolation.** Every record access, export, event, secret reference, and background job SHALL be constrained by authorized workspace and entity mappings. A SimpleFIN login that exposes personal and multiple-business accounts SHALL not make all accounts visible to every entity administrator. The account owner SHALL explicitly map accounts; unassigned or conflicting accounts remain quarantined from organization views. Organization membership and account-owner authority SHALL both be checked before a connection is reused. Support staff access requires a logged, time-bounded grant.

- R46 [P0] **Minimize and protect sensitive data.** The system SHALL prefer provider-hosted collection of identity documents, SSNs, and payment-card details; collect sensitive fields directly only when necessary and approved. Encrypt sensitive records, provider keys, and documents; restrict decryption to designated services; use expiring authorized download links and access logging. PWA offline caching SHALL exclude financial payloads, identity material, and signed documents by default. Do not store complete card PAN/CVV or bank login passwords. Configure retention by data class and legal obligation, and redact operational logs.

- R47 [P0] **Keep AI assistance advisory and bound to evidence.** AI agents may explain reviewed rules, identify missing information, or draft nonbinding narratives, but SHALL not invent legal facts, resolve unknown eligibility as true, make attestations, or override deterministic submission policies. Documents, provider messages, and transaction descriptions are untrusted content, not tool instructions. Sensitive identifiers SHALL not enter model prompts by default. Generated legal documents SHALL originate from reviewed templates with provenance and be reviewed by an authorized person before submission.

- R48 [P0] **Maintain tamper-evident audit records and safe payment boundaries.** The system SHALL record actor, entity, action, input/document hashes, approval reference, provider reference, timestamps, and outcome for consequential events without logging sensitive raw inputs. Use append-only application permissions and separately retained integrity evidence; do not claim that an ordinary database table is physically immutable. CoinPay platform billing SHALL reconcile the approved service order without pooling customer government fees in an internal bank balance. Payment, provider submission, and legal acceptance SHALL each have separate reconciliation records.

- R49 [P0] **Gate production on legal, contractual, and security readiness.** Live external actions SHALL remain disabled until the operator has approved the applicable service terms, privacy/data-processing arrangements, filing authority/signature model, provider contracts, and required professional review. Lending/referral activity requires review of applicable licensing and disclosure obligations before activation. The product SHALL not claim banking, legal, tax-preparation, lending, or regulatory credentials it does not hold. These launch gates do not prevent implementing/test-running the software with non-production fixtures.

### Pricing Entitlements

- R50 [P0] **Make prices configurable and external costs explicit.** The system SHALL separate entitlements from provider procurement. The free nonprofit tier has a zero platform software/service fee for the core workflow; businesses may pay a disclosed formation-service fee and an optional ongoing subscription. Plan prices and included limits SHALL be operator-configured rather than embedded in client code. External charges are never included unless explicitly budgeted. No paid plan, referral payment, or administrator role SHALL relax SimpleFIN qualification or consent requirements.

- R51 [P0] **Support customer-owned SimpleFIN access without reselling assumptions.** V1 SHALL support each customer's authorized SimpleFIN connection, including a customer-owned Bridge subscription where needed. Platform pricing SHALL explain that an external subscription may still be required. The advertised consumer subscription is not assumed to license a shared unlimited multi-tenant/reseller service; operator-sponsored or embedded arrangements require explicit provider agreement and cost modeling. The product SHALL not resell financial data or use it for advertising/model training as a condition of the free nonprofit tier. [^bridge-price]

- R52 [P0] **Bound platform spending and subsidy exposure.** The operator SHALL configure a maximum incremental hosting budget, provider spend caps, per-entity usage limits, and nonprofit subsidy rules before launch. Paid external actions require available budget and customer authorization. Free-tier rate limits may delay noncritical work but SHALL never silently charge customers, discard legally important records, or misrepresent required deadlines. Provider minimums, professional review, and support labor SHALL be included in unit economics, not hidden behind low per-request prices.

### Provider Operations

- R53 [P0] **Start with disabled vendor candidates and no invented compatibility.** The seed catalog SHALL contain no verified financial products. Previously discussed Mercury, Column, and Increase are research candidates only; no compatibility, nonprofit acceptance, production pricing, or onboarding entitlement is asserted by their presence. CorpNet and doola may be evaluated for filings with separately verified scope. The first launch SHALL use a small number of contracted providers, hosted onboarding where suitable, and a reviewed jurisdiction pack rather than assuming universal integration.

- R54 [P0] **Expose kill switches and recoverable operator workflows.** Operators SHALL be able to pause new actions by jurisdiction, provider, product, workflow type, or tenant while preserving read access and existing evidence. Failed operations SHALL have an owner, next action, correlation ID, and bounded retry policy. A paused queue SHALL not retry financial or legal actions when restarted without rechecking current approvals, quote validity, and compatibility. Operational views SHALL report external failure separately from platform failure.

- R55 [P0] **Test recovery, conformance, and irreversible-action safety.** Release acceptance SHALL include deterministic adapter tests, representative product-verification evidence, cross-tenant authorization tests, duplicate-submit and timeout tests, secret/SSRF tests, partial-sync and date-boundary tests, and backup/restore drills. Tests SHALL cover all P0 requirements and every enabled P1 capability. Restoring data SHALL not automatically reissue already completed filings or bank applications. Mock fixtures SHALL never be reported as live bank certification.

- R56 [P0] **Use phased release gates rather than unbounded launch promises.** A planning-only preview may ship with all paid external actions disabled. Production filing SHALL require a reviewed pack and provider/assisted route; production banking SHALL additionally require at least one qualified product for the precise entity profile being advertised. A nonprofit banking launch needs nonprofit-specific evidence, not business-only evidence. Credit/loan categories launch independently only after their own approvals and compatibility tests. International packs and direct embedded-banking expansion are P1 follow-ups, not implied V1 coverage.

## UX Notes

### Primary setup journey

Start with a plain-language choice: **Nonprofit**, **Business**, or **Manage an existing entity**. Collect only the minimum information needed for a draft plan. Present the operating-jurisdiction assessment before the filing-state selection is treated as final.

The plan screen separates **one-time costs**, **recurring obligations**, **required signatures**, and **manual steps**. Each cost line carries its source and whether it is government, provider, platform, optional, or unknown. Show “Free nonprofit software; external charges may apply,” not “Form a tax-exempt nonprofit for free.”

After approval, the timeline displays formation, EIN, tax election/exemption, banking, and compliance as independent tracks. Every blocked step identifies the responsible person, reason, next action, evidence needed, and whether waiting affects a deadline. A filing packet export must say “Ready to file,” not “Filed.”

Banking begins with products eligible for the actual legal profile. Product cards show the account type, institution providing the account, supported jurisdiction/profile, required costs, SimpleFIN route/version, verification date, supported data, and the onboarding mode. After opening, guide the owner through SimpleFIN linking, account selection, legal-entity mapping, and initial verification.

An account may display **Open — connection pending** or **Open — data stale**. Neither state implies the account was never opened. Credit applications show the difference between prequalification, submitted, conditionally approved, approved, accepted, funded, and declined. The software must not create a new lender application simply to improve completion metrics.

### Lifecycle model

| Track | Example states | Evidence for completion |
|---|---|---|
| Plan | draft → needs_review → ready → approved → superseded | Approved snapshot and current rules/quote |
| Filing | draft → awaiting_approval → queued → submitted → accepted/rejected; reconciling/needs_information/withdrawal_requested | Applicable agency acceptance and accepted artifact |
| EIN | not_started → authorized → submitted → issued/review_required | Official/provider-retrieved EIN confirmation |
| S election | not_requested → screening → awaiting_signatures → submitted → accepted/rejected/review_required | Applicable IRS response and effective date |
| Exemption | screening → preparation → submitted → additional_information → recognized/denied/withdrawn | Determination evidence; track state separately |
| Account application | draft → consent_required → submitted → needs_information → approved/declined/withdrawn | Provider decision; does not prove connection |
| Financial account | open_connection_pending → mapped → sync_verified → stale/reauth_required/degraded → closed | Provider status plus customer-specific sync evidence |
| Product qualification | candidate → testing → verified → stale/degraded/unsupported/retired | Reviewed, dated profile-specific evidence |
| Compliance obligation | upcoming → open → awaiting_approval → submitted → complete; overdue/needs_review | Required filing/completion evidence, not reminder dismissal |

These are proposed application states. Adapters retain raw provider states and a versioned mapping. A single global “active” flag must not replace them. The `account_open_connection_pending` term in R24 maps to the financial account's `open_connection_pending` state; it is not a second lifecycle.

### Proposed CLI contract

These examples describe commands to implement or map onto existing sh1pt/CoinPay commands. They are not claims that these commands already exist. Repository discovery mapped the supplied `sh1pt entity` examples to the existing `sh1pt build entity` command namespace. CoinPay command spellings remain proposals until its CLI integration tasks are completed.

```bash
# Read/plan operations do not buy services or file anything.
sh1pt build entity init community-lab --type nonprofit --jurisdiction US-CA
sh1pt build entity plan generate community-lab --dry-run --json
sh1pt build entity quote community-lab --json
sh1pt build entity status community-lab --json

# Open a secure, human approval session; do not place identifiers in shell flags.
sh1pt build entity approval request community-lab --scope filing-plan
sh1pt build entity filing submit community-lab \
  --approval appr_example --idempotency-key op_example

# Only verified products can be returned as available.
sh1pt build entity banking products community-lab --simplefin verified --json
sh1pt build entity banking apply community-lab --product product_example \
  --approval appr_bank_example --idempotency-key bank_example

# Hidden prompt, never a literal setup token in a command argument.
coinpay finance connect simplefin --entity entity_example
coinpay finance sync --entity entity_example --json
sh1pt build entity compliance list community-lab --json
```

CLI JSON responses include operation_id, state, next_action, errors, and relevant evidence/coverage references. Secrets are never part of normal output. Permission, qualification, expired-quote, and review-required errors are distinguishable without parsing prose.

### Surface and accessibility rules

Use a mobile-first stepper with save/resume, clear primary actions, visible status text, and accessible keyboard navigation. Desktop web adds a review table and document comparison, not different permissions. Do not rely on color alone for health/status. Long-running operations use durable operation IDs and server status rather than forcing users to keep a tab open. Offline PWA behavior covers the shell and non-sensitive help, not financial records.

### Launch-critical acceptance journeys

The OpenSpec bundle contains one or more WHEN/THEN scenarios for every R-number. In addition, release testing must demonstrate a nonprofit incorporation/exemption path, an eligible business/S-election path, an ineligible-owner block, a multi-jurisdiction review, an unverified-card block, a post-opening link failure, a partial-sync warning, a mixed personal/business connection, and a timeout after paid provider acceptance. All live product claims require production evidence distinct from these mockable software tests.

## Tech Stack

### Runtime and existing-system policy

Use the current Profullstack conventions: **TypeScript, ESM, Bun plus supported Node.js runtime compatibility, pnpm workspaces, Docker/Compose, and Railway or existing self-hosted infrastructure**. Pin actual versions in the implementation repository rather than treating this PRD as a dependency upgrade order.

Use the existing Next.js application for the PWA/web surfaces and shadcn/ui components for the new screens. Reuse the existing application router; Hono is appropriate for a shared API boundary where already deployed, but do not introduce a parallel API simply to satisfy a stack preference. Preserve the existing authentication flows and CoinPay identity integration. Authentication, organizational authority, provider KYC, and legal signature are separate checks.

**Self-hosted PostgreSQL is mandatory for authoritative application data. No Turso, SQLite, or libSQL.** Use the existing migration/query tooling; introduce Drizzle only where it matches the repository. PostgreSQL owns durable operation, approval, idempotency, quote, and audit records. Redis/BullMQ is appropriate for scheduled work, retries, and quotas; Redis is not the system of record.

Reuse the existing encrypted object/document store or an S3-compatible store with private access. A protected volume is acceptable for an initial single-host deployment only with tested off-host backups and appropriate encryption/access controls. Do not put document contents in publicly accessible buckets. Reuse the existing email provider, such as Resend, for reminders; no separate marketing-automation project is required.

### Domain ownership and deployment topology

```text
PWA / desktop web / CLI / SDK / MCP
                 |
      shared API policy + approvals
                 |
      sh1pt entityctl orchestration
       |           |             |
 jurisdiction   filing        compliance
    packs       adapters       engine
       |           |             |
       +---- PostgreSQL + outbox-+
                 |
       async workers / rate limits
                 |
      CoinPay finance integration
       |                       |
 SimpleFIN read adapter   approved provider onboarding
       |                       |
 qualified financial     bank / card / lending partner
 data connections        (decision authority stays here)
```

The diagram expresses logical boundaries, not a requirement for microservices. Begin with the smallest deployable set supported by the existing repositories: web/API, worker, PostgreSQL, and the already-used queue/document/notification services. Avoid Kafka, Kubernetes, a data warehouse, or a proprietary bank-aggregation dependency for V1 without measured need.

Cross-service exchange should use stable entity IDs, signed/scoped service identity, correlation IDs, and only the minimum authorized finance data. Never copy a broad SimpleFIN Access URL into a task, a shared event bus, or sh1pt's public entity metadata.

### Proposed persistent objects

| Object | Critical fields / constraints |
|---|---|
| Entity / EntityRelationship | tenant_id, entity_id, legal_type, legal_name, jurisdiction, tax_profile, typed relationship; no nonprofit equity inference |
| EntityParty / AuthorityGrant | role, scope, verification evidence, valid_from/until, redacted identity reference |
| JurisdictionPack / RuleVersion | jurisdiction, entity profiles, operation capabilities, sources, effective/review dates, reviewer, release state |
| FormationPlan / PlanVersion | immutable snapshot hash, rule/template versions, dependencies, blockers, selected scope |
| Quote / QuoteLine | charge type, amount, currency, external payee, recurring/refund terms, expires_at |
| Approval | actor, entity, action list, quote/document hashes, cap, expiry, revocation, signature evidence |
| FilingOperation / ProviderOperation | idempotency key, payload hash, provider reference, raw/mapped status, reconciliation state |
| DocumentArtifact | entity, classification, issuer/source, hash, storage reference, retention class, access policy |
| FinancialProduct | institution and servicer, product identifier/type, profile/jurisdiction, terms, API/onboarding capabilities |
| SimplefinQualification | product/profile/route/version, evidence, required-data profile, reviewer, state, verification and expiry |
| FinanceConnection | owner/tenant, approved server, encrypted secret reference, selected version, consent, quota/health |
| FinancialAccountMapping | stable finance account ref, legal entity, mapping authority, product qualification ref, account-check status |
| SyncRun / CoverageInterval | requested versus returned interval, errors, account-level outcomes, fetched_at, source effective times |
| ComplianceObligation | rule/version, applicability, due-date inputs/timezone, owner, evidence, state |
| AuditEvent / OutboxEvent | correlation, actor, subject, approval/provider refs, redacted payload hash, delivery state |

The actual CoinPay account/transaction tables should be reused after inspection, not recreated from this naming sketch. Preserve raw versus normalized amounts and source provenance. Unique keys must scope external IDs sufficiently to avoid cross-connection and cross-tenant collisions. Store currency amounts in exact numeric representations; do not use binary floating point for financial calculations.

### Proposed REST operations and MCP mapping

Paths below are relative proposals; mount them within the existing versioned API and preserve existing finance routes where present. Discovery selects sh1pt's Next.js `/api/v1` boundary for entity routes; existing CoinPay `/api/finances` routes are extended in place with the same policy semantics rather than duplicated.

| REST operation | Purpose | Consequential-action gate |
|---|---|---|
| `POST /v1/entities` | Create draft workspace | Entity-scoped write permission |
| `POST /v1/entities/{id}/plans` | Generate reviewed-rule plan | Draft only; no external side effects |
| `POST /v1/entities/{id}/quotes` | Retrieve itemized quote | No purchase by itself |
| `POST /v1/approvals/requests` | Start secure human approval | Authenticated requester; does not itself create legal consent |
| `POST /v1/entities/{id}/filings` | Submit approved filing operation | Valid approval, current quote, adapter/jurisdiction gate, idempotency |
| `GET /v1/operations/{id}` | Read current state and next action | Workspace/entity read scope |
| `GET /v1/entities/{id}/financial-products` | Eligible product listing | Return available only after qualification policy |
| `POST /v1/entities/{id}/financial-applications` | Begin approved bank/card/loan flow | Compatibility recheck, actor authority, separate consent, idempotency |
| `POST /v1/finance/simplefin/connections` | Claim setup token securely | Finance-owner authority; backend token exchange only |
| `POST /v1/finance/account-mappings` | Map selected accounts to entity | Account-owner and organization authority |
| `POST /v1/finance/sync-runs` | Request quota-controlled sync | Authorized read connection, coalescing and rate limit |
| `GET /v1/entities/{id}/compliance` | List obligations and provenance | Scoped read |
| `POST /v1/entities/{id}/exports` | Generate protected export | Export permission, reauthentication for sensitive bundle |

For MCP, map these into read tools, draft tools, approval-request tools, and gated submit tools. Do not expose a tool that lets an agent manufacture its own approval artifact. Standard errors include APPROVAL_REQUIRED, APPROVAL_EXPIRED, SIMPLEFIN_UNVERIFIED, SIMPLEFIN_STALE, PROFILE_UNSUPPORTED, JURISDICTION_UNSUPPORTED, QUOTE_EXPIRED, IDEMPOTENCY_CONFLICT, RATE_LIMITED, PARTIAL_DATA, REAUTH_REQUIRED, and PROVIDER_RECONCILING.

### Proposed adapter contracts

```ts
// Contract sketch, not a claim of published packages or provider endpoints.
interface FilingAdapter {
  capabilities(): Promise<CapabilitySnapshot>;
  validate(input: FilingDraft): Promise<ValidationResult>;
  quote(input: FilingDraft): Promise<ItemizedQuote>;
  submit(input: ApprovedFiling): Promise<ProviderOperation>;
  reconcile(ref: ProviderReference): Promise<ProviderOperation>;
  documents(ref: ProviderReference): Promise<DocumentReference[]>;
  requestCancellation(ref: ProviderReference): Promise<CancellationOutcome>;
}

interface FinancialOnboardingAdapter {
  eligibility(input: EntityProductProfile): Promise<EligibilityResult>;
  terms(productId: string): Promise<VersionedTerms>;
  begin(input: ApprovedFinancialApplication): Promise<HostedFlowOrOperation>;
  reconcile(ref: ProviderReference): Promise<ProviderOperation>;
}

interface SimplefinReadAdapter {
  discoverVersions(serverRef: ApprovedServerReference): Promise<VersionSupport>;
  claim(tokenRef: EphemeralSecretReference): Promise<ConnectionReference>;
  read(input: AuthorizedAccountRead): Promise<NormalizedAccountSet>;
  health(connection: ConnectionReference): Promise<ConnectionHealth>;
}
```

All referenced types must be implemented with runtime validation and schema versioning. The orchestration layer, not an individual UI or provider adapter, applies tenant, approval, qualification, quota, and spend policy. Application start URLs must be tied to an authorized operation and must not leak sensitive data through query strings.

### SimpleFIN compatibility record example

This is a proposed internal record, **not a new SimpleFIN protocol object**. All values below are fictional and intentionally unavailable.

```json
{
  "product_id": "example-business-checking",
  "institution_id": "example-institution",
  "account_type": "checking",
  "entity_profile": "us_nonprofit_public_benefit",
  "service_jurisdictions": ["US-CA"],
  "route_kind": "bridge",
  "server_ref": "approved-server-reference",
  "login_portal_ref": "business-login-reference",
  "tested_protocol_versions": [],
  "required_data_profile": "deposit-balance-posted-activity-v1",
  "qualification_status": "candidate",
  "last_verified_at": null,
  "reverify_due_at": null,
  "evidence_refs": [],
  "production_enabled": false
}
```

Required account reads use the currently supported official SimpleFIN contract. The client is v2-first; legacy v1 behavior is tested and visibly selected only when policy permits. Account/type classification is internal mapping, not a guaranteed standardized field. No code may assume extra credit terms, unlimited history, official statement endpoints, or universally unique IDs. [^simplefin-v2]

### Transactions, retries, and recovery

Use PostgreSQL transactions to reserve an idempotent operation and persist an outbox event atomically. A worker claims durable work, rechecks the current policy/approvals, and calls the provider. Provider references and response hashes are saved before a completed event is emitted. If an external result is ambiguous, switch to reconciliation rather than resubmission.

Use scheduled SimpleFIN reads with a per-connection budget shared by all clients. Start with one daily poll; use incremental overlap and bounded backfill. Pause revoked/expired connections rather than retrying indefinitely. Product requalification is independent from polling each customer's live data.

Maintain database backups with off-host retention, document backups, and a tested restore runbook. Proposed pilot recovery objectives are an RPO of 15 minutes when WAL archiving is enabled and an RTO of four hours; these are engineering targets requiring demonstrated infrastructure, not a customer SLA. Restores start with external mutations disabled until reconciliation completes.

### Implementation handoff and validation

The companion bundle includes `proposal.md`, `design.md`, `tasks.md`, capability delta specs, a requirement traceability file, and source notes. Discovery found no existing OpenSpec inventory in sh1pt. Recheck before application if the repository has changed; reuse matching paths and convert ADDED blocks to appropriate full MODIFIED blocks where needed. Do not create duplicates or blindly archive them.

```bash
# Run from the sh1pt repository using the recorded tool versions.
logicsrc prd index --write
logicsrc prd validate --strict
openspec validate add-entityctl-formation-simplefin --strict
node scripts/validate-entityctl-spec.mjs
```

This delivery receives schema/layout, requirement-numbering, scenario, task, link, and traceability checks. Tool execution results are recorded in the companion `validation.md`; live provider conformance and application acceptance tests are separate checks and are not claimed by document validation.

## Monetization

### Proposed packaging, not a production price commitment

| Tier | Platform charge | Included platform capabilities | Separately paid |
|---|---:|---|---|
| Nonprofit Core | **$0** | Core formation/exemption coordination, basic reminders, document vault, qualified-account connection/status, portable exports | Government/provider/registered-agent charges; external SimpleFIN subscription where needed |
| Business Formation | **Proposed $99 one-time** | Supported formation workflow, approvals, document/status tracking, EIN coordination, qualified-bank application handoff | All government/provider fees and optional services |
| Business Compliance | **Proposed $9/month or $90/year** | Basic recurring compliance, account-health alerts, team review, standard API/CLI/MCP use under quotas | Paid filings, professional services, third-party subscriptions |
| High-volume/API or professional service | Quote required | Explicitly contracted higher usage or specialist assistance | Only terms explicitly agreed with customer |

The $99/$9/$90 numbers are product-planning assumptions to test against provider costs and support labor; they are not current vendor quotes or approved live pricing. A business may buy formation without agreeing to an automatically renewing compliance plan. S-election preparation and professional exemption assistance must state exactly whether they are included or separately priced.

The core nonprofit software remains free while exemption is pending; abuse review may change eligibility, but must not retroactively charge without consent. Compliance deadlines and external costs must stay visible even when a free-tier usage limit is reached. No financial-data sale or model-training consent is required for the free tier.

### Known external fee examples

The supplied September 12, 2026 source notes list **$275 for Form 1023-EZ** and **$600 for Form 1023**. These do not include state incorporation, charity registration, professional preparation, or other applicable costs. An EIN obtained directly from the IRS has no IRS fee. Store these figures as dated, sourced configuration rather than constants in checkout, and revalidate before activation. [^irs-fees] [^irs-ein]

The supplied September 12, 2026 source notes list SimpleFIN Bridge at **$1.50/month or $15/year plus tax**, within its stated connection/app limits. V1 assumes a customer-owned authorized connection, not unlimited platform resale. A nonprofit's free software tier therefore does not by itself guarantee free aggregation service. Revalidate pricing and terms before activation. [^bridge-price]

### Lean-build procurement policy

Prefer a small contracted formation provider plus secure hosted/assisted bank onboarding, using the existing CoinPay read integration. Do not commit to an embedded-banking monthly minimum merely to make the signup look more seamless.

A proposed pilot target is **no more than $150/month of incremental infrastructure**, excluding existing hosting, customer pass-through charges, paid professional/legal/security review, and support labor. This is an operator budget target, not a measured quote. Any new fixed vendor minimum needs a written budget decision. Forecast per-entity contribution after support, provider failures, refunds, storage, sync, and notification cost before launching a paid tier.

Referral revenue may fund free nonprofit software only where agreements and applicable rules permit and disclosures are clear. Ranking still prioritizes product eligibility, verified SimpleFIN support, customer cost, and suitability; commissions never bypass a gate. No revenue from credit decisions or bank custody is assumed in the base model.

## Success Metrics

These are launch targets to instrument, not observed results.

| Metric | Target / interpretation |
|---|---|
| Financial-product qualification coverage | 100% of offered financial products have current profile-specific evidence |
| Account-level readiness | 100% of accounts labeled sync_verified have a successful mapped-account check and dated data |
| Approval coverage | 100% of consequential actions reference valid authority and required approvals |
| Duplicate external actions | Zero platform-caused duplicates in fault-injection tests; monitor production incidents separately |
| Unsupported product bypasses | Zero successful attempts through any client or API |
| Transparency | 100% of financial views show data timestamps; 100% of partial results show limitations |
| Free nonprofit promise | Zero undisclosed platform charges or silently selected external add-ons |
| Draft plan speed | 95% of complete-input, supported-profile dry-run plans within 60 seconds, excluding external/manual review |
| Submission traceability | 100% of submitted operations retain provider reference or explicit reconciling state |
| Compliance reminders | At least 99% of scheduled platform reminder jobs attempted by their configured schedule; delivery tracked separately |
| Security and isolation | All cross-tenant, secret-redaction, SSRF, and approval-bypass P0 tests pass |
| Unit economics | Positive contribution for paid workflows after actual provider/support costs; measured before scaling |

Track time separately for platform work, user waiting, professional review, provider processing, agency processing, and bank underwriting. Do not hide external delays inside a single instant-formation claim or penalize users for declining a loan. Formation approval and bank acceptance rates are diagnostic metrics, not guaranteed service levels.

Every requirement is mapped to at least one acceptance scenario in the companion OpenSpec bundle. All P0 behaviors and every enabled P1 behavior must pass before their production capability is enabled.

## Risks & Open Questions

### Decisions made for this draft

This is an entityctl/sh1pt extension with CoinPay finance reuse; US-CA is the initial reviewed-state target; federal workflows are separate. Nonprofit core software is free, external fees are transparent, and financial compatibility is mandatory per product and profile. V2 is the primary SimpleFIN target with only explicit, tested legacy compatibility. PostgreSQL is the authoritative database. Hosted/assisted financial onboarding is acceptable for the inexpensive first release. Loans and international expansion are independently gated follow-ups.

### Production blockers with an owner and evidence requirement

| Blocker / risk | Owner | Evidence needed before enabling affected feature |
|---|---|---|
| Exact-profile banking compatibility is unknown | Integration lead | Consented representative real-account evidence and post-opening verification tests; no candidate is pre-approved |
| Nonprofit account eligibility differs from business eligibility | Provider/compliance lead | Written product eligibility and nonprofit-specific connection evidence |
| Formation provider costs/minimums are unknown | Product/procurement owner | Contracted scope, quote schedule, refunds, signature routes, production credentials |
| Exemption and S-election support can exceed software authority | Qualified legal/tax reviewer | Approved intake rules, templates, signature/filing channels, review/exception workflow |
| State/local and foreign-qualification scope is uncertain | Jurisdiction-pack owner | Versioned primary-source research and reviewed applicability logic for launch profiles |
| Financial referral/lending rules may impose obligations | Qualified counsel + product owner | Approved agreements, required licensing/disclosures, permitted referral/onboarding scope |
| SimpleFIN Bridge business/nonprofit usage and sponsorship terms | Integration/procurement owner | Provider confirmation appropriate to deployment; no assumption from retail pricing alone |
| Bank/fintech API documentation is not an onboarding entitlement | Integration lead | Tested contracted application route and supported jurisdiction/entity profile |
| Partial/stale data could mislead users | Finance lead | Account-level error/coverage display and money/sign/transfer tests |
| External actions cannot always be undone | Platform lead | Idempotency, reconciliation, proof retention, no false rollback behavior |
| Credentials and identity documents create security exposure | Security owner | Threat model, isolation tests, encrypted storage/access controls, retention and incident runbooks |
| Existing code has gaps against this release | Implementer | Complete the reuse/migration work recorded in companion discovery and tasks; initial inspection is not a production audit |
| Budget assumptions may be too optimistic | Product owner | Incremental infrastructure bill plus actual support/professional-review and partner unit economics |

### Candidate shortlist — all financial support unverified

| Candidate | Why it merits evaluation | What must not be assumed |
|---|---|---|
| CorpNet | Public formation/compliance API | Nonprofit exemption service scope, partner pricing, authorization, or available webhooks without verification [^corpnet] |
| doola | Alternative formation/onboarding provider | Nonprofit scope, final commercial terms, and production entitlement [^doola] |
| Mercury | Existing-account developer API | Embedded-opening agreement, nonprofit eligibility, or SimpleFIN support [^mercury-api] |
| Column | Developer-facing bank infrastructure | Affordable minimums, applicable product eligibility, or SimpleFIN support [^column] |
| Increase | Candidate raised in discovery conversation | All exact product scope, contract costs, eligibility, and SimpleFIN support; not researched/approved in this delivery |

No candidate may appear as an available financial recommendation until the catalog gate passes. Another institution may be selected instead if it satisfies the requirements at lower cost. A native SimpleFIN or other properly verified bridge route can extend coverage beyond SimpleFIN Bridge's stated geography, but no such route is qualified by this document.

### Rule freshness and review

Do not ship one-time research as permanent law. Rules, provider terms, fees, and product support need owners and effective/review dates. In particular, the supplied FinCEN source notes distinguish US-created entities from qualifying foreign-created reporting companies; older generic BOI checklists can be misleading. Revalidate the rule before activation. Bank identity requirements remain a separate process. [^fincen]

This document is a product/engineering specification, not a substitute for the operator's legal or tax review. Unresolved production gates are explicit feature-activation blockers, not permission for an agent to guess. A planning-only release remains possible while those gates are closed.

### Sources and provenance

The footnotes identify primary-source documentation and internal context supplied with the draft. September 12 retrieval dates describe the supplied draft's provenance, not independent legal/provider verification during repository import. Proposed platform behavior and budget assumptions are labeled as such. See companion `sources.md` for import-time checks. Revalidate time-sensitive sources at implementation and before production activation.

[^baseline]: Supplied internal source: `sh1pt-entityctl-subfeature-prd.md`, Draft v3, April 20, 2026; reported retrieved from the user's Library on September 12, 2026. The Library artifact was not independently accessed during import. The repository contains related historical Draft v3.1 at `docs/prd/entityctl.md`, inspected September 14, 2026. This release preserves entityctl's sh1pt parent, typed jurisdiction packs, explicit filing modes, and audit model. Earlier proposed geographic rollout is not evidence of implemented coverage.

[^logicsrc-openprd]: LogicSRC, OpenPRD: https://logicsrc.com/openprd and front-matter schema: https://github.com/profullstack/logicsrc/blob/master/packages/schemas/schemas/openprd-prd.schema.json . Supplied retrieval date September 12, 2026; local reference code inspected during import. PRD format 0.3 has ten ordered sections.

[^logicsrc-comparison]: LogicSRC, LogicSRC and OpenSpec.dev: https://logicsrc.com/docs/openspec-comparison . Describes the distinction between the coordination standards and repo-local OpenSpec planning. Supplied retrieval date September 12, 2026; compatibility commands are documented direction, not a production integration verified in this work.

[^openspec]: Fission-AI, spec-driven schema: https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml . Source for proposal/design/tasks and requirement/scenario bundle conventions. Supplied retrieval date September 12, 2026; schema also inspected during import.

[^simplefin-overview]: SimpleFIN, overview: https://simplefin.org/ . SimpleFIN is read-only financial-data interchange. Supplied retrieval date September 12, 2026.

[^simplefin-v2]: SimpleFIN, Protocol v2: https://www.simplefin.org/protocol.html . Labeled `2.0.0-draft` in supplied September 12, 2026 notes and during import-time inspection. Source for explicit version negotiation, connection/error modeling, and optional data fields. Pin and revalidate the actual provider behavior before implementation.

[^simplefin-v1]: SimpleFIN, Protocol v1: https://www.simplefin.org/protocol-v1.html , linked by the current specification's Older versions section. Use the official v1 page and current implementation tests for legacy parsing; v2 is the primary target. The token/claim and transaction sign semantics referenced here were reported verified in the current v2 specification on September 12, 2026.

[^bridge-guide]: SimpleFIN Bridge, Developer Guide: https://beta-bridge.simplefin.org/info/developers . Supplied September 12, 2026 notes: intended for daily updates, expected 24 or fewer requests per day, separate quota behavior for individual-account requests, maximum 90-day request windows, variable available history, and overlapping-window guidance. These are provider limits, not the platform's proposed 30-day product-qualification expiry.

[^bridge-directory]: SimpleFIN Bridge, Supported Institutions: https://beta-bridge.simplefin.org/search-institutions . Supplied September 12, 2026 notes: US/Canadian versions of institutions; a listing does not prove the specific product or legal-entity profile works.

[^bridge-price]: SimpleFIN Bridge, pricing: https://bridge.simplefin.org/ . Supplied September 12, 2026 price: $1.50 per month or $15 per year, plus tax, with up to 25 institutions and 25 apps. This is not a verified multi-tenant reseller agreement.

[^irs-exempt]: IRS, Applying for tax exempt status: https://www.irs.gov/charities-non-profits/applying-for-tax-exempt-status . Source for exemption-application routes and Pay.gov submission. Supplied retrieval date September 12, 2026.

[^irs-1023ez]: IRS, Instructions for Form 1023-EZ: https://www.irs.gov/instructions/i1023ez . Use the complete eligibility worksheet, not size thresholds alone. Supplied retrieval date September 12, 2026.

[^irs-fees]: IRS, Form 1023 and 1023-EZ user fees: https://www.irs.gov/charities-non-profits/form-1023-and-1023-ez-amount-of-user-fee . Supplied September 12, 2026 amounts: $600 for Form 1023 and $275 for Form 1023-EZ, payable through Pay.gov; amounts can change.

[^irs-scorp]: IRS, S corporations: https://www.irs.gov/businesses/small-businesses-self-employed/s-corporations . Source for S-election eligibility, shareholder restrictions, and required consents. Supplied retrieval date September 12, 2026.

[^irs-2553]: IRS, Instructions for Form 2553: https://www.irs.gov/instructions/i2553 . Source for eligible-entity treatment, effective-date/deadline rules, signature requirements, filing routes, and acceptance evidence. Supplied retrieval date September 12, 2026. Recheck current filing addresses/channels instead of embedding them in application code.

[^irs-ein]: IRS, Get an employer identification number: https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number . Source for free direct EIN applications, signed third-party authorization, eligibility, and application limits. Supplied retrieval date September 12, 2026.

[^ca-scorp]: California FTB, S corporations: https://www.ftb.ca.gov/file/business/types/corporations/s-corporations.html . Source for California tax treatment and recurring obligations; figures/rules require effective-date-aware review. Supplied retrieval date September 12, 2026.

[^fincen]: FinCEN, Beneficial Ownership Information Reporting: https://www.fincen.gov/boi . Supplied September 12, 2026 notes state US-created entities are exempt under the published interim final rule and distinguish foreign-created reporting companies. Do not reuse obsolete universal BOI checklists; this does not replace bank identification requirements. Revalidate before use.

[^corpnet]: CorpNet, Formation and compliance API: https://www.corpnet.com/corpnet-api/ . Supplied September 12, 2026 notes describe formation capabilities, partner access, pricing/order/status operations, and unavailable webhooks. No production contract or quote was obtained.

[^doola]: doola, Formation API: https://www.doola.com/formation-api/ . Alternative provider candidate for contracted formation/onboarding scope. Supplied retrieval date September 12, 2026; nonprofit/API scope and actual commercial terms must be independently confirmed.

[^mercury-api]: Mercury, Getting Started: https://docs.mercury.com/docs/getting-started . Existing-account API documentation does not establish an embedded-opening agreement or SimpleFIN qualification. Supplied retrieval date September 12, 2026.

[^column]: Column, platform overview: https://column.com/ . Developer-facing banking infrastructure candidate, not evidence of SimpleFIN compatibility or a low-cost commercial arrangement. Supplied retrieval date September 12, 2026.
