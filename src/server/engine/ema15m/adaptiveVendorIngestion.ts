/**
 * Adaptive v2 Phase 5: offline original-event-time historical L1 ingestion.
 *
 * Strictly separates source-attested EVENT timestamps from Upstox REST receipt
 * timestamps. This is schema/consistency validation, not authentication of a
 * vendor, market data entitlement, or a certification of trading profitability.
 * No broker imports; no orders; no auto-trading.
 */
import type { ClosedIndexCandle } from './adaptiveMarketRegime.js';
import type { ListedOptionContract } from './adaptiveOptionRanker.js';
import type {
  HistoricalComparisonInput, HistoricalDecision, HistoricalExecutableQuote
} from './historicalAdaptiveComparison.js';

export interface VendorClockedSnapshot<T> {
  /** Original L1/feed event timestamp provided by source, not file download time. */
  eventAt: string;
  /** Timestamp when the data originally reached the strategy, not today's import time. */
  availableAt: string;
  /** Stable reference into an independently retained vendor/file evidence record. */
  sourceRecordId: string;
  data: T;
}

export interface VendorSession {
  sessionDate: string;
  decisionAt: string;
  /** 15m START timestamps. Historical closed candles only. */
  underlyingCandles: ClosedIndexCandle[];
  contracts: VendorClockedSnapshot<ListedOptionContract[]>;
  chains: Array<VendorClockedSnapshot<{
    expiry: string;
    rows: unknown[];
  }>>;
}
export interface VendorExecutionL1 {
  eventAt: string;
  availableAt: string;
  sourceRecordId: string;
  instrumentKey: string;
  bid: number; ask: number; bidQty: number; askQty: number;
}

export interface VerifiedHistoricalBundleV1 {
  schemaVersion: 'ADAPTIVE_VERIFIED_L1_BUNDLE_V1';
  provenance: {
    datasetId: string;
    vendor: string;
    licenseOrEntitlementReference: string;
    sourceArtifactSha256: string;
    /** Only an original archived event feed/vendor record is accepted. */
    collection: 'ORIGINAL_EVENT_FEED_ARCHIVE' | 'LICENSED_HISTORICAL_L1';
    timestampBasis: 'ORIGINAL_EXCHANGE_OR_VENDOR_EVENT_TIME';
    /** REST HTTP receipt-only snapshots are NOT allowed here. */
    originalAvailabilityTimestampRecorded: true;
    synthetic: boolean;
    calendarSource: string;
    expectedSessions: string[];
  };
  instrument: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
  underlyingKey: string;
  sessions: VendorSession[];
  executionL1: VendorExecutionL1[];
  /** Chosen BEFORE evaluating the testing windows. */
  policy: HistoricalComparisonInput['policy'];
  /** Maximum original feed/event-to-strategy availability latency. */
  maximumOriginalFeedLatencySeconds: number;
}

export interface IngestionResult {
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  schemaValid: boolean;
  sourceAuthenticityIndependentlyVerified: false;
  status: 'REJECTED' | 'SOURCE_ATTESTED_NOT_INDEPENDENTLY_VERIFIED';
  errors: string[];
  warnings: string[];
  input: HistoricalComparisonInput | null;
  counts: {
    sessions: number;
    chainSnapshots: number;
    optionL1Observations: number;
    uniqueContracts: number;
  };
}

const validDate = (x: unknown): x is string =>
  typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x + 'T00:00:00Z')) &&
  new Date(x + 'T00:00:00Z').toISOString().slice(0,10) === x;
const validTime = (x: unknown): x is string =>
  typeof x === 'string' && Number.isFinite(Date.parse(x)) &&
  /^\d{4}-\d{2}-\d{2}T/.test(x) && /(Z|[+-]\d{2}:\d{2})$/.test(x);
const positive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;
const nonnegative = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;
const canonicalDay = (timestamp: string) =>
  new Date(Date.parse(timestamp) + 330 * 60_000).toISOString().slice(0,10);
const err = (errors: string[], code: string) => {
  if (!errors.includes(code)) errors.push(code);
};
const nonempty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const contractKey = (key: unknown, segment: string) => typeof key === 'string' &&
  new RegExp('^' + segment + '\\|[0-9]+$').test(key);
const expectedKeys: Record<string,string> = {
  NIFTY: 'NSE_INDEX|Nifty 50', BANKNIFTY: 'NSE_INDEX|Nifty Bank',
  SENSEX: 'BSE_INDEX|SENSEX'
};

