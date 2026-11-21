/**
 * Phase95: read-only NRML recovery diagnostic after process restart / broker
 * timeout. An UNKNOWN order result is NOT proof that a previous SELL failed.
 * This is a quarantine review, not a retry policy, live stop release, order
 * placement, cancellation, or permission to start a positional auto-trader.
 */
import {emaBrokerOrderTag} from './brokerOrderEvidence.js';
type Row=Record<string,unknown>;
const row=(x:unknown):x is Row=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=256;
const unsigned=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const pos=(x:unknown):x is number=>unsigned(x)&&x>0;
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
const numeric=(x:unknown):number|null=>{
  if(unsigned(x))return x;
  if(typeof x==='string'&&/^(?:0|[1-9][0-9]*)$/.test(x)){
    const n=Number(x);return unsigned(n)?n:null;
  }
  return null;
};
const terminal=new Set(['COMPLETE','COMPLETED','REJECTED','CANCELLED',
  'CANCELED','EXPIRED','FAILED']);
const pending=new Set(['OPEN','PENDING','SUBMITTED','TRIGGER PENDING',
  'PARTIALLY FILLED','CANCEL PENDING','MODIFY PENDING','UNKNOWN',
  'SCHEDULED','TRIGGERED','ACTIVE','VALIDATION PENDING',
  'PUT ORDER REQ RECEIVED','EXIT_REQUESTED']);
export interface RestartPositionJournal{
  id:unknown;
  brokerAccountId:unknown;
  brokerInstrumentKey:unknown;
  productType:unknown;
  status:unknown;
  quantity:unknown;
  lotSize:unknown;
  exitFilledQuantity?:unknown;
  exitBrokerOrderId?:unknown;
}
export interface RestartReadOnlyInputs{
  expectedAccountId:string;
  expectedPositionId:string;
  journalPositions:unknown;
  brokerConnected:unknown;
  brokerAccountId:unknown;
  brokerPositions:unknown;
  brokerOrderBook:unknown;
  brokerGttOrders:unknown;
  entryAttempt:unknown;
}
export interface NrmlRestartQuarantineReport{
  status:'INVALID_RESTART_JOURNAL'|'BROKER_READ_UNAVAILABLE'|
    'BROKER_OR_JOURNAL_CONFLICT'|'RESTART_OBSERVED_ONLY_QUARANTINED';
  reasonCodes:readonly string[];
  sameContractOpenJournalPositions:number;
  matchingBrokerNrmlPositions:number;
  brokerNetMatchesJournalRemainder:boolean;
  brokerSellOrderCandidates:number;
  brokerGttSellRuleCandidates:number;
  taggedSellOrderCandidates:number;
  unresolvedBrokerBuyCandidates:number;
  journaledExitIdVisibleInOrderBook:boolean;
  independentExchangeStopAckCertified:false;
  brokerSnapshotFreshnessCertified:false;
  duplicateSellRetryAuthorized:false;
  liveNrmlBuyAuthorized:false;
  manualReconciliationRequired:true;
  brokerWrites:0;
}
const make=(status:NrmlRestartQuarantineReport['status'],
 reasons:string[],c:Partial<NrmlRestartQuarantineReport>={}):
 NrmlRestartQuarantineReport=>({
  status,reasonCodes:[...new Set(reasons)].sort(),
  sameContractOpenJournalPositions:c.sameContractOpenJournalPositions??0,
  matchingBrokerNrmlPositions:c.matchingBrokerNrmlPositions??0,
  brokerNetMatchesJournalRemainder:c.brokerNetMatchesJournalRemainder===true,
  brokerSellOrderCandidates:c.brokerSellOrderCandidates??0,
  brokerGttSellRuleCandidates:c.brokerGttSellRuleCandidates??0,
  taggedSellOrderCandidates:c.taggedSellOrderCandidates??0,
  unresolvedBrokerBuyCandidates:c.unresolvedBrokerBuyCandidates??0,
  journaledExitIdVisibleInOrderBook:c.journaledExitIdVisibleInOrderBook===true,
  independentExchangeStopAckCertified:false,
  brokerSnapshotFreshnessCertified:false,
  duplicateSellRetryAuthorized:false,
  liveNrmlBuyAuthorized:false,
  manualReconciliationRequired:true,brokerWrites:0
});
/**
 * Unknown or missing broker rows NEVER turn into "no outstanding orders".
 * Scope is the exact instrument and account, NOT an account-wide risk signoff.
 */
