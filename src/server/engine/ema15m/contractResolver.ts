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
  /** Resolve the listed broker contract before a LIVE BUY. Paper quotes remain independent. */
  public static async verifyLiveContract(candidate: ResolvedContract, provider: any): Promise<ResolvedContract> {
    const underlyingKey: Record<string, string> = {
      NIFTY: 'NSE_INDEX|Nifty 50',
      BANKNIFTY: 'NSE_INDEX|Nifty Bank',
      SENSEX: 'BSE_INDEX|SENSEX'
    };
    const key = underlyingKey[candidate.instrument];
    const reject = (reason: string): ResolvedContract => ({
      ...candidate, isValid: false, brokerInstrumentKey: '', rejectionReason: reason
    });
    if (!key || typeof provider?.getOptionContracts !== 'function') {
      return reject('UPSTOX_LISTED_CONTRACT_LOOKUP_UNAVAILABLE');
    }
    try {
      const rows: any[] = await provider.getOptionContracts(key);
      if (!Array.isArray(rows)) return reject('UPSTOX_CONTRACT_LIST_INVALID');
      const todayIST = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      const segment = candidate.segment === 'BFO' ? 'BSE_FO' : 'NSE_FO';
      const matches = rows.filter((c: any) =>
        c?.underlying_symbol === candidate.instrument &&
        c?.underlying_key === key &&
        c?.segment === segment &&
        c?.instrument_type === candidate.optionType &&
        Number(c?.strike_price) === candidate.strikePrice &&
        typeof c?.expiry === 'string' && c.expiry >= todayIST &&
        typeof c?.instrument_key === 'string' &&
        new RegExp('^' + segment + '\\|[0-9]+  /**
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
).test(c.instrument_key) &&
        typeof c?.trading_symbol === 'string' && c.trading_symbol.length > 0 &&
        Number.isInteger(Number(c?.lot_size)) && Number(c.lot_size) > 0
      ).sort((a: any, b: any) => a.expiry.localeCompare(b.expiry));
      const c = matches[0];
      if (!c) return reject('EXCHANGE_LISTED_CONTRACT_NOT_FOUND');
      const rawTick = Number(c.tick_size);
      const tickSize = rawTick >= 1 ? rawTick / 100 : rawTick;
      if (!Number.isFinite(tickSize) || tickSize <= 0) return reject('INVALID_BROKER_TICK_SIZE');
      return {
        ...candidate,
        expiryDate: c.expiry,
        tradingsymbol: c.trading_symbol,
        brokerInstrumentKey: c.instrument_key,
        lotSize: Number(c.lot_size),
        tickSize,
        isValid: true,
        rejectionReason: undefined
      };
    } catch (err: any) {
      return reject(`UPSTOX_CONTRACT_LOOKUP_FAILED: ${err?.message || err}`);
    }
  }

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
