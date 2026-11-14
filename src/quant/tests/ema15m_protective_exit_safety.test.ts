import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessBrokerSellInterlock, isBrokerSellCancellationConfirmed
} from '../../server/engine/ema15m/protectiveExitSafety.js';

describe('EMA15M broker-native SELL / protective stop interlock', () => {
  const key = 'NSE_FO|12345';
  const row = (status: string, orderId = '123456') => ({
    order_id: orderId, instrument_token: key, product: 'I',
    transaction_type: 'SELL', order_type: 'SL', status
  });

  it('fails closed when broker order book is unavailable or malformed', () => {
    assert.equal(assessBrokerSellInterlock(null, key, 'MIS').safe, false);
    assert.equal(assessBrokerSellInterlock([null], key, 'MIS').safe, false);
    assert.equal(assessBrokerSellInterlock([{ transaction_type: 'SELL', status: 'open' }], key, 'MIS').safe, false);
    assert.equal(assessBrokerSellInterlock([{ transaction_type: 'unknown' }], key, 'MIS').safe, false);
  });

  it('blocks duplicate MARKET SELL on active trigger, pending cancel or unconfirmed order', () => {
    for (const status of ['trigger pending', 'open', 'cancel pending', 'not cancelled', 'validation pending']) {
      const result = assessBrokerSellInterlock([row(status)], key, 'MIS');
      assert.equal(result.safe, false, 'Must block with order status: ' + status);
      assert.equal(result.safe ? undefined : result.blockerOrderId, '123456');
    }
  });

  it('does not treat broker cancellation request accepted as cancellation confirmed', () => {
    assert.equal(isBrokerSellCancellationConfirmed([row('cancel pending')], '123456', key), false);
    assert.equal(isBrokerSellCancellationConfirmed([row('not cancelled')], '123456', key), false);
    assert.equal(isBrokerSellCancellationConfirmed(null, '123456', key), false);
    assert.equal(isBrokerSellCancellationConfirmed([row('complete')], '123456', key), false);
  });

  it('requires exact exchange terminal cancelled status for confirmed cancellation', () => {
    assert.equal(isBrokerSellCancellationConfirmed([row('cancelled')], '123456', key), true);
    assert.equal(isBrokerSellCancellationConfirmed([row('cancelled', 'other')], '123456', key), false);
    assert.equal(isBrokerSellCancellationConfirmed([row('cancelled'), row('cancelled')], '123456', key), false);
    assert.equal(isBrokerSellCancellationConfirmed([{ ...row('cancelled'), instrument_token: 'NSE_FO|9' }], '123456', key), false);
  });

  it('permits clear book, unrelated instrument, cancelled/rejected/full SELL orders', () => {
    assert.equal(assessBrokerSellInterlock([], key, 'MIS').safe, true);
    assert.equal(assessBrokerSellInterlock([{ ...row('open'), instrument_token: 'NSE_FO|2' }], key, 'MIS').safe, true);
    for (const status of ['cancelled', 'rejected', 'complete']) {
      assert.equal(assessBrokerSellInterlock([row(status)], key, 'MIS').safe, true);
    }
    assert.equal(assessBrokerSellInterlock([{ ...row('open'), product: 'D' }], key, 'MIS').safe, true);
  });
});
