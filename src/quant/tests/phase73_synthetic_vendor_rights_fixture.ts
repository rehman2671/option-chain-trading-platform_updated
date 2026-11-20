/**
 * Fake historical option L1 vendor grant + retrospectively downloaded
 * source receipt. These are entirely OPERATOR-AUTHORED licence-looking
 * claims; matching source hashes do NOT grant research rights or prove
 * original client event-time receipt and option profits.
 */
import {createHash} from 'node:crypto';
import {makePhase72SyntheticKeyLifecycleFixture}
  from './phase72_synthetic_registrar_witness_fixture.js';
import {
  hashPhase73Evidence,type Phase73Input,type Phase73Pins,
  type Phase73ClaimedResearchLicence,type Phase73ClaimedSourceIntake
} from '../../server/engine/ema15m/adaptivePhase73HistoricalL1LicenceReadiness.js';

const sha=(b:Uint8Array):string=>createHash('sha256')
  .update(b).digest('hex');
const bytes=(v:unknown)=>Buffer.from(JSON.stringify(v),'utf8');
const base64=(v:unknown)=>bytes(v).toString('base64');

export function makePhase73SyntheticVendorRightsFixture(){
  const parent=makePhase72SyntheticKeyLifecycleFixture();
  const vendor=parent.previous.parent.issuer.vendor;
  const provider='MOCK_VENDOR_RIGHTS_PROVIDER_NOT_AUTHENTICATED';
  const licence:Phase73ClaimedResearchLicence={
    schemaVersion:'ADAPTIVE_PHASE73_UNAUTHENTICATED_VENDOR_RIGHTS_CLAIM_V1',
    source:'OWNER_CUSTODIED_VENDOR_LEGAL_CLAIM_NOT_VERIFIED',
    claimedVendorReference:provider,
    claimedGrantDocumentReference:'MOCK_HISTORICAL_RIGHTS_GRANT_UNVERIFIED',
    claimedGrantEffectiveAt:'2026-11-01T00:00:00.000Z',
    claimedGrantExpiresAt:'2027-12-31T23:59:59.000Z',
    claimedHistoricalCoverageFrom:'2026-01-01',
    claimedHistoricalCoverageThrough:'2026-08-01',
    claimedInstrumentClass:'INDEX_OPTION_CE_PE_L1',
    permittedFields:['BEST_BID','BEST_ASK','BID_QTY','ASK_QTY'],
    claimedPermittedUse:
      'OFFLINE_HISTORICAL_OPTION_RESEARCH_AGGREGATES_ONLY',
    claimedRawRecordLocalRetentionPermitted:true,
    claimedRedistributionPermitted:false,
    claimedLiveOrderSignalUsePermitted:false,
    claimedLegallyAuthenticated:false
  };
  const source:Phase73ClaimedSourceIntake={
    schemaVersion:'ADAPTIVE_PHASE73_UNVERIFIED_OPTION_SOURCE_ACQUISITION_V1',
    source:'OWNER_CUSTODIED_HISTORICAL_ARCHIVE_RECEIPT_NOT_CLIENT_TICK_CLOCK',
    claimedVendorReference:provider,
    claimedArchiveReference:'MOCK_RETROSPECTIVE_OPTION_SOURCE_RECEIPT',
    claimedArchivePublishedAt:'2026-11-17T00:00:00.000Z',
    claimedArchiveReceivedAt:'2026-11-19T00:00:00.000Z',
    claimedNativeL1CsvSha256:sha(Buffer.from(
      vendor.input.newVendorNativeL1CsvBase64,'base64')),
    claimedOriginalL1QuoteRows:vendor.raw.length-1,
    claimedOriginalOosDecisions:4,
    claimedAllListedCePePairs:32,
    claimedOriginalNoEntryDays:2,
    originalHistoricalClientReceiptClockIndependentlyAvailable:false,
    retrospectivelyDownloadedHistoryIsNotOriginalAvailableAt:true
  };
  const input:Phase73Input={
    schemaVersion:'ADAPTIVE_PHASE73_HISTORICAL_L1_LICENCE_AND_COVERAGE_READINESS_V1',
    source:'OFFLINE_OPERATOR_LICENSE_CLAIM_DOES_NOT_GRANT_RIGHTS',
    phase72:parent.input,phase72Pins:parent.pins,
    claimedResearchLicenceRawBase64:base64(licence),
    claimedSourceIntakeRawBase64:base64(source)
  };
  const pins:Phase73Pins={
    schemaVersion:'INDEPENDENT_PHASE73_OPERATOR_SOURCE_RIGHTS_EVIDENCE_PINS_V1',
    expectedPhase72InputSha256:'',
    expectedPhase72PinsSha256:'',
    expectedLicenceRawSha256:'',
    expectedAcquisitionRawSha256:'',
    expectedOriginalNativeL1CsvSha256:'',
    expectedVendorReference:provider,
    expectedLicenceDocumentReference:licence.claimedGrantDocumentReference,
    expectedAcquisitionReference:source.claimedArchiveReference,
    expectedOriginalOosDecisions:4,
    expectedOriginalNoEntryDays:2,
    expectedOriginallyListedCePePairs:32,
    expectedOriginalL1QuoteRows:vendor.raw.length-1
  };
  const updateLicence=()=>{
    input.claimedResearchLicenceRawBase64=base64(licence);
  };
  const updateSource=()=>{
    input.claimedSourceIntakeRawBase64=base64(source);
  };
  const repin=()=>{
    pins.expectedPhase72InputSha256=hashPhase73Evidence(input.phase72);
    pins.expectedPhase72PinsSha256=hashPhase73Evidence(input.phase72Pins);
    pins.expectedLicenceRawSha256=sha(Buffer.from(
      input.claimedResearchLicenceRawBase64,'base64'));
    pins.expectedAcquisitionRawSha256=sha(Buffer.from(
      input.claimedSourceIntakeRawBase64,'base64'));
    pins.expectedOriginalNativeL1CsvSha256=sha(Buffer.from(
      vendor.input.newVendorNativeL1CsvBase64,'base64'));
  };
  const inventEveryMissingHistoricalBid=()=>{
    // Deliberately fabricate 1W-8W daily bid marks plus calendars and
    // re-sign all upstream fake registrar and witness documents.
    const third=parent.previous.parent;
    third.previous.fillEveryPotentialWeekdayAndClosingBid();
    third.rebuild();third.updateArchive();third.repin();
    parent.previous.rebindOriginalAndResign();
    parent.receipt.phase71SignedManifestRawSha256=sha(Buffer.from(
      parent.previous.input.claimedSignedManifestRawBase64,'base64'));
    parent.receipt.originalCalendarArchiveRawSha256=sha(Buffer.from(
      parent.previous.input.phase70
        .separatelySuppliedClaimedExchangeDayArchiveBase64,'base64'));
    parent.resignAll();
    source.claimedNativeL1CsvSha256=sha(Buffer.from(
      vendor.input.newVendorNativeL1CsvBase64,'base64'));
    source.claimedOriginalL1QuoteRows=vendor.raw.length-1;
    pins.expectedOriginalL1QuoteRows=vendor.raw.length-1;
    updateSource();repin();
  };
  updateLicence();updateSource();repin();
  return {parent,vendor,licence,source,input,pins,repin,
    updateLicence,updateSource,inventEveryMissingHistoricalBid};
}
