import { TradeReviewRecord, MarketRegimeType } from '../types';
import { dbEngine } from '../../server/db';

export const DEMO_TRADE_REVIEWS: TradeReviewRecord[] = [
  {
    tradeId: 'TRD_NIFTY_20260901_01',
    symbol: 'NIFTY 24050 CE',
    strategyName: 'Bull Call Spread Gamma-OI',
    strategyVersion: 1,
    entryTime: '2026-09-01T09:35:10Z',
    exitTime: '2026-09-01T14:15:20Z',
    entryThesis: 'VWAP reclaim + heavy Put OI buildup at 24000 strike + call unwinding at 24100',
    exitReason: 'Target R achieved (+1.8R) as price tagged 24180 call wall',
    regimeAtEntry: 'TREND_UP',
    grossPnl: 18450,
    netPnl: 17820,
    slippageIncurred: 240,
    maxFavorableExcursionR: 2.1,
    maxAdverseExcursionR: -0.35,
    thesisWasCorrect: true,
    timingWasOptimal: true,
    strikeSelectionWasOptimal: true,
    lessonsLearned: 'Patience on 15m ORB consolidation paid off. Spread mitigated mid-session delta decay.',
    predictedProbAtEntry: 0.68
  },
  {
    tradeId: 'TRD_NIFTY_20260902_02',
    symbol: 'NIFTY 24200 PE',
    strategyName: 'Bear Put Spread Momentum',
    strategyVersion: 1,
    entryTime: '2026-09-02T11:20:00Z',
    exitTime: '2026-09-02T12:45:00Z',
    entryThesis: 'Break of structure below 24150 support with expanding negative gamma',
    exitReason: 'Trailing stop triggered after lunch hour false breakdown whip',
    regimeAtEntry: 'RANGE',
    grossPnl: -6200,
    netPnl: -6750,
    slippageIncurred: 180,
    maxFavorableExcursionR: 0.45,
    maxAdverseExcursionR: -1.0,
    thesisWasCorrect: false,
    timingWasOptimal: false,
    strikeSelectionWasOptimal: true,
    lessonsLearned: 'Trading directional breakdowns during 11:30-12:30 lunch window carries high chop probability; wait for European open confirmation.',
    predictedProbAtEntry: 0.58
  },
  {
    tradeId: 'TRD_NIFTY_20260903_03',
    symbol: 'NIFTY 24000 Iron Condor',
    strategyName: 'Iron Condor Gamma Neutral',
    strategyVersion: 1,
    entryTime: '2026-09-03T09:45:00Z',
    exitTime: '2026-09-03T15:10:00Z',
    entryThesis: 'High ATM IV percentile (>80%) with symmetric call/put walls pinning at 24000',
    exitReason: 'Full expiry decay captured into Thursday 0DTE settlement',
    regimeAtEntry: 'RANGE',
    grossPnl: 22400,
    netPnl: 21650,
    slippageIncurred: 310,
    maxFavorableExcursionR: 1.0,
    maxAdverseExcursionR: -0.22,
    thesisWasCorrect: true,
    timingWasOptimal: true,
    strikeSelectionWasOptimal: true,
    lessonsLearned: 'Symmetric wings gave peace of mind during 14:00 temporary spike; max theta capture achieved.',
    predictedProbAtEntry: 0.74
  }
];

export class TradeReviewEngine {
  private inMemoryReviews: TradeReviewRecord[] = [];

  public getReviews(): TradeReviewRecord[] {
    try {
      const dbReviews = dbEngine.getTradeReviews(200);
      if (dbReviews && dbReviews.length > 0) {
        return dbReviews;
      }
    } catch (err) {
      console.warn('[TradeReviewEngine] Could not read reviews from DB, falling back:', err);
    }

    if (this.inMemoryReviews.length > 0) {
      return this.inMemoryReviews;
    }

    if (process.env.INCLUDE_DEMO_REVIEWS === 'true') {
      return DEMO_TRADE_REVIEWS;
    }

    return [];
  }

  public addReview(record: TradeReviewRecord): void {
    if (!record || !record.tradeId) return;

    // 1. Maintain in-memory cache
    const existingIndex = this.inMemoryReviews.findIndex(r => r.tradeId === record.tradeId);
    if (existingIndex >= 0) {
      this.inMemoryReviews[existingIndex] = record;
    } else {
      this.inMemoryReviews.unshift(record);
    }

    // 2. Persist to SQLite
    try {
      dbEngine.saveTradeReview(record);
    } catch (err) {
      console.error('[TradeReviewEngine] Failed to persist review to DB:', err);
    }
  }

