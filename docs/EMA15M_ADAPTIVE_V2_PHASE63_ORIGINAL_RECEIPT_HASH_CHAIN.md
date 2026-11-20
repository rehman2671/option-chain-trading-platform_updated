# Adaptive Swing v2 Phase63 — complete claimed original strategy-side option L1 receipt hash-chain

**DRAFT / OFFLINE RESEARCH ONLY / stacked on Phase62. NO genuine source authenticity, strategy profitability, broker order, GTT/stop writer or forced positional 15:15 exit.**

## What this phase actually checks

Phase62 strictly reconciles a separately retained *native-format* option BID/ASK CSV against every Phase61 historical quote and mathematically validates two different role-separated Ed25519 signatures over its manifest. But both signing identities, source timestamps and original available-at fields can still be manufactured retrospectively by the same operator. Phase62 proves neither genuine vendor history nor that the strategy actually **received** market ticks before its OOS decisions.

Phase63 introduces a complete **claimed strategy-side receive-ledger** covering every single Phase62 source L1 quote, and a **third, separately pinned Ed25519 collector seal** over the entire chain. The audit cannot validate historical market truth; it can only determine that the **claimed** receive ledger is complete and internally consistent with the historical source. Code intentionally labels the successful result `DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY` and NEVER promotes owner-created evidence to real capture time or licensed vendor attestation.

## Exact offline data contract

`src/server/engine/ema15m/adaptivePhase63CaptureReceiptChain.ts`:

- Independently SHA256-pins the *entire original* Phase62 source and Phase62 independent pins, a complete claimed strategy-side receipt ledger's exact original bytes, a collector seal, the collector public key and detached signature bytes, full expected original option L1 receipt count, independent initial chain seed, independently prespecified final chain root, allowed event-to-receive lag and the named (still **untrusted**) collector.
- Re-runs Phase62 → Phase61 → Phase60 → Phase59 → Phase58 → Phase57 → Phase51 → Phase50 → Phase8 original out-of-sample source and complete held-decision denominator. The 3 strategy arms are comparisons, **not 3 executed positions**; all 1W, 2W, 4W and 8W option candidates, no-trade dates and missing quotes remain in the original sample.
- Every receipt binds its *original index*, original source record ID and source sequence, instrument key, exact original event timestamp, **claimed strategy `availableAt`**, SHA256 of the full original quote record (not merely one price field), prior hash-chain link, and deterministic current hash-chain link. The ledger must exactly match **every** original Phase61/Phase50 quote row and the Phase62 independent CSV; one missing, duplicated, reordered or amended record fails closed.
- Every claimed receipt requires recorded arrival **not earlier than the original event** and within the independently pinned maximum event-to-arrival lag. The exact claimed received timestamp must equal the Phase61 original `availableAt` value; arrival ordering must be nondecreasing within each instrument. This is an *internal anti-lookahead consistency* check, not a trusted live clock.
- The collector public key must be separate from the original Phase62 claimed publisher and claimed witness SPKI keys. The collector seal cryptographically binds the Phase62 original signed manifest SHA, original source CSV SHA, source quote ledger byte hash, initial seed, final hash-chain link, total original quote count, claimed collector identity and claimed seal-signing timestamp. The third signature uses a domain-separated genuine Ed25519 message.
- Reject wrong collector role/key, invalid detached signature, changed independent pins, stale or broken hash-chain links, malformed original receipt time, altered original quote, missing last record, wrong Phase62 CSV/custody identity and collector signing time earlier than the last *claimed* received quote.

The `phase63BuildClaimedReceiptLedger` helper generates a valid envelope from arbitrary original quoted records. This is **not** an authenticity feature. A malicious operator can generate the entire plausible ledger from a backtest later and sign it using three newly generated private keys. A chain is tamper evident **only after an independent trusted anchor already exists**; the present supplied root/pins do not establish that external anchor.

## Critical nonclaims

