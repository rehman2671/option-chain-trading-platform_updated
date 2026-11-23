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
 *   [--matched-hysteresis-policy <phase13-predeclared-policy.json>] \
 *   [--premium-stress-policy <phase14-predeclared-policy.json>] \
 *   [--exchange-calendar-evidence <phase15-separate-calendar.json>] \
 *   [--calendar-source-document <separate-original-calendar-file>] \
 *   [--signed-evidence-envelope <phase16-detached-sigs.json>] \
 *   [--reviewer-trust-registry <operator-out-of-band-pinned-keys.json>] \
 *   [--pinned-reviewer-trust-sha256 <out-of-band-approved-64-hex-digest>]
 *
 * Non-synthetic source requires independently retained original artifact.
 * Phase 7 exit-policy is explicitly opt-in and MUST be predeclared, not tuned
 * on OOS outcomes. All results remain descriptive and non-executable.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditAdaptiveSignedEvidenceWitness,
  type ResearchEvidenceWitnessEnvelope } from
  '../src/server/engine/ema15m/adaptiveSignedEvidenceWitness.js';
import { auditAdaptiveCrossSourceExchangeCalendar,
  type IndependentlySuppliedCalendarEvidence } from
  '../src/server/engine/ema15m/adaptiveCrossSourceCalendarAudit.js';
import { auditAdaptiveSourceArtifact } from
  '../src/server/engine/ema15m/adaptiveSourceArtifactAudit.js';
import { runAdaptiveWalkForwardStudy } from
  '../src/server/engine/ema15m/adaptiveWalkForwardStudy.js';
