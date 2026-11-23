/**
 * Adaptive Swing positional design — SHADOW RISK POLICY ONLY.
 * No order router, persistence, broker API, or auto-activation. This is NOT
 * an NRML live execution state machine. A broker-authoritative lifecycle,
 * reconciled native stops/GTT and operator approval are still mandatory.
 */
export type PositionalShadowRecommendation =
  'HOLD_SHADOW' | 'REVIEW_PROTECTION' | 'RAISE_EXIT_REVIEW' | 'BLOCK_AND_RECONCILE';

export interface ShadowPositionalPosition {
  positionId: string;
  productType: 'MIS' | 'NRML' | 'UNKNOWN';
  instrumentKey: string;
  expiry: string; // YYYY-MM-DD; exchange trading calendar NOT inferred from this
  quantity: number;
  entryPrice: number;
  originalStopPrice: number;
  highWaterBid: number;
  previousTrailingStop?: number;
}
export interface ShadowBrokerEvidence {
  checkedAt: string;
  netLongQuantity: number;
  netShortQuantity: number;
  protection: 'ACTIVE_NATIVE_SELL' | 'ABSENT' | 'UNKNOWN' | 'CANCEL_PENDING';
  protectedQuantity: number;
  /** The broker-side trigger is just observed evidence, not a guaranteed fill. */
  nativeStopTrigger: number | null;
}
export interface ShadowRiskObservation {
  asOf: string;
  bidObservedAt: string;
  bestBid: number;
  /** Historical option-premium ATR, never underlying index points. */
  optionAtr: number;
  broker: ShadowBrokerEvidence | null;
}
export interface ShadowRiskPolicy {
  maxEvidenceAgeMinutes: number;
  minCalendarDaysBeforeExpiry: number;
  trailActivationAtr: number;
  trailDistanceAtr: number;
  overnightGapStressPercent: number;
  maximumStressedLossINR: number;
}
export interface ShadowRiskResult {
  mode: 'SHADOW_ONLY';
  executionAuthorized: false;
  nativeOrderInstruction: null;
  recommendation: PositionalShadowRecommendation;
  reasons: string[];
  proposedTrailingStop: number | null;
  stressfulGapLossINR: number | null;
  expiryCalendarDaysRemaining: number | null;
}

const DAY = 86_400_000;
const nowMs = (x: string) => Date.parse(x);
const valid = (n: number) => Number.isFinite(n);
function dateInIST(ms: number): string {
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
}
const error = (code: string, expiryCalendarDaysRemaining: number | null = null): ShadowRiskResult => ({
  mode: 'SHADOW_ONLY', executionAuthorized: false, nativeOrderInstruction: null,
  recommendation: 'BLOCK_AND_RECONCILE', reasons: [code],
  proposedTrailingStop: null, stressfulGapLossINR: null, expiryCalendarDaysRemaining
});

