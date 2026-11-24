# Mega Phase 01 — independent Quant contract-evidence repair

## Status checkpoint — 2026-11-24
Base main: 52f5e862c2f6232b0dc0b7863b5d42bbe2fb7b95. PR #144 head 8c65a26485c29435f70eb98d3d96c9056c02c8a9: paper staging run 45449638090 passed; EMA safety run 45449638093 production build passed, focused invariants and full regression running. Do not supersede its head during CI. This independent batch starts from the same main and does not edit PR #144 files. Merge only after exact-head checks, followed by combined main CI.

## Source changes
- Scheduler previously constructed one BUY from multiple display-only candidate strikes, underlying spot as limit price, fixed quantity multiplier 25. Remove that route, preserve decision generation, configured intent and audit logs. In non-advisory modes return contract evidence and orderResult=null. No automatic paper/shadow fill or live submission is inferred.
- Parse candidate text strictly (not signed executable legs). Require exact underlying, segment, expiry, strike, CE/PE and unique numeric broker instrument key. Use listed contract lot size and quantity instead of fixed multiplier. Reject ambiguous master or duplicate identities, invalid date, past expiry, missing/unsupported provider, and synthetic fallback. Scope NIFTY/BANKNIFTY/SENSEX.
- Use existing broker read-only exact instrument quote adapter; require matching identity, positive LTP, uncrossed bid/ask and positive displayed sizes, exchange last-trade age <=30s and snapshot age <=10s, whole evidence window <=20s. No order authority and no guarantee of fill/depth or same-session master/quote consistency across broker calls. For real execution, structured signed legs, authenticated account risk, market-session/expiry-time gate, common gateway and settlement evidence still required.
- Bound contract lookup fetch to five seconds. No network calls in new synthetic regression fixtures; test scheduler uses null provider.
- Five regression tests: candidate parser, listed lot and premium, ambiguous/invalid identity, source/clock/book invalidity, whole-set failure and expired window.

## Task accounting (relative to PR #144 tracker, provisional until combined CI/merge)
P01-22 listed contracts, P01-31 actual premium, P01-32 effective lot, P01-33 broker instrument key: outstanding -> partial, for read-only Quant candidate path only; no certified live basket or execution replacement. Do not mark these complete. Other outstanding P01-23,24,35,36,37 remain. Provisional combined count 12 implemented awaiting acceptance / 33 partial / 5 outstanding / 0 accepted. Cross-phase tracker from PR #144 must be reconciled after both merges; preserve five phases / 250 tasks. No automatic real broker order, deployment, or external account access.

## Next
Finish PR #144 exact-head CI and merge when green; verify this independent PR, merge and verify combined main. Continue structured trade intent, portfolio capital and Greek evidence, fill/unknown outcome reconciliation, atomic risk reservation and unified gateway. Existing EMA live exit safeguards and NRML interlocks must remain. No dummy account risk values may be accepted as broker evidence.
