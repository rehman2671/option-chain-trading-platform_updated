import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase60HorizonRegimeSufficiency,
  hashPhase60Evidence,
  originalPhase60FoldManifest,
  type Phase60Input,type Phase60IndependentPins,
  type Phase60CoveragePolicy
} from '../../server/engine/ema15m/adaptivePhase60HorizonRegimeEvidenceSufficiency.js';
import {runAdaptiveEntryFirstExitStudy}
  from '../../server/engine/ema15m/adaptiveEntryFirstExitStudy.js';
import {makePhase60SyntheticHorizonFixture}
  from './phase60_synthetic_regime_horizon_fixture.js';
const DAY=86400000;
function fixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
  const parent=makePhase60SyntheticHorizonFixture(variant);
  const policy:Phase60CoveragePolicy={
    schemaVersion:'ADAPTIVE_PHASE60_PREREGISTERED_OOS_HORIZON_REVIEW_V1',
    source:'OFFLINE_COVERAGE_THRESHOLDS_UNVERIFIED',
    minimumDistinctOosFolds:3,
    minimumOriginalOosDecisionDays:8,
    minimumDistinctDecisionTimeMarketRegimes:3,
    minimumOosDecisionDaysPerRegime:3,
    minimumEnteredOosDaysPerRegimeArmHorizon:2,
    minimumSameDecisionFourHorizonPairsPerRegimeArm:2,
    minimumOriginalOvernightGapPathsPerRegimeArmHorizon:1,
    minimumCalendarSpanDaysBetweenFirstAndLastOosDate:40,
    minimumDaysBeyondMaximumHoldUntilListedExpiry:1
  };
  const input:Phase60Input={
    schemaVersion:'ADAPTIVE_PHASE60_HORIZON_REGIME_OOS_COVERAGE_V1',
    source:'OFFLINE_UNVERIFIED_LONG_OPTION_MARKET_TAPE',
    phase59:parent.input,phase59Pins:parent.pins,policy
  };
  const pins:Phase60IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE60_ORIGINAL_OOS_COVERAGE_PINS_V1',
    expectedPhase59InputSha256:'',
    expectedPhase59PinsSha256:'',
    expectedCoveragePolicySha256:'',
    expectedOriginalOosFoldDecisionManifestSha256:
      hashPhase60Evidence(originalPhase60FoldManifest(
        parent.f.historical)),
    expectedOriginalOosDecisionDays:2,
    expectedOriginalArmHorizonAttempts:24
  };
  const repinOuter=()=>{
    pins.expectedPhase59InputSha256=hashPhase60Evidence(input.phase59);
    pins.expectedPhase59PinsSha256=hashPhase60Evidence(input.phase59Pins);
    pins.expectedCoveragePolicySha256=hashPhase60Evidence(input.policy);
    // Deliberately DO NOT repin original fold manifest from changed source.
  };
  repinOuter();
  return {parent,input,pins,repinOuter,
    repinSource:()=>{parent.repinSourceAndAll();repinOuter();}};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase60HorizonRegimeSufficiency(f.input,f.pins);
