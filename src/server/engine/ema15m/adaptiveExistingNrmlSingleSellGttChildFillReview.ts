/**
 * Phase113: broker-READ-ONLY GTT SINGLE ENTRY SELL/BELOW -> generated
 * LIMIT SELL child -> unique SELL trades -> current NRML net conservation.
 *
 * GTT entry SELL is a broker-side conditional exit; it is NOT a
 * native exchange-hosted stop or a guaranteed fill. Upstox GET GTT may
 * cease returning a COMPLETED GTT. Missing parent is UNCERTAIN, not proof
 * of a closed position. Never retry/cancel/replace/place broker orders.
 */
type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const ident=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const gttId=(x:unknown):x is string=>
  typeof x==='string'&&/^GTT-[A-Za-z0-9-]{1,124}$/.test(x);
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonnegative=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const price=(x:unknown):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>0&&
  Number.isSafeInteger(Math.round(x*100))&&
  Math.abs(x*100-Math.round(x*100))<0.00001;
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
/** Upstox order-trades may expose an older numeric instrument_token.
 * Never derive its F&O instrument key from numeric suffixes; only
 * corroborate a *single exact child order* across independent Upstox
 * GET surfaces. This is descriptive broker lineage, NOT mapping
 * certified by an exchange/security master. */
const legacyTradeToken=(x:unknown):x is string=>
  typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const brokerSymbol=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const legacyTradeCorroborated=(scope:TriggeredSellGttScope,
  parent:Row,order:Row,trade:Row):boolean=>{
  if(!legacyTradeToken(trade.instrument_token))return false;
  const venue=scope.instrumentKey.startsWith('NSE_FO|')?'NFO':'BFO';
  const gttVenue=venue==='NFO'?'NSE_FO':'BSE_FO';
  if(parent.exchange!==gttVenue||order.exchange!==venue||
     trade.exchange!==venue||upper(trade.order_type)!=='LIMIT'||
     order.order_id!==trade.order_id||
     order.exchange_order_id!==trade.exchange_order_id||
     order.order_ref_id!==scope.gttOrderId)return false;
  const os=order.trading_symbol,ts=trade.trading_symbol;
  if(!brokerSymbol(os)||!brokerSymbol(ts)||os!==ts)return false;
  if(order.tradingsymbol!==undefined&&
     order.tradingsymbol!==os)return false;
  if(trade.tradingsymbol!==undefined&&
     trade.tradingsymbol!==ts)return false;
  return true;
};
const net=(x:unknown):number|null=>{
  if(nonnegative(x))return x;
  if(typeof x==='string'&&/^(?:0|[1-9][0-9]*)$/.test(x)){
    const n=Number(x);return nonnegative(n)?n:null;
  }
  return null;
};
export interface TriggeredSellGttScope{
  expectedAccountId:string;
  instrumentKey:string;
  originalBuyOrderId:string;
  gttOrderId:string;
  originalLongQuantity:number;
  lotSize:number;
}
export interface TriggeredSellGttSnapshot{
  exactGtt:unknown;
  allGtts:unknown;
  orderBook:unknown;
  positions:unknown;
  childOrder:unknown;
  childTrades:unknown;
}
export type TriggeredSellGttState=
  'INVALID_SCOPE'|
  'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED'|
  'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE'|
  'SCHEDULED_GTT_HAS_NO_GENERATED_SELL_CHILD'|
  'GTT_OR_GENERATED_CHILD_LINKAGE_CONFLICT'|
  'GENERATED_SELL_CHILD_REJECTED_CANCELLED_OR_UNRESOLVED'|
  'GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT'|
  'COMPETING_SAME_OPTION_BUY_SELL_GTT_UNRESOLVED'|
  'GTT_CHILD_TRADE_OR_ACCOUNT_NET_CHANGED_BETWEEN_PASSES'|
  'BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP';
