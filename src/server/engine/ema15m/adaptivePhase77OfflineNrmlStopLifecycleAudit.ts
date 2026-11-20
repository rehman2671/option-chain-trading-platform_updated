/**
 * Phase77 — pure, OFFLINE broker stop/GTT claim reconciliation.
 * This is operator-transcribed read-only evidence, NOT broker authentication.
 * No broker client, credentials, network calls, exchange API or order writes.
 * An exchange-ACK claim is not proof of actual protection or an exit fill.
 */
import {
  reviewPhase76NrmlPaperRisk,
  type Phase76PaperInput,
  type Phase76PaperReport
} from './adaptivePhase76NrmlPaperRiskMonitor.js';

export type Phase77OrderKind = 'SELL_STOP'|'SELL_GTT';
export type Phase77Transition =
  'SUBMITTED'|'BROKER_ACK'|'EXCHANGE_ACK'|'PARTIAL_FILL'|
  'EXCHANGE_FILLED'|'CANCEL_REQUESTED'|'EXCHANGE_CANCELLED'|
  'REJECTED'|'UNKNOWN_ACK'|'GTT_REGISTERED'|'GTT_TRIGGERED'|
  'GTT_CANCELLED';
export interface Phase77ClaimedEvent {
  sequence:number;
  eventId:string;
  orderId:string;
  at:string;
  kind:Phase77OrderKind;
  transition:Phase77Transition;
  accountScopeKey:string;
  instrumentKey:string;
  product:'NRML';
  direction:'SELL';
  /** Set only on initial SUBMITTED/GTT_REGISTERED event. */
  totalLots?:number;
  /** Set only for PARTIAL_FILL or EXCHANGE_FILLED. Cumulative, not delta. */
  cumulativeFilledLots?:number;
  /** Optional reference to already TRIGGERED GTT for SUBMITTED child. */
  parentGttOrderId?:string;
}
export interface Phase77OpenOrderClaim {
  orderId:string;
  kind:Phase77OrderKind;
  claimedState:'EXCHANGE_OPEN'|'BROKER_SUBMITTED'|'BROKER_ACCEPTED'|
    'CANCEL_PENDING'|'UNKNOWN_ACK'|'GTT_REGISTERED';
  remainingLots:number;
}
export interface Phase77PositionClaim {
  source:'OPERATOR_TRANSCRIBED_BROKER_READONLY_SNAPSHOT_NOT_ATTESTED';
  accountScopeKey:string;
  instrumentKey:string;
  product:'NRML';
  claimedAsOf:string;
  receivedAt:string;
  netLongLots:number;
  /** All outstanding SELL protection, GTT and pending orders from a
   * claimed CURRENT open-order snapshot, not merely a reconstructed ledger.
   * This operator-transcribed array cannot authenticate broker truth. */
  claimedOutstandingSellOrders:Phase77OpenOrderClaim[];
}
export interface Phase77Input {
  mode:'OFFLINE_NRML_STOP_LIFECYCLE_CLAIMS_V1';
  evaluationAt:string;
  /** Hypothetical baseline, not an assertion that the broker holds a trade. */
  paper:Phase76PaperInput;
  positionClaim:Phase77PositionClaim;
  maxSnapshotAgeSeconds:number;
  events:Phase77ClaimedEvent[];
}
export interface Phase77Report {
  mode:'OFFLINE_NRML_STOP_LIFECYCLE_CLAIMS_V1';
  status:'INVALID_EVIDENCE'|'RECONCILIATION_BLOCKED'|
    'DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY';
  reasonCodes:string[];
  paperStatus:Phase76PaperReport['status']|null;
  paperAlerts:string[];
  claimedLongLots:number|null;
  claimedSnapshotOpenSellOrders:number;
  claimedSellFilledLots:number;
  claimedOpenStopOrderCount:number;
  claimedOpenGttCount:number;
  claimedUncertainOrPendingOrderCount:number;
  claimedSingleStopRemainingLots:number|null;
  sourceAuthenticated:false;
  brokerSnapshotAuthenticated:false;
  exchangeStopAcknowledgementIndependentlyVerified:false;
  gttRegistrationNeverEqualsChildExchangeAcknowledgement:true;
  stopTriggerOrExchangeAckDoesNotGuaranteeExitFill:true;
  historicalL1OrActualOrderFillsVerified:false;
  overnightRiskUnresolved:true;
  restartSafeBrokerStateVerified:false;
  existingMis1515Unchanged:true;
  forced1515NrmlSquareOff:false;
  nrmlOrdersOrGttWritesEnabled:false;
  recommendedContractOrHorizon:null;
  nativeOrderInstruction:null;
  executionAuthorized:false;
  productionSafe:false;
}
const transitions = new Set<Phase77Transition>([
  'SUBMITTED','BROKER_ACK','EXCHANGE_ACK','PARTIAL_FILL','EXCHANGE_FILLED',
  'CANCEL_REQUESTED','EXCHANGE_CANCELLED','REJECTED','UNKNOWN_ACK',
  'GTT_REGISTERED','GTT_TRIGGERED','GTT_CANCELLED'
]);
const time = (value:unknown):number|null=> {
  if(typeof value!=='string'||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value))
    return null;
  const t=Date.parse(value);
  return Number.isFinite(t)?t:null;
};
const uint=(value:unknown,max=100000):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
const id=(value:unknown):value is string=>
  typeof value==='string'&&value.length>=1&&value.length<=180&&
  /^[a-zA-Z0-9_:./-]+$/.test(value);
