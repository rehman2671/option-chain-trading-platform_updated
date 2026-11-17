/**
 * Phase 17: single fail-closed, independently reproducible OFFLINE evidence
 * package combining Phase 5–16. Never a trading signal or production release.
 *
 * Important distinctions:
 *   - Integrity / Ed25519 binding != genuine NSE/BSE or vendor authentication.
 *   - A self-declared prespecified time != third-party preregistration.
 *   - Descriptive paired PnL != a statistically established strategy edge.
 *   - A top-of-book bid != a guaranteed executable broker fill.
 *
 * This module has NO broker, network, order, live, paper or market-data fetch
 * imports. It does not modify MIS, NRML, 15:15, exits or protection.
 */
import {createHash} from 'node:crypto';
import {auditAdaptiveSourceArtifact,type SourceArtifactAudit} from './adaptiveSourceArtifactAudit.js';
import {ingestVendorHistoricalBundle,type VerifiedHistoricalBundleV1} from './adaptiveVendorIngestion.js';
import {runAdaptiveWalkForwardStudy,type AdaptiveWalkForwardStudy} from './adaptiveWalkForwardStudy.js';
import {
  runAdaptiveEntryFirstExitStudy,type EntryFirstExitStudy
} from './adaptiveEntryFirstExitStudy.js';
import {
  auditAdaptiveL1MarketDataQuality,type AdaptiveMarketDataQualityReport,
  type AdaptiveMarketDataQualityPolicy
} from './adaptiveL1MarketDataQuality.js';
import {
  evaluateAdaptiveResearchEvidenceGate,type AdaptiveResearchEvidenceGate,
  type AdaptiveResearchEvidencePolicy
} from './adaptiveResearchEvidenceGate.js';
import {
  replayAdaptiveRegimeHysteresis,type HysteresisResearchPolicy,
  type HysteresisResearchReport
} from './adaptiveRegimeHysteresis.js';
import {
  compareAdaptiveHysteresisMatchedOos,type HysteresisMatchedOosPolicy,
  type HysteresisMatchedOosReport
} from './adaptiveHysteresisMatchedOos.js';
import {
  auditAdaptiveMatchedPremiumCostDepthStress,
  type PremiumCostDepthStressPolicy,type PremiumCostDepthStressReport,
  type StressCase
} from './adaptiveMatchedPremiumCostDepthStress.js';
import {
  auditAdaptiveCrossSourceExchangeCalendar,type CrossSourceCalendarReport,
  type IndependentlySuppliedCalendarEvidence
} from './adaptiveCrossSourceCalendarAudit.js';
import {
  auditAdaptiveSignedEvidenceWitness,type SignedEvidenceReviewReport,
  type ResearchEvidenceWitnessEnvelope
} from './adaptiveSignedEvidenceWitness.js';
import {auditAdaptiveVersionedInstrumentSessions,
  type VersionedInstrumentSessionEvidence,
  type VersionedInstrumentSessionReport
} from './adaptiveVersionedInstrumentSessionAudit.js';
import {
  auditAdaptiveObservedPremiumRunupReversals,
  type ObservedPremiumRunupPolicy,
  type ObservedPremiumPathReversalReport
} from './adaptiveObservedPremiumPathReversals.js';
import type {AdaptiveExitReplayPolicy} from './adaptivePositionalExitReplay.js';
import type {HistoricalArm} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';

const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const STRESS:StressCase[]=[
  'UNCHANGED_P8_COSTS','DOUBLE_ORIGINAL_COSTS',
  'WIDEN_ENTRY_ASK_AND_EXIT_BID','COMBINED_OVERNIGHT_GAP_AND_DEPTH'
];
const SHA=/^[0-9a-f]{64}$/;
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const num=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const integer=(n:unknown)=>num(n)&&Number.isInteger(n)&&n>=0;
const sum=(a:number[])=>a.reduce((n,v)=>n+v,0);
const round=(n:number)=>Number(n.toFixed(2));
const unique=(xs:string[])=>[...new Set(xs)];
const cellKey=(f:number,a:string,h:string)=>f+'|'+a+'|'+h;
const stressKey=(f:number,a:string,h:string,s:string)=>
  cellKey(f,a,h)+'|'+s;
const parseJson=<T>(bytes:Uint8Array|undefined|null,max:number):T|null=>{
  if(!bytes||bytes.length<2||bytes.length>max)return null;
  try {
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return data&&typeof data==='object'&&!Array.isArray(data)?data as T:null;
  }catch{return null;}
};
const allNonexec=(r:{executionAuthorized:false;productionSafe?:false})=>
  r.executionAuthorized===false&&
  (r.productionSafe===undefined||r.productionSafe===false);

