import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emaBrokerOrderTag, findUniqueBrokerOrderId, aggregateOrderTrades
} from '../../server/engine/ema15m/brokerOrderEvidence.js';

describe('EMA15M broker order identity and authoritative trade evidence', () => {
  it('generates stable, distinct, bounded BUY and SELL tags from durable IDs', () => {
    const a = emaBrokerOrderTag('BUY', 'att-hello-123');
    assert.equal(a, emaBrokerOrderTag('BUY', 'att-hello-123'));
    assert.notEqual(a, emaBrokerOrderTag('SELL', 'att-hello-123'));
    assert.notEqual(a, emaBrokerOrderTag('BUY', 'att-hello-124'));
    assert.ok(a.length <= 40);
  });

  it('recovers only one exact order from a current-session broker order book', () => {
    const tag = emaBrokerOrderTag('BUY', 'att-hello-123');
    const row = { order_id: '12345', tag, instrument_token: 'NSE_FO|1234', transaction_type: 'BUY', quantity: 50 };
    const expected = { tag, instrumentKey: 'NSE_FO|1234', transactionType: 'BUY' as const, requestedQuantity: 50 };
    assert.equal(findUniqueBrokerOrderId([row], expected), '12345');
    assert.equal(findUniqueBrokerOrderId([row, row], expected), null, 'ambiguous tag never matched');
    assert.equal(findUniqueBrokerOrderId([{ ...row, quantity: 25 }], expected), null);
    assert.equal(findUniqueBrokerOrderId([{ ...row, transaction_type: 'SELL' }], expected), null);
    assert.equal(findUniqueBrokerOrderId([{ ...row, instrument_token: 'NSE_FO|9999' }], expected), null);
    assert.equal(findUniqueBrokerOrderId([{ ...row, tag: 'ema15m_live' }], expected), null);
    assert.equal(findUniqueBrokerOrderId(null, expected), null);
  });

  it('aggregates unique exchange trades by quantity-weighted average price', () => {
    const trade = (id: string, qty: number, price: number) => ({
      trade_id: id, order_id: 'order-1', instrument_token: 'NSE_FO|1234',
      transaction_type: 'BUY', quantity: qty, average_price: price
    });
    const val = aggregateOrderTrades([trade('t1', 5, 100), trade('t2', 3, 110)], 'order-1', 'BUY', 'NSE_FO|1234');
    assert.equal(val?.filledQuantity, 8);
    assert.equal(val?.averagePrice, 103.75);
    assert.equal(aggregateOrderTrades([trade('t1', 5, 100), trade('t1', 5, 100)], 'order-1', 'BUY', 'NSE_FO|1234'), null);
    assert.equal(aggregateOrderTrades([trade('t1', 5, 100)], 'other-order', 'BUY', 'NSE_FO|1234'), null);
    assert.equal(aggregateOrderTrades([trade('t1', -1, 100)], 'order-1', 'BUY', 'NSE_FO|1234'), null);
    assert.equal(aggregateOrderTrades([], 'order-1', 'BUY', 'NSE_FO|1234'), null);
  });
});
