import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UpstoxProvider} from '../../server/engine/providers/UpstoxProvider.js';
import {
  auditSingleSellGttRestartQuarantine
} from '../../server/engine/ema15m/adaptiveNrmlMissingGttRestartQuarantine.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

// These tests exercise ACTUAL provider GET implementations, with global
// fetch replaced in-process. Zero real network access is possible.
const secret='PH117-FAKE-NO-REAL-ACCESS-TOKEN';
const account='PH117-ACCOUNT';
const option='NSE_FO|PH117-OPTION-CONTRACT';
const gttId='GTT-PH117-SELL-ENTRY';
const orderId='PH117-CHILD-SELL';
const long=()=>({instrument_token:option,product:'D',net_quantity:100});
const gtt=()=>({
  type:'SINGLE',instrument_token:option,product:'D',quantity:100,
  gtt_order_id:gttId,created_at:1760000000000000,
  expires_at:1790000000000000,
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:90,
    status:'SCHEDULED',order_id:null}]
});
const child=()=>({
  order_id:orderId,order_ref_id:gttId,
  exchange_order_id:'PH117-EXCHANGE-REF',
  instrument_token:option,product:'D',
  transaction_type:'SELL',order_type:'LIMIT',
  quantity:100,filled_quantity:0,pending_quantity:100,
  price:90,status:'open'
});
const trade=()=>({
  trade_id:'PH117-TRADE-1',order_id:orderId,
  order_ref_id:gttId,exchange_order_id:'PH117-EXCHANGE-REF',
  instrument_token:option,product:'D',
  transaction_type:'SELL',quantity:50,average_price:90
});
const provider=():UpstoxProvider=>{
  const p=new UpstoxProvider();
  // Private fields only injected in a test process with fetch disabled;
  // NEVER connected to Upstox, never uses real credentials.
  Object.assign(p as unknown as object,{
    isConnected:true,accessToken:secret,userId:account,
    historicalFoAuthEpoch:7
  });
  return p;
};
type Request={url:string;method:string;auth:string|null};
async function withStub<T>(
  handler:(r:Request)=>unknown,
  task:(p:UpstoxProvider,seen:Request[])=>Promise<T>
):Promise<T>{
  const old=globalThis.fetch;
  const seen:Request[]=[];
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    const headers=new Headers(init?.headers);
    const r:Request={
      url,method:init?.method||'GET',
      auth:headers.get('Authorization')
    };
    seen.push(r);
    assert.ok(url.startsWith('https://api.upstox.com/'),url);
    assert.equal(r.method,'GET','Native diagnostic must never write');
    assert.equal(r.auth,'Bearer '+secret);
    const answer=handler(r);
    if(answer instanceof Error)throw answer;
    if(answer instanceof Response)return answer;
    return new Response(JSON.stringify(answer),{
      status:200,headers:{'Content-Type':'application/json'}
    });
  }) as typeof fetch;
  try{return await task(provider(),seen);}
  finally{globalThis.fetch=old;}
}
const ok=(data:unknown)=>({status:'success',data});
const handlers=(r:Request):unknown=>{
  const u=new URL(r.url);
  if(u.pathname==='/v3/order/gtt')
    return ok(u.searchParams.has('gtt_order_id')?[gtt()]:[gtt()]);
  if(u.pathname==='/v2/order/details')return ok(child());
  if(u.pathname==='/v2/order/trades')return ok([trade()]);
  if(u.pathname==='/v2/order/retrieve-all')return ok([child()]);
  if(u.pathname==='/v2/portfolio/short-term-positions')
    return ok([long()]);
  throw Error('Unexpected Upstox native GET route');
};
const allReads=async(p:UpstoxProvider)=>({
  details:await p.getGttOrderDetails(gttId),
  gtts:await p.getGttOrders(),
  child:await p.getOrderDetails(orderId),
  trades:await p.getOrderTrades(orderId),
  orders:await p.getOrderBook(),
  positions:await p.getVerifiedNrmlPositionRows(),
  net:await p.getVerifiedLivePositionQuantity(option,'NRML')
});
describe('Phase117 real Upstox provider native GET transport fail-closed contract',()=>{
  it('official-shaped native GETs preserve order_ref, GTT parent, trade IDs and D net',async()=>{
    await withStub(handlers,async(p,seen)=>{
      const r=await allReads(p);
      assert.deepEqual(r.details,[gtt()]);
      assert.deepEqual(r.gtts,[gtt()]);
      assert.deepEqual(r.child,child());
      assert.deepEqual(r.trades,[trade()]);
      assert.deepEqual(r.orders,[child()]);
      assert.deepEqual(r.positions,[long()]);
      assert.equal(r.net,100);
      assert.equal(seen.length,7);
      assert.equal(new URL(seen[0].url).searchParams.get('gtt_order_id'),gttId);
      assert.equal(new URL(seen[2].url).searchParams.get('order_id'),orderId);
      assert.equal(new URL(seen[3].url).searchParams.get('order_id'),orderId);
      assert.equal(p.getLiveConnectionStatus().userId,account);
      assert.equal(p.getBrokerAuthEpoch(),7);
      assert.equal(p.getHistoricalFoAuthEpoch(),7);
      assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
    });
  });
  it('all authenticated GETs return unavailable on 401, 403, 429 or server 5xx',async()=>{
    for(const code of [401,403,429,500,503]){
      await withStub(()=>new Response('unavailable',{status:code}),
        async(p,seen)=>{
          const r=await allReads(p);
          for(const key of ['details','gtts','child','trades',
            'orders','positions','net'] as const)
            assert.equal(r[key],null,key);
          assert.equal(seen.length,7);
          assert.equal(p.getBrokerAuthEpoch(),7);
        });
    }
  });
  it('HTTP 200 with status failure or malformed data is NOT empty clean proof',async()=>{
    for(const reply of [
      {status:'error',data:[]},
      {status:'success',data:null},
      {status:'success',data:{}},
      {},
      {status:'SUCCESS',data:[]},
      {status:'success',data:'[]'},
      null
    ]){
      await withStub(()=>reply,async(p,seen)=>{
        const r=await allReads(p);
        for(const key of ['details','gtts','child','trades',
          'orders','positions','net'] as const)
          assert.equal(r[key],null,key);
        assert.equal(seen.length,7);
      });
    }
  });
  it('genuine successful empty GTT/list/trades is [] but missing order and net remain null',async()=>{
    await withStub(()=>ok([]),async(p)=>{
      assert.deepEqual(await p.getGttOrders(),[]);
      assert.deepEqual(await p.getGttOrderDetails(gttId),[]);
      assert.deepEqual(await p.getOrderBook(),[]);
      assert.deepEqual(await p.getOrderTrades(orderId),[]);
      assert.deepEqual(await p.getVerifiedNrmlPositionRows(),[]);
      assert.equal(await p.getOrderDetails(orderId),null);
      assert.equal(await p.getVerifiedLivePositionQuantity(option,'NRML'),null);
    });
  });
  it('false JSON/body parser errors cannot fabricate healthy account with zero orders',async()=>{
    await withStub(()=>new Response('{broken-json',{status:200}),
      async(p)=>{
        const r=await allReads(p);
        for(const key of ['details','gtts','child','trades',
          'orders','positions','net'] as const)
          assert.equal(r[key],null,key);
      });
  });
  it('network abort/timeout/forged secret in error never leaks token/order IDs',async()=>{
    const previousWarn=console.warn,previousError=console.error;
    const logs:string[]=[];
    console.warn=(...v:unknown[])=>{logs.push(v.join(' '));};
    console.error=(...v:unknown[])=>{logs.push(v.join(' '));};
    try{
      await withStub(()=>new Error('network error '+secret+' '+orderId),
        async(p)=>{
          const r=await allReads(p);
          for(const key of ['details','gtts','child','trades',
            'orders','positions','net'] as const)
            assert.equal(r[key],null,key);
          assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
        });
    }finally{
      console.warn=previousWarn;console.error=previousError;
    }
    assert.ok(logs.length>0);
    assert.equal(logs.some(x=>x.includes(secret)),false);
    assert.equal(logs.some(x=>x.includes(orderId)),false);
  });
  it('no token / disconnected provider rejects all 7 GETs without fetching',async()=>{
    await withStub(handlers,async(p,seen)=>{
      Object.assign(p as unknown as object,{
        isConnected:false,accessToken:''
      });
      const r=await allReads(p);
      for(const key of ['details','gtts','child','trades',
        'orders','positions','net'] as const)
        assert.equal(r[key],null,key);
      assert.equal(seen.length,0);
    });
  });
  it('malformed GTT/order/trade ID rejects immediately; no network request',async()=>{
    await withStub(handlers,async(p,seen)=>{
      for(const bad of [
        '', 'not-gtt', 'GTT/', 'GTT- '+secret, 'GTT-\nOTHER'
      ])assert.equal(await p.getGttOrderDetails(bad),null);
      for(const bad of ['', 'bad/id','\n','X'.repeat(129)]){
        assert.equal(await p.getOrderDetails(bad),null);
        assert.equal(await p.getOrderTrades(bad),null);
      }
      assert.equal(seen.length,0);
    });
  });
  it('unique NRML net getter refuses absent, duplicate, other product, short and malformed',async()=>{
    for(const rows of [
      [],[long(),long()],
      [long(),{...long(),product:'I',net_quantity:100}],
      [{...long(),net_quantity:-100}],
      [{...long(),net_quantity:'1e2'}],
      [{...long(),net_quantity:'0100'}],
      [{...long(),net_quantity:75.5}],
      [{...long(),instrument_token:'NSE_FO|OTHER'}]
    ]){
      await withStub((r)=>r.url.includes('short-term-positions')?
        ok(rows):handlers(r),async(p)=>{
          const raw=await p.getVerifiedNrmlPositionRows();
          assert.ok(Array.isArray(raw),'Raw array is diagnostic only');
          assert.equal(await p.getVerifiedLivePositionQuantity(option,'NRML'),null);
        });
    }
  });
  it('a source transport error does not become missing GTT restart evidence',async()=>{
    await withStub(()=>new Response('{}',{status:503}),
      async(p)=>{
        const snapshot={
          exactGtt:await p.getGttOrderDetails(gttId),
          allGtts:await p.getGttOrders(),
          orderBook:await p.getOrderBook(),
          positions:await p.getVerifiedNrmlPositionRows()
        };
        const r=auditSingleSellGttRestartQuarantine({
          expectedAccountId:account,instrumentKey:option,
          originalBuyOrderId:'PH117-ORIGINAL-BUY',
          gttOrderId,originalLongQuantity:100,lotSize:50
        },snapshot);
        assert.equal(r.state,'BROKER_NATIVE_GET_SOURCE_INCOMPLETE');
        assert.equal(r.duplicateSellRetryAuthorized,false);
        assert.equal(r.closedPositionWriteAuthorized,false);
        assert.equal(r.liveNrmlBuyAuthorized,false);
        assert.equal(r.brokerWrites,0);
      });
  });
  it('provider read-only native GET source contains no fallback to [] for HTTP errors',()=>{
    const src=readFileSync(
      'src/server/engine/providers/UpstoxProvider.ts','utf8'
    );
    for(const marker of [
      'getVerifiedNrmlPositionRows()', 'getGttOrders()',
      'getGttOrderDetails(gttId:', 'getOrderDetails(orderId:',
      'getOrderTrades(orderId:', 'getOrderBook()',
      'getVerifiedLivePositionQuantity('
    ])assert.ok(src.includes(marker),marker);
    assert.ok(src.includes("console.warn('[UPSTOX] Read-only order trades unavailable')"));
    assert.ok(src.includes("console.warn('[UPSTOX] Read-only GTT order state unavailable')"));
    assert.ok(src.includes("console.warn('[UPSTOX] Read-only order book unavailable')"));
  });
});
