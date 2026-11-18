# Adaptive Swing v2 Phase54 — two original PDFs, real native CMS cryptographic join

**DRAFT, stacked on Phase53, OFFLINE OWNER-PRIVATE RESEARCH ONLY. No exchange issuer or vendor licensing independently authenticated; no live NRML orders/GTT or production trading.**

## Remaining loophole after Phase53

Phase53 requires the actual *bytes* of separate purported original L1/vendor evidence and an exchange-calendar evidence document. It proves the two bytestrings match the prespecified Phase52 detached Ed25519 review receipts, but an operator can still give both reviewers a fabricated PDF with no native PDF/CMS signature or a PDF signed using an unrelated certificate.

Phase54 adds real **native OpenSSL CMS verification of both exact original PDF documents**, relying on the pre-existing Phase37 rigorous, bounded one-PDF-signature subset rather than implementing a new PDF parser. It does not call live trading or market-data APIs.

## Gate

Source: `src/server/engine/ema15m/adaptivePhase54OriginalPdfNativeCms.ts`

`auditPhase54OriginalPdfNativeCms(input,pins)`:
1. Requires independently pinned exact Phase53 dossier and Phase53 independent pins SHA256 and re-runs **Phase53 → Phase52 → Phase51 → Phase50 → original Phase8 OOS entry-first cohort**. No cached PASS status can replace these checks. Every declared OOS session still contributes 3 policy arms × 4 horizons, including no-trade or missing originally chosen option L1.
2. Requires exactly **two original byte-for-byte matching PDF source documents**: original L1/vender-evidence role and original session-calendar role. Both must match prior Phase53 documentary hashes and independent Phase54 SHA256 pins; source document PDFs and PDF file paths must point to the *same* bytes. A different on-disk PDF or original byte substitution cannot pass.
3. Requires two independently pinned original PDF hashes, signer X.509 DER certificate fingerprints, issuer DER fingerprints and exact native OpenSSL binary SHA256. Each Phase37 request, Phase36 independently supplied leaf/issuer DER and Phase36 pins must refer to the same exact original PDF and matching expected signer/issuer hashes. The two original CMS signer certificates must be different.
4. Calls the existing **real native `auditPhase37OriginalPdfCmsSigner`** on both signed PDF files. Phase37 securely reads the owner-private original PDF, checks exact signed ByteRange and embedded CMS DER, runs native `openssl cms -verify -binary ... -noverify` over the exact signed source bytes and matches the *actual verified CMS signer certificate* to its separately pinned DER. A fake JSON `Phase37CmsAuditReport`, injected OpenSSL success runner or PDF printout cannot be supplied as an alternative.
5. Phase37 currently supports a strict one-signature PDF subset (<=2 MB, `adbe.pkcs7.detached` or `ETSI.CAdES.detached`, no unsigned append, no ambiguous PDF ByteRange). Valid complex/multiple-signature PDFs may be conservatively rejected. This is not a comprehensive PDF renderer/parser or PDF/A/PAdES semantic check.
6. Passing both originals returns only `TWO_ORIGINAL_PDF_CMS_CRYPTO_VALID_ISSUERS_UNVERIFIED`. This proves **local cryptographic binding to operator-provisioned pinned signer certificates**, not genuinely trusted NSE/BSE or licensed-vendor issuer identities. Phase37 passes `-noverify` and its Phase36 self-signed CA check is also operator provisioned. A fabricated certificate chain can pass with genuine cryptographic signatures.

**Cannot infer from either passed CMS signature:** genuine NSE/BSE document origin, vendor historical L1 licensing, reader's legal entitlement, genuine strategy received-at timestamps, officially verified exchange calendar, live broker account or exchange ACK, reliable overnight NRML stop placement/repair, filling a long-option premium stop at its trigger, 1W/2W/4W/8W market profitability, or production safety.

Every output hard-codes `executionAuthorized=false`, `productionSafe=false`, `nativeOrderInstruction=null`, `independentRealWorldIssuerIdentityVerified=false`, `independentlyTrustedIssuerCertificateChainVerified=false`, `revocationAndTrustedTimestampVerified=false`, `licensedOriginalOptionL1IndependentlyAuthenticated=false`, `brokerNativeNrmlStopOrGttAckVerified=false` and `overnightRiskProtected=false`.

## Synthetic CI and manual review

`src/quant/tests/ema15m_adaptive_phase54_two_original_pdf_native_cms.test.ts` creates **two genuine CMS-signed test-only PDFs** using local OpenSSL and two separate untrusted synthetic CA/signer chains. Tests require actual native cryptographic verification and exercise missing/swapped original paths, signer SHA mismatch, mutated original doc bytes, signer role swap, missing OOS date even after source rehash and receipt re-sign, and all no-issuer/no-profit/no-broker-stop invariants.

The manual CLI accepts owner-`0600` files in owner-`0700` private directories, separately prespecified Phase54 and Phase53 evidence locks and a review package with both original Phase37/Phase36 configurations. It must run under an **operator-enforced no-egress OS sandbox**; Node's local subprocess environment by itself is not a network sandbox.

```bash
npx tsx scripts/audit-adaptive-phase54-original-pdf-native-cms.ts \
  --approve-isolated-offline-review \
  --private-phase54-signed-source-review /private/phase54-review-package.json \
  --independent-phase54-original-pdf-pins /private/phase54-independent-pins.json \
  --private-original-l1-evidence-pdf /private/original-option-l1-evidence.pdf \
  --private-original-calendar-evidence-pdf /private/original-calendar-evidence.pdf
```

The review package contains `schemaVersion=ADAPTIVE_PHASE54_OWNER_PRIVATE_REVIEW_PACKAGE_V1`, complete `phase52`/ `phase52Pins`, independently pinned `phase53Pins` and **exactly two** `Phase54PdfVerificationRequest` entries. Both `request.originalPdfPath` fields must match the supplied owner-private PDF paths. CLI returns only redacted aggregate counts and immutable proof-false flags; no PDF content, quote ticks, account IDs, signer PEM or document paths. CLI exit 0 indicates only internal document crypto verification, not live trading approval.

## Remaining release blockers

Still need genuine original licensed NSE/BSE option L1 archive, independently authenticated data entitlement and delivery, signed issuer-validated session/expiry/contract master, verifiable real-world CA and official trust roots (including current revocation and trusted external timestamp), independent review of actual document purpose and presented content, large untouched chronological OOS original option premium paths/costs/IV/theta/overnight gap stress, plus **actual native broker NRML stop lifecycle proof** before any broker execution.

Release issues #17–#22 including #20 remain OPEN. Draft stacked PRs unmerged. EMA23/50 **MIS 15:15 intraday squareoff stays unchanged**. NRML positional 1W/2W/4W/8W gets **no forced 15:15 squareoff, live GTT, order placement, stop repair or production activation**.

For native cryptographic verification semantics refer to Phase37 documentation: `docs/EMA15M_ADAPTIVE_V2_PHASE37_REAL_PDF_CMS_SIGNER_BINDING.md`.
