/**
 * The order-history cumulative quantity is not trusted against contradictory
 * authoritative exchange trade executions. No real broker credentials/calls.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dbEngine } from '../../server/db.js';
import { brokerOrderReconciler } from '../../server/engine/ema15m/brokerOrderReconciler.js';
import { activeProvider } from '../../server/engine/providers/index.js';

describe('EMA15M broker order history vs trade-book disagreement', () => {
  before(async () => { await dbEngine.initialize(); });

  it('keeps an order unresolved on conflicting trades, then records only verified fill', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
    const attemptId = 'trade-proof-' + suffix;
    const orderId = 'MOCK' + Date.now();
    dbEngine.saveEmaLiveOrderAttempt({
      id: attemptId, signalId: 'sig-' + suffix, executionMode: 'LIVE',
      instrument: 'BANKNIFTY', brokerInstrumentKey: 'NSE_FO|12345',
      tradingsymbol: 'BANKNIFTY-TEST-CE', optionType: 'CE',
      strike: 54000, expiry: '2026-11-25', requestedQuantity: 10,
      filledQuantity: 0, orderStatus: 'SUBMITTED', brokerOrderId: orderId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });

    const provider = activeProvider as any;
    const oldConnected = provider.isUpstoxLiveConnected;
    const oldHistory = provider.getOrderHistory;
    const oldTrades = provider.getOrderTrades;
    let tradeQty = 8;
    provider.isUpstoxLiveConnected = () => true;
    provider.getOrderHistory = async (id: string) =>
      id === orderId ? [{ order_id: orderId, status: 'COMPLETE', filled_quantity: 10, average_price: 110 }] : [];
    provider.getOrderTrades = async (id: string) =>
      id === orderId ? [{
        order_id: id, trade_id: 'trade-' + suffix, instrument_token: '12345',
        transaction_type: 'BUY', quantity: tradeQty, average_price: 110
      }] : null;

    try {
      await brokerOrderReconciler.reconcileBrokerState();
      assert.equal(dbEngine.getEmaLivePositionByAttemptId(attemptId), null,
        'A contradictory trade book must not open a fictitious 10-unit position');
      assert.equal(dbEngine.getEmaLiveOrderAttemptById(attemptId)?.orderStatus, 'SUBMITTED');
      tradeQty = 10;
      await brokerOrderReconciler.reconcileBrokerState();
      assert.equal(dbEngine.getEmaLiveOrderAttemptById(attemptId)?.orderStatus, 'FILLED');
      const position = dbEngine.getEmaLivePositionByAttemptId(attemptId);
      assert.equal(position?.quantity, 10);
      assert.equal(position?.entryPrice, 110);
    } finally {
      provider.isUpstoxLiveConnected = oldConnected;
      provider.getOrderHistory = oldHistory;
      provider.getOrderTrades = oldTrades;
    }
  });
});
