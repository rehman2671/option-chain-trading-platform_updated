/**
 * Advanced Option Analytics Engine: Max Pain, PCR, OI Buildup Classifier,
 * IV Rank/Percentile, Skew Curve, Unusual OI Anomaly Detector, and Event-Reactive Layer
 */

import { OIBuildupType, OIAnomaly, EventReactiveState, OptionStrikeRow } from '../../types.js';
import { dbEngine } from '../db.js';

/**
 * Classifies Open Interest & Price movement into classic institutional buildup patterns
 */
export function classifyOIBuildup(
  priceChange: number,
  oiChange: number
): OIBuildupType {
  const pThreshold = 0.05; // 0.05% price threshold
  const oiThreshold = 100;  // 100 contracts threshold

  if (Math.abs(priceChange) < pThreshold && Math.abs(oiChange) < oiThreshold) {
    return 'NEUTRAL';
  }

  if (priceChange > 0 && oiChange > 0) return 'LONG_BUILDUP';
  if (priceChange < 0 && oiChange > 0) return 'SHORT_BUILDUP';
  if (priceChange > 0 && oiChange < 0) return 'SHORT_COVERING';
  if (priceChange < 0 && oiChange < 0) return 'LONG_UNWINDING';

  return 'NEUTRAL';
}

/**
 * Calculates Max Pain Strike: The strike price at which total monetary loss 
 * to option writers (sellers) is minimized at expiry.
 * Excludes contracts with unavailable OI data to prevent skewed calculations.
 */
export function calculateMaxPainStrike(strikes: OptionStrikeRow[]): number {
  if (!strikes || strikes.length === 0) return 0;

  let minLoss = Infinity;
  let maxPainStrike = strikes[0].strikePrice;

  for (const candidateRow of strikes) {
    const K_test = candidateRow.strikePrice;
    let totalLoss = 0;

    for (const row of strikes) {
      const K = row.strikePrice;

      // Call Loss: If spot > strike, call writer pays (spot - strike) * Call OI
      if (K_test > K && row.ce.oiAvailable !== false && row.ce.available !== false) {
        totalLoss += (K_test - K) * row.ce.openInterest;
      }

      // Put Loss: If spot < strike, put writer pays (strike - spot) * Put OI
      if (K_test < K && row.pe.oiAvailable !== false && row.pe.available !== false) {
        totalLoss += (K - K_test) * row.pe.openInterest;
      }
    }

    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPainStrike = K_test;
    }
  }

  return maxPainStrike;
}

/**
 * Computes Put-Call Ratios excluding unavailable fields
 */
export function calculatePCR(strikes: OptionStrikeRow[]): { pcrOI: number; pcrVolume: number } {
  let totalCeOI = 0;
  let totalPeOI = 0;
  let totalCeVol = 0;
  let totalPeVol = 0;

  for (const row of strikes) {
    if (row.ce.oiAvailable !== false && row.ce.available !== false) {
      totalCeOI += row.ce.openInterest;
    }
    if (row.pe.oiAvailable !== false && row.pe.available !== false) {
      totalPeOI += row.pe.openInterest;
    }
    if (row.ce.volumeAvailable !== false && row.ce.available !== false) {
      totalCeVol += row.ce.volume;
    }
    if (row.pe.volumeAvailable !== false && row.pe.available !== false) {
      totalPeVol += row.pe.volume;
    }
  }

  const pcrOI = totalCeOI > 0 ? Number((totalPeOI / totalCeOI).toFixed(2)) : 1.0;
  const pcrVolume = totalCeVol > 0 ? Number((totalPeVol / totalCeVol).toFixed(2)) : 1.0;

  return { pcrOI, pcrVolume };
}

/**
 * Calculates IV Rank and IV Percentile relative to 252-day min/max/history
 */
export function calculateIVRankAndPercentile(
  currentAtmIV: number,
  historicalIVs: number[]
): { ivRank: number; ivPercentile: number } {
  if (!historicalIVs || historicalIVs.length === 0) {
    return { ivRank: 42, ivPercentile: 45 };
  }

  const minIV = Math.min(...historicalIVs);
  const maxIV = Math.max(...historicalIVs);

  // IV Rank = (Current - Min) / (Max - Min) * 100
  const ivRank = maxIV > minIV ? Math.round(((currentAtmIV - minIV) / (maxIV - minIV)) * 100) : 50;

  // IV Percentile = % of days in history where IV was lower than current
  const countLower = historicalIVs.filter(iv => iv < currentAtmIV).length;
  const ivPercentile = Math.round((countLower / historicalIVs.length) * 100);

  return {
    ivRank: Math.min(Math.max(ivRank, 0), 100),
    ivPercentile: Math.min(Math.max(ivPercentile, 0), 100)
  };
}

/**
 * Detects Statistical Unusual OI Anomalies using Z-score threshold (z > 2.0)
 * calculated against real rolling historical OI change baseline stored in SQLite.
 */
