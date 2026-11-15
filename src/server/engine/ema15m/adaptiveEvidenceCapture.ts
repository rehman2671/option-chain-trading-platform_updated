/**
 * Adaptive v2 evidence collector. Explicit read-only invocation ONLY.
 * Does not import order routing, engine state, practice-mode provider or a DB.
 * REST option chain exposes no broker/exchange quote timestamp: wall-clock HTTP
 * receipt time is NOT an exchange observation time and cannot certify fills.
 */
import { createHash } from 'node:crypto';
import {
  chooseAdaptiveExpiries, type DirectionalOptionType, type HorizonBucket,
  type ListedOptionContract
} from './adaptiveOptionRanker.js';

export type CaptureInstrument = 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
export const CAPTURE_KEYS: Readonly<Record<CaptureInstrument, string>> = {
  NIFTY: 'NSE_INDEX|Nifty 50',
  BANKNIFTY: 'NSE_INDEX|Nifty Bank',
  SENSEX: 'BSE_INDEX|SENSEX'
};
export type CaptureHorizon = HorizonBucket;
export type QuoteTimeQuality = 'RECEIPT_ONLY_EXCHANGE_TIME_UNVERIFIED';

export interface CaptureBucket {
  side: DirectionalOptionType;
  horizon: CaptureHorizon;
  expiry: string | null;
  daysToExpiry: number | null;
}

export interface CaptureChain {
  expiry: string;
  requestedAt: string;
  receivedAt: string;
  source: 'UPSTOX_V2_OPTION_CHAIN_REST';
  /** DELIBERATELY null because this API response has no exchange quote timestamp. */
  exchangeQuoteAt: null;
  status: 'CAPTURED' | 'UNAVAILABLE' | 'INVALID_RESPONSE';
  reason: string;
  providerRowCount: number;
  acceptedRowCount: number;
  validSidesWithL1AndGreeks: number;
  /** Normalized field allowlist. Includes illiquid quotes as returned, not synthetic. */
  rows: Array<{
    expiry: string;
    underlying_key: string;
    underlying_spot_price: number;
    strike_price: number;
    call_options: CaptureSide | null;
    put_options: CaptureSide | null;
  }>;
}

export interface CaptureSide {
  instrument_key: string;
  market_data: {
    bid_price: number | null; ask_price: number | null;
    bid_qty: number | null; ask_qty: number | null;
    volume: number | null; oi: number | null;
  };
  option_greeks: {
    delta: number | null; iv: number | null; theta: number | null;
    gamma: number | null; vega: number | null;
  };
}

export interface AdaptiveCapturePayload {
  schemaVersion: 'ADAPTIVE_OPTION_EVIDENCE_V1';
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  synthetic: boolean;
  source: 'UPSTOX_V2_READ_ONLY_REST' | 'MOCK_HTTP_TEST';
  instrument: CaptureInstrument;
  underlyingKey: string;
  collectedAt: string;
  quoteTimeQuality: QuoteTimeQuality;
  /** No exchange clock sync or market session verifier in this collector. */
  exchangeTimeVerified: false;
  marketSessionVerified: false;
  /** Captured data alone is never an eligible historical performance input. */
  historicalBacktestAuthorized: false;
  contracts: {
    requestedAt: string;
    receivedAt: string;
    source: 'UPSTOX_V2_OPTION_CONTRACTS_REST';
    providerRowCount: number;
    acceptedRowCount: number;
    rows: ListedOptionContract[];
  };
  buckets: CaptureBucket[];
  chains: CaptureChain[];
  evidenceStatus: 'SNAPSHOT_CAPTURED_UNVERIFIED_TIME' | 'PARTIAL_SNAPSHOT';
  warnings: string[];
}

export interface AdaptiveCaptureRecord {
  payload: AdaptiveCapturePayload;
  sha256: string;
}
type Get = (url: string, init: RequestInit) => Promise<Response>;

const isIso = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const validDay = (d: unknown): d is string =>
  typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d) &&
  !Number.isNaN(Date.parse(d + 'T00:00:00Z')) &&
  new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;

