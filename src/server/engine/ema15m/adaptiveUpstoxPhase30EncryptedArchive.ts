/**
 * Adaptive Swing v2 Phase30 — owner-private AES-256-GCM evidence archive.
 * Caller supplies 32-byte random key OUT OF BAND; key never gets written.
 * Not a KMS, HSM, WORM store or independent broker authentication.
 */
import {
  createCipheriv,createDecipheriv,createHash,randomBytes
} from 'node:crypto';
import {
  constants,closeSync,fsyncSync,lstatSync,mkdirSync,openSync,
  readFileSync,realpathSync,statSync,writeSync
} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import type {
  AuthorizedOfflineCaptureReport,SensitiveReadOnlyCaptureArchive
} from './adaptiveUpstoxAuthorizedGetCapture.js';

const AAD='ADAPTIVE_SWING_V2_PHASE30_PRIVATE_CAPTURE_AES256GCM_V1';
const KEY=/^[0-9a-f]{64}$/i;
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
export interface EncryptedCaptureWriteReport {
  status:'REJECTED_ENCRYPTION_PRECONDITION'|
    'ENCRYPTED_PRIVATE_CAPTURE_WRITTEN'|'PRIVATE_ENCRYPTED_WRITE_FAILED';
  ciphertextSha256:string|null;
  executionAuthorized:false;productionSafe:false;brokerAuthenticated:false;
}
export interface Phase30DecryptedPrivateCapture {
  schemaVersion:'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1';
  origin:'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED';
  report:AuthorizedOfflineCaptureReport;
  archive:SensitiveReadOnlyCaptureArchive;
}
interface EncryptedEnvelope {
  schemaVersion:'ADAPTIVE_UPSTOX_PHASE30_AES256GCM_AT_REST_V1';
  cipher:'AES-256-GCM';
  nonceBase64:string;
  tagBase64:string;
  ciphertextBase64:string;
}
const res=(status:EncryptedCaptureWriteReport['status'],
  ciphertextSha256:string|null=null):EncryptedCaptureWriteReport=>({
  status,ciphertextSha256,
  executionAuthorized:false,productionSafe:false,brokerAuthenticated:false
});
function ownerPrivateParent(parent:string):string|null{
  if(typeof parent!=='string'||!isAbsolute(parent)||parent.length>1024||
    parent.includes('\0'))return null;
  try{
    const dir=resolve(parent),l=lstatSync(dir);
    if(!l.isDirectory()||l.isSymbolicLink()||(l.mode&0o077)!==0||
      realpathSync(dir)!==dir)return null;
    if(typeof process.getuid==='function'&&l.uid!==process.getuid())
      return null;
    return dir;
  }catch{return null;}
}
function key(raw:unknown):Buffer|null{
  return typeof raw==='string'&&KEY.test(raw)?Buffer.from(raw,'hex'):null;
}
function strict64(v:unknown,max:number):Buffer|null{
  if(typeof v!=='string'||!v||v.length>max||v.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    return null;
  const bytes=Buffer.from(v,'base64');
  return bytes.toString('base64')===v?bytes:null;
}
function persist(file:string,body:string){
  const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|
    constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{
    const b=Buffer.from(body);
    let cursor=0;
    while(cursor<b.length)cursor+=writeSync(fd,b,cursor,b.length-cursor);
    fsyncSync(fd);
  }finally{closeSync(fd);}
}
function fsyncDirectory(dir:string){
  const fd=openSync(dir,constants.O_RDONLY|constants.O_DIRECTORY|
    constants.O_NOFOLLOW);
  try{fsyncSync(fd);}finally{closeSync(fd);}
}
/**
 * Default Phase30 manual collection writer: NEVER saves plaintext source JSON.
 * Existing Phase29 experimental plaintext helper is not used by this writer.
 */
export function persistEncryptedPrivateReadOnlyCapture(
  parent:string,report:AuthorizedOfflineCaptureReport,
  archive:SensitiveReadOnlyCaptureArchive|null,
  rawKeyHex:string
):EncryptedCaptureWriteReport {
  const dir=ownerPrivateParent(parent),secret=key(rawKeyHex);
  if(!dir||!secret||!archive||!report||
    report.status!=='CAPTURE_RECORDED_UNVERIFIED'||
    report.accountProfileMatched!==true||
    report.readOnlyNetworkActuallyAttempted!==true||
    report.responseCount!==5||
    !Array.isArray(archive.byteWitnesses)||
    archive.byteWitnesses.length!==4)
    return res('REJECTED_ENCRYPTION_PRECONDITION');
  try{
    const plaintext=JSON.stringify({
      schemaVersion:'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1',
      origin:'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED',
      report,archive
    } satisfies Phase30DecryptedPrivateCapture);
    const iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',secret,iv);
    cipher.setAAD(Buffer.from(AAD,'utf8'));
    const encrypted=Buffer.concat([
      cipher.update(plaintext,'utf8'),cipher.final()
    ]);
    const tag=cipher.getAuthTag();
    const wrapped:EncryptedEnvelope={
      schemaVersion:'ADAPTIVE_UPSTOX_PHASE30_AES256GCM_AT_REST_V1',
      cipher:'AES-256-GCM',nonceBase64:iv.toString('base64'),
      tagBase64:tag.toString('base64'),
      ciphertextBase64:encrypted.toString('base64')
    };
    const body=JSON.stringify(wrapped);
    const sub=join(dir,'capture-'+randomBytes(16).toString('hex'));
    mkdirSync(sub,{mode:0o700});
    persist(join(sub,'evidence.private.aead.json'),body);
    fsyncDirectory(sub);fsyncDirectory(dir);
    return res('ENCRYPTED_PRIVATE_CAPTURE_WRITTEN',digest(body));
  }catch{
    return res('PRIVATE_ENCRYPTED_WRITE_FAILED');
  }finally{secret.fill(0);}
}
/**
 * Read a PRIVATE encrypted Phase30 archive with a separate out-of-band key.
 * Fail closed and return null: NEVER throw raw content/file path to callers.
 * No permissive plaintext fallback.
 */
export function decryptPrivateReadOnlyCapture(
  absolutePath:string,rawKeyHex:string
):Phase30DecryptedPrivateCapture|null{
  const secret=key(rawKeyHex);
  if(!secret||typeof absolutePath!=='string'||
    !isAbsolute(absolutePath)||absolutePath.length>1300||
    absolutePath.includes('\0'))return null;
  try{
    const path=resolve(absolutePath),parent=dirname(path);
    if(!ownerPrivateParent(parent))return null;
    const meta=lstatSync(path);
    if(!meta.isFile()||meta.isSymbolicLink()||
      (meta.mode&0o077)!==0||
      meta.size<10||meta.size>3_000_000)return null;
    if(typeof process.getuid==='function'&&meta.uid!==process.getuid())
      return null;
    const data=JSON.parse(readFileSync(path,'utf8')) as EncryptedEnvelope;
    if(!data||data.schemaVersion!==
      'ADAPTIVE_UPSTOX_PHASE30_AES256GCM_AT_REST_V1'||
      data.cipher!=='AES-256-GCM')return null;
    const iv=strict64(data.nonceBase64,64),
      tag=strict64(data.tagBase64,64),
      ct=strict64(data.ciphertextBase64,4_000_000);
    if(!iv||iv.length!==12||!tag||tag.length!==16||
      !ct||ct.length===0)return null;
    const dec=createDecipheriv('aes-256-gcm',secret,iv);
    dec.setAAD(Buffer.from(AAD,'utf8'));
    dec.setAuthTag(tag);
    const plain=Buffer.concat([dec.update(ct),dec.final()]);
    if(plain.length>2_000_000)return null;
    const parsed=JSON.parse(plain.toString('utf8')) as
      Phase30DecryptedPrivateCapture;
    if(!parsed||parsed.schemaVersion!==
      'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1'||
      parsed.origin!==
      'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED'||
      !parsed.report||!parsed.archive)return null;
    return parsed;
  }catch{return null;
  }finally{secret.fill(0);}
}
