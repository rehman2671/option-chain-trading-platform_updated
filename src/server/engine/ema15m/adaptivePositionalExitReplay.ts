/**
 * Phase 7: offline LONG-option premium positional exit research.
 *
 * A stop/TRAIL breach is observed at one historical L1 quote, then an exit
 * may be HYPOTHETICALLY priced only at a later, independently recorded L1 bid
 * of sufficient displayed depth. No trigger-price fills, OHLC interpolation,
 * broker order commands, native stop assertions or live trading.
 *
 * Analysis considers previously PRICED fixed-hold OOS entries only. It does
 * NOT recover the missing exits excluded by the fixed-hold comparator; reported
 * samples are survivorship-biased until independently audited.
 */
import type { DeclaredTradingSession } from './adaptiveSessionIntegrity.js';
import type { HorizonBucket } from './adaptiveOptionRanker.js';
import type {
  HistoricalArm, HistoricalComparisonInput, HistoricalComparisonReport,
  HistoricalExecutableQuote, HistoricalTrade
} from './historicalAdaptiveComparison.js';

const HORIZONS: HorizonBucket[] = ['1W','2W','4W','8W'];
const DAY=86_400_000;
const MINUTE=60_000;
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const at=(s:string)=>Date.parse(s);
const istDay=(ms:number)=>new Date(ms+330*MINUTE).toISOString().slice(0,10);
const round=(x:number)=>Number(x.toFixed(2));
export type ExitTrigger = 'INITIAL_STOP' | 'TRAILING_GIVEBACK' | 'TIME_CAP';
export type PricedExitReason = ExitTrigger | 'ORIGINAL_FIXED_HOLD';
export type ExitReplayStatus = 'PRICED_HYPOTHETICAL_EXIT' | 'INCOMPLETE_PATH' |
  'TRIGGER_UNPRICED' | 'INVALID_POLICY';

export interface ExitHorizonPolicy {
  /** e.g. 0.20 means 20% of entry option ASK premium is initially at risk. */
  initialStopFraction: number;
  /** Percentage rise in observed option BID above entry ASK before trailing begins. */
  trailActivationFraction: number;
  /** After activation, trailing level = peak observed BID * (1 - fraction). */
  trailingGivebackFraction: number;
  /** Maximum calendar days; research-only earlier exit if a later quote exists. */
  maxHoldCalendarDays: number;
}
export interface AdaptiveExitReplayPolicy {
  schemaVersion: 'ADAPTIVE_OPTION_EXIT_REPLAY_V1';
  horizonRules: Record<HorizonBucket, ExitHorizonPolicy>;
  /** All specified by analyst before viewing OOS results; no built-in optimum. */
  minQuotesPerDeclaredSession: number;
  minIntermediateQuotes: number;
  maxSameSessionQuoteGapMinutes: number;
  /** Max gap from observing trigger to NEXT executable bid quote. */
  maxTriggerToNextQuoteMinutes: number;
}
export interface AdaptiveExitReplayTrade {
  foldIndex: number;
  arm: HistoricalArm;
  horizon: HorizonBucket;
  decisionAt: string;
  instrumentKey: string;
  entryAt: string;
  originalExitAt: string;
  originalNetPnlINR: number;
  status: ExitReplayStatus;
  reason: string;
  /** Threshold is informational; never priced as an order fill. */
  breachedStopLevel: number | null;
  triggerObservedAt: string | null;
  hypotheticalExitAt: string | null;
  hypotheticalExitBid: number | null;
  hypotheticalNetPnlINR: number | null;
  deltaVsOriginalINR: number | null;
  overnightTrigger: boolean;
  numberOfQuoteObservations: number;
}
export interface AdaptiveExitReplayCell {
  foldIndex: number;
  arm: HistoricalArm;
  horizon: HorizonBucket;
  originalPricedTradeCount: number;
  pairedPricedTradeCount: number;
  incompletePathCount: number;
  triggerUnpricedCount: number;
  earlyExitCount: number;
  originalFixedHoldCount: number;
  overnightTriggerCount: number;
  pairedDeltaNetINR: number | null;
  /* Requires ALL originally priced entries in this arm/horizon to be replayable. */
  comparable: boolean;
}
export interface AdaptiveExitReplayReport {
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  productionSafe: false;
  brokerageProtectionImplemented: false;
  historicalSourceAuthenticated: false;
  empiricalProfitabilityProven: false;
  status: 'REJECTED' | 'INCOMPLETE_EVIDENCE' | 'DESCRIPTIVE_ONLY';
  errors: string[];
  trades: AdaptiveExitReplayTrade[];
  cells: AdaptiveExitReplayCell[];
  warnings: string[];
}

