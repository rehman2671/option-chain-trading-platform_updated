/**
 * Phase28 privacy-aware LOCAL-only verification CLI.
 * It only reads private JSON files and verifies externally created signatures.
 * It cannot authenticate Upstox, issue tokens or send any order.
 */
import {readFileSync} from 'node:fs';
import {
  auditPhase28OfflineDualWitnessEvidence,
  type ExternalOfflineWitnessTrustPolicy,
  type Phase28OfflineWitnessPackage
} from '../src/server/engine/ema15m/adaptiveUpstoxOfflineDualWitnessGate.js';
import type {ReadOnlyNrmlAuditPolicy}
  from '../src/server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const arg=(key:string)=>{
  const index=process.argv.indexOf(key);
  return index<0?null:process.argv[index+1]??null;
};
const pkgPath=process.argv[2],policyPath=arg('--policy'),
  trustPath=arg('--external-trust');
if(!pkgPath||pkgPath.startsWith('--')||!policyPath||!trustPath){
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-dual-witness.ts <PRIVATE-witness-package.json> --policy <PRIVATE-locked-audit-policy.json> --external-trust <PRIVATE-independently-pinned-public-keys-and-nonce.json>');
  process.exitCode=2;
}else{
  try{
    const read=(path:string):unknown=>
      JSON.parse(readFileSync(path,'utf8'));
    const result=auditPhase28OfflineDualWitnessEvidence(
      read(pkgPath) as Phase28OfflineWitnessPackage,
      read(policyPath) as ReadOnlyNrmlAuditPolicy,
      read(trustPath) as ExternalOfflineWitnessTrustPolicy);
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='SIGNATURES_VALID_OFFLINE_UNVERIFIED')
      process.exitCode=2;
  }catch{
    // Unknown inputs may include sensitive broker details/paths: never echo.
    console.error('PRIVATE_OFFLINE_WITNESS_VERIFICATION_FAILED');
    process.exitCode=2;
  }
}
