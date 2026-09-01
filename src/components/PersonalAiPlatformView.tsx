/**
 * Personal AI Trading Platform - Multi-Asset & Multi-Strategy Master Hub
 * Integrates 5 Core Trading Pillars:
 * 1. EQUITY INTRADAY (VWAP/Mean Reversion, Momentum, Breakout, Volatility Expansion, Microstructure)
 * 2. EQUITY SHORT-TERM / SWING (Momentum, Breakout, Trend Following, Multi-Timeframe)
 * 3. EQUITY LONG-TERM (Trend Following, Relative Strength, Sector Rotation, Fundamental/Quality Layer)
 * 4. F&O (Futures Momentum, Futures Breakout, Volatility, Options/OI, IV/Greeks, Expiry-aware Strategies)
 * 5. COMMODITIES (Trend Following, Breakout, Momentum, Volatility Expansion, Multi-Timeframe)
 */

import React, { useState, useEffect } from 'react';
import {
  TradingPillar,
  TradingPillarId,
  AnyStrategySubId,
  MarketSignal,
  MultiAssetQuote,
  SectorRotationData,
  StrategyDescriptor
} from '../types.js';
import { apiFetch } from '../lib/api.js';
import {
  Zap,
  TrendingUp,
  Landmark,
  Layers,
  Coins,
  ShieldCheck,
  Activity,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  PlayCircle,
  Clock,
  Compass,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  BarChart3,
  Sliders,
  Sparkles,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

interface PersonalAiPlatformViewProps {
  onSelectSymbol?: (symbol: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export const PersonalAiPlatformView: React.FC<PersonalAiPlatformViewProps> = ({
  onSelectSymbol,
  onNavigateTab
}) => {
  const [taxonomy, setTaxonomy] = useState<TradingPillar[]>([]);
  const [selectedPillarId, setSelectedPillarId] = useState<TradingPillarId | 'ALL'>('ALL');
  const [selectedStrategyId, setSelectedStrategyId] = useState<AnyStrategySubId | null>(null);
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [assetQuotes, setAssetQuotes] = useState<MultiAssetQuote[]>([]);
  const [sectorRotation, setSectorRotation] = useState<SectorRotationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExecutingSignal, setIsExecutingSignal] = useState<string | null>(null);
  const [executionMessage, setExecutionMessage] = useState<{ id: string; text: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'SIGNALS' | 'TAXONOMY_TREE' | 'ASSET_SCANNER' | 'SECTOR_RADAR'>('SIGNALS');
  const [expandedPillars, setExpandedPillars] = useState<Record<string, boolean>>({
    EQUITY_INTRADAY: true,
    EQUITY_SWING: true,
    EQUITY_LONGTERM: true,
    FNO: true,
    COMMODITIES: true
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [taxRes, sigRes, assetRes, secRes] = await Promise.all([
        apiFetch('/api/platform/taxonomy'),
        apiFetch('/api/platform/signals'),
        apiFetch('/api/platform/asset-universe'),
        apiFetch('/api/platform/sector-rotation')
      ]);

      if (taxRes.ok) {
        const data = await taxRes.json();
        setTaxonomy(data);
      }
      if (sigRes.ok) {
        const data = await sigRes.json();
        setSignals(data);
      }
      if (assetRes.ok) {
        const data = await assetRes.json();
        setAssetQuotes(data);
      }
      if (secRes.ok) {
        const data = await secRes.json();
        setSectorRotation(data);
      }
    } catch (err) {
      console.error('Error fetching platform data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleExecuteSignal = async (signal: MarketSignal) => {
    setIsExecutingSignal(signal.id);
    setExecutionMessage(null);
    try {
      const res = await apiFetch('/api/platform/execute-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal })
      });
      const data = await res.json();
      if (res.ok) {
        setExecutionMessage({
          id: signal.id,
          text: `Position Executed into Paper Trading Terminal (Group: ${data.strategyGroupId})`,
          type: 'success'
        });
      } else {
        setExecutionMessage({
          id: signal.id,
          text: data.error || 'Execution failed. Please login to trade.',
          type: 'error'
        });
      }
    } catch (err: any) {
      setExecutionMessage({
        id: signal.id,
        text: err?.message || 'Execution error',
        type: 'error'
      });
    } finally {
      setIsExecutingSignal(null);
    }
  };

  const getPillarIcon = (pillarId: TradingPillarId) => {
    switch (pillarId) {
      case 'EQUITY_INTRADAY': return Zap;
      case 'EQUITY_SWING': return TrendingUp;
      case 'EQUITY_LONGTERM': return Landmark;
      case 'FNO': return Layers;
      case 'COMMODITIES': return Coins;
      default: return Activity;
    }
  };

  const getPillarColorClasses = (pillarId: TradingPillarId, isSelected: boolean) => {
    switch (pillarId) {
      case 'EQUITY_INTRADAY':
        return isSelected
          ? 'bg-amber-950/70 text-amber-400 border-amber-500/60 shadow-amber-950/30'
          : 'hover:bg-amber-950/30 text-amber-300/80 border-slate-800';
      case 'EQUITY_SWING':
        return isSelected
          ? 'bg-emerald-950/70 text-emerald-400 border-emerald-500/60 shadow-emerald-950/30'
          : 'hover:bg-emerald-950/30 text-emerald-300/80 border-slate-800';
      case 'EQUITY_LONGTERM':
        return isSelected
          ? 'bg-blue-950/70 text-blue-400 border-blue-500/60 shadow-blue-950/30'
          : 'hover:bg-blue-950/30 text-blue-300/80 border-slate-800';
      case 'FNO':
        return isSelected
          ? 'bg-cyan-950/70 text-cyan-400 border-cyan-500/60 shadow-cyan-950/30'
          : 'hover:bg-cyan-950/30 text-cyan-300/80 border-slate-800';
      case 'COMMODITIES':
        return isSelected
          ? 'bg-yellow-950/70 text-yellow-400 border-yellow-500/60 shadow-yellow-950/30'
          : 'hover:bg-yellow-950/30 text-yellow-300/80 border-slate-800';
      default:
        return 'bg-slate-900 text-slate-300 border-slate-800';
    }
  };

  // Filter signals
  const filteredSignals = signals.filter(sig => {
    const matchesPillar = selectedPillarId === 'ALL' || sig.pillarId === selectedPillarId;
    const matchesStrategy = !selectedStrategyId || sig.strategyId === selectedStrategyId;
    const matchesSearch = !searchQuery ||
      sig.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sig.strategyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sig.pillarName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPillar && matchesStrategy && matchesSearch;
  });

  // Find currently inspected strategy
  const currentPillar = taxonomy.find(p => p.id === selectedPillarId);
  const allStrategies: StrategyDescriptor[] = taxonomy.flatMap(p => p.strategies);
  const selectedStrategy = allStrategies.find(s => s.id === selectedStrategyId);

  return (
    <div className="space-y-6 font-mono text-xs text-slate-200">
      {/* Platform Title & Architecture Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-100 tracking-tight flex items-center space-x-2">
                  <span>PERSONAL AI TRADING PLATFORM</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    5-PILLAR ARCHITECTURE
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                  Unified quantitative & algorithmic engine spanning Equity Intraday, Swing, Long-Term, F&O Derivatives, and MCX Commodities.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Sub-Navigation Views */}
          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start lg:self-auto">
            <button
              onClick={() => setActiveSubTab('SIGNALS')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center space-x-1.5 transition ${
                activeSubTab === 'SIGNALS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Signals ({signals.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('TAXONOMY_TREE')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center space-x-1.5 transition ${
                activeSubTab === 'TAXONOMY_TREE'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Pillar Taxonomy Tree</span>
            </button>
            <button
              onClick={() => setActiveSubTab('ASSET_SCANNER')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center space-x-1.5 transition ${
                activeSubTab === 'ASSET_SCANNER'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Multi-Asset Quotes</span>
            </button>
            <button
              onClick={() => setActiveSubTab('SECTOR_RADAR')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center space-x-1.5 transition ${
                activeSubTab === 'SECTOR_RADAR'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Sector Radar</span>
            </button>
          </div>
        </div>

        {/* 5-Pillar Selector Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-5 pt-4 border-t border-slate-800/80">
          <button
            onClick={() => {
              setSelectedPillarId('ALL');
              setSelectedStrategyId(null);
            }}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              selectedPillarId === 'ALL'
                ? 'bg-cyan-950/70 text-cyan-400 border-cyan-500/60 shadow-lg'
                : 'bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 border-slate-800'
            }`}
          >
            <div className="text-[10px] text-slate-500 font-bold">ALL PILLARS</div>
            <div className="text-xs font-black text-slate-100 mt-0.5">Master Overview</div>
            <div className="text-[10px] text-cyan-400/80 mt-1 font-semibold">
              {signals.length} Live Signals
            </div>
          </button>

          {taxonomy.map(pillar => {
            const Icon = getPillarIcon(pillar.id);
            const isSelected = selectedPillarId === pillar.id;
            const pillarSignalsCount = signals.filter(s => s.pillarId === pillar.id).length;
            return (
              <button
                key={pillar.id}
                onClick={() => {
                  setSelectedPillarId(pillar.id);
                  setSelectedStrategyId(null);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden ${getPillarColorClasses(pillar.id, isSelected)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold opacity-70">0{pillar.number}. PILLAR</span>
                  <Icon className="w-3.5 h-3.5 opacity-80" />
                </div>
                <div className="text-xs font-black truncate mt-0.5 text-slate-100">{pillar.shortLabel}</div>
                <div className="flex items-center justify-between text-[10px] mt-1">
                  <span className="opacity-70">{pillar.strategies.length} Strategies</span>
                  <span className="px-1.5 py-0.2 bg-slate-950/60 rounded font-bold">{pillarSignalsCount} sig</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-Strategy Pill Selector if Pillar is selected */}
      {selectedPillarId !== 'ALL' && currentPillar && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-2">
          <div className="text-[11px] font-bold text-slate-400 mr-2 flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>SUB-STRATEGIES:</span>
          </div>
          <button
            onClick={() => setSelectedStrategyId(null)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
              selectedStrategyId === null
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            All {currentPillar.name} Strategies
          </button>
          {currentPillar.strategies.map(strat => (
            <button
              key={strat.id}
              onClick={() => setSelectedStrategyId(strat.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                selectedStrategyId === strat.id
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {strat.name}
            </button>
          ))}
        </div>
      )}

      {/* MAIN VIEW TABS */}

      {/* 1. LIVE SIGNALS VIEW */}
      {activeSubTab === 'SIGNALS' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search symbol (e.g. RELIANCE, NIFTY, GOLD), strategy, or pillar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400">
              <span>Showing <strong>{filteredSignals.length}</strong> of {signals.length} active scanner signals</span>
              <button
                onClick={fetchData}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 rounded transition"
                title="Refresh Signals"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Signals Grid */}
          {filteredSignals.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-2">
              <Activity className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="font-bold text-slate-300">No active signals found for this filter criteria.</p>
              <p className="text-[11px]">Select &quot;ALL PILLARS&quot; or clear the search to view all active multi-asset setups.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredSignals.map(sig => {
                const isBuy = sig.direction === 'BUY';
                const isNeutral = sig.direction === 'NEUTRAL_SPREAD';
                const isExecuting = isExecutingSignal === sig.id;
                const msg = executionMessage && executionMessage.id === sig.id ? executionMessage : null;

                return (
                  <div
                    key={sig.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 shadow-lg transition-all space-y-3.5 relative overflow-hidden"
                  >
                    {/* Top Meta Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-950 border border-slate-800 text-slate-300 uppercase">
                          {sig.pillarName}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-[11px] font-semibold text-cyan-400 truncate max-w-[180px]">
                          {sig.strategyName}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono text-slate-400">TF: {sig.timeframe}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black font-mono ${
                          isBuy ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' :
                          isNeutral ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40' :
                          'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                        }`}>
                          {sig.direction}
                        </span>
                      </div>
                    </div>

                    {/* Symbol & Price Target Row */}
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3
                            onClick={() => onSelectSymbol && onSelectSymbol(sig.symbol)}
                            className="text-base font-black text-slate-100 hover:text-cyan-400 cursor-pointer transition flex items-center space-x-1"
                          >
                            <span>{sig.symbol}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
                          </h3>
                          <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                            {sig.assetName}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Entry: <strong className="text-slate-200">₹{sig.entryPrice.toLocaleString('en-IN')}</strong>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center space-x-3 text-[11px]">
                          <div>
                            <span className="text-rose-400/80 text-[10px]">SL: </span>
                            <span className="font-bold text-rose-300">₹{sig.stopLoss.toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="text-emerald-400/80 text-[10px]">T1: </span>
                            <span className="font-bold text-emerald-300">₹{sig.target1.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          R:R: <strong className="text-amber-300">{sig.riskReward}</strong> | Score: <strong className="text-emerald-400">{sig.confidenceScore}%</strong>
                        </div>
                      </div>
                    </div>

                    {/* Rationale & Technical Checklist */}
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                        {sig.rationale}
                      </p>
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                          <span>Algorithmic Confluence Triggers:</span>
                        </div>
                        {sig.technicalTriggers.map((trig, idx) => (
                          <div key={idx} className="text-[10px] text-slate-300 flex items-start space-x-1.5">
                            <span className="text-cyan-400 font-bold">›</span>
                            <span>{trig}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Execution Footer */}
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] text-slate-400 truncate max-w-xs">
                        Action: <span className="text-slate-200 font-semibold">{sig.suggestedAction}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleExecuteSignal(sig)}
                          disabled={isExecuting}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center space-x-1.5 transition shadow-sm"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>{isExecuting ? 'Executing...' : 'Paper Trade Signal'}</span>
                        </button>
                        {onNavigateTab && (
                          <button
                            onClick={() => {
                              if (onSelectSymbol) onSelectSymbol(sig.symbol);
                              onNavigateTab(sig.pillarId === 'FNO' ? 'chain' : 'backtest');
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1 transition"
                            title="Analyze in Depth"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Execution Toast Feedback */}
                    {msg && (
                      <div className={`p-2 rounded-lg text-[10px] font-bold flex items-center space-x-1.5 ${
                        msg.type === 'success'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50'
                          : 'bg-rose-950/80 text-rose-300 border border-rose-500/50'
                      }`}>
                        <span>{msg.text}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. TAXONOMY TREE BLUEPRINT VIEW */}
      {activeSubTab === 'TAXONOMY_TREE' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>PERSONAL AI TRADING PLATFORM TAXONOMY & RULES BLUEPRINT</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-400">5 Pillars • 24 Standardized Algorithmic Strategies</span>
            </div>

            {/* Tree Accordion */}
            <div className="space-y-3">
              {taxonomy.map(pillar => {
                const Icon = getPillarIcon(pillar.id);
                const isExpanded = expandedPillars[pillar.id] !== false;

                return (
                  <div key={pillar.id} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                    <button
                      onClick={() => setExpandedPillars(prev => ({ ...prev, [pillar.id]: !isExpanded }))}
                      className="w-full p-3.5 bg-slate-900/90 hover:bg-slate-900 flex items-center justify-between transition text-left"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                          {pillar.number}
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-100 flex items-center space-x-2">
                            <span>{pillar.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal">({pillar.strategies.length} Models)</span>
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">{pillar.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-400 font-mono">
                          {pillar.targetUniverse}
                        </span>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-slate-800/80 bg-slate-950/60">
                        {pillar.strategies.map(strat => (
                          <div
                            key={strat.id}
                            className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-3 space-y-2 hover:border-slate-700 transition"
                          >
                            <div className="flex items-center justify-between">
                              <h5 className="text-[11px] font-black text-cyan-300 truncate">{strat.name}</h5>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                strat.riskProfile === 'CONSERVATIVE' ? 'bg-blue-950 text-blue-300 border border-blue-500/30' :
                                strat.riskProfile === 'MODERATE' ? 'bg-amber-950 text-amber-300 border border-amber-500/30' :
                                'bg-rose-950 text-rose-300 border border-rose-500/30'
                              }`}>
                                {strat.riskProfile}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-300 font-sans leading-relaxed line-clamp-2">
                              {strat.description}
                            </p>
                            <div className="text-[10px] text-slate-400 space-y-0.5 border-t border-slate-800/80 pt-2 font-mono">
                              <div>TF: <strong className="text-slate-200">{strat.timeframe}</strong> | Hold: <strong className="text-slate-200">{strat.holdingPeriod}</strong></div>
                              <div>Target Win Rate: <strong className="text-emerald-400">{strat.targetWinRate}</strong> | R:R: <strong className="text-amber-300">{strat.rewardRiskRatio}</strong></div>
                            </div>
                            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/60 space-y-1">
                              <div className="text-[9px] font-bold text-slate-400 uppercase">Core Rules:</div>
                              {strat.rulesSummary.slice(0, 3).map((r, i) => (
                                <div key={i} className="text-[9px] text-slate-300 flex items-start space-x-1">
                                  <span className="text-cyan-400">•</span>
                                  <span className="line-clamp-1">{r}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. MULTI-ASSET SCANNER QUOTES VIEW */}
      {activeSubTab === 'ASSET_SCANNER' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span>LIVE MULTI-ASSET UNIVERSE & QUANTITATIVE TELEMETRY</span>
            </h3>
            <span className="text-[10px] text-slate-400">Real-Time Indicators: VWAP, RSI, ATR, Order Flow, Sector Rank & Quality</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Symbol</th>
                  <th className="p-2.5">Asset Class</th>
                  <th className="p-2.5 text-right">LTP (₹)</th>
                  <th className="p-2.5 text-right">Change</th>
                  <th className="p-2.5 text-right">VWAP</th>
                  <th className="p-2.5 text-right">RSI (14)</th>
                  <th className="p-2.5 text-right">ATR</th>
                  <th className="p-2.5 text-center">Supertrend</th>
                  <th className="p-2.5 text-right">Order Flow</th>
                  <th className="p-2.5 text-right">Relative Strength</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                {assetQuotes.map(asset => {
                  const isUp = asset.pChange >= 0;
                  const isSupertrendBull = asset.supertrend === 'BULLISH';

                  return (
                    <tr key={asset.symbol} className="hover:bg-slate-800/40 transition">
                      <td className="p-2.5 font-bold text-slate-100">
                        <div className="flex items-center space-x-1.5">
                          <span>{asset.symbol}</span>
                          <span className="text-[9px] px-1 py-0.2 bg-slate-950 rounded text-slate-400 border border-slate-800">
                            {asset.exchange}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500 truncate max-w-[120px]">{asset.name}</div>
                      </td>
                      <td className="p-2.5 text-[10px] text-slate-400">
                        {asset.assetClass}
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-100">
                        ₹{asset.ltp.toLocaleString('en-IN')}
                      </td>
                      <td className={`p-2.5 text-right font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? '+' : ''}{asset.pChange}%
                      </td>
                      <td className="p-2.5 text-right text-slate-300">
                        {asset.vwap ? `₹${asset.vwap.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className={`font-bold ${
                          (asset.rsi || 50) > 65 ? 'text-emerald-400' :
                          (asset.rsi || 50) < 35 ? 'text-rose-400' : 'text-slate-300'
                        }`}>
                          {asset.rsi || '-'}
                        </span>
                      </td>
                      <td className="p-2.5 text-right text-slate-300">
                        {asset.atr || '-'}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          isSupertrendBull ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                        }`}>
                          {asset.supertrend || 'N/A'}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        {asset.orderFlowImbalance !== undefined ? (
                          <span className={`font-bold ${asset.orderFlowImbalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {asset.orderFlowImbalance >= 0 ? '+' : ''}{asset.orderFlowImbalance}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-2.5 text-right">
                        {asset.rsVsBenchmark !== undefined ? (
                          <span className="text-cyan-400 font-bold">
                            +{asset.rsVsBenchmark}%
                          </span>
                        ) : asset.futuresOpenInterest ? (
                          <span className="text-slate-400 text-[10px]">PCR: {asset.pcr}</span>
                        ) : '-'}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => onSelectSymbol && onSelectSymbol(asset.symbol)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-300 text-[10px] font-bold transition"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. SECTOR ROTATION RADAR VIEW */}
      {activeSubTab === 'SECTOR_RADAR' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>NSE SECTOR RELATIVE ROTATION GRAPH (RRG) & MOMENTUM RADAR</span>
            </h3>
            <span className="text-[10px] text-slate-400">Institutional Capital Flow Tracking across 6 Major Sectors</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sectorRotation.map(sec => {
              const isLeading = sec.momentumPhase === 'LEADING';
              const isImproving = sec.momentumPhase === 'IMPROVING';
              const isWeakening = sec.momentumPhase === 'WEAKENING';
              const isLagging = sec.momentumPhase === 'LAGGING';

              return (
                <div
                  key={sec.sector}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    isLeading ? 'bg-emerald-950/40 border-emerald-500/50' :
                    isImproving ? 'bg-cyan-950/40 border-cyan-500/50' :
                    isWeakening ? 'bg-amber-950/40 border-amber-500/50' :
                    'bg-rose-950/40 border-rose-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-100">{sec.sector}</h4>
                      <div className="text-[10px] text-slate-400 font-mono">{sec.benchmarkSymbol}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      isLeading ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                      isImproving ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
                      isWeakening ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                      'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {sec.momentumPhase}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-[10px] font-mono">
                    <div>
                      <div className="text-slate-500 text-[9px]">1D Move</div>
                      <div className={`font-bold ${sec.change1D >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {sec.change1D >= 0 ? '+' : ''}{sec.change1D}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[9px]">1W Move</div>
                      <div className={`font-bold ${sec.change1W >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {sec.change1W >= 0 ? '+' : ''}{sec.change1W}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[9px]">1M Move</div>
                      <div className={`font-bold ${sec.change1M >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {sec.change1M >= 0 ? '+' : ''}{sec.change1M}%
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-300 space-y-1">
                    <span className="text-slate-400 font-bold text-[9px] uppercase">Top Institutional Picks:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {sec.topPicks.map(stock => (
                        <button
                          key={stock}
                          onClick={() => onSelectSymbol && onSelectSymbol(stock)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-200 text-[10px] font-bold border border-slate-700 transition"
                        >
                          {stock}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
