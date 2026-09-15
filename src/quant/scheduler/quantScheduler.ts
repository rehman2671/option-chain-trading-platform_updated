/**
 * Autonomous Quant Background Learning Scheduler
 * Coordinates autonomous continuous research, post-market learning feedback cycles,
 * and hourly market-hours calibration and model drift checks.
 *
 * Safe scheduler pattern: setInterval with .unref() matching server/engine/marketFeed.ts.
 * Runs minute-or-longer check intervals to prevent database and event loop strain.
 */

import { continuousResearchEngine, DailyResearchCycleSummary } from '../learning/continuousResearch.js';
import { calibrationEngine, CalibrationReport } from '../learning/calibrationEngine.js';
import { dbEngine } from '../../server/db.js';
import { decisionEngine } from '../decision/decisionEngine.js';
import { orderAdapter, QuantOrderRequest, QuantOrderResult } from '../adapters/orderAdapter.js';
import { killSwitchEngine } from '../risk/killSwitch.js';
import { drawdownController } from '../risk/drawdownController.js';
import { exposureController } from '../risk/exposureController.js';
import { quantAuditLogger } from '../audit/auditLogger.js';
import { getComputedMarketContext } from '../context/marketContext.js';
import { QuantUnderlying, QuantExecutionMode, QuantDecisionOutput } from '../types.js';

export interface QuantSchedulerStatus {
  isStarted: boolean;
  tickIntervalMs: number;
  lastDailyRunDate: string | null;
  lastHourlyCheckHour: string | null;
  isCycleRunning: boolean;
  lastResearchCycleSummary: DailyResearchCycleSummary | null;
  lastCalibrationReport: {
    asOf: string;
    reliabilityStatus: string;
    overallBrierScore: number;
  } | null;
  istNow: {
    dateStr: string;
    istTime: string;
    isMarketOpen: boolean;
    isPostMarket: boolean;
    currentMinutes: number;
  };
}

export interface SchedulerTickResult {
  actionTaken: 'DAILY_CYCLE' | 'HOURLY_CHECK' | 'SKIPPED_ALREADY_RUN' | 'NONE';
  message: string;
  summary?: DailyResearchCycleSummary;
  calibrationReport?: CalibrationReport;
}

export class QuantScheduler {
  private static instance: QuantScheduler;

  private intervalTimer: any = null;
  private isStarted: boolean = false;
  private tickIntervalMs: number = 60_000; // 60s check cadence (safe, minute-level)
  private lastDailyRunDate: string | null = null; // YYYY-MM-DD in IST
  private lastHourlyCheckHour: string | null = null; // YYYY-MM-DD_HH in IST
  private isCycleRunning: boolean = false;
  private lastResearchCycleSummary: DailyResearchCycleSummary | null = null;
  private lastCalibrationReport: {
    asOf: string;
    reliabilityStatus: string;
    overallBrierScore: number;
  } | null = null;

  private constructor() {}

  public static getInstance(): QuantScheduler {
    if (!QuantScheduler.instance) {
      QuantScheduler.instance = new QuantScheduler();
    }
    return QuantScheduler.instance;
  }

  /**
   * Helper: Calculates IST (UTC+5:30) date, time, and market phase
   */
  public getIstDateTime(date: Date = new Date()): {
    dateStr: string;
    hours: number;
    minutes: number;
    dayOfWeek: number;
    currentMinutes: number;
    istTime: string;
    isWeekday: boolean;
    isMarketOpen: boolean;
    isPostMarket: boolean;
  } {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + istOffset);

    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const currentMinutes = hours * 60 + minutes;
    const dayOfWeek = istDate.getUTCDay(); // 0 = Sun, 6 = Sat
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // NSE Trading Hours: 09:15 to 15:30 IST (555m to 930m)
    const marketOpenMinutes = 9 * 60 + 15;  // 555
    const marketCloseMinutes = 15 * 60 + 30; // 930

