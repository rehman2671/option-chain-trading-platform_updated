/**
 * Offline, point-in-time Adaptive v2 historical comparison. RESEARCH ONLY.
 * No broker imports, order API calls, execution permissions or invented fills.
 * Candles are START-timestamped 15m bars; decisionAt is after their close.
 */
import { analyzeAdaptiveRegime, type ClosedIndexCandle } from './adaptiveMarketRegime.js';
import { rankAdaptiveOptions, type HorizonBucket, type ListedOptionContract, type RankedOption } from './adaptiveOptionRanker.js';

export type HistoricalArm = 'EMA_BASELINE' | 'REGIME_FILTER' | 'REGIME_AND_RANK';
const ARMS: HistoricalArm[] = ['EMA_BASELINE', 'REGIME_FILTER', 'REGIME_AND_RANK'];
const HORIZONS: HorizonBucket[] = ['1W', '2W', '4W', '8W'];
const DAY = 86_400_000;

export interface DatedChainSnapshot {
  /** Timestamp when the original market snapshot was captured (not backfilled). */
  capturedAt: string;
  expiry: string;
  rows: unknown[];
}
export interface HistoricalDecision {
  sessionDate: string; // exchange-session date in IST, YYYY-MM-DD
  decisionAt: string; // ISO timestamp strictly after most recent 15m close
  candles: ClosedIndexCandle[];
  contractsCapturedAt: string;
  listedContracts: ListedOptionContract[]; // point-in-time instrument master
  chains: DatedChainSnapshot[];
}
export interface HistoricalExecutableQuote {
  observedAt: string;
  instrumentKey: string;
  bid: number; ask: number;
  bidQty: number; askQty: number;
}
export interface HistoricalFold {
  trainStart: string; trainEnd: string; testStart: string; testEnd: string;
}
export interface HistoricalComparisonInput {
  provenance: {
    datasetId: string;
    source: string;
    calendarSource: string;
    /** Declare all expected market session dates, not just days with winning signals. */
    expectedSessions: string[];
    synthetic: boolean;
  };
  instrument: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
  underlyingKey: string;
  decisions: HistoricalDecision[];
  executionQuotes: HistoricalExecutableQuote[];
  policy: {
    holdCalendarDays: Record<HorizonBucket, number>;
    slippageBpsPerSide: number;
    feesAndTaxesINRPerSide: number;
    maxSnapshotAgeMinutes: number;
    maxEntryDelayMinutes: number;
    maxExitDelayDays: number;
    minCalendarDaysBeforeExpiry: number;
    folds: HistoricalFold[];
  };
}

export interface HistoricalTrade {
  arm: HistoricalArm;
  horizon: HorizonBucket;
  decisionAt: string;
  instrumentKey: string;
  expiry: string;
  entryAt: string; exitAt: string;
  quantity: number;
  entryAsk: number; exitBid: number;
  netPnlINR: number;
  overnightGapIncluded: boolean;
}
export interface HistoricalArmMetrics {
  arm: HistoricalArm;
  horizon: HorizonBucket;
  signalsConsidered: number;
  filterSkipped: number;
  unavailableContract: number;
  unpricedEntries: number;
  unpricedExits: number;
  tradeCount: number;
  grossTurnoverINR: number;
  netPnlINR: number;
  expectancyINR: number | null;
  winRate: number | null;
  maxDrawdownINR: number;
  avgHoldingHours: number | null;
  /** Descriptive only. Missing price evidence blocks any performance comparison. */
  comparable: boolean;
  trades: HistoricalTrade[];
}

export interface HistoricalComparisonReport {
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  method: 'FIXED_POLICY_CHRONOLOGICAL_FOLDS_V1';
  /** Never a certification of profitability, even with complete market data. */
  productionSafe: false;
  datasetId: string;
  synthetic: boolean;
  status: 'INVALID_DATASET' | 'INCOMPLETE_EVIDENCE' | 'DESCRIPTIVE_ONLY';
  errors: string[];
  folds: Array<{
    window: HistoricalFold;
    trainingSessions: number;
    testingSessions: number;
    training: HistoricalArmMetrics[];
    outOfSample: HistoricalArmMetrics[];
    completePriceEvidence: boolean;
  }>;
}

const finite = (x: number) => Number.isFinite(x);
const dateKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const time = (s: string) => Date.parse(s);
const istDate = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const round = (n: number) => Number(n.toFixed(2));
const marketQuoteValid = (q: HistoricalExecutableQuote) =>
  finite(time(q.observedAt)) && typeof q.instrumentKey === 'string' &&
  q.instrumentKey.length > 0 && [q.bid, q.ask, q.bidQty, q.askQty].every(finite) &&
  q.bid > 0 && q.ask > q.bid && q.bidQty > 0 && q.askQty > 0;

