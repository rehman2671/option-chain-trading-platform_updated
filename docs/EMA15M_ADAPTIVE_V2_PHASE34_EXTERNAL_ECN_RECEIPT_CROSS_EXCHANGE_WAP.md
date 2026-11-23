# Adaptive Swing v2 Phase34 — external ECN PDF-verifier receipt and cross-exchange WAP

**DRAFT / unmerged / no live NRML order placement or broker access. Synthetic test inputs only.**

Phase34 introduces a *fail-closed evidence boundary* between an **independently operated PDF-signature/content verification service** and our trading-platform research layer, plus a strict offline reconciliation of **NFO/BFO common-contract annexure executions** against complete Phase31 historical F&O trade cohorts and consolidated ECN WAP.

**This repository DOES NOT perform PDF CMS/PAdES cryptographic signature, certificate-chain, CRL/OCSP, trusted timestamp, original PDF text extraction or genuine broker issuer validation.** An externally signed report is an assertion from a separate verification service, not mathematical proof that its assertions are true. The modules explicitly set `pdfDigitalSignatureVerifiedByThisCode=false` and `brokerEcNissuerIndependentlyVerified=false` even if the report cryptographic signature validates. Do not claim a genuine Upstox contract note has been authenticated from the status.

## Official reference context

- [NSE contract-note FAQ](https://www.nseindia.in/static/trade/contract-note-faqs): the revised contract-note format provides a common-contract WAP across exchanges and annexure trade details (exchange, order/trade identifiers/times, quantity, price). Two or four decimal display precision is permitted. ECN notes covering both exchanges **must not be reconciled by looking at one exchange only**.
- [SEBI digital signature circular](https://www.sebi.gov.in/legal/circulars/dec-2000/use-of-digital-signature-on-contract-notes_17512.html): digitally signed contract notes require a digital-signature certificate from a certifying authority under applicable Indian IT law. A synthetic Ed25519 *validator receipt* does not substitute for the original broker's document signature.
- [ETSI EN 319 142-1 PAdES overview](https://www.iteh.eu/catalog/standards/etsi/69b396aa-4e0a-43ef-8e48-ec89cff26a60/etsi-en-319-142-1-v1-2-1-2024-01): certificate trust path, revocation and document byte-range coverage are distinct validation concerns. These must be verified by a trusted, independently sourced external PDF validator; no PDF validation library exists in this PR.
- [Upstox historical executed-trade API](https://upstox.com/developer/api-documentation/get-historical-trades/): historical F&O trade fills are **NOT** native order-history lifecycle or native stop ACK/cancel/replace evidence.

## Source and trust boundaries

### `adaptiveUpstoxPhase34CrossExchangeWap.ts`

Pure offline matching of up to two **separate**, complete Phase31 `OfflineHistoricalFoAuditInput` cohorts (NFO and/or BFO), scoped to one independently asserted account UCC, *same* trade date, underlying symbol, CE/PE, strike and expiry. Separate exchange instrument identifiers are retained. A claimed common contract across exchanges is marked `EXTERNALLY_REVIEW_REQUIRED`; real fungibility and expiry/settlement equivalence are **not independently verified**.

For every pinned expected exchange, the module requires a complete Phase31 same-day FO history pass and at least one selected trade. It matches every selected `exchange|trade_id` to exactly one manually transcribed note annexure row, with matching BUY/SELL side, quantity, price, exchange, expiry, option type and strike. A trade ID reused on different exchanges is distinguishable, while duplicated/missing IDs *within* an exchange fail. The source histories must cover **all** intended exchanges; merely passing one exchange with a two-exchange WAP is a blocker.

WAP is computed separately for BUY and SELL using **BigInt exact 1/10,000 INR precision** and quantity-weighted value from **both** exchange trade cohorts. One transcribed summary per date+side is required with strict 2- or 4-decimal display and half-display-unit rounding tolerance. This is not a PDF parser, exchange instrument mapping authority, or accounting/fees engine; it reviews only the selected common contract. Note-level taxes, net price, turnover and reconciliation for other contracts require separate procedures.

Report: `CROSS_EXCHANGE_WAP_MATCHED_OFFLINE_UNVERIFIED` or fail-closed `BLOCKED_OR_UNKNOWN`. Both still have `executionAuthorized=false`, `brokerAuthenticated=false`, `brokerStopInstalled=false`, `protectedOvernight=false`.

### `adaptiveUpstoxPhase34ExternalEcnReceiptGate.ts`

Accepts a separately produced, externally **Ed25519-signed validator result** over:
- the original locally supplied ECN PDF SHA-256;
- the full private manually transcribed annexure and WAP summary hashes;
- both full Phase31 historical F&O JSON histories;
- the selected contract/exchange coverage scope and UCC hash;
- a 256-bit challenge plus an exact externally pinned validator build SHA, broker certificate fingerprint and issuer CA fingerprint;
- strict **signed assertions**: signature integrity, full document coverage/no unsigned updates, valid CA chain, revocation good, independently trusted timestamp, and claimed extraction of PDF annexure/WAP corresponding exactly to transcribed rows.

All independent **pinned** identifiers, reviewer public key, challenge, expected UCC/exchanges, signed timestamp and allowed review age must be supplied **outside** the operator-controlled receipt. They cannot be copied blindly out of the supplied document. The software verifies the verifier receipt **signature**, exact hashes and freshness; it **does not** execute any PDF CMS/PAdES or CA verification locally. A malicious/colluding/compromised verifier can still sign false claims. Even a cryptographically valid receipt for the synthetic fake PDF can produce only `EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED`.

Separate `verifyAndClaimPhase34ExternalReceiptOnce` reruns all these checks, then consumes `account + challenge` exactly once through an exclusive `O_EXCL`, `fsync` file in an existing process-owned 0700 directory. Replays in that **retained local registry** fail; it is **not** a distributed/notarized/WORM/rollback-resistant registry or independently sourced time oracle. It neither authenticates an upstream broker nor allows placing/modifying/cancelling orders.

### `scripts/audit-adaptive-upstox-phase34-ecn.ts`

Offline-only CLI accepts a **0600 private manifest file** listing:
- `privateOriginalPdfPath`: private original ECN PDF, not a URL;
- `privateTranscribedAnnexurePath`: private Phase33 `OfflineContractNoteRecord` JSON (without including PDF base64; original bytes are read separately);
- `privateCrossExchangeScopePath`: private selected common-contract scope JSON;
- `privateExternalVerifierReceiptPath`: externally produced signed validator receipt JSON;
- `privatePinnedTrustPolicyPath`: **independently provisioned** pinned validator key, build/cert/CA fingerprints, UCC/nonce, expected exchanges, trusted review window;
- `encryptedFoHistoryArchivePaths`: 1–2 private Phase32 **AES-256-GCM** original historical F&O archive files, one per exchange.

The CLI requires preexisting 0700 owner-private directories, 0600 file modes, `ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX` provisioned out of band to decrypt Phase32 archives and a separate existing 0700 nonce registry. It prints **only redacted** report status, reason codes, counts and nonce claim status. Do not store broker account, original ECN, transcript or private signing keys in GitHub, this chat, CI artifacts or PR descriptions.

Sample private manifest schema (placeholder paths only):

```json
{
  "schemaVersion": "ADAPTIVE_V2_PHASE34_PRIVATE_REVIEW_MANIFEST_V1",
  "privateOriginalPdfPath": "/private/ecn-original.pdf",
  "privateTranscribedAnnexurePath": "/private/ecn-manually-reviewed.json",
  "privateCrossExchangeScopePath": "/private/ecn-common-contract-scope.json",
  "privateExternalVerifierReceiptPath": "/private/external-pades-validator-claims.json",
  "privatePinnedTrustPolicyPath": "/private/independently-pinned-validator.json",
  "encryptedFoHistoryArchivePaths": [
    "/private/fo-nfo/history.private.aead.json",
    "/private/fo-bfo/history.private.aead.json"
  ]
}
```

```bash
# Only an authorized offline reviewer, after independently provisioning
# the phase32 archive AES key and ALL true third-party trust references.
npx tsx scripts/audit-adaptive-upstox-phase34-ecn.ts \
  --private-manifest /private/phase34-ecn-manifest-0600.json \
  --nonce-registry-dir /private/phase34-one-shot-nonces-0700
```

The PDF verifier itself must be an independently reviewed, securely operated tool/process and must independently validate the genuine ECN digital signature/chain/revocation/timestamp **and extract the actual PDF rows**, not merely mark them `PASS`. Neither service nor authorized certificate material has been supplied; no real PAdES verifier, broker ECN PDF or exchange trade dataset was run in this development. All signatures in CI are **synthetic Ed25519 validator keys over invented assertions**, *not* Upstox ECN signatures.

## Preserved blockers and release decision

Phase34 never promotes a signed local/external assertion into real native order history or production readiness. **Historical executions and even genuine signed ECNs are not proof that a native stop existed through 1–8-week positional holding, survived overnight, or would fill at a requested trigger price.** No independent exchange-confirmed order ACK, amendment/cancellation, GTT completion, account/static-IP attestation, original licensed options L1, independent OOS P&L, extreme gap/slippage, expiry calendar provenance, security approval or operator signoff exists here. Outstanding release issues **#17–#22 remain OPEN**.

Flags invariant in every report:

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
protectedOvernight=false
pdfDigitalSignatureVerifiedByThisCode=false
brokerEcNissuerIndependentlyVerified=false
nativeOrderInstruction=null
```

Legacy EMA23/50 **MIS intraday** strategy and 15:15 intraday exit are untouched. No positional **NRML** 15:15 automatic square-off, order placement/repair, scheduled polling, GTT modifications, margin/risk auto sizing or expiry liquidation are added. This Draft PR is stacked on Phase33 Draft PR #38 and remains unmerged.

**Next phase:** independent PDF verifier implementation/integration with trusted CA/CRL/OCSP timestamp and issuer provenance; separate exchange-level contract-note annexure auditing and genuine native order lifecycle evidence, never green-lighting NRML execution merely from passing tests.
