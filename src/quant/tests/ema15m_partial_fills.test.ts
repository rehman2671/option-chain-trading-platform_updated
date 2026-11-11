/**
 * No real exchange calls: all histories are injected fake Upstox responses.
 * Verifies cumulative partial BUY/SELL fills and idempotent restart polls.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dbEngine } from '../../server/db.js';
import { brokerOrderReconciler } from '../../server/engine/ema15m/brokerOrderReconciler.js';
import { activeProvider } from '../../server/engine/providers/index.js';

describe('EMA15M broker cumulative partial fill reconciliation', () => {
  before(async () => { await dbEngine.initialize(); });

  it('tracks a partial BUY, later additional fills, partial SELL, repeat polls and full close', async () => {
    const uid = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const attemptId = 'partial-entry-' + uid;
    const buyId = 'MOCK-BUY-' + uid;
    const sellId = 'MOCK-SELL-' + uid;
    dbEngine.saveEmaLiveOrderAttempt({
      id: attemptId, signalId: 'signal-' + uid, executionMode: 'LIVE',
      instrument: 'NIFTY', brokerInstrumentKey: 'NSE_FO|123456',
      tradingsymbol: 'NIFTY_TEST_CE', optionType: 'CE',
      strike: 25000, expiry: '2026-11-26', requestedQuantity: 10,
      filledQuantity: 0, orderStatus: 'SUBMITTED', brokerOrderId: buyId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });

    let buy = { status: 'open', filled_quantity: 4, average_price: 100 };
    let sell = { status: 'open', filled_quantity: 0, average_price: 0 };
    const provider = activeProvider as any;
    const savedConnected = provider.isUpstoxLiveConnected;
    const savedHistory = provider.getOrderHistory;
    provider.isUpstoxLiveConnected = () => true;
    provider.getOrderHistory = async (orderId: string) => {
      if (orderId === buyId) return [buy];
      if (orderId === sellId) return [sell];
      return [];
    };
    try {
      await brokerOrderReconciler.reconcileBrokerState();
      let position = dbEngine.getEmaLivePositionByAttemptId(attemptId);
      assert.ok(position, 'Partial BUY fill must create actual confirmed exposure');
      assert.equal(position.quantity, 4);
      assert.equal(position.entryPrice, 100);
      assert.equal(dbEngine.getEmaLiveOrderAttempts('NIFTY', 200).find(a => a.id === attemptId)?.orderStatus, 'PARTIALLY_FILLED');

      buy = { status: 'complete', filled_quantity: 10, average_price: 110 };
      await brokerOrderReconciler.reconcileBrokerState();
      position = dbEngine.getEmaLivePositionByAttemptId(attemptId);
      assert.equal(position?.quantity, 10);
      assert.equal(position?.entryPrice, 110);
      assert.equal(position?.stopLoss, 80);
      assert.equal(dbEngine.getEmaLiveOrderAttempts('NIFTY', 200).find(a => a.id === attemptId)?.orderStatus, 'FILLED');

      const posId = position!.id;
      dbEngine.updateEmaLivePosition(posId, { status: 'EXIT_PENDING', exitBrokerOrderId: sellId });
      sell = { status: 'open', filled_quantity: 3, average_price: 95 };
      await brokerOrderReconciler.reconcileBrokerState();

      position = dbEngine.getEmaLivePositionByAttemptId(attemptId);
      assert.equal(position?.status, 'PARTIALLY_CLOSED');
      assert.equal(position?.exitFilledQuantity, 3);
      assert.equal(position?.quantity, 10, 'Original acquired quantity must remain the cost basis');
      assert.equal(position?.grossPnl, -45);
      const netAfterPartial = position?.netPnl;
      await brokerOrderReconciler.reconcileBrokerState();
      position = dbEngine.getEmaLivePositionByAttemptId(attemptId);
      assert.equal(position?.exitFilledQuantity, 3);
      assert.equal(position?.netPnl, netAfterPartial, 'Repeated cumulative SELL poll must not double-count');

      sell = { status: 'complete', filled_quantity: 10, average_price: 120 };
      await brokerOrderReconciler.reconcileBrokerState();
      position = dbEngine.getEmaLivePositionByAttemptId(attemptId);
      assert.equal(position?.status, 'CLOSED');
      assert.equal(position?.exitFilledQuantity, 10);
      assert.equal(position?.grossPnl, 100);
      assert.equal(position?.netPnl, 60);
    } finally {
      provider.isUpstoxLiveConnected = savedConnected;
      provider.getOrderHistory = savedHistory;
    }
  });
});
