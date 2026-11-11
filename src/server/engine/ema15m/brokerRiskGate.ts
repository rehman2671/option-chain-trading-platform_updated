/**
 * Broker-authoritative EMA live BUY risk gate. Never infer usable funds from
 * PRACTICE fallback quotes or the quant engine's default ₹10 lakh portfolio.
 */
export interface BrokerRiskSnapshot {
  source: 'UPSTOX_LIVE';
  checkedAt: string;
  availableMargin: number;
  usedMargin: number;
  requiredMargin: number;
  portfolioPnl: number;
  activePositions: number;
}

export interface BrokerRiskDecision {
  passed: boolean;
  failureReason?: string;
}

const finiteNonnegative = (v: number): boolean => Number.isFinite(v) && v >= 0;

export function evaluateEmaBrokerRisk(
  snapshot: BrokerRiskSnapshot | null | undefined,
  maxDailyLossLimit: number,
  nowMs: number = Date.now()
): BrokerRiskDecision {
  const reject = (failureReason: string): BrokerRiskDecision => ({ passed: false, failureReason });
  if (!snapshot || snapshot.source !== 'UPSTOX_LIVE') {
    return reject('Broker account funds, positions, or order margin unavailable; LIVE BUY blocked.');
  }
  const stamp = Date.parse(snapshot.checkedAt);
  if (!Number.isFinite(stamp) || nowMs - stamp > 15_000 || stamp > nowMs + 5_000) {
    return reject('Broker account risk snapshot is stale or lacks verified timestamp.');
  }
  if (!finiteNonnegative(snapshot.availableMargin) ||
      !finiteNonnegative(snapshot.usedMargin) ||
      !Number.isFinite(snapshot.portfolioPnl) ||
      !Number.isInteger(snapshot.activePositions) || snapshot.activePositions < 0 ||
      !Number.isFinite(snapshot.requiredMargin) || snapshot.requiredMargin <= 0) {
    return reject('Broker account risk snapshot contains missing or invalid values.');
  }

  const accountCapital = snapshot.availableMargin + snapshot.usedMargin;
  if (!Number.isFinite(accountCapital) || accountCapital <= 0) {
    return reject('Broker account has no verified usable capital.');
  }
  if (snapshot.availableMargin < snapshot.requiredMargin) {
    return reject('Insufficient real Upstox available margin for this option order.');
  }
  if (snapshot.activePositions >= 10) {
    return reject('Maximum permitted real broker open positions reached.');
  }
  // Long-option paid premium is the trade's worst-case loss. Enforce existing
  // platform limits using actual broker funds, not synthetic Greeks/capital.
  if (snapshot.requiredMargin > accountCapital * 0.02) {
    return reject('Broker-quoted option premium exceeds 2% single-trade capital-at-risk limit.');
  }
  if (snapshot.usedMargin + snapshot.requiredMargin > accountCapital * 0.20) {
    return reject('Broker margin usage would exceed 20% account exposure cap.');
  }
  if (!Number.isFinite(maxDailyLossLimit) || maxDailyLossLimit <= 0) {
    return reject('EMA daily loss limit must be a positive, finite amount.');
  }
  const lossCap = Math.min(maxDailyLossLimit, accountCapital * 0.03);
  if (snapshot.portfolioPnl <= -lossCap) {
    return reject('Broker account portfolio loss reached daily loss circuit breaker.');
  }
  return { passed: true };
}
