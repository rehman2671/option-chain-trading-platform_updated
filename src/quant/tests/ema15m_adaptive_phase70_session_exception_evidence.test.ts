import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase70ExchangeDayExceptions,type Phase70Report
} from '../../server/engine/ema15m/adaptivePhase70SessionExceptionEvidence.js';
import {makePhase70SyntheticExchangeDayFixture}
  from './phase70_synthetic_exchange_day_fixture.js';

const fixture=makePhase70SyntheticExchangeDayFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase70ExchangeDayExceptions(f.input,f.pins);
function noOfficialProof(r:Phase70Report){
  assert.equal(r.independentlyAuthenticatedOfficialExchangeHolidayEvidence,false);
  assert.equal(r.independentlyAuthenticatedSpecialSessionPublisher,false);
  assert.equal(r.allegedHolidayNeverConfirmsExchangeWasClosed,true);
  assert.equal(r.fullOriginalHoldingQuoteSourceCensoredUntilActualDataVerified,true);
  assert.equal(r.genuineHistoricalOptionDataLicenseVerified,false);
  assert.equal(r.historicalClientSourceAvailableAtIndependentlyVerified,false);
  assert.equal(r.genuineOosRegimeProfitabilityProven,false);
  assert.equal(r.observedBidAndAskAreActualBrokerFills,false);
  assert.equal(r.fullPaidLongOptionPremiumDebitLossEliminated,false);
  assert.equal(r.optimalOneToEightWeekExpiryAuthorized,false);
  assert.equal(r.nrmlGttStopExchangeChildAckVerified,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD_'));
  for(const c of r.cells){
    assert.equal(c.allClosureClassificationIsUnverified,true);
    assert.equal(c.declaredOpeningQuoteIsNotExecutionFill,true);
  }
}
function rejected(f:F,reason:string,
  status:Phase70Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);noOfficialProof(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
function day(f:F,s:string){
  const x=f.archive.days.find(r=>r.sessionDate===s);
  assert.ok(x);return x;
}
function setOpen(f:F,s:string,special=false){
  const x=day(f,s);
  x.status=special?'SPECIAL_WEEKEND_OPEN':'REGULAR_OPEN';
  x.openAt=s+'T03:45:00.000Z';
  x.closeAt=s+'T10:00:00.000Z';
  f.updateArchive();f.repin();
}
describe('Phase70 independent FILE, NOT independently authenticated original exchange day notices',()=>{
  it('all 32 original listed 1W–8W CE/PE contracts retain missing weekdays classified only as fake claimed holidays',()=>{
    const f=fixture(),r=audit(f);noOfficialProof(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_CLOSED_DAY_EXCEPTIONS_UNVERIFIED_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase69Status,'DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisions,4);
    assert.equal(r.originalNoEntryDays,2);
    assert.equal(r.originalAllListedCePePairs,32);
    assert.equal(r.matchedOriginalEntryNextSessionDecisions,4);
    assert.ok(r.sourceClaimedCalendarDays>=100);
    assert.ok(r.missingWeekdayContractSlotsFromPhase69>32);
    assert.equal(r.missingRegularOpenExchangeLikeCalendarContractSlots,0);
    assert.equal(r.claimedHolidayContractSlots,
      r.missingWeekdayContractSlotsFromPhase69);
    assert.equal(r.claimedEmergencyClosureContractSlots,0);
    assert.equal(r.claimedClosureNotKnownAtOriginalDecisionSlots,0);
    assert.equal(r.remainingUnclassifiedWeekdayContractSlots,0);
    assert.equal(r.cells.length,16);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalListedPairs,0),32);
    assert.equal(r.cells.reduce((n,c)=>n+c.originalNoEntryPairs,0),16);
  });
  it('owner-created holiday papers never prove a genuine market holiday, licence or a profitable 8W expiry',()=>{
    const r=audit(fixture());noOfficialProof(r);
    assert.equal(r.independentlyAuthenticatedOfficialExchangeHolidayEvidence,
      false);
    assert.ok(r.externalEvidenceRequired.some(x=>x.includes('ISSUER')));
    assert.equal(r.optimalOneToEightWeekExpiryAuthorized,false);
  });
  it('a third calendar saying OPEN on a weekday omitted by BOTH old calendars remains a source acquisition gap',()=>{
    const f=fixture();
    setOpen(f,'2026-03-02');
    const r=audit(f);noOfficialProof(r);
    assert.equal(r.status,
      'DESCRIPTIVE_UNDECLARED_OPEN_SOURCE_SESSION_GAPS_ONLY',
      JSON.stringify(r));
    assert.ok(r.missingRegularOpenExchangeLikeCalendarContractSlots>0);
    assert.ok(r.remainingUnclassifiedWeekdayContractSlots>0);
    assert.equal(r.independentlyAuthenticatedOfficialExchangeHolidayEvidence,
      false);
  });
  it('coordinated deletion of a full quoted weekday in BOTH source calendars still conflicts with independently frozen third OPEN day',()=>{
    const f=fixture();
    f.previous.fillEveryPotentialWeekdayAndClosingBid();
    f.rebuild();f.updateArchive();f.repin();
    let r=audit(f);noOfficialProof(r);
    assert.equal(r.status,'DESCRIPTIVE_INTERNAL_CALENDAR_RECONCILIATION_UNVERIFIED_ONLY',
      JSON.stringify(r));
    f.previous.jointlyDeleteQuotedSession('2026-03-02');
    f.repin();
    r=audit(f);noOfficialProof(r);
    assert.equal(r.phase69Status,'DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY');
    assert.equal(r.status,
      'DESCRIPTIVE_UNDECLARED_OPEN_SOURCE_SESSION_GAPS_ONLY',JSON.stringify(r));
    assert.ok(r.missingRegularOpenExchangeLikeCalendarContractSlots>0);
  });
  it('an operator fabricated all weekdays and all historical BID marks and pinned a matching third archive still proves no issuer identity',()=>{
    const f=fixture();
    f.previous.fillEveryPotentialWeekdayAndClosingBid();
    f.rebuild();f.updateArchive();f.repin();
    const r=audit(f);noOfficialProof(r);
    assert.equal(r.status,'DESCRIPTIVE_INTERNAL_CALENDAR_RECONCILIATION_UNVERIFIED_ONLY');
    assert.equal(r.phase69Status,
      'DESCRIPTIVE_NO_DETECTED_WEEKDAY_GAPS_BUT_SOURCE_UNVERIFIED');
    assert.equal(r.missingWeekdayContractSlotsFromPhase69,0);
    assert.equal(r.claimedHolidayContractSlots,0);
    assert.equal(r.missingRegularOpenExchangeLikeCalendarContractSlots,0);
  });
  it('all original weekdays require a separately pinned daily record, even after repinning a truncated fake archive',()=>{
    const f=fixture();
    f.archive.days.splice(15,1);
    f.pins.expectedArchiveCalendarDays--;
    f.updateArchive();f.repin();
    rejected(f,'PHASE70_ARCHIVE_DOES_NOT_COVER_COMPLETE_OOS_EXPIRY_SPAN');
  });
  it('original fake calendar OPEN cannot be falsely relabeled HOLIDAY_CLOSED to censor losing next-open quotes',()=>{
    const f=fixture(),x=day(f,'2026-02-11');
    x.status='HOLIDAY_CLOSED';
    delete x.openAt;delete x.closeAt;
    f.updateArchive();f.repin();
    rejected(f,'PHASE70_CLAIMED_CLOSED_DAY_CONTRADICTS_TRADING_SESSION');
  });
  it('claimed issuer holiday record received after original OOS entry date is never retroactively known at that earlier decision',()=>{
    const f=fixture(),x=day(f,'2026-03-02');
    x.claimedNoticePublishedAt='2026-02-20T00:00:00.000Z';
    x.claimedNoticeReceivedAt='2026-02-20T00:01:00.000Z';
    f.updateArchive();f.repin();
    const r=audit(f);noOfficialProof(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_CLOSED_DAY_EXCEPTIONS_UNVERIFIED_ONLY');
    assert.ok(r.claimedClosureNotKnownAtOriginalDecisionSlots>0);
    assert.ok(r.reasonCodes.includes(
      'SOME_CLAIMED_CLOSURES_NOT_KNOWN_AT_ORIGINAL_ENTRY_DECISION'));
  });
  it('a purported holiday notice first received AFTER that closure day itself is noncausal and rejected',()=>{
    const f=fixture(),x=day(f,'2026-03-02');
    x.claimedNoticePublishedAt='2026-03-03T00:00:00.000Z';
    x.claimedNoticeReceivedAt='2026-03-03T00:01:00.000Z';
    f.updateArchive();f.repin();
    rejected(f,'PHASE70_UNSORTED_INCOMPLETE_DAY_OR_NOTICE_CLOCK_INVALID');
  });
  it('a Saturday cannot masquerade as an ordinary Monday–Friday session',()=>{
    const f=fixture();
    setOpen(f,'2026-02-14',false);
    rejected(f,'PHASE70_UNSORTED_INCOMPLETE_DAY_OR_NOTICE_CLOCK_INVALID');
  });
  it('a separately claimed SPECIAL WEEKEND OPEN missing from original vendor is not silently treated as ordinary weekend closure',()=>{
    const f=fixture();
    setOpen(f,'2026-02-14',true);
    const r=audit(f);noOfficialProof(r);
    assert.equal(r.status,'DESCRIPTIVE_UNDECLARED_OPEN_SOURCE_SESSION_GAPS_ONLY',
      JSON.stringify(r));
    assert.ok(r.missingSpecialWeekendOpenSourceContractSlots>0);
    assert.equal(r.missingRegularOpenExchangeLikeCalendarContractSlots,0);
  });
  it('a legitimately DECLARED Saturday special session remains a source BID/depth acquisition requirement, not an automatic broker fill',()=>{
    const f=fixture();
    f.previous.addWeekendSessionWithoutQuotes('2026-02-14');
    f.rebuild();f.updateArchive();f.repin();
    const r=audit(f);noOfficialProof(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_CLOSED_DAY_EXCEPTIONS_UNVERIFIED_ONLY',
      JSON.stringify(r));
    assert.ok(r.explicitlyDeclaredWeekendSpecialSessionContractSlots>0);
    assert.equal(r.missingSpecialWeekendOpenSourceContractSlots,0);
    assert.equal(r.observedBidAndAskAreActualBrokerFills,false);
  });
  it('a claimed emergency closure counts separately from alleged holiday and is still not official evidence',()=>{
    const f=fixture(),x=day(f,'2026-03-02');
    x.status='EMERGENCY_CLOSED';
    f.updateArchive();f.repin();
    const r=audit(f);noOfficialProof(r);
    assert.ok(r.claimedEmergencyClosureContractSlots>0);
    assert.ok(r.claimedHolidayContractSlots<
      r.missingWeekdayContractSlotsFromPhase69);
    assert.equal(r.allegedHolidayNeverConfirmsExchangeWasClosed,true);
  });
  it('forged third exchange document bytes fail independently frozen SHA before calendar classification',()=>{
    const f=fixture();
    const b=Buffer.from(f.input.separatelySuppliedClaimedExchangeDayArchiveBase64,
      'base64');b[15]^=7;
    f.input.separatelySuppliedClaimedExchangeDayArchiveBase64=
      b.toString('base64');
    rejected(f,'PHASE70_SEPARATE_CLAIMED_EXCHANGE_DAY_BYTES_CHANGED',
      'INVALID_EVIDENCE');
  });
  it('claimed issuer reference cannot silently substitute another exchange in separately supplied calendar',()=>{
    const f=fixture();
    f.archive.claimedIssuerReference='FAKE_OTHER_EXCHANGE_ISSUER';
    f.pins.expectedClaimedIssuerReference=
      'FAKE_OTHER_EXCHANGE_ISSUER';
    f.updateArchive();f.repin();
    rejected(f,'PHASE70_THIRD_CLAIMED_ISSUER_ID_DIFFERS_FROM_SOURCE');
  });
  it('no-entry source denominator cannot be reclassified into fictitious profitable broker positions',()=>{
    const f=fixture();
    f.pins.expectedOriginalNoEntryDays=1;
    rejected(f,'PHASE69_FULL_ORIGINAL_OOS_SOURCE_OR_COUNTS_NOT_READY');
  });
  it('a posthoc pinned research calendar policy is not an official supplier entitlement or fully observed multi-regime return',()=>{
    const f=fixture(),r=audit(f);noOfficialProof(r);
    assert.equal(r.genuineOosRegimeProfitabilityProven,false);
    assert.equal(r.fullPaidLongOptionPremiumDebitLossEliminated,false);
    assert.equal(r.nrmlGttStopExchangeChildAckVerified,false);
  });
});
