import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPostClaimExitJournal,reviewPostClaimBrokerSell,
  type ExitLedgerSnapshot
} from '../../server/engine/ema15m/adaptivePostClaimSellRevalidation.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const inst='NSE_FO|PH97-CALL',account='PH97-BROKER-ACCOUNT';
const snapshot=(overrides:Record<string,unknown>={}):ExitLedgerSnapshot=>({
  id:'PH97-LIVE-POS',attemptId:'PH97-ENTRY',
  brokerAccountId:account,brokerInstrumentKey:inst,
  productType:'MIS',status:'OPEN',
  quantity:100,lotSize:50,exitFilledQuantity:0,
  exitBrokerOrderId:undefined,...overrides
});
const entry=(overrides:Record<string,unknown>={})=>({
  id:'PH97-ENTRY',brokerAccountId:account,brokerInstrumentKey:inst,
  orderStatus:'FILLED',filledQuantity:100,...overrides
});
const verifyLocal=(overrides:{
  original?:ExitLedgerSnapshot;
  currentPositions?:unknown;
  currentEntryAttempt?:unknown;
  requestedRemainingQuantity?:number
}={})=>assessPostClaimExitJournal({
  original:overrides.original??snapshot(),
  currentPositions:overrides.currentPositions??[
    snapshot({status:'EXIT_REQUESTED'})],
  currentEntryAttempt:overrides.currentEntryAttempt===undefined
    ?entry():overrides.currentEntryAttempt,
  requestedRemainingQuantity:overrides.requestedRemainingQuantity??100
});
const brokerArgs=()=>({
  instrumentKey:inst,product:'MIS' as const,
  originalQuantity:100,priorConfirmedSellFills:0,
  lotSize:50,requestedRemainingQuantity:100
});
const broker=()=>{
  const calls:string[]=[];
  return {calls,
    getOrderBook:async():Promise<unknown>=>{calls.push('orders');return [];},
    getGttOrders:async():Promise<unknown>=>{calls.push('gtts');return [];},
    getVerifiedLivePositionQuantity:async():Promise<unknown>=>{
      calls.push('net');return 100;
    },
    placeOrder:()=>{throw Error('NO_LIVE_SELL_ALLOWED_IN_TEST');},
    cancelOrder:()=>{throw Error('NO_BROKER_CANCEL');},
    placeGtt:()=>{throw Error('NO_BROKER_GTT_WRITE');}
  };
};
describe('Phase97 durable post-claim journal integrity',()=>{
  it('after CAS the only local position is EXIT_REQUESTED and unchanged; entry BUY fully filled',()=>{
    const r=verifyLocal();
    assert.equal(r.allowed,true);assert.equal(r.remainingQuantity,100);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('original long 100 with previous 50 SELLs and exact 50 remaining passes only after claim',()=>{
    const original=snapshot({exitFilledQuantity:50});
    const r=verifyLocal({original,currentPositions:[
      snapshot({status:'EXIT_REQUESTED',exitFilledQuantity:50})],
      requestedRemainingQuantity:50});
    assert.equal(r.allowed,true);assert.equal(r.remainingQuantity,50);
  });
  it('missing current durable position is not proof an exit already completed',()=>{
    const r=verifyLocal({currentPositions:[]});
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'DURABLE_EXIT_POSITION_NOT_UNIQUE');
  });
  it('duplicate durable positions with same ID are not a unique claimed exit',()=>{
    const r=verifyLocal({currentPositions:[
      snapshot({status:'EXIT_REQUESTED'}),
      snapshot({status:'EXIT_REQUESTED'})
    ]});
    assert.equal(r.allowed,false);
  });
  it('CAS not current, OPEN, EXIT_FAILED, CLOSED or EXIT_PENDING all block dispatch',()=>{
    for(const status of ['OPEN','EXIT_FAILED','CLOSED','EXIT_PENDING',
      'PARTIALLY_CLOSED']){
      const r=verifyLocal({currentPositions:[snapshot({status})]});
      assert.equal(r.allowed,false);
      assert.equal(r.reason,'DURABLE_EXIT_CLAIM_NOT_CURRENT');
    }
  });
  it('broker child ID appeared after claim: never dispatch second SELL',()=>{
    const r=verifyLocal({currentPositions:[
      snapshot({status:'EXIT_REQUESTED',exitBrokerOrderId:'OTHER-SELL-ID'})
    ]});
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'DURABLE_EXIT_CLAIM_NOT_CURRENT');
  });
  it('other worker changes post-claim filled SELL quantity, invalidates old sized order',()=>{
    const r=verifyLocal({currentPositions:[
      snapshot({status:'EXIT_REQUESTED',exitFilledQuantity:50})
    ]});
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'DURABLE_EXIT_SNAPSHOT_CHANGED_AFTER_CLAIM');
  });
  it('other worker alters current broker account, product, contract, original quantity or lot',()=>{
    for(const changed of [
      {brokerAccountId:'PH97-OTHER-ACCOUNT'},
      {productType:'NRML'},
      {brokerInstrumentKey:'NSE_FO|OTHER-PUT'},
      {quantity:50},{lotSize:100},{attemptId:'PH97-OTHER-ATTEMPT'}
    ]){
      const r=verifyLocal({currentPositions:[
        snapshot({status:'EXIT_REQUESTED',...changed})
      ]});
      assert.equal(r.allowed,false);
      assert.equal(r.reason,'DURABLE_EXIT_SNAPSHOT_CHANGED_AFTER_CLAIM');
    }
  });
  it('missing or ambiguous account/instrument/product/quantity original journal fails closed',()=>{
    for(const changed of [
      {brokerAccountId:null},{brokerInstrumentKey:null},
      {productType:'UNKNOWN'},{quantity:0},{lotSize:0},
      {exitFilledQuantity:110},{exitFilledQuantity:-1}
    ]){
      const original=snapshot(changed);
      const r=verifyLocal({original,currentPositions:[
        snapshot({status:'EXIT_REQUESTED',...changed})
      ]});
      assert.equal(r.allowed,false);
    }
  });
  it('requested remaining SELL differs from original minus confirmed exit fills',()=>{
    assert.equal(verifyLocal({requestedRemainingQuantity:50}).allowed,false);
  });
  it('old journal without an original entry BUY attempt cannot be inferred as purchased long',()=>{
    const r=verifyLocal({currentEntryAttempt:null});
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'ENTRY_BUY_ATTEMPT_UNVERIFIED_OR_STILL_EXECUTABLE');
  });
  it('entry BUY UNKNOWN, OPEN, PARTIALLY_FILLED, CANCEL_PENDING or SUBMITTED cannot be ignored',()=>{
    for(const status of ['UNKNOWN','OPEN','PARTIALLY_FILLED','CANCEL_PENDING',
      'SUBMITTED','CREATED']){
      const r=verifyLocal({currentEntryAttempt:entry({orderStatus:status})});
      assert.equal(r.allowed,false);
      assert.equal(r.reason,'ENTRY_BUY_ATTEMPT_UNVERIFIED_OR_STILL_EXECUTABLE');
    }
  });
  it('entry broker account, instrument, original quantity, or durable attempt ID diverges',()=>{
    for(const changed of [
      {brokerAccountId:'PH97-WRONG'},
      {brokerInstrumentKey:'NSE_FO|OTHER'},
      {filledQuantity:50},{id:'PH97-WRONG'}
    ]){
      const r=verifyLocal({currentEntryAttempt:entry(changed)});
      assert.equal(r.allowed,false);
      assert.equal(r.reason,'ENTRY_BUY_ATTEMPT_UNVERIFIED_OR_STILL_EXECUTABLE');
    }
  });
  it('only explicitly fully-filled BUY exit ledger is accepted, never synthetic success',()=>{
    const r=verifyLocal({currentEntryAttempt:entry({orderStatus:'FILLED'})});
    assert.equal(r.allowed,true);
    for(const status of ['CANCELLED','COMPLETE']){
      const result=verifyLocal({currentEntryAttempt:entry({orderStatus:status})});
      assert.equal(result.allowed,false);
    }
  });
});
describe('Phase97 fresh broker reads AFTER durable exit claim',()=>{
  it('fully agreeing original and fresh broker read is descriptive, not NRML live release',async()=>{
    const b=broker();const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,true);
    assert.deepEqual(b.calls,['orders','gtts','net']);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('fresh broker SELL appears after pre-CAS order-book read, block duplicate SELL',async()=>{
    const b=broker();
    b.getOrderBook=async()=>{b.calls.push('orders');return [{
      instrument_token:inst,product:'I',transaction_type:'SELL',
      status:'open',order_id:'PH97-OTHER-SELL'}];};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'BROKER_EXISTING_SELL_NOT_TERMINAL');
    assert.deepEqual(b.calls,['orders']);
  });
  it('a new pending BUY on same option after claim can increase net after the broker read',async()=>{
    const b=broker();
    b.getOrderBook=async()=>{b.calls.push('orders');return [{
      instrument_token:inst,product:'I',transaction_type:'BUY',
      status:'open',order_id:'PH97-PENDING-MANUAL-BUY'
    }];};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'BROKER_PENDING_BUY_OR_OTHER_PRODUCT_MAY_CHANGE_NET');
    assert.deepEqual(b.calls,['orders']);
  });
  it('the same option instrument with conflicting NRML D book entry blocks MIS SELL recheck',async()=>{
    const b=broker();
    b.getOrderBook=async()=>{b.calls.push('orders');return [{
      instrument_token:inst,product:'D',transaction_type:'BUY',
      status:'complete',order_id:'PH97-CONCURRENT-NRML-BOOK'
    }];};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'BROKER_PENDING_BUY_OR_OTHER_PRODUCT_MAY_CHANGE_NET');
  });
  it('fresh GTT SELL becomes scheduled after pre-CAS read, block duplicate exit',async()=>{
    const b=broker();
    b.getGttOrders=async()=>{b.calls.push('gtts');return [{
      instrument_token:inst,product:'I',gtt_order_id:'PH97-STOP',
      rules:[{transaction_type:'SELL',status:'SCHEDULED',order_id:null}]
    }];};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'BROKER_GTT_SELL_STILL_EXECUTABLE');
    assert.deepEqual(b.calls,['orders','gtts']);
  });
  it('fresh broker position net 50 after earlier 100 read fails without placeOrder',async()=>{
    const b=broker();
    b.getVerifiedLivePositionQuantity=async()=>{b.calls.push('net');return 50;};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'BROKER_NET_CHANGED_AFTER_ORIGINAL_VERIFICATION');
  });
  it('broker net missing after CAS is not a zero long nor a safe SELL',async()=>{
    const b=broker();
    b.getVerifiedLivePositionQuantity=async()=>{b.calls.push('net');return null;};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.remainingQuantity,0);
  });
  it('after partial prior SELL only exact broker remaining 50 may pass second recheck',async()=>{
    const b=broker();
    b.getVerifiedLivePositionQuantity=async()=>{b.calls.push('net');return 50;};
    const r=await reviewPostClaimBrokerSell(b,{
      ...brokerArgs(),priorConfirmedSellFills:50,requestedRemainingQuantity:50
    });
    assert.equal(r.allowed,true);assert.equal(r.remainingQuantity,50);
  });
  it('read-only broker methods missing after CAS must keep claim quarantined',async()=>{
    const b=broker();
    const r=await reviewPostClaimBrokerSell(
      {...b,getGttOrders:undefined as unknown as typeof b.getGttOrders},
      brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'BROKER_READ_ONLY_RECHECK_UNAVAILABLE');
  });
  it('transport rejection or stale auth status never turns into an empty safe order book',async()=>{
    const b=broker();
    b.getOrderBook=async()=>{
      b.calls.push('orders');throw Error('AUTH_BEARER_SECRET_NOT_FOR_LOGGING');
    };
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.equal(r.reason,'BROKER_READ_ONLY_RECHECK_UNAVAILABLE');
    assert.ok(!JSON.stringify(r).includes('SECRET'));
  });
  it('GTT GET rejects after order book GET, response remains blocked with no net GET',async()=>{
    const b=broker();
    b.getGttOrders=async()=>{b.calls.push('gtts');throw Error('HTTP-503');};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
    assert.deepEqual(b.calls,['orders','gtts']);
  });
  it('unknown/exchange pending cancellation does not prove previous SELL terminal',async()=>{
    const b=broker();
    b.getOrderBook=async()=>{b.calls.push('orders');return [{
      instrument_token:inst,product:'I',transaction_type:'SELL',
      status:'cancel pending',order_id:'PH97-CANCEL-PENDING'}];};
    const r=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(r.allowed,false);
  });
  it('no fake broker writes invoked by any successful or failed read-only review',async()=>{
    const b=broker();
    const result=await reviewPostClaimBrokerSell(b,brokerArgs());
    assert.equal(result.allowed,true);
    assert.deepEqual(b.calls,['orders','gtts','net']);
    const failed=await reviewPostClaimBrokerSell(b,{
      ...brokerArgs(),requestedRemainingQuantity:50
    });
    assert.equal(failed.allowed,false);
    assert.deepEqual(b.calls,['orders','gtts','net','orders','gtts','net']);
  });
});
