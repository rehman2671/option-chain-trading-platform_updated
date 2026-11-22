import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {immutableOriginalDebitMatchesReceipt,reviewMultiweekNrmlCarryDebitRisk,
  type MultiweekNrmlCarryScope,
  type MultiweekNrmlCarryEvidence,
  type MultiweekNrmlCarryReport
} from '../../server/engine/ema15m/adaptiveNrmlMultiweekCarryDebitRisk.js';
import type {ExistingNrmlDayStopReport} from
  '../../server/engine/ema15m/adaptiveExistingNrmlDayStopReadOnly.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const s:MultiweekNrmlCarryScope={
  expectedAccountId:'PH111-ACCOUNT-PRIVATE',
  instrumentKey:'NSE_FO|PH111-PRIVATE-CE',
  originalBuyOrderId:'PH111-BUY-PRIVATE',
  product:'NRML',side:'LONG_CALL',
  originalQuantity:100,lotSize:50,
  declaredExpiryDate:'2027-02-15',
  horizonWeeks:4,
  observedAt:'2026-11-22T14:00:00+05:30',
  originalUnitPremiumINR:120.25,
  declaredDebitBudgetINR:15000
};
const net=(n:unknown=100)=>({instrument_token:s.instrumentKey,
  product:'D',net_quantity:n});
const buy=()=>({
  order_id:s.originalBuyOrderId,instrument_token:s.instrumentKey,
  product:'D',transaction_type:'BUY',status:'complete'
});
const e=(n:unknown=100):MultiweekNrmlCarryEvidence=>({
  positions:[net(n)],orderBook:[buy()],gttOrders:[]
});
const run=(scope=s,snapshot=e())=>
  reviewMultiweekNrmlCarryDebitRisk(scope,snapshot);
