/**
 * Phase 18: OFFLINE versioned, instrument-specific market SESSION evidence.
 *
 * A single exchange-wide day window is only an ENVELOPE: index candles,
 * still-trading index options and *expiring* index options may have different
 * valid hours. A future-effective circular must not silently rewrite older
 * timestamps. This is supplied-source consistency, NOT NSE/BSE issuer proof.
 *
 * No broker, network, price/position execution or strategy re-selection.
 */
import {createHash} from 'node:crypto';
import type {VerifiedHistoricalBundleV1} from './adaptiveVendorIngestion.js';
import type {IndependentlySuppliedCalendarEvidence} from './adaptiveCrossSourceCalendarAudit.js';

export interface InstrumentTimeWindow {openAt:string;closeAt:string}
export interface VersionedInstrumentTradingDay {
  sessionDate:string;
  versionId:string;
  sourceRecordId:string;
  sessionKind:'REGULAR'|'SPECIAL';
  /** 15m index candles must START and END wholly inside one window. */
  underlyingIndexWindows:InstrumentTimeWindow[];
  /** All non-expiring listed index options on this particular session. */
  nonExpiringOptionWindows:InstrumentTimeWindow[];
  /** Listed options whose own expiry is THIS trading date only. */
  expiringOptionWindows:InstrumentTimeWindow[];
}
export interface InstrumentSessionVersion {
  versionId:string;
  sourceCircularId:string;
  sourcePublishedAt:string;
  effectiveFrom:string;
  effectiveThrough:string;
}
export interface VersionedInstrumentSessionEvidence {
  schemaVersion:'ADAPTIVE_VERSIONED_INSTRUMENT_SESSIONS_V1';
  exchange:'NSE'|'BSE';
  instrument:'NIFTY'|'BANKNIFTY'|'SENSEX';
  studyProtocolId:string;
  originalCalendarManifestSha256:string;
  originalCalendarDocumentSha256:string;
  coverageStart:string;
  coverageEnd:string;
  /** Self-declared rule versions; official issuer/circular authenticity unverified. */
  versions:InstrumentSessionVersion[];
  /** EXACTLY one dated rule application for every calendar TRADING date. */
  tradingDays:VersionedInstrumentTradingDay[];
}
export interface VersionedInstrumentSessionReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  issuerAuthenticated:false;
  originalClockAuthenticated:false;
  brokerFillsAuthenticated:false;
  brokerProtectionInstalled:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED';
  datasetId:string|null;
  synthetic:boolean|null;
  studyProtocolId:string|null;
  originalCalendarManifestSha256:string|null;
  evidenceSha256:string|null;
  errors:string[];
  blockers:string[];
  warnings:string[];
  tradingDaysExpected:number;
  tradingDaysCovered:number;
  ruleVersionsApplied:number;
  specialSessionsReviewed:number;
  expiryCutoffExceptionDays:number;
  originalIndexCandlesOutsideInstrumentHours:number;
  decisionClockOutsideIndexHours:number;
  contractCatalogOrChainOutsideOptionHours:number;
  optionL1OutsideInstrumentHours:number;
  missingInstrumentContractExpiryMappings:number;
  quotesAfterOwnContractExpiry:number;
}
const DAY=86400000,IST=330*60000,MS15=15*60000;
const HASH=/^[0-9a-f]{64}$/;
const date=(x:unknown):x is string=>typeof x==='string'&&
  /^\d{4}-\d{2}-\d{2}$/.test(x)&&
  Number.isFinite(Date.parse(x+'T00:00:00Z'))&&
  new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const ts=(x:unknown):x is string=>typeof x==='string'&&
  /^\d{4}-\d\d-\d\dT/.test(x)&&
  /(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const str=(x:unknown):x is string=>typeof x==='string'&&
  /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,127}$/.test(x);
