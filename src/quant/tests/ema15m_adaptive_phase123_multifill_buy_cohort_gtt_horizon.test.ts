import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditOriginalBuyMultiFillGttHorizonReadOnly,
  type OriginalBuyCohortScope,type OriginalBuyCohortEvidence,
  type OriginalBuyCohortReport
} from '../../server/engine/ema15m/adaptiveOriginalBuyMultiFillGttHorizonAudit.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH123-OPTION';
const orderId='PH123-ORIGINAL-BUY';
const exchangeId='PH123-EXCHANGE-ORDER';
const gttId='GTT-PH123-ORIGINAL-SELL';
const buyAt='2026-11-23T03:45:00.000Z';
const reviewAt='2026-11-25T00:00:00.000Z';
const contractExpiry='2027-01-15T00:00:00.000Z';
const micros=(s:string)=>Date.parse(s)*1000;
const scope=(c:Partial<OriginalBuyCohortScope>={}):OriginalBuyCohortScope=>({
  instrumentKey:key,originalBuyOrderId:orderId,
  expectedExchangeOrderId:exchangeId,gttOrderId:gttId,
  product:'NRML',originalQuantity:100,lotSize:50,
  assertedCurrentNetLongQuantity:100,selectedWeeks:4,
  reviewedAtUtc:reviewAt,assertedContractExpiryUtc:contractExpiry,
  ...c
});
const filledOrder=(c:Record<string,unknown>={})=>({
  order_id:orderId,exchange_order_id:exchangeId,
  instrument_token:key,product:'D',transaction_type:'BUY',
  quantity:100,filled_quantity:100,pending_quantity:0,
  average_price:100,status:'COMPLETE',...c
});
const trade=(tid:string,qty:number,price:number,at:string=buyAt,
  c:Record<string,unknown>={})=>({
  trade_id:tid,order_id:orderId,exchange_order_id:exchangeId,
  instrument_token:key,product:'D',transaction_type:'BUY',
  quantity:qty,average_price:price,executedAtUtc:at,...c
});
const gtt=(c:Record<string,unknown>={})=>({
  gtt_order_id:gttId,instrument_token:key,exchange:'NSE_FO',
  product:'D',type:'SINGLE',quantity:100,
  created_at:micros(buyAt),
  expires_at:micros('2026-12-25T00:00:00.000Z'),
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:95,
    status:'SCHEDULED',order_id:null}],...c
});
const evidence=(c:Partial<OriginalBuyCohortEvidence>={}):OriginalBuyCohortEvidence=>({
  originalBuyOrder:filledOrder(),
  orderBook:[filledOrder()],
  originalBuyTrades:[trade('PH123-T1',60,90),trade('PH123-T2',40,115)],
  // 60*90 + 40*115 = 10000 -> weighted average ₹100.
  positions:[{instrument_token:key,product:'D',net_quantity:100}],
  existingSingleSellGtt:gtt(),...c
});
const audit=(s:OriginalBuyCohortScope=scope(),
  e:OriginalBuyCohortEvidence=evidence())=>
  auditOriginalBuyMultiFillGttHorizonReadOnly(s,e);
