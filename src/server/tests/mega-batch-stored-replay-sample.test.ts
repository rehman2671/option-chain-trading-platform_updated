import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectStoredReplaySample} from '../../quant/research/storedReplaySample.js';
import {walkForwardEngine} from '../../quant/research/walkForwardEngine.js';
import {monteCarloEngine} from '../../quant/research/monteCarloEngine.js';
const base=Date.parse('2026-11-01T04:00:00Z');
const iso=(m:number)=>new Date(base+m*60000).toISOString();
function fixture(){
 const trades=Array.from({length:30},(_,i)=>({id:'trade-'+i,entryTime:iso(i*20),exitTime:iso(i*20+10),grossPnl:i%2?100:-30,costs:10,netPnl:i%2?90:-40,direction:'LONG',exitReason:'MODEL'}));
 return {id:'replay-a',strategyId:'strategy-a',strategyVersion:2,status:'COMPLETED',evidenceStatus:'UNVERIFIED_STORED_REPLAY',
  periodStart:iso(0),periodEnd:iso(600),sampleSize:trades.length,totalNetPnl:trades.reduce((s,t)=>s+t.netPnl,0),trades};
}
const select=(rows:unknown,replayId?:string)=>selectStoredReplaySample(rows,'strategy-a',2,replayId);
test('exact stored strategy, version and replay identity; ambiguous catalog does not choose a winner',()=>{
 const r=fixture(),b={...r,id:'replay-b'};
 assert.equal(select([r])?.trades.length,30);
 assert.equal(select([r,b]),null);
 assert.equal(select([r,b],'replay-b')?.replayId,'replay-b');
 assert.equal(select([r,r],'replay-a'),null);
 assert.equal(select([{...r,strategyVersion:1}]),null);
 assert.equal(select([{...r,evidenceStatus:undefined}]),null);
 assert.equal(select([{...r,status:'INSUFFICIENT_HISTORICAL_DATA'}]),null);
 assert.equal(select([r],'unknown'),null);
});
test('reject mismatched sample count, aggregate, gross/cost/net, duplicate ids and malformed values',()=>{
 const r=fixture();
 for(const invalid of [{...r,sampleSize:31},{...r,totalNetPnl:r.totalNetPnl+10},
  {...r,trades:r.trades.map((t,i)=>i===1?{...t,id:r.trades[0].id}:t)},
  {...r,trades:r.trades.map((t,i)=>i===1?{...t,costs:-1}:t)},
  {...r,trades:r.trades.map((t,i)=>i===1?{...t,netPnl:NaN}:t)},
  {...r,trades:r.trades.map((t,i)=>i===1?{...t,netPnl:999}:t)}])assert.equal(select([invalid]),null);
});
test('reject overlapping, backward, out-of-period and impossible timestamps',()=>{
 const r=fixture();
 for(const changed of [{entryTime:iso(1)},{entryTime:iso(50)},{exitTime:iso(601)},
   {entryTime:'2026-11-31T04:00:00Z'},{entryTime:'2026-11-01 04:20:00'},{entryTime:iso(-1)}]){
  const t=r.trades.map((t,i)=>i===1?{...t,...changed}:t);
  assert.equal(select([{...r,trades:t}]),null);
 }
});
test('real expanding windows have disjoint later partitions and one embargoed trade; never authorize OOS',()=>{
 const s=select([fixture()]);assert.ok(s);
 const result=walkForwardEngine.runWalkForward('strategy-a',4,s);
 assert.equal(result.evidenceStatus,'DESCRIPTIVE_CHRONOLOGICAL_PARTITIONS');
 assert.equal(result.windowsCount,4);assert.equal(result.passed,false);
 assert.equal(result.outOfSampleSharpeAvg,0);
 for(let i=0;i<result.windows.length;i++){
  const w=result.windows[i];assert.equal(w.trainTradeCount,5+6*i);assert.equal(w.testTradeCount,6);
  assert.ok(Date.parse(w.trainEnd)<Date.parse(w.testStart));
  assert.equal(w.testNetPnl,150);assert.equal(w.status,'FAILED');
  if(i)assert.ok(Date.parse(result.windows[i-1].testEnd)<Date.parse(w.testStart));
 }
 assert.equal(walkForwardEngine.runWalkForward('other',4,s).windowsCount,0);
 assert.equal(walkForwardEngine.runWalkForward('strategy-a',9,s).windowsCount,0);
 assert.equal(walkForwardEngine.runWalkForward('strategy-a',4,{...s,trades:s.trades.slice(0,10)}).windowsCount,0);
});
test('exact stored sample drives deterministic bounded bootstrap, not synthetic positive returns',()=>{
 const s=select([fixture()]);assert.ok(s);
 const sample=s.trades.map(t=>t.netPnl);
 const a=monteCarloEngine.runSimulation(s.strategyId,500,sample);
 assert.equal(a.sampleSize,30);assert.equal(a.simulationsCount,500);
 assert.deepEqual(a,monteCarloEngine.runSimulation(s.strategyId,500,sample));
 assert.ok(a.percentile5Pnl<=a.percentile95Pnl);
 assert.equal(monteCarloEngine.runSimulation(s.strategyId,10000,Array(1000).fill(1)).simulationsCount,0);
});
