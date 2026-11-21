/**
 * Phase91: read-only broker-authoritative NRML position, SELL-order and
 * untriggered GTT visibility. It never submits, amends or cancels any order.
 *
 * A GTT instruction is NOT a child exchange ACK, and v2 portfolio / order
 * book / v3 GTT endpoints are NOT an atomic simultaneous snapshot.
 * Therefore even ideal candidate evidence NEVER releases live NRML BUYs.
 */
export type NrmlReviewState=
  'INVALID_REVIEW_REQUEST'|'BROKER_SCOPE_UNAVAILABLE'|
  'BROKER_EVIDENCE_INCOMPLETE'|'BROKER_STATE_CONFLICT'|
  'DESCRIPTIVE_NRML_BROKER_OBSERVATIONS_ONLY_NOT_PROTECTED';

export interface NrmlBrokerReviewRequest{
  expectedAccountId:string;
  instrumentKey:string;
  expectedLongQuantity:number;
  lotSize:number;
}
export interface NrmlBrokerEvidence{
  accountId:unknown;
  connected:unknown;
  positions:unknown;
  orderBook:unknown;
  gttOrders:unknown;
}
export interface NrmlBrokerReviewReport{
  mode:'READ_ONLY_NRML_BROKER_RECONCILIATION_NOT_EXECUTION';
  status:NrmlReviewState;
  reasonCodes:string[];
  nrmlNetQuantityMatchesExpected:boolean;
  activeSellOrderCandidates:number;
  activeGttSellRuleCandidates:number;
  duplicateOrUnresolvedSellProtection:boolean;
  sourceEndpointsAtomic:false;
  protectiveChildExchangeAckVerified:false;
  realBrokerStopFillGuaranteed:false;
  liveNrmlBuyAuthorized:false;
  ordersPlacedOrCancelled:0;
}
type O=Record<string,unknown>;
const obj=(x:unknown):x is O=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const positiveInt=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const productCode=(x:unknown)=>x==='D'||x==='I';
const text=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0;
const asUpper=(x:unknown):string=>
  typeof x==='string'?x.trim().toUpperCase():'';
const activeStatus=new Set([
  'OPEN','PENDING','TRIGGER PENDING','VALIDATION PENDING',
  'PUT ORDER REQ RECEIVED','MODIFY PENDING','CANCEL PENDING',
  'UNKNOWN','NOT TRIGGERED','ACTIVE','SCHEDULED','TRIGGERED'
]);
const completedStatus=new Set([
  'COMPLETE','COMPLETED','CANCELLED','CANCELED','REJECTED','EXPIRED',
  'FAILED','INACTIVE'
]);
const deny=(status:NrmlReviewState,reasons:string[],
  netMatches=false,sells=0,gtts=0,duplicate=false
):NrmlBrokerReviewReport=>({
  mode:'READ_ONLY_NRML_BROKER_RECONCILIATION_NOT_EXECUTION',
  status,reasonCodes:[...new Set(reasons)].sort(),
  nrmlNetQuantityMatchesExpected:netMatches,
  activeSellOrderCandidates:sells,activeGttSellRuleCandidates:gtts,
  duplicateOrUnresolvedSellProtection:duplicate,
  sourceEndpointsAtomic:false,
  protectiveChildExchangeAckVerified:false,
  realBrokerStopFillGuaranteed:false,
  liveNrmlBuyAuthorized:false,ordersPlacedOrCancelled:0
});

