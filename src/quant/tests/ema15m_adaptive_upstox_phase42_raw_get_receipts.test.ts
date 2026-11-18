import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync}
  from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  auditPhase42OriginalGetReceipts,
  phase42ReceiptMessage,phase42ReceiptHash,phase42GenesisHash,
  type Phase42RawSourceBundle,type Phase42IndependentPins,
  type Phase42RawGetReceipt
} from '../../server/engine/ema15m/adaptiveUpstoxPhase42RawGetProvenance.js';
import {
  hashPhase41Calendar,phase41GenesisSha256,phase41LinkSha256,
  phase41WitnessMessage,
  type Phase41Calendar,type Phase41Archive,
  type Phase41IndependentPins,type Phase41ChainLink
} from '../../server/engine/ema15m/adaptiveUpstoxPhase41WitnessedSessionCoverage.js';
import {hashPhase40OfflineArchive,type Phase40GttCapture}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.js';

const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const account='SYNTHETIC_ACCOUNT_SCOPE_42';
const gtt='GTT-SYNTH-PHASE42';
const instrument='NSE_FO|SYNTH-OPT-42';
const close='2026-11-20T15:30:00+05:30';
const open='2026-11-23T09:15:00+05:30';
const pre='2026-11-20T15:25:00+05:30';
const post='2026-11-23T09:20:00+05:30';
const beforeReview='2026-11-20T15:29:00+05:30';
const afterReview='2026-11-23T09:24:00+05:30';
const linkReview='2026-11-23T09:30:00+05:30';
const noticeUrl='https://www.nseindia.in/resources/exchange-communication-holidays/';
const mkPDF=()=>Buffer.from('%PDF-1.7\n'+
  'SYNTHETIC CALENDAR NOTICE - NOT ISSUED BY NSE\n'.repeat(5)+
  '%%EOF\n','latin1');
let dir:string,cert:Buffer,otherCert:Buffer;
function makeCertificate(san:string,file:string):Buffer{
  const key=join(dir,'key-'+file+'.pem'),
    pem=join(dir,'cert-'+file+'.pem');
  execFileSync('/usr/bin/openssl',[
    'req','-new','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',key,'-out',pem,'-days','1','-sha256',
    '-subj','/CN=Untrusted Synthetic Phase42 TLS Peer',
    '-addext','subjectAltName=DNS:'+san
  ],{stdio:['ignore','pipe','pipe'],timeout:12000});
  return new X509Certificate(readFileSync(pem)).raw;
}
before(()=>{
  dir=mkdtempSync(join(tmpdir(),'phase42-get-source-'));
  chmodSync(dir,0o700);
  cert=makeCertificate('api.upstox.com','right');
  otherCert=makeCertificate('attacker.invalid','wrong');
});
after(()=>{if(dir)rmSync(dir,{recursive:true,force:true});});
function capture(when:string):Phase40GttCapture{
  return {
    origin:'OPERATOR_ARCHIVED_UNVERIFIED',
    method:'GET',path:'/v3/order/gtt',
    query:{gtt_order_id:gtt},
    capturedAt:when,httpStatus:200,
    response:{status:'success',data:[{
      gtt_order_id:gtt,type:'SINGLE',product:'D',exchange:'NFO',
      instrument_token:instrument,trading_symbol:'SYNTH42_CE',
      quantity:65,
      created_at:Date.parse('2026-11-19T10:00:00+05:30')*1000,
      expires_at:Date.parse('2026-12-24T15:30:00+05:30')*1000,
      rules:[{
        strategy:'STOPLOSS',status:'SCHEDULED',
        trigger_type:'BELOW',trigger_price:245.5,
        transaction_type:'SELL',order_id:null,message:null
      }]
    }]}
  };
}
const der=(key:ReturnType<typeof generateKeyPairSync>['publicKey'])=>
  key.export({type:'spki',format:'der'}) as Buffer;
