/**
 * Phase112: read-only inspect an EXISTING Upstox SINGLE GTT whose only
 * ENTRY rule is SELL with a BELOW price trigger. Official GTT API permits
 * ENTRY to be BUY or SELL; this possibility was missing from prior
 * research on MULTIPLE ENTRY BUY + STOPLOSS.
 *
 * A broker-side conditional SELL ENTRY is not a native exchange-hosted
 * stop, nor proof that NSE_FO/BSE_FO existing option longs are eligible.
 * The rule is NEVER created, modified, cancelled or executed here.
 * A rule triggered in a different moment may create an unexpected
 * net-short; snapshots are non-atomic and no sell fill is assumed.
 */
type Row=Record<string,unknown>;
const obj=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const gttId=(v:unknown):v is string=>
  typeof v==='string'&&/^GTT-[A-Za-z0-9-]{1,124}$/.test(v);
const positiveInt=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const positivePrice=(v:unknown):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>0&&
  Number.isSafeInteger(Math.round(v*100))&&
  Math.abs(Math.round(v*100)-v*100)<0.00001;
const upper=(v:unknown)=>typeof v==='string'?v.trim().toUpperCase():'';
const net=(v:unknown):number|null=>{
  if(typeof v==='number')return Number.isSafeInteger(v)&&v>=0?v:null;
  if(typeof v==='string'&&/^(?:0|[1-9][0-9]*)$/.test(v)){
    const n=Number(v);
    return Number.isSafeInteger(n)?n:null;
  }
  return null;
};
const timestamp=(v:unknown):number|null=>{
  // GTT created_at / expires_at are broker microseconds (safe int).
  if(!positiveInt(v))return null;
  const ms=Math.floor(v/1000);
  return Number.isSafeInteger(ms)?ms:null;
};
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
export interface SingleSellGttScope{
  expectedAccountId:string;
  instrumentKey:string;
  originalBuyOrderId:string;
  gttOrderId:string;
  originalLongQuantity:number;
  lotSize:number;
  horizonWeeks:1|2|4|8;
  observedAt:string;
}
export interface SingleSellGttSnapshot{
  exactGtt:unknown;
  allGtts:unknown;
  orderBook:unknown;
  positions:unknown;
}
export type SingleSellGttState=
  'INVALID_SCOPE'|
  'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED'|
  'GTT_OR_ACCOUNT_CENSUS_INCOMPLETE'|
  'BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT'|
  'GTT_SINGLE_SELL_ENTRY_SCHEMA_MISMATCH'|
  'GTT_RULE_TRIGGERED_OR_CANCELLED_NOT_SCHEDULED'|
  'GTT_CONDITION_EXPIRES_BEFORE_PLANNED_HORIZON'|
  'GTT_OR_BROKER_NET_CHANGED_BETWEEN_GET_PASSES'|
  'SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP';
