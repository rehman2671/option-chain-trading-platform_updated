/**
 * High-Precision Event-Driven Options Backtest Engine
 * Replays REAL historical market data from SQLite database:
 * 1. REAL_HISTORICAL_OPTION_CHAIN: Real option chain quotes (bids, asks, LTPs, Greeks) from quant_option_chain_snapshots
 * 2. MODELED_OPTIONS_ON_REAL_UNDERLYING: Real 15m underlying candles with Black-Scholes pricing
 * 3. INSUFFICIENT_HISTORICAL_DATA: Explicit, transparent status with available date ranges when data is missing.
 *
 * Simulates entry/exit using the unified strategyDecisionEngine (exact same pure logic as autonomous live trading).
 */

import { BacktestResult, StrategyDefinition } from '../types.js';
import {replayStatistics} from './replayStatistics.js';
import { dbEngine } from '../../server/db.js';
import {
  evaluateStrategyEntry,
  evaluateStrategyExit,
  StrategyDecisionContext
} from '../strategies/strategyDecisionEngine.js';
import { calculateEuropeanOptionGreeks } from '../../server/engine/blackScholes.js';

export interface BacktestConfig {
  strategy: StrategyDefinition;
  periodStart: string;
  periodEnd: string;
  costModelId?: string;
  initialCapital?: number;
}

interface SimulatedTrade {
  id: string;
  entryTime: string;
  exitTime: string;
  direction: string;
  grossPnl: number;
  costs: number;
  netPnl: number;
  exitReason: string;
}

export class BacktestEngine {
  private static instance: BacktestEngine;

  private constructor() {}

  public static getInstance(): BacktestEngine {
    if (!BacktestEngine.instance) {
      BacktestEngine.instance = new BacktestEngine();
    }
    return BacktestEngine.instance;
  }

  /**
   * Discovers the actual historical data availability across SQLite tables
   */
  public getHistoricalDataAvailability(underlying: string = 'NIFTY'): {
    hasOptionSnapshots: boolean;
    hasCandles: boolean;
    minDate: string;
    maxDate: string;
    optionRange: { minDate: string; maxDate: string; count: number };
    candleRange: { minDate: string; maxDate: string; count: number };
  } {
    const rawDb = dbEngine.getRawDatabase();
    if (!rawDb) {
      return {
        hasOptionSnapshots: false,
        hasCandles: false,
        minDate: '',
        maxDate: '',
        optionRange: { minDate: '', maxDate: '', count: 0 },
        candleRange: { minDate: '', maxDate: '', count: 0 }
      };
    }

    try {
      const optRow = rawDb.prepare(`
        SELECT MIN(market_ts) as min_ts, MAX(market_ts) as max_ts, COUNT(*) as cnt
        FROM quant_option_chain_snapshots
        WHERE underlying = ?
      `).get(underlying) as any;

      const cndRow = rawDb.prepare(`
        SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts, COUNT(*) as cnt
        FROM ema_15m_candles
        WHERE instrument = ? AND timeframe='15m' AND is_closed=1
      `).get(underlying) as any;

      const optMin = optRow?.min_ts || '';
      const optMax = optRow?.max_ts || '';
      const optCnt = optRow?.cnt || 0;

      const cndMin = cndRow?.min_ts || '';
      const cndMax = cndRow?.max_ts || '';
      const cndCnt = cndRow?.cnt || 0;

      const dates = [optMin, optMax, cndMin, cndMax].filter(Boolean).sort();
      const minDate = dates[0] || '';
      const maxDate = dates[dates.length - 1] || '';

      return {
        hasOptionSnapshots: optCnt > 0,
        hasCandles: cndCnt > 0,
        minDate,
        maxDate,
        optionRange: { minDate: optMin, maxDate: optMax, count: optCnt },
        candleRange: { minDate: cndMin, maxDate: cndMax, count: cndCnt }
      };
    } catch {
      return {
        hasOptionSnapshots: false,
        hasCandles: false,
        minDate: '',
        maxDate: '',
        optionRange: { minDate: '', maxDate: '', count: 0 },
        candleRange: { minDate: '', maxDate: '', count: 0 }
      };
    }
  }