const day=(t:number)=>new Date(t+IST).toISOString().slice(0,10);
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const warnings=[
  'PHASE15_DAY_OPEN_CLOSE_IS_A_BROAD_ENVELOPE_NOT_EVERY_INSTRUMENT_NORMAL_SESSION',
  'EXPIRING_AND_NONEXPIRING_OPTIONS_MAY_HAVE_DIFFERENT_CLOSE_TIMES',
  'FUTURE_EFFECTIVE_SCHEDULE_MUST_NOT_REWRITE_EARLIER_ORIGINAL_L1',
  'PREOPEN_FUTURES_AUCTION_IS_NOT_TRADABLE_OPTION_L1',
  'SOURCE_CIRCULAR_IDS_AND_VERSION_DATES_ARE_SELF_DECLARED_NOT_AUTHENTICATED',
  'SOURCE_CLOCKS_LICENSE_AND_BROKER_ORDER_FILLS_REQUIRE_INDEPENDENT_VERIFICATION',
  'MISSING_POST_EXPIRY_LIQUIDITY_CANNOT_BE_INFERRED_OR_SYNTHESIZED',
  'NO_TRADING_PERMISSIONS_NO_15_15_NRML_AUTO_SQUARE_OFF'
];
function empty(raw:VerifiedHistoricalBundleV1|null):VersionedInstrumentSessionReport{
  return {
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    profitabilityProven:false,issuerAuthenticated:false,
    originalClockAuthenticated:false,brokerFillsAuthenticated:false,
    brokerProtectionInstalled:false,status:'REJECTED',
    datasetId:raw?.provenance?.datasetId??null,
    synthetic:raw?.provenance?.synthetic??null,
    studyProtocolId:null,originalCalendarManifestSha256:null,
    evidenceSha256:null,errors:[],blockers:[],warnings,
    tradingDaysExpected:0,tradingDaysCovered:0,
    ruleVersionsApplied:0,specialSessionsReviewed:0,
    expiryCutoffExceptionDays:0,
    originalIndexCandlesOutsideInstrumentHours:0,
    decisionClockOutsideIndexHours:0,
    contractCatalogOrChainOutsideOptionHours:0,
    optionL1OutsideInstrumentHours:0,
    missingInstrumentContractExpiryMappings:0,
    quotesAfterOwnContractExpiry:0
  };
}
function validateWindows(
  source:unknown,sessionDate:string,envelope:InstrumentTimeWindow
):InstrumentTimeWindow[]|null{
  if(!Array.isArray(source)||source.length<1||source.length>4)return null;
  const windows:InstrumentTimeWindow[]=[];
  let prior=NaN;
  for(const r of source){
    if(!r||!ts(r.openAt)||!ts(r.closeAt))return null;
    const o=Date.parse(r.openAt),c=Date.parse(r.closeAt);
    if(!(c>o&&c-o<=DAY&&day(o)===sessionDate&&day(c)===sessionDate&&
       o>=Date.parse(envelope.openAt)&&c<=Date.parse(envelope.closeAt)))
      return null;
    if(Number.isFinite(prior)&&o<prior)return null;
    windows.push({openAt:r.openAt,closeAt:r.closeAt});
    prior=c;
  }
  return windows;
}
function inside(
  at:unknown,windows:InstrumentTimeWindow[],duration=0
):boolean{
  if(!ts(at))return false;
  const t=Date.parse(at);
  return windows.some(w=>
    t>=Date.parse(w.openAt)&&t+duration<=Date.parse(w.closeAt));
}
export function auditAdaptiveVersionedInstrumentSessions(
  raw:VerifiedHistoricalBundleV1|unknown,
  calendar:IndependentlySuppliedCalendarEvidence|unknown,
  originalCalendarManifestBytes:Uint8Array|null|undefined,
  evidence:VersionedInstrumentSessionEvidence|unknown,
  evidenceBytes:Uint8Array|null|undefined
):VersionedInstrumentSessionReport{
  const b=raw as VerifiedHistoricalBundleV1|null;
  const c=calendar as IndependentlySuppliedCalendarEvidence|null;
  const p=evidence as VersionedInstrumentSessionEvidence|null;
  const result=empty(b);
  if(!b||b.schemaVersion!=='ADAPTIVE_VERIFIED_L1_BUNDLE_V1'||
     !Array.isArray(b.sessions)||!Array.isArray(b.executionL1)||
     !c||c.schemaVersion!=='ADAPTIVE_CROSS_SOURCE_CALENDAR_V1'||
     !Array.isArray(c.days)||!Array.isArray(c.contractExpiries)||
     !originalCalendarManifestBytes?.length||!evidenceBytes?.length||
     !p||p.schemaVersion!=='ADAPTIVE_VERSIONED_INSTRUMENT_SESSIONS_V1'||
     !Array.isArray(p.versions)||!Array.isArray(p.tradingDays)||
     !str(p.studyProtocolId)||
     !HASH.test(p.originalCalendarManifestSha256??'')||
     !HASH.test(p.originalCalendarDocumentSha256??''))
    return {...result,errors:['INVALID_OR_MISSING_ORIGINAL_INSTRUMENT_SESSION_EVIDENCE']};
  // The manifest must be the exact parsed content of the operator-pinned
  // original bytes, not an independently supplied edited in-memory object.
  try{
    const source=new TextDecoder('utf-8',{fatal:true}).decode(evidenceBytes);
    if(JSON.stringify(JSON.parse(source))!==JSON.stringify(p))
      return {...result,errors:['UNBOUND_IN_MEMORY_SEGMENT_MANIFEST']};
  }catch{
    return {...result,errors:['INVALID_OR_UNPARSEABLE_SEGMENT_MANIFEST_BYTES']};
  }
  const manifestHash=sha(originalCalendarManifestBytes);
  const evidenceHash=sha(evidenceBytes);
  result.evidenceSha256=evidenceHash;
  result.originalCalendarManifestSha256=manifestHash;
  result.studyProtocolId=p.studyProtocolId;
  if(manifestHash!==p.originalCalendarManifestSha256||
     c.originalDocumentSha256!==p.originalCalendarDocumentSha256||
     b.instrument!==p.instrument||
     p.exchange!==(b.instrument==='SENSEX'?'BSE':'NSE')||
     p.exchange!==c.exchange||
     p.coverageStart!==c.coverageStart||p.coverageEnd!==c.coverageEnd)
    return {...result,errors:['SEGMENT_SESSION_NOT_BOUND_TO_SAME_INDEPENDENT_EXCHANGE_CALENDAR']};
  if(!date(p.coverageStart)||!date(p.coverageEnd)||
     !p.versions.length||p.versions.length>100||
     p.tradingDays.length>3000)
    return {...result,errors:['INVALID_VERSIONED_SESSION_SCOPE']};
  const seenVersions=new Map<string,InstrumentSessionVersion>();
  let previousThrough='';
  for(const v of p.versions){
    if(!v||!str(v.versionId)||!str(v.sourceCircularId)||
       !ts(v.sourcePublishedAt)||!date(v.effectiveFrom)||
       !date(v.effectiveThrough)||v.effectiveThrough<v.effectiveFrom||
       seenVersions.has(v.versionId)||
       (previousThrough&&v.effectiveFrom<=previousThrough)||
       Date.parse(v.sourcePublishedAt)>
         Date.parse(v.effectiveFrom+'T23:59:59+05:30'))
      return {...result,errors:['INVALID_DUPLICATE_OVERLAPPING_OR_RETROACTIVE_RULE_VERSION']};
    seenVersions.set(v.versionId,v);
    previousThrough=v.effectiveThrough;
  }
  const dates=c.days.filter(d=>d.kind==='TRADING');
  result.tradingDaysExpected=dates.length;
  if(p.tradingDays.length!==dates.length)
    return {...result,errors:['OMITTED_OR_EXTRA_TRADING_DAY_IN_SEGMENT_RULE_LEDGER']};
  const byDay=new Map<string,VersionedInstrumentTradingDay>();
  let special=0,early=0;
  for(let i=0;i<dates.length;i++){
    const d=dates[i];
    const s=p.tradingDays[i];
    if(!s||s.sessionDate!==d.sessionDate||s.sessionKind!==d.sessionKind||
       !str(s.sourceRecordId)||byDay.has(s.sessionDate)||
       !seenVersions.has(s.versionId))
      return {...result,errors:['INVALID_UNSORTED_OR_DUPLICATE_SEGMENT_TRADING_DAYS']};
    const version=seenVersions.get(s.versionId)!;
    if(s.sessionDate<version.effectiveFrom||
       s.sessionDate>version.effectiveThrough)
      return {...result,errors:['RULE_APPLIED_OUTSIDE_DECLARED_EFFECTIVE_DATE']};
    const win=d as Extract<typeof d,{kind:'TRADING'}>;
    // A rule published after the effective session opened must NEVER be
    // used to reinterpret earlier market prices in that same trading day.
    if(Date.parse(version.sourcePublishedAt)>Date.parse(win.openAt))
      return {...result,errors:['RULE_PUBLISHED_AFTER_ORIGINAL_SESSION_OPEN']};
    const envelope={openAt:win.openAt,closeAt:win.closeAt};
    const ix=validateWindows(s.underlyingIndexWindows,s.sessionDate,envelope);
    const normal=validateWindows(s.nonExpiringOptionWindows,s.sessionDate,envelope);
    const expiry=validateWindows(s.expiringOptionWindows,s.sessionDate,envelope);
    if(!ix||!normal||!expiry)
      return {...result,errors:['SEGMENT_SESSION_WINDOWS_OVERLAP_OR_ESCAPE_EXCHANGE_ENVELOPE']};
    if(s.sessionKind==='SPECIAL')special++;
    if(Date.parse(expiry[expiry.length-1].closeAt)<
       Date.parse(normal[normal.length-1].closeAt))early++;
    byDay.set(s.sessionDate,s);
  }
  result.tradingDaysCovered=byDay.size;
  result.ruleVersionsApplied=new Set(p.tradingDays.map(x=>x.versionId)).size;
  result.specialSessionsReviewed=special;
  result.expiryCutoffExceptionDays=early;
  const blockers:string[]=[];
  const block=(s:string)=>{if(!blockers.includes(s))blockers.push(s);};
  const winFor=(sessionDate:string,expiry:string):InstrumentTimeWindow[]=>{
    const s=byDay.get(sessionDate);
    if(!s)return [];
    return expiry===sessionDate?s.expiringOptionWindows:s.nonExpiringOptionWindows;
  };
  const contracts=new Map<string,string>();
  let missing=0,indexOutside=0,decisionOutside=0,chainOutside=0,
      quoteOutside=0,postExpiry=0;
  for(const record of b.sessions){
    if(!record||!date(record.sessionDate)){
      block('INVALID_VENDOR_STRATEGY_SESSION_DATE');continue;
    }
    const d=byDay.get(record.sessionDate);
    if(!d){
      decisionOutside++;block('VENDOR_STRATEGY_DECISION_ON_CLOSED_OR_UNCOVERED_DAY');
      continue;
    }
    if(!inside(record.decisionAt,d.underlyingIndexWindows)){
      decisionOutside++;
      block('ORIGINAL_DECISION_OUTSIDE_INDEX_OBSERVATION_WINDOWS');
    }
    for(const candle of record.underlyingCandles??[]){
      if(!candle.isClosed||
         !inside(candle.timestamp,d.underlyingIndexWindows,MS15)){
        indexOutside++;
        block('CLOSED_INDEX_CANDLE_OUTSIDE_INSTRUMENT_SPECIFIC_SESSION');
      }
    }
    for(const contract of record.contracts?.data??[]){
      const key=contract.instrument_key;
      if(typeof key!=='string'||!key.trim()||!date(contract.expiry)||
         (contracts.has(key)&&contracts.get(key)!==contract.expiry)){
        missing++;
        block('ORIGINAL_CONTRACT_KEY_EXPIRY_MAPPING_MISSING_OR_CHANGED');
      }else contracts.set(key,contract.expiry);
      const windows=winFor(record.sessionDate,contract.expiry);
      if(!inside(record.contracts?.eventAt,windows)||
         !inside(record.contracts?.availableAt,windows)){
        chainOutside++;
        block('ORIGINAL_CONTRACT_SNAPSHOT_OUTSIDE_ITS_OPTION_SESSION');
      }
    }
    for(const chain of record.chains??[]){
      if(!date(chain?.data?.expiry)||
         !inside(chain.eventAt,winFor(record.sessionDate,chain.data.expiry))||
         !inside(chain.availableAt,winFor(record.sessionDate,chain.data.expiry))){
        chainOutside++;
        block('ORIGINAL_CHAIN_EVENT_OR_AVAILABILITY_OUTSIDE_OPTION_SESSION');
      }
    }
  }
  for(const quote of b.executionL1){
    if(!quote||typeof quote.instrumentKey!=='string'){
      missing++;block('OPTION_L1_CONTRACT_KEY_OR_EXPIRY_UNKNOWN');continue;
    }
    const expiry=contracts.get(quote.instrumentKey);
    if(!expiry){
      missing++;block('OPTION_L1_CONTRACT_KEY_OR_EXPIRY_UNKNOWN');continue;
    }
    if(!ts(quote.eventAt)||!ts(quote.availableAt)||
       Date.parse(quote.eventAt)>Date.parse(quote.availableAt)){
      quoteOutside++;block('INVALID_OR_NONMONOTONIC_ORIGINAL_L1_CLOCKS');continue;
    }
    const eventDay=day(Date.parse(quote.eventAt));
    const availableDay=day(Date.parse(quote.availableAt));
    if(eventDay>expiry||availableDay>expiry){
      postExpiry++;block('SOURCE_QUOTED_AN_ALREADY_EXPIRED_OPTION');
    }
    if(!inside(quote.eventAt,winFor(eventDay,expiry))||
       !inside(quote.availableAt,winFor(availableDay,expiry))){
      quoteOutside++;block('ORIGINAL_OPTION_L1_OUTSIDE_ITS_EXPIRY_CLASS_SESSION');
    }
  }
  if(!b.sessions.length||!b.executionL1.length)
    block('NO_ORIGINAL_DECISIONS_OR_OPTION_L1_TO_REVIEW');
  const report={
    ...result,blockers,
    originalIndexCandlesOutsideInstrumentHours:indexOutside,
    decisionClockOutsideIndexHours:decisionOutside,
    contractCatalogOrChainOutsideOptionHours:chainOutside,
    optionL1OutsideInstrumentHours:quoteOutside,
    missingInstrumentContractExpiryMappings:missing,
    quotesAfterOwnContractExpiry:postExpiry
  };
  return{
    ...report,status:blockers.length?'INCOMPLETE_EVIDENCE':
      'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED'
  };
}
