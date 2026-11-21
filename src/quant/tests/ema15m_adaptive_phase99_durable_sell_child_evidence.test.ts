import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  prepareDurableSellChildEvidence,assessDurableSellEvidenceReplay,
  type PreparedSellChild,type PreparedSellTrade
} from '../../server/engine/ema15m/adaptiveDurableSellChildEvidence.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
import {dbEngine} from '../../server/db.js';
import type {EmaLivePosition} from '../../server/engine/ema15m/types.js';

const pos='PH99-POS',account='PH99-ACCOUNT',inst='NSE_FO|PH99-CE',
  childId='PH99-ORDER',venueId='PH99-EXCHANGE';
const order=(filled=100,pending=0,status='complete')=>({
  order_id:childId,instrument_token:inst,product:'I',
  transaction_type:'SELL',quantity:100,
  filled_quantity:filled,pending_quantity:pending,status,
  exchange_order_id:venueId
});
const trade=(tradeId:string,quantity:number,price=120)=>({
  trade_id:tradeId,order_id:childId,exchange_order_id:venueId,
  instrument_token:inst,product:'I',
  transaction_type:'SELL',quantity,average_price:price
});
const sample=(trades:unknown[]=[trade('TRADE-1',100)],
  filled=100,pending=0,status='complete',net=0,
  overrides:Record<string,unknown>={})=>({
  positionId:pos,accountId:account,
  request:{
    instrumentKey:inst,product:'MIS' as const,orderId:childId,
    requestedSellQuantity:100,lotSize:50
  },
  evidence:{
    order:order(filled,pending,status),
    trades,orderBook:[order(filled,pending,status)],
    brokerNetAfterTrades:net
  },...overrides
});
const valid=()=> {
  const r=prepareDurableSellChildEvidence(sample());
  assert.equal(r.ok,true);
  if(!r.ok)throw Error('expected canonical evidence');
  return r.prepared;
};
const hasNoRelease=(p:PreparedSellChild)=>{
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(p.product,'MIS');
  assert.equal(p.filledQuantity<=p.requestedQuantity,true);
};
const replay=(prior:readonly PreparedSellTrade[],
  incoming:readonly PreparedSellTrade[],before:number,after:number)=>
  assessDurableSellEvidenceReplay(prior,incoming,before,after);
