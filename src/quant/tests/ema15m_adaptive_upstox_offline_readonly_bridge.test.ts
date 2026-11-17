import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditOfflineUpstoxReadOnlyCapture,
  type OfflineUpstoxCaptureBundle
} from '../../server/engine/ema15m/adaptiveUpstoxOfflineReadOnlyBridge.js';
import type {
  ReadOnlyExpectedPosition,ReadOnlyNrmlAuditPolicy
} from '../../server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const account='SYNTHETIC_ACCOUNT_ONLY';
const instrument='NSE_FO|SYNTHETIC_123456';
const asOf='2026-11-17T10:00:00.000Z';
const metadata:ReadOnlyExpectedPosition={
  accountScopeId:account,instrumentKey:instrument,productType:'NRML',
  expiry:'2026-12-24',lotSize:65,expectedNetLongQuantity:130
};
const policy:ReadOnlyNrmlAuditPolicy={
  maximumSnapshotAgeMinutes:5,
  maximumCrossBookSkewSeconds:90,
  minCalendarDaysBeforeExpiry:2
};
function sample():OfflineUpstoxCaptureBundle{
  return {
    schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1',
    origin:'OPERATOR_SUPPLIED_UNVERIFIED',accountScopeId:account,
    positions:{
      method:'GET',path:'/v2/portfolio/short-term-positions',
      unfiltered:true,httpStatus:200,
      capturedAt:'2026-11-17T09:59:20.000Z',
      response:{status:'success',data:[
        {instrument_token:instrument,product:'D',quantity:130}
      ]}
    },
    orders:{
      method:'GET',path:'/v2/order/retrieve-all',unfiltered:true,
      httpStatus:200,capturedAt:'2026-11-17T09:59:30.000Z',
      response:{status:'success',data:[{
        order_id:'SYNTHETIC_NATIVE_STOP',instrument_token:instrument,
        product:'D',quantity:130,status:'trigger pending',
        order_type:'SL',trigger_price:80,transaction_type:'SELL',
        filled_quantity:0,pending_quantity:130
      }]}
    },
    gtts:{
      method:'GET',path:'/v3/order/gtt',unfiltered:true,httpStatus:200,
      capturedAt:'2026-11-17T09:59:40.000Z',
      response:{status:'success',data:[]}
    }
  };
}
const rows=(v:unknown)=> (v as {status:string;data:Array<Record<string,unknown>>}).data;
const audit=(b:OfflineUpstoxCaptureBundle=sample(),e=metadata,
  t=asOf,recovery?:string)=>
  auditOfflineUpstoxReadOnlyCapture(e,b,t,policy,recovery);
