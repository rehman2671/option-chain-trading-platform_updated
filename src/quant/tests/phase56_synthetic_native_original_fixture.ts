import assert from 'node:assert/strict';
import {createHash,X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  auditPhase54OriginalPdfNativeCms,
  type Phase54Input,type Phase54IndependentPins,
  type Phase54PdfVerificationRequest
} from '../../server/engine/ema15m/adaptivePhase54OriginalPdfNativeCms.js';
import {hashPhase53Evidence,
  type Phase53Input,type Phase53IndependentPins,
  type Phase53DocumentRole
} from '../../server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.js';
import {makePhase53SyntheticSignedFixture}
  from './phase53_synthetic_signed_document_fixture.js';

const BIN='/usr/bin/openssl';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const roles:Phase53DocumentRole[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
const run=(args:string[])=>execFileSync(BIN,args,{
  stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:300000
});
function unsignedPdf(label:string):Buffer{
  const stream=Buffer.from('BT /F1 12 Tf 40 750 Td ('+label+') Tj ET','latin1');
  const placeholder='0'.repeat(20000);
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] /SigFlags 3 >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [7 0 R] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream.toString('latin1')+'\nendstream',
    '<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 000000000000 000000000000 000000000000] /Contents <'+placeholder+'> >>',
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /V 6 0 R /Rect [0 0 0 0] /P 3 0 R >>'
  ];
  let pdf='%PDF-1.7\n';
  const offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(pdf,'latin1'));
    pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const xref=Buffer.byteLength(pdf,'latin1');
  pdf+='xref\n0 8\n0000000000 65535 f \n';
  for(const off of offsets.slice(1))
    pdf+=String(off).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Root 1 0 R /Size 8 >>\nstartxref\n'+
    xref+'\n%%EOF\n';
  const start=pdf.indexOf('/Contents <');
  const lt=start+'/Contents '.length;
  const gt=pdf.indexOf('>',lt)+1;
  assert.ok(start>0&&lt>0&&gt>lt);
  const exact='/ByteRange [0 '+String(lt).padStart(12,'0')+
    ' '+String(gt).padStart(12,'0')+' '+
    String(pdf.length-gt).padStart(12,'0')+']';
  pdf=pdf.replace(
    '/ByteRange [0 000000000000 000000000000 000000000000]',exact);
  assert.equal(pdf.length,Buffer.byteLength(pdf,'latin1'));
  return Buffer.from(pdf,'latin1');
}
function signPdf(
  parent:string,role:string,cert:string,key:string
):Buffer{
  const unsigned=unsignedPdf('SYNTHETIC '+role.replace(/_/g,' '));
  const start=unsigned.indexOf(Buffer.from('/Contents <'));
  const lt=start+'/Contents '.length;
  const gt=unsigned.indexOf(0x3e,lt)+1;
  const signedContent=Buffer.concat([
    unsigned.subarray(0,lt),unsigned.subarray(gt)
  ]);
  const binary=join(parent,'to-sign-'+role+'.bin');
  const cmsPath=join(parent,'cms-'+role+'.der');
  writeFileSync(binary,signedContent,{mode:0o600});
  run(['cms','-sign','-binary','-in',binary,'-signer',cert,
    '-inkey',key,'-outform','DER','-out',cmsPath,'-md','sha256']);
  const cms=readFileSync(cmsPath);
  const middleLength=gt-lt-2;
  assert.ok(cms.length>256&&cms.length*2<middleLength);
  const hex=cms.toString('hex')+'0'.repeat(middleLength-cms.length*2);
  const pdf=Buffer.concat([
    unsigned.subarray(0,lt+1),Buffer.from(hex,'ascii'),
    unsigned.subarray(gt-1)
  ]);
  assert.equal(pdf.length,unsigned.length);
  return pdf;
}
export interface NativeRole {
  role:Phase53DocumentRole;
  bytes:Buffer;
  verification:Phase54PdfVerificationRequest;
  path:string;ca:string;crl:string;revokedCrl:string;
  ocsp:string;revokedOcsp:string;tsa:string;tsr:string;
  rootDer:Buffer;tsaDer:Buffer;
}
let parent='',docs:NativeRole[]=[];
export function preparePhase56NativeSources(){
  if(docs.length)return;
  parent=mkdtempSync(join(tmpdir(),'phase56-original-cms-'));
  chmodSync(parent,0o700);
  docs=roles.map((role,i)=>{
    const ca=join(parent,'ca-'+i+'.pem'),
      caKey=join(parent,'ca-'+i+'.key'),
      leaf=join(parent,'leaf-'+i+'.pem'),
      leafKey=join(parent,'leaf-'+i+'.key'),
      csr=join(parent,'leaf-'+i+'.csr'),
      caCfg=join(parent,'ca-'+i+'.cnf'),
      index=join(parent,'index-'+i+'.txt'),
      serial=join(parent,'serial-'+i+'.txt'),
      crlnumber=join(parent,'crlnumber-'+i+'.txt'),
      crl=join(parent,'good-'+i+'.crl.pem'),
      revokedCrl=join(parent,'revoked-'+i+'.crl.pem'),
      ocsp=join(parent,'good-'+i+'.ocsp.der'),
      revokedOcsp=join(parent,'revoked-'+i+'.ocsp.der'),
      tsaKey=join(parent,'tsa-'+i+'.key'),
      tsaCsr=join(parent,'tsa-'+i+'.csr'),
      tsa=join(parent,'tsa-'+i+'.pem'),
      tsaExt=join(parent,'tsa-'+i+'.ext'),
      tsaCfg=join(parent,'tsa-'+i+'.cnf'),
      tsaSerial=join(parent,'tsa-'+i+'.serial'),
      tsq=join(parent,'tsa-'+i+'.tsq'),
      tsr=join(parent,'tsa-'+i+'.tsr');
    run(['req','-newkey','rsa:2048','-x509','-nodes',
      '-keyout',caKey,'-out',ca,'-days','2',
      '-subj','/CN=SYNTHETIC PHASE54 UNTRUSTED CA '+i,
      '-addext','basicConstraints=critical,CA:TRUE',
      '-addext','keyUsage=critical,keyCertSign,cRLSign']);
    // A real local CA database is needed for signer CRL and OCSP CertID.
    const caLines=[
      '[ ca ]','default_ca=local','[ local ]',
      'dir='+parent,'database='+index,'serial='+serial,
      'crlnumber='+crlnumber,'new_certs_dir='+parent,
      'certificate='+ca,'private_key='+caKey,
      'default_md=sha256','default_days=2','default_crl_days=2',
      'policy=policy_any','x509_extensions=leaf','copy_extensions=none',
      'unique_subject=no','[ policy_any ]','commonName=supplied',
      '[ leaf ]','basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=emailProtection',
      'subjectKeyIdentifier=hash','authorityKeyIdentifier=keyid,issuer'
    ];
    writeFileSync(caCfg,caLines.join('\n')+'\n',{mode:0o600});
    writeFileSync(index,'',{mode:0o600});
    writeFileSync(serial,'1000\n',{mode:0o600});
    writeFileSync(crlnumber,'1000\n',{mode:0o600});
    run(['req','-newkey','rsa:2048','-nodes',
      '-keyout',leafKey,'-out',csr,
      '-subj','/CN=SYNTHETIC PHASE56 LOCAL SIGNER '+i]);
    run(['ca','-batch','-config',caCfg,
      '-in',csr,'-out',leaf,'-notext']);
    const bytes=signPdf(parent,role,leaf,leafKey);
    const path=join(parent,'original-'+i+'.pdf');
    writeFileSync(path,bytes,{mode:0o600});
    run(['ca','-gencrl','-config',caCfg,'-out',crl]);
    run(['ocsp','-index',index,'-rsigner',ca,
      '-rkey',caKey,'-CA',ca,'-issuer',ca,'-cert',leaf,
      '-respout',ocsp,'-ndays','2','-no_nonce']);
    // A separate synthetic TSA certificate signs EXACT PDF byte imprint.
    run(['req','-newkey','rsa:2048','-nodes','-keyout',tsaKey,
      '-out',tsaCsr,'-subj','/CN=SYNTHETIC PHASE56 FAKE TSA '+i]);
    writeFileSync(tsaExt,'basicConstraints=critical,CA:FALSE\n'+
      'keyUsage=critical,digitalSignature\n'+
      'extendedKeyUsage=critical,timeStamping\n',{mode:0o600});
    run(['x509','-req','-in',tsaCsr,'-CA',ca,'-CAkey',caKey,
      '-CAcreateserial','-out',tsa,'-days','2',
      '-sha256','-extfile',tsaExt]);
    const tsaLines=[
      '[ tsa ]','default_tsa=local','[ local ]',
      'serial='+tsaSerial,'signer_cert='+tsa,
      'signer_key='+tsaKey,'signer_digest=sha256','certs='+ca,
      'default_policy=1.2.3.4.5','other_policies=1.2.3.4.5',
      'digests=sha256','accuracy=secs:1',
      'ordering=no','ess_cert_id_chain=yes'
    ];
    writeFileSync(tsaCfg,tsaLines.join('\n')+'\n',{mode:0o600});
    writeFileSync(tsaSerial,'01\n',{mode:0o600});
    run(['ts','-query','-data',path,'-sha256','-cert','-out',tsq]);
    run(['ts','-reply','-config',tsaCfg,'-queryfile',tsq,'-out',tsr]);
    // Capture REVOCATION evidence after the unrevoked originals.
    run(['ca','-config',caCfg,'-revoke',leaf]);
    run(['ca','-gencrl','-config',caCfg,'-out',revokedCrl]);
    run(['ocsp','-index',index,'-rsigner',ca,
      '-rkey',caKey,'-CA',ca,'-issuer',ca,'-cert',leaf,
      '-respout',revokedOcsp,'-ndays','2','-no_nonce']);
    for(const file of [ca,leaf,crl,revokedCrl,ocsp,revokedOcsp,tsa,tsr])
      chmodSync(file,0o600);
    const signerDer=new X509Certificate(readFileSync(leaf)).raw;
    const issuerDer=new X509Certificate(readFileSync(ca)).raw;
    const evaluationAsOf=new Date().toISOString();
    const request:Phase54PdfVerificationRequest={
      role,
      request:{
        schemaVersion:'ADAPTIVE_V2_PHASE37_ORIGINAL_PDF_CMS_V1',
        source:'PRIVATE_ORIGINAL_PDF_UNVERIFIED',
        originalPdfPath:path,
        opensslBinary:BIN,timeoutMs:5000,
        operatorAuthorization:'OWNER_APPROVED_OFFLINE_CMS_CRYPTO_ONLY'
      },
      cmsPins:{
        schemaVersion:'INDEPENDENT_PHASE37_CMS_ORIGINAL_SOURCE_PINS_V1',
        expectedOriginalPdfSha256:hash(bytes),
        expectedOpenSslBinarySha256:hash(readFileSync(BIN)),
        expectedSignerDerSha256:hash(signerDer),
        expectedIssuerDerSha256:hash(issuerDer),
        expectedSubFilter:'adbe.pkcs7.detached'
      },
      detachedX509:{
        schemaVersion:'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1',
        source:'SEPARATELY_PROVISIONED_UNVERIFIED',
        signerCertificateDerBase64:signerDer.toString('base64'),
        issuerCertificateDerBase64:issuerDer.toString('base64'),
        evaluationAsOf,originalPdfSha256:hash(bytes)
      },
      detachedX509Pins:{
        schemaVersion:'INDEPENDENT_PHASE36_X509_PINS_V1',
        originalPdfSha256:hash(bytes),
        expectedSignerDerSha256:hash(signerDer),
        expectedIssuerDerSha256:hash(issuerDer),
        evaluationAsOf,
        expectedIssuerTrustModel:'EXTERNALLY_PINNED_SELF_SIGNED_CA_ONLY'
      }
    };
    return {role,bytes,verification:request,
      path,ca,crl,revokedCrl,ocsp,revokedOcsp,tsa,tsr,
      rootDer:issuerDer,
      tsaDer:new X509Certificate(readFileSync(tsa)).raw};
  });
}
export function cleanupPhase56NativeSources(){
  if(parent)rmSync(parent,{recursive:true,force:true});
  parent='';docs=[];
}
export function makePhase56NativeOriginalFixture(){
  preparePhase56NativeSources();
  const f=makePhase53SyntheticSignedFixture();
  for(const doc of f.originalDocuments){
    const original=docs.find(x=>x.role===doc.role)!;
    doc.bytes=Buffer.from(original.bytes);
    f.input.receipts.find(x=>x.role===doc.role)!
      .externalEvidenceDocumentSha256=hash(original.bytes);
  }
  f.resign(); // synthetic test keys sign EXACT newly supplied PDF digest.
  const phase53:Phase53Input={
    schemaVersion:'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1',
    source:'OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED',
    phase52:f.input,phase52Pins:f.pins,
    documents:f.originalDocuments
  };
  const phase53Pins:Phase53IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE53_DOCUMENT_BYTE_CUSTODY_PINS_V1',
    expectedPhase52InputSha256:hashPhase53Evidence(f.input),
    expectedPhase52PinsSha256:hashPhase53Evidence(f.pins),
    expectedDatasetId:f.historical.provenance.datasetId,
    expectedDocumentSha256ByRole:{
      ORIGINAL_OPTION_L1_REVIEWER:hash(docs[0].bytes),
      SESSION_CALENDAR_REVIEWER:hash(docs[1].bytes)
    },
    expectedDocumentByteLengthByRole:{
      ORIGINAL_OPTION_L1_REVIEWER:docs[0].bytes.length,
      SESSION_CALENDAR_REVIEWER:docs[1].bytes.length
    },
    expectedDeclaredOosSessions:2,
    expectedOriginalOptionL1QuoteRows:f.historical.executionQuotes.length,
    expectedFullOosArmHorizonAttempts:24
  };
  const input:Phase54Input={
    schemaVersion:'ADAPTIVE_PHASE54_SOURCE_PDF_NATIVE_CMS_JOIN_V1',
    source:'OFFLINE_PRIVATE_OPERATOR_PDF_AND_X509_UNVERIFIED',
    phase53,phase53Pins,
    pdfDocuments:docs.map(x=>({
      role:x.role,
      request:{...x.verification.request},
      cmsPins:{...x.verification.cmsPins},
      detachedX509:{...x.verification.detachedX509},
      detachedX509Pins:{...x.verification.detachedX509Pins}
    }))
  };
  const pins:Phase54IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE54_TWO_ORIGINAL_PDF_CMS_PINS_V1',
    expectedPhase53InputSha256:hashPhase53Evidence(phase53),
    expectedPhase53PinsSha256:hashPhase53Evidence(phase53Pins),
    expectedPdfSha256ByRole:{
      ORIGINAL_OPTION_L1_REVIEWER:hash(docs[0].bytes),
      SESSION_CALENDAR_REVIEWER:hash(docs[1].bytes)
    },
    expectedSignerDerSha256ByRole:{
      ORIGINAL_OPTION_L1_REVIEWER:docs[0].verification.cmsPins.expectedSignerDerSha256,
      SESSION_CALENDAR_REVIEWER:docs[1].verification.cmsPins.expectedSignerDerSha256
    },
    expectedIssuerDerSha256ByRole:{
      ORIGINAL_OPTION_L1_REVIEWER:docs[0].verification.cmsPins.expectedIssuerDerSha256,
      SESSION_CALENDAR_REVIEWER:docs[1].verification.cmsPins.expectedIssuerDerSha256
    },
    expectedNativeOpenSslBinarySha256:hash(readFileSync(BIN)),
    expectedDeclaredOosSessions:2,
    expectedFullOosArmHorizonAttempts:24
  };
  const repin=()=>{
    pins.expectedPhase53InputSha256=hashPhase53Evidence(phase53);
    pins.expectedPhase53PinsSha256=hashPhase53Evidence(phase53Pins);
  };
  return {f,input,pins,repin,nativeDocs:docs};
}
