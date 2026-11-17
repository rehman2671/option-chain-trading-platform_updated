import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditReadOnlyNrmlProtection,
  type ReadOnlyExpectedPosition,type ReadOnlyBrokerExport,
  type ReadOnlyBrokerOrder,type ReadOnlyNrmlAuditPolicy
} from '../../server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const account='TEST_UNVERIFIED_ACCOUNT';
const instrument='NSE_FO|SYNTHETIC_TEST_OPTION';
const now='2026-11-17T10:00:00.000Z';
const policy:ReadOnlyNrmlAuditPolicy={
  maximumSnapshotAgeMinutes:5,
  maximumCrossBookSkewSeconds:90,
  minCalendarDaysBeforeExpiry:2
};
function expected(q=130):ReadOnlyExpectedPosition{return{
  accountScopeId:account,instrumentKey:instrument,productType:'NRML',
  expiry:'2026-12-24',lotSize:65,expectedNetLongQuantity:q
};}
function stop(overrides:Partial<ReadOnlyBrokerOrder>={}):ReadOnlyBrokerOrder{
  return {
    orderId:'TEST_NATIVE_STOP_1',accountScopeId:account,
    instrumentKey:instrument,productType:'NRML',
    book:'ORDER',side:'SELL',kind:'NATIVE_STOP',
    status:'ACKNOWLEDGED_TRIGGER_PENDING',
    originalQuantity:130,filledQuantity:0,cancelledQuantity:0,
    triggerPrice:80,...overrides
  };
}
function snapshot():ReadOnlyBrokerExport{return{
  source:'UNVERIFIED_OPERATOR_EXPORT',
  positionsComplete:true,ordersComplete:true,gttsComplete:true,
  positionsAt:'2026-11-17T09:59:20.000Z',
  ordersAt:'2026-11-17T09:59:30.000Z',
  gttsAt:'2026-11-17T09:59:40.000Z',
  positions:[{accountScopeId:account,instrumentKey:instrument,
    productType:'NRML',expiry:'2026-12-24',lotSize:65,netQuantity:130}],
  orders:[stop()],gtts:[]
};}
const run=(s:ReadOnlyBrokerExport=snapshot(),e=expected(),
  at=now,p=policy,restarted?:string)=>
  auditReadOnlyNrmlProtection(e,s,at,p,restarted);
const blocked=(r:ReturnType<typeof run>,reason:string)=>{
  assert.equal(r.status,'BLOCKED_OR_UNKNOWN');
  assert.ok(r.reasons.includes(reason),JSON.stringify(r.reasons));
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.nativeOrderInstruction,null);
};

