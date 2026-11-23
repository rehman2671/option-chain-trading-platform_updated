/**
 * Adaptive Swing v2 Phase 26 — OFFLINE Upstox read-only response bridge.
 *
 * Only maps locally supplied JSON GET snapshots to the Phase25 pure audit.
 * No HTTP, Upstox SDK, token, broker account access, DB or order side effects.
 * Upstox "D" on NSE_FO/BSE_FO is represented as an NRML-like positional
 * product for STRUCTURAL analysis; it is not independent product verification.
 * Scheduled GTT rules are NOT broker-acknowledged native stops.
 */
import {createHash} from 'node:crypto';
import {
  auditReadOnlyNrmlProtection,
  type ReadOnlyExpectedPosition,type ReadOnlyNrmlAuditPolicy,
  type ReadOnlyNrmlAuditReport,type ReadOnlyBrokerExport,
  type ReadOnlyBrokerOrder,type ReadOnlyBrokerPosition,
  type BrokerOrderState
} from './adaptiveReadOnlyNrmlProtectionAudit.js';

export type UpstoxReadOnlySnapshotPath=
  '/v2/portfolio/short-term-positions'|
  '/v2/order/retrieve-all'|'/v3/order/gtt';
export interface UpstoxReadOnlyCapture {
  method:'GET';
  path:UpstoxReadOnlySnapshotPath;
  /** For GTT, omitting gtt_order_id is required to request ALL active GTTs. */
  unfiltered:true;
  httpStatus:200;
  capturedAt:string;
  response:unknown;
}
export interface OfflineUpstoxCaptureBundle {
  schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1';
  origin:'OPERATOR_SUPPLIED_UNVERIFIED';
  /** Supplied outside of broker JSON. NOT proof of actual account identity. */
  accountScopeId:string;
  positions:UpstoxReadOnlyCapture;
  orders:UpstoxReadOnlyCapture;
  gtts:UpstoxReadOnlyCapture;
}
export interface OfflineUpstoxBridgeReport {
  mode:'OFFLINE_UPSTOX_RESPONSE_BRIDGE';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  nativeOrderInstruction:null;
  status:'REJECTED_CAPTURE'|'BLOCKED_OR_UNKNOWN'|
    'STRUCTURAL_REVIEW_ONLY';
  reasons:string[];
  /** Digest of JSON-serialized snapshots, NOT a signed source/byte witness. */
  snapshotJsonSha256:{
    positions:string|null;orders:string|null;gtts:string|null
  };
  positionsParsed:number;
  ordersParsed:number;
  gttRulesParsed:number;
  phase25:ReadOnlyNrmlAuditReport|null;
  warnings:string[];
}
const warnings=[
  'UPSTOX_JSON_IS_OPERATOR_SUPPLIED_NOT_API_OR_ACCOUNT_AUTHENTICATED',
  'DECLARED_GET_UNFILTERED_AND_CAPTURE_TIMES_ARE_SELF_ASSERTED',
  'GTT_LIST_EXCLUDES_COMPLETED_GTT_HISTORY',
  'GTT_SCHEDULED_OR_PENDING_RULE_IS_NOT_NATIVE_STOP_ACKNOWLEDGEMENT',
  'NRML_D_MAPPING_REQUIRES_INDEPENDENT_BROKER_AND_CONTRACT_REVIEW',
  'GTT_TRIGGER_DOES_NOT_GUARANTEE_EXCHANGE_EXECUTION_OR_FILL',
  'NO_REAL_READ_ONLY_NETWORK_CALL_OR_WRITE_ORDER_PERMISSION',
  'NO_AUTO_POSITIONAL_15_15_SQUARE_OFF'
];
const paths={
  positions:'/v2/portfolio/short-term-positions',
  orders:'/v2/order/retrieve-all',
  gtts:'/v3/order/gtt'
} as const;
const id=(v:unknown):v is string=>
  typeof v==='string'&&v.trim().length>0&&v.length<=256;
