# Implementation tasks

All tasks below are pending implementation or release verification. Document validation does not complete them. The PRD remains Draft. R29 is P1 and disabled until its independent gates pass. See discovery.md for work already done during specification import.

Dependencies: each phase builds on the preceding contract/foundation phases. Phase 6 defines qualification/account-check contracts with fixtures; phase 7 supplies the real adapter. Real qualification and production activation wait until phase 11. Cross-repository finance tasks apply to profullstack/coinpayportal and require its current inventory to be rechecked. Unknown provider/legal/deployment evidence is a blocking input to the affected task, never a guessed default.

## 1. Discovery and integration contracts

- [ ] 1.1 R1: Recheck the repository inventory and approve sh1pt/CoinPay data ownership and service identity mappings; verify a reviewed contract names reused routes, stable entity references and no duplicated finance secrets/balances/billing.
- [ ] 1.2 R44: Pin reviewed LogicSRC schema versions and document task/run/permission/event mappings; verify compatible fixtures and retain requirement-to-test evidence with FOSS license/branding and Draft lifecycle intact.

## 2. Durable records, authority and security

- [ ] 2.1 R2: Add versioned legal, tax, filing, exemption, EIN and finance track schemas plus typed party/relationship records; verify nonprofit governance and independent-state scenarios.
- [ ] 2.2 R2: Write additive SQL and legacy mapping/quarantine migrations; verify migration fixtures never infer legal structure from s-corp or ownership from sponsor/parent labels.
- [ ] 2.3 R43: Implement shared runtime request validation and scoped actor/workspace/entity API and service identity checks; verify unauthorized reads, bad inputs and missing approval/idempotency rejection before side effects.
- [ ] 2.4 R45: Add authoritative account-owner/entity mapping and quarantine rather than name-based ownership; verify mixed personal/multi-business feeds and conflict cases.
- [ ] 2.5 R45: Enforce tenant/entity scope on queries, jobs, events, exports and secret references plus expiring audited support grants; verify negative access cases at every boundary.
- [ ] 2.6 R46: Integrate encrypted private document/secret storage with designated decryption and expiring authorized downloads; verify redacted logs, sensitive-cache exclusion, hosted intake and retention holds.
- [ ] 2.7 R47: Bound AI inputs to minimized reviewed context and template provenance; verify injected document/transaction instructions cannot grant authority or resolve unknown facts and signed submission needs review.
- [ ] 2.8 R16: Persist itemized quotes and approval-bound hashes, terms, expiry and caps; verify unknown costs, changes, expired quotes and silent add-ons cannot charge.
- [ ] 2.9 R17: Build secure human approval requests, authority/scope checks, signature evidence and revocation; verify agent assertions cannot mint consent and mismatched/revoked approvals block dispatch.
- [ ] 2.10 R18: Add transactional idempotency reservation and outbox records; verify concurrent identical retries return one operation and altered payloads conflict.
- [ ] 2.11 R18: Implement worker leases, unknown-outcome reconciliation and bounded retries; verify paid-provider acceptance followed by timeout never creates a second order.
- [ ] 2.12 R19: Implement versioned provider-state transitions, proof retention and cancellation semantics; verify duplicate/older callbacks cannot regress acceptance or promise irreversible rollback.
- [ ] 2.13 R48: Persist append-only application audit and separately retained integrity checkpoints; verify tamper detection and redacted consequential event fields.
- [ ] 2.14 R48: Add separate service-payment/provider-submission/agency-acceptance reconciliation records; verify a paid order cannot imply legal acceptance or custody of government fees.

## 3. Source-backed entity planning

- [ ] 3.1 R3: Implement operating-jurisdiction intake and a reviewed registration-assessment rule interface; verify out-of-state formation retains home/employee obligations and unknowns block conclusions.
- [ ] 3.2 R4: Replace blanket US-pack capabilities with operation/profile gates and a reviewed US-CA plus federal pack inventory; verify unreviewed actions/jurisdictions remain disabled.
- [ ] 3.3 R5: Persist canonical plan snapshots with rules, sources, templates, dependencies and manual steps; verify reproducible dry-run output and zero provider side effects.
- [ ] 3.4 R5: Implement plan comparisons and dependent-approval invalidation; verify old signed artifacts remain byte-identical after material input/rule changes.
- [ ] 3.5 R6: Implement requested-track readiness projections and explicit formation-only choice; verify optional denials preserve successful tracks and every opened account requires its own check.

## 4. Nonprofit and federal tax tracks

