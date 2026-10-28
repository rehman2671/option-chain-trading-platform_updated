/**
 * 15-Minute 23 EMA / 50 EMA Crossover Alert Engine
 * Dedicated analytical signal generator for NIFTY 50, BANK NIFTY, and SENSEX.
 * Strictly 15-Minute candle closes. Isolated from trade execution.
 */

import { dbEngine } from '../db.js';
import { globalNotificationService } from './notificationService.js';
import { fetchYahooHistoricalCandles, generateRealisticMarketCandles } from './historicalService.js';
import {
  Ema15mInstrument,
  Ema15mCandle,
  Ema15mSignal,
  Ema15mInstrumentStatus,
  Ema15mBacktestConfig,
  Ema15mBacktestResult,
  Ema15mBacktestTrade,
  EmaPaperTrade
} from '../../types.js';
import { EMA_15M_INSTRUMENTS, getInstrumentConfig } from '../../shared/marketConfig.js';
import { tradeReviewEngine } from '../../quant/learning/tradeReviewEngine.js';
import { ContractMaster } from '../../quant/data/contractMaster.js';
import { ExpiryResolver } from '../../quant/data/expiryResolver.js';
import { calculateEuropeanOptionGreeks } from './blackScholes.js';

export class Ema15mEngine {
  private static instance: Ema15mEngine | null = null;
  private readonly INSTRUMENTS: readonly Ema15mInstrument[] = EMA_15M_INSTRUMENTS;

  // EMA Constants
  public readonly EMA_23_PERIOD = 23;
  public readonly EMA_50_PERIOD = 50;
  public readonly EMA_23_MULTIPLIER = 2 / (23 + 1); // 2 / 24 = 0.08333333333333333
  public readonly EMA_50_MULTIPLIER = 2 / (50 + 1); // 2 / 51 = 0.0392156862745098

  // In-memory active (forming) candle per instrument
  private activeCandles: Map<Ema15mInstrument, Ema15mCandle> = new Map();
  // In-memory cache of completed candles (sorted chronological)
  private candleCache: Map<Ema15mInstrument, Ema15mCandle[]> = new Map();
  private lastAutoSyncMap: Map<string, number> = new Map();
  // Engine running state
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  // Data Provider Source Tracking
  private dataSource: 'UPSTOX_LIVE' | 'PRACTICE' | 'LIVE_DATA_UNAVAILABLE' = 'PRACTICE';
  private dataSourceMessage: string = 'Calibrated Real-time NSE/BSE Practice Feed';

  // Indian Stock Market Holidays (YYYY-MM-DD)
  private readonly MARKET_HOLIDAYS = new Set([
    '2026-01-26', // Republic Day
    '2026-03-03', // Holi
    '2026-03-20', // Id-Ul-Fitr
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-27', // Bakri Id
    '2026-08-15', // Independence Day
    '2026-09-04', // Janmashtami
    '2026-10-02', // Mahatma Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-08', // Diwali Laxmi Pujan
    '2026-11-10', // Diwali Balipratipada
    '2026-11-24', // Gurunanak Jayanti
    '2026-12-25'  // Christmas
  ]);

  private constructor() {
    for (const inst of this.INSTRUMENTS) {
      this.candleCache.set(inst, []);
    }
  }

  public static getInstance(): Ema15mEngine {
    if (!Ema15mEngine.instance) {
      Ema15mEngine.instance = new Ema15mEngine();
    }
    return Ema15mEngine.instance;
  }

  /**
   * Initializes the engine, boots history from database, and seeds if needed.
   */
  public async initialize(): Promise<void> {
    console.log('[EMA 15M ENGINE] Initializing 15-Minute 23/50 EMA Alert System...');

    for (const inst of this.INSTRUMENTS) {
      // Sanitize any corrupted historical prices (e.g. SENSEX price cross-contamination)
      if (inst === 'SENSEX') {
        dbEngine.purgeCorruptEmaCandles('SENSEX', 50000);
      } else if (inst === 'BANKNIFTY') {
        dbEngine.purgeCorruptEmaCandles('BANKNIFTY', 35000);
      }

      let candles = dbEngine.getEma15mCandles(inst, 2000);
      const isFlatVolume = candles.length > 0 && candles.slice(0, 20).every(c => c.volume === 15000 || !c.volume);
      const lastCandle = candles[candles.length - 1];
      const isStale = !lastCandle || (Date.now() - new Date(lastCandle.timestamp).getTime() > 24 * 60 * 60 * 1000);

      if (candles.length < 100 || isFlatVolume || isStale) {
        // Real market sync without fake generator (fetch 1 month of authentic 15m exchange candles)
        this.syncRealMarketData(inst, 600).catch(err => {
          console.warn(`[EMA 15M ENGINE] Initial sync note for ${inst}:`, err.message);
        });
      } else {
        this.recalculateAllIndicators(candles);
        this.candleCache.set(inst, candles);
        console.log(`[EMA 15M ENGINE] Loaded ${candles.length} real candles for ${inst}. Latest Close: ₹${candles[candles.length - 1]?.close}`);
      }
    }

    this.startEvaluationLoop();
    this.isRunning = true;
  }

  /**
   * Syncs authentic exchange market candles from Yahoo Finance and stores in SQLite
   */
  public async syncRealMarketData(inst: Ema15mInstrument, count: number = 600): Promise<Ema15mCandle[]> {
    let candles: Ema15mCandle[] = [];

    try {
      // Fetch real 15m exchange candles from Yahoo Finance (1 month range = ~550-600 candles, ~22 trading days)
      const yahooCandles = await fetchYahooHistoricalCandles(inst, '15m', '1mo');
      if (yahooCandles && yahooCandles.length > 0) {
        candles = yahooCandles.map(c => ({
          instrument: inst,
          timeframe: '15m',
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          isClosed: true
        }));
        console.log(`[EMA 15M ENGINE] Successfully synchronized ${candles.length} genuine exchange candles for ${inst}`);
      }
    } catch (err: any) {
      console.warn(`[EMA 15M ENGINE] Yahoo fetch for ${inst}:`, err.message);
    }

    if (candles.length > 0) {
      this.recalculateAllIndicators(candles);
      dbEngine.saveEma15mCandlesBatch(candles);
      this.candleCache.set(inst, candles);
      return candles;
    }

    // If fetch failed, return existing stored candles without generating fake ones
    const existing = dbEngine.getEma15mCandles(inst, count);
    if (existing.length > 0) {
      this.recalculateAllIndicators(existing);
      this.candleCache.set(inst, existing);
      return existing;
    }

    return [];
  }

  /**
   * Sets current market data provider source status (e.g. UPSTOX_LIVE, PRACTICE, LIVE_DATA_UNAVAILABLE)
   */
  public setDataSource(source: 'UPSTOX_LIVE' | 'PRACTICE' | 'LIVE_DATA_UNAVAILABLE', message?: string): void {
    this.dataSource = source;
    if (message) {
      this.dataSourceMessage = message;
    }
  }

  public getDataSource(): { source: 'UPSTOX_LIVE' | 'PRACTICE' | 'LIVE_DATA_UNAVAILABLE'; message: string } {
    return {
      source: this.dataSource,
      message: this.dataSourceMessage
    };
  }

  /**
   * Starts periodic market check & candle aggregator loop (runs every 3 seconds)
   */
  private startEvaluationLoop(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer);

