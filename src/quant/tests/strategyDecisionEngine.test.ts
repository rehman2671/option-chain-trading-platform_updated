import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  evaluateStrategyEntry,
  evaluateStrategyExit,
  StrategyDecisionContext
} from '../strategies/strategyDecisionEngine.js';
import { CANONICAL_STRATEGIES } from '../strategies/strategyLibrary.js';
import { AutonomousStrategy } from '../../types.js';

describe('StrategyDecisionEngine Unit Tests', () => {
  const bullStrategy = CANONICAL_STRATEGIES.find(s => s.id === 'strat-bull-call-spread-01')!;
  const bearStrategy = CANONICAL_STRATEGIES.find(s => s.id === 'strat-bear-put-spread-01')!;
  const condorStrategy = CANONICAL_STRATEGIES.find(s => s.id === 'strat-iron-condor-01')!;

  describe('evaluateStrategyEntry', () => {
    it('should fail-closed if spot price is stale or unavailable', () => {
      const staleContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24500,
        isSpotLive: false
      };

      const decision = evaluateStrategyEntry(bullStrategy, staleContext);
      assert.strictEqual(decision.shouldEnter, false);
      assert.ok(decision.reasons[0].includes('Spot price is stale/unavailable'));
    });

    it('should trigger entry for Bull Call Spread under favorable bullish conditions', () => {
      const bullishContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24550,
        vwap: 24500,
        ema20: 24540,
        ema50: 24510,
        emaDifference: 30,
        signal: 'BULLISH',
        pcr: 1.15,
        ivRank: 35,
        isSpotLive: true
      };

      const decision = evaluateStrategyEntry(bullStrategy, bullishContext);
      assert.strictEqual(decision.shouldEnter, true);
      assert.strictEqual(decision.direction, 'BULLISH');
      assert.ok(decision.reasons.length > 0);
    });

    it('should reject Bull Call Spread entry when trend is adverse (bearish)', () => {
      const bearishContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24400,
        vwap: 24500,
        ema20: 24420,
        ema50: 24480,
        emaDifference: -60,
        signal: 'BEARISH',
        pcr: 0.85,
        ivRank: 45,
        isSpotLive: true
      };

      const decision = evaluateStrategyEntry(bullStrategy, bearishContext);
      assert.strictEqual(decision.shouldEnter, false);
      assert.ok(decision.reasons.some(r => r.includes('not fully met')));
    });

    it('should trigger entry for Bear Put Spread under favorable bearish conditions', () => {
      const bearishContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24400,
        vwap: 24450,
        ema20: 24410,
        ema50: 24460,
        emaDifference: -50,
        signal: 'BEARISH',
        pcr: 0.85,
        ivRank: 40,
        isSpotLive: true
      };

      const decision = evaluateStrategyEntry(bearStrategy, bearishContext);
      assert.strictEqual(decision.shouldEnter, true);
      assert.strictEqual(decision.direction, 'BEARISH');
    });

    it('should trigger entry for Iron Condor in low-volatility range consolidation', () => {
      const rangeContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24500,
        vwap: 24502,
        ema20: 24501,
        ema50: 24500,
        emaDifference: 1,
        signal: 'NONE',
        ivRank: 45,
        isSpotLive: true
      };

      const decision = evaluateStrategyEntry(condorStrategy, rangeContext);
      assert.strictEqual(decision.shouldEnter, true);
      assert.strictEqual(decision.direction, 'NEUTRAL');
    });

    it('should evaluate structured RuleGroup for AutonomousStrategy', () => {
      const autoStrat: AutonomousStrategy = {
        id: 'auto-strat-test',
        name: 'Auto Strat',
        symbol: 'NIFTY',
        armed: true,
        productType: 'MIS',
        legs: [],
        entryRules: {
          all: [
            { field: 'spotPrice', operator: '>', value: 24000 },
            { field: 'pcr', operator: '>', value: 1.0 }
          ]
        },
        maxPositionSize: 5,
        status: 'WATCHING',
        createdAt: new Date().toISOString()
      };

      const matchingContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24500,
        pcr: 1.2,
        isSpotLive: true
      };

      const decision = evaluateStrategyEntry(autoStrat, matchingContext);
      assert.strictEqual(decision.shouldEnter, true);
    });
  });

  describe('evaluateStrategyExit', () => {
    it('should trigger exit when profit target is hit', () => {
      const exitContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24600,
        portfolioPnlPercent: 52.5,
        isSpotLive: true
      };

      const exit = evaluateStrategyExit(bullStrategy, exitContext);
      assert.strictEqual(exit.shouldExit, true);
      assert.strictEqual(exit.exitReason, 'TARGET_HIT');
      assert.ok(exit.reasons[0].includes('Profit target hit'));
    });

    it('should trigger exit when stop loss is hit', () => {
      const exitContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24350,
        portfolioPnlPercent: -42.0,
        isSpotLive: true
      };

      const exit = evaluateStrategyExit(bullStrategy, exitContext);
      assert.strictEqual(exit.shouldExit, true);
      assert.strictEqual(exit.exitReason, 'STOP_LOSS');
      assert.ok(exit.reasons[0].includes('Stop loss hit'));
    });

    it('should trigger exit upon option contract expiry', () => {
      const exitContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24500,
        portfolioPnlPercent: 12.0,
        dte: 0,
        isSpotLive: true
      };

      const exit = evaluateStrategyExit(bullStrategy, exitContext);
      assert.strictEqual(exit.shouldExit, true);
      assert.strictEqual(exit.exitReason, 'EXPIRY_EXIT');
    });

    it('should trigger exit upon reaching maximum holding duration', () => {
      const exitContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24500,
        portfolioPnlPercent: 8.0,
        holdingPeriods: 200, // 7 days * 25 bars = 175 max bars
        isSpotLive: true
      };

      const exit = evaluateStrategyExit(bullStrategy, exitContext);
      assert.strictEqual(exit.shouldExit, true);
      assert.strictEqual(exit.exitReason, 'TIME_EXIT');
    });

    it('should trigger exit upon adverse signal reversal', () => {
      const exitContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24450,
        portfolioPnlPercent: -15.0,
        signal: 'BEARISH',
        consecutiveAdverseCloses: 2,
        isSpotLive: true
      };

      const exit = evaluateStrategyExit(bullStrategy, exitContext);
      assert.strictEqual(exit.shouldExit, true);
      assert.strictEqual(exit.exitReason, 'SIGNAL_REVERSAL');
    });

    it('should maintain position when no exit trigger is met', () => {
      const holdContext: StrategyDecisionContext = {
        symbol: 'NIFTY',
        spotPrice: 24550,
        portfolioPnlPercent: 15.0,
        holdingPeriods: 10,
        dte: 5,
        isSpotLive: true
      };

      const exit = evaluateStrategyExit(bullStrategy, holdContext);
      assert.strictEqual(exit.shouldExit, false);
      assert.strictEqual(exit.exitReason, 'NONE');
    });
  });
});
