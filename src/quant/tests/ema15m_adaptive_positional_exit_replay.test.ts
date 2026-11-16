import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import {
  replayAdaptiveExitPaths,type AdaptiveExitReplayPolicy
} from '../../server/engine/ema15m/adaptivePositionalExitReplay.js';
import type {DeclaredTradingSession} from '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import type {
  HistoricalComparisonInput,HistoricalComparisonReport,
  HistoricalTrade,HistoricalArmMetrics,HistoricalExecutableQuote
} from '../../server/engine/ema15m/historicalAdaptiveComparison.js';

const start='2026-11-16T04:00:00.000Z';
const end='2026-11-17T05:12:00.000Z';
const quote=(when:string,bid:number,depth=100):HistoricalExecutableQuote=>({
  observedAt:when,instrumentKey:'NSE_FO|456789',
  bid,ask:bid+1,bidQty:depth,askQty:depth
});
const t=(d:number,min:number):string=>new Date(
  Date.parse('2026-11-16T04:00:00Z')+d*86_400_000+min*60_000).toISOString();
const sessions:DeclaredTradingSession[]=[
  {sessionDate:'2026-11-16',openAt:'2026-11-16T03:45:00Z',
   closeAt:'2026-11-16T10:00:00Z',sourceRecordId:'TEST_SESSION_16'},
  {sessionDate:'2026-11-17',openAt:'2026-11-17T03:45:00Z',
   closeAt:'2026-11-17T10:00:00Z',sourceRecordId:'TEST_SESSION_17'}
];
const rule={
  initialStopFraction:0.2,trailActivationFraction:0.20,
  trailingGivebackFraction:0.10,maxHoldCalendarDays:10
};
function policy():AdaptiveExitReplayPolicy{
  return{
    schemaVersion:'ADAPTIVE_OPTION_EXIT_REPLAY_V1',
    horizonRules:{'1W':{...rule},'2W':{...rule},
      '4W':{...rule},'8W':{...rule}},
    minQuotesPerDeclaredSession:2,minIntermediateQuotes:2,
    maxSameSessionQuoteGapMinutes:120,maxTriggerToNextQuoteMinutes:5
  };
}
function caseStudy(series:HistoricalExecutableQuote[],fixedExitBid:number,opts:{
  missingOriginal?:boolean
}={}):{
  input:HistoricalComparisonInput; report:HistoricalComparisonReport
}{
  const trade:HistoricalTrade={
    arm:'REGIME_AND_RANK',horizon:'2W',decisionAt:'2026-11-16T03:55:00Z',
    instrumentKey:'NSE_FO|456789',expiry:'2026-12-01',
    entryAt:start,exitAt:end,quantity:10,entryAsk:100,exitBid:fixedExitBid,
    netPnlINR:Number(((fixedExitBid-100)*10).toFixed(2)),
    overnightGapIncluded:true
  };
  const metric:HistoricalArmMetrics={
    arm:'REGIME_AND_RANK',horizon:'2W',
    signalsConsidered:1,filterSkipped:0,unavailableContract:0,
    unpricedEntries:0,unpricedExits:opts.missingOriginal?1:0,
    tradeCount:1,grossTurnoverINR:(100+fixedExitBid)*10,
    netPnlINR:trade.netPnlINR,expectancyINR:trade.netPnlINR,
    winRate:trade.netPnlINR>0?100:0,maxDrawdownINR:0,
    avgHoldingHours:(Date.parse(end)-Date.parse(start))/3_600_000,
    comparable:false,trades:[trade]
  };
  const input:HistoricalComparisonInput={
    provenance:{
      datasetId:'SYNTHETIC_POSITIONAL_EXIT_STUDY',
      source:'TEST_GENERATOR',calendarSource:'TEST_DECLARED_WINDOWS',
      expectedSessions:['2026-11-16'],synthetic:true
    },
    instrument:'NIFTY',underlyingKey:'NSE_INDEX|Nifty 50',
    decisions:[],executionQuotes:series,
    policy:{
      holdCalendarDays:{'1W':1,'2W':2,'4W':4,'8W':8},
      slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
      maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:5,
      maxExitDelayDays:2,minCalendarDaysBeforeExpiry:1,folds:[]
    }
  };
  const report:HistoricalComparisonReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,
    method:'FIXED_POLICY_CHRONOLOGICAL_FOLDS_V1',productionSafe:false,
    datasetId:input.provenance.datasetId,synthetic:true,status:'DESCRIPTIVE_ONLY',
    errors:[],folds:[{
      window:{trainStart:'2026-10-01',trainEnd:'2026-10-15',
        testStart:'2026-11-16',testEnd:'2026-11-17'},
      trainingSessions:5,testingSessions:2,
      training:[],outOfSample:[metric],
      completePriceEvidence:!opts.missingOriginal
    }]
  };
  return{input,report};
}

