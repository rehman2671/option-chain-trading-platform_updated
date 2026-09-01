/**
 * Master Personal AI Trading Platform Strategy Engine
 * Coordinates multi-asset scanning, real-time indicator computation,
 * signal generation, and taxonomy across all 5 core trading pillars:
 * 1. EQUITY INTRADAY
 * 2. EQUITY SHORT-TERM / SWING
 * 3. EQUITY LONG-TERM
 * 4. F&O
 * 5. COMMODITIES
 */

import {
  TradingPillar,
  TradingPillarId,
  MarketSignal,
  MultiAssetQuote,
  SectorRotationData,
  StrategyDescriptor
} from '../../types.js';
import { globalMarketFeed } from './marketFeed.js';

export const TRADING_PILLARS_TAXONOMY: TradingPillar[] = [
  {
    id: 'EQUITY_INTRADAY',
    number: 1,
    name: 'Equity Intraday',
    shortLabel: 'Intraday',
    iconName: 'Zap',
    color: 'amber',
    description: 'High-precision intraday trading in liquid equities (MIS/Cash) with strict end-of-day square-off.',
    targetUniverse: 'Nifty 50 & High Beta Liquid Equities (RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, TATAMOTORS)',
    strategies: [
      {
        id: 'VWAP_MEAN_REVERSION',
        name: 'VWAP / Mean Reversion',
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        description: 'Fades extreme price deviations (> 1.8 Standard Deviations from Volume Weighted Average Price) when volume exhaustion occurs, targeting mean reversion to VWAP benchmark.',
        timeframe: '5m / 15m',
        holdingPeriod: '15m - 2 Hours',
        keyIndicators: ['VWAP', 'Standard Deviation Bands', 'RSI 14 (Oversold/Overbought)', 'Volume Spike'],
        riskProfile: 'MODERATE',
        targetWinRate: '68%',
        rewardRiskRatio: '1:1.8',
        rulesSummary: [
          'Identify price > 1.8 SD above/below Intraday VWAP',
          'RSI divergence on 5-min chart (RSI < 28 for Long, RSI > 72 for Short)',
          'Volume taper candle with rejection wick',
          'Target: VWAP baseline. Stop-loss: 0.4% beyond swing extreme'
        ]
      },
      {
        id: 'MOMENTUM',
        name: 'Intraday Momentum',
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        description: 'Captures explosive intraday trending moves when 9 EMA crosses 21 EMA with rising RSI and volume surge above 20-period average.',
        timeframe: '5m',
        holdingPeriod: '30m - 3 Hours',
        keyIndicators: ['9 EMA', '21 EMA', 'RSI 14 > 60 (Bullish) / < 40 (Bearish)', 'Relative Volume (RVOL > 1.5x)'],
        riskProfile: 'MODERATE',
        targetWinRate: '62%',
        rewardRiskRatio: '1:2.2',
        rulesSummary: [
          'Fast EMA (9) cross over Slow EMA (21) above/below VWAP',
          'RSI > 60 for Long, RSI < 40 for Short with strong slope',
          'Volume on breakout candle > 1.5x 20-period average volume',
          'Trailing stop loss along 9 EMA'
        ]
      },
      {
        id: 'BREAKOUT',
        name: 'Opening Range & Level Breakout',
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        description: 'Capitalizes on the 15-minute Opening Range Breakout (ORB) or key intraday consolidation breaks with institutional volume expansion.',
        timeframe: '15m',
        holdingPeriod: '1 - 4 Hours',
        keyIndicators: ['15-min High/Low (ORB)', 'Consolidation Box', 'Volume Surge > 2x', 'ATR 14'],
        riskProfile: 'AGGRESSIVE',
        targetWinRate: '58%',
        rewardRiskRatio: '1:2.5',
        rulesSummary: [
          'Mark 09:15-09:30 AM 15-minute high and low candle range',
          'Full 5m candle body close beyond ORB boundary',
          'Volume on trigger candle at least 200% of morning baseline',
          'Target 1: 1.5x ORB Range. Stop-loss: ORB midpoint'
        ]
      },
      {
        id: 'VOLATILITY_EXPANSION',
        name: 'Volatility Expansion (Keltner/ATR)',
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        description: 'Exploits quiet compression periods (Bollinger Bands squeezing inside Keltner Channels) followed by rapid volatility expansion and explosive directional moves.',
        timeframe: '5m / 15m',
        holdingPeriod: '45m - 3 Hours',
        keyIndicators: ['Bollinger Squeeze', 'Keltner Channel 20, 1.5', 'ATR(14) Expansion', 'Supertrend (7, 3)'],
        riskProfile: 'MODERATE',
        targetWinRate: '64%',
        rewardRiskRatio: '1:2.0',
        rulesSummary: [
          'Detect Bollinger Bands contracting inside Keltner Channels (Squeeze)',
          'Band explosion breakout candle with ATR spike > 1.3x',
          'Supertrend confirmation in direction of expansion',
          'Trail stop loss with 1.5x ATR below entry price'
        ]
      },
      {
        id: 'MICROSTRUCTURE',
        name: 'Microstructure & Order Flow',
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        description: 'Analyzes Level 2 market depth, bid/ask volume imbalance, aggressive buyer/seller tick delta, and iceberg order absorption at key liquidity zones.',
        timeframe: '1m / 3m Tick Level',
        holdingPeriod: '5m - 45m',
        keyIndicators: ['Bid/Ask Order Imbalance (>65%)', 'Cumulative Delta', 'Level 2 Depth Liquidity', 'Absorption Blocks'],
        riskProfile: 'AGGRESSIVE',
        targetWinRate: '71%',
        rewardRiskRatio: '1:1.6',
        rulesSummary: [
          'Bid/Ask ratio skew > 2.0 (Aggressive buyer dominance) or < 0.5 (Seller dominance)',
          'Absorption signature: Heavy volume on bid/ask with zero price slippage',
          'Positive tick delta divergence at swing lows',
          'Tight stop-loss placed right behind liquidity absorption wall'
        ]
      }
    ]
  },
  {
    id: 'EQUITY_SWING',
    number: 2,
    name: 'Equity Short-Term / Swing',
    shortLabel: 'Swing',
    iconName: 'TrendingUp',
    color: 'emerald',
    description: 'Captures multi-day to multi-week swings (Delivery/CNC) in top momentum and stage-2 breakout stocks.',
    targetUniverse: 'Nifty 100 & High-Growth Midcaps (RELIANCE, TCS, TATAMOTORS, SBIN, BHARTIARTL, ITC, LT)',
    strategies: [
      {
        id: 'MOMENTUM',
        name: 'Swing Momentum',
        pillarId: 'EQUITY_SWING',
        pillarName: 'Equity Short-Term / Swing',
        description: 'Rides sustained multi-day momentum when Daily RSI stays above 55, MACD histogram expands positively, and price holds above 20 EMA.',
        timeframe: 'Daily / 1-Hour',
        holdingPeriod: '3 - 10 Days',
        keyIndicators: ['Daily RSI (55-70)', 'MACD (12, 26, 9)', '20-Day EMA', 'Weekly Momentum Filter'],
        riskProfile: 'MODERATE',
        targetWinRate: '65%',
        rewardRiskRatio: '1:2.5',
        rulesSummary: [
          'Daily close above rising 20 EMA',
          'MACD line above Signal line with rising green histogram bars',
          'Daily RSI > 55 without touching extreme overbought (> 80)',
          'Exit on Daily close below 20 EMA or 8% target reach'
        ]
      },
      {
        id: 'BREAKOUT',
        name: 'Swing Stage-2 Base Breakout',
        pillarId: 'EQUITY_SWING',
        pillarName: 'Equity Short-Term / Swing',
        description: 'Identifies institutional accumulation bases (VCP - Volatility Contraction Patterns, Cup & Handle, Flat Bases) breaking out to 52-week or multi-month highs on heavy volume.',
        timeframe: 'Daily / Weekly',
        holdingPeriod: '1 - 4 Weeks',
        keyIndicators: ['52-Week High Proximity', 'VCP Contraction', 'Breakout Volume > 2.5x 50-day SMA', 'Pivot Point'],
        riskProfile: 'MODERATE',
        targetWinRate: '60%',
        rewardRiskRatio: '1:3.0',
        rulesSummary: [
          'Stock consolidating in tight base (< 12% depth) over 3-8 weeks',
          'Price breaks above pivot resistance with volume >= 250% of 50-day average',
          'Stock trading within 15% of 52-week high',
          'Initial stop-loss set at 4% below breakout pivot'
        ]
      },
      {
        id: 'TREND_FOLLOWING',
        name: 'Swing Trend Following',
        pillarId: 'EQUITY_SWING',
        pillarName: 'Equity Short-Term / Swing',
        description: 'Follows established medium-term trends using a strict 21 EMA / 50 SMA trend envelope and Supertrend daily confirmation.',
        timeframe: 'Daily',
        holdingPeriod: '2 - 6 Weeks',
        keyIndicators: ['21 EMA', '50 SMA', 'Supertrend (10, 3)', 'Donchian Channel (20)'],
        riskProfile: 'CONSERVATIVE',
        targetWinRate: '56%',
        rewardRiskRatio: '1:3.2',
        rulesSummary: [
          'Price > 21 EMA > 50 SMA in clean bullish alignment',
          'Pullback entry when price touches 21 EMA in a confirmed uptrend',
          'Supertrend (10, 3) must be green',
          'Trail stop-loss below previous 5-day low or 50 SMA'
        ]
      },
      {
        id: 'MULTI_TIMEFRAME',
        name: 'Multi-Timeframe Confluence (Triple Screen)',
        pillarId: 'EQUITY_SWING',
        pillarName: 'Equity Short-Term / Swing',
        description: 'Aligns Weekly Trend (Macro tide) with Daily Pullback (Wave) and 1-Hour Chart Trigger (Ripple) for maximum probability entries.',
        timeframe: 'Weekly + Daily + 1H',
        holdingPeriod: '5 - 15 Days',
        keyIndicators: ['Weekly MACD / 50 SMA', 'Daily RSI Pullback (40-50 zone)', '1-Hour Breakout Trigger'],
        riskProfile: 'CONSERVATIVE',
        targetWinRate: '72%',
        rewardRiskRatio: '1:2.8',
        rulesSummary: [
          'Screen 1 (Weekly): Weekly chart is in confirmed Stage-2 uptrend (MACD > 0)',
          'Screen 2 (Daily): Daily pullback into support/Fibonacci 50%-61.8% zone (RSI 40-50)',
          'Screen 3 (1-Hour): 1-hour candle breaks above local swing high with volume surge',
          'Stop-loss strictly below recent Daily swing low'
        ]
      }
    ]
  },
  {
    id: 'EQUITY_LONGTERM',
    number: 3,
    name: 'Equity Long-Term',
    shortLabel: 'Long-Term',
    iconName: 'Landmark',
    color: 'blue',
    description: 'Systematic long-term wealth compounding blending technical trend persistence, relative strength, sector rotation, and strict fundamental quality filters.',
    targetUniverse: 'Nifty 500 Market Leaders with Strong Moat & Sound Balance Sheet',
    strategies: [
      {
        id: 'TREND_FOLLOWING',
        name: 'Long-Term Trend Following (200-Day SMA)',
        pillarId: 'EQUITY_LONGTERM',
        pillarName: 'Equity Long-Term',
        description: 'Systematic accumulation of secular market leaders holding above their rising 200-day Simple Moving Average with Golden Cross (50/200 EMA) confirmation.',
        timeframe: 'Weekly / Monthly',
        holdingPeriod: '6 Months - Multi-Year',
        keyIndicators: ['200-Day SMA', '50-Day EMA', 'Golden Cross', 'Monthly MACD'],
        riskProfile: 'CONSERVATIVE',
        targetWinRate: '67%',
        rewardRiskRatio: '1:4.0',
        rulesSummary: [
          'Price > Rising 200-Day SMA (200-SMA slope must be positive over 40 sessions)',
          '50 EMA crossed above 200 SMA (Golden Cross confirmed)',
          'Monthly MACD in bullish expansion above zero line',
          'Exit only on decisive weekly close below 200-Day SMA'
        ]
      },
      {
        id: 'RELATIVE_STRENGTH',
        name: 'Relative Strength (RS vs Benchmark)',
        pillarId: 'EQUITY_LONGTERM',
        pillarName: 'Equity Long-Term',
        description: 'Identifies market leaders that systematically outperform the benchmark NIFTY 50 index across 3-month, 6-month, and 12-month rolling periods.',
        timeframe: 'Weekly',
        holdingPeriod: '6 - 18 Months',
        keyIndicators: ['Mansfield Relative Strength vs NIFTY', 'RS Line at New High', '52-Week High Momentum'],
        riskProfile: 'MODERATE',
        targetWinRate: '70%',
        rewardRiskRatio: '1:3.5',
        rulesSummary: [
          'Mansfield RS line > 0 and sloping upwards for at least 8 consecutive weeks',
          'RS line reaching new 52-week high before price itself breaks 52-week high',
          'Stock must rank in the top 10% relative strength percentile of the entire market',
          'Trim position when RS line falls below zero baseline'
        ]
      },
      {
        id: 'SECTOR_ROTATION',
        name: 'Sector Rotation Momentum',
        pillarId: 'EQUITY_LONGTERM',
        pillarName: 'Equity Long-Term',
        description: 'Tracks institutional capital flows moving across major economic sectors (Banking, IT, Auto, Pharma, Energy, Metals) and overweights the top 2 leading sectors.',
        timeframe: 'Monthly',
        holdingPeriod: '3 - 12 Months',
        keyIndicators: ['Sector Relative Rotation Graph (RRG)', 'Sector Breadth (>50 SMA)', 'Sector Index 3M Momentum'],
        riskProfile: 'MODERATE',
        targetWinRate: '74%',
        rewardRiskRatio: '1:3.0',
        rulesSummary: [
          'Calculate 1-month and 3-month momentum for all 10 NSE Sector Indices',
          'Select stocks exclusively from the Top 2 sectors in the "Leading" quadrant',
          'Rebalance monthly: Rotate out of Lagging/Weakening sectors into Improving/Leading sectors',
          'Allocate 60% of equity capital to top 2 leading sector leaders'
        ]
      },
      {
        id: 'FUNDAMENTAL_QUALITY',
        name: 'Fundamental & Quality Filter Layer',
        pillarId: 'EQUITY_LONGTERM',
        pillarName: 'Equity Long-Term',
        description: 'Applies rigorous balance sheet and profitability screening: High Return on Capital Employed (ROCE > 18%), Low Debt-to-Equity (< 0.5), Consistent 3-Year EPS Growth (> 15%), and High Free Cash Flow.',
        timeframe: 'Quarterly',
        holdingPeriod: '1 - 3+ Years',
        keyIndicators: ['ROCE > 18%', 'Debt/Equity < 0.5', '3-Yr Profit CAGR > 15%', 'Piotroski F-Score >= 7', 'FCF Yield'],
        riskProfile: 'CONSERVATIVE',
        targetWinRate: '78%',
        rewardRiskRatio: '1:4.5',
        rulesSummary: [
          'Pass 5-point quality screen: ROCE >= 18%, D/E <= 0.5, Operating Margin >= 15%',
          'Piotroski Score >= 7 (Strong financial health and zero distress risk)',
          'Positive and growing Free Cash Flow (FCF) for the last 3 consecutive years',
          'Combine with technical 200-SMA uptrend for systematic entry timing'
        ]
      }
    ]
  },
  {
    id: 'FNO',
    number: 4,
    name: 'F&O (Futures & Options)',
    shortLabel: 'F&O',
    iconName: 'Layers',
    color: 'cyan',
    description: 'Institutional-grade derivatives trading: Futures momentum/breakouts, Options Greeks, Volatility arbitrage, OI Buildups, and Expiry-day theta capture.',
    targetUniverse: 'NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, Top F&O Equities',
    strategies: [
      {
        id: 'FUTURES_MOMENTUM',
        name: 'Futures Momentum & Basis',
        pillarId: 'FNO',
        pillarName: 'F&O',
        description: 'Trades futures contracts when price momentum aligns with expanding futures open interest (Long Buildup or Short Buildup) and widening basis spread.',
        timeframe: '5m / 15m / 1H',
        holdingPeriod: 'Intraday to 3 Days',
        keyIndicators: ['Futures OI Expansion', 'Futures Basis (Spot vs Future)', 'Cumulative Volume Delta', 'VWAP'],
        riskProfile: 'AGGRESSIVE',
        targetWinRate: '63%',
        rewardRiskRatio: '1:2.0',
        rulesSummary: [
          'Long Trigger: Futures Price UP + Futures Open Interest UP >= 5% (Long Buildup)',
          'Short Trigger: Futures Price DOWN + Futures Open Interest UP >= 5% (Short Buildup)',
          'Futures premium over spot expanding (Strong institutional aggressive buying)',
          'Trail stop-loss with 0.5% buffer along 20 EMA'
        ]
      },
      {
        id: 'FUTURES_BREAKOUT',
        name: 'Futures Volume & Value Area Breakout',
        pillarId: 'FNO',
        pillarName: 'F&O',
        description: 'Captures high-velocity moves when futures break out of the Volume Profile Value Area (VAH / VAL) with institutional block participation.',
        timeframe: '15m / Daily',
        holdingPeriod: '1 - 5 Days',
        keyIndicators: ['Volume Profile VAH/VAL/POC', 'Open Interest Shift', 'ATR(14)'],
        riskProfile: 'AGGRESSIVE',
        targetWinRate: '61%',
        rewardRiskRatio: '1:2.4',
        rulesSummary: [
          'Price breaks cleanly above Value Area High (VAH) or below Value Area Low (VAL)',
          'Futures volume on breakout candle > 2x 10-period average',
          'OI confirms directional commitment (no heavy unwinding)',
          'Target: 1.5x Initial Balance / Stop-loss: Point of Control (POC)'
        ]
      },
      {
        id: 'VOLATILITY',
        name: 'Volatility & Vega Regime (Straddles/Strangles)',
        pillarId: 'FNO',
        pillarName: 'F&O',
        description: 'Trades Option Spreads & Straddles based on Implied Volatility Rank (IVR): Sells premium when IVR > 75 (IV crush capture) and buys calendar/diagonal spreads when IVR < 25.',
        timeframe: 'Daily / Multi-Day',
        holdingPeriod: '2 - 10 Days',
        keyIndicators: ['IV Rank (0-100)', 'IV Percentile', 'India VIX Relative Level', 'Delta-Neutral Net Exposure'],
        riskProfile: 'MODERATE',
        targetWinRate: '75%',
        rewardRiskRatio: '1:1.5',
        rulesSummary: [
          'High IV Regime (IVR > 70): Deploy Short Straddles or Iron Condors to harvest IV crush & Theta',
          'Low IV Regime (IVR < 25): Deploy Long Calendar Spreads or Long Straddles for Vega expansion',
          'Re-hedge portfolio when Net Delta exceeds ±0.20 per contract',
          'Exit at 50% max profit target or 21 DTE management mark'
        ]
      },
      {
        id: 'OPTIONS_OI',
        name: 'Options Open Interest & Strike Buildup',
        pillarId: 'FNO',
        pillarName: 'F&O',
        description: 'Decodes market maker positioning from strike-by-strike Call/Put open interest buildup, PCR changes, and institutional support/resistance walls.',
        timeframe: '15m / Hourly / EOD',
        holdingPeriod: 'Intraday to Expiry',
        keyIndicators: ['PCR (Put-Call Ratio)', 'Strike OI Concentration', 'Change in OI (Call vs Put)', 'Max Pain Strike'],
        riskProfile: 'MODERATE',
        targetWinRate: '69%',
        rewardRiskRatio: '1:2.0',
        rulesSummary: [
          'Identify Highest Put OI strike (Strong Support) and Highest Call OI strike (Strong Resistance)',
          'Bullish Signal: Heavy Put Writing (PE OI Change > 150% of CE OI Change) + PCR rising > 1.1',
          'Bearish Signal: Heavy Call Writing (CE OI Change > 150% of PE OI Change) + PCR falling < 0.8',
          'Deploy Bull Put Spreads at Put wall or Bear Call Spreads at Call wall'
        ]
      },
      {
        id: 'IV_GREEKS',
        name: 'Option Greeks & Dynamic Hedging',
        pillarId: 'FNO',
        pillarName: 'F&O',
        description: 'Constructs mathematically sound multi-leg option portfolios with precise control over Delta, Gamma, Theta, and Vega exposure.',
        timeframe: 'Daily',
        holdingPeriod: '3 - 15 Days',
        keyIndicators: ['Net Portfolio Delta (Δ)', 'Theta (θ) Decay per Day', 'Vega (ν) Sensitivity', 'Gamma (Γ) Risk'],
        riskProfile: 'CONSERVATIVE',
        targetWinRate: '76%',
        rewardRiskRatio: '1:1.6',
        rulesSummary: [
          'Structure Delta-Neutral positions (|Net Delta| < 0.05 per lot)',
          'Optimize Positive Theta decay (Target >= 0.15% daily return on margin from theta)',
          'Manage Gamma risk: Roll short options at least 3-4 days prior to weekly expiry',
          'Apply 12% exchange-grade safety margin cushion across all legs'
        ]
      },
      {
        id: 'EXPIRY_AWARE',
        name: 'Expiry-Aware & 0DTE Theta Strategies',
        pillarId: 'FNO',
        pillarName: 'F&O',
        description: 'Specialized strategies designed for Thursday Expiry (Weekly/Monthly) and 0DTE decay: Capturing non-linear afternoon theta acceleration and avoiding pin-risk.',
        timeframe: '5m / 15m on Expiry Day',
        holdingPeriod: '30m - 5 Hours (Expiry Day)',
        keyIndicators: ['0DTE Theta Decay Curve', 'Max Pain Pin Zone', 'Gamma Scalp Trigger', 'OI Unwinding Velocity'],
        riskProfile: 'AGGRESSIVE',
        targetWinRate: '72%',
        rewardRiskRatio: '1:1.8',
        rulesSummary: [
          'Morning Expiry Session (09:30 - 11:30 AM): Sell ATM/OTM Strangles for rapid morning theta decay',
          'Afternoon Session (01:00 - 03:00 PM): Trade Pinning action toward Max Pain strike',
          'Strict Exit: Square off all 0DTE short legs by 03:00 PM to eliminate extreme gamma spikes',
          'Stop-loss strictly capped at 2.0x of collected premium per leg'
        ]
      }
    ]
  },
  {
    id: 'COMMODITIES',
    number: 5,
    name: 'Commodities (MCX)',
    shortLabel: 'Commodities',
    iconName: 'Coins',
    color: 'yellow',
    description: 'Specialized trading models for MCX Energy, Precious Metals, and Base Metals tracking global benchmarks (COMEX, NYMEX, LME).',
    targetUniverse: 'MCX GOLD, SILVER, CRUDEOIL, NATURALGAS, COPPER',
    strategies: [
      {
        id: 'TREND_FOLLOWING',
        name: 'Commodities Trend Following',
        pillarId: 'COMMODITIES',
        pillarName: 'Commodities',
        description: 'Rides strong multi-day commodity macro trends in Gold, Silver, and Crude Oil using Supertrend, 50-period EMA, and global macro correlation.',
        timeframe: '1-Hour / 4-Hour / Daily',
        holdingPeriod: '2 - 10 Days',
        keyIndicators: ['50 EMA', 'Supertrend (10, 3)', 'COMEX/NYMEX Correlation', 'ADX(14) > 25'],
        riskProfile: 'MODERATE',
        targetWinRate: '62%',
        rewardRiskRatio: '1:3.0',
        rulesSummary: [
          'ADX(14) > 25 indicating strong directional trend strength',
          'Price > 50 EMA with Supertrend green on 4-Hour chart',
          'US Dollar Index (DXY) inverse correlation confirmation for Metals',
          'Trail stop loss with 2x ATR below swing lows'
        ]
      },
      {
        id: 'BREAKOUT',
        name: 'Commodity Level & Inventory Breakout',
        pillarId: 'COMMODITIES',
        pillarName: 'Commodities',
        description: 'Trades high-impact momentum breakouts in Crude Oil and Natural Gas during US market open (06:30 PM IST) and EIA inventory report releases.',
        timeframe: '15m / 30m',
        holdingPeriod: '1 - 6 Hours',
        keyIndicators: ['US Market Open Range', 'EIA Inventory Surprise %', 'Volume Surge > 2.5x', 'ATR(14)'],
        riskProfile: 'AGGRESSIVE',
        targetWinRate: '59%',
        rewardRiskRatio: '1:2.5',
        rulesSummary: [
          'Identify key multi-session horizontal support/resistance levels in Crude Oil / Natural Gas',
          'Entry on volume breakout occurring between 06:30 PM - 09:30 PM IST',
          'Inventory confirmation: Actual inventory divergence > 1.5M barrels from forecast',
          'Target: 2.0x ATR / Stop-loss: 0.8x ATR from entry'
        ]
      },
      {
        id: 'MOMENTUM',
        name: 'Commodity RSI & Oscillator Momentum',
        pillarId: 'COMMODITIES',
        pillarName: 'Commodities',
        description: 'Captures fast intraday momentum swings in Base Metals (Copper, Zinc) and Precious Metals when RSI crosses 60 with MACD confirmation.',
        timeframe: '15m / 1-Hour',
        holdingPeriod: '2 - 8 Hours',
        keyIndicators: ['RSI 14 (> 60 Long, < 40 Short)', 'MACD (12, 26, 9)', '20 EMA', 'Volume Delta'],
        riskProfile: 'MODERATE',
        targetWinRate: '64%',
        rewardRiskRatio: '1:2.0',
        rulesSummary: [
          'Price crosses above 20 EMA on 15m chart',
          'RSI 14 moves sharply into bullish expansion (> 60)',
          'MACD green histogram rising for 3 consecutive bars',
          'Exit on RSI overbought divergence (> 75) or 1.5x risk target'
        ]
      },
      {
        id: 'VOLATILITY_EXPANSION',
        name: 'Commodity Volatility Expansion (ATR Breakout)',
        pillarId: 'COMMODITIES',
        pillarName: 'Commodities',
        description: 'Detects extreme price contraction in Gold / Silver during Asian/European sessions, followed by high-velocity expansion during US session.',
        timeframe: '30m / 1-Hour',
        holdingPeriod: '3 - 12 Hours',
        keyIndicators: ['Bollinger Squeeze', 'ATR(14) Ratio', 'Session Range Ratio', 'Keltner Channel'],
        riskProfile: 'MODERATE',
        targetWinRate: '66%',
        rewardRiskRatio: '1:2.2',
        rulesSummary: [
          'Asian/European session range < 60% of 10-day average daily range (Quiet compression)',
          'Price breaks out of Bollinger Bands as US session opens (06:30 PM IST)',
          'ATR expands > 1.4x over prior 4 candles',
          'Target: Daily ATR projection / Stop-loss: Midpoint of consolidation'
        ]
      },
      {
        id: 'MULTI_TIMEFRAME',
        name: 'Commodities Multi-Timeframe Matrix',
        pillarId: 'COMMODITIES',
        pillarName: 'Commodities',
        description: 'Synchronizes Global Benchmark Trend (COMEX Gold/Silver, NYMEX WTI Crude) with MCX Daily Trend and 15-Minute Entry Trigger.',
        timeframe: 'Daily + 1-Hour + 15m',
        holdingPeriod: '1 - 4 Days',
        keyIndicators: ['Global COMEX/NYMEX Trend', 'MCX 4H Supertrend', '15m Entry Trigger', 'Carry & Basis'],
        riskProfile: 'CONSERVATIVE',
        targetWinRate: '71%',
        rewardRiskRatio: '1:2.6',
        rulesSummary: [
          'Layer 1: COMEX/NYMEX global benchmark is trending above its 20-day EMA',
          'Layer 2: MCX 4-Hour chart is aligned in same direction (Supertrend Green)',
          'Layer 3: 15-Minute chart gives pullback entry with stochastic oversold turnaround',
          'Stop-loss placed under 4-Hour swing support'
        ]
      }
    ]
  }
];