export interface SingleSellGttReport{
  state:SingleSellGttState;
  reasonCodes:readonly string[];
  horizonWeeks:1|2|4|8|null;
  plannedCalendarDays:number|null;
  brokerReportedRemainingLongQuantity:number|null;
  brokerReportedConditionalSellQuantity:number|null;
  brokerReportedGttExpirationAfterPlanningHorizon:boolean;
  brokerReportedScheduledSingleSellCondition:boolean;
  sameBrokerAccountAndAuthEpochAcrossReads:boolean;
  completedReadPasses:0|1|2;
  /** This is an order that MAY be placed if broker condition fires. */
  brokerReportedGttSellConditionNotNativeExchangeStop:true;
  brokerGeneratedChildAbsentWhileScheduled:boolean;
  noNewBuyCreatedByThisReadOnlyReview:true;
  originalBuyAndGttSellAreIndependentOrders:true;
  specificFnoContractGttEligibleIndependentlyVerified:false;
  brokerSellCanOnlyCloseExistingLongIndependentlyCertified:false;
  exchangeNativeStopAckCertified:false;
  limitSellCanFillOnGapGuaranteed:false;
  continuouslyProtectedAcrossNight:false;
  capitalAndMarginRiskApproved:false;
  officialExpiryCalendarCertified:false;
  accountWideHistoricalTradesCertified:false;
  crossSessionGttLifecycleCertified:false;
  liveNrmlBuyAuthorized:false;
  autoPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  orderOrGttMutationAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Summary=Partial<Pick<SingleSellGttReport,
  'horizonWeeks'|'plannedCalendarDays'|
  'brokerReportedRemainingLongQuantity'|
  'brokerReportedConditionalSellQuantity'|
  'brokerReportedGttExpirationAfterPlanningHorizon'|
  'brokerReportedScheduledSingleSellCondition'|
  'sameBrokerAccountAndAuthEpochAcrossReads'|
  'completedReadPasses'>>;
const make=(state:SingleSellGttState,reasons:string[],
  data:Summary={}):SingleSellGttReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  horizonWeeks:data.horizonWeeks??null,
  plannedCalendarDays:data.plannedCalendarDays??null,
  brokerReportedRemainingLongQuantity:
    data.brokerReportedRemainingLongQuantity??null,
  brokerReportedConditionalSellQuantity:
    data.brokerReportedConditionalSellQuantity??null,
  brokerReportedGttExpirationAfterPlanningHorizon:
    data.brokerReportedGttExpirationAfterPlanningHorizon===true,
  brokerReportedScheduledSingleSellCondition:
    data.brokerReportedScheduledSingleSellCondition===true,
  sameBrokerAccountAndAuthEpochAcrossReads:
    data.sameBrokerAccountAndAuthEpochAcrossReads===true,
  completedReadPasses:data.completedReadPasses??0,
  brokerReportedGttSellConditionNotNativeExchangeStop:true,
  brokerGeneratedChildAbsentWhileScheduled:
    data.brokerReportedScheduledSingleSellCondition===true,
  noNewBuyCreatedByThisReadOnlyReview:true,
  originalBuyAndGttSellAreIndependentOrders:true,
  specificFnoContractGttEligibleIndependentlyVerified:false,
  brokerSellCanOnlyCloseExistingLongIndependentlyCertified:false,
  exchangeNativeStopAckCertified:false,
  limitSellCanFillOnGapGuaranteed:false,
  continuouslyProtectedAcrossNight:false,
  capitalAndMarginRiskApproved:false,officialExpiryCalendarCertified:false,
  accountWideHistoricalTradesCertified:false,
  crossSessionGttLifecycleCertified:false,
  liveNrmlBuyAuthorized:false,autoPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,orderOrGttMutationAuthorized:false,
  brokerWrites:0,localWrites:0
});
const valid=(s:SingleSellGttScope)=>!!s&&
  id(s.expectedAccountId)&&typeof s.instrumentKey==='string'&&
  s.instrumentKey.length<=256&&
  (s.instrumentKey.startsWith('NSE_FO|')||
   s.instrumentKey.startsWith('BSE_FO|'))&&
  id(s.originalBuyOrderId)&&gttId(s.gttOrderId)&&
  positiveInt(s.originalLongQuantity)&&positiveInt(s.lotSize)&&
  s.originalLongQuantity%s.lotSize===0&&
  [1,2,4,8].includes(s.horizonWeeks)&&
  typeof s.observedAt==='string'&&ISO.test(s.observedAt)&&
  Number.isFinite(Date.parse(s.observedAt));

/** Check exact documented identity/rule fields, never infer children. */
const relevantGtt=(v:Row)=>JSON.stringify({
  id:v.gtt_order_id,type:v.type,product:v.product,
  instrument:v.instrument_token,quantity:v.quantity,
  created_at:v.created_at,expires_at:v.expires_at,
  rules:v.rules
});
const terminal=new Set(['COMPLETE','COMPLETED','REJECTED',
  'CANCELLED','CANCELED','EXPIRED','FAILED']);
