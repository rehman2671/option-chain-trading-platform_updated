# Adaptive Swing v2 Phase67 — separate exchange-like master/calendar reconciliation

**Draft, offline research only. Stacked on Phase66 Draft PR #71. No live broker order, NRML stop, GTT, automatic expiry selection or forced positional 15:15 exit.**

## Why this phase

Phase66 accepts a completely NEW vendor-candidate historical option Level-1 archive without requiring it to match the older synthetic Phase50–65 source. However, its full original listed CE/PE contract universe, expiry dates and session calendar are self-declared. Phase67 introduces a SECOND, separately pinned purported exchange/issuer contract master AND calendar and checks that every original option is consistent with this second source.

**Cross-source agreement is not exchange authenticity.** An operator can fabricate both sources and pins from synthetic option records. Phase67 does not acquire or authenticate real licensed NSE/BSE history or independently trust any issuer signature, publication, available-at clock, holiday, settlement or expiry rule.

## Offline input and exact comparisons

Source: src/server/engine/ema15m/adaptivePhase67IssuerCalendarCrosscheck.ts

The audit independently SHA256-pins the complete original Phase66 standalone data/pins and two separate owner-custodied documents:

1. A complete exchange-like contract-master snapshot for each original OOS decision. Every snapshot contains the exact original session/decision timestamps, claimed master publication and receipt timestamps and the **entire** original contract universe: instrument key, CE/PE, expiry, strike and lot size. No selected-trade/winning-contract-only subset is accepted. Claimed master publication, receipt and option first-listing times must internally precede the historical decision.
2. A separate claimed exchange trading-session calendar with an alleged issuer identity, its claimed historical publication/receipt time and full open/close records. It must preserve **all original OOS vendor sessions**, each original decision's **first-next-session opening**, any additional declared trading sessions and every original contract's claimed last trading date. Sessions must be chronological, nonoverlapping and IST-aligned. Calendar receipt must be claimed no later than the FIRST original OOS decision.

The claimed issuer identifier must match in both documents and the independently retained external pin. This is a string-consistency check, NOT real issuer verification.

For every original OOS decision and every listed CE/PE option, require exact master alignment on instrument key, expiry, type, strike and lot. Last-tradable session must exist on the alleged exchange calendar, not precede the original decision, and not be later than expiry. There cannot be a declared trading session AFTER alleged last-tradable date but BEFORE/ON expiry. This is a conservative data-consistency condition, **not an official exchange settlement/holiday policy**.

Original Phase66 native historical BID/ASK quote rows are re-read, one by one, through the existing strict Phase22 parser. Each market event must occur inside a separately claimed calendar trading session and before the exact matching contract's last-tradable-session close. Any quote after claimed expiry is invalid even if earlier Phase66 acquisition coverage did not select that extra later quote. Missing OOS NO_ENTRY days, unrelated instruments, duplicate master snapshots, late publication and altered first-next-session chronology fail closed.

Phase67 re-runs the full Phase66 new-vendor preflight, preserving original chronological OOS folds, train/test hold embargo, first-next-open option BID, original source quote/depth/spread and full originally listed 1W, 2W, 4W, 8W CE/PE decision denominator. No source is automatically promoted into an executable option strategy.

## Strict result meanings

- INVALID_EVIDENCE: invalid independent source pins or changed source bytes.
- INCOMPLETE_EVIDENCE: original Phase66 source/fold coverage missing, issuer-like master/candidate calendar mismatch, illegal late publication, expiry/last-trade mismatch, missing first-next-session, quote outside an independently claimed session or after last tradable session.
- DESCRIPTIVE_CROSS_SOURCE_MATCH_INSUFFICIENT_OOS_ONLY: all candidate sources internally match but the earlier Phase66 OOS fold/regime sample is insufficient.
- DESCRIPTIVE_CROSS_SOURCE_MATCH_UNVERIFIED_ONLY: all operator-supplied source and issuer-like records match and Phase66 mechanical source coverage passed. **This does not prove official exchange master, true source availability, market profitability or live order safety.**

All independent issuer/calendar, historical vendor data entitlement, trusted original client receipt, real official expiry/lot, executable BID/ASK fill, statistically profitable real multiregime strategy, IV/theta/overnight debit risk and broker-native stop/GTT ACK flags stay permanently FALSE. Execution and production remain FALSE, nativeOrderInstruction=null.

## Synthetic tests

The synthetic Phase66 NEW vendor archive has 4 original OOS decisions across 2 chronological folds, 2 operator-labeled regimes, 32 complete CE/PE listed option pairs and 448 quote prints. Phase67 independently constructs a SECOND, deliberately fake exchange-like master and extended expiry-session calendar. Its 19 adversarial tests verify:

- All 4 snapshots, 32 options, 448 original quotes and 4 first-next-session relationships internally align but never authenticate exchange identity.
- Mutated source bytes, changed expiry/lot, unlisted or missing CE/PE, duplicated master snapshot, delayed master, option allegedly listed after master publication, late calendar, changed original session hours and absent next session are rejected.
- A last-trade date moved past expiry or before another declared exchange trading session is rejected. An extra native option quote AFTER the contract's claimed last tradable session is rejected even when Phase66 acquisition screens were complete.
- Tampered Phase66 option depth or original NO_ENTRY days cannot be rehabilitated by a plausible second source. A self-renamed issuer with newly computed hashes remains unverified.

Focused workflow: .github/workflows/adaptive-phase67-issuer-calendar.yml. The combined Phase50–67 research suite and independent EMA15M targeted safety, production build and full regression must also pass before any merge consideration. Green synthetic CI does not demonstrate real strategy PnL or safe execution.

## Owner-private CLI

Separate owner-0600 JSON files in owner-only 0700 directories. External OS/container network egress blocking is required; the CLI does not itself sandbox, verify supplier certificates or contact a broker.

    npx tsx scripts/audit-adaptive-phase67-exchange-master.ts \
      --approve-isolated-offline-review \
      --private-phase67-new-vendor-and-issuer-package /private/phase67-dual-source.json \
      --independent-phase67-dual-source-pins /private/phase67-pins.json

Only aggregate source coverage, OOS counts, claimed expiry/first-open violations and hard-false safety flags are emitted; never raw quotes, symbols, accounts, licence bytes or private filenames. A zero exit means descriptive local internal consistency only.

## Actual external prerequisites

Obtain legal historical option Level-1 research rights, original vendor-native BID/ASK and best displayed depth, independently verifiable publisher identity and issuer-authenticated historical contract expiry/lot + exchange session master, original historical *client* receipt logs when actually captured, then a separately preregistered untouched real multi-cycle, multi-regime option 1W–8W study including entry-first paths, option premium reversals, theta/IV, liquidity, gap nonfills and entire paid premium debit at risk. A later bulk download does not recreate historical strategy-side availableAt evidence.

Broker-native NRML GTT/stop placement/modify/cancel/child exchange ACK and overnight gap handling are separately unproven. Release issues #17–#22, especially #20, remain OPEN. All stacked research PRs DRAFT/unmerged. Existing EMA23/50 MIS 15:15 intraday squareoff remains unchanged, and positional NRML 1W–8W has NO forced 15:15 exit or live order/GTT/stop writer.