/** Strict, sanitized review. Does not echo account, keys, raw broker rows or order IDs. */
export function auditNrmlBrokerEvidence(
  request:NrmlBrokerReviewRequest,evidence:NrmlBrokerEvidence
):NrmlBrokerReviewReport{
  if(!request||!text(request.expectedAccountId)||
     request.expectedAccountId.length>128||
     !text(request.instrumentKey)||request.instrumentKey.length>256||
     !positiveInt(request.lotSize)||!positiveInt(request.expectedLongQuantity)||
     request.expectedLongQuantity%request.lotSize!==0)
    return deny('INVALID_REVIEW_REQUEST',['INVALID_ACCOUNT_INSTRUMENT_LOT_OR_EXPECTED_QUANTITY']);
  if(!evidence||evidence.connected!==true||
     evidence.accountId!==request.expectedAccountId)
    return deny('BROKER_SCOPE_UNAVAILABLE',['BROKER_CONNECTED_ACCOUNT_MISMATCH_OR_UNAVAILABLE']);
  if(!Array.isArray(evidence.positions)||
     !Array.isArray(evidence.orderBook)||!Array.isArray(evidence.gttOrders))
    return deny('BROKER_EVIDENCE_INCOMPLETE',
      ['LIVE_POSITION_ORDER_BOOK_OR_GTT_ENDPOINT_UNAVAILABLE']);
  const reasons:string[]=[];
  let nrml=0,nrmlRows=0,ambiguousProduct=false;
  for(const row of evidence.positions){
    if(!obj(row)||!text(row.instrument_token)||!productCode(row.product)){
      reasons.push('MALFORMED_BROKER_POSITION_ROW');
      continue;
    }
    if(row.instrument_token!==request.instrumentKey)continue;
    if(row.product!=='D'){
      ambiguousProduct=true;
      continue;
    }
    nrmlRows++;
    // Upstox has integer net_quantity; do not infer from BUY quantity,
    // last traded price, individual fills or a local journal.
    const q=row.net_quantity;
    if(typeof q!=='number'&&typeof q!=='string'){
      reasons.push('UNKNOWN_BROKER_NRML_NET_QUANTITY');
      continue;
    }
    const n=Number(q);
    if(!Number.isSafeInteger(n)||n<0){
      reasons.push('UNKNOWN_BROKER_NRML_NET_QUANTITY');
      continue;
    }
    nrml+=n;
  }
  if(ambiguousProduct)reasons.push('SAME_INSTRUMENT_HAS_OTHER_PRODUCT_EXPOSURE');
  if(nrmlRows!==1)reasons.push('NRML_POSITION_ABSENT_OR_DUPLICATED');
  if(nrml!==request.expectedLongQuantity)
    reasons.push('NRML_NET_QUANTITY_MISMATCH');
  const netMatches=nrmlRows===1&&
    nrml===request.expectedLongQuantity&&!ambiguousProduct&&
    !reasons.some(x=>x.includes('POSITION')||x.includes('QUANTITY'));
  let sells=0,gtts=0,unresolved=false;
  const orderIds=new Set<string>();
  for(const row of evidence.orderBook){
    if(!obj(row)||!text(row.instrument_token)||
       !productCode(row.product)||!['BUY','SELL'].includes(asUpper(row.transaction_type))){
      reasons.push('MALFORMED_ORDER_BOOK_ROW');
      unresolved=true;continue;
    }
    if(row.instrument_token!==request.instrumentKey)continue;
    if(row.product!=='D'){
      unresolved=true;reasons.push('SAME_CONTRACT_NON_NRML_ORDER_PRESENT');continue;
    }
    if(asUpper(row.transaction_type)==='BUY'){
      if(!completedStatus.has(asUpper(row.status))){
        unresolved=true;reasons.push('UNRESOLVED_SAME_CONTRACT_BUY_ORDER');
      }
      continue;
    }
    const st=asUpper(row.status);
    if(!activeStatus.has(st)&&!completedStatus.has(st)){
      unresolved=true;reasons.push('UNKNOWN_SELL_ORDER_STATUS');continue;
    }
    if(!activeStatus.has(st))continue;
    if(['CANCEL PENDING','MODIFY PENDING','UNKNOWN',
        'VALIDATION PENDING','PUT ORDER REQ RECEIVED'].includes(st)){
      unresolved=true;reasons.push('UNRESOLVED_ACTIVE_SELL_ORDER_LIFECYCLE');
    }
    const id=row.order_id,qty=Number(row.quantity),
      kind=asUpper(row.order_type);
    if(!text(id)||!Number.isSafeInteger(qty)||qty<=0||
       qty!==nrml||!['SL','SL-M'].includes(kind)){
      unresolved=true;reasons.push('UNVERIFIED_OR_MISMATCHED_ACTIVE_SELL_STOP');continue;
    }
    if(orderIds.has(id)){
      unresolved=true;reasons.push('DUPLICATE_ACTIVE_SELL_ORDER_ID');
    }
    orderIds.add(id);sells++;
  }
  for(const row of evidence.gttOrders){
    if(!obj(row)||!text(row.instrument_token)||!productCode(row.product)){
      reasons.push('MALFORMED_GTT_ORDER_ROW');unresolved=true;continue;
    }
    if(row.instrument_token!==request.instrumentKey)continue;
    if(row.product!=='D'){
      reasons.push('SAME_CONTRACT_NON_NRML_GTT_PRESENT');unresolved=true;
      continue;
    }
    if(!text(row.gtt_order_id)||!Array.isArray(row.rules)){
      reasons.push('MISSING_GTT_ID_OR_RULE_DETAILS');unresolved=true;continue;
    }
    for(const rule of row.rules){
      if(!obj(rule)||!['BUY','SELL'].includes(asUpper(rule.transaction_type))){
        reasons.push('UNKNOWN_GTT_RULE_SIDE');unresolved=true;continue;
      }
      if(asUpper(rule.transaction_type)==='BUY')continue;
      const st=asUpper(rule.status);
      if(!activeStatus.has(st)&&!completedStatus.has(st)){
        reasons.push('UNKNOWN_GTT_SELL_RULE_STATE');unresolved=true;continue;
      }
      if(!activeStatus.has(st))continue;
      if(['CANCEL PENDING','MODIFY PENDING','UNKNOWN',
          'VALIDATION PENDING'].includes(st)){
        unresolved=true;reasons.push('UNRESOLVED_GTT_SELL_LIFECYCLE');
      }
      // API versions and GTT rule schemas vary: no assumption that an
      // ACTIVE GTT rule has spawned an exchange child order.
      // Official Upstox GTT v3 schema supplies quantity at PARENT order,
      // not at rules[]. This was mistakenly read from each rule in Phase91.
      const qty=Number(row.quantity);
      if(!Number.isSafeInteger(qty)||qty<=0||qty!==nrml){
        reasons.push('GTT_SELL_QUANTITY_MISSING_OR_MISMATCHED');
        unresolved=true;continue;
      }
      gtts++;
    }
  }
  const duplicate=sells+gtts>1||unresolved;
  if(sells+gtts===0)reasons.push('NO_NATIVE_PROTECTIVE_SELL_CANDIDATE_OBSERVED');
  if(sells+gtts>1)reasons.push('MULTIPLE_ACTIVE_POTENTIAL_SELL_PROTECTIONS');
  // Even a single apparent SL-M order or ACTIVE GTT is NOT a proven
  // (order-id, product, quantity, venue child ACK) lifecycle, nor a fill.
  reasons.push('GTT_OR_ORDER_BOOK_CANDIDATE_NOT_VERIFIED_CHILD_EXCHANGE_ACK');
  reasons.push('BROKER_ENDPOINT_SNAPSHOTS_NOT_ATOMIC');
  const state=duplicate||ambiguousProduct||
    reasons.some(x=>x.startsWith('MALFORMED')||x.startsWith('UNKNOWN')||
      x.includes('MISMATCH')||x.includes('DUPLICATE')||
      x.includes('MULTIPLE')||x.includes('ABSENT'))
    ?'BROKER_STATE_CONFLICT':
    'DESCRIPTIVE_NRML_BROKER_OBSERVATIONS_ONLY_NOT_PROTECTED';
  return deny(state,reasons,netMatches,sells,gtts,duplicate);
}

