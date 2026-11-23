import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  reviewHistoricalFoTradeHistoryReadOnly,
  type HistoricalFoReadBroker, type HistoricalFoScope
} from '../../server/engine/ema15m/adaptiveHistoricalFoTradeReview.js';
import {assessEmaLiveProductGate}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
import {UpstoxProvider} from '../../server/engine/providers/UpstoxProvider.js';

const acct='PH106-ACCOUNT';
const scope:HistoricalFoScope={
  expectedAccountId:acct,
  startDate:'2026-11-20',endDate:'2026-11-22',
  entryTradeDate:'2026-11-20',asOfDate:'2026-11-22',
  underlyingSymbol:'NIFTY',optionType:'CE',
  strikePrice:25000,expiryDate:'2026-12-31',exchange:'NFO',
  originalBuyQuantity:50,exitedSellQuantity:50
};
const buys=[{tradeId:'PH106-B1',exchangeOrderId:'PH106-BEX',quantity:50,price:100}];
const sells=[{tradeId:'PH106-S1',exchangeOrderId:'PH106-SEX',quantity:50,price:110}];
const row=(side:'BUY'|'SELL')=>({
  segment:'FO',exchange:'NFO',option_type:'CE',scrip_name:'NIFTY',
  strike_price:'25000.0',expiry:'2026-12-31',quantity:50,
  transaction_type:side,trade_id:side==='BUY'?'PH106-B1':'PH106-S1',
  trade_date:side==='BUY'?'2026-11-20':'2026-11-21',
  price:side==='BUY'?100:110
});
const page=(n:number,total=2)=>({
  status:'success',
  data:total===1?[row('BUY'),row('SELL')]:[row(n===1?'BUY':'SELL')],
  meta_data:{page:{page_number:n,page_size:1000,
    total_pages:total,total_records:2}}
});
const status=()=>({isConnected:true,userId:acct});
const run=(broker:HistoricalFoReadBroker)=>
  reviewHistoricalFoTradeHistoryReadOnly(broker,scope,buys,sells);
