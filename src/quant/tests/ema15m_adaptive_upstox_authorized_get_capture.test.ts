import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdtempSync,rmSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  captureExplicitlyAuthorizedUpstoxGetEvidence,
  createStrictNativeUpstoxAnalyticsGetTransport,
  type ReadOnlyGetTransport,type AuthorizedOfflineCaptureRequest,
  type AllowedUpstoxGetUrl
} from '../../server/engine/ema15m/adaptiveUpstoxAuthorizedGetCapture.js';
import {
  persistPrivateReadOnlyCapture,verifyAndClaimPhase28OfflineNonce
} from '../../server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';
import {
  preparePhase28OfflineWitnessPayload,phase28CapturerMessage,
  phase28ReviewerMessage,
  type Phase28OfflineWitnessPackage,
  type ExternalOfflineWitnessTrustPolicy
} from '../../server/engine/ema15m/adaptiveUpstoxOfflineDualWitnessGate.js';
import type {OfflineUpstoxLifecycleInput}
  from '../../server/engine/ema15m/adaptiveUpstoxOfflineNrmlLifecycle.js';

const scope='SYNTHETIC_UPSTOX_UCC_ONLY';
const contract='NSE_FO|SYNTHETIC29';
const baseMs=Date.parse('2026-11-17T10:00:00.000Z');
const urls=[
  'https://api.upstox.com/v2/user/profile',
  'https://api.upstox.com/v2/portfolio/short-term-positions',
  'https://api.upstox.com/v2/order/retrieve-all',
  'https://api.upstox.com/v3/order/gtt',
  'https://api.upstox.com/v2/order/trades/get-trades-for-day'
] as const;
const json=(data:unknown)=>({status:'success',data});
const original={
  profile:json({user_id:scope,broker:'UPSTOX',is_active:true,
    products:['D','I'],order_types:['SL','SL-M']}),
  positions:json([{instrument_token:contract,product:'D',quantity:130}]),
  orders:json([{
    order_id:'SYNTHETIC_ORDER_29',instrument_token:contract,
    product:'D',quantity:130,status:'trigger pending',
    order_type:'SL',trigger_price:80,transaction_type:'SELL',
    filled_quantity:0,pending_quantity:130
  }]),
  gtts:json([]),
  trades:json([])
};
function request():AuthorizedOfflineCaptureRequest{
  let tick=0;
  return {
    expected:{
      accountScopeId:scope,instrumentKey:contract,productType:'NRML',
      expiry:'2026-12-24',lotSize:65,expectedNetLongQuantity:130
    },
    phase25Policy:{
      maximumSnapshotAgeMinutes:5,maximumCrossBookSkewSeconds:90,
      minCalendarDaysBeforeExpiry:2
    },
    expectedBrokerUserId:scope,
    analyticsToken:'SYNTHETIC_READONLY_TOKEN_NOT_REAL',
    operatorAuthorization:'ACCOUNT_OWNER_APPROVED_GET_ONLY',
    staticIpReview:'OPERATOR_ATTESTS_WHITELISTED_EGRESS',
    credentialType:'UPSTOX_ANALYTICS_TOKEN_ONLY',
    sequence:1,timeoutMs:1500,
    clock:()=>baseMs+tick++*1000
  };
}
function transport(body=original){
  const calls:string[]=[];
  const t:ReadOnlyGetTransport={
    async get(url:AllowedUpstoxGetUrl,bearer:string,timeoutMs:number){
      calls.push(url);
      assert.equal(bearer,'SYNTHETIC_READONLY_TOKEN_NOT_REAL');
      assert.equal(timeoutMs,1500);
      const index=urls.indexOf(url as typeof urls[number]);
      if(index<0)throw Error('TEST_DO_NOT_CALL_UNLISTED_URL');
      return {
        status:200,finalUrl:url,redirected:false,
        contentType:'application/json; charset=utf-8',
        bodyBytes:Buffer.from(JSON.stringify(Object.values(body)[index]))
      };
    }
  };
  return {calls,transport:t};
}
const run=(r=request(),t=transport().transport)=>
  captureExplicitlyAuthorizedUpstoxGetEvidence(r,t);
