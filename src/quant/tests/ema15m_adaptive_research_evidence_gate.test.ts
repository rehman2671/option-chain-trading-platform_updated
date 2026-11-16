import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAdaptiveResearchEvidenceGate,
  type AdaptiveResearchEvidencePolicy } from
  '../../server/engine/ema15m/adaptiveResearchEvidenceGate.js';
import type { AdaptiveWalkForwardStudy } from
  '../../server/engine/ema15m/adaptiveWalkForwardStudy.js';
import type { AdaptiveMarketDataQualityReport, L1PathDiagnostic } from
  '../../server/engine/ema15m/adaptiveL1MarketDataQuality.js';
import type { EntryFirstExitStudy, EntryFirstExitOutcome } from
  '../../server/engine/ema15m/adaptiveEntryFirstExitStudy.js';
import type { SourceArtifactAudit } from
  '../../server/engine/ema15m/adaptiveSourceArtifactAudit.js';

const arms=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'] as const;
const horizons=['1W','2W','4W','8W'] as const;
const scenarios=['BASE','DOUBLE_FEES_AND_SLIPPAGE','WIDEN_L1_50BPS',
  'COMBINED_COST_AND_L1_STRESS'] as const;
const sourceSha='b'.repeat(64);
const protocol=():AdaptiveResearchEvidencePolicy=>({
  schemaVersion:'ADAPTIVE_RESEARCH_EVIDENCE_GATE_V1',
  studyProtocolId:'RESEARCH_PROTOCOL_TEST_001',
  prespecifiedAt:'2025-12-01T00:00:00.000Z',
  minimumOutOfSampleFolds:1,minimumTestingSessionsPerFold:20,
  minimumPricedEntryFirstExitsPerCell:20,minimumStressTradesPerCell:20,
  minimumPairedDecisionsPerArmHorizon:20,
  minimumDistinctMarketRegimesPerFold:2,
  minimumDecisionSessionsPerObservedRegime:10,
  maximumMissingEntryFractionPerCell:0,
  maximumCensoredExitFractionPerCell:0,
  maximumCombinedStressDeteriorationINR:500,
  maximumStressedDrawdownINR:2000
});
interface Fixture {
  study:AdaptiveWalkForwardStudy;
  quality:AdaptiveMarketDataQualityReport;
  entry:EntryFirstExitStudy;
  artifact:SourceArtifactAudit;
  policy:AdaptiveResearchEvidencePolicy;
}
function fixture():Fixture{
  const w={trainStart:'2025-10-01',trainEnd:'2025-10-15',
    testStart:'2026-02-01',testEnd:'2026-02-20'};
  const qualityCells:AdaptiveMarketDataQualityReport['cells']=[];
  const exitCells:EntryFirstExitStudy['cells']=[];
  const paths:L1PathDiagnostic[]=[];
  const outcomes:EntryFirstExitOutcome[]=[];
  const attempts:EntryFirstExitStudy['cohort']['attempts']=[];
  const results:AdaptiveWalkForwardStudy['results']=[];
  const pairs:AdaptiveWalkForwardStudy['pairedOutOfSample']=[];
  let keyId=100000;
  for(const arm of arms)for(const horizon of horizons){
    qualityCells.push({
      foldIndex:0,arm,horizon,decisionCount:20,observedEntryCount:20,
      missingEntryCount:0,qualityPassCount:20,incompleteL1PathCount:0,
      noSignalOrIneligibleCount:0,adverseOvernightGapAlertCount:0,
      largestAdverseOvernightBidGapPercent:0,
      observedBidGivebackAlertCount:0,spreadBpsP95:100,
      eventToAvailableLagSecondsP95:1,
      sufficientForDescriptiveQualityReview:true,productionEligible:false
    });
    exitCells.push({
      foldIndex:0,arm,horizon,totalDecisions:20,
      entryObservedCount:20,noEntryCount:0,pricedExitCount:20,
      unpricedExitCount:0,pathIncompleteCount:0,
      overnightGapTriggerCount:0,observedOnlyNetPnlINR:200,
      completeCohortNetPnlINR:200,descriptiveComparisonEligible:true
    });
    for(let n=0;n<20;n++){
      const dt=new Date(Date.UTC(2026,1,1+n,5,0)).toISOString();
      const entryTime=new Date(Date.parse(dt)+60_000).toISOString();
      const exitTime=new Date(Date.parse(entryTime)+120_000).toISOString();
      const instrumentKey='NSE_FO|'+(keyId++);
      attempts.push({
        foldIndex:0,arm,horizon,decisionAt:dt,sessionDate:dt.slice(0,10),
        disposition:'ENTRY_OBSERVED',instrumentKey,expiry:'2026-04-30',
        entryAt:entryTime,entryAsk:100,entryBid:99,quantity:65,
        scheduledFixedHoldAt:exitTime,lastEligibleFixedHoldExitAt:exitTime
      });
      paths.push({
        foldIndex:0,arm,horizon,decisionAt:dt,
        disposition:'SUFFICIENT_SOURCE_ATTESTED_OBSERVATIONS',
        reasons:[],sessionsEvaluated:1,quoteCount:100,
        maximumWithinSessionGapMinutes:5,maximumSpreadBps:100,
        spreadBpsP95:100,wideSpreadQuotePercent:0,
        insufficientDepthQuotePercent:0,eventToAvailableLagSecondsP95:1,
        largestAdverseOvernightBidGapPercent:0,
        adverseOvernightGapAlertCount:0,
        maximumObservedBidPeakToTroughGivebackPercent:0,
        observedBidGivebackAlert:false,
        firstFixedDueExitBidObservedAt:exitTime
      });
      outcomes.push({
        foldIndex:0,arm,horizon,decisionAt:dt,instrumentKey,
        entryAt:entryTime,entryAsk:100,quantity:65,
        status:'PRICED_EXIT',reason:'FIXED_HOLD_DUE',
        triggerObservedAt:exitTime,breachedLevel:null,
        nextQuoteAt:exitTime,hypotheticalExitBid:110,
        hypotheticalNetPnlINR:650,overnightGapAtTrigger:false,
        pathQuoteCount:100
      });
    }
    for(const scenario of scenarios){
      const net=scenario==='BASE'?1000:
        scenario==='DOUBLE_FEES_AND_SLIPPAGE'?900:
        scenario==='WIDEN_L1_50BPS'?850:700;
      results.push({
        scenario,foldIndex:0,arm,horizon,tradeCount:20,
        netPnlINR:net,expectancyINR:net/20,
        maxDrawdownINR:500,grossTurnoverINR:500000,
        unpricedEntries:0,unpricedExits:0,comparable:true
      });
    }
  }
  for(const horizon of horizons)for(const contender of
    ['REGIME_FILTER','REGIME_AND_RANK'] as const){
    pairs.push({
      foldIndex:0,horizon,reference:'EMA_BASELINE',contender,
      baselineTrades:20,contenderTrades:20,pairedDecisionCount:20,
      pairedDeltaNetINR:0,missingPairCount:0,
      comparisonIsTradeMatched:true,sufficientPairedSample:true
    });
  }
  const quality={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    empiricalProfitabilityProven:false,
    sourceAuthenticityIndependentlyVerified:false,
    exchangeCalendarIndependentlyVerified:false,
    originalAvailabilityClocksIndependentlyVerified:false,
    status:'DESCRIPTIVE_ONLY',datasetId:'FAKE_DECLARED_REAL_REVIEW',
    synthetic:false,errors:[],policy:null,
    totalOutOfSampleDecisions:20,observedEntryCount:240,
    missingEntryCount:0,paths,cells:qualityCells,warnings:[]
  } as AdaptiveMarketDataQualityReport;
  const entry={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    brokerStopProtectionInstalled:false,
    historicalDataIndependentlyAuthenticated:false,profitabilityProven:false,
    selectionMethod:'OOS_ENTRY_FIRST_PREDECLARED_COOLDOWN',
    status:'DESCRIPTIVE_ONLY',errors:[],outcomes,cells:exitCells,
    cohort:{
      mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
      sourceAuthenticated:false,status:'ENTRY_COHORT_RECORDED',
      errors:[],attempts,
      counts:{
        testDecisions:20,attempts:240,
        qualifyingEntryCount:240,missingEntryCount:0,noTradeCount:0
      },warnings:[]
    },warnings:[]
  } as EntryFirstExitStudy;
  const study={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    sourceAuthenticityIndependentlyVerified:false,
    empiricalProfitabilityProven:false,status:'DESCRIPTIVE_ONLY',
    errors:[],scenarios,foldWindows:[{
      ...w,trainingSessions:20,testingSessions:20
    }],results,pairedOutOfSample:pairs,marketRegimeAudit:{
      mode:'RESEARCH_ONLY',executionAuthorized:false,
      causalEffectEstablished:false,sourceAuthenticityVerified:false,
      cells:['TREND_UP','SIDEWAYS'].flatMap(regime=>arms.flatMap(arm=>
        horizons.map(horizon=>({
          foldIndex:0,regime,arm,horizon,observedDecisionSessions:10,
          executedTrades:10,netPnlINR:0,avgPnlPerClosedTradeINR:0,
          adequateSampleForDescriptiveUse:false,productionSafe:false
        })))),warnings:[]
    },
    ingestion:{
      mode:'RESEARCH_ONLY',executionAuthorized:false,schemaValid:true,
      sourceAuthenticityIndependentlyVerified:false,
      status:'SOURCE_ATTESTED_NOT_INDEPENDENTLY_VERIFIED',
      errors:[],warnings:[],
      counts:{sessions:20,chainSnapshots:20,optionL1Observations:1000,
        uniqueContracts:240}
    },
    report:{
      mode:'RESEARCH_ONLY',executionAuthorized:false,
      method:'FIXED_POLICY_CHRONOLOGICAL_FOLDS_V1',
      productionSafe:false,datasetId:'FAKE_DECLARED_REAL_REVIEW',
      synthetic:false,status:'DESCRIPTIVE_ONLY',errors:[],
      folds:[{window:w,trainingSessions:20,testingSessions:20,
        training:[],outOfSample:[],completePriceEvidence:true}]
    },
    warnings:[]
  } as unknown as AdaptiveWalkForwardStudy;
  const artifact:SourceArtifactAudit={
    mode:'RESEARCH_ONLY',executionAuthorized:false,
    marketAuthenticityVerified:false,
    status:'CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED',
    digestSha256:sourceSha,expectedSha256:sourceSha,errors:[]
  };
  return {study,quality,entry,artifact,policy:protocol()};
}
const assess=(f:Fixture)=>evaluateAdaptiveResearchEvidenceGate(
  f.study,f.quality,f.entry,f.artifact,f.policy
);
describe('Phase 11 independent-review evidence gate never enables trading',()=>{
  it('maximum success is EXTERNAL_REVIEW_REQUIRED, never verified or executable',()=>{
    const f=fixture();
    const a=assess(f),b=assess(f);
    assert.equal(a.status,'EXTERNAL_REVIEW_REQUIRED');
    assert.deepEqual(a.blockers,[]);
    assert.equal(a.cells.length,12);
    assert.equal(a.totalTestingSessions,20);
    assert.equal(a.foldCount,1);
    assert.deepEqual(a.regimeFoldEvidence[0].qualifyingRegimes,['SIDEWAYS','TREND_UP']);
    assert.equal(a.regimeFoldEvidence[0].internallyConsistent,true);
    assert.match(a.aggregateSummarySha256!,/^[0-9a-f]{64}$/);
    assert.equal(a.aggregateSummarySha256,b.aggregateSummarySha256);
    assert.equal(a.executionAuthorized,false);
    assert.equal(a.productionSafe,false);
    assert.equal(a.profitabilityProven,false);
    assert.equal(a.brokerOperationalSafetyProven,false);
    assert.equal(a.sourceAuthenticityIndependentlyVerified,false);
    assert.equal(a.exchangeCalendarIndependentlyVerified,false);
    assert.equal(a.protocolRegistrationIndependentlyVerified,false);
    assert.ok(a.externalReviewChecklist.length>0);
  });
  it('rejects malformed study protocols before preparing review package',()=>{
    const f=fixture();f.policy.maximumCensoredExitFractionPerCell=2;
    const r=assess(f);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('INVALID_OR_UNREGISTERED_EVIDENCE_GATE_POLICY'));
  });
  it('never promotes a complete synthetic fixture to real-market evidence',()=>{
    const f=fixture();
    f.study.report!.synthetic=true;f.quality.synthetic=true;
    const r=assess(f);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes('SYNTHETIC_DATA_CANNOT_ENTER_EXTERNAL_MARKET_EVIDENCE_REVIEW'));
    assert.equal(r.executionAuthorized,false);
  });
  it('source SHA mismatch or missing artifact cannot be bypassed by positive PnL',()=>{
    for(const mode of ['missing','mismatch'] as const){
      const f=fixture();
      if(mode==='missing')f.artifact.status='MISSING_SOURCE';
      else f.artifact.expectedSha256='f'.repeat(64);
      const r=assess(f);
      assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
      assert.ok(r.blockers.includes('ORIGINAL_VENDOR_ARTIFACT_CHECKSUM_NOT_ESTABLISHED'));
    }
  });
  it('checks policy preregistration self-declaration before earliest OOS fold',()=>{
    const f=fixture();
    f.policy.prespecifiedAt='2026-02-01T01:00:00Z';
    const r=assess(f);
    assert.ok(r.blockers.includes('POLICY_WAS_NOT_DECLARED_BEFORE_OOS_WINDOWS'));
    assert.equal(r.protocolRegistrationIndependentlyVerified,false);
  });
  it('missing fixed-hold L1 path or censored exit blocks entire review',()=>{
    const f=fixture();
    f.entry.outcomes[0].status='EXIT_UNPRICED';
    f.entry.outcomes[0].hypotheticalNetPnlINR=null;
    f.entry.outcomes[0].hypotheticalExitBid=null;
    f.entry.outcomes[0].nextQuoteAt=null;
    f.entry.cells[0].pricedExitCount=19;
    f.entry.cells[0].unpricedExitCount=1;
    f.entry.cells[0].completeCohortNetPnlINR=null;
    const r=assess(f);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes('CENSORED_EXITS_EXCEED_PREDECLARED_LIMIT'));
    assert.ok(r.blockers.includes('INCOMPLETE_L1_PATH_OR_ENTRY_FIRST_EXIT_EVIDENCE'));
    assert.equal(r.cells[0].completeExitCount,19);
    assert.equal(r.cells[0].censoredExitCount,1);
    assert.equal(r.cells[0].evidenceSufficientForManualReview,false);
  });
  it('detects raw path omissions even if summary claims all 20 were priced',()=>{
    const f=fixture();
    f.quality.paths.splice(0,1);
    const r=assess(f);
    assert.ok(r.blockers.includes('ENTRY_FIRST_COHORT_TOTALS_DISAGREE'));
    assert.ok(r.blockers.includes('RAW_COHORT_PATH_OR_EXIT_COUNTS_DIVERGE_FROM_SUMMARY'));
  });
  it('rejects duplicate summary cells, and inconsistent entry-first counts',()=>{
    const f=fixture();
    f.quality.cells[1]={...f.quality.cells[0]};
    f.entry.cohort.counts.qualifyingEntryCount=239;
    const r=assess(f);
    assert.ok(r.blockers.includes('DUPLICATE_QUALITY_CELL'));
    assert.ok(r.blockers.includes('ENTRY_FIRST_COHORT_TOTALS_DISAGREE'));
  });
  it('requires all four cost stresses and blocks excessive drawdown and cost deterioration',()=>{
    const f=fixture();
    const combined=f.study.results.find(x=>
      x.scenario==='COMBINED_COST_AND_L1_STRESS'&&
      x.arm==='EMA_BASELINE'&&x.horizon==='1W')!;
    combined.netPnlINR=-1000;
    combined.maxDrawdownINR=5000;
    const r=assess(f);
    assert.ok(r.blockers.includes('COMBINED_STRESS_PNL_DETERIORATION_EXCEEDS_LIMIT'));
    assert.ok(r.blockers.includes('STRESSED_DRAWDOWN_EXCEEDS_DECLARED_REVIEW_LIMIT'));
    f.study.results.pop();
    assert.ok(assess(f).blockers.includes('INCOMPLETE_FOLD_ARM_HORIZON_SCENARIO_MATRIX'));
  });
  it('unpaired arm comparison cannot establish per-expiry research review sufficiency',()=>{
    const f=fixture();
    f.study.pairedOutOfSample[0].pairedDecisionCount=9;
    const r=assess(f);
    assert.ok(r.blockers.includes('UNPAIRED_OR_UNDERPOWERED_POLICY_ARM_COMPARISON'));
  });
  it('refuses spoofed production-authorization flags in an upstream report',()=>{
    const f=fixture();
    (f.quality as unknown as {productionSafe:boolean}).productionSafe=true;
    const r=assess(f);
    assert.ok(r.blockers.includes('UPSTREAM_RESEARCH_SAFETY_FLAGS_UNEXPECTEDLY_MUTATED'));
    assert.equal(r.executionAuthorized,false);
  });
  it('blocks omitted sideways/choppy market conditions, not just strong-trend outcomes',()=>{
    const f=fixture();
    const cells=f.study.marketRegimeAudit!.cells;
    f.study.marketRegimeAudit!.cells=cells.filter(c=>c.regime==='TREND_UP');
    const r=assess(f);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes('INSUFFICIENT_DISTINCT_MARKET_REGIMES_FOR_GENERALIZABILITY_REVIEW'));
    assert.ok(r.blockers.includes('REGIME_AUDIT_SESSIONS_OR_ARM_HORIZON_MATRIX_MISMATCH'));
    assert.equal(r.regimeFoldEvidence[0].attributedDecisionSessions,10);
  });
  it('blocks a duplicated or missing regime × arm × horizon cross-section',()=>{
    const f=fixture();
    f.study.marketRegimeAudit!.cells.pop();
    const r=assess(f);
    assert.ok(r.blockers.includes('REGIME_AUDIT_SESSIONS_OR_ARM_HORIZON_MATRIX_MISMATCH'));
    assert.equal(r.regimeFoldEvidence[0].internallyConsistent,false);
  });
  it('data-quality source mismatch and incomplete prior reports remain blocked',()=>{
    const f=fixture();
    f.quality.datasetId='DIFFERENT_SOURCE';
    f.study.status='INCOMPLETE_EVIDENCE';
    const r=assess(f);
    assert.ok(r.blockers.includes('MISMATCHED_OR_INVALID_DATASET_PROVENANCE'));
    assert.ok(r.blockers.includes('PRIOR_RESEARCH_REPORTS_NOT_ALL_DESCRIPTIVELY_COMPLETE'));
  });
});