- [ ] 4.1 R7: Configure nonprofit core entitlements and pending-recognition labels; verify all core workflows carry zero platform fees and optional paid services require selection.
- [ ] 4.2 R8: Build reviewed nonprofit incorporation/governance and separate federal/state exemption task tracks; verify acceptance of one cannot recognize another and complex profiles route to supported review.
- [ ] 4.3 R9: Encode the complete reviewer-approved current 1023-EZ worksheet with answer evidence; verify every disqualifier/unknown blocks EZ and paid receipt cannot recognize exemption.
- [ ] 4.4 R10: Add nonprofit director/officer/controller authority and conflict intake; verify incompatible distributions and ownership-like promises block streamlined preparation.
- [ ] 4.5 R11: Implement reviewer-approved optional S-election screening separately from legal type; verify eligible fixtures, corporation-owned subsidiaries, share classes, trust/late/specialized exclusions and required consents.
- [ ] 4.6 R12: Add secure EIN intake, signed authority references and existing/pending EIN checks; verify duplicate prevention, current application constraints and separate zero IRS fee.
- [ ] 4.7 R13: Implement reviewed election due-date calculation and signature/delivery/acceptance evidence; verify date boundaries, missing signatures, review-required late cases and payroll checklist follow-up.

## 5. Filing adapters and handoffs

- [ ] 5.1 R14: Implement explicit direct/provider/assisted/packet-only/stub mode contracts and secure human handoffs; verify packet export never submits and portal challenges create visible tasks.
- [ ] 5.2 R15: Implement filing adapter capability inventory and disabled candidate adapter contracts; verify unconfirmed scope, status/webhook routes and missing contracts cannot activate production.

## 6. Product qualification policy

- [ ] 6.1 R20: Implement CoinPay exact-product/profile qualification policy shared by discovery and application paths; verify unverified cards/loans fail and debit inheritance requires parent activity evidence.
- [ ] 6.2 R21: Persist complete institution/servicer/product/profile/jurisdiction/currency/login/route/version keys; verify personal/directory evidence cannot qualify nonprofit/business products and approved native routes are supported.
- [ ] 6.3 R22: Add evidence-reviewed qualification transitions, two-observation validation and expiry-at-read policy; verify mocks, wrong profiles, insufficient spacing and stale records fail without admin override.
- [ ] 6.4 R23: Define separate deposit, credit/charge and loan data profiles plus optional capabilities; verify each missing required activity/balance interpretation fails without creating synthetic activity.
- [ ] 6.5 R24: Implement mapped customer-account checks and open_connection_pending recovery; verify newly opened legitimate-empty accounts differ from missing/error responses and no ordinary customer tests an unverified product.
- [ ] 6.6 R25: Enforce fresh qualification at selection and final dispatch/handoff with stable API errors; verify all surfaces, stale-after-selection and administrative bypass attempts.
- [ ] 6.7 R26: Implement scoped connection health and reviewed product degradation; verify user alerts, preserved last-known timestamps, paused distribution and zero automatic money/account actions.

## 7. CoinPay SimpleFIN hardening

- [ ] 7.1 R31: Add v2 discovery/explicit selection and separately validated v1/v2 adapters in CoinPay; verify malformed v2 fails without downgrade and v1 requires tested opt-in.
- [ ] 7.2 R32: Move token exchange to durable trusted-worker orchestration using ephemeral secret references; verify encrypted Access URL persistence, erasure, hidden/stdin intake and consumed-token recovery.
- [ ] 7.3 R33: Add approved-root outbound transport enforcing HTTPS/TLS, destination IP and redirect rules; verify claim/access/operator/metadata entry points against SSRF, DNS rebinding, IPv6 forms and cross-origin credential leakage.
- [ ] 7.4 R34: Add required v2 upstream connection scope to existing CoinPay identity keys and migration mapping; verify collisions across tenants/connections/accounts remain isolated.
- [ ] 7.5 R34: Replace amount normalization through Number with exact decimals and retained raw values; verify deposit/liability ledger signs, precision and currency separation through import and export.
- [ ] 7.6 R35: Implement durable shared connection budgets, coalesced daily/manual sync and bounded overlapping backfill; verify concurrent request accounting, provider limits, restart behavior and actual coverage.
- [ ] 7.7 R36: Implement evidence-based transaction upserts/pending replacement and classification provenance; verify overlapping windows do not duplicate/delete activity or silently count financing/transfers as revenue.
- [ ] 7.8 R37: Preserve v2 msg/code/connection/account errors and supported v1 errors through storage/API views; verify partial success, effective-versus-fetched timestamps, sanitized warnings and revoked polling stop.
- [ ] 7.9 R38: Add supplemental financial-data capability/source records and honest report/statement labels; verify missing values stay unavailable and uploads cannot qualify a product.

## 8. Financial application orchestration

- [ ] 8.1 R27: Add approved hosted onboarding and provider capability/terms contracts; verify minimum-data collection, representative consent, servicer disclosure and missing entitlement/profile denial.
- [ ] 8.2 R28: Implement accurate deposit/debit/charge/revolving product disclosures; verify fees, guarantees, supplied credit-check terms and prerequisites appear before consent.
- [ ] 8.3 R30: Separate read connectivity from provider write permissions and service-fee billing; verify SimpleFIN authority cannot open/pay/transfer/issue/draw and fee reconciliation does not claim government settlement.
- [ ] 8.4 R29: [P1; disabled] Implement fixture-tested loan/credit-line application and separate acceptance states behind category gates; verify no automatic lender cascade and V1 drawdowns remain disabled.

