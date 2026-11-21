# Phase96 — Exact one Upstox net-position row before any real EMA option SELL

**DRAFT · STACKED on Phase95 Draft PR #100 · USER-REQUESTED FUTURE LIVE NRML · NO LIVE NRML BUY ENABLEMENT.** No broker order writes, brokerage credential access, merge or deploy in this development phase.

## Concrete production-facing defect

Legacy `UpstoxProvider.getVerifiedLivePositionQuantity(instrumentKey, product)` queried `GET /v2/portfolio/short-term-positions` and accumulated `quantity += Number(p.net_quantity)` for **every** matching instrument and product row, then returned that sum. If two broker rows for the same native contract/product each reported net 50, this returned 100, potentially matching a locally persisted original 100 long and enabling an unintended full 100-unit market SELL. Even when there were **zero** matching rows (e.g. an API scope or contract/product mismatch), the accessor returned **0**, incorrectly conflating *not visible in the portfolio source* with *a verified flat broker position*. Different product rows for the same option could be ignored, and `Number(...)` coerced strings, empty values or booleans.

Phase95 prevented overselling by submitting **verified remaining quantity**, but a verification algorithm that silently sums ambiguous rows or interprets no row as zero is not an authoritative quantity check. This patch closes that gap for the existing broker-facing MIS/NRML SELL path, without bypassing the separate Phase90 live NRML BUY restriction.

## Implementation

- New pure `resolveUniqueBrokerNetPosition(rows, exactInstrumentKey, exactProduct)` accepts only requested `product='MIS'\|'NRML'`, maps to Upstox native `I` or `D`, and requires exactly **one** row with the exact option instrument key and product. A duplicate native product row or a row on the **same instrument with another product** is a conflict, not a nettable row. Invalid/malformed portfolio rows, missing source, missing requested contract, oversized response, negative/unsafe/fractional net, or string-coercible numeric formats fail closed.
- A **single explicit** broker row with `net_quantity:0` remains an observable zero quantity, but it **never** permits a positive live SELL under Phase95's `assessBrokerRemainingSellQuantity()`. An **absent** requested instrument returns `netQuantity:null`, never a manufactured 0.
- `UpstoxProvider.getVerifiedLivePositionQuantity()` continues performing the existing read-only Upstox portfolio API query, but calls the pure unique-row check and returns number only for valid unique evidence; otherwise `null`. Existing `requestLiveExit()` refuses null or wrong remaining net, including after a partial prior SELL, before the real broker order boundary. Legacy MIS keeps its normal intraday 15:15 process **when its independent broker order/exit safeguards pass**; all NRML positional holdings remain excluded from that routine.
- Phase95 `auditNrmlRestartQuarantine()` reuses the exact same unique-row rule. A current broker net that only appears correct after summing duplicates can no longer set `brokerNetMatchesJournalRemainder:true`. Extra product exposure also removes any apparent unique NRML net match.
- The helper is side-effect-free and returns only an observed quantity or **fixed generic reason code**; it exposes no broker account number, order ID, raw token, original option BID, source path, original data, GTT or authentication token.

## Tests

Twenty-three new Phase96 synthetic adversarial tests exercise unique native D/I rows; exact contract identity; explicit zero versus absent contract; duplicated 50+50 or 100+0 rows; mixed MIS/NRML product rows; unknown product; malformed broker rows anywhere in returned source; partial decimal digit strings versus unsafe coercion; negative, NaN, infinite, unsafe and fractional quantity; oversized/failed source; Phase95 remainder SELL sizing with ambiguous or unique portfolio; and Phase95 restart quarantine refusing duplicates and same-option dual product exposure. Prior Phase95 dedicated suite expected 241 tests, so Phase96 dedicated suite expects **264 synthetic tests**, subject to actual GitHub results. Node22/npm ci, TypeScript static, Phase50–96 focused and broad EMA15M safety/full regression/production build workflows are independent gates.

## Safety and external release blockers

An Upstox portfolio GET is still a **non-atomic broker report**, not independent exchange position custody or certified original entry/SELL fill lineage. Current position can change before a market SELL, including due to pending BUY, GTT STOPLOSS, manual order, partial fill or another worker; existing broker order-book, GTT and durable idempotency interlocks remain mandatory and insufficient for guaranteed fills. No mutation, cancel, protective stop placement, release approval or live NRML BUY enablement occurs in this patch. Open release issues #17–22, especially #20, still require broker-native protective STOP/GTT child exchange ACK, full account/restart/cancel-replace/fill reconciliation, independently verified licensed native 1W/2W/4W/8W option L1, exchange holiday/expiry calendar, untouched OOS and manual risk/security/legal approvals.

**Do not merge, deploy, or claim live trading safety/profitability based on synthetic checks.** No forced NRML 15:15 square-off; existing legacy MIS behavior is unchanged.
