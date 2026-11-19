import {
  auditPhase59MatchedPremiumReversalGap,hashPhase59Evidence,
  type Phase59Input,type Phase59IndependentPins
} from '../../server/engine/ema15m/adaptivePhase59PremiumGapCohortJoin.js';
import {makePhase59SyntheticMatchedFixture}
  from './phase59_synthetic_matched_oos_fixture.js';
const MINUTE=60000;
const iso=(n:number)=>new Date(n).toISOString();
export function makePhase60SyntheticHorizonFixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
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
