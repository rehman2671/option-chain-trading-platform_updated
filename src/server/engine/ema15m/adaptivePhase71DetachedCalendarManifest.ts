/**
 * Phase71 — OFFLINE detached Ed25519 verification of a separate claimed
 * calendar/holiday archive distribution manifest.
 *
 * Checks cryptographic consistency of signed MANIFEST RAW BYTES, which
 * bind the exact Phase70 claimed third-source archive raw SHA256 and
 * exact parent Phase70 input/pins. Ed25519 key bytes and "issuer" claims
 * are operator-provided. The independently pinned candidate public key
 * is NOT an authenticated NSE/BSE/exchange trust anchor. Test-only keys
 * can sign invented history and pass every cryptographic check.
 *
 * No exchange/vendor/broker network, orders, GTT, stops, signed
 * exchange identity promotion or positional 15:15 close.
 */
import {
  createHash,createPublicKey,verify as cryptoVerify
} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase70ExchangeDayExceptions,
  type Phase70Input,type Phase70Pins,type Phase70Report,
  type Phase70ClaimedExchangeArchive
} from './adaptivePhase70SessionExceptionEvidence.js';

const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const PREFIX=Buffer.from(
  'ADAPTIVE_PHASE71_HISTORIC_SESSION_ARCHIVE_ED25519_MANIFEST_V1\n','utf8');
const SPKI_PREFIX=Buffer.from('302a300506032b6570032100','hex');
const sha=(b:Uint8Array):string=>createHash('sha256').update(b)
  .digest('hex');
export const hashPhase71Evidence=(v:unknown):string=>
  sha(Buffer.from(JSON.stringify(v),'utf8'));
const date=(s:unknown):number=>typeof s==='string'&&DATE.test(s)?
  Date.parse(s+'T00:00:00Z'):NaN;