function assertBlocked(r:ReturnType<typeof audit>,code:string){
  assert.equal(r.status,'BLOCKED_OR_UNKNOWN');
  assert.ok(r.reasons.includes(code),JSON.stringify(r.reasons));
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.nativeOrderInstruction,null);
}
function gtt(status:string,strategy='STOPLOSS',side='SELL',
  type='BELOW',id='GTT-SYNTHETIC-ONLY'){
  return {
    type:'SINGLE',product:'D',exchange:'NSE_FO',
    instrument_token:instrument,gtt_order_id:id,
    quantity:130,expires_at:Date.parse('2026-12-20T00:00:00Z')*1000,
    rules:[{strategy,status,transaction_type:side,trigger_type:type,
      trigger_price:80,order_id:null}]
  };
}
describe('Phase26 offline Upstox read-only response normalization',()=>{
  it('maps native trigger pending D/FO to structurally consistent UNVERIFIED evidence',()=>{
    const r=audit();
    assert.equal(r.status,'STRUCTURAL_REVIEW_ONLY');
    assert.equal(r.phase25?.status,'STRUCTURALLY_CONSISTENT_UNVERIFIED');
    assert.equal(r.phase25?.outstandingSellCount,1);
    assert.equal(r.phase25?.apparentMatchingProtectionCount,1);
    assert.equal(r.positionsParsed,1);
    assert.equal(r.ordersParsed,1);
    assert.equal(r.gttRulesParsed,0);
    assert.ok(/^[0-9a-f]{64}$/.test(r.snapshotJsonSha256.orders!));
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.brokerAuthenticated,false);
    assert.equal(r.brokerStopInstalled,false);
    assert.equal(r.nativeOrderInstruction,null);
    assert.ok(!JSON.stringify(r).includes(account));
    assert.ok(!JSON.stringify(r).includes(instrument));
    assert.ok(!JSON.stringify(r).includes('SYNTHETIC_NATIVE_STOP'));
  });
  it('never promotes SCHEDULED or PENDING GTT to broker-acknowledged native stop',()=>{
    for(const state of ['SCHEDULED','PENDING','OPEN','INACTIVE']){
      const b=sample();
      rows(b.orders.response).splice(0);
      rows(b.gtts.response).push(gtt(state));
      const r=audit(b);
      assertBlocked(r,'CONTINGENT_GTT_RULE_NOT_BROKER_NATIVE_STOP_ACK');
      assert.equal(r.phase25?.apparentMatchingProtectionCount,0);
    }
  });
  it('does not conceal duplicate TARGET and STOPLOSS contingency SELL rules',()=>{
    const b=sample();
    rows(b.orders.response).splice(0);
    const x=gtt('SCHEDULED');
    x.rules.push({...x.rules[0],strategy:'TARGET',trigger_type:'ABOVE',
      trigger_price:120});
    x.type='MULTIPLE';
    rows(b.gtts.response).push(x);
    const r=audit(b);
    assertBlocked(r,'EXACTLY_ONE_UNRESOLVED_SELL_REQUIRED');
    assert.equal(r.phase25?.outstandingSellCount,2);
  });
  it('an apparently present native stop and another GTT SELL is duplicate protection',()=>{
    const b=sample();
    rows(b.gtts.response).push(gtt('SCHEDULED'));
    assertBlocked(audit(b),'EXACTLY_ONE_UNRESOLVED_SELL_REQUIRED');
  });
  it('rejects filtered GTT detail rather than silently calling it complete',()=>{
    const b=sample(); b.gtts.unfiltered=false as true;
    const r=audit(b);
    assert.equal(r.status,'REJECTED_CAPTURE');
    assert.deepEqual(r.reasons,['MISSING_FAILED_FILTERED_OR_MALFORMED_GET_BOOK']);
    b.gtts.unfiltered=true;
    b.gtts.httpStatus=503 as 200;
    assert.equal(audit(b).status,'REJECTED_CAPTURE');
    b.gtts.httpStatus=200;
    b.gtts.response={status:'error',data:[]};
    assert.equal(audit(b).status,'REJECTED_CAPTURE');
  });
  it('rejects stale/future cross-book captures, and restart requires fresh GET snapshots',()=>{
    const b=sample();
    b.positions.capturedAt='2026-11-17T09:40:00.000Z';
    assertBlocked(audit(b),'MISSING_STALE_OR_FUTURE_SNAPSHOT_CLOCK');
    const fresh=sample();
    assertBlocked(audit(fresh,metadata,asOf,'2026-11-17T09:59:25.000Z'),
      'POST_RESTART_FRESH_BOOK_RECONCILIATION_REQUIRED');
    const future=sample();future.orders.capturedAt='2026-11-17T10:00:01.000Z';
    assertBlocked(audit(future),'MISSING_STALE_OR_FUTURE_SNAPSHOT_CLOCK');
  });
  it('preserves MIS/D wrong product and unfilled stop as safety blockers',()=>{
    const b=sample();
    rows(b.positions.response)[0].product='I';
    assertBlocked(audit(b),'WRONG_PRODUCT_EXPIRY_OR_LOT_FOR_SELECTED_CONTRACT');
    const s=sample();
    rows(s.orders.response)[0].status='open';
    assertBlocked(audit(s),
      'NO_SINGLE_ACKNOWLEDGED_MATCHING_REMAINING_NATIVE_PROTECTION');
    const l=sample();
    rows(l.orders.response)[0].order_type='LIMIT';
    assertBlocked(audit(l),
      'NO_SINGLE_ACKNOWLEDGED_MATCHING_REMAINING_NATIVE_PROTECTION');
  });
  it('fails closed for partial fills and inconsistent pending quantity',()=>{
    const b=sample();
    rows(b.positions.response)[0].quantity=65;
    rows(b.orders.response)[0].filled_quantity=65;
    rows(b.orders.response)[0].pending_quantity=65;
    assertBlocked(audit(b,{...metadata,expectedNetLongQuantity:65}),
      'UNKNOWN_CANCEL_REPLACE_TRIGGER_OR_PARTIAL_FILL_STATE');
    const bad=sample();rows(bad.orders.response)[0].pending_quantity=30;
    assert.equal(audit(bad).status,'REJECTED_CAPTURE');
    assert.deepEqual(audit(bad).reasons,
      ['UNMAPPABLE_OR_NONRECONCILABLE_RAW_ORDER']);
  });
  it('treats cancelled or generated GTT states differently, still no real safety',()=>{
    const b=sample();rows(b.gtts.response).push(gtt('CANCELLED'));
    assert.equal(audit(b).status,'STRUCTURAL_REVIEW_ONLY');
    const t=sample();rows(t.gtts.response).push(gtt('TRIGGERED'));
    assertBlocked(audit(t),
      'UNKNOWN_CANCEL_REPLACE_TRIGGER_OR_PARTIAL_FILL_STATE');
    const expired=sample();
    const x=gtt('SCHEDULED');
    x.expires_at=Date.parse('2026-11-10T00:00:00Z')*1000;
    rows(expired.gtts.response).push(x);
    assertBlocked(audit(expired),'GTT_CONDITIONAL_EXPIRY_PASSED');
  });
  it('unknown order states cannot promote safety and malformed raw rows reject',()=>{
    for(const status of ['not cancelled','modified',
      'modify pending','validation pending','cancel pending']){
      const b=sample();rows(b.orders.response)[0].status=status;
      assertBlocked(audit(b),
        'UNKNOWN_CANCEL_REPLACE_TRIGGER_OR_PARTIAL_FILL_STATE');
    }
    const invalid=sample();rows(invalid.positions.response)[0].quantity='130';
    assert.equal(audit(invalid).status,'REJECTED_CAPTURE');
    const mismatch=sample();mismatch.accountScopeId='SOME_OTHER_SCOPE';
    assert.equal(audit(mismatch).status,'REJECTED_CAPTURE');
    const nonFO=sample();
    assert.equal(audit(nonFO,{...metadata,
      instrumentKey:'NSE_EQ|UNSUPPORTED'}).status,'REJECTED_CAPTURE');
  });
  it('a flat matching position still fails if an orphan SELL or unreported BUY exists',()=>{
    const b=sample();
    rows(b.positions.response).splice(0);
    assertBlocked(audit(b,{...metadata,expectedNetLongQuantity:0}),
      'ORPHAN_SELL_OR_GTT_FOR_FLAT_POSITION');
    const c=sample();
    rows(c.orders.response).push({
      ...rows(c.orders.response)[0],order_id:'SYNTHETIC_BUY',
      status:'open',order_type:'LIMIT',transaction_type:'BUY'
    });
    assertBlocked(audit(c),'UNRESOLVED_NEW_BUY_CAN_CHANGE_POSITION');
  });
});
