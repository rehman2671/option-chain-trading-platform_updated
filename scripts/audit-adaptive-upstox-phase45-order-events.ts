/**
 * Phase45 owner-private MANUAL/OFFLINE Upstox broker order event parity.
 * NO WebSocket connection, public webhook endpoint, token, HTTP request,
 * brokerage write operation, GTT update, scheduler, or live route.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase45DualChannelOrderEvents,
  type Phase45DualChannelArchive,type Phase45IndependentPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase45DualChannelOrderEvents.js';

function param(flag:string):string|null{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
}
function privateOnly(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.length>1300||p.includes('\0'))
    return false;
  try{
    const abs=resolve(p),dir=dirname(abs),
      f=lstatSync(abs),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(abs)===abs&&realpathSync(dir)===dir&&
      f.size>10&&f.size<=10_000_000&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const archive=param('--private-ws-webhook-order-events'),
  pinsPath=param('--independent-witness-event-pins');
if(!process.argv.includes('--approve-private-offline-only')||
  !privateOnly(archive)||!privateOnly(pinsPath)){
  console.error('PHASE45_OWNER_PRIVATE_OFFLINE_SOURCE_OR_APPROVAL_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase45-order-events.ts --approve-private-offline-only --private-ws-webhook-order-events <OWNER_0600_JSON> --independent-witness-event-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const evidence=JSON.parse(readFileSync(archive,'utf8')) as
      Phase45DualChannelArchive;
    const policy=JSON.parse(readFileSync(pinsPath,'utf8')) as
      Phase45IndependentPins;
    const report=auditPhase45DualChannelOrderEvents(evidence,policy);
    // Return only redacted aggregate counts and reason codes. NEVER
    // print UCC, instrument, event JSON, order or trade IDs, certs,
    // private keys, webhook URLs, bearer tokens or local source paths.
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='TWO_BROKER_REPORTED_CHANNELS_MATCH_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE45_OFFLINE_CHANNEL_EVIDENCE_REJECTED_NO_SECRET_DETAILS');
    process.exitCode=2;
  }
}
