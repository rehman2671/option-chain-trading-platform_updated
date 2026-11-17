/**
 * Manual-only Phase32 Upstox Analytics GET historical F&O collector.
 * NEVER invoked by the live trading engine/server/scheduler.
 * Never paste credentials, UCC, private notes or key into chat/CI/source.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  collectExplicitHistoricalFoGetEvidence,
  createStrictHistoricalFoGetTransport,
  type ExplicitHistoricalFoCaptureRequest
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase32HistoricalFoCollector.js';
import {createStrictNativeUpstoxAnalyticsGetTransport}
  from '../src/server/engine/ema15m/adaptiveUpstoxAuthorizedGetCapture.js';
import {privateEvidenceParentReady}
  from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';
import {persistEncryptedHistoricalFoArchive}
  from '../src/server/engine/ema15m/adaptiveUpstoxPhase32HistoricalFoArchive.js';

const index=process.argv.indexOf('--request');
const path=index<0?null:process.argv[index+1]??null;
const destIndex=process.argv.indexOf('--private-parent');
const privateParent=destIndex<0?null:process.argv[destIndex+1]??null;
const approved=process.argv.includes('--approve-get-only');
const whitelisted=process.argv.includes('--confirm-whitelisted-static-ip');
const token=process.env.UPSTOX_ANALYTICS_READONLY_TOKEN;
const encryption=process.env.ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX;
const safeFile=(name:string|null):name is string=>{
  if(!name||!isAbsolute(name)||name.length>1300||
    name.includes('\0')||!privateEvidenceParentReady(dirname(name)))
    return false;
  try{
    const r=lstatSync(resolve(name));
    return r.isFile()&&!r.isSymbolicLink()&&
      (r.mode&0o077)===0&&r.size>2&&r.size<65536&&
      (typeof process.getuid!=='function'||r.uid===process.getuid());
  }catch{return false;}
};
if(!approved||!whitelisted||!safeFile(path)||!privateParent||
  !privateEvidenceParentReady(privateParent)||
  !token||token.length<12||!encryption||
  !/^[0-9a-f]{64}$/i.test(encryption)){
  console.error('PHASE32_MANUAL_FO_GET_NOT_AUTHORIZED_OR_PRIVATE_STORAGE_NOT_READY');
  console.error('Usage: (privately provision UPSTOX_ANALYTICS_READONLY_TOKEN and ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX) npx tsx scripts/capture-adaptive-upstox-historical-fo-get.ts --approve-get-only --confirm-whitelisted-static-ip --request <PRIVATE-0600-request-metadata.json> --private-parent <EXISTING_OWNER_0700_DIRECTORY>');
  process.exitCode=2;
}else{
  try{
    const request=JSON.parse(readFileSync(path,'utf8')) as
      Omit<ExplicitHistoricalFoCaptureRequest,
        'analyticsToken'|'operatorAuthorization'|
        'staticIpReview'|'credentialType'>;
    const outcome=await collectExplicitHistoricalFoGetEvidence({
      ...request,analyticsToken:token,
      operatorAuthorization:'ACCOUNT_OWNER_APPROVED_GET_ONLY',
      staticIpReview:'OPERATOR_ATTESTS_WHITELISTED_EGRESS',
      credentialType:'UPSTOX_ANALYTICS_TOKEN_ONLY'
    },createStrictNativeUpstoxAnalyticsGetTransport(),
    createStrictHistoricalFoGetTransport());
    const stored=outcome.privateArchive?
      persistEncryptedHistoricalFoArchive(
        privateParent,outcome.privateArchive,outcome.report,encryption):null;
    // Results safe to print: NO token, key, raw page, UCC, order/trade ID, path.
    console.log(JSON.stringify({
      capture:outcome.report,
      privateEncryptedStorageStatus:stored?.status??'NOT_STORED',
      privateEncryptedJsonSha256:stored?.encryptedJsonSha256??null
    },null,2));
    if(outcome.report.status!=='CAPTURE_RECORDED_UNVERIFIED'||
      stored?.status!=='ENCRYPTED_FO_ARCHIVE_WRITTEN'||
      outcome.report.phase31Status!==
        'HISTORICAL_FILLS_RECONCILED_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE32_PRIVATE_HISTORICAL_GET_FAILED_WITHOUT_DETAILS');
    process.exitCode=2;
  }
}
