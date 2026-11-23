import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  triageNrmlOfflineIncidentReadOnly,
  type OfflineNrmlIncidentInput,
  type OfflineNrmlIncidentReport,
  type NrmlIncidentKind
} from '../../server/engine/ema15m/adaptiveNrmlOfflineIncidentTriage.js';
import type {NativeOrderTradeTimeInput} from
  '../../server/engine/ema15m/adaptiveUpstoxNativeTradeClockProvenanceReadOnly.js';
import {assessEmaLiveProductGate,isMisForcedSquareOffEligible}
  from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const account='PH128-PRIVATE-ACCOUNT';
const epoch='PH128-PRIVATE-EPOCH';
const key='NSE_FO|PH128-OPTION';
const original='PH128-ORIGINAL-BUY';
const exchangeOrder='PH128-EXCHANGE-ORDER';
const gttId='GTT-PH128-SELL';
const firstAt='2026-11-23T04:00:01.000Z';
const secondAt='2026-11-23T04:00:03.000Z';
const review='2026-11-23T04:01:00.000Z';
const assessed='2026-11-23T04:01:10.000Z';
const micros=(x:string)=>Date.parse(x)*1000;
const originalOrder=(patch:Record<string,unknown>={})=>({
  order_id:original,exchange_order_id:exchangeOrder,
  instrument_token:key,product:'D',transaction_type:'BUY',
  quantity:100,filled_quantity:100,pending_quantity:0,
  average_price:100,status:'COMPLETE',...patch
});
const gtt=(patch:Record<string,unknown>={})=>({
  gtt_order_id:gttId,instrument_token:key,exchange:'NSE_FO',
  product:'D',type:'SINGLE',quantity:100,
  created_at:micros('2026-11-23T03:45:00.000Z'),
  expires_at:micros('2026-12-25T00:00:00.000Z'),
  rules:[{strategy:'ENTRY',transaction_type:'SELL',
    trigger_type:'BELOW',trigger_price:95,status:'SCHEDULED',
    order_id:null}],...patch
});
const position=()=>[
  {instrument_token:key,product:'D',net_quantity:100}
];
const trade=(id:string,qty:number,premium:number)=>({
  trade_id:id,order_id:original,exchange_order_id:exchangeOrder,
  instrument_token:key,exchange:'NFO',product:'D',
  transaction_type:'BUY',quantity:qty,average_price:premium,
  exchange_timestamp:'23-Nov-2026 09:15:00'
});
const input=(at:string):NativeOrderTradeTimeInput=>({
  cohortScope:{
    instrumentKey:key,originalBuyOrderId:original,
    expectedExchangeOrderId:exchangeOrder,gttOrderId:gttId,
    product:'NRML',selectedWeeks:4,
    originalQuantity:100,lotSize:50,
    assertedCurrentNetLongQuantity:100,reviewedAtUtc:review,
    assertedContractExpiryUtc:'2027-01-15T00:00:00.000Z'
  },
  cohortEvidence:{
    originalBuyOrder:originalOrder(),orderBook:[originalOrder()],
    positions:position(),existingSingleSellGtt:gtt()
  },
  perOrderTradeResponse:{status:'success',data:[
    trade('PH128-TRADE-1',60,90),trade('PH128-TRADE-2',40,115)
  ]},
  sourceMethod:'GET',sourcePath:'/v2/order/trades',
  captureOrigin:'OPERATOR_CAPTURED_UNVERIFIED',
  exchangeClockAssumption:'ASSUME_ASIA_KOLKATA_UNVERIFIED',
  captureAtUtc:at,maxCaptureAgeMinutes:15
});
const captured=(source:'ORDER_BOOK'|'GTT_ORDERS'|'POSITIONS',
  time:string,req:string,rows:unknown)=>({
    source,captureAtUtc:time,requestReceiptId:req,
    accountId:account,authEpoch:epoch,rows
  });
