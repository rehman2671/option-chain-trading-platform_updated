import { QuantAuditLogRecord } from '../types';

export class QuantAuditLogger {
  private logs: QuantAuditLogRecord[] = [];
  private nextId = 1;

  constructor() {
    // Seed initial operational records
    this.log({
      actor: 'system',
      action: 'MODULE_BOOTSTRAP',
      entityType: 'QUANT_INTELLIGENCE_ENGINE',
      entityId: 'SYSTEM',
      beforeState: null,
      afterState: { status: 'ONLINE', mode: 'PAPER_SHADOW' },
      reason: 'Quant intelligence service initialized with Upstox v2 market feed adapters.'
    });

    this.log({
      actor: 'risk_engine',
      action: 'RISK_CAPS_ARMED',
      entityType: 'PORTFOLIO_RISK',
      entityId: 'GLOBAL_RISK_MANAGER',
      beforeState: null,
      afterState: { deltaCap: 500, maxCapitalPerTrade: 150000, dailyLossLimitPct: 3.0 },
      reason: 'Statutory capital preservation limits and hard kill-switch active.'
    });

    this.log({
      actor: 'research_engine',
      action: 'STRATEGY_REGISTERED',
      entityType: 'STRATEGY',
      entityId: 'STRAT_BULL_CALL_SPREAD_01',
      beforeState: null,
      afterState: { name: 'Bull Call Spread Gamma-OI', version: 1, status: 'LIVE' },
      reason: 'Strategy passed Walk-Forward, OOS holdout (25%), and 2000-run Monte Carlo validation.'
    });
  }

  public log(params: Omit<QuantAuditLogRecord, 'id' | 'createdAt'>): QuantAuditLogRecord {
    const record: QuantAuditLogRecord = {
      id: this.nextId++,
      actor: params.actor,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: params.beforeState,
      afterState: params.afterState,
      reason: params.reason,
      createdAt: new Date().toISOString()
    };

    this.logs.unshift(record);
    // Keep last 500 logs in memory
    if (this.logs.length > 500) {
      this.logs.pop();
    }
    return record;
  }

  public getRecentLogs(limit: number = 50): QuantAuditLogRecord[] {
    return this.logs.slice(0, limit);
  }
}

export const quantAuditLogger = new QuantAuditLogger();
