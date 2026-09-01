/**
 * Historical Option Strategy Backtester View
 * Supports Quick Manual Timeframe Presets (1D, 1W, 1M, 2M, 3M, 6M, 1Y) and Fully Custom Date Ranges
 */

import React, { useState, useEffect } from 'react';
import { BacktestConfig, BacktestResult } from '../types.js';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { 
  History, 
  Play, 
  RefreshCw, 
  Database, 
  Download, 
  Calendar, 
  Sliders, 
  Clock, 
  ShieldCheck, 
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Activity
} from 'lucide-react';

interface SyncStatus {
  isSyncing: boolean;
  currentSymbol: string;
  currentInterval: string;
  progressPercent: number;
  syncedCandlesCount: number;
  statusMessage: string;
  lastSyncTime?: string;
}

const TIMEFRAME_PRESETS: { id: '1D' | '1W' | '1M' | '2M' | '3M' | '6M' | '1Y' | 'CUSTOM'; label: string; sub: string }[] = [
  { id: '1D', label: '1 Day', sub: 'Intraday' },
  { id: '1W', label: '1 Week', sub: '7 Days' },
  { id: '1M', label: '1 Month', sub: '30 Days' },
  { id: '2M', label: '2 Months', sub: '60 Days' },
  { id: '3M', label: '3 Months', sub: '90 Days' },
  { id: '6M', label: '6 Months', sub: '180 Days' },
  { id: '1Y', label: '1 Year', sub: '365 Days' },
  { id: 'CUSTOM', label: 'Custom Range', sub: 'Manual Dates' }
];

