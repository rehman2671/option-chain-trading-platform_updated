/**
 * Read-only current-day order book recovery for missing ACK order IDs.
 * All broker calls are mocked; this file never dispatches real BUY/SELL.
 */
import { describe, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { dbEngine } from '../../server/db.js';
import { activeProvider } from '../../server/engine/providers/index.js';
import { brokerOrderReconciler } from '../../server/engine/ema15m/brokerOrderReconciler.js';
import { emaBrokerOrderTag } from '../../server/engine/ema15m/brokerOrderEvidence.js';

describe('EMA15M broker-accepted unknown-ACK recovery', () => {
  before(async () => { await dbEngine.initialize(); });

  it('recovers BUY and SELL IDs only when the current-day broker book proves a unique exact match', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const instrument = 'NSE_FO|34567';
    const attemptId = 'recover-buy-' + suffix;
    const positionId = 'recover-exit-' + suffix;
    const brokerBuyId = 'BUY' + Date.now();
    const brokerSellId = 'SELL' + Date.now();
    const buyTag = emaBrokerOrderTag('BUY', attemptId);
    const sellTag = emaBrokerOrderTag('SELL', positionId);

    dbEngine.saveEmaLiveOrderAttempt({
      id: attemptId, signalId: 'sig-' + suffix, executionMode: 'LIVE',
      instrument: 'NIFTY', brokerInstrumentKey: instrument,
      tradingsymbol: 'NIFTY-MOCK-CE', optionType: 'CE',
      strike: 25500, expiry: '2026-11-26',
      requestedQuantity: 10, filledQuantity: 0, orderStatus: 'UNKNOWN',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    const provider = activeProvider as any;
    const originalConnected = provider.isUpstoxLiveConnected;
    const originalBook = provider.getOrderBook;
    const originalHistory = provider.getOrderHistory;
    let book: any[] = [];
    provider.isUpstoxLiveConnected = () => true;
    provider.getOrderBook = async () => book;
    provider.getOrderHistory = async (id: string) =>
      id === brokerBuyId ? [{ order_id: id, status: 'COMPLETE', filled_quantity: 10, average_price: 125 }] :
      id === brokerSellId ? [{ order_id: id, status: 'COMPLETE', filled_quantity: 10, average_price: 135 }] : [];

    try {
      // A colliding label with the wrong contract/order side is not evidence.
      book = [{ tag: buyTag, order_id: 'WRONG', instrument_token: 'NSE_FO|0',
        transaction_type: 'BUY', quantity: 10 }];
      await brokerOrderReconciler.reconcileBrokerState();
      assert.equal(dbEngine.getEmaLiveOrderAttemptById(attemptId)?.orderStatus, 'UNKNOWN');
      assert.equal(dbEngine.getEmaLivePositionByAttemptId(attemptId), null);

      book = [{ tag: buyTag, order_id: brokerBuyId, instrument_token: instrument,
        transaction_type: 'BUY', quantity: 10 }];
      await brokerOrderReconciler.reconcileBrokerState();
      const attempt = dbEngine.getEmaLiveOrderAttemptById(attemptId);
      assert.equal(attempt?.brokerOrderId, brokerBuyId);
      assert.equal(attempt?.orderStatus, 'FILLED');
      const live = dbEngine.getEmaLivePositionByAttemptId(attemptId);
      assert.ok(live);
      assert.equal(live.quantity, 10);

      dbEngine.saveEmaLivePosition({
        ...live, id: positionId, attemptId: 'separate-exit-' + suffix,
        entryBrokerOrderId: 'KNOWN-BUY-' + suffix,
        status: 'EXIT_REQUESTED', exitBrokerOrderId: undefined,
        exitFilledQuantity: 0
      });
      book = [{ tag: sellTag, order_id: brokerSellId, instrument_token: instrument,
        transaction_type: 'SELL', quantity: 10 }];
      await brokerOrderReconciler.reconcileBrokerState();
      const updated = dbEngine.getOpenEmaLivePositions('NIFTY').find(p => p.id === positionId);
      assert.equal(updated, undefined, 'Confirmed full SELL removes position from active list');
      const closed = dbEngine.getEmaLivePositions('NIFTY', 'CLOSED', 200).find(p => p.id === positionId);
      assert.equal(closed?.exitBrokerOrderId, brokerSellId);
      assert.equal(closed?.exitFilledQuantity, 10);
      assert.equal(closed?.status, 'CLOSED');
    } finally {
      provider.isUpstoxLiveConnected = originalConnected;
      provider.getOrderBook = originalBook;
      provider.getOrderHistory = originalHistory;
    }
  });
});
