import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAdaptiveChronologicalOosRobustness,
  describeChronologicalFoldPnl,
  validateChronologicalOosRobustnessPolicy,
  type ChronologicalOosRobustnessPolicy
} from '../../server/engine/ema15m/adaptiveChronologicalOosRobustness.js';
import {
  compareAdaptiveHysteresisMatchedOos,type HysteresisMatchedOosPolicy
} from '../../server/engine/ema15m/adaptiveHysteresisMatchedOos.js';
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

const riskPolicy=():ChronologicalOosRobustnessPolicy=>({
  schemaVersion:'ADAPTIVE_CHRONOLOGICAL_OOS_ROBUSTNESS_V1',
  minimumSeparatedOosFolds:2,
  minimumPricedExitsPerVariantAcrossFolds:2,
  minimumDistinctOosDecisionsPerFold:1,
  maximumAbsoluteSingleFoldContributionFraction:.5,
  maximumAllowedSingleFoldLossINR:300,
  plannedFamilywiseComparisons:36
});
const audit=(f:ReturnType<typeof sample>,p=riskPolicy(),
  hyst=hysteresisPolicy(2))=>{
  const matched=compareAdaptiveHysteresisMatchedOos(
    f.input,f.sessions,exitPolicy(),hyst,comparePolicy(1));
  const report=auditAdaptiveChronologicalOosRobustness(
    f.input,f.sessions,exitPolicy(),hyst,matched,p);
  return {matched,report};
};
describe('Phase20 conditional fold diagnostics — pure mathematical sensitivities only',()=>{
  it('exact one-sided sign tail is Bonferroni corrected across 36 predeclared variant/contrast views',()=>{
    const a=describeChronologicalFoldPnl([1,1,1,1,1,1]);
    assert.equal(a.positiveFoldCount,6);
    assert.equal(a.exploratoryOneSidedPositiveSignP,.015625);
    assert.equal(a.exploratoryBonferroniAdjustedP36,.5625);
    assert.equal(a.statisticalSignificanceProven,false);
    assert.equal(a.profitabilityProven,false);
    const b=describeChronologicalFoldPnl(Array(12).fill(1));
    assert.equal(b.exploratoryOneSidedPositiveSignP,.000244140625);
    assert.equal(b.exploratoryBonferroniAdjustedP36,.0087890625);
    assert.equal(b.statisticalSignificanceProven,false);
  });
  it('one lucky fold masks losses: concentrated gain, leave-best-fold-out negative, chronological drawdown preserved',()=>{
    const a=describeChronologicalFoldPnl([100,-20,-10]);
    assert.equal(a.completeNetINR,70);
    assert.equal(a.bestFoldNetINR,100);
    assert.equal(a.worstFoldNetINR,-20);
    assert.equal(a.maxChronologicalFoldDrawdownINR,30);
    assert.equal(a.maximumConsecutiveLosingFolds,2);
    assert.equal(a.largestAbsoluteFoldContributionFraction,.7692);
    assert.equal(a.netIfBestFoldOmittedINR,-30);
    assert.equal(a.negativeFoldCount,2);
  });
  it('large early loss is never erased by a later high winner',()=>{
    const a=describeChronologicalFoldPnl([-400,10,10,10]);
    assert.equal(a.completeNetINR,-370);
    assert.equal(a.maxChronologicalFoldDrawdownINR,400);
    assert.equal(a.worstFoldNetINR,-400);
    assert.equal(a.maximumConsecutiveLosingFolds,1);
    assert.equal(a.netIfBestFoldOmittedINR,-380);
  });
  it('a censored fold removes ALL summary PnL, p-values and drawdown, never zero or survivor-only',()=>{
    const a=describeChronologicalFoldPnl([200,null,-300]);
    assert.equal(a.completeFoldCount,0);
    assert.equal(a.completeNetINR,null);
    assert.equal(a.bestFoldNetINR,null);
    assert.equal(a.maxChronologicalFoldDrawdownINR,null);
    assert.equal(a.netIfBestFoldOmittedINR,null);
    assert.equal(a.exploratoryBonferroniAdjustedP36,null);
  });
  it('zero PnL folds cannot masquerade as independent successful signs',()=>{
    const a=describeChronologicalFoldPnl([0,0,0]);
    assert.equal(a.completeNetINR,0);
    assert.equal(a.exploratoryOneSidedPositiveSignP,null);
    assert.equal(a.largestAbsoluteFoldContributionFraction,null);
    const b=describeChronologicalFoldPnl([0,10,-5]);
    assert.equal(b.flatFoldCount,1);
    assert.equal(b.exploratoryOneSidedPositiveSignP,.75);
    assert.equal(b.exploratoryBonferroniAdjustedP36,1);
  });
  it('rejects missing/altered multiplicity and impossible preregistered fold risk caps',()=>{
    const policy=riskPolicy();
    assert.deepEqual(validateChronologicalOosRobustnessPolicy(policy),[]);
    for(const p of [
      {...policy,plannedFamilywiseComparisons:1},
      {...policy,minimumSeparatedOosFolds:0},
      {...policy,maximumAbsoluteSingleFoldContributionFraction:1.1},
      {...policy,maximumAllowedSingleFoldLossINR:-1}
    ] as unknown as ChronologicalOosRobustnessPolicy[]){
      assert.deepEqual(validateChronologicalOosRobustnessPolicy(p),
        ['INVALID_PREDECLARED_OOS_FOLD_ROBUSTNESS_AND_MULTIPLICITY_POLICY']);
    }
  });
});
describe('Phase20 original L1 replay, independent baseline and hysteresis fold guard',()=>{
  it('a one-fold matched synthetic winning sample is not independent-enough research even though all next bids priced',()=>{
    const f=sample();
    const {matched,report}=audit(f);
    assert.equal(matched.status,'DESCRIPTIVE_ONLY');
    assert.equal(report.status,'INCOMPLETE_EVIDENCE');
    assert.equal(report.cells.length,12);
    assert.equal(report.totalFamilywiseHypotheses,36);
    assert.ok(report.cells.every(c=>c.totalOosFolds===1));
    assert.ok(report.cells.every(c=>c.blockers.includes(
      'INDEPENDENT_LIKE_TEST_FOLD_COUNT_BELOW_LOCKED_MINIMUM')));
    const c=report.cells.find(x=>x.arm==='EMA_BASELINE'&&x.horizon==='1W')!;
    assert.equal(c.originalSelectedEntries,2);
    assert.equal(c.hysteresisSelectedEntries,2);
    assert.equal(c.original.completeFoldCount,1);
    assert.equal(c.original.completeNetINR,
      matched.cells.find(x=>x.arm==='EMA_BASELINE'&&x.horizon==='1W')!
        .originalCompleteCohortNetPnlINR);
    assert.equal(c.enoughIndependentLikeFoldsToReview,false);
    assert.equal(report.statisticalSignificanceProven,false);
    assert.equal(report.statisticalIndependenceEstablished,false);
    assert.equal(report.executionAuthorized,false);
    assert.equal(report.productionSafe,false);
    assert.equal(report.horizonRecommendation,null);
    assert.deepEqual(audit(sample()).report,report);
  });
  it('two future OOS date windows may be disjoint but earlier reserved exposure must NOT overlap next test',()=>{
    const f=sample();
    const fold=f.input.policy.folds[0];
    const dates=f.input.decisions.map(d=>d.sessionDate);
    f.input.policy.folds=[
      {...fold,testStart:dates[4],testEnd:dates[4]},
      {...fold,testStart:dates[5],testEnd:dates[7]}
    ];
    const {report}=audit(f);
    assert.equal(report.status,'INCOMPLETE_EVIDENCE');
    assert.equal(report.executionAuthorized,false);
    assert.ok(report.cells.some(c=>c.blockers.includes(
      'PREVIOUS_OOS_FOLD_HOLD_COOLDOWN_OVERLAPS_NEXT_TEST_DECISION')));
    assert.ok(report.cells.some(c=>!c.calendarFoldHoldOverlapAbsent));
    assert.ok(report.cells.every(c=>c.original.exploratoryBonferroniAdjustedP36===null||
      c.original.statisticalSignificanceProven===false));
  });
  it('changing matched Phase13 OOS cohort PnL cannot spoof the reconstructed source fold PnL',()=>{
    const f=sample(),hyst=hysteresisPolicy(2);
    const matched=compareAdaptiveHysteresisMatchedOos(
      f.input,f.sessions,exitPolicy(),hyst,comparePolicy(1));
    matched.cells[0].originalCompleteCohortNetPnlINR=1234567;
    const r=auditAdaptiveChronologicalOosRobustness(
      f.input,f.sessions,exitPolicy(),hyst,matched,riskPolicy());
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.ok(r.cells.some(c=>c.blockers.includes(
      'CENSORED_MISSING_OR_NONRECONCILED_ORIGINAL_OPTION_NET_PNL')));
    assert.equal(r.statisticalSignificanceProven,false);
  });
  it('original next-BID removal is fully censored rather than disappearing from PnL',()=>{
    const f=sample();
    const after=origin+12*DAY;
    f.input.executionQuotes=f.input.executionQuotes.filter(q=>
      q.instrumentKey!==f.key||Date.parse(q.observedAt)<after);
    const {report}=audit(f);
    assert.equal(report.status,'INCOMPLETE_EVIDENCE');
    const c=report.cells.find(c=>c.arm==='EMA_BASELINE'&&c.horizon==='1W')!;
    assert.equal(c.originalCensoredExits,1);
    assert.equal(c.original.completeNetINR,null);
    assert.equal(c.original.exploratoryOneSidedPositiveSignP,null);
    assert.equal(c.fullySourcedFoldSeries,false);
    assert.equal(report.nativeBrokerStopsInstalled,false);
  });
});
