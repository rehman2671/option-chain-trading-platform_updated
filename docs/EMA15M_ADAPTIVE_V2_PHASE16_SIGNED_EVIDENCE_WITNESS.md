# Adaptive Swing v2 — Phase 16 detached signed evidence and reviewer-key binding

**RESEARCH ONLY / DRAFT / UNMERGED.** No broker API, order routing, real/paper NRML, native stops, GTT activation or modification to the existing EMA23/50 intraday MIS strategy and its 15:15 square-off.

## Why Phase 16 exists

Phase 15 closes an omission hole in vendor-owned session calendars by asking for a separately supplied complete-day NSE/BSE session ledger and retained source document. It does not prove those source files were issued by the exchange or licensed original feed vendor. A vendor could manufacture *both* records, include invented official-looking metadata, compute matching SHA256 digests and still pass a purely structural consistency check.

Phase 16 adds a distinct, **operator-pinned dual-review cryptographic gate**, requiring two different **Ed25519** public keys whose fingerprints have been pinned and approved OUTSIDE the research bundle. A detached signature for **calendar** review and another for **original historical L1 archive** review each binds the **exact raw original file bytes** and research identity. A changed byte cannot silently reuse the original detached signature. The module also reruns Phase 6's original vendor-archive SHA256 and Phase 15's independently supplied day/expiry calendar.

**IMPORTANT:** Even a valid Ed25519 signature proves only that the holder of the corresponding private key signed specified bytes. It does not validate the real-world identity/independence of the reviewer, authenticate NSE/BSE issuer origin, prove market-data licensing, validate original market event/availability clocks, establish signature creation time or establish profitability. The trust registry itself is **operator supplied** and can be compromised or fabricated. Those checks need an actual external trust process and source-of-record audit.

The highest possible outcome is deliberately:

`SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED`

It means **cryptographic byte bindings and source consistency checks pass**, *not* that NSE/BSE or a licensed L1 vendor is authenticated. A synthetic bundle remains `BLOCKED_INCOMPLETE_EVIDENCE` even with valid signatures.

## Six required separate input files for the offline audit

1. **Original derived historical bundle** containing the original source-attested vendor event clocks, feed archive digest and folds (`--bundle` positional input).
2. **Separately retained original vendor L1 archive bytes**, whose SHA256 matches the provenance manifest (`--source-artifact`).
3. **Complete daily exchange calendar manifest**, exactly one record per calendar day with REGULAR/SPECIAL trading windows, closures, point-in-time expiry dates (`--exchange-calendar-evidence`).
4. **Original calendar source-document bytes**, matching the separate calendar-manifest SHA256 (`--calendar-source-document`).
5. **Detached witness envelope** with two role-separated `Ed25519` signatures over the canonical domain-separated binding message (`--signed-evidence-envelope`).
6. **Separately operator-pinned public-key registry** with two distinct reviewers, roles and DER-SPKI SHA256 public-key fingerprints (`--reviewer-trust-registry`).

The CLI rejects aliasing of any of those six files by real path, so the historical JSON, licensed archive, exchange document, witness envelope and key registry cannot be disguised as each other by symlink names. **This does not prove their truly independent origins.**

### Byte-level claims required in `ADAPTIVE_SIGNED_RESEARCH_EVIDENCE_V1`

`studyProtocolId`, `datasetId`, `instrument`, exact `bundleSha256`, `vendorArtifactSha256`, `calendarManifestSha256`, `calendarDocumentSha256`, `calendarCoverageStart`, `calendarCoverageEnd` and exactly two `witnesses` with `role`, `reviewerId`, `signedAt` and detached `signatureBase64`.

Each reviewer signs a byte string starting with the domain separator `ADAPTIVE_OFFLINE_EVIDENCE_ED25519_V1\\n` followed by the UTF-8 JSON of the precise ordered field object constructed by `buildAdaptiveEvidenceWitnessPayload(...)`. The signed content includes all original file fingerprints, reviewer ID, reviewer role and review timestamp, plus explicit `NOT_TRADING_APPROVAL` purpose. No signatures are inferred from external files, unsigned role assertions or unsigned `reviewed: true` fields.

