import { MarketEventItem, TimeOfDayEdgeProfile } from '../types';

export class EventEngine {
  private upcomingEvents: MarketEventItem[] = [
    {
      id: 'EVT_RBI_01',
      name: 'RBI Monetary Policy Committee Meeting',
      category: 'RBI_POLICY',
      date: '2026-10-08',
      impactLevel: 'EXTREME',
      state: 'PRE_EVENT',
      impliedVolPremiumPct: 22.5,
      tradingRestriction: 'HALT_STRADDLES'
    },
    {
      id: 'EVT_FED_01',
      name: 'US Federal Reserve FOMC Interest Rate Decision',
      category: 'FED_FOMC',
      date: '2026-09-18',
      impactLevel: 'HIGH',
      state: 'PRE_EVENT',
      impliedVolPremiumPct: 15.0,
      tradingRestriction: 'REDUCE_SIZE'
    },
    {
      id: 'EVT_CPI_01',
      name: 'India CPI Inflation Index Release',
      category: 'CPI_INFLATION',
      date: '2026-09-12',
      impactLevel: 'MODERATE',
      state: 'PRE_EVENT',
      impliedVolPremiumPct: 8.5,
      tradingRestriction: 'NONE'
    },
    {
      id: 'EVT_BUDGET_01',
      name: 'Union Budget Presentation',
      category: 'UNION_BUDGET',
      date: '2027-02-01',
      impactLevel: 'EXTREME',
      state: 'NORMAL',
      impliedVolPremiumPct: 45.0,
      tradingRestriction: 'LONG_VOL_ONLY'
    }
  ];

  private timeProfiles: TimeOfDayEdgeProfile[] = [
    {
      timeWindow: '09:15–09:30',
      characteristic: 'Opening Auction Imbalance & Wide Spreads',
      historicalWinRatePct: 42,
      avgMovePoints: 68,
      recommendedStrategyFamily: 'NO_TRADE / BREAKOUT_WATCH',
      cautionFlag: true
    },
    {
      timeWindow: '09:30–10:00',
      characteristic: 'Opening Range Breakout (ORB) & Institutional Momentum',
      historicalWinRatePct: 68,
      avgMovePoints: 95,
      recommendedStrategyFamily: 'DIRECTIONAL_DEBIT_SPREADS',
      cautionFlag: false
    },
    {
      timeWindow: '10:00–11:00',
      characteristic: 'Primary Morning Trend Continuation',
      historicalWinRatePct: 71,
      avgMovePoints: 62,
      recommendedStrategyFamily: 'TREND_FOLLOWING_SPREADS',
      cautionFlag: false
    },
    {
      timeWindow: '11:00–12:00',
      characteristic: 'Midday Volume Contraction & Consolidation',
      historicalWinRatePct: 62,
      avgMovePoints: 28,
      recommendedStrategyFamily: 'DELTA_NEUTRAL_DECAY',
      cautionFlag: false
    },
    {
      timeWindow: '12:00–13:00',
      characteristic: 'Low-Liquidity Chop & False Breakouts',
      historicalWinRatePct: 44,
      avgMovePoints: 22,
      recommendedStrategyFamily: 'IRON_CONDOR / NO_TRADE',
      cautionFlag: true
    },
    {
      timeWindow: '13:00–14:00',
      characteristic: 'European Open Cross-Currents & Volatility Uptick',
      historicalWinRatePct: 64,
      avgMovePoints: 54,
      recommendedStrategyFamily: 'MOMENTUM_BREAKOUTS',
      cautionFlag: false
    },
    {
      timeWindow: '14:00–15:00',
      characteristic: 'Afternoon Gamma Scalp & Zero-DTE Pinning Dynamics',
      historicalWinRatePct: 66,
      avgMovePoints: 78,
      recommendedStrategyFamily: 'GAMMA_SCALP / CALENDAR',
      cautionFlag: false
    },
    {
      timeWindow: '15:00–15:30',
      characteristic: 'Intraday Squaring Off & Extreme Gamma Spikes',
      historicalWinRatePct: 49,
      avgMovePoints: 85,
      recommendedStrategyFamily: 'DEFENSIVE_EXIT / STRICT_PROFIT_LOCK',
      cautionFlag: true
    }
  ];

  public getUpcomingEvents(): MarketEventItem[] {
    return this.upcomingEvents;
  }

  public getTimeProfiles(): TimeOfDayEdgeProfile[] {
    return this.timeProfiles;
  }

  public getCurrentTimeWindowProfile(): TimeOfDayEdgeProfile {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    if (currentMinutes < 9 * 60 + 30) return this.timeProfiles[0];
    if (currentMinutes < 10 * 60) return this.timeProfiles[1];
    if (currentMinutes < 11 * 60) return this.timeProfiles[2];
    if (currentMinutes < 12 * 60) return this.timeProfiles[3];
    if (currentMinutes < 13 * 60) return this.timeProfiles[4];
    if (currentMinutes < 14 * 60) return this.timeProfiles[5];
    if (currentMinutes < 15 * 60) return this.timeProfiles[6];
    return this.timeProfiles[7];
  }
}

export const eventEngine = new EventEngine();
