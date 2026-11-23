/**
 * Phase123 — pure OFFLINE original NRML option BUY multi-fill cohort join.
 *
 * Phase122's single-fill anchor is not valid for fragmented BUY executions.
 * This caller-supplied source shape joins exact original BUY order/book,
 * per-order trade IDs, order-average price, current asserted net and the
 * EXISTING broker SINGLE GTT SELL before comparing 1/2/4/8 nominal weeks
 * against the EARLIEST original execution (never a fresh review clock).
 *
 * executedAtUtc is a normalized, UNATTESTED asserted trade timestamp; it is
 * not documented broker per-trade proof or a substitute for signed venue data.
 * IST calendar-day groupings DO NOT authenticate exchange sessions.
 *
 * No broker requests, wall clock reads, filesystem, account/order writes,
 * ledger close, P&L, emergency stop placement or release of LIVE NRML BUY.
 */
import {validUpstoxGttTimeFieldsIfPresent} from
  './adaptiveNrmlGttExpiryHorizonReadOnlyAudit.js';

type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const firstMs=946684800000;
const lastMs=4102444800000;
const dayMs=86_400_000;
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const option=(x:unknown):x is string=>
  typeof x==='string'&&/^(?:NSE_FO|BSE_FO)\|[A-Za-z0-9_-]{1,240}$/.test(x);
const gttId=(x:unknown):x is string=>
  typeof x==='string'&&/^GTT-[A-Za-z0-9-]{1,124}$/.test(x);
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const utc=(x:unknown):number|null=>{
  if(typeof x!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x))
    return null;
  const ms=Date.parse(x);
  return Number.isSafeInteger(ms)&&ms>=firstMs&&ms<lastMs&&
    new Date(ms).toISOString()===x?ms:null;
};
const paise=(x:unknown):number|null=>{
  if(typeof x!=='number'||!Number.isFinite(x)||x<=0)return null;
  const p=Math.round(x*100);
  return Number.isSafeInteger(p)&&Math.abs(p-x*100)<0.00001?p:null;
};
const net=(x:unknown):number|null=>{
  if(typeof x==='number')
    return Number.isSafeInteger(x)?x:null;
  if(typeof x==='string'&&/^-?(?:0|[1-9][0-9]*)$/.test(x)){
    const v=Number(x);
    return Number.isSafeInteger(v)?v:null;
  }
  return null;
};
const istDay=(ms:number):string=>
  new Date(ms+330*60_000).toISOString().slice(0,10);

