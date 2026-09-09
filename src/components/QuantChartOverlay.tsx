import React, { useState, useEffect } from 'react';
import { Shield, Zap, TrendingUp, AlertTriangle, RefreshCw, Eye, EyeOff, Info, Layers } from 'lucide-react';
import { ExpertTraderChart } from './ExpertTraderChart';
import { MarketRegimeState, QuantUnderlying, HistoricalAnalogueResult, PositionRecoveryAnalysis } from '../quant/types';
import { QuantSignalOverlay } from '../quant/signals/signalGenerator.js';
import { Ema15mCandle, Ema15mInstrument } from '../types.js';

interface QuantChartOverlayProps {
  selectedSymbol: string;
  onSymbolChange?: (symbol: string) => void;
  className?: string;
}

export const QuantChartOverlay: React.FC<QuantChartOverlayProps> = ({
  selectedSymbol,
  onSymbolChange,
  className = ''
}) => {
  const underlying: QuantUnderlying =
    selectedSymbol.includes('BANK') ? 'BANKNIFTY' : selectedSymbol.includes('SENSEX') ? 'SENSEX' : 'NIFTY';

  const [regime, setRegime] = useState<MarketRegimeState | null>(null);
  const [analogues, setAnalogues] = useState<HistoricalAnalogueResult | null>(null);
  const [recovery, setRecovery] = useState<PositionRecoveryAnalysis | null>(null);
  const [signal, setSignal] = useState<QuantSignalOverlay | null>(null);
  const [candles, setCandles] = useState<Ema15mCandle[]>([]);
  const [loading, setLoading] = useState(false);

  // Overlay layer visibility toggles
  const [showQuantLevels, setShowQuantLevels] = useState(true);
  const [showAnalogueHud, setShowAnalogueHud] = useState(true);
  const [showThesisBadge, setShowThesisBadge] = useState(true);
  const [showRecoveryPills, setShowRecoveryPills] = useState(true);
  const [showSignalOverlay, setShowSignalOverlay] = useState(true);

  const fetchQuantOverlayData = async () => {
    try {
      setLoading(true);
      const [regRes, anaRes, recRes, sigRes, candlesRes] = await Promise.all([
        fetch(`/api/quant/regime?underlying=${underlying}`),
        fetch(`/api/quant/analogues?underlying=${underlying}`),
        fetch(`/api/quant/recovery`),
        fetch(`/api/quant/signals?underlying=${underlying}`),
        fetch(`/api/ema15m/candles?symbol=${underlying}&limit=150&timeframe=15m&range=5D`)
      ]);

      if (regRes.ok) setRegime(await regRes.json());
      if (anaRes.ok) setAnalogues(await anaRes.json());
      if (recRes.ok) setRecovery(await recRes.json());
      if (sigRes.ok) setSignal(await sigRes.json());
      if (candlesRes.ok) {
        const cData = await candlesRes.json();
        if (Array.isArray(cData)) setCandles(cData);
      }
    } catch (err) {
      console.error('Failed to load quant overlay data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuantOverlayData();
  }, [underlying]);

  return (
    <div className={`relative flex flex-col space-y-3 ${className}`}>
      {/* 1. Quant Overlay Control Strip */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg backdrop-blur flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5 bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-1 rounded-lg text-cyan-300 font-bold">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>QUANT CHART OVERLAY</span>
          </div>

          {regime && (
            <div className="flex items-center space-x-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-slate-300">
              <span className="text-slate-500">Regime:</span>
              <strong className="text-emerald-400">{regime.primaryRegime}</strong>
              <span className="text-slate-600">|</span>
              <span className="text-slate-500">Vol:</span>
              <span className="text-amber-400">{regime.volatilityRegime}</span>
            </div>
          )}
        </div>

        {/* Toggles */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <button
            onClick={() => setShowQuantLevels(!showQuantLevels)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border transition ${
              showQuantLevels
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            {showQuantLevels ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3" />}
            <span>OI & Gamma Levels</span>
          </button>

          <button
            onClick={() => setShowAnalogueHud(!showAnalogueHud)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border transition ${
              showAnalogueHud
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            {showAnalogueHud ? <Eye className="w-3 h-3 text-purple-400" /> : <EyeOff className="w-3 h-3" />}
            <span>Historical Analogue HUD</span>
          </button>

          <button
            onClick={() => setShowThesisBadge(!showThesisBadge)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border transition ${
              showThesisBadge
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            {showThesisBadge ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3" />}
            <span>Thesis & Invalidation</span>
          </button>

          <button
            onClick={() => setShowRecoveryPills(!showRecoveryPills)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border transition ${
              showRecoveryPills
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            {showRecoveryPills ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3" />}
            <span>Recovery EV</span>
          </button>

          <button
            onClick={() => setShowSignalOverlay(!showSignalOverlay)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border transition ${
              showSignalOverlay
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            {showSignalOverlay ? <Eye className="w-3 h-3 text-blue-400" /> : <EyeOff className="w-3 h-3" />}
            <span>Signal Overlay (Sec 59)</span>
          </button>

          <button
            onClick={fetchQuantOverlayData}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Refresh Quant Overlay Metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Primary Underlying Chart (100% Preserved) Wrapped with Overlays */}
      <div className="relative">
        <ExpertTraderChart
          symbol={underlying as Ema15mInstrument}
          candles={candles}
          signals={[]}
          currentPrice={regime?.keyLevels?.gammaFlip || (underlying === 'BANKNIFTY' ? 51500 : underlying === 'SENSEX' ? 79500 : 24000)}
          onRefreshData={fetchQuantOverlayData}
          isLoading={loading}
        />

        {/* --- ADDITIVE OVERLAY LAYER 1: Key Quant Levels HUD Banner --- */}
        {showQuantLevels && regime?.keyLevels && (
          <div className="absolute top-16 left-4 z-20 pointer-events-none flex flex-col space-y-1 font-mono text-[11px]">
            <div className="bg-slate-950/85 backdrop-blur border border-rose-500/40 rounded-lg px-2.5 py-1 text-rose-300 shadow-md flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              <span>CALL WALL (Resist):</span>
              <strong className="text-white">₹{regime.keyLevels.callWall.toLocaleString()}</strong>
            </div>

            <div className="bg-slate-950/85 backdrop-blur border border-purple-500/40 rounded-lg px-2.5 py-1 text-purple-300 shadow-md flex items-center space-x-2">
              <Zap className="w-3 h-3 text-purple-400" />
              <span>GAMMA FLIP:</span>
              <strong className="text-white">₹{regime.keyLevels.gammaFlip.toLocaleString()}</strong>
            </div>

            <div className="bg-slate-950/85 backdrop-blur border border-emerald-500/40 rounded-lg px-2.5 py-1 text-emerald-300 shadow-md flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>PUT WALL (Support):</span>
              <strong className="text-white">₹{regime.keyLevels.putWall.toLocaleString()}</strong>
            </div>

            <div className="bg-slate-950/85 backdrop-blur border border-amber-500/30 rounded-lg px-2.5 py-1 text-amber-300 shadow-md flex items-center space-x-2">
              <Shield className="w-3 h-3 text-amber-400" />
              <span>EXP. MOVE (1D):</span>
              <strong className="text-white">±₹{regime.keyLevels.expectedMove}</strong>
            </div>
          </div>
        )}

        {/* --- ADDITIVE OVERLAY LAYER 2: Historical Analogue Probability HUD --- */}
        {showAnalogueHud && analogues && (
          <div className="absolute top-16 right-4 z-20 pointer-events-auto bg-slate-950/90 backdrop-blur border border-purple-500/30 rounded-xl p-3 shadow-xl max-w-xs font-mono text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-[10px] text-purple-400 font-bold uppercase flex items-center space-x-1">
                <TrendingUp className="w-3 h-3" />
                <span>Historical Analogue HUD</span>
              </span>
              <span className="text-[10px] text-slate-400">{analogues.sampleCount} Samples</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
              <div className="bg-emerald-950/60 border border-emerald-500/30 rounded p-1">
                <div className="text-slate-400">Upside</div>
                <div className="text-emerald-400 font-bold">{(analogues.outcomes.horizon30m.upProb * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-rose-950/60 border border-rose-500/30 rounded p-1">
                <div className="text-slate-400">Downside</div>
                <div className="text-rose-400 font-bold">{(analogues.outcomes.horizon30m.downProb * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded p-1">
                <div className="text-slate-400">Flat</div>
                <div className="text-slate-300 font-bold">{(analogues.outcomes.horizon30m.flatProb * 100).toFixed(0)}%</div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 flex items-center justify-between">
              <span>Expected 30m Return:</span>
              <strong className={analogues.outcomes.horizon30m.expectedReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {analogues.outcomes.horizon30m.expectedReturnPct >= 0 ? '+' : ''}{analogues.outcomes.horizon30m.expectedReturnPct}%
              </strong>
            </div>
          </div>
        )}

        {/* --- ADDITIVE OVERLAY LAYER 3: Trade Thesis & Invalidation Badge --- */}
        {showThesisBadge && regime && (
          <div className="absolute bottom-16 left-4 z-20 pointer-events-auto bg-slate-950/90 backdrop-blur border border-cyan-500/30 rounded-xl p-3 shadow-xl max-w-sm font-mono text-xs space-y-1.5">
            <div className="flex items-center space-x-1.5 text-cyan-400 font-bold text-[10px] uppercase">
              <Info className="w-3.5 h-3.5" />
              <span>Active Trade Thesis</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {regime.rationale}. Multi-timeframe trend aligns with positive gamma expansion.
            </p>
            <div className="text-[10px] text-rose-400/90 pt-1 border-t border-slate-800">
              <strong>Invalidation:</strong> Closes below VWAP or PCR drop &lt; 0.90
            </div>
          </div>
        )}

        {/* --- ADDITIVE OVERLAY LAYER 4: Adaptive Position Recovery HUD --- */}
        {showRecoveryPills && recovery && (
          <div className="absolute bottom-16 right-4 z-20 pointer-events-auto bg-slate-950/90 backdrop-blur border border-emerald-500/30 rounded-xl p-3 shadow-xl max-w-xs font-mono text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-[10px] text-emerald-400 font-bold uppercase flex items-center space-x-1">
                <Shield className="w-3 h-3" />
                <span>Recovery Engine EV</span>
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                  recovery.currentThesisState === 'HEALTHY'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {recovery.currentThesisState}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px]">
              {recovery.actionEvaluations.slice(0, 3).map(act => (
                <div
                  key={act.action}
                  className={`rounded p-1 text-center border ${
                    act.action === recovery.recommendedAction
                      ? 'bg-cyan-950 border-cyan-500/50 text-cyan-300 font-bold'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400'
                  }`}
                >
                  <div>{act.action}</div>
                  <div className={act.expectedValue >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {act.expectedValue >= 0 ? '+' : ''}₹{act.expectedValue}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[10px] text-slate-400">
              Optimal Action: <strong className="text-cyan-300 font-bold">{recovery.recommendedAction}</strong>
            </div>
          </div>
        )}

        {/* --- ADDITIVE OVERLAY LAYER 5: Section 59 Quant Setup Signal Overlay --- */}
        {showSignalOverlay && signal && (
          <div className="absolute top-16 left-60 z-20 pointer-events-auto bg-slate-950/95 backdrop-blur-md border border-blue-500/40 rounded-xl p-3.5 shadow-2xl max-w-xs font-mono text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                <span className="text-[11px] text-blue-300 font-bold uppercase tracking-wider">
                  Quant Signal Overlay (Sec 59)
                </span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                signal.conviction.includes('BULL')
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : signal.conviction.includes('BEAR')
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {signal.conviction.replace('_', ' ')}
              </span>
            </div>

            <div className="flex items-baseline justify-between bg-blue-950/40 border border-blue-500/20 rounded-lg p-2">
              <div>
                <div className="text-[10px] text-slate-400">Institutional Score</div>
                <div className="text-lg font-black text-white">
                  {signal.totalScore}<span className="text-xs text-slate-400 font-normal">/{signal.maxScore}</span>
                  <span className="ml-2 text-xs text-blue-400 font-semibold">({signal.scorePct}%)</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">Preferred Strategy</div>
                <div className="text-xs font-bold text-cyan-300">{signal.preferredStrategy.replace(/_/g, ' ')}</div>
              </div>
            </div>

            <div className="space-y-1 text-[10px] max-h-36 overflow-y-auto pr-1">
              {signal.components.map(comp => (
                <div key={comp.name} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                  <span className="text-slate-400">{comp.name}:</span>
                  <span className={`font-semibold ${comp.score > 0 ? 'text-emerald-400' : comp.score < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {comp.verdict}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800 text-[10px]">
              <div className="bg-slate-900/90 rounded p-1">
                <span className="text-slate-500">Exp. Move:</span> <strong className="text-white">±{signal.expectedMovePoints} pts</strong>
              </div>
              <div className="bg-slate-900/90 rounded p-1">
                <span className="text-slate-500">Expectancy:</span> <strong className="text-emerald-400">+{signal.expectancyR}R</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
