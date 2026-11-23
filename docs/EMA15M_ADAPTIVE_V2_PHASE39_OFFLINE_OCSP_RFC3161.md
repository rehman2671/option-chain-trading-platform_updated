# Adaptive Swing v2 — Phase39 offline OCSP + RFC3161 PDF imprint proof

**Research / Draft / unmerged / no live NRML trading or brokerage access. No real Upstox ECN, broker-issued signing certificate, authorized real CA trust root, production OCSP response, or independently trusted TSA was obtained or authenticated.**

## What this phase actually adds

Earlier Phase37 verifies the **actual original PDF CMS cryptographic signature** and binds the embedded signer DER to a pinned certificate. Phase38 verifies a **locally pinned issuer CA chain and a genuinely issuer-signed CRL** at an operator-supplied evaluation time. Phase39 adds two further **offline original-byte, signed-response** checks using real OpenSSL processes.

**Offline OCSP:** A private operator-supplied DER OCSP response is checked with local OpenSSL OCSP verification against the same exact pinned CA and actual Phase37 CMS signer leaf. The signature, responder authorization/CA chain, leaf identity and **good (not revoked or unknown)** result are verified. The code requires one CertID status only, distinct 'Response verify OK', thisUpdate/nextUpdate window, and maximum response age at an explicitly pinned assessment time. It does NOT query a responder over the network, prove where the response was originally obtained, independently trust the assessment clock, or prove current online OCSP status.

**RFC3161 timestamp response:** A separately supplied signed RFC3161 TimeStampResp (DER) is checked by OpenSSL against the **exact original PDF bytes** (not text/JSON/contract-note transcription) under a separately pinned CA and TSA signer DER. It verifies the time-stamp signed message imprint and chain, then extracts the *actual* CMS signer certificate from the time-stamp token with OpenSSL and checks its DER SHA-256 matches the independently pinned TSA certificate. This is an **auxiliary timestamp of the whole original PDF**, NOT evidence of the timestamp of creation of the PDF's embedded CMS signature. The PDF signature can predate/come after an unrelated external token; Phase39 does not make a PAdES LTV claim or prove the TSA's clock is independent, regulated or accurate.

Official OpenSSL sources:
- https://docs.openssl.org/master/man1/openssl-ocsp/ — response verification, -respin/-issuer/-cert/-CAfile, status age and explicit checks; do not pass -noverify/-no_signature_verify/-no_cert_verify/-no_cert_checks.
- https://docs.openssl.org/master/man1/openssl-ts/ — RFC3161 response verification against original data bytes and TSA trust; the TSA must be independently trusted.
- https://www.rfc-editor.org/rfc/rfc3161 — timestamp protocol.
- https://docs.openssl.org/master/man1/openssl-cms/ — actual time-stamp CMS signer certificate extraction; the separate -noverify operation here is *only* to extract the actual token signer, never to replace the preceding OpenSSL ts PKI verification.

## Code and strict boundaries

Source: src/server/engine/ema15m/adaptiveUpstoxPhase39OfflineOcspTsa.ts

Entry: auditPhase39OfflineOcspAndTsa(request,pins,phase38,detachedSigner)

- Requires a Phase38 **native CRL chain success**, original PDF and signer hash identity, all permanent execution-safety flags false. **The private CLI reruns Phase37 native original PDF CMS and Phase38 native issuer-signed CRL checks**, so no cached operator-authored PASS report is used operationally.
- Requires private owner-0600 input files in owner-0700 directories for original PDF, one issuer CA PEM, signed DER OCSP response, signed RFC3161 TimeStampResp and TSA PEM, plus exact /usr/bin/openssl or /usr/local/bin/openssl binary. No network URLs, shell, log dump, bearer token, HTTP or live orders. Inputs fail on non-owner/public/symlinked paths or size limits.
- Independent SHA256 pins: original PDF bytes, actual CMS signer DER, root CA PEM and DER, complete OCSP DER, complete timestamp response DER, TSA signer DER, exact local OpenSSL executable and external evaluation time. Simply deriving all these pins from the same untrusted input **does not establish independent authenticity**.
- Copies immutable checked inputs into exclusive 0600 files in an ephemeral owner-0700 directory; no private stdout/stderr, certificate names, trade rows, private paths or actual PDF data returned.
- Fixed bounded no-shell OpenSSL OCSP: -respin [response.der] -issuer [CA] -cert [actual CMS leaf] -CAfile [CA] -no-CApath -no-CAstore -no_nonce -validity_period 0 -status_age [max age]. Requires native verification success and signed response to show that signer is good. With no online request, freshness is **only relative to a claimed clock time**.
- Fixed OpenSSL TS: -verify -data [original PDF] -in [signed response] -CAfile [pinned CA] -CApath [empty temp trust dir] -untrusted [pinned TSA cert]; requires exact Verification: OK and then separately extracts timestamp token with OpenSSL ts -reply -token_out. A separate OpenSSL cms -verify extracts the token's actual embedded signer DER to an owner-0600 file. That secondary cms operation intentionally uses -noverify because the PRIMARY ts -verify has already checked the chain and data imprint. The extracted DER must equal the externally pinned TSA DER.
- No live requests, login, GTT order modification, stop repair, current order polling, or background tasks. Native parsers must be run in a separately enforced unprivileged **OS sandbox with no network egress**; Node flags/timeouts are not a kernel sandbox.

