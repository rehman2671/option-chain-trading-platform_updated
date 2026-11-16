/**
 * Explicit OFFLINE research command. No broker HTTP, tokens, orders or UI.
 *
 * npx tsx scripts/run-adaptive-walkforward.ts <bundle.json> \
 *   [--source-artifact <original-vendor-bytes>] \
 *   [--exit-policy <predeclared-exit-policy.json>]
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
  bundlePath:string; sourcePath:string|null; exitPolicyPath:string|null
}{
  if(!args.length||!args[0]||args[0].startsWith('-')||args.length%2===0)
    throw new Error('USAGE: <bundle.json> [--source-artifact <original>] [--exit-policy <policy.json>]');
  const flags=new Map<string,string>();
  for(let i=1;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!['--source-artifact','--exit-policy'].includes(flag)||
       !value||value.startsWith('-')||flags.has(flag))
      throw new Error('INVALID_OR_DUPLICATE_OFFLINE_RESEARCH_FLAG');
    flags.set(flag,value);
  }
  return{
    bundlePath:resolve(args[0]),
    sourcePath:flags.has('--source-artifact')?resolve(flags.get('--source-artifact')!):null,
    exitPolicyPath:flags.has('--exit-policy')?resolve(flags.get('--exit-policy')!):null
  };
}
async function main():Promise<void>{
  const {bundlePath,sourcePath,exitPolicyPath}=parseOptions(process.argv.slice(2));
  if(sourcePath&&await realpath(sourcePath)===await realpath(bundlePath))
    throw new Error('BUNDLE_CANNOT_BE_ITS_OWN_SOURCE_ARTIFACT');
  if(exitPolicyPath&&await realpath(exitPolicyPath)===await realpath(bundlePath))
    throw new Error('EXIT_POLICY_MUST_BE_A_SEPARATE_PRESPECIFIED_FILE');
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
    const policy=JSON.parse(Buffer.from(await fileBytes(exitPolicyPath,128*1024)).toString('utf8'))
      as AdaptiveExitReplayPolicy;
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
    positionalExitReplay:exitReplay,warnings:result.warnings
  },null,2));
  if(result.status!=='DESCRIPTIVE_ONLY'||
     (exitReplay!==null&&exitReplay.status!=='DESCRIPTIVE_ONLY'))
    process.exitCode=1;
}
main().catch(error=>{
  const message=error instanceof Error?error.message:'UNKNOWN_OFFLINE_STUDY_FAILURE';
  console.error('ADAPTIVE_OFFLINE_STUDY_ERROR: '+message);
  process.exitCode=1;
});