  public recordFromPaperPosition(
    pos: {
      id: string;
      symbol: string;
      strategyName?: string;
      openedAt?: string;
      entryPrice?: number;
      stopLoss?: number;
      targetPrice?: number;
      legLabel?: string;
      [key: string]: any;
    },
    exitPrice: number,
    pnl: number,
    exitReason: string,
    exitTime?: string
  ): void {
    if (!pos || !pos.id) return;
    try {
      const grossPnl = Number(pnl.toFixed(2));
      const brokerage = 40;
      const netPnl = Number((grossPnl - brokerage).toFixed(2));
      const now = exitTime || new Date().toISOString();
      const entryTime = pos.openedAt || pos.opened_at || now;

      let maxFavorableExcursionR = 0;
      let maxAdverseExcursionR = 0;
      const entryPrice = Number(pos.entryPrice || pos.entry_price || 0);
      const stopLoss = Number(pos.stopLoss || pos.stop_loss || 0);

      if (entryPrice > 0 && stopLoss > 0 && Math.abs(entryPrice - stopLoss) > 0) {
        const risk = Math.abs(entryPrice - stopLoss);
        const move = exitPrice - entryPrice;
        const rMultiple = Number((move / risk).toFixed(2));
        maxFavorableExcursionR = rMultiple > 0 ? rMultiple : 0;
        maxAdverseExcursionR = rMultiple < 0 ? rMultiple : 0;
      } else {
        maxFavorableExcursionR = netPnl > 0 ? 1 : 0;
        maxAdverseExcursionR = netPnl < 0 ? -1 : 0;
      }

      this.addReview({
        tradeId: `REV_${pos.id}`,
        symbol: pos.symbol,
        strategyName: pos.strategyName || pos.strategy_name || 'Paper Position',
        strategyVersion: 1,
        entryTime,
        exitTime: now,
        entryThesis: (pos.legLabel || pos.leg_label) ? `Leg: ${pos.legLabel || pos.leg_label}` : '',
        exitReason: exitReason || 'Position Closed',
        regimeAtEntry: 'RANGE',
        grossPnl,
        netPnl,
        slippageIncurred: 0,
        maxFavorableExcursionR,
        maxAdverseExcursionR,
        thesisWasCorrect: netPnl > 0,
        timingWasOptimal: netPnl > 0,
        strikeSelectionWasOptimal: netPnl > 0,
        lessonsLearned: exitReason ? `Exit reason: ${exitReason}` : '',
        predictedProbAtEntry: (pos as any).predicted_prob ?? (pos as any).predictedProb ?? 0.65
      });
    } catch (err) {
      console.error('[TradeReviewEngine] Error recording paper position review:', err);
    }
  }

  public recordFromEmaTrade(
    trade: {
      id: string;
      instrument: string;
      strategy?: string;
      direction?: string;
      entry_timestamp?: string;
      entryTimestamp?: string;
      entry_price?: number;
      entryPrice?: number;
      quantity?: number;
    },
    exitPrice: number,
    grossPnl: number,
    netPnl: number,
    exitReason: string,
    exitTimestamp?: string
  ): void {
    if (!trade || !trade.id) return;
    try {
      const now = exitTimestamp || new Date().toISOString();
      const entryTime = trade.entry_timestamp || trade.entryTimestamp || now;
      const isLong = (trade.direction || '').toUpperCase() === 'LONG';
      const regimeAtEntry: MarketRegimeType = isLong ? 'TREND_UP' : 'TREND_DOWN';

      this.addReview({
        tradeId: `REV_${trade.id}`,
        symbol: trade.instrument,
        strategyName: trade.strategy || 'EMA_15M_23_50',
        strategyVersion: 1,
        entryTime,
        exitTime: now,
        entryThesis: `15m EMA 23/50 crossover (${trade.direction || 'DIRECTIONAL'})`,
        exitReason: exitReason || 'EMA Exit',
        regimeAtEntry,
        grossPnl: Number(grossPnl.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2)),
        slippageIncurred: 0,
        maxFavorableExcursionR: netPnl > 0 ? 1.5 : 0,
        maxAdverseExcursionR: netPnl < 0 ? -1.0 : 0,
        thesisWasCorrect: netPnl > 0,
        timingWasOptimal: netPnl > 0,
        strikeSelectionWasOptimal: true,
        lessonsLearned: exitReason ? `15m EMA exit: ${exitReason}` : '',
        predictedProbAtEntry: 0.64
      });
    } catch (err) {
      console.error('[TradeReviewEngine] Error recording EMA trade review:', err);
    }
  }

  public recordFromAutonomousStrategy(
    strat: {
      id: string;
      name: string;
      symbol: string;
      lastActionAt?: string;
      created_at?: string;
      legs?: any[];
    },
    exitReasons: string[],
    realizedPnl: number,
    exitTimestamp?: string
  ): void {
    if (!strat || !strat.id) return;
    try {
      const legsCount = (strat.legs && strat.legs.length) || 1;
      const brokerage = legsCount * 40;
      const grossPnl = Number(realizedPnl.toFixed(2));
      const netPnl = Number((grossPnl - brokerage).toFixed(2));
      const exitTime = exitTimestamp || new Date().toISOString();
      const entryTime = strat.lastActionAt || strat.created_at || exitTime;
      const exitReasonText = exitReasons.join('; ') || 'Autonomous Exit Rule Triggered';

      this.addReview({
        tradeId: `REV_AUTO_${strat.id}_${Date.now()}`,
        symbol: strat.symbol,
        strategyName: strat.name,
        strategyVersion: 1,
        entryTime,
        exitTime,
        entryThesis: `Autonomous rule-based entry for ${strat.name}`,
        exitReason: exitReasonText,
        regimeAtEntry: 'RANGE',
        grossPnl,
        netPnl,
        slippageIncurred: 0,
        maxFavorableExcursionR: netPnl > 0 ? 1.2 : 0,
        maxAdverseExcursionR: netPnl < 0 ? -1.0 : 0,
        thesisWasCorrect: netPnl > 0,
        timingWasOptimal: netPnl > 0,
        strikeSelectionWasOptimal: true,
        lessonsLearned: `Autonomous strategy executed exit: ${exitReasonText}`,
        predictedProbAtEntry: 0.65
      });
    } catch (err) {
      console.error('[TradeReviewEngine] Error recording autonomous strategy review:', err);
    }
  }
}

export const tradeReviewEngine = new TradeReviewEngine();

