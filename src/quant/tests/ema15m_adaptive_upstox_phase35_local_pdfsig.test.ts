import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,
  mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  parsePhase35PdfsigText,
  inspectPhase35LocalPdfSignature,
  type Phase35PdfsigRequest,
  type Phase35PdfsigRunner
} from '../../server/engine/ema15m/adaptiveUpstoxPhase35LocalPdfsig.js';
import {
  reviewPhase35SignatureAndEcnDossier
} from '../../server/engine/ema15m/adaptiveUpstoxPhase35SignatureEcnDossier.js';
import type {
  Phase34ExternalValidationInput,
  Phase34IndependentVerifierPins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase34ExternalEcnReceiptGate.js';

const PDF=Buffer.from('%PDF-1.7\nSYNTHETIC UNSIGNED FIXTURE\n%%EOF\n');
const sha=(b:Uint8Array)=>createHash('sha256').update(b)
  .digest('hex');
const sample=()=>[
  'Digital Signature Info of: /private/never-print-SYNTHETIC_UCC.pdf',
  'Signature #1:',
  '  - Signature Field Name: Signature1',
  '  - Signer Certificate Common Name: PRIVATE SYNTHETIC SIGNER',
  '  - Signer full Distinguished Name: CN=PRIVATE SYNTHETIC SIGNER,C=IN',
  '  - Signing Time: Nov 18 2026 14:50:00 UTC',
  '  - Signing Hash Algorithm: SHA-256',
  '  - Signature Type: ETSI.CAdES.detached',
  '  - Signed Ranges: [0 - 10], [20 - '+PDF.length+']',
  '  - Total document signed',
  '  - Signature Validation: Signature is Valid.',
  '  - Certificate Validation: Certificate is Trusted.',
  ''
].join('\n');
const good=()=>parsePhase35PdfsigText(sample(),PDF.length);
const unsafe=(v:string,reason:string)=>{
  const r=parsePhase35PdfsigText(v,PDF.length);
  assert.equal(r.accepted,false);
  assert.equal(r.reasonCode,reason);
};
function privateFixture():{
  dir:string;pdf:string;nss:string;cleanup:()=>void;
}{
  const dir=mkdtempSync(join(tmpdir(),'phase35-pdfsig-'));
  chmodSync(dir,0o700);
  const nss=join(dir,'nss');
  mkdirSync(nss,{mode:0o700});
  const pdf=join(dir,'original-ecn.pdf');
  writeFileSync(pdf,PDF,{mode:0o600});
  writeFileSync(join(nss,'cert9.db'),Buffer.alloc(128,65),
    {mode:0o600});
  return {dir,pdf,nss,cleanup:()=>rmSync(dir,{
    recursive:true,force:true})};
}
function request(fixture:ReturnType<typeof privateFixture>):
  Phase35PdfsigRequest{
  return {
    schemaVersion:'ADAPTIVE_V2_PHASE35_PDFSIG_LOCAL_PRECHECK_V1',
    originalPdfPath:fixture.pdf,trustedNssDbDirectory:fixture.nss,
    executablePath:'/usr/bin/pdfsig',
    expectedOriginalPdfSha256:sha(PDF),
    expectedPdfsigBinarySha256:existsSync('/usr/bin/pdfsig')?
      sha(readFileSync('/usr/bin/pdfsig')):'0'.repeat(64),
    expectedNssCert9DbSha256:sha(readFileSync(
      join(fixture.nss,'cert9.db'))),
    timeoutMs:3000,
    operatorAuthorization:'OPERATOR_APPROVED_LOCAL_PDFSIG_NO_ONLINE_OCSP'
  };
}
function safety(report:ReturnType<typeof inspectPhase35LocalPdfSignature>){
  assert.equal(report.executionAuthorized,false);
  assert.equal(report.productionSafe,false);
  assert.equal(report.brokerAuthenticated,false);
  assert.equal(report.brokerStopInstalled,false);
  assert.equal(report.protectedOvernight,false);
  assert.equal(report.nativeOrderInstruction,null);
  assert.equal(report.onlineOcspChecked,false);
  assert.equal(report.crlFreshnessProven,false);
  assert.equal(report.independentlyTrustedTimestamp,false);
  assert.equal(report.brokerCertificateFingerprintAuthenticated,false);
  assert.equal(report.pdfAnnexureRowsExtractedAndCompared,false);
  assert.equal(report.issuerAuthenticated,false);
  const text=JSON.stringify(report);
  assert.equal(text.includes('PRIVATE SYNTHETIC SIGNER'),false);
  assert.equal(text.includes('never-print-SYNTHETIC_UCC'),false);
}
describe('Phase35 Poppler pdfsig strict C-locale signature fields',()=>{
  it('accepts only structurally complete full-document SHA256 and NSS-trusted text',()=>{
    const v=good();
    assert.equal(v.accepted,true);
    assert.equal(v.cryptoValid,true);
    assert.equal(v.entireDocumentSigned,true);
    assert.equal(v.nssChainTrusted,true);
  });
  it('rejects an unsigned document or no signature fields',()=>{
    unsafe('Digital Signature Info of: /private/x.pdf\nNo signatures',
      'MISSING_MULTIPLE_OR_UNKNOWN_PDF_SIGNATURE_FIELDS');
    unsafe('not a pdfsig response','UNRECOGNIZED_OR_OVERSIZED_PDFSIG_STDOUT');
  });
  it('rejects multiple signatures even when first reports valid',()=>{
    unsafe(sample()+'Signature #2:\n  - Signature Validation: Signature is Valid.\n',
      'MISSING_MULTIPLE_OR_UNKNOWN_PDF_SIGNATURE_FIELDS');
  });
  it('rejects NOT fully signed and signed ranges with appended bytes',()=>{
    unsafe(sample().replace('- Total document signed',
      '- Not total document signed'),
    'PDF_NOT_FULLY_SIGNED_OR_HAS_UNSIGNED_APPEND');
    unsafe(sample().replace(
      '[20 - '+PDF.length+']','[20 - '+(PDF.length-1)+']'),
    'PDF_NOT_FULLY_SIGNED_OR_HAS_UNSIGNED_APPEND');
  });
  it('rejects weak hash or unknown CMS algorithm',()=>{
    unsafe(sample().replace('SHA-256','SHA-1'),
      'WEAK_OR_UNKNOWN_SIGNATURE_HASH_OR_CMS_FORMAT');
    unsafe(sample().replace('ETSI.CAdES.detached','UNKNOWN.CMS'),
      'WEAK_OR_UNKNOWN_SIGNATURE_HASH_OR_CMS_FORMAT');
  });
  it('rejects valid crypto but untrusted or missing certificate status',()=>{
    unsafe(sample().replace('Certificate is Trusted.',
      "Certificate issuer isn't Trusted."),
    'LOCAL_NSS_CERTIFICATE_CHAIN_NOT_TRUSTED');
    unsafe(sample().replace('- Certificate Validation: Certificate is Trusted.',
      ''),'INCOMPLETE_AMBIGUOUS_PDFSIG_SIGNATURE_FIELDS');
  });
  it('rejects invalid crypto, ambiguous repeated fields and ranges',()=>{
    unsafe(sample().replace('Signature is Valid.',
      'Signature is Invalid.'),
    'PDF_CRYPTOGRAPHIC_SIGNATURE_NOT_VALID');
    unsafe(sample()+'  - Signature Validation: Signature is Valid.\n',
    'INCOMPLETE_AMBIGUOUS_PDFSIG_SIGNATURE_FIELDS');
    unsafe(sample().replace('Signed Ranges: [0 - 10]',
      'Signed Ranges: [5 - 10]'),
    'UNKNOWN_OR_MALFORMED_SIGNED_BYTE_RANGES');
  });
});
describe('Phase35 bounded process preflight never promotes mocked text',()=>{
  it('rejects unapproved operator action before executing any tool',()=>{
    const fx=privateFixture();
    try{
      const r=request(fx);
      r.operatorAuthorization='MISSING' as
        'OPERATOR_APPROVED_LOCAL_PDFSIG_NO_ONLINE_OCSP';
      let calls=0;
      const tool:Phase35PdfsigRunner=()=>{calls++;return {
        exitCode:0,stdout:sample(),stderr:'',timedOut:false
      };};
      const out=inspectPhase35LocalPdfSignature(r,tool);
      safety(out);
      assert.equal(out.status,'INVALID_PRECONDITION');
      assert.equal(calls,0);
    }finally{fx.cleanup();}
  });
  it('rejects mismatched original PDF, binary or NSS pins without subprocess',()=>{
    const fx=privateFixture();
    try{
      for(const field of [
        'expectedOriginalPdfSha256','expectedPdfsigBinarySha256',
        'expectedNssCert9DbSha256'
      ] as const){
        const r=request(fx);
        r[field]='ff'.repeat(32);
        let calls=0;
        const out=inspectPhase35LocalPdfSignature(r,()=>{
          calls++;throw Error('SHOULD NEVER RUN');
        });
        safety(out);
        assert.equal(out.status,'INVALID_PRECONDITION');
        assert.equal(calls,0);
      }
    }finally{fx.cleanup();}
  });
  it('rejects insecure 0755 private PDF folder or 0644 ECN',()=>{
    const fx=privateFixture();
    try{
      chmodSync(fx.dir,0o755);
      let r=inspectPhase35LocalPdfSignature(request(fx),()=>{
        throw Error('MUST NOT EXECUTE');
      });
      safety(r);assert.equal(r.status,'INVALID_PRECONDITION');
      chmodSync(fx.dir,0o700);
      chmodSync(fx.pdf,0o644);
      r=inspectPhase35LocalPdfSignature(request(fx),()=>{
        throw Error('MUST NOT EXECUTE');
      });
      safety(r);assert.equal(r.status,'INVALID_PRECONDITION');
    }finally{fx.cleanup();}
  });
  it('invokes ONLY the no-OCSP, explicit NSS, no-shell verification arguments',()=>{
    const fx=privateFixture();
    try{
      let calls=0;
      const mocked:Phase35PdfsigRunner=(binary,args,timeout)=>{
        calls++;
        assert.equal(binary,'/usr/bin/pdfsig');
        assert.deepEqual(args,[
          '-no-ocsp','-nssdir','sql:'+fx.nss,fx.pdf
        ]);
        assert.equal(timeout,3000);
        return {exitCode:0,stdout:sample(),stderr:'',timedOut:false};
      };
      const out=inspectPhase35LocalPdfSignature(request(fx),mocked);
      safety(out);
      assert.equal(calls,existsSync('/usr/bin/pdfsig')?1:0);
      assert.notEqual(out.status,
        'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED');
      if(calls)assert.deepEqual(out.reasonCodes,
        ['INJECTED_PDFSIG_TEXT_IS_ONLY_A_PARSER_TEST']);
    }finally{fx.cleanup();}
  });
  it('nonzero tool exit or malicious stdout never yields positive status',()=>{
    const fx=privateFixture();
    try{
      for(const status of [1,2]){
        const out=inspectPhase35LocalPdfSignature(request(fx),()=>({
          exitCode:status,stdout:sample(),stderr:'SENSITIVE PRIVATE SIGNER',
          timedOut:false
        }));
        safety(out);
        assert.equal(out.status,'PDFSIG_PROCESS_OR_SIGNATURE_REJECTED');
      }
      const bad=inspectPhase35LocalPdfSignature(request(fx),()=>({
        exitCode:0,stdout:sample()+'Signature #2:\n',stderr:'',
        timedOut:false
      }));
      safety(bad);
      assert.equal(bad.status,'PDFSIG_PROCESS_OR_SIGNATURE_REJECTED');
    }finally{fx.cleanup();}
  });
  it('real Poppler is invoked ONLY on a deliberately unsigned fixture when installed',()=>{
    if(!existsSync('/usr/bin/pdfsig'))return;
    const fx=privateFixture();
    try{
      const out=inspectPhase35LocalPdfSignature(request(fx));
      safety(out);
      assert.equal(out.localToolActuallyExecuted,true);
      assert.equal(out.status,'PDFSIG_PROCESS_OR_SIGNATURE_REJECTED');
      assert.notEqual(out.reasonCodes.length,0);
    }finally{fx.cleanup();}
  });
  it('Phase35 cannot upgrade an unverified local signature or absent external dossier',()=>{
    const fx=privateFixture();
    try{
      const local=inspectPhase35LocalPdfSignature(request(fx),()=>({
        exitCode:0,stdout:sample(),stderr:'',timedOut:false
      }));
      const r=reviewPhase35SignatureAndEcnDossier(
        local,{} as Phase34ExternalValidationInput,
        {} as Phase34IndependentVerifierPins);
      assert.equal(r.status,'INVALID_EVIDENCE');
      assert.equal(r.brokerAuthenticated,false);
      assert.equal(r.executionAuthorized,false);
      assert.equal(r.brokerStopInstalled,false);
      assert.equal(r.nativeOrderInstruction,null);
    }finally{fx.cleanup();}
  });
});
