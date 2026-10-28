/**
 * Quant Intelligence Pipeline Tests: Historical Analogue Engine
 * Verifies real vector similarity calculation, ranking, empirical outcome aggregation,
 * and fallback behavior against SQLite-stored historical feature vectors.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../../server/db.js';
import {
  analogueEngine,
  extractNormalizedVector,
  computeVectorSimilarity
} from '../intelligence/analogueEngine.js';
import { QuantFeatureSnapshot, QuantFeatureRecord } from '../types.js';

describe('Historical Analogue Engine Real Pattern Matching', () => {
  before(async () => {
    await dbEngine.initialize();
    dbEngine.seedQuantFeatureHistoryIfEmpty();
  });

  it('verifies Migration 013 created quant_feature_history table with indexes', () => {
    const rawDb = dbEngine.getRawDatabase();
    const migrations = rawDb.prepare(`SELECT * FROM schema_migrations ORDER BY version ASC;`).all() as any[];
    const m013 = migrations.find(m => m.version === 13);
    assert.ok(m013, 'Migration 013 must be recorded in schema_migrations');

    const tableInfo = rawDb.prepare(`PRAGMA table_info(quant_feature_history);`).all() as any[];
    assert.ok(tableInfo.length > 0, 'quant_feature_history table must exist');

    const columnNames = tableInfo.map(c => c.name);
    const expectedCols = [
      'id', 'timestamp', 'underlying', 'spot_price',
      'returns_1m', 'returns_5m', 'returns_15m',
      'dist_vwap_pct', 'dist_ema20_pct', 'dist_ema50_pct',
      'atr', 'atr_percentile', 'rsi_14', 'adx_14',
      'pcr_oi', 'iv_rank', 'regime',
      'forward_return_15m', 'forward_return_30m', 'forward_return_1h', 'forward_return_eod',
      'mfe_r', 'mae_r', 'event_name', 'created_at'
    ];

    for (const col of expectedCols) {
      assert.ok(columnNames.includes(col), `quant_feature_history must contain column: ${col}`);
    }
  });

  it('confirms baseline historical vectors are seeded and accessible', () => {
    const niftyHistory = dbEngine.getQuantFeatureHistory('NIFTY', 100);
    assert.ok(niftyHistory.length >= 10, `Expected at least 10 seeded NIFTY history records, got ${niftyHistory.length}`);

    const first = niftyHistory[0];
    assert.ok(first.id, 'Record must have an id');
    assert.strictEqual(first.underlying, 'NIFTY');
    assert.ok(typeof first.returns5m === 'number');
    assert.ok(typeof first.forwardReturn30m === 'number');
  });

  it('verifies vector extraction and mathematical similarity behavior', () => {
    const vecA = extractNormalizedVector(0.0035, 0.35, 75, 65, 35);
    const vecB = extractNormalizedVector(0.0035, 0.35, 75, 65, 35);
    const identicalSim = computeVectorSimilarity(vecA, vecB);
    assert.strictEqual(identicalSim, 1.0, 'Identical vectors must return similarity 1.0');

    // Opposite vector (bearish breakdown)
    const vecC = extractNormalizedVector(-0.0035, -0.35, 25, 35, 15);
    const oppositeSim = computeVectorSimilarity(vecA, vecC);
    assert.ok(oppositeSim < 0.70, `Opposite vectors should have significantly lower similarity, got ${oppositeSim}`);
    assert.ok(oppositeSim > 0, 'Similarity must remain strictly positive');
  });

  it('Requirement 5a: Storing distinct feature vectors produces different, meaningful similarity rankings', () => {
    const testUnderlying = 'TEST_RANKINGS' as any;

    // 1. Store a strongly bullish historical vector
    const bullishRecord: QuantFeatureRecord = {
      id: 'REC_BULL_01',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      underlying: testUnderlying,
      spotPrice: 24000,
      returns1m: 0.001,
      returns5m: 0.005,
      returns15m: 0.009,
      distVwapPct: 0.5,
      distEma20Pct: 0.4,
      distEma50Pct: 0.7,
      atr: 120,
      atrPercentile: 70,
      rsi14: 72,
      adx14: 38,
      pcrOi: 1.35,
      ivRank: 35,
      regime: 'TREND_UP',
      forwardReturn15m: 0.003,
      forwardReturn30m: 0.006,
      forwardReturn1h: 0.010,
      forwardReturnEod: 0.015,
      mfeR: 2.5,
      maeR: -0.3,
      eventName: 'Bullish Momentum Expansion'
    };

    // 2. Store a strongly bearish historical vector
    const bearishRecord: QuantFeatureRecord = {
      id: 'REC_BEAR_01',
      timestamp: new Date(Date.now() - 172800000).toISOString(),
      underlying: testUnderlying,
      spotPrice: 24000,
      returns1m: -0.001,
      returns5m: -0.005,
      returns15m: -0.009,
      distVwapPct: -0.5,
      distEma20Pct: -0.4,
      distEma50Pct: -0.7,
      atr: 160,
      atrPercentile: 85,
      rsi14: 28,
      adx14: 40,
      pcrOi: 0.65,
      ivRank: 75,
      regime: 'TREND_DOWN',
      forwardReturn15m: -0.004,
      forwardReturn30m: -0.007,
      forwardReturn1h: -0.012,
      forwardReturnEod: -0.020,
      mfeR: 0.2,
      maeR: -3.0,
      eventName: 'Bearish Breakdown Wave'
    };

    // Store additional filler records so history length >= 10
    dbEngine.saveQuantFeatureRecord(bullishRecord);
    dbEngine.saveQuantFeatureRecord(bearishRecord);
    for (let i = 2; i < 12; i++) {
      dbEngine.saveQuantFeatureRecord({
        ...bullishRecord,
        id: `REC_BULL_FILLER_${i}`,
        timestamp: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
        returns5m: 0.003 + (i * 0.0001),
        distVwapPct: 0.3 + (i * 0.01),
        rsi14: 65 + (i % 5)
      });
    }

    // Now query with a bullish snapshot
    const bullishQuery: QuantFeatureSnapshot = {
      timestamp: new Date().toISOString(),
      underlying: testUnderlying,
      spotPrice: 24050,
      returns1m: 0.001,
      returns5m: 0.005,
      returns15m: 0.009,
      returns1h: 0.012,
      distVwapPct: 0.5,
      distEma20Pct: 0.4,
      distEma50Pct: 0.7,
      atr: 120,
      atrPercentile: 70,
      rsi14: 72,
      adx14: 38,
      pcrOi: 1.35,
      pcrVolume: 1.2,
      atmIv: 14.5,
      ivRank: 35,
      ivPercentile: 40,
      ivSkew: 0.02,
      totalCallOi: 100000,
      totalPutOi: 135000,
      callOiChange: -5000,
      putOiChange: 15000,
      callWallStrike: 24500,
      putWallStrike: 23800,
      estimatedNetGamma: 50000,
      gammaFlipStrike: 23900,
      marketStructure: 'HH_HL'
    };

    const result = analogueEngine.findAnalogues(bullishQuery);
    assert.ok(result.topEpisodes && result.topEpisodes.length > 0, 'Top episodes must be returned');

    // The top episode should match the bullish record, not the bearish record
    assert.strictEqual(
      result.topEpisodes[0].eventName,
      'Bullish Momentum Expansion',
      'Bullish query must rank bullish historical episode at #1'
    );
    assert.strictEqual(
      result.topEpisodes[0].similarityPct,
      100,
      'Exact matching vector must achieve 100% similarity'
    );

    // Verify outcomes are bullish
    assert.ok(result.outcomes.horizon30m.upProb > 0.8, 'Bullish matches should result in high upProb');
    assert.ok(result.outcomes.horizon30m.expectedReturnPct > 0, 'Expected return must be positive');
  });

  it('Requirement 5b: A feature vector identical to a stored historical vector achieves a similarity score near 1.0 (>= 0.95)', () => {
    const identicalSym = 'TEST_IDENTICAL' as any;

    const baseRecord: QuantFeatureRecord = {
      id: 'REC_IDENT_0',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      underlying: identicalSym,
      spotPrice: 24250,
      returns1m: 0.0005,
      returns5m: 0.0025,
      returns15m: 0.0045,
      distVwapPct: 0.20,
      distEma20Pct: 0.15,
      distEma50Pct: 0.30,
      atr: 105,
      atrPercentile: 58,
      rsi14: 63,
      adx14: 29,
      pcrOi: 1.15,
      ivRank: 32,
      regime: 'TREND_UP',
      forwardReturn15m: 0.002,
      forwardReturn30m: 0.004,
      forwardReturn1h: 0.006,
      forwardReturnEod: 0.009,
      mfeR: 1.8,
      maeR: -0.3,
      eventName: 'Exact Match Baseline'
    };

    // Store 10 identical historical vectors
    for (let i = 0; i < 12; i++) {
      dbEngine.saveQuantFeatureRecord({
        ...baseRecord,
        id: `REC_IDENT_${i}`,
        timestamp: new Date(Date.now() - (i + 1) * 3600000).toISOString()
      });
    }

    const queryFeatures: QuantFeatureSnapshot = {
      timestamp: new Date().toISOString(),
      underlying: identicalSym,
      spotPrice: 24250,
      returns1m: 0.0005,
      returns5m: 0.0025,
      returns15m: 0.0045,
      returns1h: 0.007,
      distVwapPct: 0.20,
      distEma20Pct: 0.15,
      distEma50Pct: 0.30,
      atr: 105,
      atrPercentile: 58,
      rsi14: 63,
      adx14: 29,
      pcrOi: 1.15,
      pcrVolume: 1.1,
      atmIv: 13.8,
      ivRank: 32,
      ivPercentile: 35,
      ivSkew: 0.01,
      totalCallOi: 80000,
      totalPutOi: 92000,
      callOiChange: 1000,
      putOiChange: 3000,
      callWallStrike: 24500,
      putWallStrike: 24000,
      estimatedNetGamma: 25000,
      gammaFlipStrike: 24100,
      marketStructure: 'HH_HL'
    };

    const result = analogueEngine.findAnalogues(queryFeatures);

    assert.ok(
      result.similarityScore >= 0.95,
      `Expected similarityScore >= 0.95 for identical vector cluster, got ${result.similarityScore}`
    );
    assert.strictEqual(
      result.topEpisodes?.[0]?.similarityPct,
      100,
      'Top episode similarity percentage should be 100 for identical match'
    );
    assert.strictEqual(result.sampleCount, 12, 'Must compare all 12 historical samples');
  });

  it('Requirement 4: Fallback returns honest baseline when fewer than 10 historical records exist', () => {
    const emptySym = 'TEST_EMPTY_SYM' as any;

    const queryFeatures: QuantFeatureSnapshot = {
      timestamp: new Date().toISOString(),
      underlying: emptySym,
      spotPrice: 25000,
      returns1m: 0,
      returns5m: 0,
      returns15m: 0,
      returns1h: 0,
      distVwapPct: 0,
      distEma20Pct: 0,
      distEma50Pct: 0,
      atr: 100,
      atrPercentile: 50,
      rsi14: 50,
      adx14: 20,
      pcrOi: 1.0,
      pcrVolume: 1.0,
      atmIv: 15.0,
      ivRank: 25,
      ivPercentile: 30,
      ivSkew: 0,
      totalCallOi: 10000,
      totalPutOi: 10000,
      callOiChange: 0,
      putOiChange: 0,
      callWallStrike: 25500,
      putWallStrike: 24500,
      estimatedNetGamma: 0,
      gammaFlipStrike: 25000,
      marketStructure: 'RANGE'
    };

    const fallbackResult = analogueEngine.findAnalogues(queryFeatures);
    assert.strictEqual(fallbackResult.sampleCount, 0, 'sampleCount must honestly reflect 0 records');
    assert.strictEqual(fallbackResult.similarityScore, 0, 'similarityScore must be 0 for empty baseline');
    assert.strictEqual(fallbackResult.periodLookback, 'Insufficient Historical Samples (< 10)');
    assert.ok(fallbackResult.patternSummary?.includes('minimum 10 required'));
    assert.strictEqual(fallbackResult.topEpisodes?.length, 0);
  });
});