function sanitizedContracts(data: unknown, symbol: CaptureInstrument, underlyingKey: string):
ListedOptionContract[] {
  if (!Array.isArray(data)) throw new Error('CONTRACT_RESPONSE_NOT_ARRAY');
  const segment = symbol === 'SENSEX' ? 'BSE_FO' : 'NSE_FO';
  const seen = new Set<string>();
  const accepted: ListedOptionContract[] = [];
  for (const c of data) {
    if (c?.underlying_symbol !== symbol || c?.underlying_key !== underlyingKey ||
        c?.segment !== segment || !['CE','PE'].includes(c?.instrument_type) ||
        typeof c.instrument_key !== 'string' ||
        !(new RegExp('^' + segment + '\\|[0-9]+$')).test(c.instrument_key) ||
        !validDay(c.expiry) || !positive(c.strike_price) ||
        !Number.isInteger(c.lot_size) || c.lot_size <= 0 ||
        !positive(c.tick_size) || typeof c.trading_symbol !== 'string' ||
        !c.trading_symbol.trim()) continue;
    if (seen.has(c.instrument_key)) throw new Error('DUPLICATE_BROKER_CONTRACT_KEY');
    seen.add(c.instrument_key);
    accepted.push({
      underlying_symbol: symbol, underlying_key: underlyingKey,
      segment, instrument_type: c.instrument_type, strike_price: c.strike_price,
      expiry: c.expiry, instrument_key: c.instrument_key,
      trading_symbol: c.trading_symbol, lot_size: c.lot_size, tick_size: c.tick_size
    });
  }
  if (accepted.length === 0) throw new Error('NO_VALID_BROKER_LISTED_CONTRACTS');
  return accepted.sort((a,b) => a.expiry.localeCompare(b.expiry) ||
    a.instrument_key.localeCompare(b.instrument_key));
}

function extractSide(x: any, expected: DirectionalOptionType, expiry: string,
  strike: number, contracts: Map<string, ListedOptionContract>): CaptureSide | null {
  const key = x?.instrument_key;
  if (typeof key !== 'string') return null;
  const c = contracts.get(key);
  if (!c || c.instrument_type !== expected || c.expiry !== expiry || c.strike_price !== strike) {
    return null;
  }
  const m = x?.market_data, g = x?.option_greeks;
  return {
    instrument_key: key,
    market_data: {
      bid_price: numberOrNull(m?.bid_price), ask_price: numberOrNull(m?.ask_price),
      bid_qty: numberOrNull(m?.bid_qty), ask_qty: numberOrNull(m?.ask_qty),
      volume: numberOrNull(m?.volume), oi: numberOrNull(m?.oi)
    },
    option_greeks: {
      delta: numberOrNull(g?.delta), iv: numberOrNull(g?.iv),
      theta: numberOrNull(g?.theta), gamma: numberOrNull(g?.gamma),
      vega: numberOrNull(g?.vega)
    }
  };
}

export function hasValidL1AndGreeks(side: CaptureSide | null, optionType: DirectionalOptionType):
boolean {
  if (!side) return false;
  const { market_data: m, option_greeks: g } = side;
  return m.bid_price !== null && m.ask_price !== null &&
    m.ask_qty !== null && m.bid_qty !== null &&
    m.volume !== null && m.oi !== null && g.delta !== null &&
    g.iv !== null && g.theta !== null &&
    m.bid_price > 0 && m.ask_price > m.bid_price && m.bid_qty > 0 &&
    m.ask_qty > 0 && m.volume > 0 && m.oi > 0 && g.iv > 0 &&
    ((optionType === 'CE' && g.delta > 0) ||
     (optionType === 'PE' && g.delta < 0));
}

function normalizeChain(data: unknown, expiry: string, underlyingKey: string,
  contracts: Map<string, ListedOptionContract>):
Pick<CaptureChain, 'rows' | 'providerRowCount' | 'acceptedRowCount' | 'validSidesWithL1AndGreeks'> {
  if (!Array.isArray(data)) throw new Error('OPTION_CHAIN_RESPONSE_NOT_ARRAY');
  const rows: CaptureChain['rows'] = [];
  let validSidesWithL1AndGreeks = 0;
  const seen = new Set<number>();
  for (const r of data) {
    if (r?.expiry !== expiry || r?.underlying_key !== underlyingKey ||
        !positive(r.underlying_spot_price) || !positive(r.strike_price) ||
        seen.has(r.strike_price)) continue;
    const call = extractSide(r.call_options, 'CE', expiry, r.strike_price, contracts);
    const put = extractSide(r.put_options, 'PE', expiry, r.strike_price, contracts);
    if (!call && !put) continue;
    seen.add(r.strike_price);
    if (hasValidL1AndGreeks(call, 'CE')) validSidesWithL1AndGreeks++;
    if (hasValidL1AndGreeks(put, 'PE')) validSidesWithL1AndGreeks++;
    rows.push({
      expiry, underlying_key: underlyingKey,
      underlying_spot_price: r.underlying_spot_price,
      strike_price: r.strike_price, call_options: call, put_options: put
    });
  }
  rows.sort((a,b)=>a.strike_price-b.strike_price);
  return {
    rows, providerRowCount: data.length, acceptedRowCount: rows.length,
    validSidesWithL1AndGreeks
  };
}

