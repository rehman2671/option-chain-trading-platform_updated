import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditNativeUpstoxOriginalBuyTradeClockReadOnly,
  parseUpstoxExchangeTradeTimestampAssumedIst,
  type NativeOrderTradeTimeInput,
  type NativeOrderTradeTimeReport
} from '../../server/engine/ema15m/adaptiveUpstoxNativeTradeClockProvenanceReadOnly.js';
import type {
  OriginalBuyCohortScope,OriginalBuyCohortEvidence
} from '../../server/engine/ema15m/adaptiveOriginalBuyMultiFillGttHorizonAudit.js';
import {
  assessEmaLiveProductGate,isMisForcedSquareOffEligible
} from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH124-OPTION-CE';
const orig='PH124-ORIGINAL-BUY';
const ex='PH124-EXCHANGE-ORDER';
const gttId='GTT-PH124-SELL';
const buyAt='2026-11-23T03:45:00.000Z';
const reviewAt='2026-11-25T00:00:00.000Z';
const expiry='2027-01-15T00:00:00.000Z';
const micros=(s:string)=>Date.parse(s)*1000;
const scope=(changes:Partial<OriginalBuyCohortScope>={})
  :OriginalBuyCohortScope=>({
    instrumentKey:key,originalBuyOrderId:orig,
    expectedExchangeOrderId:ex,gttOrderId:gttId,
    product:'NRML',originalQuantity:100,lotSize:50,
    assertedCurrentNetLongQuantity:100,selectedWeeks:4,
    reviewedAtUtc:reviewAt,assertedContractExpiryUtc:expiry,
    ...changes
  });
const order=(changes:Record<string,unknown>={})=>({
  order_id:orig,exchange_order_id:ex,instrument_token:key,
  product:'D',transaction_type:'BUY',quantity:100,
  filled_quantity:100,pending_quantity:0,average_price:100,
  status:'COMPLETE',...changes
});
const gtt=(changes:Record<string,unknown>={})=>({
  gtt_order_id:gttId,exchange:'NSE_FO',
  instrument_token:key,product:'D',type:'SINGLE',quantity:100,
  created_at:micros(buyAt),
  expires_at:micros('2026-12-25T00:00:00.000Z'),
  rules:[{
    strategy:'ENTRY',transaction_type:'SELL',trigger_type:'BELOW',
    trigger_price:95,status:'SCHEDULED',order_id:null
  }],...changes
});
const evidence=(changes:Partial<Omit<
  OriginalBuyCohortEvidence,'originalBuyTrades'>>={})=>({
  originalBuyOrder:order(),orderBook:[order()],
  positions:[{instrument_token:key,product:'D',net_quantity:100}],
  existingSingleSellGtt:gtt(),...changes
});
const trade=(tradeId:string,qty:number,price:number,
  clock='23-Nov-2026 09:15:00',
  changes:Record<string,unknown>={})=>({
    trade_id:tradeId,order_id:orig,exchange_order_id:ex,
    exchange:'NFO',instrument_token:key,product:'D',
    transaction_type:'BUY',quantity:qty,average_price:price,
    exchange_timestamp:clock,
    // Original order placement must NEVER supply execution clock:
    order_timestamp:'22-Nov-2026 15:00:00',
    ...changes
});
const native=(rows:unknown[]=[
  trade('PH124-T1',60,90),trade('PH124-T2',40,115)
],changes:Record<string,unknown>={})=>({
  status:'success',data:rows,...changes
});
const input=(changes:Partial<NativeOrderTradeTimeInput>={})
  :NativeOrderTradeTimeInput=>({
    cohortScope:scope(),cohortEvidence:evidence(),
    perOrderTradeResponse:native(),
    sourceMethod:'GET',sourcePath:'/v2/order/trades',
    captureOrigin:'OPERATOR_CAPTURED_UNVERIFIED',
    exchangeClockAssumption:'ASSUME_ASIA_KOLKATA_UNVERIFIED',
    captureAtUtc:reviewAt,maxCaptureAgeMinutes:15,
    ...changes
});
const audit=(i:NativeOrderTradeTimeInput=input())=>
  auditNativeUpstoxOriginalBuyTradeClockReadOnly(i);
