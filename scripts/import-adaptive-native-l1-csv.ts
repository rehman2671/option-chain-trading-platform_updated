/**
 * Phase22 original native L1 CSV import: local OFFLINE only, never broker I/O.
 *
 * npx tsx scripts/import-adaptive-native-l1-csv.ts <original-bundle.json> \
 *   --original-native-l1-csv <original-source.csv> \
 *   --calendar-evidence <full-separate-calendar.json> \
 *   --column-map <native-source-map.json> \
 *   --pinned-column-map-sha256 <independently-approved-64hex> \
 *   [--private-output-bundle /outside/repository/candidate-bundle.json]
 *
 * No original licensed prices/quotes are printed or committed by this tool.
 * Optional output requires a FULL Phase5 valid candidate, is owner-only
 * mode 0600, is CREATE-ONLY (never overwritten), and is not exchange proof.
 */
import {readFile,realpath,stat,open} from 'node:fs/promises';
import {dirname,isAbsolute,resolve,sep} from 'node:path';
import {
  bridgeAdaptiveNativeL1Csv
} from '../src/server/engine/ema15m/adaptiveNativeL1CsvBridge.js';
import {
  ingestVendorHistoricalBundle
} from '../src/server/engine/ema15m/adaptiveVendorIngestion.js';

const mandatory=[
  '--original-native-l1-csv','--calendar-evidence',
  '--column-map','--pinned-column-map-sha256'
] as const;
const OUTPUT='--private-output-bundle';
const SHA=/^[a-f0-9]{64}$/;
async function sourceBytes(file:string,max:number){
  const s=await stat(file);
  if(!s.isFile()||s.size<=1||s.size>max)
    throw Error('MISSING_OR_OVERSIZED_ORIGINAL_SOURCE_FILE');
  return readFile(file);
}
async function run(){
  const args=process.argv.slice(2);
  if(!args.length||args[0].startsWith('--')||
     (args.length!==9&&args.length!==11))
    throw Error('USAGE: <original-bundle.json> '+
      mandatory.map(x=>x+' <value>').join(' ')+
      ' [--private-output-bundle <outside-repository-path>]');
  const flags=new Map<string,string>();
  for(let i=1;i<args.length;i+=2){
    const k=args[i],v=args[i+1];
    if(![...mandatory,OUTPUT].includes(k as typeof mandatory[number])||
       !v||flags.has(k)||v.startsWith('--'))
      throw Error('MISSING_OR_DUPLICATE_VENDOR_CSV_FLAG');
    flags.set(k,v);
  }
  if(mandatory.some(x=>!flags.has(x))||
     !SHA.test(flags.get('--pinned-column-map-sha256')??''))
    throw Error('INDEPENDENTLY_PINNED_ORIGINAL_COLUMN_MAP_SHA_REQUIRED');
  const files=[
    resolve(args[0]),
    resolve(flags.get('--original-native-l1-csv')!),
    resolve(flags.get('--calendar-evidence')!),
    resolve(flags.get('--column-map')!)
  ];
  const real=await Promise.all(files.map(f=>realpath(f)));
  if(new Set(real).size!==files.length)
    throw Error('SAME_FILE_OR_SYMLINK_CANNOT_STAND_FOR_MULTIPLE_SOURCE_TYPES');
  const [bundle,csv,cal,map]=await Promise.all(files.map((f,i)=>
    sourceBytes(f,i<2?50*1024*1024:1024*1024)));
  const outcome=bridgeAdaptiveNativeL1Csv(
    bundle,csv,cal,map,flags.get('--pinned-column-map-sha256'));
  // Only sanitized, aggregated evidence. NO quotes, broker IDs, license docs,
  // individual instrument record IDs, or source-file paths.
  console.log(JSON.stringify(outcome.report,null,2));
  if(outcome.report.status!==
     'CANDIDATE_L1_ROWS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED'||
     !outcome.derivedBundle){
    process.exitCode=1;return;
  }
  const output=flags.get(OUTPUT);
  if(!output)return;
  if(!isAbsolute(output))
    throw Error('PRIVATE_OUTPUT_BUNDLE_PATH_MUST_BE_ABSOLUTE');
  const full=resolve(output),parent=await realpath(dirname(full));
  const repo=await realpath(process.cwd());
  if(parent===repo||parent.startsWith(repo+sep))
    throw Error('LICENSED_CSV_OUTPUT_MUST_NOT_BE_WRITTEN_INSIDE_REPOSITORY');
  if(files.includes(full)||real.includes(full))
    throw Error('OUTPUT_CANNOT_REPLACE_ORIGINAL_EVIDENCE');
  const checked=ingestVendorHistoricalBundle(outcome.derivedBundle);
  if(!checked.schemaValid)
    throw Error('CANDIDATE_REJECTED_BY_EXISTING_PHASE5_HISTORICAL_INGESTION');
  // Only local explicit opt-in creates a private, non-overwritable file.
  const handle=await open(full,'wx',0o600);
  try{
    await handle.writeFile(JSON.stringify(outcome.derivedBundle));
    await handle.sync();
  }finally{
    await handle.close();
  }
  console.log('PRIVATE_CANDIDATE_BUNDLE_CREATED_EXTERNAL_AUTHENTICATION_REQUIRED');
}
run().catch(e=>{
  // No exception stack or file content. Safe code-only summary.
  const code=(e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message))?
    e.message:'SOURCE_BRIDGE_LOCAL_FILE_OR_VALIDATION_ERROR';
  console.error('OFFLINE_NATIVE_L1_CSV_IMPORT_BLOCKED: '+code);
  process.exitCode=1;
});