  /**
   * Executes backtest simulation replaying real historical data
   */
  public runBacktest(config: BacktestConfig): BacktestResult {
    const { strategy, periodStart, periodEnd, initialCapital = 1000000 } = config;
    const backtestId = `bt-${strategy.id}-${Date.now()}`;
    const rawDb = dbEngine.getRawDatabase();

    const underlying = (strategy as any).symbol || (strategy as any).underlying || (strategy.id.includes('bank') ? 'BANKNIFTY' : 'NIFTY');
    const availability = this.getHistoricalDataAvailability(underlying);

    if (!Number.isFinite(initialCapital)||initialCapital<=0||!Number.isFinite(Date.parse(periodStart))||!Number.isFinite(Date.parse(periodEnd))||Date.parse(periodEnd)<Date.parse(periodStart)) {
      return this.buildInsufficientDataResult(backtestId,strategy,periodStart,periodEnd,'Invalid replay dates or starting capital',availability.minDate,availability.maxDate);
    }
    if (!rawDb) {
      return this.buildInsufficientDataResult(
        backtestId, strategy, periodStart, periodEnd,
        'Database engine not initialized',
        availability.minDate, availability.maxDate
      );
    }

    // 1. Check if real option chain snapshots exist in requested date range
    const optionSnapshotsCount = rawDb.prepare(`
      SELECT COUNT(DISTINCT market_ts) as distinct_ts
      FROM quant_option_chain_snapshots
      WHERE underlying = ?
        AND market_ts >= ?
        AND market_ts <= ?
    `).get(underlying, periodStart, periodEnd) as any;

    if (optionSnapshotsCount && optionSnapshotsCount.distinct_ts >= 3) {
      // Replay real historical option chain quotes
      return this.replayRealOptionChainSnapshots(config, backtestId, underlying, availability);
    }

    // 2. Check if real 15m underlying candles exist in requested date range
    const candleCount = rawDb.prepare(`
      SELECT COUNT(*) as count
      FROM ema_15m_candles
      WHERE instrument = ? AND timeframe='15m' AND is_closed=1
        AND timestamp >= ?
        AND timestamp <= ?
    `).get(underlying, periodStart, periodEnd) as any;

    if (candleCount && candleCount.count >= 4) {
      // Replay real underlying candles with modeled options pricing
      return this.replayUnderlyingCandles(config, backtestId, underlying, availability);
    }

    // 3. Neither data source has depth for this period -> Return explicit INSUFFICIENT_HISTORICAL_DATA
    return this.buildInsufficientDataResult(
      backtestId,
      strategy,
      periodStart,
      periodEnd,
      `Insufficient historical depth for requested period (${periodStart} to ${periodEnd}). Available underlying candles start at ${availability.minDate.slice(0, 10)} and option chain snapshots start at ${availability.optionRange.minDate ? availability.optionRange.minDate.slice(0, 10) : 'none'}.`,
      availability.minDate,
      availability.maxDate
    );
  }