Maximum status is **OFFLINE_OCSP_AND_PDF_TIMESTAMP_CONSISTENT_UNVERIFIED**, not real broker or TSA authentication. In every path:
- executionAuthorized=false
- productionSafe=false
- brokerAuthenticated=false
- brokerStopInstalled=false
- protectedOvernight=false
- nativeOrderInstruction=null
- onlineOcspActuallyFetched=false
- verifiedRealWorldOcspResponderOrigin=false
- realWorldBrokerIssuerEnrollmentVerified=false
- independentTrustedTimeSourceVerified=false
- originalCmsSignatureSigningTimeVerified=false
- guaranteedNativeStopSurvival=false

### Manual private CLI

Source: scripts/audit-adaptive-upstox-phase39-ocsp-tsa.ts

Eight existing owner-0600 private JSON inputs, outside any repository/CI/chat, with matching independently pinned SHA256 source identities:
- Phase37 CMS request and independent original PDF/OpenSSL/CMS signer/CA pins;
- Phase36 separately provided signer/CA DER and independent X509 pin policy;
- Phase38 private signed CRL request and independent CRL pins;
- Phase39 OCSP/TSA private response request and independent response/source pins.

The CLI compares original PDF, OpenSSL binary, root CA and signer hashes across phases, **reruns native Phase37 and Phase38** and then runs native Phase39. Redacted status, reason codes and hashes only.

Example:

    npx tsx scripts/audit-adaptive-upstox-phase39-ocsp-tsa.ts \
      --approve-private-offline-ocsp-tsa \
      --private-phase37-cms-request /private/p37-cms-request-0600.json \
      --independent-phase37-cms-pins /private/p37-cms-pins-0600.json \
      --private-phase36-detached-certificates /private/p36-certificates-0600.json \
      --independent-phase36-x509-pins /private/p36-pins-0600.json \
      --private-phase38-crl-request /private/p38-request-0600.json \
      --independent-phase38-crl-pins /private/p38-pins-0600.json \
      --private-phase39-ocsp-tsa-request /private/p39-request-0600.json \
      --independent-phase39-ocsp-tsa-pins /private/p39-pins-0600.json

All original cert response bytes, authorized accounts and secret keys must be provisioned outside the repo. The audit does NOT create a source-of-truth broker identity registry.

## Synthetic CI and remaining release blockers

Tests use a **fake self-signed CA**, fake but actually CA-signed signer certificate, **real issued good OCSP response**, a **real revoked OCSP response**, and a separately created fake TSA with real RFC3161 token over a synthetic *UNSIGNED* PDF. Native verification succeeds for the synthetic good OCSP and token, rejects revoked signer, changed source bytes and corrupt token. The Phase38 predecessor in isolated test is intentionally a fabricated positive *fixture*; the actual standalone Phase38 tests independently verify real CRL crypto. The manual Phase39 CLI reruns native Phase37/38 and does not trust these fixture assertions.

Tests also cover wrong hashes for PDF/CA/OCSP/TSA/OpenSSL, wrong time/freshness, public file paths, symlinks, malformed/duplicate statuses and mock runner non-promotion. **No real Upstox account or actual original signed broker ECN was read.**

This is not evidence for production 1W/2W/4W/8W NRML execution. Still missing actual authorized broker issuer and CA enrollment, authenticated response origin, fresh independently timed OCSP and document-embedded PAdES LTV relationship, full signed ECN rendering and contract-note trade completeness, broker-native stop ACK/amend/cancel history across nights/weekends, licensed historical option L1/OOS regime ranking/stress testing, effective-dated expiry calendar, security and operator signoffs.

Release blockers **#17–#22 including #20 remain OPEN**. This research PR remains Draft/unmerged, stacked on Phase38 Draft PR #43. Original EMA23/50 MIS intraday 15:15 automatic square-off is untouched; **NO NRML positional 15:15 square-off**, order writes, GTT operations or live positional execution have been enabled.

**Next priority:** independently sourced issuer/CA and real responder/TSA identity provenance, actual signed broker-native order ACK/cancel/replace and overnight stop continuity, original historical options market data and controlled out-of-sample stress tests. Never equate a green CI run with profitability, native protection, or production approval.
