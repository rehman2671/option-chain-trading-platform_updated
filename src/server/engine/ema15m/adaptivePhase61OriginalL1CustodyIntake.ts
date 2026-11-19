/**
 * Phase61 — owner-provided ORIGINAL historical option evidence archives.
 * Point-in-time normalized L1 quotes must be reconcilable, row for row,
 * with independently pinned original raw-source custody bytes. The "raw"
 * archive here is a standard custody envelope generated from supplier
 * records; it does NOT authenticate original vendor-native bytes or prove
 * NSE/BSE licence, provenance, external clock trust, or strategy returns.
 *
 * This module READS memory only, performs no network/broker actions, and
 * cannot promote a paper review into live 1W/2W/4W/8W orders/GTT.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase60HorizonRegimeSufficiency,
  type Phase60Input,type Phase60IndependentPins,type Phase60Report
} from './adaptivePhase60HorizonRegimeEvidenceSufficiency.js';
import type {
  HistoricalComparisonInput,HistoricalExecutableQuote
} from './historicalAdaptiveComparison.js';

const SHA=/^[0-9a-f]{64}$/;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const hash=(v:unknown)=>digest(Buffer.from(JSON.stringify(v),'utf8'));
const b64=(s:unknown,max:number):Buffer|null=>{
  if(typeof s!=='string'||s.length<16||s.length>max*4/3+8||
    !B64.test(s))return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>16&&b.length<=max&&b.toString('base64')===s?
      b:null;
  }catch{return null;}
};
const parse=(b:Buffer):unknown=>{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(b);
  return JSON.parse(text);
};
const time=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
const finite=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const int=(n:unknown,min:number,max:number):n is number=>
  finite(n,min,max)&&Number.isSafeInteger(n);

export const hashPhase61Evidence=hash;
export const phase61ContractMasterSnapshot=(
  original:HistoricalComparisonInput
)=>original.decisions.map(d=>({
  sessionDate:d.sessionDate,decisionAt:d.decisionAt,
  contractsCapturedAt:d.contractsCapturedAt,
  listedContracts:d.listedContracts
}));
export const phase61SessionSnapshot=(input:Phase60Input)=>
  input.phase59.phase58.exitSessions;

/** These rows are an operator-custodied JSONL copy, NOT native exchange feed. */
export interface Phase61L1CustodyRow{
  sourceRecordId:string;
  sourceSequence:number;
  observedAt:string;
  availableAt:string;
  instrumentKey:string;
  bid:number;ask:number;bidQty:number;askQty:number;
}
export const phase61EnvelopeFromHistoricalQuotes=(
  original:HistoricalComparisonInput
):Phase61L1CustodyRow[]=>original.executionQuotes.map((q,i)=>({
  sourceRecordId:'OPERATOR_ARCHIVED_ROW_'+(i+1),
  sourceSequence:i+1,observedAt:q.observedAt,
  availableAt:q.availableAt??'',instrumentKey:q.instrumentKey,
  bid:q.bid,ask:q.ask,bidQty:q.bidQty,askQty:q.askQty
}));
export const phase61OriginalQuoteJsonl=(rows:Phase61L1CustodyRow[])=>
  rows.map(row=>JSON.stringify(row)).join('\n')+'\n';

