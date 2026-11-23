# Adaptive Swing v2 Phase53 — ORIGINAL external-document BYTE custody behind Phase52 receipts

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase52. No exchange-authenticated original L1, vendor entitlement, outside reviewer verification, profitable OOS results, live NRML broker API, native order/GTT/stop write, or production-safe status.**

## Why Phase52 signatures were not enough

Phase52 signs digests and opaque references for claimed external vendor/source and exchange-calendar evidence, while only the signer-provided digests are present in the data submitted for review. An operator can have two valid Ed25519 signatures yet submit **no underlying external documents whatsoever**. Even a correctly verified detached signature cannot prove the original source documents exist, were not substituted, are properly licensed, or were issued by NSE/BSE.

Phase53 adds the missing **document byte-to-signed-receipt join**. This is a narrow additional integrity check; it does not pretend to perform issuer trust, PDF CMS signature validation or document-content/exchange-calendar semantic authentication.

## Implemented

Source: `src/server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.ts`

`auditPhase53OriginalDocumentByteCustody(input,pins)`:

1. Accepts the full Phase52 original signed OOS source dossier plus its independent pins and **two genuine supplied byte arrays**, one document for the original-option-L1 reviewer and one for the session-calendar reviewer. Each role has an exact document reference matching its Phase52 signed receipt. Any missing role, invalid/oversized original bytes, duplicated role or identical bytes reused across roles is rejected.
2. Computes SHA256 from **the actual supplied document bytes**, not the claimed digest in JSON. It must match (a) the signed Phase52 receipt's document digest, (b) the independent Phase52 external-document digest pin, and (c) a separately prespecified Phase53 digest and file-byte-length pin. Both distinct documents are mandatory. Evidence byte size is conservatively bounded to 64 bytes–4 MiB each for this manual review mode.
3. Independently SHA256-pins the exact Phase52 original dossier and its prespecified Phase52 pin object, data source dataset ID, declared OOS session count, full original option-L1 quote-row count and **12 attempts per declared OOS day**. Rebinding only the document hashes while changing source/OOS denominators cannot create a credible study.
4. Reruns Phase52 detached Ed25519 verification (which reruns Phase51 declared-session ledger, Phase50 original L1 source-`availableAt` order and Phase8 entry-first cohort). Any missing source option quote, omitted OOS date or incorrect source availability keeps the review `INCOMPLETE_EVIDENCE` even when both documents and signatures are internally consistent.
5. Maximum success is `ORIGINAL_DOCUMENT_BYTES_MATCH_SIGNED_RECEIPTS_ONLY`. This says **only** that two supplied original byte streams match the registered signed receipts and predeclared internal pins. It does NOT establish official issuer, vendor entitlement, original L1 authenticity, independently timestamped review, profitable strategy, risk budget, actual broker execution or stop protection.

All outputs hardcode `executionAuthorized=false`, `productionSafe=false`, `nativeOrderInstruction=null` and every issuer, licensing, source-clock, independent reviewer, trusted timestamp, PnL, broker ACK and NRML overnight-protection proof flag **false**. Reports include only aggregate counts and fixed reason codes, not vendor quotes, raw document bytes, keys or original account/instrument IDs.

## Synthetic tests

The new tests `src/quant/tests/ema15m_adaptive_phase53_original_document_bytes.test.ts` use a **separate synthetic fixture** with generated test-only Ed25519 keys and two different fabricated document byte streams. Tests cover:

- Matching both original source artifacts to the original signed receipt hashes, 2 declared OOS days and 24 original strategy arm/horizon attempts.
- Original document entirely absent, single-byte substitution at unchanged length, document changed with Phase53 repins but no Phase52 re-signing, wrong signed reference, duplicate bytes across reviewer roles, or duplicate role.
- Tampered quote-row count, changed historical source with unchanged independent phase pins, or a deleted OOS day even after both test reviewers re-sign the changed source and all inner hashes are recomputed.
- Original source `availableAt` omitted and re-signed: signed documents cannot replace missing original observation availability or stop/gap verification.
- All non-trading, no-issuer-verification, no profitability and no native stop flags must remain false.

The synthetic test case is **not** a real exchange PDF, license or historical option trade.

## Manual isolated offline audit

Run against five independently retained private files in owner `0700` directories, owner `0600` files, with no symlinks and operator-enforced OS no-network-egress:

```bash
npx tsx scripts/audit-adaptive-phase53-original-document-bytes.ts \
  --approve-isolated-offline-review \
  --private-phase52-signed-source-dossier /private/phase52-dossier.json \
  --private-phase52-independent-pins /private/phase52-pins.json \
  --private-phase53-document-byte-pins /private/phase53-pins.json \
  --private-original-l1-evidence-document /private/original-l1-evidence.pdf \
  --private-original-calendar-evidence-document /private/original-calendar-evidence.pdf
```

Files do not need to be called PDF (any original documented evidence bytes are checked), and **this phase does not verify PDF signatures or parse vendor issuers**. The external-document bytes must be the exact originals corresponding to the two Phase52 signed receipts. The Phase53 pins must have been prespecified independently of the archive and actual signed source data. The CLI writes no files, calls no external APIs and prints only redacted aggregate counts, fixed reason codes and the permanently false trading/profit/issuer/stop flags. A process exit code 0 is **only** a successful byte-integrity check; it is never regulatory, license, trading or profitability approval.

## Remaining genuine source and live execution gates

Appropriately licensed source-original option L1 data and accurate original event and strategy availability clocks; issuer-validated trading/special session and expiry/contract master history; original external documents with genuine verified CMS/X509 and independent certificate trust; independently authenticated vendor licensing and real-world reviewer key custody; sufficient untouched chronological OOS data, realistic premium spreads/IV/theta, 1W–8W holding/gap risk and adverse non-fill cases; genuine broker-native NRML order/GTT ACK, modifications/cancellation and overnight continuity.

Keep release blockers #17–#22 including #20 OPEN. All stacked research PRs remain DRAFT/unmerged. The existing EMA23/50 **MIS intraday** auto-square-off at 15:15 is unchanged. **NRML positional 1W/2W/4W/8W has NO forced 15:15 exit and NO live trading/GTT/stop-repair implementation.**
