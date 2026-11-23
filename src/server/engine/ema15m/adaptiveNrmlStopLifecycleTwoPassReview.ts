/**
 * Phase108: read-only, two-pass NRML GTT/SELL-child lifecycle drift review.
 *
 * Separate broker GTT, order and portfolio GETs are non-atomic. A benign
 * Phase92/107 broker observation cannot be carried across cancel/replace,
 * trigger-price changes or an intervening SELL fill as live protection proof.
 * This manual diagnostic NEVER authorises BUY, SELL, settlement or closure.
 */
import {
  reviewNrmlGttChildReadOnly,
  type ReadOnlyNrmlGttBroker,
  type GttChildReviewRequest,
  type GttChildReviewReport
} from './adaptiveNrmlGttChildLineageAudit.js';

type Row=Record<string,unknown>;
const obj=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=256;
const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const up=(v:unknown)=>typeof v==='string'?v.trim().toUpperCase():'';

export type NrmlStopLifecycleState=
  'INVALID_REQUEST'|
  'BROKER_SESSION_UNVERIFIED'|
  'BROKER_SESSION_CHANGED_DURING_REVIEW'|
  'GTT_OR_CHILD_BROKER_SOURCE_INCOMPLETE'|
  'GTT_PARENT_MISSING_OR_CONTRACT_CONFLICT'|
  'GTT_PARENT_OR_STOP_RULE_MUTATED_DURING_REVIEW'|
  'CHILD_OR_BROKER_NET_CHANGED_DURING_REVIEW'|
  'BROKER_CHILD_OR_GTT_LIFECYCLE_UNRESOLVED'|
  'SCHEDULED_GTT_NO_EXCHANGE_CHILD_NOT_PROTECTED'|
  'STABLE_BROKER_CHILD_OBSERVATION_NOT_PROTECTIVE_ACK';

export interface NrmlStopLifecycleReport{
  state:NrmlStopLifecycleState;
  reasonCodes:readonly string[];
  brokerReadPasses:0|1|2;
  firstPassState:GttChildReviewReport['status']|null;
  secondPassState:GttChildReviewReport['status']|null;
  brokerReportedOriginalLongQuantity:number|null;
  brokerReportedSellFilledQuantity:number|null;
  brokerReportedRemainingLongQuantity:number|null;
  /** No independently authenticated active protective child ACK exists. */
  quantityWithoutIndependentProtectiveAck:number|null;
  gttParentChangedDuringReview:boolean;
  childOrNetChangedDuringReview:boolean;
  scheduledGttNoExchangeChild:boolean;
  generatedBrokerChildObserved:boolean;
  parentAndChildResponsesAtomic:false;
  independentExchangeChildAckCertified:false;
  guaranteedStopFill:false;
  accountCapitalAndMarginReconciled:false;
  realisedPnlWriteAuthorized:false;
  automaticPositionClosureAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}

type Summary=Partial<Pick<NrmlStopLifecycleReport,
  'brokerReadPasses'|'firstPassState'|'secondPassState'|
  'brokerReportedOriginalLongQuantity'|'brokerReportedSellFilledQuantity'|
  'brokerReportedRemainingLongQuantity'|'quantityWithoutIndependentProtectiveAck'|
  'gttParentChangedDuringReview'|'childOrNetChangedDuringReview'|
  'scheduledGttNoExchangeChild'|'generatedBrokerChildObserved'>>;
function report(state:NrmlStopLifecycleState,reasons:string[],
  summary:Summary={}):NrmlStopLifecycleReport{
  return {
    state,reasonCodes:[...new Set(reasons)].sort(),
    brokerReadPasses:summary.brokerReadPasses??0,
    firstPassState:summary.firstPassState??null,
    secondPassState:summary.secondPassState??null,
    brokerReportedOriginalLongQuantity:summary.brokerReportedOriginalLongQuantity??null,
    brokerReportedSellFilledQuantity:summary.brokerReportedSellFilledQuantity??null,
    brokerReportedRemainingLongQuantity:summary.brokerReportedRemainingLongQuantity??null,
    quantityWithoutIndependentProtectiveAck:
      summary.quantityWithoutIndependentProtectiveAck??null,
    gttParentChangedDuringReview:summary.gttParentChangedDuringReview===true,
    childOrNetChangedDuringReview:summary.childOrNetChangedDuringReview===true,
    scheduledGttNoExchangeChild:summary.scheduledGttNoExchangeChild===true,
    generatedBrokerChildObserved:summary.generatedBrokerChildObserved===true,
    parentAndChildResponsesAtomic:false,
    independentExchangeChildAckCertified:false,
    guaranteedStopFill:false,accountCapitalAndMarginReconciled:false,
    realisedPnlWriteAuthorized:false,automaticPositionClosureAuthorized:false,
    liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
  };
}
const valid=(req:GttChildReviewRequest):boolean=>
  !!req&&id(req.expectedAccountId)&&id(req.instrumentKey)&&
  id(req.gttOrderId)&&req.gttOrderId.startsWith('GTT-')&&
  positive(req.lotSize)&&positive(req.expectedLongQuantity)&&
  req.expectedLongQuantity%req.lotSize===0;

