import {describe,it,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assessEmaBrokerExitProductGate,
  isMisLiveAutoExitCandidate,
  assessEmaLiveProductGate,
  isMisForcedSquareOffEligible
} from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
import {LiveExecutionService} from
  '../../server/engine/ema15m/liveExecutionService.js';
import {dbEngine} from '../../server/db.js';
import {activeProvider} from '../../server/engine/providers/index.js';
import {ContractResolver} from '../../server/engine/ema15m/contractResolver.js';
import {killSwitchEngine} from '../../quant/risk/killSwitch.js';
import type {Ema15mSignal} from '../../types.js';
import type {ResolvedContract} from '../../server/engine/ema15m/contractResolver.js';
import type {EmaLivePosition} from
  '../../server/engine/ema15m/types.js';

const pos=(id:string,productType:unknown,status='OPEN')=>({
  id,productType,status,instrument:'NIFTY',
  brokerInstrumentKey:'NSE_FO|PH130-CE',
  tradingsymbol:'PH130-CE',entryPrice:200,quantity:50,
  lotSize:50,stopLoss:190,targetPrice:300,
  isTrailingActive:false,brokerage:40,
  attemptId:'PH130-BUY',signalId:'PH130-SIGNAL',
  exitFilledQuantity:0
}) as EmaLivePosition;
const svc=LiveExecutionService.getInstance();
describe('Phase130 broker NRML SELL and automatic exit route denied until separate release',()=>{
  it('broker EXIT gate accepts exact MIS only, even for a previously open NRML long',()=>{
    assert.deepEqual(assessEmaBrokerExitProductGate('MIS'),
      {allowed:true,reason:null});
    const r=assessEmaBrokerExitProductGate('NRML');
    assert.equal(r.allowed,false);
    assert.match(r.reason!,/no-short/i);
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
  });
  it('legacy exit gate rejects unknown, malformed, disguised or lowercase product',()=>{
    for(const x of [
      undefined,null,'','mis','nrml','D','I','CNC','MIS ',
      new String('MIS'),{productType:'MIS'},true,1
    ]){
      const r=assessEmaBrokerExitProductGate(x);
      assert.equal(r.allowed,false);
      assert.match(r.reason!,/product/i);
    }
  });
  it('polling auto-exit eligibility is MIS OPEN only, never NRML, null or ambiguous',()=>{
    assert.equal(isMisLiveAutoExitCandidate(pos('MIS','MIS')),true);
    assert.equal(isMisLiveAutoExitCandidate(pos('NRML','NRML')),false);
    for(const status of [
      'CLOSED','EXIT_REQUESTED','EXIT_PENDING','PARTIALLY_CLOSED',
      'EXIT_FAILED'
    ]){
      assert.equal(isMisLiveAutoExitCandidate(pos('X','MIS',status)),false);
    }
    for(const candidate of [
      null,undefined,{},[],false,'OPEN',
      {productType:'MIS'}, {status:'OPEN'},pos('X','nrml')
    ])assert.equal(isMisLiveAutoExitCandidate(candidate),false);
  });
  it('DIRECT requestLiveExit refuses even explicit MANUAL NRML without any broker query',async()=>{
    const old=pos('PH130-NRML-LONG','NRML');
    let entryRead=0,claim=0,book=0;
    mock.method(dbEngine,'getOpenEmaLivePositions',()=>[old]);
    mock.method(dbEngine,'getEmaLiveOrderAttemptById',()=>{
      entryRead++;throw Error('ENTRY_READ_MUST_NOT_RUN');
    });
    mock.method(dbEngine,'claimEmaLiveExit',()=>{
      claim++;throw Error('CLAIM_MUST_NOT_RUN');
    });
    mock.method(dbEngine,'updateEmaLivePosition',()=>{
      book++;throw Error('WRITE_MUST_NOT_RUN');
    });
    try{
      for(const reason of [
        'MANUAL','TRAILING_SL_HIT','SL_HIT',
        'TARGET_HIT','OPPOSITE_CROSSOVER'
      ]){
        const r=await svc.requestLiveExit(old.id,reason);
        assert.equal(r.success,false);
        assert.match(r.message,/NRML broker SELL blocked/);
        assert.equal(r.exitBrokerOrderId,undefined);
      }
      assert.equal(entryRead,0);
      assert.equal(claim,0);
      assert.equal(book,0);
    }finally{mock.restoreAll();}
  });
  it('unknown persisted product cannot become MIS in generic requestLiveExit',async()=>{
    const unknown=pos('PH130-UNKNOWN','UNKNOWN');
    let entryReads=0,claims=0;
    mock.method(dbEngine,'getOpenEmaLivePositions',()=>[unknown]);
    mock.method(dbEngine,'getEmaLiveOrderAttemptById',()=>{
      entryReads++;return null;
    });
    mock.method(dbEngine,'claimEmaLiveExit',()=>{
      claims++;return false;
    });
    try{
      const r=await svc.requestLiveExit(unknown.id,'MANUAL');
      assert.equal(r.success,false);
      assert.match(r.message,/Unknown live position product/);
      assert.equal(entryReads,0);
      assert.equal(claims,0);
    }finally{mock.restoreAll();}
  });
  it('monitoring NRML or UNKNOWN never calls quote, broker exit, or position PnL writer',async()=>{
    const positions=[
      pos('PH130-NRML-LONG','NRML'),
      pos('PH130-UNKNOWN','UNKNOWN')
    ];
    let exits=0,writes=0;
    const provider=activeProvider as unknown as {
      getLiveOptionQuote?: (key:string)=>Promise<unknown>
    };
    const quoteBefore=provider.getLiveOptionQuote;
    let quotes=0;
    provider.getLiveOptionQuote=async(key:string)=>{
      quotes++;return {price:150,exchangeTimestamp:new Date().toISOString(),
        instrumentKey:key,source:'UPSTOX_FULL_MARKET_QUOTE_V3_LTP'};
    };
    mock.method(dbEngine,'getOpenEmaLivePositions',()=>positions);
    mock.method(dbEngine,'getEmaNotificationSettings',()=>({
      trailingSlEnabled:false
    }) as ReturnType<typeof dbEngine.getEmaNotificationSettings>);
    mock.method(svc,'requestLiveExit',async()=>{
      exits++;return {success:true,message:'UNEXPECTED'};
    });
    mock.method(dbEngine,'updateEmaLivePosition',()=>{
      writes++;return;
    });
    try{
      await svc.monitorLivePositions('NIFTY',25100,()=>150);
      assert.equal(quotes,0);
      assert.equal(exits,0);
      assert.equal(writes,0);
    }finally{
      provider.getLiveOptionQuote=quoteBefore;
      mock.restoreAll();
    }
  });
  it('mixed MIS and NRML monitoring retains MIS stop exit without touching NRML',async()=>{
    const positions=[
      pos('PH130-NRML-LONG','NRML'),
      pos('PH130-MIS-LONG','MIS'),
      pos('PH130-OTHER','D')
    ];
    const provider=activeProvider as unknown as {
      getLiveOptionQuote?:(k:string)=>Promise<unknown>
    };
    const previous=provider.getLiveOptionQuote;
    let quotes=0;const exits:string[]=[];
    provider.getLiveOptionQuote=async(key:string)=>{
      quotes++;return {price:150,exchangeTimestamp:new Date().toISOString(),
        instrumentKey:key,source:'UPSTOX_FULL_MARKET_QUOTE_V3_LTP'};
    };
    mock.method(dbEngine,'getOpenEmaLivePositions',()=>positions);
    mock.method(dbEngine,'getEmaNotificationSettings',()=>({
      trailingSlEnabled:false
    }) as ReturnType<typeof dbEngine.getEmaNotificationSettings>);
    mock.method(svc,'requestLiveExit',async(positionId:string)=>{
      exits.push(positionId);return {success:true,message:'MOCK-ONLY'};
    });
    try{
      await svc.monitorLivePositions('NIFTY',25100,()=>150);
      assert.equal(quotes,1);
      assert.deepEqual(exits,['PH130-MIS-LONG']);
    }finally{
      provider.getLiveOptionQuote=previous;
      mock.restoreAll();
    }
  });
  it('actual automatic MIS signal cannot reverse an existing NRML long or submit a replacement BUY',async()=>{
    const previous=pos('PH130-EXISTING-NRML-PE','NRML');
    let verified=0,exits=0,claims=0,risk=0;
    const signal={id:'PH130-OPPOSITE-MIS-SIGNAL',
      instrument:'NIFTY',signalType:'BULLISH'} as Ema15mSignal;
    const contract={isValid:true,lotSize:50,
      brokerInstrumentKey:'NSE_FO|PH130-CE',
      tradingsymbol:'PH130-NIFTY-CE',
      optionType:'CE',strikePrice:25000,expiryDate:'2026-12-31'
    } as ResolvedContract;
    mock.method(dbEngine,'getEmaNotificationSettings',()=>({
      upstoxProductType:'MIS',
      liveBrokerExecutionEnabled:true
    }) as ReturnType<typeof dbEngine.getEmaNotificationSettings>);
    mock.method(killSwitchEngine,'isHalted',()=>false);
    mock.method(ContractResolver,'verifyLiveContract',async()=>{
      verified++;return contract;
    });
    mock.method(dbEngine,'getEmaLiveOrderAttempts',()=>[]);
    mock.method(dbEngine,'getOpenEmaLivePositionByInstrument',()=>previous);
    mock.method(dbEngine,'claimEmaLiveEntryAttempt',()=>{
      claims++;return false;
    });
    mock.method(dbEngine,'getEmaLiveOrderAttemptById',()=>{
      risk++;return null;
    });
    mock.method(svc,'requestLiveExit',async()=>{
      exits++;return {success:true,message:'FORBIDDEN'};
    });
    try{
      const out=await svc.attemptLiveSignal(signal,contract,100,'PH130-USER');
      assert.equal(out.status,'PRE_TRADE_REJECTED');
      assert.equal(out.positionCreated,false);
      assert.equal(out.filledQuantity,0);
      assert.match(out.rejectionReason||'',/NRML broker SELL blocked/);
      assert.equal(verified,1);
      assert.equal(exits,0);
      assert.equal(claims,0);
      assert.equal(risk,0);
    }finally{mock.restoreAll();}
  });

  it('source: reversal existing long product blocks before requestLiveExit; no fallback on SELL',()=>{
    const source=readFileSync(
      'src/server/engine/ema15m/liveExecutionService.ts','utf8');
    const start=source.indexOf('private async attemptLiveSignalInternal(');
    const mid=source.indexOf('public async monitorLivePositions(');
    const end=source.indexOf('public async checkForcedIntradaySquareOff(');
    assert.ok(start>=0&&mid>start&&end>mid);
    const entry=source.slice(start,mid);
    assert.ok(entry.indexOf('const existingExitGate = assessEmaBrokerExitProductGate(')>=0);
    assert.ok(entry.indexOf('const existingExitGate = assessEmaBrokerExitProductGate(')<
      entry.indexOf('this.requestLiveExit(existingLivePos.id'));
    const monitor=source.slice(mid,source.indexOf('public async requestLiveExit(',mid));
    assert.match(monitor,/!isMisLiveAutoExitCandidate\(pos\)/);
    const exit=source.slice(source.indexOf('public async requestLiveExit(',mid),end);
    assert.ok(exit.indexOf('const exitGate = assessEmaBrokerExitProductGate(')<
      exit.indexOf('dbEngine.getEmaLiveOrderAttemptById('));
    assert.ok(exit.indexOf('const exitGate = assessEmaBrokerExitProductGate(')<
      exit.indexOf('provider.getOrderBook('));
    assert.ok(exit.indexOf('const exitGate = assessEmaBrokerExitProductGate(')<
      exit.indexOf('.placeOrder('));
    assert.ok(!exit.includes("product: pos.productType || 'MIS'"));
    assert.ok(exit.includes('product: pos.productType,'));
  });
  it('existing MIS-only 15:15 exit filter remains completely separate',()=>{
    assert.equal(isMisForcedSquareOffEligible(pos('PH130-NRML','NRML')),false);
    assert.equal(isMisForcedSquareOffEligible(pos('PH130-MIS','MIS')),true);
  });
});
