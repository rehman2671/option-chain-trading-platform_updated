import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  evaluateAdaptiveFullResearchReadiness,
  runAdaptiveFullResearchReadiness,
  validatePinnedResearchPolicyLock,
  type ReadinessPhaseReports,type ReadinessAssessmentContext,
  type PinnedResearchPolicyLock,type ReadinessPolicyBytes,
  type FullResearchReadinessInput
} from '../../server/engine/ema15m/adaptiveFullResearchReadiness.js';
import type {HistoricalArm} from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type {HorizonBucket} from
  '../../server/engine/ema15m/adaptiveOptionRanker.js';
import type {StressCase} from
  '../../server/engine/ema15m/adaptiveMatchedPremiumCostDepthStress.js';

const sha=(s:Uint8Array)=>createHash('sha256').update(s).digest('hex');
const PROTOCOL='SYNTHETIC_EXTERNAL_REVIEW_PROTOCOL';
const DATASET='TEST_ONLY_SOURCE_DATASET';
const BUNDLE_DIGEST='c'.repeat(64);
const VENDOR_DIGEST='a'.repeat(64);
const CAL_DIGEST='b'.repeat(64);
const CAL_MANIFEST_DIGEST='e'.repeat(64);
const arms:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const horizons:HorizonBucket[]=['1W','2W','4W','8W'];
const stresses:StressCase[]=[
  'UNCHANGED_P8_COSTS','DOUBLE_ORIGINAL_COSTS',
  'WIDEN_ENTRY_ASK_AND_EXIT_BID','COMBINED_OVERNIGHT_GAP_AND_DEPTH'
];
const policyRoles=( [
  'entryFirstExit','marketDataQuality','researchEvidenceGate',
  'regimeHysteresis','matchedOos','premiumCostDepthStress',
  'instrumentSessionSchedule','premiumPathReversal'
] as const);
const context=():ReadinessAssessmentContext=>({
  datasetId:DATASET,synthetic:false,
  protocolId:PROTOCOL,lockStudyProtocolId:PROTOCOL,
  expectedTestSessions:[3],originalBundleSha256:BUNDLE_DIGEST
});
function mockReports():ReadinessPhaseReports{
  const q=[],gate=[],entry=[],matched=[],stress=[],hyst=[],premiumPath=[];
  for(const arm of arms)for(const horizon of horizons){
    q.push({foldIndex:0,arm,horizon,decisionCount:3,observedEntryCount:2,
      sufficientForDescriptiveQualityReview:true});
    gate.push({foldIndex:0,arm,horizon,testDecisionCount:3,
      evidenceSufficientForManualReview:true,blockers:[]});
    entry.push({foldIndex:0,arm,horizon,totalDecisions:3,
      entryObservedCount:2});
    matched.push({foldIndex:0,arm,horizon,allOutOfSampleDecisions:3,
      originalObservedEntries:2,stabilizedObservedEntries:2,
      bothEntered:2,originalOnlyEntries:0,stabilizedOnlyEntries:0,
      neitherEntered:1,jointlyPricedPairs:2,
      originalCensoredExits:0,stabilizedCensoredExits:0,
      originalPricedExits:2,stabilizedPricedExits:2,
      originalCompleteCohortNetPnlINR:100,
      stabilizedCompleteCohortNetPnlINR:80,
      skippedOriginalWinnersObserved:0,skippedOriginalLosersObserved:0,
      originalOvernightGapTriggers:1,stabilizedOvernightGapTriggers:0,
      descriptivePairedSampleSufficient:true,blockers:[]});
    premiumPath.push({foldIndex:0,arm,horizon,
      allOutOfSampleDecisions:3,
      original:{enrolledEntries:2,pricedAndFullyObservedPaths:2,
        censoredOrSourceMismatchedPaths:0,
        completeCohortMeanMaxQualifiedBidGainPoints:35,
        firstRunupReversalBeforeTarget:1,qualifiedBidTargetCrossings:0},
      hysteresis:{enrolledEntries:2,pricedAndFullyObservedPaths:2,
        censoredOrSourceMismatchedPaths:0,
        completeCohortMeanMaxQualifiedBidGainPoints:25,
        firstRunupReversalBeforeTarget:0,qualifiedBidTargetCrossings:1},
      originalOnlyFirstRunupReversals:0,
      fullyObservedForDescriptiveReview:true,blockers:[]});
    for(const scenario of stresses)
      stress.push({foldIndex:0,arm,horizon,scenario,
        allOutOfSampleDecisions:3,
        original:{enrolledEntries:2,scenarioCensoredExits:0,
          completeCohortNetPnlINR:scenario==='COMBINED_OVERNIGHT_GAP_AND_DEPTH'?
            40:100,additionalDepthBlockedExits:0},
        stabilized:{enrolledEntries:2,scenarioCensoredExits:0,
          completeCohortNetPnlINR:scenario==='COMBINED_OVERNIGHT_GAP_AND_DEPTH'?
            35:80,additionalDepthBlockedExits:0},
        sufficientForDescriptiveStressReview:true,blockers:[]});
  }
  for(const horizon of horizons)
    hyst.push({foldIndex:0,horizon,testingDecisions:3});
  // Adversarial report-evaluation tests intentionally construct typed
  // *partial fake summaries*. These are NEVER accepted as raw evidence by
  // runAdaptiveFullResearchReadiness, which reruns all original-source audits.
  return {
    source:{status:'CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED',
      digestSha256:VENDOR_DIGEST,executionAuthorized:false},
    walk:{status:'DESCRIPTIVE_ONLY',foldWindows:[{testingSessions:3}]},
    entry:{status:'DESCRIPTIVE_ONLY',cells:entry},
    quality:{status:'DESCRIPTIVE_ONLY',datasetId:DATASET,synthetic:false,
      cells:q},
    researchGate:{status:'EXTERNAL_REVIEW_REQUIRED',
      datasetId:DATASET,synthetic:false,foldCount:1,
      totalTestingSessions:3,policy:{studyProtocolId:PROTOCOL},cells:gate},
    hysteresis:{status:'DESCRIPTIVE_ONLY',datasetId:DATASET,
      synthetic:false,foldCells:hyst},
    matched:{status:'DESCRIPTIVE_ONLY',datasetId:DATASET,synthetic:false,
      cells:matched},
    premiumStress:{status:'DESCRIPTIVE_ONLY',datasetId:DATASET,
      synthetic:false,cells:stress},
    premiumPath:{status:'DESCRIPTIVE_ONLY',datasetId:DATASET,
      synthetic:false,cells:premiumPath},
    calendar:{status:'CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED',
      datasetId:DATASET,synthetic:false,
      originalCalendarDocumentSha256:CAL_DIGEST,
      foldCoverage:[{foldIndex:0,expectedTradingDecisions:3,
        observedTradingDecisions:3,omittedExpectedTradingDecisions:0,
        calendarTestWindowCovered:true}]},
    witness:{status:'SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED',
      datasetId:DATASET,synthetic:false,
      bundleSha256:BUNDLE_DIGEST,
      originalVendorArchiveSha256:VENDOR_DIGEST,
      calendarSourceDocumentSha256:CAL_DIGEST,
      calendarManifestSha256:CAL_MANIFEST_DIGEST},
    instrumentSessions:{status:'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED',
      datasetId:DATASET,synthetic:false,studyProtocolId:PROTOCOL,
      originalCalendarManifestSha256:CAL_MANIFEST_DIGEST,
      tradingDaysCovered:9,tradingDaysExpected:9,evidenceSha256:'f'.repeat(64)}
  } as unknown as ReadinessPhaseReports;
}
const assess=(p=mockReports(),ctx=context(),lock=true)=>
  evaluateAdaptiveFullResearchReadiness(p,ctx,lock);