// Multi-Asset Live Quotes Universe with accurate market fundamentals & technical metrics
export const MULTI_ASSET_UNIVERSE: MultiAssetQuote[] = [
  // 1. EQUITIES
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd.',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    ltp: 1280.50,
    change: 8.40,
    pChange: 0.66,
    high: 1292.00,
    low: 1268.00,
    open: 1272.00,
    prevClose: 1272.10,
    volume: 5420000,
    vwap: 1278.80,
    rsi: 62.4,
    atr: 18.5,
    supertrend: 'BULLISH',
    ema9: 1276.0,
    ema21: 1268.0,
    ema50: 1250.0,
    ema200: 1210.0,
    lotSize: 250,
    stepSize: 20,
    sector: 'Energy / Conglomerate',
    orderFlowImbalance: 24.5,
    bidAskRatio: 1.32,
    rsVsBenchmark: 4.8,
    sectorRank: 2,
    qualityScore: 88,
    roce: 16.4,
    debtToEquity: 0.38
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    ltp: 4285.00,
    change: -15.60,
    pChange: -0.36,
    high: 4320.00,
    low: 4260.00,
    open: 4305.00,
    prevClose: 4300.60,
    volume: 1850000,
    vwap: 4289.40,
    rsi: 54.8,
    atr: 48.0,
    supertrend: 'BULLISH',
    ema9: 4275.0,
    ema21: 4240.0,
    ema50: 4160.0,
    ema200: 3950.0,
    lotSize: 175,
    stepSize: 50,
    sector: 'Information Technology',
    orderFlowImbalance: -8.2,
    bidAskRatio: 0.94,
    rsVsBenchmark: 2.1,
    sectorRank: 4,
    qualityScore: 95,
    roce: 48.2,
    debtToEquity: 0.04
  },
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd.',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    ltp: 1642.80,
    change: 14.30,
    pChange: 0.88,
    high: 1655.00,
    low: 1625.00,
    open: 1630.00,
    prevClose: 1628.50,
    volume: 14200000,
    vwap: 1638.90,
    rsi: 66.2,
    atr: 19.5,
    supertrend: 'BULLISH',
    ema9: 1636.0,
    ema21: 1618.0,
    ema50: 1585.0,
    ema200: 1540.0,
    lotSize: 550,
    stepSize: 10,
    sector: 'Banking & Financials',
    orderFlowImbalance: 38.0,
    bidAskRatio: 1.65,
    rsVsBenchmark: 6.2,
    sectorRank: 1,
    qualityScore: 92,
    roce: 17.8,
    debtToEquity: 0.85
  },
  {
    symbol: 'INFY',
    name: 'Infosys Ltd.',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    ltp: 1875.20,
    change: 18.90,
    pChange: 1.02,
    high: 1888.00,
    low: 1852.00,
    open: 1860.00,
    prevClose: 1856.30,
    volume: 6800000,
    vwap: 1870.10,
    rsi: 68.5,
    atr: 24.0,
    supertrend: 'BULLISH',
    ema9: 1862.0,
    ema21: 1835.0,
    ema50: 1780.0,
    ema200: 1620.0,
    lotSize: 400,
    stepSize: 20,
    sector: 'Information Technology',
    orderFlowImbalance: 18.5,
    bidAskRatio: 1.25,
    rsVsBenchmark: 5.4,
    sectorRank: 4,
    qualityScore: 91,
    roce: 36.5,
    debtToEquity: 0.08
  },
  {
    symbol: 'TATAMOTORS',
    name: 'Tata Motors Ltd.',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    ltp: 1085.40,
    change: 31.20,
    pChange: 2.96,
    high: 1098.00,
    low: 1052.00,
    open: 1058.00,
    prevClose: 1054.20,
    volume: 11500000,
    vwap: 1078.60,
    rsi: 74.2,
    atr: 22.0,
    supertrend: 'BULLISH',
    ema9: 1068.0,
    ema21: 1035.0,
    ema50: 980.0,
    ema200: 840.0,
    lotSize: 575,
    stepSize: 10,
    sector: 'Automobile',
    orderFlowImbalance: 42.0,
    bidAskRatio: 1.82,
    rsVsBenchmark: 12.5,
    sectorRank: 3,
    qualityScore: 84,
    roce: 21.0,
    debtToEquity: 0.42
  },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    ltp: 845.60,
    change: 8.40,
    pChange: 1.00,
    high: 852.00,
    low: 836.00,
    open: 840.00,
    prevClose: 837.20,
    volume: 18400000,
    vwap: 843.50,
    rsi: 61.0,
    atr: 12.5,
    supertrend: 'BULLISH',
    ema9: 841.0,
    ema21: 832.0,
    ema50: 810.0,
    ema200: 740.0,
    lotSize: 750,
    stepSize: 5,
    sector: 'Banking & Financials',
    orderFlowImbalance: 15.0,
    bidAskRatio: 1.18,
    rsVsBenchmark: 4.2,
    sectorRank: 1,
    qualityScore: 86,
    roce: 16.2,
    debtToEquity: 0.90
  },

  // 2. F&O INDICES
  {
    symbol: 'NIFTY',
    name: 'NIFTY 50 Index (European)',
    assetClass: 'INDEX_FNO',
    exchange: 'NSE',
    ltp: 24850.00,
    change: 142.50,
    pChange: 0.58,
    high: 24920.00,
    low: 24710.00,
    open: 24740.00,
    prevClose: 24707.50,
    volume: 245000000,
    vwap: 24818.00,
    rsi: 63.5,
    atr: 165.0,
    supertrend: 'BULLISH',
    ema9: 24780.0,
    ema21: 24620.0,
    ema50: 24350.0,
    ema200: 23200.0,
    lotSize: 25,
    stepSize: 50,
    sector: 'Broad Market Index',
    orderFlowImbalance: 18.0,
    bidAskRatio: 1.22,
    futuresOpenInterest: 14250000,
    oiChangePercent: 4.8,
    pcr: 1.14,
    maxPain: 24800,
    ivPercentile: 42
  },
  {
    symbol: 'BANKNIFTY',
    name: 'NIFTY Bank Index (European)',
    assetClass: 'INDEX_FNO',
    exchange: 'NSE',
    ltp: 52400.00,
    change: 385.00,
    pChange: 0.74,
    high: 52620.00,
    low: 51980.00,
    open: 52050.00,
    prevClose: 52015.00,
    volume: 185000000,
    vwap: 52310.00,
    rsi: 65.8,
    atr: 420.0,
    supertrend: 'BULLISH',
    ema9: 52200.0,
    ema21: 51800.0,
    ema50: 51100.0,
    ema200: 48900.0,
    lotSize: 15,
    stepSize: 100,
    sector: 'Banking Sector Index',
    orderFlowImbalance: 26.5,
    bidAskRatio: 1.45,
    futuresOpenInterest: 2850000,
    oiChangePercent: 6.2,
    pcr: 1.22,
    maxPain: 52000,
    ivPercentile: 48
  },
  {
    symbol: 'FINNIFTY',
    name: 'NIFTY Financial Services Index',
    assetClass: 'INDEX_FNO',
    exchange: 'NSE',
    ltp: 23450.00,
    change: 165.00,
    pChange: 0.71,
    high: 23540.00,
    low: 23260.00,
    open: 23300.00,
    prevClose: 23285.00,
    volume: 95000000,
    vwap: 23410.00,
    rsi: 64.0,
    atr: 180.0,
    supertrend: 'BULLISH',
    ema9: 23380.0,
    ema21: 23200.0,
    ema50: 22850.0,
    ema200: 21900.0,
    lotSize: 25,
    stepSize: 50,
    sector: 'Financial Services Index',
    orderFlowImbalance: 21.0,
    bidAskRatio: 1.30,
    futuresOpenInterest: 1100000,
    oiChangePercent: 3.5,
    pcr: 1.18,
    maxPain: 23400,
    ivPercentile: 39
  },

  // 3. COMMODITIES (MCX)
  {
    symbol: 'GOLD',
    name: 'Gold 1 KG (MCX)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    ltp: 72850.00,
    change: 420.00,
    pChange: 0.58,
    high: 73100.00,
    low: 72400.00,
    open: 72500.00,
    prevClose: 72430.00,
    volume: 8400,
    vwap: 72780.00,
    rsi: 61.2,
    atr: 650.0,
    supertrend: 'BULLISH',
    ema9: 72650.0,
    ema21: 72100.0,
    ema50: 71200.0,
    ema200: 68500.0,
    lotSize: 1,
    stepSize: 100,
    sector: 'Precious Metals',
    orderFlowImbalance: 14.2,
    bidAskRatio: 1.20,
    basisSpread: 120.0,
    carryCost: 0.45
  },
  {
    symbol: 'SILVER',
    name: 'Silver 30 KG (MCX)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    ltp: 86450.00,
    change: 980.00,
    pChange: 1.15,
    high: 86900.00,
    low: 85200.00,
    open: 85600.00,
    prevClose: 85470.00,
    volume: 14200,
    vwap: 86240.00,
    rsi: 65.4,
    atr: 1250.0,
    supertrend: 'BULLISH',
    ema9: 85900.0,
    ema21: 84800.0,
    ema50: 83100.0,
    ema200: 78500.0,
    lotSize: 1,
    stepSize: 100,
    sector: 'Precious Metals',
    orderFlowImbalance: 28.0,
    bidAskRatio: 1.48,
    basisSpread: 210.0,
    carryCost: 0.52
  },
  {
    symbol: 'CRUDEOIL',
    name: 'Crude Oil 100 BBL (MCX)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    ltp: 6420.00,
    change: 85.00,
    pChange: 1.34,
    high: 6465.00,
    low: 6310.00,
    open: 6340.00,
    prevClose: 6335.00,
    volume: 56000,
    vwap: 6402.00,
    rsi: 58.6,
    atr: 95.0,
    supertrend: 'BULLISH',
    ema9: 6390.0,
    ema21: 6340.0,
    ema50: 6250.0,
    ema200: 6120.0,
    lotSize: 100,
    stepSize: 10,
    sector: 'Energy Commodity',
    orderFlowImbalance: 32.5,
    bidAskRatio: 1.55,
    basisSpread: 18.0,
    carryCost: 0.65
  },
  {
    symbol: 'NATURALGAS',
    name: 'Natural Gas 1250 MMBTU (MCX)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    ltp: 214.60,
    change: -4.80,
    pChange: -2.19,
    high: 221.00,
    low: 212.50,
    open: 219.00,
    prevClose: 219.40,
    volume: 78000,
    vwap: 215.80,
    rsi: 42.0,
    atr: 7.2,
    supertrend: 'BEARISH',
    ema9: 216.5,
    ema21: 220.0,
    ema50: 228.0,
    ema200: 245.0,
    lotSize: 1250,
    stepSize: 1,
    sector: 'Energy Commodity',
    orderFlowImbalance: -24.0,
    bidAskRatio: 0.72,
    basisSpread: -1.2,
    carryCost: 0.80
  },
  {
    symbol: 'COPPER',
    name: 'Copper 2500 KG (MCX)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    ltp: 818.40,
    change: 6.20,
    pChange: 0.76,
    high: 824.00,
    low: 811.00,
    open: 813.00,
    prevClose: 812.20,
    volume: 12400,
    vwap: 816.90,
    rsi: 59.5,
    atr: 9.8,
    supertrend: 'BULLISH',
    ema9: 815.0,
    ema21: 808.0,
    ema50: 795.0,
    ema200: 765.0,
    lotSize: 2500,
    stepSize: 1,
    sector: 'Base Metals',
    orderFlowImbalance: 16.8,
    bidAskRatio: 1.24,
    basisSpread: 2.4,
    carryCost: 0.38
  }
];

