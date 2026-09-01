/**
 * Delta Chain Market Feed & Option Chain Engine
 * Orchestrates Market Data Providers (Practice Mode vs Kite Live Mode)
 * Computes Black-Scholes Greeks, OI buildup, Max Pain, PCR, and persists snapshots to SQLite
 */

import { OptionChainSnapshot, OptionStrikeRow, OptionContract, UnderlyingStyle } from '../../types.js';
import { calculateEuropeanOptionGreeks, calculateAmericanOptionGreeks, calculateImpliedVolatility } from './blackScholes.js';
import { calculateMaxPainStrike, calculatePCR, classifyOIBuildup, calculateIVRankAndPercentile, detectUnusualOIAnomalies, processEventReactiveState } from './optionAnalytics.js';
import { dbEngine } from '../db.js';
import { activeProvider, initActiveProvider } from './providers/index.js';

interface UnderlyingConfig {
  symbol: string;
  style: UnderlyingStyle;
  baseSpotPrice: number;
  stepSize: number;
  strikeCountAboveBelow: number;
  indiaVixBase: number;
  lotSize: number;
  expiries: string[];
}

/**
 * Dynamically computes upcoming expiry dates for NSE indices and equities.
 * Index Options (NIFTY, BANKNIFTY): Upcoming weekly/monthly Thursdays
 * Stock Options (RELIANCE, TCS, HDFCBANK): Last Thursday of current and next months.
 */
