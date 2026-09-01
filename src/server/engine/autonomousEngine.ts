/**
 * Autonomous Strategy Runner Engine (Phase J)
 * Full-Auto, Practice/DRY_RUN Scoped Deterministic Rule-Based Engine.
 *
 * NON-NEGOTIABLE COMPLIANCE RULES:
 * 1. Purely deterministic rule-based evaluation — NEVER calls LLM/Gemini for trading decisions.
 * 2. Every strategy defaults to armed: false.
 * 3. Structurally routes through the exact same margin & basket execution functions as manual Strategy Builder.
 * 4. Global Kill Switch disarms all strategies instantly.
 */

import { dbEngine } from '../db.js';
import { globalMarketFeed } from './marketFeed.js';
import { globalBasketEngine } from './basketEngine.js';
import { activeProvider } from './providers/index.js';
import { evaluateRuleGroup, EvaluationContext } from './ruleEvaluator.js';
import { AutonomousStrategy, AutonomousStrategyLog, AutonomousRunnerStatus, StrategyLeg } from '../../types.js';

export class AutonomousRunnerEngine {
  private killSwitchByUser: Map<string, { reason: string; triggeredAt: string }> = new Map();
  private runnerInterval?: NodeJS.Timeout;
  private isProcessingLoop: boolean = false;

  // Configurable Safety Limits (Task 4)
  public readonly MAX_CONCURRENT_POSITIONS: number = 3;
  public readonly DAILY_LOSS_THRESHOLD: number = -10000; // -₹10,000 daily circuit breaker
  public readonly DEFAULT_COOLDOWN_SECONDS: number = 60; // 60s trigger debounce
  public readonly MAX_POSITION_SIZE_CAP: number = 10; // max lot count cap per strategy

  constructor() {
    // Start autonomous runner background loop (runs every 5 seconds)
    this.runnerInterval = setInterval(() => this.runEvaluationCycle(), 5000);
    console.log('[AUTONOMOUS RUNNER] Engine initialized — loop active (5s cadence). Default disarmed.');
  }

  /**
   * Triggers Per-User Kill Switch: Disarms user's strategies and halts further loop actions for user.
   */
  public triggerKillSwitch(userId: string, reason: string): { disarmedCount: number; message: string } {
    this.killSwitchByUser.set(userId, { reason, triggeredAt: new Date().toISOString() });

    const disarmedCount = dbEngine.disarmAllAutonomousStrategies(reason, userId);
    console.warn(`[AUTONOMOUS RUNNER] KILL SWITCH TRIGGERED FOR USER ${userId}: ${reason}. Disarmed ${disarmedCount} strategies.`);

    return {
      disarmedCount,
      message: `KILL SWITCH ENGAGED FOR USER: ${reason}. Disarmed ${disarmedCount} active strategies.`
    };
  }

  /**
   * Resets Kill Switch state for a user
   */
  public resetKillSwitch(userId: string): void {
    this.killSwitchByUser.delete(userId);
    dbEngine.addAutonomousLog({
      id: `log-${Date.now()}`,
      strategyId: 'GLOBAL',
      strategyName: 'KILL SWITCH',
      timestamp: new Date().toISOString(),
      eventType: 'DISARMED',
      details: { reason: 'Kill Switch manually reset by user. System ready for individual arming.' }
    }, userId);
    console.log(`[AUTONOMOUS RUNNER] Kill switch reset for user ${userId}.`);
  }

