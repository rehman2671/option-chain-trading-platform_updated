/**
 * Strategy Tournament Engine
 * Ranks candidate strategies in real-time according to current Market Regime,
 * empirical statistical expectancy from trade reviews, liquidity, risk-reward, and out-of-sample robustness.
 */

import { StrategyTournamentEntry, MarketRegimeState, QuantFeatureSnapshot, TradeReviewRecord } from '../types.js';
import { CANONICAL_STRATEGIES } from '../strategies/strategyLibrary.js';
import { tradeReviewEngine } from '../learning/tradeReviewEngine.js';

export const MIN_STRATEGY_SAMPLE_COUNT = 3;

function matchesStrategy(tradeStrategyName: string, canonicalStrat: { id: string; name: string }): boolean {
  if (!tradeStrategyName) return false;
  const t = tradeStrategyName.toLowerCase();
  const cName = canonicalStrat.name.toLowerCase();
  const cId = canonicalStrat.id.toLowerCase();

  if (t === cName || t === cId) return true;
  if (cId.includes('bull-call') && (t.includes('bull call') || t.includes('bull-call') || t.includes('bull_call'))) return true;
  if (cId.includes('bear-put') && (t.includes('bear put') || t.includes('bear-put') || t.includes('bear_put'))) return true;
  if (cId.includes('iron-condor') && (t.includes('iron condor') || t.includes('iron-condor') || t.includes('iron_condor'))) return true;
  if (cId.includes('long-straddle') && (t.includes('straddle') || t.includes('long straddle'))) return true;
  if (cId.includes('gamma') && (t.includes('gamma') || t.includes('adaptive'))) return true;
  if (cId.includes('short-strangle') && (t.includes('strangle') || t.includes('short strangle'))) return true;
  return false;
}

export class TournamentEngine {
  private static instance: TournamentEngine;

  private constructor() {}

  public static getInstance(): TournamentEngine {
    if (!TournamentEngine.instance) {
      TournamentEngine.instance = new TournamentEngine();
    }
    return TournamentEngine.instance;
  }

  public runTournament(
    regime: MarketRegimeState,
    features: QuantFeatureSnapshot,
    reviewsOverride?: TradeReviewRecord[]
  ): StrategyTournamentEntry[] {
    const entries: StrategyTournamentEntry[] = [];
    const reviews = reviewsOverride || tradeReviewEngine.getReviews();

    for (const strat of CANONICAL_STRATEGIES) {
      let regimeFitScore = 40;
      if (strat.targetRegimes.includes(regime.primaryRegime)) {
        regimeFitScore = 95;
      } else if (strat.targetRegimes.includes(regime.secondaryRegime)) {
        regimeFitScore = 75;
      }

      const liquidityScore = features.spotPrice > 0 ? 90 : 80;

      // Query actual empirical performance for this strategy
      const stratReviews = reviews.filter(r => matchesStrategy(r.strategyName, strat));
      const regimeReviews = stratReviews.filter(r => r.regimeAtEntry === regime.primaryRegime);
      const relevantReviews = regimeReviews.length >= MIN_STRATEGY_SAMPLE_COUNT ? regimeReviews : stratReviews;
      const sampleCount = relevantReviews.length;

      let historicalProbPct: number;
      let expectedValue: string;
      let historicalEdgeScore: number;
      let robustnessScore: number;
      let riskRewardScore: number;
      let isEmpiricallyValidated: boolean;
      let sampleSizeWarning: string | undefined;

      if (sampleCount < MIN_STRATEGY_SAMPLE_COUNT) {
        // Cold-start fallback: neutral baseline prior
        historicalProbPct = 50;
        expectedValue = '+0.00R';
        historicalEdgeScore = 50;
        robustnessScore = 50;
        riskRewardScore = 50;
        isEmpiricallyValidated = false;
        sampleSizeWarning = sampleCount === 0
          ? 'No historical trades on record (neutral baseline score applied)'
          : `Insufficient sample size (n=${sampleCount} / ${MIN_STRATEGY_SAMPLE_COUNT} required)`;
      } else {
        // Real computation from actual closed trades
        const wins = relevantReviews.filter(r => r.netPnl > 0 || r.thesisWasCorrect).length;
        historicalProbPct = Math.round((wins / sampleCount) * 100);

        const avgR = relevantReviews.reduce((sum, r) => {
          const rVal = r.netPnl > 0
            ? (r.maxFavorableExcursionR !== undefined ? r.maxFavorableExcursionR : 1.0)
            : (r.maxAdverseExcursionR !== undefined ? r.maxAdverseExcursionR : -1.0);
          return sum + rVal;
        }, 0) / sampleCount;

        expectedValue = `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R`;
        historicalEdgeScore = Math.min(99, Math.max(10, Math.round(historicalProbPct * 0.7 + (avgR + 1.0) * 15)));
        robustnessScore = Math.min(98, Math.max(40, Math.round(50 + Math.min(30, sampleCount * 2) + (historicalProbPct >= 60 ? 15 : 0))));
        riskRewardScore = Math.min(98, Math.max(30, Math.round(50 + avgR * 25)));
        isEmpiricallyValidated = true;
      }

      // Tournament weighted score
      const totalScore = Math.round(
        regimeFitScore * 0.35 +
        historicalEdgeScore * 0.25 +
        robustnessScore * 0.15 +
        liquidityScore * 0.10 +
        riskRewardScore * 0.15
      );

      const recommendation: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID' =
        totalScore >= 85 ? 'STRONG_BUY' : totalScore >= 70 ? 'BUY' : totalScore >= 50 ? 'WATCH' : 'AVOID';

      entries.push({
        rank: 0,
        strategyId: strat.id,
        name: strat.name,
        family: strat.family,
        score: totalScore,
        regimeFitScore,
        historicalEdgeScore,
        robustnessScore,
        liquidityScore,
        riskRewardScore,
        expectedValue,
        historicalProbPct,
        recommendation,
        structureDesc: strat.description,
        sampleSize: sampleCount,
        isEmpiricallyValidated,
        sampleSizeWarning
      });
    }

    // Sort by tournament score descending and assign ranks
    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, idx) => {
      e.rank = idx + 1;
    });

    return entries;
  }
}

export const tournamentEngine = TournamentEngine.getInstance();
