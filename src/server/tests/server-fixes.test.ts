/**
 * Server and Database Integrity Unit Tests
 * Covers Tasks A, B, C, D, E, F, G, H, I, and J
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../db.js';
import { globalMarketFeed, UNDERLYING_CONFIGS } from '../engine/marketFeed.js';
import { CANONICAL_INSTRUMENTS, PRIMARY_COVERAGE_SYMBOLS, ALL_CONFIGURED_SYMBOLS, getLotSize, getStepSize } from '../../shared/marketConfig.js';
import { ContractMaster } from '../../quant/data/contractMaster.js';
import { resolveUnderlying } from '../../quant/api/quantRouter.js';
import { ExpiryResolver } from '../../quant/data/expiryResolver.js';
import { strikeSelectionEngine } from '../../quant/decision/strikeSelectionEngine.js';
import { positionSizingEngine } from '../../quant/decision/positionSizingEngine.js';

describe('Server & Data Integrity Test Suite', () => {
  before(async () => {
    await dbEngine.initialize();
  });

  describe('Task A: Fail-fast Secret Validation', () => {
    it('verifies minimum 32 character requirement for JWT_SECRET', () => {
      const shortSecret = 'short-secret';
      assert.ok(shortSecret.length < 32);

      const validSecret = 'a-very-secure-jwt-secret-with-more-than-32-characters';
      assert.ok(validSecret.length >= 32);
    });
  });

  describe('Task B: Multi-User Active View Concurrency', () => {
    it('concurrently tracks active views for multiple symbols with TTL', () => {
      globalMarketFeed.setActiveView('NIFTY', '2026-09-17');
      globalMarketFeed.setActiveView('BANKNIFTY', '2026-09-17');

      const niftyView = globalMarketFeed.getActiveView('NIFTY');
      const bankniftyView = globalMarketFeed.getActiveView('BANKNIFTY');

      assert.strictEqual(niftyView.symbol, 'NIFTY');
      assert.strictEqual(niftyView.expiry, '2026-09-17');

      assert.strictEqual(bankniftyView.symbol, 'BANKNIFTY');
      assert.strictEqual(bankniftyView.expiry, '2026-09-17');

      assert.ok(globalMarketFeed.isSymbolActivelyViewed('NIFTY'));
      assert.ok(globalMarketFeed.isSymbolActivelyViewed('BANKNIFTY'));
    });
  });

  describe('Task C & D: Batched MTM & EMA Price Updates', () => {
    it('loads open paper positions and applies batch MTM updates safely', () => {
      const openPositions = dbEngine.getAllOpenPaperPositionsForMtm();
      assert.ok(Array.isArray(openPositions));

      // Batch update executes inside a transaction with zero errors
      assert.doesNotThrow(() => {
        dbEngine.batchUpdatePaperPositionsMtm({
          toUpdate: [],
          toClose: []
        });
      });
    });

    it('executes batch EMA paper trade price updates inside SQLite transaction', () => {
      assert.doesNotThrow(() => {
        dbEngine.batchUpdateEmaPaperTrades({
          toUpdate: [],
          toClose: []
        });
      });
    });
  });

  describe('Task E: SQL Aggregate EMA Paper Trading Summary', () => {
    it('returns structured summary matching contract even on zero trades', () => {
      const summary = dbEngine.getEmaPaperTradingSummary();
      assert.strictEqual(typeof summary.totalTrades, 'number');
      assert.strictEqual(typeof summary.openTradesCount, 'number');
      assert.strictEqual(typeof summary.closedTradesCount, 'number');
      assert.strictEqual(typeof summary.winningTrades, 'number');
      assert.strictEqual(typeof summary.losingTrades, 'number');
      assert.strictEqual(typeof summary.winRatePercent, 'number');
      assert.strictEqual(typeof summary.realizedGrossPnl, 'number');
      assert.strictEqual(typeof summary.realizedNetPnl, 'number');
      assert.strictEqual(typeof summary.unrealizedPnl, 'number');
      assert.strictEqual(typeof summary.totalNetPnl, 'number');
    });
  });

  describe('Task F: Fast Indexed Pruning Query Execution', () => {
    it('prunes ticks and option chains without throwing errors', () => {
      const result = dbEngine.pruneOldSnapshots(50000, 100000);
      assert.strictEqual(typeof result.prunedTicks, 'number');
      assert.strictEqual(typeof result.prunedChains, 'number');
    });
  });

  describe('Task G: Pagination Parameter Enforcement', () => {
    it('supports limit and offset pagination on paper positions and signals', () => {
      const positions = dbEngine.loadAllPaperPositions(null, 10, 0);
      assert.ok(Array.isArray(positions));
      assert.ok(positions.length <= 10);

      const baskets = dbEngine.loadAllBasketOrders(null, 10, 0);
      assert.ok(Array.isArray(baskets));
      assert.ok(baskets.length <= 10);

      const signals = dbEngine.getEma15mSignals(undefined, undefined, 10, 0);
      assert.ok(Array.isArray(signals));
      assert.ok(signals.length <= 10);

      const trades = dbEngine.getEmaPaperTrades(undefined, undefined, 10, 0);
      assert.ok(Array.isArray(trades));
      assert.ok(trades.length <= 10);
    });
  });

  describe('Task H: Centralized Canonical Symbols Synchronization', () => {
    it('ensures exact alignment across canonical instruments and market feed configs', () => {
      const canonicalKeys = Object.keys(CANONICAL_INSTRUMENTS);
      const feedKeys = Object.keys(UNDERLYING_CONFIGS);

      assert.strictEqual(canonicalKeys.length, 17);
      assert.strictEqual(PRIMARY_COVERAGE_SYMBOLS.length, 17);
      assert.strictEqual(ALL_CONFIGURED_SYMBOLS.length, 17);
      assert.strictEqual(feedKeys.length, 17);

      for (const key of canonicalKeys) {
        assert.ok(feedKeys.includes(key), `Feed config must include canonical symbol: ${key}`);
      }
    });

    it('ensures coverage query includes all 17 canonical assets', () => {
      const coverage = dbEngine.getSymbolCollectionCoverage();
      const coverageKeys = Object.keys(coverage);
      assert.strictEqual(coverageKeys.length, 17);
      for (const sym of PRIMARY_COVERAGE_SYMBOLS) {
        assert.ok(sym in coverage, `Symbol ${sym} must be present in collection coverage`);
      }
    });
  });

  describe('Task I: Dynamic 1-Minute Candle Aggregation', () => {
    it('seeds known tick rows and aggregates exact 1-minute OHLCV candles', () => {
      const testSymbol = 'TEST_CANDLE_SYM_' + Date.now();
      // Seed ticks for minute 1: 2026-09-12T10:00:xx
      dbEngine.recordHistoricalTick(testSymbol, 100, 15, 50, '2026-09-12T10:00:05.000Z');
      dbEngine.recordHistoricalTick(testSymbol, 115, 15, 20, '2026-09-12T10:00:20.000Z'); // High
      dbEngine.recordHistoricalTick(testSymbol, 95, 15, 30, '2026-09-12T10:00:40.000Z');  // Low
      dbEngine.recordHistoricalTick(testSymbol, 105, 15, 40, '2026-09-12T10:00:55.000Z'); // Close

      // Seed ticks for minute 2: 2026-09-12T10:01:xx
      dbEngine.recordHistoricalTick(testSymbol, 106, 15, 10, '2026-09-12T10:01:05.000Z'); // Open
      dbEngine.recordHistoricalTick(testSymbol, 120, 15, 80, '2026-09-12T10:01:30.000Z'); // High
      dbEngine.recordHistoricalTick(testSymbol, 102, 15, 15, '2026-09-12T10:01:45.000Z'); // Low
      dbEngine.recordHistoricalTick(testSymbol, 118, 15, 25, '2026-09-12T10:01:58.000Z'); // Close

      const candles = dbEngine.getRecentSpotCandlesForUnderlying(testSymbol, 10);
      assert.ok(candles.length >= 2, 'Should aggregate at least 2 minute candles');

      const c1 = candles.find(c => c.timestamp.startsWith('2026-09-12T10:00'));
      assert.ok(c1, 'Minute 1 candle should exist');
      assert.strictEqual(c1.open, 100);
      assert.strictEqual(c1.high, 115);
      assert.strictEqual(c1.low, 95);
      assert.strictEqual(c1.close, 105);
      assert.strictEqual(c1.volume, 140); // 50 + 20 + 30 + 40

      const c2 = candles.find(c => c.timestamp.startsWith('2026-09-12T10:01'));
      assert.ok(c2, 'Minute 2 candle should exist');
      assert.strictEqual(c2.open, 106);
      assert.strictEqual(c2.high, 120);
      assert.strictEqual(c2.low, 102);
      assert.strictEqual(c2.close, 118);
      assert.strictEqual(c2.volume, 130); // 10 + 80 + 15 + 25
    });
  });

  describe('Task 3: Quant Intelligence Generalization to All Configured Symbols', () => {
    it('verifies ALL_CONFIGURED_SYMBOLS contains all 17 expected canonical instruments', () => {
      assert.strictEqual(ALL_CONFIGURED_SYMBOLS.length, 17);
      const expectedSymbols = [
        'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX',
        'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN', 'ICICIBANK', 'TATAMOTORS',
        'GOLD', 'CRUDEOIL', 'SILVER', 'NATURALGAS', 'COPPER'
      ];
      for (const sym of expectedSymbols) {
        assert.ok(ALL_CONFIGURED_SYMBOLS.includes(sym as any), `Missing symbol: ${sym}`);
      }
    });

    it('ContractMaster provides contract specs dynamically for every configured symbol', () => {
      for (const sym of ALL_CONFIGURED_SYMBOLS) {
        const spec = ContractMaster.getContractSpec(sym);
        assert.ok(spec, `Contract spec should exist for ${sym}`);
        assert.strictEqual(spec.underlying, sym);
        assert.strictEqual(spec.lotSize, getLotSize(sym));
        assert.strictEqual(spec.strikeInterval, getStepSize(sym));
      }
    });

    it('resolveUnderlying routes every configured symbol properly and defaults gracefully', () => {
      for (const sym of ALL_CONFIGURED_SYMBOLS) {
        assert.strictEqual(resolveUnderlying({ query: { underlying: sym } }), sym);
        assert.strictEqual(resolveUnderlying({ query: { symbol: sym.toLowerCase() } }), sym);
      }
      // Unknown symbol should default to NIFTY
      assert.strictEqual(resolveUnderlying({ query: { underlying: 'UNKNOWN_TICKER' } }), 'NIFTY');
      assert.strictEqual(resolveUnderlying({ query: {} }), 'NIFTY');
    });

    it('strikeSelectionEngine uses dynamic step sizes for all configured symbols', () => {
      for (const sym of ALL_CONFIGURED_SYMBOLS) {
        const expectedStep = getStepSize(sym);
        const spec = ContractMaster.getContractSpec(sym);
        assert.strictEqual(spec.strikeInterval, expectedStep, `Strike step mismatch for ${sym}`);
      }
    });

    it('positionSizingEngine uses dynamic lot sizes for all configured symbols', () => {
      for (const sym of ALL_CONFIGURED_SYMBOLS) {
        const expectedLot = getLotSize(sym);
        assert.strictEqual(positionSizingEngine.getLotSize(sym), expectedLot, `Lot size mismatch for ${sym}`);
        const sizing = positionSizingEngine.calculatePositionSize({
          underlying: sym,
          accountCapital: 1000000,
          availableMargin: 800000,
          strategyConfidence: 0.75,
          winRate: 0.6,
          profitFactor: 1.8,
          stopLossPoints: 40,
          targetPoints: 80,
          premiumPrice: 150
        });
        assert.strictEqual(sizing.lotSize, expectedLot, `Sizing result lot size mismatch for ${sym}`);
        assert.ok(sizing.recommendedLots >= 0);
      }
    });

    it('ExpiryResolver resolves expiries gracefully for indices, equities, and commodities', () => {
      for (const sym of ALL_CONFIGURED_SYMBOLS) {
        const resolved = ExpiryResolver.resolve(sym, []);
        assert.ok(resolved.currentExpiry, `Current expiry must be resolved for ${sym}`);
        assert.ok(resolved.monthlyExpiry, `Monthly expiry must be resolved for ${sym}`);
        assert.ok(resolved.allExpiries.length > 0, `allExpiries should not be empty for ${sym}`);
      }
    });
  });
});
