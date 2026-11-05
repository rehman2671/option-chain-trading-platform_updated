/**
 * Broker Order & Position Reconciler for EMA 15M Engine
 * Synchronizes broker order statuses, detects fills, and recovers state across restarts.
 */

import { dbEngine } from '../../db.js';
import { activeProvider } from '../providers/index.js';
import { StrategyRules } from './strategyRules.js';
import { EmaLiveOrderAttempt, EmaLivePosition } from './types.js';

export class BrokerOrderReconciler {
  private static instance: BrokerOrderReconciler;

  private constructor() {}

  public static getInstance(): BrokerOrderReconciler {
    if (!BrokerOrderReconciler.instance) {
      BrokerOrderReconciler.instance = new BrokerOrderReconciler();
    }
    return BrokerOrderReconciler.instance;
  }

  /**
   * Reconciles all pending live order attempts and open positions with broker state
   */
  public async reconcileBrokerState(): Promise<{
    checkedAttempts: number;
    updatedPositions: number;
    reconciledAttempts: number;
    reconciledPositions: number;
    discrepancies: string[];
  }> {
    const discrepancies: string[] = [];
    let reconciledAttempts = 0;
    let reconciledPositions = 0;
    let updatedPositions = 0;

    const isConnected = activeProvider && (
      typeof (activeProvider as any).isUpstoxLiveConnected === 'function'
        ? (activeProvider as any).isUpstoxLiveConnected()
        : Boolean((activeProvider as any).isConnected)
    );

    if (!isConnected || typeof (activeProvider as any).getOrderHistory !== 'function') {
      return {
        checkedAttempts: 0,
        updatedPositions: 0,
        reconciledAttempts: 0,
        reconciledPositions: 0,
        discrepancies: ['Broker not connected. Skipping broker query.']
      };
    }

    try {
      // 1. Reconcile pending order attempts (SUBMITTED / OPEN)
      const attempts = dbEngine.getEmaLiveOrderAttempts('ALL', 50);
      const pendingAttempts = attempts.filter(a => a.orderStatus === 'SUBMITTED' || a.orderStatus === 'OPEN');

      for (const att of pendingAttempts) {
        if (!att.brokerOrderId) continue;

        try {
          const history = await (activeProvider as any).getOrderHistory(att.brokerOrderId);
          if (Array.isArray(history) && history.length > 0) {
            const latest = history[history.length - 1];
            const status = (latest.status || latest.order_status || '').toUpperCase();
            const filledQty = Number(latest.filled_quantity || latest.quantity || 0);
            const avgPrice = Number(latest.average_price || latest.price || 0);

            if (status === 'COMPLETE' || status === 'FILLED') {
              const finalQty = filledQty || att.requestedQuantity;
              const finalPrice = avgPrice || att.averageFillPrice || 0;

              dbEngine.updateEmaLiveOrderAttempt(att.id, {
                orderStatus: 'FILLED',
                filledQuantity: finalQty,
                averageFillPrice: finalPrice,
                lastBrokerUpdateAt: new Date().toISOString()
              });

              // Check if a position already exists for this attempt
              const existingPos = dbEngine.getEmaLivePositionByAttemptId(att.id);
              if (!existingPos && finalQty > 0) {
                const randSuffix = Math.random().toString(36).slice(2, 8);
                const posId = `live-pos-${att.instrument.toLowerCase()}-${Date.now()}-${randSuffix.slice(0, 4)}`;
                const stopLoss = StrategyRules.calculateStopLoss(finalPrice);
                const targetPrice = StrategyRules.calculateTargetPrice(finalPrice);

                const livePosition: EmaLivePosition = {
                  id: posId,
                  attemptId: att.id,
                  signalId: att.signalId,
                  instrument: att.instrument,
                  brokerAccountId: att.brokerAccountId,
                  brokerInstrumentKey: att.brokerInstrumentKey,
                  tradingsymbol: att.tradingsymbol,
                  optionType: att.optionType,
                  strikePrice: att.strike,
                  expiryDate: att.expiry,
                  productType: 'MIS',
                  side: 'BUY',
                  marketBias: att.optionType === 'CE' ? 'BULLISH' : 'BEARISH',
                  entryBrokerOrderId: att.brokerOrderId,
                  entryTimestamp: new Date().toISOString(),
                  entryPrice: finalPrice,
                  quantity: finalQty,
                  lotSize: finalQty,
                  currentPrice: finalPrice,
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

                dbEngine.logEmaExecutionEvent({
                  id: `evt-reconcile-fill-${Date.now()}-${randSuffix}`,
                  signalId: att.signalId,
                  executionId: posId,
                  executionMode: 'LIVE',
                  stage: 'LIVE_ORDER_FILLED',
                  status: 'SUCCESS',
                  instrument: att.instrument,
                  brokerOrderId: att.brokerOrderId,
                  details: { posId, finalQty, finalPrice, reconciled: true },
                  timestamp: new Date().toISOString()
                });

                dbEngine.logEmaExecution({
                  id: `exec-reconcile-fill-${Date.now()}-${randSuffix}`,
                  timestamp: new Date().toISOString(),
                  level: 'SUCCESS',
                  stage: 'BROKER_RESPONSE',
                  instrument: att.instrument,
                  message: `🔄 Reconciler confirmed fill for order ${att.brokerOrderId}. Position ${posId} opened @ ₹${finalPrice}`,
                  details: { brokerOrderId: att.brokerOrderId, posId, finalQty, finalPrice }
                });

                updatedPositions++;
              }

              reconciledAttempts++;
            } else if (status === 'REJECTED' || status === 'CANCELLED') {
              dbEngine.updateEmaLiveOrderAttempt(att.id, {
                orderStatus: status === 'CANCELLED' ? 'CANCELLED' : 'REJECTED',
                rejectionReason: latest.status_message || latest.rejection_reason || 'Broker order rejected',
                lastBrokerUpdateAt: new Date().toISOString()
              });
              reconciledAttempts++;
            }
          }
        } catch (err: any) {
          discrepancies.push(`Failed reconciling order attempt ${att.id}: ${err.message}`);
        }
      }

      // 2. Reconcile active positions (including EXIT_PENDING, EXIT_REQUESTED, EXIT_FAILED)
      const openPositions = dbEngine.getOpenEmaLivePositions();
      for (const pos of openPositions) {
        if ((pos.status === 'EXIT_PENDING' || pos.status === 'EXIT_REQUESTED') && pos.exitBrokerOrderId) {
          try {
            const exitHistory = await (activeProvider as any).getOrderHistory(pos.exitBrokerOrderId);
            if (Array.isArray(exitHistory) && exitHistory.length > 0) {
              const latestExit = exitHistory[exitHistory.length - 1];
              const exitStatus = (latestExit.status || latestExit.order_status || '').toUpperCase();

              if (exitStatus === 'COMPLETE' || exitStatus === 'FILLED') {
                const fillPrice = Number(latestExit.average_price || latestExit.price || pos.currentPrice || pos.entryPrice);
                const grossPnl = StrategyRules.calculateOptionGrossPnl(pos.entryPrice, fillPrice, pos.quantity);
                const netPnl = StrategyRules.calculateOptionNetPnl(grossPnl, pos.brokerage || 40);

                dbEngine.updateEmaLivePosition(pos.id, {
                  status: 'CLOSED',
                  exitTimestamp: new Date().toISOString(),
                  exitPrice: fillPrice,
                  grossPnl,
                  netPnl,
                  unrealizedPnl: 0
                });

                const randExit = Math.random().toString(36).slice(2, 8);
                dbEngine.logEmaExecutionEvent({
                  id: `evt-reconcile-exit-${Date.now()}-${randExit}`,
                  signalId: pos.signalId,
                  executionId: pos.id,
                  executionMode: 'LIVE',
                  stage: 'LIVE_EXIT_FILLED',
                  status: 'SUCCESS',
                  instrument: pos.instrument,
                  brokerOrderId: pos.exitBrokerOrderId,
                  details: { posId: pos.id, fillPrice, grossPnl, netPnl, reconciled: true },
                  timestamp: new Date().toISOString()
                });

                dbEngine.logEmaExecution({
                  id: `exec-reconcile-exit-${Date.now()}-${randExit}`,
                  timestamp: new Date().toISOString(),
                  level: 'SUCCESS',
                  stage: 'EXIT',
                  instrument: pos.instrument,
                  message: `🔄 Reconciler confirmed exit fill for position ${pos.id} (Order: ${pos.exitBrokerOrderId}) @ ₹${fillPrice} | Net P&L: ₹${netPnl}`,
                  details: { posId: pos.id, exitBrokerOrderId: pos.exitBrokerOrderId, fillPrice, netPnl }
                });

                updatedPositions++;
              } else if (exitStatus === 'REJECTED' || exitStatus === 'CANCELLED') {
                dbEngine.updateEmaLivePosition(pos.id, {
                  status: 'EXIT_FAILED',
                  exitReason: latestExit.status_message || latestExit.rejection_reason || 'Broker exit order rejected'
                });
                discrepancies.push(`Live position ${pos.id} exit order ${pos.exitBrokerOrderId} rejected by broker`);
                updatedPositions++;
              }
            }
          } catch (exitErr: any) {
            discrepancies.push(`Failed reconciling exit order for position ${pos.id}: ${exitErr.message}`);
          }
        }

        reconciledPositions++;
      }
    } catch (err: any) {
      discrepancies.push(`Reconciliation error: ${err.message}`);
    }

    return {
      checkedAttempts: reconciledAttempts,
      updatedPositions,
      reconciledAttempts,
      reconciledPositions,
      discrepancies
    };
  }
}

export const brokerOrderReconciler = BrokerOrderReconciler.getInstance();
