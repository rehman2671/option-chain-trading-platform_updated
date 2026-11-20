/**
 * Standalone NEW Phase66 vendor fixture plus Phase67 second synthetic
 * issuer-like master, with no real source issuer, client clock or fills.
 */
import {
  makePhase67SyntheticIssuerCrosscheckFixture
} from './phase67_synthetic_issuer_calendar_fixture.js';
import {
  hashPhase68Evidence,type Phase68Input,type Phase68IndependentPins,
  type Phase68Policy
} from '../../server/engine/ema15m/adaptivePhase68OriginalDurationCensoring.js';

export function makePhase68SyntheticFullDurationFixture(){
  const parent=makePhase67SyntheticIssuerCrosscheckFixture();
  const policy:Phase68Policy={
    schemaVersion:'ADAPTIVE_PHASE68_PREDECLARED_PREMIUM_CENSORING_V1',
    source:'OWNER_PREREGISTERED_QUOTE_RESEARCH_UNVERIFIED',
    maxEntryAskOriginalArrivalLagMinutes:10,
    maxLastBidMarkAgeBeforeCloseMinutes:10,
    firstNextOpenWindowMinutes:10,
    minimumOriginalBidObservationsPerDeclaredSession:1,
    minimumBidDepthLotsForMarks:1,
    premiumRunupAlertPoints:40,
    premiumGivebackAlertPoints:30,
    overnightBidGapAlertPoints:4
  };
  const input:Phase68Input={
    schemaVersion:'ADAPTIVE_PHASE68_OOS_MULTI_WEEK_OPTION_PREMIUM_CENSORSHIP_V1',
    source:'OFFLINE_ORIGINAL_L1_QUOTE_MARKS_UNVERIFIED',
    phase67:parent.input,phase67Pins:parent.pins,policy
  };
  const pins:Phase68IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE68_ORIGINAL_DURATION_RISK_PINS_V1',
    expectedPhase67InputSha256:'',
    expectedPhase67PinsSha256:'',
    expectedCoverageAndPremiumAlertPolicySha256:'',
    expectedOriginalOosDecisions:4,
    expectedOriginallyListedCePePairs:32,
    expectedOriginalNoEntryDays:2,
    expectedOriginalEntryClaimedDays:2
  };
  const repin=()=>{
    pins.expectedPhase67InputSha256=hashPhase68Evidence(input.phase67);
    pins.expectedPhase67PinsSha256=hashPhase68Evidence(input.phase67Pins);
    pins.expectedCoverageAndPremiumAlertPolicySha256=
      hashPhase68Evidence(input.policy);
  };
  const repinQuotes=()=>{
    parent.vendor.updateQuotes();
    parent.vendor.repinOuter();
    parent.repin();
    repin();
  };
  repin();
  return {parent,input,pins,repin,repinQuotes};
}
