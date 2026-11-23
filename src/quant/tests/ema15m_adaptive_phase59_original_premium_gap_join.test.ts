import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase59MatchedPremiumReversalGap,hashPhase59Evidence,
  type Phase59Input,type Phase59IndependentPins
} from '../../server/engine/ema15m/adaptivePhase59PremiumGapCohortJoin.js';
import {
  runAdaptiveEntryFirstExitStudy
} from '../../server/engine/ema15m/adaptiveEntryFirstExitStudy.js';
import {makePhase59SyntheticMatchedFixture}
  from './phase59_synthetic_matched_oos_fixture.js';
const MINUTE=60000;
const iso=(n:number)=>new Date(n).toISOString();
function fixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
  const f=makePhase59SyntheticMatchedFixture(variant);
  const input:Phase59Input={
    schemaVersion:'ADAPTIVE_PHASE59_MATCHED_PREMIUM_REVERSAL_GAP_V1',
    source:'OFFLINE_UNVERIFIED_ORIGINAL_OOS_OPTION_TAPE',
    phase58:f.input,phase58Pins:f.pins,
    phase19RunupPolicy:{
      schemaVersion:'ADAPTIVE_OBSERVED_PREMIUM_RUNUP_REVERSAL_V1',
      firstRunupPoints:15,
      secondRunupPoints:25,
      candidateTargetPoints:100,
      reversalGivebackPoints:10,
      minimumDisplayedBidDepthLots:1,
      minimumFullyObservedPathsPerVariantCell:1
    },
    phase46GapPolicy:{
      schemaVersion:'ADAPTIVE_V2_PHASE46_LONG_INDEX_OPTION_GAP_STRESS_V1',
      maxOriginalEventToAvailabilitySeconds:30,
      maxPostOpenFirstQuoteLagMinutes:5,
      horizonRules:{
        '1W':{
          postOpenBidHaircutBps:100,
          maximumPermittedFullDebitLossINR:8000,
          maximumPermittedAdverseBidGapPercent:90,
          minimumPostOpenDisplayedBidLots:1,
          hypotheticalEntryFeesINR:100,hypotheticalExitFeesINR:0
        },
        '2W':{
          postOpenBidHaircutBps:100,
          maximumPermittedFullDebitLossINR:9000,
          maximumPermittedAdverseBidGapPercent:90,
          minimumPostOpenDisplayedBidLots:1,
          hypotheticalEntryFeesINR:100,hypotheticalExitFeesINR:0
        },
        '4W':{
          postOpenBidHaircutBps:100,
          maximumPermittedFullDebitLossINR:10000,
          maximumPermittedAdverseBidGapPercent:90,
          minimumPostOpenDisplayedBidLots:1,
          hypotheticalEntryFeesINR:100,hypotheticalExitFeesINR:0
        },
        '8W':{
          postOpenBidHaircutBps:100,
          maximumPermittedFullDebitLossINR:11000,
          maximumPermittedAdverseBidGapPercent:90,
          minimumPostOpenDisplayedBidLots:1,
          hypotheticalEntryFeesINR:100,hypotheticalExitFeesINR:0
        }
      }
    }
  };
  const pins:Phase59IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE59_FULL_COHORT_PREMIUM_GAP_PINS_V1',
    expectedPhase58InputSha256:'',
    expectedPhase58PinsSha256:'',
    expectedPhase19PremiumPolicySha256:'',
    expectedPhase46GapPolicySha256:'',
    expectedOosDecisionSessions:2,expectedFullArmHorizonAttempts:24
  };
  const repin=()=>{
    pins.expectedPhase58InputSha256=hashPhase59Evidence(input.phase58);
    pins.expectedPhase58PinsSha256=hashPhase59Evidence(input.phase58Pins);
    pins.expectedPhase19PremiumPolicySha256=
      hashPhase59Evidence(input.phase19RunupPolicy);
    pins.expectedPhase46GapPolicySha256=
      hashPhase59Evidence(input.phase46GapPolicy);
  };
  repin();
  return {...f,input,pins,repin,
    repinSourceAndAll:()=>{f.repinSourceAndAll();repin();}};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase59MatchedPremiumReversalGap(f.input,f.pins);