const policyFrom=(r:AuthorizedOfflineCaptureRequest)=>r.phase25Policy;
describe('Phase29 explicitly authorized GET-only private capture',()=>{
  it('performs exactly 5 allowlisted GETs with profile UCC first, no order write',async()=>{
    const {calls,transport:mock}=transport();
    const result=await run(request(),mock);
    assert.equal(result.report.status,'CAPTURE_RECORDED_UNVERIFIED');
    assert.deepEqual(calls,urls);
    assert.equal(result.report.readOnlyNetworkActuallyAttempted,true);
    assert.equal(result.report.accountProfileMatched,true);
    assert.equal(result.report.phase26Status,'STRUCTURAL_REVIEW_ONLY');
    assert.equal(result.report.responseCount,5);
    assert.equal(result.report.brokerAuthenticated,false);
    assert.equal(result.report.brokerStopInstalled,false);
    assert.equal(result.report.executionAuthorized,false);
    assert.equal(result.report.productionSafe,false);
    assert.equal(result.report.nativeOrderInstruction,null);
    assert.equal(result.privateArchive?.byteWitnesses.length,4);
    assert.equal(result.privateArchive?.frame.capture.orders.unfiltered,true);
    assert.equal(result.privateArchive?.frame.trades.method,'GET');
    const printed=JSON.stringify(result.report);
    for(const secret of [scope,contract,'SYNTHETIC_READONLY_TOKEN_NOT_REAL',
      'SYNTHETIC_ORDER_29'])
      assert.equal(printed.includes(secret),false);
  });
  it('refuses network before explicit authorization, static IP assertion or token',async()=>{
    for(const delta of [
      {operatorAuthorization:'NO_AUTH'},
      {staticIpReview:'UNKNOWN'},
      {credentialType:'OAUTH_TRADING_TOKEN'},
      {analyticsToken:'SYNTHETIC\nBearer X'},
      {expectedBrokerUserId:'OTHER_UCC'}
    ]){
      const {calls,transport:mock}=transport();
      const bad={...request(),...delta} as AuthorizedOfflineCaptureRequest;
      const r=await run(bad,mock);
      assert.equal(r.report.status,'REJECTED_PRECONDITION');
      assert.equal(r.privateArchive,null);
      assert.equal(calls.length,0);
    }
  });
  it('mismatching profile UCC or inactive account stops before positions',async()=>{
    for(const profile of [
      {...original.profile,data:{...original.profile.data,user_id:'OTHER_UCC'}},
      {...original.profile,data:{...original.profile.data,is_active:false}},
      {...original.profile,data:{...original.profile.data,broker:'OTHER'}},
      {...original.profile,data:{...original.profile.data,products:['I']}}
    ]){
      const {calls,transport:mock}=transport({...original,profile});
      const r=await run(request(),mock);
      assert.equal(r.report.status,'CAPTURE_FAILED');
      assert.deepEqual(r.report.reasonCodes,
        ['PROFILE_BROKER_ACCOUNT_OR_NRML_ENTITLEMENT_MISMATCH']);
      assert.equal(calls.length,1);
      assert.equal(r.privateArchive,null);
    }
  });
  it('rejects failed GET, cross-domain redirect, wrong content type or huge response',async()=>{
    for(const delta of [
      {status:401},{status:429},
      {status:302,redirected:true,finalUrl:'https://evil.example/steal'},
      {contentType:'text/html'},
      {bodyBytes:new Uint8Array(90001)}
    ]){
      const {calls,transport:mock}=transport();
      const m:ReadOnlyGetTransport={
        get:async (url,bearer,ms)=>{
          const normal=await mock.get(url,bearer,ms);
          if(url===urls[2])return {...normal,...delta};
          return normal;
        }
      };
      const r=await run(request(),m);
      assert.equal(r.report.status,'CAPTURE_FAILED');
      assert.equal(r.privateArchive,null);
      assert.equal(calls.length,3);
      assert.ok(!JSON.stringify(r.report).includes('evil.example'));
    }
  });
  it('invalid JSON / error envelope fails closed with sanitized output',async()=>{
    const {transport:mock}=transport();
    const bad:ReadOnlyGetTransport={
      get:async(url,bearer,ms)=>{
        const normal=await mock.get(url,bearer,ms);
        return url===urls[4]?{...normal,
          bodyBytes:Buffer.from(JSON.stringify({status:'error',data:[]}))}:
          normal;
      }
    };
    const r=await run(request(),bad);
    assert.equal(r.report.status,'CAPTURE_FAILED');
    assert.equal(r.report.responseCount,4);
    assert.equal(r.privateArchive,null);
    const text=JSON.stringify(r.report);
    assert.ok(!text.includes(scope));
    assert.ok(!text.includes(contract));
  });
  it('transport errors never leak token, private data or error string',async()=>{
    const m:ReadOnlyGetTransport={
      get:async()=>{throw Error('secret SYNTHETIC_READONLY_TOKEN_NOT_REAL '+scope);}
    };
    const r=await run(request(),m);
    assert.equal(r.report.status,'CAPTURE_FAILED');
    assert.deepEqual(r.report.reasonCodes,['READ_ONLY_NETWORK_OR_TRANSPORT_FAILED']);
    const text=JSON.stringify(r);
    assert.ok(!text.includes(scope));
    assert.ok(!text.includes('READONLY_TOKEN'));
  });
  it('blocked stop still captures evidence for manual incident review, never authorizes',async()=>{
    const body=structuredClone(original);
    body.orders.data[0].status='open';
    const r=await run(request(),transport(body).transport);
    assert.equal(r.report.status,'CAPTURE_RECORDED_UNVERIFIED');
    assert.equal(r.report.phase26Status,'BLOCKED_OR_UNKNOWN');
    assert.ok(r.report.reasonCodes.includes(
      'SINGLE_FRAME_STRUCTURAL_REVIEW_HAS_BLOCKERS'));
    assert.ok(r.privateArchive);
    assert.equal(r.report.executionAuthorized,false);
  });
  it('native transport is fixed GET/no redirect/no cache and does not follow POST',async()=>{
    const saved=globalThis.fetch;
    const log:Array<{url:string;init:RequestInit}>=[];
    globalThis.fetch=(async (url:RequestInfo|URL,init?:RequestInit)=>{
      log.push({url:String(url),init:init??{}});
      const result=new Response(JSON.stringify(original.profile),{
        status:200,headers:{'content-type':'application/json'}
      });
      Object.defineProperty(result,'url',{value:String(url)});
      return result;
    }) as typeof fetch;
    try{
      const t=createStrictNativeUpstoxAnalyticsGetTransport();
      const r=await t.get(urls[0],
        'SYNTHETIC_READONLY_TOKEN_NOT_REAL',1500);
      assert.equal(r.status,200);
      assert.equal(log.length,1);
      assert.equal(log[0].init.method,'GET');
      assert.equal(log[0].init.redirect,'manual');
      assert.equal(log[0].init.cache,'no-store');
      assert.equal(log[0].init.credentials,'omit');
      assert.equal(String(log[0].url),urls[0]);
      await assert.rejects(t.get('https://evil.example/order/place' as
        AllowedUpstoxGetUrl,'SYNTHETIC_READONLY_TOKEN_NOT_REAL',1500));
      assert.equal(log.length,1);
    }finally{globalThis.fetch=saved;}
  });
  it('private response archive uses restrictive directory and does not overwrite',async()=>{
    const temp=mkdtempSync(join(tmpdir(),'phase29-test-'));
    chmodSync(temp,0o700);
    try{
      const r=await run();
      const stored=persistPrivateReadOnlyCapture(
        temp,r.report,r.privateArchive);
      assert.equal(stored.status,'PRIVATE_EVIDENCE_WRITTEN_UNVERIFIED');
      assert.equal(stored.filesCreated,1);
      assert.ok(/^[a-f0-9]{64}$/.test(stored.evidenceJsonSha256!));
      assert.equal(JSON.stringify(stored).includes(scope),false);
      const bad=persistPrivateReadOnlyCapture(temp,
        {...r.report,status:'CAPTURE_FAILED'},r.privateArchive);
      assert.equal(bad.status,'ARCHIVE_REQUIRES_SUCCEEDED_READ_ONLY_CAPTURE');
      chmodSync(temp,0o755);
      const insecure=persistPrivateReadOnlyCapture(temp,r.report,r.privateArchive);
      assert.equal(insecure.status,'PRIVATE_PARENT_MISSING_OR_INSECURE');
    }finally{chmodSync(temp,0o700);rmSync(temp,{recursive:true,force:true});}
  });
  it('valid dual signatures are required before an atomic one-time nonce claim',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'phase29-nonce-'));
    chmodSync(dir,0o700);
    const a=await run();
    const next=request();
    let tick=0;
    next.sequence=2;
    next.clock=()=>baseMs+60_000+tick++*1000;
    const b=await run(next);
    assert.ok(a.privateArchive&&b.privateArchive);
    const capturer=generateKeyPairSync('ed25519'),
      reviewer=generateKeyPairSync('ed25519');
    const der=(k:typeof capturer)=>k.publicKey.export({
      type:'spki',format:'der'}).toString('base64');
    const trust:ExternalOfflineWitnessTrustPolicy={
      schemaVersion:'EXTERNALLY_PINNED_ED25519_REVIEW_KEYS_V1',
      expectedAccountScopeId:scope,expectedChallengeHex:'ab'.repeat(32),
      capturerPublicKeySpkiDerBase64:der(capturer),
      reviewerPublicKeySpkiDerBase64:der(reviewer),
      maximumReviewAgeMinutes:5,verificationAsOf:
        '2026-11-17T10:01:45.000Z'
    };
    const lifecycle:OfflineUpstoxLifecycleInput={
      schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_LIFECYCLE_V1',
      source:'OPERATOR_SUPPLIED_UNVERIFIED',
      maximumFrameGapMinutes:5,
      frames:[a.privateArchive!.frame,b.privateArchive!.frame]
    };
    const pkg:Phase28OfflineWitnessPackage={
      schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_DUAL_WITNESS_V1',
      source:'OPERATOR_SUPPLIED_UNVERIFIED',
      claimedOrigin:'https://api.upstox.com',
      challengeHex:trust.expectedChallengeHex,
      lifecycle,byteWitnesses:[
        ...a.privateArchive!.byteWitnesses,
        ...b.privateArchive!.byteWitnesses
      ],
      capturer:{signedAt:'2026-11-17T10:01:15.000Z',
        signatureBase64:''},
      reviewer:{signedAt:'2026-11-17T10:01:30.000Z',
        signatureBase64:''}
    };
    const pre=preparePhase28OfflineWitnessPayload(pkg,policyFrom(next));
    assert.deepEqual(pre.reasonCodes,[]);
    pkg.capturer.signatureBase64=sign(null,Buffer.from(
      phase28CapturerMessage(pre.payload,pkg.capturer.signedAt)),
      capturer.privateKey).toString('base64');
    pkg.reviewer.signatureBase64=sign(null,Buffer.from(
      phase28ReviewerMessage(pre.payload,pkg.capturer,pkg.reviewer.signedAt)),
      reviewer.privateKey).toString('base64');
    try{
      const first=verifyAndClaimPhase28OfflineNonce(pkg,policyFrom(next),trust,dir);
      assert.equal(first.witness.status,
        'SIGNATURES_VALID_OFFLINE_UNVERIFIED');
      assert.equal(first.claim.status,'CHALLENGE_CLAIMED_OFFLINE_UNVERIFIED');
      const repeated=verifyAndClaimPhase28OfflineNonce(
        pkg,policyFrom(next),trust,dir);
      assert.equal(repeated.claim.status,
        'CHALLENGE_ALREADY_USED_OR_REGISTRY_UNAVAILABLE');
      assert.equal(JSON.stringify(repeated).includes(scope),false);
      const corrupted=structuredClone(pkg);
      corrupted.reviewer.signatureBase64='A'.repeat(88);
      const refused=verifyAndClaimPhase28OfflineNonce(
        corrupted,policyFrom(next),trust,dir);
      assert.equal(refused.claim.status,'INVALID_INDEPENDENT_SIGNED_WITNESS');
      chmodSync(dir,0o755);
      const inaccessible=verifyAndClaimPhase28OfflineNonce(
        pkg,policyFrom(next),trust,dir);
      assert.equal(inaccessible.claim.status,'PRIVATE_NONCE_REGISTRY_UNAVAILABLE');
    }finally{chmodSync(dir,0o700);rmSync(dir,{recursive:true,force:true});}
  });
});
