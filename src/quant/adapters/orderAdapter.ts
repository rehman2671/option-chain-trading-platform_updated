/**
 * Order Adapter (Section 6 & PART B2.1)
 * Safe interface to order management. Reads existing orders and routes
 * execution requests strictly through risk-gated execution contracts.
 */

import { dbEngine } from '../../server/db.js';
import { killSwitchEngine } from '../risk/killSwitch.js';
import { drawdownController } from '../risk/drawdownController.js';
import { exposureController } from '../risk/exposureController.js';
import { QuantOrderRecord } from '../types.js';
import { legacyExecutionBlock } from '../../server/release/legacyExecutionContainment.js';

export interface QuantOrderRequest {
  strategyId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  quantity: number;
  limitPrice?: number;
  mode: 'PAPER' | 'SHADOW' | 'LIVE';
  tag?: string;
  userId?: string | null;
  decisionId?: string | null;
}

export interface QuantOrderResult {
  orderId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'SIMULATED' | 'SHADOW_LOGGED';
  executedPrice: number;
  slippage: number;
  message: string;
  timestamp: string;
}

export class OrderAdapter {
  private static instance: OrderAdapter;

  private constructor() {}

  public static getInstance(): OrderAdapter {
    if (!OrderAdapter.instance) {
      OrderAdapter.instance = new OrderAdapter();
    }
    return OrderAdapter.instance;
  }