  /**
   * Main Evaluation Cycle Loop (Runs every 5 seconds)
   */
  private async runEvaluationCycle(): Promise<void> {
    if (this.isProcessingLoop) return;
    this.isProcessingLoop = true;

    try {
      // Load all strategies from SQLite DB
      const allStrategies: AutonomousStrategy[] = dbEngine.getAllAutonomousStrategies();
      if (allStrategies.length === 0) return;

      // Group strategies by user_id
      const userStrategyMap = new Map<string, AutonomousStrategy[]>();
      for (const strat of allStrategies) {
        const uId = (strat as any).userId || 'ANONYMOUS';
        if (!userStrategyMap.has(uId)) {
          userStrategyMap.set(uId, []);
        }
        userStrategyMap.get(uId)!.push(strat);
      }

      // Process per user
      for (const [userId, userStrats] of userStrategyMap.entries()) {
        // 1. Check user kill switch
        if (this.killSwitchByUser.has(userId)) {
          continue;
        }

        // Compute Realized + Unrealized P&L for User's Circuit Breaker
        const realizedPnl = dbEngine.getDailyAutonomousPnl(userId);
        let unrealizedPnl = 0;
        const inPositionStrats = userStrats.filter(s => s.status === 'IN_POSITION');

        for (const strat of inPositionStrats) {
          const snapshot = globalMarketFeed.getSnapshot(strat.symbol);
          for (const leg of strat.legs) {
            const strikeRow = snapshot.strikes?.find(s => s.strikePrice === leg.strikePrice);
            const contract = leg.type === 'CE' ? strikeRow?.ce : strikeRow?.pe;
            const currentLtp = (contract && contract.ltp > 0) ? contract.ltp : (leg.currentLtp || leg.entryPrice || 0);
            const entryPrice = leg.entryPrice || leg.currentLtp || currentLtp;

            const legPnl = leg.action === 'BUY'
              ? (currentLtp - entryPrice) * leg.lotSize * leg.quantity
              : (entryPrice - currentLtp) * leg.lotSize * leg.quantity;

            unrealizedPnl += legPnl;
          }
        }

        const totalDailyAutonomousPnl = realizedPnl + unrealizedPnl;

        // Check User Daily Loss Circuit Breaker across realized + unrealized P&L
        if (totalDailyAutonomousPnl <= this.DAILY_LOSS_THRESHOLD) {
          this.triggerKillSwitch(
            userId,
            `Daily Loss Circuit Breaker breached: Today Total P&L ₹${Math.round(totalDailyAutonomousPnl).toLocaleString()} (Realized: ₹${Math.round(realizedPnl).toLocaleString()}, Unrealized: ₹${Math.round(unrealizedPnl).toLocaleString()}) <= threshold ₹${this.DAILY_LOSS_THRESHOLD.toLocaleString()}`
          );
          continue;
        }

        const armedStrategies = userStrats.filter(s => s.armed && s.status !== 'ERROR');
        if (armedStrategies.length === 0) {
          continue;
        }

        const inPositionCount = inPositionStrats.length;
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();

        const marginInfo = await activeProvider.getAvailableMargin();
        const availableMargin = marginInfo.available;

        for (const strat of armedStrategies) {
          try {
            if (strat.lastActionAt) {
              const timeSinceLastActionSec = (nowMs - new Date(strat.lastActionAt).getTime()) / 1000;
              if (timeSinceLastActionSec < this.DEFAULT_COOLDOWN_SECONDS) {
                continue;
              }
            }

            const snapshot = globalMarketFeed.getSnapshot(strat.symbol);

            const context: EvaluationContext = {
              symbol: strat.symbol,
              pcr: snapshot.pcrOI,
              maxPain: snapshot.maxPainStrike,
              spotPrice: snapshot.spotPrice,
              spotDistanceAtm: Math.abs(snapshot.spotPrice - (snapshot.maxPainStrike || snapshot.spotPrice)),
              ivRank: snapshot.ivRank,
              indiaVix: snapshot.indiaVix,
              oiBuildup: (snapshot as any).oiBuildup || 'LONG_BUILDUP',
              underlyingPChange: snapshot.underlyingPChange,
              isSpotLive: snapshot.isSpotLive,
              isPartialData: snapshot.isPartialData
            };

            if (strat.status === 'WATCHING') {
              const evalResult = evaluateRuleGroup(strat.entryRules, context);

              if (evalResult.triggered) {
                if (inPositionCount >= this.MAX_CONCURRENT_POSITIONS) {
                  dbEngine.addAutonomousLog({
                    id: `log-${Date.now()}`,
                    strategyId: strat.id,
                    strategyName: strat.name,
                    timestamp: nowIso,
                    eventType: 'BLOCKED_BY_LIMIT',
                    details: {
                      limitType: 'MAX_CONCURRENT_POSITIONS',
                      currentInPosition: inPositionCount,
                      maxLimit: this.MAX_CONCURRENT_POSITIONS,
                      reasons: evalResult.reasons
                    }
                  }, userId);
                  strat.lastEvaluatedAt = nowIso;
                  dbEngine.saveAutonomousStrategy(strat, userId);
                  continue;
                }

                const totalLots = strat.legs.reduce((sum, l) => sum + l.quantity, 0);
                if (totalLots > strat.maxPositionSize || totalLots > this.MAX_POSITION_SIZE_CAP) {
                  dbEngine.addAutonomousLog({
                    id: `log-${Date.now()}`,
                    strategyId: strat.id,
                    strategyName: strat.name,
                    timestamp: nowIso,
                    eventType: 'BLOCKED_BY_LIMIT',
                    details: {
                      limitType: 'MAX_POSITION_SIZE_CAP',
                      requestedLots: totalLots,
                      maxAllowedLots: Math.min(strat.maxPositionSize, this.MAX_POSITION_SIZE_CAP),
                      reasons: evalResult.reasons
                    }
                  }, userId);
                  strat.lastEvaluatedAt = nowIso;
                  dbEngine.saveAutonomousStrategy(strat, userId);
                  continue;
                }

                const basketResult = await globalBasketEngine.executeBasketOrder(
                  strat.id,
                  strat.name,
                  strat.symbol,
                  strat.legs,
                  availableMargin,
                  userId
                );

                if (basketResult.status === 'COMPLETED') {
                  strat.status = 'IN_POSITION';
                  strat.activeBasketId = basketResult.id;
                  strat.lastActionAt = nowIso;
                  strat.lastEvaluatedAt = nowIso;

                  strat.legs = strat.legs.map(leg => {
                    const matchExec = basketResult.legs.find(
                      exec => exec.strikePrice === leg.strikePrice && exec.type === leg.type
                    );
                    return {
                      ...leg,
                      entryPrice: matchExec && matchExec.status === 'FILLED' ? matchExec.avgFillPrice : (leg.currentLtp || 0)
                    };
                  });

                  dbEngine.saveAutonomousStrategy(strat, userId);

                  dbEngine.addAutonomousLog({
                    id: `log-${Date.now()}`,
                    strategyId: strat.id,
                    strategyName: strat.name,
                    timestamp: nowIso,
                    eventType: 'ENTRY_TRIGGERED',
                    details: {
                      basketId: basketResult.id,
                      symbol: strat.symbol,
                      legsCount: strat.legs.length,
                      reasons: evalResult.reasons,
                      marginRequired: basketResult.marginRequired,
                      entryLegs: strat.legs.map(l => ({
                        strikePrice: l.strikePrice,
                        type: l.type,
                        action: l.action,
                        entryPrice: l.entryPrice,
                        quantity: l.quantity,
                        lotSize: l.lotSize
                      }))
                    }
                  }, userId);
                } else {
                  dbEngine.addAutonomousLog({
                    id: `log-${Date.now()}`,
                    strategyId: strat.id,
                    strategyName: strat.name,
                    timestamp: nowIso,
                    eventType: 'BLOCKED_BY_MARGIN',
                    details: {
                      basketId: basketResult.id,
                      fallbackAction: basketResult.fallbackActionTriggered,
                      reasons: evalResult.reasons
                    }
                  }, userId);
                  strat.lastEvaluatedAt = nowIso;
                  dbEngine.saveAutonomousStrategy(strat, userId);
                }
              } else {
                strat.lastEvaluatedAt = nowIso;
                dbEngine.saveAutonomousStrategy(strat, userId);
              }
            } else if (strat.status === 'IN_POSITION') {
              let actionTaken = false;

              if (strat.exitRules && (strat.exitRules.all || strat.exitRules.any)) {
                const exitEval = evaluateRuleGroup(strat.exitRules, context);
                if (exitEval.triggered) {
                  const reverseLegs: StrategyLeg[] = strat.legs.map(leg => ({
                    ...leg,
                    action: leg.action === 'BUY' ? 'SELL' : 'BUY'
                  }));

                  const basketResult = await globalBasketEngine.executeBasketOrder(
                    strat.id,
                    `EXIT: ${strat.name}`,
                    strat.symbol,
                    reverseLegs,
                    availableMargin,
                    userId
                  );

                  let realizedPositionPnl = 0;
                  const exitLegsDetail: any[] = [];

                  for (const leg of strat.legs) {
                    const entryP = leg.entryPrice || leg.currentLtp || 0;
                    const matchExitExec = basketResult.legs.find(
                      exec => exec.strikePrice === leg.strikePrice && exec.type === leg.type
                    );
                    const exitP = matchExitExec && matchExitExec.status === 'FILLED' ? matchExitExec.avgFillPrice : (leg.currentLtp || entryP);
                    const legPnl = leg.action === 'BUY'
                      ? (exitP - entryP) * leg.lotSize * leg.quantity
                      : (entryP - exitP) * leg.lotSize * leg.quantity;

                    realizedPositionPnl += legPnl;
                    exitLegsDetail.push({
                      strikePrice: leg.strikePrice,
                      type: leg.type,
                      action: leg.action,
                      entryPrice: entryP,
                      exitPrice: exitP,
                      quantity: leg.quantity,
                      lotSize: leg.lotSize,
                      legPnl: Number(legPnl.toFixed(2))
                    });
                  }

                  strat.status = 'WATCHING';
                  strat.activeBasketId = undefined;
                  strat.lastActionAt = nowIso;
                  strat.lastEvaluatedAt = nowIso;
                  dbEngine.saveAutonomousStrategy(strat, userId);

                  dbEngine.addAutonomousLog({
                    id: `log-${Date.now()}`,
                    strategyId: strat.id,
                    strategyName: strat.name,
                    timestamp: nowIso,
                    eventType: 'EXIT_TRIGGERED',
                    details: {
                      basketId: basketResult.id,
                      reasons: exitEval.reasons,
                      pnl: Number(realizedPositionPnl.toFixed(2)),
                      legs: exitLegsDetail
                    }
                  }, userId);
                  actionTaken = true;
                }
              }

              if (!actionTaken && strat.adjustmentRules && (strat.adjustmentRules.all || strat.adjustmentRules.any)) {
                const adjEval = evaluateRuleGroup(strat.adjustmentRules, context);
                if (adjEval.triggered) {
                  const basketResult = await globalBasketEngine.executeBasketOrder(
                    strat.id,
                    `ADJUSTMENT: ${strat.name}`,
                    strat.symbol,
                    strat.legs,
                    availableMargin,
                    userId
                  );

                  strat.lastActionAt = nowIso;
                  strat.lastEvaluatedAt = nowIso;
                  dbEngine.saveAutonomousStrategy(strat, userId);

                  dbEngine.addAutonomousLog({
                    id: `log-${Date.now()}`,
                    strategyId: strat.id,
                    strategyName: strat.name,
                    timestamp: nowIso,
                    eventType: 'ADJUSTMENT_TRIGGERED',
                    details: {
                      basketId: basketResult.id,
                      reasons: adjEval.reasons
                    }
                  }, userId);
                }
              }

              strat.lastEvaluatedAt = nowIso;
              dbEngine.saveAutonomousStrategy(strat, userId);
            }
          } catch (stratErr: any) {
            console.error(`[AUTONOMOUS RUNNER] Error evaluating strategy ${strat.name} (${strat.id}):`, stratErr.message);
            strat.status = 'ERROR';
            strat.errorMessage = stratErr.message;
            strat.armed = false;
            strat.lastEvaluatedAt = nowIso;
            dbEngine.saveAutonomousStrategy(strat, userId);

            dbEngine.addAutonomousLog({
              id: `log-${Date.now()}`,
              strategyId: strat.id,
              strategyName: strat.name,
              timestamp: nowIso,
              eventType: 'ERROR',
              details: { errorMessage: stratErr.message }
            }, userId);
          }
        }
      }
    } catch (cycleErr: any) {
      console.error('[AUTONOMOUS RUNNER] Evaluation cycle fatal error:', cycleErr.message);
    } finally {
      this.isProcessingLoop = false;
    }
  }

