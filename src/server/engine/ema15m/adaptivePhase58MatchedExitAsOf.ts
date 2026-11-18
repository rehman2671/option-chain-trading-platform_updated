/**
 * Adaptive Swing v2 Phase58: ORIGINAL entry-first OOS exit as-of availability
 * vs Phase57 full-debit risk and a separately pinned HOLDING-PERIOD calendar.
 *
 * Phase8's hypothetical next observed BID is NOT a fill. Phase50/51 validate
 * the entry; Phase58 adds original quote-availability and session coverage
 * THROUGH the existing Phase8 trigger and its next BID, with no new exit
 * timing, threshold tuning, broker/GTT orders or positional 15:15 exit.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase57RegimeHorizonDebitRisk,
  type Phase57Input,type Phase57IndependentPins,
  type Phase57Report, type Phase57RegimeHorizonCell
} from './adaptivePhase57RegimeHorizonDebitRisk.js';
import {
  runAdaptiveEntryFirstExitStudy, type EntryFirstExitOutcome,
  type EntryFirstExitStudy
} from './adaptiveEntryFirstExitStudy.js';
import type {AdaptiveExitReplayPolicy} from './adaptivePositionalExitReplay.js';
import type {DeclaredTradingSession} from './adaptiveSessionIntegrity.js';
import type {HistoricalArm, HistoricalExecutableQuote} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';
import {analyzeAdaptiveRegime,type AdaptiveRegime} from './adaptiveMarketRegime.js';
import type {CohortDecision} from './adaptiveEntryFirstCohort.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const SHA=/^[0-9a-f]{64}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const hash=(x:unknown):string=>createHash('sha256')
  .update(JSON.stringify(x)).digest('hex');
const ms=(x:unknown):number=>typeof x==='string'&&TIME.test(x)?
  Date.parse(x):NaN;
const date=(t:number):string=>new Date(t+330*60000).toISOString().slice(0,10);
const round=(n:number)=>Number(n.toFixed(2));
const safeInteger=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const equal=(a:unknown,b:unknown):boolean=>
  typeof a==='string'&&typeof b==='string'&&
  SHA.test(a)&&SHA.test(b)&&a===b;
const key=(a:{foldIndex:number;arm:HistoricalArm;
  horizon:HorizonBucket;decisionAt:string}):string=>
  [a.foldIndex,a.arm,a.horizon,a.decisionAt].join('|');
const cellKey=(r:{regime:AdaptiveRegime;arm:HistoricalArm;
  horizon:HorizonBucket}):string=>
  [r.regime,r.arm,r.horizon].join('|');
export const hashPhase58Evidence=hash;

export interface Phase58Input{
  schemaVersion:'ADAPTIVE_PHASE58_ORIGINAL_HOLD_PATH_ASOF_JOIN_V1';
  source:'OFFLINE_UNVERIFIED_L1_HOLD_PATH_ARCHIVE';
  phase57:Phase57Input;
  phase57Pins:Phase57IndependentPins;
  /** Precisely the Phase8 exit policy; no adaptive hindsight retuning. */
  exitPolicy:AdaptiveExitReplayPolicy;
  /** Independent original calendar including AFTER final OOS entry date. */
  exitSessions:DeclaredTradingSession[];
}
export interface Phase58IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE58_HOLD_PATH_ASOF_AND_EXIT_PINS_V1';
  expectedPhase57InputSha256:string;
  expectedPhase57PinsSha256:string;
  expectedExitPolicySha256:string;
  expectedExitSessionLedgerSha256:string;
  expectedOosSessionCount:number;
  expectedFullOosArmHorizonAttempts:number;
  /** No REST timestamp substitution for recorded original source availableAt. */
  maximumOriginalQuoteEventToAvailabilitySeconds:number;
}
export interface Phase58RegimeHorizonExitCell{
  regime:AdaptiveRegime;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  allOriginalOosDecisionAttempts:number;
  originalObservedEntries:number;
  nonEntriesIncludingMissingSource:number;
  pricedNextAvailableBidExits:number;
  incompleteOrUnpricedExits:number;
  unavailableOriginalHoldingL1Paths:number;
  sourceAvailableAtOutOfOrderPaths:number;
  observedAdverseOvernightBidGaps:number;
  sourceObservedOvernightGapStopTriggers:number;
  originalPremiumDebitPlusAssumedFeesINR:number;
  /** Null if ANY entered path is incomplete or no original entry exists. */
  originalExitNextBidHypotheticalPnlINR:number|null;
  /** Original bounded loss budget, NOT a reliable historical stop. */
  fullPremiumDebitIsAtRiskEvenWithStop:true;
  alternativeArmNotAnIndependentFill:true;
}
export interface Phase58Report{
  mode:'OFFLINE_ORIGINAL_OOS_HOLD_PATH_L1_AVAILABLE_AT_EXIT_DEBIT_JOIN';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_SINGLE_REGIME_EXIT_RISK_ONLY'|
    'DESCRIPTIVE_MULTIREGIME_EXIT_RISK_ONLY'|
    'DESCRIPTIVE_LONG_PREMIUM_RISK_ALERT_ONLY';
  reasonCodes:string[];
  syntheticDataset:boolean|null;
  phase57Status:Phase57Report['status']|null;
  phase8ExitStatus:EntryFirstExitStudy['status']|null;
  originalOosSessions:number;
  fullOriginalArmHorizonAttempts:number;
  observedOriginalEntries:number;
  fullyAvailabilityAuditedAndPricedExitEntries:number;
  missingOriginalSelectedEntryL1Attempts:number;
  censoredOrUnpricedExitEntries:number;
  invalidOrNoncausalOriginalQuoteAvailabilityPaths:number;
  observedAdverseOvernightBidGapTransitions:number;
  originalPhase8OvernightGapTriggers:number;
  originalUnpricedPathsNotAssumedToBeZero:true;
  cells:Phase58RegimeHorizonExitCell[];
  originalLicensedOptionL1Authenticated:false;
  independentlyVerifiedSessionExpiryCalendar:false;
  vendorSourceAvailableAtAuthenticated:false;
  brokerMarketOrderFillOrStopAckVerified:false;
  stopTriggerGuaranteedToLimitLoss:false;
  historicalReturnForecastOrProfitableRankingProven:false;
  genuineIvThetaVegaRiskDecompositionVerified:false;
  liveNrmlOrderAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'ORIGINAL_PHASE8_EXIT_TIME_IS_FROZEN_BEFORE_PHASE58_AVAILABILITY_CHECK',
  'ORIGINAL_SOURCE_QUOTE_EVENT_AND_AVAILABILITY_TIMES_ARE_NOT_VENDOR_AUTHENTICATED',
  'ORIGINAL_NEXT_L1_BID_AT_VALID_TIME_IS_NOT_AN_EXECUTED_EXIT_OR_STOP_ORDER',
  'NO_HINDSIGHT_SWITCH_TO_LATER_FAVORABLE_CONTRACT_OR_BID',
  'MISSING_EGRESS_QUOTES_AND_OUT_OF_ORDER_QUOTE_AVAILABILITY_ARE_CENSORED',
  'L1_QUOTE_GAPS_MAY_CONCEAL_EARLIER_UNOBSERVED_OPTION_PRICE_REVERSALS',
  'ORIGINAL_OPTION_BID_PREMIUM_IS_NOT_THE_INDEX_POINT_TARGET',
  'ONLY_ORIGINAL_PHASE8_OBSERVED_GAP_TRIGGERS_NOT_UNKNOWN_OVERNIGHT_FILLED_STOPS',
  'ALTERNATIVE_ARMS_CANNOT_BE_MULTIPLIED_AS_THREE_INDEPENDENT_FILLS',
  'ORIGINAL_MARKET_REGIME_SOURCE_IS_NOT_INDEPENDENTLY_VERIFIED',
  'MISSING_ORIGINAL_LICENSED_L1_AND_REAL_OFFICIAL_EXPIRY_CALENDAR',
  'NO_FORCED_15_15_POSITIONAL_EXIT_AND_NO_LIVE_NRML_GTT'
];
const blank=():Phase58Report=>({
  mode:'OFFLINE_ORIGINAL_OOS_HOLD_PATH_L1_AVAILABLE_AT_EXIT_DEBIT_JOIN',
  status:'INVALID_EVIDENCE',reasonCodes:[],syntheticDataset:null,
  phase57Status:null,phase8ExitStatus:null,
  originalOosSessions:0,fullOriginalArmHorizonAttempts:0,
  observedOriginalEntries:0,
  fullyAvailabilityAuditedAndPricedExitEntries:0,
  missingOriginalSelectedEntryL1Attempts:0,
  censoredOrUnpricedExitEntries:0,
  invalidOrNoncausalOriginalQuoteAvailabilityPaths:0,
  observedAdverseOvernightBidGapTransitions:0,
  originalPhase8OvernightGapTriggers:0,
  originalUnpricedPathsNotAssumedToBeZero:true,
  cells:[],
  originalLicensedOptionL1Authenticated:false,
  independentlyVerifiedSessionExpiryCalendar:false,
  vendorSourceAvailableAtAuthenticated:false,
  brokerMarketOrderFillOrStopAckVerified:false,
  stopTriggerGuaranteedToLimitLoss:false,
  historicalReturnForecastOrProfitableRankingProven:false,
  genuineIvThetaVegaRiskDecompositionVerified:false,
  liveNrmlOrderAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const bad=(reason:string,status:Phase58Report['status']='INVALID_EVIDENCE',
  fields?:Partial<Phase58Report>):Phase58Report=>({
  ...blank(),...fields,status,reasonCodes:[reason]
});
function calendar(sessions:DeclaredTradingSession[],
  original:Phase58Input['phase57']['phase51']['calendar']['sessions']
):Map<string,{open:number;close:number}>|null{
  if(!Array.isArray(sessions)||sessions.length<2)return null;
  const map=new Map<string,{open:number;close:number}>();
  let last='';
  for(const session of sessions){
    const open=ms(session?.openAt),close=ms(session?.closeAt);
    if(!session||!session.sourceRecordId?.trim()||
      typeof session.sessionDate!=='string'||
      session.sessionDate<=last||
      !Number.isFinite(open)||!Number.isFinite(close)||
      close<=open||close-open>24*3600000||
      date(open)!==session.sessionDate||date(close)!==session.sessionDate)
      return null;
    map.set(session.sessionDate,{open,close});
    last=session.sessionDate;
  }
  // The independently anchored entry ledger is a strict SUBSET of the
  // extended hold-path calendar. Cannot replace an original OOS session.
  for(const s of original){
    const row=sessions.find(x=>x.sessionDate===s.sessionDate);
    if(!row||row.openAt!==s.openAt||
      row.closeAt!==s.closeAt||row.sourceRecordId!==s.sourceRecordId)
      return null;
  }
  return map;
}
type AsOfResult={valid:boolean;adverseOvernight:number;reason:string};
function auditSourcePath(
  a:CohortDecision,outcome:EntryFirstExitOutcome|undefined,
  quotes:HistoricalExecutableQuote[],
  sessions:Map<string,{open:number;close:number}>,
  maximumLagSeconds:number,
  triggerToNextQuoteMinutes:number
):AsOfResult{
  const fail=(reason:string):AsOfResult=>({
    valid:false,adverseOvernight:0,reason
  });
  if(!a.entryAt||!a.instrumentKey||
    !outcome||outcome.status!=='PRICED_EXIT'||
    !outcome.triggerObservedAt||!outcome.nextQuoteAt||
    outcome.instrumentKey!==a.instrumentKey||
    outcome.entryAt!==a.entryAt||
    outcome.entryAsk!==a.entryAsk||
    outcome.quantity!==a.quantity||
    typeof outcome.hypotheticalNetPnlINR!=='number'||
    !Number.isFinite(outcome.hypotheticalNetPnlINR))
    return fail('UNPRICED_ORIGINAL_PHASE8_EXIT');
  const start=ms(a.entryAt),
    trigger=ms(outcome.triggerObservedAt),
    last=ms(outcome.nextQuoteAt);
  if(!Number.isFinite(start)||!Number.isFinite(trigger)||
    !Number.isFinite(last)||trigger<=start||last<=trigger)
    return fail('INVALID_ORIGINAL_EXIT_EVENT_WINDOW');
  const series=quotes.filter(q=>q.instrumentKey===a.instrumentKey&&
    ms(q.observedAt)>=start&&ms(q.observedAt)<=last)
    .sort((a,b)=>ms(a.observedAt)-ms(b.observedAt));
  if(series.length<2||series[0].observedAt!==a.entryAt||
    series[series.length-1].observedAt!==outcome.nextQuoteAt)
    return fail('INCOMPLETE_ORIGINAL_HOLDING_L1_SERIES');
  let priorEvent=-Infinity,priorAvailable=-Infinity,prior:
    HistoricalExecutableQuote|undefined;
  let gap=0;
  for(const q of series){
    const observed=ms(q.observedAt),available=ms(q.availableAt),
      session=sessions.get(date(observed));
    if(!session||observed<session.open||observed>session.close)
      return fail('ORIGINAL_HOLD_QUOTE_OUTSIDE_DECLARED_SESSION');
    if(!Number.isFinite(available)||available<observed||
      available-observed>maximumLagSeconds*1000||
      observed<=priorEvent||available<priorAvailable)
      return fail('ORIGINAL_HOLD_PATH_UNAUTHENTICATED_OR_OUT_OF_ORDER_ASOF');
    if(prior&&date(ms(prior.observedAt))!==date(observed)&&
      q.bid<prior.bid)gap++;
    prior=q;priorEvent=observed;priorAvailable=available;
  }
  const t=series.find(q=>q.observedAt===outcome.triggerObservedAt);
  const x=series.at(-1)!;
  const trigAvail=ms(t?.availableAt);
  const exitAvail=ms(x.availableAt);
  if(!t||!Number.isFinite(trigAvail)||
    trigAvail>=exitAvail||
    exitAvail>trigger+triggerToNextQuoteMinutes*60000||
    !Number.isFinite(x.bid)||!Number.isFinite(x.bidQty)||
    x.bid!==outcome.hypotheticalExitBid||
    x.bidQty<(a.quantity??Infinity))
    return fail('NEXT_OBSERVED_EXIT_BID_NOT_CAUSALLY_AVAILABLE');
  return {valid:true,adverseOvernight:gap,reason:''};
}
export function auditPhase58MatchedOriginalExitAvailability(
  input:Phase58Input,pins:Phase58IndependentPins
):Phase58Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE58_ORIGINAL_HOLD_PATH_ASOF_JOIN_V1'||
    input.source!=='OFFLINE_UNVERIFIED_L1_HOLD_PATH_ARCHIVE'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE58_HOLD_PATH_ASOF_AND_EXIT_PINS_V1'||
    !input.phase57||!input.phase57Pins||!input.exitPolicy||
    !equal(pins.expectedPhase57InputSha256,hash(input.phase57))||
    !equal(pins.expectedPhase57PinsSha256,hash(input.phase57Pins))||
    !equal(pins.expectedExitPolicySha256,hash(input.exitPolicy))||
    !equal(pins.expectedExitSessionLedgerSha256,hash(input.exitSessions))||
    !safeInteger(pins.expectedOosSessionCount,2,100000)||
    pins.expectedFullOosArmHorizonAttempts!==
      pins.expectedOosSessionCount*12||
    !safeInteger(pins.maximumOriginalQuoteEventToAvailabilitySeconds,0,300))
    return bad('PHASE58_FROZEN_SOURCE_EXIT_POLICY_OR_EXTENDED_CALENDAR_PINS_INVALID');
  const sessions=calendar(input.exitSessions,
    input.phase57.phase51.calendar.sessions);
  if(!sessions)return bad('EXTENDED_ORIGINAL_HOLD_CALENDAR_MISSING_OR_CHANGED');
  let debit:Phase57Report, exits:EntryFirstExitStudy;
  try{
    debit=auditPhase57RegimeHorizonDebitRisk(
      input.phase57,input.phase57Pins);
  }catch{
    return bad('PHASE57_ORIGINAL_RISK_REAUDIT_EXCEPTION',
      'INCOMPLETE_EVIDENCE');
  }
  const partial:Partial<Phase58Report>={
    syntheticDataset:debit.syntheticDataset,
    phase57Status:debit.status,
    originalOosSessions:debit.oosSessions,
    fullOriginalArmHorizonAttempts:debit.attemptedArmHorizonDecisions
  };
  if(!debit.status.startsWith('DESCRIPTIVE_')||
    debit.originalUnpricedSelectedOptionEntries!==0||
    debit.missingOrAmbiguousOriginalQuoteBindings!==0||
    debit.oosSessions!==pins.expectedOosSessionCount||
    debit.attemptedArmHorizonDecisions!==
      pins.expectedFullOosArmHorizonAttempts)
    return bad('PHASE57_ORIGINAL_REGIME_AND_ENTRY_RISK_SOURCE_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  const source=input.phase57.phase51.phase50.historical;
  try{
    exits=runAdaptiveEntryFirstExitStudy(
      source,input.exitPolicy,input.exitSessions);
  }catch{
    return bad('PHASE8_ORIGINAL_EXIT_REPLAY_EXCEPTION',
      'INCOMPLETE_EVIDENCE',partial);
  }
  partial.phase8ExitStatus=exits.status;
  if(exits.status==='REJECTED'||
    exits.cohort.status!=='ENTRY_COHORT_RECORDED'||
    exits.cohort.attempts.length!==pins.expectedFullOosArmHorizonAttempts)
    return bad('PHASE8_ORIGINAL_ENTRY_FIRST_EXIT_REPLAY_REJECTED',
      'INCOMPLETE_EVIDENCE',partial);
  const outcomes=new Map<string,EntryFirstExitOutcome>();
  for(const o of exits.outcomes){
    const k=key(o);
    if(outcomes.has(k))return bad('DUPLICATED_ORIGINAL_EXIT_OUTCOME',
      'INCOMPLETE_EVIDENCE',partial);
    outcomes.set(k,o);
  }
  const cells=new Map<string,Phase58RegimeHorizonExitCell>();
  const riskCells=new Map<string,Phase57RegimeHorizonCell>(
    debit.perRegimeHorizonArm.map(x=>[cellKey(x),x]));
  const decisionRegimes=new Map(source.decisions.map(d=>[
    d.decisionAt,analyzeAdaptiveRegime(d.candles,new Date(ms(d.decisionAt))).regime
  ]));
  const seen=new Set<string>();
  let entries=0,priced=0,missingEntry=0,censored=0,
    invalid=0,adverse=0,overnight=0;
  const reasonSet=new Set<string>();
  for(const a of exits.cohort.attempts){
    const k=key(a),regime=decisionRegimes.get(a.decisionAt);
    if(seen.has(k)||!regime||!HORIZONS.includes(a.horizon)||
      !ARMS.includes(a.arm))
      return bad('INVALID_OR_REPEATED_ORIGINAL_OOS_EXIT_ATTEMPT',
        'INCOMPLETE_EVIDENCE',partial);
    seen.add(k);
    const ckey=[regime,a.arm,a.horizon].join('|');
    let cell=cells.get(ckey);
    if(!cell){
      cell={regime,arm:a.arm,horizon:a.horizon,
        allOriginalOosDecisionAttempts:0,originalObservedEntries:0,
        nonEntriesIncludingMissingSource:0,pricedNextAvailableBidExits:0,
        incompleteOrUnpricedExits:0,
        unavailableOriginalHoldingL1Paths:0,
        sourceAvailableAtOutOfOrderPaths:0,
        observedAdverseOvernightBidGaps:0,
        sourceObservedOvernightGapStopTriggers:0,
        originalPremiumDebitPlusAssumedFeesINR:0,
        originalExitNextBidHypotheticalPnlINR:0,
        fullPremiumDebitIsAtRiskEvenWithStop:true,
        alternativeArmNotAnIndependentFill:true};
      cells.set(ckey,cell);
    }
    cell.allOriginalOosDecisionAttempts++;
    if(a.disposition==='MISSING_EXECUTABLE_ENTRY_L1'){
      missingEntry++;cell.nonEntriesIncludingMissingSource++;
      cell.originalExitNextBidHypotheticalPnlINR=null;
      continue;
    }
    if(a.disposition!=='ENTRY_OBSERVED'){
      cell.nonEntriesIncludingMissingSource++;
      continue;
    }
    entries++;cell.originalObservedEntries++;
    const rule=input.phase57.policy.horizonRules[a.horizon],
      debitR=(a.entryAsk??NaN)*(a.quantity??NaN)+
        rule.assumedNonRecoverableEntryAndExitCostsINR;
    if(!Number.isFinite(debitR)||debitR<=0)
      return bad('NONFINITE_ORIGINAL_ENTRY_FULL_DEBIT',
        'INCOMPLETE_EVIDENCE',partial);
    cell.originalPremiumDebitPlusAssumedFeesINR+=debitR;
    const o=outcomes.get(k);
    if(o?.overnightGapAtTrigger){
      overnight++;cell.sourceObservedOvernightGapStopTriggers++;
    }
    const audit=auditSourcePath(
      a,o,source.executionQuotes,sessions,
      pins.maximumOriginalQuoteEventToAvailabilitySeconds,
      input.exitPolicy.maxTriggerToNextQuoteMinutes);
    if(!audit.valid){
      censored++;cell.incompleteOrUnpricedExits++;
      cell.originalExitNextBidHypotheticalPnlINR=null;
      if(o?.status==='PRICED_EXIT'){
        invalid++;
        cell.sourceAvailableAtOutOfOrderPaths++;
      }else{
        cell.unavailableOriginalHoldingL1Paths++;
      }
      reasonSet.add(audit.reason);
      continue;
    }
    priced++;cell.pricedNextAvailableBidExits++;
    adverse+=audit.adverseOvernight;
    cell.observedAdverseOvernightBidGaps+=audit.adverseOvernight;
    if(cell.originalExitNextBidHypotheticalPnlINR!==null)
      cell.originalExitNextBidHypotheticalPnlINR+=
        o!.hypotheticalNetPnlINR!;
  }
  const outCells=[...cells.values()].map(c=>({
    ...c,
    originalPremiumDebitPlusAssumedFeesINR:
      round(c.originalPremiumDebitPlusAssumedFeesINR),
    originalExitNextBidHypotheticalPnlINR:
      c.originalExitNextBidHypotheticalPnlINR===null?null:
      c.originalObservedEntries===0?null:
      round(c.originalExitNextBidHypotheticalPnlINR)
  }));
  for(const c of outCells){
    const risk=riskCells.get(cellKey(c));
    if(!risk||
      risk.originalDecisionAttempts!==c.allOriginalOosDecisionAttempts||
      risk.entryObservedCount!==c.originalObservedEntries||
      Math.abs(risk.totalHypotheticalFullDebitLossPlusCostsINR-
        c.originalPremiumDebitPlusAssumedFeesINR)>0.05)
      reasonSet.add('ORIGINAL_PHASE57_REGIME_DEBIT_EXIT_COHORT_NOT_IDENTICAL');
  }
  const report:Phase58Report={
    ...blank(),...partial,
    observedOriginalEntries:entries,
    fullyAvailabilityAuditedAndPricedExitEntries:priced,
    missingOriginalSelectedEntryL1Attempts:missingEntry,
    censoredOrUnpricedExitEntries:censored,
    invalidOrNoncausalOriginalQuoteAvailabilityPaths:invalid,
    observedAdverseOvernightBidGapTransitions:adverse,
    originalPhase8OvernightGapTriggers:overnight,
    cells:outCells
  };
  if(seen.size!==pins.expectedFullOosArmHorizonAttempts||
    outCells.reduce((n,c)=>n+c.allOriginalOosDecisionAttempts,0)!==
      pins.expectedFullOosArmHorizonAttempts||
    entries+missingEntry+outCells.reduce((n,c)=>
      n+c.nonEntriesIncludingMissingSource,0)-missingEntry!==
      pins.expectedFullOosArmHorizonAttempts||
    priced+censored!==entries)
    reasonSet.add('ORIGINAL_FULL_12_WAY_EXIT_COHORT_DENOMINATOR_MISMATCH');
  if(censored||missingEntry)
    reasonSet.add('ORIGINAL_EXIT_PATH_OR_SOURCE_AVAILABILITY_UNPRICED');
  if(reasonSet.size)
    return {...report,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:[...reasonSet]};
  if(debit.singleEntryDebitBudgetBreaches||
    debit.combinedFourHorizonDebitBudgetBreaches)
    return {...report,status:'DESCRIPTIVE_LONG_PREMIUM_RISK_ALERT_ONLY',
      reasonCodes:['PHASE57_PREDECLARED_FULL_DEBIT_CASH_BUDGET_BREACH']};
  return {...report,status:debit.distinctObservedRegimes>1?
    'DESCRIPTIVE_MULTIREGIME_EXIT_RISK_ONLY':
    'DESCRIPTIVE_SINGLE_REGIME_EXIT_RISK_ONLY'};
}
