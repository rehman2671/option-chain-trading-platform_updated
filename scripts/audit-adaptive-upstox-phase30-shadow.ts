/**
 * Phase30 MANUAL OFFLINE SHADOW verification, zero broker traffic.
 *
 * Reads owner-private encrypted Phase29 captures and a separately pinned
 * detached Phase28 signed witness. Then atomically consumes a local
 * one-use nonce only if both shadow review and dual signatures are valid.
 * No raw order/account JSON, paths or encryption keys are printed.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  decryptPrivateReadOnlyCapture
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase30EncryptedArchive.js';
import {
  reviewPhase30ShadowEvidence,
  type Phase30PrivateShadowBundle
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase30ShadowDossier.js';
import {
  verifyAndClaimPhase28OfflineNonce,privateEvidenceParentReady
} from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';
import type {
  Phase28OfflineWitnessPackage,ExternalOfflineWitnessTrustPolicy
} from '../src/server/engine/ema15m/adaptiveUpstoxOfflineDualWitnessGate.js';
import type {ReadOnlyNrmlAuditPolicy}
  from '../src/server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

interface PrivateInputManifest {
  schemaVersion:'ADAPTIVE_V2_PHASE30_SHADOW_INPUT_V1';
  captureArchivePaths:string[];
  signedWitnessPath:string;
  lockedPhase25PolicyPath:string;
  separatelyPinnedTrustPath:string;
}
const key=process.env.ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX;
const idx=process.argv.indexOf('--nonce-registry-dir');
const nonceDirectory=idx<0?null:process.argv[idx+1];
const manifestPath=process.argv[2];
const safeFile=(file:string):boolean=>{
  if(!file||!isAbsolute(file)||file.length>1300||
    file.includes('\0')||!privateEvidenceParentReady(dirname(file)))
    return false;
  try{
    const metadata=lstatSync(resolve(file));
    return metadata.isFile()&&!metadata.isSymbolicLink()&&
      (metadata.mode&0o077)===0&&
      (typeof process.getuid!=='function'||metadata.uid===process.getuid())&&
      metadata.size>2&&metadata.size<3_000_000;
  }catch{return false;}
};
function privateJSON(file:string):unknown{
  if(!safeFile(file))throw Error('INSECURE_PRIVATE_REVIEW_FILE');
  return JSON.parse(readFileSync(file,'utf8'));
}
if(!manifestPath||manifestPath.startsWith('--')||
  !safeFile(manifestPath)||!nonceDirectory||
  !privateEvidenceParentReady(nonceDirectory)||
  !key||!/^[a-f0-9]{64}$/i.test(key)){
  console.error('SHADOW_REVIEW_PRECONDITION_OR_PRIVATE_KEY_UNAVAILABLE');
  console.error('Usage: ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX=<32-byte-random-key-hex> npx tsx scripts/audit-adaptive-upstox-phase30-shadow.ts <PRIVATE-0600-input-manifest.json> --nonce-registry-dir <OWNER_PRIVATE_EXISTING_0700_DIRECTORY>');
  process.exitCode=2;
}else{
  try{
    const manifest=privateJSON(manifestPath) as PrivateInputManifest;
    if(!manifest||
      manifest.schemaVersion!=='ADAPTIVE_V2_PHASE30_SHADOW_INPUT_V1'||
      !Array.isArray(manifest.captureArchivePaths)||
      manifest.captureArchivePaths.length<2||
      manifest.captureArchivePaths.length>64)
      throw Error('INVALID_SHADOW_PRIVATE_MANIFEST');
    const captures=manifest.captureArchivePaths.map(path=>{
      if(!safeFile(path))throw Error('INSECURE_ENCRYPTED_CAPTURE');
      const a=decryptPrivateReadOnlyCapture(path,key);
      if(!a)throw Error('DECRYPTION_OR_AUTHENTICATION_FAILED');
      return a;
    });
    const witness=privateJSON(manifest.signedWitnessPath) as
      Phase28OfflineWitnessPackage;
    const policy=privateJSON(manifest.lockedPhase25PolicyPath) as
      ReadOnlyNrmlAuditPolicy;
    const trust=privateJSON(manifest.separatelyPinnedTrustPath) as
      ExternalOfflineWitnessTrustPolicy;
    const bundle:Phase30PrivateShadowBundle={
      schemaVersion:'ADAPTIVE_SWING_V2_SHADOW_REVIEW_V1',
      source:'PRIVATELY_ARCHIVED_OPERATOR_CAPTURE',
      captures,signedWitness:witness
    };
    const shadow=reviewPhase30ShadowEvidence(bundle,policy,trust);
    const nonce=shadow.status==='SHADOW_REVIEW_ONLY_UNVERIFIED'?
      verifyAndClaimPhase28OfflineNonce(witness,policy,trust,nonceDirectory):
      null;
    console.log(JSON.stringify({
      shadow,nonceStatus:nonce?.claim.status??'NOT_CLAIMED',
      warning:'SHADOW_REVIEW_IS_NOT_BROKER_AUTHENTICATION_OR_TRADING_PERMISSION'
    },null,2));
    if(shadow.status!=='SHADOW_REVIEW_ONLY_UNVERIFIED'||
      nonce?.claim.status!=='CHALLENGE_CLAIMED_OFFLINE_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PRIVATE_SHADOW_REVIEW_REJECTED_WITHOUT_SENSITIVE_DETAILS');
    process.exitCode=2;
  }
}