function neverTrade(r:MultiweekNrmlCarryReport):void{
  for(const name of [
    'contractExpiryFromExchangeMasterCertified',
    'operatorDebitBudgetIndependentlyApproved',
    'statutoryFeesAndTaxesIncluded',
    'brokerAccountWideExposureIndependentlyCertified',
    'dayStopMultiSessionPersistent',
    'externalGttExitForExistingLongApiSupported',
    'secondGttEntryOrBuyAuthorized',
    'gapFillPriceGuaranteed','overnightProtectionCertified',
    'realBrokerExecutionAuthorized','automaticPositionClosureAuthorized',
    'realisedPnlWriteAuthorized','nrmlPositional1515ForcedSquareOff',
    'liveNrmlBuyAuthorized'
  ] as const)assert.equal(r[name],false,name);
  assert.equal(r.independentlyCertifiedStopCoveredQuantity,0);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible(
    {status:'OPEN',productType:'NRML'}),false);
  for(const value of [s.expectedAccountId,s.instrumentKey,
    s.originalBuyOrderId,'PH111-TOKEN-SECRET'])
    assert.equal(JSON.stringify(r).includes(value),false);
}
const day=():ExistingNrmlDayStopReport=>({
  state:'BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION',
  reasonCodes:[],nativeSellStopTypeObserved:'SL',
  nativeValidityDayObserved:true,
  brokerReportedExchangeIdObserved:true,
  brokerReportedOriginalLongQuantity:100,
  brokerReportedStopFilledQuantity:0,
  brokerReportedStopPendingQuantity:100,
  brokerReportedRemainingLongQuantity:100,
  quantityWithoutIndependentlyCertifiedOvernightStop:100,
  brokerReadPasses:2,sameBrokerSessionAcrossPasses:true,
  brokerSnapshotsAtomic:false,
  stopPersistsAcrossMarketSessions:false,
  overnightOptionGapProtectionCertified:false,
  brokerExchangeStopAckIndependentlyCertified:false,
  brokerStopFillGuaranteed:false,stopPlacementOrAmendmentAuthorized:false,
  newGttEntryOrBuyAuthorized:false,
  capitalMarginAndStrategyApproved:false,
  realisedPnlWriteAuthorized:false,
  automaticPositionClosureAuthorized:false,
  liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
});
describe('Phase111 read-only NRML 1W–8W calendar carry and debit-at-risk',()=>{
  it('4W future expiry: 28 calendar boundaries, 100 units and debit ₹12025 not insured',()=>{
    const r=run();neverTrade(r);
    assert.equal(r.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
    assert.equal(r.horizonWeeks,4);
    assert.equal(r.calendarDaysPlanned,28);
    assert.equal(r.calendarDayTransitionsBeforeExpiry,28);
    assert.equal(r.calendarBoundariesWithoutIndependentlyCertifiedStop,28);
    assert.equal(r.estimatedRemainingPremiumDebitINR,12025);
    assert.equal(r.estimatedOriginalPremiumDebitINR,12025);
    assert.equal(r.brokerReportedRemainingLongQuantity,100);
    assert.equal(r.declaredBudgetINR,15000);
    assert.equal(r.brokerReportedDayStopObserved,false);
  });
  it('all planned 1W/2W/4W/8W horizons remain unverified, never fallback intraday',()=>{
    for(const [weeks,days] of [[1,7],[2,14],[4,28],[8,56]] as const){
      const r=run({...s,horizonWeeks:weeks});
      neverTrade(r);
      assert.equal(r.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
      assert.equal(r.calendarDaysPlanned,days);
      assert.equal(r.calendarBoundariesWithoutIndependentlyCertifiedStop,days);
    }
  });
  it('50 unit partial exit: cap remaining premium at original per-unit cost; no settlement',()=>{
    const r=run(s,e(50));neverTrade(r);
    assert.equal(r.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
    assert.equal(r.brokerReportedRemainingLongQuantity,50);
    assert.equal(r.estimatedRemainingPremiumDebitINR,6012.5);
    assert.equal(r.estimatedOriginalPremiumDebitINR,12025);
    assert.equal(r.automaticPositionClosureAuthorized,false);
  });
  it('a matching two-pass native DAY stop still covers ZERO verified overnights',()=>{
    const o=day();
    const b=e();b.existingDayStopReport=o;
    b.orderBook=[buy(),{
      order_id:'PH111-DAY-STOP',instrument_token:s.instrumentKey,
      product:'D',transaction_type:'SELL',status:'trigger pending',
      order_type:'SL',validity:'DAY',filled_quantity:0
    }];
    const r=run({...s,inspectedDayStopOrderId:'PH111-DAY-STOP'},b);
    neverTrade(r);
    assert.equal(r.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
    assert.equal(r.brokerReportedDayStopObserved,true);
    assert.equal(r.calendarBoundariesWithoutIndependentlyCertifiedStop,28);
    assert.ok(r.reasonCodes.includes(
      'EXISTING_DAY_SELL_STOP_NOT_PERSISTENT_OVERNIGHT'));
  });
  it('a stale/partial Phase110 stop report cannot be promoted to current net insurance',()=>{
    for(const candidate of [null,
      {...day(),brokerReadPasses:1} as ExistingNrmlDayStopReport,
      {...day(),brokerReportedRemainingLongQuantity:50},
      {...day(),state:'DAY_SELL_STOP_STATE_CHANGED_BETWEEN_READS' as const}
    ]){
      const b=e();b.existingDayStopReport=candidate;
      const r=run({...s,inspectedDayStopOrderId:'PH111-DAY-STOP'},b);
      neverTrade(r);
      assert.equal(r.state,'BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT');
      assert.equal(r.estimatedRemainingPremiumDebitINR,12025);
      assert.equal(r.brokerReportedDayStopObserved,false);
    }
  });
  it('premium exceeds operator-declared budget, even without any other risk blocker',()=>{
    const r=run({...s,declaredDebitBudgetINR:12024.99});neverTrade(r);
    assert.equal(r.state,'PREMIUM_DEBIT_EXCEEDS_DECLARED_BUDGET');
    assert.equal(r.estimatedRemainingPremiumDebitINR,12025);
  });
  it('budget exactly equal to debit passes math but remains BLOCKED from live',()=>{
    const r=run({...s,declaredDebitBudgetINR:12025});
    neverTrade(r);
    assert.equal(r.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
    assert.equal(r.operatorDebitBudgetIndependentlyApproved,false);
  });
  it('expiry before 8W horizon blocks; 1W may still be calendar-feasible but unprotected',()=>{
    const declaredExpiryDate='2026-12-08'; // 16 calendar days from 22 Nov
    const a=run({...s,declaredExpiryDate,horizonWeeks:8});neverTrade(a);
    assert.equal(a.state,'PROPOSED_HORIZON_EXTENDS_BEYOND_DECLARED_EXPIRY');
    assert.equal(a.calendarDayTransitionsBeforeExpiry,16);
    assert.equal(a.calendarBoundariesWithoutIndependentlyCertifiedStop,16);
    const b=run({...s,declaredExpiryDate,horizonWeeks:1});neverTrade(b);
    assert.equal(b.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
    assert.equal(b.calendarDayTransitionsBeforeExpiry,7);
  });
  it('expiry on/past review date blocks without claiming zero protected exposure',()=>{
    for(const expiry of ['2026-11-22','2026-11-21']){
      const r=run({...s,declaredExpiryDate:expiry});neverTrade(r);
      assert.equal(r.state,'OPTION_EXPIRY_AT_OR_BEFORE_REVIEW');
      assert.equal(r.calendarDayTransitionsBeforeExpiry,0);
      assert.equal(r.estimatedRemainingPremiumDebitINR,12025);
    }
  });
  it('IST +05:30 local calendar controls date boundaries, not UTC calendar',()=>{
    const a=run({...s,observedAt:'2026-11-22T23:59:59+05:30',
      declaredExpiryDate:'2026-11-29',horizonWeeks:1});neverTrade(a);
    assert.equal(a.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
    assert.equal(a.calendarDayTransitionsBeforeExpiry,7);
    const b=run({...s,observedAt:'2026-11-23T00:00:00+05:30',
      declaredExpiryDate:'2026-11-29',horizonWeeks:1});neverTrade(b);
    assert.equal(b.state,'PROPOSED_HORIZON_EXTENDS_BEYOND_DECLARED_EXPIRY');
    assert.equal(b.calendarDayTransitionsBeforeExpiry,6);
  });
  it('existing GTT on same option remains potentially new ENTRY, not protection',()=>{
    const x=e();x.gttOrders=[{gtt_order_id:'GTT-UNAUTHORISED',
      instrument_token:s.instrumentKey,product:'D',
      rules:[{strategy:'ENTRY',transaction_type:'BUY'}]}];
    const r=run(s,x);neverTrade(r);
    assert.equal(r.state,'BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT');
  });
  it('unattributed same-option active BUY or SELL prevents accurate long scope',()=>{
    for(const candidate of [
      {order_id:'OTHER-BUY',transaction_type:'BUY',status:'open',filled_quantity:0},
      {order_id:'OTHER-SELL',transaction_type:'SELL',status:'cancel pending',filled_quantity:0},
      {order_id:'OTHER-SELL-FILLED',transaction_type:'SELL',status:'complete',filled_quantity:50}
    ]){
      const x=e();x.orderBook=[buy(),{
        ...candidate,instrument_token:s.instrumentKey,product:'D'
      }];
      const r=run(s,x);neverTrade(r);
      assert.equal(r.state,'BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT');
    }
  });
  it('a terminal unfilled unrelated SELL is not a live competitor but no stop proof',()=>{
    const x=e();x.orderBook=[buy(),{
      order_id:'OLD-SELL',instrument_token:s.instrumentKey,
      product:'D',transaction_type:'SELL',status:'cancelled',
      filled_quantity:0
    }];
    const r=run(s,x);neverTrade(r);
    assert.equal(r.state,'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED');
  });
  it('missing, duplicate, short, wrong-product or non-whole-lot broker net fail',()=>{
    const bad=[
      {...e(),positions:[]},
      {...e(),positions:[net(100),net(100)]},
      {...e(),positions:[net(-50)]},
      {...e(),positions:[net(75)]},
      {...e(),positions:[net(150)]},
      {...e(),positions:[net('1e2')]},
      {...e(),positions:[net('0100')]},
      {...e(),positions:[net(0)]},
      {...e(),positions:[net(100),{...net(50),product:'I'}]}
    ];
    for(const snap of bad){
      const r=run(s,snap);neverTrade(r);
      assert.equal(r.state,'BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT');
      assert.equal(r.estimatedRemainingPremiumDebitINR,null);
    }
  });
  it('null broker orderbook, GTT or position sources cannot form empty health',()=>{
    for(const k of ['orderBook','gttOrders','positions'] as const){
      const x=e();(x as any)[k]=null;
      const r=run(s,x);neverTrade(r);
      assert.equal(r.state,'BROKER_ACCOUNT_SCOPE_INCOMPLETE');
      assert.equal(r.estimatedRemainingPremiumDebitINR,null);
    }
  });
  it('malformed account order or GTT census blocks before declaring absence',()=>{
    for(const x of [
      {...e(),orderBook:[null,buy()]},
      {...e(),gttOrders:[{}]},
      {...e(),orderBook:[{...buy(),transaction_type:'UNKNOWN'}]}
    ]){
      const r=run(s,x);neverTrade(r);
      assert.equal(r.state,'BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT');
    }
  });
  it('bogus dates, non-1/2/4/8 horizons, non-long product and bad debit reject scope',()=>{
    const cases=[
      {...s,declaredExpiryDate:'2026-02-30'},
      {...s,declaredExpiryDate:'2026/12/31'},
      {...s,observedAt:'2026-11-22'},
      {...s,horizonWeeks:3 as any},
      {...s,side:'SHORT_CALL' as any},
      {...s,product:'MIS' as any},
      {...s,originalUnitPremiumINR:0},
      {...s,originalUnitPremiumINR:120.256},
      {...s,declaredDebitBudgetINR:Infinity},
      {...s,declaredDebitBudgetINR:-5},
      {...s,originalQuantity:75},
      {...s,instrumentKey:'NSE_EQ|STOCK'},
      {...s,inspectedDayStopOrderId:s.originalBuyOrderId}
    ];
    for(const c of cases){
      const r=run(c);neverTrade(r);
      assert.equal(r.state,'INVALID_SCOPE');
    }
  });
  it('safe integer overflow cannot silently approve a huge premium or budget',()=>{
    const r=run({...s,originalQuantity:9007199254740000,lotSize:1});
    neverTrade(r);assert.equal(r.state,'INVALID_SCOPE');
    assert.equal(r.estimatedRemainingPremiumDebitINR,null);
    const b=run({...s,declaredDebitBudgetINR:1e14});neverTrade(b);
    assert.equal(b.state,'INVALID_SCOPE');
  });
  it('SuperAdmin route gets broker net, original immutable BUY and rechecks epoch',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const start=app.indexOf("app.post('/api/ema15m/nrml-multiweek-carry-risk-review'");
    const end=app.indexOf('  // Phase95:',start);
    assert.ok(start>0&&end>start);
    const block=app.slice(start,end);
    for(const name of [
      'requireSuperAdmin','no-store','getOpenEmaLivePositions',
      'readEmaJointBuySellEvidence','getVerifiedNrmlPositionRows',
      'getOrderBook','getGttOrders','getBrokerAuthEpoch',
      'reviewExistingNrmlDayStopReadOnly',
      'reviewMultiweekNrmlCarryDebitRisk',
      'JSON.stringify(first)!==JSON.stringify(last)'
    ])assert.ok(block.includes(name),name);
    for(const forbidden of ['placeOrder(','cancelOrder(',
      'modifyOrder(','placeGttOrder(','saveEmaLivePosition(',
      'updateEmaLivePosition(','squareOff('])
      assert.equal(block.includes(forbidden),false,forbidden);
  });
});

describe('Phase111 original BUY receipt weighted-debit integrity',()=>{
  const witness=()=>({
    originalQuantity:100,entryUnitPremiumINR:120.25,
    exchangeOrderId:'PH111-BUY-EXCHANGE',tradeCount:2,
    trades:[
      {tradeId:'PH111-ENTRY-T1',exchangeOrderId:'PH111-BUY-EXCHANGE',
        quantity:50,price:100},
      {tradeId:'PH111-ENTRY-T2',exchangeOrderId:'PH111-BUY-EXCHANGE',
        quantity:50,price:140.5}
    ]
  });
  it('two unique whole BUY trade receipts reconcile exactly to opening premium',()=>{
    assert.equal(immutableOriginalDebitMatchesReceipt(witness()),true);
  });
  it('duplicate immutable trade ID, replay and missing trade reject debit math',()=>{
    const a=witness();a.trades[1].tradeId=a.trades[0].tradeId;
    assert.equal(immutableOriginalDebitMatchesReceipt(a),false);
    const b=witness();b.trades.pop();
    assert.equal(immutableOriginalDebitMatchesReceipt(b),false);
    const c=witness();c.trades[1].quantity=49;
    assert.equal(immutableOriginalDebitMatchesReceipt(c),false);
  });
  it('wrong exchange-order reference or price disagreement cannot reduce reported risk',()=>{
    for(const edit of [
      {exchangeOrderId:'PH111-OTHER-EXCHANGE'},
      {price:130},
      {price:140.505},
      {quantity:0}
    ]){
      const a=witness();
      a.trades[1]={...a.trades[1],...edit};
      assert.equal(immutableOriginalDebitMatchesReceipt(a),false);
    }
  });
  it('untrusted source/overflow/invalid price/broker receipts reject risk',()=>{
    for(const x of [
      {...witness(),tradeCount:3},
      {...witness(),tradeCount:0},
      {...witness(),entryUnitPremiumINR:0},
      {...witness(),entryUnitPremiumINR:120.255},
      {...witness(),exchangeOrderId:''},
      {...witness(),trades:null},
      {...witness(),originalQuantity:9007199254740000}
    ]){
      assert.equal(immutableOriginalDebitMatchesReceipt(x),false);
    }
  });
});