const safe=(r:NativeOrderTradeTimeReport)=>{
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(r.sourceExchangeTimestampGranularity,'SECONDS');
  for(const f of [
    'sourceOrderTimestampUsedAsTradeTime',
    'historicalFoTradeDateUsedAsExactTradeTime',
    'exchangeLocalClockZoneIndependentlyAuthenticated',
    'rawGetResponseAndAccountIndependentlyAuthenticated',
    'sourceClockAndCaptureTimestampIndependentlyAttested',
    'tradeExecutionTimesVenueSignedVerified',
    'originalTradeSetCompleteAcrossDaysVerified',
    'effectiveDatedExchangeSessionCalendarVerified',
    'authenticatedOriginalOptionContractMasterVerified',
    'brokerGttSellProtectedQuantityIndependentlyVerified',
    'exchangeNativeStopAcknowledged',
    'guaranteedGapExitFill',
    'originalBuyHoldingDeadlineBrokerApproved',
    'liveNrmlBuyAuthorized',
    'automaticPositionClosureAuthorized',
    'realisedPnlWriteAuthorized',
    'duplicateSellRetryAuthorized',
    'positional1515ForcedSquareOff'
  ] as const)assert.equal(r[f],false,f);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const serialized=JSON.stringify(r);
  for(const secret of [key,orig,ex,gttId,'PH124-T1','PH124-T2',
    'PH124-PRIVATE-ACCOUNT','PH124-PRIVATE-TOKEN'])
    assert.equal(serialized.includes(secret),false);
};
const ambiguous='GTT_CREATED_IN_UNRESOLVED_EXCHANGE_EXECUTION_SECOND';
describe('Phase124 native per-order trade exchange clock provenance',()=>{
  it('strict manual IST conversion of documented human-readable exchange clock',()=>{
    assert.equal(parseUpstoxExchangeTradeTimestampAssumedIst(
      '23-Nov-2026 09:15:00'),buyAt);
    assert.equal(parseUpstoxExchangeTradeTimestampAssumedIst(
      '03-Aug-2017 15:03:42'),'2017-08-03T09:33:42.000Z');
    assert.equal(parseUpstoxExchangeTradeTimestampAssumedIst(
      '29-Feb-2024 00:00:00'),'2024-02-28T18:30:00.000Z');
    assert.equal(parseUpstoxExchangeTradeTimestampAssumedIst(
      '01-Jan-2026 00:00:00'),'2025-12-31T18:30:00.000Z');
    assert.equal(parseUpstoxExchangeTradeTimestampAssumedIst(
      '31-Dec-2099 23:59:59'),'2099-12-31T18:29:59.000Z');
  });
  it('invalid locale, timezone, leap/day rollover and missing timestamps fail',()=>{
    for(const value of [
      '',null,undefined,42,'23-Nov-2026',
      '23-Nov-2026T09:15:00',
      '23-Nov-2026 09:15:00+05:30',
      '23-Nov-2026 09:15:00Z',
      '2026-11-23T03:45:00.000Z',
      '23-nov-2026 09:15:00',
      '23-NOV-2026 09:15:00',
      '31-Nov-2026 09:15:00',
      '29-Feb-2027 09:15:00',
      '00-Jan-2026 09:15:00',
      '23-Foo-2026 09:15:00',
      '23-Nov-2026 24:00:00',
      '23-Nov-2026 09:60:00',
      '23-Nov-2026 09:15:60',
      '23-Nov-1999 09:15:00',
      '01-Jan-2100 09:15:00',
      '23-Nov-2026 09:15:00.123'
    ])assert.equal(
      parseUpstoxExchangeTradeTimestampAssumedIst(value),null,
      String(value));
  });
  it('valid native partial BUY trades join Phase123 but same-second GTT is never proven after BUY',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,ambiguous);
    assert.equal(r.phase123State,
      'EARLIEST_BUY_MULTI_FILL_TEMPORAL_OVERLAP_UNVERIFIED');
    assert.equal(r.observedTradeCount,2);
    assert.equal(r.observedOriginalBuyQuantity,100);
    assert.equal(r.earliestAssumedTradeAtUtcMs,Date.parse(buyAt));
    assert.equal(r.latestAssumedTradeAtUtcMs,Date.parse(buyAt));
  });
  it('order_timestamp alone or historical date-only cannot provide a fill clock',()=>{
    for(const changes of [
      {exchange_timestamp:undefined},
      {exchange_timestamp:null},
      {exchange_timestamp:'2026-11-23'},
      {exchange_timestamp:'2026-11-23T03:45:00.000Z'},
      {exchange_timestamp:'23-Nov-2026 09:15:00+05:30'},
      {exchange_timestamp:'23-Nov-2026 09:15:00.000'}
    ]){
      const r=audit(input({perOrderTradeResponse:native([
        trade('PH124-T1',60,90,'23-Nov-2026 09:15:00',changes),
        trade('PH124-T2',40,115)
      ])}));safe(r);
      assert.equal(r.state,
        'PER_TRADE_EXCHANGE_TIMESTAMP_MISSING_OR_INVALID');
    }
  });
  it('invalid capture origins/paths/review clocks and unexpected original trade arrays reject',()=>{
    for(const c of [
      {sourceMethod:'POST'},
      {sourcePath:'/v2/order/history'},
      {captureOrigin:'SIGNED_ISSUER'},
      {exchangeClockAssumption:'UTC'},
      {captureAtUtc:'2026-11-25'},
      {captureAtUtc:'2026-11-26T00:00:00.000Z'},
      {captureAtUtc:'2026-11-24T23:40:00.000Z'},
      {maxCaptureAgeMinutes:0},
      {maxCaptureAgeMinutes:31},
      {maxCaptureAgeMinutes:1.5},
      {cohortEvidence:{...evidence(),originalBuyTrades:[]}}
    ]){
      const r=audit(input(c as Partial<NativeOrderTradeTimeInput>));
      safe(r);
      assert.equal(r.state,
        'INVALID_NATIVE_TRADE_CAPTURE_OR_CLOCK_ASSUMPTION');
    }
  });
  it('bad response statuses, absent rows and excessive trade rows reject',()=>{
    for(const perOrderTradeResponse of [
      null,{},native([],{}),native([], {status:'error'}),
      {status:'success',data:null},
      {status:'success',data:Array(5001).fill({})}
    ]){
      const r=audit(input({perOrderTradeResponse}));safe(r);
      assert.equal(r.state,
        'ORDER_TRADES_RESPONSE_MISSING_FAILED_OR_TRUNCATED');
    }
  });
  it('exchange segment is NFO for NSE_FO, not NSE, and trade fields are exact',()=>{
    const variants=[
      {exchange:'NSE'}, {exchange:'BFO'},
      {instrument_token:'BSE_FO|UNRELATED'},
      {order_id:'WRONG'}, {exchange_order_id:'WRONG'},
      {transaction_type:'SELL'}, {product:'I'},
      {quantity:0},{quantity:1.25},
      {average_price:0},{average_price:Infinity},
      {trade_id:'invalid id'}
    ];
    for(const v of variants){
      const r=audit(input({perOrderTradeResponse:native([
        trade('PH124-T1',60,90,'23-Nov-2026 09:15:00',v),
        trade('PH124-T2',40,115)
      ])}));safe(r);
      assert.equal(r.state,
        'PER_TRADE_SOURCE_IDENTITY_EXCHANGE_PRICE_OR_QUANTITY_INVALID');
    }
  });
  it('duplicate raw exchange trade IDs fail instead of dedup guesses',()=>{
    const r=audit(input({perOrderTradeResponse:native([
      trade('PH124-T1',60,90),trade('PH124-T1',40,115)
    ])}));safe(r);
    assert.equal(r.state,'DUPLICATED_NATIVE_BUY_TRADE_ID');
  });
  it('missing or extra partial BUY quantity fails before phase123 normalization',()=>{
    const r=audit(input({perOrderTradeResponse:native([
      trade('PH124-T1',60,90),trade('PH124-T2',30,115)
    ])}));safe(r);
    assert.equal(r.state,'ORDER_TRADES_TOTAL_QUANTITY_INVALID');
    assert.equal(r.phase123State,null);
    assert.equal(r.observedOriginalBuyQuantity,90);
  });
  it('valid raw exchange timestamp after capture is not time travel proof',()=>{
    const r=audit(input({perOrderTradeResponse:native([
      trade('PH124-T1',60,90,'26-Nov-2026 09:15:00'),
      trade('PH124-T2',40,115)
    ])}));safe(r);
    assert.equal(r.state,'TRADE_EXCHANGE_TIME_AFTER_CAPTURE_OR_REVIEW');
  });
  it('Phase123 rejects price differences, net drift, expiry and cross IST dates',()=>{
    const scenarios:[
      Partial<NativeOrderTradeTimeInput>,
      string
    ][]=[
      [{perOrderTradeResponse:native([
        trade('PH124-T1',60,10),
        trade('PH124-T2',40,115)
      ])},'BUY_TRADE_WEIGHTED_PRICE_DISAGREES'],
      [{cohortEvidence:evidence({positions:[{
        instrument_token:key,product:'D',net_quantity:50
      }]})},'BROKER_NRML_NET_NOT_UNIQUE_OR_INCONSISTENT'],
      [{cohortScope:scope({
        assertedContractExpiryUtc:'2026-12-01T00:00:00.000Z'
      })},'ASSERTED_OPTION_CONTRACT_EXPIRES_BEFORE_FIRST_BUY_HOLD_END'],
      [{perOrderTradeResponse:native([
        trade('PH124-T1',60,90,'23-Nov-2026 23:59:59'),
        trade('PH124-T2',40,115,'24-Nov-2026 00:00:00')
      ])},'BUY_FILLS_SPAN_DIFFERENT_IST_CALENDAR_DATES']
    ];
    for(const [changes,expected] of scenarios){
      const r=audit(input(changes));safe(r);
      assert.equal(r.state,'PHASE123_MULTI_FILL_OR_HORIZON_QUARANTINED');
      assert.equal(r.phase123State,expected);
    }
  });
  it('a later-second GTT remains a Phase123 unprotected opening gap',()=>{
    const r=audit(input({cohortEvidence:evidence({
      existingSingleSellGtt:gtt({
        created_at:micros('2026-11-23T03:46:00.000Z')
      })
    })}));safe(r);
    assert.equal(r.state,'PHASE123_MULTI_FILL_OR_HORIZON_QUARANTINED');
    assert.equal(r.phase123State,'GTT_CREATED_AFTER_LAST_BUY_UNPROTECTED_GAP');
  });
  it('matching BFO native BUY still has ambiguous same-second GTT',()=>{
    const bse='BSE_FO|PH124-OTHER';
    const r=audit(input({
      cohortScope:scope({instrumentKey:bse}),
      cohortEvidence:evidence({
        originalBuyOrder:order({instrument_token:bse}),
        orderBook:[order({instrument_token:bse})],
        positions:[{instrument_token:bse,product:'D',net_quantity:100}],
        existingSingleSellGtt:gtt({
          instrument_token:bse,exchange:'BSE_FO'
        })
      }),
      perOrderTradeResponse:native([
        trade('PH124-T1',60,90,'23-Nov-2026 09:15:00',{
          instrument_token:bse,exchange:'BFO'
        }),
        trade('PH124-T2',40,115,'23-Nov-2026 09:15:00',{
          instrument_token:bse,exchange:'BFO'
        })
      ])
    }));safe(r);
    assert.equal(r.state,ambiguous);
  });
  it('not a live API or file pipeline, report never contains raw accounts/tokens',()=>{
    const source=readFileSync(
      'src/server/engine/ema15m/adaptiveUpstoxNativeTradeClockProvenanceReadOnly.ts',
      'utf8'
    );
    for(const forbidden of [
      'fetch(','.placeOrder(','.modifyOrder(','.cancelOrder(',
      '.placeGttOrder(','writeFileSync(','app.post(',
      'server.listen(','Date.now('
    ])assert.equal(source.includes(forbidden),false,forbidden);
    safe(audit());
  });
});
