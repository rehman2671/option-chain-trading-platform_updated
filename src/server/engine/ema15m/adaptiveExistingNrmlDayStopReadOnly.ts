/**
 * Phase110 — Inspect a native, already-existing Upstox SELL SL / SL-M
 * DAY child for an NRML option long without placing any GTT ENTRY/BUY.
 *
 * Official v2/v3 native order APIs specify DAY/IOC validity. A DAY stop
 * CANNOT be used as 1–8 week or overnight protection. Even two matching
 * broker GET censuses cannot certify exchange-signed protection or fill.
 * No broker order/GTT write is imported or permitted by this module.
 */
type Row=Record<string,unknown>;
const obj=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const key=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=256;
const int=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const pos=(v:unknown):v is number=>int(v)&&v>0;
const up=(v:unknown)=>typeof v==='string'?v.trim().toUpperCase():'';
const exactNet=(v:unknown):number|null=>{
  if(typeof v==='number')return int(v)?v:null;
  if(typeof v==='string'&&/^(?:0|[1-9][0-9]*)$/.test(v)){
    const n=Number(v);return int(n)?n:null;
  }
  return null;
};
export interface ExistingNrmlDayStopScope{
  expectedAccountId:string;
  instrumentKey:string;
  originalBuyOrderId:string;
  stopOrderId:string;
  originalLongQuantity:number;
  lotSize:number;
}
export interface ExistingNrmlDayStopEvidence{
  order:unknown;
  orderBook:unknown;
  trades:unknown;
  positions:unknown;
  gttOrders:unknown;
}
export type ExistingNrmlDayStopState=
  'INVALID_SCOPE'|'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED'|
  'BROKER_SOURCE_INCOMPLETE'|'DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID'|
  'DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT'|
  'CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT'|
  'DAY_SELL_STOP_STATE_CHANGED_BETWEEN_READS'|
  'BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION';
export interface ExistingNrmlDayStopReport{
  state:ExistingNrmlDayStopState;
  reasonCodes:readonly string[];
  nativeSellStopTypeObserved:'SL'|'SL-M'|null;
  nativeValidityDayObserved:boolean;
  brokerReportedExchangeIdObserved:boolean;
  brokerReportedOriginalLongQuantity:number|null;
  brokerReportedStopFilledQuantity:number|null;
  brokerReportedStopPendingQuantity:number|null;
  brokerReportedRemainingLongQuantity:number|null;
  quantityWithoutIndependentlyCertifiedOvernightStop:number|null;
  brokerReadPasses:0|1|2;
  sameBrokerSessionAcrossPasses:boolean;
  brokerSnapshotsAtomic:false;
  stopPersistsAcrossMarketSessions:false;
  overnightOptionGapProtectionCertified:false;
  brokerExchangeStopAckIndependentlyCertified:false;
  brokerStopFillGuaranteed:false;
  stopPlacementOrAmendmentAuthorized:false;
  newGttEntryOrBuyAuthorized:false;
  capitalMarginAndStrategyApproved:false;
  realisedPnlWriteAuthorized:false;
  automaticPositionClosureAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Summary=Partial<Pick<ExistingNrmlDayStopReport,
  'nativeSellStopTypeObserved'|'nativeValidityDayObserved'|
  'brokerReportedExchangeIdObserved'|'brokerReportedOriginalLongQuantity'|
  'brokerReportedStopFilledQuantity'|'brokerReportedStopPendingQuantity'|
  'brokerReportedRemainingLongQuantity'|
  'quantityWithoutIndependentlyCertifiedOvernightStop'|
  'brokerReadPasses'|'sameBrokerSessionAcrossPasses'>>;
const result=(state:ExistingNrmlDayStopState,reasons:string[],
  data:Summary={}):ExistingNrmlDayStopReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  nativeSellStopTypeObserved:data.nativeSellStopTypeObserved??null,
  nativeValidityDayObserved:data.nativeValidityDayObserved===true,
  brokerReportedExchangeIdObserved:data.brokerReportedExchangeIdObserved===true,
  brokerReportedOriginalLongQuantity:
    data.brokerReportedOriginalLongQuantity??null,
  brokerReportedStopFilledQuantity:
    data.brokerReportedStopFilledQuantity??null,
  brokerReportedStopPendingQuantity:
    data.brokerReportedStopPendingQuantity??null,
  brokerReportedRemainingLongQuantity:
    data.brokerReportedRemainingLongQuantity??null,
  quantityWithoutIndependentlyCertifiedOvernightStop:
    data.quantityWithoutIndependentlyCertifiedOvernightStop??null,
  brokerReadPasses:data.brokerReadPasses??0,
  sameBrokerSessionAcrossPasses:data.sameBrokerSessionAcrossPasses===true,
  brokerSnapshotsAtomic:false,stopPersistsAcrossMarketSessions:false,
  overnightOptionGapProtectionCertified:false,
  brokerExchangeStopAckIndependentlyCertified:false,
  brokerStopFillGuaranteed:false,stopPlacementOrAmendmentAuthorized:false,
  newGttEntryOrBuyAuthorized:false,capitalMarginAndStrategyApproved:false,
  realisedPnlWriteAuthorized:false,automaticPositionClosureAuthorized:false,
  liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
});
const valid=(s:ExistingNrmlDayStopScope)=>!!s&&
  id(s.expectedAccountId)&&key(s.instrumentKey)&&
  (s.instrumentKey.startsWith('NSE_FO|')||
   s.instrumentKey.startsWith('BSE_FO|'))&&
  id(s.originalBuyOrderId)&&id(s.stopOrderId)&&
  s.originalBuyOrderId!==s.stopOrderId&&
  pos(s.originalLongQuantity)&&pos(s.lotSize)&&
  s.originalLongQuantity%s.lotSize===0;
