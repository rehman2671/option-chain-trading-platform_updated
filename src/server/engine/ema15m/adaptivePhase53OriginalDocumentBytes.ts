/**
 * Adaptive Swing v2 Phase53 — ORIGINAL DOCUMENT BYTE CUSTODY (offline only).
 *
 * Phase52 verified detached Ed25519 signatures of operator-asserted hashes;
 * it did not require the corresponding original documentary BYTES.
 * This module makes each claimed evidence document's actual bytes mandatory,
 * hashes them, and joins them to its signed receipt and predeclared pins.
 *
 * Verifying a byte hash does NOT authenticate an exchange, licensed vendor,
 * reviewer identity, source capture timestamps, original PDF signature,
 * profitable OOS performance, broker ACK or overnight stop.
 * No FS, network, broker, GTT, orders or execution imports.
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import {
  auditPhase52DetachedSourceCalendarReceipts,
  type Phase52Input,type Phase52Pins,type Phase52Report
} from './adaptivePhase52DetachedSourceReceipts.js';

export type Phase53DocumentRole=
  'ORIGINAL_OPTION_L1_REVIEWER'|'SESSION_CALENDAR_REVIEWER';
const ROLES:Phase53DocumentRole[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
const SHA=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const MAX_DOCUMENT_BYTES=4_194_304;
const hash=(x:unknown):string=>createHash('sha256')
  .update(JSON.stringify(x)).digest('hex');
const hashBytes=(x:Uint8Array):string=>createHash('sha256')
  .update(x).digest('hex');
const equalSha=(a:unknown,b:unknown):boolean=>
  typeof a==='string'&&typeof b==='string'&&
  SHA.test(a)&&SHA.test(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const isInt=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
export const hashPhase53Evidence=hash;

export interface Phase53OriginalDocument {
  role:Phase53DocumentRole;
  /** Must match exact opaque reference in corresponding signed Phase52 receipt. */
  externalEvidenceReferenceId:string;
  /** Genuine supplied bytes, NOT a separate operator-typed digest. */
  bytes:Uint8Array;
}
export interface Phase53Input {
  schemaVersion:'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1';
  source:'OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED';
  phase52:Phase52Input;
  phase52Pins:Phase52Pins;
  documents:Phase53OriginalDocument[];
}
export interface Phase53IndependentPins {
  schemaVersion:'INDEPENDENT_PHASE53_DOCUMENT_BYTE_CUSTODY_PINS_V1';
  expectedPhase52InputSha256:string;
  expectedPhase52PinsSha256:string;
  expectedDocumentSha256ByRole:Record<Phase53DocumentRole,string>;
  expectedDocumentByteLengthByRole:Record<Phase53DocumentRole,number>;
  expectedDatasetId:string;
  expectedDeclaredOosSessions:number;
  expectedOriginalOptionL1QuoteRows:number;
  expectedFullOosArmHorizonAttempts:number;
}
export interface Phase53Report {
  mode:'OFFLINE_ORIGINAL_EXTERNAL_DOCUMENT_BYTE_CUSTODY';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'ORIGINAL_DOCUMENT_BYTES_MATCH_SIGNED_RECEIPTS_ONLY';
  reasonCodes:string[];
  phase52Status:Phase52Report['status']|null;
  datasetSynthetic:boolean|null;
  verifiedDocumentRoles:number;
  distinctOriginalDocumentDigests:number;
  claimedOriginalDocumentBytesVerified:number;
  declaredOosSessions:number;
  originalOptionL1QuoteRows:number;
  fullOosArmHorizonAttempts:number;
  externalDocumentIssuerAuthenticated:false;
  originalDocumentCmsSignatureAuthenticated:false;
  independentVendorHistoricalLicenseVerified:false;
  exchangeSessionIssuerAuthenticated:false;
  exchangeOriginalL1FeedAuthenticated:false;
  sourceAvailableAtIndependentlyVerified:false;
  reviewerIndependenceAndKeyCustodyVerified:false;
  originalDocumentExternalTrustedTimestampVerified:false;
  strategyOosProfitabilityProven:false;
  genuineBrokerNativeStopAckVerified:false;
  nrmlOvernightProtectionProven:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'EXACT_ORIGINAL_DOCUMENT_BYTES_ARE_REQUIRED_NOT_ONLY_OPERATOR_TYPED_SHA256',
  'SIGNED_RECEIPT_BINDS_SUPPLIED_BYTES_NOT_A_GENUINE_ISSUER_OR_ENTITLEMENT',
  'ORIGINAL_DOCUMENT_FORMAT_OR_PDF_CMS_SIGNATURE_IS_NOT_VALIDATED_HERE',
  'TWO_OPERATOR_PINNED_SIGNERS_DO_NOT_PROVE_INDEPENDENT_REVIEWER_CUSTODY',
  'NO_INDEPENDENT_NSE_BSE_CALENDAR_CONTRACT_MASTER_OR_VENDOR_L1_AUTHENTICATION',
  'NO_REAL_EXECUTABLE_L1_SOURCE_CLOCK_PROFITABILITY_OR_BROKER_STOP_ACK',
  'NO_LIVE_NRML_ORDER_GTT_WRITE_OR_POSITIONAL_15_15_EXIT'
];
const empty=():Phase53Report=>({
  mode:'OFFLINE_ORIGINAL_EXTERNAL_DOCUMENT_BYTE_CUSTODY',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase52Status:null,datasetSynthetic:null,
  verifiedDocumentRoles:0,distinctOriginalDocumentDigests:0,
  claimedOriginalDocumentBytesVerified:0,
  declaredOosSessions:0,originalOptionL1QuoteRows:0,
  fullOosArmHorizonAttempts:0,
  externalDocumentIssuerAuthenticated:false,
  originalDocumentCmsSignatureAuthenticated:false,
  independentVendorHistoricalLicenseVerified:false,
  exchangeSessionIssuerAuthenticated:false,
  exchangeOriginalL1FeedAuthenticated:false,
  sourceAvailableAtIndependentlyVerified:false,
  reviewerIndependenceAndKeyCustodyVerified:false,
  originalDocumentExternalTrustedTimestampVerified:false,
  strategyOosProfitabilityProven:false,
  genuineBrokerNativeStopAckVerified:false,
  nrmlOvernightProtectionProven:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const deny=(reason:string,status:Phase53Report['status']=
  'INVALID_EVIDENCE'):Phase53Report=>({
    ...empty(),status,reasonCodes:[reason]
  });
function validPins(p:Phase53IndependentPins):boolean{
  return !!p&&p.schemaVersion===
    'INDEPENDENT_PHASE53_DOCUMENT_BYTE_CUSTODY_PINS_V1'&&
    typeof p.expectedDatasetId==='string'&&ID.test(p.expectedDatasetId)&&
    typeof p.expectedPhase52InputSha256==='string'&&
    SHA.test(p.expectedPhase52InputSha256)&&
    typeof p.expectedPhase52PinsSha256==='string'&&
    SHA.test(p.expectedPhase52PinsSha256)&&
    !!p.expectedDocumentSha256ByRole&&
    Object.keys(p.expectedDocumentSha256ByRole).length===2&&
    !!p.expectedDocumentByteLengthByRole&&
    Object.keys(p.expectedDocumentByteLengthByRole).length===2&&
    ROLES.every(role=>
      typeof p.expectedDocumentSha256ByRole[role]==='string'&&
      SHA.test(p.expectedDocumentSha256ByRole[role])&&
      isInt(p.expectedDocumentByteLengthByRole[role],64,MAX_DOCUMENT_BYTES))&&
    isInt(p.expectedDeclaredOosSessions,2,100000)&&
    isInt(p.expectedOriginalOptionL1QuoteRows,1,10000000)&&
    p.expectedFullOosArmHorizonAttempts===p.expectedDeclaredOosSessions*12;
}
function validDocument(d:Phase53OriginalDocument):boolean{
  return !!d&&ROLES.includes(d.role)&&
    typeof d.externalEvidenceReferenceId==='string'&&
    ID.test(d.externalEvidenceReferenceId)&&
    d.bytes instanceof Uint8Array&&
    d.bytes.length>=64&&d.bytes.length<=MAX_DOCUMENT_BYTES;
}
/** No source bytes, document references, key PEMs or instrument keys in output. */
export function auditPhase53OriginalDocumentByteCustody(
  input:Phase53Input,pins:Phase53IndependentPins
):Phase53Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1'||
    input.source!=='OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED'||
    !input.phase52||!input.phase52Pins||!validPins(pins)||
    !equalSha(hash(input.phase52),pins.expectedPhase52InputSha256)||
    !equalSha(hash(input.phase52Pins),pins.expectedPhase52PinsSha256)||
    !Array.isArray(input.documents)||input.documents.length!==2||
    !input.documents.every(validDocument))
    return deny('ORIGINAL_DOCUMENT_SOURCE_OR_PREDECLARED_PINS_INVALID');
  const original=input.phase52.phase51?.phase50?.historical;
  if(!original||!Array.isArray(original.executionQuotes)||
    original.provenance?.datasetId!==pins.expectedDatasetId)
    return deny('ORIGINAL_SOURCE_DATASET_ID_OR_L1_SCHEMA_MISMATCH');
  const roles=new Set<Phase53DocumentRole>();
  const digests=new Set<string>();
  let verifiedBytes=0;
  for(const doc of input.documents){
    if(roles.has(doc.role))
      return deny('DUPLICATED_OR_MISSING_DOCUMENT_ROLE');
    roles.add(doc.role);
    const digest=hashBytes(doc.bytes);
    if(digests.has(digest))
      return deny('DUPLICATED_EXTERNAL_DOCUMENT_BYTES_ACROSS_REVIEW_ROLES');
    digests.add(digest);
    const receipt=input.phase52.receipts?.find(r=>r?.role===doc.role);
    if(!receipt||receipt.externalEvidenceReferenceId!==
      doc.externalEvidenceReferenceId||
      !equalSha(digest,receipt.externalEvidenceDocumentSha256)||
      !equalSha(digest,pins.expectedDocumentSha256ByRole[doc.role])||
      doc.bytes.length!==pins.expectedDocumentByteLengthByRole[doc.role]||
      !equalSha(digest,
        input.phase52Pins.expectedDocumentSha256ByRole?.[doc.role]))
      return deny('ORIGINAL_DOCUMENT_BYTES_OR_REFERENCE_MISMATCH_SIGNED_EVIDENCE',
        'INCOMPLETE_EVIDENCE');
    verifiedBytes+=doc.bytes.length;
  }
  if(roles.size!==2)return deny('BOTH_ORIGINAL_DOCUMENT_ROLES_REQUIRED');
  // Must independently rerun Phase52, Phase51, Phase50 and the
  // entire entry-first OOS cohort; a cached status is never sufficient.
  let prior:Phase52Report;
  try{
    prior=auditPhase52DetachedSourceCalendarReceipts(
      input.phase52,input.phase52Pins);
  }catch{
    return deny('PHASE52_ORIGINAL_SOURCE_REAUDIT_EXCEPTION','INCOMPLETE_EVIDENCE');
  }
  const report:Phase53Report={
    ...empty(),phase52Status:prior.status,
    datasetSynthetic:prior.datasetSynthetic,
    verifiedDocumentRoles:2,
    distinctOriginalDocumentDigests:digests.size,
    claimedOriginalDocumentBytesVerified:verifiedBytes,
    declaredOosSessions:prior.declaredOosSessions,
    originalOptionL1QuoteRows:prior.originalOptionL1RecordCount,
    fullOosArmHorizonAttempts:prior.fullOosArmHorizonDenominator
  };
  if(prior.status!==
      'CRYPTOGRAPHIC_BINDINGS_VALID_EXTERNAL_AUTHENTICATION_REQUIRED'||
    prior.validDistinctDetachedWitnesses!==2||
    prior.distinctReviewerOrganizations!==2)
    return {...report,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:['PHASE52_SIGNED_ORIGINAL_SOURCE_OR_CALENDAR_REAUDIT_FAILED']};
  if(prior.declaredOosSessions!==pins.expectedDeclaredOosSessions||
    prior.originalOptionL1RecordCount!==pins.expectedOriginalOptionL1QuoteRows||
    prior.fullOosArmHorizonDenominator!==
      pins.expectedFullOosArmHorizonAttempts||
    prior.fullOosArmHorizonDenominator!==prior.declaredOosSessions*12)
    return {...report,status:'INCOMPLETE_EVIDENCE',
      reasonCodes:['PREDECLARED_ORIGINAL_OOS_DENOMINATOR_OR_L1_COUNT_MISMATCH']};
  return {...report,status:'ORIGINAL_DOCUMENT_BYTES_MATCH_SIGNED_RECEIPTS_ONLY'};
}
