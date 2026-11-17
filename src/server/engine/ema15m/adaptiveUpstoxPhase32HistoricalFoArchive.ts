/**
 * Phase32 offline private historical F&O archive verification and AES-GCM.
 * Source is STILL operator-provided, NEVER broker signed.
 * This library is NOT invoked by a live engine, HTTP route or job.
 */
import {
  createCipheriv,createDecipheriv,createHash,randomBytes
} from 'node:crypto';
import {
  constants,closeSync,fsyncSync,lstatSync,mkdirSync,
  openSync,readFileSync,realpathSync,writeSync
} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {TextDecoder,isDeepStrictEqual} from 'node:util';
import {
  auditOfflineHistoricalFoFills
} from './adaptiveUpstoxPhase31HistoricalFoFills.js';
import type {
  PrivateHistoricalFoArchive,Phase32HistoricalFoCaptureReport
} from './adaptiveUpstoxPhase32HistoricalFoCollector.js';

const AAD='ADAPTIVE_V2_PHASE32_PRIVATE_HISTORICAL_FO_AES256GCM_V1';
const SHA=/^[a-f0-9]{64}$/;
const KEY=/^[a-f0-9]{64}$/i;
const digest=(v:string|Uint8Array)=>createHash('sha256').update(v)
  .digest('hex');
const privateParent=(p:string):string|null=>{
  if(typeof p!=='string'||!isAbsolute(p)||p.length>1024||
    p.includes('\0'))return null;
  try{
    const path=resolve(p),info=lstatSync(path);
    if(!info.isDirectory()||info.isSymbolicLink()||
      (info.mode&0o077)!==0||realpathSync(path)!==path||
      (typeof process.getuid==='function'&&info.uid!==process.getuid()))
      return null;
    return path;
  }catch{return null;}
};
const key=(hex:unknown):Buffer|null=>
  typeof hex==='string'&&KEY.test(hex)?Buffer.from(hex,'hex'):null;
