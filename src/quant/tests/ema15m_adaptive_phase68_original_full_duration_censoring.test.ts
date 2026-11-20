import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase68OriginalDurationCensoring,type Phase68Report
} from '../../server/engine/ema15m/adaptivePhase68OriginalDurationCensoring.js';
import {makePhase68SyntheticFullDurationFixture}
  from './phase68_synthetic_full_duration_fixture.js';

const fixture=makePhase68SyntheticFullDurationFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase68OriginalDurationCensoring(f.input,f.pins);
function noTrading(r:Phase68Report){
  assert.equal(r.declaredIssuerCalendarSessionCoverageIsNotIndependentlyComplete,true);
  assert.equal(r.originalNoEntryNeverSimulatedAsBrokerTrade,true);
  assert.equal(r.underlyingIndex100PointTargetNotTestableFromOptionL1Alone,true);
  assert.equal(r.sourceAskAndBidMarksAreNotExecutedFills,true);
  assert.equal(r.independentlyTrustedHistoricalSourceReceiptClock,false);
  assert.equal(r.exchangeOrVendorLicensedHistoricalFeedAuthenticated,false);
  assert.equal(r.officialExchangeExpiryLotAndCalendarVerified,false);
  assert.equal(r.actualMultiweekPositionExitProven,false);
  assert.equal(r.independentMultiMarketRegimeProfitabilityEstablished,false);
  assert.equal(r.realOptionIvThetaAndSlippageCalibrated,false);
  assert.equal(r.fullPaidDebitLossProtectionProven,false);
  assert.equal(r.brokerNativeOvernightNrmlGttStopAckVerified,false);
  assert.equal(r.optimalOneToEightWeekContractRecommendationAuthorized,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD'));
  for(const c of r.cells){
    assert.equal(c.longOptionCanLoseEntirePaidPremium,true);
    assert.equal(c.originalIndex100PointObjectiveUnobservableWithoutUnderlyingIndexTape,true);
    assert.equal(c.originalQuoteIsNotAnExecutableBrokerFill,true);
  }
}
function rejected(f:F,reason:string,
  status:Phase68Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);noTrading(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase68 full-duration option L1 quote censoring and premium reversal',()=>{
  it('original 1W/2W/4W/8W are CENSORED despite all original next-open BID snapshots existing',()=>{
    const f=fixture(),r=audit(f);noTrading(r);
    assert.equal(r.status,'DESCRIPTIVE_MULTIWEEK_MARKS_CENSORED_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase67Status,
      'DESCRIPTIVE_CROSS_SOURCE_MATCH_UNVERIFIED_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisionDays,4);
    assert.equal(r.originalOosNoEntryDays,2);
    assert.equal(r.originalOosEntryClaimedDays,2);
    assert.equal(r.originalListedCePePairs,32);
    assert.equal(r.originalNoEntryPairsPreserved,16);
    assert.equal(r.originalClaimedEntryAskMarks,16);
    assert.equal(r.originalClaimedEntryPairsWithoutEntryAsk,0);
    assert.equal(r.originalLongOptionCandidatePairsWithCensoredHoldingEvidence,
      32);
    assert.equal(r.originalPairsWithEveryDeclaredSessionBidMark,0);
    assert.ok(r.missingDeclaredSessionQuoteMarks>=32);
    assert.equal(r.cells.length,16);
    assert.equal(r.cells.reduce((n,x)=>n+x.originalListedPairs,0),32);
    assert.equal(r.cells.reduce((n,x)=>n+x.originalNoEntryPairs,0),16);
    assert.equal(r.cells.reduce((n,x)=>n+x.originalEntryClaimedPairs,0),16);
  });
  it('synthetic NEXT-OPEN bid gap is adverse but never a guaranteed stop exit or actual PnL',()=>{
    const r=audit(fixture());noTrading(r);
    assert.equal(r.claimedEntryPairsWithFirstNextOpenGapAlert,16);
    assert.equal(r.claimedEntryPairsWithPremiumRunupThenGivebackAlert,0);
    assert.equal(r.actualMultiweekPositionExitProven,false);
  });
  it('synthetic option premium rises +70 before +100 premium target, reverses, and remains a censored quote mark',()=>{
    const f=fixture();
    const c=f.parent.vendor.catalog.decisions[1].originallyListedContracts[0];
    const instrumentRows=f.parent.vendor.raw.filter(row=>
      row[2]===c.instrumentKey);
    assert.ok(instrumentRows.length>=12);
    // Entry illustrative ASK=101. Later marked BID=170 (runup +69),
    // followed by BID=100 (giveback 70). This is PREMIUM, NOT index.
    instrumentRows[8][5]='170';
    instrumentRows[8][6]='171';
    f.repinQuotes();
    const r=audit(f);noTrading(r);
    assert.equal(r.status,'DESCRIPTIVE_MULTIWEEK_MARKS_CENSORED_ONLY',
      JSON.stringify(r));
    assert.equal(r.claimedEntryPairsWithPremiumRunupThenGivebackAlert,1);
    assert.equal(r.originalLongOptionCandidatePairsWithCensoredHoldingEvidence,
      32);
    assert.equal(r.underlyingIndex100PointTargetNotTestableFromOptionL1Alone,
      true);
  });
  it('never treats 100 points of NIFTY underlying target as OPTION PREMIUM target',()=>{
    const f=fixture();
    const r=audit(f);noTrading(r);
    assert.equal(r.underlyingIndex100PointTargetNotTestableFromOptionL1Alone,
      true);
    assert.ok(r.externalEvidenceRequired.some(x=>
      x.includes('IV_THETA')));
  });
  it('an OPTION source received 15 minutes after decision cannot become an entry ASK at decision',()=>{
    const f=fixture();
    const key=f.parent.vendor.catalog.decisions[1]
      .originallyListedContracts[0].instrumentKey;
    const first=f.parent.vendor.raw.find(row=>
      row[2]===key)!;
    first[3]=new Date(Date.parse(first[3])+15*60000).toISOString();
    first[4]=new Date(Date.parse(first[3])+5000).toISOString();
    f.repinQuotes();
    const r=audit(f);noTrading(r);
    assert.equal(r.status,'DESCRIPTIVE_MULTIWEEK_MARKS_CENSORED_ONLY');
    assert.equal(r.originalClaimedEntryPairsWithoutEntryAsk,1);
    assert.equal(r.originalClaimedEntryAskMarks,15);
  });
  it('NO_ENTRY decisions never invent a broker position or pretend every listed option was bought',()=>{
    const r=audit(fixture());noTrading(r);
    assert.equal(r.originalOosNoEntryDays,2);
    assert.equal(r.originalNoEntryPairsPreserved,16);
    assert.equal(r.originalClaimedEntryAskMarks,16);
    assert.equal(r.originalNoEntryNeverSimulatedAsBrokerTrade,true);
  });
  it('altering original NO_ENTRY to claimed trade after self-repin does not evade independent Phase68 OOS day counts',()=>{
    const f=fixture();
    f.parent.vendor.catalog.decisions[0]
      .originalEntryDisposition='ENTRY_CLAIMED';
    f.parent.vendor.updateCatalog();
    f.parent.vendor.operatorRehashOriginalManifest();
    f.parent.vendor.repinOuter();
    f.parent.repin();f.repin();
    rejected(f,'PHASE68_FROZEN_ORIGINAL_DECISION_OR_NO_ENTRY_DENOMINATOR_DISAGREES');
  });
  it('changing a predeclared premium reversal threshold AFTER original pins invalidates policy',()=>{
    const f=fixture();
    f.input.policy.premiumRunupAlertPoints=2;
    rejected(f,'PHASE68_ORIGINAL_QUOTE_UNIVERSE_OR_ALERT_POLICY_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('higher adverse gap alert still cannot cure missing full option holding sessions',()=>{
    const f=fixture();
    f.input.policy.overnightBidGapAlertPoints=100;
    f.repin();
    const r=audit(f);noTrading(r);
    assert.equal(r.claimedEntryPairsWithFirstNextOpenGapAlert,0);
    assert.equal(r.originalLongOptionCandidatePairsWithCensoredHoldingEvidence,32);
  });
  it('tight close-mark quote freshness increases missing expiry evidence and never creates synthetic fills',()=>{
    const f=fixture();
    f.input.policy.maxLastBidMarkAgeBeforeCloseMinutes=1;
    f.repin();
    const r=audit(f);noTrading(r);
    assert.equal(r.originalLongOptionCandidatePairsWithCensoredHoldingEvidence,32);
    assert.ok(r.missingDeclaredSessionQuoteMarks>=32);
  });
  it('corrupted earlier original Phase67 quote/source checks cannot be rehabilitated by premium alert math',()=>{
    const f=fixture();
    f.parent.vendor.raw[1][7]='0';
    f.repinQuotes();
    rejected(f,'PHASE67_FULL_ORIGINAL_SOURCE_NOT_READY');
  });
  it('mutated independent original listed CE/PE denominator is rejected at Phase68 admission',()=>{
    const f=fixture();
    f.pins.expectedOriginallyListedCePePairs=24;
    rejected(f,'PHASE67_FULL_ORIGINAL_SOURCE_NOT_READY');
  });
  it('more entry candles or an attractive next open do not mean 56-day source coverage',()=>{
    const r=audit(fixture());noTrading(r);
    assert.ok(r.cells.every(c=>
      c.censoredBeforeDeclaredLastTradableSessionPairs===
      c.originalListedPairs));
    assert.equal(r.actualMultiweekPositionExitProven,false);
  });
  it('full paid premium debit is risk capital, never inferred as a protective broker stop',()=>{
    const r=audit(fixture());noTrading(r);
    assert.equal(r.fullPaidDebitLossProtectionProven,false);
    assert.equal(r.brokerNativeOvernightNrmlGttStopAckVerified,false);
    assert.ok(r.cells.every(c=>c.longOptionCanLoseEntirePaidPremium));
  });
});
