import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../../server/db.js';
import { backtestEngine } from '../research/backtestEngine.js';
import { CANONICAL_STRATEGIES } from '../strategies/strategyLibrary.js';

describe('BacktestEngine Historical Replay & Real Data Validation', () => {
  before(async () => {
    await dbEngine.initialize();
  });

  it('returns explicit INSUFFICIENT_HISTORICAL_DATA when date range has no historical data', () => {
    const strategy = CANONICAL_STRATEGIES[0]; // Bull Call Spread
    const result = backtestEngine.runBacktest({
      strategy,
      periodStart: '2020-01-01',
      periodEnd: '2020-02-01'
    });

    console.log('[TEST] Insufficient Data Response:', JSON.stringify(result, null, 2));

    assert.strictEqual(result.status, 'INSUFFICIENT_HISTORICAL_DATA');
    assert.strictEqual(result.dataSource, 'INSUFFICIENT_HISTORICAL_DATA');
    assert.strictEqual(result.sampleSize, 0);
    assert.strictEqual(result.totalNetPnl, 0);
    assert.strictEqual(result.winRate, 0);
    assert.strictEqual(result.passedGates, false);
    assert.ok(result.availableDataRange, 'Must supply available data range');
    assert.ok(result.failureReason?.includes('Insufficient historical depth'));
    assert.strictEqual(result.trades?.length, 0);
  });

  it('correctly reports data availability range from SQLite tables', () => {
    const availability = backtestEngine.getHistoricalDataAvailability('NIFTY');
    assert.ok(availability.minDate, 'minDate must be populated');
    assert.ok(availability.maxDate, 'maxDate must be populated');
    assert.strictEqual(availability.hasCandles, true, 'ema_15m_candles must be detected');
    assert.strictEqual(availability.hasOptionSnapshots, true, 'quant_option_chain_snapshots must be detected');
  });

  it('replays real underlying 15m candles with MODELED_OPTIONS_ON_REAL_UNDERLYING label', () => {
    const strategy = CANONICAL_STRATEGIES[0];
    // This period has 1,500 real 15m candles in SQLite
    const result = backtestEngine.runBacktest({
      strategy,
      periodStart: '2026-08-17T00:00:00.000Z',
      periodEnd: '2026-09-11T23:59:59.000Z'
    });

    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.dataSource, 'MODELED_OPTIONS_ON_REAL_UNDERLYING');
    assert.ok(result.sampleSize > 0, `Expected trades from 15m candles, got ${result.sampleSize}`);
    assert.ok(result.trades && result.trades.length > 0, 'Trades array must not be empty');
    assert.ok(result.totalTransactionCosts > 0, 'Transaction costs must be realistically modeled');
  });

  it('replays seeded dataset with exact hand-calculated expected outcome', () => {
    const rawDb = dbEngine.getRawDatabase();
    assert.ok(rawDb, 'Database must be ready');

    // Seed a known micro-dataset for an isolated symbol TEST_REPLAY
    const testSymbol = 'TEST_REPLAY';
    const seededCandles = [
      // Candle 1: Bullish setup -> triggers entry
      {
        instrument: testSymbol,
        timeframe: '15m',
        timestamp: '2026-07-01T09:15:00.000Z',
        open: 24500, high: 24560, low: 24490, close: 24550,
        volume: 50000, is_closed: 1,
        ema_23: 24540, ema_50: 24500, ema_difference: 40,
        signal: 'BULLISH',
        created_at: '2026-07-01 09:15:00'
      },
      // Candle 2: Strong rally -> profit target hit (>50% target) -> exit trade 1 (WIN)
      {
        instrument: testSymbol,
        timeframe: '15m',
        timestamp: '2026-07-01T10:15:00.000Z',
        open: 24550, high: 24780, low: 24540, close: 24750,
        volume: 60000, is_closed: 1,
        ema_23: 24650, ema_50: 24530, ema_difference: 120,
        signal: 'BULLISH',
        created_at: '2026-07-01 10:15:00'
      },
      // Candle 3: Still bullish -> triggers entry for trade 2
      {
        instrument: testSymbol,
        timeframe: '15m',
        timestamp: '2026-07-01T11:15:00.000Z',
        open: 24750, high: 24770, low: 24720, close: 24760,
        volume: 45000, is_closed: 1,
        ema_23: 24700, ema_50: 24570, ema_difference: 130,
        signal: 'BULLISH',
        created_at: '2026-07-01 11:15:00'
      },
      // Candle 4: Sharp selloff -> stop loss hit (<-40% stop) -> exit trade 2 (LOSS)
      {
        instrument: testSymbol,
        timeframe: '15m',
        timestamp: '2026-07-01T12:15:00.000Z',
        open: 24760, high: 24760, low: 24350, close: 24380,
        volume: 90000, is_closed: 1,
        ema_23: 24520, ema_50: 24560, ema_difference: -40,
        signal: 'BEARISH',
        created_at: '2026-07-01 12:15:00'
      }
    ];

    try {
      const insertStmt = rawDb.prepare(`
        INSERT INTO ema_15m_candles (
          instrument, timeframe, timestamp, open, high, low, close, volume, is_closed,
          ema_23, ema_50, ema_difference, signal, created_at
        ) VALUES (
          @instrument, @timeframe, @timestamp, @open, @high, @low, @close, @volume, @is_closed,
          @ema_23, @ema_50, @ema_difference, @signal, @created_at
        )
      `);

      for (const candle of seededCandles) {
        insertStmt.run(candle);
      }

      // Run backtest over the seeded range
      const testStrategy = {
        ...CANONICAL_STRATEGIES[0],
        id: `strat-test-${testSymbol}`,
        symbol: testSymbol
      };

      const result = backtestEngine.runBacktest({
        strategy: testStrategy,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-07-01T23:59:59.000Z'
      });

      console.log('[TEST] Seeded Replay Result:', {
        sampleSize: result.sampleSize,
        winRate: result.winRate,
        trades: result.trades?.map(t => ({
          entry: t.entryTime,
          exit: t.exitTime,
          netPnl: t.netPnl,
          reason: t.exitReason
        }))
      });

      // Hand-calculated assertions:
      // Exactly 2 trades:
      // Trade 1: entered at 09:15, exited at 10:15 with TARGET_HIT (Win)
      // Trade 2: entered at 11:15, exited at 12:15 with STOP_LOSS (Loss)
      assert.strictEqual(result.sampleSize, 2, 'Must execute exactly 2 trades');
      assert.strictEqual(result.winRate, 50.0, 'Win rate must be exactly 50%');
      assert.strictEqual(result.trades![0].exitReason, 'TARGET_HIT', 'Trade 1 must exit on target');
      assert.ok(result.trades![0].netPnl > 0, 'Trade 1 must be profitable');
      assert.strictEqual(result.trades![1].exitReason, 'STOP_LOSS', 'Trade 2 must exit on stop loss');
      assert.ok(result.trades![1].netPnl < 0, 'Trade 2 must be a loss');
    } finally {
      // Clean up seeded test rows
      rawDb.prepare(`DELETE FROM ema_15m_candles WHERE instrument = ?`).run(testSymbol);
    }
  });
});
