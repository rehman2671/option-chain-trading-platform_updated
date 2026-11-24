import type Database from 'better-sqlite3';
import { SessionCalendar } from './ema15m/sessionCalendar.js';

export type MonitorAlert = { key: string; text: string };
type Row = Record<string, unknown>;
const money = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? '₹' + v.toFixed(2) : 'unknown';
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const qty = (v: unknown) => positive(v) && Number.isSafeInteger(v) ? String(v) : 'unknown';
const instrument = (v: unknown) => ['NIFTY','BANKNIFTY','SENSEX'].includes(String(v)) ? String(v) : 'Unknown instrument';
const when = (ms: number) => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'}).format(ms)+' IST';
const formatContract = (p: Row) => instrument(p.instrument) + ' ' + (positive(p.strike_price) ? String(p.strike_price) : '?') +
  ' ' + (p.option_type === 'CE' || p.option_type === 'PE' ? p.option_type : '?') +
  ' | expiry ' + (/^\d{4}-\d{2}-\d{2}$/.test(String(p.expiry_date)) ? p.expiry_date : 'unknown');

/** Never infer a fill from an event alone. Compare durable position identity and current ledger. */
export function tradeEventAlert(e: Row, p: Row | undefined, now: number): MonitorAlert | null {
  const id = typeof e.id === 'string' ? e.id : '';
  const time = Date.parse(String(e.timestamp));
  if (!id || !Number.isFinite(time) || time > now || now-time > 120_000) return null;
  const make = (title: string, detail: string, key = 'event:'+id): MonitorAlert =>
    ({key,text:title+'\n'+detail+'\nEvent recorded: '+when(time)});
  if (e.execution_mode === 'PAPER' && e.status === 'SUCCESS' && p &&
      p.id === e.execution_id && p.instrument === e.instrument) {
    if (e.stage === 'PAPER_ENTRY' && positive(p.entry_price) && positive(p.quantity) &&
        ['OPEN','CLOSED'].includes(String(p.status))) {
      return make('📝 PAPER ENTRY — simulated',formatContract(p)+'\nRecorded entry: '+money(p.entry_price)+' | Qty: '+qty(p.quantity)+
        '\nStop: '+money(p.stop_loss)+' | Target: '+money(p.target_price)+'\nCurrent ledger: '+p.status+'\nNo broker order.', 'paper-entry:'+p.id);
    }
    if (['PAPER_EXIT','PAPER_STOP_LOSS','FORCED_SQUARE_OFF'].includes(String(e.stage)) &&
        p.status === 'CLOSED' && positive(p.exit_price) && Date.parse(String(p.exit_timestamp)) >= time-120_000) {
      return make('📝 PAPER EXIT — simulated',formatContract(p)+'\nExit: '+money(p.exit_price)+' | Net paper P&L: '+money(p.net_pnl)+
        '\nNo broker fill.', 'paper-exit:'+p.id);
    }
  }
  if (e.execution_mode !== 'LIVE') return null;
  if (e.stage === 'LIVE_ORDER_FILLED' && e.status === 'SUCCESS' && p &&
      p.id === e.execution_id && p.instrument === e.instrument && e.broker_order_id &&
      p.entry_broker_order_id === e.broker_order_id && positive(p.entry_price) && positive(p.quantity)) {
    return make('LIVE ENTRY — broker fill recorded locally',formatContract(p)+'\nRecorded entry: '+money(p.entry_price)+' | Qty: '+qty(p.quantity)+
      '\nCurrent local ledger: '+p.status+'\nCheck broker for current exposure.', 'live-entry:'+p.id);
  }
  if (e.stage === 'LIVE_EXIT_FILLED' && p && p.id === e.execution_id && p.instrument === e.instrument &&
      e.broker_order_id && p.exit_broker_order_id === e.broker_order_id &&
      positive(p.exit_filled_quantity) && positive(p.exit_price) && positive(p.quantity) &&
      Number(p.exit_filled_quantity) <= Number(p.quantity)) {
    const closed = p.status === 'CLOSED' && p.exit_filled_quantity === p.quantity;
    const partial = p.status === 'PARTIALLY_CLOSED' && Number(p.exit_filled_quantity) < Number(p.quantity);
    if ((closed && e.status === 'SUCCESS') || (partial && e.status === 'PENDING')) {
      return make(closed?'LIVE EXIT — reconciled local closure':'LIVE EXIT — partial fill recorded locally',
        formatContract(p)+'\nCumulative exit qty: '+qty(p.exit_filled_quantity)+' / '+qty(p.quantity)+
        '\nRecorded exit price: '+money(p.exit_price)+(closed?'\nRecorded net P&L: '+money(p.net_pnl):'\nExposure remains; do not assume closed.')+
        '\nVerify broker state.', 'live-exit:'+p.id+':'+p.exit_filled_quantity);
    }
  }
  if ((e.stage === 'LIVE_ORDER_SUBMITTED' && e.status === 'SUCCESS' && e.broker_order_id) ||
      (e.stage === 'LIVE_EXIT_SUBMITTED' && e.status === 'PENDING' && e.broker_order_id)) {
    return make('LIVE ORDER ACK — NOT A FILL',instrument(e.instrument)+'\n'+(e.stage==='LIVE_EXIT_SUBMITTED'?'SELL':'BUY')+
      ' acknowledged in local event ledger. Fill and current exposure unverified.');
  }
  if (['LIVE_EXIT_FAILED','LIVE_ORDER_REJECTED','LIVE_PRE_TRADE_CHECK'].includes(String(e.stage)) &&
      ['FAILED','REJECTED','PENDING'].includes(String(e.status))) {
    return make('⚠️ LIVE EXECUTION — review required',instrument(e.instrument)+'\nStage: '+e.stage+
      '\nRecorded status: '+e.status+'\nNo closure or safe retry inferred. Check broker.');
  }
  return null;
}

