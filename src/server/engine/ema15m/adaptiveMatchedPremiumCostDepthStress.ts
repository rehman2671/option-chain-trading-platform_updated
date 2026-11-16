/**
 * Phase 14 — matched ORIGINAL vs HYSTERESIS synthetic/source-attested
 * option-premium cost, spread, overnight gap and displayed depth STRESS.
 *
 * IMPORTANT: stress is applied AFTER the Phase 8 independent entry-first
 * cohorts and hypothetical next-available-BID exit observations are fixed.
 * No future OOS quote may change the entry candidate, exposure cooldown,
 * stop trigger, first eligible exit quote or original price-censor status.
 * Every stress PnL is a hypothetical sensitivity, NEVER a broker fill.
 */
import type {
  HistoricalComparisonInput,HistoricalExecutableQuote,HistoricalArm
} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';
import type {DeclaredTradingSession} from './adaptiveSessionIntegrity.js';
import type {AdaptiveExitReplayPolicy} from './adaptivePositionalExitReplay.js';
import {runAdaptiveEntryFirstExitStudy,type EntryFirstExitStudy,
  type EntryFirstExitOutcome} from './adaptiveEntryFirstExitStudy.js';
import {replayAdaptiveRegimeHysteresis,type HysteresisResearchPolicy} from
  './adaptiveRegimeHysteresis.js';
import {adaptiveCohortAdvisoryKey,type CohortDecision} from
  './adaptiveEntryFirstCohort.js';
import {compareAdaptiveHysteresisMatchedOos,type HysteresisMatchedOosPolicy,
  type HysteresisMatchedOosReport} from './adaptiveHysteresisMatchedOos.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
export type StressCase='UNCHANGED_P8_COSTS'|'DOUBLE_ORIGINAL_COSTS'|
  'WIDEN_ENTRY_ASK_AND_EXIT_BID'|'COMBINED_OVERNIGHT_GAP_AND_DEPTH';
const SCENARIOS:StressCase[]=[
  'UNCHANGED_P8_COSTS','DOUBLE_ORIGINAL_COSTS',
  'WIDEN_ENTRY_ASK_AND_EXIT_BID','COMBINED_OVERNIGHT_GAP_AND_DEPTH'
];
const round=(v:number)=>Number(v.toFixed(2));
const isNum=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const bounded=(v:unknown,min:number,max:number)=>
  isNum(v)&&v>=min&&v<=max;
const integer=(v:unknown,min:number,max:number)=>
  bounded(v,min,max)&&Number.isInteger(v);
const key=(a:{foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;
  decisionAt:string})=>[a.foldIndex,a.arm,a.horizon,a.decisionAt].join('|');
const quoteKey=(instrumentKey:string,observedAt:string)=>
  instrumentKey+'\n'+observedAt;
const cellsKey=(fold:number,arm:HistoricalArm,h:HorizonBucket)=>
  fold+'|'+arm+'|'+h;