    this.intervalTimer = setInterval(() => {
      try {
        this.evaluateCandleBoundaries();
      } catch (err: any) {
        console.error('[EMA 15M ENGINE] Error in evaluation loop:', err.message);
      }
    }, 3000);
    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  /**
   * Ingests a new live spot tick for an instrument (from MarketFeed or WebSocket)
   */
  public ingestTick(instrument: Ema15mInstrument, price: number, volume: number = 0, timestamp: Date = new Date()): void {
    if (!price || price <= 0) return;

    // Sanity boundary check to prevent symbol cross-pollution using dynamic instrument configs
    const cfg = getInstrumentConfig(instrument);
    if (cfg && cfg.baseSpotPrice > 0) {
      const minSafe = cfg.baseSpotPrice * 0.4;
      const maxSafe = cfg.baseSpotPrice * 2.5;
      if (price < minSafe || price > maxSafe) {
        console.warn(`[EMA 15M ENGINE] Rejected out-of-range tick for ${instrument}: ₹${price} (Expected ₹${minSafe.toFixed(0)} - ₹${maxSafe.toFixed(0)})`);
        return;
      }
    }

    // Strict Market Hours Check: Never alter live candles when market is closed (unless in PRACTICE mode)
    const marketHours = this.getMarketHoursStatus();
    if (!marketHours.isMarketOpen && this.dataSource !== 'PRACTICE') {
      return;
    }

    // 1. Immediately update live mark-to-market P&L on all OPEN paper positions for this instrument via batching
    this.updateOpenPaperTrades(instrument, price);

    const currentSlotTime = this.get15mSlotBoundary(timestamp);
    const active = this.activeCandles.get(instrument);

    if (!active || active.timestamp !== currentSlotTime) {
      // If we have an active candle from a previous 15m slot, close it first
      if (active && active.timestamp !== currentSlotTime) {
        this.finalizeCandle(active);
        this.activeCandles.delete(instrument);
      }

      // Start new 15m forming candle
      const newCandle: Ema15mCandle = {
        instrument,
        timeframe: '15m',
        timestamp: currentSlotTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume || 100,
        isClosed: false
      };
      this.activeCandles.set(instrument, newCandle);
    } else {
      // Update forming candle
      active.high = Math.max(active.high, price);
      active.low = Math.min(active.low, price);
      active.close = price;
      active.volume = (active.volume || 0) + (volume || 1);
    }
  }

  /**
   * Periodically checks if the current time has crossed into a new 15-minute slot
   * Guaranteed to finalize candles even if market just closed (e.g. 15:30:00 IST close)
   */
  private evaluateCandleBoundaries(): void {
    const now = new Date();
    const currentSlot = this.get15mSlotBoundary(now);

    for (const inst of this.INSTRUMENTS) {
      const active = this.activeCandles.get(inst);
      if (active && active.timestamp !== currentSlot) {
        // Candle time passed: close it and evaluate crossover
        this.finalizeCandle(active);
        this.activeCandles.delete(inst);
      }
    }

    // Evaluate forced intraday square-off for MIS positions
    this.checkForcedIntradaySquareOff();
  }

  /**
   * Resolves the nearest upcoming valid weekly expiry dynamically from the broker instrument master/option chain.
   * Never hardcodes the expiry date.
   */
  public resolveNearestWeeklyExpiry(inst: Ema15mInstrument, referenceDate: Date = new Date()): string {
    try {
      const availableDates = dbEngine.getAvailableOptionExpiries(inst);
      const res = ExpiryResolver.resolve(inst as any, availableDates, referenceDate);
      return res.currentExpiry;
    } catch {
      // Direct calendar resolution for weekly expiry
      const res = ExpiryResolver.resolve(inst as any, [], referenceDate);
      return res.currentExpiry;
    }
  }

