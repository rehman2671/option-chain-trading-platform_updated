import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase65CandidateVendorDelivery,type Phase65Report
} from '../../server/engine/ema15m/adaptivePhase65VendorDeliveryIntake.js';
import {makePhase65SyntheticVendorDeliveryFixture}
  from './phase65_synthetic_vendor_delivery_fixture.js';
const fixture=makePhase65SyntheticVendorDeliveryFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase65CandidateVendorDelivery(f.input,f.pins);
function hardFalse(r:Phase65Report){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.quotedOriginalClientAvailableAtSupportedByIndependentDelivery,
    false);
  assert.equal(r.archiveDownloadClockIsOriginalClientReceipt,false);
  assert.equal(r.independentVendorHistoricalDataIdentityAuthenticated,false);
  assert.equal(r.historicalNseBseL1ResearchLicenseIndependentlyVerified,false);
  assert.equal(r.officialPointInTimeFoContractMasterValidated,false);
  assert.equal(r.officialExchangeSessionsIndependentlyValidated,false);
  assert.equal(r.realUntouchedMultiregimeOosOptionReturnsProven,false);
  assert.equal(r.optionIvThetaSpreadSlippageReturnsVerified,false);
  assert.equal(r.actualBrokerExitStopFillGuaranteed,false);
  assert.equal(r.bestExpiryOrContractRecommendationAuthorized,false);
  assert.equal(r.brokerNrmlStopGttAckVerified,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('BEGIN PRIVATE KEY'));
}
function rejected(f:F,reason:string,
  status:Phase65Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);hardFalse(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase65 original full-listed option vendor candidate delivery intake',()=>{
  it('full source CSV + original catalog/calendar can match but fake operator delivery is NEVER vendor authenticity',()=>{
    const f=fixture(),r=audit(f);hardFalse(r);
    assert.equal(r.status,'DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY',
      JSON.stringify(r));
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisionDays,2);
    assert.equal(r.originalArmHorizonAttempts,24);
    assert.equal(r.allListedOriginalCePePairs,
      f.source.pins.expectedAllOosListedContractPairs);
    assert.equal(r.allListedOriginalCePePairsWithSourceCoverage,
      r.allListedOriginalCePePairs);
    assert.equal(r.completeOriginalOptionQuoteRows,
      f.pins.expectedAllOriginalNativeL1Rows);
    assert.equal(r.candidateNativeOptionQuoteRows,
      r.completeOriginalOptionQuoteRows);
    assert.equal(r.candidateRowsMatchingOriginalSource,
      r.completeOriginalOptionQuoteRows);
    assert.equal(r.candidateOriginalSessionCatalogBytesMatched,true);
    assert.ok(r.originalListedCePeHorizonCoverageCells>=8);
    assert.ok(r.reasonCodes.includes(
      'SYNTHETIC_SOURCE_CANNOT_BE_RELABELED_LICENSED_REAL_MARKET_DATA'));
  });
  it('copied local native CSV with all SHA pins is still merely owner-supplied, not a signed independently licensed vendor feed',()=>{
    const f=fixture();
    const r=audit(f);hardFalse(r);
    assert.equal(r.status,'DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY');
    assert.equal(r.independentVendorHistoricalDataIdentityAuthenticated,false);
    assert.equal(r.archiveDownloadClockIsOriginalClientReceipt,false);
  });
  it('historical trade-only archive is not original best BID/ASK even when CSV looks valid',()=>{
    const f=fixture();
    f.input.delivery.sourceCategory='HISTORICAL_TRADE_ONLY';
    f.repin();
    rejected(f,'PHASE65_ORIGINAL_DATA_VENDOR_HANDOFF_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a downloaded EOD bhavcopy cannot substitute historical option bid depth',()=>{
    const f=fixture();
    f.input.delivery.sourceCategory='EOD_BHAVCOPY';
    f.repin();
    rejected(f,'PHASE65_ORIGINAL_DATA_VENDOR_HANDOFF_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a replay-estimated availability clock is explicitly denied as original client capture',()=>{
    const f=fixture();
    f.input.delivery.originalStrategyReceiptClockClassification=
      'HISTORICAL_REPLAY_ESTIMATE';
    f.repin();
    rejected(f,'PHASE65_ORIGINAL_DATA_VENDOR_HANDOFF_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('historical file download cannot be relabeled original strategy availableAt',()=>{
    const f=fixture();
    (f.input.delivery as {treatArchiveDeliveryTimeAsOriginalStrategyAvailableAt:
      boolean}).treatArchiveDeliveryTimeAsOriginalStrategyAvailableAt=true;
    f.repin();
    rejected(f,'PHASE65_ORIGINAL_DATA_VENDOR_HANDOFF_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('self-reported original-client capture remains ONLY claimed without independent clock evidence',()=>{
    const f=fixture();
    f.input.delivery.originalStrategyReceiptClockClassification=
      'CLAIMED_ORIGINAL_CLIENT_CAPTURE_UNVERIFIED';
    f.repin();
    const r=audit(f);hardFalse(r);
    assert.equal(r.status,'DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY',
      JSON.stringify(r));
    assert.equal(r.quotedOriginalClientAvailableAtSupportedByIndependentDelivery,
      false);
  });
  it('synthetic source cannot masquerade as genuine vendor-history even after declared-document pin reset',()=>{
    const f=fixture();
    f.input.delivery.declaredDatasetKind=
      'OWNER_SUPPLIED_UNVERIFIED_MARKET_HISTORY';
    f.repin();
    rejected(f,'PHASE65_VENDOR_DECLARED_SOURCE_ROWS_DATE_OR_SYNTHETIC_KIND_MISMATCH');
  });
  it('dropping a source L1 row retains full original quote denominator',()=>{
    const f=fixture();
    f.editCsv(lines=>lines.slice(0,-1));
    f.repin();
    rejected(f,'PHASE65_NATIVE_BID_ASK_DATA_HEADER_OR_FULL_DENOMINATOR_MISSING');
  });
  it('post hoc vendor CSV BID change remains mismatch even after every candidate file SHA is repinned',()=>{
    const f=fixture();
    f.editCsv(lines=>{
      const a=lines[2].split(',');
      a[5]=(Number(a[5])+1).toString();
      lines[2]=a.join(',');
      return lines;
    });
    f.repin();
    const r=rejected(f,'PHASE65_VENDOR_CANDIDATE_L1_ROW_NOT_ORIGINAL');
    assert.ok(r.candidateRowsMatchingOriginalSource<
      f.pins.expectedAllOriginalNativeL1Rows);
  });
  it('later download/arrival timestamp cannot overwrite native original source availableAt',()=>{
    const f=fixture();
    f.editCsv(lines=>{
      const a=lines[5].split(',');
      a[4]=f.input.delivery.archiveDeliveredAt;
      lines[5]=a.join(',');
      return lines;
    });
    f.repin();
    rejected(f,'PHASE65_VENDOR_CANDIDATE_L1_ROW_NOT_ORIGINAL');
  });
  it('candidate original contract master cannot be replaced with changed expiry even if pin updated',()=>{
    const f=fixture();
    f.input.candidatePointInTimeContractCatalogBase64=
      f.b64([{sessionDate:'2026-01-01',listedContracts:[]}]);
    f.repin();
    rejected(f,'DELIVERED_CONTRACT_MASTER_OR_SESSION_DOES_NOT_MATCH_ORIGINAL_OOS');
  });
  it('original holding calendar cannot omit next session in a candidate delivery',()=>{
    const f=fixture();
    f.input.candidateExchangeSessionCalendarBase64=
      f.b64([{sessionDate:'2026-01-01',openAt:'2026-01-01T03:45:00.000Z'}]);
    f.repin();
    rejected(f,'DELIVERED_CONTRACT_MASTER_OR_SESSION_DOES_NOT_MATCH_ORIGINAL_OOS');
  });
  it('claimed licence evidence may change and be re-pinned, but cannot grant actual exchange rights',()=>{
    const f=fixture();
    f.input.claimedEntitlementEvidenceBase64=Buffer.from(
      'FAKE VENDOR LICENSE - OWNER CREATED, RIGHTS NOT VERIFIED','utf8')
      .toString('base64');
    f.repin();
    const r=audit(f);hardFalse(r);
    assert.equal(r.status,'DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY',
      JSON.stringify(r));
    assert.equal(r.historicalNseBseL1ResearchLicenseIndependentlyVerified,
      false);
  });
  it('original candidate delivery licence artifact byte changes without independent pin is invalid',()=>{
    const f=fixture();
    f.input.claimedEntitlementEvidenceBase64=Buffer.from(
      'ANOTHER FAKE LICENSE CANNOT VERIFY RIGHTS','utf8').toString('base64');
    rejected(f,'PHASE65_DELIVERED_CSV_OR_DOCUMENT_BYTE_HASH_DISAGREES',
      'INVALID_EVIDENCE');
  });
  it('retrospective candidate row-count declaration after independent pin must be rejected',()=>{
    const f=fixture();
    f.input.delivery.declaredFullOriginalQuoteRows-=1;
    f.repin();
    rejected(f,'PHASE65_VENDOR_DECLARED_SOURCE_ROWS_DATE_OR_SYNTHETIC_KIND_MISMATCH');
  });
  it('invalid original Phase64 all-listed source cannot be covered by a matching vendor sample',()=>{
    const f=fixture();
    f.source.pins.expectedAllOosListedContractManifestSha256='ca'.repeat(32);
    f.repin();
    rejected(f,'PHASE64_ORIGINAL_ALL_LISTED_CE_PE_SOURCE_COVERAGE_INCOMPLETE');
  });
  it('early archive delivered time before last original event is not a contemporaneous witness',()=>{
    const f=fixture();
    f.input.delivery.archiveDeliveredAt='2020-01-01T00:00:00.000Z';
    f.repin();
    rejected(f,'PHASE65_ORIGINAL_DATA_VENDOR_HANDOFF_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('simulated premium giveback and overnight GAP still cannot imply profitable duration or guaranteed stop',()=>{
    for(const variant of ['GIVEBACK','GAP'] as const){
      const f=fixture(variant),r=audit(f);hardFalse(r);
      assert.equal(r.status,'DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY',
        JSON.stringify(r));
      assert.equal(r.bestExpiryOrContractRecommendationAuthorized,false);
      assert.equal(r.brokerNrmlStopGttAckVerified,false);
    }
  });
});
