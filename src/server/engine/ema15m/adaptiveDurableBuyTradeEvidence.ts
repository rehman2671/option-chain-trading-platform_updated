/**
 * Phase101: original option BUY order and unique execution IDs observed
 * through separate Upstox read-only endpoints. This is evidence provenance,
 * NOT an independently signed exchange receipt or live trading permission.
 *
 * Never use placeOrder ACK, summary price alone, or an absent daily order
 * book to claim an original purchase. No BUY/SELL/GTT writes or auto-P&L.
 */
type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const key=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=256;
const uint=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const positive=(x:unknown):x is number=>uint(x)&&x>0;
const price=(x:unknown):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>0&&
  Number.isSafeInteger(Math.round(x*100))&&
  Math.abs(x*100-Math.round(x*100))<0.00001;
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
export interface OriginalBuyScope{
  positionId:string;
  accountId:string;
  attemptId:string;
  orderId:string;
  instrumentKey:string;
  product:'MIS'|'NRML';
  originalQuantity:number;
  lotSize:number;
  entryFillPrice:number;
}
export interface BuyTradeReceipt{
  tradeId:string;
  exchangeOrderId:string;
  quantity:number;
  price:number;
}
export interface PreparedBuyTradeEvidence{
  positionId:string;
  accountId:string;
  attemptId:string;
  orderId:string;
  instrumentKey:string;
  product:'MIS'|'NRML';
  exchangeOrderId:string;
  originalQuantity:number;
  brokerReportedAveragePrice:number;
  trades:readonly BuyTradeReceipt[];
}
export type BuyTradeEvidenceResult=
  |{ok:true;reason:null;prepared:PreparedBuyTradeEvidence}
  |{ok:false;reason:string;prepared:null};
