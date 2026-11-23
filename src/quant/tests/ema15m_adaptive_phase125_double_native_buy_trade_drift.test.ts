import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditDoubleNativeBuyTradeCaptureReadOnly,
  type NativeBuyTradeDoubleCapture,
  type NativeBuyTradeDoubleReport
} from '../../server/engine/ema15m/adaptiveDoubleNativeBuyTradeReadOnlyAudit.js';
import type {NativeOrderTradeTimeInput} from
  '../../server/engine/ema15m/adaptiveUpstoxNativeTradeClockProvenanceReadOnly.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH125-OPTION';
const orderId='PH125-ORIGINAL-BUY';
const exchangeId='PH125-EXCHANGE-ORDER';
const gttId='GTT-PH125-SELL';
const buyAt='2026-11-23T03:45:00.000Z';
const reviewAt='2026-11-25T00:00:05.000Z';
const micros=(s:string)=>Date.parse(s)*1000;
const order=(c:Record<string,unknown>={})=>({
  order_id:orderId,exchange_order_id:exchangeId,
  instrument_token:key,product:'D',transaction_type:'BUY',
  quantity:100,filled_quantity:100,pending_quantity:0,
  average_price:100,status:'COMPLETE',...c
});
const gtt=(c:Record<string,unknown>={})=>({
  gtt_order_id:gttId,exchange:'NSE_FO',instrument_token:key,
  product:'D',type:'SINGLE',quantity:100,created_at:micros(buyAt),
  expires_at:micros('2026-12-25T00:00:00.000Z'),
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:95,
    status:'SCHEDULED',order_id:null}],...c
});
const trade=(tradeId:string,quantity:number,averagePrice:number,
  c:Record<string,unknown>={})=>({
  trade_id:tradeId,order_id:orderId,exchange_order_id:exchangeId,
  instrument_token:key,exchange:'NFO',product:'D',
  transaction_type:'BUY',quantity,average_price:averagePrice,
  exchange_timestamp:'23-Nov-2026 09:15:00',
  order_timestamp:'23-Nov-2026 09:14:55',...c
});
const rows=()=>[
  trade('PH125-T1',60,90),trade('PH125-T2',40,115)
];
const input=(when:string,extra:Partial<NativeOrderTradeTimeInput>={})
  :NativeOrderTradeTimeInput=>({
    cohortScope:{
      instrumentKey:key,originalBuyOrderId:orderId,
      expectedExchangeOrderId:exchangeId,gttOrderId,product:'NRML',
      originalQuantity:100,assertedCurrentNetLongQuantity:100,
      lotSize:50,selectedWeeks:4,reviewedAtUtc:reviewAt,
      assertedContractExpiryUtc:'2027-01-15T00:00:00.000Z'
    },
    cohortEvidence:{
      originalBuyOrder:order(),orderBook:[order()],
      positions:[{instrument_token:key,product:'D',net_quantity:100}],
      existingSingleSellGtt:gtt()
    },
    perOrderTradeResponse:{status:'success',data:rows()},
    sourceMethod:'GET',sourcePath:'/v2/order/trades',
    captureOrigin:'OPERATOR_CAPTURED_UNVERIFIED',
    exchangeClockAssumption:'ASSUME_ASIA_KOLKATA_UNVERIFIED',
    captureAtUtc:when,maxCaptureAgeMinutes:15,...extra
  });
const scope=(
  a:Partial<NativeBuyTradeDoubleCapture>={}
):NativeBuyTradeDoubleCapture=>({
  expectedAccountId:'PH125-ACCOUNT',
  expectedAuthEpoch:'PH125-AUTH-EPOCH',
  maxReadSeparationSeconds:30,
  first:{
    accountId:'PH125-ACCOUNT',authEpoch:'PH125-AUTH-EPOCH',
    requestReceiptId:'PH125-REQ-1',
    input:input('2026-11-25T00:00:01.000Z')
  },
  second:{
    accountId:'PH125-ACCOUNT',authEpoch:'PH125-AUTH-EPOCH',
    requestReceiptId:'PH125-REQ-2',
    input:input('2026-11-25T00:00:03.000Z')
  },
  ...a
});
const audit=(x:NativeBuyTradeDoubleCapture=scope())=>
  auditDoubleNativeBuyTradeCaptureReadOnly(x);
