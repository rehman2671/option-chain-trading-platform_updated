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
      // Scan all reasonably recent attempts, not just the latest 50;
      // older unresolved broker orders are safety critical after a restart.
      const attempts: EmaLiveOrderAttempt[] = [];
      for (let offset = 0; offset < 5000; offset += 200) {
        const page = dbEngine.getEmaLiveOrderAttempts('ALL', 200, offset);
        attempts.push(...page);
        if (page.length < 200) break;
        if (offset === 4800) {
          discrepancies.push('More than 5000 EMA order attempts: reconciliation scan truncated');
        }
      }
      const pendingAttempts = attempts.filter(a =>
        ['SUBMITTED', 'OPEN', 'UNKNOWN', 'PARTIALLY_FILLED'].includes(a.orderStatus));

      for (const att of pendingAttempts) {
        if (!att.brokerOrderId) {
          discrepancies.push('Unresolved live order ' + att.id +
            ' has no broker order ID: verify broker order/trade book before any retry');
          continue;
        }

        try {
          const history = await (activeProvider as any).getOrderHistory(att.brokerOrderId);
          if (Array.isArray(history) && history.length > 0) {
            const latest = history[history.length - 1];
            const status = (latest.status || latest.order_status || '').toUpperCase();
            const filledQty = Number(latest.filled_quantity ?? 0);
            const avgPrice = Number(latest.average_price ?? 0);

            if (filledQty > 0) {
              if (!Number.isInteger(filledQty) || filledQty <= 0 ||
                  filledQty > att.requestedQuantity || !Number.isFinite(avgPrice) || avgPrice <= 0) {
                discrepancies.push(`Broker entry ${att.brokerOrderId}: missing or invalid actual fill quantity/average price; cannot create position.`);
                continue;
              }
              const finalQty = filledQty;
              const finalPrice = avgPrice;

              dbEngine.updateEmaLiveOrderAttempt(att.id, {
                orderStatus: (status === 'COMPLETE' || status === 'FILLED') && finalQty === att.requestedQuantity
                  ? 'FILLED'
                  : (status === 'CANCELLED' || status === 'REJECTED')
                    ? status
                    : 'PARTIALLY_FILLED',
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
                  lotSize: att.requestedQuantity,
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

                if (!dbEngine.tryCreateEmaLivePositionIfAbsent(livePosition)) {
                  discrepancies.push(`Broker BUY attempt ${att.id}: another reconciler already persisted its confirmed position.`);
                  continue;
                }

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
              } else if (existingPos && finalQty > Number(existingPos.quantity)) {
                if (existingPos.exitBrokerOrderId || existingPos.status !== 'OPEN') {
                  discrepancies.push(`Broker entry ${att.brokerOrderId} has additional fills during exit; manual account reconciliation required.`);
                  continue;
                }
                // Upstox average_price is the cumulative VWAP across this BUY order.
                // Updating only after the broker reports a larger cumulative fill
                // makes repeated reconciliation idempotent.
                dbEngine.updateEmaLivePosition(existingPos.id, {
                  quantity: finalQty,
                  entryPrice: finalPrice,
                  stopLoss: StrategyRules.calculateStopLoss(finalPrice),
                  targetPrice: StrategyRules.calculateTargetPrice(finalPrice),
                  unrealizedPnl: StrategyRules.calculateOptionGrossPnl(finalPrice, existingPos.currentPrice, finalQty)
                });
                updatedPositions++;
              } else if (existingPos && finalQty < Number(existingPos.quantity)) {
                discrepancies.push(`Broker entry ${att.brokerOrderId} fill quantity regressed from local ${existingPos.quantity} to ${finalQty}; ignored.`);
              }

              reconciledAttempts++;
            } else if (status === 'COMPLETE' || status === 'FILLED') {
              discrepancies.push(`Broker entry ${att.brokerOrderId} marked complete without positive confirmed filled_quantity.`);
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
        if ((pos.status === 'EXIT_PENDING' || pos.status === 'EXIT_REQUESTED') && !pos.exitBrokerOrderId) {
          discrepancies.push('Live exit for position ' + pos.id +
            ' has unknown broker outcome: manual broker book reconciliation required');
        }
        if (['EXIT_PENDING', 'EXIT_REQUESTED', 'PARTIALLY_CLOSED', 'EXIT_FAILED'].includes(pos.status) && pos.exitBrokerOrderId) {
          try {
            const exitHistory = await (activeProvider as any).getOrderHistory(pos.exitBrokerOrderId);
            if (Array.isArray(exitHistory) && exitHistory.length > 0) {
              const latestExit = exitHistory[exitHistory.length - 1];
              const exitStatus = (latestExit.status || latestExit.order_status || '').toUpperCase();

              const cumulativeExitQty = Number(latestExit.filled_quantity ?? 0);
              const fillPrice = Number(latestExit.average_price ?? 0);
              const previousExitQty = Number(pos.exitFilledQuantity ?? 0);
              const initialQty = Number(pos.quantity);
              if (!Number.isInteger(cumulativeExitQty) || cumulativeExitQty < 0 ||
                  cumulativeExitQty > initialQty || cumulativeExitQty < previousExitQty) {
                discrepancies.push(`Broker exit ${pos.exitBrokerOrderId}: invalid/regressed cumulative filled quantity ${cumulativeExitQty}; previous=${previousExitQty}, total=${initialQty}`);
                continue;
              }

              if (cumulativeExitQty > previousExitQty) {
                if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
                  discrepancies.push(`Broker exit ${pos.exitBrokerOrderId}: cumulative SELL fill missing real average execution price`);
                  continue;
                }
                const remainingQty = initialQty - cumulativeExitQty;
                const isFullyClosed = remainingQty === 0;
                const grossPnl = StrategyRules.calculateOptionGrossPnl(pos.entryPrice, fillPrice, cumulativeExitQty);
                const netPnl = StrategyRules.calculateOptionNetPnl(grossPnl, pos.brokerage || 40);
                const unrealizedPnl = isFullyClosed ? 0 :
                  StrategyRules.calculateOptionGrossPnl(pos.entryPrice, pos.currentPrice, remainingQty);

                // Broker filled_quantity and average_price are CUMULATIVE. Persist
                // the cumulative filled amount so repeated polls cannot double count.
                dbEngine.updateEmaLivePosition(pos.id, {
                  status: isFullyClosed ? 'CLOSED' : 'PARTIALLY_CLOSED',
                  exitFilledQuantity: cumulativeExitQty,
                  ...(isFullyClosed ? { exitTimestamp: new Date().toISOString() } : {}),
                  exitPrice: fillPrice,
                  grossPnl,
                  netPnl,
                  unrealizedPnl
                });

                const randExit = Math.random().toString(36).slice(2, 8);
                dbEngine.logEmaExecutionEvent({
                  id: `evt-reconcile-exit-${Date.now()}-${randExit}`,
                  signalId: pos.signalId,
                  executionId: pos.id,
                  executionMode: 'LIVE',
                  stage: 'LIVE_EXIT_FILLED',
                  status: isFullyClosed ? 'SUCCESS' : 'PENDING',
                  instrument: pos.instrument,
                  brokerOrderId: pos.exitBrokerOrderId,
                  details: { posId: pos.id, cumulativeExitQty, remainingQty, fillPrice, grossPnl, netPnl, reconciled: true },
                  timestamp: new Date().toISOString()
                });

                dbEngine.logEmaExecution({
                  id: `exec-reconcile-exit-${Date.now()}-${randExit}`,
                  timestamp: new Date().toISOString(),
                  level: isFullyClosed ? 'SUCCESS' : 'WARN',
                  stage: 'EXIT',
                  instrument: pos.instrument,
                  message: `Broker SELL cumulative fill ${cumulativeExitQty}/${initialQty} for ${pos.id}. Remaining exposure: ${remainingQty}.`,
                  details: { posId: pos.id, exitBrokerOrderId: pos.exitBrokerOrderId, fillPrice, cumulativeExitQty, remainingQty, netPnl }
                });
                if (!isFullyClosed) {
                  discrepancies.push(`Live position ${pos.id} partially exited ${cumulativeExitQty}/${initialQty}; ${remainingQty} still exposed, do not submit duplicate SELL`);
                }
                updatedPositions++;
              } else if ((exitStatus === 'COMPLETE' || exitStatus === 'FILLED') && cumulativeExitQty === 0) {
                discrepancies.push(`Broker exit ${pos.exitBrokerOrderId} complete with no confirmed filled quantity; exposure unresolved`);
              } else if (exitStatus === 'REJECTED' || exitStatus === 'CANCELLED') {
                dbEngine.updateEmaLivePosition(pos.id, {
                  status: previousExitQty > 0 ? 'PARTIALLY_CLOSED' : 'EXIT_FAILED',
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
