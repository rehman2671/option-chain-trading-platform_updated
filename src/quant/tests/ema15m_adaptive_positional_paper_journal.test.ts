import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyAdaptivePositionalPaperJournal,
  appendAdaptivePositionalPaperEvent,
  replayAdaptivePositionalPaperJournal,
  type PaperPositionalJournal,type PositionalPaperEvent,
  type PositionalPaperPolicy,type MockBrokerSnapshot
} from '../../server/engine/ema15m/adaptivePositionalPaperJournal.js';
import type { DeclaredTradingSession } from '../../server/engine/ema15m/adaptiveSessionIntegrity.js';

const iso=(d:number,m:number)=>new Date(Date.UTC(2026,10,d,4,m)).toISOString();
const asOf=iso(16,12);
const policy:PositionalPaperPolicy={
  maxSnapshotAgeMinutes:10,maxQuoteAgeMinutes:10,
  minDeclaredSessionsBeforeExpiry:2,
  maximumStressedLossINR:10000,overnightGapStressPercent:25,
  maxSimulatedFillDelaySeconds:60
};
const sessions:DeclaredTradingSession[]=[];
for(let d=16;d<=30;d++)sessions.push({
  sessionDate:'2026-11-'+String(d).padStart(2,'0'),
  openAt:new Date(Date.UTC(2026,10,d,3,45)).toISOString(),
  closeAt:new Date(Date.UTC(2026,10,d,10,0)).toISOString(),
  sourceRecordId:'SYNTHETIC_CALENDAR_'+d
});
const scope='SIMULATED_TEST_ACCOUNT_ONLY';
const instrument='NSE_FO|123456';
const open:PositionalPaperEvent={
  kind:'OPEN_PAPER_NRML',at:iso(16,0),
  positionId:'paper-pos-001',accountScopeId:scope,instrumentKey:instrument,
  expiry:'2026-11-30',lotSize:65,quantity:130,entryAsk:100,initialStop:80
};
function snap(at:string,quantity:number,overrides:Partial<MockBrokerSnapshot>={}):
 MockBrokerSnapshot{
  return{
    source:'SIMULATED_BROKER_FIXTURE',checkedAt:at,
    accountScopeId:scope,instrumentKey:instrument,productType:'NRML',
    accountView:'COMPLETE',netLongQuantity:quantity,netShortQuantity:0,
    protectionStatus:'ACTIVE_NATIVE_SELL',protectedQuantity:quantity,
    protectionOrderId:'SIMULATED-STOP-ID',stopTrigger:85,
    unresolvedOtherSellOrders:0,...overrides
  };
}
function bid(at:string,price=105,qty=130){
  return {observedAt:at,instrumentKey:instrument,
    bid:price,ask:price+1,bidQty:qty,askQty:qty};
}
function add(journal:PaperPositionalJournal,id:string,event:PositionalPaperEvent){
  return appendAdaptivePositionalPaperEvent(journal,id,event);
}
function journalBase():PaperPositionalJournal{
  return add(emptyAdaptivePositionalPaperJournal(),'open1',open);
}
function evidence():PaperPositionalJournal{
  let j=journalBase();
  j=add(j,'broker1',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,10),
    snapshot:snap(iso(16,10),130)});
  j=add(j,'l1',{kind:'OPTION_L1_OBSERVED',at:iso(16,11),
    quote:bid(iso(16,11))});
  return j;
}
const audit=(j:PaperPositionalJournal,t=asOf,p=policy,s=sessions)=>
  replayAdaptivePositionalPaperJournal(j,t,p,s);

