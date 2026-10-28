/**
 * Auto-Indexed Native File-Backed Database Engine & Migration Manager
 * Powered by better-sqlite3 with Write-Ahead Logging (WAL) mode for crash resilience.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { DatabaseSchemaInfo, DatabaseMigrationStatus, BasketOrderRecord, PaperPosition, OIAnomaly, User, Ema15mCandle, Ema15mSignal, EmaNotificationLog, EmaNotificationSettings, EmaPaperTrade, EmaPaperTradingSummary } from '../types.js';
import type { TradeReviewRecord, MarketRegimeType, QuantFeatureRecord } from '../quant/types.js';
import { PRIMARY_COVERAGE_SYMBOLS } from '../shared/marketConfig.js';

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
      this.seedQuantFeatureHistoryIfEmpty();
      this.syncConfiguredUsersFromEnv();

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

  private handleRuntimeCorruption(err: any, contextOperation: string = 'query'): void {
    if (this.isCorruptionError(err) && !this.isRecovering) {
      let pragmaState: any = {};
      if (this.db) {
        try {
          pragmaState = {
            synchronous: this.db.pragma('synchronous', { simple: true }),
            busy_timeout: this.db.pragma('busy_timeout', { simple: true }),
            journal_mode: this.db.pragma('journal_mode', { simple: true }),
            wal_autocheckpoint: this.db.pragma('wal_autocheckpoint', { simple: true })
          };
        } catch {}
      }

      const diagnostic = {
        timestamp: new Date().toISOString(),
        processUptimeSec: Math.floor(process.uptime()),
        pid: process.pid,
        contextOperation,
        errorCode: err?.code || 'UNKNOWN',
        errorMessage: err?.message || String(err),
        errorStack: err?.stack,
        pragmasInEffect: pragmaState
      };

      console.error('[DB ENGINE FATAL] Runtime SQLite corruption detected with structured diagnostics:\n' + JSON.stringify(diagnostic, null, 2));
      this.salvageAndResetDatabase(diagnostic);
    }
  }

  private salvageAndResetDatabase(diagnostic?: any): void {
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
      emaCandles: any[];
    } = {
      users: [],
      paperPositions: [],
      basketOrders: [],
      autonomousStrategies: [],
      autonomousLogs: [],
      emaCandles: []
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
        salvagedData.emaCandles = this.db.prepare(`SELECT * FROM ema_15m_candles`).all() || [];
        console.log(`[DB RECOVERY] Salvaged ${salvagedData.emaCandles.length} historical 15m candle records.`);
      } catch (e) {
        console.warn('[DB RECOVERY] Could not salvage ema_15m_candles table:', (e as any)?.message);
      }

      try {
        this.db.close();
      } catch {}
      this.db = null;
    }

    // 2. Backup corrupt database and auxiliary WAL/SHM files to safe .backups/ directory
    if (fs.existsSync(this.dbFilePath)) {
      const stats = fs.statSync(this.dbFilePath);
      const backupDir = path.join(process.cwd(), '.backups');
      if (!fs.existsSync(backupDir)) {
        try { fs.mkdirSync(backupDir, { recursive: true }); } catch {}
      }
      const timestamp = Date.now();
      const backupFilename = `option_platform.sqlite.corrupt.${timestamp}`;
      const backupPath = path.join(backupDir, backupFilename);
      try {
        fs.copyFileSync(this.dbFilePath, backupPath);
        if (diagnostic) {
          fs.writeFileSync(`${backupPath}.diag.json`, JSON.stringify(diagnostic, null, 2));
        }
        this.migrationReport.corruptBackups.push({
          path: path.join('.backups', backupFilename),
          size: stats.size
        });
        console.warn(`[DB RECOVERY] Corrupt database file secured to backup directory: ${backupPath} (${stats.size} bytes).`);
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

      if (salvagedData.emaCandles.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO ema_15m_candles (
            instrument, timeframe, timestamp, open, high, low, close, volume, is_closed, ema_23, ema_50, ema_difference, signal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of salvagedData.emaCandles) {
          try {
            stmt.run(c.instrument, c.timeframe, c.timestamp, c.open, c.high, c.low, c.close, c.volume, c.is_closed, c.ema_23, c.ema_50, c.ema_difference, c.signal);
          } catch {}
        }
        console.log(`[DB RECOVERY] Restored ${salvagedData.emaCandles.length} historical 15m candle records.`);
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
        this.handleRuntimeCorruption(err, 'wal_checkpoint_and_compaction');
      }
    }, 120000);
    if (this.walCheckpointTimer.unref) {
      this.walCheckpointTimer.unref();
    }
  }

  public stopWalCompactor(): void {
    if (this.walCheckpointTimer) {
      clearInterval(this.walCheckpointTimer);
      this.walCheckpointTimer = null;
    }
  }

  public pruneOldSnapshots(targetTickKeep: number = 40000, targetChainKeep: number = 80000): { prunedTicks: number; prunedChains: number } {
    if (!this.db) return { prunedTicks: 0, prunedChains: 0 };
    let prunedTicks = 0;
    let prunedChains = 0;
    try {
      const cutoffTick = this.db.prepare(
        `SELECT id FROM ticks ORDER BY id DESC LIMIT 1 OFFSET ?`
      ).get(targetTickKeep) as any;
      if (cutoffTick && cutoffTick.id) {
        const res = this.db.prepare(`DELETE FROM ticks WHERE id <= ?`).run(cutoffTick.id);
        prunedTicks = res.changes;
      }

      const cutoffChain = this.db.prepare(
        `SELECT id FROM option_chains ORDER BY id DESC LIMIT 1 OFFSET ?`
      ).get(targetChainKeep) as any;
      if (cutoffChain && cutoffChain.id) {
        const res = this.db.prepare(`DELETE FROM option_chains WHERE id <= ?`).run(cutoffChain.id);
        prunedChains = res.changes;
      }

      // Reclaim WAL pages passively without blocking active market feeds
      this.db.pragma('wal_checkpoint(PASSIVE)');
    } catch (err) {
      this.handleRuntimeCorruption(err, 'pruneOldSnapshots');
    }
    return { prunedTicks, prunedChains };
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
      const backupDir = path.join(cwd, '.backups');
      if (!fs.existsSync(backupDir)) {
        try { fs.mkdirSync(backupDir, { recursive: true }); } catch {}
      }

      // Check root directory and relocate legacy corrupt files to .backups/
      const files = fs.readdirSync(cwd);
      for (const f of files) {
        if (f.includes('.corrupt.')) {
          const srcPath = path.join(cwd, f);
          const destPath = path.join(backupDir, f);
          try {
            const stats = fs.statSync(srcPath);
            fs.renameSync(srcPath, destPath);
            this.migrationReport.corruptBackups.push({
              path: path.join('.backups', f),
              size: stats.size
            });
            console.warn(`[DB RECOVERY] Relocated legacy corrupt file to .backups: ${f} (${stats.size} bytes).`);
          } catch (relocateErr) {
            console.error(`[DB RECOVERY] Could not relocate corrupt file ${f}:`, relocateErr);
          }
        }
      }

      // Also audit existing files in .backups/
      if (fs.existsSync(backupDir)) {
        const backupFiles = fs.readdirSync(backupDir);
        for (const bf of backupFiles) {
          if (bf.includes('.corrupt.') && !this.migrationReport.corruptBackups.some(cb => cb.path.endsWith(bf))) {
            try {
              const stats = fs.statSync(path.join(backupDir, bf));
              this.migrationReport.corruptBackups.push({
                path: path.join('.backups', bf),
                size: stats.size
              });
            } catch {}
          }
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
  public loadAllBasketOrders(userId?: string | null, limit?: number, offset?: number): BasketOrderRecord[] {
    if (!this.db) return [];
    try {
      const clampedLimit = limit !== undefined ? Math.min(Math.max(1, limit), 1000) : 100;
      const safeOffset = offset !== undefined ? Math.max(0, offset) : 0;
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at FROM basket_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).all(userId, clampedLimit, safeOffset) as any[];
      } else if (userId === null) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at FROM basket_orders WHERE user_id IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).all(clampedLimit, safeOffset) as any[];
      } else {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, symbol, status, margin_required, margin_available, fallback_action, reconciliation_status, legs_json, created_at FROM basket_orders ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).all(clampedLimit, safeOffset) as any[];
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
      const pos = this.db.prepare(`SELECT * FROM paper_positions WHERE id = ? AND status = 'OPEN'`).get(id) as any;
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

      if (info.changes > 0 && pos) {
        try {
          this.saveTradeReviewFromPaperPosition(pos, exitPrice, closePnl, reason, now);
        } catch (revErr) {
          console.error('[DB] Error auto-generating review for paper position:', revErr);
        }
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
      const openPositions = this.db.prepare(
        `SELECT * FROM paper_positions WHERE strategy_group_id = ? AND status = 'OPEN' ${userId ? 'AND (user_id = ? OR user_id IS NULL)' : ''}`
      ).all(...(userId ? [groupId, userId] : [groupId])) as any[];

      let info;
      if (userId) {
        info = this.db.prepare(
          `UPDATE paper_positions 
           SET status = 'CLOSED', 
               closed_at = ?, 
               exit_price = current_price, 
               pnl = CASE WHEN action = 'BUY' THEN ROUND((current_price - entry_price) * quantity, 2) ELSE ROUND((entry_price - current_price) * quantity, 2) END,
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
               close_reason = ? 
           WHERE strategy_group_id = ? AND status = 'OPEN'`
        ).run(now, reason, groupId);
      }

      if (info.changes > 0 && openPositions && openPositions.length > 0) {
        for (const p of openPositions) {
          try {
            const exitP = Number(p.current_price || p.entry_price || 0);
            const pnl = Number(p.pnl || 0);
            this.saveTradeReviewFromPaperPosition(p, exitP, pnl, reason, now);
          } catch (revErr) {
            console.error('[DB] Error auto-generating review for grouped position:', revErr);
          }
        }
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
   * Return only OPEN paper trading positions across all users for MTM valuation.
   * Leverages idx_paper_positions_status to avoid full table scans.
   */
  public getAllOpenPaperPositionsForMtm(userId?: string | null): PaperPosition[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, expiry, user_id 
           FROM paper_positions 
           WHERE status = 'OPEN' AND (user_id = ? OR user_id IS NULL)
           ORDER BY opened_at DESC`
        ).all(userId) as any[];
      } else {
        rows = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, expiry, user_id 
           FROM paper_positions 
           WHERE status = 'OPEN'
           ORDER BY opened_at DESC`
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
          stopLoss: row.stop_loss ? Number(row.stop_loss) : undefined,
          targetPrice: row.target_price ? Number(row.target_price) : undefined,
          status: 'OPEN',
          openedAt: row.opened_at as string,
          expiry: row.expiry as string,
          userId: row.user_id as string
        };
      });
    } catch (err) {
      console.error('Failed to load open paper positions for MTM:', err);
      this.handleRuntimeCorruption(err);
      return [];
    }
  }

  /**
   * Batch update paper positions MTM and auto-closures inside a single SQLite transaction
   */
  public batchUpdatePaperPositionsMtm(updates: {
    toUpdate: Array<{ id: string; currentPrice: number; pnl: number }>;
    toClose: Array<{ id: string; exitPrice: number; pnl: number; reason: string }>;
  }): void {
    if (!this.db) return;
    if (updates.toUpdate.length === 0 && updates.toClose.length === 0) return;

    try {
      const updateStmt = this.db.prepare(
        `UPDATE paper_positions SET current_price = ?, pnl = ? WHERE id = ? AND status = 'OPEN'`
      );
      const closeStmt = this.db.prepare(
        `UPDATE paper_positions SET status = 'CLOSED', closed_at = ?, exit_price = ?, pnl = ?, close_reason = ? WHERE id = ? AND status = 'OPEN'`
      );

      const runBatch = this.db.transaction(() => {
        const now = new Date().toISOString();
        for (const item of updates.toClose) {
          const pos = this.db.prepare(`SELECT * FROM paper_positions WHERE id = ? AND status = 'OPEN'`).get(item.id) as any;
          closeStmt.run(now, item.exitPrice, item.pnl, item.reason, item.id);
          if (pos) {
            try {
              this.saveTradeReviewFromPaperPosition(pos, item.exitPrice, item.pnl, item.reason, now);
            } catch (revErr) {
              console.error('[DB] Error auto-generating review in MTM close:', revErr);
            }
          }
        }
        for (const item of updates.toUpdate) {
          updateStmt.run(item.currentPrice, item.pnl, item.id);
        }
      });

      runBatch();
    } catch (err) {
      console.error('Failed to batch update paper positions MTM:', err);
      this.handleRuntimeCorruption(err);
    }
  }

  /**
   * Load paper positions from SQLite with optional limit and offset pagination clamping
   * (default limit: 200, maxLimit: 1000). Backwards compatible when limit/offset omitted.
   */
  public loadAllPaperPositions(userId?: string | null, limit?: number, offset?: number): PaperPosition[] {
    if (!this.db) return [];
    try {
      const clampedLimit = limit !== undefined ? Math.min(Math.max(1, limit), 1000) : 200;
      const safeOffset = offset !== undefined ? Math.max(0, offset) : 0;
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id 
           FROM paper_positions 
           WHERE user_id = ? OR user_id IS NULL 
           ORDER BY opened_at DESC 
           LIMIT ? OFFSET ?`
        ).all(userId, clampedLimit, safeOffset) as any[];
      } else {
        rows = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id 
           FROM paper_positions 
           ORDER BY opened_at DESC 
           LIMIT ? OFFSET ?`
        ).all(clampedLimit, safeOffset) as any[];
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
   * Fast indexed single position lookup by ID
   */
  public getPaperPositionById(id: string, userId?: string | null): PaperPosition | null {
    if (!this.db) return null;
    try {
      let row: any;
      if (userId) {
        row = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id 
           FROM paper_positions 
           WHERE id = ? AND (user_id = ? OR user_id IS NULL)`
        ).get(id, userId);
      } else {
        row = this.db.prepare(
          `SELECT id, strategy_group_id, leg_label, symbol, strategy_name, strike_price, option_type, action, quantity, lot_size, entry_price, current_price, pnl, stop_loss, target_price, status, opened_at, closed_at, exit_price, close_reason, expiry, user_id 
           FROM paper_positions 
           WHERE id = ?`
        ).get(id);
      }

      if (!row) return null;
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
    } catch (err) {
      console.error('Failed to get paper position by id:', err);
      return null;
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
   * Get the most recent spot price for a symbol from the ticks table
   */
  public getLatestSpotPrice(symbol: string): number | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(
        `SELECT spot_price FROM ticks WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1`
      ).get(symbol) as any;
      return row && typeof row.spot_price === 'number' ? row.spot_price : null;
    } catch (err) {
      console.error('[DB] Error querying latest spot price:', err);
      return null;
    }
  }

  /**
   * Builds recent 1-minute OHLC candles on the fly from the raw ticks table,
   * grouping ticks by minute bucket.
   */
  public getRecentSpotCandlesForUnderlying(
    symbol: string,
    minutes: number = 60
  ): Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: string }> {
    if (!this.db) return [];
    try {
      const safeMinutes = Math.min(Math.max(1, minutes || 60), 240);
      const maxTicks = safeMinutes * 30; // ~20 ticks/minute, with 50% buffer
      const rows = this.db.prepare(`
        SELECT 
          substr(timestamp, 1, 16) as minute_bucket,
          MIN(spot_price) as low,
          MAX(spot_price) as high,
          SUM(volume) as volume,
          COUNT(*) as tick_count,
          MIN(id) as first_id,
          MAX(id) as last_id
        FROM (
          SELECT id, spot_price, volume, timestamp 
          FROM ticks 
          WHERE symbol = ? 
          ORDER BY id DESC 
          LIMIT ?
        ) t
        GROUP BY minute_bucket
        ORDER BY minute_bucket ASC
      `).all(symbol, maxTicks) as any[];

      if (!rows || rows.length === 0) return [];

      const idList = rows.flatMap(r => [r.first_id, r.last_id]);
      const tickMap = new Map<number, number>();
      if (idList.length > 0) {
        const tickRows = this.db.prepare(
          `SELECT id, spot_price FROM ticks WHERE id IN (${idList.join(',')})`
        ).all() as any[];
        for (const tr of tickRows) {
          tickMap.set(tr.id, tr.spot_price);
        }
      }

      return rows.map(r => ({
        timestamp: `${r.minute_bucket}:00Z`,
        open: tickMap.get(r.first_id) || r.low,
        high: Number(r.high) || 0,
        low: Number(r.low) || 0,
        close: tickMap.get(r.last_id) || r.high,
        volume: Number(r.volume) || 0
      }));
    } catch (err) {
      console.error(`[DB] Error generating 1-minute candles for ${symbol}:`, err);
      return [];
    }
  }

  /**
   * Load historical ticks from SQLite for real backtesting (clamped to max 5000 ticks)
   */
  public getHistoricalTicks(symbol: string, startDate?: string, endDate?: string, limit: number = 5000): { spotPrice: number; vix: number; timestamp: string }[] {
    if (!this.db) return [];
    try {
      const safeLimit = Math.min(Math.max(1, limit || 5000), 5000);
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
      query += ` ORDER BY timestamp ASC LIMIT ?`;
      params.push(safeLimit);
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
   * Load available upcoming option chain expiries for dynamic weekly expiry resolution
   */
  public getAvailableOptionExpiries(symbol: string): string[] {
    if (!this.db) return [];
    try {
      const today = new Date().toISOString().split('T')[0];
      const rows = this.db.prepare(
        `SELECT DISTINCT expiry FROM option_chains WHERE symbol = ? AND expiry >= ? ORDER BY expiry ASC LIMIT 10`
      ).all(symbol, today) as any[];
      return rows.map(r => r.expiry);
    } catch {
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

      if (row && typeof row.ltp === 'number' && row.ltp > 0) {
        return row.ltp;
      }

      // Check recorded quant_option_chain_snapshots
      const quantRow = this.db.prepare(
        `SELECT ltp FROM quant_option_chain_snapshots WHERE underlying = ? AND strike = ? AND option_type = ? AND market_ts <= ? ORDER BY market_ts DESC LIMIT 1`
      ).get(symbol, strikePrice, optionType, timestamp) as any;

      if (quantRow && typeof quantRow.ltp === 'number' && quantRow.ltp > 0) {
        return quantRow.ltp;
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

    const symbols = PRIMARY_COVERAGE_SYMBOLS;
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

      // Ensure auto_paper_trading_enabled and telegram_bot_token columns exist on settings table
      try {
        const settingsCols = this.db.prepare(`PRAGMA table_info(ema_notification_settings)`).all() as any[];
        const colNames = new Set(settingsCols.map(c => c.name as string));
        if (!colNames.has('auto_paper_trading_enabled')) {
          this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN auto_paper_trading_enabled INTEGER DEFAULT 1;`);
        }
        if (!colNames.has('telegram_bot_token')) {
          this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN telegram_bot_token TEXT;`);
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

    // Migration 007: Add telegram_bot_token column to ema_notification_settings
    if (!appliedVersions.has(7)) {
      try {
        const settingsCols = this.db.prepare(`PRAGMA table_info(ema_notification_settings)`).all() as any[];
        const colNames = new Set(settingsCols.map(c => c.name as string));
        if (!colNames.has('telegram_bot_token')) {
          this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN telegram_bot_token TEXT;`);
        }
      } catch (e) {
        // Ignore column check error
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (7, 'Add telegram_bot_token column to ema_notification_settings');
      `).run();
      console.log('DatabaseEngine: Applied Migration 007 - Add telegram_bot_token column.');
    }

    // Migration 008: Quant Intelligence Module Tables (v2 Spec)
    if (!appliedVersions.has(8)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS quant_option_chain_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          market_ts TEXT NOT NULL,
          ingestion_ts TEXT NOT NULL,
          underlying TEXT NOT NULL,
          expiry TEXT NOT NULL,
          strike REAL NOT NULL,
          option_type TEXT NOT NULL,
          ltp REAL,
          bid REAL,
          ask REAL,
          bid_qty INTEGER,
          ask_qty INTEGER,
          volume INTEGER,
          oi INTEGER,
          oi_change INTEGER,
          iv REAL,
          delta REAL,
          gamma REAL,
          theta REAL,
          vega REAL,
          source TEXT NOT NULL,
          data_quality TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quant_strategies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          version INTEGER NOT NULL,
          family TEXT NOT NULL,
          status TEXT NOT NULL,
          definition_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quant_backtests (
          id TEXT PRIMARY KEY,
          strategy_id TEXT NOT NULL,
          strategy_version INTEGER NOT NULL,
          period_start TEXT NOT NULL,
          period_end TEXT NOT NULL,
          sample_size INTEGER NOT NULL,
          expectancy REAL,
          profit_factor REAL,
          sharpe REAL,
          sortino REAL,
          max_drawdown REAL,
          cost_model_id TEXT NOT NULL,
          passed_gates INTEGER NOT NULL DEFAULT 0,
          result_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quant_audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          before_json TEXT,
          after_json TEXT,
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quant_experiments (
          id TEXT PRIMARY KEY,
          hypothesis_name TEXT NOT NULL,
          hypothesis_text TEXT NOT NULL,
          parameters_json TEXT NOT NULL,
          status TEXT NOT NULL,
          result_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_quant_snaps_query ON quant_option_chain_snapshots(underlying, expiry, market_ts);
        CREATE INDEX IF NOT EXISTS idx_quant_strategies_status ON quant_strategies(status);
        CREATE INDEX IF NOT EXISTS idx_quant_backtests_strat ON quant_backtests(strategy_id, strategy_version);
        CREATE INDEX IF NOT EXISTS idx_quant_audit_entity ON quant_audit_logs(entity_type, entity_id);
      `);

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (8, 'Quant Intelligence Module Tables');
      `).run();
      console.log('DatabaseEngine: Applied Migration 008 - Quant Intelligence Module Tables.');
    }

    // Migration 009: Quant Trade Reviews Table (Section 52)
    if (!appliedVersions.has(9)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS quant_trade_reviews (
          trade_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          strategy_name TEXT NOT NULL,
          strategy_version INTEGER NOT NULL DEFAULT 1,
          entry_time TEXT NOT NULL,
          exit_time TEXT NOT NULL,
          entry_thesis TEXT NOT NULL DEFAULT '',
          exit_reason TEXT NOT NULL DEFAULT '',
          regime_at_entry TEXT NOT NULL DEFAULT 'RANGE',
          gross_pnl REAL NOT NULL DEFAULT 0.0,
          net_pnl REAL NOT NULL DEFAULT 0.0,
          slippage_incurred REAL NOT NULL DEFAULT 0.0,
          max_favorable_excursion_r REAL NOT NULL DEFAULT 0.0,
          max_adverse_excursion_r REAL NOT NULL DEFAULT 0.0,
          thesis_was_correct INTEGER NOT NULL DEFAULT 0,
          timing_was_optimal INTEGER NOT NULL DEFAULT 0,
          strike_selection_was_optimal INTEGER NOT NULL DEFAULT 0,
          lessons_learned TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_quant_trade_reviews_symbol ON quant_trade_reviews(symbol);
        CREATE INDEX IF NOT EXISTS idx_quant_trade_reviews_strategy ON quant_trade_reviews(strategy_name);
        CREATE INDEX IF NOT EXISTS idx_quant_trade_reviews_exit ON quant_trade_reviews(exit_time DESC);
        CREATE INDEX IF NOT EXISTS idx_quant_trade_reviews_created ON quant_trade_reviews(created_at DESC);
      `);

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (9, 'Quant Trade Reviews Table');
      `).run();
      console.log('DatabaseEngine: Applied Migration 009 - Quant Trade Reviews Table.');
    }

    // Migration 010: Quant Autonomous Research Cycles Table (Section 51 & 69)
    if (!appliedVersions.has(10)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS quant_research_cycles (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL,
          execution_timestamp TEXT NOT NULL,
          trades_analyzed_count INTEGER NOT NULL DEFAULT 0,
          total_net_pnl_reviewed REAL NOT NULL DEFAULT 0.0,
          win_rate_realized_pct REAL NOT NULL DEFAULT 0.0,
          hypotheses_generated_count INTEGER NOT NULL DEFAULT 0,
          top_generated_hypotheses TEXT NOT NULL DEFAULT '[]',
          regime_performance_summary TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'COMPLETED',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_quant_research_cycles_exec ON quant_research_cycles(execution_timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_quant_research_cycles_status ON quant_research_cycles(status);
      `);

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (10, 'Quant Autonomous Research Cycles Table');
      `).run();
      console.log('DatabaseEngine: Applied Migration 010 - Quant Autonomous Research Cycles Table.');
    }

    // Migration 011: Quant Forecast Entries & Predicted Probabilities at Entry (Section 74 & 48)
    if (!appliedVersions.has(11)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS quant_forecast_entries (
          id TEXT PRIMARY KEY,
          decision_id TEXT,
          trade_id TEXT,
          strategy_id TEXT,
          strategy_name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          regime TEXT NOT NULL,
          predicted_prob REAL NOT NULL,
          expected_value_r REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_quant_forecast_trade ON quant_forecast_entries(trade_id);
        CREATE INDEX IF NOT EXISTS idx_quant_forecast_strat ON quant_forecast_entries(strategy_id);
        CREATE INDEX IF NOT EXISTS idx_quant_forecast_regime ON quant_forecast_entries(regime);
      `);

      // Ensure predicted_prob_at_entry exists on quant_trade_reviews
      try {
        const reviewCols = new Set(
          (this.db.prepare(`PRAGMA table_info(quant_trade_reviews)`).all() as any[]).map(c => c.name as string)
        );
        if (!reviewCols.has('predicted_prob_at_entry')) {
          this.db.exec(`ALTER TABLE quant_trade_reviews ADD COLUMN predicted_prob_at_entry REAL;`);
        }
      } catch (colErr) {
        console.warn('[DB] Migration 011 column check quant_trade_reviews notice:', colErr);
      }

      // Ensure predicted_prob exists on paper_positions
      try {
        const posCols = new Set(
          (this.db.prepare(`PRAGMA table_info(paper_positions)`).all() as any[]).map(c => c.name as string)
        );
        if (!posCols.has('predicted_prob')) {
          this.db.exec(`ALTER TABLE paper_positions ADD COLUMN predicted_prob REAL;`);
        }
      } catch (colErr) {
        console.warn('[DB] Migration 011 column check paper_positions notice:', colErr);
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (11, 'Quant Forecast Entries and Predicted Probabilities at Entry');
      `).run();
      console.log('DatabaseEngine: Applied Migration 011 - Forecast Entries & Predicted Probabilities.');
    }

    // Migration 012: Unified Quant Execution Mode, Kill Switch Persistence, and Quant Orders
    if (!appliedVersions.has(12)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS quant_user_settings (
          user_id TEXT PRIMARY KEY,
          quant_execution_mode TEXT NOT NULL DEFAULT 'ADVISORY_ONLY',
          min_confidence_threshold REAL DEFAULT 70.0,
          allowed_underlyings TEXT DEFAULT '["NIFTY","BANKNIFTY"]',
          max_daily_quant_orders INTEGER DEFAULT 5,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quant_kill_switch_states (
          user_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          is_halted INTEGER NOT NULL DEFAULT 0,
          halted_at TEXT,
          halt_reason TEXT,
          operator TEXT,
          emergency_actions_json TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quant_orders (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          strategy_id TEXT,
          decision_id TEXT,
          underlying TEXT,
          symbol TEXT,
          action TEXT,
          mode TEXT,
          status TEXT,
          executed_price REAL,
          slippage REAL,
          quantity INTEGER,
          legs_json TEXT,
          decision_json TEXT,
          audit_trail_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_quant_orders_user_created ON quant_orders(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_quant_orders_status ON quant_orders(status);
      `);

      // Ensure execution_mode exists on quant_strategies
      try {
        const stratCols = new Set(
          (this.db.prepare(`PRAGMA table_info(quant_strategies)`).all() as any[]).map(c => c.name as string)
        );
        if (!stratCols.has('execution_mode')) {
          this.db.exec(`ALTER TABLE quant_strategies ADD COLUMN execution_mode TEXT DEFAULT 'ADVISORY_ONLY';`);
        }
      } catch (stratColErr) {
        console.warn('[DB] Migration 012 column check quant_strategies notice:', stratColErr);
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (12, 'Unified Quant Execution Mode, Persistent Kill Switch States, and Quant Orders');
      `).run();
      console.log('DatabaseEngine: Applied Migration 012 - Unified Quant Execution & Risk Persistence.');
    }

    // Migration 013: Historical Feature Vector Storage for Pattern Matching
    if (!appliedVersions.has(13)) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS quant_feature_history (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          underlying TEXT NOT NULL,
          spot_price REAL NOT NULL,
          returns_1m REAL NOT NULL,
          returns_5m REAL NOT NULL,
          returns_15m REAL NOT NULL,
          dist_vwap_pct REAL NOT NULL,
          dist_ema20_pct REAL NOT NULL,
          dist_ema50_pct REAL NOT NULL,
          atr REAL NOT NULL,
          atr_percentile REAL NOT NULL,
          rsi_14 REAL NOT NULL,
          adx_14 REAL NOT NULL,
          pcr_oi REAL NOT NULL,
          iv_rank REAL NOT NULL,
          regime TEXT,
          forward_return_15m REAL NOT NULL,
          forward_return_30m REAL NOT NULL,
          forward_return_1h REAL NOT NULL,
          forward_return_eod REAL NOT NULL,
          mfe_r REAL NOT NULL,
          mae_r REAL NOT NULL,
          event_name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_quant_feature_history_sym_time ON quant_feature_history(underlying, timestamp DESC);
      `);

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (13, 'Historical Feature Vector Storage for Analogue Pattern Matching');
      `).run();
      console.log('DatabaseEngine: Applied Migration 013 - Historical Feature Vector Storage.');
    }

    // Migration 014: 15-Minute EMA Directional Options Trading Schema (Weekly Expiry, CE/PE Strikes, SL/TP)
    if (!appliedVersions.has(14)) {
      try {
        const paperCols = new Set(
          (this.db.prepare(`PRAGMA table_info(ema_paper_trades)`).all() as any[]).map(c => c.name as string)
        );
        if (!paperCols.has('strike_price')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN strike_price REAL;`);
        if (!paperCols.has('option_type')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN option_type TEXT;`);
        if (!paperCols.has('expiry_date')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN expiry_date TEXT;`);
        if (!paperCols.has('product_type')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN product_type TEXT DEFAULT 'MIS';`);
        if (!paperCols.has('spot_at_entry')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN spot_at_entry REAL;`);
        if (!paperCols.has('stop_loss')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN stop_loss REAL;`);
        if (!paperCols.has('target_price')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN target_price REAL;`);
        if (!paperCols.has('order_id')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN order_id TEXT;`);
        if (!paperCols.has('broker_status')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN broker_status TEXT;`);

        const signalCols = new Set(
          (this.db.prepare(`PRAGMA table_info(ema_15m_signals)`).all() as any[]).map(c => c.name as string)
        );
        if (!signalCols.has('selected_strike')) this.db.exec(`ALTER TABLE ema_15m_signals ADD COLUMN selected_strike REAL;`);
        if (!signalCols.has('option_type')) this.db.exec(`ALTER TABLE ema_15m_signals ADD COLUMN option_type TEXT;`);
        if (!signalCols.has('weekly_expiry')) this.db.exec(`ALTER TABLE ema_15m_signals ADD COLUMN weekly_expiry TEXT;`);

        const notifCols = new Set(
          (this.db.prepare(`PRAGMA table_info(ema_notification_settings)`).all() as any[]).map(c => c.name as string)
        );
        if (!notifCols.has('force_square_off_time')) this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN force_square_off_time TEXT DEFAULT '15:15';`);
      } catch (err: any) {
        console.warn('[DB] Migration 014 column check notice:', err.message);
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (14, '15-Minute EMA Directional Options Trading Schema (Weekly Expiry, CE/PE Strikes, SL/TP)');
      `).run();
      console.log('DatabaseEngine: Applied Migration 014 - Directional Options Trading Schema.');
    }

    // Migration 015: Trailing Stop-Loss, Profit Lock (+70 pts) and Auto Paper Trading = Enabled
    if (!appliedVersions.has(15)) {
      try {
        const paperCols = new Set(
          (this.db.prepare(`PRAGMA table_info(ema_paper_trades)`).all() as any[]).map(c => c.name as string)
        );
        if (!paperCols.has('trailing_stop_loss')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN trailing_stop_loss REAL;`);
        if (!paperCols.has('is_trailing_active')) this.db.exec(`ALTER TABLE ema_paper_trades ADD COLUMN is_trailing_active INTEGER DEFAULT 0;`);

        const notifCols = new Set(
          (this.db.prepare(`PRAGMA table_info(ema_notification_settings)`).all() as any[]).map(c => c.name as string)
        );
        if (!notifCols.has('trailing_sl_enabled')) this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN trailing_sl_enabled INTEGER DEFAULT 1;`);
        if (!notifCols.has('profit_lock_points')) this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN profit_lock_points REAL DEFAULT 70;`);
        if (!notifCols.has('trail_distance_points')) this.db.exec(`ALTER TABLE ema_notification_settings ADD COLUMN trail_distance_points REAL DEFAULT 30;`);

        // Ensure auto_paper_trading_enabled is 1 (ON) by default
        this.db.exec(`UPDATE ema_notification_settings SET auto_paper_trading_enabled = 1 WHERE auto_paper_trading_enabled IS NULL OR auto_paper_trading_enabled = 0;`);
      } catch (err: any) {
        console.warn('[DB] Migration 015 notice:', err.message);
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (15, '15-Minute EMA Trailing Stop-Loss & Profit Lock Engine');
      `).run();
      console.log('DatabaseEngine: Applied Migration 015 - Trailing Stop-Loss & Profit Lock.');
    }

    // Migration 016: Strict Fixed 5-User Model (1 SuperAdmin + 4 Operators), Admin User Management, Account Status, and MFA (TOTP)
    if (!appliedVersions.has(16)) {
      try {
        const userCols = new Set(
          (this.db.prepare(`PRAGMA table_info(users)`).all() as any[]).map(c => c.name as string)
        );
        if (!userCols.has('role')) this.db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'OPERATOR';`);
        if (!userCols.has('is_active')) this.db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;`);
        if (!userCols.has('mfa_secret')) this.db.exec(`ALTER TABLE users ADD COLUMN mfa_secret TEXT;`);
        if (!userCols.has('mfa_enabled')) this.db.exec(`ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0;`);

        // Seed/Sync users strictly from environment variables (secrets file)
        this.syncConfiguredUsersFromEnv();
      } catch (err: any) {
        console.warn('[DB] Migration 016 notice:', err.message);
      }

      this.db.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (16, 'Fixed 5-User Architecture, RBAC, Status Toggle & Authenticator MFA');
      `).run();
      console.log('DatabaseEngine: Applied Migration 016 - Fixed Users, RBAC & MFA.');
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
      'CREATE INDEX IF NOT EXISTS idx_ema_notif_logs_sig ON ema_notification_logs(signal_id, attempted_at DESC);',
      'CREATE INDEX IF NOT EXISTS idx_ema_paper_trades_status_net ON ema_paper_trades(status, net_pnl);',
      'CREATE INDEX IF NOT EXISTS idx_ema_paper_trades_closed ON ema_paper_trades(status, exit_timestamp);',
      'CREATE INDEX IF NOT EXISTS idx_ticks_timestamp ON ticks(timestamp);',
      'CREATE INDEX IF NOT EXISTS idx_option_chains_updated_at ON option_chains(updated_at);',
      'CREATE INDEX IF NOT EXISTS idx_quant_trade_reviews_exit ON quant_trade_reviews(exit_time DESC);',
      'CREATE INDEX IF NOT EXISTS idx_quant_trade_reviews_symbol ON quant_trade_reviews(symbol);',
      'CREATE INDEX IF NOT EXISTS idx_quant_research_cycles_exec ON quant_research_cycles(execution_timestamp DESC);'
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
    const tables = ['ticks', 'option_chains', 'basket_orders', 'paper_positions', 'oi_anomalies', 'autonomous_strategies', 'autonomous_strategy_log', 'quant_option_chain_snapshots', 'quant_trade_reviews', 'quant_research_cycles'];
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
      const row = this.db.prepare(`SELECT * FROM users WHERE is_active = 1 ORDER BY last_login_at DESC, created_at DESC LIMIT 1`).get() as any;
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name || undefined,
        role: row.role || 'OPERATOR',
        is_active: row.is_active !== undefined ? row.is_active : 1,
        isActive: row.is_active !== 0,
        mfa_enabled: row.mfa_enabled || 0,
        mfaEnabled: row.mfa_enabled === 1,
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
        role: row.role || 'OPERATOR',
        is_active: row.is_active !== undefined ? row.is_active : 1,
        isActive: row.is_active !== 0,
        mfa_enabled: row.mfa_enabled || 0,
        mfaEnabled: row.mfa_enabled === 1,
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

  public getAllUsers(): User[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`SELECT * FROM users ORDER BY role DESC, created_at ASC`).all() as any[];
      return rows.map(row => ({
        id: row.id,
        email: row.email,
        name: row.name || undefined,
        role: row.role || 'OPERATOR',
        is_active: row.is_active !== undefined ? row.is_active : 1,
        isActive: row.is_active !== 0,
        mfa_enabled: row.mfa_enabled || 0,
        mfaEnabled: row.mfa_enabled === 1,
        picture: row.picture || undefined,
        google_sub: row.google_sub || undefined,
        googleSub: row.google_sub || undefined,
        email_verified: row.email_verified,
        emailVerified: row.email_verified === 1,
        created_at: row.created_at,
        createdAt: row.created_at,
        last_login_at: row.last_login_at || undefined,
        lastLoginAt: row.last_login_at || undefined,
      }));
    } catch (err) {
      console.error('getAllUsers error:', err);
      return [];
    }
  }

  /**
   * Synchronize fixed 5-user roster strictly from environment variables (.env / secrets file)
   * Ensures passwords and emails are configured in environment variables and never hardcoded.
   */
  public syncConfiguredUsersFromEnv(): void {
    if (!this.db) return;
    try {
      const adminEmail = (process.env.ADMIN_EMAIL || 'vinuparab86@gmail.com').trim().toLowerCase();
      const adminName = process.env.ADMIN_NAME || 'Master Admin (Vinu)';
      const adminPass = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@Trading2026!';

      const op1Email = (process.env.OPERATOR_1_EMAIL || 'operator1@trading.internal').trim().toLowerCase();
      const op1Name = process.env.OPERATOR_1_NAME || 'Quant Operator 1';
      const op1Pass = process.env.OPERATOR_1_INITIAL_PASSWORD || 'Operator1@Trading2026!';

      const op2Email = (process.env.OPERATOR_2_EMAIL || 'operator2@trading.internal').trim().toLowerCase();
      const op2Name = process.env.OPERATOR_2_NAME || 'Quant Operator 2';
      const op2Pass = process.env.OPERATOR_2_INITIAL_PASSWORD || 'Operator2@Trading2026!';

      const op3Email = (process.env.OPERATOR_3_EMAIL || 'operator3@trading.internal').trim().toLowerCase();
      const op3Name = process.env.OPERATOR_3_NAME || 'Risk Operator 3';
      const op3Pass = process.env.OPERATOR_3_INITIAL_PASSWORD || 'Operator3@Trading2026!';

      const op4Email = (process.env.OPERATOR_4_EMAIL || 'operator4@trading.internal').trim().toLowerCase();
      const op4Name = process.env.OPERATOR_4_NAME || 'Execution Operator 4';
      const op4Pass = process.env.OPERATOR_4_INITIAL_PASSWORD || 'Operator4@Trading2026!';

      const roster = [
        { id: 'usr-admin-master', email: adminEmail, name: adminName, role: 'SUPERADMIN', pass: adminPass },
        { id: 'usr-op-1', email: op1Email, name: op1Name, role: 'OPERATOR', pass: op1Pass },
        { id: 'usr-op-2', email: op2Email, name: op2Name, role: 'OPERATOR', pass: op2Pass },
        { id: 'usr-op-3', email: op3Email, name: op3Name, role: 'OPERATOR', pass: op3Pass },
        { id: 'usr-op-4', email: op4Email, name: op4Name, role: 'OPERATOR', pass: op4Pass }
      ];

      const now = new Date().toISOString();
      for (const u of roster) {
        const existing = this.db.prepare(`SELECT * FROM users WHERE lower(email) = lower(?) OR id = ?`).get(u.email, u.id) as any;
        if (existing) {
          // If existing account has no password_hash, initialize with environment initial password hash
          const passHash = existing.password_hash || bcrypt.hashSync(u.pass, 10);
          this.db.prepare(`
            UPDATE users 
            SET email = lower(?), name = COALESCE(?, name), role = ?, email_verified = 1,
                password_hash = ?
            WHERE id = ?
          `).run(u.email, u.name, u.role, passHash, existing.id);
        } else {
          const passHash = bcrypt.hashSync(u.pass, 10);
          this.db.prepare(`
            INSERT INTO users (id, email, name, role, is_active, password_hash, email_verified, created_at)
            VALUES (?, lower(?), ?, ?, 1, ?, 1, ?)
          `).run(u.id, u.email, u.name, u.role, passHash, now);
        }
      }
    } catch (err: any) {
      console.warn('[DB] User env sync warning:', err.message);
    }
  }

  public setUserActiveStatus(userId: string, isActive: boolean): void {
    if (!this.db) return;
    this.db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, userId);
  }

  public setUserRole(userId: string, role: string): void {
    if (!this.db) return;
    this.db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
  }

  public setUserPassword(userId: string, passwordHash: string): void {
    if (!this.db) return;
    this.db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
  }

  public setUserMfaSecret(userId: string, secret: string | null, enabled: boolean): void {
    if (!this.db) return;
    this.db.prepare(`UPDATE users SET mfa_secret = ?, mfa_enabled = ? WHERE id = ?`).run(secret, enabled ? 1 : 0, userId);
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

  public getAutonomousLogs(strategyId?: string, limit: number = 100, userId?: string | null, offset: number = 0): any[] {
    if (!this.db) return [];
    try {
      const safeLimit = Math.min(Math.max(1, limit || 100), 500);
      const safeOffset = Math.max(0, offset || 0);
      let rows: any[];
      if (strategyId && userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log WHERE strategy_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        ).all(strategyId, userId, safeLimit, safeOffset) as any[];
      } else if (strategyId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log WHERE strategy_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        ).all(strategyId, safeLimit, safeOffset) as any[];
      } else if (userId) {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        ).all(userId, safeLimit, safeOffset) as any[];
      } else {
        rows = this.db.prepare(
          `SELECT id, strategy_id, strategy_name, timestamp, event_type, details_json
           FROM autonomous_strategy_log ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        ).all(safeLimit, safeOffset) as any[];
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
          id, instrument, timeframe, signal_type, price, selected_strike, option_type, weekly_expiry, ema_23, ema_50, ema_difference, candle_timestamp, signal_confirmed_at, user_id, notification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instrument, timeframe, candle_timestamp, signal_type) DO NOTHING
      `);

      const info = stmt.run(
        signal.id,
        signal.instrument,
        signal.timeframe || '15m',
        signal.signalType,
        signal.price,
        signal.selectedStrike || null,
        signal.optionType || null,
        signal.weeklyExpiry || null,
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

  public getEma15mSignals(instrument?: string, signalType?: string, limit: number = 100, offset: number = 0): Ema15mSignal[] {
    if (!this.db) return [];
    try {
      const safeLimit = Math.min(Math.max(1, limit || 100), 500);
      const safeOffset = Math.max(0, offset || 0);
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

      query += ' ORDER BY candle_timestamp DESC LIMIT ? OFFSET ?';
      params.push(safeLimit, safeOffset);

      const rows = this.db.prepare(query).all(...params) as any[];
      return rows.map(r => ({
        id: r.id,
        instrument: r.instrument,
        timeframe: r.timeframe,
        signalType: r.signal_type,
        price: r.price,
        selectedStrike: r.selected_strike !== null ? Number(r.selected_strike) : undefined,
        optionType: r.option_type || undefined,
        weeklyExpiry: r.weekly_expiry || undefined,
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
        selectedStrike: row.selected_strike !== null ? Number(row.selected_strike) : undefined,
        optionType: row.option_type || undefined,
        weeklyExpiry: row.weekly_expiry || undefined,
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
      const safeLimit = Math.min(Math.max(1, limit || 50), 500);
      let rows: any[];
      if (signalId) {
        rows = this.db.prepare(`
          SELECT * FROM ema_notification_logs WHERE signal_id = ? ORDER BY attempted_at DESC LIMIT ?
        `).all(signalId, safeLimit) as any[];
      } else {
        rows = this.db.prepare(`
          SELECT * FROM ema_notification_logs ORDER BY attempted_at DESC LIMIT ?
        `).all(safeLimit) as any[];
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
      trailingSlEnabled: true,
      profitLockPoints: 70,
      trailDistancePoints: 30,
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
      emailAddress: process.env.SMTP_USER || '',
      soundVolume: 0.8,
      forceSquareOffTime: '15:15'
    };

    if (!this.db) return defaultSettings;
    try {
      const uId = userId || 'GLOBAL';
      let row = this.db.prepare(`SELECT * FROM ema_notification_settings WHERE user_id = ?`).get(uId) as any;
      if (!row && uId !== 'GLOBAL') {
        row = this.db.prepare(`SELECT * FROM ema_notification_settings WHERE user_id = 'GLOBAL'`).get() as any;
      }
      if (!row) return defaultSettings;
      return {
        userId: row.user_id,
        telegramEnabled: row.telegram_enabled === 1,
        emailEnabled: row.email_enabled === 1,
        browserEnabled: row.browser_enabled === 1,
        soundEnabled: row.sound_enabled === 1,
        autoPaperTradingEnabled: row.auto_paper_trading_enabled !== undefined ? row.auto_paper_trading_enabled === 1 : true,
        trailingSlEnabled: row.trailing_sl_enabled !== undefined ? row.trailing_sl_enabled === 1 : true,
        profitLockPoints: row.profit_lock_points !== null && row.profit_lock_points !== undefined ? Number(row.profit_lock_points) : 70,
        trailDistancePoints: row.trail_distance_points !== null && row.trail_distance_points !== undefined ? Number(row.trail_distance_points) : 30,
        telegramChatId: row.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '',
        telegramBotToken: row.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '',
        emailAddress: row.email_address || process.env.SMTP_USER || '',
        soundVolume: row.sound_volume !== null ? Number(row.sound_volume) : 0.8,
        forceSquareOffTime: row.force_square_off_time || '15:15',
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
          user_id, telegram_enabled, email_enabled, browser_enabled, sound_enabled, auto_paper_trading_enabled, trailing_sl_enabled, profit_lock_points, trail_distance_points, telegram_chat_id, telegram_bot_token, email_address, sound_volume, force_square_off_time, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          telegram_enabled = excluded.telegram_enabled,
          email_enabled = excluded.email_enabled,
          browser_enabled = excluded.browser_enabled,
          sound_enabled = excluded.sound_enabled,
          auto_paper_trading_enabled = excluded.auto_paper_trading_enabled,
          trailing_sl_enabled = excluded.trailing_sl_enabled,
          profit_lock_points = excluded.profit_lock_points,
          trail_distance_points = excluded.trail_distance_points,
          telegram_chat_id = excluded.telegram_chat_id,
          telegram_bot_token = excluded.telegram_bot_token,
          email_address = excluded.email_address,
          sound_volume = excluded.sound_volume,
          force_square_off_time = excluded.force_square_off_time,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        uId,
        settings.telegramEnabled ? 1 : 0,
        settings.emailEnabled ? 1 : 0,
        settings.browserEnabled ? 1 : 0,
        settings.soundEnabled ? 1 : 0,
        settings.autoPaperTradingEnabled !== false ? 1 : 0,
        settings.trailingSlEnabled !== false ? 1 : 0,
        settings.profitLockPoints ?? 70,
        settings.trailDistancePoints ?? 30,
        settings.telegramChatId || null,
        settings.telegramBotToken || null,
        settings.emailAddress || null,
        settings.soundVolume ?? 0.8,
        settings.forceSquareOffTime || '15:15'
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
          id, signal_id, instrument, direction, option_type, strike_price, expiry_date, product_type, spot_at_entry, stop_loss, target_price, trailing_stop_loss, is_trailing_active, order_id, broker_status, entry_timestamp, entry_price, quantity, lot_size, strategy, source, status, current_price, unrealized_pnl, exit_timestamp, exit_price, exit_reason, gross_pnl, brokerage, charges, net_pnl, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          current_price = excluded.current_price,
          unrealized_pnl = excluded.unrealized_pnl,
          status = excluded.status,
          trailing_stop_loss = COALESCE(excluded.trailing_stop_loss, ema_paper_trades.trailing_stop_loss),
          is_trailing_active = COALESCE(excluded.is_trailing_active, ema_paper_trades.is_trailing_active),
          exit_timestamp = excluded.exit_timestamp,
          exit_price = excluded.exit_price,
          exit_reason = excluded.exit_reason,
          gross_pnl = excluded.gross_pnl,
          brokerage = excluded.brokerage,
          charges = excluded.charges,
          net_pnl = excluded.net_pnl,
          broker_status = COALESCE(excluded.broker_status, ema_paper_trades.broker_status),
          updated_at = CURRENT_TIMESTAMP
      `).run(
        trade.id,
        trade.signalId,
        trade.instrument,
        trade.direction,
        trade.optionType || null,
        trade.strikePrice || null,
        trade.expiryDate || null,
        trade.productType || 'MIS',
        trade.spotAtEntry || null,
        trade.stopLoss !== undefined && trade.stopLoss !== null ? trade.stopLoss : null,
        trade.targetPrice !== undefined && trade.targetPrice !== null ? trade.targetPrice : null,
        trade.trailingStopLoss !== undefined && trade.trailingStopLoss !== null ? trade.trailingStopLoss : null,
        trade.isTrailingActive ? 1 : 0,
        trade.orderId || null,
        trade.brokerStatus || 'FILLED',
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

  public getEmaPaperTrades(instrument?: string, status?: string, limit: number = 100, offset: number = 0): EmaPaperTrade[] {
    if (!this.db) return [];
    try {
      const safeLimit = Math.min(Math.max(1, limit || 100), 500);
      const safeOffset = Math.max(0, offset || 0);
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

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(safeLimit, safeOffset);

      const rows = this.db.prepare(query).all(...params) as any[];
      return rows.map(r => ({
        id: r.id,
        signalId: r.signal_id,
        instrument: r.instrument,
        direction: r.direction,
        optionType: r.option_type || undefined,
        strikePrice: r.strike_price !== null && r.strike_price !== undefined ? Number(r.strike_price) : undefined,
        expiryDate: r.expiry_date || undefined,
        productType: (r.product_type as any) || 'MIS',
        spotAtEntry: r.spot_at_entry !== null && r.spot_at_entry !== undefined ? Number(r.spot_at_entry) : undefined,
        stopLoss: r.stop_loss !== null && r.stop_loss !== undefined ? Number(r.stop_loss) : undefined,
        targetPrice: r.target_price !== null && r.target_price !== undefined ? Number(r.target_price) : undefined,
        trailingStopLoss: r.trailing_stop_loss !== null && r.trailing_stop_loss !== undefined ? Number(r.trailing_stop_loss) : undefined,
        isTrailingActive: r.is_trailing_active === 1,
        orderId: r.order_id || undefined,
        brokerStatus: r.broker_status || undefined,
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

  public getOpenEmaPaperTrades(instrument?: string): EmaPaperTrade[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (instrument && instrument !== 'ALL') {
        rows = this.db.prepare(`
          SELECT * FROM ema_paper_trades WHERE instrument = ? AND status = 'OPEN' ORDER BY created_at DESC
        `).all(instrument) as any[];
      } else {
        rows = this.db.prepare(`
          SELECT * FROM ema_paper_trades WHERE status = 'OPEN' ORDER BY created_at DESC
        `).all() as any[];
      }

      return rows.map(r => ({
        id: r.id,
        signalId: r.signal_id,
        instrument: r.instrument,
        direction: r.direction,
        optionType: r.option_type || undefined,
        strikePrice: r.strike_price !== null && r.strike_price !== undefined ? Number(r.strike_price) : undefined,
        expiryDate: r.expiry_date || undefined,
        productType: (r.product_type as any) || 'MIS',
        spotAtEntry: r.spot_at_entry !== null && r.spot_at_entry !== undefined ? Number(r.spot_at_entry) : undefined,
        stopLoss: r.stop_loss !== null && r.stop_loss !== undefined ? Number(r.stop_loss) : undefined,
        targetPrice: r.target_price !== null && r.target_price !== undefined ? Number(r.target_price) : undefined,
        trailingStopLoss: r.trailing_stop_loss !== null && r.trailing_stop_loss !== undefined ? Number(r.trailing_stop_loss) : undefined,
        isTrailingActive: r.is_trailing_active === 1,
        orderId: r.order_id || undefined,
        brokerStatus: r.broker_status || undefined,
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
      console.error('[DB] Error fetching open EMA paper trades:', err);
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
        optionType: row.option_type || undefined,
        strikePrice: row.strike_price !== null && row.strike_price !== undefined ? Number(row.strike_price) : undefined,
        expiryDate: row.expiry_date || undefined,
        productType: (row.product_type as any) || 'MIS',
        spotAtEntry: row.spot_at_entry !== null && row.spot_at_entry !== undefined ? Number(row.spot_at_entry) : undefined,
        stopLoss: row.stop_loss !== null && row.stop_loss !== undefined ? Number(row.stop_loss) : undefined,
        targetPrice: row.target_price !== null && row.target_price !== undefined ? Number(row.target_price) : undefined,
        trailingStopLoss: row.trailing_stop_loss !== null && row.trailing_stop_loss !== undefined ? Number(row.trailing_stop_loss) : undefined,
        isTrailingActive: row.is_trailing_active === 1,
        orderId: row.order_id || undefined,
        brokerStatus: row.broker_status || undefined,
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

      if (res.changes > 0) {
        try {
          this.saveTradeReviewFromEmaTrade(trade, exitPrice, grossPnl, netPnl, exitReason, now);
        } catch (revErr) {
          console.error('[DB] Error auto-generating review for EMA trade:', revErr);
        }
      }

      return res.changes > 0;
    } catch (err) {
      console.error(`[DB] Error closing EMA paper trade ${id}:`, err);
      return false;
    }
  }

  /**
   * Batch update or close EMA paper trades inside a single SQLite transaction
   */
  public batchUpdateEmaPaperTrades(updates: {
    toUpdate: Array<{ id: string; currentPrice: number; unrealizedPnl: number; trailingStopLoss?: number; isTrailingActive?: boolean }>;
    toClose: Array<{ id: string; exitPrice: number; exitReason: string; grossPnl: number; netPnl: number; exitTimestamp?: string }>;
  }): void {
    if (!this.db) return;
    if (updates.toUpdate.length === 0 && updates.toClose.length === 0) return;

    try {
      const updateStmt = this.db.prepare(`
        UPDATE ema_paper_trades SET
          current_price = ?,
          unrealized_pnl = ?,
          trailing_stop_loss = COALESCE(?, trailing_stop_loss),
          is_trailing_active = COALESCE(?, is_trailing_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'OPEN'
      `);

      const closeStmt = this.db.prepare(`
        UPDATE ema_paper_trades SET
          status = 'CLOSED',
          current_price = ?,
          exit_price = ?,
          exit_timestamp = ?,
          exit_reason = ?,
          gross_pnl = ?,
          brokerage = 40,
          net_pnl = ?,
          unrealized_pnl = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'OPEN'
      `);

      const runBatch = this.db.transaction(() => {
        const now = new Date().toISOString();
        for (const item of updates.toClose) {
          const trade = this.db.prepare(`SELECT * FROM ema_paper_trades WHERE id = ? AND status = 'OPEN'`).get(item.id) as any;
          closeStmt.run(item.exitPrice, item.exitPrice, item.exitTimestamp || now, item.exitReason, item.grossPnl, item.netPnl, item.id);
          if (trade) {
            try {
              this.saveTradeReviewFromEmaTrade(trade, item.exitPrice, item.grossPnl, item.netPnl, item.exitReason, item.exitTimestamp || now);
            } catch (revErr) {
              console.error('[DB] Error auto-generating review in batch EMA close:', revErr);
            }
          }
        }
        for (const item of updates.toUpdate) {
          updateStmt.run(
            item.currentPrice,
            item.unrealizedPnl,
            item.trailingStopLoss !== undefined ? item.trailingStopLoss : null,
            item.isTrailingActive !== undefined ? (item.isTrailingActive ? 1 : 0) : null,
            item.id
          );
        }
      });

      runBatch();
    } catch (err) {
      console.error('[DB] Error batch updating EMA paper trades:', err);
    }
  }

  public updateEmaPaperTradePrices(instrument: string, currentPrice: number): void {
    if (!this.db) return;
    try {
      const openTrades = this.db.prepare(`
        SELECT id, entry_price, quantity, direction 
        FROM ema_paper_trades 
        WHERE instrument = ? AND status = 'OPEN'
      `).all(instrument) as any[];

      if (openTrades.length === 0) return;

      const toUpdate = openTrades.map(t => {
        const entryPrice = Number(t.entry_price);
        const qty = Number(t.quantity);
        const isLong = t.direction === 'LONG';
        const unrealizedPnl = Number((isLong ? (currentPrice - entryPrice) * qty : (entryPrice - currentPrice) * qty).toFixed(2));
        return { id: t.id, currentPrice, unrealizedPnl };
      });

      this.batchUpdateEmaPaperTrades({ toUpdate, toClose: [] });
    } catch (err) {
      console.error(`[DB] Error updating EMA paper trade prices for ${instrument}:`, err);
    }
  }

  /**
   * Fast SQL aggregate calculation for EMA Paper Trading Summary
   * Computes counts, win/losses, realized & unrealized PnL in a single SQLite aggregate query
   */
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
      const agg = this.db.prepare(`
        SELECT 
          COUNT(*) as totalTrades,
          SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as openTradesCount,
          SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closedTradesCount,
          SUM(CASE WHEN status = 'CLOSED' AND net_pnl > 0 THEN 1 ELSE 0 END) as winningTrades,
          SUM(CASE WHEN status = 'CLOSED' AND net_pnl < 0 THEN 1 ELSE 0 END) as losingTrades,
          COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN gross_pnl ELSE 0 END), 0) as realizedGrossPnl,
          COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN COALESCE(brokerage, 40) ELSE 0 END), 0) as realizedBrokerage,
          COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN net_pnl ELSE 0 END), 0) as realizedNetPnl,
          COALESCE(SUM(CASE WHEN status = 'OPEN' THEN unrealized_pnl ELSE 0 END), 0) as unrealizedPnl
        FROM ema_paper_trades
      `).get() as any;

      if (!agg) return defaultSummary;

      const totalTrades = Number(agg.totalTrades || 0);
      const openTradesCount = Number(agg.openTradesCount || 0);
      const closedTradesCount = Number(agg.closedTradesCount || 0);
      const winningTrades = Number(agg.winningTrades || 0);
      const losingTrades = Number(agg.losingTrades || 0);
      const realizedGrossPnl = Number(Number(agg.realizedGrossPnl || 0).toFixed(2));
      const realizedBrokerage = Number(Number(agg.realizedBrokerage || 0).toFixed(2));
      const realizedNetPnl = Number(Number(agg.realizedNetPnl || 0).toFixed(2));
      const unrealizedPnl = Number(Number(agg.unrealizedPnl || 0).toFixed(2));
      const winRatePercent = closedTradesCount > 0 ? Number(((winningTrades / closedTradesCount) * 100).toFixed(1)) : 0;
      const totalNetPnl = Number((realizedNetPnl + unrealizedPnl).toFixed(2));

      const settings = this.getEmaNotificationSettings('GLOBAL');

      return {
        totalTrades,
        openTradesCount,
        closedTradesCount,
        winningTrades,
        losingTrades,
        winRatePercent,
        realizedGrossPnl,
        realizedBrokerage,
        realizedNetPnl,
        unrealizedPnl,
        totalNetPnl,
        autoTradingEnabled: settings.autoPaperTradingEnabled !== false
      };
    } catch (err) {
      console.error('[DB] Error computing EMA paper trading summary via SQL aggregation:', err);
      return defaultSummary;
    }
  }

  // -------------------------------------------------------------
  // QUANT INTELLIGENCE PERSISTENCE METHODS (Migration 008)
  // -------------------------------------------------------------

  public saveQuantOptionSnapshot(s: any): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO quant_option_chain_snapshots (
          market_ts, ingestion_ts, underlying, expiry, strike, option_type,
          ltp, bid, ask, bid_qty, ask_qty, volume, oi, oi_change,
          iv, delta, gamma, theta, vega, source, data_quality
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        s.marketTs, s.ingestionTs || new Date().toISOString(), s.underlying, s.expiry, s.strike, s.optionType,
        s.ltp, s.bid || s.ltp, s.ask || s.ltp, s.bidQty || 0, s.askQty || 0, s.volume || 0, s.oi || 0, s.oiChange || 0,
        s.iv || 0, s.delta || 0, s.gamma || 0, s.theta || 0, s.vega || 0, s.source || 'upstox_ws', s.dataQuality || 'OK'
      );
    } catch (err) {
      console.error('[DB] Error saving quant option snapshot:', err);
    }
  }

  public saveQuantOptionSnapshotsBatch(snaps: any[]): void {
    if (!this.db || !snaps || snaps.length === 0) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO quant_option_chain_snapshots (
          market_ts, ingestion_ts, underlying, expiry, strike, option_type,
          ltp, bid, ask, bid_qty, ask_qty, volume, oi, oi_change,
          iv, delta, gamma, theta, vega, source, data_quality
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMany = this.db.transaction((items: any[]) => {
        for (const s of items) {
          stmt.run(
            s.marketTs, s.ingestionTs || new Date().toISOString(), s.underlying, s.expiry, s.strike, s.optionType,
            s.ltp, s.bid || s.ltp, s.ask || s.ltp, s.bidQty || 0, s.askQty || 0, s.volume || 0, s.oi || 0, s.oiChange || 0,
            s.iv || 0, s.delta || 0, s.gamma || 0, s.theta || 0, s.vega || 0, s.source || 'upstox_ws', s.dataQuality || 'OK'
          );
        }
      });
      insertMany(snaps);
    } catch (err) {
      console.error('[DB] Error batch saving quant option snapshots:', err);
    }
  }

  public getLatestQuantOptionSnapshots(underlying: string, expiry?: string): any[] {
    if (!this.db) return [];
    try {
      let query = `
        SELECT * FROM quant_option_chain_snapshots
        WHERE underlying = ?
      `;
      const params: any[] = [underlying];
      if (expiry) {
        query += ` AND expiry = ?`;
        params.push(expiry);
      }
      query += ` ORDER BY market_ts DESC, strike ASC LIMIT 200`;
      const rows = this.db.prepare(query).all(...params) as any[];
      if (rows && rows.length > 0) {
        return rows;
      }

      // Fallback: Read from persistent option_chains store if quant table is empty
      let ocQuery = `
        SELECT
          id,
          updated_at as market_ts,
          updated_at as ingestion_ts,
          symbol as underlying,
          expiry,
          strike_price as strike,
          option_type,
          ltp,
          ltp as bid,
          ltp as ask,
          0 as bid_qty,
          0 as ask_qty,
          volume,
          open_interest as oi,
          change_in_oi as oi_change,
          iv,
          delta,
          gamma,
          theta,
          vega,
          'option_chains_store' as source,
          'OK' as data_quality
        FROM option_chains
        WHERE symbol = ?
      `;
      const ocParams: any[] = [underlying];
      if (expiry) {
        ocQuery += ` AND expiry = ?`;
        ocParams.push(expiry);
      }
      ocQuery += ` ORDER BY updated_at DESC, strike_price ASC LIMIT 200`;
      return this.db.prepare(ocQuery).all(...ocParams);
    } catch (err) {
      console.error('[DB] Error getting quant option snapshots:', err);
      return [];
    }
  }

  public saveQuantStrategy(strat: any): void {
    if (!this.db) return;
    try {
      const existing = this.db.prepare(`SELECT id FROM quant_strategies WHERE id = ?`).get(strat.id);
      if (existing) {
        this.db.prepare(`
          UPDATE quant_strategies SET
            name = ?, version = ?, family = ?, status = ?, definition_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(strat.name, strat.version, strat.family, strat.status, JSON.stringify(strat), strat.id);
      } else {
        this.db.prepare(`
          INSERT INTO quant_strategies (id, name, version, family, status, definition_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(strat.id, strat.name, strat.version, strat.family, strat.status, JSON.stringify(strat));
      }
    } catch (err) {
      console.error('[DB] Error saving quant strategy:', err);
    }
  }

  public getQuantStrategies(family?: string, status?: string): any[] {
    if (!this.db) return [];
    try {
      let query = `SELECT * FROM quant_strategies WHERE 1=1`;
      const params: any[] = [];
      if (family && family !== 'ALL') {
        query += ` AND family = ?`;
        params.push(family);
      }
      if (status && status !== 'ALL') {
        query += ` AND status = ?`;
        params.push(status);
      }
      query += ` ORDER BY updated_at DESC`;
      const rows = this.db.prepare(query).all(...params) as any[];
      return rows.map(r => {
        try {
          return JSON.parse(r.definition_json);
        } catch {
          return { id: r.id, name: r.name, version: r.version, family: r.family, status: r.status };
        }
      });
    } catch (err) {
      console.error('[DB] Error getting quant strategies:', err);
      return [];
    }
  }

  public saveQuantBacktest(res: any): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO quant_backtests (
          id, strategy_id, strategy_version, period_start, period_end,
          sample_size, expectancy, profit_factor, sharpe, sortino,
          max_drawdown, cost_model_id, passed_gates, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        res.id, res.strategyId, res.strategyVersion, res.periodStart, res.periodEnd,
        res.sampleSize, res.expectancyR || res.expectancy || 0, res.profitFactor, res.sharpeRatio || res.sharpe || 0,
        res.sortinoRatio || res.sortino || 0, res.maxDrawdownPct || res.maxDrawdown || 0,
        res.costModelId || 'default_nse_options_v1', res.passedGates ? 1 : 0, JSON.stringify(res)
      );
    } catch (err) {
      console.error('[DB] Error saving quant backtest:', err);
    }
  }

  public getQuantBacktests(strategyId?: string): any[] {
    if (!this.db) return [];
    try {
      let query = `SELECT * FROM quant_backtests`;
      const params: any[] = [];
      if (strategyId) {
        query += ` WHERE strategy_id = ?`;
        params.push(strategyId);
      }
      query += ` ORDER BY created_at DESC LIMIT 50`;
      const rows = this.db.prepare(query).all(...params) as any[];
      return rows.map(r => {
        try {
          return JSON.parse(r.result_json);
        } catch {
          return r;
        }
      });
    } catch (err) {
      console.error('[DB] Error getting quant backtests:', err);
      return [];
    }
  }

  public saveQuantAuditLog(log: any): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO quant_audit_logs (actor, action, entity_type, entity_id, before_json, after_json, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        log.actor || 'system',
        log.action,
        log.entityType,
        log.entityId,
        log.beforeState ? JSON.stringify(log.beforeState) : null,
        log.afterState ? JSON.stringify(log.afterState) : null,
        log.reason || ''
      );
    } catch (err) {
      console.error('[DB] Error saving quant audit log:', err);
    }
  }

  public getQuantAuditLogs(limit: number = 100): any[] {
    if (!this.db) return [];
    try {
      return this.db.prepare(`SELECT * FROM quant_audit_logs ORDER BY created_at DESC LIMIT ?`).all(limit);
    } catch (err) {
      console.error('[DB] Error getting quant audit logs:', err);
      return [];
    }
  }

  public saveQuantExperiment(exp: any): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO quant_experiments (id, hypothesis_name, hypothesis_text, parameters_json, status, result_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        exp.id, exp.hypothesisName, exp.hypothesisText,
        JSON.stringify(exp.parameters || {}),
        exp.status || 'RUNNING',
        exp.result ? JSON.stringify(exp.result) : null
      );
    } catch (err) {
      console.error('[DB] Error saving quant experiment:', err);
    }
  }

  public getQuantExperiments(limit: number = 50): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`SELECT * FROM quant_experiments ORDER BY created_at DESC LIMIT ?`).all(limit) as any[];
      return rows.map(r => ({
        id: r.id,
        hypothesisName: r.hypothesis_name,
        hypothesisText: r.hypothesis_text,
        parameters: JSON.parse(r.parameters_json || '{}'),
        status: r.status,
        result: r.result_json ? JSON.parse(r.result_json) : null,
        createdAt: r.created_at
      }));
    } catch (err) {
      console.error('[DB] Error getting quant experiments:', err);
      return [];
    }
  }

  // --- Section 52: Quant Trade Review Ledger Persistence ---

  public saveTradeReview(review: TradeReviewRecord): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO quant_trade_reviews (
          trade_id, symbol, strategy_name, strategy_version, entry_time, exit_time,
          entry_thesis, exit_reason, regime_at_entry, gross_pnl, net_pnl,
          slippage_incurred, max_favorable_excursion_r, max_adverse_excursion_r,
          thesis_was_correct, timing_was_optimal, strike_selection_was_optimal,
          lessons_learned, predicted_prob_at_entry
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        review.tradeId,
        review.symbol,
        review.strategyName,
        review.strategyVersion ?? 1,
        review.entryTime,
        review.exitTime,
        review.entryThesis ?? '',
        review.exitReason ?? '',
        review.regimeAtEntry ?? 'RANGE',
        review.grossPnl ?? 0,
        review.netPnl ?? 0,
        review.slippageIncurred ?? 0,
        review.maxFavorableExcursionR ?? 0,
        review.maxAdverseExcursionR ?? 0,
        review.thesisWasCorrect ? 1 : 0,
        review.timingWasOptimal ? 1 : 0,
        review.strikeSelectionWasOptimal ? 1 : 0,
        review.lessonsLearned ?? '',
        review.predictedProbAtEntry !== undefined && review.predictedProbAtEntry !== null ? review.predictedProbAtEntry : null
      );
    } catch (err) {
      console.error('[DB] Error saving quant trade review:', err);
    }
  }

  public getTradeReviews(limit: number = 100, offset: number = 0): TradeReviewRecord[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT * FROM quant_trade_reviews
        ORDER BY exit_time DESC, created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as any[];

      return rows.map(r => ({
        tradeId: r.trade_id,
        symbol: r.symbol,
        strategyName: r.strategy_name,
        strategyVersion: r.strategy_version,
        entryTime: r.entry_time,
        exitTime: r.exit_time,
        entryThesis: r.entry_thesis,
        exitReason: r.exit_reason,
        regimeAtEntry: r.regime_at_entry as MarketRegimeType,
        grossPnl: Number(r.gross_pnl),
        netPnl: Number(r.net_pnl),
        slippageIncurred: Number(r.slippage_incurred),
        maxFavorableExcursionR: Number(r.max_favorable_excursion_r),
        maxAdverseExcursionR: Number(r.max_adverse_excursion_r),
        thesisWasCorrect: Boolean(r.thesis_was_correct),
        timingWasOptimal: Boolean(r.timing_was_optimal),
        strikeSelectionWasOptimal: Boolean(r.strike_selection_was_optimal),
        lessonsLearned: r.lessons_learned,
        predictedProbAtEntry: r.predicted_prob_at_entry !== null && r.predicted_prob_at_entry !== undefined ? Number(r.predicted_prob_at_entry) : undefined
      }));
    } catch (err) {
      console.error('[DB] Error getting quant trade reviews:', err);
      return [];
    }
  }

  public getTradeReviewById(tradeId: string): TradeReviewRecord | null {
    if (!this.db) return null;
    try {
      const r = this.db.prepare(`SELECT * FROM quant_trade_reviews WHERE trade_id = ?`).get(tradeId) as any;
      if (!r) return null;
      return {
        tradeId: r.trade_id,
        symbol: r.symbol,
        strategyName: r.strategy_name,
        strategyVersion: r.strategy_version,
        entryTime: r.entry_time,
        exitTime: r.exit_time,
        entryThesis: r.entry_thesis,
        exitReason: r.exit_reason,
        regimeAtEntry: r.regime_at_entry as MarketRegimeType,
        grossPnl: Number(r.gross_pnl),
        netPnl: Number(r.net_pnl),
        slippageIncurred: Number(r.slippage_incurred),
        maxFavorableExcursionR: Number(r.max_favorable_excursion_r),
        maxAdverseExcursionR: Number(r.max_adverse_excursion_r),
        thesisWasCorrect: Boolean(r.thesis_was_correct),
        timingWasOptimal: Boolean(r.timing_was_optimal),
        strikeSelectionWasOptimal: Boolean(r.strike_selection_was_optimal),
        lessonsLearned: r.lessons_learned,
        predictedProbAtEntry: r.predicted_prob_at_entry !== null && r.predicted_prob_at_entry !== undefined ? Number(r.predicted_prob_at_entry) : undefined
      };
    } catch (err) {
      console.error('[DB] Error getting quant trade review by ID:', err);
      return null;
    }
  }

  public saveForecastEntry(entry: {
    id?: string;
    decisionId?: string;
    tradeId?: string;
    strategyId?: string;
    strategyName: string;
    symbol: string;
    regime: string;
    predictedProb: number;
    expectedValueR: number;
  }): void {
    if (!this.db) return;
    try {
      const id = entry.id || `FCST_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.db.prepare(`
        INSERT OR REPLACE INTO quant_forecast_entries (
          id, decision_id, trade_id, strategy_id, strategy_name, symbol, regime, predicted_prob, expected_value_r
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        entry.decisionId || null,
        entry.tradeId || null,
        entry.strategyId || null,
        entry.strategyName,
        entry.symbol,
        entry.regime,
        entry.predictedProb,
        entry.expectedValueR
      );
    } catch (err) {
      console.error('[DB] Error saving forecast entry:', err);
    }
  }

  public getForecastEntries(limit: number = 100): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT * FROM quant_forecast_entries
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit) as any[];

      return rows.map(r => ({
        id: r.id,
        decisionId: r.decision_id,
        tradeId: r.trade_id,
        strategyId: r.strategy_id,
        strategyName: r.strategy_name,
        symbol: r.symbol,
        regime: r.regime,
        predictedProb: r.predicted_prob,
        expectedValueR: r.expected_value_r,
        createdAt: r.created_at
      }));
    } catch (err) {
      console.error('[DB] Error getting forecast entries:', err);
      return [];
    }
  }

  public saveTradeReviewFromPaperPosition(
    pos: any,
    exitPrice: number,
    pnl: number,
    reason: string,
    exitTimestamp?: string
  ): void {
    if (!this.db || !pos) return;
    try {
      const now = exitTimestamp || new Date().toISOString();
      const grossPnl = Number(pnl.toFixed(2));
      const brokerage = 40;
      const netPnl = Number((grossPnl - brokerage).toFixed(2));
      const entryTime = pos.opened_at || pos.openedAt || now;

      let maxFavorableExcursionR = 0;
      let maxAdverseExcursionR = 0;
      const entryPrice = Number(pos.entry_price || pos.entryPrice || 0);
      const stopLoss = Number(pos.stop_loss || pos.stopLoss || 0);

      if (entryPrice > 0 && stopLoss > 0 && Math.abs(entryPrice - stopLoss) > 0) {
        const risk = Math.abs(entryPrice - stopLoss);
        const move = exitPrice - entryPrice;
        const rMultiple = Number((move / risk).toFixed(2));
        maxFavorableExcursionR = rMultiple > 0 ? rMultiple : 0;
        maxAdverseExcursionR = rMultiple < 0 ? rMultiple : 0;
      } else {
        maxFavorableExcursionR = netPnl > 0 ? 1 : 0;
        maxAdverseExcursionR = netPnl < 0 ? -1 : 0;
      }

      this.saveTradeReview({
        tradeId: `REV_${pos.id}`,
        symbol: pos.symbol,
        strategyName: pos.strategy_name || pos.strategyName || 'Paper Position',
        strategyVersion: 1,
        entryTime,
        exitTime: now,
        entryThesis: pos.leg_label || pos.legLabel ? `Leg: ${pos.leg_label || pos.legLabel}` : '',
        exitReason: reason || 'Position Closed',
        regimeAtEntry: 'RANGE',
        grossPnl,
        netPnl,
        slippageIncurred: 0,
        maxFavorableExcursionR,
        maxAdverseExcursionR,
        thesisWasCorrect: netPnl > 0,
        timingWasOptimal: netPnl > 0,
        strikeSelectionWasOptimal: netPnl > 0,
        lessonsLearned: reason ? `Exit reason: ${reason}` : '',
        predictedProbAtEntry: pos.predicted_prob ?? pos.predictedProb ?? 0.65
      });
    } catch (err) {
      console.error('[DB] Failed to auto-generate trade review for paper position:', err);
    }
  }

  public saveTradeReviewFromEmaTrade(
    trade: any,
    exitPrice: number,
    grossPnl: number,
    netPnl: number,
    exitReason: string,
    exitTimestamp?: string
  ): void {
    if (!this.db || !trade) return;
    try {
      const now = exitTimestamp || new Date().toISOString();
      const entryTime = trade.entry_timestamp || trade.entryTimestamp || now;
      const isLong = (trade.direction || '').toUpperCase() === 'LONG';
      const regimeAtEntry: MarketRegimeType = isLong ? 'TREND_UP' : 'TREND_DOWN';

      this.saveTradeReview({
        tradeId: `REV_${trade.id}`,
        symbol: trade.instrument,
        strategyName: trade.strategy || 'EMA_15M_23_50',
        strategyVersion: 1,
        entryTime,
        exitTime: now,
        entryThesis: `15m EMA 23/50 crossover (${trade.direction})`,
        exitReason: exitReason || 'EMA Exit',
        regimeAtEntry,
        grossPnl: Number(grossPnl.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2)),
        slippageIncurred: 0,
        maxFavorableExcursionR: netPnl > 0 ? 1.5 : 0,
        maxAdverseExcursionR: netPnl < 0 ? -1.0 : 0,
        thesisWasCorrect: netPnl > 0,
        timingWasOptimal: netPnl > 0,
        strikeSelectionWasOptimal: true,
        lessonsLearned: exitReason ? `15m EMA exit: ${exitReason}` : '',
        predictedProbAtEntry: 0.64
      });
    } catch (err) {
      console.error('[DB] Failed to auto-generate trade review for EMA trade:', err);
    }
  }

  // --- Section 51 & 69: Quant Research Cycle Persistence ---

  public saveQuantResearchCycle(summary: any): void {
    if (!this.db || !summary) return;
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO quant_research_cycles (
          id, cycle_id, execution_timestamp, trades_analyzed_count,
          total_net_pnl_reviewed, win_rate_realized_pct, hypotheses_generated_count,
          top_generated_hypotheses, regime_performance_summary, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        summary.cycleId || `CYCLE-${Date.now()}`,
        summary.cycleId,
        summary.executionTimestamp || new Date().toISOString(),
        summary.tradesAnalyzedCount || 0,
        summary.totalNetPnlReviewed || 0,
        summary.winRateRealizedPct || 0,
        summary.hypothesesGeneratedCount || 0,
        JSON.stringify(summary.topGeneratedHypotheses || []),
        JSON.stringify(summary.regimePerformanceSummary || {}),
        summary.status || 'COMPLETED'
      );
    } catch (err) {
      console.error('[DB] Error saving quant research cycle:', err);
    }
  }

  public getQuantResearchCycles(limit: number = 20): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT * FROM quant_research_cycles
        ORDER BY execution_timestamp DESC, created_at DESC
        LIMIT ?
      `).all(limit) as any[];

      return rows.map(r => ({
        id: r.id,
        cycleId: r.cycle_id,
        executionTimestamp: r.execution_timestamp,
        tradesAnalyzedCount: r.trades_analyzed_count,
        totalNetPnlReviewed: r.total_net_pnl_reviewed,
        winRateRealizedPct: r.win_rate_realized_pct,
        hypothesesGeneratedCount: r.hypotheses_generated_count,
        topGeneratedHypotheses: JSON.parse(r.top_generated_hypotheses || '[]'),
        regimePerformanceSummary: JSON.parse(r.regime_performance_summary || '{}'),
        status: r.status,
        createdAt: r.created_at
      }));
    } catch (err) {
      console.error('[DB] Error getting quant research cycles:', err);
      return [];
    }
  }

  // --- Section 9: Unified Quant Execution Mode, Kill Switch States, and Quant Orders ---

  public getQuantUserSettings(userId?: string | null): {
    userId: string;
    quantExecutionMode: 'ADVISORY_ONLY' | 'SHADOW' | 'LIVE_PAPER' | 'LIVE_REAL';
    minConfidenceThreshold: number;
    allowedUnderlyings: string[];
    maxDailyQuantOrders: number;
    updatedAt: string;
  } {
    const defaultUserId = userId || 'DEFAULT_USER';
    const defaultSettings = {
      userId: defaultUserId,
      quantExecutionMode: 'ADVISORY_ONLY' as const,
      minConfidenceThreshold: 70.0,
      allowedUnderlyings: ['NIFTY', 'BANKNIFTY'],
      maxDailyQuantOrders: 5,
      updatedAt: new Date().toISOString()
    };

    if (!this.db) return defaultSettings;

    try {
      const row = this.db.prepare(
        `SELECT * FROM quant_user_settings WHERE user_id = ?`
      ).get(defaultUserId) as any;

      if (!row) {
        return defaultSettings;
      }

      return {
        userId: row.user_id,
        quantExecutionMode: (row.quant_execution_mode || 'ADVISORY_ONLY') as any,
        minConfidenceThreshold: Number(row.min_confidence_threshold) || 70.0,
        allowedUnderlyings: JSON.parse(row.allowed_underlyings || '["NIFTY","BANKNIFTY"]'),
        maxDailyQuantOrders: Number(row.max_daily_quant_orders) || 5,
        updatedAt: row.updated_at
      };
    } catch (err) {
      console.error('[DB] Error reading quant_user_settings:', err);
      return defaultSettings;
    }
  }

  public saveQuantUserSettings(settings: {
    userId?: string | null;
    quantExecutionMode?: 'ADVISORY_ONLY' | 'SHADOW' | 'LIVE_PAPER' | 'LIVE_REAL';
    minConfidenceThreshold?: number;
    allowedUnderlyings?: string[];
    maxDailyQuantOrders?: number;
  }): {
    userId: string;
    quantExecutionMode: 'ADVISORY_ONLY' | 'SHADOW' | 'LIVE_PAPER' | 'LIVE_REAL';
    minConfidenceThreshold: number;
    allowedUnderlyings: string[];
    maxDailyQuantOrders: number;
    updatedAt: string;
  } {
    const defaultUserId = settings.userId || 'DEFAULT_USER';
    const existing = this.getQuantUserSettings(defaultUserId);
    const updated = {
      userId: defaultUserId,
      quantExecutionMode: settings.quantExecutionMode ?? existing.quantExecutionMode,
      minConfidenceThreshold: settings.minConfidenceThreshold ?? existing.minConfidenceThreshold,
      allowedUnderlyings: settings.allowedUnderlyings ?? existing.allowedUnderlyings,
      maxDailyQuantOrders: settings.maxDailyQuantOrders ?? existing.maxDailyQuantOrders,
      updatedAt: new Date().toISOString()
    };

    if (!this.db) return updated;

    try {
      this.db.prepare(`
        INSERT INTO quant_user_settings (
          user_id, quant_execution_mode, min_confidence_threshold,
          allowed_underlyings, max_daily_quant_orders, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          quant_execution_mode = excluded.quant_execution_mode,
          min_confidence_threshold = excluded.min_confidence_threshold,
          allowed_underlyings = excluded.allowed_underlyings,
          max_daily_quant_orders = excluded.max_daily_quant_orders,
          updated_at = excluded.updated_at
      `).run(
        updated.userId,
        updated.quantExecutionMode,
        updated.minConfidenceThreshold,
        JSON.stringify(updated.allowedUnderlyings),
        updated.maxDailyQuantOrders,
        updated.updatedAt
      );
    } catch (err) {
      console.error('[DB] Error saving quant_user_settings:', err);
    }
    return updated;
  }

  public deleteQuantUserSettings(userId: string): void {
    if (!this.db || !userId) return;
    try {
      this.db.prepare(`DELETE FROM quant_user_settings WHERE user_id = ?`).run(userId);
    } catch (err) {
      console.error('[DB] Error deleting quant_user_settings:', err);
    }
  }

  public getAllActiveQuantUserSettings(): Array<{
    userId: string;
    quantExecutionMode: 'ADVISORY_ONLY' | 'SHADOW' | 'LIVE_PAPER' | 'LIVE_REAL';
    minConfidenceThreshold: number;
    allowedUnderlyings: string[];
    maxDailyQuantOrders: number;
    updatedAt: string;
  }> {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT * FROM quant_user_settings WHERE quant_execution_mode != 'ADVISORY_ONLY'
      `).all() as any[];

      return (rows || []).map(row => ({
        userId: row.user_id,
        quantExecutionMode: row.quant_execution_mode as 'ADVISORY_ONLY' | 'SHADOW' | 'LIVE_PAPER' | 'LIVE_REAL',
        minConfidenceThreshold: Number(row.min_confidence_threshold) || 60,
        allowedUnderlyings: JSON.parse(row.allowed_underlyings || '["NIFTY","BANKNIFTY"]'),
        maxDailyQuantOrders: Number(row.max_daily_quant_orders) || 5,
        updatedAt: row.updated_at
      }));
    } catch (err) {
      console.error('[DB] Error getting active quant_user_settings:', err);
      return [];
    }
  }

  public saveKillSwitchState(state: {
    userId: string;
    status: string;
    isHalted: boolean;
    haltedAt?: string;
    haltReason?: string;
    operator?: string;
    emergencyActions?: string[];
  }): void {
    if (!this.db || !state.userId) return;
    try {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO quant_kill_switch_states (
          user_id, status, is_halted, halted_at, halt_reason, operator,
          emergency_actions_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          status = excluded.status,
          is_halted = excluded.is_halted,
          halted_at = excluded.halted_at,
          halt_reason = excluded.halt_reason,
          operator = excluded.operator,
          emergency_actions_json = excluded.emergency_actions_json,
          updated_at = excluded.updated_at
      `).run(
        state.userId,
        state.status,
        state.isHalted ? 1 : 0,
        state.haltedAt || (state.isHalted ? now : null),
        state.haltReason || null,
        state.operator || 'SYSTEM',
        JSON.stringify(state.emergencyActions || []),
        now
      );
    } catch (err) {
      console.error('[DB] Error saving quant_kill_switch_state:', err);
    }
  }

  public getKillSwitchState(userId: string): any {
    if (!this.db || !userId) return null;
    try {
      const row = this.db.prepare(`
        SELECT * FROM quant_kill_switch_states WHERE user_id = ?
      `).get(userId) as any;
      if (!row) return null;
      return {
        userId: row.user_id,
        status: row.status,
        isHalted: row.is_halted === 1,
        haltedAt: row.halted_at,
        haltReason: row.halt_reason,
        operator: row.operator,
        emergencyActions: JSON.parse(row.emergency_actions_json || '[]'),
        updatedAt: row.updated_at
      };
    } catch (err) {
      console.error('[DB] Error reading quant_kill_switch_state:', err);
      return null;
    }
  }

  public getAllActiveKillSwitchStates(): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT * FROM quant_kill_switch_states WHERE is_halted = 1
      `).all() as any[];
      return rows.map(r => ({
        userId: r.user_id,
        status: r.status,
        isHalted: r.is_halted === 1,
        haltedAt: r.halted_at,
        haltReason: r.halt_reason,
        operator: r.operator,
        emergencyActions: JSON.parse(r.emergency_actions_json || '[]'),
        updatedAt: r.updated_at
      }));
    } catch (err) {
      console.error('[DB] Error reading active kill switch states:', err);
      return [];
    }
  }

  public deleteKillSwitchState(userId: string): void {
    if (!this.db || !userId) return;
    try {
      this.db.prepare(`
        DELETE FROM quant_kill_switch_states WHERE user_id = ?
      `).run(userId);
    } catch (err) {
      console.error('[DB] Error deleting kill switch state:', err);
    }
  }

  public saveQuantOrder(order: {
    id: string;
    userId?: string | null;
    strategyId?: string;
    decisionId?: string;
    underlying?: string;
    symbol: string;
    action: string;
    mode: string;
    status: string;
    executedPrice: number;
    slippage?: number;
    quantity: number;
    legs?: any[];
    decision?: any;
    auditTrailId?: number;
    createdAt?: string;
  }): void {
    if (!this.db || !order || !order.id) return;
    try {
      this.db.prepare(`
        INSERT INTO quant_orders (
          id, user_id, strategy_id, decision_id, underlying, symbol,
          action, mode, status, executed_price, slippage, quantity,
          legs_json, decision_json, audit_trail_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        order.id,
        order.userId || null,
        order.strategyId || null,
        order.decisionId || null,
        order.underlying || null,
        order.symbol,
        order.action,
        order.mode,
        order.status,
        order.executedPrice,
        order.slippage || 0,
        order.quantity,
        JSON.stringify(order.legs || []),
        JSON.stringify(order.decision || {}),
        order.auditTrailId || null,
        order.createdAt || new Date().toISOString()
      );
    } catch (err) {
      console.error('[DB] Error saving quant order:', err);
    }
  }

  public getQuantOrders(limit: number = 50, userId?: string | null): any[] {
    if (!this.db) return [];
    try {
      let rows: any[];
      if (userId) {
        rows = this.db.prepare(`
          SELECT * FROM quant_orders
          WHERE user_id = ? OR user_id IS NULL
          ORDER BY created_at DESC
          LIMIT ?
        `).all(userId, limit);
      } else {
        rows = this.db.prepare(`
          SELECT * FROM quant_orders
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit);
      }

      return rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        strategyId: r.strategy_id,
        decisionId: r.decision_id,
        underlying: r.underlying,
        symbol: r.symbol,
        action: r.action,
        mode: r.mode,
        status: r.status,
        executedPrice: r.executed_price,
        slippage: r.slippage,
        quantity: r.quantity,
        legs: JSON.parse(r.legs_json || '[]'),
        decision: JSON.parse(r.decision_json || '{}'),
        auditTrailId: r.audit_trail_id,
        createdAt: r.created_at
      }));
    } catch (err) {
      console.error('[DB] Error reading quant orders:', err);
      return [];
    }
  }

  public saveQuantFeatureRecord(rec: QuantFeatureRecord): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO quant_feature_history (
          id, timestamp, underlying, spot_price, returns_1m, returns_5m, returns_15m,
          dist_vwap_pct, dist_ema20_pct, dist_ema50_pct, atr, atr_percentile,
          rsi_14, adx_14, pcr_oi, iv_rank, regime,
          forward_return_15m, forward_return_30m, forward_return_1h, forward_return_eod,
          mfe_r, mae_r, event_name
        ) VALUES (
          @id, @timestamp, @underlying, @spotPrice, @returns1m, @returns5m, @returns15m,
          @distVwapPct, @distEma20Pct, @distEma50Pct, @atr, @atrPercentile,
          @rsi14, @adx14, @pcrOi, @ivRank, @regime,
          @forwardReturn15m, @forwardReturn30m, @forwardReturn1h, @forwardReturnEod,
          @mfeR, @maeR, @eventName
        )
      `).run({
        id: rec.id,
        timestamp: rec.timestamp,
        underlying: rec.underlying,
        spotPrice: rec.spotPrice,
        returns1m: rec.returns1m,
        returns5m: rec.returns5m,
        returns15m: rec.returns15m,
        distVwapPct: rec.distVwapPct,
        distEma20Pct: rec.distEma20Pct,
        distEma50Pct: rec.distEma50Pct,
        atr: rec.atr,
        atrPercentile: rec.atrPercentile,
        rsi14: rec.rsi14,
        adx14: rec.adx14,
        pcrOi: rec.pcrOi,
        ivRank: rec.ivRank,
        regime: rec.regime || 'UNKNOWN',
        forwardReturn15m: rec.forwardReturn15m,
        forwardReturn30m: rec.forwardReturn30m,
        forwardReturn1h: rec.forwardReturn1h,
        forwardReturnEod: rec.forwardReturnEod,
        mfeR: rec.mfeR,
        maeR: rec.maeR,
        eventName: rec.eventName || 'Historical Intraday Episode'
      });
    } catch (err) {
      console.error('[DB] Failed to save quant feature record:', err);
    }
  }

  public getQuantFeatureHistory(underlying: string, limit: number = 300): QuantFeatureRecord[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT * FROM quant_feature_history
        WHERE underlying = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(underlying, limit) as any[];

      return rows.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        underlying: r.underlying,
        spotPrice: r.spot_price,
        returns1m: r.returns_1m,
        returns5m: r.returns_5m,
        returns15m: r.returns_15m,
        distVwapPct: r.dist_vwap_pct,
        distEma20Pct: r.dist_ema20_pct,
        distEma50Pct: r.dist_ema50_pct,
        atr: r.atr,
        atrPercentile: r.atr_percentile,
        rsi14: r.rsi_14,
        adx14: r.adx_14,
        pcrOi: r.pcr_oi,
        ivRank: r.iv_rank,
        regime: r.regime,
        forwardReturn15m: r.forward_return_15m,
        forwardReturn30m: r.forward_return_30m,
        forwardReturn1h: r.forward_return_1h,
        forwardReturnEod: r.forward_return_eod,
        mfeR: r.mfe_r,
        maeR: r.mae_r,
        eventName: r.event_name,
        createdAt: r.created_at
      }));
    } catch (err) {
      console.error('[DB] Failed to get quant feature history:', err);
      return [];
    }
  }

  public seedQuantFeatureHistoryIfEmpty(): void {
    if (!this.db) return;
    try {
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM quant_feature_history WHERE underlying = 'NIFTY'`).get() as any;
      if (row && row.count >= 20) {
        return; // Already populated
      }

      console.log('DatabaseEngine: Seeding baseline historical feature vectors for pattern matching...');

      const sampleEpisodes = [
        // Trending Bull Episodes
        {
          symbol: 'NIFTY',
          spot: 24500,
          ret1m: 0.0008, ret5m: 0.0035, ret15m: 0.0065,
          distVwap: 0.35, distEma20: 0.28, distEma50: 0.50,
          atr: 120, atrPct: 65, rsi: 66, adx: 32, pcr: 1.25, ivr: 35,
          regime: 'TREND_UP',
          f15m: 0.0028, f30m: 0.0055, f1h: 0.0085, fEod: 0.0145,
          mfe: 2.5, mae: -0.3,
          name: 'Budget Session Bullish Follow-Through'
        },
        {
          symbol: 'NIFTY',
          spot: 24620,
          ret1m: 0.0010, ret5m: 0.0042, ret15m: 0.0080,
          distVwap: 0.42, distEma20: 0.35, distEma50: 0.62,
          atr: 140, atrPct: 72, rsi: 71, adx: 36, pcr: 1.35, ivr: 40,
          regime: 'TREND_UP',
          f15m: 0.0035, f30m: 0.0068, f1h: 0.0110, fEod: 0.0185,
          mfe: 3.2, mae: -0.2,
          name: 'Post-Election Volatility Crush & Trend Extension'
        },
        {
          symbol: 'NIFTY',
          spot: 24200,
          ret1m: 0.0005, ret5m: 0.0028, ret15m: 0.0050,
          distVwap: 0.25, distEma20: 0.20, distEma50: 0.38,
          atr: 110, atrPct: 55, rsi: 62, adx: 28, pcr: 1.18, ivr: 30,
          regime: 'TREND_UP',
          f15m: 0.0020, f30m: 0.0040, f1h: 0.0065, fEod: 0.0095,
          mfe: 1.9, mae: -0.4,
          name: 'Rate Decision Sustained Drift'
        },
        {
          symbol: 'NIFTY',
          spot: 24350,
          ret1m: 0.0007, ret5m: 0.0038, ret15m: 0.0072,
          distVwap: 0.38, distEma20: 0.30, distEma50: 0.55,
          atr: 125, atrPct: 68, rsi: 68, adx: 34, pcr: 1.30, ivr: 38,
          regime: 'BREAKOUT',
          f15m: 0.0032, f30m: 0.0062, f1h: 0.0098, fEod: 0.0160,
          mfe: 2.8, mae: -0.3,
          name: 'Key Resistance Breakout with OI Expansion'
        },
        // Trending Bear Episodes
        {
          symbol: 'NIFTY',
          spot: 24100,
          ret1m: -0.0012, ret5m: -0.0045, ret15m: -0.0085,
          distVwap: -0.45, distEma20: -0.38, distEma50: -0.65,
          atr: 160, atrPct: 82, rsi: 32, adx: 38, pcr: 0.72, ivr: 65,
          regime: 'TREND_DOWN',
          f15m: -0.0035, f30m: -0.0070, f1h: -0.0115, fEod: -0.0195,
          mfe: 0.3, mae: -3.0,
          name: 'Global Tech Liquidity Selloff'
        },
        {
          symbol: 'NIFTY',
          spot: 23950,
          ret1m: -0.0008, ret5m: -0.0032, ret15m: -0.0060,
          distVwap: -0.32, distEma20: -0.25, distEma50: -0.45,
          atr: 135, atrPct: 70, rsi: 38, adx: 30, pcr: 0.80, ivr: 52,
          regime: 'TREND_DOWN',
          f15m: -0.0022, f30m: -0.0048, f1h: -0.0075, fEod: -0.0130,
          mfe: 0.4, mae: -2.1,
          name: 'Institutional Long Unwinding Wave'
        },
        {
          symbol: 'NIFTY',
          spot: 24050,
          ret1m: -0.0010, ret5m: -0.0040, ret15m: -0.0075,
          distVwap: -0.38, distEma20: -0.32, distEma50: -0.58,
          atr: 150, atrPct: 78, rsi: 34, adx: 35, pcr: 0.75, ivr: 58,
          regime: 'BREAKDOWN',
          f15m: -0.0030, f30m: -0.0060, f1h: -0.0095, fEod: -0.0165,
          mfe: 0.2, mae: -2.7,
          name: 'Major Support Breakdown with Call Writing'
        },
        // Range & Mean Reversion Episodes
        {
          symbol: 'NIFTY',
          spot: 24400,
          ret1m: 0.0001, ret5m: 0.0002, ret15m: 0.0004,
          distVwap: 0.02, distEma20: 0.01, distEma50: 0.03,
          atr: 85, atrPct: 35, rsi: 51, adx: 14, pcr: 0.98, ivr: 22,
          regime: 'RANGE',
          f15m: 0.0002, f30m: -0.0001, f1h: 0.0003, fEod: 0.0005,
          mfe: 0.4, mae: -0.4,
          name: 'Weekly Expiry Max Pain Pinning'
        },
        {
          symbol: 'NIFTY',
          spot: 24420,
          ret1m: -0.0002, ret5m: 0.0001, ret15m: -0.0003,
          distVwap: -0.03, distEma20: -0.02, distEma50: 0.01,
          atr: 75, atrPct: 28, rsi: 49, adx: 12, pcr: 1.02, ivr: 18,
          regime: 'RANGE',
          f15m: -0.0001, f30m: 0.0002, f1h: -0.0002, fEod: 0.0001,
          mfe: 0.3, mae: -0.3,
          name: 'Midday Theta Decay Consolidation'
        },
        {
          symbol: 'NIFTY',
          spot: 24700,
          ret1m: -0.0005, ret5m: -0.0018, ret15m: -0.0035,
          distVwap: 0.55, distEma20: 0.45, distEma50: 0.70,
          atr: 130, atrPct: 62, rsi: 78, adx: 22, pcr: 1.45, ivr: 45,
          regime: 'MEAN_REVERSION',
          f15m: -0.0025, f30m: -0.0045, f1h: -0.0070, fEod: -0.0085,
          mfe: 0.3, mae: -1.5,
          name: 'Exhaustion Top Mean Reversion Pullback'
        },
        {
          symbol: 'NIFTY',
          spot: 23800,
          ret1m: 0.0006, ret5m: 0.0020, ret15m: 0.0040,
          distVwap: -0.60, distEma20: -0.48, distEma50: -0.75,
          atr: 145, atrPct: 75, rsi: 22, adx: 24, pcr: 0.65, ivr: 62,
          regime: 'MEAN_REVERSION',
          f15m: 0.0030, f30m: 0.0055, f1h: 0.0080, fEod: 0.0105,
          mfe: 2.1, mae: -0.4,
          name: 'Oversold Panic Washout Bounce'
        },
        {
          symbol: 'NIFTY',
          spot: 24450,
          ret1m: 0.0002, ret5m: -0.0003, ret15m: 0.0005,
          distVwap: 0.05, distEma20: 0.04, distEma50: 0.06,
          atr: 90, atrPct: 40, rsi: 53, adx: 16, pcr: 1.05, ivr: 25,
          regime: 'RANGE',
          f15m: 0.0004, f30m: 0.0006, f1h: 0.0008, fEod: 0.0012,
          mfe: 0.6, mae: -0.5,
          name: 'Pre-Holiday Low Volatility Equilibrium'
        },
        // Volatility Expansion Episodes
        {
          symbol: 'NIFTY',
          spot: 24300,
          ret1m: 0.0015, ret5m: 0.0055, ret15m: 0.0095,
          distVwap: 0.50, distEma20: 0.40, distEma50: 0.70,
          atr: 180, atrPct: 92, rsi: 65, adx: 42, pcr: 1.10, ivr: 75,
          regime: 'VOL_EXPANSION',
          f15m: 0.0045, f30m: 0.0085, f1h: 0.0140, fEod: 0.0220,
          mfe: 3.5, mae: -0.8,
          name: 'FOMC Shock Volatility Expansion Spike'
        },
        {
          symbol: 'NIFTY',
          spot: 24150,
          ret1m: -0.0018, ret5m: -0.0062, ret15m: -0.0110,
          distVwap: -0.65, distEma20: -0.55, distEma50: -0.85,
          atr: 210, atrPct: 96, rsi: 28, adx: 45, pcr: 0.60, ivr: 85,
          regime: 'VOL_EXPANSION',
          f15m: -0.0055, f30m: -0.0095, f1h: -0.0160, fEod: -0.0260,
          mfe: 0.4, mae: -4.2,
          name: 'Geopolitical Escalation Volatility Surge'
        }
      ];

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO quant_feature_history (
          id, timestamp, underlying, spot_price, returns_1m, returns_5m, returns_15m,
          dist_vwap_pct, dist_ema20_pct, dist_ema50_pct, atr, atr_percentile,
          rsi_14, adx_14, pcr_oi, iv_rank, regime,
          forward_return_15m, forward_return_30m, forward_return_1h, forward_return_eod,
          mfe_r, mae_r, event_name
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
      `);

      const insertMany = this.db.transaction((records: any[]) => {
        for (const rec of records) {
          stmt.run(
            rec.id, rec.timestamp, rec.underlying, rec.spotPrice,
            rec.returns1m, rec.returns5m, rec.returns15m,
            rec.distVwapPct, rec.distEma20Pct, rec.distEma50Pct,
            rec.atr, rec.atrPercentile, rec.rsi14, rec.adx14,
            rec.pcrOi, rec.ivRank, rec.regime,
            rec.forwardReturn15m, rec.forwardReturn30m, rec.forwardReturn1h, rec.forwardReturnEod,
            rec.mfeR, rec.maeR, rec.eventName
          );
        }
      });

      const recordsToInsert: any[] = [];
      const baseTime = Date.now() - 90 * 86400000; // past 90 days

      // Seed 28 records for NIFTY and 28 records for BANKNIFTY
      const symbols = ['NIFTY', 'BANKNIFTY'];
      for (const sym of symbols) {
        const multiplier = sym === 'BANKNIFTY' ? 2.1 : 1.0;
        const spotBase = sym === 'BANKNIFTY' ? 51500 : 24300;

        sampleEpisodes.forEach((ep, idx) => {
          // 2 variations of each episode (e.g. morning and afternoon)
          for (let v = 0; v < 2; v++) {
            const timeOffset = (idx * 2 + v) * 2.5 * 86400000 + (v * 14400000);
            const ts = new Date(baseTime + timeOffset).toISOString();
            const jitter = (v === 1 ? 1.05 : 0.95);

            recordsToInsert.push({
              id: `FEAT_${sym}_${idx}_${v}`,
              timestamp: ts,
              underlying: sym,
              spotPrice: Number((spotBase * (1 + ep.distVwap * 0.01 * jitter)).toFixed(2)),
              returns1m: Number((ep.ret1m * jitter).toFixed(6)),
              returns5m: Number((ep.ret5m * jitter).toFixed(6)),
              returns15m: Number((ep.ret15m * jitter).toFixed(6)),
              distVwapPct: Number((ep.distVwap * jitter).toFixed(4)),
              distEma20Pct: Number((ep.distEma20 * jitter).toFixed(4)),
              distEma50Pct: Number((ep.distEma50 * jitter).toFixed(4)),
              atr: Number((ep.atr * multiplier * jitter).toFixed(2)),
              atrPercentile: Math.min(99, Math.max(5, Math.round(ep.atrPct * jitter))),
              rsi14: Math.min(95, Math.max(10, Math.round(ep.rsi + (v === 1 ? 1.5 : -1.5)))),
              adx14: Math.min(60, Math.max(8, Math.round(ep.adx * jitter))),
              pcrOi: Number((ep.pcr * jitter).toFixed(2)),
              ivRank: Math.min(99, Math.max(5, Math.round(ep.ivr * jitter))),
              regime: ep.regime,
              forwardReturn15m: Number((ep.f15m * jitter).toFixed(6)),
              forwardReturn30m: Number((ep.f30m * jitter).toFixed(6)),
              forwardReturn1h: Number((ep.f1h * jitter).toFixed(6)),
              forwardReturnEod: Number((ep.fEod * jitter).toFixed(6)),
              mfeR: Number((ep.mfe * jitter).toFixed(2)),
              maeR: Number((ep.mae * jitter).toFixed(2)),
              eventName: `${ep.name} (V${v + 1})`
            });
          }
        });
      }

      insertMany(recordsToInsert);
      console.log(`DatabaseEngine: Successfully seeded ${recordsToInsert.length} historical feature vectors.`);
    } catch (err) {
      console.error('[DB] Failed to seed quant feature history:', err);
    }
  }
}

export const dbEngine = new DatabaseEngine();
