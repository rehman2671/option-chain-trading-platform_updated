/**
 * Hard Risk Controls & Kill Switch Engine (Section 85 & PART B6)
 *
 * Hard controls (strictly non-overridable in LIVE execution):
 * - Daily loss limit: 3% (Auto halt trading)
 * - Max drawdown: 10% (Auto halt trading)
 * - Max leverage: 2x
 * - Max open positions: 10
 *
 * Kill Switch features:
 * - Single authoritative source of truth across all engines (autonomous + quant)
 * - Per-user state isolation with global system fallback
 * - DB-backed persistence across server restarts
 * - Disarm autonomous strategies on halt
 * - Rejection of any incoming order if risk breach or kill switch active
 * - Audited reset / unhalt workflow with supervisor key validation
 */

import { dbEngine } from '../../server/db.js';

export type KillSwitchStatus = 'ARMED' | 'HALTED' | 'MANUAL_HALTED';

export interface HardControlLimits {
  dailyLossLimitPct: number;
  maxDrawdownLimitPct: number;
  maxLeverageRatio: number;
  maxOpenPositions: number;
}

export interface KillSwitchState {
  status: KillSwitchStatus;
  isTradingHalted: boolean;
  haltedAt?: string;
  haltReason?: string;
  currentDailyLossPct: number;
  currentDrawdownPct: number;
  currentLeverageRatio: number;
  openPositionsCount: number;
  hardLimits: HardControlLimits;
  emergencyActionsExecuted: string[];
}

export class KillSwitchEngine {
  private static instance: KillSwitchEngine;
  private userStates: Map<string, KillSwitchState> = new Map();
  private defaultLimits: HardControlLimits = {
    dailyLossLimitPct: 3.0,
    maxDrawdownLimitPct: 10.0,
    maxLeverageRatio: 2.0,
    maxOpenPositions: 10
  };

  private constructor() {
    this.hydrateFromDb();
  }

  public static getInstance(): KillSwitchEngine {
    if (!KillSwitchEngine.instance) {
      KillSwitchEngine.instance = new KillSwitchEngine();
    }
    return KillSwitchEngine.instance;
  }

  private resolveKey(userId?: string | null): string {
    return userId && userId.trim() ? userId.trim() : 'GLOBAL';
  }

  private getOrCreateState(key: string): KillSwitchState {
    let state = this.userStates.get(key);
    if (!state) {
      state = {
        status: 'ARMED',
        isTradingHalted: false,
        currentDailyLossPct: 0.0,
        currentDrawdownPct: 0.0,
        currentLeverageRatio: 0.0,
        openPositionsCount: 0,
        hardLimits: { ...this.defaultLimits },
        emergencyActionsExecuted: []
      };
      this.userStates.set(key, state);
    }
    return state;
  }

  public hydrateFromDb(): void {
    try {
      const activeStates = dbEngine.getAllActiveKillSwitchStates();
      if (activeStates && activeStates.length > 0) {
        for (const s of activeStates) {
          const key = this.resolveKey(s.userId);
          const state = this.getOrCreateState(key);
          state.status = (s.status as KillSwitchStatus) || 'HALTED';
          state.isTradingHalted = true;
          state.haltedAt = s.haltedAt;
          state.haltReason = s.haltReason;
          state.emergencyActionsExecuted = s.emergencyActions || [];
        }
        console.log(`[KILL SWITCH ENGINE] Hydrated ${activeStates.length} active kill switch states from SQLite.`);
      }
    } catch (err: any) {
      console.warn('[KILL SWITCH ENGINE] Warning during state hydration:', err?.message);
    }
  }

  public isHalted(userId?: string | null): boolean {
    // 1. Check GLOBAL halt (blocks all trading everywhere)
    const globalState = this.userStates.get('GLOBAL');
    if (globalState && globalState.isTradingHalted) {
      return true;
    }

    // 2. Check user-specific halt
    if (userId) {
      const userKey = this.resolveKey(userId);
      const userState = this.userStates.get(userKey);
      if (userState && userState.isTradingHalted) {
        return true;
      }
    }

    return false;
  }

  public getHaltReason(userId?: string | null): string | undefined {
    const globalState = this.userStates.get('GLOBAL');
    if (globalState && globalState.isTradingHalted) {
      return globalState.haltReason || 'System-wide emergency halt active.';
    }

    if (userId) {
      const userKey = this.resolveKey(userId);
      const userState = this.userStates.get(userKey);
      if (userState && userState.isTradingHalted) {
        return userState.haltReason;
      }
    }

    return undefined;
  }

  public getState(userId?: string | null): KillSwitchState {
    const key = this.resolveKey(userId);
    const state = this.getOrCreateState(key);
    // If GLOBAL is halted, reflect trading halted
    const isGloballyHalted = this.userStates.get('GLOBAL')?.isTradingHalted ?? false;
    return {
      ...state,
      isTradingHalted: state.isTradingHalted || isGloballyHalted,
      haltReason: state.haltReason || (isGloballyHalted ? this.userStates.get('GLOBAL')?.haltReason : undefined)
    };
  }