function validate(input: HistoricalComparisonInput): string[] {
  const errors: string[] = [];
  if (!input || !input.provenance || !input.policy) return ['MISSING_DATASET_OR_POLICY'];
  const { provenance: p, policy: c } = input;
  if (!p.datasetId?.trim() || !p.source?.trim() || !p.calendarSource?.trim() ||
      typeof p.synthetic !== 'boolean') errors.push('MISSING_PROVENANCE');
  if (!['NIFTY','BANKNIFTY','SENSEX'].includes(input.instrument) ||
      !input.underlyingKey?.trim()) errors.push('INVALID_INSTRUMENT');
  const sessions = p.expectedSessions;
  if (!Array.isArray(sessions) || !sessions.length ||
      sessions.some(d => !dateKey(d)) ||
      new Set(sessions).size !== sessions.length ||
      sessions.some((d, i) => i > 0 && d <= sessions[i - 1])) errors.push('INVALID_SESSION_CALENDAR');
  if (!Array.isArray(input.decisions) || input.decisions.length !== sessions?.length ||
      input.decisions.some((d, i) => d.sessionDate !== sessions[i] ||
        !finite(time(d.decisionAt)) || istDate(time(d.decisionAt)) !== d.sessionDate ||
        !finite(time(d.contractsCapturedAt)) || time(d.contractsCapturedAt) > time(d.decisionAt) ||
        time(d.decisionAt) - time(d.contractsCapturedAt) > 30 * DAY ||
        !Array.isArray(d.listedContracts) || !Array.isArray(d.chains) ||
        !Array.isArray(d.candles) || d.candles.length < 100 ||
        d.candles.some((bar, j) => !finite(time(bar.timestamp)) || bar.isClosed === false ||
          ![bar.open, bar.high, bar.low, bar.close].every(v => finite(v) && v > 0) ||
          bar.high < Math.max(bar.open, bar.close, bar.low) ||
          bar.low > Math.min(bar.open, bar.close, bar.high) ||
          time(bar.timestamp) + 15 * 60_000 > time(d.decisionAt) ||
          (j > 0 && time(bar.timestamp) <= time(d.candles[j-1].timestamp))))) {
    errors.push('INCOMPLETE_OR_LOOKAHEAD_DECISION_HISTORY');
  }
  if (!Array.isArray(input.executionQuotes) ||
      input.executionQuotes.some(q => !marketQuoteValid(q))) errors.push('INVALID_EXECUTION_QUOTES');
  else {
    const id = input.executionQuotes.map(q => q.instrumentKey + ':' + q.observedAt);
    if (new Set(id).size !== id.length) errors.push('DUPLICATED_EXECUTION_QUOTES');
  }
  if (HORIZONS.some(h => !Number.isInteger(c.holdCalendarDays?.[h]) || c.holdCalendarDays[h] < 1) ||
      !finite(c.slippageBpsPerSide) || c.slippageBpsPerSide < 0 ||
      c.slippageBpsPerSide >= 10000 ||
      !finite(c.feesAndTaxesINRPerSide) || c.feesAndTaxesINRPerSide < 0 ||
      !finite(c.maxSnapshotAgeMinutes) || c.maxSnapshotAgeMinutes <= 0 || c.maxSnapshotAgeMinutes > 30 ||
      !finite(c.maxEntryDelayMinutes) || c.maxEntryDelayMinutes <= 0 || c.maxEntryDelayMinutes > 120 ||
      !finite(c.maxExitDelayDays) || c.maxExitDelayDays <= 0 || c.maxExitDelayDays > 7 ||
      !Number.isInteger(c.minCalendarDaysBeforeExpiry) || c.minCalendarDaysBeforeExpiry < 1)
    errors.push('INVALID_COST_OR_HOLD_POLICY');
  if (Array.isArray(c.folds) && c.folds.length && HORIZONS.every(h => Number.isInteger(c.holdCalendarDays?.[h]))) {
    const embargoMs = (Math.max(...HORIZONS.map(h => c.holdCalendarDays[h])) +
      c.maxExitDelayDays) * DAY;
    if (c.folds.some(f => dateKey(f.trainEnd) && dateKey(f.testStart) &&
        time(f.trainEnd + 'T00:00:00Z') + embargoMs >=
        time(f.testStart + 'T00:00:00Z')))
      errors.push('TRAIN_TEST_EMBARGO_INSUFFICIENT_FOR_HOLD_AND_EXIT');
  }
  if (!Array.isArray(c.folds) || !c.folds.length ||
      c.folds.some((f, i) => ![f.trainStart, f.trainEnd, f.testStart, f.testEnd].every(dateKey) ||
        f.trainStart > f.trainEnd || f.trainEnd >= f.testStart || f.testStart > f.testEnd ||
        (i > 0 && f.testStart <= c.folds[i - 1].testEnd)))
    errors.push('INVALID_OR_OVERLAPPING_CHRONOLOGICAL_FOLDS');
  return errors;
}

