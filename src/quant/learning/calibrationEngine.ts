/**
 * Prediction Calibration Engine (Section 74)
 * Evaluates whether probabilistic forecasts align with historical realization frequencies.
 * Bins forecasts (50-60%, 60-70%, 70-80%, 80-90%, 90-100%) and computes real Brier score,
 * reliability index, and calibration curves from recorded trade outcomes.
 */

import { TradeReviewRecord } from '../types.js';
import { tradeReviewEngine } from './tradeReviewEngine.js';

export interface CalibrationBin {
  binRange: string;
  minProb: number;
  maxProb: number;
  sampleCount: number;
  meanPredictedProbPct: number;
  realizedFrequencyPct: number;
  calibrationErrorPct: number;
  status: 'CALIBRATED' | 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'INSUFFICIENT_DATA';
}

export interface CalibrationReport {
  asOf: string;
  overallBrierScore: number;
  maxCalibrationErrorPct: number;
  meanCalibrationErrorPct: number;
  reliabilityStatus: 'EXCELLENT' | 'ACCEPTABLE' | 'DEGRADED' | 'INSUFFICIENT_DATA';
  totalObservations: number;
  bins: CalibrationBin[];
  recommendations: string[];
}

export const MIN_CALIBRATION_SAMPLE_COUNT = 20;

export class CalibrationEngine {
  private static instance: CalibrationEngine;

  private constructor() {}

  public static getInstance(): CalibrationEngine {
    if (!CalibrationEngine.instance) {
      CalibrationEngine.instance = new CalibrationEngine();
    }
    return CalibrationEngine.instance;
  }

