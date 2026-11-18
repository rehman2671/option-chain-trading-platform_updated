/**
 * Adaptive Swing v2 Phase40 — purely OFFLINE, operator-archived Upstox
 * GTT pre-close/post-open and SAME-SESSION child order-history review.
 *
 * Upstox GET /v2/order/history exists for ONE trading day, and
 * GET /v3/order/gtt DOES NOT return completed GTTs. Samples therefore
 * cannot establish GTT continuity throughout unsampled gaps or a native
 * exchange-hosted protective stop. GTT is a broker-side condition.
 *
 * NEVER import into broker order execution, live routes or scheduled jobs.
 */
import {createHash} from 'node:crypto';

const MAX_PAIRS=55, MAX_HISTORY=64, MAX_EVENTS=100;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const KEY=/^[A-Za-z0-9_.|:/-]{1,150}$/;
const HASH=/^[a-f0-9]{64}$/;
const time=(v:unknown):number=>typeof v==='string'&&TIME.test(v)?
  Date.parse(v):NaN;
const key=(v:unknown):v is string=>typeof v==='string'&&KEY.test(v);
const pos=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const positivePrice=(v:unknown):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>0;
const lower=(s:unknown):string=>
  typeof s==='string'?s.trim().toLowerCase():'';
const sha=(v:unknown):string=>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');

