/**
 * Phase26 offline-only Upstox GET response audit. No live API, network, broker
 * token, order execution or raw account output. Reads PRIVATE local JSON only.
 */
import {readFileSync} from 'node:fs';
import {
  auditOfflineUpstoxReadOnlyCapture,
  type OfflineUpstoxCaptureBundle
} from '../src/server/engine/ema15m/adaptiveUpstoxOfflineReadOnlyBridge.js';
import type {
  ReadOnlyExpectedPosition,ReadOnlyNrmlAuditPolicy
} from '../src/server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const flag=(key:string)=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
const file=process.argv[2],expected=flag('--expected'),
  policy=flag('--policy'),asOf=flag('--as-of'),
  recovery=flag('--recovery-started-at')??undefined;
if(!file||file.startsWith('--')||!expected||!policy||!asOf){
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-offline-export.ts <private-readonly-capture.json> --expected <private-expected-nrml.json> --policy <locked-offline-policy.json> --as-of <ISO-with-offset> [--recovery-started-at <ISO-with-offset>]');
  process.exitCode=2;
}else{
  try{
    const read=(name:string):unknown=>
      JSON.parse(readFileSync(name,'utf8'));
    const report=auditOfflineUpstoxReadOnlyCapture(
      read(expected) as ReadOnlyExpectedPosition,
      read(file) as OfflineUpstoxCaptureBundle,asOf,
      read(policy) as ReadOnlyNrmlAuditPolicy,recovery);
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='STRUCTURAL_REVIEW_ONLY')process.exitCode=2;
  }catch{
    // Paths and JSON may contain private account data or bearer tokens.
    console.error('PRIVATE_OFFLINE_CAPTURE_FAILED_TO_PARSE_OR_READ');
    process.exitCode=2;
  }
}
