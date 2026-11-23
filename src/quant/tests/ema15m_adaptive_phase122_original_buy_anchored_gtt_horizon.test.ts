import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditOriginalBuyAnchoredGttHorizonReadOnly,
  type OriginalBuyAnchoredGttScope,
  type OriginalBuyAnchoredGttReport
} from '../../server/engine/ema15m/adaptiveNrmlOriginalBuyAnchoredGttHorizonAudit.js';
import {auditGttNrmlSelectedHorizonExpiry} from
  '../../server/engine/ema15m/adaptiveNrmlGttExpiryHorizonReadOnlyAudit.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const option='NSE_FO|PH122-OPTION-CONTRACT';
const gttId='GTT-PH122-SINGLE-SELL';
const buyAt='2026-11-23T00:00:00.000Z';
const reviewAt='2026-11-30T00:00:00.000Z';
const expiry='2027-01-15T15:30:00.000Z';
const micros=(iso:string)=>Date.parse(iso)*1000;
const scope=(
  changes:Partial<OriginalBuyAnchoredGttScope>={}
):OriginalBuyAnchoredGttScope=>({
  instrumentKey:option,gttOrderId:gttId,
  originalBuyOrderId:'PH122-ORIGINAL-BUY',product:'NRML',
  selectedWeeks:4,assertedOriginalBuyFillCount:1,
  assertedOriginalBuyQuantity:100,assertedLotSize:50,
  assertedCurrentNetLongQuantity:100,
  assertedOriginalBuyExecutedAtUtc:buyAt,
  reviewedAtUtc:reviewAt,assertedContractExpiryUtc:expiry,
  ...changes
});
const parent=(changes:Record<string,unknown>={})=>({
  gtt_order_id:gttId,instrument_token:option,
  exchange:'NSE_FO',product:'D',type:'SINGLE',
  quantity:100,created_at:micros(buyAt),
  expires_at:micros('2026-12-24T00:00:00.000Z'),
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:95,
    status:'SCHEDULED',order_id:null}],
  ...changes
});
const audit=(s:OriginalBuyAnchoredGttScope=scope(),
  p:unknown=parent())=>
  auditOriginalBuyAnchoredGttHorizonReadOnly(s,p);
const safe=(r:OriginalBuyAnchoredGttReport)=>{
  for(const k of [
    'originalBuyExecutionIndependentlyVerified',
    'exactBuyFillCohortAndAccountIndependentlyVerified',
    'currentNetLongIndependentlyVerified',
    'assertedContractExpiryIndependentlyVerified',
    'clockSourceIndependentlyAttested',
    'gttAccountWideContinuityVerified',
    'specificOptionGttSellEligibleVerified',
    'exchangeNativeStopAckVerified',
    'persistentOvernightProtectionCertified',
    'futureGapFillGuaranteed','positional1515ForcedSquareOff',
    'duplicateSellAuthorized','brokerOrderGttWriteAuthorized',
    'autoPositionClosureAuthorized','realisedPnlWriteAuthorized',
    'liveNrmlBuyAuthorized'
  ] as const)assert.equal(r[k],false,k);
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const str=JSON.stringify(r);
  for(const secret of [option,gttId,'PH122-ORIGINAL-BUY',
    'PH122-PRIVATE-ACCOUNT','FAKE-BEARER-TOKEN'])
    assert.equal(str.includes(secret),false);
};
const overlap='ORIGINAL_BUY_ANCHORED_TEMPORAL_OVERLAP_NO_NATIVE_STOP';

