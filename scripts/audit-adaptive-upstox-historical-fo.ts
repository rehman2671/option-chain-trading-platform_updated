/**
 * Phase31 local-only historical F&O fill and NRML manual session audit.
 * No network, broker credentials, order instructions or unredacted output.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {isAbsolute,dirname,resolve} from 'node:path';
import {
  auditOfflineHistoricalFoFills,
  type OfflineHistoricalFoAuditInput
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase31HistoricalFoFills.js';
import {
  assessPhase31ManualNrmlHandoff,
  type Phase31SessionHandoffInput
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase31ManualHandoff.js';
import {privateEvidenceParentReady}
  from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';

const historyPath=process.argv[2];
const opt=process.argv.indexOf('--handoff');
const handoffPath=opt<0?null:process.argv[opt+1]??null;
function privateFile(path:string|null):path is string{
  if(!path||!isAbsolute(path)||path.length>1300||
    path.includes('\0')||!privateEvidenceParentReady(dirname(path)))
    return false;
  try{
    const info=lstatSync(resolve(path));
    return info.isFile()&&!info.isSymbolicLink()&&
      (info.mode&0o077)===0&&info.size>2&&info.size<=16_000_000&&
      (typeof process.getuid!=='function'||
        info.uid===process.getuid());
  }catch{return false;}
}
if(!privateFile(historyPath)||
  (handoffPath!==null&&!privateFile(handoffPath))){
  console.error('PRIVATE_FO_HISTORY_FILE_OR_HANDOFF_SCOPE_UNAVAILABLE');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-historical-fo.ts <private-0600-historical-FO-pages.json> [--handoff <private-0600-operator-session-review.json>]');
  process.exitCode=2;
}else{
  try{
    const read=(file:string)=>JSON.parse(readFileSync(file,'utf8')) as unknown;
    const input=read(historyPath) as OfflineHistoricalFoAuditInput;
    const history=auditOfflineHistoricalFoFills(input);
    const handoff=handoffPath?
      assessPhase31ManualNrmlHandoff({
        ...(read(handoffPath) as Phase31SessionHandoffInput),
        expected:input.expected,historicalFills:history
      }):null;
    console.log(JSON.stringify({historicalFills:history,manualHandoff:handoff,
      note:'OPERATOR_SUPPLIED_NOT_BROKER_AUTHENTICATED_NO_TRADE_AUTHORIZATION'
    },null,2));
    if(history.status!=='HISTORICAL_FILLS_RECONCILED_UNVERIFIED'||
      (handoff&&handoff.status!=='SHADOW_OBSERVATION_ONLY_UNVERIFIED'))
      process.exitCode=2;
  }catch{
    console.error('PRIVATE_FO_HISTORY_REVIEW_FAILED_WITHOUT_SENSITIVE_DETAILS');
    process.exitCode=2;
  }
}
