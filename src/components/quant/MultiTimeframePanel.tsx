import React, { useState, useEffect } from 'react';
import { Layers, Clock, TrendingUp, TrendingDown, Target, Shield, CheckCircle, Sliders, Calculator, Zap } from 'lucide-react';
import { MultiTimeframeAnalysis, TimeframeSignal } from '../../quant/intelligence/multiTimeframeEngine.js';
import { StrikeOptimizationResult } from '../../quant/decision/strikeSelectionEngine.js';
import { ExpiryOptimizationResult } from '../../quant/decision/expirySelectionEngine.js';
import { PositionSizingRecommendation } from '../../quant/decision/positionSizingEngine.js';
import { QuantUnderlying } from '../../quant/types.js';

interface MultiTimeframePanelProps {
  selectedSymbol: QuantUnderlying;
}

export const MultiTimeframePanel: React.FC<MultiTimeframePanelProps> = ({ selectedSymbol }) => {
  const [mtfData, setMtfData] = useState<MultiTimeframeAnalysis | null>(null);
  const [strikeData, setStrikeData] = useState<StrikeOptimizationResult | null>(null);
  const [expiryData, setExpiryData] = useState<ExpiryOptimizationResult | null>(null);
  const [sizingData, setSizingData] = useState<PositionSizingRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  // Position Sizing inputs
  const [capital, setCapital] = useState(500000);
  const [margin, setMargin] = useState(350000);
  const [riskPct, setRiskPct] = useState(1.5);
  const [stopPts, setStopPts] = useState(40);
  const [targetPts, setTargetPts] = useState(80);

  const fetchPanelData = async () => {
    try {
      setLoading(true);
      const [mtfRes, strRes, expRes] = await Promise.all([
        fetch(`/api/quant/multi-timeframe?underlying=${selectedSymbol}`),
        fetch(`/api/quant/strike-selection?underlying=${selectedSymbol}&strategy=bull_call`),
        fetch(`/api/quant/expiry-selection?underlying=${selectedSymbol}&family=SPREADS`)
      ]);

      if (mtfRes.ok) setMtfData(await mtfRes.json());
      if (strRes.ok) setStrikeData(await strRes.json());
      if (expRes.ok) setExpiryData(await expRes.json());

      // Sizing calculation
      const sizingRes = await fetch('/api/quant/position-sizing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          underlying: selectedSymbol,
          accountCapital: capital,
          availableMargin: margin,
          maxTradeRiskPct: riskPct,
          stopLossPoints: stopPts,
          targetPoints: targetPts,
          premiumPrice: 140
        })
      });
      if (sizingRes.ok) setSizingData(await sizingRes.json());
    } catch (err) {
      console.error('Failed to load multi-timeframe and decision data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPanelData();
  }, [selectedSymbol]);

  const handleRecalculateSizing = async () => {
    try {
      const sizingRes = await fetch('/api/quant/position-sizing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          underlying: selectedSymbol,
          accountCapital: capital,
          availableMargin: margin,
          maxTradeRiskPct: riskPct,
          stopLossPoints: stopPts,
          targetPoints: targetPts,
          premiumPrice: 140
        })
      });
      if (sizingRes.ok) setSizingData(await sizingRes.json());
    } catch (err) {
      console.error('Error recalculating sizing:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Multi-Timeframe Score & Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white tracking-wide">
                Multi-Timeframe Confluence Engine (Section 14)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Simultaneous 8-timeframe synthesis across trend structure, VWAP equilibrium, momentum acceleration, OI flow, and volatility.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className="text-[10px] uppercase font-mono text-slate-400">Timeframe Consensus</div>
              <div className="text-xl font-black text-white font-mono">
                {mtfData?.multiTimeframeScore || 78}<span className="text-xs text-slate-500 font-normal">/100</span>
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono ${
              mtfData?.directionalBias.includes('BULL')
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : mtfData?.directionalBias.includes('BEAR')
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            }`}>
              {mtfData?.directionalBias.replace('_', ' ') || 'MODERATE BULLISH'}
            </div>
          </div>
        </div>

        {/* 8-Timeframe Matrix Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 pt-4">
          {mtfData?.timeframes.map((tf: TimeframeSignal) => (
            <div
              key={tf.timeframe}
              className={`p-2.5 rounded-xl border font-mono text-xs transition ${
                tf.trend === 'BULLISH'
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : tf.trend === 'BEARISH'
                  ? 'bg-rose-950/20 border-rose-500/30'
                  : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span className="font-bold text-white text-xs">{tf.timeframe}</span>
                <span>{tf.weight}% Wgt</span>
              </div>
              <div className="mt-1.5 font-bold flex items-center space-x-1">
                {tf.trend === 'BULLISH' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : tf.trend === 'BEARISH' ? (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className={tf.trend === 'BULLISH' ? 'text-emerald-300' : tf.trend === 'BEARISH' ? 'text-rose-300' : 'text-slate-300'}>
                  {tf.trend}
                </span>
              </div>
              <div className="mt-1 text-[9px] text-slate-400 space-y-0.5">
                <div>VWAP: <strong className="text-slate-200">{tf.vwapRelation}</strong></div>
                <div>OI: <strong className="text-cyan-300">{tf.oiBias.split('_')[0]}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Strike Selection & Expiry Selection Engines (Sections 25 & 26) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        {/* Strike Selection Engine */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">Strike Selection Engine (Sec 25)</h4>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              ATM Strike: ₹{strikeData?.atmStrike || 24000}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans">
            Optimizes strikes using Delta (ATM/Wings), Open Interest Walls (Call/Put ceilings), and Expected Move bands.
          </p>

          <div className="space-y-2">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Selected Strategy Legs:</div>
            {strikeData?.selectedLegs.map((leg, idx) => (
              <div key={idx} className="p-2 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${leg.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {leg.action}
                  </span>
                  <span className="font-bold text-white text-xs">{selectedSymbol} ₹{leg.strike} {leg.type}</span>
                  <span className="text-[10px] text-slate-500 font-mono">(Δ {leg.delta})</span>
                </div>
                <span className="text-[10px] text-cyan-300 text-right">{leg.criterion}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400">Call Wall Strike:</span> <strong className="text-white">₹{strikeData?.callWallStrike}</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400">Put Wall Strike:</span> <strong className="text-white">₹{strikeData?.putWallStrike}</strong>
            </div>
          </div>
        </div>

        {/* Expiry Selection Engine */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-bold text-white">Dynamic Expiry Selection (Sec 26)</h4>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
              Selected: {expiryData?.selectedProfile || 'CURRENT_WEEKLY'} ({expiryData?.selectedDte} DTE)
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans">
            Compares 0DTE, 1DTE, weekly, and monthly expiries across theta bleed velocity, gamma sensitivity, and liquidity.
          </p>

          <div className="space-y-2">
            {expiryData?.candidates.map((cand, idx) => (
              <div key={idx} className={`p-2 rounded-xl border flex items-center justify-between ${
                cand.recommendedSuitability === 'PREFERRED'
                  ? 'bg-purple-950/20 border-purple-500/40'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <div>
                  <div className="flex items-center space-x-2">
                    <strong className="text-white text-xs">{cand.profile}</strong>
                    <span className="text-slate-400 text-[10px]">({cand.expiryDate} - {cand.dte} DTE)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Theta Bleed: <span className="text-amber-300">{cand.dailyThetaBleedPct}%/day</span> | Gamma Score: <span className="text-purple-300">{cand.gammaSensitivityScore}/100</span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  cand.recommendedSuitability === 'PREFERRED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {cand.recommendedSuitability}
                </span>
              </div>
            ))}
          </div>

          <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 text-[10px] text-slate-300">
            <strong className="text-purple-400">Optimization Verdict:</strong> {expiryData?.selectionRationale}
          </div>
        </div>
      </div>

      {/* 3. Position Sizing Engine (Section 27) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            <div>
              <h4 className="text-sm font-bold text-white">Risk-Budgeted Position Sizing Engine (Section 27)</h4>
              <p className="text-xs text-slate-400">
                Mathematical allocation via Fractional Kelly, Volatility (ATR) stop scaling, and drawdown dampeners. Prevents martingale.
              </p>
            </div>
          </div>
          <button
            onClick={handleRecalculateSizing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition font-mono"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Recalculate Size</span>
          </button>
        </div>

        {/* Input Parameters Controls */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Account Capital (₹)</label>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Available Margin (₹)</label>
            <input
              type="number"
              value={margin}
              onChange={e => setMargin(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Max Trade Risk (%)</label>
            <input
              type="number"
              step="0.5"
              value={riskPct}
              onChange={e => setRiskPct(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Stop Loss (Pts)</label>
            <input
              type="number"
              value={stopPts}
              onChange={e => setStopPts(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Target (Pts)</label>
            <input
              type="number"
              value={targetPts}
              onChange={e => setTargetPts(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            />
          </div>
        </div>

        {/* Output Recommendation Result */}
        {sizingData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-xs pt-1">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400">Recommended Allocation</span>
              <div className="text-xl font-black text-emerald-400 mt-1">
                {sizingData.recommendedLots} Lots <span className="text-xs text-slate-400 font-normal">({sizingData.totalQuantity} units)</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Lot size: {sizingData.lotSize} contracts</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400">Max Capital at Risk</span>
              <div className="text-lg font-bold text-rose-400 mt-1">
                ₹{sizingData.maxCapitalAtRiskINR.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{(riskPct).toFixed(1)}% of capital budget</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400">Fractional Kelly</span>
              <div className="text-lg font-bold text-cyan-400 mt-1">
                {(sizingData.fractionalKellyFraction * 100).toFixed(1)}% Fraction
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Quarter-Kelly risk cap</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400">Mathematical Expectancy</span>
              <div className="text-lg font-bold text-emerald-300 mt-1">
                +₹{sizingData.expectedValueINR.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">R:R 1:{sizingData.riskRewardRatio}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
