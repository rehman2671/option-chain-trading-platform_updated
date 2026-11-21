/**
 * Phase103: authenticated broker account-wide READ-ONLY order/GTT/position
 * census around ONE durable option contract's original BUY / exit SELL.
 *
 * The Upstox ordinary order book and order details are trading-day scoped.
 * Not seeing a historical order is UNKNOWN, not proof of absence or risk
 * clearance. A current GTT rule is not a native exchange child ACK.
 * ALL outputs deny live BUY, settlement, P&L and closure authorisation.
 */
type Row=Record<string,unknown>;
const obj=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const token=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256;
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const positive=(v:unknown):v is number=>integer(v)&&v>0;
const upper=(v:unknown)=>typeof v==='string'?v.trim().toUpperCase():'';
const parseNet=(v:unknown):number|null=>{
  if(integer(v))return v;
  if(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)){
    const n=Number(v);return Number.isSafeInteger(n)?n:null;
  }
  return null;
};
const terminal=new Set(['COMPLETE','COMPLETED','FILLED',
  'CANCELLED','CANCELED','REJECTED','FAILED','EXPIRED']);
const active=new Set(['OPEN','PENDING','TRIGGER PENDING',
  'PARTIALLY FILLED','PARTIALLY_FILLED','CANCEL PENDING',
  'MODIFY PENDING','SCHEDULED','ACTIVE','TRIGGERED',
  'VALIDATION PENDING','PUT ORDER REQ RECEIVED','UNKNOWN',
  'NOT TRIGGERED','INACTIVE']);
export interface AccountWideExposureScope{
  expectedAccountId:string;
  instrumentKey:string;
  product:'MIS'|'NRML';
  originalBuyOrderId:string;
  exitSellOrderId:string;
  originalBuyQuantity:number;
  confirmedExitFilledQuantity:number;
  lotSize:number;
}
export interface AccountWideExposureSources{
  connectedAccountId:unknown;
  connected:unknown;
  positions:unknown;
  orderBook:unknown;
  gttOrders:unknown;
}
export type AccountWideExposureState=
  'INVALID_SCOPE'|'BROKER_ACCOUNT_NOT_AUTHENTICATED'|
  'BROKER_SOURCES_INCOMPLETE'|'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT'|
  'CURRENT_DAY_BROKER_HISTORY_INCOMPLETE'|
  'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED';
export interface AccountWideExposureReport{
  state:AccountWideExposureState;
  reasonCodes:readonly string[];
  brokerNetLongQuantity:number|null;
  currentDayOriginalBuyFound:boolean;
  currentDayExitSellFound:boolean;
  sameContractOtherOrderCount:number;
  unresolvedOtherBuyCount:number;
  unresolvedOtherSellCount:number;
  sameContractGttSellCount:number;
  unrelatedInstrumentPositionCount:number;
  brokerGetEndpointsAtomic:false;
  historicalOrdersCompletelyCovered:false;
  accountWideCapitalAndMarginReconciled:false;
  independentExchangeChildAckCertified:false;
  protectiveStopCoverageCertified:false;
  confirmedExitSettlementAuthorized:false;
  netRealisedPnlAuthorized:false;
  automaticPositionClosureAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Counts=Partial<Pick<AccountWideExposureReport,
  'brokerNetLongQuantity'|'currentDayOriginalBuyFound'|
  'currentDayExitSellFound'|'sameContractOtherOrderCount'|
  'unresolvedOtherBuyCount'|'unresolvedOtherSellCount'|
  'sameContractGttSellCount'|'unrelatedInstrumentPositionCount'>>;
const make=(state:AccountWideExposureState,reasons:string[],
  data:Counts={}):AccountWideExposureReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  brokerNetLongQuantity:data.brokerNetLongQuantity??null,
  currentDayOriginalBuyFound:data.currentDayOriginalBuyFound===true,
  currentDayExitSellFound:data.currentDayExitSellFound===true,
  sameContractOtherOrderCount:data.sameContractOtherOrderCount??0,
  unresolvedOtherBuyCount:data.unresolvedOtherBuyCount??0,
  unresolvedOtherSellCount:data.unresolvedOtherSellCount??0,
  sameContractGttSellCount:data.sameContractGttSellCount??0,
  unrelatedInstrumentPositionCount:data.unrelatedInstrumentPositionCount??0,
  brokerGetEndpointsAtomic:false,historicalOrdersCompletelyCovered:false,
  accountWideCapitalAndMarginReconciled:false,
  independentExchangeChildAckCertified:false,
  protectiveStopCoverageCertified:false,
  confirmedExitSettlementAuthorized:false,
  netRealisedPnlAuthorized:false,
  automaticPositionClosureAuthorized:false,liveNrmlBuyAuthorized:false,
  brokerWrites:0,localWrites:0
});
const valid=(s:AccountWideExposureScope)=>!!s&&
  id(s.expectedAccountId)&&token(s.instrumentKey)&&
  (s.product==='MIS'||s.product==='NRML')&&
  id(s.originalBuyOrderId)&&id(s.exitSellOrderId)&&
  s.originalBuyOrderId!==s.exitSellOrderId&&
  positive(s.originalBuyQuantity)&&positive(s.lotSize)&&
  s.originalBuyQuantity%s.lotSize===0&&
  integer(s.confirmedExitFilledQuantity)&&
  s.confirmedExitFilledQuantity<=s.originalBuyQuantity;