const bytes=(text:string)=>Buffer.from(text,'utf8');
function lockFixture(){
  const policies=Object.fromEntries(policyRoles.map((r,i)=>[r,bytes(
    JSON.stringify({schemaVersion:'SYNTHETIC_POLICY_'+i,
      example:'not a trading threshold'}))
  ])) as unknown as ReadinessPolicyBytes;
  const lockedHashes={} as PinnedResearchPolicyLock['policyFileSha256'];
  for(const role of policyRoles)lockedHashes[role]=sha(policies[role]);
  const manifest:PinnedResearchPolicyLock={
    schemaVersion:'ADAPTIVE_PRESPECIFIED_RESEARCH_POLICY_LOCK_V1',
    datasetId:DATASET,studyProtocolId:PROTOCOL,
    originalBundleSha256:BUNDLE_DIGEST,
    prespecifiedAt:'2026-01-01T00:00:00.000Z',
    policyFileSha256:lockedHashes
  };
  const file=bytes(JSON.stringify(manifest));
  const check=()=>validatePinnedResearchPolicyLock(
    manifest,sha(file),file,policies,{
      datasetId:DATASET,studyProtocolId:PROTOCOL,
      originalBundleSha256:BUNDLE_DIGEST,
      prespecifiedAt:manifest.prespecifiedAt
    });
  return {manifest,file,policies,check};
}
describe('Phase 17 zero-authorization full research audit summary',()=>{
  it('even complete fake summaries can only claim external REVIEW, NEVER real trading',()=>{
    const r=assess();
    assert.equal(r.status,'INTERNALLY_CONSISTENT_EXTERNAL_REVIEW_REQUIRED');
    assert.equal(r.errors.length,0);
    assert.equal(r.blockers.length,0);
    assert.equal(r.horizonMechanicalRisk.length,12);
    assert.equal(r.expectedPremiumStressCells,48);
    assert.equal(r.expectedPremiumPathCells,12);
    assert.equal(r.expectedArmHorizonCells,12);
    assert.equal(r.foldCount,1);
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.liveMisModified,false);
    assert.equal(r.nrmlLiveEnabled,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.statisticalSignificanceProven,false);
    assert.equal(r.exchangeIssuerAuthenticated,false);
    assert.equal(r.brokerNativeProtectionProven,false);
    assert.equal(r.externalPreRegistrationProven,false);
    assert.ok(r.manualExternalRequirements.length>=8);
    const c=r.horizonMechanicalRisk.find(x=>
      x.arm==='EMA_BASELINE'&&x.horizon==='1W')!;
    assert.equal(c.liveHorizonRecommendation,null);
    assert.equal(c.sampleComplete,true);
    assert.equal(c.originalCombinedStressNetPnlINR,40);
    assert.equal(c.hysteresisCombinedStressNetPnlINR,35);
    assert.equal(c.originalStressDeteriorationINR,60);
    assert.equal(c.hysteresisStressDeteriorationINR,45);
    assert.equal(c.originalOvernightGapTriggers,1);
    assert.equal(c.originalObservedFirstRunupReversals,1);
    assert.equal(c.hysteresisObservedTargetCrossings,1);
    assert.equal(c.hysteresisOvernightGapTriggers,0);
    assert.equal(r.aggregateEvidenceSummarySha256?.length,64);
    assert.deepEqual(assess(),r);
  });
  it('synthetic source never passes full source readiness even if fake report statuses are success',()=>{
    const ctx=context();ctx.synthetic=true;
    const p=mockReports();
    for(const k of ['quality','researchGate','hysteresis','matched',
      'premiumStress','premiumPath','calendar','witness','instrumentSessions'] as const)
      (p[k] as {synthetic:boolean}).synthetic=true;
    const r=assess(p,ctx);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes(
      'SYNTHETIC_SOURCE_CANNOT_ESTABLISH_MARKET_EDGE'));
    assert.equal(r.executionAuthorized,false);
  });
  it('a single omitted 4W stress scenario cell blocks complete review and OOS readiness',()=>{
    const p=mockReports();
    p.premiumStress!.cells=p.premiumStress!.cells.filter(c=>
      !(c.arm==='EMA_BASELINE'&&c.horizon==='4W'&&
        c.scenario==='WIDEN_ENTRY_ASK_AND_EXIT_BID'));
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes(
      'MISSING_COMPLETE_FOLD_ARM_HORIZON_SOURCE_EVIDENCE_MATRIX'));
    const row=r.horizonMechanicalRisk.find(x=>
      x.arm==='EMA_BASELINE'&&x.horizon==='4W')!;
    assert.equal(row.sampleComplete,false);
    assert.equal(row.originalCompleteNetPnlINR,null);
  });
  it('a censored next bid remains null, not a filtered mean or a zero loss',()=>{
    const p=mockReports();
    const row=p.matched!.cells[0];
    row.originalCensoredExits=1;
    row.originalCompleteCohortNetPnlINR=null;
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    const c=r.horizonMechanicalRisk[0];
    assert.equal(c.originalCensoredExitCount,1);
    assert.equal(c.originalCompleteNetPnlINR,null);
    assert.equal(c.originalStressDeteriorationINR,null);
    assert.ok(c.reasons.includes('CENSORED_EXITS_CANNOT_BE_ZEROED_OR_EXCLUDED'));
  });
  it('a changed OOS denominator, even while reports claim success, blocks horizon comparison',()=>{
    const p=mockReports();p.quality!.cells[0].decisionCount=2;
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.horizonMechanicalRisk[0].reasons.includes(
      'OOS_DECISION_DENOMINATOR_CHANGED_ACROSS_PHASES'));
  });
  it('one duplicated stress scenario cannot replace a missing scenario and still count as four',()=>{
    const p=mockReports();
    const index=p.premiumStress!.cells.findIndex(x=>
      x.arm==='REGIME_FILTER'&&x.horizon==='2W'&&
      x.scenario==='WIDEN_ENTRY_ASK_AND_EXIT_BID');
    assert.ok(index>=0);
    p.premiumStress!.cells[index]={
      ...p.premiumStress!.cells[index],scenario:'DOUBLE_ORIGINAL_COSTS'
    };
    assert.equal(p.premiumStress!.cells.length,48);
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    const row=r.horizonMechanicalRisk.find(x=>
      x.arm==='REGIME_FILTER'&&x.horizon==='2W')!;
    assert.ok(row.reasons.includes('MISSING_OR_DUPLICATED_FOLD_ARM_HORIZON_CELL'));
    assert.equal(row.sampleComplete,false);
    assert.equal(row.hysteresisCombinedStressNetPnlINR,null);
  });
  it('an extra duplicate original stress cell cannot be counted twice',()=>{
    const p=mockReports();
    p.premiumStress!.cells.push({...p.premiumStress!.cells[0]});
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.equal(r.horizonMechanicalRisk[0].sampleComplete,false);
    assert.equal(r.horizonMechanicalRisk[0].originalCombinedStressNetPnlINR,null);
  });
  it('expired-contract timing audit cannot be bypassed by green calendar and witness',()=>{
    const p=mockReports();
    p.instrumentSessions!.status='INCOMPLETE_EVIDENCE';
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.some(x=>x.startsWith('VERSIONEDINSTRUMENTSESSIONS_INSUFFICIENT')));
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.horizonMechanicalRisk[0].liveHorizonRecommendation,null);
    const wrong=mockReports();
    wrong.instrumentSessions!.originalCalendarManifestSha256='d'.repeat(64);
    const mismatch=assess(wrong);
    assert.equal(mismatch.status,'REJECTED');
    assert.ok(mismatch.errors.includes(
      'SEGMENT_RULES_NOT_BOUND_TO_SAME_SIGNED_CALENDAR_BYTES'));
  });
  it('tampered out-of-date segment rules are rejected instead of labeled merely underpowered',()=>{
    const p=mockReports();
    p.instrumentSessions!.status='REJECTED';
    const r=assess(p);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('REJECT_INSTRUMENT_SESSION_VERSION_OR_BOUND_CALENDAR'));
    assert.equal(r.productionSafe,false);
  });
  it('rejects a future-only fake +100 BID target when original matched OOS exit was censored',()=>{
    const p=mockReports();
    p.premiumPath!.cells[0].original.censoredOrSourceMismatchedPaths=1;
    p.premiumPath!.cells[0].original.pricedAndFullyObservedPaths=1;
    p.premiumPath!.cells[0].original.completeCohortMeanMaxQualifiedBidGainPoints=null;
    p.premiumPath!.cells[0].fullyObservedForDescriptiveReview=false;
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    const c=r.horizonMechanicalRisk[0];
    assert.equal(c.sampleComplete,false);
    assert.equal(c.originalCompleteNetPnlINR,null);
    assert.ok(c.reasons.includes(
      'OPTION_PREMIUM_BID_RUNUP_NOT_MATCHED_TO_ORIGINAL_EXITS'));
  });
  it('an absent or duplicated option-premium path cell cannot certify profitable horizon',()=>{
    const a=mockReports();
    a.premiumPath!.cells=a.premiumPath!.cells.filter(c=>
      !(c.arm==='REGIME_FILTER'&&c.horizon==='8W'));
    const missing=assess(a);
    assert.equal(missing.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    const b=mockReports();
    b.premiumPath!.cells.push({...b.premiumPath!.cells[0]});
    const duplicated=assess(b);
    assert.equal(duplicated.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.equal(duplicated.horizonMechanicalRisk[0].sampleComplete,false);
  });
  it('a missing or unpaired independent source session blocks readiness',()=>{
    const p=mockReports();
    p.calendar!.foldCoverage[0].expectedTradingDecisions=4;
    p.calendar!.foldCoverage[0].omittedExpectedTradingDecisions=1;
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes(
      'FOLD_0_EXPECTED_EXCHANGE_SESSIONS_NOT_RECONCILED'));
  });
  it('mismatched original archive, calendar document or phase dataset is rejected',()=>{
    const p=mockReports();
    p.source!.digestSha256='f'.repeat(64);
    assert.equal(assess(p).status,'REJECTED');
    const c=mockReports();
    c.calendar!.originalCalendarDocumentSha256='d'.repeat(64);
    assert.equal(assess(c).status,'REJECTED');
    const d=mockReports();
    d.witness!.datasetId='ANOTHER_DATASET';
    assert.equal(assess(d).status,'REJECTED');
  });
  it('a corrupted original L1 SHA or invalid signed witness is REJECTED, not merely underpowered',()=>{
    const badArchive=mockReports();
    badArchive.source!.status='CHECKSUM_MISMATCH';
    const a=assess(badArchive);
    assert.equal(a.status,'REJECTED');
    assert.ok(a.errors.includes('REJECT_ORIGINAL_VENDOR_ARCHIVE_INTEGRITY_FAILURE'));
    assert.equal(a.executionAuthorized,false);
    const badSignature=mockReports();
    badSignature.witness!.status='REJECTED';
    const b=assess(badSignature);
    assert.equal(b.status,'REJECTED');
    assert.ok(b.errors.includes(
      'REJECT_DETACHED_WITNESS_OR_PINNED_REVIEWER_TRUST_FAILURE'));
    const wrongCalendar=mockReports();
    wrongCalendar.calendar!.status='REJECTED';
    const c=assess(wrongCalendar);
    assert.equal(c.status,'REJECTED');
    assert.ok(c.errors.includes('REJECT_SEPARATE_CALENDAR_DOCUMENT_OR_SCHEMA_FAILURE'));
  });
  it('predeclared evidence protocol must match signed bundle and pinned lock',()=>{
    const p=mockReports();
    p.researchGate!.policy!.studyProtocolId='UNSIGNED_RESEARCH_PROTOCOL';
    assert.equal(assess(p).status,'REJECTED');
    const ctx=context();ctx.lockStudyProtocolId='ANOTHER_PROTOCOL';
    assert.equal(assess(mockReports(),ctx).status,'REJECTED');
    assert.equal(assess(mockReports(),context(),false).status,'REJECTED');
  });
  it('an incomplete L1 quality verdict blocks all supposed research gates',()=>{
    const p=mockReports();
    p.quality!.status='INCOMPLETE_EVIDENCE';
    p.premiumStress!.cells[0].original.scenarioCensoredExits=1;
    const r=assess(p);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.some(s=>s.includes('ORIGINALL1QUALITY_INSUFFICIENT')));
    assert.equal(r.horizonMechanicalRisk[0].sampleComplete,false);
  });
});
describe('Phase 17 raw policy-file precommitment SHA256',()=>{
  it('accepts ONLY identical separately pinned bytes and protocol binding',()=>{
    const f=lockFixture();
    assert.deepEqual(f.check().errors,[]);
    assert.equal(f.check().valid,true);
    assert.equal(f.check().actualSha256,sha(f.file));
  });
  it('rejects a late OOS threshold change after policy-lock manifest was pinned',()=>{
    const f=lockFixture();
    f.policies.marketDataQuality=bytes('{"schemaVersion":"TUNED_AFTER_WINNERS"}');
    assert.ok(f.check().errors.includes('RESEARCH_POLICY_FILE_DIGEST_MISMATCH'));
  });
  it('a self-signed protocol change or new hash pin supplied by wrong source fails',()=>{
    const f=lockFixture();
    f.manifest.studyProtocolId='TUNED_AFTER_OOS';
    const result=f.check();
    assert.ok(result.errors.includes(
      'RESEARCH_POLICY_LOCK_NOT_BOUND_TO_DATASET_AND_PROTOCOL'));
    const wrong=validatePinnedResearchPolicyLock(
      f.manifest,'f'.repeat(64),f.file,f.policies,{
        datasetId:DATASET,studyProtocolId:PROTOCOL,
        originalBundleSha256:BUNDLE_DIGEST,
        prespecifiedAt:f.manifest.prespecifiedAt
      });
    assert.ok(wrong.errors.includes('OUT_OF_BAND_RESEARCH_POLICY_LOCK_PIN_MISMATCH'));
  });
  it('post-hoc changes to premium-point thresholds invalidate eighth predeclared SHA policy lock',()=>{
    const f=lockFixture();
    f.policies.premiumPathReversal=bytes('{"candidateTargetPoints":9999}');
    assert.ok(f.check().errors.includes('RESEARCH_POLICY_FILE_DIGEST_MISMATCH'));
  });
  it('source replay with missing original archive/calendar/signers never returns permission',()=>{
    const input:FullResearchReadinessInput={
      bundleBytes:Buffer.from(JSON.stringify({some:'junk'})),
      vendorArchiveBytes:null,calendarManifestBytes:null,
      calendarDocumentBytes:null,instrumentSessionEvidenceBytes:null,
      witnessEnvelope:null,
      reviewerTrustRegistryBytes:null,
      pinnedReviewerTrustRegistrySha256:null,
      policyLockManifestBytes:null,
      pinnedPolicyLockManifestSha256:null,policies:null
    };
    const r=runAdaptiveFullResearchReadiness(input);
    assert.equal(r.status,'REJECTED');
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.nrmlLiveEnabled,false);
    assert.equal(r.brokerNativeProtectionProven,false);
    assert.ok(r.errors.includes(
      'MALFORMED_BUNDLE_CALENDAR_POLICY_LOCK_OR_REQUIRED_POLICIES'));
  });
});