  /**
   * Get autonomous runner health, limits, & state per user
   */
  public getStatus(userId?: string | null): AutonomousRunnerStatus {
    const providerMode = activeProvider.getProviderMode();
    const isDryRun = providerMode === 'PRACTICE' ? true : (process.env.DRY_RUN !== 'false');

    const uId = userId || 'ANONYMOUS';
    const userKs = this.killSwitchByUser.get(uId);
    const isKillSwitchEngaged = !!userKs;

    const all = dbEngine.getAllAutonomousStrategies(userId);
    const armedCount = all.filter(s => s.armed).length;
    const inPositionCount = all.filter(s => s.status === 'IN_POSITION').length;

    const realizedPnl = dbEngine.getDailyAutonomousPnl(userId);
    let unrealizedPnl = 0;
    const inPositionStrats = all.filter(s => s.status === 'IN_POSITION');

    for (const strat of inPositionStrats) {
      const snapshot = globalMarketFeed.getSnapshot(strat.symbol);
      for (const leg of strat.legs) {
        const strikeRow = snapshot.strikes?.find(s => s.strikePrice === leg.strikePrice);
        const contract = leg.type === 'CE' ? strikeRow?.ce : strikeRow?.pe;
        const currentLtp = (contract && contract.ltp > 0) ? contract.ltp : (leg.currentLtp || leg.entryPrice || 0);
        const entryPrice = leg.entryPrice || leg.currentLtp || currentLtp;

        const legPnl = leg.action === 'BUY'
          ? (currentLtp - entryPrice) * leg.lotSize * leg.quantity
          : (entryPrice - currentLtp) * leg.lotSize * leg.quantity;

        unrealizedPnl += legPnl;
      }
    }

    const totalDailyPnl = Number((realizedPnl + unrealizedPnl).toFixed(2));

    return {
      isRunnerActive: !isKillSwitchEngaged,
      isKillSwitchEngaged,
      killSwitchReason: userKs?.reason,
      armedCount,
      inPositionCount,
      totalStrategies: all.length,
      dailyAutonomousPnl: totalDailyPnl,
      safetyLimits: {
        maxConcurrentPositions: this.MAX_CONCURRENT_POSITIONS,
        dailyLossThreshold: this.DAILY_LOSS_THRESHOLD,
        defaultCooldownSeconds: this.DEFAULT_COOLDOWN_SECONDS,
        maxPositionSizeCap: this.MAX_POSITION_SIZE_CAP
      },
      providerMode,
      dryRunMode: isDryRun
    };
  }
}

export const globalAutonomousEngine = new AutonomousRunnerEngine();
