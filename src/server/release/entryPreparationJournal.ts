import type Database from 'better-sqlite3';
import {initCapitalReservationLedger,reserveCapitalReadOnlyAuthority,markReservationUnknown} from './capitalReservationLedger.js';
import {initDurableOrderIntentLedger,claimDurableIntent,recordIntentEvidence,type DurableIntent} from './durableOrderIntentLedger.js';
import {initDurableDrawdownLedger,readDurableDrawdown} from './durableDrawdownLedger.js';
import {aggregatePortfolioGreekEvidence,type PortfolioGreekInput} from './portfolioGreekEvidence.js';

/** Internal preparation journal only. No broker dispatch or release authority.
 * A future authenticated gateway must supply trusted account binding, current
 * broker capital/Greek observations and candidate-order risk. Never expose
 * this function directly to a client or treat PREPARED as approval to trade. */
export interface PreparationInput {
  intent:DurableIntent;
  accountScope:string; ownerId:string; sessionEpoch:string;
  budget:{accountScope:string;sessionEpoch:string;availablePaise:number;observedAt:number};
  amountPaise:number; portfolio:PortfolioGreekInput;
}
type Result={status:'PREPARED'|'REPLAY'|'RECORDED'|'DENIED';reason:string;orderAuthorized:false;capitalReleaseAuthorized:false};
const result=(status:Result['status'],reason:string):Result=>({status,reason,orderAuthorized:false,capitalReleaseAuthorized:false});
const identifier=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(v);
type Reservation={owner_id:string;amount_paise:number;state:string};
function reservation(db:Database.Database,i:DurableIntent):Reservation|undefined{
  return db.prepare('SELECT owner_id,amount_paise,state FROM capital_reservation_v1 WHERE account_scope=? AND intent_id=?').get(i.accountScope,i.intentId) as Reservation|undefined;
}
export function initEntryPreparationJournal(db:Database.Database):void{
  db.transaction(()=>{initCapitalReservationLedger(db);initDurableOrderIntentLedger(db);initDurableDrawdownLedger(db);}).immediate();
}
export function prepareEntryJournal(db:Database.Database,x:PreparationInput,now:number):Result{
  if(!x||!x.intent||!x.budget||!identifier(x.accountScope)||!identifier(x.ownerId)||!identifier(x.sessionEpoch)||
    x.intent.accountScope!==x.accountScope||x.intent.ownerId!==x.ownerId||x.budget.accountScope!==x.accountScope||
    x.budget.sessionEpoch!==x.sessionEpoch||x.intent.side!=='BUY'||!Number.isSafeInteger(now)||now<=0)
    return result('DENIED','ACCOUNT_OR_INTENT_BINDING_INVALID');
  try{return db.transaction(()=>{
    // Both ledgers are inside the same outer immediate transaction. A failed
    // child operation rolls back both; an orphan is never silently repaired.
    const before=reservation(db,x.intent);
    const claim=claimDurableIntent(db,x.intent,now);
    if(claim.status==='REPLAY'){
      if(!before||before.owner_id!==x.ownerId||before.amount_paise!==x.amountPaise||!['HELD','UNKNOWN'].includes(before.state))
        throw Error('REPLAY_RESERVATION_CONFLICT');
      return result('REPLAY','Existing intent and reservation; no retry or dispatch');
    }
    if(claim.status!=='CLAIMED'||before)throw Error('INTENT_OR_RESERVATION_CONFLICT');
    const risk=readDurableDrawdown(db,x.accountScope,now);
    if(risk.status!=='OBSERVED'||risk.halted)throw Error('DRAWDOWN_EVIDENCE_BLOCKED');
    const greeks=aggregatePortfolioGreekEvidence(x.portfolio,x.accountScope,x.sessionEpoch,now);
    if(greeks.status!=='COMPLETE_INPUT_AGGREGATE')throw Error('PORTFOLIO_EVIDENCE_BLOCKED');
    // This is completeness validation, NOT a projected portfolio limit check.
    const held=reserveCapitalReadOnlyAuthority(db,{accountScope:x.accountScope,ownerId:x.ownerId,intentId:x.intent.intentId,
      amountPaise:x.amountPaise,budgetPaise:x.budget.availablePaise,budgetObservedAt:x.budget.observedAt},now);
    if(held.status!=='HELD')throw Error('CAPITAL_RESERVATION_DENIED');
    return result('PREPARED','Atomic intent and reservation recorded; no dispatch authority');
  }).immediate();}catch(e){
    const code=e instanceof Error?e.message:'';
    return result('DENIED',['REPLAY_RESERVATION_CONFLICT','INTENT_OR_RESERVATION_CONFLICT','DRAWDOWN_EVIDENCE_BLOCKED',
      'PORTFOLIO_EVIDENCE_BLOCKED','CAPITAL_RESERVATION_DENIED'].includes(code)?code:'PREPARATION_STORAGE_UNAVAILABLE');
  }
}
/** Reconcile a previously journaled intent and retain all reserved capital.
 * Unknown/contradictory broker evidence cannot authorize retry or release.
 * Even a terminal fill or zero-fill report does not certify account exposure. */
export function recordPreparedEntryEvidence(db:Database.Database,i:DurableIntent,orderId:string,detail:unknown,trades:unknown,now:number):Result{
  if(!i)return result('DENIED','INVALID_INTENT');
  try{return db.transaction(()=>{
    const held=reservation(db,i);
    if(!held||held.owner_id!==i.ownerId||!['HELD','UNKNOWN'].includes(held.state))throw Error('RESERVATION_NOT_CONFIRMED');
    const recorded=recordIntentEvidence(db,i,orderId,detail,trades,now);
    if(!markReservationUnknown(db,i.accountScope,i.ownerId,i.intentId))throw Error('RESERVATION_RETENTION_UNCONFIRMED');
    if(recorded.status==='DENIED')return result('DENIED','UNRESOLVED_EVIDENCE_CAPITAL_RETAINED');
    if(recorded.status==='REPLAY')return result('REPLAY','Previously recorded evidence; capital retained');
    return result('RECORDED','Local broker evidence recorded; capital retained pending independent reconciliation');
  }).immediate();}catch{return result('DENIED','EVIDENCE_JOURNAL_UNAVAILABLE');}
}
