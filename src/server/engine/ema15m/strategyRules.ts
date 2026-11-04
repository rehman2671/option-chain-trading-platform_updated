/**
 * Pure Mathematical Rules for EMA 15M Crossover Strategy
 * Unified logic shared across:
 * - Real-time Live Execution
 * - Simulated Paper Execution
 * - Historical Replay & Backtesting
 */

import { MarketBias, OptionType } from './types.js';

export class StrategyRules {
  public static readonly DEFAULT_SL_POINTS = 30;
  public static readonly DEFAULT_TARGET_POINTS = 100;
  public static readonly DEFAULT_PROFIT_LOCK_POINTS = 70;
  public static readonly DEFAULT_TRAIL_DISTANCE = 30;
  public static readonly DEFAULT_MIN_OPTION_PREMIUM = 5.0;

  /**
   * Evaluates 23/50 EMA crossover on candle close:
   * - BULLISH: prev23 <= prev50 AND curr23 > curr50
   * - BEARISH: prev23 >= prev50 AND curr23 < curr50
   */
  public static evaluateCrossover(
    prevEma23: number,
    prevEma50: number,
    currEma23: number,
    currEma50: number
  ): 'BULLISH' | 'BEARISH' | 'NONE' {
    if (prevEma23 <= prevEma50 && currEma23 > currEma50) {
      return 'BULLISH';
    }
    if (prevEma23 >= prevEma50 && currEma23 < currEma50) {
      return 'BEARISH';
    }
    return 'NONE';
  }

  /**
   * Resolves Option Type based on Market Bias:
   * - BULLISH -> BUY CE (Call Option)
   * - BEARISH -> BUY PE (Put Option)
   */
  public static resolveOptionTypeForBias(bias: MarketBias): OptionType {
    return bias === 'BULLISH' ? 'CE' : 'PE';
  }

  /**
   * For option buying (both BUY CE and BUY PE), Stop-Loss is placed BELOW entry premium:
   * stopLoss = Math.max(minValidPremium, entryPrice - 30)
   * Adheres to exchange tick size (0.05).
   */
  public static calculateStopLoss(
    entryPrice: number,
    slPoints: number = StrategyRules.DEFAULT_SL_POINTS,
    tickSize: number = 0.05,
    minPremium: number = StrategyRules.DEFAULT_MIN_OPTION_PREMIUM
  ): number {
    const rawSl = entryPrice - slPoints;
    const boundedSl = Math.max(minPremium, rawSl);
    const tickAligned = Math.round(boundedSl / tickSize) * tickSize;
    return Number(tickAligned.toFixed(2));
  }

  /**
   * For option buying (both BUY CE and BUY PE), Target is placed ABOVE entry premium:
   * targetPrice = entryPrice + 100
   * Adheres to exchange tick size (0.05).
   */
  public static calculateTargetPrice(
    entryPrice: number,
    targetPoints: number = StrategyRules.DEFAULT_TARGET_POINTS,
    tickSize: number = 0.05
  ): number {
    const rawTarget = entryPrice + targetPoints;
    const tickAligned = Math.round(rawTarget / tickSize) * tickSize;
    return Number(tickAligned.toFixed(2));
  }

  /**
   * Gross P&L calculation for Option Buying:
   * For BOTH BUY CE and BUY PE, the trader is LONG the option contract.
   * Profit is made when exitOptionPremium > entryOptionPremium!
   *
   * grossPnl = (exitOptionPremium - entryOptionPremium) * quantity
   */
  public static calculateOptionGrossPnl(
    entryPrice: number,
    currentOrExitPrice: number,
    quantity: number
  ): number {
    const points = currentOrExitPrice - entryPrice;
    return Number((points * quantity).toFixed(2));
  }

  public static calculateOptionBuyerGrossPnl(
    entryPrice: number,
    currentOrExitPrice: number,
    quantity: number
  ): number {
    return StrategyRules.calculateOptionGrossPnl(entryPrice, currentOrExitPrice, quantity);
  }

  /**
   * Net P&L after standard statutory & broker charges (₹40 round-trip)
   */
  public static calculateOptionNetPnl(grossPnl: number, brokerage: number = 40): number {
    return Number((grossPnl - brokerage).toFixed(2));
  }

  public static isStopLossHit(currentPrice: number, stopLoss: number): boolean {
    return currentPrice <= stopLoss;
  }

  public static isTargetHit(currentPrice: number, targetPrice: number): boolean {
    return currentPrice >= targetPrice;
  }

  public static updateTrailingStopLoss(
    entryPrice: number,
    targetPrice: number,
    currentOrHighPrice: number,
    existingTrailingSl: number | undefined,
    isTrailingActive: boolean,
    profitLockPoints: number = StrategyRules.DEFAULT_PROFIT_LOCK_POINTS,
    trailDistance: number = StrategyRules.DEFAULT_TRAIL_DISTANCE
  ): {
    trailingStopLoss: number;
    isTrailingActive: boolean;
  } {
    const minLockPrice = Number((entryPrice + profitLockPoints).toFixed(2));
    const dynamicTrailPrice = Number((currentOrHighPrice - trailDistance).toFixed(2));
    const newTrailingSl = Math.max(existingTrailingSl || minLockPrice, minLockPrice, dynamicTrailPrice);
    return {
      trailingStopLoss: newTrailingSl,
      isTrailingActive: true
    };
  }

  /**
   * Trailing Stop-Loss & Profit Lock evaluation:
   * Once +100 target threshold is touched (or trailing is active),
   * locks at least +70 points profit (entry + 70) and trails upwards by (highPrice - trailDistance).
   */
  public static evaluateTrailingSl(
    entryPrice: number,
    highPriceSoFar: number,
    currentPrice: number,
    existingTrailingSl: number | undefined,
    isTrailingActive: boolean,
    targetPrice: number,
    profitLockPoints: number = StrategyRules.DEFAULT_PROFIT_LOCK_POINTS,
    trailDistance: number = StrategyRules.DEFAULT_TRAIL_DISTANCE
  ): {
    shouldExit: boolean;
    exitReason?: 'TRAILING_SL_HIT' | 'TARGET_HIT';
    updatedTrailingSl?: number;
    updatedIsTrailing: boolean;
  } {
    const hasReachedTarget = highPriceSoFar >= targetPrice;

    if (!hasReachedTarget && !isTrailingActive) {
      return {
        shouldExit: false,
        updatedTrailingSl: existingTrailingSl,
        updatedIsTrailing: false
      };
    }

    const minLockPrice = Number((entryPrice + profitLockPoints).toFixed(2));
    const dynamicTrailPrice = Number((highPriceSoFar - trailDistance).toFixed(2));
    const newTrailingSl = Math.max(existingTrailingSl || minLockPrice, minLockPrice, dynamicTrailPrice);

    if (currentPrice <= newTrailingSl) {
      return {
        shouldExit: true,
        exitReason: 'TRAILING_SL_HIT',
        updatedTrailingSl: newTrailingSl,
        updatedIsTrailing: true
      };
    }

    return {
      shouldExit: false,
      updatedTrailingSl: newTrailingSl,
      updatedIsTrailing: true
    };
  }
}