  /**
   * Replays real option chain quotes from quant_option_chain_snapshots
   */
  private replayRealOptionChainSnapshots(
    config: BacktestConfig,
    backtestId: string,
    underlying: string,
    availability: any
  ): BacktestResult {
    const { strategy, periodStart, periodEnd } = config;
    const rawDb = dbEngine.getRawDatabase();

    const rows = rawDb.prepare(`
      SELECT *
      FROM quant_option_chain_snapshots
      WHERE underlying = ?
        AND market_ts >= ?
        AND market_ts <= ?
      ORDER BY market_ts ASC, strike ASC
    `).all(underlying, periodStart, periodEnd) as any[];

    // Group by timestamp
    const snapshotsByTs = new Map<string, any[]>();
    for (const row of rows) {
      if (!snapshotsByTs.has(row.market_ts)) {
        snapshotsByTs.set(row.market_ts, []);
      }
      snapshotsByTs.get(row.market_ts)!.push(row);
    }

    const lotSize = underlying === 'BANKNIFTY' ? 15 : 25;
    const trades: SimulatedTrade[] = [];

    let inPosition = false;
    let positionEntryTime = '';
    let positionDirection = 'BULLISH';
    let entryCost = 0;
    let longLeg: any = null;
    let shortLeg: any = null;
    let currentHoldingBars = 0;

    let totalGrossPnl = 0;
    let totalCosts = 0;
    let maxDrawdown = 0;
    let peakCapital = config.initialCapital || 1000000;
    let currentCapital = peakCapital;
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    let winCount = 0;

    for (const [timestamp, chain] of snapshotsByTs.entries()) {
      // Never mix different expiries within a snapshot or substitute a
      // fabricated quote for a missing exact leg. Select the earliest
      // non-expired expiry only when no position is held.
      const day=new Date(Date.parse(timestamp)+330*60000);
      if(!Number.isFinite(day.getTime()))continue;
      const today=day.toISOString().slice(0,10);
      const expiry=inPosition?longLeg?.expiry:[...new Set(chain.map(c=>c.expiry).filter(e=>typeof e==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e)&&e>=today))].sort()[0];
      if(!expiry||expiry<today){
        if(inPosition)return this.buildInsufficientDataResult(backtestId,strategy,periodStart,periodEnd,'Open replay position expired without verified exit quote',availability.minDate,availability.maxDate);
        continue;
      }
      const exact=chain.filter(c=>c.expiry===expiry);
      const seen=new Set<string>();
      if(exact.some(c=>{const k=c.strike+':'+c.option_type;if(seen.has(k))return true;seen.add(k);return false;}))
        return this.buildInsufficientDataResult(backtestId,strategy,periodStart,periodEnd,'Duplicate exact contract in replay snapshot',availability.minDate,availability.maxDate);
      const calls=exact.filter(c=>c.option_type==='CE');
      const puts=exact.filter(c=>c.option_type==='PE');
      if(!calls.length||!puts.length)continue;

      const totalPeOi = puts.reduce((sum, p) => sum + (p.oi || 0), 0);
      const totalCeOi = calls.reduce((sum, c) => sum + (c.oi || 0), 0);
      const pcr = totalCeOi > 0 ? Number((totalPeOi / totalCeOi).toFixed(2)) : 1.0;

      // Approximate spot from median strike or ATM where call and put prices are closest
      let spotPrice = NaN;
      if (calls.length > 0 && puts.length > 0) {
        let minDiff = Infinity;
        for (const call of calls) {
          const put = puts.find(p => p.strike === call.strike);
          if (put) {
            const diff = Math.abs(call.ltp - put.ltp);
            if (diff < minDiff) {
              minDiff = diff;
              spotPrice = call.strike;
            }
          }
        }
      }

      if(!Number.isFinite(spotPrice)||spotPrice<=0)continue;
      const ivs=exact.map(c=>c.iv).filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>0);
      if(!ivs.length)continue;
      const ivAvg=ivs.reduce((sum,v)=>sum+v,0)/ivs.length;

      const context: StrategyDecisionContext = {
        symbol: underlying,
        spotPrice,
        pcr,
        ivRank: Math.min(100, Math.max(10, Math.round(ivAvg * 3))),
        indiaVix: ivAvg,
        isSpotLive: true,
        holdingPeriods: currentHoldingBars
      };

