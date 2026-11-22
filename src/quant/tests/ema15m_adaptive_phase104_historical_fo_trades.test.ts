import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditHistoricalFoTradeHistory,reviewHistoricalFoTradeHistoryReadOnly,
  type HistoricalFoScope,type HistoricalFoReceipt
} from '../../server/engine/ema15m/adaptiveHistoricalFoTradeReview.js';
import {assessEmaLiveProductGate}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const acct='PH104-ACCOUNT';
const scope:HistoricalFoScope={
  expectedAccountId:acct,startDate:'2026-11-20',endDate:'2026-11-22',
  entryTradeDate:'2026-11-20',asOfDate:'2026-11-22',
  underlyingSymbol:'NIFTY',optionType:'CE',strikePrice:25000,
  expiryDate:'2026-12-31',exchange:'NFO',
  originalBuyQuantity:100,exitedSellQuantity:100
};
const buys:HistoricalFoReceipt[]=[
  {tradeId:'PH104-B1',exchangeOrderId:'PH104-BUYEX',quantity:50,price:105},
  {tradeId:'PH104-B2',exchangeOrderId:'PH104-BUYEX',quantity:50,price:115}
];
const sells:HistoricalFoReceipt[]=[
  {tradeId:'PH104-S1',exchangeOrderId:'PH104-SELLEX',quantity:50,price:120},
  {tradeId:'PH104-S2',exchangeOrderId:'PH104-SELLEX',quantity:50,price:130}
];
type HistoryRow=Record<string,unknown>;
const row=(id:string,side:'BUY'|'SELL',qty:number,price:number,partial:HistoryRow={})=>({
  exchange:'NFO',segment:'FO',option_type:'CE',
  quantity:qty,amount:qty*price,trade_id:id,
  trade_date:side==='BUY'?'2026-11-20':'2026-11-21',
  transaction_type:side,scrip_name:'NIFTY',symbol:'NIFTY',
  strike_price:'25000.0',expiry:'2026-12-31',price,
  // Upstox FO history normally does NOT provide an option instrument token
  // or original order ID. Do not fabricate those two sources.
  instrument_token:'',...partial
});
const records=():HistoryRow[]=>[
  row('PH104-B1','BUY',50,105),row('PH104-B2','BUY',50,115),
  row('PH104-S1','SELL',50,120),row('PH104-S2','SELL',50,130)
];
const page=(items:HistoryRow[],pageNo=1,totalPages=1,totalRecords=items.length)=>({
  status:'success',data:items,
  meta_data:{page:{page_number:pageNo,page_size:1000,
    total_pages:totalPages,total_records:totalRecords}}
});
const evidence=(pages:unknown[]=[page(records())],
  buy:unknown=buys,sell:unknown=sells)=>({
  connected:true,connectedAccountId:acct,
  pages,buyTrades:buy,sellTrades:sell
});
const check=(args=scope,src=evidence())=>
  auditHistoricalFoTradeHistory(args,src);
