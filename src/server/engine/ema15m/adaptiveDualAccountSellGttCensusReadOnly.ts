/**
 * Phase126: OFFLINE two-pass same-contract order / GTT / NRML net census
 * joined to Phase125's immutable original BUY trade snapshots.
 *
 * Upstox v2 ordinary order book is CURRENT TRADING DAY ONLY; v3 GTT GET
 * cannot retrieve completed GTT parents. Absence is never evidence of
 * historic absence or account-wide protection. This module deliberately
 * quarantines missing original BUY in the *current day* book separately.
 *
 * No HTTP, wall clock, orders, state mutations, P&L, or live-NRML release.
 * All input is caller-supplied and UNSIGNED, including "account" and epoch.
 */
import {
  auditDoubleNativeBuyTradeCaptureReadOnly,
  type NativeBuyTradeDoubleCapture,
  type NativeBuyTradeDoubleState
} from './adaptiveDoubleNativeBuyTradeReadOnlyAudit.js';
import {parseUpstoxExchangeTradeTimestampAssumedIst} from
  './adaptiveUpstoxNativeTradeClockProvenanceReadOnly.js';

type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
const whole=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const orderTerminal=new Set(['COMPLETE','COMPLETED','FILLED',
  'CANCELLED','CANCELED','REJECTED','FAILED','EXPIRED']);
const noFillTerminal=new Set(['CANCELLED','CANCELED',
  'REJECTED','FAILED','EXPIRED']);
const requiredUtc=(x:unknown):number|null=>{
  if(typeof x!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x))
    return null;
  const at=Date.parse(x);
  return Number.isSafeInteger(at)&&at>=946684800000&&
    at<4102444800000&&new Date(at).toISOString()===x?at:null;
};
const istDay=(utcMs:number)=>new Date(utcMs+330*60_000)
  .toISOString().slice(0,10);
/** No source object values get included in any report. */
export interface AccountCensusReadPass{
  accountId:string;
  authEpoch:string;
  requestReceiptId:string;
  captureAtUtc:string;
  /** Unfiltered broker GET-shaped current GTT list, operator supplied. */
  allGttOrders:unknown;
  /** Current-day Upstox ordinary book, not archived order history. */
  orderBookIsCurrentTradingDayOnly:true;
  /** GTT GET cannot retrieve completed parents. */
  gttGetCannotRetrieveCompletedParents:true;
}
export interface DualAccountCensusInput{
  originalBuy:NativeBuyTradeDoubleCapture;
  first:AccountCensusReadPass;
  second:AccountCensusReadPass;
}
export type DualAccountCensusState=
  'INVALID_ACCOUNT_CENSUS_SOURCE_SCOPE_OR_CLOCK'|
  'ACCOUNT_CENSUS_GTT_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED'|
  'ACCOUNT_WIDE_GTT_PARENT_ID_DUPLICATE'|
  'ACCOUNT_GTT_CENSUS_CHANGED_BETWEEN_READS'|
  'SELECTED_GTT_PARENT_MISSING_OR_SOURCE_DISAGREES'|
  'COMPETING_SAME_OPTION_GTT_PARENT_EXISTS'|
  'ACCOUNT_ORDER_OR_POSITION_SNAPSHOT_MALFORMED'|
  'ACCOUNT_ORDER_ID_DUPLICATE_OR_CENSUS_INCOMPLETE'|
  'SAME_OPTION_OTHER_PRODUCT_EXPOSURE_UNRESOLVED'|
  'BROKER_CURRENT_NRML_NET_NOT_EXACT_UNIQUE_POSITIVE_LOT'|
  'ORIGINAL_BUY_ABSENT_FROM_CURRENT_DAY_ORDERBOOK_UNKNOWN'|
  'ORIGINAL_BUY_CURRENT_DAY_ORDER_CONFLICT'|
  'ORIGINAL_BUY_REPORTED_EXECUTION_OUTSIDE_CURRENT_DAY_BOOK'|
  'SAME_CONTRACT_OTHER_BUY_SELL_FILLED_OR_PENDING'|
  'PHASE125_BUY_TRADE_SOURCE_OR_GTT_QUARANTINED'|
  'CURRENT_CENSUS_STABLE_GTT_SAME_SECOND_BUY_UNRESOLVED'|
  'CURRENT_CENSUS_NO_VISIBLE_CONFLICT_NOT_HISTORICALLY_COMPLETE';
