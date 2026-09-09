/**
 * Gamma Exposure (GEX) Engine
 * Models dealer/market-maker gamma positioning from OI and option Greeks.
 * Strictly flagged as ESTIMATED per Quant Rule #26 & #27.
 */

import { QuantUnderlying, QuantOptionSnapshot } from '../types.js';
import { ContractMaster } from '../data/contractMaster.js';

export interface GammaProfile {
  underlying: QuantUnderlying;
  estimatedNetGammaCrores: number;
  gammaRegime: 'POSITIVE_GAMMA' | 'NEGATIVE_GAMMA' | 'NEUTRAL';
  gammaFlipLevel: number;
  marketMakerStance: string;
  confidence: number;
  estimated: true;
  assumptions: string;
  strikeGammas: Array<{
    strike: number;
    callGamma: number;
    putGamma: number;
    netGamma: number;
  }>;
}

export class GammaEngine {
  private static instance: GammaEngine;

  private constructor() {}

  public static getInstance(): GammaEngine {
    if (!GammaEngine.instance) {
      GammaEngine.instance = new GammaEngine();
    }
    return GammaEngine.instance;
  }

  public computeProfile(underlying: QuantUnderlying, options: QuantOptionSnapshot[], spotPrice: number): GammaProfile {
    const spec = ContractMaster.getSpec(underlying);
    const strikeMap = new Map<number, { callGamma: number; putGamma: number }>();

    let totalNetGamma = 0;

    for (const opt of options) {
      const strike = opt.strike;
      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, { callGamma: 0, putGamma: 0 });
      }
      const entry = strikeMap.get(strike)!;

      // Dealer Gamma Assumption: Retail is long options (buying insurance/calls),
      // Market Makers are short options.
      // Dealer Long Call Gamma > 0, Dealer Short Put Gamma < 0
      const g = (opt.gamma || 0) * opt.oi * spec.lotSize * (spotPrice / 100);

      if (opt.optionType === 'CE') {
        entry.callGamma += g;
        totalNetGamma += g;
      } else {
        entry.putGamma += g;
        totalNetGamma -= g;
      }
    }

    const strikeGammas = Array.from(strikeMap.entries())
      .map(([strike, data]) => ({
        strike,
        callGamma: Math.round(data.callGamma / 100000), // in Lakhs
        putGamma: Math.round(data.putGamma / 100000),
        netGamma: Math.round((data.callGamma - data.putGamma) / 100000)
      }))
      .sort((a, b) => a.strike - b.strike);

    // Calculate Gamma Flip: strike where net gamma transitions from negative to positive
    let gammaFlipLevel = spotPrice;
    for (let i = 1; i < strikeGammas.length; i++) {
      if (strikeGammas[i - 1].netGamma < 0 && strikeGammas[i].netGamma >= 0) {
        gammaFlipLevel = strikeGammas[i].strike;
        break;
      }
    }

    const netGammaCrores = Number((totalNetGamma / 10000000).toFixed(2));
    const gammaRegime = netGammaCrores > 50 ? 'POSITIVE_GAMMA' : netGammaCrores < -50 ? 'NEGATIVE_GAMMA' : 'NEUTRAL';
    const marketMakerStance =
      gammaRegime === 'POSITIVE_GAMMA'
        ? 'Dampening Volatility (Market makers buy dips and sell rallies to hedge long gamma)'
        : 'Amplifying Volatility (Market makers sell into drops and buy into rallies, expanding directional velocity)';

    return {
      underlying,
      estimatedNetGammaCrores: netGammaCrores,
      gammaRegime,
      gammaFlipLevel,
      marketMakerStance,
      confidence: 0.74,
      estimated: true,
      assumptions: 'Assumes retail net option buyer & institutional dealer liquidity provision',
      strikeGammas: strikeGammas.filter(s => Math.abs(s.strike - spotPrice) <= spec.strikeInterval * 10)
    };
  }
}

export const gammaEngine = GammaEngine.getInstance();
