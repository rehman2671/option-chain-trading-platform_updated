/**
 * Adaptive Swing v2 Phase50 — independent offline multi-fold original L1
 * availability-order and full entry-first OOS denominator audit.
 *
 * IMPORTANT: a source-available quote is not an authenticated exchange feed,
 * an executed fill, a licensed market dataset, or an overnight stop.
 * This module makes NO network/broker/order/GTT calls and cannot enable trading.
 */
import {createHash} from 'node:crypto';
import {
  buildAdaptiveEntryFirstCohort,
  type CohortDecision, type EntryDisposition
} from './adaptiveEntryFirstCohort.js';
import type {
  HistoricalComparisonInput, HistoricalExecutableQuote, HistoricalArm
} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const SHA=/^[0-9a-f]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const ms=(v:unknown):number=>
  typeof v==='string'&&ISO.test(v)?Date.parse(v):NaN;
const hash=(v:unknown):string=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
const int=(x:unknown,lo:number,hi:number):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=lo&&x<=hi;
const attemptKey=(x:CohortDecision)=>x.foldIndex+'|'+x.decisionAt+
  '|'+x.arm+'|'+x.horizon;
const validDispositions:Set<EntryDisposition>=new Set([
  'NO_TRADE_SIGNAL','NO_POINT_IN_TIME_CONTRACT',
  'PRE_EXPIRY_BUFFER_VIOLATION','MISSING_EXECUTABLE_ENTRY_L1',
  'PREDECLARED_EXPOSURE_COOLDOWN','UNUSABLE_UNDERLYING_HISTORY',
  'HYSTERESIS_NEW_ENTRY_BLOCKED','ENTRY_OBSERVED'
]);
export const hashPhase50Evidence=hash;

