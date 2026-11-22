import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditGttNrmlSelectedHorizonExpiry,
  validUpstoxGttTimeFieldsIfPresent,
  type GttHorizonAuditScope,type GttHorizonAuditReport
} from '../../server/engine/ema15m/adaptiveNrmlGttExpiryHorizonReadOnlyAudit.js';
import {guardExactBrokerGttGet,guardFullBrokerGttList}
  from '../../server/engine/ema15m/adaptiveUpstoxNativeReadCardinalityGuard.js';
import {UpstoxProvider} from '../../server/engine/providers/UpstoxProvider.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const fakeAccount='PH121-FAKE-PRIVATE-ACCOUNT';
const fakeToken='PH121-NO-REAL-BEARER-TOKEN';
const key='NSE_FO|PH121-OPTION-CONTRACT';
const gttId='GTT-PH121-SINGLE-SELL';
const asOf='2026-11-23T00:00:00.000Z';
const expiry='2027-01-31T15:30:00.000Z';
const micros=(iso:string)=>Date.parse(iso)*1000;
const scope=(n:1|2|4|8=8):GttHorizonAuditScope=>({
  instrumentKey:key,gttOrderId:gttId,product:'NRML',
  selectedWeeks:n,reviewedAtUtc:asOf,expectedContractExpiryUtc:expiry
});
const parent=(change:Record<string,unknown>={})=>({
  gtt_order_id:gttId,type:'SINGLE',product:'D',
  instrument_token:key,exchange:'NSE_FO',quantity:100,
  trading_symbol:'NIFTY27JAN27000CE',
  created_at:micros('2026-11-20T00:00:00.000Z'),
  expires_at:micros(expiry),
  rules:[{strategy:'ENTRY',status:'SCHEDULED',
    transaction_type:'SELL',trigger_type:'BELOW',
    trigger_price:90,order_id:null}],...change
});
const audit=(p:unknown=parent(),s=scope())=>
  auditGttNrmlSelectedHorizonExpiry(s,p);
