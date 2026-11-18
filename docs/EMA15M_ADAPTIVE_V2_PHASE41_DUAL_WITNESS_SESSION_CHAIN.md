# Adaptive Swing v2 Phase41 — dual-witness session-boundary archive and explicit calendar coverage

**Draft/unmerged research only. No genuine signed NSE/BSE session-calendar file, live Upstox account, authenticated broker GET response, exchange ACK, native standing stop, overnight fill, or licensed historical options L1 was provided or verified.**

## Critical failure modes addressed

Phase40 compared an operator-provided GTT snapshot immediately before a declared session close with a snapshot immediately after the next declared open, and counted unobserved overnight intervals. It could not tell whether the operator **skipped an entire trading session** or silently altered a previously captured pair; manually supplied SHA256 hashes could also be silently changed by the same actor. Phase41 adds **cryptographically signed independent-witness commitments over a complete *declared* exchange-session list**.

Even successful signature verification only proves that two *pinned private keys* signed the exact local checkpoint content; no module verifies actual distinct human ownership, secure key custody, independently captured real Upstox HTTPS traffic, approved NSE/BSE publication, or accurate wall-clock time. Key-pinned evidence is NOT a trust substitute for source authentication.

## Public, time-sensitive source limitations

The NSE page https://www.nseindia.in/resources/exchange-communication-holidays lists exchange holiday calendars and special sessions. The December 12, 2025 NSE 2026 circular is published at https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf. Public notices include Muhurat sessions, holiday changes and segment-specific timings; the general calendar is not enough to assert exact F&O session hours after later exchange updates. Effective-dated circulars require independently reviewed actual original PDF provenance and session times. Phase41 does **not** automatically retrieve or parse the official circular nor treat a manually copied URL/hash as authentic exchange evidence.

Upstox order history https://upstox.com/developer/api-documentation/get-order-history/ is a **one-trading-day history**, and Get GTT https://upstox.com/developer/api-documentation/get-gtt-order-details/ does **not retrieve completed GTTs**. Archival witnesses cannot reconstruct time gaps that never had source snapshots. A GTT SCHEDULED condition does not establish an exchange-native stop ACK or guaranteed execution after an overnight gap.

## Implementation: Phase41 witness + session checker

Source: src/server/engine/ema15m/adaptiveUpstoxPhase41WitnessedSessionCoverage.ts

Exports:

- hashPhase41Calendar(calendar): SHA256 of a fixed JSON.stringify representation of the operator-transcribed calendar manifest
- phase41GenesisSha256(calendarHash, accountScopeId, gttId): domain-separated SHA256 of the chain root and scoped position identifiers
- phase41WitnessMessage(link): domain-separated UTF8 bytes for the exact sequence number, previous link hash, calendar hash, checkpoint pair hash, previous and following session IDs, and declared witnessedAt time
- phase41LinkSha256(link): SHA256 of the signed link (including both signatures)
- auditPhase41WitnessedSessionCoverage(archive, externallyPinnedPolicy): pure read-only fail-closed audit, no broker/network/API calls

Rules:
- One explicit segment (NFO or BFO), one bounded 2–56-session declared calendar. Dates strictly ascending, opening and closing time strings explicitly Asia/Kolkata +05:30, close after open, sane day-length bound and special-session marker. Do not assume a Monday–Friday-only market or universal 15:30 close. The exact source SHA256, calendar SHA256, exchange, ordered expected session dates, first/last sessions, account/GTT ID and independent witness Ed25519 SPKI DER fingerprints must be externally pinned before review.
- For every adjacent pair of declared sessions there must be **exactly one** Phase40 GTT overnight pair, exactly matching both session dates and the session's closing/opening instants. There must be exactly N-1 witness links for N declared sessions; missing/extra/reordered links and pair/hash mismatches fail closed.
- Every link must hash-chain from the correct genesis, and sign the exact pair hash, calendar hash and prior link. Require **two valid Ed25519 signatures from distinct independently pinned SPKI public keys**, roles CAPTURE_OPERATOR and INDEPENDENT_REVIEWER. Review timestamp must fall within a pinned 1–120-minute post-open window. Signatures prove cryptographic authenticity **relative to the pinned keys**, not independent verification of when the signer actually generated the signature or who owns that key.
- An independently pinned final chain-tip digest prevents unobserved tail truncation *when the external pins are truly independent*. If the operator controls the keys and pins together, fabricated archive/content/calendar can still pass.
- After all signatures and session checks, reruns the full Phase40 fail-closed GTT snapshot conditions, including exact instrument, delivery product D, quantity, stop-loss SELL BELOW price, expiry, capture times and scheduled status.
- Positive result only DECLARED_CALENDAR_ALL_BOUNDARIES_DUAL_SIGNED_UNVERIFIED. Report counts signed sessions and **unobservedOvernightIntervals**. It must never declare actual official exchange calendar completeness, independently authenticated Upstox origin, native exchange stop installation, uninterrupted overnight stop continuity or broker authorization.

