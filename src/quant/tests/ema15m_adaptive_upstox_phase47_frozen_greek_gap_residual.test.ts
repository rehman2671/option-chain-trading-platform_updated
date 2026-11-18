import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase47FrozenGreekGapResidual,hashPhase47GreekEvidence,
  type Phase47GreekRiskInput,type Phase47IndependentPins,
  type Phase47GreekRiskPolicy,type Phase47GreekGapPath,
  type Phase47GreekObservation
} from '../../server/engine/ema15m/adaptiveUpstoxPhase47FrozenGreekGapResidual.js';
import {hashPhase46GapEvidence}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase46LongOptionGapRisk.js';
import {makePhase47SyntheticGapFixture}
  from './phase47_synthetic_four_horizon_gap_fixture.js';

function fakeOriginalGreek(
  instrument:string,when:string,indexLevel:number,iv:number,
  recordId:string
):Phase47GreekObservation{
  return {
    source:'OPERATOR_ASSERTED_ORIGINAL_GREEK_UNVERIFIED',
    recordId,underlyingLevel:indexLevel,impliedVolatilityPct:iv,
    underlyingEventAt:when,greekEventAt:when,
    availableAt:new Date(Date.parse(when)+1000).toISOString()
  };
}
function fixture(){
  const base=makePhase47SyntheticGapFixture();
  const greekPaths:Phase47GreekGapPath[]=base.input.paths.map((p,i)=>{
    const pre=fakeOriginalGreek(p.instrumentKey,
      p.preCloseQuote.observedAt,26000,20,'SYNTH_PRE_'+i);
    const post=fakeOriginalGreek(p.instrumentKey,
      p.nextOpenQuote.observedAt,25800,15,'SYNTH_POST_'+i);
    return {
      schemaVersion:'ADAPTIVE_PHASE47_GREEK_GAP_PATH_V1',
      horizon:p.horizon,instrumentKey:p.instrumentKey,
      sourceKind:'SYNTHETIC_ORIGINAL_STYLE_GREEKS',
      preClose:{...pre,deltaPremiumPerIndexPoint:.5,
        gammaPremiumPerIndexPointSquared:.001,
        vegaPremiumPerVolatilityPctPoint:4,
        thetaPremiumPerCalendarDay:-8},
      postOpen:post
    };
  });
  const archive:Phase47GreekRiskInput={
    schemaVersion:'ADAPTIVE_PHASE47_FOUR_HORIZON_IV_THETA_SOURCE_V1',
    source:'OFFLINE_OPERATOR_GREEK_ARCHIVE_UNVERIFIED',
    phase46Input:base.input,phase46Pins:base.pins,
    phase46Policy:base.policy,greekPaths
  };
  const policy:Phase47GreekRiskPolicy={
    schemaVersion:'ADAPTIVE_PHASE47_PREDECLARED_GREEK_GAP_POLICY_V1',
    maximumUnderlyingEventAlignmentSeconds:45,
    maximumGreekAvailabilityLagSeconds:10,
    maximumUnexplainedPremiumMovePercentOfEntryAsk:10,
    maximumAbsoluteObservedIvMovePercentagePoints:12,
    maximumAbsoluteThetaComponentPercentOfEntryAsk:20,
    minimumDeclaredTimeToExpiryAtOpenDays:2
  };
  const pins:Phase47IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE47_GREEK_AND_PHASE46_PINS_V1',
    expectedPhase46InputSha256:'',
    expectedPhase46PinsSha256:'',
    expectedPhase46PolicySha256:'',
    expectedGreekPathSha256:{'1W':'','2W':'','4W':'','8W':''},
    expectedGreekPolicySha256:'',
    expectedDatasetLabel:'SYNTHETIC_TEST'
  };
  const resign=()=>{
    base.resign();
    pins.expectedPhase46InputSha256=
      hashPhase46GapEvidence(archive.phase46Input);
    pins.expectedPhase46PinsSha256=
      hashPhase46GapEvidence(archive.phase46Pins);
    pins.expectedPhase46PolicySha256=
      hashPhase46GapEvidence(archive.phase46Policy);
    for(const x of archive.greekPaths)
      pins.expectedGreekPathSha256[x.horizon]=
        hashPhase47GreekEvidence(x);
    pins.expectedGreekPolicySha256=hashPhase47GreekEvidence(policy);
  };
  resign();
  return {archive,pins,policy,resign};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase47FrozenGreekGapResidual(
  f.archive,f.pins,f.policy);
