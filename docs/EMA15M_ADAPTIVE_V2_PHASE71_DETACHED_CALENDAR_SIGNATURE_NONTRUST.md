# Adaptive Swing v2 — Phase71 detached candidate calendar Ed25519 manifest provenance

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase70 Draft PR #75. No live broker/NRML/GTT/stop writes, no automatic contract ranking, no forced positional 15:15 exit.**

## What changed

Phase70 reconciles alleged exchange holiday, emergency closure, special weekend OPEN and ordinary session days against a separately supplied third daily calendar and the new Phase66–69 original listed-option OOS history. But an owner can fabricate all source files and their hashes. Phase71 adds actual **detached Ed25519 cryptographic signature verification** for an original raw calendar manifest. The manifest binds the EXACT third-source original calendar byte SHA256 and complete Phase70 source/pin cohort. Signature verification checks mathematical consistency, **NOT real NSE/BSE issuer identity or licence**.

Source: src/server/engine/ema15m/adaptivePhase71DetachedCalendarManifest.ts.
Offline entry point: auditPhase71DetachedIssuerCalendarManifest(input,pins).

## Candidate signing protocol (unverified identity)

1. Preserve the full Phase70 input and its independent pins, including Phase69/68/67/66 original source, all original OOS decisions, NO_ENTRY days, all 1W/2W/4W/8W CE/PE options, L1 BID/ASK source, candidate issuer calendar and holiday notices. Do not promote another cohort or only selected winners.
2. Receive a separate original **UTF-8 signed manifest as raw bytes**, a detached 64-byte Ed25519 signature, and candidate public key in **exact 44-byte DER SPKI** form. This module takes NO signing private key. It validates the SPKI Ed25519 ASN.1 header and requires real Node cryptographic verification; no custom fake digital signature algorithm.
3. Independently SHA256-pin the original manifest bytes, original Phase70 claimed all-day calendar archive bytes, exact Phase70 input and Phase70 pins, Ed25519 SPKI public key DER and detached signature bytes. **Owner-generated SHA256 pins are not external witnesses** or official issuer trust roots.
4. Verify the signature over DOMAIN-PREFIX plus EXACT preserved manifest raw bytes; never stringify a parsed JSON object to reconstruct the signed input. Domain prefix: ADAPTIVE_PHASE71_HISTORIC_SESSION_ARCHIVE_ED25519_MANIFEST_V1 followed by newline. Verify with the supplied Ed25519 public key; the signature bytes must not be reinterpreted as vendor authentication.
5. The original signed manifest must declare fixed research-only purpose/audience, claimed issuer/archive IDs, signer key ID, original archive byte SHA, complete Phase70 input/pins SHA, archive coverage start/end and full original daily archive count. Any wrong source or replayed separate original OOS source fails.
6. Enforce only **structural** claimed signing chronology: claimed signer key effective-from precedes claimed signed-at, which precedes effective-through and earliest original OOS date. Self-reported signed-at is NOT a cryptographic independently trusted timestamp or evidence a strategy had the history on that day.
7. Re-audit Phase70 and all prior source: every original listed option, NO_ENTRY date, candidate calendar weekday gap, alleged holiday notice/exception, next-session opening and source quote coverage remains subject to offline checks. The signing step cannot override missing quote, expiry, overnight nonfill or source authenticity failures.

## Output and firm nontrust boundary

INVALID_EVIDENCE means changed signed bytes/pins, wrong public SPKI format, invalid Ed25519 signature, malformed archive/issuer/purpose. INCOMPLETE_EVIDENCE means a valid candidate signature covers a different source cohort/archive, noncausal claimed time or invalid original Phase70 OOS denominator.

The ONLY passing state is DESCRIPTIVE_CRYPTO_CONSISTENT_UNTRUSTED_ISSUER_ONLY. It means exactly: the candidate Ed25519 public key verifies the detached manifest, original archive bytes and complete OOS parent hashes agree, and the reported claimed times are structurally plausible. It **DOES NOT** authenticate NSE/BSE, a real licensed supplier, issuer official holiday/expiry master, independently trusted historical source/strategy receive clock, actual broker BID/ASK fill, untouched multi-regime profitability, calibrated IV/theta, real spread/slippage/gap downside or best 1W–8W contract.

