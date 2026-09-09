/**
 * Contract Master for Quant Intelligence
 * Manages exchange segment, lot sizes, tick sizes, strike step intervals.
 */

import { QuantUnderlying } from '../types.js';

export interface ContractSpecification {
  underlying: QuantUnderlying;
  exchange: 'NSE' | 'BSE';
  segment: 'NFO' | 'BFO';
  lotSize: number;
  tickSize: number;
  strikeInterval: number;
  indexToken: string;
}

export const CONTRACT_SPECS: Record<QuantUnderlying, ContractSpecification> = {
  NIFTY: {
    underlying: 'NIFTY',
    exchange: 'NSE',
    segment: 'NFO',
    lotSize: 25,
    tickSize: 0.05,
    strikeInterval: 50,
    indexToken: 'NSE_INDEX|Nifty 50'
  },
  BANKNIFTY: {
    underlying: 'BANKNIFTY',
    exchange: 'NSE',
    segment: 'NFO',
    lotSize: 15,
    tickSize: 0.05,
    strikeInterval: 100,
    indexToken: 'NSE_INDEX|Nifty Bank'
  },
  SENSEX: {
    underlying: 'SENSEX',
    exchange: 'BSE',
    segment: 'BFO',
    lotSize: 10,
    tickSize: 0.05,
    strikeInterval: 100,
    indexToken: 'BSE_INDEX|SENSEX'
  }
};

export class ContractMaster {
  public static getSpec(underlying: QuantUnderlying): ContractSpecification {
    return CONTRACT_SPECS[underlying] || CONTRACT_SPECS.NIFTY;
  }

  public static getNearestStrike(price: number, strikeInterval: number): number {
    return Math.round(price / strikeInterval) * strikeInterval;
  }
}