const b64=(v:unknown,maxChars:number):Buffer|null=>{
  if(typeof v!=='string'||v.length<4||v.length>maxChars||
    v.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    return null;
  const b=Buffer.from(v,'base64');
  return b.toString('base64')===v?b:null;
};
const record=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const s=(v:unknown)=>typeof v==='string'&&SHA.test(v);
function rawBody(raw:unknown):unknown{
  if(!(raw instanceof Buffer))return null;
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch{return null;}
}
export interface HistoricalFoArchiveIntegrityReport {
  status:'INVALID_PRIVATE_FO_ARCHIVE'|
    'ARCHIVED_FO_PAGES_MATCH_UNVERIFIED';
  sourceBrokerSigned:false;brokerAuthenticated:false;
  executionAuthorized:false;productionSafe:false;
  pageCount:number;reasonCodes:string[];
  /** Computed only from archived bytes and untrusted local profile. */
  originalBodyDigestChainSha256:string|null;
}
const invalid=(reason:string):HistoricalFoArchiveIntegrityReport=>({
  status:'INVALID_PRIVATE_FO_ARCHIVE',sourceBrokerSigned:false,
  brokerAuthenticated:false,executionAuthorized:false,
  productionSafe:false,pageCount:0,reasonCodes:[reason],
  originalBodyDigestChainSha256:null
});
/** Required before encryption and after decryption. Validity != origin. */
export function verifyPrivateHistoricalFoArchive(
  archive:PrivateHistoricalFoArchive,
  report:Phase32HistoricalFoCaptureReport
):HistoricalFoArchiveIntegrityReport{
  if(!archive||archive.schemaVersion!==
    'ADAPTIVE_UPSTOX_PHASE32_PRIVATE_FO_CAPTURE_V1'||
    archive.source!=='EXPLICIT_READ_ONLY_OPERATOR_CAPTURE_UNVERIFIED'||
    !archive.input||!report||
    report.mode!=='MANUAL_GET_ONLY_HISTORICAL_FO_CAPTURE'||
    report.status!=='CAPTURE_RECORDED_UNVERIFIED'||
    report.executionAuthorized!==false||
    report.productionSafe!==false||
    report.brokerAuthenticated!==false||
    report.brokerStopInstalled!==false||
    report.protectedOvernight!==false||
    report.nativeOrderInstruction!==null||
    report.accountProfileMatched!==true||
    report.readOnlyNetworkActuallyAttempted!==true||
    !Array.isArray(archive.responseBytes)||
    !Array.isArray(archive.input.pages)||
    archive.responseBytes.length<1||
    archive.responseBytes.length>16||
    archive.responseBytes.length!==archive.input.pages.length||
    archive.responseBytes.length!==report.pageCount||
    !s(report.responseDigestChainSha256))
    return invalid('INCOMPLETE_OR_UNSAFE_PRIVATE_HISTORICAL_FO_ARCHIVE');
  const p=b64(archive.profileResponseUtf8Base64,125000);
  const profile=rawBody(p);
  if(!record(profile)||profile.status!=='success'||
    !record(profile.data)||
    profile.data.user_id!==archive.input.expected?.accountScopeId||
    profile.data.broker!=='UPSTOX'||profile.data.is_active!==true||
    !Array.isArray(profile.data.products)||
    !profile.data.products.includes('D'))
    return invalid('PRIVATE_PROFILE_UCC_OR_ENTITLEMENT_UNMATCHED');
  let chain=digest('PHASE32_FO_RAW_HTTP_BODIES_V1\n'+digest(p!));
  for(const [i,entry] of archive.responseBytes.entries()){
    const raw=b64(entry?.responseUtf8Base64,125000);
    if(!raw||raw.length>90000||
      entry.pageNumber!==i+1||
      !isDeepStrictEqual(rawBody(raw),archive.input.pages[i].response))
      return invalid('PRIVATE_HISTORICAL_FO_RAW_BODY_OR_PAGE_MISMATCH');
    chain=digest(chain+'\n'+(i+1)+'\n'+digest(raw));
  }
  if(report.responseDigestChainSha256!==chain)
    return invalid('PRIVATE_HISTORICAL_FO_DIGEST_CHAIN_MISMATCH');
  const assessment=auditOfflineHistoricalFoFills(archive.input);
  if(assessment.status==='INVALID_EVIDENCE'||
    assessment.status!==report.phase31Status||
    assessment.totalFoRows!==report.totalFoRows||
    !assessment.paginationComplete)
    return invalid('PRIVATE_HISTORICAL_FO_AUDIT_REPORT_DISAGREES');
  return {status:'ARCHIVED_FO_PAGES_MATCH_UNVERIFIED',
    sourceBrokerSigned:false,brokerAuthenticated:false,
    executionAuthorized:false,productionSafe:false,
    pageCount:archive.responseBytes.length,reasonCodes:[],
    originalBodyDigestChainSha256:chain};
}
export interface PrivateHistoricalFoEncryptedResult {
  status:'REJECTED_PRIVATE_FO_ENCRYPTION'|
    'ENCRYPTED_FO_ARCHIVE_WRITTEN'|'PRIVATE_FO_STORAGE_FAILURE';
  executionAuthorized:false;brokerAuthenticated:false;productionSafe:false;
  encryptedJsonSha256:string|null;
}
const result=(status:PrivateHistoricalFoEncryptedResult['status'],
  hash:string|null=null):PrivateHistoricalFoEncryptedResult=>({
  status,encryptedJsonSha256:hash,executionAuthorized:false,
  brokerAuthenticated:false,productionSafe:false
});
function exclusive(file:string,body:string){
  const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|
    constants.O_NOFOLLOW|constants.O_WRONLY,0o600);
  try{
    const b=Buffer.from(body);let n=0;
    while(n<b.length)n+=writeSync(fd,b,n,b.length-n);
    fsyncSync(fd);
  }finally{closeSync(fd);}
}
function fsyncDir(dir:string){
  const fd=openSync(dir,constants.O_RDONLY|constants.O_DIRECTORY|
    constants.O_NOFOLLOW);
  try{fsyncSync(fd);}finally{closeSync(fd);}
}
/** No plaintext file, no fallback; private 0700 directory + 0600 archive. */
export function persistEncryptedHistoricalFoArchive(
  parent:string,archive:PrivateHistoricalFoArchive,
  report:Phase32HistoricalFoCaptureReport,hexKey:string
):PrivateHistoricalFoEncryptedResult{
  const dir=privateParent(parent),secret=key(hexKey);
  if(!dir||!secret||verifyPrivateHistoricalFoArchive(archive,report).status!==
    'ARCHIVED_FO_PAGES_MATCH_UNVERIFIED')
    return result('REJECTED_PRIVATE_FO_ENCRYPTION');
  try{
    const plaintext=JSON.stringify({
      schemaVersion:'ADAPTIVE_UPSTOX_PHASE32_FO_STORAGE_PLAINTEXT_V1',
      report,archive
    });
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);
    cipher.setAAD(Buffer.from(AAD));
    const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),
      cipher.final()]);
    const envelope=JSON.stringify({
      schemaVersion:'ADAPTIVE_UPSTOX_PHASE32_FO_AES256GCM_V1',
      cipher:'AES-256-GCM',
      nonceBase64:iv.toString('base64'),
      tagBase64:cipher.getAuthTag().toString('base64'),
      ciphertextBase64:ciphertext.toString('base64')
    });
    const directory=join(dir,'fo-'+randomBytes(16).toString('hex'));
    mkdirSync(directory,{mode:0o700});
    exclusive(join(directory,'history.private.aead.json'),envelope);
    fsyncDir(directory);fsyncDir(dir);
    return result('ENCRYPTED_FO_ARCHIVE_WRITTEN',digest(envelope));
  }catch{
    return result('PRIVATE_FO_STORAGE_FAILURE');
  }finally{secret.fill(0);}
}
/** Caller must keep key and decrypted record private and out of chat/logs. */
export function decryptHistoricalFoArchive(
  file:string,hexKey:string
):{report:Phase32HistoricalFoCaptureReport;
  archive:PrivateHistoricalFoArchive}|null{
  const secret=key(hexKey);
  if(!secret||typeof file!=='string'||!isAbsolute(file)||
    file.length>1300||file.includes('\0'))return null;
  try{
    const path=resolve(file);
    if(!privateParent(dirname(path)))return null;
    const info=lstatSync(path);
    if(!info.isFile()||info.isSymbolicLink()||
      (info.mode&0o077)!==0||info.size<10||
      info.size>3_000_000||
      (typeof process.getuid==='function'&&info.uid!==process.getuid()))
      return null;
    const envelope=JSON.parse(readFileSync(path,'utf8')) as
      Record<string,unknown>;
    if(!record(envelope)||envelope.schemaVersion!==
      'ADAPTIVE_UPSTOX_PHASE32_FO_AES256GCM_V1'||
      envelope.cipher!=='AES-256-GCM')return null;
    const iv=b64(envelope.nonceBase64,64),
      tag=b64(envelope.tagBase64,64),
      ct=b64(envelope.ciphertextBase64,4_000_000);
    if(!iv||iv.length!==12||!tag||tag.length!==16||!ct||!ct.length)
      return null;
    const decipher=createDecipheriv('aes-256-gcm',secret,iv);
    decipher.setAAD(Buffer.from(AAD));decipher.setAuthTag(tag);
    const plain=Buffer.concat([decipher.update(ct),decipher.final()]);
    if(plain.length>2_000_000)return null;
    const decryptedRecord=JSON.parse(plain.toString('utf8')) as Record<string,unknown>;
    if(!decryptedRecord||decryptedRecord.schemaVersion!==
      'ADAPTIVE_UPSTOX_PHASE32_FO_STORAGE_PLAINTEXT_V1')
      return null;
    const report=decryptedRecord.report as Phase32HistoricalFoCaptureReport;
    const archive=decryptedRecord.archive as PrivateHistoricalFoArchive;
    return verifyPrivateHistoricalFoArchive(archive,report).status===
      'ARCHIVED_FO_PAGES_MATCH_UNVERIFIED'?{report,archive}:null;
  }catch{return null;
  }finally{secret.fill(0);}
}
