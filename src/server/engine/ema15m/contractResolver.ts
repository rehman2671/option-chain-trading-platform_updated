/**
 * Dynamic Option Contract Resolver for 15M EMA Strategy
 * Resolves authoritative strike, weekly expiry, lot size, tradingsymbol, and broker instrument key.
 */

import { Ema15mInstrument } from '../../../types.js';
import { ContractMaster } from '../../../quant/data/contractMaster.js';
import { ExpiryResolver } from '../../../quant/data/expiryResolver.js';
import { getInstrumentConfig } from '../../../shared/marketConfig.js';
import { resolveTradingsymbol } from '../basketEngine.js';
import { OptionType } from './types.js';
import { dbEngine } from '../../db.js';

export interface ResolvedContract {
  instrument: Ema15mInstrument;
  exchange: 'NSE' | 'BSE';
  segment: 'NFO' | 'BFO';
  optionType: OptionType;
  strikePrice: number;
  expiryDate: string;
  tradingsymbol: string;
  brokerInstrumentKey: string;
  lotSize: number;
  tickSize: number;
  isValid: boolean;
  rejectionReason?: string;
}

export class ContractResolver {
  /**
   * Resolves a complete, authoritative contract specification for a given signal & spot price.
   */
  public static resolveContract(
    instrument: Ema15mInstrument,
    arg2: OptionType | number,
    arg3: OptionType | number,
    referenceDate: Date | string = new Date()
  ): ResolvedContract {
    const optionType: OptionType = (typeof arg2 === 'string' ? arg2 : arg3) as OptionType;
    const spotPrice: number = typeof arg2 === 'number' ? arg2 : (arg3 as number);
    const refDate = typeof referenceDate === 'string' ? new Date(referenceDate) : (referenceDate || new Date());

    const cfg = getInstrumentConfig(instrument);
    const stepSize = cfg ? cfg.stepSize : 50;
    const lotSize = cfg ? cfg.lotSize : (instrument === 'SENSEX' ? 10 : instrument === 'BANKNIFTY' ? 15 : 25);
    const exchange: 'NSE' | 'BSE' = instrument === 'SENSEX' ? 'BSE' : 'NSE';
    const segment: 'NFO' | 'BFO' = exchange === 'BSE' ? 'BFO' : 'NFO';

    // 1. Directional ATM Strike Selection
    // Bullish CE: Nearest strike >= spot (Ceiling)
    // Bearish PE: Nearest strike <= spot (Floor)
    const strikePrice = ContractMaster.getDirectionalAtmStrike(spotPrice, optionType, stepSize);

    // 2. Dynamic Weekly Expiry Resolution
    let expiryDate = '';
    try {
      const availableDates = dbEngine.getAvailableOptionExpiries(instrument);
      const res = ExpiryResolver.resolve(instrument as any, availableDates, refDate);
      expiryDate = res.currentExpiry;
    } catch {
      const res = ExpiryResolver.resolve(instrument as any, [], refDate);
      expiryDate = res.currentExpiry;
    }

    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      return {
        instrument,
        exchange,
        segment,
        optionType,
        strikePrice,
        expiryDate: '',
        tradingsymbol: '',
        brokerInstrumentKey: '',
        lotSize,
        tickSize: 0.05,
        isValid: false,
        rejectionReason: `Could not resolve valid expiry for ${instrument} on ${refDate.toISOString()}`
      };
    }

    // 3. Tradingsymbol Construction
    const tradingsymbol = resolveTradingsymbol(instrument, strikePrice, optionType, expiryDate);

    // 4. Broker Instrument Key
    // Upstox API v2 standard instrument key format: e.g. NSE_FO|52145 or NSE_FO|<tradingsymbol>
    const brokerInstrumentKey = `${segment === 'BFO' ? 'BSE_FO' : 'NSE_FO'}|${tradingsymbol}`;

    return {
      instrument,
      exchange,
      segment,
      optionType,
      strikePrice,
      expiryDate,
      tradingsymbol,
      brokerInstrumentKey,
      lotSize,
      tickSize: 0.05,
      isValid: true
    };
  }
}
