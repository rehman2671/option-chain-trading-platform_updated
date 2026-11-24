/** Read-only reconciliation: no order placement, retry or closure authority. */
import { brokerNumber } from './brokerAccountRiskEvidence.js';
type Row=Record<string,unknown>;
const row=(v:unknown):Row|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Row:null;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(v);
export interface OrderIntentEvidence {
  orderId:string; instrumentKey:string; product:'I'|'D';
  side:'BUY'|'SELL'; quantity:number; tag:string;
}
export interface OrderEvidence {
  status:'UNKNOWN'|'ACKNOWLEDGED'|'PARTIAL_OPEN'|'FILLED'|'TERMINAL_PARTIAL'|'TERMINAL_NO_FILL';
  reason:string; filledQuantity:number|null; pendingQuantity:number|null;
  averagePrice:number|null; terminal:boolean; retryAuthorized:false;
  verifiedIntent:Readonly<OrderIntentEvidence>|null;
}
const unknown=(reason:string):OrderEvidence=>({status:'UNKNOWN',reason,filledQuantity:null,pendingQuantity:null,averagePrice:null,terminal:false,retryAuthorized:false,verifiedIntent:null});
export function validOrderIntent(i:OrderIntentEvidence):boolean{
  return !!i&&id(i.orderId)&&/^(NSE_FO|BSE_FO)\|[0-9]+$/.test(i.instrumentKey)&&
    ['I','D'].includes(i.product)&&['BUY','SELL'].includes(i.side)&&
    Number.isSafeInteger(i.quantity)&&i.quantity>0&&
    typeof i.tag==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(i.tag);
}
/** Both order details and per-trade executions must agree. Missing/contradictory
 * data is UNKNOWN, not a rejection or zero fill. No invented order identity. */
export function reconcileOrderEvidence(i:OrderIntentEvidence,detail:unknown,trades:unknown):OrderEvidence{
  if(!validOrderIntent(i))return unknown('INTENT_IDENTITY_INVALID');
  const d=row(detail);
  if(!d||d.order_id!==i.orderId||d.instrument_token!==i.instrumentKey||d.product!==i.product||
    d.transaction_type!==i.side||d.tag!==i.tag||d.quantity!==i.quantity)return unknown('ORDER_IDENTITY_UNVERIFIED');
  const filled=d.filled_quantity,pending=d.pending_quantity;
  if(typeof filled!=='number'||!Number.isSafeInteger(filled)||filled<0||filled>i.quantity||
     typeof pending!=='number'||!Number.isSafeInteger(pending)||pending<0||filled+pending>i.quantity)return unknown('INVALID_ORDER_QUANTITIES');
  if(!Array.isArray(trades)||trades.length>5000)return unknown('TRADE_BOOK_UNAVAILABLE');
  let qty=0,value=0;
  const seen=new Set<string>();
  const numericToken=i.instrumentKey.split('|')[1];
  for(const raw of trades){
    const t=row(raw);
    if(!t||t.order_id!==i.orderId||t.product!==i.product||t.transaction_type!==i.side||
      (t.instrument_token!==i.instrumentKey&&t.instrument_token!==numericToken)||
      !id(t.trade_id)||seen.has(t.trade_id)||!id(t.exchange_order_id))return unknown('TRADE_IDENTITY_UNVERIFIED');
    seen.add(t.trade_id);
    const n=t.quantity,price=brokerNumber(t.average_price);
    if(typeof n!=='number'||!Number.isSafeInteger(n)||n<=0||price===null||price<=0)return unknown('INVALID_TRADE_QUANTITY_OR_PRICE');
    qty+=n;value+=n*price;
    if(!Number.isSafeInteger(qty)||qty>i.quantity||!Number.isFinite(value))return unknown('TRADE_TOTAL_INVALID');
  }
  if(qty!==filled)return unknown('ORDER_TRADE_QUANTITY_MISMATCH');
  const avg=filled>0?value/filled:null;
  const reported=brokerNumber(d.average_price);
  if(avg!==null&&(reported===null||reported<=0||Math.abs(avg-reported)>0.01))return unknown('ORDER_TRADE_AVERAGE_MISMATCH');
  const status=typeof d.status==='string'?d.status.trim().toUpperCase():'';
  const complete=['COMPLETE','FILLED'].includes(status);
  const cancelled=['CANCELLED','CANCELED','REJECTED'].includes(status);
  const open=['OPEN','PENDING','TRIGGER PENDING','VALIDATION PENDING','PUT ORDER REQ RECEIVED','MODIFY PENDING','OPEN PENDING','CANCEL PENDING'].includes(status);
  let state:OrderEvidence['status'];
  if(complete&&filled===i.quantity&&pending===0)state='FILLED';
  else if(cancelled&&pending===0&&filled<i.quantity)state=filled===0?'TERMINAL_NO_FILL':'TERMINAL_PARTIAL';
  else if(open&&filled+pending===i.quantity&&filled<i.quantity)state=filled===0?'ACKNOWLEDGED':'PARTIAL_OPEN';
  else return unknown('ORDER_STATUS_OR_QUANTITY_INCONSISTENT');
  return {status:state,reason:'Order details and trade executions agree; account exposure not certified.',
    filledQuantity:filled,pendingQuantity:pending,averagePrice:avg,terminal:complete||cancelled,retryAuthorized:false,verifiedIntent:{...i}};
}
export interface RollbackEvidence {
  status:'UNKNOWN'|'RESIDUAL_EXPOSURE'|'OFFSET_FILLS_MATCH'; residualQuantity:number|null;
  reason:string; accountFlatCertified:false; retryAuthorized:false;
}
/** Even matching entry/offset fills do not prove account flat: other orders,
 * positions and pending fills may exist. This function never authorizes an offset. */
