/**
 * Auto-Indexed Native File-Backed Database Engine & Migration Manager
 * Powered by better-sqlite3 with Write-Ahead Logging (WAL) mode for crash resilience.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseSchemaInfo, DatabaseMigrationStatus, BasketOrderRecord, PaperPosition, OIAnomaly, User, Ema15mCandle, Ema15mSignal, EmaNotificationLog, EmaNotificationSettings, EmaPaperTrade, EmaPaperTradingSummary } from '../types.js';

export interface MigrationReport {
  engine: string;
  walModeEnabled: boolean;
  recoveredRows: Record<string, number>;
  corruptBackups: Array<{ path: string; size: number }>;
  incrementalWritesConfirmed: boolean;
}

class DatabaseEngine {
  private db: Database.Database | null = null;
  private isInitialized = false;
  private dbFilePath = path.join(process.cwd(), 'option_platform.sqlite');
  private isRecovering = false;
  private walCheckpointTimer: NodeJS.Timeout | null = null;

  public migrationReport: MigrationReport = {
    engine: 'better-sqlite3',
    walModeEnabled: false,
    recoveredRows: {},
    corruptBackups: [],
    incrementalWritesConfirmed: true
  };

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Audit and preserve legacy corrupt backup files
    this.auditLegacyBackups();

    // 2. Open / Create native SQLite database file with better-sqlite3
    try {
      this.db = new Database(this.dbFilePath);

      // 3. Enable WAL mode, busy timeout, and normal synchronous flag for transactional crash resilience
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('busy_timeout = 5000');
      this.db.pragma('wal_autocheckpoint = 1000');
      this.migrationReport.walModeEnabled = true;

      // 4. Run deep integrity check to detect corrupt b-tree pages early
      this.verifyDatabaseIntegrity();

      // 5. Run schema migrations and indexes
      this.runMigrations();
      this.ensureAutoIndexes();

      // 6. Gather row counts for recovery report
      const counts = this.getTableRowCounts();
      this.migrationReport.recoveredRows = counts;

      // Register graceful shutdown and periodic background WAL compaction
      this.registerGracefulShutdown();
      this.startWalCompactor();

      this.isInitialized = true;
      console.log('DatabaseEngine (better-sqlite3): SQLite database initialized in WAL mode with transactional disk persistence.');
      console.log('DatabaseEngine Recovery Summary:', JSON.stringify(this.migrationReport));
    } catch (err: any) {
      console.warn('[DB INITIALIZE NOTICE] Database integrity issue detected, initiating safe salvaging & recovery:', err?.message || err);
      this.salvageAndResetDatabase();
    }
  }

  private verifyDatabaseIntegrity(): void {
    if (!this.db) throw new Error('Database handle is null');
    const integrity = this.db.pragma('quick_check') as Array<Record<string, any>>;
    const firstVal = integrity && integrity[0] ? Object.values(integrity[0])[0] : null;
    if (firstVal !== 'ok') {
      throw new Error(`Integrity check failed: ${JSON.stringify(integrity)}`);
    }
  }

  private isCorruptionError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    const code = String(err.code || '');
    return msg.includes('malformed') || msg.includes('corrupt') || msg.includes('disk i/o error') || code === 'SQLITE_CORRUPT';
  }

  private handleRuntimeCorruption(err: any): void {
    if (this.isCorruptionError(err) && !this.isRecovering) {
      console.error('[DB ENGINE FATAL] Runtime SQLite corruption detected. Running emergency auto-recovery...', err);
      this.salvageAndResetDatabase();
    }
  }

  private salvageAndResetDatabase(): void {
    if (this.isRecovering) return;
    this.isRecovering = true;

    console.log('[DB RECOVERY] Commencing database salvage and reset operation...');

    // 1. Attempt to salvage intact records from readable tables before resetting
    const salvagedData: {
      users: any[];
      paperPositions: any[];
      basketOrders: any[];
      autonomousStrategies: any[];
      autonomousLogs: any[];
    } = {
      users: [],
      paperPositions: [],
      basketOrders: [],
      autonomousStrategies: [],
      autonomousLogs: []
    };

    if (this.db) {
      try {
        salvagedData.users = this.db.prepare(`SELECT * FROM users`).all() || [];
        console.log(`[DB RECOVERY] Salvaged ${salvagedData.users.length} user records.`);
      } catch (e) {
        console.warn('[DB RECOVERY] Could not salvage users table:', (e as any)?.message);
      }

      try {
        salvagedData.paperPositions = this.db.prepare(`SELECT * FROM paper_positions`).all() || [];
        console.log(`[DB RECOVERY] Salvaged ${salvagedData.paperPositions.length} paper position records.`);
      } catch (e) {
        console.warn('[DB RECOVERY] Could not salvage paper_positions table:', (e as any)?.message);
      }

      try {
        salvagedData.basketOrders = this.db.prepare(`SELECT * FROM basket_orders`).all() || [];
        console.log(`[DB RECOVERY] Salvaged ${salvagedData.basketOrders.length} basket order records.`);
      } catch (e) {
        console.warn('[DB RECOVERY] Could not salvage basket_orders table:', (e as any)?.message);
      }

      try {
        salvagedData.autonomousStrategies = this.db.prepare(`SELECT * FROM autonomous_strategies`).all() || [];
        console.log(`[DB RECOVERY] Salvaged ${salvagedData.autonomousStrategies.length} autonomous strategies.`);
      } catch (e) {
        console.warn('[DB RECOVERY] Could not salvage autonomous_strategies table:', (e as any)?.message);
      }

      try {
        salvagedData.autonomousLogs = this.db.prepare(`SELECT * FROM autonomous_strategy_log ORDER BY timestamp DESC LIMIT 500`).all() || [];
      } catch {}

      try {
        this.db.close();
      } catch {}
      this.db = null;
    }

    // 2. Backup corrupt database and auxiliary WAL/SHM files
    if (fs.existsSync(this.dbFilePath)) {
      const stats = fs.statSync(this.dbFilePath);
      const backupPath = `${this.dbFilePath}.corrupt.${Date.now()}`;
      try {
        fs.copyFileSync(this.dbFilePath, backupPath);
        this.migrationReport.corruptBackups.push({
          path: path.basename(backupPath),
          size: stats.size
        });
        console.warn(`[DB RECOVERY] Corrupt database file copied to backup: ${backupPath} (${stats.size} bytes).`);
      } catch (copyErr) {
        console.error('[DB RECOVERY] Could not create backup copy of corrupt file:', copyErr);
      }

      const filesToRemove = [
        this.dbFilePath,
        `${this.dbFilePath}-wal`,
        `${this.dbFilePath}-shm`
      ];
      for (const file of filesToRemove) {
        if (fs.existsSync(file)) {
          try {
            fs.unlinkSync(file);
          } catch (unlinkErr) {
            console.error(`[DB RECOVERY] Failed removing ${file}:`, unlinkErr);
          }
        }
      }
    }

    // 3. Re-initialize fresh pristine database
    try {
      this.db = new Database(this.dbFilePath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('busy_timeout = 5000');
      this.db.pragma('wal_autocheckpoint = 1000');
      this.migrationReport.walModeEnabled = true;

      this.runMigrations();
      this.ensureAutoIndexes();

      // 4. Restore salvaged data
      if (salvagedData.users.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO users (id, email, name, picture, google_sub, password_hash, email_verified, verification_token, verification_token_expires_at, reset_token, reset_token_expires_at, created_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const u of salvagedData.users) {
          try {
            stmt.run(u.id, u.email, u.name, u.picture, u.google_sub, u.password_hash, u.email_verified, u.verification_token, u.verification_token_expires_at, u.reset_token, u.reset_token_expires_at, u.created_at, u.last_login_at);
          } catch {}
        }
      }

      if (salvagedData.paperPositions.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO paper_positions (id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of salvagedData.paperPositions) {
          try {
            stmt.run(p.id, p.strategy_group_id || p.id, p.leg_label, p.symbol, p.strategy_name, p.strike_price, p.option_type, p.action, p.quantity, p.lot_size || 50, p.entry_price, p.current_price, p.pnl || 0, p.stop_loss, p.target_price, p.status || 'OPEN', p.opened_at, p.closed_at, p.exit_price, p.close_reason, p.expiry || 'CURRENT', p.user_id);
          } catch {}
        }
      }

      if (salvagedData.basketOrders.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO basket_orders (id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of salvagedData.basketOrders) {
          try {
            stmt.run(b.id, b.strategy_id, b.strategy_name, b.symbol, b.status, b.margin_required, b.margin_available, b.fallback_action, b.reconciliation_status, b.legs_json, b.created_at, b.user_id);
          } catch {}
        }
      }

      if (salvagedData.autonomousStrategies.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO autonomous_strategies (id, name, symbol, armed, product_type, legs_json, entry_rules_json, adjustment_rules_json, exit_rules_json, max_position_size, status, created_at, last_evaluated_at, last_action_at, active_basket_id, error_message, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of salvagedData.autonomousStrategies) {
          try {
            stmt.run(s.id, s.name, s.symbol, s.armed, s.product_type, s.legs_json, s.entry_rules_json, s.adjustment_rules_json, s.exit_rules_json, s.max_position_size, s.status, s.created_at, s.last_evaluated_at, s.last_action_at, s.active_basket_id, s.error_message, s.user_id);
          } catch {}
        }
      }

      this.registerGracefulShutdown();
      this.startWalCompactor();
      this.isInitialized = true;
      this.migrationReport.recoveredRows = this.getTableRowCounts();
      console.log('DatabaseEngine (better-sqlite3): Clean SQLite database created, migrations applied, and data restored.');
    } catch (fallbackErr) {
      console.error('[DB INITIALIZE FATAL] Failed re-initializing clean database:', fallbackErr);
    } finally {
      this.isRecovering = false;
    }
  }

  private startWalCompactor(): void {
    if (this.walCheckpointTimer) {
      clearInterval(this.walCheckpointTimer);
    }
    // Periodically run passive WAL checkpoint and prune aged rows every 2 minutes
    this.walCheckpointTimer = setInterval(() => {
      if (!this.db || this.isRecovering) return;
      try {
        this.db.pragma('wal_checkpoint(PASSIVE)');
        // Keep tick and option chain tables efficiently pruned to avoid gigabyte-scale unbounded growth
        this.pruneOldSnapshots();
      } catch (err) {
        this.handleRuntimeCorruption(err);
      }
    }, 120000);
  }

  private pruneOldSnapshots(): void {
    if (!this.db) return;
    try {
      // Keep most recent 50,000 ticks and 100,000 option chain rows
      const tickCountRow = this.db.prepare(`SELECT COUNT(*) as c FROM ticks`).get() as any;
      if (tickCountRow && tickCountRow.c > 60000) {
        this.db.prepare(`DELETE FROM ticks WHERE id NOT IN (SELECT id FROM ticks ORDER BY id DESC LIMIT 40000)`).run();
      }

      const chainCountRow = this.db.prepare(`SELECT COUNT(*) as c FROM option_chains`).get() as any;
      if (chainCountRow && chainCountRow.c > 120000) {
        this.db.prepare(`DELETE FROM option_chains WHERE id NOT IN (SELECT id FROM option_chains ORDER BY id DESC LIMIT 80000)`).run();
      }
    } catch (err) {
      this.handleRuntimeCorruption(err);
    }
  }

  private shutdownRegistered = false;
  private registerGracefulShutdown(): void {
    if (this.shutdownRegistered) return;
    this.shutdownRegistered = true;

    const cleanup = () => {
      if (this.db) {
        try {
          this.db.pragma('wal_checkpoint(TRUNCATE)');
          this.db.close();
          this.db = null;
        } catch {}
      }
    };

    process.once('exit', cleanup);
    process.once('SIGINT', () => { cleanup(); process.exit(0); });
    process.once('SIGTERM', () => { cleanup(); process.exit(0); });
  }

  private auditLegacyBackups(): void {
    try {
      const cwd = process.cwd();
      const files = fs.readdirSync(cwd);
      for (const f of files) {
        if (f.includes('.corrupt.')) {
          const filePath = path.join(cwd, f);
          try {
            const stats = fs.statSync(filePath);
            this.migrationReport.corruptBackups.push({
              path: f,
              size: stats.size
            });
            console.warn(`[DB RECOVERY] Audited legacy corrupt backup file: ${f} (${stats.size} bytes).`);
          } catch {}
        }
      }
    } catch (err) {
      console.error('[DB RECOVERY] Error auditing legacy backups:', err);
    }
  }

  /**
   * Legacy saveToDisk helper - maintained for compatibility.
   * better-sqlite3 writes directly & transactionally to disk on every operation,
   * so full-buffer exports are no longer necessary.
   */
  public saveToDisk(): void {
    // Intentionally no-op with better-sqlite3 as writes are immediately persisted to disk
  }

  /**
   * Insert a live tick record into SQLite
   */
  public recordTick(symbol: string, spotPrice: number, indiaVix: number, volume: number): void {
    if (!this.db) return;
    try {
      const safeSymbol = symbol || 'NIFTY';
      const safeSpot = (typeof spotPrice === 'number' && !isNaN(spotPrice)) ? spotPrice : 0;
      const safeVix = (typeof indiaVix === 'number' && !isNaN(indiaVix)) ? indiaVix : 15;
      const safeVol = (typeof volume === 'number' && !isNaN(volume)) ? volume : 0;
      this.db.prepare(
        `INSERT INTO ticks (symbol, spot_price, india_vix, volume, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(safeSymbol, safeSpot, safeVix, safeVol, new Date().toISOString());
    } catch (err) {
      console.error('Failed to insert tick into SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  public recordHistoricalTick(symbol: string, spotPrice: number, indiaVix: number, volume: number, timestamp: string): void {
    if (!this.db) return;
    try {
      const safeSymbol = symbol || 'NIFTY';
      const safeSpot = (typeof spotPrice === 'number' && !isNaN(spotPrice)) ? spotPrice : 0;
      const safeVix = (typeof indiaVix === 'number' && !isNaN(indiaVix)) ? indiaVix : 15;
      const safeVol = (typeof volume === 'number' && !isNaN(volume)) ? volume : 0;
      const safeTs = timestamp || new Date().toISOString();
      this.db.prepare(
        `INSERT INTO ticks (symbol, spot_price, india_vix, volume, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(safeSymbol, safeSpot, safeVix, safeVol, safeTs);
    } catch (err) {
      console.error('Failed to insert historical tick into SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Record option chain row after Greeks computation
   */
  public recordOptionChainRows(rows: Array<{
    symbol: string;
    expiry: string;
    strikePrice: number;
    optionType: string;
    ltp: number;
    volume: number;
    openInterest: number;
    changeInOI: number;
    iv: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    buildup: string;
  }>): void {
    if (!this.db || rows.length === 0) return;
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(
        `INSERT INTO option_chains (symbol, expiry, strike_price, option_type, ltp, volume, open_interest, change_in_oi, iv, delta, gamma, theta, vega, buildup, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertMany = this.db.transaction((items: typeof rows) => {
        for (const row of items) {
          const safeSymbol = row.symbol || 'NIFTY';
          const safeExpiry = row.expiry || now.split('T')[0];
          const safeStrike = (typeof row.strikePrice === 'number' && !isNaN(row.strikePrice)) ? row.strikePrice : 0;
          const safeType = row.optionType === 'PE' ? 'PE' : 'CE';
          const safeLtp = (typeof row.ltp === 'number' && !isNaN(row.ltp)) ? row.ltp : 0;
          const safeVol = (typeof row.volume === 'number' && !isNaN(row.volume)) ? row.volume : 0;
          const safeOi = (typeof row.openInterest === 'number' && !isNaN(row.openInterest)) ? row.openInterest : 0;
          const safeChgOi = (typeof row.changeInOI === 'number' && !isNaN(row.changeInOI)) ? row.changeInOI : 0;
          const safeIv = (typeof row.iv === 'number' && !isNaN(row.iv)) ? row.iv : 0;
          const safeDelta = (typeof row.delta === 'number' && !isNaN(row.delta)) ? row.delta : 0;
          const safeGamma = (typeof row.gamma === 'number' && !isNaN(row.gamma)) ? row.gamma : 0;
          const safeTheta = (typeof row.theta === 'number' && !isNaN(row.theta)) ? row.theta : 0;
          const safeVega = (typeof row.vega === 'number' && !isNaN(row.vega)) ? row.vega : 0;
          const safeBuildup = row.buildup || 'NEUTRAL';

          stmt.run(
            safeSymbol,
            safeExpiry,
            safeStrike,
            safeType,
            safeLtp,
            safeVol,
            safeOi,
            safeChgOi,
            safeIv,
            safeDelta,
            safeGamma,
            safeTheta,
            safeVega,
            safeBuildup,
            now
          );
        }
      });
      insertMany(rows);
    } catch (err) {
      console.error('Failed to insert option chain rows into SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Save or update a basket order record in SQLite
   */
  public saveBasketOrder(basket: BasketOrderRecord, userId?: string | null): void {
    if (!this.db) return;
    try {
      const uId = userId || (basket as any).userId || null;
      const legsJson = JSON.stringify(basket.legs || []);
      const existing = this.db.prepare(`SELECT id FROM basket_orders WHERE id = ?`).get(basket.id);

      if (existing) {
        this.db.prepare(
          `UPDATE basket_orders SET status = ?, margin_required = ?, margin_available = ?, fallback_action = ?, reconciliation_status = ?, legs_json = ?, user_id = COALESCE(?, user_id) WHERE id = ?`
        ).run(
          basket.status,
          basket.marginRequired,
          basket.marginAvailable,
          basket.fallbackActionTriggered || null,
          basket.reconciliationStatus,
          legsJson,
          uId,
          basket.id
        );
      } else {
        this.db.prepare(
          `INSERT INTO basket_orders (id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          basket.id,
          basket.strategyId,
          basket.strategyName,
          basket.symbol,
          basket.status,
          basket.marginRequired,
          basket.marginAvailable,
          basket.fallbackActionTriggered || null,
          basket.reconciliationStatus,
          legsJson,
          basket.createdAt,
          uId
        );
      }
    } catch (err) {
      console.error('Failed to save basket order to SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Load all basket orders from SQLite
   */
  public loadAllBasketOrders(userId?: string | null): BasketOrderRecord[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at FROM basket_orders WHERE user_id = ? ORDER BY created_at DESC`
        ).all(userId) as any[];
      } else if (userId === null) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at FROM basket_orders WHERE user_id IS NULL ORDER BY created_at DESC`
        ).all() as any[];
      } else {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at FROM basket_orders ORDER BY created_at DESC`
        ).all() as any[];
      }

      return rows.map(row => ({
        id: row.id as string,
        strategyId: row.strategy_id as string,
        strategyName: row.strategy_name as string,
        symbol: row.symbol as string,
        status: row.status as BasketOrderRecord['status'],
        marginRequired: row.margin_required as number,
        marginAvailable: row.margin_available as number,
        fallbackActionTriggered: (row.fallback_action as string) || undefined,
        reconciliationStatus: row.reconciliation_status as BasketOrderRecord['reconciliationStatus'],
        legs: JSON.parse((row.legs_json as string) || '[]'),
        createdAt: row.created_at as string
      }));
    } catch (err) {
      console.error('Failed to load basket orders from SQLite:', err);
      this.handleRuntimeCorruption(err);
      return [];
    }
  }

  /**
   * Save or update a paper trading position in SQLite
   */
  public savePaperPosition(pos: PaperPosition, userId?: string | null): void {
    if (!this.db) return;
    try {
      const uId = userId || (pos as any).userId || null;
      const existing = this.db.prepare(`SELECT id FROM paper_positions WHERE id = ?`).get(pos.id);
      if (existing) {
        this.db.prepare(
          `UPDATE paper_positions SET current_price = ?, pnl = ?, stop_loss = ?, target_price = ?, status = ?, closed_at = ?, exit_price = ?, close_reason = ?, leg_label = ?, lot_size = ?, user_id = COALESCE(?, user_id) WHERE id = ?`
        ).run(
          pos.currentPrice,
          pos.pnl || 0,
          pos.stopLoss || null,
          pos.targetPrice || null,
          pos.status || 'OPEN',
          pos.closedAt || null,
          pos.exitPrice !== undefined ? pos.exitPrice : null,
          pos.exitReason || null,
          pos.legLabel || null,
          pos.lotSize || 50,
          uId,
          pos.id
        );
      } else {
        this.db.prepare(
          `INSERT INTO paper_positions (id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          pos.id,
          pos.strategyGroupId || pos.id,
          pos.legLabel || null,
          pos.symbol,
          pos.strategyName,
          pos.strikePrice,
          pos.type,
          pos.action,
          pos.quantity,
          pos.lotSize || 50,
          pos.entryPrice,
          pos.currentPrice,
          pos.pnl || 0,
          pos.stopLoss || null,
          pos.targetPrice || null,
          pos.status || 'OPEN',
          pos.openedAt,
          pos.closedAt || null,
          pos.exitPrice !== undefined ? pos.exitPrice : null,
          pos.exitReason || null,
          pos.expiry || 'CURRENT',
          uId
        );
      }
    } catch (err) {
      console.error('Failed to save paper position to SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Close a paper trading position in SQLite (UPDATE status to 'CLOSED', set closed_at & exit_price)
   */
  public closePaperPosition(id: string, exitPrice: number, closePnl: number, reason: string = 'Manual Square Off', userId?: string | null): boolean {
    if (!this.db) return false;
    try {
      const now = new Date().toISOString();
      let info;
      if (userId) {
        info = this.db.prepare(
          `UPDATE paper_positions SET status = 'CLOSED', closed_at = ?, exit_price = ?, pnl = ?, close_reason = ? WHERE id = ? AND status = 'OPEN' AND (user_id = ? OR user_id IS NULL)`
        ).run(now, exitPrice, closePnl, reason, id, userId);
      } else {
        info = this.db.prepare(
          `UPDATE paper_positions SET status = 'CLOSED', closed_at = ?, exit_price = ?, pnl = ?, close_reason = ? WHERE id = ? AND status = 'OPEN'`
        ).run(now, exitPrice, closePnl, reason, id);
      }
      return info.changes > 0;
    } catch (err) {
      console.error('Failed to close paper position in SQLite:', err);
      this.handleRuntimeCorruption(err);
      return false;
    }
  }

  /**
   * Close an entire paper trading strategy group in SQLite in a single atomic transaction
   */
  public closePaperGroup(groupId: string, reason: string = 'Strategy Closed', userId?: string | null): boolean {
    if (!this.db) return false;
    try {
      const now = new Date().toISOString();
      let info;
      if (userId) {
        info = this.db.prepare(
          `UPDATE paper_positions 
           SET status = 'CLOSED', 
               closed_at = ?, 
               exit_price = current_price, 
               pnl = CASE WHEN action = 'BUY' THEN ROUND((current_price - entry_price) * quantity, 2) ELSE ROUND((entry_price - current_price) * quantity, 2) END,
               pnl_percent = CASE WHEN entry_price > 0 THEN CASE WHEN action = 'BUY' THEN ROUND(((current_price - entry_price) / entry_price) * 100, 2) ELSE ROUND(((entry_price - current_price) / entry_price) * 100, 2) END ELSE 0 END,
               close_reason = ? 
           WHERE strategy_group_id = ? AND status = 'OPEN' AND (user_id = ? OR user_id IS NULL)`
        ).run(now, reason, groupId, userId);
      } else {
        info = this.db.prepare(
          `UPDATE paper_positions 
           SET status = 'CLOSED', 
               closed_at = ?, 
               exit_price = current_price, 
               pnl = CASE WHEN action = 'BUY' THEN ROUND((current_price - entry_price) * quantity, 2) ELSE ROUND((entry_price - current_price) * quantity, 2) END,
               pnl_percent = CASE WHEN entry_price > 0 THEN CASE WHEN action = 'BUY' THEN ROUND(((current_price - entry_price) / entry_price) * 100, 2) ELSE ROUND(((entry_price - current_price) / entry_price) * 100, 2) END ELSE 0 END,
               close_reason = ? 
           WHERE strategy_group_id = ? AND status = 'OPEN'`
        ).run(now, reason, groupId);
      }
      return info.changes > 0;
    } catch (err) {
      console.error('Failed to close paper strategy group in SQLite:', err);
      this.handleRuntimeCorruption(err);
      return false;
    }
  }

  /**
   * Delete a paper trading position from SQLite (used for account reset only)
   */
  public deletePaperPosition(id: string): void {
    if (!this.db) return;
    try {
      this.db.prepare(`DELETE FROM paper_positions WHERE id = ?`).run(id);
    } catch (err) {
      console.error('Failed to delete paper position from SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Clear paper trading positions from SQLite (by user_id if provided)
   */
  public clearAllPaperPositions(userId?: string | null): void {
    if (!this.db) return;
    try {
      if (userId) {
        this.db.prepare(`DELETE FROM paper_positions WHERE user_id = ? OR user_id IS NULL`).run(userId);
      } else {
        this.db.prepare(`DELETE FROM paper_positions`).run();
      }
    } catch (err) {
      console.error('Failed to clear paper positions from SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Load paper positions from SQLite (filtered by user_id if supplied)
   */
  public loadAllPaperPositions(userId?: string | null): PaperPosition[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id FROM paper_positions WHERE user_id = ? OR user_id IS NULL ORDER BY opened_at DESC`
        ).all(userId) as any[];
      } else {
        rows = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id FROM paper_positions ORDER BY opened_at DESC`
        ).all() as any[];
      }

      return rows.map(row => {
        const entryPrice = row.entry_price as number;
        const currentPrice = row.current_price as number;
        const qty = row.quantity as number;
        const pnl = row.pnl as number;
        const pnlPercent = entryPrice > 0 ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2)) : 0;

        return {
          id: row.id as string,
          strategyGroupId: (row.strategy_group_id as string) || (row.id as string),
          legLabel: (row.leg_label as string) || undefined,
          symbol: row.symbol as string,
          strategyName: row.strategy_name as string,
          strikePrice: row.strike_price as number,
          type: row.option_type as any,
          action: row.action as any,
          quantity: qty,
          lotSize: (row.lot_size as number) || 50,
          entryPrice,
          currentPrice,
          pnl,
          pnlPercent,
          stopLoss: (row.stop_loss as number) || undefined,
          targetPrice: (row.target_price as number) || undefined,
          status: (row.status as 'OPEN' | 'CLOSED') || 'OPEN',
          openedAt: row.opened_at as string,
          closedAt: (row.closed_at as string) || undefined,
          exitPrice: row.exit_price !== null && row.exit_price !== undefined ? (row.exit_price as number) : undefined,
          exitReason: (row.close_reason as string) || undefined,
          expiry: (row.expiry as string) || 'CURRENT',
          userId: (row.user_id as string) || undefined
        };
      });
    } catch (err) {
      console.error('Failed to load paper positions from SQLite:', err);
      this.handleRuntimeCorruption(err);
      return [];
    }
  }

  /**
   * Insert detected OI anomalies into SQLite
   */
  public recordOIAnomalies(anomalies: OIAnomaly[]): void {
    if (!this.db || anomalies.length === 0) return;
    try {
      const stmt = this.db.prepare(
        `INSERT INTO oi_anomalies (id, symbol, strike_price, option_type, z_score, oi_change, volume, severity, description, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertMany = this.db.transaction((items: OIAnomaly[]) => {
        for (const anomaly of items) {
          stmt.run(
            anomaly.id,
            anomaly.symbol,
            anomaly.strikePrice,
            anomaly.type,
            anomaly.zScore,
            anomaly.oiChange,
            anomaly.volume,
            anomaly.severity,
            anomaly.description,
            anomaly.timestamp
          );
        }
      });
      insertMany(anomalies);
    } catch (err) {
      console.error('Failed to record OI anomalies into SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Load historical ticks from SQLite for real backtesting
   */
  public getHistoricalTicks(symbol: string, startDate?: string, endDate?: string): { spotPrice: number; vix: number; timestamp: string }[] {
    if (!this.db) return [];
    try {
      let query = `SELECT spot_price, india_vix, timestamp FROM ticks WHERE symbol = ?`;
      const params: any[] = [symbol];
      if (startDate) {
        const normStart = startDate.length === 10 ? `${startDate}T00:00:00` : startDate;
        query += ` AND timestamp >= ?`;
        params.push(normStart);
      }
      if (endDate) {
        const normEnd = endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate;
        query += ` AND timestamp <= ?`;
        params.push(normEnd);
      }
      query += ` ORDER BY timestamp ASC`;
      const rows = this.db.prepare(query).all(...params) as any[];

      return rows.map(row => ({
        spotPrice: row.spot_price as number,
        vix: row.india_vix as number,
        timestamp: row.timestamp as string
      }));
    } catch (err) {
      console.error('Failed to query historical ticks from SQLite:', err);
      this.handleRuntimeCorruption(err);
      return [];
    }
  }

  /**
   * Load historical OI changes from SQLite for baseline statistical calculations
   */
  public getHistoricalOIChanges(symbol: string): number[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(
        `SELECT change_in_oi FROM option_chains WHERE symbol = ? ORDER BY updated_at DESC LIMIT 500`
      ).all(symbol) as any[];

      return rows.map(row => Math.abs((row.change_in_oi as number) || 0));
    } catch (err) {
      console.error('Failed to load historical OI changes from SQLite:', err);
      this.handleRuntimeCorruption(err);
      return [];
    }
  }

  /**
   * Load previously recorded open interest map for calculating real changeInOI.
   * Resolves the previous distinct batch snapshot timestamp to avoid self-subtraction.
   */
  public getPreviousOIMap(symbol: string, expiry: string, beforeTimestamp?: string): Map<string, number> {
    const map = new Map<string, number>();
    if (!this.db) return map;
    try {
      let targetTimestamp: string | null = null;

      if (beforeTimestamp) {
        const row = this.db.prepare(
          `SELECT updated_at FROM option_chains WHERE symbol = ? AND expiry = ? AND updated_at < ? ORDER BY updated_at DESC LIMIT 1`
        ).get(symbol, expiry, beforeTimestamp) as any;
        targetTimestamp = row?.updated_at || null;
      } else {
        // Query distinct snapshot batch timestamps in descending order
        const tsRows = this.db.prepare(
          `SELECT DISTINCT updated_at FROM option_chains WHERE symbol = ? AND expiry = ? ORDER BY updated_at DESC LIMIT 2`
        ).all(symbol, expiry) as any[];

        if (tsRows.length >= 2) {
          // The 2nd timestamp is the true previous snapshot batch
          targetTimestamp = tsRows[1].updated_at;
        } else if (tsRows.length === 1) {
          // If only 1 snapshot batch has been persisted, use it as baseline
          targetTimestamp = tsRows[0].updated_at;
        }
      }

      if (targetTimestamp) {
        const rows = this.db.prepare(
          `SELECT strike_price, option_type, open_interest FROM option_chains WHERE symbol = ? AND expiry = ? AND updated_at = ?`
        ).all(symbol, expiry, targetTimestamp) as any[];

        for (const row of rows) {
          const key = `${row.strike_price}_${row.option_type}`;
          map.set(key, (row.open_interest as number) || 0);
        }
      } else {
        // Fallback baseline
        const rows = this.db.prepare(
          `SELECT strike_price, option_type, open_interest FROM option_chains WHERE symbol = ? AND expiry = ? ORDER BY id ASC LIMIT 100`
        ).all(symbol, expiry) as any[];

        for (const row of rows) {
          const key = `${row.strike_price}_${row.option_type}`;
          if (!map.has(key)) {
            map.set(key, (row.open_interest as number) || 0);
          }
        }
      }
    } catch (err) {
      console.error('Failed to get previous OI map from SQLite:', err);
      this.handleRuntimeCorruption(err);
    }
    return map;
  }

  /**
   * Get recorded historical option LTP at or prior to timestamp for backtesting
   */
  public getHistoricalOptionLtp(symbol: string, expiry: string, strikePrice: number, optionType: string, timestamp: string): number | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(
        `SELECT ltp FROM option_chains WHERE symbol = ? AND strike_price = ? AND option_type = ? AND updated_at <= ? ORDER BY updated_at DESC LIMIT 1`
      ).get(symbol, strikePrice, optionType, timestamp) as any;

      if (row && typeof row.ltp === 'number') {
        return row.ltp;
      }
    } catch (err) {
      console.error('Failed to get historical option ltp from DB:', err);
      this.handleRuntimeCorruption(err);
    }
    return null;
  }

  /**
   * Get continuous background data collection coverage per symbol
   */
  public getSymbolCollectionCoverage(): Record<string, {
    lastPersistedAt: string | null;
    totalChainRows: number;
    totalTicks: number;
    distinctDays: number;
  }> {
    const result: Record<string, { lastPersistedAt: string | null; totalChainRows: number; totalTicks: number; distinctDays: number }> = {};
    if (!this.db) return result;

    const symbols = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK'];
    for (const sym of symbols) {
      try {
        const chainRow = this.db.prepare(
          `SELECT MAX(updated_at) as last_updated, COUNT(*) as chain_count, COUNT(DISTINCT DATE(updated_at)) as distinct_days FROM option_chains WHERE symbol = ?`
        ).get(sym) as any;
        const tickRow = this.db.prepare(
          `SELECT COUNT(*) as tick_count FROM ticks WHERE symbol = ?`
        ).get(sym) as any;

        result[sym] = {
          lastPersistedAt: (chainRow?.last_updated as string) || null,
          totalChainRows: (chainRow?.chain_count as number) || 0,
          totalTicks: (tickRow?.tick_count as number) || 0,
          distinctDays: (chainRow?.distinct_days as number) || 0
        };
      } catch (err) {
        console.error(`Failed to query symbol collection coverage for ${sym}:`, err);
        result[sym] = {
          lastPersistedAt: null,
          totalChainRows: 0,
          totalTicks: 0,
          distinctDays: 0
        };
      }
    }

    return result;
  }

  private runMigrations(): void {
    if (!this.db) return;

    // Create migrations table first
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check applied migrations
    const rows = this.db.prepare(`SELECT version FROM schema_migrations`).all() as any[];
    const appliedVersions = new Set<number>(rows.map(r => r.version as number));

    // Migration 001: Initial Core Schema & Indexes
    if (!appliedVersions.has(1)) {
      const migrationSqlPath = path.join(process.cwd(), 'src/server/migrations/001_initial_schema.sql');
      if (fs.existsSync(migrationSqlPath)) {
        const sqlContent = fs.readFileSync(migrationSqlPath, 'utf-8');
        this.db.exec(sqlContent);
      } else {
        // Fallback inline DDL
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS ticks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            spot_price REAL NOT NULL,
            india_vix REAL NOT NULL,
            volume INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS option_chains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            expiry TEXT NOT NULL,
            strike_price REAL NOT NULL,
            option_type TEXT NOT NULL,
            ltp REAL NOT NULL,
            volume INTEGER DEFAULT 0,
            open_interest INTEGER DEFAULT 0,
            change_in_oi INTEGER DEFAULT 0,
            iv REAL NOT NULL,
            delta REAL NOT NULL,
            gamma REAL NOT NULL,
            theta REAL NOT NULL,
            vega REAL NOT NULL,
            buildup TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS basket_orders (
            id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            strategy_name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            status TEXT NOT NULL,
            margin_required REAL NOT NULL,
            margin_available REAL NOT NULL,
            fallback_action TEXT,
            reconciliation_status TEXT DEFAULT 'IN_SYNC',
            legs_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS paper_positions (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            strategy_name TEXT NOT NULL,
            strike_price REAL NOT NULL,
            option_type TEXT NOT NULL,
            action TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            lot_size INTEGER,
            entry_price REAL NOT NULL,
            current_price REAL NOT NULL,
            pnl REAL DEFAULT 0.0,
            stop_loss REAL,
            target_price REAL,
            status TEXT DEFAULT 'OPEN',
            opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            closed_at DATETIME
          );
          CREATE TABLE IF NOT EXISTS oi_anomalies (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            strike_price REAL NOT NULL,
            option_type TEXT NOT NULL,
            z_score REAL NOT NULL,
            oi_change INTEGER NOT NULL,
            volume INTEGER NOT NULL,
            severity TEXT NOT NULL,
            description TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (1, 'Initial Core Schema & Auto-Indexes');
      `).run();
      console.log('DatabaseEngine: Applied Migration 001 - Initial Core Schema.');
    }

    // Migration 002: Phase J Autonomous Strategy Runner Schema
    if (!appliedVersions.has(2)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS autonomous_strategies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          armed INTEGER DEFAULT 0,
          product_type TEXT DEFAULT 'NRML',
          legs_json TEXT NOT NULL,
          entry_rules_json TEXT NOT NULL,
          adjustment_rules_json TEXT,
          exit_rules_json TEXT,
          max_position_size INTEGER DEFAULT 5,
          status TEXT DEFAULT 'DISARMED',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_evaluated_at DATETIME,
          last_action_at DATETIME,
          active_basket_id TEXT,
          error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS autonomous_strategy_log (
          id TEXT PRIMARY KEY,
          strategy_id TEXT NOT NULL,
          strategy_name TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          event_type TEXT NOT NULL,
          details_json TEXT NOT NULL
        );
      `);

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (2, 'Phase J Autonomous Strategy Runner Tables');
      `).run();
      console.log('DatabaseEngine: Applied Migration 002 - Autonomous Strategy Tables.');
    }

    // Ensure all Phase M Paper Trading columns exist on paper_positions table
    try {
      const tableInfo = this.db.prepare(`PRAGMA table_info(paper_positions)`).all() as any[];
      const cols = new Set(tableInfo.map(c => c.name as string));

      if (!cols.has('strategy_group_id')) {
        this.db.exec(`ALTER TABLE paper_positions ADD COLUMN strategy_group_id TEXT;`);
      }
      if (!cols.has('leg_label')) {
        this.db.exec(`ALTER TABLE paper_positions ADD COLUMN leg_label TEXT;`);
      }
      if (!cols.has('exit_price')) {
        this.db.exec(`ALTER TABLE paper_positions ADD COLUMN exit_price REAL;`);
      }
      if (!cols.has('close_reason')) {
        this.db.exec(`ALTER TABLE paper_positions ADD COLUMN close_reason TEXT;`);
      }
      if (!cols.has('expiry')) {
        this.db.exec(`ALTER TABLE paper_positions ADD COLUMN expiry TEXT;`);
      }
      if (!cols.has('lot_size')) {
        this.db.exec(`ALTER TABLE paper_positions ADD COLUMN lot_size INTEGER;`);
      }

      this.db.exec(`UPDATE paper_positions SET strategy_group_id = id WHERE strategy_group_id IS NULL OR strategy_group_id = '';`);
    } catch (e) {
      console.error('Error ensuring paper_positions columns:', e);
    }

    // Migration 003: Phase M Paper Trading Strategy Grouping & Leg Naming
    if (!appliedVersions.has(3)) {
      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (3, 'Phase M Paper Trading Strategy Grouping & Leg Naming');
      `).run();
      console.log('DatabaseEngine: Applied Migration 003 - Paper Trading Strategy Grouping & Leg Naming.');
    }

    // Migration 004: Phase N Multi-User Authentication & Per-User Isolation
    if (!appliedVersions.has(4)) {
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          picture TEXT,
          google_sub TEXT UNIQUE,
          password_hash TEXT,
          email_verified INTEGER DEFAULT 0,
          verification_token TEXT,
          verification_token_expires_at DATETIME,
          reset_token TEXT,
          reset_token_expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login_at DATETIME
        );
      `).run();

      const userTables = ['paper_positions', 'basket_orders', 'autonomous_strategies', 'autonomous_strategy_log'];
      for (const table of userTables) {
        try {
          const tInfo = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
          const cNames = new Set(tInfo.map(c => c.name as string));
          if (!cNames.has('user_id')) {
            this.db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT;`);
          }
        } catch (e) {
          console.error(`Error adding user_id to ${table}:`, e);
        }
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (4, 'Phase N Multi-User Authentication & Per-User Isolation');
      `).run();
      console.log('DatabaseEngine: Applied Migration 004 - Multi-User Auth & Per-User Isolation.');
    }

    // Migration 005: 15-Minute 23 EMA / 50 EMA Crossover Alert System Schema
    if (!appliedVersions.has(5)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ema_15m_candles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          instrument TEXT NOT NULL,
          timeframe TEXT NOT NULL DEFAULT '15m',
          timestamp DATETIME NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume INTEGER DEFAULT 0,
          is_closed INTEGER DEFAULT 1,
          ema_23 REAL,
          ema_50 REAL,
          ema_difference REAL,
          signal TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(instrument, timeframe, timestamp)
        );

        CREATE TABLE IF NOT EXISTS ema_15m_signals (
          id TEXT PRIMARY KEY,
          instrument TEXT NOT NULL,
          timeframe TEXT NOT NULL DEFAULT '15m',
          signal_type TEXT NOT NULL,
          price REAL NOT NULL,
          ema_23 REAL NOT NULL,
          ema_50 REAL NOT NULL,
          ema_difference REAL NOT NULL,
          candle_timestamp DATETIME NOT NULL,
          signal_confirmed_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          user_id TEXT,
          notification_status TEXT DEFAULT 'PENDING',
          UNIQUE(instrument, timeframe, candle_timestamp, signal_type)
        );

        CREATE TABLE IF NOT EXISTS ema_notification_logs (
          id TEXT PRIMARY KEY,
          signal_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          status TEXT NOT NULL,
          attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          error_message TEXT,
          payload_json TEXT
        );

        CREATE TABLE IF NOT EXISTS ema_notification_settings (
          user_id TEXT PRIMARY KEY,
          telegram_enabled INTEGER DEFAULT 1,
          email_enabled INTEGER DEFAULT 0,
          browser_enabled INTEGER DEFAULT 1,
          sound_enabled INTEGER DEFAULT 1,
          telegram_chat_id TEXT,
          email_address TEXT,
          sound_volume REAL DEFAULT 0.8,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (5, '15-Minute 23/50 EMA Crossover Alert System Tables');
      `).run();
      console.log('DatabaseEngine: Applied Migration 005 - 15m EMA Crossover Alert System Tables.');
    }

    // Migration 006: 15-Minute EMA Automatic Paper Trading Engine
    if (!appliedVersions.has(6)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ema_paper_trades (
          id TEXT PRIMARY KEY,
          signal_id TEXT UNIQUE,
          instrument TEXT NOT NULL,
          direction TEXT NOT NULL,
          entry_timestamp DATETIME NOT NULL,
          entry_price REAL NOT NULL,
          quantity INTEGER NOT NULL,
          lot_size INTEGER NOT NULL,
          strategy TEXT NOT NULL DEFAULT 'EMA_15M_23_50',
          source TEXT NOT NULL DEFAULT 'UPSTOX_LIVE',
          status TEXT NOT NULL DEFAULT 'OPEN',
          current_price REAL NOT NULL,
          unrealized_pnl REAL DEFAULT 0,
          exit_timestamp DATETIME,
          exit_price REAL,
          exit_reason TEXT,
          gross_pnl REAL DEFAULT 0,
          brokerage REAL DEFAULT 40,
          charges REAL DEFAULT 0,
          net_pnl REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ema_paper_trades_status ON ema_paper_trades(status);
        CREATE INDEX IF NOT EXISTS idx_ema_paper_trades_inst ON ema_paper_trades(instrument, status);
        CREATE INDEX IF NOT EXISTS idx_ema_paper_trades_created ON ema_paper_trades(created_at DESC);
      `);

      // Ensure auto_paper_trading_enabled column exists on settings table
      try {
        const settingsCols = this.db.prepare(`PRAGMA table_info(ema_notification_settings)`).all() as any[];
        const colNames = new Set(settingsCols.map(c => c.name as string));
        if (!colNames.has('auto_paper_trading_enabled')) {
          this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN auto_paper_trading_enabled INTEGER DEFAULT 1;`);
        }
      } catch (e) {
        // Ignore column check error
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (6, '15-Minute EMA Automatic Paper Trading Engine Tables');
      `).run();
      console.log('DatabaseEngine: Applied Migration 006 - 15m EMA Paper Trading Engine Tables.');
    }
  }

  /**
   * Guarantees every single queryable path has an index created for zero latency
   */
  public ensureAutoIndexes(): void {
    if (!this.db) return;

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ticks_symbol_timestamp ON ticks(symbol, timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_option_chains_lookup ON option_chains(symbol, expiry, strike_price, option_type);',
      'CREATE INDEX IF NOT EXISTS idx_basket_orders_strategy_status ON basket_orders(strategy_id, status, created_at DESC);',
      'CREATE INDEX IF NOT EXISTS idx_paper_positions_status ON paper_positions(status, symbol);',
      'CREATE INDEX IF NOT EXISTS idx_paper_positions_group_status ON paper_positions(strategy_group_id, status);',
      'CREATE INDEX IF NOT EXISTS idx_oi_anomalies_zscore ON oi_anomalies(symbol, z_score DESC, timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_autonomous_strategies_armed ON autonomous_strategies(armed, status);',
      'CREATE INDEX IF NOT EXISTS idx_autonomous_log_strategy_ts ON autonomous_strategy_log(strategy_id, timestamp DESC);',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);',
      'CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);',
      'CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);',
      'CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);',
      'CREATE INDEX IF NOT EXISTS idx_paper_positions_user ON paper_positions(user_id, status);',
      'CREATE INDEX IF NOT EXISTS idx_basket_orders_user ON basket_orders(user_id, status);',
      'CREATE INDEX IF NOT EXISTS idx_autonomous_strategies_user ON autonomous_strategies(user_id, status);',
      'CREATE INDEX IF NOT EXISTS idx_ema_candles_inst_ts ON ema_15m_candles(instrument, timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_ema_signals_inst_ts ON ema_15m_signals(instrument, candle_timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_ema_signals_type ON ema_15m_signals(signal_type, candle_timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_ema_notif_logs_sig ON ema_notification_logs(signal_id, attempted_at DESC);'
    ];

    for (const sql of indexes) {
      try {
        this.db.exec(sql);
      } catch (err) {
        console.error('Error applying auto index:', err);
      }
    }
  }

  public getRawDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /**
   * Introspects Database Schema & Index Status for System Documentation & Diagnostics
   */
  public getSchemaInfo(): DatabaseSchemaInfo[] {
    if (!this.db) return [];

    const tables = [
      'ticks',
      'option_chains',
      'basket_orders',
      'paper_positions',
      'oi_anomalies',
      'autonomous_strategies',
      'autonomous_strategy_log',
      'schema_migrations'
    ];
    const result: DatabaseSchemaInfo[] = [];

    for (const tableName of tables) {
      try {
        const colRows = this.db.prepare(`PRAGMA table_info(${tableName});`).all() as any[];
        const columns = colRows.map(v => ({
          name: v.name as string,
          type: v.type as string,
          isNullable: v.notnull === 0,
          primaryKey: v.pk === 1
        }));

        const idxRows = this.db.prepare(`PRAGMA index_list(${tableName});`).all() as any[];
        const indexes: DatabaseSchemaInfo['indexes'] = [];

        for (const idxRow of idxRows) {
          const idxName = idxRow.name as string;
          const isUnique = idxRow.unique === 1;
          const idxInfoCols = (this.db.prepare(`PRAGMA index_info(${idxName});`).all() as any[]).map(v => v.name as string);
          indexes.push({ name: idxName, columns: idxInfoCols, isUnique });
        }

        const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName};`).get() as any;
        const rowCount = countRow ? (countRow.count as number) : 0;

        result.push({
          tableName,
          columns,
          indexes,
          rowCount
        });
      } catch (e) {
        console.error(`Error introspecting table ${tableName}`, e);
      }
    }

    return result;
  }

  public getMigrationHistory(): DatabaseMigrationStatus[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`SELECT version, description, applied_at FROM schema_migrations ORDER BY version ASC;`).all() as any[];
      return rows.map(v => ({
        version: v.version as number,
        description: v.description as string,
        appliedAt: v.applied_at as string
      }));
    } catch {
      return [];
    }
  }

  public getTableRowCounts(): Record<string, number> {
    if (!this.db) return {};
    const tables = ['ticks', 'option_chains', 'basket_orders', 'paper_positions', 'oi_anomalies', 'autonomous_strategies', 'autonomous_strategy_log'];
    const result: Record<string, number> = {};
    for (const t of tables) {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${t};`).get() as any;
        result[t] = row ? (row.count as number) : 0;
      } catch {
        result[t] = 0;
      }
    }
    return result;
  }

  // --- Phase J Autonomous Strategy Persistence Helper Methods ---

  public saveAutonomousStrategy(strat: any, userId?: string | null): void {
    if (!this.db) return;
    try {
      const uId = userId || strat.userId || null;
      const existing = this.db.prepare(`SELECT id FROM autonomous_strategies WHERE id = ?`).get(strat.id);
      const legsJson = JSON.stringify(strat.legs || []);
      const entryRulesJson = JSON.stringify(strat.entryRules || {});
      const adjRulesJson = strat.adjustmentRules ? JSON.stringify(strat.adjustmentRules) : null;
      const exitRulesJson = strat.exitRules ? JSON.stringify(strat.exitRules) : null;
      const armedVal = strat.armed ? 1 : 0;

      if (existing) {
        this.db.prepare(
          `UPDATE autonomous_strategies SET
             name = ?, symbol = ?, armed = ?, product_type = ?, legs_json = ?,
             entry_rules_json = ?, adjustment_rules_json = ?, exit_rules_json = ?,
             max_position_size = ?, status = ?, last_evaluated_at = ?, last_action_at = ?,
             active_basket_id = ?, error_message = ?, user_id = COALESCE(?, user_id)
           WHERE id = ?`
        ).run(
          strat.name,
          strat.symbol,
          armedVal,
          strat.productType || 'NRML',
          legsJson,
          entryRulesJson,
          adjRulesJson,
          exitRulesJson,
          strat.maxPositionSize || 5,
          strat.status || 'DISARMED',
          strat.lastEvaluatedAt || null,
          strat.lastActionAt || null,
          strat.activeBasketId || null,
          strat.errorMessage || null,
          uId,
          strat.id
        );
      } else {
        this.db.prepare(
          `INSERT INTO autonomous_strategies
             (id, name, symbol, armed, product_type, legs_json, entry_rules_json, adjustment_rules_json, exit_rules_json, max_position_size, status, created_at, last_evaluated_at, last_action_at, active_basket_id, error_message, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          strat.id,
          strat.name,
          strat.symbol,
          armedVal,
          strat.productType || 'NRML',
          legsJson,
          entryRulesJson,
          adjRulesJson,
          exitRulesJson,
          strat.maxPositionSize || 5,
          strat.status || 'DISARMED',
          strat.createdAt || new Date().toISOString(),
          strat.lastEvaluatedAt || null,
          strat.lastActionAt || null,
          strat.activeBasketId || null,
          strat.errorMessage || null,
          uId
        );
      }
    } catch (err) {
      console.error('Failed to save autonomous strategy:', err);
    }
  }

  public getAutonomousStrategy(id: string, userId?: string | null): any | null {
    if (!this.db) return null;
    try {
      let row: any;
      if (userId) {
        row = this.db.prepare(`SELECT * FROM autonomous_strategies WHERE id = ? AND user_id = ?`).get(id, userId) as any;
      } else {
        row = this.db.prepare(`SELECT * FROM autonomous_strategies WHERE id = ?`).get(id) as any;
      }
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        symbol: row.symbol,
        armed: row.armed === 1,
        productType: row.product_type,
        legs: JSON.parse(row.legs_json || '[]'),
        entryRules: JSON.parse(row.entry_rules_json || '{}'),
        adjustmentRules: row.adjustment_rules_json ? JSON.parse(row.adjustment_rules_json) : undefined,
        exitRules: row.exit_rules_json ? JSON.parse(row.exit_rules_json) : undefined,
        maxPositionSize: row.max_position_size,
        status: row.status,
        createdAt: row.created_at,
        lastEvaluatedAt: row.last_evaluated_at || undefined,
        lastActionAt: row.last_action_at || undefined,
        activeBasketId: row.active_basket_id || undefined,
        errorMessage: row.error_message || undefined
      };
    } catch {
      return null;
    }
  }

  public getAllAutonomousStrategies(userId?: string | null): any[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(`SELECT * FROM autonomous_strategies WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as any[];
      } else if (userId === null) {
        rows = this.db.prepare(`SELECT * FROM autonomous_strategies WHERE user_id IS NULL ORDER BY created_at DESC`).all() as any[];
      } else {
        rows = this.db.prepare(`SELECT * FROM autonomous_strategies ORDER BY created_at DESC`).all() as any[];
      }
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        symbol: row.symbol,
        armed: row.armed === 1,
        productType: row.product_type,
        legs: JSON.parse(row.legs_json || '[]'),
        entryRules: JSON.parse(row.entry_rules_json || '{}'),
        adjustmentRules: row.adjustment_rules_json ? JSON.parse(row.adjustment_rules_json) : undefined,
        exitRules: row.exit_rules_json ? JSON.parse(row.exit_rules_json) : undefined,
        maxPositionSize: row.max_position_size,
        status: row.status,
        createdAt: row.created_at,
        lastEvaluatedAt: row.last_evaluated_at || undefined,
        lastActionAt: row.last_action_at || undefined,
        activeBasketId: row.active_basket_id || undefined,
        errorMessage: row.error_message || undefined
      }));
    } catch (err) {
      console.error('Error fetching autonomous strategies:', err);
      return [];
    }
  }

  // --- Phase N User Authentication DB Helper Methods ---

  public getMostRecentUser(): User | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`SELECT * FROM users ORDER BY last_login_at DESC, created_at DESC LIMIT 1`).get() as any;
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name || undefined,
        picture: row.picture || undefined,
        google_sub: row.google_sub || undefined,
        googleSub: row.google_sub || undefined,
        email_verified: row.email_verified,
        emailVerified: row.email_verified === 1,
        created_at: row.created_at,
        createdAt: row.created_at,
        last_login_at: row.last_login_at || undefined,
        lastLoginAt: row.last_login_at || undefined,
      };
    } catch {
      return null;
    }
  }

  public findUserById(id: string): User | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as any;
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name || undefined,
        picture: row.picture || undefined,
        google_sub: row.google_sub || undefined,
        googleSub: row.google_sub || undefined,
        email_verified: row.email_verified,
        emailVerified: row.email_verified === 1,
        created_at: row.created_at,
        createdAt: row.created_at,
        last_login_at: row.last_login_at || undefined,
        lastLoginAt: row.last_login_at || undefined,
      };
    } catch (err) {
      console.error('findUserById error:', err);
      return null;
    }
  }

  public findUserByEmail(email: string): any | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`SELECT * FROM users WHERE lower(email) = lower(?)`).get(email) as any;
      return row || null;
    } catch (err) {
      console.error('findUserByEmail error:', err);
      return null;
    }
  }

  public findUserByGoogleSub(sub: string): any | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`SELECT * FROM users WHERE google_sub = ?`).get(sub) as any;
      return row || null;
    } catch (err) {
      console.error('findUserByGoogleSub error:', err);
      return null;
    }
  }

  public findUserByVerificationToken(token: string): any | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`SELECT * FROM users WHERE verification_token = ?`).get(token) as any;
      return row || null;
    } catch (err) {
      console.error('findUserByVerificationToken error:', err);
      return null;
    }
  }

  public findUserByResetToken(token: string): any | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`SELECT * FROM users WHERE reset_token = ?`).get(token) as any;
      return row || null;
    } catch (err) {
      console.error('findUserByResetToken error:', err);
      return null;
    }
  }

  public createUserWithPassword(id: string, email: string, name: string | null, passwordHash: string, verificationToken: string, expiresAt: string): User | null {
    if (!this.db) return null;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (id, email, name, password_hash, email_verified, verification_token, verification_token_expires_at, created_at)
      VALUES (?, lower(?), ?, ?, 0, ?, ?, ?)
    `).run(id, email, name, passwordHash, verificationToken, expiresAt, now);
    return this.findUserById(id);
  }

  public createOrLinkGoogleUser(sub: string, email: string, name: string | null, picture: string | null): User | null {
    if (!this.db) return null;
    const existingBySub = this.findUserByGoogleSub(sub);
    const now = new Date().toISOString();
    if (existingBySub) {
      this.db.prepare(`
        UPDATE users SET name = COALESCE(?, name), picture = COALESCE(?, picture), email_verified = 1, last_login_at = ?
        WHERE google_sub = ?
      `).run(name, picture, now, sub);
      return this.findUserById(existingBySub.id);
    }

    const existingByEmail = this.findUserByEmail(email);
    if (existingByEmail) {
      this.db.prepare(`
        UPDATE users SET google_sub = ?, name = COALESCE(?, name), picture = COALESCE(?, picture), email_verified = 1, last_login_at = ?
        WHERE id = ?
      `).run(sub, name, picture, now, existingByEmail.id);
      return this.findUserById(existingByEmail.id);
    }

    const id = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.db.prepare(`
      INSERT INTO users (id, email, name, picture, google_sub, email_verified, created_at, last_login_at)
      VALUES (?, lower(?), ?, ?, ?, 1, ?, ?)
    `).run(id, email, name, picture, sub, now, now);
    return this.findUserById(id);
  }

  public verifyUserEmail(userId: string): void {
    if (!this.db) return;
    this.db.prepare(`
      UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires_at = NULL WHERE id = ?
    `).run(userId);
  }

  public setVerificationToken(userId: string, token: string, expiresAt: string): void {
    if (!this.db) return;
    this.db.prepare(`
      UPDATE users SET verification_token = ?, verification_token_expires_at = ? WHERE id = ?
    `).run(token, expiresAt, userId);
  }

  public setResetToken(userId: string, token: string, expiresAt: string): void {
    if (!this.db) return;
    this.db.prepare(`
      UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?
    `).run(token, expiresAt, userId);
  }

  public updatePassword(userId: string, passwordHash: string): void {
    if (!this.db) return;
    this.db.prepare(`
      UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?
    `).run(passwordHash, userId);
  }

  public updatePasswordOnAccount(userId: string, passwordHash: string): void {
    if (!this.db) return;
    this.db.prepare(`
      UPDATE users SET password_hash = ? WHERE id = ?
    `).run(passwordHash, userId);
  }

  public updateLastLogin(userId: string): void {
    if (!this.db) return;
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(now, userId);
  }

  public deleteAutonomousStrategy(id: string, userId?: string | null): void {
    if (!this.db) return;
    try {
      if (userId) {
        this.db.prepare(`DELETE FROM autonomous_strategies WHERE id = ? AND user_id = ?`).run(id, userId);
      } else {
        this.db.prepare(`DELETE FROM autonomous_strategies WHERE id = ?`).run(id);
      }
    } catch (err) {
      console.error('Error deleting autonomous strategy:', err);
    }
  }

  public disarmAllAutonomousStrategies(reason: string, userId?: string | null): number {
    if (!this.db) return 0;
    try {
      let countRow: any;
      if (userId) {
        countRow = this.db.prepare(`SELECT COUNT(*) as count FROM autonomous_strategies WHERE armed = 1 AND user_id = ?`).get(userId) as any;
        this.db.prepare(`UPDATE autonomous_strategies SET armed = 0, status = 'DISARMED' WHERE armed = 1 AND user_id = ?`).run(userId);
      } else {
        countRow = this.db.prepare(`SELECT COUNT(*) as count FROM autonomous_strategies WHERE armed = 1`).get() as any;
        this.db.prepare(`UPDATE autonomous_strategies SET armed = 0, status = 'DISARMED' WHERE armed = 1`).run();
      }
      const armedCount = countRow ? (countRow.count as number) : 0;

      this.addAutonomousLog({
        id: `log-${Date.now()}`,
        strategyId: 'GLOBAL',
        strategyName: 'KILL SWITCH',
        timestamp: new Date().toISOString(),
        eventType: 'KILL_SWITCH',
        details: { reason, disarmedCount: armedCount, userId }
      }, userId);

      return armedCount;
    } catch (err) {
      console.error('Error in disarmAllAutonomousStrategies:', err);
      return 0;
    }
  }

  public addAutonomousLog(log: any, userId?: string | null): void {
    if (!this.db) return;
    try {
      const uId = userId || log.userId || log.details?.userId || null;
      const detailsJson = JSON.stringify(log.details || {});
      this.db.prepare(
        `INSERT INTO autonomous_strategy_log (id, strategy_id, strategy_name, timestamp, event_type, details_json, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        log.id || `log-${Date.now()}`,
        log.strategyId,
        log.strategyName || 'Autonomous Strategy',
        log.timestamp || new Date().toISOString(),
        log.eventType,
        detailsJson,
        uId
      );
    } catch (err) {
      console.error('Error adding autonomous log:', err);
    }
  }

  public getAutonomousLogs(strategyId?: string, limit: number = 100, userId?: string | null): any[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (strategyId && userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log WHERE strategy_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT ?`
        ).all(strategyId, userId, limit) as any[];
      } else if (strategyId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log WHERE strategy_id = ? ORDER BY timestamp DESC LIMIT ?`
        ).all(strategyId, limit) as any[];
      } else if (userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?`
        ).all(userId, limit) as any[];
      } else {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log ORDER BY timestamp DESC LIMIT ?`
        ).all(limit) as any[];
      }

      return rows.map(row => ({
        id: row.id,
        strategyId: row.strategy_id,
        strategyName: row.strategy_name,
        timestamp: row.timestamp,
        eventType: row.event_type,
        details: JSON.parse(row.details_json || '{}')
      }));
    } catch {
      return [];
    }
  }

  public getDailyAutonomousPnl(userId?: string | null): number {
    if (!this.db) return 0;
    try {
      const today = new Date().toISOString().split('T')[0];
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(
          `SELECT details_json FROM autonomous_strategy_log
           WHERE event_type IN ('ENTRY_TRIGGERED', 'EXIT_TRIGGERED', 'ADJUSTMENT_TRIGGERED')
             AND DATE(timestamp) = ? AND user_id = ?`
        ).all(today, userId) as any[];
      } else {
        rows = this.db.prepare(
          `SELECT details_json FROM autonomous_strategy_log
           WHERE event_type IN ('ENTRY_TRIGGERED', 'EXIT_TRIGGERED', 'ADJUSTMENT_TRIGGERED')
             AND DATE(timestamp) = ?`
        ).all(today) as any[];
      }

      let totalPnl = 0;
      for (const row of rows) {
        try {
          const details = JSON.parse(row.details_json || '{}');
          if (details.pnl) totalPnl += Number(details.pnl) || 0;
        } catch {}
      }
      return totalPnl;
    } catch {
      return 0;
    }
  }

  public exportDDLScript(): string {
    const migrationSqlPath = path.join(process.cwd(), 'src/server/migrations/001_initial_schema.sql');
    if (fs.existsSync(migrationSqlPath)) {
      return fs.readFileSync(migrationSqlPath, 'utf-8');
    }
    return '-- DDL Export Unavailable';
  }

  // ========================================================
  // 15-MINUTE 23 EMA / 50 EMA SYSTEM PERSISTENCE METHODS
  // ========================================================

  public saveEma15mCandle(candle: Ema15mCandle): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO ema_15m_candles (
          instrument, timeframe, timestamp, open, high, low, close, volume, is_closed, ema_23, ema_50, ema_difference, signal
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instrument, timeframe, timestamp) DO UPDATE SET
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          is_closed = excluded.is_closed,
          ema_23 = excluded.ema_23,
          ema_50 = excluded.ema_50,
          ema_difference = excluded.ema_difference,
          signal = excluded.signal
      `).run(
        candle.instrument,
        candle.timeframe || '15m',
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume || 0,
        candle.isClosed ? 1 : 0,
        candle.ema23 ?? null,
        candle.ema50 ?? null,
        candle.emaDifference ?? null,
        candle.signal ?? null
      );
    } catch (err) {
      console.error(`[DB] Error saving EMA candle for ${candle.instrument}:`, err);
    }
  }

  public saveEma15mCandlesBatch(candles: Ema15mCandle[]): void {
    if (!this.db || candles.length === 0) return;
    const stmt = this.db.prepare(`
      INSERT INTO ema_15m_candles (
        instrument, timeframe, timestamp, open, high, low, close, volume, is_closed, ema_23, ema_50, ema_difference, signal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instrument, timeframe, timestamp) DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        is_closed = excluded.is_closed,
        ema_23 = excluded.ema_23,
        ema_50 = excluded.ema_50,
        ema_difference = excluded.ema_difference,
        signal = excluded.signal
    `);

    const tx = this.db.transaction((items: Ema15mCandle[]) => {
      for (const candle of items) {
        stmt.run(
          candle.instrument,
          candle.timeframe || '15m',
          candle.timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume || 0,
          candle.isClosed ? 1 : 0,
          candle.ema23 ?? null,
          candle.ema50 ?? null,
          candle.emaDifference ?? null,
          candle.signal ?? null
        );
      }
    });

    try {
      tx(candles);
    } catch (err) {
      console.error('[DB] Error batch saving EMA candles:', err);
    }
  }

  public getEma15mCandles(instrument: string, limit: number = 200, fromDate?: string, toDate?: string): Ema15mCandle[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (fromDate && toDate) {
        rows = this.db.prepare(`
          SELECT * FROM ema_15m_candles
          WHERE instrument = ? AND timeframe = '15m' AND timestamp >= ? AND timestamp <= ?
          ORDER BY timestamp ASC
        `).all(instrument, fromDate, toDate) as any[];
      } else {
        rows = this.db.prepare(`
          SELECT * FROM (
            SELECT * FROM ema_15m_candles
            WHERE instrument = ? AND timeframe = '15m'
            ORDER BY timestamp DESC LIMIT ?
          ) ORDER BY timestamp ASC
        `).all(instrument, limit) as any[];
      }

      return rows.map(r => ({
        id: String(r.id),
        instrument: r.instrument,
        timeframe: r.timeframe,
        timestamp: r.timestamp,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        isClosed: r.is_closed === 1,
        ema23: r.ema_23 !== null ? Number(r.ema_23) : undefined,
        ema50: r.ema_50 !== null ? Number(r.ema_50) : undefined,
        emaDifference: r.ema_difference !== null ? Number(r.ema_difference) : undefined,
        signal: r.signal || undefined
      }));
    } catch (err) {
      console.error(`[DB] Error fetching EMA candles for ${instrument}:`, err);
      return [];
    }
  }

  public purgeCorruptEmaCandles(instrument: string, minPrice: number): void {
    if (!this.db) return;
    try {
      this.db.prepare(`DELETE FROM ema_15m_candles WHERE instrument = ? AND close < ?`).run(instrument, minPrice);
      this.db.prepare(`DELETE FROM ema_15m_signals WHERE instrument = ? AND price < ?`).run(instrument, minPrice);
      this.db.prepare(`DELETE FROM ema_paper_trades WHERE instrument = ? AND entry_price < ?`).run(instrument, minPrice);
    } catch (err) {
      console.error(`[DB] Error purging corrupt EMA candles for ${instrument}:`, err);
    }
  }

  public getLatestEma15mCandle(instrument: string): Ema15mCandle | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`
        SELECT * FROM ema_15m_candles
        WHERE instrument = ? AND timeframe = '15m'
        ORDER BY timestamp DESC LIMIT 1
      `).get(instrument) as any;

      if (!row) return null;
      return {
        id: String(row.id),
        instrument: row.instrument,
        timeframe: row.timeframe,
        timestamp: row.timestamp,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        isClosed: row.is_closed === 1,
        ema23: row.ema_23 !== null ? Number(row.ema_23) : undefined,
        ema50: row.ema_50 !== null ? Number(row.ema_50) : undefined,
        emaDifference: row.ema_difference !== null ? Number(row.ema_difference) : undefined,
        signal: row.signal || undefined
      };
    } catch (err) {
      console.error(`[DB] Error fetching latest EMA candle for ${instrument}:`, err);
      return null;
    }
  }

  /**
   * Persists an EMA 15m crossover signal atomically with unique constraint.
   * Returns true if newly inserted, false if duplicate already existed.
   */
  public saveEma15mSignal(signal: Ema15mSignal): boolean {
    if (!this.db) return false;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ema_15m_signals (
          id, instrument, timeframe, signal_type, price, ema_23, ema_50, ema_difference, candle_timestamp, signal_confirmed_at, user_id, notification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instrument, timeframe, candle_timestamp, signal_type) DO NOTHING
      `);

      const info = stmt.run(
        signal.id,
        signal.instrument,
        signal.timeframe || '15m',
        signal.signalType,
        signal.price,
        signal.ema23,
        signal.ema50,
        signal.emaDifference,
        signal.candleTimestamp,
        signal.signalConfirmedAt,
        signal.userId || null,
        signal.notificationStatus || 'PENDING'
      );

      return info.changes > 0;
    } catch (err) {
      console.error('[DB] Error saving EMA signal:', err);
      return false;
    }
  }

  public updateEmaSignalNotificationStatus(signalId: string, status: string): void {
    if (!this.db) return;
    try {
      this.db.prepare(`UPDATE ema_15m_signals SET notification_status = ? WHERE id = ?`).run(status, signalId);
    } catch (err) {
      console.error('[DB] Error updating signal notification status:', err);
    }
  }

  public getEma15mSignals(instrument?: string, signalType?: string, limit: number = 100): Ema15mSignal[] {
    if (!this.db) return [];
    try {
      let query = 'SELECT * FROM ema_15m_signals WHERE 1=1';
      const params: any[] = [];

      if (instrument && instrument !== 'ALL') {
        query += ' AND instrument = ?';
        params.push(instrument);
      }
      if (signalType && signalType !== 'ALL') {
        query += ' AND signal_type = ?';
        params.push(signalType);
      }

      query += ' ORDER BY candle_timestamp DESC LIMIT ?';
      params.push(limit);

      const rows = this.db.prepare(query).all(...params) as any[];
      return rows.map(r => ({
        id: r.id,
        instrument: r.instrument,
        timeframe: r.timeframe,
        signalType: r.signal_type,
        price: r.price,
        ema23: r.ema_23,
        ema50: r.ema_50,
        emaDifference: r.ema_difference,
        candleTimestamp: r.candle_timestamp,
        signalConfirmedAt: r.signal_confirmed_at,
        createdAt: r.created_at,
        userId: r.user_id || undefined,
        notificationStatus: r.notification_status
      }));
    } catch (err) {
      console.error('[DB] Error fetching EMA signals:', err);
      return [];
    }
  }

  public getLatestEma15mSignal(instrument: string): Ema15mSignal | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`
        SELECT * FROM ema_15m_signals
        WHERE instrument = ?
        ORDER BY candle_timestamp DESC LIMIT 1
      `).get(instrument) as any;

      if (!row) return null;
      return {
        id: row.id,
        instrument: row.instrument,
        timeframe: row.timeframe,
        signalType: row.signal_type,
        price: row.price,
        ema23: row.ema_23,
        ema50: row.ema_50,
        emaDifference: row.ema_difference,
        candleTimestamp: row.candle_timestamp,
        signalConfirmedAt: row.signal_confirmed_at,
        createdAt: row.created_at,
        userId: row.user_id || undefined,
        notificationStatus: row.notification_status
      };
    } catch (err) {
      console.error(`[DB] Error fetching latest signal for ${instrument}:`, err);
      return null;
    }
  }

  public logEmaNotification(log: EmaNotificationLog): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO ema_notification_logs (
          id, signal_id, channel, status, attempted_at, error_message, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        log.id,
        log.signalId,
        log.channel,
        log.status,
        log.attemptedAt || new Date().toISOString(),
        log.errorMessage || null,
        log.payload ? JSON.stringify(log.payload) : null
      );
    } catch (err) {
      console.error('[DB] Error logging EMA notification:', err);
    }
  }

  public getEmaNotificationLogs(signalId?: string, limit: number = 50): EmaNotificationLog[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (signalId) {
        rows = this.db.prepare(`
          SELECT * FROM ema_notification_logs WHERE signal_id = ? ORDER BY attempted_at DESC LIMIT ?
        `).all(signalId, limit) as any[];
      } else {
        rows = this.db.prepare(`
          SELECT * FROM ema_notification_logs ORDER BY attempted_at DESC LIMIT ?
        `).all(limit) as any[];
      }

      return rows.map(r => ({
        id: r.id,
        signalId: r.signal_id,
        channel: r.channel,
        status: r.status,
        attemptedAt: r.attempted_at,
        errorMessage: r.error_message || undefined,
        payload: r.payload_json ? JSON.parse(r.payload_json) : undefined
      }));
    } catch (err) {
      console.error('[DB] Error getting notification logs:', err);
      return [];
    }
  }

  public getEmaNotificationSettings(userId?: string | null): EmaNotificationSettings {
    const defaultSettings: EmaNotificationSettings = {
      userId: userId || 'GLOBAL',
      telegramEnabled: true,
      emailEnabled: false,
      browserEnabled: true,
      soundEnabled: true,
      autoPaperTradingEnabled: true,
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      emailAddress: process.env.SMTP_USER || '',
      soundVolume: 0.8
    };

    if (!this.db) return defaultSettings;
    try {
      const uId = userId || 'GLOBAL';
      const row = this.db.prepare(`SELECT * FROM ema_notification_settings WHERE user_id = ?`).get(uId) as any;
      if (!row) return defaultSettings;
      return {
        userId: row.user_id,
        telegramEnabled: row.telegram_enabled === 1,
        emailEnabled: row.email_enabled === 1,
        browserEnabled: row.browser_enabled === 1,
        soundEnabled: row.sound_enabled === 1,
        autoPaperTradingEnabled: row.auto_paper_trading_enabled !== undefined ? row.auto_paper_trading_enabled === 1 : true,
        telegramChatId: row.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '',
        emailAddress: row.email_address || process.env.SMTP_USER || '',
        soundVolume: row.sound_volume !== null ? Number(row.sound_volume) : 0.8,
        updatedAt: row.updated_at
      };
    } catch {
      return defaultSettings;
    }
  }

  public saveEmaNotificationSettings(settings: EmaNotificationSettings, userId?: string | null): void {
    if (!this.db) return;
    try {
      const uId = userId || settings.userId || 'GLOBAL';
      this.db.prepare(`
        INSERT INTO ema_notification_settings (
          user_id, telegram_enabled, email_enabled, browser_enabled, sound_enabled, auto_paper_trading_enabled, telegram_chat_id, email_address, sound_volume, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          telegram_enabled = excluded.telegram_enabled,
          email_enabled = excluded.email_enabled,
          browser_enabled = excluded.browser_enabled,
          sound_enabled = excluded.sound_enabled,
          auto_paper_trading_enabled = excluded.auto_paper_trading_enabled,
          telegram_chat_id = excluded.telegram_chat_id,
          email_address = excluded.email_address,
          sound_volume = excluded.sound_volume,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        uId,
        settings.telegramEnabled ? 1 : 0,
        settings.emailEnabled ? 1 : 0,
        settings.browserEnabled ? 1 : 0,
        settings.soundEnabled ? 1 : 0,
        settings.autoPaperTradingEnabled !== false ? 1 : 0,
        settings.telegramChatId || null,
        settings.emailAddress || null,
        settings.soundVolume ?? 0.8
      );
    } catch (err) {
      console.error('[DB] Error saving notification settings:', err);
    }
  }

  // ========================================================
  // 15-MINUTE 23/50 EMA AUTOMATIC PAPER TRADING PERSISTENCE
  // ========================================================

  public saveEmaPaperTrade(trade: EmaPaperTrade): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO ema_paper_trades (
          id, signal_id, instrument, direction, entry_timestamp, entry_price, quantity, lot_size, strategy, source, status, current_price, unrealized_pnl, exit_timestamp, exit_price, exit_reason, gross_pnl, brokerage, charges, net_pnl, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          current_price = excluded.current_price,
          unrealized_pnl = excluded.unrealized_pnl,
          status = excluded.status,
          exit_timestamp = excluded.exit_timestamp,
          exit_price = excluded.exit_price,
          exit_reason = excluded.exit_reason,
          gross_pnl = excluded.gross_pnl,
          brokerage = excluded.brokerage,
          charges = excluded.charges,
          net_pnl = excluded.net_pnl,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        trade.id,
        trade.signalId,
        trade.instrument,
        trade.direction,
        trade.entryTimestamp,
        trade.entryPrice,
        trade.quantity,
        trade.lotSize,
        trade.strategy || 'EMA_15M_23_50',
        trade.source || 'UPSTOX_LIVE',
        trade.status || 'OPEN',
        trade.currentPrice,
        trade.unrealizedPnl || 0,
        trade.exitTimestamp || null,
        trade.exitPrice !== undefined && trade.exitPrice !== null ? trade.exitPrice : null,
        trade.exitReason || null,
        trade.grossPnl || 0,
        trade.brokerage !== undefined ? trade.brokerage : 40,
        trade.charges || 0,
        trade.netPnl || 0,
        trade.createdAt || new Date().toISOString(),
        trade.updatedAt || new Date().toISOString()
      );
    } catch (err) {
      console.error('[DB] Error saving EMA paper trade:', err);
    }
  }

  public getEmaPaperTrades(instrument?: string, status?: string, limit: number = 100): EmaPaperTrade[] {
    if (!this.db) return [];
    try {
      let query = 'SELECT * FROM ema_paper_trades WHERE 1=1';
      const params: any[] = [];

      if (instrument && instrument !== 'ALL') {
        query += ' AND instrument = ?';
        params.push(instrument);
      }
      if (status && status !== 'ALL') {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const rows = this.db.prepare(query).all(...params) as any[];
      return rows.map(r => ({
        id: r.id,
        signalId: r.signal_id,
        instrument: r.instrument,
        direction: r.direction,
        entryTimestamp: r.entry_timestamp,
        entryPrice: Number(r.entry_price),
        quantity: Number(r.quantity),
        lotSize: Number(r.lot_size),
        strategy: r.strategy,
        source: r.source,
        status: r.status,
        currentPrice: Number(r.current_price),
        unrealizedPnl: Number(r.unrealized_pnl || 0),
        exitTimestamp: r.exit_timestamp || null,
        exitPrice: r.exit_price !== null ? Number(r.exit_price) : null,
        exitReason: r.exit_reason || null,
        grossPnl: Number(r.gross_pnl || 0),
        brokerage: Number(r.brokerage || 40),
        charges: Number(r.charges || 0),
        netPnl: Number(r.net_pnl || 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
    } catch (err) {
      console.error('[DB] Error fetching EMA paper trades:', err);
      return [];
    }
  }

  public getOpenEmaPaperTradeByInstrument(instrument: string): EmaPaperTrade | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(`
        SELECT * FROM ema_paper_trades WHERE instrument = ? AND status = 'OPEN' ORDER BY created_at DESC LIMIT 1
      `).get(instrument) as any;

      if (!row) return null;
      return {
        id: row.id,
        signalId: row.signal_id,
        instrument: row.instrument,
        direction: row.direction,
        entryTimestamp: row.entry_timestamp,
        entryPrice: Number(row.entry_price),
        quantity: Number(row.quantity),
        lotSize: Number(row.lot_size),
        strategy: row.strategy,
        source: row.source,
        status: row.status,
        currentPrice: Number(row.current_price),
        unrealizedPnl: Number(row.unrealized_pnl || 0),
        exitTimestamp: row.exit_timestamp || null,
        exitPrice: row.exit_price !== null ? Number(row.exit_price) : null,
        exitReason: row.exit_reason || null,
        grossPnl: Number(row.gross_pnl || 0),
        brokerage: Number(row.brokerage || 40),
        charges: Number(row.charges || 0),
        netPnl: Number(row.net_pnl || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (err) {
      console.error(`[DB] Error fetching open trade for ${instrument}:`, err);
      return null;
    }
  }

  public closeEmaPaperTrade(id: string, exitPrice: number, exitReason: string = 'MANUAL', exitTimestamp?: string): boolean {
    if (!this.db) return false;
    try {
      const trade = this.db.prepare(`SELECT * FROM ema_paper_trades WHERE id = ? AND status = 'OPEN'`).get(id) as any;
      if (!trade) return false;

      const entryPrice = Number(trade.entry_price);
      const qty = Number(trade.quantity);
      const isLong = trade.direction === 'LONG';
      const grossPnl = Number((isLong ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty).toFixed(2));
      const brokerage = 40; // ₹40 round trip (₹20 entry + ₹20 exit)
      const netPnl = Number((grossPnl - brokerage).toFixed(2));
      const now = exitTimestamp || new Date().toISOString();

      const res = this.db.prepare(`
        UPDATE ema_paper_trades SET
          status = 'CLOSED',
          current_price = ?,
          exit_price = ?,
          exit_timestamp = ?,
          exit_reason = ?,
          gross_pnl = ?,
          brokerage = ?,
          net_pnl = ?,
          unrealized_pnl = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'OPEN'
      `).run(exitPrice, exitPrice, now, exitReason, grossPnl, brokerage, netPnl, id);

      return res.changes > 0;
    } catch (err) {
      console.error(`[DB] Error closing EMA paper trade ${id}:`, err);
      return false;
    }
  }

  public updateEmaPaperTradePrices(instrument: string, currentPrice: number): void {
    if (!this.db) return;
    try {
      const openTrades = this.db.prepare(`SELECT * FROM ema_paper_trades WHERE instrument = ? AND status = 'OPEN'`).all(instrument) as any[];
      if (openTrades.length === 0) return;

      const stmt = this.db.prepare(`
        UPDATE ema_paper_trades SET
          current_price = ?,
          unrealized_pnl = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      for (const t of openTrades) {
        const entryPrice = Number(t.entry_price);
        const qty = Number(t.quantity);
        const isLong = t.direction === 'LONG';
        const unrealizedPnl = Number((isLong ? (currentPrice - entryPrice) * qty : (entryPrice - currentPrice) * qty).toFixed(2));
        stmt.run(currentPrice, unrealizedPnl, t.id);
      }
    } catch (err) {
      console.error(`[DB] Error updating EMA paper trade prices for ${instrument}:`, err);
    }
  }

  public getEmaPaperTradingSummary(): EmaPaperTradingSummary {
    const defaultSummary: EmaPaperTradingSummary = {
      totalTrades: 0,
      openTradesCount: 0,
      closedTradesCount: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePercent: 0,
      realizedGrossPnl: 0,
      realizedBrokerage: 0,
      realizedNetPnl: 0,
      unrealizedPnl: 0,
      totalNetPnl: 0,
      autoTradingEnabled: true
    };

    if (!this.db) return defaultSummary;
    try {
      const allTrades = this.db.prepare(`SELECT * FROM ema_paper_trades`).all() as any[];
      const openTrades = allTrades.filter(t => t.status === 'OPEN');
      const closedTrades = allTrades.filter(t => t.status === 'CLOSED');

      let realizedGrossPnl = 0;
      let realizedBrokerage = 0;
      let realizedNetPnl = 0;
      let winningTrades = 0;
      let losingTrades = 0;

      for (const ct of closedTrades) {
        const net = Number(ct.net_pnl || 0);
        realizedGrossPnl += Number(ct.gross_pnl || 0);
        realizedBrokerage += Number(ct.brokerage || 40);
        realizedNetPnl += net;
        if (net > 0) winningTrades++;
        else if (net < 0) losingTrades++;
      }

      let unrealizedPnl = 0;
      for (const ot of openTrades) {
        unrealizedPnl += Number(ot.unrealized_pnl || 0);
      }

      const totalTrades = allTrades.length;
      const winRatePercent = closedTrades.length > 0 ? Number(((winningTrades / closedTrades.length) * 100).toFixed(1)) : 0;
      const totalNetPnl = Number((realizedNetPnl + unrealizedPnl).toFixed(2));

      const settings = this.getEmaNotificationSettings('GLOBAL');

      return {
        totalTrades,
        openTradesCount: openTrades.length,
        closedTradesCount: closedTrades.length,
        winningTrades,
        losingTrades,
        winRatePercent,
        realizedGrossPnl: Number(realizedGrossPnl.toFixed(2)),
        realizedBrokerage: Number(realizedBrokerage.toFixed(2)),
        realizedNetPnl: Number(realizedNetPnl.toFixed(2)),
        unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
        totalNetPnl,
        autoTradingEnabled: settings.autoPaperTradingEnabled !== false
      };
    } catch (err) {
      console.error('[DB] Error computing EMA paper trading summary:', err);
      return defaultSummary;
    }
  }
}

export const dbEngine = new DatabaseEngine();
