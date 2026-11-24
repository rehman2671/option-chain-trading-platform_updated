import type Database from 'better-sqlite3';

type SignalIdentity = { id: string; instrument: string; candleTimestamp: string };
type PaperOutcome = { status: 'FILLED_SIMULATED' | 'HELD' | 'FAILED'; message: string };

/** A successful paper mutation and its replay claim commit together. No network
 * or async callback is permitted inside this SQLite transaction. */
export function executePaperSignalOnce<T extends PaperOutcome>(
  db: Database.Database, signal: SignalIdentity, execute: () => T
): T | PaperOutcome {
  const ms=Date.parse(signal.candleTimestamp);
  if (!signal.id || !['NIFTY','BANKNIFTY','SENSEX'].includes(signal.instrument) || !Number.isFinite(ms))
    return {status:'FAILED',message:'Invalid paper signal identity'};
  const slot=Math.floor(ms/900000)*900000;
  let failure:T|undefined;
  try {
    return db.transaction(()=>{
      db.exec(`CREATE TABLE IF NOT EXISTS ema_paper_signal_claims (
        signal_id TEXT PRIMARY KEY, instrument TEXT NOT NULL, slot_ms INTEGER NOT NULL,
        UNIQUE(instrument,slot_ms)
      )`);
      // Historical rows can predate the replay ledger. Check before reversal.
      const previous=db.prepare('SELECT id FROM ema_paper_trades WHERE signal_id=? LIMIT 1').get(signal.id);
      const old=db.prepare('SELECT signal_id FROM ema_paper_signal_claims WHERE signal_id=? OR (instrument=? AND slot_ms>=?) LIMIT 1').get(signal.id,signal.instrument,slot);
      if(previous||old)return {status:'HELD',message:'Duplicate or out-of-order paper signal suppressed'} as PaperOutcome;
      db.prepare('INSERT INTO ema_paper_signal_claims(signal_id,instrument,slot_ms) VALUES(?,?,?)').run(signal.id,signal.instrument,slot);
      const result=execute();
      if(result.status==='FAILED'){failure=result;throw Error('PAPER_SIGNAL_TRANSACTION_FAILED');}
      if(!['HELD','FILLED_SIMULATED'].includes(result.status))throw Error('INVALID_PAPER_SIGNAL_OUTCOME');
      return result;
    }).immediate();
  }catch{
    return failure||{status:'FAILED',message:'Paper signal transaction not committed'};
  }
}
