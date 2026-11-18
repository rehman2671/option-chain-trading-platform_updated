/**
 * Phase 19 — original observed option BID path / partial-runup reversal audit.
 *
 * A +50/+70/+100 move in INDEX points says nothing about the option. This
 * research uses original per-instrument OPTION BID premiums relative to the
 * original paid ASK, until the PRE-EXISTING Phase 8 observed exit trigger.
 *
 * Entry-first baseline / hysteresis cohorts and their exposure cooldowns are
 * fixed BEFORE any future quote-path is examined. No later/favorable L1,
 * interpolated intrabar extreme, fill-at-stop, threshold optimization, broker
 * order, native stop, MIS/NRML or live entry/exit integration.
 */
import type {
  HistoricalComparisonInput,HistoricalExecutableQuote,HistoricalArm
} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';
import type {DeclaredTradingSession} from './adaptiveSessionIntegrity.js';
import type {AdaptiveExitReplayPolicy} from './adaptivePositionalExitReplay.js';
import {
  runAdaptiveEntryFirstExitStudy,type EntryFirstExitStudy,type EntryFirstExitOutcome
} from './adaptiveEntryFirstExitStudy.js';
import {
  adaptiveCohortAdvisoryKey,type CohortDecision
} from './adaptiveEntryFirstCohort.js';
import {
  replayAdaptiveRegimeHysteresis,type HysteresisResearchPolicy
} from './adaptiveRegimeHysteresis.js';
import type {
  HysteresisMatchedOosReport,HysteresisMatchedOosCell
} from './adaptiveHysteresisMatchedOos.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const ms=(s:string)=>Date.parse(s);
const round=(n:number)=>Number(n.toFixed(2));
const validNum=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const int=(v:unknown,min:number,max:number)=>
  validNum(v,min,max)&&Number.isInteger(v);
const decisionKey=(x:{
  foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;decisionAt:string
})=>[x.foldIndex,x.arm,x.horizon,x.decisionAt].join('|');

