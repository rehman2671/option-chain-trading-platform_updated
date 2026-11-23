/**
 * Phase124: OFFLINE Upstox per-order BUY trade exchange-clock boundary.
 *
 * Official Upstox /v2/order/trades contains per-trade exchange_timestamp,
 * trade_id, exchange, order_id, quantity and average_price. The
 * order_timestamp is ORDER PLACEMENT, and historical FO trade_date is
 * DATE ONLY. Neither substitutes for per-fill execution time.
 *
 * Trade exchange_timestamp is human-readable without a timezone offset.
 * This adapter ONLY under caller-declared, UNATTESTED Asia/Kolkata (+05:30)
 * interpretation. The parsed time has SECOND resolution, not microseconds.
 * Any reported GTT creation in the execution second is ambiguous.
 *
 * Zero network calls, storage, live broker instructions, local mutations.
 * Success means cross-field consistency, never venue-signed execution,
 * exchange native stop, persistent overnight protection or trading release.
 */
import {
  auditOriginalBuyMultiFillGttHorizonReadOnly,
  type OriginalBuyCohortEvidence,
  type OriginalBuyCohortScope,
  type OriginalBuyCohortState
} from './adaptiveOriginalBuyMultiFillGttHorizonAudit.js';

type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const firstMs=946684800000;
const lastMs=4102444800000;
const istOffset=330*60_000;
const months=['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'] as const;
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const paise=(x:unknown):number|null=>{
  if(typeof x!=='number'||!Number.isFinite(x)||x<=0)return null;
  const n=Math.round(x*100);
  return Number.isSafeInteger(n)&&Math.abs(x*100-n)<0.00001?n:null;
};
const utc=(x:unknown):number|null=>{
  if(typeof x!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x))
    return null;
  const t=Date.parse(x);
  return Number.isSafeInteger(t)&&t>=firstMs&&t<lastMs&&
    new Date(t).toISOString()===x?t:null;
};
/**
 * Strict dd-MMM-yyyy HH:mm:ss parser: no Date.parse(localized string),
 * no browser time zone, implicit locale, rollover or lenient inference.
 * A millisecond .000 is a REPRESENTATION of a whole-second observation.
 */