const safe=(r:OriginalBuyCohortReport)=>{
  for(const flag of [
    'reportedTradeExecutionTimesIndependentlyVerified',
    'buyTradeIdsVenueSignedAndIndependentlyVerified',
    'completeBrokerAccountAndTradeHistoryIndependentlyVerified',
    'brokerReportedNetIndependentlyVerified',
    'historicalGttQuantityContinuityVerified',
    'brokerSellNoShortCloseOnlyPermissionVerified',
    'signedExchangeNativeStopAckVerified',
    'gapExitFillGuaranteed',
    'licensedOptionMarketDataAndEffectiveExpiryVerified',
    'full1To8WeekOosAndFeesApproved',
    'persistentOvernightProtectionCertified',
    'positional1515ForcedSquareOff',
    'automaticPositionClosureAuthorized',
    'duplicateSellRetryAuthorized',
    'realisedPnlWriteAuthorized',
    'liveNrmlBuyAuthorized',
    'brokerOrderOrGttWritesAuthorized'
  ] as const)assert.equal(r[flag],false,flag);
  assert.equal(r.crossIstDateIsNotExchangeCalendar,true);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const serialized=JSON.stringify(r);
  for(const s of [key,orderId,exchangeId,gttId,
    'PH123-PRIVATE-ACCOUNT','PH123-PRIVATE-TOKEN'])
    assert.equal(serialized.includes(s),false);
};
const overlap='EARLIEST_BUY_MULTI_FILL_TEMPORAL_OVERLAP_UNVERIFIED';
describe('Phase123 multi BUY partial fills and original-entry NRML GTT horizon',()=>{
  it('partial fills may be non-lot individually, exact aggregate/WAP and earliest anchor descriptive only',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,overlap);
    assert.equal(r.brokerReportedBuyFillCount,2);
    assert.equal(r.brokerReportedBuyFillQuantity,100);
    assert.equal(r.brokerReportedCurrentNetLong,100);
    assert.equal(r.earliestAssertedBuyFillAtMs,Date.parse(buyAt));
    assert.equal(r.assertedBuyFillSpanMs,0);
    assert.equal(r.firstBuyAnchoredHoldingEndMs,
      Date.parse(buyAt)+4*7*86400000);
    assert.equal(r.reviewRollingHoldingEndMs,
      Date.parse(reviewAt)+4*7*86400000);
    assert.notEqual(r.firstBuyAnchoredHoldingEndMs,
      r.reviewRollingHoldingEndMs);
  });
  it('trade list ordering never changes earliest time or actual fill quantity',()=>{
    const e=evidence();
    const r=audit(scope(),{...e,
      originalBuyTrades:[...e.originalBuyTrades as object[]].reverse()});
    safe(r);assert.equal(r.state,overlap);
    assert.equal(r.earliestAssertedBuyFillAtMs,Date.parse(buyAt));
  });
  it('1/2/4/8W earliest BUY anchor stays fixed; 8W expiry cap wins',()=>{
    for(const weeks of [1,2,4,8] as const){
      const r=audit(scope({selectedWeeks:weeks}));safe(r);
      assert.equal(r.firstBuyAnchoredHoldingEndMs,
        Date.parse(buyAt)+weeks*7*86400000);
      assert.equal(r.state,weeks===8?
        'ASSERTED_OPTION_CONTRACT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END':
        overlap);
    }
  });
  it('invalid NRML scopes, net>original, nonlot and missing order scope fail',()=>{
    for(const c of [
      {instrumentKey:'NSE_EQ|INDEX'},
      {originalBuyOrderId:'invalid id'},
      {expectedExchangeOrderId:''},
      {gttOrderId:'GTT bad'},
      {product:'MIS'},{selectedWeeks:3},{selectedWeeks:0},
      {lotSize:0},{originalQuantity:51},
      {assertedCurrentNetLongQuantity:0},
      {assertedCurrentNetLongQuantity:120},
      {assertedCurrentNetLongQuantity:150},
      {reviewedAtUtc:'2026-11-25'},
      {assertedContractExpiryUtc:'2027-02-30T00:00:00.000Z'}
    ]){
      const r=audit(scope(c as Partial<OriginalBuyCohortScope>));
      safe(r);assert.equal(r.state,'INVALID_NRML_BUY_COHORT_SCOPE');
    }
  });
  it('empty, incomplete or malformed account snapshots reject',()=>{
    for(const c of [
      {originalBuyOrder:null},
      {orderBook:undefined},{positions:null},
      {originalBuyOrder:[]}
    ]){
      const r=audit(scope(),evidence(c));
      safe(r);assert.equal(r.state,
        'BROKER_BUY_ORDER_BOOK_OR_POSITION_EVIDENCE_MISSING');
    }
  });
  it('noncomplete BUY or wrong original quantity/exchange/source rejects',()=>{
    for(const c of [
      {status:'OPEN'},{transaction_type:'SELL'},
      {product:'I'},{exchange_order_id:'WRONG'},
      {order_id:'WRONG'},{instrument_token:'BSE_FO|OTHER'},
      {filled_quantity:90},{pending_quantity:10},
      {quantity:99},{average_price:NaN}
    ]){
      const r=audit(scope(),evidence({originalBuyOrder:filledOrder(c)}));
      safe(r);assert.equal(r.state,
        'BROKER_ORIGINAL_BUY_ORDER_NOT_FULL_AND_EXACT');
    }
  });
  it('order book missing/duplicate/mismatched or partial original BUY rejects',()=>{
    for(const book of [
      [],[filledOrder(),filledOrder()],
      [filledOrder({status:'PENDING'})],
      [filledOrder({exchange_order_id:'WRONG'})],
      [filledOrder({filled_quantity:30})],
      [null],[filledOrder({average_price:101})]
    ]){
      const r=audit(scope(),evidence({orderBook:book}));
      safe(r);assert.equal(r.state,
        'BROKER_ORIGINAL_BUY_ORDERBOOK_DISAGREES');
    }
  });
  it('position net must be unique NRML exact contract and matching remaining long',()=>{
    for(const positions of [
      [],[null],
      [{instrument_token:key,product:'D',net_quantity:50}],
      [{instrument_token:key,product:'D',net_quantity:-100}],
      [{instrument_token:key,product:'D',net_quantity:100},
       {instrument_token:key,product:'D',net_quantity:100}],
      [{instrument_token:key,product:'I',net_quantity:100}]
    ]){
      const r=audit(scope(),evidence({positions}));
      safe(r);assert.equal(r.state,
        'BROKER_NRML_NET_NOT_UNIQUE_OR_INCONSISTENT');
    }
  });
  it('no trade cohort or malformed nonarray rejects, never fabricated empty',()=>{
    for(const originalBuyTrades of [[],null,'missing']){
      const r=audit(scope(),evidence({originalBuyTrades}));
      safe(r);assert.equal(r.state,'BUY_TRADE_COHORT_MISSING_OR_TRUNCATED');
    }
  });
  it('duplicate trade ID, mismatched order, side, key or unknown normalized execution UTC reject',()=>{
    for(const changed of [
      {trade_id:'PH123-T1'},
      {order_id:'OTHER'},
      {exchange_order_id:'OTHER'},
      {instrument_token:'BSE_FO|BAD'},
      {product:'I'},{transaction_type:'SELL'},
      {quantity:0},{average_price:NaN},
      {executedAtUtc:null},
      {executedAtUtc:'2026-11-23T09:15:00+05:30'},
      {executedAtUtc:'2026-11-31T03:45:00.000Z'},
      {executedAtUtc:'2026-11-23T03:45:00Z'}
    ]){
      const r=audit(scope(),evidence({
        originalBuyTrades:[trade('PH123-T1',60,90),
          trade('PH123-T2',40,115,buyAt,changed)]
      }));
      safe(r);assert.equal(r.state,
        'BUY_TRADE_IDENTITY_PRICE_OR_EXECUTED_AT_INVALID');
    }
  });
  it('aggregate BUY fill quantity must equal fully filled original order',()=>{
    const r=audit(scope(),evidence({
      originalBuyTrades:[trade('PH123-T1',60,90),
        trade('PH123-T2',30,115)]
    }));
    safe(r);assert.equal(r.state,'BUY_TRADE_QUANTITY_NOT_CONSERVED');
  });
  it('price-weighted trades inconsistent with original order fail closed',()=>{
    const r=audit(scope(),evidence({
      originalBuyTrades:[trade('PH123-T1',60,50),
        trade('PH123-T2',40,150)]
    }));
    safe(r);assert.equal(r.state,'BUY_TRADE_WEIGHTED_PRICE_DISAGREES');
  });
  it('future fill and over-2100 nominal horizon reject',()=>{
    const future=audit(scope(),evidence({
      originalBuyTrades:[trade('PH123-T1',60,90),
        trade('PH123-T2',40,115,'2026-11-26T00:00:00.000Z')]
    }));
    safe(future);assert.equal(future.state,
      'BUY_FILL_AFTER_REVIEW_OR_HORIZON_OVERFLOW');
    const late='2099-12-25T00:00:00.000Z';
    const r=audit(scope({
      reviewedAtUtc:late,
      assertedContractExpiryUtc:'2099-12-31T00:00:00.000Z'
    }),evidence({
      originalBuyTrades:[trade('PH123-T1',60,90,late),
        trade('PH123-T2',40,115,late)]
    }));
    safe(r);assert.equal(r.state,'BUY_FILL_AFTER_REVIEW_OR_HORIZON_OVERFLOW');
  });
  it('cross-IST-date partial-fill cohort is quarantined, not a single session',()=>{
    const r=audit(scope(),evidence({
      originalBuyTrades:[trade('PH123-T1',60,90),
        trade('PH123-T2',40,115,'2026-11-24T03:45:00.000Z')]
    }));
    safe(r);assert.equal(r.state,
      'BUY_FILLS_SPAN_DIFFERENT_IST_CALENDAR_DATES');
    assert.equal(r.assertedBuyFillSpanMs,86400000);
  });
  it('cross-IST date boundary near midnight is not UTC date boundary',()=>{
    const first='2026-11-23T18:29:59.999Z';
    const second='2026-11-23T18:30:00.000Z'; // 00:00 IST next day
    const r=audit(scope(),evidence({
      originalBuyTrades:[trade('PH123-T1',60,90,first),
        trade('PH123-T2',40,115,second)]
    }));
    safe(r);assert.equal(r.state,
      'BUY_FILLS_SPAN_DIFFERENT_IST_CALENDAR_DATES');
    assert.equal(r.assertedBuyFillSpanMs,1);
  });
  it('wrong GTT exchange/side/net/trigger or parent identity rejects',()=>{
    for(const c of [
      {gtt_order_id:'GTT-OTHER'},
      {instrument_token:'BSE_FO|WRONG'},
      {exchange:'BSE_FO'}, {exchange:null},
      {product:'I'}, {type:'MULTIPLE'},
      {quantity:50},{rules:[]},
      {rules:[{strategy:'ENTRY',transaction_type:'BUY',
        trigger_type:'BELOW',trigger_price:95,
        status:'SCHEDULED',order_id:null}]},
      {rules:[{strategy:'ENTRY',transaction_type:'SELL',
        trigger_type:'BELOW',trigger_price:NaN,
        status:'SCHEDULED',order_id:null}]}
    ]){
      const r=audit(scope(),evidence({existingSingleSellGtt:gtt(c)}));
      safe(r);assert.equal(r.state,'EXISTING_GTT_PARENT_OR_SELL_RULE_MISMATCH');
    }
  });
  it('seconds/ms/ns/reversed and absent broker GTT timestamps reject',()=>{
    for(const c of [
      {created_at:Date.parse(buyAt)},
      {expires_at:Date.parse('2026-12-25T00:00:00.000Z')},
      {created_at:null},
      {created_at:undefined},
      {expires_at:1.8e18},
      {expires_at:micros(buyAt)-1},
      {expires_at:'1800000000000000'}
    ]){
      const r=audit(scope(),evidence({existingSingleSellGtt:gtt(c)}));
      safe(r);assert.equal(r.state,
        'GTT_MICROSECOND_CREATED_OR_EXPIRED_EVIDENCE_INVALID');
    }
  });
  it('created 1 us after review and generated child states quarantine',()=>{
    const r=audit(scope(),evidence({existingSingleSellGtt:gtt({
      created_at:micros(reviewAt)+1
    })}));
    safe(r);assert.equal(r.state,'GTT_CREATED_AFTER_REVIEW_CLOCK');
    for(const status of ['TRIGGERED','FAILED','CANCELLED','COMPLETED']){
      const x=audit(scope(),evidence({existingSingleSellGtt:gtt({
        rules:[{strategy:'ENTRY',transaction_type:'SELL',
          trigger_type:'BELOW',trigger_price:95,
          status,order_id:'PH123-CHILD-SELL'}]
      })}));
      safe(x);assert.equal(x.state,'GTT_NOT_SCHEDULED_OR_CHILD_ALREADY_EXISTS');
    }
  });
  it('original BUY first horizon elapsed even if review-based horizon is fresh',()=>{
    const r=audit(scope({
      reviewedAtUtc:'2026-12-25T00:00:00.000Z'
    }),evidence({existingSingleSellGtt:gtt({
      expires_at:micros('2027-01-12T00:00:00.000Z')
    })}));
    safe(r);assert.equal(r.state,
      'EARLIEST_BUY_HOLDING_WINDOW_ALREADY_ELAPSED');
  });
  it('GTT expired, option expired, contract/horizon undercoverage all distinct',()=>{
    const cases:[OriginalBuyCohortScope,OriginalBuyCohortEvidence,string][]=[
      [scope(),evidence({existingSingleSellGtt:gtt({
        expires_at:micros(reviewAt)
      })}),'GTT_ALREADY_EXPIRED_AT_REVIEW'],
      [scope({assertedContractExpiryUtc:'2026-11-24T00:00:00.000Z'}),
        evidence(),'ASSERTED_OPTION_CONTRACT_ALREADY_EXPIRED'],
      [scope({assertedContractExpiryUtc:'2026-12-20T00:00:00.000Z'}),
        evidence(),'ASSERTED_OPTION_CONTRACT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END'],
      [scope(),evidence({existingSingleSellGtt:gtt({
        expires_at:micros('2026-12-20T00:00:00.000Z')
      })}),'GTT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END'],
      [scope(),evidence({existingSingleSellGtt:gtt({
        expires_at:micros(contractExpiry)+1
      })}),'GTT_EXPIRES_AFTER_ASSERTED_OPTION_EXPIRY']
    ];
    for(const [s,e,state] of cases){
      const r=audit(s,e);safe(r);assert.equal(r.state,state);
    }
  });
  it('GTT pre-exists first fill, in fill span, or after latest fill all quarantined',()=>{
    const before=audit(scope(),evidence({
      existingSingleSellGtt:gtt({created_at:micros(buyAt)-1})
    }));
    safe(before);assert.equal(before.state,
      'GTT_PREEXISTED_FIRST_BUY_ORPHAN_SELL_RISK');
    const atSecond='2026-11-23T03:46:00.000Z';
    const twoFill=evidence({originalBuyTrades:[
      trade('PH123-T1',60,90,buyAt),
      trade('PH123-T2',40,115,atSecond)
    ]});
    const within=audit(scope(),{...twoFill,
      existingSingleSellGtt:gtt({
        created_at:micros('2026-11-23T03:45:30.000Z')
      })
    });
    safe(within);
    assert.equal(within.state,
      'GTT_CREATED_WITHIN_PARTIAL_BUY_FILL_INTERVAL');
    assert.equal(within.firstBuyToGttCreationGapUs,30_000_000);
    const after=audit(scope(),{...twoFill,
      existingSingleSellGtt:gtt({
        created_at:micros('2026-11-23T03:46:00.000Z')+1
      })
    });
    safe(after);assert.equal(after.state,
      'GTT_CREATED_AFTER_LAST_BUY_UNPROTECTED_GAP');
  });
  it('exact matching BSE_FO cohort only descriptive, not a signed broker stop',()=>{
    const bse='BSE_FO|PH123-CONTRACT';
    const p=evidence();
    const a=audit(scope({instrumentKey:bse}),{
      ...p,
      originalBuyOrder:filledOrder({instrument_token:bse}),
      orderBook:[filledOrder({instrument_token:bse})],
      originalBuyTrades:[
        trade('PH123-T1',60,90,buyAt,{instrument_token:bse}),
        trade('PH123-T2',40,115,buyAt,{instrument_token:bse})],
      positions:[{instrument_token:bse,product:'D',net_quantity:100}],
      existingSingleSellGtt:gtt({
        instrument_token:bse,exchange:'BSE_FO'
      })
    });
    safe(a);assert.equal(a.state,overlap);
  });
  it('pure audit has no transport, broker writes, local writes, or live routes',()=>{
    const code=readFileSync(
      'src/server/engine/ema15m/adaptiveOriginalBuyMultiFillGttHorizonAudit.ts',
      'utf8'
    );
    for(const denied of ['fetch(','.placeOrder(','.modifyOrder(',
      '.cancelOrder(','.placeGttOrder(','.cancelGtt(',
      'writeFileSync(','app.post(','server.listen(','Date.now('])
      assert.equal(code.includes(denied),false,denied);
    safe(audit());
  });
});
