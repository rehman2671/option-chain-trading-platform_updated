import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {initCapitalReservationLedger,reserveCapitalReadOnlyAuthority,markReservationUnknown} from '../release/capitalReservationLedger.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const fixture={accountScope:'account-a',ownerId:'owner-a',intentId:'intent-a',amountPaise:6000,budgetPaise:10000,budgetObservedAt:now};
test('account-wide atomic reservation denies oversubscription and mismatched replays',()=>{
  const db=new Database(':memory:');
  try{initCapitalReservationLedger(db);
    const reserve=(i=fixture)=>reserveCapitalReadOnlyAuthority(db,i,now);
    assert.equal(reserve().status,'HELD');
    assert.equal(reserve().status,'EXISTING_HELD');
    assert.equal(reserve({...fixture,ownerId:'owner-b'}).status,'DENIED');
    assert.equal(reserve({...fixture,amountPaise:5000}).status,'DENIED');
    assert.equal(reserve({...fixture,ownerId:'owner-b',intentId:'intent-b',amountPaise:4001}).status,'DENIED');
    assert.equal(reserve({...fixture,ownerId:'owner-b',intentId:'intent-b',amountPaise:4000}).status,'HELD');
    assert.equal(reserve({...fixture,accountScope:'account-b'}).status,'HELD');
    assert.equal(markReservationUnknown(db,'account-a','owner-b','intent-a'),false);
    assert.equal(markReservationUnknown(db,'account-a','owner-a','intent-a'),true);
    assert.equal(reserve().status,'EXISTING_UNKNOWN');
    assert.equal(reserve({...fixture,intentId:'intent-c',amountPaise:1}).status,'DENIED');
    assert.equal(reserve().orderAuthorized,false);
  }finally{db.close();}
});
test('stale, negative, fractional or unavailable storage cannot reserve capital',()=>{
  const db=new Database(':memory:');
  try{assert.equal(reserveCapitalReadOnlyAuthority(db,fixture,now).status,'DENIED');
    initCapitalReservationLedger(db);
    for(const i of [{...fixture,budgetObservedAt:now-15001},{...fixture,amountPaise:0},{...fixture,amountPaise:1.5},{...fixture,budgetPaise:NaN}])assert.equal(reserveCapitalReadOnlyAuthority(db,i,now).status,'DENIED');
    assert.equal((db.prepare('SELECT COUNT(*) n FROM capital_reservation_v1').get() as {n:number}).n,0);
  }finally{db.close();}
});