function safeNow(clock: () => Date): string {
  const date = clock();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('INVALID_COLLECTION_CLOCK');
  }
  return date.toISOString();
}

/**
 * Call once explicitly from a CLI. The clock may be replaced ONLY in tests;
 * every produced quote timestamp remains REST receipt time, not exchange time.
 */
export async function collectAdaptiveOptionEvidence(input: {
  instrument: CaptureInstrument;
  accessToken: string;
  transport?: Get;
  clock?: () => Date;
}): Promise<AdaptiveCaptureRecord> {
  if (!input || !Object.prototype.hasOwnProperty.call(CAPTURE_KEYS, input.instrument)) {
    throw new Error('INVALID_CAPTURE_INSTRUMENT');
  }
  if (!input.accessToken || !input.accessToken.trim()) throw new Error('UPSTOX_AUTH_REQUIRED');
  const key = CAPTURE_KEYS[input.instrument];
  const transport = input.transport ?? fetch;
  const now = input.clock ?? (() => new Date());
  const request = async (url: string): Promise<{data: unknown; requestedAt: string; receivedAt: string}> => {
    const requestedAt = safeNow(now);
    const response = await transport(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + input.accessToken, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    const receivedAt = safeNow(now);
    if (Date.parse(receivedAt) < Date.parse(requestedAt)) throw new Error('CAPTURE_CLOCK_ROLLED_BACK');
    if (!response?.ok) throw new Error('UPSTOX_READ_ONLY_HTTP_' + (response?.status ?? 'UNAVAILABLE'));
    const payload: any = await response.json().catch(() => null);
    if (payload?.status !== 'success' || !Array.isArray(payload?.data)) {
      throw new Error('UPSTOX_READ_ONLY_INVALID_RESPONSE');
    }
    return { data: payload.data, requestedAt, receivedAt };
  };
  const catalog = await request('https://api.upstox.com/v2/option/contract?instrument_key=' +
    encodeURIComponent(key));
  const contracts = sanitizedContracts(catalog.data, input.instrument, key);
  const asOf = new Date(catalog.receivedAt);
  const buckets: CaptureBucket[] = (['CE','PE'] as const).flatMap(side =>
    chooseAdaptiveExpiries(contracts, key, input.instrument, side, asOf).map(x => ({
      side, horizon: x.horizon, expiry: x.expiry, daysToExpiry: x.dte
    }))
  );
  const expiries = [...new Set(buckets.map(x => x.expiry).filter(
    (v): v is string => v !== null))].sort();
  const map = new Map(contracts.map(c => [c.instrument_key, c]));
  const chains: CaptureChain[] = [];
  for (const expiry of expiries) {
    const url = 'https://api.upstox.com/v2/option/chain?instrument_key=' +
      encodeURIComponent(key) + '&expiry_date=' + encodeURIComponent(expiry);
    try {
      const result = await request(url);
      const chain = normalizeChain(result.data, expiry, key, map);
      chains.push({
        expiry, requestedAt: result.requestedAt, receivedAt: result.receivedAt,
        source: 'UPSTOX_V2_OPTION_CHAIN_REST', exchangeQuoteAt: null,
        status: chain.acceptedRowCount > 0 && chain.validSidesWithL1AndGreeks > 0
          ? 'CAPTURED' : 'INVALID_RESPONSE',
        reason: chain.acceptedRowCount > 0 && chain.validSidesWithL1AndGreeks > 0
          ? 'RECEIPT_TIMESTAMP_ONLY' : 'NO_VALID_MATCHING_BROKER_L1_GREEKS',
        ...chain
      });
    } catch {
      // Preserve missing evidence. Do not fabricate rows or silently fallback to practice.
      const at = safeNow(now);
      chains.push({
        expiry, requestedAt: at, receivedAt: at,
        source: 'UPSTOX_V2_OPTION_CHAIN_REST', exchangeQuoteAt: null,
        status: 'UNAVAILABLE', reason: 'READ_ONLY_CHAIN_FETCH_FAILED',
        providerRowCount: 0, acceptedRowCount: 0,
        validSidesWithL1AndGreeks: 0, rows: []
      });
    }
  }
  const complete = buckets.every(b => b.expiry !== null) &&
    chains.length > 0 && chains.every(x => x.status === 'CAPTURED');
  const payload: AdaptiveCapturePayload = {
    schemaVersion: 'ADAPTIVE_OPTION_EVIDENCE_V1', mode: 'RESEARCH_ONLY',
    executionAuthorized: false,
    synthetic: input.transport !== undefined,
    source: input.transport ? 'MOCK_HTTP_TEST' : 'UPSTOX_V2_READ_ONLY_REST',
    instrument: input.instrument, underlyingKey: key,
    collectedAt: safeNow(now), quoteTimeQuality: 'RECEIPT_ONLY_EXCHANGE_TIME_UNVERIFIED',
    exchangeTimeVerified: false, marketSessionVerified: false,
    historicalBacktestAuthorized: false,
    contracts: {
      requestedAt: catalog.requestedAt, receivedAt: catalog.receivedAt,
      source: 'UPSTOX_V2_OPTION_CONTRACTS_REST',
      providerRowCount: (catalog.data as unknown[]).length,
      acceptedRowCount: contracts.length, rows: contracts
    },
    buckets, chains,
    evidenceStatus: complete ? 'SNAPSHOT_CAPTURED_UNVERIFIED_TIME' : 'PARTIAL_SNAPSHOT',
    warnings: [
      'BROKER_REST_HAS_NO_VERIFIED_EXCHANGE_L1_QUOTE_TIME',
      'HTTP_RECEIPT_TIME_MUST_NOT_BE_USED_AS_PROVEN_L1_EVENT_TIME',
      'REQUIRES_UNDERLYING_CLOSED_CANDLES_CALENDAR_AND_MULTIDAY_EXIT_DATA'
    ]
  };
  return { payload, sha256: captureSha256(payload) };
}

export function captureSha256(payload: AdaptiveCapturePayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function verifyAdaptiveCapture(record: unknown): {
  valid: boolean; errors: string[]; researchUsable: false
} {
  const errors: string[] = [];
  if (!record || typeof record !== 'object') return {
    valid: false, errors: ['INVALID_RECORD'], researchUsable: false
  };
  const r = record as AdaptiveCaptureRecord;
  const p = r.payload;
  if (!p || p.schemaVersion !== 'ADAPTIVE_OPTION_EVIDENCE_V1' ||
      p.mode !== 'RESEARCH_ONLY' || p.executionAuthorized !== false ||
      (p.synthetic !== true && p.synthetic !== false) ||
      ((p.source === 'MOCK_HTTP_TEST') !== p.synthetic) ||
      p.historicalBacktestAuthorized !== false ||
      p.exchangeTimeVerified !== false || p.marketSessionVerified !== false ||
      p.quoteTimeQuality !== 'RECEIPT_ONLY_EXCHANGE_TIME_UNVERIFIED' ||
      !Object.prototype.hasOwnProperty.call(CAPTURE_KEYS, p.instrument) ||
      CAPTURE_KEYS[p.instrument] !== p.underlyingKey ||
      !isIso(p.collectedAt)) errors.push('INVALID_CAPTURE_METADATA');
  if (typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256) ||
      !p || captureSha256(p) !== r.sha256) errors.push('CAPTURE_HASH_MISMATCH');
  if (!p || !Array.isArray(p.contracts?.rows) || !Array.isArray(p.buckets) ||
      p.buckets.length !== 8 || !Array.isArray(p.chains) ||
      !p.chains.every(c => c.exchangeQuoteAt === null &&
        isIso(c.requestedAt) && isIso(c.receivedAt) &&
        c.providerRowCount >= c.acceptedRowCount &&
        c.acceptedRowCount === c.rows.length))
    errors.push('CAPTURE_STRUCTURE_UNVERIFIED');
  return { valid: errors.length === 0, errors, researchUsable: false };
}
