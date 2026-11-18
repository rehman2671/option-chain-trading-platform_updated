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
  auditPhase38OfflineSignedCrl,parsePhase38CrlDates,
  type Phase38OfflineCrlRequest,
  type Phase38IndependentCrlPins,
  type Phase38OpenSslRunner
} from '../../server/engine/ema15m/adaptiveUpstoxPhase38SignedCrlTrustGate.js';
import type {Phase37CmsAuditReport}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase37OriginalCmsBinding.js';
import type {Phase36DetachedCertificateInput}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';

const OPENSSL='/usr/bin/openssl';
const digest=(data:Uint8Array)=>createHash('sha256').update(data)
  .digest('hex');
type Fixture={
  dir:string;
  pdf:string;
  root:string;
  goodCrl:string;
  revokedCrl:string;
  leafDer:Buffer;
  rootDer:Buffer;
  cleanup:()=>void;
};
let fx:Fixture;
function cli(args:string[]):Buffer{
  return execFileSync(OPENSSL,args,{
    stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:150000
  });
}
function setup():Fixture{
  const dir=mkdtempSync(join(tmpdir(),'phase38-signed-crl-'));
  chmodSync(dir,0o700);
  const pdf=join(dir,'original-synthetic.pdf'),
    root=join(dir,'root.pem'),caKey=join(dir,'root.key'),
    csr=join(dir,'signer.csr'),key=join(dir,'signer.key'),
    leaf=join(dir,'signer.pem'),config=join(dir,'ca.cnf'),
    goodCrl=join(dir,'unrevoked.crl'),
    revokedCrl=join(dir,'revoked.crl');
  try{
    writeFileSync(pdf,Buffer.from(
      '%PDF-1.7\nUNSIGNED SYNTHETIC FILE PHASE38 NOT REAL BROKER\n%%EOF\n'
    ),{mode:0o600});
    cli(['req','-x509','-newkey','rsa:2048','-nodes',
      '-keyout',caKey,'-out',root,'-days','4','-sha256',
      '-subj','/CN=SYNTHETIC PHASE38 UNTRUSTED ROOT',
      '-addext','basicConstraints=critical,CA:TRUE',
      '-addext','keyUsage=critical,keyCertSign,cRLSign']);
    const conf=[
      '[ ca ]','default_ca=local','[ local ]',
      'dir='+dir,'database='+join(dir,'index.txt'),
      'serial='+join(dir,'serial'),
      'crlnumber='+join(dir,'crlnumber'),
      'new_certs_dir='+dir,
      'certificate='+root,'private_key='+caKey,
      'default_md=sha256','default_days=2',
      'default_crl_days=2','policy=policy_any',
      'x509_extensions=user_ext',
      'copy_extensions=none','unique_subject=no',
      '[ policy_any ]','commonName=supplied',
      '[ user_ext ]','basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=emailProtection',
      'subjectKeyIdentifier=hash',
      'authorityKeyIdentifier=keyid,issuer'
    ].join('\n')+'\n';
    writeFileSync(config,conf,{mode:0o600});
    writeFileSync(join(dir,'index.txt'),'',
      {mode:0o600});
    writeFileSync(join(dir,'serial'),'1000\n',
      {mode:0o600});
    writeFileSync(join(dir,'crlnumber'),'1000\n',
      {mode:0o600});
    cli(['req','-newkey','rsa:2048','-nodes',
      '-keyout',key,'-out',csr,
      '-subj','/CN=SYNTHETIC PHASE38 TEST LEAF']);
    cli(['ca','-batch','-config',config,
      '-in',csr,'-out',leaf,'-notext']);
    cli(['ca','-gencrl','-config',config,'-out',goodCrl]);
    cli(['ca','-config',config,'-revoke',leaf]);
    cli(['ca','-gencrl','-config',config,'-out',revokedCrl]);
    const leafDer=new X509Certificate(readFileSync(leaf)).raw,
      rootDer=new X509Certificate(readFileSync(root)).raw;
    return {dir,pdf,root,goodCrl,revokedCrl,leafDer,rootDer,
      cleanup:()=>rmSync(dir,{recursive:true,force:true})};
  }catch(e){
    rmSync(dir,{recursive:true,force:true});throw e;
  }
}
function inputs(crlPath=fx.goodCrl){
  const stamp=new Date().toISOString();
  const pdfHash=digest(readFileSync(fx.pdf)),
    rootPem=readFileSync(fx.root),
    crlPem=readFileSync(crlPath);
  const request:Phase38OfflineCrlRequest={
    schemaVersion:'ADAPTIVE_V2_PHASE38_SIGNED_CRL_CHAIN_V1',
    source:'OPERATOR_PRIVATE_UNVERIFIED',
    originalPdfPath:fx.pdf,
    privateRootCaPemPath:fx.root,
    privateSignedCrlPemPath:crlPath,
    opensslBinary:OPENSSL,
    assessmentAsOf:stamp,
    maxCrlAgeHours:24,timeoutMs:5000,
    operatorAuthorization:'MANUAL_OFFLINE_PINNED_CRL_REVIEW'
  };
  const pins:Phase38IndependentCrlPins={
    schemaVersion:'INDEPENDENT_PHASE38_CRL_ROOT_SOURCE_PINS_V1',
    expectedOriginalPdfSha256:pdfHash,
    expectedCmsSignerDerSha256:digest(fx.leafDer),
    expectedRootCaDerSha256:digest(fx.rootDer),
    expectedRootCaPemSha256:digest(rootPem),
    expectedSignedCrlPemSha256:digest(crlPem),
    expectedOpenSslBinarySha256:digest(readFileSync(OPENSSL)),
    expectedAssessmentAsOf:stamp
  };
  const phase37={
    status:'ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED',
    // Synthetic test-only preflight: fixture PDF is actually UNSIGNED.
    // This isolated Phase38 test only exercises real OpenSSL CRL crypto.
    actuallyRanNativeOpenSsl:true,
    originalEmbeddedCmsSignatureCryptographicallyVerified:true,
    pdfCmsSignerCryptographicallyLinkedToPinnedDer:true,
    originalPdfSha256:pdfHash,
    derivedSignerDerSha256:digest(fx.leafDer),
    brokerAuthenticated:false,
    brokerStopInstalled:false,
    productionSafe:false,
    executionAuthorized:false,
    protectedOvernight:false
  } as Phase37CmsAuditReport;
  const detached={
    schemaVersion:'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1',
    source:'SEPARATELY_PROVISIONED_UNVERIFIED',
    signerCertificateDerBase64:fx.leafDer.toString('base64'),
    issuerCertificateDerBase64:fx.rootDer.toString('base64'),
    evaluationAsOf:stamp,originalPdfSha256:pdfHash
  } as Phase36DetachedCertificateInput;
  return {request,pins,phase37,detached};
}
type Inputs=ReturnType<typeof inputs>;
function audit(x:Inputs,
  runner?:Phase38OpenSslRunner){
  return auditPhase38OfflineSignedCrl(
    x.request,x.pins,x.phase37,x.detached,runner);
}
function alwaysUnsafe(result:ReturnType<typeof audit>){
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.productionSafe,false);
  assert.equal(result.brokerAuthenticated,false);
  assert.equal(result.brokerStopInstalled,false);
  assert.equal(result.protectedOvernight,false);
  assert.equal(result.nativeOrderInstruction,null);
  assert.equal(result.currentOnlineOcspRevocationVerified,false);
  assert.equal(result.independentCaEnrollmentAndBrokerIdentityVerified,false);
  assert.equal(result.trustedRfc3161TimestampVerified,false);
  assert.equal(result.originalPdfActiveSignatureFieldVerified,false);
  assert.equal(result.genuineExchangeOrderAcknowledgementVerified,false);
  assert.equal(result.overnightStopContinuityVerified,false);
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes('SYNTHETIC PHASE38 TEST LEAF'),false);
  assert.equal(serialized.includes(fx.dir),false);
}
before(()=>{
  assert.ok(existsSync(OPENSSL));
  fx=setup();
});
after(()=>fx?.cleanup());
describe('Phase38 actual pinned local CA and signed CRL review',()=>{
  it('real self-signed FAKE CA and signed unrevoked CRL only yield UNVERIFIED',()=>{
    const result=audit(inputs());
    alwaysUnsafe(result);
    assert.equal(result.status,
      'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED',
      JSON.stringify(result));
    assert.equal(result.actuallyRanNativeOpenSsl,true);
    assert.equal(result.sameCmsSignerAsPhase37,true);
    assert.equal(result.issuerCaDerMatchesExternalPin,true);
    assert.equal(result.signedCrlAcceptedAtClaimedAsOf,true);
    assert.equal(result.localIssuerCertificateChainVerified,true);
    assert.equal(result.offlineCrlFreshAtClaimedAsOf,true);
    assert.ok(result.crlThisUpdate?.endsWith('Z'));
    assert.ok(result.crlNextUpdate?.endsWith('Z'));
    assert.ok(/^[0-9a-f]{64}$/.test(result.pinnedCrlSha256!));
  });
  it('actually revoked leaf CRL is cryptographically rejected',()=>{
    const result=audit(inputs(fx.revokedCrl));
    alwaysUnsafe(result);
    assert.equal(result.status,'OFFLINE_CRL_CHAIN_REJECTED');
    assert.deepEqual(result.reasonCodes,[
      'SIGNED_CRL_OR_CA_VERIFICATION_REJECTED'
    ]);
    assert.equal(result.signedCrlAcceptedAtClaimedAsOf,false);
  });
  it('signed CRL with stale local snapshot or post-nextUpdate is blocked',()=>{
    const a=inputs();
    const inTwoHours=new Date(Date.parse(a.request.assessmentAsOf)+
      2*3600000).toISOString();
    a.request.assessmentAsOf=inTwoHours;
    a.pins.expectedAssessmentAsOf=inTwoHours;
    a.request.maxCrlAgeHours=1;
    const stale=audit(a);alwaysUnsafe(stale);
    assert.deepEqual(stale.reasonCodes,[
      'CRL_NOT_FRESH_AT_EXTERNALLY_ASSERTED_ASSESSMENT_TIME'
    ]);
    const b=inputs();
    const afterExpiry=new Date(Date.parse(b.request.assessmentAsOf)+
      4*86400000).toISOString();
    b.request.assessmentAsOf=afterExpiry;
    b.pins.expectedAssessmentAsOf=afterExpiry;
    b.request.maxCrlAgeHours=168;
    assert.deepEqual(audit(b).reasonCodes,[
      'CRL_NOT_FRESH_AT_EXTERNALLY_ASSERTED_ASSESSMENT_TIME'
    ]);
  });
  it('incorrect independent CRL, CA, signer, source PDF or binary pins reject',()=>{
    for(const field of [
      'expectedOriginalPdfSha256',
      'expectedCmsSignerDerSha256',
      'expectedRootCaDerSha256',
      'expectedRootCaPemSha256',
      'expectedSignedCrlPemSha256',
      'expectedOpenSslBinarySha256'
    ] as const){
      const x=inputs();x.pins[field]='ab'.repeat(32);
      const result=audit(x);alwaysUnsafe(result);
      assert.equal(result.status,'INVALID_EVIDENCE');
    }
  });
  it('invalid Phase37 CMS signer or missing account trust is blocked early',()=>{
    const x=inputs();x.phase37.status=
      'CMS_CRYPTO_OR_SIGNER_REJECTED';
    assert.deepEqual(audit(x).reasonCodes,[
      'PHASE37_REAL_CMS_SIGNER_SOURCE_PREREQUISITE_FAILED'
    ]);
    const y=inputs();y.phase37.brokerStopInstalled=
      true as false;
    assert.equal(audit(y).status,'INVALID_EVIDENCE');
    const z=inputs();z.phase37.derivedSignerDerSha256='ff'.repeat(32);
    assert.equal(audit(z).status,'INVALID_EVIDENCE');
  });
  it('private files, symlinks and operator authorization always fail closed',()=>{
    const perm=join(fx.dir,'public-crl.pem');
    writeFileSync(perm,readFileSync(fx.goodCrl),{mode:0o644});
    const a=inputs();a.request.privateSignedCrlPemPath=perm;
    assert.equal(audit(a).status,'INVALID_EVIDENCE');
    const symlink=join(fx.dir,'crl-link.pem');
    symlinkSync(fx.goodCrl,symlink);
    const b=inputs();b.request.privateSignedCrlPemPath=symlink;
    assert.equal(audit(b).status,'INVALID_EVIDENCE');
    const c=inputs();c.request.operatorAuthorization=
      'NOT_APPROVED' as 'MANUAL_OFFLINE_PINNED_CRL_REVIEW';
    assert.equal(audit(c).status,'INVALID_EVIDENCE');
    const d=inputs();d.request.opensslBinary=
      '/tmp/openssl' as '/usr/bin/openssl';
    assert.equal(audit(d).status,'INVALID_EVIDENCE');
  });
  it('OpenSSL fixed arguments use no CRL download/OCSP or host trust roots',()=>{
    const x=inputs();
    const seen:string[][]=[];
    const mock:Phase38OpenSslRunner=(bin,args,ms)=>{
      assert.equal(bin,OPENSSL);
      assert.equal(ms,5000);
      seen.push([...args]);
      if(args[0]==='crl')
        return {exitCode:0,stdout:Buffer.from(
          'lastUpdate=Nov 18 10:00:00 2026 GMT\n'+
          'nextUpdate=Nov 20 10:00:00 2026 GMT\n'),
        stderr:new Uint8Array(),timedOut:false};
      assert.equal(args[0],'verify');
      assert.ok(args.includes('-crl_check_all'));
      assert.ok(args.includes('-check_ss_sig'));
      assert.ok(args.includes('-no-CApath'));
      assert.ok(args.includes('-no-CAstore'));
      assert.ok(args.includes('-attime'));
      assert.ok(!args.includes('-crl_download'));
      assert.ok(!args.includes('-no_check_time'));
      assert.ok(!args.includes('-partial_chain'));
      return {exitCode:0,stdout:Buffer.from('private-leaf.pem: OK\n'),
        stderr:new Uint8Array(),timedOut:false};
    };
    const result=audit(x,mock);
    alwaysUnsafe(result);
    assert.equal(seen.length,2);
    assert.notEqual(result.status,
      'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED');
    assert.ok(result.reasonCodes.includes(
      'MOCKED_OPENSSL_CRL_IS_NOT_ACTUAL_CRYPTOGRAPHIC_EVIDENCE'));
  });
  it('OpenSSL failure/timeout/malformed response can never certify CRL',()=>{
    const x=inputs();
    for(const r of [
      {exitCode:1,stdout:new Uint8Array(),
        stderr:Buffer.from('secret DN'),timedOut:false},
      {exitCode:null,stdout:new Uint8Array(),
        stderr:new Uint8Array(),timedOut:true},
      {exitCode:0,stdout:Buffer.from('not valid CRL'),
        stderr:new Uint8Array(),timedOut:false}
    ]){
      const result=audit(x,()=>r);alwaysUnsafe(result);
      assert.equal(result.status,'OFFLINE_CRL_CHAIN_REJECTED');
    }
  });
});
describe('Phase38 strict OpenSSL CRL freshness field parser',()=>{
  it('reads a CRL validity window, and rejects duplicate or reversed values',()=>{
    const valid=parsePhase38CrlDates(
      'lastUpdate=Nov 18 10:00:00 2026 GMT\n'+
      'nextUpdate=Nov 19 10:00:00 2026 GMT\n');
    assert.equal(valid.valid,true);
    assert.equal(valid.thisUpdate,'2026-11-18T10:00:00.000Z');
    assert.equal(valid.nextUpdate,'2026-11-19T10:00:00.000Z');
    assert.equal(parsePhase38CrlDates(
      'lastUpdate=Nov 19 10:00:00 2026 GMT\n'+
      'nextUpdate=Nov 18 10:00:00 2026 GMT\n'
    ).valid,false);
    assert.equal(parsePhase38CrlDates(
      'lastUpdate=Nov 18 10:00:00 2026 GMT\n'+
      'lastUpdate=Nov 18 10:00:00 2026 GMT\n'
    ).valid,false);
    assert.equal(parsePhase38CrlDates(
      'this is a claim but not an OpenSSL CRL').valid,false);
  });
});
