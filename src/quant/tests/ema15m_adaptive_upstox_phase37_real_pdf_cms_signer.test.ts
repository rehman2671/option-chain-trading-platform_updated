import {describe,it,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {
  chmodSync,existsSync,mkdtempSync,readFileSync,rmSync,symlinkSync,
  writeFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  auditPhase37OriginalPdfCmsSigner,
  extractPhase37OriginalPdfCms,
  type Phase37CmsRequest,type Phase37IndependentCmsPins,
  type Phase37OpenSslRunner
} from '../../server/engine/ema15m/adaptiveUpstoxPhase37OriginalCmsBinding.js';
import type {
  Phase36DetachedCertificateInput,
  Phase36IndependentCertificatePins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';

const sha=(b:Uint8Array)=>createHash('sha256').update(b)
  .digest('hex');
const BIN='/usr/bin/openssl';
interface Fixture{
  parent:string;
  pdfPath:string;
  pdf:Buffer;
  signerPemPath:string;
  signerPrivateKey:string;
  signerDer:Buffer;
  issuerDer:Buffer;
  otherSignerDer:Buffer;
  otherSignerPrivateKey:string;
  otherSignerPemPath:string;
  cmsDer:Buffer;
  extractedSignedBytes:Buffer;
  cleanup:()=>void;
}
let fixture:Fixture;
function run(args:string[]):Buffer{
  return execFileSync(BIN,args,{stdio:['ignore','pipe','pipe'],
    timeout:10000,maxBuffer:250000});
}
function syntheticPdfUnsigned():Buffer{
  const stream=Buffer.from(
    'BT /F1 12 Tf 40 750 Td (PHASE37 SYNTHETIC CONTENT NOT AN ECN) Tj ET',
    'latin1');
  const placeholder='0'.repeat(20000);
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] /SigFlags 3 >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [7 0 R] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream.toString('latin1')+'\nendstream',
    '<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 000000000000 000000000000 000000000000] /Contents <'+placeholder+'> /M (D:20261118152200+05\'30\') >>',
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /V 6 0 R /Rect [0 0 0 0] /P 3 0 R >>'
  ];
  let text='%PDF-1.7\n';
  const offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(text,'latin1'));
    text+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const xref=Buffer.byteLength(text,'latin1');
  text+='xref\n0 8\n0000000000 65535 f \n';
  for(const o of offsets.slice(1))
    text+=String(o).padStart(10,'0')+' 00000 n \n';
  text+='trailer\n<< /Root 1 0 R /Size 8 >>\nstartxref\n'+
    xref+'\n%%EOF\n';
  const marker='/Contents <',start=text.indexOf(marker);
  assert.ok(start>0);
  const lt=start+marker.length-1;
  const gt=lt+placeholder.length+2;
  const exact='/ByteRange [0 '+String(lt).padStart(12,'0')+
    ' '+String(gt).padStart(12,'0')+' '+
    String(text.length-gt).padStart(12,'0')+']';
  text=text.replace(
    '/ByteRange [0 000000000000 000000000000 000000000000]',exact);
  assert.equal(text.length,Buffer.byteLength(text,'latin1'));
  assert.equal(text[lt],'<');
  assert.equal(text[gt-1],'>');
  return Buffer.from(text,'latin1');
}
function realSignedPdf(
  root:string,certPath:string,keyPath:string,
  tag:string
):{pdf:Buffer;cms:Buffer;content:Buffer}{
  const empty=syntheticPdfUnsigned();
  const str=empty.toString('latin1');
  const start=str.indexOf('/Contents <');
  const lt=start+'/Contents '.length;
  const gt=str.indexOf('>',lt)+1;
  const middle=empty.subarray(lt,gt);
  assert.equal(middle[0],60);
  assert.equal(middle[middle.length-1],62);
  const content=Buffer.concat([empty.subarray(0,lt),empty.subarray(gt)]);
  const file=join(root,'bytes-'+tag+'.bin');
  const cmsFile=join(root,'cms-'+tag+'.der');
  writeFileSync(file,content,{mode:0o600});
  run(['cms','-sign','-binary','-in',file,
    '-signer',certPath,'-inkey',keyPath,'-outform','DER',
    '-out',cmsFile,'-md','sha256']);
  const cms=readFileSync(cmsFile);
  assert.ok(cms.length>256&&cms.length<5000);
  const hex=cms.toString('hex');
  assert.ok(hex.length<middle.length-2);
  const padded=hex+'0'.repeat(middle.length-2-hex.length);
  const pdf=Buffer.concat([
    empty.subarray(0,lt+1),Buffer.from(padded,'ascii'),
    empty.subarray(gt-1)
  ]);
  assert.equal(pdf.length,empty.length);
  return {pdf,cms,content};
}
function makeFixture():Fixture{
  const parent=mkdtempSync(join(tmpdir(),'phase37-real-cms-'));
  chmodSync(parent,0o700);
  const ca=join(parent,'ca.pem'),caKey=join(parent,'ca.key'),
    signer=join(parent,'signer.pem'),signerKey=join(parent,'signer.key'),
    csr=join(parent,'leaf.csr'),ext=join(parent,'signer.ext'),
    other=join(parent,'other.pem'),otherKey=join(parent,'other.key'),
    otherCsr=join(parent,'other.csr');
  try{
    run(['req','-newkey','rsa:2048','-x509','-nodes',
      '-keyout',caKey,'-out',ca,'-days','1',
      '-subj','/CN=PHASE37 UNTRUSTED SYNTHETIC TEST CA',
      '-addext','basicConstraints=critical,CA:TRUE',
      '-addext','keyUsage=critical,keyCertSign,cRLSign']);
    writeFileSync(ext,'basicConstraints=critical,CA:FALSE\n'+
      'keyUsage=critical,digitalSignature\n',{mode:0o600});
    const signOne=(cert:string,key:string,req:string,subject:string)=>{
      run(['req','-newkey','rsa:2048','-nodes',
        '-keyout',key,'-out',req,'-subj',subject]);
      run(['x509','-req','-in',req,'-CA',ca,'-CAkey',caKey,
        '-CAcreateserial','-out',cert,'-days','1','-sha256',
        '-extfile',ext]);
    };
    signOne(signer,signerKey,csr,'/CN=SYNTHETIC PHASE37 LOCAL SIGNER');
    signOne(other,otherKey,otherCsr,'/CN=SYNTHETIC PHASE37 WRONG SIGNER');
    const signed=realSignedPdf(parent,signer,signerKey,'good');
    const pdfPath=join(parent,'signed-private.pdf');
    writeFileSync(pdfPath,signed.pdf,{mode:0o600});
    return {
      parent,pdfPath,pdf:signed.pdf,
      signerPemPath:signer,signerPrivateKey:signerKey,
      signerDer:new X509Certificate(readFileSync(signer)).raw,
      issuerDer:new X509Certificate(readFileSync(ca)).raw,
      otherSignerDer:new X509Certificate(readFileSync(other)).raw,
      otherSignerPrivateKey:otherKey,otherSignerPemPath:other,
      cmsDer:signed.cms,extractedSignedBytes:signed.content,
      cleanup:()=>rmSync(parent,{recursive:true,force:true})
    };
  }catch(e){
    rmSync(parent,{recursive:true,force:true});throw e;
  }
}
function input(pdfPath=fixture.pdfPath,signerDer=fixture.signerDer){
  const pdfHash=sha(readFileSync(pdfPath)),at=new Date().toISOString();
  const request:Phase37CmsRequest={
    schemaVersion:'ADAPTIVE_V2_PHASE37_ORIGINAL_PDF_CMS_V1',
    source:'PRIVATE_ORIGINAL_PDF_UNVERIFIED',
    originalPdfPath:pdfPath,opensslBinary:BIN,
    timeoutMs:5000,
    operatorAuthorization:'OWNER_APPROVED_OFFLINE_CMS_CRYPTO_ONLY'
  };
  const pins:Phase37IndependentCmsPins={
    schemaVersion:'INDEPENDENT_PHASE37_CMS_ORIGINAL_SOURCE_PINS_V1',
    expectedOriginalPdfSha256:pdfHash,
    expectedOpenSslBinarySha256:sha(readFileSync(BIN)),
    expectedSignerDerSha256:sha(signerDer),
    expectedIssuerDerSha256:sha(fixture.issuerDer),
    expectedSubFilter:'adbe.pkcs7.detached'
  };
  const detached:Phase36DetachedCertificateInput={
    schemaVersion:'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1',
    source:'SEPARATELY_PROVISIONED_UNVERIFIED',
    signerCertificateDerBase64:signerDer.toString('base64'),
    issuerCertificateDerBase64:fixture.issuerDer.toString('base64'),
    evaluationAsOf:at,originalPdfSha256:pdfHash
  };
  const dpins:Phase36IndependentCertificatePins={
    schemaVersion:'INDEPENDENT_PHASE36_X509_PINS_V1',
    originalPdfSha256:pdfHash,
    expectedSignerDerSha256:pins.expectedSignerDerSha256,
    expectedIssuerDerSha256:pins.expectedIssuerDerSha256,
    evaluationAsOf:at,
    expectedIssuerTrustModel:'EXTERNALLY_PINNED_SELF_SIGNED_CA_ONLY'
  };
  return {request,pins,detached,dpins};
}
const inspect=(a:ReturnType<typeof input>,
  runner?:Phase37OpenSslRunner)=>
  auditPhase37OriginalPdfCmsSigner(
    a.request,a.pins,a.detached,a.dpins,runner);
