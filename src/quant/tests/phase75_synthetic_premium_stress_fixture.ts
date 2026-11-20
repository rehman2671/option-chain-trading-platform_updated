/**
 * Entire source and scenario grid is synthetic.  Scenario BID/ASK values
 * are operator-imagined stress arithmetic, NEVER historical evidence or
 * an exchange/broker stop/fill.
 */
import {createHash} from 'node:crypto';
import {
  makePhase74SyntheticCausalReplayFixture
} from './phase74_synthetic_causal_replay_fixture.js';
import {
  hashPhase75Evidence,type Phase75Input,type Phase75Pins,
  type Phase75ScenarioArchive,type Phase75RiskPolicy,
  type Phase75CounterfactualPath,type Phase75ScenarioKind
} from '../../server/engine/ema15m/adaptivePhase75CounterfactualPremiumStopStress.js';

const sha=(b:Uint8Array)=>createHash('sha256').update(b)
  .digest('hex');
export function makePhase75SyntheticPremiumStressFixture(){
  const previous=makePhase74SyntheticCausalReplayFixture();
  const vendor=previous.previous.vendor;
  const policy:Phase75RiskPolicy={
    schemaVersion:'ADAPTIVE_PHASE75_PREREGISTERED_COUNTERFACTUAL_STRESS_V1',
    source:'SYNTHETIC_OPTION_PREMIUM_NOT_HISTORICAL_MARKET_OUTCOME',
    premiumTrailArmingGainPoints:50,
    premiumGivebackAlertPoints:20,
    premiumTargetAlertPoints:100,
    assumedNonRecoverableEntryAndExitFeesINR:50,
    minimumDisplayedBidDepthLotsForMark:1,
    maxSingleLongOptionPaidDebitPlusFeesINR:4000,
    maxAdverseObservedMarkLossINR:3000,
    requireAllFourScenariosPerOriginalEntryClaimedListedOption:true,
    prohibitNoEntryOptionFromSimulatedPosition:true,
    nativeBrokerStopAcknowledgementMayNotBeInferred:true
  };
  const paths:Phase75CounterfactualPath[]=[];
  for(const d of vendor.catalog.decisions){
    if(d.originalEntryDisposition==='NO_ENTRY')continue;
    for(const c of d.originallyListedContracts){
      const common={sessionDate:d.sessionDate,
        instrumentKey:c.instrumentKey,
        assumedEntryAskPremiumPoints:100,
        assumedPeakBidPremiumPoints:170};
      paths.push({
        ...common,scenario:'PRE_TARGET_GIVEBACK',
        assumedLaterBidPremiumPoints:120,
        assumedLaterDisplayedBidDepthLots:2
      },{
        ...common,scenario:'OVERNIGHT_GAP_BELOW_TRAIL',
        assumedLaterBidPremiumPoints:10,
        assumedLaterDisplayedBidDepthLots:2
      },{
        ...common,scenario:'NEXT_OPEN_ZERO_BID_DEPTH',
        assumedLaterBidPremiumPoints:0,
        assumedLaterDisplayedBidDepthLots:0
      },{
        ...common,scenario:'EXPIRY_FULL_PREMIUM_DEBIT_LOSS',
        assumedLaterBidPremiumPoints:0,
        assumedLaterDisplayedBidDepthLots:0
      });
    }
  }
  const archive:Phase75ScenarioArchive={
    schemaVersion:'ADAPTIVE_PHASE75_FOUR_COUNTERFACTUAL_PATHS_PER_ENTRY_V1',
    source:'HANDCRAFTED_STRESS_PATHS_NOT_HISTORICAL_PRICE_OBSERVATIONS',
    paths
  };
  const input:Phase75Input={
    schemaVersion:'ADAPTIVE_PHASE75_PREMIUM_STOP_NOFILL_STRESS_V1',
    source:'OFFLINE_FROZEN_OOS_COUNTERFACTUAL_ARITHMETIC_NO_BROKER_WRITES',
    phase74:previous.input,phase74Pins:previous.pins,policy,
    scenarioArchiveRawBase64:''
  };
  const pins:Phase75Pins={
    schemaVersion:'INDEPENDENT_PHASE75_PREDECLARED_PREMIUM_STRESS_PINS_V1',
    expectedPhase74InputSha256:'',
    expectedPhase74PinsSha256:'',
    expectedRiskPolicySha256:'',
    expectedScenarioArchiveRawSha256:'',
    expectedOriginalOosDecisions:4,
    expectedOriginalNoEntryDecisions:2,
    expectedAllListedCePePairs:32,
    expectedOriginalEntryClaimedListedPairs:16,
    expectedOriginalNoEntryListedPairs:16,
    expectedScenarioPaths:64
  };
  const updatePaths=()=>{
    input.scenarioArchiveRawBase64=Buffer.from(
      JSON.stringify(archive),'utf8').toString('base64');
  };
  const repin=()=>{
    pins.expectedPhase74InputSha256=hashPhase75Evidence(input.phase74);
    pins.expectedPhase74PinsSha256=hashPhase75Evidence(input.phase74Pins);
    pins.expectedRiskPolicySha256=hashPhase75Evidence(input.policy);
    pins.expectedScenarioArchiveRawSha256=sha(Buffer.from(
      input.scenarioArchiveRawBase64,'base64'));
  };
  const mutate=(index:number,change:Partial<Phase75CounterfactualPath>)=>{
    if(!paths[index])throw Error('counterfactual path absent');
    Object.assign(paths[index],change);
    updatePaths();repin();
  };
  const allCounterfactualCases=[
    'PRE_TARGET_GIVEBACK','OVERNIGHT_GAP_BELOW_TRAIL',
    'NEXT_OPEN_ZERO_BID_DEPTH','EXPIRY_FULL_PREMIUM_DEBIT_LOSS'
  ] as Phase75ScenarioKind[];
  updatePaths();repin();
  return {previous,vendor,policy,archive,paths,input,pins,
    updatePaths,repin,mutate,allCounterfactualCases};
}
