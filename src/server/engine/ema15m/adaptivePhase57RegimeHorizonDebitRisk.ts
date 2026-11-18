/**
 * Adaptive Swing v2 Phase57 — OFFLINE regime × horizon long-option cash debit
 * and premium-reversal risk ENVELOPE.  Research only, never a signal or
 * execution eligibility check.
 *
 * Entrants come exclusively from the original Phase8 entry-first cohort,
 * after Phase51 -> Phase50 independently pinned market-source re-audit.
 * Missing source L1/one-sided market is unknown; never assign zero PnL.
 * 25/50/75/100% hypothetical premium losses are NOT observed outcomes,
 * IV/theta decomposition, price forecasts, a stop fill, or profitable trades.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase51DeclaredOosSessionCoverage,
  type Phase51Input,type Phase51IndependentPins,type Phase51Report
} from './adaptivePhase51DeclaredSessionOosLedger.js';
import {buildAdaptiveEntryFirstCohort,type CohortDecision}
  from './adaptiveEntryFirstCohort.js';
import {analyzeAdaptiveRegime,type AdaptiveRegime}
  from './adaptiveMarketRegime.js';
import type {HistoricalArm} from './historicalAdaptiveComparison.js';
import type {HorizonBucket} from './adaptiveOptionRanker.js';

const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const ACTIVE=['SIDEWAYS','VOLATILE','TREND_UP','TREND_DOWN','TRANSITION']
  as const satisfies readonly AdaptiveRegime[];
const SHA=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const hash=(v:unknown):string=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
const validMoney=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const integer=(n:unknown,min:number,max:number):n is number=>
  validMoney(n,min,max)&&Number.isSafeInteger(n);
const ms=(x:unknown)=>typeof x==='string'&&ISO.test(x)?
  Date.parse(x):NaN;
const money=(n:number)=>Number(n.toFixed(2));
export const hashPhase57Evidence=hash;

export interface Phase57RiskRule{
  /** Actual long premium is ASK × original quantity; not index points. */
  maximumSingleEntryDebitPlusFeesINR:number;
  /** Hypothetical per-entry fees/taxes; no real broker charge authenticated. */
  assumedNonRecoverableEntryAndExitCostsINR:number;
}
export interface Phase57Policy{
  schemaVersion:'ADAPTIVE_PHASE57_REGIME_HORIZON_DEBIT_ENVELOPE_V1';
  source:'PREREGISTERED_OFFLINE_RISK_BUDGET_UNVERIFIED';
  /** A full loss is possible even when a stop trigger exists. */
  premiumDrawdownFractions:[0.25,0.5,0.75,1];
  horizonRules:Record<HorizonBucket,Phase57RiskRule>;
  /** Compare distinct strategy arms separately: no 3x PnL/portfolio. */
  maximumCombinedFourHorizonDebitPerArmPerOosDecisionINR:number;
  minimumOosSessionsForAnyRegimeComparison:number;
  minimumDistinctObservedRegimesForCrossRegimeClaim:number;
}
export interface Phase57Input{
  schemaVersion:'ADAPTIVE_PHASE57_OFFLINE_REGIME_DEBIT_AUDIT_V1';
  source:'OFFLINE_OPERATOR_MARKET_DATA_UNVERIFIED';
  phase51:Phase51Input;
  phase51Pins:Phase51IndependentPins;
  policy:Phase57Policy;
}
export interface Phase57IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE57_REGIME_DEBIT_PRESPECIFICATION_V1';
  expectedPhase51InputSha256:string;
  expectedPhase51PinsSha256:string;
  expectedRiskPolicySha256:string;
  expectedOriginalOosSessionManifestSha256:string;
  expectedOosSessions:number;
  expectedFullArmHorizonAttempts:number;
}
export interface Phase57RegimeHorizonCell{
  regime:AdaptiveRegime;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  originalDecisionAttempts:number;
  entryObservedCount:number;
  originalNoEntryCount:number;
  missingSelectedOptionL1Count:number;
  totalOriginalPaidAskPremiumINR:number;
  totalHypotheticalFullDebitLossPlusCostsINR:number;
  /** Scenario loss totals include hypothetical costs and are NOT PnL. */
  hypotheticalPremiumDrawdownLossINR:[number,number,number,number];
  perEntryRiskBudgetBreaches:number;
  largestSingleEntryFullDebitLossINR:number;
  alternativeArmsNotIndependentExecutions:true;
  realBrokerFillOrStopVerified:false;
}
export interface Phase57ArmDecisionRisk{
  foldIndex:number;
  sessionDate:string;
  regime:AdaptiveRegime;
  arm:HistoricalArm;
  horizonEntriesObserved:number;
  horizonAttempts:4;
  missingOriginalSelectedOptionQuotes:number;
  /** Null if any risk-obligating original quote is missing. */
  hypotheticalCombinedFourHorizonFullDebitINR:number|null;
  maximumPermittedFourHorizonDebitINR:number;
  exceedsPredeclaredCombinedBudget:boolean|null;
  multipleHorizonEntriesAreAnAssumedPortfolioNotActualPositions:true;
}
export interface Phase57Report{
  mode:'OFFLINE_PREDECLARED_REGIME_HORIZON_LONG_PREMIUM_DEBIT_ENVELOPE';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_SINGLE_REGIME_RISK_ONLY'|
    'DESCRIPTIVE_MULTIREGIME_RISK_ENVELOPE_ONLY'|
    'DESCRIPTIVE_RISK_BUDGET_ALERT_ONLY';
  reasonCodes:string[];
  syntheticDataset:boolean|null;
  phase51Status:Phase51Report['status']|null;
  oosSessions:number;
  attemptedArmHorizonDecisions:number;
  originalObservedEntries:number;
  originalUnpricedSelectedOptionEntries:number;
  originalNonEntryAttempts:number;
  distinctObservedRegimes:number;
  regimeDecisionCounts:Partial<Record<AdaptiveRegime,number>>;
  perRegimeHorizonArm:Phase57RegimeHorizonCell[];
  perArmSessionPortfolio:Phase57ArmDecisionRisk[];
  singleEntryDebitBudgetBreaches:number;
  combinedFourHorizonDebitBudgetBreaches:number;
  missingOrAmbiguousOriginalQuoteBindings:number;
  hypotheticalCapitalCanLoseEntirePremiumDebit:true;
  underlyingIndexPointTargetDeterminesOptionPremium:false;
  greekOrIvThetaShockStatisticallyCalibrated:false;
  rankOrChooseBestHorizonAuthorized:false;
  observedHistoricalPerformanceMeasured:false;
  originalLicensedL1IndependentlyAuthenticated:false;
  exchangeCalendarAndContractMasterIndependentlyAuthenticated:false;
  sourceArrivalClockIndependentlyAuthenticated:false;
  brokerFillOrNativeOvernightStopVerified:false;
  unbiasedMultiRegimeOosProfitabilityProven:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'RESEARCH_ONLY_NO_SIGNAL_NO_AUTO_CONTRACT_SELECTION_NO_NRML_ORDER',
  'ENTRY_FIRST_ALTERNATIVE_STRATEGY_ARMS_MUST_NOT_BE_ADDED_AS_THREE_REAL_FILLS',
  'FOUR_HORIZON_PORTFOLIO_EXPOSURE_IS_HYPOTHETICAL_NOT_EXECUTED_PORTFOLIO',
  '25_50_75_100_PERCENT_PREMIUM_SHOCKS_ARE_ASSUMPTIONS_NOT_OBSERVED_PRICE_PATHS',
  'FULL_OPTION_PREMIUM_DEBIT_PLUS_FEES_CAN_BE_LOST_EVEN_WITH_A_STOP_TRIGGER',
  'PREMIUM_LOSS_SCENARIOS_DO_NOT_MODEL_IV_VEGA_THETA_GAMMA_OR_GAP_PROBABILITY',
  'INDEX_POINT_TARGET_DOES_NOT_IMPLY_OPTION_PREMIUM_GAIN_OR_LIQUIDITY',
  'MISSING_ORIGINAL_SELECTED_OPTION_L1_CANNOT_BE_CENSORED_TO_ZERO',
  'REGIME_IS_FROM_DECISION_TIME_CLOSED_15M_CANDLES_NOT_FUTURE_TEST_RETURN',
  'NO_HISTORICAL_PROFIT_COMPARISON_IF_REGIMES_OR_EXIT_PATHS_ARE_UNPROVEN',
  'NO_NATIVE_OVERNIGHT_STOP_FILL_QUEUE_FEE_LICENSE_OR_EXCHANGE_CALENDAR_PROOF',
  'NO_FORCED_15_15_NRML_EXIT_OR_LIVE_BROKER_GTT_WRITE'
];
const empty=():Phase57Report=>({
  mode:'OFFLINE_PREDECLARED_REGIME_HORIZON_LONG_PREMIUM_DEBIT_ENVELOPE',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  syntheticDataset:null,phase51Status:null,
  oosSessions:0,attemptedArmHorizonDecisions:0,
  originalObservedEntries:0,originalUnpricedSelectedOptionEntries:0,
  originalNonEntryAttempts:0,distinctObservedRegimes:0,
  regimeDecisionCounts:{},perRegimeHorizonArm:[],
  perArmSessionPortfolio:[],singleEntryDebitBudgetBreaches:0,
  combinedFourHorizonDebitBudgetBreaches:0,
  missingOrAmbiguousOriginalQuoteBindings:0,
  hypotheticalCapitalCanLoseEntirePremiumDebit:true,
  underlyingIndexPointTargetDeterminesOptionPremium:false,
  greekOrIvThetaShockStatisticallyCalibrated:false,
  rankOrChooseBestHorizonAuthorized:false,
  observedHistoricalPerformanceMeasured:false,
  originalLicensedL1IndependentlyAuthenticated:false,
  exchangeCalendarAndContractMasterIndependentlyAuthenticated:false,
  sourceArrivalClockIndependentlyAuthenticated:false,
  brokerFillOrNativeOvernightStopVerified:false,
  unbiasedMultiRegimeOosProfitabilityProven:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const bad=(code:string,status:Phase57Report['status']='INVALID_EVIDENCE',
  fields?:Partial<Phase57Report>):Phase57Report=>({
    ...empty(),...fields,status,reasonCodes:[code]
  });
function validPolicy(p:Phase57Policy):boolean{
  if(!p||p.schemaVersion!==
      'ADAPTIVE_PHASE57_REGIME_HORIZON_DEBIT_ENVELOPE_V1'||
    p.source!=='PREREGISTERED_OFFLINE_RISK_BUDGET_UNVERIFIED'||
    !Array.isArray(p.premiumDrawdownFractions)||
    JSON.stringify(p.premiumDrawdownFractions)!=='[0.25,0.5,0.75,1]'||
    !p.horizonRules||Object.keys(p.horizonRules).length!==4||
    !validMoney(p.maximumCombinedFourHorizonDebitPerArmPerOosDecisionINR,
      1,1e10)||
    !integer(p.minimumOosSessionsForAnyRegimeComparison,2,100000)||
    !integer(p.minimumDistinctObservedRegimesForCrossRegimeClaim,2,5))
    return false;
  return HORIZONS.every(h=>{
    const r=p.horizonRules[h];
    return !!r&&validMoney(r.maximumSingleEntryDebitPlusFeesINR,1,1e10)&&
      validMoney(r.assumedNonRecoverableEntryAndExitCostsINR,0,1e6);
  });
}
function sourceQuoteBinding(
  a:CohortDecision,
  input:Phase51Input
):{valid:boolean;premiumDebit:number}{
  if(!a.instrumentKey||!a.entryAt||
    !validMoney(a.entryAsk,0.01,1e9)||
    !integer(a.quantity,1,1e9))
    return {valid:false,premiumDebit:0};
  const h=input.phase50.historical;
  const matches=h.executionQuotes.filter(q=>
    q.instrumentKey===a.instrumentKey&&q.observedAt===a.entryAt);
  if(matches.length!==1)return {valid:false,premiumDebit:0};
  const q=matches[0],observed=ms(q.observedAt),available=ms(q.availableAt),
    decision=ms(a.decisionAt);
  if(!Number.isFinite(observed)||!Number.isFinite(available)||
    !Number.isFinite(decision)||available<observed||
    available>decision+h.policy.maxEntryDelayMinutes*60000||
    !validMoney(q.ask,0.01,1e9)||
    !validMoney(q.bid,0.0,1e9)||
    q.ask<=q.bid||
    !integer(q.askQty,1,1e9)||q.askQty<a.quantity||
    Math.abs(q.ask-a.entryAsk)>1e-6)
    return {valid:false,premiumDebit:0};
  const debit=q.ask*a.quantity;
  if(!validMoney(debit,0.01,1e12))
    return {valid:false,premiumDebit:0};
  return {valid:true,premiumDebit:debit};
}
export function auditPhase57RegimeHorizonDebitRisk(
  input:Phase57Input,pins:Phase57IndependentPins
):Phase57Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE57_OFFLINE_REGIME_DEBIT_AUDIT_V1'||
    input.source!=='OFFLINE_OPERATOR_MARKET_DATA_UNVERIFIED'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE57_REGIME_DEBIT_PRESPECIFICATION_V1'||
    !input.phase51||!input.phase51Pins||!validPolicy(input.policy)||
    ![pins.expectedPhase51InputSha256,
      pins.expectedPhase51PinsSha256,
      pins.expectedRiskPolicySha256,
      pins.expectedOriginalOosSessionManifestSha256]
      .every(x=>typeof x==='string'&&SHA.test(x))||
    pins.expectedPhase51InputSha256!==hash(input.phase51)||
    pins.expectedPhase51PinsSha256!==hash(input.phase51Pins)||
    pins.expectedRiskPolicySha256!==hash(input.policy)||
    pins.expectedOriginalOosSessionManifestSha256!==
      input.phase51Pins.expectedOriginalOosManifestSha256||
    !integer(pins.expectedOosSessions,2,100000)||
    pins.expectedFullArmHorizonAttempts!==pins.expectedOosSessions*12)
    return bad('PHASE57_PREDECLARED_RISK_BUDGET_OR_ORIGINAL_SOURCE_PINS_INVALID');
  let previous:Phase51Report;
  try{previous=auditPhase51DeclaredOosSessionCoverage(
    input.phase51,input.phase51Pins);}
  catch{return bad('PHASE51_ORIGINAL_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const src=input.phase51.phase50.historical;
  const partial:Partial<Phase57Report>={
    syntheticDataset:previous.syntheticDataset,
    phase51Status:previous.status,
    oosSessions:previous.declaredOosSessions,
    attemptedArmHorizonDecisions:previous.fullPhase50OosAttemptDenominator
  };
  if(previous.status!=='DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY'||
    previous.declaredOosSessions!==pins.expectedOosSessions||
    previous.fullPhase50OosAttemptDenominator!==
      pins.expectedFullArmHorizonAttempts)
    return bad('ORIGINAL_PHASE51_PHASE50_OOS_SOURCE_OR_DENOMINATOR_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  let cohort:ReturnType<typeof buildAdaptiveEntryFirstCohort>;
  try{cohort=buildAdaptiveEntryFirstCohort(src);}
  catch{return bad('ORIGINAL_ENTRY_FIRST_COHORT_EXCEPTION',
    'INCOMPLETE_EVIDENCE',partial);}
  if(cohort.status!=='ENTRY_COHORT_RECORDED'||
    cohort.attempts.length!==pins.expectedFullArmHorizonAttempts)
    return bad('ORIGINAL_ENTRY_FIRST_12_WAY_OOS_ATTEMPTS_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  const decisionIndex=new Map(src.decisions.map(d=>[d.decisionAt,d]));
  const cells=new Map<string,Phase57RegimeHorizonCell>();
  const armSession=new Map<string,Phase57ArmDecisionRisk>();
  const observed=new Set<string>();
  const regimeDecisionCounts:Partial<Record<AdaptiveRegime,number>>={};
  let missingBind=0,missingSelected=0,entries=0,none=0,budgetBreaches=0;
  const reasons:string[]=[];
  for(const a of cohort.attempts){
    const orig=decisionIndex.get(a.decisionAt);
    if(!orig||orig.sessionDate!==a.sessionDate||
      a.foldIndex<0||a.foldIndex>=src.policy.folds.length||
      !ARMS.includes(a.arm)||!HORIZONS.includes(a.horizon)){
      return bad('UNMATCHED_OR_MALFORMED_ORIGINAL_ENTRY_FIRST_ATTEMPT',
        'INCOMPLETE_EVIDENCE',partial);
    }
    const key=a.foldIndex+'|'+a.decisionAt;
    if(!observed.has(key)){
      observed.add(key);
      if(orig.candles.some(c=>c.isClosed===false||
        !Number.isFinite(ms(c.timestamp))||
        ms(c.timestamp)+15*60000>ms(a.decisionAt)))
        return bad('FUTURE_OR_UNCLOSED_INDEX_CANDLE_IN_REGIME_CONTEXT',
          'INCOMPLETE_EVIDENCE',partial);
      const ctx=analyzeAdaptiveRegime(orig.candles,new Date(ms(a.decisionAt)));
      regimeDecisionCounts[ctx.regime]=(regimeDecisionCounts[ctx.regime]??0)+1;
    }
    const regime=analyzeAdaptiveRegime(orig.candles,new Date(ms(a.decisionAt)))
      .regime;
    if(!ACTIVE.some(x=>x===regime)&&
      !reasons.includes('ORIGINAL_REGIME_NOT_DECISION_TIME_CLASSIFIABLE'))
      reasons.push('ORIGINAL_REGIME_NOT_DECISION_TIME_CLASSIFIABLE');
    const cellKey=regime+'|'+a.arm+'|'+a.horizon;
    let c=cells.get(cellKey);
    if(!c){
      c={regime,arm:a.arm,horizon:a.horizon,
        originalDecisionAttempts:0,entryObservedCount:0,
        originalNoEntryCount:0,missingSelectedOptionL1Count:0,
        totalOriginalPaidAskPremiumINR:0,
        totalHypotheticalFullDebitLossPlusCostsINR:0,
        hypotheticalPremiumDrawdownLossINR:[0,0,0,0],
        perEntryRiskBudgetBreaches:0,
        largestSingleEntryFullDebitLossINR:0,
        alternativeArmsNotIndependentExecutions:true,
        realBrokerFillOrStopVerified:false};
      cells.set(cellKey,c);
    }
    c.originalDecisionAttempts++;
    const groupKey=a.foldIndex+'|'+a.decisionAt+'|'+a.arm;
    let g=armSession.get(groupKey);
    if(!g){
      g={foldIndex:a.foldIndex,sessionDate:a.sessionDate,
        regime,arm:a.arm,horizonAttempts:4,
        horizonEntriesObserved:0,missingOriginalSelectedOptionQuotes:0,
        hypotheticalCombinedFourHorizonFullDebitINR:0,
        maximumPermittedFourHorizonDebitINR:
          input.policy.maximumCombinedFourHorizonDebitPerArmPerOosDecisionINR,
        exceedsPredeclaredCombinedBudget:false,
        multipleHorizonEntriesAreAnAssumedPortfolioNotActualPositions:true};
      armSession.set(groupKey,g);
    }
    if(a.disposition==='MISSING_EXECUTABLE_ENTRY_L1'){
      c.missingSelectedOptionL1Count++;g.missingOriginalSelectedOptionQuotes++;
      g.hypotheticalCombinedFourHorizonFullDebitINR=null;
      g.exceedsPredeclaredCombinedBudget=null;
      missingSelected++;continue;
    }
    if(a.disposition!=='ENTRY_OBSERVED'){
      c.originalNoEntryCount++;none++;continue;
    }
    const bound=sourceQuoteBinding(a,input.phase51);
    if(!bound.valid){
      missingBind++;
      g.missingOriginalSelectedOptionQuotes++;
      g.hypotheticalCombinedFourHorizonFullDebitINR=null;
      g.exceedsPredeclaredCombinedBudget=null;
      c.missingSelectedOptionL1Count++;
      continue;
    }
    const rule=input.policy.horizonRules[a.horizon];
    const worst=bound.premiumDebit+
      rule.assumedNonRecoverableEntryAndExitCostsINR;
    if(!validMoney(worst,0.01,1e12))
      return bad('NONFINITE_ORIGINAL_PREMIUM_DEBIT_EXPOSURE',
        'INCOMPLETE_EVIDENCE',partial);
    c.entryObservedCount++;entries++;g.horizonEntriesObserved++;
    c.totalOriginalPaidAskPremiumINR+=bound.premiumDebit;
    c.totalHypotheticalFullDebitLossPlusCostsINR+=worst;
    c.largestSingleEntryFullDebitLossINR=Math.max(
      c.largestSingleEntryFullDebitLossINR,worst);
    input.policy.premiumDrawdownFractions.forEach((fraction,i)=>{
      c!.hypotheticalPremiumDrawdownLossINR[i]+=
        bound.premiumDebit*fraction+
        rule.assumedNonRecoverableEntryAndExitCostsINR;
    });
    if(worst>rule.maximumSingleEntryDebitPlusFeesINR){
      c.perEntryRiskBudgetBreaches++;budgetBreaches++;
    }
    if(g.hypotheticalCombinedFourHorizonFullDebitINR!==null){
      g.hypotheticalCombinedFourHorizonFullDebitINR+=worst;
      g.exceedsPredeclaredCombinedBudget=
        g.hypotheticalCombinedFourHorizonFullDebitINR>
        g.maximumPermittedFourHorizonDebitINR;
    }
  }
  const armGroups=[...armSession.values()];
  const regimeCount=Object.keys(regimeDecisionCounts)
    .filter(x=>(regimeDecisionCounts[x as AdaptiveRegime]??0)>0).length;
  const groupsBreach=armGroups.filter(x=>
    x.exceedsPredeclaredCombinedBudget===true).length;
  const report:Phase57Report={
    ...empty(),...partial,originalObservedEntries:entries,
    originalUnpricedSelectedOptionEntries:missingSelected,
    originalNonEntryAttempts:none,distinctObservedRegimes:regimeCount,
    regimeDecisionCounts,
    perRegimeHorizonArm:[...cells.values()].map(c=>({
      ...c,
      totalOriginalPaidAskPremiumINR:money(c.totalOriginalPaidAskPremiumINR),
      totalHypotheticalFullDebitLossPlusCostsINR:
        money(c.totalHypotheticalFullDebitLossPlusCostsINR),
      largestSingleEntryFullDebitLossINR:
        money(c.largestSingleEntryFullDebitLossINR),
      hypotheticalPremiumDrawdownLossINR:
        c.hypotheticalPremiumDrawdownLossINR.map(money) as
          [number,number,number,number]
    })),
    perArmSessionPortfolio:armGroups.map(g=>({
      ...g,hypotheticalCombinedFourHorizonFullDebitINR:
        g.hypotheticalCombinedFourHorizonFullDebitINR===null?
        null:money(g.hypotheticalCombinedFourHorizonFullDebitINR)
    })),
    singleEntryDebitBudgetBreaches:budgetBreaches,
    combinedFourHorizonDebitBudgetBreaches:groupsBreach,
    missingOrAmbiguousOriginalQuoteBindings:missingBind
  };
  if(armGroups.length!==pins.expectedOosSessions*ARMS.length||
    entries+missingSelected+none+missingBind!==cohort.attempts.length||
    observed.size!==pins.expectedOosSessions)
    reasons.push('ORIGINAL_FULL_ARM_HORIZON_RISK_DENOMINATOR_MISMATCH');
  if(missingBind||missingSelected)
    reasons.push('ORIGINAL_OPTION_L1_NOT_COMPLETE_FOR_DEBIT_STRESS');
  if(regimeCount===0||
    Object.values(regimeDecisionCounts).some(x=>x===undefined))
    reasons.push('ORIGINAL_DECISION_TIME_REGIMES_UNAVAILABLE');
  if(reasons.length)
    return {...report,status:'INCOMPLETE_EVIDENCE',reasonCodes:reasons};
  if(budgetBreaches||groupsBreach)
    return {...report,status:'DESCRIPTIVE_RISK_BUDGET_ALERT_ONLY',
      reasonCodes:['PREDECLARED_LONG_OPTION_FULL_DEBIT_BUDGET_BREACH']};
  if(observed.size<input.policy.minimumOosSessionsForAnyRegimeComparison||
    regimeCount<input.policy.minimumDistinctObservedRegimesForCrossRegimeClaim)
    return {...report,status:'DESCRIPTIVE_SINGLE_REGIME_RISK_ONLY',
      reasonCodes:['MULTI_REGIME_UNSEEN_OOS_EXPOSURE_NOT_ESTABLISHED']};
  return {...report,status:'DESCRIPTIVE_MULTIREGIME_RISK_ENVELOPE_ONLY'};
}
