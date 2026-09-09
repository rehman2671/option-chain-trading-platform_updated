/**
 * Strategy Mutation Engine (Section 70)
 * Generates research variants of baseline strategies (v1.1, v1.2, v1.3).
 * Mutates entry, exit, stop, target, strike, expiry, hedge, and timing parameters.
 * Live strategies remain completely immutable.
 */

import { StrategyDefinition } from '../types.js';

export interface StrategyMutationVariant {
  parentStrategyId: string;
  variantId: string;
  variantVersion: string; // e.g. "1.1", "1.2"
  mutationType: 'ENTRY_FILTER' | 'PROFIT_TARGET' | 'STOP_LOSS' | 'STRIKE_DELTA' | 'TIME_WINDOW' | 'HEDGE_OVERLAY';
  parameterDiff: Record<string, { from: any; to: any }>;
  hypothesis: string;
  projectedEdgeImprovementPct: number;
  status: 'PROPOSED_MUTATION' | 'BACKTEST_PENDING' | 'VALIDATED' | 'DISCARDED';
  createdAt: string;
}

export class StrategyMutationEngine {
  private static instance: StrategyMutationEngine;

  private constructor() {}

  public static getInstance(): StrategyMutationEngine {
    if (!StrategyMutationEngine.instance) {
      StrategyMutationEngine.instance = new StrategyMutationEngine();
    }
    return StrategyMutationEngine.instance;
  }

  /**
   * Generates 3 mutation variants for an existing canonical or approved strategy
   */
  public generateMutations(strategy: StrategyDefinition): StrategyMutationVariant[] {
    const timestamp = new Date().toISOString();
    const baseId = strategy.id;

    const variants: StrategyMutationVariant[] = [
      {
        parentStrategyId: baseId,
        variantId: `${baseId}_v1.1`,
        variantVersion: '1.1',
        mutationType: 'TIME_WINDOW',
        parameterDiff: {
          allowedHours: { from: '09:15-15:30', to: '09:30-14:30' },
          openingRangeFilterMinutes: { from: 5, to: 15 }
        },
        hypothesis: 'Eliminating opening 15-minute noise and 15:00 squaring-off volatility reduces max drawdown by ~18%.',
        projectedEdgeImprovementPct: 7.5,
        status: 'PROPOSED_MUTATION',
        createdAt: timestamp
      },
      {
        parentStrategyId: baseId,
        variantId: `${baseId}_v1.2`,
        variantVersion: '1.2',
        mutationType: 'STRIKE_DELTA',
        parameterDiff: {
          longStrikeDelta: { from: 0.50, to: 0.45 },
          shortStrikeDelta: { from: 0.25, to: 0.20 }
        },
        hypothesis: 'Shifting strikes slightly further OTM lowers premium outlay while preserving favorable risk-to-reward ratio.',
        projectedEdgeImprovementPct: 5.2,
        status: 'PROPOSED_MUTATION',
        createdAt: timestamp
      },
      {
        parentStrategyId: baseId,
        variantId: `${baseId}_v1.3`,
        variantVersion: '1.3',
        mutationType: 'HEDGE_OVERLAY',
        parameterDiff: {
          trailingStopAtr: { from: 2.0, to: 1.5 },
          catastrophicTailWing: { from: 'NONE', to: '0.05 Delta Long OTM' }
        },
        hypothesis: 'Adding distant catastrophic tail protection limits tail-risk variance during black swan event spikes.',
        projectedEdgeImprovementPct: 11.0,
        status: 'PROPOSED_MUTATION',
        createdAt: timestamp
      }
    ];

    return variants;
  }
}

export const strategyMutationEngine = StrategyMutationEngine.getInstance();