const locked=(r:ReturnType<typeof check>)=>{
  assert.equal(r.brokerHistoricalOrderIdPresent,false);
  assert.equal(r.brokerHistoricalInstrumentTokenPresent,false);
  assert.equal(r.historicalTradesIndependentlyCertified,false);
  assert.equal(r.signedContractNotesReconciled,false);
  assert.equal(r.actualBrokerChargesAndTaxesVerified,false);
  assert.equal(r.completeAccountWideExposureCertified,false);
  assert.equal(r.nativeProtectiveStopChildExchangeAckCertified,false);
  assert.equal(r.currentBrokerNetNotIndependentlyCertified,true);
  assert.equal(r.sourceEndpointsAtomic,false);
  assert.equal(r.netRealisedPnl,null);
  assert.equal(r.automaticClosureAuthorized,false);
  assert.equal(r.realisedPnlWriteAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  for(const x of [acct,'PH104-B1','PH104-S1','PH104-BUYEX','PH104-SELLEX'])
    assert.ok(!JSON.stringify(r).includes(x),'raw broker receipt leaked');
};
describe('Phase104 historical FO full-range trade ID, contract and pagination audit',()=>{
  it('four multi-day original BUY and SELL IDs match exactly: broker-reported only',()=>{
    const r=check();locked(r);
    assert.equal(r.state,'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
    assert.equal(r.matchedOriginalBuyTrades,2);
    assert.equal(r.matchedExitSellTrades,2);
    assert.equal(r.retrievedTradeRowCount,4);
    assert.equal(r.requestedPageCount,1);
  });
  it('partial 50 SELL and 100 original BUY reconcile three historical executions descriptively',()=>{
    const expected={...scope,exitedSellQuantity:50};
    const r=check(expected,evidence([
      page(records().slice(0,3))
    ],buys,sells.slice(0,1)));locked(r);
    assert.equal(r.state,'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
    assert.equal(r.matchedExitSellTrades,1);
  });
  it('two pages covering exact total_records 4 can corroborate all trade IDs',()=>{
    const all=records(),src=evidence([
      page(all.slice(0,2),1,2,4),
      page(all.slice(2),2,2,4)
    ]);
    const r=check(scope,src);locked(r);
    assert.equal(r.state,'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
    assert.equal(r.requestedPageCount,2);
  });
  it('missing last page cannot be silently interpreted as zero missing executions',()=>{
    const r=check(scope,evidence([
      page(records().slice(0,2),1,2,4)
    ]));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    assert.ok(r.reasonCodes.includes('HISTORICAL_FO_PAGE_COUNT_OR_TOTAL_RECORDS_INCOMPLETE'));
  });
  it('declared total_records smaller than actual delivered rows is malformed source',()=>{
    const r=check(scope,evidence([page(records(),1,1,2)]));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
  });
  it('page sequence duplicate, missing or stale total record metadata is incomplete',()=>{
    const all=records();
    for(const pages of [
      [page(all.slice(0,2),1,2,4),page(all.slice(2),1,2,4)],
      [page(all.slice(0,2),1,2,4),page(all.slice(2),2,3,4)],
      [page(all.slice(0,2),1,2,4),page(all.slice(2),2,2,5)]
    ]){
      const r=check(scope,evidence(pages));locked(r);
      assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    }
  });
  it('more than 20 pages is unsupported and cannot be treated as complete history',()=>{
    const copies=Array.from({length:21},(_,i)=>
      page([],i+1,21,0));
    const r=check(scope,evidence(copies));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
  });
  it('valid zero-row historical page cannot prove original BUY or SELL trades absent',()=>{
    const r=check(scope,evidence([page([],1,1,0)]));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    assert.ok(r.reasonCodes.includes(
      'IMMUTABLE_BUY_OR_SELL_TRADE_ID_ABSENT_FROM_COMPLETE_HISTORICAL_PAGES'));
  });
  it('missing source, errors and null pagination metadata are not empty certified history',()=>{
    for(const p of [null,undefined,{status:'error',data:[]},
      {status:'success',data:[],meta_data:null}]){
      const r=check(scope,evidence([p]));locked(r);
      assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    }
  });
  it('unrelated FO executions for another contract are allowed but cannot certify capital',()=>{
    const extra=row('PH104-OTHER','BUY',50,300,{
      option_type:'PE',strike_price:'25050.0'
    });
    const all=[...records(),extra];
    const r=check(scope,evidence([page(all)]));locked(r);
    assert.equal(r.state,'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
    assert.equal(r.completeAccountWideExposureCertified,false);
  });
  it('another same-contract historical BUY is an unledgered exposure conflict',()=>{
    const extra=row('PH104-MANUAL-BUY','BUY',50,110);
    const r=check(scope,evidence([page([...records(),extra])]));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_TRADE_CONFLICT');
    assert.equal(r.otherSameContractTrades,1);
    assert.ok(r.reasonCodes.includes('ADDITIONAL_SAME_OPTION_TRADE_NOT_IN_IMMUTABLE_CHILD_LEDGER'));
  });
  it('another same-contract historical SELL can violate independent child accounting',()=>{
    const extra=row('PH104-OTHER-SELL','SELL',50,101);
    const r=check(scope,evidence([page([...records(),extra])]));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_TRADE_CONFLICT');
    assert.equal(r.otherSameContractTrades,1);
  });
  it('truncated historical set missing one original BUY trade cannot corroborate 100 entry',()=>{
    const all=records().filter(x=>x.trade_id!=='PH104-B2');
    const r=check(scope,evidence([page(all)]));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    assert.equal(r.matchedOriginalBuyTrades,1);
  });
  it('missing SELL historical trade after overnight cannot be called a broker flat settlement',()=>{
    const all=records().filter(x=>x.trade_id!=='PH104-S1');
    const r=check(scope,evidence([page(all)]));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    assert.equal(r.matchedExitSellTrades,1);
  });
  it('duplicate historical trade ID, even across pages, cannot double-count fills',()=>{
    const all=records(),bad=[
      page(all.slice(0,2),1,2,5),
      page([...all.slice(2),all[0]],2,2,5)
    ];
    const r=check(scope,evidence(bad));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_TRADE_CONFLICT');
  });
  it('known trade ID with wrong FO option type, strike, expiry, symbol or exchange conflicts',()=>{
    const changes=[
      {option_type:'PE'},{strike_price:'25100'},
      {expiry:'2027-01-07'},{scrip_name:'BANKNIFTY'},
      {exchange:'BFO'}
    ];
    for(const patch of changes){
      const all=records();all[0]={...all[0],...patch};
      const r=check(scope,evidence([page(all)]));locked(r);
      assert.equal(r.state,'HISTORICAL_FO_TRADE_CONFLICT');
    }
  });
  it('wrong reported BUY/SELL side, quantity or price for known immutable trade ID conflicts',()=>{
    const changes=[
      {transaction_type:'SELL'},{quantity:25},
      {price:106},{price:null}
    ];
    for(const patch of changes){
      const all=records();all[0]={...all[0],...patch};
      const r=check(scope,evidence([page(all)]));locked(r);
      assert.equal(r.state,'HISTORICAL_FO_TRADE_CONFLICT');
    }
  });
  it('historical trade date before entry, after as-of or invalid leap day is not in range',()=>{
    for(const trade_date of ['2026-11-19','2026-11-23','2026-02-30']){
      const all=records();all[0]={...all[0],trade_date};
      const r=check(scope,evidence([page(all)]));locked(r);
      assert.equal(r.state,'HISTORICAL_FO_TRADE_CONFLICT');
    }
  });
  it('source history lacking original order_id/instrument_token cannot be mislabeled as independent venue cert',()=>{
    const r=check();locked(r);
    assert.equal(r.brokerHistoricalOrderIdPresent,false);
    assert.equal(r.brokerHistoricalInstrumentTokenPresent,false);
  });
  it('invalid immutable BUY duplicate or impossible original sold totals fail closed',()=>{
    const r=check(scope,evidence([page(records())],
      [buys[0],buys[0]],sells));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    const impossible={...scope,originalBuyQuantity:75};
    const n=check(impossible,evidence());locked(n);
    // The scope itself is impossible (SELL 100 > original BUY 75),
    // so the strongest fail-closed result occurs before history review.
    assert.equal(n.state,'INVALID_HISTORICAL_FO_SCOPE');
  });
  it('BUY and SELL immutable trade ID collision cannot corroborate two separate directions',()=>{
    const collision=[{...sells[0],tradeId:buys[0].tradeId},sells[1]];
    const r=check(scope,evidence([page(records())],buys,collision));locked(r);
    assert.equal(r.state,'HISTORICAL_FO_TRADE_CONFLICT');
  });
  it('invalid account, original entry day mismatch, future gap >120d, wrong contract fails scope',()=>{
    for(const patch of [
      {expectedAccountId:''},{startDate:'2026-11-21'},
      {endDate:'2026-11-21'},{entryTradeDate:'2026-11-21'},
      {expiryDate:'2026-02-30'},
      {optionType:'UNKNOWN'},{underlyingSymbol:'NIFTY 50'},
      {strikePrice:0},{exchange:'UNKNOWN'},
      {exitedSellQuantity:101},
      {startDate:'2026-01-01',entryTradeDate:'2026-01-01'}
    ]){
      const r=check({...scope,...patch} as HistoricalFoScope,evidence());locked(r);
      assert.equal(r.state,'INVALID_HISTORICAL_FO_SCOPE');
    }
  });
  it('wrong or unauthenticated connected broker account blocks history disclosure',()=>{
    const r=check(scope,{...evidence(),connectedAccountId:'PH104-WRONG'});
    locked(r);assert.equal(r.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
  });
  it('async adapter authenticates first, then reads every page sequentially',async()=>{
    const calls:string[]=[];
    const all=records();
    const broker={
      getLiveConnectionStatus:()=>{
        calls.push('auth');return {isConnected:true,userId:acct};
      },
      getHistoricalFoTradesPage:async(_:string,__:string,n:number,limit:number)=>{
        calls.push('page'+n);assert.equal(limit,1000);
        return n===1?page(all.slice(0,2),1,2,4):
          page(all.slice(2),2,2,4);
      },
      placeOrder:()=>{throw Error('NO_BROKER_ORDER');}
    };
    const r=await reviewHistoricalFoTradeHistoryReadOnly(broker,scope,buys,sells);
    locked(r);assert.equal(r.state,'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED');
    assert.deepEqual(calls,['auth','page1','auth','page2','auth']);
  });
  it('async adapter denies account mismatch before requesting page one',async()=>{
    let calls=0;
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:'PH104-OTHER'}),
      getHistoricalFoTradesPage:async()=>{calls++;return page(records());}
    };
    const r=await reviewHistoricalFoTradeHistoryReadOnly(broker,scope,buys,sells);
    locked(r);assert.equal(calls,0);
    assert.equal(r.state,'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH');
  });
  it('async pager rejects missing second page, transport errors and changing metadata',async()=>{
    for(const second of [null,undefined,{
      ...page(records().slice(2),2,3,4)
    }]){
      const broker={
        getLiveConnectionStatus:()=>({isConnected:true,userId:acct}),
        getHistoricalFoTradesPage:async(_:string,__:string,n:number)=>
          n===1?page(records().slice(0,2),1,2,4):second
      };
      const r=await reviewHistoricalFoTradeHistoryReadOnly(broker,scope,buys,sells);
      locked(r);assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    }
  });
  it('failed broker GET error never leaks secrets into fixed reason codes',async()=>{
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:acct}),
      getHistoricalFoTradesPage:async()=>{
        throw Error('PH104_BEARER_ACCESS_SECRET');
      }
    };
    const r=await reviewHistoricalFoTradeHistoryReadOnly(broker,scope,buys,sells);
    locked(r);assert.equal(r.state,'HISTORICAL_FO_SOURCE_INCOMPLETE');
    assert.ok(!JSON.stringify(r).includes('BEARER_ACCESS_SECRET'));
  });
  it('actual admin route and Upstox history method are GET-only; zero settlement/order writes',()=>{
    const provider=readFileSync('src/server/engine/providers/UpstoxProvider.ts','utf8');
    const begin=provider.indexOf('public async getHistoricalFoTradesPage(');
    const end=provider.indexOf('public async getOrderTrades(',begin);
    assert.ok(begin>0&&end>begin);
    const fn=provider.slice(begin,end);
    assert.ok(fn.includes('v2/charges/historical-trades'));
    // Prevent accidental double-escaping: every real YYYY-MM-DD query
    // would otherwise be rejected before the Upstox read-only GET.
    assert.ok(fn.includes(String.raw`const date=/^\d{4}-\d{2}-\d{2}$/;`));
    assert.ok(fn.includes("segment:'FO'"));
    assert.ok(!fn.includes('POST'));
    const server=readFileSync('serverApp.ts','utf8');
    const a=server.indexOf("app.post('/api/ema15m/historical-fo-trade-review'");
    const b=server.indexOf('  // 6. Save Notification Settings',a);
    assert.ok(a>0&&b>a);
    const route=server.slice(a,b);
    assert.ok(route.includes('requireSuperAdmin'));
    assert.ok(route.includes('readEmaJointBuySellEvidence('));
    assert.ok(route.includes('previewJointBuySellReceipts('));
    assert.ok(route.includes('getVerifiedLivePositionQuantity('));
    assert.ok(!route.includes('placeOrder('));
    assert.ok(!route.includes('updateEmaLivePosition('));
    assert.ok(!route.includes('calculateOptionNetPnl('));
  });
});
