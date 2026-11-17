import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,readdirSync,readFileSync,
  rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {
  decryptPrivateReadOnlyCapture,persistEncryptedPrivateReadOnlyCapture
} from '../../server/engine/ema15m/adaptiveUpstoxPhase30EncryptedArchive.js';
import type {
  SensitiveReadOnlyCaptureArchive,AuthorizedOfflineCaptureReport
} from '../../server/engine/ema15m/adaptiveUpstoxAuthorizedGetCapture.js';

const UCC='SYNTHETIC_UCC_PRIVATE_PHASE30';
const secret=randomBytes(32).toString('hex');
const report={
  mode:'EXPLICIT_GET_ONLY_BROKER_EVIDENCE_CAPTURE',
  status:'CAPTURE_RECORDED_UNVERIFIED',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  nativeOrderInstruction:null,readOnlyNetworkActuallyAttempted:true,
  accountProfileMatched:true,phase26Status:'STRUCTURAL_REVIEW_ONLY',
  reasonCodes:[],responseCount:5,responseBodySha256:{},
  accountScopeSha256:'ab'.repeat(32),warnings:[]
} as AuthorizedOfflineCaptureReport;
const archive={
  profileResponseUtf8Base64:Buffer.from(JSON.stringify({
    status:'success',data:{user_id:UCC}
  })).toString('base64'),
  frame:{sequence:1,asOf:'2026-11-17T10:00:00Z',
    expected:{accountScopeId:UCC,instrumentKey:'NSE_FO|PRIVATE',
      productType:'NRML',expiry:'2026-12-24',lotSize:65,
      expectedNetLongQuantity:130},
    capture:{accountScopeId:UCC},trades:{}},
  byteWitnesses:['positions','orders','gtts','trades'].map(book=>({
    book,sequence:1,responseUtf8Base64:Buffer.from(
      '{"status":"success","data":[]}').toString('base64')
  }))
} as unknown as SensitiveReadOnlyCaptureArchive;
function privateDir(){
  const dir=mkdtempSync(join(tmpdir(),'phase30-encrypted-'));
  chmodSync(dir,0o700);
  return dir;
}
const file=(parent:string)=>{
  const names=readdirSync(parent);
  assert.equal(names.length,1);
  return join(parent,names[0],'evidence.private.aead.json');
};
describe('Phase30 local AES-256-GCM broker GET evidence retention',()=>{
  it('writes private encrypted bytes, never exposed plaintext UCC/contract',()=>{
    const dir=privateDir();
    try{
      const result=persistEncryptedPrivateReadOnlyCapture(
        dir,report,archive,secret);
      assert.equal(result.status,'ENCRYPTED_PRIVATE_CAPTURE_WRITTEN');
      assert.ok(/^[a-f0-9]{64}$/.test(result.ciphertextSha256!));
      assert.equal(result.brokerAuthenticated,false);
      assert.equal(result.executionAuthorized,false);
      const path=file(dir);
      const text=readFileSync(path,'utf8');
      assert.ok(!text.includes(UCC));
      assert.ok(!text.includes('NSE_FO|PRIVATE'));
      assert.ok(!text.includes('SYNTHETIC_STOP'));
      assert.ok(!text.includes(secret));
      assert.equal(statSync(path).mode&0o077,0);
      assert.equal(statSync(join(dir,readdirSync(dir)[0])).mode&0o077,0);
      const recovered=decryptPrivateReadOnlyCapture(path,secret);
      assert.equal(recovered?.report.status,'CAPTURE_RECORDED_UNVERIFIED');
      assert.equal(recovered?.archive.frame.expected.accountScopeId,UCC);
      assert.equal(recovered?.schemaVersion,
        'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('wrong key and malformed/nonhex key fail closed without body disclosure',()=>{
    const dir=privateDir();
    try{
      const invalid=persistEncryptedPrivateReadOnlyCapture(
        dir,report,archive,'INVALID_KEY');
      assert.equal(invalid.status,'REJECTED_ENCRYPTION_PRECONDITION');
      assert.equal(readdirSync(dir).length,0);
      assert.equal(persistEncryptedPrivateReadOnlyCapture(
        dir,report,archive,secret).status,
        'ENCRYPTED_PRIVATE_CAPTURE_WRITTEN');
      const path=file(dir);
      assert.equal(decryptPrivateReadOnlyCapture(
        path,randomBytes(32).toString('hex')),null);
      assert.equal(decryptPrivateReadOnlyCapture(path,'WRONG'),null);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('GCM tag/ciphertext changes are rejected, never fall back to plaintext',()=>{
    const dir=privateDir();
    try{
      persistEncryptedPrivateReadOnlyCapture(dir,report,archive,secret);
      const path=file(dir);
      const contents=JSON.parse(readFileSync(path,'utf8'));
      contents.tagBase64=Buffer.from(randomBytes(16)).toString('base64');
      writeFileSync(path,JSON.stringify(contents),{mode:0o600});
      assert.equal(decryptPrivateReadOnlyCapture(path,secret),null);
      writeFileSync(path,JSON.stringify({
        schemaVersion:'ADAPTIVE_UPSTOX_PHASE29_PRIVATE_CAPTURE_V1',
        origin:'EXPLICIT_OPERATOR_APPROVED_GET_ONLY_NOT_BROKER_SIGNED',
        report,archive
      }),{mode:0o600});
      assert.equal(decryptPrivateReadOnlyCapture(path,secret),null);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('two writes get distinct random nonce/ciphertext (no overwrite)',()=>{
    const dir=privateDir();
    try{
      const first=persistEncryptedPrivateReadOnlyCapture(
        dir,report,archive,secret);
      const second=persistEncryptedPrivateReadOnlyCapture(
        dir,report,archive,secret);
      assert.equal(readdirSync(dir).length,2);
      assert.notEqual(first.ciphertextSha256,second.ciphertextSha256);
      for(const child of readdirSync(dir)){
        const path=join(dir,child,'evidence.private.aead.json');
        assert.ok(decryptPrivateReadOnlyCapture(path,secret));
      }
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('owner-private parent and 0600 file enforced',()=>{
    const dir=privateDir();
    try{
      chmodSync(dir,0o755);
      assert.equal(persistEncryptedPrivateReadOnlyCapture(
        dir,report,archive,secret).status,
        'REJECTED_ENCRYPTION_PRECONDITION');
      chmodSync(dir,0o700);
      assert.equal(persistEncryptedPrivateReadOnlyCapture(
        dir,report,archive,secret).status,
        'ENCRYPTED_PRIVATE_CAPTURE_WRITTEN');
      const path=file(dir);
      chmodSync(path,0o644);
      assert.equal(decryptPrivateReadOnlyCapture(path,secret),null);
      chmodSync(path,0o600);
      assert.ok(decryptPrivateReadOnlyCapture(path,secret));
    }finally{chmodSync(dir,0o700);rmSync(dir,{recursive:true,force:true});}
  });
  it('a failed/mock-only evidence report cannot be encrypted as success',()=>{
    const dir=privateDir();
    try{
      const denied=persistEncryptedPrivateReadOnlyCapture(
        dir,{...report,status:'CAPTURE_FAILED'},archive,secret);
      assert.equal(denied.status,'REJECTED_ENCRYPTION_PRECONDITION');
      assert.equal(readdirSync(dir).length,0);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
});
