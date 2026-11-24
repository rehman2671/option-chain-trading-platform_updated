# Mega Phase 01 — durable intent, drawdown and authentication recovery

Checkpoint 2026-11-25 IST. Main base 70734ac9e911b6ee2f9d9738b0c9c1f8d6745ee3 includes merged #146. No new phase.

| Existing task IDs | Scope advanced | Remaining boundary |
|---|---|---|
| P01-04/10 | Strict login, password, MFA and temporary token input checks; HS256 verify allowlist; no-store credential and MFA responses; sanitized errors | Browser token lifecycle, hosted session and full endpoint acceptance |
| P01-03/08/09/14/15 | Admin status, password and MFA mutation readback before success response; existing session-version revocation preserved | Atomic authorization/write concurrency, audit identity and all mutation routes |
| P01-13/16/17/19/20/25/28/35 | Account-scoped durable immutable intent, unique tag/broker ID, immediate transaction, readback and replay refusal; order/trade evidence recording | New isolated ledger not wired into active gateway; authenticated account/owner evidence, atomic reservation binding and dispatch CAS |
| P01-23/24/26/49 | Reject mismatched broker ID, decreasing fills, out-of-order evidence and contradictory terminal state | Actual broker account position/pending-order reconciliation and safe capital release |
| P01-29/38/40 | Durable account-level peak/equity journal, exact 15% critical tier, sticky halt, stale/unknown fail closed | Not wired to existing DrawdownController; actual NAV, durable authorized reset, all execution gates |
| P01-27/44/45 | Separate #148 repair: existing NRML product fence before durable replay lookup; unavailable replay evidence rejects automatic reversal/BUY; preserve all safety checks | Fresh exact-head CI and integration |

Tests: new auth policy, intent and drawdown tests, including file-backed reopen, wrong account/owner, duplicate intent/tag, contradictory fill, stale evidence and exact critical boundary. #148 existing Phase130 NRML regression extended. No runtime broker order or hosting changes. Password-only login denied for corrupted enabled MFA state. Login/new password limit 72 UTF-8 bytes (bcrypt); legacy longer passwords require authorized reset. Existing enabled malformed MFA configuration requires administrator repair. Valid browser iframe architecture preserved; actual AI Studio acceptance remains open.

CI: #148 old head 1e3c23b0e3a21b04c180e8340396f0c95f0f6451 full-regression job 138676456531 (run 45459104394) had 2182 passing, 1 failing, Phase130 NRML negative fixture hit unavailable hasEmaLiveSignalAttempt. Fix commits 382d9d6379ae3f7a2f92af2625e1e2b4e16a16f7 and eb1fb725f2865f0dc23f5907be717ffd6ceb2db0; exact new head needs fresh full CI. #149 and #150 paper staging and production builds pass, full regression and invariant tests running. New branch CI not yet verified. No full task acceptance claimed.

Main scope remains 12 scoped merged, 37 partial, 1 outstanding. Proposed combined scope including #150 remains 12/38/0, no phase acceptance. New work advances already partial tasks; no duplicate counting. External issues #17–#22 still gate actual release. Preserve legacy live quarantine and EMA NRML interlocks.
