import type Database from 'better-sqlite3';
import {reconcileOrderEvidence,type OrderIntentEvidence,type OrderEvidence} from './brokerOrderReconciliationEvidence.js';

/** Isolated persistence primitive: no broker dispatch, retry, capital release or account-flat authority.
 * The future gateway must independently authenticate account/owner and broker evidence. */
export interface DurableIntent {
  accountScope:string; ownerId:string; intentId:string; instrumentKey:string;
  product:'I'|'D'; side:'BUY'|'SELL'; quantity:number; tag:string;
}
type Outcome={status:'CLAIMED'|'REPLAY'|'RECORDED'|'DENIED';reason:string;orderAuthorized:false};
const outcome=(status:Outcome['status'],reason:string):Outcome=>({status,reason,orderAuthorized:false});
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(v);
const valid=(i:DurableIntent)=>!!i&&id(i.accountScope)&&id(i.ownerId)&&id(i.intentId)&&
  typeof i.instrumentKey==='string'&&/^(NSE_FO|BSE_FO)\|[0-9]+$/.test(i.instrumentKey)&&
  ['I','D'].includes(i.product)&&['BUY','SELL'].includes(i.side)&&Number.isSafeInteger(i.quantity)&&i.quantity>0&&
  typeof i.tag==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(i.tag);
type Row={owner_id:string;instrument_key:string;product:string;side:string;quantity:number;tag:string;broker_order_id:string|null;state:string;filled_quantity:number|null;terminal:number;observed_at:number};
const same=(r:Row,i:DurableIntent)=>r.owner_id===i.ownerId&&r.instrument_key===i.instrumentKey&&r.product===i.product&&r.side===i.side&&r.quantity===i.quantity&&r.tag===i.tag;
const read=(db:Database.Database,i:DurableIntent)=>db.prepare('SELECT * FROM execution_intent_v1 WHERE account_scope=? AND intent_id=?').get(i.accountScope,i.intentId) as Row|undefined;
export function initDurableOrderIntentLedger(db:Database.Database):void{
  db.exec(`CREATE TABLE IF NOT EXISTS execution_intent_v1(
    account_scope TEXT NOT NULL,owner_id TEXT NOT NULL,intent_id TEXT NOT NULL,instrument_key TEXT NOT NULL,
    product TEXT NOT NULL,side TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),tag TEXT NOT NULL,
    broker_order_id TEXT,state TEXT NOT NULL,filled_quantity INTEGER,terminal INTEGER NOT NULL DEFAULT 0,
    observed_at INTEGER NOT NULL,PRIMARY KEY(account_scope,intent_id),UNIQUE(account_scope,tag),UNIQUE(account_scope,broker_order_id)
  )`);
}
export function claimDurableIntent(db:Database.Database,i:DurableIntent,now:number):Outcome{
  if(!valid(i)||!Number.isSafeInteger(now)||now<=0)return outcome('DENIED','INVALID_INTENT');
  try{return db.transaction(()=>{
    const old=read(db,i);
    if(old)return same(old,i)?outcome('REPLAY','Existing durable intent; never resubmit'):outcome('DENIED','INTENT_CONFLICT');
    const w=db.prepare(`INSERT INTO execution_intent_v1(account_scope,owner_id,intent_id,instrument_key,product,side,quantity,tag,state,observed_at)
      VALUES(?,?,?,?,?,?,?,?,'CLAIMED_UNRESOLVED',?)`).run(i.accountScope,i.ownerId,i.intentId,i.instrumentKey,i.product,i.side,i.quantity,i.tag,now);
    const saved=read(db,i);
    if(w.changes!==1||!saved||!same(saved,i))throw Error('UNCONFIRMED_WRITE');
    return outcome('CLAIMED','Durable unresolved intent; no dispatch authority');
  }).immediate();}catch{return outcome('DENIED','INTENT_STORAGE_OR_IDENTITY_CONFLICT');}
}
/** Record evidence against the immutable intent, with no inferred terminal outcome.
 * A contradiction remains unresolved; callers must obtain new broker evidence. */
export function recordIntentEvidence(db:Database.Database,i:DurableIntent,orderId:string,detail:unknown,trades:unknown,now:number):Outcome{
  if(!valid(i)||typeof orderId!=='string'||!Number.isSafeInteger(now)||now<=0)return outcome('DENIED','INVALID_EVIDENCE_INPUT');
  const expected:OrderIntentEvidence={orderId,instrumentKey:i.instrumentKey,product:i.product,side:i.side,quantity:i.quantity,tag:i.tag};
  const evidence:OrderEvidence=reconcileOrderEvidence(expected,detail,trades);
  if(evidence.status==='UNKNOWN'||evidence.filledQuantity===null)return outcome('DENIED','BROKER_EVIDENCE_UNVERIFIED');
  try{return db.transaction(()=>{
    const old=read(db,i);
    if(!old||!same(old,i)||now<old.observed_at||(old.broker_order_id!==null&&old.broker_order_id!==orderId)||
      (old.filled_quantity!==null&&evidence.filledQuantity!<old.filled_quantity))return outcome('DENIED','INTENT_EVIDENCE_CONFLICT');
    if(old.terminal===1)return old.state===evidence.status&&old.filled_quantity===evidence.filledQuantity?
      outcome('REPLAY','Terminal evidence already recorded'):outcome('DENIED','TERMINAL_EVIDENCE_CONFLICT');
    const w=db.prepare(`UPDATE execution_intent_v1 SET broker_order_id=?,state=?,filled_quantity=?,terminal=?,observed_at=?
      WHERE account_scope=? AND intent_id=? AND owner_id=? AND terminal=0`).run(orderId,evidence.status,evidence.filledQuantity,evidence.terminal?1:0,now,i.accountScope,i.intentId,i.ownerId);
    const saved=read(db,i);
    if(w.changes!==1||!saved||saved.state!==evidence.status||saved.filled_quantity!==evidence.filledQuantity||saved.broker_order_id!==orderId||saved.terminal!==(evidence.terminal?1:0))throw Error('UNCONFIRMED_EVIDENCE');
    return outcome('RECORDED','Local order evidence only; no retry or release authority');
  }).immediate();}catch{return outcome('DENIED','EVIDENCE_STORAGE_OR_IDENTITY_CONFLICT');}
}
