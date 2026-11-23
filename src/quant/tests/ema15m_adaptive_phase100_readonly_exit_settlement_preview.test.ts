import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  previewDurableExitSettlement,type SettlementPreviewSnapshot
} from '../../server/engine/ema15m/adaptiveExitSettlementPreview.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
import {dbEngine} from '../../server/db.js';
import type {EmaLivePosition,EmaLiveOrderAttempt} from
  '../../server/engine/ema15m/types.js';

const account='PH100-ACCOUNT',inst='NSE_FO|PH100-CE';
const scope={positionId:'PH100-POS',accountId:account};
const p=()=>({
  id:scope.positionId,attemptId:'PH100-ATTEMPT',brokerAccountId:account,
  brokerInstrumentKey:inst,productType:'MIS',status:'EXIT_PENDING',
  entryBrokerOrderId:'PH100-BUY',exitBrokerOrderId:'PH100-SELL',
  quantity:100,lotSize:50,exitFilledQuantity:0,entryPrice:100
});
const entry=()=>({
  id:'PH100-ATTEMPT',brokerAccountId:account,
  brokerInstrumentKey:inst,brokerOrderId:'PH100-BUY',
  orderStatus:'FILLED',requestedQuantity:100,filledQuantity:100,
  averageFillPrice:100
});
const observation=(fill=100,pending=0,net=0,status='COMPLETE')=>({
  observationId:1,positionId:scope.positionId,
  brokerOrderId:'PH100-SELL',accountId:account,instrumentKey:inst,
  product:'MIS',exchangeOrderId:'PH100-EXCHANGE',
  requestedQuantity:100,filledQuantity:fill,pendingQuantity:pending,
  currentNetQuantity:net,brokerStatus:status,tradeCount:fill>0?2:0
});
const trades=()=>[
  {tradeId:'PH100-T1',exchangeOrderId:'PH100-EXCHANGE',
    quantity:50,price:120},
  {tradeId:'PH100-T2',exchangeOrderId:'PH100-EXCHANGE',
    quantity:50,price:130}
];
const base=():SettlementPreviewSnapshot=>({
  position:p(),entryAttempt:entry(),
  observations:[observation()],trades:trades(),
  freshBrokerNetQuantity:0
});
const run=(s:SettlementPreviewSnapshot)=>previewDurableExitSettlement(scope,s);
const locked=(result:ReturnType<typeof run>)=>{
  assert.equal(result.netRealisedPnl,null);
  assert.equal(result.brokerChargesVerified,false);
  assert.equal(result.originalBuyTradeIdsIndependentlyReconciled,false);
  assert.equal(result.externalOrdersAndGttFullyReconciled,false);
  assert.equal(result.brokerChildExchangeAckIndependentlyCertified,false);
  assert.equal(result.brokerReportsAtomic,false);
  assert.equal(result.automaticPositionClosureAuthorized,false);
  assert.equal(result.realisedPnlWriteAuthorized,false);
  assert.equal(result.liveNrmlBuyAuthorized,false);
  assert.equal(result.manualApprovalRequired,true);
  assert.equal(result.brokerWrites,0);
  assert.equal(result.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  const json=JSON.stringify(result);
  for(const privateValue of [scope.positionId,account,inst,
    'PH100-BUY','PH100-SELL','PH100-EXCHANGE','PH100-T1'])
    assert.ok(!json.includes(privateValue));
};
describe('Phase100 immutable SELL ledger preview never grants closure or net realised P&L',()=>{
  it('100 long at 100, SELL 50 at 120 and 50 at 130 => indicative gross 2500 only',()=>{
    const result=run(base());locked(result);
    assert.equal(result.state,'BROKER_FLAT_OBSERVED_NOT_CERTIFIED');
    assert.equal(result.indicativeGrossPremiumDifference,2500);
    assert.equal(result.originalOptionQuantity,100);
    assert.equal(result.brokerReportedRemainingQuantity,0);
    assert.equal(result.brokerReportedExitFilledQuantity,100);
    assert.equal(result.distinctPersistedSellTradeCount,2);
  });
  it('position net=50 and a single 50 SELL at 120 => partial indicative gross 1000',()=>{
    const s=base();
    s.observations=[{...observation(50,50,50,'PARTIALLY FILLED'),tradeCount:1}];
    s.trades=[trades()[0]];s.freshBrokerNetQuantity=50;
    const result=run(s);locked(result);
    assert.equal(result.state,'BROKER_PARTIAL_EXIT_OBSERVED_NOT_SETTLED');
    assert.equal(result.indicativeGrossPremiumDifference,1000);
  });
  it('zero-fill OPEN SELL with 100 broker net is an unfilled pending child, not a closed position',()=>{
    const s=base();
    s.observations=[observation(0,100,100,'OPEN')];
    s.trades=[];s.freshBrokerNetQuantity=100;
    const result=run(s);locked(result);
    assert.equal(result.state,'BROKER_EXIT_ORDER_PENDING_NOT_SETTLED');
    assert.equal(result.indicativeGrossPremiumDifference,null);
  });
  it('weighted trade prices are used, not last trade price or average of unequal fills',()=>{
    const s=base();
    s.trades=[
      {...trades()[0],quantity:25,price:140},
      {...trades()[1],quantity:75,price:100}
    ];
    const result=run(s);locked(result);
    assert.equal(result.indicativeGrossPremiumDifference,1000);
  });
  it('negative indicative gross is visible but NOT a realised loss or net accounting',()=>{
    const s=base();
    s.trades=[
      {...trades()[0],quantity:50,price:80},
      {...trades()[1],quantity:50,price:90}
    ];
    const result=run(s);locked(result);
    assert.equal(result.indicativeGrossPremiumDifference,-1500);
    assert.equal(result.netRealisedPnl,null);
  });
  it('repeated identical broker observations with strictly advancing durable sequence can reconcile',()=>{
    const s=base();
    s.observations=[
      {...observation(0,100,100,'OPEN'),tradeCount:0},
      {...observation(50,50,50,'PARTIALLY FILLED'),
        observationId:2,tradeCount:1},
      {...observation(),observationId:3}
    ];
    const result=run(s);locked(result);
    assert.equal(result.state,'BROKER_FLAT_OBSERVED_NOT_CERTIFIED');
  });
  it('missing original durable BUY attempt is missing source, not zero cost',()=>{
    const s=base();s.entryAttempt=null;
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_EVIDENCE_MISSING');
    assert.equal(result.indicativeGrossPremiumDifference,null);
  });
  it('original BUY UNKNOWN/OPEN/PARTIAL/CANCELLED/COMPLETE is not a fully confirmed FILLED journal',()=>{
    for(const status of ['UNKNOWN','OPEN','PARTIALLY_FILLED','CANCELLED','COMPLETE']){
      const s=base();s.entryAttempt={...entry(),orderStatus:status};
      const result=run(s);locked(result);
      assert.equal(result.state,'RECONCILIATION_CONFLICT');
      assert.ok(result.reasonCodes.includes(
        'ORIGINAL_BUY_ATTEMPT_OR_ENTRY_PRICE_NOT_RECONCILED'));
    }
  });
  it('original BUY 50/100, mismatched account/order/contract is not a matched entry',()=>{
    const edits=[
      {filledQuantity:50},{requestedQuantity:50},
      {brokerAccountId:'OTHER-ACCOUNT'},
      {brokerInstrumentKey:'NSE_FO|WRONG'},
      {brokerOrderId:'OTHER-BUY'},{id:'OTHER-ATTEMPT'}
    ];
    for(const edit of edits){
      const s=base();s.entryAttempt={...entry(),...edit};
      const result=run(s);locked(result);
      assert.equal(result.state,'RECONCILIATION_CONFLICT');
    }
  });
  it('locally saved entry price and original BUY reported average cannot be inconsistent',()=>{
    const s=base();s.position={...p(),entryPrice:101};
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
  });
  it('missing or ambiguous broker status, product and position state fail closed',()=>{
    for(const changes of [
      {productType:'UNKNOWN'},{status:'CLOSED'}, {status:'OPEN'},
      {brokerAccountId:'OTHER'},{exitBrokerOrderId:null},
      {lotSize:0},{quantity:75},{exitFilledQuantity:50}
    ]){
      const s=base();s.position={...p(),...changes};
      const result=run(s);locked(result);
      assert.equal(result.state,'RECONCILIATION_CONFLICT');
    }
  });
  it('zero child observations gives missing evidence, NOT flat broker interpretation',()=>{
    const s=base();s.observations=[];
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_EVIDENCE_MISSING');
  });
  it('missing or untrusted fresh broker net is NOT a certified zero long',()=>{
    for(const net of [null,undefined,'0',NaN,-1,1.2]){
      const s=base();s.freshBrokerNetQuantity=net;
      const result=run(s);locked(result);
      assert.equal(result.state,'RECONCILIATION_CONFLICT');
      assert.ok(result.reasonCodes.includes('FRESH_BROKER_NET_UNAVAILABLE'));
    }
  });
  it('stale fresh broker net 100 after reported full 100 SELL produces conflict',()=>{
    const s=base();s.freshBrokerNetQuantity=100;
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
    assert.ok(result.reasonCodes.includes(
      'LATEST_BROKER_NET_DISAGREES_WITH_DURABLE_SELL_FILLS'));
  });
  it('duplicate persistent trade ID cannot double-count a 100 unit exit',()=>{
    const s=base();s.trades=[trades()[0],trades()[0]];
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
  });
  it('persisted sum of SELL trade quantities must match latest child filled total',()=>{
    const s=base();s.trades=[trades()[0]];
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
    assert.ok(result.reasonCodes.includes(
      'SELL_TRADE_SUM_OR_COUNT_DISAGREES_WITH_LAST_CHILD'));
  });
  it('changed exchange venue reference across child snapshots cannot certify ledger',()=>{
    const s=base();
    s.observations=[
      {...observation(50,50,50,'PARTIALLY FILLED'),
        tradeCount:1},
      {...observation(),observationId:2,
        exchangeOrderId:'PH100-OTHER-EXCHANGE'}
    ];
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
  });
  it('reordered, repeated or regressing durable observation sequences fail closed',()=>{
    const cases=[
      [{...observation(),observationId:1},
        {...observation(),observationId:1}],
      [{...observation(),observationId:2},
        {...observation(),observationId:1}],
      [{...observation(),observationId:1},
        {...observation(50,50,50,'PARTIALLY FILLED'),observationId:2}]
    ];
    for(const observations of cases){
      const s=base();s.observations=observations;
      const result=run(s);locked(result);
      assert.equal(result.state,'RECONCILIATION_CONFLICT');
    }
  });
  it('terminal COMPLETE cannot report 50 filled with 50 pending and claim flat',()=>{
    const s=base();
    s.observations=[{...observation(50,50,50,'COMPLETE'),tradeCount:1}];
    s.trades=[trades()[0]];s.freshBrokerNetQuantity=50;
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
  });
  it('cancelled or rejected child cannot become settled by current net alone',()=>{
    for(const status of ['CANCELLED','REJECTED','EXPIRED']){
      const s=base();
      s.observations=[{...observation(0,0,100,status),tradeCount:0}];
      s.trades=[];s.freshBrokerNetQuantity=100;
      const result=run(s);locked(result);
      assert.equal(result.state,'RECONCILIATION_CONFLICT');
    }
  });
  it('nonterminal active child must conserve original filled + pending quantity',()=>{
    const s=base();
    s.observations=[{...observation(50,20,50,'PARTIALLY FILLED'),
      tradeCount:1}];
    s.trades=[trades()[0]];s.freshBrokerNetQuantity=50;
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
  });
  it('terminal full quantity with OPEN lifecycle state is contradictory',()=>{
    const s=base();s.observations=[observation(100,0,0,'OPEN')];
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
  });
  it('malformed, unsafe price/quantity, missing trade ID or venue mismatch never generates indicative gross',()=>{
    const changes=[
      {tradeId:null},{quantity:-50},{quantity:25.5},
      {price:0},{price:'120'},{price:NaN},
      {exchangeOrderId:'OTHER-EXCHANGE'}
    ];
    for(const change of changes){
      const s=base();s.trades=[{...trades()[0],...change},trades()[1]];
      const result=run(s);locked(result);
      assert.equal(result.state,'RECONCILIATION_CONFLICT');
      assert.equal(result.indicativeGrossPremiumDifference,null);
    }
  });
  it('malformed report fields never leak original contract, broker account or trade IDs',()=>{
    const s=base();s.observations=[null];
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_CONFLICT');
  });
  it('missing position journal or no account/position scope fails closed',()=>{
    const s=base();s.position=null;
    const result=run(s);locked(result);
    assert.equal(result.state,'RECONCILIATION_EVIDENCE_MISSING');
    const invalid=previewDurableExitSettlement({
      positionId:'',accountId:account
    },base());
    locked(invalid);
    assert.equal(invalid.state,'RECONCILIATION_EVIDENCE_MISSING');
  });
});
describe('Phase100 actual SQLite read snapshot remains non-mutating and does not settle',()=>{
  const create=(suffix:string)=>{
    const positionId='PH100-SQL-'+suffix;
    const attemptId='PH100-ATT-'+suffix;
    const ts='2026-11-21T08:00:00Z';
    const position:EmaLivePosition={
      id:positionId,attemptId,signalId:'PH100-SIGNAL',
      instrument:'NIFTY',brokerAccountId:account,
      brokerInstrumentKey:inst,tradingsymbol:'PH100CE',
      optionType:'CE',strikePrice:24000,expiryDate:'2026-12-31',
      productType:'MIS',side:'BUY',marketBias:'BULLISH',
      entryBrokerOrderId:'PH100-BUY',entryTimestamp:ts,
      entryPrice:100,quantity:100,lotSize:50,
      currentPrice:100,unrealizedPnl:0,stopLoss:80,targetPrice:130,
      status:'EXIT_PENDING',exitBrokerOrderId:'PH100-SELL',
      exitFilledQuantity:0,grossPnl:0,brokerage:40,netPnl:0,
      createdAt:ts,updatedAt:ts
    };
    const attempt:EmaLiveOrderAttempt={
      id:attemptId,signalId:'PH100-SIGNAL',
      executionMode:'LIVE',instrument:'NIFTY',
      brokerAccountId:account,brokerInstrumentKey:inst,
      tradingsymbol:'PH100CE',optionType:'CE',
      strike:24000,expiry:'2026-12-31',
      requestedQuantity:100,filledQuantity:100,averageFillPrice:100,
      orderStatus:'FILLED',brokerOrderId:'PH100-BUY',
      createdAt:ts,updatedAt:ts
    };
    return {position,attempt};
  };
  it('SQLite read joins BUY/child/trades consistently; preview is redacted and leaves pending/P&L unchanged',async()=>{
    await dbEngine.initialize();
    const {position,attempt}=create('ONE');
    dbEngine.saveEmaLiveOrderAttempt(attempt);
    dbEngine.saveEmaLivePosition(position);
    const pre=dbEngine.readEmaExitSettlementEvidence(position.id);
    assert.equal(pre.observations.length,0);
    assert.equal(pre.trades.length,0);
    const prepared={
      positionId:position.id,accountId:account,instrumentKey:inst,
      product:'MIS' as const,orderId:'PH100-SELL',
      exchangeOrderId:'PH100-EXCHANGE',
      requestedQuantity:100,filledQuantity:100,pendingQuantity:0,
      currentNetQuantity:0,brokerStatus:'COMPLETE',
      trades:trades().map(t=>({
        tradeId:t.tradeId,exchangeOrderId:t.exchangeOrderId,
        quantity:t.quantity,price:t.price
      }))
    };
    const capture=dbEngine.appendEmaExitChildTradeEvidence(prepared);
    assert.equal(capture.state,'RECORDED_BROKER_EVIDENCE_NOT_SETTLEMENT');
    const before=dbEngine.readEmaExitSettlementEvidence(position.id);
    assert.equal(before.observations.length,1);
    assert.equal(before.trades.length,2);
    const result=previewDurableExitSettlement({
      positionId:position.id,accountId:account
    },{...before,freshBrokerNetQuantity:0});
    locked(result);
    assert.equal(result.state,'BROKER_FLAT_OBSERVED_NOT_CERTIFIED');
    assert.equal(result.indicativeGrossPremiumDifference,2500);
    const after=dbEngine.readEmaExitSettlementEvidence(position.id);
    assert.deepEqual(after,before);
    const still=dbEngine.getOpenEmaLivePositions()
      .find(x=>x.id===position.id);
    assert.equal(still?.status,'EXIT_PENDING');
    assert.equal(still?.exitFilledQuantity,0);
    assert.equal(still?.grossPnl,0);
    assert.equal(still?.netPnl,0);
  });
  it('SQLite read of absent durable position returns missing evidence, never invented flat net',async()=>{
    await dbEngine.initialize();
    const raw=dbEngine.readEmaExitSettlementEvidence('PH100-MISSING');
    assert.equal(raw.position,null);
    assert.equal(raw.entryAttempt,null);
    assert.deepEqual(raw.trades,[]);
    assert.deepEqual(raw.observations,[]);
    const result=previewDurableExitSettlement({
      positionId:'PH100-MISSING',accountId:account
    },{...raw,freshBrokerNetQuantity:0});
    locked(result);
    assert.equal(result.state,'RECONCILIATION_EVIDENCE_MISSING');
  });
});