export interface PinnedResearchPolicyLock {
  schemaVersion:'ADAPTIVE_PRESPECIFIED_RESEARCH_POLICY_LOCK_V1';
  studyProtocolId:string;
  /** Self-declared, not an independent immutable preregistration timestamp. */
  prespecifiedAt:string;
  datasetId:string;
  originalBundleSha256:string;
  policyFileSha256:{
    entryFirstExit:string;
    marketDataQuality:string;
    researchEvidenceGate:string;
    regimeHysteresis:string;
    matchedOos:string;
    premiumCostDepthStress:string;
    instrumentSessionSchedule:string;
    premiumPathReversal:string;
  };
}
export type PolicyRole=keyof PinnedResearchPolicyLock['policyFileSha256'];
export interface ReadinessPolicyBytes {
  entryFirstExit:Uint8Array;
  marketDataQuality:Uint8Array;
  researchEvidenceGate:Uint8Array;
  regimeHysteresis:Uint8Array;
  matchedOos:Uint8Array;
  premiumCostDepthStress:Uint8Array;
  instrumentSessionSchedule:Uint8Array;
  premiumPathReversal:Uint8Array;
}
export interface FullResearchReadinessInput {
  bundleBytes:Uint8Array|null|undefined;
  vendorArchiveBytes:Uint8Array|null|undefined;
  calendarManifestBytes:Uint8Array|null|undefined;
  calendarDocumentBytes:Uint8Array|null|undefined;
  instrumentSessionEvidenceBytes:Uint8Array|null|undefined;
  witnessEnvelope:ResearchEvidenceWitnessEnvelope|unknown;
  reviewerTrustRegistryBytes:Uint8Array|null|undefined;
  pinnedReviewerTrustRegistrySha256:string|null|undefined;
  policyLockManifestBytes:Uint8Array|null|undefined;
  /** Must be independently approved and pinned OUTSIDE research bundle. */
  pinnedPolicyLockManifestSha256:string|null|undefined;
  policies:ReadinessPolicyBytes|null|undefined;
}
export interface HorizonMechanicalRisk {
  arm:HistoricalArm;
  horizon:HorizonBucket;
  foldCount:number;
  observedOosDecisions:number;
  baselineEntries:number;
  hysteresisEntries:number;
  originalOnlyEntries:number;
  hysteresisOnlyEntries:number;
  jointlyPricedPairs:number;
  originalCensoredExitCount:number;
  hysteresisCensoredExitCount:number;
  skippedBaselineWinnersObserved:number;
  skippedBaselineLosersObserved:number;
  originalOvernightGapTriggers:number;
  hysteresisOvernightGapTriggers:number;
  stressDepthBlockedExits:number;
  originalObservedFirstRunupReversals:number;
  hysteresisObservedFirstRunupReversals:number;
  originalObservedTargetCrossings:number;
  hysteresisObservedTargetCrossings:number;
  missedOriginalFirstRunupReversals:number;
  /** Null when ANY fold is censored, missing or unreconciled. */
  originalCompleteNetPnlINR:number|null;
  hysteresisCompleteNetPnlINR:number|null;
  originalCombinedStressNetPnlINR:number|null;
  hysteresisCombinedStressNetPnlINR:number|null;
  originalStressDeteriorationINR:number|null;
  hysteresisStressDeteriorationINR:number|null;
  /** Even a fully sourced descriptive result is NOT a recommendation. */
  liveHorizonRecommendation:null;
  sampleComplete:boolean;
  reasons:string[];
}
export interface FullResearchReadinessReport {
  mode:'OFFLINE_EVIDENCE_REVIEW_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  liveMisModified:false;
  nrmlLiveEnabled:false;
  brokerNativeProtectionProven:false;
  profitabilityProven:false;
  statisticalSignificanceProven:false;
  exchangeIssuerAuthenticated:false;
  originalFeedAndAvailabilityClockAuthenticated:false;
  reviewerAndLicenseIndependentlyVerified:false;
  externalPreRegistrationProven:false;
  status:'REJECTED'|'BLOCKED_INCOMPLETE_EVIDENCE'|
    'INTERNALLY_CONSISTENT_EXTERNAL_REVIEW_REQUIRED';
  datasetId:string|null;
  synthetic:boolean|null;
  studyProtocolId:string|null;
  errors:string[];
  blockers:string[];
  warnings:string[];
  phaseStatuses:Record<string,string>;
  inputDigests:{
    sourceBundleSha256:string|null;
    originalVendorArchiveSha256:string|null;
    calendarManifestSha256:string|null;
    calendarDocumentSha256:string|null;
    reviewerTrustRegistrySha256:string|null;
    policyLockManifestSha256:string|null;
  };
  matchedPolicyLock:boolean;
  instrumentSessionScheduleSha256:string|null;
  independentlySignedArchiveBindingsValid:boolean;
  marketSessionsCrossSourceConsistent:boolean;
  expectedFoldCount:number;
  foldCount:number;
  expectedArmHorizonCells:number;
  expectedPremiumStressCells:number;
  expectedPremiumPathCells:number;
  horizonMechanicalRisk:HorizonMechanicalRisk[];
  /** Hashes only AGGREGATE diagnostics; not licensed L1 files or a signature. */
  aggregateEvidenceSummarySha256:string|null;
  manualExternalRequirements:string[];
}
export interface ReadinessPhaseReports {
  source:SourceArtifactAudit|null;
  walk:AdaptiveWalkForwardStudy|null;
  entry:EntryFirstExitStudy|null;
  quality:AdaptiveMarketDataQualityReport|null;
  researchGate:AdaptiveResearchEvidenceGate|null;
  hysteresis:HysteresisResearchReport|null;
  matched:HysteresisMatchedOosReport|null;
  premiumStress:PremiumCostDepthStressReport|null;
  premiumPath:ObservedPremiumPathReversalReport|null;
  calendar:CrossSourceCalendarReport|null;
  witness:SignedEvidenceReviewReport|null;
  instrumentSessions:VersionedInstrumentSessionReport|null;
}
export interface ReadinessAssessmentContext {
  datasetId:string;
  synthetic:boolean;
  protocolId:string;
  expectedTestSessions:number[];
  originalBundleSha256:string;
  lockStudyProtocolId:string;
}
const REQ=[
  'REAL_LICENSED_HISTORICAL_INDEX_OPTION_L1_AND_RAW_ARCHIVE_CHAIN_OF_CUSTODY',
  'NSE_BSE_ISSUER_AUTHENTICATION_OF_SESSION_HOLIDAY_SPECIAL_AND_EXPIRY_HISTORY',
  'INDEPENDENT_VENDOR_EVENT_TIME_AND_STRATEGY_AVAILABILITY_CLOCK_REVIEW',
  'INDEPENDENT_REVIEWER_KEY_IDENTITY_AND_HARDWARE_SIGNING_CUSTODY',
  'THIRD_PARTY_IMMUTABLE_POLICY_PREREGISTRATION_AND_TIMESTAMP',
  'UNTOUCHED_OOS_MULTI_REGIME_REPRODUCIBLE_PROFIT_AND_TAIL_RISK_REVIEW',
  'REAL_BROKER_ACCOUNT_SCOPE_NRML_POSITIONS_OPEN_ORDERS_STOP_GTT_ACK_RECONCILIATION',
  'REAL_BROKER_RESTART_UNKNOWN_ACK_PARTIAL_FILL_OVERNIGHT_GAP_EXIT_SAFETY',
  'SEPARATE_HUMAN_CHANGE_REVIEW_AND_PRODUCTION_RELEASE_APPROVAL'
];
const WARN=[
  'NO_AUTOMATED_PRODUCTION_APPROVAL_EVEN_IF_ALL_INTERNAL_CHECKS_PASS',
  'PHASE16_SELF_DECLARED_REVIEWER_REGISTRY_PIN_IS_NOT_ISSUER_OR_IDENTITY_PROOF',
  'PHASE17_POLICY_DIGEST_PIN_IS_INTEGRITY_ONLY_NOT_THIRD_PARTY_PREREGISTRATION',
  'RESEARCH_HORIZONS_ARE_CONTRACT_EXPIRY_BUCKETS_NOT_FIXED_MANDATED_HOLDS',
  'NOT_EVERY_15M_BAR_OBSERVED_ONLY_ORIGINAL_STRATEGY_DECISIONS',
  'OPTION_L1_BID_ASK_DISPLAYED_DEPTH_NOT_REAL_BROKER_EXECUTION_OR_NATIVE_STOP',
  'MARKET_VOLATILITY_IV_THETA_SPREADS_GAPS_AND_MISSED_REVERSALS_STILL_UNCERTAIN',
  'NO_15_15_AUTOMATIC_NRML_SQUARE_OFF_OR_HYSTERESIS_AUTO_SELL',
  'DESCRIPTIVE_HORIZON_PNL_AND_FEWER_CHURN_EVENTS_DO_NOT_ESTABLISH_EDGE'
];
function blank():FullResearchReadinessReport {
  return {
    mode:'OFFLINE_EVIDENCE_REVIEW_ONLY',executionAuthorized:false,
    productionSafe:false,liveMisModified:false,nrmlLiveEnabled:false,
    brokerNativeProtectionProven:false,profitabilityProven:false,
    statisticalSignificanceProven:false,exchangeIssuerAuthenticated:false,
    originalFeedAndAvailabilityClockAuthenticated:false,
    reviewerAndLicenseIndependentlyVerified:false,
    externalPreRegistrationProven:false,status:'REJECTED',
    datasetId:null,synthetic:null,studyProtocolId:null,
    errors:[],blockers:[],warnings:WARN,phaseStatuses:{},
    inputDigests:{
      sourceBundleSha256:null,originalVendorArchiveSha256:null,
      calendarManifestSha256:null,calendarDocumentSha256:null,
      reviewerTrustRegistrySha256:null,policyLockManifestSha256:null
    },
    matchedPolicyLock:false,instrumentSessionScheduleSha256:null,
    independentlySignedArchiveBindingsValid:false,
    marketSessionsCrossSourceConsistent:false,
    expectedFoldCount:0,foldCount:0,
    expectedArmHorizonCells:0,expectedPremiumStressCells:0,
    expectedPremiumPathCells:0,
    horizonMechanicalRisk:[],aggregateEvidenceSummarySha256:null,
    manualExternalRequirements:REQ
  };
}
export function validatePinnedResearchPolicyLock(
  manifest:PinnedResearchPolicyLock|unknown,
  expectedManifestDigest:string|null|undefined,
  manifestBytes:Uint8Array|null|undefined,
  policies:ReadinessPolicyBytes|null|undefined,
  context:{
    datasetId:string;
    studyProtocolId:string;
    originalBundleSha256:string;
    prespecifiedAt:string;
  }
):{valid:boolean;errors:string[];actualSha256:string|null}{
  const errors:string[]=[];
  if(!manifestBytes?.length||!expectedManifestDigest||
     !SHA.test(expectedManifestDigest)||
     sha(manifestBytes)!==expectedManifestDigest)
    errors.push('OUT_OF_BAND_RESEARCH_POLICY_LOCK_PIN_MISMATCH');
  const m=manifest as PinnedResearchPolicyLock|null;
  const roles:PolicyRole[]=[
    'entryFirstExit','marketDataQuality','researchEvidenceGate',
    'regimeHysteresis','matchedOos','premiumCostDepthStress',
    'instrumentSessionSchedule','premiumPathReversal'
  ];
  if(!m||m.schemaVersion!=='ADAPTIVE_PRESPECIFIED_RESEARCH_POLICY_LOCK_V1'||
     !m.policyFileSha256||
     m.datasetId!==context.datasetId||
     m.studyProtocolId!==context.studyProtocolId||
     m.originalBundleSha256!==context.originalBundleSha256||
     m.prespecifiedAt!==context.prespecifiedAt)
    errors.push('RESEARCH_POLICY_LOCK_NOT_BOUND_TO_DATASET_AND_PROTOCOL');
  if(!policies||roles.some(r=>
    !policies[r]?.length||
    policies[r].length>128*1024||
    !SHA.test(m?.policyFileSha256?.[r]??'')||
    sha(policies[r])!==m?.policyFileSha256?.[r]))
    errors.push('RESEARCH_POLICY_FILE_DIGEST_MISMATCH');
  return{
    valid:errors.length===0,errors,
    actualSha256:manifestBytes?.length?sha(manifestBytes):null
  };
}
function statusOf(p:ReadinessPhaseReports):Record<string,string>{
  return {
    originalArtifact:p.source?.status??'MISSING',
    historicalWalkforward:p.walk?.status??'MISSING',
    entryFirstExit:p.entry?.status??'MISSING',
    originalL1Quality:p.quality?.status??'MISSING',
    independentResearchEvidenceGate:p.researchGate?.status??'MISSING',
    decisionRegimeHysteresis:p.hysteresis?.status??'MISSING',
    matchedOos:p.matched?.status??'MISSING',
    premiumCostDepthStress:p.premiumStress?.status??'MISSING',
    observedOptionPremiumPath:p.premiumPath?.status??'MISSING',
    separateExchangeCalendar:p.calendar?.status??'MISSING',
    detachedReviewerWitness:p.witness?.status??'MISSING',
    versionedInstrumentSessions:p.instrumentSessions?.status??'MISSING'
  };
}
const required={
  originalArtifact:'CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED',
  historicalWalkforward:'DESCRIPTIVE_ONLY',
  entryFirstExit:'DESCRIPTIVE_ONLY',
  originalL1Quality:'DESCRIPTIVE_ONLY',
  independentResearchEvidenceGate:'EXTERNAL_REVIEW_REQUIRED',
  decisionRegimeHysteresis:'DESCRIPTIVE_ONLY',
  matchedOos:'DESCRIPTIVE_ONLY',
  premiumCostDepthStress:'DESCRIPTIVE_ONLY',
  observedOptionPremiumPath:'DESCRIPTIVE_ONLY',
  separateExchangeCalendar:'CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED',
  detachedReviewerWitness:'SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED',
  versionedInstrumentSessions:'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED'
} as const;
const topCell=<T extends {foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket}>(
  rows:T[],fold:number,arm:HistoricalArm,horizon:HorizonBucket
):T[]=>rows.filter(r=>r.foldIndex===fold&&r.arm===arm&&r.horizon===horizon);
const stressCell=(r:PremiumCostDepthStressReport,fold:number,
  arm:HistoricalArm,horizon:HorizonBucket,scenario:StressCase)=>
  r.cells.filter(c=>c.foldIndex===fold&&c.arm===arm&&
    c.horizon===horizon&&c.scenario===scenario);
