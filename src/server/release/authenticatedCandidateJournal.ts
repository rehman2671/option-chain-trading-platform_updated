import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {resolveServerBrokerOwnerBinding,type VerifiedPrincipal,type NativeConnectionIdentity} from './serverBrokerOwnerBinding.js';
import {readServerPreparationPolicy} from './serverPreparationPolicy.js';
import {assessCandidateEvidenceBundle} from './candidateEvidenceBundle.js';
import {prepareEntryJournal,initEntryPreparationJournal} from './entryPreparationJournal.js';
import type {ProjectedEntryInput} from './projectedEntryRisk.js';
import type {ListedOptionEvidence} from './exactListedOptionEvidence.js';

export interface AuthenticatedCandidateInput {
 intentId:string;tag:string;listing:ListedOptionEvidence;
 // Trusted server-side broker read and normalized Greek evidence only.
 // Policy, account binding and reservation amount are not supplied here.
 risk:Omit<ProjectedEntryInput,'limits'|'maxFeesPaise'|'maxDailyLossPaise'>;
}
type Outcome={status:'PREPARED'|'REPLAY'|'DENIED';reason:string;orderAuthorized:false;capitalReleaseAuthorized:false};
const out=(status:Outcome['status'],reason:string):Outcome=>({status,reason,orderAuthorized:false,capitalReleaseAuthorized:false});
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(x);
export function initAuthenticatedCandidateJournal(db:Database.Database):void{
 db.transaction(()=>{
  initEntryPreparationJournal(db);
  db.exec(`CREATE TABLE IF NOT EXISTS candidate_preparation_v1(
   account_scope TEXT NOT NULL,intent_id TEXT NOT NULL,owner_id TEXT NOT NULL,
   policy_version TEXT NOT NULL,policy_hash TEXT NOT NULL,auth_epoch INTEGER NOT NULL,session_version INTEGER NOT NULL,
   instrument_key TEXT NOT NULL,product TEXT NOT NULL,quantity INTEGER NOT NULL,
   tag TEXT NOT NULL,expiry TEXT NOT NULL,underlying TEXT NOT NULL,option_type TEXT NOT NULL,strike REAL NOT NULL,
   lot_size INTEGER NOT NULL,tick_paise INTEGER NOT NULL,limit_paise INTEGER NOT NULL,fee_paise INTEGER NOT NULL,
   reserved_paise INTEGER NOT NULL,observed_at INTEGER NOT NULL,
   PRIMARY KEY(account_scope,intent_id)
  )`);
 }).immediate();
}
type Receipt={owner_id:string;policy_version:string;policy_hash:string;auth_epoch:number;session_version:number;instrument_key:string;product:string;quantity:number;tag:string;expiry:string;underlying:string;option_type:string;strike:number;lot_size:number;tick_paise:number;limit_paise:number;fee_paise:number;reserved_paise:number;observed_at:number};
/** Internal synchronous preparation adapter; never expose as a client mutation.
 * Caller must supply original authenticated principal, currently connected native
 * identity, and independently trusted normalized Greeks/listing/funds.
 * Local epoch is not independent exchange or restart provenance. Requires a
 * fresh durable drawdown observation; no fabricated NAV from broker margin.
 * Until source provenance and dispatch/reconciliation gates are integrated this
 * is not an active broker execution gateway. No order or release authorization. */
