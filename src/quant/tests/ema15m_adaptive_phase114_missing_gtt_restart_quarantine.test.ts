import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditSingleSellGttRestartQuarantine,
  reviewSingleSellGttRestartTwoPassReadOnly,
  type RestartGttBroker,type RestartGttScope,
  type RestartGttCensus,type RestartGttReport
} from '../../server/engine/ema15m/adaptiveNrmlMissingGttRestartQuarantine.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const scope:RestartGttScope={
  expectedAccountId:'PH114-PRIVATE-ACCOUNT',
  instrumentKey:'NSE_FO|PH114-OPTION-PRIVATE',
  originalBuyOrderId:'PH114-BUY',
  gttOrderId:'GTT-PH114-SELL-ENTRY',
  originalLongQuantity:100,lotSize:50
};
const position=(n:unknown=100)=>({
  instrument_token:scope.instrumentKey,product:'D',net_quantity:n
});
const buy=()=>({
  order_id:scope.originalBuyOrderId,
  instrument_token:scope.instrumentKey,
  product:'D',transaction_type:'BUY',status:'complete',
  filled_quantity:100
});
const orphan=(status='open',change:Record<string,unknown>={})=>({
  order_id:'PH114-ORPHAN-SELL',order_ref_id:scope.gttOrderId,
  instrument_token:scope.instrumentKey,
  product:'D',transaction_type:'SELL',
  status,filled_quantity:0,...change
});
const rule=(change:Record<string,unknown>={})=>({
  strategy:'ENTRY',transaction_type:'SELL',
  trigger_type:'BELOW',trigger_price:92,
  status:'SCHEDULED',order_id:null,...change
});
const parent=(change:Record<string,unknown>={},rules:unknown[]=[rule()])=>({
  gtt_order_id:scope.gttOrderId,type:'SINGLE',product:'D',
  instrument_token:scope.instrumentKey,quantity:100,
  rules,...change
});
const absent=():RestartGttCensus=>({
  exactGtt:[],allGtts:[],orderBook:[],positions:[position()]
});
const existing=():RestartGttCensus=>{
  const p=parent();
  return {exactGtt:[p],allGtts:[p],
    orderBook:[buy()],positions:[position()]};
};
const audit=(data:RestartGttCensus=absent(),s=scope)=>
  auditSingleSellGttRestartQuarantine(s,data);
