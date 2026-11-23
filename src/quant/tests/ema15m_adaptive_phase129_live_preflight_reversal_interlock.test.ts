import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assessEmaAutomaticLiveEntryPreflight,
  assessEmaLiveProductGate,
  normalizeEmaLiveProductSettings,
  getNrmlLiveStatus,isMisForcedSquareOffEligible
} from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

describe('Phase129 automatic EMA live-entry preflight before reversal SELL',()=>{
  it('only explicitly selected MIS, enabled live and HALT=false permits entry intent',()=>{
    assert.deepEqual(assessEmaAutomaticLiveEntryPreflight(
      'MIS','MIS',true,false),{allowed:true,reason:null});
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
    assert.equal(getNrmlLiveStatus('NRML',true).nrmlOrderRoutingAuthorized,false);
  });
  it('NRML never bypasses via live toggle, claimed proof or recent broker account',()=>{
    for(const now of [true,false,1,'true',null]){
      const r=assessEmaAutomaticLiveEntryPreflight(
        'NRML','NRML',now,false);
      assert.equal(r.allowed,false);
      assert.match(r.reason!,/NRML/i);
    }
    for(const malicious of [
      {product:'NRML',brokerStopChildNativeExchangeAckVerified:true},
      new String('MIS'), 'nrml','UNKNOWN',undefined,null,''
    ])assert.equal(
      assessEmaAutomaticLiveEntryPreflight(malicious,malicious,true,false)
        .allowed,false);
  });
  it('live enabled OFF, falsey and string truthy values all block MIS reversal and BUY',()=>{
    for(const live of [false,undefined,null,0,1,'true','yes',{},[]]){
      const r=assessEmaAutomaticLiveEntryPreflight(
        'MIS','MIS',live,false);
      assert.equal(r.allowed,false);
      assert.match(r.reason!,/disabled/i);
    }
  });
  it('halt=true, missing or ambiguous kill switch blocks MIS even with toggle true',()=>{
    for(const halted of [
      true,undefined,null,0,1,'false','true',{},[]
    ]){
      const r=assessEmaAutomaticLiveEntryPreflight(
        'MIS','MIS',true,halted);
      assert.equal(r.allowed,false);
      assert.match(r.reason!,/kill switch/i);
    }
  });
  it('mid-flight product drift to NRML or unknown never triggers automatic reversal',()=>{
    for(const next of [
      'NRML','UNKNOWN',undefined,null,'mis',{}
    ]){
      assert.equal(assessEmaAutomaticLiveEntryPreflight(
        'MIS',next,true,false).allowed,false);
    }
    assert.equal(assessEmaAutomaticLiveEntryPreflight(
      'MIS','MIS',true,false).allowed,true);
  });
  it('normalize saved malformed or blank product as display MIS with LIVE explicitly OFF',()=>{
    const invalid=[null,undefined,'',false,0,'MIS ','mis','nrml',
      'CNC','D','INTRADAY',{},[],new String('MIS')];
    for(const product of invalid){
      for(const toggle of [true,false,'true',1]){
        const s=normalizeEmaLiveProductSettings(product,toggle);
        assert.equal(s.productType,'MIS');
        assert.equal(s.liveEnabled,false);
        assert.equal(s.recognized,false);
      }
    }
  });
  it('only exact MIS/NRML product and boolean true survives persistence',()=>{
    for(const product of ['MIS','NRML'] as const){
      const on=normalizeEmaLiveProductSettings(product,true);
      assert.deepEqual(on,{productType:product,recognized:true,
        liveEnabled:true});
      assert.equal(
        normalizeEmaLiveProductSettings(product,'true').liveEnabled,false);
      assert.equal(
        normalizeEmaLiveProductSettings(product,false).liveEnabled,false);
    }
    // Product normalization does NOT release NRML.
    const nrml=normalizeEmaLiveProductSettings('NRML',true);
    assert.equal(assessEmaLiveProductGate(nrml.productType).allowed,false);
  });
  it('actual live entry method has preflight BEFORE contract await and reversal SELL',()=>{
    const src=readFileSync(
      'src/server/engine/ema15m/liveExecutionService.ts','utf8');
    const begin=src.indexOf('  private async attemptLiveSignalInternal(');
    const end=src.indexOf('  public async monitorLivePositions(',begin);
    assert.ok(begin>=0&&end>begin);
    const body=src.slice(begin,end);
    const initial=body.indexOf('const initialIntent = currentAutomaticEntryIntent()');
    const verify=body.indexOf('ContractResolver.verifyLiveContract(');
    const recheck=body.indexOf('const afterContractIntent = currentAutomaticEntryIntent()');
    const reversal=body.indexOf('this.requestLiveExit(existingLivePos.id');
    const risk=body.indexOf('getEmaBrokerRiskSnapshot(');
    const final=body.indexOf('const beforeBuyIntent = currentAutomaticEntryIntent()');
    const claim=body.indexOf('dbEngine.claimEmaLiveEntryAttempt(');
    const place=body.indexOf('.placeOrder(');
    for(const i of [initial,verify,recheck,reversal,risk,final,claim,place])
      assert.ok(i>=0,'missing live entry phase '+i);
    assert.ok(initial<verify,'preflight must predate broker contract I/O');
    assert.ok(verify<recheck&&recheck<reversal,
      'current toggle/kill product must be checked after async verification and BEFORE reversal SELL');
    assert.ok(risk<final&&final<claim&&claim<place,
      'live toggle/kill must be rechecked after risk network GET and BEFORE BUY attempt claim');
    assert.match(body,/requestedProductType = requestedSettings\.upstoxProductType;/);
    assert.equal(body.includes("requestedSettings.upstoxProductType || 'MIS'"),false);
    assert.match(body,/killSwitchEngine\.isHalted\(userId\)/);
  });
  it('persisted DB settings read AND write fence invalid values before broker entry',()=>{
    const db=readFileSync('src/server/db.ts','utf8');
    const section=db.slice(db.indexOf('  public getEmaNotificationSettings('),
      db.indexOf('  public logEmaExecution(',db.indexOf(
        '  public getEmaNotificationSettings(')));
    assert.ok(section.includes('normalizeEmaLiveProductSettings('));
    assert.match(section,/liveBrokerExecutionEnabled: safeLiveProduct\.liveEnabled/);
    assert.match(section,/upstoxProductType: safeLiveProduct\.productType/);
    assert.match(section,/safeLiveProduct\.liveEnabled \? 1 : 0/);
    assert.match(section,/safeLiveProduct\.productType,/);
    assert.equal(section.includes("(row.upstox_product_type as any) || 'MIS'"),false);
    assert.equal(section.includes("settings.upstoxProductType || 'MIS'"),false);
  });
  it('unknown product in normal pre-trade validation fails closed, MIS exit stays separate',()=>{
    const src=readFileSync(
      'src/server/engine/ema15m/liveExecutionService.ts','utf8');
    assert.equal(src.includes(
      "assessEmaLiveProductGate(settings.upstoxProductType || 'MIS')"),
    false);
    assert.ok(src.includes(
      'assessEmaLiveProductGate(settings.upstoxProductType)'));
    assert.equal(isMisForcedSquareOffEligible({
      productType:'NRML',status:'OPEN'}),false);
    assert.equal(isMisForcedSquareOffEligible({
      productType:'MIS',status:'OPEN'}),true);
  });
});
