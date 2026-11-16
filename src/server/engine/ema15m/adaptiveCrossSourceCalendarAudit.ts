/**
 * Phase 15 — independently SUPPLIED (but NOT independently authenticated)
 * exchange calendar / expiry evidence cross-check.
 *
 * Phase 5–14 relied on the source bundle's own list of session windows:
 * a feed can omit an entire losing day and still pass internal continuity.
 * This module requires a SEPARATE complete day-by-day calendar ledger and
 * source document bytes. It compares all days, official-style *declared*
 * open/closed dates, special windows, expiries, vendor sessions and L1 clocks.
 *
 * A matching SHA256 proves only consistency of supplied bytes. The caller
 * cannot establish NSE/BSE authenticity, source independence, timestamp
 * truth or licensing by setting issuer/record IDs in a JSON file.
 * NO trading, browser, brokerage or network imports.
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import type {VerifiedHistoricalBundleV1} from './adaptiveVendorIngestion.js';

export type CalendarDayEvidence =
  | {
    sessionDate:string;
    kind:'TRADING';
    sessionKind:'REGULAR'|'SPECIAL';
    openAt:string; closeAt:string;
    sourceRecordId:string;
    closureReason?:never;
  }
  | {
    sessionDate:string;
    kind:'CLOSED';
    closureReason:'WEEKEND'|'HOLIDAY'|'EXCHANGE_CLOSURE';
    sourceRecordId:string;
    sessionKind?:never;
    openAt?:never;closeAt?:never;
  };
export interface IndependentlySuppliedCalendarEvidence {
  schemaVersion:'ADAPTIVE_CROSS_SOURCE_CALENDAR_V1';
  /** Self-declared identity; not authenticated by this process. */
  exchange:'NSE'|'BSE';
  issuerName:string;
  originalDocumentId:string;
  originalDocumentSha256:string;
  coverageStart:string;
  coverageEnd:string;
  /** EVERY consecutive calendar date, including Saturdays, Sundays and holidays. */
  days:CalendarDayEvidence[];
  /** All expiries observed in the source option contract catalog must be listed. */
  contractExpiries:Array<{
    instrument:'NIFTY'|'BANKNIFTY'|'SENSEX';
    expiryDate:string;
    sourceRecordId:string;
  }>;
}
export interface CalendarFoldCoverage {
  foldIndex:number;
  expectedTradingDecisions:number;
  observedTradingDecisions:number;
  omittedExpectedTradingDecisions:number;
  calendarTestWindowCovered:boolean;
}
export interface CrossSourceCalendarReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  exchangeCalendarIndependentlyAuthenticated:false;
  sourceDocumentIssuerVerified:false;
  originalFeedClockIndependentlyAuthenticated:false;
  originalExpiryScheduleIndependentlyAuthenticated:false;
  sourceDocumentLicenseIndependentlyVerified:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED';
  errors:string[];
  blockers:string[];
  warnings:string[];
  datasetId:string|null;
  synthetic:boolean|null;
  exchange:string|null;
  originalCalendarDocumentSha256:string|null;
  sourceChecksumMatched:boolean;
  coveredCalendarDays:number;
  coveredTradingDays:number;
  coveredClosedDays:number;
  specialSessionDays:number;
  sourceDecisionSessions:number;
  sourceDeclaredTradingSessions:number;
  missingVendorTradingSessions:number;
  extraVendorTradingSessions:number;
  mismatchedSessionWindows:number;
  missingDecisionSessions:number;
  optionL1OutsideCalendarCount:number;
  missingContractExpiryReferences:number;
  nonTradingContractExpiryCount:number;
  foldCoverage:CalendarFoldCoverage[];
}
const DAY=86400000;
const IST=330*60000;
const validDate=(v:unknown):v is string=>
  typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&
  Number.isFinite(Date.parse(v+'T00:00:00Z'))&&
  new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const validTs=(v:unknown):v is string=>
  typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&
  /(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const exchangeDay=(t:number)=>new Date(t+IST).toISOString().slice(0,10);
const validString=(s:unknown):s is string=>
  typeof s==='string'&&s.trim().length>=3&&s.length<=256;
const add=(errors:string[],v:string)=>{
  if(!errors.includes(v))errors.push(v);
};
const warnings=[
  'EXTERNALLY_SUPPLIED_DOES_NOT_MEAN_OFFICIALLY_AUTHENTICATED',
  'MATCHING_DOCUMENT_SHA256_IS_INTEGRITY_ONLY_NOT_A_VENDOR_OR_EXCHANGE_SIGNATURE',
  'ISSUER_NAME_AND_SOURCE_RECORD_IDS_ARE_UNVERIFIED_SELF_DECLARATIONS',
  'AN_OFFICIAL_NSE_BSE_HOLIDAY_EXPIRY_AND_SPECIAL_SESSION_REVIEW_IS_STILL_REQUIRED',
  'NO_AUTHENTIC_LICENSED_HISTORICAL_OPTION_L1_ORIGINAL_CLOCK_PROOF_ESTABLISHED',
  'CALENDAR_COVERAGE_DOES_NOT_GUARANTEE_QUOTE_DENSITY_DEPTH_OR_STOP_EXECUTION',
  'NO_PNL_EDGE_OR_REAL_BROKER_POSITION_SAFETY_PROVEN'
];
type TradingCalendarRow=Extract<CalendarDayEvidence,{kind:'TRADING'}>;

function reject(base:CrossSourceCalendarReport,errors:string[]):CrossSourceCalendarReport{
  return {...base,status:'REJECTED',errors:[...new Set(errors)]};
}

/**
 * Pass SOURCE DOCUMENT BYTES separately from both the derived trading-bundle
 * JSON and the separate calendar manifest JSON. Even an exact checksum does
 * not independently prove the claimed exchange issued those bytes.
 */
export function auditAdaptiveCrossSourceExchangeCalendar(
  raw:VerifiedHistoricalBundleV1|unknown,
  evidence:IndependentlySuppliedCalendarEvidence|unknown,
  originalDocumentBytes:Uint8Array|null|undefined
):CrossSourceCalendarReport{
  const bundle=raw as VerifiedHistoricalBundleV1|null;
  const cal=evidence as IndependentlySuppliedCalendarEvidence|null;
  const base:CrossSourceCalendarReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    profitabilityProven:false,
    exchangeCalendarIndependentlyAuthenticated:false,
    sourceDocumentIssuerVerified:false,
    originalFeedClockIndependentlyAuthenticated:false,
    originalExpiryScheduleIndependentlyAuthenticated:false,
    sourceDocumentLicenseIndependentlyVerified:false,
    status:'REJECTED',errors:[],blockers:[],warnings,
    datasetId:bundle?.provenance?.datasetId??null,
    synthetic:bundle?.provenance?.synthetic??null,
    exchange:cal?.exchange??null,
    originalCalendarDocumentSha256:null,
    sourceChecksumMatched:false,
    coveredCalendarDays:0,coveredTradingDays:0,coveredClosedDays:0,
    specialSessionDays:0,sourceDecisionSessions:0,
    sourceDeclaredTradingSessions:0,
    missingVendorTradingSessions:0,extraVendorTradingSessions:0,
    mismatchedSessionWindows:0,missingDecisionSessions:0,
    optionL1OutsideCalendarCount:0,missingContractExpiryReferences:0,
    nonTradingContractExpiryCount:0,foldCoverage:[]
  };
  const errors:string[]=[];
  if(!bundle||bundle.schemaVersion!=='ADAPTIVE_VERIFIED_L1_BUNDLE_V1'||
     !bundle.provenance||!Array.isArray(bundle.sessions)||
     !Array.isArray(bundle.executionL1)||
     !Array.isArray(bundle.declaredExchangeSessions)||
     !Array.isArray(bundle.policy?.folds)||
     !Array.isArray(bundle.provenance.expectedSessions))
    errors.push('ORIGINAL_VALID_SOURCE_ATTESTED_BUNDLE_REQUIRED');
  if(!cal||cal.schemaVersion!=='ADAPTIVE_CROSS_SOURCE_CALENDAR_V1'||
     !['NSE','BSE'].includes(cal.exchange)||
     !validString(cal.issuerName)||!validString(cal.originalDocumentId)||
     !/^[0-9a-f]{64}$/.test(cal.originalDocumentSha256??'')||
     !validDate(cal.coverageStart)||!validDate(cal.coverageEnd)||
     !Array.isArray(cal.days)||!Array.isArray(cal.contractExpiries))
    errors.push('INVALID_INDEPENDENT_CALENDAR_MANIFEST');
  if(errors.length)return reject(base,errors);
  if(!originalDocumentBytes?.length)
    return reject(base,['SEPARATELY_RETAINED_CALENDAR_SOURCE_DOCUMENT_REQUIRED']);
  const digest=createHash('sha256').update(originalDocumentBytes).digest('hex');
  const sha=Buffer.from(cal!.originalDocumentSha256,'hex');
  if(!timingSafeEqual(Buffer.from(digest,'hex'),sha))
    return reject(base,['CALENDAR_DOCUMENT_SHA256_MISMATCH']);
  if(digest===bundle!.provenance.sourceArtifactSha256)
    return reject(base,['CALENDAR_DOCUMENT_MUST_DIFFER_FROM_VENDOR_L1_ARTIFACT']);
  const exchange=bundle!.instrument==='SENSEX'?'BSE':'NSE';
  if(cal!.exchange!==exchange)
    return reject(base,['EXCHANGE_AND_UNDERLYING_MARKET_MISMATCH']);
  if(cal!.coverageStart>cal!.coverageEnd||
     (Date.parse(cal!.coverageEnd+'T00:00:00Z')-
       Date.parse(cal!.coverageStart+'T00:00:00Z'))/DAY>2000)
    return reject(base,['UNSUPPORTED_OR_INVALID_CALENDAR_COVERAGE_RANGE']);
  const span=1+(Date.parse(cal!.coverageEnd+'T00:00:00Z')-
    Date.parse(cal!.coverageStart+'T00:00:00Z'))/DAY;
  if(cal!.days.length!==span)
    return reject(base,['INCOMPLETE_DAY_BY_DAY_CALENDAR_LEDGER']);

  const calendarByDay=new Map<string,CalendarDayEvidence>();
  const trading=new Map<string,TradingCalendarRow>();
  const sourceIds=new Set<string>();
  for(let i=0;i<span;i++){
    const expectedDay=new Date(
      Date.parse(cal!.coverageStart+'T00:00:00Z')+i*DAY
    ).toISOString().slice(0,10);
    const d=cal!.days[i];
    if(!d||d.sessionDate!==expectedDay||!validString(d.sourceRecordId)||
       sourceIds.has(d.sourceRecordId)||
       !['CLOSED','TRADING'].includes(d.kind))
      return reject(base,['INVALID_DUPLICATE_OR_UNSORTED_CALENDAR_DAY_EVIDENCE']);
    sourceIds.add(d.sourceRecordId);
    if(d.kind==='TRADING'){
      const op=Date.parse(d.openAt),cl=Date.parse(d.closeAt);
      if(!['REGULAR','SPECIAL'].includes(d.sessionKind)||
         !validTs(d.openAt)||!validTs(d.closeAt)||
         op>=cl||cl-op>DAY||exchangeDay(op)!==d.sessionDate||
         exchangeDay(cl)!==d.sessionDate||
         d.closureReason!==undefined)
        return reject(base,['INVALID_CALENDAR_TRADING_SESSION_WINDOW']);
      trading.set(d.sessionDate,d);
    }else if(!['WEEKEND','HOLIDAY','EXCHANGE_CLOSURE'].includes(d.closureReason)||
             d.openAt!==undefined||d.closeAt!==undefined||
             d.sessionKind!==undefined)
      return reject(base,['INVALID_CALENDAR_CLOSED_DAY_EVIDENCE']);
    calendarByDay.set(d.sessionDate,d);
  }
  const expiryRows=new Set<string>();
  for(const e of cal!.contractExpiries){
    if(!e||!['NIFTY','BANKNIFTY','SENSEX'].includes(e.instrument)||
       !validDate(e.expiryDate)||!validString(e.sourceRecordId)||
       sourceIds.has(e.sourceRecordId)||
       expiryRows.has(e.instrument+'|'+e.expiryDate))
      return reject(base,['INVALID_DUPLICATE_OR_UNTRACEABLE_EXPIRY_EVIDENCE']);
    sourceIds.add(e.sourceRecordId);
    expiryRows.add(e.instrument+'|'+e.expiryDate);
  }
  const blockers:string[]=[];
  const flag=(s:string)=>add(blockers,s);
  const sourceWindows=bundle!.declaredExchangeSessions!;
  const windowMap=new Map<string,{openAt:string;closeAt:string}>();
  let missingVendorTradingSessions=0,extraVendorTradingSessions=0,
    mismatchedSessionWindows=0,missingDecisionSessions=0,
    optionL1OutsideCalendarCount=0,missingContractExpiryReferences=0,
    nonTradingContractExpiryCount=0;
  const originalIds=new Set<string>();
  let lastDate='';
  for(const s of sourceWindows){
    if(!s||!validDate(s.sessionDate)||!validTs(s.openAt)||
       !validTs(s.closeAt)||!validString(s.sourceRecordId)||
       originalIds.has(s.sourceRecordId)||windowMap.has(s.sessionDate)||
       (lastDate&&s.sessionDate<=lastDate))
      return reject(base,['INVALID_OR_DUPLICATE_ORIGINAL_EXCHANGE_WINDOWS']);
    windowMap.set(s.sessionDate,{openAt:s.openAt,closeAt:s.closeAt});
    originalIds.add(s.sourceRecordId);
    lastDate=s.sessionDate;
    if(!trading.has(s.sessionDate))extraVendorTradingSessions++;
  }
  for(const [day,row] of trading){
    const vendor=windowMap.get(day);
    if(!vendor)missingVendorTradingSessions++;
    else if(Date.parse(vendor.openAt)!==Date.parse(row.openAt)||
       Date.parse(vendor.closeAt)!==Date.parse(row.closeAt))
      mismatchedSessionWindows++;
  }
  if(missingVendorTradingSessions)
    flag('VENDOR_OMITTED_CALENDAR_TRADING_SESSIONS');
  if(extraVendorTradingSessions)
    flag('VENDOR_DECLARED_EXTRA_OR_CLOSED_DAY_AS_TRADING');
  if(mismatchedSessionWindows)
    flag('VENDOR_OR_SPECIAL_SESSION_HOURS_DIFFER_FROM_SEPARATE_CALENDAR');

  const decisions=bundle!.sessions;
  const decisionDates:string[]=[];
  let priorDecision='';
  for(const d of decisions){
    if(!d||!validDate(d.sessionDate)||d.sessionDate<=priorDecision)
      return reject(base,['INVALID_OR_DUPLICATE_VENDOR_DECISION_DATE']);
    decisionDates.push(d.sessionDate);
    priorDecision=d.sessionDate;
    const row=trading.get(d.sessionDate);
    if(!row)flag('DECISION_ON_CALENDAR_CLOSED_OR_UNCOVERED_DATE');
    if(!validTs(d.decisionAt)||!row||
       Date.parse(d.decisionAt)<Date.parse(row.openAt)||
       Date.parse(d.decisionAt)>Date.parse(row.closeAt))
      flag('DECISION_OUTSIDE_SEPARATE_EXCHANGE_WINDOW');
    for(const contract of d.contracts?.data??[]){
      if(!validDate(contract.expiry)||
         !expiryRows.has(bundle!.instrument+'|'+contract.expiry))
        missingContractExpiryReferences++;
      if(!trading.has(contract.expiry))nonTradingContractExpiryCount++;
    }
  }
  const expected= bundle!.provenance.expectedSessions;
  if(decisionDates.length!==expected.length||
     decisionDates.some((d,i)=>d!==expected[i]))
    flag('VENDOR_EXPECTED_DECISION_SESSIONS_DISAGREE');
  const actualDecisionDates=new Set(decisionDates);
  const firstDecision=decisionDates[0]??'';
  const lastDecision=decisionDates[decisionDates.length-1]??'';
  for(const day of trading.keys()){
    if(day>=firstDecision&&day<=lastDecision&&!actualDecisionDates.has(day))
      missingDecisionSessions++;
  }
  if(missingDecisionSessions)flag('MISSING_ENTIRE_HISTORICAL_DECISION_SESSION');
  if(!firstDecision||firstDecision<cal!.coverageStart||
     lastDecision>cal!.coverageEnd)
    flag('DECISION_PERIOD_EXCEEDS_CALENDAR_SOURCE_COVERAGE');
  if(missingContractExpiryReferences)
    flag('POINT_IN_TIME_CONTRACT_EXPIRY_NOT_IN_SEPARATE_EXPIRY_SCHEDULE');
  if(nonTradingContractExpiryCount)
    flag('CONTRACT_EXPIRES_ON_NONTRADING_OR_UNCOVERED_DATE');

  // Source L1 must be inside independently supplied session windows. A
  // quote missing from the vendor bundle cannot be authenticated by this
  // check; Phase 10 handles observed quote density, NOT full-day omissions.
  for(const q of bundle!.executionL1){
    if(!q||!validTs(q.eventAt)||!validTs(q.availableAt)){
      optionL1OutsideCalendarCount++;continue;
    }
    const e=Date.parse(q.eventAt),a=Date.parse(q.availableAt);
    const eventWindow=trading.get(exchangeDay(e));
    const availabilityWindow=trading.get(exchangeDay(a));
    const inside=(w:TradingCalendarRow|undefined,t:number)=>
      !!w&&t>=Date.parse(w.openAt)&&t<=Date.parse(w.closeAt);
    if(!inside(eventWindow,e)||!inside(availabilityWindow,a)||
       e>a)optionL1OutsideCalendarCount++;
  }
  if(optionL1OutsideCalendarCount)
    flag('ORIGINAL_L1_EVENT_OR_AVAILABILITY_OUTSIDE_SEPARATE_CALENDAR');
  const foldCoverage:CalendarFoldCoverage[]=[];
  for(let foldIndex=0;foldIndex<bundle!.policy.folds.length;foldIndex++){
    const fold=bundle!.policy.folds[foldIndex];
    if(!fold||!validDate(fold.testStart)||!validDate(fold.testEnd)||
       fold.testStart>fold.testEnd)
      return reject(base,['INVALID_ORIGINAL_WALKFORWARD_TEST_WINDOW']);
    const calendarTestWindowCovered=fold.testStart>=cal!.coverageStart&&
      fold.testEnd<=cal!.coverageEnd;
    const candidates=[...trading.keys()].filter(d=>
      d>=fold.testStart&&d<=fold.testEnd);
    const observed=decisionDates.filter(d=>
      d>=fold.testStart&&d<=fold.testEnd);
    const omitted=candidates.filter(d=>!actualDecisionDates.has(d)).length;
    if(!calendarTestWindowCovered)
      flag('OOS_FOLD_EXTENDS_OUTSIDE_SEPARATE_CALENDAR');
    if(omitted||observed.length!==candidates.length)
      flag('OOS_FOLD_MISSING_CALENDAR_TRADING_DECISIONS');
    foldCoverage.push({
      foldIndex,expectedTradingDecisions:candidates.length,
      observedTradingDecisions:observed.length,
      omittedExpectedTradingDecisions:omitted,
      calendarTestWindowCovered
    });
  }
  if(!bundle!.policy.folds.length)
    flag('NO_CHRONOLOGICAL_OOS_TEST_FOLDS');
  // A source must cover the actual dates of all quoted trades, earliest
  // declarations and latest expiry. No claimed 8W expiry may be beyond the
  // independently supplied calendar period, even if it was profitable.
  if(sourceWindows.length&&sourceWindows[0].sessionDate<cal!.coverageStart)
    flag('SOURCE_WARMUP_BEFORE_SEPARATE_CALENDAR_COVERAGE');
  const maxExpiry=cal!.contractExpiries.reduce((m,e)=>
    e.expiryDate>m?e.expiryDate:m,'');
  if(maxExpiry>cal!.coverageEnd)
    flag('EXPIRY_SCHEDULE_OUTSIDE_SEPARATE_CALENDAR_COVERAGE');
  return{
    ...base,
    status:blockers.length?'INCOMPLETE_EVIDENCE':
      'CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED',
    errors:[],blockers,
    originalCalendarDocumentSha256:digest,
    sourceChecksumMatched:true,
    coveredCalendarDays:span,coveredTradingDays:trading.size,
    coveredClosedDays:span-trading.size,
    specialSessionDays:[...trading.values()].filter(s=>
      s.sessionKind==='SPECIAL').length,
    sourceDecisionSessions:decisions.length,
    sourceDeclaredTradingSessions:sourceWindows.length,
    missingVendorTradingSessions,extraVendorTradingSessions,
    mismatchedSessionWindows,missingDecisionSessions,
    optionL1OutsideCalendarCount,missingContractExpiryReferences,
    nonTradingContractExpiryCount,foldCoverage
  };
}
