# Adaptive Swing v2 — Phase55 two-source native CRL + OCSP + RFC3161 offline join

**DRAFT / RESEARCH-ONLY / stacked on Phase54. No live NRML/GTT broker writes. Never interpret internally valid signatures as authentic NSE/BSE market data, licensed exchange data, trusted issuer identity, original strategy clock or a profitable strategy.**

## Why Phase54 was not enough

Phase54 requires two separate original documentary PDFs (option L1/source evidence and declared session/calendar evidence) and uses the existing Phase37 native OpenSSL CMS verifier to cryptographically bind each PDF to an operator-pinned signer DER. Phase37 deliberately uses `cms -verify -noverify` and does **not** establish a trusted CA chain, whether a signer was revoked, an independent timestamp, or real-world issuer identity.

Phase55 adds a narrow, strictly offline **signed CRL, original signer status OCSP and RFC3161 exact original PDF imprint** review, reusing the existing Phase38 and Phase39 native OpenSSL validators. It still does **not** authenticate the real-world issuer or a licensing agreement; operator-pinned synthetic CAs can pass all these cryptographic checks.

## Source and verification

File: `src/server/engine/ema15m/adaptivePhase55NativeRevocationTsa.ts`.

1. Separately lock the complete Phase54 input and independently supplied Phase54 pins by SHA256. Require an independent Phase55 dated `expectedReviewAsOf`, exact OOS test-session count and every `3 arms × 4 horizons × OOS decision` attempt. Require two separate original documentary roles.
2. For each original PDF role, bind exact native Phase38 signed-CRL PDF, signer, issuer DER, CA PEM, OpenSSL binary, review time and independently pinned signed CRL PEM SHA256 to the corresponding Phase54 native CMS evidence.
3. Bind the original native Phase39 OCSP PDF, signer DER, issuer root PEM/DER, signed OCSP response, signed RFC3161 timestamp response, TSA signer certificate and OpenSSL binary, plus independent SHA256 hashes. Original Phase38 and Phase39 must use the **same original PDF path, same root CA PEM, and same predeclared review time** for their respective role.
4. **Actually rerun** Phase54 which itself reruns Phase53/52/51/50 and Phase8. Every originally declared OOS date remains in the denominator. Cached green evidence JSON or a spoofed report cannot replace a real original source or audited signed PDF.
5. After Phase54 succeeds, **rerun native Phase37 on the original PDF for each role**; then pass only the actual verified native Phase37 report to native Phase38 CRL/CA chain checks; pass only its actual native report to Phase39 signed OCSP and RFC3161 exact PDF imprint verification. Any revoked or stale certificate evidence, wrong PDF, spoofed source path, wrong native tool, broken signature, unexpected signer root/clock or unmatched document role fails.
6. Strongest output `TWO_NATIVE_OFFLINE_REVOCATION_AND_TSA_CHECKS_CONSISTENT_UNVERIFIED` means only *local native cryptographic checks under operator-pinned trust anchors at an operator-asserted date*. It is not independently authoritative issuer trust or current online OCSP revocation, nor does a PDF timestamp establish the truth of option quotes or OOS decisions.

All output flags remain hard-false: `independentIssuerIdentityAndEnrollmentVerified`, `genuinelyTrustedIssuerCaVerified`, `actualOnlineRevocationAtCurrentTimeVerified`, `independentlyTrustedTsaIdentityOrClockVerified`, `originalOptionL1SourceAndLicenseIndependentlyVerified`, `actualStrategySourceAvailableAtAuthenticated`, `untouchedOosOptionProfitabilityProven`, `brokerNrmlStopAckOrOvernightProtectionVerified`, `executionAuthorized`, `productionSafe`. `nativeOrderInstruction=null`.

## CI: synthetic-only evidence

New `src/quant/tests/ema15m_adaptive_phase55_two_source_revocation_tsa.test.ts` tests **strict Stage55 scope and failures** with synthetic Phase50-53 data and absent original signed PDFs: missing/duplicated roles, altered original market data, wrong Phase37/38/39 source path, mismatched CA, wrong CRL/OCSP/TSA digests, changed assessment timestamp and reduced OOS attempt count. These cases intentionally cannot reach a successful native Stage55 result. They prove the new preflight denies these adversarial inputs; **they do not demonstrate a complete positive Phase55 source-to-native integration**.

Native positive/negative cryptography of individually forged/untrusted CRL, OCSP and RFC3161 inputs is exercised by the *pre-existing* Phase38/39 tests, and actual two-PDF native CMS is covered by Phase54. End-to-end Phase55 success requires two independently provisioned complete original evidence packages, with valid actual native CRL and OCSP/TSA artifacts for BOTH PDFs; no such real-market package is present here. Green CI still cannot certify genuine market data or real-world issuer trust.

## Private owner-only manual no-egress CLI

File: `scripts/audit-adaptive-phase55-native-revocation-tsa.ts`.

```bash
npx tsx scripts/audit-adaptive-phase55-native-revocation-tsa.ts \
  --approve-isolated-offline-review \
  --private-phase55-source-revocation-package /private/phase55-source-revocation.json \
  --independent-phase55-revocation-pins /private/phase55-pins.json \
  --private-original-l1-pdf /private/source-l1-original.pdf \
  --private-original-calendar-pdf /private/calendar-original.pdf
```

The separate owner private `0600` review package contains `schemaVersion: ADAPTIVE_PHASE55_PRIVATE_ORIGINAL_REVOCATION_DOSSIER_V1`, `phase52`, `phase52Pins`, `phase53Pins`, `phase54Pins`, the Phase54 two native PDF reviewer requests and independently pinned certificate inputs, and the two `Phase55SourceRevocationEvidence` role-specific native CRL/OCSP/TSA requests. Source PDF paths in every native request must match the two command-line original PDF paths. All raw certificate/CRL/OCSP/TSA files are owner-private `0600` with owner-`0700` non-symlink directories; the OS must enforce no network egress. Local Node/OpenSSL subprocess flags alone do not establish an actual network isolation or tamperproof filesystem snapshot. The CLI emits only fixed reason codes, aggregate counts and non-trading flags.

## Release remains blocked

- Independent issuer/CA identity enrollment, official source/certificate signature purpose, current revocation, and genuinely external trusted time remain unverified.
- Licensed original historical F&O native L1 best BID/ASK and depth, source event and actually received-at timestamps, independently verified exchange-session and listed-contract history, unaffected untouched OOS samples, full costs/IV/theta and adverse overnight gap conditions still missing.
- No actual broker-native NRML stop order, modification/cancellation or overnight lifecycle ACK has been verified. A long-option position can lose its whole initial debit despite a displayed stop.

Issues #17–#22, including #20, stay OPEN. All stacked PRs DRAFT/unmerged. Existing EMA23/50 **MIS 15:15 auto-squareoff unchanged**; NRML positional 1W/2W/4W/8W has **no forced 15:15 auto exit and no new live order/GTT/stop write**.
