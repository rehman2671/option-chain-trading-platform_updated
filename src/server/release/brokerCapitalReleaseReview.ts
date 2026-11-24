import {guardFullBrokerPositionRows,guardFullBrokerOrderBook,guardFullBrokerGttList} from '../engine/ema15m/adaptiveUpstoxNativeReadCardinalityGuard.js';
import {reconcileOrderEvidence,validOrderIntent,type OrderIntentEvidence} from './brokerOrderReconciliationEvidence.js';

export interface ReleaseReviewInput {
 accountId:string; authEpoch:number; intent:OrderIntentEvidence;
 startedAt:number; receivedAt:number;
 detail:unknown; trades:unknown; positions:unknown; orders:unknown; gtt:unknown;
}
export interface ReleaseReview {
 status:'REVIEW_REQUIRED'|'BLOCKED'|'UNKNOWN'; reason:string;
 capitalReleaseAuthorized:false; retryAuthorized:false; accountFlatCertified:false;
}
const out=(status:ReleaseReview['status'],reason:string):ReleaseReview=>({status,reason,capitalReleaseAuthorized:false,retryAuthorized:false,accountFlatCertified:false});
const terminal=(s:unknown)=>typeof s==='string'&&['COMPLETE','FILLED','REJECTED','CANCELLED','CANCELED'].includes(s.trim().toUpperCase());
/** Conservative review of a terminal zero-fill attempt only. All account rows
 * must be interpretable; any nonzero position, nonterminal order or GTT row
 * blocks review. Native current-day reads are not atomic historical evidence.
 * Never mutates reservations or certifies that the account is flat. */
export function assessBrokerCapitalReleaseReview(x:ReleaseReviewInput,expectedAccount:string,expectedEpoch:number,now:number):ReleaseReview{
 if(!x||typeof expectedAccount!=='string'||!expectedAccount||x.accountId!==expectedAccount||
  !Number.isSafeInteger(expectedEpoch)||expectedEpoch<1||x.authEpoch!==expectedEpoch||!validOrderIntent(x.intent)||
  ![x.startedAt,x.receivedAt,now].every(Number.isSafeInteger)||x.startedAt<=0||x.receivedAt<x.startedAt||
  x.receivedAt>now||now-x.startedAt>15000)return out('UNKNOWN','ACCOUNT_SESSION_OR_CLOCK_UNVERIFIED');
 const e=reconcileOrderEvidence(x.intent,x.detail,x.trades);
 if(e.status==='UNKNOWN')return out('UNKNOWN','EXACT_ORDER_EVIDENCE_UNAVAILABLE');
 if(e.status!=='TERMINAL_NO_FILL')return out('BLOCKED','ORDER_NOT_TERMINAL_ZERO_FILL');
 const positions=guardFullBrokerPositionRows(x.positions),orders=guardFullBrokerOrderBook(x.orders),gtt=guardFullBrokerGttList(x.gtt);
 if(!positions||!orders||!gtt)return out('UNKNOWN','ACCOUNT_READS_UNAVAILABLE');
 const matching=orders.filter(p=>p.order_id===x.intent.orderId);
 if(matching.length!==1)return out('UNKNOWN','ORDER_BOOK_IDENTITY_UNVERIFIED');
 const row=matching[0],detail=x.detail as Record<string,unknown>;
 if(row.instrument_token!==x.intent.instrumentKey||row.product!==x.intent.product||row.transaction_type!==x.intent.side||
  row.quantity!==x.intent.quantity||row.filled_quantity!==0||row.pending_quantity!==0||row.tag!==x.intent.tag||
  typeof row.status!=='string'||typeof detail.status!=='string'||row.status.trim().toUpperCase()!==detail.status.trim().toUpperCase())
  return out('UNKNOWN','ORDER_BOOK_CONTRADICTS_DETAIL');
 if(positions.some(p=>Number(p.net_quantity)!==0))return out('BLOCKED','ACCOUNT_POSITION_EXPOSURE_REPORTED');
 if(orders.some(p=>!terminal(p.status)||p.pending_quantity!==0))return out('BLOCKED','ACCOUNT_ORDER_EXPOSURE_REPORTED');
 if(gtt.length!==0)return out('BLOCKED','ACCOUNT_CONDITIONAL_ORDER_EXPOSURE_REPORTED');
 return out('REVIEW_REQUIRED','Terminal zero-fill and no exposure in these native reads; independent reconciliation and authorized release still required');
}
