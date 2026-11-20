import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase64OriginalListedL1AcquisitionCoverage,
  originalPhase64OosListedContractManifest,hashPhase64Evidence,
  type Phase64Input,type Phase64IndependentPins,
  type Phase64CoveragePolicy,type Phase64Report
} from '../../server/engine/ema15m/adaptivePhase64OriginalListedL1Coverage.js';
import {makePhase63SyntheticCaptureFixture}
  from './phase63_synthetic_capture_receipt_fixture.js';

function fixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
  const parent=makePhase63SyntheticCaptureFixture(variant);
  const original=parent.parent.phase61.history;
  const policy:Phase64CoveragePolicy={
    schemaVersion:'ADAPTIVE_PHASE64_PREREGISTERED_LISTED_L1_COVERAGE_V1',
    source:'OFFLINE_ORIGINAL_OOS_ACQUISITION_THRESHOLDS_UNVERIFIED',
    minimumPreCloseOriginalQuotesPerContract:4,
    maximumPreCloseEventGapMinutes:10,
    minimumNextSessionOpenOriginalQuotesPerContract:2,
    nextSessionOpenCoverageMinutes:10,
    maximumBidAskSpreadPercent:5,
    minimumDisplayedBidAskDepthLots:1,
    maximumEventToClaimedAvailableAtLagSeconds:30
  };
  const input:Phase64Input={
    schemaVersion:'ADAPTIVE_PHASE64_ALL_LISTED_OOS_OPTION_ACQUISITION_V1',
    source:'OWNER_PRIVATE_UNVERIFIED_ORIGINAL_L1_DATASET',
    phase63:parent.input,phase63Pins:parent.pins,policy
  };
  const expectedManifest=originalPhase64OosListedContractManifest(original);
  const pins:Phase64IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE64_FULL_LISTED_CONTRACT_COVERAGE_PINS_V1',
    expectedPhase63InputSha256:'',
    expectedPhase63PinsSha256:'',
    expectedCoveragePolicySha256:'',
    expectedAllOosListedContractManifestSha256:
      hashPhase64Evidence(expectedManifest),
    expectedOosDecisionCount:2,
    expectedAllOosListedContractPairs:expectedManifest.length,
    expectedOriginalEntryFirstArmHorizonAttempts:24
  };
  const repin=()=>{
    pins.expectedPhase63InputSha256=hashPhase64Evidence(input.phase63);
    pins.expectedPhase63PinsSha256=hashPhase64Evidence(input.phase63Pins);
    pins.expectedCoveragePolicySha256=hashPhase64Evidence(input.policy);
    // The OOS manifest pin is intentionally frozen independently.
  };
  repin();
  return {parent,original,input,pins,repin};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase64OriginalListedL1AcquisitionCoverage(
  f.input,f.pins);
