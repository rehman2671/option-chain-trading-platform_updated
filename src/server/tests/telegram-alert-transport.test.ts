import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTelegramSignal, sendTelegram, signalAlertTiming } from '../engine/telegramAlertTransport.js';
import type { Ema15mSignal } from '../../types.js';

const fixture: Ema15mSignal = {
  id: 'fixture', instrument: 'NIFTY', timeframe: '15m', signalType: 'BULLISH',
  price: 24150, ema23: 24120, ema50: 24095, emaDifference: 25,
  candleTimestamp: '2026-11-23T03:45:00.000Z',
  signalConfirmedAt: '2026-11-23T04:00:02.000Z',
  createdAt: '2026-11-23T04:00:02.000Z',
  selectedStrike: 24200, optionType: 'CE', weeklyExpiry: '2026-11-24'
};
const now = Date.parse('2026-11-23T04:00:04.000Z');
const token = '123456:fixture_token';
const chat = '-12345';
test('slot-start and close timing are separated in IST; no implied fill', () => {
  const t = signalAlertTiming(fixture, now);
  assert.equal(t.confirmationDelayMs, 2000);
  assert.equal(t.dispatchDelayMs, 2000);
  assert.equal(t.ageMs, 4000);
  assert.match(t.candleStart, /09:15:00 IST/);
  assert.match(t.candleClose, /09:30:00 IST/);
  const message = formatTelegramSignal(fixture, 'UPSTOX_LIVE', now);
  assert.match(message, /candle completeness not certified/);
  assert.match(message, /No order placement, fill or position is confirmed/);
  assert.doesNotMatch(message, /Trade recorded|1 Lot MIS/);
});
test('late, premature, mock and practice alerts are visibly distinguishable', () => {
  assert.match(formatTelegramSignal(fixture, 'UPSTOX_LIVE', now + 60000), /DELAYED/);
  assert.match(formatTelegramSignal(fixture, 'UPSTOX_LIVE', now - 60000), /TIMING UNVERIFIED/);
  assert.match(formatTelegramSignal(fixture, 'MOCK', now), /TEST ONLY/);
  assert.match(formatTelegramSignal(fixture, 'PRACTICE', now), /not a live market signal/);
});
test('Telegram API acceptance must include message id; response data is minimized', async () => {
  const response = new Response(JSON.stringify({ ok: true, result: { message_id: 17, date: 1795492800, chat: { id: chat }, text: 'private fixture' } }), {status:200});
  const result = await sendTelegram(token, chat, 'fixture', false, async (_url, init) => {
    assert.ok(init?.signal);
    assert.equal(init?.redirect, 'error');
    return response;
  });
  assert.equal(result.ok, true);
  assert.equal(result.messageId, 17);
  assert.doesNotMatch(JSON.stringify(result), /private fixture|fixture_token|-12345/);
  const invalid = await sendTelegram(token, chat, 'fixture', false, async () => new Response('{"ok":true}', {status:200}));
  assert.equal(invalid.ok, false);
});
test('rate limit and timeout are explicit; ambiguous delivery is not retried', async () => {
  const rate = await sendTelegram(token, chat, 'fixture', false, async () =>
    new Response(JSON.stringify({ok:false, parameters:{retry_after:12}, description:'private fixture'}), {status:429}));
  assert.equal(rate.code, 'RATE_LIMITED');
  assert.equal(rate.retryAfterSeconds, 12);
  let attempts = 0;
  const timed = await sendTelegram(token, chat, 'fixture', false, async () => {
    attempts++;
    throw new DOMException('private fixture', 'TimeoutError');
  });
  assert.equal(timed.code, 'TIMEOUT_DELIVERY_UNKNOWN');
  assert.equal(attempts, 1);
  assert.doesNotMatch(JSON.stringify(timed), /private fixture/);
  const bad = await sendTelegram('invalid', chat, 'fixture', false, async () => {
    throw Error('unexpected network call');
  });
  assert.equal(bad.code, 'CONFIG_INVALID');
});
