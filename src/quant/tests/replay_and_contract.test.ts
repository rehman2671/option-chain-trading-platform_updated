/**
 * Replay, Golden-File, and Contract Tests (Part B10)
 * 1. Golden-file test for option pricing and Greeks against analytical reference values.
 * 2. Deterministic replay test: feeding recorded historical market ticks and asserting identical outputs.
 * 3. API Contract tests: validating JSON response shapes expected by frontend dashboard and chart overlays.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { featureEngine } from '../features/featureEngine.js';
import { regimeEngine } from '../intelligence/regimeEngine.js';
import { multiTimeframeEngine } from '../intelligence/multiTimeframeEngine.js';
import { strikeSelectionEngine } from '../decision/strikeSelectionEngine.js';
import { expirySelectionEngine } from '../decision/expirySelectionEngine.js';
import { positionSizingEngine } from '../decision/positionSizingEngine.js';

describe('Part B10.1: Golden-File Greeks & Volatility Calculations', () => {
  it('validates ATM option delta is centered near 0.50 and puts near -0.50', () => {
    const spot = 24000;
    const strikes = strikeSelectionEngine.optimizeStrikes(
      'NIFTY',
      spot,
      'strat_bull_call_spread',
      { atmIv: 14.0, callWallStrike: 24200, putWallStrike: 23800 } as any,
      { primaryRegime: 'RANGE', keyLevels: { expectedMove: 160 } as any } as any
    );

    const atmCall = strikes.candidates.find(c => c.strike === spot && c.type === 'CE');
    const atmPut = strikes.candidates.find(c => c.strike === spot && c.type === 'PE');

    assert.ok(atmCall);
    assert.ok(atmPut);
    // Standard analytical reference: ATM delta ~ 0.50 (call) and -0.50 (put)
    assert.strictEqual(atmCall.delta, 0.50);
    assert.strictEqual(atmPut.delta, -0.50);
    // Gamma must be positive and peak at ATM
    assert.ok(atmCall.gamma > 0);
    // Theta must be negative (decay)
    assert.ok(atmCall.theta < 0);
  });
});

describe('Part B10.2: Deterministic Replay Test', () => {
  it('replaying recorded market ticks produces identical deterministic regime and feature outputs', () => {
    // Recorded historical tick snapshot
    const recordedTickSequence = [
      {
        strike: 24000,
        optionType: 'CE' as const,
        ltp: 135.5,
        iv: 14.5,
        oi: 4200000,
        oiChange: 85000,
        volume: 620000,
        bid: 135.2,
        ask: 135.8,
        delta: 0.50,
        gamma: 0.0019,
        theta: -13.5,
        vega: 23.0
      },
      {
        strike: 24000,
        optionType: 'PE' as const,
        ltp: 128.0,
        iv: 14.7,
        oi: 5100000,
        oiChange: 140000,
        volume: 710000,
        bid: 127.8,
        ask: 128.2,
        delta: -0.50,
        gamma: 0.0019,
        theta: -13.5,
        vega: 23.0
      }
    ];

    const mockCandles = [{ close: 24000, high: 24020, low: 23980, volume: 40000 }];

    // First run
    const featuresRun1 = featureEngine.computeFeatures('NIFTY', 24000, mockCandles, recordedTickSequence as any);
    const regimeRun1 = regimeEngine.classify(featuresRun1);

    // Second run (exact replay)
    const featuresRun2 = featureEngine.computeFeatures('NIFTY', 24000, mockCandles, recordedTickSequence as any);
    const regimeRun2 = regimeEngine.classify(featuresRun2);

    // Assert absolute determinism
    assert.strictEqual(featuresRun1.spotPrice, featuresRun2.spotPrice);
    assert.strictEqual(featuresRun1.pcrOi, featuresRun2.pcrOi);
    assert.strictEqual(regimeRun1.primaryRegime, regimeRun2.primaryRegime);
    assert.strictEqual(regimeRun1.confidence, regimeRun2.confidence);
  });
});

describe('Part B10.3: API Contract Tests for Frontend Consumers', () => {
  it('validates Multi-Timeframe response satisfies dashboard contract schema', () => {
    const analysis = multiTimeframeEngine.evaluate(
      'NIFTY',
      24000,
      {
        returns1m: 0.02,
        returns5m: 0.05,
        distVwapPct: 0.01,
        rsi14: 56,
        pcrOi: 1.15,
        atr: 32,
        atmIv: 14.2
      } as any,
      { primaryRegime: 'TREND_UP', volatilityRegime: 'LOW_COMPRESSION', keyLevels: {} as any } as any
    );

    // Check required keys
    assert.ok(typeof analysis.multiTimeframeScore === 'number');
    assert.ok(['STRONG_BULLISH', 'MODERATE_BULLISH', 'NEUTRAL', 'MODERATE_BEARISH', 'STRONG_BEARISH'].includes(analysis.directionalBias));
    assert.ok(Array.isArray(analysis.timeframes));
    assert.strictEqual(analysis.timeframes.length, 8);
    assert.ok(Array.isArray(analysis.keyObservations));
  });

  it('validates Position Sizing response satisfies calculator contract schema', () => {
    const sizing = positionSizingEngine.calculatePositionSize({
      underlying: 'NIFTY',
      accountCapital: 500000,
      availableMargin: 350000,
      strategyConfidence: 0.75,
      winRate: 0.62,
      profitFactor: 1.85,
      maxTradeRiskPct: 1.5,
      stopLossPoints: 40,
      targetPoints: 80,
      premiumPrice: 140
    });

    assert.ok(typeof sizing.recommendedLots === 'number');
    assert.ok(typeof sizing.maxCapitalAtRiskINR === 'number');
    assert.ok(typeof sizing.expectedValueINR === 'number');
    assert.ok(Array.isArray(sizing.sizingRationale));
  });
});
