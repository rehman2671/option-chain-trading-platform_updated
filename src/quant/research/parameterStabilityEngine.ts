/**
 * Parameter Stability & Sensitivity Engine (Section 46)
 * Detects whether a strategy's edge lies on a robust plateau or a fragile cliff-edge.
 * Tests parameter neighborhood perturbations (e.g. RSI 57..61, ATR multipliers, threshold shifts).
 * Flags unstable strategies.
 */

export interface PerturbationPoint {
  parameterName: string;
  parameterValue: number | string;
  profitFactor: number;
  sharpeRatio: number;
  winRatePct: number;
  expectancyR: number;
  status: 'STABLE_PLATEAU' | 'DEGRADED' | 'CLIFF_EDGE_COLLAPSE';
}

export interface ParameterSensitivityReport {
  evidenceStatus?: 'NO_PERTURBATION_EVIDENCE';
  strategyId: string;
  parameterName: string;
  baselineValue: number;
  testedRange: [number, number];
  plateauWidthPct: number; // percentage of tested neighborhood that retains positive edge
  varianceSharpe: number;
  isStable: boolean;
  stabilityVerdict: 'ROBUST_PLATEAU' | 'MODERATE_SENSITIVITY' | 'FRAGILE_CLIFF_EDGE';
  perturbations: PerturbationPoint[];
  rationale: string;
}

export class ParameterStabilityEngine {
  /**
   * Tests sensitivity of a key parameter (e.g. RSI threshold, Stop Loss ATR, IV Skew threshold)
   */
  public testParameterNeighborhood(
    strategyId: string,
    parameterName: string,
    baselineValue: number,
    stepSize: number = 1,
    steps: number = 2
  ): ParameterSensitivityReport {
    return {strategyId,parameterName,baselineValue:Number.isFinite(baselineValue)?baselineValue:0,
      testedRange:[0,0],plateauWidthPct:0,varianceSharpe:0,isStable:false,
      stabilityVerdict:'FRAGILE_CLIFF_EDGE',perturbations:[],
      rationale:'No independently replayed parameter neighborhood; numeric fields are unavailable sentinels.',
      evidenceStatus:'NO_PERTURBATION_EVIDENCE'};
  }
}
export const parameterStabilityEngine=new ParameterStabilityEngine();
