import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  reviewNrmlGttChildReadOnly,
  type ReadOnlyNrmlGttBroker,
  type GttChildReviewRequest
} from '../../server/engine/ema15m/adaptiveNrmlGttChildLineageAudit.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const request:GttChildReviewRequest={
  expectedAccountId:'PH107-ACCT',
  instrumentKey:'NSE_FO|PH107-CE',
  gttOrderId:'GTT-PH107-SL',
  expectedLongQuantity:100,
  lotSize:50
};
const gtt=(triggered=true)=>({
  gtt_order_id:request.gttOrderId,
  instrument_token:request.instrumentKey,product:'D',
  quantity:100,
  rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
    status:triggered?'TRIGGERED':'SCHEDULED',
    order_id:triggered?'PH107-CHILD':null}]
});
const child=(fill=0)=>({
  order_id:'PH107-CHILD',order_ref_id:request.gttOrderId,
  exchange_order_id:'PH107-EXCHANGE',
  instrument_token:request.instrumentKey,product:'D',
  transaction_type:'SELL',order_type:'MARKET',
  quantity:100,filled_quantity:fill,pending_quantity:100-fill,
  status:fill>0?'partially filled':'open'
});
const trade=()=>({
  order_id:'PH107-CHILD',exchange_order_id:'PH107-EXCHANGE',
  instrument_token:request.instrumentKey,product:'D',
  transaction_type:'SELL',trade_id:'PH107-TRADE',quantity:50
});
const net=(quantity:number)=>[{
  instrument_token:request.instrumentKey,product:'D',
  net_quantity:String(quantity)
}];
const stable=()=>({isConnected:true,userId:request.expectedAccountId});
function mockBroker(
  overrides:Partial<ReadOnlyNrmlGttBroker>={},
  events:string[]=[]
):ReadOnlyNrmlGttBroker{
  return {
    getLiveConnectionStatus:()=>stable(),
    getBrokerAuthEpoch:()=>1,
    getGttOrderDetails:async()=>{events.push('gtt');return [gtt()];},
    getOrderBook:async()=>{events.push('orders');return [child()];},
    getGttOrders:async()=>{events.push('allGtt');return [gtt()];},
    getOrderDetails:async()=>{events.push('child');return child();},
    getOrderTrades:async()=>{events.push('trades');return [];},
    getVerifiedNrmlPositionRows:async()=>{events.push('net');return net(100);},
    ...overrides
  };
}
type Review=Awaited<ReturnType<typeof reviewNrmlGttChildReadOnly>>;
const neverRelease=(r:Review)=>{
  assert.equal(r.independentExchangeChildAckCertified,false);
  assert.equal(r.stopFillGuaranteed,false);
  assert.equal(r.fullAccountRiskReconciled,false);
  assert.equal(r.brokerSnapshotsAtomic,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.brokerWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  for(const v of [request.expectedAccountId,request.instrumentKey,
    request.gttOrderId,'PH107-CHILD','PH107-EXCHANGE','PH107-TRADE',
    'PH107-SECRET'])
    assert.ok(!JSON.stringify(r).includes(v),'private receipt disclosed');
};
const lost=(r:Review)=>{
  neverRelease(r);
  assert.equal(r.status,'BROKER_ACCOUNT_UNVERIFIED');
  assert.deepEqual(r.reasonCodes,
    ['BROKER_GTT_ACCOUNT_OR_AUTH_EPOCH_CHANGED_DURING_READ']);
  assert.equal(r.brokerReportedExchangeOrderIdObserved,false);
  assert.equal(r.brokerReportedChildFilledQuantity,0);
};
describe('Phase107 GTT STOPLOSS parent/child/net read-only auth epoch pin',()=>{
  it('stable epoch yields broker-observed child, never exchange certification',async()=>{
    const events:string[]=[];
    const r=await reviewNrmlGttChildReadOnly(mockBroker({},events),request);
    neverRelease(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.deepEqual(events.slice(0,3),['gtt','orders','allGtt']);
    assert.equal(events[events.length-1],'net');
    assert.equal(events.length,6);
  });
  it('same account with new token during initial GTT/book/list batch blocks child and net',async()=>{
    let epoch=1;const events:string[]=[];
    const broker=mockBroker({
      getBrokerAuthEpoch:()=>epoch,
      getGttOrderDetails:async()=>{
        events.push('gtt');epoch=2;return [gtt()];
      }
    },events);
    lost(await reviewNrmlGttChildReadOnly(broker,request));
    assert.ok(!events.includes('child'));
    assert.ok(!events.includes('net'));
  });
  it('a same-account credential swap during generated child GET discards all evidence',async()=>{
    let epoch=1;const events:string[]=[];
    const broker=mockBroker({
      getBrokerAuthEpoch:()=>epoch,
      getOrderDetails:async()=>{events.push('child');epoch++;return child();}
    },events);
    lost(await reviewNrmlGttChildReadOnly(broker,request));
    assert.equal(events.includes('net'),false);
  });
  it('a token change after net-position GET cannot be reported as a clean stop',async()=>{
    let epoch=10;
    const broker=mockBroker({
      getBrokerAuthEpoch:()=>epoch,
      getVerifiedNrmlPositionRows:async()=>{epoch=11;return net(100);}
    });
    lost(await reviewNrmlGttChildReadOnly(broker,request));
  });
  it('switching broker user during the initial response blocks child fetch',async()=>{
    let account=request.expectedAccountId,childReads=0;
    const broker=mockBroker({
      getLiveConnectionStatus:()=>({isConnected:true,userId:account}),
      getGttOrders:async()=>{account='PH107-OTHER-USER';return [gtt()];},
      getOrderDetails:async()=>{childReads++;return child();}
    });
    lost(await reviewNrmlGttChildReadOnly(broker,request));
    assert.equal(childReads,0);
  });
  it('broker disconnect during child-trades GET blocks fresh portfolio GET',async()=>{
    let connected=true,netReads=0;
    const broker=mockBroker({
      getLiveConnectionStatus:()=>({isConnected:connected,userId:request.expectedAccountId}),
      getOrderTrades:async()=>{connected=false;return [];},
      getVerifiedNrmlPositionRows:async()=>{netReads++;return net(100);}
    });
    lost(await reviewNrmlGttChildReadOnly(broker,request));
    assert.equal(netReads,0);
  });
  it('auth epoch changes before first GTT fetch: zero network reads',async()=>{
    let checks=0,firstGets=0;
    const broker=mockBroker({
      getBrokerAuthEpoch:()=>++checks===1?1:2,
      getGttOrderDetails:async()=>{firstGets++;return [gtt()];}
    });
    lost(await reviewNrmlGttChildReadOnly(broker,request));
    assert.equal(firstGets,0);
  });
  it('missing or invalid provider auth epoch blocks without any broker GET',async()=>{
    let getCount=0;
    for(const epoch of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
      const broker=mockBroker({
        getBrokerAuthEpoch:()=>epoch,
        getGttOrderDetails:async()=>{getCount++;return [gtt()];}
      });
      const r=await reviewNrmlGttChildReadOnly(broker,request);
      neverRelease(r);
      assert.equal(r.status,'BROKER_ACCOUNT_UNVERIFIED');
      assert.ok(r.reasonCodes.includes('BROKER_GTT_AUTH_EPOCH_UNAVAILABLE'));
    }
    const noMethod=mockBroker({getBrokerAuthEpoch:undefined as any,
      getGttOrderDetails:async()=>{getCount++;return [gtt()];}});
    const r=await reviewNrmlGttChildReadOnly(noMethod,request);
    neverRelease(r);
    assert.equal(r.status,'BROKER_SOURCE_INCOMPLETE');
    assert.equal(getCount,0);
  });
  it('epoch getter exception returns redacted failure with zero broker GETs',async()=>{
    let getCount=0;
    const broker=mockBroker({
      getBrokerAuthEpoch:()=>{throw Error('PH107-SECRET');},
      getGttOrderDetails:async()=>{getCount++;return [gtt()];}
    });
    const r=await reviewNrmlGttChildReadOnly(broker,request);
    neverRelease(r);
    assert.equal(getCount,0);
    assert.equal(r.status,'BROKER_ACCOUNT_UNVERIFIED');
  });
  it('stable scheduled GTT has no generated exchange child and is never protective ACK',async()=>{
    const events:string[]=[];
    const broker=mockBroker({
      getGttOrderDetails:async()=>{events.push('gtt');return [gtt(false)];},
      getGttOrders:async()=>{events.push('allGtt');return [gtt(false)];},
      getOrderBook:async()=>{events.push('orders');return [];},
      getOrderDetails:async()=>{throw Error('MUST_NOT_READ_NONEXISTENT_CHILD');},
      getOrderTrades:async()=>{throw Error('MUST_NOT_READ_NONEXISTENT_TRADES');},
      getVerifiedNrmlPositionRows:async()=>{events.push('net');return net(100);}
    });
    const r=await reviewNrmlGttChildReadOnly(broker,request);
    neverRelease(r);
    assert.equal(r.status,'SCHEDULED_GTT_NO_EXCHANGE_CHILD');
    assert.equal(r.generatedChildOrderIdObserved,false);
    assert.deepEqual(events.sort(),['allGtt','gtt','net','orders']);
  });
  it('stable partial child fill and matching broker net are observations only',async()=>{
    const broker=mockBroker({
      getOrderDetails:async()=>child(50),
      getOrderBook:async()=>[child(50)],
      getOrderTrades:async()=>[trade()],
      getVerifiedNrmlPositionRows:async()=>net(50)
    });
    const r=await reviewNrmlGttChildReadOnly(broker,request);
    neverRelease(r);
    assert.equal(r.status,'OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE');
    assert.equal(r.brokerReportedChildFilledQuantity,50);
    assert.equal(r.brokerReportedNetPositionMatchesExecutedSellRemainder,true);
  });
  it('admin GTT route remains read-only and calls pinned verifier',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const start=app.indexOf("app.post('/api/ema15m/nrml-gtt-child-review'");
    const end=app.indexOf('  // Phase95:',start);
    assert.ok(start>0&&end>start);
    const route=app.slice(start,end);
    assert.ok(route.includes('requireSuperAdmin'));
    assert.ok(route.includes('reviewNrmlGttChildReadOnly('));
    assert.ok(!route.includes('placeOrder('));
    assert.ok(!route.includes('cancelOrder('));
    assert.ok(!route.includes('modifyGttOrder('));
    const provider=readFileSync('src/server/engine/providers/UpstoxProvider.ts','utf8');
    assert.ok(provider.includes('public getBrokerAuthEpoch(): number'));
    assert.ok(provider.includes('return this.historicalFoAuthEpoch;'));
  });
});
