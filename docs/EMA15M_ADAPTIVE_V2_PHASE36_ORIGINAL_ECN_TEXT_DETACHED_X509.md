# Adaptive Swing v2 Phase36 — original ECN text layer and detached X509 pins

**Draft/unmerged research. No real Upstox-signed ECN, actual broker native order ACK, or licensed historical option market data was provided or verified. No live orders.**

## Scope and trustworthy claims

Phase35 added a real local Poppler PDF CMS signature preflight, but that still does not prove the original PDF text matches manually transcribed contract-note rows. Phase36 adds an independent *actual Poppler pdftotext* text-layer comparison and a *separately supplied X.509 DER signer+issuer* certificate verification stage. These checks do not establish genuine broker identity or exchange protection.

External references:

- Poppler pdftotext manual: https://manpages.debian.org/testing/poppler-utils/pdftotext.1.en.html
- Poppler pdfsig manual: https://manpages.debian.org/testing/poppler-utils/pdfsig.1.en.html
- Node X509Certificate issuer/signature check: https://nodejs.org/api/crypto.html#class-x509certificate
- NSE contract-note FAQ: https://www.nseindia.in/static/trade/contract-note-faqs

## Implementation A — actual private native PDF text extraction

Source file: src/server/engine/ema15m/adaptiveUpstoxPhase36PdfTextAnnexure.ts

- Uses a private absolute-path owner-0600 original PDF inside an owner-0700 directory. Separately pinned PDF SHA256 and exact /usr/bin/pdftotext or /usr/local/bin/pdftotext executable SHA256 must match. No arbitrary URLs/symlinks/paths or world-writable inputs.
- Requires a previously successful Phase35 **native** crypto/NSS preflight for the exact same source PDF SHA256, with execution/production safety flags remaining false. CLI reruns Phase35, not a cached caller-asserted result.
- Runs a fixed no-shell bounded subprocess with arguments: -layout -enc UTF-8 -nopgbrk ORIGINAL_PRIVATE_PDF -. Input is unchanged, output only in memory, no network instructions, output file or broker credentials. Max 10s timeout and max 200KB decoded text; fatal strict UTF8 decoding; stdout/stderr private and never logged.
- Requires exactly one literal ANNEXURE start marker and one end marker, then unique one-physical-line selected-trade rows containing exact ID, order ID, trade date/time, exchange, symbol, CE/PE, strike, expiry, side, quantity and price. All independently expected selected rows must match once; missing, duplicated, wrapped, tampered or ambiguous lines fail closed.
- No OCR for scanned documents; no general ECN layout inference. A row of PDF extracted text is NOT necessarily a visually rendered row, authoritative source proof, original document completeness or trusted ledger. Hidden or manipulated text layer is a risk; independent operator visual review of original rendering, all pages and complete annexure remains mandatory. The separate expected row count is an operator assertion, not proven by this module.
- Only native extraction can return TEXT_LAYER_ROWS_MATCHED_UNVERIFIED. Mock stdout used in tests must never become a trusted source.

## Implementation B — independently pinned *detached* certificate review

Source file: src/server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.ts

- Separately supplied DER X509 leaf/issuer certificates, exact independently pinned SHA256 hashes of both, same original PDF SHA256 and evaluation timestamp.
- Node X509Certificate parses DER, confirms the signer is a leaf and issuer an X509 CA, checks issuer name association, verifies leaf and self-signed pinned issuer signatures, and validates both X509 validity windows at the specified review instant. Only a strict pinned one-issuer / self-signed CA research subset is supported.
- The maximum positive report is DETACHED_SIGNER_ISSUER_CHAIN_CONSISTENT_UNLINKED. These are **separately supplied certificates**: NO cryptographic proof they are the actual original ECN CMS signer certificate. A forged self-signed CA may be pinned by a malicious operator. No government-approved CA, broker signer identity, OCSP/CRL, trusted timestamp or actual PDF CMS signer-binding claim is made.
- Combined report reviewPhase36EcnTextAndDetachedSigner checks that the Phase35 original PDF hash matches the text-layer PDF hash and that all three local evidence outputs are internally consistent. Maximum combined status: TEXT_AND_DETACHED_CERT_PINS_LOCALLY_CONSISTENT_UNVERIFIED. It never authorizes trading or proves the PDF certificate matches original embedded CMS.

## Explicit manual CLI, owner-private files only

Source: scripts/audit-adaptive-upstox-phase36-ecn.ts

Inputs: four existing private owner-0600 JSON files, placed under process-owned owner-0700 directories. Real private sources and keys must never be pasted in GitHub issues or this chat.

- --private-phase35-request: approved original PDF, NSS DB and pinned Poppler pdfsig verification inputs, rerun in this process.
- --private-text-request: approved identical PDF, pinned native pdftotext executable, exact two annexure markers and all manually transcribed selected trade rows.
- --private-detached-certificates: separately obtained X509 leaf and issuer DER base64, same PDF identity and evaluation timestamp.
- --independent-certificate-pins: externally pinned expected leaf/issuer DER SHA256 and original PDF SHA256 and evaluation time.

Run only on a separate **unprivileged OS-sandboxed no-network-egress** host with independently reviewed NSS trust store. Shell-free subprocess timeouts do NOT create a kernel sandbox. Do not automatically import certificate roots or execute scripts embedded in PDFs.

    npx tsx scripts/audit-adaptive-upstox-phase36-ecn.ts \
      --approve-offline-no-egress-review \
      --private-phase35-request /private/phase35-request-0600.json \
      --private-text-request /private/phase36-text-request-0600.json \
      --private-detached-certificates /private/phase36-certificates-0600.json \
      --independent-certificate-pins /private/phase36-trust-0600.json

The CLI prints only report statuses, redacted hashes and reason codes; no text layer, signer DN, full DER, account identifiers, order IDs, original paths or traded instrument strings.

## CI and non-promotable safety flags

Synthetic tests generate a **real unsigned text PDF** with a valid xref table and verify that native pdftotext extracts lines (on CI where Poppler is installed). A synthetic Phase35 positive input is intentionally forged *only for isolated text-extraction testing*, never as proof of actual PDF crypto. Additional test fixtures use OpenSSL to create a **fake** self-signed CA and fake leaf, then check real DER signatures and failure of independent pins, wrong source, altered rows, duplicate IDs, missing markers, public permissions and expired cert dates. None are real brokerage evidence.

All Phase36 reports permanently keep:

    executionAuthorized=false
    productionSafe=false
    brokerAuthenticated=false
    brokerStopInstalled=false
    protectedOvernight=false
    nativeOrderInstruction=null
    pdfCertificateSignerLinkVerified=false
    brokerIssuerIdentityVerified=false
    nativeStopHistoryVerified=false

Still missing: actual original PDF CMS signer DER export and signature association; broker issuer identity, full validated CA/CRL/OCSP/time policy, visual PDF vs hidden text verification, true annexure coverage, licensed original options L1, independent OOS and downside/gap risk, complete native order ACK/amend/cancel chronology for 1–8 week NRML stops and security/operator approval. Release blockers #17–#22 remain OPEN.

Existing EMA23/50 MIS intraday 15:15 square-off unchanged. No positional NRML 15:15 forced liquidation, stop repair, GTT writes, broker calls or production activation. All research PRs remain stacked Draft/unmerged.

**Next phase candidate:** extract signer DER from actual CMS and validate its cryptographic binding to the original PDF signature using an independently reviewed trust path; independently review true broker ECN formatting/annexure and native order lifecycle across overnight/weekend gaps.
