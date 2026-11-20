# Adaptive Swing v2 — Phase72 candidate issuer key lifecycle, registrar and witness quarantine

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase71 Draft PR #76.** No exchange/vendor/broker network writes, no NRML orders, stops, GTT, contract auto-ranking, claimed strategy profitability or positional 15:15 exit.

## Why Phase72

Phase71 verifies a mathematically valid detached Ed25519 signature on exact operator-provided original holiday/archive bytes and complete original OOS source cohort. It cannot establish that the candidate signer is NSE/BSE, that its key was actually active in historical time, or that an independently trusted registrar or timestamp witness published its authority. Simply adding another signature is not real issuer identity.

Phase72 adds an OFFLINE **candidate key lifecycle and receipt consistency gate** to prepare for future externally authenticated key-distribution artifacts. It verifies three cryptographically distinct key roles:

1. The original Phase71 **calendar manifest issuer** key, which signed the original purported exchange day archive;
2. A *separately supplied* candidate **registrar** key, which signs an original issuer-key roster containing status, purpose, SPKI SHA, effective-from/to and claimed revocation time;
3. A *separately supplied* candidate **witness** key, which signs an original source receipt binding the exact registrar roster, original Phase71 manifest, original third-source holiday archive, original issuer public key and original earliest OOS decision instant.

All three candidate keys are independently pinned as bytes and required to be different, with **role-domain-separated Ed25519 signatures over exact raw JSON bytes**. They may all be generated and controlled by one operator. There is NO out-of-band official exchange/registrar public root, legal option-data licence, independent timestamp or genuinely separate reviewer here. Success is mathematically consistent LOCAL source documentation only.

## Strict screens

Source: src/server/engine/ema15m/adaptivePhase72IssuerKeyLifecycle.ts
Entry: auditPhase72CandidateIssuerKeyLifecycle(input,pins).

- Freeze exact Phase71 dossier/pins, original registrar roster raw SHA256 + Ed25519 signature + DER SPKI, original claimed witness receipt raw SHA256 + detached signature + DER SPKI. Verify independent pins before cryptography.
- Verify registrar and witness Ed25519 with strict 44-byte SPKI DER and 64-byte detached signature; issue-specific distinct signing domain prefixes prevent accidentally accepting an issuer calendar signature as registrar/witness authority. All three keys must be pairwise distinct. **Cryptographic role separation is NOT proof of organizational/person independence.**
- Roster must have bounded entries, a unique key ID each, fixed *historical F&O exchange-like day calendar ONLY* scope, a structurally coherent claimed effective window, and ACTIVE/REVOKED/SUSPENDED/RETIRED lifecycle. A revoked/suspended target signing key or an ACTIVE key carrying an alleged revokedAt claim cannot validate the Phase71 source; duplicate key IDs fail. All ACTIVE issuer candidate key epochs must be nonoverlapping, preventing ambiguous claimed signer rotation or key-ID reuse.
- Target roster key ID must match exact original signed Phase71 claimed key ID and original issuer SPKI SHA, and be ACTIVE and in-force during the **claimed** signed-at/roster publication/witness receipt window. Changing the key under the same ID is a fail-closed source substitution.
- The candidate registrar roster must be claimed published before the original Phase71 signed manifest, the candidate witness receipt claimed observed after the roster publication and **no later than the earliest actual original OOS decision**. The receipt's own claimed first-decision instant must match **the earliest frozen Phase66 source original decision time**, not a separate attacker-selectable earlier time. This is a software as-of check on **UNTRUSTED timestamps**, not a trusted historical delivery receipt.
- The witness receipt must bind exact registry raw SHA, exact original Phase71 signed manifest SHA, exact original candidate calendar archive SHA and original issuer key SPKI SHA. A correct witness signature on someone else's OOS source is rejected.
- Re-audit complete Phase71→70→69→68→67→66 NEW standalone original source, including all CE/PE alternatives on 1W/2W/4W/8W original decision days and original NO_ENTRY counts. Do not promote selected winning quotes into a fabricated executed multiweek position.

## Results and permanent boundaries

Only passing status: DESCRIPTIVE_THREE_ROLE_CRYPTO_CONSISTENCY_UNTRUSTED_ONLY. It means: all candidate Ed25519 signatures/math, expected source byte hashes, unique role key bytes, nonoverlapping active key windows, hypothetical key status and original claimed as-of witness bindings are internally consistent. INVALID_EVIDENCE or INCOMPLETE_EVIDENCE indicate cryptographic, source, key-lifecycle or OOS coverage failures.