function safety(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.profitabilityProven,false);
  assert.equal(r.originalLicensedOptionL1IndependentlyVerified,false);
  assert.equal(r.vendorGreekModelIndependentlyVerified,false);
  assert.equal(r.sourceIvDataAuthenticityVerified,false);
  assert.equal(r.chronologicalOosComparisonCompleted,false);
  assert.equal(r.marketCalendarAndContractExpiryVerified,false);
  assert.equal(r.empiricalIvThetaCausalityEstablished,false);
  assert.equal(r.brokerNativeStopsVerified,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  for(const x of r.cells){
    assert.equal(x.observedPremiumAttributionCausallyProven,false);
    assert.equal(x.observedGreeksIndependentSourceVerified,false);
    assert.equal(x.derivedPriceIsExecutableQuote,false);
    assert.equal(x.preCloseGreeksWereUsedForTrading,false);
  }
  assert.ok(!JSON.stringify(r).includes('NSE_FO|SYNTHETIC'));
}
function denied(f:F,reason:string,
  status:'INCOMPLETE_EVIDENCE'|'INVALID_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=audit(f);safety(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.deepEqual(r.reasonCodes,[reason],JSON.stringify(r));
}
describe('Phase47 frozen preclose Greeks vs original post-open option BID',()=>{
  it('four original synthetic Phase46 option gaps and Greeks return explanatory residual ONLY',()=>{
    const r=audit(fixture());safety(r);
    assert.equal(r.status,'DESCRIPTIVE_GREEK_RESIDUAL_ONLY',
      JSON.stringify(r));
    assert.equal(r.horizonsReviewed,4);
    assert.equal(r.datasetLabel,'SYNTHETIC_TEST');
    assert.equal(r.alertCells,0);
    for(const x of r.cells){
      assert.equal(x.observedPreCloseOptionBid,230);
      assert.equal(x.observedPostOpenOptionBid,100);
      assert.equal(x.observedOptionBidChange,-130);
      assert.equal(x.underlyingIndexPointChange,-200);
      assert.equal(x.ivChangePercentagePoints,-5);
      assert.equal(x.frozenDeltaComponentPremiumPoints,-100);
      assert.equal(x.frozenGammaComponentPremiumPoints,20);
      assert.equal(x.frozenVegaComponentPremiumPoints,-20);
      assert.ok(x.frozenThetaComponentPremiumPoints<-21);
      assert.ok(x.frozenThetaComponentPremiumPoints>-23);
      assert.ok(Math.abs(x.unexplainedObservedBidResidualPremiumPoints)<10);
      assert.equal(x.derivedPriceIsExecutableQuote,false);
    }
  });
  it('predeclared residual limit alerts without turning model into a fill',()=>{
    const f=fixture();
    f.policy.maximumUnexplainedPremiumMovePercentOfEntryAsk=2;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY');
    assert.equal(r.alertCells,4);
    assert.equal(r.cells[0].residualRiskAlert,true);
  });
  it('large observed IV collapse alerts, but attribution stays unproven',()=>{
    const f=fixture(),x=f.archive.greekPaths[0];
    x.preClose.impliedVolatilityPct=60;
    x.postOpen.impliedVolatilityPct=10;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY');
    assert.equal(r.cells[0].ivChangePercentagePoints,-50);
    assert.equal(r.cells[0].ivShockRiskAlert,true);
    assert.equal(r.empiricalIvThetaCausalityEstablished,false);
  });
  it('calendar-day theta over weekend is model sensitivity, not observed cash loss',()=>{
    const f=fixture();
    f.policy.maximumAbsoluteThetaComponentPercentOfEntryAsk=5;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY');
    assert.equal(r.cells[0].thetaMagnitudeRiskAlert,true);
    assert.ok(r.cells[0].elapsedCalendarDays>2);
  });
  it('operator-declared near-expiry threshold flags weekly but does not validate official expiry',()=>{
    const f=fixture();
    f.policy.minimumDeclaredTimeToExpiryAtOpenDays=5;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY');
    assert.equal(r.cells[0].declaredExpiryProximityAlert,true);
    assert.equal(r.cells[1].declaredExpiryProximityAlert,false);
    assert.equal(r.marketCalendarAndContractExpiryVerified,false);
  });
  it('negative model premium is flagged but never clamped into an executable quote',()=>{
    const f=fixture(),x=f.archive.greekPaths[0];
    x.postOpen.underlyingLevel=20000;
    x.preClose.gammaPremiumPerIndexPointSquared=0;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_GREEK_RISK_ALERT_ONLY');
    assert.equal(r.cells[0].modelMayProduceNegativePremium,true);
    assert.ok(r.cells[0].modelIndicatedNextBidPremiumPoints<0);
    assert.equal(r.cells[0].observedPostOpenOptionBid,100);
  });
  it('delta sign incompatible with CE/PE and negative gamma/vega refuse incorrect math',()=>{
    const f=fixture();f.archive.greekPaths[0].preClose.deltaPremiumPerIndexPoint=-.1;
    f.resign();denied(f,'INVALID_SIGNED_DELTA_GAMMA_VEGA_OR_THETA_UNITS');
    const g=fixture();
    g.archive.phase46Input.paths[0].optionType='PE';
    g.resign();denied(g,'INVALID_SIGNED_DELTA_GAMMA_VEGA_OR_THETA_UNITS');
    const h=fixture();
    h.archive.greekPaths[0].preClose.gammaPremiumPerIndexPointSquared=-.1;
    h.resign();denied(h,'INVALID_SIGNED_DELTA_GAMMA_VEGA_OR_THETA_UNITS');
    const j=fixture();
    j.archive.greekPaths[0].preClose.vegaPremiumPerVolatilityPctPoint=-5;
    j.resign();denied(j,'INVALID_SIGNED_DELTA_GAMMA_VEGA_OR_THETA_UNITS');
  });
  it('NaN/unknown IV or mis-scaled Greek availability is rejected even with new local pin',()=>{
    const f=fixture();
    f.archive.greekPaths[0].preClose.impliedVolatilityPct=Number.NaN;
    f.resign();denied(f,'GREEK_SOURCE_TIME_AVAILABILITY_OR_CONTRACT_MISMATCH');
    const g=fixture();
    g.archive.greekPaths[0].postOpen.availableAt=
      '2026-11-23T09:18:00+05:30';
    g.resign();denied(g,'GREEK_SOURCE_TIME_AVAILABILITY_OR_CONTRACT_MISMATCH');
    const h=fixture();
    h.archive.greekPaths[0].preClose.underlyingEventAt=
      '2026-11-20T15:29:59+05:30';
    h.resign();denied(h,'GREEK_SOURCE_TIME_AVAILABILITY_OR_CONTRACT_MISMATCH');
  });
  it('Greek source record IDs cannot be recycled across two distinct instruments',()=>{
    const f=fixture();
    f.archive.greekPaths[1].preClose.recordId=
      f.archive.greekPaths[0].preClose.recordId;
    f.resign();denied(f,'DUPLICATE_OR_REUSED_CROSS_CONTRACT_GREEK_RECORD',
      'INVALID_EVIDENCE');
  });
  it('single-source pair using one identifier for pre and post must reject',()=>{
    const f=fixture();
    f.archive.greekPaths[0].postOpen.recordId=
      f.archive.greekPaths[0].preClose.recordId;
    f.resign();denied(f,'GREEK_SOURCE_TIME_AVAILABILITY_OR_CONTRACT_MISMATCH');
  });
  it('wrong source bucket label, reordered horizon, or missing 8W cannot pass',()=>{
    const f=fixture();
    f.archive.greekPaths[0].sourceKind=
      'OPERATOR_CLAIMS_LICENSED_ORIGINAL_GREEKS';
    f.resign();denied(f,'DUPLICATE_REORDERED_OR_REPINNED_GREEK_SOURCE_PATH',
      'INVALID_EVIDENCE');
    const g=fixture();g.archive.greekPaths.reverse();g.resign();
    denied(g,'DUPLICATE_REORDERED_OR_REPINNED_GREEK_SOURCE_PATH',
      'INVALID_EVIDENCE');
    const h=fixture();h.archive.greekPaths.pop();h.resign();
    denied(h,'PHASE46_SOURCE_OR_INDEPENDENT_PREDECLARED_GREEK_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('missing nested original Phase46 input fails closed without throwing',()=>{
    const f=fixture();
    f.archive.phase46Input=undefined as unknown as
      Phase47GreekRiskInput['phase46Input'];
    assert.doesNotThrow(()=>audit(f));
    denied(f,'PHASE46_SOURCE_OR_INDEPENDENT_PREDECLARED_GREEK_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('changed observed option BID without Phase46 source re-pin rejects at lineage gate',()=>{
    const f=fixture();
    f.archive.phase46Input.paths[0].nextOpenQuote.bid=1;
    denied(f,'PHASE46_SOURCE_OR_INDEPENDENT_PREDECLARED_GREEK_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('re-pinned original L1 with lookahead cannot bypass real Phase46 audit',()=>{
    const f=fixture();
    f.archive.phase46Input.paths[0].entryQuote.availableAt=
      '2026-11-20T09:31:00+05:30';
    f.resign();
    denied(f,'PHASE46_ORIGINAL_OPTION_GAP_REAUDIT_FAILED',
      'INCOMPLETE_EVIDENCE');
  });
  it('altered Greek or policy without independently updated pin rejects',()=>{
    const f=fixture();
    f.archive.greekPaths[0].postOpen.impliedVolatilityPct=99;
    denied(f,'DUPLICATE_REORDERED_OR_REPINNED_GREEK_SOURCE_PATH',
      'INVALID_EVIDENCE');
    const g=fixture();
    g.policy.maximumUnderlyingEventAlignmentSeconds=0;
    denied(g,'PHASE46_SOURCE_OR_INDEPENDENT_PREDECLARED_GREEK_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('zero original postopen BID remains observed gap, never synthetic fill',()=>{
    const f=fixture();
    f.archive.phase46Input.paths[0].nextOpenQuote.bid=0;
    f.archive.phase46Input.paths[0].nextOpenQuote.displayedBidQuantity=0;
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.cells[0].observedPostOpenOptionBid,0);
    assert.equal(r.cells[0].derivedPriceIsExecutableQuote,false);
    assert.equal(r.brokerNativeStopsVerified,false);
  });
  it('operator claims licensed Greeks but no vendor authentication in any report',()=>{
    const f=fixture();
    f.archive.phase46Input.datasetLabel=
      'OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED';
    f.archive.phase46Pins.expectedDatasetLabel=
      'OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED';
    f.archive.greekPaths.forEach(x=>{
      x.sourceKind='OPERATOR_CLAIMS_LICENSED_ORIGINAL_GREEKS';
    });
    f.pins.expectedDatasetLabel='OPERATOR_ORIGINAL_MARKET_DATA_UNVERIFIED';
    f.resign();
    const r=audit(f);safety(r);
    assert.equal(r.status,'DESCRIPTIVE_GREEK_RESIDUAL_ONLY',
      JSON.stringify(r));
    assert.equal(r.originalLicensedOptionL1IndependentlyVerified,false);
    assert.equal(r.vendorGreekModelIndependentlyVerified,false);
  });
});
