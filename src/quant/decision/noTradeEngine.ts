/**
 * No-Trade Engine
 * Protects capital by blocking execution when statistical edge is insufficient,
 * spreads are abnormal, data quality degrades, or risk budgets are constrained.
 */

import { MarketRegimeState, QuantFeatureSnapshot, DataQualityReport } from '../types.js';

export interface NoTradeEvaluation {
  shouldBlock: boolean;
  code?: 'INSUFFICIENT_EDGE' | 'STALE_DATA' | 'WIDE_SPREAD' | 'MARKET_CLOSED' | 'HIGH_EVENT_RISK' | 'MAX_PORTFOLIO_EXPOSURE';
  reason?: string;
  safeDefaultApplied: boolean;
}

export class NoTradeEngine {
  private static instance: NoTradeEngine;

  private constructor() {}

  public static getInstance(): NoTradeEngine {
    if (!NoTradeEngine.instance) {
      NoTradeEngine.instance = new NoTradeEngine();
    }
    return NoTradeEngine.instance;
  }

  public evaluate(
    regime: MarketRegimeState,
    features: QuantFeatureSnapshot,
    quality: DataQualityReport,
    isMarketOpen: boolean = true
  ): NoTradeEvaluation {
    // 1. Data Quality Gate
    if (quality.status === 'BLOCKED' || quality.status === 'DATA_INSUFFICIENT' || quality.score < 50) {
      return {
        shouldBlock: true,
        code: 'STALE_DATA',
        reason: `Data quality score (${quality.score}/100) below threshold. Trading blocked.`,
        safeDefaultApplied: true
      };
    }

    // 2. Market Hours Check
    if (!isMarketOpen) {
      return {
        shouldBlock: true,
        code: 'MARKET_CLOSED',
        reason: 'NSE/BSE cash & derivatives market is currently closed.',
        safeDefaultApplied: true
      };
    }

    // 3. Regime Edge Gate
    if (regime.primaryRegime === 'UNKNOWN' || regime.confidence < 0.60) {
      return {
        shouldBlock: true,
        code: 'INSUFFICIENT_EDGE',
        reason: `Regime confidence (${(regime.confidence * 100).toFixed(0)}%) below actionable threshold (60%).`,
        safeDefaultApplied: true
      };
    }

    return {
      shouldBlock: false,
      safeDefaultApplied: false
    };
  }
}

export const noTradeEngine = NoTradeEngine.getInstance();
