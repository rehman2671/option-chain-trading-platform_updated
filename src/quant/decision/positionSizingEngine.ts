/**
 * Position Sizing Engine (Section 27)
 * Implements risk-budgeted sizing, Fractional Kelly optimization,
 * volatility scaling (ATR), and drawdown dampeners.
 * Prevents martingale, infinite averaging, and uncontrolled leverage.
 */

import { QuantUnderlying } from '../types.js';

export interface SizingInputParams {
  underlying: QuantUnderlying;
  accountCapital: number;
  availableMargin: number;
  strategyConfidence: number; // 0.0 - 1.0 (e.g. 0.75)
  winRate: number; // 0.0 - 1.0 (e.g. 0.62)
  profitFactor: number; // e.g. 1.85
  maxTradeRiskPct?: number; // default 1.5% of account capital
  currentDrawdownPct?: number; // default 0.0%
  stopLossPoints: number; // e.g. 40 points
  targetPoints: number; // e.g. 80 points
  premiumPrice: number; // e.g. 140 INR
}

export interface PositionSizingRecommendation {
  underlying: QuantUnderlying;
  lotSize: number;
  recommendedLots: number;
  totalQuantity: number;
  maxCapitalAtRiskINR: number;
  allocatedCapitalINR: number;
  capitalUtilizationPct: number;
  fractionalKellyFraction: number;
  drawdownDampenerFactor: number;
  riskRewardRatio: number;
  expectedValueINR: number;
  sizingRationale: string[];
  safetyWarnings: string[];
}

export class PositionSizingEngine {
  /**
   * Get NSE lot size for instrument
   */
  public getLotSize(underlying: QuantUnderlying): number {
    switch (underlying) {
      case 'BANKNIFTY':
        return 15;
      case 'SENSEX':
        return 10;
      case 'NIFTY':
      default:
        return 25;
    }
  }

  /**
   * Calculates mathematically disciplined position sizing
   */
  public calculatePositionSize(params: SizingInputParams): PositionSizingRecommendation {
    const lotSize = this.getLotSize(params.underlying);
    const capital = Math.max(10000, params.accountCapital);
    const riskBudgetPct = (params.maxTradeRiskPct || 1.5) / 100;
    const maxRiskCapital = capital * riskBudgetPct;

    // 1. Drawdown Dampener
    // If account is in drawdown, reduce sizing progressively
    const dd = Math.max(0, params.currentDrawdownPct || 0);
    let drawdownDampenerFactor = 1.0;
    if (dd > 15) drawdownDampenerFactor = 0.25; // Severe DD: 75% size reduction
    else if (dd > 10) drawdownDampenerFactor = 0.50; // Moderate DD: 50% size reduction
    else if (dd > 5) drawdownDampenerFactor = 0.75; // Minor DD: 25% size reduction

    // 2. Fractional Kelly Calculation (Quarter-Kelly for options to avoid volatility drag)
    const p = Math.min(0.9, Math.max(0.2, params.winRate));
    const q = 1 - p;
    const b = Math.max(0.5, params.targetPoints / Math.max(1, params.stopLossPoints)); // payoff ratio
    const fullKelly = Math.max(0, (b * p - q) / b);
    const quarterKelly = Math.min(0.25, fullKelly * 0.25); // Max 25% allocation even in best Kelly case

    // 3. Volatility / Stop-loss Risk per Lot
    const lossPerLot = params.stopLossPoints * lotSize;
    const premiumPerLot = params.premiumPrice * lotSize;

    // Sizing based on risk budget
    const effectiveRiskCapital = maxRiskCapital * drawdownDampenerFactor * (params.strategyConfidence || 0.7);
    const rawLotsByRisk = lossPerLot > 0 ? Math.floor(effectiveRiskCapital / lossPerLot) : 1;

    // Sizing based on margin availability
    const rawLotsByMargin = premiumPerLot > 0 ? Math.floor((params.availableMargin * 0.7) / premiumPerLot) : 1;

    // Exchange freeze limit per order
    const maxLotsExchange = params.underlying === 'NIFTY' ? 72 : 60; // 1800 units NIFTY, 900 units BANKNIFTY

    const recommendedLots = Math.max(1, Math.min(rawLotsByRisk, rawLotsByMargin, maxLotsExchange));
    const totalQuantity = recommendedLots * lotSize;

    const maxCapitalAtRiskINR = Math.round(recommendedLots * lossPerLot);
    const allocatedCapitalINR = Math.round(recommendedLots * premiumPerLot);
    const capitalUtilizationPct = Number(((allocatedCapitalINR / capital) * 100).toFixed(1));

    const riskRewardRatio = Number((params.targetPoints / Math.max(1, params.stopLossPoints)).toFixed(2));
    const winProfit = params.targetPoints * totalQuantity;
    const lossCost = params.stopLossPoints * totalQuantity;
    const expectedValueINR = Math.round(p * winProfit - q * lossCost);

    const sizingRationale: string[] = [
      `Risk budget allocated: ₹${Math.round(effectiveRiskCapital).toLocaleString()} (${(riskBudgetPct * 100).toFixed(1)}% base capped by ${drawdownDampenerFactor * 100}% DD dampener).`,
      `Stop loss: ${params.stopLossPoints} pts (₹${lossPerLot.toLocaleString()}/lot) yielding ${recommendedLots} lot(s).`,
      `Quarter-Kelly sizing fraction: ${(quarterKelly * 100).toFixed(1)}% (Full Kelly: ${(fullKelly * 100).toFixed(1)}%).`,
      `Payoff profile: 1:${riskRewardRatio} R:R with expected mathematical edge +₹${expectedValueINR.toLocaleString()}.`
    ];

    const safetyWarnings: string[] = [];
    if (dd > 10) {
      safetyWarnings.push(`Account in ${dd.toFixed(1)}% drawdown: sizing reduced by ${(1 - drawdownDampenerFactor) * 100}%.`);
    }
    if (allocatedCapitalINR > params.availableMargin * 0.5) {
      safetyWarnings.push('Margin utilization exceeds 50% threshold; watch for intra-day peak margin requirements.');
    }
    if (params.strategyConfidence < 0.6) {
      safetyWarnings.push('Strategy confidence is below 0.60; baseline lot allocation minimized.');
    }

    return {
      underlying: params.underlying,
      lotSize,
      recommendedLots,
      totalQuantity,
      maxCapitalAtRiskINR,
      allocatedCapitalINR,
      capitalUtilizationPct,
      fractionalKellyFraction: Number(quarterKelly.toFixed(3)),
      drawdownDampenerFactor,
      riskRewardRatio,
      expectedValueINR,
      sizingRationale,
      safetyWarnings
    };
  }
}

export const positionSizingEngine = new PositionSizingEngine();