function validateClocked<T>(
  snapshot: VendorClockedSnapshot<T> | undefined,
  decisionAt: string | null,
  maxLatencyMs: number,
  errors: string[]
): snapshot is VendorClockedSnapshot<T> {
  if (!snapshot || !validTime(snapshot.eventAt) ||
      !validTime(snapshot.availableAt) || !nonempty(snapshot.sourceRecordId) ||
      !Number.isFinite(maxLatencyMs) ||
      Date.parse(snapshot.eventAt) > Date.parse(snapshot.availableAt) ||
      Date.parse(snapshot.availableAt) - Date.parse(snapshot.eventAt) > maxLatencyMs ||
      (decisionAt !== null && Date.parse(snapshot.availableAt) > Date.parse(decisionAt))) {
    err(errors, 'INVALID_OR_LOOKAHEAD_VENDOR_EVENT_CLOCK');
    return false;
  }
  return true;
}

function validateContracts(
  contracts: unknown, instrument: string, underlyingKey: string,
  allKeys: Map<string, ListedOptionContract>, errors: string[]
): contracts is ListedOptionContract[] {
  if (!Array.isArray(contracts) || contracts.length === 0) {
    err(errors,'MISSING_POINT_IN_TIME_CONTRACT_CATALOG');
    return false;
  }
  const segment = instrument === 'SENSEX' ? 'BSE_FO' : 'NSE_FO';
  const local = new Set<string>();
  let valid = true;
  for (const c of contracts) {
    if (!c || c.underlying_symbol !== instrument ||
        c.underlying_key !== underlyingKey || c.segment !== segment ||
        !['CE','PE'].includes(c.instrument_type) ||
        !contractKey(c.instrument_key, segment) ||
        !validDate(c.expiry) || !positive(c.strike_price) ||
        !Number.isInteger(c.lot_size) || c.lot_size <= 0 ||
        !positive(c.tick_size) || !nonempty(c.trading_symbol) ||
        local.has(c.instrument_key)) {
      valid = false; break;
    }
    local.add(c.instrument_key);
    const prior = allKeys.get(c.instrument_key);
    if (prior && (prior.expiry !== c.expiry || prior.strike_price !== c.strike_price ||
        prior.instrument_type !== c.instrument_type || prior.lot_size !== c.lot_size)) {
      valid = false; break;
    }
  }
  if (!valid) { err(errors,'CONTRACT_CATALOG_MISMATCH_OR_DUPLICATE'); return false; }
  for (const c of contracts as ListedOptionContract[]) allKeys.set(c.instrument_key, c);
  return true;
}

function validateChain(
  snap: VendorClockedSnapshot<{expiry:string; rows:unknown[]}>,
  contracts: ListedOptionContract[],
  underlyingKey: string, errors: string[]
): boolean {
  const chain = snap.data;
  if (!chain || !validDate(chain.expiry) || !Array.isArray(chain.rows) ||
      chain.rows.length === 0) {
    err(errors,'MISSING_HISTORICAL_L1_CHAIN'); return false;
  }
  const listed = new Map(contracts.map(c=>[c.instrument_key,c]));
  const strikes = new Set<number>();
  for (const row of chain.rows as any[]) {
    if (!row || row.expiry !== chain.expiry ||
        row.underlying_key !== underlyingKey ||
        !positive(row.underlying_spot_price) || !positive(row.strike_price) ||
        strikes.has(row.strike_price)) {
      err(errors,'INVALID_HISTORICAL_CHAIN_ROW'); return false;
    }
    strikes.add(row.strike_price);
    let knownSide = false;
    for (const [field,optionType] of [['call_options','CE'],['put_options','PE']] as const) {
      const side = row[field];
      if (!side) continue;
      const c = listed.get(side.instrument_key);
      if (!c || c.instrument_type !== optionType || c.expiry !== chain.expiry ||
          c.strike_price !== row.strike_price) {
        err(errors,'HISTORICAL_CHAIN_CONTRACT_MISMATCH'); return false;
      }
      knownSide = true;
      const m = side.market_data, g = side.option_greeks;
      // A genuine zero/illiquid price is valid market evidence, but a missing
      // L1 or Greek field is an INCOMPLETE dataset, not equivalent to zero.
      const fields=[m?.bid_price,m?.ask_price,m?.bid_qty,m?.ask_qty,
        m?.volume,m?.oi,g?.delta,g?.theta,g?.iv];
      if (fields.some(v=>typeof v!=='number' || !Number.isFinite(v)) ||
          [m?.bid_price,m?.ask_price,m?.bid_qty,m?.ask_qty,m?.volume,m?.oi]
            .some(v=>v<0) ||
          !Number.isInteger(m?.bid_qty) || !Number.isInteger(m?.ask_qty)) {
        err(errors,'MISSING_OR_INVALID_HISTORICAL_L1_GREEKS'); return false;
      }
    }
    if (!knownSide) { err(errors,'HISTORICAL_CHAIN_CONTRACT_MISMATCH'); return false; }
  }
  return true;
}

