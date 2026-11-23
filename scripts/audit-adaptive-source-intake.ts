/**
 * Phase 21 — standalone OFFLINE original market-data acquisition audit.
 * No credentials, broker imports, network, trading or licensed quote export.
 *
 * npx tsx scripts/audit-adaptive-source-intake.ts <bundle.json> \
 *   --original-vendor-archive <immutable-original-vendor-bytes> \
 *   --calendar-evidence <independent-trading-calendar.json> \
 *   --original-calendar-document <independent-original-document> \
 *   --source-intake-manifest <phase21-source-intake-ledger.json>
 *
 * This prints aggregate counts and blocker codes ONLY; neither a zero exit
 * code nor a matching SHA256 certifies exchange issuance, rights, original
 * timestamps or any historical execution.
 */
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  auditAdaptiveExternalOriginalSourceIntake,
  type ExternalOriginalSourceIntakeV1
} from '../src/server/engine/ema15m/adaptiveExternalOriginalSourceIntake.js';
import type {VerifiedHistoricalBundleV1} from
  '../src/server/engine/ema15m/adaptiveVendorIngestion.js';
import type {IndependentlySuppliedCalendarEvidence} from
  '../src/server/engine/ema15m/adaptiveCrossSourceCalendarAudit.js';

const FLAGS=[
  '--original-vendor-archive','--calendar-evidence',
  '--original-calendar-document','--source-intake-manifest'
] as const;
type Flag=typeof FLAGS[number];
const isFlag=(s:string):s is Flag=>
  (FLAGS as readonly string[]).includes(s);
const MAX_SOURCE=50*1024*1024,MAX_MANIFEST=1024*1024;
async function exactBytes(file:string,cap:number):Promise<Uint8Array>{
  const s=await stat(file);
  if(!s.isFile()||s.size<2||s.size>cap)
    throw Error('ORIGINAL_SOURCE_FILE_EMPTY_INVALID_OR_EXCEEDS_SIZE_CAP');
  return readFile(file);
}
function json<T>(b:Uint8Array):T{
  const x=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
  if(!x||typeof x!=='object'||Array.isArray(x))
    throw Error('ORIGINAL_SOURCE_MANIFEST_NOT_JSON_OBJECT');
  return x as T;
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==1+FLAGS.length*2||!args[0]||args[0].startsWith('--'))
    throw Error('USAGE: <bundle.json> '+
      FLAGS.map(x=>x+' <file-path>').join(' '));
  const options=new Map<Flag,string>();
  for(let i=1;i<args.length;i+=2){
    if(!isFlag(args[i])||!args[i+1]||args[i+1].startsWith('--')||
       options.has(args[i] as Flag))
      throw Error('MISSING_UNSUPPORTED_OR_DUPLICATE_SOURCE_FILE_ARGUMENT');
    options.set(args[i] as Flag,resolve(args[i+1]));
  }
  if(options.size!==FLAGS.length)
    throw Error('ALL_SEPARATE_SOURCE_MANIFESTS_AND_ARCHIVES_REQUIRED');
  const paths=[resolve(args[0]),...FLAGS.map(x=>options.get(x)!)];
  const real=await Promise.all(paths.map(p=>realpath(p)));
  if(new Set(real).size!==paths.length)
    throw Error('ONE_FILE_OR_SYMLINK_CANNOT_SATISFY_MULTIPLE_INDEPENDENT_SOURCES');
  const [bundle,archive,calendarFile,calendarDocument,intakeFile]=
    await Promise.all(paths.map((p,i)=>exactBytes(p,
      i===0||i===1||i===3?MAX_SOURCE:MAX_MANIFEST)));
  const report=auditAdaptiveExternalOriginalSourceIntake(
    json<VerifiedHistoricalBundleV1>(bundle),bundle,archive,
    json<IndependentlySuppliedCalendarEvidence>(calendarFile),
    calendarFile,calendarDocument,
    json<ExternalOriginalSourceIntakeV1>(intakeFile),intakeFile
  );
  // No original quote bytes, delivery refs, entitlement IDs, keys or
  // instrument timestamps are output.
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='SOURCE_DECLARATIONS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED')
    process.exitCode=1;
}
main().catch(error=>{
  console.error('OFFLINE_SOURCE_INTAKE_ERROR: '+
    (error instanceof Error?error.message:'INVALID_OR_MISSING_SOURCE_FILES'));
  process.exitCode=1;
});
