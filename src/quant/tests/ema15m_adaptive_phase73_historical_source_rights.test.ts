import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase73HistoricalSourceReadiness,type Phase73Report
} from '../../server/engine/ema15m/adaptivePhase73HistoricalL1LicenceReadiness.js';
import {makePhase73SyntheticVendorRightsFixture}
  from './phase73_synthetic_vendor_rights_fixture.js';

const fixture=makePhase73SyntheticVendorRightsFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase73HistoricalSourceReadiness(f.input,f.pins);
function neverAuthorizes(r:Phase73Report){
  assert.equal(r.reportedOriginalHistoricalClientReceiptTrustworthy,false);
  assert.equal(r.genuineVendorLicenceGrantIndependentlyAuthenticated,false);
  assert.equal(r.actualDistributionResearchAndRetentionRightsLegallyVerified,false);
  assert.equal(r.officialExchangeIssuerAndCalendarAuthenticated,false);
  assert.equal(r.realSourceArchiveOriginalMarketPricesVerified,false);
  assert.equal(r.realOriginal1W2W4W8WHoldReturnsProven,false);
  assert.equal(r.retrospectiveArchiveCannotRestorePastStrategyAvailableAt,true);
  assert.equal(r.optionsPremiumPointTargetsDifferFromIndexPoints,true);
  assert.equal(r.executableBidAskAndStopFillConfirmed,false);
  assert.equal(r.independentRealRegimeOosProfitabilityEstablished,false);
  assert.equal(r.fullPaidLongOptionPremiumDebitLossProtected,false);
  assert.equal(r.nrmlGttBrokerChildExchangeAckVerified,false);
  assert.equal(r.bestExpiryHorizonRecommendationAuthorized,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD'));
  for(const h of r.horizons){
    assert.equal(h.originalFullDurationSourceAndCalendarIndependentlyVerified,
      false);
    assert.equal(h.claimedHistoricalRightsAreNotLegalEntitlement,true);
    assert.equal(h.canRankBestOptionOrHoldDuration,false);
    assert.equal(h.nativeNrmlPositionOrStopMayBePlaced,false);
  }
}
function rejects(f:F,reason:string,
  status:Phase73Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);neverAuthorizes(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase73 original 1W–8W option data grant/source acquisition rights readiness (operator claims only)',()=>{
  it('mechanically reconciles a fake historical licence and retroactive archive but correctly CENSORS original expiry paths',()=>{
    const f=fixture(),r=audit(f);neverAuthorizes(r);
    assert.equal(r.status,
      'DESCRIPTIVE_CLAIMED_RIGHTS_SCOPE_MATCHES_BUT_DURATION_DATA_CENSORED',
      JSON.stringify(r));
    assert.equal(r.phase72Status,
      'DESCRIPTIVE_THREE_ROLE_CRYPTO_CONSISTENCY_UNTRUSTED_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisions,4);
    assert.equal(r.originalNoEntryDays,2);
    assert.equal(r.originalAllListedCePePairs,32);
    assert.equal(r.originalL1QuoteRows,448);
    assert.equal(r.licenceClaimScopeMechanicallyCoversFullOriginalExpiries,true);
    assert.equal(r.claimedLicenceEffectiveOnArchiveDownload,true);
    assert.equal(r.observedSourceDigestAndOwnerAcquisitionClaimAgree,true);
    assert.equal(r.horizons.length,4);
    assert.ok(r.originalAllListedOptionsWithCalendarOrBidGaps>0);
    assert.deepEqual(r.horizons.map(h=>h.horizon),['1W','2W','4W','8W']);
    for(const h of r.horizons){
      assert.equal(h.originalAllListedCePePairs,8);
      assert.equal(h.originalNoEntryPairs,4);
      assert.equal(h.originalEntryClaimedPairs,4);
      assert.ok(h.candidatePairsWithDetectedDataQualityGaps>0);
    }
  });
  it('historical archive downloaded in November cannot retroactively prove original February strategy availableAt',()=>{
    const r=audit(fixture());neverAuthorizes(r);
    assert.equal(r.retrospectiveArchiveCannotRestorePastStrategyAvailableAt,true);
    assert.equal(r.reportedOriginalHistoricalClientReceiptTrustworthy,false);
    assert.equal(r.realOriginal1W2W4W8WHoldReturnsProven,false);
  });
  it('a fake internally complete original 8W option source still does NOT grant rights, profitability, execution or a trusted exchange clock',()=>{
    const f=fixture();
    f.inventEveryMissingHistoricalBid();
    const r=audit(f);neverAuthorizes(r);
    assert.equal(r.status,
      'DESCRIPTIVE_SELF_CLAIMED_RIGHTS_AND_FULL_DURATION_SOURCE_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.originalAllListedOptionsWithCalendarOrBidGaps,0);
    assert.ok(r.originalL1QuoteRows>448);
    assert.equal(r.genuineVendorLicenceGrantIndependentlyAuthenticated,false);
    assert.ok(r.horizons.every(h=>h.candidatePairsWithDetectedDataQualityGaps===0));
  });
  it('omitting original BID_QTY from claimed research rights cannot be covered by raw byte hash repinning',()=>{
    const f=fixture();
    f.licence.permittedFields=['BEST_BID','BEST_ASK','ASK_QTY'];
    f.updateLicence();f.repin();
    rejects(f,'PHASE73_VENDOR_RIGHTS_OR_ORIGINAL_RECEIPT_CLAIM_NOT_ADMISSIBLE');
  });
  it('a fake data rights scope claiming live order signal usage is not a permitted offline research grant',()=>{
    const f=fixture();
    (f.licence as {claimedLiveOrderSignalUsePermitted:boolean})
      .claimedLiveOrderSignalUsePermitted=true;
    f.updateLicence();f.repin();
    rejects(f,'PHASE73_VENDOR_RIGHTS_OR_ORIGINAL_RECEIPT_CLAIM_NOT_ADMISSIBLE');
  });
  it('a fake vendor grant claiming redistribution permission is outside research-only retained dataset scope',()=>{
    const f=fixture();
    (f.licence as {claimedRedistributionPermitted:boolean})
      .claimedRedistributionPermitted=true;
    f.updateLicence();f.repin();
    rejects(f,'PHASE73_VENDOR_RIGHTS_OR_ORIGINAL_RECEIPT_CLAIM_NOT_ADMISSIBLE');
  });
  it('the original data licence claiming historical coverage ending before original last-tradable 8W expiry is incomplete',()=>{
    const f=fixture();
    f.licence.claimedHistoricalCoverageThrough='2026-04-30';
    f.updateLicence();f.repin();
    rejects(f,'PHASE73_CLAIMED_LICENSE_DOES_NOT_COVER_FULL_ORIGINAL_EXPIRIES');
  });
  it('a research grant that becomes effective only after the claimed retrospective download fails as-of acquisition',()=>{
    const f=fixture();
    f.licence.claimedGrantEffectiveAt='2026-11-25T00:00:00.000Z';
    f.updateLicence();f.repin();
    rejects(f,'PHASE73_RETROSPECTIVE_VENDOR_GRANT_OR_DELIVERY_CLOCK_INVALID');
  });
  it('archived option source cannot be claimed received before publisher made the archive available',()=>{
    const f=fixture();
    f.source.claimedArchiveReceivedAt='2026-11-16T00:00:00.000Z';
    f.updateSource();f.repin();
    rejects(f,'PHASE73_RETROSPECTIVE_VENDOR_GRANT_OR_DELIVERY_CLOCK_INVALID');
  });
  it('downloading an alleged archive while actual last listed expiry is still in the future cannot certify completed full holding paths',()=>{
    const f=fixture();
    f.source.claimedArchivePublishedAt='2026-04-01T00:00:00.000Z';
    f.source.claimedArchiveReceivedAt='2026-04-02T00:00:00.000Z';
    f.licence.claimedGrantEffectiveAt='2026-01-01T00:00:00.000Z';
    f.updateLicence();f.updateSource();f.repin();
    rejects(f,'PHASE73_CLAIMED_LICENSE_DOES_NOT_COVER_FULL_ORIGINAL_EXPIRIES');
  });
  it('the private source pinned CSV bytes cannot be silently replaced by changed or backfilled option quotes',()=>{
    const f=fixture();
    const original=Buffer.from(f.vendor.input.newVendorNativeL1CsvBase64,
      'base64');
    original[55]^=1;
    f.vendor.input.newVendorNativeL1CsvBase64=original.toString('base64');
    rejects(f,'PHASE73_PARENT_OR_SOURCE_RIGHTS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('replacing the expected native L1 CSV digest in independent Phase73 pins fails even when all parent source bytes agree',()=>{
    const f=fixture();
    f.pins.expectedOriginalNativeL1CsvSha256='0'.repeat(64);
    rejects(f,'PHASE73_ORIGINAL_LICENCE_INTAKE_OR_L1_BYTES_NOT_PINNED',
      'INVALID_EVIDENCE');
  });
  it('a perfectly self-rehashed fake acquisition receipt claiming a different raw BID/ASK CSV is a different source',()=>{
    const f=fixture();
    f.source.claimedNativeL1CsvSha256='e'.repeat(64);
    f.updateSource();f.repin();
    rejects(f,'PHASE73_VENDOR_ACQUISITION_IS_NOT_SAME_ORIGINAL_L1_OR_OOS');
  });
  it('changing original quote count in acquired owner receipt cannot fabricate full historical 8W coverage',()=>{
    const f=fixture();
    f.source.claimedOriginalL1QuoteRows+=100;
    f.updateSource();f.repin();
    rejects(f,'PHASE73_VENDOR_ACQUISITION_IS_NOT_SAME_ORIGINAL_L1_OR_OOS');
  });
  it('NO_ENTRY original decisions must not be relabeled as actual positions in the intake receipt',()=>{
    const f=fixture();
    f.source.claimedOriginalNoEntryDays=0;
    f.updateSource();f.repin();
    rejects(f,'PHASE73_VENDOR_ACQUISITION_IS_NOT_SAME_ORIGINAL_L1_OR_OOS');
  });
  it('all four expiry alternatives and both CE/PE on EACH OOS date must remain in acquisition denominator',()=>{
    const f=fixture();
    f.source.claimedAllListedCePePairs=16;
    f.updateSource();f.repin();
    rejects(f,'PHASE73_VENDOR_ACQUISITION_IS_NOT_SAME_ORIGINAL_L1_OR_OOS');
  });
  it('changed original independent Phase72 research source dossier is not accepted by rehashing only new Phase73 paperwork',()=>{
    const f=fixture();
    f.parent.receipt.claimedObservedAt='2026-03-01T00:00:00.000Z';
    f.parent.signWitness();
    rejects(f,'PHASE73_PARENT_OR_SOURCE_RIGHTS_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('an owner may fabricate a NEW vendor licence reference and repin it but cannot promote legal authenticity',()=>{
    const f=fixture();
    const alternate='FAKE_OTHER_VENDOR_RIGHTS_HOLDER';
    f.licence.claimedVendorReference=alternate;
    f.source.claimedVendorReference=alternate;
    f.pins.expectedVendorReference=alternate;
    f.updateLicence();f.updateSource();f.repin();
    const r=audit(f);neverAuthorizes(r);
    assert.equal(r.status,
      'DESCRIPTIVE_CLAIMED_RIGHTS_SCOPE_MATCHES_BUT_DURATION_DATA_CENSORED',
      JSON.stringify(r));
    assert.equal(r.genuineVendorLicenceGrantIndependentlyAuthenticated,false);
  });
  it('fake vendor grant claiming independently legal-authenticated rights violates the unverified admission boundary',()=>{
    const f=fixture();
    (f.licence as {claimedLegallyAuthenticated:boolean})
      .claimedLegallyAuthenticated=true;
    f.updateLicence();f.repin();
    rejects(f,'PHASE73_VENDOR_RIGHTS_OR_ORIGINAL_RECEIPT_CLAIM_NOT_ADMISSIBLE');
  });
  it('operator cannot self-promote a retrospective source as independently verified original client availableAt',()=>{
    const f=fixture();
    (f.source as {originalHistoricalClientReceiptClockIndependentlyAvailable:boolean})
      .originalHistoricalClientReceiptClockIndependentlyAvailable=true;
    f.updateSource();f.repin();
    rejects(f,'PHASE73_VENDOR_RIGHTS_OR_ORIGINAL_RECEIPT_CLAIM_NOT_ADMISSIBLE');
  });
  it('the maximum long option paid premium debit loss, theta/IV, spread and broker native NRML GTT stop ACK remain unproven by licence-shaped documents',()=>{
    const r=audit(fixture());neverAuthorizes(r);
    assert.equal(r.fullPaidLongOptionPremiumDebitLossProtected,false);
    assert.equal(r.executableBidAskAndStopFillConfirmed,false);
    assert.equal(r.nrmlGttBrokerChildExchangeAckVerified,false);
    assert.equal(r.bestExpiryHorizonRecommendationAuthorized,false);
  });
});
