/**
 * Explicit OFFLINE research command. No broker HTTP, tokens, orders or UI.
 *
 * npx tsx scripts/run-adaptive-walkforward.ts <bundle.json> \
 *   [--source-artifact <original-vendor-bytes>] \
 *   [--exit-policy <phase7-predeclared-policy.json>] \
 *   [--entry-first-policy <phase8-predeclared-policy.json>] \
 *   [--market-data-policy <phase10-predeclared-quality-policy.json>] \
 *   [--evidence-gate-policy <phase11-predeclared-evidence-policy.json>] \
 *   [--hysteresis-policy <phase12-predeclared-policy.json>] \
 *   [--matched-hysteresis-policy <phase13-predeclared-policy.json>]
 *
 * Non-synthetic source requires independently retained original artifact.
 * Phase 7 exit-policy is explicitly opt-in and MUST be predeclared, not tuned
 * on OOS outcomes. All results remain descriptive and non-executable.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditAdaptiveSourceArtifact } from
  '../src/server/engine/ema15m/adaptiveSourceArtifactAudit.js';
import { runAdaptiveWalkForwardStudy } from
  '../src/server/engine/ema15m/adaptiveWalkForwardStudy.js';
import { compareAdaptiveHysteresisMatchedOos,
  type HysteresisMatchedOosPolicy } from
  '../src/server/engine/ema15m/adaptiveHysteresisMatchedOos.js';
import { replayAdaptiveRegimeHysteresis, type HysteresisResearchPolicy } from
  '../src/server/engine/ema15m/adaptiveRegimeHysteresis.js';
import { evaluateAdaptiveResearchEvidenceGate, type AdaptiveResearchEvidencePolicy } from
  '../src/server/engine/ema15m/adaptiveResearchEvidenceGate.js';
import { auditAdaptiveL1MarketDataQuality, type AdaptiveMarketDataQualityPolicy,
  type AdaptiveMarketDataQualityReport } from
  '../src/server/engine/ema15m/adaptiveL1MarketDataQuality.js';
import { runAdaptiveEntryFirstExitStudy, type EntryFirstExitStudy } from
  '../src/server/engine/ema15m/adaptiveEntryFirstExitStudy.js';
import { ingestVendorHistoricalBundle } from
  '../src/server/engine/ema15m/adaptiveVendorIngestion.js';
import { replayAdaptiveExitPaths, type AdaptiveExitReplayPolicy } from
  '../src/server/engine/ema15m/adaptivePositionalExitReplay.js';

const MAX_BYTES=50*1024*1024;
async function fileBytes(path:string, max=MAX_BYTES):Promise<Uint8Array>{
  const s=await stat(path);
  if(!s.isFile()||s.size<2||s.size>max)
    throw new Error('INVALID_OR_OVERSIZED_SOURCE_FILE');
  return readFile(path);
}
function parseOptions(args:string[]):{
  bundlePath:string; sourcePath:string|null; exitPolicyPath:string|null;
  entryFirstPolicyPath:string|null;marketDataPolicyPath:string|null;
  evidenceGatePolicyPath:string|null;hysteresisPolicyPath:string|null;
  matchedHysteresisPolicyPath:string|null
}{
  if(!args.length||!args[0]||args[0].startsWith('-')||args.length%2===0)
    throw new Error('USAGE: <bundle.json> [--source-artifact <original>] [--exit-policy <phase7.json>] [--entry-first-policy <phase8.json>] [--market-data-policy <phase10.json>] [--evidence-gate-policy <phase11.json>] [--hysteresis-policy <phase12.json>] [--matched-hysteresis-policy <phase13.json>]');
  const flags=new Map<string,string>();
  for(let i=1;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!['--source-artifact','--exit-policy','--entry-first-policy','--market-data-policy','--evidence-gate-policy','--hysteresis-policy','--matched-hysteresis-policy'].includes(flag)||
       !value||value.startsWith('-')||flags.has(flag))
      throw new Error('INVALID_OR_DUPLICATE_OFFLINE_RESEARCH_FLAG');
    flags.set(flag,value);
  }
  return{
    bundlePath:resolve(args[0]),
    sourcePath:flags.has('--source-artifact')?resolve(flags.get('--source-artifact')!):null,
    exitPolicyPath:flags.has('--exit-policy')?resolve(flags.get('--exit-policy')!):null,
    entryFirstPolicyPath:flags.has('--entry-first-policy')?resolve(flags.get('--entry-first-policy')!):null,
    marketDataPolicyPath:flags.has('--market-data-policy')?resolve(flags.get('--market-data-policy')!):null,
    evidenceGatePolicyPath:flags.has('--evidence-gate-policy')?resolve(flags.get('--evidence-gate-policy')!):null,
    hysteresisPolicyPath:flags.has('--hysteresis-policy')?resolve(flags.get('--hysteresis-policy')!):null,
    matchedHysteresisPolicyPath:flags.has('--matched-hysteresis-policy')?resolve(flags.get('--matched-hysteresis-policy')!):null
  };
}
async function main():Promise<void>{
  const {bundlePath,sourcePath,exitPolicyPath,entryFirstPolicyPath,
    marketDataPolicyPath,evidenceGatePolicyPath,hysteresisPolicyPath,
    matchedHysteresisPolicyPath}=
    parseOptions(process.argv.slice(2));
  if(sourcePath&&await realpath(sourcePath)===await realpath(bundlePath))
    throw new Error('BUNDLE_CANNOT_BE_ITS_OWN_SOURCE_ARTIFACT');
  if(exitPolicyPath&&await realpath(exitPolicyPath)===await realpath(bundlePath))
    throw new Error('EXIT_POLICY_MUST_BE_A_SEPARATE_PRESPECIFIED_FILE');
  if(entryFirstPolicyPath&&await realpath(entryFirstPolicyPath)===await realpath(bundlePath))
    throw new Error('ENTRY_FIRST_POLICY_MUST_BE_A_SEPARATE_PRESPECIFIED_FILE');
  if(marketDataPolicyPath&&await realpath(marketDataPolicyPath)===await realpath(bundlePath))
    throw new Error('MARKET_QUALITY_POLICY_MUST_BE_A_SEPARATE_PRESPECIFIED_FILE');
  if(evidenceGatePolicyPath&&await realpath(evidenceGatePolicyPath)===await realpath(bundlePath))
    throw new Error('EVIDENCE_GATE_POLICY_MUST_BE_A_SEPARATE_PRESPECIFIED_FILE');
  if(hysteresisPolicyPath&&await realpath(hysteresisPolicyPath)===await realpath(bundlePath))
    throw new Error('HYSTERESIS_POLICY_MUST_BE_A_SEPARATE_PRESPECIFIED_FILE');
  if(matchedHysteresisPolicyPath&&
     await realpath(matchedHysteresisPolicyPath)===await realpath(bundlePath))
    throw new Error('MATCHED_POLICY_MUST_BE_A_SEPARATE_PRESPECIFIED_FILE');
  if(matchedHysteresisPolicyPath&&(!hysteresisPolicyPath||!entryFirstPolicyPath))
    throw new Error('MATCHED_OOS_REQUIRES_ENTRY_FIRST_AND_HYSTERESIS_POLICIES');
  if(evidenceGatePolicyPath&&(!marketDataPolicyPath||!entryFirstPolicyPath))
    throw new Error('EVIDENCE_GATE_REQUIRES_ENTRY_FIRST_AND_MARKET_QUALITY_POLICIES');
  const raw=JSON.parse(Buffer.from(await fileBytes(bundlePath)).toString('utf8'));
  const declaredReal=raw?.provenance?.synthetic===false;
  let artifactAudit=null;
  if(declaredReal||sourcePath){
    artifactAudit=auditAdaptiveSourceArtifact(
      raw,sourcePath?await fileBytes(sourcePath):null
    );
    if(artifactAudit.status!=='CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED'){
      console.error(JSON.stringify({
        status:'REJECTED',executionAuthorized:false,
        reason:'SOURCE_ARTIFACT_CHECKSUM_GATE_FAILED',evidence:artifactAudit
      }));
      process.exitCode=1;return;
    }
  }
  const result=runAdaptiveWalkForwardStudy(raw);
  let exitReplay=null;
  if(exitPolicyPath){
    const policy: AdaptiveExitReplayPolicy = JSON.parse(
      Buffer.from(await fileBytes(exitPolicyPath,128*1024)).toString('utf8')
    );
    const input=ingestVendorHistoricalBundle(raw).input;
    if(!input||!result.report){
      exitReplay={
        status:'REJECTED',executionAuthorized:false,
        errors:['HISTORICAL_DATASET_NOT_VALID_FOR_EXIT_REPLAY']
      };
    }else{
      const analysis=replayAdaptiveExitPaths(
        input,result.report,policy,raw.declaredExchangeSessions
      );
      // Aggregate results only. Never publish licensed instrument-level L1
      // observations or annotate synthetic results as actual profitability.
      const reasons:Record<string,number>={};
      for(const trade of analysis.trades){
        const key=trade.status+':'+trade.reason;
        reasons[key]=(reasons[key]??0)+1;
      }
      exitReplay={
        status:analysis.status,executionAuthorized:analysis.executionAuthorized,
        brokerageProtectionImplemented:analysis.brokerageProtectionImplemented,
        empiricalProfitabilityProven:analysis.empiricalProfitabilityProven,
        historicalSourceAuthenticated:analysis.historicalSourceAuthenticated,
        errors:analysis.errors,warnings:analysis.warnings,
        observedTradeCount:analysis.trades.length,
        reasonCounts:reasons,cells:analysis.cells
      };
    }
  }
  let entryFirstReplay=null;
  let entryFirstStudy:EntryFirstExitStudy|null=null;
  if(entryFirstPolicyPath){
    const phase8Policy:AdaptiveExitReplayPolicy=JSON.parse(
      Buffer.from(await fileBytes(entryFirstPolicyPath,128*1024)).toString('utf8')
    );
    const data=ingestVendorHistoricalBundle(raw).input;
    if(!data){
      entryFirstReplay={
        status:'REJECTED',executionAuthorized:false,
        errors:['VALID_VENDOR_DATASET_REQUIRED_FOR_ENTRY_FIRST_REPLAY']
      };
    }else{
      const study=runAdaptiveEntryFirstExitStudy(
        data,phase8Policy,raw.declaredExchangeSessions
      );
      entryFirstStudy=study;
      // Output ONLY group-level counts, censoring and observational PnL:
      // no licensed per-contract quote-path disclosure.
      const reasonCounts:Record<string,number>={};
      for(const o of study.outcomes)
        reasonCounts[o.status+':'+o.reason]=(reasonCounts[o.status+':'+o.reason]??0)+1;
      entryFirstReplay={
        status:study.status,selectionMethod:study.selectionMethod,
        executionAuthorized:study.executionAuthorized,
        productionSafe:study.productionSafe,
        historicalDataIndependentlyAuthenticated:study.historicalDataIndependentlyAuthenticated,
        profitabilityProven:study.profitabilityProven,
        brokerStopProtectionInstalled:study.brokerStopProtectionInstalled,
        errors:study.errors,warnings:study.warnings,
        decisionCohortCounts:study.cohort.counts,
        reasonCounts,cells:study.cells
      };
    }
  }
  let marketDataQualityAudit=null;
  let marketDataQualityStudy:AdaptiveMarketDataQualityReport|null=null;
  if(marketDataPolicyPath){
    const qualityPolicy:AdaptiveMarketDataQualityPolicy=JSON.parse(
      Buffer.from(await fileBytes(marketDataPolicyPath,128*1024)).toString('utf8')
    );
    const ingested=ingestVendorHistoricalBundle(raw);
    if(!ingested.input){
      marketDataQualityAudit={
        status:'REJECTED',executionAuthorized:false,
        errors:['INGESTED_SOURCE_ATTESTED_L1_REQUIRED_FOR_QUALITY_AUDIT']
      };
    }else{
      const report=auditAdaptiveL1MarketDataQuality(
        ingested.input,raw.declaredExchangeSessions,
        raw.executionL1,qualityPolicy
      );
      marketDataQualityStudy=report;
      const reasonCounts:Record<string,number>={};
      for(const item of report.paths)
        for(const reason of item.reasons)
          reasonCounts[reason]=(reasonCounts[reason]??0)+1;
      // Deliberately do not print licensed per-contract L1 path evidence.
      // Fold/horizon cells carry coverage & risk flags, NOT a profitability claim.
      marketDataQualityAudit={
        status:report.status,executionAuthorized:report.executionAuthorized,
        productionSafe:report.productionSafe,
        empiricalProfitabilityProven:report.empiricalProfitabilityProven,
        sourceAuthenticityIndependentlyVerified:report.sourceAuthenticityIndependentlyVerified,
        exchangeCalendarIndependentlyVerified:report.exchangeCalendarIndependentlyVerified,
        originalAvailabilityClocksIndependentlyVerified:report.originalAvailabilityClocksIndependentlyVerified,
        datasetId:report.datasetId,synthetic:report.synthetic,
        errors:report.errors,warnings:report.warnings,
        totalOutOfSampleDecisions:report.totalOutOfSampleDecisions,
        observedEntryCount:report.observedEntryCount,
        missingEntryCount:report.missingEntryCount,
        pathDispositionCounts:{
          sufficient:report.paths.filter(p=>
            p.disposition==='SUFFICIENT_SOURCE_ATTESTED_OBSERVATIONS').length,
          insufficient:report.paths.filter(p=>
            p.disposition==='MISSING_OR_UNRELIABLE_L1_PATH').length
        },
        reasonCounts,cells:report.cells
      };
    }
  }
  let evidenceGate=null;
  if(evidenceGatePolicyPath){
    const evidencePolicy:AdaptiveResearchEvidencePolicy=JSON.parse(
      Buffer.from(await fileBytes(evidenceGatePolicyPath,128*1024)).toString('utf8')
    );
    const gate=evaluateAdaptiveResearchEvidenceGate(
      result,marketDataQualityStudy,entryFirstStudy,artifactAudit,evidencePolicy
    );
    evidenceGate={
      mode:gate.mode,status:gate.status,
      executionAuthorized:gate.executionAuthorized,
      productionSafe:gate.productionSafe,
      profitabilityProven:gate.profitabilityProven,
      brokerOperationalSafetyProven:gate.brokerOperationalSafetyProven,
      sourceAuthenticityIndependentlyVerified:gate.sourceAuthenticityIndependentlyVerified,
      exchangeCalendarIndependentlyVerified:gate.exchangeCalendarIndependentlyVerified,
      timestampProvenanceIndependentlyVerified:gate.timestampProvenanceIndependentlyVerified,
      protocolRegistrationIndependentlyVerified:gate.protocolRegistrationIndependentlyVerified,
      datasetId:gate.datasetId,synthetic:gate.synthetic,
      errors:gate.errors,blockers:gate.blockers,
      foldCount:gate.foldCount,
      totalTestingSessions:gate.totalTestingSessions,
      regimeFoldEvidence:gate.regimeFoldEvidence,
      aggregateSummarySha256:gate.aggregateSummarySha256,
      reviewCells:gate.cells,
      externalReviewChecklist:gate.externalReviewChecklist,
      warnings:gate.warnings
    };
  }
  let adaptiveRegimeHysteresisStudy=null;
  if(hysteresisPolicyPath){
    const hysteresisPolicy:HysteresisResearchPolicy=JSON.parse(
      Buffer.from(await fileBytes(hysteresisPolicyPath,128*1024)).toString('utf8')
    );
    const data=ingestVendorHistoricalBundle(raw).input;
    if(!data){
      adaptiveRegimeHysteresisStudy={
        status:'REJECTED',executionAuthorized:false,
        errors:['VERIFIED_SOURCE_FORMAT_AND_CLOSED_UNDERLYING_BARS_REQUIRED']
      };
    }else{
      const study=replayAdaptiveRegimeHysteresis(
        data,raw.declaredExchangeSessions,hysteresisPolicy
      );
      const reasonCounts:Record<string,number>={};
      for(const row of study.observations)
        reasonCounts[row.reason]=(reasonCounts[row.reason]??0)+1;
      adaptiveRegimeHysteresisStudy={
        status:study.status,executionAuthorized:study.executionAuthorized,
        productionSafe:study.productionSafe,
        brokerProtectionInstalled:study.brokerProtectionInstalled,
        empiricalProfitabilityProven:study.empiricalProfitabilityProven,
        sourceAuthenticityIndependentlyVerified:study.sourceAuthenticityIndependentlyVerified,
        calendarIndependentlyAuthenticated:study.calendarIndependentlyAuthenticated,
        datasetId:study.datasetId,synthetic:study.synthetic,
        errors:study.errors,warnings:study.warnings,
        reasonCounts,foldCells:study.foldCells
      };
    }
  }
  let matchedHysteresisOosStudy=null;
  if(matchedHysteresisPolicyPath){
    const matchedPolicy:HysteresisMatchedOosPolicy=JSON.parse(
      Buffer.from(await fileBytes(matchedHysteresisPolicyPath,128*1024)).toString('utf8')
    );
    const input=ingestVendorHistoricalBundle(raw).input;
    if(!input){
      matchedHysteresisOosStudy={
        status:'REJECTED',executionAuthorized:false,
        errors:['VALID_SOURCE_ATTESTED_HISTORICAL_L1_DATASET_REQUIRED']
      };
    }else{
      const exitPolicy:AdaptiveExitReplayPolicy=JSON.parse(
        Buffer.from(await fileBytes(entryFirstPolicyPath!,128*1024)).toString('utf8')
      );
      const hysteresisPolicy:HysteresisResearchPolicy=JSON.parse(
        Buffer.from(await fileBytes(hysteresisPolicyPath!,128*1024)).toString('utf8')
      );
      const study=compareAdaptiveHysteresisMatchedOos(
        input,raw.declaredExchangeSessions,exitPolicy,
        hysteresisPolicy,matchedPolicy
      );
      matchedHysteresisOosStudy={
        status:study.status,executionAuthorized:study.executionAuthorized,
        productionSafe:study.productionSafe,
        profitabilityProven:study.profitabilityProven,
        brokerStopsInstalled:study.brokerStopsInstalled,
        historicalSourceAuthenticated:study.historicalSourceAuthenticated,
        exchangeCalendarAuthenticated:study.exchangeCalendarAuthenticated,
        originalClockIndependentlyAuthenticated:study.originalClockIndependentlyAuthenticated,
        method:study.method,datasetId:study.datasetId,synthetic:study.synthetic,
        originalExitStatus:study.originalExitStatus,
        stabilizedExitStatus:study.stabilizedExitStatus,
        hysteresisStatus:study.hysteresisStatus,
        totalDecisionCells:study.totalDecisionCells,
        errors:study.errors,warnings:study.warnings,
        cells:study.cells
      };
    }
  }
  console.log(JSON.stringify({
    mode:result.mode,executionAuthorized:result.executionAuthorized,
    productionSafe:result.productionSafe,status:result.status,
    empiricalProfitabilityProven:result.empiricalProfitabilityProven,
    sourceAuthenticityIndependentlyVerified:result.sourceAuthenticityIndependentlyVerified,
    checksumStatus:artifactAudit?.status??'SYNTHETIC_SOURCE_NOT_REQUIRED',
    ingestionStatus:result.ingestion.status,
    counts:result.ingestion.counts,errors:result.errors,
    foldWindows:result.foldWindows,scenarios:result.scenarios,
    results:result.results,pairedOutOfSample:result.pairedOutOfSample,
    marketRegimeAudit:result.marketRegimeAudit,
    positionalExitReplay:exitReplay,
    independentEntryFirstExitStudy:entryFirstReplay,
    marketDataQualityAudit,
    independentEvidenceReviewGate:evidenceGate,
    adaptiveRegimeHysteresisStudy,
    matchedHysteresisOosStudy,warnings:result.warnings
  },null,2));
  if(result.status!=='DESCRIPTIVE_ONLY'||
     (exitReplay!==null&&exitReplay.status!=='DESCRIPTIVE_ONLY')||
     (entryFirstReplay!==null&&entryFirstReplay.status!=='DESCRIPTIVE_ONLY')||
     (marketDataQualityAudit!==null&&marketDataQualityAudit.status!=='DESCRIPTIVE_ONLY')||
     (evidenceGate!==null&&evidenceGate.status!=='EXTERNAL_REVIEW_REQUIRED')||
     (adaptiveRegimeHysteresisStudy!==null&&
       adaptiveRegimeHysteresisStudy.status!=='DESCRIPTIVE_ONLY')||
     (matchedHysteresisOosStudy!==null&&
       matchedHysteresisOosStudy.status!=='DESCRIPTIVE_ONLY'))
    process.exitCode=1;
}
main().catch(error=>{
  const message=error instanceof Error?error.message:'UNKNOWN_OFFLINE_STUDY_FAILURE';
  console.error('ADAPTIVE_OFFLINE_STUDY_ERROR: '+message);
  process.exitCode=1;
});
