/**
 * Phase40 private MANUAL read-only offline audit of archived Upstox responses.
 * No network, API tokens, requests, broker operations, timers or live routes.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase40ArchivedGttOvernights,
  auditPhase40ArchivedChildHistory,
  type Phase40GttAuditInput,
  type Phase40IndependentArchivePins,
  type Phase40OrderHistoryInput,
  type Phase40OrderHistoryPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.js';

const flag=(name:string):string|null=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function secure(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.includes('\0')||p.length>1200)return false;
  try{
    const file=lstatSync(resolve(p)),parent=lstatSync(dirname(p));
    return file.isFile()&&!file.isSymbolicLink()&&
      parent.isDirectory()&&!parent.isSymbolicLink()&&
      realpathSync(resolve(p))===resolve(p)&&
      realpathSync(dirname(p))===resolve(dirname(p))&&
      file.size>10&&file.size<=400000&&(file.mode&0o077)===0&&
      (parent.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        file.uid===process.getuid()&&
        parent.uid===process.getuid()));
  }catch{return false;}
}
const mode=flag('--mode'),source=flag('--private-input'),
  pinsPath=flag('--independently-pinned-sha256-policy');
if(!process.argv.includes('--approve-manual-offline-only')||
  !['gtt','child'].includes(mode??'')||
  !secure(source)||!secure(pinsPath)){
  console.error('PHASE40_PRIVATE_OFFLINE_AUDIT_PRECONDITION_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase40-stop.ts --approve-manual-offline-only --mode gtt|child --private-input <OWNER_0600_JSON> --independently-pinned-sha256-policy <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as unknown;
    const trust=JSON.parse(readFileSync(pinsPath,'utf8')) as unknown;
    const report=mode==='gtt'?
      auditPhase40ArchivedGttOvernights(
        input as Phase40GttAuditInput,
        trust as Phase40IndependentArchivePins
      ):
      auditPhase40ArchivedChildHistory(
        input as Phase40OrderHistoryInput,
        trust as Phase40OrderHistoryPins
      );
    // Redacted output: only status, codes and aggregate counts, no IDs,
    // archived raw order events, UCC, paths, timestamps or bearer headers.
    console.log(JSON.stringify(report,null,2));
    if(!['GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED',
      'BROKER_REPORTED_OPEN_OR_COMPLETE_UNVERIFIED']
      .includes(report.status))process.exitCode=2;
  }catch{
    console.error('PHASE40_OFFLINE_EVIDENCE_REJECTED_NO_PRIVATE_DETAILS');
    process.exitCode=2;
  }
}
