import {describe,it} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {
  auditPhase55NativeTwoSourceRevocationTsa,hashPhase55Evidence,
  type Phase55Input,type Phase55IndependentPins,
  type Phase55SourceRevocationEvidence
} from '../../server/engine/ema15m/adaptivePhase55NativeRevocationTsa.js';
import {
  hashPhase53Evidence,
  type Phase53Input,type Phase53IndependentPins,type Phase53DocumentRole
} from '../../server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.js';
import {
  type Phase54Input,type Phase54IndependentPins
} from '../../server/engine/ema15m/adaptivePhase54OriginalPdfNativeCms.js';
import {makePhase53SyntheticSignedFixture}
  from './phase53_synthetic_signed_document_fixture.js';

const SHA=(v:string)=>hashPhase55Evidence(v);
const ROLES:Phase53DocumentRole[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
function fixture(){
  const f=makePhase53SyntheticSignedFixture();
  const h=f.historical,documents=f.originalDocuments;
  const p53:Phase53Input={
    schemaVersion:'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1',
    source:'OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED',
    phase52:f.input,phase52Pins:f.pins,
    documents
  };
  const docSha=()=>Object.fromEntries(documents.map(x=>
    [x.role,hashBytes(x.bytes)])) as Record<Phase53DocumentRole,string>;
  const docLength=()=>Object.fromEntries(documents.map(x=>
    [x.role,x.bytes.length])) as Record<Phase53DocumentRole,number>;
  const p53pins:Phase53IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE53_DOCUMENT_BYTE_CUSTODY_PINS_V1',
    expectedPhase52InputSha256:hashPhase53Evidence(f.input),
    expectedPhase52PinsSha256:hashPhase53Evidence(f.pins),
    expectedDocumentSha256ByRole:docSha(),
    expectedDocumentByteLengthByRole:docLength(),
    expectedDatasetId:h.provenance.datasetId,
    expectedDeclaredOosSessions:2,
    expectedOriginalOptionL1QuoteRows:h.executionQuotes.length,
    expectedFullOosArmHorizonAttempts:24
  };
  const nativeBinSha=SHA('fake-openssl-integration-preflight-only');
  const time='2026-11-19T00:00:00Z';
  const cms=p53.documents.map((d,i)=>{
    const expectedOriginalPdfSha256=hashBytes(d.bytes);
    const expectedSignerDerSha256=SHA('test-signer-'+i);
    const expectedIssuerDerSha256=SHA('test-root-'+i);
    const path='/owner-private/unavailable-original-'+i+'.pdf';
    return {
      role:d.role,
      request:{
        schemaVersion:'ADAPTIVE_V2_PHASE37_ORIGINAL_PDF_CMS_V1' as const,
        source:'PRIVATE_ORIGINAL_PDF_UNVERIFIED' as const,
        originalPdfPath:path,
        opensslBinary:'/usr/bin/openssl' as const,
        timeoutMs:5000,
        operatorAuthorization:'OWNER_APPROVED_OFFLINE_CMS_CRYPTO_ONLY' as const
      },
      cmsPins:{
        schemaVersion:'INDEPENDENT_PHASE37_CMS_ORIGINAL_SOURCE_PINS_V1' as const,
        expectedOriginalPdfSha256,expectedOpenSslBinarySha256:nativeBinSha,
        expectedSignerDerSha256,expectedIssuerDerSha256,
        expectedSubFilter:'adbe.pkcs7.detached' as const
      },
      detachedX509:{
        schemaVersion:'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1' as const,
        source:'SEPARATELY_PROVISIONED_UNVERIFIED' as const,
        signerCertificateDerBase64:Buffer.from('fake-signer-'+i).toString('base64'),
        issuerCertificateDerBase64:Buffer.from('fake-root-'+i).toString('base64'),
        evaluationAsOf:time,originalPdfSha256:expectedOriginalPdfSha256
      },
      detachedX509Pins:{
        schemaVersion:'INDEPENDENT_PHASE36_X509_PINS_V1' as const,
        originalPdfSha256:expectedOriginalPdfSha256,
        expectedSignerDerSha256,expectedIssuerDerSha256,
        evaluationAsOf:time,
        expectedIssuerTrustModel:'EXTERNALLY_PINNED_SELF_SIGNED_CA_ONLY' as const
      }
    };
  });
  const p54:Phase54Input={
    schemaVersion:'ADAPTIVE_PHASE54_SOURCE_PDF_NATIVE_CMS_JOIN_V1',
    source:'OFFLINE_PRIVATE_OPERATOR_PDF_AND_X509_UNVERIFIED',
    phase53:p53,phase53Pins:p53pins,
    pdfDocuments:cms
  };
  const byRole=(pick:(i:number)=>string)=>
    Object.fromEntries(ROLES.map((role,i)=>[role,pick(i)]))
      as Record<Phase53DocumentRole,string>;
  const p54pins:Phase54IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE54_TWO_ORIGINAL_PDF_CMS_PINS_V1',
    expectedPhase53InputSha256:hashPhase53Evidence(p53),
    expectedPhase53PinsSha256:hashPhase53Evidence(p53pins),
    expectedPdfSha256ByRole:byRole(i=>cms[i].cmsPins.expectedOriginalPdfSha256),
    expectedSignerDerSha256ByRole:byRole(i=>
      cms[i].cmsPins.expectedSignerDerSha256),
    expectedIssuerDerSha256ByRole:byRole(i=>
      cms[i].cmsPins.expectedIssuerDerSha256),
    expectedNativeOpenSslBinarySha256:nativeBinSha,
    expectedDeclaredOosSessions:2,expectedFullOosArmHorizonAttempts:24
  };
  const evidence:Phase55SourceRevocationEvidence[]=cms.map((item,i)=>{
    const original=item.request.originalPdfPath;
    const root='/owner-private/unavailable-root-'+i+'.pem';
    const crl='/owner-private/unavailable-crl-'+i+'.pem';
    const ocsp='/owner-private/unavailable-ocsp-'+i+'.der';
    const tsr='/owner-private/unavailable-tsr-'+i+'.der';
    const tsa='/owner-private/unavailable-tsa-'+i+'.pem';
    const rootPemSha=SHA('root-pem-'+i);
    return {
      role:item.role,
      crlRequest:{
        schemaVersion:'ADAPTIVE_V2_PHASE38_SIGNED_CRL_CHAIN_V1',
        source:'OPERATOR_PRIVATE_UNVERIFIED',
        originalPdfPath:original,
        privateRootCaPemPath:root,
        privateSignedCrlPemPath:crl,
        opensslBinary:'/usr/bin/openssl',
        assessmentAsOf:time,maxCrlAgeHours:24,timeoutMs:5000,
        operatorAuthorization:'MANUAL_OFFLINE_PINNED_CRL_REVIEW'
      },
      crlPins:{
        schemaVersion:'INDEPENDENT_PHASE38_CRL_ROOT_SOURCE_PINS_V1',
        expectedOriginalPdfSha256:item.cmsPins.expectedOriginalPdfSha256,
        expectedCmsSignerDerSha256:item.cmsPins.expectedSignerDerSha256,
        expectedRootCaDerSha256:item.cmsPins.expectedIssuerDerSha256,
        expectedRootCaPemSha256:rootPemSha,
        expectedSignedCrlPemSha256:SHA('signed-crl-'+i),
        expectedOpenSslBinarySha256:nativeBinSha,
        expectedAssessmentAsOf:time
      },
      ocspRequest:{
        schemaVersion:'ADAPTIVE_V2_PHASE39_OFFLINE_OCSP_TSA_V1',
        source:'OPERATOR_PRIVATE_UNVERIFIED',
        originalPdfPath:original,caPemPath:root,
        signedOcspDerPath:ocsp,signedTimestampResponseDerPath:tsr,
        tsaSignerCertificatePemPath:tsa,
        opensslBinary:'/usr/bin/openssl',
        assessmentAsOf:time,maximumOcspAgeSeconds:3600,
        timeoutMs:5000,
        operatorAuthorization:'MANUAL_PINNED_OFFLINE_OCSP_RFC3161_ONLY'
      },
      ocspPins:{
        schemaVersion:'INDEPENDENT_PHASE39_OCSP_TSA_PINS_V1',
        expectedOriginalPdfSha256:item.cmsPins.expectedOriginalPdfSha256,
        expectedCmsSignerDerSha256:item.cmsPins.expectedSignerDerSha256,
        expectedCaPemSha256:rootPemSha,
        expectedCaDerSha256:item.cmsPins.expectedIssuerDerSha256,
        expectedOcspDerSha256:SHA('signed-ocsp-'+i),
        expectedTimestampResponseDerSha256:SHA('signed-rfc3161-'+i),
        expectedTsaSignerDerSha256:SHA('tsa-leaf-'+i),
        expectedOpenSslBinarySha256:nativeBinSha,
        expectedAssessmentAsOf:time
      }
    };
  });
  const input:Phase55Input={
    schemaVersion:'ADAPTIVE_PHASE55_TWO_SOURCE_OFFLINE_REVOCATION_TSA_V1',
    source:'OPERATOR_PRIVATE_OFFLINE_CRL_OCSP_TSA_UNVERIFIED',
    phase54:p54,phase54Pins:p54pins,revocation:evidence
  };
  const pins:Phase55IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE55_TWO_SOURCE_CRL_OCSP_TSA_PINS_V1',
    expectedPhase54InputSha256:hashPhase55Evidence(p54),
    expectedPhase54PinsSha256:hashPhase55Evidence(p54pins),
    expectedReviewAsOf:time,
    expectedRootCaDerSha256ByRole:byRole(i=>
      evidence[i].crlPins.expectedRootCaDerSha256),
    expectedSignedCrlSha256ByRole:byRole(i=>
      evidence[i].crlPins.expectedSignedCrlPemSha256),
    expectedOcspSha256ByRole:byRole(i=>
      evidence[i].ocspPins.expectedOcspDerSha256),
    expectedRfc3161ResponseSha256ByRole:byRole(i=>
      evidence[i].ocspPins.expectedTimestampResponseDerSha256),
    expectedTsaSignerDerSha256ByRole:byRole(i=>
      evidence[i].ocspPins.expectedTsaSignerDerSha256),
    expectedOosSessionCount:2,expectedFullOosAttemptCount:24
  };
  return {input,pins,p53,p53pins,p54,p54pins,evidence,f,
    repinOuter:()=>{
      pins.expectedPhase54InputSha256=hashPhase55Evidence(p54);
      pins.expectedPhase54PinsSha256=hashPhase55Evidence(p54pins);
    }};
}
function hashBytes(b:Uint8Array):string{
  return createHash('sha256').update(b).digest('hex');
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase55NativeTwoSourceRevocationTsa(f.input,f.pins);
function staysOff(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.independentIssuerIdentityAndEnrollmentVerified,false);
  assert.equal(r.genuinelyTrustedIssuerCaVerified,false);
  assert.equal(r.actualOnlineRevocationAtCurrentTimeVerified,false);
  assert.equal(r.independentlyTrustedTsaIdentityOrClockVerified,false);
  assert.equal(r.originalOptionL1SourceAndLicenseIndependentlyVerified,false);
  assert.equal(r.actualStrategySourceAvailableAtAuthenticated,false);
  assert.equal(r.untouchedOosOptionProfitabilityProven,false);
  assert.equal(r.brokerNrmlStopAckOrOvernightProtectionVerified,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('BEGIN CERTIFICATE'));
}
function rejected(f:F,reason:string,status:'INVALID_EVIDENCE'|
 'INCOMPLETE_EVIDENCE'='INVALID_EVIDENCE'){
 const r=audit(f);staysOff(r);
 assert.equal(r.status,status,JSON.stringify(r));
 assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
 return r;
}
describe('Phase55 two-source native CRL OCSP RFC3161 evidence scope preflight',()=>{
  it('cannot upgrade operator-pinned synthetic dossier with no original signed PDFs',()=>{
    const f=fixture();
    const r=rejected(f,'PHASE54_ORIGINAL_NATIVE_CMS_OR_OOS_REAUDIT_INCOMPLETE',
      'INCOMPLETE_EVIDENCE');
    assert.equal(r.nativeSignedCrlChainsRevalidated,0);
    assert.equal(r.nativeOfflineOcspAndRfc3161Revalidated,0);
    assert.equal(r.fullOosAttemptDenominator,24);
    assert.equal(r.expectedOosSessionCount,2);
  });
  it('tampered nested historical dossier after independent SHA lock fails at outer boundary',()=>{
    const f=fixture();
    f.f.historical.executionQuotes[0].bid+=1;
    rejected(f,'PINNED_TWO_SOURCE_REVOCATION_DOSSIER_INVALID');
  });
  it('missing second CRL/OCSP source role fails closed',()=>{
    const f=fixture();f.input.revocation.pop();
    rejected(f,'PINNED_TWO_SOURCE_REVOCATION_DOSSIER_INVALID');
  });
  it('duplicated reviewer role cannot claim both source documents',()=>{
    const f=fixture();
    f.input.revocation[1].role=f.input.revocation[0].role;
    rejected(f,'DUPLICATE_OR_MISSING_REVOCATION_REVIEW_ROLE');
  });
  it('CRL PDF path must be same original CMS source file path',()=>{
    const f=fixture();
    f.evidence[0].crlRequest.originalPdfPath='/owner-private/another.pdf';
    rejected(f,'NATIVE_REVOCATION_SOURCE_CERTIFICATE_OR_CLOCK_PIN_MISMATCH');
  });
  it('OCSP must verify same PDF, root PEM and pinned OpenSSL executable',()=>{
    const f=fixture();
    f.evidence[0].ocspRequest.caPemPath='/owner-private/wrong.pem';
    rejected(f,'NATIVE_REVOCATION_SOURCE_CERTIFICATE_OR_CLOCK_PIN_MISMATCH');
  });
  it('operator cannot shift assessmentAsOf after original independent lock',()=>{
    const f=fixture();
    f.evidence[1].ocspRequest.assessmentAsOf=
      '2026-11-19T20:00:00Z';
    rejected(f,'NATIVE_REVOCATION_SOURCE_CERTIFICATE_OR_CLOCK_PIN_MISMATCH');
  });
  it('same CA root DER as original CMS signer issuer is mandatory',()=>{
    const f=fixture();
    f.evidence[0].crlPins.expectedRootCaDerSha256='aa'.repeat(32);
    rejected(f,'NATIVE_REVOCATION_SOURCE_CERTIFICATE_OR_CLOCK_PIN_MISMATCH');
  });
  it('revocation and RFC3161 native evidence hash remains separately pinned',()=>{
    const f=fixture();
    f.evidence[1].ocspPins.expectedTimestampResponseDerSha256='bb'.repeat(32);
    rejected(f,'NATIVE_REVOCATION_SOURCE_CERTIFICATE_OR_CLOCK_PIN_MISMATCH');
  });
  it('OCSP signer certificate must match original PDF CMS signer',()=>{
    const f=fixture();
    f.evidence[1].ocspPins.expectedCmsSignerDerSha256='aa'.repeat(32);
    rejected(f,'NATIVE_REVOCATION_SOURCE_CERTIFICATE_OR_CLOCK_PIN_MISMATCH');
  });
  it('independently fixed declared OOS attempt count cannot be reduced',()=>{
    const f=fixture();
    f.pins.expectedFullOosAttemptCount=12;
    rejected(f,'PINNED_TWO_SOURCE_REVOCATION_DOSSIER_INVALID');
  });
  it('declared external trusted CA is NEVER made true by structural pins',()=>{
    const f=fixture(),r=audit(f);staysOff(r);
    assert.ok(r.warnings.some(x=>x.includes('FAKE_SELF_SIGNED_ROOT')));
  });
});