The trust registry uses `ADAPTIVE_OPERATOR_PINNED_REVIEWERS_V1`, `trustSource: "OPERATOR_PINNED_UNVERIFIED"` and exactly two distinct `CALENDAR_REVIEWER` and `ORIGINAL_L1_REVIEWER` keys. Each key is standard Ed25519 SubjectPublicKeyInfo PEM with operator-pinned SHA256 of its binary DER-SPKI. The module rejects non-Ed25519 keys, wrong fingerprints, duplicate fingerprints, duplicate reviewer IDs, same role twice, wrong signature, different signed dataset/document, and signatures self-declared earlier than the calendar coverage.

The signed `signedAt` itself is NOT externally timestamped. It is a signed claim, not a timestamp authority.

### CLI

```bash
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/source-attested-archive-bundle.json \
  --source-artifact /secure/original-vendor-feed.bin \
  --exchange-calendar-evidence /secure/comprehensive-independent-calendar.json \
  --calendar-source-document /secure/exchange-calendar-document.pdf \
  --signed-evidence-envelope /secure/phase16-evidence-signatures.json \
  --reviewer-trust-registry /secure/out-of-band-reviewed-public-keys.json
```

The signer must create the detached signature **outside the trading/research application**, ideally using independently administered private keys which never enter the repository or command line. The repository contains only public key metadata and verification code. Avoid committing licensed raw historical quotes, customer identities, private signing keys, reviewer credentials, source documents or secret entitlement IDs. The CLI prints only audit status, hash fingerprints, reviewer-role signature verification counts, dates/expiry/session coverage blockers and hard-false trading flags. It does not print raw option quotes, reviewer public keys or signature values.

**Do not trust a registry copied from the same person who assembled the historical dataset.** Confirm the reviewers' identities, conflicts and public-key fingerprints with their organizations via separate trusted channels. The software cannot establish or enforce that real-world process.

## Failure outcomes

- `REJECTED` when source archive SHA256 fails, calendar source bytes fail, wrong dataset/document signature binding, non-Ed25519/reused/unpinned public key, invalid/tampered signature, wrong reviewer role or malformed input.
- `BLOCKED_INCOMPLETE_EVIDENCE` when structurally valid and signed documents are **synthetic** or the independent calendar identifies missing vendor sessions, omitted test-fold days, fake closed days, mismatched special hours, expiry gaps or original feed clocks inconsistent with the calendar.
- `SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED` when two distinct operator-pinned reviewers' detached signatures match exactly the supplied file bytes, Phase 15 consistency passes and the bundle is declared non-synthetic. This is still **not** source authentication, data-licensing proof or trading approval.

All reports hardcode `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `nativeBrokerProtectionInstalled=false`, `exchangeIssuerAuthenticated=false`, `vendorDataOriginAuthenticated=false`, `originalAvailabilityClockAuthenticated=false`, `historicalLicenseIndependentlyVerified=false`, `reviewerIdentityIndependentlyAuthenticated=false`, `trustedTimestampEstablished=false`.

## Synthetic tests and evidence limitations

New `ema15m_adaptive_signed_evidence_witness.test.ts` generates **ephemeral local Ed25519 key pairs in memory** and signs fabricated 2026 historical/calendar fixtures to test the mechanics. Tests cover genuine cryptographic verification, exact derived JSON binding, modified vendor L1 bytes, mutated calendar metadata, missing OOS session with re-signed files, synthetic data refusal, swapped keys, identical keys across reviewer roles, tampered signatures, altered timestamps and absence of out-of-band registry. No test key is published, stored in version control or used for actual exchange evidence. The fact a **fabricated non-synthetic-labeled** fixture can achieve `SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED` is a deliberate demonstration that **valid signatures and self-declared non-synthetic labels do not establish real market provenance**.

**Still missing:** an independently authenticated NSE/BSE original calendar/expiry record, licensed historical index-option L1 archive with defensible original feed/event availability, genuine independent reviewer signers, trusted immutable timestamp and fully broker-authoritative stop/GTT evidence. Real option prices are affected by theta, IV, spreads, liquidity, overnight gaps and expiry. Only when these missing prerequisites are obtained can the research be presented for external audit; broker execution approval would remain separately gated.

Phase 16 makes **no claims** that the 1W/2W/4W/8W horizon has profitable results and does not modify any live MIS or NRML path.

**Keep Draft/unmerged.**
