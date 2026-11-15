/**
 * Explicit OFFLINE command. No broker login, HTTP requests, order calls, UI
 * toggles, or live execution. Source JSON must contain original event and
 * availability timestamps; Phase 4 REST receipts are not accepted.
 *
 * Usage:
 *   npx tsx scripts/run-adaptive-walkforward.ts /secure/vendor-l1.json
 *
 * Outputs a bounded summary only; never prints full licensed L1 rows.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runAdaptiveWalkForwardStudy } from
  '../src/server/engine/ema15m/adaptiveWalkForwardStudy.js';

async function main():Promise<void>{
  const args=process.argv.slice(2);
  if(args.length!==1 || !args[0] || args[0].startsWith('-'))
    throw new Error('USAGE: npx tsx scripts/run-adaptive-walkforward.ts <vendor-evidence.json>');
  const file=resolve(args[0]);
  const info=await stat(file);
  if(!info.isFile() || info.size>50*1024*1024 || info.size<2)
    throw new Error('INVALID_OR_OVERSIZED_SOURCE_FILE_MAX_50MB');
  const raw=JSON.parse(await readFile(file,'utf8'));
  const result=runAdaptiveWalkForwardStudy(raw);
  console.log(JSON.stringify({
    mode:result.mode,executionAuthorized:result.executionAuthorized,
    productionSafe:result.productionSafe,status:result.status,
    empiricalProfitabilityProven:result.empiricalProfitabilityProven,
    sourceAuthenticityIndependentlyVerified:result.sourceAuthenticityIndependentlyVerified,
    ingestionStatus:result.ingestion.status,
    counts:result.ingestion.counts,errors:result.errors,
    foldWindows:result.foldWindows,
    scenarios:result.scenarios,
    // All displayed results are DESCRIPTIVE and may be synthetic.
    results:result.results,pairedOutOfSample:result.pairedOutOfSample,
    warnings:result.warnings
  },null,2));
  if(result.status!=='DESCRIPTIVE_ONLY')process.exitCode=1;
}
main().catch(error=>{
  const message=error instanceof Error?error.message:'UNKNOWN_OFFLINE_STUDY_FAILURE';
  console.error('ADAPTIVE_OFFLINE_STUDY_ERROR: '+message);
  process.exitCode=1;
});
