import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {reviewPhase76NrmlPaperRisk,
  type Phase76PaperInput,type Phase76PaperQuote,type Phase76PaperReport}
  from '../../server/engine/ema15m/adaptivePhase76NrmlPaperRiskMonitor.js';

const stamp=(m:number,day='2026-11-20')=>
  `${day}T${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00+05:30`;
const quote=(bid:number|null,minute:number,day='2026-11-20',depth=2):Phase76PaperQuote=>({
  source:'MANUAL_OR_SYNTHETIC_PAPER_MARK_NOT_VERIFIED_L1',
  observedAt:stamp(minute,day),receivedAt:stamp(minute,day),
  bestBidPremiumPoints:bid,
  displayedBestBidDepthLots:bid===null?0:depth
});
function setup():Phase76PaperInput {
  return {
    mode:'OFFLINE_NRML_PAPER_RISK_REVIEW_V1',
    evaluationAt:stamp(900),
    position:{source:'HYPOTHETICAL_LONG_OPTION_NOT_BROKER_POSITION',
      instrumentKey:'HYPOTHETICAL_OPTION_1W_CE',horizon:'1W',optionType:'CE',
      enteredAt:stamp(600),assumedExchangeExpiryDateIST:'2026-11-27',
      lotSize:50,lots:1,assumedEntryAskPremiumPoints:100,
      assumedNonRecoverableFeesINR:50},
    policy:{source:'PREREGISTERED_PAPER_ALERT_POLICY_NOT_EXECUTABLE_STOP',
      armGainPremiumPoints:50,givebackAlertPremiumPoints:20,
      targetAlertPremiumPoints:100,minimumConfirmGapSeconds:60,
      minimumBidDepthLotsForIndicativeMark:1,maximumQuoteAgeSeconds:300,
      maximumPaidDebitPlusFeesINR:6000,maximumIndicativeLossINR:3000,
      expiryReviewCalendarDays:2},
    quotes:[]
  };
}
const review=(f:Phase76PaperInput)=>reviewPhase76NrmlPaperRisk(f);
function safe(r:Phase76PaperReport){
  assert.equal(r.mode,'OFFLINE_NRML_PAPER_RISK_REVIEW_V1');
  assert.equal(r.marketSourceAuthenticated,false);
  assert.equal(r.genuineBrokerPositionOrFillVerified,false);
  assert.equal(r.realBrokerStopOrGttAcknowledged,false);
  assert.equal(r.trailingAlertIsNotGuaranteedExit,true);
  assert.equal(r.existingMisIntradaySquareOffUnchanged,true);
  assert.equal(r.forced1515NrmlExit,false);
  assert.equal(r.automaticExpiryRoll,false);
  assert.equal(r.recommendedHorizonOrContract,null);
  assert.equal(r.realizedPnLINR,null);
  assert.equal(r.brokerOrderInstruction,null);
  assert.equal(r.liveExecutionAuthorized,false);
  assert.equal(r.productionSafe,false);
}
function invalid(f:Phase76PaperInput,why:string){
  const r=review(f);safe(r);
  assert.equal(r.status,'INVALID_INPUT');
  assert.deepEqual(r.reasonCodes,[why]);
}
describe('Phase76 offline NRML paper-only holding and premium mark safeguards',()=>{
  it('shows full one-lot paid debit at risk, does not invent a broker position or realized PnL',()=>{
    const f=setup();f.quotes=[quote(120,900)];
    const r=review(f);safe(r);
    assert.equal(r.assumedPaidDebitPlusFeesINR,5050);
    assert.equal(r.maximumLongOptionCashAtRiskINR,5050);
    assert.equal(r.latestIndicativePnLAfterFeesINR,950);
    assert.equal(r.status,'PAPER_MONITOR_ONLY');
    assert.equal(r.hypotheticalTrailAlertPremiumPoints,null);
  });
  it('a single +70 premium spike NEVER arms a paper trail',()=>{
    const f=setup();f.quotes=[quote(170,900)];
    const r=review(f);safe(r);
    assert.equal(r.hypotheticalTrailAlertPremiumPoints,null);
    assert.ok(r.alerts.includes('UNCONFIRMED_PREMIUM_SPIKE_IGNORED'));
  });
  it('two distinct sufficiently spaced quotes are required to confirm trail arming',()=>{
    const f=setup();f.quotes=[quote(170,899),quote(170,900)];
    const r=review(f);safe(r);
    assert.equal(r.confirmedPeakPremiumGainPoints,70);
    assert.equal(r.hypotheticalTrailAlertPremiumPoints,150);
    assert.equal(r.paperConfirmationCount,2);
    assert.equal(r.status,'PAPER_MONITOR_ONLY');
  });
  it('rapid repeated ticks cannot satisfy the minimum confirmation gap',()=>{
    const f=setup();f.policy.minimumConfirmGapSeconds=120;
    f.quotes=[quote(170,899),quote(170,900)];
    const r=review(f);safe(r);
    assert.equal(r.hypotheticalTrailAlertPremiumPoints,null);
    assert.equal(r.paperConfirmationCount,0);
  });
  it('first unconfirmed isolated high is not promoted as ratcheted peak',()=>{
    const f=setup();f.quotes=[quote(190,898),quote(151,900)];
    const r=review(f);safe(r);
    assert.equal(r.confirmedPeakPremiumGainPoints,51);
    assert.equal(r.hypotheticalTrailAlertPremiumPoints,131);
  });
  it('confirmed high water ratchets upward only; price fall triggers review, not sell fill',()=>{
    const f=setup();f.quotes=[quote(160,895),quote(160,896),quote(170,898),quote(120,900)];
    const r=review(f);safe(r);
    assert.equal(r.hypotheticalTrailAlertPremiumPoints,150);
    assert.equal(r.latestIndicativePnLAfterFeesINR,950);
    assert.ok(r.alerts.includes('PRE_TARGET_GIVEBACK_REVIEW'));
    assert.ok(r.alerts.includes('TRAIL_BREACH_REVIEW'));
  });
  it('next-session gap through theoretical trail never books the 150 paper stop level',()=>{
    const f=setup();f.evaluationAt=stamp(600,'2026-11-21');
    f.quotes=[quote(170,898),quote(170,899),quote(10,600,'2026-11-21')];
    const r=review(f);safe(r);
    assert.equal(r.latestIndicativePnLAfterFeesINR,-4550);
    assert.equal(r.hypotheticalTrailAlertPremiumPoints,150);
    assert.ok(r.alerts.includes('OVERNIGHT_GAP_THROUGH_TRAIL_REVIEW'));
    assert.ok(r.alerts.includes('INDICATIVE_LOSS_BUDGET_REVIEW'));
  });
  it('zero BID depth blocks indicative exit marks; only total cash-at-risk remains',()=>{
    const f=setup();f.quotes=[quote(170,898),quote(170,899),quote(null,900)];
    const r=review(f);safe(r);
    assert.equal(r.latestIndicativeBidMarkINR,null);
    assert.equal(r.latestIndicativePnLAfterFeesINR,null);
    assert.equal(r.maximumLongOptionCashAtRiskINR,5050);
    assert.ok(r.alerts.includes('BID_DEPTH_UNAVAILABLE_REVIEW'));
  });
  it('a quote with insufficient displayed depth cannot be treated as full-lot executable',()=>{
    const f=setup();f.policy.minimumBidDepthLotsForIndicativeMark=2;
    f.quotes=[quote(170,898),quote(170,899),quote(150,900,'2026-11-20',1)];
    const r=review(f);safe(r);
    assert.equal(r.latestIndicativePnLAfterFeesINR,null);
    assert.ok(r.alerts.includes('BID_DEPTH_UNAVAILABLE_REVIEW'));
  });
  it('quote stale at 15:15 IST triggers review but NEVER forced NRML squareoff',()=>{
    const f=setup();f.evaluationAt=stamp(915);f.quotes=[quote(170,900)];
    const r=review(f);safe(r);
    assert.equal(r.latestIndicativePnLAfterFeesINR,null);
    assert.ok(r.alerts.includes('STALE_OR_MISSING_QUOTE_REVIEW'));
  });
  it('fees and lot quantity are included in worst-case cash-debit risk',()=>{
    const f=setup();f.position.lots=2;
    const r=review(f);safe(r);
    assert.equal(r.assumedPaidDebitPlusFeesINR,10050);
    assert.ok(r.alerts.includes('PAID_DEBIT_EXCEEDS_BUDGET'));
    assert.ok(r.alerts.includes('FULL_DEBIT_AT_RISK_EXCEEDS_BUDGET'));
  });
  it('premium target mark is an alert only, never an automatic exit',()=>{
    const f=setup();f.quotes=[quote(200,898),quote(201,899),quote(195,900)];
    const r=review(f);safe(r);
    assert.ok(r.alerts.includes('TARGET_MARK_REVIEW_NOT_EXIT'));
    assert.equal(r.realizedPnLINR,null);
  });
  it('expiry approaches, passes, and remains a manual review without roll',()=>{
    const f=setup();f.evaluationAt=stamp(900,'2026-11-26');
    assert.ok(review(f).alerts.includes('EXPIRY_APPROACHING_REVIEW'));
    f.evaluationAt=stamp(900,'2026-11-27');
    assert.ok(review(f).alerts.includes('EXPIRY_DAY_REVIEW'));
    f.evaluationAt=stamp(900,'2026-11-28');
    const r=review(f);safe(r);
    assert.ok(r.alerts.includes('EXPIRY_PASSED_REVIEW'));
  });
  it('2W, 4W and 8W asserted holding horizons are valid but no horizon is recommended',()=>{
    for(const [h,expiry] of [['2W','2026-12-01'],['4W','2026-12-15'],['8W','2027-01-05']] as const){
      const f=setup();f.position.horizon=h;
      f.position.assumedExchangeExpiryDateIST=expiry;
      const r=review(f);safe(r);
      assert.notEqual(r.status,'INVALID_INPUT');
      assert.equal(r.recommendedHorizonOrContract,null);
    }
  });
  it('cannot mislabel next-week expiry as 8W',()=>{
    const f=setup();f.position.horizon='8W';
    invalid(f,'DECLARED_HORIZON_DOES_NOT_MATCH_UNVERIFIED_EXPIRY');
  });
  it('a broker-live or confirmed-fill source label is never admitted',()=>{
    const f=setup();
    (f.position as {source:string}).source='BROKER_FILLED';
    invalid(f,'INVALID_HYPOTHETICAL_POSITION');
  });
  it('future, out-of-order or delayed-causal quote sequence is rejected',()=>{
    const f=setup();f.quotes=[quote(160,900),quote(170,899)];
    invalid(f,'NONCAUSAL_OR_NONMONOTONIC_PAPER_QUOTE');
    const g=setup();g.quotes=[quote(160,901)];
    invalid(g,'NONCAUSAL_OR_NONMONOTONIC_PAPER_QUOTE');
  });
  it('missing quotes fail closed to manual freshness review',()=>{
    const r=review(setup());safe(r);
    assert.equal(r.latestIndicativePnLAfterFeesINR,null);
    assert.ok(r.alerts.includes('STALE_OR_MISSING_QUOTE_REVIEW'));
  });
  it('zero-depth with invented positive price cannot authorize any indicative fill',()=>{
    const f=setup();f.quotes=[quote(170,900,'2026-11-20',0)];
    const r=review(f);safe(r);
    assert.equal(r.latestIndicativeBidMarkINR,null);
    assert.ok(r.alerts.includes('BID_DEPTH_UNAVAILABLE_REVIEW'));
  });
});
