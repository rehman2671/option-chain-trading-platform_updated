/**
 * Historical Analogue Engine
 * Maps current multi-dimensional feature vector to historical market states.
 * Quantifies empirical probability distribution of subsequent forward moves.
 */

import {
  QuantUnderlying,
  QuantFeatureSnapshot,
  HistoricalAnalogueResult,
  QuantFeatureRecord,
  HistoricalEpisodeMatch
} from '../types.js';
import { dbEngine } from '../../server/db.js';

export interface NormalizedFeatureVector {
  returns5mNorm: number;
  distVwapNorm: number;
  atrPercentileNorm: number;
  rsi14Norm: number;
  adx14Norm: number;
}

/**
 * Normalizes characteristic feature scales into dimensionless ~[-1, 1] units:
 * - returns5m: 0.35% intraday move maps to 1.0
 * - distVwapPct: 0.35% distance from VWAP maps to 1.0
 * - atrPercentile: [25, 75] maps to [-1.0, 1.0]
 * - rsi14: [35, 65] maps to [-1.0, 1.0]
 * - adx14: [15, 35] maps to [-1.0, 1.0]
 */
export function extractNormalizedVector(
  returns5m: number,
  distVwapPct: number,
  atrPercentile: number,
  rsi14: number,
  adx14: number
): number[] {
  const returns5mNorm = (returns5m || 0) / 0.0035;
  const distVwapNorm = (distVwapPct || 0) / 0.35;
  const atrPercentileNorm = ((atrPercentile ?? 50) - 50) / 25;
  const rsi14Norm = ((rsi14 ?? 50) - 50) / 15;
  const adx14Norm = ((adx14 ?? 25) - 25) / 10;

  return [returns5mNorm, distVwapNorm, atrPercentileNorm, rsi14Norm, adx14Norm];
}

/**
 * Computes normalized Euclidean similarity in [0, 1].
 * Exact match (distance = 0) returns 1.0.
 */
export function computeVectorSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let sumSqDiff = 0;
  for (let i = 0; i < vecA.length; i++) {
    const diff = vecA[i] - vecB[i];
    sumSqDiff += diff * diff;
  }
  const distance = Math.sqrt(sumSqDiff);
  if (distance < 0.0001) return 1.0;

  const normalizedDistance = distance / Math.sqrt(vecA.length);
  // Inverse distance mapping bounded in [0, 1]
  const sim = 1 / (1 + 0.35 * normalizedDistance);
  return Number(sim.toFixed(4));
}

function determineBestStrategy(rec: QuantFeatureRecord): string {
  if (rec.forwardReturn30m > 0.003) {
    return 'BULL_CALL_SPREAD';
  } else if (rec.forwardReturn30m < -0.003) {
    return 'BEAR_PUT_SPREAD';
  } else if (rec.atrPercentile > 75) {
    return 'LONG_STRADDLE';
  } else if (rec.atrPercentile < 40) {
    return 'IRON_CONDOR';
  }
  return 'SHORT_STRANGLE';
}

function computeHorizonOutcome(
  records: QuantFeatureRecord[],
  key: 'forwardReturn15m' | 'forwardReturn30m' | 'forwardReturn1h' | 'forwardReturnEod'
): { upProb: number; downProb: number; flatProb: number; expectedReturnPct: number } {
  if (records.length === 0) {
    return { upProb: 0, downProb: 0, flatProb: 1, expectedReturnPct: 0 };
  }

  let up = 0;
  let down = 0;
  let flat = 0;
  let totalRet = 0;

  for (const r of records) {
    const val = r[key] || 0;
    totalRet += val;
    if (val > 0.001) {
      up++;
    } else if (val < -0.001) {
      down++;
    } else {
      flat++;
    }
  }

  const n = records.length;
  const upProb = Number((up / n).toFixed(2));
  const downProb = Number((down / n).toFixed(2));
  const flatProb = Number(Math.max(0, 1 - upProb - downProb).toFixed(2));
  const expectedReturnPct = Number(((totalRet / n) * 100).toFixed(2));

  return { upProb, downProb, flatProb, expectedReturnPct };
}

export class AnalogueEngine {
  private static instance: AnalogueEngine;

  private constructor() {}

  public static getInstance(): AnalogueEngine {
    if (!AnalogueEngine.instance) {
      AnalogueEngine.instance = new AnalogueEngine();
    }
    return AnalogueEngine.instance;
  }

