/**
 * Dedicated 15M EMA Paper Execution Service
 * Manages simulated execution, hypothetical P&L, simulated SL/TP, and paper position lifecycle.
 * STRICT ISOLATION INVARIANT:
 * This service NEVER issues broker orders, never interacts with real Upstox sessions,
 * and never triggers real broker exits.
 */

import { Ema15mSignal, EmaPaperTrade } from '../../../types.js';
import { dbEngine } from '../../db.js';
import { StrategyRules } from './strategyRules.js';
import { ResolvedContract } from './contractResolver.js';
import { SessionCalendar } from './sessionCalendar.js';
import { tradeReviewEngine } from '../../../quant/learning/tradeReviewEngine.js';

export class PaperExecutionService {
  private static instance: PaperExecutionService;

  private constructor() {}

  public static getInstance(): PaperExecutionService {
    if (!PaperExecutionService.instance) {
      PaperExecutionService.instance = new PaperExecutionService();
    }
    return PaperExecutionService.instance;
  }

  /**
   * Executes a confirmed EMA signal in simulated Paper Trading mode
   */
  public async executePaperSignal(
    signal: Ema15mSignal,
    contract: ResolvedContract,
    estimatedEntryPrice: number
  ): Promise<{ status: 'FILLED_SIMULATED' | 'HELD' | 'FAILED'; trade?: EmaPaperTrade; message: string }> {
    const timestampStr = new Date().toISOString();
    const inst = signal.instrument;
    const newDirection: 'LONG' | 'SHORT' = signal.signalType === 'BULLISH' ? 'LONG' : 'SHORT';
    const quantity = contract.lotSize; // Exactly 1 standard lot

    try {
      // 1. Check if an open paper trade already exists on this instrument
      const existingOpen = dbEngine.getOpenEmaPaperTradeByInstrument(inst);

      if (existingOpen) {
        if (existingOpen.direction !== newDirection) {
          // Opposite Crossover Reversal: close the opposing paper trade
          const exitPrice = existingOpen.currentPrice || existingOpen.entryPrice;
          dbEngine.closeEmaPaperTrade(existingOpen.id, exitPrice, 'OPPOSITE_CROSSOVER', signal.signalConfirmedAt);

          const grossPnl = StrategyRules.calculateOptionGrossPnl(existingOpen.entryPrice, exitPrice, existingOpen.quantity);
          const netPnl = StrategyRules.calculateOptionNetPnl(grossPnl, existingOpen.brokerage || 40);

          try {
            tradeReviewEngine.recordFromEmaTrade(
              existingOpen,
              exitPrice,
              grossPnl,
              netPnl,
              'OPPOSITE_CROSSOVER',
              signal.signalConfirmedAt || timestampStr
            );
          } catch {}

          dbEngine.logEmaExecutionEvent({
            id: `evt-paper-rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            signalId: signal.id,
            executionId: existingOpen.id,
            executionMode: 'PAPER',
            stage: 'PAPER_EXIT',
            status: 'SUCCESS',
            instrument: inst,
            details: { tradeId: existingOpen.id, exitPrice, grossPnl, netPnl, reason: 'OPPOSITE_CROSSOVER' },
            timestamp: timestampStr
          });

          console.log(`[EMA PAPER] 🔄 Reversal: Closed opposing paper trade ${existingOpen.id} on ${inst} @ ₹${exitPrice}`);
        } else {
          // Same direction: maintain position invariant (Max 1 active position, no averaging, no pyramiding)
          dbEngine.logEmaExecutionEvent({
            id: `evt-paper-hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            signalId: signal.id,
            executionMode: 'PAPER',
            stage: 'PAPER_ENTRY',
            status: 'INFO',
            instrument: inst,
            details: { existingTradeId: existingOpen.id, message: 'Position in same direction already open. Maintaining position.' },
            timestamp: timestampStr
          });
          return {
            status: 'HELD',
            trade: existingOpen,
            message: `Position in direction ${newDirection} already active on ${inst}. Maintaining position without averaging.`
          };
        }
      }

      // 2. Calculate Stop-Loss and Target on Option Premium
      // Both BUY CE and BUY PE are long option premium trades
      const stopLoss = StrategyRules.calculateStopLoss(estimatedEntryPrice);
      const targetPrice = StrategyRules.calculateTargetPrice(estimatedEntryPrice);

      // 3. Create simulated Paper Trade record
      const tradeId = `ema-pt-${inst.toLowerCase()}-${contract.optionType.toLowerCase()}-${contract.strikePrice}-${Date.now()}`;
      const simulatedTrade: EmaPaperTrade = {
        id: tradeId,
        signalId: signal.id,
        instrument: inst,
        direction: newDirection,
        optionType: contract.optionType,
        strikePrice: contract.strikePrice,
        expiryDate: contract.expiryDate,
        productType: 'MIS',
        spotAtEntry: signal.price,
        stopLoss,
        targetPrice,
        orderId: `SIM-ORD-${Date.now()}`,
        brokerStatus: 'FILLED',
        entryTimestamp: signal.signalConfirmedAt || timestampStr,
        entryPrice: estimatedEntryPrice,
        quantity,
        lotSize: contract.lotSize,
        strategy: 'EMA_15M_23_50',
        source: 'PRACTICE',
        status: 'OPEN',
        currentPrice: estimatedEntryPrice,
        unrealizedPnl: 0,
        grossPnl: 0,
        brokerage: 40,
        charges: 0,
        netPnl: 0,
        createdAt: timestampStr,
        updatedAt: timestampStr
      };

      dbEngine.saveEmaPaperTrade(simulatedTrade);

      // 4. Log structured audit event
      const randOpen = Math.random().toString(36).slice(2, 8);
      dbEngine.logEmaExecutionEvent({
        id: `evt-paper-open-${Date.now()}-${randOpen}`,
        signalId: signal.id,
        executionId: tradeId,
        executionMode: 'PAPER',
        stage: 'PAPER_ENTRY',
        status: 'SUCCESS',
        instrument: inst,
        details: {
          tradeId,
          tradingsymbol: contract.tradingsymbol,
          entryPrice: estimatedEntryPrice,
          stopLoss,
          targetPrice,
          quantity
        },
        timestamp: timestampStr
      });

      dbEngine.logEmaExecution({
        id: `exec-pt-${Date.now()}-${randOpen}`,
        timestamp: timestampStr,
        level: 'SUCCESS',
        stage: 'PAPER_TRADE',
        instrument: inst,
        message: `Paper Trade Open: BUY 1 Lot (${quantity} Qty) ${contract.strikePrice} ${contract.optionType} (${contract.expiryDate}) @ ₹${estimatedEntryPrice} [SL: ₹${stopLoss} | Target: ₹${targetPrice}]`,
        details: { tradeId, entryPrice: estimatedEntryPrice, stopLoss, targetPrice }
      });

      return {
        status: 'FILLED_SIMULATED',
        trade: simulatedTrade,
        message: `Simulated paper trade opened for ${contract.tradingsymbol} @ ₹${estimatedEntryPrice}`
      };
    } catch (err: any) {
      console.error(`[EMA PAPER] Error executing paper trade for ${inst}:`, err.message);
      dbEngine.logEmaExecutionEvent({
        id: `evt-paper-err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        signalId: signal.id,
        executionMode: 'PAPER',
        stage: 'PAPER_ENTRY',
        status: 'FAILED',
        instrument: inst,
        errorMessage: err.message,
        timestamp: timestampStr
      });
      return {
        status: 'FAILED',
        message: err.message
      };
    }
  }

  /**
   * Evaluates mark-to-market and SL/TP for all open paper positions
   * Strictly NO broker orders issued here!
   */
  public monitorPaperPositions(
    instrument: string,
    currentSpotPrice: number,
    getEstimatedOptionPrice: (inst: any, strike: number, type: any, expiry: string, spot: number) => number
  ): void {
    const openTrades = dbEngine.getOpenEmaPaperTrades(instrument);
    if (!openTrades || openTrades.length === 0) return;

    const toUpdate: Array<{ id: string; currentPrice: number; unrealizedPnl: number; trailingStopLoss?: number; isTrailingActive?: boolean }> = [];
    const toClose: Array<{ id: string; exitPrice: number; exitReason: string; grossPnl: number; netPnl: number; exitTimestamp?: string }> = [];

    const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
    const trailingEnabled = settings.trailingSlEnabled !== false;
    const profitLockPts = settings.profitLockPoints ?? 70;
    const trailDistancePts = settings.trailDistancePoints ?? 30;

    for (const trade of openTrades) {
      const entryPrice = Number(trade.entryPrice);
      const qty = Number(trade.quantity);

      let currentOptionPrice = entryPrice;
      if (trade.optionType && trade.strikePrice && trade.expiryDate) {
        currentOptionPrice = getEstimatedOptionPrice(
          trade.instrument,
          trade.strikePrice,
          trade.optionType,
          trade.expiryDate,
          currentSpotPrice
        );
      } else {
        currentOptionPrice = currentSpotPrice;
      }

      // Both BUY CE and BUY PE profit when option premium increases
      const grossPnl = StrategyRules.calculateOptionGrossPnl(entryPrice, currentOptionPrice, qty);
      const netPnl = StrategyRules.calculateOptionNetPnl(grossPnl, 40);
      const unrealizedPnl = grossPnl;

      let shouldExit = false;
      let exitReason = '';
      let updatedTrailingSl = trade.trailingStopLoss;
      let updatedIsTrailing = trade.isTrailingActive;

      if (trailingEnabled) {
        const targetThreshold = trade.targetPrice || (entryPrice + 100);
        const trailResult = StrategyRules.evaluateTrailingSl(
          entryPrice,
          currentOptionPrice,
          currentOptionPrice,
          trade.trailingStopLoss,
          trade.isTrailingActive || false,
          targetThreshold,
          profitLockPts,
          trailDistancePts
        );

        updatedTrailingSl = trailResult.updatedTrailingSl;
        updatedIsTrailing = trailResult.updatedIsTrailing;

        if (trailResult.shouldExit) {
          shouldExit = true;
          exitReason = trailResult.exitReason || 'TRAILING_SL_HIT';
        } else if (!updatedIsTrailing && trade.stopLoss !== undefined && currentOptionPrice <= trade.stopLoss) {
          shouldExit = true;
          exitReason = 'SL_HIT';
        }
      } else {
        if (trade.stopLoss !== undefined && currentOptionPrice <= trade.stopLoss) {
          shouldExit = true;
          exitReason = 'SL_HIT';
        } else if (trade.targetPrice !== undefined && currentOptionPrice >= trade.targetPrice) {
          shouldExit = true;
          exitReason = 'TARGET_HIT';
        }
      }

      if (shouldExit) {
        toClose.push({
          id: trade.id,
          exitPrice: currentOptionPrice,
          exitReason,
          grossPnl,
          netPnl,
          exitTimestamp: new Date().toISOString()
        });

        dbEngine.logEmaExecutionEvent({
          id: `evt-paper-exit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          signalId: trade.signalId,
          executionId: trade.id,
          executionMode: 'PAPER',
          stage: exitReason === 'SL_HIT' ? 'PAPER_STOP_LOSS' : 'PAPER_EXIT',
          status: 'SUCCESS',
          instrument: trade.instrument,
          details: { tradeId: trade.id, exitReason, entryPrice, exitPrice: currentOptionPrice, grossPnl, netPnl },
          timestamp: new Date().toISOString()
        });
      } else {
        toUpdate.push({
          id: trade.id,
          currentPrice: currentOptionPrice,
          unrealizedPnl,
          trailingStopLoss: updatedTrailingSl,
          isTrailingActive: updatedIsTrailing
        });
      }
    }

