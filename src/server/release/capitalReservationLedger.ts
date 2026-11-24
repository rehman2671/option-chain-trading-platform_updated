import type Database from 'better-sqlite3';

/** Isolated SQLite reservation primitive. No broker calls or order authorization.
 * Budget evidence must be authenticated by a future unified gateway. Monetary
 * values use integer paise, account-wide (not separate per user). */
export interface ReservationInput {
  accountScope:string; ownerId:string; intentId:string; amountPaise:number;
  budgetPaise:number; budgetObservedAt:number;
}
type Result={status:'HELD'|'EXISTING_HELD'|'EXISTING_UNKNOWN'|'DENIED';reason:string;orderAuthorized:false};
const identifier=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(v);
const money=(v:number)=>Number.isSafeInteger(v)&&v>0;
const denied=(reason:string):Result=>({status:'DENIED',reason,orderAuthorized:false});
export function initCapitalReservationLedger(db:Database.Database):void{
  db.exec(`CREATE TABLE IF NOT EXISTS capital_reservation_v1 (
    account_scope TEXT NOT NULL, owner_id TEXT NOT NULL, intent_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise>0),
    state TEXT NOT NULL CHECK(state IN ('HELD','UNKNOWN')),
    created_at INTEGER NOT NULL, PRIMARY KEY(account_scope,intent_id)
  )`);
}
export function reserveCapitalReadOnlyAuthority(db:Database.Database,i:ReservationInput,now:number):Result{
  if(!i||!identifier(i.accountScope)||!identifier(i.ownerId)||!identifier(i.intentId)||
    !money(i.amountPaise)||!money(i.budgetPaise)||!Number.isSafeInteger(now)||
    !Number.isSafeInteger(i.budgetObservedAt)||i.budgetObservedAt<=0||
    i.budgetObservedAt>now||now-i.budgetObservedAt>15000)return denied('INVALID_OR_STALE_BUDGET_INPUT');
  try{
    return db.transaction(():Result=>{
      const previous=db.prepare('SELECT owner_id,amount_paise,state FROM capital_reservation_v1 WHERE account_scope=? AND intent_id=?').get(i.accountScope,i.intentId) as {owner_id:string;amount_paise:number;state:string}|undefined;
      if(previous){
        if(previous.owner_id!==i.ownerId||previous.amount_paise!==i.amountPaise)return denied('INTENT_CONFLICT');
        return {status:previous.state==='HELD'?'EXISTING_HELD':'EXISTING_UNKNOWN',reason:'Existing reservation; never resubmit an order based on replay.',orderAuthorized:false};
      }
      const row=db.prepare('SELECT COALESCE(SUM(amount_paise),0) AS total FROM capital_reservation_v1 WHERE account_scope=?').get(i.accountScope) as {total:number};
      if(!Number.isSafeInteger(row.total)||row.total<0||row.total>i.budgetPaise||i.amountPaise>i.budgetPaise-row.total)return denied('INSUFFICIENT_UNRESERVED_BUDGET');
      const inserted=db.prepare("INSERT INTO capital_reservation_v1(account_scope,owner_id,intent_id,amount_paise,state,created_at) VALUES(?,?,?,?,'HELD',?)").run(i.accountScope,i.ownerId,i.intentId,i.amountPaise,now);
      if(inserted.changes!==1)throw Error('RESERVATION_WRITE_UNCONFIRMED');
      const check=db.prepare('SELECT owner_id,amount_paise,state FROM capital_reservation_v1 WHERE account_scope=? AND intent_id=?').get(i.accountScope,i.intentId) as {owner_id:string;amount_paise:number;state:string}|undefined;
      if(!check||check.owner_id!==i.ownerId||check.amount_paise!==i.amountPaise||check.state!=='HELD')throw Error('RESERVATION_READBACK_UNCONFIRMED');
      return {status:'HELD',reason:'Reservation persisted; no order permission.',orderAuthorized:false};
    }).immediate();
  }catch{return denied('RESERVATION_STORAGE_UNAVAILABLE');}
}
/** Ambiguous order outcomes keep all capital held. No expiry or unverified release. */
export function markReservationUnknown(db:Database.Database,accountScope:string,ownerId:string,intentId:string):boolean{
  if(!identifier(accountScope)||!identifier(ownerId)||!identifier(intentId))return false;
  try{return db.prepare("UPDATE capital_reservation_v1 SET state='UNKNOWN' WHERE account_scope=? AND owner_id=? AND intent_id=? AND state IN ('HELD','UNKNOWN')").run(accountScope,ownerId,intentId).changes===1;}catch{return false;}
}
