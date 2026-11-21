/**
 * Phase92: read-only GTT -> generated child order -> exchange reference
 * diagnostic, based on documented Upstox v3 GTT / v2 order details/trades.
 *
 * - GTT quantity is gtt.quantity (NOT rules[].quantity).
 * - GTT SELL STOPLOSS rules[].order_id is null until broker generates a child.
 * - v2 order details order_ref_id should link back to gtt_order_id.
 * - exchange_order_id is broker-REPORTED venue identifier, not guaranteed
 *   execution, sufficient risk protection or independent order ACK proof.
 *
 * Live NRML BUY release gate is intentionally NOT imported or modified here.
 */
type Obj=Record<string,unknown>;
const record=(x:unknown):x is Obj=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const nonEmpty=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=256;
const integer=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
export interface GttChildReviewRequest{
  expectedAccountId:string;
  instrumentKey:string;
  gttOrderId:string;
  expectedLongQuantity:number;
  lotSize:number;
}
export interface GttChildReviewEvidence{
  connectedAccountId:unknown;
  connected:unknown;
  gtt:unknown;
  order:unknown;
  trades:unknown;
  positions:unknown;
  orderBook:unknown;
}
export interface GttChildReviewReport{
  status:'INVALID_REQUEST'|'BROKER_ACCOUNT_UNVERIFIED'|
    'BROKER_SOURCE_INCOMPLETE'|'CHILD_LINEAGE_CONFLICT'|
    'SCHEDULED_GTT_NO_EXCHANGE_CHILD'|
    'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE';
  reasonCodes:readonly string[];
  parentGttFound:boolean;
  scheduledWithoutGeneratedOrder:boolean;
  generatedChildOrderIdObserved:boolean;
  brokerReportedExchangeOrderIdObserved:boolean;
  brokerReportedChildFilledQuantity:number;
  brokerReportedNetLongQuantityMatches:boolean;
  exactGttToChildReferenceMatched:boolean;
  independentExchangeChildAckCertified:false;
  stopFillGuaranteed:false;
  fullAccountRiskReconciled:false;
  brokerSnapshotsAtomic:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
}
type Status=GttChildReviewReport['status'];
const result=(status:Status,reasons:string[],
  data:Partial<O>={}):GttChildReviewReport=>({
  status,reasonCodes:[...new Set(reasons)].sort(),
  parentGttFound:data.parentGttFound===true,
  scheduledWithoutGeneratedOrder:data.scheduledWithoutGeneratedOrder===true,
  generatedChildOrderIdObserved:data.generatedChildOrderIdObserved===true,
  brokerReportedExchangeOrderIdObserved:data.brokerReportedExchangeOrderIdObserved===true,
  brokerReportedChildFilledQuantity:typeof data.brokerReportedChildFilledQuantity==='number'?
    data.brokerReportedChildFilledQuantity:0,
  brokerReportedNetLongQuantityMatches:data.brokerReportedNetLongQuantityMatches===true,
  exactGttToChildReferenceMatched:data.exactGttToChildReferenceMatched===true,
  independentExchangeChildAckCertified:false,
  stopFillGuaranteed:false,fullAccountRiskReconciled:false,
  brokerSnapshotsAtomic:false,liveNrmlBuyAuthorized:false,brokerWrites:0
});
const valid=(r:GttChildReviewRequest):boolean=>
  !!r&&nonEmpty(r.expectedAccountId)&&
  nonEmpty(r.instrumentKey)&&
  nonEmpty(r.gttOrderId)&&r.gttOrderId.startsWith('GTT-')&&
  integer(r.expectedLongQuantity)&&r.expectedLongQuantity>0&&
  integer(r.lotSize)&&r.lotSize>0&&
  r.expectedLongQuantity%r.lotSize===0;
