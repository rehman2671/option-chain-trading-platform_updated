# Adaptive Swing v2 — Phase38 independently pinned offline signed CRL / CA-chain review

**DRAFT, unmerged, research-only. No genuine Upstox ECN, approved CA enrollment, broker signer, original exchange order ACK, online OCSP, trusted timestamp, or real account data was provided or verified. No orders are enabled.**

## Goal and precise evidence boundary

Phase37 genuinely verifies the CMS signature on the signed ByteRange of the original operator-private PDF and identifies the actual verified CMS signer DER. Phase37 uses OpenSSL -noverify, so PKI issuer policy, revocation and real-world broker issuer identity are not established.

Phase38 adds a MANUAL local native OpenSSL certificate-chain check under an independently pinned one-hop self-signed CA and **a signed offline certificate revocation list (CRL)** at a separately asserted evaluation instant. This is more evidence than an unsigned/attested revocation claim. It **does NOT mean that the CA is genuinely a permitted Indian issuer, that the signer is registered to Upstox, or that an online revocation status is current**.

Official references:
- OpenSSL verify: https://docs.openssl.org/master/man1/openssl-verify/
- OpenSSL verification options and independent trust anchors: https://docs.openssl.org/master/man1/openssl-verification-options/
- OpenSSL CRL parsing: https://docs.openssl.org/master/man1/openssl-crl/
- RFC 3161 timestamp requirements: https://www.rfc-editor.org/rfc/rfc3161/

## Implemented in the repo

Source: src/server/engine/ema15m/adaptiveUpstoxPhase38SignedCrlTrustGate.ts

The operator must present a native-passed Phase37 CMS signer report and matching Phase36 signer/issuer DER; the official CLI re-runs Phase37 itself rather than trusting a stored report.

- Requires private owner-0600 PDF, one private owner-0600 root CA PEM, one signed CRL PEM under 0700 owner directories; verifies SHA256 pins for the original PDF, actual CMS signer DER, CA DER, CA PEM, CRL PEM, exact OpenSSL executable, and separately pinned assessment time.
- Checks the actual CMS leaf DER against the root public-key signature and self-signed root identity, and enforces leaf vs CA roles. Uses a limited single-root/single-leaf profile intentionally.
- Copies the already pinned data into owner-0700 ephemeral folder with exclusive 0600 temp files, runs bounded no-shell OpenSSL commands with no network/OCSP/AIA download, then cleans up. A separate independent no-network OS sandbox must be enforced by operator. Node timeout alone is NOT a sandbox.
- First runs OpenSSL crl -in [private CRL] -noout -lastupdate -nextupdate. Parses the two dates and checks thisUpdate <= externally asserted assessmentAsOf < nextUpdate plus a maximum operator-set CRL age (1–168 hours). The assessment time is not a trusted timestamp.
- Next executes native OpenSSL verify with: -no-CApath -no-CAstore, -CAfile pinned root, -CRLfile pinned signed CRL, -crl_check_all, -purpose smimesign, -auth_level 2, -verify_depth 1, -check_ss_sig, -x509_strict, and -attime at the asserted evaluation Unix time. Missing/revoked/invalid/expired CRLs or signer chains fail closed; no host ambient system CA trust or CRL download.
- Only real native OpenSSL output is accepted as actual crypto evidence; fake injected runner output is rejected. No stderr/stdout, private signer DN, UCC, original PDF rows or private filesystem path is emitted in reports.

A successful result is only: PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED.

**A fake self-signed root can sign a valid certificate and valid CRL.** CI tests intentionally use a fake issuer. Independently pinned CA hashes have to originate from an actual external trustworthy broker/CA enrollment process; simply copying values from the same private operator source does not confer authentication. No such real independently registered source was used.

## Manual offline-only CLI

Source: scripts/audit-adaptive-upstox-phase38-crl.ts

Owner-private six input JSON files (all 0600 within existing owner-0700 dirs) hold Phase37 request/pins, Phase36 certificate/pins, and Phase38 CRL request/pins. The original PDF/root/CRL are referenced by absolute local private paths, never URLs. The CLI checks all cross-stage hashes/executable/PDF identities, **reruns actual Phase37 OpenSSL CMS verification** in this process, then runs Phase38 real signed CRL/CA chain verification. No token, broker API, live order, scheduler, or private signing key.

Example operator command on separately sandboxed no-egress host:

    npx tsx scripts/audit-adaptive-upstox-phase38-crl.ts \
      --approve-operator-offline-crl-review \
      --private-phase37-cms-request /private/phase37.json \
      --independent-phase37-cms-pins /private/phase37-pins.json \
      --private-phase36-detached-certificate /private/leaf-and-ca.json \
      --independent-phase36-certificate-pins /private/phase36-pins.json \
      --private-phase38-crl-request /private/phase38.json \
      --independent-phase38-crl-pins /private/phase38-pins.json

### Actual synthetic native tests

Tests create an OpenSSL-generated self-signed FAKE CA, an actually CA-signed S/MIME leaf, an actually CA-signed CRL showing it unrevoked, then REVOKE that leaf and generate a new signed CRL. The real native OpenSSL verify must accept the first at a claimed valid time and reject the revoked one. Additional tests cover stale/expired CRL dates, wrong root/CRL/signing hashes, bad private permissions, symlinks, missing operator approval, missing Phase37 CMS prerequisite, nonzero OpenSSL subprocess, malformed date fields and forged subprocess output. To isolate CRL verification, Phase38 unit tests supply a synthetic Phase37 positive report (the synthetic Phase38 PDF is UNSIGNED); the separate Phase37 tests already verify a genuinely synthetically CMS-signed PDF. The real operator CLI always re-runs native Phase37 first.

## Permanent non-trading safety properties

- executionAuthorized=false; productionSafe=false; brokerAuthenticated=false
- brokerStopInstalled=false; protectedOvernight=false; nativeOrderInstruction=null
- currentOnlineOcspRevocationVerified=false
- independentCaEnrollmentAndBrokerIdentityVerified=false
- trustedRfc3161TimestampVerified=false
- originalPdfActiveSignatureFieldVerified=false
- genuineExchangeOrderAcknowledgementVerified=false
- overnightStopContinuityVerified=false

Real registered broker signing authority, official CA provenance, current OCSP/CRL from authenticated source, trusted RFC3161 timestamp, real PDF active signature field and visually complete annexure, broker-native stop order ACK/change/cancel across 1–8W nights/weekends, licensed original option L1, independent OOS/left-tail/regime evaluation, effective-dated expiry calendar and independent security/operator signoff remain blockers.

**Release blockers #17–#22 including #20 remain OPEN.** Phase38 is stacked Draft/unmerged on Phase37 Draft PR #42. No new broker write endpoint, GTT modification, automatic stop repair, production activation or NRML 15:15 square-off. The unrelated existing EMA23/50 MIS intraday 15:15 exit remains untouched.

Next: independently authenticated real broker signer/approved CA/OCSP/RFC3161 provenance and native order state history; green CI is only code-check evidence, never profitability or overnight stop guarantee.