export interface ObservedPremiumRunupHorizonRule {
  /** OPTION-BID point gains vs original ASK, NOT index points. */
  firstRunupPoints:number;
  secondRunupPoints:number;
  candidateTargetPoints:number;
  /** An actual later bid <= prior observed qualified peak - giveback. */
  reversalGivebackPoints:number;
  /** Displayed top-of-book quantity threshold, NOT guaranteed fill. */
  minimumDisplayedBidDepthLots:number;
  /** Predeclared minimum fully priceable paths PER fold × arm × horizon × variant. */
  minimumFullyObservedPathsPerVariantCell:number;
}
export interface ObservedPremiumRunupPolicy
  extends ObservedPremiumRunupHorizonRule {
  schemaVersion:'ADAPTIVE_OBSERVED_PREMIUM_RUNUP_REVERSAL_V1';
  /** Optional 4-horizon predeclared overrides; no partial mixed set allowed. */
  horizonRules?:Record<HorizonBucket,ObservedPremiumRunupHorizonRule>;
}
export interface PremiumVariantPathSummary {
  enrolledEntries:number;
  pricedAndFullyObservedPaths:number;
  censoredOrSourceMismatchedPaths:number;
  originalMissingEntryQuotes:number;
  observedRawBidTargetCrossings:number;
  qualifiedBidFirstRunupCrossings:number;
  qualifiedBidSecondRunupCrossings:number;
  qualifiedBidTargetCrossings:number;
  /**
   * Later observed depth-qualified BID fell by >= predeclared points after
   * crossing first / second runup and before ever reaching target.
   * A final priced exit is mandatory; never infer unseen reversals.
   */
  firstRunupReversalBeforeTarget:number;
  secondRunupReversalBeforeTarget:number;
  firstRunupReversalBelowEntryAsk:number;
  laterObservedOvernightGapTriggers:number;
  laterObservedTrailingGivebackTriggers:number;
  /**
   * Null if ANY entry has missing/invalid source/exit evidence or if there
   * is no observed entry; no censor-to-zero or survivor mean.
   */
  completeCohortMeanMaxQualifiedBidGainPoints:number|null;
  completeCohortMeanMaxRawBidGainPoints:number|null;
}
export interface PremiumPathReversalCell {
  foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;
  allOutOfSampleDecisions:number;
  original:PremiumVariantPathSummary;
  hysteresis:PremiumVariantPathSummary;
  bothEntered:number;
  originalOnlyEntered:number;
  hysteresisOnlyEntered:number;
  neitherEntered:number;
  /** Original baseline-only unchosen when hysteresis skips it for any reason. */
  originalOnlyFirstRunupReversals:number;
  originalOnlyReachedCandidateTarget:number;
  /** No hindsight winner exclusion in any cohort's denominator. */
  cohortSelectionsHeldConstant:true;
  fullyObservedForDescriptiveReview:boolean;
  blockers:string[];
}
export interface ObservedPremiumPathReversalReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  brokerFillsAuthenticated:false;
  nativeStopsInstalled:false;
  historicalOptionL1IndependentlyAuthenticated:false;
  exchangeCalendarIndependentlyAuthenticated:false;
  thresholdOptimizationAuthorized:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'DESCRIPTIVE_ONLY';
  errors:string[];
  warnings:string[];
  datasetId:string|null;
  synthetic:boolean|null;
  policy:ObservedPremiumRunupPolicy|null;
  matchedOosStatus:HysteresisMatchedOosReport['status']|null;
  hysteresisStatus:string|null;
  originalExitStatus:EntryFirstExitStudy['status']|null;
  hysteresisExitStatus:EntryFirstExitStudy['status']|null;
  cells:PremiumPathReversalCell[];
}
const warnings=[
  'OPTION_BID_PREMIUM_POINTS_NOT_UNDERLYING_INDEX_POINTS',
  'BID_HIGH_IS_NOT_EXECUTED_TRADE_OR_GUARANTEED_EXIT',
  'DISPLAYED_L1_BID_QUANTITY_IS_NOT_QUEUE_FILL_OR_DEPTH_AT_SEND_TIME',
  'NO_INTRABAR_RECONSTRUCTED_UPSIDE_OR_HIDDEN_OPTION_GAP_PRICE',
  'MISSING_BID_PATH_AND_CENSORED_EXIT_REMAIN_UNKNOWN_NOT_ZERO',
  'QUOTE_PATH_ENDS_AT_PREEXISTING_OBSERVED_PHASE8_TRIGGER',
  'NO_FUTURE_BID_USED_TO_SELECT_ENTRY_COHORT_OR_CHANGE_COOLDOWN',
  'OBSERVED_REVERSAL_IS_DESCRIPTIVE_NOT_A_PROVEN_OPTIMAL_TRAILING_STOP',
  'THRESHOLD_VALUES_REQUIRE_TRUE_OUT_OF_SAMPLE_PREREGISTRATION',
  'REAL_IV_THETA_GAMMA_LIQUIDITY_AND_BROKER_STOP_FILLED_PRICE_NOT_PROVEN',
  'NO_NRML_15_15_AUTO_SQUARE_OFF_NO_LIVE_ORDER'
];
function validRule(p:ObservedPremiumRunupHorizonRule|undefined):boolean{
  return !!p&&validNum(p.firstRunupPoints,.05,100000)&&
    validNum(p.secondRunupPoints,.05,100000)&&
    validNum(p.candidateTargetPoints,.05,100000)&&
    p.firstRunupPoints<p.secondRunupPoints&&
    p.secondRunupPoints<p.candidateTargetPoints&&
    validNum(p.reversalGivebackPoints,.05,100000)&&
    int(p.minimumDisplayedBidDepthLots,1,10)&&
    int(p.minimumFullyObservedPathsPerVariantCell,1,100000);
}
export function validateObservedPremiumRunupPolicy(
  p:ObservedPremiumRunupPolicy
):string[]{
  if(!p||p.schemaVersion!=='ADAPTIVE_OBSERVED_PREMIUM_RUNUP_REVERSAL_V1'||
     !validRule(p)||
     (p.horizonRules!==undefined&&(
       !p.horizonRules||
       HORIZONS.some(h=>!validRule(p.horizonRules?.[h]))||
       Object.keys(p.horizonRules).length!==HORIZONS.length)))
    return ['INVALID_PREDECLARED_OPTION_PREMIUM_PATH_THRESHOLDS'];
  return [];
}
type Variant='ORIGINAL'|'HYSTERESIS';
type AttemptIndex={
  attempts:Map<string,CohortDecision>;
  exits:Map<string,EntryFirstExitOutcome>;
};
function index(study:EntryFirstExitStudy):AttemptIndex|null{
  const attempts=new Map<string,CohortDecision>();
  const exits=new Map<string,EntryFirstExitOutcome>();
  for(const a of study.cohort.attempts){
    const k=decisionKey(a);
    if(attempts.has(k))return null;
    attempts.set(k,a);
  }
  for(const o of study.outcomes){
    const k=decisionKey(o);
    if(exits.has(k)||attempts.get(k)?.disposition!=='ENTRY_OBSERVED')
      return null;
    exits.set(k,o);
  }
  if([...attempts.values()].filter(a=>a.disposition==='ENTRY_OBSERVED').length!==
    exits.size)return null;
  return {attempts,exits};
}
type ObservedPath=ReturnType<typeof auditOriginalPremiumRunupPath>;
export function auditOriginalPremiumRunupPath(
  a:CohortDecision,
  o:EntryFirstExitOutcome|undefined,
  quoteMap:Map<string,HistoricalExecutableQuote[]>,
  p:ObservedPremiumRunupHorizonRule
){
  const unknown={valid:false,reason:'UNOBSERVED_OR_CENSORED_EXIT',
    rawGain:null as number|null,qualifiedGain:null as number|null,
    rawTarget:false,first:false,second:false,target:false,
    firstReversed:false,secondReversed:false,
    firstReversedBelowEntry:false};
  if(!o||o.status!=='PRICED_EXIT'||o.hypotheticalNetPnlINR===null||
     !o.triggerObservedAt||!o.nextQuoteAt||!a.entryAt||
     a.entryAsk===null||a.quantity===null||!a.instrumentKey||
     o.instrumentKey!==a.instrumentKey||o.entryAt!==a.entryAt||
     o.quantity!==a.quantity||o.entryAsk!==a.entryAsk||
     !(ms(a.entryAt)<ms(o.triggerObservedAt)&&
       ms(o.triggerObservedAt)<ms(o.nextQuoteAt)))
    return unknown;
  const series=quoteMap.get(a.instrumentKey)??[];
  const prefix=series.filter(q=>
    ms(q.observedAt)>=ms(a.entryAt!)&&
    ms(q.observedAt)<=ms(o.triggerObservedAt!));
  if(prefix.length<2||prefix[0].observedAt!==a.entryAt||
     prefix[prefix.length-1].observedAt!==o.triggerObservedAt||
     prefix[0].ask!==a.entryAsk||
     prefix[0].askQty<a.quantity||
     prefix[0].bidQty<a.quantity||
     !series.some(q=>q.observedAt===o.nextQuoteAt&&
       q.bid===o.hypotheticalExitBid&&q.bidQty>=a.quantity!))
    return {...unknown,reason:'PHASE8_ORIGINAL_QUOTE_PATH_SOURCE_MISMATCH'};
  let rawPeak=-Infinity,qualifiedPeak=-Infinity;
  let first=false,second=false,target=false,rawTarget=false;
  let firstReversed=false,secondReversed=false,
    firstReversedBelowEntry=false;
  let previous=-Infinity;
  const needed=a.quantity*p.minimumDisplayedBidDepthLots;
  for(const q of prefix){
    const t=ms(q.observedAt);
    if(!Number.isFinite(t)||t<=previous)
      return {...unknown,reason:'NONCHRONOLOGICAL_ORIGINAL_OPTION_L1'};
    previous=t;
    if(!validNum(q.bid,.00001,1e10)||!validNum(q.bidQty,0,1e12))
      return {...unknown,reason:'INVALID_ORIGINAL_BID_PRICE_OR_DEPTH'};
    rawPeak=Math.max(rawPeak,q.bid);
    const rise=q.bid-a.entryAsk;
    if(rise>=p.candidateTargetPoints)rawTarget=true;
    if(q.bidQty<needed)continue;
    qualifiedPeak=Math.max(qualifiedPeak,q.bid);
    if(rise>=p.firstRunupPoints)first=true;
    if(rise>=p.secondRunupPoints)second=true;
    if(rise>=p.candidateTargetPoints)target=true;
    // Crossings are evaluated BEFORE this quote's *later* reversal
    // evidence. A single quote can never create both a runup and giveback.
    if(first&&qualifiedPeak-q.bid>=p.reversalGivebackPoints){
      firstReversed=true;
      if(q.bid<=a.entryAsk)firstReversedBelowEntry=true;
      if(second)secondReversed=true;
    }
  }
  if(!Number.isFinite(qualifiedPeak))
    return {...unknown,reason:'NO_DEPTH_QUALIFIED_ORIGINAL_BID'};
  // Conservative: if target appears anywhere before the old exit trigger,
  // do not label a later move a "failed target".
  return {valid:true,reason:'FULLY_OBSERVED_PRETRIGGER_PATH',
    rawGain:round(rawPeak-a.entryAsk),
    qualifiedGain:round(qualifiedPeak-a.entryAsk),
    rawTarget,first,second,target,
    firstReversed:firstReversed&&!target,
    secondReversed:secondReversed&&!target,
    firstReversedBelowEntry:firstReversedBelowEntry&&!target};
}
type Counters={
  enrolled:number;priced:number;censored:number;missing:number;
  rawTargets:number;first:number;second:number;target:number;
  reversalsFirst:number;reversalsSecond:number;
  reversalsBelowAsk:number;overnight:number;giveback:number;
  rawGains:number;qualifiedGains:number;
};
const empty=():Counters=>({
  enrolled:0,priced:0,censored:0,missing:0,
  rawTargets:0,first:0,second:0,target:0,
  reversalsFirst:0,reversalsSecond:0,reversalsBelowAsk:0,
  overnight:0,giveback:0,rawGains:0,qualifiedGains:0
});
const summary=(c:Counters):PremiumVariantPathSummary=>({
  enrolledEntries:c.enrolled,pricedAndFullyObservedPaths:c.priced,
  censoredOrSourceMismatchedPaths:c.censored,
  originalMissingEntryQuotes:c.missing,
  observedRawBidTargetCrossings:c.rawTargets,
  qualifiedBidFirstRunupCrossings:c.first,
  qualifiedBidSecondRunupCrossings:c.second,
  qualifiedBidTargetCrossings:c.target,
  firstRunupReversalBeforeTarget:c.reversalsFirst,
  secondRunupReversalBeforeTarget:c.reversalsSecond,
  firstRunupReversalBelowEntryAsk:c.reversalsBelowAsk,
  laterObservedOvernightGapTriggers:c.overnight,
  laterObservedTrailingGivebackTriggers:c.giveback,
  completeCohortMeanMaxQualifiedBidGainPoints:
    c.enrolled>0&&c.priced===c.enrolled&&c.missing===0?
      round(c.qualifiedGains/c.enrolled):null,
  completeCohortMeanMaxRawBidGainPoints:
    c.enrolled>0&&c.priced===c.enrolled&&c.missing===0?
      round(c.rawGains/c.enrolled):null
});
const belongs=(x:{foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket},
  fold:number,arm:HistoricalArm,horizon:HorizonBucket)=>
  x.foldIndex===fold&&x.arm===arm&&x.horizon===horizon;