Always false: independentExchangeIssuerKeyTrustAnchorEstablished, independentlyVerifiedOriginalExchangeCalendar, independentlyVerifiedVendorHistoricalOptionL1License, historicallyTrustedClientStrategyAvailableAt, originalOptionBidAskQuoteIsActualExecutionFill, independentlyProvenMultiregimeProfitableStrategy, brokerNativeNrmlGttStopChildExchangeAckVerified, executionAuthorized and productionSafe. nativeOrderInstruction is always null. The entire paid option premium debit plus applicable fees may still be lost. Signed option market source does not prove a triggered overnight stop filled.

**Critical signing-key distinction:** test fixtures intentionally generate a fresh local Ed25519 keypair and use it to sign wholly fabricated issuer-looking calendar notices. The cryptographic signature passes, but **independent exchange issuer trust remains false**. To verify real issuer identity later, obtain an authenticated official publisher public key/certificate chain **out of band** and an issuer-specific signed-document/trust profile and independent publication/transport timestamp evidence. A locally supplied public key and issuer name do not establish those facts.

## Test coverage

The Phase71 synthetic test suite has **18 adversarial tests** against Phase70's full new 4 original OOS dates (2 NO_ENTRY), 2 simulated regimes, 32 originally listed CE/PE options over 1W–8W and wholly synthetic historical L1. It verifies:

- Authentic Ed25519 mathematics over the candidate original manifest and all original source/pins, while official issuer/calendar identity remains unverified.
- Original day archive changed and locally repinned but old signed manifest unchanged, tampered original signed manifest bytes, mutated detached signature, substitute keypair, malformed DER SPKI, fake signed wrong archive hash, re-signed replay against another original OOS cohort, and future/invalid claimed signing or key-effective times.
- Forged purpose claiming live broker authority, substituted self-claimed exchange identity, truncated all-day archive, changed original no-entry count, and changed signer key fingerprint fail closed.
- Critically, an owner can **RE-SIGN** an invented emergency closure and repin every file with a new valid signature; the code still returns only descriptive untrusted-issuer status. No fake key can approve a contract, profit result or broker stop.

Dedicated workflow: .github/workflows/adaptive-phase71-detached-calendar-manifest.yml (TypeScript plus all 18 tests). Separate Phase50–71 focused, EMA targeted safety, production build and full regression must independently pass before any merge discussion. Synthetic signature tests are software checks, not exchange-issued evidence.

## Owner-private offline run

Use separate owner-only 0600 files in owner-only 0700 directories under OS/container-enforced no-network-egress; this command cannot sandbox itself, contact official key registries or prove legal entitlement.

    npx tsx scripts/audit-adaptive-phase71-detached-calendar-manifest.ts \
      --approve-isolated-offline-review \
      --private-phase71-original-manifest-dossier /private/phase71-signed-source.json \
      --independent-phase71-candidate-signing-pins /private/phase71-independent-pins.json

Only aggregate source denominators, candidate crypto integrity booleans and always-false market/trade trust flags are emitted. No signer public/private keys, raw signature, issuer IDs, raw session dates, premium/strike, client capture times, licensing bytes or brokerage account information is published.

## Actual next evidence and release blockers

Still need genuine authorized historical option best BID/ASK plus displayed depth for all original listed 1W/2W/4W/8W contracts and every actual exchange session, authenticated issuer published expiry/lot/calendar and holidays, truly contemporaneous original strategy source reception when recorded, and untouched real OOS multi-market-regime performance research with prespecified risk/entry/exit/partial gain reversal, theta/IV, spread, overnight gaps and **complete paid long-option debit loss**. Index +100 points and option premium +100 points are not interchangeable. Separately demonstrate broker-native overnight NRML GTT/stop place/modify/cancel/trigger/child/exchange ACK and nonfills.

Issues #17–#22 including #20 remain OPEN; stacked PRs DRAFT/unmerged. Existing EMA23/50 **MIS intraday 15:15 square-off unchanged**. NRML positional 1W–8W has **no forced 15:15 exit and no live order, GTT or stop writes** in Phase71.