export interface TriggeredSellGttReport{
  state:TriggeredSellGttState;
  reasonCodes:readonly string[];
  brokerReadPasses:0|1|2;
  brokerReportedOriginalLongQuantity:number|null;
  brokerReportedSellFilledQuantity:number|null;
  brokerReportedRemainingLongQuantity:number|null;
  brokerReportedChildPendingSellQuantity:number|null;
  brokerReportedSellExecutionCount:number;
  brokerReportedGeneratedChildIsLimit:boolean;
  brokerReportedExchangeOrderIdObserved:boolean;
  brokerReportedLegacyTradeTokenCorroborated:boolean;
  legacyNumericInstrumentTokenIndependentlyMapped:false;
  brokerReportedFlatAfterGeneratedChild:boolean;
  sameBrokerSessionAcrossPasses:boolean;
  quantityWithoutIndependentProtectiveAck:number|null;
  brokerSnapshotsAtomic:false;
  generatedSellBrokerAckIsNotFill:true;
  buyOrderNeverIssuedByReview:true;
  stopGttOrderMutationNeverIssuedByReview:true;
  gttTriggeredSellIsNotNativeStop:true;
  noAdditionalShortCanBeCreatedIndependentlyCertified:false;
  brokerExchangeNativeProtectiveStopAckCertified:false;
  brokerExecutionIndependentlyCleared:false;
  fullAccountHistoricalTradesReconciled:false;
  feesTaxesAndRealisedPnlVerified:false;
  multiSessionStopContinuityVerified:false;
  brokerCanGuaranteeGapFill:false;
  automaticPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Data=Partial<Pick<TriggeredSellGttReport,
  'brokerReadPasses'|'brokerReportedOriginalLongQuantity'|
  'brokerReportedSellFilledQuantity'|'brokerReportedRemainingLongQuantity'|
  'brokerReportedChildPendingSellQuantity'|'brokerReportedSellExecutionCount'|
  'brokerReportedGeneratedChildIsLimit'|
  'brokerReportedExchangeOrderIdObserved'|
  'brokerReportedLegacyTradeTokenCorroborated'|
  'brokerReportedFlatAfterGeneratedChild'|
  'sameBrokerSessionAcrossPasses'|
  'quantityWithoutIndependentProtectiveAck'>>;
const report=(state:TriggeredSellGttState,reasons:string[],
  d:Data={}):TriggeredSellGttReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  brokerReadPasses:d.brokerReadPasses??0,
  brokerReportedOriginalLongQuantity:
    d.brokerReportedOriginalLongQuantity??null,
  brokerReportedSellFilledQuantity:d.brokerReportedSellFilledQuantity??null,
  brokerReportedRemainingLongQuantity:
    d.brokerReportedRemainingLongQuantity??null,
  brokerReportedChildPendingSellQuantity:
    d.brokerReportedChildPendingSellQuantity??null,
  brokerReportedSellExecutionCount:d.brokerReportedSellExecutionCount??0,
  brokerReportedGeneratedChildIsLimit:
    d.brokerReportedGeneratedChildIsLimit===true,
  brokerReportedExchangeOrderIdObserved:
    d.brokerReportedExchangeOrderIdObserved===true,
  brokerReportedLegacyTradeTokenCorroborated:
    d.brokerReportedLegacyTradeTokenCorroborated===true,
  legacyNumericInstrumentTokenIndependentlyMapped:false,
  brokerReportedFlatAfterGeneratedChild:
    d.brokerReportedFlatAfterGeneratedChild===true,
  sameBrokerSessionAcrossPasses:d.sameBrokerSessionAcrossPasses===true,
  quantityWithoutIndependentProtectiveAck:
    d.quantityWithoutIndependentProtectiveAck??null,
  brokerSnapshotsAtomic:false,generatedSellBrokerAckIsNotFill:true,
  buyOrderNeverIssuedByReview:true,
  stopGttOrderMutationNeverIssuedByReview:true,
  gttTriggeredSellIsNotNativeStop:true,
  noAdditionalShortCanBeCreatedIndependentlyCertified:false,
  brokerExchangeNativeProtectiveStopAckCertified:false,
  brokerExecutionIndependentlyCleared:false,
  fullAccountHistoricalTradesReconciled:false,
  feesTaxesAndRealisedPnlVerified:false,
  multiSessionStopContinuityVerified:false,
  brokerCanGuaranteeGapFill:false,
  automaticPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,liveNrmlBuyAuthorized:false,
  brokerWrites:0,localWrites:0
});
const valid=(s:TriggeredSellGttScope):boolean=>!!s&&
  ident(s.expectedAccountId)&&typeof s.instrumentKey==='string'&&
  s.instrumentKey.length>7&&s.instrumentKey.length<=256&&
  (s.instrumentKey.startsWith('NSE_FO|')||
   s.instrumentKey.startsWith('BSE_FO|'))&&
  ident(s.originalBuyOrderId)&&gttId(s.gttOrderId)&&
  positive(s.lotSize)&&positive(s.originalLongQuantity)&&
  s.originalLongQuantity%s.lotSize===0;

