/**
 * Phase125: two separately captured, OFFLINE Upstox original BUY per-order
 * trade snapshots, with exact account/auth-epoch and data-drift quarantine.
 *
 * Both snapshots are CALLER-SUPPLIED, not atomic, signed, authenticated,
 * or proof that the broker has delivered all historical trades.
 *
 * Cross-snapshot stability never upgrades Phase124's human-readable
 * second-resolution trade clock to a precise original execution, and
 * never turns an existing GTT SELL into an exchange-native stop.
 *
 * No wall clock, broker calls, filesystem, mutable state or order writes.
 */
import {
  auditNativeUpstoxOriginalBuyTradeClockReadOnly,
  type NativeOrderTradeTimeInput,
  type NativeOrderTradeTimeState
} from './adaptiveUpstoxNativeTradeClockProvenanceReadOnly.js';

type Row=Record<string,unknown>;
const obj=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const utc=(v:unknown):number|null=>{
  if(typeof v!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))
    return null;
  const ms=Date.parse(v);
  return Number.isSafeInteger(ms)&&
    ms>=946684800000&&ms<4102444800000&&
    new Date(ms).toISOString()===v?ms:null;
};
const tradeKeys=[
  'trade_id','order_id','exchange_order_id','exchange',
  'instrument_token','product','transaction_type','quantity',
  'average_price','exchange_timestamp'
] as const;
const fingerprint=(trade:Row):string=>
  JSON.stringify(tradeKeys.map(k=>trade[k]??null));
function boundedSnapshot(v:unknown):string|null{
  try{
    const raw=JSON.stringify(v);
    return typeof raw==='string'&&raw.length<=250000?raw:null;
  }catch{
    return null;
  }
}
export interface NativeBuyTradeCapturePass{
  accountId:string;
  authEpoch:string;
  /** Distinct caller-supplied observation IDs, NOT signed broker receipts. */
  requestReceiptId:string;
  input:NativeOrderTradeTimeInput;
}
export interface NativeBuyTradeDoubleCapture{
  expectedAccountId:string;
  expectedAuthEpoch:string;
  first:NativeBuyTradeCapturePass;
  second:NativeBuyTradeCapturePass;
  /** 1..90 seconds; a configured upper bound, not real broker freshness proof. */
  maxReadSeparationSeconds:number;
}
export type NativeBuyTradeDoubleState=
  'INVALID_EXACT_ACCOUNT_EPOCH_OR_TWO_READ_SCOPE'|
  'TWO_NATIVE_READ_CLOCK_SEQUENCE_INVALID'|
  'ORIGINAL_BUY_POSITION_GTT_OR_REVIEW_CONTEXT_DRIFT'|
  'BROKER_TRADE_RESPONSE_MISSING_MALFORMED_OR_OVERSIZED'|
  'NATIVE_TRADE_ID_DUPLICATE_OR_UNBOUNDED'|
  'TRADE_ID_SET_MISSING_ADDED_OR_CHANGED'|
  'ORIGINAL_BUY_TRADE_IDENTITY_PRICE_QUANTITY_OR_CLOCK_DRIFT'|
  'PHASE124_SOURCE_TIME_OR_NRML_REVIEW_QUARANTINED'|
  'TWO_READS_STABLE_GTT_SAME_SECOND_EXECUTION_UNRESOLVED'|
  'TWO_READS_STABLE_NATIVE_BUY_COHORT_UNATTESTED';

