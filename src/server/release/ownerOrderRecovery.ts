import type Database from 'better-sqlite3';
import {resolveServerBrokerOwnerBinding,type VerifiedPrincipal,type NativeConnectionIdentity} from './serverBrokerOwnerBinding.js';
import {validOrderIntent,reconcileOrderEvidence,type OrderIntentEvidence} from './brokerOrderReconciliationEvidence.js';
import {guardFullBrokerOrderBook} from '../engine/ema15m/adaptiveUpstoxNativeReadCardinalityGuard.js';
import {recordPreparedEntryEvidence} from './entryPreparationJournal.js';
import type {DurableIntent} from './durableOrderIntentLedger.js';

type NativeProvider={
 getLiveConnectionStatus:()=>{isConnected:boolean;userId?:string};
 getBrokerAuthEpoch:()=>number;
 getOrderBook:()=>Promise<unknown>;
 getOrderDetails:(orderId:string)=>Promise<unknown>;
 getOrderTrades:(orderId:string)=>Promise<unknown>;
};
export type OwnerRecoveryProvider=NativeProvider;
type Target={intent:DurableIntent;orderId:string|null;authEpoch:number;state:string;observedAt:number;reservedPaise:number;reservationState:string};
type Result={status:'RECORDED'|'REPLAY'|'UNKNOWN'|'DENIED';reason:string;orderAuthorized:false;capitalReleaseAuthorized:false;retryAuthorized:false;accountFlatCertified:false};
const out=(status:Result['status'],reason:string):Result=>({status,reason,orderAuthorized:false,capitalReleaseAuthorized:false,retryAuthorized:false,accountFlatCertified:false});
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(v);
const orderIdValid=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(v);
function target(db:Database.Database,principal:VerifiedPrincipal,connection:NativeConnectionIdentity,intentId:string,now:number):Target|null{
 if(!id(intentId))return null;
 const active=db.prepare('SELECT session_version FROM users WHERE id=? AND is_active=1').get(principal.userId) as {session_version:number}|undefined;
 const binding=resolveServerBrokerOwnerBinding(principal,active?.session_version??null,connection,process.env.BROKER_PREPARATION_OWNER_MAP,now);
 if(!binding)return null;
 const r=db.prepare(`SELECT i.*,r.amount_paise,r.state AS reservation_state FROM execution_intent_v1 i
  JOIN capital_reservation_v1 r ON i.account_scope=r.account_scope AND i.intent_id=r.intent_id AND i.owner_id=r.owner_id
  WHERE i.account_scope=? AND i.owner_id=? AND i.intent_id=?`).get(binding.accountId,binding.ownerId,intentId) as
  {instrument_key:string;product:'I'|'D';side:'BUY'|'SELL';quantity:number;tag:string;broker_order_id:string|null;state:string;observed_at:number;amount_paise:number;reservation_state:string}|undefined;
 if(!r||!Number.isSafeInteger(r.amount_paise)||r.amount_paise<=0||!['HELD','UNKNOWN'].includes(r.reservation_state)||
  !Number.isSafeInteger(r.observed_at)||r.observed_at<=0||r.observed_at>now||
  (r.broker_order_id!==null&&!orderIdValid(r.broker_order_id)))return null;
 const intent:DurableIntent={accountScope:binding.accountId,ownerId:binding.ownerId,intentId,instrumentKey:r.instrument_key,
  product:r.product,side:r.side,quantity:r.quantity,tag:r.tag};
 if(!validOrderIntent({orderId:r.broker_order_id??'unbound',instrumentKey:intent.instrumentKey,product:intent.product,side:intent.side,quantity:intent.quantity,tag:intent.tag}))return null;
 return {intent,orderId:r.broker_order_id,authEpoch:binding.authEpoch,state:r.state,observedAt:r.observed_at,
  reservedPaise:r.amount_paise,reservationState:r.reservation_state};
}
function connection(p:NativeProvider):NativeConnectionIdentity{
 const s=p.getLiveConnectionStatus();return {isConnected:s.isConnected,userId:s.userId,authEpoch:p.getBrokerAuthEpoch()};
}
/** Only a unique exact current-day tag match may discover an unbound order.
 * No match is UNKNOWN, never a proof that no order was sent. */
export function resolveRecoveryOrderId(i:DurableIntent,raw:unknown):string|null{
 const rows=guardFullBrokerOrderBook(raw);
 if(!rows)return null;
 const matches=rows.filter(r=>r.tag===i.tag);
 if(matches.length!==1)return null;
 const r=matches[0];
 if(!orderIdValid(r.order_id)||r.instrument_token!==i.instrumentKey||r.product!==i.product||
  r.transaction_type!==i.side||r.quantity!==i.quantity)return null;
 return r.order_id;
}
/** Authenticated metadata reconciliation only. Native endpoints are reads;
 * no retry, release, dispatch or closure is possible. Recheck original
 * session, account generation, persisted target and bounded time after await.
 * An unresolved or ambiguous observation retains all capital. */
export async function reconcileOwnerPreparedOrder(db:Database.Database,principal:VerifiedPrincipal,provider:NativeProvider,
 intentId:string,clock:()=>number=Date.now):Promise<Result>{
 if(!principal||!id(principal.userId)||!id(intentId)||!provider)return out('DENIED','INVALID_RECOVERY_REQUEST');
 try{
  const start=clock();
  const initial=db.transaction(()=>target(db,principal,connection(provider),intentId,start))();
  if(!initial)return out('DENIED','RECOVERY_TARGET_UNAVAILABLE');
  let orderId=initial.orderId;
  if(!orderId)orderId=resolveRecoveryOrderId(initial.intent,await provider.getOrderBook());
  if(!orderId)return out('UNKNOWN','ORDER_IDENTITY_UNRESOLVED');
  // Do not continue reading if the native session changed during discovery.
  const interim=connection(provider);
  if(!interim.isConnected||interim.userId!==initial.intent.accountScope||interim.authEpoch!==initial.authEpoch)
   return out('UNKNOWN','BROKER_SESSION_CHANGED');
  const expected:OrderIntentEvidence={orderId,instrumentKey:initial.intent.instrumentKey,product:initial.intent.product,
   side:initial.intent.side,quantity:initial.intent.quantity,tag:initial.intent.tag};
  const [detail,trades]=await Promise.all([provider.getOrderDetails(orderId),provider.getOrderTrades(orderId)]);
  const now=clock();
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(now)||now<start||now-start>15000)return out('UNKNOWN','RECOVERY_EVIDENCE_STALE');
  return db.transaction(()=>{
   const current=target(db,principal,connection(provider),intentId,now);
   if(!current||JSON.stringify(current)!==JSON.stringify(initial))return out('DENIED','RECOVERY_TARGET_OR_SESSION_CHANGED');
   const evidence=reconcileOrderEvidence(expected,detail,trades);
   const saved=recordPreparedEntryEvidence(db,initial.intent,orderId,detail,trades,now);
   if(evidence.status==='UNKNOWN'||saved.status==='DENIED')return out('UNKNOWN','BROKER_EVIDENCE_UNRESOLVED_CAPITAL_RETAINED');
   if(saved.status==='REPLAY')return out('REPLAY','EXISTING_EVIDENCE_CAPITAL_RETAINED');
   if(saved.status!=='RECORDED')return out('UNKNOWN','RECOVERY_WRITE_UNCONFIRMED');
   return out('RECORDED','BROKER_EVIDENCE_RECORDED_CAPITAL_RETAINED');
  }).immediate();
 }catch{return out('UNKNOWN','RECOVERY_UNAVAILABLE_CAPITAL_RETAINED');}
}