const safe=(r:GttHorizonAuditReport)=>{
  for(const k of [
    'assertedContractExpiryIndependentlyVerified',
    'clockSourceIndependentlyAttested',
    'actualOptionsContractMasterAndLotVerified',
    'exchangeNativeStopAckVerified',
    'noShortCloseOnlyBrokerPermissionVerified',
    'persistentOvernightStopCoverageCertified',
    'futureGapExitExecutionGuaranteed',
    'independentlySignedOptionTradesVerified',
    'realisedPnlWriteAuthorized',
    'automaticPositionClosureAuthorized',
    'duplicateSellRetryAuthorized',
    'liveNrmlBuyAuthorized'
  ] as const)assert.equal(r[k],false,k);
  assert.equal(r.brokerTimestampIsNotExchangeCalendar,true);
  assert.equal(r.nominalWeeksAreNotExchangeSessions,true);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const serialized=JSON.stringify(r);
  for(const v of [fakeAccount,fakeToken,key,gttId,
    'NIFTY27JAN27000CE','PH121-EXCHANGE-ORDER'])
    assert.equal(serialized.includes(v),false);
};
const expected='BROKER_REPORTED_GTT_HORIZON_OVERLAP_NOT_PROTECTIVE_STOP';
describe('Phase121 microsecond broker GTT vs nominal 1/2/4/8W option horizon',()=>{
  it('exact microseconds vs selected 8W and asserted later contract expiry = descriptive only',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,expected);
    assert.equal(r.selectedWeeks,8);
    assert.equal(r.gttTimestampUnitsVerifiedAsMicroseconds,true);
    assert.equal(r.brokerReportedGttExpiresAtMs,Date.parse(expiry));
    assert.equal(r.brokerReportedGttCreatedAtMs,
      Date.parse('2026-11-20T00:00:00.000Z'));
    assert.equal(r.nominalHoldingEndAtMs,
      Date.parse(asOf)+8*7*86400000);
  });
  it('1W, 2W, 4W and 8W allowed only as nominal calendar weeks',()=>{
    for(const n of [1,2,4,8] as const){
      const r=audit(parent(),scope(n));safe(r);
      assert.equal(r.state,expected);
      assert.equal(r.selectedWeeks,n);
      assert.equal(r.nominalWeeksAreNotExchangeSessions,true);
    }
  });
  it('FAILED, EXPIRED, CANCELLED or triggered child cannot look like current scheduled GTT',()=>{
    for(const change of [
      {status:'FAILED',order_id:null},
      {status:'CANCELLED',order_id:null},
      {status:'EXPIRED',order_id:null},
      {status:'PENDING',order_id:null},
      {status:'TRIGGERED',order_id:'PH121-GENERATED-SELL'},
      {status:'OPEN',order_id:'PH121-GENERATED-SELL'},
      {status:'COMPLETED',order_id:'PH121-GENERATED-SELL'},
      {status:'SCHEDULED',order_id:'PH121-GENERATED-SELL'},
      {status:'',order_id:null}
    ]){
      const p=parent({rules:[{
        strategy:'ENTRY',status:change.status,
        transaction_type:'SELL',trigger_type:'BELOW',
        trigger_price:90,order_id:change.order_id
      }]});
      const r=audit(p);safe(r);
      assert.equal(r.state,
        'BROKER_GTT_RULE_NOT_SCHEDULED_OR_ALREADY_GENERATED');
      assert.equal(r.persistentOvernightStopCoverageCertified,false);
    }
  });
  it('Upstox seconds, milliseconds, nanoseconds and reversed clocks are rejected',()=>{
    for(const p of [
      parent({created_at:Math.floor(micros('2026-11-20T00:00:00.000Z')/1000)}),
      parent({expires_at:Date.parse(expiry)}),
      parent({expires_at:1.8e18}),
      parent({created_at:micros(expiry)+1000}),
      parent({created_at:null}),
      parent({expires_at:'1790000000000000'}),
      parent({created_at:NaN}),
      parent({expires_at:Infinity}),
      parent({created_at:0})
    ]){
      const r=audit(p);safe(r);
      assert.equal(r.state,
        'MICROSECOND_GTT_CREATED_EXPIRES_EVIDENCE_MISSING_OR_INVALID');
      assert.equal(validUpstoxGttTimeFieldsIfPresent(p),false);
    }
  });
  it('GTT missing one timestamp is not a fabricated timestamp pair',()=>{
    for(const item of [
      {created_at:undefined}, {expires_at:undefined}
    ]){
      const p=parent(item),r=audit(p);
      safe(r);
      assert.equal(r.state,
        'MICROSECOND_GTT_CREATED_EXPIRES_EVIDENCE_MISSING_OR_INVALID');
    }
    // Missing both fields can be retained as an unverified legacy GET
    // source shape, but is never usable as expiry evidence.
    const p=parent();
    delete (p as Record<string,unknown>).created_at;
    delete (p as Record<string,unknown>).expires_at;
    assert.equal(validUpstoxGttTimeFieldsIfPresent(p),true);
    const r=audit(p);safe(r);
    assert.equal(r.state,
      'MICROSECOND_GTT_CREATED_EXPIRES_EVIDENCE_MISSING_OR_INVALID');
  });
  it('invalid option/GTT scope, forbidden product or unsupported weeks fail closed',()=>{
    for(const change of [
      {instrumentKey:'NSE_EQ|PH121-SCRIP'},
      {instrumentKey:'BSE_EQ|PH121-EQUITY'},
      {gttOrderId:'OTHER'},
      {gttOrderId:''}, {product:'MIS'}, {product:'I'},
      {selectedWeeks:3},{selectedWeeks:0},{selectedWeeks:16}
    ]){
      const r=audit(parent(),{...scope(),...change} as GttHorizonAuditScope);
      safe(r);
      assert.equal(r.state,'INVALID_OPTION_HORIZON_OR_SCOPE');
    }
  });
  it('wrong GTT ID, option product/type, rule side or trigger are rejected',()=>{
    for(const change of [
      {gtt_order_id:'GTT-PH121-OTHER'},
      {instrument_token:'NSE_FO|PH121-OTHER'},
      {product:'I'}, {type:'MULTIPLE'}, {quantity:0},
      {rules:[]},{rules:[{
        strategy:'ENTRY',transaction_type:'BUY',trigger_type:'BELOW'
      }]},
      {rules:[{
        strategy:'STOPLOSS',transaction_type:'SELL',trigger_type:'BELOW'
      }]},
      {rules:[{
        strategy:'ENTRY',transaction_type:'SELL',trigger_type:'ABOVE'
      }]}
    ]){
      const r=audit(parent(change));safe(r);
      assert.equal(r.state,'GTT_PARENT_ABSENT_OR_WRONG_IDENTITY');
    }
  });
  it('malformed or non-canonical UTC contract-expiry strings are untrusted',()=>{
    for(const val of [
      '', '2027-01-31', '2027-01-31T15:30:00Z',
      '2027-01-31T21:00:00.000+05:30',
      '2027-02-30T15:30:00.000Z',
      '2027-01-31T15:30:00.001+00:00'
    ]){
      const r=audit(parent(),{
        ...scope(),expectedContractExpiryUtc:val
      });safe(r);
      assert.equal(r.state,
        'CONTRACT_EXPIRY_CALENDAR_INPUT_MISSING_OR_INVALID');
    }
  });
  it('invalid review timestamp or future-created broker parent cannot certify current',()=>{
    for(const at of [
      'bad','2026-11-22','2026-11-19T00:00:00.000Z',
      '2027-02-30T00:00:00.000Z'
    ]){
      const r=audit(parent(),{...scope(),reviewedAtUtc:at});safe(r);
      assert.equal(r.state,
        'REVIEW_CLOCK_INVALID_OR_BEFORE_BROKER_CREATION');
    }
  });
  it('review at or after microsecond GTT expiry is already expired',()=>{
    for(const at of [
      '2027-01-31T15:30:00.000Z',
      '2027-02-01T00:00:00.000Z'
    ]){
      const r=audit(parent(),{...scope(),reviewedAtUtc:at});safe(r);
      assert.equal(r.state,'BROKER_GTT_ALREADY_EXPIRED_AT_REVIEW');
    }
  });
  it('option expiry before selected 8W holding end blocks chosen contract',()=>{
    const r=audit(parent(),{
      ...scope(),expectedContractExpiryUtc:'2027-01-10T15:30:00.000Z'
    });safe(r);
    assert.equal(r.state,'ASSERTED_FO_CONTRACT_EXPIRES_BEFORE_HOLD_END');
  });
  it('broker GTT expires before 8W even if option contract lasts longer',()=>{
    const r=audit(parent({
      expires_at:micros('2027-01-10T15:30:00.000Z')
    }));safe(r);
    assert.equal(r.state,'BROKER_GTT_EXPIRES_BEFORE_HOLD_END');
  });
  it('broker GTT expiry beyond the asserted contract expiry is inconsistent',()=>{
    const r=audit(parent({
      expires_at:micros('2027-02-01T15:30:00.000Z')
    }));safe(r);
    assert.equal(r.state,'BROKER_GTT_EXPIRES_AFTER_ASSERTED_CONTRACT_EXPIRY');
  });
  it('favorable overlap is STILL not authenticated calendar or protective STOP ACK',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,expected);
    assert.equal(r.persistentOvernightStopCoverageCertified,false);
    assert.equal(r.exchangeNativeStopAckVerified,false);
    assert.equal(r.futureGapExitExecutionGuaranteed,false);
  });
  it('GTT GET ingress rejects mixed seconds/ms/invalid microsecond pair, not empty account',()=>{
    for(const change of [
      {created_at:1234567890},
      {expires_at:Date.parse(expiry)},
      {expires_at:micros('2026-11-18T00:00:00.000Z')},
      {expires_at:'1234567890000000'},
      {created_at:null}
    ]){
      const p=parent(change);
      assert.equal(guardExactBrokerGttGet([p],gttId),null);
      assert.equal(guardFullBrokerGttList([p]),null);
    }
    assert.deepEqual(guardExactBrokerGttGet([parent()],gttId),[parent()]);
    assert.deepEqual(guardFullBrokerGttList([parent()]),[parent()]);
  });
  it('actual UpstoxProvider exact/list GET pass good timestamps and reject wrong units',async()=>{
    const old=globalThis.fetch;
    const p=new UpstoxProvider();
    Object.assign(p as unknown as object,{
      isConnected:true,accessToken:fakeToken,userId:fakeAccount,
      historicalFoAuthEpoch:7
    });
    let raw:unknown=parent();
    let count=0;
    globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      count++;
      assert.equal(init?.method??'GET','GET');
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(new Headers(init?.headers).get('Authorization'),
        'Bearer '+fakeToken);
      return new Response(JSON.stringify({status:'success',data:[raw]}),{
        status:200,headers:{'Content-Type':'application/json'}
      });
    }) as typeof fetch;
    try{
      assert.deepEqual(await p.getGttOrderDetails(gttId),[parent()]);
      assert.deepEqual(await p.getGttOrders(),[parent()]);
      raw=parent({expires_at:Date.parse(expiry)});
      assert.equal(await p.getGttOrderDetails(gttId),null);
      assert.equal(await p.getGttOrders(),null);
      assert.equal(count,4);
    }finally{globalThis.fetch=old;}
    safe(audit());
  });
  it('pure audit has no network access, public webhook route, order or local writes',()=>{
    const src=readFileSync(
      'src/server/engine/ema15m/adaptiveNrmlGttExpiryHorizonReadOnlyAudit.ts','utf8'
    );
    for(const x of ['fetch(','.placeOrder(','.cancelOrder(',
      '.placeGttOrder(','.modifyOrder(','writeFileSync(',
      'app.post(','server.listen(','Date.now('])
      assert.equal(src.includes(x),false,x);
    safe(audit());
  });
});
