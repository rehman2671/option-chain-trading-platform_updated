import {
  auditPhase60HorizonRegimeSufficiency,
  hashPhase60Evidence,
  originalPhase60FoldManifest,
  type Phase60Input,type Phase60IndependentPins,
  type Phase60CoveragePolicy
} from '../../server/engine/ema15m/adaptivePhase60HorizonRegimeEvidenceSufficiency.js';
import {makePhase60SyntheticHorizonFixture}
  from './phase60_synthetic_regime_horizon_fixture.js';
const DAY=86400000;
export function makePhase61OriginalProvenanceFixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
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
