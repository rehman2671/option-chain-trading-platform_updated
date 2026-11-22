import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditTriggeredSingleSellGttChild,
  reviewTriggeredSingleSellGttTwoPassReadOnly,
  type TriggeredSellGttBroker,type TriggeredSellGttScope,
  type TriggeredSellGttSnapshot,type TriggeredSellGttReport
} from '../../server/engine/ema15m/adaptiveExistingNrmlSingleSellGttChildFillReview.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const scope:TriggeredSellGttScope={
  expectedAccountId:'PH113-PRIVATE-ACCOUNT',
  instrumentKey:'NSE_FO|PH113-PRIVATE-CE',
  originalBuyOrderId:'PH113-ORIGINAL-BUY',
  gttOrderId:'GTT-PH113-SELL-ENTRY',
  originalLongQuantity:100,lotSize:50
};
const rule=(change:Record<string,unknown>={})=>({
  strategy:'ENTRY',transaction_type:'SELL',trigger_type:'BELOW',
  trigger_price:90,status:'TRIGGERED',
  order_id:'PH113-CHILD-SELL',...change
});
const parent=(change:Record<string,unknown>={},rules:unknown[]=[rule()])=>({
  gtt_order_id:scope.gttOrderId,type:'SINGLE',product:'D',
  instrument_token:scope.instrumentKey,quantity:100,
  rules,...change
});
const buy=()=>({
  order_id:scope.originalBuyOrderId,
  instrument_token:scope.instrumentKey,product:'D',
  transaction_type:'BUY',status:'complete',filled_quantity:100
});
const child=(filled=0,change:Record<string,unknown>={})=>({
  order_id:'PH113-CHILD-SELL',order_ref_id:scope.gttOrderId,
  exchange_order_id:'PH113-EXCHANGE-ID',
  instrument_token:scope.instrumentKey,product:'D',
  transaction_type:'SELL',order_type:'LIMIT',
  quantity:100,filled_quantity:filled,pending_quantity:100-filled,
  price:90,status:filled===100?'complete':
    filled===0?'open':'partially filled',...change
});
const trade=(quantity=50,change:Record<string,unknown>={})=>({
  trade_id:'PH113-TRADE-1',order_id:'PH113-CHILD-SELL',
  order_ref_id:scope.gttOrderId,
  exchange_order_id:'PH113-EXCHANGE-ID',
  instrument_token:scope.instrumentKey,product:'D',
  transaction_type:'SELL',quantity,average_price:90,...change
});
const position=(quantity:unknown=100)=>({
  instrument_token:scope.instrumentKey,product:'D',net_quantity:quantity
});
function data(filled=0):TriggeredSellGttSnapshot{
  const p=parent(),c=child(filled);
  return {exactGtt:[p],allGtts:[p],
    childOrder:c,childTrades:filled>0?[trade(filled)]:[],
    orderBook:[buy(),c],positions:[position(100-filled)]};
}
const audit=(s:TriggeredSellGttSnapshot=data(),v=scope)=>
  auditTriggeredSingleSellGttChild(v,s);