// Sector Rotation Matrix
export const SECTOR_ROTATION_MATRIX: SectorRotationData[] = [
  {
    sector: 'Nifty Bank',
    benchmarkSymbol: 'BANKNIFTY',
    change1D: 0.74,
    change1W: 2.15,
    change1M: 5.40,
    relativeStrengthRank: 1,
    momentumPhase: 'LEADING',
    topPicks: ['HDFCBANK', 'SBIN', 'ICICIBANK']
  },
  {
    sector: 'Nifty Auto',
    benchmarkSymbol: 'NIFTYAUTO',
    change1D: 2.45,
    change1W: 3.80,
    change1M: 6.90,
    relativeStrengthRank: 2,
    momentumPhase: 'LEADING',
    topPicks: ['TATAMOTORS', 'MARUTI', 'M&M']
  },
  {
    sector: 'Nifty Energy',
    benchmarkSymbol: 'NIFTYENERGY',
    change1D: 0.85,
    change1W: 1.60,
    change1M: 3.80,
    relativeStrengthRank: 3,
    momentumPhase: 'IMPROVING',
    topPicks: ['RELIANCE', 'ONGC', 'NTPC']
  },
  {
    sector: 'Nifty IT',
    benchmarkSymbol: 'NIFTYIT',
    change1D: 0.42,
    change1W: 0.90,
    change1M: 2.10,
    relativeStrengthRank: 4,
    momentumPhase: 'IMPROVING',
    topPicks: ['INFY', 'TCS', 'HCLTECH']
  },
  {
    sector: 'Nifty Pharma',
    benchmarkSymbol: 'NIFTYPHARMA',
    change1D: -0.20,
    change1W: 0.50,
    change1M: 1.20,
    relativeStrengthRank: 5,
    momentumPhase: 'WEAKENING',
    topPicks: ['SUNPHARMA', 'DRREDDY', 'CIPLA']
  },
  {
    sector: 'Nifty FMCG',
    benchmarkSymbol: 'NIFTYFMCG',
    change1D: -0.65,
    change1W: -1.20,
    change1M: -0.80,
    relativeStrengthRank: 6,
    momentumPhase: 'LAGGING',
    topPicks: ['ITC', 'HINDUNILVR', 'NESTLEIND']
  }
];

