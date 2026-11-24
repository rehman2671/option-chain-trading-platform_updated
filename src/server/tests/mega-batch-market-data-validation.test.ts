import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exactCivilDate,nativeTradeTimestamp,parseNativeOptionChain} from '../engine/providers/nativeMarketDataValidation.js';
import {replayStatistics} from '../../quant/research/replayStatistics.js';
const at=Date.parse('2026-11-25T05:00:00Z');
const expiry='2026-12-31',key='NSE_INDEX|Nifty 50';
const leg=(instrument_key:string)=>({instrument_key,market_data:{ltp:50,oi:100,prev_oi:0,volume:20,bid_price:49,ask_price:51},option_greeks:{iv:15}});
const row={expiry,underlying_key:key,strike_price:25000,call_options:leg('NSE_FO|123'),put_options:leg('NSE_FO|456')};
const parse=(rows:unknown[])=>parseNativeOptionChain({status:'success',data:rows},key,expiry,[25000],at);
test('strict native date and timestamp validation rejects normalized civil dates and future epochs',()=>{
 for(const d of ['2026-02-30','2026-13-01','2026-2-01','2026-12-31T00:00:00Z',null])assert.equal(exactCivilDate(d),false);
 assert.equal(exactCivilDate('2028-02-29'),true);
 assert.equal(nativeTradeTimestamp(at,at),new Date(at).toISOString());
 for(const t of [null,true,'',1,Infinity,at+3001,'2026-11-25'])assert.equal(nativeTradeTimestamp(t,at),undefined);
});
test('native chain exact contract and provenance; no fabricated OI changes or price depth',()=>{
 const q=parse([row]).get('25000');assert.ok(q);
 assert.equal(q.ce.instrumentKey,'NSE_FO|123');assert.equal(q.ce.source,'UPSTOX_CHAIN_UNTIMED');
 assert.equal(q.ce.exchangeTimestampVerified,false);assert.equal(q.ce.changeInOI,100);
 assert.equal(q.ce.changeInOIAvailable,true);
 const missing={...row,call_options:{...row.call_options,market_data:{ltp:50,oi:100,bid_price:52,ask_price:51}}};
 const x=parse([missing]).get('25000')!;assert.equal(x.ce.changeInOIAvailable,false);
 assert.equal(x.ce.bidPrice,undefined);assert.equal(x.ce.askPrice,undefined);assert.equal(x.ce.volumeAvailable,false);
 for(const rows of [[row,row],[{...row,expiry:'2027-01-07'}],[{...row,underlying_key:'other'}],
  [{...row,put_options:leg('NSE_FO|123')}],[{...row,call_options:leg('BSE_FO|123')}],
  [{...row,strike_price:NaN}],[{...row,call_options:leg('NSE_FO|foo')}]]){
  assert.equal(parse(rows).size,0);
 }
});
test('replay statistics distinguish unavailable ratios and never claim validation',()=>{
 const a=replayStatistics([100,-40,0,30,-20],'seed');assert.ok(a);
 assert.equal(a.total,70);assert.equal(a.winRate,40);assert.equal(a.lossRate,40);
 assert.equal(a.walkForwardVerified,false);assert.equal(a.outOfSampleVerified,false);
 assert.equal(a.orderAuthorized,false);assert.deepEqual(a,replayStatistics([100,-40,0,30,-20],'seed'));
 assert.equal(replayStatistics([100,50],'seed')?.profitFactor,null);
 assert.equal(replayStatistics([0,0,0,0],'seed')?.ratio,null);
 assert.equal(replayStatistics([Infinity],'seed'),null);
 assert.equal(replayStatistics([100],'seed')?.bootstrap,null);
});

test('walk-forward and Monte Carlo never manufacture evidence from missing samples',async()=>{
 const {walkForwardEngine}=await import('../../quant/research/walkForwardEngine.js');
 const {monteCarloEngine}=await import('../../quant/research/monteCarloEngine.js');
 const wf=walkForwardEngine.runWalkForward('fixture',4);
 assert.equal(wf.passed,false);assert.equal(wf.windowsCount,0);assert.equal(wf.evidenceStatus,'NO_INDEPENDENT_OOS');
 for(const sample of [[],[1],[1,2,3,NaN]]){
  const result=monteCarloEngine.runSimulation('fixture',2000,sample);
  assert.equal(result.simulationsCount,0);assert.equal(result.evidenceStatus,'NO_TRADE_SAMPLE');
 }
 const sample=[100,-40,0,30,-20];
 const result=monteCarloEngine.runSimulation('fixture',500,sample);
 assert.equal(result.evidenceStatus,'INPUT_SAMPLE_BOOTSTRAP');assert.equal(result.sampleSize,5);
 assert.deepEqual(result,monteCarloEngine.runSimulation('fixture',500,sample));
 assert.ok(result.percentile5Pnl<=result.percentile50Pnl&&result.percentile50Pnl<=result.percentile95Pnl);
 assert.equal(monteCarloEngine.runSimulation('fixture',10001,sample).simulationsCount,0);
});
