import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validateOriginalBuyTradeEvidence,fetchOriginalBuyTradeEvidenceReadOnly,
  type PreparedBuyTradeEvidence
} from '../../server/engine/ema15m/adaptiveDurableBuyTradeEvidence.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
import {dbEngine} from '../../server/db.js';
import type {EmaLivePosition,EmaLiveOrderAttempt} from
  '../../server/engine/ema15m/types.js';

const acct='PH101-ACCOUNT',inst='NSE_FO|PH101-CE';
const original='PH101-ENTRY-ORDER',venue='PH101-EXCHANGE';
const scope=(positionId='PH101-POS',product:'MIS'|'NRML'='MIS')=>({
  positionId,accountId:acct,attemptId:'PH101-ENTRY-ATTEMPT',
  orderId:original,instrumentKey:inst,product,
  originalQuantity:100,lotSize:50,entryFillPrice:110
});
const detail=(product='I')=>({
  order_id:original,exchange_order_id:venue,product,
  instrument_token:inst,transaction_type:'BUY',
  quantity:100,filled_quantity:100,pending_quantity:0,
  average_price:110,status:'complete'
});
const trade=(tradeId:string,quantity:number,price:number,product='I')=>({
  trade_id:tradeId,order_id:original,exchange_order_id:venue,
  product,instrument_token:inst,transaction_type:'BUY',
  quantity,average_price:price
});
const sample=(product='I')=>({
  order:detail(product),orderBook:[detail(product)],
  trades:[trade('PH101-TRADE-1',50,105,product),
    trade('PH101-TRADE-2',50,115,product)]
});
const prepare=(positionId='PH101-POS',product:'MIS'|'NRML'='MIS')=>
  validateOriginalBuyTradeEvidence(
    scope(positionId,product),
    sample(product==='NRML'?'D':'I')
  );
