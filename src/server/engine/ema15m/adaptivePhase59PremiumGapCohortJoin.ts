/**
 * Adaptive Swing v2 Phase59 — exact original OOS entry-first premium reversal
 * AND first-next-session gap downside reconciliation.
 *
 * Reuses *the exact* Phase19 premium-runup and Phase46 original-gap
 * research primitives, first re-auditing Phase58 -> Phase57 -> Phase51/50.
 * Never turn a separate handpicked four-gap-path archive into 24 OOS trades.
 * A priceable BID is not a fill; a stop level is not overnight protection.
 * No broker, orders, GTT, NRML state or forced positional 15:15 exit.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase58MatchedOriginalExitAvailability,
  type Phase58Input,type Phase58IndependentPins,type Phase58Report
} from './adaptivePhase58MatchedExitAsOf.js';
import {
  runAdaptiveEntryFirstExitStudy,type EntryFirstExitOutcome
} from './adaptiveEntryFirstExitStudy.js';
import {
  auditOriginalPremiumRunupPath,validateObservedPremiumRunupPolicy,
  type ObservedPremiumRunupPolicy
} from './adaptiveObservedPremiumPathReversals.js';
import {
  auditPhase46SingleOriginalGapPath,validatePhase46GapStressPolicy,
  type Phase46GapStressPolicy,type Phase46IndexOptionGapPath,
  type Phase46OriginalL1Snapshot
} from './adaptiveUpstoxPhase46LongOptionGapRisk.js';
import type {CohortDecision} from './adaptiveEntryFirstCohort.js';
import type {HistoricalArm,HistoricalExecutableQuote}
  from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';
import {analyzeAdaptiveRegime,type AdaptiveRegime}
  from './adaptiveMarketRegime.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const SHA=/^[0-9a-f]{64}$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const digest=(v:unknown):string=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
export const hashPhase59Evidence=digest;
const ms=(s:unknown):number=>typeof s==='string'?Date.parse(s):NaN;
const day=(t:number):string=>new Date(t+330*60000)
  .toISOString().slice(0,10);
const round=(n:number)=>Number(n.toFixed(2));
const isHash=(x:unknown):x is string=>
  typeof x==='string'&&SHA.test(x);
const key=(a:{foldIndex:number;arm:HistoricalArm;
  horizon:HorizonBucket;decisionAt:string}):string=>
  a.foldIndex+'|'+a.arm+'|'+a.horizon+'|'+a.decisionAt;
const cellKey=(r:{regime:AdaptiveRegime;arm:HistoricalArm;
  horizon:HorizonBucket}):string=>
  r.regime+'|'+r.arm+'|'+r.horizon;
const eligible=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
export interface Phase59Input{
  schemaVersion:'ADAPTIVE_PHASE59_MATCHED_PREMIUM_REVERSAL_GAP_V1';
  source:'OFFLINE_UNVERIFIED_ORIGINAL_OOS_OPTION_TAPE';
  phase58:Phase58Input;
  phase58Pins:Phase58IndependentPins;
  /** Same original options BID premium—not NIFTY underlying index points. */
  phase19RunupPolicy:ObservedPremiumRunupPolicy;
  /** Reuse Phase46 native single-path exact first available post-open stress. */
  phase46GapPolicy:Phase46GapStressPolicy;
}
export interface Phase59IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE59_FULL_COHORT_PREMIUM_GAP_PINS_V1';
  expectedPhase58InputSha256:string;
  expectedPhase58PinsSha256:string;
  expectedPhase19PremiumPolicySha256:string;
  expectedPhase46GapPolicySha256:string;
  expectedOosDecisionSessions:number;
  expectedFullArmHorizonAttempts:number;
}
export interface Phase59Cell{
  regime:AdaptiveRegime;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  originalOosAttempts:number;
  originalNoEntryAttempts:number;
  observedOriginalEntries:number;
  fullyObservedPreTriggerOptionBidPaths:number;
  depthQualifiedFirstPremiumRunups:number;
  depthQualifiedSecondPremiumRunups:number;
  depthQualifiedCandidateTargets:number;
  observedFirstRunupReversedBeforeTarget:number;
  observedSecondRunupReversedBeforeTarget:number;
  observedReversalBelowOriginalPaidAsk:number;
  originalEntriesWithNoOvernightExposureBeforeExit:number;
  originalEntriesHeldIntoNextSession:number;
  exactSourceJoinedPhase46OvernightGapPaths:number;
  incompleteOrCensoredPremiumPaths:number;
  incompleteOrCensoredFirstNextOpenGapPaths:number;
  observedAdverseBidGapCount:number;
  zeroBidOrInsufficientDisplayDepthAtNextOpenCount:number;
  nextOpenAdverseGapOrCashBudgetAlerts:number;
  /** Null if any actually overnight-held selected source path is missing. */
  hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR:number|null;
  reusedPhase19PremiumClassifier:true;
  reusedPhase46GapStressPrimitive:true;
  noIntrabarOrBrokerFillInferred:true;
}
export interface Phase59Report{
  mode:'OFFLINE_ORIGINAL_OOS_PREMIUM_REVERSAL_NEXT_OPEN_GAP_COHORT_JOIN';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_SINGLE_REGIME_PREMIUM_GAP_ONLY'|
    'DESCRIPTIVE_MULTIREGIME_PREMIUM_GAP_ONLY'|
    'DESCRIPTIVE_PREMIUM_OR_GAP_RISK_ALERT_ONLY';
  reasonCodes:string[];
  phase58Status:Phase58Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisionSessions:number;
  originalArmHorizonAttempts:number;
  originalEnteredOptionPaths:number;
  distinctOriginalOptionEntryPathsAcrossAlternativeArms:number;
  fullyAuditedOriginalPreTriggerBidPaths:number;
  firstRunupReversalBeforeCandidateTargetCount:number;
  overnightExposedOriginalEntries:number;
  exactFirstNextOpenGapRiskPaths:number;
  originalSourceOrNextOpenCensoredPaths:number;
  originalPremiumStopOrGapCashBudgetAlerts:number;
  originalOosArmHorizonDenominatorPreserved:boolean;
  cells:Phase59Cell[];
  originalExchangeL1IndependentlyLicensed:false;
  exchangeMasterAndCalendarIndependentlyAuthenticated:false;
  issuerTrustedEventAndAvailableAtClock:false;
  phase19PremiumTargetExpressedInIndexPoints:false;
  phase46FourHandpickedPathsCountAsWholeOos:false;
  optionBidGuaranteedExecutable:false;
  brokerNativeNrmlStopOrGttAckVerified:false;
  overnightStopCannotGapOrBeRejected:false;
  statisticallyValidMultiRegimeHorizonRankingProven:false;
  trueIvThetaVegaAttributionProven:false;
  strategyProfitabilityProven:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'PHASE19_OPTION_BID_POINTS_ARE_NOT_NIFTY_OR_BANKNIFTY_INDEX_POINTS',
  'PHASE19_REUSE_REQUIRES_REPLAYED_PHASE8_PREEXISTING_TRIGGER',
  'PHASE46_REUSE_REQUIRES_UNCHANGED_ORIGINAL_ENTRY_PRECLOSE_FIRST_NEXT_OPEN',
  'THE_SELECTED_FOUR_HORIZON_GAP_EXAMPLES_ARE_NOT_THE_ENTIRE_OOS_COHORT',
  'MISSING_PREOPEN_PRECLOSE_OR_SOURCE_DELIVERY_IS_UNKNOWN_NOT_SAFE_ZERO_LOSS',
  'ALTERNATIVE_RESEARCH_ARMS_CAN_SHARE_THE_SAME_ORIGINAL_OPTION_PATH',
  'QUOTED_BID_AND_L1_DISPLAYED_DEPTH_ARE_NOT_QUEUE_PRIORITY_OR_FILL',
  'FULL_OPTION_PREMIUM_DEBIT_CAN_BE_LOST_EVEN_IF_STOP_PRICE_WAS_TRIGGERED',
  'NO_HISTORICAL_TRADE_PNL_EDGE_PROVEN_WITHOUT_LICENSED_UNTOUCHED_OOS',
  'NO_INDEPENDENT_IV_THETA_OR_OPTION_GAP_PROBABILITY_CALIBRATION',
  'NO_FORCED_15_15_NRML_EXIT_AND_NO_LIVE_BROKER_OR_GTT_WRITES'
];
const empty=():Phase59Report=>({
  mode:'OFFLINE_ORIGINAL_OOS_PREMIUM_REVERSAL_NEXT_OPEN_GAP_COHORT_JOIN',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase58Status:null,syntheticDataset:null,
  originalOosDecisionSessions:0,originalArmHorizonAttempts:0,
  originalEnteredOptionPaths:0,
  distinctOriginalOptionEntryPathsAcrossAlternativeArms:0,
  fullyAuditedOriginalPreTriggerBidPaths:0,
  firstRunupReversalBeforeCandidateTargetCount:0,
  overnightExposedOriginalEntries:0,
  exactFirstNextOpenGapRiskPaths:0,
  originalSourceOrNextOpenCensoredPaths:0,
  originalPremiumStopOrGapCashBudgetAlerts:0,
  originalOosArmHorizonDenominatorPreserved:false,
  cells:[],
  originalExchangeL1IndependentlyLicensed:false,
  exchangeMasterAndCalendarIndependentlyAuthenticated:false,
  issuerTrustedEventAndAvailableAtClock:false,
  phase19PremiumTargetExpressedInIndexPoints:false,
  phase46FourHandpickedPathsCountAsWholeOos:false,
  optionBidGuaranteedExecutable:false,
  brokerNativeNrmlStopOrGttAckVerified:false,
  overnightStopCannotGapOrBeRejected:false,
  statisticallyValidMultiRegimeHorizonRankingProven:false,
  trueIvThetaVegaAttributionProven:false,
  strategyProfitabilityProven:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const fail=(reason:string,status:Phase59Report['status']='INVALID_EVIDENCE',
  part?:Partial<Phase59Report>):Phase59Report=>({
    ...empty(),...part,status,reasonCodes:[reason]
  });
const snapshot=(q:HistoricalExecutableQuote):Phase46OriginalL1Snapshot=>({
  instrumentKey:q.instrumentKey,observedAt:q.observedAt,
  availableAt:q.availableAt??'',bid:q.bid,ask:q.ask,
  displayedBidQuantity:q.bidQty,displayedAskQuantity:q.askQty
});
function originalGapPath(
  a:CohortDecision,o:EntryFirstExitOutcome,source:Phase59Input,
  quotes:HistoricalExecutableQuote[]
):{path:Phase46IndexOptionGapPath}|{reason:string}{
  const sessions=source.phase58.exitSessions;
  if(!a.entryAt||!a.instrumentKey||a.entryAsk===null||
    a.quantity===null||!o.nextQuoteAt)
    return {reason:'INCOMPLETE_ORIGINAL_ENTRY_IDENTITY_FOR_GAP'};
  const entryMs=ms(a.entryAt),exitMs=ms(o.nextQuoteAt);
  const entryDay=day(entryMs),session=sessions.find(x=>
    x.sessionDate===entryDay);
  const next=sessions.find(x=>x.sessionDate>entryDay);
  if(!session||!next||day(ms(next.openAt))!==next.sessionDate||
    !(ms(next.openAt)<exitMs))
    return {reason:'UNDECLARED_OR_TOO_LATE_ORIGINAL_NEXT_SESSION'};
  const related=quotes.filter(q=>q.instrumentKey===a.instrumentKey);
  const exact=related.filter(q=>q.observedAt===a.entryAt);
  const preclose=related.filter(q=>
    ms(q.observedAt)>=entryMs&&
    ms(q.observedAt)<=ms(session.closeAt)&&
    ms(q.availableAt)<=ms(session.closeAt))
    .sort((x,y)=>ms(y.observedAt)-ms(x.observedAt));
  const opening=related.filter(q=>ms(q.observedAt)>=ms(next.openAt)&&
    ms(q.observedAt)<=ms(next.closeAt))
    .sort((x,y)=>ms(x.observedAt)-ms(y.observedAt));
  if(exact.length!==1||!preclose.length||!opening.length||
    !Number.isFinite(ms(exact[0].availableAt))||
    ms(opening[0].observedAt)>exitMs)
    return {reason:'ORIGINAL_FIRST_NEXT_OPEN_PRECLOSE_OR_ENTRY_L1_MISSING'};
  const originalDecision=source.phase58.phase57.phase51.phase50.historical
    .decisions.find(d=>d.decisionAt===a.decisionAt);
  const contract=originalDecision?.listedContracts.find(c=>
    c.instrument_key===a.instrumentKey&&
    c.expiry===a.expiry);
  if(!contract||!a.expiry||!DATE.test(a.expiry)||
    !['CE','PE'].includes(contract.instrument_type)||
    !Number.isSafeInteger(contract.lot_size))
    return {reason:'ORIGINAL_LISTED_EXPIRY_CONTRACT_MASTER_MISSING'};
  // Phase46 verifies event/availableAt, first-open lag, expiry bucket,
  // original quote prices, displayed lot units, gap and full debit loss.
  const path:Phase46IndexOptionGapPath={
    horizon:a.horizon,
    source:'OPERATOR_SUPPLIED_ORIGINAL_L1_UNVERIFIED',
    contractType:'CASH_SETTLED_INDEX_OPTION_DECLARED_UNVERIFIED',
    instrumentKey:a.instrumentKey,
    optionType:contract.instrument_type,
    expiryAt:a.expiry+'T10:00:00.000Z',
    lotSize:contract.lot_size,
    quantity:a.quantity,
    entryDecisionAt:exact[0].availableAt!,
    preCloseAt:session.closeAt,
    nextSessionOpenAt:next.openAt,
    entryQuote:snapshot(exact[0]),
    preCloseQuote:snapshot(preclose[0]),
    nextOpenQuote:snapshot(opening[0]),
    declaredStopTriggerPremium:a.entryAsk*(
      1-source.phase58.exitPolicy.horizonRules[a.horizon]
        .initialStopFraction)
  };
  return {path};
}
export function auditPhase59MatchedPremiumReversalGap(
  input:Phase59Input,pins:Phase59IndependentPins
):Phase59Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE59_MATCHED_PREMIUM_REVERSAL_GAP_V1'||
    input.source!=='OFFLINE_UNVERIFIED_ORIGINAL_OOS_OPTION_TAPE'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE59_FULL_COHORT_PREMIUM_GAP_PINS_V1'||
    !input.phase58||!input.phase58Pins||
    ![pins.expectedPhase58InputSha256,
      pins.expectedPhase58PinsSha256,
      pins.expectedPhase19PremiumPolicySha256,
      pins.expectedPhase46GapPolicySha256].every(isHash)||
    pins.expectedPhase58InputSha256!==digest(input.phase58)||
    pins.expectedPhase58PinsSha256!==digest(input.phase58Pins)||
    pins.expectedPhase19PremiumPolicySha256!==
      digest(input.phase19RunupPolicy)||
    pins.expectedPhase46GapPolicySha256!==digest(input.phase46GapPolicy)||
    !Number.isSafeInteger(pins.expectedOosDecisionSessions)||
    pins.expectedOosDecisionSessions<2||
    pins.expectedFullArmHorizonAttempts!==
      pins.expectedOosDecisionSessions*12||
    validateObservedPremiumRunupPolicy(input.phase19RunupPolicy).length!==0||
    !validatePhase46GapStressPolicy(input.phase46GapPolicy)||
    input.phase46GapPolicy.maxOriginalEventToAvailabilitySeconds>
      input.phase58Pins.maximumOriginalQuoteEventToAvailabilitySeconds)
    return fail('ORIGINAL_COHORT_AND_INDEPENDENT_PHASE19_PHASE46_PINS_INVALID');
  // Same independently fixed all-in entry+exit cost used in Phase57 full
  // debit risk and Phase46 no-recovery. No fees restatement to look safer.
  if(HORIZONS.some(h=>Math.abs(
    input.phase46GapPolicy.horizonRules[h].hypotheticalEntryFeesINR-
    input.phase58.phase57.policy.horizonRules[h]
      .assumedNonRecoverableEntryAndExitCostsINR)>0.001||
    input.phase46GapPolicy.horizonRules[h].hypotheticalExitFeesINR!==0))
    return fail('PHASE46_AND_PHASE57_FULL_DEBIT_COSTS_NOT_RECONCILED');
  let base:Phase58Report;
  try{
    base=auditPhase58MatchedOriginalExitAvailability(
      input.phase58,input.phase58Pins);
  }catch{return fail('PHASE58_ORIGINAL_EXIT_AND_AVAILABILITY_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const part:Partial<Phase59Report>={
    phase58Status:base.status,
    syntheticDataset:base.syntheticDataset,
    originalOosDecisionSessions:base.originalOosSessions,
    originalArmHorizonAttempts:base.fullOriginalArmHorizonAttempts
  };
  if(!base.status.startsWith('DESCRIPTIVE_')||
    base.originalOosSessions!==pins.expectedOosDecisionSessions||
    base.fullOriginalArmHorizonAttempts!==
      pins.expectedFullArmHorizonAttempts||
    base.observedOriginalEntries!==
      base.fullyAvailabilityAuditedAndPricedExitEntries||
    base.censoredOrUnpricedExitEntries!==0||
    base.invalidOrNoncausalOriginalQuoteAvailabilityPaths!==0)
    return fail('PHASE58_FULL_ORIGINAL_OOS_EXIT_AND_DEBIT_REAUDIT_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',part);
  const historical=input.phase58.phase57.phase51.phase50.historical;
  const replay=runAdaptiveEntryFirstExitStudy(
    historical,input.phase58.exitPolicy,input.phase58.exitSessions);
  if(replay.status!=='DESCRIPTIVE_ONLY'||
    replay.cohort.attempts.length!==pins.expectedFullArmHorizonAttempts)
    return fail('ORIGINAL_PHASE8_REPLAY_NOT_FULLY_PRICEABLE',
      'INCOMPLETE_EVIDENCE',part);
  const outcomeMap=new Map<string,EntryFirstExitOutcome>();
  for(const o of replay.outcomes){
    const k=key(o);
    if(outcomeMap.has(k))
      return fail('DUPLICATED_ORIGINAL_EXIT_ON_SAME_ENTRY_COHORT',
        'INCOMPLETE_EVIDENCE',part);
    outcomeMap.set(k,o);
  }
  const originalByDate=new Map(historical.decisions.map(d=>
    [d.decisionAt,d]));
  const quoteMap=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of historical.executionQuotes){
    const arr=quoteMap.get(q.instrumentKey)??[];
    arr.push(q);
    quoteMap.set(q.instrumentKey,arr);
  }
  for(const q of quoteMap.values()){
    q.sort((a,b)=>ms(a.observedAt)-ms(b.observedAt));
  }
  const cells=new Map<string,Phase59Cell>();
  const seen=new Set<string>(),unique=new Set<string>();
  let entered=0,premiumChecked=0,rev=0,held=0,gapped=0,
    censored=0,alerts=0;
  const blockers=new Set<string>();
  for(const a of replay.cohort.attempts){
    const k=key(a),original=originalByDate.get(a.decisionAt);
    if(seen.has(k)||!original||!ARMS.includes(a.arm)||
      !HORIZONS.includes(a.horizon))
      return fail('ORIGINAL_PHASE8_ATTEMPT_MISSING_OR_DUPLICATED',
        'INCOMPLETE_EVIDENCE',part);
    seen.add(k);
    const regime=analyzeAdaptiveRegime(
      original.candles,new Date(ms(a.decisionAt))).regime;
    const ck=cellKey({regime,arm:a.arm,horizon:a.horizon});
    let cell=cells.get(ck);
    if(!cell){
      cell={regime,arm:a.arm,horizon:a.horizon,
        originalOosAttempts:0,originalNoEntryAttempts:0,
        observedOriginalEntries:0,fullyObservedPreTriggerOptionBidPaths:0,
        depthQualifiedFirstPremiumRunups:0,
        depthQualifiedSecondPremiumRunups:0,
        depthQualifiedCandidateTargets:0,
        observedFirstRunupReversedBeforeTarget:0,
        observedSecondRunupReversedBeforeTarget:0,
        observedReversalBelowOriginalPaidAsk:0,
        originalEntriesWithNoOvernightExposureBeforeExit:0,
        originalEntriesHeldIntoNextSession:0,
        exactSourceJoinedPhase46OvernightGapPaths:0,
        incompleteOrCensoredPremiumPaths:0,
        incompleteOrCensoredFirstNextOpenGapPaths:0,
        observedAdverseBidGapCount:0,
        zeroBidOrInsufficientDisplayDepthAtNextOpenCount:0,
        nextOpenAdverseGapOrCashBudgetAlerts:0,
        hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR:0,
        reusedPhase19PremiumClassifier:true,
        reusedPhase46GapStressPrimitive:true,
        noIntrabarOrBrokerFillInferred:true};
      cells.set(ck,cell);
    }
    cell.originalOosAttempts++;
    if(a.disposition!=='ENTRY_OBSERVED'){
      cell.originalNoEntryAttempts++;
      continue;
    }
    cell.observedOriginalEntries++;entered++;
    unique.add(a.instrumentKey+'|'+a.entryAt);
    const o=outcomeMap.get(k);
    if(!o||o.status!=='PRICED_EXIT'||!o.nextQuoteAt||
      !o.triggerObservedAt){
      censored++;cell.incompleteOrCensoredPremiumPaths++;
      blockers.add('PHASE8_ENTRY_EXIT_NOT_INDEPENDENTLY_PRICEABLE');
      continue;
    }
    const policy=input.phase19RunupPolicy.horizonRules?.[a.horizon]??
      input.phase19RunupPolicy;
    const pre=auditOriginalPremiumRunupPath(
      a,o,quoteMap,policy);
    if(!pre.valid){
      censored++;cell.incompleteOrCensoredPremiumPaths++;
      blockers.add('PHASE19_PRETRIGGER_ORIGINAL_BID_PATH_NOT_VERIFIED');
      continue;
    }
    premiumChecked++;cell.fullyObservedPreTriggerOptionBidPaths++;
    if(pre.first)cell.depthQualifiedFirstPremiumRunups++;
    if(pre.second)cell.depthQualifiedSecondPremiumRunups++;
    if(pre.target)cell.depthQualifiedCandidateTargets++;
    if(pre.firstReversed){
      rev++;cell.observedFirstRunupReversedBeforeTarget++;
    }
    if(pre.secondReversed)cell.observedSecondRunupReversedBeforeTarget++;
    if(pre.firstReversedBelowEntry)
      cell.observedReversalBelowOriginalPaidAsk++;
    if(day(ms(o.nextQuoteAt))===day(ms(a.entryAt))){
      cell.originalEntriesWithNoOvernightExposureBeforeExit++;
      continue;
    }
    held++;cell.originalEntriesHeldIntoNextSession++;
    const proposed=originalGapPath(
      a,o,input,quoteMap.get(a.instrumentKey!)??[]);
    if('reason' in proposed){
      censored++;cell.incompleteOrCensoredFirstNextOpenGapPaths++;
      cell.hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR=null;
      blockers.add(proposed.reason);
      continue;
    }
    const result=auditPhase46SingleOriginalGapPath(
      proposed.path,input.phase46GapPolicy);
    if(result.ok===false){
      censored++;cell.incompleteOrCensoredFirstNextOpenGapPaths++;
      cell.hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR=null;
      blockers.add(result.code);
      continue;
    }
    const gap=result.cell;
    const frozenCost=input.phase58.phase57.policy.horizonRules[a.horizon]
      .assumedNonRecoverableEntryAndExitCostsINR;
    if(Math.abs(gap.fullDebitLossWithNoRecoveryINR-
      (a.entryAsk!*a.quantity!+frozenCost))>0.02)
      return fail('ORIGINAL_FULL_DEBIT_DISAGREES_WITH_PHASE57',
        'INCOMPLETE_EVIDENCE',part);
    gapped++;cell.exactSourceJoinedPhase46OvernightGapPaths++;
    if(cell.hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR!==null)
      cell.hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR+=
        gap.fullDebitLossWithNoRecoveryINR;
    if(gap.bidGapPercent!==null&&gap.bidGapPercent<0)
      cell.observedAdverseBidGapCount++;
    if(gap.zeroBidOrNoDisplayedDepth||gap.displayedDepthBelowPolicy)
      cell.zeroBidOrInsufficientDisplayDepthAtNextOpenCount++;
    if(gap.fullDebitLossBudgetExceeded||gap.adverseGapBudgetExceeded||
      gap.displayedDepthBelowPolicy||gap.zeroBidOrNoDisplayedDepth){
      cell.nextOpenAdverseGapOrCashBudgetAlerts++;alerts++;
    }
  }
  const rows=[...cells.values()].map(c=>({
    ...c,hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR:
      c.hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR===null?
      null:c.originalEntriesHeldIntoNextSession===0?null:
      round(c.hypotheticalFullDebitZeroRecoveryRiskForOvernightEntriesINR)
  }));
  const groups=new Map(base.cells.map(c=>[
    cellKey(c),c]));
  for(const c of rows){
    const previous=groups.get(cellKey(c));
    if(!previous||
      previous.allOriginalOosDecisionAttempts!==c.originalOosAttempts||
      previous.originalObservedEntries!==c.observedOriginalEntries||
      previous.pricedNextAvailableBidExits!==c.observedOriginalEntries||
      previous.nonEntriesIncludingMissingSource!==c.originalNoEntryAttempts)
      blockers.add('PHASE58_ENTRY_FIRST_REGIME_HORIZON_COHORT_CHANGED');
  }
  if(entered!==base.observedOriginalEntries||
    seen.size!==pins.expectedFullArmHorizonAttempts||
    rows.reduce((n,c)=>n+c.originalOosAttempts,0)!==
      pins.expectedFullArmHorizonAttempts||
    premiumChecked+censored<entered||
    gapped+rows.reduce((n,c)=>
      n+c.incompleteOrCensoredFirstNextOpenGapPaths,0)!==held)
    blockers.add('ORIGINAL_PREMIUM_AND_GAP_FULL_OOS_DENOMINATOR_MISMATCH');
  const report:Phase59Report={
    ...empty(),...part,
    originalEnteredOptionPaths:entered,
    distinctOriginalOptionEntryPathsAcrossAlternativeArms:unique.size,
    fullyAuditedOriginalPreTriggerBidPaths:premiumChecked,
    firstRunupReversalBeforeCandidateTargetCount:rev,
    overnightExposedOriginalEntries:held,
    exactFirstNextOpenGapRiskPaths:gapped,
    originalSourceOrNextOpenCensoredPaths:censored,
    originalPremiumStopOrGapCashBudgetAlerts:alerts,
    originalOosArmHorizonDenominatorPreserved:
      seen.size===pins.expectedFullArmHorizonAttempts,
    cells:rows
  };
  if(blockers.size||censored)
    return {...report,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:[...blockers]};
  if(base.status==='DESCRIPTIVE_LONG_PREMIUM_RISK_ALERT_ONLY'||alerts)
    return {...report,status:'DESCRIPTIVE_PREMIUM_OR_GAP_RISK_ALERT_ONLY',
      reasonCodes:['FULL_DEBIT_OR_ADVERSE_NEXT_OPEN_RISK_ALERT_ONLY']};
  return {...report,status:base.status===
      'DESCRIPTIVE_MULTIREGIME_EXIT_RISK_ONLY'?
      'DESCRIPTIVE_MULTIREGIME_PREMIUM_GAP_ONLY':
      'DESCRIPTIVE_SINGLE_REGIME_PREMIUM_GAP_ONLY'};
}
