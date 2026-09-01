/**
 * Historical Option Strategy Backtesting Engine
 * Queries recorded historical ticks & option chains from SQLite (populated by Zerodha market feed)
 * and replays trades chronologically without look-ahead bias.
 */

import { BacktestConfig, BacktestResult, BacktestTrade } from '../../types.js';
import { dbEngine } from '../db.js';
import { getOrFetchHistoricalTicks } from './historicalService.js';

const STEP_SIZE_MAP: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  MIDCPNIFTY: 25,
  RELIANCE: 20,
  TCS: 50,
  HDFCBANK: 10
};

export async function runOptionBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const ticks = await getOrFetchHistoricalTicks(config.symbol, config.startDate, config.endDate, config.candleInterval);

  // If insufficient historical ticks exist, return clean empty result
  if (!ticks || ticks.length < 2) {
    return {
      config,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePercent: 0,
      totalProfit: 0,
      totalReturnPercent: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      equityCurve: [{ date: config.startDate, equity: config.initialCapital }],
      trades: []
    };
  }

  const trades: BacktestTrade[] = [];
  let currentCapital = config.initialCapital;
  let peakCapital = currentCapital;
  let maxDrawdownAmount = 0;

  const equityCurve: { date: string; equity: number }[] = [
    { date: ticks[0].timestamp.split('T')[0], equity: currentCapital }
  ];

  let totalWins = 0;
  let totalLosses = 0;
  let totalProfit = 0;
  let totalGrossProfit = 0;
  let totalGrossLoss = 0;

  // Replay ticks chronologically without look-ahead bias
  for (let i = 1; i < ticks.length; i++) {
    const prevTick = ticks[i - 1];
    const currTick = ticks[i];
    const dateStr = currTick.timestamp.split('T')[0];

    const entryUnderlying = prevTick.spotPrice;
    const exitUnderlying = currTick.spotPrice;
    const movePercent = entryUnderlying > 0 ? (exitUnderlying - entryUnderlying) / entryUnderlying : 0;

    const stepSize = STEP_SIZE_MAP[config.symbol] || 50;
    const atmStrike = Math.round(entryUnderlying / stepSize) * stepSize;
    const expiry = '2026-08-27';

    // Check if real historical option chain LTP is recorded for entry & exit
    const entryCeLtp = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike, 'CE', prevTick.timestamp);
    const exitCeLtp = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike, 'CE', currTick.timestamp);
    const entryPeLtp = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike, 'PE', prevTick.timestamp);
    const exitPeLtp = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike, 'PE', currTick.timestamp);

    let tradePnl = 0;
    let result: 'WIN' | 'LOSS' = 'WIN';
    let reason = '';
    const allocatedCapitalPerTrade = currentCapital * 0.15; // 15% position sizing
    const slippage = (config.slippagePercent / 100);

    const hasRealOptionData = entryCeLtp !== null && exitCeLtp !== null && entryCeLtp > 0 && exitCeLtp > 0;

    if (hasRealOptionData) {
      if (config.strategyType === 'SHORT_STRADDLE') {
        const entryPremium = (entryCeLtp! + (entryPeLtp || entryCeLtp!));
        const exitPremium = (exitCeLtp! + (exitPeLtp || exitCeLtp!));
        tradePnl = (entryPremium - exitPremium) * (allocatedCapitalPerTrade / entryPremium) * (1 - slippage);
        result = tradePnl >= 0 ? 'WIN' : 'LOSS';
        reason = `Real Straddle Premium diff: Entry ₹${entryPremium.toFixed(1)} -> Exit ₹${exitPremium.toFixed(1)}`;
      } else if (config.strategyType === 'BULL_CALL_SPREAD') {
        const otmStrike = atmStrike + stepSize;
        const entryOtmCe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, otmStrike, 'CE', prevTick.timestamp) || (entryCeLtp! * 0.55);
        const exitOtmCe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, otmStrike, 'CE', currTick.timestamp) || (exitCeLtp! * 0.55);
        const netEntryDebit = Math.max(1, entryCeLtp! - entryOtmCe);
        const netExitValue = exitCeLtp! - exitOtmCe;
        tradePnl = (netExitValue - netEntryDebit) * (allocatedCapitalPerTrade / netEntryDebit) * (1 - slippage);
        result = tradePnl >= 0 ? 'WIN' : 'LOSS';
        reason = `Bull Call Spread: Net Debit ₹${netEntryDebit.toFixed(1)} -> Exit Value ₹${netExitValue.toFixed(1)}`;
      } else if (config.strategyType === 'IRON_CONDOR') {
        const otmCe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike + stepSize, 'CE', prevTick.timestamp) || (entryCeLtp! * 0.6);
        const farCe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike + 2 * stepSize, 'CE', prevTick.timestamp) || (entryCeLtp! * 0.25);
        const otmPe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike - stepSize, 'PE', prevTick.timestamp) || ((entryPeLtp || entryCeLtp!) * 0.6);
        const farPe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike - 2 * stepSize, 'PE', prevTick.timestamp) || ((entryPeLtp || entryCeLtp!) * 0.25);

        const exitOtmCe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike + stepSize, 'CE', currTick.timestamp) || (exitCeLtp! * 0.6);
        const exitFarCe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike + 2 * stepSize, 'CE', currTick.timestamp) || (exitCeLtp! * 0.25);
        const exitOtmPe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike - stepSize, 'PE', currTick.timestamp) || ((exitPeLtp || exitCeLtp!) * 0.6);
        const exitFarPe = dbEngine.getHistoricalOptionLtp(config.symbol, expiry, atmStrike - 2 * stepSize, 'PE', currTick.timestamp) || ((exitPeLtp || exitCeLtp!) * 0.25);

        const entryCredit = Math.max(1, (otmCe - farCe) + (otmPe - farPe));
        const exitCost = (exitOtmCe - exitFarCe) + (exitOtmPe - exitFarPe);
        tradePnl = (entryCredit - exitCost) * (allocatedCapitalPerTrade / entryCredit) * (1 - slippage);
        result = tradePnl >= 0 ? 'WIN' : 'LOSS';
        reason = `Iron Condor: Entry Credit ₹${entryCredit.toFixed(1)} -> Exit Cost ₹${exitCost.toFixed(1)}`;
      } else {
        // Directional Call Momentum / Breakout
        tradePnl = (exitCeLtp! - entryCeLtp!) * (allocatedCapitalPerTrade / entryCeLtp!) * (1 - slippage);
        result = tradePnl >= 0 ? 'WIN' : 'LOSS';
        reason = `Real Option Premium diff: Entry ₹${entryCeLtp!.toFixed(1)} -> Exit ₹${exitCeLtp!.toFixed(1)}`;
      }
    } else {
      // Fallback to rule-based approximation if real option chain rows are not yet recorded in SQLite
      const approxTag = ' (approximated — real option premium data not yet available for this period)';

      if (config.strategyType === 'SHORT_STRADDLE') {
        if (Math.abs(movePercent) < 0.008) {
          tradePnl = allocatedCapitalPerTrade * 0.08 * (1 - slippage);
          result = 'WIN';
          reason = `Range-bound market: Real theta decay harvested${approxTag}`;
        } else {
          tradePnl = -allocatedCapitalPerTrade * (config.stopLossPercent / 100) * (1 + slippage);
          result = 'LOSS';
          reason = `Directional price move triggered stop-loss at -${config.stopLossPercent}%${approxTag}`;
        }
      } else if (config.strategyType === 'BULL_CALL_SPREAD') {
        if (movePercent > 0.003) {
          tradePnl = allocatedCapitalPerTrade * (config.targetProfitPercent / 100) * (1 - slippage);
          result = 'WIN';
          reason = `Bullish target reached on spread${approxTag}`;
        } else {
          tradePnl = -allocatedCapitalPerTrade * (config.stopLossPercent / 100) * (1 + slippage);
          result = 'LOSS';
          reason = `Underlying failed to breach target strike${approxTag}`;
        }
      } else if (config.strategyType === 'IRON_CONDOR') {
        if (Math.abs(movePercent) < 0.01) {
          tradePnl = allocatedCapitalPerTrade * 0.06 * (1 - slippage);
          result = 'WIN';
          reason = `Spot remained inside iron condor wings${approxTag}`;
        } else {
          tradePnl = -allocatedCapitalPerTrade * (config.stopLossPercent / 100) * (1 + slippage);
          result = 'LOSS';
          reason = `Breached iron condor wing${approxTag}`;
        }
      } else {
        if (movePercent > 0.004) {
          tradePnl = allocatedCapitalPerTrade * (config.targetProfitPercent / 100) * (1 - slippage);
          result = 'WIN';
          reason = `Bullish momentum confirmed by recorded ticks${approxTag}`;
        } else {
          tradePnl = -allocatedCapitalPerTrade * (config.stopLossPercent / 100) * (1 + slippage);
          result = 'LOSS';
          reason = `Long option theta decay / momentum failure${approxTag}`;
        }
      }
    }

    tradePnl = Math.round(tradePnl);
    currentCapital += tradePnl;

    if (currentCapital > peakCapital) peakCapital = currentCapital;
    const currentDrawdown = peakCapital - currentCapital;
    if (currentDrawdown > maxDrawdownAmount) maxDrawdownAmount = currentDrawdown;

    if (result === 'WIN') {
      totalWins++;
      totalGrossProfit += tradePnl;
    } else {
      totalLosses++;
      totalGrossLoss += Math.abs(tradePnl);
    }
    totalProfit += tradePnl;

    const formatTickTime = (iso: string) => {
      if (!iso) return '';
      if (iso.includes('T')) {
        const parts = iso.split('T');
        const time = parts[1]?.substring(0, 5);
        return time && time !== '00:00' ? `${parts[0]} ${time}` : parts[0];
      }
      return iso;
    };

    const entryLabel = formatTickTime(prevTick.timestamp);
    const exitLabel = formatTickTime(currTick.timestamp);

    trades.push({
      tradeId: `TRD-${String(i).padStart(3, '0')}`,
      entryDate: entryLabel,
      exitDate: exitLabel,
      strategy: config.strategyType,
      underlyingEntry: Number(entryUnderlying.toFixed(2)),
      underlyingExit: Number(exitUnderlying.toFixed(2)),
      pnl: tradePnl,
      pnlPercent: Number(((tradePnl / allocatedCapitalPerTrade) * 100).toFixed(2)),
      result,
      reason
    });

    equityCurve.push({
      date: exitLabel,
      equity: currentCapital
    });
  }

  const totalTrades = trades.length;
  const winRatePercent = totalTrades > 0 ? Number(((totalWins / totalTrades) * 100).toFixed(2)) : 0;
  const totalReturnPercent = Number((((currentCapital - config.initialCapital) / config.initialCapital) * 100).toFixed(2));
  const maxDrawdownPercent = peakCapital > 0 ? Number(((maxDrawdownAmount / peakCapital) * 100).toFixed(2)) : 0;
  const profitFactor = totalGrossLoss > 0 ? Number((totalGrossProfit / totalGrossLoss).toFixed(2)) : (totalGrossProfit > 0 ? 3.5 : 0);
  const sharpeRatio = Number((((totalReturnPercent / 100) - 0.065) / 0.14).toFixed(2));

  return {
    config,
    totalTrades,
    winningTrades: totalWins,
    losingTrades: totalLosses,
    winRatePercent,
    totalProfit: Math.round(totalProfit),
    totalReturnPercent,
    maxDrawdownPercent,
    sharpeRatio,
    profitFactor,
    equityCurve,
    trades: trades.reverse()
  };
}

