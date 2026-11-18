/**
 * Adaptive Swing v2 Phase44 — OFFLINE same-session protective-order
 * modification, cancellation and replacement evidence gap ledger.
 *
 * Archives are operator-provided and independently pinned but NOT
 * authenticated broker/exchange source. An Ed25519-signed reviewer claim
 * cannot upgrade them to native stop ACK or proven overnight protection.
 *
 * No network calls, Upstox credentials, broker writes, GTT writes,
 * timers, live routes or production trading integration.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  auditPhase43TriggeredGttChildTrades,
  type Phase43TriggerChainInput,type Phase43ExternalSourcePins
} from './adaptiveUpstoxPhase43TriggeredGttChildChain.js';
import {
  hashPhase40OfflineArchive,
  type Phase40OrderHistory,type Phase40OrderEvent
} from './adaptiveUpstoxPhase40OvernightStopAudit.js';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_.|:/-]{1,150}$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const IST=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const sha=(x:Uint8Array|string)=>createHash('sha256').update(x)
  .digest('hex');
const validId=(v:unknown):v is string=>
  typeof v==='string'&&ID.test(v);
const validQty=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const instant=(x:unknown):number=>
  typeof x==='string'&&ISO.test(x)?Date.parse(x):NaN;
const istInstant=(x:unknown):number=>
  typeof x==='string'&&IST.test(x)?
    Date.parse(x.replace(' ','T')+'+05:30'):NaN;
const istDay=(epoch:number)=>Number.isFinite(epoch)?
  new Date(epoch+19800000).toISOString().slice(0,10):null;
const canonical=(v:unknown)=>hashPhase40OfflineArchive(v);
function decodeBase64(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||s.length<4||s.length>max*2||
    s.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  const b=Buffer.from(s,'base64');
  return b.length<=max&&b.toString('base64')===s?b:null;
}

export interface Phase44OrderSnapshot{
  source:'OPERATOR_SAME_SESSION_GET_UNVERIFIED';
  expectedOrderId:string;
  expectedExchangeOrderId:string;
  expectedQuantity:number;
  history:Phase40OrderHistory;
}
export interface Phase44SignedReviewClaim{
  schemaVersion:'ADAPTIVE_PHASE44_EXTERNAL_LIFECYCLE_REVIEW_V1';
  role:'INDEPENDENT_REVIEWER_NOT_EXCHANGE';
  claim:'OFFLINE_ORDER_MUTATIONS_RECONCILED_NOT_NATIVE_STOP';
  signedAt:string;
  reviewerSpkiDerBase64:string;
  signatureBase64:string;
}
export interface Phase44StopMutationArchive{
  schemaVersion:'ADAPTIVE_V2_PHASE44_STOP_MUTATION_GAP_LEDGER_V1';
  source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED';
  predecessorPhase43:Phase43TriggerChainInput;
  predecessorPins:Phase43ExternalSourcePins;
  sessionDate:string;
  orderSnapshots:Phase44OrderSnapshot[];
  signedReview:Phase44SignedReviewClaim;
}
export interface Phase44IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE44_STOP_MUTATION_AUDIT_PINS_V1';
  expectedAccountScopeId:string;
  expectedInstrumentKey:string;
  expectedGttOrderId:string;
  expectedSessionDate:string;
  expectedLongQuantity:number;
  expectedOrderIds:string[];
  expectedExchangeOrderIds:string[];
  expectedOrderHistorySha256:string[];
  expectedPredecessorArchiveSha256:string;
  expectedPredecessorPinsSha256:string;
  expectedLedgerChainTipSha256:string;
  expectedReviewerSpkiSha256:string;
  expectedReviewChallengeSha256:string;
  maximumReviewerLagMinutes:number;
}
export interface Phase44MutationReport{
  mode:'OFFLINE_BROKER_REPORTED_STOP_ORDER_CHANGE_CANCEL_REPLACE_LEDGER';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'BROKER_REPORTED_MODIFIED_ORDER_OPEN_UNVERIFIED'|
    'BROKER_REPORTED_REPLACEMENT_ORDER_OPEN_UNVERIFIED'|
    'BROKER_REPORTED_EXIT_COMPLETE_UNVERIFIED';
  reasons:string[];
  reviewedOrderCount:number;
  observedModifyRequests:number;
  observedModifyAcknowledgements:number;
  observedCancellationRequests:number;
  observedCancellationAcknowledgements:number;
  observedReplacementAcknowledgements:number;
  observedCancelToReplacementGapMs:number;
  openReportedQuantity:number;
  totalReportedFilledQuantity:number;
  remainingPositionQuantity:number;
  reviewerClaimCryptographicallySigned:boolean;
  independentExchangeOrderAcknowledgementVerified:false;
  independentlyAuthenticatedBrokerOrderEvents:false;
  completeDayEventProvenanceVerified:false;
  continuousIntradayStopCoverageVerified:false;
  continuousOvernightProtectionVerified:false;
  guaranteedStopFillPrice:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  protectedOvernight:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const warnings=[
  'BROKER_REPORTED_EXCHANGE_ORDER_ID_IS_NOT_AN_EXCHANGE_SIGNED_ACK',
  'REVIEWER_SIGNATURE_ONLY_PROVES_PINNED_KEY_SIGNED_LOCAL_CLAIMS',
  'ORDER_HISTORY_IS_AVAILABLE_FOR_ONE_TRADING_DAY_ONLY',
  'NO_AUTHENTICATED_UPSTOX_ORDER_EVENT_TRANSPORT_WAS_USED',
  'MODIFICATION_PENDING_CAN_LEAVE_ORDER_STATUS_UNKNOWN',
  'CANCELLATION_TO_REPLACEMENT_WINDOW_IS_NOT_CONFIRMED_PROTECTION',
  'REPLACEMENT_ACK_IS_BROKER_REPORTED_NOT_NATIVE_EXCHANGE_STOP',
  'A_FILLED_EXIT_IS_NOT_A_STANDING_PROTECTIVE_STOP',
  'NO_NIGHT_WEEKEND_CONTINUITY_OR_GAP_FILL_PRICE_GUARANTEE',
  'NO_LIVE_NRML_ORDER_GTT_WRITE_OR_POSITIONAL_15_15_SQUARE_OFF'
];
const blank=():Phase44MutationReport=>({
  mode:'OFFLINE_BROKER_REPORTED_STOP_ORDER_CHANGE_CANCEL_REPLACE_LEDGER',
  status:'INVALID_EVIDENCE',reasons:[],
  reviewedOrderCount:0,observedModifyRequests:0,
  observedModifyAcknowledgements:0,
  observedCancellationRequests:0,
  observedCancellationAcknowledgements:0,
  observedReplacementAcknowledgements:0,
  observedCancelToReplacementGapMs:0,
  openReportedQuantity:0,totalReportedFilledQuantity:0,
  remainingPositionQuantity:0,
  reviewerClaimCryptographicallySigned:false,
  independentExchangeOrderAcknowledgementVerified:false,
  independentlyAuthenticatedBrokerOrderEvents:false,
  completeDayEventProvenanceVerified:false,
  continuousIntradayStopCoverageVerified:false,
  continuousOvernightProtectionVerified:false,
  guaranteedStopFillPrice:false,brokerAuthenticated:false,
  brokerStopInstalled:false,protectedOvernight:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings
});
const deny=(code:string,status:Phase44MutationReport['status']='BLOCKED_OR_UNKNOWN',
  partial?:Partial<Phase44MutationReport>):Phase44MutationReport=>({
  ...blank(),...partial,status,reasons:[code]
});

/** Digest of a prefix-ordered order-history snapshot chain.
 * A separately provisioned tip limits unnoticed tail deletion relative
 * to the independent pin; never treats local self-pins as broker proof.
 */
