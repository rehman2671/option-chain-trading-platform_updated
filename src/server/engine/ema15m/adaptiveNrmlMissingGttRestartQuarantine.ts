/**
 * Phase114: read-only restart quarantine for an original NRML option long
 * when an Upstox SINGLE SELL GTT is absent/triggered/cancelled.
 *
 * Upstox Get GTT does NOT return completed parents. Orderbook is current
 * trading day only. A missing GTT or observed flat net is NEVER a
 * certified completed exit, a durable replacement stop or permission
 * for a second SELL. This module has NO execution/write paths.
 */
type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const gttId=(x:unknown):x is string=>
  typeof x==='string'&&/^GTT-[A-Za-z0-9-]{1,124}$/.test(x);
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const uint=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const upper=(x:unknown):string=>typeof x==='string'?x.trim().toUpperCase():'';
const parseNet=(x:unknown):number|null=>{
  if(uint(x))return x;
  if(typeof x==='string'&&/^(?:0|[1-9][0-9]*)$/.test(x)){
    const n=Number(x);return uint(n)?n:null;
  }
  return null;
};
export interface RestartGttScope{
  expectedAccountId:string;
  instrumentKey:string;
  originalBuyOrderId:string;
  gttOrderId:string;
  originalLongQuantity:number;
  lotSize:number;
}
export interface RestartGttCensus{
  exactGtt:unknown;
  allGtts:unknown;
  orderBook:unknown;
  positions:unknown;
}
export type RestartGttState=
  'INVALID_SCOPE'|
  'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED'|
  'BROKER_NATIVE_GET_SOURCE_INCOMPLETE'|
  'BROKER_NRML_NET_MISSING_OR_CONFLICT'|
  'GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT'|
  'COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED'|
  'RESTART_BROKER_ACCOUNT_SNAPSHOT_CHANGED'|
  'SCHEDULED_GTT_NO_GENERATED_CHILD_RESTART_UNPROTECTED'|
  'GENERATED_SELL_CHILD_REQUIRES_TRADE_NET_AUDIT'|
  'MISSING_GTT_ORPHAN_SELL_CHILD_MANUAL_REVIEW'|
  'MISSING_GTT_PARENT_REQUIRES_BROKER_HISTORY_MANUAL_REVIEW'|
  'GTT_TERMINAL_OR_UNKNOWN_STATE_REQUIRES_BROKER_HISTORY';
export interface RestartGttReport{
  state:RestartGttState;
  reasonCodes:readonly string[];
  brokerReadPasses:0|1|2;
  brokerReportedCurrentNrmlNet:number|null;
  originalLongQuantity:number|null;
  brokerReportedOrphanGttSellChildCandidates:number;
  brokerReportedOtherSameContractOrderCandidates:number;
  brokerReportedGttPresent:boolean;
  brokerReportedGeneratedSellChildReference:boolean;
  brokerSnapshotsAtomic:false;
  currentDayOrderBookExcludesHistoricalCompletedOrders:true;
  missingCompletedGttCannotBeAssumedCancelledOrFilled:true;
  brokerReportedFlatDoesNotSettleDurableLedger:true;
  duplicateSellRetryAuthorized:false;
  cancelOrReplaceStopAuthorized:false;
  liveNrmlBuyAuthorized:false;
  nativeExchangeProtectiveStopCertified:false;
  overnightStopCoverageCertified:false;
  closedPositionWriteAuthorized:false;
  realisedPnlWriteAuthorized:false;
  accountCapitalAndMarginReconciled:false;
  independentlySignedBrokerHistoricalTradesVerified:false;
  brokerWrites:0;
  localWrites:0;
}
type Summary=Partial<Pick<RestartGttReport,
  'brokerReadPasses'|'brokerReportedCurrentNrmlNet'|
  'originalLongQuantity'|'brokerReportedOrphanGttSellChildCandidates'|
  'brokerReportedOtherSameContractOrderCandidates'|
  'brokerReportedGttPresent'|
  'brokerReportedGeneratedSellChildReference'>>;