const assertNoRelease=()=>{
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
};
describe('Phase101 original BUY trade ID and order-book evidence (pure)',()=>{
  it('two BUY executions 50 @105 + 50 @115 match 100 @110; no settlement authority',()=>{
    const r=prepare();assert.equal(r.ok,true);assertNoRelease();
    if(r.ok){
      assert.equal(r.prepared.trades.length,2);
      assert.equal(r.prepared.originalQuantity,100);
      assert.equal(r.prepared.brokerReportedAveragePrice,110);
      assert.deepEqual(r.prepared.trades.map(x=>x.tradeId),
        ['PH101-TRADE-1','PH101-TRADE-2']);
    }
  });
  it('full original BUY from NRML product D can be observed without authorising NRML routing',()=>{
    const r=prepare('PH101-NRML','NRML');
    assert.equal(r.ok,true);assertNoRelease();
    if(r.ok)assert.equal(r.prepared.product,'NRML');
  });
  it('missing child details or broker trade/book source cannot replace original BUY execution',()=>{
    for(const property of ['order','orderBook','trades']){
      const e:Record<string,unknown>={...sample(),[property]:null};
      const r=validateOriginalBuyTradeEvidence(scope(),e as any);
      assert.equal(r.ok,false);
    }
  });
  it('empty or truncated trade source does not mean zero original BUY',()=>{
    const r=validateOriginalBuyTradeEvidence(scope(),{
      ...sample(),trades:[]
    });
    assert.equal(r.ok,false);
    assert.equal(r.reason,'ORIGINAL_BUY_TRADE_SET_EMPTY_OR_TRUNCATED');
  });
  it('child is unknown, OPEN or partially filled despite local FILLED journal',()=>{
    for(const edit of [
      {status:'open'},{status:'unknown'},{status:'partially filled'},
      {filled_quantity:50},{pending_quantity:50}
    ]){
      const r=validateOriginalBuyTradeEvidence(scope(),{
        ...sample(),order:{...detail(),...edit}
      });
      assert.equal(r.ok,false);
    }
  });
  it('details wrong account-independent identity: wrong child ID/venue/contract/side/product',()=>{
    for(const edit of [
      {order_id:'PH101-OTHER'},{exchange_order_id:null},
      {instrument_token:'NSE_FO|OTHER'},{transaction_type:'SELL'},
      {product:'D'},{quantity:50}
    ]){
      const r=validateOriginalBuyTradeEvidence(scope(),{
        ...sample(),order:{...detail(),...edit}
      });
      assert.equal(r.ok,false);
    }
  });
  it('unique order-book row required; duplicate or stale GET refuses capture',()=>{
    for(const orderBook of [
      [],[detail(),detail()],
      [{...detail(),filled_quantity:50}],
      [{...detail(),exchange_order_id:'PH101-OTHER'}]
    ]){
      const r=validateOriginalBuyTradeEvidence(scope(),{
        ...sample(),orderBook
      });
      assert.equal(r.ok,false);
      assert.equal(r.reason,'ORIGINAL_BUY_ORDER_BOOK_CHILD_NOT_UNIQUE_OR_CONSISTENT');
    }
  });
  it('later same-contract SELL may coexist; original BUY receipt is not an account-wide audit',()=>{
    const e=sample();
    const r=validateOriginalBuyTradeEvidence(scope(),{
      ...e,orderBook:[detail(),{
        ...detail(),order_id:'PH101-LATER-SELL',
        transaction_type:'SELL',status:'open',filled_quantity:0
      }]
    });
    assert.equal(r.ok,true);
    assertNoRelease();
  });
  it('trade-ID duplicate across executions cannot be double-counted',()=>{
    const e=sample();e.trades=[trade('PH101-SAME',50,105),trade('PH101-SAME',50,115)];
    const r=validateOriginalBuyTradeEvidence(scope(),e);
    assert.equal(r.ok,false);
    assert.equal(r.reason,'ORIGINAL_BUY_TRADE_ID_SIDE_OR_PRICE_CONFLICT');
  });
  it('wrong original trade side, order ID, venue ID, contract or product fails',()=>{
    const changes=[
      {transaction_type:'SELL'},{order_id:'PH101-WRONG'},
      {exchange_order_id:'PH101-OTHER'},
      {instrument_token:'NSE_FO|OTHER'},{product:'D'},
      {trade_id:''}
    ];
    for(const changed of changes){
      const e=sample();
      e.trades=[{...trade('PH101-TRADE-1',50,105),...changed},
        trade('PH101-TRADE-2',50,115)];
      const r=validateOriginalBuyTradeEvidence(scope(),e);
      assert.equal(r.ok,false);
    }
  });
  it('missing, fractional, negative, string or unsafe execution quantity rejected',()=>{
    for(const bad of [null,undefined,0,-1,1.2,'50',NaN,Infinity]){
      const e=sample();e.trades=[
        {...trade('PH101-TRADE-1',50,105),quantity:bad},
        trade('PH101-TRADE-2',50,115)
      ];
      assert.equal(validateOriginalBuyTradeEvidence(scope(),e).ok,false);
    }
  });
  it('invalid BUY trade prices are never coerced into a valid weighted entry',()=>{
    for(const bad of [null,undefined,0,-10,'105',NaN,Infinity,105.123]){
      const e=sample();e.trades=[
        {...trade('PH101-TRADE-1',50,105),average_price:bad},
        trade('PH101-TRADE-2',50,115)
      ];
      assert.equal(validateOriginalBuyTradeEvidence(scope(),e).ok,false);
    }
  });
  it('two executions do not sum to original filled quantity',()=>{
    const e=sample();e.trades=[trade('PH101-TRADE-1',20,105),
      trade('PH101-TRADE-2',50,115)];
    const r=validateOriginalBuyTradeEvidence(scope(),e);
    assert.equal(r.reason,'ORIGINAL_BUY_TRADE_QUANTITY_NOT_EQUAL_TO_FILLED_ENTRY');
  });
  it('weighted trade price inconsistent with original durable entry journal fails closed',()=>{
    const e=sample();e.trades=[
      trade('PH101-TRADE-1',50,100),trade('PH101-TRADE-2',50,100)
    ];
    const r=validateOriginalBuyTradeEvidence(scope(),e);
    assert.equal(r.reason,'ORIGINAL_BUY_WEIGHTED_TRADES_NOT_MATCHING_ENTRY_PRICE');
  });
  it('original BUY details average cannot silently differ from local entry price',()=>{
    const r=validateOriginalBuyTradeEvidence(scope(),{
      ...sample(),order:{...detail(),average_price:115}
    });
    assert.equal(r.reason,'ORIGINAL_BUY_ORDER_AVERAGE_DISAGREES_WITH_DURABLE_ENTRY');
  });
  it('invalid scope account/order/product/contract/original lot is rejected before broker IO',()=>{
    const changes=[
      {accountId:''},{positionId:'BAD ID'},{orderId:''},
      {product:'CNC'},{instrumentKey:''},
      {originalQuantity:99},{lotSize:0},{entryFillPrice:0}
    ];
    for(const change of changes){
      const r=validateOriginalBuyTradeEvidence({...scope(),...change} as any,sample());
      assert.equal(r.ok,false);
      assert.equal(r.reason,'ORIGINAL_BUY_SCOPE_OR_WHOLE_LOT_INVALID');
    }
  });
  it('read-only broker collector does not call place/cancel or mark order filled on its own',async()=>{
    const calls:string[]=[];
    const broker={
      getOrderDetails:async(id:string)=>{assert.equal(id,original);calls.push('details');return detail();},
      getOrderTrades:async(id:string)=>{assert.equal(id,original);calls.push('trades');return sample().trades;},
      getOrderBook:async()=>{calls.push('book');return [detail()];},
      placeOrder:()=>{throw Error('ORDER_WRITE_FORBIDDEN');},
      cancelOrder:()=>{throw Error('CANCEL_WRITE_FORBIDDEN');}
    };
    const r=await fetchOriginalBuyTradeEvidenceReadOnly(broker,scope());
    assert.equal(r.ok,true);
    assert.deepEqual(calls.sort(),['book','details','trades']);
    assertNoRelease();
  });
  it('broker GET transport failure yields fixed generic reason without secrets',async()=>{
    const broker={
      getOrderDetails:async()=>{throw Error('BEARER_TOKEN_SECRET');},
      getOrderTrades:async()=>sample().trades,
      getOrderBook:async()=>[detail()]
    };
    const r=await fetchOriginalBuyTradeEvidenceReadOnly(broker,scope());
    assert.equal(r.ok,false);
    assert.equal(r.reason,'BROKER_BUY_GET_FAILED');
    assert.ok(!JSON.stringify(r).includes('BEARER_TOKEN'));
  });
  it('missing broker GET method fails without attempting other side effects',async()=>{
    const broker={
      getOrderDetails:async()=>detail(),
      getOrderTrades:async()=>sample().trades
    };
    const r=await fetchOriginalBuyTradeEvidenceReadOnly(broker as any,scope());
    assert.equal(r.ok,false);
    assert.equal(r.reason,'BROKER_BUY_READ_ONLY_METHOD_UNAVAILABLE');
  });
});
describe('Phase101 SQLite migration021 original entry BUY immutable trade receipt',()=>{
  const setup=(suffix:string)=>{
    const positionId='PH101-SQL-'+suffix,attemptId='PH101-ATT-'+suffix,ts='2026-11-21T09:00:00Z';
    const attempt:EmaLiveOrderAttempt={
      id:attemptId,signalId:'PH101-SIGNAL',executionMode:'LIVE',
      instrument:'NIFTY',brokerAccountId:acct,brokerInstrumentKey:inst,
      tradingsymbol:'PH101CE',optionType:'CE',strike:24000,
      expiry:'2026-12-31',requestedQuantity:100,filledQuantity:100,
      averageFillPrice:110,orderStatus:'FILLED',brokerOrderId:original,
      createdAt:ts,updatedAt:ts
    };
    const position:EmaLivePosition={
      id:positionId,attemptId,signalId:'PH101-SIGNAL',instrument:'NIFTY',
      brokerAccountId:acct,brokerInstrumentKey:inst,tradingsymbol:'PH101CE',
      optionType:'CE',strikePrice:24000,expiryDate:'2026-12-31',
      productType:'MIS',side:'BUY',marketBias:'BULLISH',
      entryBrokerOrderId:original,entryTimestamp:ts,entryPrice:110,
      quantity:100,lotSize:50,currentPrice:110,unrealizedPnl:0,
      stopLoss:80,targetPrice:140,status:'EXIT_PENDING',
      exitBrokerOrderId:'PH101-SELL-PENDING',exitFilledQuantity:0,
      grossPnl:0,brokerage:40,netPnl:0,
      createdAt:ts,updatedAt:ts
    };
    return {attempt,position};
  };
  const prepared=(positionId:string,attemptId:string):PreparedBuyTradeEvidence=>{
    const r=prepare(positionId);
    if(!r.ok)throw Error('invalid synthetic original BUY fixture');
    return {...r.prepared,attemptId};
  };
  it('SQLite append original BUY receipt once, identical restart replay idempotent, no position/P&L change',async()=>{
    await dbEngine.initialize();
    const {attempt,position}=setup('ONE');
    dbEngine.saveEmaLiveOrderAttempt(attempt);
    dbEngine.saveEmaLivePosition(position);
    const e=prepared(position.id,attempt.id);
    const one=dbEngine.appendEmaOriginalBuyTradeEvidence(e);
    assert.equal(one.state,'BROKER_BUY_RECEIPT_RECORDED_NOT_SETTLEMENT');
    assert.equal(one.recordedBuyTrades,2);
    const again=dbEngine.appendEmaOriginalBuyTradeEvidence(e);
    assert.equal(again.state,'IDENTICAL_RECEIPT_REPLAY');
    assert.equal(again.recordedBuyTrades,2);
    const unchanged=dbEngine.getOpenEmaLivePositions().find(x=>x.id===position.id);
    assert.equal(unchanged?.status,'EXIT_PENDING');
    assert.equal(unchanged?.exitFilledQuantity,0);
    assert.equal(unchanged?.grossPnl,0);
    assert.equal(unchanged?.netPnl,0);
    assert.equal(one.automaticClosureAuthorized,false);
    assert.equal(one.realisedPnlWriteAuthorized,false);
    assert.equal(one.independentExchangeReceiptCertified,false);
    assert.equal(one.brokerWrites,0);
  });
  it('same BUY trade ID with mutated price/quantity/exchange reference fails atomic replay',async()=>{
    await dbEngine.initialize();
    const {attempt,position}=setup('TWO');
    dbEngine.saveEmaLiveOrderAttempt(attempt);dbEngine.saveEmaLivePosition(position);
    const e=prepared(position.id,attempt.id);
    assert.equal(dbEngine.appendEmaOriginalBuyTradeEvidence(e).state,
      'BROKER_BUY_RECEIPT_RECORDED_NOT_SETTLEMENT');
    for(const changed of [
      {price:106},{quantity:60},{exchangeOrderId:'PH101-OTHER-EXCHANGE'}
    ]){
      const r=dbEngine.appendEmaOriginalBuyTradeEvidence({
        ...e,trades:[{...e.trades[0],...changed},e.trades[1]]
      });
      assert.equal(r.state,'BUY_RECEIPT_CONFLICT');
    }
    const still=dbEngine.appendEmaOriginalBuyTradeEvidence(e);
    assert.equal(still.state,'IDENTICAL_RECEIPT_REPLAY');
    assert.equal(still.recordedBuyTrades,2);
  });
  it('changed entry child ID, venue, requested product and account fail without a local trade',async()=>{
    await dbEngine.initialize();
    const {attempt,position}=setup('THREE');
    dbEngine.saveEmaLiveOrderAttempt(attempt);dbEngine.saveEmaLivePosition(position);
    const e=prepared(position.id,attempt.id);
    for(const altered of [
      {accountId:'PH101-OTHER-ACCOUNT'},
      {orderId:'PH101-OTHER-ENTRY'},{exchangeOrderId:'PH101-OTHER-EXCHANGE'},
      {product:'NRML' as const},{originalQuantity:50},
      {positionId:'PH101-NOT-FOUND'}
    ]){
      const result=dbEngine.appendEmaOriginalBuyTradeEvidence({...e,...altered});
      assert.equal(result.state,'BUY_RECEIPT_CONFLICT');
      assert.equal(result.brokerWrites,0);
    }
    assert.equal(dbEngine.appendEmaOriginalBuyTradeEvidence(e).state,
      'BROKER_BUY_RECEIPT_RECORDED_NOT_SETTLEMENT');
  });
  it('original BUY database method never contains brokerage or local settlement writes',()=>{
    const source=readFileSync('src/server/db.ts','utf8');
    const from=source.indexOf('public appendEmaOriginalBuyTradeEvidence(');
    const end=source.indexOf('public readEmaExitSettlementEvidence(',from);
    assert.ok(from>0&&end>from);
    const part=source.slice(from,end);
    assert.ok(part.includes('capture.immediate()'));
    assert.ok(part.includes('ema_entry_buy_trade_receipts'));
    assert.ok(!part.includes('UPDATE ema_live_positions'));
    assert.ok(!part.includes("status: 'CLOSED'"));
    assert.ok(!part.includes('placeOrder('));
    assert.ok(!part.includes('cancelOrder('));
    assert.ok(!part.includes('calculateOptionNetPnl'));
  });
});
