/**
 * Phase 16 — OFFLINE cryptographic evidence binding, NOT issuer authentication.
 *
 * The operator must provide a separately retained vendor feed archive,
 * full source bundle, separate complete-day calendar ledger + original bytes,
 * and two DETACHED Ed25519 reviewer signatures rooted in OUT-OF-BAND
 * operator-pinned public keys. Signing a manufactured document with one's own
 * keys is NOT proof the NSE/BSE or a licensed vendor actually issued data.
 *
 * No network, broker, orders, API keys, environment trust override, expiry
 * predictions, live positions, or data export. No status authorizes trading.
 */
import {
  createHash,createPublicKey,verify,timingSafeEqual,type KeyObject
} from 'node:crypto';
import {auditAdaptiveSourceArtifact} from './adaptiveSourceArtifactAudit.js';
import {
  auditAdaptiveCrossSourceExchangeCalendar,
  type CrossSourceCalendarReport,
  type IndependentlySuppliedCalendarEvidence
} from './adaptiveCrossSourceCalendarAudit.js';
import type {VerifiedHistoricalBundleV1} from './adaptiveVendorIngestion.js';

export type WitnessRole='CALENDAR_REVIEWER'|'ORIGINAL_L1_REVIEWER';
const ROLES:WitnessRole[]=['CALENDAR_REVIEWER','ORIGINAL_L1_REVIEWER'];
const SHA=/^[a-f0-9]{64}$/;
const safeId=(x:unknown):x is string=>
  typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,127}$/.test(x);
