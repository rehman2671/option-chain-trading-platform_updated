import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase50MultifoldL1AsOfCoverage,hashPhase50Evidence,
  type Phase50MultifoldInput,type Phase50IndependentPins
} from '../../server/engine/ema15m/adaptivePhase50MultifoldL1AsOf.js';
import {buildAdaptiveEntryFirstCohort}
  from '../../server/engine/ema15m/adaptiveEntryFirstCohort.js';
import {makePhase48SyntheticOosInput}
  from './phase48_synthetic_oos_fixture.js';

const ms=(s:string)=>Date.parse(s);
const iso=(n:number)=>new Date(n).toISOString();
function fixture(){
  const original=makePhase48SyntheticOosInput('FLAT');
  const historical=original.input;
  historical.executionQuotes.forEach(q=>{
    q.availableAt=iso(ms(q.observedAt)+2000);
  });
  const dates=historical.decisions.map(x=>x.sessionDate);
  // Two separate chronological untouched test days; each train/test
  // separation exceeds the source's 1D hold + 1D exit embargo.
  historical.policy.folds=[
    {trainStart:dates[0],trainEnd:dates[0],
      testStart:dates[3],testEnd:dates[3]},
    {trainStart:dates[1],trainEnd:dates[1],
      testStart:dates[4],testEnd:dates[4]}
  ];
  const input:Phase50MultifoldInput={
    schemaVersion:'ADAPTIVE_PHASE50_MULTIFOLD_L1_ASOF_V1',
    source:'OFFLINE_OPERATOR_L1_UNVERIFIED',historical
  };
  const pins:Phase50IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE50_MULTIFOLD_L1_ASOF_PINS_V1',
    expectedStudyDatasetId:historical.provenance.datasetId,
    expectedOriginalHistoricalSha256:'',
    expectedOosSessionManifestSha256:'',
    expectedFoldCount:2,expectedOosTestDecisionCount:2,
    expectedOosAttemptCount:24,minimumDistinctOosDays:2,
    minimumOosFolds:2,minimumObservedEntries:4,
    maximumOriginalL1AvailabilityLagSeconds:30
  };
  const repin=()=>{
    const manifest:string[]=[];
    historical.policy.folds.forEach((f,i)=>{
      historical.decisions.forEach(d=>{
        if(d.sessionDate>=f.testStart&&d.sessionDate<=f.testEnd)
          manifest.push(i+'|'+d.sessionDate+'|'+d.decisionAt);
      });
    });
    pins.expectedOriginalHistoricalSha256=hashPhase50Evidence(historical);
    pins.expectedOosSessionManifestSha256=hashPhase50Evidence(manifest);
    pins.expectedFoldCount=historical.policy.folds.length;
    pins.expectedOosTestDecisionCount=manifest.length;
    pins.expectedOosAttemptCount=manifest.length*12;
  };
  repin();
  const entries=()=>buildAdaptiveEntryFirstCohort(historical).attempts;
  const first=()=>entries().find(x=>x.arm==='EMA_BASELINE'&&
    x.horizon==='1W'&&x.disposition==='ENTRY_OBSERVED')!;
  const quotes=()=>historical.executionQuotes.filter(x=>
    x.instrumentKey===first().instrumentKey&&
    ms(x.observedAt)>ms(first().decisionAt)&&
    ms(x.observedAt)<=ms(first().decisionAt)+10*60_000);
  return {input,pins,repin,entries,first,quotes};
}
type Fixture=ReturnType<typeof fixture>;
const run=(f:Fixture)=>auditPhase50MultifoldL1AsOfCoverage(f.input,f.pins);
function unsafe(r:ReturnType<typeof run>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.originalLicensedL1IndependentlyAuthenticated,false);
  assert.equal(r.vendorHistoricalLicenseIndependentlyVerified,false);
  assert.equal(r.trueOriginalAvailableAtVerified,false);
  assert.equal(r.unbiasedMultiFoldProfitabilityProven,false);
  assert.equal(r.brokerStopAckOrOvernightProtectionVerified,false);
  assert.equal(r.originalContractAndCalendarIndependentlyAuthenticated,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'),
    'Original instrument identifiers must not appear in summary');
}
function denied(f:Fixture,reason:string,
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=run(f);unsafe(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase50 offline OOS multi-fold source-available option L1 audit',()=>{
  it('two original OOS folds keep 3 arms x 4 horizons x 2 test decisions and shared quote dedup',()=>{
    const f=fixture(),r=run(f);unsafe(r);
    assert.equal(r.status,'DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY',
      JSON.stringify(r));
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.oosFoldCount,2);
    assert.equal(r.distinctOosSessionDays,2);
    assert.equal(r.totalDecisionArmHorizonAttempts,24);
    assert.equal(r.foldArmHorizonCells.length,24);
    assert.equal(r.foldArmHorizonCells.reduce((n,c)=>n+c.decisionAttempts,0),24);
    assert.ok(r.originalObservedEntryAttempts>=4);
    assert.equal(r.missingOriginalSelectedContractEntries,0);
    assert.equal(r.originalObservedEntryAttempts,r.exactSourceAvailableEntryAttempts);
    assert.ok(r.uniqueExactSourceAvailableQuoteObservations<=r.exactSourceAvailableEntryAttempts);
    assert.equal(r.overlappingArmReferencesToSameQuote,
      r.exactSourceAvailableEntryAttempts-r.uniqueExactSourceAvailableQuoteObservations);
  });
  it('one cherry-picked OOS fold never earns even descriptive multi-fold status',()=>{
    const f=fixture();
    f.input.historical.policy.folds=f.input.historical.policy.folds.slice(0,1);
    f.repin();
    const r=denied(f,'INSUFFICIENT_DISTINCT_OOS_FOLDS_OR_DAYS');
    assert.equal(r.totalDecisionArmHorizonAttempts,12);
    assert.equal(r.oosFoldCount,1);
  });
  it('original missing source L1 stays a missing selected contract, not a zero return',()=>{
    const f=fixture(),selected=f.first();
    f.input.historical.executionQuotes=
      f.input.historical.executionQuotes.filter(q=>
        q.instrumentKey!==selected.instrumentKey||
        ms(q.observedAt)<=ms(selected.decisionAt)||
        ms(q.observedAt)>ms(selected.decisionAt)+10*60_000);
    f.repin();
    const r=denied(f,'SELECTED_ORIGINAL_OPTION_ENTRY_L1_MISSING');
    assert.equal(r.totalDecisionArmHorizonAttempts,24);
    assert.ok(r.missingOriginalSelectedContractEntries>=1);
  });
  it('any source quote missing availableAt cannot be rescued by a later favorable quote',()=>{
    const f=fixture(),q=f.quotes()[0];
    delete q.availableAt;
    f.repin();
    const r=denied(f,'SELECTED_OPTION_ORIGINAL_L1_CLOCK_MISSING_OR_INVALID');
    assert.ok(r.originalSourceClockInvalidOrUnknown>0);
    assert.equal(r.totalDecisionArmHorizonAttempts,24);
  });
  it('retroactive source-availability clock rejects rather than guessing fills',()=>{
    const f=fixture(),q=f.quotes()[0];
    q.availableAt=iso(ms(q.observedAt)-1000);
    f.repin();
    denied(f,'SELECTED_OPTION_ORIGINAL_L1_CLOCK_MISSING_OR_INVALID');
  });
  it('entry event first is NOT necessarily entry first available; reject event-time look-ahead',()=>{
    const f=fixture(),selected=f.first(),q=f.quotes()[0];
    // Existing event-first entry is delayed 20s. Later event+3s
    // reaches the operator first, so event-ordered Phase8 selection is not
    // a time-safe, actually available original L1 selection.
    q.availableAt=iso(ms(q.observedAt)+20000);
    const event=ms(q.observedAt)+3000;
    f.input.historical.executionQuotes.push({
      instrumentKey:selected.instrumentKey,
      observedAt:iso(event),availableAt:iso(event+100),
      bid:q.bid,ask:q.ask+1,bidQty:q.bidQty,askQty:q.askQty
    });
    f.repin();
    const r=denied(f,'EVENT_ORDER_DIFFERS_FROM_SOURCE_AVAILABLE_ENTRY_ORDER');
    assert.ok(r.originalAvailabilityOrderDisagreements>0);
  });
  it('observed entry that only becomes source-available after deadline cannot count',()=>{
    const f=fixture(),selected=f.first();
    f.pins.maximumOriginalL1AvailabilityLagSeconds=1200;
    const deadline=ms(selected.decisionAt)+11*60_000;
    f.quotes().forEach(q=>{q.availableAt=iso(deadline);});
    f.repin();
    const r=denied(f,'SELECTED_OPTION_ENTRY_NOT_AVAILABLE_BY_DEADLINE');
    assert.ok(r.entryUnavailableAtDecisionDeadline>0);
  });
  it('tampered original historical bytes fail pinned source identity before audit',()=>{
    const f=fixture();
    f.quotes()[0].availableAt=iso(ms(f.quotes()[0].observedAt)+3000);
    denied(f,'EXACT_ORIGINAL_SOURCE_OR_PRESPECIFIED_PINS_INVALID','INVALID_EVIDENCE');
  });
  it('tampering originally declared OOS test sessions cannot hide exclusions',()=>{
    const f=fixture();
    f.pins.expectedOosTestDecisionCount=1;
    f.pins.expectedOosAttemptCount=12;
    denied(f,'PRESPECIFIED_OOS_FOLD_OR_SESSION_MANIFEST_CHANGED','INVALID_EVIDENCE');
  });
  it('source-available join does not imply authentic vendor entitlement or market performance',()=>{
    const f=fixture(),r=run(f);unsafe(r);
    assert.equal(r.status,'DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY');
    assert.ok(r.warnings.some(w=>w.includes('NOT_PROFITABILITY')));
  });
});