export function phase44ArchiveChainTip(
  originalChildId:string,archives:Phase44OrderSnapshot[],
  historyHashes:string[]
):string{
  let prev=sha('ADAPTIVE_PHASE44_ORDER_EVENT_GENESIS_V1|'+originalChildId);
  archives.forEach((entry,i)=>{
    prev=sha(JSON.stringify({
      domain:'ADAPTIVE_PHASE44_ORDER_MUTATION_LINK_V1',index:i,
      orderId:entry.expectedOrderId,
      exchangeOrderId:entry.expectedExchangeOrderId,
      quantity:entry.expectedQuantity,
      archiveSha256:historyHashes[i],
      prevSha256:prev
    }));
  });
  return prev;
}
export function phase44ReviewerMessage(
  archive:Phase44StopMutationArchive,
  pins:Phase44IndependentPins
):Buffer{
  return Buffer.from(JSON.stringify({
    domain:'ADAPTIVE_PHASE44_ORDER_LIFECYCLE_REVIEW_V1',
    challengeSha256:pins.expectedReviewChallengeSha256,
    predecessorArchiveSha256:pins.expectedPredecessorArchiveSha256,
    predecessorPinsSha256:pins.expectedPredecessorPinsSha256,
    accountScopeId:pins.expectedAccountScopeId,
    gttOrderId:pins.expectedGttOrderId,
    instrumentKey:pins.expectedInstrumentKey,
    sessionDate:archive.sessionDate,
    expectedLongQuantity:pins.expectedLongQuantity,
    expectedOrderIds:pins.expectedOrderIds,
    expectedExchangeOrderIds:pins.expectedExchangeOrderIds,
    expectedOrderHistorySha256:pins.expectedOrderHistorySha256,
    finalChainTipSha256:pins.expectedLedgerChainTipSha256,
    signedAt:archive.signedReview.signedAt,
    claim:archive.signedReview.claim
  }),'utf8');
}
function reviewerValid(archive:Phase44StopMutationArchive,
  pins:Phase44IndependentPins,mostRecentCapture:number):boolean{
  const claim=archive.signedReview;
  if(!claim||claim.schemaVersion!==
      'ADAPTIVE_PHASE44_EXTERNAL_LIFECYCLE_REVIEW_V1'||
    claim.role!=='INDEPENDENT_REVIEWER_NOT_EXCHANGE'||
    claim.claim!=='OFFLINE_ORDER_MUTATIONS_RECONCILED_NOT_NATIVE_STOP')
    return false;
  const at=instant(claim.signedAt);
  if(!Number.isFinite(at)||at<mostRecentCapture||
    at-mostRecentCapture>pins.maximumReviewerLagMinutes*60_000)
    return false;
  const spki=decodeBase64(claim.reviewerSpkiDerBase64,4096);
  const signature=decodeBase64(claim.signatureBase64,128);
  if(!spki||!signature||signature.length!==64||
    sha(spki)!==pins.expectedReviewerSpkiSha256)return false;
  try{
    const key=createPublicKey({key:spki,type:'spki',format:'der'});
    return key.asymmetricKeyType==='ed25519'&&
      verify(null,phase44ReviewerMessage(archive,pins),key,signature);
  }catch{return false;}
}

