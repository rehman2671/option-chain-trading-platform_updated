/**
 * Adaptive Swing v2 Phase65 — OFFLINE candidate historical option Level-1
 * delivery intake; never acquire data, execute orders or upgrade source trust.
 *
 * Phase21 source-intake and Phase22 strict native CSV parsing already exist.
 * This reconciles a separately delivered *candidate* native-format file,
 * original decision-time contract-catalog bytes and original session calendar
 * against the complete frozen Phase64 full-listed OOS source — no winners-only
 * subsets, no backfilled original availableAt and no operator licence grants.
 *
 * It cannot distinguish a copied/fabricated candidate CSV from a genuine
 * vendor export or verify an issuer, licence, receipt clock or broker fill.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase64OriginalListedL1AcquisitionCoverage,
  type Phase64Input,type Phase64IndependentPins,type Phase64Report
} from './adaptivePhase64OriginalListedL1Coverage.js';
import {parseOriginalNativeL1Csv}
  from './adaptiveNativeL1CsvBridge.js';

const SHA=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const DEC=/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const COLUMNS=[
  'sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'
] as const;
const hash=(v:unknown):string=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
const sha=(v:Uint8Array):string=>createHash('sha256')
  .update(v).digest('hex');
export const hashPhase65Evidence=hash;
const integer=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const time=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
function decode(s:unknown,cap:number):Buffer|null{
  if(typeof s!=='string'||!s.length||
    s.length>(cap+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>16&&b.length<=cap&&
      b.toString('base64')===s?b:null;
  }catch{return null;}
}
export interface Phase65DeliveryDeclaration{
  schemaVersion:'ADAPTIVE_PHASE65_VENDOR_CANDIDATE_HANDOFF_DECLARATION_V1';
  claimedVendorDeliveryReferenceId:string;
  claimedVendorProductReferenceId:string;
  claimedLicenseEvidenceReferenceId:string;
  claimedContractMasterReferenceId:string;
  claimedSessionCalendarReferenceId:string;
  sourceCategory:
    'ORIGINAL_HISTORICAL_OPTION_BEST_BID_ASK_WITH_DISPLAYED_QUANTITY'|
    'HISTORICAL_TRADE_ONLY'|'EOD_BHAVCOPY'|
    'RECONSTRUCTED_TRADE_AS_L1_PROXY';
  originalStrategyReceiptClockClassification:
    'CLAIMED_ORIGINAL_CLIENT_CAPTURE_UNVERIFIED'|
    'LATER_HISTORICAL_DOWNLOAD_NOT_ORIGINAL_RECEIPT'|
    'HISTORICAL_REPLAY_ESTIMATE';
  claimedLicenseScope:
    'INDEX_OPTION_HISTORICAL_LEVEL1_RESEARCH'|'TRADE_ONLY'|'NO_RESEARCH_RIGHTS';
  declaredDatasetKind:'SYNTHETIC_FIXTURE'|'OWNER_SUPPLIED_UNVERIFIED_MARKET_HISTORY';
  archiveDeliveredAt:string;
  originalFirstMarketEventAt:string;
  originalLastMarketEventAt:string;
  declaredFullOriginalQuoteRows:number;
  declaredOriginalOosDecisionDays:number;
  declaredFullOriginalListedCePeContractPairs:number;
  /** Must always be false: delivery happens after source observation. */
  treatArchiveDeliveryTimeAsOriginalStrategyAvailableAt:false;
}
export interface Phase65Input{
  schemaVersion:'ADAPTIVE_PHASE65_OFFLINE_HISTORICAL_L1_DELIVERY_INTAKE_V1';
  source:'OWNER_PRIVATE_CANDIDATE_VENDOR_DELIVERY_UNVERIFIED';
  phase64:Phase64Input;
  phase64Pins:Phase64IndependentPins;
  candidateNativeOptionL1CsvBase64:string;
  candidatePointInTimeContractCatalogBase64:string;
  candidateExchangeSessionCalendarBase64:string;
  claimedEntitlementEvidenceBase64:string;
  delivery:Phase65DeliveryDeclaration;
}
export interface Phase65IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE65_VENDOR_CANDIDATE_DELIVERY_PINS_V1';
  expectedPhase64InputSha256:string;
  expectedPhase64PinsSha256:string;
  expectedDeliveryDeclarationSha256:string;
  expectedCandidateNativeCsvBytesSha256:string;
  expectedCandidateContractCatalogBytesSha256:string;
  expectedCandidateCalendarBytesSha256:string;
  expectedClaimedEntitlementBytesSha256:string;
  expectedAllOriginalNativeL1Rows:number;
  expectedAllOriginalListedOosCePePairs:number;
  expectedOriginalOosDecisions:number;
}
export interface Phase65Report{
  mode:'OFFLINE_FULL_ORIGINAL_OOS_VENDOR_CANDIDATE_DELIVERY_INTAKE';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY';
  reasonCodes:string[];
  phase64Status:Phase64Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisionDays:number;
  originalArmHorizonAttempts:number;
  allListedOriginalCePePairs:number;
  allListedOriginalCePePairsWithSourceCoverage:number;
  completeOriginalOptionQuoteRows:number;
  candidateNativeOptionQuoteRows:number;
  candidateRowsMatchingOriginalSource:number;
  originalListedCePeHorizonCoverageCells:number;
  candidateOriginalSessionCatalogBytesMatched:boolean;
  quotedOriginalClientAvailableAtSupportedByIndependentDelivery:false;
  archiveDownloadClockIsOriginalClientReceipt:false;
  independentVendorHistoricalDataIdentityAuthenticated:false;
  historicalNseBseL1ResearchLicenseIndependentlyVerified:false;
  officialPointInTimeFoContractMasterValidated:false;
  officialExchangeSessionsIndependentlyValidated:false;
  realUntouchedMultiregimeOosOptionReturnsProven:false;
  optionIvThetaSpreadSlippageReturnsVerified:false;
  actualBrokerExitStopFillGuaranteed:false;
  bestExpiryOrContractRecommendationAuthorized:false;
  brokerNrmlStopGttAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  externalEvidenceStillRequired:string[];
}
const NEED=[
  'EXTERNALLY_ATTEST_VENDOR_ARCHIVE_ISSUER_AND_COMPLETE_NATIVE_SOURCE_BYTES',
  'INDEPENDENTLY_REVIEW_HISTORICAL_OPTION_L1_RESEARCH_DATA_LICENSE_AND_SCOPE',
  'PROVE_SOURCE_SIDE_EVENT_CLOCK_AND_STRATEGY_SIDE_RECEIVE_AT_CLOCK_IN_REAL_TIME',
  'INDEPENDENT_OFFICIAL_CONTRACT_EXPIRY_LOT_AND_SESSION_CALENDAR_MASTER',
  'REAL_UNTOUCHED_MULTI_REGIME_OPTION_OOS_AND_ALL_NO_ENTRY_DATES',
  'REAL_IV_THETA_SPREAD_DEPTH_SLIPPAGE_OVERNIGHT_GAP_AND_FULL_DEBIT_LOSS',
  'BROKER_NRML_STOP_GTT_MODIFY_CANCEL_ACK_AND_OVERNIGHT_CHILD_ORDER_LIFECYCLE'
];
const blank=():Phase65Report=>({
  mode:'OFFLINE_FULL_ORIGINAL_OOS_VENDOR_CANDIDATE_DELIVERY_INTAKE',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase64Status:null,syntheticDataset:null,
  originalOosDecisionDays:0,originalArmHorizonAttempts:0,
  allListedOriginalCePePairs:0,allListedOriginalCePePairsWithSourceCoverage:0,
  completeOriginalOptionQuoteRows:0,candidateNativeOptionQuoteRows:0,
  candidateRowsMatchingOriginalSource:0,
  originalListedCePeHorizonCoverageCells:0,
  candidateOriginalSessionCatalogBytesMatched:false,
  quotedOriginalClientAvailableAtSupportedByIndependentDelivery:false,
  archiveDownloadClockIsOriginalClientReceipt:false,
  independentVendorHistoricalDataIdentityAuthenticated:false,
  historicalNseBseL1ResearchLicenseIndependentlyVerified:false,
  officialPointInTimeFoContractMasterValidated:false,
  officialExchangeSessionsIndependentlyValidated:false,
  realUntouchedMultiregimeOosOptionReturnsProven:false,
  optionIvThetaSpreadSlippageReturnsVerified:false,
  actualBrokerExitStopFillGuaranteed:false,
  bestExpiryOrContractRecommendationAuthorized:false,
  brokerNrmlStopGttAckVerified:false,
  executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
  externalEvidenceStillRequired:NEED
});
function fail(reason:string,
  status:Phase65Report['status']='INVALID_EVIDENCE',
  part?:Partial<Phase65Report>):Phase65Report{
  return {...blank(),...part,status,reasonCodes:[reason]};
}
function validDelivery(d:Phase65DeliveryDeclaration):boolean{
  return !!d&&d.schemaVersion===
    'ADAPTIVE_PHASE65_VENDOR_CANDIDATE_HANDOFF_DECLARATION_V1'&&
    Object.keys(d).length===17&&
    [d.claimedVendorDeliveryReferenceId,
      d.claimedVendorProductReferenceId,
      d.claimedLicenseEvidenceReferenceId,
      d.claimedContractMasterReferenceId,
      d.claimedSessionCalendarReferenceId].every(x=>
      typeof x==='string'&&ID.test(x))&&
    d.sourceCategory===
      'ORIGINAL_HISTORICAL_OPTION_BEST_BID_ASK_WITH_DISPLAYED_QUANTITY'&&
    (d.originalStrategyReceiptClockClassification===
      'CLAIMED_ORIGINAL_CLIENT_CAPTURE_UNVERIFIED'||
     d.originalStrategyReceiptClockClassification===
      'LATER_HISTORICAL_DOWNLOAD_NOT_ORIGINAL_RECEIPT')&&
    d.claimedLicenseScope==='INDEX_OPTION_HISTORICAL_LEVEL1_RESEARCH'&&
    (d.declaredDatasetKind==='SYNTHETIC_FIXTURE'||
      d.declaredDatasetKind==='OWNER_SUPPLIED_UNVERIFIED_MARKET_HISTORY')&&
    d.treatArchiveDeliveryTimeAsOriginalStrategyAvailableAt===false&&
    integer(d.declaredFullOriginalQuoteRows,1,300000)&&
    integer(d.declaredOriginalOosDecisionDays,2,100000)&&
    integer(d.declaredFullOriginalListedCePeContractPairs,1,2000000)&&
    [d.archiveDeliveredAt,d.originalFirstMarketEventAt,
      d.originalLastMarketEventAt].every(x=>Number.isFinite(time(x)))&&
    time(d.originalFirstMarketEventAt)<time(d.originalLastMarketEventAt)&&
    time(d.archiveDeliveredAt)>=time(d.originalLastMarketEventAt);
}
/**
 * No source bytes escape this result. A successful result only proves that a
 * separately SUPPLIED candidate native-format CSV and documents match the
 * same operator-provided original cohort; matching can be fabricated.
 */
