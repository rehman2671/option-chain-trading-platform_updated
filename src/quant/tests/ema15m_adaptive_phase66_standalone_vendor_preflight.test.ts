import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase66StandaloneVendorPreflight,type Phase66Report
} from '../../server/engine/ema15m/adaptivePhase66StandaloneVendorPreflight.js';
import {makePhase66IndependentSyntheticVendorFixture}
  from './phase66_synthetic_new_vendor_fixture.js';

const fixture=makePhase66IndependentSyntheticVendorFixture;
type F=ReturnType<typeof fixture>;
const run=(f:F)=>auditPhase66StandaloneVendorPreflight(f.input,f.pins);
function untrusted(r:Phase66Report){
  assert.equal(r.claimedClientSourceClockIndependentlyTrusted,false);
  assert.equal(r.independentlyVerifiedHistoricalL1ResearchLicence,false);
  assert.equal(r.independentlyAuthenticatedExchangeVendorProduct,false);
  assert.equal(r.officialContractExpiryMasterVerified,false);
  assert.equal(r.officialExchangeSessionCalendarVerified,false);
  assert.equal(r.historicalDataDownloadProvesPastStrategyReceipt,false);
  assert.equal(r.externallyVerifiedMarketRegimesAndStatisticalOosEdge,false);
  assert.equal(r.actualSourceBidAskIsExecutableFillProof,false);
  assert.equal(r.independentlyCalibratedIvThetaAndOvernightLoss,false);
  assert.equal(r.bestExpiryContractOrStrategyAuthorized,false);
  assert.equal(r.brokerNativeNrmlStopAndGttAckVerified,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MOCK NOT A REAL LICENCE'));
  for(const cell of r.cells)
    assert.equal(cell.sampleCannotAuthorizeTrade,true);
}
function rejected(f:F,reason:string,
  status:Phase66Report['status']='INCOMPLETE_EVIDENCE'){
  const r=run(f);untrusted(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase66 standalone NEW historical option vendor native L1 preflight',()=>{
  it('can preflight an entirely NEW source independent of old Phase65 synthetic history, while never proving licence or at-time clock',()=>{
    const f=fixture(),r=run(f);untrusted(r);
    assert.equal(r.status,
      'DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.declaredSyntheticDataset,true);
    assert.equal(r.originalOosDecisionDays,4);
    assert.equal(r.originalIndependentTestFolds,2);
    assert.equal(r.distinctClaimedRegimes,2);
    assert.equal(r.noEntryOriginalOosDecisionDays,2);
    assert.equal(r.nativeOriginalQuoteRows,448);
    assert.equal(r.originalListedCePeHorizonPairs,32);
    assert.equal(r.originalListedPairsMeetingPrespecifiedSourceCoverage,32);
    assert.equal(r.originalListedPairsWithMissingSourceCoverage,0);
    assert.equal(r.sourceQuoteInstrumentsUnknownToOriginalCatalog,0);
    assert.equal(r.declaredCalendarSessions,6);
    assert.equal(r.allFourHorizonBothCePePerDecisionPreserved,true);
    assert.equal(r.predeclaredEmbargoAndUntouchedFoldIsolationSatisfied,true);
    assert.equal(r.cells.length,16);
    assert.equal(r.cells.reduce((n,x)=>n+x.originalListedOosPairs,0),32);
    assert.ok(r.externalEvidenceRequired.some(x=>x.includes('LICENSE')));
  });
  it('a historical file that arrived later still cannot establish original option strategy-side availableAt even when fully complete',()=>{
    const r=run(fixture());untrusted(r);
    assert.equal(r.status,
      'DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED');
    assert.equal(r.historicalDataDownloadProvesPastStrategyReceipt,false);
  });
  it('wrong independently pinned original CSV byte immediately invalidates intake',()=>{
    const f=fixture();
    f.raw[1][5]='89';f.updateQuotes();
    rejected(f,'PHASE66_NEW_VENDOR_SOURCE_BYTES_NOT_INDEPENDENTLY_PINNED',
      'INVALID_EVIDENCE');
  });
  it('wrong quoted BID after operator rehash is a source-coverage observation, never proof of actual fill',()=>{
    const f=fixture();
    f.raw[1][5]='80';f.updateQuotes();f.repinOuter();
    const r=rejected(f,
      'PHASE66_CANDIDATE_L1_SPREAD_DEPTH_CADENCE_OR_FIRST_OPEN_INCOMPLETE');
    assert.ok(r.cells.some(c=>c.excessiveSpreadPairs>0));
    assert.equal(r.actualSourceBidAskIsExecutableFillProof,false);
  });
  it('zero displayed bid depth cannot be assumed an executable stop fill',()=>{
    const f=fixture();
    f.raw[1][7]='0';f.updateQuotes();f.repinOuter();
    const r=rejected(f,
      'PHASE66_CANDIDATE_L1_SPREAD_DEPTH_CADENCE_OR_FIRST_OPEN_INCOMPLETE');
    assert.ok(r.cells.some(c=>c.missingDisplayedDepthPairs>0));
  });
  it('predeclared tighter intraday quote gap rejects sparse original price observations',()=>{
    const f=fixture();
    f.input.policy.maximumOriginalDecisionToCloseQuoteGapMinutes=20;
    f.repinOuter();
    const r=rejected(f,
      'PHASE66_CANDIDATE_L1_SPREAD_DEPTH_CADENCE_OR_FIRST_OPEN_INCOMPLETE');
    assert.ok(r.cells.some(c=>c.excessiveQuoteGapPairs>0));
  });
  it('missing second original next-open quote is not replaced by subsequent favorable option BID',()=>{
    const f=fixture();
    f.input.policy.minimumOriginalQuotesFirstNextOpen=3;
    f.repinOuter();
    const r=rejected(f,
      'PHASE66_CANDIDATE_L1_SPREAD_DEPTH_CADENCE_OR_FIRST_OPEN_INCOMPLETE');
    assert.ok(r.cells.some(c=>c.missingFirstNextOpenPairs>0));
  });
  it('original claimed source clock delivered too late is not point-in-time usable even with new hashes',()=>{
    const f=fixture();
    f.raw[1][4]=new Date(Date.parse(f.raw[1][3])+120000)
      .toISOString();
    f.updateQuotes();f.repinOuter();
    const r=rejected(f,
      'PHASE66_CANDIDATE_L1_SPREAD_DEPTH_CADENCE_OR_FIRST_OPEN_INCOMPLETE');
    assert.ok(r.cells.some(c=>c.lateOrNoncausalClaimedAvailableAtPairs>0));
  });
  it('dropped original option row cannot silently reduce frozen full market quote denominator',()=>{
    const f=fixture();
    f.raw.pop();f.updateQuotes();f.repinOuter();
    rejected(f,
      'PHASE66_STRICT_NATIVE_L1_COLUMNS_OR_ORIGINAL_DENOMINATOR_INVALID');
  });
  it('dropping an original no-entry OOS day cannot be disguised by refreshing catalog hashes',()=>{
    const f=fixture();
    f.catalog.decisions.shift();f.updateCatalog();f.repinOuter();
    rejected(f,'PHASE66_ORIGINAL_OOS_FOLDS_DECISIONS_OR_LISTED_OPTIONS_CHANGED');
  });
  it('dropping a listed PE option fails complete original eight-side horizon coverage even if operator rehashes original manifest',()=>{
    const f=fixture();
    f.catalog.decisions[1].originallyListedContracts.pop();
    f.updateCatalog();f.operatorRehashOriginalManifest();f.repinOuter();
    const r=rejected(f,
      'PHASE66_ALL_ORIGINAL_OOS_DECISIONS_OPTION_PAIRS_OR_SOURCE_DENOMINATOR_INCOMPLETE');
    assert.equal(r.allFourHorizonBothCePePerDecisionPreserved,false);
  });
  it('an archive cannot relabel trade-only data as genuine option L1 source',()=>{
    const f=fixture();
    f.input.delivery.sourceCategory='TRADE_ONLY';
    f.repinOuter();
    rejected(f,'PHASE66_NEW_VENDOR_SOURCE_POLICY_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('replay-time or download-time never replaces historical client source availableAt',()=>{
    const f=fixture();
    f.input.delivery.claimedClientReceiveClock='REPLAY_AS_ORIGINAL_RECEIPT';
    f.repinOuter();
    rejected(f,'PHASE66_NEW_VENDOR_SOURCE_POLICY_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('retrospective historical archive cannot assert download timestamp as original quote receipt',()=>{
    const f=fixture();
    (f.input.delivery as {treatDownloadTimeAsOriginalAvailableAt:boolean})
      .treatDownloadTimeAsOriginalAvailableAt=true;
    f.repinOuter();
    rejected(f,'PHASE66_NEW_VENDOR_SOURCE_POLICY_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('an embargo gap shorter than original maximum hold invalidates predeclared untouched policy',()=>{
    const f=fixture();
    f.input.policy.minimumTrainToFirstTestEmbargoCalendarDays=20;
    f.repinOuter();
    rejected(f,'PHASE66_NEW_VENDOR_SOURCE_POLICY_OR_INDEPENDENT_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a later fold training on an earlier OOS test period leaks holdout and fails',()=>{
    const f=fixture();
    f.catalog.folds[1].trainingEnd='2026-02-15';
    f.updateCatalog();f.operatorRehashOriginalManifest();f.repinOuter();
    rejected(f,'PHASE66_FUTURE_OOS_TEST_DATA_ENTERED_ANOTHER_TRAINING_FOLD');
  });
  it('overlapping OOS test windows are not independent held-out sessions',()=>{
    const f=fixture();
    f.catalog.folds[1].testStart='2026-02-11';
    f.updateCatalog();f.operatorRehashOriginalManifest();f.repinOuter();
    rejected(f,'PHASE66_ORIGINAL_OOS_FOLD_OVERLAP_OR_HOLD_EMBARGO_INVALID');
  });
  it('only a single operator-claimed market regime cannot satisfy a multi-regime suitability study',()=>{
    const f=fixture();
    for(const d of f.catalog.decisions)d.claimedRegime='TREND';
    f.updateCatalog();f.operatorRehashOriginalManifest();f.repinOuter();
    const r=rejected(f,'INSUFFICIENT_UNTOUCHED_FOLDS_OR_CLAIMED_REGIME_OOS_DAYS',
      'DESCRIPTIVE_COVERAGE_INSUFFICIENT_UNVERIFIED');
    assert.equal(r.distinctClaimedRegimes,1);
  });
  it('unknown vendor quote instrument outside declared point-in-time listings is not silently assimilated',()=>{
    const f=fixture();
    f.raw[1][2]='UNKNOWN_VENDOR_INSTRUMENT';
    f.updateQuotes();f.repinOuter();
    const r=rejected(f,
      'PHASE66_ALL_ORIGINAL_OOS_DECISIONS_OPTION_PAIRS_OR_SOURCE_DENOMINATOR_INCOMPLETE');
    assert.equal(r.sourceQuoteInstrumentsUnknownToOriginalCatalog,1);
  });
  it('missing next session in the purported original calendar fails rather than treating overnight gap as protected',()=>{
    const f=fixture();
    f.calendar.sessions.pop();
    f.updateCalendar();f.repinOuter();
    rejected(f,'PHASE66_ORIGINAL_TEST_SESSION_OR_NEXT_OPEN_NOT_DECLARED');
  });
  it('source license rights labelled not verified can still be preflighted but must never become a legal entitlement',()=>{
    const f=fixture();
    f.input.claimedResearchEntitlementBytesBase64=
      Buffer.from('SELF ASSERTED PAPER DOES NOT ESTABLISH RIGHTS')
        .toString('base64');
    f.repinOuter();
    const r=run(f);untrusted(r);
    assert.equal(r.status,
      'DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED');
    assert.equal(r.independentlyVerifiedHistoricalL1ResearchLicence,false);
  });
  it('relabeling the same synthetic tape as vendor market history cannot promote external authenticity',()=>{
    const f=fixture();
    f.input.delivery.declaredDatasetKind=
      'OWNER_SUPPLIED_MARKET_CANDIDATE_UNVERIFIED';
    f.repinOuter();
    const r=run(f);untrusted(r);
    assert.equal(r.status,
      'DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED');
    assert.equal(r.declaredSyntheticDataset,false);
    assert.equal(r.independentlyAuthenticatedExchangeVendorProduct,false);
  });
  it('operator can rehash a changed strike catalog, proving why external original exchange master stays unverified',()=>{
    const f=fixture();
    f.catalog.decisions[0].originallyListedContracts[0].strikePrice=22025;
    f.updateCatalog();f.operatorRehashOriginalManifest();f.repinOuter();
    const r=run(f);untrusted(r);
    assert.equal(r.status,
      'DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED');
    assert.equal(r.officialContractExpiryMasterVerified,false);
  });
  it('even an internally complete two-regime sample does not authorize any 1W/2W/4W/8W horizon recommendation',()=>{
    const f=fixture(),r=run(f);untrusted(r);
    assert.equal(r.bestExpiryContractOrStrategyAuthorized,false);
    assert.equal(r.externallyVerifiedMarketRegimesAndStatisticalOosEdge,false);
    assert.equal(r.brokerNativeNrmlStopAndGttAckVerified,false);
    assert.equal(r.originalOosDecisionDays,4);
  });
});