**Always false:** `contemporaneousReceiptClockIndependentlyAuthenticated`, `independentCollectorIdentityVerified`, `independentPublisherVendorIdentityVerified`, `independentlyLicensedHistoricalOptionL1Verified`, `originalNativeExchangeTransportAuthenticated`, `officialOptionContractExpirySessionCalendarVerified`, `independentlyTrustedReceiptTimeAuthorityVerified`, `originalMultiRegimeOosProfitableTradingProven`, `ivThetaOvernightGapCalibrationVerified`, `brokerNrmlNativeStopGttOvernightAcknowledged`, `historicalBestContractRankingAuthorized`, `executionAuthorized`, `productionSafe`. `nativeOrderInstruction=null`.

The chain cannot demonstrate executable BID fills, listed contract truth, official market sessions, theta/IV liquidity costs, profitable 1W/2W/4W/8W ranking, real stop protection, vendor licensing or genuinely historical receive time. Missing real market evidence remains a **release blocker**, never implicitly resolved by a green CI check.

## Synthetic regression tests

`src/quant/tests/ema15m_adaptive_phase63_strategy_capture_receipts.test.ts` contains 15 adversarial tests using the exact Phase62 two-OOS-day source with **three locally generated Ed25519 keypairs** and a self-created receipt ledger:

1. Every original quote bound to the chain, third mathematical signature valid, source authenticity permanently false.
2. Re-signed claimed receive time changed vs `availableAt` denied.
3. Altered source full BID/ASK quote hash denied.
4. Broken prior hash-chain link even after sign/pin refresh denied.
5. Dropped final option record fails the independently pinned final chain root before a shortened denominator can be accepted.
6. Duplicated ordinal cannot collapse original quotes.
7. Collector key reused as claimed publisher denied.
8. Collector signature bitflip after new SHA pin denied.
9. Signed collector seal with altered Phase62 source manifest denied.
10. Legitimate mathematical late signing remains only *operator-claimed*, not at-time proof.
11. Collector seal claimed before last original quote receipt rejected.
12. Post-hoc changed initial independently pinned chain seed rejected.
13. Removed original OOS fold day after all later repins rejected by original nested audits.
14. FLAT / GIVEBACK / GAP synthetic paths retain untrusted risk/profitability status.
15. The entire chain can be rebuilt from owner-provided original quotes: self-generated cryptography never proves a vendor or at-time market truth.

`.github/workflows/adaptive-phase63-capture-receipts.yml` tests TypeScript and all fifteen Phase63 invariants. Phase50–63 focused and complete three-job EMA targeted/build/full suites are separate **mandatory** release gates.

## Owner-private audit

`scripts/audit-adaptive-phase63-capture-receipts.ts` reads only two owner-0600 JSON files in 0700 private directories, never logs quotes, instruments, keys, accounts or raw data. Run under an **OS-level enforced no-network-egress environment**; the Node CLI itself does not create a sandbox.

```bash
npx tsx scripts/audit-adaptive-phase63-capture-receipts.ts \
  --approve-isolated-offline-review \
  --private-phase63-original-capture-chain /private/phase63-chain.json \
  --independent-phase63-source-and-seal-pins /private/phase63-pins.json
```

A successful process exit means only the supplied claim is internally consistent with its own previous source/custody; it is **not** a production or data-entitlement clearance.

## Requirements for any real market claims

Only genuine separately licensed original F&O option top-of-book data, independently verified vendor/exchange key registration and raw feed custody, trusted contemporaneous external capture/receipt clock or truly contemporaneous independently timestamped logs, official point-in-time contract/expiry calendars and untouched chronological multi-regime OOS history can address this source blocker. Independently validate original option premium paths, spread/depth/IV/theta, zero-recovery overnight gaps and actual broker-native NRML GTT/stop/cancel/replace acknowledgments.

Issues #17–#22, especially broker-native stop lifecycle #20, remain **OPEN**. Stacked research PRs remain **DRAFT/unmerged**. Existing EMA23/50 MIS intraday 15:15 square-off is unchanged; NRML positional 1W–8W never receives a forced 15:15 exit and has no enabled live broker/GTT/order writes.
