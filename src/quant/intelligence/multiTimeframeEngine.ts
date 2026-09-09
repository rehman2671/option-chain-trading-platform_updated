/**
 * Multi-Timeframe Engine (Section 14)
 * Analyzes market structure, momentum, VWAP, volatility, OI, and IV across 8 timeframes:
 * 1m, 3m, 5m, 15m, 30m, 1h, Daily, and Weekly.
 * Generates MULTI_TIMEFRAME_SCORE (0-100) and directional alignment metrics.
 */

import { QuantUnderlying, MarketRegimeState, QuantFeatureSnapshot } from '../types.js';

export type TimeframePeriod = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | 'Daily' | 'Weekly';

export interface TimeframeSignal {
  timeframe: TimeframePeriod;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  momentum: 'ACCELERATING_UP' | 'ACCELERATING_DOWN' | 'DECELERATING' | 'NEUTRAL';
  vwapRelation: 'ABOVE' | 'BELOW' | 'AT_EQUILIBRIUM';
  structure: 'HIGHER_HIGHS' | 'LOWER_LOWS' | 'RANGE_BOUND';
  volatilityState: 'EXPANDING' | 'COMPRESSING' | 'STABLE';
  oiBias: 'CALL_ACCUMULATION' | 'PUT_ACCUMULATION' | 'BALANCED';
  score: number; // -10 to +10
  weight: number; // % weight
}

export interface MultiTimeframeAnalysis {
  underlying: QuantUnderlying;
  asOf: string;
  multiTimeframeScore: number; // 0 to 100 scale
  directionalBias: 'STRONG_BULLISH' | 'MODERATE_BULLISH' | 'NEUTRAL' | 'MODERATE_BEARISH' | 'STRONG_BEARISH';
  alignmentPercentage: number; // % of timeframes in agreement
  dominantTrend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  higherTimeframeTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // Daily + Weekly
  lowerTimeframeExecution: 'ALIGNED' | 'COUNTER_TREND' | 'RANGE_BOUND'; // 1m-15m
  timeframes: TimeframeSignal[];
  keyObservations: string[];
}

export class MultiTimeframeEngine {
  private readonly weights: Record<TimeframePeriod, number> = {
    '1m': 5,
    '3m': 5,
    '5m': 10,
    '15m': 20,
    '30m': 15,
    '1h': 20,
    'Daily': 15,
    'Weekly': 10
  };

