/**
 * Adaptive Swing v2 Phase55 — OFFLINE exact original signed PDFs + native
 * CRL and OCSP/RFC3161 provenance join, one independent pinned role at a time.
 *
 * Re-runs Phase54 -> Phase53 -> Phase52 -> Phase51 -> Phase50 -> Phase8,
 * then re-runs native Phase37, Phase38 and Phase39 OpenSSL checks. Nothing
 * can substitute a supplied "success" report for actual original evidence.
 *
 * CRITICAL: a real OpenSSL result under OPERATOR-PINNED self-signed CA or
 * timestamp signer is NOT independent real-world NSE/BSE/vendor trust,
 * source L1 licensing, strategy truth, broker stop ACK or live readiness.
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import {
  auditPhase54OriginalPdfNativeCms,
  type Phase54Input,type Phase54IndependentPins,
  type Phase54Report
} from './adaptivePhase54OriginalPdfNativeCms.js';
import {
  auditPhase37OriginalPdfCmsSigner
} from './adaptiveUpstoxPhase37OriginalCmsBinding.js';
import {
  auditPhase38OfflineSignedCrl,
  type Phase38OfflineCrlRequest,type Phase38IndependentCrlPins
} from './adaptiveUpstoxPhase38SignedCrlTrustGate.js';
import {
  auditPhase39OfflineOcspAndTsa,
  type Phase39PrivateRequest,type Phase39IndependentPins
} from './adaptiveUpstoxPhase39OfflineOcspTsa.js';
import type {Phase53DocumentRole}
  from './adaptivePhase53OriginalDocumentBytes.js';

const ROLES:Phase53DocumentRole[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
const SHA=/^[0-9a-f]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const digest=(v:unknown):string=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
const same=(a:unknown,b:unknown):boolean=>
  typeof a==='string'&&typeof b==='string'&&
  SHA.test(a)&&SHA.test(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
export const hashPhase55Evidence=digest;

export interface Phase55SourceRevocationEvidence{
  role:Phase53DocumentRole;
  crlRequest:Phase38OfflineCrlRequest;
  crlPins:Phase38IndependentCrlPins;
  ocspRequest:Phase39PrivateRequest;
  ocspPins:Phase39IndependentPins;
}
export interface Phase55Input{
  schemaVersion:'ADAPTIVE_PHASE55_TWO_SOURCE_OFFLINE_REVOCATION_TSA_V1';
  source:'OPERATOR_PRIVATE_OFFLINE_CRL_OCSP_TSA_UNVERIFIED';
  phase54:Phase54Input;
  phase54Pins:Phase54IndependentPins;
  revocation:Phase55SourceRevocationEvidence[];
}
export interface Phase55IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE55_TWO_SOURCE_CRL_OCSP_TSA_PINS_V1';
  expectedPhase54InputSha256:string;
  expectedPhase54PinsSha256:string;
  expectedReviewAsOf:string;
  expectedRootCaDerSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedSignedCrlSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedOcspSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedRfc3161ResponseSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedTsaSignerDerSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedOosSessionCount:number;
  expectedFullOosAttemptCount:number;
}
export interface Phase55Report{
  mode:'OFFLINE_TWO_SOURCE_REAL_NATIVE_CRL_OCSP_RFC3161_JOIN';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'TWO_NATIVE_OFFLINE_REVOCATION_AND_TSA_CHECKS_CONSISTENT_UNVERIFIED';
  reasonCodes:string[];
  phase54Status:Phase54Report['status']|null;
  datasetSynthetic:boolean|null;
  expectedOosSessionCount:number;
  fullOosAttemptDenominator:number;
  originalPdfCmsDocumentsRevalidated:number;
  nativeSignedCrlChainsRevalidated:number;
  nativeOfflineOcspAndRfc3161Revalidated:number;
  completeOriginalSourceRoles:number;
  independentIssuerIdentityAndEnrollmentVerified:false;
  genuinelyTrustedIssuerCaVerified:false;
  actualOnlineRevocationAtCurrentTimeVerified:false;
  independentlyTrustedTsaIdentityOrClockVerified:false;
  originalOptionL1SourceAndLicenseIndependentlyVerified:false;
  actualStrategySourceAvailableAtAuthenticated:false;
  untouchedOosOptionProfitabilityProven:false;
  brokerNrmlStopAckOrOvernightProtectionVerified:false;
  productionSafe:false;
  executionAuthorized:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'NATIVE_OPENSSL_CRL_OCSP_TSA_CRYPTO_UNDER_OPERATOR_SUPPLIED_CA_ONLY',
  'FAKE_SELF_SIGNED_ROOT_CAN_MAKE_ALL_LOCAL_NATIVE_CHECKS_GREEN',
  'AS_OF_TIME_IS_OPERATOR_ASSERTED_NOT_CURRENT_OR_TRUSTED_TIMESTAMP',
  'RFC3161_TOKEN_BINDS_EXACT_PDF_BYTES_NOT_THE_TRUTH_OF_MARKET_DATA',
  'NO_INDEPENDENT_NSE_BSE_OR_VENDOR_CA_ENROLLMENT_OR_HISTORICAL_LICENSE_PROOF',
  'NO_ONLINE_OCSP_FRESHNESS_PROOF_AFTER_THE_SOURCE_REVIEW_INSTANT',
  'NO_REAL_BROKER_STOP_GTT_EXCHANGE_ACK_OVERNIGHT_ORDER_PROTECTION',
  'NO_LIVE_NRML_ORDERS_OR_FORCED_15_15_POSITIONAL_EXIT'
];
const empty=():Phase55Report=>({
  mode:'OFFLINE_TWO_SOURCE_REAL_NATIVE_CRL_OCSP_RFC3161_JOIN',
  status:'INVALID_EVIDENCE',reasonCodes:[],phase54Status:null,
  datasetSynthetic:null,expectedOosSessionCount:0,
  fullOosAttemptDenominator:0,
  originalPdfCmsDocumentsRevalidated:0,
  nativeSignedCrlChainsRevalidated:0,
  nativeOfflineOcspAndRfc3161Revalidated:0,
  completeOriginalSourceRoles:0,
  independentIssuerIdentityAndEnrollmentVerified:false,
  genuinelyTrustedIssuerCaVerified:false,
  actualOnlineRevocationAtCurrentTimeVerified:false,
  independentlyTrustedTsaIdentityOrClockVerified:false,
  originalOptionL1SourceAndLicenseIndependentlyVerified:false,
  actualStrategySourceAvailableAtAuthenticated:false,
  untouchedOosOptionProfitabilityProven:false,
  brokerNrmlStopAckOrOvernightProtectionVerified:false,
  productionSafe:false,executionAuthorized:false,
  nativeOrderInstruction:null,warnings:WARN
});
const fail=(code:string,status:Phase55Report['status']='INVALID_EVIDENCE',
  part?:Partial<Phase55Report>):Phase55Report=>({
  ...empty(),...part,status,reasonCodes:[code]
});
function validPins(p:Phase55IndependentPins):boolean{
  if(!p||p.schemaVersion!==
    'INDEPENDENT_PHASE55_TWO_SOURCE_CRL_OCSP_TSA_PINS_V1'||
    !same(p.expectedPhase54InputSha256,p.expectedPhase54InputSha256)||
    !same(p.expectedPhase54PinsSha256,p.expectedPhase54PinsSha256)||
    typeof p.expectedReviewAsOf!=='string'||
    !ISO.test(p.expectedReviewAsOf)||
    !Number.isFinite(Date.parse(p.expectedReviewAsOf))||
    !Number.isSafeInteger(p.expectedOosSessionCount)||
    p.expectedOosSessionCount<2||p.expectedOosSessionCount>100000||
    p.expectedFullOosAttemptCount!==p.expectedOosSessionCount*12)
    return false;
  return [
    p.expectedRootCaDerSha256ByRole,
    p.expectedSignedCrlSha256ByRole,
    p.expectedOcspSha256ByRole,
    p.expectedRfc3161ResponseSha256ByRole,
    p.expectedTsaSignerDerSha256ByRole
  ].every(group=>!!group&&Object.keys(group).length===2&&
    ROLES.every(role=>typeof group[role]==='string'&&
      SHA.test(group[role])));
}
function checkScope(
  e:Phase55SourceRevocationEvidence,
  original:Phase54Input['pdfDocuments'][number],
  pins:Phase55IndependentPins
):boolean{
  const role=e.role,cr=e.crlRequest,cp=e.crlPins,
    or=e.ocspRequest,op=e.ocspPins;
  return !!cr&&!!cp&&!!or&&!!op&&
    cr.schemaVersion==='ADAPTIVE_V2_PHASE38_SIGNED_CRL_CHAIN_V1'&&
    cp.schemaVersion==='INDEPENDENT_PHASE38_CRL_ROOT_SOURCE_PINS_V1'&&
    or.schemaVersion==='ADAPTIVE_V2_PHASE39_OFFLINE_OCSP_TSA_V1'&&
    op.schemaVersion==='INDEPENDENT_PHASE39_OCSP_TSA_PINS_V1'&&
    cr.originalPdfPath===original.request.originalPdfPath&&
    or.originalPdfPath===original.request.originalPdfPath&&
    cr.privateRootCaPemPath===or.caPemPath&&
    cr.opensslBinary===original.request.opensslBinary&&
    or.opensslBinary===original.request.opensslBinary&&
    cr.assessmentAsOf===pins.expectedReviewAsOf&&
    or.assessmentAsOf===pins.expectedReviewAsOf&&
    cp.expectedAssessmentAsOf===pins.expectedReviewAsOf&&
    op.expectedAssessmentAsOf===pins.expectedReviewAsOf&&
    same(cp.expectedOriginalPdfSha256,
      original.cmsPins.expectedOriginalPdfSha256)&&
    same(op.expectedOriginalPdfSha256,
      original.cmsPins.expectedOriginalPdfSha256)&&
    same(cp.expectedCmsSignerDerSha256,
      original.cmsPins.expectedSignerDerSha256)&&
    same(op.expectedCmsSignerDerSha256,
      original.cmsPins.expectedSignerDerSha256)&&
    same(cp.expectedRootCaDerSha256,
      original.cmsPins.expectedIssuerDerSha256)&&
    same(op.expectedCaDerSha256,
      original.cmsPins.expectedIssuerDerSha256)&&
    same(cp.expectedRootCaPemSha256,op.expectedCaPemSha256)&&
    same(cp.expectedOpenSslBinarySha256,
      original.cmsPins.expectedOpenSslBinarySha256)&&
    same(op.expectedOpenSslBinarySha256,
      original.cmsPins.expectedOpenSslBinarySha256)&&
    same(cp.expectedRootCaDerSha256,
      pins.expectedRootCaDerSha256ByRole[role])&&
    same(cp.expectedSignedCrlPemSha256,
      pins.expectedSignedCrlSha256ByRole[role])&&
    same(op.expectedOcspDerSha256,
      pins.expectedOcspSha256ByRole[role])&&
    same(op.expectedTimestampResponseDerSha256,
      pins.expectedRfc3161ResponseSha256ByRole[role])&&
    same(op.expectedTsaSignerDerSha256,
      pins.expectedTsaSignerDerSha256ByRole[role]);
}
export function auditPhase55NativeTwoSourceRevocationTsa(
  input:Phase55Input,pins:Phase55IndependentPins
):Phase55Report{
  if(!input||input.schemaVersion!==
    'ADAPTIVE_PHASE55_TWO_SOURCE_OFFLINE_REVOCATION_TSA_V1'||
    input.source!=='OPERATOR_PRIVATE_OFFLINE_CRL_OCSP_TSA_UNVERIFIED'||
    !input.phase54||!input.phase54Pins||!validPins(pins)||
    !same(digest(input.phase54),pins.expectedPhase54InputSha256)||
    !same(digest(input.phase54Pins),pins.expectedPhase54PinsSha256)||
    !Array.isArray(input.revocation)||input.revocation.length!==2)
    return fail('PINNED_TWO_SOURCE_REVOCATION_DOSSIER_INVALID');
  const refs=new Set<Phase53DocumentRole>();
  for(const e of input.revocation){
    if(!e||!ROLES.includes(e.role)||refs.has(e.role))
      return fail('DUPLICATE_OR_MISSING_REVOCATION_REVIEW_ROLE');
    refs.add(e.role);
    const original=input.phase54.pdfDocuments?.find(x=>x?.role===e.role);
    if(!original||!checkScope(e,original,pins))
      return fail('NATIVE_REVOCATION_SOURCE_CERTIFICATE_OR_CLOCK_PIN_MISMATCH');
  }
  let base:Phase54Report;
  try{base=auditPhase54OriginalPdfNativeCms(
    input.phase54,input.phase54Pins);}
  catch{
    return fail('PHASE54_ORIGINAL_NATIVE_PDF_REAUDIT_EXCEPTION',
      'INCOMPLETE_EVIDENCE');
  }
  const part:Partial<Phase55Report>={
    phase54Status:base.status,
    datasetSynthetic:base.syntheticDataset,
    expectedOosSessionCount:base.declaredOosSessions,
    fullOosAttemptDenominator:base.fullOosArmHorizonAttempts
  };
  if(base.status!==
    'TWO_ORIGINAL_PDF_CMS_CRYPTO_VALID_ISSUERS_UNVERIFIED'||
    !base.exactOriginalDocumentBytesJoined||
    !base.nativeCmsCryptoAndSignedByteRangesVerified||
    base.originalPdfDocumentsWithNativeCmsVerified!==2||
    base.independentlyPinnedDistinctCmsSignerKeys!==2||
    base.declaredOosSessions!==pins.expectedOosSessionCount||
    base.fullOosArmHorizonAttempts!==pins.expectedFullOosAttemptCount)
    return fail('PHASE54_ORIGINAL_NATIVE_CMS_OR_OOS_REAUDIT_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',part);
  let cms=0,crl=0,ocsp=0;
  try{
  for(const role of ROLES){
    const original=input.phase54.pdfDocuments.find(x=>x.role===role)!;
    const evidence=input.revocation.find(x=>x.role===role)!;
    // Re-run actual Phase37; do NOT accept a caller-supplied positive report.
    const signed=auditPhase37OriginalPdfCmsSigner(
      original.request,original.cmsPins,
      original.detachedX509,original.detachedX509Pins);
    if(signed.status!=='ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED'||
      signed.actuallyRanNativeOpenSsl!==true||
      signed.originalEmbeddedCmsSignatureCryptographicallyVerified!==true||
      signed.pdfCmsSignerCryptographicallyLinkedToPinnedDer!==true||
      signed.executionAuthorized!==false||
      signed.productionSafe!==false||
      signed.nativeOrderInstruction!==null)
      return fail('NATIVE_ORIGINAL_PDF_CMS_RECHECK_FAILED',
        'INCOMPLETE_EVIDENCE',{...part,
          originalPdfCmsDocumentsRevalidated:cms});
    cms++;
    const signedCrl=auditPhase38OfflineSignedCrl(
      evidence.crlRequest,evidence.crlPins,
      signed,original.detachedX509);
    if(signedCrl.status!==
      'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED'||
      !signedCrl.actuallyRanNativeOpenSsl||
      !signedCrl.signedCrlAcceptedAtClaimedAsOf||
      !signedCrl.localIssuerCertificateChainVerified||
      !signedCrl.offlineCrlFreshAtClaimedAsOf||
      signedCrl.executionAuthorized!==false||
      signedCrl.productionSafe!==false||
      signedCrl.brokerAuthenticated!==false)
      return fail('NATIVE_SIGNED_CRL_OR_PINNED_CA_CHAIN_REJECTED',
        'INCOMPLETE_EVIDENCE',{...part,
          originalPdfCmsDocumentsRevalidated:cms,
          nativeSignedCrlChainsRevalidated:crl});
    crl++;
    const timestamp=auditPhase39OfflineOcspAndTsa(
      evidence.ocspRequest,evidence.ocspPins,
      signedCrl,original.detachedX509);
    if(timestamp.status!==
      'OFFLINE_OCSP_AND_PDF_TIMESTAMP_CONSISTENT_UNVERIFIED'||
      !timestamp.actualNativeOpenSslRan||
      !timestamp.offlineOcspGoodForSignerAtAssertedTime||
      !timestamp.rfc3161TokenVerifiedForExactOriginalPdf||
      timestamp.executionAuthorized!==false||
      timestamp.productionSafe!==false||
      timestamp.brokerAuthenticated!==false)
      return fail('NATIVE_SIGNED_OCSP_OR_RFC3161_PDF_IMPRINT_REJECTED',
        'INCOMPLETE_EVIDENCE',{...part,
          originalPdfCmsDocumentsRevalidated:cms,
          nativeSignedCrlChainsRevalidated:crl,
          nativeOfflineOcspAndRfc3161Revalidated:ocsp});
    ocsp++;
  }
  }catch{
    return fail('NATIVE_CMS_CRL_OCSP_RFC3161_RECHECK_EXCEPTION',
      'INCOMPLETE_EVIDENCE',{...part,
        originalPdfCmsDocumentsRevalidated:cms,
        nativeSignedCrlChainsRevalidated:crl,
        nativeOfflineOcspAndRfc3161Revalidated:ocsp});
  }
  return {...empty(),...part,
    originalPdfCmsDocumentsRevalidated:cms,
    nativeSignedCrlChainsRevalidated:crl,
    nativeOfflineOcspAndRfc3161Revalidated:ocsp,
    completeOriginalSourceRoles:2,
    status:'TWO_NATIVE_OFFLINE_REVOCATION_AND_TSA_CHECKS_CONSISTENT_UNVERIFIED'};
}
