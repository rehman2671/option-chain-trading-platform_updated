/**
 * Canonical Market & Instrument Configuration
 * Single Source of Truth for all supported underlying symbols, lot sizes, step sizes, and asset categories.
 */

export type UnderlyingAssetType = 'INDEX' | 'EQUITY' | 'COMMODITY';
export type OptionExerciseStyle = 'EUROPEAN' | 'AMERICAN';
export type ExchangeCode = 'NSE' | 'BSE' | 'MCX';

export interface CanonicalInstrumentConfig {
  symbol: string;
  name: string;
  type: UnderlyingAssetType;
  style: OptionExerciseStyle;
  exchange: ExchangeCode;
  baseSpotPrice: number;
  stepSize: number;
  strikeCountAboveBelow: number;
  indiaVixBase: number;
  lotSize: number;
  weeklyExpiryDay?: number; // 2: Tuesday, 3: Wednesday, 4: Thursday
}

export const CANONICAL_INSTRUMENTS: Record<string, CanonicalInstrumentConfig> = {
  NIFTY: {
    symbol: 'NIFTY',
    name: 'NIFTY 50 Index',
    type: 'INDEX',
    style: 'EUROPEAN',
    exchange: 'NSE',
    baseSpotPrice: 24055.80,
    stepSize: 50,
    strikeCountAboveBelow: 15,
    indiaVixBase: 11.2,
    lotSize: 25,
    weeklyExpiryDay: 4 // Thursday
  },
  BANKNIFTY: {
    symbol: 'BANKNIFTY',
    name: 'NIFTY Bank Index',
    type: 'INDEX',
    style: 'EUROPEAN',
    exchange: 'NSE',
    baseSpotPrice: 57409.60,
    stepSize: 100,
    strikeCountAboveBelow: 12,
    indiaVixBase: 13.5,
    lotSize: 15,
    weeklyExpiryDay: 3 // Wednesday
  },
  SENSEX: {
    symbol: 'SENSEX',
    name: 'BSE SENSEX Index',
    type: 'INDEX',
    style: 'EUROPEAN',
    exchange: 'BSE',
    baseSpotPrice: 76944.28,
    stepSize: 100,
    strikeCountAboveBelow: 15,
    indiaVixBase: 11.8,
    lotSize: 10,
    weeklyExpiryDay: 4
  },
  FINNIFTY: {
    symbol: 'FINNIFTY',
    name: 'NIFTY Financial Services Index',
    type: 'INDEX',
    style: 'EUROPEAN',
    exchange: 'NSE',
    baseSpotPrice: 26003.90,
    stepSize: 50,
    strikeCountAboveBelow: 15,
    indiaVixBase: 12.0,
    lotSize: 65,
    weeklyExpiryDay: 2 // Tuesday
  },
  MIDCPNIFTY: {
    symbol: 'MIDCPNIFTY',
    name: 'NIFTY Midcap Select Index',
    type: 'INDEX',
    style: 'EUROPEAN',
    exchange: 'NSE',
    baseSpotPrice: 14813.35,
    stepSize: 25,
    strikeCountAboveBelow: 15,
    indiaVixBase: 14.5,
    lotSize: 75,
    weeklyExpiryDay: 1 // Monday
  },
  RELIANCE: {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    type: 'EQUITY',
    style: 'AMERICAN',
    exchange: 'NSE',
    baseSpotPrice: 1309.00,
    stepSize: 20,
    strikeCountAboveBelow: 10,
    indiaVixBase: 16.5,
    lotSize: 250
  },
  TCS: {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Ltd',
    type: 'EQUITY',
    style: 'AMERICAN',
    exchange: 'NSE',
    baseSpotPrice: 2369.00,
    stepSize: 50,
    strikeCountAboveBelow: 8,
    indiaVixBase: 14.8,
    lotSize: 175
  },
  HDFCBANK: {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Limited',
    type: 'EQUITY',
    style: 'AMERICAN',
    exchange: 'NSE',
    baseSpotPrice: 711.90,
    stepSize: 10,
    strikeCountAboveBelow: 10,
    indiaVixBase: 14.0,
    lotSize: 550
  },
  TATAMOTORS: {
    symbol: 'TATAMOTORS',
    name: 'Tata Motors Limited',
    type: 'EQUITY',
    style: 'AMERICAN',
    exchange: 'NSE',
    baseSpotPrice: 310.00,
    stepSize: 5,
    strikeCountAboveBelow: 10,
    indiaVixBase: 17.5,
    lotSize: 575
  },
  GOLD: {
    symbol: 'GOLD',
    name: 'Gold Commodity Futures',
    type: 'COMMODITY',
    style: 'EUROPEAN',
    exchange: 'MCX',
    baseSpotPrice: 85240.00,
    stepSize: 100,
    strikeCountAboveBelow: 10,
    indiaVixBase: 12.5,
    lotSize: 1
  },
  CRUDEOIL: {
    symbol: 'CRUDEOIL',
    name: 'Crude Oil Commodity Futures',
    type: 'COMMODITY',
    style: 'EUROPEAN',
    exchange: 'MCX',
    baseSpotPrice: 7669.40,
    stepSize: 20,
    strikeCountAboveBelow: 10,
    indiaVixBase: 24.0,
    lotSize: 100
  },
  SILVER: {
    symbol: 'SILVER',
    name: 'Silver Commodity Futures',
    type: 'COMMODITY',
    style: 'EUROPEAN',
    exchange: 'MCX',
    baseSpotPrice: 92450.00,
    stepSize: 100,
    strikeCountAboveBelow: 10,
    indiaVixBase: 16.0,
    lotSize: 1
  },
  NATURALGAS: {
    symbol: 'NATURALGAS',
    name: 'Natural Gas Commodity Futures',
    type: 'COMMODITY',
    style: 'EUROPEAN',
    exchange: 'MCX',
    baseSpotPrice: 250.50,
    stepSize: 1,
    strikeCountAboveBelow: 10,
    indiaVixBase: 32.0,
    lotSize: 1250
  },
  COPPER: {
    symbol: 'COPPER',
    name: 'Copper Commodity Futures',
    type: 'COMMODITY',
    style: 'EUROPEAN',
    exchange: 'MCX',
    baseSpotPrice: 1275.30,
    stepSize: 2,
    strikeCountAboveBelow: 10,
    indiaVixBase: 18.0,
    lotSize: 2500
  },
  INFY: {
    symbol: 'INFY',
    name: 'Infosys Limited',
    type: 'EQUITY',
    style: 'AMERICAN',
    exchange: 'NSE',
    baseSpotPrice: 1156.00,
    stepSize: 20,
    strikeCountAboveBelow: 10,
    indiaVixBase: 15.0,
    lotSize: 400
  },
  SBIN: {
    symbol: 'SBIN',
    name: 'State Bank of India',
    type: 'EQUITY',
    style: 'AMERICAN',
    exchange: 'NSE',
    baseSpotPrice: 1034.50,
    stepSize: 10,
    strikeCountAboveBelow: 10,
    indiaVixBase: 15.8,
    lotSize: 750
  },
  ICICIBANK: {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Limited',
    type: 'EQUITY',
    style: 'AMERICAN',
    exchange: 'NSE',
    baseSpotPrice: 1438.00,
    stepSize: 10,
    strikeCountAboveBelow: 10,
    indiaVixBase: 14.2,
    lotSize: 700
  }
};