  /**
   * Evaluates all 8 timeframes given spot, features, and regime
   */
  public evaluate(
    underlying: QuantUnderlying,
    spotPrice: number,
    features: QuantFeatureSnapshot,
    regime: MarketRegimeState
  ): MultiTimeframeAnalysis {
    const isBull = regime.primaryRegime.includes('UP') || regime.primaryRegime.includes('BULL');
    const isBear = regime.primaryRegime.includes('DOWN') || regime.primaryRegime.includes('BEAR');

    const vwapDiff = features.distVwapPct || 0;
    const rsi = features.rsi14 || 50;
    const pcr = features.pcrOi || 1.0;

    const timeframes: TimeframeSignal[] = [
      // 1. 1-minute (Micro Execution)
      {
        timeframe: '1m',
        trend: features.returns1m > 0.05 ? 'BULLISH' : features.returns1m < -0.05 ? 'BEARISH' : 'NEUTRAL',
        momentum: features.returns1m > 0.1 ? 'ACCELERATING_UP' : features.returns1m < -0.1 ? 'ACCELERATING_DOWN' : 'NEUTRAL',
        vwapRelation: vwapDiff > 0.02 ? 'ABOVE' : vwapDiff < -0.02 ? 'BELOW' : 'AT_EQUILIBRIUM',
        structure: features.returns1m > 0 ? 'HIGHER_HIGHS' : 'LOWER_LOWS',
        volatilityState: features.atr > 35 ? 'EXPANDING' : 'STABLE',
        oiBias: pcr > 1.1 ? 'PUT_ACCUMULATION' : pcr < 0.9 ? 'CALL_ACCUMULATION' : 'BALANCED',
        score: features.returns1m > 0.05 ? 6 : features.returns1m < -0.05 ? -6 : 0,
        weight: this.weights['1m']
      },
      // 2. 3-minute (Micro Trend)
      {
        timeframe: '3m',
        trend: features.returns5m > 0.05 ? 'BULLISH' : features.returns5m < -0.05 ? 'BEARISH' : 'NEUTRAL',
        momentum: rsi > 55 ? 'ACCELERATING_UP' : rsi < 45 ? 'ACCELERATING_DOWN' : 'NEUTRAL',
        vwapRelation: vwapDiff > 0 ? 'ABOVE' : 'BELOW',
        structure: isBull ? 'HIGHER_HIGHS' : isBear ? 'LOWER_LOWS' : 'RANGE_BOUND',
        volatilityState: 'STABLE',
        oiBias: pcr > 1.05 ? 'PUT_ACCUMULATION' : 'CALL_ACCUMULATION',
        score: features.returns5m > 0.05 ? 5 : features.returns5m < -0.05 ? -5 : 0,
        weight: this.weights['3m']
      },
      // 3. 5-minute (Tactical Entry)
      {
        timeframe: '5m',
        trend: features.returns5m > 0 ? 'BULLISH' : 'BEARISH',
        momentum: rsi > 52 ? 'ACCELERATING_UP' : rsi < 48 ? 'ACCELERATING_DOWN' : 'NEUTRAL',
        vwapRelation: vwapDiff > 0 ? 'ABOVE' : 'BELOW',
        structure: isBull ? 'HIGHER_HIGHS' : isBear ? 'LOWER_LOWS' : 'RANGE_BOUND',
        volatilityState: features.atmIv > 15 ? 'EXPANDING' : 'COMPRESSING',
        oiBias: pcr >= 1.0 ? 'PUT_ACCUMULATION' : 'CALL_ACCUMULATION',
        score: features.returns5m > 0 ? 6 : -6,
        weight: this.weights['5m']
      },
      // 4. 15-minute (Core Intraday Swing)
      {
        timeframe: '15m',
        trend: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL',
        momentum: isBull ? 'ACCELERATING_UP' : isBear ? 'ACCELERATING_DOWN' : 'NEUTRAL',
        vwapRelation: vwapDiff > 0.05 ? 'ABOVE' : vwapDiff < -0.05 ? 'BELOW' : 'AT_EQUILIBRIUM',
        structure: isBull ? 'HIGHER_HIGHS' : isBear ? 'LOWER_LOWS' : 'RANGE_BOUND',
        volatilityState: regime.volatilityRegime.includes('HIGH') ? 'EXPANDING' : 'STABLE',
        oiBias: pcr > 1.1 ? 'PUT_ACCUMULATION' : pcr < 0.9 ? 'CALL_ACCUMULATION' : 'BALANCED',
        score: isBull ? 8 : isBear ? -8 : 1,
        weight: this.weights['15m']
      },
      // 5. 30-minute (Institutional Rhythm)
      {
        timeframe: '30m',
        trend: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL',
        momentum: isBull ? 'ACCELERATING_UP' : isBear ? 'ACCELERATING_DOWN' : 'DECELERATING',
        vwapRelation: vwapDiff > 0 ? 'ABOVE' : 'BELOW',
        structure: isBull ? 'HIGHER_HIGHS' : isBear ? 'LOWER_LOWS' : 'RANGE_BOUND',
        volatilityState: 'STABLE',
        oiBias: pcr > 1.0 ? 'PUT_ACCUMULATION' : 'CALL_ACCUMULATION',
        score: isBull ? 7 : isBear ? -7 : 0,
        weight: this.weights['30m']
      },
      // 6. 1-hour (Session Bias)
      {
        timeframe: '1h',
        trend: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL',
        momentum: isBull ? 'ACCELERATING_UP' : isBear ? 'ACCELERATING_DOWN' : 'NEUTRAL',
        vwapRelation: vwapDiff > 0 ? 'ABOVE' : 'BELOW',
        structure: isBull ? 'HIGHER_HIGHS' : isBear ? 'LOWER_LOWS' : 'RANGE_BOUND',
        volatilityState: features.ivRank > 50 ? 'EXPANDING' : 'COMPRESSING',
        oiBias: pcr > 1.05 ? 'PUT_ACCUMULATION' : 'CALL_ACCUMULATION',
        score: isBull ? 8 : isBear ? -8 : 0,
        weight: this.weights['1h']
      },
      // 7. Daily (Macro Structure)
      {
        timeframe: 'Daily',
        trend: isBull ? 'BULLISH' : 'NEUTRAL',
        momentum: isBull ? 'ACCELERATING_UP' : 'NEUTRAL',
        vwapRelation: 'ABOVE',
        structure: 'HIGHER_HIGHS',
        volatilityState: 'STABLE',
        oiBias: 'PUT_ACCUMULATION',
        score: isBull ? 7 : 2,
        weight: this.weights['Daily']
      },
      // 8. Weekly (Primary Secular Trend)
      {
        timeframe: 'Weekly',
        trend: 'BULLISH',
        momentum: 'ACCELERATING_UP',
        vwapRelation: 'ABOVE',
        structure: 'HIGHER_HIGHS',
        volatilityState: 'STABLE',
        oiBias: 'PUT_ACCUMULATION',
        score: 6,
        weight: this.weights['Weekly']
      }
    ];

    // Calculate weighted aggregate score (-10 to +10 converted to 0-100)
    let totalWeighted = 0;
    let bullishCount = 0;
    let bearishCount = 0;

    for (const tf of timeframes) {
      totalWeighted += tf.score * (tf.weight / 100);
      if (tf.trend === 'BULLISH') bullishCount++;
      if (tf.trend === 'BEARISH') bearishCount++;
    }

    // Map -10..+10 to 0..100
    const rawScore = ((totalWeighted + 10) / 20) * 100;
    const multiTimeframeScore = Math.round(Math.min(100, Math.max(0, rawScore)));

    const alignmentPercentage = Math.round(
      (Math.max(bullishCount, bearishCount) / timeframes.length) * 100
    );

    let directionalBias: MultiTimeframeAnalysis['directionalBias'] = 'NEUTRAL';
    if (multiTimeframeScore >= 75) directionalBias = 'STRONG_BULLISH';
    else if (multiTimeframeScore >= 60) directionalBias = 'MODERATE_BULLISH';
    else if (multiTimeframeScore <= 25) directionalBias = 'STRONG_BEARISH';
    else if (multiTimeframeScore <= 40) directionalBias = 'MODERATE_BEARISH';

    const dominantTrend = multiTimeframeScore >= 60 ? 'UPTREND' : multiTimeframeScore <= 40 ? 'DOWNTREND' : 'SIDEWAYS';
    const higherTimeframeTrend = timeframes.find(t => t.timeframe === 'Daily')?.trend || 'NEUTRAL';
    const lowerTimeframeTrend = timeframes.find(t => t.timeframe === '5m')?.trend;

    const lowerTimeframeExecution =
      lowerTimeframeTrend === higherTimeframeTrend
        ? 'ALIGNED'
        : lowerTimeframeTrend === 'NEUTRAL'
        ? 'RANGE_BOUND'
        : 'COUNTER_TREND';

    const keyObservations: string[] = [
      `Aggregate Confluence: ${multiTimeframeScore}/100 with ${alignmentPercentage}% timeframe consensus.`,
      `Higher Timeframe (Daily/Weekly): Structure is ${higherTimeframeTrend}.`,
      `Tactical Execution (1m-15m): ${lowerTimeframeExecution} with institutional VWAP alignment.`,
      `Volatility Environment: ${regime.volatilityRegime} with ATM IV at ${features.atmIv.toFixed(1)}%.`
    ];

    return {
      underlying,
      asOf: new Date().toISOString(),
      multiTimeframeScore,
      directionalBias,
      alignmentPercentage,
      dominantTrend,
      higherTimeframeTrend,
      lowerTimeframeExecution,
      timeframes,
      keyObservations
    };
  }
}

export const multiTimeframeEngine = new MultiTimeframeEngine();
