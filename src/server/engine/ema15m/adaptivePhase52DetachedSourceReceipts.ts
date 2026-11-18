/**
 * Adaptive Swing v2 Phase52 — offline detached Ed25519 receipts over the
 * EXACT Phase50/51 source, calendar and OOS session denominator.
 *
 * Signatures prove control of operator-pinned keys, NOT issuer identity,
 * NSE/BSE authenticity, historical L1 license, market timestamps, a trade,
 * an exchange ACK, overnight stop protection or a profitable model.
 * No broker, network, filesystem or trading side effects.
 */
import {
  createHash,createPublicKey,timingSafeEqual,verify
} from 'node:crypto';
import {
  auditPhase51DeclaredOosSessionCoverage,hashPhase51Evidence,
  type Phase51Input,type Phase51IndependentPins,
  type Phase51Report
} from './adaptivePhase51DeclaredSessionOosLedger.js';

type Role='ORIGINAL_OPTION_L1_REVIEWER'|'SESSION_CALENDAR_REVIEWER';
const ROLES:Role[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
const SHA=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const sha=(v:unknown)=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
const hashBytes=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const millis=(v:unknown):number=>typeof v==='string'&&TIME.test(v)?
  Date.parse(v):NaN;
const safeId=(v:unknown):v is string=>
  typeof v==='string'&&ID.test(v);
const integer=(x:unknown,a:number,b:number):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=a&&x<=b;
const matching=(a:string,b:string):boolean=>
  SHA.test(a)&&SHA.test(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const canonical=(r:Phase52DetachedReceipt):Uint8Array=>
  Buffer.from(JSON.stringify({
    domain:'ADAPTIVE_PHASE52_DETACHED_OOS_SOURCE_RECEIPT_V1',
    role:r.role,
    reviewerId:r.reviewerId,
    organizationId:r.organizationId,
    signedAt:r.signedAt,
    datasetId:r.datasetId,
    phase51InputSha256:r.phase51InputSha256,
    phase51PinsSha256:r.phase51PinsSha256,
    historicalInputSha256:r.historicalInputSha256,
    calendarLedgerSha256:r.calendarLedgerSha256,
    oosSessionManifestSha256:r.oosSessionManifestSha256,
    oosDeclaredSessionCount:r.oosDeclaredSessionCount,
    originalOptionL1RecordCount:r.originalOptionL1RecordCount,
    externalEvidenceDocumentSha256:r.externalEvidenceDocumentSha256,
    externalEvidenceReferenceId:r.externalEvidenceReferenceId
  }),'utf8');
export const hashPhase52Evidence=sha;
export const phase52ReceiptMessage=(r:Phase52DetachedReceipt):Uint8Array=>
  canonical(r);

export interface Phase52TrustRegistry{
  schemaVersion:'OPERATOR_PINNED_PHASE52_EXTERNAL_REVIEWERS_V1';
  trustSource:'OUT_OF_BAND_OPERATOR_PINNED_UNVERIFIED';
  reviewers:Array<{
    role:Role;
    reviewerId:string;
    organizationId:string;
    publicKeySpkiPem:string;
    publicKeySpkiSha256:string;
  }>;
}
export interface Phase52DetachedReceipt{
  schemaVersion:'ADAPTIVE_PHASE52_EXTERNAL_EVIDENCE_RECEIPT_V1';
  role:Role;
  reviewerId:string;
  organizationId:string;
  /** Self-asserted signer clock, not a trusted TSA timestamp. */
  signedAt:string;
  datasetId:string;
  phase51InputSha256:string;
  phase51PinsSha256:string;
  historicalInputSha256:string;
  calendarLedgerSha256:string;
  oosSessionManifestSha256:string;
  oosDeclaredSessionCount:number;
  originalOptionL1RecordCount:number;
  /** Digest of separately retained external source/entitlement artifact. */
  externalEvidenceDocumentSha256:string;
  /** Opaque reference, NOT proof of vendor licensing or issuer identity. */
  externalEvidenceReferenceId:string;
  /** Exact detached Ed25519 signature of phase52ReceiptMessage bytes. */
  signatureBase64:string;
}
export interface Phase52Input{
  schemaVersion:'ADAPTIVE_PHASE52_OFFLINE_EXTERNAL_SOURCE_REVIEW_V1';
  source:'OPERATOR_SUBMITTED_DETACHED_EVIDENCE_UNVERIFIED';
  phase51:Phase51Input;
  phase51Pins:Phase51IndependentPins;
  trustRegistry:Phase52TrustRegistry;
  receipts:Phase52DetachedReceipt[];
}
export interface Phase52Pins{
  schemaVersion:'INDEPENDENT_PHASE52_EXACT_SOURCE_WITNESS_PINS_V1';
  expectedPhase51InputSha256:string;
  expectedPhase51PinsSha256:string;
  expectedRegistrySha256:string;
  expectedReceiptMessageSha256ByRole:Record<Role,string>;
  expectedDocumentSha256ByRole:Record<Role,string>;
}
export interface Phase52Report{
  mode:'OFFLINE_DETACHED_OOS_SOURCE_CALENDAR_EVIDENCE';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'CRYPTOGRAPHIC_BINDINGS_VALID_EXTERNAL_AUTHENTICATION_REQUIRED';
  reasonCodes:string[];
  datasetSynthetic:boolean|null;
  phase51Status:Phase51Report['status']|null;
  declaredOosSessions:number;
  originalOosDecisions:number;
  originalOptionL1RecordCount:number;
  fullOosArmHorizonDenominator:number;
  validDistinctDetachedWitnesses:number;
  distinctReviewerOrganizations:number;
  externallyAuthenticatedVendor:false;
  exchangeCalendarIssuerAuthenticated:false;
  licensedHistoricalOptionL1IndependentlyVerified:false;
  sourceAvailableAtIndependentlyAuthenticated:false;
  reviewerKeyOwnershipIndependentlyVerified:false;
  trustedThirdPartyTimestampEstablished:false;
  actualBrokerOrderAckAuthenticated:false;
  nativeNrmlOvernightStopInstalled:false;
  unbiasedChronologicalOosProfitabilityProven:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'TWO_ED25519_SIGNATURES_VERIFY_ONLY_CONTROL_OF_OPERATOR_PINNED_KEYS',
  'KEY_FINGERPRINT_OR_REVIEWER_ORGANIZATION_CAN_BE_SELF_ASSERTED',
  'SIGNER_SIGNED_AT_IS_NOT_AN_INDEPENDENT_TRUSTED_TIMESTAMP',
  'EXTERNAL_DOCUMENT_DIGEST_IS_NOT_A_LICENSE_OR_AN_ISSUER_SIGNATURE',
  'PASS_REQUIRES_EXACT_PHASE51_AND_PHASE50_REAUDIT_NOT_A_CACHED_PASS',
  'A_SYNTHETIC_FEED_CAN_BE_SIGNED_WITH_REAL_KEYS_WITHOUT_BEING_REAL_MARKET_DATA',
  'MARKET_DATA_USE_RIGHTS_AND_SOURCE_CLOCK_TRUTH_MUST_BE_VERIFIED_OUT_OF_BAND',
  'NO_TRADING_NO_LIVE_NRML_GTT_NO_BROKER_STOP_ACK_NO_POSITIONAL_15_15_EXIT'
];
const blank=():Phase52Report=>({
  mode:'OFFLINE_DETACHED_OOS_SOURCE_CALENDAR_EVIDENCE',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  datasetSynthetic:null,phase51Status:null,
  declaredOosSessions:0,originalOosDecisions:0,
  originalOptionL1RecordCount:0,fullOosArmHorizonDenominator:0,
  validDistinctDetachedWitnesses:0,distinctReviewerOrganizations:0,
  externallyAuthenticatedVendor:false,
  exchangeCalendarIssuerAuthenticated:false,
  licensedHistoricalOptionL1IndependentlyVerified:false,
  sourceAvailableAtIndependentlyAuthenticated:false,
  reviewerKeyOwnershipIndependentlyVerified:false,
  trustedThirdPartyTimestampEstablished:false,
  actualBrokerOrderAckAuthenticated:false,
  nativeNrmlOvernightStopInstalled:false,
  unbiasedChronologicalOosProfitabilityProven:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const deny=(code:string,status:Phase52Report['status']=
  'INVALID_EVIDENCE'):Phase52Report=>({
    ...blank(),status,reasonCodes:[code]
  });
function trustValid(registry:Phase52TrustRegistry):boolean{
  if(!registry||registry.schemaVersion!==
    'OPERATOR_PINNED_PHASE52_EXTERNAL_REVIEWERS_V1'||
    registry.trustSource!=='OUT_OF_BAND_OPERATOR_PINNED_UNVERIFIED'||
    !Array.isArray(registry.reviewers)||
    registry.reviewers.length!==2)return false;
  const roles=new Set<Role>(),organizations=new Set<string>(),
    fingerprints=new Set<string>();
  for(const r of registry.reviewers){
    if(!r||!ROLES.includes(r.role)||!safeId(r.reviewerId)||
      !safeId(r.organizationId)||typeof r.publicKeySpkiPem!=='string'||
      r.publicKeySpkiPem.length>3000||
      typeof r.publicKeySpkiSha256!=='string'||
      !SHA.test(r.publicKeySpkiSha256))return false;
    if(roles.has(r.role)||organizations.has(r.organizationId)||
      fingerprints.has(r.publicKeySpkiSha256))return false;
    roles.add(r.role);organizations.add(r.organizationId);
    fingerprints.add(r.publicKeySpkiSha256);
    try{
      const key=createPublicKey(r.publicKeySpkiPem);
      const original=key.export({type:'spki',format:'der'});
      if(key.asymmetricKeyType!=='ed25519'||
        !matching(hashBytes(original),r.publicKeySpkiSha256))
        return false;
    }catch{return false;}
  }
  return roles.size===2&&organizations.size===2&&fingerprints.size===2;
}
function receiptValid(r:Phase52DetachedReceipt):boolean{
  return !!r&&r.schemaVersion==='ADAPTIVE_PHASE52_EXTERNAL_EVIDENCE_RECEIPT_V1'&&
    ROLES.includes(r.role)&&safeId(r.reviewerId)&&
    safeId(r.organizationId)&&
    Number.isFinite(millis(r.signedAt))&&
    safeId(r.datasetId)&&
    [r.phase51InputSha256,r.phase51PinsSha256,
      r.historicalInputSha256,r.calendarLedgerSha256,
      r.oosSessionManifestSha256,r.externalEvidenceDocumentSha256]
      .every(x=>typeof x==='string'&&SHA.test(x))&&
    integer(r.oosDeclaredSessionCount,1,100000)&&
    integer(r.originalOptionL1RecordCount,1,10000000)&&
    safeId(r.externalEvidenceReferenceId)&&
    typeof r.signatureBase64==='string'&&
    /^[A-Za-z0-9+/]{86}==$/.test(r.signatureBase64);
}
export function auditPhase52DetachedSourceCalendarReceipts(
  input:Phase52Input,pins:Phase52Pins
):Phase52Report{
  if(!input||input.schemaVersion!==
    'ADAPTIVE_PHASE52_OFFLINE_EXTERNAL_SOURCE_REVIEW_V1'||
    input.source!=='OPERATOR_SUBMITTED_DETACHED_EVIDENCE_UNVERIFIED'||
    !pins||pins.schemaVersion!==
    'INDEPENDENT_PHASE52_EXACT_SOURCE_WITNESS_PINS_V1'||
    !input.phase51||!input.phase51Pins||!input.trustRegistry||
    !Array.isArray(input.receipts)||
    input.receipts.length!==2||
    !pins.expectedReceiptMessageSha256ByRole||
    !pins.expectedDocumentSha256ByRole||
    ![pins.expectedPhase51InputSha256,pins.expectedPhase51PinsSha256,
      pins.expectedRegistrySha256].every(x=>typeof x==='string'&&SHA.test(x))||
    !ROLES.every(role=>
      SHA.test(pins.expectedReceiptMessageSha256ByRole[role])&&
      SHA.test(pins.expectedDocumentSha256ByRole[role]))||
    !matching(sha(input.phase51),pins.expectedPhase51InputSha256)||
    !matching(sha(input.phase51Pins),pins.expectedPhase51PinsSha256)||
    !matching(sha(input.trustRegistry),pins.expectedRegistrySha256))
    return deny('PRESPECIFIED_PHASE51_SOURCE_OR_REVIEWER_REGISTRY_PIN_MISMATCH');
  if(!trustValid(input.trustRegistry)||
    !input.receipts.every(receiptValid))
    return deny('MALFORMED_OR_NONINDEPENDENT_SIGNER_REGISTRY_OR_RECEIPTS');
  // Never trust a cached Phase51 / Phase50 status or its denominator.
  let base:Phase51Report;
  try{base=auditPhase51DeclaredOosSessionCoverage(
    input.phase51,input.phase51Pins);}
  catch{return deny('PHASE51_SOURCE_REAUDIT_EXCEPTION','INCOMPLETE_EVIDENCE');}
  const h=input.phase51.phase50.historical;
  const report:Phase52Report={
    ...blank(),datasetSynthetic:base.syntheticDataset,
    phase51Status:base.status,
    declaredOosSessions:base.declaredOosSessions,
    originalOosDecisions:base.originalOosDecisions,
    originalOptionL1RecordCount:Array.isArray(h.executionQuotes)?
      h.executionQuotes.length:0,
    fullOosArmHorizonDenominator:base.fullPhase50OosAttemptDenominator
  };
  if(base.status!=='DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY'||
    base.declaredOosSessions<2||
    base.fullPhase50OosAttemptDenominator!==base.declaredOosSessions*12)
    return {...report,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:['NESTED_PHASE51_PHASE50_ORIGINAL_OOS_EVIDENCE_INCOMPLETE']};
  const seen=new Set<Role>(),organizations=new Set<string>();
  for(const receipt of input.receipts){
    if(seen.has(receipt.role))
      return {...report,status:'INVALID_EVIDENCE',
        reasonCodes:['DUPLICATED_EXTERNAL_REVIEW_ROLE']};
    seen.add(receipt.role);
    const registered=input.trustRegistry.reviewers.find(x=>
      x.role===receipt.role&&x.reviewerId===receipt.reviewerId&&
      x.organizationId===receipt.organizationId);
    if(!registered)
      return {...report,status:'INCOMPLETE_EVIDENCE',
        reasonCodes:['DETACHED_SIGNER_NOT_MATCHED_TO_SEPARATELY_PINNED_ROLE']};
    if(receipt.datasetId!==h.provenance.datasetId||
      !matching(receipt.phase51InputSha256,sha(input.phase51))||
      !matching(receipt.phase51PinsSha256,sha(input.phase51Pins))||
      !matching(receipt.historicalInputSha256,
        sha(input.phase51.phase50.historical))||
      !matching(receipt.calendarLedgerSha256,
        hashPhase51Evidence(input.phase51.calendar))||
      !matching(receipt.oosSessionManifestSha256,
        input.phase51Pins.expectedOriginalOosManifestSha256)||
      receipt.oosDeclaredSessionCount!==base.declaredOosSessions||
      receipt.originalOptionL1RecordCount!==h.executionQuotes.length||
      !matching(receipt.externalEvidenceDocumentSha256,
        pins.expectedDocumentSha256ByRole[receipt.role])||
      !matching(hashBytes(canonical(receipt)),
        pins.expectedReceiptMessageSha256ByRole[receipt.role]))
      return {...report,status:'INCOMPLETE_EVIDENCE',
        reasonCodes:['DETACHED_RECEIPT_SCOPE_NOT_EXACT_OR_NOT_PREDECLARED']};
    try{
      const key=createPublicKey(registered.publicKeySpkiPem);
      const raw=Buffer.from(receipt.signatureBase64,'base64');
      if(raw.length!==64||raw.toString('base64')!==
        receipt.signatureBase64||
        !verify(null,canonical(receipt),key,raw))
        return {...report,status:'INCOMPLETE_EVIDENCE',
          reasonCodes:['DETACHED_REVIEW_SIGNATURE_INVALID']};
    }catch{
      return {...report,status:'INCOMPLETE_EVIDENCE',
        reasonCodes:['DETACHED_REVIEW_SIGNATURE_INVALID']};
    }
    organizations.add(receipt.organizationId);
  }
  if(seen.size!==2||organizations.size!==2)
    return {...report,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:['DISTINCT_ROLE_AND_ORGANIZATION_REVIEW_MISSING']};
  return {...report,validDistinctDetachedWitnesses:2,
    distinctReviewerOrganizations:2,
    status:'CRYPTOGRAPHIC_BINDINGS_VALID_EXTERNAL_AUTHENTICATION_REQUIRED'};
}
