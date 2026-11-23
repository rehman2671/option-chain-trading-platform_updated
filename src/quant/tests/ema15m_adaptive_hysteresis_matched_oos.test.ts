import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  compareAdaptiveHysteresisMatchedOos,type HysteresisMatchedOosPolicy
} from '../../server/engine/ema15m/adaptiveHysteresisMatchedOos.js';
import {buildAdaptiveEntryFirstCohort,adaptiveCohortAdvisoryKey} from
  '../../server/engine/ema15m/adaptiveEntryFirstCohort.js';
import {runAdaptiveEntryFirstExitStudy} from
  '../../server/engine/ema15m/adaptiveEntryFirstExitStudy.js';
import {replayAdaptiveRegimeHysteresis,type HysteresisResearchPolicy} from
  '../../server/engine/ema15m/adaptiveRegimeHysteresis.js';
import type {HistoricalComparisonInput} from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type {DeclaredTradingSession} from
  '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import type {AdaptiveExitReplayPolicy} from
  '../../server/engine/ema15m/adaptivePositionalExitReplay.js';
import type {ClosedIndexCandle} from
  '../../server/engine/ema15m/adaptiveMarketRegime.js';

const DAY=86_400_000,MIN=60_000,origin=Date.UTC(2026,8,1);
const iso=(t:number)=>new Date(t).toISOString();
const underlying='NSE_INDEX|Nifty 50';
const horizons=['1W','2W','4W','8W'] as const;
const offsets=[8,15,28,56];
const rule=(initial=2)=>({
  initialConfirmations:initial,oppositeConfirmations:3,
  minimumDwellObservedDecisions:3,
  freezeObservedDecisionsAfterShock:1,
  cooldownObservedDecisionsAfterReversal:1
});
const hysteresisPolicy=(initial=2):HysteresisResearchPolicy=>({
  schemaVersion:'ADAPTIVE_REGIME_HYSTERESIS_V1',
  maximumClosedCandleAgeMinutes:30,
  horizonRules:{
    '1W':rule(initial),'2W':rule(initial),
    '4W':rule(initial),'8W':rule(initial)
  }
});
const exitPolicy=():AdaptiveExitReplayPolicy=>({
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
const comparePolicy=(n=1):HysteresisMatchedOosPolicy=>({
  schemaVersion:'ADAPTIVE_HYSTERESIS_MATCHED_OOS_V1',
  minimumJointlyPricedPairsPerCell:n,
  maximumUnpricedExitFractionPerCell:0,
  maximumMissingEntryFractionPerCell:0
});
function sample():{input:HistoricalComparisonInput;sessions:DeclaredTradingSession[];key:string}{
  const all:ClosedIndexCandle[]=[];
  const decisions:HistoricalComparisonInput['decisions']=[];
  const quotes:HistoricalComparisonInput['executionQuotes']=[];
  const sessions:DeclaredTradingSession[]=[];
  let prev=25000;
  for(let day=0;day<17;day++){
    const start=origin+day*DAY;
    sessions.push({
      sessionDate:iso(start).slice(0,10),
      openAt:iso(start+225*MIN),closeAt:iso(start+600*MIN),
      sourceRecordId:'SYNTHETIC_EXCHANGE_SESSION_'+day
    });
    if(day>=16)continue;
    for(let i=0;i<25;i++){
      const close=prev+7;
      all.push({
        timestamp:iso(start+(225+15*i)*MIN),
        open:prev,high:close+4,low:prev-4,
        close,isClosed:true
      });
      prev=close;
    }
    if(day<7)continue;
    const decisionAt=iso(start+390*MIN);
    const candles=all.filter(c=>
      Date.parse(c.timestamp)+15*MIN<=Date.parse(decisionAt));
    const spot=candles[candles.length-1].close;
    const strike=Math.round(spot/50)*50;
    const contracts=offsets.map((distance,i)=>({
      underlying_symbol:'NIFTY',underlying_key:underlying,
      segment:'NSE_FO',instrument_type:'CE' as const,
      strike_price:strike,expiry:iso(start+distance*DAY).slice(0,10),
      instrument_key:'NSE_FO|'+(100000+day*4+i),
      trading_symbol:'SYNTHETIC_'+day+'_'+i,
      lot_size:65,tick_size:.05
    }));
    const chains=contracts.map(c=>({
      expiry:c.expiry,capturedAt:iso(start+388*MIN),
      rows:[{
        underlying_key:underlying,expiry:c.expiry,
        strike_price:strike,underlying_spot_price:spot,
        call_options:{
          instrument_key:c.instrument_key,
          market_data:{
            bid_price:99,ask_price:100,bid_qty:1000,ask_qty:1000,
            volume:50000,oi:400000
          },
          option_greeks:{delta:.6,theta:-1,iv:18}
        }
      }]
    }));
    const enter=start+391*MIN;
    for(const c of contracts){
      // Sample current decision's entry and entire current session.
      for(let dt=0;enter+dt*MIN<=start+600*MIN;dt+=5)
        quotes.push({
          observedAt:iso(enter+dt*MIN),instrumentKey:c.instrument_key,
          bid:99,ask:100,bidQty:1000,askQty:1000
        });
      // Overnight risk: one synthetic test day opens below a 20% stop;
      // the next bid, never the stop trigger, is the paper exit price.
      const openingBid=day===11?70:106;
      for(let dt=0;dt<=375;dt+=5){
        const bid=day===11?(dt===0?70:71):openingBid;
        quotes.push({
          observedAt:iso(start+DAY+(225+dt)*MIN),
          instrumentKey:c.instrument_key,bid,ask:bid+1,
          bidQty:1000,askQty:1000
        });
      }
    }
    decisions.push({
      sessionDate:iso(start).slice(0,10),decisionAt,candles,
      contractsCapturedAt:iso(start+385*MIN),
      listedContracts:contracts,chains
    });
  }
  const dates=decisions.map(d=>d.sessionDate);
  return{
    input:{
      provenance:{
        datasetId:'PHASE13_SYNTHETIC_ONLY',source:'TEST_GENERATOR',
        calendarSource:'SYNTHETIC_WINDOWS',expectedSessions:dates,
        synthetic:true
      },
      instrument:'NIFTY',underlyingKey:underlying,
      decisions,executionQuotes:quotes,
      policy:{
        holdCalendarDays:{'1W':1,'2W':1,'4W':1,'8W':1},
        slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
        maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
        maxExitDelayDays:1,minCalendarDaysBeforeExpiry:2,
        folds:[{
          trainStart:dates[0],trainEnd:dates[0],
          testStart:dates[4],testEnd:dates[7]
        }]
      }
    },
    sessions,key:'NSE_FO|'+(100000+11*4)
  };
}
const pick=(r:ReturnType<typeof compareAdaptiveHysteresisMatchedOos>,
  arm='EMA_BASELINE',h='1W')=>
    r.cells.find(c=>c.arm===arm&&c.horizon===h)!;
const compare=(f:ReturnType<typeof sample>,
  hyst=hysteresisPolicy(),p=comparePolicy())=>
  compareAdaptiveHysteresisMatchedOos(
    f.input,f.sessions,exitPolicy(),hyst,p
  );
describe('Phase 13 original vs independent hysteresis entry-first OOS cohorts',()=>{
  it('replays the unchanged baseline and a separately cooled stabilized universe',()=>{
    const f=sample();
    const r=compare(f,hysteresisPolicy(8));
    assert.equal(r.errors.length,0);
    assert.equal(r.cells.length,12);
    assert.equal(r.totalDecisionCells,48);
    const cell=pick(r);
    assert.equal(cell.allOutOfSampleDecisions,4);
    assert.equal(cell.originalObservedEntries,2);
    assert.equal(cell.stabilizedObservedEntries,1);
    assert.equal(cell.bothEntered,0);
    assert.equal(cell.originalOnlyEntries,2);
    assert.equal(cell.stabilizedOnlyEntries,1);
    assert.equal(cell.neitherEntered,1);
    assert.equal(cell.jointlyPricedPairs,0);
    assert.equal(cell.matchedCompleteNetDeltaINR,null);
    assert.equal(cell.descriptivePairedSampleSufficient,false);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.brokerStopsInstalled,false);
    assert.equal(r.historicalSourceAuthenticated,false);
    assert.equal(r.exchangeCalendarAuthenticated,false);
  });
  it('preserves skipped original losing gap trade as observable regret evidence',()=>{
    const f=sample();
    const r=compare(f,hysteresisPolicy(8));
    const c=pick(r);
    assert.equal(c.skippedOriginalLosersObserved,1);
    assert.ok(c.skippedOriginalWinnersObserved>=1);
    assert.equal(c.skippedOriginalUnpriced,0);
    assert.equal(c.originalCensoredExits,0);
    assert.equal(c.stabilizedCensoredExits,0);
    assert.equal(c.originalOvernightGapTriggers,1);
    assert.equal(c.stabilizedOvernightGapTriggers,0);
    assert.equal(c.stabilizedCompleteCohortNetPnlINR,390);
    assert.ok(c.originalCompleteCohortNetPnlINR!<0);
  });
  it('baseline is unchanged when no entry gate is supplied',()=>{
    const f=sample();
    const prior=buildAdaptiveEntryFirstCohort(f.input);
    const exit=runAdaptiveEntryFirstExitStudy(f.input,exitPolicy(),f.sessions);
    assert.deepEqual(exit.cohort.attempts,prior.attempts);
    assert.equal(prior.counts.attempts,48);
    assert.ok(prior.counts.qualifyingEntryCount>0);
  });
  it('paired positions must have jointly priced exits before PnL delta exists',()=>{
    const f=sample();
    const r=compare(f,hysteresisPolicy(2));
    const c=pick(r);
    assert.equal(c.bothEntered,2);
    assert.equal(c.jointlyPricedPairs,2);
    assert.equal(c.jointlyCensoredPairs,0);
    assert.equal(c.originalOnlyEntries,0);
    assert.equal(c.stabilizedOnlyEntries,0);
    assert.equal(c.matchedCompleteNetDeltaINR,0);
    assert.equal(c.descriptivePairedSampleSufficient,true);
    assert.equal(r.status,'DESCRIPTIVE_ONLY'); // Complete synthetic price paths; NOT real market proof.
  });
  it('future missing EXIT keeps original selected entries identical and PnL null',()=>{
    const f=sample();
    const initial=buildAdaptiveEntryFirstCohort(f.input);
    const earliest=Date.UTC(2026,8,13); // remove only NEXT SESSION quotes, preserve original Sept 12 entry
    f.input.executionQuotes=f.input.executionQuotes.filter(q=>
      q.instrumentKey!==f.key||Date.parse(q.observedAt)<earliest);
    const revised=buildAdaptiveEntryFirstCohort(f.input);
    assert.deepEqual(revised.attempts,initial.attempts);
    const r=compare(f,hysteresisPolicy(8));
    const c=pick(r);
    assert.equal(c.originalObservedEntries,2);
    assert.ok(c.originalCensoredExits>=1);
    assert.ok(c.skippedOriginalUnpriced>=1);
    assert.equal(c.originalCompleteCohortNetPnlINR,null);
    assert.equal(c.matchedCompleteNetDeltaINR,null);
    assert.equal(c.fullyCohortComparable,false);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
  });
  it('missing underlying session or invalid policy is a non-authorizing rejection',()=>{
    const f=sample();
    const missing=f.sessions.filter(s=>
      s.sessionDate!==f.input.decisions[5].sessionDate);
    const bad=compareAdaptiveHysteresisMatchedOos(
      f.input,missing,exitPolicy(),hysteresisPolicy(),comparePolicy()
    );
    assert.equal(bad.status,'REJECTED');
    assert.ok(bad.errors.includes('INVALID_OR_UNVERIFIABLE_HYSTERESIS_REPLAY'));
    const invalid=comparePolicy();
    invalid.maximumUnpricedExitFractionPerCell=1.5;
    assert.equal(compare(f,hysteresisPolicy(),invalid).status,'REJECTED');
  });
  it('checks its Phase 12 advisory map only from OOS original decision times',()=>{
    const f=sample();
    const p=hysteresisPolicy(8);
    const h=replayAdaptiveRegimeHysteresis(f.input,f.sessions,p);
    assert.equal(h.status,'DESCRIPTIVE_ONLY');
    assert.equal(h.observations.length,16);
    assert.ok(h.observations.every(x=>
      f.input.decisions.some(d=>d.decisionAt===x.decisionAt)));
    const key=adaptiveCohortAdvisoryKey(
      h.observations[0].foldIndex,
      h.observations[0].horizon,
      h.observations[0].decisionAt
    );
    assert.ok(key.startsWith('0|'));
    assert.equal(h.executionAuthorized,false);
  });
  it('keeps costs explicit and never uses signed stop trigger as a fill',()=>{
    const f=sample();
    f.input.policy.feesAndTaxesINRPerSide=10;
    f.input.policy.slippageBpsPerSide=5;
    const r=compare(f,hysteresisPolicy(8));
    const c=pick(r);
    assert.ok(c.stabilizedCompleteCohortNetPnlINR!<390);
    assert.ok(c.originalCompleteCohortNetPnlINR!<0);
    assert.equal(r.profitabilityProven,false);
  });
});
