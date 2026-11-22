import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditMissingGttHistoricalExitJoin,
  type MissingGttHistoricalExitScope,
  type MissingGttHistoricalExitSources,
  type MissingGttHistoricalExitReport
} from '../../server/engine/ema15m/adaptiveNrmlMissingGttHistoricalExitJoin.js';
import {
  auditSingleSellGttRestartQuarantine,
  type RestartGttReport,
  type RestartGttScope
} from '../../server/engine/ema15m/adaptiveNrmlMissingGttRestartQuarantine.js';
import {
  auditHistoricalFoTradeHistory,type HistoricalFoScope,
  type HistoricalFoReceipt
} from '../../server/engine/ema15m/adaptiveHistoricalFoTradeReview.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const scope:MissingGttHistoricalExitScope={
  originalLongQuantity:100,lotSize:50,immutableBuyTradeCount:2,
  immutableSellTradeCount:2,immutableSellFilledQuantity:100
};
const rScope:RestartGttScope={
  expectedAccountId:'PH115-ACCOUNT-SECRET',
  instrumentKey:'NSE_FO|PH115-PRIVATE-CE',
  originalBuyOrderId:'PH115-BUY',
  gttOrderId:'GTT-PH115-SELL-ENTRY',
  originalLongQuantity:100,lotSize:50
};
const foScope:HistoricalFoScope={
  expectedAccountId:rScope.expectedAccountId,
  startDate:'2026-11-20',entryTradeDate:'2026-11-20',
  endDate:'2026-11-22',asOfDate:'2026-11-22',
  underlyingSymbol:'NIFTY',optionType:'CE',strikePrice:25000,
  expiryDate:'2026-12-31',exchange:'NFO',
  originalBuyQuantity:100,exitedSellQuantity:100
};
const buys:HistoricalFoReceipt[]=[
  {tradeId:'PH115-B1',exchangeOrderId:'PH115-BUYEX',quantity:50,price:100},
  {tradeId:'PH115-B2',exchangeOrderId:'PH115-BUYEX',quantity:50,price:120}
];
const sells:HistoricalFoReceipt[]=[
  {tradeId:'PH115-S1',exchangeOrderId:'PH115-SELLEX',quantity:50,price:90},
  {tradeId:'PH115-S2',exchangeOrderId:'PH115-SELLEX',quantity:50,price:95}
];
const native=(id:string,side:'BUY'|'SELL',qty:number,price:number,
 edit:Record<string,unknown>={})=>({
  segment:'FO',exchange:'NFO',option_type:'CE',
  quantity:qty,amount:qty*price,trade_id:id,
  trade_date:side==='BUY'?'2026-11-20':'2026-11-22',
  transaction_type:side,
  scrip_name:'NIFTY',symbol:'NIFTY',
  strike_price:'25000.0',expiry:'2026-12-31',price,
  instrument_token:'',...edit
});
const rows=()=>[
  native('PH115-B1','BUY',50,100),
  native('PH115-B2','BUY',50,120),
  native('PH115-S1','SELL',50,90),
  native('PH115-S2','SELL',50,95)
];
const page=(data:unknown[],total=data.length)=>({
  status:'success',data,
  meta_data:{page:{page_number:1,page_size:1000,
    total_pages:1,total_records:total}}
});
const hist=(tradeRows:unknown[]=rows(),
 buy=buys,sell=sells,s=foScope)=>auditHistoricalFoTradeHistory(s,{
  connected:true,connectedAccountId:rScope.expectedAccountId,
  pages:[page(tradeRows)],buyTrades:buy,sellTrades:sell
});
const restart=(remaining:unknown=0,orphan=false):RestartGttReport=>{
  const raw=auditSingleSellGttRestartQuarantine(rScope,{
    exactGtt:[],allGtts:[],
    positions:[{instrument_token:rScope.instrumentKey,
      product:'D',net_quantity:remaining}],
    orderBook:orphan?[{
      order_id:'PH115-ORPHAN-SELL',
      order_ref_id:rScope.gttOrderId,
      instrument_token:rScope.instrumentKey,
      product:'D',transaction_type:'SELL',
      status:'complete',filled_quantity:100
    }]:[]
  });
  return {...raw,brokerReadPasses:2};
};
const sources=(remaining:unknown=0,orphan=false):MissingGttHistoricalExitSources=>({
  restart:restart(remaining,orphan),history:hist(),
  freshBrokerNet:remaining
});
const audit=(s=scope,e:MissingGttHistoricalExitSources=sources())=>
  auditMissingGttHistoricalExitJoin(s,e);