export interface Phase40ExpectedNrmlPosition {
  accountScopeId:string;
  productType:'NRML';
  instrumentKey:string;
  tradingSymbol:string;
  gttOrderId:string;
  lotSize:number;
  expectedLongQuantity:number;
  expectedStopTriggerPrice:number;
}
export interface Phase40GttRule {
  strategy:'ENTRY'|'TARGET'|'STOPLOSS';
  status:string;
  trigger_type:'BELOW'|'ABOVE'|'IMMEDIATE';
  trigger_price:number;
  transaction_type:'BUY'|'SELL';
  order_id:string|null;
  message?:string|null;
}
export interface Phase40GttData {
  gtt_order_id:string;
  type:'SINGLE'|'MULTIPLE';
  product:string;
  exchange:string;
  instrument_token:string;
  trading_symbol:string;
  quantity:number;
  expires_at:number; // Upstox microseconds
  created_at:number; // Upstox microseconds
  rules:Phase40GttRule[];
}
export interface Phase40GttCapture {
  origin:'OPERATOR_ARCHIVED_UNVERIFIED';
  method:'GET';
  path:'/v3/order/gtt';
  query:{gtt_order_id:string};
  capturedAt:string;
  httpStatus:number;
  response:{status:string;data:Phase40GttData[]};
}
export interface Phase40OvernightPair {
  sessionDate:string;
  preCloseAt:string;
  nextSessionDate:string;
  nextOpenAt:string;
  beforeClose:Phase40GttCapture;
  afterOpen:Phase40GttCapture;
}
export interface Phase40GttAuditInput {
  schemaVersion:'ADAPTIVE_V2_PHASE40_OVERNIGHT_GTT_V1';
  source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED';
  position:Phase40ExpectedNrmlPosition;
  maxCheckpointDistanceMinutes:number;
  declaredOvernightPairs:number;
  overnightPairs:Phase40OvernightPair[];
}
export interface Phase40IndependentArchivePins {
  schemaVersion:'EXTERNALLY_PINNED_PHASE40_ARCHIVE_SHA256_V1';
  expectedAccountScopeId:string;
  expectedGttOrderId:string;
  expectedPairSha256:string[];
}
export interface Phase40GttReport {
  mode:'OFFLINE_PRE_CLOSE_POST_OPEN_GTT_CHECKPOINT_AUDIT';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED';
  reasonCodes:string[];
  pairsReviewed:number;
  matchingGttSnapshots:number;
  unobservedOvernightIntervals:number;
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  nativeExchangeStopAcknowledged:false;
  protectedOvernight:false;
  continuousStopCoverageVerified:false;
  gttConditionalRuleObservationsOnly:true;
  nrmlProductIndependentlyConfirmed:false;
  capturedBrokerSourceAuthenticated:false;
  tradingCalendarIndependentlyVerified:false;
  stopFillGuaranteed:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const warnings=[
  'UPSTOX_GTT_GET_DOES_NOT_RETURN_COMPLETED_GTT_ORDERS',
  'UPSTOX_ORDER_HISTORY_IS_AVAILABLE_FOR_ONE_TRADING_DAY_ONLY',
  'SCHEDULED_GTT_IS_BROKER_SIDE_CONDITION_NOT_EXCHANGE_NATIVE_STOP_ACK',
  'D_IS_BROKER_DELIVERY_FIELD_NOT_INDEPENDENT_NRML_POSITION_AUTH',
  'UNOBSERVED_INTERVENING_HOURS_AND_WEEKENDS_CANNOT_BE_PROVEN',
  'PRE_CLOSE_AND_POST_OPEN_SNAPSHOTS_DO_NOT_GUARANTEE_STOP_TRIGGER_OR_FILL',
  'ARCHIVED_GET_RESPONSES_AND_SHA256_PINS_HAVE_NO_BROKER_AUTHENTICATION',
  'SESSION_SCHEDULE_IS_OPERATOR_DECLARED_NOT_EFFECTIVE_DATED_EXCHANGE_CALENDAR',
  'NO_POSITONAL_15_15_EXIT_OR_LIVE_ORDER_GTT_WRITE_ALLOWED'
];
const blank=():Phase40GttReport=>({
  mode:'OFFLINE_PRE_CLOSE_POST_OPEN_GTT_CHECKPOINT_AUDIT',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  pairsReviewed:0,matchingGttSnapshots:0,unobservedOvernightIntervals:0,
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  nativeExchangeStopAcknowledged:false,protectedOvernight:false,
  continuousStopCoverageVerified:false,
  gttConditionalRuleObservationsOnly:true,
  nrmlProductIndependentlyConfirmed:false,
  capturedBrokerSourceAuthenticated:false,
  tradingCalendarIndependentlyVerified:false,
  stopFillGuaranteed:false,nativeOrderInstruction:null,warnings
});
const rejected=(status:Phase40GttReport['status'],code:string,
  fields?:Partial<Phase40GttReport>):Phase40GttReport=>({
  ...blank(),...fields,status,reasonCodes:[code]
});
function validScope(x:Phase40ExpectedNrmlPosition):boolean{
  return !!x&&x.productType==='NRML'&&key(x.accountScopeId)&&
    key(x.instrumentKey)&&key(x.tradingSymbol)&&key(x.gttOrderId)&&
    x.gttOrderId.startsWith('GTT-')&&
    pos(x.expectedLongQuantity)&&pos(x.lotSize)&&
    x.expectedLongQuantity%x.lotSize===0&&
    positivePrice(x.expectedStopTriggerPrice);
}
function archivedScheduled(
  c:Phase40GttCapture,p:Phase40ExpectedNrmlPosition,
  snapshotAt:number,afterBoundary:number
):boolean{
  if(!c||c.origin!=='OPERATOR_ARCHIVED_UNVERIFIED'||
    c.method!=='GET'||c.path!=='/v3/order/gtt'||
    c.httpStatus!==200||
    c.query?.gtt_order_id!==p.gttOrderId||
    !Number.isFinite(time(c.capturedAt))||
    time(c.capturedAt)!==snapshotAt||
    c.response?.status!=='success'||!Array.isArray(c.response.data)||
    c.response.data.length!==1)
    return false;
  const g=c.response.data[0];
  if(!g||g.gtt_order_id!==p.gttOrderId||
    !['SINGLE','MULTIPLE'].includes(g.type)||
    // D is the Upstox delivery code, not independently validated NRML.
    g.product!=='D'||g.instrument_token!==p.instrumentKey||
    g.trading_symbol!==p.tradingSymbol||
    !pos(g.quantity)||g.quantity!==p.expectedLongQuantity||
    !Number.isSafeInteger(g.created_at)||
    !Number.isSafeInteger(g.expires_at)||
    g.created_at<=0||g.expires_at<=g.created_at||
    g.created_at/1000>snapshotAt||
    g.expires_at/1000<=afterBoundary||
    !Array.isArray(g.rules)||g.rules.length<1||
    g.rules.length>3)return false;
  const stops=g.rules.filter(r=>r?.strategy==='STOPLOSS');
  if(stops.length!==1)return false;
  const r=stops[0];
  return r.status==='SCHEDULED'&&r.transaction_type==='SELL'&&
    r.trigger_type==='BELOW'&&
    r.trigger_price===p.expectedStopTriggerPrice&&
    r.order_id===null&&
    (r.message===null||r.message===''||r.message===undefined);
}
/** SHA-256 is an integrity comparison against separately pinned archive
 * digests, not an authentication of broker, exchange, API or account source.
 */
export function auditPhase40ArchivedGttOvernights(
  input:Phase40GttAuditInput,
  pins:Phase40IndependentArchivePins
):Phase40GttReport{
  if(!input||!pins||
    input.schemaVersion!=='ADAPTIVE_V2_PHASE40_OVERNIGHT_GTT_V1'||
    input.source!=='OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED'||
    !validScope(input.position)||
    pins.schemaVersion!=='EXTERNALLY_PINNED_PHASE40_ARCHIVE_SHA256_V1'||
    pins.expectedAccountScopeId!==input.position.accountScopeId||
    pins.expectedGttOrderId!==input.position.gttOrderId||
    !Number.isSafeInteger(input.maxCheckpointDistanceMinutes)||
    input.maxCheckpointDistanceMinutes<1||
    input.maxCheckpointDistanceMinutes>60||
    !Number.isSafeInteger(input.declaredOvernightPairs)||
    input.declaredOvernightPairs<1||
    input.declaredOvernightPairs>MAX_PAIRS||
    !Array.isArray(input.overnightPairs)||
    input.overnightPairs.length!==input.declaredOvernightPairs||
    !Array.isArray(pins.expectedPairSha256)||
    pins.expectedPairSha256.length!==input.overnightPairs.length||
    pins.expectedPairSha256.some(x=>typeof x!=='string'||!HASH.test(x)))
    return rejected('INVALID_EVIDENCE',
      'INVALID_NRML_POSITION_OVERNIGHT_SCOPE_OR_EXTERNAL_PINS');
  let snapshots=0;
  let lastOpen=-Infinity;
  for(let n=0;n<input.overnightPairs.length;n++){
    const pair=input.overnightPairs[n];
    if(!pair||sha(pair)!==pins.expectedPairSha256[n])
      return rejected('INVALID_EVIDENCE',
        'INDEPENDENT_CHECKPOINT_ARCHIVE_SHA256_MISMATCH',
        {pairsReviewed:n,matchingGttSnapshots:snapshots});
    const pre=time(pair.preCloseAt),post=time(pair.nextOpenAt);
    const before=time(pair.beforeClose?.capturedAt),
      after=time(pair.afterOpen?.capturedAt);
    if(!Number.isFinite(pre)||!Number.isFinite(post)||
      !Number.isFinite(before)||!Number.isFinite(after)||
      post<=pre||pre<=lastOpen||before>pre||after<post||
      pre-before>input.maxCheckpointDistanceMinutes*60000||
      after-post>input.maxCheckpointDistanceMinutes*60000||
      before>=post||after<=pre||
      !/^\d{4}-\d\d-\d\d$/.test(pair.sessionDate)||
      !/^\d{4}-\d\d-\d\d$/.test(pair.nextSessionDate)||
      new Date(pre+19800000).toISOString().slice(0,10)!==
        pair.sessionDate||
      new Date(post+19800000).toISOString().slice(0,10)!==
        pair.nextSessionDate||
      // One explicitly declared overnight or weekend only.
      pair.sessionDate>=pair.nextSessionDate)
      return rejected('BLOCKED_OR_UNKNOWN',
        'INVALID_OR_MISSING_SESSION_CLOSE_OPEN_CHECKPOINT_TIMES',
        {pairsReviewed:n,matchingGttSnapshots:snapshots});
    if(!archivedScheduled(pair.beforeClose,input.position,before,post))
      return rejected('BLOCKED_OR_UNKNOWN',
        'PRE_CLOSE_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE',
        {pairsReviewed:n,matchingGttSnapshots:snapshots});
    snapshots++;
    if(!archivedScheduled(pair.afterOpen,input.position,after,after))
      return rejected('BLOCKED_OR_UNKNOWN',
        'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE',
        {pairsReviewed:n,matchingGttSnapshots:snapshots});
    snapshots++;
    lastOpen=post;
  }
  return {...blank(),
    status:'GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED',
    pairsReviewed:input.overnightPairs.length,
    matchingGttSnapshots:snapshots,
    unobservedOvernightIntervals:input.overnightPairs.length};
}

// Independent order-history evidence: per-day order state progression is
// useful evidence of claimed ACK/modify/reject/cancel. It does not prove
// broker source nor that a standing GTT remained active on other days.
export interface Phase40OrderEvent {
  order_id:string;
  order_request_id:string;
  instrument_token:string;
  trading_symbol:string;
  product:string;
  transaction_type:'BUY'|'SELL';
  order_type:string;
  quantity:number;
  filled_quantity:number;
  status:string;
  exchange_order_id:string|null;
  order_timestamp:string; // Upstox IST local YYYY-MM-DD HH:mm:ss
  exchange_timestamp:string|null;
}
export interface Phase40OrderHistory {
  origin:'OPERATOR_ARCHIVED_UNVERIFIED';
  method:'GET';
  path:'/v2/order/history';
  query:{order_id:string};
  capturedAt:string;
  httpStatus:200;
  response:{status:'success';data:Phase40OrderEvent[]};
}
export interface Phase40OrderHistoryInput {
  schemaVersion:'ADAPTIVE_V2_PHASE40_NATIVE_CHILD_ORDER_V1';
  source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED';
  expected:{
    accountScopeId:string;
    instrumentKey:string;
    tradingSymbol:string;
    productType:'NRML';
    childOrderId:string;
    side:'SELL';
    quantity:number;
    lotSize:number;
  };
  history:Phase40OrderHistory;
}
export interface Phase40OrderHistoryPins{
  schemaVersion:'EXTERNALLY_PINNED_PHASE40_ORDER_HISTORY_V1';
  expectedAccountScopeId:string;
  expectedOrderId:string;
  expectedHistorySha256:string;
}
export interface Phase40OrderHistoryReport{
  mode:'ARCHIVED_SAME_DAY_CHILD_ORDER_LIFECYCLE';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'BROKER_REPORTED_OPEN_OR_COMPLETE_UNVERIFIED';
  reasonCodes:string[];
  eventsReviewed:number;
  brokerReportedExchangeOrderIdObserved:boolean;
  reportedTerminalStatus:'open'|'complete'|null;
  actualExchangeAcknowledgementIndependentlyVerified:false;
  authenticatedBrokerSource:false;
  standingGttWasNativeStop:false;
  entireOvernightStopContinuityVerified:false;
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
}
const childBase=():Phase40OrderHistoryReport=>({
  mode:'ARCHIVED_SAME_DAY_CHILD_ORDER_LIFECYCLE',
  status:'INVALID_EVIDENCE',reasonCodes:[],eventsReviewed:0,
  brokerReportedExchangeOrderIdObserved:false,
  reportedTerminalStatus:null,
  actualExchangeAcknowledgementIndependentlyVerified:false,
  authenticatedBrokerSource:false,standingGttWasNativeStop:false,
  entireOvernightStopContinuityVerified:false,
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,nativeOrderInstruction:null
});
const childFail=(status:Phase40OrderHistoryReport['status'],reason:string,
  count=0):Phase40OrderHistoryReport=>({
  ...childBase(),status,eventsReviewed:count,reasonCodes:[reason]
});
export function auditPhase40ArchivedChildHistory(
  input:Phase40OrderHistoryInput,
  pins:Phase40OrderHistoryPins
):Phase40OrderHistoryReport{
  const e=input?.expected,h=input?.history;
  if(!input||!pins||
    input.schemaVersion!=='ADAPTIVE_V2_PHASE40_NATIVE_CHILD_ORDER_V1'||
    input.source!=='OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED'||
    !e||!key(e.accountScopeId)||!key(e.instrumentKey)||
    !key(e.tradingSymbol)||!key(e.childOrderId)||
    e.productType!=='NRML'||e.side!=='SELL'||
    !pos(e.quantity)||!pos(e.lotSize)||
    e.quantity%e.lotSize!==0||
    pins.schemaVersion!=='EXTERNALLY_PINNED_PHASE40_ORDER_HISTORY_V1'||
    pins.expectedAccountScopeId!==e.accountScopeId||
    pins.expectedOrderId!==e.childOrderId||
    !HASH.test(pins.expectedHistorySha256)||
    !h||sha(h)!==pins.expectedHistorySha256)
    return childFail('INVALID_EVIDENCE',
      'INVALID_CHILD_ORDER_SOURCE_OR_EXTERNAL_SHA256_PINS');
  const rows=h.response?.data;
  if(h.origin!=='OPERATOR_ARCHIVED_UNVERIFIED'||
    h.method!=='GET'||h.path!=='/v2/order/history'||
    h.query?.order_id!==e.childOrderId||
    h.httpStatus!==200||h.response?.status!=='success'||
    !Number.isFinite(time(h.capturedAt))||
    !Array.isArray(rows)||rows.length<2||rows.length>MAX_HISTORY)
    return childFail('BLOCKED_OR_UNKNOWN',
      'SAME_DAY_ORDER_HISTORY_GET_NOT_COMPLETE_OR_UNUSABLE');
  let previousStatus='';
  let previouslyTerminal=false,seenExchangeId:string|null=null;
  const terminal=new Set(['cancelled','rejected','complete']);
  const good=new Set([
    'put order req received','validation pending',
    'open pending','open','trigger pending','modify pending',
    'modify validation pending','modified','not modified',
    'cancel pending','not cancelled','complete','cancelled',
    'rejected'
  ]);
  const day=new Date(time(h.capturedAt)+19800000).toISOString().slice(0,10);
  for(let i=0;i<rows.length;i++){
    const r=rows[i],status=lower(r?.status);
    if(!r||r.order_id!==e.childOrderId||
      r.instrument_token!==e.instrumentKey||
      r.trading_symbol!==e.tradingSymbol||
      r.product!=='D'||r.transaction_type!=='SELL'||
      !['SL','SL-M','MARKET','LIMIT'].includes(r.order_type)||
      r.quantity!==e.quantity||
      !Number.isSafeInteger(r.filled_quantity)||
      r.filled_quantity<0||r.filled_quantity>r.quantity||
      !key(r.order_request_id)||!good.has(status)||
      !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.order_timestamp)||
      r.order_timestamp.slice(0,10)!==day||
      (r.exchange_order_id!==null&&
        (!key(r.exchange_order_id)))||
      (seenExchangeId!==null&&r.exchange_order_id!==null&&
        seenExchangeId!==r.exchange_order_id)||
      (previouslyTerminal&&status!==previousStatus)||
      (status==='complete'&&r.filled_quantity!==e.quantity)||
      ((status==='open'||status==='complete')&&
        !r.exchange_order_id))
      return childFail('BLOCKED_OR_UNKNOWN',
        'CHILD_ORDER_ID_CONTRACT_STATUS_OR_EXCHANGE_REFERENCE_DISAGREES',i);
    if(status==='rejected'||status==='cancelled'||
      status==='cancel pending'||status==='modify pending'||
      status==='modify validation pending')
      return childFail('BLOCKED_OR_UNKNOWN',
        'CHILD_STOP_REJECTED_CANCELLED_OR_MODIFICATION_UNRESOLVED',i+1);
    if(r.exchange_order_id)seenExchangeId=r.exchange_order_id;
    if(terminal.has(status))previouslyTerminal=true;
    previousStatus=status;
  }
  if(!['open','complete'].includes(previousStatus)||
    seenExchangeId===null)
    return childFail('BLOCKED_OR_UNKNOWN',
      'MISSING_BROKER_REPORTED_OPEN_OR_COMPLETE_EXCHANGE_ORDER_ID',
      rows.length);
  return {...childBase(),
    status:'BROKER_REPORTED_OPEN_OR_COMPLETE_UNVERIFIED',
    eventsReviewed:rows.length,
    brokerReportedExchangeOrderIdObserved:true,
    reportedTerminalStatus:previousStatus as 'open'|'complete'};
}
export function hashPhase40OfflineArchive(input:unknown):string{
  return sha(input);
}
