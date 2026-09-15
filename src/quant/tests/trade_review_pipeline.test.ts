/**
 * Quant Intelligence Pipeline Tests: Trade Review & Learning Pipeline Persistence
 * Section 52: Trade Review Engine Database Persistence & Auto-Generation on Close
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../../server/db.js';
import { tradeReviewEngine, DEMO_TRADE_REVIEWS } from '../learning/tradeReviewEngine.js';
import { TradeReviewRecord } from '../types.js';

describe('Quant Trade Review Pipeline & Database Persistence (Section 52)', () => {
  before(async () => {
    await dbEngine.initialize();
  });

  it('verifies Migration 009 created quant_trade_reviews table and indexes', () => {
    const rawDb = dbEngine.getRawDatabase();
    const migrations = rawDb.prepare(`SELECT * FROM schema_migrations ORDER BY version ASC;`).all() as any[];
    const m009 = migrations.find(m => m.version === 9);
    assert.ok(m009, 'Migration 009 must be recorded in schema_migrations');
    assert.strictEqual(m009.description, 'Quant Trade Reviews Table');

    const tableInfo = rawDb.prepare(`PRAGMA table_info(quant_trade_reviews);`).all() as any[];
    assert.ok(tableInfo.length > 0, 'quant_trade_reviews table must exist');

    const columnNames = tableInfo.map(c => c.name);
    const expectedCols = [
      'trade_id', 'symbol', 'strategy_name', 'strategy_version',
      'entry_time', 'exit_time', 'entry_thesis', 'exit_reason',
      'regime_at_entry', 'gross_pnl', 'net_pnl', 'slippage_incurred',
      'max_favorable_excursion_r', 'max_adverse_excursion_r',
      'thesis_was_correct', 'timing_was_optimal', 'strike_selection_was_optimal',
      'lessons_learned', 'created_at'
    ];

    for (const col of expectedCols) {
      assert.ok(columnNames.includes(col), `quant_trade_reviews must contain column: ${col}`);
    }
  });

  it('confirms 3 fictional seed trades are removed from default getReviews() output', () => {
    // Before adding any new review, ensure fictional seed trades are not returned by default
    const currentReviews = tradeReviewEngine.getReviews();
    const hasFakeTrade1 = currentReviews.some(r => r.tradeId === 'TRD_NIFTY_20260901_01');
    const hasFakeTrade2 = currentReviews.some(r => r.tradeId === 'TRD_NIFTY_20260902_02');
    const hasFakeTrade3 = currentReviews.some(r => r.tradeId === 'TRD_NIFTY_20260903_03');

    assert.strictEqual(hasFakeTrade1, false, 'Fictional seed trade 1 must not be in default reviews');
    assert.strictEqual(hasFakeTrade2, false, 'Fictional seed trade 2 must not be in default reviews');
    assert.strictEqual(hasFakeTrade3, false, 'Fictional seed trade 3 must not be in default reviews');
    assert.strictEqual(DEMO_TRADE_REVIEWS.length, 3, 'Demo reviews should be isolated in DEMO_TRADE_REVIEWS');
  });

  it('persists trade reviews directly to SQLite database via tradeReviewEngine.addReview', () => {
    const testReview: TradeReviewRecord = {
      tradeId: `TEST_REV_${Date.now()}_A`,
      symbol: 'NIFTY 24500 CE',
      strategyName: 'Momentum Breakout Test',
      strategyVersion: 1,
      entryTime: new Date(Date.now() - 3600000).toISOString(),
      exitTime: new Date().toISOString(),
      entryThesis: 'Breakout above daily pivot',
      exitReason: 'Target 1 hit (+2R)',
      regimeAtEntry: 'TREND_UP',
      grossPnl: 15400,
      netPnl: 15360,
      slippageIncurred: 40,
      maxFavorableExcursionR: 2.1,
      maxAdverseExcursionR: -0.2,
      thesisWasCorrect: true,
      timingWasOptimal: true,
      strikeSelectionWasOptimal: true,
      lessonsLearned: 'Patience on breakout confirmation.'
    };

    tradeReviewEngine.addReview(testReview);

    // Verify retrieval via tradeReviewEngine
    const reviews = tradeReviewEngine.getReviews();
    const retrieved = reviews.find(r => r.tradeId === testReview.tradeId);
    assert.ok(retrieved, 'Review must be retrievable from tradeReviewEngine');
    assert.strictEqual(retrieved.netPnl, 15360);
    assert.strictEqual(retrieved.regimeAtEntry, 'TREND_UP');

    // Verify direct SQLite DB persistence
    const dbRecord = dbEngine.getTradeReviewById(testReview.tradeId);
    assert.ok(dbRecord, 'Review must be directly persisted in SQLite');
    assert.strictEqual(dbRecord.tradeId, testReview.tradeId);
    assert.strictEqual(dbRecord.grossPnl, 15400);
    assert.strictEqual(dbRecord.exitReason, 'Target 1 hit (+2R)');
  });

  it('automatically creates a trade review when a paper position is closed manually', () => {
    const posId = `POS_TEST_${Date.now()}`;
    const rawDb = dbEngine.getRawDatabase();

    // 1. Seed open paper position
    rawDb.prepare(`
      INSERT INTO paper_positions (
        id, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size,
        entry_price, current_price, pnl, stop_loss, target_price,
        status, opened_at, expiry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      posId, 'BANKNIFTY 52000 CE', 'Intraday Call Buy', 52000, 'CE', 'BUY', 30, 30,
      300.0, 350.0, 1500.0, 270.0, 360.0,
      'OPEN', new Date(Date.now() - 1800000).toISOString(), '2026-09-25'
    );

    // 2. Close position via dbEngine.closePaperPosition
    const closed = dbEngine.closePaperPosition(posId, 355.0, 1650.0, 'Manual Target Square Off');
    assert.strictEqual(closed, true, 'Position must be closed successfully');

    // 3. Verify auto-generated trade review
    const expectedReviewId = `REV_${posId}`;
    const autoReview = dbEngine.getTradeReviewById(expectedReviewId);
    assert.ok(autoReview, 'Auto-generated review must exist in quant_trade_reviews');
    assert.strictEqual(autoReview.symbol, 'BANKNIFTY 52000 CE');
    assert.strictEqual(autoReview.grossPnl, 1650.0);
    assert.strictEqual(autoReview.netPnl, 1610.0); // 1650 - 40 brokerage
    assert.strictEqual(autoReview.exitReason, 'Manual Target Square Off');
    assert.strictEqual(autoReview.thesisWasCorrect, true);
    assert.strictEqual(autoReview.regimeAtEntry, 'RANGE'); // sensible default
    assert.ok(autoReview.maxFavorableExcursionR > 0, 'Favorable R excursion should be positive for winning trade');
  });

  it('automatically creates a trade review when paper positions are closed via batchUpdatePaperPositionsMtm', () => {
    const posId = `POS_MTM_${Date.now()}`;
    const rawDb = dbEngine.getRawDatabase();

    // 1. Seed open paper position
    rawDb.prepare(`
      INSERT INTO paper_positions (
        id, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size,
        entry_price, current_price, pnl, stop_loss, target_price,
        status, opened_at, expiry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      posId, 'NIFTY 24600 PE', 'Auto Put Hedge', 24600, 'PE', 'BUY', 50, 50,
      120.0, 95.0, -1250.0, 100.0, 160.0,
      'OPEN', new Date(Date.now() - 3600000).toISOString(), '2026-09-25'
    );

    // 2. Auto-close via batchUpdatePaperPositionsMtm (Stop-Loss Hit)
    dbEngine.batchUpdatePaperPositionsMtm({
      toUpdate: [],
      toClose: [{
        id: posId,
        exitPrice: 95.0,
        pnl: -1250.0,
        reason: 'Stop Loss Hit (SL: 100.00)'
      }]
    });

    // 3. Verify auto-generated review
    const autoReview = dbEngine.getTradeReviewById(`REV_${posId}`);
    assert.ok(autoReview, 'Auto-generated review must exist for MTM closed position');
    assert.strictEqual(autoReview.symbol, 'NIFTY 24600 PE');
    assert.strictEqual(autoReview.grossPnl, -1250.0);
    assert.strictEqual(autoReview.netPnl, -1290.0); // -1250 - 40 brokerage
    assert.strictEqual(autoReview.thesisWasCorrect, false);
    assert.ok(autoReview.exitReason.includes('Stop Loss Hit'));
  });

  it('automatically creates a trade review when an EMA 15m paper trade is closed', () => {
    const emaTradeId = `EMA_TRD_${Date.now()}`;
    const rawDb = dbEngine.getRawDatabase();

    // 1. Seed open EMA paper trade
    rawDb.prepare(`
      INSERT INTO ema_paper_trades (
        id, signal_id, instrument, direction, entry_timestamp,
        entry_price, quantity, lot_size, strategy, source,
        status, current_price, unrealized_pnl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      emaTradeId, `SIG_${Date.now()}_${Math.random()}`, 'NIFTY', 'LONG', new Date(Date.now() - 7200000).toISOString(),
      24200.0, 50, 50, 'EMA_15M_23_50', 'PAPER',
      'OPEN', 24200.0, 0.0
    );

    // 2. Close EMA paper trade
    const closed = dbEngine.closeEmaPaperTrade(emaTradeId, 24350.0, 'OPPOSITE_CROSSOVER');
    assert.strictEqual(closed, true, 'EMA paper trade must close');

    // 3. Verify auto-generated review
    const autoReview = dbEngine.getTradeReviewById(`REV_${emaTradeId}`);
    assert.ok(autoReview, 'Auto-generated review must exist for closed EMA trade');
    assert.strictEqual(autoReview.symbol, 'NIFTY');
    assert.strictEqual(autoReview.regimeAtEntry, 'TREND_UP', 'Long EMA trade should determine TREND_UP regime');
    assert.strictEqual(autoReview.grossPnl, 7500.0); // (24350 - 24200) * 50
    assert.strictEqual(autoReview.netPnl, 7460.0); // 7500 - 40 brokerage
    assert.strictEqual(autoReview.exitReason, 'OPPOSITE_CROSSOVER');
    assert.strictEqual(autoReview.thesisWasCorrect, true);
  });

  it('creates an autonomous strategy trade review with safe defaults and failure isolation', () => {
    const strat = {
      id: `STRAT_${Date.now()}`,
      name: 'Delta Neutral Strangle Auto',
      symbol: 'BANKNIFTY',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      lastActionAt: new Date(Date.now() - 3600000).toISOString(),
      legs: [{ id: 'leg1' }, { id: 'leg2' }]
    };

    // Record review from autonomous strategy exit
    tradeReviewEngine.recordFromAutonomousStrategy(
      strat,
      ['Max Profit Target (70% Decay)', 'Gamma Threshold Exceeded'],
      4500.0
    );

    const reviews = tradeReviewEngine.getReviews();
    const autoReview = reviews.find(r => r.strategyName === 'Delta Neutral Strangle Auto');
    assert.ok(autoReview, 'Autonomous strategy review must be recorded');
    assert.strictEqual(autoReview.symbol, 'BANKNIFTY');
    assert.strictEqual(autoReview.grossPnl, 4500.0);
    assert.strictEqual(autoReview.netPnl, 4420.0); // 4500 - (2 legs * 40) = 4420
    assert.strictEqual(autoReview.thesisWasCorrect, true);
    assert.ok(autoReview.exitReason.includes('Max Profit Target'));

    // Safe isolation: null/corrupted params do not throw
    assert.doesNotThrow(() => {
      tradeReviewEngine.recordFromAutonomousStrategy(null as any, [], 0);
      tradeReviewEngine.recordFromPaperPosition(null as any, 0, 0, '');
      tradeReviewEngine.recordFromEmaTrade(null as any, 0, 0, 0, '');
    });
  });
});
