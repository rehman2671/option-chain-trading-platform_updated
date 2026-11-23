# Phase82 — Original 1W–8W option contract identity and quote-scope isolation

**DRAFT · OFFLINE ONLY · NO BROKER / VENDOR ACCESS / EXECUTION.** Stacked on Phase81 Draft PR #86.

## Why

Historical original option L1 source files use instrument tokens, not reliable self-describing contract expiry, CE/PE side, strike or lot size. In Phase79, the frozen owner-claimed catalog was checked for duplicate tokens **within a decision**, but not for contradictory metadata across decision dates. Thus a reused token could silently share BID paths between different instruments or tenors. The raw quote parser also allowed rows for tokens absent from the original all-listed decision catalog; and decision timestamps only had to match an IST date, not lie within the declared session.

These are **structural data-integrity errors**, not proof that any vendor provided authentic exchange data.

## Hardened pure Phase79 audit

`auditPhase79OriginalPremiumPathCoverage()` now:
- Records the first claimed immutable contract identity for each token across the original frozen 1W/2W/4W/8W CE/PE decisions, including NO_ENTRY sessions: `(optionType, expiry, strikePrice, lotSize)`.
- Rejects reuse of the same token under **different** expiry, CE/PE side, strike or lot size with `PHASE82_REUSED_CONTRACT_TOKEN_CONTRADICTS_EXPIRY_SIDE_STRIKE_OR_LOT`. Legitimate repeated observations of an **identical** option on consecutive decision days remain valid; its remaining tenor naturally shortens as the clock advances.
- Rejects invalid/nonfinite/zero original strike prices and any claimed original decision before the opening timestamp or after the closing timestamp of its **declared** trading session.
- Rejects original native CSV quote tokens not in the frozen original listed-contract union with `PHASE82_NATIVE_L1_ROW_OUTSIDE_FROZEN_LISTED_CONTRACT_UNIVERSE`, and quote events for a known option token **after** its claimed expiry date with `PHASE82_NATIVE_L1_QUOTE_AFTER_DECLARED_OPTION_EXPIRY`. These fail-closed `INCOMPLETE_EVIDENCE` results are deliberate: a full multi-underlying vendor file may contain legitimately unrelated symbols, but it cannot be silently treated as an exact scoped original 1W–8W audit dataset. A separate private provenance-preserving scope review is required; do not pretend a manually filtered copy was the original raw vendor bytes.

The existing SHA-256 pins are still operator self-checks, **not independently trusted issuer signatures**; independent authentication of instrument master / sessions / holidays / vendor licence remains mandatory.

## Regression and release

Ten additional Phase82 adversarial tests are appended to the existing original option premium-path tests: unknown CSV token, quote after expiry, cross-decision expiry / CE-PE / strike / lot aliasing, original decision before open or after close, illegal strike metadata, and allowed immutable token reuse across two decision dates. Dedicated CI runs Phase79–82 + Phase80 tests (**65 synthetic tests**), TypeScript gate, and separate focused Phase50–82 and broad EMA15M build/safety/full regression.

This change adds no broker credentials, HTTP, venue data acquisition, original client receipt authentication, actual market data delivery, strategy profit calculation, horizon recommendation, option order, stop/GTT writer, native NRML holding service, stop-fill guarantee, MIS modification, or forced 15:15 positional exit. Phase79/80's permanent falsy authentication/trading/profitability bits and redacted aggregate-only reports remain unchanged.

The **external blocker remains**: a genuine licensed and independently authenticated market/exchange original 1W–8W BID/ASK/depth source, official F&O instrument master with calendars and expiry/lot changes, legally reviewed owner rights and contemporaneous receipt proof where captured, untouched multi-regime OOS and genuine broker sanctioned NRML stop child ACK/nonfill tests. Issues #17–22, particularly #20, remain open. No merge, deploy or trading permission from synthetic CI.