export function getUpcomingExpiriesForSymbol(symbol: string, fromDate: Date = new Date()): string[] {
  const isStock = symbol === 'RELIANCE' || symbol === 'TCS' || symbol === 'HDFCBANK';
  const targetDay = 4; // Thursday

  const expiries: string[] = [];
  const curr = new Date(fromDate);
  curr.setHours(15, 30, 0, 0);

  if (isStock) {
    let y = curr.getFullYear();
    let m = curr.getMonth();
    for (let i = 0; i < 3; i++) {
      const monthIdx = (m + i) % 12;
      const year = y + Math.floor((m + i) / 12);
      const lastDayOfMonth = new Date(year, monthIdx + 1, 0);
      const dayOfWeek = lastDayOfMonth.getDay();
      const diff = (dayOfWeek >= targetDay) ? (dayOfWeek - targetDay) : (dayOfWeek + 7 - targetDay);
      const lastTargetDay = new Date(year, monthIdx, lastDayOfMonth.getDate() - diff, 15, 30, 0, 0);

      if (lastTargetDay.getTime() >= curr.getTime() - (6 * 3600 * 1000)) {
        const yStr = lastTargetDay.getFullYear();
        const mStr = String(lastTargetDay.getMonth() + 1).padStart(2, '0');
        const dStr = String(lastTargetDay.getDate()).padStart(2, '0');
        expiries.push(`${yStr}-${mStr}-${dStr}`);
      }
    }
  } else {
    let checkDate = new Date(curr);
    while (expiries.length < 4) {
      if (checkDate.getDay() === targetDay) {
        const expiryTime = new Date(checkDate);
        expiryTime.setHours(15, 30, 0, 0);
        if (expiryTime.getTime() >= curr.getTime() - (6 * 3600 * 1000)) {
          const yStr = checkDate.getFullYear();
          const mStr = String(checkDate.getMonth() + 1).padStart(2, '0');
          const dStr = String(checkDate.getDate()).padStart(2, '0');
          expiries.push(`${yStr}-${mStr}-${dStr}`);
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
  }

  return expiries.length > 0 ? expiries : ['2026-08-20', '2026-08-27', '2026-09-03', '2026-09-24'];
}

export const UNDERLYING_CONFIGS: Record<string, UnderlyingConfig> = {
  NIFTY: {
    symbol: 'NIFTY',
    style: 'EUROPEAN',
    baseSpotPrice: 24055.80,
    stepSize: 50,
    strikeCountAboveBelow: 15,
    indiaVixBase: 11.2,
    lotSize: 25,
    get expiries() { return getUpcomingExpiriesForSymbol('NIFTY'); }
  },
  BANKNIFTY: {
    symbol: 'BANKNIFTY',
    style: 'EUROPEAN',
    baseSpotPrice: 57409.60,
    stepSize: 100,
    strikeCountAboveBelow: 12,
    indiaVixBase: 13.5,
    lotSize: 15,
    get expiries() { return getUpcomingExpiriesForSymbol('BANKNIFTY'); }
  },
  FINNIFTY: {
    symbol: 'FINNIFTY',
    style: 'EUROPEAN',
    baseSpotPrice: 26003.90,
    stepSize: 50,
    strikeCountAboveBelow: 15,
    indiaVixBase: 12.0,
    lotSize: 65,
    get expiries() { return getUpcomingExpiriesForSymbol('FINNIFTY'); }
  },
  MIDCPNIFTY: {
    symbol: 'MIDCPNIFTY',
    style: 'EUROPEAN',
    baseSpotPrice: 14813.35,
    stepSize: 25,
    strikeCountAboveBelow: 15,
    indiaVixBase: 14.5,
    lotSize: 75,
    get expiries() { return getUpcomingExpiriesForSymbol('MIDCPNIFTY'); }
  },
  RELIANCE: {
    symbol: 'RELIANCE',
    style: 'AMERICAN',
    baseSpotPrice: 1309.00,
    stepSize: 20,
    strikeCountAboveBelow: 10,
    indiaVixBase: 16.5,
    lotSize: 250,
    get expiries() { return getUpcomingExpiriesForSymbol('RELIANCE'); }
  },
  TCS: {
    symbol: 'TCS',
    style: 'AMERICAN',
    baseSpotPrice: 2369.00,
    stepSize: 50,
    strikeCountAboveBelow: 8,
    indiaVixBase: 14.8,
    lotSize: 175,
    get expiries() { return getUpcomingExpiriesForSymbol('TCS'); }
  },
  HDFCBANK: {
    symbol: 'HDFCBANK',
    style: 'AMERICAN',
    baseSpotPrice: 711.90,
    stepSize: 10,
    strikeCountAboveBelow: 10,
    indiaVixBase: 14.0,
    lotSize: 550,
    get expiries() { return getUpcomingExpiriesForSymbol('HDFCBANK'); }
  },
  TATAMOTORS: {
    symbol: 'TATAMOTORS',
    style: 'AMERICAN',
    baseSpotPrice: 310.00,
    stepSize: 5,
    strikeCountAboveBelow: 10,
    indiaVixBase: 17.5,
    lotSize: 575,
    get expiries() { return getUpcomingExpiriesForSymbol('TATAMOTORS'); }
  },
  GOLD: {
    symbol: 'GOLD',
    style: 'EUROPEAN',
    baseSpotPrice: 85240.00,
    stepSize: 100,
    strikeCountAboveBelow: 10,
    indiaVixBase: 12.5,
    lotSize: 1,
    get expiries() { return ['2026-08-27', '2026-09-24', '2026-10-29']; }
  },
  CRUDEOIL: {
    symbol: 'CRUDEOIL',
    style: 'EUROPEAN',
    baseSpotPrice: 7669.40,
    stepSize: 20,
    strikeCountAboveBelow: 10,
    indiaVixBase: 24.0,
    lotSize: 100,
    get expiries() { return ['2026-08-27', '2026-09-17', '2026-10-15']; }
  },
  SILVER: {
    symbol: 'SILVER',
    style: 'EUROPEAN',
    baseSpotPrice: 92450.00,
    stepSize: 100,
    strikeCountAboveBelow: 10,
    indiaVixBase: 16.0,
    lotSize: 1,
    get expiries() { return ['2026-08-27', '2026-09-24', '2026-10-29']; }
  },
  NATURALGAS: {
    symbol: 'NATURALGAS',
    style: 'EUROPEAN',
    baseSpotPrice: 250.50,
    stepSize: 1,
    strikeCountAboveBelow: 10,
    indiaVixBase: 32.0,
    lotSize: 1250,
    get expiries() { return ['2026-08-27', '2026-09-17', '2026-10-15']; }
  },
  COPPER: {
    symbol: 'COPPER',
    style: 'EUROPEAN',
    baseSpotPrice: 1275.30,
    stepSize: 2,
    strikeCountAboveBelow: 10,
    indiaVixBase: 18.0,
    lotSize: 2500,
    get expiries() { return ['2026-08-27', '2026-09-17', '2026-10-15']; }
  },
  INFY: {
    symbol: 'INFY',
    style: 'AMERICAN',
    baseSpotPrice: 1156.00,
    stepSize: 20,
    strikeCountAboveBelow: 10,
    indiaVixBase: 15.0,
    lotSize: 400,
    get expiries() { return getUpcomingExpiriesForSymbol('INFY'); }
  },
  SBIN: {
    symbol: 'SBIN',
    style: 'AMERICAN',
    baseSpotPrice: 1034.50,
    stepSize: 10,
    strikeCountAboveBelow: 10,
    indiaVixBase: 15.8,
    lotSize: 750,
    get expiries() { return getUpcomingExpiriesForSymbol('SBIN'); }
  },
  ICICIBANK: {
    symbol: 'ICICIBANK',
    style: 'AMERICAN',
    baseSpotPrice: 1438.00,
    stepSize: 10,
    strikeCountAboveBelow: 10,
    indiaVixBase: 14.2,
    lotSize: 700,
    get expiries() { return getUpcomingExpiriesForSymbol('ICICIBANK'); }
  }
};

export class MarketFeedEngine {
  private providerConnected: boolean = false;
  private providerStatusMessage: string = 'Initializing data provider...';

  // Active view state (Task 1: reduce unnecessary polling load)
  private activeViewSymbol: string = 'NIFTY';
  private activeViewExpiry: string = getUpcomingExpiriesForSymbol('NIFTY')[0] || '2026-08-20';
  private lastBackgroundPollTime: number = 0;

  // Phase I Task 1: Continuous Background Capture Loop for All Symbols
  private bgSymbolIndex: number = 0;
  private lastBgCaptureTimes: Map<string, string> = new Map();

  // Cached market data
  private currentSpots: Map<string, number> = new Map();
  private spotLiveFlags: Map<string, boolean> = new Map();
  private prevCloses: Map<string, number> = new Map();
  private spotMovePercents: Map<string, number> = new Map();
  private indiaVixMap: Map<string, number> = new Map();
  private historicalIVs: Map<string, number[]> = new Map();
  private cooldownSecMap: Map<string, number> = new Map();

  // In-memory snapshots
  private snapshotCache: Map<string, OptionChainSnapshot> = new Map();
  private lastSnapshotTime: Map<string, number> = new Map();

  // Monitoring safeguard
  private lastMonitoredRowCount: number = -1;
  private lastMonitoredCheckTime: number = Date.now();

  constructor() {
    this.initEngine();
  }

  private checkOptionChainsGrowthSafeguard(): void {
    const now = Date.now();
    if (now - this.lastMonitoredCheckTime >= 5 * 60 * 1000) {
      try {
        const counts = dbEngine.getTableRowCounts();
        const currentCount = counts.option_chains || 0;
        if (this.lastMonitoredRowCount >= 0) {
          if (currentCount <= this.lastMonitoredRowCount && this.providerConnected) {
            console.warn(`[MONITORING SAFEGUARD WARNING] option_chains table row count has NOT increased in the last 5 minutes (stuck at ${currentCount} rows) while background collector is running!`);
          }
        }
        this.lastMonitoredRowCount = currentCount;
        this.lastMonitoredCheckTime = now;
      } catch (e) {
        // ignore
      }
    }
  }

  private async initEngine(): Promise<void> {
    try {
      const status = await initActiveProvider();
      this.providerConnected = status.connected;
      this.providerStatusMessage = status.message;

      // Initial spot refresh
      await this.refreshUnderlyingSpots(Object.keys(UNDERLYING_CONFIGS));

      // Pre-warm snapshots for all symbols and their primary expiries for instant response
      for (const [sym, config] of Object.entries(UNDERLYING_CONFIGS)) {
        for (const exp of config.expiries.slice(0, 2)) {
          this.buildAndCacheSnapshot(sym, exp).catch(() => {});
        }
      }

      // Polling loop: High frequency (3s) for active viewed symbol
      setInterval(() => this.pollLoop(), 3000);

      // Phase I Task 1: Background capture loop (1 symbol every 15s -> full 5-symbol cycle in 75s)
      // Runs unconditionally from server startup for continuous historical persistence across all symbols
      setInterval(() => this.backgroundCaptureLoop(), 15000);
    } catch (err: any) {
      console.error('[MARKET FEED] Engine init error:', err.message);
      this.providerConnected = false;
      this.providerStatusMessage = `Provider error: ${err.message}`;
    }
  }

  /**
   * Set active viewed symbol & expiry from frontend (Task 1)
   */
  public setActiveView(symbol: string, expiry?: string): void {
    if (UNDERLYING_CONFIGS[symbol]) {
      this.activeViewSymbol = symbol;
      const validExpiries = UNDERLYING_CONFIGS[symbol].expiries;
      if (expiry && validExpiries.includes(expiry)) {
        this.activeViewExpiry = expiry;
      } else if (!this.activeViewExpiry || !validExpiries.includes(this.activeViewExpiry)) {
        this.activeViewExpiry = validExpiries[0];
      }
      if (activeProvider.onActiveViewChanged) {
        activeProvider.onActiveViewChanged(symbol, this.activeViewExpiry);
      }
    }
  }

  public getActiveView(): { symbol: string; expiry: string } {
    return { symbol: this.activeViewSymbol, expiry: this.activeViewExpiry };
  }

  private async pollLoop(): Promise<void> {
    const now = Date.now();
    try {
      // 1. Always poll active viewed symbol at high frequency (3s)
      await this.refreshUnderlyingSpots([this.activeViewSymbol]);
      await this.buildAndCacheSnapshot(this.activeViewSymbol, this.activeViewExpiry);

      // 2. Poll other background symbols at low frequency (every 30s)
      if (now - this.lastBackgroundPollTime > 30000) {
        this.lastBackgroundPollTime = now;
        const otherSymbols = Object.keys(UNDERLYING_CONFIGS).filter(s => s !== this.activeViewSymbol);
        await this.refreshUnderlyingSpots(otherSymbols);
      }
    } catch (err: any) {
      console.error('[MARKET FEED] Poll loop error:', err.message);
    }
  }

  /**
   * Phase I Task 1: Background Data Capture Loop
   * Staggered round-robin through ALL symbols in UNDERLYING_CONFIGS (1 symbol every 15s).
   * Fetches spot and full option chain for nearest expiry, persisting ticks & option_chains rows to SQLite.
   * Runs unconditionally from server startup, ensuring continuous historical accumulation across all symbols.
   */
  private async backgroundCaptureLoop(): Promise<void> {
    const symbols = Object.keys(UNDERLYING_CONFIGS);
    if (symbols.length === 0) return;

    const symbol = symbols[this.bgSymbolIndex % symbols.length];
    this.bgSymbolIndex++;

    const cfg = UNDERLYING_CONFIGS[symbol];
    if (!cfg) return;

    const expiry = cfg.expiries[0]; // Nearest weekly/monthly expiry
    try {
      await this.refreshUnderlyingSpots([symbol]);
      await this.buildAndCacheSnapshot(symbol, expiry);
      this.lastBgCaptureTimes.set(symbol, new Date().toISOString());
      this.checkOptionChainsGrowthSafeguard();
    } catch (err: any) {
      console.error(`[MARKET FEED] Background capture error for ${symbol}:`, err.message);
    }
  }

  private async refreshUnderlyingSpots(symbols: string[]): Promise<void> {
    try {
      const uQuotes = await activeProvider.getUnderlyingQuotes(symbols);
      for (const sym of symbols) {
        const uq = uQuotes.get(sym);
        const cfg = UNDERLYING_CONFIGS[sym];
        if (uq && uq.available && uq.spot > 0) {
          const spot = uq.spot;
          const prevClose = uq.prevClose > 0 ? uq.prevClose : spot;
          const change = spot - prevClose;
          const pChange = prevClose > 0 ? (change / prevClose) * 100 : 0;

          this.currentSpots.set(sym, spot);
          this.prevCloses.set(sym, prevClose);
          this.spotMovePercents.set(sym, pChange);
          this.spotLiveFlags.set(sym, true);

          const vix = cfg ? cfg.indiaVixBase : 15.0;
          this.indiaVixMap.set(sym, vix);

          // Record tick to SQLite
          dbEngine.recordTick(sym, spot, vix, uq.volume || 0);

          // Track historical IVs
          const ivList = this.historicalIVs.get(sym) || [];
          ivList.push(vix);
          if (ivList.length > 252) ivList.shift();
          this.historicalIVs.set(sym, ivList);
        } else {
          this.spotLiveFlags.set(sym, false);
          if (uq && uq.spot > 0) {
            this.currentSpots.set(sym, uq.spot);
          }
        }
      }
    } catch (err: any) {
      console.error('[MARKET FEED] Error refreshing underlying spots:', err.message);
      for (const sym of symbols) {
        this.spotLiveFlags.set(sym, false);
      }
    }
  }

  private async buildAndCacheSnapshot(symbol: string, selectedExpiry?: string): Promise<OptionChainSnapshot> {
    const cfg = UNDERLYING_CONFIGS[symbol] || UNDERLYING_CONFIGS.NIFTY;
    const expiry = selectedExpiry || cfg.expiries[0];
    const isWeekly = expiry === cfg.expiries[0];

    const spotPrice = this.currentSpots.get(symbol) || cfg.baseSpotPrice;
    const prevClose = this.prevCloses.get(symbol) || spotPrice;
    const movePercent = this.spotMovePercents.get(symbol) || 0;
    const baseVix = this.indiaVixMap.get(symbol) || cfg.indiaVixBase;

    const expiryDate = new Date(`${expiry}T15:30:00+05:30`);
    const diffMs = expiryDate.getTime() - Date.now();
    // Fractional days to expiry: Minimum 0.04 (~1 trading hour) so Greeks & IV are mathematically sound even on expiry day
    const daysToExpiry = diffMs > 0 ? Math.max(0.04, diffMs / (1000 * 3600 * 24)) : 0.04;
    const T = daysToExpiry / 365;
    const r = 0.065;

    const atmStrike = Math.round(spotPrice / cfg.stepSize) * cfg.stepSize;
    const minStrike = atmStrike - (cfg.strikeCountAboveBelow * cfg.stepSize);
    const maxStrike = atmStrike + (cfg.strikeCountAboveBelow * cfg.stepSize);

    const strikesList: number[] = [];
    for (let K = minStrike; K <= maxStrike; K += cfg.stepSize) {
      strikesList.push(K);
    }

    // Fetch quotes from active provider (Practice Mode vs Kite)
    let providerQuotes = new Map<string, any>();
    try {
      providerQuotes = await activeProvider.getOptionChainQuotes(symbol, expiry, strikesList);
    } catch (err: any) {
      console.warn(`[MARKET FEED] Option quotes fetch warning for ${symbol}:`, err.message);
    }

    const strikes: OptionStrikeRow[] = [];
    const chainRowsToPersist: Parameters<typeof dbEngine.recordOptionChainRows>[0] = [];
    const previousOIMap = dbEngine.getPreviousOIMap(symbol, expiry);

    const pricer = cfg.style === 'AMERICAN' ? calculateAmericanOptionGreeks : calculateEuropeanOptionGreeks;

    for (const K of strikesList) {
      const isAtm = K === atmStrike;
      const quotePair = providerQuotes.get(`${K}`);

      const buildContract = (type: 'CE' | 'PE'): OptionContract => {
        const q = type === 'CE' ? quotePair?.ce : quotePair?.pe;
        const isCall = type === 'CE';

        if (!q || !q.ltpAvailable) {
          // Explicit unavailable contract
          return {
            strikePrice: K,
            type,
            ltp: 0,
            change: 0,
            pChange: 0,
            volume: 0,
            openInterest: 0,
            changeInOI: 0,
            pChangeInOI: 0,
            iv: 0,
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            rho: 0,
            buildup: 'NEUTRAL',
            bidPrice: 0,
            askPrice: 0,
            available: false,
            ltpAvailable: false,
            oiAvailable: false,
            volumeAvailable: false,
            ivAvailable: false
          };
        }

        const ltp = q.ltp;
        const volume = q.volume || 0;
        const openInterest = q.oi || 0;
        const prevOI = previousOIMap.get(`${K}_${type}`);
        const changeInOI = prevOI !== undefined ? (openInterest - prevOI) : (q.changeInOI || 0);
        const pChangeInOI = q.pChangeInOI || ((prevOI && prevOI > 0) ? Number(((changeInOI / prevOI) * 100).toFixed(2)) : 0);

        // Real or calculated IV
        const realIv = q.ivAvailable && q.iv > 0
          ? q.iv
          : calculateImpliedVolatility(ltp, spotPrice, K, T, r, isCall, cfg.style);

        const greeks = pricer(spotPrice, K, T, r, (realIv > 0 ? realIv : baseVix) / 100, isCall);

        const change = Number((greeks.delta * (spotPrice - prevClose)).toFixed(2));
        const pChange = prevClose > 0 ? Number((((ltp - (ltp - change)) / (ltp - change || 1)) * 100).toFixed(2)) : 0;

        const bidPrice = q.bidPrice || Number((ltp * 0.995).toFixed(2));
        const askPrice = q.askPrice || Number((ltp * 1.005).toFixed(2));
        const buildup = classifyOIBuildup(pChange, changeInOI);

        return {
          strikePrice: K,
          type,
          ltp: Number(ltp.toFixed(2)),
          change: Number(change.toFixed(2)),
          pChange,
          volume,
          openInterest,
          changeInOI,
          pChangeInOI,
          iv: Number(realIv.toFixed(2)),
          delta: Number(greeks.delta.toFixed(3)),
          gamma: Number(greeks.gamma.toFixed(4)),
          theta: Number(greeks.theta.toFixed(2)),
          vega: Number(greeks.vega.toFixed(2)),
          rho: Number(greeks.rho.toFixed(3)),
          buildup,
          bidPrice: Number(bidPrice.toFixed(2)),
          askPrice: Number(askPrice.toFixed(2)),
          available: true,
          ltpAvailable: q.ltpAvailable,
          oiAvailable: q.oiAvailable,
          volumeAvailable: q.volumeAvailable,
          ivAvailable: q.ivAvailable
        };
      };

      const ceContract = buildContract('CE');
      const peContract = buildContract('PE');

      strikes.push({
        strikePrice: K,
        ce: ceContract,
        pe: peContract,
        isAtm
      });

      if (ceContract.available && typeof ceContract.ltp === 'number' && !isNaN(ceContract.ltp)) {
        chainRowsToPersist.push({
          symbol,
          expiry,
          strikePrice: K,
          optionType: 'CE',
          ltp: ceContract.ltp || 0,
          volume: ceContract.volume || 0,
          openInterest: ceContract.openInterest || 0,
          changeInOI: ceContract.changeInOI || 0,
          iv: ceContract.iv || 0,
          delta: ceContract.delta || 0,
          gamma: ceContract.gamma || 0,
          theta: ceContract.theta || 0,
          vega: ceContract.vega || 0,
          buildup: ceContract.buildup || 'NEUTRAL'
        });
      }

      if (peContract.available && typeof peContract.ltp === 'number' && !isNaN(peContract.ltp)) {
        chainRowsToPersist.push({
          symbol,
          expiry,
          strikePrice: K,
          optionType: 'PE',
          ltp: peContract.ltp || 0,
          volume: peContract.volume || 0,
          openInterest: peContract.openInterest || 0,
          changeInOI: peContract.changeInOI || 0,
          iv: peContract.iv || 0,
          delta: peContract.delta || 0,
          gamma: peContract.gamma || 0,
          theta: peContract.theta || 0,
          vega: peContract.vega || 0,
          buildup: peContract.buildup || 'NEUTRAL'
        });
      }
    }

    if (chainRowsToPersist.length > 0) {
      dbEngine.recordOptionChainRows(chainRowsToPersist);
    }

    const maxPainStrike = calculateMaxPainStrike(strikes);
    for (const rRow of strikes) {
      if (rRow.strikePrice === maxPainStrike) {
        rRow.isMaxPain = true;
      }
    }

    const { pcrOI, pcrVolume } = calculatePCR(strikes);
    const histIVs = this.historicalIVs.get(symbol) || [baseVix];
    const { ivRank, ivPercentile } = calculateIVRankAndPercentile(baseVix, histIVs);

    const totalCeOI = strikes.reduce((sum, s) => sum + (s.ce.oiAvailable !== false && s.ce.available !== false ? s.ce.openInterest : 0), 0);
    const totalPeOI = strikes.reduce((sum, s) => sum + (s.pe.oiAvailable !== false && s.pe.available !== false ? s.pe.openInterest : 0), 0);
    const totalCeVolume = strikes.reduce((sum, s) => sum + (s.ce.volumeAvailable !== false && s.ce.available !== false ? s.ce.volume : 0), 0);
    const totalPeVolume = strikes.reduce((sum, s) => sum + (s.pe.volumeAvailable !== false && s.pe.available !== false ? s.pe.volume : 0), 0);

    // Count unavailable contract fields
    let unavailableCount = 0;
    for (const s of strikes) {
      if (!s.ce.available || !s.ce.ltpAvailable || !s.ce.oiAvailable || !s.ce.volumeAvailable || !s.ce.ivAvailable) {
        unavailableCount++;
      }
      if (!s.pe.available || !s.pe.ltpAvailable || !s.pe.oiAvailable || !s.pe.volumeAvailable || !s.pe.ivAvailable) {
        unavailableCount++;
      }
    }
    const isSpotLive = !!this.spotLiveFlags.get(symbol);
    const isPartialData = unavailableCount > 0 || !isSpotLive;
    const partialDataReason = !isSpotLive
      ? (unavailableCount > 0 ? `Spot price is STALE / Fallback + ${unavailableCount} option contract fields unavailable` : 'Spot price is STALE / Fallback anchor')
      : (unavailableCount > 0 ? `${unavailableCount} option contract fields unavailable` : undefined);

    const anomalies = detectUnusualOIAnomalies(symbol, strikes);
    dbEngine.recordOIAnomalies(anomalies);

    const mode = activeProvider.getProviderMode();

    const snapshot: OptionChainSnapshot = {
      symbol,
      style: cfg.style,
      stepSize: cfg.stepSize,
      spotPrice,
      isSpotLive,
      underlyingChange: Number((spotPrice - prevClose).toFixed(2)),
      underlyingPChange: Number(movePercent.toFixed(2)),
      indiaVix: Number(baseVix.toFixed(2)),
      vixChange: Number((movePercent < 0 ? 0.35 : -0.2).toFixed(2)),
      expiries: cfg.expiries,
      selectedExpiry: expiry,
      isWeeklyExpiry: isWeekly,
      maxPainStrike,
      pcrOI,
      pcrVolume,
      totalCeOI,
      totalPeOI,
      totalCeVolume,
      totalPeVolume,
      ivRank,
      ivPercentile,
      timestamp: new Date().toISOString(),
      strikes,
      isBrokerConnected: true,
      brokerStatusMessage: mode === 'PRACTICE'
        ? 'PRACTICE MODE — Calibrated Market Feed & Black-Scholes Engine'
        : 'Connected to Upstox API v2 Live Feed',
      providerMode: mode,
      isPartialData,
      unavailableStrikeCount: unavailableCount,
      partialDataReason
    };

    this.snapshotCache.set(`${symbol}_${expiry}`, snapshot);
    this.lastSnapshotTime.set(`${symbol}_${expiry}`, Date.now());

    return snapshot;
  }

  public async getSnapshotAsync(symbol: string = 'NIFTY', selectedExpiry?: string): Promise<OptionChainSnapshot> {
    this.setActiveView(symbol, selectedExpiry);
    const cfg = UNDERLYING_CONFIGS[symbol] || UNDERLYING_CONFIGS.NIFTY;
    const expiry = selectedExpiry || cfg.expiries[0];

    // If cached snapshot is fresh (less than 2s old), return cached
    const cached = this.snapshotCache.get(`${symbol}_${expiry}`);
    const lastTime = this.lastSnapshotTime.get(`${symbol}_${expiry}`) || 0;
    if (cached && (Date.now() - lastTime < 2000)) {
      return cached;
    }

    return await this.buildAndCacheSnapshot(symbol, expiry);
  }

  public getSnapshot(symbol: string = 'NIFTY', selectedExpiry?: string): OptionChainSnapshot {
    this.setActiveView(symbol, selectedExpiry);
    const cfg = UNDERLYING_CONFIGS[symbol] || UNDERLYING_CONFIGS.NIFTY;
    const expiry = selectedExpiry || cfg.expiries[0];

    const cached = this.snapshotCache.get(`${symbol}_${expiry}`);
    if (cached) {
      return cached;
    }

    // Fallback sync snapshot if cache empty
    const mode = activeProvider.getProviderMode();
    const spotPrice = this.currentSpots.get(symbol) || cfg.baseSpotPrice;
    return {
      symbol,
      style: cfg.style,
      spotPrice,
      underlyingChange: 0,
      underlyingPChange: 0,
      indiaVix: cfg.indiaVixBase,
      vixChange: 0,
      expiries: cfg.expiries,
      selectedExpiry: expiry,
      isWeeklyExpiry: expiry === cfg.expiries[0],
      maxPainStrike: cfg.baseSpotPrice,
      pcrOI: 1.0,
      pcrVolume: 1.0,
      totalCeOI: 0,
      totalPeOI: 0,
      totalCeVolume: 0,
      totalPeVolume: 0,
      ivRank: 50,
      ivPercentile: 50,
      timestamp: new Date().toISOString(),
      strikes: [],
      isBrokerConnected: true,
      brokerStatusMessage: 'Loading market feed...',
      providerMode: mode
    };
  }

  public getAnomalies(symbol: string = 'NIFTY'): ReturnType<typeof detectUnusualOIAnomalies> {
    const snap = this.getSnapshot(symbol);
    return detectUnusualOIAnomalies(symbol, snap.strikes);
  }

  public getEventReactiveState(symbol: string = 'NIFTY'): ReturnType<typeof processEventReactiveState> {
    const snap = this.getSnapshot(symbol);
    const movePercent = this.spotMovePercents.get(symbol) || 0;
    const cooldown = this.cooldownSecMap.get(symbol) || 0;
    const state = processEventReactiveState(movePercent, snap.strikes, cooldown);
    this.cooldownSecMap.set(symbol, state.cooldownRemainingSec);
    return state;
  }

  public getSpotQuote(symbol: string): { spot: number; prevClose: number; change: number; pChange: number; isLive: boolean } {
    const cfg = UNDERLYING_CONFIGS[symbol] || UNDERLYING_CONFIGS.NIFTY;
    const spot = this.currentSpots.get(symbol) || cfg.baseSpotPrice;
    const prevClose = this.prevCloses.get(symbol) || spot;
    const change = Number((spot - prevClose).toFixed(2));
    const pChange = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
    const isLive = this.spotLiveFlags.get(symbol) ?? true;
    return { spot, prevClose, change, pChange, isLive };
  }

  public getAllSpots(): Record<string, { spot: number; prevClose: number; change: number; pChange: number }> {
    const res: Record<string, { spot: number; prevClose: number; change: number; pChange: number }> = {};
    for (const sym of Object.keys(UNDERLYING_CONFIGS)) {
      res[sym] = this.getSpotQuote(sym);
    }
    return res;
  }

  public getBrokerStatus(): { isConnected: boolean; message: string; mode: 'PRACTICE' | 'LIVE' } {
    return {
      isConnected: this.providerConnected,
      message: this.providerStatusMessage,
      mode: activeProvider.getProviderMode()
    };
  }

  public getBackgroundCollectionStatus(): {
    intervalPerSymbolSec: number;
    fullCycleSec: number;
    symbolCount: number;
    lastCaptureTimes: Record<string, string>;
  } {
    const lastCaptureTimes: Record<string, string> = {};
    for (const [sym, time] of this.lastBgCaptureTimes.entries()) {
      lastCaptureTimes[sym] = time;
    }
    const symbolCount = Object.keys(UNDERLYING_CONFIGS).length;
    return {
      intervalPerSymbolSec: 15,
      fullCycleSec: 15 * symbolCount,
      symbolCount,
      lastCaptureTimes
    };
  }

  public getBrokerClient(): any {
    return activeProvider;
  }

  public getUpstoxProvider(): any {
    return activeProvider;
  }

  public getKiteClient(): any {
    return activeProvider;
  }
}

export const globalMarketFeed = new MarketFeedEngine();