export function auditExistingSingleSellGttReadOnly(
  s:SingleSellGttScope,snapshot:SingleSellGttSnapshot
):SingleSellGttReport{
  if(!valid(s))return make('INVALID_SCOPE',
    ['INVALID_NRML_OPTION_GTT_OR_1W_8W_SCOPE']);
  const base:Summary={
    horizonWeeks:s.horizonWeeks,plannedCalendarDays:s.horizonWeeks*7
  };
  if(!snapshot||!Array.isArray(snapshot.exactGtt)||
     !Array.isArray(snapshot.allGtts)||
     !Array.isArray(snapshot.orderBook)||
     !Array.isArray(snapshot.positions))
    return make('GTT_OR_ACCOUNT_CENSUS_INCOMPLETE',
      ['CURRENT_GTT_DETAILS_ALL_GTT_ORDERS_OR_POSITIONS_UNAVAILABLE'],base);
  const positions=snapshot.positions.filter(x=>obj(x)&&
    x.instrument_token===s.instrumentKey&&x.product==='D');
  const remaining=positions.length===1&&obj(positions[0])
    ?net(positions[0].net_quantity):null;
  if(remaining===null||remaining<=0||
     remaining>s.originalLongQuantity||
     remaining%s.lotSize!==0||
     snapshot.positions.some(x=>!obj(x)||
       typeof x.instrument_token!=='string'||
       (x.instrument_token===s.instrumentKey&&x.product!=='D')))
    return make('BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT',
      ['NRML_LONG_BROKER_NET_AMBIGUOUS_NONLOT_SHORT_OR_OTHER_PRODUCT'],base);
  const counts:Summary={...base,
    brokerReportedRemainingLongQuantity:remaining};
  if(snapshot.exactGtt.length!==1||!obj(snapshot.exactGtt[0]))
    return make('GTT_SINGLE_SELL_ENTRY_SCHEMA_MISMATCH',
      ['EXACT_GTT_PARENT_NOT_UNIQUE_OR_NO_RULES'],counts);
  const p=snapshot.exactGtt[0];
  if(p.gtt_order_id!==s.gttOrderId||p.type!=='SINGLE'||
     p.product!=='D'||p.instrument_token!==s.instrumentKey||
     p.quantity!==remaining||!Array.isArray(p.rules)||
     p.rules.length!==1||!obj(p.rules[0]))
    return make('GTT_SINGLE_SELL_ENTRY_SCHEMA_MISMATCH',
      ['SINGLE_GTT_NOT_EXACT_SAME_NRML_OPTION_AND_REMAINING_LONG'],counts);
  const rule=p.rules[0];
  if(upper(rule.strategy)!=='ENTRY'||
     upper(rule.transaction_type)!=='SELL'||
     upper(rule.trigger_type)!=='BELOW'||
     !positivePrice(rule.trigger_price))
    return make('GTT_SINGLE_SELL_ENTRY_SCHEMA_MISMATCH',
      ['ONLY_ENTRY_SELL_BELOW_RULE_CAN_RESEARCH_EXISTING_LONG_EXIT'],counts);
  // The condition, if triggered, generates a LIMIT order, not a
  // native stop order. A triggered state requires a separate child
  // trade/position audit and must not be called protected here.
  if(upper(rule.status)!=='SCHEDULED'||rule.order_id!==null)
    return make('GTT_RULE_TRIGGERED_OR_CANCELLED_NOT_SCHEDULED',
      ['GTT_ENTRY_SELL_CHILD_TRIGGER_CANCEL_PENDING_OR_UNKNOWN'],counts);
  const seen=snapshot.allGtts.filter(x=>obj(x)&&
    x.gtt_order_id===s.gttOrderId);
  if(seen.length!==1||!obj(seen[0])||
     relevantGtt(seen[0])!==relevantGtt(p))
    return make('GTT_OR_ACCOUNT_CENSUS_INCOMPLETE',
      ['CURRENT_GTT_DETAILS_DISAGREE_WITH_FULL_BROKER_GTT_LIST'],counts);
  for(const x of snapshot.allGtts){
    if(!obj(x)||typeof x.instrument_token!=='string')
      return make('GTT_OR_ACCOUNT_CENSUS_INCOMPLETE',
        ['MALFORMED_FULL_GTT_ACCOUNT_LIST'],counts);
    if(x.instrument_token===s.instrumentKey&&
       x.gtt_order_id!==s.gttOrderId)
      return make('BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT',
        ['OTHER_SAME_OPTION_GTT_MAY_CREATE_ANOTHER_BUY_OR_SELL'],counts);
  }
  for(const x of snapshot.orderBook){
    if(!obj(x)||typeof x.instrument_token!=='string')
      return make('GTT_OR_ACCOUNT_CENSUS_INCOMPLETE',
        ['MALFORMED_FULL_ACCOUNT_ORDER_BOOK'],counts);
    if(x.instrument_token!==s.instrumentKey)continue;
    const status=upper(x.status),side=upper(x.transaction_type);
    if(x.product!=='D'||!id(x.order_id)||
       !['BUY','SELL'].includes(side)||
       (status.length===0))
      return make('BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT',
        ['UNRESOLVED_SAME_CONTRACT_BROKER_ORDER'],counts);
    if(x.order_id===s.originalBuyOrderId&&side==='BUY'&&
       ['COMPLETE','COMPLETED'].includes(status))continue;
    if(side==='BUY')
      return make('BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT',
        ['OTHER_SAME_OPTION_BUY_CAN_ADD_EXPOSURE'],counts);
    const filled=net(x.filled_quantity);
    if(filled!==0||!terminal.has(status))
      return make('BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT',
        ['OTHER_OPTION_SELL_OR_UNRECONCILED_EXECUTION_EXISTS'],counts);
  }
  const created=timestamp(p.created_at);
  const expiry=timestamp(p.expires_at);
  const now=Date.parse(s.observedAt);
  const through=now+s.horizonWeeks*7*86_400_000;
  if(created===null||expiry===null||expiry<=created||
     created>now||expiry<=now||
     expiry-created>366*86_400_000||
     !Number.isSafeInteger(through)||expiry<through)
    return make('GTT_CONDITION_EXPIRES_BEFORE_PLANNED_HORIZON',
      ['GTT_MICROSECOND_EXPIRY_INVALID_OR_BEFORE_CARRY_HORIZON'],counts);
  return make('SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP',[
    'GTT_ENTRY_SELL_IS_BROKER_SIDE_TRIGGER_NOT_NATIVE_EXCHANGE_STOP',
    'GTT_TRIGGERED_LIMIT_SELL_CAN_GAP_NOT_FILL_OR_BE_REJECTED',
    'API_FNO_EXISTING_LONG_EXIT_AND_SELL_AUTH_UNVERIFIED',
    'UNSAMPLED_OVERNIGHT_LIFECYCLE_NEVER_CERTIFIED'
  ],{...counts,
    brokerReportedGttExpirationAfterPlanningHorizon:true,
    brokerReportedScheduledSingleSellCondition:true,
    brokerReportedConditionalSellQuantity:remaining
  });
}
export interface ExistingSingleSellGttBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getBrokerAuthEpoch():number;
  getGttOrderDetails(id:string):Promise<unknown>;
  getGttOrders():Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getVerifiedNrmlPositionRows():Promise<unknown>;
}
/** Two independent read batches; no writes, retries, or settlement. */
export async function reviewExistingSingleSellGttTwoPassReadOnly(
  broker:ExistingSingleSellGttBroker,s:SingleSellGttScope
):Promise<SingleSellGttReport>{
  if(!valid(s))return make('INVALID_SCOPE',
    ['INVALID_NRML_OPTION_GTT_OR_1W_8W_SCOPE']);
  if(!broker||['getLiveConnectionStatus','getBrokerAuthEpoch',
    'getGttOrderDetails','getGttOrders','getOrderBook',
    'getVerifiedNrmlPositionRows'].some(n=>
      typeof broker[n as keyof ExistingSingleSellGttBroker]!=='function'))
    return make('BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
      ['GTT_READ_ONLY_SESSION_OR_METHOD_MISSING']);
  let epoch:number;
  try{
    const auth=broker.getLiveConnectionStatus();
    epoch=broker.getBrokerAuthEpoch();
    if(auth?.isConnected!==true||auth.userId!==s.expectedAccountId||
       !positiveInt(epoch))
      return make('BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
        ['BROKER_ACCOUNT_OR_AUTH_EPOCH_UNAVAILABLE']);
  }catch{return make('BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_ACCOUNT_OR_AUTH_EPOCH_UNAVAILABLE']);}
  const same=():boolean=>{
    try{
      const auth=broker.getLiveConnectionStatus();
      return auth?.isConnected===true&&auth.userId===s.expectedAccountId&&
        broker.getBrokerAuthEpoch()===epoch;
    }catch{return false;}
  };
  const lost=(pass:0|1|2)=>make(
    'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_DURING_TWO_PASS_GTT_READ'],
    {completedReadPasses:pass});
  const read=async():Promise<SingleSellGttSnapshot>=>{
    const [exactGtt,allGtts,orderBook,positions]=await Promise.all([
      broker.getGttOrderDetails(s.gttOrderId),broker.getGttOrders(),
      broker.getOrderBook(),broker.getVerifiedNrmlPositionRows()
    ]);
    return {exactGtt,allGtts,orderBook,positions};
  };
  if(!same())return lost(0);
  let first:SingleSellGttSnapshot;
  try{first=await read();}catch{
    return same()?make('GTT_OR_ACCOUNT_CENSUS_INCOMPLETE',
      ['FIRST_GTT_CURRENT_ACCOUNT_GET_FAILED']):lost(0);
  }
  if(!same())return lost(1);
  const a=auditExistingSingleSellGttReadOnly(s,first);
  if(a.state!=='SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP')
    return make(a.state,[...a.reasonCodes],{completedReadPasses:1,
      horizonWeeks:a.horizonWeeks,plannedCalendarDays:a.plannedCalendarDays});
  let second:SingleSellGttSnapshot;
  try{second=await read();}catch{
    return same()?make('GTT_OR_ACCOUNT_CENSUS_INCOMPLETE',
      ['SECOND_GTT_CURRENT_ACCOUNT_GET_FAILED'],
      {completedReadPasses:1}):lost(1);
  }
  if(!same())return lost(2);
  const b=auditExistingSingleSellGttReadOnly(s,second);
  if(b.state!=='SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP')
    return make(b.state,[...b.reasonCodes],{
      completedReadPasses:2,
      horizonWeeks:b.horizonWeeks,plannedCalendarDays:b.plannedCalendarDays
    });
  if(JSON.stringify(first)!==JSON.stringify(second))
    return make('GTT_OR_BROKER_NET_CHANGED_BETWEEN_GET_PASSES',
      ['SCHEDULED_SELL_GTT_RULE_NET_OR_ACCOUNT_BOOK_DRIFT'],
      {completedReadPasses:2,horizonWeeks:s.horizonWeeks,
        plannedCalendarDays:s.horizonWeeks*7});
  return make('SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP',
    [...b.reasonCodes],{
      horizonWeeks:b.horizonWeeks,plannedCalendarDays:b.plannedCalendarDays,
      brokerReportedRemainingLongQuantity:b.brokerReportedRemainingLongQuantity,
      brokerReportedConditionalSellQuantity:
        b.brokerReportedConditionalSellQuantity,
      brokerReportedGttExpirationAfterPlanningHorizon:true,
      brokerReportedScheduledSingleSellCondition:true,
      sameBrokerAccountAndAuthEpochAcrossReads:true,completedReadPasses:2
    });
}
