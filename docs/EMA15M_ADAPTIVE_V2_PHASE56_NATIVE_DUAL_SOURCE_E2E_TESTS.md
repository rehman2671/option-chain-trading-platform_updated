# Adaptive Swing v2 Phase56 — two original PDFs with full native CMS → CRL → OCSP → RFC3161 synthetic regression

**RESEARCH ONLY / DRAFT / stacked on Phase55. No real exchange calendar, no authentic licensed NSE/BSE option L1 source, no broker-native NRML stop order/GTT, and no trading authorization.**

## Missing prior test evidence

Phase55 implements a strict offline native cryptographic source audit but its initial synthetic regression tests only checked *negative input and pin scope*. Existing separate Phase37, 38, 39 tests had respectively tested signed CMS PDFs, fake CA-signed CRLs, fake CA-signed OCSP and RFC3161 tokens. They did not **run the entire Phase55 pipeline over two complete original-PDF evidence dossiers from the same prespecified historical OOS cohort**. A green static check could therefore miss a broken composition.

Phase56 focuses on closing that test-coverage hole, **not adding another operational trading layer**.

## Test fixture and verification

- `src/quant/tests/phase56_synthetic_native_original_fixture.ts` reuses the original Phase54 PDF construction, creating **two fully signed synthetic PDFs** with exact signed ByteRange, embedded DER CMS signatures and distinct untrusted synthetic root/leaf certificates. All artifacts, keys, CA indices and PDFs are locally generated under an ephemeral private 0700 directory. Test artifacts never leave GitHub CI; no genuine broker or exchange certificate is used.
- For **each independently generated synthetic root CA**, the fixture uses native OpenSSL CA database issuance for the CMS signer (including S/MIME key usage), generates a real signed non-revoked CRL, produces an issuer-signed OCSP GOOD response for that exact signer, issues a separate fake TSA signing certificate, and generates a real RFC3161 response over the **exact original signed PDF bytes**. It then creates signed revoked CRL and OCSP variants for negative cases.
- Phase50's fabricated 2-fold historical option source (24 arm-horizon decisions) and Phase51's separately declared session ledger remain in the original evidence chain. Phase52's detached Ed25519 receipts are re-signed with **test-only private keys** to match the two generated PDF hashes, then Phase53 and Phase54 independent source/pin manifests are rebuilt for the same synthetic fixture. This does not authenticate issuer ownership, true source event/available-at clocks, trade fills, market performance or official exchange sessions.
- `src/quant/tests/ema15m_adaptive_phase56_native_crl_ocsp_tsa_e2e.test.ts` reuses the actual Stage55 **production audit** entrypoint. Its positive synthetic test requires real Phase37 native PDF/CMS, native Phase38 signed CRL chain and Phase39 OCSP+RFC3161 to succeed **for both** original evidence roles with exactly two OOS dates and 24 original attempts.
- Negative integration cases verify that independently rehashed **revoked signer CRL**, issuer-signed **revoked OCSP**, a valid timestamp belonging to the *other* PDF, stale signed OCSP at a separately pinned future assessment time, a modified original PDF on disk, a deleted original OOS decision even after both reviewer receipts are re-signed, and an unavailable original signed CRL cannot silently become positive evidence.
- A successful test report is constrained to `TWO_NATIVE_OFFLINE_REVOCATION_AND_TSA_CHECKS_CONSISTENT_UNVERIFIED`; it proves only software composition with cryptographically genuine but **deliberately fake self-signed roots and fake TSA**. Each report must retain `executionAuthorized=false`, `productionSafe=false`, `nativeOrderInstruction=null` and all issuer, licensing, original-source truth, source clock, profitability, broker-order and overnight-stop proof flags false.

## CI checks

Phase56 adds the new native E2E test to the research-focused workflow and the existing full EMA15M suite branch triggers. A separate `adaptive-phase56-native-e2e.yml` workflow runs `npm run lint` and only the new native fixture test so the end-to-end crypto integration can be independently diagnosed, while the full regression still **must** pass before any merge/release decisions. Native OpenSSL is expected at `/usr/bin/openssl` on the GitHub runner, and the tests should remain fully offline.

A passing CI test is **never a profitability proof or permission to connect a live broker**. Green synthetic software invariants cannot substitute for real licensed historical L1 data, issuer-authenticated exchange calendars or independent external evidence.

## Outstanding source and trading gates

1. Obtain original *licensed* historical top-of-book and bid/ask quantities, original vendor delivery/strategy availability timestamps, verified listed contract/expiry master and session calendar. Retain all no-trade/unpriced sessions and independent OOS holdout dates; do not select only winning market examples.
2. Authenticate real-world vendor/exchange issuer certificate ownership, entitlement, CA/OCSP/CRL validity and independent trusted timestamp out of band. A fabricated certificate chain can satisfy all **cryptographic** tests in Phase56; no official issuer identity is claimed.
3. Test 1W/2W/4W/8W expiry selection with premium reversals, IV/theta shocks, slippage/spreads/depth, fees and overnight gaps on untouched genuine option tape, rather than arbitrary 100-point profit targets or assumed liquidity.
4. Demonstrate real broker-native NRML GTT/stop ACK, cancel/replace, non-fill and gap loss lifecycle before production execution authorization. A bought option can lose its **entire premium debit** even when a software stop is configured.

Release blockers #17–#22, especially #20, remain **OPEN**. PRs #55–#60 and Phase56 remain **DRAFT/unmerged**. EMA23/50 **MIS intraday** 15:15 squareoff is untouched; NRML **positional 1W/2W/4W/8W is NOT forced closed at 15:15**. No live NRML order, GTT write, stop repair or deployment is introduced.