export function reconcileRollbackEvidence(entry:OrderIntentEvidence,entryEvidence:OrderEvidence,
  offset:OrderIntentEvidence,offsetEvidence:OrderEvidence):RollbackEvidence{
  const fail=(reason:string):RollbackEvidence=>({status:'UNKNOWN',residualQuantity:null,reason,accountFlatCertified:false,retryAuthorized:false});
  if(!validOrderIntent(entry)||!validOrderIntent(offset)||entry.orderId===offset.orderId||
    entry.tag===offset.tag||entry.instrumentKey!==offset.instrumentKey||entry.product!==offset.product||entry.side===offset.side)return fail('OFFSET_IDENTITY_MISMATCH');
  const matches=(i:OrderIntentEvidence,e:OrderEvidence)=>e.verifiedIntent!==null&&
    e.verifiedIntent.orderId===i.orderId&&e.verifiedIntent.instrumentKey===i.instrumentKey&&
    e.verifiedIntent.product===i.product&&e.verifiedIntent.side===i.side&&
    e.verifiedIntent.tag===i.tag&&e.verifiedIntent.quantity===i.quantity;
  if(!matches(entry,entryEvidence)||!matches(offset,offsetEvidence))return fail('EVIDENCE_INTENT_MISMATCH');
  if(!entryEvidence.terminal||!offsetEvidence.terminal||entryEvidence.filledQuantity===null||offsetEvidence.filledQuantity===null||
    !Number.isSafeInteger(entryEvidence.filledQuantity)||!Number.isSafeInteger(offsetEvidence.filledQuantity)||
    entryEvidence.filledQuantity<0||entryEvidence.filledQuantity>entry.quantity||offsetEvidence.filledQuantity<0||
    offsetEvidence.filledQuantity>offset.quantity)return fail('NONTERMINAL_OR_UNKNOWN_ORDER_OUTCOME');
  const residual=entryEvidence.filledQuantity-offsetEvidence.filledQuantity;
  return {status:residual===0?'OFFSET_FILLS_MATCH':'RESIDUAL_EXPOSURE',residualQuantity:residual,
    reason:'Terminal order fill comparison only; verify authoritative account positions and all outstanding orders.',
    accountFlatCertified:false,retryAuthorized:false};
}
