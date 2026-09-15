/**
 * Pure Strategy Decision Engine
 * Centralized, deterministic entry and exit rule evaluation.
 * Shared directly between Live Autonomous Trading and Historical Backtesting.
 * Strictly no side effects (no DB writes, no network calls, no order placement).
 */

import { RuleGroup, SingleRule } from '../../types.js';
import { evaluateRuleGroup, EvaluationContext } from '../../server/engine/ruleEvaluator.js';
import { StrategyDefinition } from '../types.js';

export interface StrategyDecisionContext extends EvaluationContext {
  vwap?: number;
  ema20?: number;
  ema23?: number;
  ema50?: number;
  emaDifference?: number;
  signal?: string;
  dte?: number;
  holdingPeriods?: number;
  consecutiveAdverseCloses?: number;
}

export interface EntryDecision {
  shouldEnter: boolean;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reasons: string[];
}

export interface ExitDecision {
  shouldExit: boolean;
  exitReason: 'TARGET_HIT' | 'STOP_LOSS' | 'TIME_EXIT' | 'RULE_TRIGGERED' | 'EXPIRY_EXIT' | 'SIGNAL_REVERSAL' | 'NONE';
  reasons: string[];
}

export interface StrategyLike {
  id: string;
  name: string;
  version?: number;
  family?: string;
  symbol?: string;
  parameters?: Record<string, any>;
  entryRules?: RuleGroup;
  exitRules?: RuleGroup;
  rules?: {
    entry?: string[];
    exit?: string[];
    stopLossPct?: number;
    targetPct?: number;
    maxDte?: number;
    minDte?: number;
    strikeSelection?: string;
    [key: string]: any;
  };
  stopLossPct?: number;
  targetPct?: number;
  maxDte?: number;
  [key: string]: any;
}

/**
 * Evaluates whether strategy entry conditions are met
 */
export function evaluateStrategyEntry(
  strategy: StrategyLike,
  context: StrategyDecisionContext
): EntryDecision {
  const reasons: string[] = [];

  // 1. Safe Fail-Closed: If spot price is stale or unavailable, block entry
  if (context.isSpotLive === false) {
    return {
      shouldEnter: false,
      direction: 'NEUTRAL',
      reasons: ['Spot price is stale/unavailable — entry blocked']
    };
  }

  // 2. Structured RuleGroup (Autonomous Strategies)
  if (strategy.entryRules && (strategy.entryRules.all || strategy.entryRules.any)) {
    const groupEval = evaluateRuleGroup(strategy.entryRules, context);
    const direction = strategy.id.includes('bear') || strategy.id.includes('put')
      ? 'BEARISH'
      : strategy.id.includes('neutral') || strategy.id.includes('condor')
        ? 'NEUTRAL'
        : 'BULLISH';

    return {
      shouldEnter: groupEval.triggered,
      direction,
      reasons: groupEval.reasons
    };
  }

  // 3. Canonical Strategy Rules (StrategyDefinition from strategyLibrary)
  const family = strategy.family || (strategy.id.includes('spread') ? 'SPREADS' : 'DIRECTIONAL');
  const isBearish = strategy.id.includes('bear') || strategy.id.includes('put');
  const isNeutral = strategy.id.includes('iron') || strategy.id.includes('condor') || family === 'NEUTRAL';
  const isVol = strategy.id.includes('straddle') || family === 'VOLATILITY';
  const isAdaptive = strategy.id.includes('adaptive') || family === 'ADAPTIVE';

  const spot = context.spotPrice ?? 0;
  const vwap = context.vwap ?? spot;
  const emaFast = context.ema20 ?? context.ema23 ?? 0;
  const emaSlow = context.ema50 ?? 0;
  const emaDiff = context.emaDifference ?? (emaFast - emaSlow);
  const signal = context.signal || (emaDiff > 0 ? 'BULLISH' : emaDiff < 0 ? 'BEARISH' : 'NONE');
  const pcr = context.pcr ?? 1.0;
  const ivRank = context.ivRank ?? 40;
  const vix = context.indiaVix ?? 14;

  if (isNeutral) {
    // Range / Low Volatility regime
    const isRange = Math.abs(emaDiff) <= (spot * 0.003) || signal === 'NONE';
    const isModerateIv = ivRank >= 20 && ivRank <= 75;

    if (isRange && isModerateIv) {
      reasons.push('Neutral range consolidation detected with adequate IV rank');
      return { shouldEnter: true, direction: 'NEUTRAL', reasons };
    }
    reasons.push('Neutral condition not met: trending market or extreme IV');
    return { shouldEnter: false, direction: 'NEUTRAL', reasons };
  }

  if (isVol) {
    // Volatility breakout setup (e.g. low IV rank before expansion)
    if (ivRank <= 45) {
      reasons.push(`Low IV rank (${ivRank} <= 45) primed for volatility breakout`);
      return { shouldEnter: true, direction: 'NEUTRAL', reasons };
    }
    reasons.push(`IV rank (${ivRank}) too high for long straddle debit`);
    return { shouldEnter: false, direction: 'NEUTRAL', reasons };
  }

  if (isAdaptive) {
    // Adaptive gamma hedge setup (VIX > 15 or negative gamma)
    if (vix >= 14.5) {
      reasons.push(`Elevated market volatility (India VIX ${vix} >= 14.5) triggers gamma hedge`);
      return { shouldEnter: true, direction: 'NEUTRAL', reasons };
    }
    reasons.push(`VIX (${vix}) below threshold for gamma hedge`);
    return { shouldEnter: false, direction: 'NEUTRAL', reasons };
  }

  if (isBearish) {
    // Bear Put Spread / Downside trend continuation
    const vwapMet = spot <= vwap * 1.002;
    const emaMet = emaDiff < 0 || signal === 'BEARISH' || signal === 'BEARISH_CROSSOVER';
    const oiMet = pcr <= 1.05; // Call OI buildup or low PCR

    if (vwapMet && emaMet && oiMet) {
      reasons.push('Spot <= VWAP', 'EMA fast < EMA slow', 'Bearish OI bias confirmed');
      return { shouldEnter: true, direction: 'BEARISH', reasons };
    }
    reasons.push('Bearish criteria not fully met');
    return { shouldEnter: false, direction: 'BEARISH', reasons };
  }

  // Default: Bullish Strategy (Bull Call Spread / Trend Up)
  const vwapMet = spot >= vwap * 0.998;
  const emaMet = emaDiff > 0 || signal === 'BULLISH' || signal === 'BULLISH_CROSSOVER';
  const oiMet = pcr >= 0.95; // Put OI buildup or high PCR
  const ivMet = ivRank < 70;

  if (vwapMet && emaMet && oiMet && ivMet) {
    reasons.push('Spot >= VWAP', 'EMA fast > EMA slow', 'Put OI buildup >= Call OI', 'IV Rank within range');
    return { shouldEnter: true, direction: 'BULLISH', reasons };
  }

  reasons.push('Bullish criteria not fully met');
  return { shouldEnter: false, direction: 'BULLISH', reasons };
}

