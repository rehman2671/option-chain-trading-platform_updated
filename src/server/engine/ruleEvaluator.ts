/**
 * Pure Deterministic Rule Evaluator Engine
 * Evaluates structured JSON rules against market snapshot & position context.
 * Strictly no LLM calls / side-effects. Safe fail-closed on missing/partial data.
 */

import { SingleRule, RuleGroup, RuleOperator } from '../../types.js';

export interface EvaluationContext {
  symbol: string;
  pcr?: number;
  maxPain?: number;
  spotPrice?: number;
  spotDistanceAtm?: number;
  ivRank?: number;
  indiaVix?: number;
  oiBuildup?: string;
  underlyingPChange?: number;
  isSpotLive?: boolean;
  isPartialData?: boolean;
  // Position-level context (for adjustment & exit rules)
  portfolioDelta?: number;
  portfolioPnl?: number;
  portfolioPnlPercent?: number;
  [key: string]: any;
}

export interface EvaluationResult {
  triggered: boolean;
  reasons: string[];
  evaluatedRulesCount: number;
}

/**
 * Compare two values using standard comparison operator
 */
function compareValues(actual: any, operator: RuleOperator, target: any): boolean {
  if (actual === undefined || actual === null) return false;

  // Convert numbers if numeric comparison
  if (typeof target === 'number' || !isNaN(Number(target))) {
    const actNum = Number(actual);
    const tgtNum = Number(target);
    if (isNaN(actNum) || isNaN(tgtNum)) return false;

    switch (operator) {
      case '>': return actNum > tgtNum;
      case '<': return actNum < tgtNum;
      case '>=': return actNum >= tgtNum;
      case '<=': return actNum <= tgtNum;
      case '==': return actNum === tgtNum;
      case '!=': return actNum !== tgtNum;
      default: return false;
    }
  }

  // String comparison
  const actStr = String(actual).toUpperCase();
  const tgtStr = String(target).toUpperCase();

  switch (operator) {
    case '==': return actStr === tgtStr;
    case '!=': return actStr !== tgtStr;
    case '>': return actStr > tgtStr;
    case '<': return actStr < tgtStr;
    case '>=': return actStr >= tgtStr;
    case '<=': return actStr <= tgtStr;
    default: return false;
  }
}

/**
 * Spot-derived fields whose values strictly depend on live underlying spot price.
 * Rule evaluation on these fields must fail closed when isSpotLive === false.
 */
const SPOT_DERIVED_FIELDS = new Set([
  'spotPrice',
  'spotDistanceAtm',
  'underlyingPChange',
  'maxPain'
]);

/**
 * Evaluates a single rule condition against current evaluation context
 */
export function evaluateSingleRule(rule: SingleRule, context: EvaluationContext): { passed: boolean; reason: string } {
  const { field, operator, value } = rule;

  // Task 3 Fix: Block rule evaluation on spot-derived fields if spot price is stale / unavailable
  if (SPOT_DERIVED_FIELDS.has(field) && context.isSpotLive === false) {
    return {
      passed: false,
      reason: `Spot price is stale/unavailable — rule involving spot-derived field '${field}' evaluation blocked`
    };
  }

  // Safe Fail-Closed Check: If context has partial data or missing field, fail closed
  if (!(field in context) || context[field] === undefined || context[field] === null) {
    return {
      passed: false,
      reason: `Field '${field}' is UNAVAILABLE/N/A in current context — rule evaluation aborted safely`
    };
  }

  const actualValue = context[field];
  const passed = compareValues(actualValue, operator, value);

  return {
    passed,
    reason: `Field '${field}' (${actualValue}) ${operator} ${value} => ${passed ? 'MATCHED' : 'NOT MATCHED'}`
  };
}

/**
 * Recursively evaluates a RuleGroup (supporting 'all' AND and 'any' OR logical structures)
 */
export function evaluateRuleGroup(group: RuleGroup, context: EvaluationContext): EvaluationResult {
  const reasons: string[] = [];
  let evaluatedCount = 0;

  if (context.isPartialData) {
    reasons.push('NOTE: Partial market data was present during rule evaluation cycle');
  }

  if (!group || (!group.all && !group.any)) {
    return { triggered: false, reasons: ['Empty rule group — no conditions defined'], evaluatedRulesCount: 0 };
  }

  // Handle AND group ('all')
  if (group.all && Array.isArray(group.all) && group.all.length > 0) {
    let allPassed = true;
    for (const item of group.all) {
      evaluatedCount++;
      if ('field' in item) {
        const res = evaluateSingleRule(item as SingleRule, context);
        reasons.push(res.reason);
        if (!res.passed) {
          allPassed = false;
        }
      } else {
        const subRes = evaluateRuleGroup(item as RuleGroup, context);
        evaluatedCount += subRes.evaluatedRulesCount;
        reasons.push(...subRes.reasons);
        if (!subRes.triggered) {
          allPassed = false;
        }
      }
    }
    return { triggered: allPassed, reasons, evaluatedRulesCount: evaluatedCount };
  }

  // Handle OR group ('any')
  if (group.any && Array.isArray(group.any) && group.any.length > 0) {
    let anyPassed = false;
    for (const item of group.any) {
      evaluatedCount++;
      if ('field' in item) {
        const res = evaluateSingleRule(item as SingleRule, context);
        reasons.push(res.reason);
        if (res.passed) {
          anyPassed = true;
        }
      } else {
        const subRes = evaluateRuleGroup(item as RuleGroup, context);
        evaluatedCount += subRes.evaluatedRulesCount;
        reasons.push(...subRes.reasons);
        if (subRes.triggered) {
          anyPassed = true;
        }
      }
    }
    return { triggered: anyPassed, reasons, evaluatedRulesCount: evaluatedCount };
  }

  return { triggered: false, reasons: ['Invalid rule structure'], evaluatedRulesCount: 0 };
}
