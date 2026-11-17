import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {
  captureExplicitlyAuthorizedUpstoxGetEvidence,
  type AuthorizedOfflineCaptureRequest,type ReadOnlyGetTransport
} from '../../server/engine/ema15m/adaptiveUpstoxAuthorizedGetCapture.js';
import {
  reviewPhase30ShadowEvidence,
  type Phase30PrivateShadowBundle,type Phase29PrivateArchiveRecord
} from '../../server/engine/ema15m/adaptiveUpstoxPhase30ShadowDossier.js';
import {
  phase28CapturerMessage,phase28ReviewerMessage,
  preparePhase28OfflineWitnessPayload,
  type ExternalOfflineWitnessTrustPolicy,
  type Phase28OfflineWitnessPackage
} from '../../server/engine/ema15m/adaptiveUpstoxOfflineDualWitnessGate.js';
import type {ReadOnlyNrmlAuditPolicy}
  from '../../server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const UCC='SYNTHETIC_PHASE30_UCC';
const INSTRUMENT='NSE_FO|SYNTHETIC30';
const T='2026-11-17T10:00:00.000Z';
const plus=(x:string,ms:number)=>
  new Date(Date.parse(x)+ms).toISOString();
const policy:ReadOnlyNrmlAuditPolicy={
  maximumSnapshotAgeMinutes:5,maximumCrossBookSkewSeconds:90,
  minCalendarDaysBeforeExpiry:2
};
const a=generateKeyPairSync('ed25519');
const b=generateKeyPairSync('ed25519');
const other=generateKeyPairSync('ed25519');
const spki=(p:typeof a)=>p.publicKey.export({type:'spki',format:'der'})
  .toString('base64');
const trust:ExternalOfflineWitnessTrustPolicy={
  schemaVersion:'EXTERNALLY_PINNED_ED25519_REVIEW_KEYS_V1',
  expectedChallengeHex:'ab'.repeat(32),expectedAccountScopeId:UCC,
  capturerPublicKeySpkiDerBase64:spki(a),
  reviewerPublicKeySpkiDerBase64:spki(b),
  maximumReviewAgeMinutes:5,verificationAsOf:plus(T,105_000)
};
const success=(data:unknown)=>({status:'success',data});
const profile=success({user_id:UCC,broker:'UPSTOX',is_active:true,
  products:['D','I'],order_types:['SL']});
const position=success([{instrument_token:INSTRUMENT,
  product:'D',quantity:130}]);
const stop=success([{order_id:'SYNTHETIC_STOP30',
  instrument_token:INSTRUMENT,product:'D',quantity:130,
  filled_quantity:0,pending_quantity:130,status:'trigger pending',
  trigger_price:80,transaction_type:'SELL',order_type:'SL'}]);
const source=[profile,position,stop,success([]),success([])];
const sourceUrls=[
  '/v2/user/profile','/v2/portfolio/short-term-positions',
  '/v2/order/retrieve-all','/v3/order/gtt',
  '/v2/order/trades/get-trades-for-day'
];
async function frame(sequence:number,asOf:string,modifiedStop=false){
  let tick=0;
  const r:AuthorizedOfflineCaptureRequest={
    expected:{
      accountScopeId:UCC,instrumentKey:INSTRUMENT,productType:'NRML',
      expiry:'2026-12-24',lotSize:65,expectedNetLongQuantity:130
    },
    phase25Policy:policy,expectedBrokerUserId:UCC,
    analyticsToken:'SYNTHETIC_ONLY_NONREAL_TOKEN_FOR_TEST',
    operatorAuthorization:'ACCOUNT_OWNER_APPROVED_GET_ONLY',
    staticIpReview:'OPERATOR_ATTESTS_WHITELISTED_EGRESS',
    credentialType:'UPSTOX_ANALYTICS_TOKEN_ONLY',
    sequence,timeoutMs:1000,clock:()=>Date.parse(asOf)+tick++*1000
  };
  const t:ReadOnlyGetTransport={
    get:async (url,bearer)=>{
      assert.equal(bearer,r.analyticsToken);
      const idx=sourceUrls.indexOf(new URL(url).pathname);
      assert.ok(idx>=0);
      const sourceJson=structuredClone(source[idx]);
      if(idx===2&&modifiedStop)
        (sourceJson.data as Array<Record<string,unknown>>)[0]
          .status='open';
      return {status:200,finalUrl:url,redirected:false,
        contentType:'application/json',
        bodyBytes:Buffer.from(JSON.stringify(sourceJson))};
    }
  };
  const result=await captureExplicitlyAuthorizedUpstoxGetEvidence(r,t);
  assert.equal(result.report.status,'CAPTURE_RECORDED_UNVERIFIED');
  assert.ok(result.privateArchive);
  return {
    schemaVersion:'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1' as const,
    origin:'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED' as const,
    report:result.report,archive:result.privateArchive!
  } satisfies Phase29PrivateArchiveRecord;
}
async function sample(
  times=[T,plus(T,60_000)],changedStop=false
):Promise<Phase30PrivateShadowBundle>{
  const captures=[
    await frame(1,times[0]),
    await frame(2,times[1],changedStop)
  ];
  const signedWitness:Phase28OfflineWitnessPackage={
    schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_DUAL_WITNESS_V1',
    source:'OPERATOR_SUPPLIED_UNVERIFIED',
    claimedOrigin:'https://api.upstox.com',
    challengeHex:trust.expectedChallengeHex,
    lifecycle:{
      schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_LIFECYCLE_V1',
      source:'OPERATOR_SUPPLIED_UNVERIFIED',
      maximumFrameGapMinutes:times[0]===T?5:30,
      frames:captures.map(c=>c.archive.frame)
    },
    byteWitnesses:captures.flatMap(c=>c.archive.byteWitnesses),
    capturer:{signedAt:plus(times[1],15_000),signatureBase64:''},
    reviewer:{signedAt:plus(times[1],30_000),signatureBase64:''}
  };
  const bundle:Phase30PrivateShadowBundle={
    schemaVersion:'ADAPTIVE_SWING_V2_SHADOW_REVIEW_V1',
    source:'PRIVATELY_ARCHIVED_OPERATOR_CAPTURE',captures,
    signedWitness
  };
  return resign(bundle);
}
function resign(pkg:Phase30PrivateShadowBundle){
  const pre=preparePhase28OfflineWitnessPayload(pkg.signedWitness,policy);
  assert.deepEqual(pre.reasonCodes,[]);
  const s=pkg.signedWitness;
  s.capturer.signatureBase64=sign(null,
    Buffer.from(phase28CapturerMessage(pre.payload,s.capturer.signedAt)),
    a.privateKey).toString('base64');
  s.reviewer.signatureBase64=sign(null,
    Buffer.from(phase28ReviewerMessage(
      pre.payload,s.capturer,s.reviewer.signedAt)),
    b.privateKey).toString('base64');
  return pkg;
}
const audit=(bundle:Phase30PrivateShadowBundle,env=trust)=>
  reviewPhase30ShadowEvidence(bundle,policy,env);