export function detectUnusualOIAnomalies(
  symbol: string,
  strikes: OptionStrikeRow[]
): OIAnomaly[] {
  const anomalies: OIAnomaly[] = [];

  // Fetch real historical OI change baseline from SQLite database
  const histOIChanges = dbEngine.getHistoricalOIChanges(symbol);
  let meanOIChange = 2500;
  let stdOIChange = 1800;
  let isProvisional = true;

  if (histOIChanges && histOIChanges.length >= 10) {
    const N = histOIChanges.length;
    meanOIChange = histOIChanges.reduce((a, b) => a + b, 0) / N;
    const variance = histOIChanges.reduce((a, b) => a + Math.pow(b - meanOIChange, 2), 0) / N;
    stdOIChange = Math.sqrt(variance) || 1000;
    isProvisional = false;
  }

  const noteSuffix = isProvisional ? ' [Provisional baseline — insufficient DB snapshots]' : '';

  for (const row of strikes) {
    // Check CE
    if (row.ce.oiAvailable !== false && row.ce.available !== false && Math.abs(row.ce.changeInOI) > 500) {
      const zCe = (Math.abs(row.ce.changeInOI) - meanOIChange) / stdOIChange;
      if (zCe >= 2.0) {
        anomalies.push({
          id: `anom-ce-${row.strikePrice}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          symbol,
          strikePrice: row.strikePrice,
          type: 'CE',
          zScore: Number(zCe.toFixed(2)),
          oiChange: row.ce.changeInOI,
          oiChangePercent: row.ce.pChangeInOI,
          volume: row.ce.volume,
          severity: zCe >= 3.5 ? 'HIGH' : 'MEDIUM',
          description: `Unusual Call ${row.ce.buildup.replace('_', ' ')} detected at strike ${row.strikePrice} (Z-Score: ${zCe.toFixed(2)}σ)${noteSuffix}`
        });
      }
    }

    // Check PE
    if (row.pe.oiAvailable !== false && row.pe.available !== false && Math.abs(row.pe.changeInOI) > 500) {
      const zPe = (Math.abs(row.pe.changeInOI) - meanOIChange) / stdOIChange;
      if (zPe >= 2.0) {
        anomalies.push({
          id: `anom-pe-${row.strikePrice}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          symbol,
          strikePrice: row.strikePrice,
          type: 'PE',
          zScore: Number(zPe.toFixed(2)),
          oiChange: row.pe.changeInOI,
          oiChangePercent: row.pe.pChangeInOI,
          volume: row.pe.volume,
          severity: zPe >= 3.5 ? 'HIGH' : 'MEDIUM',
          description: `Unusual Put ${row.pe.buildup.replace('_', ' ')} detected at strike ${row.strikePrice} (Z-Score: ${zPe.toFixed(2)}σ)${noteSuffix}`
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.zScore - a.zScore);
}

/**
 * Event-Reactive Shock & IV Skew Divergence Engine
 */
export function processEventReactiveState(
  spotPriceMovePercent: number,
  strikes: OptionStrikeRow[],
  currentCooldownSec: number
): EventReactiveState {
  const isSuddenMove = Math.abs(spotPriceMovePercent) >= 0.5; // >0.5% move in short interval
  
  // Calculate average Put IV vs Call IV
  let totalPeIv = 0;
  let totalCeIv = 0;
  let count = 0;

  for (const row of strikes) {
    if (row.ce.ivAvailable !== false && row.ce.available !== false && row.pe.ivAvailable !== false && row.pe.available !== false && row.ce.iv > 0 && row.pe.iv > 0) {
      totalCeIv += row.ce.iv;
      totalPeIv += row.pe.iv;
      count++;
    }
  }

  const avgCeIv = count > 0 ? totalCeIv / count : 15;
  const avgPeIv = count > 0 ? totalPeIv / count : 17;
  const peCeSkewDivergence = Number((avgPeIv - avgCeIv).toFixed(2));

  let newCooldown = currentCooldownSec;
  if (isSuddenMove) {
    newCooldown = 1800; // Reset 30-min cooldown window upon shock
  } else if (newCooldown > 0) {
    newCooldown = Math.max(0, newCooldown - 5);
  }

  let institutionalBias: EventReactiveState['institutionalBias'] = 'BALANCED';
  if (peCeSkewDivergence > 3.5) {
    institutionalBias = 'BEARISH_HEDGING';
  } else if (peCeSkewDivergence < -2.0) {
    institutionalBias = 'BULLISH_HEDGING';
  } else if (avgCeIv > 25 || avgPeIv > 25) {
    institutionalBias = 'VOLATILITY_EXPANSION';
  }

  return {
    isFastPollActive: isSuddenMove || newCooldown > 0,
    lastShockMagnitude: Number(spotPriceMovePercent.toFixed(2)),
    lastShockTimestamp: isSuddenMove ? new Date().toISOString() : undefined,
    peCeSkewDivergence,
    cooldownRemainingSec: newCooldown,
    institutionalBias
  };
}
