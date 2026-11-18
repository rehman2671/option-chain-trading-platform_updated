/** SYNTHETIC ONLY — Phase47 reuses all four Phase46 original option L1 input fixtures. */
import {
  hashPhase46GapEvidence,type Phase46GapStressInput,
  type Phase46GapStressPins,type Phase46GapStressPolicy,
  type Phase46Horizon,type Phase46IndexOptionGapPath,
  type Phase46OriginalL1Snapshot
} from '../../server/engine/ema15m/adaptiveUpstoxPhase46LongOptionGapRisk.js';

const H:Phase46Horizon[]=['1W','2W','4W','8W'];
const entry='2026-11-20T09:30:00+05:30';
const nextOpen='2026-11-23T09:15:00+05:30';
const preClose='2026-11-20T15:30:00+05:30';
const after=(date:string,days:number)=>
  new Date(Date.parse(date)+days*86400000).toISOString();
function quote(
  key:string,observedAt:string,bid:number,ask:number,
  bidDepth=65,askDepth=65
):Phase46OriginalL1Snapshot{
  return {
    instrumentKey:key,observedAt,
    availableAt:new Date(Date.parse(observedAt)+2000).toISOString(),
    bid,ask,displayedBidQuantity:bidDepth,
    displayedAskQuantity:askDepth
  };
}
export function makePhase47SyntheticGapFixture(){
  const paths:Phase46IndexOptionGapPath[]=H.map((h,i)=>{
    const instrument='NSE_FO|SYNTHETIC_'+h.replace('W','W_OPT')+'_CE';
    return {
      horizon:h,source:'OPERATOR_SUPPLIED_ORIGINAL_L1_UNVERIFIED',
      contractType:'CASH_SETTLED_INDEX_OPTION_DECLARED_UNVERIFIED',
      instrumentKey:instrument,optionType:'CE',
      expiryAt:after(entry,[7,14,28,56][i]),
      lotSize:65,quantity:65,entryDecisionAt:entry,
      preCloseAt:preClose,nextSessionOpenAt:nextOpen,
      entryQuote:quote(instrument,'2026-11-20T09:29:00+05:30',
        245,250,65,65),
      preCloseQuote:quote(instrument,'2026-11-20T15:29:00+05:30',
        230,240,65,65),
      nextOpenQuote:quote(instrument,'2026-11-23T09:15:05+05:30',
        100,110,65,65),
      declaredStopTriggerPremium:220
    };
  });
  const input:Phase46GapStressInput={
    schemaVersion:'ADAPTIVE_V2_PHASE46_FOUR_HORIZON_GAP_EVIDENCE_V1',
    source:'OFFLINE_UNAUTHENTICATED_ARCHIVE',
    datasetLabel:'SYNTHETIC_TEST',paths
  };
  const rules={
    postOpenBidHaircutBps:1000,
    maximumPermittedFullDebitLossINR:20000,
    maximumPermittedAdverseBidGapPercent:60,
    minimumPostOpenDisplayedBidLots:1,
    hypotheticalEntryFeesINR:15,
    hypotheticalExitFeesINR:15
  };
  const policy:Phase46GapStressPolicy={
    schemaVersion:'ADAPTIVE_V2_PHASE46_LONG_INDEX_OPTION_GAP_STRESS_V1',
    maxOriginalEventToAvailabilitySeconds:20,
    maxPostOpenFirstQuoteLagMinutes:10,
    horizonRules:{
      '1W':{...rules},'2W':{...rules},'4W':{...rules},'8W':{...rules}
    }
  };
  const pins:Phase46GapStressPins={
    schemaVersion:'INDEPENDENT_PHASE46_GAP_PATH_AND_POLICY_PINS_V1',
    expectedDatasetLabel:'SYNTHETIC_TEST',
    expectedInstrumentKeys:{
      '1W':paths[0].instrumentKey,'2W':paths[1].instrumentKey,
      '4W':paths[2].instrumentKey,'8W':paths[3].instrumentKey
    },
    expectedPathSha256:{
      '1W':'','2W':'','4W':'','8W':''
    },
    expectedPolicySha256:''
  };
  const resign=()=>{
    for(const h of H){
      const p=input.paths.find(x=>x.horizon===h)!;
      pins.expectedPathSha256[h]=hashPhase46GapEvidence(p);
    }
    pins.expectedPolicySha256=hashPhase46GapEvidence(policy);
  };
  resign();
  return {input,pins,policy,resign};
}
