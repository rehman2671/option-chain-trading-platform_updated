/**
 * EMA15M Adaptive Swing v2 — RESEARCH ONLY (no order routing).
 * Uses closed underlying-index 15m candles to distinguish trend, chop,
 * volatility shocks and transitions. Thresholds are hypotheses, not optimized.
 */
export interface ClosedIndexCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  isClosed?: boolean;
}

export type AdaptiveRegime = 'INSUFFICIENT_DATA' | 'STALE_DATA' |
  'SIDEWAYS' | 'VOLATILE' | 'TREND_UP' | 'TREND_DOWN' | 'TRANSITION';
export type TrendDirection = 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN';

export interface AdaptiveRegimeReport {
  mode: 'RESEARCH_ONLY';
  regime: AdaptiveRegime;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  candidateSignal: 'CE' | 'PE' | 'NO_TRADE';
  reasonCodes: string[];
  latestCandleAt: string | null;
  candlesAnalyzed: number;
  hourlyBars: number;
  completedDailyBars: number;
  metrics: {
    atr14: number | null;
    efficiency20: number | null;
    ema23: number | null;
    ema50: number | null;
    hourlyTrend: TrendDirection;
    dailyTrend: TrendDirection;
    volatilityShock: boolean;
  };
}

const round = (n: number): number => Number(n.toFixed(4));
const unknownMetrics = () => ({
  atr14: null, efficiency20: null, ema23: null, ema50: null,
  hourlyTrend: 'UNKNOWN' as TrendDirection,
  dailyTrend: 'UNKNOWN' as TrendDirection, volatilityShock: false
});

function ema(values: number[], period: number): number {
  let value = values[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < values.length; i++) value += (values[i] - value) * k;
  return value;
}

function direction(values: number[], fast: number, slow: number): TrendDirection {
  if (values.length < slow + 3) return 'UNKNOWN';
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const tolerance = Math.max(0.00001, Math.abs(slowEma) * 0.00004);
  if (fastEma > slowEma + tolerance && values[values.length - 1] > fastEma) return 'UP';
  if (fastEma < slowEma - tolerance && values[values.length - 1] < fastEma) return 'DOWN';
  return 'FLAT';
}

function istSlot(utcTime: number): { day: string; slot: number } {
  const local = new Date(utcTime + 330 * 60_000);
  const day = local.toISOString().slice(0, 10);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { day, slot: (minutes - 555) / 15 };
}

/** Only aggregate four actual, consecutive 15m session slots as a complete 1h bar. */
function higherTimeframeCloses(candles: ClosedIndexCandle[]): {
  hourly: number[]; daily: number[];
} {
  const hours = new Map<string, Array<{ slot: number; close: number }>>();
  const days = new Map<string, Array<{ slot: number; close: number }>>();
  for (const c of candles) {
    const point = istSlot(Date.parse(c.timestamp));
    if (!Number.isInteger(point.slot) || point.slot < 0 || point.slot > 24) continue;
    const hourIndex = Math.floor(point.slot / 4);
    const hourKey = point.day + ':' + hourIndex;
    if (!hours.has(hourKey)) hours.set(hourKey, []);
    hours.get(hourKey)!.push({ slot: point.slot, close: c.close });
    if (!days.has(point.day)) days.set(point.day, []);
    days.get(point.day)!.push({ slot: point.slot, close: c.close });
  }
  const hourly: number[] = [];
  for (const rows of hours.values()) {
    if (rows.length !== 4) continue;
    const ordered = rows.slice().sort((a, b) => a.slot - b.slot);
    const first = Math.floor(ordered[0].slot / 4) * 4;
    if (ordered.every((v, i) => v.slot === first + i)) hourly.push(ordered[3].close);
  }
  const daily: number[] = [];
  for (const rows of days.values()) {
    const ordered = rows.slice().sort((a, b) => a.slot - b.slot);
    // Exclude any unfinished trading day, even when a partial series looks directional.
    if (ordered.length >= 24 && ordered[0].slot === 0 && ordered[ordered.length - 1].slot === 24) {
      daily.push(ordered[ordered.length - 1].close);
    }
  }
  return { hourly, daily };
}

