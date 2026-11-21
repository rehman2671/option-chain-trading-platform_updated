import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditNrmlGttChildLineage,reviewNrmlGttChildReadOnly,
  type GttChildReviewRequest,type GttChildReviewEvidence
} from '../../server/engine/ema15m/adaptiveNrmlGttChildLineageAudit.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const req:GttChildReviewRequest={
  expectedAccountId:'PH93-ACCOUNT',instrumentKey:'NSE_FO|PH93-CE',
  gttOrderId:'GTT-PH93-ONE',expectedLongQuantity:100,lotSize:50
};
const child=(fill=0,pending=100)=>({
  order_id:'PH93-CHILD',order_ref_id:req.gttOrderId,
  exchange_order_id:'PH93-EXCHANGE',instrument_token:req.instrumentKey,
  product:'D',transaction_type:'SELL',order_type:'MARKET',quantity:100,
  filled_quantity:fill,pending_quantity:pending,
  status:fill===100?'complete':fill>0?'partially filled':'open'
});
const trade=(id:string,quantity:number)=>({
  order_id:'PH93-CHILD',exchange_order_id:'PH93-EXCHANGE',
  instrument_token:req.instrumentKey,product:'D',
  transaction_type:'SELL',trade_id:id,quantity
});
const row=(net:unknown)=>({
  instrument_token:req.instrumentKey,product:'D',net_quantity:net
});
const gtt=()=>({
  gtt_order_id:req.gttOrderId,instrument_token:req.instrumentKey,
  product:'D',quantity:100,rules:[{
    strategy:'STOPLOSS',transaction_type:'SELL',
    status:'TRIGGERED',order_id:'PH93-CHILD'
  }]
});
const fixture=(fill=0,pending=100,net:unknown=100):GttChildReviewEvidence=>{
  const o=child(fill,pending);
  return {
    connected:true,connectedAccountId:req.expectedAccountId,
    gtt:[gtt()],gttOrders:[gtt()],order:o,orderBook:[{...o}],positions:[row(net)],
    trades:fill>0?[trade('TRADE-A',fill)]:[]
  };
};
const inspect=(e:GttChildReviewEvidence)=>
  auditNrmlGttChildLineage(req,e);
