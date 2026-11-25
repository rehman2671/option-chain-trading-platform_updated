import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dbEngine} from '../db.js';
import {paperExecutionService} from '../engine/ema15m/paperExecutionService.js';

test('MIS estimator never manages NRML, rejects invalid marks, and reports exits only after durable readback',()=>{
 const db=dbEngine as any;
 const names=['getOpenEmaPaperTrades','getEmaNotificationSettings','batchUpdateEmaPaperTrades','getEmaPaperTradeById','logEmaExecutionEvent'];
 const old=Object.fromEntries(names.map(k=>[k,db[k]]));
 const trade={id:'mis-fixture',signalId:'sig',instrument:'NIFTY',productType:'MIS',entryPrice:100,
  quantity:65,optionType:'CE',strikePrice:25000,expiryDate:'2026-12-31',status:'OPEN',stopLoss:80,targetPrice:200};
 const nrml={...trade,id:'nrml-fixture',productType:'NRML'};
 let calls=0;let writes:any[]=[];let logs:any[]=[];let persisted:any=trade;
 try{
  db.getOpenEmaPaperTrades=()=>[nrml,trade];
  db.getEmaNotificationSettings=()=>({trailingSlEnabled:false});
  db.batchUpdateEmaPaperTrades=(batch:any)=>writes.push(batch);
  db.getEmaPaperTradeById=()=>persisted;
  db.logEmaExecutionEvent=(event:any)=>logs.push(event);
  paperExecutionService.monitorPaperPositions('NIFTY',25000,()=>{calls++;return NaN;});
  assert.equal(calls,1);assert.equal(writes[0].toClose.length,0);assert.equal(writes[0].toUpdate.length,0);
  paperExecutionService.monitorPaperPositions('NIFTY',25000,()=>{calls++;throw Error('missing estimate');});
  assert.equal(writes.at(-1).toClose.length,0);
  paperExecutionService.monitorPaperPositions('NIFTY',25000,()=>{calls++;return 70;});
  assert.equal(writes.at(-1).toClose.length,1);
  assert.equal(writes.at(-1).toClose[0].id,trade.id);
  assert.equal(logs.length,0,'unconfirmed write is not a successful exit');
  persisted={...trade,status:'CLOSED',exitPrice:70,exitReason:'SL_HIT'};
  paperExecutionService.monitorPaperPositions('NIFTY',25000,()=>70);
  assert.equal(logs.length,1);assert.equal(logs[0].details.source,'MODELED_MIS_ESTIMATE');
  assert.equal(logs[0].executionMode,'PAPER');
 }finally{for(const k of names)db[k]=old[k];}
});
