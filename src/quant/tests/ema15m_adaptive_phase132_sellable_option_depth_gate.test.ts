import {describe,it,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assessSellableOptionDepthReadOnly,
  parseStrictQuoteSnapshotTime,
  type SellableOptionBookReview
} from '../../server/engine/ema15m/adaptiveSellableOptionDepthReadOnly.js';
import {UpstoxProvider} from '../../server/engine/providers/UpstoxProvider.js';
import {activeProvider} from '../../server/engine/providers/index.js';
import {LiveExecutionService} from
  '../../server/engine/ema15m/liveExecutionService.js';
import {dbEngine} from '../../server/db.js';
import type {EmaLivePosition} from '../../server/engine/ema15m/types.js';
import {
  assessEmaLiveProductGate,isMisForcedSquareOffEligible
} from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH132-OPTION-CE';
const at=Date.parse('2026-11-24T04:30:00.000Z');
const stamp=(v:number)=>new Date(v).toISOString();
const ist=(v:number)=>new Date(v+330*60000).toISOString().replace('Z','+05:30');
const q=(patch:Record<string,unknown>={})=>({
  source:'UPSTOX_FULL_MARKET_QUOTE_V3_LTP',
  bookSource:'UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5',
  instrumentKey:key,price:195,exchangeTimestamp:stamp(at),
  snapshotTimestamp:stamp(at),bestBidPrice:190,bestBidQuantity:100,
  bestAskPrice:191,bestAskQuantity:100,...patch
});
const inspect=(input:unknown=q(),qty:unknown=50,now=at)=>
  assessSellableOptionDepthReadOnly(input,key,now,qty);
