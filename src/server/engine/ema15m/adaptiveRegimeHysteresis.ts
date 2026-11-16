/**
 * Adaptive Swing v2 Phase 12: strictly OFFLINE market-state hysteresis.
 *
 * One source-attested/decision-time CLOSED underlying 15m candle observation
 * per declared exchange session. Confirmation counts actual observed
 * SEQUENTIAL session decisions, NOT index points, wall-clock days, option
 * premium ticks, future prices or already completed exits.
 *
 * A confirmed direction is only a research classification, NEVER an open
 * broker position or an executable order. Volatility, stale/omitted sessions,
 * transitions and reversal uncertainty all block NEW entries. No intraday
 * 15:15 square-off or live MIS/NRML order integration.
 */
import { analyzeAdaptiveRegime, type AdaptiveRegime } from './adaptiveMarketRegime.js';
import { compareAdaptiveHistorical, type HistoricalComparisonInput } from './historicalAdaptiveComparison.js';
import type { DeclaredTradingSession } from './adaptiveSessionIntegrity.js';
import type { HorizonBucket } from './adaptiveOptionRanker.js';

export type StabilizedSide='CE'|'PE'|'NO_TRADE';
export type HysteresisReason=
  'INITIAL_CONFIRMATION_PENDING'|'INITIAL_CONFIRMATION'|
  'CONFIRMED_DIRECTION_STABLE'|'OPPOSITE_CONFIRMATION_PENDING'|
  'REVERSAL_DWELL_NOT_SATISFIED'|'OPPOSITE_DIRECTION_CONFIRMED'|
  'POST_REVERSAL_COOLDOWN'|'NO_TREND_OR_TRANSITION'|
  'VOLATILITY_SHOCK_FREEZE'|'AFTER_SHOCK_FREEZE'|
  'MISSING_DECLARED_SESSION_RESET'|'CLOSED_CANDLE_EVIDENCE_STALE'|
  'NONMONOTONIC_OR_INCONSISTENT_OBSERVATION';