    dbEngine.batchUpdateEmaPaperTrades({ toUpdate, toClose });
  }

  /**
   * Forced Intraday Square-Off at configured time (e.g. 15:15 IST) for paper trades only
   */
  public checkForcedIntradaySquareOff(): void {
    const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
    const forceTime = settings.forceSquareOffTime || '15:15';

    if (!SessionCalendar.isAtOrPastForcedSquareOff(new Date(), forceTime)) {
      return;
    }

    const openTrades = dbEngine.getOpenEmaPaperTrades('ALL');
    if (!openTrades || openTrades.length === 0) return;

    console.log(`[EMA PAPER INTRADAY] ⏰ Reached force square-off time (${forceTime} IST). Closing ${openTrades.length} paper trade(s)...`);

    for (const trade of openTrades) {
      const exitPrice = trade.currentPrice || trade.entryPrice;
      dbEngine.closeEmaPaperTrade(trade.id, exitPrice, 'FORCED_INTRADAY_SQUARE_OFF', new Date().toISOString());

      dbEngine.logEmaExecutionEvent({
        id: `evt-paper-sq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        signalId: trade.signalId,
        executionId: trade.id,
        executionMode: 'PAPER',
        stage: 'FORCED_SQUARE_OFF',
        status: 'SUCCESS',
        instrument: trade.instrument,
        details: { tradeId: trade.id, exitPrice, reason: 'FORCED_INTRADAY_SQUARE_OFF' },
        timestamp: new Date().toISOString()
      });
    }
  }
}

export const paperExecutionService = PaperExecutionService.getInstance();