function safe(r:TriggeredSellGttReport){
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.generatedSellBrokerAckIsNotFill,true);
  assert.equal(r.buyOrderNeverIssuedByReview,true);
  assert.equal(r.stopGttOrderMutationNeverIssuedByReview,true);
  assert.equal(r.gttTriggeredSellIsNotNativeStop,true);
  for(const flag of [
    'noAdditionalShortCanBeCreatedIndependentlyCertified',
    'brokerExchangeNativeProtectiveStopAckCertified',
    'brokerExecutionIndependentlyCleared',
    'fullAccountHistoricalTradesReconciled',
    'feesTaxesAndRealisedPnlVerified',
    'multiSessionStopContinuityVerified','brokerCanGuaranteeGapFill',
    'automaticPositionClosureAuthorized','realisedPnlWriteAuthorized',
    'liveNrmlBuyAuthorized'
  ] as const)assert.equal(r[flag],false,flag);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({productType:'NRML',
    status:'OPEN'}),false);
  for(const v of [
    scope.expectedAccountId,scope.instrumentKey,
    scope.originalBuyOrderId,scope.gttOrderId,
    'PH113-CHILD-SELL','PH113-EXCHANGE-ID','PH113-TRADE-1',
    'PH113-PRIVATE-BEARER-TOKEN'
  ])assert.ok(!JSON.stringify(r).includes(v));
}
const broker=(overrides:Partial<TriggeredSellGttBroker>={},
 calls:string[]=[]):TriggeredSellGttBroker=>({
  getLiveConnectionStatus:()=>({isConnected:true,userId:scope.expectedAccountId}),
  getBrokerAuthEpoch:()=>1,
  getGttOrderDetails:async()=>{calls.push('gtt');return [parent()];},
  getGttOrders:async()=>{calls.push('allGtt');return [parent()];},
  getOrderDetails:async()=>{calls.push('child');return child();},
  getOrderTrades:async()=>{calls.push('trades');return [];},
  getOrderBook:async()=>{calls.push('book');return [buy(),child()];},
  getVerifiedNrmlPositionRows:async()=>{calls.push('net');return [position()];},
  ...overrides
});
describe('Phase113 GTT ENTRY SELL -> LIMIT child original BUY/net conservation',()=>{
  it('triggered GTT generated LIMIT SELL child is not exchange-hosted STOP',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedSellFilledQuantity,0);
    assert.equal(r.brokerReportedRemainingLongQuantity,100);
    assert.equal(r.brokerReportedChildPendingSellQuantity,100);
    assert.equal(r.brokerReportedGeneratedChildIsLimit,true);
    assert.equal(r.quantityWithoutIndependentProtectiveAck,100);
  });
  it('50 unique SELL fills leave 50 NRML net and pending child, no auto-settlement',()=>{
    const r=audit(data(50));safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedSellFilledQuantity,50);
    assert.equal(r.brokerReportedChildPendingSellQuantity,50);
    assert.equal(r.brokerReportedRemainingLongQuantity,50);
    assert.equal(r.brokerReportedSellExecutionCount,1);
  });
  it('100 filled SELL and broker net flat still never authorizes local position CLOSED',()=>{
    const r=audit(data(100));safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedSellFilledQuantity,100);
    assert.equal(r.brokerReportedRemainingLongQuantity,0);
    assert.equal(r.brokerReportedFlatAfterGeneratedChild,true);
    assert.equal(r.automaticPositionClosureAuthorized,false);
  });
  it('two distinct trade IDs must sum exactly to child filled quantity',()=>{
    const e=data(100);
    e.childTrades=[trade(50),trade(50,{trade_id:'PH113-TRADE-2'})];
    const r=audit(e);safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedSellExecutionCount,2);
  });
  it('scheduled GTT never has an exchange child and cannot be protected',()=>{
    const e=data();e.exactGtt=[parent({},[
      rule({status:'SCHEDULED',order_id:null})])];
    const r=audit(e);safe(r);
    assert.equal(r.state,'SCHEDULED_GTT_HAS_NO_GENERATED_SELL_CHILD');
    assert.equal(r.brokerReportedSellFilledQuantity,null);
  });
  it('completed GTT disappears from GET: no proof of exit or permission to retry',()=>{
    const e=data(100);e.exactGtt=[];
    const r=audit(e);safe(r);
    assert.equal(r.state,'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE');
    assert.equal(r.brokerReportedFlatAfterGeneratedChild,false);
  });
  it('single SELL entry required; BUY/STOPLOSS/ABOVE/multi GTT are rejected',()=>{
    for(const p of [
      parent({type:'MULTIPLE'}),
      parent({},[rule({strategy:'STOPLOSS'})]),
      parent({},[rule({transaction_type:'BUY'})]),
      parent({},[rule({trigger_type:'ABOVE'})]),
      parent({},[rule({trigger_price:0})]),
      parent({},[rule(),rule()])
    ]){
      const e=data();e.exactGtt=[p];e.allGtts=[p];
      const r=audit(e);safe(r);
      assert.equal(r.state,'GTT_OR_GENERATED_CHILD_LINKAGE_CONFLICT');
    }
  });
  it('child broker order ID must match parent and order_ref_id GTT exactly',()=>{
    for(const edit of [
      {order_id:'OTHER-CHILD'}, {order_ref_id:'GTT-OTHER'},
      {order_ref_id:null},{exchange_order_id:null},
      {transaction_type:'BUY'},{product:'I'},
      {instrument_token:'NSE_FO|WRONG'},
      {order_type:'SL'},{order_type:'MARKET'},
      {quantity:50},{pending_quantity:25},
      {price:0},{price:90.005}
    ]){
      const e=data(),c=child(0,edit);
      e.childOrder=c;e.orderBook=[buy(),c];
      const r=audit(e);safe(r);
      assert.equal(r.state,'GTT_OR_GENERATED_CHILD_LINKAGE_CONFLICT');
    }
  });
  it('pending cancellation, rejection, unknown and modify statuses never count',()=>{
    for(const status of ['cancel pending','modify pending',
      'rejected','cancelled','failed','trigger pending','put order req received',
      'UNKNOWN']){
      const e=data(),c=child(0,{status});
      e.childOrder=c;e.orderBook=[buy(),c];
      const r=audit(e);safe(r);
      assert.equal(r.state,'GENERATED_SELL_CHILD_REJECTED_CANCELLED_OR_UNRESOLVED');
    }
  });
  it('completed child cannot have outstanding pending; OPEN cannot be fully filled',()=>{
    const cases=[
      child(50,{status:'complete'}),
      child(100,{status:'open'}),
      child(0,{status:'partially filled'})
    ];
    for(const c of cases){
      const e=data();e.childOrder=c;e.orderBook=[buy(),c];
      const r=audit(e);safe(r);
      assert.equal(r.state,'GENERATED_SELL_CHILD_REJECTED_CANCELLED_OR_UNRESOLVED');
    }
  });
  it('orderbook missing, duplicate and exchange ID differences are conflict',()=>{
    for(const orderBook of [
      [buy()], [buy(),child(),child()],
      [buy(),child(0,{exchange_order_id:'OTHER-EXCHANGE'})],
      [buy(),child(0,{price:89})]
    ]){
      const e=data();e.orderBook=orderBook;
      const r=audit(e);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('duplicate, wrong side, wrong order ref and wrong fill price trade IDs block',()=>{
    for(const trades of [
      [],
      [trade(25),trade(25)],
      [trade(50,{trade_id:'OTHER-TRADE'}) ,trade(50)],
      [trade(50,{order_id:'WRONG-CHILD'})],
      [trade(50,{order_ref_id:'GTT-WRONG'})],
      [trade(50,{transaction_type:'BUY'})],
      [trade(50,{exchange_order_id:'OTHER-EXCHANGE'})],
      [trade(50,{average_price:0})]
    ]){
      const e=data(50);e.childTrades=trades;
      const r=audit(e);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('broker net cannot disagree with original BUY minus exact SELL fills',()=>{
    for(const positions of [
      [position(100)],[position(0)],[position(25)],[position(75)],
      [position(-50)],[position('1e2')],[position('050')],
      [position(50),position(50)],
      [position(50),{...position(50),product:'I'}]
    ]){
      const e=data(50);e.positions=positions;
      const r=audit(e);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('same-contract new BUY, extra SELL, extra GTT and independent execution block',()=>{
    for(const extra of [
      {order_id:'PH113-NEW-BUY',side:'BUY',status:'open',filled_quantity:0},
      {order_id:'PH113-NEW-SELL',side:'SELL',status:'open',filled_quantity:0},
      {order_id:'PH113-OTHER-FILL',side:'SELL',status:'complete',filled_quantity:50}
    ]){
      const e=data();
      e.orderBook=[buy(),child(),{
        order_id:extra.order_id,
        instrument_token:scope.instrumentKey,product:'D',
        transaction_type:extra.side,status:extra.status,
        filled_quantity:extra.filled_quantity
      }];
      const r=audit(e);safe(r);
      assert.equal(r.state,'COMPETING_SAME_OPTION_BUY_SELL_GTT_UNRESOLVED');
    }
    const e=data();e.allGtts=[parent(),parent({
      gtt_order_id:'GTT-PH113-OTHER'})];
    const r=audit(e);safe(r);
    assert.equal(r.state,'COMPETING_SAME_OPTION_BUY_SELL_GTT_UNRESOLVED');
  });
  it('unfilled terminal extra SELL is recognized but cannot certify stop',()=>{
    const e=data();e.orderBook=[buy(),child(),{
      order_id:'PH113-CANCELLED-SELL',
      instrument_token:scope.instrumentKey,product:'D',
      transaction_type:'SELL',status:'cancelled',filled_quantity:0
    }];
    const r=audit(e);safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
  });
  it('full GTT list missing or parent ref differs must fail closed',()=>{
    for(const allGtts of [
      [],[parent({quantity:50})],[parent(),parent()],
      [parent({},[rule({trigger_price:88})])]
    ]){
      const e=data();e.allGtts=allGtts;
      const r=audit(e);safe(r);
      assert.equal(r.state,'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE');
    }
  });
  it('two stable rounds each include GTT before/after, child/trades/book/net',async()=>{
    const calls:string[]=[];
    const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({},calls),scope);
    safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReadPasses,2);
    assert.equal(r.sameBrokerSessionAcrossPasses,true);
    assert.equal(calls.filter(x=>x==='gtt').length,4);
    assert.equal(calls.filter(x=>x==='child').length,2);
    assert.equal(calls.length,14);
  });
  it('one GTT parent mutation after fetching child quarantines first pass',async()=>{
    let read=0;
    const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({
      getGttOrderDetails:async()=>{
        read++;return [parent({},[rule({
          trigger_price:read===1?90:85
        })])];
      }
    }),scope);
    safe(r);
    assert.equal(r.state,'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE');
    assert.equal(r.brokerReadPasses,0);
  });
  it('second-pass different child fills and net cannot certify stable proof',async()=>{
    let pass=0;
    const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({
      getGttOrderDetails:async()=>{
        pass++;return [parent()];
      },
      getOrderDetails:async()=>child(pass<=2?0:50),
      getOrderTrades:async()=>pass<=2?[]:[trade(50)],
      getOrderBook:async()=>[buy(),child(pass<=2?0:50)],
      getVerifiedNrmlPositionRows:async()=>[position(pass<=2?100:50)]
    }),scope);
    safe(r);
    assert.equal(r.state,'GTT_CHILD_TRADE_OR_ACCOUNT_NET_CHANGED_BETWEEN_PASSES');
    assert.equal(r.brokerReadPasses,2);
  });
  it('disconnected account or epoch 0 cannot fetch any broker order',async()=>{
    for(const change of [
      {getBrokerAuthEpoch:()=>0},
      {getLiveConnectionStatus:()=>({
        isConnected:false,userId:scope.expectedAccountId
      })},
      {getLiveConnectionStatus:()=>({isConnected:true,userId:'OTHER'})}
    ]){
      let calls=0;
      const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({
        ...change,getGttOrderDetails:async()=>{calls++;return [parent()];}
      }),scope);
      safe(r);
      assert.equal(r.state,'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED');
      assert.equal(calls,0);
    }
  });
  it('account re-auth during child GET rejects the non-atomic batch',async()=>{
    let epoch=1;
    const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({
      getBrokerAuthEpoch:()=>epoch,
      getOrderTrades:async()=>{epoch++;return [];}
    }),scope);
    safe(r);
    assert.equal(r.state,'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED');
  });
  it('Upstox completed GTT no longer retrievable: no synthetic flat success',async()=>{
    let childCalls=0;
    const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({
      getGttOrderDetails:async()=>[],
      getOrderDetails:async()=>{childCalls++;return child(100);}
    }),scope);
    safe(r);
    assert.equal(r.state,'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE');
    assert.equal(childCalls,0);
    assert.equal(r.brokerReportedFlatAfterGeneratedChild,false);
  });
  it('broker GET token errors redacted in returned fixed reason codes',async()=>{
    const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({
      getOrderTrades:async()=>{throw Error('PH113-PRIVATE-BEARER-TOKEN');}
    }),scope);
    safe(r);
    assert.equal(r.state,'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE');
  });
  it('invalid account/GTT/quantity/instrument reject before any native GET',async()=>{
    for(const change of [
      {gttOrderId:'BAD-GTT'}, {expectedAccountId:''},
      {originalLongQuantity:75},{lotSize:0},
      {instrumentKey:'NSE_EQ|SCRIP'}
    ]){
      let calls=0;
      const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker({
        getGttOrderDetails:async()=>{calls++;return [parent()];}
      }),{...scope,...change});
      safe(r);
      assert.equal(r.state,'INVALID_SCOPE');
      assert.equal(calls,0);
    }
  });
  it('admin diagnostic enforces original immutable BUY, same-account position and no writes',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const at=app.indexOf("app.post('/api/ema15m/nrml-single-sell-gtt-child-fill-review'");
    const end=app.indexOf('  // Phase95:',at);
    assert.ok(at>0&&end>at);
    const part=app.slice(at,end);
    for(const required of [
      'requireSuperAdmin','no-store','getOpenEmaLivePositions',
      'readEmaJointBuySellEvidence','originalBuyReceipt',
      'immutableOriginalDebitMatchesReceipt',
      'reviewTriggeredSingleSellGttTwoPassReadOnly',
      'getBrokerAuthEpoch',
      'JSON.stringify(before)!==JSON.stringify(after)'
    ])assert.ok(part.includes(required),required);
    for(const forbidden of [
      'placeOrder(','cancelOrder(','modifyOrder(','placeGttOrder(',
      'saveEmaLivePosition(','updateEmaLivePosition(','squareOff('
    ])assert.equal(part.includes(forbidden),false,forbidden);
  });
});
