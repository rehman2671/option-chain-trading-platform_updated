/**
 * Adaptive Swing v2 Phase27 — OFFLINE, READ-ONLY, cross-snapshot NRML lifecycle
 * and same-day trade-book consistency review. No network, broker credentials,
 * DB writes, placement, modification, cancellation or order instructions.
 *
 * IMPORTANT: Every input is OPERATOR-SUPPLIED AND UNAUTHENTICATED. In
 * particular, Upstox v2 order book / day trades do NOT prove overnight
 * protection. A consistent digest chain is NOT a broker signature.
 */
import {createHash} from 'node:crypto';
import {
  auditOfflineUpstoxReadOnlyCapture,
  type OfflineUpstoxCaptureBundle,type OfflineUpstoxBridgeReport
} from './adaptiveUpstoxOfflineReadOnlyBridge.js';
import type {
  ReadOnlyExpectedPosition,ReadOnlyNrmlAuditPolicy
} from './adaptiveReadOnlyNrmlProtectionAudit.js';

export interface OfflineUpstoxDayTradeCapture {
  method:'GET';
  path:'/v2/order/trades/get-trades-for-day';
  unfiltered:true;
  httpStatus:200;
  capturedAt:string;
  response:unknown;
}
export interface OfflineUpstoxLifecycleFrame {
  sequence:number;
  asOf:string;
  expected:ReadOnlyExpectedPosition;
  capture:OfflineUpstoxCaptureBundle;
  trades:OfflineUpstoxDayTradeCapture;
  /** Declared operator local restart time: no independent machine witness. */
  recoveryStartedAt?:string;
}
export interface OfflineUpstoxLifecycleInput {
  schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_LIFECYCLE_V1';
  source:'OPERATOR_SUPPLIED_UNVERIFIED';
  frames:OfflineUpstoxLifecycleFrame[];
  maximumFrameGapMinutes:number;
}
export interface OfflineUpstoxLifecycleReport {
  mode:'OFFLINE_NRML_ORDER_TRADE_LIFECYCLE_REVIEW';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'CHRONOLOGICALLY_CONSISTENT_UNVERIFIED';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  nativeOrderInstruction:null;
  reasons:string[];
  frameCount:number;
  totalDailyTradeRowsLastFrame:number;
  /** Self-computed digests: an editor can regenerate them. NOT authentication. */
  chainHeadSha256:string|null;
  frameStatuses:Array<{sequence:number;phase26Status:
    OfflineUpstoxBridgeReport['status'];tradeRows:number}>;
  warnings:string[];
}
type RawRow=Record<string,unknown>;
type RawOrder={
  orderId:string;status:string;side:'BUY'|'SELL';
  product:string;orderType:string;quantity:number;filled:number;
  trigger:number
};
type RawTrade={
  id:string;orderId:string;product:string;
  side:'BUY'|'SELL';quantity:number;instrument:string
};
const warnings=[
  'OPERATOR_SUPPLIED_JSON_AND_TIMESTAMPS_ARE_UNAUTHENTICATED',
  'UPSTOX_V2_ORDER_BOOK_AND_DAY_TRADES_CANNOT_PROVE_OVERNIGHT_STOP_SURVIVAL',
  'TRADE_BOOK_RECONCILIATION_IS_INTERNALLY_CONSISTENT_NOT_BROKER_ATTESTED',
  'JSON_HASH_CHAIN_IS_RECOMPUTABLE_NOT_SIGNED_NOT_AN_ORIGINAL_BYTE_WITNESS',
  'EFFECTIVE_EXCHANGE_SESSION_EXPIRY_AND_ORDER_VALIDITY_NOT_VERIFIED',
  'NO_NATIVE_BROKER_STOP_PLACEMENT_OR_CANCEL_REPLACE_RECOVERY',
  'NO_NRML_AUTO_EXECUTION_OR_POSITIONAL_15_15_SQUARE_OFF'
];
const record=(v:unknown):v is RawRow=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&v.trim().length>0&&v.length<=256;
const qty=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const timestamp=(v:unknown):number=>
  typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&
    /(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const istDay=(t:number)=>new Date(t+330*60_000).toISOString().slice(0,10);
const unique=(xs:string[])=>[...new Set(xs)];
const sha=(v:unknown)=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
const base=():OfflineUpstoxLifecycleReport=>({
  mode:'OFFLINE_NRML_ORDER_TRADE_LIFECYCLE_REVIEW',
  status:'INVALID_EVIDENCE',executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  nativeOrderInstruction:null,reasons:[],frameCount:0,
  totalDailyTradeRowsLastFrame:0,chainHeadSha256:null,
  frameStatuses:[],warnings
});
function responseRows(c:unknown):RawRow[]|null {
  if(!record(c)||!record(c.response)||
    c.response.status!=='success'||!Array.isArray(c.response.data)||
    !c.response.data.every(record))return null;
  return c.response.data as RawRow[];
}
function parseOrders(c:OfflineUpstoxCaptureBundle,
  instrument:string):Map<string,RawOrder>|null {
  const rows=responseRows(c.orders);
  if(!rows)return null;
  const orders=new Map<string,RawOrder>();
  for(const r of rows){
    if(!id(r.order_id)||!id(r.instrument_token)||
      !['BUY','SELL'].includes(String(r.transaction_type))||
      !qty(r.quantity)||r.quantity===0||
      !qty(r.filled_quantity)||r.filled_quantity>r.quantity||
      typeof r.status!=='string'||typeof r.product!=='string'||
      typeof r.order_type!=='string'||
      typeof r.trigger_price!=='number'||
      !Number.isFinite(r.trigger_price)||r.trigger_price<0)
      return null;
    if(r.instrument_token!==instrument)continue;
    if(orders.has(r.order_id))return null;
    orders.set(r.order_id,{
      orderId:r.order_id,status:r.status,
      side:r.transaction_type as 'BUY'|'SELL',product:r.product,
      orderType:r.order_type,quantity:r.quantity,filled:r.filled_quantity,
      trigger:r.trigger_price
    });
  }
  return orders;
}
function parseTrades(c:OfflineUpstoxDayTradeCapture,
  instrument:string):Map<string,RawTrade>|null {
  const rows=responseRows(c);
  if(!rows)return null;
  const trades=new Map<string,RawTrade>();
  for(const r of rows){
    if(!id(r.trade_id)||!id(r.order_id)||!id(r.instrument_token)||
      !qty(r.quantity)||r.quantity===0||
      typeof r.product!=='string'||
      (r.transaction_type!=='BUY'&&r.transaction_type!=='SELL'))
      return null;
    if(r.instrument_token!==instrument)continue;
    // Within one day duplicate exchange trade IDs cannot be counted twice.
    if(trades.has(r.trade_id))return null;
    trades.set(r.trade_id,{
      id:r.trade_id,orderId:r.order_id,product:r.product,
      side:r.transaction_type,quantity:r.quantity,
      instrument:r.instrument_token
    });
  }
  return trades;
}
function candidateIds(orders:Map<string,RawOrder>):string[] {
  return [...orders.values()].filter(o=>
    o.product==='D'&&o.side==='SELL'&&
    (o.orderType==='SL'||o.orderType==='SL-M')&&
    o.status==='trigger pending'&&o.filled===0&&o.trigger>0)
    .map(o=>o.orderId).sort();
}
function isTerminal(s:string){
  return s==='complete'||s==='cancelled'||s==='rejected';
}
function sameTrade(a:RawTrade,b:RawTrade){
  return a.id===b.id&&a.orderId===b.orderId&&
    a.product===b.product&&a.side===b.side&&
    a.quantity===b.quantity&&a.instrument===b.instrument;
}
/** Pure computation; cannot certify Upstox provenance or source completeness. */
export function auditOfflineUpstoxNrmlLifecycle(
  input:OfflineUpstoxLifecycleInput,policy:ReadOnlyNrmlAuditPolicy
):OfflineUpstoxLifecycleReport {
  const r=base();
  if(!policy||!Number.isFinite(policy.maximumSnapshotAgeMinutes)||
    policy.maximumSnapshotAgeMinutes<=0||policy.maximumSnapshotAgeMinutes>60||
    !Number.isFinite(policy.maximumCrossBookSkewSeconds)||
    policy.maximumCrossBookSkewSeconds<0||
    policy.maximumCrossBookSkewSeconds>300||
    !Number.isInteger(policy.minCalendarDaysBeforeExpiry)||
    policy.minCalendarDaysBeforeExpiry<1||
    policy.minCalendarDaysBeforeExpiry>30)
    return {...r,reasons:['INVALID_LOCKED_PHASE25_POLICY']};
  if(!input||input.schemaVersion!=='ADAPTIVE_UPSTOX_OFFLINE_LIFECYCLE_V1'||
    input.source!=='OPERATOR_SUPPLIED_UNVERIFIED'||
    !Array.isArray(input.frames)||input.frames.length<2||
    input.frames.length>64||
    !Number.isInteger(input.maximumFrameGapMinutes)||
    input.maximumFrameGapMinutes<1||input.maximumFrameGapMinutes>30)
    return {...r,reasons:['INVALID_LIFECYCLE_ENVELOPE_OR_LOCKED_GAP_POLICY']};
  const reasons:string[]=[];
  const flag=(x:string)=>reasons.push(x);
  let invalid=false;
  let previousTime:number|null=null,previousDay:string|null=null,
    previousFrame:OfflineUpstoxLifecycleFrame|null=null,
    previousOrders:Map<string,RawOrder>|null=null,
    previousTrades:Map<string,RawTrade>|null=null;
  let chain='ADAPTIVE_SWING_V2_PHASE27_UNAUTHENTICATED_LOCAL_JSON_CHAIN';
  const frameStatuses:OfflineUpstoxLifecycleReport['frameStatuses']=[];
  let totalDailyTradeRowsLastFrame=0;
  for(const [index,frame] of input.frames.entries()){
    if(!frame||frame.sequence!==index+1||
      !frame.expected||!frame.capture||!frame.trades){
      invalid=true;flag('MISSING_OR_REORDERED_LIFECYCLE_FRAME');break;
    }
    const now=timestamp(frame.asOf);
    if(!Number.isFinite(now)){
      invalid=true;flag('INVALID_LIFECYCLE_FRAME_TIME');break;
    }
    if(previousTime!==null){
      if(now<=previousTime){
        invalid=true;flag('FRAME_CLOCK_NOT_STRICTLY_INCREASING');
      }
      if(now-previousTime>input.maximumFrameGapMinutes*60_000)
        flag('TEMPORAL_EVIDENCE_GAP_EXCEEDS_LOCKED_POLICY');
    }
    const day=istDay(now);
    if(previousDay!==null&&day!==previousDay)
      flag('CROSSED_IST_DAY_BROKER_DAY_BOOK_CANNOT_ATTEST_OVERNIGHT_STOP');
    const bridge=auditOfflineUpstoxReadOnlyCapture(
      frame.expected,frame.capture,frame.asOf,policy,
      frame.recoveryStartedAt);
    if(bridge.status==='REJECTED_CAPTURE'){
      invalid=true;flag('PHASE26_CAPTURE_REJECTED');
    }else if(bridge.status!=='STRUCTURAL_REVIEW_ONLY'){
      flag('PHASE26_SINGLE_FRAME_PROTECTION_BLOCKED');
    }
    const c=frame.trades;
    const tradeTime=timestamp(c.capturedAt);
    const orderTime=timestamp(frame.capture.orders.capturedAt);
    const positionTime=timestamp(frame.capture.positions.capturedAt);
    const gttTime=timestamp(frame.capture.gtts.capturedAt);
    if(c.method!=='GET'||c.path!=='/v2/order/trades/get-trades-for-day'||
      c.unfiltered!==true||c.httpStatus!==200||
      !Number.isFinite(tradeTime)||tradeTime>now||
      now-tradeTime>policy.maximumSnapshotAgeMinutes*60_000||
      !Number.isFinite(orderTime)||!Number.isFinite(positionTime)||
      !Number.isFinite(gttTime)||
      Math.max(tradeTime,orderTime,positionTime,gttTime)-
      Math.min(tradeTime,orderTime,positionTime,gttTime)>
        policy.maximumCrossBookSkewSeconds*1000){
      invalid=true;flag('TRADE_BOOK_NOT_COMPLETE_FRESH_AND_COHERENT');
    }
    if(frame.recoveryStartedAt!==undefined){
      const recovery=timestamp(frame.recoveryStartedAt);
      if(!Number.isFinite(recovery)||recovery>now||
        tradeTime<=recovery)
        flag('POST_RESTART_TRADE_BOOK_RECAPTURE_REQUIRED');
    }
    const rows=responseRows(c);
    const trades=parseTrades(c,frame.expected.instrumentKey);
    const orders=parseOrders(frame.capture,frame.expected.instrumentKey);
    if(!rows||!orders||!trades){
      invalid=true;flag('MALFORMED_DUPLICATED_OR_MISSING_DAY_TRADES_ORDERS');
      break;
    }
    totalDailyTradeRowsLastFrame=rows.length;
    frameStatuses.push({
      sequence:frame.sequence,phase26Status:bridge.status,
      tradeRows:rows.length
    });
    if(rows.some(t=>t.instrument_token===frame.expected.instrumentKey&&
      t.product!=='D'))
      flag('WRONG_PRODUCT_DAY_TRADE_FOR_SELECTED_CONTRACT');
    if(frame.expected.expectedNetLongQuantity<0)
      flag('INVALID_EXPECTED_POSITION');
    // A day trade must be backed by a current-day order-book identity and
    // the order's cumulative filled quantity must be fully trade backed.
    const filledByOrder=new Map<string,number>();
    for(const trade of trades.values()){
      filledByOrder.set(trade.orderId,
        (filledByOrder.get(trade.orderId)??0)+trade.quantity);
      const order=orders.get(trade.orderId);
      if(!order)flag('TRADE_ORDER_ABSENT_FROM_CURRENT_DAY_BOOK');
      else if(order.product!==trade.product||order.side!==trade.side)
        flag('DAY_TRADE_ORDER_IDENTITY_OR_SIDE_DISAGREES');
    }
    for(const order of orders.values()){
      if(order.filled!== (filledByOrder.get(order.orderId)??0))
        flag('ORDER_CUMULATIVE_FILL_NOT_RECONCILED_TO_DAY_TRADES');
    }
    if(previousFrame&&previousOrders&&previousTrades){
      if(frame.capture.accountScopeId!==previousFrame.capture.accountScopeId||
        frame.expected.accountScopeId!==previousFrame.expected.accountScopeId||
        frame.expected.instrumentKey!==previousFrame.expected.instrumentKey||
        frame.expected.expiry!==previousFrame.expected.expiry||
        frame.expected.lotSize!==previousFrame.expected.lotSize)
        flag('ACCOUNT_CONTRACT_OR_EXPIRY_SCOPE_CHANGED_DURING_LIFECYCLE');
      // Clock-progress cannot be manufactured by replaying the very same
      // snapshot: capture timestamps must all advance across frames.
      for(const key of ['positions','orders','gtts'] as const){
        const oldT=timestamp(previousFrame.capture[key].capturedAt);
        const newT=timestamp(frame.capture[key].capturedAt);
        if(!Number.isFinite(oldT)||!Number.isFinite(newT)||newT<=oldT)
          flag('CAPTURE_REPLAY_OR_NON_MONOTONE_BOOK_CLOCK');
      }
      const priorTradeTime=timestamp(previousFrame.trades.capturedAt);
      if(!Number.isFinite(priorTradeTime)||tradeTime<=priorTradeTime)
        flag('CAPTURE_REPLAY_OR_NON_MONOTONE_TRADE_CLOCK');
      // Never claim a valid native stop survived cancel-replace merely
      // because both before/after snapshots happened to look protected.
      const oldProtection=candidateIds(previousOrders),
        newProtection=candidateIds(orders);
      if(JSON.stringify(oldProtection)!==JSON.stringify(newProtection))
        flag('PROTECTIVE_ORDER_ID_ROTATED_OR_DISAPPEARED');
      for(const [orderId,prior] of previousOrders){
        const next=orders.get(orderId);
        if(!next){
          flag('CURRENT_DAY_ORDER_ID_DISAPPEARED');
          continue;
        }
        if(next.filled<prior.filled)flag('CUMULATIVE_FILLED_QUANTITY_REGRESSED');
        if(isTerminal(prior.status)&&!isTerminal(next.status))
          flag('TERMINAL_ORDER_RESURRECTED');
        if(next.quantity!==prior.quantity||next.trigger!==prior.trigger)
          flag('UNVERIFIED_NATIVE_ORDER_QUANTITY_OR_TRIGGER_AMENDMENT');
        if(next.side!==prior.side||next.product!==prior.product||
          next.orderType!==prior.orderType)
          flag('ORDER_IDENTIFIER_REUSED_WITH_DIFFERENT_IDENTITY');
      }
      for(const [tradeId,prior] of previousTrades){
        const next=trades.get(tradeId);
        if(!next)flag('CUMULATIVE_DAY_TRADE_ID_DISAPPEARED');
        else if(!sameTrade(prior,next))
          flag('PREVIOUS_TRADE_ID_MUTATED_OR_REUSED');
      }
      const newTrades=[...trades].filter(([key])=>!previousTrades.has(key))
        .map(([,t])=>t);
      const netByTrades=newTrades.reduce((acc,t)=>
        acc+(t.side==='BUY'?t.quantity:-t.quantity),0);
      if(previousDay===day&&
        frame.expected.expectedNetLongQuantity-
          previousFrame.expected.expectedNetLongQuantity!==netByTrades)
        flag('POSITION_QUANTITY_CHANGE_NOT_EXPLAINED_BY_NEW_DAY_TRADES');
      // Even a properly trade-backed partial stop fill is NOT a stable
      // protected position: Phase26/25 must block it.
    }
    chain=sha([
      chain,frame.sequence,frame.asOf,frame.expected,frame.recoveryStartedAt??null,
      frame.capture.accountScopeId,
      frame.capture.positions.capturedAt,frame.capture.orders.capturedAt,
      frame.capture.gtts.capturedAt,bridge.snapshotJsonSha256,
      c.capturedAt,c.response
    ]);
    previousTime=now;previousDay=day;previousFrame=frame;
    previousOrders=orders;previousTrades=trades;
  }
  return {
    ...r,status:invalid?'INVALID_EVIDENCE':
      reasons.length?'BLOCKED_OR_UNKNOWN':
      'CHRONOLOGICALLY_CONSISTENT_UNVERIFIED',
    reasons:unique(reasons),frameCount:frameStatuses.length,
    totalDailyTradeRowsLastFrame,chainHeadSha256:chain,
    frameStatuses
  };
}
