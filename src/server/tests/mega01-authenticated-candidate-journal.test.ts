import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initAuthenticatedCandidateJournal,prepareAuthenticatedCandidate,type AuthenticatedCandidateInput} from '../release/authenticatedCandidateJournal.js';
import {readServerPreparationPolicy} from '../release/serverPreparationPolicy.js';
import {verifyExactListedOption,type ListedOptionRequest} from '../release/exactListedOptionEvidence.js';
import {buildBoundBrokerEntryEvidence} from '../release/boundBrokerEntryEvidence.js';
import {observeDurableDrawdown} from '../release/durableDrawdownLedger.js';
import type {GreekMark} from '../release/portfolioGreekEvidence.js';

const now=Date.parse('2026-11-24T05:00:00Z');
const principal={userId:'owner-a',sessionVersion:2};
const connection={isConnected:true,userId:'account-a',authEpoch:3};
const mapping=JSON.stringify([{ownerId:'owner-a',accountId:'account-a'},{ownerId:'owner-b',accountId:'account-b'}]);
const limits={netDelta:100,netGamma:1,netTheta:1000,netVega:1000,grossDelta:100,grossGamma:1,grossTheta:1000,grossVega:1000};
const policy={accountId:'account-a',policyVersion:'test-v1',maxFeesPaise:1000,maxDailyLossPaise:100000,limits:{NIFTY:limits}};
const rawPolicy=JSON.stringify([policy]);
function candidate():AuthenticatedCandidateInput{
 const identity={accountId:'account-a',authEpoch:3,instrumentKey:'NSE_FO|1234',quantity:65,product:'D' as const};
 const request:ListedOptionRequest={identity,underlying:'NIFTY',optionType:'CE',strike:25000,expiry:'2026-12-31'};
 const listing=verifyExactListedOption(request,[{instrument_key:identity.instrumentKey,segment:'NSE_FO',underlying_key:'NSE_INDEX|Nifty 50',
  underlying_symbol:'NIFTY',instrument_type:'CE',expiry:request.expiry,strike_price:25000,lot_size:65,tick_size:5,trading_symbol:'NIFTY FIXTURE CE'}],now,now+1);
 const broker=buildBoundBrokerEntryEvidence(identity,{status:'success',data:{equity:{available_margin:290000,used_margin:10000}}},
  {status:'success',data:{final_margin:1500}},{status:'success',data:[]},now,now+1);
 assert.ok(listing);assert.ok(broker);
 const mark:GreekMark={instrumentKey:identity.instrumentKey,underlying:'NIFTY',observedAt:now,sessionEpoch:'3',
  convention:'PER_UNIT_PER_POINT_PER_DAY_PER_IV_POINT',delta:.5,gamma:.001,theta:-1,vega:2};
 return {intentId:'intent-a',tag:'tag-a',listing,risk:{broker,expected:identity,sessionEpoch:'3',currentMarks:[],candidateMark:mark,limitPricePaise:5000}};
}
function init(db:Database.Database){
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,is_active INTEGER,session_version INTEGER)');
 db.prepare('INSERT INTO users VALUES(?,?,?)').run('owner-a',1,2);
 db.prepare('INSERT INTO users VALUES(?,?,?)').run('owner-b',1,2);
 initAuthenticatedCandidateJournal(db);
 observeDurableDrawdown(db,{accountScope:'account-a',equityPaise:30000000,observedAt:now},now);
}
function env(fn:()=>void){
 const a=process.env.BROKER_PREPARATION_OWNER_MAP,b=process.env.BROKER_PREPARATION_RISK_POLICY;
 try{process.env.BROKER_PREPARATION_OWNER_MAP=mapping;process.env.BROKER_PREPARATION_RISK_POLICY=rawPolicy;fn();}
 finally{
  if(a===undefined)delete process.env.BROKER_PREPARATION_OWNER_MAP;else process.env.BROKER_PREPARATION_OWNER_MAP=a;
  if(b===undefined)delete process.env.BROKER_PREPARATION_RISK_POLICY;else process.env.BROKER_PREPARATION_RISK_POLICY=b;
 }
}
const tables=['execution_intent_v1','capital_reservation_v1','candidate_preparation_v1'] as const;
const counts=(db:Database.Database)=>tables.map(t=>(db.prepare('SELECT COUNT(*) AS n FROM '+t).get() as {n:number}).n);
test('server policy is explicit, account scoped, unique and rejects malformed ceilings',()=>{
 assert.equal(readServerPreparationPolicy(rawPolicy,'account-a')?.maxFeesPaise,1000);
 assert.equal(readServerPreparationPolicy(rawPolicy,'account-b'),null);
 for(const invalid of [undefined,'{}','[]','bad',JSON.stringify([policy,policy]),JSON.stringify([{...policy,maxFeesPaise:-1}]),
  JSON.stringify([{...policy,maxDailyLossPaise:1.5}]),JSON.stringify([{...policy,limits:{NIFTY:{...limits,grossDelta:0}}}]),
  JSON.stringify([{...policy,limits:{UNKNOWN:limits}}])])
  assert.equal(readServerPreparationPolicy(invalid,'account-a'),null);
});
test('joined adapter rolls back all three rows on injected receipt failure and blocks invalid authorization or risk',()=>env(()=>{
 const db=new Database(':memory:');
 try{
  init(db);const x=candidate();
  const run=(v:AuthenticatedCandidateInput=x)=>prepareAuthenticatedCandidate(db,principal,connection,v,now+1);
  assert.equal(prepareAuthenticatedCandidate(db,{...principal,sessionVersion:1},connection,x,now+1).reason,'ACTIVE_OWNER_BINDING_REQUIRED');
  assert.equal(prepareAuthenticatedCandidate(db,principal,{...connection,userId:'account-b'},x,now+1).status,'DENIED');
  delete process.env.BROKER_PREPARATION_RISK_POLICY;
  assert.equal(run().reason,'SERVER_RISK_POLICY_REQUIRED');
  process.env.BROKER_PREPARATION_RISK_POLICY=rawPolicy;
  assert.equal(run({...x,risk:{...x.risk,limitPricePaise:5001}}).status,'DENIED');
  assert.equal(run({...x,risk:{...x.risk,candidateMark:{...x.risk.candidateMark,delta:NaN}}}).status,'DENIED');
  db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON candidate_preparation_v1 BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.equal(run().status,'DENIED');assert.deepEqual(counts(db),[0,0,0]);
  db.exec('DROP TRIGGER reject_receipt');
  const r=run();assert.equal(r.status,'PREPARED');assert.equal(r.orderAuthorized,false);assert.equal(r.capitalReleaseAuthorized,false);
  assert.deepEqual(counts(db),[1,1,1]);
  const receipt=db.prepare('SELECT limit_paise,fee_paise,reserved_paise,policy_hash FROM candidate_preparation_v1').get() as
   {limit_paise:number;fee_paise:number;reserved_paise:number;policy_hash:string};
  assert.equal(receipt.limit_paise,5000);assert.equal(receipt.fee_paise,1000);assert.equal(receipt.reserved_paise,326000);
  assert.match(receipt.policy_hash,/^[a-f0-9]{64}$/);
  assert.equal(run().status,'REPLAY');
  assert.equal(run({...x,risk:{...x.risk,limitPricePaise:5005}}).reason,'IMMUTABLE_CANDIDATE_CONFLICT');
  process.env.BROKER_PREPARATION_RISK_POLICY=JSON.stringify([{...policy,limits:{NIFTY:{...limits,grossDelta:99}}}]);
  assert.equal(run().reason,'IMMUTABLE_CANDIDATE_CONFLICT');
  process.env.BROKER_PREPARATION_RISK_POLICY=rawPolicy;
  assert.equal(run({...x,intentId:'intent-b',tag:'tag-b'}).reason,'ACCOUNT_PREPARATION_REVIEW_REQUIRED');
  assert.deepEqual(counts(db),[1,1,1]);
 }finally{db.close();}
}));
test('restart and independent connections retain receipt and enforce account preparation quarantine',()=>env(()=>{
 const dir=mkdtempSync(join(tmpdir(),'candidate-journal-')),path=join(dir,'test.sqlite');
 const first=new Database(path);let second:Database.Database|undefined;
 try{
  init(first);const x=candidate();
  assert.equal(prepareAuthenticatedCandidate(first,principal,connection,x,now+1).status,'PREPARED');
  first.close();second=new Database(path);
  assert.equal(prepareAuthenticatedCandidate(second,principal,connection,x,now+1).status,'REPLAY');
  assert.equal(prepareAuthenticatedCandidate(second,principal,connection,{...x,intentId:'new',tag:'new'},now+1).status,'DENIED');
  second.prepare('UPDATE users SET session_version=3 WHERE id=?').run('owner-a');
  assert.equal(prepareAuthenticatedCandidate(second,principal,connection,x,now+1).status,'DENIED');
  assert.equal(prepareAuthenticatedCandidate(second,{...principal,sessionVersion:3},connection,x,now+1).reason,'IMMUTABLE_CANDIDATE_CONFLICT');
  assert.deepEqual(counts(second),[1,1,1]);
 }finally{if(first.open)first.close();if(second?.open)second.close();rmSync(dir,{recursive:true,force:true});}
}));
test('fresh durable drawdown state is required for candidate preparation',()=>env(()=>{
 const db=new Database(':memory:');
 try{init(db);
  observeDurableDrawdown(db,{accountScope:'account-a',equityPaise:24000000,observedAt:now+1},now+1);
  assert.equal(prepareAuthenticatedCandidate(db,principal,connection,candidate(),now+1).reason,'DRAWDOWN_EVIDENCE_BLOCKED');
  assert.deepEqual(counts(db),[0,0,0]);
 }finally{db.close();}
}));
