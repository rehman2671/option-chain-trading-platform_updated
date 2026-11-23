import {describe,it,mock} from 'node:test';
import assert from 'node:assert/strict';
import type {Ema15mSignal} from '../../types.js';
import type {ResolvedContract} from
  '../../server/engine/ema15m/contractResolver.js';
import {dbEngine} from '../../server/db.js';
import {killSwitchEngine} from '../../quant/risk/killSwitch.js';
import {ContractResolver} from
  '../../server/engine/ema15m/contractResolver.js';
import {LiveExecutionService} from
  '../../server/engine/ema15m/liveExecutionService.js';

const signal={id:'PH129-BLOCKED-ENTRY',
  instrument:'PH129-NIFTY-NO-BROKER',
  signalType:'BULLISH'} as unknown as Ema15mSignal;
const contract={lotSize:50,isValid:true,
  brokerInstrumentKey:'NSE_FO|PH129-OPTION',
  tradingsymbol:'PH129-OPTION-CE',
  optionType:'CE',strikePrice:25000,
  expiryDate:'2026-12-31'} as unknown as ResolvedContract;

/** No provider/order network activity; only read boundary can run. */
async function deniedEntryCase(
  initial:{upstoxProductType:unknown;liveBrokerExecutionEnabled:unknown},
  initialHalt:boolean,
  onContractVerify?:()=>void
){
  let settings={...initial},halt=initialHalt;
  let contractVerifyCalls=0,exitCalls=0,dbWrites=0,
    attemptedBrokerRiskReads=0;
  const svc=LiveExecutionService.getInstance();
  mock.method(dbEngine,'getEmaNotificationSettings',()=>{
    return {...settings} as ReturnType<typeof dbEngine.getEmaNotificationSettings>;
  });
  mock.method(killSwitchEngine,'isHalted',()=>halt);
  mock.method(ContractResolver,'verifyLiveContract',async()=>{
    contractVerifyCalls++;
    onContractVerify?.();
    return contract;
  });
  mock.method(svc,'requestLiveExit',async()=>{
    exitCalls++;
    return {success:true,message:'FORBIDDEN_AUTOMATIC_EXIT'};
  });
  mock.method(dbEngine,'saveEmaLiveOrderAttempt',()=>{
    dbWrites++;
  });
  mock.method(dbEngine,'getEmaLiveOrderAttempts',()=>{
    attemptedBrokerRiskReads++;
    return [];
  });
  try{
    const out=await svc.attemptLiveSignal(signal,contract,100,'PH129-USER');
    assert.equal(out.status,'PRE_TRADE_REJECTED');
    assert.equal(out.filledQuantity,0);
    assert.equal(out.positionCreated,false);
    assert.equal(exitCalls,0,'automatic opposite-signal SELL must not happen');
    assert.equal(dbWrites,0,'no durable entry attempt when early preflight rejects');
    assert.equal(attemptedBrokerRiskReads,0,
      'in-flight/position or broker risk lookup must not precede preflight');
    assert.ok(out.rejectionReason);
    return {contractVerifyCalls,reason:out.rejectionReason,halt,setSettings:
      (v:typeof settings)=>{settings=v;}};
  }finally{
    mock.restoreAll();
  }
}
describe('Phase129 actual LiveExecutionService automatic pre-reversal deny tests',()=>{
  it('MIS disabled LIVE setting rejects with zero contract/broker/exit side effects',async()=>{
    const v=await deniedEntryCase({
      upstoxProductType:'MIS',liveBrokerExecutionEnabled:false
    },false);
    assert.equal(v.contractVerifyCalls,0);
    assert.match(v.reason!,/disabled/i);
  });
  it('MIS kill switch engaged rejects before any other broker verification',async()=>{
    const v=await deniedEntryCase({
      upstoxProductType:'MIS',liveBrokerExecutionEnabled:true
    },true);
    assert.equal(v.contractVerifyCalls,0);
    assert.match(v.reason!,/kill switch/i);
  });
  it('NRML live toggle enabled never invokes broker GET or automatic reversal SELL',async()=>{
    const v=await deniedEntryCase({
      upstoxProductType:'NRML',liveBrokerExecutionEnabled:true
    },false);
    assert.equal(v.contractVerifyCalls,0);
    assert.match(v.reason!,/NRML/i);
  });
  it('malformed or absent product never falls back to MIS in LIVE entry service',async()=>{
    for(const x of ['',null,undefined,'nrml','CNC'] ){
      const v=await deniedEntryCase({
        upstoxProductType:x,liveBrokerExecutionEnabled:true
      },false);
      assert.equal(v.contractVerifyCalls,0);
    }
  });
  it('product/toggle change after awaited broker contract check prevents reversal',async()=>{
    let next:'MIS'|'NRML'='MIS';
    let active=true;
    let contractCalls=0,exitCalls=0,claims=0;
    const svc=LiveExecutionService.getInstance();
    mock.method(dbEngine,'getEmaNotificationSettings',()=>{
      return {upstoxProductType:next,liveBrokerExecutionEnabled:active} as
        ReturnType<typeof dbEngine.getEmaNotificationSettings>;
    });
    mock.method(killSwitchEngine,'isHalted',()=>false);
    mock.method(ContractResolver,'verifyLiveContract',async()=>{
      contractCalls++;
      active=false;
      return contract;
    });
    mock.method(svc,'requestLiveExit',async()=>{
      exitCalls++;return {success:true,message:'UNEXPECTED'};
    });
    mock.method(dbEngine,'getEmaLiveOrderAttempts',()=>{claims++;return [];});
    try{
      const out=await svc.attemptLiveSignal(signal,contract,100,'PH129-USER');
      assert.equal(out.status,'PRE_TRADE_REJECTED');
      assert.equal(out.filledQuantity,0);
      assert.equal(out.positionCreated,false);
      assert.equal(contractCalls,1);
      assert.equal(exitCalls,0);
      assert.equal(claims,0);
    }finally{mock.restoreAll();}
  });
  it('product switches MIS to NRML after awaited verification blocks automatic reversal',async()=>{
    let next:'MIS'|'NRML'='MIS';
    const svc=LiveExecutionService.getInstance();
    let exits=0,claims=0;
    mock.method(dbEngine,'getEmaNotificationSettings',()=>{
      return {upstoxProductType:next,liveBrokerExecutionEnabled:true}
        as ReturnType<typeof dbEngine.getEmaNotificationSettings>;
    });
    mock.method(killSwitchEngine,'isHalted',()=>false);
    mock.method(ContractResolver,'verifyLiveContract',async()=>{
      next='NRML';
      return contract;
    });
    mock.method(svc,'requestLiveExit',async()=>{
      exits++;return {success:true,message:'UNEXPECTED'};
    });
    mock.method(dbEngine,'getEmaLiveOrderAttempts',()=>{claims++;return [];});
    try{
      const out=await svc.attemptLiveSignal(signal,contract,100,'PH129-USER');
      assert.equal(out.status,'PRE_TRADE_REJECTED');
      assert.equal(out.positionCreated,false);
      assert.equal(exits,0);
      assert.equal(claims,0);
    }finally{mock.restoreAll();}
  });
});
