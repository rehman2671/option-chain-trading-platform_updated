# Phase121 — Read-only GTT microseconds/contract expiry vs selected 1/2/4/8W horizon

**DRAFT stacked on Phase120 PR #125. Zero actual broker
BUY/SELL/GTT writes, no new socket/webhook/capture route,
no local CLOSED or realised P&L, no deploy/merge.
LIVE NRML BUY remains blocked. MIS 15:15 forced exit remains
MIS-only, never applies to NRML multiweek positional holdings.**

## Broker API precision trap

Official [Upstox v3 Get GTT](https://upstox.com/developer/api-documentation/get-gtt-order-details/)
documents `created_at` and `expires_at` as integer timestamps;
actual response examples such as `1749466010000000` and
`1781029799000000` are **Unix microseconds**, not seconds or
milliseconds. The GET does **not** retrieve completed GTT orders.
The triggered GTT creates a LIMIT order subject to rejection and
non-fill. Never mistake `expires_at` for independent exchange-native
protective stop coverage or a guaranteed exit.

The nominal 1, 2, 4 or 8 **calendar week** interval may cross
a selected option contract expiry, a GTT expiry, market holidays,
unexpected sessions, RBI/NSE/BSE rule changes or a disconnected broker.
Without authenticated original-date contract master/calendar, no
sample test should claim actual F&O expiry eligibility.

## Pure research audit

`adaptiveNrmlGttExpiryHorizonReadOnlyAudit.ts` accepts a
single original NRML `NSE_FO|`/`BSE_FO|` option, exact
SINGLE `ENTRY SELL BELOW` GTT, externally supplied
contract-expiry UTC, explicit evaluated-at UTC and selected
1/2/4/8W calendar horizon. Strict canonical ISO milliseconds
UTC input: `YYYY-MM-DDTHH:mm:ss.sssZ`; impossible or
ambiguous dates and numeric overflow reject. Source timestamps
require safe Unix microseconds in 2000..2100 and
`created_at < expires_at`.

It records only **broker-reported temporal comparisons**,
never a release authority:
- Missing/wrong contract/GTT or missing/reversed/millisecond/
  seconds/nanosecond timestamps -> unknown/reject.
- Broker created after evaluation clock, or GTT already
  expired at review -> expired/inconsistent.
- Even with future expiry, only an exact `SCHEDULED` ENTRY SELL
  rule with `order_id:null` may pass the temporal *scheduled*
  overlap check. `FAILED/CANCELLED/EXPIRED/PENDING/TRIGGERED/OPEN/
  COMPLETED`, unknown status or an already generated child ID
  gets `BROKER_GTT_RULE_NOT_SCHEDULED_OR_ALREADY_GENERATED`.
  A generated LIMIT SELL child is reviewed separately under
  Phase113/114 and NEVER proves ongoing overnight STOP coverage.
- Asserted contract expiry before nominal holding end ->
  contract does not meet selected week horizon.
- Broker GTT expiry before selected nominal holding end ->
  broker GTT is shorter than holding intent.
- Broker GTT expiry after externally asserted contract
  expiry -> contradictory source; quarantine.
- Otherwise -> `BROKER_REPORTED_GTT_HORIZON_OVERLAP_NOT_PROTECTIVE_STOP`,
  explicitly NOT an authenticated market calendar, native exchange
  STOP, 1–8-week protection, expiry settlement or confirmed fill.

All audit results have `assertedContractExpiryIndependentlyVerified:false`,
`actualOptionsContractMasterAndLotVerified:false`,
`exchangeNativeStopAckVerified:false`,
`persistentOvernightStopCoverageCertified:false`,
`futureGapExitExecutionGuaranteed:false`, and every
live NRML BUY, duplicate SELL, auto-CLOSED, and P&L write false.

## Real read-only source integration

`guardExactBrokerGttGet` and `guardFullBrokerGttList` in the
existing `UpstoxProvider` path now validate microsecond
`created_at` and `expires_at` **when provided**. If one
field is supplied, both must exist and be within range with
strictly increasing times; HTTP success with wrong unit
becomes `null`/UNKNOWN, not `[]`.
Legacy mocked responses with both fields omitted can remain
unverified input to older read-only tests, but the Phase121
expiry audit itself **requires both real timestamps** to issue
any descriptive horizon assessment.

No new HTTP endpoint, position/order mutations, broker connection,
calendar file, time service or signed exchange timestamp is created.
Focused Node22 tests include realistic microseconds, every selected
week length, invalid source time units, impossible/missing
review/expiry clocks, expiry undercoverage, real adapter mock
HTTP 200 with invalid timestamps and all no-release flags.

## Still requires independent release blockers

Open #17: licensed original option bid/ask/depth with permission
and original-time chain universe.
Open #18: authenticated effective-dated NSE/BSE F&O master,
trading sessions, contract expiry, lot size, shifts/amendments.
Open #19: independently signed preregistration/reviewer identity
and key custody.
Open #20: actual Upstox-sanctioned existing NRML long option
GTT SELL close-only/no-short, triggered child/partial/reconnect,
persistent native protective stop evidence and signed venue ACK.
Open #21: truly untouched 1/2/4/8W OOS including target reversals,
slippage, worst gaps, capital and fees.
Open #22: independent security, legal, operational and release review.

The original position might be carried across overnight; no
MIS 15:15 exit is ever authorized. **Keep DRAFT/unmerged,
do not enable LIVE NRML BUY based on this audit or CI.**
