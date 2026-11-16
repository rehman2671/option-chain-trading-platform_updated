import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAdaptiveL1MarketDataQuality,type AdaptiveMarketDataQualityPolicy
} from '../../server/engine/ema15m/adaptiveL1MarketDataQuality.js';
import { buildAdaptiveEntryFirstCohort } from
  '../../server/engine/ema15m/adaptiveEntryFirstCohort.js';
import type { HistoricalComparisonInput } from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type { DeclaredTradingSession } from
  '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import type { VendorExecutionL1 } from
  '../../server/engine/ema15m/adaptiveVendorIngestion.js';
import type { ClosedIndexCandle } from
  '../../server/engine/ema15m/adaptiveMarketRegime.js';

const DAY=86_400_000,MINUTE=60_000;
const iso=(n:number)=>new Date(n).toISOString();
const under='NSE_INDEX|Nifty 50';
const horizons=['1W','2W','4W','8W'] as const;
const offsets=[8,15,28,56];
const original=(input:HistoricalComparisonInput):VendorExecutionL1[]=>
  input.executionQuotes.map((q,i)=>({
    eventAt:iso(Date.parse(q.observedAt)-500),
    availableAt:q.observedAt,sourceRecordId:'TEST_ORIGINAL_EVENT_'+i,
    instrumentKey:q.instrumentKey,bid:q.bid,ask:q.ask,
    bidQty:q.bidQty,askQty:q.askQty
  }));
const policy=():AdaptiveMarketDataQualityPolicy=>({
  schemaVersion:'ADAPTIVE_MARKET_DATA_QUALITY_V1',
  minimumObservedEntriesPerArmHorizon:1,
  minimumL1QuotesPerDeclaredSession:10,
  maximumWithinSessionQuoteGapMinutes:20,
  maximumFixedDueExitQuoteDelayMinutes:10,
  maximumSourceEventToAvailabilitySeconds:10,
  maximumBidAskSpreadBps:300,
  maximumWideSpreadQuoteFraction:0.05,
  minimumBidDepthMultipleOfLot:1,
  minimumSufficientBidDepthQuoteFraction:0.90,
  overnightAdverseBidGapAlertPercent:25
});
function sample():{
  input:HistoricalComparisonInput;
  sessions:DeclaredTradingSession[];
  testKey:string;testDay:number
}{
  const all:ClosedIndexCandle[]=[];
  const decisions:HistoricalComparisonInput['decisions']=[];
  const quotes:HistoricalComparisonInput['executionQuotes']=[];
  const declared:DeclaredTradingSession[]=[];
  let last=25000;
  const origin=Date.UTC(2026,8,1);
  for(let d=0;d<18;d++){
    const start=origin+d*DAY;
    declared.push({
      sessionDate:iso(start).slice(0,10),
      openAt:iso(start+225*MINUTE),closeAt:iso(start+600*MINUTE),
      sourceRecordId:'TEST_SESSION_CALENDAR_'+d
    });
  }
  for(let d=0;d<12;d++){
    const start=origin+d*DAY;
    for(let slot=0;slot<25;slot++){
      const c=last+6;
      all.push({
        timestamp:iso(start+(225+15*slot)*MINUTE),
        open:last,high:c+4,low:last-4,close:c,isClosed:true
      });
      last=c;
    }
    if(d<7)continue;
    const decisionAt=iso(start+390*MINUTE);
    const bars=all.filter(q=>
      Date.parse(q.timestamp)+15*MINUTE<=Date.parse(decisionAt));
    const spot=bars[bars.length-1].close;
    const strike=Math.round(spot/50)*50;
    const contracts=offsets.map((gap,i)=>({
      underlying_symbol:'NIFTY',underlying_key:under,
      segment:'NSE_FO',instrument_type:'CE' as const,
      strike_price:strike,expiry:iso(start+gap*DAY).slice(0,10),
      instrument_key:'NSE_FO|'+(100000+d*4+i),
      trading_symbol:'SYNTHETIC_L1_'+d+'_'+i,
      lot_size:65,tick_size:.05
    }));
    const chains=contracts.map(c=>({
      capturedAt:iso(start+389*MINUTE),expiry:c.expiry,
      rows:[{
        expiry:c.expiry,underlying_key:under,
        underlying_spot_price:spot,strike_price:c.strike_price,
        call_options:{
          instrument_key:c.instrument_key,
          market_data:{
            bid_price:99,ask_price:100,bid_qty:130,ask_qty:130,
            volume:50000,oi:100000
          },
          option_greeks:{delta:.6,theta:-1,iv:19}
        }
      }]
    }));
    const entryTime=start+391*MINUTE;
    for(const c of contracts){
      for(let dOffset=0;dOffset<=2;dOffset++){
        const dayStart=start+dOffset*DAY;
        const beginning=dOffset===0?entryTime:dayStart+225*MINUTE;
        const ending=dOffset===2?dayStart+390*MINUTE:
          dayStart+600*MINUTE;
        for(let when=beginning;when<=ending;when+=15*MINUTE){
          quotes.push({
            instrumentKey:c.instrument_key,observedAt:iso(when),
            bid:99,ask:100,bidQty:130,askQty:130
          });
        }
      }
    }
    decisions.push({
      sessionDate:iso(start).slice(0,10),decisionAt,
      candles:bars,contractsCapturedAt:iso(start+388*MINUTE),
      listedContracts:contracts,chains
    });
  }
  const expectedSessions=decisions.map(x=>x.sessionDate);
  return {
    input:{
      provenance:{
        datasetId:'SYNTHETIC_QUALITY_TEST_ONLY',source:'SYNTHETIC',
        calendarSource:'SYNTHETIC_TEST_WINDOWS',expectedSessions,
        synthetic:true,quoteTimestampQuality:'SOURCE_ATTESTED_EVENT_TIME'
      },
      instrument:'NIFTY',underlyingKey:under,
      decisions,executionQuotes:quotes,
      policy:{
        holdCalendarDays:{'1W':1,'2W':1,'4W':1,'8W':1},
        slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
        maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
        maxExitDelayDays:1,minCalendarDaysBeforeExpiry:2,
        folds:[{
          trainStart:expectedSessions[0],trainEnd:expectedSessions[0],
          testStart:expectedSessions[4],testEnd:expectedSessions[4]
        }]
      }
    },
    sessions:declared,testKey:contractsKey(11,0),testDay:origin+11*DAY
  };
}
const contractsKey=(day:number,index:number)=>'NSE_FO|'+(100000+day*4+index);
const select=(r:ReturnType<typeof auditAdaptiveL1MarketDataQuality>)=>
  r.paths.find(p=>p.arm==='EMA_BASELINE'&&p.horizon==='1W');