const time=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
const natural=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
function base64(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||!s.length||s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>0&&b.length<=max&&
      b.toString('base64')===s?b:null;
  }catch{return null;}
}
function parse<T>(b:Buffer):T|null{
  try{
    const data=JSON.parse(
      new TextDecoder('utf8',{fatal:true}).decode(b));
    return data&&typeof data==='object'&&!Array.isArray(data)?
      data as T:null;
  }catch{return null;}
}
export interface Phase71CandidateSignedManifest{
  schemaVersion:'ADAPTIVE_PHASE71_DETACHED_CALENDAR_MANIFEST_V1';
  audience:'ADAPTIVE_V2_OFFLINE_RESEARCH_NONEXECUTABLE';
  purpose:'CLAIMED_FO_HISTORICAL_CALENDAR_HOLIDAY_EXCEPTION_DISTRIBUTION';
  signatureAlgorithm:'Ed25519';
  claimedIssuerReference:string;
  claimedArchiveReference:string;
  claimedSignerKeyId:string;
  claimedSignedAt:string;
  claimedSignerKeyEffectiveFrom:string;
  claimedSignerKeyEffectiveThrough:string;
  archiveCoveredFrom:string;
  archiveCoveredThrough:string;
  archiveRawSha256:string;
  phase70InputSha256:string;
  phase70PinsSha256:string;
  originalCalendarDayRows:number;
}
export interface Phase71Input{
  schemaVersion:'ADAPTIVE_PHASE71_SIGNED_CANDIDATE_CALENDAR_SOURCE_V1';
  source:'OWNER_PRIVATE_CANDIDATE_ED25519_SIGNER_UNTRUSTED';
  phase70:Phase70Input;
  phase70Pins:Phase70Pins;
  /** Unmodified signed manifest raw bytes, not normalized JSON string. */
  claimedSignedManifestRawBase64:string;
  /** Ed25519 detached signature over PREFIX || EXACT manifest bytes. */
  claimedDetachedSignatureBase64:string;
  /** Candidate signer SPKI DER (fixed Ed25519 encoding), not a trust root. */
  candidateSignerPublicSpkiDerBase64:string;
}
export interface Phase71IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE71_DETACHED_CANDIDATE_SOURCE_PINS_V1';
  expectedPhase70InputSha256:string;
  expectedPhase70PinsSha256:string;
  expectedManifestRawBytesSha256:string;
  expectedOriginalDayArchiveRawBytesSha256:string;
  expectedCandidateSignerSpkiDerSha256:string;
  expectedDetachedSignatureBytesSha256:string;
  expectedClaimedSignerKeyId:string;
  expectedClaimedIssuerReference:string;
  expectedClaimedArchiveReference:string;
  expectedOriginalOosDecisions:number;
  expectedOriginalNoEntryDays:number;
  expectedOriginalListedCePePairs:number;
  expectedArchiveCalendarDays:number;
}
export interface Phase71Report{
  mode:'OFFLINE_CANDIDATE_DETACHED_ED25519_CALENDAR_MANIFEST_INTEGRITY';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_CRYPTO_CONSISTENT_UNTRUSTED_ISSUER_ONLY';
  reasonCodes:string[];
  parentPhase70Status:Phase70Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisions:number;
  originalNoEntryDays:number;
  originallyListedCePePairs:number;
  originalArchiveCalendarDays:number;
  candidatePublicKeyDerShapeValid:boolean;
  candidateDetachedEd25519SignatureCryptographicallyValid:boolean;
  signedManifestExactOriginalCalendarHashMatched:boolean;
  signedManifestBindsExactPhase70InputsAndPins:boolean;
  claimedManifestChronologyStructurallyCausal:boolean;
  independentExchangeIssuerKeyTrustAnchorEstablished:false;
  claimedSignerSelfSignedTestIsNotExchangeSignature:true;
  signedClaimedTimeIsNotIndependentTrustedTimestamp:true;
  independentlyVerifiedOriginalExchangeCalendar:false;
  independentlyVerifiedVendorHistoricalOptionL1License:false;
  historicallyTrustedClientStrategyAvailableAt:false;
  originalOptionBidAskQuoteIsActualExecutionFill:false;
  originalNoEntryBecomesActualPosition:false;
  independentlyProvenMultiregimeProfitableStrategy:false;
  independentlyCalibratedIvThetaSpreadAndOvernightRisk:false;
  entirePaidLongOptionPremiumDebitLossEliminated:false;
  bestOneToEightWeekExpiryAuthorized:false;
  brokerNativeNrmlGttStopChildExchangeAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  externalRequirements:string[];
}
const NEED=[
  'AUTHENTICATED_EXCHANGE_ISSUER_PUBLIC_KEY_FROM_AN_INDEPENDENT_OFFICIAL_CHANNEL_NOT_THIS_PACKAGE',
  'EXTERNAL_PUBLISHER_DELIVERY_OR_TIMESTAMP_ATTESTATION_NOT_JUST_CLAIMED_SIGNED_AT',
  'GENUINE_OFFICIAL_HISTORICAL_EXCHANGE_HOLIDAY_SPECIAL_SESSION_AND_EXPIRY_LOT_DOCUMENT_PROVENANCE',
  'LICENSED_ORIGINAL_FULL_DURATION_FO_OPTION_BID_ASK_DEPTH_AND_LEGAL_RESEARCH_SCOPE',
  'ACTUAL_CONTEMPORANEOUS_CLIENT_HISTORICAL_RECEIPT_IF_CAPTURED_NOT_BULK_DOWNLOAD',
  'UNTOUCHED_REAL_MULTIREGIME_FULL_DURATION_OOS_OPTION_RISK_AND_PAID_DEBIT_LOSS',
  'BROKER_NATIVE_NRML_GTT_STOP_CHILD_ORDER_ACK_AND_OVERNIGHT_NONFILL'
];
function blank():Phase71Report{
  return {
    mode:'OFFLINE_CANDIDATE_DETACHED_ED25519_CALENDAR_MANIFEST_INTEGRITY',
    status:'INVALID_EVIDENCE',reasonCodes:[],
    parentPhase70Status:null,syntheticDataset:null,
    originalOosDecisions:0,originalNoEntryDays:0,
    originallyListedCePePairs:0,originalArchiveCalendarDays:0,
    candidatePublicKeyDerShapeValid:false,
    candidateDetachedEd25519SignatureCryptographicallyValid:false,
    signedManifestExactOriginalCalendarHashMatched:false,
    signedManifestBindsExactPhase70InputsAndPins:false,
    claimedManifestChronologyStructurallyCausal:false,
    independentExchangeIssuerKeyTrustAnchorEstablished:false,
    claimedSignerSelfSignedTestIsNotExchangeSignature:true,
    signedClaimedTimeIsNotIndependentTrustedTimestamp:true,
    independentlyVerifiedOriginalExchangeCalendar:false,
    independentlyVerifiedVendorHistoricalOptionL1License:false,
    historicallyTrustedClientStrategyAvailableAt:false,
    originalOptionBidAskQuoteIsActualExecutionFill:false,
    originalNoEntryBecomesActualPosition:false,
    independentlyProvenMultiregimeProfitableStrategy:false,
    independentlyCalibratedIvThetaSpreadAndOvernightRisk:false,
    entirePaidLongOptionPremiumDebitLossEliminated:false,
    bestOneToEightWeekExpiryAuthorized:false,
    brokerNativeNrmlGttStopChildExchangeAckVerified:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    externalRequirements:NEED
  };
}
const reject=(reason:string,status:Phase71Report['status']='INVALID_EVIDENCE',
  fields?:Partial<Phase71Report>):Phase71Report=>({
  ...blank(),...fields,status,reasonCodes:[reason]
});
export function auditPhase71DetachedIssuerCalendarManifest(
  input:Phase71Input,pins:Phase71IndependentPins
):Phase71Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE71_SIGNED_CANDIDATE_CALENDAR_SOURCE_V1'||
    input.source!=='OWNER_PRIVATE_CANDIDATE_ED25519_SIGNER_UNTRUSTED'||
    !input.phase70||!input.phase70Pins||!pins||
    pins.schemaVersion!==
      'INDEPENDENT_PHASE71_DETACHED_CANDIDATE_SOURCE_PINS_V1'||
    ![pins.expectedPhase70InputSha256,pins.expectedPhase70PinsSha256,
      pins.expectedManifestRawBytesSha256,
      pins.expectedOriginalDayArchiveRawBytesSha256,
      pins.expectedCandidateSignerSpkiDerSha256,
      pins.expectedDetachedSignatureBytesSha256].every(x=>
      typeof x==='string'&&HEX.test(x))||
    !ID.test(pins.expectedClaimedSignerKeyId??'')||
    !ID.test(pins.expectedClaimedIssuerReference??'')||
    !ID.test(pins.expectedClaimedArchiveReference??'')||
    !natural(pins.expectedOriginalOosDecisions,2,50000)||
    !natural(pins.expectedOriginalNoEntryDays,0,50000)||
    !natural(pins.expectedOriginalListedCePePairs,8,2000000)||
    !natural(pins.expectedArchiveCalendarDays,1,500)||
    pins.expectedOriginalNoEntryDays>pins.expectedOriginalOosDecisions||
    hashPhase71Evidence(input.phase70)!==
      pins.expectedPhase70InputSha256||
    hashPhase71Evidence(input.phase70Pins)!==
      pins.expectedPhase70PinsSha256)
    return reject('PHASE71_PARENT_OR_INDEPENDENT_SIGNING_PINS_INVALID');
  const manifestBytes=base64(input.claimedSignedManifestRawBase64,12000),
    signature=base64(input.claimedDetachedSignatureBase64,128),
    publicDer=base64(input.candidateSignerPublicSpkiDerBase64,256),
    archiveBytes=base64(
      input.phase70.separatelySuppliedClaimedExchangeDayArchiveBase64,
      5_000_000);
  if(!manifestBytes||!signature||!publicDer||!archiveBytes)
    return reject('PHASE71_ORIGINAL_SIGNED_MANIFEST_SIGNATURE_KEY_OR_ARCHIVE_MISSING');
  if(sha(manifestBytes)!==pins.expectedManifestRawBytesSha256||
    sha(signature)!==pins.expectedDetachedSignatureBytesSha256||
    sha(publicDer)!==pins.expectedCandidateSignerSpkiDerSha256||
    sha(archiveBytes)!==pins.expectedOriginalDayArchiveRawBytesSha256)
    return reject('PHASE71_SIGNED_ORIGINAL_BYTES_OR_KEY_NOT_INDEPENDENTLY_PINNED');
  if(publicDer.length!==44||
    !publicDer.subarray(0,12).equals(SPKI_PREFIX)||
    signature.length!==64)
    return reject('PHASE71_CANDIDATE_ED25519_SPKI_OR_SIGNATURE_SHAPE_INVALID');
  const shape={candidatePublicKeyDerShapeValid:true};
  const signedInput=Buffer.concat([PREFIX,manifestBytes]);
  try{
    const key=createPublicKey({key:publicDer,format:'der',type:'spki'});
    if(key.asymmetricKeyType!=='ed25519'||
      !cryptoVerify(null,signedInput,key,signature))
      return reject('PHASE71_DETACHED_MANIFEST_SIGNATURE_NOT_CRYPTOGRAPHICALLY_VALID',
        'INVALID_EVIDENCE',shape);
  }catch{
    return reject('PHASE71_DETACHED_MANIFEST_SIGNATURE_NOT_CRYPTOGRAPHICALLY_VALID',
      'INVALID_EVIDENCE',shape);
  }
  const cryptoFields={
    ...shape,candidateDetachedEd25519SignatureCryptographicallyValid:true
  };
  const m=parse<Phase71CandidateSignedManifest>(manifestBytes),
    archive=parse<Phase70ClaimedExchangeArchive>(archiveBytes);
  if(!m||!archive||
    Object.keys(m).length!==16||
    m.schemaVersion!=='ADAPTIVE_PHASE71_DETACHED_CALENDAR_MANIFEST_V1'||
    m.audience!=='ADAPTIVE_V2_OFFLINE_RESEARCH_NONEXECUTABLE'||
    m.purpose!==
      'CLAIMED_FO_HISTORICAL_CALENDAR_HOLIDAY_EXCEPTION_DISTRIBUTION'||
    m.signatureAlgorithm!=='Ed25519'||
    m.claimedIssuerReference!==pins.expectedClaimedIssuerReference||
    m.claimedArchiveReference!==pins.expectedClaimedArchiveReference||
    m.claimedSignerKeyId!==pins.expectedClaimedSignerKeyId||
    m.claimedIssuerReference!==archive.claimedIssuerReference||
    m.claimedArchiveReference!==archive.claimedArchiveReference||
    m.archiveCoveredFrom!==archive.coveredFrom||
    m.archiveCoveredThrough!==archive.coveredThrough||
    m.originalCalendarDayRows!==archive.days?.length||
    m.originalCalendarDayRows!==pins.expectedArchiveCalendarDays||
    !HEX.test(m.archiveRawSha256??'')||
    !HEX.test(m.phase70InputSha256??'')||
    !HEX.test(m.phase70PinsSha256??'')||
    !Number.isFinite(date(m.archiveCoveredFrom))||
    !Number.isFinite(date(m.archiveCoveredThrough)))
    return reject('PHASE71_DETACHED_MANIFEST_OR_SOURCE_IDENTITY_WRONG',
      'INVALID_EVIDENCE',cryptoFields);
  if(m.archiveRawSha256!==sha(archiveBytes)||
    m.archiveRawSha256!==pins.expectedOriginalDayArchiveRawBytesSha256)
    return reject('PHASE71_SIGNED_MANIFEST_DOES_NOT_BIND_EXACT_DAY_ARCHIVE',
      'INCOMPLETE_EVIDENCE',cryptoFields);
  const archiveFields={
    ...cryptoFields,signedManifestExactOriginalCalendarHashMatched:true
  };
  if(m.phase70InputSha256!==pins.expectedPhase70InputSha256||
    m.phase70PinsSha256!==pins.expectedPhase70PinsSha256)
    return reject('PHASE71_SIGNED_MANIFEST_REPLAYS_OTHER_OOS_PARENT_SOURCE',
      'INCOMPLETE_EVIDENCE',archiveFields);
  const bindFields={
    ...archiveFields,signedManifestBindsExactPhase70InputsAndPins:true
  };
  const signedAt=time(m.claimedSignedAt),
    keyFrom=time(m.claimedSignerKeyEffectiveFrom),
    keyTo=time(m.claimedSignerKeyEffectiveThrough),
    firstOos=date(m.archiveCoveredFrom);
  if(![signedAt,keyFrom,keyTo,firstOos].every(Number.isFinite)||
    keyFrom>signedAt||signedAt>keyTo||signedAt>firstOos||
    firstOos>date(m.archiveCoveredThrough))
    return reject('PHASE71_SIGNED_CLAIMED_TIME_KEY_WINDOW_OR_OOS_ASOF_NONCAUSAL',
      'INCOMPLETE_EVIDENCE',bindFields);
  const chronology={
    ...bindFields,claimedManifestChronologyStructurallyCausal:true
  };
  let parent:Phase70Report;
  try{
    parent=auditPhase70ExchangeDayExceptions(input.phase70,input.phase70Pins);
  }catch{return reject('PHASE70_ORIGINAL_CALENDAR_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE',chronology);}
  const context={
    ...chronology,parentPhase70Status:parent.status,
    syntheticDataset:parent.syntheticDataset,
    originalOosDecisions:parent.originalOosDecisions,
    originalNoEntryDays:parent.originalNoEntryDays,
    originallyListedCePePairs:parent.originalAllListedCePePairs,
    originalArchiveCalendarDays:parent.sourceClaimedCalendarDays
  };
  if(!parent.status.startsWith('DESCRIPTIVE_')||
    parent.originalOosDecisions!==pins.expectedOriginalOosDecisions||
    parent.originalNoEntryDays!==pins.expectedOriginalNoEntryDays||
    parent.originalAllListedCePePairs!==
      pins.expectedOriginalListedCePePairs||
    parent.sourceClaimedCalendarDays!==pins.expectedArchiveCalendarDays)
    return reject('PHASE71_ORIGINAL_FULL_OOS_ARCHIVE_SOURCE_DENOMINATORS_CHANGED',
      'INCOMPLETE_EVIDENCE',context);
  return {...blank(),...context,
    status:'DESCRIPTIVE_CRYPTO_CONSISTENT_UNTRUSTED_ISSUER_ONLY',
    reasonCodes:[
      'ED25519_VALID_FOR_OPERATOR_SUPPLIED_PINNED_KEY_AND_ORIGINAL_MANIFEST',
      'SIGNED_MANIFEST_BINDS_EXACT_ORIGINAL_DAY_SOURCE_AND_PHASE70_OOS_PINS',
      'CANDIDATE_SIGNER_HAS_NO_AUTHENTICATED_OFFICIAL_ISSUER_TRUST_ANCHOR',
      'SELF_CLAIMED_SIGNING_TIME_LICENSE_BID_FILLED_EXITS_AND_NRML_ACK_UNKNOWN'
    ]};
}