describe('Phase99 canonical private SELL child / unique trade evidence',()=>{
  it('valid complete child/trade/net becomes only broker-reported prepared evidence',()=>{
    const p=valid();hasNoRelease(p);
    assert.equal(p.trades.length,1);
    assert.equal(p.filledQuantity,100);
    assert.equal(p.pendingQuantity,0);
  });
  it('50-unit partial SELL remains an open child and no final closure is implied',()=>{
    const s=sample([trade('TRADE-1',50)],50,50,'partially filled',50);
    const r=prepareDurableSellChildEvidence(s);
    assert.equal(r.ok,true);
    if(r.ok)assert.equal(r.prepared.currentNetQuantity,50);
  });
  it('unfilled OPEN child with 0 trades is an observation, not a zero-exposure claim',()=>{
    const r=prepareDurableSellChildEvidence(sample([],0,100,'open',100));
    assert.equal(r.ok,true);
    if(r.ok)assert.equal(r.prepared.trades.length,0);
  });
  it('trade order/venue lineage and numeric execution price are preserved in private journal',()=>{
    const r=prepareDurableSellChildEvidence(
      sample([trade('TRADE-2',50,110),trade('TRADE-1',50,130)]));
    assert.equal(r.ok,true);
    if(r.ok){
      assert.deepEqual(r.prepared.trades.map(x=>x.tradeId),
        ['TRADE-1','TRADE-2']);
      assert.deepEqual(r.prepared.trades.map(x=>x.price),[130,110]);
    }
  });
  it('missing position ID or broker account rejects private evidence before storage',()=>{
    for(const value of ['',undefined,null,'BAD ID']){
      for(const prop of ['positionId','accountId'] as const){
        const r=prepareDurableSellChildEvidence(
          sample(undefined,100,0,'complete',0,{[prop]:value}));
        assert.equal(r.ok,false);
        assert.equal(r.prepared,null);
      }
    }
  });
  it('order-book, child and trades must agree; a fake placement ACK alone cannot prepare execution',()=>{
    const s=sample([]);
    const r=prepareDurableSellChildEvidence(s);
    assert.equal(r.ok,false);
    assert.equal(r.reason,'BROKER_CHILD_EVIDENCE_INCOMPLETE_OR_CONFLICTED');
  });
  it('duplicate trade ID cannot produce two separate immutable ledger rows',()=>{
    const r=prepareDurableSellChildEvidence(
      sample([trade('TRADE-1',50),trade('TRADE-1',50)]));
    assert.equal(r.ok,false);
  });
  it('wrong venue order, product, side, instrument or BUY trade rejects preparation',()=>{
    const edits=[
      {exchange_order_id:'OTHER-EXCHANGE'},
      {product:'D'},{transaction_type:'BUY'},
      {instrument_token:'NSE_FO|OTHER'},{order_id:'OTHER-CHILD'}
    ];
    for(const changed of edits){
      const s=sample();
      s.evidence.trades=[{...trade('TRADE-1',100),...changed}];
      assert.equal(prepareDurableSellChildEvidence(s).ok,false);
    }
  });
  it('noncanonical trade price or quantity cannot be persisted as evidence',()=>{
    for(const q of [null,undefined,0,-1,1.5,'100',NaN]){
      const s=sample();
      s.evidence.trades=[{...trade('TRADE-1',100),quantity:q}];
      assert.equal(prepareDurableSellChildEvidence(s).ok,false);
    }
    for(const q of [null,undefined,0,-1,'120',NaN,Infinity]){
      const s=sample();
      s.evidence.trades=[{...trade('TRADE-1',100),average_price:q}];
      assert.equal(prepareDurableSellChildEvidence(s).ok,false);
    }
  });
  it('broker-reported net remaining 100 after 100 SELL is conflicting evidence',()=>{
    const s=sample([trade('TRADE-1',100)],100,0,'complete',100);
    assert.equal(prepareDurableSellChildEvidence(s).ok,false);
  });
  it('changed exact child order ID or side is not an alias of the acknowledged child',()=>{
    for(const changed of [{order_id:'OTHER-CHILD'},{transaction_type:'BUY'}]){
      const s=sample();s.evidence.order={...order(),...changed};
      assert.equal(prepareDurableSellChildEvidence(s).ok,false);
    }
  });
});
describe('Phase99 idempotent immutable SELL trade replay guards',()=>{
  it('new 50-unit trade adds exactly one unique execution ID',()=>{
    const t=valid().trades[0];
    const r=replay([],[{...t,quantity:50}],0,50);
    assert.deepEqual(r,{accept:true,
      reason:'BROKER_REPORTED_EVIDENCE_ONLY_NOT_SETTLEMENT',newTrades:1});
  });
  it('same trade ID with identical quantity/price is idempotent on repeated restart',()=>{
    const t=valid().trades[0];
    const r=replay([t],[t],100,100);
    assert.equal(r.accept,true);assert.equal(r.newTrades,0);
  });
  it('new second 50-unit trade can advance previous 50 to 100 exactly once',()=>{
    const t=valid().trades[0],first={...t,quantity:50};
    const second={...t,tradeId:'TRADE-2',quantity:50};
    const r=replay([first],[first,second],50,100);
    assert.equal(r.accept,true);assert.equal(r.newTrades,1);
  });
  it('cumulative filled number cannot regress from 100 to 50 after network reorder',()=>{
    const t=valid().trades[0];
    const r=replay([t],[{...t,quantity:50}],100,50);
    assert.equal(r.accept,false);
    assert.equal(r.reason,'BROKER_CHILD_CUMULATIVE_FILL_REGRESSED');
  });
  it('previously seen execution ID cannot disappear from broker trade replay',()=>{
    const t=valid().trades[0];
    const r=replay([t],[],100,100);
    assert.equal(r.accept,false);
    assert.equal(r.reason,'PREVIOUSLY_OBSERVED_BROKER_TRADE_MISSING_ON_REPLAY');
  });
  it('same trade ID with changed quantity, price or exchange ref is conflict',()=>{
    const t=valid().trades[0];
    const edits=[
      {quantity:50},{price:121},{exchangeOrderId:'OTHER-EXCHANGE'}
    ];
    for(const changed of edits){
      const r=replay([t],[{...t,...changed}],100,100);
      assert.equal(r.accept,false);
      assert.equal(r.reason,'REPLAYED_TRADE_ID_CHANGED_EXECUTION_EVIDENCE');
    }
  });
  it('incoming duplicate trade IDs cannot be added twice',()=>{
    const t=valid().trades[0];
    const r=replay([],[t,t],0,200);
    assert.equal(r.accept,false);
    assert.equal(r.reason,'BROKER_NEW_TRADE_LEDGER_INVALID');
  });
  it('stored duplicate or malformed trade ID is a corrupt journal, not proof of fills',()=>{
    const t=valid().trades[0];
    for(const prev of [[t,t],[{...t,price:0}]]){
      const r=replay(prev,[t],100,100);
      assert.equal(r.accept,false);
      assert.equal(r.reason,'DURABLE_EXISTING_TRADE_LEDGER_INVALID');
    }
  });
  it('incoming trade-ID sum must equal broker child cumulative fill exactly',()=>{
    const t=valid().trades[0];
    const r=replay([],[{...t,quantity:50}],0,100);
    assert.equal(r.accept,false);
    assert.equal(r.reason,'BROKER_CUMULATIVE_FILL_NOT_EQUAL_TO_DISTINCT_TRADES');
  });
  it('zero fills with zero trades is idempotent and cannot authorise any SELL',()=>{
    const r=replay([],[],0,0);
    assert.equal(r.accept,true);
    assert.equal(r.newTrades,0);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('missing, negative or string cumulative fill count cannot be silently coerced',()=>{
    const t=valid().trades[0];
    for(const bad of [null,undefined,-1,'50',NaN,Infinity]){
      const r=replay([],[t],0,bad as number);
      assert.equal(r.accept,false);
      assert.equal(r.reason,'DURABLE_TRADE_REPLAY_INVALID');
    }
  });
  it('replayed evidence does not grant close, P&L or broker-side order permission',()=>{
    const source=readFileSync('src/server/db.ts','utf8');
    const begin=source.indexOf('public appendEmaExitChildTradeEvidence(');
    const end=source.indexOf('public claimEmaLiveExit(',begin);
    assert.ok(begin>0&&end>begin);
    const method=source.slice(begin,end);
    assert.ok(method.includes('db.transaction('));
    assert.ok(method.includes('capture.immediate()'));
    assert.ok(method.includes('assessDurableSellEvidenceReplay('));
    assert.ok(!method.includes("UPDATE ema_live_positions SET status"));
    assert.ok(!method.includes("status: 'CLOSED'"));
    assert.ok(!method.includes('placeOrder('));
    assert.ok(!method.includes('cancelOrder('));
    assert.ok(!method.includes('calculateOptionNetPnl'));
  });
});


describe('Phase99 real SQLite WAL child-trade evidence persistence (never broker writes)',()=>{
  const position=(positionId:string):EmaLivePosition=>({
    id:positionId,attemptId:'PH99-BUY-ATTEMPT',signalId:'PH99-SIGNAL',
    instrument:'NIFTY',brokerAccountId:account,brokerInstrumentKey:inst,
    tradingsymbol:'PH99TESTCE',optionType:'CE',
    strikePrice:24000,expiryDate:'2026-12-31',productType:'MIS',
    side:'BUY',marketBias:'BULLISH',
    entryBrokerOrderId:'PH99-ENTRY',
    entryTimestamp:'2026-11-21T08:00:00Z',entryPrice:100,
    quantity:100,lotSize:50,currentPrice:100,unrealizedPnl:0,
    stopLoss:80,targetPrice:150,status:'EXIT_PENDING',
    exitBrokerOrderId:childId,exitFilledQuantity:0,
    grossPnl:0,brokerage:40,netPnl:0,
    createdAt:'2026-11-21T08:00:00Z',
    updatedAt:'2026-11-21T08:00:00Z'
  });
  it('SQLite migration020 persists a child + trade once; replay is idempotent and cannot change position',async()=>{
    await dbEngine.initialize();
    const p=position('PH99-SQLITE-ONE');
    dbEngine.saveEmaLivePosition(p);
    const prepared={...valid(),positionId:p.id};
    const one=dbEngine.appendEmaExitChildTradeEvidence(prepared);
    assert.equal(one.state,'RECORDED_BROKER_EVIDENCE_NOT_SETTLEMENT');
    assert.equal(one.newlyObservedTrades,1);
    assert.equal(one.recordedChildObservations,1);
    const replayed=dbEngine.appendEmaExitChildTradeEvidence(prepared);
    assert.equal(replayed.state,'REPLAY_NO_NEW_EVIDENCE');
    assert.equal(replayed.newlyObservedTrades,0);
    assert.equal(replayed.recordedChildObservations,1);
    const changed=dbEngine.appendEmaExitChildTradeEvidence({
      ...prepared,trades:[{...prepared.trades[0],price:121}]
    });
    assert.equal(changed.state,'EVIDENCE_CONFLICT');
    assert.equal(changed.reason,'REPLAYED_TRADE_ID_CHANGED_EXECUTION_EVIDENCE');
    const staleLifecycle=dbEngine.appendEmaExitChildTradeEvidence({
      ...prepared,brokerStatus:'OPEN'
    });
    assert.equal(staleLifecycle.state,'EVIDENCE_CONFLICT');
    assert.equal(staleLifecycle.reason,
      'BROKER_CHILD_TERMINAL_LIFECYCLE_REGRESSED_OR_CHANGED');
    const still=dbEngine.appendEmaExitChildTradeEvidence(prepared);
    assert.equal(still.state,'REPLAY_NO_NEW_EVIDENCE');
    assert.equal(still.recordedChildObservations,1);
    const posAfter=dbEngine.getOpenEmaLivePositions().find(x=>x.id===p.id);
    assert.equal(posAfter?.status,'EXIT_PENDING');
    assert.equal(posAfter?.exitFilledQuantity,0);
    assert.equal(posAfter?.grossPnl,0);
    assert.equal(posAfter?.netPnl,0);
    assert.equal(one.automaticClosureAuthorized,false);
    assert.equal(one.realisedPnlAuthorized,false);
    assert.equal(one.brokerWrites,0);
  });
  it('SQLite observations progress 50 -> 100 fills without duplicating prior trade IDs',async()=>{
    await dbEngine.initialize();
    const p=position('PH99-SQLITE-TWO');
    dbEngine.saveEmaLivePosition(p);
    const base=valid();
    const first={
      ...base,positionId:p.id,filledQuantity:50,
      pendingQuantity:50,currentNetQuantity:50,
      brokerStatus:'PARTIALLY FILLED',
      trades:[{...base.trades[0],quantity:50}]
    };
    const a=dbEngine.appendEmaExitChildTradeEvidence(first);
    assert.equal(a.state,'RECORDED_BROKER_EVIDENCE_NOT_SETTLEMENT');
    assert.equal(a.newlyObservedTrades,1);
    const later={
      ...base,positionId:p.id,
      trades:[{...base.trades[0],quantity:50},
        {...base.trades[0],tradeId:'TRADE-2',quantity:50}]
    };
    const b=dbEngine.appendEmaExitChildTradeEvidence(later);
    assert.equal(b.state,'RECORDED_BROKER_EVIDENCE_NOT_SETTLEMENT');
    assert.equal(b.newlyObservedTrades,1);
    assert.equal(b.recordedChildObservations,2);
    const stale=dbEngine.appendEmaExitChildTradeEvidence(first);
    assert.equal(stale.state,'EVIDENCE_CONFLICT');
    assert.equal(stale.reason,'BROKER_CHILD_CUMULATIVE_FILL_REGRESSED');
    const missing=dbEngine.appendEmaExitChildTradeEvidence({
      ...later,trades:[{...base.trades[0],tradeId:'TRADE-2',quantity:50}]
    });
    assert.equal(missing.state,'EVIDENCE_CONFLICT');
    const repeat=dbEngine.appendEmaExitChildTradeEvidence(later);
    assert.equal(repeat.state,'REPLAY_NO_NEW_EVIDENCE');
    assert.equal(repeat.recordedChildObservations,2);
    const posAfter=dbEngine.getOpenEmaLivePositions().find(x=>x.id===p.id);
    assert.equal(posAfter?.status,'EXIT_PENDING');
    assert.equal(posAfter?.exitFilledQuantity,0);
    assert.equal(posAfter?.netPnl,0);
  });
  it('SQLite atomic capture rejects wrong account, alternate child, or nonpending durable position',async()=>{
    await dbEngine.initialize();
    const p=position('PH99-SQLITE-THREE');
    dbEngine.saveEmaLivePosition(p);
    const c={...valid(),positionId:p.id};
    for(const mismatch of [
      {...c,accountId:'PH99-OTHER-ACCOUNT'},
      {...c,orderId:'PH99-OTHER-ORDER'},
      {...c,product:'NRML' as const},
      {...c,requestedQuantity:50},
      {...c,positionId:'PH99-NO-LOCAL-POSITION'}
    ]){
      const x=dbEngine.appendEmaExitChildTradeEvidence(mismatch);
      assert.equal(x.state,'EVIDENCE_CONFLICT');
      assert.equal(x.brokerWrites,0);
      assert.equal(x.automaticClosureAuthorized,false);
    }
    const validRecord=dbEngine.appendEmaExitChildTradeEvidence(c);
    assert.equal(validRecord.state,'RECORDED_BROKER_EVIDENCE_NOT_SETTLEMENT');
    assert.equal(validRecord.recordedChildObservations,1);
  });
});
