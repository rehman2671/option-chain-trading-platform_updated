import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  auditExistingSingleSellGttReadOnly,
  reviewExistingSingleSellGttTwoPassReadOnly,
  type SingleSellGttScope,type SingleSellGttSnapshot,
  type SingleSellGttReport,type ExistingSingleSellGttBroker
} from '../../server/engine/ema15m/adaptiveExistingNrmlSingleSellGttReadOnly.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const scope:SingleSellGttScope={
  expectedAccountId:'PH112-PRIVATE-ACCOUNT',
  instrumentKey:'NSE_FO|PH112-PRIVATE-CE',
  originalBuyOrderId:'PH112-ORIGINAL-BUY',
  gttOrderId:'GTT-PH112-SINGLE-SELL',
  originalLongQuantity:100,lotSize:50,horizonWeeks:4,
  observedAt:'2026-11-22T18:00:00+05:30'
};
const micros=(s:string)=>Date.parse(s)*1000;
const rule=(x:Record<string,unknown>={})=>({
  strategy:'ENTRY',status:'SCHEDULED',transaction_type:'SELL',
  trigger_type:'BELOW',trigger_price:90,order_id:null,...x
});
const parent=(x:Record<string,unknown>={},rules:unknown[]=[rule()])=>({
  type:'SINGLE',gtt_order_id:scope.gttOrderId,
  product:'D',instrument_token:scope.instrumentKey,
  quantity:100,created_at:micros('2026-11-21T10:00:00+05:30'),
  expires_at:micros('2027-03-15T15:30:00+05:30'),
  rules,...x
});
const buy=()=>({
  order_id:scope.originalBuyOrderId,
  instrument_token:scope.instrumentKey,product:'D',
  transaction_type:'BUY',status:'complete',filled_quantity:100
});
const net=(qty:unknown=100)=>({
  instrument_token:scope.instrumentKey,
  product:'D',net_quantity:qty
});
const fixture=():SingleSellGttSnapshot=>{
  const p=parent();
  return {exactGtt:[p],allGtts:[p],
    orderBook:[buy()],positions:[net()]};
};
const audit=(snapshot=fixture(),s=scope)=>
  auditExistingSingleSellGttReadOnly(s,snapshot);
