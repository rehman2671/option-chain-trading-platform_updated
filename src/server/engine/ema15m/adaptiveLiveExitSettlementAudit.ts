/**
 * Phase98: Upstox placeOrder() is an ORDER SUBMISSION RESPONSE, not an
 * independent execution receipt. Even a response claiming COMPLETE with
 * a price and 100% filled quantity may NOT close a local live position.
 *
 * The read-only follow-up reconciles broker-REPORTED child details/trades,
 * ordinary order book and current portfolio quantity. It never authorises
 * automatic closure, realised P&L, retry, NRML BUY or broker order writes.
 */
type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const ident=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(x);
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonnegative=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
export type ExitPlacementReview =
  |{state:'EXIT_PENDING_NOT_CONFIRMED_FILLED';orderId:string;automaticClosureAuthorized:false}
  |{state:'BROKER_ACK_UNKNOWN_DO_NOT_RETRY';orderId:null;automaticClosureAuthorized:false};
/** Do NOT trust status, filled_quantity or price embedded in placement ACK. */
export function assessExitPlacementAck(response:unknown):ExitPlacementReview{
  if(!obj(response))return {
    state:'BROKER_ACK_UNKNOWN_DO_NOT_RETRY',
    orderId:null,automaticClosureAuthorized:false
  };
  const orderId=response.order_id??response.orderId;
  return ident(orderId)?{
    state:'EXIT_PENDING_NOT_CONFIRMED_FILLED',
    orderId,automaticClosureAuthorized:false
  }:{
    state:'BROKER_ACK_UNKNOWN_DO_NOT_RETRY',
    orderId:null,automaticClosureAuthorized:false
  };
}
export interface ExitFillReviewRequest{
  instrumentKey:string;
  product:'MIS'|'NRML';
  orderId:string;
  requestedSellQuantity:number;
  lotSize:number;
}
export interface ExitFillBrokerEvidence{
  order:unknown;
  trades:unknown;
  orderBook:unknown;
  brokerNetAfterTrades:unknown;
}
export interface ExitFillReviewReport{
  state:'INVALID_EXIT_REVIEW_REQUEST'|'BROKER_EXIT_EVIDENCE_UNAVAILABLE'|
    'BROKER_EXIT_EVIDENCE_CONFLICT'|
    'BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED';
  reasonCodes:readonly string[];
  brokerReportedFilledQuantity:number;
  brokerReportedRemainingLong:number|null;
  distinctBrokerTradeCount:number;
  brokerReportedOrderStatus:'TERMINAL_FILLED'|'PARTIAL_OR_PENDING'|'UNKNOWN';
  exchangeOrderReferenceObserved:boolean;
  sourceEndpointsAtomic:false;
  brokerFillIndependentlyCertified:false;
  automaticClosureAuthorized:false;
  realisedPnlAuthorized:false;
  duplicateSellRetryAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
}
type State=ExitFillReviewReport['state'];
const report=(state:State,reasons:string[],data:Partial<ExitFillReviewReport>={}):
 ExitFillReviewReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  brokerReportedFilledQuantity:data.brokerReportedFilledQuantity??0,
  brokerReportedRemainingLong:data.brokerReportedRemainingLong??null,
  distinctBrokerTradeCount:data.distinctBrokerTradeCount??0,
  brokerReportedOrderStatus:data.brokerReportedOrderStatus??'UNKNOWN',
  exchangeOrderReferenceObserved:data.exchangeOrderReferenceObserved===true,
  sourceEndpointsAtomic:false,brokerFillIndependentlyCertified:false,
  automaticClosureAuthorized:false,realisedPnlAuthorized:false,
  duplicateSellRetryAuthorized:false,liveNrmlBuyAuthorized:false,
  brokerWrites:0
});
const valid=(r:ExitFillReviewRequest):boolean=>
  !!r&&ident(r.orderId)&&typeof r.instrumentKey==='string'&&
  r.instrumentKey.length>0&&r.instrumentKey.length<=256&&
  (r.product==='MIS'||r.product==='NRML')&&
  positive(r.lotSize)&&positive(r.requestedSellQuantity)&&
  r.requestedSellQuantity%r.lotSize===0;
