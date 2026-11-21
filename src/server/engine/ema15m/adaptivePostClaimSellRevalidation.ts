/**
 * Phase97: after a durable EXIT_REQUESTED compare-and-swap, check that
 * neither the local position nor the broker's latest read-only view has
 * diverged BEFORE an existing MIS or manually reconciled NRML SELL.
 *
 * These reads are NOT an atomic broker/exchange transaction. A pass never
 * releases live NRML BUYs or guarantees a SELL fill through a market gap.
 * If anything is missing/ambiguous, the claim remains EXIT_REQUESTED and
 * requires an operator / broker reconciler; never auto-retry.
 */
import {assessBrokerRemainingSellQuantity} from './adaptiveLiveSellQuantityGuard.js';
import {assessBrokerSellInterlock,assessGttSellInterlock}
  from './protectiveExitSafety.js';
type Obj=Record<string,unknown>;
const rec=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x);
const nonempty=(x:unknown):x is string=>typeof x==='string'&&x.length>0;
const positive=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonnegative=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
export type ExitRecheckBlocker =
  'DURABLE_EXIT_POSITION_NOT_UNIQUE'|
  'DURABLE_EXIT_CLAIM_NOT_CURRENT'|
  'DURABLE_EXIT_SNAPSHOT_CHANGED_AFTER_CLAIM'|
  'ENTRY_BUY_ATTEMPT_UNVERIFIED_OR_STILL_EXECUTABLE'|
  'BROKER_READ_ONLY_RECHECK_UNAVAILABLE'|
  'BROKER_EXISTING_SELL_NOT_TERMINAL'|
  'BROKER_PENDING_BUY_OR_OTHER_PRODUCT_MAY_CHANGE_NET'|
  'BROKER_GTT_SELL_STILL_EXECUTABLE'|
  'BROKER_NET_CHANGED_AFTER_ORIGINAL_VERIFICATION';
export type ExitRecheckResult =
  |{allowed:true;reason:null;remainingQuantity:number}
  |{allowed:false;reason:ExitRecheckBlocker;remainingQuantity:0};
const reject=(reason:ExitRecheckBlocker):ExitRecheckResult=>({
  allowed:false,reason,remainingQuantity:0
});
export interface ExitLedgerSnapshot{
  id:unknown;
  attemptId:unknown;
  brokerAccountId:unknown;
  brokerInstrumentKey:unknown;
  productType:unknown;
  status:unknown;
  quantity:unknown;
  lotSize:unknown;
  exitFilledQuantity:unknown;
  exitBrokerOrderId:unknown;
}
/** Called twice after CAS: once before and once after network GETs. */
export function assessPostClaimExitJournal(args:{
  original:ExitLedgerSnapshot;
  currentPositions:unknown;
  currentEntryAttempt:unknown;
  requestedRemainingQuantity:number;
}):ExitRecheckResult{
  if(!args||!rec(args.original)||!nonempty(args.original.id)||
     !Array.isArray(args.currentPositions))
    return reject('DURABLE_EXIT_POSITION_NOT_UNIQUE');
  const matching=args.currentPositions.filter(x=>rec(x)&&x.id===args.original.id);
  if(matching.length!==1||!rec(matching[0]))
    return reject('DURABLE_EXIT_POSITION_NOT_UNIQUE');
  const before=args.original,after=matching[0];
  if(after.status!=='EXIT_REQUESTED'||after.exitBrokerOrderId!=null)
    return reject('DURABLE_EXIT_CLAIM_NOT_CURRENT');
  if(!nonempty(before.attemptId)||!nonempty(before.brokerAccountId)||
     !nonempty(before.brokerInstrumentKey)||
     (before.productType!=='MIS'&&before.productType!=='NRML')||
     !positive(before.quantity)||!positive(before.lotSize)||
     !nonnegative(before.exitFilledQuantity)||
     !positive(args.requestedRemainingQuantity)||
     before.quantity-before.exitFilledQuantity!==args.requestedRemainingQuantity||
     before.quantity%before.lotSize!==0||
     args.requestedRemainingQuantity%before.lotSize!==0||
     after.attemptId!==before.attemptId||
     after.brokerAccountId!==before.brokerAccountId||
     after.brokerInstrumentKey!==before.brokerInstrumentKey||
     after.productType!==before.productType||
     after.quantity!==before.quantity||
     after.lotSize!==before.lotSize||
     after.exitFilledQuantity!==before.exitFilledQuantity)
    return reject('DURABLE_EXIT_SNAPSHOT_CHANGED_AFTER_CLAIM');
  const entry=args.currentEntryAttempt;
  if(!rec(entry)||entry.id!==before.attemptId||
     entry.brokerAccountId!==before.brokerAccountId||
     entry.brokerInstrumentKey!==before.brokerInstrumentKey||
     entry.orderStatus!=='FILLED'||
     !nonnegative(entry.filledQuantity)||
     entry.filledQuantity!==before.quantity)
    return reject('ENTRY_BUY_ATTEMPT_UNVERIFIED_OR_STILL_EXECUTABLE');
  return {allowed:true,reason:null,
    remainingQuantity:args.requestedRemainingQuantity};
}
export interface ReadOnlySellRecheckBroker{
  getOrderBook():Promise<unknown>;
  getGttOrders():Promise<unknown>;
  getVerifiedLivePositionQuantity(
    instrumentKey:string,product:'MIS'|'NRML'
  ):Promise<unknown>;
}
/**
 * Read order-book and GTT *after the claim*, then broker net LAST.
 * Missing, thrown, or contradictory responses never become safe empty lists.
 */
