/**
 * Phase70 — offline alleged exchange holiday, closure and special-session
 * evidence classification across the ENTIRE original 1W–8W OOS option
 * contract universe.
 *
 * Every calendar-day row comes from a separately supplied operator-
 * custodied archive. Hash consistency and two matching source calendars
 * cannot prove publication by NSE/BSE, actual historical research rights,
 * contemporaneous receive time, option fills, or trading authorization.
 *
 * No vendor/exchange calls, downloads, broker/NRML/GTT/stop writes,
 * horizon auto-ranking or forced positional 15:15 exit.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase69CalendarBlindSpots,
  type Phase69Input,type Phase69Pins,type Phase69Report
} from './adaptivePhase69CalendarBlindSpots.js';
import type {Phase66OriginalCatalog}
  from './adaptivePhase66StandaloneVendorPreflight.js';
import type {
  Phase67IssuerClaimedCalendar,Phase67IssuerClaimedMaster
} from './adaptivePhase67IssuerCalendarCrosscheck.js';

const SHA=/^[0-9a-f]{64}$/;
const DAY=86400000;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const sumHash=(x:unknown):string=>createHash('sha256')
  .update(JSON.stringify(x)).digest('hex');
export const hashPhase70Evidence=sumHash;
const sha=(b:Uint8Array):string=>createHash('sha256')
  .update(b).digest('hex');
const n=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const t=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
const date=(s:unknown):number=>typeof s==='string'&&DATE.test(s)?
  Date.parse(s+'T00:00:00Z'):NaN;
const strDate=(v:number):string=>new Date(v).toISOString().slice(0,10);
const weekday=(v:number):boolean=>{
  const w=new Date(v).getUTCDay();
  return w>=1&&w<=5;
};
function decode(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||!s.length||
    s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>16&&b.length<=max&&
      b.toString('base64')===s?b:null;
  }catch{return null;}
}
function json<T>(b:Buffer):T|null{
  try{
    const j=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
    return j&&typeof j==='object'&&!Array.isArray(j)?j as T:null;
  }catch{return null;}
}
export type Phase70SessionClaim=
  'REGULAR_OPEN'|'SPECIAL_WEEKEND_OPEN'|
  'HOLIDAY_CLOSED'|'EMERGENCY_CLOSED'|'WEEKEND_CLOSED';
export interface Phase70ClaimedCalendarDay{
  sessionDate:string;
  status:Phase70SessionClaim;
  claimedNoticePublishedAt:string;
  claimedNoticeReceivedAt:string;
  openAt?:string;
  closeAt?:string;
}
export interface Phase70ClaimedExchangeArchive{
  schemaVersion:'ADAPTIVE_PHASE70_SEPARATE_CLAIMED_EXCHANGE_DAY_ARCHIVE_V1';
  source:'OWNER_CUSTODIED_UNAUTHENTICATED_EXCHANGE_DAY_NOTICES';
  claimedIssuerReference:string;
  claimedArchiveReference:string;
  coveredFrom:string;
  coveredThrough:string;
  /** Exact complete daily index including weekday holidays and weekends. */
  days:Phase70ClaimedCalendarDay[];
}
export interface Phase70Input{
  schemaVersion:'ADAPTIVE_PHASE70_ALL_DAY_EXCHANGE_EXCEPTION_REVIEW_V1';
  source:'OWNER_PRIVATE_THIRD_CALENDAR_NOT_ISSUER_AUTHENTICATED';
  phase69:Phase69Input;
  phase69Pins:Phase69Pins;
  separatelySuppliedClaimedExchangeDayArchiveBase64:string;
}
export interface Phase70Pins{
  schemaVersion:'INDEPENDENT_PHASE70_ALL_DAY_EXCHANGE_EXCEPTION_PINS_V1';
  expectedPhase69InputSha256:string;
  expectedPhase69PinsSha256:string;
  expectedClaimedArchiveRawBytesSha256:string;
  expectedClaimedIssuerReference:string;
  expectedClaimedArchiveReference:string;
  expectedArchiveCalendarDays:number;
  expectedOriginalOosDecisionDays:number;
  expectedOriginalNoEntryDays:number;
  expectedAllListedCePePairs:number;
}
export interface Phase70Cell{
  claimedRegime:string;
  horizon:'1W'|'2W'|'4W'|'8W';
  optionType:'CE'|'PE';
  originalListedPairs:number;
  originalNoEntryPairs:number;
  missingWeekdaySlotsFromPhase69:number;
  claimedHolidayClosureSlots:number;
  claimedEmergencyClosureSlots:number;
  undisclosedRegularOpenSessionSlots:number;
  closureNoticeNotClaimedKnownAtOriginalDecisionSlots:number;
  explicitlyDeclaredSpecialWeekendOpenSlots:number;
  missingSpecialWeekendOpenSourceSlots:number;
  remainingUnclassifiedWeekdaySlots:number;
  allClosureClassificationIsUnverified:true;
  declaredOpeningQuoteIsNotExecutionFill:true;
}
export interface Phase70Report{
  mode:'OFFLINE_THIRD_SOURCE_ALL_DAY_CALENDAR_EXCEPTION_AND_OOS_RECONCILIATION';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_UNDECLARED_OPEN_SOURCE_SESSION_GAPS_ONLY'|
    'DESCRIPTIVE_CLAIMED_CLOSED_DAY_EXCEPTIONS_UNVERIFIED_ONLY'|
    'DESCRIPTIVE_INTERNAL_CALENDAR_RECONCILIATION_UNVERIFIED_ONLY';
  reasonCodes:string[];
  phase69Status:Phase69Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisions:number;
  originalNoEntryDays:number;
  originalAllListedCePePairs:number;
  sourceClaimedCalendarDays:number;
  matchedOriginalEntryNextSessionDecisions:number;
  missingWeekdayContractSlotsFromPhase69:number;
  claimedHolidayContractSlots:number;
  claimedEmergencyClosureContractSlots:number;
  missingRegularOpenExchangeLikeCalendarContractSlots:number;
  claimedClosureNotKnownAtOriginalDecisionSlots:number;
  explicitlyDeclaredWeekendSpecialSessionContractSlots:number;
  missingSpecialWeekendOpenSourceContractSlots:number;
  remainingUnclassifiedWeekdayContractSlots:number;
  independentlyAuthenticatedOfficialExchangeHolidayEvidence:false;
  independentlyAuthenticatedSpecialSessionPublisher:false;
  allegedHolidayNeverConfirmsExchangeWasClosed:true;
  fullOriginalHoldingQuoteSourceCensoredUntilActualDataVerified:true;
  genuineHistoricalOptionDataLicenseVerified:false;
  historicalClientSourceAvailableAtIndependentlyVerified:false;
  genuineOosRegimeProfitabilityProven:false;
  observedBidAndAskAreActualBrokerFills:false;
  fullPaidLongOptionPremiumDebitLossEliminated:false;
  optimalOneToEightWeekExpiryAuthorized:false;
  nrmlGttStopExchangeChildAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  cells:Phase70Cell[];
  externalEvidenceRequired:string[];
}
const NEED=[
  'ISSUER_AUTHENTICATED_HISTORICAL_EXCHANGE_HOLIDAY_SPECIAL_SESSION_AND_EMERGENCY_CLOSURE_NOTICES',
  'INDEPENDENT_OFFICIAL_HISTORICAL_NSE_BSE_FO_EXPIRY_LOT_AND_SESSION_MASTER',
  'INDEPENDENT_LEGAL_LICENSE_FOR_INDEX_OPTION_LEVEL1_HISTORICAL_BID_ASK_DEPTH',
  'CONTEMPORANEOUS_REAL_CLIENT_RECEIVE_CLOCK_AND_CAUSAL_SOURCE_PROVENANCE_IF_ACTUALLY_RECORDED',
  'FULL_1W_2W_4W_8W_ORIGINAL_UNSELECTED_AND_NO_ENTRY_OOS_BID_PATHS',
  'MARKET_REGIME_IV_THETA_SPREAD_GAP_SLIPPAGE_AND_ENTIRE_LONG_PREMIUM_DEBIT_STRESS',
  'BROKER_NRML_NATIVE_STOP_GTT_CANCEL_REPLACE_CHILD_EXCHANGE_ACK_AND_NONFILL'
];
function empty():Phase70Report{
  return {
    mode:'OFFLINE_THIRD_SOURCE_ALL_DAY_CALENDAR_EXCEPTION_AND_OOS_RECONCILIATION',
    status:'INVALID_EVIDENCE',reasonCodes:[],phase69Status:null,
    syntheticDataset:null,originalOosDecisions:0,
    originalNoEntryDays:0,originalAllListedCePePairs:0,
    sourceClaimedCalendarDays:0,
    matchedOriginalEntryNextSessionDecisions:0,
    missingWeekdayContractSlotsFromPhase69:0,
    claimedHolidayContractSlots:0,claimedEmergencyClosureContractSlots:0,
    missingRegularOpenExchangeLikeCalendarContractSlots:0,
    claimedClosureNotKnownAtOriginalDecisionSlots:0,
    explicitlyDeclaredWeekendSpecialSessionContractSlots:0,
    missingSpecialWeekendOpenSourceContractSlots:0,
    remainingUnclassifiedWeekdayContractSlots:0,
    independentlyAuthenticatedOfficialExchangeHolidayEvidence:false,
    independentlyAuthenticatedSpecialSessionPublisher:false,
    allegedHolidayNeverConfirmsExchangeWasClosed:true,
    fullOriginalHoldingQuoteSourceCensoredUntilActualDataVerified:true,
    genuineHistoricalOptionDataLicenseVerified:false,
    historicalClientSourceAvailableAtIndependentlyVerified:false,
    genuineOosRegimeProfitabilityProven:false,
    observedBidAndAskAreActualBrokerFills:false,
    fullPaidLongOptionPremiumDebitLossEliminated:false,
    optimalOneToEightWeekExpiryAuthorized:false,
    nrmlGttStopExchangeChildAckVerified:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    cells:[],externalEvidenceRequired:NEED
  };
}
const fail=(reason:string,status:Phase70Report['status']='INCOMPLETE_EVIDENCE',
  fields?:Partial<Phase70Report>):Phase70Report=>({
  ...empty(),...fields,status,reasonCodes:[reason]
});
const classificationValid=(row:Phase70ClaimedCalendarDay,dayMs:number):boolean=>{
  const isWeekday=weekday(dayMs);
  const isOpen=row.status==='REGULAR_OPEN'||
    row.status==='SPECIAL_WEEKEND_OPEN';
  const classes=[
    'REGULAR_OPEN','SPECIAL_WEEKEND_OPEN','HOLIDAY_CLOSED',
    'EMERGENCY_CLOSED','WEEKEND_CLOSED'
  ];
  if(!classes.includes(row.status)||
    (row.status==='REGULAR_OPEN'&&!isWeekday)||
    (row.status==='SPECIAL_WEEKEND_OPEN'&&isWeekday)||
    (row.status==='WEEKEND_CLOSED'&&isWeekday)||
    (row.status==='HOLIDAY_CLOSED'&&!isWeekday)||
    !Number.isFinite(t(row.claimedNoticePublishedAt))||
    !Number.isFinite(t(row.claimedNoticeReceivedAt))||
    t(row.claimedNoticePublishedAt)>t(row.claimedNoticeReceivedAt)||
    t(row.claimedNoticeReceivedAt)>dayMs+DAY)
    return false;
  if(isOpen){
    const open=t(row.openAt),close=t(row.closeAt);
    return Number.isFinite(open)&&Number.isFinite(close)&&
      open<close&&open>=dayMs&&close<dayMs+DAY&&
      t(row.claimedNoticeReceivedAt)<=close;
  }
  return row.openAt===undefined&&row.closeAt===undefined;
};
type OriginalCatalog=Phase66OriginalCatalog;
const group=(regime:string,h:string,side:string)=>
  [regime,h,side].join('|');