export function sessionAlerts(now: number, feed: string, db: Database.Database): MonitorAlert[] {
  const d = SessionCalendar.toIstDate(new Date(now));
  // Existing calendar is incomplete; do not represent it as exchange certification.
  if (d.year !== 2026 || !SessionCalendar.isTradingDay(new Date(now))) return [];
  const minute = d.hours*60+d.minutes;
  const results: MonitorAlert[] = [];
  if (minute>=555 && minute<565) {
    results.push({key:'session-open:'+d.dateStr,text:'MARKET MONITOR — scheduled opening window\n'+d.dateStr+' | '+feed+
      '\nLocal regular-session calendar only; actual exchange opening unverified.'});
  }
  if (minute>=940 && minute<960) {
    const start = Date.parse(d.dateStr+'T00:00:00+05:30');
    const from = new Date(start).toISOString(), to = new Date(start+86400000).toISOString();
    const count = db.prepare('SELECT count(*) AS n FROM ema_15m_signals WHERE julianday(signal_confirmed_at)>=julianday(?) AND julianday(signal_confirmed_at)<julianday(?)').get(from,to) as {n:number};
    const paper = db.prepare("SELECT count(*) AS n, count(net_pnl) AS valued, sum(net_pnl) AS net FROM ema_paper_trades WHERE status='CLOSED' AND julianday(exit_timestamp)>=julianday(?) AND julianday(exit_timestamp)<julianday(?)").get(from,to) as {n:number;valued:number;net:number|null};
    results.push({key:'session-summary:'+d.dateStr,text:'DAILY EMA LEDGER SUMMARY — '+d.dateStr+' IST\n'+
      'Recorded crossovers (all sources): '+count.n+'\nPaper closures: '+paper.n+'\nPaper net P&L: '+
      (paper.n===0?'₹0.00':paper.n===paper.valued?money(paper.net):'incomplete')+
      '\n'+feed+'\nLocal ledger only; not live account P&L or exchange-certified session completeness.'});
  }
  return results;
}

/** Claim before network I/O: at-most-one attempt per key on the same durable SQLite database. */
export function initMonitorClaims(db: Database.Database) {
  db.exec("CREATE TABLE IF NOT EXISTS telegram_monitor_claims (key TEXT PRIMARY KEY, attempted_at TEXT NOT NULL, outcome TEXT NOT NULL, elapsed_ms INTEGER)");
}
export function claimMonitorAlert(db: Database.Database, key: string, now: number): boolean {
  return db.prepare("INSERT OR IGNORE INTO telegram_monitor_claims (key,attempted_at,outcome) VALUES (?,?,'ATTEMPT_STARTED')").run(key,new Date(now).toISOString()).changes===1;
}
