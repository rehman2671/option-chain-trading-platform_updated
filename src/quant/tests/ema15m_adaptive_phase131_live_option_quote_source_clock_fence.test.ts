import {describe,it,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessExactLiveOptionQuote} from
  '../../server/engine/ema15m/adaptiveLiveOptionQuoteFence.js';
import {UpstoxProvider} from
  '../../server/engine/providers/UpstoxProvider.js';
import {activeProvider} from '../../server/engine/providers/index.js';
import {LiveExecutionService} from
  '../../server/engine/ema15m/liveExecutionService.js';
import {dbEngine} from '../../server/db.js';
import type {EmaLivePosition} from
  '../../server/engine/ema15m/types.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH131-REAL-CE';
const now=Date.parse('2026-11-24T04:30:00.000Z');
const asIso=(ms:number)=>new Date(ms).toISOString();
const quote=(at=now,patch:Record<string,unknown>={})=>({
  source:'UPSTOX_FULL_MARKET_QUOTE_V3_LTP',
  instrumentKey:key,
  price:95,
  exchangeTimestamp:asIso(at),
  ...patch
});
const accepted=()=>assessExactLiveOptionQuote(quote(),key,now);
const assertSafe=(result:ReturnType<typeof accepted>)=>{
  assert.equal(result.liveNrmlBuyAuthorized,false);
  assert.equal(result.nativeBrokerStopCertified,false);
  assert.equal(result.executableBidAskProven,false);
  assert.equal(result.brokerWrites,0);
  assert.equal(result.localWrites,0);
  const raw=JSON.stringify(result);
  assert.equal(raw.includes(key),false);
  assert.equal(raw.includes('PRIVATE-BEARER'),false);
};