describe('Phase25 offline, unverified read-only broker book NRML safety audit',()=>{
  it('returns only structural consistency, NEVER live protection or order authorization',()=>{
    const r=run();
    assert.equal(r.status,'STRUCTURALLY_CONSISTENT_UNVERIFIED');
    assert.equal(r.apparentMatchingProtectionCount,1);
    assert.equal(r.outstandingSellCount,1);
    assert.equal(r.observedNetQuantity,130);
    assert.equal(r.productionSafe,false);
    assert.equal(r.brokerAuthenticated,false);
    assert.equal(r.brokerStopInstalled,false);
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.nativeOrderInstruction,null);
    assert.ok(r.warnings.some(x=>x.includes('15_15')));
    assert.ok(!JSON.stringify(r).includes(account));
    assert.ok(!JSON.stringify(r).includes(instrument));
    assert.ok(!JSON.stringify(r).includes('TEST_NATIVE_STOP_1'));
  });
  it('requires one matching native stop or GTT; never counts two simultaneous SELLs',()=>{
    const s=snapshot();
    s.gtts.push(stop({orderId:'TEST_GTT_2',book:'GTT',kind:'GTT'}));
    blocked(run(s),'EXACTLY_ONE_UNRESOLVED_SELL_REQUIRED');
    const g=snapshot();
    g.orders=[];g.gtts=[stop({book:'GTT',kind:'GTT'})];
    assert.equal(run(g).status,'STRUCTURALLY_CONSISTENT_UNVERIFIED');
    g.gtts[0].status='OPEN';
    blocked(run(g),'NO_SINGLE_ACKNOWLEDGED_MATCHING_REMAINING_NATIVE_PROTECTION');
  });
  it('blocks partial fill, stale stop quantity, pending cancel and unknown ACK',()=>{
    const partial=snapshot();
    partial.positions[0].netQuantity=65;
    partial.orders[0].filledQuantity=65;
    partial.orders[0].status='PARTIALLY_FILLED';
    blocked(run(partial,expected(65)),
      'UNKNOWN_CANCEL_REPLACE_TRIGGER_OR_PARTIAL_FILL_STATE');
    partial.orders[0].status='ACKNOWLEDGED_TRIGGER_PENDING';
    assert.equal(run(partial,expected(65)).status,
      'STRUCTURALLY_CONSISTENT_UNVERIFIED');
    partial.orders[0].originalQuantity=195;
    blocked(run(partial,expected(65)),
      'NO_SINGLE_ACKNOWLEDGED_MATCHING_REMAINING_NATIVE_PROTECTION');
    for(const status of ['CANCEL_PENDING','UNKNOWN','REPLACE_PENDING'] as const){
      const s=snapshot();s.orders[0].status=status;
      blocked(run(s),'UNKNOWN_CANCEL_REPLACE_TRIGGER_OR_PARTIAL_FILL_STATE');
    }
  });
  it('blocks duplicate IDs and an untracked additional MARKET SELL',()=>{
    const s=snapshot();
    s.gtts.push(stop({book:'GTT',kind:'GTT'}));
    assert.deepEqual(run(s).reasons,['DUPLICATE_ORDER_OR_GTT_IDENTIFIER']);
    const t=snapshot();
    t.orders.push(stop({orderId:'TEST_MARKET_SELL',kind:'MARKET',status:'OPEN'}));
    blocked(run(t),'EXACTLY_ONE_UNRESOLVED_SELL_REQUIRED');
  });
  it('rejects incomplete, wrong-account, wrong-product and invalid rows',()=>{
    const incomplete=snapshot();incomplete.gttsComplete=false;
    blocked(run(incomplete),'INCOMPLETE_POSITION_ORDER_OR_GTT_BOOK');
    const cross=snapshot();cross.orders[0].accountScopeId='OTHER_ACCOUNT';
    blocked(run(cross),'CROSS_ACCOUNT_ROWS_IN_CLAIMED_COMPLETE_BOOK');
    const wrong=snapshot();wrong.positions[0].productType='MIS';
    blocked(run(wrong),'WRONG_PRODUCT_EXPIRY_OR_LOT_FOR_SELECTED_CONTRACT');
    const bad=snapshot();bad.orders[0].filledQuantity=200;
    assert.equal(run(bad).status,'INVALID_EVIDENCE');
    const malformed=snapshot();malformed.orders[0].triggerPrice=-1;
    assert.equal(run(malformed).status,'INVALID_EVIDENCE');
  });
  it('fails closed on future/stale/cross-skewed/restart-old snapshots',()=>{
    const stale=snapshot();stale.gttsAt='2026-11-17T09:50:00.000Z';
    blocked(run(stale),'MISSING_STALE_OR_FUTURE_SNAPSHOT_CLOCK');
    const skew=snapshot();skew.gttsAt='2026-11-17T09:56:50.000Z';
    blocked(run(skew),'POSITION_ORDER_GTT_BOOKS_NOT_TIME_COHERENT');
    const future=snapshot();future.ordersAt='2026-11-17T10:00:01.000Z';
    blocked(run(future),'MISSING_STALE_OR_FUTURE_SNAPSHOT_CLOCK');
    blocked(run(snapshot(),expected(),now,policy,'2026-11-17T09:59:25.000Z'),
      'POST_RESTART_FRESH_BOOK_RECONCILIATION_REQUIRED');
    assert.equal(run(snapshot(),expected(),now,policy,
      '2026-11-17T09:59:10.000Z').status,
      'STRUCTURALLY_CONSISTENT_UNVERIFIED');
  });
  it('never calls a flat position safe while orphan SELL/GTT remains',()=>{
    const s=snapshot();s.positions=[];s.orders=[];
    assert.equal(run(s,expected(0)).status,'FLAT_UNVERIFIED');
    s.gtts=[stop({book:'GTT',kind:'GTT'})];
    blocked(run(s,expected(0)),'ORPHAN_SELL_OR_GTT_FOR_FLAT_POSITION');
  });
  it('blocks unresolved BUY, wrong product order and expiry-day structural green',()=>{
    const buy=snapshot();
    buy.orders.push(stop({orderId:'TEST_BUY',side:'BUY',kind:'LIMIT',status:'OPEN'}));
    blocked(run(buy),'UNRESOLVED_NEW_BUY_CAN_CHANGE_POSITION');
    const wrong=snapshot();wrong.orders[0].productType='MIS';
    blocked(run(wrong),'WRONG_PRODUCT_UNRESOLVED_OR_HISTORICAL_ORDER');
    const expiry=snapshot();
    expiry.positionsAt='2026-12-24T08:58:00.000Z';
    expiry.ordersAt='2026-12-24T08:58:00.000Z';
    expiry.gttsAt='2026-12-24T08:58:00.000Z';
    blocked(run(expiry,expected(),'2026-12-24T09:00:00.000Z'),
      'EXPIRY_PROXIMITY_REQUIRES_MANUAL_EXCHANGE_SESSION_REVIEW');
  });
});