## 9. Compliance and portability

- [ ] 9.1 R39: Implement reviewed source/version/trigger/timezone obligation generation; verify date/applicability boundaries and removal of blanket BOI/Delaware/C-corp assumptions.
- [ ] 9.2 R40: Add reminder delivery attempts, accountable owners and overdue escalation; verify failed email/read events do not complete obligations and recurring paid dispatch rechecks consent.
- [ ] 9.3 R41: Implement authorized portable exports, disclosed cancellation/read periods, disconnect and retention holds; verify provenance/coverage, secret exclusion and cross-entity export isolation.

## 10. Surfaces and commercial configuration

- [ ] 10.1 R42: Build accessible mobile-first entity screens in sites/sh1pt.com with save/resume and sensitive-cache exclusions; verify keyboard navigation and independent status/quote/manual-task presentation.
- [ ] 10.2 R42: Extend existing build entity CLI and SDK with typed JSON, stable exits, dry-run and durable operation IDs; verify contract parity with REST and resumed operations.
- [ ] 10.3 R42: Implement entity MCP read/draft/approval-request/gated-submit tools using server policy; verify permission parity and secret-free responses without a consent-minting tool.
- [ ] 10.4 R50: Add operator-configured pricing and entitlements separately from procurement; verify zero nonprofit core fees, optional business renewal and policy invariance for premium/commission/admin cases.
- [ ] 10.5 R51: Implement customer-owned SimpleFIN connection terms and external-cost disclosure; verify sponsored/reseller mode requires agreement and core access does not require financial-data advertising/training consent.
- [ ] 10.6 R52: Add transactional budget reservations, provider caps, per-entity limits and subsidy configuration; verify no overspend/concurrent reservation bypass, silent free-tier charge or deadline/record loss.

## 11. Operator controls and release evidence

- [ ] 11.1 R53: Seed only disabled financial research candidates and disabled filing routes with no invented terms; verify a fresh deployment returns zero available financial products.
- [ ] 11.2 R54: Implement jurisdiction/provider/product/workflow/tenant kill switches and owned recovery queues; verify read access persists and resumed jobs recheck authority, quotes, budgets and qualification.
- [ ] 11.3 R49: Implement production activation records for legal/privacy/authority/contracts/professional review and lending disclosures; verify missing evidence blocks only affected live capabilities while fixtures remain usable.
- [ ] 11.4 R55: Run the requirement-linked software conformance and irreversible-action recovery suite; verify every applicable P0 and enabled P1 has execution evidence separate from real qualification.
- [ ] 11.5 R55: Demonstrate self-hosted PostgreSQL and private document off-host restore with mutations disabled; verify completed work is reconciled without redispatch and record measured RPO/RTO.
- [ ] 11.6 R56: Create capability-specific preview/formation/deposit/credit/P1 release manifests; verify exact-profile evidence gates and accurate formation-only/unavailable messaging before activation.

## 12. Launch-critical acceptance journeys

These are software acceptance journeys using fixtures unless separately authorized. They never certify real banks, file legal documents, or approve production activation.

- [ ] 12.1 Run a nonprofit journey from intake through separate mocked agency/EIN/exemption evidence; verify free platform costs, full eligibility answers and no recognition from payment. Requirements: R7, R8, R9, R10, R12, R14, R19.
- [ ] 12.2 Run an eligible business journey through optional S screening, signatures and mocked acceptance; verify legal type stays separate and recurring payroll/tax tasks are visible. Requirements: R2, R11, R12, R13.
- [ ] 12.3 Run a corporation-owned subsidiary through the ordinary S-election path; verify no election submission occurs and formation progress stays independent. Requirements: R11, R17.
- [ ] 12.4 Run out-of-state formation with California operations and another employee location; verify domestic/foreign/tax/local assessment, review blockers and sourced obligation inputs. Requirements: R3, R4, R39.
- [ ] 12.5 Attempt an unverified card through PWA, CLI, REST, SDK, MCP and admin/premium paths; verify zero application URLs/provider calls and the same qualification error. Requirements: R20, R21, R22, R23, R25, R28, R50.
- [ ] 12.6 Mock bank approval followed by linking failure; verify open_connection_pending, false finance readiness and no closure, replacement application or money movement. Requirements: R6, R24, R26, R27.
- [ ] 12.7 Return account A successfully and a scoped v2 msg error for B with bounded history; verify durable partial data, honest timestamps/coverage and generated report labels. Requirements: R31, R35, R36, R37, R38.
- [ ] 12.8 Map one account from a personal/multi-business login to one entity; verify unrelated accounts, exports, jobs, events and secrets remain inaccessible and unassigned accounts stay quarantined. Requirements: R21, R34, R43, R45, R46.
- [ ] 12.9 Lose a provider response after accepting a paid order, then retry and restore the queue; verify a single order, reconciling state, scoped evidence and current-policy checks without redispatch. Requirements: R16, R17, R18, R19, R48, R54, R55.