export const validateOriginalBuyTradeEvidence=(
  s:OriginalBuyScope,
  evidence:{order:unknown;trades:unknown;orderBook:unknown}
):BuyTradeEvidenceResult=>{
  const deny=(reason:string):BuyTradeEvidenceResult=>({
    ok:false,reason,prepared:null
  });
  if(!s||!id(s.positionId)||!id(s.accountId)||!id(s.attemptId)||
     !id(s.orderId)||!key(s.instrumentKey)||
     !['MIS','NRML'].includes(s.product)||
     !positive(s.originalQuantity)||!positive(s.lotSize)||
     s.originalQuantity%s.lotSize!==0||!price(s.entryFillPrice))
    return deny('ORIGINAL_BUY_SCOPE_OR_WHOLE_LOT_INVALID');
  if(!evidence||!obj(evidence.order)||!Array.isArray(evidence.trades)||
     !Array.isArray(evidence.orderBook))
    return deny('ORIGINAL_BUY_BROKER_DETAILS_TRADES_OR_BOOK_MISSING');
  const order=evidence.order,native=s.product==='NRML'?'D':'I';
  if(order.order_id!==s.orderId||
     order.instrument_token!==s.instrumentKey||
     order.product!==native||upper(order.transaction_type)!=='BUY'||
     !id(order.exchange_order_id)||order.quantity!==s.originalQuantity||
     order.filled_quantity!==s.originalQuantity||
     order.pending_quantity!==0||
     !['COMPLETE','COMPLETED','FILLED'].includes(upper(order.status)))
    return deny('ORIGINAL_BUY_CHILD_NOT_FULLY_FILLED_OR_SCOPE_MISMATCH');
  if(!price(order.average_price)||
     Math.abs(order.average_price-s.entryFillPrice)>0.011)
    return deny('ORIGINAL_BUY_ORDER_AVERAGE_DISAGREES_WITH_DURABLE_ENTRY');
  const candidates=evidence.orderBook.filter(x=>obj(x)&&
    x.order_id===s.orderId);
  if(candidates.length!==1||!obj(candidates[0])||
     candidates[0].instrument_token!==s.instrumentKey||
     candidates[0].product!==native||
     upper(candidates[0].transaction_type)!=='BUY'||
     candidates[0].quantity!==s.originalQuantity||
     candidates[0].filled_quantity!==s.originalQuantity||
     candidates[0].pending_quantity!==0||
     !['COMPLETE','COMPLETED','FILLED'].includes(upper(candidates[0].status))||
     candidates[0].exchange_order_id!==order.exchange_order_id)
    return deny('ORIGINAL_BUY_ORDER_BOOK_CHILD_NOT_UNIQUE_OR_CONSISTENT');
  // Another SAME CONTRACT order can change account net independently of
  // the saved original BUY. Full account-wide trades are still unverified.
  const terminal=new Set(['COMPLETE','COMPLETED','FILLED','CANCELLED',
    'CANCELED','REJECTED','FAILED','EXPIRED']);
  for(const candidate of evidence.orderBook){
    if(!obj(candidate)||typeof candidate.instrument_token!=='string')
      return deny('ORIGINAL_BUY_ORDER_BOOK_MALFORMED');
    if(candidate.instrument_token!==s.instrumentKey||
       candidate.order_id===s.orderId)continue;
    if(candidate.product!==native||
       !terminal.has(upper(candidate.status)))
      return deny('OTHER_SAME_CONTRACT_BROKER_ORDER_UNRESOLVED');
    if(upper(candidate.transaction_type)==='SELL'&&
       (!uint(candidate.filled_quantity)||candidate.filled_quantity>0))
      return deny('OTHER_SAME_CONTRACT_SELL_EXECUTION_UNRECONCILED');
  }
  if(evidence.trades.length===0||evidence.trades.length>5000)
    return deny('ORIGINAL_BUY_TRADE_SET_EMPTY_OR_TRUNCATED');
  const seen=new Set<string>();const trades:BuyTradeReceipt[]=[];
  let sum=0,amountPaise=0;
  for(const raw of evidence.trades){
    if(!obj(raw)||!id(raw.trade_id)||seen.has(raw.trade_id)||
       raw.order_id!==s.orderId||
       raw.exchange_order_id!==order.exchange_order_id||
       raw.instrument_token!==s.instrumentKey||
       raw.product!==native||
       upper(raw.transaction_type)!=='BUY'||
       !positive(raw.quantity)||!price(raw.average_price))
      return deny('ORIGINAL_BUY_TRADE_ID_SIDE_OR_PRICE_CONFLICT');
    seen.add(raw.trade_id);
    trades.push({
      tradeId:raw.trade_id,exchangeOrderId:raw.exchange_order_id,
      quantity:raw.quantity,price:raw.average_price
    });
    sum+=raw.quantity;
    amountPaise+=Math.round(raw.average_price*100)*raw.quantity;
    if(!Number.isSafeInteger(sum)||!Number.isSafeInteger(amountPaise))
      return deny('ORIGINAL_BUY_TRADE_QUANTITY_OR_AMOUNT_OVERFLOW');
  }
  if(sum!==s.originalQuantity)
    return deny('ORIGINAL_BUY_TRADE_QUANTITY_NOT_EQUAL_TO_FILLED_ENTRY');
  // Average of individual fills can differ from the broker's rounded
  // displayed price by <=1 paise; stronger proof requires actual receipts.
  const weightedPaise=Math.round(amountPaise/s.originalQuantity);
  if(Math.abs(weightedPaise-Math.round(order.average_price*100))>1||
     Math.abs(weightedPaise-Math.round(s.entryFillPrice*100))>1)
    return deny('ORIGINAL_BUY_WEIGHTED_TRADES_NOT_MATCHING_ENTRY_PRICE');
  trades.sort((a,b)=>a.tradeId.localeCompare(b.tradeId));
  return {ok:true,reason:null,prepared:{
    positionId:s.positionId,accountId:s.accountId,attemptId:s.attemptId,
    orderId:s.orderId,instrumentKey:s.instrumentKey,product:s.product,
    exchangeOrderId:order.exchange_order_id,
    originalQuantity:s.originalQuantity,
    brokerReportedAveragePrice:order.average_price,trades
  }};
};
/** Only broker GETs, never mutates orders or P&L. */
export async function fetchOriginalBuyTradeEvidenceReadOnly(broker:{
  getOrderDetails:(id:string)=>Promise<unknown>;
  getOrderTrades:(id:string)=>Promise<unknown>;
  getOrderBook:()=>Promise<unknown>;
},scope:OriginalBuyScope):Promise<BuyTradeEvidenceResult>{
  if(!broker||typeof broker.getOrderDetails!=='function'||
     typeof broker.getOrderTrades!=='function'||
     typeof broker.getOrderBook!=='function')
    return {ok:false,prepared:null,reason:'BROKER_BUY_READ_ONLY_METHOD_UNAVAILABLE'};
  let order:unknown,trades:unknown,orderBook:unknown;
  try{
    [order,trades,orderBook]=await Promise.all([
      broker.getOrderDetails(scope.orderId),
      broker.getOrderTrades(scope.orderId),
      broker.getOrderBook()
    ]);
  }catch{
    return {ok:false,prepared:null,reason:'BROKER_BUY_GET_FAILED'};
  }
  return validateOriginalBuyTradeEvidence(scope,{order,trades,orderBook});
}