/** Only canonical FO instrument tokens may contain '|'. Order/account
 * identifiers retain the original strict no-pipe character grammar. */
const instrumentId=(value:unknown):value is string=>id(value)||
  (typeof value==='string'&&value.length<=180&&
    /^(?:NSE_FO|BSE_FO)\\|[a-zA-Z0-9_:./-]{1,150}$/.test(value));
interface OrderState {
  kind:Phase77OrderKind;
  state:Phase77Transition;
  totalLots:number;
  filledLots:number;
}
function initial(reason:string):Phase77Report {
  return {
    mode:'OFFLINE_NRML_STOP_LIFECYCLE_CLAIMS_V1',
    status:'INVALID_EVIDENCE',reasonCodes:[reason],paperStatus:null,
    paperAlerts:[],claimedLongLots:null,claimedSnapshotOpenSellOrders:0,claimedSellFilledLots:0,
    claimedOpenStopOrderCount:0,claimedOpenGttCount:0,
    claimedUncertainOrPendingOrderCount:0,
    claimedSingleStopRemainingLots:null,
    sourceAuthenticated:false,brokerSnapshotAuthenticated:false,
    exchangeStopAcknowledgementIndependentlyVerified:false,
    gttRegistrationNeverEqualsChildExchangeAcknowledgement:true,
    stopTriggerOrExchangeAckDoesNotGuaranteeExitFill:true,
    historicalL1OrActualOrderFillsVerified:false,overnightRiskUnresolved:true,
    restartSafeBrokerStateVerified:false,existingMis1515Unchanged:true,
    forced1515NrmlSquareOff:false,nrmlOrdersOrGttWritesEnabled:false,
    recommendedContractOrHorizon:null,nativeOrderInstruction:null,
    executionAuthorized:false,productionSafe:false
  };
}
function invalid(reason:string):Phase77Report{return initial(reason);}
/** Deterministic replay of manually asserted state. Never an execution permission. */
export function auditPhase77OfflineNrmlStopLifecycle(input:Phase77Input):Phase77Report {
  if(!input||input.mode!=='OFFLINE_NRML_STOP_LIFECYCLE_CLAIMS_V1'||
     !input.paper||!input.positionClaim||!Array.isArray(input.events)||
     input.events.length>2000||!uint(input.maxSnapshotAgeSeconds,86400)||
     input.maxSnapshotAgeSeconds<1)
    return invalid('INVALID_OFFLINE_LIFECYCLE_ENVELOPE');
  const now=time(input.evaluationAt),claim=input.positionClaim;
  const asOf=time(claim.claimedAsOf),received=time(claim.receivedAt);
  if(now===null||asOf===null||received===null||asOf>received||
     received>now||claim.source!==
      'OPERATOR_TRANSCRIBED_BROKER_READONLY_SNAPSHOT_NOT_ATTESTED'||
     claim.product!=='NRML'||!instrumentId(claim.instrumentKey)||
     !id(claim.accountScopeKey)||!uint(claim.netLongLots,10000)||
     !Array.isArray(claim.claimedOutstandingSellOrders)||
     claim.claimedOutstandingSellOrders.length>2000)
    return invalid('INVALID_OPERATOR_CLAIMED_POSITION_SNAPSHOT');
  const paper=reviewPhase76NrmlPaperRisk(input.paper);
  if(paper.status==='INVALID_INPUT')
    return invalid('UPSTREAM_PHASE76_PAPER_REVIEW_INVALID');
  if(input.paper.evaluationAt!==input.evaluationAt||
     claim.instrumentKey!==input.paper.position.instrumentKey)
    return invalid('PAPER_AND_BROKER_CLAIM_SCOPE_OR_CLOCK_MISMATCH');
  const orders=new Map<string,OrderState>(),eventIds=new Set<string>();
  let prev=-Infinity;
  for(let i=0;i<input.events.length;i++){
    const e=input.events[i],t=e&&time(e.at);
    if(!e||t===null||t<prev||t>asOf||
       !uint(e.sequence,2000)||e.sequence!==i+1||
       !id(e.eventId)||eventIds.has(e.eventId)||!id(e.orderId)||
       !transitions.has(e.transition)||
       (e.kind!=='SELL_STOP'&&e.kind!=='SELL_GTT')||
       e.accountScopeKey!==claim.accountScopeKey||
       e.instrumentKey!==claim.instrumentKey||
       e.product!=='NRML'||e.direction!=='SELL')
      return invalid('INVALID_OR_OUT_OF_SCOPE_BROKER_EVENT_LEDGER');
    eventIds.add(e.eventId);prev=t;
    const isNew=e.transition==='SUBMITTED'||e.transition==='GTT_REGISTERED';
    if(isNew){
      if(orders.has(e.orderId)||
        (e.kind==='SELL_STOP')!==(e.transition==='SUBMITTED')||
        !uint(e.totalLots,10000)||e.totalLots===0||
        e.cumulativeFilledLots!==undefined||
        (e.parentGttOrderId!==undefined&&!id(e.parentGttOrderId)))
        return invalid('DUPLICATED_OR_MALFORMED_ORDER_CREATION');
      if(e.parentGttOrderId!==undefined){
        const parent=orders.get(e.parentGttOrderId);
        if(e.kind!=='SELL_STOP'||!parent||
           parent.kind!=='SELL_GTT'||parent.state!=='GTT_TRIGGERED'||
           e.totalLots>parent.totalLots)
          return invalid('UNLINKED_GTT_TRIGGERED_CHILD_CLAIM');
      }
      orders.set(e.orderId,{kind:e.kind,state:e.transition,
        totalLots:e.totalLots,filledLots:0});
      continue;
    }
    if(e.totalLots!==undefined||e.parentGttOrderId!==undefined)
      return invalid('MUTATED_ORDER_QUANTITY_OR_PARENT');
    const o=orders.get(e.orderId);
    if(!o||o.kind!==e.kind)
      return invalid('UNKNOWN_ORDER_OR_CONTRADICTORY_KIND');
    if(e.kind==='SELL_GTT'){
      if(e.cumulativeFilledLots!==undefined||
        o.state!=='GTT_REGISTERED'||
        !['GTT_TRIGGERED','GTT_CANCELLED','UNKNOWN_ACK'].includes(e.transition))
        return invalid('INVALID_GTT_TRANSITION');
      o.state=e.transition;
      continue;
    }
    const state=o.state,done=['EXCHANGE_FILLED','EXCHANGE_CANCELLED',
      'REJECTED','UNKNOWN_ACK'];
    if(done.includes(state)||
       !['BROKER_ACK','EXCHANGE_ACK','PARTIAL_FILL','EXCHANGE_FILLED',
         'CANCEL_REQUESTED','EXCHANGE_CANCELLED','REJECTED','UNKNOWN_ACK']
         .includes(e.transition))
      return invalid('INVALID_TERMINAL_OR_UNRECOGNIZED_STOP_TRANSITION');
    if(e.transition==='BROKER_ACK'){
      if(e.cumulativeFilledLots!==undefined)
        return invalid('FILL_QUANTITY_ATTACHED_TO_NONFILL_TRANSITION');
      if(state!=='SUBMITTED')return invalid('STOP_BROKER_ACK_OUT_OF_ORDER');
    }else if(e.transition==='EXCHANGE_ACK'){
      if(e.cumulativeFilledLots!==undefined)
        return invalid('FILL_QUANTITY_ATTACHED_TO_NONFILL_TRANSITION');
      if(state!=='BROKER_ACK')return invalid('STOP_EXCHANGE_ACK_OUT_OF_ORDER');
    }else if(e.transition==='PARTIAL_FILL'||e.transition==='EXCHANGE_FILLED'){
      if(!['EXCHANGE_ACK','PARTIAL_FILL'].includes(state)||
         !uint(e.cumulativeFilledLots,o.totalLots)||
         e.cumulativeFilledLots<=o.filledLots||
         (e.transition==='PARTIAL_FILL'&&
           e.cumulativeFilledLots===o.totalLots)||
         (e.transition==='EXCHANGE_FILLED'&&
           e.cumulativeFilledLots!==o.totalLots))
        return invalid('INVALID_CUMULATIVE_BROKER_FILL_CLAIM');
      o.filledLots=e.cumulativeFilledLots;
    }else{
      if(e.cumulativeFilledLots!==undefined)
        return invalid('FILL_QUANTITY_ATTACHED_TO_NONFILL_TRANSITION');
      if(e.transition==='CANCEL_REQUESTED'&&
         !['EXCHANGE_ACK','PARTIAL_FILL'].includes(state))
        return invalid('CANCEL_NOT_REQUESTED_FROM_OPEN_EXCHANGE_ORDER');
      if(e.transition==='EXCHANGE_CANCELLED'&&state!=='CANCEL_REQUESTED')
        return invalid('CANCEL_ACK_MISSING_OR_UNORDERED');
      if(e.transition==='REJECTED'&&
         !['SUBMITTED','BROKER_ACK','EXCHANGE_ACK','CANCEL_REQUESTED'].includes(state))
        return invalid('REJECTED_STOP_STATE_CONTRADICTORY');
    }
    o.state=e.transition;
  }
  // Reject a fabricated ACK ledger if CURRENT separately transcribed
  // outstanding-order view omits/contradicts the supposedly live child.
  // This does not establish that either read-only claim is broker-authentic.
  const expectedOpen=new Map<string,{kind:Phase77OrderKind;
    claimedState:Phase77OpenOrderClaim['claimedState'];remainingLots:number}>();
  for(const [orderId,o] of orders){
    const claimedState:Phase77OpenOrderClaim['claimedState']|null=
      o.state==='EXCHANGE_ACK'||o.state==='PARTIAL_FILL'?'EXCHANGE_OPEN':
      o.state==='SUBMITTED'?'BROKER_SUBMITTED':
      o.state==='BROKER_ACK'?'BROKER_ACCEPTED':
      o.state==='CANCEL_REQUESTED'?'CANCEL_PENDING':
      o.state==='UNKNOWN_ACK'?'UNKNOWN_ACK':
      o.state==='GTT_REGISTERED'?'GTT_REGISTERED':null;
    if(claimedState)expectedOpen.set(orderId,{kind:o.kind,claimedState,
      remainingLots:o.totalLots-o.filledLots});
  }
  const snapshotOpen=new Map<string,Phase77OpenOrderClaim>();
  for(const open of claim.claimedOutstandingSellOrders){
    if(!open||!id(open.orderId)||snapshotOpen.has(open.orderId)||
       !['SELL_STOP','SELL_GTT'].includes(open.kind)||
       !['EXCHANGE_OPEN','BROKER_SUBMITTED','BROKER_ACCEPTED',
         'CANCEL_PENDING','UNKNOWN_ACK','GTT_REGISTERED'].includes(open.claimedState)||
       !uint(open.remainingLots,10000)||open.remainingLots===0)
      return invalid('INVALID_OPERATOR_OPEN_SELL_ORDER_SNAPSHOT');
    snapshotOpen.set(open.orderId,open);
  }
  const contradictoryOpen=expectedOpen.size!==snapshotOpen.size||
    [...expectedOpen].some(([orderId,o])=>{
      const snapshot=snapshotOpen.get(orderId);
      return !snapshot||snapshot.kind!==o.kind||
        snapshot.claimedState!==o.claimedState||
        snapshot.remainingLots!==o.remainingLots;
    });
  const states=[...orders.values()];
  const stops=states.filter(o=>o.kind==='SELL_STOP'&&
    ['EXCHANGE_ACK','PARTIAL_FILL'].includes(o.state));
  const gtts=states.filter(o=>o.kind==='SELL_GTT'&&o.state==='GTT_REGISTERED');
  const uncertain=states.filter(o=>
    ['SUBMITTED','BROKER_ACK','CANCEL_REQUESTED','UNKNOWN_ACK'].includes(o.state));
  const sold=states.filter(o=>o.kind==='SELL_STOP')
    .reduce((sum,o)=>sum+o.filledLots,0);
  const remaining=stops.length===1?
    stops[0].totalLots-stops[0].filledLots:null;
  const reasons:string[]=[];
  if(contradictoryOpen)
    reasons.push('OPEN_SELL_ORDER_SNAPSHOT_CONTRADICTS_REPLAYED_LEDGER');
  if(now-asOf>input.maxSnapshotAgeSeconds*1000||
     received-asOf>input.maxSnapshotAgeSeconds*1000)
    reasons.push('STALE_OPERATOR_BROKER_SNAPSHOT');
  if(claim.netLongLots+sold!==input.paper.position.lots)
    reasons.push('NET_POSITION_NOT_RECONCILED_TO_CUMULATIVE_SELL_FILLS');
  if(stops.length!==1||remaining!==claim.netLongLots||
     claim.netLongLots===0)
    reasons.push('EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
  if(gtts.length>0)
    reasons.push('ACTIVE_GTT_NOT_EXCHANGE_ACKED_STOP_OR_DUPLICATE_SELL_RISK');
  if(uncertain.length>0)
    reasons.push('UNKNOWN_BROKER_ACK_PENDING_CANCEL_OR_UNACKED_SELL');
  if(paper.status==='PAPER_REVIEW_REQUIRED')
    reasons.push('UPSTREAM_PAPER_RISK_ALERTS_REQUIRE_MANUAL_REVIEW');
  const ok=reasons.length===0;
  return {
    ...initial(''),
    status:ok?'DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY':
      'RECONCILIATION_BLOCKED',
    reasonCodes:ok?[
      'ONLY_INTERNAL_OPERATOR_TRANSCRIBED_ORDER_CLAIMS_RECONCILED',
      'INDEPENDENT_BROKER_EXCHANGE_STOP_ACK_AND_FILLED_EXIT_UNVERIFIED',
      'NO_OVER_NIGHT_NATIVE_STOP_PROTECTION_OR_LIVE_RELEASE_PROVEN'
    ]:reasons,
    paperStatus:paper.status,paperAlerts:paper.alerts,
    claimedLongLots:claim.netLongLots,
    claimedSnapshotOpenSellOrders:snapshotOpen.size,claimedSellFilledLots:sold,
    claimedOpenStopOrderCount:stops.length,
    claimedOpenGttCount:gtts.length,
    claimedUncertainOrPendingOrderCount:uncertain.length,
    claimedSingleStopRemainingLots:remaining
  };
}
