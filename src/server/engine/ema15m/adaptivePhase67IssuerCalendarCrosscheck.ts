/**
 * Phase67: OFFLINE dual-source claimed exchange contract/sessions crosscheck.
 *
 * Input A: new vendor candidate historical option L1 source + original OOS
 * universe (Phase66). Input B: separately supplied purported EXCHANGE
 * contract-master snapshots and sessions. Source B is NOT independently
 * authenticated: any operator can fabricate BOTH input streams and pins.
 * Checks conflicts, missing snapshots, as-of availability, official-looking
 * expiry/last-trade claims and original quote sessions, not market truth.
 *
 * No live data download, exchange/broker connectivity, NRML, order, GTT,
 * position, stop, auto-contract ranking or 15:15 positional square-off.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase66StandaloneVendorPreflight,
  type Phase66Input,type Phase66IndependentPins,type Phase66Report,
  type Phase66OriginalCatalog,type Phase66Calendar
} from './adaptivePhase66StandaloneVendorPreflight.js';
import {parseOriginalNativeL1Csv}
  from './adaptiveNativeL1CsvBridge.js';

const SHA=/^[a-f0-9]{64}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const IST=330*60000;
const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export const hashPhase67Evidence=(value:unknown)=>digest(
  Buffer.from(JSON.stringify(value),'utf8'));
const time=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
const date=(s:unknown):number=>typeof s==='string'&&DATE.test(s)?
  Date.parse(s+'T00:00:00Z'):NaN;
const istDate=(t:number)=>new Date(t+IST).toISOString().slice(0,10);
const integer=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
function base64(s:unknown,limit:number):Buffer|null{
  if(typeof s!=='string'||!s.length||
    s.length>(limit+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>16&&b.length<=limit&&
      b.toString('base64')===s?b:null;
  }catch{return null;}
}
function parse<T>(buf:Buffer):T|null{
  try{
    const v=JSON.parse(
      new TextDecoder('utf8',{fatal:true}).decode(buf));
    return v&&typeof v==='object'&&!Array.isArray(v)?v as T:null;
  }catch{return null;}
}
export interface Phase67IssuerClaimedContract{
  instrumentKey:string;
  optionType:'CE'|'PE';
  expiry:string;
  strikePrice:number;
  lotSize:number;
  claimedFirstListedAt:string;
  claimedLastTradingSessionDate:string;
}
export interface Phase67IssuerClaimedSnapshot{
  originalOosSessionDate:string;
  originalDecisionAt:string;
  claimedMasterPublishedAt:string;
  claimedMasterReceivedAt:string;
  /** The COMPLETE decision-time catalog, not only chosen/winning contracts. */
  optionContracts:Phase67IssuerClaimedContract[];
}
export interface Phase67IssuerClaimedMaster{
  schemaVersion:'ADAPTIVE_PHASE67_SEPARATE_ISSUER_CANDIDATE_MASTER_V1';
  source:'OWNER_CUSTODIED_EXCHANGE_LIKE_RECORDS_NOT_ISSUER_VERIFIED';
  claimedIssuerReference:string;
  snapshots:Phase67IssuerClaimedSnapshot[];
}
export interface Phase67IssuerClaimedCalendar{
  schemaVersion:'ADAPTIVE_PHASE67_SEPARATE_ISSUER_CANDIDATE_CALENDAR_V1';
  source:'OWNER_CUSTODIED_EXCHANGE_LIKE_CALENDAR_NOT_ISSUER_VERIFIED';
  claimedIssuerReference:string;
  claimedCalendarPublishedAt:string;
  claimedCalendarReceivedAt:string;
  /** Original OOS sessions + following sessions + all declared last-trade
   * dates. Additional source-trading dates must not erase next-open gaps. */
  sessions:{sessionDate:string;openAt:string;closeAt:string}[];
}
export interface Phase67Input{
  schemaVersion:'ADAPTIVE_PHASE67_DUAL_SOURCE_CONTRACT_CALENDAR_RECONCILIATION_V1';
  source:'OWNER_PRIVATE_SEPARATE_EXCHANGE_CANDIDATES_UNVERIFIED';
  originalVendor:Phase66Input;
  originalVendorPins:Phase66IndependentPins;
  candidateIssuerMasterBase64:string;
  candidateIssuerCalendarBase64:string;
}
export interface Phase67IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE67_CANDIDATE_ISSUER_CROSSCHECK_PINS_V1';
  expectedPhase66InputSha256:string;
  expectedPhase66PinsSha256:string;
  expectedCandidateIssuerMasterBytesSha256:string;
  expectedCandidateIssuerCalendarBytesSha256:string;
  expectedClaimedIssuerReference:string;
  expectedCompleteOriginalOosDecisions:number;
  expectedFullOosListedContractPairs:number;
  expectedDistinctOriginalListedInstruments:number;
  expectedIssuerCalendarSessions:number;
}
export interface Phase67Report{
  mode:'OFFLINE_SEPARATE_CANDIDATE_ISSUER_EXPIRY_CALENDAR_CROSSCHECK';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_CROSS_SOURCE_MATCH_INSUFFICIENT_OOS_ONLY'|
    'DESCRIPTIVE_CROSS_SOURCE_MATCH_UNVERIFIED_ONLY';
  reasonCodes:string[];
  phase66Status:Phase66Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisions:number;
  originalAllListedCePeContractPairs:number;
  matchedOriginalDecisionTimeIssuerSnapshots:number;
  matchedOriginalCePeContractPairs:number;
  distinctListedOriginalInstruments:number;
  candidateIssuerSessions:number;
  originalSourceQuotesConfinedToClaimedIssuerSessions:number;
  originalQuotesBeyondClaimedLastTradableSession:number;
  originalOosNextOpenSessionsMatched:number;
  sourceCandidateMasterAndCalendarConsistent:boolean;
  independentlyAuthenticatedExchangeMasterIssuer:false;
  independentlyAuthenticatedExchangeCalendarIssuer:false;
  independentlyVerifiedVendorHistoricalL1Entitlement:false;
  contemporaneousSourceArrivalClockTrusted:false;
  historicalArchiveProvesPastClientReceipt:false;
  expiryOrLotClaimIsOfficialExchangeTruth:false;
  sourceQuotesAreActualExecutableBrokerFills:false;
  statisticalMultiregimeOosProfitabilityVerified:false;
  genuineIvThetaGapRiskCalibrated:false;
  bestOptionDurationAuthorized:false;
  nativeNrmlBrokerStopGttAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  externalBlockers:string[];
}
const BLOCKERS=[
  'AUTHENTIC_EXCHANGE_PUBLICATION_OR_TRUSTED_HISTORICAL_ISSUER_RECORD_PROVENANCE',
  'INDEPENDENT_EXCHANGE_MASTER_AND_CALENDAR_ISSUER_KEY_OR_DOCUMENT_VERIFICATION',
  'LICENSED_VENDOR_HISTORICAL_OPTION_BID_ASK_AND_L1_DEPTH_ENTITLEMENT',
  'CONTEMPORANEOUS_TRUSTED_ORIGINAL_CLIENT_AVAILABLE_AT_RECEIPTS',
  'TRUE_CHRONOLOGICAL_UNTOUCHED_MULTIREGIME_COHORT_AND_COST_RISK_REPLAY',
  'REAL_IV_THETA_SPREAD_DEPTH_OVERNIGHT_GAP_AND_FULL_PAID_PREMIUM_DEBIT_LOSS',
  'REAL_BROKER_NRML_STOP_GTT_CANCEL_REPLACE_EXCHANGE_ACK_NONFILL_LIFECYCLE'
];
const blank=():Phase67Report=>({
  mode:'OFFLINE_SEPARATE_CANDIDATE_ISSUER_EXPIRY_CALENDAR_CROSSCHECK',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase66Status:null,syntheticDataset:null,
  originalOosDecisions:0,originalAllListedCePeContractPairs:0,
  matchedOriginalDecisionTimeIssuerSnapshots:0,
  matchedOriginalCePeContractPairs:0,
  distinctListedOriginalInstruments:0,
  candidateIssuerSessions:0,
  originalSourceQuotesConfinedToClaimedIssuerSessions:0,
  originalQuotesBeyondClaimedLastTradableSession:0,
  originalOosNextOpenSessionsMatched:0,
  sourceCandidateMasterAndCalendarConsistent:false,
  independentlyAuthenticatedExchangeMasterIssuer:false,
  independentlyAuthenticatedExchangeCalendarIssuer:false,
  independentlyVerifiedVendorHistoricalL1Entitlement:false,
  contemporaneousSourceArrivalClockTrusted:false,
  historicalArchiveProvesPastClientReceipt:false,
  expiryOrLotClaimIsOfficialExchangeTruth:false,
  sourceQuotesAreActualExecutableBrokerFills:false,
  statisticalMultiregimeOosProfitabilityVerified:false,
  genuineIvThetaGapRiskCalibrated:false,
  bestOptionDurationAuthorized:false,
  nativeNrmlBrokerStopGttAckVerified:false,
  executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
  externalBlockers:BLOCKERS
});
const fail=(reason:string,
  status:Phase67Report['status']='INCOMPLETE_EVIDENCE',
  part?:Partial<Phase67Report>):Phase67Report=>({
  ...blank(),...part,status,reasonCodes:[reason]
});
export function auditPhase67IssuerCalendarCrosscheck(
  input:Phase67Input,pins:Phase67IndependentPins
):Phase67Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE67_DUAL_SOURCE_CONTRACT_CALENDAR_RECONCILIATION_V1'||
    input.source!=='OWNER_PRIVATE_SEPARATE_EXCHANGE_CANDIDATES_UNVERIFIED'||
    !input.originalVendor||!input.originalVendorPins||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE67_CANDIDATE_ISSUER_CROSSCHECK_PINS_V1'||
    ![pins.expectedPhase66InputSha256,pins.expectedPhase66PinsSha256,
      pins.expectedCandidateIssuerMasterBytesSha256,
      pins.expectedCandidateIssuerCalendarBytesSha256].every(
      x=>typeof x==='string'&&SHA.test(x))||
    !ID.test(pins.expectedClaimedIssuerReference??'')||
    !integer(pins.expectedCompleteOriginalOosDecisions,2,100000)||
    !integer(pins.expectedFullOosListedContractPairs,8,2000000)||
    !integer(pins.expectedDistinctOriginalListedInstruments,1,2000000)||
    !integer(pins.expectedIssuerCalendarSessions,2,100000)||
    hashPhase67Evidence(input.originalVendor)!==
      pins.expectedPhase66InputSha256||
    hashPhase67Evidence(input.originalVendorPins)!==
      pins.expectedPhase66PinsSha256)
    return fail('PHASE67_INDEPENDENT_ORIGINAL_SOURCE_OR_ISSUER_PINS_INVALID',
      'INVALID_EVIDENCE');
  const masterBytes=base64(input.candidateIssuerMasterBase64,25_000_000),
    calendarBytes=base64(input.candidateIssuerCalendarBase64,10_000_000);
  if(!masterBytes||!calendarBytes)
    return fail('PHASE67_SEPARATE_CANDIDATE_ISSUER_SOURCE_BYTES_MISSING',
      'INVALID_EVIDENCE');
  if(digest(masterBytes)!==
      pins.expectedCandidateIssuerMasterBytesSha256||
    digest(calendarBytes)!==
      pins.expectedCandidateIssuerCalendarBytesSha256)
    return fail('PHASE67_CANDIDATE_ISSUER_OR_CALENDAR_BYTES_CHANGED',
      'INVALID_EVIDENCE');
  const master=parse<Phase67IssuerClaimedMaster>(masterBytes),
    calendar=parse<Phase67IssuerClaimedCalendar>(calendarBytes);
  if(!master||!calendar||master.schemaVersion!==
      'ADAPTIVE_PHASE67_SEPARATE_ISSUER_CANDIDATE_MASTER_V1'||
    calendar.schemaVersion!==
      'ADAPTIVE_PHASE67_SEPARATE_ISSUER_CANDIDATE_CALENDAR_V1'||
    master.source!==
      'OWNER_CUSTODIED_EXCHANGE_LIKE_RECORDS_NOT_ISSUER_VERIFIED'||
    calendar.source!==
      'OWNER_CUSTODIED_EXCHANGE_LIKE_CALENDAR_NOT_ISSUER_VERIFIED'||
    master.claimedIssuerReference!==pins.expectedClaimedIssuerReference||
    calendar.claimedIssuerReference!==pins.expectedClaimedIssuerReference||
    !Array.isArray(master.snapshots)||!Array.isArray(calendar.sessions)||
    master.snapshots.length!==pins.expectedCompleteOriginalOosDecisions||
    calendar.sessions.length!==pins.expectedIssuerCalendarSessions)
    return fail('PHASE67_CANDIDATE_ISSUER_DECLARATION_OR_TOTALS_INVALID');
  let prior:Phase66Report;
  try{
    prior=auditPhase66StandaloneVendorPreflight(
      input.originalVendor,input.originalVendorPins);
  }catch{return fail('PHASE66_ORIGINAL_NEW_VENDOR_OOS_PREAUDIT_EXCEPTION');}
  const partial:Partial<Phase67Report>={
    phase66Status:prior.status,
    syntheticDataset:prior.declaredSyntheticDataset,
    originalOosDecisions:prior.originalOosDecisionDays,
    originalAllListedCePeContractPairs:prior.originalListedCePeHorizonPairs
  };
  if(!prior.status.startsWith('DESCRIPTIVE_')||
    prior.originalOosDecisionDays!==
      pins.expectedCompleteOriginalOosDecisions||
    prior.originalListedCePeHorizonPairs!==
      pins.expectedFullOosListedContractPairs)
    return fail('PHASE66_ORIGINAL_FULL_LISTED_SOURCE_OR_FOLDS_NOT_READY',
      'INCOMPLETE_EVIDENCE',partial);
  const oldCatBytes=base64(
    input.originalVendor.newVendorFullListedCatalogBase64,25_000_000),
    oldCalendarBytes=base64(
      input.originalVendor.newVendorSessionCalendarBase64,10_000_000),
    l1=base64(input.originalVendor.newVendorNativeL1CsvBase64,50_000_000);
  if(!oldCatBytes||!oldCalendarBytes||!l1)
    return fail('PHASE67_ORIGINAL_OOS_CATALOG_CALENDAR_OR_L1_ABSENT',
      'INCOMPLETE_EVIDENCE',partial);
  const originalCat=parse<Phase66OriginalCatalog>(oldCatBytes),
    originalCal=parse<Phase66Calendar>(oldCalendarBytes);
  const quotes=parseOriginalNativeL1Csv(l1);
  if(!originalCat||!originalCal||!quotes||
    !Array.isArray(originalCat.decisions)||
    !Array.isArray(originalCal.sessions))
    return fail('PHASE67_ORIGINAL_L1_CATALOG_CALENDAR_REPARSE_FAILED',
      'INCOMPLETE_EVIDENCE',partial);
  const firstDecision=Math.min(...originalCat.decisions.map(d=>
    time(d.decisionAt)));
  const published=time(calendar.claimedCalendarPublishedAt),
    received=time(calendar.claimedCalendarReceivedAt);
  if(!Number.isFinite(published)||!Number.isFinite(received)||
    published>received||received>firstDecision)
    return fail('PHASE67_CLAIMED_CALENDAR_AVAILABLE_ONLY_AFTER_OOS_DECISION',
      'INCOMPLETE_EVIDENCE',partial);
  const sessions=new Map<string,{
    sessionDate:string;openAt:string;closeAt:string
  }>();
  let earlierClose=-Infinity;
  for(const s of calendar.sessions){
    const open=time(s.openAt),close=time(s.closeAt);
    if(!Number.isFinite(date(s.sessionDate))||
      !Number.isFinite(open)||!Number.isFinite(close)||
      istDate(open)!==s.sessionDate||
      istDate(close)!==s.sessionDate||
      open>=close||open<=earlierClose||
      sessions.has(s.sessionDate))
      return fail('PHASE67_CANDIDATE_ISSUER_SESSIONS_INVALID_OR_OVERLAP',
        'INCOMPLETE_EVIDENCE',partial);
    earlierClose=close;sessions.set(s.sessionDate,s);
  }
  for(const s of originalCal.sessions){
    const issuer=sessions.get(s.sessionDate);
    if(!issuer||issuer.openAt!==s.openAt||
      issuer.closeAt!==s.closeAt)
      return fail('PHASE67_ORIGINAL_SESSION_CLOCK_DIFFERS_FROM_ISSUER_CANDIDATE',
        'INCOMPLETE_EVIDENCE',partial);
  }
  const snapshots=new Map<string,Phase67IssuerClaimedSnapshot>();
  for(const s of master.snapshots){
    const key=s.originalOosSessionDate+'|'+s.originalDecisionAt;
    const decision=time(s.originalDecisionAt),
      issued=time(s.claimedMasterPublishedAt),
      arrived=time(s.claimedMasterReceivedAt);
    if(!Number.isFinite(decision)||!Number.isFinite(issued)||
      !Number.isFinite(arrived)||issued>arrived||arrived>decision||
      istDate(decision)!==s.originalOosSessionDate||
      snapshots.has(key)||!Array.isArray(s.optionContracts))
      return fail('PHASE67_MASTER_SNAPSHOT_BACKFILLED_OR_DUPLICATED',
        'INCOMPLETE_EVIDENCE',partial);
    snapshots.set(key,s);
  }
  const sourceKeys=new Map<string,Phase67IssuerClaimedContract>();
  let matchedPairs=0,matchedSnapshots=0,matchingNextOpens=0;
  for(const d of originalCat.decisions){
    const key=d.sessionDate+'|'+d.decisionAt;
    const snapshot=snapshots.get(key);
    if(!snapshot||
      snapshot.optionContracts.length!==d.originallyListedContracts.length)
      return fail('PHASE67_ORIGINAL_LISTED_OOS_OPTION_SNAPSHOT_MISSING',
        'INCOMPLETE_EVIDENCE',{...partial,
          matchedOriginalDecisionTimeIssuerSnapshots:matchedSnapshots,
          matchedOriginalCePeContractPairs:matchedPairs});
    const seen=new Set<string>();
    for(const c of snapshot.optionContracts){
      const original=d.originallyListedContracts.find(
        x=>x.instrumentKey===c.instrumentKey);
      if(!original||seen.has(c.instrumentKey)||
        c.optionType!==original.optionType||
        c.expiry!==original.expiry||
        c.strikePrice!==original.strikePrice||
        c.lotSize!==original.lotSize)
        return fail('PHASE67_CANDIDATE_ISSUER_LISTING_NOT_ORIGINAL',
          'INCOMPLETE_EVIDENCE',{...partial,
            matchedOriginalDecisionTimeIssuerSnapshots:matchedSnapshots,
            matchedOriginalCePeContractPairs:matchedPairs});
      const listing=time(c.claimedFirstListedAt),
        published=time(snapshot.claimedMasterPublishedAt),
        lastTradable=date(c.claimedLastTradingSessionDate),
        expiry=date(c.expiry);
      if(!Number.isFinite(listing)||listing>published||
        !Number.isFinite(lastTradable)||!Number.isFinite(expiry)||
        lastTradable>expiry||lastTradable<date(d.sessionDate)||
        !sessions.has(c.claimedLastTradingSessionDate)||
        [...sessions.keys()].some(day=>
          day>c.claimedLastTradingSessionDate&&day<=c.expiry))
        return fail('PHASE67_CANDIDATE_EXPIRY_OR_LAST_TRADING_SESSION_INVALID',
          'INCOMPLETE_EVIDENCE',partial);
      const was=sourceKeys.get(c.instrumentKey);
      if(was&&JSON.stringify(was)!==JSON.stringify(c))
        return fail('PHASE67_CANDIDATE_INSTRUMENT_REASSIGNED_ACROSS_DAYS',
          'INCOMPLETE_EVIDENCE',partial);
      seen.add(c.instrumentKey);sourceKeys.set(c.instrumentKey,c);
      matchedPairs++;
    }
    const actualIndex=calendar.sessions.findIndex(
      s=>s.sessionDate===d.sessionDate);
    const issuerNext=calendar.sessions[actualIndex+1],
      originalNext=originalCal.sessions.find(
        s=>s.sessionDate>d.sessionDate);
    if(actualIndex<0||!issuerNext||!originalNext||
      issuerNext.sessionDate!==originalNext.sessionDate)
      return fail('PHASE67_ORIGINAL_NEXT_SESSION_GAP_WAS_MISCLASSIFIED',
        'INCOMPLETE_EVIDENCE',partial);
    matchingNextOpens++;matchedSnapshots++;
  }
  if(snapshots.size!==matchedSnapshots||
    sourceKeys.size!==pins.expectedDistinctOriginalListedInstruments||
    matchedPairs!==pins.expectedFullOosListedContractPairs)
    return fail('PHASE67_ISSUER_CONTRACT_INSTRUMENT_OR_OOS_COUNTS_CHANGED',
      'INCOMPLETE_EVIDENCE',partial);
  let matchedQuotes=0,afterExpiry=0;
  for(const row of quotes.slice(1)){
    const c=sourceKeys.get(row[2]);
    const event=time(row[3]),marketDay=istDate(event);
    const session=sessions.get(marketDay),
      expirySession=c&&sessions.get(c.claimedLastTradingSessionDate);
    if(!c||!Number.isFinite(event)||!session||!expirySession||
      event<time(session.openAt)||event>time(session.closeAt))
      return fail('PHASE67_NATIVE_L1_QUOTE_OUTSIDE_CLAIMED_EXCHANGE_SESSION',
        'INCOMPLETE_EVIDENCE',{...partial,
          matchedOriginalCePeContractPairs:matchedPairs,
          originalSourceQuotesConfinedToClaimedIssuerSessions:matchedQuotes});
    if(marketDay>c.claimedLastTradingSessionDate||
      event>time(expirySession.closeAt)){
      afterExpiry++;
      return fail('PHASE67_ORIGINAL_L1_AFTER_CLAIMED_LAST_TRADABLE_EXPIRY',
        'INCOMPLETE_EVIDENCE',{...partial,
          matchedOriginalCePeContractPairs:matchedPairs,
          originalQuotesBeyondClaimedLastTradableSession:afterExpiry});
    }
    matchedQuotes++;
  }
  const fields:Partial<Phase67Report>={
    ...partial,matchedOriginalDecisionTimeIssuerSnapshots:matchedSnapshots,
    matchedOriginalCePeContractPairs:matchedPairs,
    distinctListedOriginalInstruments:sourceKeys.size,
    candidateIssuerSessions:calendar.sessions.length,
    originalSourceQuotesConfinedToClaimedIssuerSessions:matchedQuotes,
    originalOosNextOpenSessionsMatched:matchingNextOpens,
    sourceCandidateMasterAndCalendarConsistent:true
  };
  return {...blank(),...fields,
    status:prior.status==='DESCRIPTIVE_COVERAGE_INSUFFICIENT_UNVERIFIED'?
      'DESCRIPTIVE_CROSS_SOURCE_MATCH_INSUFFICIENT_OOS_ONLY':
      'DESCRIPTIVE_CROSS_SOURCE_MATCH_UNVERIFIED_ONLY',
    reasonCodes:[
      'NEW_VENDOR_AND_SEPARATE_ISSUER_LIKE_SOURCE_MATCH_INTERNALLY_ONLY',
      'CLAIMED_ISSUER_NOT_EXTERNALLY_AUTHENTICATED_AND_CALENDAR_NOT_OFFICIAL',
      'CLAIMED_LISTING_AND_SOURCE_AVAILABLE_AT_NOT_INDEPENDENTLY_TRUSTED'
    ]};
}
