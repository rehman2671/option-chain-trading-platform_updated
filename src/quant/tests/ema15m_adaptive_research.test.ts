import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAdaptiveRegime, type ClosedIndexCandle
} from '../../server/engine/ema15m/adaptiveMarketRegime.js';
import {
  chooseAdaptiveExpiries, rankAdaptiveOptions
} from '../../server/engine/ema15m/adaptiveOptionRanker.js';

const asOf = new Date('2026-11-15T06:00:00.000Z');
const key = 'NSE_INDEX|Nifty 50';
const instrument = 'NIFTY';

function candles(kind: 'UP' | 'DOWN' | 'SIDEWAYS' | 'SHOCK'): ClosedIndexCandle[] {
  const all: ClosedIndexCandle[] = [];
  let previous = 25000;
  for (let day = 0; day < 15; day++) {
    for (let slot = 0; slot < 25; slot++) {
      const i = day * 25 + slot;
      const close = kind === 'SIDEWAYS'
        ? 25000 + 24 * Math.sin(i * Math.PI / 2)
        : kind === 'DOWN' ? 25000 - i * 7
        : 25000 + i * 7;
      const extreme = kind === 'SHOCK' && i >= 370 ? 900 : 12;
      const stamp = new Date(Date.UTC(2026, 9, 20 + day, 3, 45 + slot * 15)).toISOString();
      all.push({ timestamp: stamp, open: previous,
        high: Math.max(previous, close) + extreme,
        low: Math.min(previous, close) - extreme,
        close, isClosed: true });
      previous = close;
    }
  }
  return all;
}
function reportAt(rows: ClosedIndexCandle[]) {
  const latest = Date.parse(rows[rows.length - 1].timestamp);
  return analyzeAdaptiveRegime(rows, new Date(latest + 15 * 60_000));
}

describe('EMA15M Adaptive Swing v2 market regime — research only', () => {
  it('qualifies persistent upward direction only when 1h trend agrees', () => {
    const report = reportAt(candles('UP'));
    assert.equal(report.mode, 'RESEARCH_ONLY');
    assert.equal(report.regime, 'TREND_UP');
    assert.equal(report.candidateSignal, 'CE');
    assert.equal(report.metrics.hourlyTrend, 'UP');
    assert.equal(report.metrics.dailyTrend, 'UP');
    assert.ok(report.hourlyBars >= 40);
    assert.ok(report.completedDailyBars >= 11);
  });
  it('distinguishes persistent downtrend from bullish CE research', () => {
    const report = reportAt(candles('DOWN'));
    assert.equal(report.regime, 'TREND_DOWN');
    assert.equal(report.candidateSignal, 'PE');
    assert.equal(report.metrics.hourlyTrend, 'DOWN');
  });
  it('does not issue a BUY research signal in choppy or shock regimes', () => {
    const chop = reportAt(candles('SIDEWAYS'));
    assert.equal(chop.candidateSignal, 'NO_TRADE');
    assert.ok(['SIDEWAYS', 'TRANSITION'].includes(chop.regime));
    const shock = reportAt(candles('SHOCK'));
    assert.equal(shock.regime, 'VOLATILE');
    assert.equal(shock.candidateSignal, 'NO_TRADE');
  });
  it('rejects stale data, insufficient data and forming candles', () => {
    const all = candles('UP');
    assert.equal(analyzeAdaptiveRegime(all.slice(0, 35), asOf).regime, 'INSUFFICIENT_DATA');
    assert.equal(analyzeAdaptiveRegime(all, new Date('2026-12-01T00:00:00Z')).regime, 'STALE_DATA');
    const baseline = reportAt(all);
    all.push({ ...all[all.length - 1], timestamp: '2026-12-01T10:00:00Z',
      close: 1000000, high: 1000000, isClosed: false });
    const after = reportAt(all.slice(0, -1));
    assert.equal(after.regime, baseline.regime);
  });
});