function run(f:ReturnType<typeof sample>,p=policy(),feed?:VendorExecutionL1[]){
  return auditAdaptiveL1MarketDataQuality(f.input,f.sessions,feed??original(f.input),p);
}

describe('Phase 10 predeclared OOS market-data quality and liquidity',()=>{
  it('audits all four expiry horizons without suggesting broker execution',()=>{
    const f=sample();
    const c=buildAdaptiveEntryFirstCohort(f.input);
    assert.equal(c.status,'ENTRY_COHORT_RECORDED');
    assert.equal(c.counts.attempts,12);
    const r=run(f);
    assert.equal(r.errors.length,0);
    assert.equal(r.totalOutOfSampleDecisions,1);
    assert.equal(r.cells.length,12);
    assert.ok(r.paths.length>0);
    assert.equal(select(r)!.disposition,'SUFFICIENT_SOURCE_ATTESTED_OBSERVATIONS');
    for(const h of horizons){
      assert.ok(r.paths.some(p=>p.arm==='EMA_BASELINE'&&p.horizon===h));
    }
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.empiricalProfitabilityProven,false);
    assert.equal(r.sourceAuthenticityIndependentlyVerified,false);
    assert.equal(r.exchangeCalendarIndependentlyVerified,false);
    assert.equal(r.originalAvailabilityClocksIndependentlyVerified,false);
    assert.equal(r.cells.every(c=>c.productionEligible===false),true);
  });
  it('keeps entry cohort unchanged when future fixed due quotes disappear',()=>{
    const f=sample();
    const old=buildAdaptiveEntryFirstCohort(f.input);
    const due=f.testDay+DAY+390*MINUTE;
    f.input.executionQuotes=f.input.executionQuotes.filter(q=>
      q.instrumentKey!==f.testKey||Date.parse(q.observedAt)<due);
    const now=buildAdaptiveEntryFirstCohort(f.input);
    assert.deepEqual(now.attempts,old.attempts);
    const r=run(f);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.ok(select(r)!.reasons.includes('NO_L1_AT_FIXED_HOLD_DUE'));
    const cell=r.cells.find(c=>c.arm==='EMA_BASELINE'&&c.horizon==='1W')!;
    assert.equal(cell.observedEntryCount,1);
    assert.equal(cell.qualityPassCount,0);
    assert.equal(cell.productionEligible,false);
  });
  it('does not cherry-pick a later deep bid when first due quote has thin depth',()=>{
    const f=sample();
    const due=f.testDay+DAY+390*MINUTE;
    const at=f.input.executionQuotes.find(q=>
      q.instrumentKey===f.testKey&&Date.parse(q.observedAt)===due)!;
    assert.ok(at);
    at.bidQty=1;
    const r=run(f);
    assert.ok(select(r)!.reasons.includes('FIRST_DUE_EXIT_BID_DEPTH_INSUFFICIENT'));
    assert.equal(select(r)!.disposition,'MISSING_OR_UNRELIABLE_L1_PATH');
  });
  it('detects missing intraday historical observations even with entry and due bids',()=>{
    const f=sample();
    const min=f.testDay+DAY+270*MINUTE;
    const max=f.testDay+DAY+345*MINUTE;
    f.input.executionQuotes=f.input.executionQuotes.filter(q=>
      q.instrumentKey!==f.testKey||
      Date.parse(q.observedAt)<=min||Date.parse(q.observedAt)>=max);
    const r=run(f);
    assert.ok(select(r)!.reasons.includes('INTRASESSION_L1_OBSERVATION_GAP_TOO_WIDE'));
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
  });
  it('flags original source event -> availability lag beyond predeclared limit',()=>{
    const f=sample();
    const raw=original(f.input);
    for(const o of raw)if(o.instrumentKey===f.testKey)
      o.eventAt=iso(Date.parse(o.availableAt)-30_000);
    const r=run(f,policy(),raw);
    assert.ok(select(r)!.reasons.includes('ORIGINAL_EVENT_AVAILABILITY_LAG_TOO_LARGE'));
  });
  it('flags excessive bid/ask spreads as liquidity risk and preserves OOS denominator',()=>{
    const f=sample();
    for(const q of f.input.executionQuotes){
      if(q.instrumentKey===f.testKey &&
         Date.parse(q.observedAt)>f.testDay+391*MINUTE)
        q.ask=Number((q.bid*1.20).toFixed(2));
    }
    const r=run(f);
    assert.ok(select(r)!.reasons.includes('EXCESS_WIDE_BID_ASK_SPREAD_OBSERVATIONS'));
    assert.equal(r.observedEntryCount,
      buildAdaptiveEntryFirstCohort(f.input).counts.qualifyingEntryCount);
  });
  it('preserves real-looking adverse overnight price gaps as explicit risk flags',()=>{
    const f=sample();
    const nextOpen=f.testDay+DAY+225*MINUTE;
    for(const q of f.input.executionQuotes){
      if(q.instrumentKey===f.testKey&&
         Date.parse(q.observedAt)>=nextOpen){
        q.bid=50;q.ask=51;
      }
    }
    const r=run(f);
    assert.equal(select(r)!.disposition,'SUFFICIENT_SOURCE_ATTESTED_OBSERVATIONS');
    assert.ok(select(r)!.adverseOvernightGapAlertCount>=1);
    assert.ok(select(r)!.largestAdverseOvernightBidGapPercent!>25);
    assert.equal(r.executionAuthorized,false);
  });
  it('rejects removed session declaration, invalid policy and forged source L1',()=>{
    const f=sample();
    const withoutNext=f.sessions.filter(s=>
      s.sessionDate!==iso(f.testDay+DAY).slice(0,10));
    const absent=auditAdaptiveL1MarketDataQuality(
      f.input,withoutNext,original(f.input),policy());
    assert.ok(select(absent)!.reasons.includes('OPTION_L1_OUTSIDE_DECLARED_SESSIONS'));
    const bad=policy();bad.minimumL1QuotesPerDeclaredSession=0;
    assert.equal(run(f,bad).status,'REJECTED');
    const forged=original(f.input);forged[0].ask=forged[0].ask+5;
    assert.deepEqual(run(f,policy(),forged).errors,['SOURCE_EVENT_AND_REPLAY_QUOTE_MISMATCH']);
    const reused=original(f.input);
    reused[1].sourceRecordId=reused[0].sourceRecordId;
    assert.deepEqual(run(f,policy(),reused).errors,
      ['INVALID_DUPLICATE_OR_UNCLOCKED_SOURCE_L1']);
  });
  it('enforces source event clocks on non-synthetic datasets, not receipt-only substitutes',()=>{
    const f=sample();
    f.input.provenance.synthetic=false;
    f.input.provenance.quoteTimestampQuality='RECEIPT_ONLY_UNVERIFIED';
    const r=run(f);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('REAL_ORIGINAL_L1_CLOCK_QUALITY_UNVERIFIED'));
  });
});
