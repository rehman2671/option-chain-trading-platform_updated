/**
 * EMA15M Adaptive Swing v2. Read-only research; never invoked by order dispatcher.
 * No synthetic options, inferred bid/ask or invented Greeks.
 */
import { dbEngine } from '../../db.js';
import { activeProvider } from '../providers/index.js';
import { analyzeAdaptiveRegime } from './adaptiveMarketRegime.js';
import {
  chooseAdaptiveExpiries, rankAdaptiveOptions, type DirectionalOptionType
} from './adaptiveOptionRanker.js';

export type AdaptiveInstrument = 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
const brokerKeys: Record<AdaptiveInstrument, string> = {
  NIFTY: 'NSE_INDEX|Nifty 50',
  BANKNIFTY: 'NSE_INDEX|Nifty Bank',
  SENSEX: 'BSE_INDEX|SENSEX'
};

export async function getAdaptiveResearchPreview(
  instrument: AdaptiveInstrument,
  scenarioBias?: 'BULLISH' | 'BEARISH',
  asOf: Date = new Date()
) {
  const candles = dbEngine.getEma15mCandles(instrument, 600);
  const regime = analyzeAdaptiveRegime(candles, asOf);
  const mode = 'RESEARCH_ONLY' as const;
  const optionType: DirectionalOptionType | null = scenarioBias === 'BULLISH' ? 'CE' :
    scenarioBias === 'BEARISH' ? 'PE' :
    regime.candidateSignal === 'NO_TRADE' ? null : regime.candidateSignal;
  const directionSource = scenarioBias ? 'SCENARIO' :
    optionType ? 'REGIME' : 'NONE';

  const common = {
    mode, executionAuthorized: false as const, instrument, generatedAt: asOf.toISOString(),
    regime, directionSource, optionType, snapshotAgeVerified: false
  };
  if (!optionType) return {
    ...common, reason: 'MARKET_NOT_QUALIFIED_FOR_DIRECTIONAL_RESEARCH',
    optionResearch: null
  };
  if (!Number.isFinite(Number(candles[candles.length - 1]?.close))) return {
    ...common, reason: 'INVALID_SPOT_PRICE', optionResearch: null
  };
  if (regime.regime === 'INSUFFICIENT_DATA' || regime.regime === 'STALE_DATA') return {
    ...common, reason: 'CANDLE_HISTORY_INSUFFICIENT_OR_STALE', optionResearch: null
  };

  const provider = activeProvider as any;
  if (typeof provider.getOptionContracts !== 'function' ||
      typeof provider.getAdaptiveOptionChain !== 'function') return {
    ...common, reason: 'BROKER_READ_ONLY_CONTRACT_DATA_UNAVAILABLE', optionResearch: null
  };

  let contracts: any[];
  try {
    contracts = await provider.getOptionContracts(brokerKeys[instrument]);
    if (!Array.isArray(contracts)) throw new Error('Invalid broker contract response');
  } catch (err: any) {
    return { ...common, reason: 'LISTED_CONTRACTS_UNAVAILABLE',
      errorCode: 'BROKER_READ_ONLY_API_FAILED', optionResearch: null };
  }

  const selections = chooseAdaptiveExpiries(
    contracts, brokerKeys[instrument], instrument, optionType, asOf
  );
  const expiries = [...new Set(selections.map(c => c.expiry).filter(
    (date): date is string => Boolean(date)
  ))].slice(0, 4);
  // Bounded read-only fanout; NULL is an unavailable quote, never a zero quote.
  const results = await Promise.allSettled(expiries.map(expiry =>
    provider.getAdaptiveOptionChain(brokerKeys[instrument], expiry)
  ));
  const chainByExpiry: Record<string, unknown> = {};
  results.forEach((r, i) => {
    chainByExpiry[expiries[i]] = r.status === 'fulfilled' ? r.value : null;
  });
  return {
    ...common,
    reason: scenarioBias && regime.candidateSignal === 'NO_TRADE'
      ? 'SCENARIO_ONLY_MARKET_SAYS_WAIT'
      : 'ADAPTIVE_CONTRACT_RESEARCH_ONLY',
    optionResearch: rankAdaptiveOptions({
      brokerContracts: contracts, chainByExpiry,
      underlyingKey: brokerKeys[instrument], instrument, optionType,
      spot: Number(candles[candles.length - 1].close), asOf
    })
  };
}
