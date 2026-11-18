import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase57RegimeHorizonDebitRisk,hashPhase57Evidence,
  type Phase57Input,type Phase57IndependentPins,type Phase57Policy
} from '../../server/engine/ema15m/adaptivePhase57RegimeHorizonDebitRisk.js';
import {makePhase53SyntheticSignedFixture}
  from './phase53_synthetic_signed_document_fixture.js';

function fixture(){
  const s=makePhase53SyntheticSignedFixture();
  const policy:Phase57Policy={
    schemaVersion:'ADAPTIVE_PHASE57_REGIME_HORIZON_DEBIT_ENVELOPE_V1',
    source:'PREREGISTERED_OFFLINE_RISK_BUDGET_UNVERIFIED',
    premiumDrawdownFractions:[.25,.5,.75,1],
    horizonRules:{
      '1W':{maximumSingleEntryDebitPlusFeesINR:8000,
        assumedNonRecoverableEntryAndExitCostsINR:100},
      '2W':{maximumSingleEntryDebitPlusFeesINR:9000,
        assumedNonRecoverableEntryAndExitCostsINR:100},
      '4W':{maximumSingleEntryDebitPlusFeesINR:10000,
        assumedNonRecoverableEntryAndExitCostsINR:100},
      '8W':{maximumSingleEntryDebitPlusFeesINR:11000,
        assumedNonRecoverableEntryAndExitCostsINR:100}
    },
    maximumCombinedFourHorizonDebitPerArmPerOosDecisionINR:40000,
    minimumOosSessionsForAnyRegimeComparison:2,
    minimumDistinctObservedRegimesForCrossRegimeClaim:2
  };
  const input:Phase57Input={
    schemaVersion:'ADAPTIVE_PHASE57_OFFLINE_REGIME_DEBIT_AUDIT_V1',
    source:'OFFLINE_OPERATOR_MARKET_DATA_UNVERIFIED',
    phase51:s.phase51,phase51Pins:s.phase51Pins,policy
  };
  const pins:Phase57IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE57_REGIME_DEBIT_PRESPECIFICATION_V1',
    expectedPhase51InputSha256:'',
    expectedPhase51PinsSha256:'',
    expectedRiskPolicySha256:'',
    expectedOriginalOosSessionManifestSha256:'',
    expectedOosSessions:2,expectedFullArmHorizonAttempts:24
  };
  const repin=()=>{
    pins.expectedPhase51InputSha256=hashPhase57Evidence(input.phase51);
    pins.expectedPhase51PinsSha256=
      hashPhase57Evidence(input.phase51Pins);
    pins.expectedRiskPolicySha256=hashPhase57Evidence(input.policy);
    pins.expectedOriginalOosSessionManifestSha256=
      s.phase51Pins.expectedOriginalOosManifestSha256;
  };
  repin();
  return {s,input,pins,repin,
    repinOriginalAndStage57:()=>{s.repinSource();repin();}};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase57RegimeHorizonDebitRisk(f.input,f.pins);
