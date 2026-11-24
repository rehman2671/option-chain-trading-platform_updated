import type {ProjectedEntryInput} from './projectedEntryRisk.js';

export interface ServerPreparationPolicy {
 accountId:string;policyVersion:string;maxFeesPaise:number;maxDailyLossPaise:number;
 limits:ProjectedEntryInput['limits'];
}
const keys=['netDelta','netGamma','netTheta','netVega','grossDelta','grossGamma','grossTheta','grossVega'] as const;
const underlyings=['NIFTY','BANKNIFTY','SENSEX'];
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(x);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
/** Strict optional server configuration. No synthetic defaults. Fee bound is
 * an explicit deployment-owned worst-case bound, not a broker fee quotation.
 * No client can supply or override the policy through an HTTP route. */
export function readServerPreparationPolicy(raw:unknown,accountId:string):ServerPreparationPolicy|null{
 if(typeof raw!=='string'||!raw||raw.length>65536||!id(accountId))return null;
 try{
  const rows:unknown=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.length<1||rows.length>100)return null;
  const seen=new Set<string>();let found:ServerPreparationPolicy|null=null;
  for(const row of rows){
   if(!object(row)||Object.keys(row).length!==5||!id(row.accountId)||seen.has(row.accountId)||!id(row.policyVersion)||
      !positive(row.maxFeesPaise)||!Number.isSafeInteger(row.maxFeesPaise)||
      !positive(row.maxDailyLossPaise)||!Number.isSafeInteger(row.maxDailyLossPaise)||!object(row.limits))return null;
   seen.add(row.accountId);
   const entries=Object.entries(row.limits);
   if(entries.length<1||entries.length>3)return null;
   for(const [name,limits] of entries){
    if(!underlyings.includes(name)||!object(limits)||Object.keys(limits).length!==keys.length||
      !keys.every(k=>positive(limits[k])))return null;
   }
   if(row.accountId===accountId)found={accountId:row.accountId,policyVersion:row.policyVersion,
      maxFeesPaise:row.maxFeesPaise,maxDailyLossPaise:row.maxDailyLossPaise,limits:row.limits as ServerPreparationPolicy['limits']};
  }
  return found;
 }catch{return null;}
}
