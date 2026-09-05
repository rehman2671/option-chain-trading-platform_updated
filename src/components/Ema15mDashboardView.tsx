/**
 * 15-Minute 23 EMA / 50 EMA Crossover Alert System Dashboard
 * Dedicated analytical interface for NIFTY 50, BANK NIFTY, and BSE SENSEX.
 * Includes Live Cards, 15m Candlestick Chart with EMA Overlays, Signal History,
 * Backtesting Engine, Sound Alerts (Web Audio API), and Notification Config.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bell,
  Volume2,
  VolumeX,
  TrendingUp,
  TrendingDown,
  Clock,
  Send,
  Sliders,
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Radio,
  BarChart2,
  Calendar,
  X,
  Layers,
  Sparkles,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Mail
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import {
  Ema15mInstrument,
  Ema15mInstrumentStatus,
  Ema15mCandle,
  Ema15mSignal,
  EmaNotificationSettings,
  Ema15mBacktestResult,
  EmaPaperTrade,
  EmaPaperTradingSummary
} from '../types.js';
import { ExpertTraderChart } from './ExpertTraderChart.js';

export const Ema15mDashboardView: React.FC = () => {
  const { user } = useAuth();
  // State
  const [instrumentsStatus, setInstrumentsStatus] = useState<Ema15mInstrumentStatus[]>([]);
  const [marketHours, setMarketHours] = useState<{ isMarketOpen: boolean; message: string; istTime: string } | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<Ema15mInstrument>('NIFTY');
  const [timeframe, setTimeframe] = useState<string>('15m');
  const [candles, setCandles] = useState<Ema15mCandle[]>([]);
  const [signals, setSignals] = useState<Ema15mSignal[]>([]);
  const [paperTrades, setPaperTrades] = useState<EmaPaperTrade[]>([]);
  const [paperSummary, setPaperSummary] = useState<EmaPaperTradingSummary | null>(null);
  const [isClosingTradeId, setIsClosingTradeId] = useState<string | null>(null);
  const [signalFilterSymbol, setSignalFilterSymbol] = useState<string>('ALL');
  const [signalFilterType, setSignalFilterType] = useState<string>('ALL');
  const [paperTradeFilterSymbol, setPaperTradeFilterSymbol] = useState<string>('ALL');
  const [paperTradeFilterStatus, setPaperTradeFilterStatus] = useState<string>('ALL');
  const [candleLimit, setCandleLimit] = useState<number>(2000);
  const [selectedRange, setSelectedRange] = useState<string>('5D');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Active view tab inside EMA dashboard (CHART, PAPER_TRADES, HISTORY, BACKTEST)
  const [activeSubTab, setActiveSubTab] = useState<'CHART' | 'PAPER_TRADES' | 'HISTORY' | 'BACKTEST'>('CHART');

  // Notification Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [showBotToken, setShowBotToken] = useState<boolean>(false);
  const [settings, setSettings] = useState<EmaNotificationSettings>({
    telegramEnabled: true,
    emailEnabled: false,
    browserEnabled: true,
    soundEnabled: true,
    telegramChatId: '',
    telegramBotToken: '',
    emailAddress: '',
    soundVolume: 0.8
  });
  const [testResult, setTestResult] = useState<{ channel: string; message: string; success: boolean } | null>(null);
  const [isTestingNotif, setIsTestingNotif] = useState<boolean>(false);

  // Sound Alerts Mute / Unmute State
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);

  // Backtest State
  const [backtestInstrument, setBacktestInstrument] = useState<Ema15mInstrument>('NIFTY');
  const [backtestResult, setBacktestResult] = useState<Ema15mBacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);

  // Hovered Candle for Tooltip
  const [hoveredCandle, setHoveredCandle] = useState<Ema15mCandle | null>(null);

  // Audio Context for synthetic sound chimes (Bullish ascending chime / Bearish descending chime)
  const playChime = (type: 'BULLISH' | 'BEARISH' | 'TEST') => {
    if (isSoundMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'BULLISH' || type === 'TEST') {
        // Ascending harmonic chime: C5 -> E5 -> G5 -> C6
        const freqs = [523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.4);
        });
      } else {
        // Descending warning chime: G5 -> Eb5 -> C5
        const freqs = [783.99, 622.25, 523.25];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.1);
          osc.stop(ctx.currentTime + idx * 0.1 + 0.45);
        });
      }
    } catch {
      // AudioContext unavailable or blocked by user gesture policy
    }
  };

  // Fetch Status, Candles, Signals, Paper Trades, and Summary
  const fetchData = async () => {
    try {
      const rangeParams = customStartDate && customEndDate
        ? `&startDate=${customStartDate}&endDate=${customEndDate}`
        : `&range=${selectedRange}`;

      const [statusRes, candlesRes, signalsRes, tradesRes, summaryRes] = await Promise.all([
        fetch('/api/ema15m/status'),
        fetch(`/api/ema15m/candles?symbol=${selectedSymbol}&limit=${candleLimit}&timeframe=${timeframe}${rangeParams}`),
        fetch('/api/ema15m/signals?limit=50'),
        fetch('/api/ema15m/paper-trades?limit=100'),
        fetch('/api/ema15m/paper-summary')
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setInstrumentsStatus(data.instruments || []);
        if (data.marketHours) setMarketHours(data.marketHours);
      }

      if (candlesRes.ok) {
        const candlesData = await candlesRes.json();
        setCandles(candlesData || []);
      }

      if (signalsRes.ok) {
        const signalsData = await signalsRes.json();
        setSignals(signalsData || []);
      }

      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        setPaperTrades(tradesData || []);
      }

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setPaperSummary(summaryData);
      }
    } catch (err) {
      console.warn('[EMA DASHBOARD] Error polling data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Close / Square Off Open Paper Trade
  const handleClosePaperTrade = async (id: string) => {
    setIsClosingTradeId(id);
    try {
      const res = await fetch('/api/ema15m/paper-trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reason: 'MANUAL_SQUARE_OFF' })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to close paper trade:', err);
    } finally {
      setIsClosingTradeId(null);
    }
  };

  // Toggle Auto Paper Trading
  const handleToggleAutoTrading = async () => {
    try {
      const current = settings.autoPaperTradingEnabled !== false;
      const res = await fetch('/api/ema15m/paper-trades/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !current })
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, autoPaperTradingEnabled: data.autoPaperTradingEnabled }));
        fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle auto trading:', err);
    }
  };

  // Fetch Settings
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/ema15m/settings');
      if (res.ok) {
        const data: EmaNotificationSettings = await res.json();
        // If emailAddress is empty or default noreply, prefill with authenticated user's email
        if ((!data.emailAddress || data.emailAddress.includes('noreply@aaditechs.in')) && user?.email) {
          data.emailAddress = user.email;
        }
        setSettings(data);
      }
    } catch (err) {
      console.warn('[EMA DASHBOARD] Error loading settings:', err);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/ema15m/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setIsSettingsOpen(false);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Test Notification
  const handleTestNotification = async (channel: 'TELEGRAM' | 'EMAIL') => {
    setIsTestingNotif(true);
    setTestResult(null);
    try {
      const target = channel === 'TELEGRAM' ? settings.telegramChatId : settings.emailAddress;
      const botToken = channel === 'TELEGRAM' ? settings.telegramBotToken : undefined;
      const res = await fetch('/api/ema15m/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, target, botToken })
      });
      const data = await res.json();
      setTestResult({ channel, message: data.message, success: data.success });
      if (data.success && settings.soundEnabled) {
        playChime('TEST');
      }
    } catch (err: any) {
      setTestResult({ channel, message: err.message || 'Test failed', success: false });
    } finally {
      setIsTestingNotif(false);
    }
  };

  // Run Backtest
  const handleRunBacktest = async () => {
    setIsBacktesting(true);
    try {
      const res = await fetch('/api/ema15m/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrument: backtestInstrument })
      });
      if (res.ok) {
        const result = await res.json();
        setBacktestResult(result);
      }
    } catch (err) {
      console.error('Failed to run backtest:', err);
    } finally {
      setIsBacktesting(false);
    }
  };

  // Trigger Mock Crossover
  const handleTriggerMockCrossover = async (symbol: Ema15mInstrument, targetType: 'BULLISH' | 'BEARISH') => {
    try {
      const res = await fetch('/api/ema15m/mock-crossover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, targetType })
      });
      if (res.ok) {
        playChime(targetType);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to trigger mock crossover:', err);
    }
  };

  // Request browser notification permission
  const requestBrowserPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('15-Minute EMA Alert System', {
          body: 'Browser alerts are now activated for 23/50 EMA crossovers!',
          icon: '/favicon.ico'
        });
      }
    }
  };

  useEffect(() => {
    fetchData();
    fetchSettings();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [selectedSymbol, candleLimit, timeframe, selectedRange, customStartDate, customEndDate]);

  // Filtered signals for the table
  const filteredSignals = useMemo(() => {
    return signals.filter(s => {
      const matchesSymbol = signalFilterSymbol === 'ALL' || s.instrument === signalFilterSymbol;
      const matchesType = signalFilterType === 'ALL' || s.signalType === signalFilterType;
      return matchesSymbol && matchesType;
    });
  }, [signals, signalFilterSymbol, signalFilterType]);

  // Filtered paper trades for the table
  const filteredPaperTrades = useMemo(() => {
    return paperTrades.filter(t => {
      const matchesSymbol = paperTradeFilterSymbol === 'ALL' || t.instrument === paperTradeFilterSymbol;
      const matchesStatus = paperTradeFilterStatus === 'ALL' || t.status === paperTradeFilterStatus;
      return matchesSymbol && matchesStatus;
    });
  }, [paperTrades, paperTradeFilterSymbol, paperTradeFilterStatus]);

  // Open Paper Trades
  const openPaperTrades = useMemo(() => {
    return paperTrades.filter(t => t.status === 'OPEN');
  }, [paperTrades]);

  // Selected Instrument Status Object
  const currentInstStatus = useMemo(() => {
    return instrumentsStatus.find(i => i.instrument === selectedSymbol) || null;
  }, [instrumentsStatus, selectedSymbol]);

  // SVG Chart Geometry Calculations
  const chartGeometry = useMemo(() => {
    if (candles.length === 0) return null;

    const width = 860;
    const height = 360;
    const padding = { top: 25, right: 65, bottom: 35, left: 15 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const allPrices = candles.flatMap(c => [
      c.high,
      c.low,
      c.ema23 || c.close,
      c.ema50 || c.close
    ]).filter(p => typeof p === 'number' && !isNaN(p) && p > 0);

    const minPrice = Math.min(...allPrices) * 0.998;
    const maxPrice = Math.max(...allPrices) * 1.002;
    const priceRange = maxPrice - minPrice || 1;

    const candleWidth = Math.max(4, Math.min(14, (chartW / candles.length) * 0.65));
    const stepX = chartW / Math.max(1, candles.length - 1);

    const getY = (price: number) => padding.top + chartH - ((price - minPrice) / priceRange) * chartH;
    const getX = (index: number) => padding.left + index * stepX;

    // EMA Lines Path Data
    let ema23Path = '';
    let ema50Path = '';

    candles.forEach((c, i) => {
      const x = getX(i);
      if (c.ema23 !== undefined) {
        const y = getY(c.ema23);
        ema23Path += ema23Path === '' ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
      if (c.ema50 !== undefined) {
        const y = getY(c.ema50);
        ema50Path += ema50Path === '' ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
    });

    // Detect crossover points for marker placement
    const markers: Array<{ x: number; y: number; type: 'BULLISH' | 'BEARISH'; candle: Ema15mCandle }> = [];
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];
      if (prev.ema23 && prev.ema50 && curr.ema23 && curr.ema50) {
        if (prev.ema23 <= prev.ema50 && curr.ema23 > curr.ema50) {
          markers.push({ x: getX(i), y: getY(curr.low) + 16, type: 'BULLISH', candle: curr });
        } else if (prev.ema23 >= prev.ema50 && curr.ema23 < curr.ema50) {
          markers.push({ x: getX(i), y: getY(curr.high) - 16, type: 'BEARISH', candle: curr });
        }
      }
    }

    // Y Axis Ticks
    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount }).map((_, i) => {
      const price = minPrice + (priceRange / (yTickCount - 1)) * i;
      return { price, y: getY(price) };
    });

    return {
      width,
      height,
      padding,
      chartW,
      chartH,
      minPrice,
      maxPrice,
      candleWidth,
      stepX,
      getY,
      getX,
      ema23Path,
      ema50Path,
      markers,
      yTicks
    };
  }, [candles]);

  return (
    <div className="space-y-5">
      {/* 1. Header Banner & Market Status Strip */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">15-Minute 23 / 50 EMA Alert System</h1>
              <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase">
                15M CANDLE CLOSES ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Monitoring <strong className="text-slate-200">NIFTY 50</strong>, <strong className="text-slate-200">BANK NIFTY</strong>, and <strong className="text-slate-200">BSE SENSEX</strong>. Multipliers: 2/24 (EMA23) & 2/51 (EMA50).
            </p>
          </div>
        </div>

        {/* Right Status Controls */}
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {/* Data Source Badge */}
          {paperSummary?.dataSource === 'UPSTOX_LIVE' || currentInstStatus?.dataSource === 'UPSTOX_LIVE' ? (
            <div className="flex items-center space-x-1.5 bg-emerald-950/80 border border-emerald-500/50 px-3 py-1.5 rounded-xl text-xs font-mono text-emerald-300 font-bold shadow-sm shadow-emerald-500/10">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span>UPSTOX LIVE DATA</span>
            </div>
          ) : paperSummary?.dataSource === 'LIVE_DATA_UNAVAILABLE' || currentInstStatus?.dataSource === 'LIVE_DATA_UNAVAILABLE' ? (
            <div className="flex items-center space-x-1.5 bg-amber-950/80 border border-amber-500/50 px-3 py-1.5 rounded-xl text-xs font-mono text-amber-300 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>LIVE DATA UNAVAILABLE</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 bg-cyan-950/80 border border-cyan-500/40 px-3 py-1.5 rounded-xl text-xs font-mono text-cyan-300 font-bold">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>PRACTICE SIMULATOR</span>
            </div>
          )}

          {/* Auto Paper Trading Toggle */}
          <button
            onClick={handleToggleAutoTrading}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center space-x-1.5 border transition shadow-sm ${
              settings.autoPaperTradingEnabled !== false
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Automatic Paper Trading execution on confirmed 15m candle close crossover signals"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto Paper Trade: {settings.autoPaperTradingEnabled !== false ? 'ON' : 'OFF'}</span>
          </button>

          {/* Market Status Pill */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
            <div className={`w-2 h-2 rounded-full ${marketHours?.isMarketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></div>
            <span className={marketHours?.isMarketOpen ? 'text-emerald-300' : 'text-slate-300'}>
              {marketHours?.message || 'Market Hours: 09:15 - 15:30 IST'}
            </span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              setIsSoundMuted(!isSoundMuted);
              if (isSoundMuted) playChime('TEST');
            }}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition ${
              isSoundMuted
                ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title={isSoundMuted ? 'Unmute Audio Chimes' : 'Audio Chimes Active'}
          >
            {isSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isSoundMuted ? 'Muted' : 'Sound ON'}</span>
          </button>

          {/* Notification Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center space-x-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-md shadow-cyan-600/20"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alert Settings</span>
          </button>
        </div>
      </div>

      {/* 2. Three Main Instrument Status Cards (NIFTY 50, BANK NIFTY, SENSEX) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(instrumentsStatus.length > 0 ? instrumentsStatus : [
          { instrument: 'NIFTY', displayName: 'NIFTY 50', currentPrice: 24150.8, ema23: 24120.5, ema50: 24095.1, emaDifference: 25.4, currentTrend: 'BULLISH', lastSignalType: 'BULLISH', lastSignalTime: '15m ago', lastSignalPrice: 24100, lastCompletedCandleTime: '', candleCount: 120, isMarketOpen: true, marketStatusMessage: '', isDataFeedConnected: true, isSignalEngineRunning: true, isMock: false },
          { instrument: 'BANKNIFTY', displayName: 'BANK NIFTY', currentPrice: 57420.5, ema23: 57380.2, ema50: 57450.0, emaDifference: -69.8, currentTrend: 'BEARISH', lastSignalType: 'BEARISH', lastSignalTime: '30m ago', lastSignalPrice: 57460, lastCompletedCandleTime: '', candleCount: 120, isMarketOpen: true, marketStatusMessage: '', isDataFeedConnected: true, isSignalEngineRunning: true, isMock: false },
          { instrument: 'SENSEX', displayName: 'BSE SENSEX', currentPrice: 76944.28, ema23: 76910.0, ema50: 76870.0, emaDifference: 40.0, currentTrend: 'BULLISH', lastSignalType: 'BULLISH', lastSignalTime: '45m ago', lastSignalPrice: 76900, lastCompletedCandleTime: '', candleCount: 120, isMarketOpen: true, marketStatusMessage: '', isDataFeedConnected: true, isSignalEngineRunning: true, isMock: false }
        ] as Ema15mInstrumentStatus[]).map((inst) => {
          const isSelected = selectedSymbol === inst.instrument;
          const isBullish = inst.currentTrend === 'BULLISH';
          const isBearish = inst.currentTrend === 'BEARISH';
          const diffPositive = inst.emaDifference > 0;

          return (
            <div
              key={inst.instrument}
              onClick={() => setSelectedSymbol(inst.instrument)}
              className={`cursor-pointer rounded-2xl p-5 border transition-all duration-200 relative overflow-hidden shadow-lg ${
                isSelected
                  ? 'bg-slate-900 border-cyan-500/80 ring-2 ring-cyan-500/20'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              {/* Top Row: Instrument Name & Trend Badge */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase text-slate-400 font-semibold">{inst.displayName}</span>
                  <div className="text-2xl font-black text-slate-100 font-mono tracking-tight mt-0.5">
                    ₹{inst.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Trend Badge */}
                <div
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                    isBullish
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : isBearish
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {isBullish ? <TrendingUp className="w-3.5 h-3.5" /> : isBearish ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                  <span>{inst.currentTrend}</span>
                </div>
              </div>

              {/* Middle Metrics: 23 EMA vs 50 EMA */}
              <div className="grid grid-cols-3 gap-2 bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 my-3 text-center">
                <div>
                  <div className="text-[10px] text-cyan-400 font-mono font-medium">23 EMA</div>
                  <div className="text-xs font-bold text-slate-200 font-mono mt-0.5">
                    {inst.ema23 ? inst.ema23.toFixed(2) : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-400 font-mono font-medium">50 EMA</div>
                  <div className="text-xs font-bold text-slate-200 font-mono mt-0.5">
                    {inst.ema50 ? inst.ema50.toFixed(2) : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-mono font-medium">DIFF (23-50)</div>
                  <div className={`text-xs font-bold font-mono mt-0.5 ${diffPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {diffPositive ? '+' : ''}{inst.emaDifference.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Active Paper Trade OR Last Signal */}
              {inst.activePaperTrade ? (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono bg-cyan-950/30 -mx-5 -mb-5 px-5 py-2.5">
                  <span className="flex items-center space-x-1.5 text-cyan-300 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span>PAPER {inst.activePaperTrade.direction}: ₹{inst.activePaperTrade.entryPrice}</span>
                  </span>
                  <span className={`font-bold ${inst.activePaperTrade.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    P&L: {inst.activePaperTrade.unrealizedPnl >= 0 ? '+' : ''}₹{inst.activePaperTrade.unrealizedPnl.toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400 border-t border-slate-800/60">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Last Signal:</span>
                  </span>
                  <span className={`font-semibold ${inst.lastSignalType === 'BULLISH' ? 'text-emerald-400' : inst.lastSignalType === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}`}>
                    {inst.lastSignalType === 'BULLISH' ? '▲ BULLISH CROSSOVER' : inst.lastSignalType === 'BEARISH' ? '▼ BEARISH CROSSOVER' : 'None Detected'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2.5 Paper Trading P&L Performance Summary Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200">15m EMA Auto Paper Portfolio</div>
            <div className="text-[11px] text-slate-400">
              Total Trades: <strong className="text-slate-200">{paperSummary?.totalTrades || 0}</strong> ({paperSummary?.openPositionsCount || 0} Open, {paperSummary?.closedTradesCount || 0} Closed)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2">
            <div className="text-[10px] text-slate-400">Realized P&L</div>
            <div className={`text-xs font-bold mt-0.5 ${(paperSummary?.realizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(paperSummary?.realizedPnl || 0) >= 0 ? '+' : ''}₹{(paperSummary?.realizedPnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2">
            <div className="text-[10px] text-slate-400">Unrealized MTM</div>
            <div className={`text-xs font-bold mt-0.5 ${(paperSummary?.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(paperSummary?.unrealizedPnl || 0) >= 0 ? '+' : ''}₹{(paperSummary?.unrealizedPnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2">
            <div className="text-[10px] text-slate-400">Total Net P&L</div>
            <div className={`text-xs font-black mt-0.5 ${(paperSummary?.totalNetPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(paperSummary?.totalNetPnl || 0) >= 0 ? '+' : ''}₹{(paperSummary?.totalNetPnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2">
            <div className="text-[10px] text-slate-400">Win Rate</div>
            <div className="text-xs font-bold text-cyan-400 mt-0.5">
              {(paperSummary?.winRate || 0).toFixed(1)}% ({paperSummary?.profitableTrades || 0}W / {paperSummary?.losingTrades || 0}L)
            </div>
          </div>
        </div>
      </div>

      {/* 3. Sub Navigation Tabs (Chart View, Signal History, Backtester, Mock Mode) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 flex flex-wrap items-center justify-between gap-2 shadow-md">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setActiveSubTab('CHART')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'CHART'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>15m Candlestick & EMA Chart</span>
          </button>

          <button
            onClick={() => setActiveSubTab('PAPER_TRADES')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'PAPER_TRADES'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Auto Paper Trades ({paperTrades.length})</span>
            {openPaperTrades.length > 0 && (
              <span className="bg-emerald-500 text-slate-950 font-black text-[10px] px-1.5 py-0.5 rounded-full">
                {openPaperTrades.length} Open
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('HISTORY')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'HISTORY'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Signal History & Logs ({signals.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('BACKTEST');
              if (!backtestResult) handleRunBacktest();
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'BACKTEST'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>15m Strategy Backtester</span>
          </button>
        </div>

        {/* Selected Instrument Selector */}
        <div className="flex items-center space-x-2 px-3 py-1">
          <span className="text-xs text-slate-400 font-mono">Viewing:</span>
          {(['NIFTY', 'BANKNIFTY', 'SENSEX'] as Ema15mInstrument[]).map(sym => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
                selectedSymbol === sym
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Tab 1: Expert Trader Pro Candlestick Terminal & Multi-Indicator Suite */}
      {activeSubTab === 'CHART' && (
        <div className="space-y-4">
          <ExpertTraderChart
            symbol={selectedSymbol}
            candles={candles}
            signals={signals}
            currentPrice={currentInstStatus?.currentPrice || 0}
            timeframe={timeframe}
            onTimeframeChange={(tf) => setTimeframe(tf)}
            onRefreshData={fetchData}
            isLoading={isLoading}
            selectedRange={selectedRange}
            onRangeChange={(r) => {
              setSelectedRange(r);
              setCustomStartDate('');
              setCustomEndDate('');
            }}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomDateChange={(start, end) => {
              setCustomStartDate(start);
              setCustomEndDate(end);
            }}
            isMarketOpen={currentInstStatus?.isMarketOpen ?? true}
          />
        </div>
      )}

      {/* 4.5 Tab: Auto Paper Positions & Trade History */}
      {activeSubTab === 'PAPER_TRADES' && (
        <div className="space-y-5">
          {/* Active Open Positions Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                <h2 className="text-sm font-bold text-slate-100">Active Open Paper Positions ({openPaperTrades.length})</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Auto-Entry on Confirmed 15m Crossover Closes Only
              </span>
            </div>

            {openPaperTrades.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-6 text-center text-xs text-slate-400 font-mono space-y-1">
                <p className="text-slate-300 font-semibold">No Active Open Positions</p>
                <p className="text-[11px] text-slate-500">
                  When a 15-minute candle closes confirming an EMA 23 / EMA 50 crossover on NIFTY 50, BANK NIFTY, or BSE SENSEX, the engine will automatically enter 1 paper lot and track real-time mark-to-market P&L.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {openPaperTrades.map((trade) => {
                  const isLong = trade.direction === 'LONG';
                  const isProfitable = trade.unrealizedPnl >= 0;
                  const isClosing = isClosingTradeId === trade.id;

                  return (
                    <div
                      key={trade.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 relative overflow-hidden shadow-md"
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-slate-100">{trade.instrument}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                              isLong
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {trade.direction} 1 LOT
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {trade.dataSource === 'UPSTOX_LIVE' ? '🟢 UPSTOX' : '🔷 PRACTICE'}
                        </span>
                      </div>

                      {/* Prices & MTM Grid */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-900/80 border border-slate-800/60 rounded-lg p-2.5 font-mono text-xs">
                        <div>
                          <div className="text-[10px] text-slate-500">Entry Price</div>
                          <div className="font-bold text-slate-200 mt-0.5">₹{trade.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Current Price</div>
                          <div className="font-bold text-slate-200 mt-0.5">₹{trade.currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Quantity</div>
                          <div className="font-semibold text-slate-300 mt-0.5">{trade.quantity} units</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Unrealized MTM</div>
                          <div className={`font-bold mt-0.5 ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfitable ? '+' : ''}₹{trade.unrealizedPnl.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Timestamp & Manual Square Off Button */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px] font-mono">
                        <span className="text-slate-500 text-[10px]">
                          {new Date(trade.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>

                        <button
                          onClick={() => handleClosePaperTrade(trade.id)}
                          disabled={isClosing}
                          className="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-[11px] font-bold px-2.5 py-1 rounded-lg transition"
                        >
                          {isClosing ? 'Closing...' : 'Square Off'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Paper Trade History Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-100">Paper Trade Execution Audit Ledger</h2>

              {/* Filter Controls */}
              <div className="flex items-center space-x-3 text-xs font-mono">
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400">Instrument:</span>
                  <select
                    value={paperTradeFilterSymbol}
                    onChange={(e) => setPaperTradeFilterSymbol(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
                  >
                    <option value="ALL">All Instruments</option>
                    <option value="NIFTY">NIFTY</option>
                    <option value="BANKNIFTY">BANKNIFTY</option>
                    <option value="SENSEX">SENSEX</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400">Status:</span>
                  <select
                    value={paperTradeFilterStatus}
                    onChange={(e) => setPaperTradeFilterStatus(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
                  >
                    <option value="ALL">All Status</option>
                    <option value="OPEN">Open Only</option>
                    <option value="CLOSED">Closed Only</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredPaperTrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="py-2.5 px-3">Trade ID</th>
                      <th className="py-2.5 px-3">Instrument</th>
                      <th className="py-2.5 px-3">Direction</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Entry Price</th>
                      <th className="py-2.5 px-3 text-right">Exit / Current</th>
                      <th className="py-2.5 px-3 text-right">Gross P&L</th>
                      <th className="py-2.5 px-3 text-right">Brokerage</th>
                      <th className="py-2.5 px-3 text-right">Net P&L</th>
                      <th className="py-2.5 px-3">Exit Reason</th>
                      <th className="py-2.5 px-3 text-right">Opened At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredPaperTrades.map((t) => {
                      const isClosed = t.status === 'CLOSED';
                      const pnl = isClosed ? t.netPnl : t.unrealizedPnl;
                      const isWin = pnl >= 0;

                      return (
                        <tr key={t.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">{t.id.slice(0, 14)}...</td>
                          <td className="py-2.5 px-3 font-bold text-slate-100">{t.instrument}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                t.direction === 'LONG'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-400'
                              }`}
                            >
                              {t.direction}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{t.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-slate-200">₹{t.entryPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-200">
                            ₹{isClosed && t.exitPrice ? t.exitPrice.toFixed(2) : t.currentPrice.toFixed(2)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-semibold ${(t.grossPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isClosed ? `${(t.grossPnl || 0) >= 0 ? '+' : ''}₹${(t.grossPnl || 0).toFixed(2)}` : '--'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500">
                            {isClosed ? `₹${(t.brokerage || 40).toFixed(2)}` : '--'}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-black ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}₹{pnl.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-400">
                            {isClosed ? (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                {t.exitReason || 'OPPOSITE_CROSSOVER'}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold animate-pulse">
                                OPEN POSITION
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400 text-[11px]">
                            {new Date(t.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs font-mono">
                No paper trades matching current filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Signal History & Audit Log Table */}
      {activeSubTab === 'HISTORY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-100">15-Minute EMA Crossover Signal History</h2>

            {/* Filters */}
            <div className="flex items-center space-x-3 text-xs">
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400">Instrument:</span>
                <select
                  value={signalFilterSymbol}
                  onChange={(e) => setSignalFilterSymbol(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200"
                >
                  <option value="ALL">All Instruments</option>
                  <option value="NIFTY">NIFTY 50</option>
                  <option value="BANKNIFTY">BANK NIFTY</option>
                  <option value="SENSEX">BSE SENSEX</option>
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400">Signal:</span>
                <select
                  value={signalFilterType}
                  onChange={(e) => setSignalFilterType(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200"
                >
                  <option value="ALL">All Signals</option>
                  <option value="BULLISH">Bullish Only</option>
                  <option value="BEARISH">Bearish Only</option>
                </select>
              </div>
            </div>
          </div>

          {filteredSignals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 px-3">Instrument</th>
                    <th className="py-2.5 px-3">Signal Type</th>
                    <th className="py-2.5 px-3 text-right">Close Price</th>
                    <th className="py-2.5 px-3 text-right">23 EMA</th>
                    <th className="py-2.5 px-3 text-right">50 EMA</th>
                    <th className="py-2.5 px-3 text-right">EMA Diff</th>
                    <th className="py-2.5 px-3">Candle Period</th>
                    <th className="py-2.5 px-3">Confirmed At</th>
                    <th className="py-2.5 px-3">Notification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredSignals.map(sig => {
                    const isBull = sig.signalType === 'BULLISH';
                    return (
                      <tr key={sig.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-100">{sig.instrument}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isBull
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            <span>{isBull ? '▲' : '▼'}</span>
                            <span>{sig.signalType}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                          ₹{sig.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right text-cyan-400">{sig.ema23.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-amber-400">{sig.ema50.toFixed(2)}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${sig.emaDifference > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {sig.emaDifference > 0 ? '+' : ''}{sig.emaDifference.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{new Date(sig.candleTimestamp).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-slate-400">{new Date(sig.signalConfirmedAt).toLocaleTimeString()}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                            {sig.notificationStatus || 'DELIVERED'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs">
              No crossover signals detected matching current filters.
            </div>
          )}
        </div>
      )}

      {/* 6. Tab 3: 15-Minute 23/50 EMA Backtesting Tool */}
      {activeSubTab === 'BACKTEST' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100">15-Minute 23 / 50 EMA Strategy Backtester</h2>
              <p className="text-xs text-slate-400">
                Analyzes historical 15m candle closes with entry on crossover and exit on opposite signal.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={backtestInstrument}
                onChange={(e) => setBacktestInstrument(e.target.value as Ema15mInstrument)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              >
                <option value="NIFTY">NIFTY 50</option>
                <option value="BANKNIFTY">BANK NIFTY</option>
                <option value="SENSEX">BSE SENSEX</option>
              </select>

              <button
                onClick={handleRunBacktest}
                disabled={isBacktesting}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-xl transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isBacktesting ? 'Computing...' : 'Run Backtest'}</span>
              </button>
            </div>
          </div>

          {backtestResult && (
            <div className="space-y-4">
              {/* Top Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 font-mono">TOTAL SIGNALS</div>
                  <div className="text-lg font-bold text-slate-100 font-mono mt-0.5">{backtestResult.totalSignals}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{backtestResult.bullishSignalsCount} Bull / {backtestResult.bearishSignalsCount} Bear</div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 font-mono">TOTAL TRADES</div>
                  <div className="text-lg font-bold text-slate-100 font-mono mt-0.5">{backtestResult.totalTrades}</div>
                  <div className="text-[10px] text-emerald-400 font-mono">{backtestResult.winningTrades} Win / {backtestResult.losingTrades} Loss</div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 font-mono">WIN RATE</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">{backtestResult.winRatePercent}%</div>
                  <div className="text-[10px] text-slate-500 font-mono">Profit Factor: {backtestResult.profitFactor}</div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 font-mono">TOTAL PNL (PTS)</div>
                  <div className={`text-lg font-bold font-mono mt-0.5 ${backtestResult.totalPnlPoints >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {backtestResult.totalPnlPoints >= 0 ? '+' : ''}{backtestResult.totalPnlPoints}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Avg: {backtestResult.avgPnlPointsPerTrade} pts</div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 font-mono">MAX DRAWDOWN</div>
                  <div className="text-lg font-bold text-rose-400 font-mono mt-0.5">-{backtestResult.maxDrawdownPoints} pts</div>
                  <div className="text-[10px] text-slate-500 font-mono">Peak to valley</div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 font-mono">AVG MFE / MAE</div>
                  <div className="text-xs font-bold text-slate-200 font-mono mt-1">
                    +{backtestResult.maxFavorableExcursionAvg} / -{backtestResult.maxAdverseExcursionAvg}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Points excursion</div>
                </div>
              </div>

              {/* Trade Log Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3 text-right">Entry Price</th>
                      <th className="py-2 px-3 text-right">Exit Price</th>
                      <th className="py-2 px-3 text-right">PnL (Pts)</th>
                      <th className="py-2 px-3 text-right">PnL (%)</th>
                      <th className="py-2 px-3 text-center">Bars Held</th>
                      <th className="py-2 px-3 text-right">MFE (Pts)</th>
                      <th className="py-2 px-3 text-right">MAE (Pts)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {backtestResult.trades.map((t, idx) => {
                      const isWin = t.pnlPoints > 0;
                      return (
                        <tr key={t.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.signalType === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {t.signalType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">₹{t.entryPrice.toFixed(1)}</td>
                          <td className="py-2 px-3 text-right">₹{t.exitPrice.toFixed(1)}</td>
                          <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}{t.pnlPoints.toFixed(1)}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                          </td>
                          <td className="py-2 px-3 text-center text-slate-400">{t.barsHeld}</td>
                          <td className="py-2 px-3 text-right text-emerald-400">+{t.maxFavorableExcursionPoints}</td>
                          <td className="py-2 px-3 text-right text-rose-400">-{t.maxAdverseExcursionPoints}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. Notification Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <Bell className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">15m EMA Notification Channels</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Telegram Section */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Send className="w-4 h-4 text-cyan-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-200">Telegram Alerts</span>
                      <p className="text-[11px] text-slate-400">Receive 15m EMA crossover alerts directly on Telegram</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.telegramEnabled}
                    onChange={(e) => setSettings({ ...settings, telegramEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                      Telegram Bot Token:
                    </label>
                    <div className="relative">
                      <input
                        type={showBotToken ? "text" : "password"}
                        placeholder="e.g. 7123456789:AAH7bQx..."
                        value={settings.telegramBotToken || ''}
                        onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-9 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBotToken(!showBotToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        title={showBotToken ? "Hide Token" : "Show Token"}
                      >
                        {showBotToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Create a bot on Telegram via <span className="text-cyan-400 font-mono">@BotFather</span> and paste the HTTP API token here.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                      Telegram Chat ID / Channel:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 123456789 or @your_channel"
                      value={settings.telegramChatId || ''}
                      onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Send <span className="text-cyan-400 font-mono">/start</span> to your bot first. Find your numeric Chat ID via <span className="text-cyan-400 font-mono">@userinfobot</span>.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleTestNotification('TELEGRAM')}
                  disabled={isTestingNotif}
                  className="w-full text-xs bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 text-cyan-300 font-semibold py-1.5 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{isTestingNotif ? 'Sending Test Message...' : 'Send Test Telegram Message'}</span>
                </button>
              </div>

              {/* Email Section */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-200">Email Alerts (Hostinger SMTP)</span>
                      <p className="text-[11px] text-slate-400">Receive HTML alerts with entry price, stop-loss & targets</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={(e) => setSettings({ ...settings, emailEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                    Recipient Email Address:
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. yourname@gmail.com"
                    value={settings.emailAddress || ''}
                    onChange={(e) => setSettings({ ...settings, emailAddress: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-emerald-500/80 mt-1 flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Hostinger SMTP relay is configured and operational on the server.</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleTestNotification('EMAIL')}
                  disabled={isTestingNotif}
                  className="w-full text-xs bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 font-semibold py-1.5 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                >
                  <Mail className="w-3 h-3" />
                  <span>{isTestingNotif ? 'Sending Test Email...' : 'Send Test Email Alert'}</span>
                </button>
              </div>

              {/* Automatic Paper Trading Section */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-200">Auto Paper Trade Execution</span>
                    <p className="text-[11px] text-slate-400">Execute 1 paper lot automatically on confirmed 15m candle close crossovers</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoPaperTradingEnabled !== false}
                    onChange={(e) => setSettings({ ...settings, autoPaperTradingEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Audio Chime & Browser Notification Toggles */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">Web Audio Sound Chimes</span>
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">Browser Push Notifications</span>
                  <button
                    onClick={requestBrowserPermission}
                    className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded transition"
                  >
                    Request Permission
                  </button>
                </div>
              </div>

              {/* Test Output Banner */}
              {testResult && (
                <div className={`p-3 rounded-xl text-xs font-mono border ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'}`}>
                  {testResult.message}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 border-t border-slate-800 pt-3">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition shadow-md shadow-cyan-600/20"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
