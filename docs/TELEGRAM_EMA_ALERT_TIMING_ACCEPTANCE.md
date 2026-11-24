# Telegram EMA alert timing and delivery troubleshooting

This is a source-level reliability fix for the existing EMA23/50 15-minute crossover alerts, not a new trading strategy or a live NRML release. The intended close is the end of the 15-minute slot, not the start timestamp printed by the old message. Alerts are sent on new confirmed crossovers, not on every candle.

## Timing contract

- Spot sampling for NIFTY, BANKNIFTY and SENSEX is requested every 3 seconds regardless of active dashboard views; one spot poll and one snapshot poll may be in flight independently. REST underlying quote fetch has a 5-second timeout. Network/API latency, event-loop stalls, broker quotas, hosting suspension and exchange-clock accuracy can prevent this target.
- Live spot quotes must carry a valid original exchange millisecond timestamp no more than 30 seconds old, never a future or receipt-substituted timestamp. Late ticks cannot reopen closed EMA slots. Historical bars still forming at request time are excluded.
- Source mode, slot start, scheduled slot end, confirmation and dispatch times are shown in IST. Close-to-confirmation and confirmation-to-dispatch are separately measured. A message more than 30 seconds after slot end is marked delayed. The 30-second threshold is an initial diagnostic target, not a proven SLA or candle completeness certification. A delayed alert is not a fresh entry.
- Telegram requests have a bounded 5-second timeout and require a Bot API success payload with message ID; HTTP success alone is not acceptance. API acceptance does not establish delivery to a phone. Rate limits, unauthorized/forbidden, invalid config and timeouts are reported without secrets. An ambiguous timeout is not retried automatically to avoid duplicate signals. Audit records store timings and sanitized response metadata, not raw response/chat content.
- Test and mock messages are explicitly marked; practice mode is not live. A crossover is a candidate signal, not proof an option order was submitted or filled.

## Actual hosted acceptance (operator)

1. Deploy only after reviewed CI on the exact merged revision. Use the existing Google AI Studio application workflow; do not change real account positions or enable new broker routes.
2. Check the app's provider/streamer status and server logs. Ensure the intended Telegram toggle, bot token and chat ID are saved in the global settings or authorized runtime secrets; do not paste credentials into chat or GitHub. In settings, save first, then send a test Telegram message. Confirm that the test reaches the intended chat. The test response reports Telegram acceptance time or failure code. If a private chat is used, first start the bot; if a channel is used, confirm the bot has permission to post.
3. In a broker-disabled isolated practice workspace, verify mock and practice labels. Never use a mock alert to infer actual market performance.
4. On an authorized read-only market-data session, compare at least several actual closed 15-minute candles against a trusted contemporaneous provider, including all three symbols and a closed-dashboard interval. Record timestamps and EMA seed/warm-up conventions; do not force a synthetic crossover in a live workspace. Verify the last actual quote timestamp, candle completeness, actual crossing, selected contract eligibility and receipt time. Match the correct instrument/timeframe; do not equate price movement with a crossover.
5. Compare close→confirmation, confirmation→dispatch and dispatch→Telegram API acknowledgement (audit log `payload.transport.elapsedMs`). Check the Telegram client's actual arrival separately. Record per-stage p50/p95, missed/duplicate crossovers and failures using sanitized timestamps only.
6. If alerts stop while nobody uses the UI, verify actual Google AI Studio hosted instance lifecycle, background CPU scheduling and process restarts. A browser or polling timer is not proof of an always-running market watcher. Do not rely on a sleeping instance for unattended live execution. No hosting configuration is altered by this patch.

Still unresolved: actual hosted log access, original candle completeness and source consistency after restart, vendor/market evidence, always-running deployment, durable event recovery after shutdown, and confirmed device delivery. No profitability or NRML release claim is made.