// Use generically typed key objects rather than fake "broker signed" keys.
function fixture(){
  const captureKey=generateKeyPairSync('ed25519'),
    reviewKey=generateKeyPairSync('ed25519');
  const captureSpki=captureKey.publicKey.export({
    type:'spki',format:'der'}) as Buffer;
  const reviewSpki=reviewKey.publicKey.export({
    type:'spki',format:'der'}) as Buffer;
  const notice=mkPDF();
  const cal:Phase41Calendar={
    schemaVersion:'ADAPTIVE_PHASE41_OPERATOR_TRANSCRIBED_EXCHANGE_SESSIONS_V1',
    source:'OPERATOR_TRANSCRIBED_EXCHANGE_NOTICE_UNVERIFIED',
    exchange:'NFO',referencedSourceUrl:noticeUrl,
    referencedOriginalSourceSha256:sha(notice),
    sessions:[
      {date:'2026-11-20',sessionKind:'REGULAR',
       openingAt:'2026-11-20T09:15:00+05:30',closingAt:close},
      {date:'2026-11-23',sessionKind:'REGULAR',
       openingAt:open,closingAt:'2026-11-23T15:30:00+05:30'}
    ]
  };
  const pair={
    sessionDate:'2026-11-20',preCloseAt:close,
    nextSessionDate:'2026-11-23',nextOpenAt:open,
    beforeClose:capture(pre),afterOpen:capture(post)
  };
  const archive:Phase41Archive={
    schemaVersion:'ADAPTIVE_PHASE41_DUAL_WITNESS_SESSION_CHAIN_V1',
    source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED',
    calendar:cal,
    phase40Gtt:{
      schemaVersion:'ADAPTIVE_V2_PHASE40_OVERNIGHT_GTT_V1',
      source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
      position:{accountScopeId:account,productType:'NRML',
        instrumentKey:instrument,tradingSymbol:'SYNTH42_CE',
        gttOrderId:gtt,lotSize:65,expectedLongQuantity:65,
        expectedStopTriggerPrice:245.5},
      maxCheckpointDistanceMinutes:20,
      declaredOvernightPairs:1,
      overnightPairs:[pair]
    },
    links:[]
  };
  const pins41:Phase41IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE41_WITNESS_AND_CALENDAR_PINS_V1',
    accountScopeId:account,gttOrderId:gtt,
    referencedOriginalSourceSha256:sha(notice),expectedExchange:'NFO',
    expectedCalendarSha256:hashPhase41Calendar(cal),
    expectedSessionDates:['2026-11-20','2026-11-23'],
    expectedFirstSession:'2026-11-20',
    expectedLastSession:'2026-11-23',
    expectedCaptureKeySpkiSha256:sha(captureSpki),
    expectedReviewKeySpkiSha256:sha(reviewSpki),
    expectedGenesisSha256:'00'.repeat(32),
    expectedLastLinkSha256:'00'.repeat(32),
    maxWitnessDelayMinutes:25
  };
  const bundle:Phase42RawSourceBundle={
    schemaVersion:'ADAPTIVE_PHASE42_RAW_GET_NOTICE_SOURCE_BUNDLE_V1',
    source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED',
    phase41Archive:archive,
    originalCalendarNotice:{
      source:'OPERATOR_ARCHIVED_EXCHANGE_NOTICE_UNVERIFIED',
      sourceUrl:noticeUrl,mediaType:'application/pdf',
      originalPdfBase64:notice.toString('base64')
    },
    checkpointReceipts:[]
  };
  const pins:Phase42IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE42_ORIGINAL_SOURCE_RECEIPT_PINS_V1',
    phase41:pins41,
    expectedOriginalNoticeSha256:sha(notice),
    expectedRawResponseSha256:[],
    expectedTlsLeafSpkiSha256:[],
    expectedFinalReceiptChainSha256:'00'.repeat(32),
    maxReceiptWitnessAgeMinutes:15
  };
  function signAll(){
    const calHash=hashPhase41Calendar(archive.calendar);
    pins41.expectedCalendarSha256=calHash;
    pins41.referencedOriginalSourceSha256=
      archive.calendar.referencedOriginalSourceSha256;
    pins41.expectedGenesisSha256=phase41GenesisSha256(
      calHash,account,gtt);
    const currentPair=archive.phase40Gtt.overnightPairs[0];
    const link:Phase41ChainLink={
      sequence:0,previousLinkSha256:pins41.expectedGenesisSha256,
      calendarSha256:calHash,
      pairSha256:hashPhase40OfflineArchive(currentPair),
      sessionFrom:currentPair.sessionDate,
      sessionTo:currentPair.nextSessionDate,
      witnessedAt:linkReview,witnessSignatures:[]
    };
    const phase41msg=phase41WitnessMessage(link);
    link.witnessSignatures=[
      {role:'CAPTURE_OPERATOR',signedAt:linkReview,
       publicKeySpkiDerBase64:captureSpki.toString('base64'),
       signatureBase64:sign(null,phase41msg,captureKey.privateKey)
         .toString('base64')},
      {role:'INDEPENDENT_REVIEWER',signedAt:linkReview,
       publicKeySpkiDerBase64:reviewSpki.toString('base64'),
       signatureBase64:sign(null,phase41msg,reviewKey.privateKey)
         .toString('base64')}
    ];
    archive.links=[link];
    pins41.expectedLastLinkSha256=phase41LinkSha256(link);
    let previous=phase42GenesisHash(
      pins41.expectedLastLinkSha256,pins.expectedOriginalNoticeSha256);
    pins.expectedRawResponseSha256=[];
    pins.expectedTlsLeafSpkiSha256=[];
    bundle.checkpointReceipts=[];
    const sslSpki=new X509Certificate(cert).publicKey.export({
      type:'spki',format:'der'}) as Buffer;
    for(const [i,snapshot] of [
      currentPair.beforeClose,currentPair.afterOpen].entries()){
      const captured=i===0?pre:post,
        witnessedAt=i===0?beforeReview:afterReview,
        body=Buffer.from(JSON.stringify(snapshot.response),'utf8');
      const receipt:Phase42RawGetReceipt={
        schemaVersion:'ADAPTIVE_PHASE42_ORIGINAL_GET_BODY_RECEIPT_V1',
        source:'OPERATOR_CAPTURED_TLS_GET_UNVERIFIED',
        sequence:i,checkpoint:i===0?'BEFORE_CLOSE':'AFTER_OPEN',
        method:'GET',requestedUrl:'https://api.upstox.com/v3/order/gtt',
        finalUrl:'https://api.upstox.com/v3/order/gtt',
        query:{gtt_order_id:gtt},capturedAt:captured,
        httpStatus:200,contentType:'application/json',
        redirected:false,authorizationHeaderPersisted:false,
        tlsValidationClaim:'OPERATOR_CLAIMS_HTTPS_HOSTNAME_AND_CA_VALIDATED',
        tlsPeerCertificateDerBase64:cert.toString('base64'),
        responseUtf8Base64:body.toString('base64'),
        witnessedAt,witnesses:[]
      };
      const signatureBytes=phase42ReceiptMessage(receipt,sha(body),
        sha(sslSpki),hashPhase40OfflineArchive(currentPair),previous);
      receipt.witnesses=[
        {role:'CAPTURE_OPERATOR',signedAt:witnessedAt,
         publicKeySpkiDerBase64:captureSpki.toString('base64'),
         signatureBase64:sign(null,signatureBytes,captureKey.privateKey)
           .toString('base64')},
        {role:'INDEPENDENT_REVIEWER',signedAt:witnessedAt,
         publicKeySpkiDerBase64:reviewSpki.toString('base64'),
         signatureBase64:sign(null,signatureBytes,reviewKey.privateKey)
           .toString('base64')}
      ];
      bundle.checkpointReceipts.push(receipt);
      pins.expectedRawResponseSha256.push(sha(body));
      pins.expectedTlsLeafSpkiSha256.push(sha(sslSpki));
      previous=phase42ReceiptHash(receipt);
    }
    pins.expectedFinalReceiptChainSha256=previous;
  }
  signAll();
  return {bundle,pins,signAll};
}
function safe(r:ReturnType<typeof auditPhase42OriginalGetReceipts>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.genuineUpstoxServerResponseAuthenticated,false);
  assert.equal(r.genuineUpstoxTlsHandshakeVerified,false);
  assert.equal(r.exchangeNoticePublisherAuthenticated,false);
  assert.equal(r.originalNoticeTextOrSignatureVerified,false);
  assert.equal(r.exchangeCalendarSourceSemanticsVerified,false);
  assert.equal(r.continuousOvernightProtectionProven,false);
  assert.equal(r.brokerNativeStopAckVerified,false);
  assert.equal(r.stopFillGuaranteed,false);
  const output=JSON.stringify(r);
  for(const sensitive of [account,gtt,instrument])
    assert.ok(!output.includes(sensitive));
}
describe('Phase42 original raw GET payload and calendar PDF receipt audit',()=>{
  it('two actual Ed25519-signed synthetic GET receipts match Phase41 original bytes only',()=>{
    const {bundle,pins}=fixture();
    const r=auditPhase42OriginalGetReceipts(bundle,pins);
    safe(r);
    assert.equal(r.status,
      'RAW_GET_BYTES_AND_CALENDAR_PDF_DUAL_WITNESSED_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.receiptsReviewed,2);
    assert.equal(r.parsedOriginalGetBodiesMatched,2);
    assert.equal(r.claimedTlsLeafCertificatesLocallyValid,2);
    assert.equal(r.verifiedReceiptWitnessSignatures,4);
    assert.equal(r.phase41SessionsReaudited,2);
    assert.equal(r.originalNoticeBytesHashMatched,true);
  });
  it('changed original GET bytes with unchanged external pin fail',()=>{
    const f=fixture();
    const r=f.bundle.checkpointReceipts[0];
    const bytes=Buffer.from(r.responseUtf8Base64,'base64');
    bytes[60]=bytes[60]===65?66:65;
    r.responseUtf8Base64=bytes.toString('base64');
    const out=auditPhase42OriginalGetReceipts(f.bundle,f.pins);
    safe(out);
    assert.deepEqual(out.reasonCodes,
      ['ORIGINAL_GET_BODY_OR_PINNED_HASH_NOT_VERIFIABLE']);
  });
  it('changed original body and new self-pins but no updated witness cannot pass',()=>{
    const f=fixture();
    const r=f.bundle.checkpointReceipts[1];
    const data=JSON.parse(Buffer.from(r.responseUtf8Base64,'base64')
      .toString('utf8')) as {status:string;data:unknown[]};
    data.status='failed';
    const bytes=Buffer.from(JSON.stringify(data));
    r.responseUtf8Base64=bytes.toString('base64');
    f.pins.expectedRawResponseSha256[1]=sha(bytes);
    const out=auditPhase42OriginalGetReceipts(f.bundle,f.pins);
    safe(out);
    assert.deepEqual(out.reasonCodes,
      ['ORIGINAL_GET_BODY_DIFFERS_FROM_SIGNED_PHASE41_SNAPSHOT']);
  });
  it('fake self-signed api.upstox.com SAN can cryptographically match but never authenticate broker',()=>{
    const f=fixture();
    const r=auditPhase42OriginalGetReceipts(f.bundle,f.pins);
    safe(r);
    assert.equal(r.status,
      'RAW_GET_BYTES_AND_CALENDAR_PDF_DUAL_WITNESSED_UNVERIFIED');
    assert.equal(r.genuineUpstoxTlsHandshakeVerified,false);
    assert.equal(r.genuineUpstoxServerResponseAuthenticated,false);
  });
  it('wrong-domain fake TLS certificate rejected, even if pins are rewritten',()=>{
    const f=fixture(),r=f.bundle.checkpointReceipts[0];
    r.tlsPeerCertificateDerBase64=otherCert.toString('base64');
    f.pins.expectedTlsLeafSpkiSha256[0]=sha(
      new X509Certificate(otherCert).publicKey.export({
        type:'spki',format:'der'}) as Buffer);
    const out=auditPhase42OriginalGetReceipts(f.bundle,f.pins);
    safe(out);
    assert.deepEqual(out.reasonCodes,
      ['TLS_PEER_CERT_SAN_VALIDITY_OR_SPKI_PIN_DISAGREES']);
  });
  it('cert SPKI hash mismatch blocks without source promotion',()=>{
    const f=fixture();
    f.pins.expectedTlsLeafSpkiSha256[0]='cd'.repeat(32);
    const out=auditPhase42OriginalGetReceipts(f.bundle,f.pins);
    safe(out);
    assert.equal(out.status,'BLOCKED_OR_UNKNOWN');
  });
  it('original claimed NSE notice bytes missing or changed reject',()=>{
    const f=fixture();
    const b=Buffer.from(f.bundle.originalCalendarNotice.originalPdfBase64,
      'base64');
    b[30]=b[30]===65?66:65;
    f.bundle.originalCalendarNotice.originalPdfBase64=b.toString('base64');
    const out=auditPhase42OriginalGetReceipts(f.bundle,f.pins);
    safe(out);
    assert.deepEqual(out.reasonCodes,
      ['EXACT_ORIGINAL_EXCHANGE_NOTICE_PDF_BYTES_UNAVAILABLE_OR_HASH_MISMATCH']);
  });
  it('source URL, calendar pin, missing session or stopped GTT reject during Phase41 re-audit',()=>{
    const a=fixture();
    a.bundle.originalCalendarNotice.sourceUrl='https://evil.invalid';
    assert.equal(auditPhase42OriginalGetReceipts(a.bundle,a.pins).status,
      'INVALID_EVIDENCE');
    const b=fixture();
    b.pins.phase41.expectedSessionDates.pop();
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      b.bundle,b.pins).reasonCodes,
      ['PHASE41_FULL_SESSION_WITNESS_REAUDIT_BLOCKED']);
    const c=fixture();
    c.bundle.phase41Archive.phase40Gtt.overnightPairs[0].afterOpen
      .response.data[0].rules[0].status='FAILED';
    c.signAll();
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      c.bundle,c.pins).reasonCodes,
      ['PHASE41_FULL_SESSION_WITNESS_REAUDIT_BLOCKED']);
  });
  it('forged reviewer signature, reused role or missing independent witness reject',()=>{
    const a=fixture();
    a.bundle.checkpointReceipts[0].witnesses[1].signatureBase64=
      Buffer.alloc(64,0).toString('base64');
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      a.bundle,a.pins).reasonCodes,
      ['ORIGINAL_GET_RESPONSE_DUAL_SIGNATURE_INVALID']);
    const b=fixture();
    b.bundle.checkpointReceipts[0].witnesses[1].role='CAPTURE_OPERATOR';
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      b.bundle,b.pins).reasonCodes,
      ['ORIGINAL_GET_RESPONSE_DUAL_SIGNATURE_INVALID']);
    const c=fixture();c.bundle.checkpointReceipts[1].witnesses.pop();
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      c.bundle,c.pins).reasonCodes,
      ['MISSING_TWO_PINNED_RECEIPT_WITNESS_SIGNATURES']);
  });
  it('stripped/duplicated/reordered receipts and broken chain pin reject',()=>{
    const a=fixture();a.bundle.checkpointReceipts.pop();
    assert.equal(auditPhase42OriginalGetReceipts(a.bundle,a.pins).status,
      'INVALID_EVIDENCE');
    const b=fixture();b.bundle.checkpointReceipts.reverse();
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      b.bundle,b.pins).reasonCodes,
      ['GET_RESPONSE_ENDPOINT_SCOPE_OR_RECEIPT_TIME_MISMATCH']);
    const c=fixture();c.pins.expectedFinalReceiptChainSha256='11'.repeat(32);
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      c.bundle,c.pins).reasonCodes,
      ['EXTERNALLY_PINNED_ORIGINAL_RECEIPT_CHAIN_TIP_MISMATCH']);
  });
  it('late receipt signing or HTTP redirect or stored Authorization claim rejects',()=>{
    const a=fixture();
    a.bundle.checkpointReceipts[0].witnessedAt=
      '2026-11-20T18:00:00+05:30';
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      a.bundle,a.pins).reasonCodes,
      ['GET_RESPONSE_ENDPOINT_SCOPE_OR_RECEIPT_TIME_MISMATCH']);
    const b=fixture();
    b.bundle.checkpointReceipts[0].redirected=true as false;
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      b.bundle,b.pins).reasonCodes,
      ['GET_RESPONSE_ENDPOINT_SCOPE_OR_RECEIPT_TIME_MISMATCH']);
    const c=fixture();
    c.bundle.checkpointReceipts[0].authorizationHeaderPersisted=true as false;
    assert.deepEqual(auditPhase42OriginalGetReceipts(
      c.bundle,c.pins).reasonCodes,
      ['GET_RESPONSE_ENDPOINT_SCOPE_OR_RECEIPT_TIME_MISMATCH']);
  });
  it('wrong GET endpoint, status, query or checkpoint timing reject',()=>{
    const a=fixture();
    a.bundle.checkpointReceipts[0].requestedUrl=
      'https://api.evil.invalid' as
        'https://api.upstox.com/v3/order/gtt';
    assert.equal(auditPhase42OriginalGetReceipts(a.bundle,a.pins).status,
      'BLOCKED_OR_UNKNOWN');
    const b=fixture();
    b.bundle.checkpointReceipts[0].query.gtt_order_id='OTHER';
    assert.equal(auditPhase42OriginalGetReceipts(b.bundle,b.pins).status,
      'BLOCKED_OR_UNKNOWN');
    const c=fixture();
    c.bundle.checkpointReceipts[0].httpStatus=403 as 200;
    assert.equal(auditPhase42OriginalGetReceipts(c.bundle,c.pins).status,
      'BLOCKED_OR_UNKNOWN');
  });
});