const locked=(r:Awaited<ReturnType<typeof run>>)=>{
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.nativeProtectiveStopChildExchangeAckCertified,false);
  assert.equal(r.signedContractNotesReconciled,false);
  assert.equal(r.netRealisedPnl,null);
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(r.automaticClosureAuthorized,false);
  assert.equal(r.realisedPnlWriteAuthorized,false);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  for(const x of [acct,'PH106-B1','PH106-S1','PH106-BEX','PH106-SEX'])
    assert.ok(!JSON.stringify(r).includes(x),'private broker evidence leaked');
};
describe('Phase106 read-only FO auth epoch pinning and broker reauth quarantine',()=>{
  it('stable same-account credential epoch supports descriptive two-page corroboration',async()=>{
    const calls:string[]=[];
    const r=await run({
      getLiveConnectionStatus:()=>{calls.push('status');return status();},
      getHistoricalFoAuthEpoch:()=>{calls.push('epoch');return 2;},
      getHistoricalFoTradesPage:async(_start,_end,n)=>{
        calls.push('page'+n);return page(n);
      }
    });
    locked(r);
    assert.equal(r.state,'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
    assert.deepEqual(calls.filter(x=>x.startsWith('page')),['page1','page2']);
    assert.equal(calls.filter(x=>x==='status').length,6);
    assert.equal(calls.filter(x=>x==='epoch').length,6);
  });
  it('rejects identical account but new token/auth epoch immediately after first GET',async()=>{
    let epoch=3,pages=0;
    const r=await run({
      getLiveConnectionStatus:status,
      getHistoricalFoAuthEpoch:()=>epoch,
      getHistoricalFoTradesPage:async(_s,_e,n)=>{
        pages++;epoch++;return page(n);
      }
    });
    locked(r);
    assert.equal(pages,1);
    assert.equal(r.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
    assert.ok(r.reasonCodes.includes(
      'BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_DURING_HISTORICAL_FO_GET'));
  });
  it('even rotation during final single-page GET cannot count completed SELL',async()=>{
    let epoch=5;
    const r=await run({
      getLiveConnectionStatus:status,
      getHistoricalFoAuthEpoch:()=>epoch,
      getHistoricalFoTradesPage:async()=>{epoch+=2;return page(1,1);}
    });
    locked(r);assert.equal(r.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
    assert.equal(r.matchedOriginalBuyTrades,0);
    assert.equal(r.matchedExitSellTrades,0);
  });
  it('epoch rotation after initial snapshot but before first fetch makes zero GETs',async()=>{
    let reads=0,pages=0;
    const r=await run({
      getLiveConnectionStatus:status,
      getHistoricalFoAuthEpoch:()=>++reads===1?1:2,
      getHistoricalFoTradesPage:async()=>{
        pages++;return page(1,1);
      }
    });
    locked(r);
    assert.equal(pages,0);
    assert.ok(r.reasonCodes.includes(
      'BROKER_AUTH_EPOCH_CHANGED_DURING_HISTORICAL_FO_GET'));
  });
  it('missing generation accessor never starts historical GET',async()=>{
    let pages=0;
    const broker={
      getLiveConnectionStatus:status,
      getHistoricalFoTradesPage:async()=>{
        pages++;return page(1,1);
      }
    } as unknown as HistoricalFoReadBroker;
    const r=await run(broker);
    locked(r);
    assert.equal(pages,0);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
  });
  it('invalid, non-integer or exception-throwing auth epochs are not proof',async()=>{
    for(const bad of [0,-1,NaN,Infinity,1.2,Number.MAX_SAFE_INTEGER+1]){
      let pages=0;
      const r=await run({
        getLiveConnectionStatus:status,
        getHistoricalFoAuthEpoch:()=>bad,
        getHistoricalFoTradesPage:async()=>{pages++;return page(1,1);}
      });
      locked(r);assert.equal(pages,0);
      assert.equal(r.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
    }
    const r=await run({
      getLiveConnectionStatus:status,
      getHistoricalFoAuthEpoch:()=>{throw Error('PH106-TOKEN-PRIVATE');},
      getHistoricalFoTradesPage:async()=>page(1,1)
    });
    locked(r);
    assert.equal(r.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
    assert.ok(!JSON.stringify(r).includes('PH106-TOKEN-PRIVATE'));
  });
  it('reattachment between page one and next-page preflight denies page two',async()=>{
    let epoch=10,reads=0,pages=0;
    const r=await run({
      getLiveConnectionStatus:status,
      getHistoricalFoAuthEpoch:()=>{
        reads++;
        // Return epoch 10 for first page and the immediate post-read check.
        if(reads===5)epoch=11;
        return epoch;
      },
      getHistoricalFoTradesPage:async(_s,_e,n)=>{
        pages++;return page(n);
      }
    });
    locked(r);
    assert.equal(pages,1);
    assert.equal(r.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
  });
  it('provider invalidates auth epoch at connect initiation and completion',async()=>{
    const provider=new UpstoxProvider();
    // Force a no-network, no-token authentication failure.
    const originalToken=process.env.UPSTOX_ACCESS_TOKEN;
    const originalAlt=process.env.UPSTOX_TOKEN;
    const originalFallback=(provider as any).practiceFallback;
    try{
      process.env.UPSTOX_ACCESS_TOKEN='';
      process.env.UPSTOX_TOKEN='';
      (provider as any).practiceFallback={connect:async()=>undefined};
      const before=provider.getHistoricalFoAuthEpoch();
      await provider.connect();
      const after=provider.getHistoricalFoAuthEpoch();
      assert.ok(after>before);
      await provider.connect();
      assert.ok(provider.getHistoricalFoAuthEpoch()>after);
      assert.equal(provider.getLiveConnectionStatus().isConnected,false);
    }finally{
      if(originalToken===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;
      else process.env.UPSTOX_ACCESS_TOKEN=originalToken;
      if(originalAlt===undefined)delete process.env.UPSTOX_TOKEN;
      else process.env.UPSTOX_TOKEN=originalAlt;
      (provider as any).practiceFallback=originalFallback;
    }
  });
  it('actual admin route joins history and net under one pinned epoch, never writes',()=>{
    const src=readFileSync('serverApp.ts','utf8');
    const begin=src.indexOf("app.post('/api/ema15m/historical-fo-trade-review'");
    const end=src.indexOf('  // 6. Save Notification Settings',begin);
    assert.ok(begin>0&&end>begin);
    const route=src.slice(begin,end);
    assert.ok(route.includes('requireSuperAdmin'));
    assert.ok(route.includes('const authEpochStart=broker.getHistoricalFoAuthEpoch()'));
    assert.ok(route.includes('broker.getHistoricalFoAuthEpoch()!==authEpochStart'));
    assert.ok(route.indexOf('authEpochStart')<
      route.indexOf('reviewHistoricalFoTradeHistoryReadOnly('));
    assert.ok(route.indexOf('if(broker.getHistoricalFoAuthEpoch()!==authEpochStart)')<
      route.indexOf('await broker.getVerifiedLivePositionQuantity('));
    assert.ok(!route.includes('placeOrder('));
    assert.ok(!route.includes('updateEmaLivePosition('));
  });
});