const active=new Set(['OPEN','TRIGGER PENDING','PARTIALLY FILLED']);
const terminal=new Set(['COMPLETE','COMPLETED','CANCELLED',
  'CANCELED','REJECTED','EXPIRED','FAILED']);
const orderMatch=(a:Row,b:Row):boolean=>
  ['order_id','order_ref_id','exchange_order_id','instrument_token',
    'product','transaction_type','order_type','validity','quantity',
    'filled_quantity','pending_quantity','price','trigger_price','status'
  ].every(k=>a[k]===b[k]);
/** Pure broker observations; never infer venue/native stop approval. */
export function auditExistingNrmlDayStop(
  s:ExistingNrmlDayStopScope,e:ExistingNrmlDayStopEvidence
):ExistingNrmlDayStopReport{
  if(!valid(s))return result('INVALID_SCOPE',
    ['INVALID_ACCOUNT_NATIVE_OPTION_OR_ORIGINAL_LONG_STOP_SCOPE']);
  if(!e||!obj(e.order)||!Array.isArray(e.orderBook)||
     !Array.isArray(e.trades)||!Array.isArray(e.positions)||
     !Array.isArray(e.gttOrders))
    return result('BROKER_SOURCE_INCOMPLETE',
      ['DAY_STOP_DETAILS_ACCOUNT_BOOK_TRADES_NET_OR_GTT_GET_MISSING']);
  const o=e.order,kind=up(o.order_type);
  const scopeValid=o.order_id===s.stopOrderId&&
    o.instrument_token===s.instrumentKey&&o.product==='D'&&
    up(o.transaction_type)==='SELL'&&
    (kind==='SL'||kind==='SL-M')&&up(o.validity)==='DAY'&&
    pos(o.quantity)&&o.quantity===s.originalLongQuantity&&
    int(o.filled_quantity)&&int(o.pending_quantity)&&
    o.filled_quantity+o.pending_quantity===o.quantity&&
    o.filled_quantity<o.quantity&&o.pending_quantity>0&&
    active.has(up(o.status))&&pos(o.trigger_price)&&
    (kind==='SL'?
      typeof o.price==='number'&&Number.isFinite(o.price)&&
      o.price>0&&o.price<=o.trigger_price:
      o.price===0);
  if(!scopeValid)return result('DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID',
    ['NATIVE_DAY_SELL_SL_PRODUCT_PRICE_QUANTITY_OR_LIFECYCLE_INVALID']);
  const base:Summary={
    nativeSellStopTypeObserved:kind as 'SL'|'SL-M',
    nativeValidityDayObserved:true,
    brokerReportedExchangeIdObserved:id(o.exchange_order_id),
    brokerReportedOriginalLongQuantity:s.originalLongQuantity
  };
  if(!id(o.exchange_order_id))
    return result('DAY_SELL_STOP_SCOPE_OR_PRICE_INVALID',
      ['BROKER_REPORTED_STOP_EXCHANGE_ID_MISSING'],base);
  const matchingBook=e.orderBook.filter(x=>obj(x)&&x.order_id===s.stopOrderId);
  if(matchingBook.length!==1||!obj(matchingBook[0])||
     !orderMatch(o,matchingBook[0]))
    return result('DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT',
      ['EXACT_DAY_STOP_DETAILS_CONTRADICT_ACCOUNT_ORDER_BOOK'],base);
  let tradeSum=0;
  const tradeIds=new Set<string>();
  for(const t of e.trades){
    if(!obj(t)||!id(t.trade_id)||tradeIds.has(t.trade_id)||
       t.order_id!==s.stopOrderId||
       t.exchange_order_id!==o.exchange_order_id||
       t.instrument_token!==s.instrumentKey||t.product!=='D'||
       up(t.transaction_type)!=='SELL'||!pos(t.quantity))
      return result('DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT',
        ['STOP_SELL_TRADE_ID_EXCHANGE_SIDE_OR_LOT_CONFLICT'],base);
    tradeIds.add(t.trade_id);
    tradeSum+=t.quantity;
    if(!int(tradeSum))
      return result('DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT',
        ['STOP_SELL_FILLED_SUM_OVERFLOW'],base);
  }
  if(tradeSum!==o.filled_quantity)
    return result('DAY_SELL_STOP_BOOK_OR_TRADES_CONFLICT',
      ['STOP_FILLED_AMOUNT_DISAGREES_WITH_UNIQUE_BROKER_TRADES'],base);
  const nrml=e.positions.filter(x=>obj(x)&&
    x.instrument_token===s.instrumentKey&&x.product==='D');
  const nativeNet=nrml.length===1&&obj(nrml[0])?
    exactNet(nrml[0].net_quantity):null;
  const remainder=s.originalLongQuantity-o.filled_quantity;
  if(nativeNet===null||nativeNet!==remainder||nativeNet<=0||
     nativeNet!==o.pending_quantity||
     nativeNet%s.lotSize!==0||
     e.positions.some(x=>obj(x)&&x.instrument_token===s.instrumentKey&&
       x.product!=='D'))
    return result('CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT',
      ['BROKER_NET_NOT_UNIQUE_WHOLE_LOT_OR_STOP_PENDING_NOT_EQUAL_TO_LONG'],base);
  // All same-contract active competing BUY, SELL, GTT or untracked
  // executions make a standalone protective SELL unsafe to infer.
  // A completed original BUY can be the long itself; daily orderbook
  // may not retain original BUY from prior sessions.
  for(const x of e.orderBook){
    if(!obj(x)||!key(x.instrument_token))
      return result('CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT',
        ['BROKER_ORDER_CENSUS_MALFORMED'],base);
    if(x.instrument_token!==s.instrumentKey||x.order_id===s.stopOrderId)
      continue;
    const st=up(x.status),side=up(x.transaction_type);
    if(x.product!=='D'||!id(x.order_id)||
       !['BUY','SELL'].includes(side)||
       (!active.has(st)&&!terminal.has(st)))
      return result('CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT',
        ['OTHER_SAME_CONTRACT_BROKER_ORDER_UNRESOLVED'],base);
    if(side==='BUY'){
      if(x.order_id!==s.originalBuyOrderId||
         !['COMPLETE','COMPLETED'].includes(st))
        return result('CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT',
          ['OTHER_SAME_CONTRACT_BUY_MAY_CHANGE_EXPOSURE'],base);
    }else{
      const fill=exactNet(x.filled_quantity);
      if(fill===null||fill>0||!terminal.has(st))
        return result('CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT',
          ['OTHER_SELL_FILL_OR_PENDING_ORDER_NOT_IN_STOP_CONSERVATION'],base);
    }
  }
  for(const g of e.gttOrders){
    if(!obj(g)||!key(g.instrument_token))
      return result('CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT',
        ['BROKER_GTT_CENSUS_MALFORMED'],base);
    if(g.instrument_token===s.instrumentKey)
      return result('CURRENT_NRML_NET_OR_SAME_CONTRACT_ORDERS_CONFLICT',
        ['SAME_CONTRACT_GTT_COULD_ADD_BUY_OR_COMPETING_STOP'],base);
  }
  return result('BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION',
    ['DAY_ONLY_STOP_EXPIRES_NOT_MULTI_WEEK_OR_OVERNIGHT_PROTECTION',
     'BROKER_REPORTED_EXCHANGE_ID_NOT_INDEPENDENT_STOP_ACK',
     'BROKER_ORDER_BOOK_AND_PORTFOLIO_ARE_NOT_ATOMIC'],{
    ...base,brokerReportedStopFilledQuantity:o.filled_quantity,
    brokerReportedStopPendingQuantity:o.pending_quantity,
    brokerReportedRemainingLongQuantity:nativeNet,
    quantityWithoutIndependentlyCertifiedOvernightStop:nativeNet
  });
}
export interface ExistingNrmlDayStopBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getBrokerAuthEpoch():number;
  getOrderDetails(id:string):Promise<unknown>;
  getOrderTrades(id:string):Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getGttOrders():Promise<unknown>;
  getVerifiedNrmlPositionRows():Promise<unknown>;
}
/** Two full, non-atomic, session-pinned GET batches. No broker writes. */
export async function reviewExistingNrmlDayStopReadOnly(
  b:ExistingNrmlDayStopBroker,s:ExistingNrmlDayStopScope
):Promise<ExistingNrmlDayStopReport>{
  if(!valid(s))return result('INVALID_SCOPE',
    ['INVALID_ACCOUNT_NATIVE_OPTION_OR_ORIGINAL_LONG_STOP_SCOPE']);
  if(!b||['getLiveConnectionStatus','getBrokerAuthEpoch',
    'getOrderDetails','getOrderTrades','getOrderBook',
    'getGttOrders','getVerifiedNrmlPositionRows'].some(n=>
      typeof b[n as keyof ExistingNrmlDayStopBroker]!=='function'))
    return result('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
      ['BROKER_NATIVE_DAY_STOP_READ_METHOD_UNAVAILABLE']);
  let epoch:number;
  try{
    const auth=b.getLiveConnectionStatus();
    epoch=b.getBrokerAuthEpoch();
    if(auth?.isConnected!==true||auth.userId!==s.expectedAccountId||
       !pos(epoch))
      return result('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
        ['BROKER_DAY_STOP_ACCOUNT_OR_AUTH_EPOCH_UNAVAILABLE']);
  }catch{return result('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_DAY_STOP_ACCOUNT_OR_AUTH_EPOCH_UNAVAILABLE']);}
  const same=():boolean=>{
    try{
      const auth=b.getLiveConnectionStatus();
      return auth?.isConnected===true&&auth.userId===s.expectedAccountId&&
        b.getBrokerAuthEpoch()===epoch;
    }catch{return false;}
  };
  const lost=(passes:0|1|2=0)=>result(
    'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_DURING_DAY_STOP_REVIEW'],
    {brokerReadPasses:passes});
  const read=async():Promise<ExistingNrmlDayStopEvidence>=>{
    const [order,orderBook,gttOrders,trades]=await Promise.all([
      b.getOrderDetails(s.stopOrderId),b.getOrderBook(),
      b.getGttOrders(),b.getOrderTrades(s.stopOrderId)
    ]);
    if(!same())throw new Error('SESSION_CHANGED');
    const positions=await b.getVerifiedNrmlPositionRows();
    return {order,orderBook,gttOrders,trades,positions};
  };
  if(!same())return lost();
  let first:ExistingNrmlDayStopEvidence;
  try{first=await read();}catch{
    return same()?result('BROKER_SOURCE_INCOMPLETE',
      ['FIRST_DAY_STOP_BROKER_GET_BATCH_FAILED']):lost();
  }
  if(!same())return lost(1);
  const a=auditExistingNrmlDayStop(s,first);
  if(a.state!=='BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION')
    return result(a.state,[...a.reasonCodes],{brokerReadPasses:1});
  let second:ExistingNrmlDayStopEvidence;
  try{second=await read();}catch{
    return same()?result('BROKER_SOURCE_INCOMPLETE',
      ['SECOND_DAY_STOP_BROKER_GET_BATCH_FAILED'],{brokerReadPasses:1}):
      lost(1);
  }
  if(!same())return lost(2);
  const z=auditExistingNrmlDayStop(s,second);
  if(z.state!=='BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION')
    return result(z.state,[...z.reasonCodes],{brokerReadPasses:2});
  // Full exact candidate datasets must not change across passes.
  // Even a harmless reorder is uncertainty, never permission.
  if(JSON.stringify(first)!==JSON.stringify(second))
    return result('DAY_SELL_STOP_STATE_CHANGED_BETWEEN_READS',
      ['NATIVE_ORDER_FILLS_NET_GTT_OR_ACCOUNT_CENSUS_CHANGED'],{
        brokerReadPasses:2
      });
  return result('BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION',
    [...z.reasonCodes],{
      brokerReadPasses:2,sameBrokerSessionAcrossPasses:true,
      nativeSellStopTypeObserved:z.nativeSellStopTypeObserved,
      nativeValidityDayObserved:z.nativeValidityDayObserved,
      brokerReportedExchangeIdObserved:z.brokerReportedExchangeIdObserved,
      brokerReportedOriginalLongQuantity:z.brokerReportedOriginalLongQuantity,
      brokerReportedStopFilledQuantity:z.brokerReportedStopFilledQuantity,
      brokerReportedStopPendingQuantity:z.brokerReportedStopPendingQuantity,
      brokerReportedRemainingLongQuantity:z.brokerReportedRemainingLongQuantity,
      quantityWithoutIndependentlyCertifiedOvernightStop:
        z.quantityWithoutIndependentlyCertifiedOvernightStop
    });
}