type Status='put order req received'|'validation pending'|
  'open pending'|'trigger pending'|'open'|'modify pending'|
  'modified'|'cancel pending'|'cancelled'|'complete'|'rejected'|
  'not modified'|'not cancelled';
const KNOWN:ReadonlySet<string>=new Set<Status>([
  'put order req received','validation pending','open pending',
  'trigger pending','open','modify pending','modified',
  'cancel pending','cancelled','complete','rejected',
  'not modified','not cancelled'
]);
type State='AWAITING'|'OPEN'|'MODIFY_PENDING'|'MODIFIED'|
  'CANCEL_PENDING'|'CANCELLED'|'COMPLETE'|'REJECTED';
interface AuditedOrder{
  terminal:'OPEN'|'CANCELLED'|'COMPLETE';
  firstAt:number;
  confirmedAt:number;
  terminalAt:number;
  filled:number;
  modifyReqs:number;modifyAcks:number;
  cancelReqs:number;cancelAcks:number;
  exchangeRefSeen:boolean;
}
type Validation = {ok:true;value:AuditedOrder}|{ok:false;code:string};
const bad=(code:string):Validation=>({ok:false,code});

/**
 * Conservative state machine: modification is not accepted until a later
 * OPEN event. Cancellation requires a pending request and confirmation.
 * 'not modified'/'not cancelled' are deliberately unresolved.
 */
