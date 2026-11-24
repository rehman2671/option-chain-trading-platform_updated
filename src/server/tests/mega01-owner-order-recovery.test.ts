import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {initEntryPreparationJournal,prepareEntryJournal,inspectPreparedEntries} from '../release/entryPreparationJournal.js';
import {observeDurableDrawdown} from '../release/durableDrawdownLedger.js';
import {resolveRecoveryOrderId,reconcileOwnerPreparedOrder,type OwnerRecoveryProvider} from '../release/ownerOrderRecovery.js';
import type {DurableIntent} from '../release/durableOrderIntentLedger.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const principal={userId:'owner-a',sessionVersion:2};
const intent:DurableIntent={accountScope:'account-a',ownerId:'owner-a',intentId:'intent-a',instrumentKey:'NSE_FO|123',product:'I',side:'BUY',quantity:65,tag:'tag-a'};
const base={order_id:'order-a',instrument_token:intent.instrumentKey,product:intent.product,transaction_type:intent.side,tag:intent.tag,
 quantity:65,filled_quantity:25,pending_quantity:40,status:'OPEN',average_price:50,exchange_order_id:'exchange-a'};
const trade={order_id:'order-a',instrument_token:intent.instrumentKey,product:'I',transaction_type:'BUY',quantity:25,
 average_price:50,trade_id:'trade-a',exchange_order_id:'exchange-a'};
function init(db:Database.Database){
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,is_active INTEGER,session_version INTEGER)');
 db.prepare('INSERT INTO users VALUES(?,?,?)').run('owner-a',1,2);
 db.prepare('INSERT INTO users VALUES(?,?,?)').run('owner-b',1,2);
 initEntryPreparationJournal(db);
 observeDurableDrawdown(db,{accountScope:'account-a',equityPaise:1000000,observedAt:now},now);
 assert.equal(prepareEntryJournal(db,{accountScope:'account-a',ownerId:'owner-a',sessionEpoch:'2',intent,amountPaise:10000,
  budget:{accountScope:'account-a',sessionEpoch:'2',availablePaise:100000,observedAt:now},
  portfolio:{accountScope:'account-a',sessionEpoch:'2',positionsObservedAt:now,completePositionSet:true,positions:[],marks:[]}},now).status,'PREPARED');
}
function fixture():OwnerRecoveryProvider{
 return {getLiveConnectionStatus:()=>({isConnected:true,userId:'account-a'}),getBrokerAuthEpoch:()=>2,
  getOrderBook:async()=>[base],getOrderDetails:async id=>{assert.equal(id,'order-a');return base;},
  getOrderTrades:async id=>{assert.equal(id,'order-a');return [trade];}};
}
async function withDb(fn:(db:Database.Database)=>Promise<void>){
 const db=new Database(':memory:');const old=process.env.BROKER_PREPARATION_OWNER_MAP;
 try{process.env.BROKER_PREPARATION_OWNER_MAP=JSON.stringify([{ownerId:'owner-a',accountId:'account-a'},{ownerId:'owner-b',accountId:'account-b'}]);
  init(db);await fn(db);
 }finally{db.close();if(old===undefined)delete process.env.BROKER_PREPARATION_OWNER_MAP;else process.env.BROKER_PREPARATION_OWNER_MAP=old;}
}
test('only unique exact tag and immutable contract identity can discover an order',()=>{
 assert.equal(resolveRecoveryOrderId(intent,[base]),'order-a');
 for(const rows of [null,[],[base,{...base,order_id:'order-b'}],[{...base,tag:'other'}],
  [{...base,quantity:66}],[{...base,product:'D'}],[{...base,transaction_type:'SELL'}],[{...base,instrument_token:'NSE_FO|999'}]])
  assert.equal(resolveRecoveryOrderId(intent,rows),null);
});
test('owner reconciliation records broker-reported partial fill, binds exact ID, retains capital',()=>withDb(async db=>{
 const p=fixture();const result=await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+1);
 assert.equal(result.status,'RECORDED');assert.equal(result.capitalReleaseAuthorized,false);assert.equal(result.retryAuthorized,false);
 assert.equal(result.accountFlatCertified,false);
 const row=inspectPreparedEntries(db,'account-a','owner-a').items[0];
 assert.equal(row.filledQuantity,25);assert.equal(row.intentState,'PARTIAL_OPEN');assert.equal(row.brokerOrderId,'order-a');
 assert.equal(row.reservedPaise,10000);assert.equal(row.reservationState,'UNKNOWN');
 p.getOrderBook=async()=>{throw Error('bound order should not need discovery');};
 p.getOrderDetails=async()=>({...base,status:'CANCELLED',pending_quantity:0});
 assert.equal((await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+2)).status,'RECORDED');
 assert.equal(inspectPreparedEntries(db,'account-a','owner-a').items[0].intentState,'TERMINAL_PARTIAL');
 assert.equal((await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+3)).status,'REPLAY');
 assert.equal(inspectPreparedEntries(db,'account-a','owner-a').items[0].reservationState,'UNKNOWN');
}));
test('wrong owner never reads broker; missing or duplicate discovery never implies zero fill',()=>withDb(async db=>{
 const p=fixture();let reads=0;p.getOrderBook=async()=>{reads++;return [];};
 assert.equal((await reconcileOwnerPreparedOrder(db,{...principal,userId:'owner-b'},p,intent.intentId,()=>now+1)).status,'DENIED');
 assert.equal(reads,0);
 assert.equal((await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+1)).status,'UNKNOWN');
 assert.equal(reads,1);
 p.getOrderBook=async()=>[base,{...base,order_id:'other'}];
 assert.equal((await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+1)).status,'UNKNOWN');
 const row=inspectPreparedEntries(db,'account-a','owner-a').items[0];
 assert.equal(row.brokerOrderId,null);assert.equal(row.filledQuantity,null);assert.equal(row.reservedPaise,10000);
}));
test('native session rotation or revocation during read prevents durable evidence writes',()=>withDb(async db=>{
 const p=fixture();let epoch=2;p.getBrokerAuthEpoch=()=>epoch;
 p.getOrderTrades=async()=>{epoch=3;return [trade];};
 assert.equal((await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+1)).status,'DENIED');
 epoch=2;p.getOrderTrades=async()=>{db.prepare('UPDATE users SET session_version=3 WHERE id=?').run('owner-a');return [trade];};
 assert.equal((await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+1)).status,'DENIED');
 const row=inspectPreparedEntries(db,'account-a','owner-a').items[0];
 assert.equal(row.brokerOrderId,null);assert.equal(row.filledQuantity,null);assert.equal(row.reservationState,'HELD');
}));
test('contradictory trade evidence retains reservation without accepting false execution',()=>withDb(async db=>{
 const p=fixture();p.getOrderTrades=async()=>[];
 assert.equal((await reconcileOwnerPreparedOrder(db,principal,p,intent.intentId,()=>now+1)).status,'UNKNOWN');
 const row=inspectPreparedEntries(db,'account-a','owner-a').items[0];
 assert.equal(row.brokerOrderId,null);assert.equal(row.filledQuantity,null);assert.equal(row.reservationState,'UNKNOWN');
}));
