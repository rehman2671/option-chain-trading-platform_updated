/**
 * Phase131: fail-closed live EMA option quote freshness/identity fence.
 *
 * This is NOT a proof that LTP is executable bid/ask, an authenticated
 * exchange event, or that a broker SELL is close-only or gap protected.
 * The Upstox adapter declares source identity; local tests can mock it.
 * No HTTP, clock read, broker order, ledger mutation or live NRML release.
 */
export type LiveOptionQuoteFenceResult={
  accepted:boolean;
  price:number|null;
  reason:
    'EXACT_LIVE_OPTION_LTP_FRESH'|
    'UNVERIFIED_QUOTE_SOURCE_OR_CONTRACT'|
    'QUOTE_PRICE_MISSING_OR_INVALID'|
    'EXCHANGE_LAST_TRADE_TIME_MISSING_OR_INVALID'|
    'EXCHANGE_LAST_TRADE_TIME_STALE_OR_FUTURE';
  liveNrmlBuyAuthorized:false;
  nativeBrokerStopCertified:false;
  executableBidAskProven:false;
  brokerWrites:0;
  localWrites:0;
};
const result=(
  accepted:boolean,price:number|null,
  reason:LiveOptionQuoteFenceResult['reason']
):LiveOptionQuoteFenceResult=>({
  accepted,price,reason,liveNrmlBuyAuthorized:false,
  nativeBrokerStopCertified:false,executableBidAskProven:false,
  brokerWrites:0,localWrites:0
});
function canonicalUtcMs(v:unknown):number|null{
  if(typeof v!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))
    return null;
  const ms=Date.parse(v);
  return Number.isSafeInteger(ms)&&ms>=946684800000&&
    ms<4102444800000&&new Date(ms).toISOString()===v?ms:null;
}
const allowedKey=(x:unknown):x is string=>
  typeof x==='string'&&
  /^(?:NSE_FO|BSE_FO)\|[A-Za-z0-9_-]{1,240}$/.test(x);
export function assessExactLiveOptionQuote(
  input:unknown,
  expectedInstrumentKey:unknown,
  reviewedAtUtcMs:number
):LiveOptionQuoteFenceResult{
  if(!allowedKey(expectedInstrumentKey)||
     !input||typeof input!=='object'||Array.isArray(input))
    return result(false,null,'UNVERIFIED_QUOTE_SOURCE_OR_CONTRACT');
  const q=input as Record<string,unknown>;
  if(q.source!=='UPSTOX_FULL_MARKET_QUOTE_V3_LTP'||
     q.instrumentKey!==expectedInstrumentKey)
    return result(false,null,'UNVERIFIED_QUOTE_SOURCE_OR_CONTRACT');
  if(typeof q.price!=='number'||!Number.isFinite(q.price)||
     q.price<=0)
    return result(false,null,'QUOTE_PRICE_MISSING_OR_INVALID');
  const t=canonicalUtcMs(q.exchangeTimestamp);
  if(t===null||!Number.isSafeInteger(reviewedAtUtcMs)||
     reviewedAtUtcMs<946684800000||reviewedAtUtcMs>=4102444800000)
    return result(false,null,'EXCHANGE_LAST_TRADE_TIME_MISSING_OR_INVALID');
  if(t>reviewedAtUtcMs+5000||
     reviewedAtUtcMs-t>30_000)
    return result(false,null,'EXCHANGE_LAST_TRADE_TIME_STALE_OR_FUTURE');
  return result(true,q.price,'EXACT_LIVE_OPTION_LTP_FRESH');
}
