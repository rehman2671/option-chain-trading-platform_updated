/**
 * Phase 20 — OFFLINE chronological fold tail-risk and exploratory sign audit.
 *
 * A single profitable 1W/2W/4W/8W backtest or 2 profitable OOS trades is not
 * statistical evidence. This measures FULL independent-entry-first cohorts,
 * with original option next-bid exits and no omitted losing/missing trades.
 *
 * NEVER claims independent markets, statistical significance, real fills,
 * NSE/BSE authentication, native stops, or authorizes any MIS/NRML execution.
 */
import type {HistoricalComparisonInput,HistoricalArm} from
  './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';
import type {DeclaredTradingSession} from './adaptiveSessionIntegrity.js';
import type {AdaptiveExitReplayPolicy} from './adaptivePositionalExitReplay.js';
import {runAdaptiveEntryFirstExitStudy,type EntryFirstExitStudy} from
  './adaptiveEntryFirstExitStudy.js';
import {replayAdaptiveRegimeHysteresis,type HysteresisResearchPolicy} from
  './adaptiveRegimeHysteresis.js';
import {adaptiveCohortAdvisoryKey,type CohortDecision} from
  './adaptiveEntryFirstCohort.js';
import type {HysteresisMatchedOosReport} from
  './adaptiveHysteresisMatchedOos.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const FAMILYWISE_VIEWS=36; // 12 * (original + hysteresis + fold-total policy contrasts)
const round=(n:number)=>Number(n.toFixed(4));
const numeric=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
const unsigned=(n:unknown,lo:number,hi:number)=>
  numeric(n)&&Number.isInteger(n)&&n>=lo&&n<=hi;
const key=(f:number,a:HistoricalArm,h:HorizonBucket)=>f+'|'+a+'|'+h;
const attemptKey=(x:{
  foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;decisionAt:string
})=>key(x.foldIndex,x.arm,x.horizon)+'|'+x.decisionAt;
const sum=(xs:number[])=>xs.reduce((n,x)=>n+x,0);
const indexUnique=<T extends {foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;decisionAt:string}>(rows:T[])=>{
  const out=new Map<string,T>();
  for(const r of rows){
    const k=attemptKey(r);
    if(out.has(k))return null;
    out.set(k,r);
  }
  return out;
};

