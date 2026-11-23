/**
 * Adaptive v2 Phase48: strictly OFFLINE ENTRY-FIRST OOS risk-evidence join.
 *
 * Phase47 Greek/gap observations were operator-selected. Never count them
 * as market-regime/ranker results unless their ORIGINAL instrument/expiry,
 * entry quote and pre-close/post-open L1 bytes join the independently
 * re-computed Phase8 OOS entry universe. Retain EVERY attempt in denominator.
 *
 * Same risk path may appear under several strategy arms: that is overlapping
 * exposure to ONE source path, NOT independent empirical observations.
 * No source-authenticated L1, licensed Greeks, actual fills or NRML stops.
 */
import {createHash} from 'node:crypto';
import {
  buildAdaptiveEntryFirstCohort,
  type CohortDecision
} from './adaptiveEntryFirstCohort.js';
import type {
  HistoricalComparisonInput,HistoricalArm,HistoricalExecutableQuote
} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';
import {
  auditPhase47FrozenGreekGapResidual,
  type Phase47GreekRiskInput,type Phase47IndependentPins,
  type Phase47GreekRiskPolicy,type Phase47GreekResidualCell
} from './adaptiveUpstoxPhase47FrozenGreekGapResidual.js';

const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HASH=/^[a-f0-9]{64}$/;
const SHA=(x:unknown)=>createHash('sha256').update(JSON.stringify(x))
  .digest('hex');
const MS=(s:unknown):number=>typeof s==='string'?Date.parse(s):NaN;
const istDate=(epoch:number)=>Number.isFinite(epoch)?
  new Date(epoch+330*60000).toISOString().slice(0,10):null;
const finite=(x:unknown):x is number=>typeof x==='number'&&
  Number.isFinite(x);
const attemptKey=(x:CohortDecision)=>
  x.foldIndex+'|'+x.arm+'|'+x.horizon+'|'+x.decisionAt;
