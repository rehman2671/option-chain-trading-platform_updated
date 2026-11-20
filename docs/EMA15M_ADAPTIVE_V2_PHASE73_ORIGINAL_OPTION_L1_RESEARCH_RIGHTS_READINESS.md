# Adaptive Swing v2 — Phase73 historical option L1 research rights and full-horizon source readiness

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase72 Draft PR #77.** No live broker API, NRML order, GTT, native stop, automatic contract/expiry ranking, or forced positional 15:15 exit.

## Why this phase

Phases66–72 verify that a new, independently SHA256-pinned candidate original option best BID/ASK Level-1 CSV and claimed exchange-like expiry/session/holiday source files are mechanically consistent. Phase71 verifies a detached Ed25519 signed original candidate holiday manifest; Phase72 reviews candidate issuer key rotation/revocation and separate claimed registrar/witness receipts. **All documents, private signing keys and pins can be invented by a single operator.** No phase has authenticated actual exchange-issued data or an original licensed F&O option-data supplier. Nor does a retrospective source download prove historical client receipt time.

Phase73 adds an **independently pinned operator-claimed original index-option historical research rights scope and acquisition receipt**. It rechecks the actual native L1 byte digest and original OOS denominators against those papers, and attaches the Phase69 full 1W/2W/4W/8W CE/PE market-data gap matrix. It keeps retrospective download date distinct from original strategy availableAt. It does **NOT verify legal rights** or independently acquire sources; actual vendor licence, authenticity and permission require genuine out-of-band publisher/legal verification.

## Offline algorithm

Source: src/server/engine/ema15m/adaptivePhase73HistoricalL1LicenceReadiness.ts
Entry point: auditPhase73HistoricalSourceReadiness(input,pins).

1. Require independently SHA256-pinned complete Phase72 input/pins (containing Phase71→Phase66 original separate historical L1 candidate, issuer-like market day/calendar and all original OOS contract universes), exact operator-custodied claimed licence grant **raw bytes**, exact operator-custodied archive acquisition receipt **raw bytes**, and exact original standalone-native L1 CSV bytes. Never substitute selected only/winner-only contracts.
2. Restrict claimed research grant to INDEX_OPTION_CE_PE_L1, exact best BID, ASK, displayed BID_QTY, ASK_QTY, and **offline historical research aggregate use ONLY**. Require claimed local raw record retention allowed, claimed redistribution forbidden and claimed live-order signal use forbidden. A grant that purports to be **legally authenticated** by these local documents is explicitly inadmissible to this unverified gate. This is a mechanical claimed scope check, not an interpretation of actual vendor terms.
3. Require owner-declared grant effective date ≤ retrospective archive-download receipt ≤ grant expiry; source archive claimed published time ≤ claimed receipt. Require claimed permitted historical period to span **from earliest original OOS decision through latest originally listed candidate expiry/last-tradable session**, including 1W, 2W, 4W and 8W options. Refuse claiming full historical holding coverage from a download that predates its own last original option expiry. These are claimed times only, not real source authenticity or legal contract validation.
4. Require archive acquisition receipt's claimed original native L1 bytes SHA256, all native quote row count, every original OOS decision date, original complete listed CE/PE decision-contract pair count and original NO_ENTRY day count to agree with already frozen Phase66 source. An operator can still forge all of them; disagreement rejects the intake package rather than allowing later statistical evaluation.
5. Re-run **Phase72 registrar/witness/issuer key lifecycle** and Phase69 original full-horizon calendar and closing-BID acquisition gap audit. Preserve four 1W/2W/4W/8W horizon cells with full source denominator, NO_ENTRY/ENTRY_CLAIMED option pairs, potential missing Monday–Friday candidate dates and missing/stale/low-depth original close BID quote rows. All originally listed options remain in the acquisition coverage denominator, but unentered/NO_ENTRY alternatives are NOT broker positions.
6. Even when a synthetic operator fabricates **a complete-looking daily best BID tape and all source calendars** and re-signs every fake issuer/registrar/witness file, status can only be DESCRIPTIVE_SELF_CLAIMED_RIGHTS_AND_FULL_DURATION_SOURCE_UNVERIFIED. All real market/issuer/license/trade authorization remains FALSE. Quote depth/availableAt are untrusted retrospectively exported source fields, not real broker purchase or sale fills.

## Result meanings

- INVALID_EVIDENCE: independent licence/acquisition/source byte pins modified, malformed or replaced.
- INCOMPLETE_EVIDENCE: claimed rights scope lacks best bid/ask or depth, explicitly permits live orders or redistribution, historical licence period cannot cover all original listed expiries, claimed retrospective archive receipt is out of permitted time window, original OOS/no-entry/contract/quote source count disagrees, or any Phase72/69 source audit fails.
- DESCRIPTIVE_CLAIMED_RIGHTS_SCOPE_MATCHES_BUT_DURATION_DATA_CENSORED: owner-supplied document scopes and original raw source bytes/counts agree internally, but original multiweek listed option data is still incomplete.
- DESCRIPTIVE_SELF_CLAIMED_RIGHTS_AND_FULL_DURATION_SOURCE_UNVERIFIED: all owner-reported source days and close BID marks appear consistent and rights claims cover the period, **but actual vendor licensing, historical option quotes, exchange calendar, original client receipt clock and statistical trading performance remain unverified**.

