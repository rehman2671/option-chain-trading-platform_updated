import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  previewJointBuySellReceipts,type JointReceiptInputs
} from '../../server/engine/ema15m/adaptiveJointTradeReceiptReconciliation.js';
import {assessEmaLiveProductGate}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
import {dbEngine} from '../../server/db.js';
import type {EmaLivePosition,EmaLiveOrderAttempt}
  from '../../server/engine/ema15m/types.js';

const acct='PH102-ACCOUNT',inst='NSE_FO|PH102-CE';
const scope={positionId:'PH102-POS',accountId:acct};
const buy=()=>[
  {tradeId:'PH102-B1',exchangeOrderId:'PH102-BUY-EX',quantity:50,price:105},
  {tradeId:'PH102-B2',exchangeOrderId:'PH102-BUY-EX',quantity:50,price:115}
];
const sell=()=>[
  {tradeId:'PH102-S1',exchangeOrderId:'PH102-SELL-EX',quantity:50,price:120},
  {tradeId:'PH102-S2',exchangeOrderId:'PH102-SELL-EX',quantity:50,price:130}
];
const initial=():JointReceiptInputs=>({
  position:{
    id:scope.positionId,attemptId:'PH102-ATT',
    brokerAccountId:acct,brokerInstrumentKey:inst,
    productType:'MIS',status:'EXIT_PENDING',
    entryBrokerOrderId:'PH102-BUY',exitBrokerOrderId:'PH102-SELL',
    quantity:100,lotSize:50,exitFilledQuantity:0,entryPrice:110
  },
  entryAttempt:{
    id:'PH102-ATT',brokerAccountId:acct,brokerInstrumentKey:inst,
    brokerOrderId:'PH102-BUY',orderStatus:'FILLED',
    filledQuantity:100,requestedQuantity:100,averageFillPrice:110
  },
  observations:[{
    observationId:1,positionId:scope.positionId,
    brokerOrderId:'PH102-SELL',accountId:acct,instrumentKey:inst,
    product:'MIS',exchangeOrderId:'PH102-SELL-EX',
    requestedQuantity:100,filledQuantity:100,pendingQuantity:0,
    currentNetQuantity:0,brokerStatus:'COMPLETE',tradeCount:2
  }],
  trades:sell(),freshBrokerNetQuantity:0,
  originalBuyReceipt:{
    positionId:scope.positionId,accountId:acct,attemptId:'PH102-ATT',
    orderId:'PH102-BUY',instrumentKey:inst,product:'MIS',
    exchangeOrderId:'PH102-BUY-EX',originalQuantity:100,
    brokerReportedAveragePrice:110,tradeCount:2
  },
  originalBuyTrades:buy()
});
const preview=(s:JointReceiptInputs)=>
  previewJointBuySellReceipts(scope,s);