function blocked(bundle:Phase30PrivateShadowBundle,reason:string,
  env=trust){
  const r=audit(bundle,env);
  assert.ok(r.reasons.includes(reason),JSON.stringify(r));
  assert.notEqual(r.status,'SHADOW_REVIEW_ONLY_UNVERIFIED');
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.nativeOrderInstruction,null);
  return r;
}
describe('Phase30 private GET archive to dual witness shadow-only review',()=>{
  it('matches all ten profile/book bodies with detached signatures, no authorization',async()=>{
    const bundle=await sample();
    const r=audit(bundle);
    assert.equal(r.status,'SHADOW_REVIEW_ONLY_UNVERIFIED');
    assert.equal(r.reviewedCaptures,2);
    assert.equal(r.matchedOriginalBodies,10);
    assert.equal(r.dualWitnessVerified,true);
    assert.equal(r.phase27Status,'CHRONOLOGICALLY_CONSISTENT_UNVERIFIED');
    assert.equal(r.brokerAuthenticated,false);
    assert.equal(r.brokerStopInstalled,false);
    assert.equal(r.actualBrokerStopVerified,false);
    assert.equal(r.independentSourceIpAttested,false);
    assert.equal(r.protectedOvernight,false);
    assert.equal(r.independentExchangeFillVerified,false);
    assert.equal(r.nativeOrderInstruction,null);
    const serialized=JSON.stringify(r);
    for(const secret of [UCC,INSTRUMENT,'SYNTHETIC_STOP30',
      'SYNTHETIC_ONLY_NONREAL_TOKEN_FOR_TEST'])
      assert.equal(serialized.includes(secret),false);
  });
  it('tampered private profile user ID is rejected against recorded byte hash',async()=>{
    const bundle=await sample();
    const p=JSON.parse(Buffer.from(
      bundle.captures[0].archive.profileResponseUtf8Base64,'base64')
        .toString('utf8'));
    p.data.user_id='DIFFERENT_UCC';
    bundle.captures[0].archive.profileResponseUtf8Base64=
      Buffer.from(JSON.stringify(p)).toString('base64');
    blocked(bundle,'PROFILE_UCC_OR_ORIGINAL_BODY_DIGEST_MISMATCH');
  });
  it('self-edited reported source digests are rejected',async()=>{
    const bundle=await sample();
    bundle.captures[0].report.responseBodySha256.positions='00'.repeat(32);
    blocked(bundle,'ORIGINAL_ARCHIVE_RAW_BODY_HASH_MISMATCH');
  });
  it('private response data must match signed lifecycle and original byte witness',async()=>{
    const bundle=await sample();
    const book=bundle.captures[0].archive.byteWitnesses.find(x=>
      x.book==='orders')!;
    book.responseUtf8Base64=Buffer.from('{"status":"success","data":[]}')
      .toString('base64');
    blocked(bundle,'ORIGINAL_ARCHIVE_RAW_BODY_HASH_MISMATCH');
  });
  it('identical rewritten JSON with different whitespace cannot reuse the signature',async()=>{
    const bundle=await sample();
    const entry=bundle.captures[0].archive.byteWitnesses[0];
    const json=JSON.parse(Buffer.from(entry.responseUtf8Base64,'base64')
      .toString('utf8'));
    entry.responseUtf8Base64=Buffer.from(JSON.stringify(json,null,2))
      .toString('base64');
    blocked(bundle,'ORIGINAL_ARCHIVE_RAW_BODY_HASH_MISMATCH');
  });
  it('private capture frame or order quantity cannot change behind witness',async()=>{
    const bundle=await sample();
    bundle.captures[0].archive.frame.expected.expectedNetLongQuantity=65;
    // Note: archive and signed witness initially share a JS object; to
    // ensure independent mutation tests, first deep-clone private archive.
    const copy=await sample();
    copy.captures[0].archive=structuredClone(copy.captures[0].archive);
    copy.captures[0].archive.frame.expected.expectedNetLongQuantity=65;
    blocked(copy,'PRIVATE_FRAME_DOES_NOT_MATCH_SIGNED_LIFECYCLE');
  });
  it('unknown or repeated private book triggers immediate refusal',async()=>{
    const bundle=await sample();
    bundle.captures[0].archive.byteWitnesses[1].book='positions';
    blocked(bundle,'DUPLICATED_OR_MISSCOPED_PRIVATE_GET_BOOK');
  });
  it('missing profile, extra digest and inadequate profile entitlement fail closed',async()=>{
    const bundle=await sample();
    bundle.captures[0].archive.profileResponseUtf8Base64='broken!';
    blocked(bundle,'PROFILE_UCC_OR_ORIGINAL_BODY_DIGEST_MISMATCH');
    const extra=await sample();
    (extra.captures[0].report.responseBodySha256 as Record<string,string>)
      .unexpected='00'.repeat(32);
    blocked(extra,'INCOMPLETE_OR_EXTRA_GET_RESPONSE_DIGESTS');
    const inactive=await sample();
    inactive.captures[1].archive.profileResponseUtf8Base64=
      Buffer.from(JSON.stringify(success({user_id:UCC,broker:'UPSTOX',
        is_active:false,products:['D'],order_types:['SL']})))
        .toString('base64');
    blocked(inactive,'PROFILE_UCC_OR_ORIGINAL_BODY_DIGEST_MISMATCH');
  });
  it('different external reviewer key or independent nonce fails signature trust',async()=>{
    const bundle=await sample();
    const bad=blocked(bundle,
      'SIGNATURE_MISMATCH_OR_FABRICATED_RESPONSE_WITNESS',{
        ...trust,reviewerPublicKeySpkiDerBase64:spki(other)});
    assert.equal(bad.status,'SIGNATURE_OR_TRUST_REJECTED');
    blocked(bundle,'EXTERNAL_NONCE_OR_ACCOUNT_SCOPE_MISMATCH',{
      ...trust,expectedChallengeHex:'cd'.repeat(32)});
  });
  it('both valid signatures do not override Phase26 unprotected stop',async()=>{
    const bundle=await sample([T,plus(T,60_000)],true);
    const r=blocked(bundle,'PHASE29_SINGLE_FRAME_PROTECTION_NOT_CONSISTENT');
    assert.equal(r.status,'BLOCKED_OR_UNKNOWN');
    assert.equal(r.dualWitnessVerified,true);
    assert.ok(r.reasons.includes('PHASE27_UNVERIFIED_LIFECYCLE_BLOCKED'));
    assert.equal(r.actualBrokerStopVerified,false);
  });
  it('signed consecutive snapshots across IST calendar rollover still block overnight',async()=>{
    const times=[
      '2026-11-17T18:25:00.000Z','2026-11-17T18:36:00.000Z'
    ];
    const bundle=await sample(times);
    const independent={
      ...trust,verificationAsOf:'2026-11-17T18:37:45.000Z'
    };
    const r=blocked(bundle,
      'CROSSED_IST_DAY_BROKER_DAY_BOOK_CANNOT_ATTEST_OVERNIGHT_STOP',
      independent);
    assert.equal(r.status,'BLOCKED_OR_UNKNOWN');
    assert.equal(r.dualWitnessVerified,true);
    assert.equal(r.protectedOvernight,false);
  });
  it('no frame, incomplete source profile or faked execution approval fails',async()=>{
    const incomplete=await sample();
    incomplete.captures.pop();
    blocked(incomplete,'INVALID_SHADOW_BUNDLE_OR_FRAME_COVERAGE');
    const forged=await sample();
    forged.captures[0].report.executionAuthorized=true as false;
    blocked(forged,'UNSAFE_PHASE29_REPORT_ATTEMPTS_AUTHORIZATION');
    const missing=await sample();
    missing.captures[0].report.responseCount=4;
    blocked(missing,'INVALID_OR_INCOMPLETE_PHASE29_CAPTURE');
  });
});
