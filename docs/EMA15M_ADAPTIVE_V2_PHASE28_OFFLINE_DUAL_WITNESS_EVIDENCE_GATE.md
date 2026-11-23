# Adaptive Swing v2 — Phase28 OFFLINE two-witness integrity and reviewer gate

**DRAFT / NOT MERGED / NOT LIVE BROKER CONNECTED.** This phase does **not** implement the live authenticated API intake itself. It implements a safer **prerequisite boundary**: deterministic byte-level integrity verification and two separately pinned Ed25519 signer endorsements over private, operator-provided GET captures.

## Why it matters

Phase27 can reconcile operator-submitted Upstox GET position/order/GTT/trade snapshots for one trading day but cannot establish that its JSON was actually returned by the broker or remained unchanged after local collection.

In current Upstox documentation, an **Analytics Token** is read-only, cannot place or modify orders, and account-specific Orders, GTT, Portfolio APIs require a **whitelisted static IP**. This could support a future separately authorized broker collector, but **Phase28 makes no GET call and never handles any token**, public or private. The Upstox v2 Order Book and day trade feed are day-scoped; neither proves native stop survival overnight.

Official sources:
- https://upstox.com/developer/api-documentation/analytics-token/
- https://upstox.com/developer/api-documentation/announcements/analytics-token-static-ip/
- https://upstox.com/developer/api-documentation/get-order-book/
- https://upstox.com/developer/api-documentation/get-trade-history/
- https://upstox.com/developer/api-documentation/get-gtt-order-details/

## Offline verifier implemented

`adaptiveUpstoxOfflineDualWitnessGate.ts` defines a strict manifest, supplies the exact deterministic **hash-only** signed-message strings, and verifies signatures with Node.js `crypto.verify`. It has no HTTP, transport, JWT, OAuth, storage, signing/private-key integration, SDK or order operations.

1. Input contains a Phase27 operator-supplied lifecycle (`frames`, phase25 locked policy and existing complete book evidence), plus an **exact raw UTF-8 response body** for each of the four GET books in **every frame**. Input responses are base64 encoded bytes and must match parsed JSON exactly by semantic value. There are 4 × frameCount required blobs; duplicate/missing, out-of-sequence, malformed UTF-8, oversized, malformed JSON or contents that disagree fail.
2. A manifest is constructed deterministically from SHA-256 of the complete lifecycle JSON, independently supplied policy JSON, hashed account scope, every **original response body byte digest**, pinned origin string, and **a unique 256-bit challenge** supplied from the verifier's separate trust policy. The signatures thus cover the exact bytes, even if someone reformats JSON without changing semantic values. Private IDs are **never emitted** in the result or signed-message payload; only hashes.
3. The first external **capturer** key signs the exact domain-separated `phase28CapturerMessage(payload,signedAt)`. A **different, independently pinned reviewer key** signs `phase28ReviewerMessage(payload,capturer,reviewerSignedAt)` which includes the capturer timestamp and detached signature. A reviewer can't silently replace an earlier capturer signature.
4. The verifier expects externally pinned Ed25519 SPKI public key DER bytes (base64), **distinct keys**, an externally generated unpredictable challenge, independently expected account scope, maximum review age, and verification time. These must come from a **separate, authenticated trust channel**, not copied from the witness file.
5. Time claims must be ordered: last audit time ≤ capturer signoff ≤ reviewer signoff ≤ verifier timestamp, with bounded reviewer freshness. Timestamps are *operator/reviewer claims*, not independent trusted time.
6. Even when **both cryptographic signatures are valid**, Phase27 may reject the broker order/trade lifecycle. Phase27 overnight boundary, fill inconsistency, restart replay, duplicate protection and cross-order rotation blockers remain effective. The dual signature can **never** override them.

The verifier does **not** create or store private keys, generate signatures, send data to a broker or authorize an order.

## Private-only usage

Generate test-only keys in memory in local synthetic unit tests. Production-ish review requires a real independent key-ownership registry and offline key ceremony **outside this repository**; never paste private keys or broker tokens into source control, ChatGPT, issues, PR descriptions, or logs.

```bash
npx tsx scripts/audit-adaptive-upstox-dual-witness.ts \
  /private/phase28-witness-package.json \
  --policy /private/phase25-locked-policy.json \
  --external-trust /private/pinned-independent-reviewers.json
```