const result=(state:RestartGttState,reasons:string[],
  d:Summary={}):RestartGttReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  brokerReadPasses:d.brokerReadPasses??0,
  brokerReportedCurrentNrmlNet:d.brokerReportedCurrentNrmlNet??null,
  originalLongQuantity:d.originalLongQuantity??null,
  brokerReportedOrphanGttSellChildCandidates:
    d.brokerReportedOrphanGttSellChildCandidates??0,
  brokerReportedOtherSameContractOrderCandidates:
    d.brokerReportedOtherSameContractOrderCandidates??0,
  brokerReportedGttPresent:d.brokerReportedGttPresent===true,
  brokerReportedGeneratedSellChildReference:
    d.brokerReportedGeneratedSellChildReference===true,
  brokerSnapshotsAtomic:false,
  currentDayOrderBookExcludesHistoricalCompletedOrders:true,
  missingCompletedGttCannotBeAssumedCancelledOrFilled:true,
  brokerReportedFlatDoesNotSettleDurableLedger:true,
  duplicateSellRetryAuthorized:false,cancelOrReplaceStopAuthorized:false,
  liveNrmlBuyAuthorized:false,nativeExchangeProtectiveStopCertified:false,
  overnightStopCoverageCertified:false,closedPositionWriteAuthorized:false,
  realisedPnlWriteAuthorized:false,accountCapitalAndMarginReconciled:false,
  independentlySignedBrokerHistoricalTradesVerified:false,
  brokerWrites:0,localWrites:0
});
const valid=(s:RestartGttScope)=>!!s&&
  id(s.expectedAccountId)&&
  typeof s.instrumentKey==='string'&&s.instrumentKey.length>7&&
  s.instrumentKey.length<=256&&
  (s.instrumentKey.startsWith('NSE_FO|')||
   s.instrumentKey.startsWith('BSE_FO|'))&&
  id(s.originalBuyOrderId)&&gttId(s.gttOrderId)&&
  positive(s.originalLongQuantity)&&positive(s.lotSize)&&
  s.originalLongQuantity%s.lotSize===0;
