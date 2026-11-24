import type { StrategyLeg, BasketOrderRecord } from '../../types.js';

/** Containment gate. No environment flag can release these legacy live routes. */
export function legacyExecutionBlock(mode: unknown): string | null {
  if (mode === 'PAPER' || mode === 'SHADOW') return null;
  return mode === 'LIVE' ? 'LEGACY_LIVE_EXECUTION_QUARANTINED' : 'INVALID_EXECUTION_MODE';
}

export function validBasketLegs(legs: unknown): legs is StrategyLeg[] {
  if (!Array.isArray(legs) || legs.length < 1 || legs.length > 20) return false;
  const ids = new Set<string>();
  for (const l of legs) {
    if (!l || typeof l.id !== 'string' || !l.id || ids.has(l.id) ||
        !['BUY','SELL'].includes(l.action) || !['CE','PE'].includes(l.type) ||
        !Number.isFinite(l.strikePrice) || l.strikePrice <= 0 ||
        !Number.isSafeInteger(l.quantity) || l.quantity <= 0 ||
        !Number.isSafeInteger(l.lotSize) || l.lotSize <= 0 ||
        !Number.isSafeInteger(l.quantity*l.lotSize) ||
        !Number.isFinite(l.currentLtp) || l.currentLtp <= 0 ||
        typeof l.expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(l.expiry) ||
        (l.product !== undefined && !['MIS','NRML','I','D'].includes(l.product))) return false;
    ids.add(l.id);
  }
  return true;
}

/** Completion requires the full expected simulated fill set, not just a top-level flag. */
export function basketFullyFilled(basket: BasketOrderRecord, expected: StrategyLeg[]): boolean {
  if (!validBasketLegs(expected) || basket.status !== 'COMPLETED' ||
      basket.legs.length !== expected.length || basket.reconciliationStatus !== 'IN_SYNC') return false;
  return expected.every(l => {
    const matching = basket.legs.filter(x=>x.legId===l.id);
    const f = matching[0];
    return matching.length===1 && f.status==='FILLED' && f.action===l.action &&
      f.strikePrice===l.strikePrice && f.type===l.type &&
      f.requestedQty===l.quantity*l.lotSize && f.filledQty===f.requestedQty &&
      Number.isFinite(f.avgFillPrice) && f.avgFillPrice>0;
  });
}