const t=(offset:number)=>new Date(
  Date.parse('2026-11-23T04:00:04.000Z')+offset).toISOString();
const pass=(offset:number,tag:string)=>({
  orderBefore:captured('ORDER_BOOK',t(offset),tag+'-ORD-1',
    [originalOrder()]),
  gtt:captured('GTT_ORDERS',t(offset+100),tag+'-GTT',[gtt()]),
  positions:captured('POSITIONS',t(offset+200),tag+'-POS',
    position()),
  orderAfter:captured('ORDER_BOOK',t(offset+300),tag+'-ORD-2',
    [originalOrder()])
});
const fixture=(kind:NrmlIncidentKind='REGULAR_READ_REVIEW')
  :OfflineNrmlIncidentInput=>{
  const originalBuy={
    expectedAccountId:account,expectedAuthEpoch:epoch,
    maxReadSeparationSeconds:30,
    first:{accountId:account,authEpoch:epoch,
      requestReceiptId:'PH128-REQ-1',input:input(firstAt)},
    second:{accountId:account,authEpoch:epoch,
      requestReceiptId:'PH128-REQ-2',input:input(secondAt)}
  };
  return {
    schemaVersion:'ADAPTIVE_NRML_PHASE128_HALT_TRIAGE_V1',
    incidentRef:'PH128-INCIDENT-1',incidentKind:kind,
    assessmentAtUtc:assessed,maximumSourceAgeSeconds:120,
    scope:'EXISTING_NRML_OPTION_LONG_ONLY',
    captureOrigin:'OPERATOR_SUPPLIED_UNATTESTED',
    braided:{
      originalBuyAndCensus:{
        originalBuy,
        first:{
          accountId:account,authEpoch:epoch,
          requestReceiptId:'PH128-REQ-1',captureAtUtc:firstAt,
          allGttOrders:[gtt()],
          orderBookIsCurrentTradingDayOnly:true,
          gttGetCannotRetrieveCompletedParents:true
        },
        second:{
          accountId:account,authEpoch:epoch,
          requestReceiptId:'PH128-REQ-2',captureAtUtc:secondAt,
          allGttOrders:[gtt()],
          orderBookIsCurrentTradingDayOnly:true,
          gttGetCannotRetrieveCompletedParents:true
        }
      },
      first:pass(0,'PH128-A'),
      second:pass(1000,'PH128-B'),
      maxPassWindowSeconds:1,maxTotalReadWindowSeconds:3,
      currentDayOnlyOrderBook:true,
      completedGttParentsUnavailable:true
    }
  };
};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const triage=(f:OfflineNrmlIncidentInput=fixture())=>
  triageNrmlOfflineIncidentReadOnly(f);
