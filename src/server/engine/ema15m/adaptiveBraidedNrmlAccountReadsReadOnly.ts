/**
 * Phase127: offline "braided" two-pass account order/GTT/position GET census.
 *
 * Phase125's original BUY trade snapshots and Phase126's active GTT lists
 * remain caller-supplied. They are not atomic, venue signed or historical.
 * This layer requires ORDER -> GTT -> POSITION -> ORDER read receipts in
 * EACH pass and compares all 8 reported sources without creating orders.
 *
 * Ordinary Upstox order book is current day only. Completed GTT parent
 * history cannot be reconstructed from a current GTT list. Repeating
 * account GETs does not make a GTT an exchange-native STOP or authorize
 * NRML SELL/BUY, a retry, or automatic closure.
 *
 * Zero network calls, current clock, writes, routes or trading side effects.
 */
import {
  auditTwoPassNrmlAccountCensusReadOnly,
  type DualAccountCensusInput,
  type DualAccountCensusState
} from './adaptiveDualAccountSellGttCensusReadOnly.js';

type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const iso=(x:unknown):number|null=>{
  if(typeof x!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x))
    return null;
  const ms=Date.parse(x);
  return Number.isSafeInteger(ms)&&ms>=946684800000&&
    ms<4102444800000&&new Date(ms).toISOString()===x?ms:null;
};
/** Conservative bounded semantic canonicalization, including ALL fields. */
function canonical(x:unknown):string|null{
  let fields=0;
  function walk(v:unknown,depth:number):string{
    fields++;
    if(fields>100000||depth>12)throw Error('UNBOUNDED');
    if(v===null)return 'null';
    if(typeof v==='string'){
      if(v.length>20000)throw Error('LONG_STRING');
      return JSON.stringify(v);
    }
    if(typeof v==='number'){
      if(!Number.isFinite(v))throw Error('NONFINITE');
      return JSON.stringify(v);
    }
    if(typeof v==='boolean')return String(v);
    if(Array.isArray(v)){
      if(v.length>10000)throw Error('LONG_ARRAY');
      return '['+v.map(item=>walk(item,depth+1)).join(',')+']';
    }
    if(obj(v)){
      const keys=Object.keys(v).sort();
      if(keys.length>200)throw Error('WIDE_OBJECT');
      return '{'+keys.map(k=>
        JSON.stringify(k)+':'+walk(v[k],depth+1)).join(',')+'}';
    }
    throw Error('UNSUPPORTED');
  }
  try{
    const s=walk(x,0);
    return s.length<=500000?s:null;
  }catch{return null;}
}
type Source='ORDER_BOOK'|'GTT_ORDERS'|'POSITIONS';
export interface AccountReadReceipt{
  accountId:string;
  authEpoch:string;
  requestReceiptId:string;
  captureAtUtc:string;
  source:Source;
  rows:unknown;
}
export interface BraidedAccountReadPass{
  orderBefore:AccountReadReceipt;
  gtt:AccountReadReceipt;
  positions:AccountReadReceipt;
  orderAfter:AccountReadReceipt;
}
export interface BraidedAccountInput{
  originalBuyAndCensus:DualAccountCensusInput;
  first:BraidedAccountReadPass;
  second:BraidedAccountReadPass;
  maxPassWindowSeconds:number;
  maxTotalReadWindowSeconds:number;
  /** Caller-declared source known incomplete across past trading days. */
  currentDayOnlyOrderBook:true;
  /** Completed GTT parents not returned by ordinary native GTT GET. */
  completedGttParentsUnavailable:true;
}
export type BraidedAccountState=
  'INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW'|
  'BROKER_RECEIPT_ID_DUPLICATE_OR_READ_CLOCK_REVERSED'|
  'BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_BETWEEN_ENDPOINTS'|
  'ORDER_GTT_POSITION_GET_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED'|
  'DUPLICATE_ACCOUNT_ORDER_GTT_OR_POSITION_KEY'|
  'ORDERBOOK_CHANGED_WITHIN_FIRST_OR_SECOND_PASS'|
  'ORDERBOOK_CHANGED_BETWEEN_PASSES'|
  'GTT_PARENT_CHANGED_BETWEEN_PASSES'|
  'POSITION_LONG_OR_OTHER_EXPOSURE_CHANGED_BETWEEN_PASSES'|
  'BRAID_SOURCE_DIFFERS_FROM_PHASE125_126_ACCOUNT_CENSUS'|
  'PHASE126_BUY_CENSUS_OR_GTT_ALREADY_QUARANTINED'|
  'EIGHT_SOURCE_READ_BRAID_STABLE_SAME_SECOND_GTT_UNRESOLVED'|
  'EIGHT_SOURCE_READ_BRAID_STABLE_NOT_HISTORICALLY_ATTESTED';
