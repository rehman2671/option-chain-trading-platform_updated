# Phase85 — Indexed causal original option L1 close coverage (offline)

**DRAFT, no execution.** Stacked on Phase84 Draft PR #89. No genuine licensed original market-data file is supplied by this change; it creates no broker order, live position, scheduled scanner or native NRML stop. The existing MIS 15:15 square-off is untouched; there is no 15:15 forced exit for 1W–8W positional NRML.

## What was inefficient

The original Phase79–84 audit stored owner-supplied historical option best BID/ASK/depth CSV quotes by instrument, then for **each** originally listed contract (including every NO_ENTRY alternative) and **each** owner-declared trading session, ran another `q.filter(...).sort(...)[0]` over the entire option quote list to decide whether a depth-qualified closing BID existed. A 50 MiB original source CSV with many intraday ticks and many repeated contract appearances over independent decision dates can cause very high repeated scanning and allocations. This is **not** evidence of a profitable strategy; it is a deterministic research processing scalability problem.

## Phase85 implementation

- After original source CSV strict parsing, clock/sequence checks and claimed receive-time sort, build a reusable `(instrumentKey, sessionDate) -> latest causally available closing quote` index **once** by examining each parsed quote. Receipt timestamp must be at or before that declared session's closing time; event timestamp must be inside the prespecified final `closingBidWindowMinutes`. Latest event/sequence wins **before** any liquidity/depth check. A later zero BID or sublot BID supersedes an older favorable quote.
- For each source token, lazily cache the sorted owner-declared session dates where latest closing quote's BID is strictly positive and displayed BID depth meets the frozen minimum lots × option lot size. Phase82 contract identity validation already rejects contradictory lots for reused tokens.
- Count missing holding-session closing observations using binary-search bounds over *sorted declared sessions* and that token's cached usable dates. The all-listed count, original NO_ENTRY denominator, last-expiry-region check, censorship and protected false execution/production flags stay identical. A supplier-declared calendar is still **not an independently authenticated exchange calendar**.
- Replace repeated `sessionDates.indexOf(date)` for next-session navigation with one adjacency map. Build a bounded-opening-session set once per post-decision replay instead of scanning every quote for every new armed premium BID peak. As before, a missing required first next-open quote is censored, never interpreted as an overnight stop fill or a safe absence of gap risk.

**Complexity intuition:** closing-state index construction is linear in quote rows, then each original listed decision-contract missing-close query is O(log declared sessions + log cached liquid sessions) instead of rescanning an instrument's full quote tape for every declared holding session. The rest of the historical premium-path replay, original source parse and independent source verification remain separate operations; no benchmark or production performance guarantee is claimed.

## Tests and boundaries

Five Phase85 synthetic cases were added to the original Phase79/81/82/83/84 test file. They check unchanged 1W–8W CE/PE and NO_ENTRY baseline counts, order independence of the declared session list, 1,200 additional genuine-format synthetic intraday BID updates preserving closing/risk aggregates, latest zero-BID suppression of earlier closing liquidity, and a missing NO_ENTRY closing quote. They must pass alongside all 81 existing Phase79–84 + Phase80 tests (**86 expected** total in the dedicated GitHub suite), plus focused Phase50–85 and full EMA15M safety/build/regression workflows.

A performance refactor is **not** a real market option replay or actual execution fill. No licensed original NSE/BSE 1W/2W/4W/8W BID/ASK/depth archive, issuer-authenticated calendar/expiry/lot master, independently audited legal rights or strategy-client receipt clock, untouched multi-regime OOS, IV/theta/spread/slippage, broker native NRML stop/GTT child ACK or gap nonfill evidence is provided. Live trading and rank/buy permission remain false. Release blockers #17–22, particularly #20, remain OPEN; keep this PR draft/unmerged.

**Upstream CI qualification:** In Phase83 focused research CI a GitHub checkout network failure was observed; Phase84 focused and wider checks were still in progress when this branch was started. Never treat one dedicated synthetic CI as a blanket production approval.
