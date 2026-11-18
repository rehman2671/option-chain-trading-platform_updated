/**
 * Phase35 combined signature *preflight* and Phase34 offline dossier.
 * No promotion of broker trust, exchange-order provenance or live trading.
 */
import {
  reviewPhase34ExternalPdfEvidence,
  type Phase34ExternalValidationInput,
  type Phase34IndependentVerifierPins
} from './adaptiveUpstoxPhase34ExternalEcnReceiptGate.js';
import type {Phase35PdfsigReport}
  from './adaptiveUpstoxPhase35LocalPdfsig.js';

export interface Phase35ReviewSummary {
  mode:'OFFLINE_LOCAL_PDFSIG_AND_PHASE34_CROSS_SOURCE_PRECHECK';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'LOCAL_SIGNATURE_AND_EXTERNAL_ECN_ASSERTIONS_MATCH_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  pdfOriginalHashMatched:boolean;
  localPopplerCryptoAndNssStatusConsistent:boolean;
  phase34ExternalReceiptAndWapConsistent:boolean;
  onlineOcspChecked:false;
  pdfTrustedTimestampIndependentlyVerified:false;
  brokerIssuerIdentityIndependentlyVerified:false;
  actualPdfAnnexureParsedAndReconciled:false;
  nativeStopOrderAckVerified:false;
  reasons:string[];
  warnings:string[];
}
const warn=[
  'POPPLER_LOCAL_NSS_TRUSTED_RESULT_NEEDS_INDEPENDENT_BROKER_ISSUER_PIN',
  'ONLINE_OCSP_DISABLED_NO_LIVE_REVOCATION_RESULT',
  'PHASE34_EXTERNAL_ASSERTION_AND_LOCAL_PDFSIG_ARE_NOT_PDF_TABLE_EXTRACTION',
  'A_DIGITALLY_SIGNED_ECN_DOES_NOT_PROVE_NATIVE_NRML_STOP_ACK',
  'ALL_RECEIPTS_AND_ARCHIVES_ARE_OPERATOR_SUPPLIED_IN_THIS_RESEARCH'
];
const base=():Phase35ReviewSummary=>({
  mode:'OFFLINE_LOCAL_PDFSIG_AND_PHASE34_CROSS_SOURCE_PRECHECK',
  status:'INVALID_EVIDENCE',executionAuthorized:false,
  productionSafe:false,brokerAuthenticated:false,
  brokerStopInstalled:false,protectedOvernight:false,
  nativeOrderInstruction:null,pdfOriginalHashMatched:false,
  localPopplerCryptoAndNssStatusConsistent:false,
  phase34ExternalReceiptAndWapConsistent:false,
  onlineOcspChecked:false,
  pdfTrustedTimestampIndependentlyVerified:false,
  brokerIssuerIdentityIndependentlyVerified:false,
  actualPdfAnnexureParsedAndReconciled:false,
  nativeStopOrderAckVerified:false,reasons:[],warnings:warn
});
export function reviewPhase35SignatureAndEcnDossier(
  local:Phase35PdfsigReport,
  external:Phase34ExternalValidationInput,
  pins:Phase34IndependentVerifierPins
):Phase35ReviewSummary{
  const empty=base();
  if(!local||!external||!external.externalVerifier||!pins||
    !external.crossExchange)
    return {...empty,reasons:['MISSING_PHASE35_LOCAL_OR_PHASE34_ECN_EVIDENCE']};
  const pdfMatch=local.originalPdfSha256===pins.expectedOriginalPdfSha256&&
    local.originalPdfSha256===external.externalVerifier.originalPdfSha256;
  const locallyConsistent=local.status===
    'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED'&&
    local.localToolActuallyExecuted===true&&
    local.cryptoSignatureReportedValid===true&&
    local.fullDocumentCoverageReported===true&&
    local.nssCertificateChainReportedTrusted===true&&
    local.onlineOcspChecked===false&&
    local.crlFreshnessProven===false&&
    local.issuerAuthenticated===false&&
    local.brokerCertificateFingerprintAuthenticated===false&&
    local.productionSafe===false&&local.executionAuthorized===false&&
    local.brokerAuthenticated===false&&local.brokerStopInstalled===false&&
    local.protectedOvernight===false&&
    local.nativeOrderInstruction===null;
  if(!pdfMatch||!locallyConsistent)
    return {...empty,status:'BLOCKED_OR_UNKNOWN',
      pdfOriginalHashMatched:pdfMatch,
      localPopplerCryptoAndNssStatusConsistent:locallyConsistent,
      reasons:[!pdfMatch?'LOCAL_AND_EXTERNAL_ORIGINAL_PDF_HASH_MISMATCH':
        'LOCAL_PDFSIG_CRYPTO_CHAIN_OR_OFFLINE_SAFETY_PRECHECK_FAILED']};
  const externalResult=reviewPhase34ExternalPdfEvidence(external,pins);
  const both=externalResult.status===
    'EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED'&&
    externalResult.executionAuthorized===false&&
    externalResult.productionSafe===false&&
    externalResult.brokerAuthenticated===false&&
    externalResult.brokerStopInstalled===false&&
    externalResult.protectedOvernight===false;
  if(!both)return {...empty,status:'BLOCKED_OR_UNKNOWN',
    pdfOriginalHashMatched:true,
    localPopplerCryptoAndNssStatusConsistent:true,
    reasons:['PHASE34_EXTERNAL_RECEIPT_WAP_OR_INDEPENDENT_PINS_REJECTED']};
  return {...empty,
    status:'LOCAL_SIGNATURE_AND_EXTERNAL_ECN_ASSERTIONS_MATCH_UNVERIFIED',
    pdfOriginalHashMatched:true,
    localPopplerCryptoAndNssStatusConsistent:true,
    phase34ExternalReceiptAndWapConsistent:true};
}