const broker=(overrides:Partial<ExistingSingleSellGttBroker>={},
 calls:string[]=[]):ExistingSingleSellGttBroker=>({
  getLiveConnectionStatus:()=>({isConnected:true,userId:scope.expectedAccountId}),
  getBrokerAuthEpoch:()=>1,
  getGttOrderDetails:async()=>{calls.push('exactGtt');return [parent()];},
  getGttOrders:async()=>{calls.push('allGtts');return [parent()];},
  getOrderBook:async()=>{calls.push('orderBook');return [buy()];},
  getVerifiedNrmlPositionRows:async()=>{calls.push('net');return [net()];},
  ...overrides
});
function blocked(r:SingleSellGttReport){
  assert.equal(r.brokerReportedGttSellConditionNotNativeExchangeStop,true);
  assert.equal(r.noGeneratedChildWhileScheduled,true);
  assert.equal(r.noNewBuyCreatedByThisReadOnlyReview,true);
  assert.equal(r.originalBuyAndGttSellAreIndependentOrders,true);
  for(const flag of [
    'specificFnoContractGttEligibleIndependentlyVerified',
    'brokerSellCanOnlyCloseExistingLongIndependentlyCertified',
    'exchangeNativeStopAckCertified','limitSellCanFillOnGapGuaranteed',
    'continuouslyProtectedAcrossNight','capitalAndMarginRiskApproved',
    'officialExpiryCalendarCertified','accountWideHistoricalTradesCertified',
    'crossSessionGttLifecycleCertified','liveNrmlBuyAuthorized',
    'autoPositionClosureAuthorized','realisedPnlWriteAuthorized',
    'orderOrGttMutationAuthorized'
  ] as const) assert.equal(r[flag],false,flag);
  assert.equal(r.brokerWrites,0);assert.equal(r.localWrites,0);
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  for(const value of [scope.expectedAccountId,scope.instrumentKey,
    scope.originalBuyOrderId,scope.gttOrderId,
    'PH112-EXCHANGE-CHILD','PH112-ACCOUNT-TOKEN'])
    assert.equal(JSON.stringify(r).includes(value),false);
}
describe('Phase112 SINGLE SELL ENTRY GTT read-only existing NRML long feasibility',()=>{
  it('1/2/4/8W broker-scheduled SELL ENTRY BELOW has no generated child/stop ACK',()=>{
    for(const weeks of [1,2,4,8] as const){
      const r=audit(fixture(),{...scope,horizonWeeks:weeks});
      blocked(r);
      assert.equal(r.state,'SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP');
      assert.equal(r.horizonWeeks,weeks);
      assert.equal(r.plannedCalendarDays,weeks*7);
      assert.equal(r.brokerReportedRemainingLongQuantity,100);
      assert.equal(r.brokerReportedConditionalSellQuantity,100);
      assert.equal(r.brokerReportedScheduledSingleSellCondition,true);
      assert.equal(r.brokerReportedGttExpirationAfterPlanningHorizon,true);
    }
  });
  it('partial remaining 50 requires a 50-unit SELL rule, never original 100',()=>{
    const x=fixture(),p=parent({quantity:50});
    x.exactGtt=[p];x.allGtts=[p];x.positions=[net('50')];
    const r=audit(x);blocked(r);
    assert.equal(r.state,'SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP');
    assert.equal(r.brokerReportedConditionalSellQuantity,50);
    assert.equal(r.brokerReportedRemainingLongQuantity,50);
    const y=fixture();y.positions=[net(50)];
    const z=audit(y);blocked(z);
    assert.equal(z.state,'GTT_SINGLE_SELL_ENTRY_SCHEMA_MISMATCH');
  });
  it('SINGLE GTT SELL ENTRY is different from MULTIPLE with BUY ENTRY',()=>{
    for(const p of [
      parent({type:'MULTIPLE'},[rule()]),
      parent({},[rule(),rule()]),
      parent({},[{...rule(),strategy:'STOPLOSS'}]),
      parent({},[rule({transaction_type:'BUY'})]),
      parent({},[rule({trigger_type:'ABOVE'})]),
      parent({},[rule({trigger_type:'IMMEDIATE'})])
    ]){
      const x=fixture();x.exactGtt=[p];x.allGtts=[p];
      const r=audit(x);blocked(r);
      assert.equal(r.state,'GTT_SINGLE_SELL_ENTRY_SCHEMA_MISMATCH');
    }
  });
  it('wrong contract, product, parent ID, size and unpriced rule fail closed',()=>{
    const cases=[
      parent({instrument_token:'NSE_FO|PH112-OTHER'}),
      parent({product:'I'}),
      parent({gtt_order_id:'GTT-PH112-OTHER'}),
      parent({quantity:50}),
      parent({},[rule({trigger_price:0})]),
      parent({},[rule({trigger_price:-2})]),
      parent({},[rule({trigger_price:90.002})]),
      parent({},[rule({trigger_price:NaN})])
    ];
    for(const p of cases){
      const x=fixture();x.exactGtt=[p];x.allGtts=[p];
      const r=audit(x);blocked(r);
      assert.equal(r.state,'GTT_SINGLE_SELL_ENTRY_SCHEMA_MISMATCH');
    }
  });
  it('GTT entry triggered, cancelled, failed, expired or generated child is NOT scheduled protective coverage',()=>{
    for(const ruleEdit of [
      {status:'TRIGGERED',order_id:'PH112-EXCHANGE-CHILD'},
      {status:'CANCELLED'},{status:'FAILED'},{status:'EXPIRED'},
      {status:'PENDING'},{status:'OPEN'},
      {status:'SCHEDULED',order_id:'PH112-EXCHANGE-CHILD'}
    ]){
      const p=parent({},[rule(ruleEdit)]);
      const x=fixture();x.exactGtt=[p];x.allGtts=[p];
      const r=audit(x);blocked(r);
      assert.equal(r.state,'GTT_RULE_TRIGGERED_OR_CANCELLED_NOT_SCHEDULED');
      assert.equal(r.brokerReportedConditionalSellQuantity,null);
    }
  });
  it('GTT expiry must reach 8W horizon; broker microseconds are not milliseconds',()=>{
    const x=fixture(),p=parent({
      expires_at:micros('2026-11-28T15:30:00+05:30')
    });
    x.exactGtt=[p];x.allGtts=[p];
    const r=audit(x);blocked(r);
    assert.equal(r.state,'GTT_CONDITION_EXPIRES_BEFORE_PLANNED_HORIZON');
    const withZero=fixture(),q=parent({expires_at:0});
    withZero.exactGtt=[q];withZero.allGtts=[q];
    const z=audit(withZero);blocked(z);
    assert.equal(z.state,'GTT_CONDITION_EXPIRES_BEFORE_PLANNED_HORIZON');
  });
  it('GTT created in future, expires before created or >366 days reject',()=>{
    const cases=[
      {created_at:micros('2027-01-01T10:00:00+05:30')},
      {expires_at:micros('2026-11-19T10:00:00+05:30')},
      {expires_at:micros('2029-11-19T10:00:00+05:30')},
      {created_at:9007199254740992}
    ];
    for(const edit of cases){
      const p=parent(edit);
      const x=fixture();x.exactGtt=[p];x.allGtts=[p];
      const r=audit(x);blocked(r);
      assert.equal(r.state,'GTT_CONDITION_EXPIRES_BEFORE_PLANNED_HORIZON');
    }
  });
  it('full account GTT list must exactly corroborate selected parent',()=>{
    const cases=[
      [],
      [parent({quantity:50})],
      [parent(),parent()],
      [parent({},[rule({trigger_price:89})])]
    ];
    for(const allGtts of cases){
      const x=fixture();x.allGtts=allGtts;
      const r=audit(x);blocked(r);
      assert.equal(r.state,'GTT_OR_ACCOUNT_CENSUS_INCOMPLETE');
    }
  });
  it('extra same-contract GTT could create a duplicate BUY or SELL',()=>{
    const x=fixture();x.allGtts=[parent(),parent({
      gtt_order_id:'GTT-PH112-SECOND',quantity:100
    })];
    const r=audit(x);blocked(r);
    assert.equal(r.state,'BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT');
  });
  it('new buy, competing sell or filled independent SELL cannot certify no oversell',()=>{
    for(const candidate of [
      {order_id:'PH112-SECOND-BUY',transaction_type:'BUY',
        status:'open',filled_quantity:0},
      {order_id:'PH112-SECOND-SELL',transaction_type:'SELL',
        status:'trigger pending',filled_quantity:0},
      {order_id:'PH112-OTHER-FILLED-SELL',transaction_type:'SELL',
        status:'complete',filled_quantity:50}
    ]){
      const x=fixture();x.orderBook=[buy(),{
        instrument_token:scope.instrumentKey,product:'D',...candidate
      }];
      const r=audit(x);blocked(r);
      assert.equal(r.state,'BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT');
    }
  });
  it('terminal zero-fill unrelated SELL does not create exchange protection',()=>{
    const x=fixture();x.orderBook=[buy(),{
      order_id:'PH112-CANCELLED-SELL',instrument_token:scope.instrumentKey,
      product:'D',transaction_type:'SELL',
      status:'cancelled',filled_quantity:0
    }];
    const r=audit(x);blocked(r);
    assert.equal(r.state,'SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP');
  });
  it('unknown net, duplicate net, wrong product, missing row or zero exposure reject',()=>{
    for(const positions of [
      [],[net(100),net(100)],[net(0)],[net(-50)],[net('1e2')],
      [net('0100')],[net(75)],[net(150)],
      [net(100),{...net(100),product:'I'}]
    ]){
      const x=fixture();x.positions=positions;
      const r=audit(x);blocked(r);
      assert.equal(r.state,'BROKER_ACCOUNT_POSITION_OR_COMPETING_ORDERS_CONFLICT');
    }
  });
  it('failed/missing GTT, orderbook or positions must not appear as empty clean lists',()=>{
    for(const key of ['exactGtt','allGtts','orderBook','positions'] as const){
      const x=fixture();(x as any)[key]=null;
      const r=audit(x);blocked(r);
      assert.equal(r.state,'GTT_OR_ACCOUNT_CENSUS_INCOMPLETE');
    }
  });
  it('two read passes are identical but cannot certify broker or exchange overnight stop',async()=>{
    const calls:string[]=[];
    const r=await reviewExistingSingleSellGttTwoPassReadOnly(broker({},calls),scope);
    blocked(r);
    assert.equal(r.state,'SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP');
    assert.equal(r.completedReadPasses,2);
    assert.equal(r.sameBrokerAccountAndAuthEpochAcrossReads,true);
    assert.equal(calls.length,8);
    assert.equal(calls.filter(x=>x==='exactGtt').length,2);
  });
  it('same-account reconnect while first GET batch is in flight quarantines before second pass',async()=>{
    let epoch=10,getCount=0;
    const b=broker({
      getBrokerAuthEpoch:()=>epoch,
      getGttOrderDetails:async()=>{getCount++;epoch++;return [parent()];}
    });
    const r=await reviewExistingSingleSellGttTwoPassReadOnly(b,scope);
    blocked(r);
    assert.equal(r.state,'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED');
    assert.equal(r.completedReadPasses,1);
    assert.equal(getCount,1);
  });
  it('account switch in second batch rejects mixed account data',async()=>{
    let reads=0,account=scope.expectedAccountId;
    const b=broker({
      getLiveConnectionStatus:()=>({isConnected:true,userId:account}),
      getGttOrderDetails:async()=>{
        reads++;if(reads===2)account='PH112-OTHER-ACCOUNT';
        return [parent()];
      }
    });
    const r=await reviewExistingSingleSellGttTwoPassReadOnly(b,scope);
    blocked(r);
    assert.equal(r.state,'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED');
    assert.equal(r.completedReadPasses,2);
  });
  it('GTT trigger price modified between two good batches causes drift quarantine',async()=>{
    let pass=0;
    const b=broker({
      getGttOrderDetails:async()=>{
        pass++;return [parent({},[rule({trigger_price:pass===1?90:85})])];
      },
      getGttOrders:async()=>[parent({},[
        rule({trigger_price:pass===1?90:85})])]
    });
    const r=await reviewExistingSingleSellGttTwoPassReadOnly(b,scope);
    blocked(r);
    assert.equal(r.state,'GTT_OR_BROKER_NET_CHANGED_BETWEEN_GET_PASSES');
    assert.equal(r.completedReadPasses,2);
    assert.equal(r.brokerReportedConditionalSellQuantity,null);
  });
  it('second-pass changed net or GTT cancellation is never a clean observation',async()=>{
    for(const kind of ['net','cancel'] as const){
      let pass=0;
      const b=broker({
        getGttOrderDetails:async()=>{pass++;return [
          parent({},[rule(pass===2&&kind==='cancel'?{status:'CANCELLED'}:{})])
        ];},
        getGttOrders:async()=>[
          parent({},[rule(pass===2&&kind==='cancel'?{status:'CANCELLED'}:{})])
        ],
        getVerifiedNrmlPositionRows:async()=>[
          net(pass===2&&kind==='net'?50:100)
        ]
      });
      const r=await reviewExistingSingleSellGttTwoPassReadOnly(b,scope);
      blocked(r);
      assert.notEqual(r.state,'SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP');
    }
  });
  it('wrong broker account or invalid/missing epoch fails before any network GET',async()=>{
    for(const change of [
      {getBrokerAuthEpoch:()=>0},
      {getBrokerAuthEpoch:()=>1.5},
      {getLiveConnectionStatus:()=>({isConnected:false,userId:scope.expectedAccountId})},
      {getLiveConnectionStatus:()=>({isConnected:true,userId:'PH112-OTHER'})}
    ]){
      let called=0;
      const b=broker({...change,
        getGttOrderDetails:async()=>{called++;return [parent()];}
      });
      const r=await reviewExistingSingleSellGttTwoPassReadOnly(b,scope);
      blocked(r);
      assert.equal(r.state,'BROKER_SESSION_OR_AUTH_EPOCH_UNVERIFIED');
      assert.equal(called,0);
    }
  });
  it('read failure reduces broker token and secrets to fixed reason',async()=>{
    const r=await reviewExistingSingleSellGttTwoPassReadOnly(broker({
      getGttOrders:async()=>{throw Error('PH112-ACCOUNT-TOKEN');}
    }),scope);
    blocked(r);
    assert.equal(r.state,'GTT_OR_ACCOUNT_CENSUS_INCOMPLETE');
  });
  it('invalid option, GTT id, lots, time or horizon are rejected before reads',async()=>{
    for(const bad of [
      {...scope,instrumentKey:'NSE_EQ|STOCK'},
      {...scope,gttOrderId:'WRONG'},
      {...scope,lotSize:0},
      {...scope,originalLongQuantity:75},
      {...scope,horizonWeeks:3 as any},
      {...scope,observedAt:'22/11/2026'}
    ]){
      let called=0;
      const r=await reviewExistingSingleSellGttTwoPassReadOnly(broker({
        getGttOrderDetails:async()=>{called++;return [parent()];}
      }),bad);
      blocked(r);assert.equal(r.state,'INVALID_SCOPE');
      assert.equal(called,0);
    }
  });
  it('SUPERADMIN route uses durable BUY receipt and contains zero broker writes',()=>{
    const src=readFileSync('serverApp.ts','utf8');
    const a=src.indexOf("app.post('/api/ema15m/nrml-existing-single-sell-gtt-review'");
    const b=src.indexOf('  // Phase95:',a);
    assert.ok(a>0&&b>a);
    const route=src.slice(a,b);
    for(const v of [
      'requireSuperAdmin','no-store','getOpenEmaLivePositions',
      'readEmaJointBuySellEvidence','immutableOriginalDebitMatchesReceipt',
      'reviewExistingSingleSellGttTwoPassReadOnly','getBrokerAuthEpoch',
      'JSON.stringify(prior)!==JSON.stringify(latest)'
    ])assert.ok(route.includes(v),v);
    for(const v of ['placeOrder(','cancelOrder(','modifyOrder(',
      'placeGttOrder(','saveEmaLivePosition(','updateEmaLivePosition(',
      'squareOff(','broker.placeOrder('])
      assert.equal(route.includes(v),false,v);
  });
});
