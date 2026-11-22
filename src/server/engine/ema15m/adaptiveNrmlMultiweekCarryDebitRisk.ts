/**
 * Phase111: read-only multi-week NRML LONG-option carry/debit risk diagnostic.
 * Pure calendar-day planning; NO exchange-calendar, expiry-master,
 * independently broker-signed protective stop or approved capital limit.
 *
 * The maximum option premium paid can be lost on a fully paid LONG CALL/PUT.
 * A DAY SL, GTT ENTRY or broker exchange_order_id is not a multi-session
 * protective guarantee. Actual broker order execution is NEVER permitted.
 */
import type {ExistingNrmlDayStopReport} from
  './adaptiveExistingNrmlDayStopReadOnly.js';

type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const up=(v:unknown):string=>typeof v==='string'?v.trim().toUpperCase():'';
const exactNet=(v:unknown):number|null=>{
  if(typeof v==='number')return Number.isSafeInteger(v)&&v>=0?v:null;
  if(typeof v==='string'&&/^(?:0|[1-9][0-9]*)$/.test(v)){
    const n=Number(v);
    return Number.isSafeInteger(n)?n:null;
  }
  return null;
};
const paise=(v:unknown):number|null=>{
  if(typeof v!=='number'||!Number.isFinite(v)||v<=0)return null;
  const n=Math.round(v*100);
  return Number.isSafeInteger(n)&&Math.abs(v*100-n)<0.00001?n:null;
};
const istDate=(epoch:number)=>new Date(epoch+330*60_000)
  .toISOString().slice(0,10);
const date=/^\d{4}-\d{2}-\d{2}$/;
const iso=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const dayMs=86_400_000;
const midnight=(d:string)=>Date.parse(d+'T00:00:00Z');
const calendarDate=(v:unknown):v is string=>
  typeof v==='string'&&date.test(v)&&
  Number.isFinite(midnight(v))&&
  new Date(midnight(v)).toISOString().slice(0,10)===v;

export interface MultiweekNrmlCarryScope{
  expectedAccountId:string;
  instrumentKey:string;
  originalBuyOrderId:string;
  product:'NRML';
  side:'LONG_CALL'|'LONG_PUT';
  originalQuantity:number;
  lotSize:number;
  /** NOT an exchange-signed contract expiry; operator declaration only. */
  declaredExpiryDate:string;
  /** 1,2,4,8 calendar weeks; trading-day calendar NOT inferred. */
  horizonWeeks:1|2|4|8;
  /** UTC or offset ISO time. Server controls this for the admin route. */
  observedAt:string;
  /** Immutable original BUY weighted premium, not a stop price. */
  originalUnitPremiumINR:number;
  /** Operator declaration, NOT independently risk-approved. */
  declaredDebitBudgetINR:number;
  /** Existing DAY order ID, if a bounded Phase110 review was performed. */
  inspectedDayStopOrderId?:string;
}
export interface MultiweekNrmlCarryEvidence{
  positions:unknown;
  orderBook:unknown;
  gttOrders:unknown;
  existingDayStopReport?:ExistingNrmlDayStopReport|null;
}
export type MultiweekNrmlCarryState=
  'INVALID_SCOPE'|'BROKER_ACCOUNT_SCOPE_INCOMPLETE'|
  'BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT'|
  'OPTION_EXPIRY_AT_OR_BEFORE_REVIEW'|
  'PROPOSED_HORIZON_EXTENDS_BEYOND_DECLARED_EXPIRY'|
  'PREMIUM_DEBIT_EXCEEDS_DECLARED_BUDGET'|
  'MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED';
