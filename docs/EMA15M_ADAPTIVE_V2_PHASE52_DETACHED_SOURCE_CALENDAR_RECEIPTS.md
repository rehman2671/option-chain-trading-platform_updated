# Adaptive Swing v2 — Phase 52 detached OOS source/calendar receipt bindings

**Draft / Research only. Stacked on Phase51. This is NOT proof of NSE/BSE exchange authenticity, historical option L1 licensing, genuine trade fills, profitability, native GTT protection or live NRML readiness.**

## What Phase52 addresses

Phase50 verifies option quote event-time versus availability-time ordering and keeps 3 strategy arms × 4 horizons × every original OOS decision. Phase51 checks a separately declared complete exchange-session ledger so omitted no-quote/volatile days cannot simply disappear from the original study without a mismatch. Both prior audits still consume operator-supplied material and may be amended or substituted by an operator.

Phase52 adds **detached Ed25519 digital signatures** binding the *exact* Phase50 original data and Phase51 calendar/session denominator to two individually registered reviewer keys. Signing a fake historical archive with two operator-controlled keys can still generate a valid signature. Therefore a passing result says **cryptographic integrity of registered signer bytes only**, not that those keys or organizations belong to a real exchange, vendor, independent reviewer or timestamp authority.

## Implementation

Source: `src/server/engine/ema15m/adaptivePhase52DetachedSourceReceipts.ts`.

`auditPhase52DetachedSourceCalendarReceipts(input,pins)` is a pure offline function that:

1. Requires a separately pinned SHA256 of the complete Phase51 input, its independent pins and its two-reviewer registry; SHA256 hashes of **both exact canonical receipt messages** and the two separately retained external evidence document digests must match predeclared Phase52 pins.
2. Re-runs Phase51, which itself re-runs Phase50 and the original entry-first historical OOS cohort. A cached PASS result cannot replace source evidence. Any missing declared OOS date, incomplete original contract selection, invalid source availability, or 3 × 4 × OOS denominator loss blocks the review.
3. Requires two distinct signed roles: `ORIGINAL_OPTION_L1_REVIEWER` and `SESSION_CALENDAR_REVIEWER`. Registered reviewer IDs, organization IDs and public Ed25519 SPKI fingerprints must be distinct and their full registry exact-SHA-pinned. The registry's *claimed identity* remains independently unauthenticated.
4. Verifies detached Ed25519 signatures over a domain-separated canonical payload binding: study dataset ID, exact Phase51 original source and pins SHA256, full original historical input SHA256, calendar ledger SHA256, exact date-only OOS manifest SHA256, OOS day count, original quote row count, signer role/identity/organization, claimed signature time and separately retained external evidence document digest/reference. The signature is not a broker ACK, vendor license, or authorized historical feed entitlement.
5. Returns `INCOMPLETE_EVIDENCE` or `INVALID_EVIDENCE` if signers, document hashes, original source, receipt scope or signatures fail. Synthetic success can only return **`CRYPTOGRAPHIC_BINDINGS_VALID_EXTERNAL_AUTHENTICATION_REQUIRED`**; there is no operational “verified vendor” or broker execution state.

Every result hardcodes `executionAuthorized=false`, `productionSafe=false`, `nativeOrderInstruction=null`, `externallyAuthenticatedVendor=false`, `exchangeCalendarIssuerAuthenticated=false`, `licensedHistoricalOptionL1IndependentlyVerified=false`, `sourceAvailableAtIndependentlyAuthenticated=false`, `reviewerKeyOwnershipIndependentlyVerified=false`, `trustedThirdPartyTimestampEstablished=false`, `nativeNrmlOvernightStopInstalled=false`, `actualBrokerOrderAckAuthenticated=false`, and `unbiasedChronologicalOosProfitabilityProven=false`.

## Synthetic adversarial tests

`src/quant/tests/ema15m_adaptive_phase52_detached_source_receipts.test.ts` uses fully fabricated Phase48 historical candles/contracts/option L1 and two chronological OOS days (24 arm-horizon decisions), with fresh test-only Ed25519 key pairs. Regression cases:

- Valid cryptographic receipt binding must still explicitly reject claims of original licensed data, source truth, third-party trusted timestamp, broker-native stop and profitable strategy.
- Swapped signature, wrong document digest/quote row count, wrong public-key fingerprint, duplicated signer organization and bad source hashes cannot pass.
- Deleted OOS date **even when operator recomputes all inner hashes and re-signs both receipts** still fails the nested original independent declared-session completeness audit.
- Missing original quote source `availableAt` fails even if both signed receipts are freshly issued by test keys.

The fixture is synthetic; real exchange and vendor identities and entitlement remain absent. GitHub CI is only a software invariant check.

## Owner-private manual offline review

Source dossier and independent pins must be separate existing absolute owner-only `0600` JSON files in private `0700` non-symlink directories, reviewed with the host network egress disabled:

```bash
npx tsx scripts/audit-adaptive-phase52-detached-receipts.ts \
  --approve-isolated-offline-review \
  --private-phase52-detached-receipt-dossier /private/phase52-source-calendar-receipts.json \
  --independent-phase52-source-receipt-pins /private/phase52-pins.json
```

The dossier contains complete Phase51 historical source and policy pins, operator-supplied calendar and receipt registry, and the two detached receipt objects. Phase52 pins must be independently fixed before OOS inspection. The CLI prints aggregate status/counts and negative-proof flags; no broker tokens, instrument keys, option prices, source quote bytes, signer's PEM or private document paths are printed. It never calls a broker or data vendor.

## Genuine evidence still required

- Authentic, licensed historical F&O option best bid/ask and best-level quantity with verified original event and actual strategy-availability timestamps, source delivery and contractual entitlement.
- Issuer-authenticated NSE/BSE session calendar, special-session changes, expiry amendments and valid point-in-time exchange contract master; real documented external reviewer independence and key custody.
- Externally trusted timestamp, non-operator-controlled evidence custody, original vendor document signature/chain and entitlement review by an appropriate independent authority.
- Large untouched chronological OOS samples, explicit missing options, spreads/depth/cost, IV/theta, premium reversals/gaps and zero-recovery stress, with no survivorship bias.
- Actual native broker order/GTT ACK, cancel/modify/replace and overnight continuity evidence **before** any live positional order.

Release blockers #17–#22, including #20, stay OPEN. All stacked research PRs remain **DRAFT / unmerged**. Existing EMA23/50 **MIS** intraday 15:15 square-off remains unchanged. New NRML positional 1W/2W/4W/8W has **no forced 15:15 exit, no live orders, no GTT writes, no automatic stop repair and no trading deployment**.
