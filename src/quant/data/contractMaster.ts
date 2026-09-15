/**
 * Contract Master for Quant Intelligence
 * Manages exchange segment, lot sizes, tick sizes, strike step intervals.
 */

import { QuantUnderlying } from '../types.js';
import { CANONICAL_INSTRUMENTS, ALL_CONFIGURED_SYMBOLS, CanonicalInstrumentConfig } from '../../shared/marketConfig.js';

export interface ContractSpecification {
  underlying: QuantUnderlying;
  exchange: 'NSE' | 'BSE' | 'MCX';
  segment: 'NFO' | 'BFO' | 'MCX';
  lotSize: number;
  tickSize: number;
  strikeInterval: number;
  indexToken: string;
}

function buildContractSpec(inst: CanonicalInstrumentConfig): ContractSpecification {
  const exchange = inst.exchange;
  const segment = exchange === 'BSE' ? 'BFO' : exchange === 'MCX' ? 'MCX' : 'NFO';

  let indexToken = `${exchange}|${inst.symbol}`;
  if (inst.symbol === 'NIFTY') indexToken = 'NSE_INDEX|Nifty 50';
  else if (inst.symbol === 'BANKNIFTY') indexToken = 'NSE_INDEX|Nifty Bank';
  else if (inst.symbol === 'SENSEX') indexToken = 'BSE_INDEX|SENSEX';
  else if (inst.symbol === 'FINNIFTY') indexToken = 'NSE_INDEX|Nifty Fin Service';
  else if (inst.symbol === 'MIDCPNIFTY') indexToken = 'NSE_INDEX|NIFTY MID SELECT';

  return {
    underlying: inst.symbol as QuantUnderlying,
    exchange,
    segment,
    lotSize: inst.lotSize,
    tickSize: 0.05,
    strikeInterval: inst.stepSize,
    indexToken
  };
}

export const CONTRACT_SPECS: Record<QuantUnderlying, ContractSpecification> = (() => {
  const specs = {} as Record<QuantUnderlying, ContractSpecification>;
  for (const sym of ALL_CONFIGURED_SYMBOLS) {
    const inst = CANONICAL_INSTRUMENTS[sym];
    if (inst) {
      specs[sym as QuantUnderlying] = buildContractSpec(inst);
    }
  }
  return specs;
})();

export class ContractMaster {
  public static getSpec(underlying: QuantUnderlying): ContractSpecification {
    return CONTRACT_SPECS[underlying] || CONTRACT_SPECS['NIFTY'];
  }

  public static getContractSpec(underlying: QuantUnderlying): ContractSpecification {
    return this.getSpec(underlying);
  }

  public static getNearestStrike(price: number, strikeInterval: number): number {
    return Math.round(price / strikeInterval) * strikeInterval;
  }
}
