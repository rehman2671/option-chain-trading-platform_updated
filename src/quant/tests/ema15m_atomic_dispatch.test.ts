import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dbEngine } from '../../server/db.js';
import type { EmaLiveOrderAttempt, EmaLivePosition } from '../../server/engine/ema15m/types.js';

describe('EMA15M durable SQLite broker dispatch claims', () => {
  before(async () => { await dbEngine.initialize(); });

  it('atomically prevents duplicate BUY and SELL claims even without in-process locks', () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
    const attempt: EmaLiveOrderAttempt = {
      id: 'atomic-buy-' + suffix,
      signalId: 'atomic-sig-' + suffix,
      executionMode: 'LIVE',
      instrument: 'SENSEX',
      tradingsymbol: 'SENSEX-MOCK-CE',
      optionType: 'CE',
      strike: 85000, expiry: '2026-11-26',
      requestedQuantity: 20, filledQuantity: 0, orderStatus: 'SUBMITTED',
      brokerOrderId: 'MOCK-BUY-' + suffix,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    assert.equal(dbEngine.claimEmaLiveEntryAttempt(attempt), true);
    assert.equal(dbEngine.claimEmaLiveEntryAttempt({ ...attempt, id: attempt.id + '-duplicate' }), false);

    // Once a broker confirms the BUY is complete, its live position is durable.
    dbEngine.updateEmaLiveOrderAttempt(attempt.id, { orderStatus: 'FILLED', filledQuantity: 20, averageFillPrice: 120 });
    const position: EmaLivePosition = {
      id: 'atomic-pos-' + suffix, attemptId: attempt.id, signalId: attempt.signalId,
      instrument: 'SENSEX', tradingsymbol: attempt.tradingsymbol,
      optionType: 'CE', strikePrice: attempt.strike, expiryDate: attempt.expiry,
      productType: 'MIS', side: 'BUY', marketBias: 'BULLISH',
      entryBrokerOrderId: attempt.brokerOrderId!,
      entryTimestamp: new Date().toISOString(),
      entryPrice: 120, quantity: 20, lotSize: 20,
      currentPrice: 120, unrealizedPnl: 0,
      stopLoss: 90, targetPrice: 220,
      status: 'OPEN', grossPnl: 0, brokerage: 40, netPnl: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    dbEngine.saveEmaLivePosition(position);
    assert.equal(dbEngine.claimEmaLiveEntryAttempt({ ...attempt, id: attempt.id + '-later' }), false,
      'New BUY must not bypass durable open-position guard');
    assert.equal(dbEngine.claimEmaLiveExit(position.id), true);
    assert.equal(dbEngine.claimEmaLiveExit(position.id), false,
      'Exactly one worker may claim a real SELL exit');
    assert.equal(dbEngine.getEmaLivePositionByAttemptId(attempt.id)?.status, 'EXIT_REQUESTED');
  });
});
