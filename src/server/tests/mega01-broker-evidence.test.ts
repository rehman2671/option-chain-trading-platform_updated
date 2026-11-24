import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brokerNumber, parseBrokerRiskResponse } from '../release/brokerAccountRiskEvidence.js';
import { reconcileOrderEvidence, reconcileRollbackEvidence, type OrderIntentEvidence } from '../release/brokerOrderReconciliationEvidence.js';

const now=Date.parse('2026-11-24T05:00:00Z');
const funds={status:'success',data:{equity:{available_margin:290000,used_margin:10000}}};
const margin={status:'success',data:{final_margin:1500}};
const portfolio={status:'success',data:[{instrument_token:'NSE_FO|1234',product:'I',pnl:-200,quantity:65}]};
test('broker funds evidence is bounded, explicit and never substitutes missing numbers',()=>{
  const good=parseBrokerRiskResponse(funds,margin,portfolio,now,now+1000);
  assert.ok(good);
  assert.equal(good.availableMargin,290000);
  assert.equal(good.usedMargin,10000);
  assert.equal(good.portfolioPnl,-200);
  assert.equal(good.activePositions,1);
  assert.equal(good.checkedAt,new Date(now).toISOString());
  for(const v of [null,undefined,'',' ',false,true,NaN,Infinity,{},[]])assert.equal(brokerNumber(v),null);
  assert.equal(brokerNumber('0'),0);
  for(const v of [null,'',false,-1]){
    assert.equal(parseBrokerRiskResponse({status:'success',data:{equity:{available_margin:v,used_margin:10000}}},margin,portfolio,now,now),null);
  }
  assert.equal(parseBrokerRiskResponse(funds,margin,portfolio,now,now+15001),null);
  assert.equal(parseBrokerRiskResponse(funds,margin,{status:'success',data:[{...portfolio.data[0],net_quantity:null}]},now,now),null);
  assert.equal(parseBrokerRiskResponse(funds,margin,{status:'success',data:[{...portfolio.data[0],net_quantity:0}]},now,now),null);
  assert.equal(parseBrokerRiskResponse(funds,margin,{status:'success',data:[...portfolio.data,...portfolio.data]},now,now),null);
  assert.equal(parseBrokerRiskResponse(funds,margin,{status:'success',data:[]},now,now)?.activePositions,0);
  assert.equal(parseBrokerRiskResponse(funds,{status:'success',data:{final_margin:0}},portfolio,now,now),null);
});
const intent:OrderIntentEvidence={orderId:'order-a',instrumentKey:'NSE_FO|1234',product:'I',side:'BUY',quantity:65,tag:'intent-a'};
const detail=(i:OrderIntentEvidence,filled:number,pending:number,status:string)=>({order_id:i.orderId,instrument_token:i.instrumentKey,product:i.product,transaction_type:i.side,tag:i.tag,quantity:i.quantity,filled_quantity:filled,pending_quantity:pending,status,average_price:filled?100:0});
const trade=(i:OrderIntentEvidence,quantity:number,tradeId='trade-a')=>({order_id:i.orderId,instrument_token:i.instrumentKey,product:i.product,transaction_type:i.side,quantity,trade_id:tradeId,exchange_order_id:'exchange-a',average_price:100});
test('acknowledgement, actual partial, terminal partial and filled are distinct',()=>{
  assert.equal(reconcileOrderEvidence(intent,detail(intent,0,65,'OPEN'),[]).status,'ACKNOWLEDGED');
  assert.equal(reconcileOrderEvidence(intent,detail(intent,25,40,'OPEN'),[trade(intent,25)]).status,'PARTIAL_OPEN');
  const partial=reconcileOrderEvidence(intent,detail(intent,25,0,'CANCELLED'),[trade(intent,25)]);
  assert.equal(partial.status,'TERMINAL_PARTIAL');
  assert.equal(partial.filledQuantity,25);
  assert.equal(partial.retryAuthorized,false);
  assert.equal(reconcileOrderEvidence(intent,detail(intent,0,0,'REJECTED'),[]).status,'TERMINAL_NO_FILL');
  assert.equal(reconcileOrderEvidence(intent,detail(intent,65,0,'COMPLETE'),[trade(intent,25),trade(intent,40,'trade-b')]).status,'FILLED');
});
test('missing, contradictory or duplicated evidence never implies zero fill or retry',()=>{
  for(const d of [null,{...detail(intent,25,40,'OPEN'),tag:'wrong'},detail(intent,25,41,'OPEN'),detail(intent,25,0,'COMPLETE')]){
    const r=reconcileOrderEvidence(intent,d,[trade(intent,25)]);
    assert.equal(r.status,'UNKNOWN');
    assert.equal(r.filledQuantity,null);
    assert.equal(r.retryAuthorized,false);
  }
  for(const trades of [null,[],[trade(intent,20)],[trade(intent,10),trade(intent,15)],[{...trade(intent,25),product:'D'}],[{...trade(intent,25),instrument_token:'1234'}],[{...trade(intent,25),average_price:101}]]){
    assert.equal(reconcileOrderEvidence(intent,detail(intent,25,40,'OPEN'),trades).status,'UNKNOWN');
  }
});
test('rollback requires opposing terminal fills and does not certify account closure',()=>{
  const entry=reconcileOrderEvidence(intent,detail(intent,25,0,'CANCELLED'),[trade(intent,25)]);
  const offset:OrderIntentEvidence={...intent,orderId:'order-b',tag:'intent-b',side:'SELL',quantity:25};
  const pending=reconcileOrderEvidence(offset,detail(offset,0,25,'OPEN'),[]);
  assert.equal(reconcileRollbackEvidence(intent,entry,offset,pending).status,'UNKNOWN');
  const partial=reconcileOrderEvidence(offset,detail(offset,10,0,'CANCELLED'),[trade(offset,10)]);
  assert.equal(reconcileRollbackEvidence(intent,entry,offset,partial).residualQuantity,15);
  const complete=reconcileOrderEvidence(offset,detail(offset,25,0,'COMPLETE'),[trade(offset,25)]);
  const result=reconcileRollbackEvidence(intent,entry,offset,complete);
  assert.equal(result.status,'OFFSET_FILLS_MATCH');
  assert.equal(result.residualQuantity,0);
  assert.equal(result.accountFlatCertified,false);
  assert.equal(result.retryAuthorized,false);
  assert.equal(reconcileRollbackEvidence(intent,entry,{...offset,product:'D'},complete).status,'UNKNOWN');
  assert.equal(reconcileRollbackEvidence(intent,entry,offset,{...complete,verifiedIntent:{...offset,orderId:'different'}}).status,'UNKNOWN');
});