export function auditPhase65CandidateVendorDelivery(
  input:Phase65Input,pins:Phase65IndependentPins
):Phase65Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE65_OFFLINE_HISTORICAL_L1_DELIVERY_INTAKE_V1'||
    input.source!=='OWNER_PRIVATE_CANDIDATE_VENDOR_DELIVERY_UNVERIFIED'||
    !input.phase64||!input.phase64Pins||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE65_VENDOR_CANDIDATE_DELIVERY_PINS_V1'||
    ![
      pins.expectedPhase64InputSha256,pins.expectedPhase64PinsSha256,
      pins.expectedDeliveryDeclarationSha256,
      pins.expectedCandidateNativeCsvBytesSha256,
      pins.expectedCandidateContractCatalogBytesSha256,
      pins.expectedCandidateCalendarBytesSha256,
      pins.expectedClaimedEntitlementBytesSha256
    ].every(x=>typeof x==='string'&&SHA.test(x))||
    pins.expectedPhase64InputSha256!==hash(input.phase64)||
    pins.expectedPhase64PinsSha256!==hash(input.phase64Pins)||
    !validDelivery(input.delivery)||
    pins.expectedDeliveryDeclarationSha256!==hash(input.delivery)||
    !integer(pins.expectedAllOriginalNativeL1Rows,1,300000)||
    !integer(pins.expectedAllOriginalListedOosCePePairs,1,2000000)||
    !integer(pins.expectedOriginalOosDecisions,2,100000))
    return fail('PHASE65_ORIGINAL_DATA_VENDOR_HANDOFF_OR_INDEPENDENT_PINS_INVALID');
  const candidate=decode(input.candidateNativeOptionL1CsvBase64,50_000_000),
    catalog=decode(input.candidatePointInTimeContractCatalogBase64,
      25_000_000),
    calendar=decode(input.candidateExchangeSessionCalendarBase64,10_000_000),
    license=decode(input.claimedEntitlementEvidenceBase64,1_000_000);
  if(!candidate||!catalog||!calendar||!license)
    return fail('PHASE65_CANDIDATE_DELIVERY_DOCUMENT_BYTES_MISSING');
  if(sha(candidate)!==pins.expectedCandidateNativeCsvBytesSha256||
    sha(catalog)!==pins.expectedCandidateContractCatalogBytesSha256||
    sha(calendar)!==pins.expectedCandidateCalendarBytesSha256||
    sha(license)!==pins.expectedClaimedEntitlementBytesSha256)
    return fail('PHASE65_DELIVERED_CSV_OR_DOCUMENT_BYTE_HASH_DISAGREES');
  const phase64=input.phase64;
  let prior:Phase64Report;
  try{prior=auditPhase64OriginalListedL1AcquisitionCoverage(
    phase64,input.phase64Pins);}
  catch{return fail('PHASE64_ORIGINAL_FULL_OPTION_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const partial:Partial<Phase65Report>={
    phase64Status:prior.status,syntheticDataset:prior.syntheticDataset,
    originalOosDecisionDays:prior.originalOosDecisions,
    originalArmHorizonAttempts:
      prior.originalEntryFirstArmHorizonAttempts,
    allListedOriginalCePePairs:prior.fullOriginalListedOosContractPairs,
    allListedOriginalCePePairsWithSourceCoverage:
      prior.sourceCoveredListedContractPairs,
    originalListedCePeHorizonCoverageCells:prior.rows.length
  };
  if(!prior.status.startsWith('DESCRIPTIVE_')||
    prior.sourceIncompleteListedContractPairs!==0||
    prior.scannedOriginalListedCePeContractPairs!==
      pins.expectedAllOriginalListedOosCePePairs||
    prior.originalOosDecisions!==pins.expectedOriginalOosDecisions||
    prior.originalEntryFirstArmHorizonAttempts!==
      prior.originalOosDecisions*12)
    return fail('PHASE64_ORIGINAL_ALL_LISTED_CE_PE_SOURCE_COVERAGE_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  const source=phase64.phase63.phase62;
  const orig=decode(source.originalNativeCsvBase64,50_000_000);
  const originalCatalog=decode(
    source.phase61.originalPointInTimeContractCatalogBase64,25_000_000);
  const originalCalendar=decode(
    source.phase61.originalExtendedSessionCalendarBase64,10_000_000);
  if(!orig||!originalCatalog||!originalCalendar)
    return fail('ORIGINAL_PHASE61_62_NATIVE_SOURCE_BYTES_MISSING',
      'INCOMPLETE_EVIDENCE',partial);
  if(!catalog.equals(originalCatalog)||!calendar.equals(originalCalendar))
    return fail('DELIVERED_CONTRACT_MASTER_OR_SESSION_DOES_NOT_MATCH_ORIGINAL_OOS',
      'INCOMPLETE_EVIDENCE',partial);
  const original=parseOriginalNativeL1Csv(orig),
    received=parseOriginalNativeL1Csv(candidate);
  if(!original||!received||
    received.length!==original.length||
    received.length!==pins.expectedAllOriginalNativeL1Rows+1||
    COLUMNS.some((x,i)=>received[0]?.[i]!==x)||
    received[0]?.length!==9)
    return fail('PHASE65_NATIVE_BID_ASK_DATA_HEADER_OR_FULL_DENOMINATOR_MISSING',
      'INCOMPLETE_EVIDENCE',partial);
  if(input.delivery.declaredFullOriginalQuoteRows!==
      pins.expectedAllOriginalNativeL1Rows||
    input.delivery.declaredFullOriginalQuoteRows!==
      source.signedManifest.originalQuoteCount||
    input.delivery.declaredOriginalOosDecisionDays!==
      prior.originalOosDecisions||
    input.delivery.declaredFullOriginalListedCePeContractPairs!==
      prior.fullOriginalListedOosContractPairs||
    input.delivery.originalFirstMarketEventAt!==
      source.signedManifest.firstOriginalEventAt||
    input.delivery.originalLastMarketEventAt!==
      source.signedManifest.lastOriginalEventAt||
    (prior.syntheticDataset===true&&
      input.delivery.declaredDatasetKind!=='SYNTHETIC_FIXTURE')||
    (prior.syntheticDataset===false&&
      input.delivery.declaredDatasetKind!=='OWNER_SUPPLIED_UNVERIFIED_MARKET_HISTORY'))
    return fail('PHASE65_VENDOR_DECLARED_SOURCE_ROWS_DATE_OR_SYNTHETIC_KIND_MISMATCH',
      'INCOMPLETE_EVIDENCE',partial);
  let matching=0;
  for(let i=1;i<original.length;i++){
    const a=original[i],b=received[i];
    if(!a||!b||a.length!==9||b.length!==9)
      return fail('PHASE65_VENDOR_CANDIDATE_L1_ROW_NOT_ORIGINAL',
        'INCOMPLETE_EVIDENCE',{...partial,
          completeOriginalOptionQuoteRows:original.length-1,
          candidateNativeOptionQuoteRows:received.length-1,
          candidateRowsMatchingOriginalSource:matching});
    for(let j=0;j<9;j++){
      const numeric=j===1||j>=5;
      const eq=numeric?
        DEC.test(a[j])&&DEC.test(b[j])&&Number(a[j])===Number(b[j]):
        a[j]===b[j];
      if(!eq)
        return fail('PHASE65_VENDOR_CANDIDATE_L1_ROW_NOT_ORIGINAL',
          'INCOMPLETE_EVIDENCE',{...partial,
            completeOriginalOptionQuoteRows:original.length-1,
            candidateNativeOptionQuoteRows:received.length-1,
            candidateRowsMatchingOriginalSource:matching});
    }
    if(i>0)matching++;
  }
  return {...blank(),...partial,
    status:'DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY',
    completeOriginalOptionQuoteRows:original.length-1,
    candidateNativeOptionQuoteRows:received.length-1,
    candidateRowsMatchingOriginalSource:matching,
    candidateOriginalSessionCatalogBytesMatched:true,
    reasonCodes:[
      'CANDIDATE_NATIVE_OPTION_L1_ROWS_MATCH_OWNER_ORIGINAL_TAPE_ONLY',
      'SUPPLIED_VENDOR_ID_AND_ENTITLEMENT_ARE_NOT_INDEPENDENTLY_AUTHENTICATED',
      'DOWNLOAD_OR_OPERATOR_CLAIMED_RECEIPT_CLOCK_IS_NOT_HISTORICAL_CLIENT_PROOF',
      ...(prior.syntheticDataset===true?[
        'SYNTHETIC_SOURCE_CANNOT_BE_RELABELED_LICENSED_REAL_MARKET_DATA'
      ]:[])
    ]};
}
