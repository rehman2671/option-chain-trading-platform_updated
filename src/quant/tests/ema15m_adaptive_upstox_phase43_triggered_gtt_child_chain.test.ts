import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  auditPhase43TriggeredGttChildTrades,phase43ReviewerMessage,
  type Phase43TriggerChainInput,type Phase43ExternalSourcePins,
  type Phase43ArchiveTrade
} from '../../server/engine/ema15m/adaptiveUpstoxPhase43TriggeredGttChildChain.js';
import {hashPhase40OfflineArchive}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.js';

const ucc='SYNTHETIC_PRIVATE_ACCOUNT_PHASE43';
const gtt='GTT-C-PHASE43';
const child='CHILD_PHASE43_123';
const exchange='EXCHANGE_ORDER_REPORTED_456';
const instrument='NSE_FO|SYNTH_24500_CE';
const when={
  gtt:'2026-11-18T10:10:00+05:30',
  history:'2026-11-18T10:15:00+05:30',
  trades:'2026-11-18T10:20:00+05:30',
  review:'2026-11-18T10:25:00+05:30'
};
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
function fixture(kind:'open'|'complete'|'partial'='open'){
  const key=generateKeyPairSync('ed25519');
  const spki=key.publicKey.export({format:'der',type:'spki'}) as Buffer;
  const rows=[
    {order_id:child,order_request_id:'1',
      instrument_token:instrument,trading_symbol:'SYNTH_CE',
      product:'D',transaction_type:'SELL' as const,
      order_type:'SL-M',quantity:65,filled_quantity:0,
      status:'put order req received',
      exchange_order_id:null as string|null,
      order_timestamp:'2026-11-18 10:02:00',
      exchange_timestamp:null as string|null},
    {order_id:child,order_request_id:'1',
      instrument_token:instrument,trading_symbol:'SYNTH_CE',
      product:'D',transaction_type:'SELL' as const,
      order_type:'SL-M',quantity:65,
      filled_quantity:kind==='complete'?65:kind==='partial'?10:0,
      status:kind==='complete'?'complete':'open',
      exchange_order_id:exchange as string|null,
      order_timestamp:'2026-11-18 10:04:00',
      exchange_timestamp:'2026-11-18 10:04:03' as string|null}
  ];
  const trades:Phase43ArchiveTrade[]=kind==='complete'?[
    {order_id:child,exchange_order_id:exchange,
      trade_id:'FAKE_TRADE_1',instrument_token:instrument,
      trading_symbol:'SYNTH_CE',product:'D',transaction_type:'SELL',
      quantity:30,average_price:239.5,
      exchange_timestamp:'2026-11-18 10:04:04'},
    {order_id:child,exchange_order_id:exchange,
      trade_id:'FAKE_TRADE_2',instrument_token:instrument,
      trading_symbol:'SYNTH_CE',product:'D',transaction_type:'SELL',
      quantity:35,average_price:238.9,
      exchange_timestamp:'2026-11-18 10:04:05'}
  ]:kind==='partial'?[
    {order_id:child,exchange_order_id:exchange,
      trade_id:'FAKE_TRADE_PARTIAL',instrument_token:instrument,
      trading_symbol:'SYNTH_CE',product:'D',transaction_type:'SELL',
      quantity:10,average_price:240.1,
      exchange_timestamp:'2026-11-18 10:04:04'}
  ]:[];
  const input:Phase43TriggerChainInput={
    schemaVersion:'ADAPTIVE_V2_PHASE43_GTT_CHILD_ORDER_CHAIN_V1',
    source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
    accountScopeId:ucc,gttOrderId:gtt,
    positionInstrumentKey:instrument,expectedLongQuantity:65,
    gttAfterTrigger:{
      origin:'OPERATOR_ARCHIVED_UNVERIFIED',method:'GET',
      path:'/v3/order/gtt',query:{gtt_order_id:gtt},
      capturedAt:when.gtt,httpStatus:200,
      response:{status:'success',data:[{
        gtt_order_id:gtt,type:'SINGLE',product:'D',exchange:'NFO',
        instrument_token:instrument,trading_symbol:'SYNTH_CE',
        quantity:65,created_at:Date.parse(
          '2026-11-17T11:00:00+05:30')*1000,
        expires_at:Date.parse('2026-12-15T15:30:00+05:30')*1000,
        rules:[{strategy:'STOPLOSS',status:'TRIGGERED',
          trigger_type:'BELOW',trigger_price:245.5,
          transaction_type:'SELL',order_id:child,message:null}]
      }]}
    },
    childHistory:{
      schemaVersion:'ADAPTIVE_V2_PHASE40_NATIVE_CHILD_ORDER_V1',
      source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
      expected:{
        accountScopeId:ucc,instrumentKey:instrument,
        tradingSymbol:'SYNTH_CE',productType:'NRML',
        childOrderId:child,side:'SELL',quantity:65,lotSize:65
      },
      history:{
        origin:'OPERATOR_ARCHIVED_UNVERIFIED',method:'GET',
        path:'/v2/order/history',query:{order_id:child},
        capturedAt:when.history,httpStatus:200,
        response:{status:'success',data:rows}
      }
    },
    childTrades:{
      origin:'OPERATOR_ARCHIVED_UNVERIFIED',method:'GET',
      path:'/v2/order/trades',query:{order_id:child},
      capturedAt:when.trades,httpStatus:200,
      response:{status:'success',data:trades}
    },
    externalReviewer:{
      schemaVersion:'EXTERNAL_PHASE43_ORDER_ACK_REVIEWER_CLAIM_V1',
      issuer:'EXTERNAL_REVIEWER_NOT_EXCHANGE_OR_BROKER',
      accountScopeId:ucc,gttOrderId:gtt,childOrderId:child,
      claimedExchangeOrderId:exchange,instrumentKey:instrument,
      transactionType:'SELL',quantity:65,
      claimedStatus:'BROKER_ORDER_ID_PRESENT_NOT_NATIVE_ACK',
      claimedAt:when.review,reviewerSpkiDerBase64:spki.toString('base64'),
      signatureBase64:''
    }
  };
  const pins:Phase43ExternalSourcePins={
    schemaVersion:'INDEPENDENT_PHASE43_TRIGGER_CHILD_TRADE_CLAIM_PINS_V1',
    expectedAccountScopeId:ucc,expectedGttOrderId:gtt,
    expectedChildOrderId:child,
    expectedExchangeOrderId:exchange,
    expectedGttSha256:'00'.repeat(32),
    expectedHistorySha256:'00'.repeat(32),
    expectedTradesSha256:'00'.repeat(32),
    expectedTradeIds:trades.map(x=>x.trade_id),
    expectedReviewerSpkiSha256:sha(spki),
    expectedReviewChallengeSha256:'ab'.repeat(32),
    expectedSessionDate:'2026-11-18',maxReviewDelayMinutes:15
  };
  const resign=()=>{
    pins.expectedGttSha256=hashPhase40OfflineArchive(input.gttAfterTrigger);
    pins.expectedHistorySha256=hashPhase40OfflineArchive(
      input.childHistory.history);
    pins.expectedTradesSha256=hashPhase40OfflineArchive(input.childTrades);
    input.externalReviewer.signatureBase64=sign(
      null,phase43ReviewerMessage(input,pins),key.privateKey).toString('base64');
  };
  resign();
  return {input,pins,resign};
}
function assertUnsafe(r:ReturnType<typeof auditPhase43TriggeredGttChildTrades>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.independentExchangeSignedAcknowledgementVerified,false);
  assert.equal(r.officialBrokerOriginVerified,false);
  assert.equal(r.nativeExchangeRestingStopConfirmed,false);
  assert.equal(r.trueExchangeOrderLifecycleVerified,false);
  assert.equal(r.genuineExchangeTradeConfirmationVerified,false);
  assert.equal(r.continuousOvernightProtectionVerified,false);
  assert.equal(r.orderFillPriceGuaranteed,false);
  for(const secret of [ucc,gtt,child,exchange,instrument])
    assert.ok(!JSON.stringify(r).includes(secret));
}
function fail(input:Phase43TriggerChainInput,pins:Phase43ExternalSourcePins,
  expected:string){
  const r=auditPhase43TriggeredGttChildTrades(input,pins);
  assertUnsafe(r);
  assert.notEqual(r.status,'BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED');
  assert.notEqual(r.status,'BROKER_REPORTED_CHILD_FILLED_REVIEWED_UNVERIFIED');
  assert.deepEqual(r.reasonCodes,[expected],JSON.stringify(r));
}
describe('Phase43 OFFLINE synthetic GTT trigger → child order/trades',()=>{
  it('reconciles fake GTT trigger, 2-stage broker OPEN history and separately signed EXTERNAL claim',()=>{
    const f=fixture();
    const r=auditPhase43TriggeredGttChildTrades(f.input,f.pins);
    assertUnsafe(r);
    assert.equal(r.status,
      'BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED',JSON.stringify(r));
    assert.equal(r.matchingGttTriggeredChildOrder,true);
    assert.equal(r.brokerReportedChildExchangeOrderId,true);
    assert.equal(r.reviewerSignatureVerified,true);
    assert.equal(r.archivedOrderHistoryStages,2);
    assert.equal(r.archivedRemainingQuantity,65);
  });
  it('complete order requires exact 2-trade aggregate and remains NOT a standing protective stop',()=>{
    const f=fixture('complete');
    const r=auditPhase43TriggeredGttChildTrades(f.input,f.pins);
    assertUnsafe(r);
    assert.equal(r.status,'BROKER_REPORTED_CHILD_FILLED_REVIEWED_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.archivedTradeRows,2);
    assert.equal(r.archivedFilledQuantity,65);
    assert.equal(r.archivedRemainingQuantity,0);
  });
  it('partial child fill is matched but remaining exposure never protected',()=>{
    const f=fixture('partial');
    const r=auditPhase43TriggeredGttChildTrades(f.input,f.pins);
    assertUnsafe(r);
    assert.equal(r.status,'BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED');
    assert.equal(r.archivedFilledQuantity,10);
    assert.equal(r.archivedRemainingQuantity,55);
  });
  it('triggered GTT with absent child ID, failed/expired/cancelled status rejects',()=>{
    const f=fixture();
    f.input.gttAfterTrigger.response.data[0].rules[0].order_id=null;
    f.resign();
    fail(f.input,f.pins,'NO_EXACT_TRIGGERED_GTT_CHILD_LINK');
    for(const state of ['FAILED','EXPIRED','CANCELLED','SCHEDULED']){
      const x=fixture();
      x.input.gttAfterTrigger.response.data[0].rules[0].status=state;
      x.resign();
      fail(x.input,x.pins,'NO_EXACT_TRIGGERED_GTT_CHILD_LINK');
    }
  });
  it('broker-reported rejection/cancel/modify pending histories block',()=>{
    for(const status of ['rejected','cancelled','cancel pending',
      'modify pending','modify validation pending']){
      const f=fixture();
      f.input.childHistory.history.response.data[1].status=status;
      f.resign();
      fail(f.input,f.pins,
        'PHASE40_CHILD_ORDER_REJECTED_CANCELLED_OR_AMBIGUOUS');
    }
  });
  it('modified or missing broker-reported exchange order ID cannot pass as ACK',()=>{
    const f=fixture();
    f.input.childHistory.history.response.data[1].exchange_order_id=
      'OTHER_EXCHANGE';
    f.resign();
    fail(f.input,f.pins,'BROKER_REPORTED_CHILD_EXCHANGE_ID_MISMATCH');
    const a=fixture();
    a.input.childHistory.history.response.data[1].exchange_order_id=null;
    a.resign();
    fail(a.input,a.pins,
      'PHASE40_CHILD_ORDER_REJECTED_CANCELLED_OR_AMBIGUOUS');
  });
  it('wrong GTT contract, UCC and side are blocked even with new signed reviewer claim',()=>{
    const f=fixture();
    f.input.gttAfterTrigger.response.data[0].instrument_token='OTHER';
    f.resign();
    fail(f.input,f.pins,'TRIGGERED_GTT_CONTRACT_OR_STOP_RULE_MISMATCH');
    const x=fixture();
    x.input.childHistory.expected.accountScopeId='WRONG_USER';
    x.resign();
    fail(x.input,x.pins,'CHILD_ORDER_POSITION_OR_ACCOUNT_SCOPE_MISMATCH');
    const y=fixture();
    y.input.gttAfterTrigger.response.data[0].rules[0].transaction_type='BUY';
    y.resign();
    fail(y.input,y.pins,'NO_EXACT_TRIGGERED_GTT_CHILD_LINK');
  });
  it('wrong trade ID, instrument or exchange reference reject',()=>{
    for(const field of (['trade_id','instrument_token','exchange_order_id']
      as const)){
      const f=fixture('complete');
      f.input.childTrades.response.data[0][field]='BAD_REFERENCE';
      f.resign();
      fail(f.input,f.pins,'INVALID_OR_MISMATCHED_ORDER_TRADE_ROW');
    }
  });
  it('duplicate trade ID and mismatched quantity reject',()=>{
    const f=fixture('complete');
    f.input.childTrades.response.data[1].trade_id='FAKE_TRADE_1';
    f.resign();
    fail(f.input,f.pins,'INVALID_OR_MISMATCHED_ORDER_TRADE_ROW');
    const x=fixture('complete');
    x.input.childTrades.response.data[1].quantity=34;
    x.resign();
    fail(x.input,x.pins,'BROKER_ORDER_FILL_QUANTITY_DISAGREES_WITH_TRADES');
  });
  it('non-monotonic history timestamps or decreasing filled quantity reject',()=>{
    const a=fixture('partial');
    a.input.childHistory.history.response.data[1].order_timestamp=
      '2026-11-18 09:59:00';
    a.resign();
    fail(a.input,a.pins,'NONMONOTONIC_CHILD_ORDER_HISTORY_OR_EXCHANGE_REFERENCE');
    const b=fixture('partial');
    b.input.childHistory.history.response.data[0].filled_quantity=20;
    b.resign();
    fail(b.input,b.pins,'NONMONOTONIC_CHILD_ORDER_HISTORY_OR_EXCHANGE_REFERENCE');
  });
  it('after-hours child trade, cross-session history or wrong captured day reject',()=>{
    const a=fixture('complete');
    a.input.childTrades.response.data[1].exchange_timestamp=
      '2026-11-19 10:05:00';
    a.resign();
    fail(a.input,a.pins,'INVALID_OR_MISMATCHED_ORDER_TRADE_ROW');
    const b=fixture();
    b.input.childHistory.history.response.data[1].order_timestamp=
      '2026-11-19 10:04:00';
    b.resign();
    fail(b.input,b.pins,'PHASE40_CHILD_ORDER_REJECTED_CANCELLED_OR_AMBIGUOUS');
    const c=fixture();
    c.input.gttAfterTrigger.capturedAt='2026-11-19T10:10:00+05:30';
    c.resign();
    fail(c.input,c.pins,'TRIGGERED_GTT_ARCHIVE_OR_SESSION_INVALID');
  });
  it('wrong independently pinned digest, child ID or scope reject before reconciling',()=>{
    const f=fixture();
    f.pins.expectedGttSha256='ff'.repeat(32);
    fail(f.input,f.pins,'INVALID_SOURCE_SCOPE_OR_INDEPENDENT_ARCHIVE_PINS');
    const a=fixture();
    a.pins.expectedAccountScopeId='FAKE_SCOPE';
    fail(a.input,a.pins,'INVALID_SOURCE_SCOPE_OR_INDEPENDENT_ARCHIVE_PINS');
    const b=fixture();
    b.pins.expectedTradesSha256='aa'.repeat(32);
    fail(b.input,b.pins,'INVALID_SOURCE_SCOPE_OR_INDEPENDENT_ARCHIVE_PINS');
  });
  it('valid fake reviewer key cannot be silently substituted',()=>{
    const f=fixture();
    f.pins.expectedReviewerSpkiSha256='22'.repeat(32);
    fail(f.input,f.pins,'EXTERNAL_SIGNED_REVIEWER_CLAIM_INVALID_OR_STALE');
  });
  it('unsigned or forged external "exchange ACK" reviewer claim rejects',()=>{
    const f=fixture();
    f.input.externalReviewer.signatureBase64=
      Buffer.alloc(64,42).toString('base64');
    fail(f.input,f.pins,'EXTERNAL_SIGNED_REVIEWER_CLAIM_INVALID_OR_STALE');
    const x=fixture();
    x.input.externalReviewer.issuer=
      'SIGNED_BY_EXCHANGE' as 'EXTERNAL_REVIEWER_NOT_EXCHANGE_OR_BROKER';
    fail(x.input,x.pins,'EXTERNAL_SIGNED_REVIEWER_CLAIM_INVALID_OR_STALE');
  });
  it('later fake approval and fake public reviewer cannot authenticate actual exchange',()=>{
    const f=fixture('complete');
    const r=auditPhase43TriggeredGttChildTrades(f.input,f.pins);
    assertUnsafe(r);
    assert.equal(r.reviewerSignatureVerified,true);
    assert.equal(r.independentExchangeSignedAcknowledgementVerified,false);
    assert.equal(r.protectedOvernight,false);
  });
});
