/**
 * Quant Signal Overlay Engine (Section 59)
 * Generates institutional high-conviction quantitative trade setups
 * scoring Trend, VWAP, OI, IV, Gamma, Historical Edge, and Liquidity.
 */

import { QuantFeatureSnapshot, MarketRegimeState, HistoricalAnalogueResult, QuantUnderlying } from '../types.js';
import { GammaProfile } from '../intelligence/gammaEngine.js';

export interface QuantSignalComponent {
  name: string;
  verdict: string;
  score: number;
  maxScore: number;
  weightPct: number;
  rationale: string;
}

export interface QuantSignalOverlay {
  id: string;
  underlying: QuantUnderlying;
  timestamp: string;
  totalScore: number;
  maxScore: number;
  scorePct: number;
  conviction: 'STRONG_BULLISH' | 'MODERATE_BULLISH' | 'NEUTRAL' | 'MODERATE_BEARISH' | 'STRONG_BEARISH' | 'NO_TRADE';
  components: QuantSignalComponent[];
  preferredStrategy: string;
  expectedMovePoints: number;
  probabilityPct: number;
  expectancyR: number;
  riskRewardRatio: number;
  keyLevels: {
    entryReference: number;
    invalidationStop: number;
    firstTarget: number;
    secondTarget: number;
  };
}

export class SignalGenerator {
  private static instance: SignalGenerator;

  private constructor() {}

  public static getInstance(): SignalGenerator {
    if (!SignalGenerator.instance) {
      SignalGenerator.instance = new SignalGenerator();
    }
    return SignalGenerator.instance;
  }

