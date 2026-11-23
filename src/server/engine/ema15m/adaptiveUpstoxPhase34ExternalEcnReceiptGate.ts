/**
 * Adaptive Swing v2 Phase34: verification of a *separate* PDF-validator
 * signed receipt, plus local cross-exchange FO/WAP matching.
 *
 * This is NOT an implementation of CMS/PAdES PDF signature validation.
 * The signed receipt only proves a pinned external verifier key endorsed
 * asserted results, not that the verifier/issuer actually did the checks.
 * Fail closed on missing/stale/mutated claims; never authorize trading.
 */
import {
  createHash,createPublicKey,verify
} from 'node:crypto';
import {
  constants,closeSync,fsyncSync,lstatSync,openSync,
  realpathSync,writeSync
} from 'node:fs';
import {isAbsolute,resolve,join} from 'node:path';
import {
  reviewPhase34CrossExchangeWap,
  type Phase34CrossExchangeInput,
  type Phase34CrossExchangeReport
} from './adaptiveUpstoxPhase34CrossExchangeWap.js';

const DOMAIN='ADAPTIVE_V2_PHASE34_EXTERNAL_PDF_VALIDATOR_RECEIPT_V1';
const SHA=/^[0-9a-f]{64}$/;
const clock=(v:unknown):number=>typeof v==='string'&&
  /^\d{4}-\d\d-\d\dT/.test(v)&&
  /(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const digest=(v:string|Uint8Array):string=>
  createHash('sha256').update(v).digest('hex');
const string=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=128;
function base64(v:unknown,max:number):Buffer|null{
  if(typeof v!=='string'||v.length<4||v.length>max||
    v.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    return null;
  const b=Buffer.from(v,'base64');
  return b.toString('base64')===v?b:null;
}
type Exchange='NFO'|'BFO';
export interface Phase34ExternalVerifierReceipt {
  schemaVersion:'EXTERNAL_PDF_VALIDATOR_CLAIMS_V1';
  signedAt:string;
  challengeHex:string;
  /** The entire original PDF must be processed; not merely a detached text. */
  originalPdfSha256:string;
  verifierBuildSha256:string;
  claimedBrokerSignerCertificateSha256:string;
  claimedIssuerCaCertificateSha256:string;
  signatureCryptographicIntegrity:'PASS';
  signedByteCoverage:'ENTIRE_DOCUMENT_NO_UNSIGNED_UPDATES';
  signingCertificatePath:'TRUSTED_IN_EXTERNAL_CA_STORE';
  signingCertificateRevocation:'GOOD_AT_VALIDATION_TIME';
  qualifiedTimestamp:'INDEPENDENT_TSA_VALID';
  pdfAnnexureTranscriptSha256:string;
  pdfConsolidatedWapTranscriptSha256:string;
  /** Detached signature of the validator's own result; NOT a PDF signature. */
  validatorSignatureBase64:string;
}
export interface Phase34IndependentVerifierPins {
  schemaVersion:'EXTERNALLY_PINNED_PDF_VALIDATOR_POLICY_V1';
  expectedUcc:string;
  expectedOriginalPdfSha256:string;
  expectedChallengeHex:string;
  expectedValidatorBuildSha256:string;
  expectedSignerCertificateSha256:string;
  expectedIssuerCaCertificateSha256:string;
  allowedExchanges:Exchange[];
  verifierPublicKeySpkiDerBase64:string;
  verificationAsOf:string;
  maximumReceiptAgeMinutes:number;
}
export interface Phase34ExternalValidationInput {
  schemaVersion:'ADAPTIVE_V2_PHASE34_EXTERNAL_PDF_WAP_AUDIT_V1';
  crossExchange:Phase34CrossExchangeInput;
  externalVerifier:Phase34ExternalVerifierReceipt;
}
export interface Phase34PadesEvidenceReport {
  mode:'EXTERNAL_PDF_VALIDATOR_RECEIPT_AND_CROSS_EXCHANGE_FO_WAP';
  status:'INVALID_EVIDENCE'|'TRUST_OR_VERIFIER_RECEIPT_REJECTED'|
    'CROSS_EXCHANGE_FO_REJECTED'|
    'EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  pdfDigitalSignatureVerifiedByThisCode:false;
  brokerEcNissuerIndependentlyVerified:false;
  pdfAnnexureExtractedByThisCode:false;
  nativeOrderLifecycleVerified:false;
  /** A cryptographically signed ASSERTION by a pinned *external* verifier. */
  externalVerifierSignatureValid:boolean;
  externalVerifierClaimsPadesValid:boolean;
  externalVerifierClaimsPdfTranscriptionMatched:boolean;
  crossExchangeWapStatus:Phase34CrossExchangeReport['status']|null;
  reasons:string[];
  receiptMessageSha256:string|null;
  reviewedExchanges:number;
  warnings:string[];
}
const warnings=[
  'SIGNED_EXTERNAL_VALIDATOR_RECEIPT_IS_NOT_LOCALLY_VALIDATED_PDF_CMS_SIGNATURE',
  'EXTERNAL_CA_TRUST_CHAIN_REVOCATION_AND_TIMESTAMP_ARE_ASSERTIONS_FROM_A_SIGNED_VERIFIER',
  'INDEPENDENT_VERIFIER_PROVENANCE_AND_TRUST_PINS_MUST_BE_ATTESTED_OUT_OF_BAND',
  'EXTRACTED_TRANSCRIPT_HASHES_ARE_SIGNED_ASSERTIONS_NOT_PDF_PARSING_BY_THIS_LIBRARY',
  'COMMON_CONTRACT_EQUIVALENCE_AND_FO_TRADE_SOURCE_NOT_AUTHENTICATED',
  'NO_BROKER_NATIVE_ORDER_ACK_CANCEL_REPLACE_OR_OVERNIGHT_STOP_PROOF',
  'NO_AUTOMATED_NRML_ORDERS_GTT_REPAIR_OR_15_15_POSITIONAL_SQUARE_OFF'
];
const fresh=():Phase34PadesEvidenceReport=>({
  mode:'EXTERNAL_PDF_VALIDATOR_RECEIPT_AND_CROSS_EXCHANGE_FO_WAP',
  status:'INVALID_EVIDENCE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,nativeOrderInstruction:null,
  pdfDigitalSignatureVerifiedByThisCode:false,
  brokerEcNissuerIndependentlyVerified:false,
  pdfAnnexureExtractedByThisCode:false,
  nativeOrderLifecycleVerified:false,
  externalVerifierSignatureValid:false,
  externalVerifierClaimsPadesValid:false,
  externalVerifierClaimsPdfTranscriptionMatched:false,
  crossExchangeWapStatus:null,reasons:[],receiptMessageSha256:null,
  reviewedExchanges:0,warnings
});
const fail=(reason:string,status:Phase34PadesEvidenceReport['status'],
  partial?:Partial<Phase34PadesEvidenceReport>):Phase34PadesEvidenceReport=>({
  ...fresh(),...partial,status,reasons:[reason]
});
/** Deterministic domain-separated, byte-bound validation message.
 * Signing is always done *outside* this repository.
 */
export function preparePhase34ExternalVerifierMessage(
  input:Phase34ExternalValidationInput
):{message:string;pdfSha256:string|null;reasonCodes:string[]}{
  const invalid=(reason:string)=>({message:'',pdfSha256:null,
    reasonCodes:[reason]});
  if(!input||input.schemaVersion!==
    'ADAPTIVE_V2_PHASE34_EXTERNAL_PDF_WAP_AUDIT_V1'||
    !input.crossExchange||!input.externalVerifier||
    !input.crossExchange.note||!input.crossExchange.scope||
    !Array.isArray(input.crossExchange.historicalSources))
    return invalid('INVALID_EXTERNAL_VALIDATOR_INPUT_SCHEMA');
  const receipt=input.externalVerifier;
  const x=input.crossExchange;
  if(receipt.schemaVersion!=='EXTERNAL_PDF_VALIDATOR_CLAIMS_V1'||
    !Number.isFinite(clock(receipt.signedAt))||
    ![receipt.challengeHex,receipt.originalPdfSha256,
      receipt.verifierBuildSha256,
      receipt.claimedBrokerSignerCertificateSha256,
      receipt.claimedIssuerCaCertificateSha256,
      receipt.pdfAnnexureTranscriptSha256,
      receipt.pdfConsolidatedWapTranscriptSha256
    ].every(v=>typeof v==='string'&&SHA.test(v))||
    receipt.signatureCryptographicIntegrity!=='PASS'||
    receipt.signedByteCoverage!=='ENTIRE_DOCUMENT_NO_UNSIGNED_UPDATES'||
    receipt.signingCertificatePath!=='TRUSTED_IN_EXTERNAL_CA_STORE'||
    receipt.signingCertificateRevocation!=='GOOD_AT_VALIDATION_TIME'||
    receipt.qualifiedTimestamp!=='INDEPENDENT_TSA_VALID')
    return invalid('PDF_VALIDATOR_CLAIMS_NOT_STRICT_SUCCESS');
  const raw=base64(x.note.originalPdfBase64,2700000);
  if(!raw||raw.length<12||raw.length>2_000_000||
    raw.subarray(0,5).toString('ascii')!=='%PDF-'||
    !raw.subarray(Math.max(0,raw.length-1024))
      .toString('latin1').includes('%%EOF'))
    return invalid('ORIGINAL_PDF_BYTES_MISSING_OR_UNRECOGNIZED');
  const pdfSha256=digest(raw);
  if(pdfSha256!==receipt.originalPdfSha256)
    return invalid('EXTERNAL_RECEIPT_PDF_HASH_DISAGREES_WITH_ORIGINAL');
  const transcript=digest(JSON.stringify(x.note.selectedAnnexureRows));
  const summary=digest(JSON.stringify(x.note.selectedWapSummaryRows));
  if(transcript!==receipt.pdfAnnexureTranscriptSha256||
    summary!==receipt.pdfConsolidatedWapTranscriptSha256)
    return invalid('EXTERNAL_PDF_TRANSCRIPT_HASH_DISAGREES_WITH_PRIVATE_ROWS');
  const {validatorSignatureBase64:ignored,...signedClaim}=receipt;
  const material=JSON.stringify({
    domain:DOMAIN,
    claimedOriginalPdfSha256:pdfSha256,
    expectedAccountScopeHash:digest(x.scope.expectedAccountScopeId),
    crossExchangeScopeHash:digest(JSON.stringify(x.scope)),
    fullHistoricalSourcesHash:digest(JSON.stringify(x.historicalSources)),
    originalNoteMetadataHash:digest(JSON.stringify({
      documentReference:x.note.documentReference,
      tradeDate:x.note.tradeDate,
      source:x.note.source,
      uccHash:digest(x.note.declaredUcc)
    })),
    signedClaim
  });
  return {message:DOMAIN+'\n'+digest(material),
    pdfSha256,reasonCodes:[]};
}
export function reviewPhase34ExternalPdfEvidence(
  input:Phase34ExternalValidationInput,
  trust:Phase34IndependentVerifierPins
):Phase34PadesEvidenceReport{
  if(!trust||trust.schemaVersion!==
    'EXTERNALLY_PINNED_PDF_VALIDATOR_POLICY_V1'||
    !string(trust.expectedUcc)||
    ![trust.expectedOriginalPdfSha256,
      trust.expectedChallengeHex,
      trust.expectedValidatorBuildSha256,
      trust.expectedSignerCertificateSha256,
      trust.expectedIssuerCaCertificateSha256].every(
      x=>typeof x==='string'&&SHA.test(x)
    )||
    !Array.isArray(trust.allowedExchanges)||
    trust.allowedExchanges.length<1||
    trust.allowedExchanges.length>2||
    !trust.allowedExchanges.every(x=>x==='NFO'||x==='BFO')||
    new Set(trust.allowedExchanges).size!==trust.allowedExchanges.length||
    !Number.isFinite(clock(trust.verificationAsOf))||
    !Number.isSafeInteger(trust.maximumReceiptAgeMinutes)||
    trust.maximumReceiptAgeMinutes<1||
    trust.maximumReceiptAgeMinutes>1440)
    return fail('INVALID_OUT_OF_BAND_PDF_VERIFIER_PINS','INVALID_EVIDENCE');
  const prep=preparePhase34ExternalVerifierMessage(input);
  if(prep.reasonCodes.length)
    return fail(prep.reasonCodes[0],'INVALID_EVIDENCE');
  const receipt=input.externalVerifier,scope=input.crossExchange.scope;
  if(scope.expectedAccountScopeId!==trust.expectedUcc||
    input.crossExchange.note.declaredUcc!==trust.expectedUcc||
    prep.pdfSha256!==trust.expectedOriginalPdfSha256||
    receipt.challengeHex!==trust.expectedChallengeHex||
    receipt.verifierBuildSha256!==trust.expectedValidatorBuildSha256||
    receipt.claimedBrokerSignerCertificateSha256!==
      trust.expectedSignerCertificateSha256||
    receipt.claimedIssuerCaCertificateSha256!==
      trust.expectedIssuerCaCertificateSha256||
    scope.expectedExchanges.length!==trust.allowedExchanges.length||
    scope.expectedExchanges.some(x=>!trust.allowedExchanges.includes(x)))
    return fail('EXTERNAL_PDF_VERIFIER_INDEPENDENT_PINS_DO_NOT_MATCH',
      'TRUST_OR_VERIFIER_RECEIPT_REJECTED');
  const signedAt=clock(receipt.signedAt),asOf=clock(trust.verificationAsOf);
  if(!Number.isFinite(signedAt)||signedAt>asOf||
    asOf-signedAt>trust.maximumReceiptAgeMinutes*60000||
    input.crossExchange.historicalSources.some(x=>
      !Number.isFinite(clock(x.asOf))||clock(x.asOf)>signedAt))
    return fail('EXTERNAL_PDF_VERIFIER_RECEIPT_STALE_OR_CLOCK_REVERSED',
      'TRUST_OR_VERIFIER_RECEIPT_REJECTED');
  const pub=base64(trust.verifierPublicKeySpkiDerBase64,500),
    sig=base64(receipt.validatorSignatureBase64,200);
  if(!pub||!sig||sig.length!==64)
    return fail('MISSING_EXTERNAL_VERIFIER_PINNED_ED25519_SIGNATURE',
      'TRUST_OR_VERIFIER_RECEIPT_REJECTED');
  try{
    const key=createPublicKey({key:pub,format:'der',type:'spki'});
    if(key.asymmetricKeyType!=='ed25519'||
      !verify(null,Buffer.from(prep.message,'utf8'),key,sig))
      return fail('EXTERNAL_VERIFIER_ED25519_RECEIPT_SIGNATURE_MISMATCH',
        'TRUST_OR_VERIFIER_RECEIPT_REJECTED');
  }catch{
    return fail('EXTERNAL_VERIFIER_ED25519_RECEIPT_SIGNATURE_MISMATCH',
      'TRUST_OR_VERIFIER_RECEIPT_REJECTED');
  }
  const signed={
    externalVerifierSignatureValid:true,
    externalVerifierClaimsPadesValid:true,
    externalVerifierClaimsPdfTranscriptionMatched:true,
    receiptMessageSha256:digest(prep.message)
  };
  const cross=reviewPhase34CrossExchangeWap(input.crossExchange);
  if(cross.status!=='CROSS_EXCHANGE_WAP_MATCHED_OFFLINE_UNVERIFIED')
    return fail('CROSS_EXCHANGE_WAP_OR_FO_COVERAGE_BLOCKED',
      'CROSS_EXCHANGE_FO_REJECTED',{
        ...signed,crossExchangeWapStatus:cross.status,
        reviewedExchanges:cross.historyExchangesReviewed
      });
  return {...fresh(),...signed,
    status:'EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED',
    crossExchangeWapStatus:cross.status,
    reviewedExchanges:cross.historyExchangesReviewed};
}
export interface Phase34NonceClaimResult {
  status:'CLAIMED_EXTERNAL_RECEIPT_OFFLINE_UNVERIFIED'|
    'NOT_ELIGIBLE_FOR_OFFLINE_NONCE_CLAIM'|
    'OWNER_PRIVATE_NONCE_REGISTRY_UNAVAILABLE'|
    'NONCE_ALREADY_USED_OR_REGISTRY_WRITE_FAILED';
  executionAuthorized:false;productionSafe:false;brokerAuthenticated:false;
}
const claimResult=(status:Phase34NonceClaimResult['status']):
  Phase34NonceClaimResult=>({
  status,executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false
});
function ownedPrivateDirectory(input:string):string|null{
  if(typeof input!=='string'||!isAbsolute(input)||
    input.length>1024||input.includes('\0'))return null;
  try{
    const p=resolve(input),s=lstatSync(p);
    if(!s.isDirectory()||s.isSymbolicLink()||
      (s.mode&0o077)!==0||realpathSync(p)!==p||
      (typeof process.getuid==='function'&&s.uid!==process.getuid()))
      return null;
    return p;
  }catch{return null;}
}
/** Rechecks source+signed receipt, then atomic O_EXCL nonce use. Reused
 * nonce after a restart in the SAME retained 0700 directory fails closed.
 * NOT distributed, rollback-proof, WORM, or external timestamp notarization.
 */
export function verifyAndClaimPhase34ExternalReceiptOnce(
  input:Phase34ExternalValidationInput,
  trust:Phase34IndependentVerifierPins,
  privateNonceRegistry:string
):{report:Phase34PadesEvidenceReport;nonce:Phase34NonceClaimResult}{
  const report=reviewPhase34ExternalPdfEvidence(input,trust);
  if(report.status!=='EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED')
    return {report,nonce:claimResult('NOT_ELIGIBLE_FOR_OFFLINE_NONCE_CLAIM')};
  const dir=ownedPrivateDirectory(privateNonceRegistry);
  if(!dir)return {report,
    nonce:claimResult('OWNER_PRIVATE_NONCE_REGISTRY_UNAVAILABLE')};
  const k=digest(DOMAIN+'\n'+trust.expectedUcc+
    '\n'+trust.expectedChallengeHex);
  const file=join(dir,k+'.used');
  let fd:number;
  try{
    fd=openSync(file,constants.O_CREAT|constants.O_EXCL|
      constants.O_NOFOLLOW|constants.O_WRONLY,0o600);
  }catch{
    return {report,
      nonce:claimResult('NONCE_ALREADY_USED_OR_REGISTRY_WRITE_FAILED')};
  }
  try{
    const value=Buffer.from(JSON.stringify({
      schemaVersion:'PHASE34_ONE_USE_EXTERNAL_RECEIPT_NONCE_V1',
      receiptMessageSha256:report.receiptMessageSha256
    }));
    let written=0;
    while(written<value.length){
      const n=writeSync(fd,value,written,value.length-written);
      if(n<=0)throw Error('SHORT_NONCE_CLAIM_WRITE');
      written+=n;
    }
    fsyncSync(fd);
    closeSync(fd);fd=-1;
    const dfd=openSync(dir,constants.O_RDONLY|constants.O_DIRECTORY|
      constants.O_NOFOLLOW);
    try{fsyncSync(dfd);}finally{closeSync(dfd);}
    return {report,nonce:claimResult(
      'CLAIMED_EXTERNAL_RECEIPT_OFFLINE_UNVERIFIED')};
  }catch{
    return {report,nonce:claimResult(
      'NONCE_ALREADY_USED_OR_REGISTRY_WRITE_FAILED')};
  }finally{
    if(fd>=0)closeSync(fd);
  }
}
