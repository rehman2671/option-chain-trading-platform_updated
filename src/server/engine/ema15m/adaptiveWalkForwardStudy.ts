/**
 * Adaptive v2 Phase 5: pre-registered, non-executable walk-forward study.
 * Replays the exact same dated decisions and quote universe under alternative
 * costs. No tuning on OOS data, broker orders, synthetic option prices or claims
 * of profitability. Use with source-attested original-event-time L1 only.
 */
import {
  compareAdaptiveHistorical, type HistoricalArm, type HistoricalArmMetrics,
  type HistoricalComparisonInput, type HistoricalComparisonReport
} from './historicalAdaptiveComparison.js';
import { ingestVendorHistoricalBundle, type VerifiedHistoricalBundleV1,
  type IngestionResult } from './adaptiveVendorIngestion.js';
import type { HorizonBucket } from './adaptiveOptionRanker.js';
import { auditAdaptiveOosMarketRegimes, type OosRegimeAudit } from './adaptiveOosRegimeAudit.js';

export type StressScenario = 'BASE' | 'DOUBLE_FEES_AND_SLIPPAGE' |
  'WIDEN_L1_50BPS' | 'COMBINED_COST_AND_L1_STRESS';
const SCENARIOS: StressScenario[] = [
  'BASE','DOUBLE_FEES_AND_SLIPPAGE','WIDEN_L1_50BPS',
  'COMBINED_COST_AND_L1_STRESS'
];
const ARMS: HistoricalArm[] = ['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS: HorizonBucket[] = ['1W','2W','4W','8W'];
export interface PairedComparison {
  foldIndex: number;
  horizon: HorizonBucket;
  reference: 'EMA_BASELINE';
  contender: 'REGIME_FILTER' | 'REGIME_AND_RANK';
  baselineTrades: number;
  contenderTrades: number;
  pairedDecisionCount: number;
  pairedDeltaNetINR: number | null;
  missingPairCount: number;
  /** Matching trades share the decisionAt; strategy executions are not identical. */
  comparisonIsTradeMatched: boolean;
  /** Not statistical significance or a winning strategy claim. */
  sufficientPairedSample: boolean;
}
export interface StressCell {
  scenario: StressScenario;
  foldIndex: number;
  arm: HistoricalArm;
  horizon: HorizonBucket;
  tradeCount: number;
  netPnlINR: number;
  expectancyINR: number | null;
  maxDrawdownINR: number;
  grossTurnoverINR: number;
  unpricedEntries: number;
  unpricedExits: number;
  comparable: boolean;
}
export interface AdaptiveWalkForwardStudy {
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  productionSafe: false;
  sourceAuthenticityIndependentlyVerified: false;
  empiricalProfitabilityProven: false;
  status: 'REJECTED' | 'INCOMPLETE_EVIDENCE' | 'DESCRIPTIVE_ONLY';
  errors: string[];
  ingestion: Omit<IngestionResult,'input'>;
  scenarios: StressScenario[];
  foldWindows: Array<{
    trainStart: string;trainEnd: string;testStart: string;testEnd: string;
    trainingSessions: number;testingSessions: number;
  }>;
  results: StressCell[];
  pairedOutOfSample: PairedComparison[];
  marketRegimeAudit: OosRegimeAudit | null;
  report: HistoricalComparisonReport | null;
  warnings: string[];
}
const round = (x:number) => Number(x.toFixed(2));
const metrics = (report:HistoricalComparisonReport,foldIndex:number) =>
  report.folds[foldIndex]?.outOfSample ?? [];

function scenarioInput(input:HistoricalComparisonInput, scenario:StressScenario):
HistoricalComparisonInput {
  if (scenario === 'BASE') return input;
  const doubleCost = scenario === 'DOUBLE_FEES_AND_SLIPPAGE' ||
    scenario === 'COMBINED_COST_AND_L1_STRESS';
  const widen = scenario === 'WIDEN_L1_50BPS' ||
    scenario === 'COMBINED_COST_AND_L1_STRESS';
  const bps = widen ? 50/10_000 : 0;
  return {
    ...input,
    policy: {
      ...input.policy,
      slippageBpsPerSide: input.policy.slippageBpsPerSide * (doubleCost ? 2 : 1),
      feesAndTaxesINRPerSide: input.policy.feesAndTaxesINRPerSide * (doubleCost ? 2 : 1)
    },
    executionQuotes: input.executionQuotes.map(q=>({
      ...q,
      // Stress observed bid/ask only, never re-rank on future observations.
      bid: q.bid*(1-bps),ask:q.ask*(1+bps)
    }))
  };
}

function pairFold(foldIndex:number, rows:HistoricalArmMetrics[]):PairedComparison[] {
  const get=(a:HistoricalArm,h:HorizonBucket)=>
    rows.find(m=>m.arm===a&&m.horizon===h);
  const output:PairedComparison[]=[];
  for(const horizon of HORIZONS){
    const base=get('EMA_BASELINE',horizon);
    if(!base) continue;
    for(const contender of ['REGIME_FILTER','REGIME_AND_RANK'] as const){
      const other=get(contender,horizon);
      if(!other) continue;
      const bm=new Map(base.trades.map(t=>[t.decisionAt,t.netPnlINR]));
      const om=new Map(other.trades.map(t=>[t.decisionAt,t.netPnlINR]));
      const matched=[...bm.keys()].filter(k=>om.has(k));
      const sufficient=matched.length>=20 && base.unpricedEntries===0 &&
        base.unpricedExits===0 && other.unpricedEntries===0 && other.unpricedExits===0;
      output.push({
        foldIndex,horizon,reference:'EMA_BASELINE',contender,
        baselineTrades:base.tradeCount,contenderTrades:other.tradeCount,
        pairedDecisionCount:matched.length,
        pairedDeltaNetINR:matched.length
          ?round(matched.reduce((s,k)=>s+om.get(k)!-bm.get(k)!,0)):null,
        missingPairCount:base.tradeCount+other.tradeCount-2*matched.length,
        comparisonIsTradeMatched:matched.length>0 &&
          matched.length===base.tradeCount && matched.length===other.tradeCount,
        sufficientPairedSample:sufficient
      });
    }
  }
  return output;
}

export function runAdaptiveWalkForwardStudy(raw:unknown):AdaptiveWalkForwardStudy {
  const ingestion=ingestVendorHistoricalBundle(raw);
  const {input,...audit}=ingestion;
  const base:AdaptiveWalkForwardStudy={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    sourceAuthenticityIndependentlyVerified:false,empiricalProfitabilityProven:false,
    status:'REJECTED',errors:[...ingestion.errors],ingestion:audit,
    scenarios:SCENARIOS,foldWindows:[],results:[],pairedOutOfSample:[],
    report:null,marketRegimeAudit:null,
    warnings:['SYNTHETIC_FIXTURES_CANNOT_ESTABLISH_MARKET_PERFORMANCE',
      'SOURCE_EVENT_TIME_ATTESTATION_REQUIRES_INDEPENDENT_REVIEW',
      'L1_DEPTH_DOES_NOT_GUARANTEE_FILL_OR_PROTECT_OVERNIGHT_GAPS',
      'BASELINE_IS_NEAREST_RANKER_SCREENED_CONTRACT_NOT_FULL_LEGACY_EMA_EXECUTION']
  };
  if(!input)return base;
  const checks=SCENARIOS.map(s=>compareAdaptiveHistorical(scenarioInput(input,s)));
  if(checks.some(q=>q.status==='INVALID_DATASET')){
    return {...base,errors:[...new Set(checks.flatMap(r=>r.errors))]};
  }
  const report=checks[0];
  const cells:StressCell[]=[];
  checks.forEach((r,scenarioIndex)=>{
    r.folds.forEach((f,foldIndex)=>{
      f.outOfSample.forEach(m=>{
        cells.push({
          scenario:SCENARIOS[scenarioIndex],foldIndex,
          arm:m.arm,horizon:m.horizon,tradeCount:m.tradeCount,
          netPnlINR:m.netPnlINR,expectancyINR:m.expectancyINR,
          maxDrawdownINR:m.maxDrawdownINR,
          grossTurnoverINR:m.grossTurnoverINR,
          unpricedEntries:m.unpricedEntries,unpricedExits:m.unpricedExits,
          comparable:m.comparable
        });
      });
    });
  });
  const pairs=report.folds.flatMap((_,i)=>pairFold(i,metrics(report,i)));
  return{
    ...base,report,
    foldWindows:report.folds.map(f=>({
      ...f.window,trainingSessions:f.trainingSessions,testingSessions:f.testingSessions
    })),
    pairedOutOfSample:pairs,results:cells,errors:[],
    marketRegimeAudit:auditAdaptiveOosMarketRegimes(input,report),
    // Even if a vendor claims all data, never produce PASS/PROFITABLE.
    status:checks.every(x=>x.status==='DESCRIPTIVE_ONLY')
      ?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE'
  };
}
