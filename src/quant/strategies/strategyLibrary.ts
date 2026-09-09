/**
 * Quant Strategy Library
 * Defines canonical strategies across Directional, Spreads, Neutral, Volatility, and Adaptive families.
 */

import { StrategyDefinition } from '../types.js';

export const CANONICAL_STRATEGIES: StrategyDefinition[] = [
  {
    id: 'strat-bull-call-spread-01',
    name: 'Bull Call Vertical Debit Spread',
    version: 1,
    family: 'SPREADS',
    status: 'APPROVED',
    description: 'Buy ATM Call + Sell OTM Call (+1 strike). Defined risk, theta-cushioned directional trend capture.',
    targetRegimes: ['TREND_UP', 'BREAKOUT', 'POSITIVE_GAMMA'],
    parameters: {
      buyStrikeDelta: 0.50,
      sellStrikeDelta: 0.30,
      minDte: 1,
      maxDte: 7,
      maxSpreadWidthLots: 2
    },
    rules: {
      entry: ['Spot > VWAP', 'EMA 20 > EMA 50', 'Put OI buildup > Call OI buildup', 'IV Rank < 65'],
      exit: ['Spot < VWAP for 2 consecutive 15m closes', 'Target 50% max profit reached', 'Stop 40% debit loss'],
      stopLossPct: 40,
      targetPct: 50,
      maxDte: 7,
      strikeSelection: 'DYNAMIC'
    },
    riskBudget: {
      maxCapitalPerTrade: 150000,
      maxRiskPct: 2.0,
      portfolioDeltaCap: 150
    },
    createdAt: '2026-09-01T09:15:00Z',
    updatedAt: '2026-09-05T10:00:00Z'
  },
  {
    id: 'strat-bear-put-spread-01',
    name: 'Bear Put Vertical Debit Spread',
    version: 1,
    family: 'SPREADS',
    status: 'APPROVED',
    description: 'Buy ATM Put + Sell OTM Put (-1 strike). Defined risk downside continuation.',
    targetRegimes: ['TREND_DOWN', 'BREAKDOWN', 'NEGATIVE_GAMMA'],
    parameters: {
      buyStrikeDelta: -0.50,
      sellStrikeDelta: -0.30,
      minDte: 1,
      maxDte: 7
    },
    rules: {
      entry: ['Spot < VWAP', 'EMA 20 < EMA 50', 'Call OI buildup > Put OI buildup'],
      exit: ['Spot > VWAP for 2 consecutive 15m closes', 'Target 50% max profit reached'],
      stopLossPct: 40,
      targetPct: 50,
      maxDte: 7,
      strikeSelection: 'DYNAMIC'
    },
    riskBudget: {
      maxCapitalPerTrade: 150000,
      maxRiskPct: 2.0,
      portfolioDeltaCap: -150
    },
    createdAt: '2026-09-01T09:15:00Z',
    updatedAt: '2026-09-05T10:00:00Z'
  },
  {
    id: 'strat-iron-condor-01',
    name: 'Adaptive Range Iron Condor',
    version: 2,
    family: 'NEUTRAL',
    status: 'APPROVED',
    description: 'Sell 15 Delta Strangle + Buy 5 Delta Wings. Premium collection in compressed volatility regimes.',
    targetRegimes: ['RANGE', 'LOW_VOL', 'VOL_COMPRESSION'],
    parameters: {
      shortCallDelta: 0.15,
      shortPutDelta: -0.15,
      wingWidthStrikes: 2
    },
    rules: {
      entry: ['ADX 14 < 20', 'Spot between Call Wall and Put Wall', 'IV Rank > 40'],
      exit: ['Spot crosses short strike', 'Target 50% credit collected', 'Loss reaches 100% credit'],
      stopLossPct: 100,
      targetPct: 50,
      maxDte: 6,
      strikeSelection: 'DELTA_15'
    },
    riskBudget: {
      maxCapitalPerTrade: 250000,
      maxRiskPct: 2.5,
      portfolioDeltaCap: 50
    },
    createdAt: '2026-09-01T09:15:00Z',
    updatedAt: '2026-09-05T10:00:00Z'
  },
  {
    id: 'strat-long-straddle-01',
    name: 'Volatility Breakout Long Straddle',
    version: 1,
    family: 'VOLATILITY',
    status: 'RESEARCH',
    description: 'Buy ATM Call + Buy ATM Put. Captures explosive volatility expansion around key breakout barriers.',
    targetRegimes: ['VOL_EXPANSION', 'BREAKOUT', 'EVENT'],
    parameters: {
      minIvPercentile: 10,
      maxIvPercentile: 45
    },
    rules: {
      entry: ['IV Rank < 35', 'Spot compressing inside tight consolidation (<0.3% ATR) for > 1 hour'],
      exit: ['Combined profit > 40%', 'Loss reaches 35% of total debit paid'],
      stopLossPct: 35,
      targetPct: 40,
      maxDte: 4,
      strikeSelection: 'ATM'
    },
    riskBudget: {
      maxCapitalPerTrade: 120000,
      maxRiskPct: 1.5,
      portfolioDeltaCap: 100
    },
    createdAt: '2026-09-02T09:15:00Z',
    updatedAt: '2026-09-05T10:00:00Z'
  },
  {
    id: 'strat-adaptive-gamma-hedge-01',
    name: 'Dynamic Delta-Neutral Gamma Scalp',
    version: 1,
    family: 'ADAPTIVE',
    status: 'SHADOW',
    description: 'Long ATM Options with systematic underlying rebalancing to lock in realized gamma volatility.',
    targetRegimes: ['NEGATIVE_GAMMA', 'HIGH_VOL'],
    parameters: {
      rebalanceThresholdDelta: 0.20
    },
    rules: {
      entry: ['Market Net Gamma < -5000', 'India VIX > 15'],
      exit: ['Net P&L target 3% portfolio', 'Stop loss 1.5% portfolio'],
      stopLossPct: 30,
      targetPct: 60,
      maxDte: 5,
      strikeSelection: 'ATM'
    },
    riskBudget: {
      maxCapitalPerTrade: 300000,
      maxRiskPct: 2.0,
      portfolioDeltaCap: 25
    },
    createdAt: '2026-09-03T09:15:00Z',
    updatedAt: '2026-09-05T10:00:00Z'
  }
];
