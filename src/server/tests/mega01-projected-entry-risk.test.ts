import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBoundBrokerEntryEvidence,type BrokerEntryIdentity} from '../release/boundBrokerEntryEvidence.js';
import {evaluateProjectedEntryRisk,type ProjectedEntryInput} from '../release/projectedEntryRisk.js';
import type {GreekMark} from '../release/portfolioGreekEvidence.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const id:BrokerEntryIdentity={accountId:'fixture-a',authEpoch:2,instrumentKey:'NSE_FO|1234',quantity:65,product:'D'};
const funds={status:'success',data:{equity:{available_margin:290000,used_margin:10000}}};
const margin={status:'success',data:{final_margin:1500}};
const pos={instrument_token:'NSE_FO|5678',product:'I',quantity:25,pnl:0};
const portfolio={status:'success',data:[pos]};
const mark:GreekMark={instrumentKey:id.instrumentKey,underlying:'NIFTY',observedAt:now,sessionEpoch:'2',convention:'PER_UNIT_PER_POINT_PER_DAY_PER_IV_POINT',delta:.5,gamma:.001,theta:-1,vega:2};
const other:GreekMark={...mark,instrumentKey:pos.instrument_token,delta:-.5};
const caps={netDelta:100,netGamma:1,netTheta:1000,netVega:1000,grossDelta:100,grossGamma:1,grossTheta:1000,grossVega:1000};
function fixture():ProjectedEntryInput{
 const broker=buildBoundBrokerEntryEvidence(id,funds,margin,portfolio,now,now+1);
 if(!broker)throw Error('fixture invalid');
 return {broker,expected:id,sessionEpoch:'2',currentMarks:[other],candidateMark:mark,limitPricePaise:5000,maxFeesPaise:1000,maxDailyLossPaise:100000,limits:{NIFTY:caps}};
}
test('broker native rows retain exact candidate identity and never hide unsupported active exposures',()=>{
 const b=fixture().broker;
 assert.deepEqual(b.identity,id);
 assert.deepEqual(b.reportedOptionPositions,[{instrumentKey:pos.instrument_token,product:'I',netQuantity:25}]);
 assert.equal(b.accountCompletenessCertified,false);
 assert.equal(b.orderAuthorized,false);
 for(const data of [[pos,pos],[{...pos,product:'MTF'}],[{...pos,instrument_token:'NSE_EQ|ABC'}],[{...pos,net_quantity:0}],[{...pos,quantity:NaN}]])
  assert.equal(buildBoundBrokerEntryEvidence(id,funds,margin,{status:'success',data},now,now+1),null);
 assert.equal(buildBoundBrokerEntryEvidence(id,funds,margin,portfolio,now,now+15001),null);
});
test('candidate premium plus fee bound and projected net/gross risk use signed units',()=>{
 const r=evaluateProjectedEntryRisk(fixture(),now+1);
 assert.equal(r.status,'WITHIN_INPUT_LIMITS');

 assert.equal(r.maxPremiumAndFeesPaise,326000);
 assert.equal(r.reservationPaise,326000);
 assert.equal(r.projected.NIFTY.netDelta,20);
 assert.equal(r.projected.NIFTY.grossDelta,45);
 assert.equal(r.orderAuthorized,false);
 const x=fixture();
 assert.equal(evaluateProjectedEntryRisk({...x,limits:{NIFTY:{...caps,grossDelta:40}}},now+1).status,'DENIED');
 assert.equal(evaluateProjectedEntryRisk({...x,limitPricePaise:10000},now+1).status,'DENIED');
 assert.equal(evaluateProjectedEntryRisk({...x,maxFeesPaise:NaN},now+1).status,'DENIED');
 const highMargin={...x.broker,snapshot:{...x.broker.snapshot,requiredMargin:7000}};
 assert.equal(evaluateProjectedEntryRisk({...x,broker:highMargin},now+1).status,'DENIED');
});
test('wrong session, stale/missing marks, incomplete policy and identity changes fail closed',()=>{
 const x=fixture();
 for(const bad of [{...x,expected:{...id,quantity:66}},{...x,sessionEpoch:'3'},
  {...x,currentMarks:[]},{...x,limits:{}},{...x,candidateMark:{...mark,observedAt:now-15001}},
  {...x,candidateMark:{...mark,delta:NaN}},{...x,broker:{...x.broker,receivedAt:now+2}}])
  assert.equal(evaluateProjectedEntryRisk(bad,now+1).status,'DENIED');
 assert.equal(evaluateProjectedEntryRisk(x,now+15001).status,'DENIED');
});
test('native provider binds account, epoch, quantity and product across all reads',async()=>{
 const {UpstoxProvider}=await import('../engine/providers/UpstoxProvider.js');
 const provider=new UpstoxProvider();
 Object.assign(provider,{accessToken:'fixture-token',userId:id.accountId,isConnected:true,historicalFoAuthEpoch:id.authEpoch});
 const old=globalThis.fetch;let calls=0,rotate=false;
 try{
  globalThis.fetch=async(input,init)=>{
   calls++;const url=String(input);
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-token');
   assert.ok(init?.signal);
   let data:unknown;
   if(url.endsWith('/user/get-funds-and-margin'))data=funds;
   else if(url.endsWith('/charges/margin')){
    assert.deepEqual(JSON.parse(String(init?.body)),{instruments:[{instrument_key:id.instrumentKey,quantity:id.quantity,transaction_type:'BUY',product:'D'}]});
    data=margin;
   }else if(url.endsWith('/portfolio/short-term-positions')){data=portfolio;if(rotate)Object.assign(provider,{historicalFoAuthEpoch:3});}
   else throw Error('Unexpected fixture URL');
   return new Response(JSON.stringify(data),{status:200});
  };
  assert.equal(await provider.getBoundBrokerEntryEvidence({...id,accountId:'other'}),null);
  assert.equal(calls,0);
  const good=await provider.getBoundBrokerEntryEvidence(id);assert.ok(good);
  assert.deepEqual(good.identity,id);assert.equal(calls,3);
  rotate=true;assert.equal(await provider.getBoundBrokerEntryEvidence(id),null);assert.equal(calls,6);
 }finally{globalThis.fetch=old;}
});