const missingEntry=(d:CohortDecision)=>
  d.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
  d.disposition==='UNUSABLE_UNDERLYING_HISTORY';

export function auditAdaptiveObservedPremiumRunupReversals(
  input:HistoricalComparisonInput,
  sessions:DeclaredTradingSession[]|undefined,
  exitPolicy:AdaptiveExitReplayPolicy,
  hysteresisPolicy:HysteresisResearchPolicy,
  matched:HysteresisMatchedOosReport,
  pathPolicy:ObservedPremiumRunupPolicy
):ObservedPremiumPathReversalReport {
  const report:ObservedPremiumPathReversalReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    profitabilityProven:false,brokerFillsAuthenticated:false,
    nativeStopsInstalled:false,historicalOptionL1IndependentlyAuthenticated:false,
    exchangeCalendarIndependentlyAuthenticated:false,
    thresholdOptimizationAuthorized:false,status:'REJECTED',errors:[],
    warnings,datasetId:input?.provenance?.datasetId??null,
    synthetic:input?.provenance?.synthetic??null,
    policy:null,matchedOosStatus:matched?.status??null,
    hysteresisStatus:null,originalExitStatus:null,hysteresisExitStatus:null,
    cells:[]
  };
  const errors=validateObservedPremiumRunupPolicy(pathPolicy);
  if(errors.length)return {...report,errors};
  if(!matched||matched.status==='REJECTED'||
     matched.datasetId!==input?.provenance?.datasetId||
     matched.synthetic!==input?.provenance?.synthetic||
     matched.cells.length!==input.policy.folds.length*12)
    return {...report,errors:['VALID_MATCHED_OOS_DECISION_UNIVERSE_REQUIRED']};
  const h=replayAdaptiveRegimeHysteresis(input,sessions,hysteresisPolicy);
  if(h.status==='REJECTED')
    return {...report,errors:['ORIGINAL_POINT_IN_TIME_HYSTERESIS_INVALID']};
  const adv=new Map<string,'CE'|'PE'|'NO_TRADE'>();
  for(const row of h.observations){
    const k=adaptiveCohortAdvisoryKey(
      row.foldIndex,row.horizon,row.decisionAt);
    if(adv.has(k))
      return {...report,errors:['DUPLICATE_POINT_IN_TIME_REGIME_ADVISORY']};
    adv.set(k,row.newEntryAdvisory);
  }
  const original=runAdaptiveEntryFirstExitStudy(input,exitPolicy,sessions);
  const hysteresis=runAdaptiveEntryFirstExitStudy(input,exitPolicy,sessions,adv);
  if(original.status==='REJECTED'||hysteresis.status==='REJECTED')
    return {...report,errors:['INVALID_INDEPENDENT_PHASE8_ENTRY_FIRST_EXIT_REPLAY']};
  const oi=index(original),hi=index(hysteresis);
  if(!oi||!hi||oi.attempts.size!==hi.attempts.size)
    return {...report,errors:['MISSING_OR_DUPLICATE_INDEPENDENT_OOS_DECISIONS']};
  const quotes=new Map<string,HistoricalExecutableQuote[]>();
  const seen=new Set<string>();
  for(const q of input.executionQuotes){
    const k=q.instrumentKey+'\n'+q.observedAt;
    if(seen.has(k))
      return {...report,errors:['DUPLICATED_ORIGINAL_INSTRUMENT_L1_QUOTE']};
    seen.add(k);
    const series=quotes.get(q.instrumentKey)??[];
    series.push(q);quotes.set(q.instrumentKey,series);
  }
  for(const series of quotes.values())
    series.sort((a,b)=>ms(a.observedAt)-ms(b.observedAt));
  const cells:PremiumPathReversalCell[]=[];
  for(let fold=0;fold<input.policy.folds.length;fold++)
    for(const arm of ARMS)for(const horizon of HORIZONS){
      const rule=pathPolicy.horizonRules?.[horizon]??pathPolicy;
      const a=[...oi.attempts.values()].filter(x=>
        belongs(x,fold,arm,horizon));
      const b=[...hi.attempts.values()].filter(x=>
        belongs(x,fold,arm,horizon));
      const prev=matched.cells.filter(x=>belongs(x,fold,arm,horizon));
      const blockers:string[]=[];
      const flag=(v:string)=>{if(!blockers.includes(v))blockers.push(v);};
      if(prev.length!==1||a.length!==b.length)
        flag('PHASE13_ENTRY_DECISION_UNIVERSE_CHANGED');
      const stats:Record<Variant,Counters>={
        ORIGINAL:empty(),HYSTERESIS:empty()
      };
      const ids=new Set(a.map(x=>decisionKey(x)));
      const filtered=new Map(b.map(x=>[decisionKey(x),x]));
      if(ids.size!==a.length||filtered.size!==b.length)
        flag('DUPLICATED_ORIGINAL_DECISION_ROWS');
      let both=0,ao=0,bo=0,neither=0,onlyReverse=0,onlyTarget=0;
      for(const x of a){
        const y=filtered.get(decisionKey(x));
        if(!y){flag('MISSING_HYSTERESIS_DECISION');continue;}
        const inA=x.disposition==='ENTRY_OBSERVED';
        const inB=y.disposition==='ENTRY_OBSERVED';
        if(inA&&inB)both++;
        else if(inA)ao++;
        else if(inB)bo++;
        else neither++;
        const one=(label:Variant,record:CohortDecision,
          onlyOriginal:boolean)=>{
          const c=stats[label];
          if(missingEntry(record))c.missing++;
          if(record.disposition!=='ENTRY_OBSERVED')return;
          c.enrolled++;
          const outcome=(label==='ORIGINAL'?oi:hi).exits.get(
            decisionKey(record));
          const path=auditOriginalPremiumRunupPath(record,outcome,quotes,rule);
          if(!path.valid){c.censored++;return;}
          c.priced++;c.rawGains+=path.rawGain!;
          c.qualifiedGains+=path.qualifiedGain!;
          if(path.rawTarget)c.rawTargets++;
          if(path.first)c.first++;
          if(path.second)c.second++;
          if(path.target)c.target++;
          if(path.firstReversed)c.reversalsFirst++;
          if(path.secondReversed)c.reversalsSecond++;
          if(path.firstReversedBelowEntry)c.reversalsBelowAsk++;
          if(outcome?.overnightGapAtTrigger)c.overnight++;
          if(outcome?.reason==='TRAILING_GIVEBACK')c.giveback++;
          if(onlyOriginal){
            if(path.firstReversed)onlyReverse++;
            if(path.target)onlyTarget++;
          }
        };
        one('ORIGINAL',x,inA&&!inB);
        one('HYSTERESIS',y,false);
      }
      const aStats=summary(stats.ORIGINAL),bStats=summary(stats.HYSTERESIS);
      const old=prev[0] as HysteresisMatchedOosCell|undefined;
      if(!old||old.allOutOfSampleDecisions!==a.length||
         old.originalObservedEntries!==aStats.enrolledEntries||
         old.stabilizedObservedEntries!==bStats.enrolledEntries||
         old.bothEntered!==both||old.originalOnlyEntries!==ao||
         old.stabilizedOnlyEntries!==bo||old.neitherEntered!==neither||
         old.originalCensoredExits!==stats.ORIGINAL.censored||
         old.stabilizedCensoredExits!==stats.HYSTERESIS.censored)
        flag('PHASE13_COHORT_OR_CENSOR_COUNTS_DO_NOT_REPRODUCE');
      if(stats.ORIGINAL.missing||stats.HYSTERESIS.missing)
        flag('ORIGINAL_MISSING_ENTRY_L1_UNRESOLVED');
      if(stats.ORIGINAL.censored||stats.HYSTERESIS.censored)
        flag('UNOBSERVED_PRETRIGGER_BID_PATH_OR_PRICE_CENSORED');
      if(stats.ORIGINAL.priced<
         rule.minimumFullyObservedPathsPerVariantCell||
         stats.HYSTERESIS.priced<
         rule.minimumFullyObservedPathsPerVariantCell)
        flag('PREDECLARED_FULLY_OBSERVED_SAMPLE_MINIMUM_NOT_MET');
      cells.push({
        foldIndex:fold,arm,horizon,allOutOfSampleDecisions:a.length,
        original:aStats,hysteresis:bStats,
        bothEntered:both,originalOnlyEntered:ao,
        hysteresisOnlyEntered:bo,neitherEntered:neither,
        originalOnlyFirstRunupReversals:onlyReverse,
        originalOnlyReachedCandidateTarget:onlyTarget,
        cohortSelectionsHeldConstant:true,
        fullyObservedForDescriptiveReview:blockers.length===0,blockers
      });
    }
  const complete=matched.status==='DESCRIPTIVE_ONLY'&&
    h.status==='DESCRIPTIVE_ONLY'&&
    cells.length===input.policy.folds.length*12&&
    cells.every(c=>c.fullyObservedForDescriptiveReview);
  return {
    ...report,status:complete?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    errors:[],policy:pathPolicy,cells,hysteresisStatus:h.status,
    originalExitStatus:original.status,
    hysteresisExitStatus:hysteresis.status
  };
}
