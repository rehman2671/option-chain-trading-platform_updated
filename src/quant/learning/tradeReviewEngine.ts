import { TradeReviewRecord, MarketRegimeType } from '../types';

export class TradeReviewEngine {
  private reviews: TradeReviewRecord[] = [
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
      lessonsLearned: 'Patience on 15m ORB consolidation paid off. Spread mitigated mid-session delta decay.'
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
      lessonsLearned: 'Trading directional breakdowns during 11:30-12:30 lunch window carries high chop probability; wait for European open confirmation.'
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
      lessonsLearned: 'Symmetric wings gave peace of mind during 14:00 temporary spike; max theta capture achieved.'
    }
  ];

  public getReviews(): TradeReviewRecord[] {
    return this.reviews;
  }

  public addReview(record: TradeReviewRecord): void {
    this.reviews.unshift(record);
  }
}

export const tradeReviewEngine = new TradeReviewEngine();