/**
 * A sanitized private comparison fingerprint; never serialize it to users.
 * Include expiry, parent size, trigger prices, trailing gap, STOPLOSS
 * lifecycle and generated child ID, plus other rules for target/cancel
 * changes. Reject missing/ambiguous exact STOPLOSS or parent.
 */
function parentFingerprint(
  raw:unknown,scope:GttChildReviewRequest
):string|null{
  if(!Array.isArray(raw)||raw.length!==1||!obj(raw[0]))return null;
  const p=raw[0];
  if(p.gtt_order_id!==scope.gttOrderId||
     p.instrument_token!==scope.instrumentKey||
     p.product!=='D'||p.quantity!==scope.expectedLongQuantity||
     !Array.isArray(p.rules)||p.rules.length<1)return null;
  let stops=0;
  const rules:Row[]=[];
  for(const value of p.rules){
    if(!obj(value)||!id(value.strategy)||!id(value.transaction_type)||
       !id(value.status))return null;
    const strategy=up(value.strategy),side=up(value.transaction_type);
    if(strategy==='STOPLOSS'&&side==='SELL')stops++;
    if(value.order_id!==null&&value.order_id!==undefined&&
       !id(value.order_id))return null;
    for(const fld of ['trigger_price','trailing_gap']){
      const n=value[fld];
      if(n!==null&&n!==undefined&&
         (typeof n!=='number'||!Number.isFinite(n)))return null;
    }
    rules.push({
      strategy,side,status:up(value.status),
      orderId:value.order_id??null,
      triggerType:value.trigger_type??null,
      triggerPrice:value.trigger_price??null,
      trailingGap:value.trailing_gap??null,
      message:value.message??null
    });
  }
  if(stops!==1)return null;
  // Preserve source rule ordering. Reorder is a mutation for evidence.
  const stable={
    gttOrderId:p.gtt_order_id,product:p.product,
    instrumentToken:p.instrument_token,quantity:p.quantity,
    type:p.type??null,exchange:p.exchange??null,
    expiresAt:p.expires_at??null,createdAt:p.created_at??null,
    rules
  };
  return JSON.stringify(stable);
}
const stableReview=(r:GttChildReviewReport):boolean=>
  r.status==='SCHEDULED_GTT_NO_EXCHANGE_CHILD'||
  r.status==='OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE';
const comparable=(r:GttChildReviewReport)=>JSON.stringify({
  status:r.status,reasonCodes:r.reasonCodes,
  parentGttFound:r.parentGttFound,
  scheduledWithoutGeneratedOrder:r.scheduledWithoutGeneratedOrder,
  generatedChildOrderIdObserved:r.generatedChildOrderIdObserved,
  brokerReportedExchangeOrderIdObserved:r.brokerReportedExchangeOrderIdObserved,
  brokerReportedChildFilledQuantity:r.brokerReportedChildFilledQuantity,
  brokerReportedNetLongQuantityMatches:r.brokerReportedNetLongQuantityMatches,
  brokerReportedNetPositionMatchesExecutedSellRemainder:
    r.brokerReportedNetPositionMatchesExecutedSellRemainder,
  exactGttToChildReferenceMatched:r.exactGttToChildReferenceMatched,
  otherSellOrderCandidates:r.otherSellOrderCandidates,
  otherGttSellRuleCandidates:r.otherGttSellRuleCandidates,
  unresolvedSameContractBuyOrders:r.unresolvedSameContractBuyOrders,
  parentGttListedExactlyOnce:r.parentGttListedExactlyOnce
});

