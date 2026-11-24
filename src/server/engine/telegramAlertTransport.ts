import type { Ema15mSignal } from '../../types.js';

export type TelegramSignalSource = 'UPSTOX_LIVE' | 'PRACTICE' | 'LIVE_DATA_UNAVAILABLE' | 'MOCK' | 'UNKNOWN';
export type TelegramResult = {
  ok: boolean; code: string; elapsedMs: number; acknowledgedAt: string;
  messageId?: number; telegramDate?: string; retryAfterSeconds?: number;
  httpStatus?: number;
};
const ist = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium'
});
function formatTime(ms: number): string {
  return Number.isFinite(ms) ? ist.format(ms) + ' IST' : 'Unknown';
}
export function signalAlertTiming(signal: Ema15mSignal, now = Date.now()) {
  const start = Date.parse(signal.candleTimestamp);
  const close = start + 15 * 60 * 1000;
  const confirmed = Date.parse(signal.signalConfirmedAt);
  const confirmationDelayMs = Number.isFinite(close) && Number.isFinite(confirmed) && confirmed >= close
    ? confirmed - close : null;
  const dispatchDelayMs = Number.isFinite(confirmed) && now >= confirmed ? now - confirmed : null;
  const ageMs = Number.isFinite(close) && now >= close ? now - close : null;
  return { candleStart: formatTime(start), candleClose: formatTime(close),
    confirmedAt: formatTime(confirmed), dispatchAt: formatTime(now),
    confirmationDelayMs, dispatchDelayMs, ageMs,
    delayed: ageMs !== null && ageMs > 30_000,
    invalidTiming: ageMs === null || confirmationDelayMs === null || dispatchDelayMs === null };
}
export function formatTelegramSignal(signal: Ema15mSignal, source: TelegramSignalSource, now = Date.now()): string {
  const t = signalAlertTiming(signal, now);
  const test = source === 'MOCK';
  const direction = signal.signalType === 'BULLISH' ? 'BULLISH (23 EMA > 50 EMA)' : 'BEARISH (23 EMA < 50 EMA)';
  const timing = t.invalidTiming ? 'TIMING UNVERIFIED' : t.delayed ? 'DELAYED — historical signal, not a fresh entry' : 'Freshness target met (≤30s from slot end)';
  const label = source === 'UPSTOX_LIVE' ? 'Upstox feed mode (candle completeness not certified)' :
    source === 'PRACTICE' ? 'PRACTICE / simulated — not a live market signal' :
    test ? 'MOCK / TEST — not a trading signal' : 'Live source unavailable or unverified';
  return [
    test ? '🧪 MOCK EMA CROSSOVER — TEST ONLY' : '15-MINUTE EMA 23/50 CROSSOVER',
    label, timing, '',
    'Instrument: ' + signal.instrument, 'Direction: ' + direction,
    'Spot close: ₹' + signal.price.toFixed(2),
    'EMA23: ' + signal.ema23.toFixed(2) + ' | EMA50: ' + signal.ema50.toFixed(2),
    ...(signal.selectedStrike && signal.optionType ? [
      'Candidate: ' + signal.selectedStrike + ' ' + signal.optionType,
      'Candidate expiry: ' + (signal.weeklyExpiry || 'Unverified')
    ] : []),
    '', 'Candle slot start: ' + t.candleStart,
    'Scheduled 15m slot end: ' + t.candleClose,
    'Signal confirmed: ' + t.confirmedAt,
    'Dispatch started: ' + t.dispatchAt,
    'Close → confirmation: ' + (t.confirmationDelayMs === null ? 'Unknown' : (t.confirmationDelayMs / 1000).toFixed(1) + 's'),
    'Confirmation → dispatch: ' + (t.dispatchDelayMs === null ? 'Unknown' : (t.dispatchDelayMs / 1000).toFixed(1) + 's'),
    '', 'Signal only. No order placement, fill or position is confirmed by this alert.'
  ].join('\n');
}

/** Bound the API request and response body; never expose raw Telegram responses or token-bearing URLs. */
export async function sendTelegram(
  token: string, chatId: string, text: string, html = false,
  request: typeof fetch = fetch, timeoutMs = 5000
): Promise<TelegramResult> {
  const start = Date.now();
  const finish = (ok: boolean, code: string, extras: Partial<TelegramResult> = {}): TelegramResult =>
    ({ ok, code, elapsedMs: Math.max(0, Date.now() - start), acknowledgedAt: new Date().toISOString(), ...extras });
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token.trim()) || !/^(?:-?\d+|@[A-Za-z0-9_]+)$/.test(chatId.trim())) {
    return finish(false, 'CONFIG_INVALID');
  }
  try {
    const response = await request('https://api.telegram.org/bot' + token.trim() + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ chat_id: chatId.trim(), text, ...(html ? { parse_mode: 'HTML' } : {}), disable_web_page_preview: true })
    });
    const body = await response.json() as any;
    const extras: Partial<TelegramResult> = { httpStatus: response.status };
    if (response.ok && body?.ok === true && Number.isSafeInteger(body.result?.message_id)) {
      extras.messageId = body.result.message_id;
      if (Number.isSafeInteger(body.result.date) && body.result.date > 0 && body.result.date < 8_640_000_000_000) {
        extras.telegramDate = new Date(body.result.date * 1000).toISOString();
      }
      return finish(true, 'TELEGRAM_ACCEPTED', extras);
    }
    const retry = body?.parameters?.retry_after;
    if (response.status === 429 && Number.isSafeInteger(retry) && retry >= 0) extras.retryAfterSeconds = retry;
    return finish(false, response.status === 429 ? 'RATE_LIMITED' :
      response.status === 401 ? 'BOT_UNAUTHORIZED' : response.status === 403 ? 'BOT_FORBIDDEN' :
      response.status === 400 ? 'BAD_REQUEST' : 'TELEGRAM_REJECTED', extras);
  } catch (err: unknown) {
    // A timeout can occur after acceptance. Never blindly retry an ambiguous send.
    const name = err instanceof Error ? err.name : '';
    return finish(false, name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT_DELIVERY_UNKNOWN' : 'NETWORK_OR_RESPONSE_ERROR');
  }
}
