# Adaptive Swing v2 Phase37 — cryptographic PDF CMS signer association (offline)

**Draft/unmerged, operator-only, read-only research code. No real Upstox ECN, real Upstox signing certificate/CA, authenticated historical exchange execution, native stop order acknowledgment, or real broker API data was accessed or validated.**

## What was missing through Phase36

Phase35 invoked actual Poppler pdfsig to report local CMS signature validity and NSS trust (with online OCSP disabled), while Phase36 independently validated separate DER signer/issuer certificates. Phase36 could not prove that the separately supplied leaf certificate was **the one embedded in the actual CMS signature of the original PDF**. A fake-but-internally-consistent root/leaf pair was not source authority.

Phase37 implements a strict subset of genuine PDF/CMS cryptography, making the **association of the actual original PDF signed bytes, actual CMS signature, and actual CMS-verified signer DER certificate cryptographically testable**. Unlike the Phase34 externally signed claim, **this actually runs OpenSSL CMS verification locally over the original PDF signed bytes**. It does NOT change the approval/safety flags or verify external trusted issuer identity.

Authoritative documentation:

- PDF ISO 32000-2 errata / signature byte-range semantics: https://pdf-issues.pdfa.org/32000-2-2020/clause12.html — the signature digest covers ByteRange spans of the PDF excluding Contents and otherwise normally the full document.
- ETSI PDF/CMS profile: https://www.etsi.org/deliver/etsi_ts/102700_102799/102778/01.01.01_60/ts_102778v010101p.pdf — CMS/PKCS#7 signature inside PDF Contents.
- OpenSSL CMS verification: https://docs.openssl.org/3.1/man1/openssl-cms/ — use of -verify, -binary, -content, -inform DER, and -signer; **-noverify skips signer certificate chain validation**, not the CMS message integrity.
- Poppler pdfsig: https://manpages.debian.org/testing/poppler-utils/pdfsig.1.en.html — signature and whole-document range checks; signed PDF can be valid while issuer certificate remains untrusted.

## Module: actual OpenSSL PDF signed-byte verification

File: src/server/engine/ema15m/adaptiveUpstoxPhase37OriginalCmsBinding.ts

Manual-only function: auditPhase37OriginalPdfCmsSigner(request, independentlyPinnedSource, phase36DetachedLeafIssuer, phase36IndependentCertificatePins).

1. **Confidential source constraints.** Original <=2MB PDF and fixed /usr/bin/openssl or /usr/local/bin/openssl binary are owner/root controlled, no symlinks, private PDF file 0600 with process-owned 0700 parent. SHA256 of original PDF and executable must match independently pinned values. Inputs have explicit operator action, <=10 second timeout and fail closed before subprocess for missing/changed/unsafe data.
2. **Exact PDF signature byte offsets.** Scans a conservative, narrow **one-signature dictionary / one ByteRange / one hex Contents / one supported SubFilter** subset. Requires ByteRange to begin at byte 0, stop exactly before the Contents hex string opening '<', continue immediately after the closing '>', and cover the exact original file length with no appended unsigned revision. No extra/overlapping ByteRange accepted. This is a deliberately **limited structural scanner, NOT a full PDF parser**: it does not authoritatively resolve PDF xref/object streams, active signature fields or hidden text, and may reject genuine multi-signature/complex ECNs. Independent PDF renderer/CMS validation and human verification are still required.
3. **CMS DER.** Extracts strictly definite-length ASN.1 DER SEQUENCE from Contents, with any remaining PDF hex-reservation bytes all **zero**. Nonzero padding, malformed lengths, oversized CMS, unknown SubFilter, arbitrary unsigned append or ambiguous signatures fail.
4. **True detached signature crypto.** Copies exactly the original signed ByteRange spans (not parsed PDF text or operator transcription) and DER CMS into unique ephemeral process-owned 0700 directory, exclusive private 0600 files. Runs fixed, no-shell OpenSSL arguments: cms -verify -binary -inform DER -in <private-der> -content <private-signed-byte-spans> -noverify -verify_retcode -signer <private-owner-0600-verified-signer.pem> -out /dev/null. No -nosigs, -no_content_verify, -no_attr_verify or network request flags. Bounded output, timeout, source hashes and strict return code; temporary files are removed in finally. The verified signer PEM is written by OpenSSL to a precreated, exclusive owner-0600 file inside the owner-0700 ephemeral directory, re-read with owner/mode/size checks, then deleted. Subprocess stdout/stderr and the private signer PEM are never printed.
5. **Cryptographically linked signer certificate.** OpenSSL returns the verified **actual CMS signer certificate**. Its DER SHA256 must match the separately trusted expected signer fingerprint **and** the exact Phase36 leaf DER input. Phase36's separate pinned leaf/issuer relationship, certificate signatures and review-time validity must independently pass for the same PDF SHA256. A different valid detached signer certificate fails. Mock/injected OpenSSL output is **never** accepted as actual cryptography.
6. **No trust promotion.** Positive status is only ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED. It establishes that a CMS signature was cryptographically verified over the selected original PDF signed bytes and OpenSSL's signer certificate equals the independently supplied pinned DER leaf. **It does NOT establish whether the pinned root/leaf are registered, official, unrevoked, real Upstox signing certificates, certificate-purposes/CA policy, time-stamp attestation, whether this is the active PDF signature field, whether an ECN is complete/visible/valid, or any native NRML order-state evidence**.