/** Interface contains only read methods; no order submission capability. */
export interface NrmlReadOnlyBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getVerifiedNrmlPositionRows():Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getGttOrders():Promise<unknown>;
}
/** Queries source-only endpoints; failures/null fail closed, no retries or mutations. */
export async function reviewNrmlBrokerReadOnly(
  broker:NrmlReadOnlyBroker,request:NrmlBrokerReviewRequest
):Promise<NrmlBrokerReviewReport>{
  if(!broker||typeof broker.getLiveConnectionStatus!=='function'||
     typeof broker.getVerifiedNrmlPositionRows!=='function'||
     typeof broker.getOrderBook!=='function'||
     typeof broker.getGttOrders!=='function')
    return deny('BROKER_SCOPE_UNAVAILABLE',['BROKER_READ_ONLY_METHODS_UNAVAILABLE']);
  let status:{isConnected:boolean;userId?:string};
  try{status=broker.getLiveConnectionStatus();}
  catch{return deny('BROKER_SCOPE_UNAVAILABLE',['BROKER_CONNECTION_STATUS_UNAVAILABLE']);}
  if(status?.isConnected!==true||status.userId!==request.expectedAccountId)
    return deny('BROKER_SCOPE_UNAVAILABLE',['BROKER_CONNECTED_ACCOUNT_MISMATCH_OR_UNAVAILABLE']);
  let positions:unknown,orderBook:unknown,gttOrders:unknown;
  try{
    [positions,orderBook,gttOrders]=await Promise.all([
      broker.getVerifiedNrmlPositionRows(),
      broker.getOrderBook(),broker.getGttOrders()
    ]);
  }catch{
    return deny('BROKER_EVIDENCE_INCOMPLETE',
      ['BROKER_READ_ONLY_TRANSPORT_OR_PARSE_FAILURE']);
  }
  return auditNrmlBrokerEvidence(request,{
    accountId:status.userId,connected:status.isConnected,
    positions,orderBook,gttOrders
  });
}
