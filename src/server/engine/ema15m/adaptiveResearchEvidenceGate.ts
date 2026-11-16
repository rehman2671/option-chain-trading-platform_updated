/**
 * Phase 11 — independent human-review EVIDENCE GATE for adaptive swing.
 *
 * It cross-checks Phase 5 stressed fixed-hold research, Phase 8 entry-first
 * censored exits, Phase 10 source-attested L1 quality, and Phase 6 checksum
 * evidence. It does NOT authenticate vendor/exchange, certify profitability,
 * compare causal policy effects or authorize any broker/paper/live order.
 *
 * REVIEW_PACKAGE_READY means only that the supplied reports are internally
 * consistent enough to *ask* a human to independently review source/license,
 * timestamp provenance, market calendar and broker execution assumptions.
 */
import { createHash } from 'node:crypto';
import type { HorizonBucket } from './adaptiveOptionRanker.js';
import type { HistoricalArm } from './historicalAdaptiveComparison.js';
import type { AdaptiveWalkForwardStudy, StressScenario } from './adaptiveWalkForwardStudy.js';
import type { AdaptiveMarketDataQualityReport } from './adaptiveL1MarketDataQuality.js';
import type { EntryFirstExitStudy } from './adaptiveEntryFirstExitStudy.js';
import type { SourceArtifactAudit } from './adaptiveSourceArtifactAudit.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const SCENARIOS:StressScenario[]=[
  'BASE','DOUBLE_FEES_AND_SLIPPAGE','WIDEN_L1_50BPS',
  'COMBINED_COST_AND_L1_STRESS'
];
const validDate=(x:string)=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&
  Number.isFinite(Date.parse(x+'T00:00:00Z'))&&
  new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const validTime=(x:unknown):x is string=>
  typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)&&
  /(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const num=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const integer=(x:unknown,min:number,max:number)=>
  Number.isInteger(x)&&num(x)&&x>=min&&x<=max;
const fraction=(x:unknown)=>num(x)&&x>=0&&x<=1;
const unique=(x:string[])=>[...new Set(x)];
const key=(fold:number,arm:HistoricalArm,horizon:HorizonBucket)=>
  fold+'|'+arm+'|'+horizon;
const stressKey=(scenario:StressScenario,fold:number,
  arm:HistoricalArm,horizon:HorizonBucket)=>scenario+'|'+key(fold,arm,horizon);
const pairKey=(fold:number,horizon:HorizonBucket,contender:string)=>
  fold+'|'+horizon+'|'+contender;

export interface AdaptiveResearchEvidencePolicy {
  schemaVersion:'ADAPTIVE_RESEARCH_EVIDENCE_GATE_V1';
  /** Self-declared; third-party preregistration must STILL be reviewed. */
  prespecifiedAt:string;
  studyProtocolId:string;
  minimumOutOfSampleFolds:number;
  minimumTestingSessionsPerFold:number;
  minimumPricedEntryFirstExitsPerCell:number;
  minimumStressTradesPerCell:number;
  minimumPairedDecisionsPerArmHorizon:number;
  maximumMissingEntryFractionPerCell:number;
  maximumCensoredExitFractionPerCell:number;
  /** This is absolute P&L deterioration sensitivity, NOT a profit promise. */
  maximumCombinedStressDeteriorationINR:number;
  maximumStressedDrawdownINR:number;
}
export interface EvidenceGateCell {
  foldIndex:number; arm:HistoricalArm; horizon:HorizonBucket;
  testDecisionCount:number;
  observedEntryCount:number;
  missingEntryCount:number;
  completeExitCount:number;
  censoredExitCount:number;
  qualityPassCount:number;
  baseFixedHoldTrades:number;
  combinedStressTrades:number;
  combinedStressDeteriorationINR:number|null;
  maximumStressedDrawdownINR:number|null;
  evidenceSufficientForManualReview:boolean;
  blockers:string[];
}
export interface AdaptiveResearchEvidenceGate {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  brokerOperationalSafetyProven:false;
  sourceAuthenticityIndependentlyVerified:false;
  exchangeCalendarIndependentlyVerified:false;
  timestampProvenanceIndependentlyVerified:false;
  protocolRegistrationIndependentlyVerified:false;
  status:'REJECTED'|'BLOCKED_INCOMPLETE_EVIDENCE'|'EXTERNAL_REVIEW_REQUIRED';
  datasetId:string|null;
  synthetic:boolean|null;
  errors:string[];
  blockers:string[];
  cells:EvidenceGateCell[];
  foldCount:number;
  totalTestingSessions:number;
  policy:AdaptiveResearchEvidencePolicy|null;
  /** Hash of AGGREGATE summaries, not source raw bytes or a notarization. */
  aggregateSummarySha256:string|null;
  externalReviewChecklist:string[];
  warnings:string[];
}
const reviewChecklist=[
  'INDEPENDENT_VENDOR_LICENSE_ENTITLEMENT_AND_FEED_ORIGIN_AUDIT',
  'INDEPENDENT_VENDOR_EVENT_AND_STRATEGY_AVAILABILITY_CLOCK_AUDIT',
  'INDEPENDENT_NSE_BSE_OFFICIAL_SESSION_HOLIDAY_EXPIRY_AUDIT',
  'THIRD_PARTY_TIMESTAMPED_PRE_REGISTRATION_AND_UNTOUCHED_OOS_CONFIRMATION',
  'INDEPENDENT_L1_BID_DEPTH_SPREAD_SAMPLING_AND_FILL_SIMULATION_REVIEW',
  'BROKER_AUTHORITATIVE_NRML_ORDER_POSITION_GTT_AND_RESTART_SAFETY_REVIEW',
  'HUMAN_SIGNOFF_ON_RISK_LIMITS_LOSS_GAPS_AND_OUT_OF_SAMPLE_STABILITY'
];
const warnings=[
  'REVIEW_ONLY_NOT_A_PASS_OR_EXECUTION_AUTHORIZATION',
  'SOURCE_SHA256_MATCH_IS_NOT_VENDOR_AUTHENTICATION',
  'SOURCE_AND_POLICY_REGISTRATION_ARE_SELF_DECLARED_UNTIL_EXTERNAL_REVIEW',
  'STRESS_RESULTS_USE_ORIGINAL_FIXED_HOLD_SURVIVORS_NOT_ENTRY_FIRST_EXITS',
  'ENTRY_FIRST_EXIT_RESULTS_ARE_SEPARATE_AND_HYPOTHETICAL',
  'L1_OBSERVED_BID_DEPTH_CANNOT_GUARANTEE_BROKER_EXECUTION',
  'NO_STATISTICAL_SIGNIFICANCE_CAUSAL_EDGE_OR_LIVE_TRADING_SAFETY_PROVEN'
];
function policyValid(p:AdaptiveResearchEvidencePolicy):boolean {
  return !!p&&p.schemaVersion==='ADAPTIVE_RESEARCH_EVIDENCE_GATE_V1'&&
    validTime(p.prespecifiedAt)&&
    typeof p.studyProtocolId==='string'&&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,127}$/.test(p.studyProtocolId)&&
    integer(p.minimumOutOfSampleFolds,1,100)&&
    integer(p.minimumTestingSessionsPerFold,1,10000)&&
    integer(p.minimumPricedEntryFirstExitsPerCell,1,100000)&&
    integer(p.minimumStressTradesPerCell,1,100000)&&
    integer(p.minimumPairedDecisionsPerArmHorizon,1,100000)&&
    fraction(p.maximumMissingEntryFractionPerCell)&&
    fraction(p.maximumCensoredExitFractionPerCell)&&
    num(p.maximumCombinedStressDeteriorationINR)&&
    p.maximumCombinedStressDeteriorationINR>=0&&
    num(p.maximumStressedDrawdownINR)&&p.maximumStressedDrawdownINR>=0;
}
const rounded=(x:number)=>Number(x.toFixed(2));
/**
 * Required reports must have been independently GENERATED using the prior
 * offline pipeline. This gate can detect mismatches but not cryptographically
 * attest the caller's honesty; external reviewers must inspect original files.
 */
