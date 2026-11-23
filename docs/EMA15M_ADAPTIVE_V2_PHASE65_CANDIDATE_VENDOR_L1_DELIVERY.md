# Adaptive Swing v2 — Phase65 candidate historical option L1 vendor delivery intake

**DRAFT · offline research ONLY · stacked on Phase64. No live NRML order, GTT write, stop repair, horizon auto-selection or forced positional 15:15 exit.**

## Why this phase

Existing Phase21/22 provide vendor-neutral external source intake and strict native CSV parsing. Phase64 already measures all originally listed CE and PE option data coverage. Local Phase62/63 signatures and hashes do not prove vendor identity, genuine source clocks or historical use rights.

Phase65 implements an **offline candidate vendor handoff** that reconciles a separately provided native-format option top-of-book file, point-in-time contract catalog, session calendar, entitlement document and original source declarations against the **complete, frozen Phase64 OOS dataset**. It never downloads new data, buys subscriptions, backfills original quotes or changes an original strategy entry/exit.

**No genuine independently licensed historical option dataset has been obtained.** The test fixture copies synthetic source into a new candidate package, demonstrating that self-consistency alone is not vendor provenance.

## Delivery requirements and independent evidence pins

The owner-private dossier includes:

1. The complete independently frozen Phase64 input/pins. Nested audit reruns Phase64 → Phase63 → Phase62 → Phase61 → Phase60 → Phase59 → Phase58 → Phase57 → Phase51/50 → Phase8. All original OOS dates, no-trade records, alternative strategy arms and 1W/2W/4W/8W remain in the denominator.
2. Separately delivered original native-format best-book option CSV, with exactly nine ordered columns: sourceRecordId, sourceSequence, instrumentKey, eventAt, originalAvailableAt, bid, ask, bidQty, askQty. It reuses the **Phase22 strict CSV parser**. Every row must match the **complete original Phase62 option tape**, including warmup and holding-session quotes, not just eventual winners. Different vendor schema requires explicit earlier Phase22 mapping, never implicit column guessing.
3. Original decision-time option listed-contract catalog bytes and extended exchange-session calendar bytes. A changed expiry, lot, contract or missing next-day opening session is not accepted.
4. Opaque separately retained entitlement evidence bytes and five claimed vendor delivery/product, legal scope, contract-master and session reference identifiers. **A SHA256-matching licence document is not proof of entitlement or actual historical L1 use rights.** Independent supplier/legal review is still necessary.
5. A frozen 17-field delivery declaration with source type, claimed licence scope, original-client receipt-clock classification, synthetic-versus-market identity, first/last original market event time, archive delivery time and full original quote/OOS/listed-CE-PE counts. Historical trade-only, bhavcopy, reconstructed trade-as-BID, replay-estimated availableAt, denied research rights and a download timestamp used as original strategy availableAt are **rejected**.
6. Independently stored SHA256 pins over exact full Phase64 source/pins, declaration, candidate CSV bytes, original contract and session catalogs, claimed licence bytes and exact original decision, listed CE/PE and native L1 quote denominators. Lowering counts or swapping CSV after outcomes is forbidden.

The candidate archive delivery instant must be no earlier than the last original market event. A later download is NEVER historical proof that a strategy received any original L1 quote on its OOS decision day. Even an operator declaration of contemporaneous original client capture is unverified.

## Outcome states

The offline function auditPhase65CandidateVendorDelivery returns:

- INVALID_EVIDENCE for invalid independent hashes, malformed schema/clock, a trade-only or EOD source, fake source licence scope or a substituted download-time availableAt claim.
- INCOMPLETE_EVIDENCE for original Phase64 no-entry/listed contract source failure, missing candidate quote rows, altered BID or original availableAt, unmatched catalog/calendar, invalid full OOS denominator or fabricated synthetic/real label.
- DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY for complete source/candidate internal match. A single operator can reproduce the CSV, catalogs, licence paper and all pins, so **this status is NOT vendor authenticity, historical availability, profitable strategy or trade approval**.

All independent issuer/licence, official contract/calendar, original strategy receipt clock, real multi-regime profitability, true IV/theta/spread/slippage, recommended 1W/2W/4W/8W contract, guaranteed broker stop/exit ACK, execution and production-safety claims remain permanently false. Native order instruction is always null.

## Tests

The Phase65 test file contains **19 synthetic/adversarial cases**: same full 2-fold original OOS cohort and 24 arm×horizon attempts, copied fake vendor file and license nontrust, trade-only and bhavcopy rejection, replay and download-time anti-lookahead, fake market versus synthetic relabeling, source row omission, edited option BID or availableAt after re-pinning, altered expiry master/session calendar, re-pinned fake licence bytes with no trust, corrupted licence byte pin, altered OOS source manifest, false row count, early download and observed premium GIVEBACK / adverse overnight GAP behavior. Passing software tests cannot prove profitability.

CI has dedicated TypeScript and Phase65 tests, and must separately pass Phase50–65 focused and full EMA15M targeted safety/production bundle/full regression.

## Operator-private offline CLI

Store source and independent pins as separate owner 0600 JSON files inside owner-only 0700 directories. Enforce OS/container no-network-egress; a Node script alone does not create a network sandbox.

    npx tsx scripts/audit-adaptive-phase65-vendor-delivery.ts \
      --approve-isolated-offline-review \
      --private-phase65-vendor-candidate-package /private/phase65-source.json \
      --independent-phase65-vendor-delivery-pins /private/phase65-pins.json

CLI output reports only aggregate source coverage and hard-false proof flags; it does not print source record IDs, instrument keys, real quotes, licence contents, private paths or accounts. Zero exit means internally descriptive candidate-source integrity, not legal entitlement or live-trading authorization.

## Required real external source and release blockers

Before 1W/2W/4W/8W market regime suitability can be measured, procure a genuinely licensed and independently verified original F&O option top-of-book BID/ASK/depth archive covering **all** OOS dates and listed options; preserve vendor-native bytes and reliable at-time capture logs, vendor product definitions/data dictionary, official point-in-time expiry/lot master and exchange calendar, and untouched chronological multiregime sample paths including no-trades, failed quotes, zero-depth and overnight gaps. Historical downloads alone cannot recreate past client availableAt; classify these limits honestly.

Separately validate actual broker-native NRML GTT/stop ACK, cancel/replace/child/exchange response, market gap nonfill and full paid option debit downside. Issues #17–#22 (especially stop lifecycle #20) remain OPEN; all research PRs DRAFT/unmerged. Existing EMA23/50 **MIS intraday 15:15 auto-squareoff** unchanged; positional NRML 1W–8W gets **no forced 15:15 exit and no live order, GTT or stop writes**.
