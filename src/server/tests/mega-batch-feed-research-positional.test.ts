import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overfitDetector} from '../../quant/research/overfitDetector.js';
import {parameterStabilityEngine} from '../../quant/research/parameterStabilityEngine.js';
import {mapMarketFeedContractToQuantSnapshot,marketDataAdapter} from '../../quant/adapters/marketDataAdapter.js';
import {chooseAdaptiveExpiries,rankAdaptiveOptions} from '../engine/ema15m/adaptiveOptionRanker.js';
import {reviewPhase76NrmlPaperRisk,type Phase76PaperInput} from '../engine/ema15m/adaptivePhase76NrmlPaperRiskMonitor.js';
import type {OptionContract} from '../../types.js';

test('unobserved research never manufactures stability or an allocation pass',()=>{
 const overfit=overfitDetector.analyzeOverfitting('fixture');
 assert.equal(overfit.recommendation,'REJECT');
 assert.equal(overfit.evidenceStatus,'NO_PERTURBATION_EVIDENCE');
 assert.deepEqual(overfit.perturbedParameterPerformance,[]);
 const stability=parameterStabilityEngine.testParameterNeighborhood('fixture','ema',23,1,100000000);
 assert.equal(stability.isStable,false);assert.equal(stability.evidenceStatus,'NO_PERTURBATION_EVIDENCE');
 assert.deepEqual(stability.perturbations,[]);
});
test('live underlying cannot promote untimed or practice option observations into execution evidence',()=>{
 const q:OptionContract={strikePrice:25000,type:'CE',ltp:50,change:0,pChange:0,volume:0,openInterest:0,changeInOI:0,pChangeInOI:0,
  iv:15,delta:.5,gamma:.01,theta:-1,vega:2,rho:0,buildup:'NEUTRAL',bidPrice:49,askPrice:51,available:true,ltpAvailable:true,
  quoteSource:'PRACTICE',bookAvailable:true,greeksSource:'MODELED',oiAvailable:false};
 for(const source of ['PRACTICE','UPSTOX_CHAIN_UNTIMED','UNVERIFIED'] as const){
  const snapshot=mapMarketFeedContractToQuantSnapshot('NIFTY','2026-12-31',25000,{...q,quoteSource:source},true,new Date().toISOString());
  assert.equal(snapshot.dataQuality,'DATA_INSUFFICIENT');assert.notEqual(snapshot.source,'upstox_live');
  assert.ok(snapshot.missingFields?.includes('exchangeTimestamp'));assert.ok(snapshot.missingFields?.includes('oi'));
  const quality=marketDataAdapter.evaluateQuality([snapshot]);
  assert.equal(quality.status,'DATA_INSUFFICIENT');assert.equal(quality.checks.priceFreshness,false);
  assert.equal(quality.checks.greeksComputed,false);
 }
});
const underlyingKey='NSE_INDEX|Nifty 50',asOf=new Date('2026-11-25T05:00:00Z');
const listed={underlying_symbol:'NIFTY',underlying_key:underlyingKey,segment:'NSE_FO',instrument_type:'CE',
 strike_price:25000,expiry:'2026-12-02',instrument_key:'NSE_FO|123',trading_symbol:'FIXTURE',lot_size:65,tick_size:5};
const row={expiry:listed.expiry,underlying_key:underlyingKey,underlying_spot_price:25000,strike_price:25000,
 call_options:{instrument_key:listed.instrument_key,market_data:{bid_price:49,ask_price:51,bid_qty:65,ask_qty:65,volume:100,oi:1000},
 option_greeks:{delta:.6,theta:-1,iv:15}}};
