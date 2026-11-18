import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {
  chmodSync,existsSync,mkdtempSync,readFileSync,rmSync,
  symlinkSync,writeFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  auditPhase39OfflineOcspAndTsa,parsePhase39OcspResult,
  type Phase39PrivateRequest,type Phase39IndependentPins,
  type Phase39Runner
} from '../../server/engine/ema15m/adaptiveUpstoxPhase39OfflineOcspTsa.js';
import type {
  Phase38OfflineCrlReport
} from '../../server/engine/ema15m/adaptiveUpstoxPhase38SignedCrlTrustGate.js';
import type {
  Phase36DetachedCertificateInput
} from '../../server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';

const BIN='/usr/bin/openssl';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const cli=(a:string[])=>execFileSync(BIN,a,{
  stdio:['ignore','pipe','pipe'],timeout:12000,maxBuffer:200000
});
type Fixture={
  dir:string;pdf:string;ca:string;leaf:string;
  tsa:string;ocspGood:string;ocspRevoked:string;tsr:string;
  originalPdf:Buffer;rootDer:Buffer;leafDer:Buffer;tsaDer:Buffer;
  cleanup:()=>void;
};
let f:Fixture;
function makeFixture():Fixture{
  const dir=mkdtempSync(join(tmpdir(),'phase39-ocsp-ts-'));
  chmodSync(dir,0o700);
  const pdf=join(dir,'original-synthetic.pdf'),
    ca=join(dir,'root.pem'),cakey=join(dir,'root.key'),
    leafkey=join(dir,'leaf.key'),csr=join(dir,'leaf.csr'),
    leaf=join(dir,'leaf.pem'),tsaKey=join(dir,'tsa.key'),
    tsaCsr=join(dir,'tsa.csr'),tsa=join(dir,'tsa.pem'),
    caCfg=join(dir,'ca.cnf'),tsaExt=join(dir,'tsa.ext'),
    tsaCfg=join(dir,'tsa.cnf'),query=join(dir,'pdf.tsq'),
    tsr=join(dir,'pdf.tsr'),
    ocspGood=join(dir,'good.ocsp.der'),
    ocspRevoked=join(dir,'revoked.ocsp.der');
  try{
    const originalPdf=Buffer.from(
      '%PDF-1.7\nPHASE39 UNSIGNED TEST DATA NOT REAL BROKER ECN\n%%EOF\n');
    writeFileSync(pdf,originalPdf,{mode:0o600});
    cli(['req','-x509','-newkey','rsa:2048','-nodes',
      '-keyout',cakey,'-out',ca,'-days','3','-sha256',
      '-subj','/CN=SYNTHETIC UNTRUSTED PHASE39 ROOT',
      '-addext','basicConstraints=critical,CA:TRUE',
      '-addext','keyUsage=critical,keyCertSign,cRLSign']);
    const cfg=[
      '[ ca ]','default_ca=local','[ local ]',
      'dir='+dir,'database='+join(dir,'index.txt'),
      'serial='+join(dir,'serial'),
      'new_certs_dir='+dir,'certificate='+ca,
      'private_key='+cakey,'default_md=sha256',
      'default_days=2','policy=policy_any',
      'x509_extensions=leaf',
      '[ policy_any ]','commonName=supplied',
      '[ leaf ]','basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=emailProtection',
      'subjectKeyIdentifier=hash',
      'authorityKeyIdentifier=keyid,issuer'
    ].join('\n')+'\n';
    writeFileSync(caCfg,cfg,{mode:0o600});
    writeFileSync(join(dir,'index.txt'),'',{mode:0o600});
    writeFileSync(join(dir,'serial'),'1000\n',{mode:0o600});
    cli(['req','-newkey','rsa:2048','-nodes',
      '-keyout',leafkey,'-out',csr,
      '-subj','/CN=SYNTHETIC PHASE39 CMS SIGNER']);
    cli(['ca','-batch','-config',caCfg,
      '-in',csr,'-out',leaf,'-notext']);
    // Real OFFLINE signed OCSP good followed by actual revocation.
    cli(['ocsp','-index',join(dir,'index.txt'),
      '-rsigner',ca,'-rkey',cakey,'-CA',ca,
      '-issuer',ca,'-cert',leaf,'-respout',ocspGood,
      '-ndays','2','-no_nonce']);
    cli(['ca','-config',caCfg,'-revoke',leaf]);
    cli(['ocsp','-index',join(dir,'index.txt'),
      '-rsigner',ca,'-rkey',cakey,'-CA',ca,
      '-issuer',ca,'-cert',leaf,'-respout',ocspRevoked,
      '-ndays','2','-no_nonce']);
    // Real RFC3161 TSA certificate with critical timeStamping EKU.
    cli(['req','-newkey','rsa:2048','-nodes',
      '-keyout',tsaKey,'-out',tsaCsr,
      '-subj','/CN=SYNTHETIC PHASE39 FAKE TSA']);
    writeFileSync(tsaExt,'basicConstraints=critical,CA:FALSE\n'+
      'keyUsage=critical,digitalSignature\n'+
      'extendedKeyUsage=critical,timeStamping\n',{mode:0o600});
    cli(['x509','-req','-in',tsaCsr,'-CA',ca,
      '-CAkey',cakey,'-CAcreateserial','-out',tsa,
      '-days','2','-sha256','-extfile',tsaExt]);
    const cfgTsa=[
      '[ tsa ]','default_tsa=local','[ local ]',
      'serial='+join(dir,'tsa.serial'),
      'signer_cert='+tsa,'signer_key='+tsaKey,
      'signer_digest=sha256','certs='+ca,
      'default_policy=1.2.3.4.5',
      'other_policies=1.2.3.4.5','digests=sha256',
      'accuracy=secs:1','ordering=no','ess_cert_id_chain=yes'
    ].join('\n')+'\n';
    writeFileSync(tsaCfg,cfgTsa,{mode:0o600});
    writeFileSync(join(dir,'tsa.serial'),'01\n',{mode:0o600});
    cli(['ts','-query','-data',pdf,'-sha256','-cert','-out',query]);
    cli(['ts','-reply','-config',tsaCfg,
      '-queryfile',query,'-out',tsr]);
    for(const p of [ca,leaf,tsa,ocspGood,ocspRevoked,tsr])
      chmodSync(p,0o600);
    return {dir,pdf,ca,leaf,tsa,ocspGood,ocspRevoked,tsr,
      originalPdf,
      rootDer:new X509Certificate(readFileSync(ca)).raw,
      leafDer:new X509Certificate(readFileSync(leaf)).raw,
      tsaDer:new X509Certificate(readFileSync(tsa)).raw,
      cleanup:()=>rmSync(dir,{recursive:true,force:true})};
  }catch(error){
    rmSync(dir,{recursive:true,force:true});throw error;
  }
}
function setup(ocsp=f.ocspGood,tsr=f.tsr){
  const now=new Date().toISOString(),
    caBytes=readFileSync(f.ca);
  const request:Phase39PrivateRequest={
    schemaVersion:'ADAPTIVE_V2_PHASE39_OFFLINE_OCSP_TSA_V1',
    source:'OPERATOR_PRIVATE_UNVERIFIED',
    originalPdfPath:f.pdf,caPemPath:f.ca,
    signedOcspDerPath:ocsp,
    signedTimestampResponseDerPath:tsr,
    tsaSignerCertificatePemPath:f.tsa,
    opensslBinary:BIN,assessmentAsOf:now,
    maximumOcspAgeSeconds:3600,timeoutMs:5000,
    operatorAuthorization:'MANUAL_PINNED_OFFLINE_OCSP_RFC3161_ONLY'
  };
  const pins:Phase39IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE39_OCSP_TSA_PINS_V1',
    expectedOriginalPdfSha256:hash(f.originalPdf),
    expectedCmsSignerDerSha256:hash(f.leafDer),
    expectedCaPemSha256:hash(caBytes),
    expectedCaDerSha256:hash(f.rootDer),
    expectedOcspDerSha256:hash(readFileSync(ocsp)),
    expectedTimestampResponseDerSha256:hash(readFileSync(tsr)),
    expectedTsaSignerDerSha256:hash(f.tsaDer),
    expectedOpenSslBinarySha256:hash(readFileSync(BIN)),
    expectedAssessmentAsOf:now
  };
  // Synthetic Phase38 positive ONLY for isolated Phase39 cryptography test;
  // actual fixture PDF is UNSIGNED. Manual CLI reruns Phase37 & Phase38.
  const phase38={
    status:'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED',
    actuallyRanNativeOpenSsl:true,originalPdfSha256:hash(f.originalPdf),
    pinnedRootCaDerSha256:hash(f.rootDer),
    executionAuthorized:false,productionSafe:false,
    brokerAuthenticated:false,brokerStopInstalled:false,
    protectedOvernight:false
  } as Phase38OfflineCrlReport;
  const detached={
    schemaVersion:'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1',
    source:'SEPARATELY_PROVISIONED_UNVERIFIED',
    signerCertificateDerBase64:f.leafDer.toString('base64'),
    issuerCertificateDerBase64:f.rootDer.toString('base64'),
    originalPdfSha256:hash(f.originalPdf),evaluationAsOf:now
  } as Phase36DetachedCertificateInput;
  return {request,pins,phase38,detached};
}
type Input=ReturnType<typeof setup>;
const audit=(i:Input,runner?:Phase39Runner)=>
  auditPhase39OfflineOcspAndTsa(
    i.request,i.pins,i.phase38,i.detached,runner);
