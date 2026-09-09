/**
 * Quant Decision Engine
 * Synthesizes Tournament evaluation, No-Trade safety gates, Strike selection,
 * and produces full audit-ready Decision outputs with structured theses.
 */

import {
  QuantUnderlying,
  QuantDecisionOutput,
  MarketRegimeState,
  QuantFeatureSnapshot,
  DataQualityReport
} from '../types.js';
import { tournamentEngine } from './tournamentEngine.js';
import { noTradeEngine } from './noTradeEngine.js';
import { ExpiryResolver } from '../data/expiryResolver.js';
import { ContractMaster } from '../data/contractMaster.js';
import { dbEngine } from '../../server/db.js';

export class DecisionEngine {
  private static instance: DecisionEngine;

  private constructor() {}

  public static getInstance(): DecisionEngine {
    if (!DecisionEngine.instance) {
      DecisionEngine.instance = new DecisionEngine();
    }
    return DecisionEngine.instance;
  }

  public decide(
    underlying: QuantUnderlying,
    regime: MarketRegimeState,
    features: QuantFeatureSnapshot,
    quality: DataQualityReport,
    isMarketOpen: boolean = true
  ): QuantDecisionOutput {
    const decisionId = `dec-${underlying.toLowerCase()}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // 1. Evaluate No-Trade constraints
    const noTradeCheck = noTradeEngine.evaluate(regime, features, quality, isMarketOpen);
    if (noTradeCheck.shouldBlock) {
      const output: QuantDecisionOutput = {
        decisionId,
        timestamp,
        underlying,
        marketState: {
          spotPrice: features.spotPrice,
          primaryRegime: regime.primaryRegime,
          volatilityState: regime.volatilityRegime,
          dataQuality: quality.status
        },
        action: 'NO_TRADE',
        metrics: {
          expectedValueR: 0,
          historicalProbPct: 0,
          riskScore: 0,
          confidenceScore: regime.confidence
        },
        thesis: {
          coreArgument: 'Safety gate active. Capital preservation prioritized.',
          invalidationConditions: [],
          recoveryPlanSummary: 'Stand aside until clear statistical regime edge emerges.'
        },
        noTradeReason: noTradeCheck.reason
      };

      // Audit log
      dbEngine.saveQuantAuditLog({
        actor: 'DECISION_ENGINE',
        action: 'NO_TRADE_ISSUED',
        entityType: 'DECISION',
        entityId: decisionId,
        afterState: output,
        reason: noTradeCheck.reason
      });

      return output;
    }

    // 2. Run Tournament
    const tournament = tournamentEngine.runTournament(regime, features);
    const topPick = tournament[0];

    // 3. Resolve Expiries & Strikes
    const expiries = ExpiryResolver.resolve(underlying, []);
    const spec = ContractMaster.getSpec(underlying);
    const atmStrike = ContractMaster.getNearestStrike(features.spotPrice, spec.strikeInterval);

    let strikes = `${atmStrike} CE / ${atmStrike + spec.strikeInterval} CE`;
    if (topPick.name.includes('Bear Put')) {
      strikes = `${atmStrike} PE / ${atmStrike - spec.strikeInterval} PE`;
    } else if (topPick.name.includes('Iron Condor')) {
      strikes = `${atmStrike - spec.strikeInterval * 2} PE / ${atmStrike + spec.strikeInterval * 2} CE`;
    }

    const output: QuantDecisionOutput = {
      decisionId,
      timestamp,
      underlying,
      marketState: {
        spotPrice: features.spotPrice,
        primaryRegime: regime.primaryRegime,
        volatilityState: regime.volatilityRegime,
        dataQuality: quality.status
      },
      action: 'ENTER',
      strategy: {
        id: topPick.strategyId,
        name: topPick.name,
        version: 1,
        structure: topPick.structureDesc,
        strikes,
        expiry: expiries.currentExpiry,
        positionSizeLots: 1
      },
      metrics: {
        expectedValueR: Number(parseFloat(topPick.expectedValue)),
        historicalProbPct: topPick.historicalProbPct,
        riskScore: Math.round(100 - topPick.riskRewardScore),
        confidenceScore: regime.confidence
      },
      thesis: {
        coreArgument: `${regime.primaryRegime} confirmed with ${regime.rationale}. Historical probability of favorable continuation is ${topPick.historicalProbPct}%.`,
        invalidationConditions: [
          `Spot price loses ${features.callWallStrike || 'support'} key level`,
          'PCR reverses below 0.85',
          'Market regime shifts to CHoCH opposite structure'
        ],
        recoveryPlanSummary: 'Monitor thesis health: Hold if noise within ATR, hedge if delta deviates, exit if thesis invalidates.'
      }
    };

    // Audit log
    dbEngine.saveQuantAuditLog({
      actor: 'DECISION_ENGINE',
      action: 'STRATEGY_SELECTED',
      entityType: 'DECISION',
      entityId: decisionId,
      afterState: output,
      reason: `Tournament Winner: ${topPick.name} (Score: ${topPick.score}/100)`
    });

    return output;
  }
}

export const decisionEngine = DecisionEngine.getInstance();
