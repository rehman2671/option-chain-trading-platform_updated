/**
 * Automated Tests: Unified Risk Controls & Decision Engine Execution
 * Verifies:
 * 1. Unified Kill Switch blocks all execution paths (Autonomous Engine, Basket Engine, Order Adapter, Quant Scheduler)
 * 2. Per-user isolation & global fallback
 * 3. Drawdown controller gating
 * 4. Exposure controller limit checks
 * 5. Execution mode gating: ADVISORY_ONLY (default safe opt-out) vs SHADOW / LIVE_PAPER
 * 6. Authorized kill-switch reset unlocks execution safely
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { dbEngine } from '../../server/db.js';
import { killSwitchEngine } from '../risk/killSwitch.js';
import { drawdownController } from '../risk/drawdownController.js';
import { exposureController } from '../risk/exposureController.js';
import { orderAdapter } from '../adapters/orderAdapter.js';
import { globalBasketEngine } from '../../server/engine/basketEngine.js';
import { globalAutonomousEngine } from '../../server/engine/autonomousEngine.js';
import { quantScheduler } from '../scheduler/quantScheduler.js';

describe('Unified Risk Controls & Real Execution Integration', () => {
  const TEST_USER = 'test_user_unified_risk';

  before(async () => {
    await dbEngine.initialize();
  });

  after(() => {
    quantScheduler.stop();
    setTimeout(() => process.exit(0), 200).unref();
  });

  afterEach(() => {
    // Reset test user and global state after each test
    killSwitchEngine.resetKillSwitch('RESET_RISK_AUTH', 'Test cleanup', TEST_USER);
    killSwitchEngine.resetKillSwitch('RESET_RISK_AUTH', 'Test cleanup', 'GLOBAL');
    drawdownController.resetHalt('TEST_OPERATOR', 'Test cleanup', TEST_USER);
    drawdownController.resetHalt('TEST_OPERATOR', 'Test cleanup', 'GLOBAL');
    dbEngine.deleteQuantUserSettings(TEST_USER);
  });

  it('1. Verifies Kill Switch initially ARMED and not halted for test user', () => {
    const state = killSwitchEngine.getState(TEST_USER);
    assert.strictEqual(state.status, 'ARMED');
    assert.strictEqual(state.isTradingHalted, false);
    assert.strictEqual(killSwitchEngine.isHalted(TEST_USER), false);
  });

  it('2. Verifies Kill Switch effectively BLOCKS OrderAdapter across all modes (SHADOW, PAPER, LIVE)', () => {
    // Trigger kill switch
    killSwitchEngine.manualEmergencyKill('TEST_SUITE', TEST_USER, 'Testing order gating');
    assert.strictEqual(killSwitchEngine.isHalted(TEST_USER), true);

    // Attempt SHADOW order
    const shadowResult = orderAdapter.submitOrder({
      strategyId: 'STRAT-BULL-CALL',
      symbol: 'NIFTY 24000 CE',
      action: 'BUY',
      orderType: 'MARKET',
      quantity: 25,
      mode: 'SHADOW',
      userId: TEST_USER
    });
    assert.strictEqual(shadowResult.status, 'REJECTED');
    assert.ok(shadowResult.message.toLowerCase().includes('kill switch is active'));

    // Attempt PAPER order
    const paperResult = orderAdapter.submitOrder({
      strategyId: 'STRAT-BEAR-PUT',
      symbol: 'NIFTY 24000 PE',
      action: 'BUY',
      orderType: 'LIMIT',
      limitPrice: 120,
      quantity: 25,
      mode: 'PAPER',
      userId: TEST_USER
    });
    assert.strictEqual(paperResult.status, 'REJECTED');
    assert.ok(paperResult.message.toLowerCase().includes('kill switch is active'));

    // Attempt LIVE order
    const liveResult = orderAdapter.submitOrder({
      strategyId: 'STRAT-IRON-CONDOR',
      symbol: 'NIFTY 24200 CE',
      action: 'SELL',
      orderType: 'LIMIT',
      limitPrice: 80,
      quantity: 25,
      mode: 'LIVE',
      userId: TEST_USER
    });
    assert.strictEqual(liveResult.status, 'REJECTED');
    assert.ok(liveResult.message.toLowerCase().includes('kill switch is active'));
  });

  it('3. Verifies Kill Switch effectively BLOCKS BasketEngine execution', async () => {
    killSwitchEngine.manualEmergencyKill('TEST_SUITE', TEST_USER, 'Testing basket gating');
    assert.strictEqual(killSwitchEngine.isHalted(TEST_USER), true);

    const basketResult = await globalBasketEngine.executeBasketOrder(
      'strat_iron_condor',
      'Iron Condor Test',
      'NIFTY',
      [
        { id: '1', strikePrice: 24000, type: 'CE', action: 'SELL', quantity: 25, lotSize: 25, currentLtp: 100, iv: 15, delta: 0.5, gamma: 0.001, theta: -10, vega: 12, expiry: '2026-09-24' },
        { id: '2', strikePrice: 24100, type: 'CE', action: 'BUY', quantity: 25, lotSize: 25, currentLtp: 60, iv: 15, delta: 0.3, gamma: 0.001, theta: -8, vega: 10, expiry: '2026-09-24' }
      ],
      100000,
      TEST_USER
    );

    assert.strictEqual(basketResult.status, 'FAILED');
    assert.ok(basketResult.reconciliationNotes?.toLowerCase().includes('kill switch is active'));
  });

  it('4. Verifies Kill Switch effectively BLOCKS AutonomousEngine evaluation cycle', () => {
    killSwitchEngine.manualEmergencyKill('TEST_SUITE', TEST_USER, 'Testing autonomous gating');

    const status = globalAutonomousEngine.getStatus(TEST_USER);
    assert.strictEqual(status.isKillSwitchEngaged, true);
    assert.strictEqual(status.isRunnerActive, false);
    assert.ok(status.killSwitchReason?.includes('Testing autonomous gating'));
  });

  it('5. Verifies Quant Decision Loop enforces default ADVISORY_ONLY mode (safe opt-out)', async () => {
    // Ensure default settings for user (no modification)
    const settings = dbEngine.getQuantUserSettings(TEST_USER);
    assert.strictEqual(settings.quantExecutionMode, 'ADVISORY_ONLY');

    const result = await quantScheduler.runQuantDecisionExecutionCycle(TEST_USER, 'NIFTY');
    assert.strictEqual(result.executionMode, 'ADVISORY_ONLY');
    assert.strictEqual(result.orderResult, null);
  });

  it('6. Verifies Quant Decision Loop executes in SHADOW mode when configured', async () => {
    dbEngine.saveQuantUserSettings({
      userId: TEST_USER,
      quantExecutionMode: 'SHADOW',
      minConfidenceThreshold: 10,
      allowedUnderlyings: ['NIFTY']
    });

    const result = await quantScheduler.runQuantDecisionExecutionCycle(TEST_USER, 'NIFTY');
    assert.strictEqual(result.executionMode, 'SHADOW');

    if (result.decision?.action === 'ENTER') {
      assert.ok(result.orderResult);
      assert.ok(['SHADOW_LOGGED', 'SIMULATED', 'SUBMITTED'].includes(result.orderResult.status));
    }
  });

  it('7. Verifies Quant Decision Loop is BLOCKED when Kill Switch is active', async () => {
    // Configure user in SHADOW mode
    dbEngine.saveQuantUserSettings({
      userId: TEST_USER,
      quantExecutionMode: 'SHADOW'
    });

    // Halt system
    killSwitchEngine.manualEmergencyKill('TEST_SUITE', TEST_USER, 'Emergency stop test');

    const result = await quantScheduler.runQuantDecisionExecutionCycle(TEST_USER, 'NIFTY');
    assert.strictEqual(result.blockedByRisk, true);
    assert.strictEqual(result.orderResult, null);
    assert.ok(result.message.toLowerCase().includes('kill switch is active'));
  });

  it('8. Verifies Drawdown Controller blocks orders when drawdown exceeds limit', () => {
    // Peak 100k, current 80k = 20% drawdown (exceeds 15% critical threshold)
    drawdownController.evaluateDrawdown(80000, 100000, TEST_USER);
    assert.strictEqual(drawdownController.isHalted(TEST_USER), true);

    const orderResult = orderAdapter.submitOrder({
      strategyId: 'STRAT-BULL-CALL',
      symbol: 'NIFTY 24000 CE',
      action: 'BUY',
      orderType: 'MARKET',
      quantity: 25,
      mode: 'SHADOW',
      userId: TEST_USER
    });

    assert.strictEqual(orderResult.status, 'REJECTED');
    assert.ok(orderResult.message.includes('Drawdown Controller'));
  });

  it('9. Verifies Exposure Controller gates out orders exceeding margin or Greek limits', () => {
    // Net Delta = 150 exceeds max limit of 100
    const gating = exposureController.checkOrderGating(
      'NIFTY',
      { netDelta: 150, netGamma: 0.005, netTheta: -100, netVega: 50 },
      { totalCapital: 1000000, usedMargin: 150000, dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0, peakCapital: 1000000, correlatedTradesCount: 1 }
    );

    assert.strictEqual(gating.passed, false);
    assert.ok(gating.reason?.includes('Limit breach detected'));
  });

  it('10. Verifies authorized Kill Switch reset unlocks execution safely', () => {
    // Halt
    killSwitchEngine.manualEmergencyKill('TEST_SUITE', TEST_USER, 'Temporary halt');
    assert.strictEqual(killSwitchEngine.isHalted(TEST_USER), true);

    // Attempt unauthorized reset
    const badReset = killSwitchEngine.resetKillSwitch('WRONG_KEY', 'Unauthorized', TEST_USER);
    assert.strictEqual(badReset.success, false);
    assert.strictEqual(killSwitchEngine.isHalted(TEST_USER), true);

    // Authorized reset
    const goodReset = killSwitchEngine.resetKillSwitch('RESET_RISK_AUTH', 'Supervisor authorized', TEST_USER);
    assert.strictEqual(goodReset.success, true);
    assert.strictEqual(killSwitchEngine.isHalted(TEST_USER), false);

    // Orders now permitted
    const orderResult = orderAdapter.submitOrder({
      strategyId: 'STRAT-BULL-CALL',
      symbol: 'NIFTY 24000 CE',
      action: 'BUY',
      orderType: 'MARKET',
      quantity: 25,
      mode: 'SHADOW',
      userId: TEST_USER
    });
    assert.strictEqual(orderResult.status, 'SHADOW_LOGGED');
  });
});
