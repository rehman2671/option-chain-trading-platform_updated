/**
 * Adaptive v2 Phase29 PRIVATE evidence archive and one-use nonce claims.
 *
 * Persist only inside an already owner-private 0700 directory.
 * O_EXCL / O_NOFOLLOW / fsync; do not expose paths, body or UCC in reports.
 * File-system durability is not an external broker or timestamp signature.
 */
import {
  constants,closeSync,fsyncSync,lstatSync,mkdirSync,openSync,realpathSync,
  writeSync
} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import type {
  SensitiveReadOnlyCaptureArchive,AuthorizedOfflineCaptureReport
} from './adaptiveUpstoxAuthorizedGetCapture.js';
import type {
  Phase28ReadOnlyWitnessReport,ExternalOfflineWitnessTrustPolicy
} from './adaptiveUpstoxOfflineDualWitnessGate.js';

const SHA=/^[a-f0-9]{64}$/;
type ArchiveReason=
  'PRIVATE_PARENT_MISSING_OR_INSECURE'|
  'ARCHIVE_REQUIRES_SUCCEEDED_READ_ONLY_CAPTURE'|
  'PRIVATE_ARCHIVE_WRITE_FAILED'|
  'PRIVATE_EVIDENCE_WRITTEN_UNVERIFIED';
export interface PrivateArchiveWriteResult {
  status:ArchiveReason;
  evidenceJsonSha256:string|null;
  filesCreated:number;
  /** Never return filenames or account data; caller knows private parent. */
  executionAuthorized:false;brokerAuthenticated:false;productionSafe:false;
}
export interface NonceClaimResult {
  status:'CHALLENGE_CLAIMED_OFFLINE_UNVERIFIED'|
    'INVALID_INDEPENDENT_SIGNED_WITNESS'|
    'PRIVATE_NONCE_REGISTRY_UNAVAILABLE'|
    'CHALLENGE_ALREADY_USED_OR_REGISTRY_UNAVAILABLE';
  executionAuthorized:false;brokerAuthenticated:false;productionSafe:false;
}
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const archiveResult=(status:ArchiveReason,hash:string|null=null,
  count=0):PrivateArchiveWriteResult=>({
  status,evidenceJsonSha256:hash,filesCreated:count,
  executionAuthorized:false,brokerAuthenticated:false,productionSafe:false
});
function secureParent(parent:string):string|null{
  if(typeof parent!=='string'||!parent.startsWith('/')||
    parent.length>1024||parent.includes('\0'))return null;
  try{
    const full=resolve(parent);
    const meta=lstatSync(full);
    if(!meta.isDirectory()||meta.isSymbolicLink()||
      (meta.mode&0o077)!==0)return null;
    if(typeof process.getuid==='function'&&meta.uid!==process.getuid())
      return null;
    const canonical=realpathSync(full);
    if(canonical!==full)return null;
    return full;
  }catch{return null;}
}
function durableWrite(file:string,content:string){
  const flags=constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW;
  const fd=openSync(file,flags,0o600);
  try{
    const data=Buffer.from(content,'utf8');
    let at=0;
    while(at<data.length)at+=writeSync(fd,data,at,data.length-at);
    fsyncSync(fd);
  }finally{closeSync(fd);}
}
function flushDir(parent:string){
  const fd=openSync(parent,constants.O_RDONLY|constants.O_DIRECTORY|
    constants.O_NOFOLLOW);
  try{fsyncSync(fd);}finally{closeSync(fd);}
}
/**
 * Never write a captured token. Archive uses a fresh 0700 subdirectory,
 * 0600 file, exclusive creation and fsync. No overwrite or mkdir -p.
 */
export function persistPrivateReadOnlyCapture(
  privateParent:string,report:AuthorizedOfflineCaptureReport,
  archive:SensitiveReadOnlyCaptureArchive|null
):PrivateArchiveWriteResult{
  const parent=secureParent(privateParent);
  if(!parent)return archiveResult('PRIVATE_PARENT_MISSING_OR_INSECURE');
  if(!archive||!report||
    report.status!=='CAPTURE_RECORDED_UNVERIFIED'||
    report.responseCount!==5||
    !report.accountProfileMatched||
    archive.byteWitnesses.length!==4)
    return archiveResult('ARCHIVE_REQUIRES_SUCCEEDED_READ_ONLY_CAPTURE');
  try{
    // Do not record report's UCC or bearer token; report already redacted.
    const json=JSON.stringify({
      schemaVersion:'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1',
      origin:'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED',
      report,archive
    });
    const sub=join(parent,'capture-'+randomBytes(16).toString('hex'));
    mkdirSync(sub,{mode:0o700});
    durableWrite(join(sub,'evidence.private.json'),json);
    flushDir(sub);flushDir(parent);
    return archiveResult('PRIVATE_EVIDENCE_WRITTEN_UNVERIFIED',
      digest(json),1);
  }catch{
    // A partial capture directory may remain; never emit the path.
    return archiveResult('PRIVATE_ARCHIVE_WRITE_FAILED');
  }
}
/** Only use with the output of auditPhase28OfflineDualWitnessEvidence(),
 * an externally PINNED trust policy, and a private durable registry dir.
 * Atomic O_EXCL ensures same nonce cannot be claimed a second time in
 * this registry even by parallel processes. This is NOT distributed or
 * externally notarized anti-replay protection.
 */
export function claimVerifiedOfflineNonceOnce(
  privateNonceDirectory:string,
  signedReport:Phase28ReadOnlyWitnessReport,
  trust:ExternalOfflineWitnessTrustPolicy
):NonceClaimResult{
  const base={executionAuthorized:false,brokerAuthenticated:false,
    productionSafe:false} as const;
  if(!signedReport||signedReport.status!==
    'SIGNATURES_VALID_OFFLINE_UNVERIFIED'||
    !signedReport.signaturesVerified||!signedReport.responseBodiesMatched||
    !signedReport.attestedPayloadSha256||
    !SHA.test(signedReport.attestedPayloadSha256)||
    !trust||trust.schemaVersion!==
    'EXTERNALLY_PINNED_ED25519_REVIEW_KEYS_V1'||
    typeof trust.expectedChallengeHex!=='string'||
    !SHA.test(trust.expectedChallengeHex)||
    !trust.expectedAccountScopeId)
    return {...base,status:'INVALID_INDEPENDENT_SIGNED_WITNESS'};
  const dir=secureParent(privateNonceDirectory);
  if(!dir)return {...base,status:'PRIVATE_NONCE_REGISTRY_UNAVAILABLE'};
  // Never include UCC, nonce, key or path in public reports.
  const key=digest([
    'ADAPTIVE_V2_PHASE29_NONCE_REGISTRY_V1',
    trust.expectedAccountScopeId,trust.expectedChallengeHex
  ].join('\n'));
  try{
    durableWrite(join(dir,key+'.used'),JSON.stringify({
      schemaVersion:'PHASE29_ONE_SHOT_NONCE_CLAIM_V1',
      payloadSha256:signedReport.attestedPayloadSha256
    }));
    flushDir(dir);
    return {...base,status:'CHALLENGE_CLAIMED_OFFLINE_UNVERIFIED'};
  }catch{
    return {...base,status:'CHALLENGE_ALREADY_USED_OR_REGISTRY_UNAVAILABLE'};
  }
}