export function parseUpstoxExchangeTradeTimestampAssumedIst(
  source:unknown
):string|null{
  if(typeof source!=='string')return null;
  const m=/^(\d{2})-([A-Z][a-z]{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/
    .exec(source);
  if(!m)return null;
  const mo=months.indexOf(m[2] as typeof months[number]);
  if(mo<0)return null;
  const day=Number(m[1]),year=Number(m[3]);
  const hh=Number(m[4]),mm=Number(m[5]),ss=Number(m[6]);
  if(day<1||day>31||year<2000||year>=2100||
     hh>23||mm>59||ss>59)return null;
  const localMs=Date.UTC(year,mo,day,hh,mm,ss,0);
  if(!Number.isSafeInteger(localMs))return null;
  const localCheck=new Date(localMs).toISOString();
  const expected=String(year).padStart(4,'0')+'-'+
    String(mo+1).padStart(2,'0')+'-'+
    String(day).padStart(2,'0')+'T'+
    String(hh).padStart(2,'0')+':'+
    String(mm).padStart(2,'0')+':'+
    String(ss).padStart(2,'0')+'.000Z';
  if(localCheck!==expected)return null;
  const observedUtc=localMs-istOffset;
  return Number.isSafeInteger(observedUtc)&&
    observedUtc>=firstMs&&observedUtc<lastMs?
    new Date(observedUtc).toISOString():null;
}
export interface NativeOrderTradeTimeInput{
  cohortScope:OriginalBuyCohortScope;
  /** Caller-provided offline order/book/positions/GTT snapshot, NO trade rows. */
  cohortEvidence:Omit<OriginalBuyCohortEvidence,'originalBuyTrades'>;
  /** Mocked/captured GET /v2/order/trades response. No HTTP happens here. */
  perOrderTradeResponse:unknown;
  sourceMethod:'GET';
  sourcePath:'/v2/order/trades';
  captureOrigin:'OPERATOR_CAPTURED_UNVERIFIED';
  /** Explicit assumption; Upstox response lacks a UTC offset. */
  exchangeClockAssumption:'ASSUME_ASIA_KOLKATA_UNVERIFIED';
  captureAtUtc:string;
  maxCaptureAgeMinutes:number;
}
export type NativeOrderTradeTimeState=
  'INVALID_NATIVE_TRADE_CAPTURE_OR_CLOCK_ASSUMPTION'|
  'ORDER_TRADES_RESPONSE_MISSING_FAILED_OR_TRUNCATED'|
  'PER_TRADE_SOURCE_IDENTITY_EXCHANGE_PRICE_OR_QUANTITY_INVALID'|
  'DUPLICATED_NATIVE_BUY_TRADE_ID'|
  'PER_TRADE_EXCHANGE_TIMESTAMP_MISSING_OR_INVALID'|
  'TRADE_EXCHANGE_TIME_AFTER_CAPTURE_OR_REVIEW'|
  'ORDER_TRADES_TOTAL_QUANTITY_INVALID'|
  'PHASE123_MULTI_FILL_OR_HORIZON_QUARANTINED'|
  'GTT_CREATED_IN_UNRESOLVED_EXCHANGE_EXECUTION_SECOND'|
  'NATIVE_TRADE_CLOCK_COHORT_TEMPORALLY_CONSISTENT_UNVERIFIED';
export interface NativeOrderTradeTimeReport{
  state:NativeOrderTradeTimeState;
  reasonCodes:readonly string[];
  phase123State:OriginalBuyCohortState|null;
  observedTradeCount:number|null;
  observedOriginalBuyQuantity:number|null;
  earliestAssumedTradeAtUtcMs:number|null;
  latestAssumedTradeAtUtcMs:number|null;
  sourceExchangeTimestampGranularity:'SECONDS';
  sourceOrderTimestampUsedAsTradeTime:false;
  historicalFoTradeDateUsedAsExactTradeTime:false;
  exchangeLocalClockZoneIndependentlyAuthenticated:false;
  rawGetResponseAndAccountIndependentlyAuthenticated:false;
  sourceClockAndCaptureTimestampIndependentlyAttested:false;
  tradeExecutionTimesVenueSignedVerified:false;
  originalTradeSetCompleteAcrossDaysVerified:false;
  effectiveDatedExchangeSessionCalendarVerified:false;
  authenticatedOriginalOptionContractMasterVerified:false;
  brokerGttSellProtectedQuantityIndependentlyVerified:false;
  exchangeNativeStopAcknowledged:false;
  guaranteedGapExitFill:false;
  originalBuyHoldingDeadlineBrokerApproved:false;
  liveNrmlBuyAuthorized:false;
  automaticPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  duplicateSellRetryAuthorized:false;
  positional1515ForcedSquareOff:false;
  brokerWrites:0;
  localWrites:0;
}
type Details=Partial<Pick<NativeOrderTradeTimeReport,
  'phase123State'|'observedTradeCount'|
  'observedOriginalBuyQuantity'|'earliestAssumedTradeAtUtcMs'|
  'latestAssumedTradeAtUtcMs'>>;
const make=(state:NativeOrderTradeTimeState,reason:string,
  v:Details={}):NativeOrderTradeTimeReport=>({
  state,reasonCodes:[reason],
  phase123State:v.phase123State??null,
  observedTradeCount:v.observedTradeCount??null,
  observedOriginalBuyQuantity:v.observedOriginalBuyQuantity??null,
  earliestAssumedTradeAtUtcMs:v.earliestAssumedTradeAtUtcMs??null,
  latestAssumedTradeAtUtcMs:v.latestAssumedTradeAtUtcMs??null,
  sourceExchangeTimestampGranularity:'SECONDS',
  sourceOrderTimestampUsedAsTradeTime:false,
  historicalFoTradeDateUsedAsExactTradeTime:false,
  exchangeLocalClockZoneIndependentlyAuthenticated:false,
  rawGetResponseAndAccountIndependentlyAuthenticated:false,
  sourceClockAndCaptureTimestampIndependentlyAttested:false,
  tradeExecutionTimesVenueSignedVerified:false,
  originalTradeSetCompleteAcrossDaysVerified:false,
  effectiveDatedExchangeSessionCalendarVerified:false,
  authenticatedOriginalOptionContractMasterVerified:false,
  brokerGttSellProtectedQuantityIndependentlyVerified:false,
  exchangeNativeStopAcknowledged:false,
  guaranteedGapExitFill:false,
  originalBuyHoldingDeadlineBrokerApproved:false,
  liveNrmlBuyAuthorized:false,
  automaticPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,
  duplicateSellRetryAuthorized:false,
  positional1515ForcedSquareOff:false,
  brokerWrites:0,localWrites:0
});

/**
 * Separate source-boundary decision, NOT a general broker adapter.
 * Caller must supply a complete, non-filtered single order trade response
 * and current account data. Neither is genuinely attested by this audit.
 * Reconnect/old historical pages and same-second ordering fail closed.
 */
export function auditNativeUpstoxOriginalBuyTradeClockReadOnly(
  input:NativeOrderTradeTimeInput
):NativeOrderTradeTimeReport{
  const scope=input?.cohortScope;
  const capture=utc(input?.captureAtUtc);
  const review=utc(scope?.reviewedAtUtc);
  if(!input||!scope||!obj(input.cohortEvidence)||
     Object.prototype.hasOwnProperty.call(input.cohortEvidence,
       'originalBuyTrades')||
     input.sourceMethod!=='GET'||
     input.sourcePath!=='/v2/order/trades'||
     input.captureOrigin!=='OPERATOR_CAPTURED_UNVERIFIED'||
     input.exchangeClockAssumption!=='ASSUME_ASIA_KOLKATA_UNVERIFIED'||
     !Number.isSafeInteger(input.maxCaptureAgeMinutes)||
     input.maxCaptureAgeMinutes<1||input.maxCaptureAgeMinutes>30||
     capture===null||review===null||capture>review||
     review-capture>input.maxCaptureAgeMinutes*60_000)
    return make('INVALID_NATIVE_TRADE_CAPTURE_OR_CLOCK_ASSUMPTION',
      'EXPLICIT_IST_ASSUMPTION_CANONICAL_FRESH_CAPTURE_AND_SCOPE_REQUIRED');
  const body=input.perOrderTradeResponse;
  if(!obj(body)||body.status!=='success'||!Array.isArray(body.data)||
     body.data.length===0||body.data.length>5000)
    return make('ORDER_TRADES_RESPONSE_MISSING_FAILED_OR_TRUNCATED',
      'NONEMPTY_UNFILTERED_PER_ORDER_SUCCESS_DATA_REQUIRED');
  const expectedExchange=typeof scope.instrumentKey==='string'&&
    scope.instrumentKey.startsWith('NSE_FO|')?'NFO':
    typeof scope.instrumentKey==='string'&&
    scope.instrumentKey.startsWith('BSE_FO|')?'BFO':null;
  if(!expectedExchange)
    return make('INVALID_NATIVE_TRADE_CAPTURE_OR_CLOCK_ASSUMPTION',
      'ORIGINAL_OPTION_SEGMENT_NOT_VALID');
  const seen=new Set<string>();
  const mapped:Row[]=[];
  let earliest=Infinity,latest=-Infinity,sum=0;
  for(const raw of body.data){
    if(!obj(raw)||!id(raw.trade_id)||
       raw.order_id!==scope.originalBuyOrderId||
       raw.exchange_order_id!==scope.expectedExchangeOrderId||
       raw.instrument_token!==scope.instrumentKey||
       raw.exchange!==expectedExchange||
       raw.product!=='D'||raw.transaction_type!=='BUY'||
       !positive(raw.quantity)||paise(raw.average_price)===null)
      return make('PER_TRADE_SOURCE_IDENTITY_EXCHANGE_PRICE_OR_QUANTITY_INVALID',
        'NATIVE_FO_PER_ORDER_TRADE_ID_QTY_PRICE_SIDE_EXCHANGE_MISMATCH');
    if(seen.has(raw.trade_id))
      return make('DUPLICATED_NATIVE_BUY_TRADE_ID',
        'DUPLICATE_PER_ORDER_TRADE_ID_NO_HISTORICAL_DEDUP_GUESS');
    seen.add(raw.trade_id);
    const at=parseUpstoxExchangeTradeTimestampAssumedIst(
      raw.exchange_timestamp);
    if(at===null)
      return make('PER_TRADE_EXCHANGE_TIMESTAMP_MISSING_OR_INVALID',
        'NEVER_USE_ORDER_TIMESTAMP_OR_DATE_ONLY_AS_EXECUTION_CLOCK');
    const ms=Date.parse(at);
    if(ms>capture||ms>review)
      return make('TRADE_EXCHANGE_TIME_AFTER_CAPTURE_OR_REVIEW',
        'BROKER_REPORTED_EXECUTION_AFTER_UNATTESTED_CAPTURE_OR_REVIEW');
    sum+=raw.quantity as number;
    if(!Number.isSafeInteger(sum))
      return make('ORDER_TRADES_TOTAL_QUANTITY_INVALID',
        'PER_ORDER_TRADE_QUANTITY_SUM_OVERFLOW');
    earliest=Math.min(earliest,ms);
    latest=Math.max(latest,ms);
    mapped.push({
      trade_id:raw.trade_id,order_id:raw.order_id,
      exchange_order_id:raw.exchange_order_id,
      instrument_token:raw.instrument_token,
      product:raw.product,transaction_type:raw.transaction_type,
      quantity:raw.quantity,average_price:raw.average_price,
      executedAtUtc:at
    });
  }
  const details:Details={
    observedTradeCount:body.data.length,
    observedOriginalBuyQuantity:sum,
    earliestAssumedTradeAtUtcMs:earliest,
    latestAssumedTradeAtUtcMs:latest
  };
  if(sum!==scope.originalQuantity)
    return make('ORDER_TRADES_TOTAL_QUANTITY_INVALID',
      'BROKER_PER_ORDER_TRADE_QUANTITY_DISAGREES_WITH_ORIGINAL_BUY',details);
  const audited=auditOriginalBuyMultiFillGttHorizonReadOnly(scope,{
    ...input.cohortEvidence,originalBuyTrades:mapped
  });
  details.phase123State=audited.state;
  if(audited.state!==
     'EARLIEST_BUY_MULTI_FILL_TEMPORAL_OVERLAP_UNVERIFIED')
    return make('PHASE123_MULTI_FILL_OR_HORIZON_QUARANTINED',
      'SOURCE_TIME_ALONE_CANNOT_RESOLVE_PHASE123_NRML_RISK',details);
  // Exchange timestamp precision is whole seconds; even an apparently
  // identical microsecond value does NOT establish BUY preceded SELL GTT.
  // A condition created at 09:15:00.000 could precede a BUY execution at
  // 09:15:00.999. Never count same-second "overlap" as safe coverage.
  const g=input.cohortEvidence.existingSingleSellGtt;
  if(!obj(g)||typeof g.created_at!=='number')
    return make('PHASE123_MULTI_FILL_OR_HORIZON_QUARANTINED',
      'GTT_MICROSECOND_CREATE_SOURCE_UNAVAILABLE',details);
  for(const t of mapped){
    const begin=Date.parse(t.executedAtUtc as string)*1000;
    if(g.created_at>=begin&&g.created_at<begin+1_000_000)
      return make('GTT_CREATED_IN_UNRESOLVED_EXCHANGE_EXECUTION_SECOND',
        'SECOND_RESOLUTION_CANNOT_ORDER_GTT_VS_ORIGINAL_BUY_EXECUTION',
        details);
  }
  return make('NATIVE_TRADE_CLOCK_COHORT_TEMPORALLY_CONSISTENT_UNVERIFIED',
    'BROKER_HUMAN_READABLE_EXCHANGE_TIME_ASSUMED_IST_NOT_VENUE_SIGNED',
    details);
}
