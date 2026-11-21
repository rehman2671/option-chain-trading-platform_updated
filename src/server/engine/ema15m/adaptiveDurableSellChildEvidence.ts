/**
 * Phase99: canonical immutable broker-REPORTED SELL executions for private
 * SQLite evidence journal. A source order placement ACK is never an execution.
 *
 * This module only validates/normalises broker observations; production
 * writes occur solely through an explicit superadmin evidence-capture action.
 * No automatic position closure/P&L, order retry, NRML BUY or broker mutation.
 */
import {
  auditBrokerExitFillEvidence,
  type ExitFillReviewRequest,
  type ExitFillBrokerEvidence
} from './adaptiveLiveExitSettlementAudit.js';

type Raw=Record<string,unknown>;
const obj=(x:unknown):x is Raw=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(x);
const quantity=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const positive=(x:unknown):x is number=>quantity(x)&&x>0;
const price=(x:unknown):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>0;
const up=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
export interface PreparedSellTrade{
  tradeId:string;
  exchangeOrderId:string;
  quantity:number;
  price:number;
}
export interface PreparedSellChild{
  positionId:string;
  accountId:string;
  instrumentKey:string;
  product:'MIS'|'NRML';
  orderId:string;
  exchangeOrderId:string;
  requestedQuantity:number;
  filledQuantity:number;
  pendingQuantity:number;
  currentNetQuantity:number;
  brokerStatus:string;
  trades:readonly PreparedSellTrade[];
}
export type PrepareSellEvidenceResult=
  |{ok:true;prepared:PreparedSellChild;reason:null}
  |{ok:false;prepared:null;reason:string};
/**
 * Must be passed the exact original child order requested quantity from a
 * DURABLE source, not the current editable cumulative exit-filled value.
 */
export function prepareDurableSellChildEvidence(
  source:{
    positionId:unknown;
    accountId:unknown;
    request:ExitFillReviewRequest;
    evidence:ExitFillBrokerEvidence;
  }
):PrepareSellEvidenceResult{
  const fail=(reason:string):PrepareSellEvidenceResult=>({
    ok:false,prepared:null,reason
  });
  if(!source||!id(source.positionId)||!id(source.accountId)||
     !source.request||!source.evidence)
    return fail('INVALID_DURABLE_CHILD_JOURNAL_SCOPE');
  // The Phase98 full independent GET cross-check is mandatory, including
  // broker net, child details, current order-book, trade IDs and prices.
  const reviewed=auditBrokerExitFillEvidence(source.request,source.evidence);
  if(reviewed.state!=='BROKER_REPORTED_EXIT_LIFECYCLE_OBSERVATION_NOT_CERTIFIED')
    return fail('BROKER_CHILD_EVIDENCE_INCOMPLETE_OR_CONFLICTED');
  const e=source.evidence,order=e.order;
  if(!obj(order)||!Array.isArray(e.trades)||
     !id(order.exchange_order_id)||!quantity(order.filled_quantity)||
     !quantity(order.pending_quantity)||!positive(order.quantity)||
     !quantity(e.brokerNetAfterTrades))
    return fail('BROKER_CHILD_SOURCE_FIELDS_INVALID');
  const expected=source.request;
  if(order.order_id!==expected.orderId||
     order.instrument_token!==expected.instrumentKey||
     order.product!==(expected.product==='NRML'?'D':'I')||
     up(order.transaction_type)!=='SELL'||
     order.quantity!==expected.requestedSellQuantity)
    return fail('BROKER_CHILD_SCOPE_MISMATCH');
  const trades:PreparedSellTrade[]=[];
  const seen=new Set<string>();
  for(const t of e.trades){
    if(!obj(t)||!id(t.trade_id)||seen.has(t.trade_id)||
       !positive(t.quantity)||!price(t.average_price)||
       t.order_id!==expected.orderId||
       t.exchange_order_id!==order.exchange_order_id||
       up(t.transaction_type)!=='SELL'||
       (t.product!==undefined&&t.product!==order.product)||
       (typeof t.instrument_token==='string'&&
        t.instrument_token.includes('|')&&
        t.instrument_token!==expected.instrumentKey))
      return fail('BROKER_TRADE_ID_QUANTITY_PRICE_OR_LINEAGE_CONFLICT');
    seen.add(t.trade_id);
    trades.push({
      tradeId:t.trade_id,
      exchangeOrderId:order.exchange_order_id,
      quantity:t.quantity,
      price:t.average_price
    });
  }
  trades.sort((a,b)=>a.tradeId.localeCompare(b.tradeId));
  const total=trades.reduce((n,t)=>n+t.quantity,0);
  if(!Number.isSafeInteger(total)||total!==order.filled_quantity||
     order.filled_quantity>order.quantity)
    return fail('BROKER_TRADE_SUM_NOT_EQUAL_TO_CHILD_EXECUTED_QUANTITY');
  return {ok:true,reason:null,prepared:{
    positionId:source.positionId,accountId:source.accountId,
    instrumentKey:expected.instrumentKey,
    product:expected.product,orderId:expected.orderId,
    exchangeOrderId:order.exchange_order_id,
    requestedQuantity:expected.requestedSellQuantity,
    filledQuantity:order.filled_quantity,
    pendingQuantity:order.pending_quantity,
    currentNetQuantity:e.brokerNetAfterTrades,
    brokerStatus:up(order.status),
    trades
  }};
}
/** Pure shadow evaluator for DB append-only, exact-trade idempotence.
 * All previously stored trade IDs must be present and byte-for-byte
 * semantically identical on replay. This never gives live order permission.
 */
