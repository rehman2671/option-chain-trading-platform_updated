import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditTriggeredSingleSellGttChild,
  reviewTriggeredSingleSellGttTwoPassReadOnly,
  type TriggeredSellGttScope,
  type TriggeredSellGttSnapshot,
  type TriggeredSellGttReport,
  type TriggeredSellGttBroker
} from '../../server/engine/ema15m/adaptiveExistingNrmlSingleSellGttChildFillReview.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const scope:TriggeredSellGttScope={
  expectedAccountId:'PH120-NO-REAL-ACCOUNT',
  instrumentKey:'NSE_FO|PH120-INDEX-CE',
  originalBuyOrderId:'PH120-ORIGINAL-BUY',
  gttOrderId:'GTT-PH120-ENTRY-SELL',
  originalLongQuantity:100,lotSize:50
};
const symbol='NIFTY26NOV27000CE';
const parent=(edit:Record<string,unknown>={})=>({
  gtt_order_id:scope.gttOrderId,type:'SINGLE',exchange:'NSE_FO',
  product:'D',instrument_token:scope.instrumentKey,
  quantity:100,rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:90,status:'TRIGGERED',
    order_id:'PH120-CHILD-SELL'}],...edit
});
const child=(filled=50,edit:Record<string,unknown>={})=>({
  order_id:'PH120-CHILD-SELL',order_ref_id:scope.gttOrderId,
  exchange_order_id:'PH120-EXCHANGE-ORDER-ID',
  instrument_token:scope.instrumentKey,
  exchange:'NFO',product:'D',transaction_type:'SELL',
  order_type:'LIMIT',trading_symbol:symbol,tradingsymbol:symbol,
  quantity:100,filled_quantity:filled,pending_quantity:100-filled,
  price:90,status:filled===100?'complete':
    filled===0?'open':'partially filled',...edit
});
const trade=(quantity=50,edit:Record<string,unknown>={})=>({
  trade_id:'PH120-TRADE-1',order_id:'PH120-CHILD-SELL',
  order_ref_id:scope.gttOrderId,
  exchange_order_id:'PH120-EXCHANGE-ORDER-ID',
  instrument_token:'151064324',exchange:'NFO',product:'D',
  order_type:'LIMIT',transaction_type:'SELL',
  trading_symbol:symbol,tradingsymbol:symbol,
  quantity,average_price:90,...edit
});
const original=()=>({
  order_id:scope.originalBuyOrderId,instrument_token:scope.instrumentKey,
  product:'D',transaction_type:'BUY',status:'complete',
  filled_quantity:100
});
const position=(remaining:unknown=50)=>({
  instrument_token:scope.instrumentKey,product:'D',
  net_quantity:remaining
});
const snapshot=(filled=50):TriggeredSellGttSnapshot=>{
  const p=parent(),c=child(filled);
  return {exactGtt:[p],allGtts:[p],
    childOrder:c,childTrades:filled>0?[trade(filled)]:[],
    orderBook:[original(),c],positions:[position(100-filled)]};
};
const audit=(s:TriggeredSellGttSnapshot=snapshot())=>
  auditTriggeredSingleSellGttChild(scope,s);