**Important:** OpenSSL's -noverify turns OFF CA chain validation intentionally. The Phase36 *detached, operator-provided* one-hop self-signed CA signature check is internal consistency only and can be satisfied by a **synthetic attacker-controlled CA**. Do NOT describe this result as a regulated/duly signed brokerage ECN, independent issuer verification or genuine Upstox source.

## Confidential manual-only CLI

File: scripts/audit-adaptive-upstox-phase37-cms.ts

Four owner-private 0600 JSON files located in owner-controlled 0700 directories:

- private CMS request: fixed PDF absolute path, fixed OpenSSL binary, 500–10000ms timeout and explicit owner approval;
- independent CMS pins: original PDF SHA256, OpenSSL executable SHA256, leaf DER SHA256, issuer DER SHA256, expected supported SubFilter (adbe.pkcs7.detached or ETSI.CAdES.detached);
- Phase36 **separately acquired leaf/issuer DER** (base64; never private keys);
- Phase36 independent DER pin policy and evaluation timestamp.

All independent pins **must come from a separately verified authority**, not copied from untrusted PDF/operator text. A synthetically generated trust root pinned by the operator can still pass.

Command (do not paste real private file paths, keys, UCC, ECNs or trade IDs in chat/source/CI):

    npx tsx scripts/audit-adaptive-upstox-phase37-cms.ts \
      --approve-offline-no-egress-cms \
      --private-cms-request /private/phase37-request-0600.json \
      --independent-cms-pins /private/phase37-pins-0600.json \
      --private-phase36-detached-cert /private/phase36-der-0600.json \
      --independent-phase36-cert-pins /private/phase36-independent-pins-0600.json

**Operate in an OS-enforced no-network-egress, unprivileged sandbox.** The Node subprocess restrictions do not themselves establish network namespaces, filesystem immutability, rollback resistance or an approved trust store. OpenSSL may parse attacker-controlled CMS, and it must never see trading credentials/production mounts.

## CI synthetic evidence

Tests use actual OpenSSL on CI to generate a **fake self-signed root CA and two fake different signer leaf certificates**, build a small genuinely **CMS-signed synthetic PDF** with valid xref and signature ByteRange, and run a **real OpenSSL cms -verify** on original PDF bytes. A real Poppler pdfsig check independently observes "Signature is Valid" while **certificate issuer is NOT trusted**. This is the critical distinction. No supplied synthetic PDF is an Upstox note.

Negative cases: change signed PDF bytes; unsigned document append; nonzero CMS hex padding; duplicate ByteRange; invalid SubFilter/offset; a different leaf cert genuinely signed by the same synthetic CA; mismatched independent PDF/OpenSSL/issuer pins; exposed file permissions/symlinks; unapproved invocation; spoofed but valid-looking OpenSSL signer stdout; nonzero/timeout/multiple signer output. No mock can return an accepted native verifier report.

## Never activate trading from Phase37

Hard-coded:

    executionAuthorized=false
    productionSafe=false
    brokerAuthenticated=false
    brokerStopInstalled=false
    protectedOvernight=false
    nativeOrderInstruction=null
    brokerSignerIdentityVerified=false
    independentlyTrustedIssuerCaVerified=false
    currentRevocationChecked=false
    independentlyTrustedTimestampVerified=false
    originalEcnAnnexureValidated=false
    nativeStopAckOrOvernightContinuityVerified=false

Even a genuine *broker* ECN would prove historic executed trades, **not** native stop placement, exchange ACK/change/cancel/replace lifecycle over 1W/2W/4W/8W NRML positions or gap/slippage protection. Still pending actual account owner authorization, broker-registered issuer and CA certificate provenance, OCSP/CRL/time policy, active PDF field/visual rendered annexure link, verified contract calendar, licensed historical option L1, independent preregistered OOS stress tests, security/operator approval and original protected overnight lifecycle evidence. Release issues #17–#22, including #20, stay OPEN.

This branch is stacked Draft/unmerged on Phase36 Draft PR #41. No code path is imported into server trading/order routes or scheduled jobs. Legacy EMA23/50 MIS intraday automatic 15:15 square-off remains untouched; **NRML positional strategy has no 15:15 automatic exit**.

**Next phase candidate:** independent trusted broker issuer/CA/revocation/timestamp and active field verification, and genuine broker-native historical order ACK, replace/cancel/stop longevity evidence with original signed audit logs — never infer operational protection from historical fills or PDFs.