export function assessDurableSellEvidenceReplay(
  prior:readonly PreparedSellTrade[],
  incoming:readonly PreparedSellTrade[],
  earlierFilledQuantity:number,
  newFilledQuantity:number
):{accept:boolean;reason:string;newTrades:number}{
  const deny=(reason:string)=>({accept:false,reason,newTrades:0});
  if(!Array.isArray(prior)||!Array.isArray(incoming)||
     !quantity(earlierFilledQuantity)||!quantity(newFilledQuantity))
    return deny('DURABLE_TRADE_REPLAY_INVALID');
  if(newFilledQuantity<earlierFilledQuantity)
    return deny('BROKER_CHILD_CUMULATIVE_FILL_REGRESSED');
  const priorIds=new Map<string,PreparedSellTrade>();
  const incomingIds=new Map<string,PreparedSellTrade>();
  for(const t of prior){
    if(!id(t.tradeId)||!id(t.exchangeOrderId)||
       !positive(t.quantity)||!price(t.price)||priorIds.has(t.tradeId))
      return deny('DURABLE_EXISTING_TRADE_LEDGER_INVALID');
    priorIds.set(t.tradeId,t);
  }
  for(const t of incoming){
    if(!id(t.tradeId)||!id(t.exchangeOrderId)||
       !positive(t.quantity)||!price(t.price)||incomingIds.has(t.tradeId))
      return deny('BROKER_NEW_TRADE_LEDGER_INVALID');
    incomingIds.set(t.tradeId,t);
  }
  for(const [tid,stored] of priorIds){
    const now=incomingIds.get(tid);
    if(!now)return deny('PREVIOUSLY_OBSERVED_BROKER_TRADE_MISSING_ON_REPLAY');
    if(now.quantity!==stored.quantity||
       now.price!==stored.price||
       now.exchangeOrderId!==stored.exchangeOrderId)
      return deny('REPLAYED_TRADE_ID_CHANGED_EXECUTION_EVIDENCE');
  }
  const total=[...incomingIds.values()].reduce((sum,t)=>sum+t.quantity,0);
  if(!Number.isSafeInteger(total)||total!==newFilledQuantity)
    return deny('BROKER_CUMULATIVE_FILL_NOT_EQUAL_TO_DISTINCT_TRADES');
  return {accept:true,reason:'BROKER_REPORTED_EVIDENCE_ONLY_NOT_SETTLEMENT',
    newTrades:incomingIds.size-priorIds.size};
}
