/**
 * Phase 8: independently enrolled entry-first OOS option exit replay.
 *
 * Unlike Phase 7, future fixed-hold exit availability NEVER determines which
 * entries are enrolled. Observed exits are priced only at the NEXT original
 * availability-time L1 bid with sufficient quantity and acceptable latency.
 * Missing path, last observed quote and broker fill uncertainty are censored,
 * never set to zero or omitted from the trade denominator.
 *
 * Strictly offline, no orders / no NRML state / no broker protection.
 */
import type { HistoricalComparisonInput, HistoricalExecutableQuote,
  HistoricalArm } from './historicalAdaptiveComparison.js';
import type { HorizonBucket } from './adaptiveOptionRanker.js';
import type { DeclaredTradingSession } from './adaptiveSessionIntegrity.js';
import { buildAdaptiveEntryFirstCohort, type CohortDecision,
  type EntryFirstCohortReport } from './adaptiveEntryFirstCohort.js';
import { validateAdaptiveExitReplayPolicy,
  type AdaptiveExitReplayPolicy } from './adaptivePositionalExitReplay.js';

const DAY=86_400_000,MINUTE=60_000;
const ms=(s:string)=>Date.parse(s);
const day=(msValue:number)=>new Date(msValue+330*MINUTE).toISOString().slice(0,10);
const round=(value:number)=>Number(value.toFixed(2));
const HORIZONS: HorizonBucket[]=['1W','2W','4W','8W'];
const ARMS: HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
export type EntryFirstExitStatus='PRICED_EXIT'|'EXIT_UNPRICED'|'PATH_INCOMPLETE';
export type EntryFirstExitReason='INITIAL_STOP'|'TRAILING_GIVEBACK'|'FIXED_HOLD_DUE'|'EARLY_TIME_CAP';
export interface EntryFirstExitOutcome {
  foldIndex:number;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  decisionAt:string;
  instrumentKey:string;
  entryAt:string;
  entryAsk:number;
  quantity:number;
  status:EntryFirstExitStatus;
  reason:string;
  triggerObservedAt:string|null;
  breachedLevel:number|null;
  nextQuoteAt:string|null;
  hypotheticalExitBid:number|null;
  hypotheticalNetPnlINR:number|null;
  overnightGapAtTrigger:boolean;
  pathQuoteCount:number;
}
export interface EntryFirstExitCell {
  foldIndex:number;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  totalDecisions:number;
  entryObservedCount:number;
  noEntryCount:number;
  pricedExitCount:number;
  unpricedExitCount:number;
  pathIncompleteCount:number;
  overnightGapTriggerCount:number;
  observedOnlyNetPnlINR:number|null;
  /** Includes missing exits; never substitutes missing trade outcomes with 0. */
  completeCohortNetPnlINR:number|null;
  descriptiveComparisonEligible:boolean;
}
export interface EntryFirstExitStudy {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  brokerStopProtectionInstalled:false;
  historicalDataIndependentlyAuthenticated:false;
  profitabilityProven:false;
  selectionMethod:'OOS_ENTRY_FIRST_PREDECLARED_COOLDOWN';
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'DESCRIPTIVE_ONLY';
  errors:string[];
  cohort:EntryFirstCohortReport;
  outcomes:EntryFirstExitOutcome[];
  cells:EntryFirstExitCell[];
  warnings:string[];
}