function noTrading(r:Phase64Report){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.independentRealVendorHistoricalL1LicenseVerified,false);
  assert.equal(r.independentSourceCaptureAtTimeVerified,false);
  assert.equal(r.officialExchangeContractExpiryMasterVerified,false);
  assert.equal(r.officialExchangeSessionCalendarVerified,false);
  assert.equal(r.sourceSpreadAndDisplayedDepthIsFillProof,false);
  assert.equal(r.untouchedRealMultiRegimeOosProfitabilityProven,false);
  assert.equal(r.bestOptionContractOrDurationRecommendationAuthorized,false);
  assert.equal(r.brokerNativeNrmlStopGttFillAckVerified,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('BEGIN PRIVATE KEY'));
  for(const c of r.rows)
    assert.equal(c.sourceCoverageIsNotAnExecutableFill,true);
}
function rejected(f:F,reason:string,
  status:Phase64Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);noTrading(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase64 original OOS acquisition matrix ALL listed CE/PE and four horizons',()=>{
  it('audits every listed contract on two OOS decision dates, including non-selected alternatives, no winning-only selection',()=>{
    const f=fixture(),r=audit(f);noTrading(r);
    assert.equal(r.status,
      'DESCRIPTIVE_SINGLE_REGIME_SOURCE_COVERAGE_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase63Status,
      'DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisions,2);
    assert.equal(r.originalEntryFirstArmHorizonAttempts,24);
    assert.equal(r.originalOosTradingDays,2);
    assert.equal(r.originalDistinctObservedMarketRegimes,1);
    assert.equal(r.fullOriginalListedOosContractPairs,
      f.pins.expectedAllOosListedContractPairs);
    assert.ok(r.fullOriginalListedOosContractPairs>=16);
    assert.equal(r.sourceCoveredListedContractPairs,
      r.fullOriginalListedOosContractPairs);
    assert.equal(r.sourceIncompleteListedContractPairs,0);
    assert.equal(r.rows.reduce((n,row)=>
      n+row.expectedOriginalOosContractPairs,0),
      r.fullOriginalListedOosContractPairs);
    assert.equal(new Set(r.rows.map(row=>
      row.horizon+'|'+row.optionType)).size,8);
    assert.ok(r.additionalEvidenceRequired.some(x=>x.includes('LICENSED')));
  });
  it('predeclared stricter 3-minute quote cadence reports all missing intraday price gaps, not usable stops',()=>{
    const f=fixture();
    f.input.policy.maximumPreCloseEventGapMinutes=3;
    f.repin();
    const r=rejected(f,'UNQUALIFIED_OR_MISSING_ORIGINAL_LISTED_OPTION_L1_QUOTES');
    assert.ok(r.rows.some(x=>x.excessivePreCloseEventGaps>0));
    assert.ok(r.sourceIncompleteListedContractPairs>0);
  });
  it('narrow first-next-open window cannot substitute a later favorable BID for source-required second print',()=>{
    const f=fixture();
    f.input.policy.nextSessionOpenCoverageMinutes=1;
    f.repin();
    const r=rejected(f,'UNQUALIFIED_OR_MISSING_ORIGINAL_LISTED_OPTION_L1_QUOTES');
    assert.ok(r.rows.some(x=>x.missingNextSessionOpenQuotePairs>0));
  });
  it('tight option quoted BID/ASK spread cap reveals acquisition readiness gap, not profitable contract rank',()=>{
    const f=fixture();
    f.input.policy.maximumBidAskSpreadPercent=.5;
    f.repin();
    const r=rejected(f,'UNQUALIFIED_OR_MISSING_ORIGINAL_LISTED_OPTION_L1_QUOTES');
    assert.ok(r.rows.some(x=>x.wideSpreadPairs>0));
  });
  it('requiring larger displayed bid and ask depth detects no assumed executable fill',()=>{
    const f=fixture();
    f.input.policy.minimumDisplayedBidAskDepthLots=16;
    f.repin();
    const r=rejected(f,'UNQUALIFIED_OR_MISSING_ORIGINAL_LISTED_OPTION_L1_QUOTES');
    assert.ok(r.rows.some(x=>x.insufficientDisplayedDepthPairs>0));
    assert.equal(r.sourceSpreadAndDisplayedDepthIsFillProof,false);
  });
  it('minimum original pre-close quote density cannot be relaxed by favorable later option returns',()=>{
    const f=fixture();
    f.input.policy.minimumPreCloseOriginalQuotesPerContract=200;
    f.repin();
    const r=rejected(f,'UNQUALIFIED_OR_MISSING_ORIGINAL_LISTED_OPTION_L1_QUOTES');
    assert.ok(r.rows.some(x=>x.missingPreCloseQuotePairs>0));
  });
  it('original OOS contract universe independently pinned and cannot omit unprofitable CE/PE after source rehash',()=>{
    const f=fixture();
    f.pins.expectedAllOosListedContractManifestSha256='5a'.repeat(32);
    rejected(f,'PHASE64_ORIGINAL_LISTED_OOS_CONTRACTS_REMOVED_OR_CHANGED');
  });
  it('invented extra original OOS contracts cannot become historical observations by editing expected counts',()=>{
    const f=fixture();
    f.pins.expectedAllOosListedContractPairs+=1;
    rejected(f,'PHASE64_ORIGINAL_LISTED_OOS_CONTRACTS_REMOVED_OR_CHANGED');
  });
  it('policy cannot be tuned to selected OOS data after independently locked coverage hash',()=>{
    const f=fixture();
    f.input.policy.maximumBidAskSpreadPercent=2;
    rejected(f,'PHASE64_INDEPENDENT_ALL_LISTED_L1_POLICY_OR_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('invalid parent Phase63 quote-receipt signature source is never accepted as original market data',()=>{
    const f=fixture();
    f.input.phase63.collectorDetachedSignatureBase64='aGVsbG8=';
    f.repin();
    rejected(f,'PHASE63_ORIGINAL_SOURCE_LEDGER_INCOMPLETE');
  });
  it('premium giveback and adverse overnight gap variants do not authorize ranking or broker fills',()=>{
    for(const variant of ['GIVEBACK','GAP'] as const){
      const f=fixture(variant),r=audit(f);noTrading(r);
      assert.equal(r.status,
        'DESCRIPTIVE_SINGLE_REGIME_SOURCE_COVERAGE_ONLY',
        JSON.stringify(r));
      assert.equal(r.bestOptionContractOrDurationRecommendationAuthorized,false);
      assert.equal(r.brokerNativeNrmlStopGttFillAckVerified,false);
    }
  });
});
