import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditExistingNrmlDayStop,reviewExistingNrmlDayStopReadOnly,
  type ExistingNrmlDayStopBroker,type ExistingNrmlDayStopScope,
  type ExistingNrmlDayStopEvidence,type ExistingNrmlDayStopReport
} from '../../server/engine/ema15m/adaptiveExistingNrmlDayStopReadOnly.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const scope:ExistingNrmlDayStopScope={
  expectedAccountId:'PH110-ACCOUNT-SECRET',
  instrumentKey:'NSE_FO|PH110-PRIVATE-CALL',
  originalBuyOrderId:'PH110-BUY',
  stopOrderId:'PH110-STOP',
  originalLongQuantity:100,lotSize:50
};
const stop=(fill=0,change:Record<string,unknown>={})=>({
  order_id:scope.stopOrderId,order_ref_id:null,
  exchange_order_id:'PH110-EXCHANGE',instrument_token:scope.instrumentKey,
  product:'D',transaction_type:'SELL',order_type:'SL',validity:'DAY',
  quantity:100,filled_quantity:fill,pending_quantity:100-fill,
  status:fill>0?'partially filled':'trigger pending',
  trigger_price:95,price:94,...change
});
const buy=()=>({
  order_id:scope.originalBuyOrderId,
  instrument_token:scope.instrumentKey,product:'D',
  transaction_type:'BUY',status:'complete'
});
const trade=(qty=50)=>({
  trade_id:'PH110-TRADE',order_id:scope.stopOrderId,
  exchange_order_id:'PH110-EXCHANGE',instrument_token:scope.instrumentKey,
  product:'D',transaction_type:'SELL',quantity:qty
});
const net=(n=100)=>({instrument_token:scope.instrumentKey,
  product:'D',net_quantity:String(n)});
const evidence=(filled=0,netQ=100):ExistingNrmlDayStopEvidence=>{
  const o=stop(filled);
  return {order:o,orderBook:[o,buy()],
    trades:filled>0?[trade(filled)]:[],
    positions:[net(netQ)],gttOrders:[]};
};
const audit=(e:ExistingNrmlDayStopEvidence=evidence(),s=scope)=>
  auditExistingNrmlDayStop(s,e);
