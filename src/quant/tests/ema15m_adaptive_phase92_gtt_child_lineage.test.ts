import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditNrmlGttChildLineage,reviewNrmlGttChildReadOnly,
  type GttChildReviewRequest,type GttChildReviewEvidence
} from '../../server/engine/ema15m/adaptiveNrmlGttChildLineageAudit.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const req:GttChildReviewRequest={
  expectedAccountId:'TEST-BROKER-OWNER',
  instrumentKey:'NSE_FO|TEST-CE',
  gttOrderId:'GTT-TEST-001',
  expectedLongQuantity:100,lotSize:50
};
const gtt=()=>({
  gtt_order_id:req.gttOrderId,instrument_token:req.instrumentKey,
  product:'D',quantity:100,
  rules:[{strategy:'STOPLOSS',transaction_type:'SELL',status:'TRIGGERED',
    order_id:'CHILD-ORDER-1'}]
});
const order=()=>({
  order_id:'CHILD-ORDER-1',order_ref_id:req.gttOrderId,
  exchange_order_id:'EXCHANGE-ORDER-1',
  instrument_token:req.instrumentKey,product:'D',transaction_type:'SELL',
  order_type:'MARKET',quantity:100,filled_quantity:0,
  pending_quantity:100,status:'open'
});
const position=()=>({
  instrument_token:req.instrumentKey,product:'D',net_quantity:'100'
});
const fixture=():GttChildReviewEvidence=>({
  connected:true,connectedAccountId:req.expectedAccountId,
  gtt:[gtt()],gttOrders:[gtt()],order:order(),trades:[],
  positions:[position()],orderBook:[order()]
});
const review=(e:GttChildReviewEvidence,request=req)=>
  auditNrmlGttChildLineage(request,e);
