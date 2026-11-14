/**
 * Fail-closed interlock for EMA15M real SELL dispatch.
 *
 * A second MARKET SELL is NOT allowed while any current-day SELL for the same
 * option contract is active, including exchange-native SL, SL-M, and GTT-
 * triggered orders after they appear in the regular order book.
 *
 * This guard cannot discover an untriggered GTT: broker-native protection
 * lifecycle must be persisted and explicitly reconciled before enabling GTT.
 */
export type BrokerSellInterlockResult =
  | { safe: true }
  | { safe: false; reason: string; blockerOrderId?: string };

const terminal = new Set([
  'cancelled', 'canceled', 'cancelled after market order',
  'rejected', 'complete'
]);

export function assessBrokerSellInterlock(
  orderBook: unknown,
  instrumentKey: string,
  product: 'MIS' | 'NRML'
): BrokerSellInterlockResult {
  const blocked = (reason: string, blockerOrderId?: string): BrokerSellInterlockResult =>
    ({ safe: false, reason, ...(blockerOrderId ? { blockerOrderId } : {}) });

  if (!instrumentKey || !['MIS', 'NRML'].includes(product))
    return blocked('Invalid instrument or product for live SELL verification');
  if (!Array.isArray(orderBook))
    return blocked('Live Upstox order book unavailable: cannot prove absence of another SELL');

  const code = product === 'MIS' ? 'I' : 'D';
  for (const row of orderBook) {
    if (!row || typeof row !== 'object')
      return blocked('Malformed broker order-book entry: cannot verify live SELL safety');
    const item = row as Record<string, unknown>;
    const side = String(item.transaction_type || '').toUpperCase();
    if (side !== 'SELL') {
      if (side === 'BUY') continue;
      return blocked('Broker order book contains an order with unknown transaction side');
    }
    const key = item.instrument_token;
    const orderProduct = item.product;
    if (typeof key !== 'string' || typeof orderProduct !== 'string')
      return blocked('Cannot verify instrument/product of a broker SELL order');
    if (key !== instrumentKey || orderProduct !== code) continue;

    const status = typeof item.status === 'string'
      ? item.status.toLowerCase().trim() : '';
    if (!status || !terminal.has(status)) {
      const orderId = typeof item.order_id === 'string' ? item.order_id : undefined;
      return blocked('An existing Upstox SELL order remains unresolved (' +
        (status || 'UNKNOWN') + '). Cancel and verify final broker state before another SELL.',
        orderId);
    }
  }
  return { safe: true };
}

/** Broker cancellation acceptance is not a terminal confirmation. */
export function isBrokerSellCancellationConfirmed(
  orderBook: unknown,
  orderId: string,
  instrumentKey: string
): boolean {
  if (!Array.isArray(orderBook) || !orderId || !instrumentKey) return false;
  const matches = orderBook.filter((row: any) =>
    row?.order_id === orderId && row?.instrument_token === instrumentKey &&
    String(row?.transaction_type || '').toUpperCase() === 'SELL'
  );
  return matches.length === 1 &&
    ['cancelled', 'canceled', 'cancelled after market order'].includes(
      String(matches[0].status || '').toLowerCase().trim()
    );
}
