/**
 * Adaptive v2 Phase43 — PRIVATE operator-only OFFLINE GTT trigger, child
 * history, order trades and external signed reviewer claim reconciliation.
 *
 * No Upstox GET/POST/PUT/DELETE, no signed broker/server authority and no
 * native exchange ACK or stop protection. Never run in trading routes.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase43TriggeredGttChildTrades,
  type Phase43TriggerChainInput,type Phase43ExternalSourcePins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase43TriggeredGttChildChain.js';

function argument(key:string):string|null{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
}
function privateJson(value:string|null):value is string{
  if(!value||!isAbsolute(value)||value.includes('\0')||
    value.length>1300)return false;
  try{
    const path=resolve(value),dir=dirname(path),
      file=lstatSync(path),parent=lstatSync(dir);
    return file.isFile()&&!file.isSymbolicLink()&&
      parent.isDirectory()&&!parent.isSymbolicLink()&&
      realpathSync(path)===path&&realpathSync(dir)===dir&&
      file.size>20&&file.size<=500_000&&
      (file.mode&0o077)===0&&(parent.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        file.uid===process.getuid()&&parent.uid===process.getuid()));
  }catch{return false;}
}
const source=argument('--private-gtt-child-trade-archive'),
  trust=argument('--independent-child-exchange-review-pins');
if(!process.argv.includes('--approve-private-offline-trigger-review')||
  !privateJson(source)||!privateJson(trust)){
  console.error('PHASE43_PRIVATE_AUDIT_APPROVAL_OR_SOURCE_PRECONDITION_FAILED');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase43-trigger.ts --approve-private-offline-trigger-review --private-gtt-child-trade-archive <OWNER_0600_JSON> --independent-child-exchange-review-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const archive=JSON.parse(readFileSync(source,'utf8')) as
      Phase43TriggerChainInput;
    const pins=JSON.parse(readFileSync(trust,'utf8')) as
      Phase43ExternalSourcePins;
    const report=auditPhase43TriggeredGttChildTrades(archive,pins);
    // Never output original UCC, GTT/child/exchange IDs, trade IDs,
    // complete response bodies, private paths, keys, or tokens.
    console.log(JSON.stringify(report,null,2));
    if(![
      'BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED',
      'BROKER_REPORTED_CHILD_FILLED_REVIEWED_UNVERIFIED'
    ].includes(report.status))process.exitCode=2;
  }catch{
    console.error('PHASE43_PRIVATE_TRIGGER_SOURCE_REJECTED_NO_SENSITIVE_DETAILS');
    process.exitCode=2;
  }
}
