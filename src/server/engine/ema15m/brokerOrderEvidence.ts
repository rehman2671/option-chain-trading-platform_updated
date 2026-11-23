/**
 * Broker order identity and unambiguous CURRENT-SESSION recovery for EMA15M.
 * A submitted order's tag is deterministically derived from its durable ID,
 * allowing reconciliation when the broker accepted it but the HTTP response failed.
 *
 * Recovery NEVER infers an order from strike/time alone. Missing/ambiguous
 * evidence remains UNKNOWN and cannot authorize another BUY/SELL.
 */
import { createHash } from 'node:crypto';

export type EmaBrokerAction = 'BUY' | 'SELL';

export function emaBrokerOrderTag(action: EmaBrokerAction, durableId: string): string {
  if (!durableId || durableId.length > 256) throw new Error('Invalid durable EMA broker order ID');
  const prefix = action === 'BUY' ? 'ema15mb' : 'ema15ms';
  return prefix + createHash('sha256').update(durableId).digest('hex').slice(0,24);
}

export interface BrokerOrderIdentity {
  tag: string;
  instrumentKey: string;
  transactionType: EmaBrokerAction;
  requestedQuantity: number;
}

/** Returns a broker order ID ONLY when one exact order-book row matches all attributes. */
export function findUniqueBrokerOrderId(
  rows: unknown,
  expected: BrokerOrderIdentity
): string | null {
  if (!Array.isArray(rows) || typeof expected.tag !== 'string' ||
      !expected.instrumentKey || !Number.isInteger(expected.requestedQuantity) ||
      expected.requestedQuantity <= 0) return null;
  const matched = rows.filter((row: any) =>
    row && row.tag === expected.tag &&
    row.instrument_token === expected.instrumentKey &&
    String(row.transaction_type || '').toUpperCase() === expected.transactionType &&
    Number.isInteger(Number(row.quantity)) &&
    Number(row.quantity) === expected.requestedQuantity &&
    typeof row.order_id === 'string' && /^[a-zA-Z0-9-]+$/.test(row.order_id)
  );
  return matched.length === 1 ? matched[0].order_id : null;
}

/** Trade book is per exchange execution, unlike order history cumulative fills. */
export function aggregateOrderTrades(
  rows: unknown,
  orderId: string,
  action: EmaBrokerAction,
  instrumentKey: string
): { filledQuantity: number; averagePrice: number } | null {
  if (!Array.isArray(rows) || !orderId || !instrumentKey) return null;
  const seen = new Set<string>();
  let qty = 0;
  let value = 0;
  for (const trade of rows as any[]) {
    if (trade?.order_id !== orderId) return null;
    if (String(trade?.transaction_type || '').toUpperCase() !== action) return null;
    // Some Upstox trade endpoints expose the exchange's numeric token rather
    // than the full segment|instrument_key. Compare only full segment keys;
    // the order_id + BUY/SELL side are still required on every trade row.
    if (typeof trade.instrument_token === 'string' &&
        trade.instrument_token.includes('|') &&
        trade.instrument_token !== instrumentKey) return null;
    const tradeId = String(trade.trade_id || '');
    if (!tradeId || seen.has(tradeId)) return null;
    seen.add(tradeId);
    const q = Number(trade.quantity);
    const price = Number(trade.average_price);
    if (!Number.isInteger(q) || q <= 0 || !Number.isFinite(price) || price <= 0) return null;
    qty += q;
    value += q * price;
  }
  if (qty <= 0 || !Number.isFinite(value)) return null;
  return { filledQuantity: qty, averagePrice: value / qty };
}