  /**
   * Evaluates historical analogues matching current multi-dimensional feature vector.
   * Compares against real historical feature vectors stored in SQLite.
   */
  public findAnalogues(features: QuantFeatureSnapshot): HistoricalAnalogueResult {
    // 1. Retrieve stored historical feature vectors for this underlying
    const history = dbEngine.getQuantFeatureHistory(features.underlying, 500);

    // 2. Cold-start fallback if fewer than 10 historical samples exist
    if (history.length < 10) {
      return {
        underlying: features.underlying,
        sampleCount: history.length,
        periodLookback: 'Insufficient Historical Samples (< 10)',
        similarityScore: 0,
        patternSummary: `Insufficient historical records for ${features.underlying} (found ${history.length}, minimum 10 required for empirical analogue matching).`,
        topEpisodes: [],
        outcomes: {
          horizon15m: { upProb: 0, downProb: 0, flatProb: 1, expectedReturnPct: 0 },
          horizon30m: { upProb: 0, downProb: 0, flatProb: 1, expectedReturnPct: 0 },
          horizon1h: { upProb: 0, downProb: 0, flatProb: 1, expectedReturnPct: 0 },
          horizonEod: { upProb: 0, downProb: 0, flatProb: 1, expectedReturnPct: 0 }
        },
        maxFavorableExcursionAvg: 0,
        maxAdverseExcursionAvg: 0
      };
    }

    // 3. Extract normalized vector from current snapshot
    const currentVec = extractNormalizedVector(
      features.returns5m,
      features.distVwapPct,
      features.atrPercentile,
      features.rsi14,
      features.adx14
    );

    // 4. Compute similarity against each historical record
    const scored = history.map(rec => {
      const histVec = extractNormalizedVector(
        rec.returns5m,
        rec.distVwapPct,
        rec.atrPercentile,
        rec.rsi14,
        rec.adx14
      );
      const similarity = computeVectorSimilarity(currentVec, histVec);
      return { record: rec, similarity };
    });

    // 5. Rank by similarity descending
    scored.sort((a, b) => b.similarity - a.similarity);

    // 6. Select Top K matches (5 to 15, depending on available historical depth)
    const K = Math.min(15, Math.max(5, Math.min(scored.length, 10)));
    const topK = scored.slice(0, K);
    const matchingRecords = topK.map(item => item.record);

    // 7. Compute real aggregated metrics
    const avgSimilarity = topK.reduce((sum, item) => sum + item.similarity, 0) / topK.length;
    const similarityScore = Number(avgSimilarity.toFixed(4));

    const outcomes = {
      horizon15m: computeHorizonOutcome(matchingRecords, 'forwardReturn15m'),
      horizon30m: computeHorizonOutcome(matchingRecords, 'forwardReturn30m'),
      horizon1h: computeHorizonOutcome(matchingRecords, 'forwardReturn1h'),
      horizonEod: computeHorizonOutcome(matchingRecords, 'forwardReturnEod')
    };

    const maxFavorableExcursionAvg = Number(
      (matchingRecords.reduce((sum, r) => sum + (r.mfeR || 0), 0) / matchingRecords.length).toFixed(2)
    );
    const maxAdverseExcursionAvg = Number(
      (matchingRecords.reduce((sum, r) => sum + (r.maeR || 0), 0) / matchingRecords.length).toFixed(2)
    );

    const topEpisodes: HistoricalEpisodeMatch[] = scored.slice(0, 5).map(item => ({
      date: item.record.timestamp ? item.record.timestamp.slice(0, 10) : '2025-01-01',
      eventName: item.record.eventName || 'Historical Regime Match',
      similarityPct: Math.round(item.similarity * 100),
      regime: item.record.regime || 'RANGE',
      forwardMove30mPct: Number(((item.record.forwardReturn30m || 0) * 100).toFixed(2)),
      forwardMoveEodPct: Number(((item.record.forwardReturnEod || 0) * 100).toFixed(2)),
      bestStrategy: determineBestStrategy(item.record)
    }));

    const upCount = Math.round(matchingRecords.length * outcomes.horizon30m.upProb);
    const downCount = Math.round(matchingRecords.length * outcomes.horizon30m.downProb);
    const flatCount = Math.max(0, matchingRecords.length - upCount - downCount);
    const patternSummary = `In top ${matchingRecords.length} historical analogues: ${upCount} went up, ${downCount} went down, ${flatCount} flat (Avg similarity: ${(similarityScore * 100).toFixed(1)}%, 30m Exp Return: ${outcomes.horizon30m.expectedReturnPct > 0 ? '+' : ''}${outcomes.horizon30m.expectedReturnPct}%)`;

    return {
      underlying: features.underlying,
      sampleCount: history.length,
      periodLookback: `${history.length} Historical Multi-Regime Samples`,
      similarityScore,
      patternSummary,
      topEpisodes,
      outcomes,
      maxFavorableExcursionAvg,
      maxAdverseExcursionAvg
    };
  }
}

export const analogueEngine = AnalogueEngine.getInstance();
