import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { tradeEventAlert, sessionAlerts, initMonitorClaims, claimMonitorAlert } from '../engine/telegramMonitorPolicy.js';

const now = Date.parse('2026-11-23T05:00:00Z');
const event = { id:'fixture-event', execution_id:'fixture-position', execution_mode:'PAPER',
  stage:'PAPER_ENTRY',status:'SUCCESS',instrument:'NIFTY',timestamp:new Date(now-2000).toISOString() };
const position = {id:'fixture-position',instrument:'NIFTY',strike_price:24000,option_type:'CE',
  expiry_date:'2026-11-24',entry_price:100,quantity:65,stop_loss:80,target_price:200,status:'OPEN'};
test('paper entry requires matching persisted trade, never claims broker fill', () => {
  assert.equal(tradeEventAlert(event,undefined,now),null);
  assert.equal(tradeEventAlert(event,{...position,id:'other'},now),null);
  assert.match(tradeEventAlert(event,position,now)!.text,/simulated/);
  assert.match(tradeEventAlert(event,position,now)!.text,/No broker order/);
  assert.equal(tradeEventAlert({...event,timestamp:new Date(now-121000).toISOString()},position,now),null);
  assert.equal(tradeEventAlert({...event,status:'INFO'},position,now),null);
});
test('paper exit log before DB closure does not produce a confirmed exit', () => {
  const e = {...event,stage:'PAPER_EXIT'};
  assert.equal(tradeEventAlert(e,position,now),null);
  const closed = {...position,status:'CLOSED',exit_price:120,net_pnl:1260,exit_timestamp:new Date(now-1000).toISOString()};
  const alert = tradeEventAlert(e,closed,now)!;
  assert.match(alert.text,/₹1260.00/);
  assert.equal(alert.key,'paper-exit:fixture-position');
});
test('live acknowledgement, partial exit and closed ledger are distinct', () => {
  const live = {...event,execution_mode:'LIVE',broker_order_id:'fixture-order'};
  const p = {...position,entry_broker_order_id:'fixture-order',exit_broker_order_id:'fixture-order'};
  assert.match(tradeEventAlert({...live,stage:'LIVE_ORDER_SUBMITTED'},undefined,now)!.text,/NOT A FILL/);
  assert.equal(tradeEventAlert({...live,stage:'LIVE_ORDER_FILLED'},undefined,now),null);
  assert.equal(tradeEventAlert({...live,stage:'LIVE_ORDER_FILLED'},{...p,entry_broker_order_id:'other'},now),null);
  assert.match(tradeEventAlert({...live,stage:'LIVE_ORDER_FILLED'},p,now)!.text,/recorded locally/);
  const exit = {...live,stage:'LIVE_EXIT_FILLED',status:'PENDING'};
  assert.match(tradeEventAlert(exit,{...p,status:'PARTIALLY_CLOSED',exit_filled_quantity:25,exit_price:130},now)!.text,/Exposure remains/);
  assert.equal(tradeEventAlert({...exit,status:'SUCCESS'},{...p,status:'CLOSED',exit_filled_quantity:25,exit_price:130},now),null);
  assert.match(tradeEventAlert({...exit,status:'SUCCESS'},{...p,status:'CLOSED',exit_filled_quantity:65,exit_price:130,net_pnl:1910},now)!.text,/reconciled local closure/);
});
test('dedupe claim is persisted and daily summary uses IST day boundaries and paper ledger only', () => {
  const db = new Database(':memory:');
  try {
    initMonitorClaims(db);
    assert.equal(claimMonitorAlert(db,'fixture',now),true);
    initMonitorClaims(db);
    assert.equal(claimMonitorAlert(db,'fixture',now),false);
    db.exec("CREATE TABLE ema_15m_signals(signal_confirmed_at TEXT); CREATE TABLE ema_paper_trades(status TEXT,exit_timestamp TEXT,net_pnl REAL);");
    db.prepare('INSERT INTO ema_15m_signals VALUES (?)').run('2026-11-22T18:30:00Z');
    db.prepare('INSERT INTO ema_15m_signals VALUES (?)').run('2026-11-22T18:29:59Z');
    db.prepare('INSERT INTO ema_paper_trades VALUES (?,?,?)').run('CLOSED','2026-11-23T09:00:00Z',100);
    db.prepare('INSERT INTO ema_paper_trades VALUES (?,?,?)').run('CLOSED','2026-11-22T18:29:59Z',1000);
    const a = sessionAlerts(Date.parse('2026-11-23T10:15:00Z'),'PRACTICE',db);
    assert.equal(a.length,1);
    assert.match(a[0].text,/Recorded crossovers \(all sources\): 1/);
    assert.match(a[0].text,/Paper net P&L: ₹100.00/);
    assert.match(a[0].text,/not live account P&L/);
    assert.deepEqual(sessionAlerts(Date.parse('2026-11-24T10:15:00Z'),'PRACTICE',db),[]);
    assert.match(sessionAlerts(Date.parse('2026-11-23T03:46:00Z'),'PRACTICE',db)[0].text,/actual exchange opening unverified/);
  } finally { db.close(); }
});
