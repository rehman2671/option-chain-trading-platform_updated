import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import { buildAdaptiveEntryFirstCohort } from
  '../../server/engine/ema15m/adaptiveEntryFirstCohort.js';
import { runAdaptiveEntryFirstExitStudy } from
  '../../server/engine/ema15m/adaptiveEntryFirstExitStudy.js';
import { compareAdaptiveHistorical, type HistoricalComparisonInput } from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type { DeclaredTradingSession } from
  '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import type { AdaptiveExitReplayPolicy } from
  '../../server/engine/ema15m/adaptivePositionalExitReplay.js';
import type { ClosedIndexCandle } from
  '../../server/engine/ema15m/adaptiveMarketRegime.js';
const DAY=86_400_000,MIN=60_000;
const iso=(n:number)=>new Date(n).toISOString();
const underlying='NSE_INDEX|Nifty 50';
const offsets=[8,15,28,56];
const horizon=['1W','2W','4W','8W'] as const;
const stopPolicy=():AdaptiveExitReplayPolicy=>({
  schemaVersion:'ADAPTIVE_OPTION_EXIT_REPLAY_V1',
  horizonRules:{
    '1W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2},
    '2W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2},
    '4W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2},
    '8W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2}
  },
  minQuotesPerDeclaredSession:2,minIntermediateQuotes:2,
  maxSameSessionQuoteGapMinutes:15,maxTriggerToNextQuoteMinutes:6
});
type Path='GIVEBACK'|'GAP'|'FLAT';
function sample(path:Path='GIVEBACK'):{
  input:HistoricalComparisonInput;sessions:DeclaredTradingSession[];testDate:string
}{
  const candles:ClosedIndexCandle[]=[];
  const decisions:HistoricalComparisonInput['decisions']=[];
  const quotes:HistoricalComparisonInput['executionQuotes']=[];
  const sessions:DeclaredTradingSession[]=[];
  let prev=25000;
  for(let day=0;day<=12;day++){
    const start=Date.UTC(2026,8,1+day);
    const sessionDate=iso(start).slice(0,10);
    sessions.push({
      sessionDate,openAt:iso(start+225*MIN),
      closeAt:iso(start+600*MIN),sourceRecordId:'SYNTHETIC_CAL_'+day
    });
    if(day===12)continue;
    for(let i=0;i<25;i++){
      const t=iso(start+(225+15*i)*MIN),close=prev+6;
      candles.push({
        timestamp:t,open:prev,high:close+4,low:prev-4,
        close,isClosed:true
      });prev=close;
    }
    if(day<7)continue;
    const decision=iso(start+390*MIN);
    const seen=candles.filter(c=>Date.parse(c.timestamp)+15*MIN<=Date.parse(decision));
    const spot=seen[seen.length-1].close;
    const strike=Math.round(spot/50)*50;
    const contracts=offsets.flatMap((offset,i)=>(['CE','PE'] as const).map((side,j)=>{
      const expiry=iso(start+offset*DAY).slice(0,10);
      return{
        underlying_symbol:'NIFTY',underlying_key:underlying,segment:'NSE_FO',
        instrument_type:side,strike_price:strike,expiry,
        instrument_key:'NSE_FO|'+(100000+day*8+i*2+j),
        trading_symbol:'SYNTHETIC_'+day+'_'+i+'_'+side,lot_size:65,tick_size:.05
      };
    }));
    const chains=offsets.map((offset,i)=>{
      const expiry=iso(start+offset*DAY).slice(0,10);
      const side=(j:number,delta:number)=>({
        instrument_key:contracts[i*2+j].instrument_key,
        market_data:{bid_price:99,ask_price:100,bid_qty:1000,ask_qty:1000,
          volume:50000,oi:400000},
        option_greeks:{delta,theta:-1,iv:18,gamma:.01,vega:3}
      });
      return {
        expiry,capturedAt:iso(start+388*MIN),
        rows:[{
          underlying_key:underlying,underlying_spot_price:spot,
          expiry,strike_price:strike,call_options:side(0,.6),put_options:side(1,-.6)
        }]
      };
    });
    for(const c of contracts){
      const enter=Date.parse(decision)+MIN;
      // All independent per-instrument original-availability-time L1.
      for(let minutes=0;enter+minutes*MIN<=start+600*MIN;minutes+=5){
        const price=day===11 && path==='GIVEBACK'
          ? minutes>=20?113:minutes>=15?116:minutes>=10?130:minutes>=5?110:99
          :day===11 && path==='GAP'
            ?minutes>=10?125:minutes>=5?130:99:103;
        const bid=minutes===0?99:price;
        quotes.push({observedAt:iso(enter+minutes*MIN),instrumentKey:c.instrument_key,
          bid,ask:minutes===0?100:bid+1,bidQty:1000,askQty:1000});
      }
      // The following exchange session carries the due exit or gap trigger.
      const nextStart=start+DAY;
      for(let minutes=0;minutes<=375;minutes+=5){
        let bid=106;
        if(day===11 && path==='GAP')bid=minutes===0?70:71;
        quotes.push({observedAt:iso(nextStart+(225+minutes)*MIN),
          instrumentKey:c.instrument_key,bid,ask:bid+1,bidQty:1000,askQty:1000});
      }
    }
    decisions.push({
      sessionDate,decisionAt:decision,candles:seen,
      contractsCapturedAt:iso(start+385*MIN),listedContracts:contracts,chains
    });
  }
  const dates=decisions.map(d=>d.sessionDate);
  return{
    input:{
      provenance:{
        datasetId:'SYNTHETIC_ENTRY_FIRST_FIXTURE',source:'OFFLINE_GENERATOR',
        calendarSource:'OFFLINE_SESSION_FIXTURE',expectedSessions:dates,synthetic:true
      },
      underlyingKey:underlying,instrument:'NIFTY',decisions,executionQuotes:quotes,
      policy:{
        holdCalendarDays:{'1W':1,'2W':1,'4W':1,'8W':1},
        slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
        maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
        maxExitDelayDays:1,minCalendarDaysBeforeExpiry:2,
        folds:[{
          trainStart:dates[0],trainEnd:dates[0],
          testStart:dates[4],testEnd:dates[4]
        }]
      }
    },sessions,testDate:dates[4]
  };
}
const pick=(study:ReturnType<typeof runAdaptiveEntryFirstExitStudy>)=>
  study.outcomes.find(x=>x.arm==='EMA_BASELINE'&&x.horizon==='1W');

