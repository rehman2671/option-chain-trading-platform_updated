import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareAdaptiveHistorical, type HistoricalComparisonInput } from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type { ClosedIndexCandle } from '../../server/engine/ema15m/adaptiveMarketRegime.js';

const DAY = 86_400_000;
const key = 'NSE_INDEX|Nifty 50';
const horizons = ['1W', '2W', '4W', '8W'] as const;
const offsets = [8, 15, 28, 56];

function historicalFixture(): HistoricalComparisonInput {
  const candles: ClosedIndexCandle[] = [];
  const decisions: HistoricalComparisonInput['decisions'] = [];
  const executionQuotes: HistoricalComparisonInput['executionQuotes'] = [];
  const expectedSessions: string[] = [];
  let previous = 25000;
  // All fixture prices/Greeks are SYNTHETIC; no real-world PnL inference.
  for (let day = 0; day < 13; day++) {
    const date = new Date(Date.UTC(2026, 8, day + 1));
    const sessionDate = date.toISOString().slice(0, 10);
    for (let slot = 0; slot < 25; slot++) {
      const stamp = new Date(date.getTime() + 225 * 60_000 + slot * 15 * 60_000);
      const close = previous + 6;
      candles.push({
        timestamp: stamp.toISOString(), open: previous,
        high: close + 4, low: previous - 4, close, isClosed: true
      });
      previous = close;
    }
    if (day < 7) continue; // sufficient warmup for EMA and complete 1h bars
    const decisionAt = new Date(date.getTime() + 390 * 60_000).toISOString(); // 12:00 IST
    const observedCandles = candles.filter(c => Date.parse(c.timestamp) + 900000 <= Date.parse(decisionAt));
    const spot = observedCandles[observedCandles.length - 1].close;
    const listedContracts = horizons.map((h, i) => {
      const expiry = new Date(date.getTime() + offsets[i] * DAY).toISOString().slice(0, 10);
      return {
        underlying_symbol: 'NIFTY', underlying_key: key, segment: 'NSE_FO',
        instrument_type: 'CE' as const, strike_price: Math.round(spot / 50) * 50,
        expiry, instrument_key: 'NSE_FO|' + (90000 + day * 4 + i),
        trading_symbol: 'FIXTURE_' + h + '_' + sessionDate,
        lot_size: 65, tick_size: 0.05
      };
    });
    const chains = listedContracts.map((contract) => ({
      expiry: contract.expiry,
      capturedAt: new Date(Date.parse(decisionAt) - 60_000).toISOString(),
      rows: [{
        expiry: contract.expiry, underlying_key: key,
        underlying_spot_price: spot, strike_price: contract.strike_price,
        call_options: {
          instrument_key: contract.instrument_key,
          market_data: { bid_price: 99, ask_price: 100, bid_qty: 200,
            ask_qty: 200, volume: 20000, oi: 300000 },
          option_greeks: { delta: 0.6, theta: -4, iv: 19 }
        }
      }]
    }));
    for (const contract of listedContracts) {
      // First executable quote is strictly AFTER the decision snapshot.
      executionQuotes.push({
        instrumentKey: contract.instrument_key,
        observedAt: new Date(Date.parse(decisionAt) + 60_000).toISOString(),
        bid: 101, ask: 102, bidQty: 130, askQty: 130
      });
      executionQuotes.push({
        instrumentKey: contract.instrument_key,
        observedAt: new Date(Date.parse(decisionAt) + DAY + 60_000).toISOString(),
        bid: 110, ask: 111, bidQty: 130, askQty: 130
      });
    }
    expectedSessions.push(sessionDate);
    decisions.push({
      sessionDate, decisionAt,
      candles: observedCandles,
      contractsCapturedAt: new Date(Date.parse(decisionAt) - 60_000).toISOString(),
      listedContracts, chains
    });
  }
  return {
    provenance: {
      datasetId: 'SYNTHETIC-TEST-ONLY', source: 'constructed fixture',
      calendarSource: 'constructed sessions', expectedSessions, synthetic: true
    },
    instrument: 'NIFTY', underlyingKey: key, decisions, executionQuotes,
    policy: {
      holdCalendarDays: { '1W': 1, '2W': 1, '4W': 1, '8W': 1 },
      slippageBpsPerSide: 10, feesAndTaxesINRPerSide: 5,
      maxSnapshotAgeMinutes: 5, maxEntryDelayMinutes: 10,
      maxExitDelayDays: 2, minCalendarDaysBeforeExpiry: 2,
      folds: [{
        trainStart: expectedSessions[0], trainEnd: expectedSessions[2],
        testStart: expectedSessions[3], testEnd: expectedSessions[5]
      }]
    }
  };
}