function metrics(arm: HistoricalArm, horizon: HorizonBucket): HistoricalArmMetrics {
  return { arm, horizon, signalsConsidered: 0, filterSkipped: 0,
    unavailableContract: 0, unpricedEntries: 0, unpricedExits: 0,
    tradeCount: 0, grossTurnoverINR: 0, netPnlINR: 0, expectancyINR: null,
    winRate: null, maxDrawdownINR: 0, avgHoldingHours: null, comparable: false,
    trades: [] };
}

function selectChain(decision: HistoricalDecision, expiry: string, maxAgeMs: number): unknown {
  const matching = decision.chains.filter(q => q.expiry === expiry &&
    finite(time(q.capturedAt)) && time(q.capturedAt) <= time(decision.decisionAt) &&
    time(decision.decisionAt) - time(q.capturedAt) <= maxAgeMs &&
    Array.isArray(q.rows)).sort((a, b) => time(b.capturedAt) - time(a.capturedAt));
  return matching[0]?.rows ?? null;
}

function firstQuote(quotes: HistoricalExecutableQuote[], key: string, lower: number, upper: number,
  quantity: number, strictLower: boolean): HistoricalExecutableQuote | null {
  return quotes.find(q => q.instrumentKey === key &&
    (strictLower ? time(q.observedAt) > lower : time(q.observedAt) >= lower) &&
    time(q.observedAt) <= upper && q.askQty >= quantity && q.bidQty >= quantity) ?? null;
}

