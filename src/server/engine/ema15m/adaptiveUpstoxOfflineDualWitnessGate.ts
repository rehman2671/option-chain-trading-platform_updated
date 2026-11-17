/**
 * Adaptive Swing v2 Phase28 — OFFLINE detached dual-witness response-byte gate.
 *
 * No HTTP, tokens, private keys, signing service, DB, native orders or SDK.
 * Two Ed25519 signatures authenticate only possession of EXTERNALLY pinned
 * witness keys, NOT the actual source of untrusted operator-supplied JSON.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {TextDecoder} from 'node:util';
import {
  auditOfflineUpstoxNrmlLifecycle,type OfflineUpstoxLifecycleInput,
  type OfflineUpstoxLifecycleReport
} from './adaptiveUpstoxOfflineNrmlLifecycle.js';
import type {ReadOnlyNrmlAuditPolicy} from './adaptiveReadOnlyNrmlProtectionAudit.js';

const DOMAIN='ADAPTIVE_V2_PHASE28_DUAL_WITNESS_V1';
const ORIGIN='https://api.upstox.com';
const SHA=/^[a-f0-9]{64}$/;
const BOOKS=['positions','orders','gtts','trades'] as const;
type Book=typeof BOOKS[number];
export interface OfflineResponseByteWitness {
  sequence:number;
  book:Book;
  /** Captured ORIGINAL JSON HTTP response body bytes. Operator supplied.
   * Does not include signed broker headers or TLS provenance.
   */
  responseUtf8Base64:string;
}
export interface DetachedOfflineSignature {
  /** Capturer must sign first, then distinct reviewer. */
  signedAt:string;
  signatureBase64:string;
}
export interface Phase28OfflineWitnessPackage {
  schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_DUAL_WITNESS_V1';
  source:'OPERATOR_SUPPLIED_UNVERIFIED';
  claimedOrigin:'https://api.upstox.com';
  /** 32-byte challenge supplied by independently managed verifier policy. */
  challengeHex:string;
  lifecycle:OfflineUpstoxLifecycleInput;
  byteWitnesses:OfflineResponseByteWitness[];
  capturer:DetachedOfflineSignature;
  reviewer:DetachedOfflineSignature;
}
export interface ExternalOfflineWitnessTrustPolicy {
  schemaVersion:'EXTERNALLY_PINNED_ED25519_REVIEW_KEYS_V1';
  /** Set out of band, never copied from the submitted witness package. */
  expectedChallengeHex:string;
  expectedAccountScopeId:string;
  capturerPublicKeySpkiDerBase64:string;
  reviewerPublicKeySpkiDerBase64:string;
  maximumReviewAgeMinutes:number;
  /** Must be supplied out of band by a reviewer; time itself is not trusted. */
  verificationAsOf:string;
}
export interface Phase28ReadOnlyWitnessReport {
  mode:'OFFLINE_DUAL_WITNESS_EVIDENCE_REVIEW';
  status:'INVALID_EVIDENCE'|'SIGNATURE_OR_TRUST_REJECTED'|
    'BLOCKED_OR_UNKNOWN'|'SIGNATURES_VALID_OFFLINE_UNVERIFIED';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  nativeOrderInstruction:null;
  signaturesVerified:boolean;
  responseBodiesMatched:boolean;
  frameCount:number;
  responseBodiesVerified:number;
  attestedPayloadSha256:string|null;
  phase27Status:OfflineUpstoxLifecycleReport['status']|null;
  reasons:string[];
  warnings:string[];
}
const warnings=[
  'ED25519_PROVES_EXTERNAL_KEY_POSSESSION_NOT_BROKER_HTTP_OR_TLS_ORIGIN',
  'BOTH_WITNESSES_AND_EXPORTED_BODIES_CAN_STILL_BE_FABRICATED_OR_COLLUDE',
  'TRUST_KEY_PROVENANCE_AND_REVIEWER_INDEPENDENCE_REQUIRE_EXTERNAL_APPROVAL',
  'ORIGINAL_HTTP_HEADERS_TLS_PROOF_BROKER_SIGNED_ACK_AND_ACCOUNT_AUDIT_UNAVAILABLE',
  'CHALLENGE_REPLAY_ACROSS_RUNS_NEEDS_INDEPENDENT_PERSISTENT_REGISTRY',
  'UPSTOX_ORDER_AND_DAY_TRADES_DO_NOT_PROVE_OVERNIGHT_NATIVE_STOP',
  'NO_UPSTOX_TOKEN_OR_NETWORK_CALL_OR_NEW_NATIVE_ORDER_INSTRUCTION',
  'EXISTING_EMA_MIS_15_15_UNCHANGED_NO_NRML_AUTO_SQUARE_OFF'
];
const empty=():Phase28ReadOnlyWitnessReport=>({
  mode:'OFFLINE_DUAL_WITNESS_EVIDENCE_REVIEW',status:'INVALID_EVIDENCE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  nativeOrderInstruction:null,signaturesVerified:false,
  responseBodiesMatched:false,frameCount:0,responseBodiesVerified:0,
  attestedPayloadSha256:null,phase27Status:null,reasons:[],warnings
});
const ts=(value:unknown):number=>
  typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&
  /(Z|[+-]\d\d:\d\d)$/.test(value)?Date.parse(value):NaN;