describe('Adaptive Phase 9 offline NRML paper journal invariants',()=>{
  it('never treats PAPER OPEN as a broker confirmed or protected position',()=>{
    const r=audit(journalBase());
    assert.equal(r.status,'WAITING_FOR_RECONCILIATION');
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.brokerAuthenticated,false);
    assert.equal(r.brokerStopInstalled,false);
    assert.equal(r.orderInstruction,null);
    assert.equal(r.paperRemainingQuantity,130);
    assert.ok(r.reasons.includes('MOCK_BROKER_RECONCILIATION_MISSING_OR_STALE'));
  });
  it('holds only under a fresh matching complete SIMULATED snapshot and option L1',()=>{
    const r=audit(evidence());
    assert.equal(r.status,'RECONCILED_PAPER_HOLD');
    assert.equal(r.paperRemainingQuantity,130);
    assert.equal(r.lastSimulatedProtectionId,'SIMULATED-STOP-ID');
    assert.equal(r.lastObservedBid,105);
    assert.equal(r.recoveredAfterRestart,false);
    assert.equal(r.brokerAuthenticated,false);
    assert.equal(r.brokerStopInstalled,false);
  });
  it('requires a NEW mock reconciliation and bid observation after a restart',()=>{
    let j=evidence();
    j=add(j,'restart',{kind:'RECOVERY_STARTED',at:iso(16,12)});
    const blocked=audit(j,iso(16,13));
    assert.equal(blocked.status,'WAITING_FOR_RECONCILIATION');
    assert.equal(blocked.recoveredAfterRestart,false);
    j=add(j,'broker2',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,14),
      snapshot:snap(iso(16,14),130)});
    assert.equal(audit(j,iso(16,14)).status,'WAITING_FOR_RECONCILIATION');
    j=add(j,'l2',{kind:'OPTION_L1_OBSERVED',at:iso(16,15),
      quote:bid(iso(16,15),106)});
    const ready=audit(j,iso(16,16));
    assert.equal(ready.status,'RECONCILED_PAPER_HOLD');
    assert.equal(ready.recoveredAfterRestart,true);
    // A serialized journal must deterministically reconstruct the same state.
    assert.deepEqual(audit(JSON.parse(JSON.stringify(j)),iso(16,16)),ready);
  });
  it('blocks cancel-pending protection and any duplicate SELL order conflict',()=>{
    for(const override of [
      {protectionStatus:'CANCEL_PENDING' as const},
      {unresolvedOtherSellOrders:1}
    ]){
      let j=journalBase();
      j=add(j,'b',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,10),
        snapshot:snap(iso(16,10),130,override)});
      j=add(j,'q',{kind:'OPTION_L1_OBSERVED',at:iso(16,11),
        quote:bid(iso(16,11))});
      const r=audit(j);
      assert.equal(r.status,'BLOCKED_PROTECTION');
      assert.equal(r.executionAuthorized,false);
    }
  });
  it('fails closed on incomplete, cross-account and wrong-product simulated snapshots',()=>{
    for(const change of [
      {accountView:'PARTIAL' as const},
      {accountScopeId:'OTHER_ACCOUNT'},
      {productType:'MIS' as const},
      {source:'REAL_BROKER_CLAIM' as any}
    ]){
      let j=journalBase();
      j=add(j,'b',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,10),
        snapshot:snap(iso(16,10),130,change)});
      const r=audit(j);
      assert.equal(r.status,'INVALID_JOURNAL');
      assert.ok(r.errors.includes('INVALID_OR_UNTRUSTED_SIMULATED_BROKER_SNAPSHOT'));
    }
  });
  it('mismatch/stale broker quantity or option premium evidence cannot authorize hold',()=>{
    let j=journalBase();
    j=add(j,'b',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,10),
      snapshot:snap(iso(16,10),65)});
    j=add(j,'q',{kind:'OPTION_L1_OBSERVED',at:iso(16,11),
      quote:bid(iso(16,11))});
    assert.equal(audit(j).status,'WAITING_FOR_RECONCILIATION');
    assert.equal(audit(evidence(),iso(16,35)).status,'WAITING_FOR_RECONCILIATION');
  });
  it('flags overnight gap stress, observed stop breach and near-expiry without AUTO SELL',()=>{
    let j=journalBase();
    j=add(j,'b',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,10),
      snapshot:snap(iso(16,10),130)});
    j=add(j,'q',{kind:'OPTION_L1_OBSERVED',at:iso(16,11),
      quote:bid(iso(16,11),75)});
    let r=audit(j);
    assert.equal(r.status,'EXIT_REVIEW');
    assert.ok(r.reasons.includes('OBSERVED_BID_AT_OR_BELOW_SIMULATED_STOP_REVIEW_ONLY'));
    assert.equal(r.orderInstruction,null);
    const tight={...policy,maximumStressedLossINR:100};
    r=audit(evidence(),asOf,tight);
    assert.equal(r.status,'EXIT_REVIEW');
    assert.ok(r.reasons.includes('SIMULATED_OVERNIGHT_STRESSED_LOSS_LIMIT_EXCEEDED'));
    const next=iso(29,12);
    let k=journalBase();
    k=add(k,'b',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(29,10),
      snapshot:snap(iso(29,10),130)});
    k=add(k,'q',{kind:'OPTION_L1_OBSERVED',at:iso(29,11),
      quote:bid(iso(29,11))});
    const expiry=audit(k,next);
    assert.equal(expiry.status,'EXIT_REVIEW');
    assert.ok(expiry.reasons.includes('EXPIRY_TRADING_SESSIONS_NEAR_OR_PASSED'));
  });
  it('permits a separately declared paper exit request but not an imaginary fill',()=>{
    let j=evidence();
    j=add(j,'req',{kind:'OPERATOR_EXIT_REVIEW_REQUESTED',
      at:iso(16,13),requestId:'REVIEW-1',quantity:130,reason:'OPERATOR_TEST'});
    const r=audit(j,iso(16,14));
    assert.equal(r.status,'PAPER_EXIT_REVIEW_PENDING');
    assert.equal(r.openExitRequestQuantity,130);
    // Cannot fill against the pre-request 04:11 L1.
    j=add(j,'badFill',{kind:'SIMULATED_EXIT_FILL',at:iso(16,14),
      requestId:'REVIEW-1',quantity:65,
      quoteObservedAt:iso(16,11),bid:105});
    assert.equal(audit(j,iso(16,15)).status,'INVALID_JOURNAL');
  });
  it('handles partial fills with a new post-request L1 and broker re-reconciliation',()=>{
    let j=evidence();
    j=add(j,'req',{kind:'OPERATOR_EXIT_REVIEW_REQUESTED',
      at:iso(16,13),requestId:'REVIEW-1',quantity:130,reason:'MANUAL_EXIT_REVIEW'});
    j=add(j,'newQuote',{kind:'OPTION_L1_OBSERVED',at:iso(16,14),
      quote:bid(iso(16,14),103,130)});
    j=add(j,'fill1',{kind:'SIMULATED_EXIT_FILL',at:iso(16,14),
      requestId:'REVIEW-1',quantity:65,quoteObservedAt:iso(16,14),bid:103});
    // Old protection was for 130 contracts, so broker state is no longer reconciled.
    assert.equal(audit(j,iso(16,15)).status,'WAITING_FOR_RECONCILIATION');
    j=add(j,'rebalance',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,16),
      snapshot:snap(iso(16,16),65,{protectedQuantity:65})});
    j=add(j,'newBid2',{kind:'OPTION_L1_OBSERVED',at:iso(16,17),
      quote:bid(iso(16,17),102,65)});
    const partial=audit(j,iso(16,18));
    assert.equal(partial.status,'PAPER_PARTIAL_EXIT');
    assert.equal(partial.openExitRequestQuantity,65);
    assert.equal(partial.paperRemainingQuantity,65);
    j=add(j,'fill2',{kind:'SIMULATED_EXIT_FILL',at:iso(16,18),
      requestId:'REVIEW-1',quantity:65,quoteObservedAt:iso(16,17),bid:102});
    let closed=audit(j,iso(16,19));
    assert.equal(closed.status,'PAPER_CLOSED_PENDING_RECONCILIATION');
    // Paper close is NOT a native broker cancellation acknowledgement.
    j=add(j,'cleared',{kind:'MOCK_BROKER_SNAPSHOT',at:iso(16,20),
      snapshot:snap(iso(16,20),0,{protectionStatus:'CANCELLED',
        protectedQuantity:0,protectionOrderId:null,stopTrigger:null})});
    closed=audit(j,iso(16,21));
    assert.equal(closed.status,'PAPER_CLOSED_RECONCILED');
    assert.equal(closed.paperRemainingQuantity,0);
    assert.equal(closed.brokerStopInstalled,false);
  });
  it('never reuses a prior quote for a second partial SELL fill',()=>{
    let j=evidence();
    j=add(j,'req',{kind:'OPERATOR_EXIT_REVIEW_REQUESTED',
      at:iso(16,13),requestId:'X',quantity:130,reason:'TEST'});
    j=add(j,'q2',{kind:'OPTION_L1_OBSERVED',at:iso(16,14),
      quote:bid(iso(16,14),103,130)});
    j=add(j,'first',{kind:'SIMULATED_EXIT_FILL',at:iso(16,14),
      requestId:'X',quantity:65,quoteObservedAt:iso(16,14),bid:103});
    j=add(j,'second',{kind:'SIMULATED_EXIT_FILL',at:iso(16,15),
      requestId:'X',quantity:65,quoteObservedAt:iso(16,14),bid:103});
    const result=audit(j,iso(16,16));
    assert.equal(result.status,'INVALID_JOURNAL');
    assert.ok(result.errors.includes('SIMULATED_FILL_LACKS_POST_REQUEST_L1_OR_DEPTH'));
  });
  it('rejects journal mutation, out-of-order events and duplicate event IDs',()=>{
    let j=evidence();
    assert.throws(()=>add(j,'l1',{kind:'RECOVERY_STARTED',at:iso(16,12)}),
      /DUPLICATE_OFFLINE_PAPER_EVENT/);
    const changed=JSON.parse(JSON.stringify(j)) as PaperPositionalJournal;
    (changed.entries[1].event as any).snapshot.netLongQuantity=0;
    assert.equal(audit(changed).status,'INVALID_JOURNAL');
    assert.ok(audit(changed).errors.includes('JOURNAL_ORDER_HASH_CLOCK_OR_EVENT_ID_INVALID'));
    j=add(j,'past',{kind:'RECOVERY_STARTED',at:iso(16,1)});
    assert.equal(audit(j).status,'INVALID_JOURNAL');
  });
  it('is not exposed to old intraday 15:15 square-off and requires explicit calendar',()=>{
    const t='2026-11-16T09:50:00.000Z'; // 15:20 IST
    let j=journalBase();
    j=add(j,'b',{kind:'MOCK_BROKER_SNAPSHOT',at:'2026-11-16T09:48:00Z',
      snapshot:snap('2026-11-16T09:48:00Z',130)});
    j=add(j,'q',{kind:'OPTION_L1_OBSERVED',at:'2026-11-16T09:49:00Z',
      quote:bid('2026-11-16T09:49:00Z',105)});
    assert.equal(audit(j,t).status,'RECONCILED_PAPER_HOLD');
    assert.equal(audit(j,t,policy,[]).status,'WAITING_FOR_RECONCILIATION');
    assert.ok(audit(j,t,policy,[]).reasons.includes('EXCHANGE_SESSION_WINDOWS_REQUIRED'));
  });
});
