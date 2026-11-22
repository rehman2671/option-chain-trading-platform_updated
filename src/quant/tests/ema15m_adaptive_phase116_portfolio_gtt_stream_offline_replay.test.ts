import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditPortfolioGttSellStreamReplay,
  type PortfolioGttReplayScope,
  type PortfolioGttReplayEvent,
  type PortfolioGttReplayReport
} from '../../server/engine/ema15m/adaptiveNrmlOfflinePortfolioGttStreamAudit.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const s:PortfolioGttReplayScope={
  expectedAccountId:'PH116-PRIVATE-ACCOUNT',
  instrumentKey:'NSE_FO|PH116-OPTION-SECRET',
  gttOrderId:'GTT-PH116-SELL-BELOW',
  originalLongQuantity:100,lotSize:50,expectedAuthEpoch:7
};
const gtt=(status='COMPLETED',orderId:unknown='PH116-CHILD-SELL')=>({
  update_type:'gtt_order',instrument_token:s.instrumentKey,
  gtt_order_id:s.gttOrderId,type:'SINGLE',
  product:'D',quantity:100,
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:90,
    status,order_id:orderId}]
});
const child=(filled=50,change:Record<string,unknown>={})=>({
  update_type:'order',user_id:s.expectedAccountId,
  instrument_token:s.instrumentKey,product:'D',
  order_id:'PH116-CHILD-SELL',order_ref_id:s.gttOrderId,
  exchange_order_id:'PH116-EXCHANGE-ORDER',
  order_type:'LIMIT',transaction_type:'SELL',quantity:100,
  filled_quantity:filled,pending_quantity:100-filled,
  price:90,status:filled===100?'complete':
    filled===0?'open':'partially filled',...change
});
const position=(net:unknown=50)=>({
  update_type:'position',instrument_token:s.instrumentKey,
  product:'D',quantity:net
});
const time=(i:number)=>new Date(Date.parse('2026-11-22T14:10:00+05:30')+
  i*1000).toISOString();
const evt=(payload:unknown,i:number):PortfolioGttReplayEvent=>({
  sequence:i+1,capturedAt:time(i),
  captureAuthEpoch:s.expectedAuthEpoch,
  connectedAccountId:s.expectedAccountId,
  transport:'AUTHENTICATED_UPSTOX_PORTFOLIO_WS',payload
});
const data=(filled=50):PortfolioGttReplayEvent[]=>[
  evt(gtt(),0),evt(child(filled),1),
  evt(position(100-filled),2)
];
const audit=(events:unknown=data(),scope=s)=>
  auditPortfolioGttSellStreamReplay(scope,events);
