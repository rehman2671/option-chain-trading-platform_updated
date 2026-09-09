import React from 'react';
import { Flame, TrendingUp, AlertTriangle, Activity, BarChart2, Shield } from 'lucide-react';
import { IvSurfaceProfile } from '../../quant/types';

interface IvSurfacePanelProps {
  data: IvSurfaceProfile | null;
  loading: boolean;
  onRefresh: () => void;
}

export const IvSurfacePanel: React.FC<IvSurfacePanelProps> = ({ data, loading, onRefresh }) => {
  if (!data) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 font-mono">
        <Flame className="w-8 h-8 text-amber-400 mx-auto mb-2 animate-pulse" />
        <div>Computing Implied Volatility Surface & Greek Skew Structure...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Metric Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">ATM Implied Volatility</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{data.atmIv}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Base Underlying Vol</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">25Δ Put Skew (Smirk)</div>
          <div className="text-xl font-bold text-rose-400 mt-1">+{data.putSkew}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">25D Put IV: {data.delta25PutIv}%</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">25Δ Call Skew</div>
          <div className="text-xl font-bold text-cyan-400 mt-1">+{data.callSkew}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">25D Call IV: {data.delta25CallIv}%</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">Butterfly Spread (Fly)</div>
          <div className="text-xl font-bold text-purple-400 mt-1">+{data.flySpread}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Curvature & Tail Risk</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">IV Rank / Percentile</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{data.ivRank} / {data.ivPercentile}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">252D Trading Lookback</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">Expected 1D Move</div>
          <div className="text-xl font-bold text-white mt-1">±₹{data.expectedMove1D}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Expiry: ±₹{data.expectedMoveExpiry}</div>
        </div>
      </div>

      {/* Surface Volatility Profile & Term Structure Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Volatility Skew Structure */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Implied Volatility Smile & Delta Skew</span>
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                data.regime === 'IV_EXPANDING'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : data.regime === 'IV_RICH'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {data.regime}
            </span>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
            <div className="text-[11px] text-slate-400">Delta-Normalized Volatility Slices:</div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800">
                <span className="text-rose-400 font-bold">10Δ OTM Put (Crash Protection)</span>
                <span className="font-bold text-white">{data.delta10PutIv}%</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800">
                <span className="text-rose-300">25Δ OTM Put</span>
                <span className="font-bold text-white">{data.delta25PutIv}%</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-cyan-950/40 border border-cyan-500/40 font-bold">
                <span className="text-cyan-300">50Δ ATM Straddle Level</span>
                <span className="text-cyan-400">{data.atmIv}%</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800">
                <span className="text-emerald-300">25Δ OTM Call</span>
                <span className="font-bold text-white">{data.delta25CallIv}%</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800">
                <span className="text-emerald-400 font-bold">10Δ OTM Call (Squeeze Wing)</span>
                <span className="font-bold text-white">{data.delta10CallIv}%</span>
              </div>
            </div>

            {data.surfaceSkewAnomaly && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded text-rose-300 text-[11px] flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Skew Anomaly Detected: Elevated OTM put premium pricing asymmetric downside tail risk.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Term Structure (Contango / Backwardation) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <BarChart2 className="w-4 h-4 text-cyan-400" />
              <span>Volatility Term Structure Across Expiries</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              {data.termStructureInverted ? 'Backwardation (High Event Risk)' : 'Normal Contango'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">Expiry Cycle</th>
                  <th className="p-3 text-center">Days to Expiry</th>
                  <th className="p-3 text-center">ATM IV</th>
                  <th className="p-3 text-right">Structure State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.termStructure.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="p-3 font-bold text-white">{item.expiry}</td>
                    <td className="p-3 text-center text-slate-300">{item.daysToExpiry} DTE</td>
                    <td className="p-3 text-center font-bold text-amber-400">{item.atmIv}%</td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'CONTANGO'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-slate-200">Quantitative Volatility Thesis:</div>
            <p>
              Front-month weekly IV is trading at a {data.putSkew > 1.2 ? 'defensive skew' : 'neutral skew'} relative to monthly expiration.
              Calendar and diagonal spreads benefit from the current term structure slope.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