export interface PremiumCostDepthHorizonRule {
  /** Added ask markup and bid haircut ONLY in stressed sensitivity cases. */
  addedEntryAskBps:number;
  addedExitBidBps:number;
  /** Additional conservative bid haircut for a real OBSERVED overnight trigger. */
  additionalOvernightBidHaircutBps:number;
  /** Applied in COMBINED scenario to both matched cohorts, 1..10 lots. */
  minimumAskDepthLots:number;
  minimumBidDepthLots:number;
  /** Maximum allowed absolute BASE -> COMBINED paper PnL deterioration. */
  maximumCombinedStressDeteriorationINR:number;
}
export interface PremiumCostDepthStressPolicy {
  schemaVersion:'ADAPTIVE_MATCHED_PREMIUM_COST_DEPTH_STRESS_V1';
  minimumJointlyStressedPricedPairsPerCell:number;
  horizonRules:Record<HorizonBucket,PremiumCostDepthHorizonRule>;
}
export interface StressVariantEvidence {
  enrolledEntries:number;
  originallyPricedExits:number;
  originalCensoredExits:number;
  scenarioPricedExits:number;
  scenarioCensoredExits:number;
  additionalDepthBlockedExits:number;
  missingOriginalQuoteEvidence:number;
  /** Null unless EVERY entry outcome and required ask/bid was priceable. */
  completeCohortNetPnlINR:number|null;
  /** Includes both slippage and per-side fixed fees from original policy. */
  aggregateScenarioCostPenaltyINR:number|null;
  originalOnlyWinnersUnderStress:number;
  originalOnlyLosersUnderStress:number;
  originalOnlyCensoredUnderStress:number;
}
export interface PremiumStressCell {
  foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;scenario:StressCase;
  allOutOfSampleDecisions:number;
  original:StressVariantEvidence;
  stabilized:StressVariantEvidence;
  bothEntered:number;
  originalOnlyEntered:number;
  stabilizedOnlyEntered:number;
  neitherEntered:number;
  jointlyStressedPricedPairs:number;
  jointlyCensoredPairs:number;
  /** Same originally enrolled pair, BOTH stress-priced; otherwise null. */
  pairedNetDeltaINR:number|null;
  /** Same entry universe across cases; absolutely no cost-driven re-selection. */
  fixedCohortsAcrossScenarios:true;
  /** Source quality / sample evidence, not a trading approval. */
  sufficientForDescriptiveStressReview:boolean;
  blockers:string[];
}
export interface PremiumCostDepthStressReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  brokerFillsAuthenticated:false;
  nativeProtectionInstalled:false;
  originalMarketDataIndependentlyAuthenticated:false;
  exchangeCalendarIndependentlyVerified:false;
  scenarioPricesAreObservedTrades:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'DESCRIPTIVE_ONLY';
  errors:string[];
  warnings:string[];
  datasetId:string|null;
  synthetic:boolean|null;
  phase13Status:HysteresisMatchedOosReport['status']|null;
  originalEntryFirstStatus:EntryFirstExitStudy['status']|null;
  stabilizedEntryFirstStatus:EntryFirstExitStudy['status']|null;
  policy:PremiumCostDepthStressPolicy|null;
  cells:PremiumStressCell[];
  /** Per scenario/horizon aggregate, including data-censor counts. */
  horizonSummary:Array<{
    horizon:HorizonBucket;scenario:StressCase;
    cellsReviewed:number;
    cellsWithCompleteEvidence:number;
    observedGapSensitiveEntries:number;
    stressDepthBlockedExits:number;
    anyUnpricedEvidence:boolean;
  }>;
}
const warnings=[
  'SCENARIO_PRICE_HAIRCUTS_ARE_HYPOTHETICAL_NOT_HISTORICAL_BROKER_FILLS',
  'EXIT_STOP_TRIGGER_AND_FIRST_NEXT_L1_BID_ARE_FROZEN_BEFORE_STRESS',
  'ORIGINAL_AND_HYSTERESIS_COHORTS_AND_EXPOSURE_COOLDOWNS_ARE_INDEPENDENT',
  'NO_SURVIVOR_BIAS_CORRECTION_BY_ZEROING_CENSORED_EXITS',
  'STRESS_DEPTH_BLOCK_PRESERVES_UNPRICED_NOT_HYPOTHETIC_LATER_FILL',
  'ORIGINAL_PREMIUM_ASK_AND_NEXT_BID_NOT_UNDERLYING_INDEX_TARGETS',
  'STRESSED_GAP_PRICE_DOES_NOT_ESTABLISH_NSE_BSE_STOP_OR_GTT_EXECUTION',
  'ONE_LEVEL_L1_DEPTH_DOES_NOT_PROVE_ORDER_QUEUE_OR_PARTIAL_EXECUTION',
  'HISTORICAL_SOURCE_CALENDAR_AND_EVENT_CLOCKS_REQUIRE_INDEPENDENT_VERIFICATION',
  'FEWER_TRADES_OR_BETTER_STRESS_PNL_ARE_NOT_STATISTICAL_EDGE'
];
export function validatePremiumCostDepthStressPolicy(
  p:PremiumCostDepthStressPolicy
):string[]{
  if(!p||p.schemaVersion!=='ADAPTIVE_MATCHED_PREMIUM_COST_DEPTH_STRESS_V1'||
     !integer(p.minimumJointlyStressedPricedPairsPerCell,1,100000))
    return ['INVALID_PREDECLARED_COST_DEPTH_STRESS_POLICY'];
  for(const h of HORIZONS){
    const r=p.horizonRules?.[h];
    if(!r||!bounded(r.addedEntryAskBps,0,3000)||
       !bounded(r.addedExitBidBps,0,3000)||
       !bounded(r.additionalOvernightBidHaircutBps,0,3000)||
       r.addedExitBidBps+r.additionalOvernightBidHaircutBps>=9000||
       !integer(r.minimumAskDepthLots,1,10)||
       !integer(r.minimumBidDepthLots,1,10)||
       !bounded(r.maximumCombinedStressDeteriorationINR,0,1e12))
      return ['INVALID_PREDECLARED_HORIZON_COST_DEPTH_RULE_'+h];
  }
  return [];
}
type Variant='ORIGINAL'|'HYSTERESIS';
interface QuoteEvidence {ask:HistoricalExecutableQuote;bid:HistoricalExecutableQuote}
interface StressPriced {
  status:'PRICED'|'CENSORED'|'DEPTH_BLOCKED'|'SOURCE_MISMATCH';
  pnl:number|null;
  penalty:number|null;
}
interface StudyWithMaps {
  study:EntryFirstExitStudy;
  entries:Map<string,CohortDecision>;
  exits:Map<string,EntryFirstExitOutcome>;
}
function indexed(study:EntryFirstExitStudy):StudyWithMaps|null{
  const entries=new Map<string,CohortDecision>();
  const exits=new Map<string,EntryFirstExitOutcome>();
  for(const a of study.cohort.attempts){
    const k=key(a);
    if(entries.has(k))return null;
    entries.set(k,a);
  }
  for(const o of study.outcomes){
    const k=key(o);
    if(exits.has(k)||entries.get(k)?.disposition!=='ENTRY_OBSERVED')
      return null;
    exits.set(k,o);
  }
  if([...entries].filter(([,e])=>e.disposition==='ENTRY_OBSERVED').length!==
     exits.size)return null;
  return {study,entries,exits};
}
function originalQuotes(
  e:CohortDecision,
  o:EntryFirstExitOutcome,
  quotes:Map<string,HistoricalExecutableQuote>
):QuoteEvidence|null{
  if(o.status!=='PRICED_EXIT'||o.hypotheticalNetPnlINR===null||
     o.hypotheticalExitBid===null||!o.nextQuoteAt)return null;
  const ask=quotes.get(quoteKey(e.instrumentKey!,e.entryAt!));
  const bid=quotes.get(quoteKey(e.instrumentKey!,o.nextQuoteAt));
  if(!ask||!bid||ask.ask!==e.entryAsk||bid.bid!==o.hypotheticalExitBid||
     e.entryAt!==o.entryAt||e.instrumentKey!==o.instrumentKey||
     e.quantity!==o.quantity||!e.quantity||
     Date.parse(o.nextQuoteAt)<=Date.parse(o.triggerObservedAt??'')||
     Date.parse(e.entryAt!)>=Date.parse(o.nextQuoteAt)||
     ask.askQty<e.quantity||bid.bidQty<e.quantity)
    return null;
  return {ask,bid};
}
function pricedUnderScenario(
  e:CohortDecision,o:EntryFirstExitOutcome|undefined,
  quoteMap:Map<string,HistoricalExecutableQuote>,
  input:HistoricalComparisonInput,
  rule:PremiumCostDepthHorizonRule,
  scenario:StressCase
):StressPriced {
  if(!o||o.status!=='PRICED_EXIT')
    return {status:'CENSORED',pnl:null,penalty:null};
  const quote=originalQuotes(e,o,quoteMap);
  if(!quote)return{status:'SOURCE_MISMATCH',pnl:null,penalty:null};
  const combined=scenario==='COMBINED_OVERNIGHT_GAP_AND_DEPTH';
  const wide=combined||scenario==='WIDEN_ENTRY_ASK_AND_EXIT_BID';
  const doubled=combined||scenario==='DOUBLE_ORIGINAL_COSTS';
  const lotsAsk=combined?rule.minimumAskDepthLots:1;
  const lotsBid=combined?rule.minimumBidDepthLots:1;
  // The same FIRST post-trigger L1 is mandatory. Never try a later favorable
  // bid to evade the conservative order-size screen.
  if(quote.ask.askQty<e.quantity!*lotsAsk||
     quote.bid.bidQty<e.quantity!*lotsBid)
    return {status:'DEPTH_BLOCKED',pnl:null,penalty:null};
  const askPrice=e.entryAsk!*(1+(wide?rule.addedEntryAskBps:0)/10000);
  const bidHaircut=(wide?rule.addedExitBidBps:0)+
    (combined&&o.overnightGapAtTrigger?
      rule.additionalOvernightBidHaircutBps:0);
  const bidPrice=o.hypotheticalExitBid!*(1-bidHaircut/10000);
  const slip=input.policy.slippageBpsPerSide/10000*(doubled?2:1);
  const fee=input.policy.feesAndTaxesINRPerSide*(doubled?2:1);
  if(bidPrice<=0||askPrice<=0||slip>=.5)
    return {status:'SOURCE_MISMATCH',pnl:null,penalty:null};
  const pnl=round((bidPrice*(1-slip)-askPrice*(1+slip))*
    e.quantity!-2*fee);
  const originalSlip=input.policy.slippageBpsPerSide/10000;
  const unchanged=round((o.hypotheticalExitBid!*(1-originalSlip)-
    e.entryAsk!*(1+originalSlip))*e.quantity!-
    2*input.policy.feesAndTaxesINRPerSide);
  if(Math.abs(unchanged-o.hypotheticalNetPnlINR!)>.011)
    return {status:'SOURCE_MISMATCH',pnl:null,penalty:null};
  return {status:'PRICED',pnl,penalty:round(unchanged-pnl)};
}
function evaluateCell(
  input:HistoricalComparisonInput,
  rawQuotes:Map<string,HistoricalExecutableQuote>,
  original:StudyWithMaps,
  filtered:StudyWithMaps,
  matched:HysteresisMatchedOosReport,
  policy:PremiumCostDepthStressPolicy,
  foldIndex:number,arm:HistoricalArm,horizon:HorizonBucket,scenario:StressCase
):PremiumStressCell {
  const bKeys=[...original.entries.values()].filter(a=>
    a.foldIndex===foldIndex&&a.arm===arm&&a.horizon===horizon);
  const rule=policy.horizonRules[horizon];
  const blockers:string[]=[];
  const add=(x:string)=>{if(!blockers.includes(x))blockers.push(x);};
  const prior=matched.cells.find(c=>c.foldIndex===foldIndex&&
    c.arm===arm&&c.horizon===horizon);
  const total=bKeys.length;
  const missingOriginal=bKeys.filter(x=>
    x.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
    x.disposition==='UNUSABLE_UNDERLYING_HISTORY').length;
  const fRows=bKeys.map(a=>filtered.entries.get(key(a)));
  const missingFiltered=fRows.filter(x=>x&&
    (x.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
    x.disposition==='UNUSABLE_UNDERLYING_HISTORY')).length;
  if(!prior||fRows.some(x=>!x)||
     total!==prior.allOutOfSampleDecisions||
     [...original.entries.values()].filter(a=>
       a.foldIndex===foldIndex&&a.arm===arm&&a.horizon===horizon).length!==total)
    add('PHASE13_DECISION_UNIVERSE_MISMATCH');
  type Counter={
    total:number;originallyPriced:number;originalCensored:number;
    priced:number;censored:number;depth:number;mismatch:number;
    totalNet:number;costPenalty:number;onlyWins:number;onlyLosses:number;
    onlyCensored:number;
  };
  const blank=():Counter=>({total:0,originallyPriced:0,originalCensored:0,
    priced:0,censored:0,depth:0,mismatch:0,totalNet:0,costPenalty:0,
    onlyWins:0,onlyLosses:0,onlyCensored:0});
  const counts:Record<Variant,Counter>={ORIGINAL:blank(),HYSTERESIS:blank()};
  let both=0,bOnly=0,fOnly=0,neither=0,joint=0,jointUnpriced=0,delta=0;
  for(const a of bKeys){
    const f=filtered.entries.get(key(a));
    if(!f)continue;
    const bEntered=a.disposition==='ENTRY_OBSERVED';
    const fEntered=f.disposition==='ENTRY_OBSERVED';
    const priceOne=(variant:Variant,entry:CohortDecision,
      onlyBaseline:boolean):StressPriced=>{
      const c=counts[variant];
      c.total++;
      const o=(variant==='ORIGINAL'?original:filtered).exits.get(key(entry));
      if(o?.status==='PRICED_EXIT')c.originallyPriced++;
      else c.originalCensored++;
      const res=pricedUnderScenario(entry,o,rawQuotes,input,rule,scenario);
      if(res.status==='PRICED'){
        c.priced++;c.totalNet+=res.pnl!;c.costPenalty+=res.penalty!;
        if(onlyBaseline){
          if(res.pnl!>0)c.onlyWins++;
          else if(res.pnl!<0)c.onlyLosses++;
        }
      }else{
        c.censored++;
        if(res.status==='DEPTH_BLOCKED')c.depth++;
        if(res.status==='SOURCE_MISMATCH')c.mismatch++;
        if(onlyBaseline)c.onlyCensored++;
      }
      return res;
    };
    const b=bEntered?priceOne('ORIGINAL',a,!fEntered):null;
    const h=fEntered?priceOne('HYSTERESIS',f,false):null;
    if(bEntered&&fEntered){
      both++;
      if(b?.status==='PRICED'&&h?.status==='PRICED'){
        joint++;delta+=h.pnl!-b.pnl!;
      }else jointUnpriced++;
    }else if(bEntered)bOnly++;
    else if(fEntered)fOnly++;
    else neither++;
  }
  const toEvidence=(c:Counter):StressVariantEvidence=>({
    enrolledEntries:c.total,originallyPricedExits:c.originallyPriced,
    originalCensoredExits:c.originalCensored,
    scenarioPricedExits:c.priced,scenarioCensoredExits:c.censored,
    additionalDepthBlockedExits:c.depth,
    missingOriginalQuoteEvidence:c.mismatch,
    completeCohortNetPnlINR:c.total>0&&c.censored===0?
      round(c.totalNet):null,
    aggregateScenarioCostPenaltyINR:c.total>0&&c.censored===0?
      round(c.costPenalty):null,
    originalOnlyWinnersUnderStress:c.onlyWins,
    originalOnlyLosersUnderStress:c.onlyLosses,
    originalOnlyCensoredUnderStress:c.onlyCensored
  });
  const b=toEvidence(counts.ORIGINAL);
  const h=toEvidence(counts.HYSTERESIS);
  if(!prior||both!==prior.bothEntered||
     bOnly!==prior.originalOnlyEntries||
     fOnly!==prior.stabilizedOnlyEntries||
     neither!==prior.neitherEntered||
     b.enrolledEntries!==prior.originalObservedEntries||
     h.enrolledEntries!==prior.stabilizedObservedEntries||
     joint+jointUnpriced!==both)
    add('PHASE13_BASELINE_COUNTS_CHANGED_UNDER_STRESS');
  if(counts.ORIGINAL.mismatch||counts.HYSTERESIS.mismatch)
    add('ORIGINAL_NEXT_L1_SOURCE_EVIDENCE_NOT_REPRODUCIBLE');
  if(missingOriginal||missingFiltered)
    add('MISSING_ORIGINAL_ENTRY_L1_CANNOT_BE_ZEROED');
  if(b.scenarioCensoredExits||h.scenarioCensoredExits)
    add('UNPRICED_OR_DEPTH_BLOCKED_EXITS_CANNOT_ENTER_NET_PNL');
  if(joint<policy.minimumJointlyStressedPricedPairsPerCell)
    add('PAIRED_STRESS_SAMPLE_BELOW_PREDECLARED_MINIMUM');
  if(scenario==='UNCHANGED_P8_COSTS'&&prior){
    if(prior.originalCompleteCohortNetPnlINR!==b.completeCohortNetPnlINR||
       prior.stabilizedCompleteCohortNetPnlINR!==h.completeCohortNetPnlINR)
      add('BASE_SCENARIO_PNL_DOES_NOT_REPRODUCE_PHASE13');
  }
  return {
    foldIndex,arm,horizon,scenario,allOutOfSampleDecisions:total,
    original:b,stabilized:h,
    bothEntered:both,originalOnlyEntered:bOnly,
    stabilizedOnlyEntered:fOnly,neitherEntered:neither,
    jointlyStressedPricedPairs:joint,
    jointlyCensoredPairs:jointUnpriced,
    pairedNetDeltaINR:!blockers.length?round(delta):null,
    fixedCohortsAcrossScenarios:true,
    sufficientForDescriptiveStressReview:blockers.length===0,
    blockers
  };
}
/**
 * Rebuild both independent Phase 8 cohorts from original decision-time
 * records, then DO NOT reselect entries or exits for different costs/depth.
 * Thresholds and scenarios are treated as predeclared research hypotheses.
 */