export interface MultiweekNrmlCarryReport{
  state:MultiweekNrmlCarryState;
  reasonCodes:readonly string[];
  horizonWeeks:1|2|4|8|null;
  calendarDaysPlanned:number|null;
  calendarDayTransitionsBeforeExpiry:number|null;
  brokerReportedRemainingLongQuantity:number|null;
  estimatedRemainingPremiumDebitINR:number|null;
  estimatedOriginalPremiumDebitINR:number|null;
  declaredBudgetINR:number|null;
  brokerReportedDayStopObserved:boolean;
  calendarBoundariesWithoutIndependentlyCertifiedStop:number|null;
  contractExpiryFromExchangeMasterCertified:false;
  operatorDebitBudgetIndependentlyApproved:false;
  statutoryFeesAndTaxesIncluded:false;
  brokerAccountWideExposureIndependentlyCertified:false;
  dayStopMultiSessionPersistent:false;
  externalGttExitForExistingLongApiSupported:false;
  secondGttEntryOrBuyAuthorized:false;
  independentlyCertifiedStopCoveredQuantity:0;
  gapFillPriceGuaranteed:false;
  overnightProtectionCertified:false;
  realBrokerExecutionAuthorized:false;
  automaticPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  nrmlPositional1515ForcedSquareOff:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Summary=Partial<Pick<MultiweekNrmlCarryReport,
  'horizonWeeks'|'calendarDaysPlanned'|
  'calendarDayTransitionsBeforeExpiry'|
  'brokerReportedRemainingLongQuantity'|
  'estimatedRemainingPremiumDebitINR'|'estimatedOriginalPremiumDebitINR'|
  'declaredBudgetINR'|'brokerReportedDayStopObserved'|
  'calendarBoundariesWithoutIndependentlyCertifiedStop'>>;
const make=(state:MultiweekNrmlCarryState,reasons:string[],
  d:Summary={}):MultiweekNrmlCarryReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  horizonWeeks:d.horizonWeeks??null,
  calendarDaysPlanned:d.calendarDaysPlanned??null,
  calendarDayTransitionsBeforeExpiry:
    d.calendarDayTransitionsBeforeExpiry??null,
  brokerReportedRemainingLongQuantity:
    d.brokerReportedRemainingLongQuantity??null,
  estimatedRemainingPremiumDebitINR:
    d.estimatedRemainingPremiumDebitINR??null,
  estimatedOriginalPremiumDebitINR:
    d.estimatedOriginalPremiumDebitINR??null,
  declaredBudgetINR:d.declaredBudgetINR??null,
  brokerReportedDayStopObserved:d.brokerReportedDayStopObserved===true,
  calendarBoundariesWithoutIndependentlyCertifiedStop:
    d.calendarBoundariesWithoutIndependentlyCertifiedStop??null,
  contractExpiryFromExchangeMasterCertified:false,
  operatorDebitBudgetIndependentlyApproved:false,
  statutoryFeesAndTaxesIncluded:false,
  brokerAccountWideExposureIndependentlyCertified:false,
  dayStopMultiSessionPersistent:false,
  externalGttExitForExistingLongApiSupported:false,
  secondGttEntryOrBuyAuthorized:false,
  independentlyCertifiedStopCoveredQuantity:0,
  gapFillPriceGuaranteed:false,overnightProtectionCertified:false,
  realBrokerExecutionAuthorized:false,
  automaticPositionClosureAuthorized:false,realisedPnlWriteAuthorized:false,
  nrmlPositional1515ForcedSquareOff:false,liveNrmlBuyAuthorized:false,
  brokerWrites:0,localWrites:0
});
const valid=(s:MultiweekNrmlCarryScope)=>!!s&&
  id(s.expectedAccountId)&&typeof s.instrumentKey==='string'&&
  s.instrumentKey.length<=256&&
  (s.instrumentKey.startsWith('NSE_FO|')||
   s.instrumentKey.startsWith('BSE_FO|'))&&
  id(s.originalBuyOrderId)&&s.product==='NRML'&&
  ['LONG_CALL','LONG_PUT'].includes(s.side)&&
  [1,2,4,8].includes(s.horizonWeeks)&&
  positive(s.originalQuantity)&&positive(s.lotSize)&&
  s.originalQuantity%s.lotSize===0&&
  calendarDate(s.declaredExpiryDate)&&
  typeof s.observedAt==='string'&&iso.test(s.observedAt)&&
  Number.isFinite(Date.parse(s.observedAt))&&
  paise(s.originalUnitPremiumINR)!==null&&
  paise(s.declaredDebitBudgetINR)!==null&&
  (s.inspectedDayStopOrderId===undefined||
    (id(s.inspectedDayStopOrderId)&&
     s.inspectedDayStopOrderId!==s.originalBuyOrderId));

/**
 * Confirm that the immutable local BUY receipt supports the indicative
 * opening debit. The persisted journal is not an independent clearing
 * receipt; bad/missing/duplicate trades cannot be used to size risk.
 */
