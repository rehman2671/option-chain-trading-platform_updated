import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UpstoxProvider} from '../../server/engine/providers/UpstoxProvider.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const user='PH118-FAKE-ACCOUNT';
const token='PH118-FAKE-NO-REAL-TOKEN';
const instrument='NSE_FO|PH118-OPTION';
const gid='GTT-PH118-SELL';
const oid='PH118-SELL-CHILD';
const original=()=>({
  status:'success',data:[{
    instrument_token:instrument,product:'D',net_quantity:100
  }]
});
const gtt=()=>({
  gtt_order_id:gid,type:'SINGLE',instrument_token:instrument,
  product:'D',quantity:100,rules:[{
    strategy:'ENTRY',transaction_type:'SELL',trigger_type:'BELOW',
    trigger_price:90,status:'SCHEDULED',order_id:null
  }]
});
const order=()=>({
  order_id:oid,order_ref_id:gid,instrument_token:instrument,
  product:'D',transaction_type:'SELL',order_type:'LIMIT',
  status:'open',price:90,quantity:100,
  filled_quantity:0,pending_quantity:100
});
const fo=()=>({status:'success',data:[],
  meta_data:{page:{page_number:1,page_size:1000,
    total_pages:1,total_records:0}}});
type Getter={name:string;read:(p:UpstoxProvider)=>Promise<unknown>;
  reply:()=>unknown;expected:(x:unknown)=>void};
