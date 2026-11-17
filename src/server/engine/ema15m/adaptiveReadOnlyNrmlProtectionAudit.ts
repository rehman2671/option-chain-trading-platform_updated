/**
 * Adaptive v2 Phase 25 — OFFLINE READ-ONLY NRML broker-export structure audit.
 * Accepts operator-supplied UNVERIFIED snapshots, not a live Upstox client.
 * No broker/network/DB imports, no state mutation and NEVER an order instruction.
 * A structurally consistent export does not prove a stop was actually installed.
 */
const MINUTE=60_000;
const DAY=86_400_000;
const parse=(v:unknown):number=>
  typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&
  /(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const id=(v:unknown):v is string=>
  typeof v==='string'&&v.trim().length>0&&v.length<=256;
const qty=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const date=(v:unknown):v is string=>
  typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&
  Number.isFinite(Date.parse(v+'T00:00:00Z'))&&
  new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const distinct=(xs:string[])=>[...new Set(xs)];
const product=(v:unknown)=>['NRML','MIS','OTHER'].includes(String(v));
const isTerminal=(s:BrokerOrderState)=>
  s==='CANCELLED'||s==='FILLED'||s==='REJECTED';

export type BrokerOrderState=
  'ACKNOWLEDGED_TRIGGER_PENDING'|'OPEN'|'PARTIALLY_FILLED'|'TRIGGERED'|
  'CANCEL_PENDING'|'REPLACE_PENDING'|'UNKNOWN'|
  'CANCELLED'|'FILLED'|'REJECTED';
export interface ReadOnlyExpectedPosition {
  accountScopeId:string;
  instrumentKey:string;
  productType:'NRML';
  expiry:string;
  lotSize:number;
  /** Authoritatively EXPECTED net position from a separately reconciled ledger. */
  expectedNetLongQuantity:number;
}
export interface ReadOnlyBrokerPosition {
  accountScopeId:string;instrumentKey:string;
  productType:'NRML'|'MIS'|'OTHER';
  expiry:string;lotSize:number;netQuantity:number;
}
export interface ReadOnlyBrokerOrder {
  orderId:string;accountScopeId:string;instrumentKey:string;
  productType:'NRML'|'MIS'|'OTHER';
  /** Original source book; a GTT may not yet be an exchange order. */
  book:'ORDER'|'GTT';
  side:'BUY'|'SELL';
  kind:'NATIVE_STOP'|'GTT'|'LIMIT'|'MARKET'|'OTHER';
  status:BrokerOrderState;
  originalQuantity:number;filledQuantity:number;cancelledQuantity:number;
  triggerPrice:number|null;
}
export interface ReadOnlyBrokerExport {
  source:'UNVERIFIED_OPERATOR_EXPORT';
  positionsComplete:boolean;ordersComplete:boolean;gttsComplete:boolean;
  positionsAt:string;ordersAt:string;gttsAt:string;
  positions:ReadOnlyBrokerPosition[];
  orders:ReadOnlyBrokerOrder[];
  gtts:ReadOnlyBrokerOrder[];
}
export interface ReadOnlyNrmlAuditPolicy {
  maximumSnapshotAgeMinutes:number;
  maximumCrossBookSkewSeconds:number;
  /** Conservative manual-review buffer, NOT a verified exchange session rule. */
  minCalendarDaysBeforeExpiry:number;
}
export interface ReadOnlyNrmlAuditReport {
  mode:'OFFLINE_READ_ONLY_REVIEW';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  nativeOrderInstruction:null;
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'STRUCTURALLY_CONSISTENT_UNVERIFIED'|'FLAT_UNVERIFIED';
  reasons:string[];
  observedNetQuantity:number|null;
  outstandingSellCount:number;
  apparentMatchingProtectionCount:number;
  warnings:string[];
}
const warnings=[
  'OPERATOR_EXPORT_IS_NOT_INDEPENDENTLY_AUTHENTICATED_BROKER_API_EVIDENCE',
  'CONSISTENT_ORDER_BOOK_AND_GTT_ROWS_DO_NOT_PROVE_NATIVE_STOP_INSTALLED',
  'BROKER_STOP_GTT_TRIGGER_IS_NOT_A_GUARANTEED_FILL',
  'SNAPSHOTS_ARE_NOT_ATOMIC_OR_BROKER_SIGNED',
  'OFFICIAL_EXCHANGE_EXPIRY_SESSION_AND_LOT_RULES_STILL_REQUIRE_REVIEW',
  'NO_AUTO_NRML_BUY_SELL_AMEND_CANCEL_OR_15_15_POSITIONAL_SQUARE_OFF'
];
const base=():ReadOnlyNrmlAuditReport=>({
  mode:'OFFLINE_READ_ONLY_REVIEW',executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,nativeOrderInstruction:null,
  status:'INVALID_EVIDENCE',reasons:[],observedNetQuantity:null,
  outstandingSellCount:0,apparentMatchingProtectionCount:0,warnings
});
function validOrder(o:ReadOnlyBrokerOrder):boolean{
  return !!o&&id(o.orderId)&&id(o.accountScopeId)&&id(o.instrumentKey)&&
    product(o.productType)&&['ORDER','GTT'].includes(o.book)&&
    ['BUY','SELL'].includes(o.side)&&
    ['NATIVE_STOP','GTT','LIMIT','MARKET','OTHER'].includes(o.kind)&&
    ['ACKNOWLEDGED_TRIGGER_PENDING','OPEN','PARTIALLY_FILLED','TRIGGERED',
     'CANCEL_PENDING','REPLACE_PENDING','UNKNOWN','CANCELLED','FILLED',
     'REJECTED'].includes(o.status)&&
    qty(o.originalQuantity)&&o.originalQuantity>0&&
    qty(o.filledQuantity)&&qty(o.cancelledQuantity)&&
    o.filledQuantity+o.cancelledQuantity<=o.originalQuantity&&
    (o.triggerPrice===null||
      (typeof o.triggerPrice==='number'&&Number.isFinite(o.triggerPrice)&&
       o.triggerPrice>0));
}
function validPosition(p:ReadOnlyBrokerPosition):boolean{
  return !!p&&id(p.accountScopeId)&&id(p.instrumentKey)&&
    product(p.productType)&&date(p.expiry)&&qty(p.lotSize)&&p.lotSize>0&&
    Number.isSafeInteger(p.netQuantity);
}
export function auditReadOnlyNrmlProtection(
  expected:ReadOnlyExpectedPosition,view:ReadOnlyBrokerExport,
  asOf:string,policy:ReadOnlyNrmlAuditPolicy,recoveryStartedAt?:string
):ReadOnlyNrmlAuditReport {
  const r=base(),now=parse(asOf);
  if(!expected||expected.productType!=='NRML'||!id(expected.accountScopeId)||
    !id(expected.instrumentKey)||!date(expected.expiry)||
    !qty(expected.lotSize)||expected.lotSize<=0||
    !qty(expected.expectedNetLongQuantity)||
    expected.expectedNetLongQuantity%expected.lotSize!==0||
    !Number.isFinite(now)||!policy||
    !Number.isFinite(policy.maximumSnapshotAgeMinutes)||
    policy.maximumSnapshotAgeMinutes<=0||
    policy.maximumSnapshotAgeMinutes>60||
    !Number.isFinite(policy.maximumCrossBookSkewSeconds)||
    policy.maximumCrossBookSkewSeconds<0||
    policy.maximumCrossBookSkewSeconds>300||
    !Number.isInteger(policy.minCalendarDaysBeforeExpiry)||
    policy.minCalendarDaysBeforeExpiry<1||
    policy.minCalendarDaysBeforeExpiry>30)
    return {...r,reasons:['INVALID_EXPECTED_POSITION_OR_LOCKED_POLICY']};
  if(!view||view.source!=='UNVERIFIED_OPERATOR_EXPORT'||
    !Array.isArray(view.positions)||!Array.isArray(view.orders)||
    !Array.isArray(view.gtts)||
    view.positions.some(p=>!validPosition(p))||
    view.orders.some(o=>!validOrder(o)||o.book!=='ORDER')||
    view.gtts.some(o=>!validOrder(o)||o.book!=='GTT'))
    return {...r,reasons:['INVALID_UNVERIFIED_BROKER_EXPORT_SCHEMA']};
  const allOrders=[...view.orders,...view.gtts];
  const orderIds=allOrders.map(o=>o.orderId);
  if(new Set(orderIds).size!==orderIds.length)
    return {...r,reasons:['DUPLICATE_ORDER_OR_GTT_IDENTIFIER']};
  const reasons:string[]=[];
  const flag=(reason:string)=>{reasons.push(reason);};
  if(!view.positionsComplete||!view.ordersComplete||!view.gttsComplete)
    flag('INCOMPLETE_POSITION_ORDER_OR_GTT_BOOK');
  const times=[parse(view.positionsAt),parse(view.ordersAt),parse(view.gttsAt)];
  const recovered=recoveryStartedAt===undefined?null:parse(recoveryStartedAt);
  if(times.some(t=>!Number.isFinite(t)||t>now||
    now-t>policy.maximumSnapshotAgeMinutes*MINUTE))
    flag('MISSING_STALE_OR_FUTURE_SNAPSHOT_CLOCK');
  if(times.every(Number.isFinite)&&
     Math.max(...times)-Math.min(...times)>
       policy.maximumCrossBookSkewSeconds*1000)
    flag('POSITION_ORDER_GTT_BOOKS_NOT_TIME_COHERENT');
  if(recoveryStartedAt!==undefined&&
    (!Number.isFinite(recovered)||recovered!>now||
     times.some(t=>t<=recovered!)))
    flag('POST_RESTART_FRESH_BOOK_RECONCILIATION_REQUIRED');
  if(view.positions.some(p=>p.accountScopeId!==expected.accountScopeId)||
     allOrders.some(o=>o.accountScopeId!==expected.accountScopeId))
    flag('CROSS_ACCOUNT_ROWS_IN_CLAIMED_COMPLETE_BOOK');
  const matchedPositions=view.positions.filter(p=>
    p.instrumentKey===expected.instrumentKey);
  const sameProduct=matchedPositions.filter(p=>p.productType==='NRML');
  if(matchedPositions.some(p=>p.productType!=='NRML')||
     sameProduct.some(p=>p.expiry!==expected.expiry||
       p.lotSize!==expected.lotSize))
    flag('WRONG_PRODUCT_EXPIRY_OR_LOT_FOR_SELECTED_CONTRACT');
  if(sameProduct.length>1)flag('DUPLICATED_NRML_POSITION_ROWS');
  const observed=sameProduct.length===1?sameProduct[0].netQuantity:
    sameProduct.length===0?0:null;
  if(observed===null||observed<0||
     observed!==expected.expectedNetLongQuantity)
    flag('BROKER_NET_POSITION_MISSING_OR_MISMATCHED');
  const related=allOrders.filter(o=>o.instrumentKey===expected.instrumentKey);
  if(related.some(o=>o.productType!=='NRML'))
    flag('WRONG_PRODUCT_UNRESOLVED_OR_HISTORICAL_ORDER');
  const unresolved=related.filter(o=>!isTerminal(o.status));
  const sells=unresolved.filter(o=>o.side==='SELL');
  if(unresolved.some(o=>o.side==='BUY'))
    flag('UNRESOLVED_NEW_BUY_CAN_CHANGE_POSITION');
  if(unresolved.some(o=>o.status==='UNKNOWN'||
    o.status==='CANCEL_PENDING'||o.status==='REPLACE_PENDING'||
    o.status==='PARTIALLY_FILLED'||o.status==='TRIGGERED'))
    flag('UNKNOWN_CANCEL_REPLACE_TRIGGER_OR_PARTIAL_FILL_STATE');
  if(expected.expectedNetLongQuantity>0&&sells.length!==1)
    flag('EXACTLY_ONE_UNRESOLVED_SELL_REQUIRED');
  if(expected.expectedNetLongQuantity===0&&sells.length)
    flag('ORPHAN_SELL_OR_GTT_FOR_FLAT_POSITION');
  const candidates=sells.filter(o=>
    o.accountScopeId===expected.accountScopeId&&
    o.productType==='NRML'&&
    ((o.book==='ORDER'&&o.kind==='NATIVE_STOP')||
     (o.book==='GTT'&&o.kind==='GTT'))&&
    o.status==='ACKNOWLEDGED_TRIGGER_PENDING'&&
    o.triggerPrice!==null&&o.triggerPrice>0&&
    o.originalQuantity-o.filledQuantity-o.cancelledQuantity===
      expected.expectedNetLongQuantity);
  if(expected.expectedNetLongQuantity>0&&candidates.length!==1)
    flag('NO_SINGLE_ACKNOWLEDGED_MATCHING_REMAINING_NATIVE_PROTECTION');
  const dayInIndia=new Date(now+330*MINUTE).toISOString().slice(0,10);
  const days=(Date.parse(expected.expiry+'T00:00:00Z')-
    Date.parse(dayInIndia+'T00:00:00Z'))/DAY;
  if(days<=policy.minCalendarDaysBeforeExpiry)
    flag('EXPIRY_PROXIMITY_REQUIRES_MANUAL_EXCHANGE_SESSION_REVIEW');
  return {...r,
    status:reasons.length?'BLOCKED_OR_UNKNOWN':
      expected.expectedNetLongQuantity===0?'FLAT_UNVERIFIED':
      'STRUCTURALLY_CONSISTENT_UNVERIFIED',
    reasons:distinct(reasons),observedNetQuantity:observed,
    outstandingSellCount:sells.length,
    apparentMatchingProtectionCount:candidates.length};
}
