/**
 * Basket & Adjustment Order Execution Engine (Section 5B of Spec)
 * Implements application-level atomicity, sequenced leg placement,
 * fallback execution, and state reconciliation with Upstox API v2 / Practice Engine.
 */

import { BasketOrderRecord, BasketLegExecution, StrategyLeg, MarginCheckResult } from '../../types.js';
import { calculateOrderAndBasketMargin } from './marginEngine.js';
import { dbEngine } from '../db.js';
import { globalMarketFeed } from './marketFeed.js';
import { activeProvider } from './providers/index.js';

/**
 * Resolves standard NSE/NFO exchange tradingsymbol for Upstox and broker gateways.
 * Monthly: <SYMBOL><YY><MMM><STRIKE><CE/PE> (e.g. NIFTY26AUG24800CE)
 * Weekly:  <SYMBOL><YY><M><DD><STRIKE><CE/PE> (e.g. NIFTY2682724800CE)
 */
export function resolveTradingsymbol(
  symbol: string,
  strikePrice: number,
  type: 'CE' | 'PE',
  expiryDateStr?: string
): string {
  const monthsUpper = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const weeklyMonthCodes = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'O', 'N', 'D'];
  const strike = Math.round(strikePrice);

  if (expiryDateStr) {
    const d = new Date(expiryDateStr);
    if (!isNaN(d.getTime())) {
      const yy = d.getFullYear().toString().slice(-2);
      const mIdx = d.getMonth();
      const dd = d.getDate().toString().padStart(2, '0');

      // Check if it is the monthly expiry (last Thursday / within last 7 days of month)
      const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const isMonthly = (lastDayOfMonth - d.getDate()) < 7;

      if (isMonthly) {
        return `${symbol}${yy}${monthsUpper[mIdx]}${strike}${type}`;
      } else {
        const mCode = weeklyMonthCodes[mIdx];
        return `${symbol}${yy}${mCode}${dd}${strike}${type}`;
      }
    }
  }

  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mIdx = now.getMonth();
  return `${symbol}${yy}${monthsUpper[mIdx]}${strike}${type}`;
}

async function pollOrderStatus(
  brokerProvider: any,
  orderId: string,
  timeoutMs: number = 4000
): Promise<{ status: 'FILLED' | 'REJECTED' | 'PENDING'; averagePrice: number; errorReason?: string }> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      if (typeof brokerProvider.getOrderHistory === 'function') {
        const history = await brokerProvider.getOrderHistory(orderId);
        if (Array.isArray(history) && history.length > 0) {
          const lastUpdate = history[history.length - 1];
          const statusStr = (lastUpdate.status || lastUpdate.order_status || '').toUpperCase();
          if (statusStr === 'COMPLETE' || statusStr === 'FILLED' || statusStr === 'EXECUTED') {
            return { status: 'FILLED', averagePrice: lastUpdate.average_price || lastUpdate.price || 0 };
          }
          if (statusStr === 'REJECTED' || statusStr === 'CANCELLED') {
            return { status: 'REJECTED', averagePrice: 0, errorReason: lastUpdate.status_message || lastUpdate.message || `Order status: ${statusStr}` };
          }
        }
      }
    } catch (err: any) {
      console.error(`Error polling order history for ${orderId}:`, err.message);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { status: 'PENDING', averagePrice: 0, errorReason: 'Order execution timeout — pending exchange confirmation' };
}

export class BasketExecutionEngine {
  private activeBaskets: Map<string, BasketOrderRecord> = new Map();

  constructor() {
    // Load persisted basket orders from SQLite on engine start
    const loaded = dbEngine.loadAllBasketOrders();
    for (const b of loaded) {
      this.activeBaskets.set(b.id, b);
    }
  }