function safe(r:ReturnType<typeof inspect>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.brokerSignerIdentityVerified,false);
  assert.equal(r.independentlyTrustedIssuerCaVerified,false);
  assert.equal(r.currentRevocationChecked,false);
  assert.equal(r.independentlyTrustedTimestampVerified,false);
  assert.equal(r.originalEcnAnnexureValidated,false);
  assert.equal(r.nativeStopAckOrOvernightContinuityVerified,false);
  const txt=JSON.stringify(r);
  assert.equal(txt.includes('SYNTHETIC PHASE37 LOCAL SIGNER'),false);
  assert.equal(txt.includes(fixture.parent),false);
}
before(()=>{
  assert.ok(existsSync(BIN),'OpenSSL native executable required');
  fixture=makeFixture();
});
after(()=>fixture?.cleanup());
describe('Phase37 original PDF ByteRange + actual CMS signer binding',()=>{
  it('real synthetic signed PDF verifies CMS signature and signer certificate DER',()=>{
    const a=input(),result=inspect(a);
    safe(result);
    assert.equal(result.status,'ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED',
      JSON.stringify(result));
    assert.equal(result.actuallyRanNativeOpenSsl,true);
    assert.equal(result.exactSignedPdfByteRangesVerified,true);
    assert.equal(result.originalEmbeddedCmsSignatureCryptographicallyVerified,true);
    assert.equal(result.embeddedSignerDerMatchesIndependentPin,true);
    assert.equal(result.pdfCmsSignerCryptographicallyLinkedToPinnedDer,true);
    assert.equal(result.derivedSignerDerSha256,sha(fixture.signerDer));
    assert.ok(/^[a-f0-9]{64}$/.test(result.cmsDerSha256!));
  });
  it('pdfsig independently confirms synthetic CMS valid but fake CA untrusted',()=>{
    const text=execFileSync('/usr/bin/pdfsig',
      ['-no-ocsp',fixture.pdfPath],{encoding:'utf8',timeout:5000});
    assert.ok(text.includes('Signature is Valid.'));
    assert.ok(text.includes('Total document signed'));
    assert.ok(!text.includes('Certificate is Trusted.'));
    // Do not return private signer DN from external command to reports.
    const r=inspect(input());safe(r);
    assert.equal(r.brokerSignerIdentityVerified,false);
  });
  it('the exact signed PDF bytes and CMS DER re-extract from original file',()=>{
    const parsed=extractPhase37OriginalPdfCms(fixture.pdf);
    assert.equal(parsed.ok,true,parsed.reasonCode);
    assert.deepEqual(Buffer.from(parsed.signedContent!),fixture.extractedSignedBytes);
    assert.deepEqual(Buffer.from(parsed.cmsDer!),fixture.cmsDer);
    assert.equal(parsed.subfilter,'adbe.pkcs7.detached');
  });
  it('changing signed PDF text while keeping a valid byte range REJECTS crypto',()=>{
    const pdf=Buffer.from(fixture.pdf);
    const ix=pdf.indexOf('PHASE37 SYNTHETIC CONTENT');
    assert.ok(ix>0);
    pdf[ix+10]=pdf[ix+10]===65?66:65;
    const path=join(fixture.parent,'tampered-content.pdf');
    writeFileSync(path,pdf,{mode:0o600});
    const r=inspect(input(path));safe(r);
    assert.equal(r.status,'CMS_CRYPTO_OR_SIGNER_REJECTED');
    assert.deepEqual(r.reasonCodes,
      ['CMS_SIGNATURE_INVALID_TIMEOUT_OR_UNBOUNDED_NATIVE_OUTPUT']);
  });
  it('appended unsigned PDF bytes are never allowed even if original CMS valid',()=>{
    const path=join(fixture.parent,'appended.pdf');
    writeFileSync(path,Buffer.concat([
      fixture.pdf,Buffer.from('\n% UNSIGNED REVISION\n')
    ]),{mode:0o600});
    const r=inspect(input(path));safe(r);
    assert.equal(r.status,'PDF_SIGNATURE_STRUCTURE_REJECTED');
    assert.deepEqual(r.reasonCodes,
      ['SIGNED_BYTE_RANGE_NOT_EXACT_CONTENTS_WITH_FULL_DOCUMENT_COVERAGE']);
  });
  it('nonzero CMS placeholder hex padding is rejected before crypto verifier',()=>{
    const pdf=Buffer.from(fixture.pdf);
    const end=pdf.lastIndexOf('> /M (D:');
    assert.ok(end>0);
    pdf[end-5]=49;
    const path=join(fixture.parent,'nonzero-cms-padding.pdf');
    writeFileSync(path,pdf,{mode:0o600});
    const r=inspect(input(path));safe(r);
    assert.equal(r.status,'PDF_SIGNATURE_STRUCTURE_REJECTED');
    assert.deepEqual(r.reasonCodes,
      ['CMS_NOT_SINGLE_DER_OR_NONZERO_PDF_PLACEHOLDER_PADDING']);
  });
  it('duplicated ByteRange fields, malformed ranges and unsupported SubFilter reject',()=>{
    const text=fixture.pdf.toString('latin1');
    const b=text.match(/\/ByteRange\s*\[[^\]]+\]/)![0];
    for(const {name,body} of [
      {name:'duplicate',body:text.replace('/Type /Sig','/Type /Sig '+b)},
      {name:'wrong-offset',body:text.replace(
        /\/ByteRange \[0 \d{12}/,'/ByteRange [0 999999999999')},
      {name:'subfilter',body:text.replace(
        'adbe.pkcs7.detached','adbe.pkcs7.sha1')}
    ]){
      const path=join(fixture.parent,'invalid-'+name+'.pdf');
      writeFileSync(path,Buffer.from(body,'latin1'),{mode:0o600});
      const r=inspect(input(path));safe(r);
      assert.equal(r.status,'PDF_SIGNATURE_STRUCTURE_REJECTED',name);
    }
  });
  it('real verified CMS signer from original PDF cannot be changed by detached certificate pin',()=>{
    const a=input(fixture.pdfPath,fixture.otherSignerDer);
    const r=inspect(a);safe(r);
    assert.equal(r.status,'CMS_CRYPTO_OR_SIGNER_REJECTED');
    assert.deepEqual(r.reasonCodes,[
      'ACTUAL_CMS_VERIFIED_SIGNER_DER_DISAGREES_WITH_PINNED_CERTIFICATE'
    ]);
  });
  it('independent original PDF hash, openssl binary and detached issuer pins fail closed',()=>{
    const badHash=input();
    badHash.pins.expectedOriginalPdfSha256='00'.repeat(32);
    assert.equal(inspect(badHash).status,'INVALID_EVIDENCE');
    const badTool=input();
    badTool.pins.expectedOpenSslBinarySha256='11'.repeat(32);
    assert.equal(inspect(badTool).status,'INVALID_EVIDENCE');
    const badIssuer=input();
    badIssuer.pins.expectedIssuerDerSha256='22'.repeat(32);
    assert.equal(inspect(badIssuer).status,'INVALID_EVIDENCE');
    const wrongApproval=input();
    wrongApproval.request.operatorAuthorization='MISSING' as
      'OWNER_APPROVED_OFFLINE_CMS_CRYPTO_ONLY';
    assert.equal(inspect(wrongApproval).status,'INVALID_EVIDENCE');
  });
  it('untrusted public permissions, symlink or non-allowlisted executable reject',()=>{
    const path=join(fixture.parent,'public-ecn.pdf');
    writeFileSync(path,fixture.pdf,{mode:0o644});
    assert.equal(inspect(input(path)).status,'INVALID_EVIDENCE');
    const sym=join(fixture.parent,'symlink-ecn.pdf');
    symlinkSync(fixture.pdfPath,sym);
    assert.equal(inspect(input(sym)).status,'INVALID_EVIDENCE');
    const bad=input();
    bad.request.opensslBinary='/tmp/openssl' as '/usr/bin/openssl';
    assert.equal(inspect(bad).status,'INVALID_EVIDENCE');
  });
  it('injected mock OpenSSL signer PEM is never accepted as actual CMS proof',()=>{
    const a=input();
    const pem=readFileSync(fixture.signerPemPath);
    let called=false;
    const runner:Phase37OpenSslRunner=(bin,args,ms)=>{
      called=true;
      assert.equal(bin,BIN);assert.equal(ms,5000);
      assert.ok(args.includes('-noverify'));
      assert.ok(args.includes('-verify_retcode'));
      assert.ok(!args.includes('-nosigs'));
      assert.ok(!args.includes('-no_content_verify'));
      assert.ok(!args.includes('-no_attr_verify'));
      return {exitCode:0,stdout:pem,
        stderr:Buffer.from('CMS Verification successful'),
        timedOut:false};
    };
    const r=inspect(a,runner);safe(r);
    assert.equal(called,true);
    assert.equal(r.status,'CMS_CRYPTO_OR_SIGNER_REJECTED');
    assert.deepEqual(r.reasonCodes,
      ['INJECTED_OPENSSL_OUTPUT_NOT_NATIVE_CRYPTOGRAPHIC_EVIDENCE']);
  });
  it('nonzero exit, timeout, malformed multi-cert outputs are rejected without leaking signer',()=>{
    const a=input();
    for(const mock of [
      {exitCode:4,stdout:new Uint8Array(),stderr:Buffer.from('SENSITIVE'),
        timedOut:false},
      {exitCode:null,stdout:new Uint8Array(),stderr:new Uint8Array(),
        timedOut:true},
      {exitCode:0,stdout:Buffer.concat([
        readFileSync(fixture.signerPemPath),
        readFileSync(fixture.signerPemPath)]),
        stderr:new Uint8Array(),timedOut:false}
    ]){
      const r=inspect(a,()=>mock);safe(r);
      assert.equal(r.status,'CMS_CRYPTO_OR_SIGNER_REJECTED');
      assert.equal(r.originalEmbeddedCmsSignatureCryptographicallyVerified,false);
    }
  });
});
