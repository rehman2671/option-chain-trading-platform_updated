import type {WalkForwardResult} from '../types.js';
import type {StoredReplaySample} from './storedReplaySample.js';

/** Descriptive expanding-window partition of a single stored trade sequence.
 * It is NOT a retrained model, untouched OOS evaluation, or release gate.
 * Each test segment is disjoint and one trade is embargoed at each boundary. */
export class WalkForwardEngine {
 public runWalkForward(strategyId:string,windowsCount:number=4,sample?:StoredReplaySample):WalkForwardResult{
  const empty:WalkForwardResult={strategyId,windowsCount:0,inSampleSharpeAvg:0,outOfSampleSharpeAvg:0,efficiencyRatio:0,
   stabilityPct:0,passed:false,windows:[],evidenceStatus:'NO_INDEPENDENT_OOS'};
  if(!sample||sample.strategyId!==strategyId||sample.source!=='UNVERIFIED_STORED_REPLAY'||
    !Number.isSafeInteger(windowsCount)||windowsCount<1||windowsCount>8)return empty;
  const trades=sample.trades;
  if(!Array.isArray(trades)||trades.length>10000||trades.length<(windowsCount+1)*5+1)return empty;
  let last=-Infinity;
  for(const t of trades){
   if(!Number.isFinite(t.entryMs)||!Number.isFinite(t.exitMs)||!Number.isFinite(t.netPnl)||
      t.entryMs<last||t.exitMs<=t.entryMs)return empty;
   last=t.exitMs;
  }
  const chunk=Math.floor(trades.length/(windowsCount+1));
  const windows:WalkForwardResult['windows']=[];
  const sum=(v:typeof trades)=>v.reduce((a,t)=>a+t.netPnl,0);
  for(let i=0;i<windowsCount;i++){
   const boundary=(i+1)*chunk;
   const train=trades.slice(0,boundary-1),test=trades.slice(boundary,i===windowsCount-1?trades.length:boundary+chunk);
   if(train.length<5||test.length<5)return empty;
   const trainPnl=sum(train),testPnl=sum(test);
   if(!Number.isFinite(trainPnl)||!Number.isFinite(testPnl))return empty;
   windows.push({windowId:i+1,trainStart:new Date(train[0].entryMs).toISOString(),trainEnd:new Date(train.at(-1)!.exitMs).toISOString(),
    testStart:new Date(test[0].entryMs).toISOString(),testEnd:new Date(test.at(-1)!.exitMs).toISOString(),
    trainNetPnl:trainPnl,testNetPnl:testPnl,testSharpe:0,status:'FAILED',trainTradeCount:train.length,testTradeCount:test.length});
  }
  return {...empty,windowsCount:windows.length,windows,evidenceStatus:'DESCRIPTIVE_CHRONOLOGICAL_PARTITIONS',
   replayId:sample.replayId,sampleSize:trades.length};
 }
}
export const walkForwardEngine=new WalkForwardEngine();
