import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessBrokerCapitalReleaseReview,type ReleaseReviewInput} from '../release/brokerCapitalReleaseReview.js';
import type {OrderIntentEvidence} from '../release/brokerOrderReconciliationEvidence.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const intent:OrderIntentEvidence={orderId:'order-a',instrumentKey:'NSE_FO|1234',product:'D',side:'BUY',quantity:65,tag:'intent-a'};
const detail={order_id:intent.orderId,instrument_token:intent.instrumentKey,product:intent.product,transaction_type:intent.side,quantity:intent.quantity,
 tag:intent.tag,status:'REJECTED',filled_quantity:0,pending_quantity:0,average_price:0};
const fixture:ReleaseReviewInput={accountId:'a',authEpoch:2,intent,startedAt:now,receivedAt:now+1,detail,trades:[],positions:[],orders:[detail],gtt:[]};
const review=(x:ReleaseReviewInput)=>assessBrokerCapitalReleaseReview(x,'a',2,now+1);
test('zero fill and reported empty exposure only support manual review, never release',()=>{
 const r=review(fixture);
 assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.capitalReleaseAuthorized,false);
 assert.equal(r.retryAuthorized,false);assert.equal(r.accountFlatCertified,false);
 for(const x of [{...fixture,orders:null},{...fixture,orders:[]},{...fixture,positions:null},{...fixture,gtt:null},
  {...fixture,orders:[detail,detail]},{...fixture,orders:[{...detail,tag:'wrong'}]},{...fixture,orders:[{...detail,status:'COMPLETE'}]},
  {...fixture,authEpoch:3},{...fixture,accountId:'other'},{...fixture,startedAt:now-15001}])
  assert.equal(review(x).status,'UNKNOWN');
});
test('unrelated account exposure, open orders, or GTTs block conservative review',()=>{
 const position={instrument_token:'NSE_FO|999',product:'I',quantity:-25};
 const open={...detail,order_id:'other',status:'OPEN',pending_quantity:65};
 const gtt={gtt_order_id:'GTT-fixture-a',instrument_token:'NSE_FO|999',product:'D',type:'SINGLE',quantity:65,
  rules:[{strategy:'ENTRY',transaction_type:'BUY',status:'ACTIVE'}]};
 for(const x of [{...fixture,positions:[position]},{...fixture,orders:[detail,open]},{...fixture,gtt:[gtt]}]){
  const r=review(x);assert.equal(r.status,'BLOCKED');assert.equal(r.capitalReleaseAuthorized,false);
 }
});
test('provider cross-endpoint session fence rejects credential generation change',async()=>{
 const {UpstoxProvider}=await import('../engine/providers/UpstoxProvider.js');
 const provider=new UpstoxProvider();
 Object.assign(provider,{accessToken:'fixture-token',userId:'a',isConnected:true,historicalFoAuthEpoch:2});
 provider.getOrderDetails=async()=>detail;
 provider.getOrderTrades=async()=>[];
 provider.getVerifiedNrmlPositionRows=async()=>[];
 provider.getOrderBook=async()=>[detail];
 provider.getGttOrders=async()=>[];
 assert.equal((await provider.getBrokerCapitalReleaseReview('a',2,intent)).status,'REVIEW_REQUIRED');
 assert.equal((await provider.getBrokerCapitalReleaseReview('other',2,intent)).status,'UNKNOWN');
 provider.getGttOrders=async()=>{Object.assign(provider,{historicalFoAuthEpoch:3});return [];};
 assert.equal((await provider.getBrokerCapitalReleaseReview('a',2,intent)).status,'UNKNOWN');
});