export async function reviewNrmlStopLifecycleTwoPassReadOnly(
  broker:ReadOnlyNrmlGttBroker,scope:GttChildReviewRequest
):Promise<NrmlStopLifecycleReport>{
  if(!valid(scope))return report('INVALID_REQUEST',
    ['INVALID_ACCOUNT_GTT_INSTRUMENT_OR_LOT_QUANTITY']);
  if(!broker||typeof broker.getLiveConnectionStatus!=='function'||
     typeof broker.getBrokerAuthEpoch!=='function'||
     typeof broker.getGttOrderDetails!=='function')
    return report('BROKER_SESSION_UNVERIFIED',
      ['BROKER_GTT_SESSION_METHOD_UNAVAILABLE']);
  let pinnedEpoch:number;
  try{
    const auth=broker.getLiveConnectionStatus();
    pinnedEpoch=broker.getBrokerAuthEpoch();
    if(auth?.isConnected!==true||auth.userId!==scope.expectedAccountId||
       !positive(pinnedEpoch))
      return report('BROKER_SESSION_UNVERIFIED',
        ['BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED']);
  }catch{
    return report('BROKER_SESSION_UNVERIFIED',
      ['BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED']);
  }
  const sameSession=():boolean=>{
    try{
      const auth=broker.getLiveConnectionStatus();
      return auth?.isConnected===true&&auth.userId===scope.expectedAccountId&&
        broker.getBrokerAuthEpoch()===pinnedEpoch;
    }catch{return false;}
  };
  const lost=(summary:Summary={})=>report(
    'BROKER_SESSION_CHANGED_DURING_REVIEW',
    ['BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_DURING_STOP_LIFECYCLE_GET'],
    summary);
  if(!sameSession())return lost();
  let initialGtt:unknown;
  try{initialGtt=await broker.getGttOrderDetails(scope.gttOrderId);}
  catch{return report('GTT_OR_CHILD_BROKER_SOURCE_INCOMPLETE',
    ['FIRST_GTT_PARENT_GET_FAILED']);}
  if(!sameSession())return lost();
  const initialParent=parentFingerprint(initialGtt,scope);
  if(initialParent===null)return report(
    'GTT_PARENT_MISSING_OR_CONTRACT_CONFLICT',
    ['INITIAL_GTT_STOPLOSS_PARENT_NOT_EXACT_UNIQUE_NRML_CONTRACT']);
  const first=await reviewNrmlGttChildReadOnly(broker,scope);
  const firstSummary:Summary={brokerReadPasses:1,firstPassState:first.status};
  if(!sameSession())return lost(firstSummary);
  if(!stableReview(first))return report(
    'BROKER_CHILD_OR_GTT_LIFECYCLE_UNRESOLVED',
    ['FIRST_GTT_CHILD_BROKER_NET_CENSUS_NOT_RECONCILED'],firstSummary);
  // The second entire parent->child->trades->net census must be a new
  // read. We also re-fetch the raw parent AFTER both censuses to catch
  // trigger price, generated child replacement and expiry mutation
  // otherwise hidden by sanitized first/second report summaries.
  const second=await reviewNrmlGttChildReadOnly(broker,scope);
  const summary:Summary={...firstSummary,brokerReadPasses:2,
    secondPassState:second.status};
  if(!sameSession())return lost(summary);
  if(!stableReview(second))return report(
    'BROKER_CHILD_OR_GTT_LIFECYCLE_UNRESOLVED',
    ['SECOND_GTT_CHILD_BROKER_NET_CENSUS_NOT_RECONCILED'],summary);
  let lastGtt:unknown;
  try{lastGtt=await broker.getGttOrderDetails(scope.gttOrderId);}
  catch{return report('GTT_OR_CHILD_BROKER_SOURCE_INCOMPLETE',
    ['FINAL_GTT_PARENT_GET_FAILED'],summary);}
  if(!sameSession())return lost(summary);
  const lastParent=parentFingerprint(lastGtt,scope);
  if(lastParent===null||initialParent!==lastParent)return report(
    'GTT_PARENT_OR_STOP_RULE_MUTATED_DURING_REVIEW',
    ['GTT_PARENT_EXPIRED_CANCELLED_MODIFIED_OR_CHILD_ID_REPLACED'],
    {...summary,gttParentChangedDuringReview:true});
  if(comparable(first)!==comparable(second))return report(
    'CHILD_OR_BROKER_NET_CHANGED_DURING_REVIEW',
    ['BROKER_CHILD_FILLS_NET_OR_COMPETING_ORDER_BOOK_CHANGED'],
    {...summary,childOrNetChangedDuringReview:true});
  const scheduled=second.status==='SCHEDULED_GTT_NO_EXCHANGE_CHILD';
  const matchedNet=second.brokerReportedNetPositionMatchesExecutedSellRemainder;
  const filled=scheduled?0:second.brokerReportedChildFilledQuantity;
  // Strictly descriptive current-day broker observations. No unobserved
  // cancelled/replaced/other venue fills are inferred or credited.
  const remaining=matchedNet&&Number.isSafeInteger(filled)&&
    filled>=0&&filled<=scope.expectedLongQuantity
    ?scope.expectedLongQuantity-filled:null;
  const finalSummary:Summary={
    ...summary,brokerReportedOriginalLongQuantity:scope.expectedLongQuantity,
    brokerReportedSellFilledQuantity:matchedNet?filled:null,
    brokerReportedRemainingLongQuantity:remaining,
    // No verified native exchange protective child/covered amount is
    // available. Conservatively flag ALL remaining exposure as lacking
    // independent protection ACK (even if broker reports a child).
    quantityWithoutIndependentProtectiveAck:remaining,
    scheduledGttNoExchangeChild:scheduled,
    generatedBrokerChildObserved:!scheduled
  };
  if(scheduled)return report('SCHEDULED_GTT_NO_EXCHANGE_CHILD_NOT_PROTECTED',
    ['GTT_SCHEDULED_NO_GENERATED_EXCHANGE_SELL_CHILD'],finalSummary);
  return report('STABLE_BROKER_CHILD_OBSERVATION_NOT_PROTECTIVE_ACK',
    ['BROKER_REPORTED_CHILD_NOT_AN_INDEPENDENT_EXCHANGE_STOP_ACK',
     'BROKER_GET_SNAPSHOTS_ARE_NOT_ATOMIC'],finalSummary);
}
