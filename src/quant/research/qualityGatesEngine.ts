/**
 * Research Quality Gates Engine (Section 89 & Part B6)
 * Strictly enforces that no strategy can be promoted to PRODUCTION_READY
 * without passing all 11 quantitative validation gates.
 * Never promotes unvalidated strategies to live.
 */

import { quantConfigRegistry } from '../config/quantConfig.js';
import { StrategyStatus } from '../types.js';

export interface QualityGateCheck {
  gateId: string;
  name: string;
  requiredThreshold: string;
  actualValue: string | number;
  passed: boolean;
  critical: boolean;
  notes: string;
}

export interface StrategyGateAuditReport {
  strategyId: string;
  strategyVersion: number;
  currentStatus: StrategyStatus;
  recommendedStatus: StrategyStatus;
  allGatesPassed: boolean;
  passedGateCount: number;
  totalGateCount: number;
  passedPercentage: number;
  gates: QualityGateCheck[];
  promotionAllowed: boolean;
  rejectionReasons: string[];
}

export class QualityGatesEngine {
  /**
   * Evaluates a strategy against the 11 validation gates
   */
  public evaluateStrategy(
    strategyId: string,
    strategyVersion: number = 1,
    metrics: {
      sampleSize: number;
      netPnlINR: number;
      expectancyR: number;
      maxDrawdownPct: number;
      profitFactor: number;
      sharpeRatio: number;
      walkForwardWindowsPassed: number;
      oosSharpeRatio: number;
      monteCarloRuinProbPct: number;
      parameterPlateauWidthPct: number;
      dataQualityScore: number;
    }
  ): StrategyGateAuditReport {
    const config = quantConfigRegistry.getConfig();

    const gates: QualityGateCheck[] = [
      {
        gateId: 'GATE_01_SAMPLE_SIZE',
        name: 'Sample Size Adequacy',
        requiredThreshold: `>= ${config.minimumSampleSizeForValidation} trades`,
        actualValue: `${metrics.sampleSize} trades`,
        passed: metrics.sampleSize >= config.minimumSampleSizeForValidation,
        critical: true,
        notes: metrics.sampleSize >= config.minimumSampleSizeForValidation ? 'Sufficient sample size' : 'Sample too small to establish statistical significance'
      },
      {
        gateId: 'GATE_02_NET_PNL',
        name: 'Net Profitability After Costs',
        requiredThreshold: '> ₹0 net of brokerage, STT & slippage',
        actualValue: `₹${metrics.netPnlINR.toLocaleString()}`,
        passed: metrics.netPnlINR > 0,
        critical: true,
        notes: metrics.netPnlINR > 0 ? 'Profitable after full transaction friction' : 'Fails cost model'
      },
      {
        gateId: 'GATE_03_EXPECTANCY',
        name: 'Positive Mathematical Expectancy',
        requiredThreshold: '>= +0.20R per trade',
        actualValue: `+${metrics.expectancyR.toFixed(2)}R`,
        passed: metrics.expectancyR >= 0.20,
        critical: true,
        notes: metrics.expectancyR >= 0.20 ? 'Strong edge' : 'Sub-threshold edge'
      },
      {
        gateId: 'GATE_04_MAX_DRAWDOWN',
        name: 'Maximum Drawdown Limit',
        requiredThreshold: `<= ${config.maxAcceptableDrawdownPct}%`,
        actualValue: `${metrics.maxDrawdownPct.toFixed(1)}%`,
        passed: metrics.maxDrawdownPct <= config.maxAcceptableDrawdownPct,
        critical: true,
        notes: metrics.maxDrawdownPct <= config.maxAcceptableDrawdownPct ? 'Drawdown within risk limits' : 'Excessive drawdown risk'
      },
      {
        gateId: 'GATE_05_PROFIT_FACTOR',
        name: 'Minimum Profit Factor',
        requiredThreshold: `>= ${config.minProfitFactorForProductionReady}`,
        actualValue: metrics.profitFactor.toFixed(2),
        passed: metrics.profitFactor >= config.minProfitFactorForProductionReady,
        critical: false,
        notes: metrics.profitFactor >= config.minProfitFactorForProductionReady ? 'Adequate win/loss ratio' : 'Marginal profit factor'
      },
      {
        gateId: 'GATE_06_SHARPE_RATIO',
        name: 'Annualized Sharpe Ratio',
        requiredThreshold: `>= ${config.minSharpeForProductionReady}`,
        actualValue: metrics.sharpeRatio.toFixed(2),
        passed: metrics.sharpeRatio >= config.minSharpeForProductionReady,
        critical: false,
        notes: metrics.sharpeRatio >= config.minSharpeForProductionReady ? 'Good risk-adjusted return' : 'Sub-optimal Sharpe'
      },
      {
        gateId: 'GATE_07_WALK_FORWARD',
        name: 'Walk-Forward Rolling Windows',
        requiredThreshold: `>= ${config.minWalkForwardWindows} windows passed`,
        actualValue: `${metrics.walkForwardWindowsPassed} windows`,
        passed: metrics.walkForwardWindowsPassed >= config.minWalkForwardWindows,
        critical: true,
        notes: metrics.walkForwardWindowsPassed >= config.minWalkForwardWindows ? 'Survives rolling regimes' : 'Fails walk-forward verification'
      },
      {
        gateId: 'GATE_08_OOS_PERFORMANCE',
        name: 'Out-Of-Sample Validation (OOS)',
        requiredThreshold: 'Sharpe >= 1.0 on untouched test partition',
        actualValue: metrics.oosSharpeRatio.toFixed(2),
        passed: metrics.oosSharpeRatio >= 1.0,
        critical: true,
        notes: metrics.oosSharpeRatio >= 1.0 ? 'Preserves edge out of sample' : 'Overfit suspected'
      },
      {
        gateId: 'GATE_09_MONTE_CARLO',
        name: 'Monte Carlo Ruin Probability',
        requiredThreshold: '< 1.0% ruin risk (2000 runs)',
        actualValue: `${metrics.monteCarloRuinProbPct.toFixed(2)}%`,
        passed: metrics.monteCarloRuinProbPct < 1.0,
        critical: true,
        notes: metrics.monteCarloRuinProbPct < 1.0 ? 'Robust capital preservation' : 'Tail risk too high'
      },
      {
        gateId: 'GATE_10_PARAMETER_STABILITY',
        name: 'Parameter Stability Plateau',
        requiredThreshold: '>= 70% plateau width',
        actualValue: `${metrics.parameterPlateauWidthPct}%`,
        passed: metrics.parameterPlateauWidthPct >= 70,
        critical: false,
        notes: metrics.parameterPlateauWidthPct >= 70 ? 'Wide parameter plateau' : 'Fragile cliff-edge parameter'
      },
      {
        gateId: 'GATE_11_DATA_QUALITY',
        name: 'Historical Data Quality Score',
        requiredThreshold: '>= 90/100',
        actualValue: `${metrics.dataQualityScore}/100`,
        passed: metrics.dataQualityScore >= 90,
        critical: true,
        notes: metrics.dataQualityScore >= 90 ? 'High fidelity tick data' : 'Data contains gaps or anomalies'
      }
    ];

    const passedCount = gates.filter(g => g.passed).length;
    const criticalPassed = gates.filter(g => g.critical).every(g => g.passed);
    const allPassed = passedCount === gates.length;
    const passedPct = Math.round((passedCount / gates.length) * 100);

    const rejectionReasons = gates.filter(g => !g.passed).map(g => `${g.name}: ${g.notes} (Actual: ${g.actualValue}, Required: ${g.requiredThreshold})`);

    let recommendedStatus: StrategyStatus = 'RESEARCH';
    if (allPassed) {
      recommendedStatus = 'APPROVED';
    } else if (criticalPassed && passedPct >= 80) {
      recommendedStatus = 'SHADOW';
    } else if (passedPct >= 60) {
      recommendedStatus = 'PAPER';
    }

    return {
      strategyId,
      strategyVersion,
      currentStatus: 'RESEARCH',
      recommendedStatus,
      allGatesPassed: allPassed,
      passedGateCount: passedCount,
      totalGateCount: gates.length,
      passedPercentage: passedPct,
      gates,
      promotionAllowed: allPassed || (criticalPassed && recommendedStatus === 'SHADOW'),
      rejectionReasons
    };
  }
}

export const qualityGatesEngine = new QualityGatesEngine();
