# Sources and provenance

## Import evidence boundaries

The user supplied a September 12, 2026 release-1 draft and its source notes. Those retrieval dates are retained as supplied provenance, not represented as a fresh legal, fee, provider-contract or bank-compatibility audit. Import work occurred September 14, 2026. All product rules, costs and timelines remain proposed or dated assumptions.

Independently inspected during import:

- Local sh1pt and CoinPay source paths and commit identifiers listed in discovery.md. No customer financial records or credentials were accessed.
- Local LogicSRC OpenPRD schema, section/parser/scaffolding code in the sibling repository. Its reference library implementation defines OpenPRD 0.3 separately from package version numbers. The installed CLI used for allocation/validation reports version 0.3.0.
- Official OpenSpec spec-driven schema, including ADDED/requirement/WHEN-THEN/task conventions. OpenSpec CLI 1.13.0 validates the resulting change.
- Official SimpleFIN protocol page, still labeled 2.0.0-draft at inspection. Its structured errors use msg with optional connection/account scope and account IDs are connection-scoped. These support the recorded adapter gap analysis; the inspected page is not evidence that any live bank supports the protocol.

The internal Library artifact cited by the supplied draft was not accessed. The repository historical Draft v3.1 is a related source, not asserted byte-identical to the supplied Library Draft v3.

## Source register

Every key below is defined in OpenPRD 0001. Original source descriptions and dates remain there. External URL reachability is not part of the offline link check. Before activating a feature, its reviewer must pin or snapshot the applicable current source, record effective/review dates, and resolve any conflict with the supplied assumptions.

| PRD source key | Source | Import-time treatment |
|---|---|---|
| baseline | `docs/prd/entityctl.md`; supplied Library reference | Local historical PRD inspected; Library original not accessed |
| logicsrc-openprd | https://logicsrc.com/openprd; https://github.com/profullstack/logicsrc/blob/master/packages/schemas/schemas/openprd-prd.schema.json | Local schema/reference implementation inspected; CLI allocation and strict validation executed |
| logicsrc-comparison | https://logicsrc.com/docs/openspec-comparison | Supplied historical provenance; revalidate before dependent activation |
| openspec | https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml | Official schema inspected; pinned CLI strict validation executed |
| simplefin-overview | https://simplefin.org/ | Supplied historical provenance; revalidate before dependent activation |
| simplefin-v2 | https://www.simplefin.org/protocol.html | Official protocol page inspected; no live account or product test |
| simplefin-v1 | https://www.simplefin.org/protocol-v1.html | Supplied historical provenance; revalidate before dependent activation |
| bridge-guide | https://beta-bridge.simplefin.org/info/developers | Supplied historical provenance; revalidate before dependent activation |
| bridge-directory | https://beta-bridge.simplefin.org/search-institutions | Supplied historical provenance; revalidate before dependent activation |
| bridge-price | https://bridge.simplefin.org/ | Supplied historical provenance; revalidate before dependent activation |
| irs-exempt | https://www.irs.gov/charities-non-profits/applying-for-tax-exempt-status | Supplied historical provenance; revalidate before dependent activation |
| irs-1023ez | https://www.irs.gov/instructions/i1023ez | Supplied historical provenance; revalidate before dependent activation |
| irs-fees | https://www.irs.gov/charities-non-profits/form-1023-and-1023-ez-amount-of-user-fee | Supplied historical provenance; revalidate before dependent activation |
| irs-scorp | https://www.irs.gov/businesses/small-businesses-self-employed/s-corporations | Supplied historical provenance; revalidate before dependent activation |
| irs-2553 | https://www.irs.gov/instructions/i2553 | Supplied historical provenance; revalidate before dependent activation |
| irs-ein | https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number | Supplied historical provenance; revalidate before dependent activation |
| ca-scorp | https://www.ftb.ca.gov/file/business/types/corporations/s-corporations.html | Supplied historical provenance; revalidate before dependent activation |
| fincen | https://www.fincen.gov/boi | Supplied historical provenance; revalidate before dependent activation |
| corpnet | https://www.corpnet.com/corpnet-api/ | Supplied historical provenance; revalidate before dependent activation |
| doola | https://www.doola.com/formation-api/ | Supplied historical provenance; revalidate before dependent activation |
| mercury-api | https://docs.mercury.com/docs/getting-started | Supplied historical provenance; revalidate before dependent activation |
| column | https://column.com/ | Supplied historical provenance; revalidate before dependent activation |

## Production research and evidence still required

- Qualified reviewers approve current CA and federal applicability, legal templates, eligibility worksheets, deadlines, signature routes and exception handling. The draft is not that approval.
- Procurement records exact filing/nonprofit scope, onboarding authority, provider status mechanisms, prices, refunds, terms, privacy/processing arrangements and applicable licensing/disclosures. No provider was contacted in this delivery.
- Integration reviewers collect separately authorized real product/profile/route evidence and customer-account tests. None of Mercury, Column, Increase or any other product is certified by this bundle.
- Bridge limits, geography, retail pricing and permitted customer-owned/embedded usage require current verification for the selected deployment. Native routes require their own security and compatibility review.
- New account opening, financial activity, credit checks, guarantees, agreements and external payments require the applicable explicit authority. No such actions were taken to prepare this bundle.

## Import edits to the supplied draft

The import preserves all R1–R56 normative text and priorities. It resolves repo ownership and CLI/API mappings, changes updated to the import date, clarifies state-name aliases and source-check provenance, and replaces the standalone numbering instructions with the actual allocated collection ID. It adds discovery, source and validation references and dates the external price examples to avoid implying independent current-price verification. The generated filename is the slug emitted by LogicSRC, including its length limit. No product requirement was marked implemented or accepted.