export interface OriginalBuyCohortScope{
  instrumentKey:string;
  originalBuyOrderId:string;
  expectedExchangeOrderId:string;
  gttOrderId:string;
  product:'NRML';
  originalQuantity:number;
  assertedCurrentNetLongQuantity:number;
  lotSize:number;
  selectedWeeks:1|2|4|8;
  reviewedAtUtc:string;
  assertedContractExpiryUtc:string;
}
export interface OriginalBuyCohortEvidence{
  /** Existing complete original BUY order detail from caller. */
  originalBuyOrder:unknown;
  /** Caller-supplied broker order book snapshot, NOT historical completeness. */
  orderBook:unknown;
  /** Original per-order BUY fills with normalized asserted executedAtUtc. */
  originalBuyTrades:unknown;
  /** Caller-supplied current portfolio rows, not complete account history. */
  positions:unknown;
  /** Existing GTT object, NOT an exchange-native protective stop. */
  existingSingleSellGtt:unknown;
}
export type OriginalBuyCohortState=
  'INVALID_NRML_BUY_COHORT_SCOPE'|
  'BROKER_BUY_ORDER_BOOK_OR_POSITION_EVIDENCE_MISSING'|
  'BROKER_ORIGINAL_BUY_ORDER_NOT_FULL_AND_EXACT'|
  'BROKER_ORIGINAL_BUY_ORDERBOOK_DISAGREES'|
  'BROKER_NRML_NET_NOT_UNIQUE_OR_INCONSISTENT'|
  'BUY_TRADE_COHORT_MISSING_OR_TRUNCATED'|
  'BUY_TRADE_IDENTITY_PRICE_OR_EXECUTED_AT_INVALID'|
  'BUY_TRADE_SUM_OR_PREMIUM_AMOUNT_OVERFLOW'|
  'BUY_TRADE_QUANTITY_NOT_CONSERVED'|
  'BUY_TRADE_WEIGHTED_PRICE_DISAGREES'|
  'BUY_FILL_AFTER_REVIEW_OR_HORIZON_OVERFLOW'|
  'BUY_FILLS_SPAN_DIFFERENT_IST_CALENDAR_DATES'|
  'EXISTING_GTT_PARENT_OR_SELL_RULE_MISMATCH'|
  'GTT_MICROSECOND_CREATED_OR_EXPIRED_EVIDENCE_INVALID'|
  'GTT_CREATED_AFTER_REVIEW_CLOCK'|
  'GTT_NOT_SCHEDULED_OR_CHILD_ALREADY_EXISTS'|
  'EARLIEST_BUY_HOLDING_WINDOW_ALREADY_ELAPSED'|
  'GTT_ALREADY_EXPIRED_AT_REVIEW'|
  'ASSERTED_OPTION_CONTRACT_ALREADY_EXPIRED'|
  'ASSERTED_OPTION_CONTRACT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END'|
  'GTT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END'|
  'GTT_EXPIRES_AFTER_ASSERTED_OPTION_EXPIRY'|
  'GTT_PREEXISTED_FIRST_BUY_ORPHAN_SELL_RISK'|
  'GTT_CREATED_WITHIN_PARTIAL_BUY_FILL_INTERVAL'|
  'GTT_CREATED_AFTER_LAST_BUY_UNPROTECTED_GAP'|
  'EARLIEST_BUY_MULTI_FILL_TEMPORAL_OVERLAP_UNVERIFIED';

