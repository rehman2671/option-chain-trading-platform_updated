import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase48OosEntryRiskCoverage,hashPhase48Evidence,
  type Phase48EntryRiskJoinInput,type Phase48IndependentPins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase48OosRiskJoin.js';
import {
  buildAdaptiveEntryFirstCohort
} from '../../server/engine/ema15m/adaptiveEntryFirstCohort.js';
import {
  hashPhase46GapEvidence,
  type Phase46GapStressInput,type Phase46GapStressPins,
  type Phase46GapStressPolicy,type Phase46IndexOptionGapPath,
  type Phase46OriginalL1Snapshot
} from '../../server/engine/ema15m/adaptiveUpstoxPhase46LongOptionGapRisk.js';
import {
  hashPhase47GreekEvidence,
  type Phase47GreekRiskInput,type Phase47GreekRiskPolicy,
  type Phase47IndependentPins,
  type Phase47GreekGapPath
} from '../../server/engine/ema15m/adaptiveUpstoxPhase47FrozenGreekGapResidual.js';
import {makePhase48SyntheticOosInput}
  from './phase48_synthetic_oos_fixture.js';

type H='1W'|'2W'|'4W'|'8W';
const horizons:H[]=['1W','2W','4W','8W'];
const ms=(s:string)=>Date.parse(s);
const date=(x:string)=>new Date(ms(x)+330*60000).toISOString().slice(0,10);
const iso=(x:number)=>new Date(x).toISOString();
function makeQuote(
  instrumentKey:string,
  quote:{observedAt:string;bid:number;ask:number;bidQty:number;askQty:number}
):Phase46OriginalL1Snapshot{
  return {
    instrumentKey,observedAt:quote.observedAt,
    availableAt:iso(ms(quote.observedAt)+2000),
    bid:quote.bid,ask:quote.ask,
    displayedBidQuantity:quote.bidQty,
    displayedAskQuantity:quote.askQty
  };
}
function fixture(){
  const original=makePhase48SyntheticOosInput('FLAT');
  const historical=original.input;
  // Keep original lot-aligned depth instead of unrounded synthetic 1000.
  historical.executionQuotes.forEach(q=>{
    q.bidQty=975;q.askQty=975;
  });
  const cohort=buildAdaptiveEntryFirstCohort(historical);
  assert.equal(cohort.status,'ENTRY_COHORT_RECORDED');
  assert.equal(cohort.counts.testDecisions,1);
  assert.equal(cohort.attempts.length,12);
  const entries=horizons.map(h=>{
    const match=cohort.attempts.find(a=>
      a.arm==='EMA_BASELINE'&&a.horizon===h&&
      a.disposition==='ENTRY_OBSERVED');
    assert.ok(match,'Missing synthetic baseline candidate '+h);
    return match;
  });
  const paths:Phase46IndexOptionGapPath[]=entries.map(a=>{
    const series=historical.executionQuotes.filter(q=>
      q.instrumentKey===a.instrumentKey);
    const entry=series.find(q=>q.observedAt===a.entryAt)!;
    const pre=series.filter(q=>date(q.observedAt)===a.sessionDate&&
      ms(q.observedAt)>ms(a.entryAt!)&&
      ms(q.observedAt)<ms(a.entryAt!)+4*60*60*1000).at(-1)!;
    const post=series.filter(q=>date(q.observedAt)>a.sessionDate).at(0)!;
    assert.ok(entry&&pre&&post);
    return {
      horizon:a.horizon,
      source:'OPERATOR_SUPPLIED_ORIGINAL_L1_UNVERIFIED',
      contractType:'CASH_SETTLED_INDEX_OPTION_DECLARED_UNVERIFIED',
      instrumentKey:a.instrumentKey!,
      optionType:'CE',
      expiryAt:a.expiry+'T15:30:00+05:30',
      lotSize:a.quantity!,quantity:a.quantity!,
      entryDecisionAt:iso(ms(a.entryAt!)+5000),
      preCloseAt:iso(ms(pre.observedAt)+5000),
      nextSessionOpenAt:post.observedAt,
      entryQuote:makeQuote(a.instrumentKey!,entry),
      preCloseQuote:makeQuote(a.instrumentKey!,pre),
      nextOpenQuote:makeQuote(a.instrumentKey!,post),
      declaredStopTriggerPremium:80
    };
  });
  const phase46Input:Phase46GapStressInput={
    schemaVersion:'ADAPTIVE_V2_PHASE46_FOUR_HORIZON_GAP_EVIDENCE_V1',
    source:'OFFLINE_UNAUTHENTICATED_ARCHIVE',
    datasetLabel:'SYNTHETIC_TEST',
    paths
  };
  const policyRule={
    postOpenBidHaircutBps:1000,
    maximumPermittedFullDebitLossINR:15000,
    maximumPermittedAdverseBidGapPercent:50,
    minimumPostOpenDisplayedBidLots:1,
    hypotheticalEntryFeesINR:15,hypotheticalExitFeesINR:15
  };
  const phase46Policy:Phase46GapStressPolicy={
    schemaVersion:'ADAPTIVE_V2_PHASE46_LONG_INDEX_OPTION_GAP_STRESS_V1',
    maxOriginalEventToAvailabilitySeconds:20,
    maxPostOpenFirstQuoteLagMinutes:10,
    horizonRules:{
      '1W':{...policyRule},'2W':{...policyRule},
      '4W':{...policyRule},'8W':{...policyRule}
    }
  };
  const phase46Pins:Phase46GapStressPins={
    schemaVersion:'INDEPENDENT_PHASE46_GAP_PATH_AND_POLICY_PINS_V1',
    expectedDatasetLabel:'SYNTHETIC_TEST',
    expectedInstrumentKeys:{
      '1W':paths[0].instrumentKey,'2W':paths[1].instrumentKey,
      '4W':paths[2].instrumentKey,'8W':paths[3].instrumentKey
    },
    expectedPathSha256:{'1W':'','2W':'','4W':'','8W':''},
    expectedPolicySha256:''
  };
  const factorPaths:Phase47GreekGapPath[]=paths.map((p,i)=>{
    const source=(when:string,recordId:string,underlyingLevel:number,
      impliedVolatilityPct:number)=>({
        source:'OPERATOR_ASSERTED_ORIGINAL_GREEK_UNVERIFIED' as const,
        recordId,underlyingLevel,impliedVolatilityPct,
        underlyingEventAt:when,greekEventAt:when,
        availableAt:iso(ms(when)+1000)
      });
    return{
      schemaVersion:'ADAPTIVE_PHASE47_GREEK_GAP_PATH_V1',
      horizon:p.horizon,instrumentKey:p.instrumentKey,
      sourceKind:'SYNTHETIC_ORIGINAL_STYLE_GREEKS',
      preClose:{
        ...source(p.preCloseQuote.observedAt,'PH48_PRE_GREEK_'+i,26000,20),
        deltaPremiumPerIndexPoint:.5,
        gammaPremiumPerIndexPointSquared:.001,
        vegaPremiumPerVolatilityPctPoint:4,
        thetaPremiumPerCalendarDay:-8
      },
      postOpen:source(p.nextOpenQuote.observedAt,
        'PH48_NEXT_GREEK_'+i,25800,15)
    };
  });
  const phase47Policy:Phase47GreekRiskPolicy={
    schemaVersion:'ADAPTIVE_PHASE47_PREDECLARED_GREEK_GAP_POLICY_V1',
    maximumUnderlyingEventAlignmentSeconds:30,
    maximumGreekAvailabilityLagSeconds:10,
    maximumUnexplainedPremiumMovePercentOfEntryAsk:60,
    maximumAbsoluteObservedIvMovePercentagePoints:15,
    maximumAbsoluteThetaComponentPercentOfEntryAsk:90,
    minimumDeclaredTimeToExpiryAtOpenDays:1
  };
  const phase47Pins:Phase47IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE47_GREEK_AND_PHASE46_PINS_V1',
    expectedPhase46InputSha256:'',
    expectedPhase46PinsSha256:'',
    expectedPhase46PolicySha256:'',
    expectedGreekPathSha256:{'1W':'','2W':'','4W':'','8W':''},
    expectedGreekPolicySha256:'',
    expectedDatasetLabel:'SYNTHETIC_TEST'
  };
  const phase47:Phase47GreekRiskInput={
    schemaVersion:'ADAPTIVE_PHASE47_FOUR_HORIZON_IV_THETA_SOURCE_V1',
    source:'OFFLINE_OPERATOR_GREEK_ARCHIVE_UNVERIFIED',
    phase46Input,phase46Pins,phase46Policy,greekPaths:factorPaths
  };
  const input:Phase48EntryRiskJoinInput={
    schemaVersion:'ADAPTIVE_PHASE48_OOS_ENTRY_GREEK_RISK_JOIN_V1',
    source:'OFFLINE_UNAUTHENTICATED_VENDOR_COHORT',
    historical,phase47,phase47Pins,phase47Policy
  };
  const pins:Phase48IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE48_OOS_ENTRY_RISK_JOIN_PINS_V1',
    expectedStudyDatasetId:historical.provenance.datasetId,
    expectedOriginalHistoricalInputSha256:'',
    expectedPhase47ArchiveSha256:'',
    expectedPhase47PinsSha256:'',
    expectedPhase47PolicySha256:'',
    expectedOosTestDecisionCount:1,
    expectedOosAttemptCount:12,
    expectedRiskInstrumentKeys:{
      '1W':paths[0].instrumentKey,'2W':paths[1].instrumentKey,
      '4W':paths[2].instrumentKey,'8W':paths[3].instrumentKey
    }
  };
  const resign=()=>{
    for(const h of horizons){
      const path=phase46Input.paths.find(x=>x.horizon===h)!;
      phase46Pins.expectedInstrumentKeys[h]=path.instrumentKey;
      phase46Pins.expectedPathSha256[h]=hashPhase46GapEvidence(path);
      const greek=phase47.greekPaths.find(x=>x.horizon===h)!;
      phase47Pins.expectedGreekPathSha256[h]=
        hashPhase47GreekEvidence(greek);
    }
    phase46Pins.expectedPolicySha256=
      hashPhase46GapEvidence(phase46Policy);
    phase47Pins.expectedPhase46InputSha256=
      hashPhase46GapEvidence(phase46Input);
    phase47Pins.expectedPhase46PinsSha256=
      hashPhase46GapEvidence(phase46Pins);
    phase47Pins.expectedPhase46PolicySha256=
      hashPhase46GapEvidence(phase46Policy);
    phase47Pins.expectedGreekPolicySha256=
      hashPhase47GreekEvidence(phase47Policy);
    pins.expectedOriginalHistoricalInputSha256=
      hashPhase48Evidence(input.historical);
    pins.expectedPhase47ArchiveSha256=
      hashPhase48Evidence(input.phase47);
    pins.expectedPhase47PinsSha256=
      hashPhase48Evidence(input.phase47Pins);
    pins.expectedPhase47PolicySha256=
      hashPhase48Evidence(input.phase47Policy);
    horizons.forEach(h=>{
      pins.expectedRiskInstrumentKeys[h]=phase46Pins.expectedInstrumentKeys[h];
    });
  };
  resign();
  return {input,pins,resign,cohort,entries,original};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase48OosEntryRiskCoverage(f.input,f.pins);