/** GTT parent may disappear from GET once completed: this is a blocker. */
function parent(scope:TriggeredSellGttScope,raw:unknown):
  {status:'INVALID'|'SCHEDULED'|'GENERATED';parent:Row|null;
   childId:string|null}{
  const fail=()=>({status:'INVALID' as const,parent:null,childId:null});
  if(!Array.isArray(raw)||raw.length!==1||!obj(raw[0]))return fail();
  const p=raw[0];
  if(p.gtt_order_id!==scope.gttOrderId||p.type!=='SINGLE'||
     p.product!=='D'||p.instrument_token!==scope.instrumentKey||
     p.quantity!==scope.originalLongQuantity||
     !Array.isArray(p.rules)||p.rules.length!==1||!obj(p.rules[0]))
    return fail();
  const r=p.rules[0];
  if(upper(r.strategy)!=='ENTRY'||upper(r.transaction_type)!=='SELL'||
     upper(r.trigger_type)!=='BELOW'||!price(r.trigger_price))
    return fail();
  if(upper(r.status)==='SCHEDULED'&&r.order_id===null)
    return {status:'SCHEDULED',parent:p,childId:null};
  if(!['TRIGGERED','OPEN','COMPLETED'].includes(upper(r.status))||
     !ident(r.order_id))return fail();
  return {status:'GENERATED',parent:p,childId:r.order_id};
}
const material=(x:Row)=>JSON.stringify({
  id:x.gtt_order_id,type:x.type,product:x.product,
  instrument:x.instrument_token,quantity:x.quantity,
  created:x.created_at,expires:x.expires_at,rules:x.rules
});
const live=new Set(['OPEN','PARTIALLY FILLED']);
const full=new Set(['COMPLETE','COMPLETED']);
const dead=new Set(['CANCELLED','CANCELED','REJECTED','FAILED','EXPIRED']);
const pending=new Set(['CANCEL PENDING','MODIFY PENDING',
  'MODIFY VALIDATION PENDING','PUT ORDER REQ RECEIVED',
  'VALIDATION PENDING','TRIGGER PENDING']);
