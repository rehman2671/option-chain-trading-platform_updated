import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditOfflineUpstoxNrmlLifecycle,type OfflineUpstoxLifecycleInput,
  type OfflineUpstoxLifecycleFrame
} from '../../server/engine/ema15m/adaptiveUpstoxOfflineNrmlLifecycle.js';
import type {
  OfflineUpstoxCaptureBundle
} from '../../server/engine/ema15m/adaptiveUpstoxOfflineReadOnlyBridge.js';
import type {
  ReadOnlyExpectedPosition,ReadOnlyNrmlAuditPolicy
} from '../../server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const account='SYNTHETIC_ACCOUNT_27';
const instrument='NSE_FO|SYNTHETIC_27';
const policy:ReadOnlyNrmlAuditPolicy={
  maximumSnapshotAgeMinutes:5,
  maximumCrossBookSkewSeconds:90,
  minCalendarDaysBeforeExpiry:2
};
const expected:ReadOnlyExpectedPosition={
  accountScopeId:account,instrumentKey:instrument,productType:'NRML',
  expiry:'2026-12-24',lotSize:65,expectedNetLongQuantity:130
};
const epoch='2026-11-17T10:00:00.000Z';
const time=(asOf:string,offsetMs:number)=>
  new Date(Date.parse(asOf)+offsetMs).toISOString();
const rows=(c:{response:unknown})=>
  (c.response as {status:string;data:Array<Record<string,unknown>>}).data;
function stop(id='SYNTHETIC_SL_A'){
  return {
    order_id:id,instrument_token:instrument,product:'D',
    quantity:130,status:'trigger pending',order_type:'SL',
    trigger_price:80,transaction_type:'SELL',
    filled_quantity:0,pending_quantity:130
  };
}
function terminal(id:string,side:'BUY'|'SELL',quantity:number){
  return {
    ...stop(id),status:'complete',order_type:'MARKET',
    transaction_type:side,trigger_price:0,
    quantity,filled_quantity:quantity,pending_quantity:0
  };
}
function trade(id:string,order_id:string,
  side:'BUY'|'SELL',quantity:number){
  return {trade_id:id,order_id,product:'D',instrument_token:instrument,
    transaction_type:side,quantity};
}
function frame(sequence:number,asOf:string=epoch):
  OfflineUpstoxLifecycleFrame {
  const capture:OfflineUpstoxCaptureBundle={
    schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1',
    origin:'OPERATOR_SUPPLIED_UNVERIFIED',accountScopeId:account,
    positions:{
      method:'GET',path:'/v2/portfolio/short-term-positions',
      unfiltered:true,httpStatus:200,
      capturedAt:time(asOf,-40_000),
      response:{status:'success',data:[
        {instrument_token:instrument,product:'D',quantity:130}
      ]}
    },
    orders:{
      method:'GET',path:'/v2/order/retrieve-all',
      unfiltered:true,httpStatus:200,
      capturedAt:time(asOf,-30_000),
      response:{status:'success',data:[stop()]}
    },
    gtts:{
      method:'GET',path:'/v3/order/gtt',unfiltered:true,httpStatus:200,
      capturedAt:time(asOf,-20_000),
      response:{status:'success',data:[]}
    }
  };
  return {
    sequence,asOf,capture,expected:{...expected},
    trades:{
      method:'GET',path:'/v2/order/trades/get-trades-for-day',
      unfiltered:true,httpStatus:200,
      capturedAt:time(asOf,-15_000),
      response:{status:'success',data:[]}
    }
  };
}
function bundle():OfflineUpstoxLifecycleInput{
  return {
    schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_LIFECYCLE_V1',
    source:'OPERATOR_SUPPLIED_UNVERIFIED',
    maximumFrameGapMinutes:5,
    frames:[frame(1),frame(2,time(epoch,60_000))]
  };
}
const audit=(v:OfflineUpstoxLifecycleInput=bundle())=>
  auditOfflineUpstoxNrmlLifecycle(v,policy);
