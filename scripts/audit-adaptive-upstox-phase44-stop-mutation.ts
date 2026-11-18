/**
 * Adaptive Swing v2 Phase44 — PRIVATE, manual-only stop mutation audit.
 *
 * No broker API, no HTTP, no order entry/amend/cancel, no GTT writes,
 * no scheduling. Reports are always UNVERIFIED and nontrading.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase44StopMutationLedger,
  type Phase44StopMutationArchive,type Phase44IndependentPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase44StopMutationLedger.js';

const arg=(name:string):string|null=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function privateJson(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.length>1300||p.includes('\0'))
    return false;
  try{
    const file=resolve(p),parent=dirname(file);
    const s=lstatSync(file),d=lstatSync(parent);
    return s.isFile()&&!s.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(parent)===parent&&
      s.size>20&&s.size<=850000&&(s.mode&0o077)===0&&
      (d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        s.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-same-day-order-mutation-archive'),
  trust=arg('--independent-order-mutation-witness-pins');
if(!process.argv.includes('--approve-manual-offline-only')||
  !privateJson(source)||!privateJson(trust)){
  console.error('PHASE44_PRIVATE_ORDER_EVENT_AUDIT_PRECONDITIONS_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase44-stop-mutation.ts --approve-manual-offline-only --private-same-day-order-mutation-archive <OWNER_0600_JSON> --independent-order-mutation-witness-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const archive=JSON.parse(readFileSync(source,'utf8')) as
      Phase44StopMutationArchive;
    const pins=JSON.parse(readFileSync(trust,'utf8')) as
      Phase44IndependentPins;
    const report=auditPhase44StopMutationLedger(archive,pins);
    // Only redacted status and aggregate counts; not original account IDs,
    // source JSON, order IDs, exchange IDs, raw history or private paths.
    console.log(JSON.stringify(report,null,2));
    if(![
      'BROKER_REPORTED_MODIFIED_ORDER_OPEN_UNVERIFIED',
      'BROKER_REPORTED_REPLACEMENT_ORDER_OPEN_UNVERIFIED',
      'BROKER_REPORTED_EXIT_COMPLETE_UNVERIFIED'
    ].includes(report.status))process.exitCode=2;
  }catch{
    console.error('PHASE44_PRIVATE_SAME_DAY_ORDER_ARCHIVE_REJECTED');
    process.exitCode=2;
  }
}