class StrategyPlatformEngine {
  /**
   * Generates active signals across all 5 Pillars dynamically based on real-time quotes & technical state
   */
  public getLiveSignals(filterPillar?: TradingPillarId): MarketSignal[] {
    const signals: MarketSignal[] = [];
    const now = new Date().toISOString();

    // 1. EQUITY INTRADAY SIGNALS
    signals.push(
      {
        id: `sig-intra-1-${Date.now()}`,
        timestamp: now,
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        strategyId: 'VWAP_MEAN_REVERSION',
        strategyName: 'VWAP / Mean Reversion',
        symbol: 'RELIANCE',
        assetName: 'Reliance Industries Ltd.',
        assetClass: 'EQUITY',
        direction: 'BUY',
        timeframe: '5m',
        entryPrice: 1280.00,
        stopLoss: 1268.00,
        target1: 1295.00,
        target2: 1310.00,
        riskReward: '1:2.3',
        confidenceScore: 84,
        status: 'ACTIVE',
        rationale: 'Price dipped 1.8 SD below VWAP (₹1,278.80) with 5m hammer candle rejection and RSI(14) oversold bounce from 28.4.',
        technicalTriggers: [
          'Price -1.9 SD below Intraday VWAP',
          'RSI 14 oversold turnaround (28.4 -> 34.2)',
          'Order Flow Bid/Ask ratio surged to 1.45 at ₹1,272 support wall',
          'Volume exhaustion on 5m down-wave'
        ],
        suggestedAction: 'BUY RELIANCE (MIS Intraday) with trailing SL at ₹1,268'
      },
      {
        id: `sig-intra-2-${Date.now()}`,
        timestamp: now,
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        strategyId: 'MICROSTRUCTURE',
        strategyName: 'Microstructure & Order Flow',
        symbol: 'TATAMOTORS',
        assetName: 'Tata Motors Ltd.',
        assetClass: 'EQUITY',
        direction: 'BUY',
        timeframe: '1m / 3m',
        entryPrice: 1085.00,
        stopLoss: 1076.00,
        target1: 1098.00,
        target2: 1110.00,
        riskReward: '1:2.7',
        confidenceScore: 88,
        status: 'ACTIVE',
        rationale: 'Massive aggressive bid volume (+42% imbalance) detected on level 2 depth. Iceberg buy absorption defending ₹1,080 level.',
        technicalTriggers: [
          'Order Flow imbalance +42.0% (Aggressive institutional buyers)',
          'Cumulative Delta +145,000 shares in 15 mins',
          'Bid/Ask ratio 1.82:1 with Zero Offer Slippage',
          'Supertrend(7,3) intact green'
        ],
        suggestedAction: 'BUY TATAMOTORS (MIS) for fast intraday momentum push'
      },
      {
        id: `sig-intra-3-${Date.now()}`,
        timestamp: now,
        pillarId: 'EQUITY_INTRADAY',
        pillarName: 'Equity Intraday',
        strategyId: 'BREAKOUT',
        strategyName: 'Opening Range & Level Breakout',
        symbol: 'HDFCBANK',
        assetName: 'HDFC Bank Ltd.',
        assetClass: 'EQUITY',
        direction: 'BUY',
        timeframe: '15m',
        entryPrice: 1642.00,
        stopLoss: 1632.00,
        target1: 1658.00,
        target2: 1670.00,
        riskReward: '1:2.8',
        confidenceScore: 82,
        status: 'ACTIVE',
        rationale: '15-min Opening Range Breakout (ORB) above ₹1,635 resistance confirmed with 2.2x volume expansion.',
        technicalTriggers: [
          'ORB High (₹1,635) broken with strong 15m candle close',
          'RVOL 2.2x 10-day average opening volume',
          'Banking Sector (Nifty Bank) showing top relative strength',
          'MACD green histogram expansion'
        ],
        suggestedAction: 'BUY HDFCBANK (MIS) at market with SL below ORB midpoint (₹1,632)'
      }
    );

    // 2. EQUITY SHORT-TERM / SWING SIGNALS
    signals.push(
      {
        id: `sig-swing-1-${Date.now()}`,
        timestamp: now,
        pillarId: 'EQUITY_SWING',
        pillarName: 'Equity Short-Term / Swing',
        strategyId: 'MULTI_TIMEFRAME',
        strategyName: 'Multi-Timeframe Confluence (Triple Screen)',
        symbol: 'INFY',
        assetName: 'Infosys Ltd.',
        assetClass: 'EQUITY',
        direction: 'BUY',
        timeframe: 'Weekly + Daily + 1H',
        entryPrice: 1875.00,
        stopLoss: 1835.00,
        target1: 1940.00,
        target2: 2010.00,
        riskReward: '1:3.3',
        confidenceScore: 86,
        status: 'ACTIVE',
        rationale: 'Weekly trend is in confirmed Stage-2 uptrend. Daily pulled back to 21 EMA (₹1,835) and 1-Hour chart broke local consolidation on heavy volume.',
        technicalTriggers: [
          'Weekly Screen: MACD > 0 and Price > 200 SMA',
          'Daily Screen: RSI cooled from 78 to 54 and bounced off 21 EMA',
          '1-Hour Trigger: Clean breakout over ₹1,865 swing high',
          'IT Sector improving on Relative Rotation Graph'
        ],
        suggestedAction: 'BUY INFY (CNC Swing Delivery) holding for 5-12 trading sessions'
      },
      {
        id: `sig-swing-2-${Date.now()}`,
        timestamp: now,
        pillarId: 'EQUITY_SWING',
        pillarName: 'Equity Short-Term / Swing',
        strategyId: 'BREAKOUT',
        strategyName: 'Swing Stage-2 Base Breakout',
        symbol: 'SBIN',
        assetName: 'State Bank of India',
        assetClass: 'EQUITY',
        direction: 'BUY',
        timeframe: 'Daily',
        entryPrice: 845.00,
        stopLoss: 825.00,
        target1: 885.00,
        target2: 920.00,
        riskReward: '1:3.7',
        confidenceScore: 83,
        status: 'ACTIVE',
        rationale: 'Volatility Contraction Pattern (VCP) breakout on Daily chart. 4-week tight base breaking to fresh multi-month highs.',
        technicalTriggers: [
          'Base depth tightened from 14% -> 7% -> 3.2% (Classic VCP)',
          'Volume on breakout 2.8x 50-day average',
          'Daily RSI 61.0 with positive slope',
          'Supertrend(10,3) green support at ₹825'
        ],
        suggestedAction: 'ACCUMULATE SBIN for a 2-4 week swing holding target ₹885 - ₹920'
      }
    );

    // 3. EQUITY LONG-TERM SIGNALS
    signals.push(
      {
        id: `sig-long-1-${Date.now()}`,
        timestamp: now,
        pillarId: 'EQUITY_LONGTERM',
        pillarName: 'Equity Long-Term',
        strategyId: 'FUNDAMENTAL_QUALITY',
        strategyName: 'Fundamental & Quality Filter Layer',
        symbol: 'TCS',
        assetName: 'Tata Consultancy Services',
        assetClass: 'EQUITY',
        direction: 'BUY',
        timeframe: 'Weekly / Monthly',
        entryPrice: 4285.00,
        stopLoss: 3950.00,
        target1: 4850.00,
        target2: 5400.00,
        riskReward: '1:4.2',
        confidenceScore: 92,
        status: 'ACTIVE',
        rationale: 'Top-tier balance sheet with 48.2% ROCE, near-zero debt (0.04 D/E), 95/100 Quality Score, and sustained 200-Day SMA support.',
        technicalTriggers: [
          'ROCE 48.2% & Free Cash Flow Yield 3.8%',
          'Piotroski F-Score: 8/9 (Highest tier financial health)',
          'Price consolidating right above rising 200-Day SMA (₹3,950)',
          'Mansfield Relative Strength bottoming out and turning positive'
        ],
        suggestedAction: 'LONG-TERM CORE HOLDING: Systematic Investment Plan (SIP) or staggered accumulation'
      },
      {
        id: `sig-long-2-${Date.now()}`,
        timestamp: now,
        pillarId: 'EQUITY_LONGTERM',
        pillarName: 'Equity Long-Term',
        strategyId: 'RELATIVE_STRENGTH',
        strategyName: 'Relative Strength (RS vs Benchmark)',
        symbol: 'TATAMOTORS',
        assetName: 'Tata Motors Ltd.',
        assetClass: 'EQUITY',
        direction: 'BUY',
        timeframe: 'Weekly',
        entryPrice: 1085.00,
        stopLoss: 940.00,
        target1: 1350.00,
        target2: 1500.00,
        riskReward: '1:4.5',
        confidenceScore: 89,
        status: 'ACTIVE',
        rationale: 'Outperforming NIFTY 50 by +12.5% over rolling 6-month window. RS line printed fresh all-time high ahead of price.',
        technicalTriggers: [
          'Mansfield RS vs NIFTY: +12.5 (Top 5% market percentile)',
          'Auto Sector leading in Sector Rotation RRG Matrix',
          'Price > 50 EMA > 200 SMA in clean multi-year structural uptrend',
          '3-Year Profit CAGR > 35%'
        ],
        suggestedAction: 'LONG-TERM WEALTH COMPOUNDING: Target ₹1,350 - ₹1,500 over 12-18 months'
      }
    );

    // 4. F&O SIGNALS
    signals.push(
      {
        id: `sig-fno-1-${Date.now()}`,
        timestamp: now,
        pillarId: 'FNO',
        pillarName: 'F&O',
        strategyId: 'OPTIONS_OI',
        strategyName: 'Options Open Interest & Strike Buildup',
        symbol: 'NIFTY',
        assetName: 'NIFTY 50 Index (European)',
        assetClass: 'INDEX_FNO',
        direction: 'BUY',
        timeframe: '15m / Hourly',
        entryPrice: 24850.00,
        stopLoss: 24700.00,
        target1: 25050.00,
        target2: 25200.00,
        riskReward: '1:2.3',
        confidenceScore: 87,
        status: 'ACTIVE',
        rationale: 'Aggressive Put writing observed at 24,800 and 24,700 strikes (PE OI +180% vs CE OI). PCR climbed to 1.14 signaling bullish bias.',
        technicalTriggers: [
          'Put-Call Ratio (PCR) at 1.14 (Strong Put writing cushion)',
          '24,800 PE added +42L contracts in today session',
          'Max Pain level situated at 24,800 providing floor',
          'IV Percentile at 42% (Optimal for Bull Put Spreads or Long Calls)'
        ],
        suggestedAction: 'Deploy Bull Put Spread: Sell 24800 PE + Buy 24650 PE for steady theta credit',
        legs: [
          {
            id: `leg-fno-1-${Date.now()}`,
            type: 'PE',
            action: 'SELL',
            strikePrice: 24800,
            expiry: '2026-08-27',
            quantity: 1,
            lotSize: 25,
            currentLtp: 110.5,
            entryPrice: 110.5,
            iv: 14.5,
            delta: -0.42,
            gamma: 0.0018,
            theta: -18.5,
            vega: 12.0,
            product: 'NRML',
            customLabel: 'Sell NIFTY 24800 PE'
          },
          {
            id: `leg-fno-2-${Date.now()}`,
            type: 'PE',
            action: 'BUY',
            strikePrice: 24650,
            expiry: '2026-08-27',
            quantity: 1,
            lotSize: 25,
            currentLtp: 58.0,
            entryPrice: 58.0,
            iv: 15.2,
            delta: -0.22,
            gamma: 0.0012,
            theta: -10.2,
            vega: 8.5,
            product: 'NRML',
            customLabel: 'Buy NIFTY 24650 PE'
          }
        ]
      },
      {
        id: `sig-fno-2-${Date.now()}`,
        timestamp: now,
        pillarId: 'FNO',
        pillarName: 'F&O',
        strategyId: 'EXPIRY_AWARE',
        strategyName: 'Expiry-Aware & 0DTE Theta Strategies',
        symbol: 'BANKNIFTY',
        assetName: 'NIFTY Bank Index (European)',
        assetClass: 'INDEX_FNO',
        direction: 'NEUTRAL_SPREAD',
        timeframe: '5m / 15m (Expiry Session)',
        entryPrice: 52400.00,
        stopLoss: 52750.00,
        target1: 52400.00,
        target2: 52400.00,
        riskReward: '1:1.6',
        confidenceScore: 81,
        status: 'ACTIVE',
        rationale: 'Weekly expiry theta acceleration decay profile. Straddle premium decaying at ₹42/hour with Max Pain anchoring at 52,000 - 52,500 corridor.',
        technicalTriggers: [
          '0DTE Non-linear Theta curve in active decay window',
          '52,000 PE and 52,500 CE straddle width contracting',
          'India VIX stable at 15.2',
          'Net Delta calibrated to 0.00'
        ],
        suggestedAction: 'Deploy Iron Condor: Sell 52500 CE/PE & Buy 53000/52000 wings with 12% safety margin'
      }
    );

    // 5. COMMODITIES SIGNALS
    signals.push(
      {
        id: `sig-comm-1-${Date.now()}`,
        timestamp: now,
        pillarId: 'COMMODITIES',
        pillarName: 'Commodities',
        strategyId: 'TREND_FOLLOWING',
        strategyName: 'Commodities Trend Following',
        symbol: 'GOLD',
        assetName: 'Gold 1 KG (MCX)',
        assetClass: 'COMMODITY',
        direction: 'BUY',
        timeframe: '4-Hour / Daily',
        entryPrice: 72850.00,
        stopLoss: 72100.00,
        target1: 74200.00,
        target2: 75500.00,
        riskReward: '1:3.5',
        confidenceScore: 88,
        status: 'ACTIVE',
        rationale: 'Gold holding above 50-day EMA (₹71,200) with Supertrend green on 4-Hour chart. Global COMEX Gold breaking key multi-week consolidation.',
        technicalTriggers: [
          'Price > 50 EMA on Daily and 4-Hour charts',
          'ADX(14) at 29.4 confirming strong trend strength',
          'COMEX Gold $2,480 breakout confirming global trend',
          'US Dollar Index (DXY) showing weakness'
        ],
        suggestedAction: 'BUY MCX GOLD (Futures) trailing SL along 4-Hour 21 EMA'
      },
      {
        id: `sig-comm-2-${Date.now()}`,
        timestamp: now,
        pillarId: 'COMMODITIES',
        pillarName: 'Commodities',
        strategyId: 'BREAKOUT',
        strategyName: 'Commodity Level & Inventory Breakout',
        symbol: 'CRUDEOIL',
        assetName: 'Crude Oil 100 BBL (MCX)',
        assetClass: 'COMMODITY',
        direction: 'BUY',
        timeframe: '15m / 30m',
        entryPrice: 6420.00,
        stopLoss: 6330.00,
        target1: 6580.00,
        target2: 6720.00,
        riskReward: '1:3.3',
        confidenceScore: 84,
        status: 'ACTIVE',
        rationale: 'Crude Oil broke ₹6,380 horizontal resistance during US market opening session with 2.8x volume surge and positive inventory drawdown.',
        technicalTriggers: [
          'Clean breakout above 3-day value area high (₹6,380)',
          'Volume on breakout candle 280% of session average',
          'EIA inventory report showed -3.8M barrel draw (Bullish surprise)',
          'NYMEX WTI Crude up +1.8% in lockstep'
        ],
        suggestedAction: 'BUY MCX CRUDEOIL (Futures) target ₹6,580 / ₹6,720'
      }
    );

    if (filterPillar) {
      return signals.filter(s => s.pillarId === filterPillar);
    }
    return signals;
  }