const safe=(r:NativeBuyTradeDoubleReport)=>{
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(r.accountAndAuthEpochCallerAssertedNotVerified,true);
  assert.equal(r.dualSnapshotStabilityDoesNotProveTradeCompleteness,true);
  assert.equal(r.twoSnapshotsAtomic,false);
  for(const name of [
    'sourceRequestReceiptsIndependentlySigned',
    'rawBrokerCaptureIndependentlyAuthenticated',
    'completeTradeHistoryAcrossDaysVerified',
    'originalTradeExecutedAtExactMillisecondVerified',
    'exchangeClockTimezoneIndependentlyVerified',
    'exactOriginalBuyQuantitySignedVerified',
    'currentLongAndNoShortCloseOnlyVerified',
    'officialFuturesOptionCalendarAndExpiryVerified',
    'brokerGttParentStopAcknowledgementVerified',
    'brokerStopChildExchangeAcknowledgementVerified',
    'persistentOvernightProtectionCertified',
    'gapFillGuaranteed','autoClosePositionAuthorized',
    'realisedPnlWriteAuthorized','liveNrmlBuyAuthorized',
    'duplicateSellRetryAuthorized','positional1515SquareOffAuthorized'
  ] as const)assert.equal(r[name],false,name);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const display=JSON.stringify(r);
  for(const secret of [key,orderId,exchangeId,gttId,
    'PH125-ACCOUNT','PH125-AUTH-EPOCH','PH125-REQ-1',
    'PH125-T1','PH125-T2','AUTHORIZATION-SECRET'])
    assert.equal(display.includes(secret),false);
};
const ambiguous='TWO_READS_STABLE_GTT_SAME_SECOND_EXECUTION_UNRESOLVED';
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T;

