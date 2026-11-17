/**
 * Adaptive Swing v2 Phase30 — OFFLINE SHADOW-ONLY cross-capture verification.
 *
 * Correlates independently supplied Phase29 private GET archives with the
 * Phase28 dual-Ed25519 witness and Phase27 trade/order chronology. No
 * network, database, token, order instruction, scheduled polling or writes.
 * Even a positive report NEVER establishes a broker-native stop or a live
 * account's auth/ownership. This is an operator-provided evidence review.
 */
import {createHash} from 'node:crypto';
import {TextDecoder,isDeepStrictEqual} from 'node:util';
import {
  auditPhase28OfflineDualWitnessEvidence,
  type Phase28OfflineWitnessPackage,
  type ExternalOfflineWitnessTrustPolicy,
  type Phase28ReadOnlyWitnessReport
} from './adaptiveUpstoxOfflineDualWitnessGate.js';
import type {
  AuthorizedOfflineCaptureReport,SensitiveReadOnlyCaptureArchive
} from './adaptiveUpstoxAuthorizedGetCapture.js';
import type {ReadOnlyNrmlAuditPolicy}
  from './adaptiveReadOnlyNrmlProtectionAudit.js';

type Book='positions'|'orders'|'gtts'|'trades';
const BOOKS=['positions','orders','gtts','trades'] as const;
const HASH=/^[a-f0-9]{64}$/;
export interface Phase29PrivateArchiveRecord {
  schemaVersion:'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1';
  origin:'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED';
  report:AuthorizedOfflineCaptureReport;
  archive:SensitiveReadOnlyCaptureArchive;
}
export interface Phase30PrivateShadowBundle {
  schemaVersion:'ADAPTIVE_SWING_V2_SHADOW_REVIEW_V1';
  source:'PRIVATELY_ARCHIVED_OPERATOR_CAPTURE';
  /** Ordered, complete private capture archive records (never publish). */
  captures:Phase29PrivateArchiveRecord[];
  signedWitness:Phase28OfflineWitnessPackage;
}
export interface Phase30ShadowReview {
  mode:'NRML_SHADOW_ONLY_REVIEW';
  status:'INVALID_EVIDENCE'|'SIGNATURE_OR_TRUST_REJECTED'|
    'BLOCKED_OR_UNKNOWN'|'SHADOW_REVIEW_ONLY_UNVERIFIED';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  nativeOrderInstruction:null;
  actualBrokerStopVerified:false;
  independentExchangeFillVerified:false;
  independentSourceIpAttested:false;
  protectedOvernight:false;
  sourceScope:'OPERATOR_PROVIDED_READ_ONLY_GET_ARCHIVES';
  reasons:string[];
  reviewedCaptures:number;
  matchedOriginalBodies:number;
  dualWitnessVerified:boolean;
  phase27Status:Phase28ReadOnlyWitnessReport['phase27Status'];
  chainPayloadSha256:string|null;
  warnings:string[];
}
const warnings=[
  'BROKER_GET_TRANSPORT_ORIGIN_AND_OWNER_AUTHORIZATION_NOT_INDEPENDENTLY_ATTESTED',
  'OPERATOR_PROFILE_UCC_AND_ANALYTICS_TOKEN_CANNOT_CERTIFY_NATIVE_STOP_ACK',
  'ARCHIVED_GET_BODIES_AND_DUAL_WITNESSES_ARE_NOT_UPSTOX_SIGNED',
  'REAL_NETWORK_IP_EGRESS_AND_STATIC_IP_REGISTRATION_NOT_ATTESTED',
  'RAW_BROKER_ORDER_AND_TRADES_ARE_DAY_SCOPED_NOT_OVERNIGHT_PROOF',
  'GTT_GET_EXCLUDES_COMPLETED_HISTORY',
  'PERSISTENT_NONCE_REPLAY_GUARD_MUST_BE_CLAIMED_SEPARATELY',
  'NO_LIVE_NRML_ORDERS_CANCELS_REPAIRS_OR_15_15_SQUARE_OFF'
];
const base=():Phase30ShadowReview=>({
  mode:'NRML_SHADOW_ONLY_REVIEW',status:'INVALID_EVIDENCE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  nativeOrderInstruction:null,actualBrokerStopVerified:false,
  independentExchangeFillVerified:false,
  independentSourceIpAttested:false,protectedOvernight:false,
  sourceScope:'OPERATOR_PROVIDED_READ_ONLY_GET_ARCHIVES',
  reasons:[],reviewedCaptures:0,matchedOriginalBodies:0,
  dualWitnessVerified:false,phase27Status:null,
  chainPayloadSha256:null,warnings
});
const id=(x:unknown):x is string=>
  typeof x==='string'&&x.trim().length>0&&x.length<=256;
