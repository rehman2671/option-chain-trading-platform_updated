/**
 * Local/CI RELEASE-CANDIDATE smoke only. No real broker credentials,
 * live orders, external deployment or persistent local operator DB.
 * Run AFTER npm run build: npm run smoke:paper-staging
 */
import {spawn} from 'node:child_process';
import {existsSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';

const root=process.cwd();
const compiled=resolve(root,'dist/server.cjs');
const frontend=resolve(root,'dist/index.html');
const secrets=[
  'UPSTOX_ACCESS_TOKEN','UPSTOX_TOKEN','UPSTOX_API_KEY',
  'UPSTOX_API_SECRET','UPSTOX_PIN','UPSTOX_TOTP_SECRET',
  'UPSTOX_MOBILE_NO','UPSTOX_CLIENT_ID','UPSTOX_USER_ID',
  'UPSTOX_TOTP_KEY'
];
if(secrets.some(s=>process.env[s]?.trim()))
  throw Error('PAPER_RC_SMOKE_REFUSED_BROKER_SECRET_IN_HOST_ENV');
if(!existsSync(compiled)||!existsSync(frontend))
  throw Error('PAPER_RC_SMOKE_REQUIRES_NPM_RUN_BUILD');
const tmp=mkdtempSync(join(tmpdir(),'option-rc1-paper-smoke-'));
const dist=join(tmp,'dist');
cpSync(resolve(root,'dist'),dist,{recursive:true});
if(existsSync(resolve(root,'assets')))
  cpSync(resolve(root,'assets'),join(tmp,'assets'),{recursive:true});
const env={
  ...process.env,
  NODE_ENV:'production',
  PAPER_STAGING_MODE:'1',
  DATA_PROVIDER:'practice',
  JWT_SECRET:randomBytes(48).toString('hex'),
  QUANT_SUPERVISOR_RESET_KEY:randomBytes(48).toString('hex'),
  GEMINI_API_KEY:'',
  TELEGRAM_BOT_TOKEN:'',
  TELEGRAM_CHAT_ID:'',
  SMTP_PASS:''
};
for(const s of secrets)delete env[s];
let logs='';
let child;
const append=(data)=>{logs=(logs+String(data)).slice(-7000);};
const probe=async(path,method='GET')=>{
  const r=await fetch('http://127.0.0.1:3000'+path,{
    method,
    headers:method==='POST'?{'Content-Type':'application/json'}:undefined,
    body:method==='POST'?'{}':undefined,
    signal:AbortSignal.timeout(2000)
  });
  return {status:r.status,
    body:await r.text()};
};
const sleep=(ms)=>new Promise(done=>setTimeout(done,ms));
try{
  child=spawn(process.execPath,[compiled],{
    cwd:tmp,env,stdio:['ignore','pipe','pipe']
  });
  child.stdout.on('data',append);
  child.stderr.on('data',append);
  let reachable=false;
  for(let i=0;i<70;i++){
    if(child.exitCode!==null)break;
    try{
      const r=await probe('/api/health');
      if(r.status===200){
        const j=JSON.parse(r.body);
        if(j.status==='ok'){reachable=true;break;}
      }
    }catch{}
    await sleep(750);
  }
  if(!reachable)
    throw Error('PAPER_RC_SERVER_DID_NOT_START_OR_HEALTH_FAILED: '+
      logs.slice(-1200));
  const release=await probe('/api/release/status');
  const status=JSON.parse(release.body);
  if(release.status!==200||status.mode!=='PAPER_STAGING_RC'||
     status.paperOnly!==true||
     status.liveBrokerOrdersAuthorized!==false||
     status.nrmlTradingAuthorized!==false)
    throw Error('PAPER_RC_RELEASE_STATUS_NOT_FAIL_CLOSED');
  const system=await probe('/api/system/health');
  if(system.status!==200||
     JSON.parse(system.body).mode!=='PRACTICE')
    throw Error('PAPER_RC_PROVIDER_MODE_NOT_PRACTICE');
  const frontendSmoke=await probe('/');
  if(frontendSmoke.status!==200||
     !frontendSmoke.body.toLowerCase().includes('<html'))
    throw Error('PAPER_RC_UI_STATIC_INDEX_UNAVAILABLE');
  for(const [path,method] of [
    ['/api/upstox/status','GET'],
    ['/api/upstox/auto-login','POST'],
    ['/api/upstox/set-token','POST'],
    ['/api/upstox/callback','GET']
  ]){
    const r=await probe(path,method);
    if(r.status!==403||
       !r.body.includes('PAPER_STAGING_BROKER_ACCESS_DISABLED'))
      throw Error('PAPER_RC_UPSTOX_AUTH_ROUTE_NOT_DISABLED');
  }
  const privateReads=[
    '/api/ema15m/live-summary',
    '/api/ema15m/live-positions'
  ];
  for(const path of privateReads){
    const r=await probe(path);
    if(r.status!==401&&r.status!==403)
      throw Error('PAPER_RC_UNAUTHENTICATED_LIVE_DATA_VISIBLE');
  }
  const mut=await probe('/api/ema15m/live-positions/close','POST');
  if(mut.status!==401&&mut.status!==403)
    throw Error('PAPER_RC_UNAUTHENTICATED_BROKER_EXIT_NOT_REJECTED');
  console.log('PAPER_RC1_SMOKE_SUCCESS: built backend, UI, practice provider, '+
    'health, staging flag, denied broker auth and unauthenticated live routes');
}finally{
  if(child&&child.exitCode===null)child.kill('SIGTERM');
  await sleep(350);
  rmSync(tmp,{recursive:true,force:true});
}
