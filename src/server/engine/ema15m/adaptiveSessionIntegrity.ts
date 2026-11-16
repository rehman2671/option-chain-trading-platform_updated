/**
 * Research-only, externally declared exchange-session window verifier.
 * No default trading hours: ordinary weekdays, holidays and special sessions
 * MUST come from an independent exchange/calendar source, never inferred from
 * the successful market captures. This verifies internal consistency only.
 */
import type { VendorSession, VendorExecutionL1 } from './adaptiveVendorIngestion.js';

export interface DeclaredTradingSession {
  /** Exchange session in Asia/Kolkata, YYYY-MM-DD. */
  sessionDate: string;
  openAt: string;
  closeAt: string;
  /** Source reference for the predeclared official/vendor calendar record. */
  sourceRecordId: string;
}

export interface ExchangeWindowAudit {
  mode: 'RESEARCH_ONLY';
  calendarIndependentlyAuthenticated: false;
  valid: boolean;
  errors: string[];
  declaredSessions: number;
  checkedCandles: number;
  checkedChains: number;
  checkedQuotes: number;
}

const istDay = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const timestamp = (s: unknown): number =>
  typeof s === 'string' && /^\d{4}-\d\d-\d\dT/.test(s) &&
  /(Z|[+-]\d\d:\d\d)$/.test(s) ? Date.parse(s) : NaN;
const dateIsValid = (s: unknown): boolean =>
  typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) &&
  Number.isFinite(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const add = (errors: string[], code: string): void => {
  if (!errors.includes(code)) errors.push(code);
};
const BAR_MS = 15 * 60_000;

/**
 * Checks that every original market-data observation lies within independently
 * declared exchange session windows. Calendar may contain warm-up dates and
 * later exit dates beyond the dates on which decisions are evaluated.
 *
 * Does NOT prove exchange hours, holidays or the authenticity of the supplied
 * calendar. Caller must separately review the original calendar source.
 */
export function auditAdaptiveExchangeWindows(input: {
  declaredSessions: DeclaredTradingSession[] | undefined;
  decisions: VendorSession[];
  optionQuotes: VendorExecutionL1[];
}): ExchangeWindowAudit {
  const errors: string[] = [];
  const windows = input?.declaredSessions;
  const base = {
    mode: 'RESEARCH_ONLY' as const,
    calendarIndependentlyAuthenticated: false as const,
    declaredSessions: Array.isArray(windows) ? windows.length : 0
  };
  if (!Array.isArray(windows) || !windows.length ||
      !Array.isArray(input?.decisions) || !Array.isArray(input?.optionQuotes)) {
    return { ...base, valid: false, errors: ['MISSING_DECLARED_EXCHANGE_WINDOWS'],
      checkedCandles: 0, checkedChains: 0, checkedQuotes: 0 };
  }
  const byDate = new Map<string, { open: number; close: number }>();
  let prior = '';
  for (const row of windows) {
    const open = timestamp(row?.openAt), close = timestamp(row?.closeAt);
    if (!row || !dateIsValid(row.sessionDate) ||
        typeof row.sourceRecordId !== 'string' || !row.sourceRecordId.trim() ||
        !Number.isFinite(open) || !Number.isFinite(close) ||
        close <= open || close - open > 24 * 3_600_000 ||
        istDay(open) !== row.sessionDate ||
        istDay(close) !== row.sessionDate ||
        row.sessionDate <= prior) {
      add(errors, 'INVALID_OR_UNSORTED_EXCHANGE_WINDOWS');
      continue;
    }
    byDate.set(row.sessionDate, { open, close });
    prior = row.sessionDate;
  }
  let checkedCandles = 0, checkedChains = 0, checkedQuotes = 0;
  const allowed = (s: string, kind: 'CANDLE' | 'CHAIN' | 'EXECUTION'): boolean => {
    const at = timestamp(s);
    if (!Number.isFinite(at)) {
      add(errors, 'INVALID_' + kind + '_EVENT_TIME');
      return false;
    }
    const window = byDate.get(istDay(at));
    if (!window || at < window.open || at > window.close ||
        (kind === 'CANDLE' && at + BAR_MS > window.close)) {
      add(errors, kind + '_OUTSIDE_DECLARED_EXCHANGE_WINDOW');
      return false;
    }
    return true;
  };
  for (const session of input.decisions) {
    if (!session || !dateIsValid(session.sessionDate) ||
        !allowed(session.decisionAt, 'CHAIN')) {
      add(errors, 'DECISION_OUTSIDE_DECLARED_EXCHANGE_WINDOW');
    }
    if (!session || !Array.isArray(session.underlyingCandles) ||
        !Array.isArray(session.chains)) {
      add(errors, 'INVALID_SESSION_OBSERVATIONS'); continue;
    }
    for (const candle of session.underlyingCandles) {
      checkedCandles++;
      allowed(candle?.timestamp, 'CANDLE');
    }
    for (const chain of session.chains) {
      checkedChains++;
      allowed(chain?.eventAt, 'CHAIN');
      allowed(chain?.availableAt, 'CHAIN');
    }
  }
  for (const quote of input.optionQuotes) {
    checkedQuotes++;
    allowed(quote?.eventAt, 'EXECUTION');
    allowed(quote?.availableAt, 'EXECUTION');
  }
  return { ...base, valid: errors.length === 0, errors,
    checkedCandles, checkedChains, checkedQuotes };
}
