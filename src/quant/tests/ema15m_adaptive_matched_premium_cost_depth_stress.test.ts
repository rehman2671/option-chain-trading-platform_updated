import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAdaptiveMatchedPremiumCostDepthStress,
  validatePremiumCostDepthStressPolicy,
  type PremiumCostDepthStressPolicy,type StressCase
} from '../../server/engine/ema15m/adaptiveMatchedPremiumCostDepthStress.js';
import {compareAdaptiveHysteresisMatchedOos} from
  '../../server/engine/ema15m/adaptiveHysteresisMatchedOos.js';
import {buildAdaptiveEntryFirstCohort} from
  '../../server/engine/ema15m/adaptiveEntryFirstCohort.js';
import type {HistoricalComparisonInput} from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type {DeclaredTradingSession} from
  '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import type {AdaptiveExitReplayPolicy} from
  '../../server/engine/ema15m/adaptivePositionalExitReplay.js';
import type {HysteresisResearchPolicy} from
  '../../server/engine/ema15m/adaptiveRegimeHysteresis.js';
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


const policy=(bidLots=1,askLots=1,cap=1000000):
  PremiumCostDepthStressPolicy=>({
  schemaVersion:'ADAPTIVE_MATCHED_PREMIUM_COST_DEPTH_STRESS_V1',
  minimumJointlyStressedPricedPairsPerCell:1,
  horizonRules:{
    '1W':{addedEntryAskBps:100,addedExitBidBps:100,
      additionalOvernightBidHaircutBps:1500,
      minimumAskDepthLots:askLots,minimumBidDepthLots:bidLots,
      maximumCombinedStressDeteriorationINR:cap},
    '2W':{addedEntryAskBps:100,addedExitBidBps:100,
      additionalOvernightBidHaircutBps:1500,
      minimumAskDepthLots:askLots,minimumBidDepthLots:bidLots,
      maximumCombinedStressDeteriorationINR:cap},
    '4W':{addedEntryAskBps:100,addedExitBidBps:100,
      additionalOvernightBidHaircutBps:1500,
      minimumAskDepthLots:askLots,minimumBidDepthLots:bidLots,
      maximumCombinedStressDeteriorationINR:cap},
    '8W':{addedEntryAskBps:100,addedExitBidBps:100,
      additionalOvernightBidHaircutBps:1500,
      minimumAskDepthLots:askLots,minimumBidDepthLots:bidLots,
      maximumCombinedStressDeteriorationINR:cap}
  }
});
const run=(f:ReturnType<typeof sample>,p=policy())=>
  auditAdaptiveMatchedPremiumCostDepthStress(
    f.input,f.sessions,exitPolicy(),hysteresisPolicy(2),
    comparePolicy(1),p
  );
const cell=(r:ReturnType<typeof run>,scenario:StressCase,
  arm='EMA_BASELINE',horizon='1W')=>
  r.cells.find(c=>c.scenario===scenario&&
    c.arm===arm&&c.horizon===horizon)!;

