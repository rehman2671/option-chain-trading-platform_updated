import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase74RetrospectiveCausalReplay,type Phase74Report
} from '../../server/engine/ema15m/adaptivePhase74RetrospectiveCausalReplay.js';
import {
  makePhase74SyntheticCausalReplayFixture
} from './phase74_synthetic_causal_replay_fixture.js';

const fixture=makePhase74SyntheticCausalReplayFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase74RetrospectiveCausalReplay(f.input,f.pins);
function neverPromotes(r:Phase74Report){
  assert.equal(r.originalClientTimeReceiptsIndependentlyVerified,0);
  assert.equal(r.realOriginalExchangeClientMarketDataRightsVerified,false);
  assert.equal(r.officialExchangeContractExpiryAndSessionsVerified,false);
  assert.equal(r.originalSourceAvailableAtFromHistoricalFileNotTrusted,true);
  assert.equal(r.receiptOfBulkArchiveAfterDecisionCannotProveThenAvailable,true);
  assert.equal(r.retrospectiveResearchOnlyAfterRealLicenceAndSourceAuthentication,true);
  assert.equal(r.genuineCausalEntryBacktestFromThisPackageAuthorized,false);
  assert.equal(r.actualEntrySelectionOrExecutableOptionFillProven,false);
  assert.equal(r.originalNoEntryAlternativeWasNeverAnExecutedPosition,true);
  assert.equal(r.independentlyProvenMultiRegimeFullDurationReturns,false);
  assert.equal(r.index100PointGoalCannotBeInferredFromOptionL1Alone,true);
  assert.equal(r.fullLongOptionPaidPremiumLossRiskEliminated,false);
  assert.equal(r.bestOneToEightWeekExpiryAuthorized,false);
  assert.equal(r.brokerNrmlGttStopChildExchangeAckVerified,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD'));
  for(const c of r.cells){
    assert.equal(c.externallyVerifiedOriginalClientCapturePairs,0);
    assert.equal(c.decisionTimeAccessViaRetrospectivePackageProven,false);
    assert.equal(c.originalNoEntryNotAnActualBrokerPosition,true);
    assert.equal(c.quotesAreNotExecutedFills,true);
    assert.equal(c.fullPaidLongPremiumDebitLossStillPossible,true);
    assert.equal(c.indexTargetPointsNotEquivalentToOptionPremiumPoints,true);
  }
}
function rejected(f:F,reason:string,
  status:Phase74Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);neverPromotes(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase74 original all-listed option L1 causal as-of vs retrospectively delivered archive',()=>{
  it('original 32/32 CE PE contracts have NO decision-time claimed available quotes: event at decision and arrival +5 seconds',()=>{
    const f=fixture(),r=audit(f);neverPromotes(r);
    assert.equal(r.status,
      'DESCRIPTIVE_NO_CLAIMED_ASOF_QUOTES_RETROSPECTIVE_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase73Status,
      'DESCRIPTIVE_CLAIMED_RIGHTS_SCOPE_MATCHES_BUT_DURATION_DATA_CENSORED');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisionDays,4);
    assert.equal(r.originalNoEntryDays,2);
    assert.equal(r.originalListedCePePairs,32);
    assert.equal(r.originalNoEntryListedPairs,16);
    assert.equal(r.originalNativeL1QuoteRows,448);
    assert.equal(r.allSourceRowsInArchiveClaimedPriorToRetrospectiveReceipt,448);
    assert.equal(r.originallyListedPairsWithClaimedAsOfL1BidAndAsk,0);
    assert.equal(r.originallyListedPairsWithNoClaimedAsOfL1AtDecision,32);
    assert.equal(
      r.originallyListedPairsWithQuoteEventBeforeDecisionButAvailableLater,32);
    assert.equal(r.originallyListedPairsWithFirstPostDecisionQuote,32);
    assert.equal(r.originallyListedPairsWhoseArchiveReceivedAfterDecision,32);
    assert.equal(r.cells.length,16);
  });
  it('all 1W 2W 4W 8W CE PE, both no-entry and entry-claimed decisions stay in the source denominator',()=>{
    const r=audit(fixture());neverPromotes(r);
    for(const horizon of ['1W','2W','4W','8W']){
      const cells=r.cells.filter(x=>x.horizon===horizon);
      assert.equal(cells.length,4);
      assert.equal(cells.reduce((n,x)=>
        n+x.originallyListedDecisionContractPairs,0),8);
      assert.equal(cells.reduce((n,x)=>n+x.originallyNoEntryPairs,0),4);
      assert.equal(cells.reduce((n,x)=>n+x.originallyEntryClaimedPairs,0),4);
    }
    assert.equal(r.originalNoEntryAlternativeWasNeverAnExecutedPosition,true);
  });
  it('a first L1 quote with source eventAt exactly at decision but claimed arrival five seconds later is lookahead',()=>{
    const r=audit(fixture());neverPromotes(r);
    assert.ok(r.reasonCodes.includes(
      'QUOTE_EVENT_AT_OR_BEFORE_DECISION_BUT_CLAIMED_ARRIVAL_AFTER_DECISION'));
    assert.equal(r.originallyListedPairsWithNoClaimedAsOfL1AtDecision,32);
    assert.equal(r.actualEntrySelectionOrExecutableOptionFillProven,false);
  });
  it('operator fabricates SAME-TIME quote arrival, re-signs all vendor/issuer/registrar/witness material, still no original client capture proof',()=>{
    const f=fixture();
    f.pretendOneDecisionQuoteWasAvailableImmediately();
    const r=audit(f);neverPromotes(r);
    assert.equal(r.status,
      'DESCRIPTIVE_CLAIMED_ASOF_MARKS_BUT_CLIENT_CLOCK_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.originallyListedPairsWithClaimedAsOfL1BidAndAsk,1);
    assert.equal(r.originallyListedPairsWithNoClaimedAsOfL1AtDecision,31);
    assert.equal(r.originallyListedPairsWhoseArchiveReceivedAfterDecision,32);
    assert.equal(r.genuineCausalEntryBacktestFromThisPackageAuthorized,false);
  });
  it('owner fabricates full 8W calendar and option daily BID marks; original decision as-of source still missing',()=>{
    const f=fixture();
    f.inventAllFutureOptionCloses();
    const r=audit(f);neverPromotes(r);
    assert.equal(r.status,
      'DESCRIPTIVE_NO_CLAIMED_ASOF_QUOTES_RETROSPECTIVE_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase73Status,
      'DESCRIPTIVE_SELF_CLAIMED_RIGHTS_AND_FULL_DURATION_SOURCE_UNVERIFIED');
    assert.ok(r.originalNativeL1QuoteRows>448);
    assert.equal(r.originallyListedPairsWithNoClaimedAsOfL1AtDecision,32);
    assert.equal(r.originallyListedPairsWhoseArchiveReceivedAfterDecision,32);
  });
  it('predeclared staleness policy edited after independent pins fails before source analysis',()=>{
    const f=fixture();
    f.input.policy.maximumClaimedAsOfQuoteAgeMinutes=60;
    rejected(f,'PHASE74_ORIGINAL_RETRO_ARCHIVE_OR_PRESPECIFIED_CAUSAL_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('re-pinning a new staleness policy still cannot convert source observed post-decision into as-of quotes',()=>{
    const f=fixture();
    f.input.policy.maximumClaimedAsOfQuoteAgeMinutes=60;
    f.repin();
    const r=audit(f);neverPromotes(r);
    assert.equal(r.originallyListedPairsWithClaimedAsOfL1BidAndAsk,0);
  });
  it('policy cannot be rewritten to treat a retrospective archive as historical strategy client receipt',()=>{
    const f=fixture();
    (f.input.policy as {
      allowRetrospectiveArchiveToImpersonateOriginalClientReceiveAt:boolean
    }).allowRetrospectiveArchiveToImpersonateOriginalClientReceiveAt=true;
    f.repin();
    rejected(f,'PHASE74_ORIGINAL_RETRO_ARCHIVE_OR_PRESPECIFIED_CAUSAL_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('operator cannot remove requirement for original contemporaneous capture to authorize causal strategy research',()=>{
    const f=fixture();
    (f.input.policy as {
      requireTrueContemporaneousSourceCaptureForLiveCausalClaims:boolean
    }).requireTrueContemporaneousSourceCaptureForLiveCausalClaims=false;
    f.repin();
    rejected(f,'PHASE74_ORIGINAL_RETRO_ARCHIVE_OR_PRESPECIFIED_CAUSAL_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a changed complete Phase73 dossier not independently re-pinned is invalid, even if later quote marks looked profitable',()=>{
    const f=fixture();
    f.previous.licence.claimedGrantExpiresAt='2029-01-01T00:00:00.000Z';
    f.previous.updateLicence();f.previous.repin();
    rejected(f,'PHASE74_ORIGINAL_RETRO_ARCHIVE_OR_PRESPECIFIED_CAUSAL_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('the original no-entry option pair count cannot be changed to turn alternatives into purported filled positions',()=>{
    const f=fixture();
    f.pins.expectedOriginalNoEntryListedPairs=8;
    rejected(f,'PHASE74_FROZEN_ORIGINAL_OOS_NO_ENTRY_OR_ARCHIVE_CAUSALITY_DISAGREES');
  });
  it('all-listed original option pair denominator is frozen against cherry-picking one winning contract',()=>{
    const f=fixture();
    f.pins.expectedOriginallyListedCePePairs=16;
    rejected(f,'PHASE73_COMPLETE_ORIGINAL_OOS_SOURCE_NOT_READY');
  });
  it('original quoted event-side data must be accompanied by adequate BID and ASK depth; only claimed as-of, not execution',()=>{
    const f=fixture();
    f.pretendOneDecisionQuoteWasAvailableImmediately();
    f.input.policy.minimumClaimedDisplayedBidDepthLots=3;
    f.repin();
    const r=audit(f);neverPromotes(r);
    assert.equal(r.originallyListedPairsWithClaimedAsOfL1BidAndAsk,0);
    assert.equal(r.originallyListedPairsWithNoClaimedAsOfL1AtDecision,32);
  });
  it('even a zero gap at the first hypothetical option premium target is not a guaranteed NRML broker fill',()=>{
    const r=audit(fixture());neverPromotes(r);
    assert.equal(r.genuineCausalEntryBacktestFromThisPackageAuthorized,false);
    assert.equal(r.brokerNrmlGttStopChildExchangeAckVerified,false);
    assert.equal(r.fullLongOptionPaidPremiumLossRiskEliminated,false);
  });
  it('an original package published months after its decisions never provides a verified original strategy receive clock',()=>{
    const r=audit(fixture());neverPromotes(r);
    assert.equal(r.allSourceRowsInArchiveClaimedPriorToRetrospectiveReceipt,448);
    assert.equal(r.originallyListedPairsWhoseArchiveReceivedAfterDecision,32);
    assert.equal(r.originalClientTimeReceiptsIndependentlyVerified,0);
  });
  it('NIFTY underlying 100-point objective cannot be tested from an option-only CSV as 100 option premium points',()=>{
    const r=audit(fixture());neverPromotes(r);
    assert.equal(r.index100PointGoalCannotBeInferredFromOptionL1Alone,true);
    assert.equal(r.fullLongOptionPaidPremiumLossRiskEliminated,false);
  });
});
