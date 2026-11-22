import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditGttEntryOriginalNrmlBuyProvenance,
  reviewGttEntryOriginalNrmlBuyReadOnly,
  type GttEntryProvenanceScope,
  type GttEntryProvenanceSources,
  type GttEntryReadOnlyBroker,
  type GttEntryProvenanceReport
} from '../../server/engine/ema15m/adaptiveNrmlGttEntryBuyProvenance.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const scope:GttEntryProvenanceScope={
  positionId:'PH109-POS',
  expectedAccountId:'PH109-ACCOUNT',
  instrumentKey:'NSE_FO|PH109-CE',
  gttOrderId:'GTT-PH109-ENTRY-SL',
  originalBuyOrderId:'PH109-BUY-ORDER',
  originalBuyExchangeOrderId:'PH109-BUY-EXCHANGE',
  originalQuantity:100,lotSize:50
};
const entry=(change:Record<string,unknown>={})=>({
  strategy:'ENTRY',status:'COMPLETED',trigger_type:'ABOVE',
  trigger_price:110,transaction_type:'BUY',
  order_id:scope.originalBuyOrderId,...change
});
const stop=(change:Record<string,unknown>={})=>({
  strategy:'STOPLOSS',status:'SCHEDULED',trigger_type:'IMMEDIATE',
  trigger_price:92,transaction_type:'SELL',order_id:null,...change
});
const parent=(change:Record<string,unknown>={},rules:any[]=[entry(),stop()])=>({
  type:'MULTIPLE',product:'D',quantity:100,
  instrument_token:scope.instrumentKey,gtt_order_id:scope.gttOrderId,
  rules,...change
});
const buy=()=>({
  order_id:scope.originalBuyOrderId,
  exchange_order_id:scope.originalBuyExchangeOrderId,
  instrument_token:scope.instrumentKey,product:'D',
  transaction_type:'BUY',status:'complete',
  quantity:100,filled_quantity:100,pending_quantity:0,average_price:100
});
const immutable=()=>[
  {tradeId:'PH109-T1',exchangeOrderId:scope.originalBuyExchangeOrderId,
    quantity:50,price:90},
  {tradeId:'PH109-T2',exchangeOrderId:scope.originalBuyExchangeOrderId,
    quantity:50,price:110}
];
const brokerTrades=()=>immutable().map(t=>({
  trade_id:t.tradeId,order_id:scope.originalBuyOrderId,
  exchange_order_id:scope.originalBuyExchangeOrderId,
  instrument_token:scope.instrumentKey,product:'D',
  transaction_type:'BUY',quantity:t.quantity,average_price:t.price
}));
const e=():GttEntryProvenanceSources=>({
  gtt:[parent()],originalBuyOrder:buy(),
  originalBuyTrades:brokerTrades(),immutableBuyTrades:immutable()
});
const audit=(data:GttEntryProvenanceSources=e(),s=scope)=>
  auditGttEntryOriginalNrmlBuyProvenance(s,data);