function blocked(v:OfflineUpstoxLifecycleInput,reason:string){
  const result=audit(v);
  assert.equal(result.status,'BLOCKED_OR_UNKNOWN',JSON.stringify(result));
  assert.ok(result.reasons.includes(reason),JSON.stringify(result.reasons));
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.productionSafe,false);
  assert.equal(result.brokerAuthenticated,false);
  assert.equal(result.brokerStopInstalled,false);
  assert.equal(result.nativeOrderInstruction,null);
  return result;
}
describe('Phase27 offline NRML lifecycle trade vs order reconciliation',()=>{
  it('two complete stable reads are chronological only, NEVER authenticated',()=>{
    const r=audit();
    assert.equal(r.status,'CHRONOLOGICALLY_CONSISTENT_UNVERIFIED');
    assert.deepEqual(r.reasons,[]);
    assert.equal(r.frameCount,2);
    assert.equal(r.totalDailyTradeRowsLastFrame,0);
    assert.deepEqual(r.frameStatuses.map(x=>x.phase26Status),
      ['STRUCTURAL_REVIEW_ONLY','STRUCTURAL_REVIEW_ONLY']);
    assert.ok(/^[0-9a-f]{64}$/.test(r.chainHeadSha256!));
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.brokerAuthenticated,false);
    assert.equal(r.brokerStopInstalled,false);
    assert.ok(r.warnings.some(x=>x.includes('OVERNIGHT')));
    assert.ok(!JSON.stringify(r).includes(account));
    assert.ok(!JSON.stringify(r).includes(instrument));
    assert.ok(!JSON.stringify(r).includes('SYNTHETIC_SL_A'));
  });
  it('a backed BUY/SELL offsetting trade pair preserves position',()=>{
    const b=bundle();
    const second=b.frames[1];
    rows(second.capture.orders.response).push(
      terminal('SYNTHETIC_BUY','BUY',65),
      terminal('SYNTHETIC_SELL','SELL',65));
    rows(second.trades.response).push(
      trade('SYNTHETIC_T_BUY','SYNTHETIC_BUY','BUY',65),
      trade('SYNTHETIC_T_SELL','SYNTHETIC_SELL','SELL',65));
    const r=audit(b);
    assert.equal(r.status,'CHRONOLOGICALLY_CONSISTENT_UNVERIFIED',
      JSON.stringify(r.reasons));
    assert.equal(r.totalDailyTradeRowsLastFrame,2);
  });
  it('both snapshots can look protected while a native stop was replaced',()=>{
    const b=bundle(),second=b.frames[1];
    rows(second.capture.orders.response)[0].status='cancelled';
    rows(second.capture.orders.response)[0].pending_quantity=0;
    rows(second.capture.orders.response).push(stop('SYNTHETIC_SL_B'));
    const r=blocked(b,'PROTECTIVE_ORDER_ID_ROTATED_OR_DISAPPEARED');
    assert.equal(r.frameStatuses[1].phase26Status,'STRUCTURAL_REVIEW_ONLY');
  });
  it('manual trigger/quantity amendments are not authenticated via snapshots',()=>{
    const b=bundle();rows(b.frames[1].capture.orders.response)[0].trigger_price=79;
    const r=blocked(b,'UNVERIFIED_NATIVE_ORDER_QUANTITY_OR_TRIGGER_AMENDMENT');
    assert.equal(r.frameStatuses[1].phase26Status,'STRUCTURAL_REVIEW_ONLY');
  });
  it('partial fill with corresponding day SELL trade STILL blocks protection',()=>{
    const b=bundle(),second=b.frames[1];
    second.expected.expectedNetLongQuantity=65;
    rows(second.capture.positions.response)[0].quantity=65;
    const stopRow=rows(second.capture.orders.response)[0];
    stopRow.status='open';
    stopRow.filled_quantity=65;
    stopRow.pending_quantity=65;
    rows(second.trades.response).push(
      trade('SYNTHETIC_T_SELL','SYNTHETIC_SL_A','SELL',65));
    const r=blocked(b,'PHASE26_SINGLE_FRAME_PROTECTION_BLOCKED');
    assert.ok(!r.reasons.includes('POSITION_QUANTITY_CHANGE_NOT_EXPLAINED_BY_NEW_DAY_TRADES'));
    assert.ok(!r.reasons.includes('ORDER_CUMULATIVE_FILL_NOT_RECONCILED_TO_DAY_TRADES'));
  });
  it('position shrinking without trade evidence is detected',()=>{
    const b=bundle(),second=b.frames[1];
    second.expected.expectedNetLongQuantity=65;
    rows(second.capture.positions.response)[0].quantity=65;
    blocked(b,'POSITION_QUANTITY_CHANGE_NOT_EXPLAINED_BY_NEW_DAY_TRADES');
  });
  it('filled order without all-day trades is not reconciled',()=>{
    const b=bundle(),second=b.frames[1];
    second.expected.expectedNetLongQuantity=65;
    rows(second.capture.positions.response)[0].quantity=65;
    const sl=rows(second.capture.orders.response)[0];
    sl.filled_quantity=65;sl.pending_quantity=65;
    blocked(b,'ORDER_CUMULATIVE_FILL_NOT_RECONCILED_TO_DAY_TRADES');
  });
  it('newly provided trade with absent order identity cannot be trusted',()=>{
    const b=bundle(),second=b.frames[1];
    rows(second.trades.response).push(
      trade('SYNTHETIC_UNKNOWN_TRADE','UNKNOWN_ORDER','SELL',65));
    blocked(b,'TRADE_ORDER_ABSENT_FROM_CURRENT_DAY_BOOK');
  });
  it('trade ID disappearing or mutating across complete day books blocks',()=>{
    const b=bundle();
    for(const f of b.frames){
      rows(f.capture.orders.response).push(terminal('SYNTHETIC_B','BUY',65));
      rows(f.trades.response).push(trade('T1','SYNTHETIC_B','BUY',65));
    }
    const missing=structuredClone(b);
    rows(missing.frames[1].trades.response).splice(0);
    blocked(missing,'CUMULATIVE_DAY_TRADE_ID_DISAPPEARED');
    const changed=structuredClone(b);
    rows(changed.frames[1].trades.response)[0].quantity=64;
    blocked(changed,'PREVIOUS_TRADE_ID_MUTATED_OR_REUSED');
  });
  it('order fill regression and order disappearing from full day book blocks',()=>{
    const b=bundle();
    for(const f of b.frames){
      rows(f.capture.orders.response).push(terminal('SYNTHETIC_B','BUY',65));
      rows(f.trades.response).push(trade('T1','SYNTHETIC_B','BUY',65));
    }
    const regress=structuredClone(b);
    rows(regress.frames[1].capture.orders.response)[1].filled_quantity=0;
    rows(regress.frames[1].capture.orders.response)[1].status='open';
    rows(regress.frames[1].capture.orders.response)[1].pending_quantity=65;
    blocked(regress,'CUMULATIVE_FILLED_QUANTITY_REGRESSED');
    const absent=structuredClone(b);
    rows(absent.frames[1].capture.orders.response).splice(1,1);
    blocked(absent,'CURRENT_DAY_ORDER_ID_DISAPPEARED');
  });
  it('terminal complete/cancelled order resurrection blocks',()=>{
    const b=bundle();
    rows(b.frames[0].capture.orders.response).push(
      terminal('SYNTHETIC_B','BUY',65));
    rows(b.frames[0].trades.response).push(
      trade('T1','SYNTHETIC_B','BUY',65));
    rows(b.frames[1].capture.orders.response).push({
      ...terminal('SYNTHETIC_B','BUY',65),
      status:'open',filled_quantity:0,pending_quantity:65
    });
    rows(b.frames[1].trades.response).push(
      trade('T1','SYNTHETIC_B','BUY',65));
    blocked(b,'TERMINAL_ORDER_RESURRECTED');
  });
  it('a day boundary is a blocker even when raw stop looks unchanged',()=>{
    const b=bundle();
    b.maximumFrameGapMinutes=30;
    b.frames=[
      frame(1,'2026-11-17T18:25:00.000Z'),
      frame(2,'2026-11-17T18:36:00.000Z')
    ];
    blocked(b,'CROSSED_IST_DAY_BROKER_DAY_BOOK_CANNOT_ATTEST_OVERNIGHT_STOP');
  });
  it('stale/replayed read-book clock is detected independently of asOf',()=>{
    const b=bundle();
    b.frames[1].capture.orders.capturedAt=
      b.frames[0].capture.orders.capturedAt;
    blocked(b,'CAPTURE_REPLAY_OR_NON_MONOTONE_BOOK_CLOCK');
    const c=bundle();
    c.frames[1].trades.capturedAt=c.frames[0].trades.capturedAt;
    blocked(c,'CAPTURE_REPLAY_OR_NON_MONOTONE_TRADE_CLOCK');
  });
  it('recovery after last captures requires fresh trade AND order books',()=>{
    const b=bundle();
    b.frames[1].recoveryStartedAt='2026-11-17T10:00:50.000Z';
    const r=blocked(b,'POST_RESTART_TRADE_BOOK_RECAPTURE_REQUIRED');
    assert.ok(r.reasons.includes('PHASE26_SINGLE_FRAME_PROTECTION_BLOCKED'));
  });
  it('fail-closed malformed, duplicated, filtered and failed GET envelopes',()=>{
    const a=bundle();
    rows(a.frames[1].trades.response).push(
      trade('DUP','SYNTHETIC_SL_A','SELL',5),
      trade('DUP','SYNTHETIC_SL_A','SELL',5));
    assert.equal(audit(a).status,'INVALID_EVIDENCE');
    const b=bundle();
    b.frames[1].trades.unfiltered=false as true;
    assert.equal(audit(b).status,'INVALID_EVIDENCE');
    const c=bundle();
    c.frames[1].trades.httpStatus=401 as 200;
    assert.equal(audit(c).status,'INVALID_EVIDENCE');
    const d=bundle();
    d.frames[1].trades.response={status:'error',data:[]};
    assert.equal(audit(d).status,'INVALID_EVIDENCE');
  });
  it('wrong account, instrument, ordering and excessive cadence fail closed',()=>{
    const b=bundle();b.frames[1].expected.instrumentKey='NSE_FO|OTHER';
    blocked(b,'ACCOUNT_CONTRACT_OR_EXPIRY_SCOPE_CHANGED_DURING_LIFECYCLE');
    const c=bundle();c.frames[1].sequence=4;
    assert.equal(audit(c).status,'INVALID_EVIDENCE');
    const d=bundle();
    d.frames[1].asOf=time(epoch,8*60_000);
    blocked(d,'TEMPORAL_EVIDENCE_GAP_EXCEEDS_LOCKED_POLICY');
    const e=bundle();e.frames[1].asOf=e.frames[0].asOf;
    assert.equal(audit(e).status,'INVALID_EVIDENCE');
  });
  it('report never exposes broker account keys, raw orders or trade IDs',()=>{
    const b=bundle();
    rows(b.frames[1].trades.response).push(
      trade('PRIVATE_TRADE_123','PRIVATE_ORDER_123','BUY',65));
    const rendered=JSON.stringify(audit(b));
    for(const sensitive of [account,instrument,
      'PRIVATE_TRADE_123','PRIVATE_ORDER_123','SYNTHETIC_SL_A']){
      assert.equal(rendered.includes(sensitive),false);
    }
  });
});