function auditOneHistory(
  snapshot:Phase44OrderSnapshot,
  instrument:string,accountDate:string,
  expectedSymbol:string,minCapture:number,
  minimumNewEventTime:number|null=null,originalPrefixLength=0
):Validation{
  const h=snapshot.history,records=h?.response?.data;
  if(!validId(snapshot.expectedOrderId)||
    !validId(snapshot.expectedExchangeOrderId)||
    !validQty(snapshot.expectedQuantity)||
    !h||h.origin!=='OPERATOR_ARCHIVED_UNVERIFIED'||
    h.method!=='GET'||h.path!=='/v2/order/history'||
    h.query?.order_id!==snapshot.expectedOrderId||
    h.httpStatus!==200||h.response?.status!=='success'||
    !Number.isFinite(instant(h.capturedAt))||
    istDay(instant(h.capturedAt))!==accountDate||
    instant(h.capturedAt)<minCapture||
    !Array.isArray(records)||records.length<2||
    records.length>64)
    return bad('INVALID_ARCHIVED_SAME_DAY_ORDER_HISTORY');
  let state:State='AWAITING',
    previousTime=-Infinity,lastRequest=0,
    previousFilled=0,seenExchangeId=false,hasOpened=false,
    firstAt=NaN,lastAt=NaN,
    modifications=0,modificationAcks=0,cancellations=0,
    cancellationAcks=0,confirmedAt=NaN,
    pendingRequestId=0;
  for(const [index,row] of records.entries()){
    const status=row?.status?.trim()?.toLowerCase();
    const at=istInstant(row?.order_timestamp);
    const requestId=Number(row?.order_request_id);
    if(!row||!KNOWN.has(status??'')||
      row.order_id!==snapshot.expectedOrderId||
      row.instrument_token!==instrument||
      row.trading_symbol!==expectedSymbol||
      row.product!=='D'||row.transaction_type!=='SELL'||
      !['SL','SL-M'].includes(row.order_type)||
      row.quantity!==snapshot.expectedQuantity||
      !Number.isSafeInteger(row.filled_quantity)||
      row.filled_quantity<previousFilled||
      row.filled_quantity>snapshot.expectedQuantity||
      !/^[1-9]\d{0,7}$/.test(row.order_request_id)||
      requestId<lastRequest||
      !Number.isFinite(at)||istDay(at)!==accountDate||
      at<previousTime||at>instant(h.capturedAt)||
      (minimumNewEventTime!==null&&index>=originalPrefixLength&&
        at<minimumNewEventTime)||
      (hasOpened&&row.exchange_order_id!==
        snapshot.expectedExchangeOrderId)||
      (row.exchange_order_id!==null&&
        row.exchange_order_id!==snapshot.expectedExchangeOrderId)||
      (row.exchange_timestamp!==null&&
        (!Number.isFinite(istInstant(row.exchange_timestamp))||
          istDay(istInstant(row.exchange_timestamp))!==accountDate)))
      return bad('ORDER_FIELD_TIMESTAMP_QUANTITY_OR_EXCHANGE_REFERENCE_MISMATCH');
    if(index===0){
      firstAt=at;
      if(status!=='put order req received'||
        row.filled_quantity!==0||
        row.exchange_order_id!==null)
        return bad('ORDER_HISTORY_DOES_NOT_BEGIN_AT_NEW_REQUEST');
    }
    if(row.exchange_order_id!==null)seenExchangeId=true;
    if(status==='not cancelled'||status==='not modified'||
      status==='rejected')
      return bad('REQUEST_REJECTED_OR_RESULT_UNRESOLVED');
    switch(state){
      case 'AWAITING':
        if(status==='put order req received'&&index===0)break;
        if(status==='validation pending'||status==='open pending'||
          status==='trigger pending')break;
        if(status==='open'){
          if(!seenExchangeId)return bad('OPEN_ACK_LACKS_EXCHANGE_ORDER_REFERENCE');
          state='OPEN';hasOpened=true;confirmedAt=at;break;
        }
        return bad('ILLEGAL_INITIAL_ORDER_TRANSITION');
      case 'OPEN':
        if(status==='modify pending'){
          if(requestId<=lastRequest)
            return bad('MODIFY_WITHOUT_NEW_ORDER_REQUEST_NUMBER');
          state='MODIFY_PENDING';pendingRequestId=requestId;
          modifications++;break;
        }
        if(status==='cancel pending'){
          if(requestId<=lastRequest)
            return bad('CANCEL_WITHOUT_NEW_ORDER_REQUEST_NUMBER');
          state='CANCEL_PENDING';pendingRequestId=requestId;
          cancellations++;break;
        }
        if(status==='complete'){
          if(row.filled_quantity!==snapshot.expectedQuantity)
            return bad('COMPLETE_WITHOUT_FULL_FILL');
          state='COMPLETE';break;
        }
        return bad('UNEXPECTED_TRANSITION_AFTER_BROKER_OPEN');
      case 'MODIFY_PENDING':
        if(status!=='modified'||requestId!==pendingRequestId||
          !seenExchangeId)
          return bad('MODIFICATION_NOT_CONFIRMED');
        state='MODIFIED';modificationAcks++;break;
      case 'MODIFIED':
        if(status!=='open'||requestId!==pendingRequestId||
          !seenExchangeId)
          return bad('POST_MODIFY_OPEN_RECONFIRMATION_MISSING');
        state='OPEN';confirmedAt=at;break;
      case 'CANCEL_PENDING':
        if(status!=='cancelled'||requestId!==pendingRequestId)
          return bad('CANCELLATION_NOT_CONFIRMED');
        state='CANCELLED';cancellationAcks++;break;
      default:
        return bad('EVENT_AFTER_TERMINAL_ORDER_STATUS');
    }
    previousFilled=row.filled_quantity;
    previousTime=at;lastAt=at;lastRequest=requestId;
  }
  if(!hasOpened||!seenExchangeId)return bad('NO_BROKER_REPORTED_ORDER_OPEN_ACK');
  if(state==='MODIFY_PENDING'||state==='MODIFIED'||
    state==='CANCEL_PENDING'||state==='AWAITING')
    return bad('PENDING_OR_UNRESOLVED_LAST_MUTATION');
  if(state==='COMPLETE'&&previousFilled!==snapshot.expectedQuantity)
    return bad('COMPLETE_WITHOUT_FULL_FILL');
  return {ok:true,value:{
    terminal:state as 'OPEN'|'COMPLETE'|'CANCELLED',
    firstAt,confirmedAt,terminalAt:lastAt,filled:previousFilled,
    modifyReqs:modifications,modifyAcks:modificationAcks,
    cancelReqs:cancellations,cancelAcks:cancellationAcks,
    exchangeRefSeen:seenExchangeId
  }};
}

