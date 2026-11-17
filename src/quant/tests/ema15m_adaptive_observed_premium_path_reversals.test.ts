import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAdaptiveObservedPremiumRunupReversals,
  validateObservedPremiumRunupPolicy,
  type ObservedPremiumRunupPolicy,
  type ObservedPremiumPathReversalReport
} from '../../server/engine/ema15m/adaptiveObservedPremiumPathReversals.js';
import {buildAdaptiveEntryFirstCohort} from
  '../../server/engine/ema15m/adaptiveEntryFirstCohort.js';
import {compareAdaptiveHysteresisMatchedOos,
  type HysteresisMatchedOosPolicy} from
  '../../server/engine/ema15m/adaptiveHysteresisMatchedOos.js';
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


const pathPolicy=():ObservedPremiumRunupPolicy=>({
  schemaVersion:'ADAPTIVE_OBSERVED_PREMIUM_RUNUP_REVERSAL_V1',
  firstRunupPoints:50,secondRunupPoints:70,candidateTargetPoints:100,
  reversalGivebackPoints:20,minimumDisplayedBidDepthLots:1,
  minimumFullyObservedPathsPerVariantCell:1
});
function updateQuote(
  f:ReturnType<typeof sample>,dt:number,bid:number,bidQty=1000
){
  const entry=origin+11*DAY+391*MIN;
  const q=f.input.executionQuotes.find(q=>
    q.instrumentKey===f.key&&q.observedAt===iso(entry+dt*MIN));
  assert.ok(q);
  q.bid=bid;q.ask=bid+1;q.bidQty=bidQty;
}
const run=(f:ReturnType<typeof sample>,
  policy=pathPolicy(),hyst=hysteresisPolicy(2))=>{
  const matched=compareAdaptiveHysteresisMatchedOos(
    f.input,f.sessions,exitPolicy(),hyst,comparePolicy(1)
  );
  const report=auditAdaptiveObservedPremiumRunupReversals(
    f.input,f.sessions,exitPolicy(),hyst,matched,policy
  );
  return {matched,report};
};
const cell=(r:ObservedPremiumPathReversalReport,
  arm='EMA_BASELINE',horizon='1W')=>
  r.cells.find(c=>c.arm===arm&&c.horizon===horizon)!;
