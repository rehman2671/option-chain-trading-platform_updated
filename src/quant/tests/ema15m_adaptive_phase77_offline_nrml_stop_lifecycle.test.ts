import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase77OfflineNrmlStopLifecycle,
  type Phase77ClaimedEvent,type Phase77Input,type Phase77Report,
  type Phase77Transition,type Phase77OrderKind
} from '../../server/engine/ema15m/adaptivePhase77OfflineNrmlStopLifecycleAudit.js';

const t=(hour:number,minute:number,sec=0)=>
  `2026-11-20T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(sec).padStart(2,'0')}+05:30`;
const account='OPERATOR_ACCOUNT_ALIAS';
const instrument='HYPOTHETICAL_1W_CE';
function event(
  sequence:number,transition:Phase77Transition,orderId='STOP-1',
  kind:Phase77OrderKind='SELL_STOP',minute=sequence,
  extra:Partial<Phase77ClaimedEvent>={}
):Phase77ClaimedEvent {
  return {sequence,eventId:`EVENT-${sequence}`,orderId,
    at:t(10,minute),kind,transition,accountScopeKey:account,
    instrumentKey:instrument,product:'NRML',direction:'SELL',...extra};
}
function setup():Phase77Input {
  return {
    mode:'OFFLINE_NRML_STOP_LIFECYCLE_CLAIMS_V1',evaluationAt:t(11,4),
    paper:{mode:'OFFLINE_NRML_PAPER_RISK_REVIEW_V1',evaluationAt:t(11,4),
      position:{source:'HYPOTHETICAL_LONG_OPTION_NOT_BROKER_POSITION',
        instrumentKey:instrument,horizon:'1W',optionType:'CE',
        enteredAt:t(10,0),assumedExchangeExpiryDateIST:'2026-11-27',
        lotSize:50,lots:1,assumedEntryAskPremiumPoints:100,
        assumedNonRecoverableFeesINR:50},
      policy:{source:'PREREGISTERED_PAPER_ALERT_POLICY_NOT_EXECUTABLE_STOP',
        armGainPremiumPoints:50,givebackAlertPremiumPoints:20,
        targetAlertPremiumPoints:100,minimumConfirmGapSeconds:60,
        minimumBidDepthLotsForIndicativeMark:1,
        maximumQuoteAgeSeconds:300,maximumPaidDebitPlusFeesINR:100000,
        maximumIndicativeLossINR:100000,expiryReviewCalendarDays:2},
      quotes:[{source:'MANUAL_OR_SYNTHETIC_PAPER_MARK_NOT_VERIFIED_L1',
        observedAt:t(11,4),receivedAt:t(11,4),
        bestBidPremiumPoints:120,displayedBestBidDepthLots:2}]},
    positionClaim:{
      source:'OPERATOR_TRANSCRIBED_BROKER_READONLY_SNAPSHOT_NOT_ATTESTED',
      accountScopeKey:account,instrumentKey:instrument,product:'NRML',
      claimedAsOf:t(11,3),receivedAt:t(11,3),netLongLots:1,
      claimedOutstandingSellOrders:[{orderId:'STOP-1',kind:'SELL_STOP',
        claimedState:'EXCHANGE_OPEN',remainingLots:1}]},
    maxSnapshotAgeSeconds:300,
    events:[event(1,'SUBMITTED','STOP-1','SELL_STOP',1,{totalLots:1}),
      event(2,'BROKER_ACK'),event(3,'EXCHANGE_ACK')]
  };
}
const run=(f:Phase77Input)=>auditPhase77OfflineNrmlStopLifecycle(f);
function neverLive(r:Phase77Report){
  assert.equal(r.sourceAuthenticated,false);
  assert.equal(r.brokerSnapshotAuthenticated,false);
  assert.equal(r.exchangeStopAcknowledgementIndependentlyVerified,false);
  assert.equal(r.gttRegistrationNeverEqualsChildExchangeAcknowledgement,true);
  assert.equal(r.stopTriggerOrExchangeAckDoesNotGuaranteeExitFill,true);
  assert.equal(r.historicalL1OrActualOrderFillsVerified,false);
  assert.equal(r.overnightRiskUnresolved,true);
  assert.equal(r.restartSafeBrokerStateVerified,false);
  assert.equal(r.existingMis1515Unchanged,true);
  assert.equal(r.forced1515NrmlSquareOff,false);
  assert.equal(r.nrmlOrdersOrGttWritesEnabled,false);
  assert.equal(r.recommendedContractOrHorizon,null);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.ok(!JSON.stringify(r).includes(account));
  assert.ok(!JSON.stringify(r).includes(instrument));
}
function blocked(f:Phase77Input,code:string){
  const r=run(f);neverLive(r);
  assert.equal(r.status,'RECONCILIATION_BLOCKED',JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(code),JSON.stringify(r));
  return r;
}
function invalid(f:Phase77Input,code:string){
  const r=run(f);neverLive(r);
  assert.equal(r.status,'INVALID_EVIDENCE',JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(code),JSON.stringify(r));
  return r;
}
describe('Phase77 offline claimed broker NRML stop/GTT lifecycle adversarial reconciliation',()=>{
  it('a claimed accepted stop plus matched net position is ONLY internally consistent, never authenticated or executable',()=>{
    const r=run(setup());neverLive(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY');
    assert.equal(r.claimedSingleStopRemainingLots,1);
    assert.equal(r.claimedOpenStopOrderCount,1);
    assert.equal(r.paperStatus,'PAPER_MONITOR_ONLY');
  });
  it('GTT registered without a child is NOT an accepted exchange SELL stop',()=>{
    const f=setup();f.events=[event(1,'GTT_REGISTERED','GTT-1','SELL_GTT',1,{totalLots:1})];
    f.positionClaim.claimedOutstandingSellOrders=[{orderId:'GTT-1',kind:'SELL_GTT',claimedState:'GTT_REGISTERED',remainingLots:1}];
    const r=blocked(f,'EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
    assert.equal(r.claimedOpenGttCount,1);
  });
  it('triggered GTT with missing child exchange acknowledgment is NOT protection',()=>{
    const f=setup();f.events=[event(1,'GTT_REGISTERED','GTT-1','SELL_GTT',1,{totalLots:1}),
      event(2,'GTT_TRIGGERED','GTT-1','SELL_GTT')];
    f.positionClaim.claimedOutstandingSellOrders=[];
    blocked(f,'EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
  });
  it('broker ACK alone never counts as exchange-accepted stop',()=>{
    const f=setup();f.events.pop();
    f.positionClaim.claimedOutstandingSellOrders[0].claimedState='BROKER_ACCEPTED';
    const r=blocked(f,'UNKNOWN_BROKER_ACK_PENDING_CANCEL_OR_UNACKED_SELL');
    assert.equal(r.claimedSingleStopRemainingLots,null);
  });
  it('unacknowledged submitted order is not a protective stop',()=>{
    const f=setup();f.events.splice(1);
    f.positionClaim.claimedOutstandingSellOrders[0].claimedState='BROKER_SUBMITTED';
    blocked(f,'UNKNOWN_BROKER_ACK_PENDING_CANCEL_OR_UNACKED_SELL');
  });
  it('EXCHANGE_ACK before BROKER_ACK is invalid causal order',()=>{
    const f=setup();f.events.splice(1,1);
    f.events[1].sequence=2;f.events[1].eventId='EVENT-2';
    invalid(f,'STOP_EXCHANGE_ACK_OUT_OF_ORDER');
  });
  it('cancel pending is unprotected even before cancellation acknowledged',()=>{
    const f=setup();f.events.push(event(4,'CANCEL_REQUESTED'));
    f.positionClaim.claimedOutstandingSellOrders[0].claimedState='CANCEL_PENDING';
    const r=blocked(f,'UNKNOWN_BROKER_ACK_PENDING_CANCEL_OR_UNACKED_SELL');
    assert.equal(r.claimedOpenStopOrderCount,0);
  });
  it('cancel ACK cannot masquerade as an active overnight stop',()=>{
    const f=setup();f.events.push(event(4,'CANCEL_REQUESTED'),event(5,'EXCHANGE_CANCELLED'));
    f.positionClaim.claimedOutstandingSellOrders=[];
    blocked(f,'EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
  });
  it('rejected stop cannot be counted as protection',()=>{
    const f=setup();f.events.push(event(4,'REJECTED'));
    f.positionClaim.claimedOutstandingSellOrders=[];
    blocked(f,'EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
  });
  it('UNKNOWN_ACK fails closed and is never cleared by guessing exchange state',()=>{
    const f=setup();f.events.push(event(4,'UNKNOWN_ACK'));
    f.positionClaim.claimedOutstandingSellOrders[0].claimedState='UNKNOWN_ACK';
    blocked(f,'UNKNOWN_BROKER_ACK_PENDING_CANCEL_OR_UNACKED_SELL');
    f.events.push(event(5,'EXCHANGE_ACK'));
    invalid(f,'INVALID_TERMINAL_OR_UNRECOGNIZED_STOP_TRANSITION');
  });
  it('two concurrently accepted stops on one position cause duplicate SELL risk',()=>{
    const f=setup();f.events.push(
      event(4,'SUBMITTED','STOP-2','SELL_STOP',4,{totalLots:1}),
      event(5,'BROKER_ACK','STOP-2'),event(6,'EXCHANGE_ACK','STOP-2'));
    f.positionClaim.claimedOutstandingSellOrders.push({orderId:'STOP-2',kind:'SELL_STOP',claimedState:'EXCHANGE_OPEN',remainingLots:1});
    const r=blocked(f,'EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
    assert.equal(r.claimedOpenStopOrderCount,2);
  });
  it('an active GTT plus an exchange stop is ambiguous duplicate SELL exposure',()=>{
    const f=setup();f.events.push(event(4,'GTT_REGISTERED','GTT-2','SELL_GTT',4,{totalLots:1}));
    f.positionClaim.claimedOutstandingSellOrders.push({orderId:'GTT-2',kind:'SELL_GTT',claimedState:'GTT_REGISTERED',remainingLots:1});
    blocked(f,'ACTIVE_GTT_NOT_EXCHANGE_ACKED_STOP_OR_DUPLICATE_SELL_RISK');
  });
  it('wrong account, instrument or product cannot enter same reconciliation scope',()=>{
    for(const update of [{accountScopeKey:'WRONG-ACCOUNT'},
      {instrumentKey:'OTHER-STRIKE'},
      {product:'MIS' as 'NRML'}]){
      const f=setup();Object.assign(f.events[1],update);
      invalid(f,'INVALID_OR_OUT_OF_SCOPE_BROKER_EVENT_LEDGER');
    }
  });
  it('BUY protection is rejected, positional long-exit claim must be SELL NRML',()=>{
    const f=setup();(f.events[1] as {direction:string}).direction='BUY';
    invalid(f,'INVALID_OR_OUT_OF_SCOPE_BROKER_EVENT_LEDGER');
  });
  it('same event ID cannot be replayed or double-counted',()=>{
    const f=setup();f.events[2].eventId=f.events[1].eventId;
    invalid(f,'INVALID_OR_OUT_OF_SCOPE_BROKER_EVENT_LEDGER');
  });
  it('sequence gap, backward clock or event after snapshot fails closed',()=>{
    const a=setup();a.events[1].sequence=5;
    invalid(a,'INVALID_OR_OUT_OF_SCOPE_BROKER_EVENT_LEDGER');
    const b=setup();b.events[2].at=t(10,0);
    invalid(b,'INVALID_OR_OUT_OF_SCOPE_BROKER_EVENT_LEDGER');
    const c=setup();c.events[2].at=t(11,4);
    invalid(c,'INVALID_OR_OUT_OF_SCOPE_BROKER_EVENT_LEDGER');
  });
  it('stale broker position claim blocks even when a nominal stop appears accepted',()=>{
    const f=setup();f.positionClaim.claimedAsOf=t(10,3);
    f.positionClaim.receivedAt=t(10,3);
    blocked(f,'STALE_OPERATOR_BROKER_SNAPSHOT');
  });
  it('claimed protective stop has to cover EXACT current net long lots',()=>{
    const f=setup();f.events[0].totalLots=2;
    f.positionClaim.claimedOutstandingSellOrders[0].remainingLots=2;
    blocked(f,'EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
    f.events[0].totalLots=1;f.positionClaim.netLongLots=2;
    f.positionClaim.claimedOutstandingSellOrders[0].remainingLots=1;
    blocked(f,'NET_POSITION_NOT_RECONCILED_TO_CUMULATIVE_SELL_FILLS');
  });
  it('partial fill can be internally reconciled only with matching reduced net position and remaining stop',()=>{
    const f=setup();f.paper.position.lots=3;f.positionClaim.netLongLots=2;
    f.events[0].totalLots=3;
    f.positionClaim.claimedOutstandingSellOrders[0].remainingLots=2;
    f.events.push(event(4,'PARTIAL_FILL','STOP-1','SELL_STOP',4,{cumulativeFilledLots:1}));
    const r=run(f);neverLive(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY');
    assert.equal(r.claimedSellFilledLots,1);
    assert.equal(r.claimedSingleStopRemainingLots,2);
    f.positionClaim.netLongLots=3;
    blocked(f,'NET_POSITION_NOT_RECONCILED_TO_CUMULATIVE_SELL_FILLS');
  });
  it('filled quantity cannot exceed order size or be reduced by replay',()=>{
    const f=setup();f.events.push(event(4,'PARTIAL_FILL','STOP-1','SELL_STOP',4,{cumulativeFilledLots:2}));
    invalid(f,'INVALID_CUMULATIVE_BROKER_FILL_CLAIM');
    const g=setup();g.events[0].totalLots=3;
    g.events.push(event(4,'PARTIAL_FILL','STOP-1','SELL_STOP',4,{cumulativeFilledLots:2}),
      event(5,'PARTIAL_FILL','STOP-1','SELL_STOP',5,{cumulativeFilledLots:1}));
    invalid(g,'INVALID_CUMULATIVE_BROKER_FILL_CLAIM');
  });
  it('fully filled order with flat net position does not remain a live stop',()=>{
    const f=setup();f.positionClaim.netLongLots=0;
    f.positionClaim.claimedOutstandingSellOrders=[];
    f.events.push(event(4,'EXCHANGE_FILLED','STOP-1','SELL_STOP',4,{cumulativeFilledLots:1}));
    const r=blocked(f,'EXACTLY_ONE_CLAIMED_ACKED_STOP_WITH_MATCHING_LEAVES_MISSING');
    assert.equal(r.claimedSellFilledLots,1);
    assert.equal(r.claimedOpenStopOrderCount,0);
  });
  it('GTT child can only reference previously TRIGGERED GTT, not registration alone',()=>{
    const f=setup();f.events=[event(1,'GTT_REGISTERED','GTT-1','SELL_GTT',1,{totalLots:1}),
      event(2,'SUBMITTED','CHILD','SELL_STOP',2,{totalLots:1,parentGttOrderId:'GTT-1'})];
    invalid(f,'UNLINKED_GTT_TRIGGERED_CHILD_CLAIM');
  });
  it('triggered GTT followed by broker and exchange ACK of explicit child stays descriptive only',()=>{
    const f=setup();f.events=[event(1,'GTT_REGISTERED','GTT-1','SELL_GTT',1,{totalLots:1}),
      event(2,'GTT_TRIGGERED','GTT-1','SELL_GTT',2),
      event(3,'SUBMITTED','CHILD','SELL_STOP',3,{totalLots:1,parentGttOrderId:'GTT-1'}),
      event(4,'BROKER_ACK','CHILD'),event(5,'EXCHANGE_ACK','CHILD')];
    f.positionClaim.claimedOutstandingSellOrders=[{orderId:'CHILD',kind:'SELL_STOP',claimedState:'EXCHANGE_OPEN',remainingLots:1}];
    const r=run(f);neverLive(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY');
  });
  it('missing latest open-order snapshot cannot claim current overnight stop protection',()=>{
    const f=setup();f.positionClaim.claimedOutstandingSellOrders=[];
    blocked(f,'OPEN_SELL_ORDER_SNAPSHOT_CONTRADICTS_REPLAYED_LEDGER');
  });
  it('open-order snapshot wrong order ID or remaining qty fails independently of ACK history',()=>{
    const f=setup();f.positionClaim.claimedOutstandingSellOrders[0].orderId='OTHER-STOP';
    blocked(f,'OPEN_SELL_ORDER_SNAPSHOT_CONTRADICTS_REPLAYED_LEDGER');
    const g=setup();g.positionClaim.claimedOutstandingSellOrders[0].remainingLots=2;
    blocked(g,'OPEN_SELL_ORDER_SNAPSHOT_CONTRADICTS_REPLAYED_LEDGER');
  });
  it('duplicate or malformed current open order snapshot cannot be treated as fresh corroboration',()=>{
    const f=setup();f.positionClaim.claimedOutstandingSellOrders.push(
      {...f.positionClaim.claimedOutstandingSellOrders[0]});
    invalid(f,'INVALID_OPERATOR_OPEN_SELL_ORDER_SNAPSHOT');
  });
  it('reject cumulative fills attached to non-fill broker/exchange ACK transitions',()=>{
    const f=setup();f.events[1].cumulativeFilledLots=1;
    invalid(f,'FILL_QUANTITY_ATTACHED_TO_NONFILL_TRANSITION');
    const g=setup();g.events[2].cumulativeFilledLots=1;
    invalid(g,'FILL_QUANTITY_ATTACHED_TO_NONFILL_TRANSITION');
  });
  it('missing paper quote is still an independent risk review blocker',()=>{
    const f=setup();f.paper.quotes=[];
    const r=blocked(f,'UPSTREAM_PAPER_RISK_ALERTS_REQUIRE_MANUAL_REVIEW');
    assert.ok(r.paperAlerts.includes('STALE_OR_MISSING_QUOTE_REVIEW'));
  });
  it('paper-to-broker instrument mismatch and paper-invalid modes fail closed',()=>{
    const f=setup();f.paper.position.instrumentKey='INVENTED_DIFFERENT_OPTION';
    invalid(f,'PAPER_AND_BROKER_CLAIM_SCOPE_OR_CLOCK_MISMATCH');
    const g=setup();(g.paper.position as {source:string}).source='LIVE_BROKER_FILL';
    invalid(g,'UPSTREAM_PHASE76_PAPER_REVIEW_INVALID');
  });
  it('operator snapshots and full ledger replay deterministically; no automatic 15:15 NRML exit',()=>{
    const f=setup();f.evaluationAt=t(15,15);f.paper.evaluationAt=t(15,15);
    f.paper.quotes[0].observedAt=t(15,15);
    f.paper.quotes[0].receivedAt=t(15,15);
    f.positionClaim.claimedAsOf=t(15,14);f.positionClaim.receivedAt=t(15,14);
    const a=run(f),b=run(structuredClone(f));neverLive(a);
    assert.deepEqual(a,b);
    assert.equal(a.status,'DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY');
    assert.equal(a.forced1515NrmlSquareOff,false);
  });
  it('a claimed broker snapshot is never authenticated by copied marker or optimistic status',()=>{
    const f=setup();(f.positionClaim as {source:string}).source='BROKER_AUTHENTICATED';
    invalid(f,'INVALID_OPERATOR_CLAIMED_POSITION_SNAPSHOT');
    const g=setup();(g as {mode:string}).mode='LIVE_STOP_EXECUTION';
    invalid(g,'INVALID_OFFLINE_LIFECYCLE_ENVELOPE');
  });
});
