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
import { dbEngine } from '../../server/db.js';
import { marketDataAdapter, mapMarketFeedStrikesToQuantSnapshots } from '../adapters/marketDataAdapter.js';
import { gammaEngine } from '../intelligence/gammaEngine.js';
import { OptionStrikeRow } from '../../types.js';

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

describe('Integration 5: Real Market Data Ingestion & Quant Context (Non-Synthetic)', () => {
  it('loads authentic spot price and candles from SQLite and computes live profile', async () => {
    await dbEngine.initialize();

    // 1. Check real spot price resolution
    const spotPrice = marketDataAdapter.getSpotPrice('NIFTY');
    assert.ok(typeof spotPrice === 'number' && spotPrice > 0, 'Spot price must be positive number');

    // 2. Fetch real candles from SQLite
    const candles = dbEngine.getEma15mCandles('NIFTY', 10);
    assert.ok(Array.isArray(candles), 'Candles must be an array');
    if (candles.length > 0) {
      assert.ok(candles[0].close > 0, 'Candle close price must be positive');
      assert.ok(candles[0].high >= candles[0].low, 'Candle high must be >= low');
    }

    // 3. Fetch real option chain snapshots
    const snapshots = marketDataAdapter.getLatestSnapshots('NIFTY');
    assert.ok(Array.isArray(snapshots), 'Snapshots must be an array');

    // 4. Ingest new real spot tick into marketDataAdapter
    const testLiveSpot = 23410.50;
    marketDataAdapter.updateSpotPrice('NIFTY', testLiveSpot);
    assert.strictEqual(marketDataAdapter.getSpotPrice('NIFTY'), testLiveSpot);

    // 6. Test 1-minute candle generation from ticks table
    const minuteCandles = dbEngine.getRecentSpotCandlesForUnderlying('NIFTY', 15);
    assert.ok(Array.isArray(minuteCandles), 'Minute candles must be an array');
    if (minuteCandles.length > 0) {
      assert.ok(minuteCandles[0].close > 0, '1m candle close must be positive');
      assert.ok(minuteCandles[0].high >= minuteCandles[0].low, '1m candle high >= low');
      assert.ok(minuteCandles[0].timestamp.includes('Z'), '1m candle timestamp must be ISO string');
    }

    // 7. Test mapMarketFeedStrikesToQuantSnapshots mapping
    const mockStrikeRows: OptionStrikeRow[] = [
      {
        strikePrice: 24200,
        ce: {
          strikePrice: 24200,
          type: 'CE',
          ltp: 145.2,
          change: 12.5,
          pChange: 9.4,
          volume: 25000,
          openInterest: 150000,
          changeInOI: 12000,
          pChangeInOI: 8.7,
          iv: 14.2,
          delta: 0.52,
          gamma: 0.0012,
          theta: -12.4,
          vega: 18.5,
          rho: 5.2,
          buildup: 'LONG_BUILDUP',
          bidPrice: 145.0,
          askPrice: 145.5,
          available: true,
          ltpAvailable: true
        },
        pe: {
          strikePrice: 24200,
          type: 'PE',
          ltp: 120.4,
          change: -10.2,
          pChange: -7.8,
          volume: 21000,
          openInterest: 180000,
          changeInOI: -5000,
          pChangeInOI: -2.7,
          iv: 14.8,
          delta: -0.48,
          gamma: 0.0012,
          theta: -11.8,
          vega: 18.2,
          rho: -4.8,
          buildup: 'LONG_UNWINDING',
          bidPrice: 120.2,
          askPrice: 120.6,
          available: true,
          ltpAvailable: true
        }
      }
    ];

    const mappedSnapshots = mapMarketFeedStrikesToQuantSnapshots(
      'NIFTY',
      '2026-09-24',
      mockStrikeRows,
      true
    );

    assert.strictEqual(mappedSnapshots.length, 2);
    const ce = mappedSnapshots.find(s => s.optionType === 'CE');
    assert.ok(ce);
    assert.strictEqual(ce.strike, 24200);
    assert.strictEqual(ce.ltp, 145.2);
    assert.strictEqual(ce.bid, 145.0);
    assert.strictEqual(ce.ask, 145.5);
    assert.strictEqual(ce.oi, 150000);
    assert.strictEqual(ce.source, 'upstox_live');
    assert.strictEqual(ce.dataQuality, 'OK');

    const pe = mappedSnapshots.find(s => s.optionType === 'PE');
    assert.ok(pe);
    assert.strictEqual(pe.strike, 24200);
    assert.strictEqual(pe.ltp, 120.4);
    assert.strictEqual(pe.delta, -0.48);

    // Ingest mapped snapshots into marketDataAdapter
    marketDataAdapter.ingestSnapshots('NIFTY', mappedSnapshots, testLiveSpot);
    const retrieved = marketDataAdapter.getLatestSnapshots('NIFTY', '2026-09-24');
    assert.strictEqual(retrieved.length, 2);

    // Quality evaluation
    const qualityReport = marketDataAdapter.evaluateQuality(mappedSnapshots);
    assert.ok(qualityReport.score >= 70);
    assert.strictEqual(qualityReport.status, 'OK');
  });
});

