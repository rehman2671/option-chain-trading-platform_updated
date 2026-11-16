/**
 * Explicit OFFLINE research command. No broker HTTP, tokens, orders, UI
 * toggles or automated execution. Never treats an internally consistent JSON
 * bundle as independently authenticated market data.
 *
 * Synthetic test: npx tsx scripts/run-adaptive-walkforward.ts /secure/mock.json
 * Real source-attested study:
 *   npx tsx scripts/run-adaptive-walkforward.ts /secure/derived-l1.json \
 *     --source-artifact /secure/original-vendor-export.bin
 *
 * Original source bytes MUST be separately retained, not the derived bundle.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditAdaptiveSourceArtifact } from
  '../src/server/engine/ema15m/adaptiveSourceArtifactAudit.js';
import { runAdaptiveWalkForwardStudy } from
  '../src/server/engine/ema15m/adaptiveWalkForwardStudy.js';

const MAX_BYTES = 50 * 1024 * 1024;
async function fileBytes(path: string): Promise<Uint8Array> {
  const s = await stat(path);
  if (!s.isFile() || s.size < 2 || s.size > MAX_BYTES) {
    throw new Error('INVALID_OR_OVERSIZED_SOURCE_FILE_MAX_50MB');
  }
  return readFile(path);
}

async function main(): Promise<void> {
  const args=process.argv.slice(2);
  if (!((args.length===1 && !!args[0] && !args[0].startsWith('-')) ||
       (args.length===3 && !!args[0] &&
        args[1]==='--source-artifact' && !!args[2]))) {
    throw new Error(
      'USAGE: npx tsx scripts/run-adaptive-walkforward.ts <bundle.json> ' +
      '[--source-artifact <original-vendor-bytes>]'
    );
  }
  const sourcePath = args[2] ? resolve(args[2]) : null;
  const bundlePath = resolve(args[0]);
  if (sourcePath && await realpath(sourcePath) === await realpath(bundlePath)) {
    throw new Error('BUNDLE_CANNOT_BE_ITS_OWN_SOURCE_ARTIFACT');
  }
  const raw=JSON.parse(Buffer.from(await fileBytes(bundlePath)).toString('utf8'));
  const declaredReal=raw?.provenance?.synthetic === false;
  let artifactAudit = null;
  if (declaredReal || sourcePath) {
    artifactAudit = auditAdaptiveSourceArtifact(
      raw, sourcePath ? await fileBytes(sourcePath) : null
    );
    if (artifactAudit.status !== 'CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED') {
      console.error(JSON.stringify({
        status:'REJECTED',executionAuthorized:false,
        reason:'SOURCE_ARTIFACT_CHECKSUM_GATE_FAILED',
        evidence:artifactAudit
      }));
      process.exitCode=1;
      return;
    }
  }
  const result=runAdaptiveWalkForwardStudy(raw);
  console.log(JSON.stringify({
    mode:result.mode,executionAuthorized:result.executionAuthorized,
    productionSafe:result.productionSafe,status:result.status,
    empiricalProfitabilityProven:result.empiricalProfitabilityProven,
    sourceAuthenticityIndependentlyVerified:result.sourceAuthenticityIndependentlyVerified,
    checksumStatus:artifactAudit?.status ?? 'SYNTHETIC_SOURCE_NOT_REQUIRED',
    ingestionStatus:result.ingestion.status,
    counts:result.ingestion.counts,errors:result.errors,
    foldWindows:result.foldWindows,scenarios:result.scenarios,
    // All displayed results remain descriptive even when checksum matched.
    results:result.results,pairedOutOfSample:result.pairedOutOfSample,
    warnings:result.warnings
  },null,2));
  if(result.status!=='DESCRIPTIVE_ONLY') process.exitCode=1;
}
main().catch(error=>{
  // Never print raw vendor contents, tokens or headers.
  const message=error instanceof Error?error.message:'UNKNOWN_OFFLINE_STUDY_FAILURE';
  console.error('ADAPTIVE_OFFLINE_STUDY_ERROR: '+message);
  process.exitCode=1;
});