describe('Adaptive v2 historical comparisons cannot authorize execution', () => {
  it('compares three policies on identical out-of-sample decision sessions with ask/bid costs', () => {
    const report = compareAdaptiveHistorical(historicalFixture());
    assert.equal(report.mode, 'RESEARCH_ONLY');
    assert.equal(report.executionAuthorized, false);
    assert.equal(report.productionSafe, false);
    assert.equal(report.synthetic, true);
    assert.equal(report.status, 'DESCRIPTIVE_ONLY');
    assert.equal(report.folds[0].testingSessions, 3);
    const rows = report.folds[0].outOfSample;
    assert.equal(rows.length, 12);
    const baseline = rows.find(x => x.arm === 'EMA_BASELINE' && x.horizon === '1W')!;
    assert.equal(baseline.tradeCount, 2);
    assert.equal(baseline.unpricedEntries, 0);
    assert.equal(baseline.unpricedExits, 0);
    assert.equal(baseline.comparable, false); // only three examples, not 20+
    assert.equal(baseline.trades[0].netPnlINR, 496.22);
    assert.equal(baseline.trades[0].overnightGapIncluded, true);
    assert.ok(rows.find(x => x.arm === 'REGIME_AND_RANK' && x.horizon === '8W'));
  });

  it('fails closed if an EXIT bid/ask observation is missing', () => {
    const input = historicalFixture();
    const firstKey = input.decisions[3].listedContracts[0].instrument_key;
    input.executionQuotes = input.executionQuotes.filter(q =>
      q.instrumentKey !== firstKey || Date.parse(q.observedAt) <
        Date.parse(input.decisions[3].decisionAt) + DAY);
    const report = compareAdaptiveHistorical(input);
    assert.equal(report.status, 'INCOMPLETE_EVIDENCE');
    const m = report.folds[0].outOfSample.find(x =>
      x.arm === 'EMA_BASELINE' && x.horizon === '1W')!;
    assert.equal(m.unpricedExits, 1);
    assert.equal(m.comparable, false);
  });

  it('blocks future chain snapshots rather than looking ahead to entry data', () => {
    const input = historicalFixture();
    input.decisions[3].chains[0].capturedAt =
      new Date(Date.parse(input.decisions[3].decisionAt) + 1000).toISOString();
    const report = compareAdaptiveHistorical(input);
    assert.equal(report.status, 'INCOMPLETE_EVIDENCE');
    const m = report.folds[0].outOfSample.find(x =>
      x.arm === 'EMA_BASELINE' && x.horizon === '1W')!;
    assert.equal(m.unpricedEntries, 1);
  });

  it('rejects selected dates, leaking index candles, duplicate quotes and negative costs', () => {
    const missing = historicalFixture();
    missing.decisions.pop();
    assert.equal(compareAdaptiveHistorical(missing).status, 'INVALID_DATASET');
    const leak = historicalFixture();
    leak.decisions[0].candles.push({
      timestamp: new Date(Date.parse(leak.decisions[0].decisionAt) + DAY).toISOString(),
      open: 1, high: 2, low: 1, close: 2, isClosed: true
    });
    assert.equal(compareAdaptiveHistorical(leak).status, 'INVALID_DATASET');
    const repeated = historicalFixture();
    repeated.executionQuotes.push({ ...repeated.executionQuotes[0] });
    assert.ok(compareAdaptiveHistorical(repeated).errors.includes('DUPLICATED_EXECUTION_QUOTES'));
    const free = historicalFixture();
    free.policy.slippageBpsPerSide = -1;
    assert.equal(compareAdaptiveHistorical(free).status, 'INVALID_DATASET');
  });

  it('does not enter when the holding target crosses expiry safety buffer', () => {
    const input = historicalFixture();
    input.policy.holdCalendarDays['1W'] = 8;
    const report = compareAdaptiveHistorical(input);
    const m = report.folds[0].outOfSample.find(x =>
      x.arm === 'EMA_BASELINE' && x.horizon === '1W')!;
    assert.equal(m.tradeCount, 0);
    assert.equal(m.unavailableContract, 3);
  });
});