export interface Phase50MultifoldInput {
  schemaVersion:'ADAPTIVE_PHASE50_MULTIFOLD_L1_ASOF_V1';
  source:'OFFLINE_OPERATOR_L1_UNVERIFIED';
  historical:HistoricalComparisonInput;
}
export interface Phase50IndependentPins {
  schemaVersion:'INDEPENDENT_PHASE50_MULTIFOLD_L1_ASOF_PINS_V1';
  expectedStudyDatasetId:string;
  expectedOriginalHistoricalSha256:string;
  /** Fold-indexed original (sessionDate, decisionAt) manifest, never wins-only. */
  expectedOosSessionManifestSha256:string;
  expectedFoldCount:number;
  expectedOosTestDecisionCount:number;
  expectedOosAttemptCount:number;
  /** These thresholds are predeclared; no testing on a single good day. */
  minimumDistinctOosDays:number;
  minimumOosFolds:number;
  minimumObservedEntries:number;
  maximumOriginalL1AvailabilityLagSeconds:number;
}
export interface Phase50FoldArmHorizonCoverage {
  foldIndex:number;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  decisionAttempts:number;
  noTradeOrFiltered:number;
  observedEntries:number;
  missingChosenContractEntryL1:number;
  exactSourceAvailableEntries:number;
  entryNotAvailableByDeadline:number;
  invalidOrUnknownSourceClock:number;
  originalAvailabilityOrderDisagreements:number;
  retainsFullAttemptDenominator:true;
  originalMarketSourceAuthenticated:false;
}
export interface Phase50MultifoldReport {
  mode:'OFFLINE_MULTIFOLD_ENTRY_FIRST_L1_ASOF_COVERAGE';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY';
  reasonCodes:string[];
  syntheticDataset:boolean|null;
  oosFoldCount:number;
  distinctOosSessionDays:number;
  oosTestDecisionCount:number;
  totalDecisionArmHorizonAttempts:number;
  originalObservedEntryAttempts:number;
  missingOriginalSelectedContractEntries:number;
  exactSourceAvailableEntryAttempts:number;
  uniqueExactSourceAvailableQuoteObservations:number;
  overlappingArmReferencesToSameQuote:number;
  entryUnavailableAtDecisionDeadline:number;
  originalSourceClockInvalidOrUnknown:number;
  originalAvailabilityOrderDisagreements:number;
  foldArmHorizonCells:Phase50FoldArmHorizonCoverage[];
  originalLicensedL1IndependentlyAuthenticated:false;
  vendorHistoricalLicenseIndependentlyVerified:false;
  trueOriginalAvailableAtVerified:false;
  originalContractAndCalendarIndependentlyAuthenticated:false;
  unbiasedMultiFoldProfitabilityProven:false;
  brokerStopAckOrOvernightProtectionVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'SOURCE_CLOCK_AND_EVENT_SEQUENCE_ARE_OPERATOR_PROVIDED_NOT_EXCHANGE_AUTHENTICATED',
  'SELF_SUPPLIED_SHA_PINS_ARE_INTEGRITY_CHECKS_NOT_INDEPENDENT_VENDOR_ATTESTATION',
  'EVERY_OOS_FOLD_ARM_HORIZON_DECISION_REMAINS_IN_DENOMINATOR',
  'MISSING_OR_LATE_SELECTED_OPTION_QUOTE_IS_NOT_A_ZERO_RETURN_OR_WIN',
  'SOURCE_AVAILABILITY_ORDER_CAN_DIFFER_FROM_ORIGINAL_EVENT_TIME_ORDER',
  'OVERLAPPING_STRATEGY_ARMS_ON_ONE_QUOTE_ARE_NOT_INDEPENDENT_TRADES',
  'DESCRIPTIVE_MULTIFOLD_COVERAGE_IS_NOT_PROFITABILITY_OR_EXECUTABLE_FILL_PROOF',
  'NO_GENUINE_NSE_BSE_CONTRACT_MASTER_CALENDAR_BROKER_ACK_OR_NRML_STOP',
  'NO_POSITIONAL_15_15_EXIT_NO_LIVE_NRML_OR_GTT_WRITE'
];
const blank=():Phase50MultifoldReport=>({
  mode:'OFFLINE_MULTIFOLD_ENTRY_FIRST_L1_ASOF_COVERAGE',
  status:'INVALID_EVIDENCE',reasonCodes:[],syntheticDataset:null,
  oosFoldCount:0,distinctOosSessionDays:0,oosTestDecisionCount:0,
  totalDecisionArmHorizonAttempts:0,originalObservedEntryAttempts:0,
  missingOriginalSelectedContractEntries:0,
  exactSourceAvailableEntryAttempts:0,
  uniqueExactSourceAvailableQuoteObservations:0,
  overlappingArmReferencesToSameQuote:0,
  entryUnavailableAtDecisionDeadline:0,
  originalSourceClockInvalidOrUnknown:0,
  originalAvailabilityOrderDisagreements:0,
  foldArmHorizonCells:[],
  originalLicensedL1IndependentlyAuthenticated:false,
  vendorHistoricalLicenseIndependentlyVerified:false,
  trueOriginalAvailableAtVerified:false,
  originalContractAndCalendarIndependentlyAuthenticated:false,
  unbiasedMultiFoldProfitabilityProven:false,
  brokerStopAckOrOvernightProtectionVerified:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const deny=(reason:string,status:Phase50MultifoldReport['status']=
  'INVALID_EVIDENCE')=>({...blank(),status,reasonCodes:[reason]});
const validPins=(p:Phase50IndependentPins):boolean=>
  !!p&&p.schemaVersion==='INDEPENDENT_PHASE50_MULTIFOLD_L1_ASOF_PINS_V1'&&
  typeof p.expectedStudyDatasetId==='string'&&
  /^[A-Za-z0-9_.:-]{4,120}$/.test(p.expectedStudyDatasetId)&&
  typeof p.expectedOriginalHistoricalSha256==='string'&&
  SHA.test(p.expectedOriginalHistoricalSha256)&&
  typeof p.expectedOosSessionManifestSha256==='string'&&
  SHA.test(p.expectedOosSessionManifestSha256)&&
  int(p.expectedFoldCount,1,64)&&
  int(p.expectedOosTestDecisionCount,1,100000)&&
  p.expectedOosAttemptCount===p.expectedOosTestDecisionCount*12&&
  int(p.minimumDistinctOosDays,2,100000)&&
  int(p.minimumOosFolds,2,64)&&
  int(p.minimumObservedEntries,1,100000)&&
  int(p.maximumOriginalL1AvailabilityLagSeconds,0,3600);

interface QuoteCheck {
  exact:boolean;
  clockInvalid:boolean;
  unavailable:boolean;
  orderMismatch:boolean;
  sourceQuoteKey:string|null;
}
function auditOriginalEntry(
  attempt:CohortDecision,
  history:Map<string,HistoricalExecutableQuote[]>,
  maxLagMs:number,
  deadlineMinutes:number
):QuoteCheck {
  const result:QuoteCheck={exact:false,clockInvalid:false,
    unavailable:false,orderMismatch:false,sourceQuoteKey:null};
  if(!attempt.instrumentKey||!attempt.quantity||
    !int(attempt.quantity,1,10000000))return {...result,unavailable:true};
  const start=ms(attempt.decisionAt);
  const deadline=start+deadlineMinutes*60_000;
  if(!Number.isFinite(start)||!Number.isFinite(deadline))
    return {...result,clockInvalid:true};
  const relevant=(history.get(attempt.instrumentKey)??[]).filter(q=>{
    const at=ms(q.observedAt);
    return Number.isFinite(at)&&at>start&&at<=deadline;
  });
  for(const q of relevant){
    const event=ms(q.observedAt),available=ms(q.availableAt);
    if(!Number.isFinite(available)||available<event||
      available-event>maxLagMs)result.clockInvalid=true;
  }
  const eligible=relevant.filter(q=>
    q.bidQty>=attempt.quantity!&&q.askQty>=attempt.quantity!&&
    Number.isFinite(ms(q.availableAt))&&
    ms(q.availableAt)>=ms(q.observedAt)&&
    ms(q.availableAt)-ms(q.observedAt)<=maxLagMs&&
    ms(q.availableAt)<=deadline)
    .sort((a,b)=>ms(a.availableAt)-ms(b.availableAt)||
      ms(a.observedAt)-ms(b.observedAt));
  const first=eligible[0];
  if(!first){result.unavailable=true;return result;}
  if(attempt.disposition!=='ENTRY_OBSERVED'){
    result.orderMismatch=true;return result;
  }
  if(first.observedAt!==attempt.entryAt||
    first.ask!==attempt.entryAsk||first.bid!==attempt.entryBid){
    result.orderMismatch=true;return result;
  }
  result.sourceQuoteKey=first.instrumentKey+'|'+first.observedAt;
  result.exact=!result.clockInvalid;
  return result;
}
/**
 * Validates original source quote availability for ALL OOS entry attempts
 * across all folds. No historical P&L, win rate, fills or live instructions.
 */
export function auditPhase50MultifoldL1AsOfCoverage(
  input:Phase50MultifoldInput,pins:Phase50IndependentPins
):Phase50MultifoldReport {
  if(!input||!validPins(pins)||input.schemaVersion!==
    'ADAPTIVE_PHASE50_MULTIFOLD_L1_ASOF_V1'||
    input.source!=='OFFLINE_OPERATOR_L1_UNVERIFIED'||
    !input.historical||!input.historical.provenance||
    input.historical.provenance.datasetId!==pins.expectedStudyDatasetId||
    hash(input.historical)!==pins.expectedOriginalHistoricalSha256)
    return deny('EXACT_ORIGINAL_SOURCE_OR_PRESPECIFIED_PINS_INVALID');
  const h=input.historical;
  if(!Array.isArray(h.decisions)||!Array.isArray(h.executionQuotes)||
    !Array.isArray(h.policy?.folds))
    return deny('HISTORICAL_OOS_SOURCE_SCHEMA_INVALID');
  const manifest:string[]=[];
  for(let f=0;f<h.policy.folds.length;f++){
    const fold=h.policy.folds[f];
    for(const d of h.decisions){
      if(d.sessionDate>=fold.testStart&&d.sessionDate<=fold.testEnd)
        manifest.push(f+'|'+d.sessionDate+'|'+d.decisionAt);
    }
  }
  if(h.policy.folds.length!==pins.expectedFoldCount||
    manifest.length!==pins.expectedOosTestDecisionCount||
    hash(manifest)!==pins.expectedOosSessionManifestSha256)
    return deny('PRESPECIFIED_OOS_FOLD_OR_SESSION_MANIFEST_CHANGED');
  let cohort:ReturnType<typeof buildAdaptiveEntryFirstCohort>;
  try{cohort=buildAdaptiveEntryFirstCohort(h);}
  catch{return deny('ORIGINAL_ENTRY_FIRST_COHORT_REPLAY_FAILED');}
  if(cohort.status!=='ENTRY_COHORT_RECORDED'||
    cohort.counts.testDecisions!==manifest.length||
    cohort.attempts.length!==pins.expectedOosAttemptCount||
    cohort.counts.attempts!==pins.expectedOosAttemptCount)
    return deny('ORIGINAL_OOS_COHORT_OR_FULL_DENOMINATOR_REJECTED');
  const grouped=new Map<string,CohortDecision>();
  for(const a of cohort.attempts){
    const key=attemptKey(a);
    if(grouped.has(key)||!validDispositions.has(a.disposition)||
      !int(a.foldIndex,0,pins.expectedFoldCount-1)||
      !ARMS.includes(a.arm)||!HORIZONS.includes(a.horizon))
      return deny('DUPLICATE_OR_UNDECLARED_ORIGINAL_OOS_ATTEMPT');
    grouped.set(key,a);
  }
  const series=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of h.executionQuotes){
    const found=series.get(q.instrumentKey)??[];
    found.push(q);series.set(q.instrumentKey,found);
  }
  const distinctDays=new Set<string>();
  const cells:Phase50FoldArmHorizonCoverage[]=[];
  const uniqueSources=new Set<string>();
  let observed=0,missing=0,exact=0,clock=0,unavailable=0,order=0;
  for(let fi=0;fi<h.policy.folds.length;fi++){
    const dates=h.decisions.filter(d=>
      d.sessionDate>=h.policy.folds[fi].testStart&&
      d.sessionDate<=h.policy.folds[fi].testEnd);
    for(const d of dates)distinctDays.add(d.sessionDate);
    for(const arm of ARMS)for(const horizon of HORIZONS){
      const c:Phase50FoldArmHorizonCoverage={
        foldIndex:fi,arm,horizon,decisionAttempts:dates.length,
        noTradeOrFiltered:0,observedEntries:0,
        missingChosenContractEntryL1:0,exactSourceAvailableEntries:0,
        entryNotAvailableByDeadline:0,invalidOrUnknownSourceClock:0,
        originalAvailabilityOrderDisagreements:0,
        retainsFullAttemptDenominator:true,
        originalMarketSourceAuthenticated:false
      };
      for(const d of dates){
        const a=grouped.get(fi+'|'+d.decisionAt+'|'+arm+'|'+horizon);
        if(!a||a.sessionDate!==d.sessionDate)
          return deny('OOS_FOLD_ARM_HORIZON_DENOMINATOR_INCOMPLETE');
        if(a.disposition==='MISSING_EXECUTABLE_ENTRY_L1'){
          missing++;c.missingChosenContractEntryL1++;
        }
        if(a.disposition==='ENTRY_OBSERVED'){
          observed++;c.observedEntries++;
        }
        if(a.disposition!=='ENTRY_OBSERVED'&&
          a.disposition!=='MISSING_EXECUTABLE_ENTRY_L1'){
          c.noTradeOrFiltered++;continue;
        }
        const q=auditOriginalEntry(a,series,
          pins.maximumOriginalL1AvailabilityLagSeconds*1000,
          h.policy.maxEntryDelayMinutes);
        if(q.clockInvalid){clock++;c.invalidOrUnknownSourceClock++;}
        if(q.unavailable){unavailable++;c.entryNotAvailableByDeadline++;}
        if(q.orderMismatch){order++;c.originalAvailabilityOrderDisagreements++;}
        if(q.exact&&q.sourceQuoteKey){
          exact++;c.exactSourceAvailableEntries++;
          uniqueSources.add(q.sourceQuoteKey);
        }
      }
      cells.push(c);
    }
  }
  if(grouped.size!==manifest.length*12||cells.some(c=>
    c.decisionAttempts!==
    c.noTradeOrFiltered+c.observedEntries+c.missingChosenContractEntryL1))
    return deny('OOS_ATTEMPT_IDENTITY_OR_CELL_TOTAL_MISMATCH');
  const report:Phase50MultifoldReport={
    ...blank(),syntheticDataset:h.provenance.synthetic,
    oosFoldCount:h.policy.folds.length,
    distinctOosSessionDays:distinctDays.size,
    oosTestDecisionCount:manifest.length,
    totalDecisionArmHorizonAttempts:cohort.attempts.length,
    originalObservedEntryAttempts:observed,
    missingOriginalSelectedContractEntries:missing,
    exactSourceAvailableEntryAttempts:exact,
    uniqueExactSourceAvailableQuoteObservations:uniqueSources.size,
    overlappingArmReferencesToSameQuote:exact-uniqueSources.size,
    entryUnavailableAtDecisionDeadline:unavailable,
    originalSourceClockInvalidOrUnknown:clock,
    originalAvailabilityOrderDisagreements:order,
    foldArmHorizonCells:cells
  };
  const reasons:string[]=[];
  if(pins.expectedFoldCount<pins.minimumOosFolds||
    distinctDays.size<pins.minimumDistinctOosDays||
    datesWithoutAttempt(cells))reasons.push('INSUFFICIENT_DISTINCT_OOS_FOLDS_OR_DAYS');
  if(observed<pins.minimumObservedEntries)
    reasons.push('PREDECLARED_MINIMUM_OOS_ENTRIES_NOT_MET');
  if(missing>0)reasons.push('SELECTED_ORIGINAL_OPTION_ENTRY_L1_MISSING');
  if(clock>0)reasons.push('SELECTED_OPTION_ORIGINAL_L1_CLOCK_MISSING_OR_INVALID');
  if(unavailable>0)reasons.push('SELECTED_OPTION_ENTRY_NOT_AVAILABLE_BY_DEADLINE');
  if(order>0)reasons.push('EVENT_ORDER_DIFFERS_FROM_SOURCE_AVAILABLE_ENTRY_ORDER');
  if(exact!==observed)reasons.push('ORIGINAL_OBSERVED_ENTRY_SOURCE_JOIN_INCOMPLETE');
  return reasons.length?{...report,status:'INCOMPLETE_EVIDENCE',reasonCodes:reasons}:
    {...report,status:'DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY'};
}
function datesWithoutAttempt(cells:Phase50FoldArmHorizonCoverage[]):boolean{
  return cells.some(c=>c.decisionAttempts===0);
}