export function prepareAuthenticatedCandidate(db:Database.Database,principal:VerifiedPrincipal,connection:NativeConnectionIdentity,
 x:AuthenticatedCandidateInput,now:number):Outcome{
 if(!x||!id(x.intentId)||typeof x.tag!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(x.tag)||!x.listing||!x.risk||
  !principal||!id(principal.userId)||!Number.isSafeInteger(now)||now<=0)return out('DENIED','INVALID_CANDIDATE_INPUT');
 try{return db.transaction(()=>{
  const row=db.prepare('SELECT session_version FROM users WHERE id=? AND is_active=1').get(principal.userId) as {session_version:number}|undefined;
  const binding=resolveServerBrokerOwnerBinding(principal,row?.session_version??null,connection,process.env.BROKER_PREPARATION_OWNER_MAP,now);
  if(!binding)return out('DENIED','ACTIVE_OWNER_BINDING_REQUIRED');
  const policy=readServerPreparationPolicy(process.env.BROKER_PREPARATION_RISK_POLICY,binding.accountId);
  if(!policy)return out('DENIED','SERVER_RISK_POLICY_REQUIRED');
  const risk:ProjectedEntryInput={...x.risk,limits:policy.limits,maxFeesPaise:policy.maxFeesPaise,maxDailyLossPaise:policy.maxDailyLossPaise};
  const review=assessCandidateEvidenceBundle({ownerId:binding.ownerId,binding,listing:x.listing,risk},now);
  if(review.status==='DENIED')return out('DENIED',review.reason);
  const i=risk.expected;
  // Canonical hash also detects changed risk limits under a reused version label.
  const sortedLimits=Object.entries(policy.limits).sort(([a],[b])=>a.localeCompare(b)).map(([name,limits])=>
    [name,Object.entries(limits??{}).sort(([a],[b])=>a.localeCompare(b))]);
  const policyHash=createHash('sha256').update(JSON.stringify([policy.policyVersion,policy.maxFeesPaise,policy.maxDailyLossPaise,sortedLimits])).digest('hex');
  const receipt:Receipt={owner_id:binding.ownerId,policy_version:policy.policyVersion,policy_hash:policyHash,auth_epoch:binding.authEpoch,
   session_version:principal.sessionVersion,instrument_key:i.instrumentKey,product:i.product,quantity:i.quantity,tag:x.tag,
   expiry:x.listing.request.expiry,underlying:x.listing.request.underlying,option_type:x.listing.request.optionType,
   strike:x.listing.request.strike,lot_size:x.listing.lotSize,tick_paise:x.listing.tickSizePaise,
   limit_paise:risk.limitPricePaise,fee_paise:policy.maxFeesPaise,
   reserved_paise:review.reservationPaise,observed_at:risk.broker.observedAt};
  const existing=db.prepare('SELECT * FROM candidate_preparation_v1 WHERE account_scope=? AND intent_id=?').get(binding.accountId,x.intentId) as Receipt|undefined;
  if(existing){
   if(receipt.observed_at<existing.observed_at)return out('DENIED','OUT_OF_ORDER_CANDIDATE_EVIDENCE');
   // Replay can never authorize dispatch; changed price, session, policy or
   // amount is a different candidate, not permission to overwrite a claim.
   for(const key of Object.keys(receipt) as (keyof Receipt)[]){
    if(key!=='observed_at'&&existing[key]!==receipt[key])return out('DENIED','IMMUTABLE_CANDIDATE_CONFLICT');
   }
  }else{
   // Existing preparation risk is not in broker-reported positions/Greeks.
   // Conservatively allow only one unresolved preparation per account until
   // verified release/reconciliation of reservations is implemented.
   if(db.prepare('SELECT 1 FROM capital_reservation_v1 WHERE account_scope=? LIMIT 1').get(binding.accountId)||
      db.prepare('SELECT 1 FROM execution_intent_v1 WHERE account_scope=? LIMIT 1').get(binding.accountId)||
      db.prepare('SELECT 1 FROM candidate_preparation_v1 WHERE account_scope=? LIMIT 1').get(binding.accountId))
    return out('DENIED','ACCOUNT_PREPARATION_REVIEW_REQUIRED');
  }
  const journal=prepareEntryJournal(db,{accountScope:binding.accountId,ownerId:binding.ownerId,sessionEpoch:risk.sessionEpoch,
    intent:{accountScope:binding.accountId,ownerId:binding.ownerId,intentId:x.intentId,instrumentKey:i.instrumentKey,
      product:i.product,side:'BUY',quantity:i.quantity,tag:x.tag},
    amountPaise:review.reservationPaise,budget:{accountScope:binding.accountId,sessionEpoch:risk.sessionEpoch,
      availablePaise:Math.floor(risk.broker.snapshot.availableMargin*100),observedAt:risk.broker.observedAt},
    portfolio:{accountScope:binding.accountId,sessionEpoch:risk.sessionEpoch,positionsObservedAt:risk.broker.observedAt,
      completePositionSet:true,positions:risk.broker.reportedOptionPositions,marks:risk.currentMarks}},now);
  if(journal.status==='DENIED')return out('DENIED',journal.reason);
  if(existing){if(journal.status!=='REPLAY')throw Error('INCONSISTENT_CANDIDATE_REPLAY');return out('REPLAY','Existing bounded candidate; no retry or dispatch');}
  if(journal.status!=='PREPARED')throw Error('UNEXPECTED_JOURNAL_REPLAY');
  const saved=db.prepare(`INSERT INTO candidate_preparation_v1(account_scope,intent_id,owner_id,policy_version,policy_hash,auth_epoch,
    session_version,instrument_key,product,quantity,tag,expiry,underlying,option_type,strike,lot_size,tick_paise,
    limit_paise,fee_paise,reserved_paise,observed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(binding.accountId,x.intentId,receipt.owner_id,receipt.policy_version,receipt.policy_hash,receipt.auth_epoch,
    receipt.session_version,receipt.instrument_key,receipt.product,receipt.quantity,receipt.tag,receipt.expiry,
    receipt.underlying,receipt.option_type,receipt.strike,receipt.lot_size,receipt.tick_paise,
    receipt.limit_paise,receipt.fee_paise,receipt.reserved_paise,receipt.observed_at);
  const actual=db.prepare('SELECT * FROM candidate_preparation_v1 WHERE account_scope=? AND intent_id=?').get(binding.accountId,x.intentId) as Receipt|undefined;
  if(saved.changes!==1||!actual||!(Object.keys(receipt) as (keyof Receipt)[]).every(k=>actual[k]===receipt[k]))throw Error('RECEIPT_UNCONFIRMED');
  return out('PREPARED','Candidate, durable intent and reservation recorded atomically; no dispatch authority');
 }).immediate();}catch{return out('DENIED','CANDIDATE_JOURNAL_UNAVAILABLE');}
}
