import { QuantUnderlying } from '../types.js';
import { marketDataAdapter } from '../adapters/marketDataAdapter.js';
import { featureEngine } from '../features/featureEngine.js';
import { regimeEngine } from '../intelligence/regimeEngine.js';
import { dbEngine } from '../../server/db.js';

/**
 * Retrieves historical candles for feature calculation without fabricating synthetic data.
 */
export function getHistoricalCandles(
  underlying: QuantUnderlying,
  spotPrice: number,
  count: number = 60
): Array<{ close: number; high: number; low: number; volume: number }> {
  try {
    // 1. Primary: Real 1-minute candles grouped on-the-fly from ticks table
    const minuteCandles = dbEngine.getRecentSpotCandlesForUnderlying(underlying, count);
    if (minuteCandles && minuteCandles.length >= 10) {
      const candles = minuteCandles.map((c) => ({
        close: Number(c.close) || spotPrice,
        high: Number(c.high) || spotPrice,
        low: Number(c.low) || spotPrice,
        volume: Number(c.volume) || 0
      }));
      if (spotPrice > 0 && candles.length > 0) {
        const last = candles[candles.length - 1];
        candles[candles.length - 1] = {
          close: spotPrice,
          high: Math.max(last.high, spotPrice),
          low: Math.min(last.low, spotPrice),
          volume: last.volume
        };
      }
      return candles;
    }

    // 2. Secondary fallback: Real historical 15m candles from ema_15m_candles
    const rawCandles = dbEngine.getEma15mCandles(underlying, count);
    if (rawCandles && rawCandles.length > 0) {
      const candles = rawCandles.map((c) => ({
        close: Number(c.close) || spotPrice,
        high: Number(c.high) || spotPrice,
        low: Number(c.low) || spotPrice,
        volume: Number(c.volume) || 0
      }));
      if (spotPrice > 0 && candles.length > 0) {
        const last = candles[candles.length - 1];
        candles[candles.length - 1] = {
          close: spotPrice,
          high: Math.max(last.high, spotPrice),
          low: Math.min(last.low, spotPrice),
          volume: last.volume
        };
      }
      return candles;
    }

    // 3. Fallback: Real raw ticks from SQLite ticks table
    const ticks = dbEngine.getHistoricalTicks(underlying, undefined, undefined, count);
    if (ticks && ticks.length > 0) {
      return ticks.map((t) => ({
        close: t.spotPrice,
        high: t.spotPrice,
        low: t.spotPrice,
        volume: 0
      }));
    }
  } catch (err) {
    console.warn(`[MARKET CONTEXT] Error fetching candles from db for ${underlying}:`, err);
  }

  // Truly no historical data exists yet - return empty array without fabricating
  return [];
}

/**
 * Computes live market context, snapshots, features, regime classification, and data quality.
 */
export function getComputedMarketContext(underlying: QuantUnderlying) {
  const snapshots = marketDataAdapter.getLatestSnapshots(underlying);
  const spotPrice = marketDataAdapter.getSpotPrice(underlying);
  const candles = getHistoricalCandles(underlying, spotPrice, 60);
  const features = featureEngine.computeFeatures(underlying, spotPrice, candles, snapshots);
  const regime = regimeEngine.classify(features);
  const quality = marketDataAdapter.evaluateQuality(snapshots);

  if (candles.length < 10) {
    quality.status = 'DATA_INSUFFICIENT';
    quality.score = Math.min(quality.score, 45);
    quality.warnings.push(
      `Insufficient historical candle depth (${candles.length} candles available; minimum 10 required for full statistical confidence)`
    );
  }

  return { snapshots, spotPrice, candles, features, regime, quality };
}