const locked=(r:ReturnType<typeof inspect>)=>{
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.independentExchangeChildAckCertified,false);
  assert.equal(r.fullAccountRiskReconciled,false);
  assert.equal(r.stopFillGuaranteed,false);
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.brokerWrites,0);
  assert.ok(!JSON.stringify(r).includes(req.expectedAccountId));
  assert.ok(!JSON.stringify(r).includes(req.instrumentKey));
  assert.ok(!JSON.stringify(r).includes('PH93-CHILD'));
};
describe('Phase93 NRML original-long minus SELL fill conservation and read ordering',()=>{
  it('0 child fills and original 100 net is coherent but never live-release evidence',()=>{
    const r=inspect(fixture());locked(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.brokerReportedNetPositionMatchesExecutedSellRemainder,true);
    assert.equal(r.brokerReportedChildFilledQuantity,0);
  });
  it('50 executed SELLs and 50 net remaining are broker-coherent but not protective stop certification',()=>{
    const r=inspect(fixture(50,50,50));locked(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.brokerReportedNetLongQuantityMatches,true);
    assert.equal(r.brokerReportedNetPositionMatchesExecutedSellRemainder,true);
    assert.equal(r.brokerReportedChildFilledQuantity,50);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('broker position still reports original 100 after 50 confirmed SELL: fail closed',()=>{
    const r=inspect(fixture(50,50,100));locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.equal(r.brokerReportedNetPositionMatchesExecutedSellRemainder,false);
    assert.ok(r.reasonCodes.includes(
      'BROKER_NRML_NET_QUANTITY_DISAGREES_WITH_EXECUTED_SELL_REMAINDER'));
  });
  it('broker position less than remaining SELL exposure cannot be called reconciled',()=>{
    const r=inspect(fixture(50,50,0));locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.equal(r.brokerReportedNetPositionMatchesExecutedSellRemainder,false);
  });
  it('fully filled 100 SELL with broker 0 remaining is only a matched exit observation, not active protection',()=>{
    const r=inspect(fixture(100,0,0));locked(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.brokerReportedNetPositionMatchesExecutedSellRemainder,true);
    assert.equal(r.brokerReportedChildFilledQuantity,100);
  });
  it('fully filled SELL with still-open 100 net is stale or contradictory',()=>{
    const r=inspect(fixture(100,0,100));locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('unknown, negative and coercible nonsensical net quantities cannot pass equality',()=>{
    for(const net of [undefined,null,'',false,'5e1','050','50.0',-50,NaN,Infinity]){
      const r=inspect(fixture(50,50,net));locked(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
      assert.ok(r.reasonCodes.includes(
        'BROKER_NRML_NET_POSITION_QUANTITY_UNKNOWN_OR_DUPLICATED'));
    }
  });
  it('two portfolio rows each 25 cannot sum to a documented unique 50 net',()=>{
    const e=fixture(50,50,50);
    e.positions=[row(25),row(25)];
    const r=inspect(e);locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('child order book filled quantity disagrees with exact order details even when position and trades match',()=>{
    const e=fixture(50,50,50);
    e.orderBook=[child(0,100)];
    const r=inspect(e);locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'CHILD_ORDER_DETAILS_CONTRADICT_CURRENT_BROKER_ORDER_BOOK'));
  });
  it('child order book pending quantity or status mismatch blocks reconciliation',()=>{
    const variations=[
      {pending_quantity:100},
      {status:'open'},
      {exchange_order_id:'PH93-OTHER-EXCHANGE'}
    ];
    for(const variation of variations){
      const e=fixture(50,50,50);
      e.orderBook=[{...child(50,50),...variation}];
      const r=inspect(e);locked(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
      assert.ok(r.reasonCodes.includes(
        'CHILD_ORDER_DETAILS_CONTRADICT_CURRENT_BROKER_ORDER_BOOK'));
    }
  });
  it('missing, nonnumeric or overfilled child amounts are not safe net-match candidates',()=>{
    for(const edit of [
      {filled_quantity:101,pending_quantity:0},
      {filled_quantity:null},
      {filled_quantity:-1},
      {pending_quantity:'0'},
      {filled_quantity:1.5}
    ]){
      const e=fixture();
      e.order={...child(),...edit};
      const r=inspect(e);locked(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    }
  });
  it('COMPLETE broker status with only partial SELL execution is contradictory',()=>{
    const e=fixture(50,50,50);
    e.order={...child(50,50),status:'complete'};
    e.orderBook=[{...child(50,50),status:'complete'}];
    const r=inspect(e);locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'CHILD_ORDER_STATUS_DISAGREES_WITH_EXECUTED_REMAINING_QUANTITY'));
  });
  it('PARTIALLY FILLED status with zero pending cannot be called active protection',()=>{
    const e=fixture(100,0,0);
    e.order={...child(100,0),status:'partially filled'};
    e.orderBook=[{...child(100,0),status:'partially filled'}];
    const r=inspect(e);locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'CHILD_ORDER_STATUS_DISAGREES_WITH_EXECUTED_REMAINING_QUANTITY'));
  });
  it('active OPEN broker child cannot have unexplained missing quantity',()=>{
    const e=fixture(0,75,100);
    const r=inspect(e);locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'NONTERMINAL_CHILD_FILLED_PLUS_PENDING_NOT_EQUAL_TO_ORDER_QUANTITY'));
  });
  it('nonzero SELL without exact unique trades never reconciles',()=>{
    const e=fixture(50,50,50);
    e.trades=[];
    const r=inspect(e);locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'BROKER_CHILD_EXECUTION_SUM_DOES_NOT_MATCH_ORDER_DETAILS'));
  });
  it('scheduled GTT without child demands untouched net position at original quantity',()=>{
    const e=fixture();
    e.gtt=[{...gtt(),rules:[{
      strategy:'STOPLOSS',transaction_type:'SELL',status:'SCHEDULED',order_id:null
    }]}];
    e.order=null;e.trades=null;e.positions=[row(50)];
    const r=inspect(e);locked(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'BROKER_NRML_NET_QUANTITY_DISAGREES_WITH_EXECUTED_SELL_REMAINDER'));
  });
  it('read-only broker fetches CURRENT positions after generated order and trade details resolve',async()=>{
    const events:string[]=[];
    let childFetched=false,tradesFetched=false;
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getGttOrderDetails:async(_:string)=>{events.push('gtt');return [gtt()];},
      getOrderBook:async()=>{events.push('book');return [child(50,50)];},
      getGttOrders:async()=>{events.push('gttList');return [gtt()];},
      getOrderDetails:async(_:string)=>{
        events.push('child');childFetched=true;return child(50,50);
      },
      getOrderTrades:async(_:string)=>{
        events.push('trades');tradesFetched=true;return [trade('TRADE-A',50)];
      },
      getVerifiedNrmlPositionRows:async()=>{
        assert.equal(childFetched,true);
        assert.equal(tradesFetched,true);
        events.push('positions');return [row(50)];
      },
      placeOrder:()=>{throw Error('REAL_ORDER_WRITE_FORBIDDEN');},
      cancelOrder:()=>{throw Error('CANCEL_WRITE_FORBIDDEN');}
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);locked(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(events[events.length-1],'positions');
  });
  it('post-child portfolio fetch error fails closed even if prior order and trade were coherent',async()=>{
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getGttOrderDetails:async(_:string)=>[gtt()],
      getOrderBook:async()=>[child()],
      getGttOrders:async()=>[gtt()],
      getOrderDetails:async(_:string)=>child(),
      getOrderTrades:async(_:string)=>[],
      getVerifiedNrmlPositionRows:async()=>{
        throw Error('private broker authentication expired');
      }
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);locked(r);
    assert.equal(r.status,'BROKER_SOURCE_INCOMPLETE');
    assert.ok(!JSON.stringify(r).includes('authentication expired'));
  });
});
