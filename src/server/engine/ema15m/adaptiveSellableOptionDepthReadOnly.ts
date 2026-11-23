/**
 * Phase132: OFFLINE, fail-closed top-of-book liquidity gate for legacy MIS
 * live option monitoring. Upstox Full Market Quote V3 exposes D5 depth;
 * the adapter supplies the first bid/ask, requested option key, and
 * exchange snapshot timestamp. Neither snapshot nor LTP is venue-signed.
 *
 * A best bid is only indicative and may vanish; there is NO order fill
 * guarantee, close-only NRML stop, or broker order in this pure module.
 */
import {assessExactLiveOptionQuote} from './adaptiveLiveOptionQuoteFence.js';

export type SellableOptionBookReason=
  'LTP_IDENTITY_OR_TRADE_CLOCK_UNVERIFIED'|
  'BOOK_SOURCE_OR_SNAPSHOT_CLOCK_INVALID'|
  'BOOK_SNAPSHOT_STALE_OR_FUTURE'|
  'BOOK_LAST_TRADE_AFTER_SNAPSHOT_AMBIGUOUS'|
  'BEST_BID_ASK_INVALID_OR_CROSSED'|
  'BEST_BID_QUANTITY_BELOW_POSITION_LONG'|
  'BEST_BID_ASK_SPREAD_TOO_WIDE'|
  'BEST_BID_SNAPSHOT_INDICATIVE_ONLY';

export interface SellableOptionBookReview{
  accepted:boolean;
  observedSellBid:number|null;
  lastTradePremium:number|null;
  bestBidQuantity:number|null;
  spreadBps:number|null;
  reason:SellableOptionBookReason;
  bestBidIsGuaranteedMarketSellFill:false;
  brokerOrderBookVenueAttested:false;
  riskFreeNativeStopCertified:false;
  liveNrmlBuyAuthorized:false;
  liveNrmlSellAuthorized:false;
  orderMutationAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
const report=(
  accepted:boolean,reason:SellableOptionBookReason,
  observedSellBid:number|null=null,
  lastTradePremium:number|null=null,
  bestBidQuantity:number|null=null,
  spreadBps:number|null=null
):SellableOptionBookReview=>({
  accepted,observedSellBid,lastTradePremium,bestBidQuantity,spreadBps,
  reason,bestBidIsGuaranteedMarketSellFill:false,
  brokerOrderBookVenueAttested:false,riskFreeNativeStopCertified:false,
  liveNrmlBuyAuthorized:false,liveNrmlSellAuthorized:false,
  orderMutationAuthorized:false,brokerWrites:0,localWrites:0
});

/**
 * Upstox V3 quote.timestamp is response snapshot time, generally ISO
 * with IST offset (+05:30). Parse UTC Z or explicit offset only; refuse
 * impossible civil dates normalized by JS Date.parse, including Feb 30.
 */
export function parseStrictQuoteSnapshotTime(x:unknown):number|null{
  if(typeof x!=='string')return null;
  const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}\.\d{3})(Z|([+-])(\d{2}):(\d{2}))$/.exec(x);
  if(!m)return null;
  const hours=m[5]===undefined?0:Number(m[5]);
  const minutes=m[6]===undefined?0:Number(m[6]);
  if(hours>14||minutes>59||(hours===14&&minutes>0))return null;
  const offsetMinutes=m[3]==='Z'?0:(m[4]==='+'?1:-1)*(hours*60+minutes);
  const at=Date.parse(x);
  if(!Number.isSafeInteger(at)||at<946684800000||
     at>=4102444800000)return null;
  if(new Date(at+offsetMinutes*60_000).toISOString().slice(0,23)!==
     m[1]+'T'+m[2])return null;
  return at;
}
const isPrice=(x:unknown):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>0;
const isQty=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
export function assessSellableOptionDepthReadOnly(
  raw:unknown,optionKey:unknown,reviewAtMs:number,
  requiredSellQuantity:unknown
):SellableOptionBookReview{
  const ltp=assessExactLiveOptionQuote(raw,optionKey,reviewAtMs);
  if(!ltp.accepted||ltp.price===null)
    return report(false,'LTP_IDENTITY_OR_TRADE_CLOCK_UNVERIFIED');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    return report(false,'BOOK_SOURCE_OR_SNAPSHOT_CLOCK_INVALID');
  const q=raw as Record<string,unknown>;
  if(q.bookSource!=='UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5')
    return report(false,'BOOK_SOURCE_OR_SNAPSHOT_CLOCK_INVALID');
  const snapshot=parseStrictQuoteSnapshotTime(q.snapshotTimestamp);
  const trade=parseStrictQuoteSnapshotTime(q.exchangeTimestamp);
  if(snapshot===null||trade===null)
    return report(false,'BOOK_SOURCE_OR_SNAPSHOT_CLOCK_INVALID');
  // Two independent age checks: trade clock (Phase131) and quote snapshot.
  // The 10-second snapshot budget is a conservative local risk filter,
  // NOT broker/exchange availability or execution protection.
  if(snapshot>reviewAtMs+3000||reviewAtMs-snapshot>10_000)
    return report(false,'BOOK_SNAPSHOT_STALE_OR_FUTURE');
  // A trade that allegedly occurs after the quote snapshot is ambiguous.
  if(trade>snapshot+2000)
    return report(false,'BOOK_LAST_TRADE_AFTER_SNAPSHOT_AMBIGUOUS');
  if(!isPrice(q.bestBidPrice)||!isPrice(q.bestAskPrice)||
     !isQty(q.bestBidQuantity)||!isQty(q.bestAskQuantity)||
     q.bestBidPrice>q.bestAskPrice)
    return report(false,'BEST_BID_ASK_INVALID_OR_CROSSED');
  if(!isQty(requiredSellQuantity)||
     q.bestBidQuantity<requiredSellQuantity)
    return report(false,'BEST_BID_QUANTITY_BELOW_POSITION_LONG');
  const mid=(q.bestBidPrice+q.bestAskPrice)/2;
  const spreadBps=10_000*(q.bestAskPrice-q.bestBidPrice)/mid;
  if(!Number.isFinite(spreadBps)||spreadBps<0||
     spreadBps>2000)
    return report(false,'BEST_BID_ASK_SPREAD_TOO_WIDE');
  return report(true,'BEST_BID_SNAPSHOT_INDICATIVE_ONLY',
    q.bestBidPrice,ltp.price,q.bestBidQuantity,spreadBps);
}