function locked(r:GttEntryProvenanceReport):void{
  assert.equal(r.gttRequestPlacementSchemaProven,false);
  assert.equal(r.originalIndependentBuyCanBeAttachedToGttAfterFill,false);
  assert.equal(r.instrumentFnoGttEligibleIndependentlyVerified,false);
  assert.equal(r.edisOrOtherSellAuthorizationVerified,false);
  assert.equal(r.nativeStopOrderExchangeAckCertified,false);
  assert.equal(r.stopCoverageAndOvernightProtectionCertified,false);
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.netRealisedPnlAuthorized,false);
  assert.equal(r.automaticPositionClosureAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  for(const secret of [
    scope.positionId,scope.expectedAccountId,scope.instrumentKey,
    scope.gttOrderId,scope.originalBuyOrderId,scope.originalBuyExchangeOrderId,
    'PH109-T1','PH109-T2','PH109-BEARER-TOKEN'
  ])assert.ok(!JSON.stringify(r).includes(secret));
}
const broker=(overrides:Partial<GttEntryReadOnlyBroker>={},
  calls:string[]=[]):GttEntryReadOnlyBroker=>({
  getLiveConnectionStatus:()=>({isConnected:true,userId:scope.expectedAccountId}),
  getBrokerAuthEpoch:()=>1,
  getGttOrderDetails:async()=>{calls.push('gtt');return [parent()];},
  getOrderDetails:async()=>{calls.push('buy');return buy();},
  getOrderTrades:async()=>{calls.push('trades');return brokerTrades();},
  ...overrides
});
describe('Phase109 read-only Upstox v3 ENTRY+STOPLOSS GTT immutable BUY provenance',()=>{
  it('documented MULTIPLE ENTRY completed BUY and scheduled STOPLOSS has no generated child',()=>{
    const r=audit();locked(r);
    assert.equal(r.state,'SCHEDULED_STOPLOSS_HAS_NO_EXCHANGE_CHILD');
    assert.equal(r.gttHasValidMultipleEntryStoplossSchema,true);
    assert.equal(r.exactOriginalBuyOrderLinkedToGttEntry,true);
    assert.equal(r.immutableOriginalBuyTradesMatchBroker,true);
    assert.equal(r.brokerReportedBuyTradeCount,2);
    assert.equal(r.gttStoplossScheduledWithoutChild,true);
    assert.equal(r.brokerReportedStoplossChildIdObserved,false);
  });
  it('triggered STOPLOSS with child ID is still broker-reported, never certified',()=>{
    const d=e();d.gtt=[parent({},[entry(),
      stop({status:'TRIGGERED',order_id:'PH109-STOP-CHILD'})])];
    const r=audit(d);locked(r);
    assert.equal(r.state,'BROKER_GTT_ENTRY_AND_BUY_MATCH_NOT_PROTECTION_CERTIFIED');
    assert.equal(r.brokerReportedStoplossChildIdObserved,true);
  });
  it('TARGET third leg is allowed only with unique strategy and SELL IMMEDIATE',()=>{
    const target={strategy:'TARGET',transaction_type:'SELL',
      status:'SCHEDULED',trigger_type:'IMMEDIATE',trigger_price:130,
      order_id:null};
    const d=e();d.gtt=[parent({},[entry(),stop(),target])];
    const r=audit(d);locked(r);
    assert.equal(r.state,'SCHEDULED_STOPLOSS_HAS_NO_EXCHANGE_CHILD');
    for(const bad of [
      [entry(),stop(),stop()],[entry(),stop(),{...target,trigger_type:'BELOW'}],
      [entry(),stop(),{...target,transaction_type:'BUY'}]
    ]){
      d.gtt=[parent({},bad)];
      const t=audit(d);locked(t);
      assert.equal(t.state,'UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS');
    }
  });
  it('standalone STOPLOSS and SINGLE STOPLOSS GTT are not documented protection',()=>{
    for(const gtt of [
      parent({type:'SINGLE'},[stop()]),
      parent({type:'MULTIPLE'},[stop()]),
      parent({type:'SINGLE'},[entry()]),
      parent({type:'MULTIPLE'},[entry(),entry(),stop()])
    ]){
      const d=e();d.gtt=[gtt];
      const r=audit(d);locked(r);
      assert.equal(r.state,'UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS');
    }
  });
  it('separately placed original BUY cannot be magically linked to different ENTRY child',()=>{
    for(const wrong of [
      null,'PH109-OTHER-BUY','',undefined
    ]){
      const d=e();d.gtt=[parent({},[entry({order_id:wrong}),stop()])];
      const r=audit(d);locked(r);
      assert.ok(['ORIGINAL_NRML_BUY_NOT_GENERATED_BY_GTT_ENTRY',
        'UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS']
        .includes(r.state));
      assert.equal(r.immutableOriginalBuyTradesMatchBroker,false);
    }
  });
  it('scheduled, rejected and nonexecuted ENTRY cannot corroborate a filled original BUY',()=>{
    for(const status of ['SCHEDULED','FAILED','CANCELLED','OPEN','PENDING']){
      const d=e();d.gtt=[parent({},[entry({status}),stop()])];
      const r=audit(d);locked(r);
      assert.equal(r.state,'ORIGINAL_NRML_BUY_NOT_GENERATED_BY_GTT_ENTRY');
    }
  });
  it('wrong parent NRML product, option token, lot quantity and GTT id fail schema',()=>{
    for(const edit of [
      {type:'SINGLE'},{product:'I'},{product:'MTF'},
      {instrument_token:'NSE_FO|OTHER'},{quantity:50},
      {gtt_order_id:'GTT-WRONG'}
    ]){
      const d=e();d.gtt=[parent(edit)];
      const r=audit(d);locked(r);
      assert.equal(r.state,'UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS');
    }
  });
  it('wrong ENTRY/STOPLOSS side, price, and non-entry trigger reject schema',()=>{
    const bad=[
      [entry({transaction_type:'SELL'}),stop()],
      [entry({trigger_type:'FOO'}),stop()],
      [entry({trigger_price:0}),stop()],
      [entry(),stop({transaction_type:'BUY'})],
      [entry(),stop({trigger_type:'BELOW'})],
      [entry(),stop({trigger_price:-1})],
      [entry(),stop({trailing_gap:NaN})]
    ];
    for(const rules of bad){
      const d=e();d.gtt=[parent({},rules)];
      const r=audit(d);locked(r);
      assert.equal(r.state,'UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS');
    }
  });
  it('broker original BUY must be COMPLETE, exact quantity/account product and exchange ID',()=>{
    for(const edit of [
      {status:'open'},{filled_quantity:50},{quantity:150},
      {pending_quantity:1},{product:'I'},{transaction_type:'SELL'},
      {exchange_order_id:'PH109-EXCHANGE-OTHER'},
      {instrument_token:'NSE_FO|OTHER'}, {order_id:'PH109-DIFFERENT'}
    ]){
      const d=e();d.originalBuyOrder={...buy(),...edit};
      const r=audit(d);locked(r);
      assert.equal(r.state,'ORIGINAL_BUY_CHILD_OR_IMMUTABLE_TRADE_CONFLICT');
    }
  });
  it('immutable trade ID replay, missing rows and wrong exchange ref reject BUY provenance',()=>{
    const variant=[
      [immutable()[0],immutable()[0]],
      [immutable()[0]],
      [{...immutable()[0],exchangeOrderId:'PH109-OTHER'},immutable()[1]],
      [{...immutable()[0],quantity:49},immutable()[1]],
      [{...immutable()[0],price:0},immutable()[1]]
    ];
    for(const trades of variant){
      const d=e();d.immutableBuyTrades=trades;
      const r=audit(d);locked(r);
      assert.equal(r.state,'ORIGINAL_BUY_CHILD_OR_IMMUTABLE_TRADE_CONFLICT');
    }
  });
  it('broker trade IDs, side, quantity and paise must exactly match immutable BUY',()=>{
    const bad=[
      {trade_id:'PH109-OTHER'},{exchange_order_id:'PH109-WRONG'},
      {order_id:'PH109-WRONG'},{transaction_type:'SELL'},
      {quantity:49},{average_price:90.01},{product:'I'}
    ];
    for(const x of bad){
      const d=e();d.originalBuyTrades=[{...brokerTrades()[0],...x},
        brokerTrades()[1]];
      const r=audit(d);locked(r);
      assert.equal(r.state,'ORIGINAL_BUY_CHILD_OR_IMMUTABLE_TRADE_CONFLICT');
    }
  });
  it('stable broker session performs exactly two GTT GETs and original BUY child/trade GETs',async()=>{
    const calls:string[]=[];const r=await reviewGttEntryOriginalNrmlBuyReadOnly(
      broker({},calls),scope,immutable());
    locked(r);
    assert.equal(r.state,'SCHEDULED_STOPLOSS_HAS_NO_EXCHANGE_CHILD');
    assert.deepEqual(calls,['gtt','buy','trades','gtt']);
  });
  it('wrong original GTT ENTRY child fails before any native BUY child/trade GET',async()=>{
    let native=0;
    const r=await reviewGttEntryOriginalNrmlBuyReadOnly(broker({
      getGttOrderDetails:async()=>[parent({},[
        entry({order_id:'PH109-UNRELATED-BUY'}),stop()])],
      getOrderDetails:async()=>{native++;return buy();},
      getOrderTrades:async()=>{native++;return brokerTrades();}
    }),scope,immutable());
    locked(r);
    assert.equal(r.state,'ORIGINAL_NRML_BUY_NOT_GENERATED_BY_GTT_ENTRY');
    assert.equal(native,0);
  });
  it('same-account token epoch switches during child or second GTT GET reject source',async()=>{
    for(const changeAt of ['BUY','FINAL_GTT']){
      let epoch=2,calls=0;
      const r=await reviewGttEntryOriginalNrmlBuyReadOnly(broker({
        getBrokerAuthEpoch:()=>epoch,
        getOrderTrades:async()=>{
          if(changeAt==='BUY')epoch++;
          return brokerTrades();
        },
        getGttOrderDetails:async()=>{
          if(++calls===2&&changeAt==='FINAL_GTT')epoch++;
          return [parent()];
        }
      }),scope,immutable());
      locked(r);
      assert.equal(r.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED');
    }
  });
  it('GTT trigger or child changed after broker GET is rejected instead of recombined',async()=>{
    let seen=0;
    const r=await reviewGttEntryOriginalNrmlBuyReadOnly(broker({
      getGttOrderDetails:async()=>{
        seen++;return [parent({},[entry(),
          stop({trigger_price:seen===1?92:85})])];
      }
    }),scope,immutable());
    locked(r);
    assert.equal(seen,2);
    assert.equal(r.state,'GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE');
    assert.ok(r.reasonCodes.includes(
      'GTT_PARENT_OR_ENTRY_STOPLOSS_RULE_CHANGED_BETWEEN_GETS'));
  });
  it('missing epoch or disconnected broker fails closed without GET',async()=>{
    let calls=0;
    for(const override of [
      {getBrokerAuthEpoch:()=>0},
      {getBrokerAuthEpoch:()=>NaN},
      {getLiveConnectionStatus:()=>({isConnected:false,userId:scope.expectedAccountId})},
      {getLiveConnectionStatus:()=>({isConnected:true,userId:'PH109-WRONG'})}
    ]){
      const r=await reviewGttEntryOriginalNrmlBuyReadOnly(broker({
        ...override,
        getGttOrderDetails:async()=>{calls++;return [parent()];}
      }),scope,immutable());
      locked(r);
      assert.equal(r.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED');
    }
    assert.equal(calls,0);
  });
  it('broker GET secret errors are reduced to fixed codes with no private payload',async()=>{
    const r=await reviewGttEntryOriginalNrmlBuyReadOnly(broker({
      getOrderDetails:async()=>{throw Error('PH109-BEARER-TOKEN');}
    }),scope,immutable());
    locked(r);
    assert.equal(r.state,'GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE');
  });
  it('production route reads immutable BUY ledger and is SUPERADMIN GET-only',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const at=app.indexOf("app.post('/api/ema15m/nrml-gtt-entry-provenance-review'");
    const end=app.indexOf('  // Phase95:',at);
    assert.ok(at>0&&end>at);
    const route=app.slice(at,end);
    for(const phrase of [
      'requireSuperAdmin','Cache-Control','readEmaJointBuySellEvidence',
      'originalBuyReceipt','originalBuyTrades',
      'reviewGttEntryOriginalNrmlBuyReadOnly',
      'getBrokerAuthEpoch','JSON.stringify(before)!==JSON.stringify(after)'
    ])assert.ok(route.includes(phrase),phrase);
    for(const phrase of ['placeOrder(','cancelOrder(','modifyOrder(',
      'placeGttOrder(','updateEmaLivePosition(','saveEmaLivePosition('])
      assert.equal(route.includes(phrase),false);
  });
});
