/**
 * Phase94: read-only census of OTHER broker SELL/GTT/BUY activity on the
 * exact positional NRML option. The expected child is checked separately
 * in Phase92–93; it is NOT counted as its own conflicting sibling.
 *
 * These are account lists, never atomic proof of ABSENCE across all history.
 * Cancellation ACCEPTED != cancelled, and an untriggered GTT need not appear
 * in the regular exchange order book. Zero visible conflicts never grants
 * NRML entry or stop release permission.
 */
type Row=Record<string,unknown>;
const row=(x:unknown):x is Row=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const str=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=256;
const upper=(x:unknown)=>
  typeof x==='string'?x.trim().toUpperCase():'';
const terminal=new Set([
  'COMPLETE','COMPLETED','CANCELLED','CANCELED',
  'REJECTED','EXPIRED','FAILED'
]);
const active=new Set([
  'OPEN','PENDING','TRIGGER PENDING','PARTIALLY FILLED','ACTIVE',
  'SCHEDULED','TRIGGERED','CANCEL PENDING','MODIFY PENDING',
  'VALIDATION PENDING','PUT ORDER REQ RECEIVED','UNKNOWN'
]);
const asFilled=(x:unknown):number|null=>{
  if(typeof x==='number')return Number.isSafeInteger(x)&&x>=0?x:null;
  if(typeof x==='string'&&/^(?:0|[1-9][0-9]*)$/.test(x)){
    const n=Number(x);return Number.isSafeInteger(n)?n:null;
  }
  return null;
};
export interface ContendingNrmlOrdersReport{
  status:'SOURCE_INCOMPLETE'|'BROKER_STATE_CONFLICT'|
    'NO_VISIBLE_COMPETING_BROKER_ACTIVITY_NOT_CERTIFIED';
  reasonCodes:readonly string[];
  otherSellOrderCandidates:number;
  otherGttSellRuleCandidates:number;
  unresolvedSameContractBuyOrders:number;
  parentGttListedExactlyOnce:boolean;
  accountWideExecutionReconciled:false;
  liveNrmlBuyAuthorized:false;
}
const make=(reasons:string[],sells=0,gtts=0,buys=0,
  parent=false,complete=true):ContendingNrmlOrdersReport=>({
  status:!complete?'SOURCE_INCOMPLETE':reasons.length>0?
    'BROKER_STATE_CONFLICT':
    'NO_VISIBLE_COMPETING_BROKER_ACTIVITY_NOT_CERTIFIED',
  reasonCodes:[...new Set(reasons)].sort(),
  otherSellOrderCandidates:sells,
  otherGttSellRuleCandidates:gtts,
  unresolvedSameContractBuyOrders:buys,
  parentGttListedExactlyOnce:parent,
  accountWideExecutionReconciled:false,
  liveNrmlBuyAuthorized:false
});
export function auditNrmlCompetingOrders(args:{
  instrumentKey:string;
  parentGttId:string;
  generatedChildOrderId:unknown;
  expectedLongQuantity:number;
  orderBook:unknown;
  gttOrders:unknown;
}):ContendingNrmlOrdersReport{
  if(!args||!str(args.instrumentKey)||!str(args.parentGttId)||
     !Number.isSafeInteger(args.expectedLongQuantity)||
     args.expectedLongQuantity<=0)
    return make(['INVALID_NRML_CENSUS_SCOPE'],0,0,0,false,false);
  if(!Array.isArray(args.orderBook)||!Array.isArray(args.gttOrders))
    return make(['FULL_ORDER_BOOK_OR_GTT_LIST_UNAVAILABLE'],0,0,0,false,false);
  const reasons:string[]=[];
  let sells=0,gtts=0,buys=0,parents=0;
  for(const raw of args.orderBook){
    if(!row(raw)||!str(raw.instrument_token)){
      reasons.push('MALFORMED_FULL_ORDER_BOOK_ROW');continue;
    }
    if(raw.instrument_token!==args.instrumentKey)continue;
    if(raw.product!=='D'){
      reasons.push('SAME_OPTION_OTHER_PRODUCT_ORDER_PRESENT');
      continue;
    }
    const id=raw.order_id,side=upper(raw.transaction_type),
      status=upper(raw.status);
    if(!str(id)||!['BUY','SELL'].includes(side)||
       (!active.has(status)&&!terminal.has(status))){
      reasons.push('UNKNOWN_SAME_CONTRACT_BROKER_ORDER');
      continue;
    }
    if(str(args.generatedChildOrderId)&&id===args.generatedChildOrderId)
      continue; // exact child still checked for duplicate rows in Phase93.
    if(side==='BUY'){
      if(active.has(status)){
        buys++;
        reasons.push('UNRESOLVED_SAME_CONTRACT_BUY_CAN_CHANGE_NRML_NET');
      }
      continue;
    }
    const fill=asFilled(raw.filled_quantity);
    if(fill===null){
      sells++;reasons.push('OTHER_SELL_FILLED_QUANTITY_UNKNOWN');
    }else if(fill>0){
      sells++;reasons.push('OTHER_SELL_EXECUTIONS_NOT_IN_CHILD_NET_CONSERVATION');
    }else if(active.has(status)){
      sells++;reasons.push('OTHER_BROKER_SELL_CAN_EXECUTE_OR_CANCEL_PENDING');
    }
    // A terminal cancelled SELL with explicitly zero fills is historical
    // and not an active competitor; unknown status/quantity stays blocked.
  }
  for(const raw of args.gttOrders){
    if(!row(raw)||!str(raw.instrument_token)){
      reasons.push('MALFORMED_FULL_GTT_LIST_ROW');continue;
    }
    if(raw.instrument_token!==args.instrumentKey)continue;
    if(raw.product!=='D'){
      reasons.push('SAME_OPTION_OTHER_PRODUCT_GTT_PRESENT');continue;
    }
    const id=raw.gtt_order_id;
    if(!str(id)||!Array.isArray(raw.rules)){
      reasons.push('MALFORMED_SAME_CONTRACT_GTT_RULES');continue;
    }
    if(id===args.parentGttId){
      parents++;
      if(raw.quantity!==args.expectedLongQuantity)
        reasons.push('PARENT_GTT_LIST_QUANTITY_MISMATCH');
      continue;
    }
    for(const rule of raw.rules){
      if(!row(rule)){
        reasons.push('UNKNOWN_OTHER_GTT_RULE');continue;
      }
      const side=upper(rule.transaction_type),status=upper(rule.status);
      if(!['BUY','SELL'].includes(side)||(!active.has(status)&&!terminal.has(status))){
        reasons.push('UNKNOWN_OTHER_GTT_RULE');continue;
      }
      if(side==='BUY'){
        if(active.has(status)){
          buys++;reasons.push('OTHER_ACTIVE_GTT_BUY_MAY_CHANGE_NRML_NET');
        }
        continue;
      }
      if(active.has(status)){
        gtts++;reasons.push('OTHER_ACTIVE_GTT_SELL_MAY_TRIGGER');
      }else if(['COMPLETE','COMPLETED'].includes(status)){
        gtts++;reasons.push('OTHER_COMPLETED_GTT_SELL_NOT_IN_CHILD_LEDGER');
      }
    }
  }
  if(parents!==1)reasons.push('PARENT_GTT_MISSING_OR_DUPLICATED_IN_ACCOUNT_GTT_LIST');
  return make(reasons,sells,gtts,buys,parents===1);
}