describe('Phase 8 entry-first OOS positional exit research',()=>{
  it('enrolls the SAME entry cohort when a future fixed-hold exit vanishes',()=>{
    const {input,sessions,testDate}=sample('FLAT');
    const original=buildAdaptiveEntryFirstCohort(input);
    assert.equal(original.status,'ENTRY_COHORT_RECORDED');
    assert.equal(original.counts.testDecisions,1);
    assert.equal(original.counts.attempts,12);
    assert.ok(original.counts.qualifyingEntryCount>0);
    const future=Date.parse(testDate+'T00:00:00Z')+DAY;
    const tampered={
      ...input,
      executionQuotes:input.executionQuotes.filter(q=>{
        // Only remove AFTER entry; retain originals for all other sessions.
        const n=Number(q.instrumentKey.split('|')[1]);
        const belongsToTestDay=n>=100000+11*8&&n<100000+12*8;
        return !belongsToTestDay||Date.parse(q.observedAt)<future;
      })
    };
    const oldBaseline=compareAdaptiveHistorical(tampered);
    assert.equal(oldBaseline.status,'INCOMPLETE_EVIDENCE');
    const cohort=buildAdaptiveEntryFirstCohort(tampered);
    assert.equal(cohort.status,'ENTRY_COHORT_RECORDED');
    assert.deepEqual(cohort.attempts,original.attempts);
    const study=runAdaptiveEntryFirstExitStudy(tampered,stopPolicy(),sessions);
    assert.equal(study.status,'INCOMPLETE_EVIDENCE');
    const cell=study.cells.find(c=>c.arm==='EMA_BASELINE'&&c.horizon==='1W')!;
    assert.ok(cell.entryObservedCount>0);
    assert.equal(cell.completeCohortNetPnlINR,null);
    assert.ok(cell.pathIncompleteCount>0);
  });
  it('prices favorable rise then observed premium giveback at the NEXT L1 bid',()=>{
    const {input,sessions}=sample('GIVEBACK');
    const result=runAdaptiveEntryFirstExitStudy(input,stopPolicy(),sessions);
    const outcome=pick(result)!;
    assert.equal(outcome.status,'PRICED_EXIT');
    assert.equal(outcome.reason,'TRAILING_GIVEBACK');
    assert.equal(outcome.breachedLevel,117);
    assert.equal(outcome.hypotheticalExitBid,113);
    assert.equal(outcome.hypotheticalNetPnlINR,(113-100)*65);
    assert.ok(Date.parse(outcome.nextQuoteAt!)>Date.parse(outcome.triggerObservedAt!));
    assert.equal(result.productionSafe,false);
    assert.equal(result.executionAuthorized,false);
    assert.equal(result.profitabilityProven,false);
    assert.equal(result.brokerStopProtectionInstalled,false);
  });
  it('overnight gap below trailing floor prices at a worse next quote, not stop level',()=>{
    const {input,sessions}=sample('GAP');
    const result=runAdaptiveEntryFirstExitStudy(input,stopPolicy(),sessions);
    const outcome=pick(result)!;
    assert.equal(outcome.status,'PRICED_EXIT');
    assert.equal(outcome.reason,'TRAILING_GIVEBACK');
    assert.equal(outcome.overnightGapAtTrigger,true);
    assert.equal(outcome.breachedLevel,117);
    assert.equal(outcome.hypotheticalExitBid,71);
    assert.equal(outcome.hypotheticalNetPnlINR,(71-100)*65);
  });
  it('missing next bid after a valid trigger stays unpriced, never zero-PnL',()=>{
    const {input,sessions,testDate}=sample('GIVEBACK');
    const from=Date.parse(testDate+'T00:00:00Z')+391*MIN;
    const after=from+20*MIN;
    const chosen=100000+11*8; // CE contract in first expiry, test day only
    input.executionQuotes=input.executionQuotes.filter(q=>{
      if(q.instrumentKey!=='NSE_FO|'+chosen)return true;
      return Date.parse(q.observedAt)<after;
    });
    const r=runAdaptiveEntryFirstExitStudy(input,stopPolicy(),sessions);
    const x=pick(r)!;
    assert.equal(x.status,'EXIT_UNPRICED');
    assert.equal(x.hypotheticalNetPnlINR,null);
    const c=r.cells.find(c=>c.arm==='EMA_BASELINE'&&c.horizon==='1W')!;
    assert.equal(c.completeCohortNetPnlINR,null);
    assert.equal(c.unpricedExitCount,1);
    assert.equal(c.descriptiveComparisonEligible,false);
  });
  it('rejects missing declared exchange windows and does not claim market evidence',()=>{
    const {input}=sample();
    const result=runAdaptiveEntryFirstExitStudy(input,stopPolicy(),undefined);
    assert.equal(result.status,'REJECTED');
    assert.ok(result.errors.includes('ORIGINAL_EXCHANGE_SESSION_CALENDAR_REQUIRED'));
  });
  it('retains missing entry in denominator even with a future quote',()=>{
    const {input}=sample('FLAT');
    const testKey='NSE_FO|'+(100000+11*8);
    const lastDecision=Date.parse(input.decisions[input.decisions.length-1].decisionAt);
    input.executionQuotes=input.executionQuotes.filter(q=>
      q.instrumentKey!==testKey||
      Date.parse(q.observedAt)>lastDecision+input.policy.maxEntryDelayMinutes*MIN);
    const report=buildAdaptiveEntryFirstCohort(input);
    assert.equal(report.status,'ENTRY_COHORT_RECORDED');
    const entry=report.attempts.find(a=>a.arm==='EMA_BASELINE'&&a.horizon==='1W')!;
    assert.equal(entry.disposition,'MISSING_EXECUTABLE_ENTRY_L1');
    assert.equal(report.counts.attempts,12);
    assert.ok(report.counts.missingEntryCount>0);
  });
});
