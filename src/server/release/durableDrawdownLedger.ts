import type Database from 'better-sqlite3';

/** Durable account-level drawdown observations, integer paise. The gateway must
 * authenticate equity/NAV and account ownership before calling this primitive.
 * A recovered equity observation never clears a prior halt. No reset API here. */
export interface EquityObservation{accountScope:string;equityPaise:number;observedAt:number}
type Row={peak_paise:number;equity_paise:number;observed_at:number;halted:number};
type State={status:'OBSERVED'|'UNKNOWN';peakPaise:number|null;equityPaise:number|null;halted:boolean;drawdownPct:number|null;orderAuthorized:false;reason:string};
const unknown=(reason:string):State=>({status:'UNKNOWN',peakPaise:null,equityPaise:null,halted:true,drawdownPct:null,orderAuthorized:false,reason});
const validScope=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(v);
const read=(db:Database.Database,scope:string)=>db.prepare('SELECT * FROM account_drawdown_v1 WHERE account_scope=?').get(scope) as Row|undefined;
function state(r:Row,now:number):State{
  if(!Number.isSafeInteger(r.peak_paise)||r.peak_paise<=0||!Number.isSafeInteger(r.equity_paise)||r.equity_paise>r.peak_paise||
     !Number.isSafeInteger(r.observed_at)||r.observed_at<=0||r.observed_at>now||now-r.observed_at>15000||
     ![0,1].includes(r.halted))return unknown('INVALID_OR_STALE_OBSERVATION');
  return {status:'OBSERVED',peakPaise:r.peak_paise,equityPaise:r.equity_paise,halted:r.halted===1,
    drawdownPct:Math.max(0,1-r.equity_paise/r.peak_paise)*100,orderAuthorized:false,reason:'Recorded equity observation only; no order authority'};
}
export function initDurableDrawdownLedger(db:Database.Database):void{
  db.exec(`CREATE TABLE IF NOT EXISTS account_drawdown_v1(account_scope TEXT PRIMARY KEY,
    peak_paise INTEGER NOT NULL CHECK(peak_paise>0),equity_paise INTEGER NOT NULL,
    observed_at INTEGER NOT NULL,halted INTEGER NOT NULL CHECK(halted IN (0,1)))`);
}
export function readDurableDrawdown(db:Database.Database,scope:string,now:number):State{
  if(!validScope(scope)||!Number.isSafeInteger(now))return unknown('INVALID_SCOPE_OR_CLOCK');
  try{const r=read(db,scope);return r?state(r,now):unknown('NO_ACCOUNT_EQUITY_BASELINE');}catch{return unknown('STORAGE_UNAVAILABLE');}
}
export function observeDurableDrawdown(db:Database.Database,i:EquityObservation,now:number):State{
  if(!i||!validScope(i.accountScope)||!Number.isSafeInteger(i.equityPaise)||!Number.isSafeInteger(now)||
     !Number.isSafeInteger(i.observedAt)||i.observedAt<=0||i.observedAt>now||now-i.observedAt>15000)return unknown('INVALID_EQUITY_EVIDENCE');
  try{return db.transaction(()=>{
    const old=read(db,i.accountScope);
    if(old&&(!Number.isSafeInteger(old.peak_paise)||old.peak_paise<=0||![0,1].includes(old.halted)))return unknown('CORRUPT_PRIOR_STATE');
    if(old&&i.observedAt<old.observed_at)return unknown('OUT_OF_ORDER_OBSERVATION');
    if(old&&i.observedAt===old.observed_at)return old.equity_paise===i.equityPaise?state(old,now):unknown('CONFLICTING_OBSERVATION');
    if(!old&&i.equityPaise<=0)return unknown('NO_POSITIVE_PEAK_BASELINE');
    const peak=Math.max(old?.peak_paise??i.equityPaise,i.equityPaise);
    // Match the existing 15% critical drawdown tier, avoid floating-point boundary errors.
    const critical=BigInt(i.equityPaise)*100n<=BigInt(peak)*85n;
    const halted=old?.halted===1||critical?1:0;
    const w=db.prepare(`INSERT INTO account_drawdown_v1(account_scope,peak_paise,equity_paise,observed_at,halted)
      VALUES(?,?,?,?,?) ON CONFLICT(account_scope) DO UPDATE SET peak_paise=excluded.peak_paise,
      equity_paise=excluded.equity_paise,observed_at=excluded.observed_at,halted=excluded.halted`).run(i.accountScope,peak,i.equityPaise,i.observedAt,halted);
    const saved=read(db,i.accountScope);
    if(w.changes!==1||!saved||saved.peak_paise!==peak||saved.equity_paise!==i.equityPaise||saved.halted!==halted||saved.observed_at!==i.observedAt)throw Error('UNCONFIRMED_WRITE');
    return state(saved,now);
  }).immediate();}catch{return unknown('STORAGE_UNAVAILABLE');}
}