export function evaluateAdaptivePositionalShadow(
  p: ShadowPositionalPosition,
  o: ShadowRiskObservation,
  config: ShadowRiskPolicy
): ShadowRiskResult {
  if (!p || !o || !config || !valid(nowMs(o.asOf)) ||
      !p.positionId?.trim() || !p.instrumentKey?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(p.expiry) ||
      !valid(nowMs(p.expiry + 'T00:00:00Z')) ||
      !Number.isInteger(p.quantity) || p.quantity <= 0 ||
      ![p.entryPrice, p.originalStopPrice, p.highWaterBid].every(v => valid(v) && v > 0) ||
      (p.previousTrailingStop !== undefined &&
        (!valid(p.previousTrailingStop) || p.previousTrailingStop <= 0)) ||
      ![o.bestBid, o.optionAtr].every(v => valid(v) && v > 0) ||
      !valid(config.maxEvidenceAgeMinutes) || config.maxEvidenceAgeMinutes <= 0 ||
      config.maxEvidenceAgeMinutes > 60 ||
      !Number.isInteger(config.minCalendarDaysBeforeExpiry) ||
      config.minCalendarDaysBeforeExpiry < 1 ||
      !valid(config.trailActivationAtr) || config.trailActivationAtr <= 0 ||
      !valid(config.trailDistanceAtr) || config.trailDistanceAtr <= 0 ||
      !valid(config.overnightGapStressPercent) ||
      config.overnightGapStressPercent < 0 || config.overnightGapStressPercent > 100 ||
      !valid(config.maximumStressedLossINR) || config.maximumStressedLossINR <= 0)
    return error('INVALID_POSITION_RISK_INPUT');

  const asOf = nowMs(o.asOf);
  const days = Math.round((nowMs(p.expiry + 'T00:00:00Z') -
    nowMs(dateInIST(asOf) + 'T00:00:00Z')) / DAY);
  if (p.productType !== 'NRML') return error('NOT_VERIFIED_NRML_POSITION', days);
  const b = o.broker;
  if (!b || !valid(nowMs(b.checkedAt)) ||
      nowMs(b.checkedAt) > asOf ||
      asOf - nowMs(b.checkedAt) > config.maxEvidenceAgeMinutes * 60_000 ||
      !valid(b.netLongQuantity) || !valid(b.netShortQuantity) ||
      b.netLongQuantity !== p.quantity || b.netShortQuantity !== 0)
    return error('BROKER_NET_POSITION_UNVERIFIED_OR_MISMATCH', days);
  if (!valid(nowMs(o.bidObservedAt)) || nowMs(o.bidObservedAt) > asOf ||
      asOf - nowMs(o.bidObservedAt) > config.maxEvidenceAgeMinutes * 60_000)
    return error('OPTION_BID_NOT_FRESH', days);
  const stressedBid = Math.max(0, o.bestBid * (1 - config.overnightGapStressPercent / 100));
  const stressedLoss = Math.max(0, (p.entryPrice - stressedBid) * p.quantity);
  const base: ShadowRiskResult = {
    mode: 'SHADOW_ONLY', executionAuthorized: false, nativeOrderInstruction: null,
    recommendation: 'HOLD_SHADOW', reasons: [],
    proposedTrailingStop: null,
    stressfulGapLossINR: Number(stressedLoss.toFixed(2)),
    expiryCalendarDaysRemaining: days
  };
  // Explicitly do NOT assume an Upstox stop exists when the broker is ambiguous.
  if (b.protection !== 'ACTIVE_NATIVE_SELL' ||
      !Number.isInteger(b.protectedQuantity) || b.protectedQuantity !== p.quantity ||
      b.nativeStopTrigger === null || !valid(b.nativeStopTrigger) ||
      b.nativeStopTrigger <= 0)
    return { ...base, recommendation: 'REVIEW_PROTECTION',
      reasons: ['OVERNIGHT_NATIVE_PROTECTION_NOT_VERIFIED'] };
  if (days <= config.minCalendarDaysBeforeExpiry)
    return { ...base, recommendation: 'RAISE_EXIT_REVIEW',
      reasons: ['EXPIRY_APPROACHING_OR_PASSED_REVIEW_ONLY'] };
  if (stressedLoss > config.maximumStressedLossINR)
    return { ...base, recommendation: 'RAISE_EXIT_REVIEW',
      reasons: ['OVERNIGHT_GAP_STRESS_EXCEEDS_LIMIT'] };
  const existingStop = Math.max(p.originalStopPrice,
    p.previousTrailingStop ?? p.originalStopPrice, b.nativeStopTrigger);
  if (o.bestBid <= existingStop)
    return { ...base, recommendation: 'RAISE_EXIT_REVIEW',
      reasons: ['BID_AT_OR_BELOW_PROTECTIVE_THRESHOLD'] };
  if (p.highWaterBid < p.entryPrice + config.trailActivationAtr * o.optionAtr)
    return { ...base, reasons: ['TRAILING_NOT_YET_ACTIVE'] };

  // For LONG premium only: stop never goes down. A proposed update is not
  // broker acknowledged and MUST NOT be reflected as effective protection.
  const proposal = Math.max(existingStop, p.highWaterBid -
    config.trailDistanceAtr * o.optionAtr);
  if (proposal >= o.bestBid)
    return { ...base, recommendation: 'RAISE_EXIT_REVIEW',
      reasons: ['TRAILING_LEVEL_AT_OR_ABOVE_CURRENT_BID'] };
  if (proposal <= existingStop)
    return { ...base, reasons: ['EXISTING_PROTECTION_IS_STRONGER'] };
  return { ...base, recommendation: 'REVIEW_PROTECTION',
    proposedTrailingStop: Number(proposal.toFixed(2)),
    reasons: ['PROPOSE_NATIVE_STOP_UPDATE_WITH_CANCEL_REPLACE_INTERLOCK'] };
}