export interface ChronologicalOosRobustnessPolicy {
  schemaVersion:'ADAPTIVE_CHRONOLOGICAL_OOS_ROBUSTNESS_V1';
  minimumSeparatedOosFolds:number;
  minimumPricedExitsPerVariantAcrossFolds:number;
  minimumDistinctOosDecisionsPerFold:number;
  /** Weakness criterion, not a hard failure of known negative performance. */
  maximumAbsoluteSingleFoldContributionFraction:number;
  /** INR per fold; 0 means all losing folds are flagged, not hidden. */
  maximumAllowedSingleFoldLossINR:number;
  /** Tests both policy versions and 12 fold-total policy contrasts. */
  plannedFamilywiseComparisons:36;
}
export interface FoldPnlSensitivity {
  completeFoldCount:number;
  positiveFoldCount:number;
  negativeFoldCount:number;
  flatFoldCount:number;
  completeNetINR:number|null;
  meanFoldNetINR:number|null;
  worstFoldNetINR:number|null;
  bestFoldNetINR:number|null;
  maxChronologicalFoldDrawdownINR:number|null;
  maximumConsecutiveLosingFolds:number|null;
  largestAbsoluteFoldContributionFraction:number|null;
  /** Total net after omitting the most profitable fold: exposed outlier risk. */
  netIfBestFoldOmittedINR:number|null;
  /** Conditional on truly independent, exchangeable fold signs. UNVERIFIED. */
  exploratoryOneSidedPositiveSignP:number|null;
  exploratoryBonferroniAdjustedP36:number|null;
  profitabilityProven:false;
  statisticalSignificanceProven:false;
}
export interface OosFoldRobustnessCell {
  arm:HistoricalArm;
  horizon:HorizonBucket;
  totalOosFolds:number;
  totalOosDecisions:number;
  originalSelectedEntries:number;
  hysteresisSelectedEntries:number;
  jointlyObservedEntries:number;
  originalCensoredExits:number;
  hysteresisCensoredExits:number;
  /** These are policy-total contrasts, NOT paired-trade causal differences. */
  original:FoldPnlSensitivity;
  hysteresis:FoldPnlSensitivity;
  policyTotalContrast:FoldPnlSensitivity;
  calendarFoldHoldOverlapAbsent:boolean;
  fullySourcedFoldSeries:boolean;
  enoughIndependentLikeFoldsToReview:boolean;
  riskFlags:string[];
  blockers:string[];
}
export interface ChronologicalOosRobustnessReport {
  mode:'OFFLINE_EVIDENCE_RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  statisticalSignificanceProven:false;
  statisticalIndependenceEstablished:false;
  realBrokerFillsAuthenticated:false;
  nativeBrokerStopsInstalled:false;
  originalMarketL1Authenticated:false;
  marketCalendarIssuerAuthenticated:false;
  horizonRecommendation:null;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'DESCRIPTIVE_ONLY';
  datasetId:string|null;
  synthetic:boolean|null;
  errors:string[];
  warnings:string[];
  policy:ChronologicalOosRobustnessPolicy|null;
  matchedSourceStatus:HysteresisMatchedOosReport['status']|null;
  originalExitStatus:EntryFirstExitStudy['status']|null;
  hysteresisExitStatus:EntryFirstExitStudy['status']|null;
  totalFamilywiseHypotheses:36;
  cells:OosFoldRobustnessCell[];
}
const WARN=[
  'CHRONOLOGICALLY_SEPARATED_TRADE_WINDOWS_ARE_NOT_PROOF_OF_INDEPENDENT_MARKET_RETURNS',
  'EXACT_SIGN_TAIL_ASSUMES_INDEPENDENT_EXCHANGEABLE_FOLD_SIGNS_AND_NO_HIDDEN_SELECTION',
  'BONFERRONI_36_COUNTS_ONLY_PREDECLARED_12_ARMS_AND_HORIZONS_TIMES_3_VIEWS',
  'ADDITIONAL_UNRECORDED_POLICIES_MARKET_REGIMES_AND_HORIZONS_BREAK_MULTIPLICITY_SCOPE',
  'POLICY_TOTAL_FOLD_DELTA_IS_NOT_PAIRED_CAUSAL_EFFECT_OR_EQUAL_CAPITAL_EXPOSURE',
  'FOLDS_ARE_NOT_DAILY_TRADES_AND_NESTED_OPTIONS_FROM_ONE_SESSION_NOT_INDEPENDENT',
  'FAILING_STRESS_TAIL_RISK_DOES_NOT_BECOME_MISSING_DATA_OR_A_GAIN',
  'MISSING_NEXT_BID_UNPRICED_EXITS_AND_SOURCE_GAPS_NEVER_CONVERT_TO_ZERO',
  'A_SMALL_ADJUSTED_P_IS_AN_EXPLORATORY_NUMBER_NOT_STATISTICAL_CERTIFICATION',
  'OPTION_PREMIUM_IV_THETA_SPREAD_GAP_AND_REAL_FILL_PROVENANCE_STILL_UNVERIFIED',
  'NO_HORIZON_TARGET_OPTIMIZATION_NO_BROKER_NRML_OR_MIS_15_15_MODIFICATION'
];
export function validateChronologicalOosRobustnessPolicy(
  p:ChronologicalOosRobustnessPolicy
):string[]{
  if(!p||p.schemaVersion!=='ADAPTIVE_CHRONOLOGICAL_OOS_ROBUSTNESS_V1'||
     !unsigned(p.minimumSeparatedOosFolds,2,120)||
     !unsigned(p.minimumPricedExitsPerVariantAcrossFolds,1,100000)||
     !unsigned(p.minimumDistinctOosDecisionsPerFold,1,2000)||
     !numeric(p.maximumAbsoluteSingleFoldContributionFraction)||
     p.maximumAbsoluteSingleFoldContributionFraction<=0||
     p.maximumAbsoluteSingleFoldContributionFraction>1||
     !numeric(p.maximumAllowedSingleFoldLossINR)||
     p.maximumAllowedSingleFoldLossINR<0||
     p.maximumAllowedSingleFoldLossINR>1e12||
     p.plannedFamilywiseComparisons!==FAMILYWISE_VIEWS)
    return ['INVALID_PREDECLARED_OOS_FOLD_ROBUSTNESS_AND_MULTIPLICITY_POLICY'];
  return [];
}
const emptySeries=():FoldPnlSensitivity=>({
  completeFoldCount:0,positiveFoldCount:0,negativeFoldCount:0,
  flatFoldCount:0,completeNetINR:null,meanFoldNetINR:null,
  worstFoldNetINR:null,bestFoldNetINR:null,
  maxChronologicalFoldDrawdownINR:null,
  maximumConsecutiveLosingFolds:null,
  largestAbsoluteFoldContributionFraction:null,
  netIfBestFoldOmittedINR:null,
  exploratoryOneSidedPositiveSignP:null,
  exploratoryBonferroniAdjustedP36:null,
  profitabilityProven:false,statisticalSignificanceProven:false
});
/** Exact conditional binomial tail. Ties count in denominator only for completeness. */
const exactUpperSignTail=(positive:number,nonzero:number):number|null=>{
  if(!Number.isInteger(positive)||!Number.isInteger(nonzero)||
     positive<0||nonzero<1||positive>nonzero||nonzero>120)return null;
  let mass=2**(-nonzero),tail=0;
  for(let k=0;k<=nonzero;k++){
    if(k>=positive)tail+=mass;
    if(k<nonzero)mass*=((nonzero-k)/(k+1));
  }
  return Math.max(0,Math.min(1,tail));
};
/**
 * Source-free *math-only* diagnostics to test tail-concentration handling.
 * A supplied array has ZERO provenance, broker status or inference authority.
 * Null in any fold => ALL economic summary numbers null.
 */