function neverTrade(r:MissingGttHistoricalExitReport):void{
  for(const flag of [
    'trueGttParentCompletedOrCancelledIndependentlyVerified',
    'historicalFoOrderIdAndInstrumentTokenLinkCertified',
    'signedExchangeExecutionContractNotesVerified',
    'completeBrokerAccountAcrossSessionsCertified',
    'stopCloseOnlyAndNoShortCertified',
    'stopChildVenueAckIndependentlyCertified',
    'brokerSnapshotsAtomic','brokerGttSellGapFillGuaranteed',
    'capitalMarginChargesAndTaxesReconciled',
    'automaticPositionClosureAuthorized',
    'realisedPnlWriteAuthorized','duplicateSellRetryAuthorized',
    'gttCancelOrReplaceAuthorized','liveNrmlBuyAuthorized'
  ] as const)assert.equal(r[flag],false,flag);
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    status:'OPEN',productType:'NRML'
  }),false);
  for(const secret of [
    rScope.expectedAccountId,rScope.instrumentKey,
    rScope.originalBuyOrderId,rScope.gttOrderId,
    'PH115-B1','PH115-S1','PH115-BUYEX','PH115-SELLEX',
    'PH115-ORPHAN-SELL','PH115-BEARER-SECRET'
  ])assert.equal(JSON.stringify(r).includes(secret),false);
}
describe('Phase115 missing completed SELL GTT + full historical FO trade IDs no settlement',()=>{
  it('matched full 100 SELL and flat net are descriptive only, NEVER automatic CLOSED',()=>{
    const r=audit();neverTrade(r);
    assert.equal(r.state,
      'BROKER_REPORTED_HISTORICAL_BUY_SELL_MATCH_NO_GTT_CLOSE_CERTIFICATE');
    assert.equal(r.brokerReportedCurrentNetQuantity,0);
    assert.equal(r.immutableSellFilledQuantity,100);
    assert.equal(r.historicalTradeIdsDescriptivelyMatched,true);
    assert.equal(r.brokerReportedFlatPosition,true);
    assert.equal(r.brokerHistoricalMatchedBuyTradeCount,2);
    assert.equal(r.brokerHistoricalMatchedSellTradeCount,2);
    assert.equal(r.brokerHistoricalReadPageCount,1);
    assert.equal(r.gttParentMissingAcrossTwoReads,true);
    assert.equal(r.automaticPositionClosureAuthorized,false);
  });
  it('missing GTT with orphan same-contract SELL and flat still does not prove GTT child ID',()=>{
    const r=audit(scope,sources(0,true));neverTrade(r);
    assert.equal(r.state,
      'BROKER_REPORTED_HISTORICAL_BUY_SELL_MATCH_NO_GTT_CLOSE_CERTIFICATE');
    assert.equal(r.orphanGttSellChildSeenInCurrentDayBook,true);
    assert.equal(r.trueGttParentCompletedOrCancelledIndependentlyVerified,false);
  });
  it('partial 50 SELL + 50 broker net matches history but not native stop',()=>{
    const src:MissingGttHistoricalExitSources={
      restart:restart(50),
      history:hist(rows().slice(0,3),buys,sells.slice(0,1),{
        ...foScope,exitedSellQuantity:50
      }),
      freshBrokerNet:50
    };
    const r=audit({...scope,immutableSellFilledQuantity:50,
      immutableSellTradeCount:1},src);
    neverTrade(r);
    assert.equal(r.state,
      'BROKER_REPORTED_HISTORICAL_BUY_SELL_MATCH_NO_GTT_CLOSE_CERTIFICATE');
    assert.equal(r.brokerReportedCurrentNetQuantity,50);
    assert.equal(r.brokerReportedFlatPosition,false);
  });
  it('historical FO matching all trade IDs but current net too high is not reconciled',()=>{
    const r=audit(scope,sources(50));neverTrade(r);
    assert.equal(r.state,'HISTORICAL_SELL_QUANTITY_OR_BROKER_NET_CONFLICT');
    assert.equal(r.historicalTradeIdsDescriptivelyMatched,false);
  });
  it('historical FO matching all trade IDs but current net too low is not reconciled',()=>{
    const src=sources(0);src.freshBrokerNet=50;
    const r=audit(scope,src);neverTrade(r);
    assert.equal(r.state,'RESTART_GTT_ACCOUNT_OR_NET_NOT_VERIFIED');
  });
  it('missing broker net, null, scientific notation or duplicate history cannot approve',()=>{
    for(const bad of [null,'1e2','00',NaN,-1,101]){
      const src=sources(0);src.freshBrokerNet=bad;
      const r=audit(scope,src);neverTrade(r);
      assert.equal(r.state,'RESTART_GTT_ACCOUNT_OR_NET_NOT_VERIFIED');
    }
  });
  it('one-pass, absent or fake restart report cannot join completed GTT',()=>{
    for(const rst of [
      null,{...restart(0),brokerReadPasses:1 as const},
      {...restart(0),brokerReportedGttPresent:true},
      {...restart(0),state:'SCHEDULED_GTT_NO_GENERATED_CHILD_RESTART_UNPROTECTED' as const}
    ]){
      const r=audit(scope,{restart:rst,history:hist(),freshBrokerNet:0});
      neverTrade(r);
      assert.equal(r.state,'RESTART_GTT_ACCOUNT_OR_NET_NOT_VERIFIED');
    }
  });
  it('generated child ID needs Phase113, cannot be patched by historical FO row alone',()=>{
    const r=audit(scope,{
      restart:{...restart(0),
        state:'GENERATED_SELL_CHILD_REQUIRES_TRADE_NET_AUDIT'},
      history:hist(),freshBrokerNet:0
    });neverTrade(r);
    assert.equal(r.state,
      'TRIGGERED_GTT_CHILD_MUST_USE_SEPARATE_PHASE113_AUDIT');
  });
  it('historical page is missing a known immutable SELL ID -> no trade proof',()=>{
    const r=audit(scope,{
      restart:restart(0),
      history:hist(rows().slice(0,3)),
      freshBrokerNet:0
    });neverTrade(r);
    assert.equal(r.state,
      'HISTORICAL_FO_SOURCE_OR_ORIGINAL_TRADE_MATCH_INCOMPLETE');
  });
  it('additional same-contract trade ID in FO history conflicts with immutable SELL',()=>{
    const r=audit(scope,{
      restart:restart(0),
      history:hist([...rows(),native('PH115-EXTRA','SELL',50,60)]),
      freshBrokerNet:0
    });neverTrade(r);
    assert.equal(r.state,
      'HISTORICAL_FO_SOURCE_OR_ORIGINAL_TRADE_MATCH_INCOMPLETE');
  });
  it('wrong contract/expiry/trade ID in actual history must not match original',()=>{
    const changes=[
      {option_type:'PE'},{expiry:'2027-01-07'},
      {trade_id:'PH115-WRONG-TRADE'},
      {transaction_type:'BUY'}
    ];
    for(const edit of changes){
      const rows0:Record<string,unknown>[]=rows();
      rows0[2]={...rows0[2],...edit};
      const r=audit(scope,{
        restart:restart(0),history:hist(rows0),
        freshBrokerNet:0
      });neverTrade(r);
      assert.equal(r.state,
        'HISTORICAL_FO_SOURCE_OR_ORIGINAL_TRADE_MATCH_INCOMPLETE');
    }
  });
  it('historical trade report source is broker-reported only and cannot claim venue cert',()=>{
    const source=sources(0);
    source.history={...hist(),
      historicalTradesIndependentlyCertified:true} as any;
    const r=audit(scope,source);neverTrade(r);
    assert.equal(r.state,
      'HISTORICAL_FO_SOURCE_OR_ORIGINAL_TRADE_MATCH_INCOMPLETE');
  });
  it('historical nonzero unledgered same contract prevents any descriptive pass',()=>{
    const source=sources(0);
    source.history={...hist(),otherSameContractTrades:1};
    const r=audit(scope,source);neverTrade(r);
    assert.equal(r.state,
      'HISTORICAL_FO_SOURCE_OR_ORIGINAL_TRADE_MATCH_INCOMPLETE');
  });
  it('different or missing historical receipt counts cannot be silently interpreted complete',()=>{
    for(const source of [
      {history:null},
      {history:{...hist(),matchedOriginalBuyTrades:1}},
      {history:{...hist(),matchedExitSellTrades:1}},
      {history:{...hist(),requestedPageCount:0}}
    ]){
      const r=audit(scope,{...sources(),...source});
      neverTrade(r);
      assert.equal(r.state,
        'HISTORICAL_FO_SOURCE_OR_ORIGINAL_TRADE_MATCH_INCOMPLETE');
    }
  });
  it('original BUY quantity, lot or immutable SELL quantities invalid are denied',()=>{
    const cases=[
      {...scope,originalLongQuantity:75},
      {...scope,lotSize:0},
      {...scope,immutableBuyTradeCount:0},
      {...scope,immutableSellTradeCount:0},
      {...scope,immutableSellFilledQuantity:0},
      {...scope,immutableSellFilledQuantity:101},
      {...scope,immutableBuyTradeCount:5001}
    ];
    for(const candidate of cases){
      const r=audit(candidate);neverTrade(r);
      assert.equal(r.state,'INVALID_SCOPE');
    }
  });
  it('nonzero budget or permitted actions in input reports never become release',()=>{
    const source=sources();
    source.restart={...restart(0),
      duplicateSellRetryAuthorized:true} as any;
    const r=audit(scope,source);neverTrade(r);
    assert.equal(r.state,'RESTART_GTT_ACCOUNT_OR_NET_NOT_VERIFIED');
  });
  it('SUPERADMIN route pins two broker epochs, repeats GTT and journal, never writes',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const start=app.indexOf("app.post('/api/ema15m/nrml-missing-gtt-historical-sell-review'");
    const end=app.indexOf('  // Phase95:',start);
    assert.ok(start>0&&end>start);
    const txt=app.slice(start,end);
    for(const required of [
      'requireSuperAdmin','no-store','getOpenEmaLivePositions',
      'readEmaJointBuySellEvidence','immutableOriginalDebitMatchesReceipt',
      'reviewSingleSellGttRestartTwoPassReadOnly',
      'reviewHistoricalFoTradeHistoryReadOnly',
      'getHistoricalFoAuthEpoch','getBrokerAuthEpoch',
      'getVerifiedLivePositionQuantity',
      'auditMissingGttHistoricalExitJoin',
      'JSON.stringify(initial)!==JSON.stringify(repeated)',
      'JSON.stringify(before)!==JSON.stringify(after)'
    ])assert.ok(txt.includes(required),required);
    for(const forbidden of [
      'placeOrder(','cancelOrder(','modifyOrder(','placeGttOrder(',
      'saveEmaLivePosition(','updateEmaLivePosition(','squareOff('
    ])assert.equal(txt.includes(forbidden),false,forbidden);
  });
});
