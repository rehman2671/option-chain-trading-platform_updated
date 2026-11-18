import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase40ArchivedGttOvernights,
  auditPhase40ArchivedChildHistory,
  hashPhase40OfflineArchive,
  type Phase40GttAuditInput,
  type Phase40IndependentArchivePins,
  type Phase40GttCapture,
  type Phase40OrderHistoryInput,
  type Phase40OrderHistoryPins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.js';

const account='SYNTHETIC_PRIVATE_UCC_PHASE40';
const instrument='NSE_FO|SYNTHETIC_24000_CE';
const gtt='GTT-C-SYNTHETIC-PHASE40';
const close='2026-11-20T15:30:00+05:30',
  before='2026-11-20T15:25:00+05:30',
  open='2026-11-23T09:15:00+05:30',
  after='2026-11-23T09:20:00+05:30';
const epochMicro=(date:string)=>Date.parse(date)*1000;
function snapshot(at:string,status='SCHEDULED',
  childId:string|null=null):Phase40GttCapture{
  return {
    origin:'OPERATOR_ARCHIVED_UNVERIFIED',
    method:'GET',path:'/v3/order/gtt',
    query:{gtt_order_id:gtt},
    capturedAt:at,httpStatus:200,
    response:{status:'success',data:[{
      gtt_order_id:gtt,type:'SINGLE',product:'D',
      exchange:'NFO',instrument_token:instrument,
      trading_symbol:'SYNTH_CE',
      quantity:65,
      created_at:epochMicro('2026-11-19T10:00:00+05:30'),
      expires_at:epochMicro('2026-12-20T15:30:00+05:30'),
      rules:[{
        strategy:'STOPLOSS',status,
        trigger_type:'BELOW',trigger_price:250.5,
        transaction_type:'SELL',order_id:childId,message:null
      }]
    }]}
  };
}
function fixture(){
  const input:Phase40GttAuditInput={
    schemaVersion:'ADAPTIVE_V2_PHASE40_OVERNIGHT_GTT_V1',
    source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
    position:{
      accountScopeId:account,productType:'NRML',
      instrumentKey:instrument,tradingSymbol:'SYNTH_CE',
      gttOrderId:gtt,lotSize:65,expectedLongQuantity:65,
      expectedStopTriggerPrice:250.5
    },
    maxCheckpointDistanceMinutes:30,
    declaredOvernightPairs:1,
    overnightPairs:[{
      sessionDate:'2026-11-20',preCloseAt:close,
      nextSessionDate:'2026-11-23',nextOpenAt:open,
      beforeClose:snapshot(before),afterOpen:snapshot(after)
    }]
  };
  const pins:Phase40IndependentArchivePins={
    schemaVersion:'EXTERNALLY_PINNED_PHASE40_ARCHIVE_SHA256_V1',
    expectedAccountScopeId:account,expectedGttOrderId:gtt,
    expectedPairSha256:input.overnightPairs.map(hashPhase40OfflineArchive)
  };
  return {input,pins};
}
const pin=(input:Phase40GttAuditInput)=>{
  const {pins}=fixture();
  return {...pins,expectedPairSha256:
    input.overnightPairs.map(hashPhase40OfflineArchive)};
};
function safe(r:ReturnType<typeof auditPhase40ArchivedGttOvernights>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.nativeExchangeStopAcknowledged,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.continuousStopCoverageVerified,false);
  assert.equal(r.capturedBrokerSourceAuthenticated,false);
  assert.equal(r.nrmlProductIndependentlyConfirmed,false);
  assert.equal(r.stopFillGuaranteed,false);
  assert.equal(r.nativeOrderInstruction,null);
  const text=JSON.stringify(r);
  for(const privateValue of [account,instrument,gtt])
    assert.ok(!text.includes(privateValue));
}
function blocked(input:Phase40GttAuditInput,
  reason:string,pins=pin(input)){
  const r=auditPhase40ArchivedGttOvernights(input,pins);
  safe(r);assert.notEqual(r.status,
    'GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED');
  assert.deepEqual(r.reasonCodes,[reason],JSON.stringify(r));
}
describe('Phase40 archived broker GTT boundary observations',()=>{
  it('one synthetic Friday-to-Monday weekend pair matches but overnight protection stays UNKNOWN',()=>{
    const {input,pins}=fixture();
    const r=auditPhase40ArchivedGttOvernights(input,pins);
    safe(r);
    assert.equal(r.status,
      'GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED');
    assert.equal(r.pairsReviewed,1);
    assert.equal(r.matchingGttSnapshots,2);
    assert.equal(r.unobservedOvernightIntervals,1);
    assert.equal(r.gttConditionalRuleObservationsOnly,true);
  });
  it('missing after-open snapshot is blocked (completed GTT cannot be retrieved later)',()=>{
    const {input}=fixture();
    input.overnightPairs[0].afterOpen.response.data=[];
    blocked(input,'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
  });
  it('failure, cancellation, expiry, TRIGGERED or linked child order never pass as an active scheduled GTT',()=>{
    for(const state of ['FAILED','CANCELLED','EXPIRED','TRIGGERED',
      'COMPLETED','PENDING','INACTIVE']){
      const {input}=fixture();
      input.overnightPairs[0].afterOpen.response.data[0].rules[0].status=state;
      blocked(input,'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    }
    const {input}=fixture();
    input.overnightPairs[0].afterOpen.response.data[0].rules[0].order_id=
      'SYN_CHILD_STOP';
    blocked(input,'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
  });
  it('wrong UCC, instrument, SELL direction, trigger or lot quantity reject',()=>{
    const {input}=fixture();
    input.overnightPairs[0].afterOpen.response.data[0]
      .instrument_token='OTHER_FO';
    blocked(input,'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    const a=fixture().input;
    a.overnightPairs[0].beforeClose.response.data[0]
      .rules[0].transaction_type='BUY';
    blocked(a,'PRE_CLOSE_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    const b=fixture().input;
    b.overnightPairs[0].afterOpen.response.data[0]
      .rules[0].trigger_price=200;
    blocked(b,'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    const c=fixture().input;
    c.position.expectedLongQuantity=130;
    blocked(c,'PRE_CLOSE_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    const d=fixture().input;
    d.position.lotSize=60;
    blocked(d,'INVALID_NRML_POSITION_OVERNIGHT_SCOPE_OR_EXTERNAL_PINS');
  });
  it('wrong product I, missing STOPLOSS, multiple STOPLOSS or expiry before open rejects',()=>{
    const a=fixture().input;
    a.overnightPairs[0].beforeClose.response.data[0].product='I';
    blocked(a,'PRE_CLOSE_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    const b=fixture().input;
    b.overnightPairs[0].beforeClose.response.data[0].rules[0].strategy='TARGET';
    blocked(b,'PRE_CLOSE_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    const c=fixture().input;
    c.overnightPairs[0].beforeClose.response.data[0].rules.push(
      {...c.overnightPairs[0].beforeClose.response.data[0].rules[0]});
    blocked(c,'PRE_CLOSE_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
    const d=fixture().input;
    d.overnightPairs[0].afterOpen.response.data[0].expires_at=
      epochMicro('2026-11-22T12:00:00+05:30');
    blocked(d,'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
  });
  it('stale snapshots, wrong session clock, missing overnight pair and nonmonotonic pairs reject',()=>{
    const a=fixture().input;
    a.overnightPairs[0].afterOpen.capturedAt=
      '2026-11-23T11:00:00+05:30';
    blocked(a,'INVALID_OR_MISSING_SESSION_CLOSE_OPEN_CHECKPOINT_TIMES');
    const b=fixture().input;
    b.overnightPairs[0].sessionDate='2026-11-21';
    blocked(b,'INVALID_OR_MISSING_SESSION_CLOSE_OPEN_CHECKPOINT_TIMES');
    const c=fixture().input;
    c.declaredOvernightPairs=2;
    blocked(c,'INVALID_NRML_POSITION_OVERNIGHT_SCOPE_OR_EXTERNAL_PINS');
    const d=fixture().input;
    d.overnightPairs.push(structuredClone(d.overnightPairs[0]));
    d.declaredOvernightPairs=2;
    blocked(d,'INVALID_OR_MISSING_SESSION_CLOSE_OPEN_CHECKPOINT_TIMES');
  });
  it('corrupt archive SHA256 and falsified origin are rejected before reconciliation',()=>{
    const {input,pins}=fixture();
    pins.expectedPairSha256=['00'.repeat(32)];
    blocked(input,'INDEPENDENT_CHECKPOINT_ARCHIVE_SHA256_MISMATCH',pins);
    const a=fixture().input;
    a.overnightPairs[0].afterOpen.origin='BROKER_AUTHENTICATED' as
      'OPERATOR_ARCHIVED_UNVERIFIED';
    blocked(a,'POST_OPEN_GTT_STOP_NOT_EXACTLY_SCHEDULED_OR_WRONG_SCOPE');
  });
  it('two distinct declared overnights still have TWO unobserved gaps',()=>{
    const {input}=fixture();
    const second=structuredClone(input.overnightPairs[0]);
    second.sessionDate='2026-11-23';
    second.preCloseAt='2026-11-23T15:30:00+05:30';
    second.nextSessionDate='2026-11-24';
    second.nextOpenAt='2026-11-24T09:15:00+05:30';
    second.beforeClose.capturedAt='2026-11-23T15:25:00+05:30';
    second.afterOpen.capturedAt='2026-11-24T09:20:00+05:30';
    input.overnightPairs.push(second);
    input.declaredOvernightPairs=2;
    const r=auditPhase40ArchivedGttOvernights(input,pin(input));
    safe(r);assert.equal(r.status,
      'GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED');
    assert.equal(r.unobservedOvernightIntervals,2);
  });
});
const childOrderId='PHASE40_CHILD_123';
function childFixture(){
  const row=(status:string,exchangeOrderId:string|null,
    filled=0)=>{
    return {
      order_id:childOrderId,order_request_id:'1',
      instrument_token:instrument,trading_symbol:'SYNTH_CE',
      product:'D',transaction_type:'SELL' as const,
      order_type:'SL-M',quantity:65,filled_quantity:filled,
      status,exchange_order_id:exchangeOrderId,
      order_timestamp:'2026-11-23 10:05:00',
      exchange_timestamp:exchangeOrderId?
        '2026-11-23 10:05:01':null
    };
  };
  const input:Phase40OrderHistoryInput={
    schemaVersion:'ADAPTIVE_V2_PHASE40_NATIVE_CHILD_ORDER_V1',
    source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
    expected:{
      accountScopeId:account,instrumentKey:instrument,
      tradingSymbol:'SYNTH_CE',productType:'NRML',
      childOrderId,side:'SELL',quantity:65,lotSize:65
    },
    history:{
      origin:'OPERATOR_ARCHIVED_UNVERIFIED',
      method:'GET',path:'/v2/order/history',
      query:{order_id:childOrderId},
      capturedAt:'2026-11-23T10:10:00+05:30',
      httpStatus:200,response:{status:'success',data:[
        row('put order req received',null),
        row('validation pending',null),
        row('open','EXCHANGE_SYNTH_ID')
      ]}
    }
  };
  const pins:Phase40OrderHistoryPins={
    schemaVersion:'EXTERNALLY_PINNED_PHASE40_ORDER_HISTORY_V1',
    expectedAccountScopeId:account,expectedOrderId:childOrderId,
    expectedHistorySha256:hashPhase40OfflineArchive(input.history)
  };
  return {input,pins,row};
}
function childAudit(input:Phase40OrderHistoryInput){
  const {pins}=childFixture();
  pins.expectedHistorySha256=hashPhase40OfflineArchive(input.history);
  return auditPhase40ArchivedChildHistory(input,pins);
}
function safeChild(r:ReturnType<typeof childAudit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.actualExchangeAcknowledgementIndependentlyVerified,false);
  assert.equal(r.authenticatedBrokerSource,false);
  assert.equal(r.standingGttWasNativeStop,false);
  assert.equal(r.entireOvernightStopContinuityVerified,false);
  assert.ok(!JSON.stringify(r).includes(childOrderId));
}
describe('Phase40 claimed same-day child order ACK/modify/cancel lifecycle',()=>{
  it('broker reported open exchange order ID remains UNVERIFIED',()=>{
    const {input,pins}=childFixture();
    const out=auditPhase40ArchivedChildHistory(input,pins);
    safeChild(out);
    assert.equal(out.status,'BROKER_REPORTED_OPEN_OR_COMPLETE_UNVERIFIED');
    assert.equal(out.eventsReviewed,3);
    assert.equal(out.brokerReportedExchangeOrderIdObserved,true);
    assert.equal(out.reportedTerminalStatus,'open');
  });
  it('complete fills can be observed but no standing stop is inferred',()=>{
    const {input,row}=childFixture();
    input.history.response.data.push(row('complete','EXCHANGE_SYNTH_ID',65));
    const r=childAudit(input);safeChild(r);
    assert.equal(r.status,'BROKER_REPORTED_OPEN_OR_COMPLETE_UNVERIFIED');
    assert.equal(r.reportedTerminalStatus,'complete');
    assert.equal(r.standingGttWasNativeStop,false);
  });
  it('reject and cancel status cannot be mistaken for native protection',()=>{
    for(const status of ['cancelled','rejected','cancel pending',
      'modify pending','modify validation pending']){
      const {input,row}=childFixture();
      input.history.response.data.push(row(status,'EXCHANGE_SYNTH_ID'));
      const r=childAudit(input);safeChild(r);
      assert.equal(r.status,'BLOCKED_OR_UNKNOWN',status);
      assert.deepEqual(r.reasonCodes,[
        'CHILD_STOP_REJECTED_CANCELLED_OR_MODIFICATION_UNRESOLVED'
      ]);
    }
  });
  it('open or complete without exchange order reference fails',()=>{
    const {input}=childFixture();
    input.history.response.data[2].exchange_order_id=null;
    const r=childAudit(input);safeChild(r);
    assert.equal(r.status,'BLOCKED_OR_UNKNOWN');
  });
  it('exchange ID mutation, mismatched side/contract and order ID reject',()=>{
    const a=childFixture().input;
    a.history.response.data[2].transaction_type='BUY';
    assert.equal(childAudit(a).status,'BLOCKED_OR_UNKNOWN');
    const b=childFixture().input;
    b.history.response.data[1].order_id='WRONG_ID';
    assert.equal(childAudit(b).status,'BLOCKED_OR_UNKNOWN');
    const c=childFixture().input;
    c.history.response.data.push({...c.history.response.data[2],
      exchange_order_id:'CHANGED_EXCHANGE_ID'});
    assert.equal(childAudit(c).status,'BLOCKED_OR_UNKNOWN');
    const d=childFixture().input;
    d.history.query.order_id='OTHER_ID';
    assert.equal(childAudit(d).status,'BLOCKED_OR_UNKNOWN');
  });
  it('one-day order-history cannot be fetched later as native protection proof',()=>{
    const a=childFixture().input;
    a.history.capturedAt='2026-11-24T10:10:00+05:30';
    const r=childAudit(a);safeChild(r);
    assert.equal(r.status,'BLOCKED_OR_UNKNOWN');
    assert.deepEqual(r.reasonCodes,[
      'CHILD_ORDER_ID_CONTRACT_STATUS_OR_EXCHANGE_REFERENCE_DISAGREES'
    ]);
  });
  it('wrong externally pinned archive sha256 / UCC cannot pass',()=>{
    const {input,pins}=childFixture();
    pins.expectedHistorySha256='cc'.repeat(32);
    const a=auditPhase40ArchivedChildHistory(input,pins);
    safeChild(a);assert.equal(a.status,'INVALID_EVIDENCE');
    const b=childFixture();
    b.pins.expectedAccountScopeId='OTHER_ACCOUNT';
    const result=auditPhase40ArchivedChildHistory(b.input,b.pins);
    safeChild(result);assert.equal(result.status,'INVALID_EVIDENCE');
  });
});