export function immutableOriginalDebitMatchesReceipt(input:{
  originalQuantity:unknown;
  entryUnitPremiumINR:unknown;
  exchangeOrderId:unknown;
  tradeCount:unknown;
  trades:unknown;
}):boolean{
  if(!input||!positive(input.originalQuantity)||
     !id(input.exchangeOrderId)||
     !positive(input.tradeCount)||input.tradeCount>5000||
     !Array.isArray(input.trades)||
     input.trades.length!==input.tradeCount||
     paise(input.entryUnitPremiumINR)===null)return false;
  const observed=new Set<string>();let sum=0,totalPaise=0;
  for(const t of input.trades){
    if(!row(t)||!id(t.tradeId)||observed.has(t.tradeId)||
       t.exchangeOrderId!==input.exchangeOrderId||
       !positive(t.quantity)||paise(t.price)===null)return false;
    observed.add(t.tradeId);
    sum+=t.quantity;
    totalPaise+=t.quantity*paise(t.price)!;
    if(!Number.isSafeInteger(sum)||!Number.isSafeInteger(totalPaise))
      return false;
  }
  return sum===input.originalQuantity&&
    Math.abs(Math.round(totalPaise/sum)-
      paise(input.entryUnitPremiumINR)!)<=1;
}
const inactive=new Set(['COMPLETE','COMPLETED','CANCELLED',
  'CANCELED','REJECTED','EXPIRED','FAILED']);