describe('Phase131 exact last-trade MIS live SL/TP quote fail-closed fence',()=>{
  it('only exact declared source/FO option/number/canonical UTC fresh quote passes',()=>{
    const r=accepted();assertSafe(r);
    assert.equal(r.accepted,true);
    assert.equal(r.price,95);
    assert.equal(r.reason,'EXACT_LIVE_OPTION_LTP_FRESH');
    for(const t of [now-30_000,now+5000]){
      const edge=assessExactLiveOptionQuote(quote(t),key,now);
      assertSafe(edge);assert.equal(edge.accepted,true);
    }
  });
  it('no source identity, wrong exchange contract, unknown FO or forged quote denies',()=>{
    for(const v of [
      null,undefined,[],{},'95',
      quote(now,{source:'PRACTICE'}),
      quote(now,{source:'UPSTOX_V2_FALLBACK'}),
      quote(now,{instrumentKey:'BSE_FO|OTHER'}),
      quote(now,{instrumentKey:'NSE_FO|DIFFERENT'}),
      quote(now,{instrumentKey:null})
    ]){
      const r=assessExactLiveOptionQuote(v,key,now);
      assertSafe(r);assert.equal(r.accepted,false);
      assert.equal(r.price,null);
      assert.equal(r.reason,'UNVERIFIED_QUOTE_SOURCE_OR_CONTRACT');
    }
    for(const badKey of [
      '',null,undefined,'NSE_EQ|PH131','NSE_FO:PH131','NSE_FO|',
      'BSE_FO|INVALID/SLASH','MIS','NSE_FO|FOO BAR'
    ])assert.equal(
      assessExactLiveOptionQuote(quote(),badKey,now).accepted,false);
  });
  it('string, NaN, infinity, negative and zero price cannot arm a MARKET SELL',()=>{
    for(const price of [
      null,undefined,0,-1,NaN,Infinity,-Infinity,'95','0.1','NaN',
      {},[],true
    ]){
      const r=assessExactLiveOptionQuote(quote(now,{price}),key,now);
      assertSafe(r);assert.equal(r.accepted,false);
      assert.equal(r.price,null);
      assert.equal(r.reason,'QUOTE_PRICE_MISSING_OR_INVALID');
    }
  });
  it('future, previous session, stale or noncanonical last trade time rejects',()=>{
    for(const time of [
      now-30_001,now+5001,now-60_000,now-86400_000
    ]){
      const r=assessExactLiveOptionQuote(quote(time),key,now);
      assertSafe(r);assert.equal(r.accepted,false);
      assert.equal(r.reason,'EXCHANGE_LAST_TRADE_TIME_STALE_OR_FUTURE');
    }
    for(const bad of [
      null,undefined,NaN,0,'24-Nov-2026 10:00:00',
      '2026-11-24T04:30:00Z','2026-11-24T10:00:00.000+05:30',
      '2026-11-24','2026-02-30T04:30:00.000Z',
      '2026-11-24T04:30:00.123456Z'
    ]){
      const r=assessExactLiveOptionQuote(
        quote(now,{exchangeTimestamp:bad}),key,now);
      assertSafe(r);assert.equal(r.accepted,false);
      assert.equal(r.reason,'EXCHANGE_LAST_TRADE_TIME_MISSING_OR_INVALID');
    }
  });
  it('malformed local review clock is also fail-closed',()=>{
    for(const at of [NaN,Infinity,-1,0,1.5,Date.parse('2101-01-01')]){
      const r=assessExactLiveOptionQuote(quote(),key,at);
      assertSafe(r);assert.equal(r.accepted,false);
    }
  });
  it('provider preserves exchange session identity, exact F&O instrument, numeric price and receipt clock',async()=>{
    const p=new UpstoxProvider();
    Object.assign(p,{isConnected:true,accessToken:'FAKE-PRIVATE-TOKEN',
      userId:'PH131-ACCOUNT',historicalFoAuthEpoch:1});
    let called=0;
    mock.method(globalThis,'fetch',async (url:unknown,init?:unknown)=>{
      called++;
      assert.match(String(url),/\/v3\/market-quote\/quotes\?/);
      assert.match(String(url),/instrument_key=NSE_FO%7CPH131-REAL-CE/);
      const headers=(init as {headers?:Record<string,string>})?.headers;
      assert.equal(headers?.Authorization,'Bearer FAKE-PRIVATE-TOKEN');
      return {ok:true,json:async()=>({status:'success',data:{
        a:{instrument_token:key,last_price:95,
          last_trade_time:String(Date.now())}
      }})} as Response;
    });
    try{
      const v=await p.getLiveOptionQuote(key);
      assert.equal(called,1);
      assert.equal(v?.source,'UPSTOX_FULL_MARKET_QUOTE_V3_LTP');
      assert.equal(v?.instrumentKey,key);
      assert.equal(v?.price,95);
      assert.equal(assessExactLiveOptionQuote(v,key,Date.now()).accepted,true);
    }finally{mock.restoreAll();}
  });
  it('provider rejects post-GET account auth-epoch rotation before publishing quote',async()=>{
    const p=new UpstoxProvider();
    Object.assign(p,{isConnected:true,accessToken:'FAKE-PRIVATE-TOKEN',
      userId:'PH131-ACCOUNT',historicalFoAuthEpoch:1});
    mock.method(globalThis,'fetch',async()=>({
      ok:true,json:async()=>{
        Object.assign(p,{historicalFoAuthEpoch:2});
        return {status:'success',data:{
          a:{instrument_token:key,last_price:95,
            last_trade_time:String(Date.now())}
        }};
      }
    } as Response));
    try{
      const v=await p.getLiveOptionQuote(key);
      assert.equal(v,null);
    }finally{mock.restoreAll();}
  });
  it('provider rejects duplicate matches, wrong token, coercive price, old trade, missing data',async()=>{
    const sample=(v:unknown)=>({ok:true,
      json:async()=>({status:'success',data:v})} as Response);
    const cases=[
      {a:{instrument_token:key,last_price:'95',
        last_trade_time:String(Date.now())}},
      {a:{instrument_token:'NSE_FO|WRONG',last_price:95,
        last_trade_time:String(Date.now())}},
      {a:{instrument_token:key,last_price:95,
        last_trade_time:String(Date.now()-31_000)}},
      {a:{instrument_token:key,last_price:95,
        last_trade_time:String(Date.now())},
       b:{instrument_token:key,last_price:95,
        last_trade_time:String(Date.now())}},
      []
    ];
    for(const data of cases){
      const p=new UpstoxProvider();
      Object.assign(p,{isConnected:true,accessToken:'FAKE-PRIVATE-TOKEN',
        userId:'PH131-ACCOUNT',historicalFoAuthEpoch:1});
      mock.method(globalThis,'fetch',async()=>sample(data));
      try{
        assert.equal(await p.getLiveOptionQuote(key),null);
      }finally{mock.restoreAll();}
    }
  });
  it('monitor never requests MIS automatic SELL from stale, wrong option, synthetic or missing quote clock',async()=>{
    const p={
      id:'PH131-MIS-LONG',productType:'MIS',status:'OPEN',
      instrument:'NIFTY',tradingsymbol:'PH131-REAL-CE',
      brokerInstrumentKey:key,entryPrice:200,quantity:50,
      stopLoss:190,targetPrice:300,lotSize:50
    } as EmaLivePosition;
    const provider=activeProvider as unknown as {
      getLiveOptionQuote?:(key:string)=>Promise<unknown>
    };
    const previous=provider.getLiveOptionQuote;
    let current:unknown=null,exits=0,marks=0;
    provider.getLiveOptionQuote=async()=>current;
    mock.method(dbEngine,'getOpenEmaLivePositions',()=>[p]);
    mock.method(dbEngine,'getEmaNotificationSettings',()=>({
      trailingSlEnabled:false
    }) as ReturnType<typeof dbEngine.getEmaNotificationSettings>);
    mock.method(LiveExecutionService.getInstance(),'requestLiveExit',
      async()=>{exits++;return {success:true,message:'MOCK-ONLY'};});
    mock.method(dbEngine,'updateEmaLivePosition',()=>{
      marks++;return;
    });
    try{
      for(const v of [
        null,
        {price:95},quote(Date.now()-31_000),
        quote(Date.now()+6000),
        quote(Date.now(),{instrumentKey:'NSE_FO|OTHER'}),
        quote(Date.now(),{source:'PRACTICE'}),
        quote(Date.now(),{price:'95'}),
        quote(Date.now(),{exchangeTimestamp:'2026-11-24'})
      ]){
        current=v;
        await LiveExecutionService.getInstance().monitorLivePositions(
          'NIFTY',25100,()=>95);
        assert.equal(exits,0);
        assert.equal(marks,0);
      }
      current=quote(Date.now());
      await LiveExecutionService.getInstance().monitorLivePositions(
        'NIFTY',25100,()=>95);
      assert.equal(exits,1,'only fresh same-contract MIS can attempt broker risk exit');
      assert.equal(marks,0);
    }finally{
      provider.getLiveOptionQuote=previous;
      mock.restoreAll();
    }
  });
  it('code contains no HTTP or write in pure fence and retains NRML product/1515 deny',()=>{
    const s=readFileSync(
      'src/server/engine/ema15m/adaptiveLiveOptionQuoteFence.ts','utf8');
    for(const word of [
      'fetch(','.placeOrder(','.cancelOrder(','writeFileSync(',
      'Date.now(','server.listen('
    ])assert.equal(s.includes(word),false,word);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
    assert.equal(isMisForcedSquareOffEligible({
      productType:'NRML',status:'OPEN'}),false);
    assertSafe(accepted());
  });
});
