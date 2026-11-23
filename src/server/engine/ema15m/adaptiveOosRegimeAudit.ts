/**
 * Offline descriptive OOS context: is the research policy only finding
 * trades in trending, sideways, volatile or transitioning index conditions?
 *
 * Regimes are derived strictly from decision-time CLOSED index candles.
 * Does NOT infer missing trade PnL, assign causal benefit, optimize parameters
 * using OOS data, or authorize execution.
 */
import { analyzeAdaptiveRegime, type AdaptiveRegime } from './adaptiveMarketRegime.js';
import type {
  HistoricalArm, HistoricalArmMetrics, HistoricalComparisonInput,
  HistoricalComparisonReport
} from './historicalAdaptiveComparison.js';
import type { HorizonBucket } from './adaptiveOptionRanker.js';

const ARM_NAMES: HistoricalArm[] = ['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const HORIZONS: HorizonBucket[] = ['1W','2W','4W','8W'];
const round = (n:number)=>Number(n.toFixed(2));
export interface OosMarketRegimeCell {
  foldIndex: number;
  regime: AdaptiveRegime;
  arm: HistoricalArm;
  horizon: HorizonBucket;
  observedDecisionSessions: number;
  executedTrades: number;
  netPnlINR: number | null;
  avgPnlPerClosedTradeINR: number | null;
  /** Missing executions are never assigned zero or classified as a win. */
  adequateSampleForDescriptiveUse: boolean;
  /** Stronger status is impossible without independent data/operational review. */
  productionSafe: false;
}
export interface OosRegimeAudit {
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  causalEffectEstablished: false;
  sourceAuthenticityVerified: false;
  cells: OosMarketRegimeCell[];
  warnings: string[];
}
export function auditAdaptiveOosMarketRegimes(
  input: HistoricalComparisonInput,
  report: HistoricalComparisonReport
): OosRegimeAudit {
  const cells: OosMarketRegimeCell[] = [];
  if (report.status === 'INVALID_DATASET') return {
    mode:'RESEARCH_ONLY',executionAuthorized:false,causalEffectEstablished:false,
    sourceAuthenticityVerified:false,cells:[],
    warnings:['INVALID_DATASET_NO_OOS_REGIME_EVALUATION']
  };
  report.folds.forEach((fold, foldIndex)=>{
    const byDecision=new Map<string,AdaptiveRegime>();
    for(const d of input.decisions){
      if(d.sessionDate<fold.window.testStart || d.sessionDate>fold.window.testEnd) continue;
      byDecision.set(d.decisionAt,
        analyzeAdaptiveRegime(d.candles,new Date(d.decisionAt)).regime);
    }
    const seenRegimes=[...new Set(byDecision.values())].sort();
    const m=new Map<string,HistoricalArmMetrics>();
    for(const row of fold.outOfSample) m.set(row.arm+':'+row.horizon,row);
    for(const regime of seenRegimes){
      const dates=[...byDecision].filter(([_,r])=>r===regime).map(([date])=>date);
      const original=new Set(dates);
      for(const arm of ARM_NAMES)for(const horizon of HORIZONS){
        const metric=m.get(arm+':'+horizon);
        const trades=metric?.trades.filter(t=>original.has(t.decisionAt)) ?? [];
        const net=trades.length?round(trades.reduce((v,t)=>v+t.netPnlINR,0)):null;
        cells.push({
          foldIndex,regime,arm,horizon,observedDecisionSessions:dates.length,
          executedTrades:trades.length,netPnlINR:net,
          avgPnlPerClosedTradeINR:net===null?null:round(net/trades.length),
          adequateSampleForDescriptiveUse:trades.length>=20 &&
            metric?.comparable===true,
          productionSafe:false
        });
      }
    }
  });
  return {
    mode:'RESEARCH_ONLY',executionAuthorized:false,
    causalEffectEstablished:false,sourceAuthenticityVerified:false,cells,
    warnings:[
      'REGIME_CELLS_INCLUDE_ONLY_CLOSED_PRICED_TRADES',
      'UNPRICED_ENTRY_EXIT_COUNTS_ARE_REPORTED_IN_BASE_FOLD_METRICS',
      'LOW_SAMPLE_CELLS_CANNOT_SUPPORT_MARKET_REGIME_EDGE_CLAIMS',
      'NO_COMPARATIVE_CAUSAL_INFERENCE_OR_PARAM_OPTIMIZATION'
    ]
  };
}
