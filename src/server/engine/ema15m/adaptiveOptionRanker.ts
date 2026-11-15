/**
 * EMA15M Adaptive Swing v2 — explainable option ranking, RESEARCH ONLY.
 * Uses ONLY listed broker contracts + broker option-chain bid/ask/Greeks.
 * It never produces an executable order authorization or expected profit claim.
 */
export type HorizonBucket = '1W' | '2W' | '4W' | '8W';
export type DirectionalOptionType = 'CE' | 'PE';
export interface ListedOptionContract {
  underlying_symbol: string; underlying_key: string;
  segment: string; instrument_type: DirectionalOptionType;
  strike_price: number; expiry: string;
  instrument_key: string; trading_symbol: string;
  lot_size: number; tick_size: number;
}
export interface RankedOption {
  instrumentKey: string; tradingSymbol: string; optionType: DirectionalOptionType;
  strike: number; expiry: string; daysToExpiry: number; lotSize: number;
  bid: number; ask: number; spreadPercent: number;
  delta: number; theta: number; iv: number; volume: number; openInterest: number;
  oneLotAskNotional: number; researchScore: number;
}
export interface ExpiryResearchResult {
  horizon: HorizonBucket;
  targetDays: number;
  expiry: string | null;
  daysToExpiry: number | null;
  candidates: RankedOption[];
  status: 'RANKED' | 'UNAVAILABLE' | 'UNVERIFIED_CHAIN' | 'NO_LIQUID_CONTRACT';
  reason: string;
}
export interface AdaptiveOptionResearch {
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  snapshotAgeVerified: false;
  scoringPolicy: 'UNVALIDATED_HEURISTIC_V1';
  options: ExpiryResearchResult[];
}

const buckets: Array<{ label: HorizonBucket; days: number; min: number; max: number }> = [
  { label: '1W', days: 7, min: 5, max: 11 },
  { label: '2W', days: 14, min: 10, max: 20 },
  { label: '4W', days: 28, min: 21, max: 39 },
  { label: '8W', days: 56, min: 42, max: 77 }
];
const round = (x: number, decimals: number = 3): number =>
  Number(x.toFixed(decimals));

