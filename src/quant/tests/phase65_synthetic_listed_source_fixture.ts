import {
  originalPhase64OosListedContractManifest,hashPhase64Evidence,
  type Phase64Input,type Phase64IndependentPins,
  type Phase64CoveragePolicy
} from '../../server/engine/ema15m/adaptivePhase64OriginalListedL1Coverage.js';
import {makePhase63SyntheticCaptureFixture}
  from './phase63_synthetic_capture_receipt_fixture.js';

export function makePhase65OriginalListedCoverageFixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
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
