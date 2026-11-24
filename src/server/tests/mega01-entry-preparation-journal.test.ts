import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initEntryPreparationJournal,prepareEntryJournal,recordPreparedEntryEvidence,inspectPreparedEntries,type PreparationInput} from '../release/entryPreparationJournal.js';
import {observeDurableDrawdown} from '../release/durableDrawdownLedger.js';
import {claimDurableIntent} from '../release/durableOrderIntentLedger.js';
import {reserveCapitalReadOnlyAuthority} from '../release/capitalReservationLedger.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const fixture:PreparationInput={accountScope:'a',ownerId:'owner-a',sessionEpoch:'epoch',amountPaise:6000,
 intent:{accountScope:'a',ownerId:'owner-a',intentId:'i-a',instrumentKey:'NSE_FO|1234',product:'I',side:'BUY',quantity:65,tag:'tag-a'},
 budget:{accountScope:'a',sessionEpoch:'epoch',availablePaise:10000,observedAt:now},
 portfolio:{accountScope:'a',sessionEpoch:'epoch',positionsObservedAt:now,completePositionSet:true,positions:[],marks:[]}};
const init=(db:Database.Database)=>{initEntryPreparationJournal(db);observeDurableDrawdown(db,{accountScope:'a',equityPaise:100000,observedAt:now},now);};
const other=(amountPaise:number):PreparationInput=>({...fixture,ownerId:'owner-b',amountPaise,intent:{...fixture.intent,ownerId:'owner-b',intentId:'i-b',tag:'tag-b'}});
const count=(db:Database.Database,table:'execution_intent_v1'|'capital_reservation_v1')=>(db.prepare('SELECT COUNT(*) n FROM '+table).get() as {n:number}).n;
test('one outer transaction rolls back intent if budget or evidence fails',()=>{
 const db=new Database(':memory:');
 try{init(db);
  for(const x of [{...fixture,amountPaise:10001},{...fixture,budget:{...fixture.budget,observedAt:now-15001}},
   {...fixture,portfolio:{...fixture.portfolio,completePositionSet:false}},{...fixture,budget:{...fixture.budget,sessionEpoch:'other'}},
   {...fixture,intent:{...fixture.intent,accountScope:'other'}},{...fixture,intent:{...fixture.intent,side:'SELL' as const}}]){
   assert.equal(prepareEntryJournal(db,x,now).status,'DENIED');
   assert.equal(count(db,'execution_intent_v1'),0);assert.equal(count(db,'capital_reservation_v1'),0);
  }
  db.exec("CREATE TRIGGER reject_reservation BEFORE INSERT ON capital_reservation_v1 BEGIN SELECT RAISE(ABORT,'fixture write failure'); END;");
  assert.equal(prepareEntryJournal(db,fixture,now).status,'DENIED');
  assert.equal(count(db,'execution_intent_v1'),0);assert.equal(count(db,'capital_reservation_v1'),0);
  db.exec('DROP TRIGGER reject_reservation');
  const result=prepareEntryJournal(db,fixture,now);
  assert.equal(result.status,'PREPARED');assert.equal(result.orderAuthorized,false);
  assert.equal(prepareEntryJournal(db,fixture,now).status,'REPLAY');
  assert.equal(prepareEntryJournal(db,{...fixture,amountPaise:6001},now).status,'DENIED');
  assert.equal(prepareEntryJournal(db,other(4001),now).status,'DENIED');
  assert.equal(count(db,'execution_intent_v1'),1);
  assert.equal(prepareEntryJournal(db,other(4000),now).status,'PREPARED');
  assert.equal(count(db,'capital_reservation_v1'),2);
 }finally{db.close();}
});
test('missing and halted drawdown evidence blocks new preparation without writes',()=>{
 const db=new Database(':memory:');
 try{initEntryPreparationJournal(db);
  assert.equal(prepareEntryJournal(db,fixture,now).reason,'DRAWDOWN_EVIDENCE_BLOCKED');
  observeDurableDrawdown(db,{accountScope:'a',equityPaise:100000,observedAt:now},now);
  observeDurableDrawdown(db,{accountScope:'a',equityPaise:85000,observedAt:now+1},now+1);
  assert.equal(prepareEntryJournal(db,fixture,now+1).status,'DENIED');
  assert.equal(count(db,'execution_intent_v1'),0);assert.equal(count(db,'capital_reservation_v1'),0);
 }finally{db.close();}
});
test('restart recovery and broker terminal evidence retain all capital and isolate owners',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gateway-fixture-'));const path=join(dir,'db.sqlite');let db=new Database(path);
 try{init(db);assert.equal(prepareEntryJournal(db,fixture,now).status,'PREPARED');
  db.close();db=new Database(path);
  assert.equal(inspectPreparedEntries(db,'a','owner-a').items[0]?.disposition,'RECONCILIATION_REQUIRED');
  assert.equal(inspectPreparedEntries(db,'a','owner-b').status,'EMPTY');
  assert.equal(inspectPreparedEntries(db,'b','owner-a').status,'EMPTY');
  const i=fixture.intent;
  assert.equal(recordPreparedEntryEvidence(db,{...i,quantity:1},'order-a',null,null,now+1).status,'DENIED');
  assert.equal(inspectPreparedEntries(db,'a','owner-a').items[0]?.reservationState,'HELD');
  assert.equal(recordPreparedEntryEvidence(db,i,'order-a',null,null,now+1).status,'DENIED');
  assert.equal(inspectPreparedEntries(db,'a','owner-a').items[0]?.reservationState,'UNKNOWN');
  const detail={order_id:'order-a',instrument_token:i.instrumentKey,product:i.product,transaction_type:i.side,tag:i.tag,quantity:i.quantity,filled_quantity:0,pending_quantity:0,status:'REJECTED',average_price:0};
  const terminal=recordPreparedEntryEvidence(db,i,'order-a',detail,[],now+2);
  assert.equal(terminal.status,'RECORDED');assert.equal(terminal.capitalReleaseAuthorized,false);
  const recovery=inspectPreparedEntries(db,'a','owner-a');
  assert.equal(recovery.items[0]?.disposition,'TERMINAL_REVIEW_REQUIRED');
  assert.equal(recovery.items[0]?.reservedPaise,6000);
  assert.equal(recovery.capitalReleaseAuthorized,false);
  assert.equal(prepareEntryJournal(db,other(4001),now+2).status,'DENIED');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('orphan intent or reservation is visible and never silently repaired',()=>{
 const db=new Database(':memory:');
 try{init(db);
  assert.equal(claimDurableIntent(db,fixture.intent,now).status,'CLAIMED');
  assert.equal(prepareEntryJournal(db,fixture,now).status,'DENIED');
  assert.equal(inspectPreparedEntries(db,'a','owner-a').items[0]?.disposition,'ORPHAN_REVIEW_REQUIRED');
  const b=other(4000);
  assert.equal(reserveCapitalReadOnlyAuthority(db,{accountScope:'a',ownerId:b.ownerId,intentId:b.intent.intentId,amountPaise:4000,budgetPaise:10000,budgetObservedAt:now},now).status,'HELD');
  assert.equal(prepareEntryJournal(db,b,now).status,'DENIED');
  assert.equal(inspectPreparedEntries(db,'a','owner-b').items[0]?.disposition,'ORPHAN_REVIEW_REQUIRED');
  assert.equal(count(db,'execution_intent_v1'),1);assert.equal(count(db,'capital_reservation_v1'),1);
 }finally{db.close();}
});

test('unresolved reservations quarantine new preparations across owners and connections',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gateway-account-fence-'));const path=join(dir,'db.sqlite');
 const first=new Database(path),second=new Database(path);
 try{
  init(first);
  assert.equal(prepareEntryJournal(first,fixture,now).status,'PREPARED');
  assert.equal(recordPreparedEntryEvidence(first,fixture.intent,'order-a',null,null,now+1).status,'DENIED');
  const blocked=prepareEntryJournal(second,other(1000),now+2);
  assert.equal(blocked.reason,'ACCOUNT_RECOVERY_REQUIRED');
  assert.equal(count(second,'execution_intent_v1'),1);assert.equal(count(second,'capital_reservation_v1'),1);
  assert.equal(prepareEntryJournal(second,fixture,now+2).status,'REPLAY');
  const b={...other(1000),accountScope:'b',intent:{...other(1000).intent,accountScope:'b'},
   budget:{...fixture.budget,accountScope:'b'},portfolio:{...fixture.portfolio,accountScope:'b'}};
  observeDurableDrawdown(second,{accountScope:'b',equityPaise:100000,observedAt:now},now);
  assert.equal(prepareEntryJournal(second,b,now+2).status,'PREPARED');
 }finally{first.close();second.close();rmSync(dir,{recursive:true,force:true});}
});
