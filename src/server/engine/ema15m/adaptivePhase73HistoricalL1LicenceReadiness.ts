/**
 * Phase73 owner-private OFFLINE retrospective option L1 historical-use
 * licence CLAIM + source acquisition readiness.
 *
 * A matching licence-looking JSON document and acquisition receipt do
 * NOT establish an enforceable licence, issuer identity, authentic exchange
 * session, original client receiveAt, independently sourced prices or fills.
 * External legal counsel, publisher verification and licensed real source
 * procurement remain mandatory. No broker or exchange I/O.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase72CandidateIssuerKeyLifecycle,
  type Phase72Input,type Phase72Pins,type Phase72Report
} from './adaptivePhase72IssuerKeyLifecycle.js';
import {auditPhase69CalendarBlindSpots}
  from './adaptivePhase69CalendarBlindSpots.js';
import type {Phase66OriginalCatalog}
  from './adaptivePhase66StandaloneVendorPreflight.js';
import type {Phase70ClaimedExchangeArchive}
  from './adaptivePhase70SessionExceptionEvidence.js';
import {parseOriginalNativeL1Csv}
  from './adaptiveNativeL1CsvBridge.js';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export const hashPhase73Evidence=(v:unknown):string=>
  sha(Buffer.from(JSON.stringify(v),'utf8'));
const time=(v:unknown)=>typeof v==='string'&&ISO.test(v)?
  Date.parse(v):NaN;
const day=(v:unknown)=>typeof v==='string'&&DATE.test(v)?
  Date.parse(v+'T00:00:00Z'):NaN;
const int=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
function decode(v:unknown,max:number):Buffer|null{
  if(typeof v!=='string'||!v.length||v.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    return null;
  try{
    const b=Buffer.from(v,'base64');
    return b.length>0&&b.length<=max&&b.toString('base64')===v?b:null;
  }catch{return null;}
}
function parse<T>(b:Buffer):T|null{
  try{
    const v=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
    return v&&typeof v==='object'&&!Array.isArray(v)?v as T:null;
  }catch{return null;}
}
type Horizon='1W'|'2W'|'4W'|'8W';
const HORIZONS=['1W','2W','4W','8W'] as const;
const REQUIRED_FIELDS=['BEST_BID','BEST_ASK','BID_QTY','ASK_QTY'] as const;
export interface Phase73ClaimedResearchLicence{
  schemaVersion:'ADAPTIVE_PHASE73_UNAUTHENTICATED_VENDOR_RIGHTS_CLAIM_V1';
  source:'OWNER_CUSTODIED_VENDOR_LEGAL_CLAIM_NOT_VERIFIED';
  claimedVendorReference:string;
  claimedGrantDocumentReference:string;
  claimedGrantEffectiveAt:string;
  claimedGrantExpiresAt:string;
  claimedHistoricalCoverageFrom:string;
  claimedHistoricalCoverageThrough:string;
  claimedInstrumentClass:'INDEX_OPTION_CE_PE_L1';
  permittedFields:Array<typeof REQUIRED_FIELDS[number]>;
  claimedPermittedUse:
    'OFFLINE_HISTORICAL_OPTION_RESEARCH_AGGREGATES_ONLY';
  claimedRawRecordLocalRetentionPermitted:true;
  claimedRedistributionPermitted:false;
  claimedLiveOrderSignalUsePermitted:false;
  claimedLegallyAuthenticated:false;
}
export interface Phase73ClaimedSourceIntake{
  schemaVersion:'ADAPTIVE_PHASE73_UNVERIFIED_OPTION_SOURCE_ACQUISITION_V1';
  source:'OWNER_CUSTODIED_HISTORICAL_ARCHIVE_RECEIPT_NOT_CLIENT_TICK_CLOCK';
  claimedVendorReference:string;
  claimedArchiveReference:string;
  claimedArchivePublishedAt:string;
  claimedArchiveReceivedAt:string;
  claimedNativeL1CsvSha256:string;
  claimedOriginalL1QuoteRows:number;
  claimedOriginalOosDecisions:number;
  claimedAllListedCePePairs:number;
  claimedOriginalNoEntryDays:number;
  originalHistoricalClientReceiptClockIndependentlyAvailable:false;
  retrospectivelyDownloadedHistoryIsNotOriginalAvailableAt:true;
}
export interface Phase73Input{
  schemaVersion:'ADAPTIVE_PHASE73_HISTORICAL_L1_LICENCE_AND_COVERAGE_READINESS_V1';
  source:'OFFLINE_OPERATOR_LICENSE_CLAIM_DOES_NOT_GRANT_RIGHTS';
  phase72:Phase72Input;
  phase72Pins:Phase72Pins;
  claimedResearchLicenceRawBase64:string;
  claimedSourceIntakeRawBase64:string;
}
export interface Phase73Pins{
  schemaVersion:'INDEPENDENT_PHASE73_OPERATOR_SOURCE_RIGHTS_EVIDENCE_PINS_V1';
  expectedPhase72InputSha256:string;
  expectedPhase72PinsSha256:string;
  expectedLicenceRawSha256:string;
  expectedAcquisitionRawSha256:string;
  expectedOriginalNativeL1CsvSha256:string;
  expectedVendorReference:string;
  expectedLicenceDocumentReference:string;
  expectedAcquisitionReference:string;
  expectedOriginalOosDecisions:number;
  expectedOriginalNoEntryDays:number;
  expectedOriginallyListedCePePairs:number;
  expectedOriginalL1QuoteRows:number;
}
export interface Phase73HorizonGap{
  horizon:Horizon;
  originalAllListedCePePairs:number;
  originalNoEntryPairs:number;
  originalEntryClaimedPairs:number;
  candidatePairsWithPotentialWeekdayCalendarHoles:number;
  candidatePairsMissingOriginalDeclaredCloseBid:number;
  candidatePairsWithDetectedDataQualityGaps:number;
  originalFullDurationSourceAndCalendarIndependentlyVerified:false;
  claimedHistoricalRightsAreNotLegalEntitlement:true;
  canRankBestOptionOrHoldDuration:false;
  nativeNrmlPositionOrStopMayBePlaced:false;
}
export interface Phase73Report{
  mode:'OFFLINE_HISTORICAL_OPTION_RIGHTS_AND_COMPLETE_OOS_COVERAGE_PREFLIGHT';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_CLAIMED_RIGHTS_SCOPE_MATCHES_BUT_DURATION_DATA_CENSORED'|
    'DESCRIPTIVE_SELF_CLAIMED_RIGHTS_AND_FULL_DURATION_SOURCE_UNVERIFIED';
  reasonCodes:string[];
  phase72Status:Phase72Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisions:number;
  originalNoEntryDays:number;
  originalAllListedCePePairs:number;
  originalL1QuoteRows:number;
  originalAllListedOptionsWithCalendarOrBidGaps:number;
  licenceClaimScopeMechanicallyCoversFullOriginalExpiries:boolean;
  claimedLicenceEffectiveOnArchiveDownload:boolean;
  observedSourceDigestAndOwnerAcquisitionClaimAgree:boolean;
  reportedOriginalHistoricalClientReceiptTrustworthy:false;
  genuineVendorLicenceGrantIndependentlyAuthenticated:false;
  actualDistributionResearchAndRetentionRightsLegallyVerified:false;
  officialExchangeIssuerAndCalendarAuthenticated:false;
  realSourceArchiveOriginalMarketPricesVerified:false;
  realOriginal1W2W4W8WHoldReturnsProven:false;
  retrospectiveArchiveCannotRestorePastStrategyAvailableAt:true;
  optionsPremiumPointTargetsDifferFromIndexPoints:true;
  executableBidAskAndStopFillConfirmed:false;
  independentRealRegimeOosProfitabilityEstablished:false;
  fullPaidLongOptionPremiumDebitLossProtected:false;
  nrmlGttBrokerChildExchangeAckVerified:false;
  bestExpiryHorizonRecommendationAuthorized:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  horizons:Phase73HorizonGap[];
  externalReviewBlockers:string[];
}
const BLOCKERS=[
  'GENUINE_VENDOR_SIGNED_LICENCE_AND_LEGAL_RESEARCH_RIGHTS_VERIFIED_OUT_OF_BAND',
  'OFFICIAL_AUTHENTICATED_EXCHANGE_FO_CONTRACT_EXPIRY_HOLIDAY_AND_SESSION_MASTER',
  'LICENSED_NATIVE_OPTION_L1_BID_ASK_DEPTH_THROUGH_EACH_REAL_1W_2W_4W_8W_SESSION',
  'REAL_CONTEMPORANEOUS_CLIENT_SOURCE_AVAILABLE_AT_IF_IT_WAS_CAPTURED',
  'TRUE_UNTOUCHED_MULTIREGIME_OOS_WITH_IV_THETA_SPREAD_PREMIUM_GIVEBACK_GAPS_AND_FULL_DEBIT_LOSS',
  'BROKER_NATIVE_NRML_STOP_GTT_CHILD_EXCHANGE_ACK_NONFILL_AND_OVERNIGHT_PERSISTENCE'
];
function blank():Phase73Report{
  return {
    mode:'OFFLINE_HISTORICAL_OPTION_RIGHTS_AND_COMPLETE_OOS_COVERAGE_PREFLIGHT',
    status:'INVALID_EVIDENCE',reasonCodes:[],
    phase72Status:null,syntheticDataset:null,
    originalOosDecisions:0,originalNoEntryDays:0,
    originalAllListedCePePairs:0,originalL1QuoteRows:0,
    originalAllListedOptionsWithCalendarOrBidGaps:0,
    licenceClaimScopeMechanicallyCoversFullOriginalExpiries:false,
    claimedLicenceEffectiveOnArchiveDownload:false,
    observedSourceDigestAndOwnerAcquisitionClaimAgree:false,
    reportedOriginalHistoricalClientReceiptTrustworthy:false,
    genuineVendorLicenceGrantIndependentlyAuthenticated:false,
    actualDistributionResearchAndRetentionRightsLegallyVerified:false,
    officialExchangeIssuerAndCalendarAuthenticated:false,
    realSourceArchiveOriginalMarketPricesVerified:false,
    realOriginal1W2W4W8WHoldReturnsProven:false,
    retrospectiveArchiveCannotRestorePastStrategyAvailableAt:true,
    optionsPremiumPointTargetsDifferFromIndexPoints:true,
    executableBidAskAndStopFillConfirmed:false,
    independentRealRegimeOosProfitabilityEstablished:false,
    fullPaidLongOptionPremiumDebitLossProtected:false,
    nrmlGttBrokerChildExchangeAckVerified:false,
    bestExpiryHorizonRecommendationAuthorized:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    horizons:[],externalReviewBlockers:BLOCKERS
  };
}
const fail=(reason:string,status:Phase73Report['status']='INCOMPLETE_EVIDENCE',
  extra?:Partial<Phase73Report>):Phase73Report=>({
  ...blank(),...extra,status,reasonCodes:[reason]
});
export function auditPhase73HistoricalSourceReadiness(
  input:Phase73Input,pins:Phase73Pins
):Phase73Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE73_HISTORICAL_L1_LICENCE_AND_COVERAGE_READINESS_V1'||
    input.source!=='OFFLINE_OPERATOR_LICENSE_CLAIM_DOES_NOT_GRANT_RIGHTS'||
    !input.phase72||!input.phase72Pins||!pins||
    pins.schemaVersion!==
      'INDEPENDENT_PHASE73_OPERATOR_SOURCE_RIGHTS_EVIDENCE_PINS_V1'||
    ![pins.expectedPhase72InputSha256,pins.expectedPhase72PinsSha256,
      pins.expectedLicenceRawSha256,pins.expectedAcquisitionRawSha256,
      pins.expectedOriginalNativeL1CsvSha256].every(x=>
      typeof x==='string'&&SHA.test(x))||
    ![pins.expectedVendorReference,pins.expectedLicenceDocumentReference,
      pins.expectedAcquisitionReference].every(x=>
      typeof x==='string'&&ID.test(x))||
    !int(pins.expectedOriginalOosDecisions,2,50000)||
    !int(pins.expectedOriginalNoEntryDays,0,50000)||
    !int(pins.expectedOriginallyListedCePePairs,8,1000000)||
    !int(pins.expectedOriginalL1QuoteRows,1,10000000)||
    pins.expectedOriginalNoEntryDays>pins.expectedOriginalOosDecisions||
    hashPhase73Evidence(input.phase72)!==
      pins.expectedPhase72InputSha256||
    hashPhase73Evidence(input.phase72Pins)!==
      pins.expectedPhase72PinsSha256)
    return fail('PHASE73_PARENT_OR_SOURCE_RIGHTS_PINS_INVALID',
      'INVALID_EVIDENCE');
  const licenceBytes=decode(input.claimedResearchLicenceRawBase64,1000000),
    acquisitionBytes=decode(input.claimedSourceIntakeRawBase64,1000000),
    original=input.phase72.phase71.phase70.phase69.phase68.phase67
      .originalVendor;
  const csvBytes=decode(original.newVendorNativeL1CsvBase64,50_000_000),
    catBytes=decode(original.newVendorFullListedCatalogBase64,25_000_000),
    daysBytes=decode(input.phase72.phase71.phase70
      .separatelySuppliedClaimedExchangeDayArchiveBase64,5_000_000);
  if(!licenceBytes||!acquisitionBytes||!csvBytes||!catBytes||!daysBytes)
    return fail('PHASE73_PRIVATE_GRANT_ACQUISITION_SOURCE_BYTES_MISSING',
      'INVALID_EVIDENCE');
  if(sha(licenceBytes)!==pins.expectedLicenceRawSha256||
    sha(acquisitionBytes)!==pins.expectedAcquisitionRawSha256||
    sha(csvBytes)!==pins.expectedOriginalNativeL1CsvSha256)
    return fail('PHASE73_ORIGINAL_LICENCE_INTAKE_OR_L1_BYTES_NOT_PINNED',
      'INVALID_EVIDENCE');
  const licence=parse<Phase73ClaimedResearchLicence>(licenceBytes),
    acquired=parse<Phase73ClaimedSourceIntake>(acquisitionBytes),
    catalog=parse<Phase66OriginalCatalog>(catBytes),
    calendar=parse<Phase70ClaimedExchangeArchive>(daysBytes),
    quotes=parseOriginalNativeL1Csv(csvBytes);
  if(!licence||!acquired||!catalog||!calendar||!quotes||
    !Array.isArray(catalog.decisions)||!Array.isArray(calendar.days))
    return fail('PHASE73_CLAIMED_LICENSE_ORIGINAL_SOURCE_UNREADABLE',
      'INCOMPLETE_EVIDENCE');
  if(licence.schemaVersion!==
      'ADAPTIVE_PHASE73_UNAUTHENTICATED_VENDOR_RIGHTS_CLAIM_V1'||
    licence.source!==
      'OWNER_CUSTODIED_VENDOR_LEGAL_CLAIM_NOT_VERIFIED'||
    acquired.schemaVersion!==
      'ADAPTIVE_PHASE73_UNVERIFIED_OPTION_SOURCE_ACQUISITION_V1'||
    acquired.source!==
      'OWNER_CUSTODIED_HISTORICAL_ARCHIVE_RECEIPT_NOT_CLIENT_TICK_CLOCK'||
    licence.claimedVendorReference!==pins.expectedVendorReference||
    licence.claimedGrantDocumentReference!==
      pins.expectedLicenceDocumentReference||
    acquired.claimedVendorReference!==pins.expectedVendorReference||
    acquired.claimedArchiveReference!==pins.expectedAcquisitionReference||
    licence.claimedInstrumentClass!=='INDEX_OPTION_CE_PE_L1'||
    !Array.isArray(licence.permittedFields)||
    licence.permittedFields.length!==REQUIRED_FIELDS.length||
    new Set(licence.permittedFields).size!==REQUIRED_FIELDS.length||
    !REQUIRED_FIELDS.every(f=>licence.permittedFields.includes(f))||
    licence.claimedPermittedUse!==
      'OFFLINE_HISTORICAL_OPTION_RESEARCH_AGGREGATES_ONLY'||
    licence.claimedRawRecordLocalRetentionPermitted!==true||
    licence.claimedRedistributionPermitted!==false||
    licence.claimedLiveOrderSignalUsePermitted!==false||
    licence.claimedLegallyAuthenticated!==false||
    acquired.originalHistoricalClientReceiptClockIndependentlyAvailable!==
      false||
    acquired.retrospectivelyDownloadedHistoryIsNotOriginalAvailableAt!==true)
    return fail('PHASE73_VENDER_RIGHTS_OR_ORIGINAL_RECEIPT_CLAIM_NOT_ADMISSIBLE');
  const start=time(licence.claimedGrantEffectiveAt),
    expiry=time(licence.claimedGrantExpiresAt),
    published=time(acquired.claimedArchivePublishedAt),
    obtained=time(acquired.claimedArchiveReceivedAt),
    historicalFrom=day(licence.claimedHistoricalCoverageFrom),
    historicalThrough=day(licence.claimedHistoricalCoverageThrough),
    originalFrom=day(calendar.coveredFrom),
    originalThrough=day(calendar.coveredThrough);
  if(![start,expiry,published,obtained,historicalFrom,
    historicalThrough,originalFrom,originalThrough].every(Number.isFinite)||
    start>expiry||published>obtained||obtained<start||obtained>expiry||
    historicalFrom>historicalThrough)
    return fail('PHASE73_RETROSPECTIVE_VENDOR_GRANT_OR_DELIVERY_CLOCK_INVALID');
  if(historicalFrom>originalFrom||historicalThrough<originalThrough||
    obtained<originalThrough)
    return fail('PHASE73_CLAIMED_LICENSE_DOES_NOT_COVER_FULL_ORIGINAL_EXPIRIES');
  const matchedScope:Partial<Phase73Report>={
    licenceClaimScopeMechanicallyCoversFullOriginalExpiries:true,
    claimedLicenceEffectiveOnArchiveDownload:true
  };
  if(acquired.claimedNativeL1CsvSha256!==sha(csvBytes)||
    acquired.claimedOriginalL1QuoteRows!==quotes.length-1||
    acquired.claimedOriginalOosDecisions!==catalog.decisions.length||
    acquired.claimedAllListedCePePairs!==catalog.decisions.reduce(
      (sum,d)=>sum+d.originallyListedContracts.length,0)||
    acquired.claimedOriginalNoEntryDays!==catalog.decisions.filter(d=>
      d.originalEntryDisposition==='NO_ENTRY').length)
    return fail('PHASE73_VENDOR_ACQUISITION_IS_NOT_SAME_ORIGINAL_L1_OR_OOS',
      'INCOMPLETE_EVIDENCE',matchedScope);
  let phase72:Phase72Report;
  try{phase72=auditPhase72CandidateIssuerKeyLifecycle(
    input.phase72,input.phase72Pins);}
  catch{return fail('PHASE72_THREE_ROLE_CRYPTO_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE',matchedScope);}
  const p:Partial<Phase73Report>={
    ...matchedScope,observedSourceDigestAndOwnerAcquisitionClaimAgree:true,
    phase72Status:phase72.status,syntheticDataset:phase72.syntheticDataset,
    originalOosDecisions:phase72.originalOosDecisions,
    originalNoEntryDays:phase72.originalNoEntryDays,
    originalAllListedCePePairs:phase72.originalListedCePePairs,
    originalL1QuoteRows:quotes.length-1
  };
  if(!phase72.status.startsWith('DESCRIPTIVE_')||
    phase72.originalOosDecisions!==pins.expectedOriginalOosDecisions||
    phase72.originalNoEntryDays!==pins.expectedOriginalNoEntryDays||
    phase72.originalListedCePePairs!==
      pins.expectedOriginallyListedCePePairs||
    quotes.length-1!==pins.expectedOriginalL1QuoteRows)
    return fail('PHASE73_FROZEN_THREE_ROLE_OOS_OR_QUOTE_DENOMINATOR_CHANGED',
      'INCOMPLETE_EVIDENCE',p);
  let phase69;
  try{phase69=auditPhase69CalendarBlindSpots(
    input.phase72.phase71.phase70.phase69,
    input.phase72.phase71.phase70.phase69Pins);}
  catch{return fail('PHASE69_HORIZON_SOURCE_GAP_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE',p);}
  if(!phase69.status.startsWith('DESCRIPTIVE_')||
    phase69.originalOosListedCePeContractPairs!==
      phase72.originalListedCePePairs)
    return fail('PHASE73_ORIGINAL_HOLDING_COVERAGE_MATRIX_NOT_READY',
      'INCOMPLETE_EVIDENCE',p);
  const horizons:Phase73HorizonGap[]=HORIZONS.map(h=>{
    const rows=phase69.cells.filter(x=>x.horizon===h);
    return {
      horizon:h,
      originalAllListedCePePairs:rows.reduce((a,x)=>
        a+x.originalListedPairs,0),
      originalNoEntryPairs:rows.reduce((a,x)=>
        a+x.originalNoEntryPairs,0),
      originalEntryClaimedPairs:rows.reduce((a,x)=>
        a+x.originalEntryClaimedPairs,0),
      candidatePairsWithPotentialWeekdayCalendarHoles:
        rows.reduce((a,x)=>a+x.originalsWithPotentialCalendarBlindSpots,0),
      candidatePairsMissingOriginalDeclaredCloseBid:
        rows.reduce((a,x)=>a+x.originalsWithAnyMissingOriginalCloseBid,0),
      candidatePairsWithDetectedDataQualityGaps:
        rows.reduce((a,x)=>a+x.originalsWithDetectedCalendarOrBidGaps,0),
      originalFullDurationSourceAndCalendarIndependentlyVerified:false,
      claimedHistoricalRightsAreNotLegalEntitlement:true,
      canRankBestOptionOrHoldDuration:false,
      nativeNrmlPositionOrStopMayBePlaced:false
    };
  });
  if(horizons.some(h=>h.originalAllListedCePePairs<1)||
    horizons.reduce((a,x)=>a+x.originalAllListedCePePairs,0)!==
      phase72.originalListedCePePairs||
    horizons.reduce((a,x)=>a+x.originalNoEntryPairs,0)!==
      phase72.originalListedCePePairs*
      phase72.originalNoEntryDays/phase72.originalOosDecisions)
    return fail('PHASE73_ALL_FOUR_ORIGINAL_HORIZON_NO_ENTRY_ROWS_MISSING',
      'INCOMPLETE_EVIDENCE',{...p,horizons});
  const gaps=horizons.reduce((n,h)=>
    n+h.candidatePairsWithDetectedDataQualityGaps,0);
  return {...blank(),...p,horizons,
    originalAllListedOptionsWithCalendarOrBidGaps:gaps,
    status:gaps>0?
      'DESCRIPTIVE_CLAIMED_RIGHTS_SCOPE_MATCHES_BUT_DURATION_DATA_CENSORED':
      'DESCRIPTIVE_SELF_CLAIMED_RIGHTS_AND_FULL_DURATION_SOURCE_UNVERIFIED',
    reasonCodes:[
      'CLAIMED_VENDOR_HISTORICAL_OPTION_RIGHTS_MATCH_BUT_NO_REAL_LEGAL_GRANT_VERIFIED',
      gaps>0?'ORIGINAL_1W_2W_4W_8W_LISTED_OPTION_SOURCE_GAPS_REMAIN':
        'OWNER_GENERATED_FULL_DURATION_SOURCE_CAN_STILL_BE_FABRICATED',
      'RETROSPECTIVE_DOWNLOAD_NEVER_ESTABLISHES_ORIGINAL_CLIENT_AVAILABLE_AT',
      'NO_LICENSE_ISSUER_MARKET_PROFIT_STOP_OR_EXECUTION_APPROVAL'
    ]};
}
