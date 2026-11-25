import type {BacktestResult} from '../types.js';
export type ReplayTrade={id:string;entryMs:number;exitMs:number;netPnl:number};
export type StoredReplaySample={replayId:string;strategyId:string;strategyVersion:number;source:'UNVERIFIED_STORED_REPLAY';trades:ReplayTrade[]};
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=160&&/^[A-Za-z0-9:_-]+$/.test(v);
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const time=(v:unknown):number=>{
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v))return NaN;
 const ms=Date.parse(v);return Number.isFinite(ms)?ms:NaN;
};
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e10;
/** Select a single completed stored replay by exact identity. No merging
 * overlapping runs or accepting client-supplied P&L as independent evidence.
 * Old replay rows may have fabricated fills and are not eligible. */
export function selectStoredReplaySample(rows:unknown,strategyId:string,strategyVersion:number,replayId?:string):StoredReplaySample|null{
 if(!Array.isArray(rows)||rows.length>100||!id(strategyId)||!Number.isSafeInteger(strategyVersion)||strategyVersion<1||
   (replayId!==undefined&&!id(replayId)))return null;
 const candidates=rows.filter(r=>obj(r)&&r.strategyId===strategyId&&r.strategyVersion===strategyVersion&&
  r.status==='COMPLETED'&&r.evidenceStatus==='UNVERIFIED_STORED_REPLAY'&&(replayId===undefined||r.id===replayId));
 // Do not silently cherry-pick among multiple completed replays.
 if(candidates.length!==1)return null;
 const r=candidates[0] as BacktestResult;
 if(!id(r.id)||!Array.isArray(r.trades)||r.trades.length<4||r.trades.length>10000||r.sampleSize!==r.trades.length)return null;
 const start=Date.parse(r.periodStart),end=Date.parse(r.periodEnd);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
 const seen=new Set<string>(),trades:ReplayTrade[]=[];let priorExit=start-1,total=0;
 for(const t of r.trades){
  if(!obj(t)||!id(t.id)||seen.has(t.id)||!num(t.netPnl)||!num(t.grossPnl)||!num(t.costs)||t.costs<0||
    Math.abs(t.netPnl-(t.grossPnl-t.costs))>0.011)return null;
  const entryMs=time(t.entryTime),exitMs=time(t.exitTime);
  if(!Number.isFinite(entryMs)||!Number.isFinite(exitMs)||entryMs<start||exitMs>end||exitMs<=entryMs||entryMs<priorExit)return null;
  seen.add(t.id);priorExit=exitMs;total+=t.netPnl;
  trades.push({id:t.id,entryMs,exitMs,netPnl:t.netPnl});
 }
 if(!num(r.totalNetPnl)||Math.abs(total-r.totalNetPnl)>Math.max(.011,trades.length*.011))return null;
 return {replayId:r.id,strategyId,strategyVersion,source:'UNVERIFIED_STORED_REPLAY',trades};
}
