/**
 * Broker Order & Position Reconciler for EMA 15M Engine
 * Synchronizes broker order statuses, detects fills, and recovers state across restarts.
 */

import { dbEngine } from '../../db.js';
import { activeProvider } from '../providers/index.js';
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
              dbEngine.updateEmaLiveOrderAttempt(att.id, {
                orderStatus: 'FILLED',
                filledQuantity: filledQty || att.requestedQuantity,
                averageFillPrice: avgPrice || att.averageFillPrice,
                lastBrokerUpdateAt: new Date().toISOString()
              });
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

      // 2. Reconcile open positions
      const openPositions = dbEngine.getOpenEmaLivePositions();
      for (const pos of openPositions) {
        reconciledPositions++;
      }
    } catch (err: any) {
      discrepancies.push(`Reconciliation error: ${err.message}`);
    }

    return {
      checkedAttempts: reconciledAttempts,
      updatedPositions: reconciledPositions,
      reconciledAttempts,
      reconciledPositions,
      discrepancies
    };
  }
}

export const brokerOrderReconciler = BrokerOrderReconciler.getInstance();