const amount=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const record=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const iso=(v:unknown):v is string=>
  typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&
  /(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const product=(v:unknown,key:string):'NRML'|'MIS'|'OTHER'=>
  v==='I'?'MIS':v==='D'&&/^(NSE_FO|BSE_FO)\|/.test(key)?
    'NRML':'OTHER';
const digest=(v:unknown):string=>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const reasonList=(v:string[])=>[...new Set(v)];
const empty=():OfflineUpstoxBridgeReport=>({
  mode:'OFFLINE_UPSTOX_RESPONSE_BRIDGE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,nativeOrderInstruction:null,
  status:'REJECTED_CAPTURE',reasons:[],
  snapshotJsonSha256:{positions:null,orders:null,gtts:null},
  positionsParsed:0,ordersParsed:0,gttRulesParsed:0,phase25:null,warnings
});
function rows(snapshot:UpstoxReadOnlyCapture|undefined,
  path:UpstoxReadOnlySnapshotPath):Record<string,unknown>[]|null{
  if(!snapshot||snapshot.method!=='GET'||snapshot.path!==path||
    snapshot.unfiltered!==true||snapshot.httpStatus!==200||
    !iso(snapshot.capturedAt)||!record(snapshot.response)||
    snapshot.response.status!=='success'||
    !Array.isArray(snapshot.response.data)||
    !snapshot.response.data.every(record))
    return null;
  return snapshot.response.data as Record<string,unknown>[];
}
function nativeState(status:unknown,orderType:unknown,
  filled:number):BrokerOrderState{
  if(status==='complete')return 'FILLED';
  if(status==='cancelled'||status==='cancelled after market order')
    return 'CANCELLED';
  if(status==='rejected')return 'REJECTED';
  if(filled>0)return 'PARTIALLY_FILLED';
  if(status==='trigger pending'&&
    (orderType==='SL'||orderType==='SL-M'))
    return 'ACKNOWLEDGED_TRIGGER_PENDING';
  if(status==='cancel pending')return 'CANCEL_PENDING';
  if(status==='modify pending'||status==='modify validation pending'||
    status==='modify after market order req received')
    return 'REPLACE_PENDING';
  if(status==='open')return 'OPEN';
  // "modified", "not cancelled", "not modified" and pending/unknown
  // transitions CANNOT establish what protection exists now.
  return 'UNKNOWN';
}
function gttState(status:unknown):BrokerOrderState{
  if(status==='COMPLETED')return 'FILLED';
  if(status==='CANCELLED'||status==='EXPIRED')return 'CANCELLED';
  if(status==='FAILED')return 'REJECTED';
  if(status==='TRIGGERED')return 'TRIGGERED';
  // Even SCHEDULED and PENDING must not become native order ACK.
  return 'UNKNOWN';
}
function nativeOrder(
  r:Record<string,unknown>,accountScopeId:string
):ReadOnlyBrokerOrder|null{
  const key=r.instrument_token;
  if(!id(key)||!id(r.order_id)||!amount(r.quantity)||r.quantity===0||
    !amount(r.filled_quantity)||r.filled_quantity>r.quantity||
    !amount(r.pending_quantity)||
    (r.transaction_type!=='BUY'&&r.transaction_type!=='SELL')||
    typeof r.status!=='string'||
    !['SL','SL-M','LIMIT','MARKET'].includes(String(r.order_type))||
    typeof r.product!=='string')return null;
  const s=nativeState(r.status,r.order_type,r.filled_quantity);
  // Upstox pending_quantity is NOT cancelled_quantity. For unresolved orders
  // we must reject non-reconcilable remaining quantity, never invent a cancel.
  if(s!=='FILLED'&&s!=='CANCELLED'&&s!=='REJECTED'&&
    r.pending_quantity!==r.quantity-r.filled_quantity)return null;
  if(s==='FILLED'&&r.filled_quantity!==r.quantity)return null;
  const trigger=r.trigger_price;
  if(typeof trigger!=='number'||!Number.isFinite(trigger)||trigger<0)
    return null;
  return {
    orderId:r.order_id,accountScopeId,instrumentKey:key,
    productType:product(r.product,key),book:'ORDER',
    side:r.transaction_type,
    kind:(r.order_type==='SL'||r.order_type==='SL-M')?
      'NATIVE_STOP':r.order_type==='LIMIT'?'LIMIT':'MARKET',
    status:s,originalQuantity:r.quantity,filledQuantity:r.filled_quantity,
    cancelledQuantity:0,triggerPrice:trigger>0?trigger:null
  };
}
function gttOrders(r:Record<string,unknown>,
  accountScopeId:string,asOf:number
):{orders:ReadOnlyBrokerOrder[];reasons:string[]}|null{
  const key=r.instrument_token;
  if(!id(key)||!id(r.gtt_order_id)||!amount(r.quantity)||
    r.quantity===0||!Array.isArray(r.rules)||!r.rules.length||
    !r.rules.every(record)||!['SINGLE','MULTIPLE'].includes(String(r.type))||
    typeof r.product!=='string')return null;
  const results:ReadOnlyBrokerOrder[]=[];
  const reasons:string[]=[];
  // Upstox sample timestamps are microseconds. Missing or different unit
  // is unknown, NOT proof that a contingent SELL remains valid.
  const exp=r.expires_at;
  const expired=typeof exp==='number'&&Number.isSafeInteger(exp)&&
    exp>100_000_000_000_000&&exp/1000<=asOf;
  const expiryUnknown=!(typeof exp==='number'&&Number.isSafeInteger(exp)&&
    exp>100_000_000_000_000);
  if(expiryUnknown)reasons.push('GTT_EXPIRY_TIMESTAMP_UNKNOWN');
  if(expired)reasons.push('GTT_CONDITIONAL_EXPIRY_PASSED');
  for(const [i,value] of r.rules.entries()){
    const rule=value as Record<string,unknown>;
    if(!['ENTRY','STOPLOSS','TARGET'].includes(String(rule.strategy))||
      !['BUY','SELL'].includes(String(rule.transaction_type))||
      typeof rule.status!=='string'||typeof rule.trigger_price!=='number'||
      !Number.isFinite(rule.trigger_price)||rule.trigger_price<=0||
      !['BELOW','ABOVE','IMMEDIATE'].includes(String(rule.trigger_type)))return null;
    const side=rule.transaction_type as 'BUY'|'SELL';
    const protective=rule.strategy==='STOPLOSS'&&side==='SELL'&&
      rule.trigger_type==='BELOW';
    const state=gttState(rule.status);
    if(state==='UNKNOWN')
      reasons.push('CONTINGENT_GTT_RULE_NOT_BROKER_NATIVE_STOP_ACK');
    if(rule.strategy==='STOPLOSS'&&side==='SELL'&&
      rule.trigger_type!=='BELOW')
      reasons.push('GTT_STOPLOSS_EXIT_DIRECTION_REQUIRES_REVIEW');
    results.push({
      // Each rule counts as a distinct potential order; this deliberately
      // exposes TARGET+STOPLOSS SELL ambiguity to the Phase25 duplicate guard.
      orderId:r.gtt_order_id+'#rule-'+i,
      accountScopeId,instrumentKey:key,productType:product(r.product,key),
      book:'GTT',side,kind:'GTT',
      status:expired||expiryUnknown? 'UNKNOWN':
        (protective?state:state),
      originalQuantity:r.quantity,filledQuantity:0,cancelledQuantity:0,
      triggerPrice:rule.trigger_price
    });
  }
  return {orders:results,reasons};
}
/** Do not expose output of this conversion as authenticated account evidence. */
export function auditOfflineUpstoxReadOnlyCapture(
  expected:ReadOnlyExpectedPosition,bundle:OfflineUpstoxCaptureBundle,
  asOf:string,policy:ReadOnlyNrmlAuditPolicy,recoveryStartedAt?:string
):OfflineUpstoxBridgeReport {
  const base=empty();
  if(!expected||!/^((NSE_FO)|(BSE_FO))\|/.test(expected.instrumentKey)||
    !bundle||bundle.schemaVersion!=='ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1'||
    bundle.origin!=='OPERATOR_SUPPLIED_UNVERIFIED'||
    !id(bundle.accountScopeId)||bundle.accountScopeId!==
      expected.accountScopeId||!iso(asOf))
    return {...base,reasons:['INVALID_CAPTURE_SCOPE_OR_EXPECTED_FO_CONTRACT']};
  const p=rows(bundle.positions,paths.positions),
    o=rows(bundle.orders,paths.orders),g=rows(bundle.gtts,paths.gtts);
  if(!p||!o||!g)
    return {...base,reasons:['MISSING_FAILED_FILTERED_OR_MALFORMED_GET_BOOK']};
  // Never transmit or emit private account keys, raw rows or orders in report.
  const hashes={
    positions:digest(bundle.positions.response),
    orders:digest(bundle.orders.response),
    gtts:digest(bundle.gtts.response)
  };
  const positions:ReadOnlyBrokerPosition[]=[];
  for(const row of p){
    const key=row.instrument_token;
    if(!id(key)||typeof row.product!=='string'||
      !Number.isSafeInteger(row.quantity))
      return {...base,reasons:['UNMAPPABLE_RAW_POSITION_ROW'],
        snapshotJsonSha256:hashes};
    if(key!==expected.instrumentKey)continue;
    positions.push({
      accountScopeId:bundle.accountScopeId,instrumentKey:key,
      productType:product(row.product,key),
      // Upstox short-term positions do not independently include expiry,
      // lotSize or verified instrument subtype: these come ONLY from the
      // separate expected metadata and require independent source review.
      expiry:expected.expiry,lotSize:expected.lotSize,
      netQuantity:row.quantity as number
    });
  }
  const orders:ReadOnlyBrokerOrder[]=[];
  for(const row of o){
    const x=nativeOrder(row,bundle.accountScopeId);
    if(!x)return {...base,reasons:['UNMAPPABLE_OR_NONRECONCILABLE_RAW_ORDER'],
      snapshotJsonSha256:hashes};
    orders.push(x);
  }
  const gtts:ReadOnlyBrokerOrder[]=[];
  const bridgeReasons:string[]=[];
  for(const row of g){
    const x=gttOrders(row,bundle.accountScopeId,Date.parse(asOf));
    if(!x)return {...base,reasons:['UNMAPPABLE_RAW_GTT_RULES'],
      snapshotJsonSha256:hashes};
    gtts.push(...x.orders);bridgeReasons.push(...x.reasons);
  }
  const mapped:ReadOnlyBrokerExport={
    source:'UNVERIFIED_OPERATOR_EXPORT',
    positionsComplete:true,ordersComplete:true,gttsComplete:true,
    positionsAt:bundle.positions.capturedAt,
    ordersAt:bundle.orders.capturedAt,gttsAt:bundle.gtts.capturedAt,
    positions,orders,gtts
  };
  const phase25=auditReadOnlyNrmlProtection(
    expected,mapped,asOf,policy,recoveryStartedAt);
  const reasons=reasonList([...bridgeReasons,...phase25.reasons]);
  return {...base,
    status:reasons.length||phase25.status==='INVALID_EVIDENCE'||
      phase25.status==='BLOCKED_OR_UNKNOWN'?'BLOCKED_OR_UNKNOWN':
      'STRUCTURAL_REVIEW_ONLY',
    reasons,snapshotJsonSha256:hashes,
    positionsParsed:p.length,ordersParsed:o.length,gttRulesParsed:gtts.length,
    phase25};
}
