import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditTwoPassNrmlAccountCensusReadOnly,
  type DualAccountCensusInput,
  type DualAccountCensusReport
} from '../../server/engine/ema15m/adaptiveDualAccountSellGttCensusReadOnly.js';
import type {NativeOrderTradeTimeInput} from
  '../../server/engine/ema15m/adaptiveUpstoxNativeTradeClockProvenanceReadOnly.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH126-CURRENT-OPTION';
const originalId='PH126-ORIGINAL-BUY';
const exchangeId='PH126-EXCHANGE-ORDER';
const gttId='GTT-PH126-SELL';
const account='PH126-PRIVATE-ACCOUNT';
const epoch='PH126-PRIVATE-EPOCH';
const review='2026-11-23T04:00:05.000Z';
const one='2026-11-23T04:00:01.000Z';
const two='2026-11-23T04:00:03.000Z';
const initial='2026-11-23T03:45:00.000Z';
const micros=(x:string)=>Date.parse(x)*1000;
const buy=(c:Record<string,unknown>={})=>({
  order_id:originalId,exchange_order_id:exchangeId,
  instrument_token:key,product:'D',transaction_type:'BUY',
  quantity:100,filled_quantity:100,pending_quantity:0,
  status:'COMPLETE',average_price:100,...c
});
const gtt=(c:Record<string,unknown>={})=>({
  gtt_order_id:gttId,instrument_token:key,exchange:'NSE_FO',
  product:'D',type:'SINGLE',quantity:100,
  created_at:micros(initial),
  expires_at:micros('2026-12-25T00:00:00.000Z'),
  rules:[{strategy:'ENTRY',status:'SCHEDULED',
    trigger_type:'BELOW',trigger_price:95,
    transaction_type:'SELL',order_id:null}],...c
});
const positions=()=>[
  {instrument_token:key,product:'D',net_quantity:100}
];
const trade=(id:string,quantity:number,price:number)=>({
  trade_id:id,exchange:'NFO',instrument_token:key,product:'D',
  transaction_type:'BUY',quantity,average_price:price,
  order_id:originalId,exchange_order_id:exchangeId,
  exchange_timestamp:'23-Nov-2026 09:15:00',
  order_timestamp:'23-Nov-2026 09:14:59'
});
const input=(at:string,mutations:Partial<NativeOrderTradeTimeInput>={})
  :NativeOrderTradeTimeInput=>({
    cohortScope:{
      instrumentKey:key,originalBuyOrderId:originalId,
      expectedExchangeOrderId:exchangeId,gttOrderId:gttId,
      product:'NRML',selectedWeeks:4,
      originalQuantity:100,lotSize:50,
      assertedCurrentNetLongQuantity:100,
      reviewedAtUtc:review,
      assertedContractExpiryUtc:'2027-01-15T00:00:00.000Z'
    },
    cohortEvidence:{
      originalBuyOrder:buy(),
      orderBook:[buy()],
      positions:positions(),
      existingSingleSellGtt:gtt()
    },
    perOrderTradeResponse:{status:'success',data:[
      trade('PH126-TRADE1',60,90),trade('PH126-TRADE2',40,115)
    ]},
    sourceMethod:'GET',sourcePath:'/v2/order/trades',
    captureOrigin:'OPERATOR_CAPTURED_UNVERIFIED',
    exchangeClockAssumption:'ASSUME_ASIA_KOLKATA_UNVERIFIED',
    captureAtUtc:at,maxCaptureAgeMinutes:15,...mutations
  });