test('provider read-only reconciliation rejects mid-read account generation change',async()=>{
  const {UpstoxProvider}=await import('../engine/providers/UpstoxProvider.js');
  const provider=new UpstoxProvider();
  Object.assign(provider,{accessToken:'fixture-token',userId:'fixture-account',isConnected:true,historicalFoAuthEpoch:1});
  provider.getOrderDetails=async()=>detail(intent,65,0,'COMPLETE');
  provider.getOrderTrades=async()=>[trade(intent,65)];
  assert.equal((await provider.getVerifiedOrderReconciliation(intent)).status,'FILLED');
  provider.getOrderTrades=async()=>{
    Object.assign(provider,{historicalFoAuthEpoch:2});
    return [trade(intent,65)];
  };
  const invalid=await provider.getVerifiedOrderReconciliation(intent);
  assert.equal(invalid.status,'UNKNOWN');
  assert.equal(invalid.retryAuthorized,false);
});

test('broker risk transport preserves one account identity across all three reads',async()=>{
  const {UpstoxProvider}=await import('../engine/providers/UpstoxProvider.js');
  const provider=new UpstoxProvider();
  Object.assign(provider,{accessToken:'fixture-token',userId:'fixture-account',isConnected:true,historicalFoAuthEpoch:1});
  const previous=globalThis.fetch;
  let invalidate=false;
  const calls:string[]=[];
  try {
    globalThis.fetch=async(input,init)=>{
      const url=String(input);
      calls.push(url);
      assert.ok(init?.signal);
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-token');
      let response:unknown;
      if(url.endsWith('/user/get-funds-and-margin')) response=funds;
      else if(url.endsWith('/charges/margin')){
        assert.equal(init?.method,'POST');
        assert.deepEqual(JSON.parse(String(init?.body)),{instruments:[{
          instrument_key:intent.instrumentKey,quantity:65,transaction_type:'BUY',product:'I'}]});
        response=margin;
      } else if(url.endsWith('/portfolio/short-term-positions')){
        response=portfolio;
        if(invalidate)Object.assign(provider,{historicalFoAuthEpoch:2});
      } else throw Error('Unexpected fixture URL');
      return new Response(JSON.stringify(response),{status:200});
    };
    const valid=await provider.getEmaBrokerRiskSnapshot(intent.instrumentKey,65,'MIS');
    assert.ok(valid);
    assert.equal(valid.availableMargin,290000);
    assert.equal(calls.length,3);
    invalidate=true;
    assert.equal(await provider.getEmaBrokerRiskSnapshot(intent.instrumentKey,65,'MIS'),null);
    assert.equal(calls.length,6);
    assert.equal(await provider.getEmaBrokerRiskSnapshot('NSE_INDEX|Nifty 50',65,'MIS'),null);
    assert.equal(calls.length,6);
  }finally{globalThis.fetch=previous;}
});

test('mixed exchange order identities cannot certify filled status',()=>{
  const d=detail(intent,65,0,'COMPLETE');
  assert.equal(reconcileOrderEvidence(intent,d,[trade(intent,25),{...trade(intent,40,'trade-b'),exchange_order_id:'exchange-b'}]).status,'UNKNOWN');
  assert.equal(reconcileOrderEvidence(intent,{...d,exchange_order_id:'exchange-b'},[trade(intent,65)]).status,'UNKNOWN');
  assert.equal(reconcileOrderEvidence(intent,{...d,exchange_order_id:'exchange-a'},[trade(intent,65)]).status,'FILLED');
});
