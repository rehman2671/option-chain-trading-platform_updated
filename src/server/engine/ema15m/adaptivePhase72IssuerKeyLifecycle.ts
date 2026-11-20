/**
 * Phase72 OFFLINE candidate issuer key lifecycle + separately signed
 * registrar roster and witness receipt readiness.
 *
 * All issuer/registrar/witness keys are supplied by the dossier operator.
 * Mathematically valid three-role Ed25519 signatures and no-overlap,
 * revocation, chronology checks DO NOT authenticate NSE/BSE, the vendor,
 * a trusted authority, or an independent witness. This is research-only
 * source-consistency screening. No broker, NRML, GTT, stop or live orders.
 */
import {
  createHash,createPublicKey,verify as cryptoVerify
} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase71DetachedIssuerCalendarManifest,
  type Phase71Input,type Phase71IndependentPins,
  type Phase71Report,type Phase71CandidateSignedManifest
} from './adaptivePhase71DetachedCalendarManifest.js';
import type {Phase66OriginalCatalog}
  from './adaptivePhase66StandaloneVendorPreflight.js';

const HEX=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const DER=Buffer.from('302a300506032b6570032100','hex');
const REGISTRY_PREFIX=Buffer.from(
  'ADAPTIVE_PHASE72_REGISTRAR_ISSUER_KEY_ROSTER_V1\n','utf8');
const WITNESS_PREFIX=Buffer.from(
  'ADAPTIVE_PHASE72_INDEPENDENT_CANDIDATE_RECEIPT_V1\n','utf8');
const sha=(b:Uint8Array):string=>createHash('sha256').update(b)
  .digest('hex');
export const hashPhase72Evidence=(v:unknown):string=>
  sha(Buffer.from(JSON.stringify(v),'utf8'));
const ts=(v:unknown):number=>typeof v==='string'&&ISO.test(v)?
  Date.parse(v):NaN;
