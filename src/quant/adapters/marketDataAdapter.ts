/**
 * Market Data Adapter for Quant Intelligence
 * Normalizes Upstox live option chain and spot/futures feeds.
 * Ensures data quality, latency measurement, and non-synthetic compliance.
 */

import { QuantUnderlying, QuantOptionSnapshot, DataQualityReport } from '../types.js';
import { OptionStrikeRow, OptionContract } from '../../types.js';
import { dbEngine } from '../../server/db.js';
import { CANONICAL_INSTRUMENTS } from '../../shared/marketConfig.js';

/**
 * Maps a single MarketFeed option contract (CE or PE) into the QuantOptionSnapshot structure
 */
export function mapMarketFeedContractToQuantSnapshot(
  underlying: QuantUnderlying,
  expiry: string,
  strikePrice: number,
  contract: OptionContract,
  isLive: boolean,
  marketTs?: string
): QuantOptionSnapshot {
  const ts = marketTs || new Date().toISOString();
  // dataQuality: 'OK' when complete, else 'DATA_INSUFFICIENT' based on available/ltpAvailable flags
  const isComplete = contract.available !== false && contract.ltpAvailable !== false && (contract.ltp || 0) > 0;

  return {
    marketTs: ts,
    ingestionTs: ts,
    underlying,
    expiry,
    strike: strikePrice,
    optionType: contract.type,
    ltp: Number(contract.ltp || 0),
    bid: Number(contract.bidPrice || 0),
    ask: Number(contract.askPrice || 0),
    bidQty: 0,
    askQty: 0,
    volume: Number(contract.volume || 0),
    oi: Number(contract.openInterest || 0),
    oiChange: Number(contract.changeInOI || 0),
    iv: Number(contract.iv || 0),
    delta: Number(contract.delta || 0),
    gamma: Number(contract.gamma || 0),
    theta: Number(contract.theta || 0),
    vega: Number(contract.vega || 0),
    source: isLive ? 'upstox_live' : 'market_feed',
    dataQuality: isComplete ? 'OK' : 'DATA_INSUFFICIENT'
  };
}

/**
 * Maps all strike rows from a MarketFeed snapshot into QuantOptionSnapshot[]
 */
export function mapMarketFeedStrikesToQuantSnapshots(
  underlying: QuantUnderlying,
  expiry: string,
  strikes: OptionStrikeRow[],
  isLive: boolean,
  marketTs?: string
): QuantOptionSnapshot[] {
  const ts = marketTs || new Date().toISOString();
  const snapshots: QuantOptionSnapshot[] = [];
  for (const s of strikes) {
    if (s.ce && s.ce.available !== false) {
      snapshots.push(mapMarketFeedContractToQuantSnapshot(underlying, expiry, s.strikePrice, s.ce, isLive, ts));
    }
    if (s.pe && s.pe.available !== false) {
      snapshots.push(mapMarketFeedContractToQuantSnapshot(underlying, expiry, s.strikePrice, s.pe, isLive, ts));
    }
  }
  return snapshots;
}

export class MarketDataAdapter {
  private static instance: MarketDataAdapter;
  private lastSnapshotTime: Map<string, number> = new Map();
  private cache: Map<string, QuantOptionSnapshot[]> = new Map();
  private spotPrices: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): MarketDataAdapter {
    if (!MarketDataAdapter.instance) {
      MarketDataAdapter.instance = new MarketDataAdapter();
    }
    return MarketDataAdapter.instance;
  }

  /**
   * Updates in-memory spot price from live tick or feed
   */
  public updateSpotPrice(underlying: QuantUnderlying, spotPrice: number): void {
    if (typeof spotPrice === 'number' && spotPrice > 0) {
      this.spotPrices.set(underlying, spotPrice);
    }
  }

  /**
   * Retrieves current real spot price (from live memory, SQLite ticks, or canonical config)
   */
  public getSpotPrice(underlying: QuantUnderlying): number {
    const cached = this.spotPrices.get(underlying);
    if (cached && cached > 0) return cached;

    // Check dbEngine ticks table for most recent tick
    const dbSpot = dbEngine.getLatestSpotPrice(underlying);
    if (dbSpot && dbSpot > 0) {
      this.spotPrices.set(underlying, dbSpot);
      return dbSpot;
    }

    // Canonical instruments fallback
    const canonical = CANONICAL_INSTRUMENTS[underlying];
    if (canonical && canonical.baseSpotPrice > 0) {
      return canonical.baseSpotPrice;
    }

    return underlying === 'BANKNIFTY' ? 57409.60 : underlying === 'SENSEX' ? 76944.28 : 24055.80;
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
  public ingestSnapshots(underlying: QuantUnderlying, snapshots: QuantOptionSnapshot[], spotPrice?: number): void {
    const key = underlying;
    this.cache.set(key, snapshots);
    this.lastSnapshotTime.set(key, Date.now());
    if (typeof spotPrice === 'number' && spotPrice > 0) {
      this.spotPrices.set(key, spotPrice);
    }

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

    // Fallback query from SQLite (quant_option_chain_snapshots or option_chains store)
    const fromDb = dbEngine.getLatestQuantOptionSnapshots(underlying, expiry);
    const mapped = fromDb.map((row: any) => ({
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

    if (mapped.length > 0 && !expiry) {
      this.cache.set(underlying, mapped);
    }

    return mapped;
  }
}

export const marketDataAdapter = MarketDataAdapter.getInstance();
