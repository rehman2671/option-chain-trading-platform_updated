# Adaptive Swing v2 Phase 30 — Shadow-only broker evidence reconciliation & encrypted archives

**Research/Draft branch only. No live brokerage execution, no real broker API call performed in this PR.**

Phase 29 introduced an explicit, operator-approved Upstox Analytics Token **GET-only** collector for profile, positions, order book, GTT rules and day trades, with private on-disk JSON archives. Phase 30 closes two important *engineering* gaps: a default encrypted-at-rest archive and a standalone offline cross-capture dossier that compares each archived response with Phase 28's externally pinned two-witness signed lifecycle. **Neither feature is a claim that historical data or real Upstox account state has been independently verified.**

## Design / strict separation

- `adaptiveUpstoxPhase30EncryptedArchive.ts` writes the private Phase29 capture as AES-256-GCM authenticated ciphertext with a random 96-bit nonce and a versioned domain-separated AAD. The 256-bit key is provided outside the app (environment variable in manual CLI); never copy it into PRs, scripts, source, CI, JSON archives or ChatGPT. The existing account/position/trade UCC never appears in the new encrypted file bytes. Existing 0700 parent, random 0700 child, 0600 exclusive file, fsync restrictions apply; no overwrite, no plaintext fallback. This is NOT a KMS/HSM, WORM vault, independent notarization or recovery procedure. If the key is lost, the private archive cannot be recovered.
- **Manual collector CLI upgraded**: `capture-adaptive-upstox-authorized-get.ts` now refuses to make a GET unless **both** `UPSTOX_ANALYTICS_READONLY_TOKEN` and `ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX` are provided out of band, the account-owner GET and static-IP operator assertions are explicit, and an owner-private 0700 output directory is already present. On GET success, it writes `evidence.private.aead.json` (encrypted) only. This is **not an automatic background job** and there is still no account access in the developer/CI environment.
- `adaptiveUpstoxPhase30ShadowDossier.ts` is a *pure, side-effect-free* offline reviewer. It accepts 2–64 ordered Phase29 private capture records **after decryption** plus a detached Phase28 witness package, separately pinned signer keys, nonce and locked Phase25 audit policy. It independently checks: five expected raw response SHA-256 digests per capture, exact decoded profile body, account UCC and NRML option entitlements, four original-byte books, missing/duplicate rows, strict per-frame sequence and account scope, and byte-for-byte match between each private archive and the signed Phase28 payload. Then it re-runs Phase28 Ed25519 signature verification and Phase27 chronological trade/position/order/overnight blockers. A profile UCC match still proves only what the operator-provided profile JSON claims: **profile bytes are NOT directly Upstox-signed, and Phase28 signs only the four trading books, not the profile**.
- A positive result is always `SHADOW_REVIEW_ONLY_UNVERIFIED`: an offline data consistency milestone, **never** broker authentication, independent static-IP attestation, recognized actual native stop installation, exchange trades or overnight safety. All report safety flags remain false: `executionAuthorized`, `productionSafe`, `brokerAuthenticated`, `brokerStopInstalled`, `actualBrokerStopVerified`, `independentExchangeFillVerified`, `independentSourceIpAttested`, `protectedOvernight`, `nativeOrderInstruction` is null.
- The new **manual local shadow CLI** reads only 0600 files whose parent is a process-owned 0700 directory, decrypts the AES-GCM records, runs the pure dossier, then **only on positive review** re-verifies Phase28 + Phase27 and atomically consumes the externally supplied challenge in the owner-private Phase29 one-use nonce registry. One challenge is accepted at most once within the retained registry. Repeated use fails. It never sends broker GETs itself and never prints sensitive IDs/keys/raw bodies or private filenames.
- Adversarial synthetic tests cover tampered profile/position/order/trade bytes, changed report hashes, rogue signer key and challenge, incomplete capture, duplicate book, valid signatures with missing native protection, cross-IST-day overnight attempts, encrypted body integrity, 0700/0600 permissions, wrong key, random nonce uniqueness and plaintext rejection. All GET data in CI tests is mocked.

## Explicit operator-only commands

The following is **an interface for a separately approved, credentialed operator**, not a request for the user to share a real token here. A static-IP whitelisted account with the correct token/account entitlements must be independently reviewed before any real manual capture is even considered.

Run the Phase29 collector **only on an approved host** with a key provisioned independently and a pre-existing process-owned 0700 directory. The token and key must not be included literally in shell command history, GitHub Actions secrets, chat, or checked-in files:

