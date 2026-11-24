export interface RecoveryItemView{
 intentId:string;intentState:string|null;filledQuantity:number|null;reservedPaise:number|null;reservationState:string|null;
 disposition:'RECONCILIATION_REQUIRED'|'TERMINAL_REVIEW_REQUIRED'|'ORPHAN_REVIEW_REQUIRED';
}
export interface RecoveryView{status:'EMPTY'|'UNKNOWN'|'REVIEW_REQUIRED';items:RecoveryItemView[]}
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const textOrNull=(v:unknown):v is string|null=>v===null||(typeof v==='string'&&v.length>0&&v.length<=128);
const qty=(v:unknown):v is number|null=>v===null||(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0);
export function parseRecoveryResponse(raw:unknown):RecoveryView|null{
 if(!object(raw)||raw.orderAuthorized!==false||raw.capitalReleaseAuthorized!==false||
  (raw.status!=='EMPTY'&&raw.status!=='UNKNOWN'&&raw.status!=='REVIEW_REQUIRED')||
  !Array.isArray(raw.items)||raw.items.length>500)return null;
 if((raw.status==='REVIEW_REQUIRED')!==(raw.items.length>0))return null;
 const items:RecoveryItemView[]=[];
 for(const r of raw.items){
  if(!object(r)||typeof r.intentId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(r.intentId)||
   !textOrNull(r.intentState)||!qty(r.filledQuantity)||!qty(r.reservedPaise)||r.reservedPaise===0||
   (r.reservationState!==null&&r.reservationState!=='HELD'&&r.reservationState!=='UNKNOWN')||
   (r.disposition!=='RECONCILIATION_REQUIRED'&&r.disposition!=='TERMINAL_REVIEW_REQUIRED'&&r.disposition!=='ORPHAN_REVIEW_REQUIRED'))return null;
  items.push({intentId:r.intentId,intentState:r.intentState,filledQuantity:r.filledQuantity,
   reservedPaise:r.reservedPaise,reservationState:r.reservationState,disposition:r.disposition});
 }
 return {status:raw.status,items};
}
