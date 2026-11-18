# Adaptive Swing v2 — Phase35 local Poppler pdfsig signature preflight

**Draft/unmerged research only. No genuine Upstox contract note, live account, native stop or historical exchange trade has been provided or verified. No automatic trading.**

## What is genuinely new

Phase34 only verified *external* Ed25519-signed claims about an ECN PDF. Phase35 adds a real, **manually invoked** local Poppler pdfsig executable bridge, alongside an optional re-check of the existing Phase34 external receipt and NFO/BFO WAP evidence. This is code that can call the native PDF signature tool on an approved isolated host; **no real ECN was actually processed in development**.

Poppler official documentation: https://manpages.debian.org/testing/poppler-utils/pdfsig.1.en.html

The pdfsig tool reports PDF CMS signature validity, whole-document signed byte ranges, algorithm and locally configured NSS certificate-chain trust. Its **-no-ocsp** flag suppresses *online* revocation checks. Phase35 deliberately uses **-no-ocsp** because this is an OFFLINE workflow, but does **not** use -nocert (which would skip certificate validation). This means local CRL freshness, current revocation state, certificate path policy, and independent trusted signing time **remain unknown**. Independently authenticating a broker issuer requires additional pinned certificate identities and trusted validation beyond an operator-controlled NSS store.

## Strict security gate

Source: src/server/engine/ema15m/adaptiveUpstoxPhase35LocalPdfsig.ts

- Requires preexisting owner-private 0700 directory, original 0600 PDF no more than 2 MB, separate 0700 NSS sql database and 0600 cert9.db, with externally supplied SHA-256 for original PDF bytes, exact pdfsig executable bytes, and NSS cert9.db bytes.
- Only accepts absolute /usr/bin/pdfsig or /usr/local/bin/pdfsig executable path, owner- or root-controlled non-group-writable binary, and operator approval. Paths, input, hash pins and local file permissions fail closed *before* the subprocess.
- Runs a child process with explicit argument vector: -no-ocsp, -nssdir, sql:<approved private NSS directory>, <approved private PDF>. No shell, redirects, arbitrary commands, dump, signature writes, password arguments, -nocert or -aia. Max 10-second timeout and 100 KB stdout/stderr cap. Output is never logged, because pdfsig prints signer identities and private PDF filenames.
- Strictly recognizes one signature only. Requires SHA-256/384/512, ETSI.CAdES.detached or adbe.pkcs7.detached, explicit two signed ranges starting at zero and ending at the exact original PDF size, Total document signed, Signature is Valid, Certificate is Trusted.
- Ambiguous, multiple, unsigned, weak, malformed, untrusted, timed-out or error results are rejected. Injected/mock pdfsig transcript text is a parser test only, not successful native process evidence.
- Positive local result is **LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED**; this is NOT an authenticated broker-issued ECN or fully verified PAdES legal claim.

Source: src/server/engine/ema15m/adaptiveUpstoxPhase35SignatureEcnDossier.ts

- Reconciles the exact local original PDF SHA256 to the independently pinned PDF hash and original-file claim in Phase34's external Ed25519 receipt.
- Checks local Poppler crypto/coverage/NSS reported statuses and re-runs Phase34 external signed-claim and NFO/BFO trade/WAP audit. The maximum positive result is **LOCAL_SIGNATURE_AND_EXTERNAL_ECN_ASSERTIONS_MATCH_UNVERIFIED**.
- Does NOT parse actual signed ECN rows, verify an Upstox issuer certificate fingerprint, prove time/revocation or confirm actual native stop installation.

## Operator-only isolated private command

Manual CLI: scripts/audit-adaptive-upstox-phase35-pdfsig.ts

Create a private 0600 JSON request within an approved owner 0700 folder with these exact fields:

    schemaVersion: ADAPTIVE_V2_PHASE35_PDFSIG_LOCAL_PRECHECK_V1
    originalPdfPath: /private/original-ecn.pdf
    trustedNssDbDirectory: /private/approved-nss-store
    executablePath: /usr/bin/pdfsig
    expectedOriginalPdfSha256: <64-hex from independent original-file source>
    expectedPdfsigBinarySha256: <64-hex independently reviewed tool executable>
    expectedNssCert9DbSha256: <64-hex independently reviewed local NSS cert store>
    timeoutMs: 5000
    operatorAuthorization: OPERATOR_APPROVED_LOCAL_PDFSIG_NO_ONLINE_OCSP

Execute ONLY on a dedicated unprivileged **OS-sandboxed, no-egress** host. Never paste actual UCC, private keys, certificate paths, PDFs or API credentials in public code, GitHub issues, CI or this chat.

    npx tsx scripts/audit-adaptive-upstox-phase35-pdfsig.ts \
      --approve-local-offline-pdfsig \
      --private-request /private/pinned-pdfsig-request.json

Optional full Phase34 cross-check on the same independently controlled private host:

    npx tsx scripts/audit-adaptive-upstox-phase35-pdfsig.ts \
      --approve-local-offline-pdfsig \
      --private-request /private/pinned-pdfsig-request.json \
      --private-phase34-dossier /private/phase34-input.json \
      --private-phase34-pins /private/phase34-external-pins.json

The CLI reports **sanitized statuses, counts and hashes only**. The original PDF remains private. A shell-free process and the -no-ocsp option are NOT equivalent to OS-level isolation; native PDF parsers can have vulnerabilities, and the operator must provide an independent firewall/network namespace, nonprivileged execution and no host credentials/mounts. The CLI does not independently establish sandbox network restrictions or NSS trust-root integrity. Never blindly import certificate authorities from an ECN attachment.

## Testing and explicit gaps

Tests cover false/truncated signed ranges, unsigned trailing revisions, wrong certificate trust, weak algorithms, multiple signatures, malformed output, timeout/nonzero exit, missing/mismatched PDF/executable/NSS hashes, private filesystem permissions and mock transcript trust non-promotion. An intentionally **unsigned synthetic PDF** is actually passed to the local Poppler binary when that binary exists, and must fail. No actual signed Upstox ECN or issuer CA was supplied; no PAdES-verified real production document claim is made by CI.

Every report continues to set:

- executionAuthorized=false
- productionSafe=false
- brokerAuthenticated=false
- brokerStopInstalled=false
- protectedOvernight=false
- nativeOrderInstruction=null

Additionally onlineOcspChecked=false, crlFreshnessProven=false, independentlyTrustedTimestamp=false, brokerCertificateFingerprintAuthenticated=false, pdfAnnexureRowsExtractedAndCompared=false, issuerAuthenticated=false.

**Real/native overnight stop ACK or 1–8 week stop survival is NOT established by a PDF signature or historical fills.** Pending work includes independently authenticated signer/issuer and revocation/timestamp validation, actual ECN table extraction, exchange-native order change/cancel/replace evidence, original licensed F&O options L1 and out-of-sample tail-risk tests, effective-dated exchange expiry calendar and independent security/operator approvals. Release blockers #17–#22 remain OPEN.

Existing EMA23/50 intraday MIS 15:15 square-off remains unchanged. NRML positional trades never inherit it. No live order placements, scheduled brokerage polling, GTT writes, automatic expiry liquidation or production activation added.

**Phase36 candidate:** independently attested PDF chain/issuer/revocation and actual ECN annexure extraction, plus broker-native historical ACK continuity before any trading release consideration.