function noTrade(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.originalExchangeL1IndependentlyLicensed,false);
  assert.equal(r.exchangeMasterAndCalendarIndependentlyAuthenticated,false);
  assert.equal(r.issuerTrustedEventAndAvailableAtClock,false);
  assert.equal(r.optionBidGuaranteedExecutable,false);
  assert.equal(r.phase19PremiumTargetExpressedInIndexPoints,false);
  assert.equal(r.phase46FourHandpickedPathsCountAsWholeOos,false);
  assert.equal(r.brokerNativeNrmlStopOrGttAckVerified,false);
  assert.equal(r.overnightStopCannotGapOrBeRejected,false);
  assert.equal(r.strategyProfitabilityProven,false);
  assert.equal(r.statisticallyValidMultiRegimeHorizonRankingProven,false);
  assert.equal(r.trueIvThetaVegaAttributionProven,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
}
function rejected(f:F,reason:string,
  status:ReturnType<typeof audit>['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);noTrade(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
function chosen(f:F){
  const original=f.f.historical;
  const replay=runAdaptiveEntryFirstExitStudy(
    original,f.input.phase58.exitPolicy,f.input.phase58.exitSessions);
  assert.ok(replay.outcomes.length>0);
  const candidate=replay.outcomes.find(o=>o.status==='PRICED_EXIT'&&
    Date.parse(o.nextQuoteAt!)>
      Date.parse(o.entryAt)+20*3600_000);
  assert.ok(candidate);
  return candidate;
}
describe('Phase59 original Phase19 premium runup × Phase46 first-next-open gap OOS join',()=>{
  it('same original two-fold OOS universe counts all 24 attempts, not 3 arms as separate fills',()=>{
    const f=fixture(),r=audit(f);noTrade(r);
    assert.equal(r.status,'DESCRIPTIVE_SINGLE_REGIME_PREMIUM_GAP_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase58Status,'DESCRIPTIVE_SINGLE_REGIME_EXIT_RISK_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisionSessions,2);
    assert.equal(r.originalArmHorizonAttempts,24);
    assert.equal(r.originalOosArmHorizonDenominatorPreserved,true);
    assert.ok(r.originalEnteredOptionPaths>0);
    assert.equal(r.fullyAuditedOriginalPreTriggerBidPaths,
      r.originalEnteredOptionPaths);
    assert.equal(r.originalSourceOrNextOpenCensoredPaths,0);
    assert.equal(r.exactFirstNextOpenGapRiskPaths,
      r.overnightExposedOriginalEntries);
    assert.ok(r.overnightExposedOriginalEntries>0);
    assert.ok(r.distinctOriginalOptionEntryPathsAcrossAlternativeArms<=
      r.originalEnteredOptionPaths);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalOosAttempts,0),24);
    assert.equal(r.cells.reduce((n,c)=>n+c.observedOriginalEntries,0),
      r.originalEnteredOptionPaths);
    for(const c of r.cells){
      assert.equal(c.reusedPhase19PremiumClassifier,true);
      assert.equal(c.reusedPhase46GapStressPrimitive,true);
      assert.equal(c.noIntrabarOrBrokerFillInferred,true);
      assert.ok(c.originalOosAttempts>=
        c.observedOriginalEntries+c.originalNoEntryAttempts);
    }
  });
  it('+30 option BID runup gives back before +100 target under frozen Phase19 thresholds',()=>{
    const f=fixture('GIVEBACK'),r=audit(f);noTrade(r);
    assert.ok(r.status.startsWith('DESCRIPTIVE_'),JSON.stringify(r));
    assert.ok(r.firstRunupReversalBeforeCandidateTargetCount>0);
    assert.ok(r.cells.some(c=>
      c.observedSecondRunupReversedBeforeTarget>0&&
      c.depthQualifiedCandidateTargets===0));
    assert.equal(r.fullyAuditedOriginalPreTriggerBidPaths,
      r.originalEnteredOptionPaths);
  });
  it('observed overnight option BID gap turns into risk alert with no stop-fill promise',()=>{
    const f=fixture('GAP');
    for(const h of ['1W','2W','4W','8W'] as const)
      f.input.phase46GapPolicy.horizonRules[h]
        .maximumPermittedAdverseBidGapPercent=20;
    f.repin();
    const r=rejected(f,'FULL_DEBIT_OR_ADVERSE_NEXT_OPEN_RISK_ALERT_ONLY',
      'DESCRIPTIVE_PREMIUM_OR_GAP_RISK_ALERT_ONLY');
    assert.ok(r.originalPremiumStopOrGapCashBudgetAlerts>0);
    assert.equal(r.exactFirstNextOpenGapRiskPaths,
      r.overnightExposedOriginalEntries);
  });
  it('zero displayed next-open BID depth is rejected by earlier Phase58 original exit evidence',()=>{
    const f=fixture(),o=chosen(f);
    const original=f.f.historical;
    const entryDay=o.entryAt.slice(0,10);
    const nextSession=f.input.phase58.exitSessions.find(s=>
      s.sessionDate>entryDay)!;
    const q=original.executionQuotes.find(q=>
      q.instrumentKey===o.instrumentKey&&
      q.observedAt===nextSession.openAt)!;
    assert.ok(q);
    q.bidQty=0;
    f.repinSourceAndAll();
    const r=rejected(f,'PHASE58_FULL_ORIGINAL_OOS_EXIT_AND_DEBIT_REAUDIT_INCOMPLETE');
    assert.equal(r.phase58Status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.exactFirstNextOpenGapRiskPaths,0);
    assert.equal(r.brokerNativeNrmlStopOrGttAckVerified,false);
  });
  it('loss of first next-open quotes remains source-censored even if next later BID is favorable',()=>{
    const f=fixture(),o=chosen(f);
    const next=f.input.phase58.exitSessions.find(s=>
      s.sessionDate>o.entryAt.slice(0,10))!;
    const begin=Date.parse(next.openAt);
    f.f.historical.executionQuotes=f.f.historical.executionQuotes
      .filter(q=>q.instrumentKey!==o.instrumentKey||
        Date.parse(q.observedAt)<begin||
        Date.parse(q.observedAt)>begin+10*MINUTE);
    f.repinSourceAndAll();
    const r=audit(f);noTrade(r);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE',JSON.stringify(r));
    assert.ok(r.originalSourceOrNextOpenCensoredPaths>0||
      r.reasonCodes.includes(
        'PHASE58_FULL_ORIGINAL_OOS_EXIT_AND_DEBIT_REAUDIT_INCOMPLETE'));
  });
  it('changing exit path quote availableAt never becomes genuine market availability proof',()=>{
    const f=fixture(),o=chosen(f),q=f.f.historical.executionQuotes.find(x=>
      x.instrumentKey===o.instrumentKey&&
      x.observedAt===o.nextQuoteAt)!;
    q.availableAt=iso(Date.parse(q.observedAt)+120000);
    f.repinSourceAndAll();
    rejected(f,'PHASE58_FULL_ORIGINAL_OOS_EXIT_AND_DEBIT_REAUDIT_INCOMPLETE');
  });
  it('Phase19 candidate target changed after independent pin is invalid evidence',()=>{
    const f=fixture();
    f.input.phase19RunupPolicy.candidateTargetPoints=150;
    rejected(f,'ORIGINAL_COHORT_AND_INDEPENDENT_PHASE19_PHASE46_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('relabeling Phase46 zero-recovery costs while matching all document hashes is denied',()=>{
    const f=fixture();
    f.input.phase46GapPolicy.horizonRules['8W']
      .hypotheticalEntryFeesINR=0;
    f.repin();
    rejected(f,'PHASE46_AND_PHASE57_FULL_DEBIT_COSTS_NOT_RECONCILED',
      'INVALID_EVIDENCE');
  });
  it('Phase46 first-next-open maximum source lag cannot exceed Phase58 original source lag',()=>{
    const f=fixture();
    f.input.phase46GapPolicy.maxOriginalEventToAvailabilitySeconds=60;
    f.repin();
    rejected(f,'ORIGINAL_COHORT_AND_INDEPENDENT_PHASE19_PHASE46_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('deleting independent OOS decision after re-pinning original quote source does not erase risk denominator',()=>{
    const f=fixture(),missing=f.f.historical.policy.folds[1].testStart;
    f.f.historical.decisions=f.f.historical.decisions.filter(d=>
      d.sessionDate!==missing);
    f.f.historical.provenance.expectedSessions=
      f.f.historical.provenance.expectedSessions.filter(x=>x!==missing);
    f.repinSourceAndAll();
    rejected(f,'PHASE58_FULL_ORIGINAL_OOS_EXIT_AND_DEBIT_REAUDIT_INCOMPLETE');
  });
  it('future quote after original Phase8 exit does not change pretrigger or first-next-open gap classification',()=>{
    const f=fixture(),before=audit(f),o=chosen(f);
    const q=f.f.historical.executionQuotes.find(x=>
      x.instrumentKey===o.instrumentKey&&
      Date.parse(x.observedAt)>Date.parse(o.nextQuoteAt!)+30*MINUTE);
    assert.ok(q);
    q.bid=49;q.ask=50;
    f.repinSourceAndAll();
    const after=audit(f);noTrade(after);
    assert.equal(after.status,before.status,JSON.stringify(after));
    assert.deepEqual(after.cells,before.cells);
    assert.equal(after.firstRunupReversalBeforeCandidateTargetCount,
      before.firstRunupReversalBeforeCandidateTargetCount);
  });
});