function safe(r:PortfolioGttReplayReport){
  for(const name of [
    'capturedWebsocketHandshakeIndependentlyVerified',
    'originalCompleteStreamHistoryAuthenticated',
    'recorderClockAndSequenceIndependentlyCertified',
    'publicWebhookCanCertifyExecution',
    'brokerReportedSellFillIndependentlyCleared',
    'continuousOvernightProtectionCertified',
    'accountWidePositionAndChargesCertified',
    'brokerCloseOnlyOrNoShortIndependentlyCertified',
    'signedContractNotesAndTradeReceiptsVerified',
    'automaticPositionClosureAuthorized','realisedPnlWriteAuthorized',
    'duplicateSellRetryAuthorized','liveNrmlBuyAuthorized'
  ] as const)assert.equal(r[name],false,name);
  assert.equal(r.childOrderRefIdIsNotVenueSignature,true);
  assert.equal(r.generatedSellIsNotExchangeNativeStop,true);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  for(const secret of [
    s.expectedAccountId,s.instrumentKey,s.gttOrderId,
    'PH116-CHILD-SELL','PH116-EXCHANGE-ORDER','PH116-PRIVATE-TOKEN'
  ])assert.equal(JSON.stringify(r).includes(secret),false);
}
describe('Phase116 Upstox offline-only GTT SELL child WebSocket replay (not signed)',()=>{
  it('single completed GTT + SELL LIMIT child 50 fill + current 50 net is descriptive only',()=>{
    const r=audit();safe(r);
    assert.equal(r.state,'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION');
    assert.equal(r.brokerReportedGttUpdateCount,1);
    assert.equal(r.brokerReportedGeneratedSellOrderUpdateCount,1);
    assert.equal(r.brokerReportedLastSellFilledQuantity,50);
    assert.equal(r.brokerReportedLastSellPendingQuantity,50);
    assert.equal(r.brokerReportedLastStreamNetQuantity,50);
    assert.equal(r.brokerReportedOriginalLongNowFlat,false);
  });
  it('100-filled generated SELL with stream net zero still cannot auto-CLOSE',()=>{
    const r=audit(data(100));safe(r);
    assert.equal(r.state,'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION');
    assert.equal(r.brokerReportedLastStreamNetQuantity,0);
    assert.equal(r.brokerReportedOriginalLongNowFlat,true);
    assert.equal(r.automaticPositionClosureAuthorized,false);
  });
  it('0-filled open LIMIT child plus net 100 has no stop or fill certificate',()=>{
    const r=audit(data(0));safe(r);
    assert.equal(r.state,'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION');
    assert.equal(r.brokerReportedLastSellFilledQuantity,0);
    assert.equal(r.continuousOvernightProtectionCertified,false);
  });
  it('a scheduled GTT event may precede generated child but cannot follow it',()=>{
    const a=[evt(gtt('SCHEDULED',null),0),evt(gtt(),1),
      evt(child(),2),evt(position(),3)];
    const r=audit(a);safe(r);
    assert.equal(r.state,'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION');
    const b=[...a,evt(gtt('SCHEDULED',null),4)];
    const bad=audit(b);safe(bad);
    assert.equal(bad.state,'GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING');
  });
  it('child cumulative 0 -> 50 and latest post-child net 50 reconcile',()=>{
    const x=[evt(gtt(),0),evt(child(0),1),evt(position(100),2),
      evt(child(50),3),evt(position(50),4)];
    const r=audit(x);safe(r);
    assert.equal(r.state,'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION');
    assert.equal(r.brokerReportedGeneratedSellOrderUpdateCount,2);
    assert.equal(r.brokerReportedLastSellFilledQuantity,50);
  });
  it('a lost sequence, repeated sequence, timestamp reverse or copied event fail',()=>{
    for(const edit of [
      {sequence:4},
      {sequence:1},
      {capturedAt:time(0)},
      {capturedAt:'2026-11-21T00:00:00Z'},
      {capturedAt:'2026-11-22'},
      {captureAuthEpoch:8},
      {connectedAccountId:'PH116-OTHER-ACCOUNT'}
    ]){
      const e=data();e[1]={...e[1],...edit};
      const r=audit(e);safe(r);
      assert.equal(r.state,
        'RECORDER_SEQUENCE_CLOCK_SESSION_OR_ACCOUNT_GAP');
    }
  });
  it('public unauthenticated webhook never satisfies source provenance',()=>{
    const e=data();
    e[1]={...e[1],transport:'UNAUTHENTICATED_PUBLIC_WEBHOOK'};
    const r=audit(e);safe(r);
    assert.equal(r.state,'STREAM_ARCHIVE_ABSENT_UNTRUSTED_OR_WEBHOOK');
  });
  it('missing events, unsupported transport or unknown payload fails before matching',()=>{
    for(const archive of [
      null,[],[evt(gtt(),0)],data().map(x=>({
        ...x,transport:'ANOTHER_SOURCE'
      })),[evt(null,0),...data()],
      [evt({update_type:'unsafe'},0),...data().map((x,i)=>({
        ...x,sequence:i+2,capturedAt:time(i+1)
      }))]
    ]){
      const r=audit(archive);safe(r);
      assert.equal(r.state,'STREAM_ARCHIVE_ABSENT_UNTRUSTED_OR_WEBHOOK');
    }
  });
  it('payload user_id and userId cannot contradict captured broker account',()=>{
    for(const key of ['user_id','userId'] as const){
      const e=data();e[0].payload={
        ...gtt(),[key]:'PH116-OTHER-USER'
      };
      const r=audit(e);safe(r);
      assert.equal(r.state,
        'RECORDER_SEQUENCE_CLOCK_SESSION_OR_ACCOUNT_GAP');
    }
  });
  it('BUY GTT, MULTIPLE ENTRY, STOPLOSS, ABOVE or wrong contract fail',()=>{
    for(const edit of [
      {type:'MULTIPLE'}, {instrument_token:'NSE_FO|OTHER'},
      {quantity:50},
      {rules:[{strategy:'ENTRY',transaction_type:'BUY',
        trigger_type:'BELOW',trigger_price:90,status:'COMPLETED',
        order_id:'PH116-CHILD-SELL'}]},
      {rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
        trigger_type:'BELOW',trigger_price:90,status:'COMPLETED',
        order_id:'PH116-CHILD-SELL'}]}
    ]){
      const e=data();e[0].payload={...gtt(),...edit};
      const r=audit(e);safe(r);
      assert.notEqual(r.state,
        'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION');
    }
  });
  it('unknown/failed/cancelled or missing parent generated order ID blocks',()=>{
    for(const item of [
      gtt('FAILED'),gtt('CANCELLED'),gtt('PENDING',null),
      gtt('COMPLETED',null),
      {...gtt(),rules:[{strategy:'ENTRY',transaction_type:'SELL',
        trigger_type:'ABOVE',trigger_price:90,status:'COMPLETED',
        order_id:'PH116-CHILD-SELL'}]}
    ]){
      const e=data();e[0].payload=item;
      const r=audit(e);safe(r);
      assert.equal(r.state,'GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING');
    }
  });
  it('child order_ref_id must equal recorded GTT parent and no independent BUY',()=>{
    for(const edit of [
      {order_ref_id:'GTT-PH116-OTHER'},
      {order_id:'PH116-OTHER-SELL'},
      {transaction_type:'BUY'},
      {order_type:'SL'},
      {product:'I'},
      {quantity:50},{price:0},{price:90.005}
    ]){
      const e=data();e[1].payload={...child(),...edit};
      const r=audit(e);safe(r);
      assert.notEqual(r.state,
        'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION');
    }
  });
  it('order reject/cancel, status mismatch or negative fill never counts',()=>{
    for(const edit of [
      {status:'cancelled'}, {status:'rejected'},
      {status:'modify pending'},
      {status:'complete'}, {status:'partially filled',filled_quantity:0},
      {filled_quantity:-1},{filled_quantity:101},
      {pending_quantity:0}
    ]){
      const e=data();e[1].payload={...child(),...edit};
      const r=audit(e);safe(r);
      assert.equal(r.state,'ORDER_REF_CHILD_SIDE_PRODUCT_OR_QUANTITY_CONFLICT');
    }
  });
  it('broker exchange ID absent/changed and reverse cumulative fills block',()=>{
    const cases=[
      [evt(gtt(),0),evt(child(50,{exchange_order_id:''}),1),
        evt(position(50),2)],
      [evt(gtt(),0),evt(child(50),1),
        evt(child(25),2),evt(position(75),3)],
      [evt(gtt(),0),evt(child(50),1),
        evt(child(75,{exchange_order_id:'PH116-DIFFERENT'}),2),
        evt(position(25),3)]
    ];
    for(const e of cases){
      const r=audit(e);safe(r);
      assert.equal(r.state,'ORDER_UPDATE_FILL_OR_EXCHANGE_ID_CONFLICT');
    }
  });
  it('position event before child, missing after child, or contradictory net block',()=>{
    for(const e of [
      [evt(gtt(),0),evt(position(50),1),evt(child(),2)],
      [evt(gtt(),0),evt(child(),1),evt(position(100),2)],
      [evt(gtt(),0),evt(child(),1),evt(position(75),2)],
      [evt(gtt(),0),evt(child(),1),evt(position(-50),2)]
    ]){
      const r=audit(e);safe(r);
      assert.equal(r.state,'POSITION_STREAM_AFTER_CHILD_MISSING_OR_CONFLICT');
    }
  });
  it('same-contract second GTT or an extra BUY event cannot be waved off',()=>{
    const e=[evt(gtt(),0),evt({
      ...gtt(),gtt_order_id:'GTT-PH116-OTHER'
    },1),evt(child(),2),evt(position(),3)];
    const r=audit(e);safe(r);
    assert.equal(r.state,'SAME_CONTRACT_OTHER_ORDER_OR_GTT_EVENT_CONFLICT');
    const x=[evt(gtt(),0),evt({
      ...child(0),transaction_type:'BUY',order_ref_id:'OTHER'
    },1),evt(child(),2),evt(position(),3)];
    const b=audit(x);safe(b);
    assert.equal(b.state,'SAME_CONTRACT_OTHER_ORDER_OR_GTT_EVENT_CONFLICT');
  });
  it('another original BUY order update cannot be interpreted as protective SELL',()=>{
    const e=data();e.splice(1,0,evt({
      ...child(0),order_id:'PH116-ORIGINAL-BUY',
      order_ref_id:'PH116-OTHER-REFERENCE',
      transaction_type:'BUY'
    },1));
    e[2]={...e[2],sequence:3,capturedAt:time(2)};
    e[3]={...e[3],sequence:4,capturedAt:time(3)};
    const r=audit(e);safe(r);
    assert.equal(r.state,'SAME_CONTRACT_OTHER_ORDER_OR_GTT_EVENT_CONFLICT');
  });
  it('invalid option scope, wrong quantity or credential epoch are rejected',()=>{
    for(const edit of [
      {expectedAccountId:''},{instrumentKey:'NSE_EQ|ABC'},
      {gttOrderId:'WRONG'},{lotSize:0},
      {originalLongQuantity:75},{expectedAuthEpoch:0}
    ]){
      const r=audit(data(),{...s,...edit});safe(r);
      assert.equal(r.state,'INVALID_SCOPE');
    }
  });
  it('reviewer only analyzes OFFLINE payloads: no public webhook route, writes or network',()=>{
    const file=readFileSync(
      'src/server/engine/ema15m/adaptiveNrmlOfflinePortfolioGttStreamAudit.ts',
      'utf8'
    );
    for(const dangerous of ['fetch(','.send(','.connect(','.placeOrder(',
      '.cancelOrder(','.modifyOrder(','.placeGttOrder(',
      'app.post(','app.get(','server.listen(','writeFileSync('])
      assert.equal(file.includes(dangerous),false,dangerous);
    assert.equal(file.includes('UNAUTHENTICATED_PUBLIC_WEBHOOK'),true);
    const server=readFileSync('serverApp.ts','utf8');
    assert.equal(server.includes('/api/ema15m/nrml-portfolio-stream-webhook'),false);
  });
});