const horizon=(days:number):Phase70Cell['horizon']|null=>
  days>=1&&days<8?'1W':days>=8&&days<18?'2W':
  days>=18&&days<36?'4W':days>=36&&days<=80?'8W':null;
export function auditPhase70ExchangeDayExceptions(
  input:Phase70Input,pins:Phase70Pins
):Phase70Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE70_ALL_DAY_EXCHANGE_EXCEPTION_REVIEW_V1'||
    input.source!=='OWNER_PRIVATE_THIRD_CALENDAR_NOT_ISSUER_AUTHENTICATED'||
    !input.phase69||!input.phase69Pins||!pins||
    pins.schemaVersion!==
      'INDEPENDENT_PHASE70_ALL_DAY_EXCHANGE_EXCEPTION_PINS_V1'||
    ![pins.expectedPhase69InputSha256,pins.expectedPhase69PinsSha256,
      pins.expectedClaimedArchiveRawBytesSha256].every(x=>
      typeof x==='string'&&SHA.test(x))||
    sumHash(input.phase69)!==pins.expectedPhase69InputSha256||
    sumHash(input.phase69Pins)!==pins.expectedPhase69PinsSha256||
    !ID.test(pins.expectedClaimedIssuerReference??'')||
    !ID.test(pins.expectedClaimedArchiveReference??'')||
    !n(pins.expectedArchiveCalendarDays,1,500)||
    !n(pins.expectedOriginalOosDecisionDays,2,50000)||
    !n(pins.expectedOriginalNoEntryDays,0,50000)||
    !n(pins.expectedAllListedCePePairs,8,100000))
    return fail('PHASE70_THIRD_CALENDAR_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  const raw=decode(
    input.separatelySuppliedClaimedExchangeDayArchiveBase64,5_000_000);
  if(!raw||sha(raw)!==pins.expectedClaimedArchiveRawBytesSha256)
    return fail('PHASE70_SEPARATE_CLAIMED_EXCHANGE_DAY_BYTES_CHANGED',
      'INVALID_EVIDENCE');
  const archive=json<Phase70ClaimedExchangeArchive>(raw);
  if(!archive||archive.schemaVersion!==
      'ADAPTIVE_PHASE70_SEPARATE_CLAIMED_EXCHANGE_DAY_ARCHIVE_V1'||
    archive.source!==
      'OWNER_CUSTODIED_UNAUTHENTICATED_EXCHANGE_DAY_NOTICES'||
    archive.claimedIssuerReference!==pins.expectedClaimedIssuerReference||
    archive.claimedArchiveReference!==pins.expectedClaimedArchiveReference||
    !Array.isArray(archive.days)||
    archive.days.length!==pins.expectedArchiveCalendarDays||
    archive.days.length>500)
    return fail('PHASE70_CLAIMED_PUBLISHER_OR_ALL_DAY_ARCHIVE_INVALID',
      'INVALID_EVIDENCE');
  let prior:Phase69Report;
  try{
    prior=auditPhase69CalendarBlindSpots(input.phase69,input.phase69Pins);
  }catch{return fail('PHASE69_SOURCE_CALENDAR_REAUDIT_EXCEPTION');}
  const partial:Partial<Phase70Report>={
    phase69Status:prior.status,syntheticDataset:prior.syntheticDataset
  };
  if(!prior.status.startsWith('DESCRIPTIVE_')||
    prior.originalOosDecisionDays!==pins.expectedOriginalOosDecisionDays||
    prior.originalOosNoEntryDays!==pins.expectedOriginalNoEntryDays||
    prior.originalOosListedCePeContractPairs!==
      pins.expectedAllListedCePePairs)
    return fail('PHASE69_FULL_ORIGINAL_OOS_SOURCE_OR_COUNTS_NOT_READY',
      'INCOMPLETE_EVIDENCE',partial);
  const phase67=input.phase69.phase68.phase67,
    vendor=phase67.originalVendor;
  const vendorCatalog=decode(vendor.newVendorFullListedCatalogBase64,
      25_000_000),
    issuerCalendar=decode(phase67.candidateIssuerCalendarBase64,
      10_000_000),
    issuerMaster=decode(phase67.candidateIssuerMasterBase64,25_000_000);
  if(!vendorCatalog||!issuerCalendar||!issuerMaster)
    return fail('PHASE70_ORIGINAL_LISTED_CATALOG_ISSUER_DATA_MISSING',
      'INCOMPLETE_EVIDENCE',partial);
  const cat=json<OriginalCatalog>(vendorCatalog),
    cal=json<Phase67IssuerClaimedCalendar>(issuerCalendar),
    master=json<Phase67IssuerClaimedMaster>(issuerMaster);
  if(!cat||!cal||!master||!Array.isArray(cat.decisions)||
    !Array.isArray(cal.sessions)||!Array.isArray(master.snapshots)||
    cal.claimedIssuerReference!==archive.claimedIssuerReference||
    master.claimedIssuerReference!==archive.claimedIssuerReference)
    return fail('PHASE70_THIRD_CLAIMED_ISSUER_ID_DIFFERS_FROM_SOURCE',
      'INCOMPLETE_EVIDENCE',partial);
  const listingEnd=new Map<string,string>();
  for(const snapshot of master.snapshots)
    for(const c of snapshot.optionContracts)
      listingEnd.set(c.instrumentKey,c.claimedLastTradingSessionDate);
  const first=cat.decisions.reduce((v,x)=>Math.min(v,date(x.sessionDate)),
    Infinity);
  const last=cat.decisions.reduce((v,dec)=>
    Math.max(v,...dec.originallyListedContracts.map(c=>
      date(listingEnd.get(c.instrumentKey)))), -Infinity);
  if(!Number.isFinite(first)||!Number.isFinite(last)||last<first||
    last-first>500*DAY||date(archive.coveredFrom)!==first||
    date(archive.coveredThrough)!==last||
    archive.days.length!==(last-first)/DAY+1)
    return fail('PHASE70_ARCHIVE_DOES_NOT_COVER_COMPLETE_OOS_EXPIRY_SPAN',
      'INCOMPLETE_EVIDENCE',partial);
  const calendarMap=new Map(cal.sessions.map(s=>[s.sessionDate,s]));
  const allDays=new Map<string,Phase70ClaimedCalendarDay>();
  let matching=0;
  for(let i=0;i<archive.days.length;i++){
    const expected=first+i*DAY;
    const row=archive.days[i];
    if(row.sessionDate!==strDate(expected)||allDays.has(row.sessionDate)||
      !classificationValid(row,expected))
      return fail('PHASE70_UNSORTED_INCOMPLETE_DAY_OR_NOTICE_CLOCK_INVALID',
        'INCOMPLETE_EVIDENCE',partial);
    const calSession=calendarMap.get(row.sessionDate),
      isOpen=row.status==='REGULAR_OPEN'||
        row.status==='SPECIAL_WEEKEND_OPEN';
    if(calSession&&(!isOpen||
      row.openAt!==calSession.openAt||
      row.closeAt!==calSession.closeAt))
      return fail('PHASE70_CLAIMED_CLOSED_DAY_CONTRADICTS_TRADING_SESSION',
        'INCOMPLETE_EVIDENCE',partial);
    allDays.set(row.sessionDate,row);
  }
  if(cal.sessions.some(s=>
      date(s.sessionDate)>=first&&date(s.sessionDate)<=last&&
      !allDays.has(s.sessionDate)))
    return fail('PHASE70_ORIGINAL_CANDIDATE_SESSION_NOT_CLASSIFIED',
      'INCOMPLETE_EVIDENCE',partial);
  // Original "first following OPEN" cannot silently move forward when
  // source lacks an extra candidate OPEN day in the third archive.
  for(const dec of cat.decisions){
    const actual=cal.sessions.find(s=>s.sessionDate>dec.sessionDate);
    const claimed=archive.days.find(s=>s.sessionDate>dec.sessionDate&&
      (s.status==='REGULAR_OPEN'||
        s.status==='SPECIAL_WEEKEND_OPEN'));
    if(!actual||!claimed||actual.sessionDate!==claimed.sessionDate)
      return fail('PHASE70_ORIGINAL_FIRST_NEXT_OPEN_DAY_CHANGED',
        'INCOMPLETE_EVIDENCE',partial);
    matching++;
  }
  let countedMissing=0,holiday=0,emergency=0,missingOpen=0,
    notKnownAtDecision=0,weekendSpecial=0,
    missingSpecialWeekend=0,pairs=0;
  const cells=new Map<string,Phase70Cell>();
  for(const dec of cat.decisions){
    for(const contract of dec.originallyListedContracts){
      pairs++;
      const from=date(dec.sessionDate),
        through=date(listingEnd.get(contract.instrumentKey));
      const h=horizon((date(contract.expiry)+10*3600000-
        Date.parse(dec.decisionAt))/DAY);
      if(!Number.isFinite(from)||!Number.isFinite(through)||!h||
        through<from||through-first>500*DAY)
        return fail('PHASE70_ORIGINAL_LISTED_CONTRACT_EXPIRY_REASSIGNED',
          'INCOMPLETE_EVIDENCE',partial);
      const k=group(dec.claimedRegime,h,contract.optionType);
      let cell=cells.get(k);
      if(!cell){
        cell={
          claimedRegime:dec.claimedRegime,horizon:h,
          optionType:contract.optionType,originalListedPairs:0,
          originalNoEntryPairs:0,missingWeekdaySlotsFromPhase69:0,
          claimedHolidayClosureSlots:0,
          claimedEmergencyClosureSlots:0,
          undisclosedRegularOpenSessionSlots:0,
          closureNoticeNotClaimedKnownAtOriginalDecisionSlots:0,
          explicitlyDeclaredSpecialWeekendOpenSlots:0,
          missingSpecialWeekendOpenSourceSlots:0,
          remainingUnclassifiedWeekdaySlots:0,
          allClosureClassificationIsUnverified:true,
          declaredOpeningQuoteIsNotExecutionFill:true
        };
        cells.set(k,cell);
      }
      cell.originalListedPairs++;
      if(dec.originalEntryDisposition==='NO_ENTRY')cell.originalNoEntryPairs++;
      for(let when=from;when<=through;when+=DAY){
        const ds=strDate(when),row=allDays.get(ds);
        if(!row)return fail('PHASE70_ORIGINAL_CONTRACT_UNCLASSIFIED_DAY',
          'INCOMPLETE_EVIDENCE',partial);
        const declared=calendarMap.has(ds);
        if(row.status==='SPECIAL_WEEKEND_OPEN'){
          weekendSpecial++;cell.explicitlyDeclaredSpecialWeekendOpenSlots++;
          if(!declared){
            missingSpecialWeekend++;
            cell.missingSpecialWeekendOpenSourceSlots++;
          }
        }
        if(!weekday(when)||declared)continue;
        countedMissing++;cell.missingWeekdaySlotsFromPhase69++;
        if(row.status==='HOLIDAY_CLOSED'){
          holiday++;cell.claimedHolidayClosureSlots++;
        }else if(row.status==='EMERGENCY_CLOSED'){
          emergency++;cell.claimedEmergencyClosureSlots++;
        }else if(row.status==='REGULAR_OPEN'){
          missingOpen++;cell.undisclosedRegularOpenSessionSlots++;
          cell.remainingUnclassifiedWeekdaySlots++;
        }else return fail('PHASE70_MISSING_WEEKDAY_WITH_INVALID_CLASS',
          'INCOMPLETE_EVIDENCE',partial);
        if(row.status==='HOLIDAY_CLOSED'||
          row.status==='EMERGENCY_CLOSED'){
          if(t(row.claimedNoticeReceivedAt)>Date.parse(dec.decisionAt)){
            notKnownAtDecision++;
            cell.closureNoticeNotClaimedKnownAtOriginalDecisionSlots++;
          }
        }
      }
    }
  }
  const fields:Partial<Phase70Report>={
    ...partial,originalOosDecisions:cat.decisions.length,
    originalNoEntryDays:cat.decisions.filter(d=>
      d.originalEntryDisposition==='NO_ENTRY').length,
    originalAllListedCePePairs:pairs,
    sourceClaimedCalendarDays:archive.days.length,
    matchedOriginalEntryNextSessionDecisions:matching,
    missingWeekdayContractSlotsFromPhase69:countedMissing,
    claimedHolidayContractSlots:holiday,
    claimedEmergencyClosureContractSlots:emergency,
    missingRegularOpenExchangeLikeCalendarContractSlots:missingOpen,
    claimedClosureNotKnownAtOriginalDecisionSlots:notKnownAtDecision,
    explicitlyDeclaredWeekendSpecialSessionContractSlots:weekendSpecial,
    missingSpecialWeekendOpenSourceContractSlots:missingSpecialWeekend,
    remainingUnclassifiedWeekdayContractSlots:missingOpen,
    cells:[...cells.values()]
  };
  if(pairs!==pins.expectedAllListedCePePairs||
    fields.originalOosDecisions!==pins.expectedOriginalOosDecisionDays||
    fields.originalNoEntryDays!==pins.expectedOriginalNoEntryDays||
    countedMissing!==prior.totalUnexplainedPotentialWeekdayContractSlots||
    holiday+emergency+missingOpen!==countedMissing||
    [...cells.values()].reduce((n,x)=>n+x.originalListedPairs,0)!==pairs)
    return fail('PHASE70_ORIGINAL_OOS_WEEKDAY_SOURCE_DENOMINATORS_DISAGREE',
      'INCOMPLETE_EVIDENCE',fields);
  const status:Phase70Report['status']=missingOpen||missingSpecialWeekend?
    'DESCRIPTIVE_UNDECLARED_OPEN_SOURCE_SESSION_GAPS_ONLY':
    holiday+emergency?
      'DESCRIPTIVE_CLAIMED_CLOSED_DAY_EXCEPTIONS_UNVERIFIED_ONLY':
      'DESCRIPTIVE_INTERNAL_CALENDAR_RECONCILIATION_UNVERIFIED_ONLY';
  return {...empty(),...fields,status,
    reasonCodes:[
      missingOpen||missingSpecialWeekend?
        'THIRD_CALENDAR_CLAIMS_OPEN_ON_UNDECLARED_OPTION_SOURCE_DATES':
        'NO_THIRD_CALENDAR_UNDECLARED_OPEN_DATES_BUT_NOT_OFFICIAL',
      holiday+emergency?
        'HOLIDAY_AND_CLOSURE_DOCUMENTS_OWNER_CLAIMED_NOT_AUTHENTICATED':
        'NO_HOLIDAY_EXCEPTION_CLAIM_IN_CANDIDATE_SPAN',
      notKnownAtDecision?
        'SOME_CLAIMED_CLOSURES_NOT_KNOWN_AT_ORIGINAL_ENTRY_DECISION':
        'NO_LATE_RELATIVE_TO_ENTRY_CLOSURE_NOTICE_CLAIMS',
      'THIRD_SOURCE_AND_ALL_BYTE_PINS_CAN_BE_FABRICATED_BY_ONE_OWNER',
      'OPTION_SOURCE_FILL_PROFIT_LICENSE_AND_NRML_GTT_STOP_ACK_UNVERIFIED'
    ]};
}
