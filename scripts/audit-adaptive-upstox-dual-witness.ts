/**
 * Phase29 strengthened Phase28 LOCAL-only evidence witness CLI.
 * Requires a private durable nonce registry: valid signatures cannot be
 * accepted twice with the same account + challenge on the same registry.
 */
import {readFileSync} from 'node:fs';
import type {
  ExternalOfflineWitnessTrustPolicy,Phase28OfflineWitnessPackage
} from '../src/server/engine/ema15m/adaptiveUpstoxOfflineDualWitnessGate.js';
import {
  privateEvidenceParentReady,verifyAndClaimPhase28OfflineNonce
} from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';
import type {ReadOnlyNrmlAuditPolicy}
  from '../src/server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const arg=(key:string)=>{
  const index=process.argv.indexOf(key);
  return index<0?null:process.argv[index+1]??null;
};
const pkgPath=process.argv[2],policyPath=arg('--policy'),
  trustPath=arg('--external-trust'),registry=arg('--nonce-registry-dir');
if(!pkgPath||pkgPath.startsWith('--')||!policyPath||!trustPath||
  !registry||!privateEvidenceParentReady(registry)){
  console.error('PRIVATE_NONCE_REGISTRY_REQUIRED_AND_MUST_BE_OWNER_PRIVATE_0700');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-dual-witness.ts <PRIVATE-witness-package.json> --policy <PRIVATE-locked-audit-policy.json> --external-trust <PRIVATE-independently-pinned-public-keys-and-nonce.json> --nonce-registry-dir <PRIVATE-existing-0700-absolute-directory>');
  process.exitCode=2;
}else{
  try{
    const read=(path:string):unknown=>
      JSON.parse(readFileSync(path,'utf8'));
    const result=verifyAndClaimPhase28OfflineNonce(
      read(pkgPath) as Phase28OfflineWitnessPackage,
      read(policyPath) as ReadOnlyNrmlAuditPolicy,
      read(trustPath) as ExternalOfflineWitnessTrustPolicy,
      registry);
    console.log(JSON.stringify(result,null,2));
    if(result.witness.status!=='SIGNATURES_VALID_OFFLINE_UNVERIFIED'||
      result.claim.status!=='CHALLENGE_CLAIMED_OFFLINE_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PRIVATE_OFFLINE_WITNESS_OR_NONCE_VERIFICATION_FAILED');
    process.exitCode=2;
  }
}