describe('Phase125 offline dual native BUY trade snapshot drift quarantine',()=>{
  it('two matching independent-shape reads remain UNAUTHENTICATED and same-second ambiguous',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,ambiguous);
    assert.equal(r.firstPhase124State,
      'GTT_CREATED_IN_UNRESOLVED_EXCHANGE_EXECUTION_SECOND');
    assert.equal(r.secondPhase124State,r.firstPhase124State);
    assert.equal(r.observedFirstTradeCount,2);
    assert.equal(r.observedSecondTradeCount,2);
    assert.equal(r.readSeparationMs,2000);
  });
  it('broker response trade order is irrelevant to exact trade set continuity',()=>{
    const x=scope(),changed=clone(x.second);
    (changed.input.perOrderTradeResponse as {data:unknown[]}).data.reverse();
    const r=audit({...x,second:changed});safe(r);
    assert.equal(r.state,ambiguous);
  });
  it('order_timestamp is NOT trade execution time, so can drift without faking a fill',()=>{
    const x=scope(),changed=clone(x.second);
    const v=changed.input.perOrderTradeResponse as {data:Record<string,unknown>[]};
    v.data[0].order_timestamp='22-Nov-2026 12:00:00';
    const r=audit({...x,second:changed});safe(r);
    assert.equal(r.state,ambiguous);
  });
  it('account, auth epoch, identical request ID, unbounded gap scope reject',()=>{
    const x=scope();
    const cases=[
      {expectedAccountId:'wrong'},
      {expectedAuthEpoch:'wrong'},
      {first:{...x.first,accountId:'OTHER-ACCOUNT'}},
      {second:{...x.second,authEpoch:'PH125-CHANGED-AUTH'}},
      {second:{...x.second,requestReceiptId:x.first.requestReceiptId}},
      {first:{...x.first,requestReceiptId:''}},
      {maxReadSeparationSeconds:0},
      {maxReadSeparationSeconds:91},
      {maxReadSeparationSeconds:0.25}
    ];
    for(const c of cases){
      const r=audit({...x,...c});safe(r);
      assert.equal(r.state,'INVALID_EXACT_ACCOUNT_EPOCH_OR_TWO_READ_SCOPE');
    }
  });
  it('reverse, identical, stale or beyond review captures reject',()=>{
    const x=scope();
    const cases=[
      {second:{...x.second,input:{
        ...x.second.input,captureAtUtc:x.first.input.captureAtUtc
      }}},
      {first:{...x.first,input:{
        ...x.first.input,captureAtUtc:'2026-11-25T00:00:04.000Z'
      }}},
      {second:{...x.second,input:{
        ...x.second.input,captureAtUtc:'2026-11-25T00:00:33.000Z'
      }}},
      {second:{...x.second,input:{
        ...x.second.input,captureAtUtc:'2026-11-25T00:00:06.000Z'
      }}},
      {second:{...x.second,input:{
        ...x.second.input,captureAtUtc:'2026-11-25'
      }}}
    ];
    for(const c of cases){
      const r=audit({...x,...c});safe(r);
      assert.equal(r.state,'TWO_NATIVE_READ_CLOCK_SEQUENCE_INVALID');
    }
  });
  it('order, position, current net, GTT or reviewed horizon source drift blocks before favorable clock',()=>{
    const x=scope();
    const variants=[
      {cohortScope:{...x.second.input.cohortScope,
        selectedWeeks:2 as const}},
      {cohortScope:{...x.second.input.cohortScope,
        reviewedAtUtc:'2026-11-25T00:00:06.000Z'}},
      {cohortEvidence:{...x.second.input.cohortEvidence,
        positions:[{instrument_token:key,product:'D',net_quantity:50}]}},
      {cohortEvidence:{...x.second.input.cohortEvidence,
        existingSingleSellGtt:gtt({
          expires_at:micros('2026-12-26T00:00:00.000Z')})}},
      {cohortEvidence:{...x.second.input.cohortEvidence,
        orderBook:[order({filled_quantity:50})]}},
      {sourcePath:'/v2/order/history' as const},
      {exchangeClockAssumption:'OTHER' as const},
      {maxCaptureAgeMinutes:30}
    ];
    for(const v of variants){
      const second=clone(x.second);
      second.input={...second.input,
        ...v as Partial<NativeOrderTradeTimeInput>};
      const r=audit({...x,second});safe(r);
      assert.equal(r.state,'ORIGINAL_BUY_POSITION_GTT_OR_REVIEW_CONTEXT_DRIFT');
    }
  });
  it('absent, failed and malformed broker-trade responses reject without empty proof',()=>{
    const x=scope();
    for(const response of [
      null,{},[],{status:'error',data:rows()},
      {status:'success',data:[]},
      {status:'success',data:null},
      {status:'success',data:[null]},
      {status:'success',data:Array(5001).fill({})}
    ]){
      const r=audit({...x,second:{...x.second,
        input:{...x.second.input,perOrderTradeResponse:response}
      }});
      safe(r);assert.equal(r.state,
        'BROKER_TRADE_RESPONSE_MISSING_MALFORMED_OR_OVERSIZED');
    }
  });
  it('duplicate raw trade ids in EITHER captured pass reject',()=>{
    const x=scope();
    const dup={status:'success',data:[
      trade('PH125-T1',60,90),trade('PH125-T1',40,115)]};
    for(const side of ['first','second'] as const){
      const c=clone(x);
      c[side].input.perOrderTradeResponse=dup;
      const r=audit(c);safe(r);
      assert.equal(r.state,'NATIVE_TRADE_ID_DUPLICATE_OR_UNBOUNDED');
    }
  });
  it('missing, added or substituted original trade IDs reject without averaging reconciliation',()=>{
    const x=scope();
    for(const next of [
      [trade('PH125-T1',60,90)],
      [...rows(),trade('PH125-T3',1,1)],
      [trade('PH125-T1',60,90),trade('PH125-T3',40,115)]
    ]){
      const second=clone(x.second);
      second.input.perOrderTradeResponse={status:'success',data:next};
      const r=audit({...x,second});safe(r);
      assert.equal(r.state,'TRADE_ID_SET_MISSING_ADDED_OR_CHANGED');
    }
  });
  it('same trade ID with changed quantity, premium, execution clock, side or contract rejects',()=>{
    const x=scope();
    const corruptions=[
      {quantity:59},{average_price:90.01},
      {exchange_timestamp:'23-Nov-2026 09:15:01'},
      {transaction_type:'SELL'},
      {instrument_token:'BSE_FO|FORGED'},
      {exchange:'BFO'},
      {order_id:'PH125-WRONG-ORDER'},
      {exchange_order_id:'PH125-WRONG-EXCHANGE'},
      {product:'I'},
      {exchange_timestamp:null}
    ];
    for(const drift of corruptions){
      const second=clone(x.second);
      (second.input.perOrderTradeResponse as
        {data:Record<string,unknown>[]}).data[0]={
          ...(second.input.perOrderTradeResponse as
            {data:Record<string,unknown>[]}).data[0],...drift
        };
      const r=audit({...x,second});safe(r);
      assert.equal(r.state,
        'ORIGINAL_BUY_TRADE_IDENTITY_PRICE_QUANTITY_OR_CLOCK_DRIFT');
    }
  });
  it('two consistent broken timestamps still fail Phase124 checks',()=>{
    const x=scope(),broken=clone(x);
    for(const pass of [broken.first,broken.second]){
      (pass.input.perOrderTradeResponse as
        {data:Record<string,unknown>[]}).data[0].exchange_timestamp=
          '2026-11-23T03:45:00.000Z';
    }
    const r=audit(broken);safe(r);
    assert.equal(r.state,'PHASE124_SOURCE_TIME_OR_NRML_REVIEW_QUARANTINED');
    assert.equal(r.firstPhase124State,
      'PER_TRADE_EXCHANGE_TIMESTAMP_MISSING_OR_INVALID');
    assert.equal(r.secondPhase124State,r.firstPhase124State);
  });
  it('two consistent earlier live net contradictions remain Phase123 quarantined',()=>{
    const x=scope(),broken=clone(x);
    for(const pass of [broken.first,broken.second]){
      pass.input.cohortEvidence={
        ...pass.input.cohortEvidence,
        positions:[{instrument_token:key,product:'D',net_quantity:50}]
      };
    }
    const r=audit(broken);safe(r);
    assert.equal(r.state,'PHASE124_SOURCE_TIME_OR_NRML_REVIEW_QUARANTINED');
    assert.equal(r.firstPhase124State,
      'PHASE123_MULTI_FILL_OR_HORIZON_QUARANTINED');
  });
  it('upstream cyclic, oversized and untrusted object inputs fail closed without throws',()=>{
    const x=scope(),a=clone(x);
    const cyclic:Record<string,unknown>={};
    cyclic.self=cyclic;
    a.second.input.cohortEvidence={
      ...a.second.input.cohortEvidence,positions:[cyclic]
    };
    const r=audit(a);safe(r);
    assert.equal(r.state,'ORIGINAL_BUY_POSITION_GTT_OR_REVIEW_CONTEXT_DRIFT');
    const huge=clone(x);
    huge.second.input.cohortEvidence={
      ...huge.second.input.cohortEvidence,
      unexpectedPayload:'X'.repeat(251000)
    };
    const r2=audit(huge);safe(r2);
    assert.equal(r2.state,'ORIGINAL_BUY_POSITION_GTT_OR_REVIEW_CONTEXT_DRIFT');
  });
  it('code is pure: no real broker reads/writes, network, storage or route',()=>{
    const code=readFileSync(
      'src/server/engine/ema15m/adaptiveDoubleNativeBuyTradeReadOnlyAudit.ts',
      'utf8'
    );
    for(const forbidden of [
      'fetch(','.getOrderTrades(','.getOrderBook(',
      '.placeOrder(','.cancelOrder(','.placeGttOrder(',
      'writeFileSync(','app.post(','server.listen(','Date.now('
    ])assert.equal(code.includes(forbidden),false,forbidden);
    safe(audit());
  });
});
