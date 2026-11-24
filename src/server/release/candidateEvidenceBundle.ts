import {evaluateProjectedEntryRisk,type ProjectedEntryInput} from './projectedEntryRisk.js';
import {validListedOptionRequest,type ListedOptionEvidence} from './exactListedOptionEvidence.js';
/** Must be resolved from an authenticated, server-owned account authorization
 * store. This value is NOT a credential, session token or authorization on its
 * own; never accept it from a request body. */
export interface ServerAccountBinding {
 ownerId:string; accountId:string; authEpoch:number; verifiedAt:number;
}
export interface CandidateEvidenceBundle {
 ownerId:string; binding:ServerAccountBinding; listing:ListedOptionEvidence; risk:ProjectedEntryInput;
}
type Outcome={status:'READY_FOR_PREPARATION_REVIEW';reservationPaise:number;maxPremiumAndFeesPaise:number;orderAuthorized:false}
 |{status:'DENIED';reason:string;orderAuthorized:false};
const deny=(reason:string):Outcome=>({status:'DENIED',reason,orderAuthorized:false});
const fresh=(t:number,now:number)=>Number.isSafeInteger(t)&&t>0&&t<=now&&now-t<=15000;
/** Internal evidence join. No active route, broker order or durable reservation.
 * Actual owner/account authentication, exchange Greek provenance and policy
 * sourcing are still upstream gates. */
export function assessCandidateEvidenceBundle(x:CandidateEvidenceBundle,now:number):Outcome{
 if(!x||!x.binding||!x.listing||!x.risk||typeof x.ownerId!=='string'||!x.ownerId||
   x.ownerId!==x.binding.ownerId||!Number.isSafeInteger(now)||!fresh(x.binding.verifiedAt,now)||
   !fresh(x.listing.observedAt,now)||x.listing.source!=='UPSTOX_LISTED_CONTRACT'||
   !validListedOptionRequest(x.listing.request))return deny('OWNER_OR_LISTING_EVIDENCE_UNAVAILABLE');
 const a=x.listing.request.identity,b=x.risk.expected;
 if(!b||x.binding.accountId!==a.accountId||x.binding.authEpoch!==a.authEpoch||
  a.accountId!==b.accountId||a.authEpoch!==b.authEpoch||a.instrumentKey!==b.instrumentKey||
  a.product!==b.product||a.quantity!==b.quantity||x.risk.candidateMark?.underlying!==x.listing.request.underlying)
  return deny('CANDIDATE_IDENTITY_MISMATCH');
 if(!Number.isSafeInteger(x.listing.lotSize)||x.listing.lotSize<=0||a.quantity%x.listing.lotSize!==0||
  !Number.isSafeInteger(x.listing.tickSizePaise)||x.listing.tickSizePaise<=0||
  !Number.isSafeInteger(x.risk.limitPricePaise)||x.risk.limitPricePaise<=0||x.risk.limitPricePaise%x.listing.tickSizePaise!==0)
  return deny('LOT_OR_TICK_MISMATCH');
 const r=evaluateProjectedEntryRisk(x.risk,now);
 if(r.status==='DENIED')return deny(r.reason);
 return {status:'READY_FOR_PREPARATION_REVIEW',reservationPaise:r.reservationPaise,
  maxPremiumAndFeesPaise:r.maxPremiumAndFeesPaise,orderAuthorized:false};
}