export interface HysteresisHorizonRule {
  initialConfirmations:number;
  oppositeConfirmations:number;
  minimumDwellObservedDecisions:number;
  freezeObservedDecisionsAfterShock:number;
  cooldownObservedDecisionsAfterReversal:number;
}
export interface HysteresisResearchPolicy {
  schemaVersion:'ADAPTIVE_REGIME_HYSTERESIS_V1';
  /** Underlying bar must be fully CLOSED and available by decision time. */
  maximumClosedCandleAgeMinutes:number;
  /** All are hypothesis parameters, chosen before looking at OOS output. */
  horizonRules:Record<HorizonBucket,HysteresisHorizonRule>;
}
export interface HysteresisObservation {
  decisionAt:string;
  latestClosedCandleEndAt:string;
  /** Index within the declared source calendar, not elapsed calendar days. */
  declaredSessionOrdinal:number;
  regime:AdaptiveRegime;
  rawSignal:StabilizedSide;
}
export interface HysteresisState {
  confirmedSide:StabilizedSide;
  pendingSide:'CE'|'PE'|null;
  pendingCount:number;
  decisionsSinceConfirmation:number;
  freezeRemaining:number;
  cooldownRemaining:number;
  lastDecisionAt:string|null;
  lastClosedCandleEndAt:string|null;
  lastSessionOrdinal:number|null;
}
export interface HysteresisStep {
  at:string;
  regime:AdaptiveRegime;
  rawSignal:StabilizedSide;
  confirmedSide:StabilizedSide;
  /** Advisory on whether a NEW option entry could be researched. */
  newEntryAdvisory:StabilizedSide;
  reason:HysteresisReason;
  confirmedOppositeFlip:boolean;
  rawOppositeFlip:boolean;
  frozen:boolean;
  state:HysteresisState;
}
export interface HysteresisFoldCell {
  foldIndex:number;
  horizon:HorizonBucket;
  testingDecisions:number;
  rawDirectionalObservations:number;
  rawOppositeFlips:number;
  confirmedOppositeFlips:number;
  newEntryAdvisories:number;
  blockedNewEntryDecisions:number;
  shockOrCooldownDecisions:number;
  invalidOrMissingSessionDecisions:number;
  /** Not a risk-adjusted PnL comparison, nor evidence of better returns. */
  churnReductionObserved:boolean;
}
export interface HysteresisResearchReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  brokerProtectionInstalled:false;
  empiricalProfitabilityProven:false;
  sourceAuthenticityIndependentlyVerified:false;
  calendarIndependentlyAuthenticated:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'DESCRIPTIVE_ONLY';
  errors:string[];
  warnings:string[];
  datasetId:string|null;
  synthetic:boolean|null;
  policy:HysteresisResearchPolicy|null;
  foldCells:HysteresisFoldCell[];
  /** Contains only index regime and advisories, no licensed option quotes. */
  observations:Array<{
    foldIndex:number;horizon:HorizonBucket;
    decisionAt:string;latestClosedCandleEndAt:string;
    regime:AdaptiveRegime;rawSignal:StabilizedSide;
    confirmedSide:StabilizedSide;newEntryAdvisory:StabilizedSide;
    reason:HysteresisReason;
  }>;
}
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const MS_MIN=60_000;
const validTs=(s:unknown):s is string=>
  typeof s==='string'&&/^\d{4}-\d\d-\d\dT/.test(s)&&
  /(Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
const date=(ts:number)=>new Date(ts+330*MS_MIN).toISOString().slice(0,10);
const validDate=(s:unknown):s is string=>
  typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&
  Number.isFinite(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const unsigned=(x:unknown,lo:number,hi:number)=>
  typeof x==='number'&&Number.isInteger(x)&&x>=lo&&x<=hi;
export function validateAdaptiveHysteresisPolicy(p:HysteresisResearchPolicy):string[]{
  if(!p||p.schemaVersion!=='ADAPTIVE_REGIME_HYSTERESIS_V1'||
     !unsigned(p.maximumClosedCandleAgeMinutes,0,120))
    return ['INVALID_HYSTERESIS_POLICY'];
  for(const h of HORIZONS){
    const r=p.horizonRules?.[h];
    if(!r||!unsigned(r.initialConfirmations,2,40)||
       !unsigned(r.oppositeConfirmations,2,40)||
       !unsigned(r.minimumDwellObservedDecisions,1,100)||
       !unsigned(r.freezeObservedDecisionsAfterShock,1,20)||
       !unsigned(r.cooldownObservedDecisionsAfterReversal,1,20))
      return ['INVALID_HYSTERESIS_HORIZON_RULE_'+h];
  }
  return [];
}
export function emptyAdaptiveHysteresisState():HysteresisState{
  return {
    confirmedSide:'NO_TRADE',pendingSide:null,pendingCount:0,
    decisionsSinceConfirmation:0,freezeRemaining:0,cooldownRemaining:0,
    lastDecisionAt:null,lastClosedCandleEndAt:null,lastSessionOrdinal:null
  };
}
const expectedRaw=(r:AdaptiveRegime):StabilizedSide=>
  r==='TREND_UP'?'CE':r==='TREND_DOWN'?'PE':'NO_TRADE';
const step=(at:HysteresisObservation,s:HysteresisState,
  reason:HysteresisReason,newEntryAdvisory:StabilizedSide,
  rawFlip:boolean,confirmedOppositeFlip:boolean):HysteresisStep=>({
  at:at.decisionAt,regime:at.regime,rawSignal:at.rawSignal,
  confirmedSide:s.confirmedSide,newEntryAdvisory,reason,
  confirmedOppositeFlip,rawOppositeFlip:rawFlip,
  frozen:reason==='VOLATILITY_SHOCK_FREEZE'||reason==='AFTER_SHOCK_FREEZE'||
    reason==='POST_REVERSAL_COOLDOWN',state:s
});
/** Deterministic step; raw flips are counted by the caller at OOS boundaries. */
export function applyAdaptiveHysteresisObservation(
  prior:HysteresisState,
  o:HysteresisObservation,
  rule:HysteresisHorizonRule,
  maximumClosedCandleAgeMinutes:number
):HysteresisStep {
  const t=Date.parse(o.decisionAt),end=Date.parse(o.latestClosedCandleEndAt);
  const priorT=Date.parse(prior.lastDecisionAt??'');
  const priorEnd=Date.parse(prior.lastClosedCandleEndAt??'');
  const invalid=!validTs(o.decisionAt)||!validTs(o.latestClosedCandleEndAt)||
    !unsigned(o.declaredSessionOrdinal,0,1000000)||
    !Number.isFinite(t)||!Number.isFinite(end)||
    (prior.lastDecisionAt!==null&&t<=priorT)||
    (prior.lastClosedCandleEndAt!==null&&end<=priorEnd)||
    (prior.lastSessionOrdinal!==null&&
      o.declaredSessionOrdinal<=prior.lastSessionOrdinal)||
    !['INSUFFICIENT_DATA','STALE_DATA','SIDEWAYS','VOLATILE',
      'TREND_UP','TREND_DOWN','TRANSITION'].includes(o.regime)||
    expectedRaw(o.regime)!==o.rawSignal;
  if(invalid)return step(o,{...emptyAdaptiveHysteresisState()},
    'NONMONOTONIC_OR_INCONSISTENT_OBSERVATION','NO_TRADE',false,false);
  const base:HysteresisState={
    ...prior,lastDecisionAt:o.decisionAt,
    lastClosedCandleEndAt:o.latestClosedCandleEndAt,
    lastSessionOrdinal:o.declaredSessionOrdinal,
    decisionsSinceConfirmation:Math.min(1000000,
      prior.decisionsSinceConfirmation+1)
  };
  // This is a lost-information reset for ENTRY advisories, not an exit or
  // an instruction to liquidate a *real* positional holding.
  if(end>t||t-end>maximumClosedCandleAgeMinutes*MS_MIN||
     o.regime==='INSUFFICIENT_DATA'||o.regime==='STALE_DATA')
    return step(o,{...base,confirmedSide:'NO_TRADE',
      pendingSide:null,pendingCount:0,freezeRemaining:0,cooldownRemaining:0},
      'CLOSED_CANDLE_EVIDENCE_STALE','NO_TRADE',false,false);
  if(prior.lastSessionOrdinal!==null&&
     o.declaredSessionOrdinal>prior.lastSessionOrdinal+1)
    return step(o,{...base,confirmedSide:'NO_TRADE',
      pendingSide:null,pendingCount:0,freezeRemaining:0,cooldownRemaining:0},
      'MISSING_DECLARED_SESSION_RESET','NO_TRADE',false,false);
  if(o.regime==='VOLATILE'){
    return step(o,{...base,pendingSide:null,pendingCount:0,
      freezeRemaining:rule.freezeObservedDecisionsAfterShock},
      'VOLATILITY_SHOCK_FREEZE','NO_TRADE',false,false);
  }
  if(base.freezeRemaining>0)
    return step(o,{...base,pendingSide:null,pendingCount:0,
      freezeRemaining:base.freezeRemaining-1},
      'AFTER_SHOCK_FREEZE','NO_TRADE',false,false);
  // Even an already confirmed trend cannot trigger a NEW entry while
  // reversal-cooldown evidence is being collected. No auto-exit implied.
  if(base.cooldownRemaining>0)
    return step(o,{...base,pendingSide:null,pendingCount:0,
      cooldownRemaining:base.cooldownRemaining-1},
      'POST_REVERSAL_COOLDOWN','NO_TRADE',false,false);
  if(o.rawSignal==='NO_TRADE'){
    return step(o,{...base,pendingSide:null,pendingCount:0},
      'NO_TREND_OR_TRANSITION','NO_TRADE',false,false);
  }
  if(base.confirmedSide===o.rawSignal)
    return step(o,{...base,pendingSide:null,pendingCount:0},
      'CONFIRMED_DIRECTION_STABLE',o.rawSignal,false,false);
  const nextCount=base.pendingSide===o.rawSignal?base.pendingCount+1:1;
  const isOpposite=base.confirmedSide!=='NO_TRADE';
  const required=isOpposite?rule.oppositeConfirmations:rule.initialConfirmations;
  const pending={...base,pendingSide:o.rawSignal,pendingCount:nextCount};
  if(nextCount<required)
    return step(o,pending,isOpposite?
      'OPPOSITE_CONFIRMATION_PENDING':'INITIAL_CONFIRMATION_PENDING',
      'NO_TRADE',false,false);
  if(isOpposite&&base.decisionsSinceConfirmation<
     rule.minimumDwellObservedDecisions)
    return step(o,pending,'REVERSAL_DWELL_NOT_SATISFIED',
      'NO_TRADE',false,false);
  const confirmed:HysteresisState={
    ...base,confirmedSide:o.rawSignal,pendingSide:null,pendingCount:0,
    decisionsSinceConfirmation:0,
    cooldownRemaining:isOpposite?
      rule.cooldownObservedDecisionsAfterReversal:0
  };
  return step(o,confirmed,isOpposite?
    'OPPOSITE_DIRECTION_CONFIRMED':'INITIAL_CONFIRMATION',
    isOpposite?'NO_TRADE':o.rawSignal,false,isOpposite);
}
function calendar(
  sessions:DeclaredTradingSession[]|undefined
):{ordered:string[];ordinals:Map<string,number>;windows:Map<string,{open:number;close:number}>}|null{
  if(!Array.isArray(sessions)||!sessions.length)return null;
  const ordered:string[]=[],ordinals=new Map<string,number>();
  const windows=new Map<string,{open:number;close:number}>();
  const ids=new Set<string>();
  for(const s of sessions){
    const op=Date.parse(s?.openAt),cl=Date.parse(s?.closeAt);
    if(!s||!validDate(s.sessionDate)||!validTs(s.openAt)||
       !validTs(s.closeAt)||!s.sourceRecordId?.trim()||
       ids.has(s.sourceRecordId)||ordinals.has(s.sessionDate)||
       (ordered.length&&s.sessionDate<=ordered[ordered.length-1])||
       !(op<cl)||cl-op>24*60*MS_MIN||
       date(op)!==s.sessionDate||date(cl)!==s.sessionDate)
      return null;
    ids.add(s.sourceRecordId);
    ordinals.set(s.sessionDate,ordered.length);
    windows.set(s.sessionDate,{open:op,close:cl});
    ordered.push(s.sessionDate);
  }
  return {ordered,ordinals,windows};
}
/**
 * All signals are RECOMPUTED from the original index CLOSED-candle history,
 * never passed in as claimed wins. The sampler uses exactly the originally
 * observed decisionAt (normally once per trading session) rather than
 * simulating ticks or assuming non-existent 15m decision records.
 */
export function replayAdaptiveRegimeHysteresis(
  input:HistoricalComparisonInput,
  declaredSessions:DeclaredTradingSession[]|undefined,
  policy:HysteresisResearchPolicy
):HysteresisResearchReport{
  const base:HysteresisResearchReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    brokerProtectionInstalled:false,empiricalProfitabilityProven:false,
    sourceAuthenticityIndependentlyVerified:false,
    calendarIndependentlyAuthenticated:false,
    status:'REJECTED',errors:[],warnings:[
      'RESEARCH_SIGNAL_ONLY_NO_LIVE_OR_PAPER_ORDER_AUTHORIZATION',
      'HORIZONS_ARE_EXPIRY_BUCKETS_NOT_MANDATED_HOLDING_DURATIONS',
      'ORIGINAL_SAMPLED_DECISIONS_NOT_EVERY_INTRADAY_15M_BAR',
      'NO_AUTO_EXIT_ON_SHOCK_REVERSAL_MISSING_DATA_OR_15_15',
      'STABILIZED_SIGNAL_DOES_NOT_PROVE_BETTER_OUT_OF_SAMPLE_RETURNS',
      'INDEPENDENT_EXCHANGE_CALENDAR_AND_EVENT_CLOCK_REVIEW_STILL_REQUIRED'
    ],
    datasetId:input?.provenance?.datasetId??null,
    synthetic:input?.provenance?.synthetic??null,policy:null,
    foldCells:[],observations:[]
  };
  const errors=validateAdaptiveHysteresisPolicy(policy);
  const declared=calendar(declaredSessions);
  if(!declared)errors.push('OFFICIAL_DECLARED_SESSION_WINDOWS_REQUIRED');
  const validation=input?compareAdaptiveHistorical(input):null;
  if(!validation||validation.status==='INVALID_DATASET')
    errors.push(...(validation?.errors??['INVALID_HISTORICAL_DECISION_DATASET']));
  if(errors.length)return {...base,errors:[...new Set(errors)]};
  const orig=input.decisions;
  for(const d of orig){
    const now=Date.parse(d.decisionAt);
    const last=d.candles[d.candles.length-1];
    const started=Date.parse(last?.timestamp??'');
    const window=declared!.windows.get(d.sessionDate);
    if(!window||!validTs(d.decisionAt)||!validTs(last?.timestamp)||
       date(now)!==d.sessionDate||now<window.open||now>window.close||
       !Number.isFinite(started)||started+15*MS_MIN>now||
       date(started+15*MS_MIN)!==d.sessionDate)
      return {...base,errors:['INVALID_OR_MISSING_SOURCE_DECISION_CLOSED_CANDLE_WINDOW']};
  }
  const observations:HysteresisResearchReport['observations']=[];
  const foldCells:HysteresisFoldCell[]=[];
  for(let foldIndex=0;foldIndex<input.policy.folds.length;foldIndex++){
    const f=input.policy.folds[foldIndex];
    const rows=orig.filter(d=>d.sessionDate<=f.testEnd);
    const states=new Map<HorizonBucket,HysteresisState>(
      HORIZONS.map(h=>[h,emptyAdaptiveHysteresisState()])
    );
    const rawLast=new Map<HorizonBucket,'CE'|'PE'>();
    const counters=new Map<HorizonBucket,{
      decisions:number;directional:number;rawFlip:number;confirmedFlip:number;
      advised:number;shockOrCooldown:number;invalid:number;
    }>(HORIZONS.map(h=>[h,{
      decisions:0,directional:0,rawFlip:0,confirmedFlip:0,
      advised:0,shockOrCooldown:0,invalid:0
    }]));
    for(const d of rows){
      const latest=d.candles[d.candles.length-1];
      const closing=new Date(Date.parse(latest.timestamp)+15*MS_MIN).toISOString();
      const regime=analyzeAdaptiveRegime(d.candles,new Date(d.decisionAt));
      const obs:HysteresisObservation={
        decisionAt:d.decisionAt,latestClosedCandleEndAt:closing,
        declaredSessionOrdinal:declared!.ordinals.get(d.sessionDate)!,
        regime:regime.regime,rawSignal:regime.candidateSignal
      };
      const isTest=d.sessionDate>=f.testStart;
      for(const horizon of HORIZONS){
        const previous=states.get(horizon)!;
        const next=applyAdaptiveHysteresisObservation(
          previous,obs,policy.horizonRules[horizon],
          policy.maximumClosedCandleAgeMinutes
        );
        states.set(horizon,next.state);
        if(!isTest)continue;
        const count=counters.get(horizon)!;
        count.decisions++;
        const raw=obs.rawSignal;
        let rawFlip=false;
        if(raw!=='NO_TRADE'){
          count.directional++;
          rawFlip=rawLast.has(horizon)&&rawLast.get(horizon)!==raw;
          rawLast.set(horizon,raw);
          if(rawFlip)count.rawFlip++;
        }
        if(next.confirmedOppositeFlip)count.confirmedFlip++;
        if(next.newEntryAdvisory!=='NO_TRADE')count.advised++;
        if(next.frozen)count.shockOrCooldown++;
        if(['MISSING_DECLARED_SESSION_RESET','CLOSED_CANDLE_EVIDENCE_STALE',
          'NONMONOTONIC_OR_INCONSISTENT_OBSERVATION'].includes(next.reason))
          count.invalid++;
        observations.push({
          foldIndex,horizon,decisionAt:d.decisionAt,
          latestClosedCandleEndAt:closing,regime:obs.regime,
          rawSignal:raw,confirmedSide:next.confirmedSide,
          newEntryAdvisory:next.newEntryAdvisory,reason:next.reason
        });
      }
    }
    for(const horizon of HORIZONS){
      const c=counters.get(horizon)!;
      foldCells.push({
        foldIndex,horizon,testingDecisions:c.decisions,
        rawDirectionalObservations:c.directional,
        rawOppositeFlips:c.rawFlip,
        confirmedOppositeFlips:c.confirmedFlip,
        newEntryAdvisories:c.advised,
        blockedNewEntryDecisions:c.decisions-c.advised,
        shockOrCooldownDecisions:c.shockOrCooldown,
        invalidOrMissingSessionDecisions:c.invalid,
        churnReductionObserved:c.rawFlip>c.confirmedFlip
      });
    }
  }
  const complete=foldCells.length>0&&foldCells.every(c=>
    c.testingDecisions>0&&c.invalidOrMissingSessionDecisions===0);
  return {...base,status:complete?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    errors:[],policy,foldCells,observations};
}
