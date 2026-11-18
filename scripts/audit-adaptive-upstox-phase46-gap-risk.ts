/**
 * Adaptive Swing v2 Phase46 owner-private, manual-only offline long
 * index-option premium gap downside envelope. No Upstox or NSE calls,
 * no orders/GTT writes, no live auto-trading or scheduler.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase46LongOptionGapStress,
  type Phase46GapStressInput,type Phase46GapStressPins,
  type Phase46GapStressPolicy
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase46LongOptionGapRisk.js';

const flag=(key:string):string|null=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
function ownerPrivate(path:string|null):path is string{
  if(!path||!isAbsolute(path)||path.length>1300||
    path.includes('\0'))return false;
  try{
    const p=resolve(path),dir=dirname(p),
      file=lstatSync(p),parent=lstatSync(dir);
    return file.isFile()&&!file.isSymbolicLink()&&
      parent.isDirectory()&&!parent.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(dir)===dir&&
      file.size>10&&file.size<=1_000_000&&
      (file.mode&0o077)===0&&(parent.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        file.uid===process.getuid()&&parent.uid===process.getuid()));
  }catch{return false;}
}
const archive=flag('--private-l1-original-gap-paths'),
  pinned=flag('--independent-path-and-policy-pins'),
  stress=flag('--predeclared-sensitivity-policy');
if(!process.argv.includes('--approve-isolated-offline-only')||
  !ownerPrivate(archive)||!ownerPrivate(pinned)||
  !ownerPrivate(stress)){
  console.error('PHASE46_PRIVATE_OFFLINE_GAP_AUDIT_PRECONDITION_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase46-gap-risk.ts --approve-isolated-offline-only --private-l1-original-gap-paths <OWNER_0600_JSON> --independent-path-and-policy-pins <OWNER_0600_JSON> --predeclared-sensitivity-policy <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const evidence=JSON.parse(readFileSync(archive,'utf8')) as
      Phase46GapStressInput;
    const pins=JSON.parse(readFileSync(pinned,'utf8')) as
      Phase46GapStressPins;
    const policy=JSON.parse(readFileSync(stress,'utf8')) as
      Phase46GapStressPolicy;
    const result=auditPhase46LongOptionGapStress(evidence,pins,policy);
    // Redacted aggregate numbers ONLY: no instrument IDs, raw quotes,
    // private response bodies, token, UCC, or original file paths.
    console.log(JSON.stringify(result,null,2));
    if(result.status==='INVALID_EVIDENCE'||
      result.status==='INCOMPLETE_EVIDENCE'||
      result.predeclaredGapOrCashLossAlerts>0)
      process.exitCode=2;
    // DESCRIPTIVE_BOUNDS_ONLY exit=0 means local stress calculation
    // validated, NEVER that a real strategy may be traded.
  }catch{
    console.error('PHASE46_OFFLINE_GAP_SOURCE_REJECTED_NO_PRIVATE_DETAILS');
    process.exitCode=2;
  }
}
