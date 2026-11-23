import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditBraidedNrmlAccountReadsReadOnly,
  type BraidedAccountInput,type BraidedAccountReport,
  type AccountReadReceipt
} from '../../server/engine/ema15m/adaptiveBraidedNrmlAccountReadsReadOnly.js';
import type {NativeOrderTradeTimeInput} from
  '../../server/engine/ema15m/adaptiveUpstoxNativeTradeClockProvenanceReadOnly.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH127-OPTION';
const originalId='PH127-BUY';
const exchangeId='PH127-EXCHANGE';
const gttId='GTT-PH127-SELL';
const account='PH127-ACCOUNT-SECRET';
const epoch='PH127-EPOCH-SECRET';
const time1='2026-11-23T04:00:01.000Z';
const time2='2026-11-23T04:00:03.000Z';
const review='2026-11-23T04:01:00.000Z';
const micros=(x:string)=>Date.parse(x)*1000;
const buy=(v:Record<string,unknown>={})=>({
  order_id:originalId,exchange_order_id:exchangeId,
  instrument_token:key,product:'D',transaction_type:'BUY',
  status:'COMPLETE',quantity:100,filled_quantity:100,
  pending_quantity:0,average_price:100,...v
});
const gtt=(v:Record<string,unknown>={})=>({
  gtt_order_id:gttId,instrument_token:key,exchange:'NSE_FO',
  product:'D',type:'SINGLE',quantity:100,
  created_at:micros('2026-11-23T03:45:00.000Z'),
  expires_at:micros('2026-12-25T00:00:00.000Z'),
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:95,status:'SCHEDULED',
    order_id:null}],...v
});
const trade=(id:string,qty:number,premium:number,
  v:Record<string,unknown>={})=>({
  trade_id:id,order_id:originalId,
  exchange_order_id:exchangeId,instrument_token:key,
  exchange:'NFO',product:'D',transaction_type:'BUY',
  quantity:qty,average_price:premium,
  exchange_timestamp:'23-Nov-2026 09:15:00',
  order_timestamp:'23-Nov-2026 09:14:59',...v
});
const positions=()=>[
  {instrument_token:key,product:'D',net_quantity:100}
];
const input=(at:string):NativeOrderTradeTimeInput=>({
  cohortScope:{
    instrumentKey:key,originalBuyOrderId:originalId,
    expectedExchangeOrderId:exchangeId,gttOrderId,
    product:'NRML',selectedWeeks:4,
    originalQuantity:100,lotSize:50,
    assertedCurrentNetLongQuantity:100,
    reviewedAtUtc:review,
    assertedContractExpiryUtc:'2027-01-15T00:00:00.000Z'
  },
  cohortEvidence:{
    originalBuyOrder:buy(),orderBook:[buy()],
    positions:positions(),existingSingleSellGtt:gtt()
  },
  perOrderTradeResponse:{status:'success',data:[
    trade('PH127-T1',60,90),trade('PH127-T2',40,115)
  ]},
  sourceMethod:'GET',sourcePath:'/v2/order/trades',
  captureOrigin:'OPERATOR_CAPTURED_UNVERIFIED',
  exchangeClockAssumption:'ASSUME_ASIA_KOLKATA_UNVERIFIED',
  captureAtUtc:at,maxCaptureAgeMinutes:15
});
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const receipt=(stage:'ORDER_BOOK'|'GTT_ORDERS'|'POSITIONS',
  ms:number,id:string,rows:unknown):AccountReadReceipt=>({
  accountId:account,authEpoch:epoch,source:stage,
  requestReceiptId:id,
  captureAtUtc:new Date(ms).toISOString(),rows
});
const dataset=():BraidedAccountInput=>{
  const orig={
    expectedAccountId:account,expectedAuthEpoch:epoch,
    maxReadSeparationSeconds:30,
    first:{
      accountId:account,authEpoch:epoch,
      requestReceiptId:'PH127-TRADES-1',input:input(time1)
    },
    second:{
      accountId:account,authEpoch:epoch,
      requestReceiptId:'PH127-TRADES-2',input:input(time2)
    }
  };
  const phase126={
    originalBuy:orig,
    first:{
      accountId:account,authEpoch:epoch,
      requestReceiptId:orig.first.requestReceiptId,
      captureAtUtc:time1,allGttOrders:[gtt()],
      orderBookIsCurrentTradingDayOnly:true as const,
      gttGetCannotRetrieveCompletedParents:true as const
    },
    second:{
      accountId:account,authEpoch:epoch,
      requestReceiptId:orig.second.requestReceiptId,
      captureAtUtc:time2,allGttOrders:[gtt()],
      orderBookIsCurrentTradingDayOnly:true as const,
      gttGetCannotRetrieveCompletedParents:true as const
    }
  };
  const start=Date.parse('2026-11-23T04:00:04.000Z');
  const rows=()=>[
    [buy()],[gtt()],positions(),[buy()]
  ] as unknown[];
  const make=(base:number,tag:string)=>{
    const r=rows();
    return {
      orderBefore:receipt('ORDER_BOOK',base+0,tag+'-A',r[0]),
      gtt:receipt('GTT_ORDERS',base+100,tag+'-B',r[1]),
      positions:receipt('POSITIONS',base+200,tag+'-C',r[2]),
      orderAfter:receipt('ORDER_BOOK',base+300,tag+'-D',r[3])
    };
  };
  return {
    originalBuyAndCensus:phase126,
    first:make(start,'PH127-READ-1'),
    second:make(start+1000,'PH127-READ-2'),
    maxPassWindowSeconds:1,
    maxTotalReadWindowSeconds:3,
    currentDayOnlyOrderBook:true,
    completedGttParentsUnavailable:true
  };
};
const run=(x:BraidedAccountInput=dataset())=>
  auditBraidedNrmlAccountReadsReadOnly(x);