function unsafe(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeBrokerStopsInstalled,false);
  assert.equal(r.originalLicensedL1IndependentlyAuthenticated,false);
  assert.equal(r.vendorHistoricalLicenseIndependentlyVerified,false);
  assert.equal(r.trueOriginalAvailableAtVerified,false);
  assert.equal(r.independentlyAuthenticatedExchangeContractMaster,false);
  assert.equal(r.chronologicalOosProfitabilityProven,false);
  assert.equal(r.fourRiskPathsRepresentAllPossibleTrades,false);
  assert.equal(r.modelGreekAttributionCausallyVerified,false);
  assert.equal(r.nativeOrderInstruction,null);
  for(const c of r.armHorizonCells){
    assert.equal(c.fullDenominatorPreserved,true);
    assert.equal(c.matchedOriginalDataSourceAuthenticated,false);
    assert.equal(c.independentOutOfSampleProfitabilityProven,false);
  }
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
}
function denied(f:F,reason:string,status:'INVALID_EVIDENCE'|
  'INCOMPLETE_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=audit(f);unsafe(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
}
describe('Phase48 real entry-first OOS replay and original L1 Greek-risk join',()=>{
  it('preserves all 12 historical strategy-arm × horizon attempts across one OOS decision',()=>{
    const f=fixture(),r=audit(f);unsafe(r);
    assert.equal(r.status,
      'DESCRIPTIVE_COMPLETE_SELECTED_ENTRY_COVERAGE_ONLY',
      JSON.stringify(r));
    assert.equal(r.datasetSynthetic,true);
    assert.equal(r.totalDecisionArmHorizonAttempts,12);
    assert.equal(r.testDecisionCount,1);
    assert.equal(r.pathUniverseCount,4);
    assert.equal(r.uniqueRiskPathsActuallyMatched,4);
    assert.equal(r.riskPathsUnmatchedToAnySelectedOosEntry,0);
    assert.equal(r.selectedEntriesWithoutOriginalQuotePath,0);
    assert.equal(r.missingOriginalEntryL1Attempts,0);
    assert.equal(r.armHorizonCells.length,12);
    assert.equal(r.armHorizonCells.reduce((s,c)=>s+c.testDecisions,0),12);
  });
  it('same identical original option path across arms never means independent evidence',()=>{
    const r=audit(fixture());unsafe(r);
    assert.equal(r.uniqueRiskPathsActuallyMatched,4);
    assert.ok(r.selectedOosEntries>=4);
    if(r.selectedOosEntries>4)
      assert.ok(r.armHorizonCells.some(c=>
        c.duplicateUnderlyingRiskPathSharedAcrossArms>0));
    assert.equal(r.chronologicalOosProfitabilityProven,false);
  });
  it('real-time preclose event original selected entry ASK manipulated under new pin fails coverage join',()=>{
    const f=fixture();
    const q=f.input.historical.executionQuotes.find(q=>
      q.instrumentKey===f.entries[0].instrumentKey&&
      q.observedAt===f.entries[0].entryAt)!;
    q.ask+=1;
    f.resign();
    denied(f,'OOS_SELECTED_ENTRY_MISSING_EXACT_ORIGINAL_RISK_PATH');
  });
  it('changed exact preclose option BID in historical universe cannot be hidden by a new local hash',()=>{
    const f=fixture(),p=f.input.phase47.phase46Input.paths[0];
    const q=f.input.historical.executionQuotes.find(x=>
      x.instrumentKey===p.instrumentKey&&
      x.observedAt===p.preCloseQuote.observedAt)!;
    q.bid+=1;
    f.resign();
    denied(f,'OOS_SELECTED_ENTRY_MISSING_EXACT_ORIGINAL_RISK_PATH');
  });
  it('changed original nextopen option BID cannot cherry pick another favorable quote',()=>{
    const f=fixture(),p=f.input.phase47.phase46Input.paths[0];
    const q=f.input.historical.executionQuotes.find(x=>
      x.instrumentKey===p.instrumentKey&&
      x.observedAt===p.nextOpenQuote.observedAt)!;
    q.bid-=10;
    f.resign();
    denied(f,'OOS_SELECTED_ENTRY_MISSING_EXACT_ORIGINAL_RISK_PATH');
  });
  it('matched original entry instrument cannot be quietly swapped to a different option',()=>{
    const f=fixture();
    const p=f.input.phase47.phase46Input.paths[0];
    p.instrumentKey='NSE_FO|SYNTHETIC_REPLACEMENT_CE';
    p.entryQuote.instrumentKey=p.instrumentKey;
    p.preCloseQuote.instrumentKey=p.instrumentKey;
    p.nextOpenQuote.instrumentKey=p.instrumentKey;
    f.input.phase47.greekPaths[0].instrumentKey=p.instrumentKey;
    f.resign();
    denied(f,'OOS_SELECTED_ENTRY_MISSING_EXACT_ORIGINAL_RISK_PATH');
  });
  it('mismatched exact original expiry date cannot count as a legitimate OOS contract',()=>{
    const f=fixture();
    const p=f.input.phase47.phase46Input.paths[0];
    p.expiryAt=new Date(Date.parse(p.expiryAt)+86400000).toISOString();
    f.resign();
    denied(f,'OOS_SELECTED_ENTRY_MISSING_EXACT_ORIGINAL_RISK_PATH');
  });
  it('entry quote available after entry decision fails Phase47 predecessor audit',()=>{
    const f=fixture(),p=f.input.phase47.phase46Input.paths[0];
    p.entryQuote.availableAt=new Date(
      Date.parse(p.entryDecisionAt)+1000).toISOString();
    f.resign();
    denied(f,'PHASE47_ORIGINAL_L1_GREEK_RESIDUAL_REAUDIT_FAILED');
  });
  it('after-the-decision entry quote is not replaced with the favorable next morning quote',()=>{
    const f=fixture(),p=f.input.phase47.phase46Input.paths[0];
    p.entryQuote.observedAt=p.nextOpenQuote.observedAt;
    p.entryQuote.availableAt=p.nextOpenQuote.availableAt;
    f.resign();
    denied(f,'PHASE47_ORIGINAL_L1_GREEK_RESIDUAL_REAUDIT_FAILED');
  });
  it('selected entry with missing execution L1 stays in denominator, never zero profit',()=>{
    const f=fixture();
    const chosen=f.entries[0];
    f.input.historical.executionQuotes=
      f.input.historical.executionQuotes.filter(q=>
        q.instrumentKey!==chosen.instrumentKey||
        q.observedAt!==chosen.entryAt);
    f.resign();
    denied(f,'ORIGINAL_SELECTED_ENTRY_L1_UNPRICED_IN_DENOMINATOR');
    const r=audit(f);
    assert.equal(r.totalDecisionArmHorizonAttempts,12);
    assert.ok(r.missingOriginalEntryL1Attempts>=1);
  });
  it('missing all ranked options for a horizon does not turn unused Greek path into valid performance',()=>{
    const f=fixture();
    const decision=f.input.historical.decisions.at(-1)!;
    const expiry=f.entries[0].expiry!;
    decision.listedContracts=decision.listedContracts.filter(c=>
      c.expiry!==expiry);
    decision.chains=decision.chains.filter(c=>c.expiry!==expiry);
    f.resign();
    denied(f,'OPERATOR_SELECTED_RISK_PATH_HAS_NO_OOS_ENTRY');
  });
  it('no OOS decision gets omitted by self-reporting smaller attempt counts',()=>{
    const f=fixture();
    f.pins.expectedOosAttemptCount=11;
    denied(f,'PINNED_OOS_COHORT_OR_GREEK_SOURCE_NOT_EXACT',
      'INVALID_EVIDENCE');
    const g=fixture();
    g.pins.expectedOosTestDecisionCount=2;
    g.pins.expectedOosAttemptCount=24;
    denied(g,'ORIGINAL_ENTRY_FIRST_FOLD_UNIVERSE_INVALID_OR_CHANGED');
  });
  it('wrong original study hash and changed Greek policy hash fail closed',()=>{
    const f=fixture();
    f.pins.expectedOriginalHistoricalInputSha256='ff'.repeat(32);
    denied(f,'PINNED_OOS_COHORT_OR_GREEK_SOURCE_NOT_EXACT',
      'INVALID_EVIDENCE');
    const g=fixture();
    g.input.phase47Policy.maximumAbsoluteObservedIvMovePercentagePoints=1;
    denied(g,'PINNED_OOS_COHORT_OR_GREEK_SOURCE_NOT_EXACT',
      'INVALID_EVIDENCE');
  });
  it('original historical synthetic flag cannot be combined with operator-claimed license',()=>{
    const f=fixture();
    f.input.historical.provenance.synthetic=false;
    f.input.historical.provenance.quoteTimestampQuality=
      'SOURCE_ATTESTED_EVENT_TIME';
    f.resign();
    denied(f,'ORIGINAL_COHORT_AND_RISK_SOURCE_CLASS_DISAGREE',
      'INVALID_EVIDENCE');
  });
  it('missing original selected instruments cannot be papered over by different horizon',()=>{
    const f=fixture();
    f.pins.expectedRiskInstrumentKeys['2W']='OTHER';
    denied(f,'RISK_CONTRACT_KEYS_NOT_PREDECLARED_IN_JOIN_PIN',
      'INVALID_EVIDENCE');
  });
  it('runtime malformed original source fails closed without broker execution',()=>{
    const f=fixture();
    f.input.phase47.phase46Input=undefined as unknown as
      Phase47GreekRiskInput['phase46Input'];
    const r=audit(f);unsafe(r);
    assert.equal(r.status,'INVALID_EVIDENCE');
  });
});
