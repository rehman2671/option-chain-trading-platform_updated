/**
 * Continuous Research Loop (Section 51 & 69)
 * Executes the post-market feedback and autonomous hypothesis exploration pipeline:
 * Ingests daily data -> reviews winning & losing trades -> isolates regime performance ->
 * generates new testable hypotheses -> submits candidates to backtest validation queues.
 */

import { hypothesisEngine } from '../research/hypothesisEngine.js';
import { tradeReviewEngine } from './tradeReviewEngine.js';
import { quantAuditLogger } from '../audit/auditLogger.js';
import { strategyMutationEngine } from '../research/strategyMutation.js';
import { CANONICAL_STRATEGIES } from '../strategies/strategyLibrary.js';
import { dbEngine } from '../../server/db.js';
import { TradeReviewRecord } from '../types.js';

export interface RegimePerformanceStat {
  tradeCount: number;
  netPnl: number;
  winRatePct: number;
  sampleSizeWarning?: boolean;
  sampleSizeNote?: string;
}

export interface DailyResearchCycleSummary {
  cycleId: string;
  executionTimestamp: string;
  tradesAnalyzedCount: number;
  totalNetPnlReviewed: number;
  winRateRealizedPct: number;
  hypothesesGeneratedCount: number;
  topGeneratedHypotheses: string[];
  regimePerformanceSummary: Record<string, RegimePerformanceStat>;
  status: 'COMPLETED' | 'INSUFFICIENT_DATA';
  strategiesEvaluated?: string[];
  mutationsGeneratedCount?: number;
  durationMs?: number;
  triggerSource?: 'MANUAL' | 'SCHEDULED';
  sampleSizeWarning?: string;
}

export interface RunPostMarketCycleOptions {
  baseStrategyId?: string;
  strategyIds?: string[];
  triggerSource?: 'MANUAL' | 'SCHEDULED';
  force?: boolean;
  reviewsOverride?: TradeReviewRecord[];
}

export type AutonomousResearchReport = DailyResearchCycleSummary;

export class ContinuousResearchEngine {
  private static instance: ContinuousResearchEngine;

  private constructor() {}

  public static getInstance(): ContinuousResearchEngine {
    if (!ContinuousResearchEngine.instance) {
      ContinuousResearchEngine.instance = new ContinuousResearchEngine();
    }
    return ContinuousResearchEngine.instance;
  }