const validTime=(x:unknown):x is string=>typeof x==='string'&&
  /^\d{4}-\d\d-\d\dT/.test(x)&&/(Z|[+-]\d\d:\d\d)$/.test(x)&&
  Number.isFinite(Date.parse(x));
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const sameSha=(a:string,b:string)=>SHA.test(a)&&SHA.test(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const warnings=[
  'ED25519_SIGNATURE_PROVES_ONLY_POSSESSION_OF_THE_OPERATOR_PINNED_PRIVATE_KEY',
  'PINNED_PUBLIC_KEY_ORIGIN_AND_REVIEWER_IDENTITY_NOT_AUTHENTICATED_BY_THIS_TOOL',
  'A_FORGED_CALENDAR_AND_FEED_CAN_BE_SELF_SIGNED_IF_OPERATOR_TRUST_IS_COMPROMISED',
  'DETACHED_SIGNATURE_TIMESTAMP_HAS_NO_INDEPENDENT_TRUSTED_TIMESTAMP_AUTHORITY',
  'CALENDAR_DOCUMENT_DIGEST_AND_VENDOR_ARTIFACT_DIGEST_ARE_NOT_LICENSING_PROOFS',
  'SOURCE_L1_FEED_EVENT_AND_STRATEGY_AVAILABILITY_CLOCKS_NOT_INDEPENDENTLY_PROVEN',
  'DESCRIPTIVE_EVIDENCE_DOES_NOT_AUTHORIZE_BROKER_ORDERS_OR_ESTABLISH_PNL_EDGE',
  'NSE_BSE_VENDOR_LICENSE_ORIGINAL_DATA_AND_BROKER_PROTECTION_STILL_NEED_MANUAL_REVIEW'
];
export interface OperatorPinnedReviewerTrust {
  schemaVersion:'ADAPTIVE_OPERATOR_PINNED_REVIEWERS_V1';
  /** Self-declared metadata: registry must be approved OUTSIDE the data bundle. */
  trustSource:'OPERATOR_PINNED_UNVERIFIED';
  reviewers:Array<{
    reviewerId:string;
    role:WitnessRole;
    publicKeySpkiPem:string;
    publicKeySpkiSha256:string;
  }>;
}
export interface DetachedWitness {
  role:WitnessRole;
  reviewerId:string;
  /** Untrusted statement clock; signature cannot prove signing date. */
  signedAt:string;
  /** Base64-encoded detached 64-byte Ed25519 signature of exact payload. */
  signatureBase64:string;
}
export interface ResearchEvidenceWitnessEnvelope {
  schemaVersion:'ADAPTIVE_SIGNED_RESEARCH_EVIDENCE_V1';
  studyProtocolId:string;
  datasetId:string;
  instrument:'NIFTY'|'BANKNIFTY'|'SENSEX';
  bundleSha256:string;
  vendorArtifactSha256:string;
  calendarManifestSha256:string;
  calendarDocumentSha256:string;
  calendarCoverageStart:string;
  calendarCoverageEnd:string;
  witnesses:DetachedWitness[];
}
export interface SignedEvidenceReviewReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  nativeBrokerProtectionInstalled:false;
  exchangeIssuerAuthenticated:false;
  vendorDataOriginAuthenticated:false;
  originalAvailabilityClockAuthenticated:false;
  historicalLicenseIndependentlyVerified:false;
  reviewerIdentityIndependentlyAuthenticated:false;
  trustedTimestampEstablished:false;
  pinnedTrustRegistryDigestMatched:boolean;
  operatorPinnedTrustRegistrySha256:string|null;
  status:'REJECTED'|'BLOCKED_INCOMPLETE_EVIDENCE'|
    'SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED';
  datasetId:string|null;
  synthetic:boolean|null;
  errors:string[];
  blockers:string[];
  warnings:string[];
  sourceChecksumMatched:boolean;
  calendarChecksumMatched:boolean;
  reviewedExchangeCalendarConsistent:boolean;
  signedPayloadSha256ByRole:Partial<Record<WitnessRole,string>>;
  validDetachedWitnessCount:number;
  pinnedKeyFingerprintByRole:Partial<Record<WitnessRole,string>>;
  bundleSha256:string|null;
  calendarManifestSha256:string|null;
  calendarSourceDocumentSha256:string|null;
  originalVendorArchiveSha256:string|null;
  calendarBlockers:string[];
  externalReviewChecklist:string[];
}
const checklist=[
  'AUTHENTICATE_NSE_BSE_ORIGINAL_CALENDAR_ISSUER_AND_SOURCE_RECORDS_OUT_OF_BAND',
  'AUTHENTICATE_VENDOR_LICENSED_FEED_AND_ALL_ORIGINAL_EVENT_CLOCKS_OUT_OF_BAND',
  'VERIFY_REVIEWER_KEY_FINGERPRINTS_AND_INDEPENDENCE_FROM_OPERATOR_TRUST_CHAIN',
  'VERIFY_IMMUTABLE_THIRD_PARTY_TIMESTAMP_OF_ORIGINAL_SIGNED_EVIDENCE',
  'VERIFY_OFFICIAL_SPECIAL_HOLIDAYS_EXPIRIES_AND_ORIGINAL_LISTED_CONTRACTS',
  'COMPLETE_PHASE10_L1_PATHS_AND_PHASE13_14_OOS_STRESS_EVIDENCE',
  'SEPARATELY_APPROVE_REAL_BROKER_NATIVE_NRML_PROTECTIVE_STOP_RESTART_SAFETY'
];
const baseReport=():SignedEvidenceReviewReport=>({
  mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
  profitabilityProven:false,nativeBrokerProtectionInstalled:false,
  exchangeIssuerAuthenticated:false,vendorDataOriginAuthenticated:false,
  originalAvailabilityClockAuthenticated:false,
  historicalLicenseIndependentlyVerified:false,
  reviewerIdentityIndependentlyAuthenticated:false,
  trustedTimestampEstablished:false,
  pinnedTrustRegistryDigestMatched:false,
  operatorPinnedTrustRegistrySha256:null,
  status:'REJECTED',datasetId:null,synthetic:null,errors:[],blockers:[],
  warnings,sourceChecksumMatched:false,calendarChecksumMatched:false,
  reviewedExchangeCalendarConsistent:false,
  signedPayloadSha256ByRole:{},validDetachedWitnessCount:0,
  pinnedKeyFingerprintByRole:{},bundleSha256:null,
  calendarManifestSha256:null,calendarSourceDocumentSha256:null,
  originalVendorArchiveSha256:null,calendarBlockers:[],
  externalReviewChecklist:checklist
});
const reject=(r:SignedEvidenceReviewReport,reason:string)=>
  ({...r,status:'REJECTED' as const,
    errors:[...new Set([...r.errors,reason])]});