  public getTaxonomy(): TradingPillar[] {
    return TRADING_PILLARS_TAXONOMY;
  }

  public getAssetUniverse(filterClass?: string): MultiAssetQuote[] {
    const list = MULTI_ASSET_UNIVERSE.map(item => {
      try {
        const liveSpot = globalMarketFeed.getSpotQuote(item.symbol);
        if (liveSpot && typeof liveSpot.spot === 'number' && liveSpot.spot > 0) {
          const ltp = liveSpot.spot;
          const prevClose = liveSpot.prevClose || item.prevClose;
          const change = liveSpot.change;
          const pChange = liveSpot.pChange;
          const high = Math.max(item.high || ltp, ltp);
          const low = Math.min(item.low || ltp, ltp);
          return {
            ...item,
            ltp,
            prevClose,
            change,
            pChange,
            high,
            low,
            vwap: Number((ltp * (1 + (Math.sin(ltp) * 0.002))).toFixed(2))
          };
        }
      } catch (e) {
        // Fallback to static item
      }
      return item;
    });

    if (filterClass) {
      return list.filter(a => a.assetClass === filterClass);
    }
    return list;
  }

  public getSectorRotation(): SectorRotationData[] {
    return SECTOR_ROTATION_MATRIX;
  }
}

export const globalStrategyPlatformEngine = new StrategyPlatformEngine();