export function describeChronologicalFoldPnl(
  foldNet:(number|null)[]
):FoldPnlSensitivity{
  if(!Array.isArray(foldNet)||!foldNet.length||
     foldNet.some(x=>!numeric(x)))return emptySeries();
  const values=foldNet as number[];
  const positive=values.filter(x=>x>0).length;
  const negative=values.filter(x=>x<0).length;
  const flat=values.length-positive-negative;
  const total=sum(values);
  const max=Math.max(...values),min=Math.min(...values);
  let running=0,peak=0,drawdown=0,losing=0,maxLosing=0;
  for(const v of values){
    running+=v;
    peak=Math.max(peak,running);
    drawdown=Math.max(drawdown,peak-running);
    losing=v<0?losing+1:0;
    maxLosing=Math.max(maxLosing,losing);
  }
  const absolute=sum(values.map(x=>Math.abs(x)));
  const p=exactUpperSignTail(positive,positive+negative);
  return{
    ...emptySeries(),completeFoldCount:values.length,
    positiveFoldCount:positive,negativeFoldCount:negative,flatFoldCount:flat,
    completeNetINR:round(total),
    meanFoldNetINR:round(total/values.length),
    worstFoldNetINR:round(min),bestFoldNetINR:round(max),
    maxChronologicalFoldDrawdownINR:round(drawdown),
    maximumConsecutiveLosingFolds:maxLosing,
    largestAbsoluteFoldContributionFraction:absolute>0?
      round(Math.max(...values.map(x=>Math.abs(x)))/absolute):null,
    netIfBestFoldOmittedINR:values.length>=2?round(total-max):null,
    exploratoryOneSidedPositiveSignP:p===null?null:round(p),
    exploratoryBonferroniAdjustedP36:p===null?null:
      round(Math.min(1,p*FAMILYWISE_VIEWS))
  };
}
export function auditAdaptiveChronologicalOosRobustness(
  input:HistoricalComparisonInput,
  sessions:DeclaredTradingSession[]|undefined,
  exitPolicy:AdaptiveExitReplayPolicy,
  hysteresisPolicy:HysteresisResearchPolicy,
  matched:HysteresisMatchedOosReport,
  policy:ChronologicalOosRobustnessPolicy
):ChronologicalOosRobustnessReport{
  const result:ChronologicalOosRobustnessReport={
    mode:'OFFLINE_EVIDENCE_RESEARCH_ONLY',
    executionAuthorized:false,productionSafe:false,profitabilityProven:false,
    statisticalSignificanceProven:false,statisticalIndependenceEstablished:false,
    realBrokerFillsAuthenticated:false,nativeBrokerStopsInstalled:false,
    originalMarketL1Authenticated:false,marketCalendarIssuerAuthenticated:false,
    horizonRecommendation:null,status:'REJECTED',
    datasetId:input?.provenance?.datasetId??null,
    synthetic:input?.provenance?.synthetic??null,
    errors:[],warnings:WARN,policy:null,
    matchedSourceStatus:matched?.status??null,
    originalExitStatus:null,hysteresisExitStatus:null,
    totalFamilywiseHypotheses:FAMILYWISE_VIEWS,cells:[]
  };
  const errors=validateChronologicalOosRobustnessPolicy(policy);
  if(errors.length)return {...result,errors};
  if(!input?.policy?.folds?.length||!Array.isArray(input.decisions)||
     !matched||matched.status==='REJECTED'||
     matched.datasetId!==input.provenance?.datasetId||
     matched.synthetic!==input.provenance?.synthetic||
     matched.cells.length!==input.policy.folds.length*12)
    return {...result,errors:['COMPLETE_ORIGINAL_MATCHED_DECISION_UNIVERSE_REQUIRED']};
  const regime=replayAdaptiveRegimeHysteresis(input,sessions,hysteresisPolicy);
  if(regime.status==='REJECTED')
    return {...result,errors:['INVALID_POINT_IN_TIME_HYSTERESIS_FOLD_STATE']};
  const advisories=new Map<string,'CE'|'PE'|'NO_TRADE'>();
  for(const observation of regime.observations){
    const k=adaptiveCohortAdvisoryKey(
      observation.foldIndex,observation.horizon,observation.decisionAt);
    if(advisories.has(k))
      return {...result,errors:['DUPLICATE_HYSTERESIS_OOS_OBSERVATION']};
    advisories.set(k,observation.newEntryAdvisory);
  }
  const original=runAdaptiveEntryFirstExitStudy(input,exitPolicy,sessions);
  const filtered=runAdaptiveEntryFirstExitStudy(input,exitPolicy,sessions,advisories);
  if(original.status==='REJECTED'||filtered.status==='REJECTED')
    return {...result,errors:['INVALID_ORIGINAL_ENTRY_FIRST_OOS_EXIT_REPLAY']};
  const oIndex=indexUnique(original.cohort.attempts);
  const fIndex=indexUnique(filtered.cohort.attempts);
  const oExits=indexUnique(original.outcomes);
  const fExits=indexUnique(filtered.outcomes);
  if(!oIndex||!fIndex||!oExits||!fExits||
     oIndex.size!==fIndex.size||
     oExits.size!==original.cohort.attempts.filter(x=>
       x.disposition==='ENTRY_OBSERVED').length||
     fExits.size!==filtered.cohort.attempts.filter(x=>
       x.disposition==='ENTRY_OBSERVED').length)
    return {...result,errors:['INVALID_DUPLICATED_OR_MISSING_SOURCE_ENTRY_EXIT_IDENTIFIERS']};
  const attempts={
    ORIGINAL:original.cohort.attempts,
    HYSTERESIS:filtered.cohort.attempts
  };
  const states={
    ORIGINAL:original,
    HYSTERESIS:filtered
  };
  const cells:OosFoldRobustnessCell[]=[];
  for(const arm of ARMS)for(const horizon of HORIZONS){
    const flags:string[]=[],blocks:string[]=[];
    const flag=(s:string)=>{if(!flags.includes(s))flags.push(s);};
    const block=(s:string)=>{if(!blocks.includes(s))blocks.push(s);};
    const series:{ORIGINAL:(number|null)[];HYSTERESIS:(number|null)[];CONTRAST:(number|null)[]}={
      ORIGINAL:[],HYSTERESIS:[],CONTRAST:[]
    };
    let totalDecisions=0,baselineEntries=0,hysteresisEntries=0,
      jointly=0,bCensored=0,fCensored=0;
    let separated=true;
    const priorEnd:{ORIGINAL:number;HYSTERESIS:number}={
      ORIGINAL:-Infinity,HYSTERESIS:-Infinity
    };
    for(let foldIndex=0;foldIndex<input.policy.folds.length;foldIndex++){
      const fold=input.policy.folds[foldIndex];
      const originalFold=attempts.ORIGINAL.filter(x=>
        x.foldIndex===foldIndex&&x.arm===arm&&x.horizon===horizon);
      const hysteresisFold=attempts.HYSTERESIS.filter(x=>
        x.foldIndex===foldIndex&&x.arm===arm&&x.horizon===horizon);
      const previous=matched.cells.filter(c=>c.foldIndex===foldIndex&&
        c.arm===arm&&c.horizon===horizon);
      const decisionAt=originalFold.map(x=>Date.parse(x.decisionAt));
      const distinct=new Set(originalFold.map(x=>x.decisionAt));
      const firstDecision=Math.min(...decisionAt);
      totalDecisions+=originalFold.length;
      if(previous.length!==1||originalFold.length!==hysteresisFold.length||
         distinct.size!==originalFold.length||
         originalFold.some(x=>!fIndex.has(attemptKey(x)))||
         !originalFold.length||originalFold.length<
           policy.minimumDistinctOosDecisionsPerFold||
         !Number.isFinite(firstDecision)||
         originalFold.some(x=>x.decisionAt.slice(0,10)<fold.testStart||
           x.decisionAt.slice(0,10)>fold.testEnd))
        block('MISSING_OR_MISMATCHED_ORIGINAL_OOS_FOLD_UNIVERSE');
      const prev=previous[0];
      const foldNet:{ORIGINAL:number|null;HYSTERESIS:number|null}={
        ORIGINAL:null,HYSTERESIS:null
      };
      for(const variant of ['ORIGINAL','HYSTERESIS'] as const){
        const source=states[variant],items=(variant==='ORIGINAL'?
          originalFold:hysteresisFold);
        if(firstDecision<=priorEnd[variant]){
          separated=false;
          block('PREVIOUS_OOS_FOLD_HOLD_COOLDOWN_OVERLAPS_NEXT_TEST_DECISION');
        }
        const enrolled=items.filter(x=>x.disposition==='ENTRY_OBSERVED');
        if(variant==='ORIGINAL')baselineEntries+=enrolled.length;
        else hysteresisEntries+=enrolled.length;
        const eligibleEnds=enrolled.map(x=>
          Date.parse(x.lastEligibleFixedHoldExitAt??''));
        if(eligibleEnds.some(t=>!Number.isFinite(t))){
          separated=false;
          block('ORIGINAL_HOLD_EXPIRY_BOUNDARY_UNVERIFIABLE');
        }
        priorEnd[variant]=Math.max(priorEnd[variant],...eligibleEnds);
        const studyCell=source.cells.filter(x=>
          x.foldIndex===foldIndex&&x.arm===arm&&x.horizon===horizon);
        const outcomes=source.outcomes.filter(x=>
          x.foldIndex===foldIndex&&x.arm===arm&&x.horizon===horizon);
        const priced=outcomes.filter(x=>x.status==='PRICED_EXIT'&&
          numeric(x.hypotheticalNetPnlINR)&&x.nextQuoteAt!==null);
        const missing=items.filter(x=>
          x.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
          x.disposition==='UNUSABLE_UNDERLYING_HISTORY').length;
        const censored=enrolled.length-priced.length;
        if(variant==='ORIGINAL')bCensored+=censored;
        else fCensored+=censored;
        if(studyCell.length!==1||enrolled.length!==outcomes.length||
           !prev||prev.allOutOfSampleDecisions!==originalFold.length||
           (variant==='ORIGINAL'?
             prev.originalObservedEntries!==enrolled.length||
             prev.originalPricedExits!==priced.length||
             prev.originalCensoredExits!==censored:
             prev.stabilizedObservedEntries!==enrolled.length||
             prev.stabilizedPricedExits!==priced.length||
             prev.stabilizedCensoredExits!==censored))
          block('PHASE13_MATCHED_COHORT_ENTRY_EXIT_COUNTS_CHANGED');
        const net=priced.reduce((n,x)=>n+x.hypotheticalNetPnlINR!,0);
        const reportNet=studyCell[0]?.completeCohortNetPnlINR??null;
        const matchedNet=variant==='ORIGINAL'?
          prev?.originalCompleteCohortNetPnlINR:
          prev?.stabilizedCompleteCohortNetPnlINR;
        if(enrolled.length>0&&missing===0&&censored===0&&
           studyCell.length===1&&reportNet!==null&&
           Math.abs(net-reportNet)<=0.011&&
           Math.abs(net-(matchedNet??NaN))<=0.011)
          foldNet[variant]=round(net);
        else block('CENSORED_MISSING_OR_NONRECONCILED_ORIGINAL_OPTION_NET_PNL');
        if(missing>0)
          block('OOS_MISSING_ENTRY_QUOTES_CANNOT_BE_SURVIVOR_FILTERED');
      }
      const enteredO=new Set(originalFold.filter(x=>
        x.disposition==='ENTRY_OBSERVED').map(attemptKey));
      const enteredH=new Set(hysteresisFold.filter(x=>
        x.disposition==='ENTRY_OBSERVED').map(attemptKey));
      const common=[...enteredO].filter(k=>enteredH.has(k)).length;
      jointly+=common;
      if(!prev||prev.bothEntered!==common||
         prev.originalOnlyEntries!==enteredO.size-common||
         prev.stabilizedOnlyEntries!==enteredH.size-common)
        block('PHASE13_MATCHED_PAIR_PARTITION_CHANGED');
      series.ORIGINAL.push(foldNet.ORIGINAL);
      series.HYSTERESIS.push(foldNet.HYSTERESIS);
      series.CONTRAST.push(foldNet.ORIGINAL===null||
        foldNet.HYSTERESIS===null?null:
        round(foldNet.HYSTERESIS-foldNet.ORIGINAL));
    }
    const o=describeChronologicalFoldPnl(series.ORIGINAL);
    const h=describeChronologicalFoldPnl(series.HYSTERESIS);
    const delta=describeChronologicalFoldPnl(series.CONTRAST);
    const full=o.completeFoldCount===input.policy.folds.length&&
      h.completeFoldCount===input.policy.folds.length&&
      delta.completeFoldCount===input.policy.folds.length;
    if(!full)block('ONE_OR_MORE_OOS_FOLD_NET_PNL_CENSORED');
    if(input.policy.folds.length<policy.minimumSeparatedOosFolds)
      block('INDEPENDENT_LIKE_TEST_FOLD_COUNT_BELOW_LOCKED_MINIMUM');
    if(baselineEntries<policy.minimumPricedExitsPerVariantAcrossFolds||
       hysteresisEntries<policy.minimumPricedExitsPerVariantAcrossFolds)
      block('OOS_PRICED_ENTRY_SAMPLE_BELOW_LOCKED_MINIMUM');
    if(matched.status!=='DESCRIPTIVE_ONLY')
      block('PHASE13_PAIRED_OOS_SOURCE_EVIDENCE_INCOMPLETE');
    if(full){
      for(const [label,v] of [
        ['ORIGINAL',o],['HYSTERESIS',h],['FOLD_CONTRAST',delta]
      ] as const){
        if(v.largestAbsoluteFoldContributionFraction!==null&&
           v.largestAbsoluteFoldContributionFraction>
             policy.maximumAbsoluteSingleFoldContributionFraction)
          flag(label+'_PROFIT_LOSS_CONCENTRATED_IN_ONE_FOLD');
        if(v.worstFoldNetINR!==null&&
           v.worstFoldNetINR < -policy.maximumAllowedSingleFoldLossINR)
          flag(label+'_SINGLE_FOLD_LOSS_EXCEEDS_DECLARED_RISK_CAP');
        if(v.netIfBestFoldOmittedINR!==null&&
           v.completeNetINR!==null&&v.completeNetINR>0&&
           v.netIfBestFoldOmittedINR<=0)
          flag(label+'_APPARENT_POSITIVE_RESULT_DISAPPEARS_WITH_BEST_FOLD');
      }
    }
    cells.push({
      arm,horizon,totalOosFolds:input.policy.folds.length,
      totalOosDecisions:totalDecisions,
      originalSelectedEntries:baselineEntries,
      hysteresisSelectedEntries:hysteresisEntries,
      jointlyObservedEntries:jointly,
      originalCensoredExits:bCensored,
      hysteresisCensoredExits:fCensored,
      original:o,hysteresis:h,policyTotalContrast:delta,
      calendarFoldHoldOverlapAbsent:separated,
      fullySourcedFoldSeries:full&&blocks.length===0,
      enoughIndependentLikeFoldsToReview:blocks.length===0,
      riskFlags:flags,blockers:blocks
    });
  }
  const complete=regime.status==='DESCRIPTIVE_ONLY'&&
    matched.status==='DESCRIPTIVE_ONLY'&&
    original.status==='DESCRIPTIVE_ONLY'&&filtered.status==='DESCRIPTIVE_ONLY'&&
    cells.length===12&&cells.every(c=>c.enoughIndependentLikeFoldsToReview);
  return{
    ...result,policy,errors:[],
    status:complete?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    originalExitStatus:original.status,hysteresisExitStatus:filtered.status,
    cells
  };
}