/**
 * Evaluates whether open strategy position should be exited
 */
export function evaluateStrategyExit(
  strategy: StrategyLike,
  context: StrategyDecisionContext
): ExitDecision {
  const reasons: string[] = [];

  const stopLossPct = strategy.rules?.stopLossPct ?? strategy.stopLossPct ?? 40;
  const targetPct = strategy.rules?.targetPct ?? strategy.targetPct ?? 50;

  // 1. Profit Target Check
  if (context.portfolioPnlPercent !== undefined && context.portfolioPnlPercent >= targetPct) {
    reasons.push(`Profit target hit: ${context.portfolioPnlPercent.toFixed(1)}% >= +${targetPct}%`);
    return {
      shouldExit: true,
      exitReason: 'TARGET_HIT',
      reasons
    };
  }

  // 2. Stop Loss Check
  if (context.portfolioPnlPercent !== undefined && context.portfolioPnlPercent <= -stopLossPct) {
    reasons.push(`Stop loss hit: ${context.portfolioPnlPercent.toFixed(1)}% <= -${stopLossPct}%`);
    return {
      shouldExit: true,
      exitReason: 'STOP_LOSS',
      reasons
    };
  }

  // 3. Expiry / DTE Check
  if (context.dte !== undefined && context.dte <= 0) {
    reasons.push('Option contract reached expiry (DTE <= 0)');
    return {
      shouldExit: true,
      exitReason: 'EXPIRY_EXIT',
      reasons
    };
  }

  // 4. Max Holding Periods / Time Exit
  const maxDte = strategy.rules?.maxDte ?? strategy.maxDte ?? 7;
  const maxBars = maxDte * 25; // 25 15m bars per trading day (6.25 hrs / 15m)
  if (context.holdingPeriods !== undefined && context.holdingPeriods >= maxBars) {
    reasons.push(`Maximum holding period of ${maxDte} days reached (${context.holdingPeriods} bars)`);
    return {
      shouldExit: true,
      exitReason: 'TIME_EXIT',
      reasons
    };
  }

  // 5. Structured RuleGroup Exits (Autonomous Strategies)
  if (strategy.exitRules && (strategy.exitRules.all || strategy.exitRules.any)) {
    const groupEval = evaluateRuleGroup(strategy.exitRules, context);
    if (groupEval.triggered) {
      return {
        shouldExit: true,
        exitReason: 'RULE_TRIGGERED',
        reasons: groupEval.reasons
      };
    }
  }

  // 6. Signal Reversal Exit (e.g. Bull strategy encountering 2 consecutive closes below VWAP or Bearish crossover)
  const isBearish = strategy.id.includes('bear') || strategy.id.includes('put');
  const signal = context.signal;

  if (!isBearish && (signal === 'BEARISH' || signal === 'BEARISH_CROSSOVER')) {
    if ((context.consecutiveAdverseCloses ?? 1) >= 2) {
      reasons.push('Bull strategy exited due to 2 consecutive bearish closes');
      return {
        shouldExit: true,
        exitReason: 'SIGNAL_REVERSAL',
        reasons
      };
    }
  }

  if (isBearish && (signal === 'BULLISH' || signal === 'BULLISH_CROSSOVER')) {
    if ((context.consecutiveAdverseCloses ?? 1) >= 2) {
      reasons.push('Bear strategy exited due to 2 consecutive bullish closes');
      return {
        shouldExit: true,
        exitReason: 'SIGNAL_REVERSAL',
        reasons
      };
    }
  }

  return {
    shouldExit: false,
    exitReason: 'NONE',
    reasons: ['No exit trigger active']
  };
}
