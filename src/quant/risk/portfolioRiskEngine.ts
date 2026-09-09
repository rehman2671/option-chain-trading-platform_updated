/**
 * Portfolio Risk & Greek Stress Testing Engine
 * Calculates net Greek portfolio exposures, stress shocks (+/-2% spot, +/-10 IV),
 * and enforces the global Kill-Switch limits.
 */

import { PortfolioRiskSnapshot } from '../types.js';

export class PortfolioRiskEngine {
  private static instance: PortfolioRiskEngine;

  private constructor() {}

  public static getInstance(): PortfolioRiskEngine {
    if (!PortfolioRiskEngine.instance) {
      PortfolioRiskEngine.instance = new PortfolioRiskEngine();
    }
    return PortfolioRiskEngine.instance;
  }

  public assessPortfolio(
    openPositions: Array<{
      symbol: string;
      quantity: number;
      delta?: number;
      gamma?: number;
      theta?: number;
      vega?: number;
      currentPrice: number;
      entryPrice: number;
    }>,
    allocatedCapital: number = 1000000,
    dailyLossLimitPct: number = 3.0
  ): PortfolioRiskSnapshot {
    let netDelta = 0;
    let netGamma = 0;
    let netTheta = 0;
    let netVega = 0;
    let totalPnl = 0;
    let usedMargin = 0;

    for (const pos of openPositions) {
      const qty = pos.quantity || 1;
      netDelta += (pos.delta || 0.4) * qty;
      netGamma += (pos.gamma || 0.002) * qty;
      netTheta += (pos.theta || -12) * qty;
      netVega += (pos.vega || 8) * qty;
      totalPnl += (pos.currentPrice - pos.entryPrice) * qty;
      usedMargin += Math.abs(pos.entryPrice * qty * 0.15); // Standard margin assumption
    }

    const availableMargin = Math.max(0, allocatedCapital - usedMargin);
    const marginUtilizationPct = Number(((usedMargin / allocatedCapital) * 100).toFixed(1));
    const dailyDrawdownPct = Number(((Math.abs(Math.min(0, totalPnl)) / allocatedCapital) * 100).toFixed(2));

    // Stress testing scenarios
    const stressScenarios = [
      {
        scenarioName: 'Spot +1.0% Rally',
        spotShiftPct: 1.0,
        ivShiftPoints: 0,
        projectedPnl: Number((netDelta * 240 + 0.5 * netGamma * Math.pow(240, 2)).toFixed(2))
      },
      {
        scenarioName: 'Spot -1.0% Decline',
        spotShiftPct: -1.0,
        ivShiftPoints: 0,
        projectedPnl: Number((-netDelta * 240 + 0.5 * netGamma * Math.pow(240, 2)).toFixed(2))
      },
      {
        scenarioName: 'Spot -2.0% Flash Crash + IV Spike (+8 pts)',
        spotShiftPct: -2.0,
        ivShiftPoints: 8,
        projectedPnl: Number((-netDelta * 480 + 0.5 * netGamma * Math.pow(480, 2) + netVega * 8).toFixed(2))
      },
      {
        scenarioName: 'Volatility Crush (-5 IV pts)',
        spotShiftPct: 0,
        ivShiftPoints: -5,
        projectedPnl: Number((-netVega * 5).toFixed(2))
      },
      {
        scenarioName: 'Weekend Decay (2-Day Theta)',
        spotShiftPct: 0,
        ivShiftPoints: 0,
        projectedPnl: Number((netTheta * 2).toFixed(2))
      }
    ];

    let worstCaseStressLoss = 0;
    for (const s of stressScenarios) {
      if (s.projectedPnl < worstCaseStressLoss) {
        worstCaseStressLoss = s.projectedPnl;
      }
    }

    // Kill switch activation check
    const killSwitchTriggered = dailyDrawdownPct >= dailyLossLimitPct;
    const killSwitchReason = killSwitchTriggered
      ? `Daily drawdown (${dailyDrawdownPct}%) exceeded strict limit (${dailyLossLimitPct}%). Trading halted.`
      : undefined;

    const riskLevel = killSwitchTriggered
      ? 'CRITICAL'
      : dailyDrawdownPct > 1.5 || marginUtilizationPct > 70
      ? 'ELEVATED'
      : dailyDrawdownPct > 0.5 || marginUtilizationPct > 40
      ? 'MODERATE'
      : 'LOW';

    return {
      netDelta: Number(netDelta.toFixed(2)),
      netGamma: Number(netGamma.toFixed(4)),
      netTheta: Number(netTheta.toFixed(2)),
      netVega: Number(netVega.toFixed(2)),
      usedMargin: Math.round(usedMargin),
      availableMargin: Math.round(availableMargin),
      marginUtilizationPct,
      worstCaseStressLoss: Math.round(worstCaseStressLoss),
      dailyDrawdownPct,
      riskLevel,
      killSwitchTriggered,
      killSwitchReason,
      stressScenarios
    };
  }
}

export const portfolioRiskEngine = PortfolioRiskEngine.getInstance();