function neverTrade(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.rankOrChooseBestHorizonAuthorized,false);
  assert.equal(r.observedHistoricalPerformanceMeasured,false);
  assert.equal(r.greekOrIvThetaShockStatisticallyCalibrated,false);
  assert.equal(r.unbiasedMultiRegimeOosProfitabilityProven,false);
  assert.equal(r.brokerFillOrNativeOvernightStopVerified,false);
  assert.equal(r.originalLicensedL1IndependentlyAuthenticated,false);
  assert.equal(r.exchangeCalendarAndContractMasterIndependentlyAuthenticated,false);
  assert.equal(r.sourceArrivalClockIndependentlyAuthenticated,false);
  assert.equal(r.hypotheticalCapitalCanLoseEntirePremiumDebit,true);
  assert.equal(r.underlyingIndexPointTargetDeterminesOptionPremium,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('SYNTHETIC_UNVERIFIED_DOC_'));
}
function rejected(f:F,reason:string,
  status:ReturnType<typeof audit>['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);neverTrade(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase57 four-horizon original entry-first long premium debit and regime exposure',()=>{
  it('retains 24 two-fold synthetic OOS attempts, but one-market-regime data is not a cross-regime strategy result',()=>{
    const f=fixture(),r=audit(f);neverTrade(r);
    assert.equal(r.status,'DESCRIPTIVE_SINGLE_REGIME_RISK_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase51Status,'DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.oosSessions,2);
    assert.equal(r.attemptedArmHorizonDecisions,24);
    assert.equal(r.originalObservedEntries+
      r.originalUnpricedSelectedOptionEntries+
      r.originalNonEntryAttempts+
      r.missingOrAmbiguousOriginalQuoteBindings,24);
    assert.equal(r.missingOrAmbiguousOriginalQuoteBindings,0);
    assert.equal(r.originalUnpricedSelectedOptionEntries,0);
    assert.ok(r.originalObservedEntries>0);
    assert.equal(r.singleEntryDebitBudgetBreaches,0);
    assert.equal(r.combinedFourHorizonDebitBudgetBreaches,0);
    assert.equal(r.perArmSessionPortfolio.length,6);
    assert.equal(r.distinctObservedRegimes,1);
    assert.equal(Object.values(r.regimeDecisionCounts).reduce(
      (n,v)=>n+(v??0),0),2);
    const attempts=r.perRegimeHorizonArm.reduce(
      (n,c)=>n+c.originalDecisionAttempts,0);
    assert.equal(attempts,24);
    for(const c of r.perRegimeHorizonArm){
      assert.equal(c.alternativeArmsNotIndependentExecutions,true);
      assert.equal(c.realBrokerFillOrStopVerified,false);
      assert.ok(c.hypotheticalPremiumDrawdownLossINR[0]<=
        c.hypotheticalPremiumDrawdownLossINR[1]);
      assert.ok(c.hypotheticalPremiumDrawdownLossINR[1]<=
        c.hypotheticalPremiumDrawdownLossINR[2]);
      assert.ok(c.hypotheticalPremiumDrawdownLossINR[2]<=
        c.hypotheticalPremiumDrawdownLossINR[3]);
      assert.equal(c.totalHypotheticalFullDebitLossPlusCostsINR,
        c.hypotheticalPremiumDrawdownLossINR[3]);
    }
  });
  it('predeclared budget below original ASK×lot+fees produces risk alert, not profitable signal',()=>{
    const f=fixture();
    f.input.policy.horizonRules['1W'].maximumSingleEntryDebitPlusFeesINR=1000;
    f.repin();
    const r=rejected(f,'PREDECLARED_LONG_OPTION_FULL_DEBIT_BUDGET_BREACH',
      'DESCRIPTIVE_RISK_BUDGET_ALERT_ONLY');
    assert.ok(r.singleEntryDebitBudgetBreaches>0);
    assert.ok(r.perRegimeHorizonArm.some(c=>
      c.horizon==='1W'&&c.perEntryRiskBudgetBreaches>0));
  });
  it('four horizon combined debit cannot be hidden by passing each individual cap',()=>{
    const f=fixture();
    f.input.policy.maximumCombinedFourHorizonDebitPerArmPerOosDecisionINR=10000;
    f.repin();
    const r=rejected(f,'PREDECLARED_LONG_OPTION_FULL_DEBIT_BUDGET_BREACH',
      'DESCRIPTIVE_RISK_BUDGET_ALERT_ONLY');
    assert.equal(r.singleEntryDebitBudgetBreaches,0);
    assert.ok(r.combinedFourHorizonDebitBudgetBreaches>0);
    assert.ok(r.perArmSessionPortfolio.some(g=>
      g.exceedsPredeclaredCombinedBudget===true));
  });
  it('changing FUTURE option bids cannot change the original entry-first debit risk, after full source re-pin',()=>{
    const f=fixture(),before=audit(f);
    const d=f.s.historical.decisions.at(-1)!;
    const target=f.s.historical.executionQuotes.find(q=>
      q.instrumentKey===d.listedContracts[0].instrument_key&&
      Date.parse(q.observedAt)>Date.parse(d.decisionAt)+25*60000)!;
    assert.ok(target);
    target.bid=17;target.ask=18;
    f.repinOriginalAndStage57();
    const after=audit(f);
    assert.equal(after.status,before.status,JSON.stringify(after));
    assert.deepEqual(after.perRegimeHorizonArm,before.perRegimeHorizonArm);
    assert.deepEqual(after.perArmSessionPortfolio,before.perArmSessionPortfolio);
  });
  it('risk policy must be pinned independently before source OOS evaluation',()=>{
    const f=fixture();
    f.input.policy.horizonRules['8W'].assumedNonRecoverableEntryAndExitCostsINR=999;
    rejected(f,'PHASE57_PREDECLARED_RISK_BUDGET_OR_ORIGINAL_SOURCE_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('retrospectively tampering original option ASK with only outer repin fails nested Phase51 source lock',()=>{
    const f=fixture();
    f.s.historical.executionQuotes[0].ask+=10;
    f.repin();
    rejected(f,'ORIGINAL_PHASE51_PHASE50_OOS_SOURCE_OR_DENOMINATOR_INCOMPLETE');
  });
  it('missing one independent OOS day, even with rehashed market source, keeps incomplete denominator',()=>{
    const f=fixture();
    const missing=f.s.historical.policy.folds[1].testStart;
    f.s.historical.decisions=f.s.historical.decisions.filter(d=>
      d.sessionDate!==missing);
    f.s.historical.provenance.expectedSessions=
      f.s.historical.provenance.expectedSessions.filter(d=>d!==missing);
    f.repinOriginalAndStage57();
    rejected(f,'ORIGINAL_PHASE51_PHASE50_OOS_SOURCE_OR_DENOMINATOR_INCOMPLETE');
  });
  it('no source quote availability for a selected contract is never a zero-loss trade',()=>{
    const f=fixture(),d=f.s.historical.decisions.at(-1)!;
    const q=f.s.historical.executionQuotes.find(x=>
      d.listedContracts.some(c=>c.instrument_key===x.instrumentKey)&&
      Date.parse(x.observedAt)>Date.parse(d.decisionAt))!;
    delete q.availableAt;
    f.repinOriginalAndStage57();
    rejected(f,'ORIGINAL_PHASE51_PHASE50_OOS_SOURCE_OR_DENOMINATOR_INCOMPLETE');
  });
  it('future decision candle is not valid pre-entry market regime evidence',()=>{
    const f=fixture();
    const d=f.s.historical.decisions.at(-1)!;
    d.candles.push({...d.candles.at(-1)!,
      timestamp:new Date(Date.parse(d.decisionAt)+60000).toISOString()});
    f.repinOriginalAndStage57();
    const r=audit(f);neverTrade(r);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE',JSON.stringify(r));
  });
  it('no IV/theta estimate, hypothetical stop fill or profitable horizon ranking can be inferred from loss shocks',()=>{
    const r=audit(fixture());neverTrade(r);
    assert.equal(r.rankOrChooseBestHorizonAuthorized,false);
    assert.equal(r.observedHistoricalPerformanceMeasured,false);
    assert.equal(r.greekOrIvThetaShockStatisticallyCalibrated,false);
  });
});
