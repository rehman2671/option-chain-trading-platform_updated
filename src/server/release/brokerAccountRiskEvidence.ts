import type { BrokerRiskSnapshot } from '../engine/ema15m/brokerRiskGate.js';
import { guardFullBrokerPositionRows } from '../engine/ema15m/adaptiveUpstoxNativeReadCardinalityGuard.js';

type Row = Record<string, unknown>;
const obj = (v: unknown): Row|null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : null;
/** Explicit decimal values only: null, empty strings, booleans and missing fields are not zero. */
export function brokerNumber(v: unknown): number|null {
  if (typeof v !== 'number' && !(typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v))) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function parseBrokerRiskResponse(funds: unknown, margin: unknown, portfolio: unknown,
  requestStartedAt: number, receivedAt: number): BrokerRiskSnapshot|null {
  if (!Number.isSafeInteger(requestStartedAt) || !Number.isSafeInteger(receivedAt) ||
      receivedAt < requestStartedAt || receivedAt-requestStartedAt > 15000) return null;
  const f=obj(funds), m=obj(margin), p=obj(portfolio);
  if (f?.status !== 'success' || m?.status !== 'success' || p?.status !== 'success' || !Array.isArray(p.data)) return null;
  const equity=obj(obj(f.data)?.equity);
  const availableMargin=brokerNumber(equity?.available_margin);
  const usedMargin=brokerNumber(equity?.used_margin);
  const requiredMargin=brokerNumber(obj(m.data)?.final_margin);
  if (availableMargin===null || availableMargin<0 || usedMargin===null || usedMargin<0 ||
      requiredMargin===null || requiredMargin<=0 || !Number.isFinite(availableMargin+usedMargin) || availableMargin+usedMargin<=0) return null;
  // Strict account-wide identity and cardinality check; normalize documented quantity
  // to net_quantity only when the two fields are not contradictory.
  const rows=guardFullBrokerPositionRows(p.data);
  if(!rows)return null;
  let portfolioPnl=0, activePositions=0;
  for (const raw of rows) {
    const pos=obj(raw);
    const pnl=brokerNumber(pos?.pnl), net=brokerNumber(pos?.net_quantity);
    if (pnl===null || net===null || !Number.isSafeInteger(net)) return null;
    portfolioPnl+=pnl;
    if(net!==0) activePositions++;
  }
  if (!Number.isFinite(portfolioPnl)) return null;
  // Conservative local request-start time, not an exchange timestamp or certified equity/NAV.
  return { source:'UPSTOX_LIVE',checkedAt:new Date(requestStartedAt).toISOString(),
    availableMargin,usedMargin,requiredMargin,portfolioPnl,activePositions };
}
