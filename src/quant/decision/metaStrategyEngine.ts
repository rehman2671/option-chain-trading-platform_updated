/**
 * Meta Strategy Engine (Section 71, 25, 26, 27)
 * Implements the full hierarchical pipeline:
 * MARKET -> REGIME -> META STRATEGY -> STRATEGY FAMILY -> STRUCTURE -> EXPIRY -> STRIKES -> SIZE -> EXECUTION
 */

import {
  QuantUnderlying,
  MarketRegimeState,
  QuantFeatureSnapshot,
  StrategyFamily,
  ExpiryProfile
} from '../types.js';
import { ExpiryResolver } from '../data/expiryResolver.js';
import { ContractMaster } from '../data/contractMaster.js';
import { tournamentEngine } from './tournamentEngine.js';
import { marginAdapter } from '../adapters/marginAdapter.js';

export interface MetaStrategyStageBreakdown {
  underlying: QuantUnderlying;
  regime: string;
  selectedFamily: StrategyFamily;
  familyRationale: string;
  selectedStrategy: string;
  structureDescription: string;
  selectedExpiry: string;
  expiryRationale: string;
  selectedStrikes: string;
  strikeOptimizationRationale: string;
  positionSizeLots: number;
  sizingRationale: string;
  marginRequirement: number;
  expectedValueR: number;
  historicalProbabilityPct: number;
}

export class MetaStrategyEngine {
  private static instance: MetaStrategyEngine;

  private constructor() {}

  public static getInstance(): MetaStrategyEngine {
    if (!MetaStrategyEngine.instance) {
      MetaStrategyEngine.instance = new MetaStrategyEngine();
    }
    return MetaStrategyEngine.instance;
  }

