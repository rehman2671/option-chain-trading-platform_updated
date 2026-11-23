# Adaptive Swing v2 — Phase 33 offline contract-note annexure, exact PDF-byte witness and weighted-average-price audit

**DRAFT / unmerged / research-only. No real contract note, account, Upstox token, source API or live NRML order was accessed.** All tests are synthetic. This is not a broker-native-stop certification, PDF signature validation, legal compliance approval or production release.

## Why this matters

The existing Phase31/32 `GET /v2/charges/historical-trades` provides historical **executed F&O fills**, often without an instrument token or a native order ID. It can reconcile quantities but not the broker's stop-order placement, amendments, cancellations or overnight survival.

Official Indian market sources establish that electronic contract notes (ECNs) and their trade details are a useful **separately obtained document source**, but the note itself must be genuine and inspected. The NSE's updated contract-note FAQ specifically says:

- [NSE FAQ on revised contract-note format](https://www.nseindia.in/static/trade/contract-note-faqs): the revised format is mandatory for equity/derivatives and trade-level details (contract, exchange, order number/time, trade number/time, quantity and price) belong in the **annexure**.
- The same FAQ says the headline note's **WAP/VWAP can be aggregated across exchanges for the same contract**, and 2 or 4 decimal places can be used. Therefore **individual fills must be matched to annexure rows, while displayed WAP is checked separately** with appropriate precision. An exact one-note-summary-row = one Upstox-fill-row assumption is unsafe.
- [SEBI master circular, stock brokers, 2025](https://www.sebi.gov.in/sebi_data/attachdocs/jun-2025/1750158789381.pdf) provides contract-note and ECN requirements, including digital signatures. **An original PDF having an ECN title/header is not proof that its digital certificate is genuine.**
- [Upstox portfolio and contract-note help](https://upstox.com/help-center/my-account/portfolio-reports/) lists ways to access/download contract notes. **This PR does not claim a standardized Upstox contract-note API or automatically fetch PDFs.**

## Scope of this implementation

`src/server/engine/ema15m/adaptiveUpstoxPhase33ContractNoteReview.ts` is a **pure offline** module that accepts separately provided original PDF bytes, a manually transcribed selected-contract trade annexure, separately transcribed WAP summary rows, one Phase31 complete FO historical cohort, and a **separately provisioned trust policy** with an independent reviewer Ed25519 public key, expected account/UCC, original PDF SHA256, challenge and review timestamp.

**Important separation of claims**:

1. **Original PDF bytes**: strict base64 and coarse %PDF/%%EOF envelope checks, bounded to 2MB, hashed SHA256 and compared to **independently pinned** expected byte hash. This **does not parse PDF**, verify visible rows, certify issuer, detect malicious embedded content, or check PDF/PKCS#7/PAdES digital signatures.
2. **Manual transcript**: a human reviewer must independently transcribe selected-contract trade details from the actual note annexure; these rows are input **claims** and the code does not prove they are present in the PDF. Do not assume the synthetic test PDF contains the rows.
3. **Externally pinned reviewer**: verifies Ed25519 detached signature over a domain-separated message binding the PDF byte hash, **full historical FO JSON**, transcript digest, externally issued 256-bit challenge and signoff time. The application itself does not generate or store reviewer keys. This proves only possession of the pinned *reviewer* key, **not a broker ECN signer or SEBI-trusted certificate**, and not the origin of the PDF.
4. **Detailed annexure trade matching**: requires a 1:1 same-date selected FO historical trade ID, matching independently pinned exchange, underlying symbol, CE/PE, strike, expiry, BUY/SELL, lot-sized quantity and individual fill price (decimal up to four places). Duplicated, missing and extra trade IDs fail. Order ID and trade time must be present in the transcribed note but **cannot be verified independently against the historical FO API** (which does not expose these fields in the referenced sample). Other instruments remain in the full FO historical response but are not part of this selected-contract annexure comparison.
5. **Summary WAP**: aggregates selected F&O execution rows into same-date BUY vs SELL groups, calculates exact BigInt quantity-weighted price at 1/10,000 INR, and verifies summary quantity and rounded WAP using NSE's allowed 2- or 4-decimal display precision. Summary groups cannot be duplicated or omitted. The implementation is deliberately **single pinned exchange and selected-contract scope only**: if the actual ECN contains a WAP consolidated across multiple exchanges, the operator must not truncate/crop the summary and pass it off as exchange-specific. Obtain the complete ECN/exchange-wise annexure and add reviewed multi-exchange matching before claiming reconciliation for such notes. A successful single-exchange synthetic result is therefore **only locally consistent**.
6. **Phase31 prerequisite**: before reviewing note rows, the *full* supplied historical FO pages must pass Phase31's strict complete, same-date, quantity/expiry validation; multi-date rollover is blocked regardless of signature correctness.

### Fail-closed statuses

`INVALID_EVIDENCE` — bad note format/PDF bytes, incomplete input or trust policy.

`REVIEW_SIGNATURE_OR_TRUST_REJECTED` — external hash/UCC/nonce/key/signature mismatch, stale signoff or clock conflict.

`BLOCKED_OR_UNKNOWN` — signatures valid but Phase31 history invalid, missing/extra/duplicated annexure fills, mismatched contract, quantity, price, WAP, side or expiry.

`NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED` — **only** the operator transcript, supplied original PDF *hash*, reviewer signature and same-day FO historical rows reconcile. Broker-issued PDF identity, PDF contents/signature, native stop, overnight order history and independently authenticated exchange fills are **still not verified**.

All reports always have `executionAuthorized=false`, `productionSafe=false`, `brokerAuthenticated=false`, `brokerStopInstalled=false`, `protectedOvernight=false`, `pdfDigitalSignatureVerified=false`, `brokerNoteIssuerAuthenticated=false`, `noteContentExtractedFromPdfByCode=false`, `exchangeOrderAcknowledgementVerified=false` and `nativeOrderInstruction=null`.

## Confidential manual-only CLI

`scripts/audit-adaptive-upstox-phase33-contract-note.ts` accepts separately stored owner-private 0600 files under process-owned 0700 directories, never any remote URL, API token, broker web login, public path or order intent. A private JSON file contains the Phase31 history input, note's manually extracted `selectedAnnexureRows` and `selectedWapSummaryRows`, a reviewer `signedAt` and `signatureBase64`. Its note `originalPdfBase64` is injected **in memory only** from a separately supplied original PDF file; **no PDF content is emitted in logs**.

```bash
# Prepare exact hash-only message for externally managed reviewer key.
npx tsx scripts/audit-adaptive-upstox-phase33-contract-note.ts \
  --mode prepare \
  --note-record /private/contract-note-transcript-0600.json \
  --original-pdf /private/original-ecn-0600.pdf

# Reviewer signs the exact prepared domain-separated message OUTSIDE
# this repository and returns signature and independently pinned trust.
npx tsx scripts/audit-adaptive-upstox-phase33-contract-note.ts \
  --mode verify \
  --note-record /private/signed-contract-note-transcript-0600.json \
  --original-pdf /private/original-ecn-0600.pdf \
  --external-trust /private/independent-reviewer-pins-0600.json
```

The trust JSON has schema `EXTERNALLY_PINNED_PHASE33_NOTE_REVIEW_V1`, `expectedUcc`, `expectedOriginalPdfSha256`, `expectedChallengeHex` (64 lowercase hex), `reviewerPublicKeySpkiDerBase64`, `maximumReviewAgeMinutes`, `verificationAsOf`. **Independent provenance of all these is essential**: simply copying values from the note JSON into a trust file is **not** independent source authentication.

No actual broker PDF or account data was obtained, decoded, parsed or reviewed during Phase33 development. Synthetic PDF test bytes are intentionally **not signed ECNs**, yet the note comparator returns an explicit unverified status when local synthetic rows match. This is a regression invariant, not a gap silently ignored.

## Research and security gaps that remain

- Actual ECN PDF digital signature, signer certificate chain/revocation and issuer identity (e.g. via independently reviewed PAdES/PKCS#7 tooling), genuine broker-registered account UCC, delivery source and immutable original bytes **must be validated independently**. PDF header/EOF heuristics do **not** establish that a document is safe or authentic.
- The PDF trade-table rows are not parsed, visually OCR-reviewed or cryptographically linked to the provided manually transcribed annexure rows by this code. There is no claim that the transcript is *in* the original PDF. External review must explicitly inspect the original, including the complete annexure.
- NSE contract note WAP can be cross-exchange. This selected exchange-only implementation is **not** a general cross-exchange ECN reconciliation engine. Missing other-exchange trades can produce false matches if a note is improperly scoped by an operator; do not treat a passing report as verified note coverage.
- Need independent exchange/broker order ID and amendment/cancellation history spanning 1W/2W/4W/8W, and actual stop ACK/trigger/fill evidence to assess overnight NRML protection. Historical FO fill and contract-note execution totals cannot replace order-state chronology or prevent bad fills during gaps.
- Need licensed original historical options L1 data and preregistered out-of-sample comparison for regime/contract selection and tail-risk/retracement evaluation, effective-dated exchange expiries, security/legal/operator signoff and staged shadow operation.

**No actual order creation, modification, cancellation, repair, exit, 15:15 NRML auto-square-off or production activation is included.** Legacy EMA23/50 intraday MIS 15:15 exit is untouched. PR is stacked as a DRAFT on Phase32 Draft PR #37. Release blockers #17–#22 remain OPEN.

**Phase34 candidate:** independently verified signed-ECN/PDF signature and contract note-to-exchange-annexure extraction outside the bot, support for genuine NSE cross-exchange WAP presentation, and source-provenance witness controls. No live NRML order path until these and all other independent controls are externally approved.