const emptyRisk=(arm:HistoricalArm,horizon:HorizonBucket):HorizonMechanicalRisk=>({
  arm,horizon,foldCount:0,observedOosDecisions:0,baselineEntries:0,
  hysteresisEntries:0,originalOnlyEntries:0,hysteresisOnlyEntries:0,
  jointlyPricedPairs:0,originalCensoredExitCount:0,
  hysteresisCensoredExitCount:0,skippedBaselineWinnersObserved:0,
  skippedBaselineLosersObserved:0,originalOvernightGapTriggers:0,
  hysteresisOvernightGapTriggers:0,stressDepthBlockedExits:0,
  originalObservedFirstRunupReversals:0,
  hysteresisObservedFirstRunupReversals:0,
  originalObservedTargetCrossings:0,
  hysteresisObservedTargetCrossings:0,
  missedOriginalFirstRunupReversals:0,
  originalCompleteNetPnlINR:null,hysteresisCompleteNetPnlINR:null,
  originalCombinedStressNetPnlINR:null,
  hysteresisCombinedStressNetPnlINR:null,
  originalStressDeteriorationINR:null,
  hysteresisStressDeteriorationINR:null,
  liveHorizonRecommendation:null,sampleComplete:false,reasons:[]
});
/**
 * Evaluates only the lower-level reports already computed from the source.
 * Exposed separately for adversarial tests; never treat a supplied object as
 * authenticated—the secure top-level runner rebuilds all reports in memory.
 */
