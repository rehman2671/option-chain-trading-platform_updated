/**
 * Phase36 detached X.509 certificate identity/pins audit.
 * The two DER certificates are provided separately; no cryptographic
 * association to the certificate embedded in ECN PDF CMS is proven here.
 * Do not promote certificate-chain plausibility to authenticated Upstox.
 */
import {X509Certificate,createHash} from 'node:crypto';
import type {Phase35PdfsigReport}
  from './adaptiveUpstoxPhase35LocalPdfsig.js';
import type {Phase36TextReport}
  from './adaptiveUpstoxPhase36PdfTextAnnexure.js';

const SHA=/^[a-f0-9]{64}$/;
const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const parseBase64=(x:unknown):Buffer|null=>{
  if(typeof x!=='string'||x.length<16||x.length>40000||
    x.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x))
    return null;
  const b=Buffer.from(x,'base64');
  return b.toString('base64')===x&&b.length<=30000?b:null;
};
const time=(x:unknown):number=>typeof x==='string'&&
  /^\d{4}-\d\d-\d\dT/.test(x)&&
  /(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
export interface Phase36DetachedCertificateInput{
  schemaVersion:'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1';
  source:'SEPARATELY_PROVISIONED_UNVERIFIED';
  signerCertificateDerBase64:string;
  issuerCertificateDerBase64:string;
  evaluationAsOf:string;
  originalPdfSha256:string;
}
export interface Phase36IndependentCertificatePins{
  schemaVersion:'INDEPENDENT_PHASE36_X509_PINS_V1';
  originalPdfSha256:string;
  expectedSignerDerSha256:string;
  expectedIssuerDerSha256:string;
  evaluationAsOf:string;
  expectedIssuerTrustModel:'EXTERNALLY_PINNED_SELF_SIGNED_CA_ONLY';
}
export interface Phase36CertificateAudit{
  mode:'DETACHED_X509_CERTIFICATE_PIN_AND_SIGNATURE_CHAIN_REVIEW';
  status:'INVALID_EVIDENCE'|'DETACHED_CERTIFICATE_REJECTED'|
    'DETACHED_SIGNER_ISSUER_CHAIN_CONSISTENT_UNLINKED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  originalPdfSha256:string|null;
  derSignerFingerprintPinned:boolean;
  derIssuerFingerprintPinned:boolean;
  detachedSignerIssuedByPinnedCa:boolean;
  validAtDeclaredReviewTime:boolean;
  certificateEmbeddedInPdfSignatureVerified:false;
  brokerIssuerIdentityVerified:false;
  revocationStatusVerified:false;
  trustedTimestampVerified:false;
  reasons:string[];warnings:string[];
}
const warnings=[
  'DETACHED_DER_MAY_NOT_BE_THE_CERTIFICATE_ACTUALLY_EMBEDDED_IN_ECN_CMS',
  'ISSUER_CA_IS_OPERATOR_PROVISIONED_AND_REQUIRES_INDEPENDENT_APPROVAL',
  'ONE_DETACHED_SELF_SIGNED_CA_CHAIN_IS_NOT_A_REGULATORY_CA_TRUST_PATH',
  'NO_ONLINE_REVOCATION_OR_TRUSTED_TIMESTAMP_CHECK',
  'CERT_CHAIN_CONSISTENCY_DOES_NOT_AUTHENTICATE_UPSTOX_ACCOUNT',
  'SIGNED_CONTRACT_NOTE_IS_NOT_EXCHANGE_NATIVE_STOP_ACK',
  'NO_AUTOMATED_NRML_TRADING_OR_15_15_POSITIONAL_EXIT'
];
const blank=():Phase36CertificateAudit=>({
  mode:'DETACHED_X509_CERTIFICATE_PIN_AND_SIGNATURE_CHAIN_REVIEW',
  status:'INVALID_EVIDENCE',executionAuthorized:false,
  productionSafe:false,brokerAuthenticated:false,
  brokerStopInstalled:false,nativeOrderInstruction:null,
  protectedOvernight:false,originalPdfSha256:null,
  derSignerFingerprintPinned:false,
  derIssuerFingerprintPinned:false,
  detachedSignerIssuedByPinnedCa:false,validAtDeclaredReviewTime:false,
  certificateEmbeddedInPdfSignatureVerified:false,
  brokerIssuerIdentityVerified:false,revocationStatusVerified:false,
  trustedTimestampVerified:false,reasons:[],warnings
});
const reject=(reason:string,status:Phase36CertificateAudit['status']=
  'DETACHED_CERTIFICATE_REJECTED',
  fields?:Partial<Phase36CertificateAudit>):Phase36CertificateAudit=>({
  ...blank(),...fields,reasons:[reason],status
});
/** Local certificate signature/validity only; never a PDF signer binding. */
export function reviewPhase36DetachedX509(
  input:Phase36DetachedCertificateInput,
  pins:Phase36IndependentCertificatePins
):Phase36CertificateAudit{
  if(!input||!pins||input.schemaVersion!==
    'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1'||
    input.source!=='SEPARATELY_PROVISIONED_UNVERIFIED'||
    pins.schemaVersion!=='INDEPENDENT_PHASE36_X509_PINS_V1'||
    pins.expectedIssuerTrustModel!==
      'EXTERNALLY_PINNED_SELF_SIGNED_CA_ONLY'||
    ![pins.originalPdfSha256,pins.expectedSignerDerSha256,
      pins.expectedIssuerDerSha256,input.originalPdfSha256].every(
      x=>typeof x==='string'&&SHA.test(x))||
    input.originalPdfSha256!==pins.originalPdfSha256||
    !Number.isFinite(time(input.evaluationAsOf))||
    time(input.evaluationAsOf)!==time(pins.evaluationAsOf))
    return reject('INVALID_DETACHED_CERTIFICATE_SCOPE_OR_INDEPENDENT_PINS',
      'INVALID_EVIDENCE');
  const signerBytes=parseBase64(input.signerCertificateDerBase64);
  const issuerBytes=parseBase64(input.issuerCertificateDerBase64);
  if(!signerBytes||!issuerBytes)
    return reject('INVALID_DETACHED_DER_CERTIFICATE_ENCODING');
  if(digest(signerBytes)!==pins.expectedSignerDerSha256||
    digest(issuerBytes)!==pins.expectedIssuerDerSha256)
    return reject('PINNED_SIGNER_OR_ISSUER_DER_SHA256_MISMATCH');
  let signer:X509Certificate,issuer:X509Certificate;
  try{
    signer=new X509Certificate(signerBytes);
    issuer=new X509Certificate(issuerBytes);
  }catch{return reject('INVALID_X509_DER_CERTIFICATE_FORMAT');}
  const hashes={derSignerFingerprintPinned:true,
    derIssuerFingerprintPinned:true};
  // Treat signer as leaf and issuer as one self-signed pinned CA only.
  if(signer.ca||!issuer.ca||!signer.checkIssued(issuer)||
    !issuer.checkIssued(issuer)||
    !signer.verify(issuer.publicKey)||
    !issuer.verify(issuer.publicKey))
    return reject('PINNED_DETACHED_SIGNER_ISSUER_SIGNATURE_CHAIN_INVALID',
      'DETACHED_CERTIFICATE_REJECTED',hashes);
  const at=time(input.evaluationAsOf);
  const sv=Date.parse(signer.validFrom),se=Date.parse(signer.validTo),
    iv=Date.parse(issuer.validFrom),ie=Date.parse(issuer.validTo);
  if(![sv,se,iv,ie].every(Number.isFinite)||
    at<sv||at>se||at<iv||at>ie)
    return reject('PINNED_CERTIFICATE_NOT_VALID_AT_REVIEW_TIME',
      'DETACHED_CERTIFICATE_REJECTED',hashes);
  return {...blank(),...hashes,
    status:'DETACHED_SIGNER_ISSUER_CHAIN_CONSISTENT_UNLINKED',
    originalPdfSha256:input.originalPdfSha256,
    detachedSignerIssuedByPinnedCa:true,
    validAtDeclaredReviewTime:true};
}
export interface Phase36CombinedEcnEvidence{
  status:'INVALID_INPUT'|'HUMAN_REVIEW_REQUIRED'|
    'TEXT_AND_DETACHED_CERT_PINS_LOCALLY_CONSISTENT_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  pdfCertificateSignerLinkVerified:false;
  fullPdfContentAndAnnexureCoverageVerified:false;
  independentUpstoxIdentityVerified:false;
  realNativeStopOrderAckVerified:false;
  reasons:string[];
}
const combined=(status:Phase36CombinedEcnEvidence['status'],
  reasons:string[]):Phase36CombinedEcnEvidence=>({
  status,executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,nativeOrderInstruction:null,
  pdfCertificateSignerLinkVerified:false,
  fullPdfContentAndAnnexureCoverageVerified:false,
  independentUpstoxIdentityVerified:false,
  realNativeStopOrderAckVerified:false,reasons
});
/** A successful local match never upgrades to broker/authenticated safety. */
export function reviewPhase36EcnTextAndDetachedSigner(
  phase35:Phase35PdfsigReport,
  extracted:Phase36TextReport,
  signer:Phase36CertificateAudit
):Phase36CombinedEcnEvidence{
  if(!phase35||!extracted||!signer)
    return combined('INVALID_INPUT',['MISSING_OFFLINE_ECN_REVIEW_SOURCE']);
  if(phase35.status!==
    'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED'||
    extracted.status!=='TEXT_LAYER_ROWS_MATCHED_UNVERIFIED'||
    signer.status!=='DETACHED_SIGNER_ISSUER_CHAIN_CONSISTENT_UNLINKED'||
    !phase35.originalPdfSha256||
    phase35.originalPdfSha256!==extracted.originalPdfSha256||
    phase35.originalPdfSha256!==signer.originalPdfSha256||
    !extracted.actualPdfTextCompared||
    !extracted.realNativeExtraction||
    phase35.executionAuthorized!==false||
    extracted.executionAuthorized!==false||
    signer.executionAuthorized!==false)
    return combined('HUMAN_REVIEW_REQUIRED',
      ['LOCAL_CMS_TEXT_OR_DETACHED_X509_PIN_DISAGREEMENT']);
  return combined('TEXT_AND_DETACHED_CERT_PINS_LOCALLY_CONSISTENT_UNVERIFIED',[]);
}