Hard FALSE: genuine legally authenticated grant; actual research/retention rights; independently verified official issuer, expiry or session master; real original historical index-option prices; genuine contemporaneous strategy-side quote availableAt; actual ASK-to-BID broker fills; real untouched multicycle market-regime OOS profitability; verified theta/IV/spread/slippage/overnight gap and paid debit loss; recommended best 1W–8W option/horizon; native broker NRML GTT/stop/child exchange ACK; productionSafe/executionAuthorized. nativeOrderInstruction=null.

**Economic boundary:** Long calls/puts can lose the **entire paid premium debit**, plus fees and costs. Option *premium* points are not NIFTY *underlying index* points; observed +50/+70 premium runup followed by giveback must not be invented as a successfully executed trailing exit. No quoted GTT or conditional stop guarantees overnight exchange execution.

## Synthetic adversarial tests

Test: src/quant/tests/ema15m_adaptive_phase73_historical_source_rights.test.ts — **20 cases**:

- Full original 448 option best L1 rows, 4 OOS decision days with 2 NO_ENTRY dates, 32 full listed 1W/2W/4W/8W CE/PE candidate pairs and owner-claimed fake vendor grant, resulting in insufficient full-horizon source data.
- Fake complete-day 1W–8W original best-BID source, fabricated calendars, fake re-signed issuer/registrar/witness signatures and rehashed newly invented archive/download receipt; still no real market source or rights, no profitable or executable strategy.
- Missing BID_QTY research rights, unsupported live-order rights, redistribution claimed allowed, false self-declaration of legally authenticated grant, source claimed client receipt authority contrary to retrospective nature.
- Grant scope ending before latest 8W expiry, claimed licence effective after archive receipt, claimed acquisition preceding publication, archive received before last original option expiry.
- Original CSV byte corruption, fake vendor acquisition checksum, altered original quote rows or NO_ENTRY count or original listed CE/PE denominator, changed Phase72 independent parent source, and an owner-renamed hypothetical vendor with new self-pins that remains unverified.

Dedicated CI: .github/workflows/adaptive-phase73-historical-source-rights.yml runs TypeScript and all 20 tests. Phase50–73 combined research CI, EMA targeted safety invariant tests, production build and full regression must pass separately. Synthetic CI is **not real historical NSE/BSE market PnL, source licensing or broker stop verification**.

## Owner-private command

The CLI accepts two separate owner-only 0600 JSON files in owner-only 0700 directories; **OS/container network egress MUST be blocked externally**. The script does not independently authenticate a publisher, lawyer or issuer, nor manage a live NRML order.

    npx tsx scripts/audit-adaptive-phase73-historical-source-rights.ts \
      --approve-isolated-offline-review \
      --private-phase73-historical-source-rights /private/phase73-owner-source.json \
      --independent-phase73-original-oos-pins /private/phase73-independent-pins.json

Only aggregate OOS/horizon source-gap counts, self-claimed scope state and permanent unverified/disabled trading flags are printed. No raw quote prices, original contract instruments, issuer documents, exact missing session dates, signatures, licence grant text or broker account credentials are output.

## Real data prerequisites and release blockers

Legally obtain a **genuine externally signed vendor licence/grant**, verify its precise option-series/strike/expiry/depth availability, historical retention/research permitted purposes and legal entity rights out of band; independently authenticate official point-in-time listed F&O contract expiry/lot, holidays, special weekends and sessions; obtain native original best BID/ASK plus displayed depth through every real 1W–8W option path, including losing/no-entry candidates; and use actual historical strategy client receipt time only if contemporaneously recorded. Historical archives acquired later **cannot retroactively prove historical client availability**.

Freeze genuine multi-cycle, untouched OOS train/test regimes, entry/exit/partial profit/trailing/expiry protocols and risk model before any performance assessment. Model option premium versus underlying points, theta/IV, spreads, gap nonfills, overnight slippage and full paid premium debit downside. Separately verify broker-native NRML stop/GTT placement/change/cancel/trigger/child exchange ACK, rejected/nonfilled orders and overnight persistence. Release blockers **#17–#22**, especially **#20**, remain OPEN; all stacked research PRs DRAFT/unmerged. EMA23/50 **MIS intraday 15:15 auto square-off unchanged**; NRML positional 1W–8W **no forced 15:15 exit, and NO live orders/GTT/native stop writer** in this phase.
