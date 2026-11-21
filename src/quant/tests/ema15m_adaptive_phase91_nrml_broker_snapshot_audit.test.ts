import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditNrmlBrokerEvidence,reviewNrmlBrokerReadOnly,
  type NrmlBrokerEvidence,type NrmlBrokerReviewRequest
} from '../../server/engine/ema15m/adaptiveNrmlBrokerSnapshotAudit.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const req:NrmlBrokerReviewRequest={
  expectedAccountId:'BROKER-OWNER-A',instrumentKey:'NSE_FO|CONTRACT',
  expectedLongQuantity:100,lotSize:50
};
const position=()=>({
  instrument_token:req.instrumentKey,product:'D',net_quantity:'100'
});
const sell=()=>({
  instrument_token:req.instrumentKey,product:'D',transaction_type:'SELL',
  order_type:'SL-M',status:'trigger pending',quantity:100,order_id:'TEST-SELL-1'
});
const gtt=()=>({
  instrument_token:req.instrumentKey,product:'D',gtt_order_id:'TEST-GTT-1',
  rules:[{transaction_type:'SELL',status:'ACTIVE',quantity:100}]
});
const fixture=():NrmlBrokerEvidence=>({
  connected:true,accountId:req.expectedAccountId,
  positions:[position()],orderBook:[],gttOrders:[]
});
const neverApproved=(r:ReturnType<typeof auditNrmlBrokerEvidence>)=>{
  assert.equal(r.mode,'READ_ONLY_NRML_BROKER_RECONCILIATION_NOT_EXECUTION');
  assert.equal(r.protectiveChildExchangeAckVerified,false);
  assert.equal(r.sourceEndpointsAtomic,false);
  assert.equal(r.realBrokerStopFillGuaranteed,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.ordersPlacedOrCancelled,0);
  assert.ok(!JSON.stringify(r).includes(req.instrumentKey));
  assert.ok(!JSON.stringify(r).includes(req.expectedAccountId));
  assert.ok(!JSON.stringify(r).includes('TEST-SELL-1'));
};
describe('Phase91 read-only NRML broker snapshot is not protective child exchange ACK',()=>{
  it('account, product and long quantity match yet NO stop/GTT is not a protected holding',()=>{
    const r=auditNrmlBrokerEvidence(req,fixture());neverApproved(r);
    assert.equal(r.nrmlNetQuantityMatchesExpected,true);
    assert.equal(r.activeSellOrderCandidates,0);
    assert.equal(r.activeGttSellRuleCandidates,0);
    assert.ok(r.reasonCodes.includes('NO_NATIVE_PROTECTIVE_SELL_CANDIDATE_OBSERVED'));
  });
  it('single ACTIVE GTT rule is descriptive only, never a broker exchange child ACK',()=>{
    const e=fixture();e.gttOrders=[gtt()];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.activeGttSellRuleCandidates,1);
    assert.equal(r.duplicateOrUnresolvedSellProtection,false);
    assert.equal(r.status,'DESCRIPTIVE_NRML_BROKER_OBSERVATIONS_ONLY_NOT_PROTECTED');
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('single trigger-pending broker SL-M order is descriptive not proof of child stop lifecycle',()=>{
    const e=fixture();e.orderBook=[sell()];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.activeSellOrderCandidates,1);
    assert.equal(r.activeGttSellRuleCandidates,0);
    assert.equal(r.nrmlNetQuantityMatchesExpected,true);
    assert.equal(r.liveNrmlBuyAuthorized,false);
  });
  it('GTT plus active SELL stop might duplicate protection and blocks until reconciled',()=>{
    const e=fixture();e.orderBook=[sell()];e.gttOrders=[gtt()];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.duplicateOrUnresolvedSellProtection,true);
    assert.equal(r.status,'BROKER_STATE_CONFLICT');
    assert.ok(r.reasonCodes.includes('MULTIPLE_ACTIVE_POTENTIAL_SELL_PROTECTIONS'));
  });
  it('two active stop orders block even when both IDs are present',()=>{
    const e=fixture();e.orderBook=[sell(),{...sell(),order_id:'TEST-SELL-2'}];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.activeSellOrderCandidates,2);
    assert.equal(r.duplicateOrUnresolvedSellProtection,true);
  });
  it('duplicate exchange order identifier cannot count as two protective children',()=>{
    const e=fixture();e.orderBook=[sell(),sell()];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.ok(r.reasonCodes.includes('DUPLICATE_ACTIVE_SELL_ORDER_ID'));
    assert.equal(r.duplicateOrUnresolvedSellProtection,true);
  });
  it('partial net position or unexpected position quantity never proves full protection',()=>{
    const e=fixture();e.positions=[{...position(),net_quantity:50}];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.nrmlNetQuantityMatchesExpected,false);
    assert.ok(r.reasonCodes.includes('NRML_NET_QUANTITY_MISMATCH'));
  });
  it('duplicate NRML position rows cannot be summed into a correct matching amount',()=>{
    const e=fixture();e.positions=[
      {...position(),net_quantity:50},{...position(),net_quantity:50}
    ];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.nrmlNetQuantityMatchesExpected,false);
    assert.ok(r.reasonCodes.includes('NRML_POSITION_ABSENT_OR_DUPLICATED'));
  });
  it('same contract with concurrent MIS product blocks unambiguous NRML reconciliation',()=>{
    const e=fixture();e.positions=[
      position(),{...position(),product:'I',net_quantity:50}
    ];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.nrmlNetQuantityMatchesExpected,false);
    assert.ok(r.reasonCodes.includes('SAME_INSTRUMENT_HAS_OTHER_PRODUCT_EXPOSURE'));
  });
  it('zero or negative net quantity and missing quantity never imply a live NRML holding',()=>{
    for(const quantity of ['0','-100',null,'NaN']){
      const e=fixture();e.positions=[{...position(),net_quantity:quantity}];
      const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
      assert.equal(r.nrmlNetQuantityMatchesExpected,false);
    }
  });
  it('missing GTT, order book or portfolio endpoint returns incomplete not empty',()=>{
    for(const key of ['positions','orderBook','gttOrders'] as const){
      const e=fixture();(e as unknown as Record<string,unknown>)[key]=null;
      const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
      assert.equal(r.status,'BROKER_EVIDENCE_INCOMPLETE');
    }
  });
  it('disconnected broker and wrong connected account do not leak cross-account positions',()=>{
    for(const mismatch of [
      {...fixture(),connected:false},
      {...fixture(),accountId:'OTHER-BROKER-ACCOUNT'}
    ]){
      const r=auditNrmlBrokerEvidence(req,mismatch);neverApproved(r);
      assert.equal(r.status,'BROKER_SCOPE_UNAVAILABLE');
    }
  });
  it('cancel-pending stop and unknown SELL status are unresolved, not free-to-sell',()=>{
    for(const state of ['cancel pending','UNKNOWN','BROKER-PROPRIETARY']){
      const e=fixture();e.orderBook=[{...sell(),status:state}];
      const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
      assert.equal(r.liveNrmlBuyAuthorized,false);
      assert.ok(r.duplicateOrUnresolvedSellProtection||
        r.reasonCodes.includes('UNKNOWN_SELL_ORDER_STATUS'));
    }
  });
  it('mismatched stop quantity, missing order id and MARKET instead of STOP fail closed',()=>{
    for(const o of [
      {...sell(),quantity:50},
      {...sell(),order_id:null},
      {...sell(),order_type:'MARKET'}
    ]){
      const e=fixture();e.orderBook=[o];
      const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
      assert.equal(r.activeSellOrderCandidates,0);
      assert.ok(r.reasonCodes.includes('UNVERIFIED_OR_MISMATCHED_ACTIVE_SELL_STOP'));
    }
  });
  it('unrecognised GTT SELL rule and no quantity are unresolved not an ACK',()=>{
    for(const leg of [
      {transaction_type:'SELL',status:'NEW_VENDOR_STATE',quantity:100},
      {transaction_type:'SELL',status:'ACTIVE'},
      {transaction_type:'SIDE_UNKNOWN',status:'ACTIVE',quantity:100}
    ]){
      const e=fixture();e.gttOrders=[{...gtt(),rules:[leg]}];
      const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
      assert.equal(r.liveNrmlBuyAuthorized,false);
      assert.equal(r.duplicateOrUnresolvedSellProtection,true);
    }
  });
  it('strict request requires exact positive lot-multiple size and account scope',()=>{
    for(const changed of [
      {...req,expectedLongQuantity:99},
      {...req,expectedLongQuantity:0},
      {...req,lotSize:0},
      {...req,expectedAccountId:''},
      {...req,instrumentKey:''}
    ]){
      const r=auditNrmlBrokerEvidence(changed,fixture());neverApproved(r);
      assert.equal(r.status,'INVALID_REVIEW_REQUEST');
    }
  });
  it('read-only adapter refuses disconnected or mismatched account BEFORE any API call',async()=>{
    let calls=0;
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:'OTHER'}),
      getVerifiedNrmlPositionRows:async()=>{calls++;return [position()];},
      getOrderBook:async()=>{calls++;return [sell()];},
      getGttOrders:async()=>{calls++;return [gtt()];},
      // Deliberately fake write surface: review must never invoke it.
      placeOrder:()=>{throw new Error('WRITE_FORBIDDEN');}
    };
    const r=await reviewNrmlBrokerReadOnly(broker,req);neverApproved(r);
    assert.equal(calls,0);
    assert.equal(r.status,'BROKER_SCOPE_UNAVAILABLE');
  });
  it('read-only adapter queries exactly three allowed endpoints and never calls broker write methods',async()=>{
    const calls:string[]=[];
    const broker={
      getLiveConnectionStatus:()=>({
        isConnected:true,userId:req.expectedAccountId
      }),
      getVerifiedNrmlPositionRows:async()=>{calls.push('positions');return [position()];},
      getOrderBook:async()=>{calls.push('orders');return [sell()];},
      getGttOrders:async()=>{calls.push('gtt');return [];},
      placeOrder:()=>{throw Error('NO_BUY_OR_SELL');},
      cancelOrder:()=>{throw Error('NO_CANCELLATION');},
      placeGtt:()=>{throw Error('NO_GTT_WRITE');}
    };
    const r=await reviewNrmlBrokerReadOnly(broker,req);neverApproved(r);
    assert.deepEqual(calls.sort(),['gtt','orders','positions']);
    assert.equal(r.activeSellOrderCandidates,1);
  });
  it('transport exception is distinct from a clean empty broker GTT state',async()=>{
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getVerifiedNrmlPositionRows:async()=>[position()],
      getOrderBook:async()=>[sell()],
      getGttOrders:async()=>{throw Error('401 bearer token expired');}
    };
    const r=await reviewNrmlBrokerReadOnly(broker,req);neverApproved(r);
    assert.equal(r.status,'BROKER_EVIDENCE_INCOMPLETE');
    assert.ok(!JSON.stringify(r).includes('bearer token'));
  });
  it('perfect-looking fake broker packet cannot override fixed NRML trade-release interlock',()=>{
    const e=fixture();e.orderBook=[sell()];e.gttOrders=[];
    const r=auditNrmlBrokerEvidence(req,e);neverApproved(r);
    assert.equal(r.nrmlNetQuantityMatchesExpected,true);
    assert.equal(r.activeSellOrderCandidates,1);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
});