export interface Phase48EntryRiskJoinInput {
  schemaVersion:'ADAPTIVE_PHASE48_OOS_ENTRY_GREEK_RISK_JOIN_V1';
  source:'OFFLINE_UNAUTHENTICATED_VENDOR_COHORT';
  historical:HistoricalComparisonInput;
  phase47:Phase47GreekRiskInput;
  phase47Pins:Phase47IndependentPins;
  phase47Policy:Phase47GreekRiskPolicy;
}
export interface Phase48IndependentPins {
  schemaVersion:'INDEPENDENT_PHASE48_OOS_ENTRY_RISK_JOIN_PINS_V1';
  expectedStudyDatasetId:string;
  expectedOriginalHistoricalInputSha256:string;
  expectedPhase47ArchiveSha256:string;
  expectedPhase47PinsSha256:string;
  expectedPhase47PolicySha256:string;
  /** Prespecified universe, not re-estimated after looking at L1 outcomes. */
  expectedOosTestDecisionCount:number;
  expectedOosAttemptCount:number;
  /** Phase47 has four paths; matching across arms is allowed but not independent. */
  expectedRiskInstrumentKeys:Record<HorizonBucket,string>;
}
export interface Phase48ArmHorizonCoverage {
  arm:HistoricalArm;
  horizon:HorizonBucket;
  testDecisions:number;
  entryObserved:number;
  missingPointInTimeEntryL1:number;
  noTradeOrFiltered:number;
  riskPathJoined:number;
  selectedEntryMissingMatchingOriginalPath:number;
  duplicateUnderlyingRiskPathSharedAcrossArms:number;
  totalGreekResidualRiskAlerts:number;
  fullDenominatorPreserved:true;
  matchedOriginalDataSourceAuthenticated:false;
  independentOutOfSampleProfitabilityProven:false;
}
export interface Phase48EntryRiskJoinReport {
  mode:'OFFLINE_ENTRY_FIRST_OOS_OPTION_RISK_PATH_JOIN';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_COMPLETE_SELECTED_ENTRY_COVERAGE_ONLY';
  reasonCodes:string[];
  datasetSynthetic:boolean|null;
  testDecisionCount:number;
  totalDecisionArmHorizonAttempts:number;
  selectedOosEntries:number;
  selectedEntriesWithOriginalQuotePath:number;
  selectedEntriesWithoutOriginalQuotePath:number;
  pathUniverseCount:number;
  uniqueRiskPathsActuallyMatched:number;
  riskPathsUnmatchedToAnySelectedOosEntry:number;
  missingOriginalEntryL1Attempts:number;
  armHorizonCells:Phase48ArmHorizonCoverage[];
  originalLicensedL1IndependentlyAuthenticated:false;
  vendorHistoricalLicenseIndependentlyVerified:false;
  trueOriginalAvailableAtVerified:false;
  independentlyAuthenticatedExchangeContractMaster:false;
  chronologicalOosProfitabilityProven:false;
  fourRiskPathsRepresentAllPossibleTrades:false;
  modelGreekAttributionCausallyVerified:false;
  nativeBrokerStopsInstalled:false;
  protectedOvernight:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'PHASE48_JOINS_ONLY_FOUR_ORIGINAL_OPTION_PATHS_TO_RECOMPUTED_OOS_SELECTION',
  'FOUR_PATH_COVERAGE_IS_NOT_A_MULTI_FOLD_HISTORICAL_PERFORMANCE_STUDY',
  'ALL_ARM_HORIZON_DECISIONS_RETAINED_IN_DENOMINATOR_INCLUDING_NO_TRADE',
  'THE_SAME_SELECTED_L1_CONTRACT_CAN_APPEAR_IN_MULTIPLE_ARMS_NOT_INDEPENDENT',
  'NO_FAKE_FUTURE_QUOTE_OR_RESELECTION_OF_A_FAVORABLE_OPTION_IS_ALLOWED',
  'MISSING_OR_UNPRICED_ENTRIES_REMAIN_UNPRICED_NOT_ZERO_OR_WINS',
  'SOURCE_AVAILABLE_AT_ON_HISTORICAL_EXECUTION_QUOTES_NOT_AUTHENTICATED',
  'PHASE49_REQUIRES_SOURCE_EXACT_AVAILABLE_AT_FOR_ALL_SELECTED_OPTION_QUOTES',
  'PHASE49_REJECTS_PRE_CLOSE_AND_FIRST_NEXT_SESSION_QUOTE_CHERRY_PICKING',
  'SELF_SUPPLIED_SHA256_PINS_DO_NOT_AUTHENTICATE_DATA_VENDOR_LICENSE',
  'EXPIRY_CASH_SETTLEMENT_AND_MARKET_CALENDAR_NOT_EXCHANGE_AUTHENTICATED',
  'ORIGINAL_GREEKS_IV_AND_THEIR_MODEL_CONVENTIONS_ARE_OPERATOR_ASSERTIONS',
  'NO_GENUINE_UPSTOX_NATIVE_STOP_ACK_OR_OVERNIGHT_LIQUIDITY_SURVIVAL',
  'NO_LIVE_NRML_ORDER_GTT_WRITE_OR_POSITIONAL_15_15_EXIT'
];
const empty=():Phase48EntryRiskJoinReport=>({
  mode:'OFFLINE_ENTRY_FIRST_OOS_OPTION_RISK_PATH_JOIN',
  status:'INVALID_EVIDENCE',reasonCodes:[],datasetSynthetic:null,
  testDecisionCount:0,totalDecisionArmHorizonAttempts:0,
  selectedOosEntries:0,selectedEntriesWithOriginalQuotePath:0,
  selectedEntriesWithoutOriginalQuotePath:0,pathUniverseCount:0,
  uniqueRiskPathsActuallyMatched:0,
  riskPathsUnmatchedToAnySelectedOosEntry:0,
  missingOriginalEntryL1Attempts:0,armHorizonCells:[],
  originalLicensedL1IndependentlyAuthenticated:false,
  vendorHistoricalLicenseIndependentlyVerified:false,
  trueOriginalAvailableAtVerified:false,
  independentlyAuthenticatedExchangeContractMaster:false,
  chronologicalOosProfitabilityProven:false,
  fourRiskPathsRepresentAllPossibleTrades:false,
  modelGreekAttributionCausallyVerified:false,
  nativeBrokerStopsInstalled:false,protectedOvernight:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const deny=(code:string,status:Phase48EntryRiskJoinReport['status']=
  'INVALID_EVIDENCE'):Phase48EntryRiskJoinReport=>({
  ...empty(),status,reasonCodes:[code]
});
export function hashPhase48Evidence(value:unknown):string{return SHA(value);}
function validPin(p:Phase48IndependentPins):boolean{
  return !!p&&p.schemaVersion===
    'INDEPENDENT_PHASE48_OOS_ENTRY_RISK_JOIN_PINS_V1'&&
    typeof p.expectedStudyDatasetId==='string'&&
    /^[A-Za-z0-9_.:-]{4,120}$/.test(p.expectedStudyDatasetId)&&
    [p.expectedOriginalHistoricalInputSha256,p.expectedPhase47ArchiveSha256,
      p.expectedPhase47PinsSha256,p.expectedPhase47PolicySha256]
      .every(x=>typeof x==='string'&&HASH.test(x))&&
    Number.isSafeInteger(p.expectedOosTestDecisionCount)&&
    p.expectedOosTestDecisionCount>=1&&
    p.expectedOosTestDecisionCount<=10000&&
    p.expectedOosAttemptCount===p.expectedOosTestDecisionCount*12&&
    !!p.expectedRiskInstrumentKeys&&
    Object.keys(p.expectedRiskInstrumentKeys).length===4&&
    HORIZONS.every(h=>typeof p.expectedRiskInstrumentKeys[h]==='string'&&
      p.expectedRiskInstrumentKeys[h].length>5&&
      p.expectedRiskInstrumentKeys[h].length<150);
}
function entryLinkIsExact(
  a:CohortDecision,
  source:Phase47GreekRiskInput,
  horizon:HorizonBucket,
  quotes:Map<string,HistoricalExecutableQuote>,
  history:Map<string,HistoricalExecutableQuote[]>
):boolean{
  const risk=source.phase46Input.paths.find(p=>p.horizon===horizon);
  if(!risk||!a.entryAt||!a.expiry||!a.instrumentKey||
    a.entryAsk===null||a.entryBid===null||a.quantity===null)
    return false;
  if(risk.instrumentKey!==a.instrumentKey||
    risk.horizon!==a.horizon||
    risk.quantity!==a.quantity||
    risk.entryQuote.instrumentKey!==a.instrumentKey||
    risk.entryQuote.observedAt!==a.entryAt||
    risk.entryQuote.ask!==a.entryAsk||
    risk.entryQuote.bid!==a.entryBid||
    !Number.isSafeInteger(risk.lotSize)||
    a.quantity%risk.lotSize!==0||
    istDate(MS(risk.expiryAt))!==a.expiry||
    istDate(MS(risk.entryQuote.observedAt))!==a.sessionDate||
    istDate(MS(risk.preCloseQuote.observedAt))!==a.sessionDate||
    istDate(MS(risk.nextOpenQuote.observedAt))<=a.sessionDate||
    MS(risk.entryDecisionAt)<MS(a.entryAt)||
    MS(risk.entryDecisionAt)-MS(a.entryAt)>30000||
    MS(risk.entryDecisionAt)<=MS(a.decisionAt))
    return false;
  // Phase46 source ASK at entry is tied to exact first selected original L1
  // observation, not to a later improved fill or different strike/expiry.
  const original=quotes.get(a.instrumentKey+'|'+a.entryAt);
  if(!original||original.ask!==a.entryAsk||original.bid!==a.entryBid||
    original.askQty!==risk.entryQuote.displayedAskQuantity||
    original.bidQty!==risk.entryQuote.displayedBidQuantity||
    original.availableAt!==risk.entryQuote.availableAt||
    !Number.isFinite(MS(original.availableAt))||
    MS(original.availableAt)<MS(original.observedAt)||
    MS(original.availableAt)>MS(risk.entryDecisionAt))
    return false;
  // The exact original preclose/nextopen optional best bid/ask snapshots
  // must also exist in the same source universe, not a separate synthetic
  // only favorable closing/high/last-trade sample.
  for(const tick of [risk.preCloseQuote,risk.nextOpenQuote]){
    const q=quotes.get(a.instrumentKey+'|'+tick.observedAt);
    if(!q||q.bid!==tick.bid||q.ask!==tick.ask||
      q.bidQty!==tick.displayedBidQuantity||
      q.askQty!==tick.displayedAskQuantity||
      q.availableAt!==tick.availableAt||
      !Number.isFinite(MS(q.availableAt))||
      MS(q.availableAt)<MS(q.observedAt))
      return false;
  }
  // No look-ahead via a separately asserted availability time or a
  // hand-picked, favorable preclose/next-open observation. The original
  // contract timeline (not a replacement Greek path) determines both.
  const series=history.get(a.instrumentKey)??[];
  const entryTime=MS(a.entryAt);
  const preCloseCutoff=MS(risk.preCloseAt);
  const nextOpenTime=MS(risk.nextOpenQuote.observedAt);
  if(![entryTime,preCloseCutoff,nextOpenTime].every(Number.isFinite))
    return false;
  let lastPreClose:HistoricalExecutableQuote|undefined;
  let firstNextSession:HistoricalExecutableQuote|undefined;
  for(const q of series){
    const at=MS(q.observedAt),available=MS(q.availableAt);
    if(!Number.isFinite(at))return false;
    // Any quote in the selected contract's relevant observation window
    // with unknown/retroactive availability makes chronology unprovable.
    if(at>=entryTime&&at<=nextOpenTime&&
      (!Number.isFinite(available)||available<at))return false;
    const day=istDate(at);
    if(day===a.sessionDate&&at>=entryTime&&at<=preCloseCutoff&&
      Number.isFinite(available)&&available<=preCloseCutoff&&
      (!lastPreClose||at>MS(lastPreClose.observedAt)))
      lastPreClose=q;
    if(day!==null&&day>a.sessionDate&&
      (!firstNextSession||at<MS(firstNextSession.observedAt)))
      firstNextSession=q;
  }
  if(lastPreClose?.observedAt!==risk.preCloseQuote.observedAt||
    firstNextSession?.observedAt!==risk.nextOpenQuote.observedAt)
    return false;
  return true;
}
/** No actual OOS performance statistics are computed from unmatched paths. */
export function auditPhase48OosEntryRiskCoverage(
  input:Phase48EntryRiskJoinInput,pins:Phase48IndependentPins
):Phase48EntryRiskJoinReport{
  if(!input||!validPin(pins)||input.schemaVersion!==
      'ADAPTIVE_PHASE48_OOS_ENTRY_GREEK_RISK_JOIN_V1'||
    input.source!=='OFFLINE_UNAUTHENTICATED_VENDOR_COHORT'||
    !input.historical||!input.phase47||!input.phase47Pins||
    !input.phase47Policy||!input.phase47.phase46Input||
    !Array.isArray(input.phase47.phase46Input.paths)||
    input.historical.provenance?.datasetId!==pins.expectedStudyDatasetId||
    SHA(input.historical)!==pins.expectedOriginalHistoricalInputSha256||
    SHA(input.phase47)!==pins.expectedPhase47ArchiveSha256||
    SHA(input.phase47Pins)!==pins.expectedPhase47PinsSha256||
    SHA(input.phase47Policy)!==pins.expectedPhase47PolicySha256)
    return deny('PINNED_OOS_COHORT_OR_GREEK_SOURCE_NOT_EXACT');
  const synthetic=input.historical.provenance?.synthetic;
  const dataset=input.phase47.phase46Input.datasetLabel;
  if(typeof synthetic!=='boolean'||(synthetic?
      dataset!=='SYNTHETIC_TEST':
      dataset!=='OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED'))
    return deny('ORIGINAL_COHORT_AND_RISK_SOURCE_CLASS_DISAGREE');
  const greek=auditPhase47FrozenGreekGapResidual(
    input.phase47,input.phase47Pins,input.phase47Policy);
  if(!['DESCRIPTIVE_GREEK_RESIDUAL_ONLY',
    'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY'].includes(greek.status)||
    greek.executionAuthorized!==false||greek.cells.length!==4)
    return deny('PHASE47_ORIGINAL_L1_GREEK_RESIDUAL_REAUDIT_FAILED',
      'INCOMPLETE_EVIDENCE');
  const cohort=buildAdaptiveEntryFirstCohort(input.historical);
  if(cohort.status!=='ENTRY_COHORT_RECORDED'||
    cohort.attempts.length!==pins.expectedOosAttemptCount||
    cohort.counts.testDecisions!==pins.expectedOosTestDecisionCount||
    cohort.attempts.length!==cohort.counts.testDecisions*12)
    return deny('ORIGINAL_ENTRY_FIRST_FOLD_UNIVERSE_INVALID_OR_CHANGED',
      'INCOMPLETE_EVIDENCE');
  const seen=new Set<string>(),grouped=new Map<string,CohortDecision[]>();
  for(const a of cohort.attempts){
    const k=attemptKey(a),g=a.arm+'|'+a.horizon;
    if(seen.has(k)||!ARMS.includes(a.arm)||!HORIZONS.includes(a.horizon)||
      !Number.isSafeInteger(a.foldIndex)||a.foldIndex<0||
      a.foldIndex>=input.historical.policy.folds.length||
      !Number.isFinite(MS(a.decisionAt))||
      istDate(MS(a.decisionAt))!==a.sessionDate)
      return deny('DUPLICATED_OR_UNDECLARED_OOS_DECISION_ATTEMPT');
    seen.add(k);
    grouped.set(g,[...(grouped.get(g)??[]),a]);
  }
  if(ARMS.some(arm=>HORIZONS.some(h=>
    (grouped.get(arm+'|'+h)?.length??0)!==
      cohort.counts.testDecisions)))
    return deny('MISSING_ARM_HORIZON_DECISION_IN_ORIGINAL_DENOMINATOR');
  const riskByHorizon=new Map<HorizonBucket,Phase47GreekResidualCell>();
  for(const r of greek.cells){
    if(riskByHorizon.has(r.horizon))return deny(
      'DUPLICATE_GREEK_HORIZON_IN_REAUDITED_SOURCE');
    riskByHorizon.set(r.horizon,r);
  }
  if(HORIZONS.some(h=>
    input.phase47.phase46Input.paths.find(p=>p.horizon===h)
      ?.instrumentKey!==pins.expectedRiskInstrumentKeys[h]))
    return deny('RISK_CONTRACT_KEYS_NOT_PREDECLARED_IN_JOIN_PIN');
  const quotes=new Map<string,HistoricalExecutableQuote>();
  const history=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of input.historical.executionQuotes){
    const k=q.instrumentKey+'|'+q.observedAt;
    if(quotes.has(k))return deny('DUPLICATE_ORIGINAL_OPTION_L1_RECORD');
    quotes.set(k,q);
    const seq=history.get(q.instrumentKey)??[];
    seq.push(q);
    history.set(q.instrumentKey,seq);
  }
  const linked=new Set<HorizonBucket>();
  const cells:Phase48ArmHorizonCoverage[]=[];
  let selected=0,matched=0,missed=0,missingL1=0;
  for(const arm of ARMS)for(const horizon of HORIZONS){
    const attempts=grouped.get(arm+'|'+horizon)!;
    let entries=0,linkedHere=0,missingHere=0,nonEntries=0,
      unpriced=0,alerts=0;
    for(const a of attempts){
      if(a.disposition==='MISSING_EXECUTABLE_ENTRY_L1'){
        missingL1++;unpriced++;
      }
      if(a.disposition!=='ENTRY_OBSERVED'){
        nonEntries++;continue;
      }
      selected++;entries++;
      if(!entryLinkIsExact(a,input.phase47,horizon,quotes,history)){
        missed++;missingHere++;continue;
      }
      linked.add(horizon);matched++;linkedHere++;
      const rc=riskByHorizon.get(horizon);
      if(!rc)return deny('MISSING_GREEK_RISK_CELL_FOR_MATCHED_ENTRY');
      if(rc.residualRiskAlert||rc.ivShockRiskAlert||
        rc.thetaMagnitudeRiskAlert||
        rc.declaredExpiryProximityAlert||rc.modelMayProduceNegativePremium)
        alerts++;
    }
    cells.push({
      arm,horizon,testDecisions:attempts.length,
      entryObserved:entries,missingPointInTimeEntryL1:unpriced,
      noTradeOrFiltered:nonEntries-unpriced,riskPathJoined:linkedHere,
      selectedEntryMissingMatchingOriginalPath:missingHere,
      duplicateUnderlyingRiskPathSharedAcrossArms:0,
      totalGreekResidualRiskAlerts:alerts,
      fullDenominatorPreserved:true,
      matchedOriginalDataSourceAuthenticated:false,
      independentOutOfSampleProfitabilityProven:false
    });
  }
  // Count same market path reused by several arms without multiplying the
  // apparent independent observed trading sample size.
  for(const horizon of linked){
    const holders=cells.filter(c=>c.horizon===horizon&&
      c.riskPathJoined>0);
    if(holders.length>1){
      holders.forEach(c=>{
        c.duplicateUnderlyingRiskPathSharedAcrossArms=
          holders.length-1;
      });
    }
  }
  const unmatched=4-linked.size;
  const report:Phase48EntryRiskJoinReport={
    ...empty(),datasetSynthetic:synthetic,
    testDecisionCount:cohort.counts.testDecisions,
    totalDecisionArmHorizonAttempts:cohort.attempts.length,
    selectedOosEntries:selected,selectedEntriesWithOriginalQuotePath:matched,
    selectedEntriesWithoutOriginalQuotePath:missed,
    missingOriginalEntryL1Attempts:missingL1,
    pathUniverseCount:4,uniqueRiskPathsActuallyMatched:linked.size,
    riskPathsUnmatchedToAnySelectedOosEntry:unmatched,
    armHorizonCells:cells
  };
  if(missed>0||missingL1>0||unmatched>0)
    return {...report,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:[
        ...(missed>0?['OOS_SELECTED_ENTRY_MISSING_EXACT_ORIGINAL_RISK_PATH']:[]),
        ...(missingL1>0?['ORIGINAL_SELECTED_ENTRY_L1_UNPRICED_IN_DENOMINATOR']:[]),
        ...(unmatched>0?['OPERATOR_SELECTED_RISK_PATH_HAS_NO_OOS_ENTRY']:[])
      ]};
  return {...report,status:'DESCRIPTIVE_COMPLETE_SELECTED_ENTRY_COVERAGE_ONLY'};
}
