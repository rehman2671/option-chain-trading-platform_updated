/**
 * Phase 13 — OFFLINE paired decision-universe comparison between the exact
 * Phase 8 original entry-first strategies and Phase 12 HYSTERESIS-GATED arms.
 *
 * The two policies receive the SAME original decision and option L1 universe,
 * yet enroll their entries independently with separate predeclared cooldown
 * calendars. Neither uses future L1/PnL to decide entries. Missing quote paths
 * are CENSORED, not discarded, and skipped original profitable candidates
 * are counted explicitly. Hypothetical next bid is NEVER a broker fill.
 *
 * This is not causal inference, a strategy optimizer, a trade authorization
 * or an assertion that fewer direction flips improve expected option profit.
 */
import type {HistoricalArm,HistoricalComparisonInput} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';
import type {DeclaredTradingSession} from './adaptiveSessionIntegrity.js';
import type {AdaptiveExitReplayPolicy} from './adaptivePositionalExitReplay.js';
import {
  runAdaptiveEntryFirstExitStudy,type EntryFirstExitStudy,type EntryFirstExitOutcome
} from './adaptiveEntryFirstExitStudy.js';
import {adaptiveCohortAdvisoryKey,type CohortDecision} from
  './adaptiveEntryFirstCohort.js';
import {replayAdaptiveRegimeHysteresis,type HysteresisResearchPolicy,
  type HysteresisResearchReport} from './adaptiveRegimeHysteresis.js';

const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const count=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=max;
const fraction=(n:unknown):n is number=>
  typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
const round=(n:number)=>Number(n.toFixed(2));
const sameKey=(a:{foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;decisionAt:string})=>
  [a.foldIndex,a.arm,a.horizon,a.decisionAt].join('|');

export interface HysteresisMatchedOosPolicy {
  schemaVersion:'ADAPTIVE_HYSTERESIS_MATCHED_OOS_V1';
  /** Descriptive sample minima, not statistical significance. */
  minimumJointlyPricedPairsPerCell:number;
  /** Fraction of entry cohorts for which ORIGINAL next-bid exit is censored. */
  maximumUnpricedExitFractionPerCell:number;
  maximumMissingEntryFractionPerCell:number;
}
export interface HysteresisMatchedOosCell {
  foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;
  allOutOfSampleDecisions:number;
  originalObservedEntries:number;
  stabilizedObservedEntries:number;
  originalMissingEntryQuotes:number;
  stabilizedMissingEntryQuotes:number;
  bothEntered:number;
  originalOnlyEntries:number;
  stabilizedOnlyEntries:number;
  neitherEntered:number;
  jointlyPricedPairs:number;
  jointlyCensoredPairs:number;
  originalPricedExits:number;
  originalCensoredExits:number;
  stabilizedPricedExits:number;
  stabilizedCensoredExits:number;
  /** Original-only opportunities that later PRICE as winners/losers. */
  skippedOriginalWinnersObserved:number;
  skippedOriginalLosersObserved:number;
  skippedOriginalUnpriced:number;
  /** Future PnL is read only AFTER the independent entry cohorts exist. */
  originalCompleteCohortNetPnlINR:number|null;
  stabilizedCompleteCohortNetPnlINR:number|null;
  /** Null if any jointly enrolled exit was unpriced or sample too small. */
  matchedCompleteNetDeltaINR:number|null;
  fullyCohortComparable:boolean;
  descriptivePairedSampleSufficient:boolean;
  blockers:string[];
}
export interface HysteresisMatchedOosReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  brokerStopsInstalled:false;
  historicalSourceAuthenticated:false;
  exchangeCalendarAuthenticated:false;
  originalClockIndependentlyAuthenticated:false;
  method:'INDEPENDENT_ENTRY_FIRST_SAME_DECISION_AND_QUOTE_UNIVERSE';
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'DESCRIPTIVE_ONLY';
  errors:string[];
  warnings:string[];
  datasetId:string|null;
  synthetic:boolean|null;
  originalExitStatus:EntryFirstExitStudy['status']|null;
  stabilizedExitStatus:EntryFirstExitStudy['status']|null;
  hysteresisStatus:HysteresisResearchReport['status']|null;
  totalDecisionCells:number;
  cells:HysteresisMatchedOosCell[];
}
const warnings=[
  'ENTRY_COHORTS_GENERATED_BEFORE_READING_FUTURE_EXIT_OUTCOMES',
  'HYSTERESIS_HAS_INDEPENDENT_EXPOSURE_COOLDOWN_FROM_BASELINE',
  'LATER_SKIPPED_WINNER_LOSER_COUNTS_ARE_OUTCOME_AUDIT_NOT_LOOKAHEAD_SELECTION',
  'NONPAIRED_ENTRIES_HAVE_DIFFERENT_EXPOSURE_CALENDARS_AND_NO_CAUSAL_DELTA',
  'MISSING_OPTION_L1_OR_UNPRICED_NEXT_BID_NEVER_ASSIGNED_ZERO_PNL',
  'PAIRED_DESCRIPTIVE_DELTA_IS_NOT_STATISTICAL_SIGNIFICANCE',
  'PREDECLARED_HYSTERESIS_SETTINGS_MAY_MISS_PROFITABLE_REVERSALS',
  'NO_AUTHENTIC_VENDOR_OPTION_L1_OR_REAL_BROKER_FILL_ESTABLISHED'
];
function validPolicy(p:HysteresisMatchedOosPolicy):boolean{
  return !!p&&p.schemaVersion==='ADAPTIVE_HYSTERESIS_MATCHED_OOS_V1'&&
    count(p.minimumJointlyPricedPairsPerCell,1,100000)&&
    fraction(p.maximumUnpricedExitFractionPerCell)&&
    fraction(p.maximumMissingEntryFractionPerCell);
}
function indexUnique<T extends {foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;decisionAt:string}>(
  items:T[]
):Map<string,T>|null {
  const map=new Map<string,T>();
  for(const item of items){
    const k=sameKey(item);
    if(map.has(k))return null;
    map.set(k,item);
  }
  return map;
}
const completeOutcome=(o:EntryFirstExitOutcome|undefined)=>
  !!o&&o.status==='PRICED_EXIT'&&
  typeof o.hypotheticalNetPnlINR==='number'&&
  Number.isFinite(o.hypotheticalNetPnlINR)&&
  typeof o.hypotheticalExitBid==='number'&&
  o.hypotheticalExitBid>0&&!!o.nextQuoteAt;

