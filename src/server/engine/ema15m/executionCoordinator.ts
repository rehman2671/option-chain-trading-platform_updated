/**
 * 15M EMA Execution Coordinator
 * Orchestrates independent execution pipelines for Paper Trading and Live Upstox Execution.
 * Guarantees that neither pipeline mutates, blocks, or cancels the other.
 */

import { Ema15mSignal } from '../../../types.js';
import { dbEngine } from '../../db.js';
import { ContractResolver, ResolvedContract } from './contractResolver.js';
import { StrategyRules } from './strategyRules.js';
import { paperExecutionService } from './paperExecutionService.js';
import { liveExecutionService } from './liveExecutionService.js';
import { DualExecutionResult } from './types.js';

export class ExecutionCoordinator {
  private static instance: ExecutionCoordinator;

  private constructor() {}

  public static getInstance(): ExecutionCoordinator {
    if (!ExecutionCoordinator.instance) {
      ExecutionCoordinator.instance = new ExecutionCoordinator();
    }
    return ExecutionCoordinator.instance;
  }

  /**
   * Main entrypoint for processing confirmed EMA crossover signals.
   * Dispatches independently to Paper and Live pipelines based on current settings.
   */
  public async processConfirmedSignal(
    signal: Ema15mSignal,
    estimatedEntryPrice: number,
    isSyntheticMock: boolean = false,
    userId: string = 'GLOBAL'
  ): Promise<DualExecutionResult> {
    const timestampStr = new Date().toISOString();
    const inst = signal.instrument;
    const settings = dbEngine.getEmaNotificationSettings(userId);
    const paperEnabled = settings.autoPaperTradingEnabled !== false;
    // CRITICAL: Synthetic mock crossover signals must NEVER trigger live broker orders!
    const liveEnabled = !isSyntheticMock && settings.liveBrokerExecutionEnabled === true;

    // 1. Resolve authoritative option contract
    const optionType = StrategyRules.resolveOptionTypeForBias(signal.signalType);
    const contract: ResolvedContract = ContractResolver.resolveContract(
      inst,
      optionType,
      signal.price,
      new Date(signal.signalConfirmedAt || timestampStr)
    );

    // 2. Structured Event: Signal Confirmed
    dbEngine.logEmaExecutionEvent({
      id: `evt-sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      signalId: signal.id,
      executionMode: 'SYSTEM',
      stage: 'SIGNAL_CONFIRMED',
      status: 'INFO',
      instrument: inst,
      details: {
        signalType: signal.signalType,
        spotPrice: signal.price,
        contract,
        estimatedEntryPrice,
        paperEnabled,
        liveEnabled,
        isSyntheticMock
      },
      timestamp: timestampStr
    });

    const result: DualExecutionResult = {
      signalStatus: 'CONFIRMED',
      paper: {
        enabled: paperEnabled,
        status: 'SKIPPED'
      },
      live: {
        enabled: liveEnabled,
        status: 'SKIPPED',
        requestedQuantity: contract.lotSize,
        filledQuantity: 0,
        positionCreated: false
      }
    };

    // -------------------------------------------------------------
    // PIPELINE 1: PAPER EXECUTION (SIMULATED LEDGER)
    // -------------------------------------------------------------
    if (paperEnabled) {
      try {
        const paperResult = await paperExecutionService.executePaperSignal(signal, contract, estimatedEntryPrice);
        result.paper = {
          enabled: true,
          status: paperResult.status,
          tradeId: paperResult.trade?.id,
          positionStatus: paperResult.trade ? 'OPEN' : 'NONE',
          entryPrice: paperResult.trade?.entryPrice,
          message: paperResult.message
        };
      } catch (paperErr: any) {
        console.error('[COORDINATOR] Paper execution pipeline error:', paperErr.message);
        result.paper = {
          enabled: true,
          status: 'FAILED',
          message: paperErr.message
        };
      }
    } else {
      result.paper = {
        enabled: false,
        status: 'SKIPPED',
        message: 'Paper trading disabled in settings.'
      };
    }

    // -------------------------------------------------------------
    // PIPELINE 2: LIVE UPSTOX BROKER EXECUTION (REAL MONEY)
    // -------------------------------------------------------------
    if (liveEnabled) {
      try {
        const liveResult = await liveExecutionService.attemptLiveSignal(signal, contract, estimatedEntryPrice, userId);
        result.live = liveResult;
      } catch (liveErr: any) {
        console.error('[COORDINATOR] Live execution pipeline error:', liveErr.message);
        result.live = {
          enabled: true,
          status: 'REJECTED',
          requestedQuantity: contract.lotSize,
          filledQuantity: 0,
          positionCreated: false,
          rejectionReason: liveErr.message,
          message: liveErr.message
        };
      }
    } else {
      result.live = {
        enabled: false,
        status: 'SKIPPED',
        requestedQuantity: contract.lotSize,
        filledQuantity: 0,
        positionCreated: false,
        message: isSyntheticMock
          ? 'Live broker execution suppressed for synthetic mock crossover.'
          : 'Live broker execution disabled in settings.'
      };
    }

    return result;
  }

  /**
   * Evaluates position updates (SL/TP/trailing) across both independent engines
   */
  public async monitorPositions(
    instrument: string,
    currentSpotPrice: number,
    getEstimatedOptionPrice: (inst: any, strike: number, type: any, expiry: string, spot: number) => number
  ): Promise<void> {
    // 1. Paper monitoring (never triggers broker orders)
    paperExecutionService.monitorPaperPositions(instrument, currentSpotPrice, getEstimatedOptionPrice);

    // 2. Live monitoring (evaluates authoritative fills and broker exits)
    await liveExecutionService.monitorLivePositions(instrument, currentSpotPrice, getEstimatedOptionPrice);
  }

  /**
   * Intraday Forced Square-Off evaluation
   */
  public async checkForcedIntradaySquareOff(): Promise<void> {
    paperExecutionService.checkForcedIntradaySquareOff();
    await liveExecutionService.checkForcedIntradaySquareOff();
  }
}

export const executionCoordinator = ExecutionCoordinator.getInstance();