describe('Phase 14 predeclared matched premium-cost and order-book depth stress',()=>{
  it('reuses independently enrolled original/hysteresis OOS and reproduces Phase13 unchanged PnL',()=>{
    const f=sample(),r=run(f);
    const matched=compareAdaptiveHysteresisMatchedOos(
      f.input,f.sessions,exitPolicy(),hysteresisPolicy(2),comparePolicy(1));
    assert.equal(r.errors.length,0);
    assert.equal(r.status,'DESCRIPTIVE_ONLY');
    assert.equal(r.synthetic,true);
    assert.equal(r.phase13Status,'DESCRIPTIVE_ONLY');
    assert.equal(r.cells.length,48);
    assert.equal(r.horizonSummary.length,16);
    assert.equal(r.cells.every(c=>c.fixedCohortsAcrossScenarios),true);
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.brokerFillsAuthenticated,false);
    assert.equal(r.nativeProtectionInstalled,false);
    assert.equal(r.originalMarketDataIndependentlyAuthenticated,false);
    assert.equal(r.scenarioPricesAreObservedTrades,false);
    const base=cell(r,'UNCHANGED_P8_COSTS');
    const prev=matched.cells.find(c=>c.arm==='EMA_BASELINE'&&c.horizon==='1W')!;
    assert.equal(base.original.completeCohortNetPnlINR,
      prev.originalCompleteCohortNetPnlINR);
    assert.equal(base.stabilized.completeCohortNetPnlINR,
      prev.stabilizedCompleteCohortNetPnlINR);
    assert.equal(base.pairedNetDeltaINR,prev.matchedCompleteNetDeltaINR);
    assert.equal(base.original.aggregateScenarioCostPenaltyINR,0);
    assert.equal(base.stabilized.aggregateScenarioCostPenaltyINR,0);
  });
  it('extra fees/slippage, spread and gap haircuts cannot improve fixed entry/exit PnL',()=>{
    const r=run(sample());
    const base=cell(r,'UNCHANGED_P8_COSTS');
    const fee=cell(r,'DOUBLE_ORIGINAL_COSTS');
    const spread=cell(r,'WIDEN_ENTRY_ASK_AND_EXIT_BID');
    const worst=cell(r,'COMBINED_OVERNIGHT_GAP_AND_DEPTH');
    for(const variant of ['original','stabilized'] as const){
      assert.equal(base[variant].scenarioPricedExits,
        worst[variant].scenarioPricedExits);
      assert.ok(fee[variant].completeCohortNetPnlINR! <=
        base[variant].completeCohortNetPnlINR!);
      assert.ok(spread[variant].completeCohortNetPnlINR! <
        base[variant].completeCohortNetPnlINR!);
      assert.ok(worst[variant].completeCohortNetPnlINR! <=
        spread[variant].completeCohortNetPnlINR!);
      assert.ok(worst[variant].aggregateScenarioCostPenaltyINR!>0);
    }
    assert.ok(worst.original.completeCohortNetPnlINR! <
      spread.original.completeCohortNetPnlINR!); // observed overnight gap haircut
    const gap=r.horizonSummary.find(s=>
      s.horizon==='1W'&&s.scenario==='COMBINED_OVERNIGHT_GAP_AND_DEPTH')!;
    assert.ok(gap.observedGapSensitiveEntries>0);
  });
  it('thin NEXT bid that originally passed 1 lot is CENSORED for 2-lot stress, never delayed fill',()=>{
    const f=sample();
    const afterGap=iso(origin+12*DAY+230*MIN);
    const next=f.input.executionQuotes.find(q=>
      q.instrumentKey===f.key&&q.observedAt===afterGap)!;
    assert.ok(next);
    next.bidQty=65;
    const original=buildAdaptiveEntryFirstCohort(f.input);
    const r=run(f,policy(2,2));
    assert.equal(r.errors.length,0);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    const base=cell(r,'UNCHANGED_P8_COSTS');
    const combined=cell(r,'COMBINED_OVERNIGHT_GAP_AND_DEPTH');
    assert.equal(base.original.scenarioCensoredExits,0);
    assert.ok(combined.original.additionalDepthBlockedExits>=1);
    assert.ok(combined.original.scenarioCensoredExits>=1);
    assert.equal(combined.original.completeCohortNetPnlINR,null);
    assert.equal(combined.pairedNetDeltaINR,null);
    assert.ok(combined.blockers.includes(
      'UNPRICED_OR_DEPTH_BLOCKED_EXITS_CANNOT_ENTER_NET_PNL'));
    assert.deepEqual(buildAdaptiveEntryFirstCohort(f.input).attempts,
      original.attempts);
  });
  it('vanished future exit observation preserves the entry universe and NEVER becomes a zero loss',()=>{
    const f=sample(),before=buildAdaptiveEntryFirstCohort(f.input);
    f.input.executionQuotes=f.input.executionQuotes.filter(q=>
      q.instrumentKey!==f.key||Date.parse(q.observedAt)<origin+12*DAY);
    assert.deepEqual(buildAdaptiveEntryFirstCohort(f.input).attempts,
      before.attempts);
    const r=run(f);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    const base=cell(r,'UNCHANGED_P8_COSTS');
    const combined=cell(r,'COMBINED_OVERNIGHT_GAP_AND_DEPTH');
    assert.ok(base.original.originalCensoredExits>=1);
    assert.equal(base.original.completeCohortNetPnlINR,null);
    assert.equal(combined.original.completeCohortNetPnlINR,null);
    assert.equal(combined.pairedNetDeltaINR,null);
  });
  it('horizon cap blocks overly fragile stressed evidence without changing enrollment or price samples',()=>{
    const f=sample();
    const p=policy(1,1,0);
    const r=run(f,p);
    const base=cell(r,'UNCHANGED_P8_COSTS');
    const combined=cell(r,'COMBINED_OVERNIGHT_GAP_AND_DEPTH');
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.ok(combined.blockers.some(b=>
      b.includes('COMBINED_STRESS_DETERIORATION_OVER_PREDECLARED_LIMIT')));
    assert.equal(combined.sufficientForDescriptiveStressReview,false);
    assert.equal(combined.pairedNetDeltaINR,null);
    assert.equal(base.sufficientForDescriptiveStressReview,true);
  });
  it('rejects invalid stress settings or incomplete source calendar, never authorizes orders',()=>{
    const f=sample();
    const p=policy();
    p.horizonRules['4W'].minimumBidDepthLots=0;
    assert.deepEqual(validatePremiumCostDepthStressPolicy(p),
      ['INVALID_PREDECLARED_HORIZON_COST_DEPTH_RULE_4W']);
    const invalid=run(f,p);
    assert.equal(invalid.status,'REJECTED');
    assert.equal(invalid.executionAuthorized,false);
    const removed=f.sessions.filter(s=>
      s.sessionDate!==f.input.decisions[5].sessionDate);
    const absent=auditAdaptiveMatchedPremiumCostDepthStress(
      f.input,removed,exitPolicy(),hysteresisPolicy(2),
      comparePolicy(1),policy());
    assert.equal(absent.status,'REJECTED');
    assert.ok(absent.errors.includes('INVALID_OR_REJECTED_PHASE13_MATCHED_STUDY'));
  });
  it('reports four expiry horizons and all three arms under unchanged chronological denominator',()=>{
    const r=run(sample());
    for(const h of horizons){
      assert.equal(r.cells.filter(c=>c.horizon===h).length,12);
      for(const scenario of [
        'UNCHANGED_P8_COSTS','DOUBLE_ORIGINAL_COSTS',
        'WIDEN_ENTRY_ASK_AND_EXIT_BID','COMBINED_OVERNIGHT_GAP_AND_DEPTH'
      ] as const){
        const rows=r.cells.filter(c=>
          c.horizon===h&&c.scenario===scenario);
        assert.equal(rows.length,3);
        assert.equal(rows.reduce((n,c)=>n+c.allOutOfSampleDecisions,0),12);
      }
    }
  });
});