/** Strict offline adapter: never upgrades REST receipts to source event time. */
export function ingestVendorHistoricalBundle(raw: unknown): IngestionResult {
  const errors: string[] = [];
  const counts = {sessions:0,chainSnapshots:0,optionL1Observations:0,uniqueContracts:0};
  const base = {
    mode: 'RESEARCH_ONLY' as const, executionAuthorized: false as const,
    sourceAuthenticityIndependentlyVerified: false as const,
    warnings: ['SOURCE_ATTESTATION_REQUIRES_MANUAL_VENDOR_LICENSE_AND_TIMESTAMP_AUDIT',
      'VALID_INPUT_IS_NOT_A_MARKET_PROFITABILITY_OR_EXECUTION_SAFETY_CERTIFICATION']
  };
  const reject = (): IngestionResult => ({
    ...base, schemaValid:false, status:'REJECTED', errors, counts, input:null
  });
  if (!raw || typeof raw !== 'object') {
    err(errors,'INVALID_DATASET_ENVELOPE'); return reject();
  }
  const x = raw as VerifiedHistoricalBundleV1;
  const p = x.provenance;
  if (x.schemaVersion !== 'ADAPTIVE_VERIFIED_L1_BUNDLE_V1' || !p ||
      !nonempty(p.datasetId) || !nonempty(p.vendor) ||
      !nonempty(p.licenseOrEntitlementReference) ||
      !/^[a-f0-9]{64}$/.test(p.sourceArtifactSha256 || '') ||
      !['ORIGINAL_EVENT_FEED_ARCHIVE','LICENSED_HISTORICAL_L1'].includes(p.collection) ||
      p.timestampBasis !== 'ORIGINAL_EXCHANGE_OR_VENDOR_EVENT_TIME' ||
      p.originalAvailabilityTimestampRecorded !== true ||
      typeof p.synthetic !== 'boolean' || !nonempty(p.calendarSource)) {
    err(errors,'INVALID_OR_UNVERIFIED_SOURCE_PROVENANCE');
  }
  if (!expectedKeys[x.instrument] || x.underlyingKey !== expectedKeys[x.instrument])
    err(errors,'INSTRUMENT_UNDERLYING_MISMATCH');
  if (!Array.isArray(p?.expectedSessions) || !p.expectedSessions.length ||
      p.expectedSessions.some(s=>!validDate(s)) ||
      p.expectedSessions.some((s,i)=>i>0 && s<=p.expectedSessions[i-1]))
    err(errors,'INVALID_DECLARED_SESSION_CALENDAR');
  if (!Number.isInteger(x.maximumOriginalFeedLatencySeconds) ||
      x.maximumOriginalFeedLatencySeconds < 0 ||
      x.maximumOriginalFeedLatencySeconds > 300)
    err(errors,'UNSUPPORTED_EVENT_FEED_LATENCY_LIMIT');
  if (!x.policy || !Array.isArray(x.policy.folds)) err(errors,'MISSING_PREDECLARED_POLICY');
  if (!Array.isArray(x.sessions) || !Array.isArray(x.executionL1) ||
      x.sessions.length !== p?.expectedSessions?.length)
    err(errors,'INCOMPLETE_SESSION_OR_QUOTE_SERIES');
  if (errors.length) return reject();

  const latencyMs = x.maximumOriginalFeedLatencySeconds * 1000;
  const allKeys = new Map<string,ListedOptionContract>();
  const decisions: HistoricalDecision[] = [];
  const sourceIds = new Map<string,string>();
  const register = (id:string,kind:string) => {
    const previous=sourceIds.get(id);
    if (previous && previous!==kind) err(errors,'REUSED_SOURCE_RECORD_ID');
    sourceIds.set(id,kind);
  };
  x.sessions.forEach((session, index)=>{
    counts.sessions++;
    if (!session || session.sessionDate !== p.expectedSessions[index] ||
        !validTime(session.decisionAt) ||
        canonicalDay(session.decisionAt) !== session.sessionDate ||
        !Array.isArray(session.underlyingCandles) ||
        session.underlyingCandles.length < 100) {
      err(errors,'INCOMPLETE_OR_MISDATED_UNDERLYING_SESSION'); return;
    }
    let priorTime = -Infinity;
    for (const c of session.underlyingCandles) {
      const at = Date.parse(c?.timestamp ?? '');
      if (!c || !Number.isFinite(at) || at <= priorTime ||
          c.isClosed === false || at+15*60_000>Date.parse(session.decisionAt) ||
          ![c.open,c.high,c.low,c.close].every(positive) ||
          c.high<Math.max(c.open,c.close,c.low) ||
          c.low>Math.min(c.open,c.close,c.high)) {
        err(errors,'INCOMPLETE_OR_LOOKAHEAD_UNDERLYING_CANDLES'); break;
      }
      priorTime=at;
    }
    if (!validateClocked(session.contracts,session.decisionAt,latencyMs,errors) ||
        !validateContracts(session.contracts.data,x.instrument,x.underlyingKey,allKeys,errors))
      return;
    register(session.contracts.sourceRecordId,'CATALOG');
    if (!Array.isArray(session.chains)) {
      err(errors,'MISSING_HISTORICAL_L1_CHAIN'); return;
    }
    const chainForReplay: HistoricalDecision['chains'] = [];
    const seenExpiries = new Set<string>();
    for (const chain of session.chains) {
      counts.chainSnapshots++;
      if (!validateClocked(chain,session.decisionAt,latencyMs,errors)) continue;
      if (!validateChain(chain,session.contracts.data,x.underlyingKey,errors))
        continue;
      if (seenExpiries.has(chain.data.expiry)) {
        err(errors,'DUPLICATED_DECISION_EXPIRY_CHAIN'); continue;
      }
      seenExpiries.add(chain.data.expiry);
      register(chain.sourceRecordId,'CHAIN');
      chainForReplay.push({
        // Original arrival time is when the strategy could have seen the data.
        // This prevents use of data that arrived after the decision.
        capturedAt:chain.availableAt,expiry:chain.data.expiry,rows:chain.data.rows
      });
    }
    decisions.push({
      sessionDate:session.sessionDate,decisionAt:session.decisionAt,
      candles:session.underlyingCandles,
      contractsCapturedAt:session.contracts.availableAt,
      listedContracts:session.contracts.data,
      chains:chainForReplay
    });
  });
  const quotes: HistoricalExecutableQuote[] = [];
  const seenQuotes = new Set<string>();
  const seenAvailableQuotes = new Set<string>();
  x.executionL1.forEach(q=>{
    counts.optionL1Observations++;
    if (!validateClocked({
      eventAt:q?.eventAt, availableAt:q?.availableAt, sourceRecordId:q?.sourceRecordId,
      data:null
    },null,latencyMs,errors)) return;
    if (!nonempty(q.instrumentKey) || !positive(q.bid) ||
        !positive(q.ask) || q.ask<=q.bid ||
        !positive(q.bidQty) || !positive(q.askQty) ||
        !Number.isInteger(q.bidQty) || !Number.isInteger(q.askQty) ||
        !allKeys.has(q.instrumentKey)) {
      err(errors,'INVALID_OR_UNLISTED_OPTION_L1_QUOTE'); return;
    }
    const duplicateKey = q.instrumentKey+':'+q.eventAt;
    const availableKey = q.instrumentKey+':'+q.availableAt;
    if (seenQuotes.has(duplicateKey) || seenAvailableQuotes.has(availableKey)) {
      err(errors,'DUPLICATED_OR_CONFLICTING_L1_EVENT');return;
    }
    seenQuotes.add(duplicateKey);
    seenAvailableQuotes.add(availableKey);
    if (canonicalDay(q.availableAt) > allKeys.get(q.instrumentKey)!.expiry) {
      err(errors,'OPTION_L1_AFTER_CONTRACT_EXPIRY'); return;
    }
    register(q.sourceRecordId,'EXECUTION_L1');
    quotes.push({
      // Only the originally recorded AVAILABLE time can enter the replay.
      // Event time is validated against it, not treated as immediate fill.
      observedAt:q.availableAt,instrumentKey:q.instrumentKey,
      bid:q.bid,ask:q.ask,bidQty:q.bidQty,askQty:q.askQty
    });
  });
  counts.uniqueContracts = allKeys.size;
  if (decisions.length !== x.sessions.length) err(errors,'INCOMPLETE_DECISION_INGESTION');
  if (errors.length) return reject();

  const input: HistoricalComparisonInput = {
    provenance:{
      datasetId:p.datasetId,source:p.vendor,calendarSource:p.calendarSource,
      expectedSessions:p.expectedSessions,
      synthetic:p.synthetic,
      quoteTimestampQuality:'SOURCE_ATTESTED_EVENT_TIME' // claim only; never independently proven
    },
    instrument:x.instrument,underlyingKey:x.underlyingKey,
    decisions,executionQuotes:quotes,policy:x.policy
  };
  return {
    ...base, schemaValid:true, status:'SOURCE_ATTESTED_NOT_INDEPENDENTLY_VERIFIED',
    errors:[],counts,input
  };
}
