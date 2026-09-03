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

export class Ema15mEngine {
  private static instance: Ema15mEngine | null = null;
  private readonly INSTRUMENTS: Ema15mInstrument[] = ['NIFTY', 'BANKNIFTY', 'SENSEX'];

  // EMA Constants
  public readonly EMA_23_PERIOD = 23;
  public readonly EMA_50_PERIOD = 50;
  public readonly EMA_23_MULTIPLIER = 2 / (23 + 1); // 2 / 24 = 0.08333333333333333
  public readonly EMA_50_MULTIPLIER = 2 / (50 + 1); // 2 / 51 = 0.0392156862745098

  // In-memory active (forming) candle per instrument
  private activeCandles: Map<Ema15mInstrument, Ema15mCandle> = new Map();
  // In-memory cache of completed candles (sorted chronological)
  private candleCache: Map<Ema15mInstrument, Ema15mCandle[]> = new Map();
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

      if (candles.length < 100 || isFlatVolume) {
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
  }

  /**
   * Ingests a new live spot tick for an instrument (from MarketFeed or WebSocket)
   */
  public ingestTick(instrument: Ema15mInstrument, price: number, volume: number = 0, timestamp: Date = new Date()): void {
    if (!price || price <= 0) return;

    // Sanity boundary check to prevent symbol cross-pollution (e.g. NIFTY price applied to SENSEX)
    if (instrument === 'SENSEX' && price < 50000) {
      console.warn(`[EMA 15M ENGINE] Rejected invalid tick for SENSEX: ₹${price} (below minimum threshold)`);
      return;
    }
    if (instrument === 'NIFTY' && (price < 15000 || price > 40000)) {
      console.warn(`[EMA 15M ENGINE] Rejected out-of-range tick for NIFTY: ₹${price}`);
      return;
    }
    if (instrument === 'BANKNIFTY' && (price < 35000 || price > 85000)) {
      console.warn(`[EMA 15M ENGINE] Rejected out-of-range tick for BANKNIFTY: ₹${price}`);
      return;
    }

    // Strict Market Hours Check: Never alter candles or crossover state when market is closed
    const marketHours = this.getMarketHoursStatus();
    if (!marketHours.isMarketOpen) {
      return;
    }

    // 1. Immediately update live mark-to-market P&L on all OPEN paper positions for this instrument
    dbEngine.updateEmaPaperTradePrices(instrument, price);

    const currentSlotTime = this.get15mSlotBoundary(timestamp);
    const active = this.activeCandles.get(instrument);

    if (!active || active.timestamp !== currentSlotTime) {
      // If we have an active candle from a previous 15m slot, close it first
      if (active && active.timestamp !== currentSlotTime) {
        this.finalizeCandle(active);
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
   */
  private evaluateCandleBoundaries(): void {
    const marketHours = this.getMarketHoursStatus();
    if (!marketHours.isMarketOpen) {
      return;
    }

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
          const signalId = `ema-${inst}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const signal: Ema15mSignal = {
            id: signalId,
            instrument: inst,
            timeframe: '15m',
            signalType,
            price: curr.close,
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
            console.log(`[EMA 15M ALERT] 🚀 Confirmed ${signalType} Crossover on ${inst} @ ₹${signal.price} (23 EMA: ${signal.ema23} | 50 EMA: ${signal.ema50})`);

            // 1. Execute Automatic Paper Trading with Position Reversal & Idempotency
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
   * Automatic Paper Trading Engine for 15-Minute 23/50 EMA Strategy
   * - Triggered ONLY upon confirmed 15m candle close
   * - Long on Bullish Crossover, Short on Bearish Crossover
   * - Closes opposing open position and reverses
   * - Uses real live tick prices
   * - Idempotent (1 signal = 1 trade)
   */
  public processAutoPaperTrade(signal: Ema15mSignal): void {
    try {
      const settings = dbEngine.getEmaNotificationSettings('GLOBAL');
      if (settings.autoPaperTradingEnabled === false) {
        console.log(`[EMA PAPER TRADING] Auto paper trading is disabled in settings. Skipping position creation for ${signal.instrument}`);
        return;
      }

      const lotSizes: Record<Ema15mInstrument, number> = {
        NIFTY: 25,
        BANKNIFTY: 15,
        SENSEX: 10
      };
      const lotSize = lotSizes[signal.instrument] || 25;
      const quantity = lotSize; // 1 standard index lot
      const newDirection: 'LONG' | 'SHORT' = signal.signalType === 'BULLISH' ? 'LONG' : 'SHORT';

      // Check if an open position already exists for this instrument
      const existingOpen = dbEngine.getOpenEmaPaperTradeByInstrument(signal.instrument);

      if (existingOpen) {
        if (existingOpen.direction !== newDirection) {
          // Reversal: close the opposing trade at the crossover candle's close price
          dbEngine.closeEmaPaperTrade(existingOpen.id, signal.price, 'OPPOSITE_CROSSOVER', signal.signalConfirmedAt);
          console.log(`[EMA PAPER TRADING] 🔄 Reversal: Closed ${existingOpen.direction} trade ${existingOpen.id} on ${signal.instrument} @ ₹${signal.price} (Reason: OPPOSITE_CROSSOVER)`);
        } else {
          console.log(`[EMA PAPER TRADING] Position in direction ${newDirection} already open on ${signal.instrument}. Maintaining position.`);
          return;
        }
      }

      // Create new Paper Position
      const tradeId = `ema-pt-${signal.instrument.toLowerCase()}-${Date.now()}`;
      const source = this.dataSource === 'UPSTOX_LIVE' ? 'UPSTOX_LIVE' : 'PRACTICE';

      const newTrade: EmaPaperTrade = {
        id: tradeId,
        signalId: signal.id,
        instrument: signal.instrument,
        direction: newDirection,
        entryTimestamp: signal.signalConfirmedAt || new Date().toISOString(),
        entryPrice: signal.price,
        quantity,
        lotSize,
        strategy: 'EMA_15M_23_50',
        source,
        status: 'OPEN',
        currentPrice: signal.price,
        unrealizedPnl: 0,
        grossPnl: 0,
        brokerage: 40,
        charges: 0,
        netPnl: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      dbEngine.saveEmaPaperTrade(newTrade);
      console.log(`[EMA PAPER TRADING] 🟢 Opened ${newDirection} Paper Position: 1 Lot (${quantity} qty) on ${signal.instrument} @ ₹${signal.price} (Signal ID: ${signal.id})`);
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

    // 1. Calculate EMA 23 & EMA 50
    let ema23 = 0;
    let ema50 = 0;

    for (let i = 0; i < candles.length; i++) {
      const close = candles[i].close;

      // EMA 23
      if (i < this.EMA_23_PERIOD - 1) {
        candles[i].ema23 = undefined;
      } else if (i === this.EMA_23_PERIOD - 1) {
        const sum = candles.slice(0, this.EMA_23_PERIOD).reduce((acc, c) => acc + c.close, 0);
        ema23 = sum / this.EMA_23_PERIOD;
        candles[i].ema23 = Number(ema23.toFixed(2));
      } else {
        ema23 = (close - ema23) * this.EMA_23_MULTIPLIER + ema23;
        candles[i].ema23 = Number(ema23.toFixed(2));
      }

      // EMA 50
      if (i < this.EMA_50_PERIOD - 1) {
        candles[i].ema50 = undefined;
        candles[i].emaDifference = undefined;
      } else if (i === this.EMA_50_PERIOD - 1) {
        const sum = candles.slice(0, this.EMA_50_PERIOD).reduce((acc, c) => acc + c.close, 0);
        ema50 = sum / this.EMA_50_PERIOD;
        candles[i].ema50 = Number(ema50.toFixed(2));
        if (candles[i].ema23 !== undefined) {
          candles[i].emaDifference = Number((candles[i].ema23! - ema50).toFixed(2));
        }
      } else {
        ema50 = (close - ema50) * this.EMA_50_MULTIPLIER + ema50;
        candles[i].ema50 = Number(ema50.toFixed(2));
        if (candles[i].ema23 !== undefined) {
          candles[i].emaDifference = Number((candles[i].ema23! - ema50).toFixed(2));
        }
      }
    }

    // 2. Calculate RSI (14)
    const RSI_PERIOD = 14;
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      if (i < RSI_PERIOD) {
        avgGain += gain;
        avgLoss += loss;
        candles[i].rsi14 = undefined;
      } else if (i === RSI_PERIOD) {
        avgGain = (avgGain + gain) / RSI_PERIOD;
        avgLoss = (avgLoss + loss) / RSI_PERIOD;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        candles[i].rsi14 = Number((100 - (100 / (1 + rs))).toFixed(2));
      } else {
        avgGain = (avgGain * (RSI_PERIOD - 1) + gain) / RSI_PERIOD;
        avgLoss = (avgLoss * (RSI_PERIOD - 1) + loss) / RSI_PERIOD;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        candles[i].rsi14 = Number((100 - (100 / (1 + rs))).toFixed(2));
      }
    }

    // 3. Calculate Intraday VWAP (Resets on each trading day)
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

    // 4. Calculate Bollinger Bands (20, 2)
    const BB_PERIOD = 20;
    for (let i = 0; i < candles.length; i++) {
      if (i < BB_PERIOD - 1) {
        candles[i].bbUpper = undefined;
        candles[i].bbMiddle = undefined;
        candles[i].bbLower = undefined;
      } else {
        const slice = candles.slice(i - BB_PERIOD + 1, i + 1);
        const mean = slice.reduce((acc, item) => acc + item.close, 0) / BB_PERIOD;
        const variance = slice.reduce((acc, item) => acc + Math.pow(item.close - mean, 2), 0) / BB_PERIOD;
        const stdDev = Math.sqrt(variance);

        candles[i].bbMiddle = Number(mean.toFixed(2));
        candles[i].bbUpper = Number((mean + 2 * stdDev).toFixed(2));
        candles[i].bbLower = Number((mean - 2 * stdDev).toFixed(2));
      }
    }

    // 5. Calculate ATR (14)
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

    const currentPrice = active?.close || latestClosed?.close || (inst === 'SENSEX' ? 76950 : inst === 'BANKNIFTY' ? 57400 : 24100);
    const ema23 = latestClosed?.ema23 || 0;
    const ema50 = latestClosed?.ema50 || 0;
    const emaDifference = Number((ema23 - ema50).toFixed(2));

    let currentTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (ema23 > 0 && ema50 > 0) {
      currentTrend = ema23 > ema50 ? 'BULLISH' : ema23 < ema50 ? 'BEARISH' : 'NEUTRAL';
    }

    const displayNames: Record<Ema15mInstrument, string> = {
      NIFTY: 'NIFTY 50',
      BANKNIFTY: 'BANK NIFTY',
      SENSEX: 'BSE SENSEX'
    };

    const activePaperTrade = dbEngine.getOpenEmaPaperTradeByInstrument(inst);

    return {
      instrument: inst,
      displayName: displayNames[inst] || inst,
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

    let raw = [...history];
    if (active) {
      raw.push(active);
    }

    if (raw.length === 0) return [];

    // 1. Filter by explicit custom date range if supplied
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate).getTime() : 0;
      const end = endDate ? new Date(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`).getTime() : Infinity;
      raw = raw.filter(c => {
        const t = new Date(c.timestamp).getTime();
        return t >= start && t <= end;
      });
    } else if (range) {
      // 2. Filter by Preset Ranges (1D, 2D, 3D, 4D, 5D, 6D, 1W, 1M, 3M, 6M, 1Y, ALL)
      const r = range.toUpperCase();
      const daysMatch = r.match(/^(\d+)D$/);

      if (daysMatch) {
        const daysCount = parseInt(daysMatch[1], 10);
        // Extract distinct trading session dates present in the candle history
        const distinctDates = Array.from(new Set(raw.map(c => c.timestamp.split('T')[0]))).sort();
        const selectedDates = distinctDates.slice(-daysCount);
        const selectedDateSet = new Set(selectedDates);
        raw = raw.filter(c => selectedDateSet.has(c.timestamp.split('T')[0]));
      } else if (r === '1W') {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        raw = raw.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '1M') {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        raw = raw.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '3M') {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        raw = raw.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '6M') {
        const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
        raw = raw.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      } else if (r === '1Y') {
        const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
        raw = raw.filter(c => new Date(c.timestamp).getTime() >= cutoff);
      }
      // If r === 'ALL', no filtering needed
    }

    if (raw.length === 0) return [];

    // If requesting default 15m without explicit downsampling
    if (timeframe === '15m') {
      const sliced = (!range && !startDate && !endDate) ? raw.slice(-limit) : raw;
      this.recalculateAllIndicators(sliced);
      return sliced;
    }

    // Timeframe aggregation logic (for 1m, 3m, 5m, 1h, 1d)
    const intervalMap: Record<string, number> = {
      '1m': 1,
      '3m': 3,
      '5m': 5,
      '15m': 15,
      '1h': 60,
      '1d': 375
    };
    const targetMinutes = intervalMap[timeframe] || 15;

    if (targetMinutes >= 15) {
      const groupSize = Math.max(1, Math.round(targetMinutes / 15));
      const aggregated: Ema15mCandle[] = [];

      for (let i = 0; i < raw.length; i += groupSize) {
        const chunk = raw.slice(i, i + groupSize);
        if (chunk.length === 0) continue;

        const open = chunk[0].open;
        const close = chunk[chunk.length - 1].close;
        const high = Math.max(...chunk.map(c => c.high));
        const low = Math.min(...chunk.map(c => c.low));
        const volume = chunk.reduce((acc, c) => acc + (c.volume || 0), 0);
        const timestamp = chunk[0].timestamp;

        aggregated.push({
          instrument: inst,
          timeframe,
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          isClosed: chunk[chunk.length - 1].isClosed
        });
      }

      const sliced = (!range && !startDate && !endDate) ? aggregated.slice(-limit) : aggregated;
      this.recalculateAllIndicators(sliced);
      return sliced;
    } else {
      const subRatio = 15 / targetMinutes;
      const subCandles: Ema15mCandle[] = [];

      for (const c of raw) {
        const cTime = new Date(c.timestamp).getTime();
        const stepMs = targetMinutes * 60 * 1000;
        let subOpen = c.open;

        for (let s = 0; s < subRatio; s++) {
          const subFraction = (s + 1) / subRatio;
          const targetSubClose = s === subRatio - 1 ? c.close : c.open + (c.close - c.open) * subFraction;
          const subClose = Number(targetSubClose.toFixed(2));
          const subHigh = Number(Math.max(subOpen, subClose, c.high).toFixed(2));
          const subLow = Number(Math.min(subOpen, subClose, c.low).toFixed(2));
          const subVol = Math.floor((c.volume || 1000) / subRatio);

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

      const sliced = (!range && !startDate && !endDate) ? subCandles.slice(-limit) : subCandles;
      this.recalculateAllIndicators(sliced);
      return sliced;
    }
  }

  /**
   * Backtesting engine for 15m 23/50 EMA strategy
   */
  public runBacktest(config: Ema15mBacktestConfig): Ema15mBacktestResult {
    const inst = config.instrument;
    const candles = dbEngine.getEma15mCandles(inst, 1000, config.startDate, config.endDate);
    this.recalculateEmaSeries(candles);

    const trades: Ema15mBacktestTrade[] = [];
    let currentTrade: Partial<Ema15mBacktestTrade> | null = null;
    let bullishCount = 0;
    let bearishCount = 0;

    for (let i = this.EMA_50_PERIOD; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      if (!prev.ema23 || !prev.ema50 || !curr.ema23 || !curr.ema50) continue;

      const signal = this.evaluateCrossover(prev.ema23, prev.ema50, curr.ema23, curr.ema50);

      // Track excursions for open trade
      if (currentTrade) {
        currentTrade.barsHeld = (currentTrade.barsHeld || 0) + 1;
        if (currentTrade.signalType === 'BULLISH') {
          const mfe = curr.high - currentTrade.entryPrice!;
          const mae = currentTrade.entryPrice! - curr.low;
          currentTrade.maxFavorableExcursionPoints = Math.max(currentTrade.maxFavorableExcursionPoints || 0, mfe);
          currentTrade.maxAdverseExcursionPoints = Math.max(currentTrade.maxAdverseExcursionPoints || 0, mae);
        } else {
          const mfe = currentTrade.entryPrice! - curr.low;
          const mae = curr.high - currentTrade.entryPrice!;
          currentTrade.maxFavorableExcursionPoints = Math.max(currentTrade.maxFavorableExcursionPoints || 0, mfe);
          currentTrade.maxAdverseExcursionPoints = Math.max(currentTrade.maxAdverseExcursionPoints || 0, mae);
        }
      }

      if (signal === 'BULLISH') {
        bullishCount++;
        // Close existing Bearish trade if open
        if (currentTrade && currentTrade.signalType === 'BEARISH') {
          const exitPrice = curr.close;
          const pnlPoints = currentTrade.entryPrice! - exitPrice;
          const pnlPercent = (pnlPoints / currentTrade.entryPrice!) * 100;
          trades.push({
            id: `trade-${trades.length + 1}`,
            instrument: inst,
            signalType: 'BEARISH',
            entryTimestamp: currentTrade.entryTimestamp!,
            entryPrice: currentTrade.entryPrice!,
            exitTimestamp: curr.timestamp,
            exitPrice,
            pnlPoints: Number(pnlPoints.toFixed(2)),
            pnlPercent: Number(pnlPercent.toFixed(2)),
            barsHeld: currentTrade.barsHeld || 1,
            maxFavorableExcursionPoints: Number((currentTrade.maxFavorableExcursionPoints || 0).toFixed(2)),
            maxAdverseExcursionPoints: Number((currentTrade.maxAdverseExcursionPoints || 0).toFixed(2)),
            exitReason: 'OPPOSITE_CROSSOVER'
          });
          currentTrade = null;
        }

        // Open new Bullish trade
        if (!currentTrade) {
          currentTrade = {
            instrument: inst,
            signalType: 'BULLISH',
            entryTimestamp: curr.timestamp,
            entryPrice: curr.close,
            barsHeld: 0,
            maxFavorableExcursionPoints: 0,
            maxAdverseExcursionPoints: 0
          };
        }
      } else if (signal === 'BEARISH') {
        bearishCount++;
        // Close existing Bullish trade if open
        if (currentTrade && currentTrade.signalType === 'BULLISH') {
          const exitPrice = curr.close;
          const pnlPoints = exitPrice - currentTrade.entryPrice!;
          const pnlPercent = (pnlPoints / currentTrade.entryPrice!) * 100;
          trades.push({
            id: `trade-${trades.length + 1}`,
            instrument: inst,
            signalType: 'BULLISH',
            entryTimestamp: currentTrade.entryTimestamp!,
            entryPrice: currentTrade.entryPrice!,
            exitTimestamp: curr.timestamp,
            exitPrice,
            pnlPoints: Number(pnlPoints.toFixed(2)),
            pnlPercent: Number(pnlPercent.toFixed(2)),
            barsHeld: currentTrade.barsHeld || 1,
            maxFavorableExcursionPoints: Number((currentTrade.maxFavorableExcursionPoints || 0).toFixed(2)),
            maxAdverseExcursionPoints: Number((currentTrade.maxAdverseExcursionPoints || 0).toFixed(2)),
            exitReason: 'OPPOSITE_CROSSOVER'
          });
          currentTrade = null;
        }

        // Open new Bearish trade
        if (!currentTrade) {
          currentTrade = {
            instrument: inst,
            signalType: 'BEARISH',
            entryTimestamp: curr.timestamp,
            entryPrice: curr.close,
            barsHeld: 0,
            maxFavorableExcursionPoints: 0,
            maxAdverseExcursionPoints: 0
          };
        }
      }
    }

    // Close last trade if open at end of period
    if (currentTrade && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const exitPrice = lastCandle.close;
      const pnlPoints = currentTrade.signalType === 'BULLISH'
        ? exitPrice - currentTrade.entryPrice!
        : currentTrade.entryPrice! - exitPrice;
      const pnlPercent = (pnlPoints / currentTrade.entryPrice!) * 100;

      trades.push({
        id: `trade-${trades.length + 1}`,
        instrument: inst,
        signalType: currentTrade.signalType!,
        entryTimestamp: currentTrade.entryTimestamp!,
        entryPrice: currentTrade.entryPrice!,
        exitTimestamp: lastCandle.timestamp,
        exitPrice,
        pnlPoints: Number(pnlPoints.toFixed(2)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
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
    const basePrice = lastClosed ? lastClosed.close : (inst === 'SENSEX' ? 76950 : inst === 'BANKNIFTY' ? 57400 : 24100);

    // If target is BULLISH, push price strongly upward to flip 23 EMA > 50 EMA
    // If target is BEARISH, push price strongly downward to flip 23 EMA < 50 EMA
    const jump = inst === 'SENSEX' ? 350 : inst === 'BANKNIFTY' ? 250 : 120;
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
}

export const globalEma15mEngine = Ema15mEngine.getInstance();
