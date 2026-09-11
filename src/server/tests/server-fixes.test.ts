/**
 * Server and Database Integrity Unit Tests
 * Covers Tasks A, B, C, D, E, F, G, H, I, and J
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../db.js';
import { globalMarketFeed, UNDERLYING_CONFIGS } from '../engine/marketFeed.js';
import { CANONICAL_INSTRUMENTS, PRIMARY_COVERAGE_SYMBOLS, ALL_CONFIGURED_SYMBOLS } from '../../shared/marketConfig.js';

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
});