import { auditAdaptiveMatchedPremiumCostDepthStress,
  type PremiumCostDepthStressPolicy } from
  '../src/server/engine/ema15m/adaptiveMatchedPremiumCostDepthStress.js';
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
  matchedHysteresisPolicyPath:string|null;premiumStressPolicyPath:string|null;
  externalCalendarPath:string|null;calendarSourceDocumentPath:string|null;
  witnessEnvelopePath:string|null;reviewerTrustRegistryPath:string|null;
  pinnedReviewerTrustSha256:string|null
}{
  if(!args.length||!args[0]||args[0].startsWith('-')||args.length%2===0)
    throw new Error('USAGE: <bundle.json> [--source-artifact <original>] [--exit-policy <phase7.json>] [--entry-first-policy <phase8.json>] [--market-data-policy <phase10.json>] [--evidence-gate-policy <phase11.json>] [--hysteresis-policy <phase12.json>] [--matched-hysteresis-policy <phase13.json>] [--premium-stress-policy <phase14.json>] [--exchange-calendar-evidence <phase15.json>] [--calendar-source-document <original-exchange-archive>] [--signed-evidence-envelope <phase16.json>] [--reviewer-trust-registry <operator-pinned-keys.json>] [--pinned-reviewer-trust-sha256 <64-hex-out-of-band-pin>]');
  const flags=new Map<string,string>();
  for(let i=1;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!['--source-artifact','--exit-policy','--entry-first-policy','--market-data-policy','--evidence-gate-policy','--hysteresis-policy','--matched-hysteresis-policy','--premium-stress-policy','--exchange-calendar-evidence','--calendar-source-document','--signed-evidence-envelope','--reviewer-trust-registry','--pinned-reviewer-trust-sha256'].includes(flag)||
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
    matchedHysteresisPolicyPath:flags.has('--matched-hysteresis-policy')?resolve(flags.get('--matched-hysteresis-policy')!):null,
    premiumStressPolicyPath:flags.has('--premium-stress-policy')?resolve(flags.get('--premium-stress-policy')!):null,
    externalCalendarPath:flags.has('--exchange-calendar-evidence')?resolve(flags.get('--exchange-calendar-evidence')!):null,
    calendarSourceDocumentPath:flags.has('--calendar-source-document')?resolve(flags.get('--calendar-source-document')!):null,
    witnessEnvelopePath:flags.has('--signed-evidence-envelope')?resolve(flags.get('--signed-evidence-envelope')!):null,
    reviewerTrustRegistryPath:flags.has('--reviewer-trust-registry')?resolve(flags.get('--reviewer-trust-registry')!):null,
    pinnedReviewerTrustSha256:flags.get('--pinned-reviewer-trust-sha256')??null
  };
}
async function main():Promise<void>{
  const {bundlePath,sourcePath,exitPolicyPath,entryFirstPolicyPath,
    marketDataPolicyPath,evidenceGatePolicyPath,hysteresisPolicyPath,
    matchedHysteresisPolicyPath,premiumStressPolicyPath,
    externalCalendarPath,calendarSourceDocumentPath,
    witnessEnvelopePath,reviewerTrustRegistryPath,
    pinnedReviewerTrustSha256}=
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
  if(premiumStressPolicyPath&&
     await realpath(premiumStressPolicyPath)===await realpath(bundlePath))
    throw new Error('PREMIUM_STRESS_POLICY_MUST_BE_SEPARATELY_PREDECLARED');
  if(premiumStressPolicyPath&&
     (!matchedHysteresisPolicyPath||!hysteresisPolicyPath||!entryFirstPolicyPath))
    throw new Error('PREMIUM_STRESS_REQUIRES_PHASE8_PHASE12_PHASE13_POLICIES');
  if(matchedHysteresisPolicyPath&&(!hysteresisPolicyPath||!entryFirstPolicyPath))
    throw new Error('MATCHED_OOS_REQUIRES_ENTRY_FIRST_AND_HYSTERESIS_POLICIES');
  if(evidenceGatePolicyPath&&(!marketDataPolicyPath||!entryFirstPolicyPath))
    throw new Error('EVIDENCE_GATE_REQUIRES_ENTRY_FIRST_AND_MARKET_QUALITY_POLICIES');
  if(Boolean(externalCalendarPath)!==Boolean(calendarSourceDocumentPath))
    throw new Error('SEPARATE_CALENDAR_MANIFEST_AND_ORIGINAL_DOCUMENT_ARE_BOTH_REQUIRED');
  if(externalCalendarPath&&calendarSourceDocumentPath){
    const distinct=[bundlePath,externalCalendarPath,calendarSourceDocumentPath];
    if(sourcePath)distinct.push(sourcePath);
    const real=await Promise.all(distinct.map(p=>realpath(p)));
    if(new Set(real).size!==real.length)
      throw new Error('CALENDAR_DOCUMENT_AND_METADATA_MUST_BE_SEPARATE_FROM_BUNDLE_AND_L1_SOURCE');
  }
  if(Boolean(witnessEnvelopePath)!==Boolean(reviewerTrustRegistryPath))
    throw new Error('SIGNATURE_ENVELOPE_AND_OUT_OF_BAND_REVIEWER_TRUST_ARE_BOTH_REQUIRED');
  if(Boolean(witnessEnvelopePath)!==Boolean(pinnedReviewerTrustSha256))
    throw new Error('SIGNED_WITNESS_REQUIRES_SEPARATE_OUT_OF_BAND_REGISTRY_SHA256_PIN');
  if(pinnedReviewerTrustSha256&&!/^[a-f0-9]{64}$/.test(pinnedReviewerTrustSha256))
    throw new Error('INVALID_PINNED_REGISTRY_SHA256_FORMAT');
  if(witnessEnvelopePath&&reviewerTrustRegistryPath){
    if(!sourcePath||!externalCalendarPath||!calendarSourceDocumentPath)
      throw new Error('SIGNED_WITNESS_REQUIRES_VENDOR_ARCHIVE_AND_COMPLETE_PHASE15_CALENDAR');
    const distinct=[bundlePath,sourcePath,externalCalendarPath,
      calendarSourceDocumentPath,witnessEnvelopePath,reviewerTrustRegistryPath];
    const real=await Promise.all(distinct.map(p=>realpath(p)));
    if(new Set(real).size!==real.length)
      throw new Error('SIGNED_EVIDENCE_REVIEW_FILES_MUST_ALL_BE_DISTINCT');
  }
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
  let externalCalendarCoverageAudit=null;
  if(externalCalendarPath&&calendarSourceDocumentPath){
    const calendar:IndependentlySuppliedCalendarEvidence=JSON.parse(
      Buffer.from(await fileBytes(externalCalendarPath,1024*1024)).toString('utf8')
    );
    const report=auditAdaptiveCrossSourceExchangeCalendar(
      raw,calendar,await fileBytes(calendarSourceDocumentPath)
    );
    externalCalendarCoverageAudit={
      status:report.status,mode:report.mode,
      executionAuthorized:report.executionAuthorized,
      productionSafe:report.productionSafe,
      profitabilityProven:report.profitabilityProven,
      exchangeCalendarIndependentlyAuthenticated:
        report.exchangeCalendarIndependentlyAuthenticated,
      sourceDocumentIssuerVerified:report.sourceDocumentIssuerVerified,
      originalFeedClockIndependentlyAuthenticated:
        report.originalFeedClockIndependentlyAuthenticated,
      originalExpiryScheduleIndependentlyAuthenticated:
        report.originalExpiryScheduleIndependentlyAuthenticated,
      sourceDocumentLicenseIndependentlyVerified:
        report.sourceDocumentLicenseIndependentlyVerified,
      sourceChecksumMatched:report.sourceChecksumMatched,
      originalCalendarDocumentSha256:report.originalCalendarDocumentSha256,
      datasetId:report.datasetId,synthetic:report.synthetic,
      exchange:report.exchange,errors:report.errors,blockers:report.blockers,
      coveredCalendarDays:report.coveredCalendarDays,
      coveredTradingDays:report.coveredTradingDays,
      coveredClosedDays:report.coveredClosedDays,
      specialSessionDays:report.specialSessionDays,
      sourceDecisionSessions:report.sourceDecisionSessions,
      sourceDeclaredTradingSessions:report.sourceDeclaredTradingSessions,
      missingVendorTradingSessions:report.missingVendorTradingSessions,
      extraVendorTradingSessions:report.extraVendorTradingSessions,
      mismatchedSessionWindows:report.mismatchedSessionWindows,
      missingDecisionSessions:report.missingDecisionSessions,
      optionL1OutsideCalendarCount:report.optionL1OutsideCalendarCount,
      vendorSnapshotOrCandleOutsideCalendarCount:
        report.vendorSnapshotOrCandleOutsideCalendarCount,
      missingContractExpiryReferences:report.missingContractExpiryReferences,
      nonTradingContractExpiryCount:report.nonTradingContractExpiryCount,
      foldCoverage:report.foldCoverage,warnings:report.warnings
    };
  }
  let signedEvidenceWitnessAudit=null;
  if(witnessEnvelopePath&&reviewerTrustRegistryPath){
    const envelope:ResearchEvidenceWitnessEnvelope=JSON.parse(
      Buffer.from(await fileBytes(witnessEnvelopePath,256*1024)).toString('utf8')
    );
    const witness=auditAdaptiveSignedEvidenceWitness({
      bundleBytes:await fileBytes(bundlePath),
      vendorArchiveBytes:await fileBytes(sourcePath!),
      calendarManifestBytes:await fileBytes(externalCalendarPath!,1024*1024),
      calendarDocumentBytes:await fileBytes(calendarSourceDocumentPath!),
      envelope,
      operatorTrustRegistryBytes:await fileBytes(reviewerTrustRegistryPath,256*1024),
      expectedOperatorTrustRegistrySha256:pinnedReviewerTrustSha256
    });
    signedEvidenceWitnessAudit={
      status:witness.status,mode:witness.mode,
      executionAuthorized:witness.executionAuthorized,
      productionSafe:witness.productionSafe,
      profitabilityProven:witness.profitabilityProven,
      nativeBrokerProtectionInstalled:witness.nativeBrokerProtectionInstalled,
      exchangeIssuerAuthenticated:witness.exchangeIssuerAuthenticated,
      vendorDataOriginAuthenticated:witness.vendorDataOriginAuthenticated,
      originalAvailabilityClockAuthenticated:
        witness.originalAvailabilityClockAuthenticated,
      historicalLicenseIndependentlyVerified:
        witness.historicalLicenseIndependentlyVerified,
      reviewerIdentityIndependentlyAuthenticated:
        witness.reviewerIdentityIndependentlyAuthenticated,
      trustedTimestampEstablished:witness.trustedTimestampEstablished,
      pinnedTrustRegistryDigestMatched:witness.pinnedTrustRegistryDigestMatched,
      operatorPinnedTrustRegistrySha256:witness.operatorPinnedTrustRegistrySha256,
      datasetId:witness.datasetId,synthetic:witness.synthetic,
      sourceChecksumMatched:witness.sourceChecksumMatched,
      calendarChecksumMatched:witness.calendarChecksumMatched,
      reviewedExchangeCalendarConsistent:witness.reviewedExchangeCalendarConsistent,
      bundleSha256:witness.bundleSha256,
      calendarManifestSha256:witness.calendarManifestSha256,
      calendarSourceDocumentSha256:witness.calendarSourceDocumentSha256,
      originalVendorArchiveSha256:witness.originalVendorArchiveSha256,
      validDetachedWitnessCount:witness.validDetachedWitnessCount,
      pinnedKeyFingerprintByRole:witness.pinnedKeyFingerprintByRole,
      signedPayloadSha256ByRole:witness.signedPayloadSha256ByRole,
      errors:witness.errors,blockers:witness.blockers,
      calendarBlockers:witness.calendarBlockers,
      externalReviewChecklist:witness.externalReviewChecklist,
      warnings:witness.warnings
    };
  }
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
  let premiumCostDepthStressAudit=null;
  if(premiumStressPolicyPath){
    const premiumStressPolicy:PremiumCostDepthStressPolicy=JSON.parse(
      Buffer.from(await fileBytes(premiumStressPolicyPath,128*1024)).toString('utf8')
    );
    const input=ingestVendorHistoricalBundle(raw).input;
    if(!input){
      premiumCostDepthStressAudit={
        status:'REJECTED',executionAuthorized:false,
        errors:['ORIGINAL_SOURCE_ATTESTED_OPTION_L1_REQUIRED_FOR_STRESS_AUDIT']
      };
    }else{
      const exitPolicy:AdaptiveExitReplayPolicy=JSON.parse(
        Buffer.from(await fileBytes(entryFirstPolicyPath!,128*1024)).toString('utf8')
      );
      const hysteresisPolicy:HysteresisResearchPolicy=JSON.parse(
        Buffer.from(await fileBytes(hysteresisPolicyPath!,128*1024)).toString('utf8')
      );
      const matchedPolicy:HysteresisMatchedOosPolicy=JSON.parse(
        Buffer.from(await fileBytes(matchedHysteresisPolicyPath!,128*1024)).toString('utf8')
      );
      const audit=auditAdaptiveMatchedPremiumCostDepthStress(
        input,raw.declaredExchangeSessions,exitPolicy,hysteresisPolicy,
        matchedPolicy,premiumStressPolicy
      );
      // Aggregate decision, censor, price-stress and horizon-risk cells only.
      // NEVER print licensed instrument-level historical option quotes.
      premiumCostDepthStressAudit={
        status:audit.status,executionAuthorized:audit.executionAuthorized,
        productionSafe:audit.productionSafe,
        profitabilityProven:audit.profitabilityProven,
        brokerFillsAuthenticated:audit.brokerFillsAuthenticated,
        nativeProtectionInstalled:audit.nativeProtectionInstalled,
        originalMarketDataIndependentlyAuthenticated:
          audit.originalMarketDataIndependentlyAuthenticated,
        exchangeCalendarIndependentlyVerified:
          audit.exchangeCalendarIndependentlyVerified,
        scenarioPricesAreObservedTrades:audit.scenarioPricesAreObservedTrades,
        datasetId:audit.datasetId,synthetic:audit.synthetic,
        phase13Status:audit.phase13Status,
        originalEntryFirstStatus:audit.originalEntryFirstStatus,
        stabilizedEntryFirstStatus:audit.stabilizedEntryFirstStatus,
        errors:audit.errors,warnings:audit.warnings,
        horizonSummary:audit.horizonSummary,
        cells:audit.cells
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
    matchedHysteresisOosStudy,
    premiumCostDepthStressAudit,
    externalCalendarCoverageAudit,
    signedEvidenceWitnessAudit,warnings:result.warnings
  },null,2));
  if(result.status!=='DESCRIPTIVE_ONLY'||
     (exitReplay!==null&&exitReplay.status!=='DESCRIPTIVE_ONLY')||
     (entryFirstReplay!==null&&entryFirstReplay.status!=='DESCRIPTIVE_ONLY')||
     (marketDataQualityAudit!==null&&marketDataQualityAudit.status!=='DESCRIPTIVE_ONLY')||
     (evidenceGate!==null&&evidenceGate.status!=='EXTERNAL_REVIEW_REQUIRED')||
     (adaptiveRegimeHysteresisStudy!==null&&
       adaptiveRegimeHysteresisStudy.status!=='DESCRIPTIVE_ONLY')||
     (matchedHysteresisOosStudy!==null&&
       matchedHysteresisOosStudy.status!=='DESCRIPTIVE_ONLY')||
     (premiumCostDepthStressAudit!==null&&
       premiumCostDepthStressAudit.status!=='DESCRIPTIVE_ONLY')||
     (externalCalendarCoverageAudit!==null&&
       externalCalendarCoverageAudit.status!==
         'CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED')||
     (signedEvidenceWitnessAudit!==null&&
       signedEvidenceWitnessAudit.status!==
         'SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED'))
    process.exitCode=1;
}
main().catch(error=>{
  const message=error instanceof Error?error.message:'UNKNOWN_OFFLINE_STUDY_FAILURE';
  console.error('ADAPTIVE_OFFLINE_STUDY_ERROR: '+message);
  process.exitCode=1;
});