const warnings = [
  'STOP_TRIGGER_IS_NOT_AN_ACKNOWLEDGED_NATIVE_BROKER_ORDER',
  'HYPOTHETICAL_NEXT_L1_BID_AND_DISPLAYED_DEPTH_DO_NOT_GUARANTEE_EXECUTION',
  'NO_INTRABAR_STOPS_OR_GAP_PRICE_INTERPOLATION',
  'REPLAY_GAP_CHECKS_ONLY_OBSERVED_QUOTES_NOT_UNOBSERVED_INTRASESSION_REVERSALS',
  'INCOMPLETE_PATHS_ARE_NOT_ASSIGNED_WIN_OR_ZERO_PNL',
  'FIXED_HOLD_COMPARATOR_ALREADY_EXCLUDES_ENTRIES_WITH_MISSING_EXIT_EVIDENCE',
  'REGIME_STRATEGY_OOS_EDGE_AND_PRODUCTION_SAFETY_NOT_ESTABLISHED'
];
export function validateAdaptiveExitReplayPolicy(policy: AdaptiveExitReplayPolicy): string[] {
  if (!policy || policy.schemaVersion!=='ADAPTIVE_OPTION_EXIT_REPLAY_V1' ||
      !policy.horizonRules ||
      !Number.isInteger(policy.minQuotesPerDeclaredSession) ||
      policy.minQuotesPerDeclaredSession<1 || policy.minQuotesPerDeclaredSession>1000 ||
      !Number.isInteger(policy.minIntermediateQuotes) ||
      policy.minIntermediateQuotes<1 || policy.minIntermediateQuotes>1000 ||
      !finite(policy.maxSameSessionQuoteGapMinutes) ||
      policy.maxSameSessionQuoteGapMinutes<1 ||
      policy.maxSameSessionQuoteGapMinutes>390 ||
      !finite(policy.maxTriggerToNextQuoteMinutes) ||
      policy.maxTriggerToNextQuoteMinutes<=0 ||
      policy.maxTriggerToNextQuoteMinutes>60) return ['INVALID_EXPLICIT_EXIT_POLICY'];
  for(const h of HORIZONS){
    const r=policy.horizonRules[h];
    if(!r || !finite(r.initialStopFraction) ||
       r.initialStopFraction<=0 || r.initialStopFraction>=1 ||
       !finite(r.trailActivationFraction) || r.trailActivationFraction<=0 ||
       r.trailActivationFraction>5 ||
       !finite(r.trailingGivebackFraction) ||
       r.trailingGivebackFraction<=0 || r.trailingGivebackFraction>=1 ||
       !Number.isInteger(r.maxHoldCalendarDays) ||
       r.maxHoldCalendarDays<1 || r.maxHoldCalendarDays>70)
      return ['INVALID_EXPLICIT_EXIT_POLICY'];
  }
  return [];
}
function withinDateRange(date:string,entry:number,exit:number):boolean{
  // A trading window intersects holding time even if entry and exit occur mid-session.
  return at(date+'T00:00:00Z') >= at(istDay(entry)+'T00:00:00Z') &&
    at(date+'T00:00:00Z') <= at(istDay(exit)+'T00:00:00Z');
}
function coverage(trade:HistoricalTrade,
  series:HistoricalExecutableQuote[],
  policy:AdaptiveExitReplayPolicy,
  sessions:DeclaredTradingSession[]|undefined):string|null{
  if(!Array.isArray(sessions) || sessions.length===0) return 'DECLARED_EXCHANGE_WINDOWS_REQUIRED';
  const bySession=new Map<string,DeclaredTradingSession>();
  for(const session of sessions){
    const open=at(session?.openAt),close=at(session?.closeAt);
    if(!session || !session.sessionDate || bySession.has(session.sessionDate) ||
       !Number.isFinite(open) || !Number.isFinite(close) || close<=open ||
       istDay(open)!==session.sessionDate || istDay(close)!==session.sessionDate)
      return 'INVALID_OR_DUPLICATE_DECLARED_EXCHANGE_SESSION';
    bySession.set(session.sessionDate,session);
  }
  // The optional exit replay must not upgrade a quote emitted outside the
  // declared session into an executable market observation.
  for(const q of series){
    const ms=at(q.observedAt);
    const session=bySession.get(istDay(ms));
    if(!session || !Number.isFinite(ms) ||
       ms<at(session.openAt) || ms>at(session.closeAt))
      return 'L1_OUTSIDE_DECLARED_EXCHANGE_SESSION';
  }
  const first=at(trade.entryAt),last=at(trade.exitAt);
  const relevant=sessions.filter(s=>s?.sessionDate&&withinDateRange(s.sessionDate,first,last));
  if(relevant.length===0) return 'HOLDING_SESSION_CALENDAR_MISSING';
  for(const s of relevant){
    const start=at(s.openAt),end=at(s.closeAt);
    if(!Number.isFinite(start) || !Number.isFinite(end) ||
       end<=start) return 'INVALID_DECLARED_EXCHANGE_SESSION';
    const overlapStart=Math.max(first,start),overlapEnd=Math.min(last,end);
    if(overlapEnd<overlapStart)continue;
    const dayQuotes=series.filter(q=>{
      const v=at(q.observedAt);
      return v>=overlapStart&&v<=overlapEnd;
    });
    if(dayQuotes.length<policy.minQuotesPerDeclaredSession)
      return 'SESSION_L1_OBSERVATION_COVERAGE_INSUFFICIENT';
    // Do not assert dense market observations based on a lone close/entry quote.
    for(let i=1;i<dayQuotes.length;i++){
      if(at(dayQuotes[i].observedAt)-at(dayQuotes[i-1].observedAt)>
        policy.maxSameSessionQuoteGapMinutes*MINUTE)
        return 'INTRASESSION_L1_GAP_EXCEEDS_DECLARED_LIMIT';
    }
  }
  if(series.length-2<policy.minIntermediateQuotes)
    return 'INSUFFICIENT_INTERMEDIATE_L1_OBSERVATIONS';
  return null;
}
function incomplete(trade:HistoricalTrade,foldIndex:number,status:ExitReplayStatus,
  reason:string,count:number,trigger: string|null=null,stop:number|null=null,
  overnight=false):AdaptiveExitReplayTrade{
  return{
    foldIndex,arm:trade.arm,horizon:trade.horizon,
    decisionAt:trade.decisionAt,instrumentKey:trade.instrumentKey,
    entryAt:trade.entryAt,originalExitAt:trade.exitAt,
    originalNetPnlINR:trade.netPnlINR,status,reason,
    breachedStopLevel:stop,triggerObservedAt:trigger,
    hypotheticalExitAt:null,hypotheticalExitBid:null,
    hypotheticalNetPnlINR:null,deltaVsOriginalINR:null,
    overnightTrigger:overnight,numberOfQuoteObservations:count
  };
}

