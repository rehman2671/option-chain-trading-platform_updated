/** Deployment-owned mapping. Never derive an owner from the shared provider,
 * a browser account field, email, default GLOBAL, or role alone. */
export interface BrokerOwnerBinding {
 ownerId:string; accountId:string; authEpoch:number; verifiedAt:number;
}
export interface VerifiedPrincipal {userId:string;sessionVersion:number}
export interface NativeConnectionIdentity {isConnected:boolean;userId?:string;authEpoch:number}
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(v);
const version=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
/** Deliberately use an array so duplicate owners/accounts cannot be silently
 * overwritten by JSON object key semantics. One account has one owner. */
export function parseBrokerOwnerMapping(raw:unknown):ReadonlyMap<string,string>|null{
 if(typeof raw!=='string'||!raw||raw.length>65536)return null;
 try{
  const rows:unknown=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.length<1||rows.length>100)return null;
  const map=new Map<string,string>(),accounts=new Set<string>();
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||
      !id(row.ownerId)||row.ownerId==='GLOBAL'||!id(row.accountId)||map.has(row.ownerId)||accounts.has(row.accountId))return null;
   map.set(row.ownerId,row.accountId);accounts.add(row.accountId);
  }
  return map;
 }catch{return null;}
}
export function resolveServerBrokerOwnerBinding(principal:VerifiedPrincipal,activeSessionVersion:number|null,
 connection:NativeConnectionIdentity,rawMapping:unknown,now:number):BrokerOwnerBinding|null{
 if(!principal||!id(principal.userId)||!version(principal.sessionVersion)||activeSessionVersion!==principal.sessionVersion||
  !connection||connection.isConnected!==true||!id(connection.userId)||!version(connection.authEpoch)||connection.authEpoch===0||
  !Number.isSafeInteger(now)||now<=0)return null;
 const mapping=parseBrokerOwnerMapping(rawMapping);
 if(!mapping||mapping.get(principal.userId)!==connection.userId)return null;
 return {ownerId:principal.userId,accountId:connection.userId,authEpoch:connection.authEpoch,verifiedAt:now};
}
