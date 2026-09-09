/**
 * Event Interface & Event Bus (Section 82 & Part B5)
 * Supports real-time quantitative events with structured payloads.
 * Decouples market intelligence, execution alerts, thesis tracking, and risk controls.
 */

import { EventEmitter } from 'events';

export type QuantEventType =
  | 'MARKET_UPDATE'
  | 'OPTION_CHAIN_UPDATE'
  | 'REGIME_CHANGE'
  | 'SIGNAL_CREATED'
  | 'POSITION_CHANGED'
  | 'THESIS_WEAKENED'
  | 'THESIS_INVALIDATED'
  | 'HEDGE_REQUIRED'
  | 'EXIT_REQUIRED'
  | 'STRATEGY_DEGRADED'
  | 'RISK_LIMIT_REACHED'
  | 'DATA_QUALITY_FAILED';

export interface QuantEventPayload<T = any> {
  eventId: string;
  event: QuantEventType;
  occurredAt: string;
  source: string;
  data: T;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface ThesisWeakenedEvidence {
  positionId: string;
  strategyId: string;
  originalThesis: string;
  currentThesis: string;
  thesisHealthScore: number;
  recommendedAction: 'HOLD' | 'REDUCE' | 'HEDGE' | 'EXIT' | 'ROLL';
  reason: string;
}

export class QuantEventBus extends EventEmitter {
  private history: QuantEventPayload[] = [];
  private readonly maxHistorySize = 200;

  /**
   * Publish an event to all subscribers and append to event history
   */
  public publish<T = any>(
    event: QuantEventType,
    source: string,
    data: T,
    severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO'
  ): QuantEventPayload<T> {
    const payload: QuantEventPayload<T> = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      event,
      occurredAt: new Date().toISOString(),
      source,
      data,
      severity
    };

    this.history.unshift(payload);
    if (this.history.length > this.maxHistorySize) {
      this.history.pop();
    }

    this.emit(event, payload);
    this.emit('*', payload);

    return payload;
  }

  /**
   * Get recent events
   */
  public getRecentEvents(limit: number = 50, type?: QuantEventType): QuantEventPayload[] {
    if (type) {
      return this.history.filter(e => e.event === type).slice(0, limit);
    }
    return this.history.slice(0, limit);
  }

  /**
   * Clear event history (for test isolation)
   */
  public clearHistory(): void {
    this.history = [];
  }
}

export const quantEventBus = new QuantEventBus();