describe('Phase122 exact original BUY anchored positional horizon quarantine',()=>{
  it('same original BUY time anchors 4W horizon; review-time rolling is different',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,overlap);
    assert.equal(r.originalBuyAnchoredHoldEndMs,
      micros('2026-12-21T00:00:00.000Z')/1000);
    assert.equal(r.rollingReviewAnchoredHoldEndMs,
      micros('2026-12-28T00:00:00.000Z')/1000);
    assert.notEqual(r.originalBuyAnchoredHoldEndMs,
      r.rollingReviewAnchoredHoldEndMs);
    assert.equal(r.assertedOriginalBuyAtMs,Date.parse(buyAt));
    assert.equal(r.brokerGttCreatedAtUs,micros(buyAt));
  });
  it('Phase121 planned from review may flag undercoverage, NOT original BUY horizon',()=>{
    const old=auditGttNrmlSelectedHorizonExpiry({
      instrumentKey:option,gttOrderId:gttId,product:'NRML',
      selectedWeeks:4,reviewedAtUtc:reviewAt,
      expectedContractExpiryUtc:expiry
    },parent());
    assert.equal(old.state,'BROKER_GTT_EXPIRES_BEFORE_HOLD_END');
    const r=audit();safe(r);
    assert.equal(r.state,overlap);
  });
  it('1/2/4/8 nominal calendar weeks always anchored to original BUY',()=>{
    for(const weeks of [1,2,4,8] as const){
      const r=audit(scope({
        selectedWeeks:weeks,
        reviewedAtUtc:'2026-11-24T00:00:00.000Z',
        assertedContractExpiryUtc:'2027-03-01T00:00:00.000Z'
      }),parent({
        expires_at:micros('2027-03-02T00:00:00.000Z')
      }));
      safe(r);
      // GTT expiry after asserted contract expiry is still rejected
      assert.equal(r.state,
        'BROKER_GTT_EXPIRES_AFTER_ASSERTED_CONTRACT_EXPIRY');
      assert.equal(r.originalBuyAnchoredHoldEndMs,
        Date.parse(buyAt)+weeks*7*86400000);
    }
    for(const weeks of [1,2,4,8] as const){
      const r=audit(scope({selectedWeeks:weeks,
        reviewedAtUtc:'2026-11-24T00:00:00.000Z',
        assertedContractExpiryUtc:'2027-03-01T00:00:00.000Z'
      }),parent({expires_at:micros('2027-02-15T00:00:00.000Z')}));
      safe(r);
      assert.equal(r.state,overlap);
    }
  });
  it('later valid review does NOT reset original BUY deadline',()=>{
    const r=audit(scope({reviewedAtUtc:'2026-12-05T00:00:00.000Z'}));
    safe(r);
    assert.equal(r.state,overlap);
    assert.equal(r.originalBuyAnchoredHoldEndMs,
      Date.parse('2026-12-21T00:00:00.000Z'));
    assert.equal(r.rollingReviewAnchoredHoldEndMs,
      Date.parse('2027-01-02T00:00:00.000Z'));
  });
  it('after original end, a future 4W rolling review is NOT a fresh holding',()=>{
    const r=audit(scope({reviewedAtUtc:'2026-12-23T00:00:00.000Z'}));
    safe(r);
    assert.equal(r.state,'ORIGINAL_ENTRY_HOLDING_WINDOW_ALREADY_ELAPSED');
    assert.equal(r.originalBuyAnchoredHoldEndMs,
      Date.parse('2026-12-21T00:00:00.000Z'));
  });
  it('wrong original BUY scope, unsupported horizon, extra fill/averaging and lots fail',()=>{
    for(const change of [
      {instrumentKey:'NSE_EQ|STOCK'},
      {gttOrderId:'SOMETHING-ELSE'},
      {originalBuyOrderId:'not valid id'},
      {product:'MIS'},{selectedWeeks:3},{selectedWeeks:0},
      {assertedOriginalBuyFillCount:0},
      {assertedOriginalBuyFillCount:2},
      {assertedOriginalBuyQuantity:0},
      {assertedLotSize:0},
      {assertedOriginalBuyQuantity:110},
      {assertedCurrentNetLongQuantity:0},
      {assertedCurrentNetLongQuantity:125},
      {assertedCurrentNetLongQuantity:150}
    ]){
      const r=audit(scope(change as Partial<OriginalBuyAnchoredGttScope>));
      safe(r);
      assert.equal(r.state,'INVALID_ORIGINAL_BUY_OPTION_OR_QUANTITY_SCOPE');
    }
  });
  it('unknown, impossible or noncanonical original/review/contract UTC fail',()=>{
    for(const change of [
      {assertedOriginalBuyExecutedAtUtc:''},
      {assertedOriginalBuyExecutedAtUtc:'2026-11-23T00:00:00Z'},
      {assertedOriginalBuyExecutedAtUtc:'2026-11-31T00:00:00.000Z'},
      {assertedOriginalBuyExecutedAtUtc:'2026-11-23T05:30:00.000+05:30'},
      {reviewedAtUtc:'2026-11-30'},
      {reviewedAtUtc:'not a time'},
      {assertedContractExpiryUtc:'2027-02-30T15:30:00.000Z'},
      {assertedContractExpiryUtc:'2027-01-15'},
      {assertedContractExpiryUtc:'2027-01-15T15:30:00Z'}
    ]){
      const r=audit(scope(change));safe(r);
      assert.equal(r.state,'ORIGINAL_BUY_REVIEW_OR_CONTRACT_UTC_INVALID');
    }
  });
  it('future asserted original BUY and arithmetic beyond year 2100 fail closed',()=>{
    const a=audit(scope({reviewedAtUtc:'2026-11-22T00:00:00.000Z'}));
    safe(a);
    assert.equal(a.state,'ORIGINAL_BUY_IN_FUTURE_OR_HORIZON_OVERFLOW');
    const b=audit(scope({
      assertedOriginalBuyExecutedAtUtc:'2099-12-31T00:00:00.000Z',
      reviewedAtUtc:'2099-12-31T00:00:00.000Z',
      assertedContractExpiryUtc:'2099-12-31T15:30:00.000Z'
    }));
    safe(b);
    assert.equal(b.state,'ORIGINAL_BUY_IN_FUTURE_OR_HORIZON_OVERFLOW');
  });
  it('wrong broker option/exchange, product, net, rule, trigger or parent rejected',()=>{
    for(const change of [
      {gtt_order_id:'GTT-WRONG'},
      {instrument_token:'BSE_FO|OTHER'},
      {exchange:'BSE_FO'},{exchange:null},
      {product:'I'},{type:'MULTIPLE'},{quantity:50},
      {rules:[]},{rules:[
        {strategy:'ENTRY',transaction_type:'BUY',
          trigger_type:'BELOW',trigger_price:95,
          status:'SCHEDULED',order_id:null}
      ]},
      ...[null,NaN,Infinity,0,-1,'95'].map(trigger_price=>({
        rules:[{strategy:'ENTRY',transaction_type:'SELL',
          trigger_type:'BELOW',trigger_price,
          status:'SCHEDULED',order_id:null}]
      }))
    ]){
      const r=audit(scope(),parent(change));safe(r);
      assert.equal(r.state,'BROKER_GTT_PARENT_SCOPE_OR_RULE_MISMATCH');
    }
  });
  it('microseconds required, reject seconds, ms, ns, missing and reversed',()=>{
    for(const change of [
      {created_at:Date.parse(buyAt)},
      {expires_at:Date.parse('2026-12-24T00:00:00.000Z')},
      {expires_at:1.9e18},
      {created_at:null},{created_at:undefined},
      {expires_at:'1790000000000000'},
      {expires_at:micros('2026-11-20T00:00:00.000Z')},
      {expires_at:NaN}
    ]){
      const r=audit(scope(),parent(change));safe(r);
      assert.equal(r.state,'BROKER_GTT_MICROSECOND_EVIDENCE_INVALID');
    }
  });
  it('even 1 us after review is future creation, no floor-to-ms bypass',()=>{
    const revUs=micros(reviewAt);
    const r=audit(scope(),parent({created_at:revUs+1}));
    safe(r);
    assert.equal(r.state,'BROKER_GTT_CREATED_AFTER_REVIEW');
  });
  it('triggered, failed or generated-child SELL cannot appear scheduled',()=>{
    for(const status of ['TRIGGERED','CANCELLED','FAILED','COMPLETED']){
      const r=audit(scope(),parent({rules:[{
        strategy:'ENTRY',transaction_type:'SELL',trigger_type:'BELOW',
        trigger_price:95,status,order_id:'GENERATED-SELL'
      }]}));safe(r);
      assert.equal(r.state,'BROKER_GTT_NOT_SCHEDULED_OR_CHILD_EXISTS');
    }
    const r=audit(scope(),parent({rules:[{
      strategy:'ENTRY',transaction_type:'SELL',trigger_type:'BELOW',
      trigger_price:95,status:'SCHEDULED',order_id:'ORPHAN-SELL'
    }]}));safe(r);
    assert.equal(r.state,'BROKER_GTT_NOT_SCHEDULED_OR_CHILD_EXISTS');
  });
  it('GTT expires exactly at review and short of hold end fail',()=>{
    const expired=audit(scope(),parent({expires_at:micros(reviewAt)}));
    safe(expired);
    assert.equal(expired.state,'BROKER_GTT_ALREADY_EXPIRED_AT_REVIEW');
    const short=audit(scope(),parent({
      expires_at:micros('2026-12-20T23:59:59.999Z')+999
    }));
    safe(short);
    assert.equal(short.state,'BROKER_GTT_EXPIRES_BEFORE_ENTRY_HOLD_END');
  });
  it('asserted contract expired or too short, GTT beyond contract fail',()=>{
    const expired=audit(scope(),parent({
      expires_at:micros('2027-01-15T15:30:00.000Z')
    }));
    // baseline expiry later than review, so this is otherwise consistent
    safe(expired);
    assert.equal(expired.state,overlap);
    const past=audit(scope({
      assertedContractExpiryUtc:'2026-11-29T00:00:00.000Z'
    }));
    safe(past);
    assert.equal(past.state,'ASSERTED_CONTRACT_ALREADY_EXPIRED_AT_REVIEW');
    const short=audit(scope({
      assertedContractExpiryUtc:'2026-12-01T00:00:00.000Z'
    }));
    safe(short);
    assert.equal(short.state,
      'ASSERTED_CONTRACT_EXPIRES_BEFORE_ENTRY_HOLD_END');
    const beyond=audit(scope(),parent({
      expires_at:micros(expiry)+1
    }));
    safe(beyond);
    assert.equal(beyond.state,
      'BROKER_GTT_EXPIRES_AFTER_ASSERTED_CONTRACT_EXPIRY');
  });
  it('GTT created before the BUY risks orphan SELL, after BUY has exposure gap',()=>{
    const early=audit(scope(),parent({
      created_at:micros(buyAt)-1
    }));safe(early);
    assert.equal(early.state,
      'GTT_PREEXISTED_ASSERTED_BUY_SHORT_RISK_UNVERIFIED');
    const late=audit(scope(),parent({
      created_at:micros(buyAt)+1
    }));safe(late);
    assert.equal(late.state,'GTT_CREATED_AFTER_ASSERTED_BUY_COVERAGE_GAP');
    assert.equal(late.gttCreatedAfterBuyGapUs,1);
  });
  it('exact BSE_FO option and matching GTT exchange is descriptive only',()=>{
    const key='BSE_FO|PH122-CONTRACT';
    const r=audit(scope({instrumentKey:key}),parent({
      instrument_token:key,exchange:'BSE_FO'
    }));safe(r);
    assert.equal(r.state,overlap);
  });
  it('pure audit: no order, GTT, local file write or externally reached route',()=>{
    const source=readFileSync(
      'src/server/engine/ema15m/adaptiveNrmlOriginalBuyAnchoredGttHorizonAudit.ts',
      'utf8'
    );
    for(const forbidden of ['fetch(','.placeOrder(','.cancelOrder(',
      '.placeGttOrder(','.modifyOrder(','writeFileSync(',
      'app.post(','server.listen(','Date.now('])
      assert.equal(source.includes(forbidden),false,forbidden);
    safe(audit());
  });
});
