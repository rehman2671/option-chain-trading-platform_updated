/**
 * Quant Intelligence Unit Tests (Section 88 & Part B10)
 * Tests Greeks, IV, Feature extraction, Regimes, Strike/Expiry optimization,
 * Position Sizing, Quality Gates, and Parameter Stability.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { strikeSelectionEngine } from '../decision/strikeSelectionEngine.js';
import { expirySelectionEngine } from '../decision/expirySelectionEngine.js';
import { positionSizingEngine } from '../decision/positionSizingEngine.js';
import { qualityGatesEngine } from '../research/qualityGatesEngine.js';
import { parameterStabilityEngine } from '../research/parameterStabilityEngine.js';
import { timeOfDayEngine } from '../research/timeOfDayEngine.js';
import { quantConfigRegistry } from '../config/quantConfig.js';
import { noTradeEngine } from '../decision/noTradeEngine.js';
import { QuantFeatureSnapshot, MarketRegimeState } from '../types.js';

describe('1. Strike Selection Engine (Section 25)', () => {
  it('correctly calculates ATM strike and interval step for NIFTY', () => {
    const step = strikeSelectionEngine.getStrikeStep('NIFTY');
    assert.strictEqual(step, 50);

    const mockFeatures: Partial<QuantFeatureSnapshot> = {
      atmIv: 14.5,
      callWallStrike: 24200,
      putWallStrike: 23800
    };
    const mockRegime: Partial<MarketRegimeState> = {
      primaryRegime: 'TREND_UP',
      keyLevels: { support: 23800, resistance: 24200, callWall: 24200, putWall: 23800, gammaFlip: 24000, expectedMove: 180 }
    };

    const result = strikeSelectionEngine.optimizeStrikes(
      'NIFTY',
      24018,
      'strat_bull_call_spread',
      mockFeatures as any,
      mockRegime as any
    );

    assert.strictEqual(result.atmStrike, 24000);
    assert.strictEqual(result.selectedLegs.length, 2);
    assert.strictEqual(result.selectedLegs[0].action, 'BUY');
    assert.strictEqual(result.selectedLegs[0].type, 'CE');
    assert.strictEqual(result.selectedLegs[1].action, 'SELL');
    assert.strictEqual(result.selectedLegs[1].type, 'CE');
  });

  it('correctly uses 100 pt strike steps for BANKNIFTY', () => {
    const step = strikeSelectionEngine.getStrikeStep('BANKNIFTY');
    assert.strictEqual(step, 100);
  });
});

describe('2. Dynamic Expiry Selection Engine (Section 26)', () => {
  it('evaluates multiple expiries dynamically without hardcoding', () => {
    const mockFeatures: Partial<QuantFeatureSnapshot> = { atmIv: 15.0 };
    const mockRegime: Partial<MarketRegimeState> = { primaryRegime: 'RANGE', keyLevels: { expectedMove: 150 } as any };

    const result = expirySelectionEngine.evaluateExpiries(
      'NIFTY',
      24000,
      'SPREADS',
      mockFeatures as any,
      mockRegime as any
    );

    assert.ok(result.candidates.length >= 3);
    assert.ok(result.selectedProfile);
    assert.ok(result.selectedExpiryDate);
  });
});

describe('3. Position Sizing Engine (Section 27)', () => {
  it('prevents martingale and limits sizing to predefined risk budget', () => {
    const recommendation = positionSizingEngine.calculatePositionSize({
      underlying: 'NIFTY',
      accountCapital: 500000,
      availableMargin: 350000,
      strategyConfidence: 0.80,
      winRate: 0.65,
      profitFactor: 2.1,
      maxTradeRiskPct: 1.5, // max 7,500 INR risk
      currentDrawdownPct: 0,
      stopLossPoints: 40,
      targetPoints: 80,
      premiumPrice: 140
    });

    assert.ok(recommendation.recommendedLots > 0);
    assert.strictEqual(recommendation.lotSize, 25);
    // Capital at risk must not exceed risk budget
    assert.ok(recommendation.maxCapitalAtRiskINR <= 7500);
    assert.ok(recommendation.fractionalKellyFraction > 0);
  });

  it('dampens sizing by 50% when account is in 12% drawdown', () => {
    const recommendation = positionSizingEngine.calculatePositionSize({
      underlying: 'NIFTY',
      accountCapital: 500000,
      availableMargin: 350000,
      strategyConfidence: 0.80,
      winRate: 0.65,
      profitFactor: 2.1,
      maxTradeRiskPct: 1.5,
      currentDrawdownPct: 12.0, // in drawdown
      stopLossPoints: 40,
      targetPoints: 80,
      premiumPrice: 140
    });

    assert.strictEqual(recommendation.drawdownDampenerFactor, 0.5);
    assert.ok(recommendation.safetyWarnings.length > 0);
  });
});

describe('4. Research Quality Gates (Section 89 & Part B6)', () => {
  it('blocks promotion if sample size is insufficient or net pnl is negative', () => {
    const audit = qualityGatesEngine.evaluateStrategy('strat_test', 1, {
      sampleSize: 45, // below 100 required
      netPnlINR: -5000, // negative
      expectancyR: -0.1,
      maxDrawdownPct: 25.0,
      profitFactor: 0.9,
      sharpeRatio: 0.5,
      walkForwardWindowsPassed: 2,
      oosSharpeRatio: 0.4,
      monteCarloRuinProbPct: 5.0,
      parameterPlateauWidthPct: 40,
      dataQualityScore: 95
    });

    assert.strictEqual(audit.allGatesPassed, false);
    assert.strictEqual(audit.promotionAllowed, false);
    assert.ok(audit.rejectionReasons.length > 0);
  });

  it('approves strategy when all 11 quantitative validation gates pass', () => {
    const audit = qualityGatesEngine.evaluateStrategy('strat_robust', 1, {
      sampleSize: 180,
      netPnlINR: 85000,
      expectancyR: 0.45,
      maxDrawdownPct: 10.5,
      profitFactor: 1.95,
      sharpeRatio: 1.82,
      walkForwardWindowsPassed: 5,
      oosSharpeRatio: 1.55,
      monteCarloRuinProbPct: 0.05,
      parameterPlateauWidthPct: 85,
      dataQualityScore: 98
    });

    assert.strictEqual(audit.allGatesPassed, true);
    assert.strictEqual(audit.recommendedStatus, 'APPROVED');
    assert.strictEqual(audit.promotionAllowed, true);
  });
});

describe('5. Parameter Stability Engine (Section 46)', () => {
  it('detects robust parameter plateaus across neighborhoods', () => {
    const report = parameterStabilityEngine.testParameterNeighborhood(
      'strat_bull_call',
      'RSI_Threshold',
      58,
      1,
      2
    );

    assert.strictEqual(report.perturbations.length, 5);
    assert.ok(report.plateauWidthPct > 0);
    assert.ok(report.stabilityVerdict);
  });
});

describe('6. Time-of-Day Research Engine (Section 37)', () => {
  it('evaluates all 8 Indian market intraday time windows', () => {
    const profile = timeOfDayEngine.analyzeStrategyTimeOfDay('strat_bull_call_spread', 'NIFTY');
    assert.strictEqual(profile.windows.length, 8);
    assert.ok(profile.optimalOperatingHours);
    assert.ok(profile.restrictedHours);
  });
});

describe('7. No-Trade Engine (Section 24)', () => {
  it('blocks trading safely when data quality fails or spread is excessive', () => {
    const check = noTradeEngine.evaluate(
      { primaryRegime: 'TREND_UP', confidence: 0.85 } as any,
      {} as any,
      { score: 40, status: 'DATA_INSUFFICIENT' } as any,
      true
    );

    assert.strictEqual(check.shouldBlock, true);
    assert.strictEqual(check.code, 'STALE_DATA');
    assert.strictEqual(check.safeDefaultApplied, true);
  });
});