export function auditSingleSellGttRestartQuarantine(
  s:RestartGttScope,e:RestartGttCensus
):RestartGttReport{
  if(!valid(s))return result('INVALID_SCOPE',
    ['INVALID_ACCOUNT_ORIGINAL_LONG_GTT_OPTION_OR_LOTS']);
  if(!e||!Array.isArray(e.exactGtt)||!Array.isArray(e.allGtts)||
     !Array.isArray(e.orderBook)||!Array.isArray(e.positions))
    return result('BROKER_NATIVE_GET_SOURCE_INCOMPLETE',
      ['COMPLETE_CURRENT_GTT_ORDER_BOOK_OR_NRML_NET_GET_MISSING']);
  const found=e.positions.filter(x=>obj(x)&&
    x.instrument_token===s.instrumentKey&&x.product==='D');
  const net=found.length===1&&obj(found[0])?
    parseNet(found[0].net_quantity):null;
  if(net===null||net>s.originalLongQuantity||
     net%s.lotSize!==0&&net!==0||
     e.positions.some(x=>!obj(x)||typeof x.instrument_token!=='string'||
       (x.instrument_token===s.instrumentKey&&x.product!=='D')))
    return result('BROKER_NRML_NET_MISSING_OR_CONFLICT',
      ['BROKER_NRML_NET_NOT_UNIQUE_NONNEGATIVE_WHOLE_LOT'],{
        originalLongQuantity:s.originalLongQuantity
      });
  const base:Summary={originalLongQuantity:s.originalLongQuantity,
    brokerReportedCurrentNrmlNet:net};
  const matches=e.allGtts.filter(x=>obj(x)&&
    x.gtt_order_id===s.gttOrderId);
  if(matches.length>1||e.exactGtt.length>1)
    return result('GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
      ['DUPLICATE_SELECTED_GTT_PARENT_IN_BROKER_CURRENT_LIST'],base);
  if(e.exactGtt.length===1){
    if(!obj(e.exactGtt[0])||matches.length!==1||!obj(matches[0]))
      return result('GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
        ['GTT_EXACT_AND_FULL_LIST_MISMATCH'],base);
    const p=e.exactGtt[0],q=matches[0];
    if(JSON.stringify(p)!==JSON.stringify(q)||p.gtt_order_id!==s.gttOrderId||
       p.instrument_token!==s.instrumentKey||p.product!=='D'||
       p.type!=='SINGLE'||p.quantity!==s.originalLongQuantity||
       !Array.isArray(p.rules)||p.rules.length!==1||!obj(p.rules[0]))
      return result('GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
        ['EXACT_GTT_PRODUCT_SIDE_TYPE_OR_RULE_CONFLICT'],base);
    const r=p.rules[0];
    if(upper(r.strategy)!=='ENTRY'||
       upper(r.transaction_type)!=='SELL'||
       upper(r.trigger_type)!=='BELOW'||
       typeof r.trigger_price!=='number'||
       !Number.isFinite(r.trigger_price)||r.trigger_price<=0)
      return result('GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
        ['GTT_SINGLE_SELL_ENTRY_BELOW_RULE_MISMATCH'],base);
  }else if(matches.length!==0)
    return result('GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
      ['GTT_FULL_ACCOUNT_LIST_HAS_PARENT_BUT_EXACT_GET_MISSING'],base);
  const present=e.exactGtt.length===1;
  base.brokerReportedGttPresent=present;
  for(const g of e.allGtts){
    if(!obj(g)||typeof g.instrument_token!=='string')
      return result('BROKER_NATIVE_GET_SOURCE_INCOMPLETE',
        ['FULL_ACCOUNT_GTT_CENSUS_MALFORMED'],base);
    if(g.instrument_token===s.instrumentKey&&g.gtt_order_id!==s.gttOrderId)
      return result('COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED',
        ['OTHER_SAME_CONTRACT_GTT_MAY_GENERATE_UNTRACKED_CHILD'],base);
  }
  let orphan=0,other=0;
  for(const x of e.orderBook){
    if(!obj(x)||typeof x.instrument_token!=='string')
      return result('BROKER_NATIVE_GET_SOURCE_INCOMPLETE',
        ['FULL_ACCOUNT_ORDER_BOOK_MALFORMED'],base);
    if(x.instrument_token!==s.instrumentKey)continue;
    if(!id(x.order_id)||x.product!=='D'||
       !['BUY','SELL'].includes(upper(x.transaction_type)))
      return result('COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED',
        ['UNIDENTIFIED_SAME_CONTRACT_BROKER_ORDER'],base);
    const side=upper(x.transaction_type),status=upper(x.status);
    if(side==='BUY'&&x.order_id===s.originalBuyOrderId&&
       ['COMPLETE','COMPLETED'].includes(status))continue;
    if(side==='SELL'&&x.order_ref_id===s.gttOrderId){
      orphan++;
      if(orphan>1)return result('COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED',
        ['MULTIPLE_GTT_SELL_CHILD_ORDERS_CAN_OVERSELL'],base);
      if(!['OPEN','PARTIALLY FILLED','COMPLETE','COMPLETED',
            'CANCELLED','CANCELED','REJECTED','CANCEL PENDING',
            'MODIFY PENDING','TRIGGER PENDING'].includes(status))
        return result('COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED',
          ['GTT_SELL_CHILD_ORDER_STATUS_UNRESOLVED'],base);
      continue;
    }
    other++;
    const terminal=['CANCELLED','CANCELED','REJECTED',
      'EXPIRED','FAILED'];
    if(side==='BUY'||!terminal.includes(status)||
       parseNet(x.filled_quantity)!==0)
      return result('COMPETING_OPTION_ORDER_OR_GTT_UNRESOLVED',
        ['INDEPENDENT_BUY_SELL_FILL_OR_PENDING_ORDER_MAY_CHANGE_LONG'],{
          ...base,brokerReportedOtherSameContractOrderCandidates:other
        });
  }
  const d:Summary={...base,
    brokerReportedOrphanGttSellChildCandidates:orphan,
    brokerReportedOtherSameContractOrderCandidates:other};
  if(!present){
    if(orphan>0)return result('MISSING_GTT_ORPHAN_SELL_CHILD_MANUAL_REVIEW',[
      'COMPLETED_OR_DELETED_GTT_MISSING_BUT_ORDERBOOK_REFERENCES_SELL_CHILD',
      'FULL_EXCHANGE_TRADES_AND_ORIGINAL_POSITION_REQUIRE_MANUAL_RECONCILIATION'
    ],d);
    return result('MISSING_GTT_PARENT_REQUIRES_BROKER_HISTORY_MANUAL_REVIEW',[
      net===0?'BROKER_REPORTED_FLAT_NOT_DURABLE_EXIT_RECEIPT':
        'BROKER_REPORTED_LONG_BUT_NO_RETRIEVABLE_EXIT_GTT',
      'UPSTOX_COMPLETED_GTT_NOT_RETRIEVABLE_AND_ORDERBOOK_CURRENT_DAY_ONLY'
    ],d);
  }
  const p=e.exactGtt[0] as Row,r=(p.rules as Row[])[0];
  const state=upper(r.status);
  if(state==='SCHEDULED'&&r.order_id===null){
    if(orphan!==0)return result('GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
      ['SCHEDULED_GTT_HAS_SELL_CHILD_IN_BOOK_WITHOUT_GENERATION'],d);
    return result('SCHEDULED_GTT_NO_GENERATED_CHILD_RESTART_UNPROTECTED',[
      'SCHEDULED_GTT_IS_CONDITIONAL_NOT_EXCHANGE_NATIVE_PROTECTIVE_STOP'
    ],d);
  }
  if(['TRIGGERED','OPEN','COMPLETED'].includes(state)&&id(r.order_id)){
    base.brokerReportedGeneratedSellChildReference=true;
    if(orphan>0&&
       !e.orderBook.some(x=>obj(x)&&
         x.order_id===r.order_id&&x.order_ref_id===s.gttOrderId))
      return result('GTT_PARENT_OR_CURRENT_GTT_LIST_CONFLICT',
        ['GTT_GENERATED_CHILD_DISAGREES_WITH_ORDER_BOOK_REFERENCE'],d);
    return result('GENERATED_SELL_CHILD_REQUIRES_TRADE_NET_AUDIT',[
      'PARENT_TRIGGER_IS_NOT_LIMIT_SELL_FILL_OR_POSITION_CLOSURE',
      'REQUIRE_PHASE113_GENERATED_CHILD_TRADE_ID_AND_NET_REVIEW'
    ],{...d,brokerReportedGeneratedSellChildReference:true});
  }
  return result('GTT_TERMINAL_OR_UNKNOWN_STATE_REQUIRES_BROKER_HISTORY',[
    'GTT_CANCELLED_REJECTED_OR_PENDING_NOT_A_ACTIVE_NATIVE_STOP'
  ],d);
}
export interface RestartGttBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getBrokerAuthEpoch():number;
  getGttOrderDetails(id:string):Promise<unknown>;
  getGttOrders():Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getVerifiedNrmlPositionRows():Promise<unknown>;
}
/** Two non-atomic authenticated broker GET passes: no order mutations. */
export async function reviewSingleSellGttRestartTwoPassReadOnly(
  broker:RestartGttBroker,s:RestartGttScope
):Promise<RestartGttReport>{
  if(!valid(s))return result('INVALID_SCOPE',
    ['INVALID_ACCOUNT_ORIGINAL_LONG_GTT_OPTION_OR_LOTS']);
  if(!broker||['getLiveConnectionStatus','getBrokerAuthEpoch',
    'getGttOrderDetails','getGttOrders','getOrderBook',
    'getVerifiedNrmlPositionRows'].some(k=>
      typeof broker[k as keyof RestartGttBroker]!=='function'))
    return result('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
      ['RESTART_BROKER_READ_ONLY_METHOD_UNAVAILABLE']);
  let epoch:number;
  try{
    const a=broker.getLiveConnectionStatus();
    epoch=broker.getBrokerAuthEpoch();
    if(a?.isConnected!==true||a.userId!==s.expectedAccountId||
       !positive(epoch))
      return result('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
        ['BROKER_ACCOUNT_SESSION_NOT_AUTHENTICATED']);
  }catch{return result('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_ACCOUNT_SESSION_NOT_AUTHENTICATED']);}
  const same=():boolean=>{
    try{
      const a=broker.getLiveConnectionStatus();
      return a?.isConnected===true&&a.userId===s.expectedAccountId&&
        broker.getBrokerAuthEpoch()===epoch;
    }catch{return false;}
  };
  const lost=(n:0|1|2=0)=>result(
    'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_ACCOUNT_OR_EPOCH_SWITCHED_DURING_RESTART_QUARANTINE'],
    {brokerReadPasses:n});
  const read=async():Promise<RestartGttCensus>=>{
    const [exactGtt,allGtts,orderBook,positions]=await Promise.all([
      broker.getGttOrderDetails(s.gttOrderId),
      broker.getGttOrders(),broker.getOrderBook(),
      broker.getVerifiedNrmlPositionRows()
    ]);
    return {exactGtt,allGtts,orderBook,positions};
  };
  if(!same())return lost();
  let first:RestartGttCensus;
  try{first=await read();}catch{
    return same()?result('BROKER_NATIVE_GET_SOURCE_INCOMPLETE',
      ['FIRST_RESTART_CURRENT_BROKER_CENSUS_GET_FAILED']):lost();
  }
  if(!same())return lost(1);
  const a=auditSingleSellGttRestartQuarantine(s,first);
  const accepted=new Set<RestartGttState>([
    'SCHEDULED_GTT_NO_GENERATED_CHILD_RESTART_UNPROTECTED',
    'GENERATED_SELL_CHILD_REQUIRES_TRADE_NET_AUDIT',
    'MISSING_GTT_ORPHAN_SELL_CHILD_MANUAL_REVIEW',
    'MISSING_GTT_PARENT_REQUIRES_BROKER_HISTORY_MANUAL_REVIEW',
    'GTT_TERMINAL_OR_UNKNOWN_STATE_REQUIRES_BROKER_HISTORY'
  ]);
  if(!accepted.has(a.state))
    return result(a.state,[...a.reasonCodes],{brokerReadPasses:1});
  let second:RestartGttCensus;
  try{second=await read();}catch{
    return same()?result('BROKER_NATIVE_GET_SOURCE_INCOMPLETE',
      ['SECOND_RESTART_CURRENT_BROKER_CENSUS_GET_FAILED'],
      {brokerReadPasses:1}):lost(1);
  }
  if(!same())return lost(2);
  const b=auditSingleSellGttRestartQuarantine(s,second);
  if(!accepted.has(b.state)||a.state!==b.state)
    return result('RESTART_BROKER_ACCOUNT_SNAPSHOT_CHANGED',
      ['GTT_ORDERBOOK_OR_NATIVE_NET_RESTART_STATE_CHANGED'],
      {brokerReadPasses:2});
  if(JSON.stringify(first)!==JSON.stringify(second))
    return result('RESTART_BROKER_ACCOUNT_SNAPSHOT_CHANGED',
      ['NONATOMIC_CURRENT_GTT_ORDERBOOK_NET_CENSUS_CHANGED'],
      {brokerReadPasses:2});
  return result(b.state,[...b.reasonCodes],{
    brokerReadPasses:2,
    brokerReportedCurrentNrmlNet:b.brokerReportedCurrentNrmlNet,
    originalLongQuantity:b.originalLongQuantity,
    brokerReportedOrphanGttSellChildCandidates:
      b.brokerReportedOrphanGttSellChildCandidates,
    brokerReportedOtherSameContractOrderCandidates:
      b.brokerReportedOtherSameContractOrderCandidates,
    brokerReportedGttPresent:b.brokerReportedGttPresent,
    brokerReportedGeneratedSellChildReference:
      b.brokerReportedGeneratedSellChildReference
  });
}