const cases:Getter[]=[
  {name:'GTT parent by exact ID',read:p=>p.getGttOrderDetails(gid),
    reply:()=>({status:'success',data:[gtt()]}),
    expected:v=>assert.deepEqual(v,[gtt()])},
  {name:'Full account GTT list',read:p=>p.getGttOrders(),
    reply:()=>({status:'success',data:[gtt()]}),
    expected:v=>assert.deepEqual(v,[gtt()])},
  {name:'Generated SELL child order',read:p=>p.getOrderDetails(oid),
    reply:()=>({status:'success',data:order()}),
    expected:v=>assert.deepEqual(v,order())},
  {name:'Generated child trade book',read:p=>p.getOrderTrades(oid),
    reply:()=>({status:'success',data:[]}),
    expected:v=>assert.deepEqual(v,[])},
  {name:'Full native order book',read:p=>p.getOrderBook(),
    reply:()=>({status:'success',data:[order()]}),
    expected:v=>assert.deepEqual(v,[order()])},
  {name:'Raw NRML portfolio GET',read:p=>p.getVerifiedNrmlPositionRows(),
    reply:original,expected:v=>assert.deepEqual(v,original().data)},
  {name:'Unique broker NRML net',read:p=>
    p.getVerifiedLivePositionQuantity(instrument,'NRML'),
    reply:original,expected:v=>assert.equal(v,100)},
  {name:'Bounded historical FO trade page',read:p=>
    p.getHistoricalFoTradesPage('2026-11-20','2026-11-22',1,1000),
    reply:fo,expected:v=>assert.deepEqual(v,fo())}
];
const fake=():UpstoxProvider=>{
  const p=new UpstoxProvider();
  Object.assign(p as unknown as object,{
    isConnected:true,accessToken:token,userId:user,
    historicalFoAuthEpoch:7
  });
  return p;
};
const safe=()=>{
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
};
/** The caller is already inside an offline, no-network test process. */
async function withTransport<T>(
  fn:(req:{url:string;init?:RequestInit})=>Promise<Response>,
  task:(p:UpstoxProvider,urls:string[])=>Promise<T>
):Promise<T>{
  const previous=globalThis.fetch;
  const urls:string[]=[];
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    urls.push(url);
    assert.ok(url.startsWith('https://api.upstox.com/'));
    assert.equal(init?.method??'GET','GET');
    assert.equal(new Headers(init?.headers).get('Authorization'),
      'Bearer '+token);
    return fn({url,init});
  }) as typeof fetch;
  try{return await task(fake(),urls);}
  finally{globalThis.fetch=previous;}
}
function waitForRequest(){
  let permit:(v:Response)=>void=()=>{throw Error('uninitialized');};
  const gate=new Promise<Response>(resolve=>{permit=resolve;});
  return {gate,permit:(r:Response)=>permit(r)};
}
const native=(v:unknown)=>new Response(JSON.stringify(v),{
  status:200,headers:{'Content-Type':'application/json'}
});
describe('Phase118 in-flight Upstox native GET account/token/epoch fence',()=>{
  it('all eight actual GET methods accept stable fake account session only',async()=>{
    for(const c of cases){
      await withTransport(async()=>native(c.reply()),async(p,urls)=>{
        c.expected(await c.read(p));
        assert.equal(urls.length,1,c.name);
        assert.equal(p.getBrokerAuthEpoch(),7);
        safe();
      });
    }
  });
  it('token replacement WHILE native HTTP request is pending invalidates all 8 GETs',async()=>{
    for(const c of cases){
      const {gate,permit}=waitForRequest();
      await withTransport(async()=>gate,async(p,urls)=>{
        const pending=c.read(p);
        Object.assign(p as unknown as object,{
          accessToken:'PH118-ROTATED-TOKEN'
        });
        permit(native(c.reply()));
        assert.equal(await pending,null,c.name);
        assert.equal(urls.length,1);
        safe();
      });
    }
  });
  it('same token but changed auth epoch invalidates each in-flight GET',async()=>{
    for(const c of cases){
      const {gate,permit}=waitForRequest();
      await withTransport(async()=>gate,async(p)=>{
        const pending=c.read(p);
        Object.assign(p as unknown as object,{historicalFoAuthEpoch:8});
        permit(native(c.reply()));
        assert.equal(await pending,null,c.name);
        safe();
      });
    }
  });
  it('account switched while GET is pending invalidates all old-account results',async()=>{
    for(const c of cases){
      const {gate,permit}=waitForRequest();
      await withTransport(async()=>gate,async(p)=>{
        const pending=c.read(p);
        Object.assign(p as unknown as object,{userId:'PH118-OTHER-ACCOUNT'});
        permit(native(c.reply()));
        assert.equal(await pending,null,c.name);
        safe();
      });
    }
  });
  it('disconnection while an Upstox GET is in flight invalidates all results',async()=>{
    for(const c of cases){
      const {gate,permit}=waitForRequest();
      await withTransport(async()=>gate,async(p)=>{
        const pending=c.read(p);
        Object.assign(p as unknown as object,{isConnected:false});
        permit(native(c.reply()));
        assert.equal(await pending,null,c.name);
        safe();
      });
    }
  });
  it('credential generation must not be reset even to original token/account',async()=>{
    for(const c of cases){
      const {gate,permit}=waitForRequest();
      await withTransport(async()=>gate,async(p)=>{
        const pending=c.read(p);
        Object.assign(p as unknown as object,{
          isConnected:false,accessToken:'PH118-OTHER-TOKEN'
        });
        Object.assign(p as unknown as object,{
          isConnected:true,accessToken:token,userId:user,
          historicalFoAuthEpoch:9
        });
        permit(native(c.reply()));
        assert.equal(await pending,null,c.name);
        safe();
      });
    }
  });
  it('account and token changed AFTER HTTP headers but BEFORE JSON decode is rejected',async()=>{
    for(const c of cases){
      let release:()=>void=()=>{};
      const decode=new Promise<void>(resolve=>{release=resolve;});
      await withTransport(async()=>{
        const response=native(c.reply());
        Object.defineProperty(response,'json',{
          value:async()=>{await decode;return c.reply();}
        });
        return response;
      },async(p)=>{
        const pending=c.read(p);
        // Ensure the async read reaches the pending JSON decode first.
        await Promise.resolve();
        await Promise.resolve();
        Object.assign(p as unknown as object,{
          userId:'PH118-NEW-ACCOUNT',
          historicalFoAuthEpoch:11
        });
        release();
        assert.equal(await pending,null,c.name);
        safe();
      });
    }
  });
  it('unknown/zero epoch, missing account or disconnected token reject before network',async()=>{
    for(const change of [
      {historicalFoAuthEpoch:0},
      {historicalFoAuthEpoch:-1},
      {historicalFoAuthEpoch:1.5},
      {userId:''},
      {isConnected:false},
      {accessToken:''}
    ]){
      for(const c of cases){
        await withTransport(async()=>native(c.reply()),async(p,urls)=>{
          Object.assign(p as unknown as object,change);
          assert.equal(await c.read(p),null,c.name);
          assert.equal(urls.length,0,c.name);
        });
      }
    }
  });
  it('the authorization string stays private and unchanged in upstream request',async()=>{
    for(const c of cases){
      await withTransport(async()=>native(c.reply()),async(p,urls)=>{
        c.expected(await c.read(p));
        assert.equal(urls.length,1);
        assert.equal(urls.some(u=>u.includes(token)),false);
        assert.equal(urls.some(u=>u.includes(user)),false);
      });
    }
  });
  it('the real provider has no broker writes in any of eight GET method bodies',()=>{
    const source=readFileSync(
      'src/server/engine/providers/UpstoxProvider.ts','utf8');
    const required=[
      'captureRiskReadIdentity','currentRiskReadIdentity',
      'getVerifiedLivePositionQuantity','getVerifiedNrmlPositionRows',
      'getGttOrders','getGttOrderDetails','getOrderDetails',
      'getOrderBook','getHistoricalFoTradesPage','getOrderTrades'
    ];
    for(const name of required)assert.ok(source.includes(name),name);
    assert.equal((source.match(/currentRiskReadIdentity\(session\)/g)||[]).length,8);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
});
