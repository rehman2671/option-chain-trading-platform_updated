/**
 * Shadow Mode Engine (Section 76)
 * Generates what the quant engine WOULD trade in live market conditions
 * WITHOUT routing real orders to the broker.
 * Compares predicted entry vs actual market entry, predicted exit vs actual outcome,
 * and tracks real-time execution slippage in shadow mode.
 */

import { QuantUnderlying } from '../types.js';

export interface ShadowTradeRecord {
  id: string;
  strategyId: string;
  strategyVersion: number;
  underlying: QuantUnderlying;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  entryTimestamp: string;
  predictedEntryPrice: number;
  actualMarketPriceAtSignal: number;
  entrySlippagePts: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  currentMarketPrice: number;
  unrealizedPnlINR: number;
  realizedPnlINR?: number;
  predictedExitTarget: number;
  predictedStopLoss: number;
  exitTimestamp?: string;
  exitReason?: string;
  thesisHealthScore: number;
}

export class ShadowModeEngine {
  private shadowPositions: ShadowTradeRecord[] = [
    {
      id: 'shadow_001',
      strategyId: 'strat_bull_call_spread',
      strategyVersion: 1,
      underlying: 'NIFTY',
      symbol: 'NIFTY 24100 CE',
      action: 'BUY',
      quantity: 50,
      entryTimestamp: new Date(Date.now() - 3600000).toISOString(),
      predictedEntryPrice: 145.0,
      actualMarketPriceAtSignal: 145.8,
      entrySlippagePts: 0.8,
      status: 'OPEN',
      currentMarketPrice: 158.5,
      unrealizedPnlINR: 635,
      predictedExitTarget: 175.0,
      predictedStopLoss: 125.0,
      thesisHealthScore: 0.88
    },
    {
      id: 'shadow_002',
      strategyId: 'strat_bear_put_spread',
      strategyVersion: 2,
      underlying: 'BANKNIFTY',
      symbol: 'BANKNIFTY 51200 PE',
      action: 'BUY',
      quantity: 30,
      entryTimestamp: new Date(Date.now() - 7200000).toISOString(),
      predictedEntryPrice: 220.0,
      actualMarketPriceAtSignal: 221.2,
      entrySlippagePts: 1.2,
      status: 'CLOSED',
      currentMarketPrice: 265.0,
      unrealizedPnlINR: 0,
      realizedPnlINR: 1314,
      predictedExitTarget: 260.0,
      predictedStopLoss: 195.0,
      exitTimestamp: new Date(Date.now() - 1800000).toISOString(),
      exitReason: 'TARGET_HIT',
      thesisHealthScore: 0.92
    }
  ];

  /**
   * Log a new shadow trade entry
   */
  public logShadowEntry(params: Omit<ShadowTradeRecord, 'id' | 'entryTimestamp' | 'unrealizedPnlINR' | 'status'>): ShadowTradeRecord {
    const record: ShadowTradeRecord = {
      id: `shadow_${Date.now()}`,
      ...params,
      entryTimestamp: new Date().toISOString(),
      status: 'OPEN',
      unrealizedPnlINR: (params.currentMarketPrice - params.actualMarketPriceAtSignal) * params.quantity
    };
    this.shadowPositions.unshift(record);
    return record;
  }

  /**
   * Get all shadow trades (both active and closed)
   */
  public getShadowTrades(): ShadowTradeRecord[] {
    return [...this.shadowPositions];
  }

  /**
   * Close a shadow trade
   */
  public closeShadowTrade(id: string, exitPrice: number, exitReason: string): ShadowTradeRecord | null {
    const trade = this.shadowPositions.find(t => t.id === id);
    if (!trade || trade.status !== 'OPEN') return null;

    trade.status = 'CLOSED';
    trade.currentMarketPrice = exitPrice;
    trade.exitTimestamp = new Date().toISOString();
    trade.exitReason = exitReason;
    trade.realizedPnlINR = (exitPrice - trade.actualMarketPriceAtSignal) * trade.quantity;
    trade.unrealizedPnlINR = 0;

    return trade;
  }

  /**
   * Get summary analytics of shadow mode accuracy
   */
  public getShadowPerformanceSummary() {
    const totalTrades = this.shadowPositions.length;
    const closed = this.shadowPositions.filter(t => t.status === 'CLOSED');
    const winners = closed.filter(t => (t.realizedPnlINR || 0) > 0);
    const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : 0;
    const totalRealizedPnl = closed.reduce((acc, t) => acc + (t.realizedPnlINR || 0), 0);
    const avgSlippage = this.shadowPositions.reduce((acc, t) => acc + t.entrySlippagePts, 0) / Math.max(1, totalTrades);

    return {
      totalShadowTrades: totalTrades,
      activePositions: this.shadowPositions.filter(t => t.status === 'OPEN').length,
      closedTrades: closed.length,
      shadowWinRatePct: Number(winRate.toFixed(1)),
      totalRealizedPnlINR: Math.round(totalRealizedPnl),
      averageExecutionSlippagePts: Number(avgSlippage.toFixed(2)),
      accuracyVerdict: avgSlippage < 1.5 ? 'HIGH_FIDELITY' : 'ACCEPTABLE'
    };
  }
}

export const shadowModeEngine = new ShadowModeEngine();