function researchOnly(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.bestContractExpiryOrHorizonRankingAuthorized,false);
  assert.equal(r.calibratedIvThetaVegaExposureVerified,false);
  assert.equal(r.independentlyLicensedNseBseOptionL1Verified,false);
  assert.equal(r.independentlyAuthenticatedSourceArrivalClock,false);
  assert.equal(r.independentlyAuthenticatedListedContractAndExpiryMaster,false);
  assert.equal(r.unbiasedUntouchedHistoricalProfitabilityProven,false);
  assert.equal(r.brokerNrmlStopOrGttAcknowledged,false);
  assert.equal(r.overnightStopCannotGapOrGetRejected,false);
  assert.equal(r.originalCashDebitRiskBoundNotStopFill,true);
  assert.equal(r.originalArmsPerDecision,3);
  assert.equal(r.originalHorizonsPerArm,4);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('BEGIN CERTIFICATE'));
  for(const cell of r.rows){
    assert.equal(cell.tradeOrHorizonRecommendationAuthorized,false);
  }
}
function rejected(f:F,reason:string,
  status:ReturnType<typeof audit>['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);researchOnly(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase60 multi-fold regime×horizon OOS evidence sufficiency and listing expiry coherence',()=>{
  it('2-fold one-regime synthetic OOS never qualifies all 1W/2W/4W/8W as suitable to rank',()=>{
    const f=fixture(),r=audit(f);researchOnly(r);
    assert.equal(r.status,'DESCRIPTIVE_COVERAGE_INSUFFICIENT_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase59Status,
      'DESCRIPTIVE_SINGLE_REGIME_PREMIUM_GAP_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisionDays,2);
    assert.equal(r.originalOosFolds,2);
    assert.equal(r.originalDistinctDecisionTimeRegimes,1);
    assert.equal(r.fullOriginalDecisionArmHorizonAttempts,24);
    assert.equal(r.originalExpiryWindowOrHoldBufferMismatches,0);
    assert.ok(r.originalObservedEntries>0);
    assert.ok(r.distinctOriginalSourcePathsAcrossArms<=
      r.originalObservedEntries);
    assert.equal(r.predeclaredCoverageQualifiedCells,0);
    assert.ok(r.insufficientEvidenceCells>0);
    assert.equal(r.rows.reduce((n,row)=>
      n+row.originalOosAttempts,0),24);
    assert.equal(r.rows.reduce((n,row)=>
      n+row.observedEntries,0),r.originalObservedEntries);
    for(const c of r.rows){
      assert.ok(c.minimumDaysToListedExpiryAtOriginalEntry===null||
        c.minimumDaysToListedExpiryAtOriginalEntry>1);
      assert.equal(c.observedListedExpiryBucketMismatches,0);
      assert.equal(c.observedMaximumHoldToExpiryBufferViolations,0);
      assert.equal(c.originalSourceCensoredPaths,0);
      assert.equal(c.predeclaredSampleCoverageQualified,false);
    }
  });
  it('real Phase19 premium +30 then reversal before +100 remains risk alert, not best expiry choice',()=>{
    const f=fixture('GIVEBACK');
    const r=rejected(f,
      'ORIGINAL_OOS_OPTION_PREMIUM_REVERSAL_OR_GAP_RISK_OBSERVED',
      'DESCRIPTIVE_DOWNSIDE_RISK_ALERT_ONLY');
    assert.ok(r.originalPremiumReversalObservations>0);
    assert.equal(r.predeclaredCoverageQualifiedCells,0);
    assert.ok(r.rows.some(x=>x.riskAlertObserved));
  });
  it('actual original next-session gap under predeclared 20pct budget remains downside alert',()=>{
    const f=fixture('GAP');
    for(const h of ['1W','2W','4W','8W'] as const)
      f.input.phase59.phase46GapPolicy.horizonRules[h]
        .maximumPermittedAdverseBidGapPercent=20;
    f.parent.repin();f.repinOuter();
    const r=rejected(f,
      'ORIGINAL_OOS_OPTION_PREMIUM_REVERSAL_OR_GAP_RISK_OBSERVED',
      'DESCRIPTIVE_DOWNSIDE_RISK_ALERT_ONLY');
    assert.ok(r.originalNextOpenGapOrDebitAlerts>0);
    assert.equal(r.originalExpiryWindowOrHoldBufferMismatches,0);
  });
  it('requiring a longer hold-to-expiry safety buffer makes short expiries fail closed',()=>{
    const f=fixture();
    f.input.policy.minimumDaysBeyondMaximumHoldUntilListedExpiry=10;
    f.repinOuter();
    const r=rejected(f,
      'ORIGINAL_SELECTED_CONTRACT_EXPIRY_WINDOW_OR_HOLD_BUFFER_INVALID');
    assert.ok(r.originalExpiryWindowOrHoldBufferMismatches>0);
  });
  it('post-hoc reducing minimum folds and OOS days without independent pins is invalid',()=>{
    const f=fixture();
    f.input.policy.minimumDistinctOosFolds=2;
    f.input.policy.minimumOriginalOosDecisionDays=2;
    rejected(f,'PHASE60_INDEPENDENT_ORIGINAL_SOURCE_OR_COVERAGE_POLICY_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('independently pinned two-fold manifest cannot drop one original OOS day even after source rehash',()=>{
    const f=fixture(),hist=f.parent.f.historical;
    const missing=hist.policy.folds[1].testStart;
    hist.decisions=hist.decisions.filter(d=>d.sessionDate!==missing);
    hist.provenance.expectedSessions=hist.provenance.expectedSessions
      .filter(d=>d!==missing);
    f.repinSource();
    const r=rejected(f,'ORIGINAL_FOLD_SESSION_MANIFEST_CHANGED_OR_DROPPED');
    assert.equal(r.originalOosDecisionDays,0);
  });
  it('source availableAt manipulation cannot become legitimate horizon evidence after operator re-pins',()=>{
    const f=fixture(),hist=f.parent.f.historical;
    const o=runAdaptiveEntryFirstExitStudy(
      hist,f.parent.input.phase58.exitPolicy,
      f.parent.input.phase58.exitSessions).outcomes.find(
        x=>x.status==='PRICED_EXIT'&&x.nextQuoteAt);
    assert.ok(o);
    const q=hist.executionQuotes.find(x=>
      x.instrumentKey===o.instrumentKey&&x.observedAt===o.nextQuoteAt)!;
    q.availableAt=new Date(Date.parse(q.observedAt)+300000).toISOString();
    f.repinSource();
    rejected(f,'PHASE59_FULL_ORIGINAL_OOS_PREMIUM_GAP_SOURCE_INCOMPLETE');
  });
  it('source-neutral change to future unused option quote cannot choose best horizon',()=>{
    const f=fixture(),before=audit(f),hist=f.parent.f.historical;
    const original=runAdaptiveEntryFirstExitStudy(
      hist,f.parent.input.phase58.exitPolicy,
      f.parent.input.phase58.exitSessions).outcomes.find(x=>
        x.status==='PRICED_EXIT'&&x.nextQuoteAt)!;
    const future=hist.executionQuotes.find(q=>
      q.instrumentKey===original.instrumentKey&&
      Date.parse(q.observedAt)>Date.parse(original.nextQuoteAt!)+30*60000)!;
    assert.ok(future);
    future.bid=49;future.ask=50;
    f.repinSource();
    const after=audit(f);researchOnly(after);
    assert.equal(after.status,before.status,JSON.stringify(after));
    assert.deepEqual(after.rows,before.rows);
    assert.equal(after.bestContractExpiryOrHorizonRankingAuthorized,false);
  });
  it('fake extra OOS fold count in independent pins cannot replace original fold manifest',()=>{
    const f=fixture();
    f.pins.expectedOriginalOosDecisionDays=10;
    f.pins.expectedOriginalArmHorizonAttempts=120;
    rejected(f,'ORIGINAL_FOLD_SESSION_MANIFEST_CHANGED_OR_DROPPED');
  });
  it('lower sample threshold with a single original regime still never establishes multi-regime edge',()=>{
    const f=fixture();
    f.input.policy.minimumDistinctOosFolds=2;
    f.input.policy.minimumOriginalOosDecisionDays=2;
    f.input.policy.minimumOosDecisionDaysPerRegime=2;
    f.input.policy.minimumEnteredOosDaysPerRegimeArmHorizon=2;
    f.input.policy.minimumCalendarSpanDaysBetweenFirstAndLastOosDate=1;
    f.repinOuter();
    const r=audit(f);researchOnly(r);
    assert.equal(r.status,'DESCRIPTIVE_COVERAGE_INSUFFICIENT_ONLY');
    assert.equal(r.originalDistinctDecisionTimeRegimes,1);
    assert.equal(r.bestContractExpiryOrHorizonRankingAuthorized,false);
  });
});