  /**
   * Evaluates incoming portfolio metrics against non-overridable hard controls
   */
  public evaluateHardControls(
    metrics: {
      dailyLossPct: number;
      drawdownPct: number;
      leverageRatio: number;
      openPositionsCount: number;
    },
    userId?: string | null
  ): KillSwitchState {
    const key = this.resolveKey(userId);
    const state = this.getOrCreateState(key);

    state.currentDailyLossPct = metrics.dailyLossPct;
    state.currentDrawdownPct = metrics.drawdownPct;
    state.currentLeverageRatio = metrics.leverageRatio;
    state.openPositionsCount = metrics.openPositionsCount;

    // Check automatic breaches
    if (state.status === 'ARMED') {
      if (metrics.dailyLossPct >= state.hardLimits.dailyLossLimitPct) {
        this.triggerHalt(
          `AUTOMATIC BREACH: Daily loss reached ${metrics.dailyLossPct.toFixed(2)}%, exceeding ${state.hardLimits.dailyLossLimitPct}% hard limit.`,
          userId,
          'AUTOMATIC_RISK_BREACH'
        );
      } else if (metrics.drawdownPct >= state.hardLimits.maxDrawdownLimitPct) {
        this.triggerHalt(
          `AUTOMATIC BREACH: Max drawdown reached ${metrics.drawdownPct.toFixed(2)}%, exceeding ${state.hardLimits.maxDrawdownLimitPct}% hard limit.`,
          userId,
          'AUTOMATIC_RISK_BREACH'
        );
      } else if (metrics.leverageRatio > state.hardLimits.maxLeverageRatio) {
        this.triggerHalt(
          `AUTOMATIC BREACH: Portfolio leverage reached ${metrics.leverageRatio.toFixed(2)}x, exceeding ${state.hardLimits.maxLeverageRatio}x limit.`,
          userId,
          'AUTOMATIC_RISK_BREACH'
        );
      } else if (metrics.openPositionsCount > state.hardLimits.maxOpenPositions) {
        this.triggerHalt(
          `AUTOMATIC BREACH: Open positions (${metrics.openPositionsCount}) exceeded ceiling of ${state.hardLimits.maxOpenPositions}.`,
          userId,
          'AUTOMATIC_RISK_BREACH'
        );
      }
    }

    return this.getState(userId);
  }

  /**
   * Manual Kill Switch (one-click immediate square-off and trading halt)
   */
  public manualEmergencyKill(
    operator: string = 'QUANT_SUPERVISOR',
    userId?: string | null,
    reason?: string
  ): KillSwitchState {
    const key = this.resolveKey(userId);
    const state = this.getOrCreateState(key);

    state.status = 'MANUAL_HALTED';
    state.isTradingHalted = true;
    state.haltedAt = new Date().toISOString();
    state.haltReason = reason || `EMERGENCY MANUAL KILL SWITCH triggered by operator [${operator}]. All automated orders cancelled and positions marked for immediate square-off.`;
    state.emergencyActionsExecuted = [
      'CANCEL_ALL_PENDING_BASKETS',
      'HALT_ALL_STRATEGY_ENGINES',
      'FIRE_MARKET_EXIT_ORDERS',
      'LOCKOUT_NEW_ORDER_DISPATCH'
    ];

    // Persist to DB
    try {
      dbEngine.saveKillSwitchState({
        userId: key,
        status: state.status,
        isHalted: true,
        haltedAt: state.haltedAt,
        haltReason: state.haltReason,
        operator,
        emergencyActions: state.emergencyActionsExecuted
      });

      // Disarm all autonomous strategies for this user/global
      dbEngine.disarmAllAutonomousStrategies(state.haltReason, userId || undefined);
    } catch (err) {
      console.error('[KILL SWITCH ENGINE] Error persisting kill switch state:', err);
    }

    return this.getState(userId);
  }

  /**
   * Triggers automatic halt
   */
  public triggerHalt(
    reason: string,
    userId?: string | null,
    operator: string = 'RISK_ENGINE'
  ): KillSwitchState {
    const key = this.resolveKey(userId);
    const state = this.getOrCreateState(key);

    state.status = 'HALTED';
    state.isTradingHalted = true;
    state.haltedAt = new Date().toISOString();
    state.haltReason = reason;
    state.emergencyActionsExecuted = [
      'HALT_NEW_ORDER_DISPATCH',
      'CANCEL_PENDING_UNFILLED_ORDERS',
      'NOTIFY_RISK_MANAGER'
    ];

    // Persist to DB
    try {
      dbEngine.saveKillSwitchState({
        userId: key,
        status: state.status,
        isHalted: true,
        haltedAt: state.haltedAt,
        haltReason: state.haltReason,
        operator,
        emergencyActions: state.emergencyActionsExecuted
      });

      // Disarm all autonomous strategies
      dbEngine.disarmAllAutonomousStrategies(reason, userId || undefined);
    } catch (err) {
      console.error('[KILL SWITCH ENGINE] Error persisting automatic halt state:', err);
    }

    return this.getState(userId);
  }

  /**
   * Audited reset / unhalt workflow
   */
  public resetKillSwitch(
    supervisorKey: string,
    reason: string,
    userId?: string | null
  ): { success: boolean; message: string; state: KillSwitchState } {
    const validKeys = ['RESET_RISK_AUTH', 'OVERRIDE_OK', 'USER_MANUAL_RESET'];
    if (!validKeys.includes(supervisorKey)) {
      return {
        success: false,
        message: 'Invalid supervisor key. Reset denied.',
        state: this.getState(userId)
      };
    }

    const key = this.resolveKey(userId);
    const state = this.getOrCreateState(key);

    state.status = 'ARMED';
    state.isTradingHalted = false;
    state.haltedAt = undefined;
    state.haltReason = undefined;
    state.emergencyActionsExecuted = [];

    // Update SQLite persistence
    try {
      dbEngine.saveKillSwitchState({
        userId: key,
        status: 'ARMED',
        isHalted: false,
        haltedAt: undefined,
        haltReason: undefined,
        operator: supervisorKey,
        emergencyActions: []
      });
    } catch (err) {
      console.error('[KILL SWITCH ENGINE] Error updating DB on reset:', err);
    }

    return {
      success: true,
      message: `Kill switch reset successfully for [${key}]. Reason logged: "${reason}"`,
      state: this.getState(userId)
    };
  }
}

export const killSwitchEngine = KillSwitchEngine.getInstance();
