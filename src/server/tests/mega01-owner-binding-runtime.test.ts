import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {parseBrokerOwnerMapping,resolveServerBrokerOwnerBinding} from '../release/serverBrokerOwnerBinding.js';
import {dbEngine} from '../db.js';
import {initEntryPreparationJournal,prepareEntryJournal} from '../release/entryPreparationJournal.js';
import {observeDurableDrawdown} from '../release/durableDrawdownLedger.js';

const now=Date.now();
const mapping=JSON.stringify([{ownerId:'owner-a',accountId:'acct-a'},{ownerId:'owner-b',accountId:'acct-b'}]);
const principal={userId:'owner-a',sessionVersion:2};
const connection={isConnected:true,userId:'acct-a',authEpoch:3};
test('only explicit unique deployment mapping binds an active original session to native account',()=>{
 assert.deepEqual(resolveServerBrokerOwnerBinding(principal,2,connection,mapping,now),
  {ownerId:'owner-a',accountId:'acct-a',authEpoch:3,verifiedAt:now});
 for(const raw of [undefined,'','{}','[]','not-json',JSON.stringify([{ownerId:'GLOBAL',accountId:'acct-a'}]),
  JSON.stringify([{ownerId:'owner-a',accountId:'acct-a'},{ownerId:'owner-a',accountId:'acct-b'}]),
  JSON.stringify([{ownerId:'owner-a',accountId:'acct-a'},{ownerId:'owner-b',accountId:'acct-a'}]),
  JSON.stringify([{ownerId:'owner-a',accountId:'acct-a',extra:true}])]){
  assert.equal(parseBrokerOwnerMapping(raw),null);
  assert.equal(resolveServerBrokerOwnerBinding(principal,2,connection,raw,now),null);
 }
 for(const v of [null,1,3])assert.equal(resolveServerBrokerOwnerBinding(principal,v,connection,mapping,now),null);
 for(const c of [{...connection,userId:'acct-b'},{...connection,isConnected:false},{...connection,authEpoch:0},
  {...connection,authEpoch:NaN},{...connection,userId:undefined}])
  assert.equal(resolveServerBrokerOwnerBinding(principal,2,c,mapping,now),null);
 assert.equal(resolveServerBrokerOwnerBinding({...principal,userId:'owner-b'},2,connection,mapping,now),null);
});

test('actual runtime schema and recovery adapter preserve owner scope and reject revoked or disabled sessions',()=>{
 const db=new Database(':memory:');
 const engine=dbEngine as unknown as {db:Database.Database|null};
 const prior=engine.db,priorMapping=process.env.BROKER_PREPARATION_OWNER_MAP;
 try{
  engine.db=db;
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,is_active INTEGER,session_version INTEGER)');
  db.prepare('INSERT INTO users VALUES(?,?,?)').run('owner-a',1,2);
  db.prepare('INSERT INTO users VALUES(?,?,?)').run('owner-b',1,2);
  initEntryPreparationJournal(db);
  process.env.BROKER_PREPARATION_OWNER_MAP=mapping;
  observeDurableDrawdown(db,{accountScope:'acct-a',equityPaise:100000,observedAt:now},now);
  const p=prepareEntryJournal(db,{accountScope:'acct-a',ownerId:'owner-a',sessionEpoch:'3',amountPaise:1000,
   intent:{accountScope:'acct-a',ownerId:'owner-a',intentId:'fixture-a',instrumentKey:'NSE_FO|123',product:'I',side:'BUY',quantity:65,tag:'tag-a'},
   budget:{accountScope:'acct-a',sessionEpoch:'3',availablePaise:10000,observedAt:now},
   portfolio:{accountScope:'acct-a',sessionEpoch:'3',positionsObservedAt:now,completePositionSet:true,positions:[],marks:[]}},now);
  assert.equal(p.status,'PREPARED');
  const result=dbEngine.inspectAuthorizedBrokerPreparation(principal,connection,now);
  assert.ok(result);assert.equal(result.status,'REVIEW_REQUIRED');
  assert.equal(result.items[0]?.intentId,'fixture-a');assert.equal(result.orderAuthorized,false);
  assert.equal(result.capitalReleaseAuthorized,false);
  assert.equal(dbEngine.inspectAuthorizedBrokerPreparation({...principal,userId:'owner-b'},connection,now),null);
  assert.equal(dbEngine.inspectAuthorizedBrokerPreparation(principal,{...connection,userId:'acct-b'},now),null);
  db.prepare('UPDATE users SET session_version=3 WHERE id=?').run('owner-a');
  assert.equal(dbEngine.inspectAuthorizedBrokerPreparation(principal,connection,now),null);
  assert.ok(dbEngine.inspectAuthorizedBrokerPreparation({...principal,sessionVersion:3},connection,now));
  db.prepare('UPDATE users SET is_active=0 WHERE id=?').run('owner-a');
  assert.equal(dbEngine.inspectAuthorizedBrokerPreparation({...principal,sessionVersion:3},connection,now),null);
 }finally{
  engine.db=prior;db.close();
  if(priorMapping===undefined)delete process.env.BROKER_PREPARATION_OWNER_MAP;
  else process.env.BROKER_PREPARATION_OWNER_MAP=priorMapping;
 }
});

