import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {assessBrokerRemainingSellQuantity} from
  '../../server/engine/ema15m/adaptiveLiveSellQuantityGuard.js';
import {auditNrmlRestartQuarantine,reviewNrmlRestartReadOnly,
  type RestartReadOnlyInputs} from
  '../../server/engine/ema15m/adaptiveNrmlRestartQuarantine.js';
import {emaBrokerOrderTag} from
  '../../server/engine/ema15m/brokerOrderEvidence.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const account='PH95-DURABLE-ACCOUNT',inst='NSE_FO|PH95-LONG-CE',id='PH95-POS-1';
const journal=(patch:Record<string,unknown>={})=>({
  id,brokerAccountId:account,brokerInstrumentKey:inst,
  productType:'NRML',status:'OPEN',quantity:100,lotSize:50,
  exitFilledQuantity:0,exitBrokerOrderId:undefined,...patch
});
const source=():RestartReadOnlyInputs=>({
  expectedAccountId:account,expectedPositionId:id,
  journalPositions:[journal()],
  entryAttempt:{id:'PH95-ENTRY',brokerAccountId:account,
    brokerInstrumentKey:inst,orderStatus:'COMPLETE'},
  brokerConnected:true,brokerAccountId:account,
  brokerPositions:[{instrument_token:inst,product:'D',net_quantity:100}],
  brokerOrderBook:[],brokerGttOrders:[]
});
const exitOrder=(patch:Record<string,unknown>={})=>({
  order_id:'PH95-SELL-ORDER',tag:emaBrokerOrderTag('SELL',id),
  instrument_token:inst,product:'D',transaction_type:'SELL',
  quantity:100,status:'open',filled_quantity:0,...patch
});
const gtt=()=>({
  gtt_order_id:'GTT-PH95-STOP',instrument_token:inst,
  product:'D',quantity:100,rules:[{
    strategy:'STOPLOSS',transaction_type:'SELL',status:'SCHEDULED',order_id:null
  }]
});
const verify=(r:ReturnType<typeof auditNrmlRestartQuarantine>)=>{
  assert.equal(r.duplicateSellRetryAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.independentExchangeStopAckCertified,false);
  assert.equal(r.brokerSnapshotFreshnessCertified,false);
  assert.equal(r.manualReconciliationRequired,true);
  assert.equal(r.brokerWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  const json=JSON.stringify(r);
  for(const secret of [account,inst,id,'PH95-SELL-ORDER','GTT-PH95-STOP']){
    assert.ok(!json.includes(secret));
  }
};
describe('Phase95 broker verified live SELL sizing (prevents partial-exit over-sell)',()=>{
  it('original long 100 and zero prior exits requests exactly 100 if broker matches',()=>{
    const r=assessBrokerRemainingSellQuantity({
      originalPositionQuantity:100,previousConfirmedSellFills:0,
      lotSize:50,brokerNetQuantity:100
    });
    assert.equal(r.allowed,true);
    assert.equal(r.remainingQuantity,100);
  });
  it('prior 50 SELL fills means real next SELL must be 50, never original 100',()=>{
    const r=assessBrokerRemainingSellQuantity({
      originalPositionQuantity:100,previousConfirmedSellFills:50,
      lotSize:50,brokerNetQuantity:50
    });
    assert.equal(r.allowed,true);
    assert.equal(r.remainingQuantity,50);
    assert.equal(r.priorExitFilledQuantity,50);
  });
  it('stale broker 100 after local confirmed 50 SELL fails closed',()=>{
    const r=assessBrokerRemainingSellQuantity({
      originalPositionQuantity:100,previousConfirmedSellFills:50,
      lotSize:50,brokerNetQuantity:100
    });
    assert.equal(r.allowed,false);
    assert.equal(r.remainingQuantity,0);
  });
  it('no long remaining does not produce zero quantity exchange sell',()=>{
    const r=assessBrokerRemainingSellQuantity({
      originalPositionQuantity:100,previousConfirmedSellFills:100,
      lotSize:50,brokerNetQuantity:0
    });
    assert.equal(r.allowed,false);
  });
  it('non-lot partial quantity and fraudulent cumulative exit greater than original are rejected',()=>{
    for(const filled of [1,25,51,101,-1,1.2,NaN,Infinity,'50',null]){
      const r=assessBrokerRemainingSellQuantity({
        originalPositionQuantity:100,previousConfirmedSellFills:filled,
        lotSize:50,brokerNetQuantity:50
      });
      assert.equal(r.allowed,false);
    }
  });
  it('missing, decimal, string and disconnected broker net fail before submitting SELL',()=>{
    for(const net of [null,undefined,'50',0,49,100,-50,50.5,NaN,Infinity]){
      const r=assessBrokerRemainingSellQuantity({
        originalPositionQuantity:100,previousConfirmedSellFills:50,
        lotSize:50,brokerNetQuantity:net
      });
      assert.equal(r.allowed,false);
      assert.equal(r.remainingQuantity,0);
    }
  });
  it('missing/malformed original size and lot size are rejected',()=>{
    for(const original of [0,99,-100,1.2,'100',undefined]){
      assert.equal(assessBrokerRemainingSellQuantity({
        originalPositionQuantity:original,previousConfirmedSellFills:0,
        lotSize:50,brokerNetQuantity:100
      }).allowed,false);
    }
    assert.equal(assessBrokerRemainingSellQuantity({
      originalPositionQuantity:100,previousConfirmedSellFills:0,
      lotSize:0,brokerNetQuantity:100
    }).allowed,false);
  });
});
describe('Phase95 persistent NRML restart review: no automated re-entry or duplicate SELL',()=>{
  it('clean-looking account without an active stop is not authorisation to retry',()=>{
    const r=auditNrmlRestartQuarantine(source());verify(r);
    assert.equal(r.status,'RESTART_OBSERVED_ONLY_QUARANTINED');
    assert.equal(r.brokerNetMatchesJournalRemainder,true);
    assert.equal(r.brokerSellOrderCandidates,0);
    assert.ok(r.reasonCodes.includes('NO_VISIBLE_SELL_NOT_PROOF_PREVIOUS_ATTEMPT_FAILED'));
  });
  it('broker SELL tagged by deterministic durable position ID but no ACK in journal is UNKNOWN',()=>{
    const e=source();e.brokerOrderBook=[exitOrder()];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.taggedSellOrderCandidates,1);
    assert.equal(r.brokerSellOrderCandidates,1);
    assert.ok(r.reasonCodes.includes('SELL_TAG_PRESENT_WHILE_JOURNAL_HAS_NO_ACK_ID'));
    assert.equal(r.status,'BROKER_OR_JOURNAL_CONFLICT');
  });
  it('two same-tag broker SELLs are a duplicate across process restart',()=>{
    const e=source();e.brokerOrderBook=[
      exitOrder(),exitOrder({order_id:'PH95-SELL-SECOND'})
    ];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.taggedSellOrderCandidates,2);
    assert.ok(r.reasonCodes.includes('MULTIPLE_TAGGED_OR_JOURNALED_SELL_ORDERS'));
  });
  it('journaled broker SELL ID absent in current book does not mean earlier order failed',()=>{
    const e=source();e.journalPositions=[
      journal({exitBrokerOrderId:'PH95-SELL-ORDER',status:'EXIT_REQUESTED'})
    ];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.journaledExitIdVisibleInOrderBook,false);
    assert.ok(r.reasonCodes.includes('JOURNALED_EXIT_ORDER_NOT_UNIQUELY_VISIBLE_IN_CURRENT_BOOK'));
  });
  it('same journaled broker SELL ID observed once is still a quarantine, never a retry grant',()=>{
    const e=source();e.journalPositions=[journal({
      exitBrokerOrderId:'PH95-SELL-ORDER',status:'EXIT_PENDING'
    })];e.brokerOrderBook=[exitOrder()];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.journaledExitIdVisibleInOrderBook,true);
    assert.equal(r.brokerSellOrderCandidates,1);
  });
  it('duplicate local OPEN NRML position rows cannot be reconciled as a unique option holding',()=>{
    const e=source();e.journalPositions=[journal(),journal({id:'PH95-POS-2'})];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.sameContractOpenJournalPositions,2);
    assert.ok(r.reasonCodes.includes('MULTIPLE_OR_MISSING_DURABLE_NRML_HOLDINGS'));
  });
  it('saved EXIT_REQUESTED after HTTP timeout blocks retry even with zero visible SELL',()=>{
    const e=source();e.journalPositions=[journal({status:'EXIT_REQUESTED'})];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.status,'RESTART_OBSERVED_ONLY_QUARANTINED');
    assert.equal(r.duplicateSellRetryAuthorized,false);
  });
  it('broker current net 50 while saved 100 and zero known exits is a conflict',()=>{
    const e=source();e.brokerPositions=[{
      instrument_token:inst,product:'D',net_quantity:50
    }];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.brokerNetMatchesJournalRemainder,false);
    assert.ok(r.reasonCodes.includes('CURRENT_BROKER_NET_DISAGREES_WITH_DURABLE_EXIT_LEDGER'));
  });
  it('saved prior 50 SELL and broker current net 50 are observationally coherent, not restart release',()=>{
    const e=source();e.journalPositions=[
      journal({exitFilledQuantity:50,status:'EXIT_FAILED'})
    ];e.brokerPositions=[{instrument_token:inst,product:'D',net_quantity:'50'}];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.brokerNetMatchesJournalRemainder,true);
    assert.equal(r.duplicateSellRetryAuthorized,false);
  });
  it('broker pending GTT SELL can trigger after restart even if exchange order book is empty',()=>{
    const e=source();e.brokerGttOrders=[gtt()];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.brokerGttSellRuleCandidates,1);
    assert.ok(r.reasonCodes.includes('BROKER_GTT_SELL_MAY_TRIGGER_NO_AUTORETRY'));
  });
  it('cancelled broker SELL with 0 fills is not a live pending sell, but absence remains unproven',()=>{
    const e=source();e.brokerOrderBook=[exitOrder({
      status:'cancelled',filled_quantity:0
    })];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.brokerSellOrderCandidates,0);
    assert.equal(r.duplicateSellRetryAuthorized,false);
  });
  it('cancelled SELL with 50 actual fills is not safely ignored',()=>{
    const e=source();e.brokerOrderBook=[exitOrder({
      status:'cancelled',filled_quantity:50
    })];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.brokerSellOrderCandidates,1);
    assert.ok(r.reasonCodes.includes('BROKER_SELL_HISTORY_REQUIRES_EXIT_LEDGER_RECONCILIATION'));
  });
  it('unresolved original BUY may fill after restart and must never trigger exit retry',()=>{
    const e=source();e.entryAttempt={
      id:'PH95-ENTRY',brokerAccountId:account,
      brokerInstrumentKey:inst,orderStatus:'UNKNOWN'
    };
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.ok(r.reasonCodes.includes('ORIGINAL_BUY_REMAINDER_OR_ACK_UNRESOLVED'));
  });
  it('unknown or extra broker BUY may increase net beyond local snapshot',()=>{
    const e=source();e.brokerOrderBook=[exitOrder({
      order_id:'PH95-BUY-ORDER',transaction_type:'BUY',status:'open'
    })];
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.equal(r.unresolvedBrokerBuyCandidates,1);
    assert.ok(r.reasonCodes.includes('UNRESOLVED_BROKER_BUY_MAY_INCREASE_NET'));
  });
  it('same option MIS position next to NRML prevents unique broker proof',()=>{
    const e=source();(e.brokerPositions as unknown[]).push({
      instrument_token:inst,product:'I',net_quantity:50
    });
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.ok(r.reasonCodes.includes('SAME_OPTION_HAS_OTHER_PRODUCT_POSITION'));
  });
  it('missing source order book, GTT and portfolio are unverified, not empty',()=>{
    for(const key of ['brokerOrderBook','brokerGttOrders','brokerPositions'] as const){
      const e=source();(e as unknown as Record<string,unknown>)[key]=null;
      const r=auditNrmlRestartQuarantine(e);verify(r);
      assert.equal(r.status,'BROKER_READ_UNAVAILABLE');
    }
  });
  it('unknown broker account and disconnected account are denied',()=>{
    for(const patch of [{brokerConnected:false},{
      brokerAccountId:'PH95-OTHER-ACCOUNT'
    }]){
      const e={...source(),...patch};
      const r=auditNrmlRestartQuarantine(e);verify(r);
      assert.equal(r.status,'BROKER_READ_UNAVAILABLE');
    }
  });
  it('unknown position product, missing ID, bad lot or negative past fill is invalid journal',()=>{
    for(const patch of [{productType:'MIS'},{brokerAccountId:'OTHER'},
      {lotSize:0},{quantity:90},{exitFilledQuantity:-50}]){
      const e=source();e.journalPositions=[journal(patch)];
      const r=auditNrmlRestartQuarantine(e);verify(r);
      assert.equal(r.status,'INVALID_RESTART_JOURNAL');
    }
  });
  it('missing original BUY journal cannot pretend confirmed account origination',()=>{
    const e=source();e.entryAttempt=null;
    const r=auditNrmlRestartQuarantine(e);verify(r);
    assert.ok(r.reasonCodes.includes('ORIGINAL_ENTRY_ORDER_JOURNAL_UNAVAILABLE'));
  });
  it('read-only adapter refuses wrong account before calling any broker GET',async()=>{
    let calls=0;
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:'OTHER'}),
      getOrderBook:async()=>{calls++;return [];},
      getGttOrders:async()=>{calls++;return [];},
      getVerifiedNrmlPositionRows:async()=>{calls++;return [];}
    };
    const e=source();
    const r=await reviewNrmlRestartReadOnly(broker,{
      expectedAccountId:e.expectedAccountId,
      expectedPositionId:e.expectedPositionId,
      journalPositions:e.journalPositions,
      entryAttempt:e.entryAttempt
    });verify(r);
    assert.equal(calls,0);
    assert.equal(r.status,'BROKER_READ_UNAVAILABLE');
  });
  it('read-only adapter reads order and GTT before current portfolio, calls no order write',async()=>{
    const observed:string[]=[];const e=source();
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:account}),
      getOrderBook:async()=>{observed.push('book');return [];},
      getGttOrders:async()=>{observed.push('gtt');return [];},
      getVerifiedNrmlPositionRows:async()=>{
        assert.equal(observed.length,2);observed.push('positions');
        return e.brokerPositions;
      },
      placeOrder:()=>{throw Error('BROKER_SELL_FORBIDDEN');},
      cancelOrder:()=>{throw Error('BROKER_CANCEL_FORBIDDEN');},
      placeGtt:()=>{throw Error('BROKER_GTT_FORBIDDEN');}
    };
    const r=await reviewNrmlRestartReadOnly(broker,{
      expectedAccountId:account,expectedPositionId:id,
      journalPositions:e.journalPositions,entryAttempt:e.entryAttempt
    });verify(r);
    assert.equal(observed[2],'positions');
    assert.equal(r.status,'RESTART_OBSERVED_ONLY_QUARANTINED');
  });
  it('broker GET exception does not leak credentials or imply no outstanding order',async()=>{
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:account}),
      getOrderBook:async()=>{throw Error('SECRET_BROKER_ACCESS_TOKEN');},
      getGttOrders:async()=>[],
      getVerifiedNrmlPositionRows:async()=>[]
    };
    const e=source();
    const r=await reviewNrmlRestartReadOnly(broker,{
      expectedAccountId:account,expectedPositionId:id,
      journalPositions:e.journalPositions,entryAttempt:e.entryAttempt
    });verify(r);
    assert.equal(r.status,'BROKER_READ_UNAVAILABLE');
    assert.ok(!JSON.stringify(r).includes('SECRET'));
  });
});
