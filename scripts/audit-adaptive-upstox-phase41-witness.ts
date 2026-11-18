/**
 * Phase41 operator-only OFFLINE dual-witness / explicit session calendar
 * auditor. It NEVER acquires Upstox broker source data, runs jobs, creates
 * broker orders, modifies GTT, or asserts official NSE/BSE authenticity.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase41WitnessedSessionCoverage,
  type Phase41Archive,type Phase41IndependentPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase41WitnessedSessionCoverage.js';

function arg(key:string):string|null{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
}
function ownerPrivate(path:string|null):path is string{
  if(!path||!isAbsolute(path)||path.length>1300||
    path.includes('\0'))return false;
  try{
    const p=resolve(path),dir=dirname(p),
      f=lstatSync(p),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(dir)===dir&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      f.size>10&&f.size<=1_500_000&&
      (typeof process.getuid!=='function'||(
        f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const archive=arg('--private-witness-archive'),
  independent=arg('--independent-witness-calendar-pins');
if(!process.argv.includes('--approve-readonly-offline-witness-review')||
  !ownerPrivate(archive)||!ownerPrivate(independent)){
  console.error('PHASE41_PRIVATE_WITNESS_REVIEW_PRECONDITION_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase41-witness.ts --approve-readonly-offline-witness-review --private-witness-archive <OWNER_0600_JSON> --independent-witness-calendar-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const evidence=JSON.parse(readFileSync(archive,'utf8')) as Phase41Archive;
    const pins=JSON.parse(readFileSync(independent,'utf8')) as Phase41IndependentPins;
    const report=auditPhase41WitnessedSessionCoverage(evidence,pins);
    // No UCC, order IDs, raw snapshots, witness public keys, filenames,
    // private timestamps, bearer credentials or certificate files in output.
    console.log(JSON.stringify(report,null,2));
    if(report.status!==
      'DECLARED_CALENDAR_ALL_BOUNDARIES_DUAL_SIGNED_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE41_OFFLINE_EVIDENCE_REJECTED_NO_SECRET_DETAILS');
    process.exitCode=2;
  }
}
