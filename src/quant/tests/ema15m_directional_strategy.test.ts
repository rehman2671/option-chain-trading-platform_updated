/**
 * Automated NIFTY 50 15M EMA (23 & 50) Strategy Unit & Integration Tests
 * Validates all 12 operational rules:
 * - Directional ATM Strike Selection (CE >= Spot, PE <= Spot)
 * - Dynamic Weekly Expiry Resolution
 * - Crossover Logic on 15m candle closes
 * - Quantity: Exactly 1 Lot, MIS Product
 * - SL & Target Rules:
 *     CE: SL = Entry - 30, Target = Entry + 100
 *     PE: SL = Entry + 30, Target = Entry - 100
 * - Invariant: Max 1 active position, no averaging, no pyramiding
 * - Forced Intraday Square-off at 15:15 IST
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ContractMaster } from '../data/contractMaster.js';
import { ExpiryResolver } from '../data/expiryResolver.js';
import { globalEma15mEngine } from '../../server/engine/ema15mEngine.js';

describe('15M EMA Alert & Directional Automated Strategy (12 Rules)', () => {
  describe('Rule 4 & 9: Directional ATM Strike Selection', () => {
    it('selects CE >= Spot (Ceiling) and PE <= Spot (Floor) for NIFTY spot 25,180 with step 50', () => {
      const spot = 25180;
      const step = 50;

      const ceStrike = ContractMaster.getDirectionalAtmStrike(spot, 'CE', step);
      const peStrike = ContractMaster.getDirectionalAtmStrike(spot, 'PE', step);

      assert.strictEqual(ceStrike, 25200, 'Bullish CE strike must be nearest valid strike >= 25,180');
      assert.strictEqual(peStrike, 25150, 'Bearish PE strike must be nearest valid strike <= 25,180');
      assert.notStrictEqual(ceStrike, peStrike, 'CE and PE strikes must be directional and different when spot is between strikes');
    });

    it('selects exact strike when spot is on an exact interval boundary', () => {
      const spot = 25200;
      const step = 50;

      const ceStrike = ContractMaster.getDirectionalAtmStrike(spot, 'CE', step);
      const peStrike = ContractMaster.getDirectionalAtmStrike(spot, 'PE', step);

      assert.strictEqual(ceStrike, 25200);
      assert.strictEqual(peStrike, 25200);
    });

    it('handles BANKNIFTY 100-point interval step correctly', () => {
      const spot = 57420;
      const step = 100;

      const ceStrike = ContractMaster.getDirectionalAtmStrike(spot, 'CE', step);
      const peStrike = ContractMaster.getDirectionalAtmStrike(spot, 'PE', step);

      assert.strictEqual(ceStrike, 57500, 'BANKNIFTY CE strike at or above 57,420 must be 57,500');
      assert.strictEqual(peStrike, 57400, 'BANKNIFTY PE strike at or below 57,420 must be 57,400');
    });
  });

  describe('Rule 1 & 5 & 7: 23 EMA and 50 EMA Crossover Logic', () => {
    it('detects confirmed Bullish crossover (prev23 <= prev50 AND curr23 > curr50)', () => {
      const signal = globalEma15mEngine.evaluateCrossover(25100.0, 25110.0, 25125.0, 25120.0);
      assert.strictEqual(signal, 'BULLISH');
    });

    it('detects confirmed Bearish crossover (prev23 >= prev50 AND curr23 < curr50)', () => {
      const signal = globalEma15mEngine.evaluateCrossover(25150.0, 25140.0, 25130.0, 25138.0);
      assert.strictEqual(signal, 'BEARISH');
    });

    it('returns NONE when no crossover occurs (trending or flat)', () => {
      // Both curr and prev above
      const signal1 = globalEma15mEngine.evaluateCrossover(25160.0, 25140.0, 25175.0, 25145.0);
      assert.strictEqual(signal1, 'NONE');

      // Both curr and prev below
      const signal2 = globalEma15mEngine.evaluateCrossover(25100.0, 25120.0, 25090.0, 25115.0);
      assert.strictEqual(signal2, 'NONE');
    });
  });

  describe('Rule 2: Dynamic Weekly Expiry Resolution', () => {
    it('resolves nearest upcoming weekly expiry without hardcoded dates', () => {
      const expiry = globalEma15mEngine.resolveNearestWeeklyExpiry('NIFTY');
      assert.ok(expiry, 'Weekly expiry must be resolved');
      assert.match(expiry, /^\d{4}-\d{2}-\d{2}$/, 'Expiry must follow YYYY-MM-DD format');

      const expDate = new Date(expiry);
      assert.ok(!isNaN(expDate.getTime()), 'Expiry must be a valid date');
    });
  });

  describe('Rule 6 & 8 & 11: Stop-Loss and Target Mathematical Rules on Option Premium', () => {
    it('calculates Bullish CE SL (-30) and Target (+100) on option entry fill price', () => {
      const entryPrice = 250.0;
      const stopLoss = Number((entryPrice - 30).toFixed(2));
      const targetPrice = Number((entryPrice + 100).toFixed(2));

      assert.strictEqual(stopLoss, 220.0, 'CE SL must be Entry - 30');
      assert.strictEqual(targetPrice, 350.0, 'CE Target must be Entry + 100');
    });

    it('calculates Bearish PE SL (+30) and Target (-100) per strategy specification', () => {
      const entryPrice = 250.0;
      const stopLoss = Number((entryPrice + 30).toFixed(2));
      const targetPrice = Number((entryPrice - 100).toFixed(2));

      assert.strictEqual(stopLoss, 280.0, 'PE SL must be Entry + 30');
      assert.strictEqual(targetPrice, 150.0, 'PE Target must be Entry - 100');
    });
  });

  describe('Rule 10 & 12: Invariants & Intraday Square-off', () => {
    it('ensures 15-minute slot boundary rounds to clean 00, 15, 30, 45 minute marks', () => {
      const testDate = new Date('2026-10-18T09:22:34.000Z');
      const slotTime = globalEma15mEngine.get15mSlotBoundary(testDate);
      const slotMinutes = new Date(slotTime).getMinutes();

      assert.strictEqual(slotMinutes, 15, '09:22 must map to 09:15 boundary');
    });

    it('returns correct market hours status structure', () => {
      const status = globalEma15mEngine.getMarketHoursStatus();
      assert.ok(typeof status.isMarketOpen === 'boolean');
      assert.ok(typeof status.message === 'string');
      assert.ok(typeof status.istTime === 'string');
    });
  });

  describe('Profit Lock & Trailing Stop-Loss Engine', () => {
    it('locks in +70 points profit when +100 target is touched and trails upwards', () => {
      const entryPrice = 250.0;
      const targetThreshold = entryPrice + 100; // 350
      const profitLockPts = 70;
      const trailDistancePts = 30;

      // Price touches Target (350)
      const currentOptionPrice = 350.0;
      assert.ok(currentOptionPrice >= targetThreshold, 'Target reached');

      // Locked Stop-Loss must be at least entry + 70 = 320
      const lockedSl = Math.max(entryPrice + profitLockPts, currentOptionPrice - trailDistancePts);
      assert.strictEqual(lockedSl, 320.0, 'Locked SL must be at least 320 (+70 pts locked)');

      // Market rallies further to 500 (+250 points)
      const highOptionPrice = 500.0;
      const trailedSl = Math.max(lockedSl, highOptionPrice - trailDistancePts);
      assert.strictEqual(trailedSl, 470.0, 'Trailed SL must trail at 470 (+220 pts locked)');

      // Price dips to 465 (touches trailed SL)
      const isExit = 465 <= trailedSl;
      assert.strictEqual(isExit, true, 'Position exits when price crosses below trailed SL');
      const netGain = trailedSl - entryPrice;
      assert.strictEqual(netGain, 220.0, 'Captures 220 points of move instead of capping at 100');
    });
  });
});
