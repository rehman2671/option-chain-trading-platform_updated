/**
 * Adaptive Swing v2 Phase41 — independent signed-witness checkpoint
 * archive and explicit segment-session calendar coverage, OFFLINE ONLY.
 *
 * Two Ed25519 signatures prove that two PINNED private keys signed these
 * particular local representations. NOT actual broker API provenance,
 * NSE/BSE calendar authority, exchange ACK, stop survival or production.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {
  auditPhase40ArchivedGttOvernights,
  hashPhase40OfflineArchive,
  type Phase40GttAuditInput,
  type Phase40IndependentArchivePins
} from './adaptiveUpstoxPhase40OvernightStopAudit.js';

const SHA=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?\+05:30$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_SESSIONS=56;
const hash=(x:Uint8Array|string):string=>
  createHash('sha256').update(x).digest('hex');
const dateValue=(s:string):boolean=>
  DATE.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const milli=(s:unknown):number=>
  typeof s==='string'&&ISO.test(s)?Date.parse(s):NaN;
const istDay=(t:number)=>new Date(t+19800000).toISOString().slice(0,10);
function strictBase64(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||s.length<4||s.length>max||
    s.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  const decoded=Buffer.from(s,'base64');
  return decoded.toString('base64')===s?decoded:null;
}
export interface Phase41Session{
  date:string;
  sessionKind:'REGULAR'|'SPECIAL';
  openingAt:string;
  closingAt:string;
}
export interface Phase41Calendar{
  schemaVersion:'ADAPTIVE_PHASE41_OPERATOR_TRANSCRIBED_EXCHANGE_SESSIONS_V1';
  source:'OPERATOR_TRANSCRIBED_EXCHANGE_NOTICE_UNVERIFIED';
  exchange:'NFO'|'BFO';
  referencedSourceUrl:string;
  referencedOriginalSourceSha256:string;
  sessions:Phase41Session[];
}
export interface Phase41SignedWitness{
  role:'CAPTURE_OPERATOR'|'INDEPENDENT_REVIEWER';
  publicKeySpkiDerBase64:string;
  signatureBase64:string;
  signedAt:string;
}
export interface Phase41ChainLink{
  sequence:number;
  previousLinkSha256:string;
  calendarSha256:string;
  pairSha256:string;
  sessionFrom:string;
  sessionTo:string;
  witnessedAt:string;
  witnessSignatures:Phase41SignedWitness[];
}
export interface Phase41Archive{
  schemaVersion:'ADAPTIVE_PHASE41_DUAL_WITNESS_SESSION_CHAIN_V1';
  source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED';
  calendar:Phase41Calendar;
  phase40Gtt:Phase40GttAuditInput;
  links:Phase41ChainLink[];
}
export interface Phase41IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE41_WITNESS_AND_CALENDAR_PINS_V1';
  accountScopeId:string;
  gttOrderId:string;
  referencedOriginalSourceSha256:string;
  expectedExchange:'NFO'|'BFO';
  expectedCalendarSha256:string;
  expectedSessionDates:string[];
  expectedFirstSession:string;
  expectedLastSession:string;
  expectedCaptureKeySpkiSha256:string;
  expectedReviewKeySpkiSha256:string;
  expectedGenesisSha256:string;
  expectedLastLinkSha256:string;
  maxWitnessDelayMinutes:number;
}
export interface Phase41AuditReport{
  mode:'OFFLINE_DUAL_WITNESS_COMPLETE_DECLARED_SESSION_GTT_ARCHIVE';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'DECLARED_CALENDAR_ALL_BOUNDARIES_DUAL_SIGNED_UNVERIFIED';
  reasons:string[];
  declaredSessionsReviewed:number;
  witnessedBoundaryPairs:number;
  verifiedEd25519Signatures:number;
  unobservedOvernightIntervals:number;
  pinnedWitnessKeySignaturesCryptographicallyValid:boolean;
  independentWitnessHumanIdentityAuthenticated:false;
  brokerOriginAuthenticated:false;
  officialExchangeCalendarAuthenticated:false;
  officiallyCompleteSessionCoverageEstablished:false;
  stopContinuityProven:false;
  exchangeNativeStopAckVerified:false;
  guaranteedStopExecution:false;
  brokerStopInstalled:false;
  brokerAuthenticated:false;
  protectedOvernight:false;
  productionSafe:false;
  executionAuthorized:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const warnings=[
  'TWO_PINNED_KEYS_SIGN_ARCHIVE_HASHES_NOT_BROKER_AUTHENTICATION',
  'KEY_OWNER_INDEPENDENCE_MUST_BE_ESTABLISHED_OUTSIDE_THIS_MODULE',
  'CALENDAR_SOURCE_HASH_IS_DECLARED_NOT_AUTHENTICATED_NSE_BSE_CIRCULAR',
  'MANUALLY_PINNED_SESSION_LIST_CAN_OMIT_REAL_SPECIAL_SESSIONS',
  'SPECIAL_MUHURAT_OR_REVISED_FO_SESSION_TIMES_REQUIRE_EFFECTIVE_DATED_SOURCE',
  'GTT_RULE_SCHEDULED_IS_BROKER_CONDITION_NOT_EXCHANGE_NATIVE_STOP',
  'TWO_CHECKPOINTS_DO_NOT_ESTABLISH_UNOBSERVED_OVERNIGHT_STOP_CONTINUITY',
  'GTT_COMPLETED_STATES_AND_HISTORICAL_ORDER_LIFECYCLE_UNAVAILABLE_LATER',
  'NO_NRML_LIVE_TRADING_OR_POSITIONAL_15_15_SQUAREOFF'
];
const base=():Phase41AuditReport=>({
  mode:'OFFLINE_DUAL_WITNESS_COMPLETE_DECLARED_SESSION_GTT_ARCHIVE',
  status:'INVALID_EVIDENCE',reasons:[],declaredSessionsReviewed:0,
  witnessedBoundaryPairs:0,verifiedEd25519Signatures:0,
  unobservedOvernightIntervals:0,
  pinnedWitnessKeySignaturesCryptographicallyValid:false,
  independentWitnessHumanIdentityAuthenticated:false,
  brokerOriginAuthenticated:false,
  officialExchangeCalendarAuthenticated:false,
  officiallyCompleteSessionCoverageEstablished:false,
  stopContinuityProven:false,
  exchangeNativeStopAckVerified:false,
  guaranteedStopExecution:false,
  brokerStopInstalled:false,brokerAuthenticated:false,
  protectedOvernight:false,productionSafe:false,
  executionAuthorized:false,nativeOrderInstruction:null,warnings
});
const fail=(reason:string,status:Phase41AuditReport['status']='BLOCKED_OR_UNKNOWN',
  partial?:Partial<Phase41AuditReport>):Phase41AuditReport=>({
  ...base(),...partial,status,reasons:[reason]
});
export function hashPhase41Calendar(calendar:Phase41Calendar):string{
  return hash(JSON.stringify(calendar));
}
export function phase41GenesisSha256(
  calendarSha256:string,accountScopeId:string,gttOrderId:string
):string{
  return hash('ADAPTIVE_PHASE41_DUAL_WITNESS_GENESIS_V1|'+
    calendarSha256+'|'+accountScopeId+'|'+gttOrderId);
}
/** The bytes that BOTH pinned keys must independently sign.
 * Witness signedAt must match common witnessedAt; the claimed wall-clock
 * timestamp is NOT an independently trusted timestamp or broker time.
 */