      if (!inPosition) {
        const entryDecision = evaluateStrategyEntry(strategy, context);
        if (entryDecision.shouldEnter) {
          inPosition = true;
          positionEntryTime = timestamp;
          positionDirection = entryDecision.direction;
          currentHoldingBars = 0;

          // Select legs from actual chain
          const atmStrike = spotPrice;
          const strikeStep = underlying === 'BANKNIFTY' ? 100 : 50;

          if (positionDirection === 'BEARISH') {
            longLeg = puts.find(p => p.strike === atmStrike) || puts[0];
            shortLeg = puts.find(p => p.strike === atmStrike - strikeStep);
          } else {
            longLeg = calls.find(c => c.strike === atmStrike) || calls[0];
            shortLeg = calls.find(c => c.strike === atmStrike + strikeStep);
          }

          const valid=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0;
          if(!longLeg||!shortLeg||!valid(longLeg.ask)||!valid(shortLeg.bid)||
             !valid(longLeg.bid)||!valid(shortLeg.ask)||longLeg.bid>longLeg.ask||shortLeg.bid>shortLeg.ask||
             !Number.isSafeInteger(longLeg.ask_qty)||longLeg.ask_qty<lotSize||!Number.isSafeInteger(shortLeg.bid_qty)||shortLeg.bid_qty<lotSize){
            inPosition=false;longLeg=null;shortLeg=null;continue;
          }
          entryCost=(longLeg.ask-shortLeg.bid)*lotSize;
          if(!Number.isFinite(entryCost)||entryCost<=0){inPosition=false;longLeg=null;shortLeg=null;continue;}
        }
      } else {
        currentHoldingBars++;
        // Find current leg prices in current snapshot
        const curLong = exact.find(c => c.strike === longLeg?.strike && c.option_type === longLeg?.option_type);
        const curShort = shortLeg ? exact.find(c => c.strike === shortLeg?.strike && c.option_type === shortLeg?.option_type) : null;

        const valid=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0;
        if(!curLong||!curShort||!valid(curLong.bid)||!valid(curLong.ask)||!valid(curShort.ask)||!valid(curShort.bid)||
          curLong.bid>curLong.ask||curShort.bid>curShort.ask||!Number.isSafeInteger(curLong.bid_qty)||curLong.bid_qty<lotSize||
          !Number.isSafeInteger(curShort.ask_qty)||curShort.ask_qty<lotSize)continue;
        const curLongPrice=curLong.bid;
        const curShortPrice=curShort.ask;

        const currentValue = (curLongPrice - curShortPrice) * lotSize;
        const unrealizedPnl = currentValue - entryCost;
        const portfolioPnlPercent = entryCost > 0 ? (unrealizedPnl / entryCost) * 100 : 0;

        const exitDecision = evaluateStrategyExit(strategy, {
          ...context,
          portfolioPnl: unrealizedPnl,
          portfolioPnlPercent,
          holdingPeriods: currentHoldingBars
        });

        if (exitDecision.shouldExit || currentHoldingBars >= 20) {
          const grossPnl = Number(unrealizedPnl.toFixed(2));
          // Indian statutory costs: ₹40 Brokerage + 0.125% STT on sell + GST + turnover
          const turnover = (entryCost + currentValue);
          const costs = Number((40 + (turnover * 0.00125) + 15).toFixed(2));
          const netPnl = Number((grossPnl - costs).toFixed(2));

          totalGrossPnl += grossPnl;
          totalCosts += costs;
          currentCapital += netPnl;

          if (currentCapital > peakCapital) peakCapital = currentCapital;
          const dd = ((peakCapital - currentCapital) / peakCapital) * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          const isWin = netPnl > 0;
          if (isWin) {
            winCount++;
            consecutiveLosses = 0;
          } else {
            consecutiveLosses++;
            if (consecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLosses;
          }

          trades.push({
            id: `tr-${trades.length + 1}`,
            entryTime: positionEntryTime,
            exitTime: timestamp,
            direction: positionDirection,
            grossPnl,
            costs,
            netPnl,
            exitReason: exitDecision.exitReason || 'TIME_EXIT'
          });

          inPosition = false;
          longLeg = null;
          shortLeg = null;
        }
      }
    }