describe('Phase 7 historical exit-path L1 replay, research only',()=>{
  it('observes favorable premium move then protects against giveback at NEXT observed bid',()=>{
    const series=[
      quote(start,99),quote(t(0,1),110),quote(t(0,2),130),
      quote(t(0,3),116),quote(t(0,4),113),
      quote(t(1,69),105),quote(end,105)
    ];
    const {input,report}=caseStudy(series,105);
    const outcome=replayAdaptiveExitPaths(input,report,policy(),sessions);
    assert.equal(outcome.status,'DESCRIPTIVE_ONLY');
    assert.equal(outcome.executionAuthorized,false);
    assert.equal(outcome.brokerageProtectionImplemented,false);
    assert.equal(outcome.empiricalProfitabilityProven,false);
    assert.equal(outcome.trades.length,1);
    const x=outcome.trades[0];
    assert.equal(x.status,'PRICED_HYPOTHETICAL_EXIT');
    assert.equal(x.reason,'TRAILING_GIVEBACK');
    assert.equal(x.triggerObservedAt,t(0,3));
    assert.equal(x.hypotheticalExitAt,t(0,4)); // never same quote as trigger
    assert.equal(x.breachedStopLevel,117);
    assert.equal(x.hypotheticalExitBid,113); // not fictional fill at 117
    assert.equal(x.hypotheticalNetPnlINR,130);
    assert.equal(x.deltaVsOriginalINR,80);
    assert.equal(outcome.cells[0].pairedPricedTradeCount,1);
    assert.equal(outcome.cells[0].comparable,false); // n<20
  });
  it('does not assume overnight stop fills at trigger/limit price after a gap',()=>{
    const series=[
      quote(start,99),quote(t(0,1),120),quote(t(0,2),130),
      quote(t(1,60),70),quote(t(1,61),71),quote(end,90)
    ];
    const {input,report}=caseStudy(series,90);
    const x=replayAdaptiveExitPaths(input,report,policy(),sessions).trades[0];
    assert.equal(x.reason,'TRAILING_GIVEBACK');
    assert.equal(x.overnightTrigger,true);
    assert.equal(x.breachedStopLevel,117);
    assert.equal(x.hypotheticalExitBid,71);
    assert.equal(x.hypotheticalNetPnlINR,-290);
    assert.equal(x.deltaVsOriginalINR,-190);
  });
  it('does not invent a fill when the NEXT quote has insufficient bid depth',()=>{
    const series=[
      quote(start,99),quote(t(0,1),130),quote(t(0,2),115),
      quote(t(0,3),112,2),quote(t(1,69),91),quote(end,90)
    ];
    const {input,report}=caseStudy(series,90);
    const x=replayAdaptiveExitPaths(input,report,policy(),sessions).trades[0];
    assert.equal(x.status,'TRIGGER_UNPRICED');
    assert.equal(x.reason,'POST_TRIGGER_BID_DEPTH_INSUFFICIENT');
    assert.equal(x.hypotheticalNetPnlINR,null);
  });
  it('rejects large trigger-to-next quote gaps instead of substituting stop threshold',()=>{
    const series=[
      quote(start,99),quote(t(0,1),130),quote(t(0,2),115),
      quote(t(0,20),114),quote(t(1,69),90),quote(end,90)
    ];
    const {input,report}=caseStudy(series,90);
    const x=replayAdaptiveExitPaths(input,report,policy(),sessions).trades[0];
    assert.equal(x.status,'TRIGGER_UNPRICED');
    assert.equal(x.reason,'POST_TRIGGER_BID_TOO_LATE');
  });
  it('rejects sparse intraday evidence even though original fixed-hold trade was priced',()=>{
    const series=[
      quote(start,99),quote(t(0,2),130),
      quote(t(1,69),90),quote(end,90)
    ];
    const {input,report}=caseStudy(series,90);
    const p=policy();p.minQuotesPerDeclaredSession=3;
    const r=replayAdaptiveExitPaths(input,report,p,sessions);
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.trades[0].status,'INCOMPLETE_PATH');
    assert.equal(r.trades[0].hypotheticalNetPnlINR,null);
  });
  it('requires explicit declared exchange windows and valid prespecified rules',()=>{
    const series=[quote(start,99),quote(t(0,1),115),quote(t(1,69),100),quote(end,100)];
    const {input,report}=caseStudy(series,100);
    assert.equal(replayAdaptiveExitPaths(input,report,policy()).status,'REJECTED');
    const p=policy();p.horizonRules['1W'].initialStopFraction=0;
    const r=replayAdaptiveExitPaths(input,report,p,sessions);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('INVALID_EXPLICIT_EXIT_POLICY'));
  });
  it('models a time cap only after the first observed eligible quote and next quote exit',()=>{
    const series=[
      quote(start,99),quote(t(0,1),111),
      quote(t(1,0),108),quote(t(1,1),107),quote(end,109)
    ];
    const {input,report}=caseStudy(series,109);
    const p=policy();p.horizonRules['2W'].maxHoldCalendarDays=1;
    const x=replayAdaptiveExitPaths(input,report,p,sessions).trades[0];
    assert.equal(x.reason,'TIME_CAP');
    assert.equal(x.triggerObservedAt,t(1,0));
    assert.equal(x.hypotheticalExitAt,t(1,1));
    assert.equal(x.hypotheticalExitBid,107);
  });
  it('retains original fixed-hold result only when NO early rule fires',()=>{
    const series=[
      quote(start,99),quote(t(0,1),104),quote(t(0,2),107),
      quote(t(1,69),108),quote(end,109)
    ];
    const {input,report}=caseStudy(series,109);
    const x=replayAdaptiveExitPaths(input,report,policy(),sessions).trades[0];
    assert.equal(x.status,'PRICED_HYPOTHETICAL_EXIT');
    assert.equal(x.reason,'ORIGINAL_FIXED_HOLD');
    assert.equal(x.hypotheticalNetPnlINR,90);
    assert.equal(x.deltaVsOriginalINR,0);
  });
  it('disqualifies coverage metrics when fixed-hold comparator itself missed exits',()=>{
    const series=[
      quote(start,99),quote(t(0,1),104),quote(t(0,2),107),
      quote(t(1,69),108),quote(end,109)
    ];
    const {input,report}=caseStudy(series,109,{missingOriginal:true});
    const out=replayAdaptiveExitPaths(input,report,policy(),sessions);
    assert.equal(out.status,'INCOMPLETE_EVIDENCE');
    assert.equal(out.cells[0].comparable,false);
  });
});
