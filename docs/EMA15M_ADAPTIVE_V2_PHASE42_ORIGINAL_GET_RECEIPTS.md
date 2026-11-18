# Adaptive Swing v2 Phase42 — original GET bytes and calendar source receipts

**DRAFT, unmerged, research only. All tests are synthetic. No live Upstox account, real broker API TLS handshake, independently published NSE/BSE circular or native protective-stop ACK was acquired.**

## Reason and scope

Phase41 verified a complete *declared* exchange-session list and two Ed25519 witnesses for each operator-provided GTT boundary pair. It did not retain and compare the exact raw JSON body bytes claimed to be served by Upstox, or the exact bytes of the original exchange calendar notice that were claimed to support the session list. Phase42 adds these *offline, separately pinned byte-integrity links*, **not independent broker-origin authentication**.

Official references:
- https://upstox.com/developer/api-documentation/get-order-history/ — order history is one trading day only
- https://upstox.com/developer/api-documentation/get-gtt-order-details/ — completed GTT orders cannot be retrieved
- https://upstox.com/developer/api-documentation/request-structure/ — Bearer-token protected REST API
- https://www.nseindia.com/resources/exchange-communication-holidays/ — holidays, exceptional and special sessions

## Source module and public API

Source: src/server/engine/ema15m/adaptiveUpstoxPhase42RawGetProvenance.ts

Main pure function: auditPhase42OriginalGetReceipts(bundle, externallyPinnedPolicy).

1. **Re-runs Phase41.** The original full Phase41 dual-Ed25519 witness chain, explicit calendar adjacency, and Phase40 archived GTT STOPLOSS boundary state must be re-audited. A fabricated cached PASS report cannot be supplied instead. Missing/unordered session, wrong instrument/lot/expiry and FAILED/CANCELLED GTT continue to fail closed.
2. **Original exchange-notice byte hash.** Requires an actual original PDF byte buffer in strict base64 (at most 2MB), PDF header and EOF delimiters, exact referenced source URL and original SHA256 equal to Phase41's claimed original source hash and the independent Phase42 pin. It does **not** parse the PDF text or verify its issuer signature, origin URL or effective-dated timetable. A fabricated PDF matching operator-controlled pins can pass; a file hash by itself is not genuine NSE/BSE provenance.
3. **Original Upstox GET body bytes.** Requires exactly two receipts per declared Phase41 overnight pair: before-close then after-open. Each supplies strict original UTF-8 JSON body base64 (max 90KB) that must SHA256-match independently pinned bytes. JSON is parsed with fatal UTF-8 handling, and exact deep structural equality to the corresponding Phase41 GTT response is required. Endpoint, query, GTT ID, GET-only, HTTPS origin, final URL, HTTP 200, JSON content type, no redirect, no stored Authorization header and time matching are required.
4. **Claimed TLS leaf certificate only.** Node X509Certificate parses a privately provided DER leaf and validates claimed capture-time certificate validity, SAN containing DNS:api.upstox.com, and SHA256 of its SPKI against a separate expected pin. **It does NOT verify an actual TLS handshake, CA chain, possession of server private key or that Upstox really issued the captured HTTP body.** A synthetic locally self-signed certificate with DNS:api.upstox.com can pass this local check when attacker-chosen pins match.
5. **Two real Ed25519 witness signatures per original GET body.** Capture operator and independent reviewer use separate Phase41-pinned key fingerprints. Domain-separated messages include original body SHA256, claimed TLS leaf SPKI SHA256, exact phase41 pair SHA256, route, claimed capture/review time, and prior receipt chain digest. Claimed review delay is capped. The last receipt hash is independently pinned. A signature only proves key possession over the *claimed bytes*, not independent human reviewer identity, broker transport provenance, or clock trust.
6. **Only local unverified success.** Maximum status is RAW_GET_BYTES_AND_CALENDAR_PDF_DUAL_WITNESSED_UNVERIFIED. All paths have brokerAuthenticated=false, productionSafe=false, brokerStopInstalled=false, protectedOvernight=false, executionAuthorized=false, nativeOrderInstruction=null, genuineUpstoxTlsHandshakeVerified=false, genuineUpstoxServerResponseAuthenticated=false, exchangeNoticePublisherAuthenticated=false, brokerNativeStopAckVerified=false and continuousOvernightProtectionProven=false.

The existing Phase29 operator-authorized GET-only collector and Phase30 private original-body audit are unchanged. Phase42 neither runs any broker request nor exposes a webhook, order route, scheduler or GTT write.

## Manual owner-private CLI

Source: scripts/audit-adaptive-upstox-phase42-source.ts

Two pre-existing local owner-0600 JSON files under process-owned 0700 directories only. Pass explicit approval, original Phase41 archive + raw response receipts + claimed TLS leaf + original calendar PDF, and separately pinned receipt and original source hashes. Redacted output only.

    npx tsx scripts/audit-adaptive-upstox-phase42-source.ts --approve-offline-readonly-receipt-audit --private-original-get-receipt-bundle /private/source.json --independent-origin-witness-pins /private/pins.json

Do NOT upload private originals, access tokens, live account IDs, exact original order history or signed private keys to repository/CI/chat. The CLI does no network or broker request. Run only with operator-managed isolated no-egress storage and machine policy; Node input checks do not create an OS sandbox.

## CI synthetic evidence

Source: src/quant/tests/ema15m_adaptive_upstox_phase42_raw_get_receipts.test.ts

- Real Node Ed25519 signatures and X509 parse of an **intentionally fake self-signed api.upstox.com certificate**; intentionally fabricated source PDF and Friday→Monday GTT responses
- Accepted local exact response bytes and separately signed Phase41+Phase42 integrity claims, while independent broker/timestamp/native-stop proof flags always false
- Tampered original body or mismatched SHA256, changed raw JSON, wrong-host fake TLS cert, wrong SPKI, missing/corrupted calendar PDF, wrong notice URL or session pin
- Forged/reused/missing witness signatures, dropped/reordered receipts, changed last-chain tip, wrong capture clock/URL/query/status, persisted Authorization claim
- Validly re-signed failed GTT still blocked by Phase41/Phase40.

**A passing signature or local X509 SAN is not a broker-origin proof**. Independent acquisition of genuine broker-source responses and exchange-native order ACK/cancel/replace chronology remain release blockers. Same-day archived order history cannot reconstruct unattended 1–8 week continuity. A GTT is a broker-side condition and cannot guarantee overnight-gap fill price.

Release issues #17–#22 including #20 stay OPEN. All phase PRs stay Draft/unmerged. Existing EMA23/50 MIS 15:15 exit untouched. NRML positional holdings never inherit a forced 15:15 square-off. No live NRML order, stop/GTT write, repair, margin/expiry liquidation or production activation has been enabled.

Next: official source-authenticated effective-dated NSE/BSE calendar text/field verification, truly broker-authenticated acquisition/receipts and independent native exchange ACK evidence, then real licensed option price-path gap/tail testing and external security/risk signoff.
