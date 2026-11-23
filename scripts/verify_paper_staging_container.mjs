/**
 * Docker/hosted-container paper RC1 validation, not a real broker test.
 * Container must already be running with a writable separate data volume.
 * A first invocation writes a random synthetic paper position ID to a
 * runner-local result file; the second verifies it survived container restart.
 */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const base=process.env.PAPER_RC_CONTAINER_URL||'http://127.0.0.1:43138';
const email=process.env.PAPER_RC_ADMIN_EMAIL||'';
const password=process.env.PAPER_RC_ADMIN_PASSWORD||'';
const resultPath=process.env.PAPER_RC_RESULT_PATH||'';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)||!email||!password||!resultPath)
  throw Error('PAPER_RC_CONTAINER_SMOKE_CONFIG_INVALID');
const call=async(route,method='GET',payload,token)=>{
  const r=await fetch(base+route,{
    method,
    headers:{
      ...(payload?{'Content-Type':'application/json'}:{}),
      ...(token?{'Authorization':'Bearer '+token}:{})
    },
    body:payload?JSON.stringify(payload):undefined,
    signal:AbortSignal.timeout(5000)
  });
  return {status:r.status,body:await r.text()};
};
const release=await call('/api/release/status');
if(release.status!==200)throw Error('PAPER_CONTAINER_RELEASE_STATUS_UNAVAILABLE');
const info=JSON.parse(release.body);
if(info.paperOnly!==true||info.nrmlTradingAuthorized!==false||
   info.liveBrokerOrdersAuthorized!==false)
  throw Error('PAPER_CONTAINER_NONPAPER_RELEASE_STATUS');
const health=await call('/api/system/health');
if(health.status!==200||JSON.parse(health.body).mode!=='PRACTICE')
  throw Error('PAPER_CONTAINER_PROVIDER_NOT_PRACTICE');
const guest=await call('/api/paper-trading/portfolio');
if(guest.status!==401)throw Error('PAPER_CONTAINER_GUEST_LEDGER_NOT_DENIED');
const login=await call('/api/auth/login','POST',{email,password});
if(login.status!==200)throw Error('PAPER_CONTAINER_ADMIN_LOGIN_REJECTED');
const auth=JSON.parse(login.body);
if(auth.success!==true||auth.user?.role!=='SUPERADMIN'||!auth.token)
  throw Error('PAPER_CONTAINER_ADMIN_NOT_AUTHENTICATED');
const token=auth.token;
const broker=await call('/api/upstox/set-token','POST',{accessToken:'FAKE'},token);
if(broker.status!==403)throw Error('PAPER_CONTAINER_BROKER_TOKEN_ROUTE_OPEN');
if(existsSync(resultPath)){
  const id=readFileSync(resultPath,'utf8').trim();
  if(!/^pos-[\d-]+$/.test(id))throw Error('PAPER_CONTAINER_INVALID_PERSISTED_TEST_ID');
  const p=await call('/api/paper-trading/portfolio','GET',undefined,token);
  if(p.status!==200||
     !JSON.parse(p.body).closedPositions.some(x=>x.id===id&&x.status==='CLOSED'))
    throw Error('PAPER_CONTAINER_RESTART_LOST_PAPER_CLOSE_LEDGER');
  console.log('PAPER_CONTAINER_RESTART_PERSISTENCE_SUCCESS: original simulated closed position retained');
}else{
  const open=await call('/api/paper-trading/start','POST',{
    strategyName:'Container isolated paper-only test',symbol:'NIFTY',
    legs:[{strikePrice:25000,type:'CE',action:'BUY',
      quantity:1,lotSize:50,currentLtp:100,
      product:'NRML',expiry:'CURRENT'}]
  },token);
  if(open.status!==200)throw Error('PAPER_CONTAINER_VIRTUAL_OPEN_REJECTED:'+open.status);
  const o=JSON.parse(open.body);
  if(!o.success||o.positions?.length!==1||o.positions[0].status!=='OPEN')
    throw Error('PAPER_CONTAINER_VIRTUAL_BUY_NOT_CREATED');
  const id=o.positions[0].id;
  const close=await call('/api/paper-trading/close/'+encodeURIComponent(id),
    'POST',{exitPrice:110,reason:'Container synthetic paper close'},token);
  if(close.status!==200)throw Error('PAPER_CONTAINER_VIRTUAL_CLOSE_REJECTED');
  const result=JSON.parse(close.body);
  if(!result.success||!result.portfolio.closedPositions.some(
    x=>x.id===id&&x.status==='CLOSED'))
    throw Error('PAPER_CONTAINER_CLOSE_LEDGER_NOT_RECORDED');
  writeFileSync(resultPath,id,{mode:0o600,flag:'wx'});
  console.log('PAPER_CONTAINER_FIRST_BOOT_SUCCESS: anonymous deny, admin paper buy/close, broker deny');
}
