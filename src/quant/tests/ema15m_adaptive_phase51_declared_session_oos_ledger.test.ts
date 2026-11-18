import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase51DeclaredOosSessionCoverage,hashPhase51Evidence,
  type Phase51Input,type Phase51IndependentPins
} from '../../server/engine/ema15m/adaptivePhase51DeclaredSessionOosLedger.js';
import {
  hashPhase50Evidence,
  type Phase50IndependentPins,type Phase50MultifoldInput
} from '../../server/engine/ema15m/adaptivePhase50MultifoldL1AsOf.js';
import {makePhase48SyntheticOosInput}
  from './phase48_synthetic_oos_fixture.js';

const ms=(x:string)=>Date.parse(x);
const iso=(x:number)=>new Date(x).toISOString();
function fixture(){
  const generated=makePhase48SyntheticOosInput('FLAT');
  const historical=generated.input;
  const dates=historical.decisions.map(d=>d.sessionDate);
  historical.executionQuotes.forEach(q=>{
    q.availableAt=iso(ms(q.observedAt)+2000);
  });
  historical.policy.folds=[
    {trainStart:dates[0],trainEnd:dates[0],
      testStart:dates[3],testEnd:dates[3]},
    {trainStart:dates[1],trainEnd:dates[1],
      testStart:dates[4],testEnd:dates[4]}
  ];
  const stage50:Phase50MultifoldInput={
    schemaVersion:'ADAPTIVE_PHASE50_MULTIFOLD_L1_ASOF_V1',
    source:'OFFLINE_OPERATOR_L1_UNVERIFIED',historical
  };
  const stage50Pins:Phase50IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE50_MULTIFOLD_L1_ASOF_PINS_V1',
    expectedStudyDatasetId:historical.provenance.datasetId,
    expectedOriginalHistoricalSha256:'',
    expectedOosSessionManifestSha256:'',
    expectedFoldCount:2,
    expectedOosTestDecisionCount:2,
    expectedOosAttemptCount:24,
    minimumDistinctOosDays:2,
    minimumOosFolds:2,
    minimumObservedEntries:4,
    maximumOriginalL1AvailabilityLagSeconds:30
  };
  const ledgerSessions=dates.map(day=>{
    const s=generated.sessions.find(s=>s.sessionDate===day)!;
    assert.ok(s);
    return {...s};
  });
  const input:Phase51Input={
    schemaVersion:'ADAPTIVE_PHASE51_OOS_SESSION_COVERAGE_V1',
    source:'OFFLINE_UNAUTHENTICATED_OPERATOR_EVIDENCE',
    phase50:stage50,phase50Pins:stage50Pins,
    calendar:{
      schemaVersion:'ADAPTIVE_PHASE51_SESSION_LEDGER_V1',
      source:'OPERATOR_ASSERTED_EXCHANGE_SESSION_UNVERIFIED',
      sessions:ledgerSessions
    }
  };
  const pins:Phase51IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE51_SESSION_OOS_PINS_V1',
    expectedCalendarSha256:'',
    expectedPhase50InputSha256:'',
    expectedPhase50PinsSha256:'',
    expectedDeclaredSessionCount:5,
    expectedOriginalOosManifestSha256:'',
    expectedOriginalOosSessionCount:2,
    minimumOosSessionsPerFold:1
  };
  const repin=()=>{
    const orig:string[]=[];
    historical.policy.folds.forEach((f,i)=>{
      historical.decisions.forEach(d=>{
        if(d.sessionDate>=f.testStart&&d.sessionDate<=f.testEnd)
          orig.push(i+'|'+d.sessionDate+'|'+d.decisionAt);
      });
    });
    stage50Pins.expectedOriginalHistoricalSha256=
      hashPhase50Evidence(historical);
    stage50Pins.expectedOosSessionManifestSha256=hashPhase50Evidence(orig);
    stage50Pins.expectedFoldCount=historical.policy.folds.length;
    stage50Pins.expectedOosTestDecisionCount=orig.length;
    stage50Pins.expectedOosAttemptCount=orig.length*12;
    pins.expectedCalendarSha256=hashPhase51Evidence(input.calendar);
    pins.expectedPhase50InputSha256=hashPhase51Evidence(input.phase50);
    pins.expectedPhase50PinsSha256=hashPhase51Evidence(input.phase50Pins);
    const independent:string[]=[];
    historical.policy.folds.forEach((f,i)=>{
      ledgerSessions.forEach(s=>{
        if(s.sessionDate>=f.testStart&&s.sessionDate<=f.testEnd)
          independent.push(i+'|'+s.sessionDate);
      });
    });
    pins.expectedOriginalOosManifestSha256=
      hashPhase51Evidence(independent);
    pins.expectedOriginalOosSessionCount=independent.length;
    pins.expectedDeclaredSessionCount=ledgerSessions.length;
  };
  repin();
  return {input,pins,repin,dates,ledgerSessions,historical};
}
type Fixture=ReturnType<typeof fixture>;
const run=(f:Fixture)=>auditPhase51DeclaredOosSessionCoverage(f.input,f.pins);
function assertNeverTrade(r:ReturnType<typeof run>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.independentlyAuthenticatedExchangeCalendar,false);
  assert.equal(r.originalLicensedL1IndependentlyAuthenticated,false);
  assert.equal(r.sourceOriginalAvailableAtIndependentlyVerified,false);
  assert.equal(r.independentlyAuthenticatedInstrumentCatalog,false);
  assert.equal(r.unbiasedOosProfitabilityProven,false);
  assert.equal(r.genuineBrokerOrderOrOvernightStopVerified,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
}
function rejected(f:Fixture,reason:string,
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=run(f);assertNeverTrade(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase51 independent session ledger/OOS missing-day audit',()=>{
  it('two synthetic OOS days in two folds reconcile all 24 Phase50 original attempts',()=>{
    const f=fixture(),r=run(f);assertNeverTrade(r);
    assert.equal(r.status,'DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY',
      JSON.stringify(r));
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.declaredCalendarSessions,5);
    assert.equal(r.declaredOosSessions,2);
    assert.equal(r.originalOosDecisions,2);
    assert.equal(r.fullPhase50OosAttemptDenominator,24);
    assert.equal(r.missingOriginalSessions,0);
    assert.equal(r.folds.length,2);
    assert.deepEqual(r.folds.map(x=>x.entryAttemptsRetained),[12,12]);
  });
  it('missing original OOS date stays in independent date-only denominator even after source rehash',()=>{
    const f=fixture();
    const missingDate=f.historical.policy.folds[1].testStart;
    f.historical.decisions=f.historical.decisions.filter(x=>
      x.sessionDate!==missingDate);
    f.historical.provenance.expectedSessions=
      f.historical.provenance.expectedSessions.filter(d=>d!==missingDate);
    f.repin(); // A malicious operator can re-pin Phase50; ledger date remains.
    const r=rejected(f,
      'INDEPENDENT_DECLARED_SESSION_MISSING_FROM_HISTORICAL_SOURCE');
    assert.equal(r.declaredOosSessions,2);
    assert.equal(r.originalOosDecisions,1);
    assert.equal(r.missingOriginalSessions,1);
    assert.equal(r.folds[1].missingOriginalDecisions,1);
  });
  it('decision outside declared OOS session hours fails despite consistent market source bytes',()=>{
    const f=fixture(),s=f.ledgerSessions.at(-1)!;
    const d=f.historical.decisions.at(-1)!;
    d.decisionAt=iso(ms(s.closeAt)+60_000);
    f.repin();
    rejected(f,'OOS_DECISION_OUTSIDE_DECLARED_SESSION');
  });
  it('predecision contract master captured outside declared OOS session fails',()=>{
    const f=fixture(),s=f.ledgerSessions.at(-1)!;
    f.historical.decisions.at(-1)!.contractsCapturedAt=
      iso(ms(s.openAt)-1000);
    f.repin();
    rejected(f,'OOS_ORIGINAL_CONTRACT_CAPTURE_OUTSIDE_SESSION');
  });
  it('operator chain snapshot from preceding session is not contemporaneous OOS evidence',()=>{
    const f=fixture(),s=f.ledgerSessions.at(-1)!;
    f.historical.decisions.at(-1)!.chains[0].capturedAt=
      iso(ms(s.openAt)-1000);
    f.repin();
    rejected(f,'OOS_OPTION_CHAIN_CAPTURE_OUTSIDE_SESSION');
  });
  it('missing entire point-in-time contract and chain universe is not proof of no trades',()=>{
    const f=fixture(),d=f.historical.decisions.at(-1)!;
    d.listedContracts=[];
    d.chains=[];
    f.repin();
    const r=rejected(f,'OOS_ORIGINAL_CONTRACT_OR_CHAIN_UNIVERSE_MISSING');
    assert.equal(r.declaredOosSessions,2);
    assert.equal(r.fullPhase50OosAttemptDenominator,24);
  });
  it('an OOS day without source-available option L1 is not a completed market session',()=>{
    const f=fixture(),d=f.historical.decisions.at(-1)!;
    const s=f.ledgerSessions.at(-1)!;
    const keys=new Set(d.listedContracts.map(c=>c.instrument_key));
    f.historical.executionQuotes=f.historical.executionQuotes.filter(q=>
      !keys.has(q.instrumentKey)||ms(q.observedAt)<ms(d.decisionAt)||
      ms(q.observedAt)>ms(s.closeAt));
    f.repin();
    const r=rejected(f,
      'OOS_SESSION_HAS_NO_ORIGINAL_AVAILABLE_SELECTED_UNIVERSE_L1');
    assert.equal(r.sessionsWithNoOriginalAvailableOptionL1,1);
  });
  it('full Phase50 available-at re-audit blocks original quote clock laundering',()=>{
    const f=fixture(),d=f.historical.decisions.at(-1)!;
    const q=f.historical.executionQuotes.find(x=>
      d.listedContracts.some(c=>c.instrument_key===x.instrumentKey)&&
      ms(x.observedAt)>ms(d.decisionAt))!;
    delete q.availableAt;
    f.repin();
    rejected(f,'FULL_ORIGINAL_PHASE50_OOS_DENOMINATOR_OR_ASOF_GATE_FAILED');
  });
  it('calendar changed after independently pinned snapshot cannot be silently accepted',()=>{
    const f=fixture();
    f.ledgerSessions.at(-1)!.closeAt=iso(
      ms(f.ledgerSessions.at(-1)!.closeAt)-60_000);
    rejected(f,'PRESPECIFIED_ORIGINAL_SOURCE_OR_CALENDAR_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('invalid operator calendar date fails even with forged matching SHA256',()=>{
    const f=fixture();
    f.ledgerSessions.at(-1)!.sessionDate='2026-99-99';
    f.repin();
    rejected(f,'ORIGINAL_CALENDAR_OR_MARKET_DATA_SCHEMA_INVALID',
      'INVALID_EVIDENCE');
  });
  it('one-fold manifest cannot be described as robust unseen OOS coverage',()=>{
    const f=fixture();
    f.historical.policy.folds=f.historical.policy.folds.slice(0,1);
    f.repin();
    rejected(f,'FULL_ORIGINAL_PHASE50_OOS_DENOMINATOR_OR_ASOF_GATE_FAILED');
  });
  it('malformed source quote records fail closed before calendar reconciliation',()=>{
    const f=fixture();
    (f.historical.executionQuotes as unknown as unknown[])[0]=null;
    f.repin();
    rejected(f,'ORIGINAL_MARKET_SOURCE_RECORDS_MALFORMED','INVALID_EVIDENCE');
  });
  it('malformed declared option contract catalog stays incomplete evidence, not no-trade proof',()=>{
    const f=fixture();
    f.historical.decisions.at(-1)!.listedContracts=
      null as never;
    f.repin();
    rejected(f,'OOS_ORIGINAL_CONTRACT_OR_CHAIN_UNIVERSE_MISSING');
  });
  it('independent original date ledger must be preserved, never silently reduced',()=>{
    const f=fixture();
    f.pins.expectedOriginalOosSessionCount=1;
    rejected(f,'ORIGINAL_OOS_FOLD_SESSION_MANIFEST_MISMATCH',
      'INVALID_EVIDENCE');
  });
});
