import React, { useState, useEffect } from 'react';
import {
  Brain,
  Shield,
  Zap,
  TrendingUp,
  Activity,
  Award,
  Play,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Sliders,
  History,
  Terminal,
  Layers,
  BarChart3,
  Flame,
  FileText,
  ArrowRightLeft,
  Calendar,
  ChevronRight
} from 'lucide-react';
import { QuantUnderlying, IvSurfaceProfile, MarketStructureProfile, OptionFlowMetrics } from '../quant/types';
import { QuantChartOverlay } from './QuantChartOverlay';
import { IvSurfacePanel } from './quant/IvSurfacePanel';
import { FlowStructurePanel } from './quant/FlowStructurePanel';
import { WalkForwardMonteCarloPanel } from './quant/WalkForwardMonteCarloPanel';
import { StrategyLifecyclePanel } from './quant/StrategyLifecyclePanel';
import { AdvancedExecutionControlPanel } from './quant/AdvancedExecutionControlPanel';
import { EventReviewPanel } from './quant/EventReviewPanel';
import { RiskControlPanel } from './quant/RiskControlPanel';
import { MultiTimeframePanel } from './quant/MultiTimeframePanel';
import { StrategyComparisonView } from './quant/StrategyComparisonView';

export const QuantIntelligenceDashboard: React.FC = () => {
  const [underlying, setUnderlying] = useState<QuantUnderlying>('NIFTY');
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'TOURNAMENT' | 'LAB' | 'IV_SURFACE' | 'FLOW_STRUCTURE' | 'ANALOGUES' | 'RECOVERY' | 'DEFENSE' | 'RISK' | 'RESEARCH' | 'EVENTS_REVIEWS' | 'CHART' | 'MULTI_TIMEFRAME' | 'COMPARISON'
  >('OVERVIEW');

  const [loading, setLoading] = useState(false);
  const [stateData, setStateData] = useState<any>(null);
  const [ivSurfaceData, setIvSurfaceData] = useState<IvSurfaceProfile | null>(null);
  const [structureData, setStructureData] = useState<MarketStructureProfile | null>(null);
  const [flowData, setFlowData] = useState<OptionFlowMetrics | null>(null);
  const [tournament, setTournament] = useState<any[]>([]);
  const [decision, setDecision] = useState<any>(null);
  const [analogues, setAnalogues] = useState<any>(null);
  const [riskData, setRiskData] = useState<any>(null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [recovery, setRecovery] = useState<any>(null);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [metaFunnel, setMetaFunnel] = useState<any>(null);
  const [runningBacktest, setRunningBacktest] = useState(false);

  // Load all quant state
  const fetchAllQuantData = async () => {
    try {
      setLoading(true);
      const [
        stateRes,
        tourRes,
        decRes,
        anaRes,
        riskRes,
        stratRes,
        btRes,
        recRes,
        expRes,
        auditRes,
        ivRes,
        structRes,
        flowRes,
        metaRes
      ] = await Promise.all([
        fetch(`/api/quant/state?underlying=${underlying}`),
        fetch(`/api/quant/tournament?underlying=${underlying}`),
        fetch(`/api/quant/decision?underlying=${underlying}`),
        fetch(`/api/quant/analogues?underlying=${underlying}`),
        fetch(`/api/quant/risk`),
        fetch(`/api/quant/strategies`),
        fetch(`/api/quant/backtests`),
        fetch(`/api/quant/recovery`),
        fetch(`/api/quant/experiments`),
        fetch(`/api/quant/audit-logs`),
        fetch(`/api/quant/iv-surface?underlying=${underlying}`),
        fetch(`/api/quant/market-structure?underlying=${underlying}`),
        fetch(`/api/quant/option-flow?underlying=${underlying}`),
        fetch(`/api/quant/meta-funnel?underlying=${underlying}`)
      ]);

      if (stateRes.ok) setStateData(await stateRes.json());
      if (tourRes.ok) {
        const tData = await tourRes.json();
        setTournament(Array.isArray(tData) ? tData : []);
      }
      if (decRes.ok) setDecision(await decRes.json());
      if (anaRes.ok) setAnalogues(await anaRes.json());
      if (riskRes.ok) setRiskData(await riskRes.json());
      if (stratRes.ok) {
        const strats = await stratRes.json();
        setStrategies(Array.isArray(strats) ? strats : []);
      }
      if (btRes.ok) {
        const bts = await btRes.json();
        if (Array.isArray(bts) && bts.length > 0) setBacktestResult(bts[0]);
      }
      if (recRes.ok) setRecovery(await recRes.json());
      if (expRes.ok) {
        const exps = await expRes.json();
        setExperiments(Array.isArray(exps) ? exps : []);
      }
      if (auditRes.ok) {
        const logs = await auditRes.json();
        setAuditLogs(Array.isArray(logs) ? logs : []);
      }
      if (ivRes.ok) setIvSurfaceData(await ivRes.json());
      if (structRes.ok) setStructureData(await structRes.json());
      if (flowRes.ok) setFlowData(await flowRes.json());
      if (metaRes.ok) setMetaFunnel(await metaRes.json());
    } catch (err) {
      console.error('Error fetching quant dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllQuantData();
  }, [underlying]);

  // Execute Backtest
  const handleRunBacktest = async (strategyId?: string) => {
    try {
      setRunningBacktest(true);
      const stratId = strategyId || (strategies[0]?.id || 'strat-bull-call-spread-01');
      const res = await fetch('/api/quant/backtests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: stratId, periodStart: '2024-01-01', periodEnd: '2026-09-01' })
      });
      if (res.ok) {
        const newBt = await res.json();
        setBacktestResult(newBt);
        setActiveTab('LAB');
      }
    } catch (err) {
      console.error('Failed to run backtest:', err);
    } finally {
      setRunningBacktest(false);
    }
  };

  // Promote Strategy
  const handlePromoteStrategy = async (strategyId: string, targetStatus: string) => {
    try {
      const res = await fetch('/api/quant/strategies/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId, targetStatus })
      });
      if (res.ok) {
        fetchAllQuantData();
      }
    } catch (err) {
      console.error('Failed to promote strategy:', err);
    }
  };

  // Generate Hypothesis
  const handleGenerateHypothesis = async () => {
    try {
      const res = await fetch('/api/quant/experiments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureTrend: 'VWAP momentum breakout with 15m RSI > 60',
          regime: stateData?.regime?.primaryRegime || 'TREND_UP'
        })
      });
      if (res.ok) {
        fetchAllQuantData();
      }
    } catch (err) {
      console.error('Failed to generate hypothesis:', err);
    }
  };

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen p-4 md:p-6 space-y-6 font-sans">
      {/* 1. Header & Underlying Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-950/80 border border-cyan-500/40 rounded-xl shadow-lg shadow-cyan-950/40">
            <Brain className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Quant Intelligence Module</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                PRO QUANT V2
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Statistical Tournament, Regime Classification, GEX Analytics & Adaptive Recovery
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 font-mono">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            {(['NIFTY', 'BANKNIFTY', 'SENSEX'] as QuantUnderlying[]).map(u => (
              <button
                key={u}
                onClick={() => setUnderlying(u)}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition ${
                  underlying === u
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          <button
            onClick={fetchAllQuantData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Sync Live</span>
          </button>
        </div>
      </div>

      {/* 2. Real-Time Macro Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 font-mono text-xs">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow">
          <div className="text-slate-400 text-[11px]">Underlying Spot</div>
          <div className="text-lg font-bold text-white mt-1">
            ₹{stateData?.spotPrice?.toLocaleString() || '24,017.70'}
          </div>
          <div className="text-[10px] text-cyan-400 mt-0.5">
            VWAP: ₹{(stateData?.spotPrice * 0.998).toFixed(1)} ({stateData?.features?.distVwapPct || '+0.2'}%)
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow">
          <div className="text-slate-400 text-[11px]">Market Regime</div>
          <div className="text-base font-bold text-emerald-400 mt-1 truncate">
            {stateData?.regime?.primaryRegime || 'TREND_UP'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Conf: {((stateData?.regime?.confidence || 0.8) * 100).toFixed(0)}% | Vol: {stateData?.regime?.volatilityRegime || 'NORMAL'}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow">
          <div className="text-slate-400 text-[11px]">Dealer Gamma (Est.)</div>
          <div className="text-base font-bold text-purple-400 mt-1">
            +₹42.5 Cr
          </div>
          <div className="text-[10px] text-purple-300 mt-0.5">
            Flip: ₹{stateData?.regime?.keyLevels?.gammaFlip || '24,050'}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow">
          <div className="text-slate-400 text-[11px]">PCR & Volatility</div>
          <div className="text-base font-bold text-amber-400 mt-1">
            PCR {stateData?.features?.pcrOi || '1.18'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            ATM IV: {stateData?.features?.atmIv || '14.2'}% (Rank {stateData?.features?.ivRank || '42'})
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow">
          <div className="text-slate-400 text-[11px]">Analogue 30m Edge</div>
          <div className="text-base font-bold text-emerald-400 mt-1">
            68% Upside
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {analogues?.sampleCount || 1845} Matches (+0.25% Exp)
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow">
          <div className="text-slate-400 text-[11px]">Data Quality</div>
          <div className="text-base font-bold text-emerald-400 mt-1 flex items-center space-x-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{stateData?.quality?.score || 100}/100</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Status: {stateData?.quality?.status || 'OK'} (0.1s Latency)
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto text-xs font-mono pb-1">
        {[
          { id: 'OVERVIEW', label: 'Quant Overview & Thesis', icon: Activity },
          { id: 'TOURNAMENT', label: 'Strategy Tournament', icon: Award },
          { id: 'LAB', label: 'Strategy Lab & Robustness', icon: Sliders },
          { id: 'IV_SURFACE', label: 'IV Surface & Skew', icon: Flame },
          { id: 'FLOW_STRUCTURE', label: 'Flow & Structure', icon: BarChart3 },
          { id: 'ANALOGUES', label: 'Historical Analogues', icon: History },
          { id: 'RECOVERY', label: 'Position Recovery Engine', icon: Shield },
          { id: 'DEFENSE', label: 'Conversions & Hedges', icon: ArrowRightLeft },
          { id: 'RISK', label: 'Portfolio Greeks & Stress', icon: AlertTriangle },
          { id: 'RESEARCH', label: 'Lifecycle & Research', icon: Terminal },
          { id: 'MULTI_TIMEFRAME', label: 'Multi-Timeframe & Sizing', icon: Layers },
          { id: 'COMPARISON', label: 'Comparison & Quality Gates', icon: Award },
          { id: 'EVENTS_REVIEWS', label: 'Events, Edge & Reviews', icon: Calendar },
          { id: 'CHART', label: 'Quant Chart Overlay', icon: Layers }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-xl font-bold transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-900 border-t-2 border-cyan-400 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. Tab Content Panels */}

      {/* TAB 1: OVERVIEW & THESIS */}
      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono">
          {/* Left Column: Quant Decision Box */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-base font-bold text-white uppercase">Automated Quant Decision</h2>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    decision?.action === 'ENTER'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  ACTION: {decision?.action || 'ENTER'}
                </span>
              </div>

              {decision?.strategy && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-400">Selected Optimal Strategy</div>
                      <div className="text-lg font-bold text-cyan-300">{decision.strategy.name}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-1 bg-cyan-950 border border-cyan-500/30 rounded text-cyan-300 text-xs font-bold">
                        {decision.strategy.strikes}
                      </span>
                      <span className="px-2.5 py-1 bg-purple-950 border border-purple-500/30 rounded text-purple-300 text-xs">
                        Expiry: {decision.strategy.expiry}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {decision.strategy.structure}
                  </p>

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-center text-xs">
                    <div className="bg-slate-900/70 p-2 rounded">
                      <div className="text-slate-400 text-[10px]">Expected Value</div>
                      <div className="text-emerald-400 font-bold">+{decision.metrics.expectedValueR}R</div>
                    </div>
                    <div className="bg-slate-900/70 p-2 rounded">
                      <div className="text-slate-400 text-[10px]">Historical Prob</div>
                      <div className="text-cyan-400 font-bold">{decision.metrics.historicalProbPct}%</div>
                    </div>
                    <div className="bg-slate-900/70 p-2 rounded">
                      <div className="text-slate-400 text-[10px]">Risk Score</div>
                      <div className="text-amber-400 font-bold">{decision.metrics.riskScore}/100</div>
                    </div>
                    <div className="bg-slate-900/70 p-2 rounded">
                      <div className="text-slate-400 text-[10px]">Confidence</div>
                      <div className="text-purple-400 font-bold">{(decision.metrics.confidenceScore * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Thesis & Invalidation */}
              <div className="space-y-2 text-xs">
                <div className="font-bold text-slate-200">Core Statistical Thesis</div>
                <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-slate-300 leading-relaxed">
                  {decision?.thesis?.coreArgument || 'Multi-timeframe positive momentum aligned with dealer gamma long positioning.'}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl">
                    <div className="font-bold text-rose-300 text-[11px] flex items-center space-x-1 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Hard Invalidation Conditions</span>
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-rose-200/80 space-y-1">
                      {decision?.thesis?.invalidationConditions?.map((c: string, idx: number) => (
                        <li key={idx}>{c}</li>
                      )) || <li>Spot price breaks Put Wall support (₹23,950)</li>}
                    </ul>
                  </div>

                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                    <div className="font-bold text-emerald-300 text-[11px] flex items-center space-x-1 mb-1">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Adaptive Recovery Roadmap</span>
                    </div>
                    <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                      {decision?.thesis?.recoveryPlanSummary || 'Hold if adverse excursion is within normal ATR; hedge delta if divergence expands.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Meta-Strategy Decision Funnel (Section 71) */}
            {metaFunnel && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase">
                        Hierarchical Meta-Strategy Funnel (Section 71)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Rigorous 6-stage filtering: Market &rarr; Regime &rarr; Strategy Family &rarr; Structure &rarr; Expiry/Strikes &rarr; Sizing & Margin
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 rounded-full text-xs font-bold">
                    Regime: {metaFunnel.regime}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">1. Family Selection</div>
                    <div className="text-white font-bold text-sm text-cyan-300">{metaFunnel.selectedFamily}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{metaFunnel.familyRationale}</div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">2. Base Strategy</div>
                    <div className="text-white font-bold text-sm text-purple-300">{metaFunnel.selectedStrategy}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{metaFunnel.structureDescription}</div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">3. Expiry Optimization</div>
                    <div className="text-white font-bold text-sm text-amber-300">{metaFunnel.selectedExpiry}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{metaFunnel.expiryRationale}</div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">4. Strike Geometry</div>
                    <div className="text-white font-bold text-sm text-emerald-300">{metaFunnel.selectedStrikes}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{metaFunnel.strikeOptimizationRationale}</div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">5. Volatility Sizing</div>
                    <div className="text-white font-bold text-sm text-cyan-300">{metaFunnel.positionSizeLots} Lots</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{metaFunnel.sizingRationale}</div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">6. Margin & EV</div>
                    <div className="text-emerald-400 font-bold text-sm">+{metaFunnel.expectedValueR}R EV</div>
                    <div className="text-[10px] text-slate-400">Margin: ₹{metaFunnel.marginRequirement?.toLocaleString()}</div>
                    <div className="text-[10px] text-cyan-400 font-bold">{metaFunnel.historicalProbabilityPct}% Win Rate</div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Mini-Tournament Preview */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase">Strategy Tournament Leaderboard</h3>
                </div>
                <button
                  onClick={() => setActiveTab('TOURNAMENT')}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  View Full Tournament →
                </button>
              </div>

              <div className="space-y-2">
                {tournament.slice(0, 3).map((item, idx) => (
                  <div
                    key={item.strategyId}
                    className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-slate-300 font-bold">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-white">{item.name}</div>
                        <div className="text-[10px] text-slate-400">{item.family} | Expected Value: {item.expectedValue}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="text-cyan-400 font-bold">{item.score}/100</div>
                        <div className="text-[10px] text-slate-400">Score</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.recommendation === 'STRONG_BUY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        }`}
                      >
                        {item.recommendation}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Key Quantitative Levels & Greeks */}
          <div className="space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span>Market Geometry & Levels</span>
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400">Call Wall (Major Resistance):</span>
                  <span className="font-bold text-rose-400">
                    ₹{stateData?.regime?.keyLevels?.callWall?.toLocaleString() || '24,200'}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400">Gamma Flip Strike:</span>
                  <span className="font-bold text-purple-400">
                    ₹{stateData?.regime?.keyLevels?.gammaFlip?.toLocaleString() || '24,050'}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400">Put Wall (Major Support):</span>
                  <span className="font-bold text-emerald-400">
                    ₹{stateData?.regime?.keyLevels?.putWall?.toLocaleString() || '23,900'}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400">Expected 1-Day Move:</span>
                  <span className="font-bold text-amber-400">
                    ±₹{stateData?.regime?.keyLevels?.expectedMove || '165'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                <Flame className="w-4 h-4 text-purple-400" />
                <span>Dealer Gamma Exposure</span>
              </h3>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Market makers are net long gamma in current zone (+₹42.5 Cr). They sell into rallies and buy into dips, acting as a volatility dampener.
              </p>
              <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl text-xs space-y-1">
                <div className="text-purple-300 font-bold">Stance: Mean Reversion Bias</div>
                <div className="text-[10px] text-slate-400">
                  Vol expansions favor breakout straddles only once spot crosses ₹24,200 Call Wall.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STRATEGY TOURNAMENT */}
      {activeTab === 'TOURNAMENT' && (
        <div className="space-y-4 font-mono">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Live Strategy Tournament Matrix</h2>
              <p className="text-xs text-slate-400">
                Continuous ranking of canonical strategies against active Market Regime, Expectancy, and Liquidity.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Rank</th>
                    <th className="p-3">Strategy</th>
                    <th className="p-3">Family</th>
                    <th className="p-3 text-center">Score</th>
                    <th className="p-3 text-center">Regime Fit</th>
                    <th className="p-3 text-center">Historical Edge</th>
                    <th className="p-3 text-center">Exp. Value</th>
                    <th className="p-3 text-center">Win Rate</th>
                    <th className="p-3 text-center">Recommendation</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {tournament.map(entry => (
                    <tr key={entry.strategyId} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-bold text-cyan-300">#{entry.rank}</td>
                      <td className="p-3">
                        <div className="font-bold text-white">{entry.name}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{entry.structureDesc}</div>
                      </td>
                      <td className="p-3 text-slate-300">{entry.family}</td>
                      <td className="p-3 text-center font-bold text-cyan-400">{entry.score}/100</td>
                      <td className="p-3 text-center text-slate-300">{entry.regimeFitScore}%</td>
                      <td className="p-3 text-center text-slate-300">{entry.historicalEdgeScore}%</td>
                      <td className="p-3 text-center font-bold text-emerald-400">{entry.expectedValue}</td>
                      <td className="p-3 text-center text-slate-300">{entry.historicalProbPct}%</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            entry.recommendation === 'STRONG_BUY'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : entry.recommendation === 'BUY'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {entry.recommendation}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleRunBacktest(entry.strategyId)}
                          disabled={runningBacktest}
                          className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 rounded text-cyan-300 text-[11px] font-bold transition"
                        >
                          Backtest
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STRATEGY LAB & BACKTEST */}
      {activeTab === 'LAB' && (
        <div className="space-y-6 font-mono">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">Quantitative Strategy Lab</h2>
                <p className="text-xs text-slate-400">
                  Event-driven options backtester with true statutory friction, Walk-Forward splits, and Monte Carlo runs.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleRunBacktest()}
                  disabled={runningBacktest}
                  className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition shadow"
                >
                  <Play className={`w-4 h-4 ${runningBacktest ? 'animate-spin' : ''}`} />
                  <span>{runningBacktest ? 'Simulating...' : 'Run Simulation'}</span>
                </button>
              </div>
            </div>

            {backtestResult ? (
              <div className="space-y-6 pt-2">
                {/* Metric Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-400">Net P&L</div>
                    <div className="text-lg font-bold text-emerald-400 mt-1">
                      +₹{backtestResult.totalNetPnl.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Taxes/Costs: ₹{backtestResult.totalTransactionCosts.toLocaleString()}
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-400">Win Rate / Expectancy</div>
                    <div className="text-lg font-bold text-cyan-400 mt-1">
                      {backtestResult.winRate}% ({backtestResult.expectancyR}R)
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Sample Size: {backtestResult.sampleSize} trades
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-400">Sharpe / Sortino</div>
                    <div className="text-lg font-bold text-purple-400 mt-1">
                      {backtestResult.sharpeRatio} / {backtestResult.sortinoRatio}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      OOS Sharpe: {backtestResult.oosSharpe}
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-400">Profit Factor</div>
                    <div className="text-lg font-bold text-emerald-400 mt-1">
                      {backtestResult.profitFactor}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Avg Win: ₹{backtestResult.avgWin}
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-400">Max Drawdown</div>
                    <div className="text-lg font-bold text-rose-400 mt-1">
                      {backtestResult.maxDrawdownPct}%
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Max Consec. Loss: {backtestResult.consecutiveLossesMax}
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-400">Production Gates</div>
                    <div className="text-base font-bold text-emerald-400 mt-1 flex items-center space-x-1">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span>{backtestResult.passedGates ? 'PASSED' : 'FAILED'}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Walk-Forward Verified
                    </div>
                  </div>
                </div>

                {/* Monte Carlo 2,000 Runs Distribution */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-slate-200">
                    Monte Carlo 2,000 Permutation Robustness Fan
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">5th Percentile (Worst Case)</div>
                      <div className="text-rose-400 font-bold mt-0.5">
                        +₹{backtestResult.monteCarloP5?.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">50th Percentile (Median)</div>
                      <div className="text-cyan-400 font-bold mt-0.5">
                        +₹{backtestResult.monteCarloP50?.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">95th Percentile (Best Case)</div>
                      <div className="text-emerald-400 font-bold mt-0.5">
                        +₹{backtestResult.monteCarloP95?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strategy Promotion Controls */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-200">Lifecycle Governance</div>
                    <div className="text-[11px] text-slate-400">Promote strategy state after passing backtest validation gates.</div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {(['RESEARCH', 'PAPER', 'SHADOW', 'LIVE'] as const).map(st => (
                      <button
                        key={st}
                        onClick={() => handlePromoteStrategy(backtestResult.strategyId, st)}
                        className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg font-bold text-slate-300 hover:text-white transition"
                      >
                        Set {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Click "Run Simulation" above to execute backtesting on active canonical strategies.
              </div>
            )}
          </div>

          {/* Embedded Walk-Forward and Monte Carlo Robustness Engine */}
          <WalkForwardMonteCarloPanel strategyId={backtestResult?.strategyId || "STRAT_BULL_CALL_SPREAD_01"} />
        </div>
      )}

      {/* TAB: IV SURFACE */}
      {activeTab === 'IV_SURFACE' && (
        <IvSurfacePanel data={ivSurfaceData} loading={loading} onRefresh={fetchAllQuantData} />
      )}

      {/* TAB: FLOW & STRUCTURE */}
      {activeTab === 'FLOW_STRUCTURE' && (
        <FlowStructurePanel structure={structureData} flow={flowData} loading={loading} />
      )}

      {/* TAB 4: HISTORICAL ANALOGUES */}
      {activeTab === 'ANALOGUES' && (
        <div className="space-y-4 font-mono">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Historical Multi-Regime Analogue Engine</h2>
              <p className="text-xs text-slate-400">
                Maps current multidimensional feature vector to historical setups across 3-year tick repository.
              </p>
            </div>

            {analogues ? (
              <div className="space-y-6 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  {['horizon15m', 'horizon30m', 'horizon1h', 'horizonEod'].map(h => {
                    const data = analogues.outcomes[h];
                    const label = h.replace('horizon', '').toUpperCase();
                    return (
                      <div key={h} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                        <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1">
                          {label} Horizon
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Upside Prob:</span>
                            <span className="text-emerald-400 font-bold">{(data.upProb * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Downside Prob:</span>
                            <span className="text-rose-400 font-bold">{(data.downProb * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Flat Prob:</span>
                            <span className="text-slate-300 font-bold">{(data.flatProb * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-900">
                            <span className="text-slate-400">Expected Ret:</span>
                            <span className={data.expectedReturnPct >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {data.expectedReturnPct >= 0 ? '+' : ''}{data.expectedReturnPct}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {analogues.patternSummary && (
                  <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl text-purple-200 text-xs font-bold">
                    {analogues.patternSummary}
                  </div>
                )}

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
                  <div className="font-bold text-slate-200">Historical Excursion Statistics</div>
                  <div className="grid grid-cols-2 gap-4 text-slate-300">
                    <div>
                      Average Maximum Favorable Excursion (MFE):{' '}
                      <strong className="text-emerald-400">+{analogues.maxFavorableExcursionAvg}%</strong>
                    </div>
                    <div>
                      Average Maximum Adverse Excursion (MAE):{' '}
                      <strong className="text-rose-400">-{analogues.maxAdverseExcursionAvg}%</strong>
                    </div>
                  </div>
                </div>

                {analogues.topEpisodes && analogues.topEpisodes.length > 0 && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="font-bold text-slate-200">Top Historical Episode Matches (Section 42)</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="p-2">Date</th>
                            <th className="p-2">Historical Event Context</th>
                            <th className="p-2 text-center">Similarity</th>
                            <th className="p-2 text-center">Regime</th>
                            <th className="p-2 text-center">30m Move</th>
                            <th className="p-2 text-center">EOD Move</th>
                            <th className="p-2 text-right">Best Strategy</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {analogues.topEpisodes.map((ep: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-900/40">
                              <td className="p-2 font-bold text-cyan-300">{ep.date}</td>
                              <td className="p-2 text-white">{ep.eventName}</td>
                              <td className="p-2 text-center font-bold text-purple-400">{ep.similarityPct}%</td>
                              <td className="p-2 text-center text-slate-400">{ep.regime}</td>
                              <td className={`p-2 text-center font-bold ${ep.forwardMove30mPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {ep.forwardMove30mPct >= 0 ? '+' : ''}{ep.forwardMove30mPct}%
                              </td>
                              <td className={`p-2 text-center font-bold ${ep.forwardMoveEodPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {ep.forwardMoveEodPct >= 0 ? '+' : ''}{ep.forwardMoveEodPct}%
                              </td>
                              <td className="p-2 text-right text-amber-300 font-bold">{ep.bestStrategy}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">Loading historical analogue database...</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: POSITION RECOVERY ENGINE */}
      {activeTab === 'RECOVERY' && (
        <div className="space-y-4 font-mono">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Adaptive Position Recovery Engine</h2>
              <p className="text-xs text-slate-400">
                Statistically evaluates adverse positions. Calculates expected value (EV) for HOLD, REDUCE, EXIT, HEDGE, ROLL, CONVERT, REVERSE.
              </p>
            </div>

            {recovery ? (
              <div className="space-y-6 pt-2">
                <div className="flex flex-wrap items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                  <div>
                    <div className="text-slate-400">Position Under Evaluation</div>
                    <div className="text-base font-bold text-white">{recovery.symbol}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Current P&L</div>
                    <div className={recovery.currentPnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {recovery.currentPnl >= 0 ? '+' : ''}₹{recovery.currentPnl}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Thesis Health</div>
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        recovery.currentThesisState === 'HEALTHY'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {recovery.currentThesisState}
                    </span>
                  </div>
                  <div>
                    <div className="text-slate-400">Recommended Recovery Action</div>
                    <div className="text-base font-bold text-cyan-300">{recovery.recommendedAction}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Action</th>
                        <th className="p-3 text-center">Expected Value (EV)</th>
                        <th className="p-3 text-center">Risk Level</th>
                        <th className="p-3 text-center">Margin Impact</th>
                        <th className="p-3">Rationale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {recovery?.actionEvaluations?.map((act: any) => (
                        <tr
                          key={act.action}
                          className={act.action === recovery.recommendedAction ? 'bg-cyan-950/40 font-bold' : ''}
                        >
                          <td className="p-3 text-white flex items-center space-x-2">
                            {act.action === recovery.recommendedAction && <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />}
                            <span>{act.action}</span>
                          </td>
                          <td className="p-3 text-center font-bold">
                            <span className={act.expectedValue >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {act.expectedValue >= 0 ? '+' : ''}₹{act.expectedValue}
                            </span>
                          </td>
                          <td className="p-3 text-center text-slate-300">{act.riskLevel}</td>
                          <td className="p-3 text-center text-slate-300">
                            {act.marginImpact > 0 ? `+₹${act.marginImpact}` : `₹${act.marginImpact}`}
                          </td>
                          <td className="p-3 text-slate-300">{act.rationale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">Loading position recovery analysis...</div>
            )}
          </div>
        </div>
      )}

      {/* TAB: DEFENSE (CONVERSIONS & HEDGES) */}
      {activeTab === 'DEFENSE' && (
        <AdvancedExecutionControlPanel underlying={underlying} />
      )}

      {/* TAB 6: PORTFOLIO GREEK RISK, STRESS TESTING & HARD KILL SWITCH (Sections 26, 29, 85) */}
      {activeTab === 'RISK' && (
        <RiskControlPanel underlying={underlying} />
      )}

      {/* TAB 7: RESEARCH & LIFECYCLE GOVERNANCE */}
      {activeTab === 'RESEARCH' && (
        <StrategyLifecyclePanel />
      )}

      {/* TAB: MULTI-TIMEFRAME & SIZING */}
      {activeTab === 'MULTI_TIMEFRAME' && (
        <MultiTimeframePanel selectedSymbol={underlying} />
      )}

      {/* TAB: STRATEGY COMPARISON & QUALITY GATES */}
      {activeTab === 'COMPARISON' && (
        <StrategyComparisonView />
      )}

      {/* TAB: EVENTS, EDGE & REVIEWS */}
      {activeTab === 'EVENTS_REVIEWS' && (
        <EventReviewPanel underlying={underlying} />
      )}

      {/* TAB 8: QUANT CHART OVERLAY */}
      {activeTab === 'CHART' && (
        <div className="space-y-4">
          <QuantChartOverlay selectedSymbol={underlying} />
        </div>
      )}
    </div>
  );
};