export interface BraidedAccountReport{
  state:BraidedAccountState;
  reasonCodes:readonly string[];
  phase126State:DualAccountCensusState|null;
  reviewedReadReceipts:number;
  firstPassDurationMs:number|null;
  secondPassDurationMs:number|null;
  totalBraidedWindowMs:number|null;
  currentDayOrderBookNotHistorical:true;
  completedGttParentsUnavailableFromGet:true;
  readReceiptIdsOrSessionEpochBrokerAttested:false;
  twoPassSourcesIndependentOrAtomic:false;
  historicBuySellAndGttContinuityVerified:false;
  originalTradeTimestampsExchangeSigned:false;
  authenticFnoExpiryAndLotCalendarVerified:false;
  fullAccountNoDuplicateSellExposureCertified:false;
  gttConditionalSellExchangeStopAcknowledged:false;
  brokerCloseOnlyNoShortNrmlVerified:false;
  persistentOvernightProtectionCertified:false;
  overnightGapLimitFillGuaranteed:false;
  independentLiveReleaseApproved:false;
  liveNrmlBuyAuthorized:false;
  retrySellAuthorized:false;
  autoPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  positional1515ForcedSquareOff:false;
  brokerOrderOrGttWritesAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type D=Partial<Pick<BraidedAccountReport,
  'phase126State'|'reviewedReadReceipts'|'firstPassDurationMs'|
  'secondPassDurationMs'|'totalBraidedWindowMs'>>;
const report=(state:BraidedAccountState,code:string,
  d:D={}):BraidedAccountReport=>({
  state,reasonCodes:[code],
  phase126State:d.phase126State??null,
  reviewedReadReceipts:d.reviewedReadReceipts??0,
  firstPassDurationMs:d.firstPassDurationMs??null,
  secondPassDurationMs:d.secondPassDurationMs??null,
  totalBraidedWindowMs:d.totalBraidedWindowMs??null,
  currentDayOrderBookNotHistorical:true,
  completedGttParentsUnavailableFromGet:true,
  readReceiptIdsOrSessionEpochBrokerAttested:false,
  twoPassSourcesIndependentOrAtomic:false,
  historicBuySellAndGttContinuityVerified:false,
  originalTradeTimestampsExchangeSigned:false,
  authenticFnoExpiryAndLotCalendarVerified:false,
  fullAccountNoDuplicateSellExposureCertified:false,
  gttConditionalSellExchangeStopAcknowledged:false,
  brokerCloseOnlyNoShortNrmlVerified:false,
  persistentOvernightProtectionCertified:false,
  overnightGapLimitFillGuaranteed:false,
  independentLiveReleaseApproved:false,
  liveNrmlBuyAuthorized:false,
  retrySellAuthorized:false,
  autoPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,
  positional1515ForcedSquareOff:false,
  brokerOrderOrGttWritesAuthorized:false,
  brokerWrites:0,localWrites:0
});
type SetResult={s:string|null;duplicate:boolean};
function makeSet(rows:unknown,kind:Source):SetResult{
  if(!Array.isArray(rows)||rows.length>10000)
    return {s:null,duplicate:false};
  const byKey=new Map<string,string>();
  for(const x of rows){
    if(!obj(x))return {s:null,duplicate:false};
    let key:string|null=null;
    if(kind==='ORDER_BOOK'){
      key=id(x.order_id)&&typeof x.instrument_token==='string'&&
        typeof x.product==='string'?x.order_id:null;
    }else if(kind==='GTT_ORDERS'){
      key=id(x.gtt_order_id)&&typeof x.instrument_token==='string'&&
        typeof x.product==='string'?x.gtt_order_id:null;
    }else if(typeof x.instrument_token==='string'&&
             typeof x.product==='string'){
      key=x.instrument_token+'|'+x.product;
      if(key.length>384)key=null;
    }
    if(!key)return {s:null,duplicate:false};
    if(byKey.has(key))return {s:null,duplicate:true};
    const encoded=canonical(x);
    if(encoded===null)return {s:null,duplicate:false};
    byKey.set(key,encoded);
  }
  const serialized=canonical([...byKey].sort(([a],[b])=>a.localeCompare(b)));
  return {s:serialized,duplicate:false};
}
function read(x:AccountReadReceipt,k:Source):number|null{
  return x?.source===k?iso(x.captureAtUtc):null;
}
export function auditBraidedNrmlAccountReadsReadOnly(
  x:BraidedAccountInput
):BraidedAccountReport{
  const original=x?.originalBuyAndCensus;
  const prior=original?.originalBuy;
  const first=x?.first,second=x?.second;
  const acct=prior?.expectedAccountId,epoch=prior?.expectedAuthEpoch;
  if(!x||!prior||!first||!second||
     !id(acct)||!id(epoch)||
     !Number.isSafeInteger(x.maxPassWindowSeconds)||
     x.maxPassWindowSeconds<1||x.maxPassWindowSeconds>60||
     !Number.isSafeInteger(x.maxTotalReadWindowSeconds)||
     x.maxTotalReadWindowSeconds<2||
     x.maxTotalReadWindowSeconds>180||
     x.currentDayOnlyOrderBook!==true||
     x.completedGttParentsUnavailable!==true)
    return report('INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW',
      'BOUNDED_ACCOUNT_NONGUARANTEED_HISTORY_BRAID_REQUIRED');
  const passes=[first,second];
  const receipts=passes.flatMap(p=>[
    p.orderBefore,p.gtt,p.positions,p.orderAfter
  ]);
  if(receipts.some(r=>!r))
    return report('INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW',
      'ALL_EIGHT_GET_RECEIPTS_REQUIRED');
  const keys:Source[]=['ORDER_BOOK','GTT_ORDERS',
    'POSITIONS','ORDER_BOOK'];
  const times=receipts.map((r,i)=>read(r,keys[i%4]));
  const firstPrior=iso(prior.first?.input?.captureAtUtc);
  const secondPrior=iso(prior.second?.input?.captureAtUtc);
  const review=iso(prior.first?.input?.cohortScope?.reviewedAtUtc);
  if(times.some(t=>t===null)||firstPrior===null||secondPrior===null||
     review===null||secondPrior>=review)
    return report('INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW',
      'CANONICAL_BRAID_ORIGINAL_BUY_REVIEW_TIMES_REQUIRED');
  const ids=new Set<string>();
  for(const r of receipts){
    if(!id(r.requestReceiptId)||
       ids.has(r.requestReceiptId)||
       r.requestReceiptId===prior.first.requestReceiptId||
       r.requestReceiptId===prior.second.requestReceiptId)
      return report('BROKER_RECEIPT_ID_DUPLICATE_OR_READ_CLOCK_REVERSED',
        'DISTINCT_EIGHT_CAPTURE_RECEIPT_IDS_REQUIRED');
    ids.add(r.requestReceiptId);
    if(r.accountId!==acct||r.authEpoch!==epoch)
      return report('BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_BETWEEN_ENDPOINTS',
        'SAME_ACCOUNT_AND_BROKER_AUTH_EPOCH_ACROSS_EIGHT_GETS_REQUIRED');
  }
  for(let i=0;i<times.length;i++){
    if(i===0){
      if(times[0]!>secondPrior)
        return report('BROKER_RECEIPT_ID_DUPLICATE_OR_READ_CLOCK_REVERSED',
          'BRAID_MUST_FOLLOW_TWO_ORIGINAL_BUY_CAPTURES');
    }else if(times[i]!<=times[i-1]!)
      return report('BROKER_RECEIPT_ID_DUPLICATE_OR_READ_CLOCK_REVERSED',
        'EIGHT_GET_TIMES_MUST_BE_STRICTLY_INCREASING');
  }
  const firstDur=times[3]!-times[0]!,
    secondDur=times[7]!-times[4]!,
    totalDur=times[7]!-times[0]!;
  const d:D={reviewedReadReceipts:8,firstPassDurationMs:firstDur,
    secondPassDurationMs:secondDur,totalBraidedWindowMs:totalDur};
  if(times[7]!>review||
     firstDur>x.maxPassWindowSeconds*1000||
     secondDur>x.maxPassWindowSeconds*1000||
     totalDur>x.maxTotalReadWindowSeconds*1000)
    return report('INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW',
      'BRAID_GETS_AFTER_REVIEW_OR_BOUNDED_PASS_TIME_EXCEEDED',d);
  const normalized=receipts.map((r,i)=>makeSet(r.rows,keys[i%4]));
  if(normalized.some(v=>v.duplicate))
    return report('DUPLICATE_ACCOUNT_ORDER_GTT_OR_POSITION_KEY',
      'DUPLICATE_NATIVE_ORDER_GTT_OR_PRODUCT_POSITION_KEY',d);
  if(normalized.some(v=>v.s===null))
    return report('ORDER_GTT_POSITION_GET_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED',
      'UNFILTERED_CURRENT_GET_ARRAYS_MUST_BE_FULL_AND_BOUNDED',d);
  const s=normalized.map(y=>y.s!);
  // Two order book reads bracket each GTT and position read. A change
  // within a single pass is TOCTOU, not a stable SELL/long exposure.
  if(s[0]!==s[3]||s[4]!==s[7])
    return report('ORDERBOOK_CHANGED_WITHIN_FIRST_OR_SECOND_PASS',
      'CURRENT_ORDER_STATE_MOVED_WHILE_OTHER_ACCOUNT_GETS_IN_FLIGHT',d);
  if(s[0]!==s[4])
    return report('ORDERBOOK_CHANGED_BETWEEN_PASSES',
      'CURRENT_DAY_ORDER_ID_STATUS_QUANTITY_OR_FILLED_DRIFT',d);
  if(s[1]!==s[5])
    return report('GTT_PARENT_CHANGED_BETWEEN_PASSES',
      'CURRENT_GTT_ID_RULE_QUANTITY_OR_CHILD_DRIFT',d);
  if(s[2]!==s[6])
    return report('POSITION_LONG_OR_OTHER_EXPOSURE_CHANGED_BETWEEN_PASSES',
      'CURRENT_ACCOUNT_POSITION_NET_OR_OTHER_PRODUCT_MOVED',d);
  const snapshot=prior.first.input.cohortEvidence;
  const oldOrder=makeSet(snapshot.orderBook,'ORDER_BOOK');
  const oldPosition=makeSet(snapshot.positions,'POSITIONS');
  const oldGtt1=makeSet(original.first.allGttOrders,'GTT_ORDERS');
  const oldGtt2=makeSet(original.second.allGttOrders,'GTT_ORDERS');
  if(oldOrder.s===null||oldPosition.s===null||
     oldGtt1.s===null||oldGtt2.s===null||
     oldOrder.duplicate||oldPosition.duplicate||
     oldGtt1.duplicate||oldGtt2.duplicate||
     oldOrder.s!==s[0]||oldPosition.s!==s[2]||
     oldGtt1.s!==s[1]||oldGtt2.s!==s[5])
    return report('BRAID_SOURCE_DIFFERS_FROM_PHASE125_126_ACCOUNT_CENSUS',
      'EIGHT_GET_CAPTURE_DOES_NOT_MATCH_PRIOR_ORIGINAL_BUY_ACCOUNT_ROWS',d);
  const upstream=auditTwoPassNrmlAccountCensusReadOnly(original);
  d.phase126State=upstream.state;
  if(![
    'CURRENT_CENSUS_STABLE_GTT_SAME_SECOND_BUY_UNRESOLVED',
    'CURRENT_CENSUS_NO_VISIBLE_CONFLICT_NOT_HISTORICALLY_COMPLETE'
  ].includes(upstream.state))
    return report('PHASE126_BUY_CENSUS_OR_GTT_ALREADY_QUARANTINED',
      'PRIOR_CURRENT_DAY_OR_ORIGINAL_ENTRY_GTT_BLOCKS_LIVE_NRML',d);
  if(upstream.state==='CURRENT_CENSUS_STABLE_GTT_SAME_SECOND_BUY_UNRESOLVED')
    return report('EIGHT_SOURCE_READ_BRAID_STABLE_SAME_SECOND_GTT_UNRESOLVED',
      'REPEATED_READS_CANNOT_RESOLVE_SUBSECOND_BUY_OR_PROTECTIVE_STOP',d);
  return report('EIGHT_SOURCE_READ_BRAID_STABLE_NOT_HISTORICALLY_ATTESTED',
    'CURRENT_BROKER_GET_AGREEMENT_IS_NOT_HISTORICAL_OR_VENUE_SIGNED',d);
}
