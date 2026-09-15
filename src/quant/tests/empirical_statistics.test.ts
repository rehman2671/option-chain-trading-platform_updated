/**
 * Tests for Real Computed Empirical Statistics & Cold-Start Behavior
 * Verifies Prompt 5 requirements:
 * 1. CalibrationEngine calculates real Brier score and bins from actual recorded probabilities & outcomes.
 * 2. CalibrationEngine handles cold-start explicitly (< 20 samples) with INSUFFICIENT_DATA.
 * 3. TournamentEngine replaces static hardcoded values with real empirical edge lookups & handles cold start (< 3 samples).
 * 4. ContinuousResearchEngine groups by regime dynamically and computes real trade counts, net PnL, and win rates.
 * 5. Database forecast entries persistence works with DecisionEngine.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../../server/db.js';
import { calibrationEngine } from '../learning/calibrationEngine.js';
import { tournamentEngine } from '../decision/tournamentEngine.js';
import { continuousResearchEngine } from '../learning/continuousResearch.js';
import { decisionEngine } from '../decision/decisionEngine.js';
import {
  TradeReviewRecord,
  MarketRegimeState,
  QuantFeatureSnapshot,
  DataQualityReport,
  MarketRegimeType
} from '../types.js';

function makeReview(params: Partial<TradeReviewRecord> & {
  tradeId: string;
  strategyName: string;
  netPnl: number;
  regimeAtEntry: MarketRegimeType;
  thesisWasCorrect: boolean;
}): TradeReviewRecord {
  return {
    symbol: 'NIFTY',
    strategyVersion: 1,
    entryTime: new Date(Date.now() - 3600000).toISOString(),
    exitTime: new Date().toISOString(),
    entryThesis: 'Empirical test thesis',
    exitReason: 'Target or stop',
    grossPnl: params.netPnl + 20,
    slippageIncurred: 20,
    maxFavorableExcursionR: params.maxFavorableExcursionR ?? 1.5,
    maxAdverseExcursionR: params.maxAdverseExcursionR ?? -0.5,
    timingWasOptimal: params.thesisWasCorrect,
    strikeSelectionWasOptimal: true,
    lessonsLearned: 'None',
    predictedProbAtEntry: params.predictedProbAtEntry ?? 0.65,
    ...params
  };
}

const mockRegime: MarketRegimeState = {
  underlying: 'NIFTY',
  asOf: new Date().toISOString(),
  primaryRegime: 'TREND_UP',
  secondaryRegime: 'TREND_UP',
  volatilityRegime: 'LOW_COMPRESSION',
  gammaRegime: 'POSITIVE_GAMMA',
  confidence: 0.85,
  estimated: false,
  dataQuality: 'OK',
  rationale: 'Positive momentum aligned with dealer gamma.',
  keyLevels: {
    support: 24000,
    resistance: 24500,
    callWall: 24500,
    putWall: 24000,
    gammaFlip: 24100,
    expectedMove: 120
  }
};

const mockFeatures: QuantFeatureSnapshot = {
  timestamp: new Date().toISOString(),
  underlying: 'NIFTY',
  spotPrice: 24200,
  returns1m: 0.001,
  returns5m: 0.003,
  returns15m: 0.005,
  returns1h: 0.008,
  distVwapPct: 0.2,
  distEma20Pct: 0.3,
  distEma50Pct: 0.5,
  atr: 45,
  atrPercentile: 50,
  rsi14: 58,
  adx14: 26,
  pcrOi: 1.15,
  pcrVolume: 1.08,
  atmIv: 14.5,
  ivRank: 32,
  ivPercentile: 30,
  ivSkew: 1.2,
  totalCallOi: 15000000,
  totalPutOi: 17250000,
  callOiChange: 500000,
  putOiChange: 800000,
  callWallStrike: 24500,
  putWallStrike: 24000,
  estimatedNetGamma: 1200000,
  gammaFlipStrike: 24100,
  marketStructure: 'HH_HL'
};

const mockQuality: DataQualityReport = {
  score: 100,
  status: 'OK',
  latencyMs: 40,
  checks: {
    priceFreshness: true,
    spreadAcceptable: true,
    oiConsistency: true,
    greeksComputed: true,
    bidAskOrderValid: true
  },
  warnings: []
};

describe('Empirical Statistics & Cold-Start Tests (Section 50, 71 & 74)', () => {
  before(async () => {
    await dbEngine.initialize();
  });

  describe('1. Calibration Engine (Brier Score & Binning)', () => {
    it('handles cold-start correctly when fewer than 20 trade reviews exist', () => {
      // 2 reviews only
      const mockReviews: TradeReviewRecord[] = [
        makeReview({
          tradeId: 't1',
          strategyName: 'Bull Call Spread',
          netPnl: 1200,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: true,
          predictedProbAtEntry: 0.65,
          maxFavorableExcursionR: 1.5,
          maxAdverseExcursionR: -0.5
        }),
        makeReview({
          tradeId: 't2',
          strategyName: 'Bull Call Spread',
          netPnl: -800,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: false,
          predictedProbAtEntry: 0.68,
          maxFavorableExcursionR: 0.3,
          maxAdverseExcursionR: -1.0
        })
      ];

      const report = calibrationEngine.getCalibrationReport(mockReviews);

      assert.strictEqual(report.totalObservations, 2);
      assert.strictEqual(report.reliabilityStatus, 'INSUFFICIENT_DATA');
      assert.ok(report.recommendations[0].includes('Cold-start status'));
      assert.strictEqual(report.bins.length, 5);

      // Verify each bin has status INSUFFICIENT_DATA
      for (const bin of report.bins) {
        assert.strictEqual(bin.status, 'INSUFFICIENT_DATA');
      }

      // Check bin 60-70% has the 2 samples
      const bin60_70 = report.bins.find(b => b.binRange === '60% - 70%');
      assert.ok(bin60_70);
      assert.strictEqual(bin60_70.sampleCount, 2);
      assert.strictEqual(bin60_70.meanPredictedProbPct, 66.5);
      assert.strictEqual(bin60_70.realizedFrequencyPct, 50.0); // 1 win out of 2
    });

    it('computes real mathematical Brier score and calibration bins when >= 20 trades exist', () => {
      const mockReviews: TradeReviewRecord[] = [];

      // Generate 25 trades with known predicted probabilities and outcomes
      // 10 in 60-70% bin with 6 wins (60% realized) -> well calibrated
      for (let i = 0; i < 10; i++) {
        const isWin = i < 6;
        mockReviews.push(
          makeReview({
            tradeId: `test_c_${i}`,
            strategyName: 'Iron Condor',
            netPnl: isWin ? 1500 : -1000,
            regimeAtEntry: 'RANGE',
            thesisWasCorrect: isWin,
            predictedProbAtEntry: 0.64,
            maxFavorableExcursionR: isWin ? 1.2 : 0.2,
            maxAdverseExcursionR: isWin ? -0.3 : -1.0
          })
        );
      }

      // 15 in 70-80% bin with 11 wins (73.3% realized)
      for (let i = 10; i < 25; i++) {
        const isWin = i < 21; // 11 wins (indices 10..20) out of 15
        mockReviews.push(
          makeReview({
            tradeId: `test_c_${i}`,
            strategyName: 'Bull Call Spread',
            netPnl: isWin ? 2000 : -1200,
            regimeAtEntry: 'TREND_UP',
            thesisWasCorrect: isWin,
            predictedProbAtEntry: 0.74,
            maxFavorableExcursionR: isWin ? 1.8 : 0.4,
            maxAdverseExcursionR: isWin ? -0.2 : -1.0
          })
        );
      }

      const report = calibrationEngine.getCalibrationReport(mockReviews);

      assert.strictEqual(report.totalObservations, 25);
      assert.notStrictEqual(report.reliabilityStatus, 'INSUFFICIENT_DATA');
      assert.ok(['EXCELLENT', 'ACCEPTABLE'].includes(report.reliabilityStatus));
      assert.ok(report.overallBrierScore > 0 && report.overallBrierScore < 0.30);

      // Verify Brier score calculation manually
      const expectedBrierSum =
        6 * Math.pow(0.64 - 1, 2) +
        4 * Math.pow(0.64 - 0, 2) +
        11 * Math.pow(0.74 - 1, 2) +
        4 * Math.pow(0.74 - 0, 2);
      const expectedBrier = Number((expectedBrierSum / 25).toFixed(3));
      assert.strictEqual(report.overallBrierScore, expectedBrier);

      // Verify 60-70% bin
      const bin60_70 = report.bins.find(b => b.binRange === '60% - 70%');
      assert.ok(bin60_70);
      assert.strictEqual(bin60_70.sampleCount, 10);
      assert.strictEqual(bin60_70.meanPredictedProbPct, 64.0);
      assert.strictEqual(bin60_70.realizedFrequencyPct, 60.0);
      assert.strictEqual(bin60_70.calibrationErrorPct, 4.0);
      assert.strictEqual(bin60_70.status, 'CALIBRATED');

      // Verify 70-80% bin
      const bin70_80 = report.bins.find(b => b.binRange === '70% - 80%');
      assert.ok(bin70_80);
      assert.strictEqual(bin70_80.sampleCount, 15);
      assert.strictEqual(bin70_80.meanPredictedProbPct, 74.0);
      assert.strictEqual(bin70_80.realizedFrequencyPct, 73.3);
      assert.strictEqual(bin70_80.calibrationErrorPct, 0.7);
      assert.strictEqual(bin70_80.status, 'CALIBRATED');
    });
  });

  describe('2. Tournament Engine (Historical Edge & Empirical Validation)', () => {
    it('falls back to neutral prior with isEmpiricallyValidated=false when strategy has 0 or < 3 trades', () => {
      // Empty trade reviews
      const emptyReviews: TradeReviewRecord[] = [];
      const tournament = tournamentEngine.runTournament(mockRegime, mockFeatures, emptyReviews);

      assert.ok(tournament.length > 0);
      for (const entry of tournament) {
        assert.strictEqual(entry.isEmpiricallyValidated, false);
        assert.strictEqual(entry.sampleSize, 0);
        assert.strictEqual(entry.historicalProbPct, 50);
        assert.strictEqual(entry.expectedValue, '+0.00R');
        assert.ok(entry.sampleSizeWarning?.includes('No historical trades on record'));
      }
    });

    it('computes real win rate and R-multiple expectancy when strategy has >= 3 trades', () => {
      // 4 trades for Bull Call Spread: 3 wins (average 1.5R), 1 loss (-1.0R)
      // Net average R = (1.5 + 1.5 + 1.5 - 1.0) / 4 = 3.5 / 4 = +0.88R
      // Win rate = 3 / 4 = 75%
      const reviews: TradeReviewRecord[] = [
        makeReview({
          tradeId: 't1',
          strategyName: 'Bull Call Spread',
          netPnl: 3000,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: true,
          predictedProbAtEntry: 0.7,
          maxFavorableExcursionR: 1.5,
          maxAdverseExcursionR: -0.2
        }),
        makeReview({
          tradeId: 't2',
          strategyName: 'Bull Call Spread',
          netPnl: 2800,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: true,
          predictedProbAtEntry: 0.72,
          maxFavorableExcursionR: 1.5,
          maxAdverseExcursionR: -0.3
        }),
        makeReview({
          tradeId: 't3',
          strategyName: 'Bull Call Spread',
          netPnl: 3200,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: true,
          predictedProbAtEntry: 0.68,
          maxFavorableExcursionR: 1.5,
          maxAdverseExcursionR: -0.1
        }),
        makeReview({
          tradeId: 't4',
          strategyName: 'Bull Call Spread',
          netPnl: -1500,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: false,
          predictedProbAtEntry: 0.7,
          maxFavorableExcursionR: 0.2,
          maxAdverseExcursionR: -1.0
        })
      ];

      const tournament = tournamentEngine.runTournament(mockRegime, mockFeatures, reviews);
      const bullCall = tournament.find(e => e.strategyId.includes('bull-call-spread'));

      assert.ok(bullCall, 'Bull Call Spread must be present');
      assert.strictEqual(bullCall.isEmpiricallyValidated, true);
      assert.strictEqual(bullCall.sampleSize, 4);
      assert.strictEqual(bullCall.historicalProbPct, 75); // 3 wins out of 4 = 75%
      assert.strictEqual(bullCall.expectedValue, '+0.88R');
      assert.strictEqual(bullCall.sampleSizeWarning, undefined);
    });
  });

  describe('3. Continuous Research Engine (Dynamic Regime Grouping)', () => {
    it('aggregates real reviews by regimeAtEntry dynamically without division by zero', () => {
      const mockReviews: TradeReviewRecord[] = [
        makeReview({
          tradeId: 'r1',
          strategyName: 'Bull Call Spread',
          netPnl: 2500,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: true,
          predictedProbAtEntry: 0.7,
          maxFavorableExcursionR: 1.5,
          maxAdverseExcursionR: -0.3
        }),
        makeReview({
          tradeId: 'r2',
          strategyName: 'Bull Call Spread',
          netPnl: -1000,
          regimeAtEntry: 'TREND_UP',
          thesisWasCorrect: false,
          predictedProbAtEntry: 0.65,
          maxFavorableExcursionR: 0.2,
          maxAdverseExcursionR: -1.0
        }),
        makeReview({
          tradeId: 'r3',
          strategyName: 'Iron Condor',
          netPnl: 1800,
          regimeAtEntry: 'RANGE',
          thesisWasCorrect: true,
          predictedProbAtEntry: 0.75,
          maxFavorableExcursionR: 1.0,
          maxAdverseExcursionR: -0.2
        })
      ];

      const summary = continuousResearchEngine.runPostMarketCycle({
        triggerSource: 'MANUAL',
        force: true,
        reviewsOverride: mockReviews
      });

      assert.strictEqual(summary.tradesAnalyzedCount, 3);
      assert.strictEqual(summary.totalNetPnlReviewed, 3300); // 2500 - 1000 + 1800 = 3300
      assert.strictEqual(summary.winRateRealizedPct, 66.7); // 2 wins out of 3 = 66.7%

      // TREND_UP regime check
      const trendUpStat = summary.regimePerformanceSummary['TREND_UP'];
      assert.ok(trendUpStat);
      assert.strictEqual(trendUpStat.tradeCount, 2);
      assert.strictEqual(trendUpStat.netPnl, 1500); // 2500 - 1000 = 1500
      assert.strictEqual(trendUpStat.winRatePct, 50.0); // 1 win out of 2 = 50.0%
      assert.strictEqual(trendUpStat.sampleSizeWarning, true);

      // RANGE regime check
      const rangeStat = summary.regimePerformanceSummary['RANGE'];
      assert.ok(rangeStat);
      assert.strictEqual(rangeStat.tradeCount, 1);
      assert.strictEqual(rangeStat.netPnl, 1800);
      assert.strictEqual(rangeStat.winRatePct, 100.0);
      assert.strictEqual(rangeStat.sampleSizeWarning, true);

      // Overall sample size note present because 3 < 20
      assert.ok(summary.sampleSizeWarning?.includes('Low overall sample size'));
    });

    it('handles zero reviews cleanly with INSUFFICIENT_DATA and zero division protection', () => {
      const summary = continuousResearchEngine.runPostMarketCycle({
        triggerSource: 'MANUAL',
        force: true,
        reviewsOverride: []
      });

      assert.strictEqual(summary.tradesAnalyzedCount, 0);
      assert.strictEqual(summary.totalNetPnlReviewed, 0);
      assert.strictEqual(summary.winRateRealizedPct, 0);
      assert.strictEqual(summary.status, 'INSUFFICIENT_DATA');
      assert.ok(summary.sampleSizeWarning?.includes('Zero trade reviews'));

      // Verify standard regimes exist with 0 counts and notes
      assert.ok(summary.regimePerformanceSummary['RANGE']);
      assert.strictEqual(summary.regimePerformanceSummary['RANGE'].tradeCount, 0);
      assert.strictEqual(summary.regimePerformanceSummary['RANGE'].winRatePct, 0);
      assert.strictEqual(summary.regimePerformanceSummary['RANGE'].sampleSizeWarning, true);
    });
  });

  describe('4. Forecast Persistence Integration', () => {
    it('persists and retrieves forecast entries via dbEngine', () => {
      const testId = `DEC-${Date.now()}`;
      dbEngine.saveForecastEntry({
        decisionId: testId,
        strategyId: 'STRAT_TEST_01',
        strategyName: 'Bull Call Spread Test',
        symbol: 'NIFTY 24200 CE',
        regime: 'TREND_UP',
        predictedProb: 0.68,
        expectedValueR: 0.45
      });

      const forecasts = dbEngine.getForecastEntries(10);
      const match = forecasts.find(f => f.decisionId === testId);
      assert.ok(match, 'Forecast entry must be found in SQLite');
      assert.strictEqual(match.strategyName, 'Bull Call Spread Test');
      assert.strictEqual(match.predictedProb, 0.68);
      assert.strictEqual(match.expectedValueR, 0.45);
    });

    it('verifies DecisionEngine.decide persists a forecast entry at trade decision time', () => {
      const decision = decisionEngine.decide('NIFTY', mockRegime, mockFeatures, mockQuality);
      assert.ok(decision);
      assert.ok(decision.decisionId);

      // Check that forecast was stored
      const forecasts = dbEngine.getForecastEntries(10);
      const storedForecast = forecasts.find(f => f.decisionId === decision.decisionId);
      assert.ok(storedForecast, 'DecisionEngine must persist forecast entry to quant_forecast_entries');
      assert.strictEqual(storedForecast.strategyId, decision.strategy.id);
    });
  });
});