  public getCalibrationReport(reviewsOverride?: TradeReviewRecord[]): CalibrationReport {
    const reviews = reviewsOverride || tradeReviewEngine.getReviews();

    // Pair predicted probability with realized binary outcome
    const pairs: Array<{ predictedProb: number; actualOutcome: number }> = [];
    for (const r of reviews) {
      let prob = r.predictedProbAtEntry;
      if (prob === undefined || prob === null || isNaN(prob)) {
        continue;
      }
      if (prob > 1.0) prob = prob / 100.0;
      if (prob < 0 || prob > 1.0) continue;

      const actualOutcome = (r.netPnl > 0 || r.thesisWasCorrect) ? 1 : 0;
      pairs.push({ predictedProb: prob, actualOutcome });
    }

    const binSpecs = [
      { binRange: '50% - 60%', minProb: 0.50, maxProb: 0.60 },
      { binRange: '60% - 70%', minProb: 0.60, maxProb: 0.70 },
      { binRange: '70% - 80%', minProb: 0.70, maxProb: 0.80 },
      { binRange: '80% - 90%', minProb: 0.80, maxProb: 0.90 },
      { binRange: '90% - 100%', minProb: 0.90, maxProb: 1.0001 }
    ];

    // Cold-start handling when sample size is below statistical threshold
    if (pairs.length < MIN_CALIBRATION_SAMPLE_COUNT) {
      const bins: CalibrationBin[] = binSpecs.map(spec => {
        const matching = pairs.filter(p => p.predictedProb >= spec.minProb && p.predictedProb < spec.maxProb);
        const count = matching.length;
        const meanProb = count > 0 ? Number(((matching.reduce((s, p) => s + p.predictedProb, 0) / count) * 100).toFixed(1)) : 0;
        const realizedFreq = count > 0 ? Number(((matching.reduce((s, p) => s + p.actualOutcome, 0) / count) * 100).toFixed(1)) : 0;
        const err = count > 0 ? Number(Math.abs(meanProb - realizedFreq).toFixed(1)) : 0;

        return {
          binRange: spec.binRange,
          minProb: spec.minProb,
          maxProb: spec.maxProb > 1.0 ? 1.0 : spec.maxProb,
          sampleCount: count,
          meanPredictedProbPct: meanProb,
          realizedFrequencyPct: realizedFreq,
          calibrationErrorPct: err,
          status: 'INSUFFICIENT_DATA'
        };
      });

      const brierScore = pairs.length > 0
        ? Number((pairs.reduce((acc, p) => acc + Math.pow(p.predictedProb - p.actualOutcome, 2), 0) / pairs.length).toFixed(3))
        : 0;

      return {
        asOf: new Date().toISOString(),
        overallBrierScore: brierScore,
        maxCalibrationErrorPct: 0,
        meanCalibrationErrorPct: 0,
        reliabilityStatus: 'INSUFFICIENT_DATA',
        totalObservations: pairs.length,
        bins,
        recommendations: [
          `Cold-start status: Observed ${pairs.length} closed trade predictions with recorded forecast probabilities (minimum ${MIN_CALIBRATION_SAMPLE_COUNT} required for empirical calibration curve reliability).`,
          'Forecast reliability and Brier curve calculations will become active as trades accumulate.'
        ]
      };
    }

    // Full calculation when sample count >= MIN_CALIBRATION_SAMPLE_COUNT
    const brierScore = Number(
      (pairs.reduce((acc, p) => acc + Math.pow(p.predictedProb - p.actualOutcome, 2), 0) / pairs.length).toFixed(3)
    );

    const bins: CalibrationBin[] = binSpecs.map(spec => {
      const matching = pairs.filter(p => p.predictedProb >= spec.minProb && p.predictedProb < spec.maxProb);
      const count = matching.length;
      const meanProb = count > 0 ? Number(((matching.reduce((s, p) => s + p.predictedProb, 0) / count) * 100).toFixed(1)) : 0;
      const realizedFreq = count > 0 ? Number(((matching.reduce((s, p) => s + p.actualOutcome, 0) / count) * 100).toFixed(1)) : 0;
      const err = count > 0 ? Number(Math.abs(meanProb - realizedFreq).toFixed(1)) : 0;

      let status: 'CALIBRATED' | 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'INSUFFICIENT_DATA' = 'CALIBRATED';
      if (count === 0) {
        status = 'CALIBRATED';
      } else if (meanProb - realizedFreq > 5.0) {
        status = 'OVERCONFIDENT';
      } else if (realizedFreq - meanProb > 5.0) {
        status = 'UNDERCONFIDENT';
      }

      return {
        binRange: spec.binRange,
        minProb: spec.minProb,
        maxProb: spec.maxProb > 1.0 ? 1.0 : spec.maxProb,
        sampleCount: count,
        meanPredictedProbPct: meanProb,
        realizedFrequencyPct: realizedFreq,
        calibrationErrorPct: err,
        status
      };
    });

    const populatedBins = bins.filter(b => b.sampleCount > 0);
    const meanError = populatedBins.length > 0
      ? Number((populatedBins.reduce((acc, b) => acc + b.calibrationErrorPct * b.sampleCount, 0) / pairs.length).toFixed(2))
      : 0;
    const maxError = populatedBins.length > 0
      ? Math.max(...populatedBins.map(b => b.calibrationErrorPct))
      : 0;

    const recommendations: string[] = [];
    const overconfidentBins = bins.filter(b => b.sampleCount > 0 && b.status === 'OVERCONFIDENT');
    const underconfidentBins = bins.filter(b => b.sampleCount > 0 && b.status === 'UNDERCONFIDENT');

    if (overconfidentBins.length > 0) {
      recommendations.push(
        `Overconfidence detected in bins (${overconfidentBins.map(b => b.binRange).join(', ')}). Apply isotonic shrinkage to moderate forecast probabilities.`
      );
    }
    if (underconfidentBins.length > 0) {
      recommendations.push(
        `Underconfidence detected in bins (${underconfidentBins.map(b => b.binRange).join(', ')}). Realized win rates exceed forecast probabilities.`
      );
    }
    if (overconfidentBins.length === 0 && underconfidentBins.length === 0) {
      recommendations.push(
        `Probabilistic forecasts are well-calibrated across all active bins within ±5.0% empirical tolerance.`
      );
    }

    return {
      asOf: new Date().toISOString(),
      overallBrierScore: brierScore,
      maxCalibrationErrorPct: maxError,
      meanCalibrationErrorPct: meanError,
      reliabilityStatus: meanError <= 3.0 ? 'EXCELLENT' : meanError <= 6.0 ? 'ACCEPTABLE' : 'DEGRADED',
      totalObservations: pairs.length,
      bins,
      recommendations
    };
  }
}

export const calibrationEngine = CalibrationEngine.getInstance();