const record=(x:unknown):x is Record<string,unknown>=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const digest=(x:Uint8Array|string):string=>
  createHash('sha256').update(x).digest('hex');
/** Exact base64 round-trip. Never output decoded private bytes. */
function bytes(value:unknown):Buffer|null{
  if(typeof value!=='string'||value.length<4||
    value.length>131072||value.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    return null;
  const buf=Buffer.from(value,'base64');
  return buf.toString('base64')===value&&buf.length<=90000?buf:null;
}
function parsed(buf:Buffer):unknown{
  return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(buf));
}
function validProfile(raw:Buffer,userId:string):boolean{
  try{
    const p=parsed(raw);
    if(!record(p)||p.status!=='success'||!record(p.data))return false;
    return p.data.user_id===userId&&p.data.broker==='UPSTOX'&&
      p.data.is_active===true&&Array.isArray(p.data.products)&&
      p.data.products.includes('D')&&
      Array.isArray(p.data.order_types)&&
      p.data.order_types.some(x=>x==='SL'||x==='SL-M');
  }catch{return false;}
}
function matchingBooks(
  capture:Phase29PrivateArchiveRecord,
  witness:Phase28OfflineWitnessPackage,
  i:number
):{count:number;error:string|null}{
  const report=capture.report;
  const archive=capture.archive;
  const frame=witness.lifecycle.frames[i];
  if(!frame||!archive||!Array.isArray(archive.byteWitnesses)||
    !isDeepStrictEqual(archive.frame,frame))
    return {count:0,error:'PRIVATE_FRAME_DOES_NOT_MATCH_SIGNED_LIFECYCLE'};
  const scope=frame.expected?.accountScopeId;
  if(!id(scope)||archive.frame.capture.accountScopeId!==scope||
    report.accountScopeSha256!==digest(scope))
    return {count:0,error:'CAPTURE_ACCOUNT_SCOPE_HASH_OR_FRAME_MISMATCH'};
  if(!record(report.responseBodySha256)||
    Object.keys(report.responseBodySha256).length!==5)
    return {count:0,error:'INCOMPLETE_OR_EXTRA_GET_RESPONSE_DIGESTS'};
  const profile=bytes(archive.profileResponseUtf8Base64);
  if(!profile||!validProfile(profile,scope)||
    report.responseBodySha256.profile!==digest(profile))
    return {count:0,error:'PROFILE_UCC_OR_ORIGINAL_BODY_DIGEST_MISMATCH'};
  if(archive.byteWitnesses.length!==4)
    return {count:0,error:'MISSING_PRIVATE_ARCHIVED_GET_BOOKS'};
  const seen=new Set<string>();
  for(const entry of archive.byteWitnesses){
    if(!entry||entry.sequence!==frame.sequence||
      !BOOKS.includes(entry.book as Book)||seen.has(entry.book))
      return {count:0,error:'DUPLICATED_OR_MISSCOPED_PRIVATE_GET_BOOK'};
    seen.add(entry.book);
    const raw=bytes(entry.responseUtf8Base64);
    if(!raw||report.responseBodySha256[entry.book as Book]!==digest(raw))
      return {count:0,error:'ORIGINAL_ARCHIVE_RAW_BODY_HASH_MISMATCH'};
    let body:unknown;
    try{body=parsed(raw);}catch{
      return {count:0,error:'UNPARSABLE_RAW_GET_RESPONSE_BODY'};
    }
    const structured=entry.book==='trades'?frame.trades.response:
      frame.capture[entry.book as Exclude<Book,'trades'>].response;
    if(!isDeepStrictEqual(body,structured))
      return {count:0,error:'PRIVATE_BODY_DIFFERS_FROM_SIGNED_LIFECYCLE'};
    const signed=witness.byteWitnesses.find(x=>x.sequence===frame.sequence&&
      x.book===entry.book);
    if(!signed||signed.responseUtf8Base64!==entry.responseUtf8Base64)
      return {count:0,error:'PRIVATE_ARCHIVE_BYTES_DIFFER_FROM_DUAL_WITNESS'};
  }
  if(seen.size!==4)return {count:0,error:'MISSING_PRIVATE_ARCHIVED_GET_BOOKS'};
  return {count:5,error:null};
}
/**
 * Pure redacted shadow-only review. Never promotes a Phase26/27/28 result
 * into broker authentication or trading authorization. MUST separately
 * claim the Phase29 one-use nonce in an owner-private durable registry.
 */