```bash
# Environment variables are provisioned privately by the approved operator:
#   UPSTOX_ANALYTICS_READONLY_TOKEN
#   ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX  (64 hex characters; 32 random bytes)

npx tsx scripts/capture-adaptive-upstox-authorized-get.ts \
  --approve-get-only \
  --confirm-whitelisted-static-ip \
  --expected /private/expected-nrml-position.json \
  --policy /private/locked-phase25-policy.json \
  --private-parent /private/upstox-captures-0700 \
  --sequence 1
```

Each archived capture is in its own random private subfolder as `evidence.private.aead.json`; it cannot be read without the independent AES key. The Phase29 experimental *plaintext helper* remains in earlier research code but is **not used by the upgraded manual collector**. Do not use that experimental plaintext function for real account data.

For shadow evaluation, the authorized reviewer assembles a **private, 0600 JSON manifest** with the exact encrypted archive paths and separately vetted witness/policy/trust file paths (not actual JSON or tokens). Example schema:

```json
{
  "schemaVersion": "ADAPTIVE_V2_PHASE30_SHADOW_INPUT_V1",
  "captureArchivePaths": [
    "/private/upstox-captures-0700/capture-<random>/evidence.private.aead.json",
    "/private/upstox-captures-0700/capture-<another>/evidence.private.aead.json"
  ],
  "signedWitnessPath": "/private/signed-phase28-witness.json",
  "lockedPhase25PolicyPath": "/private/locked-phase25-policy.json",
  "separatelyPinnedTrustPath": "/private/out-of-band-pinned-reviewer-policy.json"
}
```

The Phase28 signing and independent reviewer key ceremony remain **external** to this project; no private signing key exists in the trading service. A durable nonce directory must already exist, must remain access-controlled, and **must not be reset** between reviews.

```bash
# ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX is already provisioned privately.
npx tsx scripts/audit-adaptive-upstox-phase30-shadow.ts \
  /private/shadow-input-manifest-0600.json \
  --nonce-registry-dir /private/nonce-registry-0700
```

The shadow-only CLI returns only sanitized reason codes, counts, hashes, and nonce claim result. Zero exit means the **offline chain was internally consistent and one local challenge was consumed**, not that a stop order exists or the trading bot may buy/sell.

## Overnight/GTT facts remain blockers

Official Upstox documentation:
- Analytics Token read-only and whitelisted static IP: https://upstox.com/developer/api-documentation/analytics-token/
- Get Order History, ordinary orders retained one trading day: https://upstox.com/developer/api-documentation/get-order-history/
- Get GTT Order Details does not return completed GTT orders: https://upstox.com/developer/api-documentation/get-gtt-order-details/
- Get Order Book: https://upstox.com/developer/api-documentation/get-order-book/

No number of signed copies of a **day-scoped** order book proves that a broker-native stop persisted or filled through overnight gaps in a 1W, 2W, 4W, 8W option holding. Any IST day rollover in Phase27 remains fail-closed, including when two independent Ed25519 signatures validate. GTT `SCHEDULED` is not equivalent to exchange `trigger pending`, and a stop trigger is not a guaranteed execution price/fill.

## Operational and regulatory prerequisites not solved

There has been **no actual Upstox read-only capture in developer/CI**, no separately authenticated public egress/static-IP evidence, no broker-signed request or exchange ACK, no external UCC ownership proof, no signed timestamping notary or durable distributed key/nonce registry, no native broker stop created, no independently collected order history across sessions, and no real 1–8W overnight operational rehearsal. Phase29 capture record hashes and Phase28 signatures are still **operator/local witness data**, not upstream broker attestations.

Also still outstanding: genuinely licensed historical option L1 source, market-regime/contract ranking independent out-of-sample comparison, transaction costs and tail-risk review, signed exchange expiration/calendar provenance, external security and operator approval, and a formal staged deployment review. Issues #17–#22 **remain open**.

No change is made to the existing **EMA23/50 intraday MIS** engine or its intraday 15:15 square-off. Positional **NRML MUST NOT inherit MIS 15:15 exit**. There is no live NRML order routing, automated order placement/modification/cancellation, no GTT edits, no expiry liquidation, and no production activation.

**Phase31 candidate:** independent broker-day/settlement record provenance, externally timestamped capture archive/signers and controlled shadow-run coverage; code review and expiry/overnight operational playbooks. No live order path should be proposed before independent, documented signoff.

## Release contract

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
actualBrokerStopVerified=false
protectedOvernight=false
nativeOrderInstruction=null
```
