/**
 * Adaptive Swing v2 Phase42 — PRIVATE/OFFLINE raw GET response-byte receipts
 * bound to Phase41 calendar/witnessed boundary checkpoints.
 *
 * Node X509 checks a provided peer certificate's SAN, date and SPKI pin;
 * it CANNOT replay/authenticate a TLS handshake. Two Ed25519 witnesses
 * only attest local bytes, NOT official Upstox response origin.
 *
 * No GET capture here, no broker credential, API request, order/GTT write,
 * webhook, timer, automated action, or trading engine integration.
 */
import {createHash,createPublicKey,verify,X509Certificate}
  from 'node:crypto';
import {isDeepStrictEqual,TextDecoder} from 'node:util';
import {
  auditPhase41WitnessedSessionCoverage,
  hashPhase41Calendar,phase41LinkSha256,
  type Phase41Archive,type Phase41IndependentPins
} from './adaptiveUpstoxPhase41WitnessedSessionCoverage.js';
import {hashPhase40OfflineArchive}
  from './adaptiveUpstoxPhase40OvernightStopAudit.js';

const SHA=/^[a-f0-9]{64}$/;
const TIMESTAMP=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const URL='https://api.upstox.com/v3/order/gtt';
const hash=(v:Uint8Array|string):string=>
  createHash('sha256').update(v).digest('hex');
const time=(s:unknown):number=>
  typeof s==='string'&&TIMESTAMP.test(s)?Date.parse(s):NaN;