export function auditBrokerExitFillEvidence(
  r:ExitFillReviewRequest,e:ExitFillBrokerEvidence
):ExitFillReviewReport{
  if(!valid(r))
    return report('INVALID_EXIT_REVIEW_REQUEST',['INVALID_ORDER_OR_CONTRACT_OR_WHOLE_LOT_QUANTITY']);
  if(!e||!obj(e.order)||!Array.isArray(e.trades)||
     !Array.isArray(e.orderBook))
    return report('BROKER_EXIT_EVIDENCE_UNAVAILABLE',
      ['CHILD_DETAILS_TRADE_BOOK_OR_ORDER_LIST_UNAVAILABLE']);
  const reasons:string[]=[],o=e.order;
  const product=r.product==='NRML'?'D':'I';
  const qty=o.quantity,filled=o.filled_quantity,pending=o.pending_quantity,
    status=upper(o.status);
  if(o.order_id!==r.orderId||o.instrument_token!==r.instrumentKey||
     o.product!==product||upper(o.transaction_type)!=='SELL'||
     !positive(qty)||qty!==r.requestedSellQuantity)
    reasons.push('EXIT_CHILD_ORDER_ID_CONTRACT_PRODUCT_SIDE_OR_QUANTITY_MISMATCH');
  if(!nonnegative(filled)||!nonnegative(pending)||!positive(qty)||
     filled>qty||pending>qty||filled+pending>qty)
    reasons.push('EXIT_CHILD_FILLED_PENDING_OR_ORIGINAL_QUANTITY_INVALID');
  const terminalFilled=['COMPLETE','COMPLETED','FILLED'].includes(status);
  const terminalOther=['CANCELLED','CANCELED','REJECTED','EXPIRED','FAILED'].includes(status);
  const allowed=['OPEN','PENDING','TRIGGER PENDING','PARTIALLY FILLED',
    'CANCEL PENDING','MODIFY PENDING','COMPLETE','COMPLETED','FILLED',
    'CANCELLED','CANCELED','REJECTED','EXPIRED','FAILED'];
  if(!allowed.includes(status))
    reasons.push('EXIT_CHILD_ORDER_STATUS_UNKNOWN');
  if(terminalFilled&&(!nonnegative(filled)||filled!==qty||pending!==0))
    reasons.push('EXIT_TERMINAL_FILLED_STATUS_CONTRADICTS_QUANTITY');
  if(!terminalFilled&&!terminalOther&&nonnegative(filled)&&
     nonnegative(pending)&&positive(qty)&&filled+pending!==qty)
    reasons.push('EXIT_ACTIVE_CHILD_QUANTITY_NOT_CONSERVED');
  const reference=ident(o.exchange_order_id);
  if(!reference)reasons.push('BROKER_REPORTED_EXCHANGE_ORDER_ID_MISSING');
  const book=e.orderBook.filter(x=>obj(x)&&x.order_id===r.orderId);
  if(book.length!==1||!obj(book[0])||book[0].instrument_token!==r.instrumentKey||
     book[0].product!==product||
     upper(book[0].transaction_type)!=='SELL'||
     book[0].quantity!==qty||
     book[0].filled_quantity!==filled||
     book[0].pending_quantity!==pending||
     upper(book[0].status)!==status||
     book[0].exchange_order_id!==o.exchange_order_id)
    reasons.push('EXIT_CHILD_DETAILS_CONTRADICT_BROKER_ORDER_BOOK');
  // Earlier external/manual SELLs and pending BUYs are not proven absent
  // by a valid child; a conflicting current account order is a blocker.
  for(const other of e.orderBook){
    if(!obj(other)||typeof other.instrument_token!=='string'){
      reasons.push('BROKER_OTHER_ORDER_ROW_UNVERIFIABLE');continue;
    }
    if(other.instrument_token!==r.instrumentKey||other.order_id===r.orderId)
      continue;
    if(other.product!==product){
      reasons.push('SAME_OPTION_OTHER_PRODUCT_BROKER_ORDER_PRESENT');continue;
    }
    const side=upper(other.transaction_type),st=upper(other.status);
    const terminal=['COMPLETE','COMPLETED','FILLED','CANCELLED','CANCELED',
      'REJECTED','EXPIRED','FAILED'];
    if(!['BUY','SELL'].includes(side)||!terminal.includes(st))
      reasons.push('OTHER_SAME_OPTION_ORDER_LIFECYCLE_UNRESOLVED');
    if(side==='SELL'&&!nonnegative(other.filled_quantity))
      reasons.push('OTHER_SAME_OPTION_SELL_FILL_COUNT_UNKNOWN');
    if(side==='SELL'&&nonnegative(other.filled_quantity)&&
       other.filled_quantity>0)
      reasons.push('OTHER_SAME_OPTION_SELL_FILLS_NOT_IN_CHILD_LEDGER');
  }
  let total=0,trades=0;
  const ids=new Set<string>();
  for(const t of e.trades){
    if(!obj(t)||t.order_id!==r.orderId||
       upper(t.transaction_type)!=='SELL'||
       (typeof t.instrument_token==='string'&&
         t.instrument_token.includes('|')&&t.instrument_token!==r.instrumentKey)||
       (t.product!==undefined&&t.product!==product)||
       !ident(t.trade_id)||ids.has(t.trade_id)||
       !positive(t.quantity)||
       !ident(t.exchange_order_id)||t.exchange_order_id!==o.exchange_order_id){
      reasons.push('EXIT_TRADE_ID_SIDE_CONTRACT_OR_EXCHANGE_REFERENCE_CONFLICT');
      break;
    }
    const price=t.average_price;
    if(typeof price!=='number'||!Number.isFinite(price)||price<=0){
      reasons.push('EXIT_TRADE_EXECUTION_PRICE_UNKNOWN');break;
    }
    ids.add(t.trade_id);
    total+=t.quantity;trades++;
    if(!Number.isSafeInteger(total)||total>r.requestedSellQuantity){
      reasons.push('EXIT_TRADE_TOTAL_EXCEEDS_CHILD_REQUESTED_QUANTITY');break;
    }
  }
  if(!nonnegative(filled)||total!==filled)
    reasons.push('EXIT_CHILD_TOTAL_BROKER_TRADES_NOT_MATCHING_EXECUTION_COUNT');
  const net=e.brokerNetAfterTrades;
  if(!nonnegative(net))
    reasons.push('POST_TRADE_BROKER_NET_MISSING_OR_UNTRUSTWORTHY');
  else if(!nonnegative(filled)||net!==r.requestedSellQuantity-filled)
    reasons.push('POST_TRADE_BROKER_NET_DISAGREES_WITH_SELL_REMAINDER');
  const data:Partial<ExitFillReviewReport>={
    brokerReportedFilledQuantity:nonnegative(filled)?filled:0,
    brokerReportedRemainingLong:nonnegative(net)?net:null,
    distinctBrokerTradeCount:trades,
    brokerReportedOrderStatus:terminalFilled?'TERMINAL_FILLED':
      allowed.includes(status)?'PARTIAL_OR_PENDING':'UNKNOWN',
    exchangeOrderReferenceObserved:reference
  };
  // A perfect-looking current broker packet is only descriptive.
  // There is no independently signed venue execution receipt and no
  // automatic persisted P&L/closure permission.
  return report(reasons.length?'BROKER_EXIT_EVIDENCE_CONFLICT':
    'BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED',
    reasons.length?reasons:['BROKER_SOURCE_NOT_ATOMIC_OR_INDEPENDENTLY_CERTIFIED'],data);
}
export interface ReadOnlyExitFillBroker{
  getOrderDetails(id:string):Promise<unknown>;
  getOrderTrades(id:string):Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getVerifiedLivePositionQuantity(
    instrumentKey:string,product:'MIS'|'NRML'
  ):Promise<unknown>;
}
export async function reviewBrokerExitFillReadOnly(
  broker:ReadOnlyExitFillBroker,r:ExitFillReviewRequest
):Promise<ExitFillReviewReport>{
  if(!valid(r))return report('INVALID_EXIT_REVIEW_REQUEST',
    ['INVALID_ORDER_OR_CONTRACT_OR_WHOLE_LOT_QUANTITY']);
  if(!broker||['getOrderDetails','getOrderTrades','getOrderBook',
    'getVerifiedLivePositionQuantity'].some(k=>
      typeof broker[k as keyof ReadOnlyExitFillBroker]!=='function'))
    return report('BROKER_EXIT_EVIDENCE_UNAVAILABLE',['BROKER_READ_ONLY_METHOD_UNAVAILABLE']);
  let order:unknown,trades:unknown,orderBook:unknown,brokerNetAfterTrades:unknown;
  try{
    [order,trades,orderBook]=await Promise.all([
      broker.getOrderDetails(r.orderId),
      broker.getOrderTrades(r.orderId),
      broker.getOrderBook()
    ]);
    // Query latest net AFTER child fills; reduces but never closes race.
    brokerNetAfterTrades=await broker.getVerifiedLivePositionQuantity(
      r.instrumentKey,r.product);
  }catch{
    return report('BROKER_EXIT_EVIDENCE_UNAVAILABLE',['BROKER_READ_ONLY_TRANSPORT_OR_PARSE_FAILURE']);
  }
  return auditBrokerExitFillEvidence(r,{
    order,trades,orderBook,brokerNetAfterTrades
  });
}
