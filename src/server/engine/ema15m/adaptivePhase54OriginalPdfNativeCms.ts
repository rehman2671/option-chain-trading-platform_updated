/**
 * Phase54: manually authorized, OFFLINE original-document PDF CMS crypto join.
 * Reuses Phase37's real native OpenSSL verifier; never trusts a supplied
 * "native verification passed" report or a mock runner.
 *
 * IMPORTANT: Phase37's one-hop self-signed, operator-pinned issuer is NOT
 * a genuinely authenticated NSE/BSE/vendor CA chain. No order, stop, GTT,
 * market API, network fetch or production activation occurs here.
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import {
  auditPhase53OriginalDocumentByteCustody,
  hashPhase53Evidence,
  type Phase53Input,type Phase53IndependentPins,
  type Phase53DocumentRole,type Phase53Report
} from './adaptivePhase53OriginalDocumentBytes.js';
import {
  auditPhase37OriginalPdfCmsSigner,
  type Phase37CmsRequest,type Phase37IndependentCmsPins,
  type Phase37CmsAuditReport
} from './adaptiveUpstoxPhase37OriginalCmsBinding.js';
import type {
  Phase36DetachedCertificateInput,
  Phase36IndependentCertificatePins
} from './adaptiveUpstoxPhase36DetachedSignerPins.js';

const ROLES:Phase53DocumentRole[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
const SHA=/^[a-f0-9]{64}$/;
const sha=(b:Uint8Array):string=>
  createHash('sha256').update(b).digest('hex');
const same=(a:unknown,b:unknown):boolean=>
  typeof a==='string'&&typeof b==='string'&&
  SHA.test(a)&&SHA.test(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
export interface Phase54PdfVerificationRequest{
  role:Phase53DocumentRole;
  request:Phase37CmsRequest;
  cmsPins:Phase37IndependentCmsPins;
  detachedX509:Phase36DetachedCertificateInput;
  detachedX509Pins:Phase36IndependentCertificatePins;
}
export interface Phase54Input{
  schemaVersion:'ADAPTIVE_PHASE54_SOURCE_PDF_NATIVE_CMS_JOIN_V1';
  source:'OFFLINE_PRIVATE_OPERATOR_PDF_AND_X509_UNVERIFIED';
  phase53:Phase53Input;
  phase53Pins:Phase53IndependentPins;
  pdfDocuments:Phase54PdfVerificationRequest[];
}
export interface Phase54IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE54_TWO_ORIGINAL_PDF_CMS_PINS_V1';
  expectedPhase53InputSha256:string;
  expectedPhase53PinsSha256:string;
  expectedPdfSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedSignerDerSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedIssuerDerSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedNativeOpenSslBinarySha256:string;
  expectedDeclaredOosSessions:number;
  expectedFullOosArmHorizonAttempts:number;
}
export interface Phase54Report{
  mode:'OFFLINE_TWO_ORIGINAL_PDF_NATIVE_CMS_SIGNER_CUSTODY';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'TWO_ORIGINAL_PDF_CMS_CRYPTO_VALID_ISSUERS_UNVERIFIED';
  reasonCodes:string[];
  phase53Status:Phase53Report['status']|null;
  syntheticDataset:boolean|null;
  originalPdfDocumentsWithNativeCmsVerified:number;
  independentlyPinnedDistinctCmsSignerKeys:number;
  declaredOosSessions:number;
  fullOosArmHorizonAttempts:number;
  exactOriginalDocumentBytesJoined:boolean;
  nativeCmsCryptoAndSignedByteRangesVerified:boolean;
  // Phase37 native OpenSSL does verify CMS, but deliberately uses -noverify:
  independentRealWorldIssuerIdentityVerified:false;
  independentlyTrustedIssuerCertificateChainVerified:false;
  revocationAndTrustedTimestampVerified:false;
  issuerApprovedDocumentSemanticsVerified:false;
  licensedOriginalOptionL1IndependentlyAuthenticated:false;
  originalMarketSourceAvailabilityIndependentlyVerified:false;
  realisticOosProfitabilityProven:false;
  brokerNativeNrmlStopOrGttAckVerified:false;
  overnightRiskProtected:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'NATIVE_PHASE37_USES_OPENSSL_CMS_NOVERIFY_ONLY_CRYPTOGRAPHIC_DOCUMENT_BINDING',
  'TWO_OPERATOR_PINNED_CERTIFICATES_DO_NOT_ESTABLISH_GENUINE_ISSUER_IDENTITY',
  'PHASE37_SINGLE_PDF_SIGNATURE_SUBSET_MAY_REJECT_COMPLEX_REAL_PDFS',
  'PDF_CMS_SIGNATURE_DOES_NOT_AUTHENTICATE_CONTENT_OR_VENDOR_LICENSE_RIGHTS',
  'LOCAL_SELF_SIGNED_ROOT_CAN_BE_ATTACKER_CONTROLLED_AND_CANNOT_PROVE_NSE_BSE',
  'CURRENT_OCSP_CRL_TIME_AND_INDEPENDENT_TRUST_ANCHOR_STILL_UNVERIFIED',
  'RACE_FREE_FILESYSTEM_SNAPSHOT_AND_NO_NETWORK_EGRESS_REQUIRE_OS_ISOLATION',
  'NO_REAL_BROKER_NATIVE_STOP_ACK_GTT_NRML_ORDERS_OR_FORCED_15_15_EXIT'
];
const blank=():Phase54Report=>({
  mode:'OFFLINE_TWO_ORIGINAL_PDF_NATIVE_CMS_SIGNER_CUSTODY',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase53Status:null,syntheticDataset:null,
  originalPdfDocumentsWithNativeCmsVerified:0,
  independentlyPinnedDistinctCmsSignerKeys:0,
  declaredOosSessions:0,fullOosArmHorizonAttempts:0,
  exactOriginalDocumentBytesJoined:false,
  nativeCmsCryptoAndSignedByteRangesVerified:false,
  independentRealWorldIssuerIdentityVerified:false,
  independentlyTrustedIssuerCertificateChainVerified:false,
  revocationAndTrustedTimestampVerified:false,
  issuerApprovedDocumentSemanticsVerified:false,
  licensedOriginalOptionL1IndependentlyAuthenticated:false,
  originalMarketSourceAvailabilityIndependentlyVerified:false,
  realisticOosProfitabilityProven:false,
  brokerNativeNrmlStopOrGttAckVerified:false,
  overnightRiskProtected:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const fail=(reason:string,status:Phase54Report['status']='INVALID_EVIDENCE',
  part?:Partial<Phase54Report>):Phase54Report=>({
    ...blank(),...part,status,reasonCodes:[reason]
  });
function validPins(p:Phase54IndependentPins):boolean{
  return !!p&&p.schemaVersion===
    'INDEPENDENT_PHASE54_TWO_ORIGINAL_PDF_CMS_PINS_V1'&&
    [
      p.expectedPhase53InputSha256,p.expectedPhase53PinsSha256,
      p.expectedNativeOpenSslBinarySha256
    ].every(x=>typeof x==='string'&&SHA.test(x))&&
    !!p.expectedPdfSha256ByRole&&
    !!p.expectedSignerDerSha256ByRole&&
    !!p.expectedIssuerDerSha256ByRole&&
    [p.expectedPdfSha256ByRole,p.expectedSignerDerSha256ByRole,
      p.expectedIssuerDerSha256ByRole].every(x=>
      Object.keys(x).length===2&&
      ROLES.every(r=>typeof x[r]==='string'&&SHA.test(x[r])))&&
    typeof p.expectedDeclaredOosSessions==='number'&&
    Number.isSafeInteger(p.expectedDeclaredOosSessions)&&
    p.expectedDeclaredOosSessions>=2&&
    p.expectedDeclaredOosSessions<=100000&&
    p.expectedFullOosArmHorizonAttempts===p.expectedDeclaredOosSessions*12;
}
export function auditPhase54OriginalPdfNativeCms(
  input:Phase54Input,pins:Phase54IndependentPins
):Phase54Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE54_SOURCE_PDF_NATIVE_CMS_JOIN_V1'||
    input.source!=='OFFLINE_PRIVATE_OPERATOR_PDF_AND_X509_UNVERIFIED'||
    !input.phase53||!input.phase53Pins||!validPins(pins)||
    !same(hashPhase53Evidence(input.phase53),pins.expectedPhase53InputSha256)||
    !same(hashPhase53Evidence(input.phase53Pins),pins.expectedPhase53PinsSha256)||
    !Array.isArray(input.pdfDocuments)||input.pdfDocuments.length!==2)
    return fail('PHASE54_ORIGINAL_SOURCE_OR_EXTERNAL_PINS_INVALID');
  let prior:Phase53Report;
  try{
    prior=auditPhase53OriginalDocumentByteCustody(
      input.phase53,input.phase53Pins);
  }catch{
    return fail('PHASE53_ORIGINAL_DOCUMENT_BYTE_REAUDIT_EXCEPTION',
      'INCOMPLETE_EVIDENCE');
  }
  const part:Partial<Phase54Report>={
    phase53Status:prior.status,
    syntheticDataset:prior.datasetSynthetic,
    declaredOosSessions:prior.declaredOosSessions,
    fullOosArmHorizonAttempts:prior.fullOosArmHorizonAttempts
  };
  if(prior.status!=='ORIGINAL_DOCUMENT_BYTES_MATCH_SIGNED_RECEIPTS_ONLY'||
    prior.verifiedDocumentRoles!==2||
    prior.declaredOosSessions!==pins.expectedDeclaredOosSessions||
    prior.fullOosArmHorizonAttempts!==pins.expectedFullOosArmHorizonAttempts)
    return fail('PHASE53_ORIGINAL_DOCUMENT_SOURCE_OR_DENOMINATOR_REAUDIT_FAILED',
      'INCOMPLETE_EVIDENCE',part);
  const seen=new Set<Phase53DocumentRole>();
  const signers=new Set<string>();
  let valid=0;
  for(const item of input.pdfDocuments){
    if(!item||!ROLES.includes(item.role)||seen.has(item.role)||
      !item.request||!item.cmsPins||!item.detachedX509||
      !item.detachedX509Pins)
      return fail('MISSING_DUPLICATED_OR_UNSUPPORTED_PDF_CMS_ROLE',
        'INVALID_EVIDENCE',part);
    seen.add(item.role);
    const role=item.role;
    const original=input.phase53.documents.find(d=>d.role===role);
    if(!original||!same(sha(original.bytes),pins.expectedPdfSha256ByRole[role])||
      !same(item.cmsPins.expectedOriginalPdfSha256,
        pins.expectedPdfSha256ByRole[role])||
      !same(item.cmsPins.expectedSignerDerSha256,
        pins.expectedSignerDerSha256ByRole[role])||
      !same(item.cmsPins.expectedIssuerDerSha256,
        pins.expectedIssuerDerSha256ByRole[role])||
      !same(item.cmsPins.expectedOpenSslBinarySha256,
        pins.expectedNativeOpenSslBinarySha256)||
      !same(item.detachedX509.originalPdfSha256,
        pins.expectedPdfSha256ByRole[role])||
      !same(item.detachedX509Pins.originalPdfSha256,
        pins.expectedPdfSha256ByRole[role]))
      return fail('NATIVE_CMS_SOURCE_PDF_OR_SIGNER_CERTIFICATE_PIN_MISMATCH',
        'INCOMPLETE_EVIDENCE',part);
    // Phase37 securely opens a real original PDF path, rehashes the *file*,
    // parses exact PDF ByteRange and verifies CMS signature using actual
    // native OpenSSL. No supplied success report or injected runner accepted.
    let verified:Phase37CmsAuditReport;
    try{
      verified=auditPhase37OriginalPdfCmsSigner(
        item.request,item.cmsPins,item.detachedX509,
        item.detachedX509Pins);
    }catch{
      return fail('NATIVE_PDF_CMS_REVIEW_RUNTIME_REJECTED',
        'INCOMPLETE_EVIDENCE',part);
    }
    if(verified.status!=='ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED'||
      !verified.actuallyRanNativeOpenSsl||
      !verified.exactSignedPdfByteRangesVerified||
      !verified.originalEmbeddedCmsSignatureCryptographicallyVerified||
      !verified.pdfCmsSignerCryptographicallyLinkedToPinnedDer||
      !verified.embeddedSignerDerMatchesIndependentPin||
      !verified.detachedPhase36SignerIssuerLocallyConsistent||
      !same(verified.originalPdfSha256,pins.expectedPdfSha256ByRole[role])||
      !same(verified.derivedSignerDerSha256,
        pins.expectedSignerDerSha256ByRole[role])||
      verified.executionAuthorized!==false||
      verified.productionSafe!==false||
      verified.brokerAuthenticated!==false||
      verified.brokerSignerIdentityVerified!==false||
      verified.independentlyTrustedIssuerCaVerified!==false||
      verified.nativeOrderInstruction!==null)
      return fail('ORIGINAL_PDF_NATIVE_CMS_CRYPTO_OR_SIGNER_NOT_VERIFIED',
        'INCOMPLETE_EVIDENCE',{...part,
          originalPdfDocumentsWithNativeCmsVerified:valid});
    signers.add(verified.derivedSignerDerSha256!);
    valid++;
  }
  if(seen.size!==2||signers.size!==2)
    return fail('TWO_DISTINCT_NATIVE_PDF_SIGNER_CERTIFICATES_REQUIRED',
      'INCOMPLETE_EVIDENCE',{...part,
        originalPdfDocumentsWithNativeCmsVerified:valid});
  return {...blank(),...part,
    originalPdfDocumentsWithNativeCmsVerified:valid,
    independentlyPinnedDistinctCmsSignerKeys:signers.size,
    exactOriginalDocumentBytesJoined:true,
    nativeCmsCryptoAndSignedByteRangesVerified:true,
    status:'TWO_ORIGINAL_PDF_CMS_CRYPTO_VALID_ISSUERS_UNVERIFIED'};
}
