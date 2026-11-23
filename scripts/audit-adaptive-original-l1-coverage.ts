/**
 * Phase23 original-L1 source continuity review.
 * npx tsx scripts/audit-adaptive-original-l1-coverage.ts <original-bundle.json> \
 *   --calendar-evidence <independent-original-calendar.json> \
 *   --continuity-policy <predeclared-continuity-policy.json> \
 *   --pinned-continuity-policy-sha256 <independent-64hex>
 *
 * An INTERNAL observation diagnostic, not independent feed-clock proof or
 * permission to use/copy any vendor licensed historical quotes.
 * Only source-day aggregates and reason codes are emitted.
 */
import {stat,readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  auditAdaptiveOriginalL1CaptureContinuity
} from '../src/server/engine/ema15m/adaptiveOriginalL1CaptureContinuity.js';

const SHA=/^[a-f0-9]{64}$/;
async function input(file:string,max:number):Promise<Uint8Array>{
  const s=await stat(file);
  if(!s.isFile()||s.size<2||s.size>max)
    throw Error('MISSING_OR_OVERSIZED_ORIGINAL_SOURCE_INPUT');
  return readFile(file);
}
async function main(){
  const argv=process.argv.slice(2);
  if(argv.length!==7||!argv[0]||argv[0].startsWith('--'))
    throw Error('USAGE: <original-bundle.json> '+
      '--calendar-evidence <calendar.json> --continuity-policy <policy.json> '+
      '--pinned-continuity-policy-sha256 <64hex>');
  const flags=new Map<string,string>();
  for(let i=1;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if(!['--calendar-evidence','--continuity-policy',
      '--pinned-continuity-policy-sha256'].includes(key)||
       !value||value.startsWith('--')||flags.has(key))
      throw Error('DUPLICATE_UNKNOWN_OR_MISSING_CONTINUITY_SOURCE_ARGUMENT');
    flags.set(key,value);
  }
  const pin=flags.get('--pinned-continuity-policy-sha256')??'';
  if(flags.size!==3||!SHA.test(pin))
    throw Error('INDEPENDENTLY_PINNED_CONTINUITY_POLICY_REQUIRED');
  const files=[resolve(argv[0]),
    resolve(flags.get('--calendar-evidence')!),
    resolve(flags.get('--continuity-policy')!)];
  const real=await Promise.all(files.map(x=>realpath(x)));
  if(new Set(real).size!==files.length)
    throw Error('SOURCE_BUNDLE_CALENDAR_AND_POLICY_MUST_BE_DIFFERENT_ORIGINAL_FILES');
  const [bundle,cal,policy]=await Promise.all(files.map((f,i)=>
    input(f,i===0?50*1024*1024:i===1?1024*1024:64*1024)));
  const result=auditAdaptiveOriginalL1CaptureContinuity(
    bundle,cal,policy,pin);
  console.log(JSON.stringify(result,null,2));
  if(result.status!==
     'OBSERVED_SOURCE_COVERAGE_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED')
    process.exitCode=1;
}
main().catch(e=>{
  const msg=e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?
    e.message:'ORIGINAL_L1_COVERAGE_LOCAL_INPUT_OR_VALIDATION_ERROR';
  console.error('OFFLINE_L1_CONTINUITY_BLOCKED: '+msg);
  process.exitCode=1;
});
