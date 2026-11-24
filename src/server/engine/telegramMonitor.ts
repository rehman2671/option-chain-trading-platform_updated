import { dbEngine } from '../db.js';
import { globalMarketFeed } from './marketFeed.js';
import { activeProvider } from './providers/index.js';
import { SessionCalendar } from './ema15m/sessionCalendar.js';
import { freshExchangeTick } from './ema15m/alertTickClock.js';
import { sendTelegram } from './telegramAlertTransport.js';
import { claimMonitorAlert, initMonitorClaims, sessionAlerts, tradeEventAlert, type MonitorAlert } from './telegramMonitorPolicy.js';

type Row = Record<string, unknown>;
const stages = ['PAPER_ENTRY','PAPER_EXIT','PAPER_STOP_LOSS','FORCED_SQUARE_OFF',
  'LIVE_ORDER_FILLED','LIVE_EXIT_FILLED','LIVE_ORDER_SUBMITTED','LIVE_EXIT_SUBMITTED',
  'LIVE_EXIT_FAILED','LIVE_ORDER_REJECTED','LIVE_PRE_TRADE_CHECK'];
const symbols = ['NIFTY','BANKNIFTY','SENSEX'];
let timer: ReturnType<typeof setInterval> | undefined;
let busy = false;
let startedAt = 0;
let lastPollAt: string | null = null;
let lastOutcome = 'NOT_STARTED';
let previousFeed: string | null = null;
let candidateFeed: string | null = null;
let candidateSince = 0;

function currentFeed(now: number): string {
  if (activeProvider.getProviderMode() !== 'LIVE') return 'PRACTICE — no live-feed claim';
  const clocks = globalMarketFeed.getVerifiedSpotClock();
  const stale = symbols.filter(s => !freshExchangeTick(clocks[s] ?? NaN, now));
  return stale.length ? 'LIVE mode — missing/stale exchange quotes: '+stale.join(', ') :
    'LIVE mode — recent exchange timestamps for all 3 indices (candle completeness not certified)';
}

