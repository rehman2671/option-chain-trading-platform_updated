import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UpstoxProvider} from '../../server/engine/providers/UpstoxProvider.js';
import {
  guardExactBrokerGttGet,guardFullBrokerGttList,
  guardFullBrokerOrderBook,guardExactBrokerOrderTrades,
  guardFullBrokerPositionRows
} from '../../server/engine/ema15m/adaptiveUpstoxNativeReadCardinalityGuard.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const account='PH119-FAKE-ACCOUNT';
const token='PH119-NOT-A-REAL-TOKEN';
const instrument='NSE_FO|PH119-CE-OPTION';
const gttId='GTT-PH119-EXISTING-SELL';
const childId='PH119-GENERATED-SELL';
const parent=()=>({
  gtt_order_id:gttId,type:'SINGLE',instrument_token:instrument,
  product:'D',quantity:100,
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:90,status:'SCHEDULED',
    order_id:null}]
});
const order=()=>({
  order_id:childId,order_ref_id:gttId,
  instrument_token:instrument,product:'D',transaction_type:'SELL',
  order_type:'LIMIT',quantity:100,filled_quantity:50,
  pending_quantity:50,price:90,status:'partially filled'
});
const trade=()=>({
  trade_id:'PH119-TRADE-1',order_id:childId,
  exchange_order_id:'PH119-EXCHANGE-SELL',
  instrument_token:instrument,product:'D',
  transaction_type:'SELL',quantity:50,average_price:90
});
const position=()=>({
  instrument_token:instrument,product:'D',net_quantity:50
});
const scope=()=>({
  gtt_order_id:gttId,
  originalLongQuantity:100
});
const fake=():UpstoxProvider=>{
  const p=new UpstoxProvider();
  Object.assign(p as unknown as object,{
    isConnected:true,accessToken:token,userId:account,
    historicalFoAuthEpoch:7
  });
  return p;
};
type Endpoint='gtt_details'|'gtt_list'|'book'|'trades'|'positions'|'net';
const get={
  gtt_details:(p:UpstoxProvider)=>p.getGttOrderDetails(gttId),
  gtt_list:(p:UpstoxProvider)=>p.getGttOrders(),
  book:(p:UpstoxProvider)=>p.getOrderBook(),
  trades:(p:UpstoxProvider)=>p.getOrderTrades(childId),
  positions:(p:UpstoxProvider)=>p.getVerifiedNrmlPositionRows(),
  net:(p:UpstoxProvider)=>p.getVerifiedLivePositionQuantity(instrument,'NRML')
};
const body=(list:unknown)=>({status:'success',data:list});
async function withOfflineNativeGet<T>(
  payload:unknown,
  task:(p:UpstoxProvider,urls:string[])=>Promise<T>
):Promise<T>{
  const prior=globalThis.fetch;
  const urls:string[]=[];
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);urls.push(url);
    assert.ok(url.startsWith('https://api.upstox.com/'));
    assert.equal(init?.method??'GET','GET');
    assert.equal(new Headers(init?.headers).get('Authorization'),
      'Bearer '+token);
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(payload),{
      status:200,headers:{'Content-Type':'application/json'}
    });
  }) as typeof fetch;
  try{return await task(fake(),urls);}
  finally{globalThis.fetch=prior;}
}
function failsIfMalformed(e:Endpoint,rows:unknown){
  return withOfflineNativeGet(body(rows),async(p,urls)=>{
    assert.equal(await get[e](p),null,e);
    assert.equal(urls.length,1);
  });
}
const safety=()=>{
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    status:'OPEN',productType:'NRML'
  }),false);
};
describe('Phase119 exact Upstox native GET cardinality and duplicate-ID quarantine',()=>{
  it('successful [] is genuinely empty; wrong data or invalid request never equates to []',async()=>{
    for(const e of (['gtt_details','gtt_list','book','trades','positions']
      as Endpoint[])){
      await withOfflineNativeGet(body([]),async(p,urls)=>{
        assert.deepEqual(await get[e](p),[],e);
        assert.equal(urls.length,1);
        safety();
      });
    }
    await withOfflineNativeGet(body([]),async(p)=>{
      assert.equal(await get.net(p),null);
    });
  });
  it('actual GET code preserves valid exact GTT/list/orderbook/trades/net rows',async()=>{
    const cases=[
      ['gtt_details',[parent()]],
      ['gtt_list',[parent()]],
      ['book',[order()]],
      ['trades',[trade()]],
      ['positions',[position()]]
    ] as const;
    for(const [e,data] of cases){
      await withOfflineNativeGet(body(data),async(p)=>{
        assert.deepEqual(await get[e](p),data);
      });
    }
    await withOfflineNativeGet(body([position()]),async(p)=>{
      assert.equal(await get.net(p),50);
      safety();
    });
  });
  it('requested GTT GET must never accept a different GTT parent ID',async()=>{
    for(const rows of [
      [parent(),parent()],
      [{...parent(),gtt_order_id:'GTT-PH119-OTHER'}],
      [{...parent(),gtt_order_id:''}],
      [{...parent(),gtt_order_id:null}],
      [null],
      [42]
    ])await failsIfMalformed('gtt_details',rows);
  });
  it('malformed GTT rule and wrong product/type/contract cannot become native evidence',async()=>{
    for(const bad of [
      {...parent(),product:'?'},
      {...parent(),type:'UNKNOWN'},
      {...parent(),instrument_token:''},
      {...parent(),quantity:0},
      {...parent(),rules:[]},
      {...parent(),rules:[null]},
      {...parent(),rules:[{strategy:'ENTRY',transaction_type:'SELL',
        status:''}]},
      {...parent(),rules:[{strategy:'BUY',transaction_type:'BUY',
        status:'SCHEDULED'}]}
    ]){
      await failsIfMalformed('gtt_details',[bad]);
      await failsIfMalformed('gtt_list',[bad]);
    }
  });
  it('current full GTT list repeated IDs or malformed unrelated GTT blocks all-clear',async()=>{
    for(const list of [
      [parent(),parent()],
      [parent(),{...parent(),gtt_order_id:'GTT-PH119-OTHER',product:null}],
      [parent(),{...parent(),gtt_order_id:'GTT-PH119-OTHER',rules:[]}],
      [parent(),{...parent(),gtt_order_id:100}],
      [parent(),null],
      Array(10_000).fill(parent())
    ])await failsIfMalformed('gtt_list',list);
  });
  it('account orderbook duplicate IDs and invalid same-contract order fail closed',async()=>{
    for(const list of [
      [order(),order()],
      [order(),{...order(),order_id:'PH119-OTHER',product:'?' }],
      [order(),{...order(),order_id:'PH119-OTHER',transaction_type:'SHORT'}],
      [order(),{...order(),order_id:'PH119-OTHER',instrument_token:null}],
      [order(),{...order(),order_id:'PH119-OTHER',filled_quantity:-1}],
      [order(),{...order(),order_id:'PH119-OTHER',pending_quantity:100}],
      [order(),{...order(),order_id:'PH119-OTHER',status:null}],
      Array(10_000).fill(order())
    ])await failsIfMalformed('book',list);
  });
  it('individual order trades cannot include trade ID from other order',async()=>{
    for(const rows of [
      [trade(),trade()],
      [{...trade(),order_id:'PH119-OTHER-ORDER'}],
      [{...trade(),trade_id:null}],
      [{...trade(),trade_id:''}],
      [{...trade(),product:'X'}],
      [{...trade(),instrument_token:null}],
      [{...trade(),quantity:-1}],
      [{...trade(),quantity:0}],
      [{...trade(),transaction_type:'BUYSELL'}],
      [{...trade(),average_price:NaN}],
      [{...trade(),average_price:0}],
      [{...trade(),exchange_order_id:null}],
      Array(5000).fill(trade())
    ])await failsIfMalformed('trades',rows);
  });
  it('unique account position rows cannot be duplicated or malformed',async()=>{
    for(const rows of [
      [position(),position()],
      [position(),{...position(),product:'D',net_quantity:0}],
      [position(),{...position(),product:'UNKNOWN'}],
      [position(),{...position(),instrument_token:''}],
      [position(),{...position(),net_quantity:'5e1'}],
      [position(),{...position(),net_quantity:NaN}],
      [position(),null],
      Array(10_000).fill(position())
    ]){
      await failsIfMalformed('positions',rows);
      await failsIfMalformed('net',rows);
    }
  });
  it('official Upstox position quantity field maps to read-only net alias',async()=>{
    const nativeRow={
      instrument_token:instrument,product:'D',quantity:50
    };
    await withOfflineNativeGet(body([nativeRow]),async(p)=>{
      assert.deepEqual(await p.getVerifiedNrmlPositionRows(),[
        {...nativeRow,net_quantity:50}
      ]);
      assert.equal(await p.getVerifiedLivePositionQuantity(instrument,'NRML'),50);
      safety();
    });
  });
  it('conflicting quantity vs net_quantity fields are never treated as a long',async()=>{
    for(const bad of [
      {...position(),quantity:100},
      {...position(),quantity:'49'},
      {...position(),quantity:null},
      {...position(),quantity:-5},
      {instrument_token:instrument,product:'D',quantity:'5e1'},
      {instrument_token:instrument,product:'D'},
    ]){
      await failsIfMalformed('positions',[bad]);
      await failsIfMalformed('net',[bad]);
    }
  });
  it('valid native numeric legacy trade token is unlinked to exact option until independently mapped',async()=>{
    const legacy={...trade(),instrument_token:'151064324'};
    await withOfflineNativeGet(body([legacy]),async(p)=>{
      assert.deepEqual(await p.getOrderTrades(childId),[legacy]);
      assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
    });
    // The Phase113 original F&O key must not be silently inferred from
    // broker legacy numeric tokens; the diagnostic remains read-only.
    assert.notEqual(legacy.instrument_token,instrument);
  });
  it('valid unrelated shorts are allowed in raw rows; target net remains unique',async()=>{
    const other={
      instrument_token:'NSE_FO|PH119-OTHER-PE',
      product:'D',net_quantity:-50
    };
    await withOfflineNativeGet(body([position(),other]),async(p)=>{
      assert.deepEqual(await p.getVerifiedNrmlPositionRows(),[position(),other]);
      assert.equal(await p.getVerifiedLivePositionQuantity(instrument,'NRML'),50);
    });
  });
  it('missing account/target contract remains UNKNOWN not an implicit flat net',async()=>{
    await withOfflineNativeGet(body([{
      instrument_token:'NSE_FO|PH119-OTHER-PE',
      product:'D',net_quantity:50
    }]),async(p)=>{
      assert.equal(await p.getVerifiedLivePositionQuantity(instrument,'NRML'),null);
      safety();
    });
  });
  it('pure guards reject wrong/duplicate/truncated raw source without user input',()=>{
    assert.equal(guardExactBrokerGttGet([parent()],
      'GTT-PH119-OTHER'),null);
    assert.deepEqual(guardExactBrokerGttGet([],gttId),[]);
    assert.equal(guardFullBrokerGttList([parent(),parent()]),null);
    assert.equal(guardFullBrokerOrderBook([order(),order()]),null);
    assert.equal(guardExactBrokerOrderTrades([trade()], 'OTHER'),null);
    assert.equal(guardFullBrokerPositionRows([position(),position()]),null);
    assert.deepEqual(scope(),{gtt_order_id:gttId,originalLongQuantity:100});
    safety();
  });
  it('all original risk-read methods still use account epoch fence and timeout',()=>{
    const src=readFileSync(
      'src/server/engine/providers/UpstoxProvider.ts','utf8');
    for(const name of [
      'guardExactBrokerGttGet','guardFullBrokerGttList',
      'guardFullBrokerOrderBook','guardExactBrokerOrderTrades',
      'guardFullBrokerPositionRows'
    ])assert.ok(src.includes(name),name);
    assert.equal((src.match(/currentRiskReadIdentity\(session\)/g)||[]).length,8);
    assert.equal((src.match(/AbortSignal\.timeout\(12_000\)/g)||[]).length,8);
    safety();
  });
});
