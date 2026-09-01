/**
 * Common Provider Interface for Delta Chain Market Feed
 */

export type DataProviderMode = 'PRACTICE' | 'LIVE';

export interface UnderlyingQuote {
  symbol: string;
  spot: number;
  prevClose: number;
  volume: number;
  available: boolean;
  timestamp: string;
}

export interface OptionContractQuote {
  strikePrice: number;
  optionType: 'CE' | 'PE';
  ltp: number;
  oi: number;
  volume: number;
  changeInOI: number;
  pChangeInOI: number;
  iv: number;
  bidPrice?: number;
  askPrice?: number;
  ltpAvailable: boolean;
  oiAvailable: boolean;
  volumeAvailable: boolean;
  changeInOIAvailable: boolean;
  ivAvailable: boolean;
}

export interface ProviderHealthStatus {
  mode: DataProviderMode;
  connected: boolean;
  message: string;
  subSources: {
    upstoxBroker?: { connected: boolean; lastRefresh?: string; message?: string; wsConnected?: boolean };
    upstoxFeed?: { connected: boolean; lastRefresh?: string; message?: string };
    practiceEngine?: { connected: boolean; lastRefresh?: string; message?: string };
    nseOptionChain?: { connected: boolean; lastRefresh?: string; message?: string; sessionValid?: boolean };
  };
}

export interface IMarketDataProvider {
  getProviderMode(): DataProviderMode;
  connect(): Promise<ProviderHealthStatus>;
  getUnderlyingQuotes(symbols: string[]): Promise<Map<string, UnderlyingQuote>>;
  getOptionChainQuotes(
    symbol: string,
    expiry: string,
    strikes: number[]
  ): Promise<Map<string, { ce: OptionContractQuote; pe: OptionContractQuote }>>;
  getHistoricalData?(symbol: string, from: string, to: string, interval?: string): Promise<any>;
  placeOrder?(params: any): Promise<any>;
  getOrderMargins?(params: any): Promise<any>;
  getPositions?(): Promise<any>;
  getAvailableMargin(): Promise<{ available: number; source: 'LIVE' | 'PRACTICE' }>;
  onActiveViewChanged?(symbol: string, expiry: string): void;
  destroy?(): void;
}