const broker=(overrides:Partial<RestartGttBroker>={},
 calls:string[]=[]):RestartGttBroker=>({
  getLiveConnectionStatus:()=>({isConnected:true,userId:scope.expectedAccountId}),
  getBrokerAuthEpoch:()=>1,
  getGttOrderDetails:async()=>{calls.push('exact');return [];},
  getGttOrders:async()=>{calls.push('allGtt');return [];},
  getOrderBook:async()=>{calls.push('book');return [];},
  getVerifiedNrmlPositionRows:async()=>{
    calls.push('net');return [position()];
  },
  ...overrides
});
function quarantined(r:RestartGttReport):void{
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.currentDayOrderBookExcludesHistoricalCompletedOrders,true);
  assert.equal(r.missingCompletedGttCannotBeAssumedCancelledOrFilled,true);
  assert.equal(r.brokerReportedFlatDoesNotSettleDurableLedger,true);
  for(const flag of [
    'duplicateSellRetryAuthorized','cancelOrReplaceStopAuthorized',
    'liveNrmlBuyAuthorized','nativeExchangeProtectiveStopCertified',
    'overnightStopCoverageCertified','closedPositionWriteAuthorized',
    'realisedPnlWriteAuthorized','accountCapitalAndMarginReconciled',
    'independentlySignedBrokerHistoricalTradesVerified'
  ] as const)assert.equal(r[flag],false,flag);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    status:'OPEN',productType:'NRML'
  }),false);
  for(const secret of [
    scope.expectedAccountId,scope.instrumentKey,scope.originalBuyOrderId,
    scope.gttOrderId,'PH114-ORPHAN-SELL','PH114-BEARER-TOKEN'
  ])assert.equal(JSON.stringify(r).includes(secret),false);
}
describe('Phase114 after-restart missing SINGLE SELL GTT quarantine, zero retry',()=>{
  it('missing completed/cancelled GTT with still-long net blocks instead of duplicate SELL',()=>{
    const r=audit();quarantined(r);
    assert.equal(r.state,'MISSING_GTT_PARENT_REQUIRES_BROKER_HISTORY_MANUAL_REVIEW');
    assert.equal(r.brokerReportedCurrentNrmlNet,100);
    assert.equal(r.brokerReportedGttPresent,false);
    assert.equal(r.duplicateSellRetryAuthorized,false);
  });
  it('even broker flat current net cannot automatically close durable ledger',()=>{
    const e=absent();e.positions=[position(0)];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'MISSING_GTT_PARENT_REQUIRES_BROKER_HISTORY_MANUAL_REVIEW');
    assert.equal(r.brokerReportedCurrentNrmlNet,0);
    assert.equal(r.closedPositionWriteAuthorized,false);
    assert.ok(r.reasonCodes.includes(
      'BROKER_REPORTED_FLAT_NOT_DURABLE_EXIT_RECEIPT'));
  });
  it('missing parent and orphan SELL child requires trade/order history',()=>{
    const e=absent();e.orderBook=[orphan()];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'MISSING_GTT_ORPHAN_SELL_CHILD_MANUAL_REVIEW');
    assert.equal(r.brokerReportedOrphanGttSellChildCandidates,1);
    assert.equal(r.brokerReportedGeneratedSellChildReference,false);
  });
  it('an orphan SELL with some fills remains unverified and cannot infer net',()=>{
    const e=absent();e.positions=[position(50)];
    e.orderBook=[orphan('partially filled',{filled_quantity:50})];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'MISSING_GTT_ORPHAN_SELL_CHILD_MANUAL_REVIEW');
    assert.equal(r.brokerReportedCurrentNrmlNet,50);
    assert.equal(r.realisedPnlWriteAuthorized,false);
  });
  it('duplicate orphan SELL child attempts could short the long',()=>{
    const e=absent();e.orderBook=[
      orphan(),orphan('open',{order_id:'PH114-SECOND-ORPHAN'})];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED');
  });
  it('a valid scheduled GTT without child is broker-side, not overnight stop ACK',()=>{
    const r=audit(existing());quarantined(r);
    assert.equal(r.state,'SCHEDULED_GTT_NO_GENERATED_CHILD_RESTART_UNPROTECTED');
    assert.equal(r.brokerReportedGttPresent,true);
    assert.equal(r.brokerReportedGeneratedSellChildReference,false);
  });
  it('scheduled 100-unit exit after net shrank to 50 is oversell conflict',()=>{
    const e=existing();e.positions=[position(50)];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED');
    assert.ok(r.reasonCodes.includes(
      'SCHEDULED_GTT_SELL_QUANTITY_EXCEEDS_CURRENT_NRML_LONG'));
  });
  it('triggered parent child ID is not an executed SELL receipt',()=>{
    const p=parent({},[rule({
      status:'TRIGGERED',order_id:'PH114-GENERATED-SELL'
    })]);
    const e=existing();e.exactGtt=[p];e.allGtts=[p];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'GENERATED_SELL_CHILD_REQUIRES_TRADE_NET_AUDIT');
    assert.equal(r.brokerReportedGeneratedSellChildReference,true);
    assert.equal(r.closedPositionWriteAuthorized,false);
  });
  it('GTT rule status failed/cancelled/expired/pending is manual history',()=>{
    for(const status of ['CANCELLED','FAILED','EXPIRED','PENDING']){
      const p=parent({},[rule({status})]);
      const e=existing();e.exactGtt=[p];e.allGtts=[p];
      const r=audit(e);quarantined(r);
      assert.equal(r.state,'GTT_TERMINAL_OR_UNKNOWN_STATE_REQUIRES_BROKER_HISTORY');
    }
  });
  it('scheduled parent and orphan generated child is impossible to trust',()=>{
    const e=existing();e.orderBook=[buy(),orphan()];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT');
  });
  it('full GTT list with parent but exact GET missing is inconsistent',()=>{
    const e=absent();e.allGtts=[parent()];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT');
  });
  it('duplicate selected GTT, other same-option GTT or mismatched type cannot pass',()=>{
    for(const e of [
      {...existing(),exactGtt:[parent(),parent()]},
      {...existing(),allGtts:[parent(),parent()]},
      {...existing(),allGtts:[parent(),parent({
        gtt_order_id:'GTT-PH114-OTHER'
      })]},
      {...existing(),exactGtt:[parent({type:'MULTIPLE'})]}
    ]){
      const r=audit(e);quarantined(r);
      assert.ok(['GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
        'COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED'].includes(r.state),r.state);
    }
  });
  it('other active BUY, SELL or independent filled SELL block restart',()=>{
    for(const extra of [
      {order_id:'PH114-OTHER-BUY',transaction_type:'BUY',
        status:'open',filled_quantity:0},
      {order_id:'PH114-OTHER-SELL',transaction_type:'SELL',
        status:'open',filled_quantity:0},
      {order_id:'PH114-OTHER-SELL',transaction_type:'SELL',
        status:'complete',filled_quantity:50}
    ]){
      const e=absent();e.orderBook=[{
        instrument_token:scope.instrumentKey,product:'D',...extra
      }];
      const r=audit(e);quarantined(r);
      assert.equal(r.state,'COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED');
    }
  });
  it('current-day terminal zero-fill unrelated SELL does not prove past orders',()=>{
    const e=absent();e.orderBook=[{
      order_id:'PH114-OLD-CANCELLED',
      instrument_token:scope.instrumentKey,
      product:'D',transaction_type:'SELL',status:'cancelled',
      filled_quantity:0
    }];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'MISSING_GTT_PARENT_REQUIRES_BROKER_HISTORY_MANUAL_REVIEW');
    assert.equal(r.brokerReportedOtherSameContractOrderCandidates,1);
  });
  it('missing, malformed, duplicate, short and other-product broker net block',()=>{
    for(const positions of [
      [],[position(100),position(100)],[position(-10)],
      [position('1e2')],[position(75)],[position(150)],
      [position(100),{...position(50),product:'I'}]
    ]){
      const e=absent();e.positions=positions;
      const r=audit(e);quarantined(r);
      assert.equal(r.state,'BROKER_NRML_NET_MISSING_OR_CONFLICT');
      assert.equal(r.brokerReportedCurrentNrmlNet,null);
    }
  });
  it('null or malformed account-wide broker GET is not clean empty state',()=>{
    for(const which of ['exactGtt','allGtts','positions','orderBook'] as const){
      const e=absent();(e as any)[which]=null;
      const r=audit(e);quarantined(r);
      assert.equal(r.state,'BROKER_NATIVE_GET_SOURCE_INCOMPLETE');
    }
    const e=absent();e.orderBook=[null];
    const r=audit(e);quarantined(r);
    assert.equal(r.state,'BROKER_NATIVE_GET_SOURCE_INCOMPLETE');
  });
  it('two stable GET rounds are still purely read-only restart quarantine',async()=>{
    const calls:string[]=[];
    const r=await reviewSingleSellGttRestartTwoPassReadOnly(
      broker({},calls),scope);
    quarantined(r);
    assert.equal(r.state,'MISSING_GTT_PARENT_REQUIRES_BROKER_HISTORY_MANUAL_REVIEW');
    assert.equal(r.brokerReadPasses,2);
    assert.equal(calls.length,8);
  });
  it('GTT absent first pass but triggered second pass is never stable',async()=>{
    let reads=0;
    const p=parent({},[rule({
      status:'TRIGGERED',order_id:'PH114-GENERATED-SELL'
    })]);
    const r=await reviewSingleSellGttRestartTwoPassReadOnly(broker({
      getGttOrderDetails:async()=>++reads===1?[]:[p],
      getGttOrders:async()=>reads===1?[]:[p]
    }),scope);
    quarantined(r);
    assert.equal(r.state,'RESTART_BROKER_ACCOUNT_SNAPSHOT_CHANGED');
    assert.equal(r.brokerReadPasses,2);
  });
  it('GTT still absent but net changes between rounds is drift not settlement',async()=>{
    let count=0;
    const r=await reviewSingleSellGttRestartTwoPassReadOnly(broker({
      getVerifiedNrmlPositionRows:async()=>[position(++count===1?100:0)]
    }),scope);
    quarantined(r);
    assert.equal(r.state,'RESTART_BROKER_ACCOUNT_SNAPSHOT_CHANGED');
  });
  it('account switch or auth rotation between/within rounds blocks',async()=>{
    let epoch=1;
    const r=await reviewSingleSellGttRestartTwoPassReadOnly(broker({
      getBrokerAuthEpoch:()=>epoch,
      getGttOrders:async()=>{epoch++;return [];}
    }),scope);
    quarantined(r);
    assert.equal(r.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED');
  });
  it('wrong disconnected broker/token epoch fails before any GET',async()=>{
    for(const change of [
      {getBrokerAuthEpoch:()=>0},
      {getLiveConnectionStatus:()=>({
        isConnected:false,userId:scope.expectedAccountId
      })},
      {getLiveConnectionStatus:()=>({isConnected:true,userId:'OTHER'})}
    ]){
      let calls=0;
      const r=await reviewSingleSellGttRestartTwoPassReadOnly(broker({
        ...change,getGttOrderDetails:async()=>{calls++;return [];}
      }),scope);
      quarantined(r);
      assert.equal(r.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED');
      assert.equal(calls,0);
    }
  });
  it('broker GET failure and secret errors return static codes without leakage',async()=>{
    const r=await reviewSingleSellGttRestartTwoPassReadOnly(broker({
      getOrderBook:async()=>{throw Error('PH114-BEARER-TOKEN');}
    }),scope);
    quarantined(r);
    assert.equal(r.state,'BROKER_NATIVE_GET_SOURCE_INCOMPLETE');
  });
  it('invalid account, GTT and original long rejects before broker reads',async()=>{
    for(const edit of [
      {expectedAccountId:''},{gttOrderId:'WRONG'},
      {originalLongQuantity:75},{lotSize:0},
      {instrumentKey:'NSE_EQ|STOCK'}
    ]){
      let calls=0;
      const r=await reviewSingleSellGttRestartTwoPassReadOnly(broker({
        getGttOrderDetails:async()=>{calls++;return [];}
      }),{...scope,...edit});
      quarantined(r);
      assert.equal(r.state,'INVALID_SCOPE');assert.equal(calls,0);
    }
  });
  it('SUPERADMIN restart review binds immutable original BUY and never writes',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const at=app.indexOf("app.post('/api/ema15m/nrml-single-sell-gtt-restart-quarantine-review'");
    const end=app.indexOf('  // Phase95:',at);
    assert.ok(at>0&&end>at);
    const src=app.slice(at,end);
    for(const v of [
      'requireSuperAdmin','no-store','getOpenEmaLivePositions',
      'readEmaJointBuySellEvidence','immutableOriginalDebitMatchesReceipt',
      'reviewSingleSellGttRestartTwoPassReadOnly','getBrokerAuthEpoch',
      'JSON.stringify(before)!==JSON.stringify(after)'
    ])assert.ok(src.includes(v),v);
    for(const v of [
      'placeOrder(','cancelOrder(','modifyOrder(','placeGttOrder(',
      'saveEmaLivePosition(','updateEmaLivePosition(','squareOff('
    ])assert.equal(src.includes(v),false,v);
  });
});