const secure=(r:BraidedAccountReport)=>{
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(r.currentDayOrderBookNotHistorical,true);
  assert.equal(r.completedGttParentsUnavailableFromGet,true);
  for(const f of [
    'readReceiptIdsOrSessionEpochBrokerAttested',
    'twoPassSourcesIndependentOrAtomic',
    'historicBuySellAndGttContinuityVerified',
    'originalTradeTimestampsExchangeSigned',
    'authenticFnoExpiryAndLotCalendarVerified',
    'fullAccountNoDuplicateSellExposureCertified',
    'gttConditionalSellExchangeStopAcknowledged',
    'brokerCloseOnlyNoShortNrmlVerified',
    'persistentOvernightProtectionCertified',
    'overnightGapLimitFillGuaranteed',
    'independentLiveReleaseApproved',
    'liveNrmlBuyAuthorized',
    'retrySellAuthorized',
    'autoPositionClosureAuthorized',
    'realisedPnlWriteAuthorized',
    'positional1515ForcedSquareOff',
    'brokerOrderOrGttWritesAuthorized'
  ] as const)assert.equal(r[f],false,f);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const raw=JSON.stringify(r);
  for(const secret of [account,epoch,key,originalId,gttId,
    exchangeId,'PH127-READ-1','PH127-T1','PH127-TRADES-1'])
    assert.equal(raw.includes(secret),false);
};
const baseline='EIGHT_SOURCE_READ_BRAID_STABLE_SAME_SECOND_GTT_UNRESOLVED';

