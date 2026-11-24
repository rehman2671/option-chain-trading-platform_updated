import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshExchangeTick, emaSlotStart, historicalSlotIsClosed, canIngestEmaTick } from '../engine/ema15m/alertTickClock.js';

const slot = Date.parse('2026-11-23T04:00:00.000Z');
test('live quote clock rejects missing, receipt-substituted ancient and future exchange times', () => {
  assert.equal(freshExchangeTick(slot - 30_000, slot), true);
  assert.equal(freshExchangeTick(slot - 30_001, slot), false);
  assert.equal(freshExchangeTick(slot + 1, slot), false);
  for (const invalid of [0, NaN, Infinity, slot / 1000]) assert.equal(freshExchangeTick(invalid, slot), false);
});
test('out-of-order ticks cannot reopen a finalized slot or roll back the forming close', () => {
  const lastClosed = new Date(slot - 15 * 60_000).toISOString();
  assert.equal(emaSlotStart(slot - 1), slot - 15 * 60_000);
  assert.equal(canIngestEmaTick(slot - 1, slot + 1000, undefined, lastClosed), false);
  assert.equal(canIngestEmaTick(slot + 10, slot + 1000, slot + 20, lastClosed), false);
  assert.equal(canIngestEmaTick(slot + 20, slot + 1000, slot + 10, lastClosed), true);
  assert.equal(canIngestEmaTick(slot + 1001, slot + 1000, undefined, lastClosed), false);
});
test('historical history response may include a still-forming bar; use request time cutoff', () => {
  assert.equal(historicalSlotIsClosed(new Date(slot).toISOString(), slot + 14 * 60_000), false);
  assert.equal(historicalSlotIsClosed(new Date(slot).toISOString(), slot + 15 * 60_000), true);
  assert.equal(historicalSlotIsClosed('invalid', slot), false);
});