export function auditAdaptiveMatchedPremiumCostDepthStress(
  input:HistoricalComparisonInput,
  sessions:DeclaredTradingSession[]|undefined,
  exitPolicy:AdaptiveExitReplayPolicy,
  hysteresisPolicy:HysteresisResearchPolicy,
  matchPolicy:HysteresisMatchedOosPolicy,
  stressPolicy:PremiumCostDepthStressPolicy
):PremiumCostDepthStressReport {
  const base:PremiumCostDepthStressReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    profitabilityProven:false,brokerFillsAuthenticated:false,
    nativeProtectionInstalled:false,
    originalMarketDataIndependentlyAuthenticated:false,
    exchangeCalendarIndependentlyVerified:false,
    scenarioPricesAreObservedTrades:false,
    status:'REJECTED',errors:[],warnings,
    datasetId:input?.provenance?.datasetId??null,
    synthetic:input?.provenance?.synthetic??null,
    phase13Status:null,originalEntryFirstStatus:null,
    stabilizedEntryFirstStatus:null,policy:null,cells:[],horizonSummary:[]
  };
  const errors=validatePremiumCostDepthStressPolicy(stressPolicy);
  if(errors.length)return {...base,errors};
  const paired=compareAdaptiveHysteresisMatchedOos(
    input,sessions,exitPolicy,hysteresisPolicy,matchPolicy
  );
  if(paired.status==='REJECTED')
    return {...base,errors:['INVALID_OR_REJECTED_PHASE13_MATCHED_STUDY',
      ...paired.errors],phase13Status:paired.status};
  const h=replayAdaptiveRegimeHysteresis(input,sessions,hysteresisPolicy);
  if(h.status==='REJECTED')
    return {...base,errors:['HYSTERESIS_REPLAY_INVALID'],phase13Status:paired.status};
  const advisories=new Map<string,'CE'|'PE'|'NO_TRADE'>();
  for(const o of h.observations){
    const k=adaptiveCohortAdvisoryKey(o.foldIndex,o.horizon,o.decisionAt);
    if(advisories.has(k))
      return {...base,errors:['DUPLICATE_POINT_IN_TIME_ADVISORY']};
    advisories.set(k,o.newEntryAdvisory);
  }
  const b=runAdaptiveEntryFirstExitStudy(input,exitPolicy,sessions);
  const f=runAdaptiveEntryFirstExitStudy(
    input,exitPolicy,sessions,advisories
  );
  if(b.status==='REJECTED'||f.status==='REJECTED')
    return {...base,errors:['INDEPENDENT_ENTRY_FIRST_STUDIES_INVALID',
      ...b.errors,...f.errors],phase13Status:paired.status};
  const baseline=indexed(b),stabilized=indexed(f);
  if(!baseline||!stabilized||
     baseline.entries.size!==stabilized.entries.size||
     paired.cells.length!==input.policy.folds.length*12)
    return {...base,errors:['INDEPENDENT_COHORT_IDENTIFIERS_DIVERGE'],
      phase13Status:paired.status};
  const rawQuotes=new Map<string,HistoricalExecutableQuote>();
  for(const quote of input.executionQuotes){
    const k=quoteKey(quote.instrumentKey,quote.observedAt);
    if(rawQuotes.has(k))
      return {...base,errors:['DUPLICATE_SOURCE_AVAILABLE_L1_QUOTE'],
        phase13Status:paired.status};
    rawQuotes.set(k,quote);
  }
  const cells:PremiumStressCell[]=[];
  for(let foldIndex=0;foldIndex<input.policy.folds.length;foldIndex++)
    for(const arm of ARMS)for(const horizon of HORIZONS)
      for(const scenario of SCENARIOS)
        cells.push(evaluateCell(input,rawQuotes,baseline,stabilized,
          paired,stressPolicy,foldIndex,arm,horizon,scenario));
  const summary:PremiumCostDepthStressReport['horizonSummary']=[];
  for(const horizon of HORIZONS)for(const scenario of SCENARIOS){
    const subset=cells.filter(c=>c.horizon===horizon&&c.scenario===scenario);
    const phase13ByCell=paired.cells.filter(c=>c.horizon===horizon);
    summary.push({
      horizon,scenario,cellsReviewed:subset.length,
      cellsWithCompleteEvidence:subset.filter(c=>
        c.sufficientForDescriptiveStressReview).length,
      observedGapSensitiveEntries:phase13ByCell.reduce((v,c)=>
        v+c.originalOvernightGapTriggers+
        c.stabilizedOvernightGapTriggers,0),
      stressDepthBlockedExits:subset.reduce((v,c)=>
        v+c.original.additionalDepthBlockedExits+
        c.stabilized.additionalDepthBlockedExits,0),
      anyUnpricedEvidence:subset.some(c=>
        c.original.scenarioCensoredExits>0||
        c.stabilized.scenarioCensoredExits>0)
    });
  }
  const complete=paired.status==='DESCRIPTIVE_ONLY'&&
    h.status==='DESCRIPTIVE_ONLY'&&
    cells.length===input.policy.folds.length*12*SCENARIOS.length&&
    cells.every(c=>c.sufficientForDescriptiveStressReview);
  return {...base,
    status:complete?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    phase13Status:paired.status,originalEntryFirstStatus:b.status,
    stabilizedEntryFirstStatus:f.status,
    policy:stressPolicy,cells,horizonSummary
  };
}
