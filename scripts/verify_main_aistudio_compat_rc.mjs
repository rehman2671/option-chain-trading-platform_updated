/**
 * Main/Google AI Studio compatibility smoke. Simulated PRACTICE ONLY,
 * no broker credentials, no orders, no external Cloud Run deployment.
 * Validates that RC staging-only gates are NOT accidentally mandatory
 * when the ordinary application runs without PAPER_STAGING_MODE.
 * Requires: npm run build.
 */
import {spawn} from 'node:child_process';
import {existsSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';

const root=process.cwd();
const binary=resolve(root,'dist/server.cjs');
if(!existsSync(binary)||!existsSync(resolve(root,'dist/index.html')))
  throw Error('MAIN_COMPAT_SMOKE_REQUIRES_BUILD');
const banned=[
  'UPSTOX_ACCESS_TOKEN','UPSTOX_TOKEN',
  'UPSTOX_API_KEY','UPSTOX_API_SECRET',
  'UPSTOX_PIN','UPSTOX_TOTP_SECRET',
  'UPSTOX_USER_ID','UPSTOX_TOTP_KEY',
  'UPSTOX_MOBILE_NO','UPSTOX_CLIENT_ID'
];
if(banned.some(key=>process.env[key]?.trim()))
  throw Error('MAIN_COMPAT_SMOKE_HOST_BROKER_CREDENTIALS_DENIED');
const dir=mkdtempSync(join(tmpdir(),'main-aistudio-practice-'));
const port=43139;
cpSync(resolve(root,'dist'),join(dir,'dist'),{recursive:true});
cpSync(resolve(root,'server.ts'),join(dir,'server.ts'));
if(existsSync(resolve(root,'assets')))
  cpSync(resolve(root,'assets'),join(dir,'assets'),{recursive:true});
const env={
  ...process.env,
  NODE_ENV:'production',
  DATA_PROVIDER:'practice',
  JWT_SECRET:randomBytes(48).toString('hex'),
  PORT:String(port),
  GEMINI_API_KEY:'',
  TELEGRAM_BOT_TOKEN:'',
  TELEGRAM_CHAT_ID:'',
  SMTP_PASS:''
};
delete env.PAPER_STAGING_MODE;
delete env.PAPER_RC_LOCKED;
delete env.PAPER_STAGING_DB_DIR;
for(const key of banned)delete env[key];
let logTail='';
let child;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const probe=async(route)=>{
  const r=await fetch('http://127.0.0.1:'+port+route,
    {signal:AbortSignal.timeout(2000)});
  return {status:r.status,body:await r.text()};
};
try{
  // Match original Google AI Studio npm start -> node server.ts launcher.
  child=spawn(process.execPath,[join(dir,'server.ts')],{
    cwd:dir,env,stdio:['ignore','pipe','pipe']
  });
  child.stdout.on('data',v=>{logTail=(logTail+v.toString()).slice(-1800);});
  child.stderr.on('data',v=>{logTail=(logTail+v.toString()).slice(-1800);});
  let online=false;
  for(let i=0;i<70;i++){
    if(child.exitCode!==null)break;
    try{
      const health=await probe('/api/health');
      if(health.status===200&&JSON.parse(health.body).status==='ok'){
        online=true;break;
      }
    }catch{}
    await sleep(700);
  }
  if(!online)throw Error('MAIN_COMPAT_SERVER_FAILED: '+logTail);
  const r=await probe('/api/release/status');
  if(r.status!==200)throw Error('MAIN_COMPAT_RELEASE_STATUS_NOT_FOUND');
  const status=JSON.parse(r.body);
  if(status.mode!=='NOT_CERTIFIED'||status.paperOnly!==false||
     status.nrmlTradingAuthorized!==false)
    throw Error('MAIN_COMPAT_RELEASE_STATUS_MISLABELED');
  const provider=await probe('/api/system/health');
  if(provider.status!==200||JSON.parse(provider.body).mode!=='PRACTICE')
    throw Error('MAIN_COMPAT_EXPECTED_PRACTICE_PROVIDER');
  const page=await probe('/');
  if(page.status!==200||!page.body.toLowerCase().includes('<html'))
    throw Error('MAIN_COMPAT_REACT_FRONTEND_MISSING');
  // Normal application uses its historical cwd SQLite location rather
  // than requiring the staging Docker volume.
  if(!existsSync(join(dir,'option_platform.sqlite')))
    throw Error('MAIN_COMPAT_EXPECTED_CWD_DATABASE');
  console.log('MAIN_AISTUDIO_COMPAT_SMOKE_SUCCESS: ordinary app mode '+
    'without staging flag, built UI, practice provider and SQLite startup');
}finally{
  if(child&&child.exitCode===null)child.kill('SIGTERM');
  await sleep(350);
  rmSync(dir,{recursive:true,force:true});
}
