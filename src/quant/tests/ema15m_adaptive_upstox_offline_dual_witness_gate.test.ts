import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {
  auditPhase28OfflineDualWitnessEvidence,
  preparePhase28OfflineWitnessPayload,phase28CapturerMessage,
  phase28ReviewerMessage,
  type Phase28OfflineWitnessPackage,
  type ExternalOfflineWitnessTrustPolicy
} from '../../server/engine/ema15m/adaptiveUpstoxOfflineDualWitnessGate.js';
import type {OfflineUpstoxLifecycleFrame,OfflineUpstoxLifecycleInput}
  from '../../server/engine/ema15m/adaptiveUpstoxOfflineNrmlLifecycle.js';
import type {ReadOnlyExpectedPosition,ReadOnlyNrmlAuditPolicy}
  from '../../server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const scope='SYNTHETIC_ACCOUNT_28';
const instrument='NSE_FO|SYNTHETIC_28';
const challenge='ab'.repeat(32);
const t0='2026-11-17T10:00:00.000Z';
const plus=(v:string,ms:number)=>
  new Date(Date.parse(v)+ms).toISOString();
const expected:ReadOnlyExpectedPosition={
  accountScopeId:scope,instrumentKey:instrument,productType:'NRML',
  expiry:'2026-12-24',lotSize:65,expectedNetLongQuantity:130
};
const policy:ReadOnlyNrmlAuditPolicy={
  maximumSnapshotAgeMinutes:5,
  maximumCrossBookSkewSeconds:90,
  minCalendarDaysBeforeExpiry:2
};
const capturer=generateKeyPairSync('ed25519');
const reviewer=generateKeyPairSync('ed25519');
const other=generateKeyPairSync('ed25519');
const der=(k:typeof capturer)=>
  k.publicKey.export({type:'spki',format:'der'}).toString('base64');
const trust:ExternalOfflineWitnessTrustPolicy={
  schemaVersion:'EXTERNALLY_PINNED_ED25519_REVIEW_KEYS_V1',
  expectedChallengeHex:challenge,
  expectedAccountScopeId:scope,
  capturerPublicKeySpkiDerBase64:der(capturer),
  reviewerPublicKeySpkiDerBase64:der(reviewer),
  maximumReviewAgeMinutes:5,
  verificationAsOf:plus(t0,105_000)
};
const data=(arr:Array<Record<string,unknown>>)=>({
  status:'success',data:arr
});
const response=(c:unknown)=> (c as {data:Array<Record<string,unknown>>}).data;
function frame(sequence:number,asOf:string):OfflineUpstoxLifecycleFrame{
  return {
    sequence,asOf,expected:{...expected},
    capture:{
      schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1',
      origin:'OPERATOR_SUPPLIED_UNVERIFIED',accountScopeId:scope,
      positions:{
        method:'GET',path:'/v2/portfolio/short-term-positions',
        unfiltered:true,httpStatus:200,
        capturedAt:plus(asOf,-40_000),
        response:data([{instrument_token:instrument,product:'D',quantity:130}])
      },
      orders:{
        method:'GET',path:'/v2/order/retrieve-all',
        unfiltered:true,httpStatus:200,capturedAt:plus(asOf,-30_000),
        response:data([{
          order_id:'SYNTHETIC_STOP_28',instrument_token:instrument,
          product:'D',quantity:130,status:'trigger pending',
          order_type:'SL',trigger_price:80,transaction_type:'SELL',
          filled_quantity:0,pending_quantity:130
        }])
      },
      gtts:{
        method:'GET',path:'/v3/order/gtt',unfiltered:true,httpStatus:200,
        capturedAt:plus(asOf,-20_000),response:data([])
      }
    },
    trades:{
      method:'GET',path:'/v2/order/trades/get-trades-for-day',
      unfiltered:true,httpStatus:200,
      capturedAt:plus(asOf,-15_000),response:data([])
    }
  };
}
function specimen():Phase28OfflineWitnessPackage{
  const lifecycle:OfflineUpstoxLifecycleInput={
    schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_LIFECYCLE_V1',
    source:'OPERATOR_SUPPLIED_UNVERIFIED',
    maximumFrameGapMinutes:5,
    frames:[frame(1,t0),frame(2,plus(t0,60_000))]
  };
  const byteWitnesses:Phase28OfflineWitnessPackage['byteWitnesses']=[];
  for(const f of lifecycle.frames){
    for(const book of ['positions','orders','gtts','trades'] as const){
      const body=book==='trades'?f.trades.response:
        f.capture[book].response;
      byteWitnesses.push({
        sequence:f.sequence,book,
        responseUtf8Base64:Buffer.from(JSON.stringify(body)).toString('base64')
      });
    }
  }
  const pkg:Phase28OfflineWitnessPackage={
    schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_DUAL_WITNESS_V1',
    source:'OPERATOR_SUPPLIED_UNVERIFIED',claimedOrigin:'https://api.upstox.com',
    challengeHex:challenge,lifecycle,byteWitnesses,
    capturer:{signedAt:plus(t0,75_000),signatureBase64:''},
    reviewer:{signedAt:plus(t0,90_000),signatureBase64:''}
  };
  return resign(pkg);
}
function resign(pkg:Phase28OfflineWitnessPackage){
  const pre=preparePhase28OfflineWitnessPayload(pkg,policy);
  assert.deepEqual(pre.reasonCodes,[]);
  pkg.capturer.signatureBase64=sign(null,
    Buffer.from(phase28CapturerMessage(pre.payload,pkg.capturer.signedAt)),
    capturer.privateKey).toString('base64');
  pkg.reviewer.signatureBase64=sign(null,
    Buffer.from(phase28ReviewerMessage(
      pre.payload,pkg.capturer,pkg.reviewer.signedAt)),
    reviewer.privateKey).toString('base64');
  return pkg;
}
const audit=(pkg:Phase28OfflineWitnessPackage=specimen(),
  env:ExternalOfflineWitnessTrustPolicy=trust)=>
  auditPhase28OfflineDualWitnessEvidence(pkg,policy,env);
