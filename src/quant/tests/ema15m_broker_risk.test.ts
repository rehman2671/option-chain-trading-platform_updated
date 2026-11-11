import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEmaBrokerRisk, type BrokerRiskSnapshot } from '../../server/engine/ema15m/brokerRiskGate.js';

describe('EMA15M live Upstox risk gate — broker-only source', () => {
  const now = Date.parse('2026-11-12T09:15:00.000Z');
  const good: BrokerRiskSnapshot = {
    source: 'UPSTOX_LIVE',
    checkedAt: new Date(now).toISOString(),
    availableMargin: 290000,
    usedMargin: 10000,
    requiredMargin: 1500,
    portfolioPnl: 0,
    activePositions: 0
  };
  it('accepts a fresh, valid one-lot long-option account snapshot', () => {
    assert.equal(evaluateEmaBrokerRisk(good, 5000, now).passed, true);
  });
  it('fails closed when broker source is absent or synthetic', () => {
    assert.equal(evaluateEmaBrokerRisk(null, 5000, now).passed, false);
    assert.equal(evaluateEmaBrokerRisk({ ...good, source: 'PRACTICE' as any }, 5000, now).passed, false);
  });
  it('rejects stale, future, missing and non-finite broker risk values', () => {
    assert.equal(evaluateEmaBrokerRisk({ ...good, checkedAt: new Date(now - 16000).toISOString() }, 5000, now).passed, false);
    assert.equal(evaluateEmaBrokerRisk({ ...good, checkedAt: new Date(now + 6000).toISOString() }, 5000, now).passed, false);
    assert.equal(evaluateEmaBrokerRisk({ ...good, availableMargin: Number.NaN }, 5000, now).passed, false);
  });
  it('blocks broker-confirmed insufficient margin even when PAPER is enabled independently', () => {
    assert.equal(evaluateEmaBrokerRisk({ ...good, availableMargin: 500 }, 5000, now).passed, false);
  });
  it('enforces real 2% per-trade and 20% total margin exposure', () => {
    assert.equal(evaluateEmaBrokerRisk({ ...good, requiredMargin: 8000 }, 5000, now).passed, false);
    assert.equal(evaluateEmaBrokerRisk({ ...good, usedMargin: 100000 }, 5000, now).passed, false);
  });
  it('enforces broker PnL daily breaker and max live positions', () => {
    assert.equal(evaluateEmaBrokerRisk({ ...good, portfolioPnl: -5200 }, 5000, now).passed, false);
    assert.equal(evaluateEmaBrokerRisk({ ...good, activePositions: 10 }, 5000, now).passed, false);
  });
});
