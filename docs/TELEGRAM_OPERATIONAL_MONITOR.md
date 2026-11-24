# Telegram operational and trade-event alerts

The existing 15-minute crossover alert remains separate and is not an order confirmation.
This optional monitor reads already persisted EMA execution events and paper/live ledgers.
It does not submit, cancel or modify any broker order, enable NRML, modify strategy settings,
or change stop/target/holding logic.

## Enable in the existing Google AI Studio deployment

After this revision has passed CI and been merged/deployed, set the runtime variable
`TELEGRAM_MONITORING_ENABLED=1` in the existing application environment. Keep
the existing GLOBAL Telegram toggle enabled and use the approved bot/chat settings
or runtime secrets. Do not expose credentials or account data. The destination must be
authorized to receive account/trade information. Default is off; the locked paper-staging
RC and test runtime never start the worker. Existing crossover alerts are unchanged.

The monitor polls every 5 seconds when the process actually runs. It has no guarantee of
execution while the hosting instance is suspended, scaled to zero or unavailable.

## Notification categories

- Scheduled opening window (09:15–09:25 IST on the existing 2026 regular-session calendar).
  This is not official exchange confirmation. Special sessions and future revised calendars
  need separate authenticated calendar updates (#18).
- Feed health: recent verified exchange clocks per NIFTY/BANKNIFTY/SENSEX, stale/missing
  clocks, or PRACTICE; a 30-second stable observation and per-state five-minute deduplication.
- Existing crossover: confirmed signal and timing/source as in PR #142.
- Paper entry/exit: event plus matching persisted trade; explicitly simulated.
- Live entry/exit: matching local broker-order identity and persisted ledger evidence.
  Acknowledgement, partial exit and recorded closure are distinct; this is not independent
  current broker verification. An order ACK is never a fill.
- Profit protection: first observed active local trailing threshold for each open paper/live
  position, not broker-native stop acknowledgement or a guaranteed realised profit.
- Daily ledger summary (15:40–16:00 IST, same local calendar): recorded crossovers, paper
  closures and paper net P&L for IST day boundaries, not live account P&L.

## Delivery semantics and diagnostics

The SQLite telegram_monitor_claims table claims each alert key before sending, suppressing
repeat attempts on the same shared database even after a restart. Recent trade events only
(two minutes maximum at collection, never older than monitor startup); no old signal replay.
There is no exactly-once guarantee: a crash between claim and API send can lose an alert,
and an ambiguous timeout is deliberately not retried. A successful Bot API response is not
device delivery. Rate limits/transport failures cause a cooldown. There is no automatic
backfill of missed historical alerts, no independent hosted liveness guarantee, and no
multi-instance durability guarantee if separate/ephemeral SQLite databases are used.

Authenticated SUPERADMIN GET /api/ema15m/telegram-monitor-status reports running status,
last poll time, sanitized last outcome, cooldown and quote age per index. No bot token,
chat ID or broker account ID is returned. Review actual app logs and this endpoint before
interpreting missing messages as a lack of market signals.

Hosted acceptance: save existing Telegram settings and send the explicit connectivity test;
verify device receipt. Enable monitoring on the approved instance; verify status endpoint,
scheduled notifications and read-only live clocks. Use a separate non-RC PRACTICE workspace
with a test bot to validate paper ledger messages and simulated trailing state; never force
live trades for notification testing. Compare each notification against authoritative ledger
state and trusted broker/market data. Check runtime continuity with dashboard closed.
No broker execution or profitability approval is implied.
