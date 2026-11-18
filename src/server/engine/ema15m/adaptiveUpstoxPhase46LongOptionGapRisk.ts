/**
 * Adaptive Swing v2 Phase46 — OFFLINE long, cash-settled index-option
 * overnight gap / GTT failure / zero-recovery downside sensitivity.
 *
 * This is NOT a prediction, backtest of original licensed option L1,
 * guaranteed stop fill, executable order, independent broker ACK, or
 * production risk authorization. No broker/network/GTT/orders anywhere.
 */
import {createHash} from 'node:crypto';

const HORIZONS=['1W','2W','4W','8W'] as const;
export type Phase46Horizon=typeof HORIZONS[number];
const SHA=/^[a-f0-9]{64}$/;
const TS=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const ID=/^[A-Za-z0-9_.|:/-]{1,150}$/;
const time=(s:unknown):number=>typeof s==='string'&&TS.test(s)?
  Date.parse(s):NaN;
const number=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const int=(x:unknown,min:number,max:number):x is number=>
  number(x,min,max)&&Number.isSafeInteger(x);
const h=(value:unknown):string=>createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const round=(x:number)=>Number(x.toFixed(2));

export interface Phase46OriginalL1Snapshot {
  instrumentKey:string;
  observedAt:string;
  availableAt:string;
  bid:number;ask:number;
  displayedBidQuantity:number;
  displayedAskQuantity:number;
}
export interface Phase46IndexOptionGapPath {
  horizon:Phase46Horizon;
  source:'OPERATOR_SUPPLIED_ORIGINAL_L1_UNVERIFIED';
  contractType:'CASH_SETTLED_INDEX_OPTION_DECLARED_UNVERIFIED';
  instrumentKey:string;
  optionType:'CE'|'PE';
  expiryAt:string;
  lotSize:number;
  quantity:number;
  entryDecisionAt:string;
  preCloseAt:string;
  nextSessionOpenAt:string;
  /** Original entry quote must already have been available at decision. */
  entryQuote:Phase46OriginalL1Snapshot;
  preCloseQuote:Phase46OriginalL1Snapshot;
  /** First archived post-open quote; may be 0-bid, no executable bid. */
  nextOpenQuote:Phase46OriginalL1Snapshot;
  /** Hypothetical trigger only, NOT actual GTT installation. */
  declaredStopTriggerPremium:number;
}
export interface Phase46GapHorizonPolicy {
  /** Extra haircut for *hypothetical* displayed-depth liquidation. */
  postOpenBidHaircutBps:number;
  /** Whole position can go to zero and lose the premium debit. */
  maximumPermittedFullDebitLossINR:number;
  maximumPermittedAdverseBidGapPercent:number;
  minimumPostOpenDisplayedBidLots:number;
  /** Operator-predeclared all-in entry fees, not verified actual charges. */
  hypotheticalEntryFeesINR:number;
  /** Operator-predeclared fees IF a hypothetical exit fill happened. */
  hypotheticalExitFeesINR:number;
}
export interface Phase46GapStressPolicy {
  schemaVersion:'ADAPTIVE_V2_PHASE46_LONG_INDEX_OPTION_GAP_STRESS_V1';
  maxOriginalEventToAvailabilitySeconds:number;
  maxPostOpenFirstQuoteLagMinutes:number;
  /** This is a predeclared LOSS budget, not a stop-fill promise. */
  horizonRules:Record<Phase46Horizon,Phase46GapHorizonPolicy>;
}
export interface Phase46GapStressInput {
  schemaVersion:'ADAPTIVE_V2_PHASE46_FOUR_HORIZON_GAP_EVIDENCE_V1';
  source:'OFFLINE_UNAUTHENTICATED_ARCHIVE';
  datasetLabel:'SYNTHETIC_TEST'|'OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED';
  paths:Phase46IndexOptionGapPath[];
}
export interface Phase46GapStressPins {
  schemaVersion:'INDEPENDENT_PHASE46_GAP_PATH_AND_POLICY_PINS_V1';
  expectedDatasetLabel:Phase46GapStressInput['datasetLabel'];
  expectedInstrumentKeys:Record<Phase46Horizon,string>;
  expectedPathSha256:Record<Phase46Horizon,string>;
  expectedPolicySha256:string;
}
export interface Phase46GapCell {
  horizon:Phase46Horizon;
  /** PRICE-sensitive observations, not transaction or broker fills. */
  originalEntryAskPremium:number;
  originalPreCloseBidPremium:number;
  originalPostOpenBidPremium:number;
  declaredStopTriggerPremium:number;
  bidGapPercent:number|null;
  nextOpenSpreadBps:number|null;
  longQuantity:number;
  entryPremiumDebitINR:number;
  assumedEntryFeesINR:number;
  assumedExitFeesINR:number;
  /** No fill and zero eventual recovery, including entry costs. */
  fullDebitLossWithNoRecoveryINR:number;
  /** Unrealistically perfect trigger fill for contrast ONLY. */
  idealStopTriggerLossINR:number;
  /** Loss possible beyond ideal stop if no protective fill occurs. */
  extraLossVersusIdealStopINR:number;
  /** One level of DISPLAYED bid quantity, not executable volume. */
  displayedTopBidQuantity:number;
  hypotheticalPostGapExitQuantity:number;
  hypotheticalUnfilledQuantity:number;
  /** Hypothetical queue and haircut; NOT historical executed trade. */
  hypotheticalHaircutExitBid:number|null;
  hypotheticalDisplayedDepthProceedsINR:number|null;
  hypotheticalRemainingToZeroLossINR:number|null;
  fullDebitLossBudgetExceeded:boolean;
  adverseGapBudgetExceeded:boolean;
  displayedDepthBelowPolicy:boolean;
  zeroBidOrNoDisplayedDepth:boolean;
  stopWouldHaveProtectedOvernight:false;
  brokerFillInferred:false;
  downsideCanBeLimitedToStopPrice:false;
}
export interface Phase46GapStressReport {
  mode:'OFFLINE_LONG_OPTION_PREMIUM_GAP_AND_NO_FILL_DOWNSIDE';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_RISK_ALERT_ONLY'|'DESCRIPTIVE_BOUNDS_ONLY';
  reasonCodes:string[];
  datasetLabel:Phase46GapStressInput['datasetLabel']|null;
  horizonsReviewed:number;
  predeclaredGapOrCashLossAlerts:number;
  cells:Phase46GapCell[];
  originalL1MarketDataIndependentlyAuthenticated:false;
  officialExchangeContractCashSettlementVerified:false;
  officialExpiryCalendarVerified:false;
  marketDepthGuaranteesBrokerExecution:false;
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  brokerStopInstalled:false;
  protectedOvernight:false;
  overnightGapFillGuaranteed:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const warnings=[
  'ONLY_LONG_CASH_SETTLED_INDEX_OPTIONS_AS_OPERATOR_DECLARED',
  'CASH_SETTLEMENT_AND_EXPIRY_NOT_INDEPENDENTLY_AUTHENTICATED',
  'OPTION_BID_PREMIUM_NOT_NIFTY_OR_BANKNIFTY_UNDERLYING_POINTS',
  'DEBIT_LOSS_IS_A_DOWNSIDE_STRESS_NOT_A_PREDICTED_PROBABILITY',
  'COSTS_ARE_OPERATOR_PREDECLARED_ASSUMPTIONS_NOT_ACTUAL_BROKER_FEES',
  'STOP_TRIGGER_PRICE_IS_NOT_EXCHANGE_ACK_OR_EXECUTABLE_FILL_PRICE',
  'GTT_TRIGGER_MAY_GENERATE_AN_ORDER_LATE_OR_GET_REJECTED',
  'DISPLAYED_TOP_OF_BOOK_DEPTH_AND_BID_DO_NOT_GUARANTEE_ANY_EXECUTION',
  'WORST_CASE_ZERO_RECOVERY_ALWAYS_APPLIES_TO_FULL_LONG_OPTION_DEBIT',
  'ORIGINAL_L1_SOURCE_AND_ITS_TIMESTAMPS_CAN_BE_OPERATOR_FABRICATED',
  'DO_NOT_TREAT_EOD_BHAVCOPY_LTP_AS_INTRADAY_BID_ASK_OR_DEPTH',
  'FOUR_BUCKETS_ARE_OPERATOR_RESEARCH_LABELS_NOT_VERIFIED_LIVE_EXPIRIES',
  'NO_LIVE_NRML_GTT_ORDER_OR_POSITIONAL_15_15_AUTO_SQUAREOFF'
];
const base=():Phase46GapStressReport=>({
  mode:'OFFLINE_LONG_OPTION_PREMIUM_GAP_AND_NO_FILL_DOWNSIDE',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  datasetLabel:null,horizonsReviewed:0,
  predeclaredGapOrCashLossAlerts:0,cells:[],
  originalL1MarketDataIndependentlyAuthenticated:false,
  officialExchangeContractCashSettlementVerified:false,
  officialExpiryCalendarVerified:false,
  marketDepthGuaranteesBrokerExecution:false,
  executionAuthorized:false,productionSafe:false,
  profitabilityProven:false,brokerStopInstalled:false,
  protectedOvernight:false,overnightGapFillGuaranteed:false,
  nativeOrderInstruction:null,warnings
});
const failed=(status:Phase46GapStressReport['status'],code:string,
  cells:Phase46GapCell[]=[]):Phase46GapStressReport=>({
  ...base(),status,reasonCodes:[code],cells,
  horizonsReviewed:cells.length,datasetLabel:null
});
/** Digest of the exact original operator-supplied JSON serialization.
 * A matching pin is local integrity evidence, NOT NSE/vendor authenticity.
 */
export function hashPhase46GapEvidence(value:unknown):string{return h(value);}
function validPolicy(p:Phase46GapStressPolicy):boolean{
  if(!p||p.schemaVersion!==
      'ADAPTIVE_V2_PHASE46_LONG_INDEX_OPTION_GAP_STRESS_V1'||
    !int(p.maxOriginalEventToAvailabilitySeconds,0,300)||
    !int(p.maxPostOpenFirstQuoteLagMinutes,1,60)||
    !p.horizonRules||
    Object.keys(p.horizonRules).length!==4)return false;
  return HORIZONS.every(h=>{
    const rule=p.horizonRules[h];
    return !!rule&&int(rule.postOpenBidHaircutBps,0,9000)&&
      number(rule.maximumPermittedFullDebitLossINR,0,1e9)&&
      number(rule.maximumPermittedAdverseBidGapPercent,0,100)&&
      int(rule.minimumPostOpenDisplayedBidLots,1,100)&&
      number(rule.hypotheticalEntryFeesINR,0,100000)&&
      number(rule.hypotheticalExitFeesINR,0,100000);
  });
}
function validQuote(q:Phase46OriginalL1Snapshot,
  instrument:string,lotSize:number,p:Phase46GapStressPolicy):boolean{
  const when=time(q?.observedAt),available=time(q?.availableAt);
  return !!q&&q.instrumentKey===instrument&&
    Number.isFinite(when)&&Number.isFinite(available)&&
    available>=when&&
    available-when<=p.maxOriginalEventToAvailabilitySeconds*1000&&
    number(q.bid,0,1e8)&&number(q.ask,.01,1e8)&&
    q.bid<=q.ask&&
    int(q.displayedBidQuantity,0,100000000)&&
    int(q.displayedAskQuantity,0,100000000)&&
    q.displayedBidQuantity%lotSize===0&&
    q.displayedAskQuantity%lotSize===0&&
    (q.bid!==0||q.displayedBidQuantity===0);
}
function one(
  input:Phase46IndexOptionGapPath,
  p:Phase46GapStressPolicy
):{ok:true;cell:Phase46GapCell}|{ok:false;code:string}{
  if(!input||input.source!=='OPERATOR_SUPPLIED_ORIGINAL_L1_UNVERIFIED'||
    input.contractType!=='CASH_SETTLED_INDEX_OPTION_DECLARED_UNVERIFIED'||
    !ID.test(input.instrumentKey)||!['CE','PE'].includes(input.optionType)||
    !int(input.lotSize,1,100000)||
    !int(input.quantity,1,1000000)||
    input.quantity%input.lotSize!==0||
    !number(input.declaredStopTriggerPremium,.01,1e8))
    return {ok:false,code:'INVALID_OR_UNSUPPORTED_INDEX_LONG_POSITION'};
  const entry=time(input.entryDecisionAt),
    pre=time(input.preCloseAt),open=time(input.nextSessionOpenAt),
    expiry=time(input.expiryAt);
  if(![entry,pre,open,expiry].every(Number.isFinite)||
    !(entry<=pre&&pre<open&&open<expiry)||
    expiry-entry>80*86400000||
    expiry-entry<86400000)
    return {ok:false,code:'INVALID_DECLARED_SESSION_OR_EXPIRY_TIME_SEQUENCE'};
  // Descriptive horizon bins, not validated exchange listing calendars.
  const remaining=(expiry-entry)/86400000;
  const bins:{[K in Phase46Horizon]:[number,number]}={
    '1W':[1,8],'2W':[8,18],'4W':[18,36],'8W':[36,80]
  };
  const [min,max]=bins[input.horizon];
  if(!(remaining>=min&&remaining<=max))
    return {ok:false,code:'HORIZON_LABEL_NOT_MATCHING_DECLARED_EXPIRY_WINDOW'};
  if(!validQuote(input.entryQuote,input.instrumentKey,input.lotSize,p)||
    !validQuote(input.preCloseQuote,input.instrumentKey,input.lotSize,p)||
    !validQuote(input.nextOpenQuote,input.instrumentKey,input.lotSize,p))
    return {ok:false,code:'ORIGINAL_OPTION_BID_ASK_DEPTH_OR_EVENT_CLOCK_INVALID'};
  const entryQuoteAt=time(input.entryQuote.observedAt),
    entryAvailable=time(input.entryQuote.availableAt),
    preQuoteAt=time(input.preCloseQuote.observedAt),
    preAvailable=time(input.preCloseQuote.availableAt),
    postQuoteAt=time(input.nextOpenQuote.observedAt),
    postAvailable=time(input.nextOpenQuote.availableAt);
  if(entryQuoteAt>entry||entryAvailable>entry||
    preQuoteAt<entry||preQuoteAt>pre||preAvailable>pre||
    postQuoteAt<open||
    postQuoteAt-open>p.maxPostOpenFirstQuoteLagMinutes*60000||
    postAvailable>expiry||
    postQuoteAt<=preQuoteAt)
    return {ok:false,code:'ORIGINAL_QUOTES_OUTSIDE_PREDECLARED_AVAILABLE_WINDOWS'};
  if(input.declaredStopTriggerPremium>=input.entryQuote.ask)
    return {ok:false,code:'DECLARED_LONG_OPTION_STOP_NOT_BELOW_ENTRY_ASK'};
  const bidPre=input.preCloseQuote.bid,bidPost=input.nextOpenQuote.bid,
    askPost=input.nextOpenQuote.ask,quantity=input.quantity;
  const gap=bidPre>0?round((bidPost/bidPre-1)*100):null;
  const spread=askPost+bidPost>0?
    round(20000*(askPost-bidPost)/(askPost+bidPost)):null;
  const rule=p.horizonRules[input.horizon];
  const lotCount=Math.floor(input.nextOpenQuote.displayedBidQuantity/
    input.lotSize);
  const exitLots=Math.min(Math.floor(quantity/input.lotSize),lotCount);
  const displayedExitQty=exitLots*input.lotSize;
  const hypotheticalBid=bidPost>0&&displayedExitQty>0?
    round(bidPost*(1-rule.postOpenBidHaircutBps/10000)):null;
  const proceeds=hypotheticalBid!==null?
    round(hypotheticalBid*displayedExitQty-
      rule.hypotheticalExitFeesINR):null;
  const debit=round(input.entryQuote.ask*quantity);
  const fullLoss=round(debit+rule.hypotheticalEntryFeesINR);
  const idealStop=round((input.entryQuote.ask-
    input.declaredStopTriggerPremium)*quantity+
    rule.hypotheticalEntryFeesINR+rule.hypotheticalExitFeesINR);
  const cell:Phase46GapCell={
    horizon:input.horizon,originalEntryAskPremium:input.entryQuote.ask,
    originalPreCloseBidPremium:bidPre,
    originalPostOpenBidPremium:bidPost,
    declaredStopTriggerPremium:input.declaredStopTriggerPremium,
    bidGapPercent:gap,nextOpenSpreadBps:spread,
    longQuantity:quantity,entryPremiumDebitINR:debit,
    assumedEntryFeesINR:rule.hypotheticalEntryFeesINR,
    assumedExitFeesINR:rule.hypotheticalExitFeesINR,
    fullDebitLossWithNoRecoveryINR:fullLoss,
    idealStopTriggerLossINR:idealStop,
    extraLossVersusIdealStopINR:round(fullLoss-idealStop),
    displayedTopBidQuantity:input.nextOpenQuote.displayedBidQuantity,
    hypotheticalPostGapExitQuantity:displayedExitQty,
    hypotheticalUnfilledQuantity:quantity-displayedExitQty,
    hypotheticalHaircutExitBid:hypotheticalBid,
    hypotheticalDisplayedDepthProceedsINR:proceeds,
    hypotheticalRemainingToZeroLossINR:proceeds===null?null:
      round(debit-proceeds),
    fullDebitLossBudgetExceeded:fullLoss>
      rule.maximumPermittedFullDebitLossINR,
    adverseGapBudgetExceeded:gap===null||gap<
      -rule.maximumPermittedAdverseBidGapPercent,
    displayedDepthBelowPolicy:lotCount<
      rule.minimumPostOpenDisplayedBidLots,
    zeroBidOrNoDisplayedDepth:bidPost===0||
      input.nextOpenQuote.displayedBidQuantity===0,
    stopWouldHaveProtectedOvernight:false,
    brokerFillInferred:false,
    downsideCanBeLimitedToStopPrice:false
  };
  return {ok:true,cell};
}
export function auditPhase46LongOptionGapStress(
  input:Phase46GapStressInput,pins:Phase46GapStressPins,
  policy:Phase46GapStressPolicy
):Phase46GapStressReport{
  if(!input||!pins||
    input.schemaVersion!==
      'ADAPTIVE_V2_PHASE46_FOUR_HORIZON_GAP_EVIDENCE_V1'||
    input.source!=='OFFLINE_UNAUTHENTICATED_ARCHIVE'||
    !['SYNTHETIC_TEST','OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED']
      .includes(input.datasetLabel)||
    pins.schemaVersion!=='INDEPENDENT_PHASE46_GAP_PATH_AND_POLICY_PINS_V1'||
    pins.expectedDatasetLabel!==input.datasetLabel||
    !validPolicy(policy)||
    !SHA.test(pins.expectedPolicySha256)||
    h(policy)!==pins.expectedPolicySha256||
    !Array.isArray(input.paths)||input.paths.length!==4||
    !pins.expectedInstrumentKeys||!pins.expectedPathSha256||
    Object.keys(pins.expectedPathSha256).length!==4||
    Object.keys(pins.expectedInstrumentKeys).length!==4)
    return failed('INVALID_EVIDENCE','MISSING_FOUR_HORIZON_SOURCE_OR_PREDECLARED_POLICY');
  const cells:Phase46GapCell[]=[];
  for(let i=0;i<4;i++){
    const key=HORIZONS[i],path=input.paths[i];
    if(!path||path.horizon!==key||
      !ID.test(pins.expectedInstrumentKeys[key])||
      path.instrumentKey!==pins.expectedInstrumentKeys[key]||
      !SHA.test(pins.expectedPathSha256[key])||
      h(path)!==pins.expectedPathSha256[key])
      return failed('INVALID_EVIDENCE',
        'HORIZON_ORDER_OR_INDEPENDENT_ORIGINAL_L1_HASH_MISMATCH',cells);
    const result=one(path,policy);
    if(result.ok===false)return failed('INCOMPLETE_EVIDENCE',
      result.code,cells);
    cells.push(result.cell);
  }
  const alerts=cells.filter(c=>c.fullDebitLossBudgetExceeded||
    c.adverseGapBudgetExceeded||c.displayedDepthBelowPolicy||
    c.zeroBidOrNoDisplayedDepth).length;
  return {...base(),status:alerts>0?'DESCRIPTIVE_RISK_ALERT_ONLY':
    'DESCRIPTIVE_BOUNDS_ONLY',datasetLabel:input.datasetLabel,
    horizonsReviewed:4,predeclaredGapOrCashLossAlerts:alerts,cells};
}