**Always FALSE:** registrar official status, real independent witness identity, exchange issuer SPKI authenticated via official channel, independently trusted key revocation or historical publication clocks, true exchange holiday/special-session/lot/expiry master, genuine licensed vendor historical option L1 BID/ASK/depth, original client quote availableAt, actual option purchase/sale BID/ASK fills, independently profitable untouched real multi-regime 1W–8W trading, true theta/IV/depth/slippage/gap paid-premium loss calibration, optimal expiry recommendation, native broker NRML stop/GTT child exchange ACK, execution and production safety. nativeOrderInstruction=null.

A locally created fake registrar and fake witness can sign a perfectly consistent fake issuer roster and receipt. **No crypto result in this phase asserts real NSE/BSE trust.** Real vendor licensing and authentic issuer keys must be independently obtained through official out-of-band channels, checked against actual source delivery/recall/revocation documentation with qualified reviewers, and time-anchored where historically valid.

## Synthetic verification

src/quant/tests/ema15m_adaptive_phase72_issuer_key_lifecycle.test.ts includes 21 adversarial synthetic tests over Phase71's test-only original 4 OOS dates, 2 NO_ENTRY dates, 32 originally listed CE/PE pairs, claimed 1W–8W horizon instruments and synthetic full quote source. The test-only fixture generates **three** locally created Ed25519 role keys and signs fabricated issuer-like materials. Positive local crypto verification has all official issuer/regulatory/production status flags still FALSE.

Tests include: rehashed but unsigned roster changes; altered witness signature; REVOKED and SUSPENDED target keys; ACTIVE plus revocationAt conflict; duplicate issuer key ID; overlapping ACTIVE rotation; nonoverlapping future rotation that's still untrusted; rebound signer SPKI; late witness receipt, retrospective registry published after original manifest signing, forged witness first OOS time, wrong original manifest/archive SHA replay; forged registrar and witness labels; tampered NO_ENTRY counts; original key outside effective time; long-option entire paid premium debit and broker native stop ACK always unproven. The synthetic code deliberately demonstrates a self-re-signed new witness identity can pass local math without any actual independent reviewer.

Dedicated workflow: .github/workflows/adaptive-phase72-issuer-key-lifecycle.yml runs TypeScript and all 21 tests. Phase50–72 focused combined safety, production build and complete npm regression must pass separately. Synthetic green CI validates source consistency software, NOT profitability or independent market-data rights.

## Private operator CLI

Two separate owner-only 0600 JSON files in owner-only 0700 directories. Enforce OS/container **no network egress** outside this code. The CLI neither authenticates official root keys nor provides a network sandbox.

    npx tsx scripts/audit-adaptive-phase72-key-lifecycle.ts \
      --approve-isolated-offline-review \
      --private-phase72-key-lifecycle-dossier /private/phase72-dossier.json \
      --independent-phase72-registrar-witness-pins /private/phase72-pins.json

Output is ONLY original OOS aggregate counts, candidate crypto/key-lifecycle check booleans and hard-false issuer/broker/profit statuses. No raw market quotes, exact source day, certificate/DER, signatures, issuer names, private files or account credentials.

## Release and research blockers

Real procurement still requires independently licensed historical option Level-1 best BID/ASK and displayed depth through all genuine trading sessions and original option holding/expiry, authenticated official point-in-time F&O expiry/lot/holiday/special-session master and signers, actual contemporaneous strategy-side receipt evidence where truly captured, plus a prespecified untouched genuine multi-regime OOS 1W–8W premium/theta/IV/spread/slippage/overnight gap/full paid debit-loss and original NO_ENTRY study. **An underlying index +100 point objective is not option premium +100 points**, and quoted +50/+70 premium run-up followed by reversal is not a guaranteed trailing exit fill.

The separate broker-native NRML overnight stop/GTT place/modify/cancel/trigger/child exchange ACK and gap nonfill requirements remain unresolved, especially release issue #20. Issues #17–#22 OPEN. All research PRs DRAFT/unmerged. Existing EMA23/50 **MIS intraday 15:15 square-off unchanged**; NRML positional 1W–8W has **no forced 15:15 exit or live order/GTT/stop writer**.
