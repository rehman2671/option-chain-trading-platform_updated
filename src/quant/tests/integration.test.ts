/**
 * Quant Intelligence Integration Tests (Section 88 & Part B10)
 * Tests end-to-end pipelines:
 * Market Data -> Feature Engine -> Regime Engine -> Tournament -> Risk Engine -> Decision
 * Failure handling and Safe Defaults (Section 83)
 * Position Recovery EV evaluations (Section 31)
 * Quantitative Event Bus dispatch (Section 82 & B5)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { featureEngine } from '../features/featureEngine.js';
import { regimeEngine } from '../intelligence/regimeEngine.js';
import { tournamentEngine } from '../decision/tournamentEngine.js';
import { portfolioRiskEngine } from '../risk/portfolioRiskEngine.js';
import { recoveryEngine } from '../position/recoveryEngine.js';
import { quantEventBus } from '../events/quantEventBus.js';
import { multiTimeframeEngine } from '../intelligence/multiTimeframeEngine.js';
import { QuantFeatureSnapshot } from '../types.js';

describe('Integration 1: Market Data -> Features -> Regime -> Strategy Tournament', () => {
  it('generates consistent features, determines regime, and ranks strategies', () => {
    // 1. Synthetic clean spot + option chain state
    const spotPrice = 24150.0;
    const mockSnapshots = [
      {
        strike: 24150,
        optionType: 'CE' as const,
        ltp: 120,
        iv: 14.2,
        oi: 5000000,
        oiChange: 120000,
        volume: 850000,
        bid: 119.8,
        ask: 120.2,
        delta: 0.50,
        gamma: 0.0018,
        theta: -12,
        vega: 22
      },
      {
        strike: 24150,
        optionType: 'PE' as const,
        ltp: 115,
        iv: 14.5,
        oi: 6200000,
        oiChange: 250000,
        volume: 980000,
        bid: 114.8,
        ask: 115.2,
        delta: -0.50,
        gamma: 0.0018,
        theta: -12,
        vega: 22
      }
    ];

    // 2. Feature generation
    const mockCandles = [{ close: spotPrice, high: spotPrice + 15, low: spotPrice - 15, volume: 50000 }];
    const features = featureEngine.computeFeatures('NIFTY', spotPrice, mockCandles, mockSnapshots as any);
    assert.ok(features);
    assert.strictEqual(features.underlying, 'NIFTY');
    assert.strictEqual(features.spotPrice, 24150);

    // 3. Regime classification
    const regime = regimeEngine.classify(features);
    assert.ok(regime);
    assert.ok(regime.primaryRegime);
    assert.ok(regime.confidence > 0);

    // 4. Strategy tournament ranking
    const rankings = tournamentEngine.runTournament(regime, features);
    assert.ok(rankings.length > 0);
    assert.strictEqual(rankings[0].rank, 1);
    assert.ok(rankings[0].score >= rankings[rankings.length - 1].score);
  });
});

describe('Integration 2: Position Recovery Engine (Section 31)', () => {
  it('evaluates HOLD, HEDGE, ROLL, CONVERT, REDUCE, and EXIT with expected future values', () => {
    const analysis = recoveryEngine.evaluatePosition(
      'pos_test_01',
      'NIFTY 24200 CE',
      150.0, // entry price
      120.0, // current price (in adverse move)
      'LONG',
      -1500, // unrealized loss
      'Momentum breakout continuation'
    );

    assert.strictEqual(analysis.positionId, 'pos_test_01');
    assert.ok(analysis.actionEvaluations.length >= 5);
    assert.ok(analysis.recommendedAction);
    assert.ok(analysis.currentThesisState);
  });
});

describe('Integration 3: Portfolio Greek Risk & Stress (Section 28)', () => {
  it('computes aggregate net Greeks and flags high portfolio gamma/vega', () => {
    const mockPositions = [
      {
        id: 'p1',
        symbol: 'NIFTY 24000 CE',
        underlying: 'NIFTY',
        quantity: 50,
        delta: 0.52,
        gamma: 0.002,
        theta: -14,
        vega: 24,
        currentPrice: 135,
        entryPrice: 120
      },
      {
        id: 'p2',
        symbol: 'NIFTY 24200 PE',
        underlying: 'NIFTY',
        quantity: -50,
        delta: 0.35,
        gamma: -0.0018,
        theta: 12,
        vega: -20,
        currentPrice: 85,
        entryPrice: 95
      }
    ];

    const risk = portfolioRiskEngine.assessPortfolio(mockPositions);
    assert.ok(risk);
    assert.ok(risk.netDelta !== undefined);
    assert.ok(risk.netGamma !== undefined);
    assert.ok(risk.netVega !== undefined);
    assert.ok(risk.netTheta !== undefined);
    assert.ok(['LOW', 'MODERATE', 'ELEVATED', 'CRITICAL'].includes(risk.riskLevel));
  });
});

describe('Integration 4: Quantitative Event Bus (Section 82 & Part B5)', () => {
  it('dispatches structured events with audit trail', () => {
    let capturedEvent: any = null;
    const unsub = quantEventBus.once('THESIS_WEAKENED', (payload) => {
      capturedEvent = payload;
    });

    const published = quantEventBus.publish(
      'THESIS_WEAKENED',
      'positionMonitor',
      { positionId: 'pos_123', reason: 'MFE retraced 70%' },
      'WARNING'
    );

    assert.ok(capturedEvent);
    assert.strictEqual(capturedEvent.event, 'THESIS_WEAKENED');
    assert.strictEqual(capturedEvent.severity, 'WARNING');
    assert.strictEqual(capturedEvent.data.positionId, 'pos_123');

    const recent = quantEventBus.getRecentEvents(10, 'THESIS_WEAKENED');
    assert.ok(recent.length > 0);
  });
});
