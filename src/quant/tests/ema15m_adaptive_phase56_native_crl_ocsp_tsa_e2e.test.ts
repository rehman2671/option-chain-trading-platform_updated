/**
 * Phase56 TRUE native end-to-end synthetic integration:
 * two original CMS-signed PDFs, two independently generated CRLs,
 * signed OCSP (good+revoked), RFC3161 signed original PDF imprints.
 *
 * Certificates are FAKE and operator generated. Zero live data/broker calls.
 */
import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {
  auditPhase55NativeTwoSourceRevocationTsa,
  hashPhase55Evidence,
  type Phase55Input,type Phase55IndependentPins,
  type Phase55SourceRevocationEvidence
} from '../../server/engine/ema15m/adaptivePhase55NativeRevocationTsa.js';
import type {Phase53DocumentRole}
  from '../../server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.js';
import {
  makePhase56NativeOriginalFixture,
  preparePhase56NativeSources,cleanupPhase56NativeSources
} from './phase56_synthetic_native_original_fixture.js';

const hash=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
const roles:Phase53DocumentRole[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
before(preparePhase56NativeSources);
after(cleanupPhase56NativeSources);
function fixture(){
  const f=makePhase56NativeOriginalFixture();
  const reviewAsOf=new Date().toISOString();
  const revocation:Phase55SourceRevocationEvidence[]=
    f.nativeDocs.map(doc=>{
      const original=f.input.pdfDocuments.find(x=>x.role===doc.role)!;
      const crlPins=original.cmsPins;
      const rootPemSha=hash(readFileSync(doc.ca));
      return {
        role:doc.role,
        crlRequest:{
          schemaVersion:'ADAPTIVE_V2_PHASE38_SIGNED_CRL_CHAIN_V1',
          source:'OPERATOR_PRIVATE_UNVERIFIED',
          originalPdfPath:doc.path,
          privateRootCaPemPath:doc.ca,
          privateSignedCrlPemPath:doc.crl,
          opensslBinary:'/usr/bin/openssl',
          assessmentAsOf:reviewAsOf,maxCrlAgeHours:24,timeoutMs:5000,
          operatorAuthorization:'MANUAL_OFFLINE_PINNED_CRL_REVIEW'
        },
        crlPins:{
          schemaVersion:'INDEPENDENT_PHASE38_CRL_ROOT_SOURCE_PINS_V1',
          expectedOriginalPdfSha256:crlPins.expectedOriginalPdfSha256,
          expectedCmsSignerDerSha256:crlPins.expectedSignerDerSha256,
          expectedRootCaDerSha256:hash(doc.rootDer),
          expectedRootCaPemSha256:rootPemSha,
          expectedSignedCrlPemSha256:hash(readFileSync(doc.crl)),
          expectedOpenSslBinarySha256:crlPins.expectedOpenSslBinarySha256,
          expectedAssessmentAsOf:reviewAsOf
        },
        ocspRequest:{
          schemaVersion:'ADAPTIVE_V2_PHASE39_OFFLINE_OCSP_TSA_V1',
          source:'OPERATOR_PRIVATE_UNVERIFIED',
          originalPdfPath:doc.path,caPemPath:doc.ca,
          signedOcspDerPath:doc.ocsp,
          signedTimestampResponseDerPath:doc.tsr,
          tsaSignerCertificatePemPath:doc.tsa,
          opensslBinary:'/usr/bin/openssl',
          assessmentAsOf:reviewAsOf,
          maximumOcspAgeSeconds:3600,timeoutMs:5000,
          operatorAuthorization:'MANUAL_PINNED_OFFLINE_OCSP_RFC3161_ONLY'
        },
        ocspPins:{
          schemaVersion:'INDEPENDENT_PHASE39_OCSP_TSA_PINS_V1',
          expectedOriginalPdfSha256:crlPins.expectedOriginalPdfSha256,
          expectedCmsSignerDerSha256:crlPins.expectedSignerDerSha256,
          expectedCaPemSha256:rootPemSha,
          expectedCaDerSha256:hash(doc.rootDer),
          expectedOcspDerSha256:hash(readFileSync(doc.ocsp)),
          expectedTimestampResponseDerSha256:hash(readFileSync(doc.tsr)),
          expectedTsaSignerDerSha256:hash(doc.tsaDer),
          expectedOpenSslBinarySha256:crlPins.expectedOpenSslBinarySha256,
          expectedAssessmentAsOf:reviewAsOf
        }
      };
    });
  const input:Phase55Input={
    schemaVersion:'ADAPTIVE_PHASE55_TWO_SOURCE_OFFLINE_REVOCATION_TSA_V1',
    source:'OPERATOR_PRIVATE_OFFLINE_CRL_OCSP_TSA_UNVERIFIED',
    phase54:f.input,phase54Pins:f.pins,revocation
  };
  const byRole=(pick:(i:number)=>string):
    Record<Phase53DocumentRole,string>=>{
    return Object.fromEntries(roles.map((role,i)=>[role,pick(i)])) as
      Record<Phase53DocumentRole,string>;
  };
  const pins:Phase55IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE55_TWO_SOURCE_CRL_OCSP_TSA_PINS_V1',
    expectedPhase54InputSha256:hashPhase55Evidence(input.phase54),
    expectedPhase54PinsSha256:hashPhase55Evidence(input.phase54Pins),
    expectedReviewAsOf:reviewAsOf,
    expectedRootCaDerSha256ByRole:byRole(i=>
      revocation[i].crlPins.expectedRootCaDerSha256),
    expectedSignedCrlSha256ByRole:byRole(i=>
      revocation[i].crlPins.expectedSignedCrlPemSha256),
    expectedOcspSha256ByRole:byRole(i=>
      revocation[i].ocspPins.expectedOcspDerSha256),
    expectedRfc3161ResponseSha256ByRole:byRole(i=>
      revocation[i].ocspPins.expectedTimestampResponseDerSha256),
    expectedTsaSignerDerSha256ByRole:byRole(i=>
      revocation[i].ocspPins.expectedTsaSignerDerSha256),
    expectedOosSessionCount:2,expectedFullOosAttemptCount:24
  };
  const repinPhase54=()=>{
    pins.expectedPhase54InputSha256=hashPhase55Evidence(input.phase54);
    pins.expectedPhase54PinsSha256=hashPhase55Evidence(input.phase54Pins);
  };
  return {f,input,pins,repinPhase54};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase55NativeTwoSourceRevocationTsa(f.input,f.pins);
function alwaysUnsafe(r:ReturnType<typeof audit>){
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
  assert.equal(JSON.stringify(r).includes('BEGIN CERTIFICATE'),false);
  assert.equal(JSON.stringify(r).includes('NSE_FO|'),false);
}
function rejected(f:F,reason:string,
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=audit(f);alwaysUnsafe(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase56 two-document native CMS CRL OCSP RFC3161 OOS E2E',()=>{
  it('genuine native crypto for TWO fake-issuer signed source PDFs and complete original 24 OOS attempts stays NOT tradable',()=>{
    const f=fixture(),r=audit(f);alwaysUnsafe(r);
    assert.equal(r.status,
      'TWO_NATIVE_OFFLINE_REVOCATION_AND_TSA_CHECKS_CONSISTENT_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.datasetSynthetic,true);
    assert.equal(r.expectedOosSessionCount,2);
    assert.equal(r.fullOosAttemptDenominator,24);
    assert.equal(r.originalPdfCmsDocumentsRevalidated,2);
    assert.equal(r.nativeSignedCrlChainsRevalidated,2);
    assert.equal(r.nativeOfflineOcspAndRfc3161Revalidated,2);
    assert.equal(r.completeOriginalSourceRoles,2);
    assert.ok(r.warnings.some(x=>x.includes('FAKE_SELF_SIGNED_ROOT')));
  });
  it('genuine revoked CRL, re-pinned by operator, still fails native verification',()=>{
    const f=fixture(),e=f.input.revocation[0],
      p=f.f.nativeDocs[0].revokedCrl;
    e.crlRequest.privateSignedCrlPemPath=p;
    e.crlPins.expectedSignedCrlPemSha256=hash(readFileSync(p));
    f.pins.expectedSignedCrlSha256ByRole[e.role]=
      e.crlPins.expectedSignedCrlPemSha256;
    const r=rejected(f,'NATIVE_SIGNED_CRL_OR_PINNED_CA_CHAIN_REJECTED');
    assert.equal(r.nativeSignedCrlChainsRevalidated,0);
  });
  it('genuine issuer-signed revoked OCSP, re-pinned by operator, still fails',()=>{
    const f=fixture(),e=f.input.revocation[0],
      p=f.f.nativeDocs[0].revokedOcsp;
    e.ocspRequest.signedOcspDerPath=p;
    e.ocspPins.expectedOcspDerSha256=hash(readFileSync(p));
    f.pins.expectedOcspSha256ByRole[e.role]=
      e.ocspPins.expectedOcspDerSha256;
    rejected(f,'NATIVE_SIGNED_OCSP_OR_RFC3161_PDF_IMPRINT_REJECTED');
  });
  it('valid time-stamp of DIFFERENT original document, even if hash re-pinned, does not verify this PDF',()=>{
    const f=fixture(),e=f.input.revocation[0],
      p=f.f.nativeDocs[1].tsr;
    e.ocspRequest.signedTimestampResponseDerPath=p;
    e.ocspPins.expectedTimestampResponseDerSha256=hash(readFileSync(p));
    f.pins.expectedRfc3161ResponseSha256ByRole[e.role]=
      e.ocspPins.expectedTimestampResponseDerSha256;
    rejected(f,'NATIVE_SIGNED_OCSP_OR_RFC3161_PDF_IMPRINT_REJECTED');
  });
  it('stale signed OCSP at independently pinned future assessment time is rejected',()=>{
    const f=fixture();
    const later=new Date(Date.parse(f.pins.expectedReviewAsOf)+
      2*3600_000).toISOString();
    f.pins.expectedReviewAsOf=later;
    for(const e of f.input.revocation){
      e.crlRequest.assessmentAsOf=later;
      e.crlPins.expectedAssessmentAsOf=later;
      e.ocspRequest.assessmentAsOf=later;
      e.ocspPins.expectedAssessmentAsOf=later;
      e.ocspRequest.maximumOcspAgeSeconds=60;
    }
    rejected(f,'NATIVE_SIGNED_OCSP_OR_RFC3161_PDF_IMPRINT_REJECTED');
  });
  it('on-disk unsigned PDF mutation fails Phase54 despite good original signed receipt hashes',()=>{
    const f=fixture(),doc=f.f.nativeDocs[0],
      old=readFileSync(doc.path);
    try{
      const mutated=Buffer.from(old);
      mutated[300]^=1;
      writeFileSync(doc.path,mutated,{mode:0o600});
      rejected(f,'PHASE54_ORIGINAL_NATIVE_CMS_OR_OOS_REAUDIT_INCOMPLETE');
    }finally{
      writeFileSync(doc.path,old,{mode:0o600});
    }
  });
  it('deleting one OOS trading day and re-signing original receipts cannot produce a full two-fold proof',()=>{
    const f=fixture(),source=f.f.f,
      missing=source.historical.policy.folds[1].testStart;
    source.historical.decisions=source.historical.decisions.filter(d=>
      d.sessionDate!==missing);
    source.historical.provenance.expectedSessions=
      source.historical.provenance.expectedSessions.filter(d=>d!==missing);
    source.repinSource();source.resign();
    f.f.input.phase53Pins.expectedPhase52InputSha256=
      hashPhase55Evidence(source.input);
    f.f.input.phase53Pins.expectedPhase52PinsSha256=
      hashPhase55Evidence(source.pins);
    f.f.repin();f.repinPhase54();
    rejected(f,'PHASE54_ORIGINAL_NATIVE_CMS_OR_OOS_REAUDIT_INCOMPLETE');
  });
  it('missing source CRL file fails even with legitimate original PDFs and receipts',()=>{
    const f=fixture();
    f.input.revocation[0].crlRequest.privateSignedCrlPemPath=
      '/owner-private/does-not-exist.crl';
    rejected(f,'NATIVE_SIGNED_CRL_OR_PINNED_CA_CHAIN_REJECTED');
  });
});