export function reviewMultiweekNrmlCarryDebitRisk(
  s:MultiweekNrmlCarryScope,e:MultiweekNrmlCarryEvidence
):MultiweekNrmlCarryReport{
  if(!valid(s))return make('INVALID_SCOPE',
    ['INVALID_LONG_OPTION_NRML_EXPIRY_HORIZON_PREMIUM_OR_BUDGET']);
  const plan=s.horizonWeeks*7;
  const obs=Date.parse(s.observedAt);
  const today=istDate(obs);
  const daysToExpiry=Math.round((midnight(s.declaredExpiryDate)-
    midnight(today))/dayMs);
  const base:Summary={horizonWeeks:s.horizonWeeks,
    calendarDaysPlanned:plan,
    calendarDayTransitionsBeforeExpiry:Math.max(0,Math.min(plan,daysToExpiry)),
    declaredBudgetINR:s.declaredDebitBudgetINR};
  if(!e||!Array.isArray(e.positions)||!Array.isArray(e.orderBook)||
     !Array.isArray(e.gttOrders))
    return make('BROKER_ACCOUNT_SCOPE_INCOMPLETE',
      ['FULL_CURRENT_BROKER_NET_ORDERS_AND_GTT_CENSUS_UNAVAILABLE'],base);
  const matched=e.positions.filter(x=>row(x)&&
    x.instrument_token===s.instrumentKey&&x.product==='D');
  const current=matched.length===1&&row(matched[0])?
    exactNet(matched[0].net_quantity):null;
  if(current===null||current===0||current>s.originalQuantity||
     current%s.lotSize!==0||
     e.positions.some(x=>!row(x)||typeof x.instrument_token!=='string'||
       (x.instrument_token===s.instrumentKey&&x.product!=='D')))
    return make('BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT',
      ['NRML_LONG_BROKER_NET_UNKNOWN_DUPLICATED_SHORT_OR_NOT_WHOLE_LOT'],base);
  const origPaise=paise(s.originalUnitPremiumINR)!;
  const origDebit=origPaise*s.originalQuantity;
  const remDebit=origPaise*current;
  const budgetPaise=paise(s.declaredDebitBudgetINR)!;
  if(!Number.isSafeInteger(origDebit)||!Number.isSafeInteger(remDebit)||
     !Number.isSafeInteger(budgetPaise))
    return make('INVALID_SCOPE',
      ['PREMIUM_DEBIT_OR_DECLARED_BUDGET_PAISE_OVERFLOW'],base);
  const d:Summary={...base,
    brokerReportedRemainingLongQuantity:current,
    estimatedOriginalPremiumDebitINR:origDebit/100,
    estimatedRemainingPremiumDebitINR:remDebit/100,
    // No independently verified protective order for multi-session
    // coverage, so every planned calendar-day transition remains unknown.
    calendarBoundariesWithoutIndependentlyCertifiedStop:
      Math.max(0,Math.min(plan,daysToExpiry))};
  let dayObserved=false;
  const candidate=e.existingDayStopReport;
  if(s.inspectedDayStopOrderId!==undefined){
    if(!candidate||
       candidate.state!=='BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION'||
       candidate.brokerReadPasses!==2||
       candidate.sameBrokerSessionAcrossPasses!==true||
       candidate.brokerReportedRemainingLongQuantity!==current||
       candidate.brokerReportedOriginalLongQuantity!==s.originalQuantity||
       candidate.nativeValidityDayObserved!==true||
       candidate.liveNrmlBuyAuthorized!==false||
       candidate.brokerWrites!==0)
      return make('BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT',
        ['EXISTING_DAY_STOP_CANNOT_BE_RECONCILED_TO_CURRENT_NRML_NET'],d);
    dayObserved=true;
  }
  d.brokerReportedDayStopObserved=dayObserved;
  const statusOk=(v:unknown):boolean=>typeof v==='string'&&
    (inactive.has(up(v))||[
      'OPEN','TRIGGER PENDING','PARTIALLY FILLED','PENDING',
      'CANCEL PENDING','MODIFY PENDING','VALIDATION PENDING',
      'PUT ORDER REQ RECEIVED','UNKNOWN'
    ].includes(up(v)));
  let sameContractGtt=0,sameContractUnresolvedOrder=0;
  for(const x of e.orderBook){
    if(!row(x)||typeof x.instrument_token!=='string')
      return make('BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT',
        ['MALFORMED_ACCOUNT_WIDE_ORDER_CENSUS'],d);
    if(x.instrument_token!==s.instrumentKey)continue;
    if(x.product!=='D'||!id(x.order_id)||
       !['BUY','SELL'].includes(up(x.transaction_type))||
       !statusOk(x.status)){
      sameContractUnresolvedOrder++;continue;
    }
    if(x.order_id===s.originalBuyOrderId&&
       up(x.transaction_type)==='BUY'&&
       ['COMPLETE','COMPLETED'].includes(up(x.status)))continue;
    // An exactly reconciled current DAY stop is still not overnight
    // coverage; it is not a competing order for this census.
    if(dayObserved&&x.order_id===s.inspectedDayStopOrderId&&
       up(x.transaction_type)==='SELL')continue;
    if(up(x.transaction_type)==='SELL'){
      const fill=exactNet(x.filled_quantity);
      if(fill!==0||!inactive.has(up(x.status)))
        sameContractUnresolvedOrder++;
    }else sameContractUnresolvedOrder++;
  }
  for(const g of e.gttOrders){
    if(!row(g)||typeof g.instrument_token!=='string')
      return make('BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT',
        ['MALFORMED_ACCOUNT_WIDE_GTT_CENSUS'],d);
    if(g.instrument_token===s.instrumentKey)sameContractGtt++;
  }
  if(sameContractGtt>0||sameContractUnresolvedOrder>0)
    return make('BROKER_NRML_NET_OR_COMPETING_ORDERS_CONFLICT',
      ['SAME_CONTRACT_GTT_ENTRY_OR_UNATTRIBUTED_BUY_SELL_MAY_CHANGE_NET'],d);
  if(daysToExpiry<=0)
    return make('OPTION_EXPIRY_AT_OR_BEFORE_REVIEW',
      ['DECLARED_OPTION_EXPIRY_REACHED_OR_PASSED_NOT_EXCHANGE_VERIFIED'],d);
  if(daysToExpiry<plan)
    return make('PROPOSED_HORIZON_EXTENDS_BEYOND_DECLARED_EXPIRY',
      ['CONTRACT_EXPIRES_BEFORE_PROPOSED_CALENDAR_WEEK_HOLD'],d);
  if(remDebit>budgetPaise)
    return make('PREMIUM_DEBIT_EXCEEDS_DECLARED_BUDGET',
      ['REMAINING_LONG_OPTION_PREMIUM_EXCEEDS_OPERATOR_DECLARED_BUDGET'],d);
  return make('MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED',[
    dayObserved?'EXISTING_DAY_SELL_STOP_NOT_PERSISTENT_OVERNIGHT':
      'NO_INDEPENDENTLY_CERTIFIED_MULTISESSION_PROTECTIVE_EXIT',
    'EXCHANGE_EXPIRY_CALENDAR_AND_MARGIN_NOT_INDEPENDENTLY_VERIFIED',
    'OPERATOR_BUDGET_NOT_A_RISK_COMMITTEE_APPROVAL',
    'PREMIUM_DEBIT_RISK_EXCLUDES_FEES_TAXES_AND_LIQUIDITY_GAPS'
  ],d);
}
