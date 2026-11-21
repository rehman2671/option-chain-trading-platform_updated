import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditAccountWideExposureReadOnly,
  reviewAccountWideExposureBrokerReadOnly,
  type AccountWideExposureScope,
  type AccountWideExposureSources
} from '../../server/engine/ema15m/adaptiveAccountWideExposureReview.js';
import {assessEmaLiveProductGate}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
const account='PH103-ACCOUNT',key='NSE_FO|PH103-CE',
  buyId='PH103-ORIGINAL-BUY',exitId='PH103-KNOWN-SELL';
const s:AccountWideExposureScope={
  expectedAccountId:account,instrumentKey:key,product:'MIS',
  originalBuyOrderId:buyId,exitSellOrderId:exitId,
  originalBuyQuantity:100,confirmedExitFilledQuantity:100,lotSize:50
};
const original=()=>({
  order_id:buyId,instrument_token:key,product:'I',
  transaction_type:'BUY',status:'complete',
  quantity:100,filled_quantity:100,pending_quantity:0
});
const exit=()=>({
  order_id:exitId,instrument_token:key,product:'I',
  transaction_type:'SELL',status:'complete',
  quantity:100,filled_quantity:100,pending_quantity:0
});
const portfolio=(net=0,product='I',contract=key)=>({
  instrument_token:contract,product,net_quantity:String(net)
});
const fixture=():AccountWideExposureSources=>({
  connected:true,connectedAccountId:account,
  positions:[portfolio()],
  orderBook:[original(),exit()],gttOrders:[]
});
const inspect=(e:AccountWideExposureSources,request=s)=>
  auditAccountWideExposureReadOnly(request,e);
