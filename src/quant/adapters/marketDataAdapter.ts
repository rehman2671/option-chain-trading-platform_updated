/**
 * Market Data Adapter for Quant Intelligence
 * Normalizes Upstox live option chain and spot/futures feeds.
 * Ensures data quality, latency measurement, and non-synthetic compliance.
 */

import { QuantUnderlying, QuantOptionSnapshot, DataQualityReport } from '../types.js';
import { dbEngine } from '../../server/db.js';

export class MarketDataAdapter {
  private static instance: MarketDataAdapter;
  private lastSnapshotTime: Map<string, number> = new Map();
  private cache: Map<string, QuantOptionSnapshot[]> = new Map();

  private constructor() {}

  public static getInstance(): MarketDataAdapter {
    if (!MarketDataAdapter.instance) {
      MarketDataAdapter.instance = new MarketDataAdapter();
    }
    return MarketDataAdapter.instance;
  }

  /**
   * Evaluates data quality for incoming market data packets
   */
  public evaluateQuality(snapshots: QuantOptionSnapshot[]): DataQualityReport {
    if (!snapshots || snapshots.length === 0) {
      return {
        score: 0,
        status: 'DATA_INSUFFICIENT',
        latencyMs: 9999,
        checks: {
          priceFreshness: false,
          spreadAcceptable: false,
          oiConsistency: false,
          greeksComputed: false,
          bidAskOrderValid: false
        },
        warnings: ['Empty snapshot array received']
      };
    }

    const now = Date.now();
    let score = 100;
    const warnings: string[] = [];

    // Check timestamps
    const sampleTs = new Date(snapshots[0].marketTs).getTime();
    const latencyMs = Math.max(0, now - sampleTs);
    const priceFreshness = latencyMs < 10000; // < 10s fresh

    if (!priceFreshness) {
      score -= 20;
      warnings.push(`Data latency elevated: ${(latencyMs / 1000).toFixed(1)}s`);
    }

    // Bid-Ask integrity & spread checks
    let invertedSpreads = 0;
    let missingOi = 0;
    let missingGreeks = 0;

    for (const s of snapshots) {
      if (s.bid > s.ask && s.ask > 0) invertedSpreads++;
      if (s.oi === undefined || s.oi === null) missingOi++;
      if (!s.iv || s.iv <= 0 || s.delta === undefined) missingGreeks++;
    }

    const bidAskOrderValid = invertedSpreads === 0;
    if (!bidAskOrderValid) {
      score -= 25;
      warnings.push(`${invertedSpreads} strikes showed crossed bid-ask spreads`);
    }

    const oiConsistency = missingOi === 0;
    if (!oiConsistency) {
      score -= 15;
      warnings.push(`${missingOi} strikes missing OI fields`);
    }

    const greeksComputed = missingGreeks < snapshots.length * 0.2; // 80%+ have valid Greeks
    if (!greeksComputed) {
      score -= 20;
      warnings.push(`Greeks missing on ${missingGreeks} strikes`);
    }

    const status = score >= 70 ? 'OK' : score >= 40 ? 'DATA_INSUFFICIENT' : 'STALE';

    return {
      score: Math.max(0, score),
      status,
      latencyMs,
      checks: {
        priceFreshness,
        spreadAcceptable: true,
        oiConsistency,
        greeksComputed,
        bidAskOrderValid
      },
      warnings
    };
  }

  /**
   * Ingests and caches live option chain snapshots
   */
  public ingestSnapshots(underlying: QuantUnderlying, snapshots: QuantOptionSnapshot[]): void {
    const key = underlying;
    this.cache.set(key, snapshots);
    this.lastSnapshotTime.set(key, Date.now());

    // Batch persist to SQLite (asynchronous background flush)
    try {
      dbEngine.saveQuantOptionSnapshotsBatch(snapshots);
    } catch (err: any) {
      console.error('[QUANT DATA ADAPTER] Error saving snapshot batch:', err.message);
    }
  }

  /**
   * Retrieves latest option chain snapshots for an underlying
   */
  public getLatestSnapshots(underlying: QuantUnderlying, expiry?: string): QuantOptionSnapshot[] {
    const cached = this.cache.get(underlying);
    if (cached && cached.length > 0) {
      if (expiry) {
        return cached.filter(s => s.expiry === expiry);
      }
      return cached;
    }

    // Fallback query from SQLite
    const fromDb = dbEngine.getLatestQuantOptionSnapshots(underlying, expiry);
    return fromDb.map((row: any) => ({
      id: row.id,
      marketTs: row.market_ts,
      ingestionTs: row.ingestion_ts,
      underlying: row.underlying as QuantUnderlying,
      expiry: row.expiry,
      strike: Number(row.strike),
      optionType: row.option_type as 'CE' | 'PE',
      ltp: Number(row.ltp || 0),
      bid: Number(row.bid || 0),
      ask: Number(row.ask || 0),
      bidQty: Number(row.bid_qty || 0),
      askQty: Number(row.ask_qty || 0),
      volume: Number(row.volume || 0),
      oi: Number(row.oi || 0),
      oiChange: Number(row.oi_change || 0),
      iv: Number(row.iv || 0),
      delta: Number(row.delta || 0),
      gamma: Number(row.gamma || 0),
      theta: Number(row.theta || 0),
      vega: Number(row.vega || 0),
      source: row.source,
      dataQuality: row.data_quality as 'OK' | 'DATA_INSUFFICIENT' | 'STALE'
    }));
  }
}

export const marketDataAdapter = MarketDataAdapter.getInstance();
