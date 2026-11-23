import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assessExitPlacementAck,auditBrokerExitFillEvidence,
  reviewBrokerExitFillReadOnly,
  type ExitFillReviewRequest,type ExitFillBrokerEvidence
} from '../../server/engine/ema15m/adaptiveLiveExitSettlementAudit.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH98-CE',orderId='PH98-ORDER-ONE',exchange='PH98-EXCHANGE-ONE';
const req:ExitFillReviewRequest={
  instrumentKey:key,product:'MIS',orderId,requestedSellQuantity:100,lotSize:50
};
const order=(patch:Record<string,unknown>={})=>({
  order_id:orderId,instrument_token:key,product:'I',
  transaction_type:'SELL',order_type:'MARKET',quantity:100,
  filled_quantity:100,pending_quantity:0,status:'complete',
  exchange_order_id:exchange,...patch
});
const trade=(id:string,q:number=100,patch:Record<string,unknown>={})=>({
  trade_id:id,order_id:orderId,exchange_order_id:exchange,
  instrument_token:key,product:'I',transaction_type:'SELL',
  quantity:q,average_price:120,...patch
});
const fixture=():ExitFillBrokerEvidence=>({
  order:order(),trades:[trade('TRADE-ONE')],
  orderBook:[order()],brokerNetAfterTrades:0
});
const check=(e:ExitFillBrokerEvidence,r=req)=>auditBrokerExitFillEvidence(r,e);
const locked=(r:ReturnType<typeof check>)=>{
  assert.equal(r.brokerFillIndependentlyCertified,false);
  assert.equal(r.sourceEndpointsAtomic,false);
  assert.equal(r.automaticClosureAuthorized,false);
  assert.equal(r.realisedPnlAuthorized,false);
  assert.equal(r.duplicateSellRetryAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.brokerWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  const json=JSON.stringify(r);
  for(const raw of [key,orderId,exchange,'TRADE-ONE'])
    assert.ok(!json.includes(raw));
};
describe('Phase98 placement ACK is NOT an exchange SELL fill or terminal P&L',()=>{
  it('placeOrder order_id with status COMPLETE and full claimed fill remains EXIT_PENDING',()=>{
    const r=assessExitPlacementAck({
      order_id:orderId,status:'COMPLETE',filled_quantity:100,
      average_price:125.25,exchange_order_id:exchange
    });
    assert.deepEqual(r,{
      state:'EXIT_PENDING_NOT_CONFIRMED_FILLED',
      orderId,automaticClosureAuthorized:false
    });
  });
  it('placeOrder MARKET response with false positive FULL FILLED still cannot close',()=>{
    const r=assessExitPlacementAck({
      order_id:orderId,status:'FILLED',filled_quantity:100,
      average_price:99999,grossPnl:999999
    });
    assert.equal(r.automaticClosureAuthorized,false);
    assert.equal(r.state,'EXIT_PENDING_NOT_CONFIRMED_FILLED');
  });
  it('placement order ID only is an acknowledgement, not trade receipt',()=>{
    const r=assessExitPlacementAck({orderId});
    assert.equal(r.state,'EXIT_PENDING_NOT_CONFIRMED_FILLED');
    assert.equal(r.automaticClosureAuthorized,false);
  });
  it('missing, malformed or blank child order ID after timeout is UNKNOWN with NO auto retry',()=>{
    for(const response of [null,undefined,{},[],{order_id:''},
      {order_id:'INVALID ID'},{order_id:123},{order_id:'A'.repeat(130)}]){
      const r=assessExitPlacementAck(response);
      assert.equal(r.state,'BROKER_ACK_UNKNOWN_DO_NOT_RETRY');
      assert.equal(r.orderId,null);
      assert.equal(r.automaticClosureAuthorized,false);
    }
  });
  it('invalid order_id is not overridden by a conflicting orderId alias',()=>{
    const r=assessExitPlacementAck({order_id:'BAD ID',orderId});
    assert.equal(r.state,'BROKER_ACK_UNKNOWN_DO_NOT_RETRY');
  });
  it('broker rejection response with a valid ID still does not imply retry permission',()=>{
    const r=assessExitPlacementAck({order_id:orderId,status:'REJECTED'});
    assert.equal(r.state,'EXIT_PENDING_NOT_CONFIRMED_FILLED');
    assert.equal(r.automaticClosureAuthorized,false);
  });
  it('actual live SELL handler no longer contains direct CLOSED or LIVE_EXIT_FILLED branch',()=>{
    const s=readFileSync(
      'src/server/engine/ema15m/liveExecutionService.ts','utf8');
    const start=s.indexOf('public async requestLiveExit('),
      end=s.indexOf('public async checkForcedIntradaySquareOff(',start);
    assert.ok(start>=0&&end>start);
    const body=s.slice(start,end);
    assert.ok(body.includes('assessExitPlacementAck(exitRes)'));
    assert.ok(body.includes("status: 'EXIT_PENDING'"));
    assert.ok(body.includes('this.pendingExitIds.delete(pos.id)'));
    assert.ok(!body.includes("status: 'CLOSED'"));
    assert.ok(!body.includes("stage: 'LIVE_EXIT_FILLED'"));
    assert.ok(!body.includes('StrategyRules.calculateOptionGrossPnl('));
    assert.ok(!body.includes('StrategyRules.calculateOptionNetPnl('));
  });
});
describe('Phase98 read-only order details / trades / book / net broker evidence',()=>{
  it('complete broker packet and net 0 is only a reported observation, NOT certified closure',()=>{
    const r=check(fixture());locked(r);
    assert.equal(r.state,'BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED');
    assert.equal(r.brokerReportedFilledQuantity,100);
    assert.equal(r.brokerReportedRemainingLong,0);
    assert.equal(r.brokerReportedOrderStatus,'TERMINAL_FILLED');
    assert.equal(r.distinctBrokerTradeCount,1);
    assert.equal(r.exchangeOrderReferenceObserved,true);
  });
  it('broker-reported partial SELL 50 and remaining long 50 are not CLOSED',()=>{
    const e=fixture();
    e.order=order({filled_quantity:50,pending_quantity:50,
      status:'partially filled'});
    e.orderBook=[e.order];
    e.trades=[trade('TRADE-ONE',50)];
    e.brokerNetAfterTrades=50;
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED');
    assert.equal(r.brokerReportedOrderStatus,'PARTIAL_OR_PENDING');
    assert.equal(r.brokerReportedFilledQuantity,50);
    assert.equal(r.brokerReportedRemainingLong,50);
  });
  it('zero fills, OPEN child and 100 remaining are only pending order evidence',()=>{
    const e=fixture();
    e.order=order({filled_quantity:0,pending_quantity:100,status:'open'});
    e.orderBook=[e.order];e.trades=[];e.brokerNetAfterTrades=100;
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED');
    assert.equal(r.brokerReportedFilledQuantity,0);
    assert.equal(r.brokerReportedOrderStatus,'PARTIAL_OR_PENDING');
  });
  it('broker order says COMPLETE but 50 filled of 100 rejects terminal settlement',()=>{
    const e=fixture();
    e.order=order({filled_quantity:50,pending_quantity:50});
    e.orderBook=[e.order];e.trades=[trade('TRADE-ONE',50)];
    e.brokerNetAfterTrades=50;
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'EXIT_TERMINAL_FILLED_STATUS_CONTRADICTS_QUANTITY'));
  });
  it('current net 100 after 100 SELL trade evidence means conflicting broker snapshots',()=>{
    const e=fixture();e.brokerNetAfterTrades=100;
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'POST_TRADE_BROKER_NET_DISAGREES_WITH_SELL_REMAINDER'));
  });
  it('unknown portfolio net is not interpreted as broker flat',()=>{
    for(const net of [null,undefined,'0',-1,1.5,NaN]){
      const e=fixture();e.brokerNetAfterTrades=net;
      const r=check(e);locked(r);
      assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
      assert.equal(r.brokerReportedRemainingLong,null);
    }
  });
  it('no trade rows despite broker claimed full execution are inconsistent',()=>{
    const e=fixture();e.trades=[];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'EXIT_CHILD_TOTAL_BROKER_TRADES_NOT_MATCHING_EXECUTION_COUNT'));
  });
  it('duplicate trade IDs are never double-counted as an exit',()=>{
    const e=fixture();
    e.trades=[trade('TRADE-ONE',50),trade('TRADE-ONE',50)];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'EXIT_TRADE_ID_SIDE_CONTRACT_OR_EXCHANGE_REFERENCE_CONFLICT'));
  });
  it('same child two unique 50-unit executions can match total 100 without authorising closure',()=>{
    const e=fixture();e.trades=[trade('TRADE-ONE',50),trade('TRADE-TWO',50)];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED');
    assert.equal(r.distinctBrokerTradeCount,2);
  });
  it('wrong child trade ID, order ID, side, product, exchange ref or full instrument fails',()=>{
    const changes=[
      {trade_id:''},{order_id:'OTHER-ORDER'},
      {transaction_type:'BUY'},{product:'D'},
      {exchange_order_id:'OTHER-EXCHANGE'},
      {instrument_token:'NSE_FO|WRONG-PE'}
    ];
    for(const changed of changes){
      const e=fixture();e.trades=[trade('TRADE-ONE',100,changed)];
      const r=check(e);locked(r);
      assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    }
  });
  it('broker trade without usable execution price is not a realised P&L',()=>{
    for(const avg of [null,0,-1,NaN,'120',undefined]){
      const e=fixture();e.trades=[trade('TRADE-ONE',100,{average_price:avg})];
      const r=check(e);locked(r);
      assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
      assert.ok(r.reasonCodes.includes('EXIT_TRADE_EXECUTION_PRICE_UNKNOWN'));
    }
  });
  it('missing broker-reported exchange ID is not a proven venue ACK',()=>{
    const e=fixture();e.order=order({exchange_order_id:null});
    e.orderBook=[e.order];e.trades=[trade('TRADE-ONE',100,{
      exchange_order_id:null
    })];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.equal(r.exchangeOrderReferenceObserved,false);
  });
  it('missing, duplicate or stale order-book child conflicts with exact details',()=>{
    for(const orderBook of [[],[order(),order()],
      [order({filled_quantity:50})],
      [order({exchange_order_id:'WRONG-EXCHANGE'})]]){
      const e=fixture();e.orderBook=orderBook;
      const r=check(e);locked(r);
      assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
      assert.ok(r.reasonCodes.includes(
        'EXIT_CHILD_DETAILS_CONTRADICT_BROKER_ORDER_BOOK'));
    }
  });
  it('different same-option open SELL could duplicate exit while expected child is complete',()=>{
    const e=fixture();e.orderBook=[order(),order({
      order_id:'ANOTHER-SELL',filled_quantity:0,
      pending_quantity:100,status:'open'
    })];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'OTHER_SAME_OPTION_ORDER_LIFECYCLE_UNRESOLVED'));
  });
  it('different same-option cancelled SELL that already filled changes net lineage',()=>{
    const e=fixture();e.orderBook=[order(),order({
      order_id:'EARLIER-CANCELLED-SELL',filled_quantity:50,
      pending_quantity:0,status:'cancelled'
    })];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes(
      'OTHER_SAME_OPTION_SELL_FILLS_NOT_IN_CHILD_LEDGER'));
  });
  it('other terminal SELL with missing fill count cannot be assumed harmless',()=>{
    const e=fixture();e.orderBook=[order(),order({
      order_id:'OTHER-SELL-UNCONFIRMED',status:'cancelled',
      filled_quantity:null,pending_quantity:0
    })];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes('OTHER_SAME_OPTION_SELL_FILL_COUNT_UNKNOWN'));
  });
  it('a pending manual BUY on same option may change net after this observation',()=>{
    const e=fixture();e.orderBook=[order(),order({
      order_id:'PENDING-MANUAL-BUY',transaction_type:'BUY',
      status:'open',filled_quantity:0,pending_quantity:100
    })];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
  });
  it('a same-option order with other product cannot be netted with requested account exposure',()=>{
    const e=fixture();e.orderBook=[order(),order({
      order_id:'NRML-CONFLICT',product:'D',status:'complete'
    })];
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
  });
  it('wrong child product, direction, contract or quantity never matches original SELL',()=>{
    for(const changed of [
      {product:'D'},{transaction_type:'BUY'},
      {instrument_token:'NSE_FO|OTHER'},{quantity:50},
      {order_id:'PH98-OTHER-CHILD'}
    ]){
      const e=fixture();e.order=order(changed);
      const r=check(e);locked(r);
      assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    }
  });
  it('nonterminal order filled + pending not equal to original quantity conflicts',()=>{
    const e=fixture();
    e.order=order({status:'open',filled_quantity:20,pending_quantity:40});
    e.orderBook=[e.order];e.trades=[trade('TRADE-ONE',20)];
    e.brokerNetAfterTrades=80;
    const r=check(e);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_CONFLICT');
    assert.ok(r.reasonCodes.includes('EXIT_ACTIVE_CHILD_QUANTITY_NOT_CONSERVED'));
  });
  it('missing detail, trades, or broker order-book is source-incomplete, not zero executed',()=>{
    for(const k of ['order','trades','orderBook'] as const){
      const e=fixture();
      (e as unknown as Record<string,unknown>)[k]=null;
      const r=check(e);locked(r);
      assert.equal(r.state,'BROKER_EXIT_EVIDENCE_UNAVAILABLE');
    }
  });
  it('invalid quantity, lot or order ID requests never trigger a broker read',async()=>{
    for(const changed of [
      {lotSize:0},{requestedSellQuantity:51},{requestedSellQuantity:0},
      {orderId:'INVALID ID'},{instrumentKey:''}
    ]){
      const calls:string[]=[];
      const b={
        getOrderDetails:async()=>{calls.push('details');return order();},
        getOrderTrades:async()=>{calls.push('trades');return [trade('TRADE-ONE')];},
        getOrderBook:async()=>{calls.push('book');return [order()];},
        getVerifiedLivePositionQuantity:async()=>{calls.push('net');return 0;}
      };
      const r=await reviewBrokerExitFillReadOnly(b,{...req,...changed});
      locked(r);
      assert.equal(r.state,'INVALID_EXIT_REVIEW_REQUEST');
      assert.equal(calls.length,0);
    }
  });
  it('read-only collector gets order/trades/book before portfolio and never writes orders',async()=>{
    const calls:string[]=[];
    const b={
      getOrderDetails:async(id:string)=>{calls.push('details');assert.equal(id,orderId);return order();},
      getOrderTrades:async(id:string)=>{calls.push('trades');assert.equal(id,orderId);return [trade('TRADE-ONE')];},
      getOrderBook:async()=>{calls.push('book');return [order()];},
      getVerifiedLivePositionQuantity:async()=>{calls.push('net');return 0;},
      placeOrder:()=>{throw Error('SELL_WRITE_NOT_ALLOWED');},
      cancelOrder:()=>{throw Error('CANCEL_WRITE_NOT_ALLOWED');}
    };
    const r=await reviewBrokerExitFillReadOnly(b,req);locked(r);
    assert.equal(r.state,'BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED');
    assert.deepEqual(calls.slice(0,3).sort(),['book','details','trades']);
    assert.equal(calls[3],'net');
  });
  it('read-only broker transport failure remains UNKNOWN, no secret data leaks',async()=>{
    const b={
      getOrderDetails:async()=>order(),
      getOrderTrades:async()=>{throw Error('BEARER_SECRET_DO_NOT_REPORT');},
      getOrderBook:async()=>[order()],
      getVerifiedLivePositionQuantity:async()=>0
    };
    const r=await reviewBrokerExitFillReadOnly(b,req);locked(r);
    assert.equal(r.state,'BROKER_EXIT_EVIDENCE_UNAVAILABLE');
    assert.ok(!JSON.stringify(r).includes('BEARER_SECRET'));
  });
});
