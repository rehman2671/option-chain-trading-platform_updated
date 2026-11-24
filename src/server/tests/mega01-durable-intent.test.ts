import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initDurableOrderIntentLedger,claimDurableIntent,recordIntentEvidence,type DurableIntent} from '../release/durableOrderIntentLedger.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const i:DurableIntent={accountScope:'account-a',ownerId:'owner-a',intentId:'intent-a',instrumentKey:'NSE_FO|1234',product:'I',side:'BUY',quantity:65,tag:'tag-a'};
const detail=(filled:number,pending:number,status:string,order='order-a')=>({order_id:order,instrument_token:i.instrumentKey,product:i.product,transaction_type:i.side,tag:i.tag,quantity:i.quantity,filled_quantity:filled,pending_quantity:pending,status,average_price:filled?100:0});
const trade=(quantity:number,order='order-a')=>({order_id:order,instrument_token:i.instrumentKey,product:i.product,transaction_type:i.side,quantity,trade_id:'trade-a',exchange_order_id:'exchange-a',average_price:100});
test('durable claim, cross-owner conflicts and replay survive database reopen',()=>{
  const dir=mkdtempSync(join(tmpdir(),'intent-fixture-'));const path=join(dir,'db.sqlite');let db=new Database(path);
  try{initDurableOrderIntentLedger(db);
    assert.equal(claimDurableIntent(db,i,now).status,'CLAIMED');
    db.close();db=new Database(path);
    assert.equal(claimDurableIntent(db,i,now+1).status,'REPLAY');
    assert.equal(claimDurableIntent(db,{...i,ownerId:'owner-b'},now).status,'DENIED');
    assert.equal(claimDurableIntent(db,{...i,intentId:'other'},now).status,'DENIED');
    assert.equal(claimDurableIntent(db,{...i,accountScope:'account-b'},now).status,'CLAIMED');
    assert.equal(claimDurableIntent(db,{...i,quantity:1.5},now).status,'DENIED');
    assert.equal(claimDurableIntent(db,i,now).orderAuthorized,false);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('unverified, regressing and contradictory fills never resolve a durable intent',()=>{
  const db=new Database(':memory:');
  try{initDurableOrderIntentLedger(db);claimDurableIntent(db,i,now);
    const rec=(d:unknown,t:unknown,n=now+1,order='order-a')=>recordIntentEvidence(db,i,order,d,t,n);
    assert.equal(rec(null,[]).status,'DENIED');
    assert.equal(rec(detail(25,40,'OPEN'),[trade(25)]).status,'RECORDED');
    assert.equal(rec(detail(0,65,'OPEN'),[],now+2).status,'DENIED');
    assert.equal(rec(detail(65,0,'COMPLETE','order-b'),[trade(65,'order-b')],now+2,'order-b').status,'DENIED');
    assert.equal(rec(detail(65,0,'COMPLETE'),[trade(65)],now).status,'DENIED');
    assert.equal(rec(detail(65,0,'COMPLETE'),[trade(65)],now+2).status,'RECORDED');
    assert.equal(rec(detail(65,0,'COMPLETE'),[trade(65)],now+3).status,'REPLAY');
    assert.equal(rec(detail(25,0,'CANCELLED'),[trade(25)],now+4).status,'DENIED');
    assert.equal(rec(detail(65,0,'COMPLETE'),[trade(65)],now+3).orderAuthorized,false);
  }finally{db.close();}
});
