/**
 * Dedicated 15M EMA Live Execution Service
 * Manages real Upstox broker order lifecycle, centralized risk validation,
 * order acknowledgment, fill reconciliation, and live position exits.
 *
 * INVARIANTS:
 * 1. Rejected broker orders NEVER create live positions.
 * 2. Filled quantity remains 0 on rejection.
 * 3. Never fabricate broker order IDs.
 * 4. Paper exits NEVER trigger real broker SELL orders.
 * 5. Pre-trade blocks are recorded distinctly as PRE_TRADE_REJECTED.
 */

import { Ema15mSignal } from '../../../types.js';
import { dbEngine } from '../../db.js';
import { activeProvider } from '../providers/index.js';
import { ContractResolver, ResolvedContract } from './contractResolver.js';
import { StrategyRules } from './strategyRules.js';
import { SessionCalendar } from './sessionCalendar.js';
import { killSwitchEngine } from '../../../quant/risk/killSwitch.js';
import { evaluateEmaBrokerRisk } from './brokerRiskGate.js';
import {
  EmaLiveOrderAttempt,
  EmaLivePosition,
  OrderStatus,
  PositionStatus,
  DualExecutionResult
} from './types.js';

export class LiveExecutionService {
  private static instance: LiveExecutionService;
  private pendingExitIds: Set<string> = new Set();
  private pendingEntryInstruments: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): LiveExecutionService {
    if (!LiveExecutionService.instance) {
      LiveExecutionService.instance = new LiveExecutionService();
    }
    return LiveExecutionService.instance;
  }

  /**
   * Pre-trade safety & risk verification.
   * Blocks live execution safely before order dispatch.
   */
  public validatePreTrade(
    signal: Ema15mSignal,
    contract: ResolvedContract,
    userId: string = 'GLOBAL'
  ): { passed: boolean; failureReason?: string } {
    const settings = dbEngine.getEmaNotificationSettings(userId);

    // 1. Live Trading Enabled Check
    if (!settings.liveBrokerExecutionEnabled) {
      return { passed: false, failureReason: 'Live broker execution is disabled in system settings.' };
    }

    // 2. Kill Switch Check
    if (killSwitchEngine.isHalted(userId)) {
      const haltReason = killSwitchEngine.getHaltReason(userId) || 'Kill switch engaged';
      return { passed: false, failureReason: `Unified Risk Control: Kill Switch is active (${haltReason})` };
    }

    // Broker account funds, positions and exact order margin are checked
    // asynchronously before any REAL BUY; never use synthetic risk defaults here.

    // 4. Contract Validity Check
    if (!contract.isValid) {
      return { passed: false, failureReason: contract.rejectionReason || 'Invalid option contract specification' };
    }

    // 5. Exchange Market Hours Check
    const exchangeStatus = SessionCalendar.isExchangeOpen();
    if (!exchangeStatus.isOpen) {
      return { passed: false, failureReason: `Indian exchange is currently closed: ${exchangeStatus.reason}` };
    }
    if (SessionCalendar.isAtOrPastForcedSquareOff(new Date(), settings.forceSquareOffTime || '15:15')) {
      return { passed: false, failureReason: 'MIS live entry blocked at/after forced square-off cutoff.' };
    }

    // 6. Broker Provider Connection Check
    const brokerConnected = activeProvider && (
      typeof (activeProvider as any).isUpstoxLiveConnected === 'function'
        ? (activeProvider as any).isUpstoxLiveConnected()
        : Boolean((activeProvider as any).isConnected)
    );

    if (!brokerConnected || typeof (activeProvider as any).placeOrder !== 'function') {
      return { passed: false, failureReason: 'Upstox broker provider is disconnected or token expired.' };
    }

    // 7. Session Daily Loss Circuit Breaker on Live Positions (Account-wide IST session)
    const livePositions = dbEngine.getEmaLivePositions('ALL', 'ALL', 200);
    const todayStr = SessionCalendar.toIstDate().dateStr;
    const todayLiveNetPnl = livePositions
      .filter(p => {
        if (!p.createdAt) return false;
        try {
          const posIstDate = SessionCalendar.toIstDate(new Date(p.createdAt)).dateStr;
          return posIstDate === todayStr;
        } catch {
          return false;
        }
      })
      .reduce((sum, p) => sum + (p.netPnl || 0), 0);

    const maxDailyLoss = settings.maxDailyLossLimit ?? 5000;
    if (todayLiveNetPnl <= -maxDailyLoss) {
      return { passed: false, failureReason: `Live Daily Loss Circuit Breaker Engaged: Realized loss ₹${Math.abs(todayLiveNetPnl)} exceeds limit ₹${maxDailyLoss}` };
    }

    return { passed: true };
  }

  /**
   * Attempts live execution of a confirmed EMA signal on Upstox
   */
  public async attemptLiveSignal(
    signal: Ema15mSignal,
    contract: ResolvedContract,
    estimatedEntryPrice: number,
    userId: string = 'GLOBAL'
  ): Promise<DualExecutionResult['live']> {
    // Prevent simultaneous crossovers from bypassing pending-entry checks in this process.
    // Durable multi-process idempotency must also be enforced at the DB/broker boundary.
    const entryKey = signal.instrument;
    if (this.pendingEntryInstruments.has(entryKey)) {
      return {
        enabled: true,
        status: 'HELD',
        requestedQuantity: contract.lotSize,
        filledQuantity: 0,
        positionCreated: false,
        message: 'Another EMA live order is currently being dispatched for ' + entryKey
      };
    }
    this.pendingEntryInstruments.add(entryKey);
    try {
      return await this.attemptLiveSignalInternal(signal, contract, estimatedEntryPrice, userId);
    } finally {
      this.pendingEntryInstruments.delete(entryKey);
    }
  }

  private async attemptLiveSignalInternal(
    signal: Ema15mSignal,
    contract: ResolvedContract,
    estimatedEntryPrice: number,
    userId: string
  ): Promise<DualExecutionResult['live']> {
    const timestampStr = new Date().toISOString();
    const inst = signal.instrument;
    const attemptId = `att-${inst.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Paper and signal generation may use modelled contracts. Real BUY must use
    // the broker's exact listed instrument key, expiry, lot size and tick size.
    contract = await ContractResolver.verifyLiveContract(contract, activeProvider as any);
    const quantity = contract.lotSize;
    const settings = dbEngine.getEmaNotificationSettings(userId);
    const productType: 'MIS' | 'NRML' = settings.upstoxProductType || 'MIS';

    // 0. Check if there is an in-flight pending entry attempt for this instrument
    const recentAttempts = dbEngine.getEmaLiveOrderAttempts(inst, 200);
    const inFlightAttempt = recentAttempts.find(a => ['CREATED', 'SUBMITTED', 'OPEN', 'UNKNOWN', 'PARTIALLY_FILLED'].includes(a.orderStatus));
    if (inFlightAttempt) {
      console.log(`[EMA LIVE] In-flight entry attempt ${inFlightAttempt.id} exists for ${inst}. Suppressing duplicate entry.`);
      return {
        enabled: true,
        status: 'HELD',
        brokerOrderId: inFlightAttempt.brokerOrderId,
        requestedQuantity: quantity,
        filledQuantity: 0,
        positionCreated: false,
        message: `In-flight live order ${inFlightAttempt.brokerOrderId || inFlightAttempt.id} pending. Suppressing duplicate entry.`
      };
    }

    // 1. Check if an active live position already exists on this instrument
    const existingLivePos = dbEngine.getOpenEmaLivePositionByInstrument(inst);
    if (existingLivePos) {
      const isOpposite = (signal.signalType === 'BULLISH' && existingLivePos.optionType === 'PE') ||
                         (signal.signalType === 'BEARISH' && existingLivePos.optionType === 'CE');

      if (isOpposite) {
        console.log(`[EMA LIVE] 🔄 Reversal: Exiting old live position ${existingLivePos.id} before opening new entry.`);
        const exitResult = await this.requestLiveExit(existingLivePos.id, 'OPPOSITE_CROSSOVER');
        if (!exitResult.success) {
          console.warn(`[EMA LIVE] Reversal exit failed for ${existingLivePos.id}. Blocking new live entry.`);
          return {
            enabled: true,
            status: 'SKIPPED',
            requestedQuantity: quantity,
            filledQuantity: 0,
            positionCreated: false,
            message: `Reversal blocked: Failed to exit opposite live position ${existingLivePos.id}: ${exitResult.message}`
          };
        }
        // Verify old position is not still open before submitting new BUY
        const postExitPos = dbEngine.getOpenEmaLivePositionByInstrument(inst);
        if (postExitPos) {
          console.warn(`[EMA LIVE] Reversal exit for ${existingLivePos.id} still active or failed. Blocking new live entry.`);
          return {
            enabled: true,
            status: 'SKIPPED',
            requestedQuantity: quantity,
            filledQuantity: 0,
            positionCreated: false,
            message: `Reversal blocked: Opposite live position ${existingLivePos.id} is still ${postExitPos.status}.`
          };
        }
      } else {
        console.log(`[EMA LIVE] Live position in same direction already open on ${inst}. Maintaining position without averaging.`);
        return {
          enabled: true,
          status: 'HELD',
          requestedQuantity: quantity,
          filledQuantity: 0,
          positionCreated: false,
          positionId: existingLivePos.id,
          message: 'Live position already active. Maintained without averaging.'
        };
      }
    }

    // 2. Pre-Trade Safety Verification. All account values are broker-origin.
    const staticCheck = this.validatePreTrade(signal, contract, userId);
    let preCheck = staticCheck;
    if (staticCheck.passed) {
      try {
        const snapshot = typeof (activeProvider as any)?.getEmaBrokerRiskSnapshot === 'function'
          ? await (activeProvider as any).getEmaBrokerRiskSnapshot(contract.brokerInstrumentKey, quantity, productType)
          : null;
        preCheck = evaluateEmaBrokerRisk(snapshot, settings.maxDailyLossLimit ?? 5000);
      } catch (riskErr: any) {
        preCheck = { passed: false, failureReason: 'Unable to validate real broker account risk: ' +
          (riskErr?.message || String(riskErr)) };
      }
    }

    if (!preCheck.passed) {
      const orderAttempt: EmaLiveOrderAttempt = {
        id: attemptId,
        signalId: signal.id,
        executionMode: 'LIVE',
        instrument: inst,
        brokerAccountId: (activeProvider as any)?.userId || undefined,
        brokerInstrumentKey: contract.brokerInstrumentKey,
        tradingsymbol: contract.tradingsymbol,
        optionType: contract.optionType,
        strike: contract.strikePrice,
        expiry: contract.expiryDate,
        requestedQuantity: quantity,
        filledQuantity: 0,
        orderStatus: 'PRE_TRADE_REJECTED',
        rejectionReason: preCheck.failureReason,
        createdAt: timestampStr,
        updatedAt: timestampStr
      };

      dbEngine.saveEmaLiveOrderAttempt(orderAttempt);

      const randPre = Math.random().toString(36).slice(2, 8);
      dbEngine.logEmaExecutionEvent({
        id: `evt-live-pre-rej-${Date.now()}-${randPre}`,
        signalId: signal.id,
        executionId: attemptId,
        executionMode: 'LIVE',
        stage: 'LIVE_PRE_TRADE_CHECK',
        status: 'REJECTED',
        instrument: inst,
        errorCode: 'PRE_TRADE_CHECK_FAILED',
        errorMessage: preCheck.failureReason,
        details: { preCheck, contract },
        timestamp: timestampStr
      });

      dbEngine.logEmaExecution({
        id: `exec-pre-rej-${Date.now()}-${randPre}`,
        timestamp: timestampStr,
        level: 'WARN',
        stage: 'PRE_TRADE',
        instrument: inst,
        message: `🛡️ Live Order Blocked: ${preCheck.failureReason}`,
        details: { rejectionReason: preCheck.failureReason }
      });

      return {
        enabled: true,
        status: 'PRE_TRADE_REJECTED',
        requestedQuantity: quantity,
        filledQuantity: 0,
        positionCreated: false,
        rejectionReason: preCheck.failureReason,
        message: preCheck.failureReason
      };
    }

    // 3. Create SUBMITTED Order Attempt Record
    const orderAttempt: EmaLiveOrderAttempt = {
      id: attemptId,
      signalId: signal.id,
      executionMode: 'LIVE',
      instrument: inst,
      brokerAccountId: (activeProvider as any)?.userId || undefined,
      brokerInstrumentKey: contract.brokerInstrumentKey,
      tradingsymbol: contract.tradingsymbol,
      optionType: contract.optionType,
      strike: contract.strikePrice,
      expiry: contract.expiryDate,
      requestedQuantity: quantity,
      filledQuantity: 0,
      orderStatus: 'SUBMITTED',
      submittedAt: timestampStr,
      createdAt: timestampStr,
      updatedAt: timestampStr
    };
    dbEngine.saveEmaLiveOrderAttempt(orderAttempt);

    dbEngine.logEmaExecutionEvent({
      id: `evt-live-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      signalId: signal.id,
      executionId: attemptId,
      executionMode: 'LIVE',
      stage: 'LIVE_ORDER_SUBMITTED',
      status: 'PENDING',
      instrument: inst,
      details: { tradingsymbol: contract.tradingsymbol, quantity, productType },
      timestamp: timestampStr
    });

    // 4. Dispatch Order to Broker Gateway (Upstox API v2)
    try {
      const brokerRes = await (activeProvider as any).placeOrder({
        quantity,
        product: productType === 'MIS' ? 'MIS' : 'NRML',
        validity: 'DAY',
        orderType: 'MARKET',
        transactionType: 'BUY',
        tradingsymbol: contract.tradingsymbol,
        symbol: contract.tradingsymbol,
        instrumentToken: contract.brokerInstrumentKey,
        tag: 'ema15m_live'
      });

      const brokerOrderId = brokerRes?.order_id || brokerRes?.orderId;
      if (!brokerOrderId) {
        throw new Error('Broker did not return an authoritative order identifier.');
      }

      // Check broker acknowledgment & fills
      // In production Upstox, placeOrder returns { order_id: "..." } for acknowledgment.
      // Order status is SUBMITTED with 0 filledQty until authoritative fill confirmation is received.
      const brokerStatusStr = (brokerRes?.status || brokerRes?.order_status || '').toUpperCase();
      const brokerFilledQty = Number(brokerRes?.filled_quantity ?? brokerRes?.filledQuantity ?? 0);
      const brokerFillPrice = Number(brokerRes?.average_price ?? brokerRes?.averagePrice ?? 0);
      const isConfirmedFill = (brokerStatusStr === 'COMPLETE' || brokerStatusStr === 'FILLED') &&
        Number.isInteger(brokerFilledQty) && brokerFilledQty > 0 && brokerFilledQty <= quantity &&
        Number.isFinite(brokerFillPrice) && brokerFillPrice > 0;

      // An estimated option premium is NEVER evidence of a broker execution price.
      const filledQty = isConfirmedFill ? brokerFilledQty : 0;
      const avgFillPrice = isConfirmedFill ? brokerFillPrice : 0;
      const finalStatus: OrderStatus = isConfirmedFill ? 'FILLED' : 'SUBMITTED';

      dbEngine.updateEmaLiveOrderAttempt(attemptId, {
        brokerOrderId,
        orderStatus: finalStatus,
        filledQuantity: filledQty,
        averageFillPrice: isConfirmedFill ? avgFillPrice : undefined,
        lastBrokerUpdateAt: new Date().toISOString()
      });

      // 5. Create authoritative Live Position ONLY upon confirmed fill
      let positionId: string | undefined;
      if (isConfirmedFill && filledQty > 0) {
        positionId = `live-pos-${inst.toLowerCase()}-${Date.now()}`;
        const stopLoss = StrategyRules.calculateStopLoss(avgFillPrice);
        const targetPrice = StrategyRules.calculateTargetPrice(avgFillPrice);

        const livePosition: EmaLivePosition = {
          id: positionId,
          attemptId,
          signalId: signal.id,
          instrument: inst,
          brokerAccountId: (activeProvider as any)?.userId || undefined,
          brokerInstrumentKey: contract.brokerInstrumentKey,
          tradingsymbol: contract.tradingsymbol,
          optionType: contract.optionType,
          strikePrice: contract.strikePrice,
          expiryDate: contract.expiryDate,
          productType,
          side: 'BUY',
          marketBias: signal.signalType,
          entryBrokerOrderId: brokerOrderId,
          entryTimestamp: new Date().toISOString(),
          entryPrice: avgFillPrice,
          quantity: filledQty,
          lotSize: contract.lotSize,
          currentPrice: avgFillPrice,
          unrealizedPnl: 0,
          stopLoss,
          targetPrice,
          status: 'OPEN',
          grossPnl: 0,
          brokerage: 40,
          netPnl: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        dbEngine.saveEmaLivePosition(livePosition);

        const randFill = Math.random().toString(36).slice(2, 8);
        dbEngine.logEmaExecutionEvent({
          id: `evt-live-fill-${Date.now()}-${randFill}`,
          signalId: signal.id,
          executionId: positionId,
          executionMode: 'LIVE',
          stage: 'LIVE_ORDER_FILLED',
          status: 'SUCCESS',
          instrument: inst,
          brokerOrderId,
          details: { positionId, brokerOrderId, filledQty, avgFillPrice, stopLoss, targetPrice },
          timestamp: new Date().toISOString()
        });

        dbEngine.logEmaExecution({
          id: `exec-live-ok-${Date.now()}-${randFill}`,
          timestamp: new Date().toISOString(),
          level: 'SUCCESS',
          stage: 'BROKER_RESPONSE',
          instrument: inst,
          message: `🟢 LIVE Upstox Order FILLED! Order ID: ${brokerOrderId} | Position: ${contract.tradingsymbol} (${filledQty} Qty) @ ₹${avgFillPrice}`,
          details: { brokerOrderId, positionId, filledQty, avgFillPrice }
        });
      } else {
        const randSub = Math.random().toString(36).slice(2, 8);
        dbEngine.logEmaExecutionEvent({
          id: `evt-live-sub-${Date.now()}-${randSub}`,
          signalId: signal.id,
          executionId: attemptId,
          executionMode: 'LIVE',
          stage: 'LIVE_ORDER_SUBMITTED',
          status: 'SUCCESS',
          instrument: inst,
          brokerOrderId,
          details: { attemptId, requestedQuantity: quantity },
          timestamp: new Date().toISOString()
        });

        dbEngine.logEmaExecution({
          id: `exec-live-sub-${Date.now()}-${randSub}`,
          timestamp: new Date().toISOString(),
          level: 'INFO',
          stage: 'BROKER_RESPONSE',
          instrument: inst,
          message: `🟡 LIVE Order SUBMITTED to Upstox. Awaiting fill. Order ID: ${brokerOrderId} | ${contract.tradingsymbol} x ${quantity}`,
          details: { brokerOrderId, attemptId, requestedQuantity: quantity }
        });
      }

      return {
        enabled: true,
        status: finalStatus,
        brokerOrderId,
        requestedQuantity: quantity,
        filledQuantity: filledQty,
        positionCreated: Boolean(positionId),
        positionId,
        message: isConfirmedFill
          ? `Live order filled on Upstox. Position ${positionId} opened.`
          : `Live order ${brokerOrderId} submitted to Upstox. Awaiting broker execution fill.`
      };
    } catch (brokerErr: any) {
      // A network timeout can occur after broker acceptance: never assume REJECTED.
      const definitiveRejection = brokerErr?.isBrokerRejection === true;
      const resultStatus: OrderStatus = definitiveRejection ? 'REJECTED' : 'UNKNOWN';
      const rejectionReason = brokerErr?.message || 'Broker order outcome unconfirmed';
      console.warn(`[EMA LIVE] Upstox order ${resultStatus}: ${rejectionReason}`);

      dbEngine.updateEmaLiveOrderAttempt(attemptId, {
        orderStatus: resultStatus,
        filledQuantity: 0,
        rejectionReason,
        lastBrokerUpdateAt: new Date().toISOString()
      });

      const randRej = Math.random().toString(36).slice(2, 8);
      dbEngine.logEmaExecutionEvent({
        id: `evt-live-rej-${Date.now()}-${randRej}`,
        signalId: signal.id,
        executionId: attemptId,
        executionMode: 'LIVE',
        stage: 'LIVE_ORDER_REJECTED',
        status: definitiveRejection ? 'REJECTED' : 'PENDING',
        instrument: inst,
        errorCode: definitiveRejection ? 'BROKER_REJECTION' : 'BROKER_ORDER_OUTCOME_UNKNOWN',
        errorMessage: rejectionReason,
        details: { rejectionReason, tradingsymbol: contract.tradingsymbol },
        timestamp: new Date().toISOString()
      });

      dbEngine.logEmaExecution({
        id: `exec-live-err-${Date.now()}-${randRej}`,
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        stage: 'BROKER_RESPONSE',
        instrument: inst,
        message: `Upstox order ${resultStatus}: ${rejectionReason}. Position not assumed; reconcile before retry.`,
        details: { rejectionReason, tradingsymbol: contract.tradingsymbol }
      });

      return {
        enabled: true,
        status: resultStatus,
        requestedQuantity: quantity,
        filledQuantity: 0,
        positionCreated: false,
        rejectionReason,
        message: definitiveRejection ? rejectionReason : 'Broker outcome UNKNOWN; no automatic retry until reconciled.'
      };
    }
  }

  /**
   * Evaluates mark-to-market, Stop-Loss, Target and Trailing SL for confirmed LIVE positions
   */
  public async monitorLivePositions(
    instrument: string,
    currentSpotPrice: number,
    getEstimatedOptionPrice: (inst: any, strike: number, type: any, expiry: string, spot: number) => number
  ): Promise<void> {
    const openPositions = dbEngine.getOpenEmaLivePositions(instrument);
    if (!openPositions || openPositions.length === 0) return;

    const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
    const trailingEnabled = settings.trailingSlEnabled !== false;
    const profitLockPts = settings.profitLockPoints ?? 70;
    const trailDistancePts = settings.trailDistancePoints ?? 30;

    for (const pos of openPositions) {
      if (pos.status !== 'OPEN' || this.pendingExitIds.has(pos.id)) {
        continue; // Only monitor actively open positions; skip EXIT_PENDING, EXIT_FAILED, or in-flight exits
      }

      const entryPrice = Number(pos.entryPrice);
      const qty = Number(pos.quantity);

      // Never trigger a REAL SELL from theoretical Black-Scholes/fallback option prices.
      // Missing/stale broker quotes require an explicit unresolved data state.
      if (typeof (activeProvider as any)?.getLiveOptionQuote !== 'function') {
        console.warn('[EMA LIVE] Real option quote provider unavailable for ' + pos.tradingsymbol);
        continue;
      }
      const quote = await (activeProvider as any).getLiveOptionQuote(pos.brokerInstrumentKey || '');
      if (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) {
        console.warn('[EMA LIVE] Skipping SL/TP evaluation: no fresh Upstox option quote for ' + pos.tradingsymbol);
        continue;
      }
      const currentOptionPrice = Number(quote.price);

      const grossPnl = StrategyRules.calculateOptionGrossPnl(entryPrice, currentOptionPrice, qty);
      const netPnl = StrategyRules.calculateOptionNetPnl(grossPnl, pos.brokerage || 40);

      let shouldExit = false;
      let exitReason = '';
      let updatedTrailingSl = pos.trailingStopLoss;
      let updatedIsTrailing = pos.isTrailingActive;

      if (trailingEnabled) {
        const targetThreshold = pos.targetPrice || (entryPrice + 100);
        const trailResult = StrategyRules.evaluateTrailingSl(
          entryPrice,
          currentOptionPrice,
          currentOptionPrice,
          pos.trailingStopLoss,
          pos.isTrailingActive || false,
          targetThreshold,
          profitLockPts,
          trailDistancePts
        );

        updatedTrailingSl = trailResult.updatedTrailingSl;
        updatedIsTrailing = trailResult.updatedIsTrailing;

        if (trailResult.shouldExit) {
          shouldExit = true;
          exitReason = trailResult.exitReason || 'TRAILING_SL_HIT';
        } else if (!updatedIsTrailing && pos.stopLoss !== undefined && currentOptionPrice <= pos.stopLoss) {
          shouldExit = true;
          exitReason = 'SL_HIT';
        }
      } else {
        if (pos.stopLoss !== undefined && currentOptionPrice <= pos.stopLoss) {
          shouldExit = true;
          exitReason = 'SL_HIT';
        } else if (pos.targetPrice !== undefined && currentOptionPrice >= pos.targetPrice) {
          shouldExit = true;
          exitReason = 'TARGET_HIT';
        }
      }

      if (shouldExit) {
        await this.requestLiveExit(pos.id, exitReason, currentOptionPrice);
      } else {
        dbEngine.updateEmaLivePosition(pos.id, {
          currentPrice: currentOptionPrice,
          unrealizedPnl: grossPnl,
          trailingStopLoss: updatedTrailingSl,
          isTrailingActive: updatedIsTrailing
        });
      }
    }
  }

  /**
   * Requests an authoritative broker market SELL exit for a confirmed live position
   */
  public async requestLiveExit(
    positionId: string,
    reason: string = 'MANUAL',
    currentOptionPrice?: number
  ): Promise<{ success: boolean; message: string; exitBrokerOrderId?: string }> {
    const livePositions = dbEngine.getOpenEmaLivePositions();
    const pos = livePositions.find(p => p.id === positionId);

    if (!pos) {
      return { success: false, message: `Live position ${positionId} not found or already closed.` };
    }

    // Partial BUY fills are genuine exposure, but the unfilled remainder could
    // execute AFTER a SELL. Until BUY is terminal/cancelled, prevent unmatched
    // exit orders and require an explicit broker-side order reconciliation.
    const entryAttempt = dbEngine.getEmaLiveOrderAttemptById(pos.attemptId);
    if (entryAttempt && ['CREATED', 'SUBMITTED', 'OPEN', 'UNKNOWN', 'PARTIALLY_FILLED'].includes(entryAttempt.orderStatus)) {
      return {
        success: false,
        message: `Cannot dispatch SELL: entry BUY ${entryAttempt.brokerOrderId || entryAttempt.id} has unresolved remaining quantity. Cancel/reconcile BUY first.`
      };
    }

    // An acknowledged SELL or a partial exit is still real exposure. Never submit another
    // SELL until its broker order has been reconciled and remaining quantity verified.
    if (!['OPEN', 'EXIT_FAILED'].includes(pos.status) || pos.exitBrokerOrderId) {
      return { success: false, message: `Exit for live position ${positionId} is unresolved (${pos.status}). Reconcile broker first.` };
    }
    if (this.pendingExitIds.has(pos.id)) {
      return { success: false, message: `Exit already in flight for live position ${positionId}.` };
    }

    this.pendingExitIds.add(pos.id);
    const timestampStr = new Date().toISOString();

    dbEngine.updateEmaLivePosition(pos.id, {
      status: 'EXIT_REQUESTED'
    });

    dbEngine.logEmaExecutionEvent({
      id: `evt-live-exit-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      signalId: pos.signalId,
      executionId: pos.id,
      executionMode: 'LIVE',
      stage: 'LIVE_EXIT_REQUESTED',
      status: 'PENDING',
      instrument: pos.instrument,
      details: { positionId: pos.id, tradingsymbol: pos.tradingsymbol, quantity: pos.quantity, reason },
      timestamp: timestampStr
    });

    try {
      // Check broker connection before attempting order placement
      const brokerConnected = activeProvider && (
        typeof (activeProvider as any).isUpstoxLiveConnected === 'function'
          ? (activeProvider as any).isUpstoxLiveConnected()
          : Boolean((activeProvider as any).isConnected)
      );

      if (!brokerConnected || typeof (activeProvider as any).placeOrder !== 'function') {
        const disconnectMsg = 'Upstox API is not connected. Cannot execute live order.';
        console.warn(`[EMA LIVE] ⚠️ Upstox broker disconnected. Cannot dispatch live exit for ${pos.tradingsymbol}`);

        dbEngine.updateEmaLivePosition(pos.id, {
          status: 'EXIT_FAILED',
          exitReason: disconnectMsg
        });

        const randomSuffix = Math.random().toString(36).slice(2, 8);
        dbEngine.logEmaExecutionEvent({
          id: `evt-live-exit-err-${Date.now()}-${randomSuffix}`,
          signalId: pos.signalId,
          executionId: pos.id,
          executionMode: 'LIVE',
          stage: 'LIVE_EXIT_FAILED',
          status: 'FAILED',
          instrument: pos.instrument,
          errorCode: 'BROKER_NOT_CONNECTED',
          errorMessage: disconnectMsg,
          details: { error: disconnectMsg },
          timestamp: new Date().toISOString()
        });

        dbEngine.logEmaExecution({
          id: `exec-live-exit-err-${Date.now()}-${randomSuffix}`,
          timestamp: new Date().toISOString(),
          level: 'WARN',
          stage: 'EXIT',
          instrument: pos.instrument,
          message: `⚠️ Cannot close LIVE position on Upstox: ${disconnectMsg}. Position marked as EXIT_FAILED.`,
          details: { error: disconnectMsg, positionId: pos.id }
        });

        this.pendingExitIds.delete(pos.id);
        return { success: false, message: disconnectMsg };
      }

      // Submit real SELL order to Upstox API v2
      const exitRes = await (activeProvider as any).placeOrder({
        quantity: pos.quantity,
        product: pos.productType || 'MIS',
        validity: 'DAY',
        orderType: 'MARKET',
        transactionType: 'SELL',
        tradingsymbol: pos.tradingsymbol,
        symbol: pos.tradingsymbol,
        instrumentToken: pos.brokerInstrumentKey,
        tag: 'ema15m_exit'
      });

      const exitBrokerOrderId = exitRes?.order_id || exitRes?.orderId;
      if (!exitBrokerOrderId) {
        throw new Error('Broker did not return an authoritative order identifier for exit.');
      }

      const exitStatusStr = (exitRes?.status || exitRes?.order_status || '').toUpperCase();
      const brokerExitQty = Number(exitRes?.filled_quantity ?? exitRes?.filledQuantity ?? 0);
      const brokerExitPrice = Number(exitRes?.average_price ?? exitRes?.averagePrice ?? 0);
      const isExitFilled = (exitStatusStr === 'COMPLETE' || exitStatusStr === 'FILLED') &&
        Number.isInteger(brokerExitQty) && brokerExitQty === Number(pos.quantity) &&
        Number.isFinite(brokerExitPrice) && brokerExitPrice > 0;

      const randomSuffix = Math.random().toString(36).slice(2, 8);
      if (isExitFilled) {
        const exitPrice = brokerExitPrice;
        const grossPnl = StrategyRules.calculateOptionGrossPnl(pos.entryPrice, exitPrice, pos.quantity);
        const netPnl = StrategyRules.calculateOptionNetPnl(grossPnl, pos.brokerage || 40);

        dbEngine.updateEmaLivePosition(pos.id, {
          status: 'CLOSED',
          exitBrokerOrderId,
          exitTimestamp: new Date().toISOString(),
          exitPrice,
          exitReason: reason,
          grossPnl,
          netPnl,
          unrealizedPnl: 0
        });

        dbEngine.logEmaExecutionEvent({
          id: `evt-live-exit-ok-${Date.now()}-${randomSuffix}`,
          signalId: pos.signalId,
          executionId: pos.id,
          executionMode: 'LIVE',
          stage: 'LIVE_EXIT_FILLED',
          status: 'SUCCESS',
          instrument: pos.instrument,
          brokerOrderId: exitBrokerOrderId,
          details: { exitBrokerOrderId, exitPrice, grossPnl, netPnl, reason },
          timestamp: new Date().toISOString()
        });

        dbEngine.logEmaExecution({
          id: `exec-live-exit-ok-${Date.now()}-${randomSuffix}`,
          timestamp: new Date().toISOString(),
          level: 'SUCCESS',
          stage: 'EXIT',
          instrument: pos.instrument,
          message: `🟢 LIVE Position CLOSED on Upstox! Order ID: ${exitBrokerOrderId} | ${pos.tradingsymbol} @ ₹${exitPrice} (Net P&L: ₹${netPnl})`,
          details: { exitBrokerOrderId, exitPrice, netPnl }
        });

        this.pendingExitIds.delete(pos.id);
        return { success: true, message: `Live position closed on broker. Order ID: ${exitBrokerOrderId}`, exitBrokerOrderId };
      } else {
        // Exit order submitted to broker; remains visible and tracked until fill confirmed
        dbEngine.updateEmaLivePosition(pos.id, {
          status: 'EXIT_PENDING',
          exitBrokerOrderId,
          exitReason: reason
        });

        dbEngine.logEmaExecutionEvent({
          id: `evt-live-exit-sub-${Date.now()}-${randomSuffix}`,
          signalId: pos.signalId,
          executionId: pos.id,
          executionMode: 'LIVE',
          stage: 'LIVE_EXIT_SUBMITTED',
          status: 'SUCCESS',
          instrument: pos.instrument,
          brokerOrderId: exitBrokerOrderId,
          details: { exitBrokerOrderId, reason },
          timestamp: new Date().toISOString()
        });

        dbEngine.logEmaExecution({
          id: `exec-live-exit-sub-${Date.now()}-${randomSuffix}`,
          timestamp: new Date().toISOString(),
          level: 'INFO',
          stage: 'EXIT',
          instrument: pos.instrument,
          message: `🟡 LIVE Exit Order SUBMITTED to Upstox. Awaiting fill. Order ID: ${exitBrokerOrderId} | ${pos.tradingsymbol}`,
          details: { exitBrokerOrderId, reason }
        });

        this.pendingExitIds.delete(pos.id);
        return { success: true, message: `Live exit order submitted to broker. Order ID: ${exitBrokerOrderId}`, exitBrokerOrderId };
      }
    } catch (exitErr: any) {
      console.error(`[EMA LIVE] 🔴 Error dispatching broker exit order for ${pos.tradingsymbol}:`, exitErr.message);

      // Transport errors can occur AFTER a broker accepted SELL. Preserve unresolved
      // state rather than marking it retryable and risking a duplicate real SELL.
      dbEngine.updateEmaLivePosition(pos.id, {
        status: 'EXIT_REQUESTED',
        exitReason: `Exit submission outcome UNKNOWN: ${exitErr.message}`
      });

      const randomSuffix = Math.random().toString(36).slice(2, 8);
      dbEngine.logEmaExecutionEvent({
        id: `evt-live-exit-err-${Date.now()}-${randomSuffix}`,
        signalId: pos.signalId,
        executionId: pos.id,
        executionMode: 'LIVE',
        stage: 'LIVE_EXIT_FAILED',
        status: 'FAILED',
        instrument: pos.instrument,
        errorCode: 'BROKER_EXIT_ERROR',
        errorMessage: exitErr.message,
        details: { error: exitErr.message },
        timestamp: new Date().toISOString()
      });

      dbEngine.logEmaExecution({
        id: `exec-live-exit-err-${Date.now()}-${randomSuffix}`,
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        stage: 'EXIT',
        instrument: pos.instrument,
        message: `🔴 Failed to close LIVE position on Upstox: ${exitErr.message}. Position remains UNRESOLVED.`,
        details: { error: exitErr.message, positionId: pos.id }
      });

      this.pendingExitIds.delete(pos.id);
      return { success: false, message: exitErr.message };
    }
  }

  /**
   * Intraday Forced Square-off for LIVE positions at 15:15 IST
   */
  public async checkForcedIntradaySquareOff(): Promise<void> {
    const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
    const forceTime = settings.forceSquareOffTime || '15:15';

    if (!SessionCalendar.isAtOrPastForcedSquareOff(new Date(), forceTime)) {
      return;
    }

    const openPositions = dbEngine.getOpenEmaLivePositions();
    if (!openPositions || openPositions.length === 0) return;

    console.log(`[EMA LIVE INTRADAY] ⏰ Reached force square-off time (${forceTime} IST). Exiting ${openPositions.length} live position(s)...`);

    for (const pos of openPositions) {
      if (pos.status === 'OPEN' && !this.pendingExitIds.has(pos.id)) {
        await this.requestLiveExit(pos.id, 'FORCED_INTRADAY_SQUARE_OFF');
      }
    }
  }
}

export const liveExecutionService = LiveExecutionService.getInstance();
