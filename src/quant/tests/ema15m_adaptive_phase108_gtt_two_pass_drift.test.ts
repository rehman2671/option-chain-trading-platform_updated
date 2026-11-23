import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  reviewNrmlStopLifecycleTwoPassReadOnly,
  type NrmlStopLifecycleReport
} from '../../server/engine/ema15m/adaptiveNrmlStopLifecycleTwoPassReview.js';
import type {GttChildReviewRequest,ReadOnlyNrmlGttBroker} from
  '../../server/engine/ema15m/adaptiveNrmlGttChildLineageAudit.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const req:GttChildReviewRequest={
  expectedAccountId:'PH108-PRIVATE-ACCOUNT',
  instrumentKey:'NSE_FO|PH108-PRIVATE-CE',
  gttOrderId:'GTT-PH108-PRIVATE-STOP',
  expectedLongQuantity:100,lotSize:50
};
const parent=(overrides:Record<string,unknown>={},rule:Record<string,unknown>={})=>({
  gtt_order_id:req.gttOrderId,instrument_token:req.instrumentKey,
  product:'D',quantity:100,type:'SINGLE',exchange:'NFO',
  expires_at:1822348800000000,
  rules:[{
    strategy:'STOPLOSS',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:80,
    status:'TRIGGERED',order_id:'PH108-CHILD',...rule
  }],...overrides
});
const child=(fill=0,st?:string)=>({
  order_id:'PH108-CHILD',order_ref_id:req.gttOrderId,
  exchange_order_id:'PH108-EXCHANGE',
  instrument_token:req.instrumentKey,product:'D',
  transaction_type:'SELL',order_type:'MARKET',quantity:100,
  filled_quantity:fill,pending_quantity:100-fill,
  status:st??(fill===100?'complete':fill>0?'partially filled':'open')
});
const trade=(quantity=50)=>({
  order_id:'PH108-CHILD',exchange_order_id:'PH108-EXCHANGE',
  instrument_token:req.instrumentKey,product:'D',
  transaction_type:'SELL',trade_id:'PH108-TRADE',quantity
});
const net=(size:number)=>[
  {instrument_token:req.instrumentKey,product:'D',net_quantity:String(size)}
];
const auth=()=>({isConnected:true,userId:req.expectedAccountId});
const broker=(events:string[]=[],patch:Partial<ReadOnlyNrmlGttBroker>={})
  :ReadOnlyNrmlGttBroker=>({
  getLiveConnectionStatus:auth,getBrokerAuthEpoch:()=>10,
  getGttOrderDetails:async()=>{events.push('gtt');return [parent()];},
  getGttOrders:async()=>{events.push('allGtts');return [parent()];},
  getOrderBook:async()=>{events.push('orders');return [child()];},
  getOrderDetails:async()=>{events.push('child');return child();},
  getOrderTrades:async()=>{events.push('trades');return [];},
  getVerifiedNrmlPositionRows:async()=>{events.push('net');return net(100);},
  ...patch
});
const run=(b:ReadOnlyNrmlGttBroker,scope=req)=>
  reviewNrmlStopLifecycleTwoPassReadOnly(b,scope);