  /**
   * Executes the post-market continuous learning and research cycle.
   * Shared underlying implementation used by both the background scheduler and manual triggers.
   */
  public runPostMarketCycle(options?: RunPostMarketCycleOptions): DailyResearchCycleSummary {
    const startTime = Date.now();
    const cycleId = `CYCLE-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    // 1. Gather accumulated real trade reviews from SQLite/Memory
    const reviews = options?.reviewsOverride || tradeReviewEngine.getReviews();
    const tradeCount = reviews.length;
    const totalPnl = Number(reviews.reduce((acc, r) => acc + r.netPnl, 0).toFixed(2));
    const winningTrades = reviews.filter(r => r.netPnl > 0 || r.thesisWasCorrect).length;
    const winRate = tradeCount > 0 ? Number(((winningTrades / tradeCount) * 100).toFixed(1)) : 0;

    // 2. Aggregate empirical performance grouped by market regime
    const regimeStats: Record<string, RegimePerformanceStat> = {};
    if (reviews.length > 0) {
      for (const r of reviews) {
        const reg = (r.regimeAtEntry as string) || 'RANGE';
        if (!regimeStats[reg]) {
          regimeStats[reg] = { tradeCount: 0, netPnl: 0, winRatePct: 0 };
        }
        regimeStats[reg].tradeCount++;
        regimeStats[reg].netPnl = Number((regimeStats[reg].netPnl + r.netPnl).toFixed(2));
      }
      for (const reg of Object.keys(regimeStats)) {
        const stat = regimeStats[reg];
        const winCount = reviews.filter(
          r => ((r.regimeAtEntry as string) || 'RANGE') === reg && (r.netPnl > 0 || r.thesisWasCorrect)
        ).length;
        stat.winRatePct = stat.tradeCount > 0 ? Number(((winCount / stat.tradeCount) * 100).toFixed(1)) : 0;
        if (stat.tradeCount < 5) {
          stat.sampleSizeWarning = true;
          stat.sampleSizeNote = `Low sample size (${stat.tradeCount} trade${stat.tradeCount === 1 ? '' : 's'}); high statistical variance.`;
        }
      }
    } else {
      const defaultRegimes = ['RANGE', 'TREND_UP', 'TREND_DOWN', 'BREAKOUT'];
      for (const reg of defaultRegimes) {
        regimeStats[reg] = {
          tradeCount: 0,
          netPnl: 0,
          winRatePct: 0,
          sampleSizeWarning: true,
          sampleSizeNote: 'No historical trades recorded in this regime.'
        };
      }
    }

    let cycleSampleSizeWarning: string | undefined;
    if (tradeCount === 0) {
      cycleSampleSizeWarning = 'Zero trade reviews available. All regime metrics reflect unpopulated cold-start.';
    } else if (tradeCount < 20) {
      cycleSampleSizeWarning = `Low overall sample size (n=${tradeCount} / 20 required). Realized win rates reflect preliminary empirical data.`;
    }

    // 3. Evaluate Canonical Strategy Library & generate mutation variants
    // Looping over all CANONICAL_STRATEGIES ensures all active models participate in autonomous exploration
    const strategiesToEvaluate = (options?.strategyIds && options.strategyIds.length > 0)
      ? CANONICAL_STRATEGIES.filter(s => options.strategyIds!.includes(s.id))
      : CANONICAL_STRATEGIES;

    const evaluatedStrategyIds: string[] = [];
    let totalMutations = 0;
    for (const strategy of strategiesToEvaluate) {
      evaluatedStrategyIds.push(strategy.id);
      const mutations = strategyMutationEngine.generateMutations(strategy);
      totalMutations += mutations.length;
    }

    // 4. Autonomous hypothesis generation targeted to underperforming or prominent regimes
    const underperformingRegimes = Object.keys(regimeStats).filter(
      reg => regimeStats[reg].tradeCount > 0 && (regimeStats[reg].winRatePct < 50 || regimeStats[reg].netPnl < 0)
    );

    const targetRegime1 = underperformingRegimes[0] || 'RANGE';
    const targetRegime2 = underperformingRegimes[1] || (targetRegime1 === 'RANGE' ? 'TREND_UP' : 'RANGE');

    const newHypothesis1 = hypothesisEngine.generateHypothesis(
      'Tight consolidation range with declining ATM IV and positive Put-Call OI divergence',
      targetRegime1
    );
    const newHypothesis2 = hypothesisEngine.generateHypothesis(
      'Breakout accompanied by 15m EMA crossover and aggressive directional OI expansion',
      targetRegime2
    );

    const durationMs = Date.now() - startTime;

    const summary: DailyResearchCycleSummary = {
      cycleId,
      executionTimestamp: timestamp,
      tradesAnalyzedCount: tradeCount,
      totalNetPnlReviewed: totalPnl,
      winRateRealizedPct: winRate,
      hypothesesGeneratedCount: 2,
      topGeneratedHypotheses: [newHypothesis1.name, newHypothesis2.name],
      regimePerformanceSummary: regimeStats,
      status: tradeCount === 0 ? 'INSUFFICIENT_DATA' : 'COMPLETED',
      strategiesEvaluated: evaluatedStrategyIds,
      mutationsGeneratedCount: totalMutations,
      durationMs,
      triggerSource: options?.triggerSource || 'MANUAL',
      sampleSizeWarning: cycleSampleSizeWarning
    };

    // 5. Persist research cycle summary to SQLite WAL database
    try {
      dbEngine.saveQuantResearchCycle(summary);
    } catch (err: any) {
      console.error('[CONTINUOUS RESEARCH] Failed to persist research cycle to SQLite:', err.message);
    }

    // 6. Record audit log
    quantAuditLogger.log({
      actor: options?.triggerSource === 'SCHEDULED' ? 'quant_background_scheduler' : 'continuous_research_loop',
      action: 'DAILY_RESEARCH_CYCLE_COMPLETED',
      entityType: 'RESEARCH_CYCLE',
      entityId: cycleId,
      afterState: {
        tradeCount,
        totalPnl,
        winRate,
        strategiesEvaluatedCount: evaluatedStrategyIds.length,
        mutationsGeneratedCount: totalMutations,
        durationMs,
        triggerSource: options?.triggerSource || 'MANUAL',
        newHypotheses: [newHypothesis1.id, newHypothesis2.id]
      },
      reason: `Post-market autonomous analysis completed in ${durationMs}ms across ${evaluatedStrategyIds.length} strategies, generating 2 hypotheses and ${totalMutations} mutations.`
    });

    console.log(
      `[CONTINUOUS RESEARCH] Cycle ${cycleId} (${summary.triggerSource}) completed in ${durationMs}ms: ` +
      `${tradeCount} trades analyzed, ${evaluatedStrategyIds.length} strategies evaluated, ` +
      `${totalMutations} mutations generated, 2 hypotheses formulated.`
    );

    return summary;
  }
}

export const continuousResearchEngine = ContinuousResearchEngine.getInstance();