async function poll(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    lastPollAt = new Date(now).toISOString();
    const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
    const token = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;
    if (!settings.telegramEnabled || !token?.trim() || !chatId?.trim()) {
      lastOutcome = 'TELEGRAM_DISABLED_OR_UNCONFIGURED';
      // No replay of old events if notifications are subsequently enabled.
      startedAt = now;
      previousFeed = candidateFeed = null;
      return;
    }
    const db = dbEngine.getRawDatabase();
    const alerts: MonitorAlert[] = [];
    const feed = currentFeed(now);
    const localSession = SessionCalendar.isExchangeOpen(new Date(now));
    if (localSession.isOpen && SessionCalendar.toIstDate(new Date(now)).year === 2026) {
      if (candidateFeed !== feed) { candidateFeed = feed; candidateSince = now; }
      // Require a stable observation for 30s and suppress repeated same-state flapping in a 5m bucket.
      if (now-candidateSince>=30_000 && previousFeed!==feed) {
        const clocks = globalMarketFeed.getVerifiedSpotClock();
        const freshMask = symbols.map(s => freshExchangeTick(clocks[s] ?? NaN, now)?'1':'0').join('');
        const mode = activeProvider.getProviderMode() === 'LIVE' ? 'LIVE' : 'PRACTICE';
        alerts.push({key:'feed:'+Math.floor(now/300000)+':'+mode+':'+freshMask,
          text:'MARKET FEED STATUS\n'+feed+'\nObserved: '+new Date(now).toISOString()+
            '\nThis is feed health, not a trade signal or exchange-session confirmation.'});
        previousFeed = feed;
      }
    } else { previousFeed = candidateFeed = null; }
    alerts.push(...sessionAlerts(now,feed,db));
    const cutoff = new Date(Math.max(startedAt,now-120000)).toISOString();
    const events = db.prepare('SELECT id,execution_id,execution_mode,stage,status,instrument,broker_order_id,timestamp FROM ema_execution_events WHERE timestamp>=? AND timestamp<=? AND stage IN ('+stages.map(()=>'?').join(',')+') ORDER BY timestamp ASC,id ASC LIMIT 200')
      .all(cutoff,new Date(now).toISOString(),...stages) as Row[];
    for (const e of events) {
      let position: Row | undefined;
      if (typeof e.execution_id === 'string') {
        if (e.execution_mode === 'PAPER') position = db.prepare('SELECT id,instrument,strike_price,option_type,expiry_date,entry_price,quantity,stop_loss,target_price,status,exit_price,exit_timestamp,net_pnl FROM ema_paper_trades WHERE id=?').get(e.execution_id) as Row | undefined;
        if (e.execution_mode === 'LIVE') position = db.prepare('SELECT id,instrument,strike_price,option_type,expiry_date,entry_price,quantity,status,entry_broker_order_id,exit_broker_order_id,exit_filled_quantity,exit_price,net_pnl FROM ema_live_positions WHERE id=?').get(e.execution_id) as Row | undefined;
      }
      const alert = tradeEventAlert(e,position,now);
      if (alert) alerts.push(alert);
    }
    // Local trailing state is an observed protection setting, not a native broker stop or realised gain.
    for (const [mode,table] of [['PAPER','ema_paper_trades'],['LIVE','ema_live_positions']] as const) {
      const positions = db.prepare('SELECT id,instrument,trailing_stop_loss,entry_price FROM '+table+" WHERE status='OPEN' AND is_trailing_active=1 AND trailing_stop_loss>0 LIMIT 100").all() as Row[];
      for (const p of positions) {
        if (typeof p.id!=='string'||!symbols.includes(String(p.instrument))||
            typeof p.trailing_stop_loss!=='number'||!Number.isFinite(p.trailing_stop_loss)) continue;
        alerts.push({key:'trailing:'+mode+':'+p.id,text:mode+' PROFIT PROTECTION — local trailing active\n'+p.instrument+
          '\nCurrent local trailing threshold: ₹'+p.trailing_stop_loss.toFixed(2)+
          '\nNot a broker-native stop acknowledgement or guaranteed exit price.'});
      }
    }
    let attempts = 0;
    for (const alert of alerts) {
      if (attempts>=5) break;
      // Never send expired event snapshots after a long preceding network request.
      if (Date.now()-now>30_000) break;
      if (!claimMonitorAlert(db,alert.key,Date.now())) continue;
      attempts++;
      const result = await sendTelegram(token,chatId,alert.text);
      lastOutcome = result.code;
      db.prepare('UPDATE telegram_monitor_claims SET outcome=?,elapsed_ms=? WHERE key=?').run(result.code,result.elapsedMs,alert.key);
      // Avoid hammering Telegram when config/transport fails or Telegram rate-limits.
      if (!result.ok) break;
    }
  } catch {
    lastOutcome = 'MONITOR_POLL_FAILED';
    console.warn('[TELEGRAM MONITOR] polling failed; trading execution unaffected');
  } finally { busy = false; }
}

export function startTelegramMonitor(): void {
  if (timer || process.env.TELEGRAM_MONITORING_ENABLED !== '1' ||
      process.env.NODE_ENV === 'test' || process.env.PAPER_STAGING_MODE === '1' ||
      process.env.PAPER_RC_LOCKED === '1') return;
  try {
    initMonitorClaims(dbEngine.getRawDatabase());
    startedAt = Date.now();
    lastOutcome = 'READY';
    timer = setInterval(()=>{void poll();},5000);
    timer.unref?.();
  } catch { lastOutcome = 'MONITOR_START_FAILED'; }
}

export function getTelegramMonitorStatus() {
  const now = Date.now();
  const clocks = globalMarketFeed.getVerifiedSpotClock();
  return { enabled:process.env.TELEGRAM_MONITORING_ENABLED==='1',
    running:Boolean(timer), lastPollAt, lastOutcome, feed:currentFeed(now),
    exchangeQuoteAgeMs:Object.fromEntries(symbols.map(s=>[s,clocks[s]===null?null:Math.max(0,now-Number(clocks[s]))])),
    deviceDeliveryConfirmed:false, liveTradingAuthorized:false };
}
