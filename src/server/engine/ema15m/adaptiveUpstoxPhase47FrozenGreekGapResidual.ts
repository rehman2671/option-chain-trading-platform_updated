/**
 * Phase47 — OFFLINE, predeclared option-premium gap decomposition sensitivity.
 *
 * Do NOT read this as a causal IV/theta estimate, option valuation, broker fill,
 * authenticated licensed L1, genuine exchange calendar, or live trade signal.
 * Model sensitivities from one frozen PRE-CLOSE Greek vector are compared to
 * POST-OPEN observed OPTION BID change. Residual includes bid/ask, higher-order
 * Greeks, jumps, quote mismatch, IV model error and source defects.
 *
 * No HTTP, Upstox, orders/GTT writes, market polling or live engine routes.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase46LongOptionGapStress,hashPhase46GapEvidence,
  type Phase46GapStressInput,type Phase46GapStressPins,
  type Phase46GapStressPolicy,type Phase46Horizon,
  type Phase46IndexOptionGapPath
} from './adaptiveUpstoxPhase46LongOptionGapRisk.js';

const HORIZONS:Phase46Horizon[]=['1W','2W','4W','8W'];
const SHA=/^[a-f0-9]{64}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const ID=/^[A-Za-z0-9_.:/|-]{4,128}$/;
const millis=(v:unknown):number=>typeof v==='string'&&TIME.test(v)?
  Date.parse(v):NaN;
const valid=(x:unknown,lo:number,hi:number):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
const integer=(x:unknown,lo:number,hi:number):x is number=>
  valid(x,lo,hi)&&Number.isSafeInteger(x);
const round=(x:number)=>Number(x.toFixed(4));
const digest=(x:unknown):string=>createHash('sha256')
  .update(JSON.stringify(x)).digest('hex');
export interface Phase47GreekObservation {
  /** Operator-declared computed/vendor Greeks; NOT exchange authenticated. */
  source:'OPERATOR_ASSERTED_ORIGINAL_GREEK_UNVERIFIED';
  recordId:string;
  /** Source underlying index level: explanatory only, not executable. */
  underlyingLevel:number;
  /** Percentage points (e.g. 18.5 = 18.5%), NOT 0.185. */
  impliedVolatilityPct:number;
  underlyingEventAt:string;
  greekEventAt:string;
  availableAt:string;
}
export interface Phase47PreCloseGreek extends Phase47GreekObservation {
  /** Option-premium points / one underlying-index point, signed for CE/PE. */
  deltaPremiumPerIndexPoint:number;
  /** Option-premium points / underlying-index-point squared. */
  gammaPremiumPerIndexPointSquared:number;
  /** Option-premium points / one IV percentage point. */
  vegaPremiumPerVolatilityPctPoint:number;
  /** OPTION-premium points / elapsed CALENDAR day (not trading day). */
  thetaPremiumPerCalendarDay:number;
}
export interface Phase47GreekGapPath {
  schemaVersion:'ADAPTIVE_PHASE47_GREEK_GAP_PATH_V1';
  horizon:Phase46Horizon;
  instrumentKey:string;
  sourceKind:'SYNTHETIC_ORIGINAL_STYLE_GREEKS'|
    'OPERATOR_CLAIMS_LICENSED_ORIGINAL_GREEKS';
  preClose:Phase47PreCloseGreek;
  postOpen:Phase47GreekObservation;
}
export interface Phase47GreekRiskPolicy {
  schemaVersion:'ADAPTIVE_PHASE47_PREDECLARED_GREEK_GAP_POLICY_V1';
  maximumUnderlyingEventAlignmentSeconds:number;
  maximumGreekAvailabilityLagSeconds:number;
  /** Alert if absolute residual / original entry ASK exceeds this %. */
  maximumUnexplainedPremiumMovePercentOfEntryAsk:number;
  maximumAbsoluteObservedIvMovePercentagePoints:number;
  maximumAbsoluteThetaComponentPercentOfEntryAsk:number;
  /** Alert if the first next-open tick is this near declared expiry. */
  minimumDeclaredTimeToExpiryAtOpenDays:number;
}
export interface Phase47GreekRiskInput {
  schemaVersion:'ADAPTIVE_PHASE47_FOUR_HORIZON_IV_THETA_SOURCE_V1';
  source:'OFFLINE_OPERATOR_GREEK_ARCHIVE_UNVERIFIED';
  phase46Input:Phase46GapStressInput;
  phase46Pins:Phase46GapStressPins;
  phase46Policy:Phase46GapStressPolicy;
  greekPaths:Phase47GreekGapPath[];
}
export interface Phase47IndependentPins {
  schemaVersion:'INDEPENDENT_PHASE47_GREEK_AND_PHASE46_PINS_V1';
  expectedPhase46InputSha256:string;
  expectedPhase46PinsSha256:string;
  expectedPhase46PolicySha256:string;
  expectedGreekPathSha256:Record<Phase46Horizon,string>;
  expectedGreekPolicySha256:string;
  /** Recorded before review. A pin does not prove the issuer of the data. */
  expectedDatasetLabel:Phase46GapStressInput['datasetLabel'];
}
export interface Phase47GreekResidualCell {
  horizon:Phase46Horizon;
  observedPreCloseOptionBid:number;
  observedPostOpenOptionBid:number;
  observedOptionBidChange:number;
  preCloseUnderlyingIndexLevel:number;
  postOpenUnderlyingIndexLevel:number;
  underlyingIndexPointChange:number;
  preCloseIvPercent:number;
  postOpenIvPercent:number;
  ivChangePercentagePoints:number;
  elapsedCalendarDays:number;
  frozenDeltaComponentPremiumPoints:number;
  frozenGammaComponentPremiumPoints:number;
  frozenVegaComponentPremiumPoints:number;
  frozenThetaComponentPremiumPoints:number;
  firstOrderAndGammaModelChangePremiumPoints:number;
  /** Can be negative; this is NOT a quoted/broker-executable premium. */
  modelIndicatedNextBidPremiumPoints:number;
  unexplainedObservedBidResidualPremiumPoints:number;
  unexplainedResidualPercentOfOriginalEntryAsk:number;
  daysToDeclaredExpiryAtNextOpen:number;
  residualRiskAlert:boolean;
  ivShockRiskAlert:boolean;
  thetaMagnitudeRiskAlert:boolean;
  declaredExpiryProximityAlert:boolean;
  modelMayProduceNegativePremium:boolean;
  observedPremiumAttributionCausallyProven:false;
  observedGreeksIndependentSourceVerified:false;
  derivedPriceIsExecutableQuote:false;
  preCloseGreeksWereUsedForTrading:false;
}
export interface Phase47GreekRiskReport {
  mode:'OFFLINE_FROZEN_GREEKS_OBSERVED_BID_GAP_RESIDUAL';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_GREEK_RESIDUAL_ONLY'|'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY';
  reasonCodes:string[];
  horizonsReviewed:number;
  alertCells:number;
  datasetLabel:Phase46GapStressInput['datasetLabel']|null;
  cells:Phase47GreekResidualCell[];
  originalLicensedOptionL1IndependentlyVerified:false;
  vendorGreekModelIndependentlyVerified:false;
  sourceIvDataAuthenticityVerified:false;
  chronologicalOosComparisonCompleted:false;
  marketCalendarAndContractExpiryVerified:false;
  empiricalIvThetaCausalityEstablished:false;
  brokerNativeStopsVerified:false;
  brokerAuthenticated:false;
  protectedOvernight:false;
  productionSafe:false;
  profitabilityProven:false;
  executionAuthorized:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'FROZEN_PRE_CLOSE_GREEKS_ARE_AN_APPROXIMATION_NOT_EXACT_CAUSAL_DECOMPOSITION',
  'MODEL_RESIDUAL_INCLUDES_SPREAD_LIQUIDITY_IV_INVERSION_JUMPS_AND_OTHER_GREEKS',
  'VEGA_INPUT_UNITS_ARE_PREMIUM_POINTS_PER_ONE_IV_PERCENTAGE_POINT',
  'THETA_IS_PRE_CLOSE_PREMIUM_POINTS_PER_CALENDAR_DAY_NOT_REALIZED_DECAY',
  'MODEL_MAY_INDICATE_NEGATIVE_PREMIUM_AND_IS_NOT_AN_EXECUTABLE_BID',
  'SOURCE_GREEKS_AND_OPTION_L1_CAN_BE_FABRICATED_BY_SAME_OPERATOR',
  'LICENSE_CLAIM_AND_LOCAL_SHA256_PINS_DO_NOT_AUTHENTICATE_VENDOR_OR_RIGHTS',
  'EXPIRY_BUCKET_LABELS_AND_EXCHANGE_CONTRACT_MASTER_NOT_AUTHENTICATED',
  'ORIGINAL_BID_CLOSE_TO_OPEN_IS_NOT_BROKER_STOP_ORIGINAL_EXECUTION',
  'NO_OUT_OF_SAMPLE_MARKET_EFFECT_PROVEN_BY_FOUR_OPERATOR_SELECTED_PATHS',
  'NO_LIVE_NRML_GTT_ORDERS_OR_POSITIONAL_15_15_FORCED_SQUAREOFF'
];
const empty=():Phase47GreekRiskReport=>({
  mode:'OFFLINE_FROZEN_GREEKS_OBSERVED_BID_GAP_RESIDUAL',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  horizonsReviewed:0,alertCells:0,datasetLabel:null,cells:[],
  originalLicensedOptionL1IndependentlyVerified:false,
  vendorGreekModelIndependentlyVerified:false,
  sourceIvDataAuthenticityVerified:false,
  chronologicalOosComparisonCompleted:false,
  marketCalendarAndContractExpiryVerified:false,
  empiricalIvThetaCausalityEstablished:false,
  brokerNativeStopsVerified:false,brokerAuthenticated:false,
  protectedOvernight:false,productionSafe:false,
  profitabilityProven:false,executionAuthorized:false,
  nativeOrderInstruction:null,warnings:WARN
});
const deny=(code:string,
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'='INVALID_EVIDENCE'):
  Phase47GreekRiskReport=>({...empty(),status,reasonCodes:[code]});
export function hashPhase47GreekEvidence(v:unknown):string{return digest(v);}
function validPolicy(p:Phase47GreekRiskPolicy):boolean{
  return !!p&&p.schemaVersion===
    'ADAPTIVE_PHASE47_PREDECLARED_GREEK_GAP_POLICY_V1'&&
    integer(p.maximumUnderlyingEventAlignmentSeconds,0,120)&&
    integer(p.maximumGreekAvailabilityLagSeconds,0,300)&&
    valid(p.maximumUnexplainedPremiumMovePercentOfEntryAsk,0,1000)&&
    valid(p.maximumAbsoluteObservedIvMovePercentagePoints,0,200)&&
    valid(p.maximumAbsoluteThetaComponentPercentOfEntryAsk,0,1000)&&
    valid(p.minimumDeclaredTimeToExpiryAtOpenDays,0,80);
}
function observed(s:Phase47GreekObservation,tickAt:number,
  tickAvailable:number,p:Phase47GreekRiskPolicy):boolean{
  const underlying=millis(s?.underlyingEventAt),
    greek=millis(s?.greekEventAt),available=millis(s?.availableAt);
  return !!s&&s.source==='OPERATOR_ASSERTED_ORIGINAL_GREEK_UNVERIFIED'&&
    typeof s.recordId==='string'&&ID.test(s.recordId)&&
    valid(s.underlyingLevel,100,1000000)&&
    valid(s.impliedVolatilityPct,.01,500)&&
    [underlying,greek,available,tickAt,tickAvailable].every(Number.isFinite)&&
    underlying<=tickAt&&greek<=tickAt&&
    tickAt-underlying<=p.maximumUnderlyingEventAlignmentSeconds*1000&&
    tickAt-greek<=p.maximumUnderlyingEventAlignmentSeconds*1000&&
    available>=Math.max(underlying,greek)&&
    available-Math.max(underlying,greek)<=
      p.maximumGreekAvailabilityLagSeconds*1000&&
    available<=tickAvailable;
}
function analyze(
  path:Phase47GreekGapPath,original:Phase46IndexOptionGapPath,
  p:Phase47GreekRiskPolicy
):{ok:true;cell:Phase47GreekResidualCell}|{ok:false;reason:string}{
  const pre=path.preClose,post=path.postOpen;
  if(!path||path.schemaVersion!=='ADAPTIVE_PHASE47_GREEK_GAP_PATH_V1'||
    path.horizon!==original.horizon||
    path.instrumentKey!==original.instrumentKey||
    !['SYNTHETIC_ORIGINAL_STYLE_GREEKS',
      'OPERATOR_CLAIMS_LICENSED_ORIGINAL_GREEKS'].includes(path.sourceKind)||
    !observed(pre,millis(original.preCloseQuote.observedAt),
      millis(original.preCloseQuote.availableAt),p)||
    !observed(post,millis(original.nextOpenQuote.observedAt),
      millis(original.nextOpenQuote.availableAt),p)||
    pre.recordId===post.recordId)
    return {ok:false,reason:'GREEK_SOURCE_TIME_AVAILABILITY_OR_CONTRACT_MISMATCH'};
  if(!valid(pre.deltaPremiumPerIndexPoint,-1,1)||
    !valid(pre.gammaPremiumPerIndexPointSquared,0,3)||
    !valid(pre.vegaPremiumPerVolatilityPctPoint,0,10000)||
    !valid(pre.thetaPremiumPerCalendarDay,-10000,10000)||
    (original.optionType==='CE'&&pre.deltaPremiumPerIndexPoint<0)||
    (original.optionType==='PE'&&pre.deltaPremiumPerIndexPoint>0))
    return {ok:false,reason:'INVALID_SIGNED_DELTA_GAMMA_VEGA_OR_THETA_UNITS'};
  const days=(millis(original.nextOpenQuote.observedAt)-
    millis(original.preCloseQuote.observedAt))/86400000,
    expiry=(millis(original.expiryAt)-
      millis(original.nextOpenQuote.observedAt))/86400000;
  if(!(days>0&&days<20&&expiry>0&&expiry<80))
    return {ok:false,reason:'INVALID_DECLARED_EXPIRY_OR_GAP_CALENDAR_TIME'};
  const dS=post.underlyingLevel-pre.underlyingLevel,
    dIV=post.impliedVolatilityPct-pre.impliedVolatilityPct;
  const delta=pre.deltaPremiumPerIndexPoint*dS,
    gamma=.5*pre.gammaPremiumPerIndexPointSquared*dS*dS,
    vega=pre.vegaPremiumPerVolatilityPctPoint*dIV,
    theta=pre.thetaPremiumPerCalendarDay*days;
  const indicated=delta+gamma+vega+theta;
  const observedMove=original.nextOpenQuote.bid-original.preCloseQuote.bid;
  const residual=observedMove-indicated;
  const relative=100*Math.abs(residual)/original.entryQuote.ask;
  if(![delta,gamma,vega,theta,indicated,residual,relative]
    .every(x=>Number.isFinite(x)&&Math.abs(x)<=1e10))
    return {ok:false,reason:'UNBOUNDED_OR_UNSTABLE_GREEK_SENSITIVITY'};
  const modelBid=original.preCloseQuote.bid+indicated;
  const cell:Phase47GreekResidualCell={
    horizon:original.horizon,
    observedPreCloseOptionBid:original.preCloseQuote.bid,
    observedPostOpenOptionBid:original.nextOpenQuote.bid,
    observedOptionBidChange:round(observedMove),
    preCloseUnderlyingIndexLevel:pre.underlyingLevel,
    postOpenUnderlyingIndexLevel:post.underlyingLevel,
    underlyingIndexPointChange:round(dS),
    preCloseIvPercent:pre.impliedVolatilityPct,
    postOpenIvPercent:post.impliedVolatilityPct,
    ivChangePercentagePoints:round(dIV),
    elapsedCalendarDays:round(days),
    frozenDeltaComponentPremiumPoints:round(delta),
    frozenGammaComponentPremiumPoints:round(gamma),
    frozenVegaComponentPremiumPoints:round(vega),
    frozenThetaComponentPremiumPoints:round(theta),
    firstOrderAndGammaModelChangePremiumPoints:round(indicated),
    modelIndicatedNextBidPremiumPoints:round(modelBid),
    unexplainedObservedBidResidualPremiumPoints:round(residual),
    unexplainedResidualPercentOfOriginalEntryAsk:round(relative),
    daysToDeclaredExpiryAtNextOpen:round(expiry),
    residualRiskAlert:relative>
      p.maximumUnexplainedPremiumMovePercentOfEntryAsk,
    ivShockRiskAlert:Math.abs(dIV)>
      p.maximumAbsoluteObservedIvMovePercentagePoints,
    thetaMagnitudeRiskAlert:Math.abs(theta)/original.entryQuote.ask*100>
      p.maximumAbsoluteThetaComponentPercentOfEntryAsk,
    declaredExpiryProximityAlert:expiry<
      p.minimumDeclaredTimeToExpiryAtOpenDays,
    modelMayProduceNegativePremium:modelBid<0,
    observedPremiumAttributionCausallyProven:false,
    observedGreeksIndependentSourceVerified:false,
    derivedPriceIsExecutableQuote:false,
    preCloseGreeksWereUsedForTrading:false
  };
  return {ok:true,cell};
}
/**
 * Descriptive math on exactly 4 externally pinned operator-selected L1 paths.
 * Original option prices are never modified by the Greek model.
 * No comparison of market-regime/ranker profitability is inferred.
 */
export function auditPhase47FrozenGreekGapResidual(
  archive:Phase47GreekRiskInput,pins:Phase47IndependentPins,
  policy:Phase47GreekRiskPolicy
):Phase47GreekRiskReport{
  if(!archive||!pins||archive.schemaVersion!==
      'ADAPTIVE_PHASE47_FOUR_HORIZON_IV_THETA_SOURCE_V1'||
    archive.source!=='OFFLINE_OPERATOR_GREEK_ARCHIVE_UNVERIFIED'||
    pins.schemaVersion!=='INDEPENDENT_PHASE47_GREEK_AND_PHASE46_PINS_V1'||
    !validPolicy(policy)||
    !SHA.test(pins.expectedPhase46InputSha256)||
    !SHA.test(pins.expectedPhase46PinsSha256)||
    !SHA.test(pins.expectedPhase46PolicySha256)||
    !SHA.test(pins.expectedGreekPolicySha256)||
    pins.expectedGreekPolicySha256!==digest(policy)||
    pins.expectedPhase46InputSha256!==
      hashPhase46GapEvidence(archive.phase46Input)||
    pins.expectedPhase46PinsSha256!==
      hashPhase46GapEvidence(archive.phase46Pins)||
    pins.expectedPhase46PolicySha256!==
      hashPhase46GapEvidence(archive.phase46Policy)||
    pins.expectedDatasetLabel!==archive.phase46Input?.datasetLabel||
    !archive.phase46Pins||!archive.phase46Policy||
    !Array.isArray(archive.greekPaths)||
    archive.greekPaths.length!==4||
    !pins.expectedGreekPathSha256||
    Object.keys(pins.expectedGreekPathSha256).length!==4)
    return deny('PHASE46_SOURCE_OR_INDEPENDENT_PREDECLARED_GREEK_PINS_INVALID');
  const source=auditPhase46LongOptionGapStress(
    archive.phase46Input,archive.phase46Pins,archive.phase46Policy);
  if(!['DESCRIPTIVE_BOUNDS_ONLY','DESCRIPTIVE_RISK_ALERT_ONLY']
    .includes(source.status)||
    source.originalL1MarketDataIndependentlyAuthenticated!==false||
    source.executionAuthorized!==false)
    return deny('PHASE46_ORIGINAL_OPTION_GAP_REAUDIT_FAILED',
      'INCOMPLETE_EVIDENCE');
  const cells:Phase47GreekResidualCell[]=[];
  const originalGreekRecordIds=new Set<string>();
  for(let i=0;i<4;i++){
    const horizon=HORIZONS[i],factor=archive.greekPaths[i];
    const original=archive.phase46Input.paths[i];
    if(!factor||factor.horizon!==horizon||
      (archive.phase46Input.datasetLabel==='SYNTHETIC_TEST'&&
        factor.sourceKind!=='SYNTHETIC_ORIGINAL_STYLE_GREEKS')||
      (archive.phase46Input.datasetLabel===
        'OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED'&&
        factor.sourceKind!=='OPERATOR_CLAIMS_LICENSED_ORIGINAL_GREEKS')||
      typeof pins.expectedGreekPathSha256[horizon]!=='string'||
      !SHA.test(pins.expectedGreekPathSha256[horizon])||
      digest(factor)!==pins.expectedGreekPathSha256[horizon])
      return deny('DUPLICATE_REORDERED_OR_REPINNED_GREEK_SOURCE_PATH');
    if(originalGreekRecordIds.has(factor.preClose?.recordId)||
      originalGreekRecordIds.has(factor.postOpen?.recordId))
      return deny('DUPLICATE_OR_REUSED_CROSS_CONTRACT_GREEK_RECORD');
    originalGreekRecordIds.add(factor.preClose?.recordId);
    originalGreekRecordIds.add(factor.postOpen?.recordId);
    const a=analyze(factor,original,policy);
    if(a.ok===false)return deny(a.reason,'INCOMPLETE_EVIDENCE');
    cells.push(a.cell);
  }
  const alerts=cells.filter(c=>c.residualRiskAlert||c.ivShockRiskAlert||
    c.thetaMagnitudeRiskAlert||c.declaredExpiryProximityAlert||
    c.modelMayProduceNegativePremium).length;
  return {...empty(),status:alerts>0?'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY':
    'DESCRIPTIVE_GREEK_RESIDUAL_ONLY',
    datasetLabel:archive.phase46Input.datasetLabel,
    horizonsReviewed:4,alertCells:alerts,cells};
}