export function auditNrmlRestartQuarantine(
  input:RestartReadOnlyInputs
):NrmlRestartQuarantineReport{
  if(!input||!text(input.expectedAccountId)||!text(input.expectedPositionId)||
     !Array.isArray(input.journalPositions))
    return make('INVALID_RESTART_JOURNAL',['DURABLE_RESTART_SCOPE_OR_POSITION_LIST_INVALID']);
  const selected=input.journalPositions.filter(x=>row(x)&&x.id===input.expectedPositionId);
  if(selected.length!==1||!row(selected[0]))
    return make('INVALID_RESTART_JOURNAL',['ORIGINAL_POSITION_NOT_UNIQUELY_RECORDED']);
  const p=selected[0];
  if(p.productType!=='NRML'||!text(p.brokerInstrumentKey)||
     p.brokerAccountId!==input.expectedAccountId||
     !pos(p.quantity)||!pos(p.lotSize)||
     p.quantity%p.lotSize!==0||
     !unsigned(p.exitFilledQuantity??0)||
     p.exitFilledQuantity!==undefined&&
       (p.exitFilledQuantity as number)>p.quantity||
     (p.exitBrokerOrderId!==null&&p.exitBrokerOrderId!==undefined&&
       !text(p.exitBrokerOrderId)))
    return make('INVALID_RESTART_JOURNAL',['UNVERIFIED_POSITION_PRODUCT_ACCOUNT_OR_EXIT_LEDGER']);
  const reasons:string[]=[];
  if(!['OPEN','EXIT_REQUESTED','EXIT_PENDING','EXIT_FAILED',
        'PARTIALLY_CLOSED'].includes(String(p.status)))
    reasons.push('POSITION_NOT_IN_RECONCILABLE_LIVE_HOLDING_STATE');
  const siblingPositions=input.journalPositions.filter(x=>
    row(x)&&x.brokerAccountId===input.expectedAccountId&&
    x.brokerInstrumentKey===p.brokerInstrumentKey&&
    x.productType==='NRML'&&['OPEN','EXIT_REQUESTED','EXIT_PENDING',
      'EXIT_FAILED','PARTIALLY_CLOSED'].includes(String(x.status)));
  const localCount=siblingPositions.length;
  if(localCount!==1)reasons.push('MULTIPLE_OR_MISSING_DURABLE_NRML_HOLDINGS');
  if(!row(input.entryAttempt)||input.entryAttempt.id===undefined)
    reasons.push('ORIGINAL_ENTRY_ORDER_JOURNAL_UNAVAILABLE');
  else if(['CREATED','SUBMITTED','OPEN','UNKNOWN','PARTIALLY_FILLED']
      .includes(String(input.entryAttempt.orderStatus)))
    reasons.push('ORIGINAL_BUY_REMAINDER_OR_ACK_UNRESOLVED');
  else if(input.entryAttempt.brokerAccountId!==input.expectedAccountId||
      input.entryAttempt.brokerInstrumentKey!==p.brokerInstrumentKey)
    reasons.push('ORIGINAL_BUY_JOURNAL_ACCOUNT_OR_CONTRACT_MISMATCH');
  const counts:Partial<NrmlRestartQuarantineReport>={
    sameContractOpenJournalPositions:localCount
  };
  if(input.brokerConnected!==true||
     input.brokerAccountId!==input.expectedAccountId)
    return make('BROKER_READ_UNAVAILABLE',[
      ...reasons,'BROKER_CONNECTED_ACCOUNT_MISMATCH_OR_DISCONNECTED'
    ],counts);
  if(!Array.isArray(input.brokerPositions)||
     !Array.isArray(input.brokerOrderBook)||
     !Array.isArray(input.brokerGttOrders))
    return make('BROKER_READ_UNAVAILABLE',[
      ...reasons,'BROKER_PORTFOLIO_ORDERBOOK_OR_GTT_READ_UNAVAILABLE'
    ],counts);
  const brokerNetRows=input.brokerPositions.filter(x=>row(x)&&
    x.instrument_token===p.brokerInstrumentKey&&x.product==='D');
  counts.matchingBrokerNrmlPositions=brokerNetRows.length;
  if(brokerNetRows.length!==1||!row(brokerNetRows[0]))
    reasons.push('BROKER_NRML_POSITION_MISSING_OR_DUPLICATED');
  else{
    const net=numeric(brokerNetRows[0].net_quantity);
    const remaining=(p.quantity as number)-Number(p.exitFilledQuantity??0);
    if(net!==null&&net===remaining)
      counts.brokerNetMatchesJournalRemainder=true;
    else reasons.push('CURRENT_BROKER_NET_DISAGREES_WITH_DURABLE_EXIT_LEDGER');
  }
  if(input.brokerPositions.some(x=>row(x)&&
     x.instrument_token===p.brokerInstrumentKey&&x.product!=='D'))
    reasons.push('SAME_OPTION_HAS_OTHER_PRODUCT_POSITION');
  const tag=emaBrokerOrderTag('SELL',p.id as string);
  const expectedExitId=p.exitBrokerOrderId;
  const seenSellIds=new Set<string>();
  let brokerSellCandidates=0,tagged=0,buys=0,exitIdMatches=0;
  for(const x of input.brokerOrderBook){
    if(!row(x)||!text(x.instrument_token)){
      reasons.push('BROKER_ORDER_BOOK_ROW_MALFORMED');continue;
    }
    if(x.instrument_token!==p.brokerInstrumentKey)continue;
    if(x.product!=='D'){
      reasons.push('SAME_OPTION_OTHER_PRODUCT_ORDER_UNRESOLVED');continue;
    }
    const status=upper(x.status),side=upper(x.transaction_type);
    if(!pending.has(status)&&!terminal.has(status)){
      reasons.push('UNKNOWN_SAME_OPTION_BROKER_ORDER_STATUS');continue;
    }
    if(side!=='BUY'&&side!=='SELL'){
      reasons.push('UNKNOWN_SAME_OPTION_BROKER_ORDER_SIDE');continue;
    }
    if(side==='BUY'){
      if(pending.has(status)){buys++;reasons.push('UNRESOLVED_BROKER_BUY_MAY_INCREASE_NET');}
      continue;
    }
    if(x.tag===tag)tagged++;
    if(text(expectedExitId)&&x.order_id===expectedExitId)exitIdMatches++;
    const filled=numeric(x.filled_quantity);
    if(filled===null){
      reasons.push('BROKER_SELL_FILL_QUANTITY_UNKNOWN');
    }else if(filled>0){
      reasons.push('BROKER_SELL_HISTORY_REQUIRES_EXIT_LEDGER_RECONCILIATION');
    }
    if(pending.has(status)||filled===null||filled>0){
      brokerSellCandidates++;
      if(!text(x.order_id)||seenSellIds.has(x.order_id))
        reasons.push('DUPLICATE_OR_UNKNOWN_SELL_ORDER_ID');
      else seenSellIds.add(x.order_id);
    }
  }
  counts.brokerSellOrderCandidates=brokerSellCandidates;
  counts.taggedSellOrderCandidates=tagged;
  counts.unresolvedBrokerBuyCandidates=buys;
  counts.journaledExitIdVisibleInOrderBook=exitIdMatches===1;
  if(tagged>1||exitIdMatches>1)
    reasons.push('MULTIPLE_TAGGED_OR_JOURNALED_SELL_ORDERS');
  if(text(expectedExitId)&&exitIdMatches!==1)
    reasons.push('JOURNALED_EXIT_ORDER_NOT_UNIQUELY_VISIBLE_IN_CURRENT_BOOK');
  if(!text(expectedExitId)&&tagged>0)
    reasons.push('SELL_TAG_PRESENT_WHILE_JOURNAL_HAS_NO_ACK_ID');
  let gttCount=0;
  for(const x of input.brokerGttOrders){
    if(!row(x)||!text(x.instrument_token)){
      reasons.push('BROKER_GTT_ROW_MALFORMED');continue;
    }
    if(x.instrument_token!==p.brokerInstrumentKey)continue;
    if(x.product!=='D'||!Array.isArray(x.rules)){
      reasons.push('SAME_OPTION_GTT_PRODUCT_OR_RULES_AMBIGUOUS');continue;
    }
    for(const leg of x.rules){
      if(!row(leg)||!['SELL','BUY'].includes(upper(leg.transaction_type))){
        reasons.push('BROKER_GTT_LEG_UNKNOWN');continue;
      }
      const status=upper(leg.status);
      if(!pending.has(status)&&!terminal.has(status)){
        reasons.push('BROKER_GTT_LIFECYCLE_UNKNOWN');continue;
      }
      if(upper(leg.transaction_type)==='SELL'&&pending.has(status)){
        gttCount++;
      }else if(upper(leg.transaction_type)==='BUY'&&pending.has(status)){
        buys++;
        reasons.push('UNRESOLVED_GTT_BUY_MAY_INCREASE_NET');
      }
    }
  }
  counts.brokerGttSellRuleCandidates=gttCount;
  counts.unresolvedBrokerBuyCandidates=buys;
  if(brokerSellCandidates>0)reasons.push('BROKER_SELL_ORDER_MAY_ALREADY_EXIST_NO_AUTORETRY');
  if(gttCount>0)reasons.push('BROKER_GTT_SELL_MAY_TRIGGER_NO_AUTORETRY');
  if(brokerSellCandidates===0&&gttCount===0)
    reasons.push('NO_VISIBLE_SELL_NOT_PROOF_PREVIOUS_ATTEMPT_FAILED');
  // Even an apparently coherent report is a stale/non-atomic observation
  // and cannot override the Phase90 NRML live interlock or retry a SELL.
  const hasHardConflict=reasons.some(r=>r!==
    'NO_VISIBLE_SELL_NOT_PROOF_PREVIOUS_ATTEMPT_FAILED');
  return make(hasHardConflict?'BROKER_OR_JOURNAL_CONFLICT':
    'RESTART_OBSERVED_ONLY_QUARANTINED',reasons,counts);
}
export interface ReadOnlyRestartBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getVerifiedNrmlPositionRows():Promise<unknown>;
  getOrderBook():Promise<unknown>;
  getGttOrders():Promise<unknown>;
}
export async function reviewNrmlRestartReadOnly(
 broker:ReadOnlyRestartBroker,
 input:Omit<RestartReadOnlyInputs,
  'brokerConnected'|'brokerAccountId'|'brokerPositions'|
  'brokerOrderBook'|'brokerGttOrders'>
):Promise<NrmlRestartQuarantineReport>{
 if(!broker||typeof broker.getLiveConnectionStatus!=='function')
   return make('BROKER_READ_UNAVAILABLE',['BROKER_CONNECTION_REVIEW_METHOD_MISSING']);
 let conn:{isConnected:boolean;userId?:string};
 try{conn=broker.getLiveConnectionStatus();}
 catch{return make('BROKER_READ_UNAVAILABLE',['BROKER_CONNECTION_REVIEW_ERROR']);}
 if(conn?.isConnected!==true||conn.userId!==input.expectedAccountId)
   return make('BROKER_READ_UNAVAILABLE',['BROKER_CONNECTED_ACCOUNT_MISMATCH_OR_DISCONNECTED']);
 if(['getVerifiedNrmlPositionRows','getOrderBook','getGttOrders']
     .some(k=>typeof broker[k as keyof ReadOnlyRestartBroker]!=='function'))
   return make('BROKER_READ_UNAVAILABLE',['BROKER_READ_ONLY_METHOD_UNAVAILABLE']);
 let brokerPositions:unknown,brokerOrderBook:unknown,brokerGttOrders:unknown;
 try{
   [brokerOrderBook,brokerGttOrders]=await Promise.all([
     broker.getOrderBook(),broker.getGttOrders()
   ]);
   // Read current portfolio last; does not make snapshots atomic.
   brokerPositions=await broker.getVerifiedNrmlPositionRows();
 }catch{return make('BROKER_READ_UNAVAILABLE',['BROKER_READ_ONLY_REQUEST_FAILED']);}
 return auditNrmlRestartQuarantine({...input,
   brokerConnected:true,brokerAccountId:conn.userId,
   brokerPositions,brokerOrderBook,brokerGttOrders});
}
