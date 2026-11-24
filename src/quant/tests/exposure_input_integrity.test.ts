import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposureController } from '../risk/exposureController.js';

const greeks = { netDelta: 10, netGamma: 0.005, netTheta: -100, netVega: 50 };
const capital = { totalCapital: 1000000, usedMargin: 0, dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0, peakCapital: 1000000, correlatedTradesCount: 0 };

test('explicit zero margin remains zero rather than synthetic exposure', () => {
  const result = exposureController.checkOrderGating('NIFTY', greeks, capital);
  assert.equal(result.passed, true);
  assert.equal(result.report?.capitalAtRisk, 0);
  assert.equal(result.report?.capitalAtRiskPct, 0);
});

test('malformed explicit risk inputs never pass numerical gate', () => {
  for (const netDelta of [NaN, Infinity, -Infinity]) {
    assert.equal(exposureController.checkOrderGating('NIFTY', { ...greeks, netDelta }, capital).passed, false);
  }
  for (const invalid of [
    {totalCapital: 0}, {totalCapital: NaN}, {usedMargin: -1}, {usedMargin: Infinity},
    {peakCapital: 0}, {dailyPnl: NaN}, {weeklyPnl: Infinity}, {monthlyPnl: NaN},
    {correlatedTradesCount: -1}, {correlatedTradesCount: 1.5},
  ]) {
    assert.equal(exposureController.checkOrderGating('NIFTY', greeks, { ...capital, ...invalid }).passed, false);
  }
  assert.equal(exposureController.checkOrderGating('NIFTY', { ...greeks, netDelta: 101 }, capital).passed, false);
});