export interface OriginalBuyCohortReport{
  state:OriginalBuyCohortState;
  reasonCodes:readonly string[];
  selectedWeeks:1|2|4|8|null;
  brokerReportedBuyFillCount:number|null;
  brokerReportedBuyFillQuantity:number|null;
  brokerReportedCurrentNetLong:number|null;
  earliestAssertedBuyFillAtMs:number|null;
  latestAssertedBuyFillAtMs:number|null;
  assertedBuyFillSpanMs:number|null;
  firstBuyAnchoredHoldingEndMs:number|null;
  reviewRollingHoldingEndMs:number|null;
  assertedContractExpiryAtMs:number|null;
  brokerGttCreatedAtUs:number|null;
  brokerGttExpiresAtUs:number|null;
  firstBuyToGttCreationGapUs:number|null;
  crossIstDateIsNotExchangeCalendar:true;
  reportedTradeExecutionTimesIndependentlyVerified:false;
  buyTradeIdsVenueSignedAndIndependentlyVerified:false;
  completeBrokerAccountAndTradeHistoryIndependentlyVerified:false;
  brokerReportedNetIndependentlyVerified:false;
  historicalGttQuantityContinuityVerified:false;
  brokerSellNoShortCloseOnlyPermissionVerified:false;
  signedExchangeNativeStopAckVerified:false;
  gapExitFillGuaranteed:false;
  licensedOptionMarketDataAndEffectiveExpiryVerified:false;
  full1To8WeekOosAndFeesApproved:false;
  persistentOvernightProtectionCertified:false;
  positional1515ForcedSquareOff:false;
  automaticPositionClosureAuthorized:false;
  duplicateSellRetryAuthorized:false;
  realisedPnlWriteAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerOrderOrGttWritesAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Summ=Partial<Pick<OriginalBuyCohortReport,
  'selectedWeeks'|'brokerReportedBuyFillCount'|
  'brokerReportedBuyFillQuantity'|'brokerReportedCurrentNetLong'|
  'earliestAssertedBuyFillAtMs'|'latestAssertedBuyFillAtMs'|
  'assertedBuyFillSpanMs'|'firstBuyAnchoredHoldingEndMs'|
  'reviewRollingHoldingEndMs'|'assertedContractExpiryAtMs'|
  'brokerGttCreatedAtUs'|'brokerGttExpiresAtUs'|
  'firstBuyToGttCreationGapUs'>>;
const make=(state:OriginalBuyCohortState,reason:string,
  p:Summ={}):OriginalBuyCohortReport=>({
  state,reasonCodes:[reason],
  selectedWeeks:p.selectedWeeks??null,
  brokerReportedBuyFillCount:p.brokerReportedBuyFillCount??null,
  brokerReportedBuyFillQuantity:p.brokerReportedBuyFillQuantity??null,
  brokerReportedCurrentNetLong:p.brokerReportedCurrentNetLong??null,
  earliestAssertedBuyFillAtMs:p.earliestAssertedBuyFillAtMs??null,
  latestAssertedBuyFillAtMs:p.latestAssertedBuyFillAtMs??null,
  assertedBuyFillSpanMs:p.assertedBuyFillSpanMs??null,
  firstBuyAnchoredHoldingEndMs:p.firstBuyAnchoredHoldingEndMs??null,
  reviewRollingHoldingEndMs:p.reviewRollingHoldingEndMs??null,
  assertedContractExpiryAtMs:p.assertedContractExpiryAtMs??null,
  brokerGttCreatedAtUs:p.brokerGttCreatedAtUs??null,
  brokerGttExpiresAtUs:p.brokerGttExpiresAtUs??null,
  firstBuyToGttCreationGapUs:p.firstBuyToGttCreationGapUs??null,
  crossIstDateIsNotExchangeCalendar:true,
  reportedTradeExecutionTimesIndependentlyVerified:false,
  buyTradeIdsVenueSignedAndIndependentlyVerified:false,
  completeBrokerAccountAndTradeHistoryIndependentlyVerified:false,
  brokerReportedNetIndependentlyVerified:false,
  historicalGttQuantityContinuityVerified:false,
  brokerSellNoShortCloseOnlyPermissionVerified:false,
  signedExchangeNativeStopAckVerified:false,
  gapExitFillGuaranteed:false,
  licensedOptionMarketDataAndEffectiveExpiryVerified:false,
  full1To8WeekOosAndFeesApproved:false,
  persistentOvernightProtectionCertified:false,
  positional1515ForcedSquareOff:false,
  automaticPositionClosureAuthorized:false,
  duplicateSellRetryAuthorized:false,
  realisedPnlWriteAuthorized:false,
  liveNrmlBuyAuthorized:false,
  brokerOrderOrGttWritesAuthorized:false,brokerWrites:0,localWrites:0
});

/** No upstream fields or identifiers are exposed in the report. */
export function auditOriginalBuyMultiFillGttHorizonReadOnly(
  s:OriginalBuyCohortScope,
  e:OriginalBuyCohortEvidence
):OriginalBuyCohortReport{
  if(!s||!option(s.instrumentKey)||!id(s.originalBuyOrderId)||
     !id(s.expectedExchangeOrderId)||!gttId(s.gttOrderId)||
     s.product!=='NRML'||![1,2,4,8].includes(s.selectedWeeks)||
     !positive(s.originalQuantity)||!positive(s.lotSize)||
     !positive(s.assertedCurrentNetLongQuantity)||
     s.originalQuantity%s.lotSize!==0||
     s.assertedCurrentNetLongQuantity%s.lotSize!==0||
     s.assertedCurrentNetLongQuantity>s.originalQuantity)
    return make('INVALID_NRML_BUY_COHORT_SCOPE',
      'EXACT_NRML_OPTION_BUY_GTT_AND_WHOLE_LOT_LONG_REQUIRED');
  const p:Summ={selectedWeeks:s.selectedWeeks};
  const review=utc(s.reviewedAtUtc),contract=utc(s.assertedContractExpiryUtc);
  if(review===null||contract===null)
    return make('INVALID_NRML_BUY_COHORT_SCOPE',
      'CANONICAL_REVIEW_AND_CONTRACT_UTC_REQUIRED',p);
  p.assertedContractExpiryAtMs=contract;
  if(!e||!obj(e.originalBuyOrder)||!Array.isArray(e.orderBook)||
     !Array.isArray(e.positions))
    return make('BROKER_BUY_ORDER_BOOK_OR_POSITION_EVIDENCE_MISSING',
      'ORIGINAL_BUY_ORDER_ACCOUNT_BOOK_OR_NET_UNAVAILABLE',p);
  const o=e.originalBuyOrder, status=o.status;
  if(o.order_id!==s.originalBuyOrderId||
     o.exchange_order_id!==s.expectedExchangeOrderId||
     o.instrument_token!==s.instrumentKey||o.product!=='D'||
     o.transaction_type!=='BUY'||
     o.quantity!==s.originalQuantity||
     o.filled_quantity!==s.originalQuantity||
     o.pending_quantity!==0||
     !['COMPLETE','COMPLETED','FILLED'].includes(String(status))||
     paise(o.average_price)===null)
    return make('BROKER_ORIGINAL_BUY_ORDER_NOT_FULL_AND_EXACT',
      'ORIGINAL_ORDER_NOT_COMPLETE_OR_EXACT_NRML_OPTION_BUY',p);
  const matchingOrders=e.orderBook.filter(x=>
    obj(x)&&x.order_id===s.originalBuyOrderId);
  if(e.orderBook.length>=10_000||
     e.orderBook.some(x=>!obj(x))||matchingOrders.length!==1||
     !obj(matchingOrders[0])||
     matchingOrders[0].exchange_order_id!==s.expectedExchangeOrderId||
     matchingOrders[0].instrument_token!==s.instrumentKey||
     matchingOrders[0].product!=='D'||
     matchingOrders[0].transaction_type!=='BUY'||
     matchingOrders[0].quantity!==s.originalQuantity||
     matchingOrders[0].filled_quantity!==s.originalQuantity||
     matchingOrders[0].pending_quantity!==0||
     !['COMPLETE','COMPLETED','FILLED'].includes(String(matchingOrders[0].status))||
     paise(matchingOrders[0].average_price)===null||
     Math.abs((matchingOrders[0].average_price as number)-
       (o.average_price as number))>0.011)
    return make('BROKER_ORIGINAL_BUY_ORDERBOOK_DISAGREES',
      'COMPLETE_BUY_NOT_EXACTLY_ONCE_IN_ACCOUNT_ORDERBOOK',p);
  if(e.positions.length>=10_000||e.positions.some(x=>!obj(x))||
     e.positions.some(x=>obj(x)&&
       x.instrument_token===s.instrumentKey&&x.product!=='D'))
    return make('BROKER_NRML_NET_NOT_UNIQUE_OR_INCONSISTENT',
      'CURRENT_POSITION_ACCOUNT_CENSUS_OR_PRODUCT_UNVERIFIED',p);
  const positions=e.positions.filter(x=>
    obj(x)&&x.instrument_token===s.instrumentKey&&x.product==='D');
  if(positions.length!==1||!obj(positions[0])||
     net(positions[0].net_quantity)!==s.assertedCurrentNetLongQuantity)
    return make('BROKER_NRML_NET_NOT_UNIQUE_OR_INCONSISTENT',
      'MISSING_DUPLICATE_OR_CONTRADICTORY_NRML_LONG',p);
  p.brokerReportedCurrentNetLong=s.assertedCurrentNetLongQuantity;
  if(!Array.isArray(e.originalBuyTrades)||
     e.originalBuyTrades.length===0||
     e.originalBuyTrades.length>5000)
    return make('BUY_TRADE_COHORT_MISSING_OR_TRUNCATED',
      'ORIGINAL_BUY_TRADE_ROWS_ABSENT_OR_UNBOUNDED',p);
  const seen=new Set<string>();
  let qty=0,amountPaise=0,first=Infinity,last=-Infinity;
  for(const trade of e.originalBuyTrades){
    if(!obj(trade)||!id(trade.trade_id)||seen.has(trade.trade_id)||
       trade.order_id!==s.originalBuyOrderId||
       trade.exchange_order_id!==s.expectedExchangeOrderId||
       trade.instrument_token!==s.instrumentKey||
       trade.product!=='D'||trade.transaction_type!=='BUY'||
       !positive(trade.quantity)||paise(trade.average_price)===null||
       utc(trade.executedAtUtc)===null)
      return make('BUY_TRADE_IDENTITY_PRICE_OR_EXECUTED_AT_INVALID',
        'UNIQUE_EXACT_PER_ORDER_BUY_TRADE_AND_ASSERTED_UTC_REQUIRED',p);
    seen.add(trade.trade_id);
    const at=utc(trade.executedAtUtc)!;
    const added=(trade.quantity as number)*paise(trade.average_price)!;
    qty+=trade.quantity as number;
    amountPaise+=added;
    if(!Number.isSafeInteger(qty)||!Number.isSafeInteger(added)||
       !Number.isSafeInteger(amountPaise))
      return make('BUY_TRADE_SUM_OR_PREMIUM_AMOUNT_OVERFLOW',
        'ORIGINAL_BUY_QUANTITY_OR_PREMIUM_ACCUMULATION_UNSAFE',p);
    first=Math.min(first,at);last=Math.max(last,at);
  }
  p.brokerReportedBuyFillCount=e.originalBuyTrades.length;
  p.brokerReportedBuyFillQuantity=qty;
  if(qty!==s.originalQuantity)
    return make('BUY_TRADE_QUANTITY_NOT_CONSERVED',
      'ALL_ORIGINAL_BUY_FILL_QUANTITY_MUST_EQUAL_COMPLETE_ORDER',p);
  const weighted=Math.round(amountPaise/qty);
  if(Math.abs(weighted-paise(o.average_price)!)>1||
     Math.abs(weighted-paise(matchingOrders[0].average_price)!)>1)
    return make('BUY_TRADE_WEIGHTED_PRICE_DISAGREES',
      'EXECUTED_PREMIUM_WAP_INCONSISTENT_WITH_BROKER_BUY',p);
  p.earliestAssertedBuyFillAtMs=first;
  p.latestAssertedBuyFillAtMs=last;
  p.assertedBuyFillSpanMs=last-first;
  const end=first+s.selectedWeeks*7*dayMs;
  const rolling=review+s.selectedWeeks*7*dayMs;
  if(last>review||!Number.isSafeInteger(end)||end>=lastMs||
     !Number.isSafeInteger(rolling)||rolling>=lastMs)
    return make('BUY_FILL_AFTER_REVIEW_OR_HORIZON_OVERFLOW',
      'BUY_AFTER_REVIEW_OR_NOMINAL_WEEK_CLOCK_OVERFLOWS',p);
  p.firstBuyAnchoredHoldingEndMs=end;
  p.reviewRollingHoldingEndMs=rolling;
  if(istDay(first)!==istDay(last))
    return make('BUY_FILLS_SPAN_DIFFERENT_IST_CALENDAR_DATES',
      'BUY_COHORT_CROSSES_UNVERIFIED_INDIAN_LOCAL_SESSION_DATES',p);
  const g=e.existingSingleSellGtt;
  if(!obj(g)||g.gtt_order_id!==s.gttOrderId||
     g.instrument_token!==s.instrumentKey||
     g.exchange!==s.instrumentKey.split('|',1)[0]||
     g.product!=='D'||g.type!=='SINGLE'||
     g.quantity!==s.assertedCurrentNetLongQuantity||
     !Array.isArray(g.rules)||g.rules.length!==1||
     !obj(g.rules[0])||
     g.rules[0].strategy!=='ENTRY'||
     g.rules[0].transaction_type!=='SELL'||
     g.rules[0].trigger_type!=='BELOW'||
     paise(g.rules[0].trigger_price)===null)
    return make('EXISTING_GTT_PARENT_OR_SELL_RULE_MISMATCH',
      'EXACT_SAME_NRML_OPTION_SCHEDULED_SELL_CONDITION_REQUIRED',p);
  if(!validUpstoxGttTimeFieldsIfPresent(g)||
     typeof g.created_at!=='number'||typeof g.expires_at!=='number'||
     g.created_at<firstMs*1000||g.expires_at>=lastMs*1000)
    return make('GTT_MICROSECOND_CREATED_OR_EXPIRED_EVIDENCE_INVALID',
      'GTT_CREATED_EXPIRED_MUST_BE_SAFE_UNIX_MICROSECONDS',p);
  const created=g.created_at,expires=g.expires_at;
  p.brokerGttCreatedAtUs=created;
  p.brokerGttExpiresAtUs=expires;
  if(created>review*1000)
    return make('GTT_CREATED_AFTER_REVIEW_CLOCK',
      'GTT_REPORTED_CREATION_AFTER_EXPLICIT_REVIEW_CLOCK',p);
  if(g.rules[0].status!=='SCHEDULED'||g.rules[0].order_id!==null)
    return make('GTT_NOT_SCHEDULED_OR_CHILD_ALREADY_EXISTS',
      'CHILD_OR_TERMINAL_GTT_CANNOT_CERTIFY_CURRENT_TRIGGER',p);
  if(review>=end)
    return make('EARLIEST_BUY_HOLDING_WINDOW_ALREADY_ELAPSED',
      'ORIGINAL_BUY_ENTRY_HORIZON_MUST_NOT_ROLL_FORWARD',p);
  if(expires<=review*1000)
    return make('GTT_ALREADY_EXPIRED_AT_REVIEW',
      'BROKER_GTT_HAS_EXPIRED_OR_EXACT_REVIEW_BOUNDARY',p);
  if(contract<=review)
    return make('ASSERTED_OPTION_CONTRACT_ALREADY_EXPIRED',
      'UNATTESTED_OPTION_EXPIRED_BEFORE_REVIEW',p);
  if(contract<end)
    return make('ASSERTED_OPTION_CONTRACT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END',
      'ASSERTED_FO_EXPIRY_BEFORE_EARLIEST_BUY_DEADLINE',p);
  if(expires<end*1000)
    return make('GTT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END',
      'GTT_EXPIRES_BEFORE_EARLIEST_BUY_ANCHORED_DEADLINE',p);
  if(expires>contract*1000)
    return make('GTT_EXPIRES_AFTER_ASSERTED_OPTION_EXPIRY',
      'BROKER_GTT_EXPIRY_BEYOND_UNATTESTED_OPTION_CONTRACT',p);
  if(created<first*1000)
    return make('GTT_PREEXISTED_FIRST_BUY_ORPHAN_SELL_RISK',
      'CONDITIONAL_SELL_PRECEDED_EXECUTED_BUY_ORPHAN_SHORT_RISK',p);
  if(last>first&&created<=last*1000){
    p.firstBuyToGttCreationGapUs=created-first*1000;
    return make('GTT_CREATED_WITHIN_PARTIAL_BUY_FILL_INTERVAL',
      'BROKER_SELL_PROTECTED_QUANTITY_AND_REPRICE_HISTORY_UNKNOWN',p);
  }
  if(created>first*1000){
    p.firstBuyToGttCreationGapUs=created-first*1000;
    return make('GTT_CREATED_AFTER_LAST_BUY_UNPROTECTED_GAP',
      'ORIGINAL_BUY_TO_CONDITIONAL_SELL_CREATION_NOT_PROTECTED',p);
  }
  return make('EARLIEST_BUY_MULTI_FILL_TEMPORAL_OVERLAP_UNVERIFIED',
    'TEMPORAL_OVERLAP_ONLY_NO_SIGNED_EXECUTION_OR_NATIVE_STOP',p);
}
