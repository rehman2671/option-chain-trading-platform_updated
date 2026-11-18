import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase58MatchedOriginalExitAvailability,hashPhase58Evidence,
  type Phase58Input,type Phase58IndependentPins
} from '../../server/engine/ema15m/adaptivePhase58MatchedExitAsOf.js';
import {type Phase57Input,type Phase57IndependentPins,
  hashPhase57Evidence} from
  '../../server/engine/ema15m/adaptivePhase57RegimeHorizonDebitRisk.js';
import type {AdaptiveExitReplayPolicy} from
  '../../server/engine/ema15m/adaptivePositionalExitReplay.js';
import {makePhase53SyntheticSignedFixture} from
  './phase53_synthetic_signed_document_fixture.js';

const DAY=86400000,MINUTE=60000;
const iso=(n:number)=>new Date(n).toISOString();
function fixture(){
  const f=makePhase53SyntheticSignedFixture();
  const risk:Phase57Input={
    schemaVersion:'ADAPTIVE_PHASE57_OFFLINE_REGIME_DEBIT_AUDIT_V1',
    source:'OFFLINE_OPERATOR_MARKET_DATA_UNVERIFIED',
    phase51:f.phase51,phase51Pins:f.phase51Pins,
    policy:{
      schemaVersion:'ADAPTIVE_PHASE57_REGIME_HORIZON_DEBIT_ENVELOPE_V1',
      source:'PREREGISTERED_OFFLINE_RISK_BUDGET_UNVERIFIED',
      premiumDrawdownFractions:[.25,.5,.75,1],
      horizonRules:{
        '1W':{maximumSingleEntryDebitPlusFeesINR:8000,
          assumedNonRecoverableEntryAndExitCostsINR:100},
        '2W':{maximumSingleEntryDebitPlusFeesINR:9000,
          assumedNonRecoverableEntryAndExitCostsINR:100},
        '4W':{maximumSingleEntryDebitPlusFeesINR:10000,
          assumedNonRecoverableEntryAndExitCostsINR:100},
        '8W':{maximumSingleEntryDebitPlusFeesINR:11000,
          assumedNonRecoverableEntryAndExitCostsINR:100}
      },
      maximumCombinedFourHorizonDebitPerArmPerOosDecisionINR:40000,
      minimumOosSessionsForAnyRegimeComparison:2,
      minimumDistinctObservedRegimesForCrossRegimeClaim:2
    }
  };
  const riskPins:Phase57IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE57_REGIME_DEBIT_PRESPECIFICATION_V1',
    expectedPhase51InputSha256:'',
    expectedPhase51PinsSha256:'',
    expectedRiskPolicySha256:'',
    expectedOriginalOosSessionManifestSha256:'',
    expectedOosSessions:2,expectedFullArmHorizonAttempts:24
  };
  const repinRisk=()=>{
    riskPins.expectedPhase51InputSha256=hashPhase57Evidence(risk.phase51);
    riskPins.expectedPhase51PinsSha256=hashPhase57Evidence(risk.phase51Pins);
    riskPins.expectedRiskPolicySha256=hashPhase57Evidence(risk.policy);
    riskPins.expectedOriginalOosSessionManifestSha256=
      f.phase51Pins.expectedOriginalOosManifestSha256;
  };
  repinRisk();
  const exitPolicy:AdaptiveExitReplayPolicy={
    schemaVersion:'ADAPTIVE_OPTION_EXIT_REPLAY_V1',
    horizonRules:{
      '1W':{initialStopFraction:.2,trailActivationFraction:.2,
        trailingGivebackFraction:.1,maxHoldCalendarDays:2},
      '2W':{initialStopFraction:.2,trailActivationFraction:.2,
        trailingGivebackFraction:.1,maxHoldCalendarDays:2},
      '4W':{initialStopFraction:.2,trailActivationFraction:.2,
        trailingGivebackFraction:.1,maxHoldCalendarDays:2},
      '8W':{initialStopFraction:.2,trailActivationFraction:.2,
        trailingGivebackFraction:.1,maxHoldCalendarDays:2}
    },
    minQuotesPerDeclaredSession:2,minIntermediateQuotes:2,
    maxSameSessionQuoteGapMinutes:15,maxTriggerToNextQuoteMinutes:6
  };
  const input:Phase58Input={
    schemaVersion:'ADAPTIVE_PHASE58_ORIGINAL_HOLD_PATH_ASOF_JOIN_V1',
    source:'OFFLINE_UNVERIFIED_L1_HOLD_PATH_ARCHIVE',
    phase57:risk,phase57Pins:riskPins,exitPolicy,
    exitSessions:[...f.phase51.calendar.sessions]
  };
  const last=f.phase51.calendar.sessions.at(-1)!;
  const next=Date.parse(last.sessionDate+'T00:00:00Z')+DAY;
  input.exitSessions.push({
    sessionDate:iso(next).slice(0,10),
    openAt:iso(next+225*MINUTE),
    closeAt:iso(next+600*MINUTE),
    sourceRecordId:'SYNTHETIC_CAL_NEXT_EXIT'
  });
  const pins:Phase58IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE58_HOLD_PATH_ASOF_AND_EXIT_PINS_V1',
    expectedPhase57InputSha256:'',
    expectedPhase57PinsSha256:'',
    expectedExitPolicySha256:'',
    expectedExitSessionLedgerSha256:'',
    expectedOosSessionCount:2,
    expectedFullOosArmHorizonAttempts:24,
    maximumOriginalQuoteEventToAvailabilitySeconds:30
  };
  const repin=()=>{
    pins.expectedPhase57InputSha256=hashPhase58Evidence(input.phase57);
    pins.expectedPhase57PinsSha256=hashPhase58Evidence(input.phase57Pins);
    pins.expectedExitPolicySha256=hashPhase58Evidence(input.exitPolicy);
    pins.expectedExitSessionLedgerSha256=hashPhase58Evidence(input.exitSessions);
  };
  repin();
  return {f,risk,riskPins,input,pins,repin,repinRisk,
    repinSourceAndAll:()=>{f.repinSource();repinRisk();repin();}};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase58MatchedOriginalExitAvailability(f.input,f.pins);
