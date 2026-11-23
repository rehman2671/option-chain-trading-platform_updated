/**
 * Phase27 PRIVATE offline read-only multi-snapshot NRML lifecycle audit.
 * Does not call Upstox or store/export raw account/order/trade information.
 */
import {readFileSync} from 'node:fs';
import {
  auditOfflineUpstoxNrmlLifecycle,
  type OfflineUpstoxLifecycleInput
} from '../src/server/engine/ema15m/adaptiveUpstoxOfflineNrmlLifecycle.js';
import type {
  ReadOnlyNrmlAuditPolicy
} from '../src/server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const capture=process.argv[2],policyIndex=process.argv.indexOf('--policy');
const policyFile=policyIndex<0?null:process.argv[policyIndex+1]??null;
if(!capture||capture.startsWith('--')||!policyFile){
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-nrml-lifecycle.ts <PRIVATE-multi-frame-capture.json> --policy <PRIVATE-locked-phase25-policy.json>');
  process.exitCode=2;
}else{
  try{
    const read=(file:string):unknown=>
      JSON.parse(readFileSync(file,'utf8'));
    const report=auditOfflineUpstoxNrmlLifecycle(
      read(capture) as OfflineUpstoxLifecycleInput,
      read(policyFile) as ReadOnlyNrmlAuditPolicy);
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='CHRONOLOGICALLY_CONSISTENT_UNVERIFIED')
      process.exitCode=2;
  }catch{
    // Never reveal raw tokens, parsed JSON, internal user-provided file paths.
    console.error('PRIVATE_LIFECYCLE_AUDIT_FAILED_TO_PARSE_OR_READ');
    process.exitCode=2;
  }
}
