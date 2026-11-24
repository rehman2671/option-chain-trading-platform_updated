# Mega Phase 01 — authenticated candidate journal integration

Checkpoint 2026-11-25 IST. Main 050e0acdac18c9f812ebb72eb9a116a589721cd7 includes #152. #153 tested head 78b9cfa7abdbca9bfa316ac506a3cf01e89db59b passed both 45482741725 and 45482741820, but GitHub reports shared documentation merge conflicts. #154 head 89ea5d3b88feb403180cfd3b461cc8c97eac4a4f passed paper staging 45486136044 and production-build; full/invariant 45486135932 still running. Combined branch based on exact #154 head preserves its history and carries all nine #153 source/test files plus detailed report. No force push. Keep existing PRs until eligible integration is verified; if #154 passes independently it can merge without abandoning the combined work.

| Existing P01 task IDs | New implementation | Remaining boundary |
|---|---|---|
| 01/04/06/09/17/19 | Original active user session rechecked in immediate transaction; explicit deployment-owned account mapping and policy | Hosted identity acceptance and trusted native session source |
| 13/14/15/16/20/21/25 | Joined exact listing, projected risk, durable drawdown gate, intent and reservation and immutable candidate receipt in one SQLite transaction | Actual verified NAV/Greek feeds and active execution integration |
| 22/31/32/33/36/37/39 | Exact contract, quantity, product, expiry, lot, tick, bounded limit premium and server-only fee and Greek policy; policy digest detects changes under same version | Independent live source and policy validation |
| 23/24/26/28/29/35/38/40 | One unresolved candidate per account until verified reconciliation and release; no replay overwrite; orphan receipts quarantine new preparation | Actual authorized capital release, durable reset, partial fill execution and rollback |
| 46/47/49/50 | New regression cases for revoked/incorrect identity, invalid policy, stale/malformed evidence, transaction fault injection, changed immutable terms, restart and account quarantine | Fresh combined CI and hosted acceptance |

## Runtime integration and configuration

Normal database initialization creates candidate_preparation_v1 alongside intent/reservation/drawdown journals. Internal dbEngine.prepareAuthorizedBrokerCandidate joins the previously separate components. It is not exposed as a client mutation or wired to live trading. Existing read-only recovery route from #154 is preserved. All three rows are written atomically and read back, with rollback on receipt write failure. Exact listing details, bounded limit/fee/reservation, owner/session and canonical SHA-256 policy digest are stored; no token, credential or raw market payload is stored. A second unresolved preparation is conservatively denied across the whole broker account, even if available margin remains. No expiry, retry or release is implied.

Optional server environment variables in the existing Google AI Studio deployment: BROKER_PREPARATION_OWNER_MAP (explicit mapping described in owner binding report) and BROKER_PREPARATION_RISK_POLICY (JSON array of accountId, policyVersion, maxFeesPaise, maxDailyLossPaise and limits by NIFTY/BANKNIFTY/SENSEX; each included underlying requires positive finite netDelta, netGamma, netTheta, netVega, grossDelta, grossGamma, grossTheta, grossVega). Integer paise monetary bounds must be positive safe integers. No policy defaults or actual values installed. Owner must independently validate units, fees and caps. Missing/invalid/duplicate policy fails closed. Caller-supplied policy fields cannot override server policy.

The adapter requires trusted server-side normalized marks, native evidence and fresh durable equity observation; it does not certify actual upstream provenance. Broker funds are not NAV. It is limited to bounded long BUY preparation, no MARKET execution, no live NRML permission, no actual capital release. Local auth epoch is not independently authenticated exchange or restart evidence. No real broker order or hosting change.

Main remains 12 scoped merged, 38 partial, 0 untouched. New work advances existing IDs, no phase acceptance. Require combined exact-head CI, resolve any actual failure, and verify hosted operation separately.

## Verified #154 merge — 2026-11-25 IST

#154 exact head 89ea5d3b88feb403180cfd3b461cc8c97eac4a4f passed full EMA safety 45486135932 and paper staging 45486136044. Merged main at 9ad93498d18713ee322c3589eaeec47c226e3e3b. #155 includes the verified #154 head as an ancestor and the #153 source/tests plus new joined preparation; fresh combined CI still required. #153 remains open until replacement integration verified. Main scope unchanged 12/38/0, no full acceptance, no hosted verification. Supersedes earlier pending #154 statements.