test('multi-horizon contract research refuses impossible calendar dates, duplicate keys and shallow book',()=>{
 const select=(contracts:unknown,at=asOf)=>chooseAdaptiveExpiries(contracts,underlyingKey,'NIFTY','CE',at);
 assert.equal(select([listed])[0].expiry,listed.expiry);
 assert.equal(select([listed,listed])[0].expiry,null);
 assert.ok(select([{...listed,expiry:'2026-11-31'}]).every(b=>b.expiry===null));
 assert.ok(select([listed],new Date(NaN)).every(b=>b.expiry===null));
 const rank=(rows:unknown[])=>rankAdaptiveOptions({brokerContracts:[listed],chainByExpiry:{[listed.expiry]:rows},underlyingKey,instrument:'NIFTY',optionType:'CE',spot:25000,asOf});
 const good=rank([row]);assert.equal(good.options[0].status,'RANKED');assert.equal(good.executionAuthorized,false);
 assert.equal(rank([row,row]).options[0].status,'NO_LIQUID_CONTRACT');
 assert.equal(rank([{...row,call_options:{...row.call_options,market_data:{...row.call_options.market_data,bid_qty:64}}}]).options[0].status,'NO_LIQUID_CONTRACT');
 assert.equal(rank([{...row,call_options:{...row.call_options,option_greeks:{...row.call_options.option_greeks,theta:null}}}]).options[0].status,'NO_LIQUID_CONTRACT');
});
function paper():Phase76PaperInput{
 return {mode:'OFFLINE_NRML_PAPER_RISK_REVIEW_V1',evaluationAt:'2026-11-25T05:00:30Z',
 position:{source:'HYPOTHETICAL_LONG_OPTION_NOT_BROKER_POSITION',instrumentKey:'NSE_FO|123',horizon:'1W',optionType:'CE',
  enteredAt:'2026-11-25T04:59:00Z',assumedExchangeExpiryDateIST:'2026-12-02',lotSize:65,lots:2,
  assumedEntryAskPremiumPoints:50,assumedNonRecoverableFeesINR:40},
 policy:{source:'PREREGISTERED_PAPER_ALERT_POLICY_NOT_EXECUTABLE_STOP',armGainPremiumPoints:20,givebackAlertPremiumPoints:10,
  targetAlertPremiumPoints:100,minimumConfirmGapSeconds:5,minimumBidDepthLotsForIndicativeMark:1,maximumQuoteAgeSeconds:10,
  maximumPaidDebitPlusFeesINR:10000,maximumIndicativeLossINR:1000,expiryReviewCalendarDays:2},
 quotes:[{source:'MANUAL_OR_SYNTHETIC_PAPER_MARK_NOT_VERIFIED_L1',observedAt:'2026-11-25T05:00:15Z',receivedAt:'2026-11-25T05:00:15Z',bestBidPremiumPoints:80,displayedBestBidDepthLots:2},
 {source:'MANUAL_OR_SYNTHETIC_PAPER_MARK_NOT_VERIFIED_L1',observedAt:'2026-11-25T05:00:25Z',receivedAt:'2026-11-25T05:00:25Z',bestBidPremiumPoints:82,displayedBestBidDepthLots:2}]};
}
test('NRML paper monitor never confirms delayed marks or undersized depth as full-position trail',()=>{
 const input=paper();const good=reviewPhase76NrmlPaperRisk(input);
 assert.equal(good.confirmedPeakPremiumGainPoints,32);assert.equal(good.liveExecutionAuthorized,false);
 const shallow=paper();shallow.quotes[1].displayedBestBidDepthLots=1;
 const blocked=reviewPhase76NrmlPaperRisk(shallow);assert.equal(blocked.confirmedPeakPremiumGainPoints,null);
 assert.equal(blocked.latestIndicativeBidMarkINR,null);assert.ok(blocked.alerts.includes('BID_DEPTH_UNAVAILABLE_REVIEW'));
 const late=paper();late.quotes[0].observedAt='2026-11-25T04:59:10Z';
 assert.equal(reviewPhase76NrmlPaperRisk(late).confirmedPeakPremiumGainPoints,null);
 const invalid=paper();invalid.evaluationAt='2026-11-31T05:00:30Z';
 assert.equal(reviewPhase76NrmlPaperRisk(invalid).status,'INVALID_INPUT');
});