export interface NativeBuyTradeDoubleReport{
  state:NativeBuyTradeDoubleState;
  reasonCodes:readonly string[];
  firstPhase124State:NativeOrderTradeTimeState|null;
  secondPhase124State:NativeOrderTradeTimeState|null;
  observedFirstTradeCount:number|null;
  observedSecondTradeCount:number|null;
  readSeparationMs:number|null;
  accountAndAuthEpochCallerAssertedNotVerified:true;
  sourceRequestReceiptsIndependentlySigned:false;
  rawBrokerCaptureIndependentlyAuthenticated:false;
  twoSnapshotsAtomic:false;
  completeTradeHistoryAcrossDaysVerified:false;
  originalTradeExecutedAtExactMillisecondVerified:false;
  exchangeClockTimezoneIndependentlyVerified:false;
  dualSnapshotStabilityDoesNotProveTradeCompleteness:true;
  exactOriginalBuyQuantitySignedVerified:false;
  currentLongAndNoShortCloseOnlyVerified:false;
  officialFuturesOptionCalendarAndExpiryVerified:false;
  brokerGttParentStopAcknowledgementVerified:false;
  brokerStopChildExchangeAcknowledgementVerified:false;
  persistentOvernightProtectionCertified:false;
  gapFillGuaranteed:false;
  autoClosePositionAuthorized:false;
  realisedPnlWriteAuthorized:false;
  liveNrmlBuyAuthorized:false;
  duplicateSellRetryAuthorized:false;
  positional1515SquareOffAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type S=Partial<Pick<NativeBuyTradeDoubleReport,
  'firstPhase124State'|'secondPhase124State'|
  'observedFirstTradeCount'|'observedSecondTradeCount'|
  'readSeparationMs'>>;
const result=(state:NativeBuyTradeDoubleState,reason:string,
  d:S={}):NativeBuyTradeDoubleReport=>({
  state,reasonCodes:[reason],
  firstPhase124State:d.firstPhase124State??null,
  secondPhase124State:d.secondPhase124State??null,
  observedFirstTradeCount:d.observedFirstTradeCount??null,
  observedSecondTradeCount:d.observedSecondTradeCount??null,
  readSeparationMs:d.readSeparationMs??null,
  accountAndAuthEpochCallerAssertedNotVerified:true,
  sourceRequestReceiptsIndependentlySigned:false,
  rawBrokerCaptureIndependentlyAuthenticated:false,
  twoSnapshotsAtomic:false,
  completeTradeHistoryAcrossDaysVerified:false,
  originalTradeExecutedAtExactMillisecondVerified:false,
  exchangeClockTimezoneIndependentlyVerified:false,
  dualSnapshotStabilityDoesNotProveTradeCompleteness:true,
  exactOriginalBuyQuantitySignedVerified:false,
  currentLongAndNoShortCloseOnlyVerified:false,
  officialFuturesOptionCalendarAndExpiryVerified:false,
  brokerGttParentStopAcknowledgementVerified:false,
  brokerStopChildExchangeAcknowledgementVerified:false,
  persistentOvernightProtectionCertified:false,
  gapFillGuaranteed:false,
  autoClosePositionAuthorized:false,
  realisedPnlWriteAuthorized:false,
  liveNrmlBuyAuthorized:false,
  duplicateSellRetryAuthorized:false,
  positional1515SquareOffAuthorized:false,
  brokerWrites:0,localWrites:0
});
function tradeSet(v:unknown):{
  map:Map<string,string>|null;
  reason:'BAD_RESPONSE'|'DUPLICATE'|null;
}{
  if(!obj(v)||v.status!=='success'||!Array.isArray(v.data)||
     v.data.length===0||v.data.length>5000)
    return {map:null,reason:'BAD_RESPONSE'};
  const rows=new Map<string,string>();
  for(const t of v.data){
    if(!obj(t)||!id(t.trade_id))return {map:null,reason:'BAD_RESPONSE'};
    if(rows.has(t.trade_id))return {map:null,reason:'DUPLICATE'};
    rows.set(t.trade_id,fingerprint(t));
  }
  return {map:rows,reason:null};
}
/**
 * Detects source instability BEFORE returning either Phase124 report;
 * when source is unstable, both original entry clocks remain untrusted.
 * A good result only means these particular caller-supplied payloads agree.
 */
export function auditDoubleNativeBuyTradeCaptureReadOnly(
  x:NativeBuyTradeDoubleCapture
):NativeBuyTradeDoubleReport{
  const a=x?.first,b=x?.second;
  if(!x||!a||!b||!id(x.expectedAccountId)||
     !id(x.expectedAuthEpoch)||!id(a.accountId)||!id(b.accountId)||
     a.accountId!==x.expectedAccountId||
     b.accountId!==x.expectedAccountId||
     a.authEpoch!==x.expectedAuthEpoch||
     b.authEpoch!==x.expectedAuthEpoch||
     !id(a.requestReceiptId)||!id(b.requestReceiptId)||
     a.requestReceiptId===b.requestReceiptId||
     !a.input||!b.input||
     !Number.isSafeInteger(x.maxReadSeparationSeconds)||
     x.maxReadSeparationSeconds<1||x.maxReadSeparationSeconds>90)
    return result('INVALID_EXACT_ACCOUNT_EPOCH_OR_TWO_READ_SCOPE',
      'EXACT_ACCOUNT_AUTH_EPOCH_DISTINCT_RECEIPTS_AND_TWO_READS_REQUIRED');
  const at=utc(a.input.captureAtUtc),bt=utc(b.input.captureAtUtc);
  const reviewA=utc(a.input.cohortScope?.reviewedAtUtc);
  const reviewB=utc(b.input.cohortScope?.reviewedAtUtc);
  if(at===null||bt===null||reviewA===null||reviewB===null||
     !(at<bt)||bt-at>x.maxReadSeparationSeconds*1000||
     bt>reviewA||bt>reviewB||reviewA!==reviewB)
    return result('TWO_NATIVE_READ_CLOCK_SEQUENCE_INVALID',
      'FIRST_SECOND_CAPTURE_ORDER_SEPARATION_OR_REVIEW_CLOCK_INVALID');
  const info:S={readSeparationMs:bt-at};
  // This is an intentional strict fail-closed snapshot comparison, not a
  // semantic assertion that broker GETs are atomic or independent.
  const scope1=boundedSnapshot(a.input.cohortScope),
    scope2=boundedSnapshot(b.input.cohortScope),
    state1=boundedSnapshot(a.input.cohortEvidence),
    state2=boundedSnapshot(b.input.cohortEvidence);
  if(scope1===null||scope2===null||state1===null||state2===null||
     scope1!==scope2||state1!==state2||
     a.input.sourceMethod!==b.input.sourceMethod||
     a.input.sourcePath!==b.input.sourcePath||
     a.input.captureOrigin!==b.input.captureOrigin||
     a.input.exchangeClockAssumption!==b.input.exchangeClockAssumption||
     a.input.maxCaptureAgeMinutes!==b.input.maxCaptureAgeMinutes)
    return result('ORIGINAL_BUY_POSITION_GTT_OR_REVIEW_CONTEXT_DRIFT',
      'ORIGINAL_BUY_NET_GTT_OR_NATIVE_SOURCE_CONTEXT_CHANGED',info);
  const first=tradeSet(a.input.perOrderTradeResponse);
  const second=tradeSet(b.input.perOrderTradeResponse);
  if(first.reason==='BAD_RESPONSE'||second.reason==='BAD_RESPONSE')
    return result('BROKER_TRADE_RESPONSE_MISSING_MALFORMED_OR_OVERSIZED',
      'COMPLETE_NONEMPTY_BOUNDED_NATIVE_TRADE_ARRAY_REQUIRED',info);
  if(first.reason==='DUPLICATE'||second.reason==='DUPLICATE')
    return result('NATIVE_TRADE_ID_DUPLICATE_OR_UNBOUNDED',
      'EXACT_PER_ORDER_TRADE_ID_MUST_BE_UNIQUE_WITHIN_EACH_CAPTURE',info);
  const fm=first.map!,sm=second.map!;
  info.observedFirstTradeCount=fm.size;
  info.observedSecondTradeCount=sm.size;
  if(fm.size!==sm.size||[...fm.keys()].some(k=>!sm.has(k)))
    return result('TRADE_ID_SET_MISSING_ADDED_OR_CHANGED',
      'BROKER_ORIGINAL_BUY_TRADE_SET_DRIFT_BETWEEN_CAPTURES',info);
  if([...fm].some(([k,v])=>sm.get(k)!==v))
    return result('ORIGINAL_BUY_TRADE_IDENTITY_PRICE_QUANTITY_OR_CLOCK_DRIFT',
      'IDENTICAL_TRADE_ID_HAS_DIFFERENT_SOURCE_EXECUTION_FIELDS',info);
  const ra=auditNativeUpstoxOriginalBuyTradeClockReadOnly(a.input);
  const rb=auditNativeUpstoxOriginalBuyTradeClockReadOnly(b.input);
  info.firstPhase124State=ra.state;
  info.secondPhase124State=rb.state;
  if(ra.state!==rb.state||![
    'GTT_CREATED_IN_UNRESOLVED_EXCHANGE_EXECUTION_SECOND',
    'NATIVE_TRADE_CLOCK_COHORT_TEMPORALLY_CONSISTENT_UNVERIFIED'
  ].includes(ra.state))
    return result('PHASE124_SOURCE_TIME_OR_NRML_REVIEW_QUARANTINED',
      'PHASE124_SOURCE_COERCION_CLOCK_HORIZON_OR_GTT_CONDITION_REJECTED',
      info);
  if(ra.state==='GTT_CREATED_IN_UNRESOLVED_EXCHANGE_EXECUTION_SECOND')
    return result('TWO_READS_STABLE_GTT_SAME_SECOND_EXECUTION_UNRESOLVED',
      'REPEAT_READS_DO_NOT_CREATE_SUBSECOND_EXECUTION_ORDER_OR_STOP_ACK',info);
  return result('TWO_READS_STABLE_NATIVE_BUY_COHORT_UNATTESTED',
    'STABLE_CALLER_SOURCE_RECORDS_NOT_SIGNED_OR_COMPLETE_BROKER_HISTORY',
    info);
}
