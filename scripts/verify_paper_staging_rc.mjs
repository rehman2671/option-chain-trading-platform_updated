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
  SMTP_PASS:'',
  ADMIN_EMAIL:'paper-rc-'+randomBytes(6).toString('hex')+'@example.invalid',
  ADMIN_INITIAL_PASSWORD:randomBytes(32).toString('hex'),
  ADMIN_NAME:'Paper Staging Disposable Admin'
};
for(const s of secrets)delete env[s];
let logs='';
let child;
const append=(data)=>{logs=(logs+String(data)).slice(-7000);};
const probe=async(path,method='GET',payload=null,token=null)=>{
  const headers={};
  if(method==='POST')headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  const r=await fetch('http://127.0.0.1:3000'+path,{
    method,headers,
    body:method==='POST'?JSON.stringify(payload??{}):undefined,
    signal:AbortSignal.timeout(2500)
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
  // Guest access to the shared anonymous paper portfolio is not
  // acceptable in an isolated staging tenant. Recheck both read+write.
  const guestPortfolio=await probe('/api/paper-trading/portfolio');
  const guestOrder=await probe('/api/paper-trading/start','POST',{
    strategyName:'REJECT_GUEST',
    legs:[{strikePrice:25000,type:'CE',action:'BUY',
      quantity:1,lotSize:50,currentLtp:100}]
  });
  if(guestPortfolio.status!==401||guestOrder.status!==401)
    throw Error('PAPER_RC_GUEST_PAPER_LEDGER_OR_ORDER_NOT_AUTHENTICATED');

  // Use disposable, CI-generated staging administrator credentials to
  // verify a REAL authenticated paper workflow, never real broker execution.
  const login=await probe('/api/auth/login','POST',{
    email:env.ADMIN_EMAIL,password:env.ADMIN_INITIAL_PASSWORD
  });
  if(login.status!==200)throw Error('PAPER_RC_TEMP_ADMIN_LOGIN_FAILED: '+login.status);
  const session=JSON.parse(login.body);
  if(session.success!==true||session.user?.role!=='SUPERADMIN'||
     typeof session.token!=='string')
    throw Error('PAPER_RC_AUTHENTICATED_SESSION_INVALID');
  const token=session.token;
  const account=await probe('/api/auth/me','GET',null,token);
  if(account.status!==200||
     JSON.parse(account.body).authenticated!==true)
    throw Error('PAPER_RC_AUTHENTICATED_ME_FAILED');
  const beforePaper=await probe('/api/paper-trading/portfolio','GET',null,token);
  if(beforePaper.status!==200||
     !Array.isArray(JSON.parse(beforePaper.body).positions))
    throw Error('PAPER_RC_PAPER_PORTFOLIO_LOAD_FAILED');
  const opened=await probe('/api/paper-trading/start','POST',{
    strategyName:'RC1 isolated paper smoke',
    symbol:'NIFTY',
    legs:[{strikePrice:25000,type:'CE',action:'BUY',
      quantity:1,lotSize:50,currentLtp:100,
      product:'NRML',expiry:'CURRENT'}]
  },token);
  if(opened.status!==200)
    throw Error('PAPER_RC_PAPER_OPEN_FAILED: '+opened.status+
      ' '+opened.body.slice(0,500));
  const entry=JSON.parse(opened.body);
  if(entry.success!==true||entry.positions?.length!==1||
     entry.positions[0].status!=='OPEN'||
     entry.positions[0].quantity!==50)
    throw Error('PAPER_RC_PAPER_OPEN_POSITION_INVALID');
  const paperPositionId=entry.positions[0].id;
  const afterOpen=await probe('/api/paper-trading/portfolio','GET',null,token);
  const portfolioOpen=JSON.parse(afterOpen.body);
  if(afterOpen.status!==200||
     !portfolioOpen.positions.some(p=>p.id===paperPositionId&&p.status==='OPEN'))
    throw Error('PAPER_RC_PAPER_PORTFOLIO_OPEN_NOT_RECORDED');
  const close=await probe('/api/paper-trading/close/'+
    encodeURIComponent(paperPositionId),'POST',{
      exitPrice:110,reason:'RC1 synthetic paper close'
    },token);
  if(close.status!==200)
    throw Error('PAPER_RC_PAPER_CLOSE_FAILED: '+close.status);
  const closed=JSON.parse(close.body);
  if(closed.success!==true||
     !closed.portfolio?.closedPositions?.some(p=>
       p.id===paperPositionId&&p.status==='CLOSED'))
    throw Error('PAPER_RC_PAPER_CLOSE_NOT_RECORDED');
  if(closed.portfolio.positions.some(p=>p.id===paperPositionId))
    throw Error('PAPER_RC_CLOSED_PAPER_POSITION_REMAINS_OPEN');
  // Authenticating as SUPERADMIN does NOT remove paper-staging broker auth denial.
  const elevated=await probe('/api/upstox/set-token','POST',{
    accessToken:'FAKE-NO-BROKER-TOKEN'
  },token);
  if(elevated.status!==403)
    throw Error('PAPER_RC_AUTHENTICATED_BROKER_TOKEN_ROUTE_BYPASS');
  console.log('PAPER_RC1_SMOKE_SUCCESS: built backend+React, practice provider, '+
    'health, staging deny, disposable admin login, virtual paper BUY/close/ledger '+
    'and authenticated Upstox token-route denial');
}finally{
  if(child&&child.exitCode===null)child.kill('SIGTERM');
  await sleep(350);
  rmSync(tmp,{recursive:true,force:true});
}