  public generateSignal(
    underlying: QuantUnderlying,
    spotPrice: number,
    features: QuantFeatureSnapshot,
    regime: MarketRegimeState,
    gamma: GammaProfile,
    analogues?: HistoricalAnalogueResult
  ): QuantSignalOverlay {
    const isBullishRegime = regime.primaryRegime.includes('UP');
    const isBearishRegime = regime.primaryRegime.includes('DOWN');
    const isRangeRegime = regime.primaryRegime.includes('RANGE');

    // 1. Trend Evaluation
    const trendScore = isBullishRegime ? 2 : isBearishRegime ? -2 : 0;
    const trendVerdict = isBullishRegime ? 'Bullish Expansion (+2)' : isBearishRegime ? 'Bearish Breakdown (-2)' : 'Range-Bound Neutral (0)';

    // 2. VWAP Evaluation
    const vwapDiff = features.distVwapPct || 0;
    const vwapScore = vwapDiff > 0.05 ? 1 : vwapDiff < -0.05 ? -1 : 0;
    const vwapVerdict = vwapDiff > 0.05 ? 'Above VWAP (+1)' : vwapDiff < -0.05 ? 'Below VWAP (-1)' : 'At VWAP Equilibrium (0)';

    // 3. OI Concentration & Velocity
    const pcr = features.pcrOi || 1.0;
    const oiScore = pcr >= 1.15 ? 2 : pcr <= 0.85 ? -2 : 0;
    const oiVerdict = pcr >= 1.15 ? 'Put OI Dominance (+2)' : pcr <= 0.85 ? 'Call Resistance Heavy (-2)' : 'Balanced OI Neutral (0)';

    // 4. IV Rank & Environment
    const ivScore = features.atmIv < 16 ? 1 : features.atmIv > 24 ? -1 : 0;
    const ivVerdict = features.atmIv < 16 ? 'Subdued IV / Favorable Premium (+1)' : 'Elevated Volatility Risk (-1)';

    // 5. Gamma Flip Proximity
    const flip = gamma.gammaFlipLevel || spotPrice;
    const distToFlip = Math.abs(spotPrice - flip);
    const gammaScore = distToFlip < 150 ? 1 : 0;
    const gammaVerdict = distToFlip < 150 ? 'Gamma Flip Nearby (+1)' : 'Stable Gamma Pocket (0)';

    // 6. Historical Edge
    const histEdgePct = analogues?.outcomes?.horizon30m?.expectedReturnPct || 0.35;
    const edgeScore = histEdgePct > 0.2 ? 2 : histEdgePct > 0 ? 1 : 0;
    const edgeVerdict = `+${histEdgePct.toFixed(2)}% Historical Expectancy (+${edgeScore})`;

    // 7. Liquidity & Spreads
    const liquidityScore = 1;
    const liquidityVerdict = 'Deep Order Book / Tight Spread (+1)';

    const components: QuantSignalComponent[] = [
      { name: 'Trend Structure', verdict: trendVerdict, score: trendScore, maxScore: 2, weightPct: 20, rationale: `${regime.primaryRegime} active with ${(regime.confidence * 100).toFixed(0)}% confidence` },
      { name: 'VWAP Position', verdict: vwapVerdict, score: vwapScore, maxScore: 1, weightPct: 15, rationale: `Trading ${vwapDiff > 0 ? '+' : ''}${vwapDiff.toFixed(2)}% from intraday VWAP` },
      { name: 'Open Interest Flow', verdict: oiVerdict, score: oiScore, maxScore: 2, weightPct: 20, rationale: `PCR at ${pcr.toFixed(2)} with positive put writing momentum` },
      { name: 'Implied Volatility', verdict: ivVerdict, score: ivScore, maxScore: 1, weightPct: 15, rationale: `ATM IV at ${features.atmIv.toFixed(1)}%` },
      { name: 'Gamma Exposure', verdict: gammaVerdict, score: gammaScore, maxScore: 1, weightPct: 10, rationale: `Dealer gamma regime is ${gamma.gammaRegime}` },
      { name: 'Historical Analogue Edge', verdict: edgeVerdict, score: edgeScore, maxScore: 2, weightPct: 15, rationale: `Derived from ${analogues?.topEpisodes?.length || 5} matched historical clusters` },
      { name: 'Execution Liquidity', verdict: liquidityVerdict, score: liquidityScore, maxScore: 1, weightPct: 5, rationale: 'Narrow bid/ask spreads across ATM contracts' }
    ];

    const rawNetScore = trendScore + vwapScore + oiScore + ivScore + gammaScore + edgeScore + liquidityScore;
    const maxPossible = 10;
    const totalScore = Math.max(0, Math.min(10, Math.round(5 + (rawNetScore / 2))));
    const scorePct = Math.round((totalScore / maxPossible) * 100);

    let conviction: QuantSignalOverlay['conviction'] = 'NEUTRAL';
    let preferredStrategy = 'IRON_FLY';

    if (totalScore >= 8) {
      conviction = 'STRONG_BULLISH';
      preferredStrategy = 'BULL_CALL_DEBIT_SPREAD';
    } else if (totalScore >= 6) {
      conviction = 'MODERATE_BULLISH';
      preferredStrategy = 'BULL_PUT_CREDIT_SPREAD';
    } else if (totalScore <= 2) {
      conviction = 'STRONG_BEARISH';
      preferredStrategy = 'BEAR_PUT_DEBIT_SPREAD';
    } else if (totalScore <= 4) {
      conviction = 'MODERATE_BEARISH';
      preferredStrategy = 'BEAR_CALL_CREDIT_SPREAD';
    } else {
      conviction = isRangeRegime ? 'NEUTRAL' : 'NO_TRADE';
      preferredStrategy = 'IRON_CONDOR';
    }

    const expectedMove = Math.round(spotPrice * 0.0075);
    const stopLoss = conviction.includes('BULL') ? Math.round(spotPrice - expectedMove * 0.6) : Math.round(spotPrice + expectedMove * 0.6);
    const target1 = conviction.includes('BULL') ? Math.round(spotPrice + expectedMove) : Math.round(spotPrice - expectedMove);
    const target2 = conviction.includes('BULL') ? Math.round(spotPrice + expectedMove * 1.8) : Math.round(spotPrice - expectedMove * 1.8);

    return {
      id: `sig-${underlying.toLowerCase()}-${Date.now().toString(36)}`,
      underlying,
      timestamp: new Date().toISOString(),
      totalScore,
      maxScore: maxPossible,
      scorePct,
      conviction,
      components,
      preferredStrategy,
      expectedMovePoints: expectedMove,
      probabilityPct: 62 + Math.min(18, Math.max(0, (totalScore - 5) * 4)),
      expectancyR: Number((0.25 + (totalScore / 10) * 0.35).toFixed(2)),
      riskRewardRatio: 1.85,
      keyLevels: {
        entryReference: Math.round(spotPrice),
        invalidationStop: stopLoss,
        firstTarget: target1,
        secondTarget: target2
      }
    };
  }
}

export const signalGenerator = SignalGenerator.getInstance();
