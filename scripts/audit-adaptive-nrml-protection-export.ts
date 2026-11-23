/**
 * Phase25 offline-only unverified broker export audit.
 * Reads local JSON files. No Upstox authentication, HTTP, orders or writes.
 * Prints only sanitized structure flags; NEVER echo account/order/contract IDs.
 */
import {readFileSync} from 'node:fs';
import {auditReadOnlyNrmlProtection,
  type ReadOnlyExpectedPosition,type ReadOnlyBrokerExport,
  type ReadOnlyNrmlAuditPolicy
} from '../src/server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

function arg(flag:string):string|null {
  const i=process.argv.indexOf(flag);
  return i>=0?process.argv[i+1]??null:null;
}
const viewFile=process.argv[2];
const expectedFile=arg('--expected');
const policyFile=arg('--policy');
const asOf=arg('--as-of');
const recovery=arg('--recovery-started-at')??undefined;
if(!viewFile||viewFile.startsWith('--')||!expectedFile||!policyFile||!asOf){
  console.error('Usage: npx tsx scripts/audit-adaptive-nrml-protection-export.ts <private-export.json> --expected <private-position.json> --policy <policy.json> --as-of <ISO-with-offset> [--recovery-started-at <ISO-with-offset>]');
  process.exitCode=2;
}else{
  try{
    const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
    const r=auditReadOnlyNrmlProtection(
      read(expectedFile) as ReadOnlyExpectedPosition,
      read(viewFile) as ReadOnlyBrokerExport,
      asOf,read(policyFile) as ReadOnlyNrmlAuditPolicy,recovery);
    console.log(JSON.stringify(r,null,2));
    // This is a STRUCTURAL audit only, never a production-ready exit code.
    if(r.status==='INVALID_EVIDENCE'||r.status==='BLOCKED_OR_UNKNOWN')
      process.exitCode=2;
  }catch{
    // Avoid leaking private file paths, account data or vendor payload content.
    console.error('PRIVATE_EXPORT_READ_OR_PARSE_FAILED');
    process.exitCode=2;
  }
}