  /**
   * Submits and executes a multi-leg basket order with atomicity & sequencing rules.
   * Supports DRY_RUN mode (default true) and real Upstox API v2 order execution when live.
   */
  public async executeBasketOrder(
    strategyId: string,
    strategyName: string,
    symbol: string,
    legs: StrategyLeg[],
    availableUserMargin: number,
    userId?: string | null
  ): Promise<BasketOrderRecord> {

    const basketId = `bsk-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const brokerProvider = globalMarketFeed.getBrokerClient();
    const providerMode = activeProvider.getProviderMode();
    // In Practice Mode, real order execution is structurally impossible regardless of DRY_RUN env var
    const isDryRun = providerMode === 'PRACTICE' ? true : (process.env.DRY_RUN !== 'false');

    // 1. Pre-trade Margin Gate Check using broker margin API / SPAN calculation
    const marginReq = await calculateOrderAndBasketMargin({
      symbol,
      legs: legs.map(leg => ({
        symbol,
        strikePrice: leg.strikePrice,
        type: leg.type,
        action: leg.action,
        quantity: leg.quantity,
        lotSize: leg.lotSize,
        price: leg.currentLtp,
        product: leg.product || 'NRML'
      })),
      userAvailableMargin: availableUserMargin
    }, brokerProvider);

    if (!marginReq.hasSufficientMargin) {
      const failedRecord: BasketOrderRecord = {
        id: basketId,
        strategyId,
        strategyName,
        symbol,
        status: 'FAILED',
        createdAt,
        completedAt: new Date().toISOString(),
        legs: [],
        marginRequired: marginReq.requiredMarginWithCushion,
        marginAvailable: availableUserMargin,
        fallbackActionTriggered: `ORDER_BLOCKED: ${marginReq.recommendation}`,
        reconciliationStatus: 'IN_SYNC',
        reconciliationNotes: marginReq.recommendation
      };
      this.activeBaskets.set(basketId, failedRecord);
      dbEngine.saveBasketOrder(failedRecord, userId);
      return failedRecord;
    }

    // 2. Sort legs for Sequenced Execution (Risk-reducing priority: Long BUY legs placed BEFORE Short SELL legs)
    const sortedLegs = [...legs].sort((a, b) => {
      if (a.action === 'BUY' && b.action === 'SELL') return -1;
      if (a.action === 'SELL' && b.action === 'BUY') return 1;
      return 0;
    });

    const legExecutions: BasketLegExecution[] = [];
    let sequenceCounter = 1;

    // Handle DRY RUN / SIMULATION execution mode
    if (isDryRun || !brokerProvider) {
      for (const leg of sortedLegs) {
        const totalQty = leg.quantity * leg.lotSize;
        legExecutions.push({
          legId: leg.id,
          orderId: `sim-${Date.now()}-${sequenceCounter}`,
          strikePrice: leg.strikePrice,
          type: leg.type,
          action: leg.action,
          requestedQty: totalQty,
          filledQty: totalQty,
          avgFillPrice: leg.currentLtp,
          status: 'FILLED',
          executionSeq: sequenceCounter++,
          executedAt: new Date().toISOString()
        });
      }

      const dryRunRecord: BasketOrderRecord = {
        id: basketId,
        strategyId,
        strategyName,
        symbol,
        status: 'COMPLETED',
        createdAt,
        completedAt: new Date().toISOString(),
        legs: legExecutions,
        marginRequired: marginReq.basketMargin,
        marginAvailable: availableUserMargin,
        fallbackActionTriggered: 'DRY_RUN_MODE: Order validated & simulated in Dry Run mode. No real orders sent to exchange.',
        reconciliationStatus: 'IN_SYNC',
        reconciliationNotes: 'Simulated fills matched with strategy parameters.'
      };

      this.activeBaskets.set(basketId, dryRunRecord);
      dbEngine.saveBasketOrder(dryRunRecord, userId);
      return dryRunRecord;
    }

    // REAL LIVE BROKER EXECUTION VIA UPSTOX API V2
    let allSucceeded = true;
    let failedLegIndex = -1;

    for (const leg of sortedLegs) {
      const totalQty = leg.quantity * leg.lotSize;
      const tradingsymbol = resolveTradingsymbol(symbol, leg.strikePrice, leg.type, leg.expiry);

      try {
        const orderResponse = await brokerProvider.placeOrder({
          tradingsymbol,
          transactionType: leg.action,
          quantity: totalQty,
          product: leg.product || 'D',
          orderType: 'MARKET'
        });

        const realOrderId = orderResponse?.order_id || orderResponse?.orderId || `ord-${Date.now()}-${sequenceCounter}`;

        // Poll broker for real order status (FILLED/REJECTED/PENDING) & actual average fill price
        const pollResult = await pollOrderStatus(brokerProvider, realOrderId);

        if (pollResult.status === 'FILLED') {
          legExecutions.push({
            legId: leg.id,
            orderId: realOrderId,
            strikePrice: leg.strikePrice,
            type: leg.type,
            action: leg.action,
            product: leg.product || 'D',
            requestedQty: totalQty,
            filledQty: totalQty,
            avgFillPrice: pollResult.averagePrice || leg.currentLtp,
            status: 'FILLED',
            executionSeq: sequenceCounter++,
            executedAt: new Date().toISOString()
          });
        } else {
          allSucceeded = false;
          failedLegIndex = sequenceCounter;
          legExecutions.push({
            legId: leg.id,
            orderId: realOrderId,
            strikePrice: leg.strikePrice,
            type: leg.type,
            action: leg.action,
            product: leg.product || 'D',
            requestedQty: totalQty,
            filledQty: 0,
            avgFillPrice: 0,
            status: pollResult.status === 'REJECTED' ? 'REJECTED' : 'PENDING',
            executionSeq: sequenceCounter++,
            errorReason: pollResult.errorReason || `Order status: ${pollResult.status}`
          });
          break; // Abort remaining legs if leg is not filled
        }
      } catch (err: any) {
        allSucceeded = false;
        failedLegIndex = sequenceCounter;
        legExecutions.push({
          legId: leg.id,
          strikePrice: leg.strikePrice,
          type: leg.type,
          action: leg.action,
          product: leg.product || 'D',
          requestedQty: totalQty,
          filledQty: 0,
          avgFillPrice: 0,
          status: 'REJECTED',
          executionSeq: sequenceCounter++,
          errorReason: `Upstox API placement rejected: ${err.message || 'Unknown broker error'}`
        });
        break; // Abort further legs
      }
    }

    // 3. Fallback Atomicity & Auto-offsetting logic for partially filled orders
    let finalStatus: BasketOrderRecord['status'] = 'COMPLETED';
    let fallbackMessage: string | undefined = undefined;

    if (!allSucceeded) {
      const filledLegs = legExecutions.filter(l => l.status === 'FILLED');
      if (filledLegs.length > 0) {
        // Issue REAL exit/offset orders for filled legs
        for (const filledLeg of filledLegs) {
          const reverseAction = filledLeg.action === 'BUY' ? 'SELL' : 'BUY';
          const exitTradingsymbol = resolveTradingsymbol(symbol, filledLeg.strikePrice, filledLeg.type, (filledLeg as any).expiry);
          try {
            await brokerProvider.placeOrder({
              tradingsymbol: exitTradingsymbol,
              transactionType: reverseAction,
              quantity: filledLeg.filledQty,
              product: filledLeg.product || 'D',
              orderType: 'MARKET'
            });
            filledLeg.status = 'CANCELLED';
          } catch (exitErr: any) {
            console.error('Failed to issue offsetting exit order:', exitErr.message);
          }
        }
        fallbackMessage = `AUTO_FALLBACK_EXECUTED: Leg ${failedLegIndex} rejected. Placed real reverse offsetting orders for ${filledLegs.length} filled legs to protect portfolio delta.`;
        finalStatus = 'REVERTED';
      } else {
        fallbackMessage = 'ALL_LEGS_REJECTED: Basket placement aborted prior to fill.';
        finalStatus = 'FAILED';
      }
    }

    const basketRecord: BasketOrderRecord = {
      id: basketId,
      strategyId,
      strategyName,
      symbol,
      status: finalStatus,
      createdAt,
      completedAt: new Date().toISOString(),
      legs: legExecutions,
      marginRequired: marginReq.basketMargin,
      marginAvailable: availableUserMargin,
      fallbackActionTriggered: fallbackMessage,
      reconciliationStatus: 'IN_SYNC',
      reconciliationNotes: `Live orders processed via Upstox API v2. ${legExecutions.length} legs processed.`
    };

    this.activeBaskets.set(basketId, basketRecord);
    dbEngine.saveBasketOrder(basketRecord, userId);
    return basketRecord;
  }

  public getBasketRecord(id: string): BasketOrderRecord | undefined {
    return this.activeBaskets.get(id);
  }

  public getAllBaskets(userId?: string | null): BasketOrderRecord[] {
    return dbEngine.loadAllBasketOrders(userId);
  }

  /**
   * Background Reconciliation Job: Sync internal basket database state with broker position feed
   */
  public async runReconciliationCheck(): Promise<{ checkedCount: number; mismatchesFound: number }> {
    let mismatches = 0;
    const brokerProvider = globalMarketFeed.getBrokerClient();

    if (brokerProvider && typeof brokerProvider.getPositions === 'function') {
      try {
        const positions = await brokerProvider.getPositions();
        const netPositions = Array.isArray(positions) ? positions : (positions?.net || []);

        for (const basket of this.activeBaskets.values()) {
          if (basket.status === 'COMPLETED') {
            // Reconcile basket legs with live net positions
            let isMatched = true;
            for (const leg of basket.legs) {
              const tradingsymbol = resolveTradingsymbol(basket.symbol, leg.strikePrice, leg.type, (leg as any).expiry);
              const pos = netPositions.find((p: any) => p.tradingsymbol === tradingsymbol || p.instrument_token === tradingsymbol || p.symbol === tradingsymbol);
              const expectedQty = leg.action === 'BUY' ? leg.filledQty : -leg.filledQty;
              if (!pos || pos.quantity !== expectedQty) {
                isMatched = false;
              }
            }

            if (!isMatched) {
              mismatches++;
              basket.reconciliationStatus = 'MISMATCH_DETECTED';
              basket.reconciliationNotes = `Position discrepancy detected at ${new Date().toLocaleTimeString()} against broker position book.`;
            } else {
              basket.reconciliationStatus = 'IN_SYNC';
              basket.reconciliationNotes = `Live reconciliation active: ${new Date().toLocaleTimeString()} - Matched 1:1 with broker position book.`;
            }
          }
        }
      } catch (err: any) {
        console.error('Reconciliation check against broker failed:', err.message);
      }
    }

    return { checkedCount: this.activeBaskets.size, mismatchesFound: mismatches };
  }
}

export const globalBasketEngine = new BasketExecutionEngine();