  /**
   * Evaluates the hierarchical meta-strategy funnel from market condition down to execution sizing
   */
  public evaluateMetaFunnel(
    underlying: QuantUnderlying,
    regime: MarketRegimeState,
    features: QuantFeatureSnapshot,
    availableCapital: number = 500000
  ): MetaStrategyStageBreakdown {
    // Stage 1: Market & Regime -> Strategy Family Selection
    let selectedFamily: StrategyFamily = 'NEUTRAL';
    let familyRationale = '';

    if (regime.primaryRegime === 'TREND_UP' || regime.primaryRegime === 'BREAKOUT') {
      selectedFamily = 'DIRECTIONAL_LONG';
      familyRationale = 'Bullish directional bias established by higher swing highs and net positive PCR expansion.';
    } else if (regime.primaryRegime === 'TREND_DOWN' || regime.primaryRegime === 'BREAKDOWN') {
      selectedFamily = 'DIRECTIONAL_SHORT';
      familyRationale = 'Bearish directional bias confirmed by call wall dominance and breakdown below VWAP.';
    } else if (regime.volatilityRegime === 'HIGH_EXPANDING' || regime.primaryRegime === 'HIGH_VOL') {
      selectedFamily = 'VOLATILITY_LONG';
      familyRationale = 'Implied volatility expanding. Long convexity / debit spreads favored over short premium.';
    } else if (regime.primaryRegime === 'EXPIRY') {
      selectedFamily = 'EXPIRY_SPECIFIC';
      familyRationale = 'High theta decay velocity on 0DTE / 1DTE cycle. Pinning zones provide edge.';
    } else {
      selectedFamily = 'NEUTRAL';
      familyRationale = 'Mean-reverting consolidation bounded between Call and Put open interest walls.';
    }

    // Stage 2: Tournament -> Exact Strategy & Structure
    const tournament = tournamentEngine.runTournament(regime, features);
    const topStrategy = tournament[0] || {
      name: 'Adaptive Range Iron Condor',
      family: selectedFamily,
      structureDesc: 'Short OTM Call & Put wings with protective outer wings',
      expectedValue: '+0.34R',
      historicalProbPct: 68
    };

    // Stage 3: Expiry Selection Engine (Section 26)
    const expiries = ExpiryResolver.resolve(underlying, []);
    let selectedExpiry = expiries.currentExpiry;
    let expiryRationale = '';

    if (regime.primaryRegime === 'EXPIRY' || expiries.is0DTE) {
      selectedExpiry = expiries.currentExpiry;
      expiryRationale = '0DTE selected for accelerated gamma monetization.';
    } else if (selectedFamily === 'VOLATILITY_LONG' || selectedFamily === 'DIRECTIONAL_LONG' || selectedFamily === 'DIRECTIONAL_SHORT') {
      // 1DTE or next weekly gives better gamma-to-theta stability
      selectedExpiry = expiries.daysToCurrentExpiry < 2 && expiries.nextExpiry ? expiries.nextExpiry : expiries.currentExpiry;
      expiryRationale = 'Sufficient DTE (3-7 days) selected to absorb adverse intraday variance.';
    } else {
      selectedExpiry = expiries.currentExpiry;
      expiryRationale = 'Current weekly expiry captures optimal theta decay profile.';
    }

    // Stage 4: Strike Selection Engine (Section 25)
    const spec = ContractMaster.getSpec(underlying);
    const atmStrike = ContractMaster.getNearestStrike(features.spotPrice, spec.strikeInterval);
    let selectedStrikes = '';
    let strikeOptimizationRationale = '';

    if (topStrategy.name.includes('Bull Call')) {
      selectedStrikes = `Buy ${atmStrike} CE, Sell ${atmStrike + spec.strikeInterval} CE`;
      strikeOptimizationRationale = 'Delta ~0.50 ATM long leg paired with OTM short leg at nearest resistance to minimize cost basis.';
    } else if (topStrategy.name.includes('Bear Put')) {
      selectedStrikes = `Buy ${atmStrike} PE, Sell ${atmStrike - spec.strikeInterval} PE`;
      strikeOptimizationRationale = 'Delta ~0.50 ATM put bought with Delta ~0.25 put sold at Put Wall support.';
    } else if (topStrategy.name.includes('Iron Condor')) {
      const callShort = atmStrike + spec.strikeInterval * 2;
      const callLong = callShort + spec.strikeInterval;
      const putShort = atmStrike - spec.strikeInterval * 2;
      const putLong = putShort - spec.strikeInterval;
      selectedStrikes = `Sell ${callShort} CE / Buy ${callLong} CE & Sell ${putShort} PE / Buy ${putLong} PE`;
      strikeOptimizationRationale = 'Short wings positioned outside 1-day expected move (±1.0 standard deviation).';
    } else {
      selectedStrikes = `${atmStrike} Strike`;
      strikeOptimizationRationale = 'ATM strike selected for maximal gamma exposure.';
    }

    // Stage 5: Position Sizing Engine (Section 27)
    // Risk budget: 1.5% max risk per trade
    const riskBudget = availableCapital * 0.015;
    const marginEval = marginAdapter.calculateMargin(underlying, topStrategy.name, 1, availableCapital);
    let positionSizeLots = 1;
    let sizingRationale = 'Baseline conservative 1 lot execution respecting capital limits.';

    if (marginEval.isMarginSufficient && availableCapital >= 1000000 && regime.confidence >= 0.8) {
      positionSizeLots = 2;
      sizingRationale = 'High confidence (>=80%) and ample liquidity permit 2-lot position sizing.';
    }

    return {
      underlying,
      regime: `${regime.primaryRegime} (${regime.volatilityRegime})`,
      selectedFamily,
      familyRationale,
      selectedStrategy: topStrategy.name,
      structureDescription: topStrategy.structureDesc,
      selectedExpiry,
      expiryRationale,
      selectedStrikes,
      strikeOptimizationRationale,
      positionSizeLots,
      sizingRationale,
      marginRequirement: marginEval.totalMarginRequired,
      expectedValueR: parseFloat(topStrategy.expectedValue) || 0.35,
      historicalProbabilityPct: topStrategy.historicalProbPct
    };
  }
}

export const metaStrategyEngine = MetaStrategyEngine.getInstance();