export interface DualAccountCensusReport{
  state:DualAccountCensusState;
  reasonCodes:readonly string[];
  phase125State:NativeBuyTradeDoubleState|null;
  selectedGttSeenInBothCurrentLists:boolean;
  originalBuySeenInCurrentDayBook:boolean;
  sameContractOtherGttParentCount:number;
  sameContractOtherOrderCount:number;
  brokerReportedCurrentNetLong:number|null;
  currentDayOnlyNotHistory:true;
  completedGttHistoryUnavailableFromNativeGet:true;
  accountAndAuthEpochIndependentlyAuthenticated:false;
  brokerReadResponsesIndependentlyAttested:false;
  issuerExchangeSessionCalendarAuthenticated:false;
  originalBuyExecutionVenueSigned:false;
  fullAccountPositionHistoricalContinuityVerified:false;
  historicalOrderOrCompletedGttAbsenceCertified:false;
  accountGttAndOrderGetsAtomic:false;
  conditionalGttSellIsExchangeHostedNativeStop:false;
  brokerNrmlNoShortCloseOnlyVerified:false;
  persistentOvernightProtectionCertified:false;
  gapLimitSellFillGuaranteed:false;
  duplicateSellRetryAuthorized:false;
  automaticPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  positional1515SquareOffAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerOrderGttMutationAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type D=Partial<Pick<DualAccountCensusReport,
  'phase125State'|'selectedGttSeenInBothCurrentLists'|
  'originalBuySeenInCurrentDayBook'|'sameContractOtherGttParentCount'|
  'sameContractOtherOrderCount'|'brokerReportedCurrentNetLong'>>;
const report=(state:DualAccountCensusState,reason:string,
  d:D={}):DualAccountCensusReport=>({
  state,reasonCodes:[reason],
  phase125State:d.phase125State??null,
  selectedGttSeenInBothCurrentLists:
    d.selectedGttSeenInBothCurrentLists===true,
  originalBuySeenInCurrentDayBook:d.originalBuySeenInCurrentDayBook===true,
  sameContractOtherGttParentCount:d.sameContractOtherGttParentCount??0,
  sameContractOtherOrderCount:d.sameContractOtherOrderCount??0,
  brokerReportedCurrentNetLong:d.brokerReportedCurrentNetLong??null,
  currentDayOnlyNotHistory:true,
  completedGttHistoryUnavailableFromNativeGet:true,
  accountAndAuthEpochIndependentlyAuthenticated:false,
  brokerReadResponsesIndependentlyAttested:false,
  issuerExchangeSessionCalendarAuthenticated:false,
  originalBuyExecutionVenueSigned:false,
  fullAccountPositionHistoricalContinuityVerified:false,
  historicalOrderOrCompletedGttAbsenceCertified:false,
  accountGttAndOrderGetsAtomic:false,
  conditionalGttSellIsExchangeHostedNativeStop:false,
  brokerNrmlNoShortCloseOnlyVerified:false,
  persistentOvernightProtectionCertified:false,
  gapLimitSellFillGuaranteed:false,
  duplicateSellRetryAuthorized:false,
  automaticPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,
  positional1515SquareOffAuthorized:false,
  liveNrmlBuyAuthorized:false,
  brokerOrderGttMutationAuthorized:false,
  brokerWrites:0,localWrites:0
});
type Parsed={
  map:Map<string,string>|null;
  rows:Map<string,Row>|null;
  duplicate:boolean;
};
const gttFields=['gtt_order_id','instrument_token','exchange',
  'product','type','quantity','created_at','expires_at','rules'];
const fingerprint=(g:Row)=>JSON.stringify(
  gttFields.map(k=>g[k]??null));
function parseGtts(x:unknown):Parsed{
  if(!Array.isArray(x)||x.length>10000)
    return {map:null,rows:null,duplicate:false};
  const map=new Map<string,string>(),rows=new Map<string,Row>();
  for(const g of x){
    if(!obj(g)||!id(g.gtt_order_id)||
       typeof g.instrument_token!=='string'||
       typeof g.product!=='string'||
       !Array.isArray(g.rules)||g.rules.length>3)
      return {map:null,rows:null,duplicate:false};
    if(map.has(g.gtt_order_id))
      return {map:null,rows:null,duplicate:true};
    let fp:string;
    try{
      const raw=JSON.stringify(g);
      if(raw.length>20000)
        return {map:null,rows:null,duplicate:false};
      fp=fingerprint(g);
    }catch{
      return {map:null,rows:null,duplicate:false};
    }
    if(fp.length>20000)
      return {map:null,rows:null,duplicate:false};
    map.set(g.gtt_order_id,fp);
    rows.set(g.gtt_order_id,g);
  }
  return {map,rows,duplicate:false};
}
const matchingGtt=(a:Row,b:Row)=>fingerprint(a)===fingerprint(b);
const validOrder=(o:Row)=>id(o.order_id)&&
  typeof o.instrument_token==='string'&&
  ['D','I','MTF','CO'].includes(String(o.product));
const validPosition=(p:Row)=>typeof p.instrument_token==='string'&&
  ['D','I','MTF','CO'].includes(String(p.product));
export function auditTwoPassNrmlAccountCensusReadOnly(
  x:DualAccountCensusInput
):DualAccountCensusReport{
  const b=x?.originalBuy,s=b?.first,t=b?.second;
  const a=x?.first,c=x?.second;
  if(!x||!b||!s||!t||!a||!c||
     !id(b.expectedAccountId)||!id(b.expectedAuthEpoch)||
     !id(a.accountId)||!id(c.accountId)||
     a.accountId!==b.expectedAccountId||
     c.accountId!==b.expectedAccountId||
     a.authEpoch!==b.expectedAuthEpoch||
     c.authEpoch!==b.expectedAuthEpoch||
     a.requestReceiptId!==s.requestReceiptId||
     c.requestReceiptId!==t.requestReceiptId||
     a.captureAtUtc!==s.input?.captureAtUtc||
     c.captureAtUtc!==t.input?.captureAtUtc||
     requiredUtc(a.captureAtUtc)===null||
     requiredUtc(c.captureAtUtc)===null||
     a.orderBookIsCurrentTradingDayOnly!==true||
     c.orderBookIsCurrentTradingDayOnly!==true||
     a.gttGetCannotRetrieveCompletedParents!==true||
     c.gttGetCannotRetrieveCompletedParents!==true)
    return report('INVALID_ACCOUNT_CENSUS_SOURCE_SCOPE_OR_CLOCK',
      'EXACT_TWO_PASS_ACCOUNT_EPOCH_CLOCK_AND_LIMITATION_DECLARATION_REQUIRED');
  const scope=s.input?.cohortScope;
  if(!scope||scope.product!=='NRML'||!id(scope.originalBuyOrderId)||
     !id(scope.gttOrderId)||
     typeof scope.instrumentKey!=='string'||
     !/^(?:NSE_FO|BSE_FO)\|[A-Za-z0-9_-]{1,240}$/.test(scope.instrumentKey)||
     !Number.isSafeInteger(scope.assertedCurrentNetLongQuantity)||
     scope.assertedCurrentNetLongQuantity<=0||
     !Number.isSafeInteger(scope.lotSize)||scope.lotSize<=0)
    return report('INVALID_ACCOUNT_CENSUS_SOURCE_SCOPE_OR_CLOCK',
      'NRML_ORIGINAL_BUY_SCOPE_MISSING');
  const p=parseGtts(a.allGttOrders),q=parseGtts(c.allGttOrders);
  if(p.duplicate||q.duplicate)
    return report('ACCOUNT_WIDE_GTT_PARENT_ID_DUPLICATE',
      'DUPLICATE_GTT_ID_IN_CURRENT_GET_LIST');
  if(!p.map||!q.map||!p.rows||!q.rows)
    return report('ACCOUNT_CENSUS_GTT_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED',
      'CURRENT_ACCOUNT_GTT_LIST_NOT_COMPLETE_PARSEABLE_OR_BOUNDED');
  if(p.map.size!==q.map.size||
     [...p.map].some(([k,v])=>q.map!.get(k)!==v))
    return report('ACCOUNT_GTT_CENSUS_CHANGED_BETWEEN_READS',
      'GTT_PARENT_ADDED_DISAPPEARED_OR_REPRICED_ACROSS_READS');
  const raw=s.input.cohortEvidence?.existingSingleSellGtt;
  if(!obj(raw)||!p.rows.has(scope.gttOrderId)||
     !matchingGtt(p.rows.get(scope.gttOrderId)!,raw)||
     !q.rows.has(scope.gttOrderId)||
     !matchingGtt(q.rows.get(scope.gttOrderId)!,raw))
    return report('SELECTED_GTT_PARENT_MISSING_OR_SOURCE_DISAGREES',
      'EXACT_GTT_DETAILS_MUST_MATCH_BOTH_UNFILTERED_BROKER_LISTS');
  const d:D={selectedGttSeenInBothCurrentLists:true};
  for(const g of p.rows.values()){
    if(g.instrument_token!==scope.instrumentKey)continue;
    if(g.gtt_order_id!==scope.gttOrderId){
      d.sameContractOtherGttParentCount=
        (d.sameContractOtherGttParentCount??0)+1;
      return report('COMPETING_SAME_OPTION_GTT_PARENT_EXISTS',
        'OTHER_SAME_CONTRACT_GTT_PARENT_MAY_GENERATE_UNTRACKED_ORDER',d);
    }
  }
  const orders=s.input.cohortEvidence?.orderBook;
  const positions=s.input.cohortEvidence?.positions;
  if(!Array.isArray(orders)||!Array.isArray(positions)||
     orders.length>10000||positions.length>10000||
     orders.some(y=>!obj(y)||!validOrder(y))||
     positions.some(y=>!obj(y)||!validPosition(y)))
    return report('ACCOUNT_ORDER_OR_POSITION_SNAPSHOT_MALFORMED',
      'UNFILTERED_BROKER_CURRENT_ORDER_OR_POSITION_ROWS_MALFORMED',d);
  const seenOrders=new Set<string>();
  for(const o of orders){
    if(seenOrders.has(o.order_id))
      return report('ACCOUNT_ORDER_ID_DUPLICATE_OR_CENSUS_INCOMPLETE',
        'DUPLICATE_NATIVE_ORDER_ID_IN_CURRENT_DAY_BOOK',d);
    seenOrders.add(o.order_id);
    if(o.instrument_token===scope.instrumentKey&&o.product!=='D')
      return report('SAME_OPTION_OTHER_PRODUCT_EXPOSURE_UNRESOLVED',
        'SAME_OPTION_MIS_OR_MTF_ORDER_MAY_CHANGE_NRML_NET',d);
  }
  if(positions.some(y=>y.instrument_token===scope.instrumentKey&&
      y.product!=='D'))
    return report('SAME_OPTION_OTHER_PRODUCT_EXPOSURE_UNRESOLVED',
      'SAME_OPTION_OTHER_PRODUCT_POSITION_EXISTS',d);
  const nets=positions.filter(y=>y.instrument_token===scope.instrumentKey&&
    y.product==='D');
  if(nets.length!==1||!whole(nets[0].net_quantity)||
     nets[0].net_quantity!==scope.assertedCurrentNetLongQuantity||
     nets[0].net_quantity%scope.lotSize!==0)
    return report('BROKER_CURRENT_NRML_NET_NOT_EXACT_UNIQUE_POSITIVE_LOT',
      'BROKER_NRML_LONG_UNKNOWN_MULTIPLE_NONLOT_OR_MISMATCHED',d);
  d.brokerReportedCurrentNetLong=scope.assertedCurrentNetLongQuantity;
  // Upstox orderBook is current DAY only; a valid multi-day entry's
  // historical BUY need not be visible. Never manufacture it.
  const sourceBuy=orders.filter(o=>o.order_id===scope.originalBuyOrderId);
  if(sourceBuy.length!==1)
    return report('ORIGINAL_BUY_ABSENT_FROM_CURRENT_DAY_ORDERBOOK_UNKNOWN',
      'ORIGINAL_BUY_NOT_IN_TODAY_ORDERBOOK_IS_NOT_PROOF_OF_ABSENCE',d);
  const original=sourceBuy[0];
  if(original.instrument_token!==scope.instrumentKey||
     original.product!=='D'||upper(original.transaction_type)!=='BUY'||
     !['COMPLETE','COMPLETED','FILLED'].includes(upper(original.status))||
     original.filled_quantity!==scope.originalQuantity||
     original.pending_quantity!==0||
     original.quantity!==scope.originalQuantity)
    return report('ORIGINAL_BUY_CURRENT_DAY_ORDER_CONFLICT',
      'CURRENT_DAY_ORIGINAL_BUY_NOT_EXACT_FILLED_ORDER',d);
  d.originalBuySeenInCurrentDayBook=true;
  // Per-order trade exchange_timestamp is only an unverified local-second
  // label. Still, if its declared IST date is not the current-day
  // order-book snapshot's local date, today's BUY row is contradictory
  // rather than independent evidence of an old original purchase.
  // Missing/malformed times are left to the stricter Phase124/125 gate.
  const tradeResponse=s.input.perOrderTradeResponse;
  if(obj(tradeResponse)&&Array.isArray(tradeResponse.data)){
    for(const row of tradeResponse.data){
      if(!obj(row))continue;
      const time=parseUpstoxExchangeTradeTimestampAssumedIst(
        row.exchange_timestamp);
      if(time!==null&&istDay(Date.parse(time))!==
         istDay(requiredUtc(s.input.captureAtUtc)!))
        return report('ORIGINAL_BUY_REPORTED_EXECUTION_OUTSIDE_CURRENT_DAY_BOOK',
          'REPORTED_ORIGINAL_TRADE_DAY_DIFFERS_FROM_TODAY_ONLY_ORDERBOOK',
          d);
    }
  }
  for(const o of orders){
    if(o.instrument_token!==scope.instrumentKey||
       o.order_id===scope.originalBuyOrderId)continue;
    d.sameContractOtherOrderCount=(d.sameContractOtherOrderCount??0)+1;
    const state=upper(o.status);
    // Any external filled BUY or SELL, active, unknown or pending order
    // could alter the actual long or cause an accidental short SELL.
    if(!id(o.order_id)||!whole(o.filled_quantity)||
       !whole(o.pending_quantity)||
       !['BUY','SELL'].includes(upper(o.transaction_type))||
       !orderTerminal.has(state)||
       !noFillTerminal.has(state)||
       o.filled_quantity!==0||o.pending_quantity!==0)
      return report('SAME_CONTRACT_OTHER_BUY_SELL_FILLED_OR_PENDING',
        'ACCOUNT_BOOK_CONTAINS_OTHER_ACTIVE_FILLED_OR_UNKNOWN_OPTION_ORDER',d);
  }
  const reviewed=requiredUtc(scope.reviewedAtUtc);
  const buyAt=requiredUtc(s.input.captureAtUtc);
  // Current-day-only sighting cannot be corroborated by a separately
  // authenticated exchange calendar. IST day is only a diagnostic boundary.
  if(reviewed===null||buyAt===null||istDay(reviewed)!==istDay(buyAt))
    return report('INVALID_ACCOUNT_CENSUS_SOURCE_SCOPE_OR_CLOCK',
      'REVIEW_AND_ORDERBOOK_CAPTURE_LOCAL_DATE_MISMATCH',d);
  const upstream=auditDoubleNativeBuyTradeCaptureReadOnly(b);
  d.phase125State=upstream.state;
  if(upstream.state!=='TWO_READS_STABLE_GTT_SAME_SECOND_EXECUTION_UNRESOLVED'&&
     upstream.state!=='TWO_READS_STABLE_NATIVE_BUY_COHORT_UNATTESTED')
    return report('PHASE125_BUY_TRADE_SOURCE_OR_GTT_QUARANTINED',
      'TWO_PASS_ORIGINAL_BUY_TRADE_COHORT_NOT_STABLE',d);
  if(upstream.state==='TWO_READS_STABLE_GTT_SAME_SECOND_EXECUTION_UNRESOLVED')
    return report('CURRENT_CENSUS_STABLE_GTT_SAME_SECOND_BUY_UNRESOLVED',
      'SAME_EXECUTION_SECOND_GTT_ORDERING_AND_COVERAGE_NOT_PROVEN',d);
  return report('CURRENT_CENSUS_NO_VISIBLE_CONFLICT_NOT_HISTORICALLY_COMPLETE',
    'CURRENT_DAY_AND_ACTIVE_GTT_LIST_ARE_NOT_MULTI_SESSION_HISTORY',d);
}