function locked(r:NrmlStopLifecycleReport):void{
  assert.equal(r.independentExchangeChildAckCertified,false);
  assert.equal(r.guaranteedStopFill,false);
  assert.equal(r.parentAndChildResponsesAtomic,false);
  assert.equal(r.accountCapitalAndMarginReconciled,false);
  assert.equal(r.realisedPnlWriteAuthorized,false);
  assert.equal(r.automaticPositionClosureAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  for(const secret of [req.expectedAccountId,req.instrumentKey,
    req.gttOrderId,'PH108-CHILD','PH108-EXCHANGE','PH108-TRADE',
    'PH108-AUTH-TOKEN-SECRET'])
    assert.equal(JSON.stringify(r).includes(secret),false);
}
describe('Phase108 NRML GTT and child two-pass lifecycle drift, read-only',()=>{
  it('two stable triggered child, trade, broker net samples are descriptive only',async()=>{
    const events:string[]=[];
    const result=await run(broker(events));locked(result);
    assert.equal(result.state,'STABLE_BROKER_CHILD_OBSERVATION_NOT_PROTECTIVE_ACK');
    assert.equal(result.brokerReadPasses,2);
    assert.equal(result.generatedBrokerChildObserved,true);
    assert.equal(result.brokerReportedOriginalLongQuantity,100);
    assert.equal(result.brokerReportedSellFilledQuantity,0);
    assert.equal(result.brokerReportedRemainingLongQuantity,100);
    assert.equal(result.quantityWithoutIndependentProtectiveAck,100);
    assert.equal(events.filter(x=>x==='gtt').length,4);
    assert.equal(events.filter(x=>x==='child').length,2);
    assert.equal(events.filter(x=>x==='net').length,2);
  });
  it('scheduled GTT remains NO generated exchange child, not protection',async()=>{
    const scheduled=()=>parent({},{
      status:'SCHEDULED',order_id:null
    });
    const b=broker([],{
      getGttOrderDetails:async()=>[scheduled()],
      getGttOrders:async()=>[scheduled()],
      getOrderBook:async()=>[],
      getOrderDetails:async()=>{throw Error('CHILD_NOT_CREATED');},
      getOrderTrades:async()=>{throw Error('CHILD_NOT_CREATED');}
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'SCHEDULED_GTT_NO_EXCHANGE_CHILD_NOT_PROTECTED');
    assert.equal(r.scheduledGttNoExchangeChild,true);
    assert.equal(r.generatedBrokerChildObserved,false);
    assert.equal(r.quantityWithoutIndependentProtectiveAck,100);
  });
  it('partial SELL fill 50/100, net 50 stays descriptive with 50 not certified',async()=>{
    const b=broker([],{
      getOrderDetails:async()=>child(50),
      getOrderBook:async()=>[child(50)],
      getOrderTrades:async()=>[trade(50)],
      getVerifiedNrmlPositionRows:async()=>net(50)
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'STABLE_BROKER_CHILD_OBSERVATION_NOT_PROTECTIVE_ACK');
    assert.equal(r.brokerReportedSellFilledQuantity,50);
    assert.equal(r.brokerReportedRemainingLongQuantity,50);
    assert.equal(r.quantityWithoutIndependentProtectiveAck,50);
  });
  it('fully executed SELL, current net zero still cannot automatically close',async()=>{
    const b=broker([],{
      getOrderDetails:async()=>child(100),
      getOrderBook:async()=>[child(100)],
      getOrderTrades:async()=>[trade(100)],
      getVerifiedNrmlPositionRows:async()=>net(0)
    });
    const r=await run(b);locked(r);
    assert.equal(r.brokerReadPasses,2);
    assert.equal(r.brokerReportedRemainingLongQuantity,0);
    assert.equal(r.realisedPnlWriteAuthorized,false);
    assert.equal(r.automaticPositionClosureAuthorized,false);
  });
  it('modified GTT trigger price at last GET quarantines apparent healthy children',async()=>{
    let gttReads=0;
    const b=broker([],{
      getGttOrderDetails:async()=>{
        gttReads++;
        return [parent({},gttReads===4?{trigger_price:70}:{})];
      }
    });
    const r=await run(b);locked(r);
    assert.equal(gttReads,4);
    assert.equal(r.state,'GTT_PARENT_OR_STOP_RULE_MUTATED_DURING_REVIEW');
    assert.equal(r.gttParentChangedDuringReview,true);
    assert.equal(r.brokerReportedRemainingLongQuantity,null);
  });
  it('GTT STOPLOSS child replaced with different id in post-read quarantines',async()=>{
    let gttReads=0;
    const b=broker([],{
      getGttOrderDetails:async()=>{
        gttReads++;
        return [parent({},gttReads===4?{order_id:'PH108-REPLACEMENT'}:{})];
      }
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'GTT_PARENT_OR_STOP_RULE_MUTATED_DURING_REVIEW');
    assert.equal(r.quantityWithoutIndependentProtectiveAck,null);
  });
  it('GTT expires or is cancelled before final GET cannot be called stable',async()=>{
    let gttReads=0;
    const b=broker([],{
      getGttOrderDetails:async()=>{
        gttReads++;return gttReads===4?[]:[parent()];
      }
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'GTT_PARENT_OR_STOP_RULE_MUTATED_DURING_REVIEW');
    assert.equal(r.generatedBrokerChildObserved,false);
  });
  it('new SELL fill between passes changes broker net, triggers quarantine',async()=>{
    let pass=0;
    const events:string[]=[];
    const b=broker(events,{
      getOrderBook:async()=>{pass++;return [child(pass===1?0:50)];},
      getOrderDetails:async()=>child(pass===1?0:50),
      getOrderTrades:async()=>pass===1?[]:[trade(50)],
      getVerifiedNrmlPositionRows:async()=>net(pass===1?100:50)
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'CHILD_OR_BROKER_NET_CHANGED_DURING_REVIEW');
    assert.equal(r.childOrNetChangedDuringReview,true);
    assert.equal(r.brokerReportedSellFilledQuantity,null);
  });
  it('cancel pending / modify pending child in second pass blocks clean evidence',async()=>{
    for(const status of ['cancel pending','modify pending','cancelled','rejected']){
      let pass=0;
      const b=broker([],{
        getOrderBook:async()=>{pass++;return [child(0,pass===1?'open':status)];},
        getOrderDetails:async()=>child(0,pass===1?'open':status)
      });
      const r=await run(b);locked(r);
      assert.equal(r.state,'BROKER_CHILD_OR_GTT_LIFECYCLE_UNRESOLVED');
      assert.equal(r.brokerReadPasses,2);
      assert.equal(r.brokerReportedRemainingLongQuantity,null);
    }
  });
  it('new competing same-option GTT in second pass is unresolved',async()=>{
    let pass=0;
    const b=broker([],{
      getGttOrders:async()=>{
        pass++;return pass===1?[parent()]:[
          parent(),parent({gtt_order_id:'GTT-PH108-SECOND'})
        ];
      }
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'BROKER_CHILD_OR_GTT_LIFECYCLE_UNRESOLVED');
  });
  it('same-account reconnect after initial parent GET rejects mixed credentials',async()=>{
    let epoch=1,orderReads=0;
    const b=broker([],{
      getBrokerAuthEpoch:()=>epoch,
      getGttOrderDetails:async()=>{epoch=2;return [parent()];},
      getOrderBook:async()=>{orderReads++;return [child()];}
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'BROKER_SESSION_CHANGED_DURING_REVIEW');
    assert.equal(orderReads,0);
  });
  it('same-account reconnect in second child pass rejects even final coherent data',async()=>{
    let pass=0,epoch=2,postReads=0;
    const b=broker([],{
      getBrokerAuthEpoch:()=>epoch,
      getOrderBook:async()=>{pass++;return [child()];},
      getOrderTrades:async()=>{
        if(pass===2)epoch++;
        return [];
      },
      getGttOrderDetails:async()=>{
        postReads++;return [parent()];
      }
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'BROKER_SESSION_CHANGED_DURING_REVIEW');
    assert.equal(postReads,3);
    assert.equal(r.brokerReadPasses,2);
  });
  it('account changed at final parent GET returns fixed failure',async()=>{
    let account=req.expectedAccountId,reads=0;
    const b=broker([],{
      getLiveConnectionStatus:()=>({isConnected:true,userId:account}),
      getGttOrderDetails:async()=>{
        reads++;if(reads===4)account='PH108-OTHER-ACCT';
        return [parent()];
      }
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'BROKER_SESSION_CHANGED_DURING_REVIEW');
    assert.equal(r.brokerReportedSellFilledQuantity,null);
  });
  it('missing or invalid auth epoch blocks before any first GTT GET',async()=>{
    let calls=0;
    for(const epoch of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
      const b=broker([],{
        getBrokerAuthEpoch:()=>epoch,
        getGttOrderDetails:async()=>{calls++;return [parent()];}
      });
      const r=await run(b);locked(r);
      assert.equal(r.state,'BROKER_SESSION_UNVERIFIED');
    }
    const b=broker([],{
      getBrokerAuthEpoch:undefined as any,
      getGttOrderDetails:async()=>{calls++;return [parent()];}
    });
    const r=await run(b);locked(r);
    assert.equal(r.state,'BROKER_SESSION_UNVERIFIED');
    assert.equal(calls,0);
  });
  it('initial/final GET failures return static codes and no partial safe verdict',async()=>{
    const errors=['PH108-AUTH-TOKEN-SECRET','UPSTOX-SECRET'];
    for(const failAt of [1,4]){
      let calls=0;
      const b=broker([],{
        getGttOrderDetails:async()=>{
          calls++;
          if(calls===failAt)throw Error(errors[failAt===1?0:1]);
          return [parent()];
        }
      });
      const r=await run(b);locked(r);
      assert.equal(r.state,'GTT_OR_CHILD_BROKER_SOURCE_INCOMPLETE');
      assert.equal(r.brokerReportedRemainingLongQuantity,null);
      assert.ok(!JSON.stringify(r).includes('UPSTOX-SECRET'));
    }
  });
  it('invalid request or missing current broker auth fails closed with zero GETs',async()=>{
    let calls=0;
    const b=broker([],{
      getGttOrderDetails:async()=>{calls++;return [parent()];}
    });
    const invalid=await run(b,{...req,expectedLongQuantity:101});
    locked(invalid);
    assert.equal(invalid.state,'INVALID_REQUEST');
    const wrong=await run(broker([],
      {getLiveConnectionStatus:()=>({isConnected:true,userId:'PH108-WRONG'})}));
    locked(wrong);
    assert.equal(wrong.state,'BROKER_SESSION_UNVERIFIED');
    assert.equal(calls,0);
  });
  it('SUPERADMIN route and two-pass reader contain no broker or local writes',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const start=app.indexOf("app.post('/api/ema15m/nrml-stop-lifecycle-review'");
    const end=app.indexOf('  // Phase95:',start);
    assert.ok(start>0&&end>start);
    const route=app.slice(start,end);
    assert.ok(route.includes('requireSuperAdmin'));
    assert.ok(route.includes("'Cache-Control','no-store'"));
    assert.ok(route.includes('reviewNrmlStopLifecycleTwoPassReadOnly('));
    for(const disallowed of ['placeOrder(','cancelOrder(','modifyOrder(',
      'placeGttOrder(','updateEmaLivePosition(','saveEmaLivePosition('])
      assert.equal(route.includes(disallowed),false);
    const mod=readFileSync(
      'src/server/engine/ema15m/adaptiveNrmlStopLifecycleTwoPassReview.ts','utf8');
    assert.ok(mod.includes('reviewNrmlGttChildReadOnly('));
    assert.ok(mod.includes('getBrokerAuthEpoch()'));
    assert.ok(mod.includes('parentFingerprint('));
  });
});