The `--external-trust` file contains **public** SPKI DER keys only and an externally supplied fresh challenge (no private keys). It must be provisioned by a reviewed, authenticated channel separate from the input capture. CLI output reports sanitized status/counters/reasons/hashes only; raw account identifiers, response content, trade/order IDs and full signatures are not printed. Successful exit 0 means ONLY `SIGNATURES_VALID_OFFLINE_UNVERIFIED`, **not broker-authenticated**.

Minimal trust policy shape:

```json
{
  "schemaVersion": "EXTERNALLY_PINNED_ED25519_REVIEW_KEYS_V1",
  "expectedChallengeHex": "<64 lowercase hex chars from independent verifier>",
  "expectedAccountScopeId": "<private independently verified scope>",
  "capturerPublicKeySpkiDerBase64": "<Ed25519 SPKI DER base64>",
  "reviewerPublicKeySpkiDerBase64": "<different Ed25519 SPKI DER base64>",
  "maximumReviewAgeMinutes": 5,
  "verificationAsOf": "2026-11-17T10:02:00Z"
}
```

The capture package includes `schemaVersion: ADAPTIVE_UPSTOX_OFFLINE_DUAL_WITNESS_V1`, `source: OPERATOR_SUPPLIED_UNVERIFIED`, `claimedOrigin: https://api.upstox.com`, `challengeHex`, a complete Phase27 `lifecycle`, `byteWitnesses` (sequence, book, responseUtf8Base64) and two detached signatures (signedAt, signatureBase64). The source origin is *self-asserted metadata*, not a TLS/protocol proof. Use exported `preparePhase28OfflineWitnessPayload`, `phase28CapturerMessage`, and `phase28ReviewerMessage` to prepare the exact bytes for independent signing; do **not** fabricate a signature or store signer keys in the app.

## Critical limitations and external review

- **Signatures prove possession of the two locally pinned reviewer keys**, not that Upstox emitted the JSON. Both witnesses might be wrong, compromised or colluding, and a separately provisioned trust policy might itself be untrustworthy.
- This module does **not independently witness TLS**, broker signature, request ID, HTTP headers, upstream IP, static IP registration, token authorization, account permissions, or real-time order/position truth. Original response *body* bytes are operator supplied and may themselves be fabricated.
- The challenge avoids trivial replay **only when the verifier issues it independently**; to reject a challenge reused across runs, an external **durable, access-controlled nonce registry** must be added. This module is stateless and cannot guarantee cross-process uniqueness.
- Reviewer timestamps are not independently anchored in a signed timestamping service. The code checks consistency, not true UTC clock authenticity.
- Base64 raw response size is intentionally capped (131072 characters per GET body); oversize evidence is blocked for manual investigation.
- There is no broker-native stop installation, broker exchange acknowledgment, independent generated GTT order validation, guaranteed stop execution, overnight risk mitigation, real NRML risk-runner, 1–8 week expiry management, verified instrument reference calendar, licensed options L1 or independent OOS profitability.
- Existing EMA23/50 intraday MIS code with 15:15 square-off is **not touched**. No positional NRML 15:15 auto-exit is added.
- PR28? **This is Phase28; it is stacked as a DRAFT above Phase27 PR #32.** Issues #17–#22 remain blockers and must not be closed due to a green CI run.

## Audit output contract

- `INVALID_EVIDENCE`: required body/policy/manifest incomplete, malformed or inconsistent.
- `SIGNATURE_OR_TRUST_REJECTED`: independent challenge/scope/key/time/signature validation failed.
- `BLOCKED_OR_UNKNOWN`: even if both signatures match, a Phase27 risk/chronology/lifecycle blocker exists.
- `SIGNATURES_VALID_OFFLINE_UNVERIFIED`: exact operator-supplied raw response bytes and declared lifecycle match two pinned external signatures, and Phase27 reports same-day structural consistency. **Still not authenticated broker evidence.**

All reports permanently have:

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
nativeOrderInstruction=null
```

**Phase29 candidate:** provider-authorized *GET-only* capture architecture with static-IP attestation, per-account access verification, immutable original request+response archives, privacy-filtered key management and independent exchange/order-history cross-check. This requires explicit account-owner authorization and independent security review before any operational deployment.