function istDate(asOf: Date): string {
  return new Date(asOf.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
function daysBetween(date: string, asOf: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const a = Date.parse(date + 'T00:00:00Z');
  const b = Date.parse(istDate(asOf) + 'T00:00:00Z');
  return (a - b) / 86_400_000;
}

const validContractKey = (key: unknown, segment: string): key is string =>
  typeof key === 'string' && key.startsWith(segment + '|') &&
  /^[0-9]+$/.test(key.slice(segment.length + 1));

export function chooseAdaptiveExpiries(
  contracts: unknown, underlyingKey: string, instrument: string,
  optionType: DirectionalOptionType, asOf: Date = new Date()
): Array<{ horizon: HorizonBucket; targetDays: number; expiry: string | null; dte: number | null }> {
  const segment = instrument === 'SENSEX' ? 'BSE_FO' : 'NSE_FO';
  const rows = Array.isArray(contracts) ? contracts : [];
  const expiryDays = new Map<string, number>();
  for (const row of rows as any[]) {
    if (row?.underlying_symbol !== instrument || row?.underlying_key !== underlyingKey ||
        row?.instrument_type !== optionType || row?.segment !== segment ||
        !validContractKey(row?.instrument_key, segment) ||
        !Number.isInteger(Number(row.lot_size)) || Number(row.lot_size) <= 0) continue;
    const days = daysBetween(row.expiry, asOf);
    if (Number.isInteger(days) && days >= 0) expiryDays.set(row.expiry, days);
  }
  return buckets.map(bucket => {
    const eligible = [...expiryDays.entries()]
      .filter(([, d]) => d >= bucket.min && d <= bucket.max)
      .sort((a, b) => Math.abs(a[1] - bucket.days) - Math.abs(b[1] - bucket.days) || a[1] - b[1]);
    return {
      horizon: bucket.label, targetDays: bucket.days,
      expiry: eligible[0]?.[0] ?? null, dte: eligible[0]?.[1] ?? null
    };
  });
}

export function rankAdaptiveOptions(input: {
  brokerContracts: unknown;
  chainByExpiry: Record<string, unknown>;
  underlyingKey: string;
  instrument: string;
  optionType: DirectionalOptionType;
  spot: number;
  asOf?: Date;
  maxPremiumOutlay?: number;
}): AdaptiveOptionResearch {
  const asOf = input.asOf ?? new Date();
  const selection = chooseAdaptiveExpiries(
    input.brokerContracts, input.underlyingKey, input.instrument, input.optionType, asOf
  );
  const segment = input.instrument === 'SENSEX' ? 'BSE_FO' : 'NSE_FO';
  const validInput = Number.isFinite(input.spot) && input.spot > 0 &&
    Number.isFinite(asOf.getTime()) &&
    (input.maxPremiumOutlay === undefined ||
      (Number.isFinite(input.maxPremiumOutlay) && input.maxPremiumOutlay > 0));
  const contractMap = new Map<string, any>();
  for (const c of Array.isArray(input.brokerContracts) ? input.brokerContracts : []) {
    if (c?.underlying_key === input.underlyingKey &&
        c?.underlying_symbol === input.instrument &&
        c?.segment === segment &&
        c?.instrument_type === input.optionType &&
        validContractKey(c.instrument_key, segment) &&
        Number.isInteger(Number(c.lot_size)) && Number(c.lot_size) > 0) {
      contractMap.set(c.instrument_key, c);
    }
  }
  const options: ExpiryResearchResult[] = selection.map(bucket => {
    const base = { horizon: bucket.horizon, targetDays: bucket.targetDays,
      expiry: bucket.expiry, daysToExpiry: bucket.dte, candidates: [] as RankedOption[] };
    if (!validInput) return { ...base, status: 'UNAVAILABLE', reason: 'INVALID_INPUT' };
    if (!bucket.expiry) return { ...base, status: 'UNAVAILABLE', reason: 'NO_BROKER_LISTED_EXPIRY_IN_HORIZON' };
    const chain = input.chainByExpiry?.[bucket.expiry];
    if (!Array.isArray(chain)) {
      return { ...base, status: 'UNVERIFIED_CHAIN', reason: 'BROKER_OPTION_CHAIN_UNAVAILABLE' };
    }
    const ranked: RankedOption[] = [];
    for (const entry of chain as any[]) {
      if (!entry || entry.expiry !== bucket.expiry ||
          entry.underlying_key !== input.underlyingKey ||
          !Number.isFinite(Number(entry.strike_price))) continue;
      // Underlying quote disagreement indicates a mismatched/stale snapshot.
      const chainSpot = Number(entry.underlying_spot_price);
      if (!Number.isFinite(chainSpot) || chainSpot <= 0 ||
          Math.abs(chainSpot - input.spot) / input.spot > 0.015) continue;
      const side = input.optionType === 'CE' ? entry.call_options : entry.put_options;
      const key = side?.instrument_key;
      const listed = contractMap.get(key);
      if (!listed || listed.expiry !== bucket.expiry ||
          Number(listed.strike_price) !== Number(entry.strike_price)) continue;
      const quote = side?.market_data;
      const greeks = side?.option_greeks;
      const bid = Number(quote?.bid_price), ask = Number(quote?.ask_price);
      const bidQty = Number(quote?.bid_qty), askQty = Number(quote?.ask_qty);
      const volume = Number(quote?.volume), openInterest = Number(quote?.oi);
      const delta = Number(greeks?.delta), theta = Number(greeks?.theta), iv = Number(greeks?.iv);
      const strike = Number(listed.strike_price), lot = Number(listed.lot_size);
      if (![bid, ask, bidQty, askQty, volume, openInterest, delta, theta, iv, strike, lot]
        .every(Number.isFinite) || bid <= 0 || ask <= bid ||
        bidQty <= 0 || askQty <= 0 || volume <= 0 || openInterest <= 0 ||
        iv <= 0 || Math.abs(delta) < 0.35 || Math.abs(delta) > 0.85 ||
        (input.optionType === 'CE' && delta <= 0) ||
        (input.optionType === 'PE' && delta >= 0) ||
        Math.abs(strike - input.spot) / input.spot > 0.025) continue;
      const spread = (ask - bid) / ask;
      if (spread > 0.08) continue;
      const outlay = ask * lot;
      if (input.maxPremiumOutlay !== undefined && outlay > input.maxPremiumOutlay) continue;
      // Explanation-only score. IV/theta shown, not compared as universal "cheap"
      // across maturities without historical IV percentile/consistent Greek units.
      const deltaScore = Math.max(0, 1 - Math.abs(Math.abs(delta) - 0.6) / 0.25);
      const spreadScore = Math.max(0, 1 - spread / 0.08);
      const volumeScore = Math.min(1, Math.log1p(volume) / Math.log1p(10_000));
      const oiScore = Math.min(1, Math.log1p(openInterest) / Math.log1p(100_000));
      const score = 42 * deltaScore + 33 * spreadScore + 12.5 * volumeScore + 12.5 * oiScore;
      ranked.push({
        instrumentKey: listed.instrument_key, tradingSymbol: listed.trading_symbol,
        optionType: input.optionType, strike, expiry: bucket.expiry,
        daysToExpiry: bucket.dte!, lotSize: lot,
        bid: round(bid, 2), ask: round(ask, 2), spreadPercent: round(spread * 100, 2),
        delta: round(delta), theta: round(theta), iv: round(iv),
        volume, openInterest, oneLotAskNotional: round(outlay, 2),
        researchScore: round(score, 1)
      });
    }
    ranked.sort((a, b) => b.researchScore - a.researchScore ||
      Math.abs(a.strike - input.spot) - Math.abs(b.strike - input.spot));
    if (!ranked.length) return { ...base, status: 'NO_LIQUID_CONTRACT',
      reason: 'NO_VERIFIED_BID_ASK_GREEKS_LIQUIDITY_OR_BUDGET_MATCH' };
    return { ...base, candidates: ranked.slice(0, 3), status: 'RANKED',
      reason: 'BROKER_LISTED_AND_QUOTED_RESEARCH_CANDIDATES' };
  });
  return { mode: 'RESEARCH_ONLY', executionAuthorized: false,
    snapshotAgeVerified: false, scoringPolicy: 'UNVALIDATED_HEURISTIC_V1', options };
}