describe('Phase127 eight-read braided order/GTT/position NRML TOCTOU census',()=>{
  it('8 correctly ordered snapshots remain unverified and same-second SELL risk',()=>{
    const r=run();secure(r);
    assert.equal(r.state,baseline);
    assert.equal(r.reviewedReadReceipts,8);
    assert.equal(r.firstPassDurationMs,300);
    assert.equal(r.secondPassDurationMs,300);
    assert.equal(r.totalBraidedWindowMs,1300);
    assert.equal(r.phase126State,
      'CURRENT_CENSUS_STABLE_GTT_SAME_SECOND_BUY_UNRESOLVED');
  });
  it('source scope must declare historical orderbook and completed GTT limits',()=>{
    for(const field of ['currentDayOnlyOrderBook',
      'completedGttParentsUnavailable'] as const){
      const v=dataset();
      v[field]=false as true;
      const r=run(v);secure(r);
      assert.equal(r.state,'INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW');
    }
  });
  it('missing pass, unexpected window or invalid account expectation fail',()=>{
    const cases=[
      {first:null},
      {maxPassWindowSeconds:0},
      {maxPassWindowSeconds:61},
      {maxTotalReadWindowSeconds:1},
      {maxTotalReadWindowSeconds:181},
      {maxTotalReadWindowSeconds:2.5},
      {originalBuyAndCensus:{
        ...dataset().originalBuyAndCensus,
        originalBuy:{
          ...dataset().originalBuyAndCensus.originalBuy,
          expectedAccountId:'wrong'
        }
      }}
    ];
    for(const patch of cases){
      const r=run({...dataset(),...patch} as BraidedAccountInput);
      secure(r);
      assert.equal(r.state,patch.first===null?
        'INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW':
        'INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW');
    }
  });
  it('duplicate request IDs, original trade receipt ID reuse and reversed timestamps reject',()=>{
    const cases=[
      (x:BraidedAccountInput)=>{x.second.gtt.requestReceiptId=x.first.gtt.requestReceiptId;},
      (x:BraidedAccountInput)=>{x.first.gtt.requestReceiptId=x.originalBuyAndCensus.originalBuy.first.requestReceiptId;},
      (x:BraidedAccountInput)=>{x.first.gtt.captureAtUtc=x.first.orderBefore.captureAtUtc;},
      (x:BraidedAccountInput)=>{x.second.orderBefore.captureAtUtc=x.first.orderBefore.captureAtUtc;},
      (x:BraidedAccountInput)=>{x.first.orderBefore.captureAtUtc='2026-11-23T04:00:03.000Z';}
    ];
    for(const modify of cases){
      const x=dataset();modify(x);
      const r=run(x);secure(r);
      assert.equal(r.state,'BROKER_RECEIPT_ID_DUPLICATE_OR_READ_CLOCK_REVERSED');
    }
  });
  it('exact source path for each stage and canonical UTC required',()=>{
    const cases=[
      (x:BraidedAccountInput)=>{x.first.gtt.source='POSITIONS';},
      (x:BraidedAccountInput)=>{x.second.orderAfter.source='GTT_ORDERS';},
      (x:BraidedAccountInput)=>{x.first.gtt.captureAtUtc='23-Nov-2026 09:30:00';},
      (x:BraidedAccountInput)=>{x.first.orderBefore.captureAtUtc='2026-11-23T04:00:04Z';}
    ];
    for(const modify of cases){
      const x=dataset();modify(x);
      const r=run(x);secure(r);
      assert.equal(r.state,'INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW');
    }
  });
  it('account and auth epoch switches on any stage reject before interpreting net',()=>{
    for(const stage of ['orderBefore','gtt','positions','orderAfter'] as const){
      const x=dataset();x.second[stage].accountId='PH127-OTHER-ACCOUNT';
      const r=run(x);secure(r);
      assert.equal(r.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_BETWEEN_ENDPOINTS');
      const y=dataset();y.first[stage].authEpoch='PH127-OTHER-EPOCH';
      const r2=run(y);secure(r2);
      assert.equal(r2.state,'BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_BETWEEN_ENDPOINTS');
    }
  });
  it('pass or total duration and after-review clock fail closed',()=>{
    const a=dataset();a.first.orderAfter.captureAtUtc='2026-11-23T04:00:05.000Z';
    assert.equal(run(a).state,'BROKER_RECEIPT_ID_DUPLICATE_OR_READ_CLOCK_REVERSED');
    const b=dataset();b.maxTotalReadWindowSeconds=1 as number;
    assert.equal(run(b).state,'INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW');
    const c=dataset();c.second.orderAfter.captureAtUtc='2026-11-23T04:01:01.000Z';
    assert.equal(run(c).state,'INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW');
  });
  it('malformed/overwide order, GTT and position payloads reject',()=>{
    const cases=[
      (x:BraidedAccountInput)=>{x.first.orderBefore.rows=null;},
      (x:BraidedAccountInput)=>{x.first.gtt.rows=[null];},
      (x:BraidedAccountInput)=>{x.first.positions.rows={status:'success'};},
      (x:BraidedAccountInput)=>{x.first.gtt.rows=[{gtt_order_id:gttId}];},
      (x:BraidedAccountInput)=>{x.first.orderBefore.rows=[{order_id:'broken'}];},
      (x:BraidedAccountInput)=>{x.first.positions.rows=[
        {instrument_token:key,product:'D',net_quantity:Infinity}
      ];},
      (x:BraidedAccountInput)=>{x.first.gtt.rows=Array(10001).fill(gtt());},
      (x:BraidedAccountInput)=>{x.first.orderBefore.rows=[
        buy({operator_secret:'X'.repeat(20001)})
      ];}
    ];
    for(const modify of cases){
      const x=dataset();modify(x);
      const r=run(x);secure(r);
      assert.equal(r.state,
        'ORDER_GTT_POSITION_GET_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED');
    }
    const v=dataset();const cyclic:Record<string,unknown>=gtt();
    cyclic.self=cyclic;v.first.gtt.rows=[cyclic];
    assert.equal(run(v).state,
      'ORDER_GTT_POSITION_GET_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED');
  });
  it('duplicate order ID, GTT ID and position instrument-product key fail',()=>{
    const cases=[
      (x:BraidedAccountInput)=>{x.first.orderBefore.rows=[buy(),buy()];},
      (x:BraidedAccountInput)=>{x.first.gtt.rows=[gtt(),gtt()];},
      (x:BraidedAccountInput)=>{x.first.positions.rows=[
        ...positions(),...positions()
      ];}
    ];
    for(const modify of cases){
      const x=dataset();modify(x);
      const r=run(x);secure(r);
      assert.equal(r.state,'DUPLICATE_ACCOUNT_ORDER_GTT_OR_POSITION_KEY');
    }
  });
  it('any same-pass order state change is TOCTOU, even terminal status',()=>{
    for(const mutate of [
      buy({status:'CANCEL PENDING'}),
      buy({filled_quantity:50}),
      buy({pending_quantity:50}),
      buy({quantity:200}),
      buy({tag:'UNEXPECTED-SELL'})
    ]){
      const x=dataset();x.first.orderAfter.rows=[mutate];
      const r=run(x);secure(r);
      assert.equal(r.state,'ORDERBOOK_CHANGED_WITHIN_FIRST_OR_SECOND_PASS');
    }
    const y=dataset();y.second.orderAfter.rows=[];
    assert.equal(run(y).state,'ORDERBOOK_CHANGED_WITHIN_FIRST_OR_SECOND_PASS');
  });
  it('stable each pass but net orders different across passes quarantine',()=>{
    const x=dataset();
    const drift=[buy({filled_quantity:50})];
    x.second.orderBefore.rows=drift;x.second.orderAfter.rows=drift;
    const r=run(x);secure(r);
    assert.equal(r.state,'ORDERBOOK_CHANGED_BETWEEN_PASSES');
  });
  it('GTT child generation/trigger/pricing/parent changes across reads quarantine',()=>{
    const cases=[
      gtt({quantity:50}),
      gtt({created_at:micros('2026-11-23T03:46:00.000Z')}),
      gtt({rules:[{strategy:'ENTRY',transaction_type:'SELL',
        trigger_type:'BELOW',trigger_price:95,
        status:'TRIGGERED',order_id:'PH127-CHILD'}]}),
      gtt({rules:[{strategy:'ENTRY',transaction_type:'SELL',
        trigger_type:'BELOW',trigger_price:94,
        status:'SCHEDULED',order_id:null}]}),
    ];
    for(const changed of cases){
      const x=dataset();x.second.gtt.rows=[changed];
      const r=run(x);secure(r);
      assert.equal(r.state,'GTT_PARENT_CHANGED_BETWEEN_PASSES');
    }
  });
  it('position net or other contract exposure addition across snapshots quarantine',()=>{
    for(const changed of [
      [{instrument_token:key,product:'D',net_quantity:50}],
      [...positions(),{instrument_token:'NSE_FO|OTHER',
        product:'D',net_quantity:50}],
      []
    ]){
      const x=dataset();x.second.positions.rows=changed;
      const r=run(x);secure(r);
      assert.equal(r.state,
        'POSITION_LONG_OR_OTHER_EXPOSURE_CHANGED_BETWEEN_PASSES');
    }
  });
  it('apparently stable new GETs disagreeing with Phase125/126 source quarantine',()=>{
    const x=dataset();
    const newOrder=buy({tag:'SYNTHETIC-CURRENT-TIME'});
    x.first.orderBefore.rows=[newOrder];x.first.orderAfter.rows=[newOrder];
    x.second.orderBefore.rows=[newOrder];x.second.orderAfter.rows=[newOrder];
    const r=run(x);secure(r);
    assert.equal(r.state,'BRAID_SOURCE_DIFFERS_FROM_PHASE125_126_ACCOUNT_CENSUS');
  });
  it('Phase126 upstream competing SELL fails even with 8 stable GET receipts',()=>{
    const x=dataset();
    const competing={
      order_id:'PH127-EXTRA-SELL',instrument_token:key,product:'D',
      transaction_type:'SELL',status:'OPEN',quantity:100,
      filled_quantity:0,pending_quantity:100
    };
    for(const p of [x.originalBuyAndCensus.originalBuy.first,
      x.originalBuyAndCensus.originalBuy.second]){
      p.input.cohortEvidence={
        ...p.input.cohortEvidence,orderBook:[buy(),competing]
      };
    }
    for(const pass of [x.first,x.second]){
      pass.orderBefore.rows=[buy(),competing];
      pass.orderAfter.rows=[buy(),competing];
    }
    const r=run(x);secure(r);
    assert.equal(r.state,'PHASE126_BUY_CENSUS_OR_GTT_ALREADY_QUARANTINED');
    assert.equal(r.phase126State,'SAME_CONTRACT_OTHER_BUY_SELL_FILLED_OR_PENDING');
  });
  it('permutation of independent outer account list rows is stable, not drift',()=>{
    const x=dataset();
    const other={
      order_id:'PH127-OTHER-ORDER',instrument_token:'BSE_FO|OTHER',
      product:'D',transaction_type:'SELL',status:'CANCELLED',
      quantity:20,filled_quantity:0,pending_quantity:0
    };
    for(const p of [x.originalBuyAndCensus.originalBuy.first,
      x.originalBuyAndCensus.originalBuy.second])
      p.input.cohortEvidence={
        ...p.input.cohortEvidence,orderBook:[buy(),other]
      };
    x.first.orderBefore.rows=[buy(),other];
    x.first.orderAfter.rows=[other,buy()];
    x.second.orderBefore.rows=[other,buy()];
    x.second.orderAfter.rows=[buy(),other];
    assert.equal(run(x).state,baseline);
  });
  it('static purity and NRML 15:15 exclusion; no broker GET or write',()=>{
    const code=readFileSync(
      'src/server/engine/ema15m/adaptiveBraidedNrmlAccountReadsReadOnly.ts',
      'utf8'
    );
    for(const s of ['fetch(','.getOrderBook(','.getGttOrders(',
      '.placeOrder(','.cancelOrder(','.modifyOrder(',
      '.placeGttOrder(','writeFileSync(','app.post(',
      'server.listen(','Date.now('])
      assert.equal(code.includes(s),false,s);
    secure(run());
  });
});
