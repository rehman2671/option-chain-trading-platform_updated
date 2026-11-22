import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewHistoricalFoTradeHistoryReadOnly,
  type HistoricalFoScope,type HistoricalFoReceipt
} from '../../server/engine/ema15m/adaptiveHistoricalFoTradeReview.js';
import {assessEmaLiveProductGate}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

// All executions below are deliberately synthetic; no Upstox requests.
const account='PH105-ACCOUNT';
const scope:HistoricalFoScope={
  expectedAccountId:account,startDate:'2026-11-20',
  endDate:'2026-11-22',entryTradeDate:'2026-11-20',
  asOfDate:'2026-11-22',underlyingSymbol:'NIFTY',
  optionType:'CE',strikePrice:25000,
  expiryDate:'2026-12-31',exchange:'NFO',
  originalBuyQuantity:50,exitedSellQuantity:50
};
const buys:HistoricalFoReceipt[]=[{
  tradeId:'PH105-BUY',exchangeOrderId:'PH105-EX-B',
  quantity:50,price:100
}];
const sells:HistoricalFoReceipt[]=[{
  tradeId:'PH105-SELL',exchangeOrderId:'PH105-EX-S',
  quantity:50,price:110
}];
const trade=(side:'BUY'|'SELL')=>({
  exchange:'NFO',segment:'FO',option_type:'CE',quantity:50,
  trade_id:side==='BUY'?'PH105-BUY':'PH105-SELL',
  trade_date:side==='BUY'?'2026-11-20':'2026-11-21',
  transaction_type:side,scrip_name:'NIFTY',
  symbol:'NIFTY',strike_price:'25000.0',
  expiry:'2026-12-31',price:side==='BUY'?100:110
});
const page=(n:number,total:number)=>({
  status:'success',
  data:total===1?[trade('BUY'),trade('SELL')]:
    [n===1?trade('BUY'):trade('SELL')],
  meta_data:{page:{
    page_number:n,page_size:1000,total_pages:total,total_records:2
  }}
});
const locked=(result:Awaited<ReturnType<
  typeof reviewHistoricalFoTradeHistoryReadOnly
>>)=>{
  assert.equal(result.liveNrmlBuyAuthorized,false);
  assert.equal(result.brokerWrites,0);
  assert.equal(result.localWrites,0);
  assert.equal(result.automaticClosureAuthorized,false);
  assert.equal(result.realisedPnlWriteAuthorized,false);
  assert.equal(result.netRealisedPnl,null);
  assert.equal(result.sourceEndpointsAtomic,false);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  for(const secret of [account,'PH105-BUY','PH105-SELL',
    'PH105-EX-B','PH105-EX-S','PH105-BEARER-SECRET']){
    assert.ok(!JSON.stringify(result).includes(secret),
      'private account/execution material leaked');
  }
};
const review=(broker:{
  getLiveConnectionStatus:()=>{isConnected:boolean;userId?:string};
  getHistoricalFoTradesPage:(start:string,end:string,n:number,
    size:number)=>Promise<unknown>;
})=>reviewHistoricalFoTradeHistoryReadOnly({
  ...broker,getHistoricalFoAuthEpoch:()=>1
},scope,buys,sells);

describe('Phase105 historical FO broker session continuity fails closed',()=>{
  it('retains valid broker-reported status with a stable account on every GET',async()=>{
    const calls:string[]=[];
    const result=await review({
      getLiveConnectionStatus:()=>{
        calls.push('auth');return {isConnected:true,userId:account};
      },
      getHistoricalFoTradesPage:async(_s,_e,n,size)=>{
        calls.push('page'+n);assert.equal(size,1000);
        return page(n,2);
      }
    });
    locked(result);
    assert.equal(result.state,
      'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
    assert.deepEqual(calls,['auth','auth','auth','page1','auth','auth','page2','auth']);
    assert.equal(result.requestedPageCount,2);
  });

  it('stops before page two when the broker account switches after page one',async()=>{
    const calls:string[]=[];let checked=0;
    const result=await review({
      getLiveConnectionStatus:()=>{
        calls.push('auth');
        return {isConnected:true,userId:++checked<=3?
          account:'PH105-OTHER-ACCOUNT'};
      },
      getHistoricalFoTradesPage:async(_s,_e,n)=>{
        calls.push('page'+n);return page(n,2);
      }
    });
    locked(result);
    assert.equal(result.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
    assert.ok(result.reasonCodes.includes(
      'BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_DURING_HISTORICAL_FO_GET'));
    assert.deepEqual(calls,['auth','auth','auth','page1','auth']);
  });

  it('detects disconnect immediately after the only returned page',async()=>{
    let authReads=0,historyReads=0;
    const result=await review({
      getLiveConnectionStatus:()=>++authReads<=3?
        {isConnected:true,userId:account}:{isConnected:false},
      getHistoricalFoTradesPage:async()=>{
        historyReads++;return page(1,1);
      }
    });
    locked(result);
    assert.equal(historyReads,1);
    assert.equal(authReads,4);
    assert.equal(result.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
  });

  it('does not propagate a thrown account-status error or secret after GET',async()=>{
    let authReads=0;
    const result=await review({
      getLiveConnectionStatus:()=>{
        if(++authReads>3)throw Error('PH105-BEARER-SECRET');
        return {isConnected:true,userId:account};
      },
      getHistoricalFoTradesPage:async()=>page(1,1)
    });
    locked(result);
    assert.equal(result.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
    assert.ok(!JSON.stringify(result).includes('PH105-BEARER-SECRET'));
  });

  it('treats missing post-fetch broker identity as mismatch, never zero trades',async()=>{
    let authReads=0;
    const result=await review({
      getLiveConnectionStatus:()=>++authReads<=3?
        {isConnected:true,userId:account}:{isConnected:true},
      getHistoricalFoTradesPage:async()=>page(1,1)
    });
    locked(result);
    assert.equal(result.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
    assert.notEqual(result.state,'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
  });
});