const broker=(patch:Partial<ExistingNrmlDayStopBroker>={},
  calls:string[]=[]):ExistingNrmlDayStopBroker=>({
  getLiveConnectionStatus:()=>({isConnected:true,userId:scope.expectedAccountId}),
  getBrokerAuthEpoch:()=>1,
  getOrderDetails:async()=>{calls.push('details');return stop();},
  getOrderTrades:async()=>{calls.push('trades');return [];},
  getOrderBook:async()=>{calls.push('book');return [stop(),buy()];},
  getGttOrders:async()=>{calls.push('gtt');return [];},
  getVerifiedNrmlPositionRows:async()=>{calls.push('positions');return [net()];},
  ...patch
});
function neverRelease(r:ExistingNrmlDayStopReport){
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.stopPersistsAcrossMarketSessions,false);
  assert.equal(r.overnightOptionGapProtectionCertified,false);
  assert.equal(r.brokerExchangeStopAckIndependentlyCertified,false);
  assert.equal(r.brokerStopFillGuaranteed,false);
  assert.equal(r.stopPlacementOrAmendmentAuthorized,false);
  assert.equal(r.newGttEntryOrBuyAuthorized,false);
  assert.equal(r.capitalMarginAndStrategyApproved,false);
  assert.equal(r.realisedPnlWriteAuthorized,false);
  assert.equal(r.automaticPositionClosureAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  for(const raw of [scope.expectedAccountId,scope.instrumentKey,
    scope.originalBuyOrderId,scope.stopOrderId,'PH110-EXCHANGE',
    'PH110-TRADE','PH110-TOKEN-SECRET'])
    assert.equal(JSON.stringify(r).includes(raw),false);
}
describe('Phase110 existing NRML option native SELL DAY SL without second BUY',()=>{
  it('broker-reported DAY SELL SL exact long and zero SELL fill: still not overnight',()=>{
    const r=audit();neverRelease(r);
    assert.equal(r.state,'BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION');
    assert.equal(r.nativeSellStopTypeObserved,'SL');
    assert.equal(r.nativeValidityDayObserved,true);
    assert.equal(r.brokerReportedRemainingLongQuantity,100);
    assert.equal(r.quantityWithoutIndependentlyCertifiedOvernightStop,100);
    assert.equal(r.brokerReportedStopPendingQuantity,100);
  });
  it('a native DAY SELL SL-M with price zero is descriptive only',()=>{
    const e=evidence(),o=stop(0,{order_type:'SL-M',price:0});
    e.order=o;e.orderBook=[o,buy()];
    const r=audit(e);neverRelease(r);
    assert.equal(r.nativeSellStopTypeObserved,'SL-M');
    assert.equal(r.state,'BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION');
  });
  it('50 native SELL stop fills and 50 broker net are conserved but not certified',()=>{
    const r=audit(evidence(50,50));neverRelease(r);
    assert.equal(r.state,'BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION');
    assert.equal(r.brokerReportedStopFilledQuantity,50);
    assert.equal(r.brokerReportedStopPendingQuantity,50);
    assert.equal(r.quantityWithoutIndependentlyCertifiedOvernightStop,50);
  });
  it('wrong net after partial fills is not a stop coverage observation',()=>{
    for(const n of [0,100,25]){
      const r=audit(evidence(50,n));neverRelease(r);
      assert.equal(r.state,'CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT');
      assert.equal(r.brokerReportedRemainingLongQuantity,null);
    }
  });
  it('IOC, GTC, scheduled, cancelled, complete, unknown stops never imply DAY active',()=>{
    for(const change of [
      {validity:'IOC'}, {validity:'GTC'},
      {status:'cancel pending'},{status:'modify pending'},
      {status:'cancelled'},{status:'complete'},{status:'rejected'}
    ]){
      const e=evidence(),o=stop(0,change);e.order=o;e.orderBook=[o,buy()];
      const r=audit(e);neverRelease(r);
      assert.equal(r.state,'DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID');
    }
  });
  it('SELL product/order-type/side/contract mismatch and native MARKET cannot pass',()=>{
    for(const change of [
      {product:'I'},{transaction_type:'BUY'},
      {instrument_token:'NSE_FO|OTHER'}, {order_type:'MARKET'},
      {order_type:'LIMIT'},{quantity:50},{filled_quantity:101},
      {pending_quantity:99},{order_id:'PH110-WRONG'}
    ]){
      const e=evidence(),o=stop(0,change);e.order=o;e.orderBook=[o,buy()];
      const r=audit(e);neverRelease(r);
      assert.equal(r.state,'DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID');
    }
  });
  it('SELL SL trigger and limit price economics must be valid',()=>{
    for(const change of [
      {trigger_price:0},{trigger_price:-1},{trigger_price:NaN},
      {price:96},{price:0},{price:-1},{price:null},
      {order_type:'SL-M',price:94}
    ]){
      const e=evidence(),o=stop(0,change);e.order=o;e.orderBook=[o,buy()];
      const r=audit(e);neverRelease(r);
      assert.equal(r.state,'DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID');
    }
  });
  it('broker exchange_order_id absent is not native child ACK',()=>{
    const e=evidence(),o=stop(0,{exchange_order_id:null});
    e.order=o;e.orderBook=[o,buy()];
    const r=audit(e);neverRelease(r);
    assert.equal(r.state,'DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID');
  });
  it('same child details/orderbook stale, different trigger, or duplicated row blocks',()=>{
    for(const book of [
      [stop(0,{trigger_price:96}),buy()],
      [stop(),stop(),buy()],
      [stop(0,{filled_quantity:50}),buy()],
      [stop(0,{validity:'IOC'}),buy()]
    ]){
      const e=evidence();e.orderBook=book;
      const r=audit(e);neverRelease(r);
      assert.equal(r.state,'DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT');
    }
  });
  it('missing partial SELL trade, duplicated trade ID and wrong exchange ref block',()=>{
    const first=evidence(50,50);first.trades=[];
    const absent=audit(first);neverRelease(absent);
    assert.equal(absent.state,'DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT');
    const repeated=evidence(50,50);repeated.trades=[trade(25),trade(25)];
    const dup=audit(repeated);neverRelease(dup);
    assert.equal(dup.state,'DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT');
    const wrong=evidence(50,50);
    wrong.trades=[{...trade(50),exchange_order_id:'PH110-DIFFERENT'}];
    const r=audit(wrong);neverRelease(r);
    assert.equal(r.state,'DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT');
  });
  it('any same-contract BUY change, active SELL or additional GTT blocks',()=>{
    for(const changes of [
      {orderBook:[stop(),buy(),{...buy(),order_id:'PH110-SECOND-BUY'}]},
      {orderBook:[stop(),buy(),{...stop(),order_id:'PH110-SECOND-SELL'}]},
      {gttOrders:[{gtt_order_id:'GTT-PH110-EXTRA',
        instrument_token:scope.instrumentKey,product:'D'}]}
    ]){
      const r=audit({...evidence(),...changes});neverRelease(r);
      assert.equal(r.state,'CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT');
    }
  });
  it('ambiguous portfolio net, other product and coercible net strings fail closed',()=>{
    const cases=[
      [net(100),net(100)],
      [{...net(100),net_quantity:'1e2'}],
      [{...net(100),net_quantity:''}],
      [{...net(100),net_quantity:null}],
      [net(100),{...net(100),product:'I'}]
    ];
    for(const positions of cases){
      const r=audit({...evidence(),positions});neverRelease(r);
      assert.equal(r.state,'CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT');
    }
  });
  it('even completely filled stop with flat broker net cannot auto close ledger',()=>{
    const e=evidence(100,0);
    const r=audit(e);neverRelease(r);
    assert.equal(r.state,'DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID');
    assert.equal(r.automaticPositionClosureAuthorized,false);
    assert.equal(r.realisedPnlWriteAuthorized,false);
  });
  it('stable two-pass native current-day stop incurs ten read-only GETs',async()=>{
    const calls:string[]=[];
    const r=await reviewExistingNrmlDayStopReadOnly(broker({},calls),scope);
    neverRelease(r);
    assert.equal(r.state,'BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION');
    assert.equal(r.brokerReadPasses,2);
    assert.equal(r.sameBrokerSessionAcrossPasses,true);
    assert.equal(calls.filter(x=>x==='positions').length,2);
    assert.equal(calls.length,10);
  });
  it('same account reauthentication during first batch blocks net fetch',async()=>{
    let epoch=1,netCalls=0;
    const b=broker({
      getBrokerAuthEpoch:()=>epoch,
      getOrderDetails:async()=>{epoch=2;return stop();},
      getVerifiedNrmlPositionRows:async()=>{
        netCalls++;return [net()];
      }
    });
    const r=await reviewExistingNrmlDayStopReadOnly(b,scope);
    neverRelease(r);
    assert.equal(r.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED');
    assert.equal(netCalls,0);
  });
  it('native order is cancelled or partially fills on second batch: fail closed',async()=>{
    for(const mutate of ['cancel','partial']){
      let pass=0;
      const b=broker({
        getOrderDetails:async()=>{pass++;return pass===1?stop():
          mutate==='cancel'?stop(0,{status:'cancel pending'}):stop(50);},
        getOrderBook:async()=>[pass===1?stop():
          mutate==='cancel'?stop(0,{status:'cancel pending'}):stop(50),buy()],
        getOrderTrades:async()=>pass===1?[]:
          mutate==='partial'?[trade(50)]:[],
        getVerifiedNrmlPositionRows:async()=>[net(pass===1?100:
          mutate==='partial'?50:100)]
      });
      const r=await reviewExistingNrmlDayStopReadOnly(b,scope);
      neverRelease(r);
      assert.ok([
        'DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID',
        'DAY_SELL_STOP_STATE_CHANGED_BETWEEN_READS'
      ].includes(r.state),r.state);
      assert.equal(r.brokerReportedRemainingLongQuantity,null);
    }
  });
  it('broker fails a GET, epoch missing or switches during final pass',async()=>{
    for(const b of [
      broker({getOrderTrades:async()=>{throw Error('PH110-TOKEN-SECRET');}}),
      broker({getBrokerAuthEpoch:()=>0}),
      broker({getLiveConnectionStatus:()=>({isConnected:true,userId:'OTHER'})})
    ]){
      const r=await reviewExistingNrmlDayStopReadOnly(b,scope);neverRelease(r);
      assert.ok(['BROKER_SOURCE_INCOMPLETE',
        'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED'].includes(r.state));
    }
    let reads=0,epoch=4;
    const r=await reviewExistingNrmlDayStopReadOnly(broker({
      getBrokerAuthEpoch:()=>epoch,
      getOrderDetails:async()=>{
        reads++;if(reads===2)epoch=5;
        return stop();
      }
    }),scope);
    neverRelease(r);
    assert.equal(r.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED');
  });
  it('invalid lot, identical original BUY / SELL IDs blocked before broker reads',async()=>{
    let calls=0;
    const b=broker({getOrderDetails:async()=>{calls++;return stop();}});
    for(const s of [
      {...scope,originalLongQuantity:75},
      {...scope,stopOrderId:scope.originalBuyOrderId},
      {...scope,instrumentKey:'NSE_EQ|WRONG'},
      {...scope,lotSize:0}
    ]){
      const r=await reviewExistingNrmlDayStopReadOnly(b,s);neverRelease(r);
      assert.equal(r.state,'INVALID_SCOPE');
    }
    assert.equal(calls,0);
  });
  it('new route is SUPERADMIN, no-store, native read-only and no order mutation',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const start=app.indexOf("app.post('/api/ema15m/nrml-existing-day-stop-review'");
    const end=app.indexOf('  // Phase95:',start);
    assert.ok(start>0&&end>start);
    const route=app.slice(start,end);
    for(const required of ['requireSuperAdmin','no-store','getOpenEmaLivePositions',
      'reviewExistingNrmlDayStopReadOnly','getBrokerAuthEpoch',
      'originalBuyOrderId','stopOrderId'])
      assert.ok(route.includes(required),required);
    for(const forbidden of ['placeOrder(','cancelOrder(','modifyOrder(',
      'placeGttOrder(','saveEmaLivePosition(','updateEmaLivePosition('])
      assert.equal(route.includes(forbidden),false);
  });
});