const safe=(r:TriggeredSellGttReport)=>{
  for(const flag of [
    'noAdditionalShortCanBeCreatedIndependentlyCertified',
    'brokerExchangeNativeProtectiveStopAckCertified',
    'brokerExecutionIndependentlyCleared',
    'fullAccountHistoricalTradesReconciled',
    'feesTaxesAndRealisedPnlVerified',
    'multiSessionStopContinuityVerified',
    'brokerCanGuaranteeGapFill',
    'automaticPositionClosureAuthorized',
    'realisedPnlWriteAuthorized','liveNrmlBuyAuthorized',
    'legacyNumericInstrumentTokenIndependentlyMapped'
  ] as const)assert.equal(r[flag],false,flag);
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(r.generatedSellBrokerAckIsNotFill,true);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    status:'OPEN',productType:'NRML'
  }),false);
  const output=JSON.stringify(r);
  for(const secret of [scope.expectedAccountId,scope.instrumentKey,
    scope.gttOrderId,scope.originalBuyOrderId,
    'PH120-CHILD-SELL','PH120-EXCHANGE-ORDER-ID',
    'PH120-TRADE-1','151064324'])
    assert.equal(output.includes(secret),false);
};
describe('Phase120 numeric Upstox trade instrument: descriptive same-child corroboration only',()=>{
  it('NFO numeric legacy trade with matching GTT, child, venue, symbol and remaining net is broker report only',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedLegacyTradeTokenCorroborated,true);
    assert.equal(r.brokerReportedSellFilledQuantity,50);
    assert.equal(r.brokerReportedRemainingLongQuantity,50);
    assert.equal(r.brokerReportedFlatAfterGeneratedChild,false);
  });
  it('native modern F&O instrument key trade remains supported with no legacy claim',()=>{
    const s=snapshot();
    s.childTrades=[trade(50,{instrument_token:scope.instrumentKey})];
    const r=audit(s);safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedLegacyTradeTokenCorroborated,false);
  });
  it('modern exact option key cannot hide contradictory F&O venue, type or symbol',()=>{
    for(const change of [
      {exchange:'BFO'},{exchange:'NSE'},
      {order_type:'MARKET'},{order_type:'SL'},
      {trading_symbol:'NIFTY26NOV27000PE'},
      {tradingsymbol:'NIFTY26NOV27000PE'}
    ]){
      const e=snapshot();
      e.childTrades=[trade(50,{
        instrument_token:scope.instrumentKey,...change
      })];
      const r=audit(e);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
      assert.equal(r.automaticPositionClosureAuthorized,false);
    }
  });
  it('modern exact option key with explicitly wrong parent/child venue fails',()=>{
    for(const venue of [
      {parentExchange:'BSE_FO',childExchange:'NFO'},
      {parentExchange:'NSE_FO',childExchange:'BFO'}
    ]){
      const e=snapshot();
      const p=parent({exchange:venue.parentExchange});
      const c=child(50,{exchange:venue.childExchange});
      e.exactGtt=[p];e.allGtts=[p];
      e.childOrder=c;e.orderBook=[original(),c];
      e.childTrades=[trade(50,{instrument_token:scope.instrumentKey})];
      const r=audit(e);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('two legacy numeric fills add up to full SELL, net flat still never CLOSED',()=>{
    const s=snapshot(100);
    s.childTrades=[trade(50),trade(50,{trade_id:'PH120-TRADE-2'})];
    const r=audit(s);safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedSellExecutionCount,2);
    assert.equal(r.brokerReportedSellFilledQuantity,100);
    assert.equal(r.brokerReportedFlatAfterGeneratedChild,true);
    assert.equal(r.automaticPositionClosureAuthorized,false);
  });
  it('other F&O contract (NFO vs BFO) or equity exchange cannot be conflated',()=>{
    for(const edit of [
      {exchange:'BFO'}, {exchange:'NSE'}, {exchange:undefined},
      {exchange:null}
    ]){
      const s=snapshot();s.childTrades=[trade(50,edit)];
      const r=audit(s);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('wrong trading symbol and absent symbol cannot infer legacy contract mapping',()=>{
    for(const edit of [
      {trading_symbol:'NIFTY26NOV27000PE'},
      {trading_symbol:''}, {trading_symbol:null},
      {tradingsymbol:'BANKNIFTY26NOV27000CE'},
      {tradingsymbol:undefined}
    ]){
      const s=snapshot();
      s.childTrades=[trade(50,edit)];
      const r=audit(s);safe(r);
      if(edit.tradingsymbol===undefined&&Object.keys(edit)[0]==='tradingsymbol'){
        // No alias is permissible when the canonical trading_symbol
        // matches exactly and the secondary alias is absent.
        assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
      }else{
        assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
      }
    }
  });
  it('parent GTT exchange must explicitly be the exact F&O segment',()=>{
    for(const exchange of ['NSE_EQ','BSE_FO',undefined]){
      const s=snapshot(),p=parent({exchange});
      s.exactGtt=[p];s.allGtts=[p];
      const r=audit(s);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('child order F&O exchange and its trading_symbol cannot be ambiguous',()=>{
    for(const edit of [
      {exchange:'BFO'}, {exchange:'NSE'}, {exchange:undefined},
      {trading_symbol:'NIFTY26NOV27000PE'},
      {trading_symbol:undefined},{trading_symbol:''},
      {tradingsymbol:'OTHER'}
    ]){
      const s=snapshot(),c=child(50,edit);
      s.childOrder=c;s.orderBook=[original(),c];
      const r=audit(s);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('wrong generated child, exchange order ref, side, type, product or missing GTT linkage fail',()=>{
    for(const edit of [
      {order_id:'PH120-OTHER'},
      {exchange_order_id:'PH120-OTHER'},
      {order_ref_id:'GTT-PH120-OTHER'},
      {transaction_type:'BUY'}, {order_type:'MARKET'},
      {product:'I'}
    ]){
      const s=snapshot();s.childTrades=[trade(50,edit)];
      const r=audit(s);safe(r);
      assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    }
  });
  it('a random numeric ID alone is never enough, even if the premium fill is plausible',()=>{
    const s=snapshot();
    s.childTrades=[trade(50,{instrument_token:'123456',
      exchange:'BFO'})];
    const r=audit(s);safe(r);
    assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
    assert.equal(r.brokerReportedLegacyTradeTokenCorroborated,false);
  });
  it('missing trade rows for reported partially filled LIMIT child cannot pass',()=>{
    const s=snapshot();s.childTrades=[];
    const r=audit(s);safe(r);
    assert.equal(r.state,'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT');
  });
  it('mixed numeric and modern trade tokens still have unique trade-ID conservation',()=>{
    const s=snapshot(100);
    s.childTrades=[trade(50),trade(50,{
      trade_id:'PH120-TRADE-2',instrument_token:scope.instrumentKey
    })];
    const r=audit(s);safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReportedLegacyTradeTokenCorroborated,true);
    assert.equal(r.brokerReportedSellExecutionCount,2);
  });
  it('realistic two-pass broker-fetched legacy trade-ID evidence has NO release authority',async()=>{
    const broker:TriggeredSellGttBroker={
      getLiveConnectionStatus:()=>({
        isConnected:true,userId:scope.expectedAccountId}),
      getBrokerAuthEpoch:()=>7,
      getGttOrderDetails:async()=>[parent()],
      getGttOrders:async()=>[parent()],
      getOrderDetails:async()=>child(),
      getOrderTrades:async()=>[trade()],
      getOrderBook:async()=>[original(),child()],
      getVerifiedNrmlPositionRows:async()=>[position()]
    };
    const r=await reviewTriggeredSingleSellGttTwoPassReadOnly(broker,scope);
    safe(r);
    assert.equal(r.state,'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP');
    assert.equal(r.brokerReadPasses,2);
    assert.equal(r.brokerReportedLegacyTradeTokenCorroborated,true);
  });
  it('no new GET/order/webhook capability or trading release was added',()=>{
    const src=readFileSync(
      'src/server/engine/ema15m/adaptiveExistingNrmlSingleSellGttChildFillReview.ts',
      'utf8'
    );
    for(const banned of ['.placeOrder(','.cancelOrder(',
      '.placeGttOrder(','.modifyOrder(','.saveEmaLivePosition('])
      assert.equal(src.includes(banned),false,banned);
    assert.equal(src.includes('legacyTradeCorroborated'),true);
  });
});