function aggregateCell(
  foldIndex:number,arm:HistoricalArm,horizon:HorizonBucket,
  baseline:EntryFirstExitStudy,filtered:EntryFirstExitStudy,
  policy:HysteresisMatchedOosPolicy
):HysteresisMatchedOosCell {
  const inCell=(a:{foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket})=>
    a.foldIndex===foldIndex&&a.arm===arm&&a.horizon===horizon;
  const original=baseline.cohort.attempts.filter(inCell);
  const stabilized=filtered.cohort.attempts.filter(inCell);
  const bOutcomes=baseline.outcomes.filter(inCell);
  const fOutcomes=filtered.outcomes.filter(inCell);
  const bIndex=indexUnique(original),fIndex=indexUnique(stabilized);
  const bExit=indexUnique(bOutcomes),fExit=indexUnique(fOutcomes);
  const blockers:string[]=[];
  const flag=(x:string)=>{if(!blockers.includes(x))blockers.push(x);};
  const bEntered=original.filter(x=>x.disposition==='ENTRY_OBSERVED').length;
  const fEntered=stabilized.filter(x=>x.disposition==='ENTRY_OBSERVED').length;
  const bMissing=original.filter(x=>x.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
    x.disposition==='UNUSABLE_UNDERLYING_HISTORY').length;
  const fMissing=stabilized.filter(x=>x.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
    x.disposition==='UNUSABLE_UNDERLYING_HISTORY').length;
  let both=0,bOnly=0,fOnly=0,neither=0,
    jointlyPriced=0,jointlyCensored=0,skippedWinners=0,skippedLosers=0,
    skippedUnpriced=0,matchedDelta=0;
  const originalPriced=bOutcomes.filter(completeOutcome).length;
  const filteredPriced=fOutcomes.filter(completeOutcome).length;
  const bCensored=bEntered-originalPriced;
  const fCensored=fEntered-filteredPriced;
  if(!bIndex||!fIndex||!bExit||!fExit||
     original.length!==stabilized.length||
     original.some(row=>!fIndex?.has(sameKey(row)))||
     stabilized.some(row=>!bIndex?.has(sameKey(row)))||
     bOutcomes.length!==bEntered||fOutcomes.length!==fEntered)
    flag('OOS_DECISION_OR_EXIT_IDENTIFIER_COUNTS_DIVERGE');
  for(const a of original){
    const k=sameKey(a),bEntry=a.disposition==='ENTRY_OBSERVED';
    const fa=fIndex?.get(k),fEntry=fa?.disposition==='ENTRY_OBSERVED';
    const bo=bExit?.get(k),fo=fExit?.get(k);
    if(bEntry&&!bo||fEntry&&!fo||
       (!bEntry&&bo)||(!fEntry&&fo)||
       (bo&&(bo.instrumentKey!==a.instrumentKey||bo.entryAt!==a.entryAt))||
       (fo&&(fo.instrumentKey!==fa?.instrumentKey||fo.entryAt!==fa.entryAt))||
       (bo&&bo.status!=='PRICED_EXIT'&&bo.hypotheticalNetPnlINR!==null)||
       (fo&&fo.status!=='PRICED_EXIT'&&fo.hypotheticalNetPnlINR!==null))
      flag('ENTRY_EVIDENCE_AND_EXIT_OUTCOMES_INCONSISTENT');
    if(bEntry&&fEntry){
      both++;
      if(completeOutcome(bo)&&completeOutcome(fo)){
        jointlyPriced++;
        matchedDelta+=fo!.hypotheticalNetPnlINR!-bo!.hypotheticalNetPnlINR!;
      }else jointlyCensored++;
    }else if(bEntry){
      bOnly++;
      if(completeOutcome(bo)){
        if(bo!.hypotheticalNetPnlINR!>0)skippedWinners++;
        else if(bo!.hypotheticalNetPnlINR!<0)skippedLosers++;
      }else skippedUnpriced++;
    }else if(fEntry)fOnly++;
    else neither++;
  }
  if(both+bOnly+fOnly+neither!==original.length||
     both+bOnly!==bEntered||both+fOnly!==fEntered||
     originalPriced>bEntered||filteredPriced>fEntered||
     bCensored<0||fCensored<0)
    flag('INCONSISTENT_PAIR_AND_ENTRY_DENOMINATORS');
  const total=original.length;
  if(!total)flag('EMPTY_FOLD_ARM_HORIZON_DECISION_UNIVERSE');
  if(jointlyPriced<policy.minimumJointlyPricedPairsPerCell)
    flag('JOINTLY_PRICED_MATCHED_SAMPLE_BELOW_PREDECLARED_MINIMUM');
  if(total>0&&(bMissing/total>policy.maximumMissingEntryFractionPerCell||
     fMissing/total>policy.maximumMissingEntryFractionPerCell))
    flag('MISSING_ENTRY_EVIDENCE_EXCEEDS_PREDECLARED_LIMIT');
  if(bEntered>0&&bCensored/bEntered>
     policy.maximumUnpricedExitFractionPerCell||
     fEntered>0&&fCensored/fEntered>
     policy.maximumUnpricedExitFractionPerCell)
    flag('CENSORED_OPTION_EXIT_EVIDENCE_EXCEEDS_PREDECLARED_LIMIT');
  const bSum=baseline.cells.find(c=>c.foldIndex===foldIndex&&
    c.arm===arm&&c.horizon===horizon);
  const fSum=filtered.cells.find(c=>c.foldIndex===foldIndex&&
    c.arm===arm&&c.horizon===horizon);
  if(!bSum||!fSum||
     bSum.totalDecisions!==total||fSum.totalDecisions!==total||
     bSum.entryObservedCount!==bEntered||
     fSum.entryObservedCount!==fEntered||
     bSum.pricedExitCount!==originalPriced||
     fSum.pricedExitCount!==filteredPriced)
    flag('EXIT_STUDY_SUMMARY_MISMATCH');
  const bFull=bMissing===0&&bCensored===0&&bEntered>0&&
    bOutcomes.every(completeOutcome);
  const fFull=fMissing===0&&fCensored===0&&fEntered>0&&
    fOutcomes.every(completeOutcome);
  const cohortSum=(outcomes:EntryFirstExitOutcome[])=>
    round(outcomes.reduce((n,o)=>n+o.hypotheticalNetPnlINR!,0));
  if(bFull&&bSum?.completeCohortNetPnlINR!==cohortSum(bOutcomes)||
     fFull&&fSum?.completeCohortNetPnlINR!==cohortSum(fOutcomes))
    flag('COMPLETE_COHORT_PNL_RECONCILIATION_MISMATCH');
  if(!bFull||!fFull)
    flag('FULL_COHORT_PNL_NOT_INDEPENDENTLY_PRICED');
  const full=bFull&&fFull&&blockers.length===0;
  return{
    foldIndex,arm,horizon,allOutOfSampleDecisions:total,
    originalObservedEntries:bEntered,stabilizedObservedEntries:fEntered,
    originalMissingEntryQuotes:bMissing,stabilizedMissingEntryQuotes:fMissing,
    bothEntered:both,originalOnlyEntries:bOnly,stabilizedOnlyEntries:fOnly,
    neitherEntered:neither,jointlyPricedPairs:jointlyPriced,
    jointlyCensoredPairs:jointlyCensored,originalPricedExits:originalPriced,
    originalCensoredExits:bCensored,stabilizedPricedExits:filteredPriced,
    stabilizedCensoredExits:fCensored,
    skippedOriginalWinnersObserved:skippedWinners,
    skippedOriginalLosersObserved:skippedLosers,
    skippedOriginalUnpriced:skippedUnpriced,
    originalCompleteCohortNetPnlINR:bFull?cohortSum(bOutcomes):null,
    stabilizedCompleteCohortNetPnlINR:fFull?cohortSum(fOutcomes):null,
    matchedCompleteNetDeltaINR:jointlyPriced>=
      policy.minimumJointlyPricedPairsPerCell&&
      jointlyCensored===0&&blockers.length===0?
        round(matchedDelta):null,
    fullyCohortComparable:full,
    descriptivePairedSampleSufficient:full&&jointlyPriced>=
      policy.minimumJointlyPricedPairsPerCell,
    blockers
  };
}
export function compareAdaptiveHysteresisMatchedOos(
  input:HistoricalComparisonInput,
  sessions:DeclaredTradingSession[]|undefined,
  exitPolicy:AdaptiveExitReplayPolicy,
  hysteresisPolicy:HysteresisResearchPolicy,
  comparisonPolicy:HysteresisMatchedOosPolicy
):HysteresisMatchedOosReport {
  const base:HysteresisMatchedOosReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    profitabilityProven:false,brokerStopsInstalled:false,
    historicalSourceAuthenticated:false,exchangeCalendarAuthenticated:false,
    originalClockIndependentlyAuthenticated:false,
    method:'INDEPENDENT_ENTRY_FIRST_SAME_DECISION_AND_QUOTE_UNIVERSE',
    status:'REJECTED',errors:[],warnings,
    datasetId:input?.provenance?.datasetId??null,
    synthetic:input?.provenance?.synthetic??null,
    originalExitStatus:null,stabilizedExitStatus:null,hysteresisStatus:null,
    totalDecisionCells:0,cells:[]
  };
  if(!validPolicy(comparisonPolicy))
    return {...base,errors:['INVALID_PREDECLARED_MATCHED_OOS_POLICY']};
  const h=replayAdaptiveRegimeHysteresis(input,sessions,hysteresisPolicy);
  if(h.status==='REJECTED')
    return {...base,errors:['INVALID_OR_UNVERIFIABLE_HYSTERESIS_REPLAY',...h.errors],
      hysteresisStatus:h.status};
  const expected=input.policy.folds.reduce((total,fold)=>total+
    input.decisions.filter(d=>d.sessionDate>=fold.testStart&&
      d.sessionDate<=fold.testEnd).length*HORIZONS.length,0);
  const advisories=new Map<string,'CE'|'PE'|'NO_TRADE'>();
  for(const obs of h.observations){
    const k=adaptiveCohortAdvisoryKey(
      obs.foldIndex,obs.horizon,obs.decisionAt);
    if(advisories.has(k))
      return{...base,errors:['DUPLICATE_HYSTERESIS_DECISION_ADVISORY'],
        hysteresisStatus:h.status};
    advisories.set(k,obs.newEntryAdvisory);
  }
  if(advisories.size!==expected)
    return{...base,errors:['MISSING_HYSTERESIS_DECISION_ADVISORIES'],
      hysteresisStatus:h.status};
  const baseline=runAdaptiveEntryFirstExitStudy(input,exitPolicy,sessions);
  const filtered=runAdaptiveEntryFirstExitStudy(
    input,exitPolicy,sessions,advisories
  );
  if(baseline.status==='REJECTED'||filtered.status==='REJECTED')
    return{...base,errors:[
      'ORIGINAL_OR_STABILIZED_ENTRY_FIRST_EXIT_STUDY_REJECTED',
      ...baseline.errors,...filtered.errors
    ],originalExitStatus:baseline.status,
    stabilizedExitStatus:filtered.status,hysteresisStatus:h.status};
  const cells:HysteresisMatchedOosCell[]=[];
  for(let foldIndex=0;foldIndex<input.policy.folds.length;foldIndex++)
    for(const arm of ARMS)for(const horizon of HORIZONS)
      cells.push(aggregateCell(foldIndex,arm,horizon,baseline,
        filtered,comparisonPolicy));
  const complete=h.status==='DESCRIPTIVE_ONLY'&&
    baseline.status==='DESCRIPTIVE_ONLY'&&
    filtered.status==='DESCRIPTIVE_ONLY'&&
    cells.length===input.policy.folds.length*12&&
    cells.every(c=>c.descriptivePairedSampleSufficient);
  return{
    ...base,status:complete?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    errors:[],originalExitStatus:baseline.status,
    stabilizedExitStatus:filtered.status,hysteresisStatus:h.status,
    totalDecisionCells:cells.reduce((sum,c)=>sum+c.allOutOfSampleDecisions,0),
    cells
  };
}