export function analyzeAdaptiveRegime(
  candlesInput: ClosedIndexCandle[],
  asOf: Date = new Date()
): AdaptiveRegimeReport {
  const base: AdaptiveRegimeReport = {
    mode: 'RESEARCH_ONLY', regime: 'INSUFFICIENT_DATA',
    bias: 'NEUTRAL', candidateSignal: 'NO_TRADE',
    reasonCodes: [], latestCandleAt: null, candlesAnalyzed: 0,
    hourlyBars: 0, completedDailyBars: 0, metrics: unknownMetrics()
  };
  if (!Array.isArray(candlesInput) || !Number.isFinite(asOf.getTime())) {
    return { ...base, reasonCodes: ['INVALID_INPUT'] };
  }
  // Do not infer direction from a forming candle or non-finite OHLC.
  const rows = candlesInput.filter(c => {
    const ts = Date.parse(c?.timestamp);
    return Number.isFinite(ts) && c.isClosed !== false &&
      [c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) &&
      c.high >= Math.max(c.open, c.close, c.low) &&
      c.low <= Math.min(c.open, c.close, c.high);
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (rows.length < 100 || new Set(rows.map(c => c.timestamp)).size !== rows.length) {
    return { ...base, candlesAnalyzed: rows.length, reasonCodes: ['INSUFFICIENT_OR_DUPLICATE_CANDLES'] };
  }
  const latest = rows[rows.length - 1];
  const latestTime = Date.parse(latest.timestamp);
  const age = asOf.getTime() - latestTime;
  if (age < -60_000 || age > 72 * 60 * 60_000) {
    return { ...base, regime: 'STALE_DATA', latestCandleAt: latest.timestamp,
      candlesAnalyzed: rows.length, reasonCodes: ['STALE_OR_FUTURE_CANDLE'] };
  }
  const recent = rows.slice(-220);
  const closes = recent.map(c => c.close);
  const prevClose = recent.map((c, i) => i === 0 ? c.close : recent[i - 1].close);
  const trueRanges = recent.map((c, i) =>
    Math.max(c.high - c.low, Math.abs(c.high - prevClose[i]), Math.abs(c.low - prevClose[i]))
  );
  const atr = trueRanges.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const efficiencyWindow = closes.slice(-21);
  const movement = efficiencyWindow.slice(1).reduce(
    (sum, price, i) => sum + Math.abs(price - efficiencyWindow[i]), 0
  );
  const efficiency = movement > 0
    ? Math.abs(efficiencyWindow[20] - efficiencyWindow[0]) / movement : 0;
  const fast = ema(closes, 23);
  const slow = ema(closes, 50);
  const normalRange = trueRanges.slice(-50, -5).reduce((a, b) => a + b, 0) / 45;
  const fastRange = trueRanges.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const shock = normalRange > 0 &&
    (fastRange > normalRange * 2.2 || trueRanges[trueRanges.length - 1] > normalRange * 3.5);
  const higher = higherTimeframeCloses(rows.slice(-450));
  const hourlyTrend = direction(higher.hourly, 8, 21);
  const dailyTrend = direction(higher.daily, 3, 8);
  const bias = fast > slow ? 'BULLISH' : fast < slow ? 'BEARISH' : 'NEUTRAL';
  const spreadAtr = atr > 0 ? Math.abs(fast - slow) / atr : 0;
  const trendCandidate = efficiency >= 0.32 && spreadAtr >= 0.12 &&
    ((bias === 'BULLISH' && hourlyTrend === 'UP') ||
     (bias === 'BEARISH' && hourlyTrend === 'DOWN'));
  const dailyConflicts = (dailyTrend === 'UP' && bias === 'BEARISH') ||
    (dailyTrend === 'DOWN' && bias === 'BULLISH');
  const reasons: string[] = [];
  let regime: AdaptiveRegime;
  if (shock) { regime = 'VOLATILE'; reasons.push('VOLATILITY_SHOCK'); }
  else if (efficiency < 0.20) { regime = 'SIDEWAYS'; reasons.push('LOW_DIRECTIONAL_EFFICIENCY'); }
  else if (trendCandidate && !dailyConflicts) {
    regime = bias === 'BULLISH' ? 'TREND_UP' : 'TREND_DOWN';
    if (dailyTrend === 'UNKNOWN') reasons.push('DAILY_CONFIRMATION_UNAVAILABLE');
  } else {
    regime = 'TRANSITION';
    if (hourlyTrend === 'UNKNOWN') reasons.push('INSUFFICIENT_COMPLETED_1H_BARS');
    if (dailyConflicts) reasons.push('DAILY_TREND_CONFLICT');
    if (!trendCandidate) reasons.push('UNCONFIRMED_TREND');
  }
  return {
    ...base, regime, bias,
    candidateSignal: regime === 'TREND_UP' ? 'CE' :
      regime === 'TREND_DOWN' ? 'PE' : 'NO_TRADE',
    reasonCodes: reasons, latestCandleAt: latest.timestamp,
    candlesAnalyzed: rows.length, hourlyBars: higher.hourly.length,
    completedDailyBars: higher.daily.length,
    metrics: {
      atr14: round(atr), efficiency20: round(efficiency),
      ema23: round(fast), ema50: round(slow),
      hourlyTrend, dailyTrend, volatilityShock: shock
    }
  };
}
