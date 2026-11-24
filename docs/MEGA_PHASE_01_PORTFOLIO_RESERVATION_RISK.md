# Mega Phase 01 — consolidated portfolio, reservation and risk batch

Checkpoint 2026-11-25 IST. Base main 70734ac9e911b6ee2f9d9738b0c9c1f8d6745ee3 includes merged #146, whose exact head 6bc37098aafdcfdff0ae4e77a1680cad62bffcf0 passed EMA safety 45456973605 and paper staging 45456973544. #148 and #149 remain independent, paper staging passed and full regression running at this checkpoint. Do not reset their CI.

| Tasks | New source change | Boundary |
|---|---|---|
| P01-36/37/39 | Complete-input portfolio Greek aggregation, signed per-unit positions, gross/net by underlying, exact identity, stale/missing/duplicate denial | Actual authenticated whole-account marks, provenance, unit normalization and gateway integration still missing |
| P01-13/14/20/21/25/28/35/36 | Isolated SQLite immediate-transaction account-wide capital reservation, unique intent, owner and amount fence, readback, sticky unknown | Not called from any execution route; no broker budget adapter, safe release procedure or crash/real multi-instance certification |
| P01-29/38/40 | Invalid drawdown inputs latch halt and preserve last valid observation, zero sizing after equity recovery or GLOBAL halt | Existing in-memory controller is not restart-durable; authorized recovery policy and actual equity evidence pending |
| P01-30/39/40 | Malformed hard-control metrics halt locally without overwriting prior valid readings | Does not establish durable write success or broker execution/closure authority |
| P01-16/17/19/35 | Remove dead legacy Quant live broker dispatch and fabricated fallback order ID; fail closed | No new unified gateway, no change to intended EMA MIS/NRML safety gates or paper/shadow pathways |
| P01-23/24/35/49 | Reject inconsistent exchange order IDs among fills and supplied order detail | Read-only, no automatic retry, offset, closure, or broker account-flat certification |

Regression: three new test files (portfolio Greek, capital reservation, drawdown latch), additional hard-control and reconciliation tests, existing legacy route denial tests retained. New head has not yet passed CI. All fixture evidence is synthetic. No actual broker call, real order, deployment, hosted change or secret rotation.

Scope accounting: main 12 scoped merged with PR CI, 37 partial, 1 outstanding (P01-37). Proposed combined source scope 12 scoped merged, 38 partial, 0 untouched; P01-37 becomes PARTIAL only if this new implementation is integrated. Zero full phase acceptance. This is not 50 completed tasks. Existing tasks are not double counted. Exact full regression, production build, TypeScript, paper staging and combined main integration remain required.

Next: acquire authenticated complete position and Greek inputs, explicitly map normalized units, wire atomic reservation into a reviewed gateway, durable intent state/reconciliation before release, persistent account-scoped drawdown, cross-account and concurrent failure tests, actual Google AI Studio runtime evidence. External issues #17–#22 remain release gates.