export async function reviewPostClaimBrokerSell(
  broker:ReadOnlySellRecheckBroker,
  args:{
    instrumentKey:string;
    product:'MIS'|'NRML';
    originalQuantity:number;
    priorConfirmedSellFills:number;
    lotSize:number;
    requestedRemainingQuantity:number;
  }
):Promise<ExitRecheckResult>{
  if(!args||!nonempty(args.instrumentKey)||
     (args.product!=='MIS'&&args.product!=='NRML')||
     !positive(args.requestedRemainingQuantity))
    return reject('BROKER_READ_ONLY_RECHECK_UNAVAILABLE');
  if(!broker||
     typeof broker.getOrderBook!=='function'||
     typeof broker.getGttOrders!=='function'||
     typeof broker.getVerifiedLivePositionQuantity!=='function')
    return reject('BROKER_READ_ONLY_RECHECK_UNAVAILABLE');
  let orders:unknown,gtts:unknown,net:unknown;
  try{
    orders=await broker.getOrderBook();
    if(assessBrokerSellInterlock(
       orders,args.instrumentKey,args.product).safe!==true)
      return reject('BROKER_EXISTING_SELL_NOT_TERMINAL');
    // The original BUY may be FILLED in the durable journal, yet a new
    // manual/external BUY can remain pending in the broker book and fill
    // after our current position GET. Do not treat current net as fixed.
    const nativeProduct=args.product==='NRML'?'D':'I';
    if(!Array.isArray(orders))
      return reject('BROKER_READ_ONLY_RECHECK_UNAVAILABLE');
    const terminalBuys=new Set([
      'COMPLETE','COMPLETED','CANCELLED','CANCELED','REJECTED','FAILED','EXPIRED'
    ]);
    for(const order of orders){
      if(!rec(order)||typeof order.instrument_token!=='string')
        return reject('BROKER_PENDING_BUY_OR_OTHER_PRODUCT_MAY_CHANGE_NET');
      if(order.instrument_token!==args.instrumentKey)continue;
      if(order.product!==nativeProduct)
        return reject('BROKER_PENDING_BUY_OR_OTHER_PRODUCT_MAY_CHANGE_NET');
      const side=String(order.transaction_type||'').trim().toUpperCase();
      const status=String(order.status||'').trim().toUpperCase();
      if(side!=='BUY'&&side!=='SELL')
        return reject('BROKER_PENDING_BUY_OR_OTHER_PRODUCT_MAY_CHANGE_NET');
      if(side==='BUY'&&!terminalBuys.has(status))
        return reject('BROKER_PENDING_BUY_OR_OTHER_PRODUCT_MAY_CHANGE_NET');
    }
    gtts=await broker.getGttOrders();
    if(assessGttSellInterlock(
       gtts,args.instrumentKey,args.product).safe!==true)
      return reject('BROKER_GTT_SELL_STILL_EXECUTABLE');
    net=await broker.getVerifiedLivePositionQuantity(
      args.instrumentKey,args.product
    );
  }catch{
    return reject('BROKER_READ_ONLY_RECHECK_UNAVAILABLE');
  }
  const sized=assessBrokerRemainingSellQuantity({
    originalPositionQuantity:args.originalQuantity,
    previousConfirmedSellFills:args.priorConfirmedSellFills,
    lotSize:args.lotSize,brokerNetQuantity:net
  });
  if(!sized.allowed||
     sized.remainingQuantity!==args.requestedRemainingQuantity)
    return reject('BROKER_NET_CHANGED_AFTER_ORIGINAL_VERIFICATION');
  return {allowed:true,reason:null,
    remainingQuantity:sized.remainingQuantity};
}
