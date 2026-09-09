/**
 * Market Regime Classification Engine
 * Classifies underlying market conditions into actionable quantitative regimes.
 * Uses measurable feature thresholds and always marks estimated metrics with confidence.
 */

import { QuantUnderlying, MarketRegimeType, MarketRegimeState, QuantFeatureSnapshot } from '../types.js';

export class RegimeEngine {
  private static instance: RegimeEngine;

  private constructor() {}

  public static getInstance(): RegimeEngine {
    if (!RegimeEngine.instance) {
      RegimeEngine.instance = new RegimeEngine();
    }
    return RegimeEngine.instance;
  }

  public classify(features: QuantFeatureSnapshot): MarketRegimeState {
    const {
      underlying,
      distVwapPct,
      distEma20Pct,
      returns15m,
      returns1h,
      rsi14,
      pcrOi,
      ivRank,
      atmIv,
      callWallStrike,
      putWallStrike,
      spotPrice,
      estimatedNetGamma
    } = features;

    let primaryRegime: MarketRegimeType = 'RANGE';
    let secondaryRegime: MarketRegimeType = 'MEAN_REVERSION';
    let confidence = 0.72;
    let rationale = '';

    // 1. Trend Direction Classification
    const isStrongUp = distVwapPct > 0.25 && distEma20Pct > 0.2 && rsi14 > 58 && pcrOi > 1.1;
    const isStrongDown = distVwapPct < -0.25 && distEma20Pct < -0.2 && rsi14 < 42 && pcrOi < 0.9;
    const isBreakout = spotPrice >= callWallStrike - 20 && returns15m > 0.35;
    const isBreakdown = spotPrice <= putWallStrike + 20 && returns15m < -0.35;

    if (isBreakout) {
      primaryRegime = 'BREAKOUT';
      secondaryRegime = 'VOL_EXPANSION';
      confidence = 0.84;
      rationale = 'Spot pressing Call Wall resistance with expanding 15m momentum';
    } else if (isBreakdown) {
      primaryRegime = 'BREAKDOWN';
      secondaryRegime = 'VOL_EXPANSION';
      confidence = 0.83;
      rationale = 'Spot breaking Put Wall support with accelerated downside velocity';
    } else if (isStrongUp) {
      primaryRegime = 'TREND_UP';
      secondaryRegime = 'POSITIVE_GAMMA';
      confidence = 0.80;
      rationale = 'Price above VWAP & EMA 20 with bullish PCR and expanding RSI';
    } else if (isStrongDown) {
      primaryRegime = 'TREND_DOWN';
      secondaryRegime = 'NEGATIVE_GAMMA';
      confidence = 0.79;
      rationale = 'Price below VWAP & EMA 20 with heavy Call writing and sub-45 RSI';
    } else {
      primaryRegime = 'RANGE';
      secondaryRegime = Math.abs(distVwapPct) > 0.15 ? 'MEAN_REVERSION' : 'LOW_VOL';
      confidence = 0.68;
      rationale = 'Price oscillating tightly within standard deviation bands and OI walls';
    }

    // 2. Volatility State
    const volatilityRegime = ivRank > 65 || atmIv > 18 ? 'HIGH_EXPANDING' : ivRank < 30 ? 'LOW_COMPRESSION' : 'NORMAL';

    // 3. Gamma Exposure Regime (Estimated)
    const gammaRegime = estimatedNetGamma > 5000 ? 'POSITIVE_GAMMA' : estimatedNetGamma < -5000 ? 'NEGATIVE_GAMMA' : 'NEUTRAL';

    // Expected daily move estimation: Spot * (IV / 100) * sqrt(1 / 365)
    const dailyVolFraction = (atmIv / 100) * Math.sqrt(1 / 365);
    const expectedMove = Math.round(spotPrice * dailyVolFraction);

    return {
      underlying,
      asOf: new Date().toISOString(),
      primaryRegime,
      secondaryRegime,
      volatilityRegime,
      gammaRegime,
      confidence,
      estimated: true,
      dataQuality: 'OK',
      rationale,
      keyLevels: {
        support: putWallStrike,
        resistance: callWallStrike,
        callWall: callWallStrike,
        putWall: putWallStrike,
        gammaFlip: Math.round((callWallStrike + putWallStrike) / 2),
        expectedMove
      }
    };
  }
}

export const regimeEngine = RegimeEngine.getInstance();