/** The OOS replay is a SECONDARY DIAGNOSTIC of the original priced cohort. */
export function replayAdaptiveExitPaths(
  input: HistoricalComparisonInput,
  baseline: HistoricalComparisonReport,
  policy: AdaptiveExitReplayPolicy,
  declaredSessions?: DeclaredTradingSession[]
):AdaptiveExitReplayReport{
  const base:AdaptiveExitReplayReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    brokerageProtectionImplemented:false,historicalSourceAuthenticated:false,
    empiricalProfitabilityProven:false,status:'REJECTED',
    errors:[],trades:[],cells:[],warnings
  };
  const errors=validateAdaptiveExitReplayPolicy(policy);
  if(!input || !baseline || baseline.status==='INVALID_DATASET' ||
     baseline.datasetId!==input?.provenance?.datasetId ||
     baseline.synthetic!==input?.provenance?.synthetic)
    errors.push('INVALID_OR_UNMATCHED_BASELINE_DATASET');
  if(!Array.isArray(declaredSessions)||declaredSessions.length===0)
    errors.push('EXPLICIT_HOLDING_SESSION_CALENDAR_REQUIRED');
  if(errors.length)return{...base,errors};
  const quotesByKey=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of input.executionQuotes){
    if(!q || !Number.isFinite(at(q.observedAt)) || !q.instrumentKey){
      return {...base,errors:['INVALID_OR_UNDATED_OPTION_QUOTE']};
    }
    const arr=quotesByKey.get(q.instrumentKey)??[];
    arr.push(q);quotesByKey.set(q.instrumentKey,arr);
  }
  for(const qs of quotesByKey.values())
    qs.sort((a,b)=>at(a.observedAt)-at(b.observedAt));
  const allTrades:AdaptiveExitReplayTrade[]=[];
  const slip=input.policy.slippageBpsPerSide/10_000;
  for(let foldIndex=0;foldIndex<baseline.folds.length;foldIndex++){
    for(const metric of baseline.folds[foldIndex].outOfSample){
      for(const t of metric.trades){
        const started=at(t.entryAt),ended=at(t.exitAt);
        const q=(quotesByKey.get(t.instrumentKey)??[]).filter(o=>
          at(o.observedAt)>=started&&at(o.observedAt)<=ended);
        const reasons=[
          !Number.isFinite(started)||!Number.isFinite(ended)||ended<=started
            ?'INVALID_BASELINE_TRADE_CLOCK':null,
          !Number.isInteger(t.quantity)||t.quantity<=0||!finite(t.entryAsk)||
            t.entryAsk<=0?'INVALID_BASELINE_ENTRY':null,
          q.length===0||q[0].observedAt!==t.entryAt||
            q[q.length-1].observedAt!==t.exitAt||
            Math.abs(q[0].ask-t.entryAsk)>0.011||
            Math.abs(q[q.length-1].bid-t.exitBid)>0.011
            ?'ENTRY_OR_FIXED_EXIT_L1_MISMATCH':null,
          q.some((o,i)=>i>0 && at(o.observedAt)<=at(q[i-1].observedAt))
            ?'DUPLICATE_OR_UNSORTED_OPTION_L1':null,
          coverage(t,q,policy,declaredSessions)
        ].filter((v):v is string=>v!==null);
        if(reasons.length){
          allTrades.push(incomplete(t,foldIndex,'INCOMPLETE_PATH',reasons[0],q.length));
          continue;
        }
        const r=policy.horizonRules[t.horizon];
        let highWaterBid=q[0].bid;
        let stop=t.entryAsk*(1-r.initialStopFraction);
        let trailingActivated=false;
        let seenPrevious=q[0];
        let simulated:AdaptiveExitReplayTrade|null=null;
        const timeCap=started+r.maxHoldCalendarDays*DAY;
        // Stop is locked BEFORE seeing the current quote. Trail upgrades can
        // only affect SUBSEQUENT quotes. No price-bar high/low guessing.
        for(let i=1;i<q.length-1;i++){
          const current=q[i];
          const now=at(current.observedAt);
          const overnight=istDay(at(seenPrevious.observedAt))!==istDay(now);
          const initialBreach=current.bid<=stop;
          const timedOut=now>=timeCap;
          if(initialBreach||timedOut){
            const trigger:ExitTrigger=timedOut&&!initialBreach?'TIME_CAP':
              trailingActivated?'TRAILING_GIVEBACK':'INITIAL_STOP';
            const fill=q[i+1];
            const nextDelay=fill?at(fill.observedAt)-now:Infinity;
            if(!fill || nextDelay<=0 ||
               nextDelay>policy.maxTriggerToNextQuoteMinutes*MINUTE ||
               fill.bidQty<t.quantity){
              simulated=incomplete(t,foldIndex,'TRIGGER_UNPRICED',
                !fill?'NO_POST_TRIGGER_BID':
                nextDelay>policy.maxTriggerToNextQuoteMinutes*MINUTE
                  ?'POST_TRIGGER_BID_TOO_LATE':'POST_TRIGGER_BID_DEPTH_INSUFFICIENT',
                q.length,current.observedAt,initialBreach?round(stop):null,overnight);
            }else{
              const net=(fill.bid*(1-slip)-t.entryAsk*(1+slip))*t.quantity-
                2*input.policy.feesAndTaxesINRPerSide;
              const pnl=round(net);
              simulated={
                ...incomplete(t,foldIndex,'PRICED_HYPOTHETICAL_EXIT',trigger,
                  q.length,current.observedAt,initialBreach?round(stop):null,overnight),
                hypotheticalExitAt:fill.observedAt,hypotheticalExitBid:fill.bid,
                hypotheticalNetPnlINR:pnl,deltaVsOriginalINR:round(pnl-t.netPnlINR)
              };
            }
            break;
          }
          highWaterBid=Math.max(highWaterBid,current.bid);
          if(highWaterBid>=t.entryAsk*(1+r.trailActivationFraction)){
            trailingActivated=true;
            stop=Math.max(stop,highWaterBid*(1-r.trailingGivebackFraction));
          }
          seenPrevious=current;
        }
        if(!simulated){
          // No detectable early stop: original comparator exit is the only
          // observed evidence for the ORIGINAL FIXED HOLD, not a new rule.
          simulated={
            ...incomplete(t,foldIndex,'PRICED_HYPOTHETICAL_EXIT',
              'ORIGINAL_FIXED_HOLD',q.length),
            hypotheticalExitAt:t.exitAt,hypotheticalExitBid:t.exitBid,
            hypotheticalNetPnlINR:t.netPnlINR,deltaVsOriginalINR:0
          };
        }
        allTrades.push(simulated);
      }
    }
  }
  const cells:AdaptiveExitReplayCell[]=[];
  for(let foldIndex=0;foldIndex<baseline.folds.length;foldIndex++){
    const fold=baseline.folds[foldIndex];
    for(const metric of fold.outOfSample){
      const group=allTrades.filter(t=>t.foldIndex===foldIndex&&
        t.arm===metric.arm&&t.horizon===metric.horizon);
      const priced=group.filter(t=>t.status==='PRICED_HYPOTHETICAL_EXIT');
      const missing=group.filter(t=>t.status==='INCOMPLETE_PATH');
      const unpriced=group.filter(t=>t.status==='TRIGGER_UNPRICED');
      const matchedComplete=metric.tradeCount>0 &&
        priced.length===metric.tradeCount &&
        metric.unpricedEntries===0&&metric.unpricedExits===0;
      cells.push({
        foldIndex,arm:metric.arm,horizon:metric.horizon,
        originalPricedTradeCount:metric.tradeCount,
        pairedPricedTradeCount:priced.length,
        incompletePathCount:missing.length,
        triggerUnpricedCount:unpriced.length,
        earlyExitCount:priced.filter(t=>t.reason!=='ORIGINAL_FIXED_HOLD').length,
        originalFixedHoldCount:priced.filter(t=>t.reason==='ORIGINAL_FIXED_HOLD').length,
        overnightTriggerCount:group.filter(t=>t.overnightTrigger).length,
        pairedDeltaNetINR:priced.length
          ?round(priced.reduce((a,t)=>a+t.deltaVsOriginalINR!,0)):null,
        comparable:matchedComplete&&priced.length>=20
      });
    }
  }
  const complete=allTrades.length>0 &&
    allTrades.every(t=>t.status==='PRICED_HYPOTHETICAL_EXIT') &&
    baseline.folds.every(f=>f.completePriceEvidence);
  return {...base,status:complete?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    errors:[],trades:allTrades,cells};
}
