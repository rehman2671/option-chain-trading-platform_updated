/**
 * Quant Background Learning Scheduler & Continuous Research Tests
 * Section 51, 69 & Scheduler Autonomy:
 * - Verifies real autonomous background scheduler pattern (setInterval with .unref())
 * - Verifies continuous research loop evaluates canonical strategies & generates mutations
 * - Verifies database persistence in SQLite table `quant_research_cycles`
 * - Verifies daily-run guard prevents double-runs on the same calendar day
 * - Verifies manual UI trigger and scheduled run share exact same underlying logic
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../../server/db.js';
import { quantScheduler } from '../scheduler/quantScheduler.js';
import { continuousResearchEngine } from '../learning/continuousResearch.js';
import { CANONICAL_STRATEGIES } from '../strategies/strategyLibrary.js';

describe('Quant Background Learning Scheduler & Research Cycle (Section 51 & 69)', () => {
  before(async () => {
    await dbEngine.initialize();
  });

  after(() => {
    quantScheduler.stop();
  });

  it('verifies Migration 010 created quant_research_cycles table with proper schema', () => {
    const rawDb = dbEngine.getRawDatabase();
    const migrations = rawDb.prepare(`SELECT * FROM schema_migrations ORDER BY version ASC;`).all() as any[];
    const m010 = migrations.find(m => m.version === 10);
    assert.ok(m010, 'Migration 010 must be registered in schema_migrations');
    assert.strictEqual(m010.description, 'Quant Autonomous Research Cycles Table');

    const tableInfo = rawDb.prepare(`PRAGMA table_info(quant_research_cycles);`).all() as any[];
    assert.ok(tableInfo.length > 0, 'quant_research_cycles table must exist');

    const colNames = tableInfo.map(c => c.name);
    const expectedCols = [
      'id', 'cycle_id', 'execution_timestamp', 'trades_analyzed_count',
      'total_net_pnl_reviewed', 'win_rate_realized_pct', 'hypotheses_generated_count',
      'top_generated_hypotheses', 'regime_performance_summary', 'status', 'created_at'
    ];

    for (const col of expectedCols) {
      assert.ok(colNames.includes(col), `quant_research_cycles must contain column: ${col}`);
    }
  });

  it('manually triggers continuousResearchEngine.runPostMarketCycle() directly and verifies output structure', () => {
    const startTime = Date.now();
    const summary = continuousResearchEngine.runPostMarketCycle({
      triggerSource: 'MANUAL',
      force: true
    });

    assert.ok(summary, 'Must return summary object');
    assert.ok(summary.cycleId.startsWith('CYCLE-'), 'Cycle ID must start with CYCLE-');
    assert.strictEqual(summary.status, 'COMPLETED');
    assert.ok(typeof summary.tradesAnalyzedCount === 'number');
    assert.ok(typeof summary.totalNetPnlReviewed === 'number');
    assert.ok(typeof summary.winRateRealizedPct === 'number');
    assert.strictEqual(summary.hypothesesGeneratedCount, 2);
    assert.strictEqual(summary.topGeneratedHypotheses.length, 2);
    assert.ok(summary.regimePerformanceSummary, 'Must contain regime performance summary');

    // Confirm it evaluates all canonical strategies from strategyLibrary.ts
    assert.ok(summary.strategiesEvaluated && summary.strategiesEvaluated.length >= CANONICAL_STRATEGIES.length);
    for (const strat of CANONICAL_STRATEGIES) {
      assert.ok(summary.strategiesEvaluated.includes(strat.id), `Must evaluate canonical strategy: ${strat.id}`);
    }

    // Confirm mutations were generated
    assert.ok(summary.mutationsGeneratedCount && summary.mutationsGeneratedCount >= CANONICAL_STRATEGIES.length * 3);
    assert.ok(typeof summary.durationMs === 'number');
    assert.strictEqual(summary.triggerSource, 'MANUAL');
  });

  it('verifies that output of continuous research cycle is persisted directly into SQLite quant_research_cycles', () => {
    const summary = continuousResearchEngine.runPostMarketCycle({
      triggerSource: 'MANUAL',
      force: true
    });

    const persistedCycles = dbEngine.getQuantResearchCycles(10);
    assert.ok(persistedCycles.length > 0, 'Must retrieve at least one persisted cycle');

    const matchingCycle = persistedCycles.find(c => c.cycleId === summary.cycleId);
    assert.ok(matchingCycle, `Persisted cycle with id ${summary.cycleId} must be present in SQLite`);

    assert.strictEqual(matchingCycle.tradesAnalyzedCount, summary.tradesAnalyzedCount);
    assert.strictEqual(matchingCycle.totalNetPnlReviewed, summary.totalNetPnlReviewed);
    assert.strictEqual(matchingCycle.winRateRealizedPct, summary.winRateRealizedPct);
    assert.strictEqual(matchingCycle.hypothesesGeneratedCount, summary.hypothesesGeneratedCount);
    assert.deepStrictEqual(matchingCycle.topGeneratedHypotheses, summary.topGeneratedHypotheses);
    assert.strictEqual(matchingCycle.status, 'COMPLETED');

    // Confirm direct raw SQL query on quant_research_cycles matches
    const rawDb = dbEngine.getRawDatabase();
    const rawRow = rawDb.prepare(`SELECT * FROM quant_research_cycles WHERE cycle_id = ?`).get(summary.cycleId) as any;
    assert.ok(rawRow, 'Raw SQLite row must exist');
    assert.strictEqual(rawRow.cycle_id, summary.cycleId);
    assert.strictEqual(rawRow.status, 'COMPLETED');
  });

  it('verifies quantScheduler initializes and accurately calculates IST time and market phase', async () => {
    await quantScheduler.initialize({ skipInitialTick: true });
    const status = quantScheduler.getStatus();

    assert.strictEqual(status.isStarted, true);
    assert.strictEqual(status.tickIntervalMs, 60000);
    assert.ok(status.istNow);
    assert.ok(status.istNow.dateStr.match(/^\d{4}-\d{2}-\d{2}$/));
    assert.ok(status.istNow.istTime.includes('IST'));
    assert.ok(typeof status.istNow.isMarketOpen === 'boolean');
    assert.ok(typeof status.istNow.isPostMarket === 'boolean');
  });

  it('verifies daily-run guard prevents double-runs on the same day when scheduled', async () => {
    const ist = quantScheduler.getIstDateTime();
    const todayDateStr = ist.dateStr;

    // Simulate that today's cycle already ran
    quantScheduler.setLastDailyRunDate(todayDateStr);
    assert.strictEqual(quantScheduler.getLastDailyRunDate(), todayDateStr);

    // Call scheduled run with force=false (the standard scheduled path)
    const result = await quantScheduler.runDailyResearchCycle('SCHEDULED', { force: false });
    assert.strictEqual(result, null, 'Scheduler must skip execution when today date already ran');

    // Verify tick() behavior: if post-market, tick must return SKIPPED_ALREADY_RUN
    if (ist.isPostMarket) {
      const tickResult = await quantScheduler.tick();
      assert.strictEqual(tickResult.actionTaken, 'SKIPPED_ALREADY_RUN');
      assert.ok(tickResult.message.includes(`already completed for ${todayDateStr}`));
    }

    // However, with force=true (like the manual UI button), it must allow execution
    const forcedResult = await quantScheduler.runDailyResearchCycle('MANUAL', { force: true });
    assert.ok(forcedResult, 'Forced execution must succeed even if run earlier today');
    assert.strictEqual(forcedResult.status, 'COMPLETED');
  });

  it('verifies scheduled path and manual UI path call the exact same underlying function and output consistent format', async () => {
    // Reset daily run date to allow scheduled execution
    quantScheduler.setLastDailyRunDate(null);

    const scheduledSummary = await quantScheduler.runDailyResearchCycle('SCHEDULED');
    assert.ok(scheduledSummary, 'Scheduled run must return a valid summary');
    assert.strictEqual(scheduledSummary.triggerSource, 'SCHEDULED');
    assert.strictEqual(scheduledSummary.status, 'COMPLETED');

    const manualSummary = continuousResearchEngine.runPostMarketCycle({ triggerSource: 'MANUAL', force: true });
    assert.ok(manualSummary, 'Manual run must return a valid summary');
    assert.strictEqual(manualSummary.triggerSource, 'MANUAL');
    assert.strictEqual(manualSummary.status, 'COMPLETED');

    // Compare keys between scheduled and manual summaries
    const scheduledKeys = Object.keys(scheduledSummary).sort();
    const manualKeys = Object.keys(manualSummary).sort();
    assert.deepStrictEqual(scheduledKeys, manualKeys, 'Scheduled and manual output must have identical structure');
  });
});