function safe(x:ReturnType<typeof audit>){
  assert.equal(x.executionAuthorized,false);
  assert.equal(x.productionSafe,false);
  assert.equal(x.brokerAuthenticated,false);
  assert.equal(x.brokerStopInstalled,false);
  assert.equal(x.protectedOvernight,false);
  assert.equal(x.nativeOrderInstruction,null);
  assert.equal(x.onlineOcspActuallyFetched,false);
  assert.equal(x.verifiedRealWorldOcspResponderOrigin,false);
  assert.equal(x.realWorldBrokerIssuerEnrollmentVerified,false);
  assert.equal(x.independentTrustedTimeSourceVerified,false);
  assert.equal(x.originalCmsSignatureSigningTimeVerified,false);
  assert.equal(x.guaranteedNativeStopSurvival,false);
  const text=JSON.stringify(x);
  assert.ok(!text.includes(f.dir));
  assert.ok(!text.includes('SYNTHETIC PHASE39 CMS SIGNER'));
}
before(()=>{
  assert.ok(existsSync(BIN));
  f=makeFixture();
});
after(()=>f?.cleanup());
describe('Phase39 real signed OCSP + genuine RFC3161 synthetic token',()=>{
  it('verifies real FAKE CA good OCSP and TSA original PDF imprint, never broker identity',()=>{
    const result=audit(setup());safe(result);
    assert.equal(result.status,
      'OFFLINE_OCSP_AND_PDF_TIMESTAMP_CONSISTENT_UNVERIFIED',
      JSON.stringify(result));
    assert.equal(result.actualNativeOpenSslRan,true);
    assert.equal(result.offlineOcspGoodForSignerAtAssertedTime,true);
    assert.equal(result.rfc3161TokenVerifiedForExactOriginalPdf,true);
    assert.ok(result.ocspThisUpdate?.endsWith('Z'));
    assert.ok(result.ocspNextUpdate?.endsWith('Z'));
  });
  it('real issuer signed REVOKED OCSP response fails closed',()=>{
    const x=audit(setup(f.ocspRevoked));safe(x);
    assert.equal(x.status,'OCSP_SIGNATURE_OR_STATUS_REJECTED',
      JSON.stringify(x));
    assert.ok(x.reasonCodes.includes('SIGNER_OCSP_STATUS_NOT_GOOD'));
  });
  it('valid signed TSA token rejects changing exact PDF source or TSA token bytes',()=>{
    const different=join(f.dir,'changed.pdf');
    writeFileSync(different,Buffer.from(
      '%PDF-1.7\nCHANGED CONTENT PH39\n%%EOF\n'
    ),{mode:0o600});
    const x=setup();x.request.originalPdfPath=different;
    x.pins.expectedOriginalPdfSha256=hash(readFileSync(different));
    x.phase38.originalPdfSha256=x.pins.expectedOriginalPdfSha256;
    x.detached.originalPdfSha256=x.pins.expectedOriginalPdfSha256;
    const out=audit(x);safe(out);
    assert.equal(out.status,'RFC3161_TIMESTAMP_REJECTED',
      JSON.stringify(out));
    const corrupt=join(f.dir,'corrupted.tsr');
    const bytes=Buffer.from(readFileSync(f.tsr));bytes[40]^=0x55;
    writeFileSync(corrupt,bytes,{mode:0o600});
    const y=audit(setup(f.ocspGood,corrupt));safe(y);
    assert.equal(y.status,'RFC3161_TIMESTAMP_REJECTED');
  });
  it('OCSP freshness expiry and future-dated purported review reject',()=>{
    const a=setup();
    a.request.assessmentAsOf=new Date(Date.now()+3*86400000).toISOString();
    a.pins.expectedAssessmentAsOf=a.request.assessmentAsOf;
    const r=audit(a);safe(r);
    assert.equal(r.status,'OCSP_SIGNATURE_OR_STATUS_REJECTED');
    const b=setup();b.request.maximumOcspAgeSeconds=60;
    b.request.assessmentAsOf=new Date(Date.now()+120000).toISOString();
    b.pins.expectedAssessmentAsOf=b.request.assessmentAsOf;
    assert.equal(audit(b).status,'OCSP_SIGNATURE_OR_STATUS_REJECTED');
  });
  it('independent pins for responder, PDF, root, signer, TSA, openssl fail',()=>{
    for(const field of [
      'expectedOriginalPdfSha256','expectedCmsSignerDerSha256',
      'expectedCaPemSha256','expectedCaDerSha256',
      'expectedOcspDerSha256','expectedTimestampResponseDerSha256',
      'expectedTsaSignerDerSha256','expectedOpenSslBinarySha256'
    ] as const){
      const x=setup();x.pins[field]='ff'.repeat(32);
      const r=audit(x);safe(r);
      assert.equal(r.status,'INVALID_EVIDENCE');
    }
  });
  it('rejects fake Phase38 status, no operator approval and unsafe private files',()=>{
    const a=setup();a.phase38.status='OFFLINE_CRL_CHAIN_REJECTED';
    assert.equal(audit(a).status,'INVALID_EVIDENCE');
    const b=setup();b.request.operatorAuthorization=
      'UNKNOWN' as 'MANUAL_PINNED_OFFLINE_OCSP_RFC3161_ONLY';
    assert.equal(audit(b).status,'INVALID_EVIDENCE');
    const bad=join(f.dir,'public.ocsp');
    writeFileSync(bad,readFileSync(f.ocspGood),{mode:0o644});
    const c=setup();c.request.signedOcspDerPath=bad;
    assert.equal(audit(c).status,'INVALID_EVIDENCE');
    const alias=join(f.dir,'symlink.ocsp');
    symlinkSync(f.ocspGood,alias);
    const d=setup();d.request.signedOcspDerPath=alias;
    assert.equal(audit(d).status,'INVALID_EVIDENCE');
  });
  it('all native subprocesses have bounded no-network arguments, mocked success blocked',()=>{
    const x=setup();
    const calls:string[][]=[];
    const fake:Phase39Runner=(bin,args,ms)=>{
      calls.push([...args]);
      assert.equal(bin,BIN);assert.equal(ms,5000);
      assert.ok(!args.includes('-url'));
      assert.ok(!args.includes('-noverify'));
      assert.ok(!args.includes('-no_signature_verify'));
      assert.ok(!args.includes('-no_cert_verify'));
      assert.ok(!args.includes('-trust_other'));
      assert.ok(!args.includes('-no_content_verify'));
      assert.ok(!args.includes('-nosigs'));
      if(args[0]==='ocsp')return {
        code:0,stdout:Buffer.from(f.leaf+': good\n'+
          'This Update: Nov 18 10:00:00 2026 GMT\n'+
          'Next Update: Nov 20 10:00:00 2026 GMT\n'),
        stderr:Buffer.from('Response verify OK\n'),timedOut:false
      };
      if(args[0]==='ts')return{
        code:0,stdout:Buffer.from('Verification: OK\n'),
        stderr:new Uint8Array(),timedOut:false
      };
      return {code:0,stdout:new Uint8Array(),stderr:new Uint8Array(),
        timedOut:false};
    };
    const r=audit(x,fake);safe(r);
    assert.notEqual(r.status,
      'OFFLINE_OCSP_AND_PDF_TIMESTAMP_CONSISTENT_UNVERIFIED');
    // Mock process cannot create real timestamp token or its signer file.
    assert.ok(calls.length>=1);
  });
  it('CRL and TSA claims never repair broker-native stop or open NRML',()=>{
    const r=audit(setup());safe(r);
    assert.equal(r.guaranteedNativeStopSurvival,false);
    assert.equal(r.independentTrustedTimeSourceVerified,false);
  });
});
describe('Phase39 strict single OCSP output parser',()=>{
  it('rejects duplicate, revoked, unknown, missing dates and malformed output',()=>{
    const good=[
      'Response verify OK','leaf.pem: good',
      'This Update: Nov 18 10:00:00 2026 GMT',
      'Next Update: Nov 19 10:00:00 2026 GMT'
    ].join('\n');
    assert.equal(parsePhase39OcspResult(good).ok,true);
    assert.equal(parsePhase39OcspResult(good.replace(': good',': revoked')).ok,false);
    assert.equal(parsePhase39OcspResult(good.replace(': good',': unknown')).ok,false);
    assert.equal(parsePhase39OcspResult(good+'\nextra.pem: good\n').ok,false);
    assert.equal(parsePhase39OcspResult(good.replace('Next Update:','Next')).ok,false);
  });
});