export interface Phase61Input{
  schemaVersion:'ADAPTIVE_PHASE61_ORIGINAL_RAW_L1_CUSTODY_INTAKE_V1';
  source:'OWNER_PRIVATE_OPERATOR_CUSTODIED_ARCHIVES_UNVERIFIED';
  phase60:Phase60Input;
  phase60Pins:Phase60IndependentPins;
  /** Original operator-custodied JSONL, not a native vendor signed stream. */
  originalL1QuoteEnvelopeBase64:string;
  /** Original operator-custodied historical decisions' catalog snapshot. */
  originalPointInTimeContractCatalogBase64:string;
  /** Session/hold calendar, including exit days after last OOS decision. */
  originalExtendedSessionCalendarBase64:string;
  /** Opaque evidence bytes, not issuer-signed licence verification. */
  operatorClaimedLicenseEntitlementEvidenceBase64:string;
}
export interface Phase61IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE61_ORIGINAL_RAW_ARCHIVE_CUSTODY_PINS_V1';
  expectedPhase60InputSha256:string;
  expectedPhase60PinsSha256:string;
  expectedOriginalL1QuoteEnvelopeBytesSha256:string;
  expectedOriginalContractCatalogBytesSha256:string;
  expectedOriginalExtendedCalendarBytesSha256:string;
  expectedOriginalClaimedLicenseDocumentBytesSha256:string;
  expectedOriginalL1QuoteCount:number;
  expectedOriginalHistoricalDecisionCount:number;
  expectedOriginalListedOptionContractRows:number;
  expectedOriginalExtendedCalendarSessions:number;
  maximumAllowedEventToAvailabilityLagSeconds:number;
}
export interface Phase61Report{
  mode:'OWNER_PRIVATE_ORIGINAL_L1_ARCHIVE_BYTE_CUSTODY_RECONCILIATION';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY';
  reasonCodes:string[];
  phase60Status:Phase60Report['status']|null;
  syntheticDataset:boolean|null;
  originalQuoteEnvelopeRows:number;
  matchingOriginalPhase50QuoteRows:number;
  originalInstrumentCount:number;
  originalContractMasterDecisionSnapshots:number;
  originalContractMasterListedRows:number;
  originalCalendarSessions:number;
  originalOosDecisions:number;
  originalOosArmHorizonAttempts:number;
  originalDistinctDecisionTimeRegimes:number;
  originalOosEvidenceCoverageSufficient:boolean;
  operatorClaimedLicenseDocumentBytesPinned:boolean;
  independentVendorSignedRawTransportValidated:false;
  independentlyLicensedFnoHistoricalL1Verified:false;
  officialContractCatalogAndExpiryIssuerValidated:false;
  exchangeSessionCalendarIssuerValidated:false;
  independentlyTrustedSourceAvailableAtClock:false;
  fullyObservedUnbiasedMultiregimeOosPerformanceProven:false;
  qualifiedProfitabilityOrBestHorizonRankingProven:false;
  brokerNativeNrmlOvernightStopAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'OPERATOR_JSONL_CUSTODY_ENVELOPE_IS_NOT_NATIVE_SIGNED_EXCHANGE_OR_VENDOR_EXPORT',
  'ORIGINAL_BYTES_SHA256_IS_INTEGRITY_NOT_LICENSE_OR_ISSUER_SIGNATURE_PROOF',
  'OPERATOR_LICENSE_DOCUMENT_BYTES_ARE_NOT_INDEPENDENT_ENTITLEMENT_VERIFICATION',
  'ORIGINAL_MARKET_EVENT_AND_AVAILABLE_AT_CLOCKS_ARE_UNTRUSTED_ASSERTIONS',
  'MATCHING_ARCHIVE_CAN_BE_SELF_ASSEMBLED_FROM_NORMALIZED_BACKTEST_SOURCE',
  'FULL_UNTOUCHED_OOS_MULTIREGIME_REPLAY_STILL_REQUIRES_GENUINE_LICENSED_TAPE',
  'OPAQUE_CONTRACT_MASTER_CALENDAR_CUSTODY_DOES_NOT_AUTHENTICATE_OFFICIAL_SOURCES',
  'ALTERNATIVE_STRATEGY_ARMS_ARE_NOT_INDEPENDENT_TRADES',
  'NO_EVIDENCE_OF_BROKER_NATIVE_STOP_ACK_FILL_OR_QUEUED_OVERNIGHT_PROTECTION',
  'NO_NRML_ORDER_GTT_REPAIR_OR_FORCED_POSITIONAL_15_15_EXIT'
];
const blank=():Phase61Report=>({
  mode:'OWNER_PRIVATE_ORIGINAL_L1_ARCHIVE_BYTE_CUSTODY_RECONCILIATION',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase60Status:null,syntheticDataset:null,
  originalQuoteEnvelopeRows:0,matchingOriginalPhase50QuoteRows:0,
  originalInstrumentCount:0,
  originalContractMasterDecisionSnapshots:0,
  originalContractMasterListedRows:0,
  originalCalendarSessions:0,
  originalOosDecisions:0,originalOosArmHorizonAttempts:0,
  originalDistinctDecisionTimeRegimes:0,
  originalOosEvidenceCoverageSufficient:false,
  operatorClaimedLicenseDocumentBytesPinned:false,
  independentVendorSignedRawTransportValidated:false,
  independentlyLicensedFnoHistoricalL1Verified:false,
  officialContractCatalogAndExpiryIssuerValidated:false,
  exchangeSessionCalendarIssuerValidated:false,
  independentlyTrustedSourceAvailableAtClock:false,
  fullyObservedUnbiasedMultiregimeOosPerformanceProven:false,
  qualifiedProfitabilityOrBestHorizonRankingProven:false,
  brokerNativeNrmlOvernightStopAckVerified:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const fail=(reason:string,status:Phase61Report['status']='INVALID_EVIDENCE',
  part?:Partial<Phase61Report>):Phase61Report=>({
    ...blank(),...part,status,reasonCodes:[reason]
  });
const sameQuotes=(r:Phase61L1CustodyRow,
  expected:HistoricalExecutableQuote,i:number)=>(
  r.sourceSequence===i+1&&
  typeof r.sourceRecordId==='string'&&
  /^[A-Za-z0-9_.:-]{3,160}$/.test(r.sourceRecordId)&&
  r.instrumentKey===expected.instrumentKey&&
  r.observedAt===expected.observedAt&&
  r.availableAt===expected.availableAt&&
  r.bid===expected.bid&&r.ask===expected.ask&&
  r.bidQty===expected.bidQty&&r.askQty===expected.askQty
);
export function auditPhase61OriginalL1CustodyReadiness(
  input:Phase61Input,pins:Phase61IndependentPins
):Phase61Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE61_ORIGINAL_RAW_L1_CUSTODY_INTAKE_V1'||
    input.source!=='OWNER_PRIVATE_OPERATOR_CUSTODIED_ARCHIVES_UNVERIFIED'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE61_ORIGINAL_RAW_ARCHIVE_CUSTODY_PINS_V1'||
    !input.phase60||!input.phase60Pins||
    ![pins.expectedPhase60InputSha256,
      pins.expectedPhase60PinsSha256,
      pins.expectedOriginalL1QuoteEnvelopeBytesSha256,
      pins.expectedOriginalContractCatalogBytesSha256,
      pins.expectedOriginalExtendedCalendarBytesSha256,
      pins.expectedOriginalClaimedLicenseDocumentBytesSha256].every(
        x=>typeof x==='string'&&SHA.test(x))||
    pins.expectedPhase60InputSha256!==hash(input.phase60)||
    pins.expectedPhase60PinsSha256!==hash(input.phase60Pins)||
    !int(pins.expectedOriginalL1QuoteCount,1,300000)||
    !int(pins.expectedOriginalHistoricalDecisionCount,2,20000)||
    !int(pins.expectedOriginalListedOptionContractRows,1,2000000)||
    !int(pins.expectedOriginalExtendedCalendarSessions,2,20000)||
    !int(pins.maximumAllowedEventToAvailabilityLagSeconds,0,300))
    return fail('PHASE61_INDEPENDENT_SOURCE_ARCHIVE_POLICY_OR_PINS_INVALID');
  let quoteBytes:Buffer,catalogBytes:Buffer,
    calendarBytes:Buffer,licenseBytes:Buffer;
  try{
    const q=b64(input.originalL1QuoteEnvelopeBase64,25_000_000),
      c=b64(input.originalPointInTimeContractCatalogBase64,25_000_000),
      e=b64(input.originalExtendedSessionCalendarBase64,10_000_000),
      l=b64(input.operatorClaimedLicenseEntitlementEvidenceBase64,
        1_000_000);
    if(!q||!c||!e||!l)
      return fail('ORIGINAL_OWNER_PRIVATE_SOURCE_ARTIFACT_BYTES_MISSING');
    quoteBytes=q;catalogBytes=c;calendarBytes=e;licenseBytes=l;
    if(digest(q)!==pins.expectedOriginalL1QuoteEnvelopeBytesSha256||
      digest(c)!==pins.expectedOriginalContractCatalogBytesSha256||
      digest(e)!==pins.expectedOriginalExtendedCalendarBytesSha256||
      digest(l)!==pins.expectedOriginalClaimedLicenseDocumentBytesSha256)
      return fail('ORIGINAL_PRIVATE_RAW_SOURCE_BYTE_HASH_DISAGREEMENT');
  }catch{return fail('OWNER_PRIVATE_RAW_SOURCE_ARTIFACT_DECODE_EXCEPTION');}
  const historical=input.phase60.phase59.phase58.phase57.phase51.phase50
    .historical;
  let prior:Phase60Report;
  try{prior=auditPhase60HorizonRegimeSufficiency(
    input.phase60,input.phase60Pins);}
  catch{return fail('PHASE60_ORIGINAL_OOS_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const part:Partial<Phase61Report>={
    phase60Status:prior.status,syntheticDataset:prior.syntheticDataset,
    originalOosDecisions:prior.originalOosDecisionDays,
    originalOosArmHorizonAttempts:
      prior.fullOriginalDecisionArmHorizonAttempts,
    originalDistinctDecisionTimeRegimes:
      prior.originalDistinctDecisionTimeRegimes,
    originalOosEvidenceCoverageSufficient:
      prior.status==='DESCRIPTIVE_COVERAGE_REVIEW_ONLY'
  };
  if(!prior.status.startsWith('DESCRIPTIVE_')||
    prior.originalOosDecisionDays<2||
    prior.originalOosArmHorizonAttempts!==
      prior.originalOosDecisionDays*12||
    prior.originalUnpricedOrCensoredSelectedPaths!==0)
    return fail('PHASE60_ORIGINAL_OOS_COHORT_OR_COVERAGE_REAUDIT_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',part);
  if(!Array.isArray(historical.executionQuotes)||
    historical.executionQuotes.length!==pins.expectedOriginalL1QuoteCount||
    historical.decisions.length!==
      pins.expectedOriginalHistoricalDecisionCount||
    historical.decisions.reduce((n,d)=>
      n+d.listedContracts.length,0)!==
      pins.expectedOriginalListedOptionContractRows||
    input.phase60.phase59.phase58.exitSessions.length!==
      pins.expectedOriginalExtendedCalendarSessions)
    return fail('ORIGINAL_ALL_SOURCE_QUOTES_CONTRACTS_OR_SESSIONS_MISSING',
      'INCOMPLETE_EVIDENCE',part);
  let raw:unknown,catalog:unknown,calendar:unknown;
  try{
    const lines=new TextDecoder('utf-8',{fatal:true})
      .decode(quoteBytes).split('\n');
    if(lines.at(-1)!=='')
      return fail('ORIGINAL_L1_ENVELOPE_JSONL_NOT_TERMINATED',
        'INCOMPLETE_EVIDENCE',part);
    lines.pop();
    if(lines.length!==pins.expectedOriginalL1QuoteCount)
      return fail('ORIGINAL_CUSTODIED_QUOTE_ROW_COUNT_MISMATCH',
        'INCOMPLETE_EVIDENCE',part);
    raw=lines.map(s=>JSON.parse(s));
    catalog=parse(catalogBytes);
    calendar=parse(calendarBytes);
  }catch{return fail('ORIGINAL_L1_CATALOG_CALENDAR_ARCHIVE_PARSE_REJECTED',
    'INCOMPLETE_EVIDENCE',part);}
  if(!Array.isArray(raw)||!Array.isArray(catalog)||
    !Array.isArray(calendar))
    return fail('ORIGINAL_ARCHIVED_QUOTE_CONTRACT_CALENDAR_NOT_ARRAYS',
      'INCOMPLETE_EVIDENCE',part);
  if(JSON.stringify(catalog)!==JSON.stringify(
       phase61ContractMasterSnapshot(historical))||
    JSON.stringify(calendar)!==JSON.stringify(
       phase61SessionSnapshot(input.phase60)))
    return fail('ORIGINAL_CONTRACT_MASTER_OR_SESSION_ARCHIVE_DISAGREEMENT',
      'INCOMPLETE_EVIDENCE',part);
  const listedInOriginal=new Set(historical.decisions.flatMap(d=>
    d.listedContracts.map(c=>c.instrument_key)));
  const perInstrument=new Map<string,{event:number;arrival:number}>();
  const identifiers=new Set<string>();
  let matched=0;
  for(let i=0;i<raw.length;i++){
    const row=raw[i] as Phase61L1CustodyRow;
    const original=historical.executionQuotes[i];
    if(!row||typeof row!=='object'||Object.keys(row).length!==9||
      !sameQuotes(row,original,i))
      return fail('ARCHIVED_RAW_L1_ROW_DIFFERS_FROM_ORIGINAL_BACKTEST_SOURCE',
        'INCOMPLETE_EVIDENCE',{...part,
          originalQuoteEnvelopeRows:raw.length,
          matchingOriginalPhase50QuoteRows:matched});
    const event=time(row.observedAt),arrival=time(row.availableAt);
    if(!Number.isFinite(event)||!Number.isFinite(arrival)||
      arrival<event||
      arrival-event>pins.maximumAllowedEventToAvailabilityLagSeconds*1000||
      !finite(row.bid,0.01,1e9)||
      !finite(row.ask,0.01,1e9)||row.ask<=row.bid||
      !int(row.bidQty,1,1e9)||!int(row.askQty,1,1e9)||
      identifiers.has(row.sourceRecordId)||
      !listedInOriginal.has(row.instrumentKey))
      return fail('ORIGINAL_L1_CLOCK_SPREAD_QUANTITY_OR_INSTRUMENT_INVALID',
        'INCOMPLETE_EVIDENCE',{...part,
          originalQuoteEnvelopeRows:raw.length,
          matchingOriginalPhase50QuoteRows:matched});
    const earlier=perInstrument.get(row.instrumentKey);
    if(earlier&&(event<=earlier.event||arrival<earlier.arrival))
      return fail('ORIGINAL_L1_SOURCE_EVENT_OR_AVAILABILITY_REORDERED',
        'INCOMPLETE_EVIDENCE',{...part,
          originalQuoteEnvelopeRows:raw.length,
          matchingOriginalPhase50QuoteRows:matched});
    perInstrument.set(row.instrumentKey,{event,arrival});
    identifiers.add(row.sourceRecordId);
    matched++;
  }
  return {...blank(),...part,
    status:'DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY',
    originalQuoteEnvelopeRows:raw.length,
    matchingOriginalPhase50QuoteRows:matched,
    originalInstrumentCount:perInstrument.size,
    originalContractMasterDecisionSnapshots:catalog.length,
    originalContractMasterListedRows:
      pins.expectedOriginalListedOptionContractRows,
    originalCalendarSessions:calendar.length,
    operatorClaimedLicenseDocumentBytesPinned:true,
    reasonCodes:[
      'ORIGINAL_OWNER_SUPPLIED_L1_CATALOG_CALENDAR_BYTE_CONSISTENCY_ONLY',
      'INDEPENDENT_VENDOR_LICENSE_SOURCE_CLOCK_AND_ISSUER_TRUST_UNVERIFIED',
      ...(prior.status==='DESCRIPTIVE_COVERAGE_REVIEW_ONLY'?[]:
        ['ORIGINAL_MULTIREGIME_OOS_COVERAGE_OR_DOWNSIDE_STILL_UNRESOLVED'])
    ]};
}
