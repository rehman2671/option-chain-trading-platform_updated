import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase46LongOptionGapStress,hashPhase46GapEvidence,
  type Phase46GapStressInput,type Phase46GapStressPins,
  type Phase46GapStressPolicy,type Phase46Horizon,
  type Phase46IndexOptionGapPath,type Phase46OriginalL1Snapshot
} from '../../server/engine/ema15m/adaptiveUpstoxPhase46LongOptionGapRisk.js';

const H:Phase46Horizon[]=['1W','2W','4W','8W'];
const entry='2026-11-20T09:30:00+05:30';
const nextOpen='2026-11-23T09:15:00+05:30';
const preClose='2026-11-20T15:30:00+05:30';
const after=(date:string,days:number)=>
  new Date(Date.parse(date)+days*86400000).toISOString();
function quote(
  key:string,observedAt:string,bid:number,ask:number,
  bidDepth=65,askDepth=65
):Phase46OriginalL1Snapshot{
  return {
    instrumentKey:key,observedAt,
    availableAt:new Date(Date.parse(observedAt)+2000).toISOString(),
    bid,ask,displayedBidQuantity:bidDepth,
    displayedAskQuantity:askDepth
  };
}
function fixture(){
  const paths:Phase46IndexOptionGapPath[]=H.map((h,i)=>{
    const instrument='NSE_FO|SYNTHETIC_'+h.replace('W','W_OPT')+'_CE';
    return {
      horizon:h,source:'OPERATOR_SUPPLIED_ORIGINAL_L1_UNVERIFIED',
      contractType:'CASH_SETTLED_INDEX_OPTION_DECLARED_UNVERIFIED',
      instrumentKey:instrument,optionType:'CE',
      expiryAt:after(entry,[7,14,28,56][i]),
      lotSize:65,quantity:65,entryDecisionAt:entry,
      preCloseAt:preClose,nextSessionOpenAt:nextOpen,
      entryQuote:quote(instrument,'2026-11-20T09:29:00+05:30',
        245,250,65,65),
      preCloseQuote:quote(instrument,'2026-11-20T15:29:00+05:30',
        230,240,65,65),
      nextOpenQuote:quote(instrument,'2026-11-23T09:15:05+05:30',
        100,110,65,65),
      declaredStopTriggerPremium:220
    };
  });
  const input:Phase46GapStressInput={
    schemaVersion:'ADAPTIVE_V2_PHASE46_FOUR_HORIZON_GAP_EVIDENCE_V1',
    source:'OFFLINE_UNAUTHENTICATED_ARCHIVE',
    datasetLabel:'SYNTHETIC_TEST',paths
  };
  const rules={
    postOpenBidHaircutBps:1000,
    maximumPermittedFullDebitLossINR:20000,
    maximumPermittedAdverseBidGapPercent:60,
    minimumPostOpenDisplayedBidLots:1,
    hypotheticalEntryFeesINR:15,
    hypotheticalExitFeesINR:15
  };
  const policy:Phase46GapStressPolicy={
    schemaVersion:'ADAPTIVE_V2_PHASE46_LONG_INDEX_OPTION_GAP_STRESS_V1',
    maxOriginalEventToAvailabilitySeconds:20,
    maxPostOpenFirstQuoteLagMinutes:10,
    horizonRules:{
      '1W':{...rules},'2W':{...rules},'4W':{...rules},'8W':{...rules}
    }
  };
  const pins:Phase46GapStressPins={
    schemaVersion:'INDEPENDENT_PHASE46_GAP_PATH_AND_POLICY_PINS_V1',
    expectedDatasetLabel:'SYNTHETIC_TEST',
    expectedInstrumentKeys:{
      '1W':paths[0].instrumentKey,'2W':paths[1].instrumentKey,
      '4W':paths[2].instrumentKey,'8W':paths[3].instrumentKey
    },
    expectedPathSha256:{
      '1W':'','2W':'','4W':'','8W':''
    },
    expectedPolicySha256:''
  };
  const resign=()=>{
    for(const h of H){
      const p=input.paths.find(x=>x.horizon===h)!;
      pins.expectedPathSha256[h]=hashPhase46GapEvidence(p);
    }
    pins.expectedPolicySha256=hashPhase46GapEvidence(policy);
  };
  resign();
  return {input,pins,policy,resign};
}
function audit(f:ReturnType<typeof fixture>){
  return auditPhase46LongOptionGapStress(f.input,f.pins,f.policy);
}
function safety(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.profitabilityProven,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.overnightGapFillGuaranteed,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.originalL1MarketDataIndependentlyAuthenticated,false);
  assert.equal(r.officialExchangeContractCashSettlementVerified,false);
  assert.equal(r.officialExpiryCalendarVerified,false);
  assert.equal(r.marketDepthGuaranteesBrokerExecution,false);
  for(const x of r.cells){
    assert.equal(x.stopWouldHaveProtectedOvernight,false);
    assert.equal(x.brokerFillInferred,false);
    assert.equal(x.downsideCanBeLimitedToStopPrice,false);
  }
  const text=JSON.stringify(r);
  assert.ok(!text.includes('NSE_FO|SYNTHETIC'));
}
function denied(f:ReturnType<typeof fixture>,reason:string,
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=audit(f);safety(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.deepEqual(r.reasonCodes,[reason],JSON.stringify(r));
}
describe('Phase46 original-option-L1 1W/2W/4W/8W gap downside sensitivity',()=>{
  it('all four synthetic fixed horizon paths quantify full debit vs imaginary stop fill',()=>{
    const f=fixture(),r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_BOUNDS_ONLY',JSON.stringify(r));
    assert.equal(r.datasetLabel,'SYNTHETIC_TEST');
    assert.equal(r.horizonsReviewed,4);
    assert.equal(r.predeclaredGapOrCashLossAlerts,0);
    for(const c of r.cells){
      assert.equal(c.originalEntryAskPremium,250);
      assert.equal(c.originalPreCloseBidPremium,230);
      assert.equal(c.originalPostOpenBidPremium,100);
      assert.equal(c.longQuantity,65);
      assert.equal(c.entryPremiumDebitINR,16250);
      assert.equal(c.assumedEntryFeesINR,15);
      assert.equal(c.assumedExitFeesINR,15);
      assert.equal(c.fullDebitLossWithNoRecoveryINR,16265);
      assert.equal(c.idealStopTriggerLossINR,1980);
      assert.equal(c.extraLossVersusIdealStopINR,14285);
      assert.equal(c.bidGapPercent,-56.52);
      assert.equal(c.hypotheticalPostGapExitQuantity,65);
      assert.equal(c.hypotheticalUnfilledQuantity,0);
      assert.equal(c.hypotheticalHaircutExitBid,90);
      assert.equal(c.hypotheticalDisplayedDepthProceedsINR,5835);
      assert.equal(c.hypotheticalRemainingToZeroLossINR,10430);
    }
  });
  it('true 0 bid with 0 displayed depth means no hypothetical exit, full premium loss remains',()=>{
    const f=fixture();
    const p=f.input.paths[0];
    p.nextOpenQuote.bid=0;p.nextOpenQuote.displayedBidQuantity=0;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_RISK_ALERT_ONLY');
    const c=r.cells[0];
    assert.equal(c.bidGapPercent,-100);
    assert.equal(c.zeroBidOrNoDisplayedDepth,true);
    assert.equal(c.hypotheticalPostGapExitQuantity,0);
    assert.equal(c.hypotheticalUnfilledQuantity,65);
    assert.equal(c.hypotheticalDisplayedDepthProceedsINR,null);
    assert.equal(c.hypotheticalRemainingToZeroLossINR,null);
    assert.equal(c.fullDebitLossWithNoRecoveryINR,16265);
  });
  it('partial displayed 1 lot against 2 lots leaves residual 65 premium-at-risk',()=>{
    const f=fixture(),p=f.input.paths[0];
    p.quantity=130;
    p.nextOpenQuote.displayedBidQuantity=65;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_RISK_ALERT_ONLY');
    assert.equal(r.cells[0].hypotheticalPostGapExitQuantity,65);
    assert.equal(r.cells[0].hypotheticalUnfilledQuantity,65);
    assert.equal(r.cells[0].fullDebitLossWithNoRecoveryINR,32515);
    assert.equal(r.cells[0].hypotheticalRemainingToZeroLossINR,26680);
  });
  it('visible L1 depth can never turn into broker fill or overnight stop protection',()=>{
    const f=fixture(),p=f.input.paths[0];
    p.nextOpenQuote.displayedBidQuantity=650;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.cells[0].hypotheticalPostGapExitQuantity,65);
    assert.equal(r.cells[0].brokerFillInferred,false);
    assert.equal(r.cells[0].stopWouldHaveProtectedOvernight,false);
  });
  it('predeclared full-debit cash risk budget and adverse bid-gap threshold alert',()=>{
    const a=fixture();
    a.policy.horizonRules['1W'].maximumPermittedFullDebitLossINR=10000;
    a.resign();
    const r=audit(a);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_RISK_ALERT_ONLY');
    assert.equal(r.cells[0].fullDebitLossBudgetExceeded,true);
    const b=fixture();
    b.policy.horizonRules['2W'].maximumPermittedAdverseBidGapPercent=30;
    b.resign();
    const s=audit(b);safety(s);
    assert.equal(s.status,'DESCRIPTIVE_RISK_ALERT_ONLY');
    assert.equal(s.cells[1].adverseGapBudgetExceeded,true);
  });
  it('insufficient displayed 1 lot versus predeclared 2 lot requirement alerts only',()=>{
    const f=fixture();
    f.policy.horizonRules['4W'].minimumPostOpenDisplayedBidLots=2;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_RISK_ALERT_ONLY');
    assert.equal(r.cells[2].displayedDepthBelowPolicy,true);
  });
  it('post-open L1 bid above entry is descriptive, not empirical profitability',()=>{
    const f=fixture();
    f.input.paths[0].nextOpenQuote.bid=290;
    f.input.paths[0].nextOpenQuote.ask=300;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.cells[0].brokerFillInferred,false);
  });
  it('missing original post-open quote must be incomplete, not invent a stop fill',()=>{
    const f=fixture();
    f.input.paths[0].nextOpenQuote.observedAt='INVALID';
    f.resign();
    denied(f,'ORIGINAL_OPTION_BID_ASK_DEPTH_OR_EVENT_CLOCK_INVALID');
  });
  it('future event availability at entry is lookahead and rejects',()=>{
    const f=fixture();
    f.input.paths[0].entryQuote.observedAt=
      '2026-11-20T09:29:59+05:30';
    f.input.paths[0].entryQuote.availableAt=
      '2026-11-20T09:30:01+05:30';
    f.resign();
    denied(f,'ORIGINAL_QUOTES_OUTSIDE_PREDECLARED_AVAILABLE_WINDOWS');
  });
  it('post-open quote from before open is rejected rather than reused',()=>{
    const f=fixture();
    f.input.paths[0].nextOpenQuote.observedAt=
      '2026-11-20T15:29:00+05:30';
    f.input.paths[0].nextOpenQuote.availableAt=
      '2026-11-20T15:29:02+05:30';
    f.resign();
    denied(f,'ORIGINAL_QUOTES_OUTSIDE_PREDECLARED_AVAILABLE_WINDOWS');
  });
  it('quote more than 10 minutes after open is not a next-open executable fill',()=>{
    const f=fixture();
    f.input.paths[0].nextOpenQuote.observedAt=
      '2026-11-23T09:35:00+05:30';
    f.input.paths[0].nextOpenQuote.availableAt=
      '2026-11-23T09:35:02+05:30';
    f.resign();
    denied(f,'ORIGINAL_QUOTES_OUTSIDE_PREDECLARED_AVAILABLE_WINDOWS');
  });
  it('stale/negative original event→availability timestamps and crossed bid/ask reject',()=>{
    const a=fixture();
    a.input.paths[0].entryQuote.availableAt=
      '2026-11-20T09:30:10+05:30';
    a.resign();
    denied(a,'ORIGINAL_OPTION_BID_ASK_DEPTH_OR_EVENT_CLOCK_INVALID');
    const b=fixture();
    b.input.paths[1].nextOpenQuote.ask=90;
    b.resign();
    denied(b,'ORIGINAL_OPTION_BID_ASK_DEPTH_OR_EVENT_CLOCK_INVALID');
    const c=fixture();
    c.input.paths[2].preCloseQuote.bid=-10;
    c.resign();
    denied(c,'ORIGINAL_OPTION_BID_ASK_DEPTH_OR_EVENT_CLOCK_INVALID');
  });
  it('invalid depth or fractional lot quantity rejects',()=>{
    const f=fixture();f.input.paths[0].quantity=66;f.resign();
    denied(f,'INVALID_OR_UNSUPPORTED_INDEX_LONG_POSITION');
    const a=fixture();
    a.input.paths[0].nextOpenQuote.displayedBidQuantity=1;
    a.resign();
    denied(a,'ORIGINAL_OPTION_BID_ASK_DEPTH_OR_EVENT_CLOCK_INVALID');
    const b=fixture();
    b.input.paths[0].nextOpenQuote.bid=0;
    b.resign();
    denied(b,'ORIGINAL_OPTION_BID_ASK_DEPTH_OR_EVENT_CLOCK_INVALID');
  });
  it('stock physically settled contract cannot silently use bounded index debit stress',()=>{
    const f=fixture();
    f.input.paths[0].contractType=
      'STOCK_OPTION_PHYSICAL' as
        'CASH_SETTLED_INDEX_OPTION_DECLARED_UNVERIFIED';
    f.resign();
    denied(f,'INVALID_OR_UNSUPPORTED_INDEX_LONG_POSITION');
  });
  it('declared stop above or equal to entry ASK cannot be interpreted as protective loss',()=>{
    const f=fixture();
    f.input.paths[0].declaredStopTriggerPremium=260;
    f.resign();
    denied(f,'DECLARED_LONG_OPTION_STOP_NOT_BELOW_ENTRY_ASK');
  });
  it('wrong horizon vs expiry, expired option or invalid date sequence rejects',()=>{
    const f=fixture();
    f.input.paths[0].expiryAt=after(entry,50);
    f.resign();
    denied(f,'HORIZON_LABEL_NOT_MATCHING_DECLARED_EXPIRY_WINDOW');
    const a=fixture();
    a.input.paths[0].expiryAt=after(entry,-2);
    a.resign();
    denied(a,'INVALID_DECLARED_SESSION_OR_EXPIRY_TIME_SEQUENCE');
    const b=fixture();
    b.input.paths[0].nextSessionOpenAt=
      '2026-11-20T15:25:00+05:30';
    b.resign();
    denied(b,'INVALID_DECLARED_SESSION_OR_EXPIRY_TIME_SEQUENCE');
  });
  it('wrong path hash, changed instrument scope or missing 8W cohort fails before risk review',()=>{
    const a=fixture();
    a.input.paths[0].nextOpenQuote.bid=1;
    denied(a,'HORIZON_ORDER_OR_INDEPENDENT_ORIGINAL_L1_HASH_MISMATCH',
      'INVALID_EVIDENCE');
    const b=fixture();
    b.pins.expectedInstrumentKeys['1W']='OTHER_INSTRUMENT';
    denied(b,'HORIZON_ORDER_OR_INDEPENDENT_ORIGINAL_L1_HASH_MISMATCH',
      'INVALID_EVIDENCE');
    const c=fixture();c.input.paths.pop();
    denied(c,'MISSING_FOUR_HORIZON_SOURCE_OR_PREDECLARED_POLICY',
      'INVALID_EVIDENCE');
  });
  it('changed predeclared haircut or risk budgets without independently pinned policy rejects',()=>{
    const f=fixture();
    f.policy.horizonRules['8W'].postOpenBidHaircutBps=1500;
    denied(f,'MISSING_FOUR_HORIZON_SOURCE_OR_PREDECLARED_POLICY',
      'INVALID_EVIDENCE');
  });
  it('negative/NaN/off-scale fees and bad source label cannot be considered valid',()=>{
    const a=fixture();
    a.policy.horizonRules['2W'].hypotheticalEntryFeesINR=-1;
    a.resign();
    denied(a,'MISSING_FOUR_HORIZON_SOURCE_OR_PREDECLARED_POLICY',
      'INVALID_EVIDENCE');
    const b=fixture();
    b.policy.horizonRules['1W'].hypotheticalExitFeesINR=Number.NaN;
    b.resign();
    denied(b,'MISSING_FOUR_HORIZON_SOURCE_OR_PREDECLARED_POLICY',
      'INVALID_EVIDENCE');
    const c=fixture();
    c.input.datasetLabel='BROKER_VERIFIED' as 'SYNTHETIC_TEST';
    denied(c,'MISSING_FOUR_HORIZON_SOURCE_OR_PREDECLARED_POLICY',
      'INVALID_EVIDENCE');
  });
  it('self-pinned synthetic sources cannot flip any real-source, stop or profitability flag',()=>{
    const f=fixture();
    f.input.datasetLabel='OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED';
    f.pins.expectedDatasetLabel='OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED';
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_BOUNDS_ONLY');
    assert.equal(r.originalL1MarketDataIndependentlyAuthenticated,false);
    assert.equal(r.officialExpiryCalendarVerified,false);
    assert.equal(r.brokerStopInstalled,false);
  });
});