export function auditAccountWideExposureReadOnly(
  s:AccountWideExposureScope,e:AccountWideExposureSources
):AccountWideExposureReport{
  if(!valid(s))return make('INVALID_SCOPE',['INVALID_ACCOUNT_OPTION_ORDER_OR_LOT_SCOPE']);
  if(!e||e.connected!==true||e.connectedAccountId!==s.expectedAccountId)
    return make('BROKER_ACCOUNT_NOT_AUTHENTICATED',['BROKER_ACCOUNT_MISMATCH']);
  if(!Array.isArray(e.positions)||!Array.isArray(e.orderBook)||
     !Array.isArray(e.gttOrders)||e.positions.length>25000||
     e.orderBook.length>25000||e.gttOrders.length>25000)
    return make('BROKER_SOURCES_INCOMPLETE',
      ['BROKER_FULL_POSITION_ORDER_OR_GTT_LIST_UNAVAILABLE_OR_TRUNCATED']);
  const reasons:string[]=[];
  const gaps:string[]=[];
  let net:number|null=null,posCount=0,otherPositions=0;
  let buySeen=0,sellSeen=0,siblingOrders=0,otherBuys=0,
    otherSells=0,gttSells=0;
  const native=s.product==='NRML'?'D':'I';
  // Validate all full-account rows, even those outside the selected
  // instrument. Invalid rows mean this cannot be used as a complete census.
  for(const raw of e.positions){
    if(!obj(raw)||!token(raw.instrument_token)||
       !['I','D','MTF'].includes(String(raw.product))){
      gaps.push('UNPARSEABLE_BROKER_PORTFOLIO_ROW');continue;
    }
    if(raw.instrument_token!==s.instrumentKey){
      otherPositions++;continue;
    }
    if(raw.product!==native){
      reasons.push('SAME_OPTION_OTHER_PRODUCT_PORTFOLIO_EXPOSURE');continue;
    }
    posCount++;
    const parsed=parseNet(raw.net_quantity);
    if(parsed===null)gaps.push('EXACT_BROKER_NET_QUANTITY_UNKNOWN');
    else net=parsed;
  }
  if(posCount!==1)gaps.push('TARGET_POSITION_ABSENT_OR_DUPLICATED');
  const expectedRemain=s.originalBuyQuantity-s.confirmedExitFilledQuantity;
  if(posCount===1&&net!==null&&net!==expectedRemain)
    reasons.push('BROKER_NET_DISAGREES_WITH_DURABLE_BUY_MINUS_SELL');
  const seenOrders=new Set<string>();
  for(const raw of e.orderBook){
    if(!obj(raw)||!token(raw.instrument_token)||
       !id(raw.order_id)||!['I','D','MTF'].includes(String(raw.product))){
      gaps.push('BROKER_FULL_ORDER_BOOK_ROW_UNVERIFIABLE');continue;
    }
    if(seenOrders.has(raw.order_id)){
      reasons.push('DUPLICATED_ACCOUNT_ORDER_ID');continue;
    }
    seenOrders.add(raw.order_id);
    if(raw.instrument_token!==s.instrumentKey)continue;
    if(raw.product!==native){
      reasons.push('SAME_OPTION_OTHER_PRODUCT_ORDER_EXPOSURE');continue;
    }
    const side=upper(raw.transaction_type),status=upper(raw.status);
    if(!['BUY','SELL'].includes(side)||
       (!active.has(status)&&!terminal.has(status))){
      gaps.push('SAME_OPTION_ORDER_SIDE_OR_STATUS_UNKNOWN');continue;
    }
    if(raw.order_id===s.originalBuyOrderId){
      buySeen++;
      if(side!=='BUY'||!terminal.has(status)||
         !['COMPLETE','COMPLETED','FILLED'].includes(status)||
         raw.quantity!==s.originalBuyQuantity||
         raw.filled_quantity!==s.originalBuyQuantity||
         raw.pending_quantity!==0)
        reasons.push('ORIGINAL_BUY_CURRENT_BOOK_CONTRADICTS_IMMUTABLE_RECEIPT');
      continue;
    }
    if(raw.order_id===s.exitSellOrderId){
      sellSeen++;
      const filled=raw.filled_quantity,pending=raw.pending_quantity;
      if(side!=='SELL'||raw.quantity!==s.originalBuyQuantity||
         !integer(filled)||!integer(pending)||
         filled!==s.confirmedExitFilledQuantity||
         filled+pending>s.originalBuyQuantity||
         (['COMPLETE','COMPLETED','FILLED'].includes(status)&&
           (filled!==s.originalBuyQuantity||pending!==0))||
         (!terminal.has(status)&&filled+pending!==s.originalBuyQuantity))
        reasons.push('EXIT_SELL_CURRENT_BOOK_CONTRADICTS_IMMUTABLE_RECEIPT');
      continue;
    }
    siblingOrders++;
    const filled=parseNet(raw.filled_quantity);
    if(filled===null){
      gaps.push('SIBLING_SAME_OPTION_ORDER_FILL_UNKNOWN');continue;
    }
    if(side==='BUY'){
      if(filled>0||!terminal.has(status)){
        otherBuys++;
        reasons.push('OTHER_BUY_CAN_CHANGE_OR_ALREADY_CHANGED_BROKER_EXPOSURE');
      }
    }else if(filled>0||!terminal.has(status)){
      otherSells++;
      reasons.push('OTHER_SELL_CAN_EXECUTE_OR_ALREADY_FILLED_OUTSIDE_DURABLE_LEDGER');
    }
  }
  if(buySeen!==1)gaps.push('ORIGINAL_BUY_NOT_VISIBLE_IN_CURRENT_DAY_ORDER_BOOK');
  if(sellSeen!==1)gaps.push('EXIT_SELL_NOT_VISIBLE_IN_CURRENT_DAY_ORDER_BOOK');
  const gttIds=new Set<string>();
  for(const raw of e.gttOrders){
    if(!obj(raw)||!token(raw.instrument_token)||
       !id(raw.gtt_order_id)||!['I','D','MTF'].includes(String(raw.product))){
      gaps.push('BROKER_FULL_GTT_LIST_ROW_UNVERIFIABLE');continue;
    }
    if(gttIds.has(raw.gtt_order_id)){
      reasons.push('DUPLICATED_ACCOUNT_GTT_PARENT');continue;
    }
    gttIds.add(raw.gtt_order_id);
    if(raw.instrument_token!==s.instrumentKey)continue;
    if(raw.product!==native){
      reasons.push('SAME_OPTION_OTHER_PRODUCT_GTT_EXPOSURE');continue;
    }
    if(!Array.isArray(raw.rules)||raw.rules.length===0){
      gaps.push('SAME_OPTION_GTT_RULES_INCOMPLETE');continue;
    }
    for(const rule of raw.rules){
      if(!obj(rule)){
        gaps.push('SAME_OPTION_GTT_RULE_UNKNOWN');continue;
      }
      const side=upper(rule.transaction_type),status=upper(rule.status);
      if(!['BUY','SELL'].includes(side)||
         (!active.has(status)&&!terminal.has(status))){
        gaps.push('SAME_OPTION_GTT_SIDE_OR_STATUS_UNKNOWN');continue;
      }
      if(side==='BUY'){
        if(!terminal.has(status))
          reasons.push('ACTIVE_SAME_OPTION_GTT_BUY_CAN_INCREASE_EXPOSURE');
        continue;
      }
      gttSells++;
      // Even a STOPLOSS rule referencing the known SELL child is not an
      // independently certified protective stop or account clearance.
      if(!terminal.has(status)){
        reasons.push('ACTIVE_SAME_OPTION_GTT_SELL_CAN_EXECUTE_AGAIN');
      }else if(['COMPLETE','COMPLETED','FILLED'].includes(status)){
        gaps.push('COMPLETED_GTT_SELL_REQUIRES_SEPARATE_CHILD_TRADE_LINEAGE');
      }else{
        gaps.push('TERMINAL_GTT_SELL_CANCELLATION_NOT_EXCHANGE_FILL_PROOF');
      }
    }
  }
  const data:Counts={
    brokerNetLongQuantity:net,currentDayOriginalBuyFound:buySeen===1,
    currentDayExitSellFound:sellSeen===1,
    sameContractOtherOrderCount:siblingOrders,
    unresolvedOtherBuyCount:otherBuys,
    unresolvedOtherSellCount:otherSells,
    sameContractGttSellCount:gttSells,
    unrelatedInstrumentPositionCount:otherPositions
  };
  if(reasons.length)
    return make('SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT',[...reasons,...gaps],data);
  if(gaps.length)
    return make('CURRENT_DAY_BROKER_HISTORY_INCOMPLETE',gaps,data);
  return make('NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED',
    ['TODAY_ONLY_BROKER_ORDER_BOOK_AND_GTT_SNAPSHOTS_NOT_ATOMIC_OR_HISTORICALLY_COMPLETE'],
    data);
}
export interface ReadOnlyAccountBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getOrderBook():Promise<unknown>;
  getGttOrders():Promise<unknown>;
  getVerifiedNrmlPositionRows():Promise<unknown>;
}
/** Read full ordinary book, GTT list, and finally portfolio; no mutation. */
export async function reviewAccountWideExposureBrokerReadOnly(
  broker:ReadOnlyAccountBroker,s:AccountWideExposureScope
):Promise<AccountWideExposureReport>{
  if(!valid(s))return make('INVALID_SCOPE',['INVALID_ACCOUNT_OPTION_ORDER_OR_LOT_SCOPE']);
  if(!broker||['getLiveConnectionStatus','getOrderBook',
      'getGttOrders','getVerifiedNrmlPositionRows'].some(k=>
        typeof broker[k as keyof ReadOnlyAccountBroker]!=='function'))
    return make('BROKER_SOURCES_INCOMPLETE',['BROKER_READ_ONLY_METHOD_MISSING']);
  let auth:ReturnType<ReadOnlyAccountBroker['getLiveConnectionStatus']>;
  try{auth=broker.getLiveConnectionStatus();}
  catch{return make('BROKER_ACCOUNT_NOT_AUTHENTICATED',['BROKER_ACCOUNT_STATUS_UNAVAILABLE']);}
  if(auth?.isConnected!==true||auth.userId!==s.expectedAccountId)
    return make('BROKER_ACCOUNT_NOT_AUTHENTICATED',['BROKER_ACCOUNT_MISMATCH']);
  let orderBook:unknown,gttOrders:unknown,positions:unknown;
  try{
    orderBook=await broker.getOrderBook();
    gttOrders=await broker.getGttOrders();
    positions=await broker.getVerifiedNrmlPositionRows();
  }catch{
    return make('BROKER_SOURCES_INCOMPLETE',['BROKER_ACCOUNT_GET_FAILED']);
  }
  return auditAccountWideExposureReadOnly(s,{
    connected:true,connectedAccountId:auth.userId,
    positions,orderBook,gttOrders
  });
}