/** Always return source-unverified research evidence. */
export function auditPhase44StopMutationLedger(
  archive:Phase44StopMutationArchive,pins:Phase44IndependentPins
):Phase44MutationReport{
  if(!archive||!pins||archive.schemaVersion!==
      'ADAPTIVE_V2_PHASE44_STOP_MUTATION_GAP_LEDGER_V1'||
    archive.source!=='PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED'||
    pins.schemaVersion!==
      'INDEPENDENT_PHASE44_STOP_MUTATION_AUDIT_PINS_V1'||
    !validId(pins.expectedAccountScopeId)||
    !validId(pins.expectedInstrumentKey)||
    !validId(pins.expectedGttOrderId)||
    !DATE.test(pins.expectedSessionDate)||
    !validQty(pins.expectedLongQuantity)||
    !Array.isArray(archive.orderSnapshots)||
    archive.orderSnapshots.length<1||
    archive.orderSnapshots.length>5||
    !Array.isArray(pins.expectedOrderIds)||
    !Array.isArray(pins.expectedExchangeOrderIds)||
    !Array.isArray(pins.expectedOrderHistorySha256)||
    [pins.expectedOrderIds,pins.expectedExchangeOrderIds,
      pins.expectedOrderHistorySha256].some(
      list=>list.length!==archive.orderSnapshots.length)||
    new Set(pins.expectedOrderIds).size!==pins.expectedOrderIds.length||
    new Set(pins.expectedExchangeOrderIds).size!==
      pins.expectedExchangeOrderIds.length||
    pins.expectedOrderIds.some(x=>!validId(x))||
    pins.expectedExchangeOrderIds.some(x=>!validId(x))||
    [pins.expectedPredecessorArchiveSha256,
      pins.expectedPredecessorPinsSha256,
      pins.expectedLedgerChainTipSha256,
      pins.expectedReviewerSpkiSha256,
      pins.expectedReviewChallengeSha256,
      ...pins.expectedOrderHistorySha256].some(
      x=>typeof x!=='string'||!SHA.test(x))||
    !Number.isSafeInteger(pins.maximumReviewerLagMinutes)||
    pins.maximumReviewerLagMinutes<1||
    pins.maximumReviewerLagMinutes>1440||
    archive.sessionDate!==pins.expectedSessionDate||
    canonical(archive.predecessorPhase43)!==
      pins.expectedPredecessorArchiveSha256||
    canonical(archive.predecessorPins)!==
      pins.expectedPredecessorPinsSha256)
    return deny('MISSING_OR_INCONSISTENT_INDEPENDENT_SOURCE_PINS',
      'INVALID_EVIDENCE');

  const prev=archive.predecessorPhase43,prevPins=archive.predecessorPins;
  if(!prev||!prevPins||
    prev.accountScopeId!==pins.expectedAccountScopeId||
    prev.positionInstrumentKey!==pins.expectedInstrumentKey||
    prev.gttOrderId!==pins.expectedGttOrderId||
    prev.expectedLongQuantity!==pins.expectedLongQuantity||
    prevPins.expectedSessionDate!==pins.expectedSessionDate||
    prevPins.expectedChildOrderId!==pins.expectedOrderIds[0]||
    prevPins.expectedExchangeOrderId!==pins.expectedExchangeOrderIds[0])
    return deny('PHASE43_LINEAGE_OR_ACCOUNT_SCOPE_MISMATCH',
      'INVALID_EVIDENCE');
  const previous=auditPhase43TriggeredGttChildTrades(prev,prevPins);
  if(previous.status!=='BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED'||
    previous.executionAuthorized!==false||
    previous.brokerStopInstalled!==false||
    previous.brokerAuthenticated!==false)
    return deny('PHASE43_TRIGGERED_CHILD_PREREQUISITE_UNVERIFIED_OR_FILLED');

  const snap=archive.orderSnapshots;
  const originalRecords=prev.childHistory?.history?.response?.data;
  if(!Array.isArray(originalRecords)||originalRecords.length<2||
    snap[0]?.expectedOrderId!==pins.expectedOrderIds[0]||
    !Array.isArray(snap[0]?.history?.response?.data)||
    !isDeepStrictEqual(
      snap[0].history.response.data.slice(0,originalRecords.length),
      originalRecords))
    return deny('ORIGINAL_CHILD_HISTORY_PREFIX_MUTATED_OR_MISSING');

  for(let i=0;i<snap.length;i++){
    const x=snap[i];
    if(!x||x.source!=='OPERATOR_SAME_SESSION_GET_UNVERIFIED'||
      x.expectedOrderId!==pins.expectedOrderIds[i]||
      x.expectedExchangeOrderId!==pins.expectedExchangeOrderIds[i]||
      canonical(x.history)!==pins.expectedOrderHistorySha256[i])
      return deny('ARCHIVED_HISTORY_HASH_SCOPE_OR_POSITION_MISMATCH',
        'INVALID_EVIDENCE');
  }
  if(phase44ArchiveChainTip(pins.expectedOrderIds[0],snap,
      pins.expectedOrderHistorySha256)!==
    pins.expectedLedgerChainTipSha256)
    return deny('EXTERNALLY_PINNED_FINAL_EVENT_CHAIN_TIP_MISMATCH',
      'INVALID_EVIDENCE');

  const symbol=prev.childHistory.expected.tradingSymbol;
  let totalFilled=0,replacements=0,changes=0,changeAcks=0,
    cancelRequests=0,cancelAcks=0,gaps=0,lastCapture=instant(
      prev.externalReviewer.claimedAt),
    terminal:'OPEN'|'COMPLETE'|'CANCELLED'='OPEN';
  let priorCancelTime:number|null=null,expectedQty=pins.expectedLongQuantity;
  let lastOpenQuantity=0;
  for(let i=0;i<snap.length;i++){
    const order=snap[i];
    if(order.expectedQuantity!==expectedQty)
      return deny('REPLACEMENT_ORDER_QUANTITY_NOT_EQUAL_UNFILLED_POSITION',
        'BLOCKED_OR_UNKNOWN',{reviewedOrderCount:i,
          remainingPositionQuantity:expectedQty});
    const parsed=auditOneHistory(order,pins.expectedInstrumentKey,
      pins.expectedSessionDate,symbol,lastCapture,
      i===0?instant(prev.externalReviewer.claimedAt):null,
      i===0?originalRecords.length:0);
    if(!parsed.ok)
      return deny(parsed.code,'BLOCKED_OR_UNKNOWN',
        {reviewedOrderCount:i,remainingPositionQuantity:expectedQty});
    const result=parsed.value;
    if(i===0){
      if(result.filled<previous.archivedFilledQuantity)
        return deny('INITIAL_ORDER_FINAL_FILLED_QTY_BELOW_PHASE43_RECEIPT');
    }else{
      if(priorCancelTime===null||result.firstAt<=priorCancelTime||
        result.confirmedAt<=priorCancelTime)
        return deny('REPLACEMENT_LACKS_PRIOR_FINAL_CANCEL_OR_POSITIVE_GAP',
          'BLOCKED_OR_UNKNOWN',{reviewedOrderCount:i});
      const diff=result.confirmedAt-priorCancelTime;
      if(!Number.isSafeInteger(diff)||diff<=0||diff>24*3600_000)
        return deny('INVALID_CANCEL_TO_NEW_ORDER_OPEN_GAP');
      gaps+=diff;replacements++;
      priorCancelTime=null;
    }
    totalFilled+=result.filled;
    if(!Number.isSafeInteger(totalFilled)||
      totalFilled>pins.expectedLongQuantity)
      return deny('CUMULATIVE_EXITS_OVERFILLED_OR_OVERFLOWED');
    expectedQty=pins.expectedLongQuantity-totalFilled;
    lastCapture=instant(order.history.capturedAt);
    changes+=result.modifyReqs;changeAcks+=result.modifyAcks;
    cancelRequests+=result.cancelReqs;cancelAcks+=result.cancelAcks;
    terminal=result.terminal;
    lastOpenQuantity=terminal==='OPEN'?expectedQty:0;
    if(terminal==='CANCELLED'){
      priorCancelTime=result.terminalAt;
      if(i===snap.length-1)
        return deny('CANCELLED_STOP_WITHOUT_LATER_REPLACEMENT');
      if(expectedQty===0)
        return deny('CANCELLED_ORDER_ALREADY_FLAT_WITH_EXTRA_REPLACEMENT');
    }else if(i<snap.length-1){
      return deny('NEXT_ORDER_WITHOUT_PREDECESSOR_CANCELLATION');
    }
  }
  if(changes===0&&cancelAcks===0)
    return deny('NO_MODIFICATION_OR_CANCELLATION_REPLACEMENT_EVIDENCE');
  if(changes!==changeAcks||cancelRequests!==cancelAcks)
    return deny('MISSING_ORDER_MUTATION_CONFIRMATION');
  const partial={
    reviewedOrderCount:snap.length,observedModifyRequests:changes,
    observedModifyAcknowledgements:changeAcks,
    observedCancellationRequests:cancelRequests,
    observedCancellationAcknowledgements:cancelAcks,
    observedReplacementAcknowledgements:replacements,
    observedCancelToReplacementGapMs:gaps,
    openReportedQuantity:lastOpenQuantity,
    totalReportedFilledQuantity:totalFilled,
    remainingPositionQuantity:expectedQty
  };
  if(!reviewerValid(archive,pins,lastCapture))
    return deny('EXTERNAL_SIGNED_LIFECYCLE_REVIEW_NOT_VALID', 
      'BLOCKED_OR_UNKNOWN',partial);
  if(terminal==='COMPLETE'&&expectedQty!==0)
    return deny('REPORTED_COMPLETE_BUT_POSITION_NOT_FLAT');
  if(terminal==='OPEN'&&expectedQty<=0)
    return deny('REPORTED_OPEN_WITH_NO_REMAINING_POSITION');
  return {...blank(),...partial,
    status:terminal==='COMPLETE'?
      'BROKER_REPORTED_EXIT_COMPLETE_UNVERIFIED':
      replacements>0?
        'BROKER_REPORTED_REPLACEMENT_ORDER_OPEN_UNVERIFIED':
        'BROKER_REPORTED_MODIFIED_ORDER_OPEN_UNVERIFIED',
    reviewerClaimCryptographicallySigned:true};
}