const fixture=():DualAccountCensusInput=>({
  originalBuy:{
    expectedAccountId:account,expectedAuthEpoch:epoch,
    maxReadSeparationSeconds:30,
    first:{
      accountId:account,authEpoch:epoch,
      requestReceiptId:'PH126-REQ-A',input:input(one)
    },
    second:{
      accountId:account,authEpoch:epoch,
      requestReceiptId:'PH126-REQ-B',input:input(two)
    }
  },
  first:{
    accountId:account,authEpoch:epoch,
    requestReceiptId:'PH126-REQ-A',captureAtUtc:one,
    allGttOrders:[gtt()],orderBookIsCurrentTradingDayOnly:true,
    gttGetCannotRetrieveCompletedParents:true
  },
  second:{
    accountId:account,authEpoch:epoch,
    requestReceiptId:'PH126-REQ-B',captureAtUtc:two,
    allGttOrders:[gtt()],orderBookIsCurrentTradingDayOnly:true,
    gttGetCannotRetrieveCompletedParents:true
  }
});
const copy=<T>(x:T)=>JSON.parse(JSON.stringify(x)) as T;
const check=(r:DualAccountCensusReport)=>{
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(r.currentDayOnlyNotHistory,true);
  assert.equal(r.completedGttHistoryUnavailableFromNativeGet,true);
  for(const f of [
    'accountAndAuthEpochIndependentlyAuthenticated',
    'brokerReadResponsesIndependentlyAttested',
    'issuerExchangeSessionCalendarAuthenticated',
    'originalBuyExecutionVenueSigned',
    'fullAccountPositionHistoricalContinuityVerified',
    'historicalOrderOrCompletedGttAbsenceCertified',
    'accountGttAndOrderGetsAtomic',
    'conditionalGttSellIsExchangeHostedNativeStop',
    'brokerNrmlNoShortCloseOnlyVerified',
    'persistentOvernightProtectionCertified',
    'gapLimitSellFillGuaranteed',
    'duplicateSellRetryAuthorized',
    'automaticPositionClosureAuthorized',
    'realisedPnlWriteAuthorized',
    'positional1515SquareOffAuthorized',
    'liveNrmlBuyAuthorized',
    'brokerOrderGttMutationAuthorized'
  ] as const)assert.equal(r[f],false,f);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const serialized=JSON.stringify(r);
  for(const secret of [
    key,originalId,exchangeId,gttId,account,epoch,
    'PH126-REQ-A','PH126-TRADE1','PH126-TRADE2',
    'PRIVATE-BROKER-TOKEN'
  ])assert.equal(serialized.includes(secret),false);
};
const run=(i:DualAccountCensusInput=fixture())=>{
  const result=auditTwoPassNrmlAccountCensusReadOnly(i);
  check(result);return result;
};
const base='CURRENT_CENSUS_STABLE_GTT_SAME_SECOND_BUY_UNRESOLVED';
const makeSibling=(c:Record<string,unknown>={})=>({
  order_id:'PH126-EXTRA-ORDER',instrument_token:key,
  product:'D',transaction_type:'SELL',status:'OPEN',
  quantity:100,filled_quantity:0,pending_quantity:100,...c
});
describe('Phase126 full-account current-day SELL/GTT and original BUY census',()=>{
  it('baseline stable but native GTT and BUY same-second remains UNPROTECTED',()=>{
    const r=run();
    assert.equal(r.state,base);
    assert.equal(r.phase125State,
      'TWO_READS_STABLE_GTT_SAME_SECOND_EXECUTION_UNRESOLVED');
    assert.equal(r.selectedGttSeenInBothCurrentLists,true);
    assert.equal(r.originalBuySeenInCurrentDayBook,true);
    assert.equal(r.brokerReportedCurrentNetLong,100);
  });
  it('other-contract order and GTT may exist without pretending history is certified',()=>{
    const x=fixture();
    const other={...makeSibling({
      order_id:'PH126-OTHER-INSTRUMENT',
      instrument_token:'NSE_FO|OTHER-OPTION'
    })};
    const otherGtt=gtt({
      gtt_order_id:'GTT-PH126-OTHER',
      instrument_token:'BSE_FO|OTHER-OPTION',
      exchange:'BSE_FO'
    });
    for(const pass of [x.originalBuy.first,x.originalBuy.second]){
      pass.input.cohortEvidence={
        ...pass.input.cohortEvidence,
        orderBook:[buy(),other]
      };
    }
    x.first.allGttOrders=[gtt(),otherGtt];
    x.second.allGttOrders=[otherGtt,gtt()];
    const r=run(x);
    assert.equal(r.state,base);
    assert.equal(r.sameContractOtherOrderCount,0);
  });
  it('a cancelled no-fill other same-contract order not a current active order',()=>{
    const x=fixture();
    const harmless=makeSibling({
      status:'CANCELLED',filled_quantity:0,pending_quantity:0
    });
    for(const pass of [x.originalBuy.first,x.originalBuy.second])
      pass.input.cohortEvidence={
        ...pass.input.cohortEvidence,orderBook:[buy(),harmless]
      };
    const r=run(x);assert.equal(r.state,base);
    assert.equal(r.sameContractOtherOrderCount,1);
  });
  it('exact account, epoch and both captured receipt/clock bindings required',()=>{
    const vals:Partial<DualAccountCensusInput>[]=[
      {first:{...fixture().first,accountId:'PH126-OTHER-ACCOUNT'}},
      {second:{...fixture().second,authEpoch:'PH126-OTHER-EPOCH'}},
      {first:{...fixture().first,requestReceiptId:'PH126-OTHER-REQ'}},
      {second:{...fixture().second,captureAtUtc:one}},
      {first:{...fixture().first,orderBookIsCurrentTradingDayOnly:false as true}},
      {second:{...fixture().second,gttGetCannotRetrieveCompletedParents:false as true}},
    ];
    for(const d of vals){
      const r=run({...fixture(),...d});
      assert.equal(r.state,'INVALID_ACCOUNT_CENSUS_SOURCE_SCOPE_OR_CLOCK');
    }
  });
  it('missing, oversized, malformed and cyclic GTT census reject',()=>{
    for(const raw of [
      null,{},[null],[{gtt_order_id:'INVALID'}],
      [{...gtt(),rules:'UNKNOWN'}],
      Array(10001).fill(gtt())
    ]){
      const x=fixture();x.first.allGttOrders=raw;
      const r=run(x);
      assert.equal(r.state,
        'ACCOUNT_CENSUS_GTT_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED');
    }
    const x=fixture();const c:Record<string,unknown>=gtt();
    c.self=c; x.first.allGttOrders=[c];
    const r=run(x);
    assert.equal(r.state,
      'ACCOUNT_CENSUS_GTT_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED');
  });
  it('duplicate same or unrelated GTT id fails before pretending active census',()=>{
    const x=fixture();
    x.first.allGttOrders=[gtt(),gtt()];
    const r=run(x);assert.equal(r.state,
      'ACCOUNT_WIDE_GTT_PARENT_ID_DUPLICATE');
  });
  it('GTT added, missing or repriced between reads quarantine',()=>{
    const cases=[
      [gtt(),gtt({expires_at:micros('2026-12-26T00:00:00.000Z')})],
      [gtt(),gtt({quantity:50})],
      [gtt(),gtt({rules:[{strategy:'ENTRY',status:'TRIGGERED',
        trigger_type:'BELOW',trigger_price:95,transaction_type:'SELL',
        order_id:'PH126-CHILD'}]})],
      [gtt(),gtt({created_at:micros(initial)+1})]
    ];
    for(const [a,b] of cases){
      const x=fixture();x.first.allGttOrders=[a];x.second.allGttOrders=[b];
      const r=run(x);
      assert.equal(r.state,'ACCOUNT_GTT_CENSUS_CHANGED_BETWEEN_READS');
    }
  });
  it('same GTT ID not visible in full account lists cannot be silently fabricated',()=>{
    const x=fixture();x.first.allGttOrders=[];
    x.second.allGttOrders=[];
    const r=run(x);
    assert.equal(r.state,'SELECTED_GTT_PARENT_MISSING_OR_SOURCE_DISAGREES');
  });
  it('GTT parent details inconsistent with per-trade cohort audit block',()=>{
    const x=fixture();
    x.first.allGttOrders=[gtt({quantity:50})];
    x.second.allGttOrders=[gtt({quantity:50})];
    const r=run(x);
    assert.equal(r.state,'SELECTED_GTT_PARENT_MISSING_OR_SOURCE_DISAGREES');
  });
  it('additional same-contract GTT causes oversell/overbuy conflict regardless of rule status',()=>{
    for(const extra of [
      gtt({gtt_order_id:'GTT-PH126-EXTRA'}),
      gtt({gtt_order_id:'GTT-PH126-EXTRA',
        rules:[{strategy:'ENTRY',status:'CANCELLED',
          trigger_type:'BELOW',trigger_price:95,
          transaction_type:'SELL',order_id:null}]}),
      gtt({gtt_order_id:'GTT-PH126-EXTRA',product:'I'})
    ]){
      const x=fixture();
      x.first.allGttOrders=[gtt(),extra];
      x.second.allGttOrders=[gtt(),extra];
      const r=run(x);
      assert.equal(r.state,'COMPETING_SAME_OPTION_GTT_PARENT_EXISTS');
      assert.equal(r.sameContractOtherGttParentCount,1);
    }
  });
  it('invalid account order and portfolio source schema fails before exposure claim',()=>{
    for(const [orders,poss] of [
      [null,positions()],
      [[null],positions()],
      [[buy({order_id:null})],positions()],
      [[buy()],null],
      [[buy()],[null]],
      [[buy()],[{instrument_token:key,product:'?' ,net_quantity:100}]]
    ]){
      const x=fixture();
      for(const pass of [x.originalBuy.first,x.originalBuy.second])
        pass.input.cohortEvidence={
          ...pass.input.cohortEvidence,orderBook:orders,positions:poss
        };
      const r=run(x);
      assert.equal(r.state,'ACCOUNT_ORDER_OR_POSITION_SNAPSHOT_MALFORMED');
    }
  });
  it('same option other product in orders or positions is not NRML close-only proof',()=>{
    for(const extraOrder of [
      makeSibling({product:'I'}),
      makeSibling({product:'MTF'})
    ]){
      const x=fixture();
      for(const pass of [x.originalBuy.first,x.originalBuy.second])
        pass.input.cohortEvidence={
          ...pass.input.cohortEvidence,orderBook:[buy(),extraOrder]
        };
      assert.equal(run(x).state,
        'SAME_OPTION_OTHER_PRODUCT_EXPOSURE_UNRESOLVED');
    }
    const x=fixture();
    for(const pass of [x.originalBuy.first,x.originalBuy.second])
      pass.input.cohortEvidence={
        ...pass.input.cohortEvidence,
        positions:[...positions(),{
          instrument_token:key,product:'I',net_quantity:100
        }]
      };
    assert.equal(run(x).state,
      'SAME_OPTION_OTHER_PRODUCT_EXPOSURE_UNRESOLVED');
  });
  it('other active BUY/SELL, pending cancel, FILLED SELL, zero-fill OPEN all quarantine',()=>{
    const variants=[
      makeSibling(),
      makeSibling({transaction_type:'BUY'}),
      makeSibling({status:'CANCEL PENDING'}),
      makeSibling({status:'COMPLETE',
        filled_quantity:100,pending_quantity:0}),
      makeSibling({status:'CANCELLED',
        filled_quantity:50,pending_quantity:0}),
      makeSibling({status:'OPEN',
        filled_quantity:0,pending_quantity:0}),
      makeSibling({status:'UNKNOWN',
        filled_quantity:0,pending_quantity:0}),
      makeSibling({status:'REJECTED',
        filled_quantity:null,pending_quantity:0})
    ];
    for(const v of variants){
      const x=fixture();
      for(const pass of [x.originalBuy.first,x.originalBuy.second])
        pass.input.cohortEvidence={
          ...pass.input.cohortEvidence,orderBook:[buy(),v]
        };
      const r=run(x);
      assert.equal(r.state,'SAME_CONTRACT_OTHER_BUY_SELL_FILLED_OR_PENDING');
    }
  });
  it('duplicate native order IDs anywhere in account book never get silently ignored',()=>{
    const x=fixture();
    for(const pass of [x.originalBuy.first,x.originalBuy.second])
      pass.input.cohortEvidence={
        ...pass.input.cohortEvidence,orderBook:[buy(),buy()]
      };
    assert.equal(run(x).state,
      'ACCOUNT_ORDER_ID_DUPLICATE_OR_CENSUS_INCOMPLETE');
  });
  it('missing original BUY today is UNKNOWN not proof it never executed',()=>{
    const x=fixture();
    for(const pass of [x.originalBuy.first,x.originalBuy.second])
      pass.input.cohortEvidence={
        ...pass.input.cohortEvidence,orderBook:[]
      };
    const r=run(x);
    assert.equal(r.state,
      'ORIGINAL_BUY_ABSENT_FROM_CURRENT_DAY_ORDERBOOK_UNKNOWN');
    assert.equal(r.originalBuySeenInCurrentDayBook,false);
    assert.equal(r.historicalOrderOrCompletedGttAbsenceCertified,false);
  });
  it('current day original BUY altered quantity or side conflicts',()=>{
    for(const changes of [
      {transaction_type:'SELL'},{filled_quantity:50},
      {status:'OPEN'},{pending_quantity:100},
      {quantity:50},{product:'I'}
    ]){
      const x=fixture();
      for(const pass of [x.originalBuy.first,x.originalBuy.second])
        pass.input.cohortEvidence={
          ...pass.input.cohortEvidence,orderBook:[buy(changes)]
        };
      assert.equal(run(x).state,
        changes.product==='I'?
          'SAME_OPTION_OTHER_PRODUCT_EXPOSURE_UNRESOLVED':
          'ORIGINAL_BUY_CURRENT_DAY_ORDER_CONFLICT');
    }
  });
  it('net 0, negative, malformed, duplicate or mismatched long quarantined',()=>{
    for(const poss of [
      [],
      [{instrument_token:key,product:'D',net_quantity:0}],
      [{instrument_token:key,product:'D',net_quantity:-50}],
      [{instrument_token:key,product:'D',net_quantity:50}],
      [{instrument_token:key,product:'D',net_quantity:100},
       {instrument_token:key,product:'D',net_quantity:100}],
      [{instrument_token:key,product:'D',net_quantity:'unknown'}]
    ]){
      const x=fixture();
      for(const pass of [x.originalBuy.first,x.originalBuy.second])
        pass.input.cohortEvidence={
          ...pass.input.cohortEvidence,positions:poss
        };
      assert.equal(run(x).state,
        'BROKER_CURRENT_NRML_NET_NOT_EXACT_UNIQUE_POSITIVE_LOT');
    }
  });
  it('Phase125 source drift survives even when current GTT and position lists match',()=>{
    const x=fixture();
    x.originalBuy.second.input.perOrderTradeResponse={
      status:'success',data:[
        trade('PH126-TRADE1',60,90),
        trade('PH126-TRADE2',40,114)
      ]
    };
    const r=run(x);
    assert.equal(r.state,'PHASE125_BUY_TRADE_SOURCE_OR_GTT_QUARANTINED');
    assert.equal(r.phase125State,
      'ORIGINAL_BUY_TRADE_IDENTITY_PRICE_QUANTITY_OR_CLOCK_DRIFT');
  });
  it('no HTTP, storage, mutation, live NRML trades or 15:15 positional exit paths',()=>{
    const code=readFileSync(
      'src/server/engine/ema15m/adaptiveDualAccountSellGttCensusReadOnly.ts',
      'utf8'
    );
    for(const word of [
      'fetch(','.placeOrder(','.cancelOrder(','.modifyOrder(',
      '.placeGttOrder(','.getOrderBook(','.getGttOrders(',
      'writeFileSync(','app.post(','server.listen(','Date.now('
    ])assert.equal(code.includes(word),false,word);
    check(run());
  });
});