const locked=(r:ReturnType<typeof inspect>)=>{
  assert.equal(r.brokerGetEndpointsAtomic,false);
  assert.equal(r.historicalOrdersCompletelyCovered,false);
  assert.equal(r.accountWideCapitalAndMarginReconciled,false);
  assert.equal(r.independentExchangeChildAckCertified,false);
  assert.equal(r.protectiveStopCoverageCertified,false);
  assert.equal(r.confirmedExitSettlementAuthorized,false);
  assert.equal(r.netRealisedPnlAuthorized,false);
  assert.equal(r.automaticPositionClosureAuthorized,false);
  assert.equal(r.liveNrmlBuyAuthorized,false);
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  const json=JSON.stringify(r);
  for(const sensitive of [account,key,buyId,exitId,'PH103-SECRET'])
    assert.ok(!json.includes(sensitive));
};
describe('Phase103 broker account-wide option order/GTT/position census (never clearance)',()=>{
  it('exact one original BUY and completed SELL, net flat is only a NONCERTIFIED snapshot',()=>{
    const r=inspect(fixture());locked(r);
    assert.equal(r.state,'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED');
    assert.equal(r.currentDayOriginalBuyFound,true);
    assert.equal(r.currentDayExitSellFound,true);
    assert.equal(r.brokerNetLongQuantity,0);
    assert.equal(r.sameContractOtherOrderCount,0);
  });
  it('one completed SELL 50 with pending 50 and broker remaining long 50 is descriptive',()=>{
    const e=fixture();e.positions=[portfolio(50)];
    e.orderBook=[original(),{...exit(),
      status:'partially filled',filled_quantity:50,pending_quantity:50}];
    const r=inspect(e,{...s,confirmedExitFilledQuantity:50});locked(r);
    assert.equal(r.state,'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED');
    assert.equal(r.brokerNetLongQuantity,50);
  });
  it('original BUY omitted by day-limited broker order book is UNKNOWN, not proof of no BUY',()=>{
    const e=fixture();e.orderBook=[exit()];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'CURRENT_DAY_BROKER_HISTORY_INCOMPLETE');
    assert.ok(r.reasonCodes.includes(
      'ORIGINAL_BUY_NOT_VISIBLE_IN_CURRENT_DAY_ORDER_BOOK'));
  });
  it('SELL omitted from order book is UNKNOWN, never proof the exit did not execute',()=>{
    const e=fixture();e.orderBook=[original()];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'CURRENT_DAY_BROKER_HISTORY_INCOMPLETE');
    assert.ok(r.reasonCodes.includes(
      'EXIT_SELL_NOT_VISIBLE_IN_CURRENT_DAY_ORDER_BOOK'));
  });
  it('empty broker portfolio after reported flat SELL is not verified flat exposure',()=>{
    const e=fixture();e.positions=[];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'CURRENT_DAY_BROKER_HISTORY_INCOMPLETE');
    assert.equal(r.brokerNetLongQuantity,null);
  });
  it('broker net is stale after reported SELL, even if child status COMPLETE',()=>{
    const e=fixture();e.positions=[portfolio(100)];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
    assert.ok(r.reasonCodes.includes('BROKER_NET_DISAGREES_WITH_DURABLE_BUY_MINUS_SELL'));
  });
  it('duplicate same instrument/product portfolio rows cannot silently sum or net zero',()=>{
    const e=fixture();e.positions=[portfolio(),portfolio()];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'CURRENT_DAY_BROKER_HISTORY_INCOMPLETE');
    assert.ok(r.reasonCodes.includes('TARGET_POSITION_ABSENT_OR_DUPLICATED'));
  });
  it('same option MIS and NRML rows coexist => cross product exposure conflict',()=>{
    const e=fixture();e.positions=[portfolio(0,'I'),portfolio(100,'D')];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
    assert.ok(r.reasonCodes.includes('SAME_OPTION_OTHER_PRODUCT_PORTFOLIO_EXPOSURE'));
  });
  it('same option other-product order is not part of known MIS option settlement',()=>{
    const e=fixture();
    e.orderBook=[original(),exit(),{...original(),order_id:'PH103-NRML',
      product:'D'}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
  });
  it('another active BUY for this option could increase net after current position GET',()=>{
    const e=fixture();
    e.orderBook=[original(),exit(),{...original(),order_id:'PH103-PENDING-BUY',
      status:'open',filled_quantity:0,pending_quantity:100}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
    assert.equal(r.unresolvedOtherBuyCount,1);
  });
  it('another terminal BUY with executed quantity also invalidates original lineage',()=>{
    const e=fixture();
    e.orderBook=[original(),exit(),{...original(),order_id:'PH103-MANUAL-BUY'}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
    assert.equal(r.unresolvedOtherBuyCount,1);
  });
  it('another exchange-native SL-M SELL even with zero fill can execute twice',()=>{
    const e=fixture();
    e.orderBook=[original(),exit(),{...exit(),order_id:'PH103-SL-M',
      order_type:'SL-M',status:'trigger pending',filled_quantity:0,
      pending_quantity:100}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
    assert.equal(r.unresolvedOtherSellCount,1);
  });
  it('another cancelled SELL with 50 broker fills cannot be treated as harmless',()=>{
    const e=fixture();
    e.orderBook=[original(),exit(),{...exit(),order_id:'PH103-CANCELLED-SELL',
      status:'cancelled',filled_quantity:50,pending_quantity:0}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
  });
  it('terminal cancelled SELL with proven zero fills is not itself an active contender',()=>{
    const e=fixture();e.orderBook=[original(),exit(),
      {...exit(),order_id:'PH103-HISTORICAL-CANCELLED',
       status:'cancelled',filled_quantity:0,pending_quantity:0}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED');
    assert.equal(r.sameContractOtherOrderCount,1);
  });
  it('unknown sibling SELL fill count cannot be coerced to zero',()=>{
    const e=fixture();
    e.orderBook=[original(),exit(),{...exit(),
      order_id:'PH103-UNKNOWN-SELL',status:'cancelled',filled_quantity:null}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'CURRENT_DAY_BROKER_HISTORY_INCOMPLETE');
    assert.ok(r.reasonCodes.includes('SIBLING_SAME_OPTION_ORDER_FILL_UNKNOWN'));
  });
  it('duplicate broker order IDs or incomplete same-option status fail closed',()=>{
    for(const more of [[original(),exit(),exit()],
      [original(),exit(),{...exit(),order_id:'PH103-UNKNOWN',
        status:'unknown-broker-state'}]]){
      const e=fixture();e.orderBook=more;
      const r=inspect(e);locked(r);
      assert.notEqual(r.state,'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED');
    }
  });
  it('known completed SELL child with only half the requested quantity contradicts receipts',()=>{
    const e=fixture();e.positions=[portfolio(50)];
    e.orderBook=[original(),{...exit(),filled_quantity:50,
      pending_quantity:50,status:'complete'}];
    const r=inspect(e,{...s,confirmedExitFilledQuantity:50});locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
  });
  it('cancelled or rejected known SELL is not independently settled even if net appears flat',()=>{
    for(const status of ['cancelled','rejected','expired']){
      const e=fixture();
      e.orderBook=[original(),{...exit(),status}];
      const r=inspect(e);locked(r);
      assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
      assert.ok(r.reasonCodes.includes('EXIT_CHILD_TERMINAL_WITHOUT_VALIDATED_FULL_SELL'));
    }
  });
  it('one active GTT STOPLOSS SELL without exchange child is still potentially executable',()=>{
    const e=fixture();
    e.gttOrders=[{gtt_order_id:'GTT-PH103-STOP',instrument_token:key,
      product:'I',quantity:100,
      rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
        status:'SCHEDULED',order_id:null}]}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
    assert.equal(r.sameContractGttSellCount,1);
  });
  it('multiple GTT target/STOPLOSS legs are distinct potential SELL triggers',()=>{
    const e=fixture();
    e.gttOrders=[{gtt_order_id:'GTT-PH103-PARENT',
      instrument_token:key,product:'I',quantity:100,
      rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
        status:'TRIGGERED',order_id:exitId},
      {strategy:'TARGET',transaction_type:'SELL',
        status:'ACTIVE',order_id:null}]}];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
    assert.equal(r.sameContractGttSellCount,2);
    assert.equal(r.independentExchangeChildAckCertified,false);
  });
  it('cancelled or completed GTT SELL does not prove exchange fills absent',()=>{
    for(const status of ['CANCELLED','COMPLETE']){
      const e=fixture();e.gttOrders=[{
        gtt_order_id:'GTT-PH103-TERMINAL',instrument_token:key,
        product:'I',quantity:100,
        rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
          status,order_id:null}]
      }];
      const r=inspect(e);locked(r);
      assert.equal(r.state,'CURRENT_DAY_BROKER_HISTORY_INCOMPLETE');
    }
  });
  it('another active GTT BUY can create extra long exposure',()=>{
    const e=fixture();e.gttOrders=[{
      gtt_order_id:'GTT-PH103-BUY',instrument_token:key,
      product:'I',quantity:50,
      rules:[{strategy:'ENTRY',transaction_type:'BUY',
        status:'SCHEDULED',order_id:null}]
    }];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
  });
  it('another same-option GTT on NRML D cannot be ignored during MIS review',()=>{
    const e=fixture();e.gttOrders=[{
      gtt_order_id:'GTT-PH103-NRML',instrument_token:key,
      product:'D',quantity:100,
      rules:[{strategy:'STOPLOSS',transaction_type:'SELL',
        status:'SCHEDULED'}]
    }];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'SAME_CONTRACT_ACCOUNT_EXPOSURE_CONFLICT');
  });
  it('unrelated valid portfolio positions may coexist but account capital remains NOT certified',()=>{
    const e=fixture();
    e.positions=[portfolio(),portfolio(100,'D','NSE_FO|PH103-PE')];
    e.orderBook=[original(),exit(),{
      ...original(),order_id:'PH103-OTHER-BUY',instrument_token:'NSE_FO|PH103-PE'
    }];
    const r=inspect(e);locked(r);
    assert.equal(r.state,'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED');
    assert.equal(r.unrelatedInstrumentPositionCount,1);
    assert.equal(r.accountWideCapitalAndMarginReconciled,false);
  });
  it('malformed unrelated broker records cannot certify completeness of ACCOUNT lists',()=>{
    for(const field of ['positions','orderBook','gttOrders'] as const){
      const e=fixture();
      (e as unknown as Record<string,unknown>)[field]=[null];
      const r=inspect(e);locked(r);
      assert.notEqual(r.state,'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED');
    }
  });
  it('empty/null/transport-failed broker source never counts as a safe empty account',()=>{
    for(const field of ['positions','orderBook','gttOrders'] as const){
      const e=fixture();
      (e as unknown as Record<string,unknown>)[field]=null;
      const r=inspect(e);locked(r);
      assert.equal(r.state,'BROKER_SOURCES_INCOMPLETE');
    }
  });
  it('invalid account/instrument/lot/product/side ids are rejected before reads',async()=>{
    for(const patch of [
      {expectedAccountId:''},{instrumentKey:''},{product:'CNC'},
      {lotSize:0},{originalBuyQuantity:99},
      {originalBuyOrderId:exitId},{confirmedExitFilledQuantity:101}
    ]){
      const broker={
        getLiveConnectionStatus:()=>{throw Error('NO_AUTH_CALL_EXPECTED');},
        getOrderBook:async()=>{throw Error('NO_BROKER_READ');},
        getGttOrders:async()=>{throw Error('NO_BROKER_READ');},
        getVerifiedNrmlPositionRows:async()=>{throw Error('NO_BROKER_READ');}
      };
      const r=await reviewAccountWideExposureBrokerReadOnly(
        broker,{...s,...patch} as AccountWideExposureScope);locked(r);
      assert.equal(r.state,'INVALID_SCOPE');
    }
  });
  it('read-only adapter checks connected account BEFORE any private broker GETs',async()=>{
    let read=0;
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:'OTHER-ACCOUNT'}),
      getOrderBook:async()=>{read++;return [original(),exit()];},
      getGttOrders:async()=>{read++;return [];},
      getVerifiedNrmlPositionRows:async()=>{read++;return [portfolio()];}
    };
    const r=await reviewAccountWideExposureBrokerReadOnly(broker,s);
    locked(r);assert.equal(read,0);
    assert.equal(r.state,'BROKER_ACCOUNT_NOT_AUTHENTICATED');
  });
  it('read-only adapter fetches book then GTT then portfolio; never places orders',async()=>{
    const calls:string[]=[];
    const broker={
      getLiveConnectionStatus:()=>{
        calls.push('auth');return {isConnected:true,userId:account};
      },
      getOrderBook:async()=>{calls.push('book');return [original(),exit()];},
      getGttOrders:async()=>{calls.push('gtt');return [];},
      getVerifiedNrmlPositionRows:async()=>{
        calls.push('positions');return [portfolio()];
      },
      placeOrder:()=>{throw Error('NO_WRITE');},
      placeGttOrder:()=>{throw Error('NO_WRITE');},
      cancelOrder:()=>{throw Error('NO_WRITE');}
    };
    const r=await reviewAccountWideExposureBrokerReadOnly(broker,s);locked(r);
    assert.equal(r.state,'NO_VISIBLE_EXTRA_EXPOSURE_NOT_CERTIFIED');
    assert.deepEqual(calls,['auth','book','gtt','positions']);
  });
  it('transport failure returns redacted UNKNOWN, no tokens and no fake empty source',async()=>{
    const broker={
      getLiveConnectionStatus:()=>({isConnected:true,userId:account}),
      getOrderBook:async()=>{throw Error('BEARER_PH103_SECRET');},
      getGttOrders:async()=>[],
      getVerifiedNrmlPositionRows:async()=>[portfolio()]
    };
    const r=await reviewAccountWideExposureBrokerReadOnly(broker,s);
    locked(r);assert.equal(r.state,'BROKER_SOURCES_INCOMPLETE');
    assert.ok(!JSON.stringify(r).includes('BEARER'));
  });
  it('server endpoint only returns redacted current-day census and does not mutate DB or broker',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const a=app.indexOf("app.post('/api/ema15m/account-wide-exposure-review'");
    const b=app.indexOf('  // 6. Save Notification Settings',a);
    assert.ok(a>0&&b>a);
    const route=app.slice(a,b);
    assert.ok(route.includes('requireSuperAdmin'));
    assert.ok(route.includes('reviewAccountWideExposureBrokerReadOnly('));
    assert.ok(route.includes('readEmaJointBuySellEvidence('));
    assert.ok(route.includes('JSON.stringify(before)!==JSON.stringify(after)'));
    assert.ok(!route.includes('placeOrder('));
    assert.ok(!route.includes('cancelOrder('));
    assert.ok(!route.includes('updateEmaLivePosition('));
    assert.ok(!route.includes('calculateOptionNetPnl('));
  });
});
