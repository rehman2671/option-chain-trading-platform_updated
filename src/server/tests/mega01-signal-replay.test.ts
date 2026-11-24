import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {executePaperSignalOnce} from '../engine/ema15m/paperSignalReplayGuard.js';

const signal={id:'s1',instrument:'NIFTY',candleTimestamp:'2026-11-24T04:00:00Z'};
test('paper signal claim survives a new worker and rejects same-slot or older reversal',()=>{
  const db=new Database(':memory:');
  try{
    db.exec('CREATE TABLE ema_paper_trades(id TEXT PRIMARY KEY,signal_id TEXT UNIQUE); CREATE TABLE effects(id INTEGER PRIMARY KEY);');
    const execute=()=>{
      db.prepare('INSERT INTO effects DEFAULT VALUES').run();
      return {status:'FILLED_SIMULATED' as const,message:'fixture'};
    };
    assert.equal(executePaperSignalOnce(db,signal,execute).status,'FILLED_SIMULATED');
    assert.equal(executePaperSignalOnce(db,signal,execute).status,'HELD');
    assert.equal(executePaperSignalOnce(db,{...signal,id:'different-id'},execute).status,'HELD');
    assert.equal(executePaperSignalOnce(db,{...signal,id:'older',candleTimestamp:'2026-11-24T03:45:00Z'},execute).status,'HELD');
    db.prepare('INSERT INTO ema_paper_trades VALUES (?,?)').run('historic','historical');
    assert.equal(executePaperSignalOnce(db,{...signal,id:'historical',candleTimestamp:'2026-11-24T04:15:00Z'},execute).status,'HELD');
    assert.equal(executePaperSignalOnce(db,{...signal,id:'later',candleTimestamp:'2026-11-24T04:15:00Z'},execute).status,'FILLED_SIMULATED');
    assert.equal((db.prepare('SELECT count(*) n FROM effects').get() as {n:number}).n,2);
  }finally{db.close();}
});
test('failed replacement rolls back reversal and signal claim together',()=>{
  const db=new Database(':memory:');
  try{
    db.exec("CREATE TABLE ema_paper_trades(id TEXT PRIMARY KEY,signal_id TEXT UNIQUE,status TEXT); INSERT INTO ema_paper_trades VALUES('old','old-signal','OPEN');");
    const result=executePaperSignalOnce(db,signal,()=>{
      db.prepare("UPDATE ema_paper_trades SET status='CLOSED' WHERE id='old'").run();
      return {status:'FAILED',message:'replacement failure'};
    });
    assert.equal(result.status,'FAILED');
    assert.equal((db.prepare("SELECT status FROM ema_paper_trades WHERE id='old'").get() as {status:string}).status,'OPEN');
    assert.equal(executePaperSignalOnce(db,signal,()=>({status:'HELD',message:'valid hold'})).status,'HELD');
    assert.equal((db.prepare('SELECT count(*) n FROM ema_paper_signal_claims').get() as {n:number}).n,1);
  }finally{db.close();}
});
test('live entry claim refuses historical terminal attempt for same signal',async()=>{
  const {dbEngine}=await import('../db.js');
  const {randomUUID}=await import('node:crypto');
  await dbEngine.initialize();
  const db=dbEngine.getRawDatabase();
  const id='replay-test-'+randomUUID(),second=id+'-2',sig=id+'-signal';
  const now=new Date().toISOString();
  const attempt:Parameters<typeof dbEngine.claimEmaLiveEntryAttempt>[0]={
    id,signalId:sig,executionMode:'LIVE',instrument:'NIFTY',brokerAccountId:'fixture-account',
    brokerInstrumentKey:'NSE_FO|12345',tradingsymbol:'FIXTURE',optionType:'CE',strike:24000,
    expiry:'2026-11-24',requestedQuantity:65,filledQuantity:0,orderStatus:'REJECTED',
    createdAt:now,updatedAt:now
  };
  try{
    dbEngine.saveEmaLiveOrderAttempt(attempt);
    assert.equal(dbEngine.claimEmaLiveEntryAttempt({...attempt,id:second,orderStatus:'SUBMITTED'}),false);
    assert.equal(dbEngine.getEmaLiveOrderAttemptById(second),null);
  }finally{db.prepare('DELETE FROM ema_live_order_attempts WHERE id IN (?,?)').run(id,second);}
});
