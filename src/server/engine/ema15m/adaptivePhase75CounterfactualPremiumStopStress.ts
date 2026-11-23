/**
 * Phase75 — strictly counterfactual long-option premium giveback, next-open
 * gap, zero BID-depth and entire paid-debit loss scenarios.
 *
 * This is an offline *stress arithmetic* matrix, NEVER historical quote
 * observations, fills, actual backtest returns, an optimized stop or a
 * broker order.  Original Phase74->66 OOS is re-audited and the scenario
 * grid must retain EVERY originally ENTRY_CLAIMED CE/PE listed contract
 * while never turning NO_ENTRY alternatives into trades.
 *
 * Stop/GTT exchange acknowledgement and real 1W–8W market data are absent.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase74RetrospectiveCausalReplay,
  type Phase74Input,type Phase74Pins,type Phase74Report
} from './adaptivePhase74RetrospectiveCausalReplay.js';
import type {Phase66OriginalCatalog}
  from './adaptivePhase66StandaloneVendorPreflight.js';

const SHA=/^[a-f0-9]{64}$/;
const DAY=86400000;
type Horizon='1W'|'2W'|'4W'|'8W';
type Side='CE'|'PE';
const HORIZONS:['1W','2W','4W','8W']=['1W','2W','4W','8W'];
const SCENARIOS=[
  'PRE_TARGET_GIVEBACK',
  'OVERNIGHT_GAP_BELOW_TRAIL',
  'NEXT_OPEN_ZERO_BID_DEPTH',
  'EXPIRY_FULL_PREMIUM_DEBIT_LOSS'
] as const;
export type Phase75ScenarioKind=typeof SCENARIOS[number];
const hash=(x:unknown):string=>createHash('sha256')
  .update(JSON.stringify(x)).digest('hex');
export const hashPhase75Evidence=hash;
const integer=(v:unknown,lo:number,hi:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const num=(v:unknown,lo:number,hi:number):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const round=(v:number)=>Number(v.toFixed(2));
function b64(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||!s.length||
    s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>2&&b.length<=max&&b.toString('base64')===s?b:null;
  }catch{return null;}
}
function parse<T>(bytes:Buffer):T|null{
  try{
    const obj=JSON.parse(new TextDecoder('utf8',{fatal:true})
      .decode(bytes));
    return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj as T:null;
  }catch{return null;}
}
function horizon(expiry:string,decisionAt:string):Horizon|null{
  const d=(Date.parse(expiry+'T10:00:00Z')-
    Date.parse(decisionAt))/DAY;
  return d>=1&&d<8?'1W':d>=8&&d<18?'2W':
    d>=18&&d<36?'4W':d>=36&&d<=80?'8W':null;
}
export interface Phase75RiskPolicy{
  schemaVersion:'ADAPTIVE_PHASE75_PREREGISTERED_COUNTERFACTUAL_STRESS_V1';
  source:'SYNTHETIC_OPTION_PREMIUM_NOT_HISTORICAL_MARKET_OUTCOME';
  /** Option premium POINTS, not NIFTY underlying index points. */
  premiumTrailArmingGainPoints:number;
  premiumGivebackAlertPoints:number;
  premiumTargetAlertPoints:number;
  /** All calculations explicitly in INR for ONE listed lot only. */
  assumedNonRecoverableEntryAndExitFeesINR:number;
  minimumDisplayedBidDepthLotsForMark:number;
  maxSingleLongOptionPaidDebitPlusFeesINR:number;
  /** Illustrative risk budget, NEVER an exchange guaranteed stop. */
  maxAdverseObservedMarkLossINR:number;
  requireAllFourScenariosPerOriginalEntryClaimedListedOption:true;
  prohibitNoEntryOptionFromSimulatedPosition:true;
  nativeBrokerStopAcknowledgementMayNotBeInferred:true;
}
export interface Phase75CounterfactualPath{
  sessionDate:string;
  instrumentKey:string;
  scenario:Phase75ScenarioKind;
  /** Assumed option premium ASK points; not an observed historical fill. */
  assumedEntryAskPremiumPoints:number;
  /** Assumed best BID high-water mark, not an executed profitable exit. */
  assumedPeakBidPremiumPoints:number;
  /** Assumed later best BID; no promise it can be executed. */
  assumedLaterBidPremiumPoints:number;
  /** Claimed displayed BID depth in original contract lot units. */
  assumedLaterDisplayedBidDepthLots:number;
}
export interface Phase75ScenarioArchive{
  schemaVersion:'ADAPTIVE_PHASE75_FOUR_COUNTERFACTUAL_PATHS_PER_ENTRY_V1';
  source:'HANDCRAFTED_STRESS_PATHS_NOT_HISTORICAL_PRICE_OBSERVATIONS';
  paths:Phase75CounterfactualPath[];
}
export interface Phase75Input{
  schemaVersion:'ADAPTIVE_PHASE75_PREMIUM_STOP_NOFILL_STRESS_V1';
  source:'OFFLINE_FROZEN_OOS_COUNTERFACTUAL_ARITHMETIC_NO_BROKER_WRITES';
  phase74:Phase74Input;
  phase74Pins:Phase74Pins;
  policy:Phase75RiskPolicy;
  scenarioArchiveRawBase64:string;
}
export interface Phase75Pins{
  schemaVersion:'INDEPENDENT_PHASE75_PREDECLARED_PREMIUM_STRESS_PINS_V1';
  expectedPhase74InputSha256:string;
  expectedPhase74PinsSha256:string;
  expectedRiskPolicySha256:string;
  expectedScenarioArchiveRawSha256:string;
  expectedOriginalOosDecisions:number;
  expectedOriginalNoEntryDecisions:number;
  expectedAllListedCePePairs:number;
  expectedOriginalEntryClaimedListedPairs:number;
  expectedOriginalNoEntryListedPairs:number;
  expectedScenarioPaths:number;
}
export interface Phase75HorizonCell{
  claimedRegime:string;
  horizon:Horizon;
  optionType:Side;
  originalAllListedPairs:number;
  originalNoEntryPairs:number;
  originalEntryClaimedPairs:number;
  counterfactualScenarios:number;
  premiumRunupBelowTargetGivebackScenarios:number;
  premiumTrailAlertButNoProvenStopFillScenarios:number;
  observedHypotheticalBidBelowTrailScenarios:number;
  zeroDepthOrFullDebitStressScenarios:number;
  illustrativeLossMarkBeyondRiskBudgetScenarios:number;
  fullPaidDebitExceedsEntryBudgetScenarios:number;
  maxAssumedPaidDebitPlusFeesINR:number;
  maxAssumedPaidDebitLossINR:number;
  maxObservedCounterfactualMarkLossINR:number;
  bestContractOrHorizonMayBeSelected:false;
  historicalMarketResultsObserved:false;
  brokerStopOrExitFillProven:false;
}
export interface Phase75Report{
  mode:'OFFLINE_LONG_OPTION_PREMIUM_GIVEBACK_GAP_ZERO_DEPTH_FULL_DEBIT_STRESS';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_HYPOTHETICAL_LOSS_BUDGET_EXCEEDED_NO_TRADING'|
    'DESCRIPTIVE_HYPOTHETICAL_STRESS_ONLY_NOT_OOS_OR_EXECUTION';
  reasonCodes:string[];
  parentPhase74Status:Phase74Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisions:number;
  originalNoEntryDecisions:number;
  allOriginalListedCePePairs:number;
  originalEntryClaimedListedPairs:number;
  originalNoEntryListedPairs:number;
  completeCounterfactualStressPaths:number;
  premiumRunupGivebackScenarioCount:number;
  afterPeakBidBelowHypotheticalTrailCount:number;
  zeroDisplayedBidDepthOrFullDebitPaths:number;
  counterfactualObservedMarkLossExceedsBudget:number;
  paidLongOptionDebitExceedsPerEntryBudget:number;
  observedQuoteMarksAreNotExecutableFills:true;
  hypotheticalStopLevelCannotGuaranteeGapFill:true;
  completePaidPremiumAndFeesMayBeLost:true;
  underlyingIndexPointsCannotBeDeductedFromOptionPremiumPoints:true;
  genuineOriginalLicensedMarketTapeVerified:false;
  trueOriginalClientDecisionAsOfCaptureVerified:false;
  actualMultiRegimeOosStrategyProfitabilityProven:false;
  trueIvThetaSpreadMarketGapCostsCalibrated:false;
  optionContractOrOneToEightWeekRankAuthorized:false;
  overnightBrokerNativeNrmlGttStopChildExchangeAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  cells:Phase75HorizonCell[];
  externalEvidenceRequired:string[];
}
const REQUIRED=[
  'GENUINELY_LICENSED_ORIGINAL_OPTION_BID_ASK_DEPTH_AND_HISTORICAL_EXCHANGE_SESSIONS',
  'OFFICIALLY_AUTHENTICATED_POINT_IN_TIME_FO_CONTRACT_LOT_EXPIRY_AND_HOLIDAYS',
  'CONTEMPORANEOUS_CLIENT_SOURCE_RECEIPT_IF_GENUINELY_CAPTURED',
  'UNTOUCHED_MULTI_CYCLE_REGIME_OOS_FOR_ENTRY_EXIT_THETA_IV_SLIPPAGE_AND_GAP',
  'REAL_BROKER_NRML_STOP_GTT_TRIGGER_CHILD_EXCHANGE_ACK_CANCEL_NONFILL',
  'TRUE_CAPITAL_BUDGET_ENTIRE_LONG_PREMIUM_DEBIT_PLUS_NONRECOVERABLE_FEES'
];
function blank():Phase75Report{
  return {
    mode:'OFFLINE_LONG_OPTION_PREMIUM_GIVEBACK_GAP_ZERO_DEPTH_FULL_DEBIT_STRESS',
    status:'INVALID_EVIDENCE',reasonCodes:[],
    parentPhase74Status:null,syntheticDataset:null,
    originalOosDecisions:0,originalNoEntryDecisions:0,
    allOriginalListedCePePairs:0,
    originalEntryClaimedListedPairs:0,originalNoEntryListedPairs:0,
    completeCounterfactualStressPaths:0,premiumRunupGivebackScenarioCount:0,
    afterPeakBidBelowHypotheticalTrailCount:0,
    zeroDisplayedBidDepthOrFullDebitPaths:0,
    counterfactualObservedMarkLossExceedsBudget:0,
    paidLongOptionDebitExceedsPerEntryBudget:0,
    observedQuoteMarksAreNotExecutableFills:true,
    hypotheticalStopLevelCannotGuaranteeGapFill:true,
    completePaidPremiumAndFeesMayBeLost:true,
    underlyingIndexPointsCannotBeDeductedFromOptionPremiumPoints:true,
    genuineOriginalLicensedMarketTapeVerified:false,
    trueOriginalClientDecisionAsOfCaptureVerified:false,
    actualMultiRegimeOosStrategyProfitabilityProven:false,
    trueIvThetaSpreadMarketGapCostsCalibrated:false,
    optionContractOrOneToEightWeekRankAuthorized:false,
    overnightBrokerNativeNrmlGttStopChildExchangeAckVerified:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    cells:[],externalEvidenceRequired:REQUIRED
  };
}
const fail=(reason:string,
  status:Phase75Report['status']='INCOMPLETE_EVIDENCE',
  extra?:Partial<Phase75Report>):Phase75Report=>({
  ...blank(),...extra,status,reasonCodes:[reason]
});
const key=(date:string,id:string)=>JSON.stringify([date,id]);
const allKey=(date:string,id:string,scenario:string)=>
  JSON.stringify([date,id,scenario]);
