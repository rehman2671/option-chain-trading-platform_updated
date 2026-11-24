import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyExactListedOption,type ListedOptionRequest} from '../release/exactListedOptionEvidence.js';
import {buildBoundBrokerEntryEvidence} from '../release/boundBrokerEntryEvidence.js';
import {assessCandidateEvidenceBundle,type CandidateEvidenceBundle} from '../release/candidateEvidenceBundle.js';
import type {GreekMark} from '../release/portfolioGreekEvidence.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const identity={accountId:'fixture-a',authEpoch:2,instrumentKey:'NSE_FO|1234',quantity:65,product:'D' as const};
const request:ListedOptionRequest={identity,underlying:'NIFTY',optionType:'CE',strike:25000,expiry:'2026-12-31'};
const contract={instrument_key:identity.instrumentKey,segment:'NSE_FO',underlying_key:'NSE_INDEX|Nifty 50',underlying_symbol:'NIFTY',
 instrument_type:'CE',expiry:request.expiry,strike_price:25000,lot_size:65,tick_size:5,trading_symbol:'NIFTY FIXTURE CE'};
test('exact listed contract rejects duplicate, wrong expiry, strike, segment, lot and ambiguous tick',()=>{
 const valid=verifyExactListedOption(request,[contract],now,now+1);
 assert.ok(valid);assert.equal(valid.lotSize,65);assert.equal(valid.tickSizePaise,5);assert.equal(valid.orderAuthorized,false);
 for(const rows of [[contract,contract],[{...contract,expiry:'2026-12-24'}],[{...contract,strike_price:24950}],
  [{...contract,segment:'BSE_FO'}],[{...contract,lot_size:50}],[{...contract,tick_size:0.05}],[{...contract,tick_size:null}]])
  assert.equal(verifyExactListedOption(request,rows,now,now+1),null);
 assert.equal(verifyExactListedOption({...request,expiry:'2026-02-30'},[contract],now,now+1),null);
 assert.equal(verifyExactListedOption(request,[contract],now,now+15001),null);
});
function fixture():CandidateEvidenceBundle{
 const listing=verifyExactListedOption(request,[contract],now,now+1);
 const broker=buildBoundBrokerEntryEvidence(identity,{status:'success',data:{equity:{available_margin:290000,used_margin:10000}}},
  {status:'success',data:{final_margin:1500}},{status:'success',data:[]},now,now+1);
 assert.ok(listing);assert.ok(broker);
 const mark:GreekMark={instrumentKey:identity.instrumentKey,underlying:'NIFTY',observedAt:now,sessionEpoch:'2',
  convention:'PER_UNIT_PER_POINT_PER_DAY_PER_IV_POINT',delta:.5,gamma:.001,theta:-1,vega:2};
 return {ownerId:'owner-a',binding:{ownerId:'owner-a',accountId:'fixture-a',authEpoch:2,verifiedAt:now},listing,
  risk:{broker,expected:identity,sessionEpoch:'2',currentMarks:[],candidateMark:mark,limitPricePaise:5000,maxFeesPaise:1000,maxDailyLossPaise:100000,
   limits:{NIFTY:{netDelta:100,netGamma:1,netTheta:1000,netVega:1000,grossDelta:100,grossGamma:1,grossTheta:1000,grossVega:1000}}}};
}
test('joined candidate evidence checks exact owner, account, session, lot and tick without dispatch',()=>{
 const x=fixture(),r=assessCandidateEvidenceBundle(x,now+1);
 assert.equal(r.status,'READY_FOR_PREPARATION_REVIEW');assert.equal(r.reservationPaise,326000);assert.equal(r.orderAuthorized,false);
 for(const bad of [{...x,ownerId:'other'},{...x,binding:{...x.binding,accountId:'other'}},
  {...x,binding:{...x.binding,authEpoch:3}},{...x,binding:{...x.binding,verifiedAt:now-15001}},
  {...x,listing:{...x.listing,lotSize:50}},{...x,risk:{...x.risk,limitPricePaise:5001}},
  {...x,risk:{...x.risk,expected:{...identity,product:'I' as const}}}])
  assert.equal(assessCandidateEvidenceBundle(bad,now+1).status,'DENIED');
});
test('native exact listing rejects session change and wrong account before network',async()=>{
 const {UpstoxProvider}=await import('../engine/providers/UpstoxProvider.js');
 const provider=new UpstoxProvider();
 Object.assign(provider,{accessToken:'fixture-token',userId:identity.accountId,isConnected:true,historicalFoAuthEpoch:2});
 const old=globalThis.fetch;let calls=0,rotate=false;
 const future=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 try{
  globalThis.fetch=async(input,init)=>{
   calls++;assert.match(String(input),/option\/contract\?instrument_key=/);
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-token');
   if(rotate)Object.assign(provider,{historicalFoAuthEpoch:3});
   return new Response(JSON.stringify({status:'success',data:[{...contract,expiry:future}]}),{status:200});
  };
  assert.equal(await provider.getExactListedOptionEvidence({...request,identity:{...identity,accountId:'other'}}),null);
  assert.equal(calls,0);
  assert.ok(await provider.getExactListedOptionEvidence({...request,expiry:future}));
  rotate=true;
  assert.equal(await provider.getExactListedOptionEvidence({...request,expiry:future}),null);
  assert.equal(calls,2);
 }finally{globalThis.fetch=old;}
});
