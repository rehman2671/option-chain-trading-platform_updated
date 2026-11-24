import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initDurableDrawdownLedger,observeDurableDrawdown,readDurableDrawdown} from '../release/durableDrawdownLedger.js';
const now=Date.parse('2026-11-24T05:00:00Z');
test('critical exact boundary is durable across restart and recovery; account scope isolated',()=>{
  const dir=mkdtempSync(join(tmpdir(),'drawdown-fixture-'));const path=join(dir,'db.sqlite');let db=new Database(path);
  const observe=(equityPaise:number,observedAt:number,accountScope='a')=>observeDurableDrawdown(db,{accountScope,equityPaise,observedAt},observedAt);
  try{initDurableDrawdownLedger(db);
    assert.equal(readDurableDrawdown(db,'a',now).halted,true);
    assert.equal(observe(100000,now).halted,false);
    assert.equal(observe(85001,now+1).halted,false);
    assert.equal(observe(85000,now+2).halted,true);
    db.close();db=new Database(path);
    assert.equal(readDurableDrawdown(db,'a',now+3).halted,true);
    assert.equal(observe(110000,now+3).halted,true);
    assert.equal(observe(100000,now+3,'b').halted,false);
    assert.equal(readDurableDrawdown(db,'a',now+4).peakPaise,110000);
    assert.equal(readDurableDrawdown(db,'a',now+15004).status,'UNKNOWN');
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('invalid, stale or conflicting observations fail closed without overwriting valid state',()=>{
  const db=new Database(':memory:');
  try{initDurableDrawdownLedger(db);
    const i={accountScope:'a',equityPaise:100000,observedAt:now};
    assert.equal(observeDurableDrawdown(db,i,now).status,'OBSERVED');
    for(const bad of [{...i,equityPaise:NaN},{...i,equityPaise:100001},{...i,observedAt:now-1},{...i,observedAt:now+1}])
      assert.equal(observeDurableDrawdown(db,bad,now).status,'UNKNOWN');
    assert.equal(observeDurableDrawdown(db,{...i,observedAt:now-15001},now).halted,true);
    assert.equal(readDurableDrawdown(db,'a',now).equityPaise,100000);
    assert.equal(observeDurableDrawdown(db,{...i,equityPaise:0,observedAt:now+1},now+1).halted,true);
    assert.equal(readDurableDrawdown(db,'a',now+1).orderAuthorized,false);
  }finally{db.close();}
});