export function reviewPhase30ShadowEvidence(
  bundle:Phase30PrivateShadowBundle,
  policy:ReadOnlyNrmlAuditPolicy,
  trust:ExternalOfflineWitnessTrustPolicy
):Phase30ShadowReview{
  const empty=base();
  if(!bundle||bundle.schemaVersion!=='ADAPTIVE_SWING_V2_SHADOW_REVIEW_V1'||
    bundle.source!=='PRIVATELY_ARCHIVED_OPERATOR_CAPTURE'||
    !Array.isArray(bundle.captures)||bundle.captures.length<2||
    bundle.captures.length>64||!bundle.signedWitness||
    !bundle.signedWitness.lifecycle||
    bundle.captures.length!==bundle.signedWitness.lifecycle.frames?.length)
    return {...empty,reasons:['INVALID_SHADOW_BUNDLE_OR_FRAME_COVERAGE']};
  let matched=0;
  const reasons:string[]=[];
  let blocked=false;
  for(const [index,capture] of bundle.captures.entries()){
    if(!capture||capture.schemaVersion!==
      'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1'||
      capture.origin!==
      'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED'||
      !capture.report||capture.report.mode!==
      'EXPLICIT_GET_ONLY_BROKER_EVIDENCE_CAPTURE'||
      !capture.report.readOnlyNetworkActuallyAttempted||
      !capture.report.accountProfileMatched||
      capture.report.status!=='CAPTURE_RECORDED_UNVERIFIED'||
      capture.report.responseCount!==5||
      !capture.archive)
      return {...empty,reasons:['INVALID_OR_INCOMPLETE_PHASE29_CAPTURE']};
    if(capture.report.executionAuthorized!==false||
      capture.report.productionSafe!==false||
      capture.report.brokerAuthenticated!==false||
      capture.report.brokerStopInstalled!==false||
      capture.report.nativeOrderInstruction!==null)
      return {...empty,reasons:['UNSAFE_PHASE29_REPORT_ATTEMPTS_AUTHORIZATION']};
    const b=matchingBooks(capture,bundle.signedWitness,index);
    if(b.error)return {...empty,reasons:[b.error]};
    matched+=b.count;
    if(capture.report.phase26Status!=='STRUCTURAL_REVIEW_ONLY'){
      blocked=true;
      reasons.push('PHASE29_SINGLE_FRAME_PROTECTION_NOT_CONSISTENT');
    }
  }
  const review=auditPhase28OfflineDualWitnessEvidence(
    bundle.signedWitness,policy,trust);
  const detailed={
    ...empty,reviewedCaptures:bundle.captures.length,
    matchedOriginalBodies:matched,
    dualWitnessVerified:review.signaturesVerified,
    phase27Status:review.phase27Status,
    chainPayloadSha256:review.attestedPayloadSha256
  };
  if(!review.signaturesVerified){
    return {...detailed,status:'SIGNATURE_OR_TRUST_REJECTED',
      reasons:review.reasons.length?review.reasons:
      ['SIGNED_WITNESS_COULD_NOT_BE_VALIDATED']};
  }
  if(review.status==='BLOCKED_OR_UNKNOWN'||blocked)
    return {...detailed,status:'BLOCKED_OR_UNKNOWN',
      reasons:[...new Set([...reasons,...review.reasons])]};
  if(review.status!=='SIGNATURES_VALID_OFFLINE_UNVERIFIED')
    return {...detailed,status:'SIGNATURE_OR_TRUST_REJECTED',
      reasons:review.reasons.length?review.reasons:['SIGNED_WITNESS_INVALID']};
  return {...detailed,status:'SHADOW_REVIEW_ONLY_UNVERIFIED',reasons:[]};
}
