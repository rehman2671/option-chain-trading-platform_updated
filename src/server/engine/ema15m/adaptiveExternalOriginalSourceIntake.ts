/**
 * Phase 21 — OFFLINE source acquisition / L1 feed provenance intake.
 *
 * Readiness is limited to consistency of separately supplied raw bytes and
 * provenance declarations. Matching hashes, delivery references, operator
 * entitlement identifiers and timestamps DO NOT authenticate a vendor,
 * exchange, source clock, licensing rights or broker execution.
 *
 * This module never fetches market data, handles broker accounts, writes files,
 * sends orders, reproduces licensed L1, or changes MIS/NRML trading logic.
 */
import {createHash} from 'node:crypto';
import type {VerifiedHistoricalBundleV1} from './adaptiveVendorIngestion.js';
import type {
  IndependentlySuppliedCalendarEvidence
} from './adaptiveCrossSourceCalendarAudit.js';

const SHA=/^[a-f0-9]{64}$/;
const IST_MS=330*60000;
const MAX_BYTES=1024*1024;
const hex=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const day=(at:number)=>new Date(at+IST_MS).toISOString().slice(0,10);
const safeId=(v:unknown):v is string=>typeof v==='string'&&
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{3,127}$/.test(v);
const exactDate=(v:unknown):v is string=>typeof v==='string'&&
  /^\d{4}-\d{2}-\d{2}$/.test(v)&&
  Number.isFinite(Date.parse(v+'T00:00:00Z'))&&
  new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const timestamp=(v:unknown):v is string=>typeof v==='string'&&
  /^\d{4}-\d\d-\d\dT/.test(v)&&
  /(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const unique=(items:string[])=>[...new Set(items)];
const present=(b:Uint8Array|null|undefined,max:number)=>!!b&&
  b.length>1&&b.length<=max;
const warnings=[
  'INTAKE_METADATA_AND_SOURCE_SHA256_ONLY_PROVE_BYTE_CONSISTENCY_NOT_OFFICIAL_ORIGIN',
  'AN_OPERATOR_TYPED_VENDOR_LICENSE_REFERENCE_CANNOT_VERIFY_DATA_USE_RIGHTS',
  'NSE_HISTORICAL_ORDER_TRADE_FILES_ARE_NOT_NATIVE_HISTORICAL_L1_BID_ASK_BY_THEMSELVES',
  'EOD_TRADE_PRINT_AND_BHAVCOPY_CANNOT_REPLACE_EXECUTABLE_ORIGINAL_OPTION_BID',
  'RECONSTRUCTED_ORDER_BOOK_TIMESTAMPS_DO_NOT_PROVE_CONTEMPORANEOUS_STRATEGY_RECEIPT',
  'SOURCE_DECLARED_AVAILABLE_AT_MAY_BE_SYNTHETIC_OR_REPLAYED_UNLESS_INDEPENDENTLY_AUDITED',
  'UNSUPPORTED_MISSING_EXCHANGE_DAYS_AND_ZERO_QUOTE_L1_SESSIONS_ARE_NOT_WINS',
  'NO_TRADING_PERMISSION_NATIVE_STOPS_ACTUAL_FILLED_PRICES_OR_PROVEN_PROFITABILITY'
];
export type IntakeSourceCategory=
  'CONTEMPORANEOUS_NATIVE_LEVEL1_CAPTURE'|
  'LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE'|
  'HISTORICAL_ORDER_TRADE_EVENTS'|
  'HISTORICAL_TRADE_ONLY'|'END_OF_DAY_BHAVCOPY'|'SYNTHETIC';
export type OriginalOptionQuoteMethod=
  'ORIGINAL_NATIVE_BEST_BID_ASK_AND_BEST_LEVEL_QUANTITY'|
  'RECONSTRUCTED_BOOK_FROM_ALL_ORDER_MESSAGES'|
  'TRADE_AS_PROXY_FOR_BID_ASK';
export type StrategyAvailableAtMethod=
  'CAPTURED_AT_ORIGINAL_STRATEGY_RECEIPT'|
  'HISTORICAL_REPLAY_ESTIMATE'|'LATER_IMPORT_OR_FILE_DOWNLOAD_TIME';
export interface IntakeTradingDay {
  sessionDate:string;
  /** Unique source-delivery ledger record. Not a file path or trade ID. */
  originalDeliveryRecordId:string;
  originalBestBidAskEvents:number;
  originalStrategyDecisions:number;
}
export interface ExternalOriginalSourceIntakeV1 {
  schemaVersion:'ADAPTIVE_EXTERNAL_ORIGINAL_SOURCE_INTAKE_V1';
  studyProtocolId:string;
  datasetId:string;
  instrument:'NIFTY'|'BANKNIFTY'|'SENSEX';
  exchange:'NSE'|'BSE';
  originalBundleSha256:string;
  originalVendorArchiveSha256:string;
  separatelySuppliedCalendarManifestSha256:string;
  separatelySuppliedCalendarDocumentSha256:string;
  sourceProductCategory:IntakeSourceCategory;
  quoteMethod:OriginalOptionQuoteMethod;
  strategyAvailableAtMethod:StrategyAvailableAtMethod;
  /** Only an opaque record ID, never entitlement document or account secrets. */
  entitlementDocumentReferenceId:string;
  /** Only source metadata, not a license grant or external audit. */
  originalSourceDeliveryReferenceId:string;
  /** Only an opaque record ID, not independent validation of original clocks. */
  contemporaneousCaptureEvidenceReferenceId:string;
  coverageStart:string;
  coverageEnd:string;
  /** Exactly every official-style CALENDAR TRADING date, even 0-quote dates. */
  tradingDays:IntakeTradingDay[];
}
export interface OriginalSourceIntakeReport {
  mode:'OFFLINE_EVIDENCE_INTAKE_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  originalLicensedL1IndependentlyAuthenticated:false;
  originalAvailabilityClockIndependentlyAuthenticated:false;
  historicalUsageEntitlementIndependentlyVerified:false;
  exchangeIssuerIndependentlyAuthenticated:false;
  reviewerIdentityIndependentlyAuthenticated:false;
  brokerNativeStopProtectionProven:false;
  profitabilityProven:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|
    'SOURCE_DECLARATIONS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED';
  datasetId:string|null;
  synthetic:boolean|null;
  studyProtocolId:string|null;
  originalBundleSha256:string|null;
  originalVendorArchiveSha256:string|null;
  calendarManifestSha256:string|null;
  calendarDocumentSha256:string|null;
  instrument:string|null;
  exchange:string|null;
  sourceCategory:IntakeSourceCategory|null;
  strategyClockClass:StrategyAvailableAtMethod|null;
  suppliedIntakeSha256:string|null;
  errors:string[];
  blockers:string[];
  warnings:string[];
  expectedTradingDays:number;
  declaredTradingDays:number;
  sourceTradingDaysWithOriginalL1:number;
  sourceTradingDaysWithNoL1:number;
  sourceVendorDecisionDays:number;
  totalSourceOptionL1Observations:number;
  unmatchedTradingDayRows:number;
  countMismatches:number;
  sourceOriginalClockViolations:number;
  unrecognizedOriginalOptionContractKeys:number;
  externalActionsRequired:string[];
}
const externalActions=[
  'OBTAIN_WRITTEN_AND_INDEPENDENTLY_REVIEWED_ORIGINAL_HISTORICAL_INDEX_OPTION_DATA_ENTITLEMENT',
  'RETAIN_ORIGINAL_LICENSED_VENDOR_BYTES_HASHES_DELIVERY_CONTRACT_AND_DATA_DICTIONARY',
  'VERIFY_NATIVE_OR_RECONSTRUCTED_FULL_BEST_BID_ASK_WITH_QUANTITY_FOR_EVERY_RELEVANT_CONTRACT',
  'AUDIT_ORIGINAL_FEED_EVENT_AND_STRATEGY_AVAILABLE_AT_TIMESTAMPS_AGAINST_INDEPENDENT_LOGS',
  'AUTHENTICATE_NSE_OR_BSE_ORIGINAL_CALENDAR_ISSUER_HOLIDAY_SPECIAL_SESSION_AND_EXPIRY_RULES',
  'PROVE_EACH_RELEVANT_MARKET_DAY_AND_MISSING_OR_UNPRICED_L1_PATH_TO_INDEPENDENT_REVIEWERS',
  'PRESPECIFY_OOS_HORIZONS_COST_DEPTH_AND_CENSOR_THRESHOLDS_WITH_IMMUTABLE_THIRD_PARTY_TIME',
  'INDEPENDENTLY_EVALUATE_OOS_RISK_AND_NATIVE_BROKER_NRML_STOP_ORDER_SAFETY'
];
function blank(raw:VerifiedHistoricalBundleV1|null):OriginalSourceIntakeReport{
  return{
    mode:'OFFLINE_EVIDENCE_INTAKE_ONLY',
    executionAuthorized:false,productionSafe:false,
    originalLicensedL1IndependentlyAuthenticated:false,
    originalAvailabilityClockIndependentlyAuthenticated:false,
    historicalUsageEntitlementIndependentlyVerified:false,
    exchangeIssuerIndependentlyAuthenticated:false,
    reviewerIdentityIndependentlyAuthenticated:false,
    brokerNativeStopProtectionProven:false,
    profitabilityProven:false,
    status:'REJECTED',
    datasetId:raw?.provenance?.datasetId??null,
    synthetic:raw?.provenance?.synthetic??null,
    studyProtocolId:null,
    originalBundleSha256:null,
    originalVendorArchiveSha256:null,
    calendarManifestSha256:null,
    calendarDocumentSha256:null,
    instrument:raw?.instrument??null,
    exchange:raw?.instrument==='SENSEX'?'BSE':
      ['NIFTY','BANKNIFTY'].includes(raw?.instrument??'')?'NSE':null,
    sourceCategory:null,strategyClockClass:null,suppliedIntakeSha256:null,
    errors:[],blockers:[],warnings,
    expectedTradingDays:0,declaredTradingDays:0,
    sourceTradingDaysWithOriginalL1:0,sourceTradingDaysWithNoL1:0,
    sourceVendorDecisionDays:0,totalSourceOptionL1Observations:0,
    unmatchedTradingDayRows:0,countMismatches:0,
    sourceOriginalClockViolations:0,unrecognizedOriginalOptionContractKeys:0,
    externalActionsRequired:externalActions
  };
}
/**
 * Every input comes from caller-retained files. No option quotes or license
 * document are copied into the report. The intake manifest bytes are the
 * exact object evaluated, not a mutable second object.
 */
export function auditAdaptiveExternalOriginalSourceIntake(
  raw:VerifiedHistoricalBundleV1|unknown,
  originalBundleBytes:Uint8Array|null|undefined,
  originalVendorArchiveBytes:Uint8Array|null|undefined,
  calendar:IndependentlySuppliedCalendarEvidence|unknown,
  originalCalendarManifestBytes:Uint8Array|null|undefined,
  originalCalendarDocumentBytes:Uint8Array|null|undefined,
  intake:ExternalOriginalSourceIntakeV1|unknown,
  originalIntakeManifestBytes:Uint8Array|null|undefined
):OriginalSourceIntakeReport{
  const b=raw as VerifiedHistoricalBundleV1|null;
  const c=calendar as IndependentlySuppliedCalendarEvidence|null;
  const m=intake as ExternalOriginalSourceIntakeV1|null;
  const result=blank(b);
  if(!b||b.schemaVersion!=='ADAPTIVE_VERIFIED_L1_BUNDLE_V1'||
     !b.provenance||!Array.isArray(b.executionL1)||
     !Array.isArray(b.sessions)||!c||
     c.schemaVersion!=='ADAPTIVE_CROSS_SOURCE_CALENDAR_V1'||
     !Array.isArray(c.days)||
     !present(originalBundleBytes,50*1024*1024)||
     !present(originalVendorArchiveBytes,50*1024*1024)||
     !present(originalCalendarManifestBytes,MAX_BYTES)||
     !present(originalCalendarDocumentBytes,50*1024*1024)||
     !present(originalIntakeManifestBytes,MAX_BYTES)||
     !m||m.schemaVersion!=='ADAPTIVE_EXTERNAL_ORIGINAL_SOURCE_INTAKE_V1'||
     !Array.isArray(m.tradingDays))
    return {...result,errors:['MISSING_OR_MALFORMED_ORIGINAL_INTAKE_SOURCE_FILES']};
  try{
    const decoder=new TextDecoder('utf-8',{fatal:true});
    const decoded=JSON.parse(decoder.decode(originalIntakeManifestBytes));
    if(JSON.stringify(decoded)!==JSON.stringify(m))
      return {...result,errors:['INTAKE_MANIFEST_BYTES_DIFFER_FROM_EVALUATED_RECORDS']};
    const bundle=JSON.parse(decoder.decode(originalBundleBytes));
    const calendar=JSON.parse(decoder.decode(originalCalendarManifestBytes));
    if(JSON.stringify(bundle)!==JSON.stringify(b)||
       JSON.stringify(calendar)!==JSON.stringify(c))
      return {...result,errors:['SOURCE_BYTES_DIFFER_FROM_SUPPLIED_EVALUATION_OBJECTS']};
  }catch{
    return {...result,errors:['UNREADABLE_ORIGINAL_INTAKE_MANIFEST_BYTES']};
  }
  result.suppliedIntakeSha256=hex(originalIntakeManifestBytes!);
  result.sourceCategory=m.sourceProductCategory;
  result.strategyClockClass=m.strategyAvailableAtMethod;
  const sourceSha=hex(originalVendorArchiveBytes!);
  const manifestSha=hex(originalCalendarManifestBytes!);
  const documentSha=hex(originalCalendarDocumentBytes!);
  const bundleSha=hex(originalBundleBytes!);
  result.studyProtocolId=m.studyProtocolId;
  result.originalBundleSha256=bundleSha;
  result.originalVendorArchiveSha256=sourceSha;
  result.calendarManifestSha256=manifestSha;
  result.calendarDocumentSha256=documentSha;
  if(!safeId(m.studyProtocolId)||!safeId(m.datasetId)||
     !safeId(m.entitlementDocumentReferenceId)||
     !safeId(m.originalSourceDeliveryReferenceId)||
     !safeId(m.contemporaneousCaptureEvidenceReferenceId)||
     !exactDate(m.coverageStart)||!exactDate(m.coverageEnd)||
     m.coverageStart>m.coverageEnd||
     !Object.values([
       'CONTEMPORANEOUS_NATIVE_LEVEL1_CAPTURE',
       'LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE',
       'HISTORICAL_ORDER_TRADE_EVENTS','HISTORICAL_TRADE_ONLY',
       'END_OF_DAY_BHAVCOPY','SYNTHETIC'
     ]).includes(m.sourceProductCategory)||
     ![
       'ORIGINAL_NATIVE_BEST_BID_ASK_AND_BEST_LEVEL_QUANTITY',
       'RECONSTRUCTED_BOOK_FROM_ALL_ORDER_MESSAGES',
       'TRADE_AS_PROXY_FOR_BID_ASK'
     ].includes(m.quoteMethod)||
     ![
       'CAPTURED_AT_ORIGINAL_STRATEGY_RECEIPT',
       'HISTORICAL_REPLAY_ESTIMATE','LATER_IMPORT_OR_FILE_DOWNLOAD_TIME'
     ].includes(m.strategyAvailableAtMethod))
    return {...result,errors:['INVALID_OR_UNKNOWN_INTAKE_SOURCE_METADATA']};
  if(![m.originalBundleSha256,m.originalVendorArchiveSha256,
    m.separatelySuppliedCalendarManifestSha256,
    m.separatelySuppliedCalendarDocumentSha256].every(v=>SHA.test(v))||
     m.originalBundleSha256!==bundleSha||
     m.originalVendorArchiveSha256!==sourceSha||
     m.separatelySuppliedCalendarManifestSha256!==manifestSha||
     m.separatelySuppliedCalendarDocumentSha256!==documentSha||
     b.provenance.sourceArtifactSha256!==sourceSha||
     c.originalDocumentSha256!==documentSha||
     new Set([bundleSha,sourceSha,manifestSha,documentSha,
       result.suppliedIntakeSha256]).size!==5)
    return {...result,errors:['ORIGINAL_VENDOR_BUNDLE_CALENDAR_OR_INTAKE_SOURCE_DIGEST_MISMATCH']};
  // Independent reviewed files and source classifications must match the
  // actual original historical source universe, not arbitrary typed labels.
  if(m.datasetId!==b.provenance.datasetId||
     m.instrument!==b.instrument||
     m.exchange!==(b.instrument==='SENSEX'?'BSE':'NSE')||
     c.exchange!==m.exchange||
     c.coverageStart!==m.coverageStart||
     c.coverageEnd!==m.coverageEnd||
     m.tradingDays.length>3000||
     c.days.length>3000)
    return {...result,errors:['INCOMPATIBLE_EXCHANGE_INSTRUMENT_DATASET_OR_CALENDAR_RANGE']};
  const trading=c.days.filter(d=>d.kind==='TRADING');
  result.expectedTradingDays=trading.length;
  result.declaredTradingDays=m.tradingDays.length;
  const errors:string[]=[],blockers:string[]=[];
  const add=(list:string[],s:string)=>{
    if(!list.includes(s))list.push(s);
  };
  if(!trading.length||trading.length!==m.tradingDays.length)
    add(errors,'INTAKE_LEDGER_OMITS_OR_ADDS_EXCHANGE_TRADING_DAYS');
  const instrumentKeys=new Set<string>();
  const decisions=new Map<string,number>();
  for(const s of b.sessions){
    if(s?.sessionDate)
      decisions.set(s.sessionDate,(decisions.get(s.sessionDate)??0)+1);
    for(const contract of s?.contracts?.data??[]){
      if(typeof contract?.instrument_key==='string')
        instrumentKeys.add(contract.instrument_key);
    }
  }
  result.sourceVendorDecisionDays=decisions.size;
  const quotes=new Map<string,number>();
  const seenQuoteRecords=new Set<string>();
  let clockBad=0,unmapped=0;
  for(const q of b.executionL1){
    if(!q||!timestamp(q.eventAt)||!timestamp(q.availableAt)||
       !safeId(q.sourceRecordId)||seenQuoteRecords.has(q.sourceRecordId)||
       Date.parse(q.eventAt)>Date.parse(q.availableAt)||
       Date.parse(q.availableAt)-Date.parse(q.eventAt)>
         b.maximumOriginalFeedLatencySeconds*1000){
      clockBad++;continue;
    }
    seenQuoteRecords.add(q.sourceRecordId);
    if(!instrumentKeys.has(q.instrumentKey))unmapped++;
    const d=day(Date.parse(q.eventAt));
    quotes.set(d,(quotes.get(d)??0)+1);
  }
  result.sourceOriginalClockViolations=clockBad;
  result.unrecognizedOriginalOptionContractKeys=unmapped;
  result.totalSourceOptionL1Observations=b.executionL1.length;
  if(clockBad)add(blockers,'INVALID_OR_DUPLICATE_VENDOR_ORIGINAL_EVENT_AVAILABLE_CLOCK_RECORD');
  if(unmapped)add(blockers,'ORIGINAL_OPTION_L1_WITHOUT_CONTEMPORANEOUS_CONTRACT_IDENTITY');
  const ledgerIds=new Set<string>();
  let daysWithQuotes=0,daysWithoutQuotes=0,mismatches=0,unmatched=0;
  const knownDays=new Set(trading.map(d=>d.sessionDate));
  if(trading.length===m.tradingDays.length){
    for(let i=0;i<trading.length;i++){
      const d=trading[i].sessionDate,row=m.tradingDays[i];
      if(!row||!exactDate(row.sessionDate)||
         row.sessionDate!==d||!safeId(row.originalDeliveryRecordId)||
         ledgerIds.has(row.originalDeliveryRecordId)||
         !Number.isSafeInteger(row.originalBestBidAskEvents)||
         row.originalBestBidAskEvents<0||
         !Number.isSafeInteger(row.originalStrategyDecisions)||
         row.originalStrategyDecisions<0){
        add(errors,'INVALID_UNSORTED_OR_DUPLICATE_SOURCE_DELIVERY_SESSION_LEDGER');
        unmatched++;continue;
      }
      ledgerIds.add(row.originalDeliveryRecordId);
      const actualQuotes=quotes.get(d)??0;
      const actualDecisions=decisions.get(d)??0;
      if(row.originalBestBidAskEvents!==actualQuotes||
         row.originalStrategyDecisions!==actualDecisions){
        mismatches++;
        add(blockers,'ORIGINAL_DAY_COUNT_MISMATCH_CANNOT_HIDE_MISSING_QUOTES');
      }
      if(actualQuotes>0)daysWithQuotes++;
      else{
        daysWithoutQuotes++;
        add(blockers,'EXCHANGE_TRADING_DAY_WITHOUT_ORIGINAL_OPTION_BEST_BID_ASK');
      }
    }
  }
  for(const d of quotes.keys()){
    if(!knownDays.has(d)){
      unmatched++;
      add(blockers,'ORIGINAL_L1_EVENT_DATE_NOT_IN_INDEPENDENT_TRADING_CALENDAR');
    }
  }
  for(const d of decisions.keys()){
    if(!knownDays.has(d)){
      unmatched++;
      add(blockers,'STRATEGY_DECISION_DATE_NOT_IN_INDEPENDENT_TRADING_CALENDAR');
    }
  }
  result.sourceTradingDaysWithOriginalL1=daysWithQuotes;
  result.sourceTradingDaysWithNoL1=daysWithoutQuotes;
  result.unmatchedTradingDayRows=unmatched;
  result.countMismatches=mismatches;
  if(b.provenance.synthetic||
     m.sourceProductCategory==='SYNTHETIC')
    add(blockers,'SYNTHETIC_SOURCE_IS_NOT_LICENSED_HISTORICAL_OPTION_L1');
  if(m.sourceProductCategory==='END_OF_DAY_BHAVCOPY'||
     m.sourceProductCategory==='HISTORICAL_TRADE_ONLY'||
     m.quoteMethod==='TRADE_AS_PROXY_FOR_BID_ASK')
    add(blockers,'TRADE_OR_END_OF_DAY_DATA_IS_NOT_ORIGINAL_OPTION_L1');
  if(m.sourceProductCategory==='HISTORICAL_ORDER_TRADE_EVENTS'||
     m.quoteMethod==='RECONSTRUCTED_BOOK_FROM_ALL_ORDER_MESSAGES')
    add(blockers,'HISTORICAL_ORDER_EVENTS_NEED_FULL_BOOK_RECONSTRUCTION_AND_INDEPENDENT_CLOCK_AUDIT');
  if(m.strategyAvailableAtMethod!=='CAPTURED_AT_ORIGINAL_STRATEGY_RECEIPT')
    add(blockers,'REPLAY_OR_DOWNLOAD_TIME_DOES_NOT_PROVE_ORIGINAL_STRATEGY_AVAILABILITY');
  if(!Number.isFinite(b.maximumOriginalFeedLatencySeconds)||
     b.maximumOriginalFeedLatencySeconds<0)
    add(blockers,'INVALID_OR_UNBOUNDED_ORIGINAL_FEED_CLOCK_LATENCY');
  if(!b.executionL1.length||!b.sessions.length)
    add(blockers,'NO_ORIGINAL_SOURCE_QUOTES_OR_DECISION_RECORDS');
  // Even the highest structural result explicitly requires actual external
  // license/issuer/clock verification before its use as authenticated data.
  return{
    ...result,errors:unique(errors),blockers:unique(blockers),
    status:errors.length?'REJECTED':blockers.length?
      'INCOMPLETE_EVIDENCE':
      'SOURCE_DECLARATIONS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED'
  };
}