export function evaluateAdaptiveFullResearchReadiness(
  reports:ReadinessPhaseReports,
  ctx:ReadinessAssessmentContext,
  policyLockMatched:boolean
):FullResearchReadinessReport{
  const out=blank();
  out.datasetId=ctx.datasetId;
  out.synthetic=ctx.synthetic;
  out.studyProtocolId=ctx.protocolId;
  out.inputDigests.sourceBundleSha256=ctx.originalBundleSha256;
  out.phaseStatuses=statusOf(reports);
  out.matchedPolicyLock=policyLockMatched;
  out.expectedFoldCount=ctx.expectedTestSessions.length;
  out.expectedArmHorizonCells=ctx.expectedTestSessions.length*12;
  out.expectedPremiumStressCells=ctx.expectedTestSessions.length*48;
  out.expectedPremiumPathCells=ctx.expectedTestSessions.length*12;
  out.foldCount=reports.walk?.foldWindows.length??0;
  out.independentlySignedArchiveBindingsValid=
    reports.witness?.status==='SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED';
  out.marketSessionsCrossSourceConsistent=
    reports.calendar?.status==='CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED';
  const errors:string[]=[],blocks:string[]=[];
  const fatal=(s:string)=>{if(!errors.includes(s))errors.push(s);};
  const block=(s:string)=>{if(!blocks.includes(s))blocks.push(s);};
  if(!ctx.datasetId||!SHA.test(ctx.originalBundleSha256)||
     !ctx.protocolId||!ctx.expectedTestSessions.length||
     ctx.expectedTestSessions.some(n=>!integer(n)||n===0))
    fatal('INVALID_FULL_RESEARCH_DATASET_ID_OR_OOS_FOLD_UNIVERSE');
  if(!policyLockMatched||ctx.lockStudyProtocolId!==ctx.protocolId)
    fatal('ORIGINAL_PREDECLARED_POLICY_BYTES_NOT_LOCKED_TO_SIGNED_PROTOCOL');
  if(ctx.synthetic)block('SYNTHETIC_SOURCE_CANNOT_ESTABLISH_MARKET_EDGE');
  // Corrupted/invalid archive, document or detached signature is stronger
  // than merely missing quality observations; reject the entire package.
  if(!reports.source||!['CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED',
    'MISSING_SOURCE'].includes(reports.source.status))
    fatal('REJECT_ORIGINAL_VENDOR_ARCHIVE_INTEGRITY_FAILURE');
  if(reports.calendar?.status==='REJECTED')
    fatal('REJECT_SEPARATE_CALENDAR_DOCUMENT_OR_SCHEMA_FAILURE');
  if(reports.witness?.status==='REJECTED')
    fatal('REJECT_DETACHED_WITNESS_OR_PINNED_REVIEWER_TRUST_FAILURE');
  if(reports.instrumentSessions?.status==='REJECTED')
    fatal('REJECT_INSTRUMENT_SESSION_VERSION_OR_BOUND_CALENDAR');
  for(const [name,expected] of Object.entries(required)){
    const actual=out.phaseStatuses[name];
    if(actual!==expected)block(name.toUpperCase()+'_INSUFFICIENT_'+actual);
  }
  if(reports.researchGate?.datasetId!==ctx.datasetId||
     reports.quality?.datasetId!==ctx.datasetId||
     reports.hysteresis?.datasetId!==ctx.datasetId||
     reports.matched?.datasetId!==ctx.datasetId||
     reports.premiumStress?.datasetId!==ctx.datasetId||
     reports.premiumPath?.datasetId!==ctx.datasetId||
     reports.calendar?.datasetId!==ctx.datasetId||
     reports.witness?.datasetId!==ctx.datasetId||
     reports.instrumentSessions?.datasetId!==ctx.datasetId)
    fatal('PHASE_DATASET_IDS_DO_NOT_MATCH_SINGLE_SOURCE_ARCHIVE');
  if(reports.researchGate?.synthetic!==ctx.synthetic||
     reports.quality?.synthetic!==ctx.synthetic||
     reports.hysteresis?.synthetic!==ctx.synthetic||
     reports.matched?.synthetic!==ctx.synthetic||
     reports.premiumStress?.synthetic!==ctx.synthetic||
     reports.premiumPath?.synthetic!==ctx.synthetic||
     reports.calendar?.synthetic!==ctx.synthetic||
     reports.witness?.synthetic!==ctx.synthetic||
     reports.instrumentSessions?.synthetic!==ctx.synthetic)
    fatal('SOURCE_SYNTHETIC_PROVENANCE_INCONSISTENT_ACROSS_PHASES');
  if(reports.researchGate?.policy?.studyProtocolId!==ctx.protocolId)
    fatal('RESEARCH_EVIDENCE_GATE_PROTOCOL_NOT_SIGNED_BY_WITNESS');
  if(reports.source?.digestSha256!==reports.witness?.originalVendorArchiveSha256)
    fatal('ORIGINAL_L1_SHA256_NOT_BOUND_IDENTICALLY_ACROSS_PHASES');
  if(reports.calendar?.originalCalendarDocumentSha256!==
     reports.witness?.calendarSourceDocumentSha256)
    fatal('ORIGINAL_CALENDAR_DOCUMENT_SHA256_NOT_IDENTICAL_ACROSS_PHASES');
  if(reports.witness?.bundleSha256!==ctx.originalBundleSha256)
    fatal('RAW_BUNDLE_BYTES_NOT_IDENTICAL_TO_DUAL_SIGNED_WITNESS');
  if(reports.instrumentSessions?.studyProtocolId!==ctx.protocolId)
    fatal('INSTRUMENT_SESSION_SCHEDULE_NOT_BOUND_TO_REVIEW_PROTOCOL');
  if(reports.instrumentSessions?.originalCalendarManifestSha256!==
     reports.witness?.calendarManifestSha256)
    fatal('SEGMENT_RULES_NOT_BOUND_TO_SAME_SIGNED_CALENDAR_BYTES');
  if(reports.instrumentSessions?.tradingDaysCovered!==
     reports.instrumentSessions?.tradingDaysExpected||
     !reports.instrumentSessions?.tradingDaysCovered)
    block('SEGMENT_SPECIFIC_TRADING_DAY_LEDGER_INCOMPLETE');
  if(reports.walk?.foldWindows.length!==ctx.expectedTestSessions.length||
     reports.researchGate?.foldCount!==ctx.expectedTestSessions.length||
     reports.calendar?.foldCoverage.length!==ctx.expectedTestSessions.length||
     reports.quality?.cells.length!==ctx.expectedTestSessions.length*12||
     reports.researchGate?.cells.length!==ctx.expectedTestSessions.length*12||
     reports.matched?.cells.length!==ctx.expectedTestSessions.length*12||
     reports.premiumStress?.cells.length!==ctx.expectedTestSessions.length*48||
     reports.premiumPath?.cells.length!==ctx.expectedTestSessions.length*12||
     reports.hysteresis?.foldCells.length!==ctx.expectedTestSessions.length*4||
     reports.entry?.cells.length!==ctx.expectedTestSessions.length*12)
    block('MISSING_COMPLETE_FOLD_ARM_HORIZON_SOURCE_EVIDENCE_MATRIX');
  for(let fold=0;fold<ctx.expectedTestSessions.length;fold++){
    const expected=ctx.expectedTestSessions[fold];
    const sourceFold=reports.walk?.foldWindows[fold];
    const calendarFold=reports.calendar?.foldCoverage[fold];
    if(sourceFold?.testingSessions!==expected||
       calendarFold?.observedTradingDecisions!==expected||
       calendarFold?.expectedTradingDecisions!==expected||
       calendarFold?.omittedExpectedTradingDecisions!==0||
       !calendarFold.calendarTestWindowCovered)
      block('FOLD_'+fold+'_EXPECTED_EXCHANGE_SESSIONS_NOT_RECONCILED');
  }
  const reportCell=reports.researchGate?.cells??[];
  const qualityCells=reports.quality?.cells??[];
  const entryCells=reports.entry?.cells??[];
  const matchedCells=reports.matched?.cells??[];
  const allStress=reports.premiumStress?.cells??[];
  const premiumPaths=reports.premiumPath?.cells??[];
  if(!ctx.expectedTestSessions.length)
    return {...out,status:'REJECTED',errors,blockers:blocks};
  for(const arm of ARMS)for(const horizon of HORIZONS){
    const risk=emptyRisk(arm,horizon);
    risk.foldCount=ctx.expectedTestSessions.length;
    const bPnl:number[]=[],hPnl:number[]=[],bWorst:number[]=[],hWorst:number[]=[];
    for(let fold=0;fold<ctx.expectedTestSessions.length;fold++){
      const reasons:string[]=[];
      const q=topCell(qualityCells,fold,arm,horizon);
      const g=topCell(reportCell,fold,arm,horizon);
      const e=topCell(entryCells,fold,arm,horizon);
      const m=topCell(matchedCells,fold,arm,horizon);
      const path=topCell(premiumPaths,fold,arm,horizon);
      const bs=reports.premiumStress?
        stressCell(reports.premiumStress,fold,arm,horizon,'UNCHANGED_P8_COSTS'):[];
      const ws=reports.premiumStress?
        stressCell(reports.premiumStress,fold,arm,horizon,
          'COMBINED_OVERNIGHT_GAP_AND_DEPTH'):[];
      const eachScenarioExactlyOnce=STRESS.every(scenario=>
        reports.premiumStress&&stressCell(reports.premiumStress,
          fold,arm,horizon,scenario).length===1);
      if(q.length!==1||g.length!==1||e.length!==1||m.length!==1||
         bs.length!==1||ws.length!==1||path.length!==1||
         !eachScenarioExactlyOnce){
        reasons.push('MISSING_OR_DUPLICATED_FOLD_ARM_HORIZON_CELL');
      }else{
        const qr=q[0],gr=g[0],er=e[0],mr=m[0],base=bs[0],worst=ws[0];
        const expected=ctx.expectedTestSessions[fold];
        if(qr.decisionCount!==expected||
           gr.testDecisionCount!==expected||
           er.totalDecisions!==expected||
           mr.allOutOfSampleDecisions!==expected||
           base.allOutOfSampleDecisions!==expected||
           worst.allOutOfSampleDecisions!==expected)
          reasons.push('OOS_DECISION_DENOMINATOR_CHANGED_ACROSS_PHASES');
        const pr=path[0];
        if(pr.allOutOfSampleDecisions!==expected||
           pr.original.enrolledEntries!==mr.originalObservedEntries||
           pr.hysteresis.enrolledEntries!==mr.stabilizedObservedEntries||
           pr.original.pricedAndFullyObservedPaths!==mr.originalPricedExits||
           pr.hysteresis.pricedAndFullyObservedPaths!==mr.stabilizedPricedExits||
           pr.original.censoredOrSourceMismatchedPaths!==mr.originalCensoredExits||
           pr.hysteresis.censoredOrSourceMismatchedPaths!==mr.stabilizedCensoredExits)
          reasons.push('OPTION_PREMIUM_BID_RUNUP_NOT_MATCHED_TO_ORIGINAL_EXITS');
        if(!pr.fullyObservedForDescriptiveReview||pr.blockers.length||
           pr.original.completeCohortMeanMaxQualifiedBidGainPoints===null||
           pr.hysteresis.completeCohortMeanMaxQualifiedBidGainPoints===null)
          reasons.push('UNPRICED_OPTION_PRETRIGGER_RUNUP_CANNOT_ESTABLISH_GAIN');
        risk.originalObservedFirstRunupReversals+=
          pr.original.firstRunupReversalBeforeTarget;
        risk.hysteresisObservedFirstRunupReversals+=
          pr.hysteresis.firstRunupReversalBeforeTarget;
        risk.originalObservedTargetCrossings+=
          pr.original.qualifiedBidTargetCrossings;
        risk.hysteresisObservedTargetCrossings+=
          pr.hysteresis.qualifiedBidTargetCrossings;
        risk.missedOriginalFirstRunupReversals+=
          pr.originalOnlyFirstRunupReversals;
        if(er.entryObservedCount!==qr.observedEntryCount||
           mr.originalObservedEntries!==er.entryObservedCount||
           base.original.enrolledEntries!==mr.originalObservedEntries||
           base.stabilized.enrolledEntries!==mr.stabilizedObservedEntries||
           worst.original.enrolledEntries!==mr.originalObservedEntries||
           worst.stabilized.enrolledEntries!==mr.stabilizedObservedEntries)
          reasons.push('ENTRY_FIRST_AND_FIXED_COOLDOWN_DENOMINATOR_MISMATCH');
        if(mr.bothEntered+mr.originalOnlyEntries+mr.stabilizedOnlyEntries+
           mr.neitherEntered!==expected)
          reasons.push('ORIGINAL_FILTERED_PAIR_PARTITION_INCONSISTENT');
        if(!qr.sufficientForDescriptiveQualityReview||
           !gr.evidenceSufficientForManualReview||
           !mr.descriptivePairedSampleSufficient||
           !base.sufficientForDescriptiveStressReview||
           !worst.sufficientForDescriptiveStressReview||
           gr.blockers.length||mr.blockers.length||base.blockers.length||
           worst.blockers.length)
          reasons.push('SOURCE_QUOTE_OR_PREDECLARED_REVIEW_GATES_INCOMPLETE');
        if(mr.originalCensoredExits||mr.stabilizedCensoredExits||
           base.original.scenarioCensoredExits||
           base.stabilized.scenarioCensoredExits||
           worst.original.scenarioCensoredExits||
           worst.stabilized.scenarioCensoredExits)
          reasons.push('CENSORED_EXITS_CANNOT_BE_ZEROED_OR_EXCLUDED');
        if(mr.originalCompleteCohortNetPnlINR!==base.original.completeCohortNetPnlINR||
           mr.stabilizedCompleteCohortNetPnlINR!==
             base.stabilized.completeCohortNetPnlINR)
          reasons.push('PHASE13_ORIGINAL_OPTION_BID_PNL_NOT_REPRODUCIBLE');
        if(mr.originalCompleteCohortNetPnlINR===null||
           mr.stabilizedCompleteCohortNetPnlINR===null||
           worst.original.completeCohortNetPnlINR===null||
           worst.stabilized.completeCohortNetPnlINR===null)
          reasons.push('FULL_HORIZON_OPTION_PREMIUM_NET_PNL_NOT_PRICEABLE');
        risk.observedOosDecisions+=expected;
        risk.baselineEntries+=mr.originalObservedEntries;
        risk.hysteresisEntries+=mr.stabilizedObservedEntries;
        risk.originalOnlyEntries+=mr.originalOnlyEntries;
        risk.hysteresisOnlyEntries+=mr.stabilizedOnlyEntries;
        risk.jointlyPricedPairs+=mr.jointlyPricedPairs;
        risk.originalCensoredExitCount+=mr.originalCensoredExits;
        risk.hysteresisCensoredExitCount+=mr.stabilizedCensoredExits;
        risk.skippedBaselineWinnersObserved+=mr.skippedOriginalWinnersObserved;
        risk.skippedBaselineLosersObserved+=mr.skippedOriginalLosersObserved;
        risk.originalOvernightGapTriggers+=mr.originalOvernightGapTriggers;
        risk.hysteresisOvernightGapTriggers+=mr.stabilizedOvernightGapTriggers;
        risk.stressDepthBlockedExits+=worst.original.additionalDepthBlockedExits+
          worst.stabilized.additionalDepthBlockedExits;
        if(mr.originalCompleteCohortNetPnlINR!==null)
          bPnl.push(mr.originalCompleteCohortNetPnlINR);
        if(mr.stabilizedCompleteCohortNetPnlINR!==null)
          hPnl.push(mr.stabilizedCompleteCohortNetPnlINR);
        if(worst.original.completeCohortNetPnlINR!==null)
          bWorst.push(worst.original.completeCohortNetPnlINR);
        if(worst.stabilized.completeCohortNetPnlINR!==null)
          hWorst.push(worst.stabilized.completeCohortNetPnlINR);
      }
      for(const reason of reasons){
        if(!risk.reasons.includes(reason))risk.reasons.push(reason);
        block('FOLD_'+fold+'_'+arm+'_'+horizon+'_'+reason);
      }
    }
    const complete=!risk.reasons.length&&
      bPnl.length===risk.foldCount&&hPnl.length===risk.foldCount&&
      bWorst.length===risk.foldCount&&hWorst.length===risk.foldCount;
    risk.sampleComplete=complete;
    if(complete){
      risk.originalCompleteNetPnlINR=round(sum(bPnl));
      risk.hysteresisCompleteNetPnlINR=round(sum(hPnl));
      risk.originalCombinedStressNetPnlINR=round(sum(bWorst));
      risk.hysteresisCombinedStressNetPnlINR=round(sum(hWorst));
      risk.originalStressDeteriorationINR=round(
        risk.originalCompleteNetPnlINR-risk.originalCombinedStressNetPnlINR);
      risk.hysteresisStressDeteriorationINR=round(
        risk.hysteresisCompleteNetPnlINR-
          risk.hysteresisCombinedStressNetPnlINR);
    }
    out.horizonMechanicalRisk.push(risk);
  }
  if(reports.researchGate?.foldCount!==ctx.expectedTestSessions.length||
     reports.researchGate?.totalTestingSessions!==sum(ctx.expectedTestSessions))
    block('PHASE11_REGIME_STUDY_OOS_SESSIONS_NOT_RECONCILED');
  const finalStatus=errors.length?'REJECTED':blocks.length?
    'BLOCKED_INCOMPLETE_EVIDENCE':
    'INTERNALLY_CONSISTENT_EXTERNAL_REVIEW_REQUIRED';
  const aggregateDigest=sha(Buffer.from(JSON.stringify({
    schemaVersion:'ADAPTIVE_FULL_RESEARCH_AGGREGATE_V1',
    ctx,phaseStatuses:out.phaseStatuses,blockers:unique(blocks),
    horizonMechanicalRisk:out.horizonMechanicalRisk
  })));
  return{
    ...out,status:finalStatus,errors:unique(errors),blockers:unique(blocks),
    aggregateEvidenceSummarySha256:aggregateDigest
  };
}
/**
 * Only this entrypoint accepts raw evidence. It rebuilds every research
 * result from original bytes, not from untrusted user-pasted phase reports.
 */
