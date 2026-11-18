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
export function makePhase59SyntheticMatchedFixture(
  variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'
){
  const f=makePhase53SyntheticSignedFixture(variant);
  // Phase46 original top-of-book displayed sizes must be whole option lots.
  f.historical.executionQuotes.forEach(q=>{
    q.bidQty=975;
    q.askQty=975;
  });
  f.repinSource();
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