/** Only a unique SELL STOPLOSS child; TARGET is not stop-loss protection. */
function uniqueGttStop(gtt:unknown,r:GttChildReviewRequest):
  {parent:Obj;leg:Obj}|null{
  if(!Array.isArray(gtt)||gtt.length!==1||!record(gtt[0]))return null;
  const parent=gtt[0];
  if(parent.gtt_order_id!==r.gttOrderId||
     parent.instrument_token!==r.instrumentKey||parent.product!=='D'||
     !integer(parent.quantity)||parent.quantity!==r.expectedLongQuantity||
     !Array.isArray(parent.rules))return null;
  const sellStops=parent.rules.filter((x:unknown)=>
    record(x)&&upper(x.transaction_type)==='SELL'&&upper(x.strategy)==='STOPLOSS');
  if(sellStops.length!==1||!record(sellStops[0]))return null;
  return {parent,leg:sellStops[0]};
}
export function auditNrmlGttChildLineage(
  req:GttChildReviewRequest,e:GttChildReviewEvidence
):GttChildReviewReport{
  if(!valid(req))return result('INVALID_REQUEST',['INVALID_EXPECTED_NRML_ACCOUNT_GTT_INSTRUMENT_OR_LOT']);
  if(!e||e.connected!==true||e.connectedAccountId!==req.expectedAccountId)
    return result('BROKER_ACCOUNT_UNVERIFIED',['BROKER_AUTHENTICATED_ACCOUNT_MISMATCH']);
  if(!Array.isArray(e.gtt)||!Array.isArray(e.positions)||
     !Array.isArray(e.orderBook))
    return result('BROKER_SOURCE_INCOMPLETE',['GTT_PORTFOLIO_OR_ORDERBOOK_UNAVAILABLE']);
  const linked=uniqueGttStop(e.gtt,req);
  if(!linked)return result('CHILD_LINEAGE_CONFLICT',
    ['GTT_NOT_UNIQUE_OR_WRONG_ACCOUNT_PRODUCT_INSTRUMENT_PARENT_QUANTITY_STOP_STRATEGY']);
  const {leg}=linked;
  const data:Partial<O>={parentGttFound:true};
  const reasons:string[]=[];
  const matching=e.positions.filter((x:unknown)=>
    record(x)&&x.instrument_token===req.instrumentKey&&x.product==='D');
  if(matching.length!==1||!record(matching[0])||
     Number(matching[0].net_quantity)!==req.expectedLongQuantity){
    reasons.push('BROKER_NRML_NET_POSITION_QUANTITY_NOT_MATCHED');
  }else data.brokerReportedNetLongQuantityMatches=true;
  if(e.positions.some((x:unknown)=>record(x)&&
     x.instrument_token===req.instrumentKey&&x.product!=='D'))
    reasons.push('OTHER_PRODUCT_EXPOSURE_ON_SAME_INSTRUMENT');
  const stopStatus=upper(leg.status),id=leg.order_id;
  const scheduled=new Set(['SCHEDULED','PENDING']);
  const childStates=new Set(['TRIGGERED','OPEN','COMPLETED']);
  if((id===null||id===undefined)&&scheduled.has(stopStatus)){
    data.scheduledWithoutGeneratedOrder=true;
    reasons.push('GTT_SCHEDULED_BROKER_SIDE_NO_EXCHANGE_CHILD');
    return result(reasons.length>1?'CHILD_LINEAGE_CONFLICT':
      'SCHEDULED_GTT_NO_EXCHANGE_CHILD',reasons,data);
  }
  if(!nonEmpty(id)||!childStates.has(stopStatus)){
    reasons.push('GTT_STOP_CHILD_ID_OR_LIFECYCLE_UNRESOLVED');
    return result('CHILD_LINEAGE_CONFLICT',reasons,data);
  }
  data.generatedChildOrderIdObserved=true;
  if(!record(e.order)||!Array.isArray(e.trades))
    return result('BROKER_SOURCE_INCOMPLETE',
      ['GENERATED_CHILD_ORDER_DETAILS_OR_TRADE_BOOK_UNAVAILABLE'],data);
  const o=e.order,qty=o.quantity,fill=o.filled_quantity,
    pending=o.pending_quantity,status=upper(o.status);
  if(o.order_id!==id||o.order_ref_id!==req.gttOrderId||
     o.instrument_token!==req.instrumentKey||o.product!=='D'||
     upper(o.transaction_type)!=='SELL'||
     !integer(qty)||qty!==req.expectedLongQuantity){
    reasons.push('GTT_CHILD_ORDER_REF_ID_PRODUCT_SIDE_CONTRACT_OR_QUANTITY_MISMATCH');
  }else{
    data.exactGttToChildReferenceMatched=true;
  }
  if(!nonEmpty(o.exchange_order_id))
    reasons.push('BROKER_EXCHANGE_ORDER_ID_ABSENT');
  else data.brokerReportedExchangeOrderIdObserved=true;
  const eligibleChildStatuses=new Set([
    'OPEN','TRIGGER PENDING','PARTIALLY FILLED','COMPLETE','COMPLETED',
    'CANCEL PENDING','MODIFY PENDING','REJECTED','CANCELLED','CANCELED'
  ]);
  if(!eligibleChildStatuses.has(status))
    reasons.push('GENERATED_CHILD_ORDER_STATUS_UNRECOGNISED');
  if(['CANCEL PENDING','MODIFY PENDING','REJECTED','CANCELLED','CANCELED'].includes(status))
    reasons.push('GENERATED_CHILD_STOP_NOT_VALID_ACTIVE_PROTECTION');
  if(!integer(fill)||!integer(pending)||!integer(qty)||fill>qty||
     pending>qty||fill+pending>qty){
    reasons.push('CHILD_FILLED_PENDING_QUANTITY_INCONSISTENT');
  }else data.brokerReportedChildFilledQuantity=fill;
  const book=e.orderBook.filter((x:unknown)=>record(x)&&x.order_id===id);
  if(book.length!==1||!record(book[0])||
     book[0].instrument_token!==req.instrumentKey||
     book[0].product!=='D'||upper(book[0].transaction_type)!=='SELL'||
     book[0].order_ref_id!==req.gttOrderId||
     !integer(book[0].quantity)||book[0].quantity!==qty){
    reasons.push('CHILD_ORDER_DETAILS_CONTRADICT_CURRENT_BROKER_ORDER_BOOK');
  }
  // Trade book is a current-day broker observation, not a signed clearing
  // record. Discrepancies are evidence blockers, never extra fills.
  let sum=0;
  const seenTrades=new Set<string>();
  for(const row of e.trades){
    if(!record(row)||row.order_id!==id||
       row.instrument_token!==req.instrumentKey||row.product!=='D'||
       upper(row.transaction_type)!=='SELL'||
       !nonEmpty(row.trade_id)||seenTrades.has(row.trade_id)||
       !integer(row.quantity)||row.quantity<=0||
       row.exchange_order_id!==o.exchange_order_id){
      reasons.push('BROKER_TRADE_BOOK_CONTRADICTS_LINKED_CHILD_ORDER');break;
    }
    seenTrades.add(row.trade_id);sum+=row.quantity;
  }
  if(!integer(fill)||sum!==fill)
    reasons.push('BROKER_CHILD_EXECUTION_SUM_DOES_NOT_MATCH_ORDER_DETAILS');
  // The order book may be stale. No reason-free result certifies future
  // protective stop, original parent exchange ACK or actual filled quantity.
  reasons.push('CHILD_EXCHANGE_REFERENCE_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
  reasons.push('GTT_SNAPSHOT_POSITION_ORDER_TRADES_NOT_ATOMIC');
  return result(reasons.some(x=>![
    'CHILD_EXCHANGE_REFERENCE_REPORTED_NOT_INDEPENDENTLY_VERIFIED',
    'GTT_SNAPSHOT_POSITION_ORDER_TRADES_NOT_ATOMIC'
  ].includes(x))?
    'CHILD_LINEAGE_CONFLICT':
    'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE',reasons,data);
}
export interface ReadOnlyNrmlGttBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getGttOrderDetails(id:string):Promise<unknown>;
  getVerifiedNrmlPositionRows():Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getOrderDetails(id:string):Promise<unknown>;
  getOrderTrades(id:string):Promise<unknown>;
}
export async function reviewNrmlGttChildReadOnly(
  broker:ReadOnlyNrmlGttBroker,request:GttChildReviewRequest
):Promise<GttChildReviewReport>{
  if(!valid(request))return result('INVALID_REQUEST',
    ['INVALID_EXPECTED_NRML_ACCOUNT_GTT_INSTRUMENT_OR_LOT']);
  if(!broker||typeof broker.getLiveConnectionStatus!=='function')
    return result('BROKER_ACCOUNT_UNVERIFIED',['BROKER_CONNECTED_ACCOUNT_UNAVAILABLE']);
  let auth:{isConnected:boolean;userId?:string};
  try{auth=broker.getLiveConnectionStatus();}catch{
    return result('BROKER_ACCOUNT_UNVERIFIED',['BROKER_CONNECTED_ACCOUNT_UNAVAILABLE']);
  }
  if(auth?.isConnected!==true||auth.userId!==request.expectedAccountId)
    return result('BROKER_ACCOUNT_UNVERIFIED',['BROKER_AUTHENTICATED_ACCOUNT_MISMATCH']);
  if(['getGttOrderDetails','getVerifiedNrmlPositionRows','getOrderBook',
      'getOrderDetails','getOrderTrades'].some(k=>
       typeof broker[k as keyof ReadOnlyNrmlGttBroker]!=='function'))
    return result('BROKER_SOURCE_INCOMPLETE',['REQUIRED_BROKER_READ_METHOD_UNAVAILABLE']);
  let gtt:unknown,positions:unknown,orderBook:unknown;
  try{
    [gtt,positions,orderBook]=await Promise.all([
      broker.getGttOrderDetails(request.gttOrderId),
      broker.getVerifiedNrmlPositionRows(),broker.getOrderBook()
    ]);
  }catch{return result('BROKER_SOURCE_INCOMPLETE',['BROKER_READ_ONLY_SOURCE_TRANSPORT_ERROR']);}
  const linked=uniqueGttStop(gtt,request);
  const childId=linked?.leg.order_id;
  let order:unknown=null,trades:unknown=null;
  if(nonEmpty(childId)){
    try{
      [order,trades]=await Promise.all([
        broker.getOrderDetails(childId),broker.getOrderTrades(childId)
      ]);
    }catch{
      return result('BROKER_SOURCE_INCOMPLETE',['BROKER_CHILD_DETAILS_OR_TRADES_TRANSPORT_ERROR'],
        {parentGttFound:true,generatedChildOrderIdObserved:true});
    }
  }
  return auditNrmlGttChildLineage(request,{
    connected:true,connectedAccountId:auth.userId,
    gtt,positions,orderBook,order,trades
  });
}