export function phase41WitnessMessage(link:Omit<Phase41ChainLink,'witnessSignatures'>):
  Buffer{
  return Buffer.from(JSON.stringify({
    domain:'ADAPTIVE_PHASE41_DUAL_WITNESS_EVENT_V1',
    sequence:link.sequence,previousLinkSha256:link.previousLinkSha256,
    calendarSha256:link.calendarSha256,
    pairSha256:link.pairSha256,
    sessionFrom:link.sessionFrom,sessionTo:link.sessionTo,
    witnessedAt:link.witnessedAt
  }),'utf8');
}
export function phase41LinkSha256(link:Phase41ChainLink):string{
  // Links chain signer signatures as well as witnessed event contents.
  return hash(JSON.stringify(link));
}
function validateWitness(
  witness:Phase41SignedWitness,
  expectedRole:Phase41SignedWitness['role'],
  expectedSpkiHash:string,
  payload:Buffer,
  witnessedAt:string
):boolean{
  if(!witness||witness.role!==expectedRole||
    witness.signedAt!==witnessedAt)return false;
  const spki=strictBase64(witness.publicKeySpkiDerBase64,4096),
    signature=strictBase64(witness.signatureBase64,1024);
  if(!spki||!signature||signature.length!==64||
    hash(spki)!==expectedSpkiHash)return false;
  try{
    const key=createPublicKey({key:spki,format:'der',type:'spki'});
    return key.asymmetricKeyType==='ed25519'&&
      verify(null,payload,key,signature);
  }catch{return false;}
}
function validSessions(rows:Phase41Session[]):boolean{
  if(rows.length<2||rows.length>MAX_SESSIONS)return false;
  let prior=-Infinity,priorDate='';
  for(const row of rows){
    if(!row||!dateValue(row.date)||row.date<=priorDate||
      !['REGULAR','SPECIAL'].includes(row.sessionKind))
      return false;
    const open=milli(row.openingAt),close=milli(row.closingAt);
    if(!Number.isFinite(open)||!Number.isFinite(close)||
      open<=prior||close<=open||
      close-open>9*3600_000||
      istDay(open)!==row.date||istDay(close)!==row.date)
      return false;
    prior=close;priorDate=row.date;
  }
  return true;
}
export function auditPhase41WitnessedSessionCoverage(
  archive:Phase41Archive,pins:Phase41IndependentPins
):Phase41AuditReport{
  const cal=archive?.calendar,gtt=archive?.phase40Gtt;
  if(!archive||!pins||
    archive.schemaVersion!=='ADAPTIVE_PHASE41_DUAL_WITNESS_SESSION_CHAIN_V1'||
    archive.source!=='PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED'||
    !cal||cal.schemaVersion!==
      'ADAPTIVE_PHASE41_OPERATOR_TRANSCRIBED_EXCHANGE_SESSIONS_V1'||
    cal.source!=='OPERATOR_TRANSCRIBED_EXCHANGE_NOTICE_UNVERIFIED'||
    !['NFO','BFO'].includes(cal.exchange)||
    typeof cal.referencedSourceUrl!=='string'||
    !/^https:\/\/(?:www\.)?(?:nseindia\.in|bseindia\.com|nsearchives\.nseindia\.com)\//.test(
      cal.referencedSourceUrl)||
    !SHA.test(cal.referencedOriginalSourceSha256)||
    !Array.isArray(cal.sessions)||!validSessions(cal.sessions)||
    pins.schemaVersion!=='INDEPENDENT_PHASE41_WITNESS_AND_CALENDAR_PINS_V1'||
    !SHA.test(pins.expectedCalendarSha256)||
    !SHA.test(pins.referencedOriginalSourceSha256)||
    !SHA.test(pins.expectedCaptureKeySpkiSha256)||
    !SHA.test(pins.expectedReviewKeySpkiSha256)||
    !SHA.test(pins.expectedGenesisSha256)||
    !SHA.test(pins.expectedLastLinkSha256)||
    pins.expectedCaptureKeySpkiSha256===pins.expectedReviewKeySpkiSha256||
    !Number.isSafeInteger(pins.maxWitnessDelayMinutes)||
    pins.maxWitnessDelayMinutes<1||pins.maxWitnessDelayMinutes>120||
    !Array.isArray(pins.expectedSessionDates)||
    pins.expectedSessionDates.length!==cal.sessions.length||
    pins.expectedSessionDates.some((d,i)=>d!==cal.sessions[i].date)||
    pins.expectedExchange!==cal.exchange||
    pins.referencedOriginalSourceSha256!==cal.referencedOriginalSourceSha256||
    pins.expectedFirstSession!==cal.sessions[0].date||
    pins.expectedLastSession!==cal.sessions.at(-1)!.date||
    hashPhase41Calendar(cal)!==pins.expectedCalendarSha256||
    !gtt?.position||
    gtt.position.accountScopeId!==pins.accountScopeId||
    gtt.position.gttOrderId!==pins.gttOrderId||
    !Array.isArray(archive.links)||
    archive.links.length!==cal.sessions.length-1||
    !Array.isArray(gtt.overnightPairs)||
    gtt.overnightPairs.length!==archive.links.length)
    return fail('CALENDAR_SCOPE_INDEPENDENT_PINS_OR_SESSION_LIST_MISMATCH',
      'INVALID_EVIDENCE');
  let prior=phase41GenesisSha256(pins.expectedCalendarSha256,
    pins.accountScopeId,pins.gttOrderId);
  if(prior!==pins.expectedGenesisSha256)
    return fail('INDEPENDENT_GENESIS_ROOT_MISMATCH','INVALID_EVIDENCE');
  let sigs=0;
  const pairSha256:string[]=[];
  for(let i=0;i<archive.links.length;i++){
    const link=archive.links[i],pair=gtt.overnightPairs[i],
      from=cal.sessions[i],to=cal.sessions[i+1];
    if(!link||!pair||link.sequence!==i||
      link.previousLinkSha256!==prior||
      link.calendarSha256!==pins.expectedCalendarSha256||
      link.sessionFrom!==from.date||
      link.sessionTo!==to.date||
      link.pairSha256!==hashPhase40OfflineArchive(pair)||
      pair.sessionDate!==from.date||
      pair.nextSessionDate!==to.date||
      pair.preCloseAt!==from.closingAt||
      pair.nextOpenAt!==to.openingAt)
      return fail('MISSING_REORDERED_OR_TAMPERED_SESSION_BOUNDARY',
        'BLOCKED_OR_UNKNOWN',{witnessedBoundaryPairs:i,
          verifiedEd25519Signatures:sigs,
          declaredSessionsReviewed:cal.sessions.length});
    const witnessed=milli(link.witnessedAt),
      opened=milli(pair.afterOpen.capturedAt);
    if(!Number.isFinite(witnessed)||
      !Number.isFinite(opened)||witnessed<opened||
      witnessed-opened>pins.maxWitnessDelayMinutes*60000)
      return fail('WITNESS_RECORDING_OUTSIDE_PINNED_POST_OPEN_WINDOW',
        'BLOCKED_OR_UNKNOWN',{witnessedBoundaryPairs:i,
          verifiedEd25519Signatures:sigs});
    if(!Array.isArray(link.witnessSignatures)||
      link.witnessSignatures.length!==2)
      return fail('MISSING_DISTINCT_WITNESS_SIGNATURE_ROLES',
        'BLOCKED_OR_UNKNOWN',{witnessedBoundaryPairs:i,
          verifiedEd25519Signatures:sigs});
    const msg=phase41WitnessMessage(link);
    const capture=link.witnessSignatures.find(
      x=>x?.role==='CAPTURE_OPERATOR'),
      review=link.witnessSignatures.find(
        x=>x?.role==='INDEPENDENT_REVIEWER');
    if(!capture||!review||
      !validateWitness(capture,'CAPTURE_OPERATOR',
        pins.expectedCaptureKeySpkiSha256,msg,link.witnessedAt)||
      !validateWitness(review,'INDEPENDENT_REVIEWER',
        pins.expectedReviewKeySpkiSha256,msg,link.witnessedAt))
      return fail('INDEPENDENT_ED25519_WITNESS_SIGNATURE_INVALID',
        'BLOCKED_OR_UNKNOWN',{witnessedBoundaryPairs:i,
          verifiedEd25519Signatures:sigs});
    sigs+=2;
    prior=phase41LinkSha256(link);
    pairSha256.push(link.pairSha256);
  }
  if(prior!==pins.expectedLastLinkSha256)
    return fail('INDEPENDENT_CHAIN_TIP_MISMATCH',
      'BLOCKED_OR_UNKNOWN',{witnessedBoundaryPairs:archive.links.length,
        verifiedEd25519Signatures:sigs});
  const phase40Pins:Phase40IndependentArchivePins={
    schemaVersion:'EXTERNALLY_PINNED_PHASE40_ARCHIVE_SHA256_V1',
    expectedAccountScopeId:pins.accountScopeId,
    expectedGttOrderId:pins.gttOrderId,
    expectedPairSha256:pairSha256
  };
  const phase40=auditPhase40ArchivedGttOvernights(gtt,phase40Pins);
  if(phase40.status!=='GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED'||
    phase40.protectedOvernight!==false||
    phase40.nativeExchangeStopAcknowledged!==false||
    phase40.executionAuthorized!==false||
    phase40.unobservedOvernightIntervals!==archive.links.length)
    return fail('PHASE40_GTT_CHECKPOINT_STATE_NOT_ACCEPTED',
      'BLOCKED_OR_UNKNOWN',{witnessedBoundaryPairs:archive.links.length,
        verifiedEd25519Signatures:sigs,
        unobservedOvernightIntervals:archive.links.length});
  return {...base(),
    status:'DECLARED_CALENDAR_ALL_BOUNDARIES_DUAL_SIGNED_UNVERIFIED',
    declaredSessionsReviewed:cal.sessions.length,
    witnessedBoundaryPairs:archive.links.length,
    verifiedEd25519Signatures:sigs,
    unobservedOvernightIntervals:archive.links.length,
    pinnedWitnessKeySignaturesCryptographicallyValid:true};
}
