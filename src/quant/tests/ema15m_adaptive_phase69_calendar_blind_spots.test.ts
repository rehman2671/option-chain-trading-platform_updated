import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase69CalendarBlindSpots,type Phase69Report
} from '../../server/engine/ema15m/adaptivePhase69CalendarBlindSpots.js';
import {makePhase69SyntheticBlindSpotFixture}
  from './phase69_synthetic_calendar_blind_spot_fixture.js';

const fixture=makePhase69SyntheticBlindSpotFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase69CalendarBlindSpots(f.input,f.pins);
function unverified(r:Phase69Report){
  assert.equal(r.candidateWeekdaysMayIncludeExchangeHolidaysOrClosures,true);
  assert.equal(r.declaredCalendarMayOmitSpecialWeekendSessions,true);
  assert.equal(r.sourceCandidateCalendarCompletenessOfficiallyVerified,false);
  assert.equal(r.exchangeOrVendorHistoricOptionL1EntitlementVerified,false);
  assert.equal(r.originalClientHistoricalAvailableAtTrusted,false);
  assert.equal(r.historicalUnenteredOptionNotActualPosition,true);
  assert.equal(r.fullyObservedSourceBidMarksNotExecutableFills,true);
  assert.equal(r.genuinePositionPnLOrStatisticalMultiregimeEdgeProven,false);
  assert.equal(r.optimalOneToEightWeekContractRecommended,false);
  assert.equal(r.completeLongPremiumDebitLossProtectionProven,false);
  assert.equal(r.brokerNrmlGttNativeStopChildExchangeAckVerified,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD'));
  for(const c of r.cells){
    assert.equal(c.noEntryNeverBrokerPosition,true);
    assert.equal(c.potentialWeekdayNotProvenRealExchangeSession,true);
    assert.equal(c.closeBidNotActualTradeFill,true);
  }
}
function reject(f:F,reason:string,
  status:Phase69Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);unverified(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase69 original OOS 1W-8W weekday candidate acquisition gaps',()=>{
  it('classifies absent intermediate weekdays separately from missing declared session close BIDs across all listed CE PE',()=>{
    const f=fixture(),r=audit(f);unverified(r);
    assert.equal(r.status,'DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase68Status,'DESCRIPTIVE_MULTIWEEK_MARKS_CENSORED_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisionDays,4);
    assert.equal(r.originalOosNoEntryDays,2);
    assert.equal(r.originalOosListedCePeContractPairs,32);
    assert.equal(r.originalPairsWithoutVerifiedCompleteFullDurationEvidence,32);
    assert.ok(r.originalAllListedPairsWithCalendarBlindSpots>=16);
    assert.ok(r.totalUnexplainedPotentialWeekdayContractSlots>32);
    assert.ok(r.distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar>5);
    assert.ok(r.longestConsecutiveUnexplainedWeekdayRun>0);
    assert.ok(r.totalMissingOrStaleDeclaredSessionBidMarkSlots>0);
    assert.equal(r.cells.length,16);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalListedPairs,0),32);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalNoEntryPairs,0),16);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalEntryClaimedPairs,0),16);
  });
  it('does NOT call a potential Monday-Friday holiday a proven NSE/BSE trading session',()=>{
    const r=audit(fixture());unverified(r);
    assert.equal(r.candidateWeekdaysMayIncludeExchangeHolidaysOrClosures,true);
    assert.equal(r.sourceCandidateCalendarCompletenessOfficiallyVerified,false);
    assert.ok(r.reasonCodes.includes(
      'PUBLIC_HOLIDAYS_AND_SPECIAL_WEEKEND_EXCHANGE_SESSIONS_UNVERIFIED'));
  });
  it('entirely owner-fabricated 1W–8W daily quote tape can satisfy software coverage but NEVER grant real profit/fills',()=>{
    const f=fixture();
    f.fillEveryPotentialWeekdayAndClosingBid();
    const r=audit(f);unverified(r);
    assert.equal(r.status,
      'DESCRIPTIVE_NO_DETECTED_WEEKDAY_GAPS_BUT_SOURCE_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.phase68Status,
      'DESCRIPTIVE_DECLARED_SESSION_MARKS_PRESENT_BUT_UNVERIFIED');
    assert.equal(r.originalOosListedCePeContractPairs,32);
    assert.equal(r.originalAllListedPairsWithCalendarBlindSpots,0);
    assert.equal(r.originalPairsWithMissingDeclaredCloseBidMarks,0);
    assert.equal(r.totalUnexplainedPotentialWeekdayContractSlots,0);
    assert.equal(r.totalMissingOrStaleDeclaredSessionBidMarkSlots,0);
    assert.equal(r.originalPairsWithoutVerifiedCompleteFullDurationEvidence,32);
    assert.equal(r.optimalOneToEightWeekContractRecommended,false);
    assert.equal(r.genuinePositionPnLOrStatisticalMultiregimeEdgeProven,false);
  });
  it('coordinated deletion of a weekday from BOTH vendor and issuer plus original quotes cannot hide original calendar blind spots',()=>{
    const f=fixture();
    f.fillEveryPotentialWeekdayAndClosingBid();
    f.jointlyDeleteQuotedSession('2026-03-02');
    const r=audit(f);unverified(r);
    assert.equal(r.status,'DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase68Status,
      'DESCRIPTIVE_DECLARED_SESSION_MARKS_PRESENT_BUT_UNVERIFIED');
    assert.ok(r.originalAllListedPairsWithCalendarBlindSpots>0);
    assert.equal(r.originalPairsWithMissingDeclaredCloseBidMarks,0);
    assert.ok(r.distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar>0);
    assert.ok(r.totalUnexplainedPotentialWeekdayContractSlots>0);
  });
  it('original session closing BID with zero displayed depth still yields missing source mark despite complete calendar',()=>{
    const f=fixture();
    f.fillEveryPotentialWeekdayAndClosingBid();
    const q=f.parent.parent.vendor.raw.find(r=>
      r[2]==='VENDOR_CANDIDATE_1_4W_CE'&&
      r[3].startsWith('2026-03-02T09:55:00'))!;
    assert.ok(q);
    q[7]='0';
    f.syncSource();
    const r=audit(f);unverified(r);
    assert.equal(r.status,'DESCRIPTIVE_DECLARED_CLOSE_BID_SOURCE_GAPS_ONLY',
      JSON.stringify(r));
    assert.equal(r.totalUnexplainedPotentialWeekdayContractSlots,0);
    assert.ok(r.originalPairsWithMissingDeclaredCloseBidMarks>0);
    assert.ok(r.totalMissingOrStaleDeclaredSessionBidMarkSlots>0);
    assert.equal(r.fullyObservedSourceBidMarksNotExecutableFills,true);
  });
  it('a prespecified tighter as-of closing BID age reveals stale marks without creating fictitious exits',()=>{
    const f=fixture();
    f.fillEveryPotentialWeekdayAndClosingBid();
    f.input.policy.maximumCloseBidAgeMinutes=1;
    f.repin();
    const r=audit(f);unverified(r);
    assert.equal(r.status,'DESCRIPTIVE_DECLARED_CLOSE_BID_SOURCE_GAPS_ONLY');
    assert.equal(r.totalUnexplainedPotentialWeekdayContractSlots,0);
    assert.ok(r.totalMissingOrStaleDeclaredSessionBidMarkSlots>=32);
  });
  it('an explicitly declared SATURDAY special session still requires original BID marks; weekdays alone are not official session master',()=>{
    const f=fixture();
    f.fillEveryPotentialWeekdayAndClosingBid();
    f.addWeekendSessionWithoutQuotes('2026-02-14');
    const r=audit(f);unverified(r);
    assert.equal(r.status,'DESCRIPTIVE_DECLARED_CLOSE_BID_SOURCE_GAPS_ONLY',
      JSON.stringify(r));
    assert.equal(r.totalUnexplainedPotentialWeekdayContractSlots,0);
    assert.ok(r.totalMissingOrStaleDeclaredSessionBidMarkSlots>0);
    assert.equal(r.declaredCalendarMayOmitSpecialWeekendSessions,true);
  });
  it('re-lowering posthoc gap tolerance changes a frozen policy hash and fails',()=>{
    const f=fixture();
    f.input.policy.maximumUnexplainedWeekdayCandidateGapsPerPair=20;
    reject(f,'PHASE69_FULL_OOS_SOURCE_OR_PRESPECIFIED_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('loosening predeclared tolerance after an INDEPENDENT repin never hides absolute source-acquisition blind spots',()=>{
    const f=fixture();
    f.input.policy.maximumUnexplainedWeekdayCandidateGapsPerPair=20;
    f.repin();
    const r=audit(f);unverified(r);
    assert.equal(r.status,'DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY');
    assert.ok(r.totalUnexplainedPotentialWeekdayContractSlots>0);
    assert.ok(r.distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar>0);
  });
  it('changing full frozen OOS listed CE PE count cannot be hidden by fewer source rows',()=>{
    const f=fixture();
    f.pins.expectedAllOosListedCePePairs=24;
    reject(f,'PHASE68_ORIGINAL_FULL_OOS_LISTED_SOURCE_CENSORING_NOT_READY');
  });
  it('omitting original NO_ENTRY decisions cannot make selected winner-only source look complete',()=>{
    const f=fixture();
    f.pins.expectedOriginalNoEntryDecisions=1;
    reject(f,'PHASE68_ORIGINAL_FULL_OOS_LISTED_SOURCE_CENSORING_NOT_READY');
  });
  it('a fraudulent issuer claimed last-tradable expiry cannot repair original quoted multiweek source coverage',()=>{
    const f=fixture();
    f.parent.parent.issuerMaster.snapshots[0]
      .optionContracts[0].expiry='2026-02-18';
    f.parent.parent.updateMaster();
    f.parent.parent.repin();
    f.parent.repin();f.repin();
    reject(f,'PHASE68_ORIGINAL_FULL_OOS_LISTED_SOURCE_CENSORING_NOT_READY');
  });
  it('option premium runup followed by giveback remains descriptive quote-risk alert not NIFTY index target or filled stop',()=>{
    const f=fixture();
    const c=f.parent.parent.vendor.catalog.decisions[1]
      .originallyListedContracts[0];
    const rows=f.parent.parent.vendor.raw.filter(r=>
      r[2]===c.instrumentKey);
    rows[8][5]='170';rows[8][6]='171';
    f.syncSource();
    const r=audit(f);unverified(r);
    assert.equal(r.originalPremiumGivebackQuoteOnlyAlerts,1);
    assert.equal(r.genuinePositionPnLOrStatisticalMultiregimeEdgeProven,false);
    assert.equal(r.brokerNrmlGttNativeStopChildExchangeAckVerified,false);
    assert.equal(r.optimalOneToEightWeekContractRecommended,false);
  });
  it('next-session BID GAP and missing full-duration source cannot imply capital-debit protection',()=>{
    const r=audit(fixture());unverified(r);
    assert.equal(r.originalOvernightGapQuoteOnlyAlerts,16);
    assert.equal(r.completeLongPremiumDebitLossProtectionProven,false);
    assert.equal(r.executionAuthorized,false);
  });
  it('attempted catalogue path duration shorter than 8W is not a valid full-holding audit scope',()=>{
    const f=fixture();
    f.input.policy.maxCalendarDaysPerOriginalOptionPath=55;
    f.repin();
    reject(f,'PHASE69_FULL_OOS_SOURCE_OR_PRESPECIFIED_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
});
