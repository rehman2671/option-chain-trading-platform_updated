/** Live quote timestamps are epoch milliseconds, not receipt time. */
export function freshExchangeTick(exchangeMs: number, now = Date.now()): boolean {
  return Number.isSafeInteger(exchangeMs) && Number.isFinite(now) &&
    exchangeMs > 0 && exchangeMs <= now && now - exchangeMs <= 30_000;
}
export const EMA_SLOT_MS = 15 * 60 * 1000;
export function emaSlotStart(ms: number): number {
  return Math.floor(ms / EMA_SLOT_MS) * EMA_SLOT_MS;
}
export function historicalSlotIsClosed(timestamp: string, requestedAt: number): boolean {
  const start = Date.parse(timestamp);
  return Number.isFinite(start) && Number.isFinite(requestedAt) &&
    start + EMA_SLOT_MS <= requestedAt;
}
export function canIngestEmaTick(eventMs: number, now: number,
  lastTickMs: number | undefined, latestClosedSlot: string | undefined): boolean {
  if (!Number.isFinite(eventMs) || eventMs > now || (lastTickMs !== undefined && eventMs < lastTickMs)) return false;
  const closed = latestClosedSlot === undefined ? NaN : Date.parse(latestClosedSlot);
  return !Number.isFinite(closed) || emaSlotStart(eventMs) > closed;
}
