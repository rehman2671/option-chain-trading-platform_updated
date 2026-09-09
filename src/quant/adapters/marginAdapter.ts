/**
 * Margin Adapter (Section 6 & PART B2.1)
 * Estimates NSE/BSE SPAN and Exposure margins for single-leg and multi-leg
 * derivative strategies, providing margin availability gating before order routing.
 */

import { QuantUnderlying } from '../types.js';

export interface MarginRequirement {
  underlying: QuantUnderlying;
  strategyStructure: string;
  initialMargin: number;
  exposureMargin: number;
  totalMarginRequired: number;
  benefitFromHedge: number;
  availableCapital: number;
  marginUtilizationPct: number;
  isMarginSufficient: boolean;
}

export class MarginAdapter {
  private static instance: MarginAdapter;

  private constructor() {}

  public static getInstance(): MarginAdapter {
    if (!MarginAdapter.instance) {
      MarginAdapter.instance = new MarginAdapter();
    }
    return MarginAdapter.instance;
  }

  /**
   * Calculates realistic NSE margin for option structures
   */
  public calculateMargin(
    underlying: QuantUnderlying,
    strategyStructure: string,
    lots: number = 1,
    availableCapital: number = 500000
  ): MarginRequirement {
    const lotSize = underlying === 'NIFTY' ? 25 : underlying === 'BANKNIFTY' ? 15 : 10;
    const structureUpper = strategyStructure.toUpperCase();

    let baseSpanPerLot = 95000;
    let exposurePerLot = 25000;
    let hedgeBenefit = 0;

    if (structureUpper.includes('SPREAD') || structureUpper.includes('CONDOR') || structureUpper.includes('FLY')) {
      // Defined risk multi-leg hedge benefit (NSE SPAN margin offset)
      baseSpanPerLot = 32000;
      exposurePerLot = 10000;
      hedgeBenefit = 78000;
    } else if (structureUpper.includes('LONG') || structureUpper.includes('BUY')) {
      // Pure option buyers only pay premium, initial SPAN is 0
      baseSpanPerLot = 0;
      exposurePerLot = 0;
      hedgeBenefit = 0;
    } else if (structureUpper.includes('STRADDLE') || structureUpper.includes('STRANGLE')) {
      // Undefined naked short volatility
      baseSpanPerLot = 125000;
      exposurePerLot = 35000;
      hedgeBenefit = 0;
    }

    const initialMargin = baseSpanPerLot * lots;
    const exposureMargin = exposurePerLot * lots;
    const totalMarginRequired = initialMargin + exposureMargin;
    const marginUtilizationPct = Number(((totalMarginRequired / availableCapital) * 100).toFixed(1));
    const isMarginSufficient = totalMarginRequired <= availableCapital * 0.85; // 15% safety buffer

    return {
      underlying,
      strategyStructure,
      initialMargin,
      exposureMargin,
      totalMarginRequired,
      benefitFromHedge: hedgeBenefit * lots,
      availableCapital,
      marginUtilizationPct,
      isMarginSufficient
    };
  }
}

export const marginAdapter = MarginAdapter.getInstance();
