import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseQuantCandidates,readQuantCandidateEvidence} from '../data/quantCandidateEvidence.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const input={underlying:'NIFTY',strikes:'24000 CE / 24050 CE',expiry:'2026-11-24',lots:2};
const master=(strike:number,id:string,lot=65)=>({underlying_key:'NSE_INDEX|Nifty 50',underlying_symbol:'NIFTY',segment:'NSE_FO',instrument_type:'CE',expiry:input.expiry,strike_price:strike,instrument_key:'NSE_FO|'+id,lot_size:lot});
const rows=[master(24000,'12345'),master(24050,'12346')];
const quote=(key:string)=>({instrumentKey:key,source:'UPSTOX_FULL_MARKET_QUOTE_V3_LTP',bookSource:'UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5',price:101,bestBidPrice:100,bestAskPrice:102,bestBidQuantity:200,bestAskQuantity:130,exchangeTimestamp:new Date(now-1000).toISOString(),snapshotTimestamp:new Date(now-500).toISOString()});
const provider=(contracts:unknown=rows,read:(key:string)=>unknown=quote,mode='LIVE')=>({
  getProviderMode:()=>mode,getOptionContracts:async()=>contracts,getLiveOptionQuote:async(key:string)=>read(key)
});
test('candidate parser rejects fabricated, ambiguous and repeated display legs',()=>{
  assert.deepEqual(parseQuantCandidates(input.strikes),[{strike:24000,optionType:'CE'},{strike:24050,optionType:'CE'}]);
  for(const value of [null,'BUY 24000 CE','24000 CE / 24000 CE','24000','24000 CE /','-10 PE','0 CE'])assert.equal(parseQuantCandidates(value),null);
});
test('exact listed lot and option premium are used, without granting order authority',async()=>{
  const result=await readQuantCandidateEvidence(input,provider(),()=>now);
  assert.equal(result.status,'VERIFIED_READ_ONLY');
  assert.equal(result.orderAuthorized,false);
  assert.equal(result.candidates.length,2);
  assert.equal(result.candidates[0].quantity,130);
  assert.equal(result.candidates[0].lotSize,65);
  assert.equal(result.candidates[0].lastPrice,101);
  assert.equal(result.candidates[0].instrumentKey,'NSE_FO|12345');
});
test('expiry, contract ambiguity and wrong numeric key are rejected without nearest-date fallback',async()=>{
  for(const bad of [[...rows,rows[0]],[{...rows[0],expiry:'2026-12-01'},rows[1]],[{...rows[0],instrument_key:'NSE_FO|symbol'},rows[1]],[{...rows[0],lot_size:0},rows[1]],[rows[0],{...rows[1],instrument_key:rows[0].instrument_key}]]){
    const result=await readQuantCandidateEvidence(input,provider(bad),()=>now);
    assert.equal(result.status,'UNAVAILABLE');
    assert.deepEqual(result.candidates,[]);
  }
  for(const change of [{expiry:'2026-11-23'},{expiry:'2026-11-31'},{underlying:'UNKNOWN'},{lots:1.5}])assert.equal((await readQuantCandidateEvidence({...input,...change},provider(),()=>now)).status,'UNAVAILABLE');
});
test('practice, missing, stale, future, crossed and misidentified quotes cannot produce evidence',async()=>{
  assert.equal((await readQuantCandidateEvidence(input,provider(rows,quote,'PRACTICE'),()=>now)).status,'UNAVAILABLE');
  for(const patch of [{instrumentKey:'NSE_FO|999'},{source:'PRACTICE'},{price:0},{bestBidPrice:103},{bestAskQuantity:0},{snapshotTimestamp:new Date(now-10001).toISOString()},{exchangeTimestamp:new Date(now-30001).toISOString()},{snapshotTimestamp:new Date(now+1).toISOString()}]){
    const r=await readQuantCandidateEvidence(input,provider(rows,k=>({...quote(k),...patch})),()=>now);
    assert.equal(r.status,'UNAVAILABLE');
    assert.equal(r.orderAuthorized,false);
  }
  assert.equal((await readQuantCandidateEvidence(input,provider(rows,()=>null),()=>now)).status,'UNAVAILABLE');
});
test('one missing leg invalidates whole evidence set; expired window cannot pass',async()=>{
  const result=await readQuantCandidateEvidence(input,provider(rows,k=>k.endsWith('12346')?null:quote(k)),()=>now);
  assert.deepEqual(result.candidates,[]);
  let calls=0;
  assert.equal((await readQuantCandidateEvidence(input,provider(),()=>calls++===0?now:now+20001)).reason,'EVIDENCE_WINDOW_EXPIRED');
});
