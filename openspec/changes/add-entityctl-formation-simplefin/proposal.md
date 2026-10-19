## Why

Entityctl currently exposes jurisdiction-pack scaffolding, while formation, tax recognition, account approval, and data access need independently evidenced outcomes. The supplied release-1 PRD adds nonprofit and business coordination with mandatory product- and account-level SimpleFIN checks. Reusing sh1pt and CoinPay avoids separate finance records and conflicting authority models.

This change is **Draft**. Its normative product source is [OpenPRD 0001](../../../prd/0001-automate-nonprofit-and-business-formation-with-simplefin-verified-accoun.md). It proposes implementation; it does not activate providers or certify any financial product.

## What Changes

- Extend existing entity records and jurisdiction packs with typed legal structures, independent tax/finance tracks, source-backed plan versions, and operation-specific support.
- Add a free nonprofit core workflow, reviewed US-CA preparation, separate federal workflows, EIN duplicate protection, and screened optional S elections.
- Add human approval requests, bounded quotes, durable idempotent operations, provider reconciliation, documentary proof, and realistic cancellation.
- Keep CoinPay as the finance owner. Add exact-product/profile/route qualification, disabled candidate seeds, and separate mapped customer-account verification.
- Harden CoinPay's existing SimpleFIN importer for explicit v2, tested opt-in v1, protected token claims, SSRF controls, exact decimals, scoped IDs, shared quotas, and partial-data visibility.
- Add recurring obligations, secure exports, matching PWA/CLI/API/SDK/MCP policy, entitlement configuration, and capability-specific launch gates.
- Keep financing activation, additional jurisdictions, and embedded-banking expansion independently gated. No live actions occur in the preview.

## Capabilities

### New Capabilities

No `openspec/specs` inventory existed at discovery. These ADDED capabilities extend existing code rather than assert that entityctl is a new product.

- `entity-planning`: Entityctl reuse, legal structure, jurisdiction assessment, operation support, reproducible plans, and independent completion tracks; R1–R6.
- `nonprofit-formation`: Free core tier, incorporation/exemption separation, complete EZ screening, and governance; R7–R10.
- `business-tax-elections`: S-election eligibility, EIN authority, deadlines, signatures, and acceptance; R11–R13.
- `filing-orchestration`: Filing modes, verified provider capabilities, quotes, approvals, retries, and proof; R14–R19.
- `simplefin-product-eligibility`: Mandatory exact-profile qualification, evidence, customer-account checks, server enforcement, and degradation; R20–R26.
- `financial-onboarding`: Authorized product applications, disclosures, independently gated financing, and read/write boundaries; R27–R30.
- `simplefin-sync`: Versioned parsing, secure claims, SSRF, scoped identities, exact money, quotas, reconciliation, errors, and supplemental data; R31–R38.
- `entity-compliance`: Source-backed obligations, reminders, exports, cancellation, and retention; R39–R41.
- `agent-api-surfaces`: PWA, CLI, API, SDK and MCP parity with scoped contracts and LogicSRC traceability; R42–R44.
- `security-audit`: Tenant/entity isolation, data protection, bounded AI, tamper evidence, and production authorization; R45–R49.
- `pricing-entitlements`: Configurable prices, customer-owned SimpleFIN, transparent costs, and budget caps; R50–R52.
- `provider-operations`: Disabled seeds, kill switches, conformance/recovery evidence, and phased rollout; R53–R56.

### Modified Capabilities

None in the discovered OpenSpec inventory. Recheck the inventory before application if other changes have landed; merge matching capabilities instead of duplicating them.

## Impact

- sh1pt: existing core entity contracts, US pack, CLI under `build entity`, Next.js route handlers and screens, SQL migrations, SDK, and proposed MCP entity tools.
- CoinPay: existing `src/lib/finances`, `/api/finances`, SDK/CLI, and finance SQL migrations. This bundle records cross-repository tasks; no CoinPay code is changed by this documentation delivery.
- Data: new entity operations and authority records; additive finance qualification/mapping/version fields; migration review for existing ambiguous profiles and identifiers. No balances or secrets copied into sh1pt.
- Security: common actor/entity policy, account-owner mapping checks, restricted worker identity, secret-safe URL transport, and durable recovery controls are prerequisites.
- Commercial/operational: no contracted providers or verified products are assumed. External fees, provider minimums, review work, support labor, and SimpleFIN licensing remain explicit launch decisions.

See [discovery](discovery.md), [design](design.md), [tasks](tasks.md), [traceability](traceability.json), [sources](sources.md), and [validation](validation.md).