  /**
   * Retrieves live option LTP from database/feed or computes Black-Scholes estimate
   */
  public getEstimatedOptionPrice(
    instrument: Ema15mInstrument,
    strikePrice: number,
    optionType: 'CE' | 'PE',
    expiry: string,
    spotPrice: number
  ): number {
    try {
      const ltp = dbEngine.getHistoricalOptionLtp(instrument, expiry, strikePrice, optionType, new Date().toISOString());
      if (ltp !== null && ltp > 0) {
        return Number(ltp.toFixed(2));
      }
    } catch {}

    const expDate = new Date(expiry);
    const now = new Date();
    const diffDays = Math.max(0.2, (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const T = diffDays / 365;
    const r = 0.065;
    const sigma = 0.14; // ~14% ATM IV
    const isCall = optionType === 'CE';

    const greeks = calculateEuropeanOptionGreeks(spotPrice, strikePrice, T, r, sigma, isCall);
    const estimated = Math.max(25, Number(greeks.price.toFixed(2)));
    return estimated;
  }

  /**
   * Evaluates forced intraday square-off for MIS/Intraday positions
   * Rule 12: Never carry a position overnight. Close at configured force-square-off time.
   */
  public checkForcedIntradaySquareOff(): void {
    const marketHours = this.getMarketHoursStatus();
    if (!marketHours.isMarketOpen && this.dataSource !== 'PRACTICE') return;

    const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
    const forceTime = settings.forceSquareOffTime || '15:15';
    const currentTimeStr = marketHours.istTime.split(' ')[0]; // "HH:mm"

    if (currentTimeStr >= forceTime && currentTimeStr < '15:30') {
      const openTrades = dbEngine.getOpenEmaPaperTrades('ALL');
      if (openTrades.length === 0) return;

      console.log(`[EMA 15M INTRADAY] ⏰ Reached force square-off time (${currentTimeStr} >= ${forceTime} IST). Closing ${openTrades.length} open MIS position(s)...`);

      for (const trade of openTrades) {
        const exitPrice = trade.currentPrice || trade.entryPrice;
        dbEngine.closeEmaPaperTrade(trade.id, exitPrice, 'FORCED_INTRADAY_SQUARE_OFF', new Date().toISOString());
        console.log(`[EMA 15M INTRADAY] 🛑 Forced Intraday Square-Off: Closed trade ${trade.id} on ${trade.instrument} ${trade.strikePrice || ''} ${trade.optionType || ''} @ ₹${exitPrice}`);
      }
    }
  }

  /**
   * Finalizes a completed 15m candle, recalculates EMA series, and detects crossover signals
   */
  public finalizeCandle(candle: Ema15mCandle): void {
    candle.isClosed = true;

    const inst = candle.instrument;
    const history = this.candleCache.get(inst) || [];

    // Avoid duplicate slot in history
    const existingIdx = history.findIndex(c => c.timestamp === candle.timestamp);
    if (existingIdx >= 0) {
      history[existingIdx] = candle;
    } else {
      history.push(candle);
    }

    // Keep history sorted
    history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Calculate EMA series across the history
    this.recalculateEmaSeries(history);
    this.candleCache.set(inst, history);

    // Persist finalized candle to SQLite
    dbEngine.saveEma15mCandle(candle);

    // Crossover signal evaluation (requires at least 50 candles for valid EMA50)
    if (history.length >= this.EMA_50_PERIOD) {
      const lastIdx = history.length - 1;
      const curr = history[lastIdx];
      const prev = history[lastIdx - 1];

      if (prev && curr && prev.ema23 !== undefined && prev.ema50 !== undefined && curr.ema23 !== undefined && curr.ema50 !== undefined) {
        const signalType = this.evaluateCrossover(prev.ema23, prev.ema50, curr.ema23, curr.ema50);
        curr.signal = signalType;

        if (signalType !== 'NONE') {
          const cfg = getInstrumentConfig(inst);
          const stepSize = cfg ? cfg.stepSize : 50;
          const optionType: 'CE' | 'PE' = signalType === 'BULLISH' ? 'CE' : 'PE';

          // Directional ATM Strike Selection:
          // Bullish (CE): Nearest valid strike at or above current spot price (CEILING)
          // Bearish (PE): Nearest valid strike at or below current spot price (FLOOR)
          // Example: Spot 25,180 with step 50 -> CE = 25,200, PE = 25,150
          const selectedStrike = ContractMaster.getDirectionalAtmStrike(curr.close, optionType, stepSize);
          const weeklyExpiry = this.resolveNearestWeeklyExpiry(inst);

          const signalId = `ema-${inst}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const signal: Ema15mSignal = {
            id: signalId,
            instrument: inst,
            timeframe: '15m',
            signalType,
            price: curr.close,
            selectedStrike,
            optionType,
            weeklyExpiry,
            ema23: Number(curr.ema23.toFixed(2)),
            ema50: Number(curr.ema50.toFixed(2)),
            emaDifference: Number((curr.ema23 - curr.ema50).toFixed(2)),
            candleTimestamp: curr.timestamp,
            signalConfirmedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            notificationStatus: 'PENDING'
          };

          // Save signal with uniqueness constraint
          const isNewlyInserted = dbEngine.saveEma15mSignal(signal);

          if (isNewlyInserted) {
            console.log(`[EMA 15M ALERT] 🚀 Confirmed ${signalType} Crossover on ${inst} @ ₹${signal.price} | Strike: ${selectedStrike} ${optionType} (${weeklyExpiry}) (23 EMA: ${signal.ema23} | 50 EMA: ${signal.ema50})`);

            // 1. Execute Automatic Paper Trading with Directional ATM Strike & Weekly Expiry
            this.processAutoPaperTrade(signal);

            // 2. Dispatch notifications asynchronously
            globalNotificationService.dispatchSignalAlerts(signal).catch(err => {
              console.error(`[EMA 15M ALERT] Error dispatching alerts:`, err.message);
            });
          } else {
            console.log(`[EMA 15M ENGINE] Suppressed duplicate signal on ${inst} for slot ${curr.timestamp}`);
          }
        }
      }
    }
  }

  /**
   * Automatic Trading Engine for NIFTY 50 15-Minute 23/50 EMA Strategy
   * Rules:
   * - Triggered ONLY upon confirmed 15m candle close
   * - Exactly 1 lot only
   * - Product Type: MIS / Intraday
   * - Directional ATM Strike Selection (CE >= Spot, PE <= Spot)
   * - Weekly Expiry Only
   * - Bullish SL = Entry - 30, Target = Entry + 100
   * - Bearish SL = Entry + 30, Target = Entry - 100
   * - Maximum active position = 1 (No averaging, no pyramiding)
   * - Closes opposing open position upon reverse crossover
   */
  public processAutoPaperTrade(signal: Ema15mSignal): void {
    try {
      const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
      if (settings.autoPaperTradingEnabled === false) {
        console.log(`[EMA PAPER TRADING] Auto trading is disabled in settings. Skipping order creation for ${signal.instrument}`);
        return;
      }

      const cfg = getInstrumentConfig(signal.instrument);
      const lotSize = cfg ? cfg.lotSize : 25;
      const quantity = lotSize; // Exactly 1 standard lot
      const newDirection: 'LONG' | 'SHORT' = signal.signalType === 'BULLISH' ? 'LONG' : 'SHORT';
      const optionType: 'CE' | 'PE' = signal.optionType || (signal.signalType === 'BULLISH' ? 'CE' : 'PE');
      const stepSize = cfg ? cfg.stepSize : 50;

      // Directional ATM Strike
      const strikePrice = signal.selectedStrike || ContractMaster.getDirectionalAtmStrike(signal.price, optionType, stepSize);
      const weeklyExpiry = signal.weeklyExpiry || this.resolveNearestWeeklyExpiry(signal.instrument);

      // Check if an open position already exists for this instrument
      const existingOpen = dbEngine.getOpenEmaPaperTradeByInstrument(signal.instrument);

      if (existingOpen) {
        if (existingOpen.direction !== newDirection) {
          // Reversal: close the opposing trade at current option price
          const exitOptPrice = existingOpen.currentPrice || existingOpen.entryPrice;
          dbEngine.closeEmaPaperTrade(existingOpen.id, exitOptPrice, 'OPPOSITE_CROSSOVER', signal.signalConfirmedAt);
          try {
            const grossPnl = (exitOptPrice - existingOpen.entryPrice) * (existingOpen.quantity || 1);
            const netPnl = grossPnl - 40;
            tradeReviewEngine.recordFromEmaTrade(
              existingOpen,
              exitOptPrice,
              grossPnl,
              netPnl,
              'OPPOSITE_CROSSOVER',
              signal.signalConfirmedAt || new Date().toISOString()
            );
          } catch (revErr) {
            console.error('[EMA PAPER TRADING] Failed to record trade review:', revErr);
          }
          console.log(`[EMA PAPER TRADING] 🔄 Reversal: Closed ${existingOpen.direction} trade ${existingOpen.id} on ${signal.instrument} @ ₹${exitOptPrice} (Reason: OPPOSITE_CROSSOVER)`);
        } else {
          console.log(`[EMA PAPER TRADING] Position in direction ${newDirection} already open on ${signal.instrument}. Maintaining position (Rule: Max 1 active position, no averaging, no pyramiding).`);
          return;
        }
      }

      // Determine option entry price (actual average fill price)
      const optionEntryPrice = this.getEstimatedOptionPrice(signal.instrument, strikePrice, optionType, weeklyExpiry, signal.price);

      // Stop-loss & Target according to specifications
      // Bullish CE: SL = Entry - 30, Target = Entry + 100
      // Bearish PE: SL = Entry + 30, Target = Entry - 100
      let stopLoss: number;
      let targetPrice: number;

      if (optionType === 'CE') {
        stopLoss = Number((optionEntryPrice - 30).toFixed(2));
        targetPrice = Number((optionEntryPrice + 100).toFixed(2));
      } else {
        stopLoss = Number((optionEntryPrice + 30).toFixed(2));
        targetPrice = Number((optionEntryPrice - 100).toFixed(2));
      }

      // Create new 1-lot MIS Position
      const tradeId = `ema-pt-${signal.instrument.toLowerCase()}-${optionType.toLowerCase()}-${strikePrice}-${Date.now()}`;
      const source = this.dataSource === 'UPSTOX_LIVE' ? 'UPSTOX_LIVE' : 'PRACTICE';

      const newTrade: EmaPaperTrade = {
        id: tradeId,
        signalId: signal.id,
        instrument: signal.instrument,
        direction: newDirection,
        optionType,
        strikePrice,
        expiryDate: weeklyExpiry,
        productType: 'MIS',
        spotAtEntry: signal.price,
        stopLoss,
        targetPrice,
        orderId: `ORD-${Date.now()}`,
        brokerStatus: 'FILLED',
        entryTimestamp: signal.signalConfirmedAt || new Date().toISOString(),
        entryPrice: optionEntryPrice,
        quantity,
        lotSize,
        strategy: 'EMA_15M_23_50',
        source,
        status: 'OPEN',
        currentPrice: optionEntryPrice,
        unrealizedPnl: 0,
        grossPnl: 0,
        brokerage: 40,
        charges: 0,
        netPnl: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      dbEngine.saveEmaPaperTrade(newTrade);
      console.log(`[EMA TRADING] 🟢 Executed 1 Lot MIS BUY ${strikePrice} ${optionType} (${weeklyExpiry} Expiry) @ ₹${optionEntryPrice} on ${signal.instrument} (Spot: ₹${signal.price} | SL: ₹${stopLoss} | Target: ₹${targetPrice})`);
    } catch (err: any) {
      console.error(`[EMA PAPER TRADING] Error executing automatic paper trade:`, err.message);
    }
  }

  /**
   * Pure mathematical crossover detector
   * - Bullish: prev_ema23 <= prev_ema50 AND curr_ema23 > curr_ema50
   * - Bearish: prev_ema23 >= prev_ema50 AND curr_ema23 < curr_ema50
   */
  public evaluateCrossover(prevEma23: number, prevEma50: number, currEma23: number, currEma50: number): 'BULLISH' | 'BEARISH' | 'NONE' {
    if (prevEma23 <= prevEma50 && currEma23 > currEma50) {
      return 'BULLISH';
    }
    if (prevEma23 >= prevEma50 && currEma23 < currEma50) {
      return 'BEARISH';
    }
    return 'NONE';
  }

  /**
   * Recalculates EMA 23 and EMA 50 series across a sequence of candles using Close price
   */
  public recalculateEmaSeries(candles: Ema15mCandle[]): void {
    this.recalculateAllIndicators(candles);
  }

  /**
   * Recalculates full technical indicator suite across a sequence of candles:
   * 1. 23 EMA (k = 2/24)
   * 2. 50 EMA (k = 2/51)
   * 3. RSI 14 (Wilder's Smoothing)
   * 4. Intraday VWAP (Session-based)
   * 5. Bollinger Bands (20, 2)
   * 6. ATR 14 (Average True Range)
   */
  public recalculateAllIndicators(candles: Ema15mCandle[]): void {
    if (candles.length === 0) return;

    // 1. Calculate EMA 23 & EMA 50 with continuous initialization
    // Ensures indicators cover 100% of the chart without missing/undefined early spans
    let ema23 = candles[0].close;
    let ema50 = candles[0].close;

    for (let i = 0; i < candles.length; i++) {
      const close = candles[i].close;

      if (i === 0) {
        ema23 = close;
        ema50 = close;
      } else {
        const k23 = i < this.EMA_23_PERIOD ? 2 / (i + 2) : this.EMA_23_MULTIPLIER;
        const k50 = i < this.EMA_50_PERIOD ? 2 / (i + 2) : this.EMA_50_MULTIPLIER;
        ema23 = (close - ema23) * k23 + ema23;
        ema50 = (close - ema50) * k50 + ema50;
      }

      candles[i].ema23 = Number(ema23.toFixed(2));
      candles[i].ema50 = Number(ema50.toFixed(2));
      candles[i].emaDifference = Number((ema23 - ema50).toFixed(2));
    }

    // 2. Evaluate historical crossover signals (Bullish ▲ and Bearish ▼)
    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        if (!candles[i].signal) candles[i].signal = 'NONE';
        continue;
      }
      const prev = candles[i - 1];
      const curr = candles[i];
      if (prev.ema23 !== undefined && prev.ema50 !== undefined && curr.ema23 !== undefined && curr.ema50 !== undefined) {
        curr.signal = this.evaluateCrossover(prev.ema23, prev.ema50, curr.ema23, curr.ema50);
      } else {
        curr.signal = 'NONE';
      }
    }

    // 3. Calculate RSI (14) with expanding window warmup for full span coverage
    const RSI_PERIOD = 14;
    let avgGain = 0;
    let avgLoss = 0;
    let sumGain = 0;
    let sumLoss = 0;

    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        candles[i].rsi14 = 50;
        continue;
      }

      const change = candles[i].close - candles[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      if (i <= RSI_PERIOD) {
        sumGain += gain;
        sumLoss += loss;
        const curAvgGain = sumGain / i;
        const curAvgLoss = sumLoss / i;
        const rs = curAvgLoss === 0 ? 100 : curAvgGain / curAvgLoss;
        candles[i].rsi14 = Number((100 - (100 / (1 + rs))).toFixed(2));
        if (i === RSI_PERIOD) {
          avgGain = curAvgGain;
          avgLoss = curAvgLoss;
        }
      } else {
        avgGain = (avgGain * (RSI_PERIOD - 1) + gain) / RSI_PERIOD;
        avgLoss = (avgLoss * (RSI_PERIOD - 1) + loss) / RSI_PERIOD;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        candles[i].rsi14 = Number((100 - (100 / (1 + rs))).toFixed(2));
      }
    }

    // 4. Calculate Intraday VWAP (Resets cleanly on each trading day)
    let cumVolumePrice = 0;
    let cumVolume = 0;
    let currentDayStr = '';

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const candleDay = c.timestamp.split('T')[0];

      if (candleDay !== currentDayStr) {
        currentDayStr = candleDay;
        cumVolumePrice = 0;
        cumVolume = 0;
      }

      const typicalPrice = (c.high + c.low + c.close) / 3;
      const vol = c.volume || 1000;
      cumVolumePrice += typicalPrice * vol;
      cumVolume += vol;

      candles[i].vwap = cumVolume > 0 ? Number((cumVolumePrice / cumVolume).toFixed(2)) : c.close;
    }

    // 5. Calculate Bollinger Bands (20, 2) with expanding window warmup
    const BB_PERIOD = 20;
    for (let i = 0; i < candles.length; i++) {
      const windowSize = Math.min(i + 1, BB_PERIOD);
      const slice = candles.slice(Math.max(0, i - windowSize + 1), i + 1);
      const mean = slice.reduce((acc, item) => acc + item.close, 0) / windowSize;
      const variance = slice.reduce((acc, item) => acc + Math.pow(item.close - mean, 2), 0) / windowSize;
      const stdDev = Math.sqrt(variance);

      candles[i].bbMiddle = Number(mean.toFixed(2));
      const effectiveStdDev = stdDev > 0 ? stdDev : mean * 0.002;
      candles[i].bbUpper = Number((mean + 2 * effectiveStdDev).toFixed(2));
      candles[i].bbLower = Number((mean - 2 * effectiveStdDev).toFixed(2));
    }

    // 6. Calculate ATR (14)
    const ATR_PERIOD = 14;
    let atr = 0;
    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        atr = candles[i].high - candles[i].low;
        candles[i].atr = Number(atr.toFixed(2));
      } else {
        const tr = Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        );
        if (i < ATR_PERIOD) {
          atr = (atr * i + tr) / (i + 1);
        } else {
          atr = (atr * (ATR_PERIOD - 1) + tr) / ATR_PERIOD;
        }
        candles[i].atr = Number(atr.toFixed(2));
      }
    }

    // 7. Calculate Central Pivot Range (CPR) and Daily Pivots for each trading day
    // Group candles by calendar date (IST day)
    const dayMap = new Map<string, Ema15mCandle[]>();
    for (const c of candles) {
      const day = c.timestamp.split('T')[0];
      if (!dayMap.has(day)) {
        dayMap.set(day, []);
      }
      dayMap.get(day)!.push(c);
    }

    const sortedDays = Array.from(dayMap.keys()).sort();
    for (let d = 0; d < sortedDays.length; d++) {
      const currentDay = sortedDays[d];
      const currentDayCandles = dayMap.get(currentDay)!;

      // Find the previous trading day
      let prevDayCandles: Ema15mCandle[] = [];
      if (d > 0) {
        prevDayCandles = dayMap.get(sortedDays[d - 1])!;
      } else {
        prevDayCandles = currentDayCandles.slice(0, Math.max(1, Math.floor(currentDayCandles.length / 2)));
      }

      if (prevDayCandles.length > 0) {
        const pH = Math.max(...prevDayCandles.map(c => c.high));
        const pL = Math.min(...prevDayCandles.map(c => c.low));
        const pC = prevDayCandles[prevDayCandles.length - 1].close;

        const P = Number(((pH + pL + pC) / 3).toFixed(2));
        const BC = Number(((pH + pL) / 2).toFixed(2));
        const TC = Number(((P - BC) + P).toFixed(2));
        const R1 = Number((2 * P - pL).toFixed(2));
        const S1 = Number((2 * P - pH).toFixed(2));
        const R2 = Number((P + (pH - pL)).toFixed(2));
        const S2 = Number((P - (pH - pL)).toFixed(2));

        for (const c of currentDayCandles) {
          c.cprP = P;
          c.cprBC = BC;
          c.cprTC = TC;
          c.cprR1 = R1;
          c.cprS1 = S1;
          c.cprR2 = R2;
          c.cprS2 = S2;
        }
      }
    }
  }

  /**
   * Returns Indian Stock Market Hours & Holiday status (09:15 to 15:30 IST)
   */
  public getMarketHoursStatus(): { isMarketOpen: boolean; message: string; istTime: string } {
    const now = new Date();
    // Convert to IST (Asia/Kolkata, UTC + 5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);

    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const currentMinutesFromMidnight = hours * 60 + minutes;

    const dayOfWeek = istDate.getUTCDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = this.MARKET_HOLIDAYS.has(dateStr);

    const marketOpenMinutes = 9 * 60 + 15; // 09:15 AM
    const marketCloseMinutes = 15 * 60 + 30; // 03:30 PM

    const istTimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} IST`;

    if (isWeekend) {
      return { isMarketOpen: false, message: `Market Closed (Weekend - ${istTimeStr})`, istTime: istTimeStr };
    }
    if (isHoliday) {
      return { isMarketOpen: false, message: `Market Closed (Exchange Holiday - ${istTimeStr})`, istTime: istTimeStr };
    }
    if (currentMinutesFromMidnight < marketOpenMinutes) {
      return { isMarketOpen: false, message: `Pre-Market (Opens 09:15 AM - ${istTimeStr})`, istTime: istTimeStr };
    }
    if (currentMinutesFromMidnight >= marketCloseMinutes) {
      return { isMarketOpen: false, message: `Market Closed (Closed at 03:30 PM - ${istTimeStr})`, istTime: istTimeStr };
    }

    return { isMarketOpen: true, message: `Market Open (09:15 - 15:30 IST)`, istTime: istTimeStr };
  }

  /**
   * Computes the 15-minute slot boundary timestamp (e.g. 09:15, 09:30, 09:45)
   */
  public get15mSlotBoundary(date: Date = new Date()): string {
    const d = new Date(date);
    const minutes = d.getMinutes();
    const slotMinute = Math.floor(minutes / 15) * 15;
    d.setMinutes(slotMinute, 0, 0);
    return d.toISOString();
  }

  /**
   * Retrieves high-level instrument status for the Dashboard Cards
   */
  public getInstrumentStatus(inst: Ema15mInstrument): Ema15mInstrumentStatus {
    const history = this.candleCache.get(inst) || [];
    const active = this.activeCandles.get(inst);
    const latestClosed = history[history.length - 1];
    const latestSignal = dbEngine.getLatestEma15mSignal(inst);
    const marketHours = this.getMarketHoursStatus();

    const cfg = getInstrumentConfig(inst);
    const defaultBasePrice = cfg && cfg.baseSpotPrice > 0 ? cfg.baseSpotPrice : (inst === 'SENSEX' ? 76950 : inst === 'BANKNIFTY' ? 57400 : 24100);
    const currentPrice = active?.close || latestClosed?.close || defaultBasePrice;
    const ema23 = latestClosed?.ema23 || 0;
    const ema50 = latestClosed?.ema50 || 0;
    const emaDifference = Number((ema23 - ema50).toFixed(2));

    let currentTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (ema23 > 0 && ema50 > 0) {
      currentTrend = ema23 > ema50 ? 'BULLISH' : ema23 < ema50 ? 'BEARISH' : 'NEUTRAL';
    }

    const displayName = cfg ? cfg.name : inst;

    const activePaperTrade = dbEngine.getOpenEmaPaperTradeByInstrument(inst);

    return {
      instrument: inst,
      displayName,
      currentPrice: Number(currentPrice.toFixed(2)),
      ema23,
      ema50,
      emaDifference,
      currentTrend,
      lastSignalType: latestSignal?.signalType || 'NONE',
      lastSignalTime: latestSignal?.candleTimestamp || null,
      lastSignalPrice: latestSignal?.price || null,
      lastCompletedCandleTime: latestClosed?.timestamp || null,
      candleCount: history.length,
      isMarketOpen: marketHours.isMarketOpen,
      marketStatusMessage: marketHours.message,
      isDataFeedConnected: this.dataSource !== 'LIVE_DATA_UNAVAILABLE',
      isSignalEngineRunning: this.isRunning,
      isMock: this.dataSource === 'PRACTICE',
      dataSource: this.dataSource,
      dataSourceMessage: this.dataSourceMessage,
      activePaperTrade: activePaperTrade || null
    };
  }

  /**
   * Retrieves all 3 instrument status cards
   */
  public getAllStatus(): Ema15mInstrumentStatus[] {
    return this.INSTRUMENTS.map(inst => this.getInstrumentStatus(inst));
  }

  /**
   * Retrieves candles for an instrument for charting with flexible time-range and timeframe aggregation
   * Supports: 1D, 2D, 3D, 4D, 5D, 6D, 1W, 1M, 3M, 6M, 1Y, ALL, and custom date spans
   */
  public getCandles(
    inst: Ema15mInstrument,
    limit: number = 100,
    timeframe: string = '15m',
    range?: string,
    startDate?: string,
    endDate?: string
  ): Ema15mCandle[] {
    const history = this.candleCache.get(inst) || [];
    const active = this.activeCandles.get(inst);

    // Auto-sync in background if cached candles are missing or older than 24 hours
    const lastHistCandle = history[history.length - 1];
    const now = Date.now();
    const lastSync = this.lastAutoSyncMap.get(inst) || 0;
    const isStale = !lastHistCandle || (now - new Date(lastHistCandle.timestamp).getTime() > 24 * 60 * 60 * 1000);
    if (isStale && now - lastSync > 60000) {
      this.lastAutoSyncMap.set(inst, now);
      this.syncRealMarketData(inst, 600).catch(err => {
        console.warn(`[EMA 15M ENGINE] Auto-sync in getCandles for ${inst}:`, err.message);
      });
    }

    let raw = [...history];
    if (active) {
      raw.push(active);
    }

    if (raw.length === 0) return [];

    // Ensure raw candles are sorted chronologically
    raw.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 1. Resample / aggregate to requested timeframe across the ENTIRE continuous series
    // (This guarantees all technical indicators have complete historical warmup regardless of timeframe)
    let processedSeries: Ema15mCandle[] = raw;
    const intervalMap: Record<string, number> = {
      '1m': 1,
      '3m': 3,
      '5m': 5,
      '15m': 15,
      '1h': 60,
      '1d': 375
    };
    const targetMinutes = intervalMap[timeframe] || 15;

    if (targetMinutes >= 375 || timeframe === '1d') {
      // 1D: Group by actual calendar trading day
      const dayMap = new Map<string, Ema15mCandle[]>();
      for (const c of raw) {
        const day = c.timestamp.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day)!.push(c);
      }
      const aggregated: Ema15mCandle[] = [];
      for (const [day, dayCandles] of dayMap.entries()) {
        if (dayCandles.length === 0) continue;
        aggregated.push({
          instrument: inst,
          timeframe: '1d',
          timestamp: `${day}T09:15:00.000Z`,
          open: dayCandles[0].open,
          high: Math.max(...dayCandles.map(c => c.high)),
          low: Math.min(...dayCandles.map(c => c.low)),
          close: dayCandles[dayCandles.length - 1].close,
          volume: dayCandles.reduce((acc, c) => acc + (c.volume || 0), 0),
          isClosed: dayCandles[dayCandles.length - 1].isClosed
        });
      }
      processedSeries = aggregated;
    } else if (targetMinutes > 15) {
      // 1H: Group within each day (4 candles of 15m = 1 hour, without bleeding across days)
      const dayMap = new Map<string, Ema15mCandle[]>();
      for (const c of raw) {
        const day = c.timestamp.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day)!.push(c);
      }
      const aggregated: Ema15mCandle[] = [];
      const groupSize = Math.max(1, Math.round(targetMinutes / 15));

      for (const [, dayCandles] of dayMap.entries()) {
        for (let i = 0; i < dayCandles.length; i += groupSize) {
          const chunk = dayCandles.slice(i, i + groupSize);
          if (chunk.length === 0) continue;
          aggregated.push({
            instrument: inst,
            timeframe,
            timestamp: chunk[0].timestamp,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((acc, c) => acc + (c.volume || 0), 0),
            isClosed: chunk[chunk.length - 1].isClosed
          });
        }
      }
      processedSeries = aggregated;
    } else if (targetMinutes < 15) {
      const subRatio = Math.max(1, Math.round(15 / targetMinutes));
      const subCandles: Ema15mCandle[] = [];

      for (const c of raw) {
        const cTime = new Date(c.timestamp).getTime();
        const stepMs = targetMinutes * 60 * 1000;
        let subOpen = c.open;

        // Determine natural distribution for high and low excursions
        const isBull = c.close >= c.open;
        const peakIdx = isBull ? Math.min(subRatio - 2, Math.max(1, Math.floor(subRatio * 0.6))) : Math.max(0, Math.floor(subRatio * 0.25));
        const troughIdx = isBull ? Math.max(0, Math.floor(subRatio * 0.25)) : Math.min(subRatio - 2, Math.max(1, Math.floor(subRatio * 0.6)));

        for (let s = 0; s < subRatio; s++) {
          const subFraction = (s + 1) / subRatio;
          const targetSubClose = s === subRatio - 1 ? c.close : c.open + (c.close - c.open) * subFraction;
          const subClose = Number(targetSubClose.toFixed(2));

          let subHigh = Math.max(subOpen, subClose);
          let subLow = Math.min(subOpen, subClose);

          if (s === peakIdx) {
            subHigh = Math.max(subHigh, c.high);
          } else {
            const microWick = Math.max(0.1, (c.high - Math.max(c.open, c.close)) * 0.18);
            subHigh = Number((subHigh + microWick).toFixed(2));
          }

          if (s === troughIdx) {
            subLow = Math.min(subLow, c.low);
          } else {
            const microWick = Math.max(0.1, (Math.min(c.open, c.close) - c.low) * 0.18);
            subLow = Number((subLow - microWick).toFixed(2));
          }

          const subVol = Math.max(50, Math.floor((c.volume || 1000) / subRatio));

          subCandles.push({
            instrument: inst,
            timeframe,
            timestamp: new Date(cTime + s * stepMs).toISOString(),
            open: subOpen,
            high: subHigh,
            low: subLow,
            close: subClose,
            volume: subVol,
            isClosed: c.isClosed
          });
          subOpen = subClose;
        }
      }
      processedSeries = subCandles;
    }

    // 2. Compute ALL indicators (EMA 23, EMA 50, Bollinger, RSI, VWAP, ATR, Crossover Signals)
    // on the COMPLETE continuous history so warmup is 100% complete and mature
    this.recalculateAllIndicators(processedSeries);

    // 3. Filter / Slice the mature series by user's requested range or custom dates
    let result = processedSeries;

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate).getTime() : 0;
      const end = endDate ? new Date(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`).getTime() : Infinity;
      result = processedSeries.filter(c => {
        const t = new Date(c.timestamp).getTime();
        return t >= start && t <= end;
      });
    } else if (range) {
      const r = range.toUpperCase();
      const daysMatch = r.match(/^(\d+)D$/);

      if (daysMatch) {
        const daysCount = parseInt(daysMatch[1], 10);
        // Extract distinct trading session dates present in the candle history
        const distinctDates = Array.from(new Set(processedSeries.map(c => c.timestamp.split('T')[0]))).sort();
        const selectedDates = distinctDates.slice(-daysCount);
        const selectedDateSet = new Set(selectedDates);
        result = processedSeries.filter(c => selectedDateSet.has(c.timestamp.split('T')[0]));
      } else if (r === '1W') {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        result = processedSeries.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '1M') {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        result = processedSeries.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '3M') {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        result = processedSeries.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '6M') {
        const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
        result = processedSeries.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '1Y') {
        const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
        result = processedSeries.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      }
      // If r === 'ALL', no filtering needed
    } else {
      result = processedSeries.slice(-limit);
    }

    return result;
  }

  /**
   * Backtesting engine for 15m 23/50 EMA strategy
   */
  public runBacktest(config: Ema15mBacktestConfig): Ema15mBacktestResult {
    const inst = config.instrument;
    const candles = dbEngine.getEma15mCandles(inst, 1000, config.startDate, config.endDate);
    this.recalculateEmaSeries(candles);

    const cfg = getInstrumentConfig(inst);
    const stepSize = cfg ? cfg.stepSize : 50;
    const lotSize = cfg ? cfg.lotSize : 25;

    const trades: Ema15mBacktestTrade[] = [];
    let currentTrade: Partial<Ema15mBacktestTrade> | null = null;
    let bullishCount = 0;
    let bearishCount = 0;

    for (let i = this.EMA_50_PERIOD; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      if (!prev.ema23 || !prev.ema50 || !curr.ema23 || !curr.ema50) continue;

      const signal = this.evaluateCrossover(prev.ema23, prev.ema50, curr.ema23, curr.ema50);

      // 1. Evaluate open trade exits against Stop-Loss, Target, and Intraday Square-off
      if (currentTrade && currentTrade.strikePrice && currentTrade.optionType && currentTrade.weeklyExpiry) {
        currentTrade.barsHeld = (currentTrade.barsHeld || 0) + 1;

        const optType = currentTrade.optionType;
        const entryOptPrice = currentTrade.entryPrice!;
        const sl = currentTrade.stopLoss!;
        const tp = currentTrade.targetPrice!;

        // Estimate option prices during the candle
        const optClose = this.getEstimatedOptionPrice(inst, currentTrade.strikePrice, optType, currentTrade.weeklyExpiry, curr.close);
        const optAtHigh = this.getEstimatedOptionPrice(inst, currentTrade.strikePrice, optType, currentTrade.weeklyExpiry, curr.high);
        const optAtLow = this.getEstimatedOptionPrice(inst, currentTrade.strikePrice, optType, currentTrade.weeklyExpiry, curr.low);

        const estOptHigh = optType === 'CE' ? optAtHigh : optAtLow;
        const estOptLow = optType === 'CE' ? optAtLow : optAtHigh;

        // Excursion tracking (points relative to entry option premium)
        const favorable = Number(Math.max(0, estOptHigh - entryOptPrice).toFixed(2));
        const adverse = Number(Math.max(0, entryOptPrice - estOptLow).toFixed(2));
        currentTrade.maxFavorableExcursionPoints = Math.max(currentTrade.maxFavorableExcursionPoints || 0, favorable);
        currentTrade.maxAdverseExcursionPoints = Math.max(currentTrade.maxAdverseExcursionPoints || 0, adverse);

        let exitReason: 'SL_HIT' | 'TARGET_HIT' | 'TRAILING_SL_HIT' | 'FORCED_INTRADAY_SQUARE_OFF' | 'OPPOSITE_CROSSOVER' | null = null;
        let exitPrice = optClose;

        // Profit Lock & Trailing SL Engine:
        // When Target (+100) is touched, activate Profit Lock (+70 pts) and trail SL upwards!
        const targetReached = estOptHigh >= tp;
        if (targetReached || (currentTrade as any).isTrailingActive) {
          (currentTrade as any).isTrailingActive = true;
          const minLock = Number((entryOptPrice + 70).toFixed(2));
          const dynamicTrail = Number((estOptHigh - 30).toFixed(2));
          currentTrade.stopLoss = Math.max(currentTrade.stopLoss || minLock, dynamicTrail);

          if (estOptLow <= currentTrade.stopLoss) {
            exitReason = 'TRAILING_SL_HIT';
            exitPrice = currentTrade.stopLoss;
          }
        } else {
          // Standard Initial Stop-Loss (-30 points)
          if (estOptLow <= sl) {
            exitReason = 'SL_HIT';
            exitPrice = sl;
          }
        }

        // Intraday forced square-off at 15:15 IST
        const candleTime = curr.timestamp;
        if (!exitReason && (candleTime.includes('T15:15') || candleTime.includes('T15:30'))) {
          exitReason = 'FORCED_INTRADAY_SQUARE_OFF';
          exitPrice = optClose;
        }

        // Check opposite crossover exit
        if (!exitReason && signal !== 'NONE' && signal !== currentTrade.signalType) {
          exitReason = 'OPPOSITE_CROSSOVER';
          exitPrice = optClose;
        }

        if (exitReason) {
          const pnlPoints = Number((exitPrice - entryOptPrice).toFixed(2));
          const pnlPercent = Number(((pnlPoints / entryOptPrice) * 100).toFixed(2));
          const netPnl = Number((pnlPoints * lotSize - 40).toFixed(2));

          trades.push({
            id: `trade-${trades.length + 1}`,
            instrument: inst,
            signalType: currentTrade.signalType!,
            strikePrice: currentTrade.strikePrice,
            optionType: currentTrade.optionType,
            weeklyExpiry: currentTrade.weeklyExpiry,
            spotAtEntry: currentTrade.spotAtEntry,
            stopLoss: currentTrade.stopLoss,
            targetPrice: currentTrade.targetPrice,
            entryTimestamp: currentTrade.entryTimestamp!,
            entryPrice: entryOptPrice,
            exitTimestamp: curr.timestamp,
            exitPrice,
            pnlPoints,
            pnlPercent,
            netPnl,
            barsHeld: currentTrade.barsHeld || 1,
            maxFavorableExcursionPoints: Number((currentTrade.maxFavorableExcursionPoints || 0).toFixed(2)),
            maxAdverseExcursionPoints: Number((currentTrade.maxAdverseExcursionPoints || 0).toFixed(2)),
            exitReason
          });
          currentTrade = null;
        }
      }

      // 2. Open new trade upon confirmed crossover if no position is currently active
      if (signal === 'BULLISH') {
        bullishCount++;
        if (!currentTrade) {
          const optionType: 'CE' = 'CE';
          const strikePrice = ContractMaster.getDirectionalAtmStrike(curr.close, optionType, stepSize);
          const weeklyExpiry = this.resolveNearestWeeklyExpiry(inst, new Date(curr.timestamp));
          const entryPrice = this.getEstimatedOptionPrice(inst, strikePrice, optionType, weeklyExpiry, curr.close);
          const stopLoss = Number((entryPrice - 30).toFixed(2));
          const targetPrice = Number((entryPrice + 100).toFixed(2));

          currentTrade = {
            instrument: inst,
            signalType: 'BULLISH',
            strikePrice,
            optionType,
            weeklyExpiry,
            spotAtEntry: curr.close,
            stopLoss,
            targetPrice,
            entryTimestamp: curr.timestamp,
            entryPrice,
            barsHeld: 0,
            maxFavorableExcursionPoints: 0,
            maxAdverseExcursionPoints: 0
          };
        }
      } else if (signal === 'BEARISH') {
        bearishCount++;
        if (!currentTrade) {
          const optionType: 'PE' = 'PE';
          const strikePrice = ContractMaster.getDirectionalAtmStrike(curr.close, optionType, stepSize);
          const weeklyExpiry = this.resolveNearestWeeklyExpiry(inst, new Date(curr.timestamp));
          const entryPrice = this.getEstimatedOptionPrice(inst, strikePrice, optionType, weeklyExpiry, curr.close);
          const stopLoss = Number((entryPrice + 30).toFixed(2));
          const targetPrice = Number((entryPrice - 100).toFixed(2));

          currentTrade = {
            instrument: inst,
            signalType: 'BEARISH',
            strikePrice,
            optionType,
            weeklyExpiry,
            spotAtEntry: curr.close,
            stopLoss,
            targetPrice,
            entryTimestamp: curr.timestamp,
            entryPrice,
            barsHeld: 0,
            maxFavorableExcursionPoints: 0,
            maxAdverseExcursionPoints: 0
          };
        }
      }
    }

    // Close last trade if open at end of period
    if (currentTrade && candles.length > 0 && currentTrade.entryPrice) {
      const lastCandle = candles[candles.length - 1];
      const optClose = this.getEstimatedOptionPrice(
        inst,
        currentTrade.strikePrice!,
        currentTrade.optionType!,
        currentTrade.weeklyExpiry!,
        lastCandle.close
      );
      const exitPrice = optClose;
      const pnlPoints = Number((exitPrice - currentTrade.entryPrice).toFixed(2));
      const pnlPercent = Number(((pnlPoints / currentTrade.entryPrice) * 100).toFixed(2));
      const netPnl = Number((pnlPoints * lotSize - 40).toFixed(2));

      trades.push({
        id: `trade-${trades.length + 1}`,
        instrument: inst,
        signalType: currentTrade.signalType!,
        strikePrice: currentTrade.strikePrice,
        optionType: currentTrade.optionType,
        weeklyExpiry: currentTrade.weeklyExpiry,
        spotAtEntry: currentTrade.spotAtEntry,
        stopLoss: currentTrade.stopLoss,
        targetPrice: currentTrade.targetPrice,
        entryTimestamp: currentTrade.entryTimestamp!,
        entryPrice: currentTrade.entryPrice,
        exitTimestamp: lastCandle.timestamp,
        exitPrice,
        pnlPoints,
        pnlPercent,
        netPnl,
        barsHeld: currentTrade.barsHeld || 1,
        maxFavorableExcursionPoints: Number((currentTrade.maxFavorableExcursionPoints || 0).toFixed(2)),
        maxAdverseExcursionPoints: Number((currentTrade.maxAdverseExcursionPoints || 0).toFixed(2)),
        exitReason: 'END_OF_PERIOD'
      });
    }

    const winningTrades = trades.filter(t => t.pnlPoints > 0);
    const losingTrades = trades.filter(t => t.pnlPoints <= 0);
    const winRatePercent = trades.length > 0 ? Number(((winningTrades.length / trades.length) * 100).toFixed(2)) : 0;
    const totalPnlPoints = Number(trades.reduce((sum, t) => sum + t.pnlPoints, 0).toFixed(2));
    const avgPnlPointsPerTrade = trades.length > 0 ? Number((totalPnlPoints / trades.length).toFixed(2)) : 0;
    const avgPnlPercentPerTrade = trades.length > 0 ? Number((trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length).toFixed(2)) : 0;

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnlPoints, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPoints, 0));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0;

    // Calculate Max Drawdown
    let peakEquity = 0;
    let currentEquity = 0;
    let maxDrawdownPoints = 0;
    for (const t of trades) {
      currentEquity += t.pnlPoints;
      if (currentEquity > peakEquity) peakEquity = currentEquity;
      const dd = peakEquity - currentEquity;
      if (dd > maxDrawdownPoints) maxDrawdownPoints = dd;
    }

    const maxFavorableExcursionAvg = trades.length > 0 ? Number((trades.reduce((sum, t) => sum + t.maxFavorableExcursionPoints, 0) / trades.length).toFixed(2)) : 0;
    const maxAdverseExcursionAvg = trades.length > 0 ? Number((trades.reduce((sum, t) => sum + t.maxAdverseExcursionPoints, 0) / trades.length).toFixed(2)) : 0;

    return {
      instrument: inst,
      startDate: config.startDate || (candles[0]?.timestamp || ''),
      endDate: config.endDate || (candles[candles.length - 1]?.timestamp || ''),
      totalCandles: candles.length,
      totalSignals: bullishCount + bearishCount,
      bullishSignalsCount: bullishCount,
      bearishSignalsCount: bearishCount,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRatePercent,
      totalPnlPoints,
      avgPnlPointsPerTrade,
      avgPnlPercentPerTrade,
      profitFactor,
      maxDrawdownPoints: Number(maxDrawdownPoints.toFixed(2)),
      maxDrawdownPercent: 0,
      maxFavorableExcursionAvg,
      maxAdverseExcursionAvg,
      disclaimer: 'Strictly analytical historical backtest metrics based on 15m candle closes. Past performance does not guarantee future results.',
      trades
    };
  }

  /**
   * Deterministic seed generator for 15m historical candles with realistic trend & oscillation
   */
  public seedHistoricalCandles(inst: Ema15mInstrument, count: number = 120): void {
    const basePrice = inst === 'SENSEX' ? 76950 : inst === 'BANKNIFTY' ? 57400 : 24100;
    const stepVolatility = inst === 'SENSEX' ? 45 : inst === 'BANKNIFTY' ? 35 : 15;

    const candles: Ema15mCandle[] = [];
    const now = new Date();
    // 15 mins in ms
    const intervalMs = 15 * 60 * 1000;

    let currentPrice = basePrice * 0.985; // start slightly lower for trend evolution

    for (let i = count; i >= 1; i--) {
      const candleTime = new Date(now.getTime() - i * intervalMs);
      // Realistic sinusoidal trend with noise
      const trendWave = Math.sin(i / 14) * stepVolatility * 1.5;
      const noise = (Math.random() - 0.48) * stepVolatility;
      const delta = trendWave + noise;

      const open = Number(currentPrice.toFixed(2));
      const close = Number((currentPrice + delta).toFixed(2));
      const high = Number((Math.max(open, close) + Math.random() * stepVolatility * 0.8).toFixed(2));
      const low = Number((Math.min(open, close) - Math.random() * stepVolatility * 0.8).toFixed(2));
      const volume = Math.floor(15000 + Math.random() * 45000);

      currentPrice = close;

      candles.push({
        instrument: inst,
        timeframe: '15m',
        timestamp: candleTime.toISOString(),
        open,
        high,
        low,
        close,
        volume,
        isClosed: true
      });
    }

    this.recalculateEmaSeries(candles);
    dbEngine.saveEma15mCandlesBatch(candles);
    this.candleCache.set(inst, candles);
  }

  /**
   * Triggers a deterministic simulated crossover for testing & verification
   */
  public triggerMockCrossover(inst: Ema15mInstrument, targetType: 'BULLISH' | 'BEARISH'): { candle: Ema15mCandle; signal?: Ema15mSignal } {
    const history = this.candleCache.get(inst) || [];
    const lastClosed = history[history.length - 1];
    const cfg = getInstrumentConfig(inst);
    const fallbackBasePrice = cfg && cfg.baseSpotPrice > 0 ? cfg.baseSpotPrice : (inst === 'SENSEX' ? 76950 : inst === 'BANKNIFTY' ? 57400 : 24100);
    const basePrice = lastClosed ? lastClosed.close : fallbackBasePrice;

    // If target is BULLISH, push price strongly upward to flip 23 EMA > 50 EMA
    // If target is BEARISH, push price strongly downward to flip 23 EMA < 50 EMA
    const jump = inst === 'SENSEX' ? 350 : inst === 'BANKNIFTY' ? 250 : Math.max(50, Math.round(basePrice * 0.005));
    const newClose = targetType === 'BULLISH' ? basePrice + jump : basePrice - jump;

    const mockSlotTime = new Date().toISOString();
    const mockCandle: Ema15mCandle = {
      instrument: inst,
      timeframe: '15m',
      timestamp: mockSlotTime,
      open: basePrice,
      high: Math.max(basePrice, newClose) + 10,
      low: Math.min(basePrice, newClose) - 10,
      close: newClose,
      volume: 50000,
      isClosed: true
    };

    this.finalizeCandle(mockCandle);
    const latestSignal = dbEngine.getLatestEma15mSignal(inst);

    return {
      candle: mockCandle,
      signal: latestSignal || undefined
    };
  }

  /**
   * Batch update live mark-to-market P&L on all OPEN paper positions for this instrument
   * using a single atomic SQLite transaction. Evaluates option pricing and SL/Target boundaries.
   */
  public updateOpenPaperTrades(instrument: string, currentSpotPrice: number): void {
    const openTrades = dbEngine.getOpenEmaPaperTrades(instrument);
    if (!openTrades || openTrades.length === 0) return;

    const toUpdate: Array<{ id: string; currentPrice: number; unrealizedPnl: number; trailingStopLoss?: number; isTrailingActive?: boolean }> = [];
    const toClose: Array<{ id: string; exitPrice: number; exitReason: string; grossPnl: number; netPnl: number; exitTimestamp?: string }> = [];

    for (const trade of openTrades) {
      const entryPrice = Number(trade.entryPrice);
      const qty = Number(trade.quantity);

      let currentOptionPrice = entryPrice;

      if (trade.optionType && trade.strikePrice && trade.expiryDate) {
        currentOptionPrice = this.getEstimatedOptionPrice(
          trade.instrument,
          trade.strikePrice,
          trade.optionType,
          trade.expiryDate,
          currentSpotPrice
        );
      } else {
        // Fallback for spot index trades
        const isLong = trade.direction === 'LONG';
        const unrealizedPnl = Number((isLong ? (currentSpotPrice - entryPrice) * qty : (entryPrice - currentSpotPrice) * qty).toFixed(2));
        toUpdate.push({ id: trade.id, currentPrice: currentSpotPrice, unrealizedPnl });
        continue;
      }

      // Option Long trade P&L: (currentOptionPrice - entryPrice) * quantity
      const grossPnl = Number(((currentOptionPrice - entryPrice) * qty).toFixed(2));
      const netPnl = Number((grossPnl - 40).toFixed(2));
      const unrealizedPnl = grossPnl;

      // Settings check for Profit Lock & Trailing SL
      const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
      const trailingEnabled = settings.trailingSlEnabled !== false;
      const profitLockPts = settings.profitLockPoints ?? 70;
      const trailDistancePts = settings.trailDistancePoints ?? 30;

      // Check Stop-Loss, Target, and Trailing SL criteria
      let shouldExit = false;
      let exitReason = '';
      let updatedTrailingSl = trade.trailingStopLoss;
      let updatedIsTrailing = trade.isTrailingActive;

      if (trailingEnabled) {
        // Trailing Stop-Loss & Profit Lock Mode:
        // Once +100 target is reached, lock at least +70 points profit and trail upwards!
        const targetThreshold = trade.targetPrice || (entryPrice + 100);
        const hasReachedTarget = currentOptionPrice >= targetThreshold;

        if (hasReachedTarget || trade.isTrailingActive) {
          updatedIsTrailing = true;
          // Profit Lock: Guarantee at least profitLockPts (+70 pts) once target is touched
          const minLockPrice = Number((entryPrice + profitLockPts).toFixed(2));
          const dynamicTrailPrice = Number((currentOptionPrice - trailDistancePts).toFixed(2));
          updatedTrailingSl = Math.max(updatedTrailingSl || minLockPrice, dynamicTrailPrice);

          // Check if price fell back to or below trailing stop
          if (currentOptionPrice <= updatedTrailingSl) {
            shouldExit = true;
            exitReason = 'TRAILING_SL_HIT';
          }
        } else {
          // Target not yet reached: enforce initial Stop-Loss (-30 points)
          if (trade.stopLoss !== undefined && currentOptionPrice <= trade.stopLoss) {
            shouldExit = true;
            exitReason = 'SL_HIT';
          }
        }
      } else {
        // Standard Fixed Target (+100) & Fixed SL (-30) Mode
        if (trade.stopLoss !== undefined && trade.targetPrice !== undefined) {
          if (trade.optionType === 'CE') {
            if (currentOptionPrice <= trade.stopLoss) {
              shouldExit = true;
              exitReason = 'SL_HIT';
            } else if (currentOptionPrice >= trade.targetPrice) {
              shouldExit = true;
              exitReason = 'TARGET_HIT';
            }
          } else {
            if (trade.targetPrice < entryPrice) {
              if (currentOptionPrice <= trade.targetPrice) {
                shouldExit = true;
                exitReason = 'TARGET_HIT';
              } else if (currentOptionPrice >= trade.stopLoss) {
                shouldExit = true;
                exitReason = 'SL_HIT';
              }
            } else {
              if (currentOptionPrice >= trade.targetPrice) {
                shouldExit = true;
                exitReason = 'TARGET_HIT';
              } else if (currentOptionPrice <= trade.stopLoss) {
                shouldExit = true;
                exitReason = 'SL_HIT';
              }
            }
          }
        }
      }

      if (shouldExit) {
        toClose.push({
          id: trade.id,
          exitPrice: currentOptionPrice,
          exitReason,
          grossPnl,
          netPnl,
          exitTimestamp: new Date().toISOString()
        });
        console.log(`[EMA 15M STRATEGY] 🎯 ${exitReason} on ${trade.instrument} ${trade.strikePrice} ${trade.optionType}: Exited @ ₹${currentOptionPrice} (Entry: ₹${entryPrice} | Net P&L: ₹${netPnl})`);
        try {
          tradeReviewEngine.recordFromEmaTrade(
            trade,
            currentOptionPrice,
            grossPnl,
            netPnl,
            exitReason,
            new Date().toISOString()
          );
        } catch {}
      } else {
        toUpdate.push({
          id: trade.id,
          currentPrice: currentOptionPrice,
          unrealizedPnl,
          trailingStopLoss: updatedTrailingSl,
          isTrailingActive: updatedIsTrailing
        });
      }
    }

    dbEngine.batchUpdateEmaPaperTrades({ toUpdate, toClose });
  }
}

export const globalEma15mEngine = Ema15mEngine.getInstance();