function validatedSessions(raw:DeclaredTradingSession[]|undefined):
  Map<string,{open:number;close:number}>|null {
  if(!Array.isArray(raw)||!raw.length)return null;
  const sessions=new Map<string,{open:number;close:number}>();
  let prior='';
  for(const s of raw){
    const open=ms(s?.openAt),close=ms(s?.closeAt);
    if(!s||!s.sessionDate||s.sessionDate<=prior ||
       !Number.isFinite(open)||!Number.isFinite(close)||
       close<=open||close-open>DAY||
       day(open)!==s.sessionDate||day(close)!==s.sessionDate ||
       !s.sourceRecordId?.trim())return null;
    sessions.set(s.sessionDate,{open,close});
    prior=s.sessionDate;
  }
  return sessions;
}
function pathCoverage(
  series:HistoricalExecutableQuote[],start:number,end:number,
  sessions:Map<string,{open:number;close:number}>,
  policy:AdaptiveExitReplayPolicy
):string|null{
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
    return 'INVALID_OBSERVATION_INTERVAL';
  const observed=series.filter(q=>ms(q.observedAt)>=start&&ms(q.observedAt)<=end);
  if(observed.length<policy.minIntermediateQuotes+2)
    return 'INSUFFICIENT_L1_PATH_OBSERVATIONS';
  let qualifyingSessions=0;
  for(const [date,window] of sessions){
    const begin=Math.max(start,window.open);
    const finish=Math.min(end,window.close);
    if(finish<begin)continue;
    qualifyingSessions++;
    const quotes=observed.filter(q=>{
      const timestamp=ms(q.observedAt);
      return timestamp>=begin&&timestamp<=finish;
    });
    if(quotes.length<policy.minQuotesPerDeclaredSession)
      return 'INCOMPLETE_DECLARED_SESSION_L1';
    // Include BOTH session edges; a single close quote cannot hide the
    // absent intraday stop/price path, and a gap-open print isn't prefilled.
    const times=[begin,...quotes.map(q=>ms(q.observedAt)),finish];
    for(let i=1;i<times.length;i++){
      if(times[i]-times[i-1]>policy.maxSameSessionQuoteGapMinutes*MINUTE)
        return 'L1_OBSERVATION_GAP_TOO_WIDE';
    }
  }
  if(!qualifyingSessions)return 'NO_DECLARED_SESSION_IN_HOLDING_INTERVAL';
  for(const quote of observed){
    const timestamp=ms(quote.observedAt);
    const session=sessions.get(day(timestamp));
    if(!session||timestamp<session.open||timestamp>session.close)
      return 'NON_SESSION_EXECUTION_L1';
  }
  // Every actual trading session between dates is audited using the supplied
  // calendar, but the caller must independently attest that no sessions are
  // omitted (including special/holiday sessions).
  return null;
}
function emptyOutcome(a:CohortDecision,status:EntryFirstExitStatus,
  reason:string,pathQuoteCount:number,
  trigger:string|null=null,breached:number|null=null,
  overnight=false):EntryFirstExitOutcome{
  return {
    foldIndex:a.foldIndex,arm:a.arm,horizon:a.horizon,decisionAt:a.decisionAt,
    instrumentKey:a.instrumentKey!,entryAt:a.entryAt!,entryAsk:a.entryAsk!,
    quantity:a.quantity!,status,reason,
    triggerObservedAt:trigger,breachedLevel:breached,nextQuoteAt:null,
    hypotheticalExitBid:null,hypotheticalNetPnlINR:null,
    overnightGapAtTrigger:overnight,pathQuoteCount
  };
}

