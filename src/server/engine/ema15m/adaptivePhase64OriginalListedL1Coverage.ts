/**
 * Phase64 — practical offline original option-data ACQUISITION COVERAGE audit.
 *
 * Phase21/22 already ingest native CSV. This is NOT another signature layer.
 * It tests whether the existing original Phase63 source has complete and
 * usefully spaced BID/ASK/depth records for EVERY originally listed CE/PE
 * candidate in original OOS decisions (not just profitable selected entries).
 * A no-trade day or unused option contract must never silently disappear.
 *
 * All claims about real NSE/BSE/vendor licence, original capture timestamps,
 * fills, broker stop/GTT and profitability remain hard FALSE. The original
 * source, exchange calendar and pre-declared policy may be operator supplied.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase63OriginalCaptureReceiptChain,
  type Phase63Input,type Phase63IndependentPins,type Phase63Report
} from './adaptivePhase63CaptureReceiptChain.js';
import {analyzeAdaptiveRegime,type AdaptiveRegime}
  from './adaptiveMarketRegime.js';
import type {HistoricalComparisonInput,HistoricalExecutableQuote}
  from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';

const SHA=/^[a-f0-9]{64}$/;
const MIN=60000,DAY=86400000,IST=330*MIN;
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const hash=(v:unknown)=>createHash('sha256').update(
  JSON.stringify(v)).digest('hex');
export const hashPhase64Evidence=hash;
const when=(v:unknown):number=>typeof v==='string'?
  Date.parse(v):NaN;
const istDay=(t:number)=>new Date(t+IST).toISOString().slice(0,10);
const int=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const valid=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const bucket=(days:number):HorizonBucket|null=>
  days>=1&&days<8?'1W':days>=8&&days<18?'2W':
  days>=18&&days<36?'4W':days>=36&&days<=80?'8W':null;
export interface Phase64CoveragePolicy{
  schemaVersion:'ADAPTIVE_PHASE64_PREREGISTERED_LISTED_L1_COVERAGE_V1';
  source:'OFFLINE_ORIGINAL_OOS_ACQUISITION_THRESHOLDS_UNVERIFIED';
  minimumPreCloseOriginalQuotesPerContract:number;
  maximumPreCloseEventGapMinutes:number;
  minimumNextSessionOpenOriginalQuotesPerContract:number;
  nextSessionOpenCoverageMinutes:number;
  maximumBidAskSpreadPercent:number;
  minimumDisplayedBidAskDepthLots:number;
  maximumEventToClaimedAvailableAtLagSeconds:number;
}
export interface Phase64Input{
  schemaVersion:'ADAPTIVE_PHASE64_ALL_LISTED_OOS_OPTION_ACQUISITION_V1';
  source:'OWNER_PRIVATE_UNVERIFIED_ORIGINAL_L1_DATASET';
  phase63:Phase63Input;
  phase63Pins:Phase63IndependentPins;
  policy:Phase64CoveragePolicy;
}
export interface Phase64IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE64_FULL_LISTED_CONTRACT_COVERAGE_PINS_V1';
  expectedPhase63InputSha256:string;
  expectedPhase63PinsSha256:string;
  expectedCoveragePolicySha256:string;
  /** Includes every listed CE/PE contract on EACH original OOS decision. */
  expectedAllOosListedContractManifestSha256:string;
  expectedOosDecisionCount:number;
  expectedAllOosListedContractPairs:number;
  expectedOriginalEntryFirstArmHorizonAttempts:number;
}
export interface Phase64CoverageRow{
  regime:AdaptiveRegime;
  horizon:HorizonBucket;
  optionType:'CE'|'PE';
  expectedOriginalOosContractPairs:number;
  fullySourceCoveredPairs:number;
  missingPreCloseQuotePairs:number;
  missingNextSessionOpenQuotePairs:number;
  excessivePreCloseEventGaps:number;
  wideSpreadPairs:number;
  insufficientDisplayedDepthPairs:number;
  delayedOrNoncausalAvailableAtPairs:number;
  wrongExpiryHorizonOrLotPairs:number;
  originalOosDecisionDaysWithContracts:number;
  sourceCoverageIsNotAnExecutableFill:true;
}
export interface Phase64Report{
  mode:'OFFLINE_ORIGINAL_LISTED_OOS_CE_PE_QUOTE_ACQUISITION_MATRIX';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_SINGLE_REGIME_SOURCE_COVERAGE_ONLY'|
    'DESCRIPTIVE_MULTI_REGIME_SOURCE_COVERAGE_ONLY';
  reasonCodes:string[];
  phase63Status:Phase63Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisions:number;
  originalEntryFirstArmHorizonAttempts:number;
  fullOriginalListedOosContractPairs:number;
  scannedOriginalListedCePeContractPairs:number;
  sourceCoveredListedContractPairs:number;
  sourceIncompleteListedContractPairs:number;
  originalDistinctObservedMarketRegimes:number;
  originalOosTradingDays:number;
  distinctOriginalListedContracts:number;
  additionalEvidenceRequired:string[];
  rows:Phase64CoverageRow[];
  independentRealVendorHistoricalL1LicenseVerified:false;
  independentSourceCaptureAtTimeVerified:false;
  officialExchangeContractExpiryMasterVerified:false;
  officialExchangeSessionCalendarVerified:false;
  sourceSpreadAndDisplayedDepthIsFillProof:false;
  untouchedRealMultiRegimeOosProfitabilityProven:false;
  bestOptionContractOrDurationRecommendationAuthorized:false;
  brokerNativeNrmlStopGttFillAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
}
const REMAIN=[
  'LICENSED_EXCHANGE_OR_VENDOR_NATIVE_HISTORICAL_OPTION_BEST_BID_ASK_AND_DEPTH',
  'INDEPENDENTLY_VERIFIED_ENTITLEMENT_AND_ORIGINAL_VENDOR_IDENTITY',
  'TRUSTED_CONTEMPORANEOUS_SOURCE_RECEIVED_AT_TIMESTAMPS_NOT_REPLAY',
  'INDEPENDENT_OFFICIAL_ISSUER_EXCHANGE_CALENDAR_AND_POINT_IN_TIME_EXPIRY_MASTER',
  'UNTOUCHED_MULTIREGIME_OOS_WITH_FULL_LISTED_CE_PE_QUOTES_AND_NO_TRADE_DAYS',
  'REAL_LIQUIDITY_SPREAD_IV_THETA_OVERNIGHT_GAP_AND_FULL_DEBIT_LOSS_STRESS',
  'BROKER_NATIVE_NRML_GTT_STOP_CANCEL_REPLACE_ACK_AND_GAP_NONFILL_EVIDENCE'
];
const blank=():Phase64Report=>({
  mode:'OFFLINE_ORIGINAL_LISTED_OOS_CE_PE_QUOTE_ACQUISITION_MATRIX',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase63Status:null,syntheticDataset:null,originalOosDecisions:0,
  originalEntryFirstArmHorizonAttempts:0,
  fullOriginalListedOosContractPairs:0,
  scannedOriginalListedCePeContractPairs:0,
  sourceCoveredListedContractPairs:0,
  sourceIncompleteListedContractPairs:0,
  originalDistinctObservedMarketRegimes:0,
  originalOosTradingDays:0,distinctOriginalListedContracts:0,
  additionalEvidenceRequired:REMAIN,rows:[],
  independentRealVendorHistoricalL1LicenseVerified:false,
  independentSourceCaptureAtTimeVerified:false,
  officialExchangeContractExpiryMasterVerified:false,
  officialExchangeSessionCalendarVerified:false,
  sourceSpreadAndDisplayedDepthIsFillProof:false,
  untouchedRealMultiRegimeOosProfitabilityProven:false,
  bestOptionContractOrDurationRecommendationAuthorized:false,
  brokerNativeNrmlStopGttFillAckVerified:false,
  executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null
});
const fail=(reason:string,
  status:Phase64Report['status']='INVALID_EVIDENCE',
  fields?:Partial<Phase64Report>):Phase64Report=>({
  ...blank(),...fields,status,reasonCodes:[reason]
});
function validPolicy(p:Phase64CoveragePolicy):boolean{
  return !!p&&p.schemaVersion===
      'ADAPTIVE_PHASE64_PREREGISTERED_LISTED_L1_COVERAGE_V1'&&
    p.source==='OFFLINE_ORIGINAL_OOS_ACQUISITION_THRESHOLDS_UNVERIFIED'&&
    int(p.minimumPreCloseOriginalQuotesPerContract,2,200)&&
    int(p.maximumPreCloseEventGapMinutes,1,60)&&
    int(p.minimumNextSessionOpenOriginalQuotesPerContract,1,50)&&
    int(p.nextSessionOpenCoverageMinutes,1,120)&&
    valid(p.maximumBidAskSpreadPercent,0.01,50)&&
    int(p.minimumDisplayedBidAskDepthLots,1,100)&&
    int(p.maximumEventToClaimedAvailableAtLagSeconds,0,300);
}
export function originalPhase64OosListedContractManifest(
  historical:HistoricalComparisonInput
):string[]{
  const out:string[]=[];
  historical.policy.folds.forEach((fold,foldIndex)=>{
    for(const d of historical.decisions){
      if(d.sessionDate<fold.testStart||d.sessionDate>fold.testEnd)
        continue;
      for(const c of d.listedContracts)
        out.push([
          foldIndex,d.sessionDate,d.decisionAt,
          c.instrument_key,c.instrument_type,c.expiry,
          c.strike_price,c.lot_size
        ].join('|'));
    }
  });
  return out;
}
type CoverageFlags={
  pre:boolean;post:boolean;gap:boolean;spread:boolean;depth:boolean;
  lag:boolean;expiry:boolean
};
function checkPair(
  decisionAt:number,contract:{
    instrument_key:string;instrument_type:string;expiry:string;
    lot_size:number
  },
  session:{openAt:string;closeAt:string},
  next:{openAt:string;closeAt:string},
  quotes:HistoricalExecutableQuote[],
  policy:Phase64CoveragePolicy,
  horizon:HorizonBucket|null
):CoverageFlags{
  const flags:CoverageFlags={
    pre:false,post:false,gap:false,spread:false,depth:false,
    lag:false,expiry:!horizon||!int(contract.lot_size,1,100000)
  };
  const original=quotes.filter(q=>q.instrumentKey===contract.instrument_key);
  const close=when(session.closeAt),openNext=when(next.openAt),
    closeNext=when(next.closeAt);
  const pre=original.filter(q=>{
    const event=when(q.observedAt);
    return event>=decisionAt&&event<=close;
  }).sort((a,b)=>when(a.observedAt)-when(b.observedAt));
  const post=original.filter(q=>{
    const event=when(q.observedAt);
    return event>=openNext&&event<=Math.min(closeNext,openNext+
      policy.nextSessionOpenCoverageMinutes*MIN);
  }).sort((a,b)=>when(a.observedAt)-when(b.observedAt));
  flags.pre=pre.length<policy.minimumPreCloseOriginalQuotesPerContract;
  flags.post=post.length<
    policy.minimumNextSessionOpenOriginalQuotesPerContract;
  // Include edges! A long quote-free interval before session close is not
  // a market path with proven stop-trigger/fill opportunities.
  const events=[decisionAt,...pre.map(q=>when(q.observedAt)),close];
  flags.gap=events.slice(1).some((event,i)=>
    event-events[i]>policy.maximumPreCloseEventGapMinutes*MIN);
  let lastEvent=-Infinity,lastArrival=-Infinity;
  for(const q of [...pre,...post]){
    const event=when(q.observedAt),arrival=when(q.availableAt);
    if(!Number.isFinite(arrival)||!Number.isFinite(event)||
      arrival<event||
      arrival-event>
        policy.maximumEventToClaimedAvailableAtLagSeconds*1000||
      event<=lastEvent||arrival<lastArrival)
      flags.lag=true;
    lastEvent=event;lastArrival=arrival;
    if(!valid(q.bid,0.01,1e9)||!valid(q.ask,0.01,1e9)||
      q.ask<=q.bid||
      100*(q.ask-q.bid)/q.ask>policy.maximumBidAskSpreadPercent)
      flags.spread=true;
    if(!int(q.bidQty,0,1e9)||!int(q.askQty,0,1e9)||
      !int(contract.lot_size,1,100000)||
      q.bidQty<contract.lot_size*
        policy.minimumDisplayedBidAskDepthLots||
      q.askQty<contract.lot_size*
        policy.minimumDisplayedBidAskDepthLots)
      flags.depth=true;
  }
  return flags;
}
export function auditPhase64OriginalListedL1AcquisitionCoverage(
  input:Phase64Input,pins:Phase64IndependentPins
):Phase64Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE64_ALL_LISTED_OOS_OPTION_ACQUISITION_V1'||
    input.source!=='OWNER_PRIVATE_UNVERIFIED_ORIGINAL_L1_DATASET'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE64_FULL_LISTED_CONTRACT_COVERAGE_PINS_V1'||
    !input.phase63||!input.phase63Pins||!validPolicy(input.policy)||
    ![
      pins.expectedPhase63InputSha256,pins.expectedPhase63PinsSha256,
      pins.expectedCoveragePolicySha256,
      pins.expectedAllOosListedContractManifestSha256
    ].every(x=>typeof x==='string'&&SHA.test(x))||
    pins.expectedPhase63InputSha256!==hash(input.phase63)||
    pins.expectedPhase63PinsSha256!==hash(input.phase63Pins)||
    pins.expectedCoveragePolicySha256!==hash(input.policy)||
    !int(pins.expectedOosDecisionCount,2,100000)||
    !int(pins.expectedAllOosListedContractPairs,1,2000000)||
    pins.expectedOriginalEntryFirstArmHorizonAttempts!==
      pins.expectedOosDecisionCount*12)
    return fail('PHASE64_INDEPENDENT_ALL_LISTED_L1_POLICY_OR_PINS_INVALID');
  const historical=input.phase63.phase62.phase61.phase60.phase59.phase58
    .phase57.phase51.phase50.historical;
  let manifest:string[];
  try{manifest=originalPhase64OosListedContractManifest(historical);}
  catch{return fail('PHASE64_ORIGINAL_OOS_LISTED_CATALOG_UNREADABLE',
    'INCOMPLETE_EVIDENCE');}
  if(hash(manifest)!==pins.expectedAllOosListedContractManifestSha256||
    manifest.length!==pins.expectedAllOosListedContractPairs)
    return fail('PHASE64_ORIGINAL_LISTED_OOS_CONTRACTS_REMOVED_OR_CHANGED',
      'INCOMPLETE_EVIDENCE');
  let prior:Phase63Report;
  try{
    prior=auditPhase63OriginalCaptureReceiptChain(
      input.phase63,input.phase63Pins);
  }catch{return fail('PHASE63_COMPLETE_ORIGINAL_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const partial:Partial<Phase64Report>={
    phase63Status:prior.status,syntheticDataset:prior.syntheticDataset
  };
  if(prior.status!=='DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY')
    return fail('PHASE63_ORIGINAL_SOURCE_LEDGER_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  const calendar=input.phase63.phase62.phase61.phase60.phase59.phase58
    .exitSessions;
  if(!Array.isArray(calendar)||calendar.length<2)
    return fail('PHASE64_DECLARED_ORIGINAL_EXIT_CALENDAR_ABSENT',
      'INCOMPLETE_EVIDENCE',partial);
  const quoteMap=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of historical.executionQuotes){
    const arr=quoteMap.get(q.instrumentKey)??[];
    arr.push(q);quoteMap.set(q.instrumentKey,arr);
  }
  for(const v of quoteMap.values())
    v.sort((a,b)=>when(a.observedAt)-when(b.observedAt));
  const rows=new Map<string,{
    regime:AdaptiveRegime;horizon:HorizonBucket;optionType:'CE'|'PE';
    expectedOriginalOosContractPairs:number;fullySourceCoveredPairs:number;
    missingPreCloseQuotePairs:number;missingNextSessionOpenQuotePairs:number;
    excessivePreCloseEventGaps:number;wideSpreadPairs:number;
    insufficientDisplayedDepthPairs:number;
    delayedOrNoncausalAvailableAtPairs:number;
    wrongExpiryHorizonOrLotPairs:number;days:Set<string>
  }>();
  const decisionDays=new Set<string>(),
    regimes=new Set<AdaptiveRegime>(),instruments=new Set<string>();
  let decisions=0,listed=0,covered=0,unclassified=0;
  historical.policy.folds.forEach((fold,foldIndex)=>{
    for(const d of historical.decisions){
      if(d.sessionDate<fold.testStart||d.sessionDate>fold.testEnd)
        continue;
      decisions++;
      decisionDays.add(foldIndex+'|'+d.sessionDate+'|'+d.decisionAt);
      const regime=analyzeAdaptiveRegime(
        d.candles,new Date(when(d.decisionAt))).regime;
      regimes.add(regime);
      const session=calendar.find(s=>s.sessionDate===d.sessionDate);
      const next=calendar.find(s=>s.sessionDate>d.sessionDate);
      for(const c of d.listedContracts){
        listed++;instruments.add(c.instrument_key);
        const delta=(Date.parse(c.expiry+'T10:00:00Z')-
          when(d.decisionAt))/DAY;
        const horizon=bucket(delta);
        if(!horizon||!['CE','PE'].includes(c.instrument_type)){
          unclassified++;continue;
        }
        const side=c.instrument_type as 'CE'|'PE';
        const k=[regime,horizon,side].join('|');
        let row=rows.get(k);
        if(!row){
          row={regime,horizon,optionType:side,
            expectedOriginalOosContractPairs:0,
            fullySourceCoveredPairs:0,
            missingPreCloseQuotePairs:0,
            missingNextSessionOpenQuotePairs:0,
            excessivePreCloseEventGaps:0,wideSpreadPairs:0,
            insufficientDisplayedDepthPairs:0,
            delayedOrNoncausalAvailableAtPairs:0,
            wrongExpiryHorizonOrLotPairs:0,days:new Set()};
          rows.set(k,row);
        }
        row.expectedOriginalOosContractPairs++;
        row.days.add(foldIndex+'|'+d.sessionDate);
        if(!session||!next){
          row.missingPreCloseQuotePairs++;
          row.missingNextSessionOpenQuotePairs++;
          continue;
        }
        const flags=checkPair(when(d.decisionAt),c,session,next,
          quoteMap.get(c.instrument_key)??[],input.policy,horizon);
        if(flags.pre)row.missingPreCloseQuotePairs++;
        if(flags.post)row.missingNextSessionOpenQuotePairs++;
        if(flags.gap)row.excessivePreCloseEventGaps++;
        if(flags.spread)row.wideSpreadPairs++;
        if(flags.depth)row.insufficientDisplayedDepthPairs++;
        if(flags.lag)row.delayedOrNoncausalAvailableAtPairs++;
        if(flags.expiry)row.wrongExpiryHorizonOrLotPairs++;
        if(!Object.values(flags).some(Boolean)){
          row.fullySourceCoveredPairs++;covered++;
        }
      }
    }
  });
  const outputs:Phase64CoverageRow[]=[...rows.values()].map(r=>({
    ...r,originalOosDecisionDaysWithContracts:r.days.size,
    days:undefined,
    sourceCoverageIsNotAnExecutableFill:true
  })).map(({days,...r})=>r);
  const result:Phase64Report={
    ...blank(),...partial,
    originalOosDecisions:decisions,
    originalEntryFirstArmHorizonAttempts:decisions*12,
    fullOriginalListedOosContractPairs:manifest.length,
    scannedOriginalListedCePeContractPairs:listed,
    sourceCoveredListedContractPairs:covered,
    sourceIncompleteListedContractPairs:listed-covered,
    originalDistinctObservedMarketRegimes:regimes.size,
    originalOosTradingDays:decisionDays.size,
    distinctOriginalListedContracts:instruments.size,
    rows:outputs
  };
  if(decisions!==pins.expectedOosDecisionCount||
    listed!==pins.expectedAllOosListedContractPairs||
    decisions*12!==pins.expectedOriginalEntryFirstArmHorizonAttempts||
    listed!==outputs.reduce((a,r)=>
      a+r.expectedOriginalOosContractPairs,0)||
    unclassified>0)
    return {...result,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:['ORIGINAL_OOS_CONTRACT_HORIZON_TYPE_OR_DENOMINATOR_INVALID']};
  if(covered!==listed)
    return {...result,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:['UNQUALIFIED_OR_MISSING_ORIGINAL_LISTED_OPTION_L1_QUOTES']};
  return {...result,status:regimes.size>1?
    'DESCRIPTIVE_MULTI_REGIME_SOURCE_COVERAGE_ONLY':
    'DESCRIPTIVE_SINGLE_REGIME_SOURCE_COVERAGE_ONLY',
    reasonCodes:[
      'ALL_ORIGINAL_OOS_LISTED_CE_PE_CANDIDATE_QUOTE_WINDOWS_INTERNAL_ONLY',
      'SOURCE_LICENCE_AT_TIME_CAPTURE_AND_REAL_MULTIREGIME_OOS_UNVERIFIED'
    ]};
}