/** All supported symbols list */
export const ALL_SUPPORTED_SYMBOLS = Object.keys(CANONICAL_INSTRUMENTS);

/** Index symbols only */
export const INDEX_SYMBOLS = Object.values(CANONICAL_INSTRUMENTS)
  .filter(i => i.type === 'INDEX')
  .map(i => i.symbol);

/** Equity symbols only */
export const EQUITY_SYMBOLS = Object.values(CANONICAL_INSTRUMENTS)
  .filter(i => i.type === 'EQUITY')
  .map(i => i.symbol);

/** Commodity symbols only */
export const COMMODITY_SYMBOLS = Object.values(CANONICAL_INSTRUMENTS)
  .filter(i => i.type === 'COMMODITY')
  .map(i => i.symbol);

/** All configured canonical symbols across all asset categories */
export const ALL_CONFIGURED_SYMBOLS = Object.keys(CANONICAL_INSTRUMENTS);

/** Active symbols monitored for high-volume coverage and system health (dynamically derived from CANONICAL_INSTRUMENTS) */
export const PRIMARY_COVERAGE_SYMBOLS = Object.keys(CANONICAL_INSTRUMENTS);

/** Historical candle synchronization symbols */
export const HISTORICAL_SYNC_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'TATAMOTORS'];

/** Instruments with automated 15-Minute EMA crossover engines */
export const EMA_15M_INSTRUMENTS = ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const;
export type Ema15mInstrumentType = typeof EMA_15M_INSTRUMENTS[number];

/** Helper lookup functions */
export function getInstrumentConfig(symbol: string): CanonicalInstrumentConfig {
  return CANONICAL_INSTRUMENTS[symbol] || CANONICAL_INSTRUMENTS.NIFTY;
}

export function isIndexSymbol(symbol: string): boolean {
  return CANONICAL_INSTRUMENTS[symbol]?.type === 'INDEX';
}

export function isEquitySymbol(symbol: string): boolean {
  return CANONICAL_INSTRUMENTS[symbol]?.type === 'EQUITY';
}

export function getLotSize(symbol: string): number {
  return CANONICAL_INSTRUMENTS[symbol]?.lotSize || 50;
}

export function getStepSize(symbol: string): number {
  return CANONICAL_INSTRUMENTS[symbol]?.stepSize || 50;
}
