# Validation record

Checked September 14, 2026 in the sh1pt repository. This record covers the
planning delivery, not application implementation or provider certification.

## Results

| Check | Result |
|---|---|
| LogicSRC CLI 0.3.0 allocation | Created the new collection and allocated 0001 without overwriting a numbered PRD |
| `logicsrc prd index --write` | Generated the index from the imported manifest |
| `logicsrc prd validate --strict` | Passed: one PRD, 56 requirements, no errors |
| OpenSpec CLI 1.13.0 strict change validation | Passed: add-entityctl-formation-simplefin is valid |
| `node scripts/validate-entityctl-spec.mjs` | Passed: 56 requirements, 12 capabilities, 112 scenarios, 74 tasks, nine launch journeys |
| Normative text and priorities | Every requirement body matches the imported PRD after removing source-note markers; only R29 is P1 |
| Sources and local references | All 22 source keys resolve; local Markdown links and the illustrative JSON parse successfully |
| Traceability | Every requirement maps to its spec, scenarios and tasks; every task has requirement coverage and explicit verification |
| Negative checker exercises in a temporary copy | Missing WHEN, altered normative text and a mismatched scenario ID each correctly returned exit code 1 |

The installed LogicSRC validator compares the index with its standard generated
heading. A custom heading initially failed its stale-index check; regenerating
with the documented default command resolved this. No vendor tool was modified.

The dependency-free local checker is also added to the existing CI test workflow.
CI execution itself is not claimed here. It checks documentation integrity; it
does not replace vendor schema validation or the future application tests.

## Reproduce

```bash
logicsrc --version
logicsrc prd index --write
logicsrc prd validate --strict
OPENSPEC_TELEMETRY=0 npm exec --yes --package=@fission-ai/openspec@1.13.0 -- \
  openspec validate add-entityctl-formation-simplefin --strict
node scripts/validate-entityctl-spec.mjs
git diff --check
```

The LogicSRC executable used here reports 0.3.0. The OpenSpec package is pinned
in the invocation and was not added as a runtime dependency. The local checker
needs only Node.js built-ins and does not make network requests. It additionally
accepts `--root <repository>` for isolated document-integrity checks.

## Work not performed

All 74 implementation/acceptance tasks remain unchecked. All 56 software-test
evidence slots and all nine journey execution records remain `not_run`.
Production evidence slots remain `not_collected`; no verified product seed or
live activation was created.

No application test suite, provider conformance test, real financial-account
check, backup/restore drill, legal/tax template review, fee verification,
provider negotiation, filing, purchase or bank application was performed.
Source-page inspection is recorded separately in sources.md and must not be
reported as legal review or current vendor entitlement.

No CoinPay files were edited by this delivery. Existing and concurrently
appearing local changes there were left untouched. The historical entityctl
PRD and sh1pt's pre-existing `render-tmp.mts` were also left untouched.
No commit, push, deployment, PRD acceptance or OpenSpec archive was performed.