function noWrites(r:OfflineNrmlIncidentReport){
  assert.equal(r.brokerWrites,0);
  assert.equal(r.localWrites,0);
  assert.equal(r.incidentIsManualReviewNotBrokerInstruction,true);
  assert.equal(r.operatorActionSuggestionsOnly,true);
  assert.equal(r.operatorFreezeActuallyEngaged,false);
  for(const f of [
    'independentHumanRiskApprovalVerified',
    'currentBrokerAccountActuallyReAuthenticated',
    'externalCalendarAndExpiryActuallyVerified',
    'originalOptionL1LicensedAndBacktested',
    'brokerStopChildNativeExchangeAckVerified',
    'closeOnlyNrmlSellNoShortPermissionVerified',
    'overlappingSellExposureCleared',
    'overnightGapFillGuaranteed',
    'originalHistoricalAccountOrderGttHistoryComplete',
    'liveNrmlBuyAuthorized',
    'automaticBrokerStopPlacementAuthorized',
    'automaticExitOrEmergencySellAuthorized',
    'duplicateSellRetryAuthorized',
    'autoCloseOrRealisedPnlAuthorized',
    'nrml1515SquareOffAuthorized'
  ] as const)assert.equal(r[f],false,f);
  for(const action of [
    'FREEZE_NEW_NRML_ENTRIES_MANUALLY',
    'DO_NOT_RETRY_SELL_OR_CANCEL_REPLACE_FROM_OFFLINE_REPORT',
    'DO_NOT_WRITE_CLOSED_POSITION_OR_REALIZED_PNL',
    'DO_NOT_APPLY_MIS_1515_SQUAREOFF_TO_NRML'
  ])assert.ok(r.manualActions.includes(action as typeof r.manualActions[number]));
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  assert.equal(isMisForcedSquareOffEligible({
    productType:'NRML',status:'OPEN'
  }),false);
  const out=JSON.stringify(r);
  for(const sensitive of [
    account,epoch,key,original,exchangeOrder,gttId,
    'PH128-REQ-1','PH128-TRADE-1','PH128-PRIVATE-TOKEN'
  ])assert.equal(out.includes(sensitive),false);
}
describe('Phase128 pure halt-only operator NRML incident triage',()=>{
  it('stable operator captures still require manual source and GTT reconciliation',()=>{
    const r=triage();noWrites(r);
    assert.equal(r.state,
      'CURRENT_EVIDENCE_AMBIGUOUS_MANUAL_RECONCILIATION');
    assert.equal(r.phase127State,
      'EIGHT_SOURCE_READ_BRAID_STABLE_SAME_SECOND_GTT_UNRESOLVED');
    assert.equal(r.observedEvidenceAgeMs,
      Date.parse(assessed)-Date.parse(t(1300)));
  });
  it('all eight operational incident types force manual contact, never automatic SELL',()=>{
    const kinds:NrmlIncidentKind[]=[
      'BROKER_RECONNECT','RESTART_RECOVERY','BUY_PARTIAL_FILL',
      'SELL_CHILD_UNKNOWN_ACK','OVERNIGHT_GAP',
      'GTT_PARENT_MISSING','EXPIRY_APPROACHING'
    ];
    for(const kind of kinds){
      const r=triage(fixture(kind));noWrites(r);
      assert.equal(r.state,
        'PARTIAL_FILL_UNKNOWN_ACK_RESTART_OR_GAP_MANUAL_RESPONSE');
      assert.ok(r.manualActions.includes(
        'CONTACT_BROKER_AND_DESIGNATED_HUMAN_RISK_OPERATOR'));
    }
  });
  it('stale, future or pre-review source clocks reject before evaluating order risk',()=>{
    for(const changes of [
      {assessmentAtUtc:'2026-11-23T04:05:00.000Z'},
      {assessmentAtUtc:'2026-11-23T04:00:05.000Z'},
      {assessmentAtUtc:'2026-11-23T04:00:00.000Z'},
      {maximumSourceAgeSeconds:1}
    ]){
      const r=triage({...fixture(),...changes});noWrites(r);
      assert.equal(r.state,
        'BROKER_SNAPSHOT_STALE_OR_REVIEW_IN_FUTURE');
      assert.equal(r.phase127State,null);
    }
  });
  it('invalid review envelope, schema, product and incident type never become release',()=>{
    for(const patch of [
      {schemaVersion:'PH128'},
      {incidentRef:''},
      {incidentKind:'SIGNED_STOP'},
      {assessmentAtUtc:'2026-11-23T21:14:00+05:30'},
      {scope:'MIS'},
      {captureOrigin:'EXCHANGE_SIGNED'},
      {maximumSourceAgeSeconds:0},
      {maximumSourceAgeSeconds:121},
      {maximumSourceAgeSeconds:1.5}
    ]){
      const r=triage({...fixture(),...patch} as OfflineNrmlIncidentInput);
      noWrites(r);
      assert.equal(r.state,'INVALID_INCIDENT_SCOPE_OR_SOURCE_CLOCK');
    }
  });
  it('auth epoch changed during GTT GET requires broker and risk manual escalation',()=>{
    const x=fixture();x.braided.second.gtt.authEpoch='PH128-CHANGED';
    const r=triage(x);noWrites(r);
    assert.equal(r.state,
      'BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT');
    assert.equal(r.phase127State,
      'BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_BETWEEN_ENDPOINTS');
    assert.ok(r.manualActions.includes(
      'CONTACT_BROKER_AND_DESIGNATED_HUMAN_RISK_OPERATOR'));
  });
  it('unknown child/changed orderbook after GTT cannot be called protected',()=>{
    const x=fixture();
    x.braided.first.orderAfter.rows=[originalOrder({
      filled_quantity:50
    })];
    const r=triage(x);noWrites(r);
    assert.equal(r.state,
      'BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT');
    assert.equal(r.phase127State,
      'ORDERBOOK_CHANGED_WITHIN_FIRST_OR_SECOND_PASS');
  });
  it('GTT trigger/price/child status drift cannot be an automatic retry reason',()=>{
    const x=fixture();
    x.braided.second.gtt.rows=[gtt({
      rules:[{strategy:'ENTRY',transaction_type:'SELL',
        trigger_type:'BELOW',trigger_price:95,status:'TRIGGERED',
        order_id:'PH128-CHILD'}]
    })];
    const r=triage(x);noWrites(r);
    assert.equal(r.state,'BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT');
    assert.equal(r.phase127State,'GTT_PARENT_CHANGED_BETWEEN_PASSES');
  });
  it('repeated stable captures do not forgive a missing original BUY today',()=>{
    const x=fixture();
    for(const pass of [x.braided.originalBuyAndCensus.originalBuy.first,
      x.braided.originalBuyAndCensus.originalBuy.second]){
      pass.input.cohortEvidence={
        ...pass.input.cohortEvidence,orderBook:[]
      };
    }
    for(const p of [x.braided.first,x.braided.second]){
      p.orderBefore.rows=[];p.orderAfter.rows=[];
    }
    const r=triage(x);noWrites(r);
    assert.equal(r.state,
      'BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT');
    assert.equal(r.phase127State,
      'PHASE126_BUY_CENSUS_OR_GTT_ALREADY_QUARANTINED');
  });
  it('malformed account GTT and duplicate order IDs remain manual-review conflicts',()=>{
    const cases=[
      (x:OfflineNrmlIncidentInput)=>{
        x.braided.first.gtt.rows=[null];
      },
      (x:OfflineNrmlIncidentInput)=>{
        x.braided.second.orderAfter.rows=[
          originalOrder(),originalOrder()
        ];
      }
    ];
    for(const fn of cases){
      const x=fixture();fn(x);
      const r=triage(x);noWrites(r);
      assert.equal(r.state,
        'BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT');
    }
  });
  it('does not trust a forged successful Phase127 result embedded in input',()=>{
    const x=fixture();
    const bad=clone(x) as OfflineNrmlIncidentInput&{
      claimedApproval?:unknown;
    };
    bad.claimedApproval={
      state:'EIGHT_SOURCE_READ_BRAID_STABLE_NOT_HISTORICALLY_ATTESTED',
      liveNrmlBuyAuthorized:true,
      brokerStopChildNativeExchangeAckVerified:true
    };
    bad.braided.first.orderAfter.rows=[originalOrder({
      filled_quantity:0
    })];
    const r=triage(bad);noWrites(r);
    assert.equal(r.state,
      'BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT');
  });
  it('source is pure and does not claim to engage the actual operator kill switch',()=>{
    const source=readFileSync(
      'src/server/engine/ema15m/adaptiveNrmlOfflineIncidentTriage.ts',
      'utf8'
    );
    for(const prohibited of [
      'fetch(','.getOrderBook(','.getGttOrders(',
      '.placeOrder(','.cancelOrder(','.modifyOrder(',
      '.placeGttOrder(','writeFileSync(','dbEngine.',
      'killSwitchEngine.','Date.now(','server.listen('
    ])assert.equal(source.includes(prohibited),false,prohibited);
    noWrites(triage());
  });
});