export function auditTriggeredSingleSellGttChild(
  scope:TriggeredSellGttScope,s:TriggeredSellGttSnapshot
):TriggeredSellGttReport{
  if(!valid(scope))return report('INVALID_SCOPE',
    ['INVALID_ORIGINAL_NRML_LONG_ACCOUNT_OPTION_GTT_OR_LOTS']);
  if(!s||!Array.isArray(s.exactGtt))
    return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['GTT_CURRENT_PARENT_GET_UNAVAILABLE']);
  if(s.exactGtt.length!==1)
    return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['COMPLETED_GTT_MAY_NOT_BE_RETURNED_BY_UPSTOX_GET']);
  const p=parent(scope,s.exactGtt);
  if(p.status==='INVALID'||!p.parent)
    return report('GTT_OR_GENERATED_CHILD_LINKAGE_CONFLICT',
      ['GTT_SINGLE_ENTRY_SELL_BELOW_ID_PRODUCT_OR_RULE_INVALID']);
  if(p.status==='SCHEDULED')
    return report('SCHEDULED_GTT_HAS_NO_GENERATED_SELL_CHILD',
      ['SCHEDULED_BROKER_GTT_HAS_NULL_CHILD_NO_EXCHANGE_ORDER']);
  // No child GET is warranted for a scheduled rule; after a generated
  // child, full account order/GTT/net source completeness is required.
  if(!Array.isArray(s.allGtts)||!Array.isArray(s.orderBook)||
     !Array.isArray(s.positions))
    return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['GTT_ACCOUNT_ORDERBOOK_OR_BROKER_NRML_NET_GET_MISSING']);
  const base:Data={brokerReportedOriginalLongQuantity:
    scope.originalLongQuantity};
  if(!obj(s.childOrder)||!Array.isArray(s.childTrades))
    return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['GENERATED_CHILD_DETAILS_OR_TRADES_GET_MISSING'],base);
  const o=s.childOrder,side=upper(o.transaction_type),status=upper(o.status);
  if(o.order_id!==p.childId||o.order_ref_id!==scope.gttOrderId||
     o.instrument_token!==scope.instrumentKey||o.product!=='D'||
     side!=='SELL'||upper(o.order_type)!=='LIMIT'||
     o.quantity!==scope.originalLongQuantity||
     !positive(o.quantity)||!nonnegative(o.filled_quantity)||
     !nonnegative(o.pending_quantity)||
     o.filled_quantity+o.pending_quantity!==o.quantity||
     !price(o.price))
    return report('GTT_OR_GENERATED_CHILD_LINKAGE_CONFLICT',
      ['CHILD_SELL_ORDER_REF_PRODUCT_TYPE_QUANTITY_OR_PRICE_MISMATCH'],base);
  if(dead.has(status)||pending.has(status)||
     (!live.has(status)&&!full.has(status))||
     (live.has(status)&&o.pending_quantity===0)||
     (full.has(status)&&
       (o.pending_quantity!==0||o.filled_quantity!==o.quantity))||
     (status==='PARTIALLY FILLED'&&o.filled_quantity===0))
    return report('GENERATED_SELL_CHILD_REJECTED_CANCELLED_OR_UNRESOLVED',
      ['CHILD_REJECT_CANCEL_MODIFY_PENDING_OR_FILL_STATUS_UNRESOLVED'],base);
  if(!ident(o.exchange_order_id))
    return report('GTT_OR_GENERATED_CHILD_LINKAGE_CONFLICT',
      ['BROKER_REPORTED_EXCHANGE_SELL_ORDER_ID_MISSING'],base);
  const book=s.orderBook.filter(x=>obj(x)&&x.order_id===o.order_id);
  if(book.length!==1||!obj(book[0])||
     ['order_id','order_ref_id','exchange_order_id','instrument_token',
      'product','transaction_type','order_type','quantity',
      'filled_quantity','pending_quantity','price','status'].some(k=>
        book[0][k]!==o[k]))
    return report('GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT',
      ['BROKER_GENERATED_SELL_CHILD_ORDERBOOK_NOT_EXACTLY_UNIQUE'],base);
  if(s.childTrades.length>5000)
    return report('GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT',
      ['GENERATED_SELL_TRADE_HISTORY_POSSIBLY_TRUNCATED'],base);
  const seen=new Set<string>();let filled=0;
  let observedLegacyTradeToken=false;
  for(const t of s.childTrades){
    if(!obj(t)||!ident(t.trade_id)||seen.has(t.trade_id)||
       t.order_id!==p.childId||
       t.exchange_order_id!==o.exchange_order_id||
       (t.instrument_token!==scope.instrumentKey&&
        !legacyTradeCorroborated(scope,p.parent,o,t))||
       t.product!=='D'||upper(t.transaction_type)!=='SELL'||
       !positive(t.quantity)||!price(t.average_price)||
       (t.order_ref_id!==undefined&&t.order_ref_id!==null&&
        t.order_ref_id!==scope.gttOrderId))
      return report('GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT',
        ['BROKER_GENERATED_SELL_TRADE_ID_EXCHANGE_SCOPE_OR_PRICE_CONFLICT'],base);
    if(legacyTradeToken(t.instrument_token))
      observedLegacyTradeToken=true;
    seen.add(t.trade_id);filled+=t.quantity;
    if(!nonnegative(filled))
      return report('GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT',
        ['GENERATED_SELL_EXECUTION_SUM_OVERFLOW'],base);
  }
  if(filled!==o.filled_quantity)
    return report('GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT',
      ['BROKER_REPORTED_CHILD_FILLS_NOT_EQUAL_UNIQUE_SELL_TRADES'],base);
  const positions=s.positions.filter(x=>obj(x)&&
    x.instrument_token===scope.instrumentKey&&x.product==='D');
  const current=positions.length===1&&obj(positions[0])?
    net(positions[0].net_quantity):null;
  if(current===null||
     current!==scope.originalLongQuantity-filled||
     current!==o.pending_quantity||
     current%scope.lotSize!==0&&current!==0||
     s.positions.some(x=>!obj(x)||
       typeof x.instrument_token!=='string'||
       (x.instrument_token===scope.instrumentKey&&x.product!=='D')))
    return report('GENERATED_SELL_TRADE_BOOK_OR_NET_CONFLICT',
      ['BROKER_NRML_NET_NOT_CONSERVED_WITH_SELL_EXECUTIONS_AND_PENDING'],base);
  const all=s.allGtts.filter(x=>obj(x)&&x.gtt_order_id===scope.gttOrderId);
  if(all.length!==1||!obj(all[0])||
     material(all[0])!==material(p.parent))
    return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['GTT_DETAILS_DIFFER_FROM_COMPLETE_CURRENT_GTT_LIST'],base);
  for(const g of s.allGtts){
    if(!obj(g)||typeof g.instrument_token!=='string')
      return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
        ['FULL_GTT_ACCOUNT_LIST_MALFORMED'],base);
    if(g.instrument_token===scope.instrumentKey&&
       g.gtt_order_id!==scope.gttOrderId)
      return report('COMPETING_SAME_OPTION_BUY_SELL_GTT_UNRESOLVED',
        ['COMPETING_SAME_OPTION_GTT_CAN_PLACE_ANOTHER_ORDER'],base);
  }
  for(const x of s.orderBook){
    if(!obj(x)||typeof x.instrument_token!=='string')
      return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
        ['CURRENT_ACCOUNT_ORDERBOOK_MALFORMED'],base);
    if(x.instrument_token!==scope.instrumentKey||x.order_id===p.childId)
      continue;
    if(!ident(x.order_id)||x.product!=='D'||
       !['BUY','SELL'].includes(upper(x.transaction_type)))
      return report('COMPETING_SAME_OPTION_BUY_SELL_GTT_UNRESOLVED',
        ['UNRESOLVED_SAME_OPTION_ORDER_SIDE_OR_PRODUCT'],base);
    const side=upper(x.transaction_type),st=upper(x.status);
    if(x.order_id===scope.originalBuyOrderId&&side==='BUY'&&
       full.has(st))continue;
    if(side==='BUY'||!dead.has(st)||net(x.filled_quantity)!==0)
      return report('COMPETING_SAME_OPTION_BUY_SELL_GTT_UNRESOLVED',
        ['OTHER_SAME_OPTION_BUY_OR_SELL_MAY_CHANGE_NET_OR_SHORT'],base);
  }
  return report('BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP',[
    'BROKER_GENERATED_LIMIT_SELL_CHILD_IS_NOT_NATIVE_PROTECTIVE_STOP',
    'GTT_CHILD_BROKER_REPORTED_EXCHANGE_REF_NOT_INDEPENDENT_VENUE_ACK',
    'CURRENT_DAY_EXECUTIONS_CANNOT_CERTIFY_MULTIWEEK_ACCOUNT_HISTORY',
    'LEGACY_NUMERIC_TRADE_TOKEN_CORROBORATION_IS_NOT_CONTRACT_MAPPING'
  ],{
    ...base,brokerReportedSellFilledQuantity:filled,
    brokerReportedRemainingLongQuantity:current,
    brokerReportedChildPendingSellQuantity:o.pending_quantity,
    brokerReportedSellExecutionCount:seen.size,
    brokerReportedGeneratedChildIsLimit:true,
    brokerReportedExchangeOrderIdObserved:true,
    brokerReportedLegacyTradeTokenCorroborated:observedLegacyTradeToken,
    brokerReportedFlatAfterGeneratedChild:current===0,
    quantityWithoutIndependentProtectiveAck:current
  });
}
export interface TriggeredSellGttBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getBrokerAuthEpoch():number;
  getGttOrderDetails(id:string):Promise<unknown>;
  getGttOrders():Promise<unknown>;
  getOrderDetails(id:string):Promise<unknown>;
  getOrderTrades(id:string):Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getVerifiedNrmlPositionRows():Promise<unknown>;
}
/** Read two GTT -> generated SELL child -> net batches; no broker writes. */
export async function reviewTriggeredSingleSellGttTwoPassReadOnly(
  broker:TriggeredSellGttBroker,scope:TriggeredSellGttScope
):Promise<TriggeredSellGttReport>{
  if(!valid(scope))return report('INVALID_SCOPE',
    ['INVALID_ORIGINAL_NRML_LONG_ACCOUNT_OPTION_GTT_OR_LOTS']);
  if(!broker||[
    'getLiveConnectionStatus','getBrokerAuthEpoch',
    'getGttOrderDetails','getGttOrders','getOrderDetails',
    'getOrderTrades','getOrderBook','getVerifiedNrmlPositionRows'
  ].some(name=>typeof broker[name as keyof TriggeredSellGttBroker]!=='function'))
    return report('BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
      ['BROKER_NATIVE_GTT_ORDER_CHILD_READ_METHOD_MISSING']);
  let epoch:number;
  try{
    const auth=broker.getLiveConnectionStatus();
    epoch=broker.getBrokerAuthEpoch();
    if(auth?.isConnected!==true||auth.userId!==scope.expectedAccountId||
       !positive(epoch))
      return report('BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
        ['BROKER_ACCOUNT_OR_SESSION_GENERATION_NOT_VERIFIED']);
  }catch{return report('BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_ACCOUNT_OR_SESSION_GENERATION_NOT_VERIFIED']);}
  const same=()=>{
    try{
      const a=broker.getLiveConnectionStatus();
      return a?.isConnected===true&&a.userId===scope.expectedAccountId&&
        broker.getBrokerAuthEpoch()===epoch;
    }catch{return false;}
  };
  const lost=(n:0|1|2)=>report(
    'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED',
    ['ACCOUNT_SWITCH_OR_AUTH_EPOCH_CHANGED_DURING_CHILD_GETS'],
    {brokerReadPasses:n});
  const read=async():Promise<TriggeredSellGttSnapshot>=>{
    const exactGtt=await broker.getGttOrderDetails(scope.gttOrderId);
    if(!same())throw Error('ACCOUNT_EPOCH_DRIFT');
    const p=parent(scope,exactGtt);
    if(p.status!=='GENERATED'||!p.childId)
      return {exactGtt,allGtts:null,orderBook:null,positions:null,
        childOrder:null,childTrades:null};
    const [childOrder,childTrades,orderBook,allGtts,positions]=
      await Promise.all([
        broker.getOrderDetails(p.childId),broker.getOrderTrades(p.childId),
        broker.getOrderBook(),broker.getGttOrders(),
        broker.getVerifiedNrmlPositionRows()
      ]);
    if(!same())throw Error('ACCOUNT_EPOCH_DRIFT');
    const finalGtt=await broker.getGttOrderDetails(scope.gttOrderId);
    if(!same())throw Error('ACCOUNT_EPOCH_DRIFT');
    if(JSON.stringify(exactGtt)!==JSON.stringify(finalGtt))
      throw Error('PARENT_DRIFT');
    return {exactGtt,allGtts,orderBook,positions,childOrder,childTrades};
  };
  if(!same())return lost(0);
  let first:TriggeredSellGttSnapshot;
  try{first=await read();}catch{
    return same()?report(
      'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['FIRST_PASS_GTT_CHILD_OR_ORDERBOOK_GET_FAILED_OR_CHANGED']):
      lost(0);
  }
  if(!same())return lost(1);
  if(!Array.isArray(first.exactGtt)||first.exactGtt.length!==1)
    return report('GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['COMPLETED_GTT_MAY_NOT_BE_RETURNED_BY_UPSTOX_GET'],
      {brokerReadPasses:1});
  const a=auditTriggeredSingleSellGttChild(scope,first);
  if(a.state!=='BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP')
    return report(a.state,[...a.reasonCodes],{brokerReadPasses:1});
  let second:TriggeredSellGttSnapshot;
  try{second=await read();}catch{
    return same()?report(
      'GTT_PARENT_NOT_RETRIEVABLE_OR_BROKER_SOURCE_INCOMPLETE',
      ['SECOND_PASS_GTT_CHILD_OR_ORDERBOOK_GET_FAILED_OR_CHANGED'],
      {brokerReadPasses:1}):lost(1);
  }
  if(!same())return lost(2);
  const b=auditTriggeredSingleSellGttChild(scope,second);
  if(b.state!=='BROKER_REPORTED_GTT_SELL_CHILD_NOT_PROTECTIVE_STOP')
    return report(b.state,[...b.reasonCodes],{brokerReadPasses:2});
  if(JSON.stringify(first)!==JSON.stringify(second))
    return report('GTT_CHILD_TRADE_OR_ACCOUNT_NET_CHANGED_BETWEEN_PASSES',
      ['GENERATED_SELL_PARENT_CHILD_FILLS_OR_NET_CHANGED'],
      {brokerReadPasses:2});
  return report(b.state,[...b.reasonCodes],{
    brokerReadPasses:2,
    brokerReportedOriginalLongQuantity:b.brokerReportedOriginalLongQuantity,
    brokerReportedSellFilledQuantity:b.brokerReportedSellFilledQuantity,
    brokerReportedRemainingLongQuantity:b.brokerReportedRemainingLongQuantity,
    brokerReportedChildPendingSellQuantity:
      b.brokerReportedChildPendingSellQuantity,
    brokerReportedSellExecutionCount:b.brokerReportedSellExecutionCount,
    brokerReportedGeneratedChildIsLimit:true,
    brokerReportedExchangeOrderIdObserved:true,
    brokerReportedLegacyTradeTokenCorroborated:
      b.brokerReportedLegacyTradeTokenCorroborated,
    brokerReportedFlatAfterGeneratedChild:
      b.brokerReportedFlatAfterGeneratedChild,
    sameBrokerSessionAcrossPasses:true,
    quantityWithoutIndependentProtectiveAck:
      b.quantityWithoutIndependentProtectiveAck
  });
}
