import { ProfitLockStatus } from '../types';

export class ProfitLockEngine {
  private targetPnlThreshold: number = 25000;
  private extremePnlThreshold: number = 60000;

  public evaluateSessionProfit(
    realizedPnl: number,
    unrealizedPnl: number
  ): ProfitLockStatus {
    const totalDailyPnl = realizedPnl + unrealizedPnl;

    if (totalDailyPnl >= this.extremePnlThreshold) {
      const trailingFloor = totalDailyPnl * 0.85;
      return {
        state: 'EXTREME_PROFIT',
        dailyRealizedPnl: realizedPnl,
        dailyUnrealizedPnl: unrealizedPnl,
        totalDailyPnl,
        targetPnlThreshold: this.targetPnlThreshold,
        extremePnlThreshold: this.extremePnlThreshold,
        riskReductionFactor: 0.0, // Freeze new entries
        trailingLockFloor: trailingFloor,
        actionRecommendation: 'PROTECT_GAINS_LOCK_SESSION',
        message: `Exceptional session performance (+₹${totalDailyPnl.toLocaleString()}). Maximum profit lock activated; trailing stop floor set to ₹${trailingFloor.toLocaleString()}. New position entries frozen.`
      };
    }

    if (totalDailyPnl >= this.targetPnlThreshold) {
      const trailingFloor = totalDailyPnl * 0.70;
      return {
        state: 'STRONG_PROFIT',
        dailyRealizedPnl: realizedPnl,
        dailyUnrealizedPnl: unrealizedPnl,
        totalDailyPnl,
        targetPnlThreshold: this.targetPnlThreshold,
        extremePnlThreshold: this.extremePnlThreshold,
        riskReductionFactor: 0.5, // Halve sizing on further trades
        trailingLockFloor: trailingFloor,
        actionRecommendation: 'TIGHTEN_TRAILING_STOP',
        message: `Daily profit target exceeded (+₹${totalDailyPnl.toLocaleString()}). Risk budget scaled down by 50% to prevent giving back accumulated gains.`
      };
    }

    return {
      state: 'NORMAL',
      dailyRealizedPnl: realizedPnl,
      dailyUnrealizedPnl: unrealizedPnl,
      totalDailyPnl,
      targetPnlThreshold: this.targetPnlThreshold,
      extremePnlThreshold: this.extremePnlThreshold,
      riskReductionFactor: 1.0,
      trailingLockFloor: 0,
      actionRecommendation: 'CONTINUE_NORMAL',
      message: `Session within standard parameters. Normal risk sizing permitted.`
    };
  }
}

export const profitLockEngine = new ProfitLockEngine();