function parseFile<T>(bytes:Uint8Array|undefined|null,max:number):T|null{
  if(!bytes||bytes.length<2||bytes.length>max)return null;
  try {
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const parsed=JSON.parse(text) as T;
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?
      parsed:null;
  } catch{return null;}
}
function keyObject(pem:string):KeyObject|null{
  try {
    const key=createPublicKey(pem);
    return key.asymmetricKeyType==='ed25519'&&key.type==='public'?
      key:null;
  } catch{return null;}
}
export interface WitnessSigningFields {
  studyProtocolId:string;
  datasetId:string;
  instrument:string;
  bundleSha256:string;
  vendorArtifactSha256:string;
  calendarManifestSha256:string;
  calendarDocumentSha256:string;
  calendarCoverageStart:string;
  calendarCoverageEnd:string;
}
/**
 * Precisely versioned domain-separated UTF-8 signed message.
 * Fixed field order; reviewer role/id/time are INSIDE the signed bytes.
 * This does NOT authenticate who controls a public/private key.
 */
export function buildAdaptiveEvidenceWitnessPayload(
  fields:WitnessSigningFields,
  reviewer:{role:WitnessRole;reviewerId:string;signedAt:string}
):Uint8Array{
  const payload={
    purpose:'ADAPTIVE_RESEARCH_OFFLINE_SOURCE_REVIEW_NOT_TRADING_APPROVAL',
    schemaVersion:'ADAPTIVE_SIGNED_RESEARCH_EVIDENCE_V1',
    studyProtocolId:fields.studyProtocolId,
    datasetId:fields.datasetId,instrument:fields.instrument,
    bundleSha256:fields.bundleSha256,
    vendorArtifactSha256:fields.vendorArtifactSha256,
    calendarManifestSha256:fields.calendarManifestSha256,
    calendarDocumentSha256:fields.calendarDocumentSha256,
    calendarCoverageStart:fields.calendarCoverageStart,
    calendarCoverageEnd:fields.calendarCoverageEnd,
    role:reviewer.role,reviewerId:reviewer.reviewerId,signedAt:reviewer.signedAt
  };
  return Buffer.from('ADAPTIVE_OFFLINE_EVIDENCE_ED25519_V1\n'+
    JSON.stringify(payload),'utf8');
}
/** All files are provided as raw byte arrays so signatures bind actual bytes. */
export function auditAdaptiveSignedEvidenceWitness(input:{
  bundleBytes:Uint8Array|undefined|null;
  vendorArchiveBytes:Uint8Array|undefined|null;
  calendarManifestBytes:Uint8Array|undefined|null;
  calendarDocumentBytes:Uint8Array|undefined|null;
  operatorTrustRegistryBytes:Uint8Array|undefined|null;
  /** Digest pinned OUTSIDE the registry, e.g. by an offline operator. */
  expectedOperatorTrustRegistrySha256:string|undefined|null;
  envelope:ResearchEvidenceWitnessEnvelope|unknown;
}):SignedEvidenceReviewReport{
  const base=baseReport();
  const raw=parseFile<VerifiedHistoricalBundleV1>(input.bundleBytes,50*1024*1024);
  const cal=parseFile<IndependentlySuppliedCalendarEvidence>(
    input.calendarManifestBytes,1024*1024);
  if(!raw||!cal)
    return reject(base,'INVALID_OR_MISSING_ORIGINAL_BUNDLE_OR_CALENDAR_FILE_BYTES');
  const report={
    ...base,datasetId:raw.provenance?.datasetId??null,
    synthetic:raw.provenance?.synthetic??null,
    bundleSha256:sha(input.bundleBytes!),
    calendarManifestSha256:sha(input.calendarManifestBytes!),
    originalVendorArchiveSha256:input.vendorArchiveBytes?.length?
      sha(input.vendorArchiveBytes):null,
    calendarSourceDocumentSha256:input.calendarDocumentBytes?.length?
      sha(input.calendarDocumentBytes):null
  };
  const artifact=auditAdaptiveSourceArtifact(raw,input.vendorArchiveBytes);
  if(artifact.status!=='CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED')
    return reject(report,'ORIGINAL_L1_ARCHIVE_SHA256_GATE_NOT_SATISFIED');
  const calendarAudit:CrossSourceCalendarReport=
    auditAdaptiveCrossSourceExchangeCalendar(raw,cal,input.calendarDocumentBytes);
  if(calendarAudit.status==='REJECTED')
    return reject(report,'PHASE15_SEPARATE_CALENDAR_DOCUMENT_REJECTED');
  const state={
    ...report,sourceChecksumMatched:true,
    calendarChecksumMatched:calendarAudit.sourceChecksumMatched,
    reviewedExchangeCalendarConsistent:
      calendarAudit.status==='CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED',
    calendarBlockers:calendarAudit.blockers
  };
  const e=input.envelope as ResearchEvidenceWitnessEnvelope|null;
  const trustDigest=input.operatorTrustRegistryBytes?.length?
    sha(input.operatorTrustRegistryBytes):null;
  if(!trustDigest||!input.expectedOperatorTrustRegistrySha256||
     !sameSha(trustDigest,input.expectedOperatorTrustRegistrySha256))
    return reject(state,'OUT_OF_BAND_PINNED_REGISTRY_DIGEST_MISMATCH');
  const pinnedState={
    ...state,pinnedTrustRegistryDigestMatched:true,
    operatorPinnedTrustRegistrySha256:trustDigest
  };
  const trust=parseFile<OperatorPinnedReviewerTrust>(
    input.operatorTrustRegistryBytes,256*1024);
  if(!trust||trust.schemaVersion!=='ADAPTIVE_OPERATOR_PINNED_REVIEWERS_V1'||
     trust.trustSource!=='OPERATOR_PINNED_UNVERIFIED'||
     !Array.isArray(trust.reviewers)||trust.reviewers.length!==2)
    return reject(pinnedState,'INVALID_OR_MISSING_OUT_OF_BAND_PINNED_REVIEWER_REGISTRY');
  if(!e||e.schemaVersion!=='ADAPTIVE_SIGNED_RESEARCH_EVIDENCE_V1'||
     !safeId(e.studyProtocolId)||!safeId(e.datasetId)||
     !['NIFTY','BANKNIFTY','SENSEX'].includes(e.instrument)||
     !Array.isArray(e.witnesses)||e.witnesses.length!==2)
    return reject(pinnedState,'INVALID_OR_MISSING_SIGNED_EVIDENCE_ENVELOPE');
  const claims:[string,string][]=[
    [e.datasetId,raw.provenance.datasetId],
    [e.instrument,raw.instrument],
    [e.bundleSha256,report.bundleSha256!],
    [e.vendorArtifactSha256,raw.provenance.sourceArtifactSha256],
    [e.calendarManifestSha256,report.calendarManifestSha256!],
    [e.calendarDocumentSha256,cal.originalDocumentSha256],
    [e.calendarCoverageStart,cal.coverageStart],
    [e.calendarCoverageEnd,cal.coverageEnd]
  ];
  if(claims.some(([a,b])=>a!==b))
    return reject(pinnedState,'SIGNED_ENVELOPE_NOT_BOUND_TO_EXACT_ORIGINAL_FILES');
  if(!sameSha(e.vendorArtifactSha256,report.originalVendorArchiveSha256!)||
     !sameSha(e.calendarDocumentSha256,report.calendarSourceDocumentSha256!))
    return reject(pinnedState,'SOURCE_DOCUMENT_HASH_MISMATCH_INSIDE_SIGNED_ENVELOPE');
  const trustedKeys=new Map<WitnessRole,{reviewerId:string;key:KeyObject;fingerprint:string}>();
  const uniqueIds=new Set<string>(),uniqueFingerprints=new Set<string>();
  for(const reviewer of trust.reviewers){
    if(!reviewer||!ROLES.includes(reviewer.role)||
       !safeId(reviewer.reviewerId)||
       typeof reviewer.publicKeySpkiPem!=='string'||
       reviewer.publicKeySpkiPem.length>2048||
       !SHA.test(reviewer.publicKeySpkiSha256)||
       uniqueIds.has(reviewer.reviewerId)||
       trustedKeys.has(reviewer.role))
      return reject(pinnedState,'MALFORMED_OR_DUPLICATE_PINNED_REVIEWER');
    const key=keyObject(reviewer.publicKeySpkiPem);
    if(!key)return reject(pinnedState,'UNSUPPORTED_OR_INVALID_ED25519_PUBLIC_KEY');
    const fingerprint=sha(key.export({format:'der',type:'spki'}) as Buffer);
    if(!sameSha(fingerprint,reviewer.publicKeySpkiSha256)||
       uniqueFingerprints.has(fingerprint))
      return reject(pinnedState,'WRONG_PINNED_KEY_FINGERPRINT_OR_SIGNER_REUSE');
    trustedKeys.set(reviewer.role,{
      reviewerId:reviewer.reviewerId,key,fingerprint
    });
    uniqueIds.add(reviewer.reviewerId);
    uniqueFingerprints.add(fingerprint);
  }
  if(ROLES.some(role=>!trustedKeys.has(role)))
    return reject(pinnedState,'BOTH_DISTINCT_REVIEWER_ROLES_REQUIRED');
  const signatures=new Set<string>();
  const signedPayloadSha256ByRole:Partial<Record<WitnessRole,string>>={};
  const pinnedKeyFingerprintByRole:Partial<Record<WitnessRole,string>>={};
  let validDetachedWitnessCount=0;
  for(const w of e.witnesses){
    if(!w||!ROLES.includes(w.role)||!safeId(w.reviewerId)||
       !validTime(w.signedAt)||signatures.has(w.role)||
       typeof w.signatureBase64!=='string'||
       !/^[A-Za-z0-9+/]{86}==$/.test(w.signatureBase64)||
       // Self-declared date cannot be a trusted timestamp, but must not
       // contradict the claim of reviewing the *complete* calendar archive.
       Date.parse(w.signedAt)<Date.parse(cal.coverageEnd+'T00:00:00Z')+86400000)
      return reject(pinnedState,'INVALID_OR_NONCHRONOLOGICAL_DETACHED_WITNESS');
    // A local machine clock cannot validate an attestation timestamp, but it
    // can still reject the obvious false claim of a signature from the future.
    if(Date.parse(w.signedAt)>Date.now()+5*60_000)
      return reject(pinnedState,'WITNESS_CLAIMS_A_FUTURE_SIGNATURE_TIME');
    const key=trustedKeys.get(w.role)!;
    if(key.reviewerId!==w.reviewerId)
      return reject(pinnedState,'DETACHED_WITNESS_NOT_IN_PINNED_ROLE');
    const message=buildAdaptiveEvidenceWitnessPayload(e,w);
    const signature=Buffer.from(w.signatureBase64,'base64');
    if(signature.length!==64||!verify(null,Buffer.from(message),key.key,signature))
      return reject(pinnedState,'INVALID_DETACHED_ED25519_WITNESS_SIGNATURE');
    signedPayloadSha256ByRole[w.role]=sha(message);
    pinnedKeyFingerprintByRole[w.role]=key.fingerprint;
    validDetachedWitnessCount++;
    signatures.add(w.role);
  }
  if(ROLES.some(role=>!signatures.has(role)))
    return reject(pinnedState,'MISSING_REQUIRED_DETACHED_WITNESS_ROLE');
  const blockers=[...calendarAudit.blockers];
  if(raw.provenance.synthetic)
    blockers.push('SYNTHETIC_SOURCE_CANNOT_CLAIM_REAL_MARKET_REVIEW');
  return {
    ...pinnedState,
    status:blockers.length?'BLOCKED_INCOMPLETE_EVIDENCE':
      'SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED',
    errors:[],blockers,signedPayloadSha256ByRole,
    pinnedKeyFingerprintByRole,validDetachedWitnessCount
  };
}