test('HTTP recovery requires original authenticated session and ignores client account overrides',async()=>{
 const {default:express}=await import('express');
 const {authRouter,setAuthCookie}=await import('../auth.js');
 const {activeProvider}=await import('../engine/providers/index.js');
 const provider=activeProvider as unknown as Record<string,unknown>;
 const beforeStatus=provider.getLiveConnectionStatus,beforeEpoch=provider.getBrokerAuthEpoch;
 const db=new Database(':memory:');
 const engine=dbEngine as unknown as {db:Database.Database|null};
 const prior=engine.db,priorMapping=process.env.BROKER_PREPARATION_OWNER_MAP;
 const app=express();
 app.use('/api/auth',authRouter);
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Fixture HTTP address unavailable');
  const url='http://127.0.0.1:'+address.port+'/api/auth/broker-preparation/recovery';
  engine.db=db;
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,role TEXT,is_active INTEGER,session_version INTEGER)');
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner-a','owner-a@example.invalid','OPERATOR',1,2);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner-b','owner-b@example.invalid','OPERATOR',1,2);
  initEntryPreparationJournal(db);
  process.env.BROKER_PREPARATION_OWNER_MAP=mapping;
  provider.getLiveConnectionStatus=()=>({isConnected:true,userId:'acct-a'});
  provider.getBrokerAuthEpoch=()=>3;
  const token=(id:string)=>{const user=dbEngine.findUserById(id);assert.ok(user);return setAuthCookie({cookie:()=>{}} as unknown as import('express').Response,user);};
  const a=token('owner-a'),b=token('owner-b');
  const get=(t?:string)=>fetch(url+'?accountId=acct-b&ownerId=owner-b',{headers:t?{Authorization:'Bearer '+t}:{}});
  assert.equal((await get()).status,401);
  assert.equal((await get(b)).status,403);
  const ok=await get(a);assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');
  assert.equal((await ok.json()).status,'EMPTY');
  db.prepare('UPDATE users SET session_version=3 WHERE id=?').run('owner-a');
  assert.equal((await get(a)).status,401);
  const updated=token('owner-a');provider.getLiveConnectionStatus=()=>({isConnected:false});
  assert.equal((await get(updated)).status,503);
 }finally{
  provider.getLiveConnectionStatus=beforeStatus;provider.getBrokerAuthEpoch=beforeEpoch;
  engine.db=prior;db.close();
  if(priorMapping===undefined)delete process.env.BROKER_PREPARATION_OWNER_MAP;
  else process.env.BROKER_PREPARATION_OWNER_MAP=priorMapping;
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