/** This entry-first study is independent of the original fixed-exit survivor cohort. */
export function runAdaptiveEntryFirstExitStudy(
  input:HistoricalComparisonInput,
  policy:AdaptiveExitReplayPolicy,
  declaredSessions:DeclaredTradingSession[]|undefined,
  /** Optional precomputed Phase 12 ORIGINAL-decision advisory per fold/horizon. */
  newEntryAdvisories?:ReadonlyMap<string,'CE'|'PE'|'NO_TRADE'>
):EntryFirstExitStudy {
  const cohort=buildAdaptiveEntryFirstCohort(input,newEntryAdvisories);
  const errors=[...cohort.errors,...validateAdaptiveExitReplayPolicy(policy)];
  const sessions=validatedSessions(declaredSessions);
  if(!sessions)errors.push('ORIGINAL_EXCHANGE_SESSION_CALENDAR_REQUIRED');
  const base:EntryFirstExitStudy={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    brokerStopProtectionInstalled:false,
    historicalDataIndependentlyAuthenticated:false,profitabilityProven:false,
    selectionMethod:'OOS_ENTRY_FIRST_PREDECLARED_COOLDOWN',
    status:'REJECTED',errors,cohort,outcomes:[],cells:[],
    warnings:[
      'ENTRIES_ENROLLED_BEFORE_FUTURE_EXIT_AVAILABILITY_CHECK',
      'EVERY_OOS_DECISION_ARM_HORIZON_REMAINS_IN_DENOMINATOR',
      'NO_REENTRY_UNTIL_PREDECLARED_FIXED_HOLD_COOLDOWN',
      'MISSING_L1_PATHS_AND_EXIT_BIDS_REMAIN_CENSORED_NOT_ZERO',
      'HYPOTHETICAL_NEXT_QUOTE_DEPTH_NOT_EXECUTABLE_OR_NATIVE_PROTECTION',
      'EXCHANGE_CALENDAR_AND_VENDOR_ORIGIN_REQUIRE_EXTERNAL_AUDIT',
      'NO_HISTORICAL_EDGE_OR_REAL_WORLD_EXECUTION_PROVEN'
    ]
  };
  if(errors.length)return base;

  const byKey=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of input.executionQuotes){
    const list=byKey.get(q.instrumentKey)??[];
    list.push(q);
    byKey.set(q.instrumentKey,list);
  }
  for(const list of byKey.values())list.sort((a,b)=>ms(a.observedAt)-ms(b.observedAt));
  const outcomes:EntryFirstExitOutcome[]=[];
  for(const a of cohort.attempts){
    if(a.disposition!=='ENTRY_OBSERVED')continue;
    const entry=ms(a.entryAt!);
    const fixedDue=ms(a.scheduledFixedHoldAt!);
    const cap=entry+policy.horizonRules[a.horizon].maxHoldCalendarDays*DAY;
    const due=Math.min(fixedDue,cap);
    const final=ms(a.lastEligibleFixedHoldExitAt!);
    const hardEnd=Math.min(final,due+input.policy.maxExitDelayDays*DAY);
    const quotes=(byKey.get(a.instrumentKey!)??[]).filter(q=>
      ms(q.observedAt)>=entry&&ms(q.observedAt)<=hardEnd);
    const badEntry=quotes.length===0||quotes[0].observedAt!==a.entryAt ||
      Math.abs(quotes[0].ask-a.entryAsk!)>0.011 ||
      Math.abs(quotes[0].bid-a.entryBid!)>0.011 ||
      quotes[0].bidQty<a.quantity! || quotes[0].askQty<a.quantity!;
    if(badEntry||!Number.isFinite(due)||hardEnd<entry){
      outcomes.push(emptyOutcome(a,'PATH_INCOMPLETE',
        'ENTRY_EVIDENCE_MISMATCH_OR_INVALID_HOLD_WINDOW',quotes.length));continue;
    }
    let floor=a.entryAsk!*(1-policy.horizonRules[a.horizon].initialStopFraction);
    let peak=quotes[0].bid,activated=false;
    let prior=quotes[0];
    let triggerIndex=-1;
    let reason:EntryFirstExitReason='FIXED_HOLD_DUE';
    let threshold:number|null=null,overnight=false;
    for(let i=1;i<quotes.length;i++){
      const current=quotes[i],timestamp=ms(current.observedAt);
      const breach=current.bid<=floor,holdDue=timestamp>=due;
      if(breach||holdDue){
        triggerIndex=i;
        reason=breach?(activated?'TRAILING_GIVEBACK':'INITIAL_STOP'):
          cap<fixedDue?'EARLY_TIME_CAP':'FIXED_HOLD_DUE';
        threshold=breach?round(floor):null;
        overnight=day(ms(prior.observedAt))!==day(timestamp);
        break;
      }
      peak=Math.max(peak,current.bid);
      if(peak>=a.entryAsk!*(1+policy.horizonRules[a.horizon].trailActivationFraction)){
        activated=true;
        floor=Math.max(floor,peak*(1-policy.horizonRules[a.horizon].trailingGivebackFraction));
      }
      prior=current;
    }
    if(triggerIndex===-1){
      const end=quotes.length?ms(quotes[quotes.length-1].observedAt):entry;
      const pathError=pathCoverage(quotes,entry,end,sessions!,policy);
      outcomes.push(emptyOutcome(a,'PATH_INCOMPLETE',
        pathError??'NO_OBSERVED_TRIGGER_OR_SCHEDULED_EXIT',quotes.length));
      continue;
    }
    const trigger=quotes[triggerIndex];
    const next=quotes[triggerIndex+1];
    const pathEnd=next?ms(next.observedAt):ms(trigger.observedAt);
    const issue=pathCoverage(quotes,entry,pathEnd,sessions!,policy);
    if(issue){
      outcomes.push(emptyOutcome(a,'PATH_INCOMPLETE',issue,quotes.length,
        trigger.observedAt,threshold,overnight));
      continue;
    }
    const latency=next?ms(next.observedAt)-ms(trigger.observedAt):Infinity;
    if(!next||latency<=0||
       latency>policy.maxTriggerToNextQuoteMinutes*MINUTE||
       next.bidQty<a.quantity!){
      outcomes.push(emptyOutcome(a,'EXIT_UNPRICED',
        !next?'NO_NEXT_L1_BID':
        latency>policy.maxTriggerToNextQuoteMinutes*MINUTE?
          'POST_TRIGGER_L1_TOO_LATE':'NEXT_BID_DEPTH_INSUFFICIENT',
        quotes.length,trigger.observedAt,threshold,overnight));
      continue;
    }
    const slip=input.policy.slippageBpsPerSide/10_000;
    const pnl=round((next.bid*(1-slip)-a.entryAsk!*(1+slip))*a.quantity!-
      2*input.policy.feesAndTaxesINRPerSide);
    outcomes.push({
      ...emptyOutcome(a,'PRICED_EXIT',reason,quotes.length,
        trigger.observedAt,threshold,overnight),
      nextQuoteAt:next.observedAt,hypotheticalExitBid:next.bid,
      hypotheticalNetPnlINR:pnl
    });
  }
  const cells:EntryFirstExitCell[]=[];
  for(let f=0;f<input.policy.folds.length;f++)for(const arm of ARMS)
    for(const horizon of HORIZONS){
      const attempts=cohort.attempts.filter(a=>a.foldIndex===f&&
        a.arm===arm&&a.horizon===horizon);
      const included=attempts.filter(a=>a.disposition==='ENTRY_OBSERVED');
      const trades=outcomes.filter(x=>x.foldIndex===f&&
        x.arm===arm&&x.horizon===horizon);
      const priced=trades.filter(x=>x.status==='PRICED_EXIT');
      const censored=trades.length-priced.length;
      const net=priced.reduce((a,t)=>a+t.hypotheticalNetPnlINR!,0);
      const missingEntries=attempts.some(a=>
        a.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
        a.disposition==='UNUSABLE_UNDERLYING_HISTORY');
      const full=trades.length===included.length&&censored===0&&!missingEntries;
      cells.push({
        foldIndex:f,arm,horizon,
        totalDecisions:attempts.length,entryObservedCount:included.length,
        noEntryCount:attempts.length-included.length,
        pricedExitCount:priced.length,
        unpricedExitCount:trades.filter(x=>x.status==='EXIT_UNPRICED').length,
        pathIncompleteCount:trades.filter(x=>x.status==='PATH_INCOMPLETE').length,
        overnightGapTriggerCount:trades.filter(x=>x.overnightGapAtTrigger).length,
        observedOnlyNetPnlINR:priced.length?round(net):null,
        completeCohortNetPnlINR:full?round(net):null,
        descriptiveComparisonEligible:full&&priced.length>=20
      });
    }
  const complete=outcomes.length>0 &&
    outcomes.every(x=>x.status==='PRICED_EXIT') &&
    cells.every(c=>c.pathIncompleteCount===0&&c.unpricedExitCount===0) &&
    cohort.counts.missingEntryCount===0;
  return {...base,errors:[],status:complete?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    outcomes,cells};
}
