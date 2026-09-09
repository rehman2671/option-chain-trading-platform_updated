import React, { useState } from 'react';
import { Play, ShieldCheck, AlertTriangle, Activity, Sliders, CheckCircle, RefreshCw } from 'lucide-react';
import { WalkForwardResult, MonteCarloResult, OverfitAnalysisResult } from '../../quant/types';

interface WalkForwardMonteCarloPanelProps {
  strategyId: string;
}

export const WalkForwardMonteCarloPanel: React.FC<WalkForwardMonteCarloPanelProps> = ({ strategyId }) => {
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [overfitResult, setOverfitResult] = useState<OverfitAnalysisResult | null>(null);
  const [loadingWf, setLoadingWf] = useState(false);
  const [loadingMc, setLoadingMc] = useState(false);
  const [loadingOverfit, setLoadingOverfit] = useState(false);

  const runWalkForward = async () => {
    try {
      setLoadingWf(true);
      const res = await fetch('/api/quant/walk-forward/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId, windowsCount: 4 })
      });
      if (res.ok) setWfResult(await res.json());
    } catch (err) {
      console.error('Walk forward failed:', err);
    } finally {
      setLoadingWf(false);
    }
  };

  const runMonteCarlo = async () => {
    try {
      setLoadingMc(true);
      const res = await fetch('/api/quant/monte-carlo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId, simulationsCount: 2000 })
      });
      if (res.ok) setMcResult(await res.json());
    } catch (err) {
      console.error('Monte Carlo failed:', err);
    } finally {
      setLoadingMc(false);
    }
  };

  const checkOverfitting = async () => {
    try {
      setLoadingOverfit(true);
      const res = await fetch(`/api/quant/overfit-analysis?strategyId=${strategyId}`);
      if (res.ok) setOverfitResult(await res.json());
    } catch (err) {
      console.error('Overfitting check failed:', err);
    } finally {
      setLoadingOverfit(false);
    }
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Action Trigger Buttons */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Robustness, Walk-Forward & Monte Carlo Engine (v2 Standard)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluate out-of-sample stability, 2,000 bootstrap simulations, and parameter perturbation immunity.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={runWalkForward}
            disabled={loadingWf}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl font-bold flex items-center space-x-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingWf ? 'animate-spin' : ''}`} />
            <span>{loadingWf ? 'Evaluating...' : 'Run Walk-Forward (4 Windows)'}</span>
          </button>

          <button
            onClick={runMonteCarlo}
            disabled={loadingMc}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center space-x-2 transition"
          >
            <Play className={`w-3.5 h-3.5 ${loadingMc ? 'animate-spin' : ''}`} />
            <span>{loadingMc ? 'Simulating...' : 'Run Monte Carlo (2,000 Runs)'}</span>
          </button>

          <button
            onClick={checkOverfitting}
            disabled={loadingOverfit}
            className="px-3.5 py-2 bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 border border-purple-500/40 rounded-xl font-bold flex items-center space-x-2 transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Test Parameter Stability</span>
          </button>
        </div>
      </div>

      {/* Grid of Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Walk-Forward Window Breakdown */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Walk-Forward Testing</h4>
            {wfResult && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${wfResult.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {wfResult.passed ? 'GATE PASSED' : 'GATE FAILED'}
              </span>
            )}
          </div>

          {wfResult ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-slate-400">IS / OOS Sharpe</div>
                  <div className="font-bold text-cyan-400 mt-0.5">{wfResult.inSampleSharpeAvg} / {wfResult.outOfSampleSharpeAvg}</div>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-slate-400">Efficiency Ratio</div>
                  <div className="font-bold text-emerald-400 mt-0.5">{(wfResult.efficiencyRatio * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div className="space-y-1.5">
                {wfResult.windows.map(w => (
                  <div key={w.windowId} className="p-2 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between text-[11px]">
                    <div>
                      <div className="font-bold text-slate-200">Window #{w.windowId}</div>
                      <div className="text-[10px] text-slate-500">{w.testStart} → {w.testEnd}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 font-bold">+₹{w.testNetPnl.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400">OOS Sharpe: {w.testSharpe}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              Click &quot;Run Walk-Forward&quot; to execute multi-window out-of-sample backtests.
            </div>
          )}
        </div>

        {/* 2. Monte Carlo 2000 Runs */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Monte Carlo (2,000 Runs)</h4>
            {mcResult && (
              <span className="text-[10px] text-emerald-400 font-bold">
                Ruin Risk: {mcResult.riskOfRuinPct}%
              </span>
            )}
          </div>

          {mcResult ? (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">5th Percentile (Adverse):</span>
                  <span className="text-rose-400 font-bold">₹{mcResult.percentile5Pnl.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">50th Percentile (Median):</span>
                  <span className="text-cyan-400 font-bold">₹{mcResult.percentile50Pnl.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">95th Percentile (Favorable):</span>
                  <span className="text-emerald-400 font-bold">₹{mcResult.percentile95Pnl.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-slate-300 font-bold">Drawdown Distribution:</div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Median DD (p50):</span>
                  <span className="text-amber-400 font-bold">₹{mcResult.maxDrawdownDistribution.p50.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Tail DD (p95):</span>
                  <span className="text-rose-400 font-bold">₹{mcResult.maxDrawdownDistribution.p95.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Min Capital Needed:</span>
                  <span className="text-white font-bold">₹{mcResult.worstCaseCapitalNeeded.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              Click &quot;Run Monte Carlo&quot; to test 2,000 bootstrap resamplings.
            </div>
          )}
        </div>

        {/* 3. Parameter Stability & Overfitting */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Overfit & Stability Test</h4>
            {overfitResult && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${overfitResult.overfitRisk === 'LOW' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {overfitResult.overfitRisk} RISK
              </span>
            )}
          </div>

          {overfitResult ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-slate-400">Stability Score</div>
                  <div className="font-bold text-emerald-400 mt-0.5">{overfitResult.parameterStabilityScore}/100</div>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-slate-400">PBO Probability</div>
                  <div className="font-bold text-cyan-400 mt-0.5">{(overfitResult.probabilityOfBacktestOverfit * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-300">Parameter Perturbation Checks:</div>
                {overfitResult.perturbedParameterPerformance.map((p, idx) => (
                  <div key={idx} className="p-2 bg-slate-950 border border-slate-800 rounded flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-white">{p.parameter}: </span>
                      <span className="text-slate-400">{p.originalValue} → {p.perturbedValue}</span>
                    </div>
                    <div className={p.pnlImpactPct >= 0 ? 'text-emerald-400 font-bold' : 'text-slate-300 font-bold'}>
                      {p.pnlImpactPct >= 0 ? '+' : ''}{p.pnlImpactPct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              Click &quot;Test Parameter Stability&quot; to test neighbor parameter values.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