describe('Phase 19 premium-bid partial-runup reversal vs +100 candidate threshold',()=>{
  it('keeps the same Phase13 independently enrolled OOS denominator without a future-entry peek',()=>{
    const f=sample();
    const {matched,report}=run(f);
    assert.equal(matched.status,'DESCRIPTIVE_ONLY');
    assert.equal(report.status,'DESCRIPTIVE_ONLY');
    assert.equal(report.cells.length,12);
    assert.equal(report.executionAuthorized,false);
    assert.equal(report.productionSafe,false);
    assert.equal(report.nativeStopsInstalled,false);
    assert.equal(report.brokerFillsAuthenticated,false);
    assert.equal(report.profitabilityProven,false);
    assert.equal(report.historicalOptionL1IndependentlyAuthenticated,false);
    assert.equal(report.exchangeCalendarIndependentlyAuthenticated,false);
    assert.equal(report.thresholdOptimizationAuthorized,false);
    for(const r of report.cells){
      const c=matched.cells.find(c=>c.foldIndex===r.foldIndex&&
        c.arm===r.arm&&c.horizon===r.horizon)!;
      assert.equal(r.allOutOfSampleDecisions,c.allOutOfSampleDecisions);
      assert.equal(r.original.enrolledEntries,c.originalObservedEntries);
      assert.equal(r.hysteresis.enrolledEntries,c.stabilizedObservedEntries);
      assert.equal(r.original.pricedAndFullyObservedPaths,c.originalPricedExits);
      assert.equal(r.hysteresis.pricedAndFullyObservedPaths,c.stabilizedPricedExits);
      assert.equal(r.original.qualifiedBidTargetCrossings,0);
      assert.equal(r.original.firstRunupReversalBeforeTarget,0);
    }
    assert.deepEqual(run(sample()).report,report);
  });
  it('reports observed +50 then +70 BID runup followed by >=20 reversal BEFORE +100',()=>{
    const f=sample(),prior=buildAdaptiveEntryFirstCohort(f.input).attempts;
    updateQuote(f,5,160);
    updateQuote(f,10,175);
    updateQuote(f,15,150);
    updateQuote(f,20,149);
    const {matched,report}=run(f);
    assert.equal(report.status,'DESCRIPTIVE_ONLY');
    assert.equal(matched.status,'DESCRIPTIVE_ONLY');
    const c=cell(report);
    assert.equal(c.original.qualifiedBidFirstRunupCrossings,1);
    assert.equal(c.original.qualifiedBidSecondRunupCrossings,1);
    assert.equal(c.original.qualifiedBidTargetCrossings,0);
    assert.equal(c.original.firstRunupReversalBeforeTarget,1);
    assert.equal(c.original.secondRunupReversalBeforeTarget,1);
    assert.equal(c.original.observedRawBidTargetCrossings,0);
    assert.ok(c.original.completeCohortMeanMaxQualifiedBidGainPoints!>0);
    assert.equal(c.original.laterObservedTrailingGivebackTriggers,1);
    assert.deepEqual(buildAdaptiveEntryFirstCohort(f.input).attempts,prior);
  });
  it('a raw +100 BID at quantity below a full lot cannot count as depth-qualified target',()=>{
    const f=sample();
    updateQuote(f,5,210,1); // 1 displayed unit < original 65-unit lot
    updateQuote(f,10,165);
    updateQuote(f,15,99);
    const {report}=run(f);
    const c=cell(report);
    assert.equal(c.original.observedRawBidTargetCrossings,1);
    assert.equal(c.original.qualifiedBidTargetCrossings,0);
    assert.equal(c.original.qualifiedBidSecondRunupCrossings,0);
    assert.ok(c.original.completeCohortMeanMaxRawBidGainPoints!>
      c.original.completeCohortMeanMaxQualifiedBidGainPoints!);
    assert.equal(report.brokerFillsAuthenticated,false);
  });
  it('a genuine OBSERVED qualified +100 target crossing prevents false failed-target labeling',()=>{
    const f=sample();
    updateQuote(f,5,205);
    updateQuote(f,10,180);
    updateQuote(f,15,179);
    const {report}=run(f);
    const c=cell(report);
    assert.equal(c.original.qualifiedBidTargetCrossings,1);
    assert.equal(c.original.firstRunupReversalBeforeTarget,0);
    assert.equal(c.original.secondRunupReversalBeforeTarget,0);
    assert.equal(c.original.observedRawBidTargetCrossings,1);
  });
  it('missing NEXT bid stays censored: no made-up premium gain or zero return',()=>{
    const f=sample();
    updateQuote(f,5,160);updateQuote(f,10,175);
    updateQuote(f,15,150);
    const enter=origin+11*DAY+391*MIN;
    f.input.executionQuotes=f.input.executionQuotes.filter(q=>
      q.instrumentKey!==f.key||Date.parse(q.observedAt)<enter+20*MIN);
    const before=buildAdaptiveEntryFirstCohort(f.input);
    const {matched,report}=run(f);
    assert.equal(matched.status,'INCOMPLETE_EVIDENCE');
    assert.equal(report.status,'INCOMPLETE_EVIDENCE');
    assert.equal(cell(report).original.censoredOrSourceMismatchedPaths,1);
    assert.equal(cell(report).original.completeCohortMeanMaxQualifiedBidGainPoints,null);
    assert.equal(cell(report).fullyObservedForDescriptiveReview,false);
    assert.deepEqual(buildAdaptiveEntryFirstCohort(f.input).attempts,before.attempts);
  });
  it('an independently filtered trade can skip a +50 reversal, never claim it was an avoided loss automatically',()=>{
    const f=sample();
    updateQuote(f,5,160);updateQuote(f,10,175);
    updateQuote(f,15,150);updateQuote(f,20,149);
    const {matched,report}=run(f,pathPolicy(),hysteresisPolicy(8));
    const c=cell(report);
    assert.equal(matched.status,'INCOMPLETE_EVIDENCE');
    assert.equal(report.status,'INCOMPLETE_EVIDENCE');
    assert.equal(c.originalOnlyEntered,2);
    assert.equal(c.hysteresisOnlyEntered,1);
    assert.ok(c.originalOnlyFirstRunupReversals>=1);
    assert.equal(c.originalOnlyReachedCandidateTarget,0);
    assert.equal(c.cohortSelectionsHeldConstant,true);
  });
  it('strict predeclared thresholds and displayed quantity gates reject malformed policies',()=>{
    const f=sample();
    const p=pathPolicy();p.candidateTargetPoints=60;
    assert.deepEqual(validateObservedPremiumRunupPolicy(p),
      ['INVALID_PREDECLARED_OPTION_PREMIUM_PATH_THRESHOLDS']);
    assert.equal(run(f,p).report.status,'REJECTED');
    const q=pathPolicy();q.minimumDisplayedBidDepthLots=0;
    assert.equal(run(f,q).report.status,'REJECTED');
    const t=pathPolicy();t.reversalGivebackPoints=-1;
    assert.equal(run(f,t).report.status,'REJECTED');
  });
});