const strictBase64=(value:unknown,maxBytes:number):Buffer|null=>{
  if(typeof value!=='string'||value.length<4||
    value.length>Math.ceil(maxBytes/3)*4+4||
    value.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    return null;
  const bytes=Buffer.from(value,'base64');
  return bytes.length<=maxBytes&&bytes.toString('base64')===value?
    bytes:null;
};
export interface Phase42NoticeBytes{
  source:'OPERATOR_ARCHIVED_EXCHANGE_NOTICE_UNVERIFIED';
  sourceUrl:string;
  mediaType:'application/pdf';
  originalPdfBase64:string;
}
export interface Phase42ReceiptWitness{
  role:'CAPTURE_OPERATOR'|'INDEPENDENT_REVIEWER';
  publicKeySpkiDerBase64:string;
  signatureBase64:string;
  signedAt:string;
}
export interface Phase42RawGetReceipt{
  schemaVersion:'ADAPTIVE_PHASE42_ORIGINAL_GET_BODY_RECEIPT_V1';
  source:'OPERATOR_CAPTURED_TLS_GET_UNVERIFIED';
  sequence:number;
  checkpoint:'BEFORE_CLOSE'|'AFTER_OPEN';
  method:'GET';
  requestedUrl:'https://api.upstox.com/v3/order/gtt';
  finalUrl:'https://api.upstox.com/v3/order/gtt';
  query:{gtt_order_id:string};
  capturedAt:string;
  httpStatus:200;
  contentType:'application/json';
  redirected:false;
  authorizationHeaderPersisted:false;
  tlsValidationClaim:'OPERATOR_CLAIMS_HTTPS_HOSTNAME_AND_CA_VALIDATED';
  tlsPeerCertificateDerBase64:string;
  responseUtf8Base64:string;
  witnessedAt:string;
  witnesses:Phase42ReceiptWitness[];
}
export interface Phase42RawSourceBundle{
  schemaVersion:'ADAPTIVE_PHASE42_RAW_GET_NOTICE_SOURCE_BUNDLE_V1';
  source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED';
  phase41Archive:Phase41Archive;
  originalCalendarNotice:Phase42NoticeBytes;
  checkpointReceipts:Phase42RawGetReceipt[];
}
export interface Phase42IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE42_ORIGINAL_SOURCE_RECEIPT_PINS_V1';
  phase41:Phase41IndependentPins;
  expectedOriginalNoticeSha256:string;
  expectedRawResponseSha256:string[];
  expectedTlsLeafSpkiSha256:string[];
  expectedFinalReceiptChainSha256:string;
  maxReceiptWitnessAgeMinutes:number;
}
export interface Phase42ReceiptReport{
  mode:'OFFLINE_ORIGINAL_HTTP_BODY_AND_EXCHANGE_NOTICE_RECEIPT_AUDIT';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'RAW_GET_BYTES_AND_CALENDAR_PDF_DUAL_WITNESSED_UNVERIFIED';
  reasonCodes:string[];
  originalNoticeBytesHashMatched:boolean;
  parsedOriginalGetBodiesMatched:number;
  claimedTlsLeafCertificatesLocallyValid:number;
  verifiedReceiptWitnessSignatures:number;
  receiptsReviewed:number;
  phase41SessionsReaudited:number;
  originalNoticeTextOrSignatureVerified:false;
  genuineUpstoxTlsHandshakeVerified:false;
  genuineUpstoxServerResponseAuthenticated:false;
  exchangeNoticePublisherAuthenticated:false;
  independentlyTrustedWitnessIdentityVerified:false;
  exchangeCalendarSourceSemanticsVerified:false;
  brokerNativeStopAckVerified:false;
  continuousOvernightProtectionProven:false;
  stopFillGuaranteed:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  protectedOvernight:false;
  productionSafe:false;
  executionAuthorized:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const warnings=[
  'RAW_HTTP_JSON_CONTENT_HASHES_AND_CAPTURE_SIGNERS_DO_NOT_PROVE_UPSTOX_ORIGIN',
  'X509_SAN_VALIDITY_SPKI_FROM_OPERATOR_FILE_CANNOT_PROVE_LIVE_TLS_HANDSHAKE',
  'SYNTHETIC_CERTIFICATE_WITH_API_UPSTOX_COM_SAN_CAN_PASS_LOCAL_X509_CHECKS',
  'ORIGINAL_EXCHANGE_NOTICE_PDF_HASH_MATCH_DOES_NOT_VERIFY_PUBLISHER_OR_TEXT',
  'A_SELF_PINNED_OR_REWRITTEN_POLICY_CANNOT_PROVE_INDEPENDENT_TRUST',
  'RECEIPT_SIGNING_CLOCK_AND_HUMAN_WITNESS_IDENTITY_NOT_ATTESTED',
  'UPSTOX_ORDER_HISTORY_IS_DAY_SCOPED_AND_COMPLETED_GTT_CANNOT_BE_FETCHED_LATER',
  'GTT_SCHEDULED_IS_NOT_EXCHANGE_HOSTED_STOP_ACK_OR_GAP_FILL_GUARANTEE',
  'NO_LIVE_NRML_ORDER_GTT_WRITES_OR_POSITIONAL_15_15_AUTOEXIT'
];
const base=():Phase42ReceiptReport=>({
  mode:'OFFLINE_ORIGINAL_HTTP_BODY_AND_EXCHANGE_NOTICE_RECEIPT_AUDIT',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  originalNoticeBytesHashMatched:false,
  parsedOriginalGetBodiesMatched:0,
  claimedTlsLeafCertificatesLocallyValid:0,
  verifiedReceiptWitnessSignatures:0,
  receiptsReviewed:0,phase41SessionsReaudited:0,
  originalNoticeTextOrSignatureVerified:false,
  genuineUpstoxTlsHandshakeVerified:false,
  genuineUpstoxServerResponseAuthenticated:false,
  exchangeNoticePublisherAuthenticated:false,
  independentlyTrustedWitnessIdentityVerified:false,
  exchangeCalendarSourceSemanticsVerified:false,
  brokerNativeStopAckVerified:false,
  continuousOvernightProtectionProven:false,
  stopFillGuaranteed:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,productionSafe:false,
  executionAuthorized:false,nativeOrderInstruction:null,warnings
});
const reject=(reason:string,status:Phase42ReceiptReport['status']='BLOCKED_OR_UNKNOWN',
  fields?:Partial<Phase42ReceiptReport>):Phase42ReceiptReport=>({
  ...base(),...fields,status,reasonCodes:[reason]
});
/** Domain-separated deterministic receipt witness payload.
 * This message records local claims. It does NOT authenticate HTTP origin.
 */
export function phase42ReceiptMessage(
  receipt:Omit<Phase42RawGetReceipt,'witnesses'>,
  rawBodySha256:string,peerCertSpkiSha256:string,
  phase41PairSha256:string,previousReceiptSha256:string
):Buffer{
  return Buffer.from(JSON.stringify({
    domain:'ADAPTIVE_PHASE42_HTTP_RECEIPT_DUAL_SIGNED_V1',
    sequence:receipt.sequence,checkpoint:receipt.checkpoint,
    method:receipt.method,requestedUrl:receipt.requestedUrl,
    finalUrl:receipt.finalUrl,query:receipt.query,
    capturedAt:receipt.capturedAt,httpStatus:receipt.httpStatus,
    contentType:receipt.contentType,redirected:receipt.redirected,
    authorizationHeaderPersisted:receipt.authorizationHeaderPersisted,
    tlsValidationClaim:receipt.tlsValidationClaim,
    rawBodySha256,peerCertSpkiSha256,
    phase41PairSha256,previousReceiptSha256,
    witnessedAt:receipt.witnessedAt
  }),'utf8');
}
export function phase42ReceiptHash(receipt:Phase42RawGetReceipt):string{
  return hash(JSON.stringify(receipt));
}
export function phase42GenesisHash(
  phase41ChainTipSha256:string,calendarPdfSha256:string
):string{
  return hash('ADAPTIVE_PHASE42_ORIGINAL_HTTP_RECEIPT_CHAIN_V1|'+
    phase41ChainTipSha256+'|'+calendarPdfSha256);
}
function signatureOkay(
  w:Phase42ReceiptWitness,
  role:Phase42ReceiptWitness['role'],
  pinnedSpkiSha256:string,payload:Buffer,
  witnessedAt:string
):boolean{
  if(!w||w.role!==role||w.signedAt!==witnessedAt)return false;
  const spki=strictBase64(w.publicKeySpkiDerBase64,4096),
    sig=strictBase64(w.signatureBase64,256);
  if(!spki||!sig||sig.length!==64||
    hash(spki)!==pinnedSpkiSha256)return false;
  try{
    const pk=createPublicKey({key:spki,type:'spki',format:'der'});
    return pk.asymmetricKeyType==='ed25519'&&
      verify(null,payload,pk,sig);
  }catch{return false;}
}
function locallyClaimedPeerCert(
  bytes:Buffer,capturedAt:number
):string|null{
  try{
    const x=new X509Certificate(bytes);
    const names=(x.subjectAltName??'').split(/,\s*/);
    if(!names.includes('DNS:api.upstox.com')||
      capturedAt<Date.parse(x.validFrom)||
      capturedAt>Date.parse(x.validTo))return null;
    const spki=x.publicKey.export({type:'spki',format:'der'}) as Buffer;
    return hash(spki);
  }catch{return null;}
}
/** Compare raw UTF8 JSON body bytes to the exact Phase41 checkpoint
 * response. Extra JSON fields/overwrites/tampered hash fail closed.
 */
export function auditPhase42OriginalGetReceipts(
  bundle:Phase42RawSourceBundle,pins:Phase42IndependentPins
):Phase42ReceiptReport{
  if(!bundle||!pins||
    bundle.schemaVersion!=='ADAPTIVE_PHASE42_RAW_GET_NOTICE_SOURCE_BUNDLE_V1'||
    bundle.source!=='PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED'||
    pins.schemaVersion!=='INDEPENDENT_PHASE42_ORIGINAL_SOURCE_RECEIPT_PINS_V1'||
    !pins.phase41||!SHA.test(pins.expectedOriginalNoticeSha256)||
    !SHA.test(pins.expectedFinalReceiptChainSha256)||
    !Number.isSafeInteger(pins.maxReceiptWitnessAgeMinutes)||
    pins.maxReceiptWitnessAgeMinutes<1||
    pins.maxReceiptWitnessAgeMinutes>120||
    !Array.isArray(bundle.checkpointReceipts)||
    bundle.checkpointReceipts.length<2||
    bundle.checkpointReceipts.length>110||
    !Array.isArray(pins.expectedRawResponseSha256)||
    !Array.isArray(pins.expectedTlsLeafSpkiSha256)||
    pins.expectedRawResponseSha256.length!==bundle.checkpointReceipts.length||
    pins.expectedTlsLeafSpkiSha256.length!==bundle.checkpointReceipts.length||
    pins.expectedRawResponseSha256.some(x=>typeof x!=='string'||!SHA.test(x))||
    pins.expectedTlsLeafSpkiSha256.some(x=>typeof x!=='string'||!SHA.test(x)))
    return reject('INVALID_OR_UNPINNED_ORIGINAL_RECEIPT_SCOPE',
      'INVALID_EVIDENCE');
  const archive=bundle.phase41Archive;
  const phase41=auditPhase41WitnessedSessionCoverage(
    archive,pins.phase41);
  if(phase41.status!==
      'DECLARED_CALENDAR_ALL_BOUNDARIES_DUAL_SIGNED_UNVERIFIED'||
    phase41.brokerOriginAuthenticated!==false||
    phase41.executionAuthorized!==false||
    phase41.brokerStopInstalled!==false)
    return reject('PHASE41_FULL_SESSION_WITNESS_REAUDIT_BLOCKED');
  const notice=bundle.originalCalendarNotice;
  if(!notice||
    notice.source!=='OPERATOR_ARCHIVED_EXCHANGE_NOTICE_UNVERIFIED'||
    notice.mediaType!=='application/pdf'||
    notice.sourceUrl!==archive.calendar.referencedSourceUrl||
    pins.expectedOriginalNoticeSha256!==
      archive.calendar.referencedOriginalSourceSha256||
    pins.expectedOriginalNoticeSha256!==
      pins.phase41.referencedOriginalSourceSha256)
    return reject('EXCHANGE_NOTICE_SOURCE_SCOPE_MISMATCH',
      'INVALID_EVIDENCE');
  const pdf=strictBase64(notice.originalPdfBase64,2_000_000);
  if(!pdf||pdf.length<100||
    pdf.subarray(0,5).toString('latin1')!=='%PDF-'||
    !pdf.subarray(Math.max(0,pdf.length-1024))
      .toString('latin1').includes('%%EOF')||
    hash(pdf)!==pins.expectedOriginalNoticeSha256)
    return reject('EXACT_ORIGINAL_EXCHANGE_NOTICE_PDF_BYTES_UNAVAILABLE_OR_HASH_MISMATCH',
      'INVALID_EVIDENCE');
  if(bundle.checkpointReceipts.length!==archive.links.length*2)
    return reject('MISSING_OR_EXTRA_ORIGINAL_GET_RECEIPT_BOUNDARIES',
      'INVALID_EVIDENCE');
  let previous=phase42GenesisHash(
    pins.phase41.expectedLastLinkSha256,pins.expectedOriginalNoticeSha256);
  let validBodies=0,validCerts=0,validSigs=0;
  for(let n=0;n<bundle.checkpointReceipts.length;n++){
    const receipt=bundle.checkpointReceipts[n],
      pair=archive.phase40Gtt.overnightPairs[Math.floor(n/2)],
      reference=n%2===0?pair?.beforeClose:pair?.afterOpen,
      expectedSide=n%2===0?'BEFORE_CLOSE':'AFTER_OPEN';
    const partial={originalNoticeBytesHashMatched:true,
      parsedOriginalGetBodiesMatched:validBodies,
      claimedTlsLeafCertificatesLocallyValid:validCerts,
      verifiedReceiptWitnessSignatures:validSigs,
      receiptsReviewed:n,phase41SessionsReaudited:
        phase41.declaredSessionsReviewed};
    if(!receipt||!reference||
      receipt.schemaVersion!==
        'ADAPTIVE_PHASE42_ORIGINAL_GET_BODY_RECEIPT_V1'||
      receipt.source!=='OPERATOR_CAPTURED_TLS_GET_UNVERIFIED'||
      receipt.sequence!==n||
      receipt.checkpoint!==expectedSide||
      receipt.method!=='GET'||receipt.requestedUrl!==URL||
      receipt.finalUrl!==URL||
      receipt.httpStatus!==200||
      receipt.contentType!=='application/json'||
      receipt.redirected!==false||
      receipt.authorizationHeaderPersisted!==false||
      receipt.tlsValidationClaim!==
        'OPERATOR_CLAIMS_HTTPS_HOSTNAME_AND_CA_VALIDATED'||
      receipt.capturedAt!==reference.capturedAt||
      receipt.query?.gtt_order_id!==
        archive.phase40Gtt.position.gttOrderId||
      !Number.isFinite(time(receipt.capturedAt))||
      !Number.isFinite(time(receipt.witnessedAt))||
      time(receipt.witnessedAt)<time(receipt.capturedAt)||
      time(receipt.witnessedAt)-time(receipt.capturedAt)>
        pins.maxReceiptWitnessAgeMinutes*60000)
      return reject('GET_RESPONSE_ENDPOINT_SCOPE_OR_RECEIPT_TIME_MISMATCH',
        'BLOCKED_OR_UNKNOWN',partial);
    const body=strictBase64(receipt.responseUtf8Base64,90_000),
      peer=strictBase64(receipt.tlsPeerCertificateDerBase64,16_000);
    if(!body||!peer||hash(body)!==pins.expectedRawResponseSha256[n])
      return reject('ORIGINAL_GET_BODY_OR_PINNED_HASH_NOT_VERIFIABLE',
        'BLOCKED_OR_UNKNOWN',partial);
    let parsed:unknown;
    try{
      parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
    }catch{
      return reject('INVALID_OR_NON_UTF8_RAW_BROKER_JSON_BODY',
        'BLOCKED_OR_UNKNOWN',partial);
    }
    if(!isDeepStrictEqual(parsed,reference.response))
      return reject('ORIGINAL_GET_BODY_DIFFERS_FROM_SIGNED_PHASE41_SNAPSHOT',
        'BLOCKED_OR_UNKNOWN',partial);
    validBodies++;
    const spki=locallyClaimedPeerCert(peer,time(receipt.capturedAt));
    if(!spki||spki!==pins.expectedTlsLeafSpkiSha256[n])
      return reject('TLS_PEER_CERT_SAN_VALIDITY_OR_SPKI_PIN_DISAGREES',
        'BLOCKED_OR_UNKNOWN',{...partial,parsedOriginalGetBodiesMatched:validBodies});
    validCerts++;
    if(!Array.isArray(receipt.witnesses)||receipt.witnesses.length!==2)
      return reject('MISSING_TWO_PINNED_RECEIPT_WITNESS_SIGNATURES',
        'BLOCKED_OR_UNKNOWN',{...partial,
          parsedOriginalGetBodiesMatched:validBodies,
          claimedTlsLeafCertificatesLocallyValid:validCerts});
    const msg=phase42ReceiptMessage(receipt,
      hash(body),spki,hashPhase40OfflineArchive(pair),previous);
    const capture=receipt.witnesses.find(x=>x?.role==='CAPTURE_OPERATOR'),
      review=receipt.witnesses.find(x=>x?.role==='INDEPENDENT_REVIEWER');
    if(!capture||!review||
      !signatureOkay(capture,'CAPTURE_OPERATOR',
        pins.phase41.expectedCaptureKeySpkiSha256,msg,
        receipt.witnessedAt)||
      !signatureOkay(review,'INDEPENDENT_REVIEWER',
        pins.phase41.expectedReviewKeySpkiSha256,msg,
        receipt.witnessedAt))
      return reject('ORIGINAL_GET_RESPONSE_DUAL_SIGNATURE_INVALID',
        'BLOCKED_OR_UNKNOWN',{...partial,
          parsedOriginalGetBodiesMatched:validBodies,
          claimedTlsLeafCertificatesLocallyValid:validCerts});
    validSigs+=2;
    previous=phase42ReceiptHash(receipt);
  }
  if(previous!==pins.expectedFinalReceiptChainSha256)
    return reject('EXTERNALLY_PINNED_ORIGINAL_RECEIPT_CHAIN_TIP_MISMATCH');
  return {...base(),
    status:'RAW_GET_BYTES_AND_CALENDAR_PDF_DUAL_WITNESSED_UNVERIFIED',
    originalNoticeBytesHashMatched:true,
    parsedOriginalGetBodiesMatched:validBodies,
    claimedTlsLeafCertificatesLocallyValid:validCerts,
    verifiedReceiptWitnessSignatures:validSigs,
    receiptsReviewed:bundle.checkpointReceipts.length,
    phase41SessionsReaudited:phase41.declaredSessionsReviewed};
}