const id=(v:unknown):v is string=>typeof v==='string'&&
  v.length>0&&v.length<=256&&v.trim().length>0;
const isSha=(v:unknown):v is string=>
  typeof v==='string'&&SHA.test(v);
const digest=(v:Buffer|string):string=>
  createHash('sha256').update(v).digest('hex');
/** Strict RFC4648 base64, no whitespace, no ambiguous decoder aliases. */
function decodeBase64(v:unknown,maxChars:number):Buffer|null{
  if(typeof v!=='string'||v.length<4||v.length>maxChars||
    v.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    return null;
  const b=Buffer.from(v,'base64');
  return b.toString('base64')===v?b:null;
}
function publicKey(spki:unknown){
  const der=decodeBase64(spki,300);
  if(!der)return null;
  try{
    const key=createPublicKey({key:der,format:'der',type:'spki'});
    return key.asymmetricKeyType==='ed25519'?{key,der}:null;
  }catch{return null;}
}
function rawResponse(frame:OfflineUpstoxLifecycleInput['frames'][number],
  book:Book):unknown {
  return book==='trades'?frame.trades.response:frame.capture[book].response;
}
/** Stable redacted per-frame bytes over which signatures are formed. */
export function preparePhase28OfflineWitnessPayload(
  pkg:Pick<Phase28OfflineWitnessPackage,
    'schemaVersion'|'source'|'claimedOrigin'|'challengeHex'|
    'lifecycle'|'byteWitnesses'>,
  policy:ReadOnlyNrmlAuditPolicy
):{payload:string;reasonCodes:string[];bodyCount:number} {
  const fail=(...reasons:string[])=>({
    payload:'',reasonCodes:reasons,bodyCount:0
  });
  if(!pkg||pkg.schemaVersion!=='ADAPTIVE_UPSTOX_OFFLINE_DUAL_WITNESS_V1'||
    pkg.source!=='OPERATOR_SUPPLIED_UNVERIFIED'||
    pkg.claimedOrigin!==ORIGIN||!isSha(pkg.challengeHex)||
    !pkg.lifecycle||!Array.isArray(pkg.lifecycle.frames)||
    pkg.lifecycle.frames.length<2||pkg.lifecycle.frames.length>64||
    !Array.isArray(pkg.byteWitnesses)||
    pkg.byteWitnesses.length!==pkg.lifecycle.frames.length*4)
    return fail('INVALID_OFFLINE_WITNESS_PACKAGE_OR_COVERAGE');
  if(!policy||!Number.isFinite(policy.maximumSnapshotAgeMinutes)||
    !Number.isFinite(policy.maximumCrossBookSkewSeconds)||
    !Number.isInteger(policy.minCalendarDaysBeforeExpiry))
    return fail('INVALID_LOCKED_AUDIT_POLICY');
  const signatures:Record<string,string>={};
  const seen=new Set<string>();
  for(const witness of pkg.byteWitnesses){
    if(!witness||!Number.isInteger(witness.sequence)||
      !BOOKS.includes(witness.book)||witness.sequence<1||
      witness.sequence>pkg.lifecycle.frames.length){
      return fail('UNKNOWN_SEQUENCE_OR_BOOK_IN_ORIGINAL_BYTE_WITNESS');
    }
    const key=witness.sequence+':'+witness.book;
    if(seen.has(key))return fail('DUPLICATED_ORIGINAL_RESPONSE_BOOK_WITNESS');
    seen.add(key);
    // 128 KiB base64 per response. Large exports require separate review.
    const raw=decodeBase64(witness.responseUtf8Base64,131072);
    if(!raw)return fail('MISSING_OR_MALFORMED_OR_OVERSIZED_ORIGINAL_RESPONSE_BYTES');
    let decoded:unknown;
    try{
      decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    }catch{return fail('INVALID_ORIGINAL_UTF8_RESPONSE_JSON');}
    const frame=pkg.lifecycle.frames[witness.sequence-1];
    if(!frame||frame.sequence!==witness.sequence||
      !isDeepStrictEqual(decoded,rawResponse(frame,witness.book)))
      return fail('ORIGINAL_RESPONSE_BYTES_DO_NOT_MATCH_LIFECYCLE_JSON');
    signatures[key]=digest(raw);
  }
  for(let sequence=1;sequence<=pkg.lifecycle.frames.length;sequence++){
    for(const book of BOOKS)
      if(!seen.has(sequence+':'+book))
        return fail('INCOMPLETE_ORIGINAL_RESPONSE_BYTE_COVERAGE');
  }
  // Domain separator; signatures bind the FULL lifecycle JSON, separately
  // supplied locked policy, external challenge, and every exact HTTP body.
  // The payload contains HASHES only, no raw account IDs/orders/trades.
  const payload=DOMAIN+'\n'+JSON.stringify({
    challengeHex:pkg.challengeHex,
    origin:pkg.claimedOrigin,
    lifecycleSha256:digest(JSON.stringify(pkg.lifecycle)),
    phase25PolicySha256:digest(JSON.stringify(policy)),
    accountScopeSha256:digest(pkg.lifecycle.frames[0]?.expected?.accountScopeId??''),
    responseBodiesSha256:Object.keys(signatures).sort().map(
      key=>[key,signatures[key]])
  });
  return {payload,reasonCodes:[],bodyCount:seen.size};
}
/** Sign *this exact UTF8 string* as Ed25519 detached data; never sign here. */
export function phase28CapturerMessage(payload:string,signedAt:string):string{
  return DOMAIN+'\nCAPTURER\n'+digest(payload)+'\n'+signedAt;
}
/** Reviewer explicitly signs capturer's signature too (ordered endorsement). */
export function phase28ReviewerMessage(
  payload:string,capturer:DetachedOfflineSignature,reviewerSignedAt:string
):string{
  return DOMAIN+'\nINDEPENDENT_REVIEWER\n'+digest(payload)+'\n'+
    capturer.signedAt+'\n'+capturer.signatureBase64+'\n'+reviewerSignedAt;
}
function signedValue(v:unknown,limit=2000):Buffer|null{
  const b=decodeBase64(v,limit);
  return b&&b.length===64?b:null;
}
/**
 * Verifies independently pinned Ed25519 signatures over exact local response
 * bytes and Phase27 semantics. NEVER treats signing as proof of broker origin.
 */
export function auditPhase28OfflineDualWitnessEvidence(
  pkg:Phase28OfflineWitnessPackage,lockedPolicy:ReadOnlyNrmlAuditPolicy,
  trust:ExternalOfflineWitnessTrustPolicy
):Phase28ReadOnlyWitnessReport {
  const r=empty();
  if(!trust||
    trust.schemaVersion!=='EXTERNALLY_PINNED_ED25519_REVIEW_KEYS_V1'||
    !id(trust.expectedAccountScopeId)||
    !isSha(trust.expectedChallengeHex)||
    !Number.isInteger(trust.maximumReviewAgeMinutes)||
    trust.maximumReviewAgeMinutes<1||
    trust.maximumReviewAgeMinutes>1440||
    !Number.isFinite(ts(trust.verificationAsOf)))
    return {...r,reasons:['INVALID_EXTERNAL_VERIFIER_TRUST_POLICY']};
  const pre=preparePhase28OfflineWitnessPayload(pkg,lockedPolicy);
  if(pre.reasonCodes.length)
    return {...r,reasons:pre.reasonCodes};
  const frames=pkg.lifecycle.frames;
  const latest=frames[frames.length-1];
  const firstScope=frames[0].expected.accountScopeId;
  if(pkg.challengeHex!==trust.expectedChallengeHex||
    firstScope!==trust.expectedAccountScopeId||
    frames.some(f=>f.expected.accountScopeId!==firstScope||
      f.capture.accountScopeId!==firstScope))
    return {...r,status:'SIGNATURE_OR_TRUST_REJECTED',
      reasons:['EXTERNAL_NONCE_OR_ACCOUNT_SCOPE_MISMATCH']};
  const capturerKey=publicKey(trust.capturerPublicKeySpkiDerBase64);
  const reviewerKey=publicKey(trust.reviewerPublicKeySpkiDerBase64);
  if(!capturerKey||!reviewerKey||
    capturerKey.der.equals(reviewerKey.der))
    return {...r,status:'SIGNATURE_OR_TRUST_REJECTED',
      reasons:['UNPINNED_INVALID_OR_IDENTICAL_REVIEW_KEYS']};
  const captureTime=ts(pkg.capturer?.signedAt),
    reviewerTime=ts(pkg.reviewer?.signedAt),
    latestTime=ts(latest.asOf),
    verificationTime=ts(trust.verificationAsOf);
  if(!Number.isFinite(captureTime)||!Number.isFinite(reviewerTime)||
    !Number.isFinite(latestTime)||
    captureTime<latestTime||reviewerTime<captureTime||
    reviewerTime>verificationTime||latestTime>verificationTime||
    verificationTime-reviewerTime>trust.maximumReviewAgeMinutes*60_000)
    return {...r,status:'SIGNATURE_OR_TRUST_REJECTED',
      reasons:['INVALID_ORDERED_SIGNOFF_CLOCK_OR_STALE_REVIEW']};
  const captureSig=signedValue(pkg.capturer.signatureBase64),
    reviewerSig=signedValue(pkg.reviewer.signatureBase64);
  if(!captureSig||!reviewerSig)
    return {...r,status:'SIGNATURE_OR_TRUST_REJECTED',
      reasons:['INVALID_DETACHED_ED25519_SIGNATURE_ENCODING']};
  let validCapture=false,validReview=false;
  try{
    validCapture=verify(null,Buffer.from(phase28CapturerMessage(
      pre.payload,pkg.capturer.signedAt),'utf8'),capturerKey.key,captureSig);
    validReview=verify(null,Buffer.from(phase28ReviewerMessage(
      pre.payload,pkg.capturer,pkg.reviewer.signedAt),'utf8'),
      reviewerKey.key,reviewerSig);
  }catch{return {...r,status:'SIGNATURE_OR_TRUST_REJECTED',
    reasons:['ED25519_SIGNATURE_VERIFICATION_FAILED']};}
  if(!validCapture||!validReview)
    return {...r,status:'SIGNATURE_OR_TRUST_REJECTED',
      reasons:['SIGNATURE_MISMATCH_OR_FABRICATED_RESPONSE_WITNESS']};
  const lifecycle=auditOfflineUpstoxNrmlLifecycle(pkg.lifecycle,lockedPolicy);
  const blocked=lifecycle.status!=='CHRONOLOGICALLY_CONSISTENT_UNVERIFIED';
  return {...r,
    status:blocked?'BLOCKED_OR_UNKNOWN':'SIGNATURES_VALID_OFFLINE_UNVERIFIED',
    signaturesVerified:true,responseBodiesMatched:true,
    frameCount:frames.length,responseBodiesVerified:pre.bodyCount,
    attestedPayloadSha256:digest(pre.payload),
    phase27Status:lifecycle.status,
    reasons:blocked?['PHASE27_UNVERIFIED_LIFECYCLE_BLOCKED',
      ...lifecycle.reasons]:[]
  };
}