export function evaluateAdaptiveResearchEvidenceGate(
  study:AdaptiveWalkForwardStudy,
  quality:AdaptiveMarketDataQualityReport|null,
  entryFirst:EntryFirstExitStudy|null,
  artifact:SourceArtifactAudit|null,
  policy:AdaptiveResearchEvidencePolicy
):AdaptiveResearchEvidenceGate {
  const base:AdaptiveResearchEvidenceGate={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    profitabilityProven:false,brokerOperationalSafetyProven:false,
    sourceAuthenticityIndependentlyVerified:false,
    exchangeCalendarIndependentlyVerified:false,
    timestampProvenanceIndependentlyVerified:false,
    protocolRegistrationIndependentlyVerified:false,
    status:'REJECTED',datasetId:study?.report?.datasetId??null,
    synthetic:study?.report?.synthetic??null,errors:[],blockers:[],cells:[],
    foldCount:0,totalTestingSessions:0,policy:null,
    aggregateSummarySha256:null,externalReviewChecklist:reviewChecklist,warnings
  };
  const errors:string[]=[];
  if(!policyValid(policy))errors.push('INVALID_OR_UNREGISTERED_EVIDENCE_GATE_POLICY');
  if(!study||!study.report||!study.ingestion||!Array.isArray(study.results)||
     !Array.isArray(study.foldWindows)||!study.foldWindows.length)
    errors.push('WALK_FORWARD_REPORT_REQUIRED');
  if(!quality||!Array.isArray(quality.cells)||!Array.isArray(quality.paths))
    errors.push('PHASE10_MARKET_L1_QUALITY_REPORT_REQUIRED');
  if(!entryFirst||!Array.isArray(entryFirst.cells)||!entryFirst.cohort)
    errors.push('PHASE8_ENTRY_FIRST_REPORT_REQUIRED');
  if(errors.length)return {...base,errors};
  const wf=study.report!;
  const q=quality!;
  const ex=entryFirst!;
  const foldCount=study.foldWindows.length;
  const blockers:string[]=[];
  const flag=(s:string)=>{if(!blockers.includes(s))blockers.push(s);};
  if(wf.synthetic||q.synthetic)flag('SYNTHETIC_DATA_CANNOT_ENTER_EXTERNAL_MARKET_EVIDENCE_REVIEW');
  if(q.datasetId!==wf.datasetId||study.ingestion.schemaValid!==true||
     study.report?.folds.length!==foldCount)
    flag('MISMATCHED_OR_INVALID_DATASET_PROVENANCE');
  if(study.status!=='DESCRIPTIVE_ONLY'||wf.status!=='DESCRIPTIVE_ONLY'||
     q.status!=='DESCRIPTIVE_ONLY'||ex.status!=='DESCRIPTIVE_ONLY')
    flag('PRIOR_RESEARCH_REPORTS_NOT_ALL_DESCRIPTIVELY_COMPLETE');
  if(artifact?.status!=='CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED'||
     !artifact.digestSha256||artifact.digestSha256!==artifact.expectedSha256)
    flag('ORIGINAL_VENDOR_ARTIFACT_CHECKSUM_NOT_ESTABLISHED');
  if(foldCount<policy.minimumOutOfSampleFolds)
    flag('OUT_OF_SAMPLE_FOLD_COUNT_BELOW_PREDECLARED_MINIMUM');
  const testDays=new Set<string>();
  const foldBlockers:string[]=[];
  let priorTestEnd='';
  let totalTestingSessions=0;
  for(let i=0;i<foldCount;i++){
    const f=study.foldWindows[i];
    const sourceFold=wf.folds[i];
    if(!f||!sourceFold||
       ![f.trainStart,f.trainEnd,f.testStart,f.testEnd].every(validDate)||
       !(f.trainStart<=f.trainEnd&&f.trainEnd<f.testStart&&f.testStart<=f.testEnd)||
       (i>0&&f.testStart<=priorTestEnd)||
       f.trainStart!==sourceFold.window.trainStart||
       f.trainEnd!==sourceFold.window.trainEnd||
       f.testStart!==sourceFold.window.testStart||
       f.testEnd!==sourceFold.window.testEnd||
       f.testingSessions!==sourceFold.testingSessions)
      foldBlockers.push('CHRONOLOGICAL_FOLDS_OR_WINDOW_COUNTS_MISMATCH');
    if(f&&f.testStart)priorTestEnd=f.testEnd;
    if(!f||!integer(f.testingSessions,1,100000)||
       f.testingSessions<policy.minimumTestingSessionsPerFold)
      foldBlockers.push('TEST_SESSION_COUNT_BELOW_PREDECLARED_MINIMUM');
    if(f?.testStart&&f?.testEnd){
      if(testDays.has(f.testStart))foldBlockers.push('DUPLICATE_OOS_FOLD_START');
      testDays.add(f.testStart);
    }
    totalTestingSessions+=num(f?.testingSessions)?f.testingSessions:0;
  }
  for(const b of unique(foldBlockers))flag(b);
  if(!Number.isFinite(Date.parse(policy.prespecifiedAt))||
     Date.parse(policy.prespecifiedAt)>=
       Math.min(...study.foldWindows.map(f=>
         Date.parse(f.testStart+'T00:00:00Z'))))
    flag('POLICY_WAS_NOT_DECLARED_BEFORE_OOS_WINDOWS');

  const qm=new Map<string,(typeof q.cells)[number]>();
  for(const c of q.cells){
    const k=key(c.foldIndex,c.arm,c.horizon);
    if(qm.has(k))flag('DUPLICATE_QUALITY_CELL');
    qm.set(k,c);
  }
  const em=new Map<string,(typeof ex.cells)[number]>();
  for(const c of ex.cells){
    const k=key(c.foldIndex,c.arm,c.horizon);
    if(em.has(k))flag('DUPLICATE_ENTRY_FIRST_CELL');
    em.set(k,c);
  }
  const sm=new Map<string,(typeof study.results)[number]>();
  for(const c of study.results){
    const k=stressKey(c.scenario,c.foldIndex,c.arm,c.horizon);
    if(sm.has(k))flag('DUPLICATE_STRESS_SCENARIO_CELL');
    sm.set(k,c);
  }
  const paired=new Map<string,(typeof study.pairedOutOfSample)[number]>();
  for(const item of study.pairedOutOfSample){
    const k=pairKey(item.foldIndex,item.horizon,item.contender);
    if(paired.has(k))flag('DUPLICATE_PAIRED_POLICY_COMPARISON');
    paired.set(k,item);
  }
  if(q.cells.length!==foldCount*12||ex.cells.length!==foldCount*12||
     study.results.length!==foldCount*48||
     study.pairedOutOfSample.length!==foldCount*8)
    flag('INCOMPLETE_FOLD_ARM_HORIZON_SCENARIO_MATRIX');
  if(q.totalOutOfSampleDecisions!==totalTestingSessions ||
     q.observedEntryCount!==ex.cohort.counts.qualifyingEntryCount||
     q.missingEntryCount!==ex.cohort.counts.missingEntryCount||
     ex.cohort.counts.testDecisions!==totalTestingSessions||
     ex.cohort.counts.attempts!==foldCount*12*
       // Test decision sessions may differ by fold; avoid multiplying by
       // single-fold sample count in a multi-fold evaluation.
       (totalTestingSessions/foldCount))
    flag('ENTRY_FIRST_COHORT_TOTALS_DISAGREE');
  const cells:EvidenceGateCell[]=[];
  for(let i=0;i<foldCount;i++)for(const arm of ARMS)
    for(const horizon of HORIZONS){
      const k=key(i,arm,horizon);
      const qc=qm.get(k),ec=em.get(k);
      const baseStress=sm.get(stressKey('BASE',i,arm,horizon));
      const worst=sm.get(stressKey('COMBINED_COST_AND_L1_STRESS',i,arm,horizon));
      const reasons:string[]=[];
      const bad=(x:string)=>{if(!reasons.includes(x))reasons.push(x);};
      const n=qc?.decisionCount??0,entries=qc?.observedEntryCount??0;
      const missing=qc?.missingEntryCount??0;
      const priced=ec?.pricedExitCount??0;
      const censored=(ec?.unpricedExitCount??0)+(ec?.pathIncompleteCount??0);
      const qualityPassed=qc?.qualityPassCount??0;
      if(!qc||!ec||!baseStress||!worst)
        bad('MISSING_REQUIRED_FOLD_ARM_HORIZON_CELL');
      else {
        if(!integer(n,1,100000)||n!==study.foldWindows[i].testingSessions ||
           ec.totalDecisions!==n||
           qc.observedEntryCount!==ec.entryObservedCount||
           qc.missingEntryCount>n||
           qc.noSignalOrIneligibleCount+entries+missing!==n||
           ec.noEntryCount+ec.entryObservedCount!==n||
           qc.qualityPassCount+qc.incompleteL1PathCount!==entries||
           ec.pricedExitCount+ec.unpricedExitCount+ec.pathIncompleteCount!==entries)
          bad('INCONSISTENT_ENTRY_AND_EXIT_DENOMINATORS');
        if(entries<policy.minimumPricedEntryFirstExitsPerCell)
          bad('INSUFFICIENT_ENTRY_FIRST_OOS_EXITS');
        if(n>0&&missing/n>policy.maximumMissingEntryFractionPerCell)
          bad('MISSING_ENTRIES_EXCEED_PREDECLARED_LIMIT');
        if(entries>0&&censored/entries>policy.maximumCensoredExitFractionPerCell)
          bad('CENSORED_EXITS_EXCEED_PREDECLARED_LIMIT');
        if(!qc.sufficientForDescriptiveQualityReview||
           qualityPassed!==entries||ec.completeCohortNetPnlINR===null||
           !ec.descriptiveComparisonEligible)
          bad('INCOMPLETE_L1_PATH_OR_ENTRY_FIRST_EXIT_EVIDENCE');
      }
      const scenarios=SCENARIOS.map(s=>sm.get(stressKey(s,i,arm,horizon)));
      if(scenarios.some(s=>!s))
        bad('MISSING_COST_STRESS_SCENARIOS');
      else {
        for(const scenario of scenarios){
          if(!scenario||scenario.tradeCount<
             policy.minimumStressTradesPerCell||
             !scenario.comparable||
             scenario.unpricedEntries!==0||scenario.unpricedExits!==0||
             scenario.tradeCount!==baseStress?.tradeCount||
             !num(scenario.netPnlINR)||!num(scenario.maxDrawdownINR))
            bad('INCOMPLETE_OR_UNCOMPARABLE_COST_STRESS_SAMPLE');
          if(scenario&&scenario.maxDrawdownINR>
              policy.maximumStressedDrawdownINR)
            bad('STRESSED_DRAWDOWN_EXCEEDS_DECLARED_REVIEW_LIMIT');
        }
        if(baseStress&&worst&&
           baseStress.netPnlINR-worst.netPnlINR>
             policy.maximumCombinedStressDeteriorationINR)
          bad('COMBINED_STRESS_PNL_DETERIORATION_EXCEEDS_LIMIT');
        if(baseStress&&worst&&worst.netPnlINR>baseStress.netPnlINR+0.01)
          bad('COUNTERINTUITIVE_COST_STRESS_IMPROVEMENT_REQUIRES_REVIEW');
      }
      cells.push({
        foldIndex:i,arm,horizon,testDecisionCount:n,
        observedEntryCount:entries,missingEntryCount:missing,
        completeExitCount:priced,censoredExitCount:censored,
        qualityPassCount:qualityPassed,
        baseFixedHoldTrades:baseStress?.tradeCount??0,
        combinedStressTrades:worst?.tradeCount??0,
        combinedStressDeteriorationINR:baseStress&&worst?
          rounded(baseStress.netPnlINR-worst.netPnlINR):null,
        maximumStressedDrawdownINR:scenarios.every(x=>x)?
          Math.max(...scenarios.map(x=>x!.maxDrawdownINR)):null,
        evidenceSufficientForManualReview:reasons.length===0,blockers:reasons
      });
      for(const reason of reasons)flag(reason);
    }
  for(let i=0;i<foldCount;i++)for(const horizon of HORIZONS)
    for(const contender of ['REGIME_FILTER','REGIME_AND_RANK'] as const){
      const p=paired.get(pairKey(i,horizon,contender));
      if(!p||p.pairedDecisionCount<
           policy.minimumPairedDecisionsPerArmHorizon||
         !p.comparisonIsTradeMatched||p.missingPairCount!==0||
         !p.sufficientPairedSample||p.pairedDeltaNetINR===null)
        flag('UNPAIRED_OR_UNDERPOWERED_POLICY_ARM_COMPARISON');
    }
  const summary={
    schemaVersion:policy.schemaVersion,studyProtocolId:policy.studyProtocolId,
    policy, datasetId:wf.datasetId,
    originalArtifactSha256:artifact?.digestSha256??null,
    foldWindows:study.foldWindows,
    qualityCells:q.cells,entryFirstCells:ex.cells,
    costStressCells:study.results,
    pairedComparisons:study.pairedOutOfSample,
    evidenceCells:cells
  };
  const digest=createHash('sha256').update(JSON.stringify(summary)).digest('hex');
  return{
    ...base,status:blockers.length?'BLOCKED_INCOMPLETE_EVIDENCE':
      'EXTERNAL_REVIEW_REQUIRED',
    datasetId:wf.datasetId,synthetic:wf.synthetic,errors:[],
    policy,blockers:unique(blockers),cells,foldCount,totalTestingSessions,
    aggregateSummarySha256:digest
  };
}