function evaluatePeriod(input: HistoricalComparisonInput, start: string, end: string):
HistoricalArmMetrics[] {
  const result = ARMS.flatMap(arm => HORIZONS.map(h => metrics(arm, h)));
  const quotes = input.executionQuotes.slice().sort((a, b) => time(a.observedAt) - time(b.observedAt));
  const eligibleAgain = new Map<string, number>();
  const c = input.policy;
  for (const d of input.decisions) {
    if (d.sessionDate < start || d.sessionDate > end) continue;
    const at = time(d.decisionAt);
    const report = analyzeAdaptiveRegime(d.candles, new Date(at));
    const lastCandle = d.candles[d.candles.length - 1];
    if (report.regime === 'INSUFFICIENT_DATA' || report.regime === 'STALE_DATA') {
      // A non-usable underlying history is not a profitable/losing entry.
      for (const m of result) m.unpricedEntries++;
      continue;
    }
    const side = report.bias === 'BULLISH' ? 'CE' : report.bias === 'BEARISH' ? 'PE' : null;
    if (!side) continue;
    const expiries = [...new Set(d.listedContracts.map(v => v.expiry))];
    const chainByExpiry: Record<string, unknown> = {};
    for (const expiry of expiries) chainByExpiry[expiry] =
      selectChain(d, expiry, c.maxSnapshotAgeMinutes * 60_000);
    const ranked = rankAdaptiveOptions({
      brokerContracts: d.listedContracts, chainByExpiry,
      underlyingKey: input.underlyingKey, instrument: input.instrument,
      optionType: side, spot: lastCandle.close, asOf: new Date(at)
    });
    const qualifies = report.candidateSignal === side;
    for (const m of result) {
      const group = m.arm + ':' + m.horizon;
      if ((eligibleAgain.get(group) ?? -Infinity) > at) continue;
      m.signalsConsidered++;
      if (m.arm !== 'EMA_BASELINE' && !qualifies) { m.filterSkipped++; continue; }
      const bucket = ranked.options.find(o => o.horizon === m.horizon);
      if (!bucket || bucket.status !== 'RANKED') {
        if (bucket?.status === 'UNVERIFIED_CHAIN') m.unpricedEntries++;
        else m.unavailableContract++;
        continue;
      }
      const candidate: RankedOption | undefined = m.arm === 'REGIME_AND_RANK'
        ? bucket.candidates[0]
        : bucket.candidates.slice().sort((a, b) =>
          Math.abs(a.strike - lastCandle.close) - Math.abs(b.strike - lastCandle.close) ||
          a.ask - b.ask)[0];
      if (!candidate) { m.unavailableContract++; continue; }
      // Hold exit MUST precede the explicit pre-expiry buffer; do not invent a rollover.
      const target = at + c.holdCalendarDays[m.horizon] * DAY;
      const expiryMidnight = time(candidate.expiry + 'T00:00:00Z');
      if (target + c.minCalendarDaysBeforeExpiry * DAY >= expiryMidnight) {
        m.unavailableContract++;
        continue;
      }
      const buy = firstQuote(quotes, candidate.instrumentKey, at,
        at + c.maxEntryDelayMinutes * 60_000, candidate.lotSize, true);
      if (!buy) { m.unpricedEntries++; continue; }
      const exit = firstQuote(quotes, candidate.instrumentKey, target,
        Math.min(target + c.maxExitDelayDays * DAY,
          expiryMidnight - c.minCalendarDaysBeforeExpiry * DAY),
        candidate.lotSize, false);
      if (!exit) { m.unpricedExits++; eligibleAgain.set(group, Infinity); continue; }
      const slip = c.slippageBpsPerSide / 10_000;
      const net = ((exit.bid * (1 - slip)) - (buy.ask * (1 + slip))) *
        candidate.lotSize - 2 * c.feesAndTaxesINRPerSide;
      const trade: HistoricalTrade = {
        arm: m.arm, horizon: m.horizon, decisionAt: d.decisionAt,
        instrumentKey: candidate.instrumentKey, expiry: candidate.expiry,
        entryAt: buy.observedAt, exitAt: exit.observedAt, quantity: candidate.lotSize,
        entryAsk: buy.ask, exitBid: exit.bid, netPnlINR: round(net),
        overnightGapIncluded: istDate(time(buy.observedAt)) !== istDate(time(exit.observedAt))
      };
      m.trades.push(trade);
      eligibleAgain.set(group, time(exit.observedAt));
    }
  }
  for (const m of result) {
    m.trades.sort((a, b) => time(a.exitAt) - time(b.exitAt));
    m.tradeCount = m.trades.length;
    m.netPnlINR = round(m.trades.reduce((s, t) => s + t.netPnlINR, 0));
    m.grossTurnoverINR = round(m.trades.reduce((s, t) =>
      s + (t.entryAsk + t.exitBid) * t.quantity, 0));
    if (m.tradeCount) {
      m.expectancyINR = round(m.netPnlINR / m.tradeCount);
      m.winRate = round(m.trades.filter(t => t.netPnlINR > 0).length / m.tradeCount * 100);
      m.avgHoldingHours = round(m.trades.reduce((s, t) =>
        s + (time(t.exitAt) - time(t.entryAt)) / 3_600_000, 0) / m.tradeCount);
    }
    let equity = 0, peak = 0, drawdown = 0;
    for (const t of m.trades) {
      equity += t.netPnlINR;
      peak = Math.max(peak, equity);
      drawdown = Math.max(drawdown, peak - equity);
    }
    m.maxDrawdownINR = round(drawdown);
    // 20 closed trades is a MINIMUM descriptive comparison sample, NOT proof.
    m.comparable = m.tradeCount >= 20 &&
      m.unpricedEntries === 0 && m.unpricedExits === 0;
  }
  return result;
}

export function compareAdaptiveHistorical(input: HistoricalComparisonInput): HistoricalComparisonReport {
  const errors = validate(input);
  const base: HistoricalComparisonReport = {
    mode: 'RESEARCH_ONLY', executionAuthorized: false,
    method: 'FIXED_POLICY_CHRONOLOGICAL_FOLDS_V1', productionSafe: false,
    datasetId: input?.provenance?.datasetId ?? 'INVALID',
    synthetic: input?.provenance?.synthetic ?? true,
    status: 'INVALID_DATASET', errors, folds: []
  };
  if (errors.length) return base;
  const folds = input.policy.folds.map(window => {
    const training = evaluatePeriod(input, window.trainStart, window.trainEnd);
    const outOfSample = evaluatePeriod(input, window.testStart, window.testEnd);
    const completePriceEvidence = [...training, ...outOfSample]
      .every(m => m.unpricedEntries === 0 && m.unpricedExits === 0);
    return {
      window,
      trainingSessions: input.decisions.filter(d =>
        d.sessionDate >= window.trainStart && d.sessionDate <= window.trainEnd).length,
      testingSessions: input.decisions.filter(d =>
        d.sessionDate >= window.testStart && d.sessionDate <= window.testEnd).length,
      training, outOfSample, completePriceEvidence
    };
  });
  const allComplete = folds.every(f => f.completePriceEvidence);
  return { ...base, folds,
    status: allComplete ? 'DESCRIPTIVE_ONLY' : 'INCOMPLETE_EVIDENCE', errors: [] };
}
