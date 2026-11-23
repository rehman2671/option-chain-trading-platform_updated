# Phase132 — Sellable F&O best-bid depth, market spread and snapshot-clock fence before MIS automatic exit

**Status: stacked research DRAFT on Phase131 PR #136. This is not a new NRML positional trading release. No broker BUY/SELL/GTT mutation is added, no exchange-native stop ACK or sell-fill guarantee. Existing LIVE NRML BUY/SELL and NRML 15:15 forced exits remain blocked.**

## Why: a fresh option LTP is NOT an executable SELL price

Upstox Full Market Quotes V3 provides `last_price`, `last_trade_time` (milliseconds of last execution), `timestamp` (quote snapshot time) and D5 `depth.buy[]` / `depth.sell[]`: https://upstox.com/developer/api-documentation/get-full-market-quote-v3/ . A historical or recent trade can print at a very different price from the current best bid. Phase131 correctly enforces exact option source, contract token and LTP freshness, but its legacy MIS automatic SL/target/trailing decisions still use LTP, not observed sellable option bid depth.

## Phase132 pure safety assessment

`assessSellableOptionDepthReadOnly` requires Phase131 validated exact Upstox F&O LTP source/clock, PLUS adapter-declared `UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5`, a strictly parsed broker quote-snapshot ISO UTC or offset time, and the following conservative conditions:

- Snapshot must be no older than 10 seconds and no more than 3 seconds in the future, AND last trade cannot postdate snapshot by more than 2 seconds. The quote's declared snapshot clock is NOT independently exchange-signed.
- Positive finite best bid and ask prices, uncrossed book (bid <= ask), strictly positive whole-number bid and ask quantities. Missing/crossed/zero/unreasonable depth blocks automatic evaluation.
- **Best bid quantity must be at least the current local remaining MIS long**; a 50-unit bid does not justify marking a 100-unit position as if it can all exit at that price. Even adequate observed quantity is only indicative, may cancel immediately, and cannot certify full execution or account no-short status.
- Conservative **maximum spread 2,000 basis points (20% of midpoint)**; wider books are quarantined for human broker review. This is a research-specific risk circuit, NOT an NSE/BSE exchange rule or a validated profitable configuration. Its threshold and delayed-exit risks require independent risk/operations review.
- Review returns only indicative best bid, observed quantity, spread and fixed reason codes, no account or instrument IDs; every stop/NRML/write/fill guarantee and independent attestation flag remains false.

## Runtime changes

`UpstoxProvider.getLiveOptionQuote` uses the existing Phase131 session-pinned, exact-contract authenticated GET, plus validates `timestamp` and first D5 bid/ask row. It fails closed if source depth is missing, malformed, stale, crossed or has no positive quantities. Its returned raw `last_price` is retained solely as non-executable LTP reference. Local auth/account/epoch switch during the GET is still denied. The broker adapter makes no order.

`LiveExecutionService.monitorLivePositions()` now evaluates **legacy MIS-only** SL, target and trailing using `observedSellBid`, not `last_price`, and writes a more conservative indicative unrealised premium mark. Failure skips automatic SELL/position update and warns that human broker review is needed; it neither closes a real position nor silently retries an order. A valid bid crossing the threshold still must pass the existing upstream Phase90–131 broker net, orderbook, GTT, exit CAS and read-back gates before any MIS market SELL.

## Dedicated regression evidence

Phase132 tests cover UTC vs Upstox IST timestamp parsing, impossible dates, stale/future snapshots, trade time after snapshot, wrong quote source, absent/zero/crossed depth, noninteger/insufficient bid quantities, 20% spread threshold, pinned native Upstox broker GET with valid D5 and credential rotation, and real `monitorLivePositions` mocked execution proving last trade alone never triggers. Prior Phase130/131 valid MIS fixtures are updated to include genuine D5 shapes. This is **mock-only verification**, not a sanctioned exchange/broker rehearsal.

## Remaining external blockers / operational concern

By refusing automatic exits when bids are missing/illiquid, the module can leave a real MIS position open through risk events. Operators must provide an independent real-time broker account/stop incident process, appropriate alerts and documented supervision. A displayed best bid is not guaranteed bid size at order arrival, not independent full-depth provenance and not a native protective STOP. Obtain licensed original option Level-1 feeds, exchange contract/expiry/lot/session amendment calendar, signed per-trade fills and historical GTT child ledger, genuine broker close-only NRML stop, restart/gap tests, 1/2/4/8-week OOS, and independent security/risk/operations approval (#17–#22).

**Draft/unmerged/undeployed. No LIVЕ NRML release; green CI is not proof of safe/profitable trading.**