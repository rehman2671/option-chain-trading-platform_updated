import {createHash} from 'node:crypto';
import {makePhase65OriginalListedCoverageFixture}
  from './phase65_synthetic_listed_source_fixture.js';
import {
  hashPhase65Evidence,
  type Phase65DeliveryDeclaration,type Phase65Input,
  type Phase65IndependentPins
} from '../../server/engine/ema15m/adaptivePhase65VendorDeliveryIntake.js';

const digest=(b:Uint8Array)=>createHash('sha256')
  .update(b).digest('hex');
const b64=(v:unknown)=>Buffer.from(JSON.stringify(v),'utf8')
  .toString('base64');
export function makePhase65SyntheticVendorDeliveryFixture(
  variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'
){
  const source=makePhase65OriginalListedCoverageFixture(variant);
  const phase62=source.parent.input.phase62;
  const m=phase62.signedManifest;
  const declaration:Phase65DeliveryDeclaration={
    schemaVersion:'ADAPTIVE_PHASE65_VENDOR_CANDIDATE_HANDOFF_DECLARATION_V1',
    claimedVendorDeliveryReferenceId:'SYNTHETIC_DELIVERY_2026',
    claimedVendorProductReferenceId:'SYNTHETIC_INDEX_OPTION_L1',
    claimedLicenseEvidenceReferenceId:'UNVERIFIED_FAKE_LICENSE_DOC',
    claimedContractMasterReferenceId:'SYNTHETIC_CONTRACT_CATALOG',
    claimedSessionCalendarReferenceId:'SYNTHETIC_EXCHANGE_CALENDAR',
    sourceCategory:
      'ORIGINAL_HISTORICAL_OPTION_BEST_BID_ASK_WITH_DISPLAYED_QUANTITY',
    originalStrategyReceiptClockClassification:
      'LATER_HISTORICAL_DOWNLOAD_NOT_ORIGINAL_RECEIPT',
    claimedLicenseScope:'INDEX_OPTION_HISTORICAL_LEVEL1_RESEARCH',
    declaredDatasetKind:'SYNTHETIC_FIXTURE',
    archiveDeliveredAt:
      new Date(Date.parse(m.lastOriginalEventAt)+86400000).toISOString(),
    originalFirstMarketEventAt:m.firstOriginalEventAt,
    originalLastMarketEventAt:m.lastOriginalEventAt,
    declaredFullOriginalQuoteRows:m.originalQuoteCount,
    declaredOriginalOosDecisionDays:source.pins.expectedOosDecisionCount,
    declaredFullOriginalListedCePeContractPairs:
      source.pins.expectedAllOosListedContractPairs,
    treatArchiveDeliveryTimeAsOriginalStrategyAvailableAt:false
  };
  const input:Phase65Input={
    schemaVersion:'ADAPTIVE_PHASE65_OFFLINE_HISTORICAL_L1_DELIVERY_INTAKE_V1',
    source:'OWNER_PRIVATE_CANDIDATE_VENDOR_DELIVERY_UNVERIFIED',
    phase64:source.input,phase64Pins:source.pins,
    candidateNativeOptionL1CsvBase64:phase62.originalNativeCsvBase64,
    candidatePointInTimeContractCatalogBase64:
      phase62.phase61.originalPointInTimeContractCatalogBase64,
    candidateExchangeSessionCalendarBase64:
      phase62.phase61.originalExtendedSessionCalendarBase64,
    claimedEntitlementEvidenceBase64:
      phase62.phase61.operatorClaimedLicenseEntitlementEvidenceBase64,
    delivery:declaration
  };
  const pins:Phase65IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE65_VENDOR_CANDIDATE_DELIVERY_PINS_V1',
    expectedPhase64InputSha256:'',
    expectedPhase64PinsSha256:'',
    expectedDeliveryDeclarationSha256:'',
    expectedCandidateNativeCsvBytesSha256:'',
    expectedCandidateContractCatalogBytesSha256:'',
    expectedCandidateCalendarBytesSha256:'',
    expectedClaimedEntitlementBytesSha256:'',
    expectedAllOriginalNativeL1Rows:m.originalQuoteCount,
    expectedAllOriginalListedOosCePePairs:
      source.pins.expectedAllOosListedContractPairs,
    expectedOriginalOosDecisions:source.pins.expectedOosDecisionCount
  };
  const repin=()=>{
    pins.expectedPhase64InputSha256=hashPhase65Evidence(input.phase64);
    pins.expectedPhase64PinsSha256=hashPhase65Evidence(input.phase64Pins);
    pins.expectedDeliveryDeclarationSha256=
      hashPhase65Evidence(input.delivery);
    pins.expectedCandidateNativeCsvBytesSha256=
      digest(Buffer.from(input.candidateNativeOptionL1CsvBase64,'base64'));
    pins.expectedCandidateContractCatalogBytesSha256=
      digest(Buffer.from(input.candidatePointInTimeContractCatalogBase64,
        'base64'));
    pins.expectedCandidateCalendarBytesSha256=
      digest(Buffer.from(input.candidateExchangeSessionCalendarBase64,
        'base64'));
    pins.expectedClaimedEntitlementBytesSha256=
      digest(Buffer.from(input.claimedEntitlementEvidenceBase64,'base64'));
  };
  const editCsv=(fn:(lines:string[])=>string[])=>{
    const text=Buffer.from(input.candidateNativeOptionL1CsvBase64,'base64')
      .toString('utf8');
    const lines=text.trimEnd().split('\n');
    input.candidateNativeOptionL1CsvBase64=
      Buffer.from(fn(lines).join('\n')+'\n','utf8').toString('base64');
  };
  repin();
  return {source,input,pins,repin,editCsv,b64};
}