const neverRelease=(r:ReturnType<typeof review>)=>{
  assert.equal(r.independentExchangeChildAckCertified,false);
  assert.equal(r.stopFillGuaranteed,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.fullAccountRiskReconciled,false);
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.brokerWrites,0);
  const s=JSON.stringify(r);
  assert.ok(!s.includes(req.expectedAccountId));
  assert.ok(!s.includes(req.instrumentKey));
  assert.ok(!s.includes(req.gttOrderId));
  assert.ok(!s.includes('CHILD-ORDER-1'));
  assert.ok(!s.includes('EXCHANGE-ORDER-1'));
};
describe('Phase92 GTT STOPLOSS to exchange child order lineage (read-only)',()=>{
  it('all broker-reported child IDs and trade totals align but cannot certify protection',()=>{
    const r=review(fixture());neverRelease(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.exactGttToChildReferenceMatched,true);
    assert.equal(r.brokerReportedExchangeOrderIdObserved,true);
    assert.equal(r.generatedChildOrderIdObserved,true);
    assert.equal(r.brokerReportedNetLongQuantityMatches,true);
    assert.equal(r.brokerReportedChildFilledQuantity,0);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('SCHEDULED parent GTT has no generated exchange child yet',()=>{
    const e=fixture();
    e.gtt=[{...gtt(),rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
      status:'SCHEDULED',order_id:null}]}];
    e.gttOrders=[e.gtt[0]]; // full GTT census must agree with selected parent
    // A scheduled, untriggered parent cannot already have a generated
    // active SELL in the full broker book.
    e.orderBook=[];
    e.order=null;e.trades=null;
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'SCHEDULED_GTT_NO_EXCHANGE_CHILD');
    assert.equal(r.scheduledWithoutGeneratedOrder,true);
    assert.equal(r.generatedChildOrderIdObserved,false);
    assert.equal(r.brokerReportedExchangeOrderIdObserved,false);
  });
  it('GTT parent quantity is authoritative; absent or incorrect parent quantity conflicts',()=>{
    for(const quantity of [undefined,0,50,NaN]){
      const e=fixture();e.gtt=[{...gtt(),quantity}];
      const r=review(e);neverRelease(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    }
  });
  it('GTT target SELL cannot be substituted for STOPLOSS protective child',()=>{
    const e=fixture();
    e.gtt=[{...gtt(),rules:[{strategy:'TARGET',transaction_type:'SELL',
      status:'TRIGGERED',order_id:'CHILD-ORDER-1'}]}];
    const r=review(e);neverRelease(r);
    assert.equal(r.parentGttFound,false);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('two STOPLOSS SELL rules on same GTT cannot be silently netted',()=>{
    const e=fixture();const g=gtt();g.rules.push({...g.rules[0]});
    e.gtt=[g];
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('GTT generated order id mismatches child order id: reject lineage',()=>{
    const e=fixture();e.order={...order(),order_id:'WRONG-ORDER'};
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.equal(r.exactGttToChildReferenceMatched,false);
  });
  it('child order_ref_id unrelated to GTT parent is not authenticated linkage',()=>{
    const e=fixture();e.order={...order(),order_ref_id:'GTT-OTHER-PARENT'};
    const r=review(e);neverRelease(r);
    assert.equal(r.exactGttToChildReferenceMatched,false);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('missing exchange order ID cannot count as a venue ACK candidate',()=>{
    const e=fixture();e.order={...order(),exchange_order_id:null};
    const r=review(e);neverRelease(r);
    assert.equal(r.brokerReportedExchangeOrderIdObserved,false);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
  });
  it('wrong side, product, instrument, and quantity each reject child linkage',()=>{
    const edits=[
      {transaction_type:'BUY'},{product:'I'},
      {instrument_token:'NSE_FO|OTHER-PE'},{quantity:50}
    ];
    for(const edit of edits){
      const e=fixture();e.order={...order(),...edit};
      const r=review(e);neverRelease(r);
      assert.equal(r.exactGttToChildReferenceMatched,false);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    }
  });
  it('child CANCEL PENDING, REJECTED and CANCELLED are not active protection',()=>{
    for(const status of ['cancel pending','rejected','cancelled']){
      const e=fixture();e.order={...order(),status};
      const r=review(e);neverRelease(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
      assert.ok(r.reasonCodes.includes('GENERATED_CHILD_STOP_NOT_VALID_ACTIVE_PROTECTION'));
    }
  });
  it('order book contradictory parent or duplicated order row blocks linkage',()=>{
    for(const book of [
      [{...order(),order_ref_id:'GTT-WRONG'}],
      [order(),order()],
      [{...order(),quantity:50}]
    ]){
      const e=fixture();e.orderBook=book;
      const r=review(e);neverRelease(r);
      assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
      assert.ok(r.reasonCodes.includes('CHILD_ORDER_DETAILS_CONTRADICT_CURRENT_BROKER_ORDER_BOOK'));
    }
  });
  it('filled plus pending exceeding quantity is rejected',()=>{
    const e=fixture();e.order={...order(),filled_quantity:50,pending_quantity:100};
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes('CHILD_FILLED_PENDING_QUANTITY_INCONSISTENT'));
  });
  it('broker-reported partial fill without matching trades remains unresolved',()=>{
    const e=fixture();e.order={...order(),filled_quantity:50,pending_quantity:50};
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes('BROKER_CHILD_EXECUTION_SUM_DOES_NOT_MATCH_ORDER_DETAILS'));
  });
  it('single broker trade can reconcile a partial fill but not release NRML',()=>{
    const e=fixture();e.order={...order(),filled_quantity:50,pending_quantity:50};
    e.trades=[{order_id:'CHILD-ORDER-1',order_ref_id:req.gttOrderId,
      exchange_order_id:'EXCHANGE-ORDER-1',instrument_token:req.instrumentKey,
      product:'D',transaction_type:'SELL',trade_id:'TRADE-1',quantity:50}];
    // Phase93: 50 units executed from the original 100 long; present
    // broker net must be 50, NOT the original opening 100.
    e.positions=[{...position(),net_quantity:'50'}];
    e.orderBook=[{...order(),filled_quantity:50,pending_quantity:50}];
    const r=review(e);neverRelease(r);
    assert.equal(r.brokerReportedNetPositionMatchesExecutedSellRemainder,true);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.brokerReportedChildFilledQuantity,50);
  });
  it('duplicated trade ID and overcounted executions reject broker fill',()=>{
    const e=fixture();e.order={...order(),filled_quantity:100,pending_quantity:0};
    const t={order_id:'CHILD-ORDER-1',exchange_order_id:'EXCHANGE-ORDER-1',
      instrument_token:req.instrumentKey,product:'D',
      transaction_type:'SELL',trade_id:'TRADE-1',quantity:50};
    e.trades=[t,t];
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.ok(r.reasonCodes.includes('BROKER_TRADE_BOOK_CONTRADICTS_LINKED_CHILD_ORDER'));
  });
  it('current net position mismatch blocks any potential child lineage assessment',()=>{
    const e=fixture();e.positions=[{...position(),net_quantity:'50'}];
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'CHILD_LINEAGE_CONFLICT');
    assert.equal(r.brokerReportedNetLongQuantityMatches,false);
  });
  it('missing GTT, positions or orderbook never creates an empty healthy snapshot',()=>{
    for(const field of ['gtt','positions','orderBook'] as const){
      const e=fixture();
      (e as unknown as Record<string,unknown>)[field]=null;
      const r=review(e);neverRelease(r);
      assert.equal(r.status,'BROKER_SOURCE_INCOMPLETE');
    }
  });
  it('triggered child but missing order details or trade list remains incomplete',()=>{
    for(const field of ['order','trades'] as const){
      const e=fixture();
      (e as unknown as Record<string,unknown>)[field]=null;
      const r=review(e);neverRelease(r);
      assert.equal(r.status,'BROKER_SOURCE_INCOMPLETE');
    }
  });
  it('wrong broker account is rejected without using source records',()=>{
    const e=fixture();e.connectedAccountId='ATTACKER-ACCOUNT';
    const r=review(e);neverRelease(r);
    assert.equal(r.status,'BROKER_ACCOUNT_UNVERIFIED');
  });
  it('read-only adapter verifies connected account BEFORE querying any private broker API',async()=>{
    let called=0;
    const broker={
      getBrokerAuthEpoch:()=>1,
      getLiveConnectionStatus:()=>({isConnected:true,userId:'WRONG'}),
      getGttOrderDetails:async()=>{called++;return [gtt()];},
      getVerifiedNrmlPositionRows:async()=>{called++;return [position()];},
      getOrderBook:async()=>{called++;return [order()];},
      getGttOrders:async()=>{called++;return [gtt()];},
      getOrderDetails:async()=>{called++;return order();},
      getOrderTrades:async()=>{called++;return [];}
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);neverRelease(r);
    assert.equal(r.status,'BROKER_ACCOUNT_UNVERIFIED');
    assert.equal(called,0);
  });
  it('SCHEDULED GTT never fetches any generated order detail or trade',async()=>{
    const called:string[]=[];
    const broker={
      getBrokerAuthEpoch:()=>1,
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getGttOrderDetails:async()=>{called.push('gtt');return [{
        ...gtt(),rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
          status:'SCHEDULED',order_id:null}]
      }];},
      getVerifiedNrmlPositionRows:async()=>{called.push('positions');return [position()];},
      getOrderBook:async()=>{called.push('orderBook');return [];},
      getGttOrders:async()=>{called.push('gttList');return [{
        ...gtt(),rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
          status:'SCHEDULED',order_id:null}]
      }];},
      getOrderDetails:async()=>{throw Error('MUST_NOT_FETCH_CHILD');},
      getOrderTrades:async()=>{throw Error('MUST_NOT_FETCH_TRADES');}
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);neverRelease(r);
    assert.equal(r.status,'SCHEDULED_GTT_NO_EXCHANGE_CHILD');
    assert.deepEqual(called.sort(),['gtt','gttList','orderBook','positions']);
  });
  it('read-only triggered GTT fetches 5 authorised reads, no order write',async()=>{
    const calls:string[]=[];
    const broker={
      getBrokerAuthEpoch:()=>1,
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getGttOrderDetails:async(_:string)=>{calls.push('gtt');return [gtt()];},
      getVerifiedNrmlPositionRows:async()=>{calls.push('positions');return [position()];},
      getOrderBook:async()=>{calls.push('orderBook');return [order()];},
      getGttOrders:async()=>{calls.push('gttList');return [gtt()];},
      getOrderDetails:async(_:string)=>{calls.push('childDetails');return order();},
      getOrderTrades:async(_:string)=>{calls.push('trades');return [];},
      placeOrder:()=>{throw Error('NO_BROKER_WRITE');},
      cancelOrder:()=>{throw Error('NO_BROKER_CANCEL');},
      placeGttOrder:()=>{throw Error('NO_GTT_CREATE');}
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);neverRelease(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.deepEqual(calls.sort(),['childDetails','gtt','gttList','orderBook','positions','trades']);
  });
  it('child GET transport exception fails closed without echoing broker secrets',async()=>{
    const broker={
      getBrokerAuthEpoch:()=>1,
      getLiveConnectionStatus:()=>({isConnected:true,userId:req.expectedAccountId}),
      getGttOrderDetails:async()=>[gtt()],
      getVerifiedNrmlPositionRows:async()=>[position()],
      getOrderBook:async()=>[order()],
      getGttOrders:async()=>[gtt()],
      getOrderDetails:async()=>{throw Error('AUTH_TOKEN_DO_NOT_PRINT');},
      getOrderTrades:async()=>[]
    };
    const r=await reviewNrmlGttChildReadOnly(broker,req);neverRelease(r);
    assert.equal(r.status,'BROKER_SOURCE_INCOMPLETE');
    assert.ok(!JSON.stringify(r).includes('AUTH_TOKEN'));
  });
});