function flags(v:SellableOptionBookReview){
  assert.equal(v.bestBidIsGuaranteedMarketSellFill,false);
  assert.equal(v.brokerOrderBookVenueAttested,false);
  assert.equal(v.riskFreeNativeStopCertified,false);
  assert.equal(v.liveNrmlBuyAuthorized,false);
  assert.equal(v.liveNrmlSellAuthorized,false);
  assert.equal(v.orderMutationAuthorized,false);
  assert.equal(v.brokerWrites,0);
  assert.equal(v.localWrites,0);
  assert.equal(JSON.stringify(v).includes(key),false);
}
const native=(override:Record<string,unknown>={})=>({
  instrument_token:key,last_price:195,
  last_trade_time:String(Date.now()),
  timestamp:ist(Date.now()),
  depth:{buy:[{price:190,quantity:100,orders:2}],
    sell:[{price:191,quantity:100,orders:3}]},
  ...override
});
const provider=()=>{
  const p=new UpstoxProvider();
  Object.assign(p,{isConnected:true,accessToken:'PH132-PRIVATE-TOKEN',
    userId:'PH132-PRIVATE-USER',historicalFoAuthEpoch:1});
  return p;
};
describe('Phase132 D5 top-of-book MIS SELL indicative bid and liquidity quarantine',()=>{
  it('fresh eligible 50-lot uses BEST BID not previous last traded price',()=>{
    const v=inspect();flags(v);
    assert.equal(v.accepted,true);
    assert.equal(v.observedSellBid,190);
    assert.equal(v.lastTradePremium,195);
    assert.equal(v.bestBidQuantity,100);
    assert.ok(v.spreadBps!==null&&v.spreadBps<2000);
    assert.equal(v.reason,'BEST_BID_SNAPSHOT_INDICATIVE_ONLY');
  });
  it('Upstox quote snapshot timezone +05:30, UTC Z and calendar roundtrip are exact',()=>{
    assert.equal(parseStrictQuoteSnapshotTime(ist(at)),at);
    assert.equal(parseStrictQuoteSnapshotTime(stamp(at)),at);
    for(const bad of [
      null,undefined,42,'','2026-11-24T10:00:00',
      '2026-11-24T10:00:00+05:30',
      '2026-02-30T10:00:00.000+05:30',
      '2026-13-24T10:00:00.000+05:30',
      '2026-11-24T10:00:00.000+14:30',
      '2026-11-24T10:00:00.000+15:00',
      '2026-11-24T10:00:00.000+05:60',
      '2026-11-24T10:00:00.000+5:30',
      '2026-11-24 10:00:00.000Z'
    ])assert.equal(parseStrictQuoteSnapshotTime(bad),null,String(bad));
  });
  it('quote timestamp or source absent, malformed or wrong option rejects independently of LTP',()=>{
    const options=[
      null,{},[],{price:195},
      q({bookSource:'UPSTOX_LTP_ONLY'}),
      q({bookSource:null}),q({snapshotTimestamp:null}),
      q({snapshotTimestamp:'24-Nov-2026 10:00:00'}),
      q({instrumentKey:'NSE_FO|OTHER'}),
      q({source:'PRACTICE'})
    ];
    for(const input of options){
      const v=inspect(input);flags(v);
      assert.equal(v.accepted,false);
      assert.equal(v.observedSellBid,null);
    }
  });
  it('independently bounds D5 quote snapshot at 10 seconds old and 3 seconds future',()=>{
    for(const offset of [-10001,3001,-86400_000,10_000]){
      const v=inspect(q({snapshotTimestamp:stamp(at+offset)}));flags(v);
      assert.equal(v.accepted,false);
      assert.equal(v.reason,
        'BOOK_SNAPSHOT_STALE_OR_FUTURE');
    }
    // A valid older snapshot must also have a trade no LATER than that snapshot.
    assert.equal(inspect(q({snapshotTimestamp:stamp(at-10000),
      exchangeTimestamp:stamp(at-10000)})).accepted,true);
    assert.equal(inspect(q({snapshotTimestamp:stamp(at+3000)})).accepted,true);
  });
  it('a claimed trade after the quote snapshot is not a coherent market book',()=>{
    const v=inspect(q({
      exchangeTimestamp:stamp(at),
      snapshotTimestamp:stamp(at-3000)
    }));flags(v);
    assert.equal(v.accepted,false);
    assert.equal(v.reason,'BOOK_LAST_TRADE_AFTER_SNAPSHOT_AMBIGUOUS');
  });
  it('invalid best bid/ask, crossed market, missing quantity or NaN rejects',()=>{
    const mutations=[
      {bestBidPrice:0},{bestBidPrice:-1},{bestAskPrice:null},
      {bestAskPrice:'191'},{bestBidPrice:NaN},
      {bestAskPrice:Infinity},{bestBidPrice:192},
      {bestBidQuantity:null},{bestBidQuantity:0},
      {bestAskQuantity:0},{bestBidQuantity:'100'},
      {bestBidQuantity:10.5},{bestAskQuantity:-1},
      {bestAskQuantity:Infinity}
    ];
    for(const change of mutations){
      const v=inspect(q(change));flags(v);
      assert.equal(v.accepted,false);
      assert.equal(v.reason,'BEST_BID_ASK_INVALID_OR_CROSSED');
    }
  });
  it('best bid quantity must cover entire local long to prevent optimistic sell fill estimate',()=>{
    const cases:[unknown,Record<string,unknown>][]=[
      [0,{}],[-50,{}],['50',{}],[NaN,{}],[1.25,{}],
      [1000,{}],[50,{bestBidQuantity:49}],
      [200,{bestBidQuantity:100}]
    ];
    for(const [qty,p] of cases){
      const v=inspect(q(p),qty);flags(v);
      assert.equal(v.accepted,false);
      assert.equal(v.reason,'BEST_BID_QUANTITY_BELOW_POSITION_LONG');
    }
    assert.equal(inspect(q({bestBidQuantity:50}),50).accepted,true);
  });
  it('wide spread is quarantined even when latest LTP and depth are technically fresh',()=>{
    const v=inspect(q({bestBidPrice:50,bestAskPrice:100,
      price:75,bestBidQuantity:100}));
    flags(v);assert.equal(v.accepted,false);
    assert.equal(v.reason,'BEST_BID_ASK_SPREAD_TOO_WIDE');
    const near=inspect(q({bestBidPrice:90,bestAskPrice:110,price:100}));
    assert.equal(near.accepted,true);
  });
  it('read-only v3 provider publishes exact D5 fields only for pinned account and plausible depth',async()=>{
    const p=provider();let calls=0;
    mock.method(globalThis,'fetch',async(_url:unknown,init?:unknown)=>{
      calls++;
      assert.match(String(_url),/\/v3\/market-quote\/quotes/);
      const headers=(init as {headers?:Record<string,string>})?.headers;
      assert.equal(headers?.Authorization,'Bearer PH132-PRIVATE-TOKEN');
      return {ok:true,json:async()=>({status:'success',data:{
        original:native()
      }})} as Response;
    });
    try{
      const got=await p.getLiveOptionQuote(key);
      assert.equal(calls,1);
      assert.equal(got?.bestBidPrice,190);
      assert.equal(got?.bestBidQuantity,100);
      assert.equal(got?.bestAskPrice,191);
      assert.equal(got?.bookSource,'UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5');
      const verdict=assessSellableOptionDepthReadOnly(got,key,Date.now(),50);
      flags(verdict);
      assert.equal(verdict.accepted,true);
    }finally{mock.restoreAll();}
  });
  it('provider refuses malformed, stale, crossed, duplicate or empty quote depth before returning',async()=>{
    const cases:Record<string,unknown>[]=[
      {depth:{}},{depth:null},
      {depth:{buy:[],sell:[{price:191,quantity:100}]}},
      {depth:{buy:[{price:190,quantity:0}],
        sell:[{price:191,quantity:100}]}},
      {depth:{buy:[{price:190,quantity:'100'}],
        sell:[{price:191,quantity:100}]}},
      {depth:{buy:[{price:192,quantity:100}],
        sell:[{price:191,quantity:100}]}},
      {timestamp:ist(Date.now()-11_000)},
      {timestamp:ist(Date.now()+4_000)}
    ];
    for(const changes of cases){
      const p=provider();
      mock.method(globalThis,'fetch',async()=>({
        ok:true,json:async()=>({status:'success',data:{
          a:native(changes)
        }})
      } as Response));
      try{assert.equal(await p.getLiveOptionQuote(key),null);}
      finally{mock.restoreAll();}
    }
  });
  it('broker credential or auth epoch switched mid-depth GET denies the quote',async()=>{
    const p=provider();
    mock.method(globalThis,'fetch',async()=>({
      ok:true,json:async()=>{
        Object.assign(p,{historicalFoAuthEpoch:2});
        return {status:'success',data:{a:native()}};
      }
    } as Response));
    try{assert.equal(await p.getLiveOptionQuote(key),null);}
    finally{mock.restoreAll();}
  });
  it('actual MIS live monitor ignores LTP triggers when best bid is above SL, and exits on bid crossing',async()=>{
    const pos={
      id:'PH132-MIS-LONG',productType:'MIS',status:'OPEN',
      instrument:'NIFTY',tradingsymbol:'PH132-CE',
      brokerInstrumentKey:key,entryPrice:200,quantity:50,
      lotSize:50,stopLoss:190,targetPrice:300
    } as EmaLivePosition;
    let current:unknown=null;const exits:{reason:string;price:number|undefined}[]=[];
    const marks:number[]=[];
    const feed=activeProvider as unknown as {
      getLiveOptionQuote?:(key:string)=>Promise<unknown>
    };
    const old=feed.getLiveOptionQuote;
    feed.getLiveOptionQuote=async()=>current;
    mock.method(dbEngine,'getOpenEmaLivePositions',()=>[pos]);
    mock.method(dbEngine,'getEmaNotificationSettings',()=>({
      trailingSlEnabled:false
    }) as ReturnType<typeof dbEngine.getEmaNotificationSettings>);
    mock.method(dbEngine,'updateEmaLivePosition',
      (_id:string,updates:Record<string,unknown>)=>{
        marks.push(updates.currentPrice as number);
      });
    mock.method(LiveExecutionService.getInstance(),'requestLiveExit',
      async(_id:string,reason:string,price?:number)=>{
        exits.push({reason,price});return {success:true,message:'MOCK'};
      });
    const liveQuote=(args:Record<string,unknown>)=>q({
      exchangeTimestamp:new Date().toISOString(),
      snapshotTimestamp:new Date().toISOString(),
      ...args
    });
    try{
      current=liveQuote({price:175,bestBidPrice:195,bestAskPrice:196});
      await LiveExecutionService.getInstance().monitorLivePositions(
        'NIFTY',25000,()=>1);
      assert.equal(exits.length,0,
        'LTP below stop must NOT trigger if sellable best bid remains above stop');
      assert.deepEqual(marks,[195],
        'unrealized conservative mark should use bid, not last traded premium');
      for(const patch of [
        {price:180,bestBidQuantity:1},
        {price:180,bestBidPrice:100,bestAskPrice:200},
        {price:180,bookSource:'PRACTICE'},
        {price:180,snapshotTimestamp:stamp(Date.now()-11_000)}
      ]){
        current=liveQuote(patch);
        await LiveExecutionService.getInstance().monitorLivePositions(
          'NIFTY',25000,()=>1);
        assert.equal(exits.length,0);
        assert.equal(marks.length,1,'invalid bid must not update P&L');
      }
      current=liveQuote({price:210,bestBidPrice:185,bestAskPrice:186});
      await LiveExecutionService.getInstance().monitorLivePositions(
        'NIFTY',25000,()=>1);
      assert.deepEqual(exits,[{reason:'SL_HIT',price:185}],
        'fresh full-quantity bid below stop may request MIS-only broker risk reconciliation');
    }finally{
      feed.getLiveOptionQuote=old;
      mock.restoreAll();
    }
  });
  it('new module is pure, NRML live BUY/SELL and 15:15 positional dispatch still forbidden',()=>{
    const code=readFileSync(
      'src/server/engine/ema15m/adaptiveSellableOptionDepthReadOnly.ts',
      'utf8'
    );
    for(const token of ['fetch(','.placeOrder(','.cancelOrder(',
      '.modifyOrder(','writeFileSync(','Date.now(','server.listen('])
      assert.equal(code.includes(token),false,token);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
    assert.equal(isMisForcedSquareOffEligible({
      productType:'NRML',status:'OPEN'
    }),false);
    flags(inspect());
  });
});
