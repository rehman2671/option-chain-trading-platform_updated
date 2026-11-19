/**
 * Adaptive Swing v2 Phase60: predeclared horizon × market-regime ORIGINAL
 * out-of-sample evidence sufficiency gate. No return optimization, horizon
 * winner selection, live contract choice or broker order path.
 *
 * Required: nested Phase59 → Phase58 → Phase57 → Phase51 → Phase50 →
 * original Phase8 entry-first source and all zero/no-trade cohorts. Only
 * descriptive source coverage, expiry-window coherence, fold independence,
 * per-regime sample richness and risk-alert provenance are considered.
 *
 * Genuine source licensing, availability-clock provenance, profitability,
 * IV/theta calibration, broker NRML stop ACK remain UNVERIFIED even after
 * any purely software descriptive coverage status.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase59MatchedPremiumReversalGap,
  type Phase59Input,type Phase59IndependentPins,type Phase59Report,
  type Phase59Cell
} from './adaptivePhase59PremiumGapCohortJoin.js';
import {buildAdaptiveEntryFirstCohort} from './adaptiveEntryFirstCohort.js';
import {analyzeAdaptiveRegime,type AdaptiveRegime}
  from './adaptiveMarketRegime.js';
import type {HistoricalArm} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';

const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const SHA=/^[a-f0-9]{64}$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const BINS:Record<HorizonBucket,readonly [number,number]>={
  '1W':[1,8],'2W':[8,18],'4W':[18,36],'8W':[36,80]
};
const MS_DAY=86400000;
const hash=(x:unknown):string=>createHash('sha256')
  .update(JSON.stringify(x)).digest('hex');
export const hashPhase60Evidence=hash;
const finiteInt=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const cellKey=(x:{regime:AdaptiveRegime;arm:HistoricalArm;
  horizon:HorizonBucket})=>[x.regime,x.arm,x.horizon].join('|');
const decisionKey=(fold:number,at:string,arm:HistoricalArm)=>
  [fold,at,arm].join('|');
const firstInRange=(value:number,[low,high]:readonly [number,number])=>
  value>=low&&value<=high;

export interface Phase60CoveragePolicy{
  schemaVersion:'ADAPTIVE_PHASE60_PREREGISTERED_OOS_HORIZON_REVIEW_V1';
  source:'OFFLINE_COVERAGE_THRESHOLDS_UNVERIFIED';
  minimumDistinctOosFolds:number;
  minimumOriginalOosDecisionDays:number;
  minimumDistinctDecisionTimeMarketRegimes:number;
  minimumOosDecisionDaysPerRegime:number;
  minimumEnteredOosDaysPerRegimeArmHorizon:number;
  minimumSameDecisionFourHorizonPairsPerRegimeArm:number;
  minimumOriginalOvernightGapPathsPerRegimeArmHorizon:number;
  minimumCalendarSpanDaysBetweenFirstAndLastOosDate:number;
  minimumDaysBeyondMaximumHoldUntilListedExpiry:number;
}
export interface Phase60Input{
  schemaVersion:'ADAPTIVE_PHASE60_HORIZON_REGIME_OOS_COVERAGE_V1';
  source:'OFFLINE_UNVERIFIED_LONG_OPTION_MARKET_TAPE';
  phase59:Phase59Input;
  phase59Pins:Phase59IndependentPins;
  policy:Phase60CoveragePolicy;
}
export interface Phase60IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE60_ORIGINAL_OOS_COVERAGE_PINS_V1';
  expectedPhase59InputSha256:string;
  expectedPhase59PinsSha256:string;
  expectedCoveragePolicySha256:string;
  /** Fold × original test-date × entry-decision-time; never remove no trades. */
  expectedOriginalOosFoldDecisionManifestSha256:string;
  expectedOriginalOosDecisionDays:number;
  expectedOriginalArmHorizonAttempts:number;
}
export interface Phase60RegimeArmHorizonCell{
  regime:AdaptiveRegime;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  originalOosAttempts:number;
  originalNoEntryAttempts:number;
  observedEntries:number;
  distinctEntryOosDays:number;
  distinctEntryFolds:number;
  originalPhase19DepthQualifiedRunups:number;
  originalPhase19ReversalsBeforeTarget:number;
  originalOvernightHeldEntries:number;
  phase46FullOriginalNextOpenGapPaths:number;
  phase46AdverseNextOpenGapOrCashAlerts:number;
  originalSourceCensoredPaths:number;
  observedListedExpiryBucketMismatches:number;
  observedMaximumHoldToExpiryBufferViolations:number;
  minimumDaysToListedExpiryAtOriginalEntry:number|null;
  maximumDaysToListedExpiryAtOriginalEntry:number|null;
  matchedAllFourHorizonEntryDecisionsSameRegimeArm:number;
  predeclaredSampleCoverageQualified:boolean;
  riskAlertObserved:boolean;
  /** No rank, signal or approved horizon inferred from a qualifying cell. */
  tradeOrHorizonRecommendationAuthorized:false;
}
export interface Phase60Report{
  mode:'OFFLINE_ORIGINAL_OOS_REGIME_BY_HORIZON_RESEARCH_EVIDENCE_SUFFICIENCY';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_COVERAGE_INSUFFICIENT_ONLY'|
    'DESCRIPTIVE_DOWNSIDE_RISK_ALERT_ONLY'|
    'DESCRIPTIVE_COVERAGE_REVIEW_ONLY';
  reasonCodes:string[];
  phase59Status:Phase59Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisionDays:number;
  originalOosFolds:number;
  originalOosCalendarSpanDays:number;
  originalDistinctDecisionTimeRegimes:number;
  originalArmsPerDecision:3;
  originalHorizonsPerArm:4;
  fullOriginalDecisionArmHorizonAttempts:number;
  originalObservedEntries:number;
  distinctOriginalSourcePathsAcrossArms:number;
  originalUnpricedOrCensoredSelectedPaths:number;
  totalPerRegimeArmHorizonCells:number;
  predeclaredCoverageQualifiedCells:number;
  insufficientEvidenceCells:number;
  originalExpiryWindowOrHoldBufferMismatches:number;
  originalPremiumReversalObservations:number;
  originalNextOpenGapOrDebitAlerts:number;
  originalCashDebitRiskBoundNotStopFill:true;
  // Permanent negative claims:
  bestContractExpiryOrHorizonRankingAuthorized:false;
  calibratedIvThetaVegaExposureVerified:false;
  independentlyLicensedNseBseOptionL1Verified:false;
  independentlyAuthenticatedSourceArrivalClock:false;
  independentlyAuthenticatedListedContractAndExpiryMaster:false;
  unbiasedUntouchedHistoricalProfitabilityProven:false;
  brokerNrmlStopOrGttAcknowledged:false;
  overnightStopCannotGapOrGetRejected:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  rows:Phase60RegimeArmHorizonCell[];
  warnings:string[];
}
const WARN=[
  'RESEARCH_ONLY_NO_HORIZON_WINNER_SELECTION_FROM_OOS_TEST_DATA',
  'NO_INDEX_100_POINT_TARGET_IMPLIES_OPTION_PREMIUM_RETURN',
  'ALL_ORIGINAL_TEST_DATES_ARMS_HORIZONS_AND_NO_TRADES_REMAIN_IN_DENOMINATOR',
  'ONLY_UNSEEN_CHRONOLOGICAL_MULTIREGIME_OOS_WITH_REAL_L1_CAN_SUPPORT_REVIEW',
  'SELECTED_ENTRIES_PER_HORIZON_ARE_NOT_INDEPENDENT_ACROSS_POLICY_ARMS',
  'OBSERVED_PREMIUM_RUNUP_REVERSAL_AND_GAP_ARE_NOT_BROKER_EXECUTED_FILLS',
  'FOUR_HORIZON_SAME_DATE_PAIRS_MEASURE_COVERAGE_NOT_COMPARATIVE_PERFORMANCE',
  'EXCHANGE_EXPIRY_WINDOW_IS_OPERATOR_DECLARED_NOT_OFFICIALLY_ATTESTED',
  'FULL_LONG_OPTION_PREMIUM_DEBIT_CAN_GO_TO_ZERO_RECOVERY_OVERNIGHT',
  'UNPRICED_OPTION_PATH_IS_NEITHER_ZERO_LOSS_NOR_A_WIN',
  'NO_INDEPENDENT_IV_THETA_GAMMA_OR_GAP_LIKELIHOOD_VALIDATION',
  'NO_NATIVE_NRML_GTT_STOP_ACK_LIVE_TRADING_OR_FORCED_15_15_EXIT'
];
const empty=():Phase60Report=>({
  mode:'OFFLINE_ORIGINAL_OOS_REGIME_BY_HORIZON_RESEARCH_EVIDENCE_SUFFICIENCY',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase59Status:null,syntheticDataset:null,
  originalOosDecisionDays:0,originalOosFolds:0,
  originalOosCalendarSpanDays:0,originalDistinctDecisionTimeRegimes:0,
  originalArmsPerDecision:3,originalHorizonsPerArm:4,
  fullOriginalDecisionArmHorizonAttempts:0,
  originalObservedEntries:0,distinctOriginalSourcePathsAcrossArms:0,
  originalUnpricedOrCensoredSelectedPaths:0,
  totalPerRegimeArmHorizonCells:0,predeclaredCoverageQualifiedCells:0,
  insufficientEvidenceCells:0,originalExpiryWindowOrHoldBufferMismatches:0,
  originalPremiumReversalObservations:0,originalNextOpenGapOrDebitAlerts:0,
  originalCashDebitRiskBoundNotStopFill:true,
  bestContractExpiryOrHorizonRankingAuthorized:false,
  calibratedIvThetaVegaExposureVerified:false,
  independentlyLicensedNseBseOptionL1Verified:false,
  independentlyAuthenticatedSourceArrivalClock:false,
  independentlyAuthenticatedListedContractAndExpiryMaster:false,
  unbiasedUntouchedHistoricalProfitabilityProven:false,
  brokerNrmlStopOrGttAcknowledged:false,
  overnightStopCannotGapOrGetRejected:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,rows:[],warnings:WARN
});
const fail=(reason:string,
  status:Phase60Report['status']='INVALID_EVIDENCE',
  partial?:Partial<Phase60Report>):Phase60Report=>({
  ...empty(),...partial,status,reasonCodes:[reason]
});
function validPolicy(p:Phase60CoveragePolicy):boolean{
  return !!p&&p.schemaVersion===
      'ADAPTIVE_PHASE60_PREREGISTERED_OOS_HORIZON_REVIEW_V1'&&
    p.source==='OFFLINE_COVERAGE_THRESHOLDS_UNVERIFIED'&&
    finiteInt(p.minimumDistinctOosFolds,2,30)&&
    finiteInt(p.minimumOriginalOosDecisionDays,2,100000)&&
    finiteInt(p.minimumDistinctDecisionTimeMarketRegimes,2,5)&&
    finiteInt(p.minimumOosDecisionDaysPerRegime,2,10000)&&
    finiteInt(p.minimumEnteredOosDaysPerRegimeArmHorizon,2,10000)&&
    finiteInt(p.minimumSameDecisionFourHorizonPairsPerRegimeArm,1,10000)&&
    finiteInt(p.minimumOriginalOvernightGapPathsPerRegimeArmHorizon,1,10000)&&
    finiteInt(p.minimumCalendarSpanDaysBetweenFirstAndLastOosDate,1,20000)&&
    finiteInt(p.minimumDaysBeyondMaximumHoldUntilListedExpiry,0,10);
}
export function originalPhase60FoldManifest(
  historical:Phase59Input['phase58']['phase57']['phase51']['phase50']['historical']
):string[]{
  const out:string[]=[];
  for(let i=0;i<historical.policy.folds.length;i++){
    const fold=historical.policy.folds[i];
    for(const d of historical.decisions){
      if(d.sessionDate>=fold.testStart&&d.sessionDate<=fold.testEnd)
        out.push(i+'|'+d.sessionDate+'|'+d.decisionAt);
    }
  }
  return out;
}
export function auditPhase60HorizonRegimeSufficiency(
  input:Phase60Input,pins:Phase60IndependentPins
):Phase60Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE60_HORIZON_REGIME_OOS_COVERAGE_V1'||
    input.source!=='OFFLINE_UNVERIFIED_LONG_OPTION_MARKET_TAPE'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE60_ORIGINAL_OOS_COVERAGE_PINS_V1'||
    !input.phase59||!input.phase59Pins||!validPolicy(input.policy)||
    ![pins.expectedPhase59InputSha256,pins.expectedPhase59PinsSha256,
      pins.expectedCoveragePolicySha256,
      pins.expectedOriginalOosFoldDecisionManifestSha256].every(x=>
      typeof x==='string'&&SHA.test(x))||
    pins.expectedPhase59InputSha256!==hash(input.phase59)||
    pins.expectedPhase59PinsSha256!==hash(input.phase59Pins)||
    pins.expectedCoveragePolicySha256!==hash(input.policy)||
    !finiteInt(pins.expectedOriginalOosDecisionDays,2,100000)||
    pins.expectedOriginalArmHorizonAttempts!==
      pins.expectedOriginalOosDecisionDays*12)
    return fail('PHASE60_INDEPENDENT_ORIGINAL_SOURCE_OR_COVERAGE_POLICY_PINS_INVALID');
  const source=input.phase59.phase58.phase57.phase51.phase50.historical;
  let originalManifest:string[];
  try{originalManifest=originalPhase60FoldManifest(source);}
  catch{return fail('ORIGINAL_CHRONOLOGICAL_FOLD_MANIFEST_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  if(hash(originalManifest)!==
      pins.expectedOriginalOosFoldDecisionManifestSha256||
    originalManifest.length!==pins.expectedOriginalOosDecisionDays||
    new Set(originalManifest).size!==originalManifest.length)
    return fail('ORIGINAL_FOLD_SESSION_MANIFEST_CHANGED_OR_DROPPED',
      'INCOMPLETE_EVIDENCE');
  let previous:Phase59Report;
  try{
    previous=auditPhase59MatchedPremiumReversalGap(
      input.phase59,input.phase59Pins);
  }catch{return fail('PHASE59_ORIGINAL_PREMIUM_AND_GAP_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const partial:Partial<Phase60Report>={
    phase59Status:previous.status,
    syntheticDataset:previous.syntheticDataset,
    originalOosDecisionDays:previous.originalOosDecisionSessions,
    fullOriginalDecisionArmHorizonAttempts:
      previous.originalArmHorizonAttempts,
    originalObservedEntries:previous.originalEnteredOptionPaths,
    distinctOriginalSourcePathsAcrossArms:
      previous.distinctOriginalOptionEntryPathsAcrossAlternativeArms,
    originalUnpricedOrCensoredSelectedPaths:
      previous.originalSourceOrNextOpenCensoredPaths
  };
  if(!previous.status.startsWith('DESCRIPTIVE_')||
    previous.originalOosDecisionSessions!==
      pins.expectedOriginalOosDecisionDays||
    previous.originalArmHorizonAttempts!==
      pins.expectedOriginalArmHorizonAttempts||
    !previous.originalOosArmHorizonDenominatorPreserved||
    previous.originalSourceOrNextOpenCensoredPaths!==0||
    previous.fullyAuditedOriginalPreTriggerBidPaths!==
      previous.originalEnteredOptionPaths||
    previous.exactFirstNextOpenGapRiskPaths!==
      previous.overnightExposedOriginalEntries)
    return fail('PHASE59_FULL_ORIGINAL_OOS_PREMIUM_GAP_SOURCE_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  const original=buildAdaptiveEntryFirstCohort(source);
  if(original.status!=='ENTRY_COHORT_RECORDED'||
    original.attempts.length!==pins.expectedOriginalArmHorizonAttempts)
    return fail('PHASE8_ORIGINAL_ENTRY_FIRST_SOURCE_UNRECONCILED',
      'INCOMPLETE_EVIDENCE',partial);
  const decisionMap=new Map(source.decisions.map(d=>[d.decisionAt,d]));
  const byCell=new Map(previous.cells.map(c=>[cellKey(c),c]));
  if(byCell.size!==previous.cells.length)
    return fail('PHASE59_REGIME_ARM_HORIZON_CELL_DUPLICATED',
      'INCOMPLETE_EVIDENCE',partial);
  const rows=new Map<string,{
    originalOosAttempts:number;
    originalNoEntryAttempts:number;
    observedEntries:number;
    enteredDays:Set<string>;
    enteredFolds:Set<number>;
    expiryMismatch:number;
    bufferViolation:number;
    minDays:number|null;
    maxDays:number|null;
  }>();
  const foldRegimeDays=new Map<AdaptiveRegime,Set<string>>();
  const decisionFoldIds=new Set<number>(),dateKeys=new Set<string>();
  const pairKeyEntries=new Map<string,Set<HorizonBucket>>();
  const decisionArmByGroup=new Map<string,{
    regime:AdaptiveRegime;arm:HistoricalArm;day:string
  }>();
  const seenAttempts=new Set<string>();
  for(const a of original.attempts){
    const unique=[a.foldIndex,a.decisionAt,a.arm,a.horizon].join('|');
    if(seenAttempts.has(unique)||!ARMS.includes(a.arm)||
      !HORIZONS.includes(a.horizon))
      return fail('DUPLICATE_OR_UNSUPPORTED_ORIGINAL_ENTRY_COHORT_ATTEMPT',
        'INCOMPLETE_EVIDENCE',partial);
    seenAttempts.add(unique);
    const d=decisionMap.get(a.decisionAt);
    const fold=source.policy.folds[a.foldIndex];
    if(!d||!fold||d.sessionDate!==a.sessionDate||
      a.sessionDate<fold.testStart||a.sessionDate>fold.testEnd)
      return fail('ORIGINAL_ENTRY_NOT_IN_ITS_DECLARED_OOS_FOLD',
        'INCOMPLETE_EVIDENCE',partial);
    const regime=analyzeAdaptiveRegime(
      d.candles,new Date(Date.parse(a.decisionAt))).regime;
    const entryKey=cellKey({regime,arm:a.arm,horizon:a.horizon});
    const originalKey=[a.foldIndex,a.sessionDate,a.decisionAt].join('|');
    decisionFoldIds.add(a.foldIndex);
    dateKeys.add(originalKey);
    const rg=foldRegimeDays.get(regime)??new Set<string>();
    rg.add(originalKey);foldRegimeDays.set(regime,rg);
    let row=rows.get(entryKey);
    if(!row){
      row={originalOosAttempts:0,originalNoEntryAttempts:0,
        observedEntries:0,enteredDays:new Set(),enteredFolds:new Set(),
        expiryMismatch:0,bufferViolation:0,
        minDays:null,maxDays:null};
      rows.set(entryKey,row);
    }
    row.originalOosAttempts++;
    if(a.disposition!=='ENTRY_OBSERVED'){
      row.originalNoEntryAttempts++;
      continue;
    }
    row.observedEntries++;
    row.enteredDays.add(originalKey);
    row.enteredFolds.add(a.foldIndex);
    const group=decisionKey(a.foldIndex,a.decisionAt,a.arm);
    const set=pairKeyEntries.get(group)??new Set<HorizonBucket>();
    set.add(a.horizon);pairKeyEntries.set(group,set);
    decisionArmByGroup.set(group,{regime,arm:a.arm,day:originalKey});
    const listed=d.listedContracts.filter(c=>
      c.instrument_key===a.instrumentKey&&
      c.expiry===a.expiry);
    if(listed.length!==1||!a.expiry||!DATE.test(a.expiry)||
      !a.entryAt||!a.quantity||!Number.isFinite(Date.parse(a.entryAt))||
      !Number.isSafeInteger(listed[0]?.lot_size)||
      listed[0].lot_size<=0||
      a.quantity%listed[0].lot_size!==0){
      row.expiryMismatch++;
      continue;
    }
    const expiry=Date.parse(a.expiry+'T10:00:00Z');
    const delta=(expiry-Date.parse(a.entryAt))/MS_DAY;
    if(!Number.isFinite(delta)||!firstInRange(delta,BINS[a.horizon])){
      row.expiryMismatch++;
      continue;
    }
    if(row.minDays===null||delta<row.minDays)row.minDays=delta;
    if(row.maxDays===null||delta>row.maxDays)row.maxDays=delta;
    const hold=input.phase59.phase58.exitPolicy
      .horizonRules[a.horizon].maxHoldCalendarDays;
    if(delta<hold+
      input.policy.minimumDaysBeyondMaximumHoldUntilListedExpiry)
      row.bufferViolation++;
  }
  if(dateKeys.size!==pins.expectedOriginalOosDecisionDays||
    seenAttempts.size!==pins.expectedOriginalArmHorizonAttempts||
    original.attempts.length!==pins.expectedOriginalArmHorizonAttempts)
    return fail('ORIGINAL_FULL_12_WAY_DECISION_DENOMINATOR_DROPPED',
      'INCOMPLETE_EVIDENCE',partial);
  const byRegimeArmPairs=new Map<string,number>();
  for(const [pair,set] of pairKeyEntries){
    if(set.size!==4)continue;
    const ref=decisionArmByGroup.get(pair)!;
    const k=ref.regime+'|'+ref.arm;
    byRegimeArmPairs.set(k,(byRegimeArmPairs.get(k)??0)+1);
  }
  const origDays=[...dateKeys].map(x=>x.split('|')[1]).sort();
  const span=origDays.length?Math.round((
    Date.parse(origDays.at(-1)!+'T00:00:00Z')-
    Date.parse(origDays[0]+'T00:00:00Z'))/MS_DAY):0;
  const distinctRegimes=[...foldRegimeDays.keys()].filter(
    x=>x!=='STALE_DATA'&&x!=='INSUFFICIENT_DATA');
  const output:Phase60RegimeArmHorizonCell[]=[];
  let mismatch=0,qualified=0;
  for(const [k,row] of rows){
    const originalCell=byCell.get(k);
    if(!originalCell||
      originalCell.originalOosAttempts!==row.originalOosAttempts||
      originalCell.originalNoEntryAttempts!==row.originalNoEntryAttempts||
      originalCell.observedOriginalEntries!==row.observedEntries)
      return fail('PHASE59_AND_PHASE8_ORIGINAL_REGIME_HORIZON_COUNTS_DIVERGED',
        'INCOMPLETE_EVIDENCE',partial);
    const paired=byRegimeArmPairs.get(
      originalCell.regime+'|'+originalCell.arm)??0;
    const enough=
      (foldRegimeDays.get(originalCell.regime)?.size??0)>=
        input.policy.minimumOosDecisionDaysPerRegime&&
      row.enteredDays.size>=
        input.policy.minimumEnteredOosDaysPerRegimeArmHorizon&&
      row.enteredFolds.size>=input.policy.minimumDistinctOosFolds&&
      paired>=
        input.policy.minimumSameDecisionFourHorizonPairsPerRegimeArm&&
      originalCell.exactSourceJoinedPhase46OvernightGapPaths>=
        input.policy.minimumOriginalOvernightGapPathsPerRegimeArmHorizon&&
      originalCell.fullyObservedPreTriggerOptionBidPaths===
        row.observedEntries&&
      originalCell.incompleteOrCensoredPremiumPaths===0&&
      originalCell.incompleteOrCensoredFirstNextOpenGapPaths===0&&
      row.expiryMismatch===0&&row.bufferViolation===0;
    if(enough)qualified++;
    mismatch+=row.expiryMismatch+row.bufferViolation;
    output.push({
      regime:originalCell.regime,arm:originalCell.arm,
      horizon:originalCell.horizon,
      originalOosAttempts:row.originalOosAttempts,
      originalNoEntryAttempts:row.originalNoEntryAttempts,
      observedEntries:row.observedEntries,
      distinctEntryOosDays:row.enteredDays.size,
      distinctEntryFolds:row.enteredFolds.size,
      originalPhase19DepthQualifiedRunups:
        originalCell.depthQualifiedFirstPremiumRunups,
      originalPhase19ReversalsBeforeTarget:
        originalCell.observedFirstRunupReversedBeforeTarget,
      originalOvernightHeldEntries:
        originalCell.originalEntriesHeldIntoNextSession,
      phase46FullOriginalNextOpenGapPaths:
        originalCell.exactSourceJoinedPhase46OvernightGapPaths,
      phase46AdverseNextOpenGapOrCashAlerts:
        originalCell.nextOpenAdverseGapOrCashBudgetAlerts,
      originalSourceCensoredPaths:
        originalCell.incompleteOrCensoredPremiumPaths+
        originalCell.incompleteOrCensoredFirstNextOpenGapPaths,
      observedListedExpiryBucketMismatches:row.expiryMismatch,
      observedMaximumHoldToExpiryBufferViolations:
        row.bufferViolation,
      minimumDaysToListedExpiryAtOriginalEntry:
        row.minDays===null?null:Number(row.minDays.toFixed(3)),
      maximumDaysToListedExpiryAtOriginalEntry:
        row.maxDays===null?null:Number(row.maxDays.toFixed(3)),
      matchedAllFourHorizonEntryDecisionsSameRegimeArm:paired,
      predeclaredSampleCoverageQualified:enough,
      riskAlertObserved:
        originalCell.observedFirstRunupReversedBeforeTarget>0||
        originalCell.nextOpenAdverseGapOrCashBudgetAlerts>0,
      tradeOrHorizonRecommendationAuthorized:false
    });
  }
  if(output.length!==previous.cells.length||
    mismatch>0)
    return fail('ORIGINAL_SELECTED_CONTRACT_EXPIRY_WINDOW_OR_HOLD_BUFFER_INVALID',
      'INCOMPLETE_EVIDENCE',{...partial,
        originalOosFolds:decisionFoldIds.size,
        originalExpiryWindowOrHoldBufferMismatches:mismatch});
  const cellsRisk=output.reduce((n,x)=>n+
    (x.riskAlertObserved?1:0),0);
  const distinctRegimeCount=distinctRegimes.length;
  const report:Phase60Report={
    ...empty(),...partial,
    originalOosFolds:decisionFoldIds.size,
    originalOosCalendarSpanDays:span,
    originalDistinctDecisionTimeRegimes:distinctRegimeCount,
    totalPerRegimeArmHorizonCells:output.length,
    predeclaredCoverageQualifiedCells:qualified,
    insufficientEvidenceCells:output.length-qualified,
    originalPremiumReversalObservations:output.reduce((n,x)=>
      n+x.originalPhase19ReversalsBeforeTarget,0),
    originalNextOpenGapOrDebitAlerts:output.reduce((n,x)=>
      n+x.phase46AdverseNextOpenGapOrCashAlerts,0),
    originalExpiryWindowOrHoldBufferMismatches:mismatch,
    rows:output
  };
  const originalCoverageEnough=
    decisionFoldIds.size>=input.policy.minimumDistinctOosFolds&&
    dateKeys.size>=input.policy.minimumOriginalOosDecisionDays&&
    distinctRegimeCount>=
      input.policy.minimumDistinctDecisionTimeMarketRegimes&&
    span>=input.policy.minimumCalendarSpanDaysBetweenFirstAndLastOosDate&&
    output.length>0&&qualified===output.length;
  if(previous.status==='DESCRIPTIVE_PREMIUM_OR_GAP_RISK_ALERT_ONLY'||
    cellsRisk>0)
    return {...report,status:'DESCRIPTIVE_DOWNSIDE_RISK_ALERT_ONLY',
      reasonCodes:[
        'ORIGINAL_OOS_OPTION_PREMIUM_REVERSAL_OR_GAP_RISK_OBSERVED',
        ...(originalCoverageEnough?[]:['MULTIFOLD_MULTIREGIME_COVERAGE_STILL_INSUFFICIENT'])
      ]};
  if(!originalCoverageEnough)
    return {...report,status:'DESCRIPTIVE_COVERAGE_INSUFFICIENT_ONLY',
      reasonCodes:['INSUFFICIENT_ORIGINAL_MULTIFOLD_MULTIREGIME_HORIZON_COVERAGE']};
  return {...report,status:'DESCRIPTIVE_COVERAGE_REVIEW_ONLY'};
}