const invariant=(r:ReturnType<typeof preview>)=>{
  assert.equal(r.chargesAndTaxesIndependentlyVerified,false);
  assert.equal(r.originalBuyExchangeExecutionsIndependentlyCertified,false);
  assert.equal(r.sellExchangeExecutionsIndependentlyCertified,false);
  assert.equal(r.externalAccountOrdersAndGttsReconciled,false);
  assert.equal(r.sourceSnapshotsAtomic,false);
  assert.equal(r.automaticPositionClosureAuthorized,false);
  assert.equal(r.realisedPnlWriteAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.netRealisedPnl,null);
  assert.equal(r.manualRiskSignoffRequired,true);
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  const output=JSON.stringify(r);
  for(const value of [acct,inst,scope.positionId,'PH102-BUY',
    'PH102-SELL','PH102-B1','PH102-S1','PH102-BUY-EX','PH102-SELL-EX'])
    assert.ok(!output.includes(value),'raw broker identity in response');
};
const change=(s:JointReceiptInputs,field:'originalBuyReceipt'|'entryAttempt'|'position',
  patch:Record<string,unknown>)=>{
  s[field]={...(s[field] as Record<string,unknown>),...patch};
};
describe('Phase102 joint original BUY / SELL immutable broker-reported receipts',()=>{
  it('BUY 50@105+50@115, SELL 50@120+50@130 -> indicative 1500, NOT realised',()=>{
    const r=preview(initial());invariant(r);
    assert.equal(r.state,'BROKER_REPORTED_BUY_AND_SELL_FLAT_NOT_CERTIFIED');
    assert.equal(r.originalBuyQuantity,100);
    assert.equal(r.originalBuyTradeCount,2);
    assert.equal(r.matchedSellTradeCount,2);
    assert.equal(r.indicativeGrossTradeDifference,1500);
    assert.equal(r.brokerReportedRemainingQuantity,0);
  });
  it('partial 50 SELL at 120 and broker 50 remaining -> indicative 500 only',()=>{
    const s=initial();
    s.observations=[{
      ...(s.observations as Record<string,unknown>[])[0],
      filledQuantity:50,pendingQuantity:50,currentNetQuantity:50,
      brokerStatus:'PARTIALLY FILLED',tradeCount:1
    }];
    s.trades=[sell()[0]];s.freshBrokerNetQuantity=50;
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BROKER_REPORTED_BUY_AND_SELL_PARTIAL_NOT_SETTLED');
    assert.equal(r.indicativeGrossTradeDifference,500);
  });
  it('loss after BUY at 110 and SELL at 90 is indicative negative, never realised net',()=>{
    const s=initial();s.trades=sell().map(t=>({...t,price:90}));
    const r=preview(s);invariant(r);
    assert.equal(r.indicativeGrossTradeDifference,-2000);
    assert.equal(r.netRealisedPnl,null);
  });
  it('unequal original BUY sizes 25@100 and 75@120 => weighted 115 and correct joint costs',()=>{
    const s=initial();
    s.originalBuyTrades=[
      {...buy()[0],quantity:25,price:100},
      {...buy()[1],quantity:75,price:120}
    ];
    change(s,'entryAttempt',{averageFillPrice:115});
    change(s,'position',{entryPrice:115});
    change(s,'originalBuyReceipt',{brokerReportedAveragePrice:115});
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BROKER_REPORTED_BUY_AND_SELL_FLAT_NOT_CERTIFIED');
    assert.equal(r.indicativeGrossTradeDifference,1000);
  });
  it('no SELL fills even if original BUY certified by broker never produces a profit preview',()=>{
    const s=initial();
    s.observations=[{
      ...(s.observations as Record<string,unknown>[])[0],
      filledQuantity:0,pendingQuantity:100,currentNetQuantity:100,
      brokerStatus:'OPEN',tradeCount:0
    }];
    s.trades=[];s.freshBrokerNetQuantity=100;
    const r=preview(s);invariant(r);
    assert.equal(r.state,'SOURCE_MISSING_OR_UNVERIFIED');
    assert.equal(r.indicativeGrossTradeDifference,null);
  });
  it('no original BUY receipt -> no illustrative profit even with broker-reported full SELL',()=>{
    const s=initial();s.originalBuyReceipt=null;
    const r=preview(s);invariant(r);
    assert.equal(r.state,'SOURCE_MISSING_OR_UNVERIFIED');
    assert.equal(r.indicativeGrossTradeDifference,null);
  });
  it('missing original BUY execution IDs does not fallback to stored average price',()=>{
    const s=initial();s.originalBuyTrades=[];
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
    assert.equal(r.indicativeGrossTradeDifference,null);
  });
  it('wrong original BUY order ID, account, contract, product, attempt and position ID fail',()=>{
    for(const edit of [
      {orderId:'PH102-OTHER-BUY'},{accountId:'PH102-OTHER-ACCOUNT'},
      {instrumentKey:'NSE_FO|PH102-OTHER'},{product:'NRML'},
      {attemptId:'PH102-OTHER-ATT'},{positionId:'PH102-OTHER-POS'}
    ]){
      const s=initial();change(s,'originalBuyReceipt',edit);
      const r=preview(s);invariant(r);
      assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
    }
  });
  it('entry journal unfilled, wrong account or order does not become authenticated BUY',()=>{
    for(const edit of [
      {orderStatus:'UNKNOWN'},{filledQuantity:50},
      {brokerAccountId:'PH102-WRONG'},{brokerOrderId:'PH102-WRONG'}
    ]){
      const s=initial();change(s,'entryAttempt',edit);
      const r=preview(s);invariant(r);
      assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
    }
  });
  it('BUY receipt count mismatch or original order size mismatch cannot net to SELL',()=>{
    for(const edit of [{tradeCount:1},{originalQuantity:50}]){
      const s=initial();change(s,'originalBuyReceipt',edit);
      const r=preview(s);invariant(r);
      assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
    }
  });
  it('duplicate original BUY trade ID cannot double count original long',()=>{
    const s=initial();s.originalBuyTrades=[buy()[0],buy()[0]];
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('BUY execution ID reused for SELL is ambiguous and cannot certify two directions',()=>{
    const s=initial();s.trades=[
      {...sell()[0],tradeId:'PH102-B1'},sell()[1]
    ];
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('BUY trade venue reference mismatch invalidates immutable receipt',()=>{
    const s=initial();s.originalBuyTrades=[
      {...buy()[0],exchangeOrderId:'PH102-BAD-EXCHANGE'},buy()[1]
    ];
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('BUY trade quantity sum less than original 100 is a conflict',()=>{
    const s=initial();s.originalBuyTrades=[{...buy()[0],quantity:25},buy()[1]];
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('BUY weighted trade price changed while durable entry remains fixed is blocked',()=>{
    const s=initial();s.originalBuyTrades=buy().map(t=>({...t,price:90}));
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('BUY receipt reported average differs by >1 paise from original attempt',()=>{
    const s=initial();change(s,'originalBuyReceipt',{brokerReportedAveragePrice:111});
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('invalid BUY trade prices/quantities and unsafe totals do not coerce or overflow',()=>{
    for(const edit of [{price:null},{price:'105'},{price:NaN},
      {price:105.123},{quantity:50.5},{quantity:-50},{quantity:null}]){
      const s=initial();
      s.originalBuyTrades=[{...buy()[0],...edit},buy()[1]];
      const r=preview(s);invariant(r);
      assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
      assert.equal(r.indicativeGrossTradeDifference,null);
    }
  });
  it('invalid or duplicate SELL execution IDs/quantities remain a conflict',()=>{
    for(const trades of [[sell()[0],sell()[0]],
      [{...sell()[0],quantity:100},sell()[1]],
      [{...sell()[0],price:0},sell()[1]]]){
      const s=initial();s.trades=trades;
      const r=preview(s);invariant(r);
      assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
    }
  });
  it('fresh broker net mismatching durable SELL fills blocks joint preview',()=>{
    const s=initial();s.freshBrokerNetQuantity=50;
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('missing fresh broker position source does not mean flat',()=>{
    const s=initial();s.freshBrokerNetQuantity=null;
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('same-contract NRML native product can be viewed descriptively, never released',()=>{
    const s=initial();
    change(s,'position',{productType:'NRML'});
    change(s,'originalBuyReceipt',{product:'NRML'});
    s.observations=(s.observations as Record<string,unknown>[]).map(x=>({...x,product:'NRML'}));
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BROKER_REPORTED_BUY_AND_SELL_FLAT_NOT_CERTIFIED');
  });
  it('changing SELL child exchange reference across durable observations conflicts',()=>{
    const s=initial();
    s.observations=[{
      ...(s.observations as Record<string,unknown>[])[0],
      filledQuantity:50,pendingQuantity:50,currentNetQuantity:50,
      brokerStatus:'PARTIALLY FILLED',tradeCount:1
    },{
      ...(s.observations as Record<string,unknown>[])[0],
      observationId:2,exchangeOrderId:'PH102-OTHER-EX'
    }];
    const r=preview(s);invariant(r);
    assert.equal(r.state,'BUY_SELL_LEDGER_CONFLICT');
  });
  it('private SQLite joint reader never mutates live positions or writes broker orders',()=>{
    const source=readFileSync('src/server/db.ts','utf8');
    const start=source.indexOf('public readEmaJointBuySellEvidence(');
    const end=source.indexOf('public appendEmaOriginalBuyTradeEvidence(',start);
    assert.ok(start>0&&end>start);
    const body=source.slice(start,end);
    assert.ok(body.includes('db.transaction('));
    assert.ok(body.includes('readEmaExitSettlementEvidence(positionId)'));
    assert.ok(!body.includes('UPDATE ema_live_positions'));
    assert.ok(!body.includes('placeOrder('));
  });
});
describe('Phase102 integration: both immutable SQLite receipt ledgers, no settlement writes',()=>{
  it('SQLite private joint read preserves BUY and SELL trade lineage, status remains EXIT_PENDING',async()=>{
    await dbEngine.initialize();
    const suffix='PH102-DB-A',posId=suffix+'-POS';
    const attemptId=suffix+'-ATT',buyId=suffix+'-BUY';
    const sellId=suffix+'-SELL',date='2026-11-21T09:00:00Z';
    const attempt:EmaLiveOrderAttempt={
      id:attemptId,signalId:'PH102-SIGNAL',executionMode:'LIVE',
      instrument:'NIFTY',brokerAccountId:acct,brokerInstrumentKey:inst,
      tradingsymbol:'PH102CE',optionType:'CE',strike:24000,
      expiry:'2026-12-31',requestedQuantity:100,filledQuantity:100,
      averageFillPrice:110,orderStatus:'FILLED',brokerOrderId:buyId,
      createdAt:date,updatedAt:date
    };
    const position:EmaLivePosition={
      id:posId,attemptId,signalId:'PH102-SIGNAL',
      instrument:'NIFTY',brokerAccountId:acct,brokerInstrumentKey:inst,
      tradingsymbol:'PH102CE',optionType:'CE',strikePrice:24000,
      expiryDate:'2026-12-31',productType:'MIS',side:'BUY',
      marketBias:'BULLISH',entryBrokerOrderId:buyId,entryTimestamp:date,
      entryPrice:110,quantity:100,lotSize:50,currentPrice:110,
      unrealizedPnl:0,stopLoss:80,targetPrice:150,status:'EXIT_PENDING',
      exitBrokerOrderId:sellId,exitFilledQuantity:0,
      grossPnl:0,brokerage:40,netPnl:0,
      createdAt:date,updatedAt:date
    };
    dbEngine.saveEmaLiveOrderAttempt(attempt);
    dbEngine.saveEmaLivePosition(position);
    const writtenBuy=dbEngine.appendEmaOriginalBuyTradeEvidence({
      positionId:posId,accountId:acct,attemptId,orderId:buyId,
      instrumentKey:inst,product:'MIS',
      exchangeOrderId:suffix+'-BUYEX',originalQuantity:100,
      brokerReportedAveragePrice:110,trades:buy().map(t=>({
        ...t,exchangeOrderId:suffix+'-BUYEX'
      }))
    });
    assert.equal(writtenBuy.state,'BROKER_BUY_RECEIPT_RECORDED_NOT_SETTLEMENT');
    const writtenSell=dbEngine.appendEmaExitChildTradeEvidence({
      positionId:posId,accountId:acct,orderId:sellId,
      instrumentKey:inst,product:'MIS',
      exchangeOrderId:suffix+'-SELLEX',requestedQuantity:100,
      filledQuantity:100,pendingQuantity:0,currentNetQuantity:0,
      brokerStatus:'COMPLETE',trades:sell().map(t=>({
        ...t,exchangeOrderId:suffix+'-SELLEX'
      }))
    });
    assert.equal(writtenSell.state,'RECORDED_BROKER_EVIDENCE_NOT_SETTLEMENT');
    const before=dbEngine.readEmaJointBuySellEvidence(posId);
    assert.equal(before.originalBuyTrades.length,2);
    assert.equal(before.trades.length,2);
    assert.equal(before.observations.length,1);
    const r=previewJointBuySellReceipts({
      positionId:posId,accountId:acct
    },{...before,freshBrokerNetQuantity:0});
    invariant(r);
    assert.equal(r.state,'BROKER_REPORTED_BUY_AND_SELL_FLAT_NOT_CERTIFIED');
    assert.equal(r.indicativeGrossTradeDifference,1500);
    const after=dbEngine.readEmaJointBuySellEvidence(posId);
    assert.deepEqual(after,before);
    const still=dbEngine.getOpenEmaLivePositions().find(x=>x.id===posId);
    assert.equal(still?.status,'EXIT_PENDING');
    assert.equal(still?.exitFilledQuantity,0);
    assert.equal(still?.grossPnl,0);
    assert.equal(still?.netPnl,0);
  });
  it('SQLite missing original receipts cannot fabricate a completed original entry',async()=>{
    await dbEngine.initialize();
    const source=dbEngine.readEmaJointBuySellEvidence('PH102-NONE');
    assert.equal(source.position,null);
    assert.equal(source.originalBuyReceipt,null);
    assert.deepEqual(source.originalBuyTrades,[]);
    const r=previewJointBuySellReceipts({
      positionId:'PH102-NONE',accountId:acct
    },{...source,freshBrokerNetQuantity:0});
    invariant(r);
    assert.equal(r.state,'SOURCE_MISSING_OR_UNVERIFIED');
  });
});
