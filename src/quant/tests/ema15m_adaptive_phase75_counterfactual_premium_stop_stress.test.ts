import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase75CounterfactualPremiumStopStress,
  type Phase75Report
} from '../../server/engine/ema15m/adaptivePhase75CounterfactualPremiumStopStress.js';
import {makePhase75SyntheticPremiumStressFixture}
  from './phase75_synthetic_premium_stress_fixture.js';

type F=ReturnType<typeof makePhase75SyntheticPremiumStressFixture>;
const fixture=makePhase75SyntheticPremiumStressFixture;
const audit=(f:F)=>auditPhase75CounterfactualPremiumStopStress(
  f.input,f.pins);
function neverTrades(r:Phase75Report){
  assert.equal(r.observedQuoteMarksAreNotExecutableFills,true);
  assert.equal(r.hypotheticalStopLevelCannotGuaranteeGapFill,true);
  assert.equal(r.completePaidPremiumAndFeesMayBeLost,true);
  assert.equal(
    r.underlyingIndexPointsCannotBeDeductedFromOptionPremiumPoints,true);
  assert.equal(r.genuineOriginalLicensedMarketTapeVerified,false);
  assert.equal(r.trueOriginalClientDecisionAsOfCaptureVerified,false);
  assert.equal(r.actualMultiRegimeOosStrategyProfitabilityProven,false);
  assert.equal(r.trueIvThetaSpreadMarketGapCostsCalibrated,false);
  assert.equal(r.optionContractOrOneToEightWeekRankAuthorized,false);
  assert.equal(r.overnightBrokerNativeNrmlGttStopChildExchangeAckVerified,
    false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD'));
  for(const c of r.cells){
    assert.equal(c.bestContractOrHorizonMayBeSelected,false);
    assert.equal(c.historicalMarketResultsObserved,false);
    assert.equal(c.brokerStopOrExitFillProven,false);
  }
}
function rejects(f:F,reason:string,
  status:Phase75Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);neverTrades(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase75 mandatory four counterfactual risk scenarios per all original entry-claimed options, never actual fills',()=>{
  it('covers every original 1W–8W CE PE entry-claimed option with 4 stress paths and preserves 16 NO_ENTRY alternatives',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.status,
      'DESCRIPTIVE_HYPOTHETICAL_LOSS_BUDGET_EXCEEDED_NO_TRADING',
      JSON.stringify(r));
    assert.equal(r.parentPhase74Status,
      'DESCRIPTIVE_NO_CLAIMED_ASOF_QUOTES_RETROSPECTIVE_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisions,4);
    assert.equal(r.originalNoEntryDecisions,2);
    assert.equal(r.allOriginalListedCePePairs,32);
    assert.equal(r.originalEntryClaimedListedPairs,16);
    assert.equal(r.originalNoEntryListedPairs,16);
    assert.equal(r.completeCounterfactualStressPaths,64);
    assert.equal(r.premiumRunupGivebackScenarioCount,16);
    assert.equal(r.afterPeakBidBelowHypotheticalTrailCount,64);
    assert.equal(r.zeroDisplayedBidDepthOrFullDebitPaths,32);
    assert.equal(r.counterfactualObservedMarkLossExceedsBudget,48);
    assert.equal(r.paidLongOptionDebitExceedsPerEntryBudget,64);
    assert.equal(r.cells.length,16);
    assert.equal(r.cells.reduce((n,c)=>n+c.counterfactualScenarios,0),64);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalNoEntryPairs,0),16);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalEntryClaimedPairs,0),16);
  });
  it('cash debit loss arithmetic assumes one original lot ASK 100 × 50 plus INR 50 fees; quotes are NEVER actual exit execution',()=>{
    const r=audit(fixture());neverTrades(r);
    for(const c of r.cells){
      assert.equal(c.maxAssumedPaidDebitPlusFeesINR,5050);
      assert.equal(c.maxAssumedPaidDebitLossINR,5050);
      assert.equal(c.maxObservedCounterfactualMarkLossINR,5050);
    }
    assert.equal(r.completePaidPremiumAndFeesMayBeLost,true);
  });
  it('+70 premium peak reverses to +20 observed hypothetical BID before +100 premium target, not underlying index 100 points',()=>{
    const f=fixture(),r=audit(f);neverTrades(r);
    assert.equal(f.policy.premiumTrailArmingGainPoints,50);
    assert.equal(f.policy.premiumGivebackAlertPoints,20);
    assert.equal(f.policy.premiumTargetAlertPoints,100);
    assert.equal(f.paths[0].assumedPeakBidPremiumPoints,170);
    assert.equal(f.paths[0].assumedLaterBidPremiumPoints,120);
    assert.equal(r.premiumRunupGivebackScenarioCount,16);
    assert.equal(r.optionContractOrOneToEightWeekRankAuthorized,false);
  });
  it('overnight next-BID gap below a hypothetical trail is never incorrectly booked at stop 150',()=>{
    const f=fixture(),r=audit(f);neverTrades(r);
    const s=f.paths[1];
    assert.equal(s.scenario,'OVERNIGHT_GAP_BELOW_TRAIL');
    assert.equal(s.assumedLaterBidPremiumPoints,10);
    assert.equal(170-f.policy.premiumGivebackAlertPoints,150);
    assert.equal(r.afterPeakBidBelowHypotheticalTrailCount,64);
    assert.equal(r.hypotheticalStopLevelCannotGuaranteeGapFill,true);
  });
  it('zero displayed BID depth and expiry worthless count full debit at risk, not a magically executed stop',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.zeroDisplayedBidDepthOrFullDebitPaths,32);
    assert.equal(r.completePaidPremiumAndFeesMayBeLost,true);
    assert.equal(r.overnightBrokerNativeNrmlGttStopChildExchangeAckVerified,
      false);
  });
  it('relaxing hypothetical risk budgets after independently re-pinning cannot convert stress data into market profitability',()=>{
    const f=fixture();
    f.policy.maxSingleLongOptionPaidDebitPlusFeesINR=6000;
    f.policy.maxAdverseObservedMarkLossINR=6000;
    f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.status,
      'DESCRIPTIVE_HYPOTHETICAL_STRESS_ONLY_NOT_OOS_OR_EXECUTION');
    assert.equal(r.counterfactualObservedMarkLossExceedsBudget,0);
    assert.equal(r.paidLongOptionDebitExceedsPerEntryBudget,0);
    assert.equal(r.actualMultiRegimeOosStrategyProfitabilityProven,false);
  });
  it('changing loss budget without updating independently pinned policy fails at source gate',()=>{
    const f=fixture();
    f.policy.maxAdverseObservedMarkLossINR=6000;
    rejects(f,'PHASE75_FROZEN_ORIGINAL_OOS_POLICY_OR_STRESS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a policy cannot disable mandatory every originally listed entry four-scenario audit even after rehash',()=>{
    const f=fixture();
    (f.policy as {requireAllFourScenariosPerOriginalEntryClaimedListedOption:boolean})
      .requireAllFourScenariosPerOriginalEntryClaimedListedOption=false;
    f.repin();
    rejects(f,'PHASE75_FROZEN_ORIGINAL_OOS_POLICY_OR_STRESS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a policy cannot permit NO_ENTRY options to become simulated positions',()=>{
    const f=fixture();
    (f.policy as {prohibitNoEntryOptionFromSimulatedPosition:boolean})
      .prohibitNoEntryOptionFromSimulatedPosition=false;
    f.repin();
    rejects(f,'PHASE75_FROZEN_ORIGINAL_OOS_POLICY_OR_STRESS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a policy cannot promote a paper trail to broker-native exchange ACK',()=>{
    const f=fixture();
    (f.policy as {nativeBrokerStopAcknowledgementMayNotBeInferred:boolean})
      .nativeBrokerStopAcknowledgementMayNotBeInferred=false;
    f.repin();
    rejects(f,'PHASE75_FROZEN_ORIGINAL_OOS_POLICY_OR_STRESS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('changing scenario raw bytes without independent signed pin fails',()=>{
    const f=fixture();
    f.paths[0].assumedLaterBidPremiumPoints=115;
    f.updatePaths();
    rejects(f,'PHASE75_ORIGINAL_COUNTERFACTUAL_RAW_PATH_BYTES_CHANGED',
      'INVALID_EVIDENCE');
  });
  it('same original entry contract cannot duplicate favorable giveback case and remove overnight gap case',()=>{
    const f=fixture();
    f.mutate(1,{scenario:'PRE_TARGET_GIVEBACK',
      assumedLaterBidPremiumPoints:120});
    rejects(f,'PHASE75_DUPLICATE_STRESS_PATH_CHERRY_PICKING');
  });
  it('all four counterfactual scenarios must remain for every original entry pair, not chosen winners',()=>{
    const f=fixture();
    f.archive.paths.pop();
    f.updatePaths();f.repin();
    rejects(f,'PHASE75_STRESS_ARCHIVE_SHAPE_OR_SOURCE_COHORT_CHANGED');
  });
  it('NO_ENTRY contract scenario is rejected even though its original BID/ASK history is retained in acquisition denominator',()=>{
    const f=fixture();
    const d=f.vendor.catalog.decisions[0];
    f.mutate(0,{sessionDate:d.sessionDate,
      instrumentKey:d.originallyListedContracts[0].instrumentKey});
    rejects(f,'PHASE75_NO_ENTRY_OR_UNLISTED_OPTION_STRESS_NOT_ADMITTED');
  });
  it('wrong or invented contract key is never admitted to original frozen source universe',()=>{
    const f=fixture();
    f.mutate(0,{instrumentKey:'INVENTED_FAVORABLE_8W_OPTION'});
    rejects(f,'PHASE75_NO_ENTRY_OR_UNLISTED_OPTION_STRESS_NOT_ADMITTED');
  });
  it('an overnight gap scenario with a later BID ABOVE entry cannot masquerade as adverse gap',()=>{
    const f=fixture();
    f.mutate(1,{assumedLaterBidPremiumPoints:120});
    rejects(f,'PHASE75_STRESS_SCENARIO_CANNOT_MATCH_PREDECLARED_STRESS');
  });
  it('zero-depth scenario with positive available BID-depth cannot be used to invent a no-fill',()=>{
    const f=fixture();
    f.mutate(2,{assumedLaterDisplayedBidDepthLots:2,
      assumedLaterBidPremiumPoints:20});
    rejects(f,'PHASE75_STRESS_SCENARIO_CANNOT_MATCH_PREDECLARED_STRESS');
  });
  it('a pre-target giveback scenario cannot be cherry-picked after the 100-point OPTION PREMIUM target was crossed',()=>{
    const f=fixture();
    f.mutate(0,{assumedPeakBidPremiumPoints:210,
      assumedLaterBidPremiumPoints:120});
    rejects(f,'PHASE75_STRESS_SCENARIO_CANNOT_MATCH_PREDECLARED_STRESS');
  });
  it('fake changed original Phase74 source cannot be legalized by new locally signed counterfactual stress pins only',()=>{
    const f=fixture();
    f.previous.previous.licence.claimedGrantExpiresAt='2029-12-01T00:00:00.000Z';
    f.previous.previous.updateLicence();
    f.previous.previous.repin();
    rejects(f,'PHASE75_FROZEN_ORIGINAL_OOS_POLICY_OR_STRESS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('misstating original NO_ENTRY listed count does not turn an unentered contract into a profitable paper position',()=>{
    const f=fixture();
    f.pins.expectedOriginalNoEntryListedPairs=8;
    rejects(f,'PHASE75_FROZEN_ORIGINAL_OOS_POLICY_OR_STRESS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('scenarios are all fabricated arithmetic: cannot select 1W over 8W or claim strategy profitable based on synthetic risk tests',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.actualMultiRegimeOosStrategyProfitabilityProven,false);
    assert.equal(r.optionContractOrOneToEightWeekRankAuthorized,false);
    assert.ok(r.externalEvidenceRequired.some(x=>x.includes('MULTI_CYCLE')));
  });
});