function validatePolicy(p:Phase75RiskPolicy):boolean{
  return !!p&&p.schemaVersion===
      'ADAPTIVE_PHASE75_PREREGISTERED_COUNTERFACTUAL_STRESS_V1'&&
    p.source==='SYNTHETIC_OPTION_PREMIUM_NOT_HISTORICAL_MARKET_OUTCOME'&&
    num(p.premiumTrailArmingGainPoints,1,10000)&&
    num(p.premiumGivebackAlertPoints,1,10000)&&
    num(p.premiumTargetAlertPoints,1,10000)&&
    p.premiumGivebackAlertPoints<p.premiumTrailArmingGainPoints&&
    p.premiumTrailArmingGainPoints<p.premiumTargetAlertPoints&&
    num(p.assumedNonRecoverableEntryAndExitFeesINR,0,10000)&&
    integer(p.minimumDisplayedBidDepthLotsForMark,1,100)&&
    num(p.maxSingleLongOptionPaidDebitPlusFeesINR,1,1e9)&&
    num(p.maxAdverseObservedMarkLossINR,1,1e9)&&
    p.requireAllFourScenariosPerOriginalEntryClaimedListedOption===true&&
    p.prohibitNoEntryOptionFromSimulatedPosition===true&&
    p.nativeBrokerStopAcknowledgementMayNotBeInferred===true;
}
export function auditPhase75CounterfactualPremiumStopStress(
  input:Phase75Input,pins:Phase75Pins
):Phase75Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE75_PREMIUM_STOP_NOFILL_STRESS_V1'||
    input.source!==
      'OFFLINE_FROZEN_OOS_COUNTERFACTUAL_ARITHMETIC_NO_BROKER_WRITES'||
    !input.phase74||!input.phase74Pins||!validatePolicy(input.policy)||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE75_PREDECLARED_PREMIUM_STRESS_PINS_V1'||
    ![pins.expectedPhase74InputSha256,pins.expectedPhase74PinsSha256,
      pins.expectedRiskPolicySha256,
      pins.expectedScenarioArchiveRawSha256].every(v=>
      typeof v==='string'&&SHA.test(v))||
    hash(input.phase74)!==pins.expectedPhase74InputSha256||
    hash(input.phase74Pins)!==pins.expectedPhase74PinsSha256||
    hash(input.policy)!==pins.expectedRiskPolicySha256||
    !integer(pins.expectedOriginalOosDecisions,2,100000)||
    !integer(pins.expectedOriginalNoEntryDecisions,0,100000)||
    !integer(pins.expectedAllListedCePePairs,8,1000000)||
    !integer(pins.expectedOriginalEntryClaimedListedPairs,1,1000000)||
    !integer(pins.expectedOriginalNoEntryListedPairs,1,1000000)||
    !integer(pins.expectedScenarioPaths,4,4000000)||
    pins.expectedOriginalEntryClaimedListedPairs+
      pins.expectedOriginalNoEntryListedPairs!==
      pins.expectedAllListedCePePairs||
    pins.expectedScenarioPaths!==
      4*pins.expectedOriginalEntryClaimedListedPairs)
    return fail('PHASE75_FROZEN_ORIGINAL_OOS_POLICY_OR_STRESS_PINS_INVALID',
      'INVALID_EVIDENCE');
  const archiveBytes=b64(input.scenarioArchiveRawBase64,5_000_000);
  if(!archiveBytes||
    createHash('sha256').update(archiveBytes).digest('hex')!==
      pins.expectedScenarioArchiveRawSha256)
    return fail('PHASE75_ORIGINAL_COUNTERFACTUAL_RAW_PATH_BYTES_CHANGED',
      'INVALID_EVIDENCE');
  const archive=parse<Phase75ScenarioArchive>(archiveBytes);
  if(!archive||archive.schemaVersion!==
      'ADAPTIVE_PHASE75_FOUR_COUNTERFACTUAL_PATHS_PER_ENTRY_V1'||
    archive.source!==
      'HANDCRAFTED_STRESS_PATHS_NOT_HISTORICAL_PRICE_OBSERVATIONS'||
    !Array.isArray(archive.paths)||
    archive.paths.length!==pins.expectedScenarioPaths)
    return fail('PHASE75_STRESS_ARCHIVE_SHAPE_OR_SOURCE_COHORT_CHANGED');
  let parent:Phase74Report;
  try{
    parent=auditPhase74RetrospectiveCausalReplay(
      input.phase74,input.phase74Pins);
  }catch{return fail('PHASE74_ORIGINAL_CAUSAL_SOURCE_REAUDIT_EXCEPTION');}
  const partial:Partial<Phase75Report>={
    parentPhase74Status:parent.status,
    syntheticDataset:parent.syntheticDataset
  };
  if(!parent.status.startsWith('DESCRIPTIVE_')||
    parent.originalOosDecisionDays!==pins.expectedOriginalOosDecisions||
    parent.originalNoEntryDays!==pins.expectedOriginalNoEntryDecisions||
    parent.originalListedCePePairs!==pins.expectedAllListedCePePairs||
    parent.originalNoEntryListedPairs!==
      pins.expectedOriginalNoEntryListedPairs)
    return fail('PHASE75_ORIGINAL_OOS_ASOF_PARENT_EVIDENCE_NOT_READY',
      'INCOMPLETE_EVIDENCE',partial);
  const catalogB64=input.phase74.phase73.phase72.phase71.phase70.phase69
    .phase68.phase67.originalVendor.newVendorFullListedCatalogBase64;
  const catalogBytes=b64(catalogB64,25_000_000);
  const catalog=catalogBytes?parse<Phase66OriginalCatalog>(catalogBytes):null;
  if(!catalog||!Array.isArray(catalog.decisions))
    return fail('PHASE75_ORIGINAL_OPTION_LISTING_CATALOG_MISSING',
      'INCOMPLETE_EVIDENCE',partial);
  const listed=new Map<string,{
    regime:string;horizon:Horizon;optionType:Side;
    lotSize:number;noEntry:boolean
  }>();
  let originalNoEntry=0,entryClaimed=0;
  const grouped=new Map<string,Phase75HorizonCell>();
  for(const decision of catalog.decisions){
    for(const c of decision.originallyListedContracts){
      const h=horizon(c.expiry,decision.decisionAt);
      if(!h||!integer(c.lotSize,1,10000)||
        !['CE','PE'].includes(c.optionType))
        return fail('PHASE75_LISTED_CONTRACT_HORIZON_LOT_OR_SIDE_INVALID',
          'INCOMPLETE_EVIDENCE',partial);
      const k=key(decision.sessionDate,c.instrumentKey);
      if(listed.has(k))
        return fail('PHASE75_ORIGINAL_OPTION_LISTING_DUPLICATED',
          'INCOMPLETE_EVIDENCE',partial);
      const noEntry=decision.originalEntryDisposition==='NO_ENTRY';
      listed.set(k,{
        regime:decision.claimedRegime,horizon:h,
        optionType:c.optionType,lotSize:c.lotSize,noEntry
      });
      if(noEntry)originalNoEntry++;else entryClaimed++;
      const g=JSON.stringify([decision.claimedRegime,h,c.optionType]);
      let cell=grouped.get(g);
      if(!cell){
        cell={
          claimedRegime:decision.claimedRegime,horizon:h,
          optionType:c.optionType,originalAllListedPairs:0,
          originalNoEntryPairs:0,originalEntryClaimedPairs:0,
          counterfactualScenarios:0,
          premiumRunupBelowTargetGivebackScenarios:0,
          premiumTrailAlertButNoProvenStopFillScenarios:0,
          observedHypotheticalBidBelowTrailScenarios:0,
          zeroDepthOrFullDebitStressScenarios:0,
          illustrativeLossMarkBeyondRiskBudgetScenarios:0,
          fullPaidDebitExceedsEntryBudgetScenarios:0,
          maxAssumedPaidDebitPlusFeesINR:0,
          maxAssumedPaidDebitLossINR:0,
          maxObservedCounterfactualMarkLossINR:0,
          bestContractOrHorizonMayBeSelected:false,
          historicalMarketResultsObserved:false,
          brokerStopOrExitFillProven:false
        };
        grouped.set(g,cell);
      }
      cell.originalAllListedPairs++;
      if(noEntry)cell.originalNoEntryPairs++;
      else cell.originalEntryClaimedPairs++;
    }
  }
  if(listed.size!==parent.originalListedCePePairs||
    originalNoEntry!==pins.expectedOriginalNoEntryListedPairs||
    entryClaimed!==pins.expectedOriginalEntryClaimedListedPairs)
    return fail('PHASE75_ALL_LISTED_AND_NO_ENTRY_UNIVERSE_CHANGED',
      'INCOMPLETE_EVIDENCE',partial);
  const used=new Set<string>(),
    stressByPair=new Map<string,Set<string>>();
  let giveback=0,belowTrail=0,zeroDepth=0,
    lossBudget=0,entryBudget=0;
  for(const row of archive.paths){
    if(!row||!SCENARIOS.includes(row.scenario)||
      typeof row.sessionDate!=='string'||
      typeof row.instrumentKey!=='string'||
      !num(row.assumedEntryAskPremiumPoints,0.01,1e6)||
      !num(row.assumedPeakBidPremiumPoints,0,1e6)||
      !num(row.assumedLaterBidPremiumPoints,0,1e6)||
      !integer(row.assumedLaterDisplayedBidDepthLots,0,100000))
      return fail('PHASE75_COUNTERFACTUAL_PREMIUM_DEPTH_OR_KIND_INVALID',
        'INCOMPLETE_EVIDENCE',partial);
    const pair=key(row.sessionDate,row.instrumentKey),
      c=listed.get(pair);
    if(!c||c.noEntry)
      return fail('PHASE75_NO_ENTRY_OR_UNLISTED_OPTION_STRESS_NOT_ADMITTED',
        'INCOMPLETE_EVIDENCE',partial);
    const k=allKey(row.sessionDate,row.instrumentKey,row.scenario);
    if(used.has(k))
      return fail('PHASE75_DUPLICATE_STRESS_PATH_CHERRY_PICKING',
        'INCOMPLETE_EVIDENCE',partial);
    used.add(k);
    const kinds=stressByPair.get(pair)??new Set<string>();
    kinds.add(row.scenario);stressByPair.set(pair,kinds);
    const policy=input.policy;
    const paid=row.assumedEntryAskPremiumPoints*c.lotSize+
      policy.assumedNonRecoverableEntryAndExitFeesINR;
    const peakGain=row.assumedPeakBidPremiumPoints-
      row.assumedEntryAskPremiumPoints;
    const armed=peakGain>=policy.premiumTrailArmingGainPoints;
    const trail=armed?
      row.assumedPeakBidPremiumPoints-
        policy.premiumGivebackAlertPoints:null;
    const laterBelow=trail!==null&&
      row.assumedLaterBidPremiumPoints<=trail;
    const noDepth=row.assumedLaterDisplayedBidDepthLots<
      policy.minimumDisplayedBidDepthLotsForMark;
    const fullDebitKind=row.scenario==='EXPIRY_FULL_PREMIUM_DEBIT_LOSS';
    if(row.assumedPeakBidPremiumPoints<
       row.assumedEntryAskPremiumPoints||
      row.assumedLaterBidPremiumPoints>
        row.assumedPeakBidPremiumPoints||
      ((row.scenario==='PRE_TARGET_GIVEBACK'||
        row.scenario==='OVERNIGHT_GAP_BELOW_TRAIL')&&
        (!armed||peakGain>=policy.premiumTargetAlertPoints||
          !laterBelow||noDepth))||
      (row.scenario==='OVERNIGHT_GAP_BELOW_TRAIL'&&
        row.assumedLaterBidPremiumPoints>=
          row.assumedEntryAskPremiumPoints)||
      ((row.scenario==='NEXT_OPEN_ZERO_BID_DEPTH'||fullDebitKind)&&
        (!noDepth||row.assumedLaterBidPremiumPoints!==0)))
      return fail('PHASE75_STRESS_SCENARIO_CANNOT_MATCH_PREDECLARED_STRESS',
        'INCOMPLETE_EVIDENCE',partial);
    const g=JSON.stringify([c.regime,c.horizon,c.optionType]);
    const cell=grouped.get(g)!;
    cell.counterfactualScenarios++;
    if(row.scenario==='PRE_TARGET_GIVEBACK'){
      giveback++;cell.premiumRunupBelowTargetGivebackScenarios++;
    }
    if(laterBelow){
      belowTrail++;cell.observedHypotheticalBidBelowTrailScenarios++;
      cell.premiumTrailAlertButNoProvenStopFillScenarios++;
    }
    if(noDepth||fullDebitKind){
      zeroDepth++;cell.zeroDepthOrFullDebitStressScenarios++;
    }
    // A displayed later BID at positive depth is only a MARK, never
    // evidence the strategy could sell a full lot at that price.
    const markedLoss=noDepth?paid:Math.max(0,
      (row.assumedEntryAskPremiumPoints-
        row.assumedLaterBidPremiumPoints)*c.lotSize+
          policy.assumedNonRecoverableEntryAndExitFeesINR);
    if(markedLoss>policy.maxAdverseObservedMarkLossINR){
      lossBudget++;cell.illustrativeLossMarkBeyondRiskBudgetScenarios++;
    }
    if(paid>policy.maxSingleLongOptionPaidDebitPlusFeesINR){
      entryBudget++;cell.fullPaidDebitExceedsEntryBudgetScenarios++;
    }
    cell.maxAssumedPaidDebitPlusFeesINR=Math.max(
      cell.maxAssumedPaidDebitPlusFeesINR,round(paid));
    cell.maxAssumedPaidDebitLossINR=Math.max(
      cell.maxAssumedPaidDebitLossINR,round(paid));
    cell.maxObservedCounterfactualMarkLossINR=Math.max(
      cell.maxObservedCounterfactualMarkLossINR,round(markedLoss));
  }
  for(const [k,c] of listed){
    if(c.noEntry)continue;
    const kinds=stressByPair.get(k);
    if(!kinds||kinds.size!==SCENARIOS.length||
      SCENARIOS.some(s=>!kinds.has(s)))
      return fail('PHASE75_EVERY_ORIGINAL_ENTRY_MUST_HAVE_FOUR_STRESS_PATHS',
        'INCOMPLETE_EVIDENCE',partial);
  }
  if(used.size!==pins.expectedScenarioPaths||
    [...grouped.values()].reduce((n,c)=>
      n+c.counterfactualScenarios,0)!==pins.expectedScenarioPaths||
    HORIZONS.some(h=>![...grouped.values()].some(c=>
      c.horizon===h&&c.counterfactualScenarios>0)))
    return fail('PHASE75_FULL_OOS_HORIZON_STRESS_DENOMINATOR_CHANGED',
      'INCOMPLETE_EVIDENCE',partial);
  return {...blank(),...partial,
    status:lossBudget>0||entryBudget>0?
      'DESCRIPTIVE_HYPOTHETICAL_LOSS_BUDGET_EXCEEDED_NO_TRADING':
      'DESCRIPTIVE_HYPOTHETICAL_STRESS_ONLY_NOT_OOS_OR_EXECUTION',
    reasonCodes:[
      'ALL_FOUR_PREDECLARED_COUNTERFACTUAL_STRESS_PATHS_PRESERVED_PER_ENTRY_LISTED_PAIR',
      'NO_ENTRY_OPTIONS_NEVER_BECOME_HYPOTHETICAL_EXECUTED_POSITIONS',
      'QUOTED_STOP_TRIGGER_CANNOT_GUARANTEE_OVERNIGHT_GAP_FILL',
      'ENTIRE_LONG_OPTION_PAID_DEBIT_PLUS_FEES_MAY_BE_LOST',
      'NIFTY_UNDERLYING_INDEX_TARGET_NOT_DERIVABLE_FROM_OPTION_PREMIUM_POINTS',
      'NO_AUTHENTICATED_MARKET_SOURCE_PROFITABLE_OOS_OR_BROKER_NATIVE_ACK'
    ],
    originalOosDecisions:catalog.decisions.length,
    originalNoEntryDecisions:catalog.decisions.filter(d=>
      d.originalEntryDisposition==='NO_ENTRY').length,
    allOriginalListedCePePairs:listed.size,
    originalEntryClaimedListedPairs:entryClaimed,
    originalNoEntryListedPairs:originalNoEntry,
    completeCounterfactualStressPaths:used.size,
    premiumRunupGivebackScenarioCount:giveback,
    afterPeakBidBelowHypotheticalTrailCount:belowTrail,
    zeroDisplayedBidDepthOrFullDebitPaths:zeroDepth,
    counterfactualObservedMarkLossExceedsBudget:lossBudget,
    paidLongOptionDebitExceedsPerEntryBudget:entryBudget,
    cells:[...grouped.values()]
  };
}
