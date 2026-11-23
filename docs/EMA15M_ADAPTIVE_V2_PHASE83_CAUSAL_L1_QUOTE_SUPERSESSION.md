# Phase83 — Causal native option L1 book-state supersession (offline)

**Draft, offline research only.** Stacked on Phase82 Draft PR #87. This corrects a concrete failure mode in the original 1W/2W/4W/8W all-listed CE/PE historical quote audit: a list of BID/ASK observations is a sequence of *changing quote states*, not a set of independent prices from which the most favorable liquid mark can be selected.

## Correctness defects closed

1. **Decision-time ASK:** Phase79 previously filtered out zero ASK or sub-lot displayed ASK first, then took the freshest remaining quote. That effectively *resurrected* a stale buyable ASK after a newer unbuyable book state. Phase83 first selects the latest source event that the owner-claimed original client could have received before the decision, breaking same-event-time ties by per-session source sequence. Only then does it test configured age, positive ASK and sufficient displayed ASK depth. If the latest state is not usable, entry coverage is **censored**, not inferred from an earlier ASK and never an assumed BUY fill.

2. **Session-close BID:** Phase79/81 previously counted **any** depth-qualified BID inside the closing window, even if a newer source quote reported zero BID or sub-lot BID depth before close. Phase83 chooses the latest causally available event/sequence in that window, then requires positive BID and displayed lot depth. An updated no-bid state censors the close rather than borrowing an older favorable BID.

3. **Out-of-order premium-path events:** Historical quote events are processed by owner-claimed `originalAvailableAt` receipt time, but a delayed **older eventAt/sequence** can arrive after a newer event and must **not** roll the live observable book backward. Phase83 applies an event-time watermark with source-sequence tie-breaking to the post-decision original receipt-order stream. Backdated arrivals are excluded from the theoretical BID-peak/giveback/gap path and counted as `entryCandidateStaleLateQuoteObservationsIgnored`.

4. **Disappearing displayed liquidity:** Positive price/depth updates are no longer filtered *before* source-state supersession. A newer zero-priced or sub-lot BID in the post-decision path is an observed no-usable-BID state, counted per decision-contract candidate in `entryPairsWithObservedIlliquidBidUpdate`. Such cases are **censored** and cannot claim safe exit, actual exchange stop execution or guaranteed stop fill. Those updates do not become fictitious loss/exit prices.

Both extra counters propagate to Phase80's owner-private **redacted aggregate** report and regime × horizon × CE/PE cells; no source tokens, private paths, prices, account details or raw quote times are included.

## Scope and caveats

- Timestamp, sequence, lot and contract identity remain operator-supplied assertions. These checks do **not** authenticate the original strategy's client receive clock, exchange instrument master, vendor licence or continuous data capture. Missing and falsely labeled source events remain unknown.
- Suppressing a late old message is an offline, causally conservative book-state model, not proof that any actual broker/exchange distributed that message or that a market order could execute at the displayed BID.
- An observed nonzero BID and displayed best-bid quantity do not guarantee fill, stop ACK, slippage, queue priority, overnight protection or positive PnL. Zero displayed liquidity may coincide with full long-option premium loss.
- Continuous intraday gaps, official holidays/expiries, IV/theta, untouched multi-regime original OOS, authenticated native NRML stop/GTT child ACK, licensed real 1W–8W native BID/ASK/depth and actual accounts remain external blockers.

## Regression

Eight additional synthetic adversarial controls appended to the original Phase79 tests: baseline, newer unavailable decision ASK, newer sub-lot ASK, same-millisecond source sequence supersession, latest zero BID at session close, latest sub-lot BID, stale delayed low falsely appearing after the higher fresh quote, and post-peak displayed-BID blackout. Phase79+81+82+83 cases **50**, Phase80 private intake tests **23**: dedicated CI total **73** tests. Existing Phase50–83 focused research, EMA15M invariants, production build and full regression are separate gates. Nothing about green synthetic CI permits production or proves profitability.

No new network access, broker SDK call, live order writer, option selection/ranking, background engine behavior, forced 15:15 positional NRML square-off or changes to existing MIS intraday squareoff. PRs remain draft/unmerged; stop lifecycle release issue #20 and other #17–22 remain open.