function unsafe(r:ReturnType<typeof audit>){
  assert.equal(r.liveNrmlOrderAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.brokerMarketOrderFillOrStopAckVerified,false);
  assert.equal(r.stopTriggerGuaranteedToLimitLoss,false);
  assert.equal(r.originalLicensedOptionL1Authenticated,false);
  assert.equal(r.independentlyVerifiedSessionExpiryCalendar,false);
  assert.equal(r.vendorSourceAvailableAtAuthenticated,false);
  assert.equal(r.historicalReturnForecastOrProfitableRankingProven,false);
  assert.equal(r.genuineIvThetaVegaRiskDecompositionVerified,false);
  assert.equal(r.originalUnpricedPathsNotAssumedToBeZero,true);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
}
function denied(f:F,reason:string,
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=audit(f);unsafe(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase58 original OOS next-BID exit source availability vs four horizon debit',()=>{
  it('joins all 24 decisions to original Phase8 and risk, only one observed regime',()=>{
    const f=fixture(),r=audit(f);unsafe(r);
    assert.equal(r.status,'DESCRIPTIVE_SINGLE_REGIME_EXIT_RISK_ONLY',
      JSON.stringify(r));
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosSessions,2);
    assert.equal(r.fullOriginalArmHorizonAttempts,24);
    assert.ok(r.observedOriginalEntries>0);
    assert.equal(r.fullyAvailabilityAuditedAndPricedExitEntries,
      r.observedOriginalEntries);
    assert.equal(r.censoredOrUnpricedExitEntries,0);
    assert.equal(r.invalidOrNoncausalOriginalQuoteAvailabilityPaths,0);
    assert.equal(r.missingOriginalSelectedEntryL1Attempts,0);
    assert.equal(r.cells.reduce((n,c)=>
      n+c.allOriginalOosDecisionAttempts,0),24);
    for(const c of r.cells){
      assert.equal(c.alternativeArmNotAnIndependentFill,true);
      assert.equal(c.fullPremiumDebitIsAtRiskEvenWithStop,true);
      if(c.originalObservedEntries>0){
        assert.ok(c.originalPremiumDebitPlusAssumedFeesINR>0);
        assert.notEqual(c.originalExitNextBidHypotheticalPnlINR,null);
      }
    }
  });
  it('removing the final source session even with an updated calendar pin censors the held exit',()=>{
    const f=fixture();
    f.input.exitSessions.pop();
    f.repin();
    const r=denied(f,'ORIGINAL_EXIT_PATH_OR_SOURCE_AVAILABILITY_UNPRICED');
    assert.ok(r.censoredOrUnpricedExitEntries>0);
    assert.ok(r.cells.some(c=>c.originalExitNextBidHypotheticalPnlINR===null));
  });
  it('source availableAt on an original future path quote is mandatory, not exchange event timestamp alone',()=>{
    const f=fixture(),d=f.f.historical.decisions.at(-1)!;
    const q=f.f.historical.executionQuotes.find(x=>
      x.instrumentKey===d.listedContracts[0].instrument_key&&
      Date.parse(x.observedAt)>Date.parse(d.decisionAt)+40*MINUTE)!;
    assert.ok(q);
    delete q.availableAt;
    f.repinSourceAndAll();
    const r=audit(f);unsafe(r);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE',JSON.stringify(r));
    assert.ok(r.invalidOrNoncausalOriginalQuoteAvailabilityPaths>0||
      r.reasonCodes.includes('PHASE57_ORIGINAL_REGIME_AND_ENTRY_RISK_SOURCE_INCOMPLETE'));
  });
  it('future quote delivery latency cannot be relabeled as timely next-BID exit',()=>{
    const f=fixture(),d=f.f.historical.decisions.at(-1)!;
    const q=f.f.historical.executionQuotes.find(x=>
      x.instrumentKey===d.listedContracts[0].instrument_key&&
      Date.parse(x.observedAt)>Date.parse(d.decisionAt)+40*MINUTE)!;
    q.availableAt=iso(Date.parse(q.observedAt)+300*1000);
    f.repinSourceAndAll();
    const r=audit(f);unsafe(r);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE',JSON.stringify(r));
  });
  it('an altered risk budget without independent prespecification fails even if exit prices unchanged',()=>{
    const f=fixture();
    f.risk.policy.horizonRules['1W'].maximumSingleEntryDebitPlusFeesINR=1000;
    f.repin();
    denied(f,'PHASE57_ORIGINAL_REGIME_AND_ENTRY_RISK_SOURCE_INCOMPLETE');
  });
  it('original selected entry debit budget breach carries through to same exit cohort, not a trade',()=>{
    const f=fixture();
    f.risk.policy.horizonRules['1W'].maximumSingleEntryDebitPlusFeesINR=1000;
    f.repinRisk();f.repin();
    const r=denied(f,'PHASE57_PREDECLARED_FULL_DEBIT_CASH_BUDGET_BREACH',
      'DESCRIPTIVE_LONG_PREMIUM_RISK_ALERT_ONLY');
    assert.equal(r.fullyAvailabilityAuditedAndPricedExitEntries,
      r.observedOriginalEntries);
  });
  it('missing original OOS decision stays missing despite re-pinning original historical source',()=>{
    const f=fixture(),missing=f.f.historical.policy.folds[1].testStart;
    f.f.historical.decisions=f.f.historical.decisions.filter(d=>
      d.sessionDate!==missing);
    f.f.historical.provenance.expectedSessions=
      f.f.historical.provenance.expectedSessions.filter(d=>d!==missing);
    f.repinSourceAndAll();
    denied(f,'PHASE57_ORIGINAL_REGIME_AND_ENTRY_RISK_SOURCE_INCOMPLETE');
  });
  it('changed original exit replay policy cannot be quietly optimized after OOS study was fixed',()=>{
    const f=fixture();
    f.input.exitPolicy.horizonRules['8W'].initialStopFraction=.5;
    denied(f,'PHASE58_FROZEN_SOURCE_EXIT_POLICY_OR_EXTENDED_CALENDAR_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('no live NRML, stop fill, profitability or genuine IV/theta conclusion can arise from a synthetic path',()=>{
    unsafe(audit(fixture()));
  });
});