    const isMarketOpen = isWeekday && currentMinutes >= marketOpenMinutes && currentMinutes < marketCloseMinutes;
    const isPostMarket = currentMinutes >= marketCloseMinutes;
    const istTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} IST`;

    return {
      dateStr,
      hours,
      minutes,
      dayOfWeek,
      currentMinutes,
      istTime,
      isWeekday,
      isMarketOpen,
      isPostMarket
    };
  }

  /**
   * Initialize and start the background scheduler.
   * Safe to call on server startup.
   */
  public async initialize(options?: { tickIntervalMs?: number; skipInitialTick?: boolean }): Promise<void> {
    if (this.isStarted) {
      console.log('[QUANT SCHEDULER] Already initialized and running.');
      return;
    }

    this.isStarted = true;
    this.tickIntervalMs = options?.tickIntervalMs || 60_000;

    // Hydrate lastDailyRunDate from DB quant_research_cycles to persist state across restarts
    try {
      const recentCycles = dbEngine.getQuantResearchCycles(5);
      if (recentCycles && recentCycles.length > 0) {
        const latest = recentCycles[0];
        this.lastResearchCycleSummary = latest;
        const ist = this.getIstDateTime(new Date(latest.executionTimestamp));
        this.lastDailyRunDate = ist.dateStr;
        console.log(`[QUANT SCHEDULER] Hydrated last research cycle from SQLite: ${latest.cycleId} on ${this.lastDailyRunDate}.`);
      }
    } catch (err: any) {
      console.warn('[QUANT SCHEDULER] Note: Could not read previous research cycle from DB:', err.message);
    }

    // Start background interval using standard unref pattern
    this.intervalTimer = setInterval(() => {
      this.tick().catch(err => console.error('[QUANT SCHEDULER] Tick error:', err.message));
    }, this.tickIntervalMs);

    if (this.intervalTimer && typeof this.intervalTimer.unref === 'function') {
      this.intervalTimer.unref();
    }

    console.log(`[QUANT SCHEDULER] Autonomous background scheduler started (check interval: ${this.tickIntervalMs / 1000}s).`);

    if (!options?.skipInitialTick) {
      // Execute non-blocking initial tick check
      this.tick().catch(err => console.error('[QUANT SCHEDULER] Initial tick check error:', err.message));
    }
  }

  /**
   * Single scheduler evaluation tick
   * Checks current IST time and triggers either:
   * 1. Daily Post-Market Research Cycle (>= 15:30 IST, guarded once per calendar date)
   * 2. Hourly Market-Hours Calibration & Health Check (09:15 - 15:30 IST on weekdays)
   */
  public async tick(): Promise<SchedulerTickResult> {
    if (this.isCycleRunning) {
      return { actionTaken: 'NONE', message: 'Cycle already running. Skipping concurrent tick.' };
    }

    const ist = this.getIstDateTime();

    // 1. Post-Market Autonomous Research Cycle (After 15:30 IST)
    // Runs once daily after market close
    if (ist.isPostMarket) {
      if (this.lastDailyRunDate === ist.dateStr) {
        const msg = `Daily post-market cycle already completed for ${ist.dateStr}. Skipping.`;
        console.log(`[QUANT SCHEDULER] ${msg}`);
        return { actionTaken: 'SKIPPED_ALREADY_RUN', message: msg };
      }

      console.log(`[QUANT SCHEDULER] Initiating scheduled post-market learning cycle for ${ist.dateStr} (IST: ${ist.istTime})...`);
      try {
        this.isCycleRunning = true;
        const summary = continuousResearchEngine.runPostMarketCycle({
          triggerSource: 'SCHEDULED'
        });
        this.lastDailyRunDate = ist.dateStr;
        this.lastResearchCycleSummary = summary;
        return {
          actionTaken: 'DAILY_CYCLE',
          message: `Autonomous post-market research cycle completed for ${ist.dateStr} (Cycle: ${summary.cycleId})`,
          summary
        };
      } catch (err: any) {
        console.error('[QUANT SCHEDULER] Error during scheduled post-market cycle:', err);
        return { actionTaken: 'NONE', message: `Post-market cycle error: ${err.message}` };
      } finally {
        this.isCycleRunning = false;
      }
    }

    // 2. Lighter-weight hourly calibration & model health check during market hours (09:15 to 15:30 IST)
    if (ist.isMarketOpen) {
      const hourKey = `${ist.dateStr}_${ist.hours}`;
      if (this.lastHourlyCheckHour !== hourKey) {
        console.log(`[QUANT SCHEDULER] Running hourly market-hours calibration check (${hourKey})...`);
        try {
          const report = calibrationEngine.getCalibrationReport();
          this.lastCalibrationReport = {
            asOf: report.asOf,
            reliabilityStatus: report.reliabilityStatus,
            overallBrierScore: report.overallBrierScore
          };
          this.lastHourlyCheckHour = hourKey;
          return {
            actionTaken: 'HOURLY_CHECK',
            message: `Hourly calibration check completed: Status=${report.reliabilityStatus}, Brier=${report.overallBrierScore}`,
            calibrationReport: report
          };
        } catch (err: any) {
          console.error('[QUANT SCHEDULER] Error during hourly calibration check:', err);
          return { actionTaken: 'NONE', message: `Hourly calibration check error: ${err.message}` };
        }
      }

      // 3. Automated Decision Engine execution check for users in non-advisory mode during market hours
      try {
        const activeSettings = dbEngine.getAllActiveQuantUserSettings();
        for (const userSetting of activeSettings) {
          if (userSetting.quantExecutionMode !== 'ADVISORY_ONLY') {
            await this.runQuantDecisionExecutionCycle(userSetting.userId, 'NIFTY');
          }
        }
      } catch (err: any) {
        console.warn('[QUANT SCHEDULER] Warning during decision execution cycle:', err.message);
      }
    }

    return {
      actionTaken: 'NONE',
      message: `No action required at ${ist.istTime} (${ist.isMarketOpen ? 'Market Open' : 'Pre-Market / Off-Hours'}).`
    };
  }

  /**
   * Executes a scheduled decision cycle for a user and optionally routes to order execution based on execution mode.
   * STRICT SAFETY RULES:
   * - If executionMode is ADVISORY_ONLY: only the decision is evaluated and recorded. NO orders are sent.
   * - If executionMode is SHADOW: orders are routed to orderAdapter with mode: 'SHADOW'.
   * - If executionMode is LIVE_PAPER: orders are routed to orderAdapter with mode: 'PAPER'.
   * - If executionMode is LIVE_REAL: orders are routed to orderAdapter with mode: 'LIVE'.
   * - In ALL modes, kill switch, drawdown controller, and exposure controller are enforced.
   */
  public async runQuantDecisionExecutionCycle(
    userId?: string | null,
    underlying: QuantUnderlying = 'NIFTY'
  ): Promise<{
    decision: QuantDecisionOutput | null;
    orderResult?: QuantOrderResult | null;
    executionMode: QuantExecutionMode;
    message: string;
    blockedByRisk?: boolean;
  }> {
    const uId = userId || 'GLOBAL';

    // 1. Hard Risk Control: Kill Switch
    if (killSwitchEngine.isHalted(uId)) {
      const haltReason = killSwitchEngine.getHaltReason(uId) || 'Kill switch is active';
      quantAuditLogger.log({
        actor: 'QUANT_SCHEDULER',
        action: 'EXECUTION_BLOCKED_KILL_SWITCH',
        entityType: 'RISK',
        entityId: uId,
        reason: haltReason
      });
      return {
        decision: null,
        orderResult: null,
        executionMode: 'ADVISORY_ONLY',
        message: `Execution blocked by Unified Risk Control: Kill Switch is active (${haltReason})`,
        blockedByRisk: true
      };
    }

    // 2. Drawdown Controller check
    if (drawdownController.isHalted(uId)) {
      return {
        decision: null,
        orderResult: null,
        executionMode: 'ADVISORY_ONLY',
        message: 'Execution blocked by Drawdown Controller: Portfolio drawdown halt active',
        blockedByRisk: true
      };
    }

    // 3. Retrieve user settings (defaults to ADVISORY_ONLY if unset)
    const settings = dbEngine.getQuantUserSettings(uId);
    const executionMode = settings.quantExecutionMode || 'ADVISORY_ONLY';

    // 4. Check if underlying is allowed in user settings
    if (settings.allowedUnderlyings && settings.allowedUnderlyings.length > 0) {
      if (!settings.allowedUnderlyings.includes(underlying)) {
        return {
          decision: null,
          orderResult: null,
          executionMode,
          message: `Underlying ${underlying} not in user's allowed underlyings list.`
        };
      }
    }

    // 5. Compute market context
    const { features, regime, quality } = getComputedMarketContext(underlying);
    const ist = this.getIstDateTime();

    // 6. Generate decision via decisionEngine
    const decision = decisionEngine.decide(underlying, regime, features, quality, ist.isMarketOpen);

    // 7. If decision is NO_TRADE or has no strategy, do not order
    if (decision.action !== 'ENTER' || !decision.strategy) {
      return {
        decision,
        orderResult: null,
        executionMode,
        message: `Decision output: ${decision.action}. No execution required (${decision.noTradeReason || 'Stand-aside gate active'})`
      };
    }

    // 8. Check minimum confidence threshold
    if (decision.metrics && decision.metrics.confidenceScore < (settings.minConfidenceThreshold || 60)) {
      return {
        decision,
        orderResult: null,
        executionMode,
        message: `Decision confidence score (${decision.metrics.confidenceScore}%) below user threshold (${settings.minConfidenceThreshold}%). Execution skipped.`
      };
    }

    // 9. Handle based on executionMode
    if (executionMode === 'ADVISORY_ONLY') {
      quantAuditLogger.log({
        actor: 'QUANT_SCHEDULER',
        action: 'DECISION_ADVISORY_ONLY',
        entityType: 'DECISION',
        entityId: decision.decisionId,
        afterState: decision,
        reason: 'User in ADVISORY_ONLY mode. Order execution safely suppressed.'
      });
      return {
        decision,
        orderResult: null,
        executionMode: 'ADVISORY_ONLY',
        message: `Decision generated: ${decision.strategy.name}. No order submitted because user is in ADVISORY_ONLY mode.`
      };
    }

    // Prepare order request
    const orderMode: 'SHADOW' | 'PAPER' | 'LIVE' =
      executionMode === 'SHADOW'
        ? 'SHADOW'
        : executionMode === 'LIVE_PAPER'
        ? 'PAPER'
        : 'LIVE';

    const orderReq: QuantOrderRequest = {
      strategyId: decision.strategy.id,
      symbol: `${underlying} ${decision.strategy.strikes || ''}`,
      action: 'BUY',
      orderType: 'LIMIT',
      limitPrice: decision.marketState.spotPrice,
      quantity: (decision.strategy.positionSizeLots || 1) * 25,
      mode: orderMode,
      tag: `Quant-${decision.strategy.id}`,
      userId: uId,
      decisionId: decision.decisionId
    };

    // Route order through orderAdapter (which enforces risk checks & logging)
    const orderResult = orderAdapter.submitOrder(orderReq);

    quantAuditLogger.log({
      actor: 'QUANT_SCHEDULER',
      action: `DECISION_TO_${orderMode}_ORDER`,
      entityType: 'ORDER',
      entityId: orderResult.orderId,
      afterState: orderResult,
      reason: `Automated routing from Decision ${decision.decisionId} under mode ${executionMode}: ${orderResult.message}`
    });

    return {
      decision,
      orderResult,
      executionMode,
      message: `Decision routed to ${executionMode} execution: ${orderResult.message}`
    };
  }

  /**
   * Directly triggers the underlying research cycle (used by manual button or test triggers).
   * Ensures the scheduled run and manual run execute the EXACT same underlying function.
   */
  public async runDailyResearchCycle(
    source: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED',
    options?: { force?: boolean; baseStrategyId?: string }
  ): Promise<DailyResearchCycleSummary | null> {
    const ist = this.getIstDateTime();

    if (!options?.force && this.lastDailyRunDate === ist.dateStr) {
      const msg = `Daily post-market cycle already completed for ${ist.dateStr}. Skipping.`;
      console.log(`[QUANT SCHEDULER] ${msg}`);
      return null;
    }

    this.isCycleRunning = true;
    try {
      const summary = continuousResearchEngine.runPostMarketCycle({
        triggerSource: source,
        baseStrategyId: options?.baseStrategyId,
        force: options?.force
      });
      this.lastDailyRunDate = ist.dateStr;
      this.lastResearchCycleSummary = summary;
      return summary;
    } finally {
      this.isCycleRunning = false;
    }
  }

  /**
   * Stop background scheduler (for test isolation and clean shutdown)
   */
  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isStarted = false;
    this.isCycleRunning = false;
    console.log('[QUANT SCHEDULER] Background scheduler stopped.');
  }

  /**
   * Get current scheduler telemetry and health status
   */
  public getStatus(): QuantSchedulerStatus {
    const ist = this.getIstDateTime();
    return {
      isStarted: this.isStarted,
      tickIntervalMs: this.tickIntervalMs,
      lastDailyRunDate: this.lastDailyRunDate,
      lastHourlyCheckHour: this.lastHourlyCheckHour,
      isCycleRunning: this.isCycleRunning,
      lastResearchCycleSummary: this.lastResearchCycleSummary,
      lastCalibrationReport: this.lastCalibrationReport,
      istNow: {
        dateStr: ist.dateStr,
        istTime: ist.istTime,
        isMarketOpen: ist.isMarketOpen,
        isPostMarket: ist.isPostMarket,
        currentMinutes: ist.currentMinutes
      }
    };
  }

  /**
   * Testing hook: override lastDailyRunDate to test daily-run guard
   */
  public setLastDailyRunDate(dateStr: string | null): void {
    this.lastDailyRunDate = dateStr;
  }

  public getLastDailyRunDate(): string | null {
    return this.lastDailyRunDate;
  }
}

export const quantScheduler = QuantScheduler.getInstance();
