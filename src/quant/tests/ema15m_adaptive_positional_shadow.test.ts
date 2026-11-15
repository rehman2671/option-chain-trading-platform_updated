import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAdaptivePositionalShadow, type ShadowPositionalPosition,
  type ShadowRiskObservation, type ShadowRiskPolicy } from
  '../../server/engine/ema15m/adaptivePositionalShadowPolicy.js';

const p: ShadowPositionalPosition = {
  positionId: 'shadow-1', productType: 'NRML', instrumentKey: 'NSE_FO|10001',
  expiry: '2026-12-15', quantity: 65, entryPrice: 200, originalStopPrice: 150,
  highWaterBid: 290, previousTrailingStop: 180
};
const o: ShadowRiskObservation = {
  asOf: '2026-12-01T07:00:00Z',
  bidObservedAt: '2026-12-01T06:59:00Z',
  bestBid: 260, optionAtr: 20,
  broker: {
    checkedAt: '2026-12-01T06:59:30Z',
    netLongQuantity: 65, netShortQuantity: 0,
    protection: 'ACTIVE_NATIVE_SELL', protectedQuantity: 65,
    nativeStopTrigger: 180
  }
};
const c: ShadowRiskPolicy = {
  maxEvidenceAgeMinutes: 5, minCalendarDaysBeforeExpiry: 2,
  trailActivationAtr: 1.2, trailDistanceAtr: 3,
  overnightGapStressPercent: 15, maximumStressedLossINR: 2500
};
const evalShadow = (position = p, observation = o, policy = c) =>
  evaluateAdaptivePositionalShadow(position, observation, policy);

describe('Adaptive positional shadow policy is NOT a broker order engine', () => {
  it('never authorizes an order and proposes only a monotonic option-premium trailing review', () => {
    const r = evalShadow();
    assert.equal(r.mode, 'SHADOW_ONLY');
    assert.equal(r.executionAuthorized, false);
    assert.equal(r.nativeOrderInstruction, null);
    assert.equal(r.recommendation, 'REVIEW_PROTECTION');
    assert.equal(r.proposedTrailingStop, 230);
    const strong = evalShadow({ ...p, previousTrailingStop: 240 });
    assert.equal(strong.proposedTrailingStop, null);
    assert.deepEqual(strong.reasons, ['EXISTING_PROTECTION_IS_STRONGER']);
  });
  it('fails closed on MIS, changed broker position and stale quote', () => {
    assert.equal(evalShadow({ ...p, productType: 'MIS' }).recommendation,
      'BLOCK_AND_RECONCILE');
    assert.equal(evalShadow(p, { ...o, broker: { ...o.broker!, netLongQuantity: 130 } })
      .recommendation, 'BLOCK_AND_RECONCILE');
    assert.equal(evalShadow(p, { ...o, bidObservedAt: '2026-12-01T06:30:00Z' })
      .recommendation, 'BLOCK_AND_RECONCILE');
  });
  it('refuses to assume absent or pending native broker stops are protective', () => {
    const missing = evalShadow(p, { ...o,
      broker: { ...o.broker!, protection: 'CANCEL_PENDING' } });
    assert.equal(missing.recommendation, 'REVIEW_PROTECTION');
    assert.equal(missing.proposedTrailingStop, null);
    const wrongQty = evalShadow(p, { ...o,
      broker: { ...o.broker!, protectedQuantity: 10 } });
    assert.equal(wrongQty.recommendation, 'REVIEW_PROTECTION');
  });
  it('escalates expiry and overnight gap stress even on an apparently profitable quote', () => {
    const expiry = evalShadow({ ...p, expiry: '2026-12-03' });
    assert.equal(expiry.recommendation, 'RAISE_EXIT_REVIEW');
    assert.ok(expiry.reasons.some(v => v.includes('EXPIRY')));
    const risk = evalShadow(p, o, { ...c, maximumStressedLossINR: 500 });
    assert.equal(risk.recommendation, 'RAISE_EXIT_REVIEW');
    assert.ok(risk.reasons.some(v => v.includes('GAP')));
  });
  it('does not auto-exit or claim exchange fills when bid gaps below protection', () => {
    const gapped = evalShadow(p, { ...o, bestBid: 149 });
    assert.equal(gapped.recommendation, 'RAISE_EXIT_REVIEW');
    assert.equal(gapped.nativeOrderInstruction, null);
    assert.equal(gapped.executionAuthorized, false);
  });
});
