import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  assessEmaLiveProductGate,getNrmlLiveStatus,isMisForcedSquareOffEligible
} from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

describe('Phase90 live NRML requested but broker-native stop release blocked',()=>{
  it('NRML selected with generic live toggle ON must still reject new live BUY',()=>{
    const status=getNrmlLiveStatus('NRML',true);
    assert.equal(status.mode,'NRML_LIVE_REQUESTED_RELEASE_BLOCKED');
    assert.equal(status.requested,true);
    assert.equal(status.globalLiveToggleEnabled,true);
    assert.equal(status.nrmlOrderRoutingAuthorized,false);
    assert.equal(status.brokerNativeStopChildAckVerified,false);
    assert.equal(status.nrmlPositional1515SquareOff,false);
    const gate=assessEmaLiveProductGate('NRML');
    assert.equal(gate.allowed,false);
    assert.match(gate.reason!,/native stop\/GTT child exchange ACK/i);
  });
  it('NRML live toggle OFF still reflects positional mode selected, not a live order',()=>{
    const status=getNrmlLiveStatus('NRML',false);
    assert.equal(status.requested,true);
    assert.equal(status.globalLiveToggleEnabled,false);
    assert.equal(status.nrmlOrderRoutingAuthorized,false);
  });
  it('legacy MIS product passes product-only check, without skipping other live broker risk gates',()=>{
    assert.deepEqual(assessEmaLiveProductGate('MIS'),
      {allowed:true,reason:null});
    const status=getNrmlLiveStatus('MIS',true);
    assert.equal(status.mode,'NRML_NOT_SELECTED');
    assert.equal(status.nrmlOrderRoutingAuthorized,false);
  });
  it('unrecognised, lowercase and null product values all fail closed',()=>{
    for(const v of ['nrml','INTRADAY','CNC','',null,undefined,{},true]){
      assert.equal(assessEmaLiveProductGate(v).allowed,false);
      assert.equal(getNrmlLiveStatus(v,true).requested,false);
    }
  });
  it('fake owner-supplied stop flags and broker info cannot override NRML release gate',()=>{
    for(const v of [
      Object.assign(new String('NRML'),{brokerNativeStopChildAckVerified:true}),
      {productType:'NRML',brokerNativeStopChildAckVerified:true,
        marketSourceLicenseVerified:true,manualApproval:true}
    ]){
      assert.equal(assessEmaLiveProductGate(v).allowed,false);
    }
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('all independently required release blockers are visible without sensitive details',()=>{
    const r=getNrmlLiveStatus('NRML',true);
    assert.ok(r.releaseBlockers.length>=5);
    assert.ok(r.releaseBlockers.some(x=>x.includes('CHILD_EXCHANGE_ACK')));
    assert.ok(r.releaseBlockers.some(x=>x.includes('RESTART')));
    assert.ok(r.releaseBlockers.some(x=>x.includes('HUMAN')));
    assert.ok(!JSON.stringify(r).includes('access_token'));
  });
  it('15:15 intraday squareoff selects only OPEN MIS position',()=>{
    assert.equal(isMisForcedSquareOffEligible({
      id:'MIS-OPEN',productType:'MIS',status:'OPEN'
    }),true);
  });
  it('never forced squareoff OPEN NRML even if global live setting is enabled',()=>{
    assert.equal(isMisForcedSquareOffEligible({
      id:'NRML-OPEN',productType:'NRML',status:'OPEN',
      globalLiveToggleEnabled:true
    }),false);
  });
  it('never forced squareoff unknown-product or legacy ambiguous positions',()=>{
    for(const pos of [
      {id:'MISSING',status:'OPEN'},
      {id:'UNKNOWN',productType:'UNKNOWN',status:'OPEN'},
      {id:'NRML-SYNTHETIC',productType:'NRML',status:'OPEN'},
      null,undefined,'OPEN'
    ])assert.equal(isMisForcedSquareOffEligible(pos),false);
  });
  it('never forced squareoff already closed, partial, pending MIS positions',()=>{
    for(const status of ['CLOSED','EXIT_PENDING','PARTIALLY_CLOSED',
      'EXIT_REQUESTED','EXIT_FAILED']){
      assert.equal(isMisForcedSquareOffEligible({productType:'MIS',status}),false);
    }
  });
  it('mixed broker position list retains existing MIS forced exits but excludes every NRML candidate',()=>{
    const positions=[
      {id:'MIS-A',productType:'MIS',status:'OPEN'},
      {id:'NRML-B',productType:'NRML',status:'OPEN'},
      {id:'MIS-EXIT',productType:'MIS',status:'EXIT_PENDING'},
      {id:'UNKNOWN',productType:null,status:'OPEN'},
      {id:'MIS-C',productType:'MIS',status:'OPEN'}
    ];
    assert.deepEqual(positions.filter(isMisForcedSquareOffEligible).map(p=>p.id),
      ['MIS-A','MIS-C']);
  });
  it('no broker adapter or order function is used by the offline NRML status/readiness checks',()=>{
    let brokerCalls=0;
    const unauthorizedBroker={placeOrder:()=>{brokerCalls++;}};
    const r=getNrmlLiveStatus('NRML',true);
    const allowed=assessEmaLiveProductGate('NRML');
    if(allowed.allowed)unauthorizedBroker.placeOrder();
    assert.equal(brokerCalls,0);
    assert.equal(r.nrmlOrderRoutingAuthorized,false);
  });
});