const expiries = ['2026-11-23', '2026-11-30', '2026-12-14', '2027-01-11'];
function listed() {
  return expiries.map((expiry, i) => ({
    underlying_symbol: instrument, underlying_key: key, segment: 'NSE_FO',
    instrument_type: 'CE', strike_price: 25000, expiry,
    instrument_key: 'NSE_FO|' + (70000 + i),
    trading_symbol: 'NIFTY 25000 CE ' + expiry,
    lot_size: 65, tick_size: 5
  }));
}
function chain() {
  return Object.fromEntries(expiries.map((expiry, i) => [expiry, [
    {
      expiry, underlying_key: key, underlying_spot_price: 25000,
      strike_price: 25000,
      call_options: {
        instrument_key: 'NSE_FO|' + (70000 + i),
        market_data: { bid_price: 199, ask_price: 200, bid_qty: 1000,
          ask_qty: 1000, volume: 20000, oi: 300000 },
        option_greeks: { delta: 0.59, theta: -4, iv: 18, gamma: 0.0001, vega: 5 }
      }
    }
  ]]));
}

describe('EMA15M Adaptive Swing v2 option ranking — research only', () => {
  it('matches four horizons to four ACTUALLY listed expiries', () => {
    const buckets = chooseAdaptiveExpiries(listed(), key, instrument, 'CE', asOf);
    assert.deepEqual(buckets.map(v => v.expiry), expiries);
  });
  it('ranks listed, broker-quoted, liquid CE contracts without order authorization', () => {
    const result = rankAdaptiveOptions({
      brokerContracts: listed(), chainByExpiry: chain(),
      underlyingKey: key, instrument, optionType: 'CE', spot: 25000, asOf
    });
    assert.equal(result.mode, 'RESEARCH_ONLY');
    assert.equal(result.executionAuthorized, false);
    assert.equal(result.snapshotAgeVerified, false);
    assert.deepEqual(result.options.map(v => v.status), ['RANKED','RANKED','RANKED','RANKED']);
    assert.equal(result.options[0].candidates[0].instrumentKey, 'NSE_FO|70000');
    assert.equal(result.options[0].candidates[0].oneLotAskNotional, 13000);
  });
  it('rejects fabricated instrument key, absent chain and wide spreads', () => {
    const invalidKey = listed().map(c => ({ ...c, instrument_key: 'NSE_FO|FAKE' }));
    const fake = rankAdaptiveOptions({
      brokerContracts: invalidKey, chainByExpiry: chain(),
      underlyingKey: key, instrument, optionType: 'CE', spot: 25000, asOf
    });
    assert.equal(fake.options[0].status, 'UNAVAILABLE');
    const missing = rankAdaptiveOptions({
      brokerContracts: listed(), chainByExpiry: {},
      underlyingKey: key, instrument, optionType: 'CE', spot: 25000, asOf
    });
    assert.equal(missing.options[0].status, 'UNVERIFIED_CHAIN');
    const wide = chain() as Record<string, any>;
    wide[expiries[0]][0].call_options.market_data.bid_price = 100;
    const spread = rankAdaptiveOptions({
      brokerContracts: listed(), chainByExpiry: wide,
      underlyingKey: key, instrument, optionType: 'CE', spot: 25000, asOf
    });
    assert.equal(spread.options[0].status, 'NO_LIQUID_CONTRACT');
  });
  it('respects one-lot premium budget, refuses opposite Delta sign', () => {
    const expensive = rankAdaptiveOptions({
      brokerContracts: listed(), chainByExpiry: chain(),
      underlyingKey: key, instrument, optionType: 'CE', spot: 25000, asOf,
      maxPremiumOutlay: 12000
    });
    assert.equal(expensive.options[0].status, 'NO_LIQUID_CONTRACT');
    const negative = chain() as Record<string, any>;
    negative[expiries[0]][0].call_options.option_greeks.delta = -0.59;
    const wrong = rankAdaptiveOptions({
      brokerContracts: listed(), chainByExpiry: negative,
      underlyingKey: key, instrument, optionType: 'CE', spot: 25000, asOf
    });
    assert.equal(wrong.options[0].status, 'NO_LIQUID_CONTRACT');
  });
});