export const BacktesterView: React.FC = () => {
  const [config, setConfig] = useState<BacktestConfig>({
    symbol: 'NIFTY',
    startDate: '2024-01-01',
    endDate: '2026-08-31',
    timeframePreset: 'CUSTOM',
    candleInterval: '15m',
    initialCapital: 500000,
    strategyType: 'SHORT_STRADDLE',
    slippagePercent: 0.5,
    targetProfitPercent: 15,
    stopLossPercent: 10
  });

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/historical/sync-status');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      console.error('Error fetching sync status:', e);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleTimeframePreset = (preset: '1D' | '1W' | '1M' | '2M' | '3M' | '6M' | '1Y' | 'CUSTOM') => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const end = formatDate(today);
    let start = '2024-01-01';
    let interval: '1m' | '5m' | '15m' | '30m' | '60m' | '1d' = '15m';

    if (preset === '1D') {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      start = formatDate(d);
      interval = '5m';
    } else if (preset === '1W') {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      start = formatDate(d);
      interval = '15m';
    } else if (preset === '1M') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 1);
      start = formatDate(d);
      interval = '15m';
    } else if (preset === '2M') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 2);
      start = formatDate(d);
      interval = '30m';
    } else if (preset === '3M') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      start = formatDate(d);
      interval = '60m';
    } else if (preset === '6M') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      start = formatDate(d);
      interval = '1d';
    } else if (preset === '1Y') {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      start = formatDate(d);
      interval = '1d';
    }

    setConfig(prev => ({
      ...prev,
      timeframePreset: preset,
      startDate: preset === 'CUSTOM' ? prev.startDate : start,
      endDate: preset === 'CUSTOM' ? prev.endDate : end,
      candleInterval: interval
    }));
  };

  const handleStartHistoricalSync = async () => {
    try {
      const res = await fetch('/api/historical/sync-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      console.error('Error starting historical sync:', e);
    }
  };

  const handleRunBacktest = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data: BacktestResult = await res.json();
      setResult(data);
    } catch (e) {
      console.error('Error running backtest:', e);
    } finally {
      setIsRunning(false);
    }
  };

  // Calculate days span
  const calculateDaysSpan = () => {
    const s = new Date(config.startDate).getTime();
    const e = new Date(config.endDate).getTime();
    if (isNaN(s) || isNaN(e)) return 0;
    return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
  };

  const daysSpan = calculateDaysSpan();

  // Export trades to CSV
  const handleExportCsv = () => {
    if (!result || !result.trades || result.trades.length === 0) return;
    const headers = ['Trade ID', 'Entry Date', 'Exit Date', 'Strategy', 'Entry Spot', 'Exit Spot', 'P&L (₹)', 'P&L %', 'Result', 'Reason'];
    const rows = result.trades.map(t => [
      t.tradeId,
      t.entryDate,
      t.exitDate,
      t.strategy,
      t.underlyingEntry,
      t.underlyingExit,
      t.pnl,
      t.pnlPercent,
      t.result,
      `"${t.reason.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Backtest_${config.symbol}_${config.startDate}_to_${config.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredTrades = result?.trades.filter(t => {
    if (filterResult === 'ALL') return true;
    return t.result === filterResult;
  }) || [];

  return (
    <div className="space-y-6 font-mono text-xs max-w-7xl mx-auto">
      {/* Historical Database Sync Banner */}
      <div id="backtester-sync-banner" className="bg-slate-900/90 border border-emerald-500/30 p-4 rounded-xl shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>SQLite Historical Market Feed Sync</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Jan 2024 - Present
                </span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Local database populates 1m, 5m, 15m, 30m, 1h, and Daily tick archives for instant zero-latency backtesting.
              </p>
            </div>
          </div>

          <button
            id="btn-sync-historical"
            onClick={handleStartHistoricalSync}
            disabled={syncStatus?.isSyncing}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-4 py-2 rounded-lg flex items-center space-x-2 transition disabled:opacity-50 text-xs shrink-0"
          >
            {syncStatus?.isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Syncing Database ({syncStatus.progressPercent}%)...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Sync Jan 2024 - Present Data</span>
              </>
            )}
          </button>
        </div>

        {/* Sync Status Progress */}
        {syncStatus && (syncStatus.isSyncing || syncStatus.syncedCandlesCount > 0) && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex justify-between text-[11px] text-slate-300 font-semibold">
              <span className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{syncStatus.statusMessage}</span>
              </span>
              <span className="text-emerald-400 font-bold">{syncStatus.syncedCandlesCount.toLocaleString()} Candles Stored</span>
            </div>
            {syncStatus.isSyncing && (
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                  style={{ width: `${syncStatus.progressPercent}%` }}
                ></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Backtest Configuration Form */}
      <div id="backtester-config-card" className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">Historical Strategy Backtesting Studio</h3>
              <p className="text-[10px] text-slate-400">Deterministic Replay Engine with multi-timeframe manual controls</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700 font-medium">
              Span: <strong className="text-emerald-400">{daysSpan} Days</strong> ({config.startDate} → {config.endDate})
            </span>
          </div>
        </div>

        {/* 1. Timeframe Selection Bar (Manual Presets + Custom Range) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Select Time Horizon / Duration</span>
            </label>
            <span className="text-[10px] text-slate-400">Choose quick manual preset or select custom dates</span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {TIMEFRAME_PRESETS.map((p) => {
              const isActive = config.timeframePreset === p.id;
              return (
                <button
                  key={p.id}
                  id={`btn-preset-${p.id.toLowerCase()}`}
                  onClick={() => handleTimeframePreset(p.id)}
                  className={`py-2 px-2 rounded-lg border text-center transition flex flex-col items-center justify-center ${
                    isActive
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50 ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="font-black text-[11px] leading-tight">{p.label}</span>
                  <span className="text-[9px] text-slate-400 font-normal mt-0.5">{p.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Custom Date Range Pickers & Candle Resolution */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800/80">
          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold flex items-center space-x-1">
              <span>Start Date (From)</span>
            </label>
            <input
              id="input-start-date"
              type="date"
              value={config.startDate}
              onChange={(e) => {
                setConfig({ ...config, startDate: e.target.value, timeframePreset: 'CUSTOM' });
              }}
              className="w-full bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold flex items-center space-x-1">
              <span>End Date (To)</span>
            </label>
            <input
              id="input-end-date"
              type="date"
              value={config.endDate}
              onChange={(e) => {
                setConfig({ ...config, endDate: e.target.value, timeframePreset: 'CUSTOM' });
              }}
              className="w-full bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold flex items-center space-x-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Candle Resolution (Interval)</span>
            </label>
            <select
              id="select-candle-interval"
              value={config.candleInterval || '15m'}
              onChange={(e) => setConfig({ ...config, candleInterval: e.target.value as any })}
              className="w-full bg-slate-900 text-cyan-300 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1 text-xs focus:border-cyan-500 focus:outline-none"
            >
              <option value="1m">1 Minute (Ultra High Scalp)</option>
              <option value="5m">5 Minutes (Intraday Momentum)</option>
              <option value="15m">15 Minutes (Standard Option Spread)</option>
              <option value="30m">30 Minutes (Session Swing)</option>
              <option value="60m">1 Hour (Interday Positional)</option>
              <option value="1d">1 Day (EOD Daily Trend)</option>
            </select>
          </div>
        </div>

        {/* 3. Instrument, Strategy & Risk Setup */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold">Underlying Symbol</label>
            <select
              id="select-backtest-symbol"
              value={config.symbol}
              onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
              className="w-full bg-slate-950 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1"
            >
              <option value="NIFTY">NIFTY 50 (Index)</option>
              <option value="BANKNIFTY">BANKNIFTY (Index)</option>
              <option value="FINNIFTY">FINNIFTY (Financial Services)</option>
              <option value="MIDCPNIFTY">MIDCPNIFTY (Midcap Select)</option>
              <option value="RELIANCE">RELIANCE (F&O Stock)</option>
              <option value="TCS">TCS (F&O Stock)</option>
              <option value="HDFCBANK">HDFCBANK (F&O Stock)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold">Strategy Model</label>
            <select
              id="select-backtest-strategy"
              value={config.strategyType}
              onChange={(e) => setConfig({ ...config, strategyType: e.target.value as any })}
              className="w-full bg-slate-950 text-emerald-400 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1"
            >
              <option value="SHORT_STRADDLE">Short Straddle (Delta Neutral)</option>
              <option value="IRON_CONDOR">Iron Condor (Defined Risk 4-Leg)</option>
              <option value="BULL_CALL_SPREAD">Bull Call Spread (Directional)</option>
              <option value="OI_BUILDUP_MOMENTUM">OI Buildup Momentum</option>
              <option value="LONG_CALL">Long Call Momentum Breakout</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold">Target Profit %</label>
            <input
              id="input-target-profit"
              type="number"
              value={config.targetProfitPercent}
              onChange={(e) => setConfig({ ...config, targetProfitPercent: Number(e.target.value) })}
              className="w-full bg-slate-950 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1"
            />
          </div>

          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold">Stop Loss %</label>
            <input
              id="input-stop-loss"
              type="number"
              value={config.stopLossPercent}
              onChange={(e) => setConfig({ ...config, stopLossPercent: Number(e.target.value) })}
              className="w-full bg-slate-950 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1"
            />
          </div>
        </div>

        {/* Capital & Slippage row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-slate-400 text-[10px] uppercase font-semibold">Initial Backtest Capital (₹)</label>
              <div className="flex space-x-1.5">
                {[100000, 500000, 1000000, 2500000].map(cap => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => setConfig({ ...config, initialCapital: cap })}
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      config.initialCapital === cap 
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold' 
                        : 'border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ₹{cap >= 100000 ? `${cap / 100000}L` : cap}
                  </button>
                ))}
              </div>
            </div>
            <input
              id="input-initial-capital"
              type="number"
              value={config.initialCapital}
              onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
              className="w-full bg-slate-950 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg font-bold mt-1"
            />
          </div>

          <div>
            <label className="text-slate-400 text-[10px] uppercase font-semibold">Execution Slippage & Friction (%)</label>
            <div className="flex items-center space-x-2 mt-1">
              <input
                id="input-slippage"
                type="number"
                step="0.1"
                value={config.slippagePercent}
                onChange={(e) => setConfig({ ...config, slippagePercent: Number(e.target.value) })}
                className="w-full bg-slate-950 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg font-bold"
              />
              <span className="text-[10px] text-slate-400 whitespace-nowrap">Bid-Ask buffer</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="text-[11px] text-slate-400 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Zero Look-Ahead Bias • Historical SQLite Archive & Real Market Quotes</span>
          </div>

          <button
            id="btn-run-backtest"
            onClick={handleRunBacktest}
            disabled={isRunning}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold px-6 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 transition disabled:opacity-50 text-xs"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Simulating Replay ({daysSpan} Days)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Run Historical Backtest</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Backtest Results Section */}
      {result && (
        <div id="backtest-results-container" className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Win Rate %</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{result.winRatePercent}%</div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-1">
                <span className="text-emerald-400 font-bold">{result.winningTrades} W</span>
                <span>/</span>
                <span className="text-rose-400 font-bold">{result.losingTrades} L</span>
                <span>({result.totalTrades} Total)</span>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Total Return %</div>
              <div className={`text-2xl font-black mt-1 ${result.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.totalReturnPercent >= 0 ? '+' : ''}{result.totalReturnPercent}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Net Profit: <strong className={result.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {result.totalProfit >= 0 ? '+' : ''}₹{result.totalProfit.toLocaleString('en-IN')}
                </strong>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Max Drawdown %</div>
              <div className="text-2xl font-black text-rose-400 mt-1">{result.maxDrawdownPercent}%</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Peak-to-trough drop</div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Sharpe Ratio / Profit Factor</div>
              <div className="text-2xl font-black text-cyan-300 mt-1">{result.sharpeRatio} / {result.profitFactor}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Risk-adjusted metric</div>
            </div>
          </div>

          {/* Equity Curve Chart */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>Strategy Equity Growth Curve</span>
                </h3>
                <p className="text-[10px] text-slate-400">Capital trajectory across simulated timeframe ({config.startDate} to {config.endDate})</p>
              </div>
              <span className="text-[10px] bg-slate-800 px-2.5 py-1 rounded text-slate-300 border border-slate-700">
                Resolution: {config.candleInterval || '15m'}
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis 
                    stroke="#94a3b8" 
                    tick={{ fontSize: 9 }} 
                    tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} 
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Portfolio Capital']}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trade Log */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Replayed Trade Execution Log ({result.trades.length} Total Trades)</span>
                </h3>
                <p className="text-[10px] text-slate-400">Tick-by-tick entries, exits, option premium decay and trigger causes</p>
              </div>

              <div className="flex items-center space-x-2">
                {/* Filter buttons */}
                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setFilterResult('ALL')}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                      filterResult === 'ALL' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({result.trades.length})
                  </button>
                  <button
                    onClick={() => setFilterResult('WIN')}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                      filterResult === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Wins ({result.winningTrades})
                  </button>
                  <button
                    onClick={() => setFilterResult('LOSS')}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                      filterResult === 'LOSS' ? 'bg-rose-500/20 text-rose-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Losses ({result.losingTrades})
                  </button>
                </div>

                {/* Export CSV button */}
                <button
                  onClick={handleExportCsv}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-lg border border-slate-700 flex items-center space-x-1.5 text-[10px] font-bold transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {filteredTrades.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No trades matching the current filter.</div>
            ) : (
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-2">Trade ID</th>
                      <th className="py-2.5 px-2">Entry Date</th>
                      <th className="py-2.5 px-2">Exit Date</th>
                      <th className="py-2.5 px-2">Entry Spot</th>
                      <th className="py-2.5 px-2">Exit Spot</th>
                      <th className="py-2.5 px-2 text-right">P&L (₹)</th>
                      <th className="py-2.5 px-2 text-right">P&L %</th>
                      <th className="py-2.5 px-2 text-center">Result</th>
                      <th className="py-2.5 px-3">Execution Trigger & Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredTrades.map((t) => (
                      <tr key={t.tradeId} className="hover:bg-slate-800/50 transition">
                        <td className="py-2 px-2 font-bold text-slate-300">{t.tradeId}</td>
                        <td className="py-2 px-2 text-slate-400">{t.entryDate}</td>
                        <td className="py-2 px-2 text-slate-400">{t.exitDate}</td>
                        <td className="py-2 px-2 font-bold text-slate-200">₹{t.underlyingEntry}</td>
                        <td className="py-2 px-2 font-bold text-slate-200">₹{t.underlyingExit}</td>
                        <td className={`py-2 px-2 text-right font-black ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toLocaleString('en-IN')}
                        </td>
                        <td className={`py-2 px-2 text-right font-bold ${t.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent}%
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-black ${
                            t.result === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {t.result === 'WIN' ? <CheckCircle2 className="w-3 h-3 mr-0.5" /> : <XCircle className="w-3 h-3 mr-0.5" />}
                            <span>{t.result}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[10px] max-w-md truncate" title={t.reason}>
                          {t.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
