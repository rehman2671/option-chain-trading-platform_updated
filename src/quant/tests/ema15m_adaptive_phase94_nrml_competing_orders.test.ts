import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {auditNrmlCompetingOrders} from
  '../../server/engine/ema15m/adaptiveNrmlCompetingOrdersAudit.js';
import {
  auditNrmlGttChildLineage,reviewNrmlGttChildReadOnly,
  type GttChildReviewRequest,type GttChildReviewEvidence
} from '../../server/engine/ema15m/adaptiveNrmlGttChildLineageAudit.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const req:GttChildReviewRequest={
  expectedAccountId:'PH94-OWNER',instrumentKey:'NSE_FO|PH94-CE',
  gttOrderId:'GTT-PH94-PARENT',expectedLongQuantity:100,lotSize:50
};
const parent=()=>({
  gtt_order_id:req.gttOrderId,instrument_token:req.instrumentKey,
  product:'D',quantity:100,rules:[{
    strategy:'STOPLOSS',transaction_type:'SELL',
    status:'TRIGGERED',order_id:'PH94-CHILD'
  }]
});
const child=()=>({
  order_id:'PH94-CHILD',order_ref_id:req.gttOrderId,
  exchange_order_id:'PH94-EXCHANGE',instrument_token:req.instrumentKey,
  product:'D',transaction_type:'SELL',order_type:'MARKET',
  quantity:100,filled_quantity:0,pending_quantity:100,status:'open'
});
const otherSell=()=>({
  order_id:'PH94-OTHER-SELL',instrument_token:req.instrumentKey,
  product:'D',transaction_type:'SELL',order_type:'SL-M',
  status:'open',quantity:100,filled_quantity:0,pending_quantity:100
});
const sibling=()=>({
  gtt_order_id:'GTT-PH94-OTHER',instrument_token:req.instrumentKey,
  product:'D',quantity:100,rules:[{
    strategy:'STOPLOSS',transaction_type:'SELL',
    status:'SCHEDULED',order_id:null
  }]
});
const fixture=():GttChildReviewEvidence=>({
  connected:true,connectedAccountId:req.expectedAccountId,
  gtt:[parent()],gttOrders:[parent()],
  order:child(),trades:[],orderBook:[child()],
  positions:[{instrument_token:req.instrumentKey,
    product:'D',net_quantity:'100'}]
});
const investigate=(e:GttChildReviewEvidence)=>
  auditNrmlGttChildLineage(req,e);
const audit=(e:GttChildReviewEvidence)=>
  auditNrmlCompetingOrders({
    instrumentKey:req.instrumentKey,parentGttId:req.gttOrderId,
    generatedChildOrderId:'PH94-CHILD',expectedLongQuantity:100,
    orderBook:e.orderBook,gttOrders:e.gttOrders
  });