function rejected(pkg:Phase28OfflineWitnessPackage,reason:string,
  env:ExternalOfflineWitnessTrustPolicy=trust){
  const report=audit(pkg,env);
  assert.ok(report.reasons.includes(reason),JSON.stringify(report));
  assert.ok(report.status==='INVALID_EVIDENCE'||
    report.status==='SIGNATURE_OR_TRUST_REJECTED'||
    report.status==='BLOCKED_OR_UNKNOWN',report.status);
  assert.equal(report.executionAuthorized,false);
  assert.equal(report.productionSafe,false);
  assert.equal(report.brokerAuthenticated,false);
  assert.equal(report.brokerStopInstalled,false);
  assert.equal(report.nativeOrderInstruction,null);
  return report;
}
describe('Phase28 independent detached offline witness verification',()=>{
  it('dual valid signatures bind 8 exact bytes but NEVER authenticate broker',()=>{
    const r=audit();
    assert.equal(r.status,'SIGNATURES_VALID_OFFLINE_UNVERIFIED');
    assert.equal(r.signaturesVerified,true);
    assert.equal(r.responseBodiesMatched,true);
    assert.equal(r.responseBodiesVerified,8);
    assert.equal(r.frameCount,2);
    assert.equal(r.phase27Status,'CHRONOLOGICALLY_CONSISTENT_UNVERIFIED');
    assert.equal(r.brokerAuthenticated,false);
    assert.equal(r.brokerStopInstalled,false);
    assert.equal(r.executionAuthorized,false);
    assert.ok(/^[0-9a-f]{64}$/.test(r.attestedPayloadSha256!));
    assert.equal(JSON.stringify(r).includes(scope),false);
    assert.equal(JSON.stringify(r).includes(instrument),false);
  });
  it('raw HTTP response bytes tampering fails even if parsed JSON unchanged',()=>{
    const pkg=specimen();
    const old=Buffer.from(pkg.byteWitnesses[0].responseUtf8Base64,'base64')
      .toString('utf8');
    pkg.byteWitnesses[0].responseUtf8Base64=
      Buffer.from(old.replace('"success"', '"failure"')).toString('base64');
    rejected(pkg,'ORIGINAL_RESPONSE_BYTES_DO_NOT_MATCH_LIFECYCLE_JSON');
  });
  it('reformatting original response body after signing invalidates signatures',()=>{
    const pkg=specimen();
    const raw=JSON.parse(Buffer.from(pkg.byteWitnesses[0].responseUtf8Base64,
      'base64').toString('utf8'));
    pkg.byteWitnesses[0].responseUtf8Base64=
      Buffer.from(JSON.stringify(raw,null,2)).toString('base64');
    rejected(pkg,'SIGNATURE_MISMATCH_OR_FABRICATED_RESPONSE_WITNESS');
  });
  it('parsed order trigger tampering is detected against original bytes',()=>{
    const pkg=specimen();
    response(pkg.lifecycle.frames[1].capture.orders.response)[0]
      .trigger_price=95;
    rejected(pkg,'ORIGINAL_RESPONSE_BYTES_DO_NOT_MATCH_LIFECYCLE_JSON');
  });
  it('order/position metadata tamper outside HTTP body breaks detached signature',()=>{
    const pkg=specimen();
    pkg.lifecycle.frames[0].expected.expiry='2026-12-31';
    rejected(pkg,'SIGNATURE_MISMATCH_OR_FABRICATED_RESPONSE_WITNESS');
  });
  it('challenge mismatch and account-scope substitution always reject',()=>{
    const pkg=specimen();
    rejected(pkg,'EXTERNAL_NONCE_OR_ACCOUNT_SCOPE_MISMATCH',{
      ...trust,expectedChallengeHex:'cd'.repeat(32)});
    rejected(pkg,'EXTERNAL_NONCE_OR_ACCOUNT_SCOPE_MISMATCH',{
      ...trust,expectedAccountScopeId:'DIFFERENT_ACCOUNT'});
  });
  it('same capturer and reviewer public key is forbidden',()=>{
    rejected(specimen(),'UNPINNED_INVALID_OR_IDENTICAL_REVIEW_KEYS',{
      ...trust,reviewerPublicKeySpkiDerBase64:der(capturer)});
  });
  it('wrong pinned reviewer key rejects even correct detached signature',()=>{
    rejected(specimen(),
      'SIGNATURE_MISMATCH_OR_FABRICATED_RESPONSE_WITNESS',{
        ...trust,reviewerPublicKeySpkiDerBase64:der(other)});
  });
  it('reviewer cannot forge capture signature or silently swap signedAt',()=>{
    const p=specimen();
    p.capturer.signatureBase64=sign(null,
      Buffer.from(phase28CapturerMessage(
        preparePhase28OfflineWitnessPayload(p,policy).payload,
        p.capturer.signedAt)),reviewer.privateKey).toString('base64');
    rejected(p,'SIGNATURE_MISMATCH_OR_FABRICATED_RESPONSE_WITNESS');
    const shifted=specimen();shifted.reviewer.signedAt=plus(t0,91_000);
    rejected(shifted,'SIGNATURE_MISMATCH_OR_FABRICATED_RESPONSE_WITNESS');
  });
  it('signed review clocks must follow latest snapshot and capture',()=>{
    const early=specimen();early.capturer.signedAt=plus(t0,50_000);
    rejected(early,'INVALID_ORDERED_SIGNOFF_CLOCK_OR_STALE_REVIEW');
    const reversed=specimen();reversed.reviewer.signedAt=plus(t0,74_000);
    rejected(reversed,'INVALID_ORDERED_SIGNOFF_CLOCK_OR_STALE_REVIEW');
    const future=specimen();
    rejected(future,'INVALID_ORDERED_SIGNOFF_CLOCK_OR_STALE_REVIEW',{
      ...trust,verificationAsOf:plus(t0,88_000)});
    const old=specimen();
    rejected(old,'INVALID_ORDERED_SIGNOFF_CLOCK_OR_STALE_REVIEW',{
      ...trust,maximumReviewAgeMinutes:1,
      verificationAsOf:plus(t0,200_000)});
  });
  it('coverage omissions, duplicates, wrong endpoint and invalid base64 reject',()=>{
    const missing=specimen();missing.byteWitnesses.pop();
    rejected(missing,'INVALID_OFFLINE_WITNESS_PACKAGE_OR_COVERAGE');
    const dup=specimen();
    dup.byteWitnesses[7]={...dup.byteWitnesses[0]};
    rejected(dup,'DUPLICATED_ORIGINAL_RESPONSE_BOOK_WITNESS');
    const binary=specimen();
    binary.byteWitnesses[0].responseUtf8Base64='%%%%';
    rejected(binary,'MISSING_OR_MALFORMED_OR_OVERSIZED_ORIGINAL_RESPONSE_BYTES');
    const bad=specimen();
    bad.claimedOrigin='https://untrusted.example' as 'https://api.upstox.com';
    rejected(bad,'INVALID_OFFLINE_WITNESS_PACKAGE_OR_COVERAGE');
  });
  it('even BOTH valid signatures cannot override Phase27 failed protection',()=>{
    const pkg=specimen();
    const r=response(pkg.lifecycle.frames[1].capture.orders.response)[0];
    r.status='open';
    // Independently signed bytes and payload are consistent, but unsafe.
    for(const b of pkg.byteWitnesses){
      if(b.sequence===2&&b.book==='orders')
        b.responseUtf8Base64=Buffer.from(JSON.stringify(
          pkg.lifecycle.frames[1].capture.orders.response)).toString('base64');
    }
    resign(pkg);
    const result=rejected(pkg,'PHASE27_UNVERIFIED_LIFECYCLE_BLOCKED');
    assert.equal(result.signaturesVerified,true);
    assert.equal(result.status,'BLOCKED_OR_UNKNOWN');
    assert.equal(result.phase27Status,'BLOCKED_OR_UNKNOWN');
  });
  it('both signatures cannot ever attest overnight broker stop survival',()=>{
    const p=specimen();
    const later=frame(2,'2026-11-17T18:36:00.000Z');
    p.lifecycle.frames=[
      frame(1,'2026-11-17T18:25:00.000Z'),later];
    p.lifecycle.maximumFrameGapMinutes=30;
    p.byteWitnesses=[];
    for(const f of p.lifecycle.frames){
      for(const book of ['positions','orders','gtts','trades'] as const){
        const response=book==='trades'?f.trades.response:f.capture[book].response;
        p.byteWitnesses.push({sequence:f.sequence,book,
          responseUtf8Base64:Buffer.from(JSON.stringify(response)).toString('base64')});
      }
    }
    p.capturer.signedAt='2026-11-17T18:37:00.000Z';
    p.reviewer.signedAt='2026-11-17T18:37:30.000Z';
    resign(p);
    const actual=audit(p,{...trust,verificationAsOf:
      '2026-11-17T18:38:00.000Z'});
    assert.equal(actual.signaturesVerified,true);
    assert.equal(actual.status,'BLOCKED_OR_UNKNOWN');
    assert.ok(actual.reasons.includes(
      'CROSSED_IST_DAY_BROKER_DAY_BOOK_CANNOT_ATTEST_OVERNIGHT_STOP'));
  });
  it('trust must come separately; invalid lock policy fails closed',()=>{
    const p=specimen();
    rejected(p,'INVALID_EXTERNAL_VERIFIER_TRUST_POLICY',{
      ...trust,maximumReviewAgeMinutes:0});
    const result=auditPhase28OfflineDualWitnessEvidence(p,{
      ...policy,maximumSnapshotAgeMinutes:NaN},trust);
    assert.equal(result.status,'INVALID_EVIDENCE');
    assert.deepEqual(result.reasons,['INVALID_LOCKED_AUDIT_POLICY']);
  });
});