export function runAdaptiveFullResearchReadiness(
  input:FullResearchReadinessInput
):FullResearchReadinessReport{
  const initial=blank();
  if(!input||!input.bundleBytes?.length)
    return {...initial,errors:['ORIGINAL_BUNDLE_FILE_REQUIRED']};
  const raw=parseJson<VerifiedHistoricalBundleV1>(input.bundleBytes,50*1024*1024);
  const cal=parseJson<IndependentlySuppliedCalendarEvidence>(
    input.calendarManifestBytes,1024*1024);
  const segmentEvidence=parseJson<VersionedInstrumentSessionEvidence>(
    input.instrumentSessionEvidenceBytes,1024*1024);
  const manifest=parseJson<PinnedResearchPolicyLock>(
    input.policyLockManifestBytes,128*1024);
  const p=input.policies;
  if(!raw||!cal||!segmentEvidence||!manifest||!p)
    return {...initial,errors:['MALFORMED_BUNDLE_CALENDAR_POLICY_LOCK_OR_REQUIRED_POLICIES']};
  const ep=parseJson<AdaptiveExitReplayPolicy>(p.entryFirstExit,128*1024);
  const qp=parseJson<AdaptiveMarketDataQualityPolicy>(p.marketDataQuality,128*1024);
  const gp=parseJson<AdaptiveResearchEvidencePolicy>(p.researchEvidenceGate,128*1024);
  const hp=parseJson<HysteresisResearchPolicy>(p.regimeHysteresis,128*1024);
  const mp=parseJson<HysteresisMatchedOosPolicy>(p.matchedOos,128*1024);
  const sp=parseJson<PremiumCostDepthStressPolicy>(p.premiumCostDepthStress,128*1024);
  const pp=parseJson<ObservedPremiumRunupPolicy>(p.premiumPathReversal,128*1024);
  if(!ep||!qp||!gp||!hp||!mp||!sp||!pp)
    return {...initial,errors:['MALFORMED_OR_MISSING_PREDECLARED_POLICY_FILES']};
  const segmentSessionAudit=auditAdaptiveVersionedInstrumentSessions(
    raw,cal,input.calendarManifestBytes,
    segmentEvidence,input.instrumentSessionEvidenceBytes);
  const archive=auditAdaptiveSourceArtifact(raw,input.vendorArchiveBytes);
  const calendar=auditAdaptiveCrossSourceExchangeCalendar(
    raw,cal,input.calendarDocumentBytes);
  const witness=auditAdaptiveSignedEvidenceWitness({
    bundleBytes:input.bundleBytes,
    vendorArchiveBytes:input.vendorArchiveBytes,
    calendarManifestBytes:input.calendarManifestBytes,
    calendarDocumentBytes:input.calendarDocumentBytes,
    operatorTrustRegistryBytes:input.reviewerTrustRegistryBytes,
    expectedOperatorTrustRegistrySha256:
      input.pinnedReviewerTrustRegistrySha256,
    envelope:input.witnessEnvelope
  });
  const result=blank();
  result.datasetId=raw.provenance?.datasetId??null;
  result.synthetic=raw.provenance?.synthetic??null;
  result.studyProtocolId=gp.studyProtocolId??null;
  result.inputDigests={
    sourceBundleSha256:sha(input.bundleBytes),
    originalVendorArchiveSha256:input.vendorArchiveBytes?.length?
      sha(input.vendorArchiveBytes):null,
    calendarManifestSha256:sha(input.calendarManifestBytes!),
    calendarDocumentSha256:input.calendarDocumentBytes?.length?
      sha(input.calendarDocumentBytes):null,
    reviewerTrustRegistrySha256:input.reviewerTrustRegistryBytes?.length?
      sha(input.reviewerTrustRegistryBytes):null,
    policyLockManifestSha256:input.policyLockManifestBytes?.length?
      sha(input.policyLockManifestBytes):null
  };
  const pinned=validatePinnedResearchPolicyLock(
    manifest,input.pinnedPolicyLockManifestSha256,
    input.policyLockManifestBytes,p,{
      datasetId:raw.provenance?.datasetId??'',
      studyProtocolId:(input.witnessEnvelope as ResearchEvidenceWitnessEnvelope|null)?.
        studyProtocolId??'',
      originalBundleSha256:sha(input.bundleBytes),
      prespecifiedAt:gp.prespecifiedAt
    }
  );
  if(!pinned.valid)
    return {...result,status:'REJECTED',
      matchedPolicyLock:false,errors:pinned.errors,
      phaseStatuses:{sourceArchive:archive.status,
        separateCalendar:calendar.status,signedWitness:witness.status}};
  if(gp.studyProtocolId!==(input.witnessEnvelope as ResearchEvidenceWitnessEnvelope|null)?.
     studyProtocolId)
    return {...result,status:'REJECTED',
      errors:['POLICY_PROTOCOL_DOES_NOT_MATCH_DUAL_SIGNED_SOURCE_ENVELOPE']};
  const ingested=ingestVendorHistoricalBundle(raw);
  const walk=runAdaptiveWalkForwardStudy(raw);
  if(!ingested.input||walk.status==='REJECTED')
    return {...result,status:'REJECTED',
      errors:['SOURCE_ATTESTED_HISTORICAL_DECISIONS_INVALID',
        ...ingested.errors,...walk.errors],
      phaseStatuses:{sourceArchive:archive.status,
        separateCalendar:calendar.status,signedWitness:witness.status,
        ingest:ingested.status,walk:walk.status}};
  const decisions=ingested.input;
  try{
    const entry=runAdaptiveEntryFirstExitStudy(
      decisions,ep,raw.declaredExchangeSessions);
    const quality=auditAdaptiveL1MarketDataQuality(
      decisions,raw.declaredExchangeSessions,raw.executionL1,qp);
    const gate=evaluateAdaptiveResearchEvidenceGate(
      walk,quality,entry,archive,gp);
    const hysteresis=replayAdaptiveRegimeHysteresis(
      decisions,raw.declaredExchangeSessions,hp);
    const matched=compareAdaptiveHysteresisMatchedOos(
      decisions,raw.declaredExchangeSessions,ep,hp,mp);
    const premiumStress=auditAdaptiveMatchedPremiumCostDepthStress(
      decisions,raw.declaredExchangeSessions,ep,hp,mp,sp);
    const premiumPath=auditAdaptiveObservedPremiumRunupReversals(
      decisions,raw.declaredExchangeSessions,ep,hp,matched,pp);
    const expectedTestSessions=raw.policy.folds.map(f=>
      decisions.decisions.filter(d=>d.sessionDate>=f.testStart&&
        d.sessionDate<=f.testEnd).length);
    const review=evaluateAdaptiveFullResearchReadiness({
      source:archive,walk,entry,quality,researchGate:gate,
      hysteresis,matched,premiumStress,premiumPath,calendar,witness,
      instrumentSessions:segmentSessionAudit
    },{
      datasetId:raw.provenance.datasetId,
      synthetic:raw.provenance.synthetic,
      protocolId:gp.studyProtocolId,
      lockStudyProtocolId:manifest.studyProtocolId,
      expectedTestSessions,originalBundleSha256:sha(input.bundleBytes)
    },true);
    return {...review,
      inputDigests:result.inputDigests,
      instrumentSessionScheduleSha256:segmentSessionAudit.evidenceSha256,
      matchedPolicyLock:true
    };
  }catch{
    return {...result,status:'REJECTED',
      errors:['INVALID_OR_THROWING_OFFLINE_RESEARCH_POLICY_OR_SOURCE_RECORD'],
      phaseStatuses:{sourceArchive:archive.status,
        separateCalendar:calendar.status,signedWitness:witness.status}};
  }
}