const neverTrade=(r:ReturnType<typeof investigate>)=>{
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.independentExchangeChildAckCertified,false);
  assert.equal(r.fullAccountRiskReconciled,false);
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.stopFillGuaranteed,false);
  assert.equal(r.brokerWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  const s=JSON.stringify(r);
  for(const secret of [req.expectedAccountId,req.instrumentKey,
    req.gttOrderId,'PH94-CHILD','PH94-OTHER-SELL',
    'GTT-PH94-OTHER'])assert.ok(!s.includes(secret));
};
describe('Phase94 full account source-list census for competing same-option orders',()=>{
  it('only linked child and one parent has no visible competitors but never authorises live NRML',()=>{
    const e=fixture(),r=investigate(e);neverTrade(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.otherSellOrderCandidates,0);
    assert.equal(r.otherGttSellRuleCandidates,0);
    assert.equal(r.unresolvedSameContractBuyOrders,0);
    assert.equal(r.parentGttListedExactlyOnce,true);
    assert.equal(audit(e).status,'NO_VISIBLE_COMPETING_BROKER_ACTIVITY_NOT_CERTIFIED');
  });
  it('separate OPEN exchange SELL may double-exit original long despite perfect linked child',()=>{
    const e=fixture();e.orderBook=[child(),otherSell()];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.equal(r.otherSellOrderCandidates,1);
    assert.ok(r.reasonCodes.includes('OTHER_BROKER_SELL_CAN_EXECUTE_OR_CANCEL_PENDING'));
  });
  it('CANCEL PENDING second SELL is not terminal cancelled and remains a duplicate risk',()=>{
    const e=fixture();e.orderBook=[child(),{...otherSell(),status:'cancel pending'}];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.equal(r.otherSellOrderCandidates,1);
  });
  it('historically cancelled extra SELL with explicit zero fills is not active competition',()=>{
    const e=fixture();e.orderBook=[child(),{
      ...otherSell(),status:'cancelled',filled_quantity:0,pending_quantity:0
    }];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.otherSellOrderCandidates,0);
  });
  it('cancelled SELL that partially filled earlier still changes exposure and is a conflict',()=>{
    const e=fixture();e.orderBook=[child(),{
      ...otherSell(),status:'cancelled',filled_quantity:50,pending_quantity:0
    }];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes('OTHER_SELL_EXECUTIONS_NOT_IN_CHILD_NET_CONSERVATION'));
  });
  it('completed unrelated SELL on same option is an unknown extra exit even if current net coincidentally matches',()=>{
    const e=fixture();e.orderBook=[child(),{
      ...otherSell(),status:'complete',filled_quantity:50,pending_quantity:0
    }];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.otherSellOrderCandidates,1);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('another pending BUY may change net position after this snapshot',()=>{
    const e=fixture();e.orderBook=[child(),{
      ...otherSell(),order_id:'PH94-OTHER-BUY',transaction_type:'BUY',
      status:'open'
    }];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.unresolvedSameContractBuyOrders,1);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('historical completed BUY can be original entry, not evidence a new BUY is pending',()=>{
    const e=fixture();e.orderBook=[child(),{
      ...otherSell(),order_id:'PH94-ORIGINAL-BUY',
      transaction_type:'BUY',status:'complete',filled_quantity:100
    }];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.unresolvedSameContractBuyOrders,0);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
  });
  it('separate dormant SCHEDULED GTT SELL on same contract is not visible in normal order book',()=>{
    const e=fixture();e.gttOrders=[parent(),sibling()];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.otherGttSellRuleCandidates,1);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes('OTHER_ACTIVE_GTT_SELL_MAY_TRIGGER'));
  });
  it('separate triggered GTT SELL can generate another child and must block',()=>{
    const e=fixture();const g=sibling();g.rules[0].status='TRIGGERED';
    e.gttOrders=[parent(),g];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.otherGttSellRuleCandidates,1);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('completed sibling GTT SELL is an unaccounted possible extra exit',()=>{
    const e=fixture();const g=sibling();g.rules[0].status='COMPLETED';
    e.gttOrders=[parent(),g];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.otherGttSellRuleCandidates,1);
    assert.ok(r.reasonCodes.includes('OTHER_COMPLETED_GTT_SELL_NOT_IN_CHILD_LEDGER'));
  });
  it('cancelled dormant sibling GTT SELL is not a current SELL competitor',()=>{
    const e=fixture();const g=sibling();g.rules[0].status='CANCELLED';
    e.gttOrders=[parent(),g];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.otherGttSellRuleCandidates,0);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
  });
  it('unresolved sibling GTT BUY could increase the net long after reconciled SELL',()=>{
    const e=fixture();const g=sibling();g.rules[0].transaction_type='BUY';
    e.gttOrders=[parent(),g];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.unresolvedSameContractBuyOrders,1);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('missing or duplicated parent in full-account GTT list never proves unique protection',()=>{
    for(const list of [[],[parent(),parent()]]){
      const e=fixture();e.gttOrders=list;
      const r=investigate(e);neverTrade(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
      assert.equal(r.parentGttListedExactlyOnce,false);
    }
  });
  it('exact parent detail and full GTT list disagreeing on parent quantity is unresolved',()=>{
    const e=fixture();e.gttOrders=[{...parent(),quantity:50}];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes('PARENT_GTT_LIST_QUANTITY_MISMATCH'));
  });
  it('missing full GTT list is not equivalent to no extra protection',()=>{
    const e=fixture();e.gttOrders=null;
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'BROKER_SOURCE_INCOMPLETE');
    assert.equal(audit(e).status,'SOURCE_INCOMPLETE');
  });
  it('unknown order status, unknown filled quantity or malformed row fail closed',()=>{
    for(const candidate of [
      {...otherSell(),status:'BROKER-NEW-STATUS'},
      {...otherSell(),status:'cancelled',filled_quantity:null},
      {order_id:'ANON',status:'open'}
    ]){
      const e=fixture();e.orderBook=[child(),candidate];
      const r=investigate(e);neverTrade(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    }
  });
  it('same option other broker product I order is a reconciliation conflict',()=>{
    const e=fixture();e.orderBook=[child(),{
      ...otherSell(),product:'I'
    }];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('same account other contract can be relevant to capital risk but is outside this exact-option audit',()=>{
    const e=fixture();e.orderBook=[child(),{
      ...otherSell(),instrument_token:'NSE_FO|OTHER-CE'
    }];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.fullAccountRiskReconciled,false);
  });
  it('sibling GTT unknown leg status and malformed rule fail closed',()=>{
    for(const rules of [
      [{strategy:'STOPLOSS',transaction_type:'SELL',status:'VENDOR_UNKNOWN'}],
      [null]
    ]){
      const e=fixture();e.gttOrders=[parent(),{...sibling(),rules}];
      const r=investigate(e);neverTrade(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    }
  });
  it('SCHEDULED parent GTT with no child and an additional dormant GTT is not safe to assume one stop',()=>{
    const e=fixture();const g=parent();
    g.rules[0].status='SCHEDULED';g.rules[0].order_id=null as unknown as string;
    e.gtt=[g];e.gttOrders=[g,sibling()];e.order=null;e.trades=null;e.orderBook=[];
    const r=investigate(e);neverTrade(r);
    assert.equal(r.scheduledWithoutGeneratedOrder,true);
    assert.equal(r.otherGttSellRuleCandidates,1);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('read-only broker checks full GTT list before child details, never sends BUY/SELL/cancel',async()=>{
    const calls:string[]=[];
    const broker={
      getBrokerAuthEpoch:()=>1,
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getGttOrderDetails:async(_:string)=>{calls.push('parent');return [parent()];},
      getOrderBook:async()=>{calls.push('orders');return [child()];},
      getGttOrders:async()=>{calls.push('gttList');return [parent()];},
      getOrderDetails:async(_:string)=>{calls.push('child');return child();},
      getOrderTrades:async(_:string)=>{calls.push('trades');return [];},
      getVerifiedNrmlPositionRows:async()=>{calls.push('positions');return fixture().positions;},
      placeOrder:()=>{throw Error('ORDER_WRITE_FORBIDDEN');},
      cancelOrder:()=>{throw Error('CANCEL_WRITE_FORBIDDEN');},
      placeGtt:()=>{throw Error('GTT_WRITE_FORBIDDEN');}
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);neverTrade(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.deepEqual(calls.slice(0,3).sort(),['gttList','orders','parent']);
    assert.equal(calls[calls.length-1],'positions');
  });
  it('full GTT list transport failure is unknown, not evidence no duplicates',async()=>{
    const broker={
      getBrokerAuthEpoch:()=>1,
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getGttOrderDetails:async(_:string)=>[parent()],
      getOrderBook:async()=>[child()],
      getGttOrders:async()=>{throw Error('API_401_SECRET_MUST_NOT_LEAK');},
      getOrderDetails:async(_:string)=>child(),
      getOrderTrades:async(_:string)=>[],
      getVerifiedNrmlPositionRows:async()=>fixture().positions
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);neverTrade(r);
    assert.equal(r.status,'BROKER_SOURCE_INCOMPLETE');
    assert.ok(!JSON.stringify(r).includes('API_401_SECRET'));
  });
});