The original Phase40 same-day child order history remains separate. The signatures in this phase are over GTT boundary pairs only, not proof of signed exchange order ACK/change/cancel/replace history. No attempt is made to claim completed GTT restoration.

## Manual private operator CLI

Source: scripts/audit-adaptive-upstox-phase41-witness.ts

Two already existing private JSON files, each owner 0600 inside owner 0700 directory, supplied only after explicitly separate witnesses have signed archive checkpoint messages:
- private-witness-archive: calendar, Phase40 GTT snapshot pairs, sequence-linked receipt records and two Ed25519 signatures for every pair;
- independent-witness-calendar-pins: exact expected dates/count, original declared circular SHA256, calendar hash, genesis/tip digests, capture/reviewer SPKI SHA256 fingerprints, account/GTT scope and maximum claimed signature delay.

Command on an operator-managed isolated environment, with **no broker credentials, private signing keys or network access**:

    npx tsx scripts/audit-adaptive-upstox-phase41-witness.ts \
      --approve-readonly-offline-witness-review \
      --private-witness-archive /private/phase41-witness-archive-0600.json \
      --independent-witness-calendar-pins /private/phase41-independent-pins-0600.json

Never upload real UCC, original responses, bearer tokens, GTT child order IDs, private paths or signer private keys to GitHub/chat/CI. CLI prints only non-sensitive counts/reasons, no raw source data or account identifiers.

## Synthetic tests

Source: src/quant/tests/ema15m_adaptive_upstox_phase41_witnessed_session_coverage.test.ts

Tests generate **two real Ed25519 keypairs** and sign a fully synthetic Friday-to-Monday and Monday-to-Tuesday sequence. They verify successful local crypto on exact pair hashes without implying broker source; missing Tuesday pair, omitted middle trading session, corrupt GTT response, independently re-signed FAILED GTT, forged key/signature, duplicate role, same signer key for both roles, reordered chain, mismatched chain tip/calendar hash, late review timestamp, changed official-close assertion and explicit special-session metadata rejection/acceptance as applicable.

Special-session dates must be in an **independent** expected dates list to catch operator omission. Signed manifests are only as complete and correct as the independently curated source; Phase41 does **not** derive a real exchange calendar from an operator's unsigned URL.

## Permanent release invariants

All Phase41 and Phase40 results retain executionAuthorized=false, productionSafe=false, brokerAuthenticated=false, brokerStopInstalled=false, protectedOvernight=false, nativeOrderInstruction=null. Phase41 also fixes: officialExchangeCalendarAuthenticated=false, officiallyCompleteSessionCoverageEstablished=false, brokerOriginAuthenticated=false, independentWitnessHumanIdentityAuthenticated=false, exchangeNativeStopAckVerified=false, stopContinuityProven=false, guaranteedStopExecution=false.

Release blockers #17–#22 including native stop #20 remain OPEN. All research PRs remain Draft/unmerged. Existing EMA23/50 MIS intraday 15:15 automatic square-off is **untouched**; NRML 1W/2W/4W/8W positional trading inherits **NO 15:15 auto-exit**. No live GTT/order write, market polling, schedule, native stop repair, guaranteed gap-exit or production activation.

Next research priority: source-authenticated **broker-origin read-only captured responses and exchange-native ACKs**, independently validated exchange-published effective-dated F&O calendar, and event archive continuity across all missing intervals. Any encrypted/signed archive can still be false if its source is fabricated. Real license-compliant original options L1 and unbiased walk-forward/OOS cost/overnight tail stress remain necessary before any trading release.
