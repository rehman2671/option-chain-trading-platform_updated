/**
 * Offline audit of explicitly captured REST evidence against an externally
 * sourced exchange calendar. No session dates or missing bars are synthesized.
 * Even perfect REST receipt coverage cannot prove historical L1 event freshness.
 */
import { verifyAdaptiveCapture, type AdaptiveCaptureRecord,
  type CaptureInstrument } from './adaptiveEvidenceCapture.js';
import type { HorizonBucket } from './adaptiveOptionRanker.js';

const HORIZONS: HorizonBucket[] = ['1W', '2W', '4W', '8W'];
const istDay = (time: string): string =>
  new Date(Date.parse(time) + 330 * 60_000).toISOString().slice(0, 10);
const validDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) &&
  Number.isFinite(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

export interface AdaptiveEvidenceAudit {
  mode: 'RESEARCH_ONLY';
  historicalComparisonAuthorized: false;
  executionAuthorized: false;
  status: 'INVALID_AUDIT_INPUT' | 'COLLECTION_GAPS' | 'CAPTURED_BUT_UNVERIFIED_EVENT_TIME';
  calendarSource: string;
  instrument: CaptureInstrument;
  expectedSessions: number;
  actualCapturedSessions: number;
  missingSessions: string[];
  underSampledSessions: string[];
  duplicateCaptureTimes: string[];
  corruptedRecords: number[];
  testOnlyRecords: number[];
  capturedByHorizon: Record<HorizonBucket, number>;
  warnings: string[];
}

export function auditAdaptiveEvidence(input: {
  instrument: CaptureInstrument;
  calendarSource: string;
  expectedSessionDates: string[];
  /** Explicit expected number of intraday snapshots per exchange session. */
  minimumCapturesPerSession: number;
  records: AdaptiveCaptureRecord[];
}): AdaptiveEvidenceAudit {
  const base: AdaptiveEvidenceAudit = {
    mode: 'RESEARCH_ONLY', historicalComparisonAuthorized: false,
    executionAuthorized: false, status: 'INVALID_AUDIT_INPUT',
    instrument: input?.instrument, calendarSource: input?.calendarSource ?? '',
    expectedSessions: 0, actualCapturedSessions: 0,
    missingSessions: [], underSampledSessions: [],
    duplicateCaptureTimes: [], corruptedRecords: [], testOnlyRecords: [],
    capturedByHorizon: { '1W': 0, '2W': 0, '4W': 0, '8W': 0 }, warnings: []
  };
  if (!input || !['NIFTY','BANKNIFTY','SENSEX'].includes(input.instrument) ||
      !input.calendarSource?.trim() || !Array.isArray(input.expectedSessionDates) ||
      input.expectedSessionDates.length === 0 ||
      input.expectedSessionDates.some(d => !validDate(d)) ||
      input.expectedSessionDates.some((d,i) => i > 0 && d <= input.expectedSessionDates[i-1]) ||
      !Number.isInteger(input.minimumCapturesPerSession) ||
      input.minimumCapturesPerSession <= 0 ||
      !Array.isArray(input.records)) {
    return { ...base, warnings: ['INVALID_OR_MISSING_DECLARED_EXCHANGE_SESSION_CALENDAR'] };
  }
  const declared = new Set(input.expectedSessionDates);
  const perDay = new Map<string, number>();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const corrupted: number[] = [], testOnly: number[] = [];
  const counts: Record<HorizonBucket, number> = {
    '1W': 0, '2W': 0, '4W': 0, '8W': 0
  };
  input.records.forEach((record, idx) => {
    const evidence = verifyAdaptiveCapture(record);
    if (!evidence.valid || record.payload.instrument !== input.instrument) {
      corrupted.push(idx);
      return;
    }
    if (record.payload.synthetic) { testOnly.push(idx); return; }
    const day = istDay(record.payload.collectedAt);
    // Off-calendar data are NOT silently assigned to another session.
    if (!declared.has(day)) { corrupted.push(idx); return; }
    if (seen.has(record.payload.collectedAt)) {
      duplicates.add(record.payload.collectedAt);
      return;
    }
    seen.add(record.payload.collectedAt);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    for (const h of HORIZONS) {
      if (record.payload.buckets.some(b =>
        b.horizon === h && b.expiry !== null &&
        record.payload.chains.some(c => c.expiry === b.expiry &&
          c.status === 'CAPTURED' && c.validSidesWithL1AndGreeks > 0))) counts[h]++;
    }
  });
  const missing = input.expectedSessionDates.filter(day => !perDay.has(day));
  const underSampled = input.expectedSessionDates.filter(day =>
    perDay.has(day) && perDay.get(day)! < input.minimumCapturesPerSession);
  const gaps = missing.length > 0 || underSampled.length > 0 ||
    corrupted.length > 0 || testOnly.length > 0 || duplicates.size > 0 ||
    HORIZONS.some(h => counts[h] === 0);
  return {
    ...base, status: gaps ? 'COLLECTION_GAPS' : 'CAPTURED_BUT_UNVERIFIED_EVENT_TIME',
    expectedSessions: declared.size, actualCapturedSessions: perDay.size,
    missingSessions: missing, underSampledSessions: underSampled,
    duplicateCaptureTimes: [...duplicates], corruptedRecords: corrupted,
    testOnlyRecords: testOnly, capturedByHorizon: counts,
    warnings: [
      'REST_CAPTURE_RECEIPT_TIME_NOT_VERIFIED_EXCHANGE_EVENT_TIME',
      'NO_HISTORICAL_UNDERLYING_15M_CLOSED_CANDLE_SERIES_ATTACHED',
      'NO_INDEPENDENT_DATED_POST_ENTRY_EXIT_BID_ASK_SERIES',
      'NO_VALIDATED_HISTORICAL_CONTRACT_SURVIVORSHIP_OR_OOS_FOLDS'
    ]
  };
}