const integer=(v:unknown,lo:number,hi:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=lo&&v<=hi;
function fromB64(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||s.length<4||s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>0&&b.length<=max&&b.toString('base64')===s?b:null;
  }catch{return null;}
}
function parse<T>(bytes:Buffer):T|null{
  try{
    const v=JSON.parse(new TextDecoder('utf8',{fatal:true})
      .decode(bytes));
    return v&&typeof v==='object'&&!Array.isArray(v)?v as T:null;
  }catch{return null;}
}
function verifyRole(
  signature:Buffer,publicDer:Buffer,original:Buffer,prefix:Buffer
):boolean{
  if(signature.length!==64||publicDer.length!==44||
    !publicDer.subarray(0,12).equals(DER))
    return false;
  try{
    const key=createPublicKey({key:publicDer,format:'der',type:'spki'});
    return key.asymmetricKeyType==='ed25519'&&cryptoVerify(
      null,Buffer.concat([prefix,original]),key,signature);
  }catch{return false;}
}
export interface Phase72CandidateIssuerKey{
  claimedKeyId:string;
  spkiDerSha256:string;
  allowedPurpose:'HISTORICAL_FO_EXCHANGE_LIKE_DAY_ARCHIVE_ONLY';
  effectiveFrom:string;
  effectiveThrough:string;
  status:'ACTIVE'|'REVOKED'|'SUSPENDED'|'RETIRED';
  claimedRevokedAt:null|string;
}
export interface Phase72CandidateRegistrarRoster{
  schemaVersion:'ADAPTIVE_PHASE72_CANDIDATE_REGISTRAR_ROSTER_V1';
  source:'OPERATOR_CUSTODIED_NOT_AUTHENTICATED_REGISTRAR';
  claimedRegistrarId:string;
  claimedIssuerReference:string;
  claimedPublishedAt:string;
  claimedExpiresAt:string;
  keys:Phase72CandidateIssuerKey[];
}
export interface Phase72CandidateWitnessReceipt{
  schemaVersion:'ADAPTIVE_PHASE72_CANDIDATE_OBSERVATION_RECEIPT_V1';
  source:'OPERATOR_CUSTODIED_NOT_TRUSTED_TIME_WITNESS';
  claimedWitnessId:string;
  claimedRegistrarId:string;
  claimedIssuerReference:string;
  claimedObservedAt:string;
  claimedFirstOriginalDecisionAt:string;
  rosterRawSha256:string;
  phase71SignedManifestRawSha256:string;
  originalCalendarArchiveRawSha256:string;
  targetIssuerSpkiDerSha256:string;
}
export interface Phase72Input{
  schemaVersion:'ADAPTIVE_PHASE72_CANDIDATE_KEY_LIFECYCLE_V1';
  source:'OFFLINE_THREE_ROLE_SIGNATURES_NO_ISSUER_TRUST';
  phase71:Phase71Input;
  phase71Pins:Phase71IndependentPins;
  candidateRegistrarRosterRawBase64:string;
  candidateRegistrarDetachedSignatureBase64:string;
  candidateRegistrarPublicSpkiDerBase64:string;
  candidateWitnessReceiptRawBase64:string;
  candidateWitnessDetachedSignatureBase64:string;
  candidateWitnessPublicSpkiDerBase64:string;
}
export interface Phase72Pins{
  schemaVersion:'INDEPENDENT_PHASE72_CANDIDATE_REGISTRAR_WITNESS_PINS_V1';
  phase71InputSha256:string;
  phase71PinsSha256:string;
  registrarRosterRawSha256:string;
  registrarDetachedSignatureSha256:string;
  registrarPublicSpkiDerSha256:string;
  witnessReceiptRawSha256:string;
  witnessDetachedSignatureSha256:string;
  witnessPublicSpkiDerSha256:string;
  expectedClaimedIssuerReference:string;
  expectedClaimedRegistrarId:string;
  expectedClaimedWitnessId:string;
  expectedOriginalOosDecisions:number;
  expectedOriginalNoEntryDays:number;
  expectedListedCePePairs:number;
  expectedOriginalArchiveCalendarDays:number;
}
export interface Phase72Report{
  mode:'OFFLINE_CANDIDATE_ISSUER_REGISTRAR_WITNESS_KEY_LIFECYCLE_QUARANTINE';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_THREE_ROLE_CRYPTO_CONSISTENCY_UNTRUSTED_ONLY';
  reasonCodes:string[];
  phase71Status:Phase71Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisions:number;
  originalNoEntryDays:number;
  originalListedCePePairs:number;
  originalArchiveCalendarDays:number;
  candidateRegistrarSignatureMathematicallyValid:boolean;
  candidateWitnessSignatureMathematicallyValid:boolean;
  candidateIssuerRegistrarWitnessKeysPairwiseDistinct:boolean;
  candidateIssuerKeyPresentActiveAtClaimedSigningTime:boolean;
  candidateRosterHasNonOverlappingActiveKeyWindows:boolean;
  candidateWitnessReceiptBindingsAndClaimedClockConsistent:boolean;
  candidateRegistrarRosterIsOfficial:false;
  candidateWitnessIndependentlyAuthenticated:false;
  candidateIssuerPublicKeyOfficiallyTrusted:false;
  historicalKeyRevocationIndependentlyVerified:false;
  actualIndependentPublicationClockVerified:false;
  officialExchangeHolidaysAndContractExpiryVerified:false;
  legalOptionHistoricalL1DataLicenseVerified:false;
  actualOriginalSourceClientAvailableAtTrusted:false;
  originalBidAskAreExecutableBrokerFills:false;
  unenteredListedOptionBecomesRealPosition:false;
  marketRegimeOosProfitabilityProven:false;
  ivThetaAndOvernightGapDebitLossCalibrated:false;
  wholeLongOptionPaidPremiumDebitProtected:false;
  recommendedOneToEightWeekHorizonAuthorized:false;
  brokerNativeNrmlGttStopChildExchangeAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  externalEvidenceRequired:string[];
}
const NEED=[
  'INDEPENDENT_OFFICIAL_EXCHANGE_ISSUER_KEY_ROSTER_AND_REAL_REGISTRAR_ROOT_AUTHENTICATION',
  'INDEPENDENT_AUTHENTICATED_RECEIPT_WITNESS_AND_TRUSTED_ARCHIVAL_PUBLICATION_TIME',
  'OFFICIALLY_AUTHENTICATED_HISTORICAL_FO_HOLIDAY_SPECIAL_SESSION_EXPIRY_LOT_MASTER',
  'VERIFIED_LICENCE_TO_RESEARCH_FULL_DURATION_ORIGINAL_OPTION_BID_ASK_DEPTH',
  'TRUE_CONTEMPORANEOUS_CLIENT_RECEIVE_TIMES_IF_ACTUALLY_CAPTURED',
  'FULL_1W_2W_4W_8W_UNTOUCHED_MULTIREGIME_OOS_IV_THETA_GAP_FULL_PREMIUM_DEBIT_RISK',
  'BROKER_NATIVE_NRML_STOP_GTT_EXCHANGE_CHILD_ACK_OVERNIGHT_NONFILL_EVIDENCE'
];
function empty():Phase72Report{
  return {
    mode:'OFFLINE_CANDIDATE_ISSUER_REGISTRAR_WITNESS_KEY_LIFECYCLE_QUARANTINE',
    status:'INVALID_EVIDENCE',reasonCodes:[],
    phase71Status:null,syntheticDataset:null,
    originalOosDecisions:0,originalNoEntryDays:0,
    originalListedCePePairs:0,originalArchiveCalendarDays:0,
    candidateRegistrarSignatureMathematicallyValid:false,
    candidateWitnessSignatureMathematicallyValid:false,
    candidateIssuerRegistrarWitnessKeysPairwiseDistinct:false,
    candidateIssuerKeyPresentActiveAtClaimedSigningTime:false,
    candidateRosterHasNonOverlappingActiveKeyWindows:false,
    candidateWitnessReceiptBindingsAndClaimedClockConsistent:false,
    candidateRegistrarRosterIsOfficial:false,
    candidateWitnessIndependentlyAuthenticated:false,
    candidateIssuerPublicKeyOfficiallyTrusted:false,
    historicalKeyRevocationIndependentlyVerified:false,
    actualIndependentPublicationClockVerified:false,
    officialExchangeHolidaysAndContractExpiryVerified:false,
    legalOptionHistoricalL1DataLicenseVerified:false,
    actualOriginalSourceClientAvailableAtTrusted:false,
    originalBidAskAreExecutableBrokerFills:false,
    unenteredListedOptionBecomesRealPosition:false,
    marketRegimeOosProfitabilityProven:false,
    ivThetaAndOvernightGapDebitLossCalibrated:false,
    wholeLongOptionPaidPremiumDebitProtected:false,
    recommendedOneToEightWeekHorizonAuthorized:false,
    brokerNativeNrmlGttStopChildExchangeAckVerified:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    externalEvidenceRequired:NEED
  };
}
const reject=(reason:string,status:Phase72Report['status']='INVALID_EVIDENCE',
  extra?:Partial<Phase72Report>):Phase72Report=>({
  ...empty(),...extra,status,reasonCodes:[reason]
});
export function auditPhase72CandidateIssuerKeyLifecycle(
  input:Phase72Input,pins:Phase72Pins
):Phase72Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE72_CANDIDATE_KEY_LIFECYCLE_V1'||
    input.source!=='OFFLINE_THREE_ROLE_SIGNATURES_NO_ISSUER_TRUST'||
    !input.phase71||!input.phase71Pins||!pins||
    pins.schemaVersion!==
      'INDEPENDENT_PHASE72_CANDIDATE_REGISTRAR_WITNESS_PINS_V1'||
    ![pins.phase71InputSha256,pins.phase71PinsSha256,
      pins.registrarRosterRawSha256,
      pins.registrarDetachedSignatureSha256,
      pins.registrarPublicSpkiDerSha256,
      pins.witnessReceiptRawSha256,
      pins.witnessDetachedSignatureSha256,
      pins.witnessPublicSpkiDerSha256].every(v=>
      typeof v==='string'&&HEX.test(v))||
    ![pins.expectedClaimedIssuerReference,
      pins.expectedClaimedRegistrarId,
      pins.expectedClaimedWitnessId].every(v=>
      typeof v==='string'&&ID.test(v))||
    !integer(pins.expectedOriginalOosDecisions,2,50000)||
    !integer(pins.expectedOriginalNoEntryDays,0,50000)||
    !integer(pins.expectedListedCePePairs,8,2000000)||
    !integer(pins.expectedOriginalArchiveCalendarDays,1,500)||
    pins.expectedOriginalNoEntryDays>pins.expectedOriginalOosDecisions||
    hashPhase72Evidence(input.phase71)!==pins.phase71InputSha256||
    hashPhase72Evidence(input.phase71Pins)!==pins.phase71PinsSha256)
    return reject('PHASE72_PARENT_OR_SEPARATE_ROLE_PINS_INVALID');
  const bytes=fromB64(input.candidateRegistrarRosterRawBase64,300000),
    signature=fromB64(input.candidateRegistrarDetachedSignatureBase64,128),
    key=fromB64(input.candidateRegistrarPublicSpkiDerBase64,256),
    receiptBytes=fromB64(input.candidateWitnessReceiptRawBase64,20000),
    receiptSig=fromB64(input.candidateWitnessDetachedSignatureBase64,128),
    receiptKey=fromB64(input.candidateWitnessPublicSpkiDerBase64,256),
    originalIssuerKey=fromB64(
      input.phase71.candidateSignerPublicSpkiDerBase64,256),
    originalManifest=fromB64(
      input.phase71.claimedSignedManifestRawBase64,12000),
    originalCalendar=fromB64(
      input.phase71.phase70.separatelySuppliedClaimedExchangeDayArchiveBase64,
      5_000_000);
  if(!bytes||!signature||!key||!receiptBytes||!receiptSig||
    !receiptKey||!originalIssuerKey||!originalManifest||!originalCalendar)
    return reject('PHASE72_CANDIDATE_THREE_ROLE_RAW_BYTES_MISSING');
  if(sha(bytes)!==pins.registrarRosterRawSha256||
    sha(signature)!==pins.registrarDetachedSignatureSha256||
    sha(key)!==pins.registrarPublicSpkiDerSha256||
    sha(receiptBytes)!==pins.witnessReceiptRawSha256||
    sha(receiptSig)!==pins.witnessDetachedSignatureSha256||
    sha(receiptKey)!==pins.witnessPublicSpkiDerSha256)
    return reject('PHASE72_DETACHED_ROLE_BYTES_DO_NOT_MATCH_SEPARATE_PINS');
  if(!verifyRole(signature,key,bytes,REGISTRY_PREFIX))
    return reject('PHASE72_CANDIDATE_REGISTRAR_ED25519_SIGNATURE_INVALID');
  const registrar={candidateRegistrarSignatureMathematicallyValid:true};
  if(!verifyRole(receiptSig,receiptKey,receiptBytes,WITNESS_PREFIX))
    return reject('PHASE72_CANDIDATE_WITNESS_ED25519_SIGNATURE_INVALID',
      'INVALID_EVIDENCE',registrar);
  const signed={
    ...registrar,candidateWitnessSignatureMathematicallyValid:true
  };
  if(key.equals(receiptKey)||key.equals(originalIssuerKey)||
    receiptKey.equals(originalIssuerKey))
    return reject('PHASE72_SIGNER_REGISTRAR_WITNESS_KEYS_NOT_DISTINCT',
      'INCOMPLETE_EVIDENCE',signed);
  const distinct={
    ...signed,candidateIssuerRegistrarWitnessKeysPairwiseDistinct:true
  };
  const roster=parse<Phase72CandidateRegistrarRoster>(bytes),
    receipt=parse<Phase72CandidateWitnessReceipt>(receiptBytes),
    manifest=parse<Phase71CandidateSignedManifest>(originalManifest);
  if(!roster||!receipt||!manifest||
    roster.schemaVersion!=='ADAPTIVE_PHASE72_CANDIDATE_REGISTRAR_ROSTER_V1'||
    roster.source!=='OPERATOR_CUSTODIED_NOT_AUTHENTICATED_REGISTRAR'||
    receipt.schemaVersion!==
      'ADAPTIVE_PHASE72_CANDIDATE_OBSERVATION_RECEIPT_V1'||
    receipt.source!=='OPERATOR_CUSTODIED_NOT_TRUSTED_TIME_WITNESS'||
    !Array.isArray(roster.keys)||roster.keys.length<1||
    roster.keys.length>60||
    roster.claimedIssuerReference!==pins.expectedClaimedIssuerReference||
    roster.claimedRegistrarId!==pins.expectedClaimedRegistrarId||
    receipt.claimedIssuerReference!==pins.expectedClaimedIssuerReference||
    receipt.claimedRegistrarId!==pins.expectedClaimedRegistrarId||
    receipt.claimedWitnessId!==pins.expectedClaimedWitnessId||
    manifest.claimedIssuerReference!==pins.expectedClaimedIssuerReference||
    !ID.test(manifest.claimedSignerKeyId??''))
    return reject('PHASE72_CLAIMED_REGISTRAR_WITNESS_ISSUER_OR_SCOPE_INVALID',
      'INCOMPLETE_EVIDENCE',distinct);
  const claimedSigned=ts(manifest.claimedSignedAt),
    published=ts(roster.claimedPublishedAt),
    expired=ts(roster.claimedExpiresAt),
    observed=ts(receipt.claimedObservedAt),
    firstDecision=ts(receipt.claimedFirstOriginalDecisionAt);
  if(![claimedSigned,published,expired,observed,firstDecision]
    .every(Number.isFinite)||
    published>claimedSigned||published>observed||
    observed<claimedSigned||
    observed>firstDecision||claimedSigned>firstDecision||
    observed>expired||expired<published)
    return reject('PHASE72_CLAIMED_REGISTRY_WITNESS_ORIGINAL_OOS_ASOF_INVALID',
      'INCOMPLETE_EVIDENCE',distinct);
  const seenIds=new Set<string>(),ranges:{
    from:number;through:number;id:string
  }[]=[];
  let matching=0,activeMatch=false;
  for(const entry of roster.keys){
    const from=ts(entry.effectiveFrom),through=ts(entry.effectiveThrough);
    if(!ID.test(entry.claimedKeyId??'')||
      !HEX.test(entry.spkiDerSha256??'')||
      entry.allowedPurpose!==
        'HISTORICAL_FO_EXCHANGE_LIKE_DAY_ARCHIVE_ONLY'||
      !['ACTIVE','REVOKED','SUSPENDED','RETIRED'].includes(entry.status)||
      !Number.isFinite(from)||!Number.isFinite(through)||
      from>through||seenIds.has(entry.claimedKeyId)||
      (entry.status==='ACTIVE'&&entry.claimedRevokedAt!==null)||
      (entry.status==='REVOKED'&&
        !Number.isFinite(ts(entry.claimedRevokedAt)))||
      (entry.status!=='REVOKED'&&entry.claimedRevokedAt!==null))
      return reject('PHASE72_ROSTER_DUPLICATE_INVALID_KEY_EPOCH_OR_REVOCATION',
        'INCOMPLETE_EVIDENCE',distinct);
    seenIds.add(entry.claimedKeyId);
    if(entry.status==='ACTIVE')ranges.push({
      from,through,id:entry.claimedKeyId
    });
    if(entry.claimedKeyId===manifest.claimedSignerKeyId){
      matching++;
      if(entry.spkiDerSha256!==sha(originalIssuerKey))
        return reject('PHASE72_REGISTRAR_KEY_ID_SPKI_REBOUND_TO_OTHER_SIGNER',
          'INCOMPLETE_EVIDENCE',distinct);
      activeMatch=entry.status==='ACTIVE'&&
        from<=claimedSigned&&claimedSigned<=through&&
        from<=published&&observed<=through;
    }
  }
  if(matching!==1||!activeMatch)
    return reject('PHASE72_SIGNING_ISSUER_KEY_ABSENT_INACTIVE_OR_REVOKED',
      'INCOMPLETE_EVIDENCE',distinct);
  const keyActive={
    ...distinct,candidateIssuerKeyPresentActiveAtClaimedSigningTime:true
  };
  ranges.sort((a,b)=>a.from-b.from);
  if(ranges.some((v,i)=>i>0&&v.from<=ranges[i-1].through))
    return reject('PHASE72_ACTIVE_KEY_EPOCHS_OVERLAP_AMBIGUOUS_ROTATION',
      'INCOMPLETE_EVIDENCE',keyActive);
  const windows={
    ...keyActive,candidateRosterHasNonOverlappingActiveKeyWindows:true
  };
  const catalogBytes=fromB64(
    input.phase71.phase70.phase69.phase68.phase67.originalVendor
      .newVendorFullListedCatalogBase64,25_000_000);
  const originalCatalog=catalogBytes?
    parse<Phase66OriginalCatalog>(catalogBytes):null;
  const originalDecisionTimes=originalCatalog?.decisions?.map(d=>
    Date.parse(d.decisionAt))??[];
  const earliestActualDecision=Math.min(...originalDecisionTimes);
  if(!originalDecisionTimes.length||
    originalDecisionTimes.some(x=>!Number.isFinite(x))||
    !Number.isFinite(earliestActualDecision)||
    firstDecision!==earliestActualDecision)
    return reject('PHASE72_WITNESS_CLAIMED_FIRST_OOS_RECEIPT_TIMESTAMP_NOT_ORIGINAL',
      'INCOMPLETE_EVIDENCE',windows);
  // Source-pinned receipt MUST bind original full issued content, not only
  // its claimed witness date or an attacker-chosen second cohort.
  if(receipt.rosterRawSha256!==sha(bytes)||
    receipt.phase71SignedManifestRawSha256!==sha(originalManifest)||
    receipt.originalCalendarArchiveRawSha256!==sha(originalCalendar)||
    receipt.targetIssuerSpkiDerSha256!==sha(originalIssuerKey))
    return reject('PHASE72_WITNESS_RECEIPT_REPLAYS_OTHER_ORIGINAL_SOURCE',
      'INCOMPLETE_EVIDENCE',windows);
  const arrival={
    ...windows,candidateWitnessReceiptBindingsAndClaimedClockConsistent:true
  };
  let parent:Phase71Report;
  try{parent=auditPhase71DetachedIssuerCalendarManifest(
    input.phase71,input.phase71Pins);}
  catch{return reject('PHASE71_ORIGINAL_DETACHED_SIGNATURE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE',arrival);}
  const counters={
    ...arrival,phase71Status:parent.status,
    syntheticDataset:parent.syntheticDataset,
    originalOosDecisions:parent.originalOosDecisions,
    originalNoEntryDays:parent.originalNoEntryDays,
    originalListedCePePairs:parent.originallyListedCePePairs,
    originalArchiveCalendarDays:parent.originalArchiveCalendarDays
  };
  if(!parent.status.startsWith('DESCRIPTIVE_')||
    parent.originalOosDecisions!==pins.expectedOriginalOosDecisions||
    parent.originalNoEntryDays!==pins.expectedOriginalNoEntryDays||
    parent.originallyListedCePePairs!==pins.expectedListedCePePairs||
    parent.originalArchiveCalendarDays!==
      pins.expectedOriginalArchiveCalendarDays)
    return reject('PHASE72_FULL_PARENT_OPTION_OOS_AND_SIGNING_GATE_NOT_READY',
      'INCOMPLETE_EVIDENCE',counters);
  return {...empty(),...counters,
    status:'DESCRIPTIVE_THREE_ROLE_CRYPTO_CONSISTENCY_UNTRUSTED_ONLY',
    reasonCodes:[
      'LOCAL_ISSUER_REGISTRAR_WITNESS_SIGNATURES_MATCH_ROLE_PINNED_BYTES',
      'CANDIDATE_SIGNER_KEY_EPOCH_ROTATION_AND_REVOCATION_SCREENED',
      'CLAIMED_RECEIPT_CLOCK_AND_PARENT_ORIGINAL_OOS_BOUND_NOT_TRUSTED_TIME',
      'EXCHANGE_REGISTRAR_WITNESS_IDENTITIES_NOT_EXTERNALLY_AUTHENTICATED'
    ]};
}