    if(inPosition)return this.buildInsufficientDataResult(backtestId,strategy,periodStart,periodEnd,'Replay ended with unresolved option legs; no invented close',availability.minDate,availability.maxDate);
    return this.assembleResult(
      backtestId,
      strategy,
      periodStart,
      periodEnd,
      'REAL_HISTORICAL_OPTION_CHAIN',
      trades,
      totalGrossPnl,
      totalCosts,
      winCount,
      maxConsecutiveLosses,
      maxDrawdown,
      peakCapital,
      availability
    );
  }

  /**
   * Replays real underlying 15m candles with Black-Scholes modeled options pricing
   */
  private replayUnderlyingCandles(
    config: BacktestConfig,
    backtestId: string,
    underlying: string,
    availability: any
  ): BacktestResult {
    const { strategy, periodStart, periodEnd } = config;
    const rawDb = dbEngine.getRawDatabase();

    const candles = rawDb.prepare(`
      SELECT *
      FROM ema_15m_candles
      WHERE instrument = ? AND timeframe='15m' AND is_closed=1
        AND timestamp >= ?
        AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(underlying, periodStart, periodEnd) as any[];

    const lotSize = underlying === 'BANKNIFTY' ? 15 : 25;
    const strikeStep = underlying === 'BANKNIFTY' ? 100 : 50;
    const trades: SimulatedTrade[] = [];

    let inPosition = false;
    let positionEntryTime = '';
    let positionDirection = 'BULLISH';
    let entryCost = 0;
    let entrySpot = 0;
    let longStrike = 0;
    let shortStrike = 0;
    let entryDte = (strategy as any).parameters?.minDte ?? (strategy as any).rules?.minDte ?? 2;
    let currentHoldingBars = 0;
    let consecutiveAdverseCloses = 0;

    let totalGrossPnl = 0;
    let totalCosts = 0;
    let maxDrawdown = 0;
    let peakCapital = config.initialCapital || 1000000;
    let currentCapital = peakCapital;
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    let winCount = 0;

    // Running session VWAP
    let sessionVolume = 0;
    let sessionVolPrice = 0;
    let currentSessionDate = '';

    for (const candle of candles) {
      const candleDate = candle.timestamp.slice(0, 10);
      if (candleDate !== currentSessionDate) {
        currentSessionDate = candleDate;
        sessionVolume = 0;
        sessionVolPrice = 0;
      }

      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      sessionVolume += candle.volume || 1000;
      sessionVolPrice += typicalPrice * (candle.volume || 1000);
      const vwap = sessionVolume > 0 ? sessionVolPrice / sessionVolume : candle.close;

      const context: StrategyDecisionContext = {
        symbol: underlying,
        spotPrice: candle.close,
        vwap,
        ema20: candle.ema_23,
        ema23: candle.ema_23,
        ema50: candle.ema_50,
        emaDifference: candle.ema_difference,
        signal: candle.signal,
        pcr: candle.ema_difference >= 0 ? 1.15 : 0.85,
        ivRank: 40,
        indiaVix: 14.2,
        isSpotLive: true,
        holdingPeriods: currentHoldingBars,
        consecutiveAdverseCloses
      };

      if (!inPosition) {
        const entryDecision = evaluateStrategyEntry(strategy, context);
        if (entryDecision.shouldEnter) {
          inPosition = true;
          positionEntryTime = candle.timestamp;
          positionDirection = entryDecision.direction;
          entrySpot = candle.close;
          currentHoldingBars = 0;
          consecutiveAdverseCloses = 0;
          entryDte = (strategy as any).parameters?.minDte ?? (strategy as any).rules?.minDte ?? 2;

          const atmStrike = Math.round(candle.close / strikeStep) * strikeStep;
          if (positionDirection === 'BEARISH') {
            longStrike = atmStrike;
            shortStrike = atmStrike - strikeStep;
          } else {
            longStrike = atmStrike;
            shortStrike = atmStrike + strikeStep;
          }

          // Price entry legs with Black-Scholes
          const tYears = Math.max(0.001, entryDte / 365);
          const isCall = positionDirection !== 'BEARISH';
          const longGreeks = calculateEuropeanOptionGreeks(candle.close, longStrike, tYears, 0.065, 0.14, isCall);
          const shortGreeks = calculateEuropeanOptionGreeks(candle.close, shortStrike, tYears, 0.065, 0.14, isCall);

          // Apply bid-ask half-spread friction
          const longEntryPremium = longGreeks.price * 1.005;
          const shortEntryPremium = shortGreeks.price * 0.995;
          entryCost = Math.max(10, (longEntryPremium - shortEntryPremium) * lotSize);
        }
      } else {
        currentHoldingBars++;
        const currentDte = Math.max(0.1, entryDte - (currentHoldingBars / 25)); // 25 15m bars per day
        const tYears = Math.max(0.001, currentDte / 365);
        const isCall = positionDirection !== 'BEARISH';

        // Check adverse signal
        if ((positionDirection === 'BULLISH' && candle.signal === 'BEARISH') ||
            (positionDirection === 'BEARISH' && candle.signal === 'BULLISH')) {
          consecutiveAdverseCloses++;
        } else {
          consecutiveAdverseCloses = 0;
        }

        const longGreeks = calculateEuropeanOptionGreeks(candle.close, longStrike, tYears, 0.065, 0.14, isCall);
        const shortGreeks = calculateEuropeanOptionGreeks(candle.close, shortStrike, tYears, 0.065, 0.14, isCall);

        const curLongPrice = longGreeks.price * 0.995; // exit on bid
        const curShortPrice = shortGreeks.price * 1.005; // exit on ask
        const currentValue = (curLongPrice - curShortPrice) * lotSize;
        const unrealizedPnl = currentValue - entryCost;
        const portfolioPnlPercent = entryCost > 0 ? (unrealizedPnl / entryCost) * 100 : 0;

        const exitDecision = evaluateStrategyExit(strategy, {
          ...context,
          portfolioPnl: unrealizedPnl,
          portfolioPnlPercent,
          dte: currentDte,
          holdingPeriods: currentHoldingBars,
          consecutiveAdverseCloses
        });

        if (exitDecision.shouldExit || currentHoldingBars >= 50) {
          const grossPnl = Number(unrealizedPnl.toFixed(2));
          // Realistic friction: ₹40 Brokerage + 0.125% STT + GST + turnover
          const turnover = (entryCost + Math.abs(currentValue));
          const costs = Number((40 + (turnover * 0.00125) + 12).toFixed(2));
          const netPnl = Number((grossPnl - costs).toFixed(2));

          totalGrossPnl += grossPnl;
          totalCosts += costs;
          currentCapital += netPnl;

          if (currentCapital > peakCapital) peakCapital = currentCapital;
          const dd = ((peakCapital - currentCapital) / peakCapital) * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          const isWin = netPnl > 0;
          if (isWin) {
            winCount++;
            consecutiveLosses = 0;
          } else {
            consecutiveLosses++;
            if (consecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLosses;
          }

          trades.push({
            id: `tr-${trades.length + 1}`,
            entryTime: positionEntryTime,
            exitTime: candle.timestamp,
            direction: positionDirection,
            grossPnl,
            costs,
            netPnl,
            exitReason: exitDecision.exitReason || 'TIME_EXIT'
          });

          inPosition = false;
        }
      }
    }

    // Mark-to-market close if still open at end of historical replay window
    if (inPosition && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const currentDte = Math.max(0.01, entryDte - (currentHoldingBars / 25));
      const tYears = Math.max(0.001, currentDte / 365);
      const isCall = positionDirection !== 'BEARISH';
      const longGreeks = calculateEuropeanOptionGreeks(lastCandle.close, longStrike, tYears, 0.065, 0.14, isCall);
      const shortGreeks = calculateEuropeanOptionGreeks(lastCandle.close, shortStrike, tYears, 0.065, 0.14, isCall);
      const curLongPrice = longGreeks.price * 0.995;
      const curShortPrice = shortGreeks.price * 1.005;
      const currentValue = (curLongPrice - curShortPrice) * lotSize;
      const unrealizedPnl = currentValue - entryCost;
      const grossPnl = Number(unrealizedPnl.toFixed(2));
      const turnover = (entryCost + Math.abs(currentValue));
      const costs = Number((40 + (turnover * 0.00125) + 12).toFixed(2));
      const netPnl = Number((grossPnl - costs).toFixed(2));

      totalGrossPnl += grossPnl;
      totalCosts += costs;
      currentCapital += netPnl;

      if (currentCapital > peakCapital) peakCapital = currentCapital;
      const dd = ((peakCapital - currentCapital) / peakCapital) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;

      if (netPnl > 0) {
        winCount++;
      } else {
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, 1);
      }

      trades.push({
        id: `tr-${trades.length + 1}`,
        entryTime: positionEntryTime,
        exitTime: lastCandle.timestamp,
        direction: positionDirection,
        grossPnl,
        costs,
        netPnl,
        exitReason: 'PERIOD_END'
      });
      inPosition = false;
    }

    return this.assembleResult(
      backtestId,
      strategy,
      periodStart,
      periodEnd,
      'MODELED_OPTIONS_ON_REAL_UNDERLYING',
      trades,
      totalGrossPnl,
      totalCosts,
      winCount,
      maxConsecutiveLosses,
      maxDrawdown,
      peakCapital,
      availability
    );
  }

  /**
   * Computes comprehensive empirical statistics and saves result to DB
   */
  private assembleResult(
    backtestId: string,
    strategy: StrategyDefinition,
    periodStart: string,
    periodEnd: string,
    dataSource: 'REAL_HISTORICAL_OPTION_CHAIN' | 'MODELED_OPTIONS_ON_REAL_UNDERLYING',
    trades: SimulatedTrade[],
    totalGrossPnl: number,
    totalCosts: number,
    winCount: number,
    maxConsecutiveLosses: number,
    maxDrawdown: number,
    peakCapital: number,
    availability: any
  ): BacktestResult {
    const stats=replayStatistics(trades.map(t=>t.netPnl),JSON.stringify([strategy.id,strategy.version,periodStart,periodEnd]));
    if(!stats||!Number.isFinite(maxDrawdown)||!Number.isFinite(peakCapital)||peakCapital<=0)
      return this.buildInsufficientDataResult(backtestId,strategy,periodStart,periodEnd,'Invalid replay statistics',availability.minDate,availability.maxDate);
    // Legacy numeric API fields use 0 for unavailable ratios. They are not
    // positive evidence. No untouched OOS or validated cost model is supplied.
    const round=(n:number|null,d=2)=>n===null?0:Number(n.toFixed(d));
    const {sampleSize,avgWin,avgLoss}=stats;
    const totalNetPnl=stats.total;
    const winRate=round(stats.winRate,1),lossRate=round(stats.lossRate,1);
    const profitFactor=round(stats.profitFactor),expectancyR=round(stats.expectancyR);
    const sharpeRatio=round(stats.ratio),sortinoRatio=round(stats.sortino);
    const calmarRatio=0; // annualized return unavailable
    const [mcP5,mcP50,mcP95]=stats.bootstrap??[0,0,0];
    const passedGates=false;
    const result: BacktestResult = {
      id: backtestId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      strategyVersion: strategy.version,
      periodStart,
      periodEnd,
      dataSource,
      status: 'COMPLETED',
      evidenceStatus:'UNVERIFIED_STORED_REPLAY',
      availableDataRange: {
        minDate: availability.minDate,
        maxDate: availability.maxDate
      },
      sampleSize,
      winRate,
      lossRate,
      totalGrossPnl: Math.round(totalGrossPnl),
      totalTransactionCosts: Math.round(totalCosts),
      totalNetPnl: Math.round(totalNetPnl),
      expectancyR,
      profitFactor,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdownPct: Number(maxDrawdown.toFixed(1)),
      avgWin: Math.round(avgWin),
      avgLoss: Math.round(avgLoss),
      consecutiveLossesMax: maxConsecutiveLosses,
      walkForwardPassed: false,
      oosSharpe: 0,
      monteCarloP5: Math.round(mcP5),
      monteCarloP50: Math.round(mcP50),
      monteCarloP95: Math.round(mcP95),
      overfitWarning: true,
      deflatedSharpeScore: 0,
      passedGates,
      failureReason: 'Descriptive replay only; independent OOS, validated costs, provenance and annualized metrics not established. Undefined ratios use legacy zero sentinel.',
      trades: trades.slice(-50)
    };

    // Save to database
    dbEngine.saveQuantBacktest(result);
    return result;
  }

  /**
   * Helper returning honest INSUFFICIENT_HISTORICAL_DATA response
   */
  private buildInsufficientDataResult(
    backtestId: string,
    strategy: StrategyDefinition,
    periodStart: string,
    periodEnd: string,
    reason: string,
    minDate: string,
    maxDate: string
  ): BacktestResult {
    const result: BacktestResult = {
      id: backtestId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      strategyVersion: strategy.version,
      periodStart,
      periodEnd,
      dataSource: 'INSUFFICIENT_HISTORICAL_DATA',
      status: 'INSUFFICIENT_HISTORICAL_DATA',
      evidenceStatus:'INSUFFICIENT_DATA',
      availableDataRange: {
        minDate: minDate || '',
        maxDate: maxDate || ''
      },
      sampleSize: 0,
      winRate: 0,
      lossRate: 0,
      totalGrossPnl: 0,
      totalTransactionCosts: 0,
      totalNetPnl: 0,
      expectancyR: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdownPct: 0,
      avgWin: 0,
      avgLoss: 0,
      consecutiveLossesMax: 0,
      walkForwardPassed: false,
      oosSharpe: 0,
      monteCarloP5: 0,
      monteCarloP50: 0,
      monteCarloP95: 0,
      overfitWarning: false,
      deflatedSharpeScore: 0,
      passedGates: false,
      failureReason: reason,
      trades: []
    };

    dbEngine.saveQuantBacktest(result);
    return result;
  }
}

export const backtestEngine = BacktestEngine.getInstance();
