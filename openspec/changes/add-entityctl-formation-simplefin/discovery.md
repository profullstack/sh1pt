# Repository discovery

Inspected September 14, 2026. This is a source inventory, not a security audit, deployment inspection, or legal/provider certification.

| Repository | Inspected HEAD | Role |
|---|---|---|
| `profullstack/sh1pt` | `f534b786cbb1fc10cf8e22a18311b4b7c6ffa1aa` | Entity operations and this spec bundle |
| `profullstack/coinpayportal` | `8dde009aefc3ccf3cabb2af0d4230cc7165c3e69` | Existing finance data/connectivity and billing boundary |

Pre-existing uncommitted work was left untouched: sh1pt's `render-tmp.mts`; CoinPay SDK README/package/TUI/lockfile edits and its untracked finances Markdown test. No credentials or customer financial data were accessed. No applicable on-disk AGENTS.md was found in the inspected repositories; the user's supplied global link preference applies to replies.

## Existing implementation and reuse

Paths in the first table are relative to sh1pt; paths in the second are relative to coinpayportal.

| Existing sh1pt path | Observation | Implementation direction |
|---|---|---|
| `docs/prd/entityctl.md` | Historical Draft v3.1, dated April 20, 2026; moves entity commands under `build` | Keep as historical context; do not renumber or overwrite |
| `packages/cli/src/commands/build.ts` | Registers `entityCmd` under `build` | Extend `sh1pt build entity`; supplied top-level examples are mapped here |
| `packages/cli/src/commands/entity.ts` | Implements pack list/info; broader setup examples are not implemented here | Reuse Commander command tree; add typed workflows only as implemented |
| `packages/core/src/jurisdiction.ts` | Existing Entity/JurisdictionPack/FormationPlan contracts, support labels and filing modes | Extend through versioned mappings; preserve navigation labels |
| `packages/entity/us/src/index.ts` | Advertises `full`, defaults to Delaware, returns unknown name availability, contains TODO submission behavior | Replace blanket capability claims with operation/profile gates; add reviewed CA applicability |
| Same US pack | Applies stock, BOI, Delaware and C-corp checklist assumptions broadly | Block legacy assumptions from the new workflow; review by legal/tax profile and operating facts |
| `packages/core/src/testing/contract-jurisdiction.ts` | Reusable pack contract-test runner | Extend with operation availability, unknown-input, source and no-side-effect cases |
| `sites/sh1pt.com/package.json` and `app/api/v1/*` | Existing Next.js app and versioned route handlers | Host new screens and entity API here; route all clients through shared services |
| `sites/sh1pt.com/lib/supabase/*`, `supabase/migrations/*` | Session helpers and SQL migrations exist | Reuse authentication/migration approach; verify actual self-hosted PostgreSQL deployment before release |
| `packages/web/package.json` | Dashboard build/dev stubs | Do not assume this is the existing Next.js app or create another app here |
| `packages/api/src/index.ts`, `routes/auth.ts` | Hono routing exists; inspected auth handlers return stubs | Do not expose consequential entity routes through stub auth; reuse Next.js boundary |
| `packages/sdk`, `packages/core/src/mcp-server.ts` | SDK package and MCP adapter interface exist | Add entity SDK methods and an actual scoped MCP tool mapping; interface presence is not shipped entity tools |
| `packages/payments/coinpay` | Existing CoinPay payment integration package | Reuse billing boundary after verifying its scope; payment adapter is not bank onboarding |
| `prd/`, `openspec/` before import | Neither collection existed | LogicSRC allocated first ID; all delta specs ADDED because there is no prior spec inventory |

| Existing CoinPay path | Observation | Required gap closure |
|---|---|---|
| `src/lib/finances/simplefin.ts` | Backend claim/read functions, Basic auth extraction and some redaction | Harden existing adapter rather than replacing finance ownership |
| Same file, `fetchAccountSet` | No explicit account-request version or advertised-version discovery in inspected implementation | Separate tested v2 and explicitly enabled v1 parsing |
| Same file, `collectErrors` | Reads `message`, `error`, `detail` for structured errors; official v2 specifies `msg` and scope IDs | Parse current structured contract, keep error code/account/connection scope, sanitize UI output |
| Same file, token/fetch paths | Claim URL checks HTTPS but inspected transport has no DNS/IP allow policy or explicit redirect handling | Apply one URL/transport policy before every fetch; handle rebinding, TLS, redirects and returned access URLs |
| Same file, `parseAmount`; `sync.ts` | Decimal strings can become JS `Number` | Preserve exact raw decimal strings and review normalization/report calculations |
| `src/lib/finances/sync.ts` | Existing account/transaction upserts, encrypted credential handling and partial-status logic | Reuse tables and mechanisms; strengthen account-level error/coverage provenance and quotas |
| `src/app/api/finances/connections/route.ts` | Backend claim and persistence failure handling exist | Move single-use exchange into durable trusted work and cover ambiguous outcomes |
| `src/app/api/finances/sync/route.ts` | Authenticated explicit sync; no shared durable quota reservation in inspected route | Coalesce/manual/scheduled/retry/backfill through shared connection budget |
| `supabase/migrations/20260819210000_finances_simplefin.sql` | Existing finance connection/account/transaction tables; account uniqueness includes connection and external ID | Add v2 upstream institution connection identity where needed; prove account and transaction scoping across tenants |
| `supabase/migrations/20260906030000_finances_account_scope.sql` | Personal/business `scope_override` with name-derived fallback | Classification is not legal ownership. Add explicit authoritative entity mapping and quarantine unassigned accounts |
| Existing `/api/finances/*`, `packages/sdk/src/finances*` | Finance routes and SDK/CLI already exist | Extend in place; record command/API compatibility aliases during implementation |
| `src/lib/finances/provider.ts`, `plaid.ts` | Other finance-provider routes exist | Existing integrations cannot qualify a product for this release; entity workflow requires SimpleFIN evidence |

## Import decisions

1. Allocate using installed LogicSRC PRD tooling, preserve Draft and original creation date, set repository to `profullstack/sh1pt`, and record import date as `updated`.
2. Keep all 56 normative requirements, including P1 R29. Add repository discovery notes, command/API mappings, and honest source-check provenance; do not reinterpret source checks as legal approval.
3. Add the OpenSpec change without archiving or accepting it. No runtime implementation or live capability activation occurs in this delivery.
4. Design against existing Next.js routes and SQL migrations. The current Supabase clients do not establish whether deployed storage meets the self-hosted requirement; deployment evidence is a release task.
5. Leave provider selection, legal template approval, real-account qualification, and contracted onboarding disabled until evidence exists. Those unknowns do not prevent implementing the preview and fail-closed contracts.
