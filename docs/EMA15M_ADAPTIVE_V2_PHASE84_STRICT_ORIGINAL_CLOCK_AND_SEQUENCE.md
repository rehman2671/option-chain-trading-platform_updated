# Phase84 — Strict native option L1 clock and per-session exchange-sequence consistency

**DRAFT · OFFLINE RESEARCH ONLY · NO MARKET DATA ACQUIRED · NO ORDER/STOP WRITES.** Stacked on Phase83 Draft PR #88.

## Why this is a concrete correctness fix

Node/JavaScript `Date.parse()` **normalizes some impossible Gregorian calendar dates** rather than rejecting them. For instance, an operator-supplied `2026-11-31T15:29:00+05:30` can parse as December 1. Previously Phase79's quote timestamp `stamp()` accepted any regular-expression-shaped timestamp for which `Date.parse()` was finite. Because original source CSV, declared session calendar and original event/receipt timestamps are operator-supplied, a malformed impossible original date could therefore become an apparently valid December 1 close or next-session market quote, inflating synthetic historical option-path coverage.

Phase79 also rejected duplicate `sourceSequence` within (instrument, IST session), but never cross-checked the **sequence's eventAt ordering**. A source quote carrying greater vendor-per-session sequence could claim a strictly **earlier** exchange event time. The Phase83 receipt-time supersession replay might then treat inconsistent source order as valid original observation, especially if the operator re-hashed the complete archive.

## Code changes

- Strict `stamp()` validates the written offset-local wall-clock date and time by parsing to UTC and reconstructing the original local `YYYY-MM-DDTHH:mm:ss` using the supplied timezone offset. Any rollover such as Nov 31 -> Dec 1, Feb 31 -> Mar 3, or invalid clock hour is rejected. Valid ISO-8601 `Z` and explicit positive/negative UTC offsets continue to work.
- Collect (sequence,eventAt) for every original option source quote per **exact instrumentKey + IST trading session**. Sort those quotes by source sequence and reject any inversion where a greater sequence corresponds to an **earlier** event timestamp. Equal timestamps with increasing sequences remain allowable, as do CSV rows in arbitrary storage order, a reset of sequence numbers on a new session, and out-of-order `originalAvailableAt` receipt timings. Receipt-time arrivals are **not** incorrectly forced to be monotonic, because delayed observations exist.
- This is a consistency check, not proof of completeness: missing source sequence numbers are NOT synthesized; duplicate sequence checks and Phase83 out-of-order receipt quarantine remain unchanged.
- These checks apply before the all-listed CE/PE 1W/2W/4W/8W and NO_ENTRY option premium-path census. Invalid original quote/session clocks reject with the existing safe reason codes; contradictory per-session event clocks reject as `PHASE84_ORIGINAL_SOURCE_SEQUENCE_EVENT_CLOCK_INVERSION`, marked `INCOMPLETE_EVIDENCE`.
- Existing Phase80 private runner directly calls this same Phase79 audit; no new private vendor file handling, broker requests, telemetry, sensitive logs or raw-data commits.

## Tests and release constraints

Eight Phase84 adversarial tests appended to Phase79 tests: valid baseline, invalid Gregorian source quote, invalid declared session opening/closing date, source-sequence inversion despite fresh operator pins, out-of-order CSV file rows with valid source ordering, real-equivalent UTC timestamps, real-equivalent negative-offset timestamps, and per-session source sequence reset. Existing 73 synthetic tests plus these eight total **81 expected** in dedicated CI, alongside TypeScript checking. Separate Phase50–84 research checks, EMA15M invariant tests, full regression and production build must also be verified independently.

**Not established:** independently licensed vendor/exchange origin, original historical client receiveAt, real 1W–8W option BID/ASK/depth completeness, lawful research rights, authenticated official F&O contract/expiry/calendar, out-of-sample regime profitability, executed fills, broker native NRML stop/GTT child ACK, overnight gap fill, IV/theta or capital-risk release. These outputs remain false. Original MIS 15:15 behavior is untouched; no forced positional NRML 15:15 exit or any live order writer. Release issues #17–#22 (particularly #20) remain OPEN and PR stays draft/unmerged.

**Infrastructure caveat:** parent PR #88's Phase50–83 focused workflow encountered a GitHub Actions checkout network failure (github.com:443) rather than a test failure. Green dedicated Phase83 CI and production bundle do not convert that failed workflow into a success; Phase84 workflows must be checked on their own merits.