  /**
   * Submit an order execution request with mode safety and hard risk gating checks
   */
  public async submitOrder(order: QuantOrderRequest): Promise<QuantOrderResult> {
    const timestamp = new Date().toISOString();
    const orderId = `QORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const userId = order.userId || 'GLOBAL';

    // 0. Hard Risk Control: Unified Kill Switch check
    if (killSwitchEngine.isHalted(order.userId)) {
      const haltReason = killSwitchEngine.getHaltReason(order.userId) || 'Emergency halt active';
      const result: QuantOrderResult = {
        orderId,
        status: 'REJECTED',
        executedPrice: 0,
        slippage: 0,
        message: `Order rejected by Unified Risk Control: Kill Switch is active (${haltReason})`,
        timestamp
      };
      this.recordOrder(order, result);
      return result;
    }

    const block = legacyExecutionBlock(order.mode);
    if (block || !['BUY','SELL'].includes(order.action) || !['MARKET','LIMIT'].includes(order.orderType) ||
        !Number.isSafeInteger(order.quantity) || order.quantity<=0 ||
        typeof order.symbol!=='string' || !order.symbol.trim() ||
        (order.limitPrice!==undefined && (!Number.isFinite(order.limitPrice)||order.limitPrice<=0))) {
      const result: QuantOrderResult = {orderId,status:'REJECTED',executedPrice:0,slippage:0,
        message:block ? 'Order rejected: '+block : 'Order rejected: INVALID_QUANT_ORDER',timestamp};
      this.recordOrder(order,result);
      return result;
    }

    // 0b. Drawdown Controller check
    if (drawdownController.isHalted(order.userId)) {
      const result: QuantOrderResult = {
        orderId,
        status: 'REJECTED',
        executedPrice: 0,
        slippage: 0,
        message: 'Order rejected by Drawdown Controller: Critical portfolio drawdown halt active',
        timestamp
      };
      this.recordOrder(order, result);
      return result;
    }

    // 0c. Exposure Controller check
    const exposureCheck = exposureController.checkOrderGating();
    if (!exposureCheck.passed) {
      const result: QuantOrderResult = {
        orderId,
        status: 'REJECTED',
        executedPrice: 0,
        slippage: 0,
        message: exposureCheck.reason || 'Order rejected by Exposure Controller: Greek/margin limit exceeded',
        timestamp
      };
      this.recordOrder(order, result);
      return result;
    }

    // 1. Shadow Mode: Never places live orders, records simulated intent
    if (order.mode === 'SHADOW') {
      const execPrice = order.limitPrice || 150.0;
      const result: QuantOrderResult = {
        orderId,
        status: 'SHADOW_LOGGED',
        executedPrice: execPrice,
        slippage: 0,
        message: 'Shadow execution recorded. No order transmitted to broker or paper account.',
        timestamp
      };
      this.recordOrder(order, result);
      return result;
    }

    // 2. Paper Mode: Simulates fill with realistic slippage and creates paper position
    if (order.mode === 'PAPER') {
      const basePrice = order.limitPrice || 150.0;
      const slippage = Number((basePrice * 0.005).toFixed(2)); // 0.5% calibrated slippage
      const executedPrice = order.action === 'BUY' ? basePrice + slippage : basePrice - slippage;

      // Create a paper position in dbEngine so user sees it in Paper Trading and Trade Reviews
      try {
        const paperPosId = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const match = order.symbol.match(/(\d+)\s*(CE|PE)/i);
        const strikePrice = match ? Number(match[1]) : Math.round(executedPrice);
        const type: 'CE' | 'PE' = match && match[2].toUpperCase() === 'PE' ? 'PE' : 'CE';
        const expiry = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

        dbEngine.savePaperPosition({
          id: paperPosId,
          symbol: order.symbol,
          strategyName: order.strategyId || 'Quant Strategy',
          strikePrice,
          type,
          expiry,
          action: order.action,
          quantity: order.quantity,
          entryPrice: executedPrice,
          currentPrice: executedPrice,
          pnl: 0,
          pnlPercent: 0,
          status: 'OPEN',
          strategyGroupId: order.strategyId,
          openedAt: timestamp,
          legLabel: order.tag || `Quant-${order.strategyId}`
        }, order.userId || undefined);
        const saved = dbEngine.getPaperPositionById(paperPosId, order.userId || undefined);
        if (!saved || saved.status!=='OPEN' || saved.quantity!==order.quantity) throw Error('PAPER_ORDER_PERSISTENCE_UNCONFIRMED');
      } catch {
        const result: QuantOrderResult={orderId,status:'REJECTED',executedPrice:0,slippage:0,message:'Paper ledger write not confirmed; reconcile before retry',timestamp};
        this.recordOrder(order,result);
        return result;
      }

      const result: QuantOrderResult = {
        orderId,
        status: 'SIMULATED',
        executedPrice,
        slippage,
        message: 'Paper order filled with calibrated execution slippage & registered in paper portfolio.',
        timestamp
      };
      this.recordOrder(order, result);
      return result;
    }

    // Defense in depth: this legacy adapter must never dispatch a broker order.
    // A future gateway needs durable intent, verified capital, position and fill evidence.
    const rejected: QuantOrderResult = {orderId,status:'REJECTED',executedPrice:0,slippage:0,
      message:'Live execution rejected: legacy adapter has no broker dispatch authority.',timestamp};
    this.recordOrder(order,rejected);
    return rejected;
  }

  private recordOrder(order: QuantOrderRequest, result: QuantOrderResult): void {
    try {
      dbEngine.saveQuantOrder({
        id: result.orderId,
        userId: order.userId || undefined,
        strategyId: order.strategyId,
        decisionId: order.decisionId || undefined,
        underlying: order.symbol.split(' ')[0] || 'NIFTY',
        symbol: order.symbol,
        action: order.action,
        mode: order.mode,
        status: result.status,
        executedPrice: result.executedPrice,
        slippage: result.slippage,
        quantity: order.quantity,
        createdAt: result.timestamp
      });
    } catch (err) {
      console.warn('[ORDER ADAPTER] Warning persisting quant order:', err);
    }
  }

  /**
   * Retrieve recent orders from database
   */
  public getRecentOrders(userId?: string, limit: number = 50): QuantOrderRecord[] {
    try {
      return dbEngine.getQuantOrders(limit, userId);
    } catch {
      return [];
    }
  }
}

export const orderAdapter = OrderAdapter.getInstance();
