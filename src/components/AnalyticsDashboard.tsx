/**
 * Deep Analytics Dashboard: OI Distribution, IV Skew Curve,
 * Max Pain Loss Surface, and Unusual OI Anomaly Feed
 */

import React from 'react';
import { OptionChainSnapshot, OIAnomaly, EventReactiveState } from '../types.js';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { Activity, AlertTriangle, TrendingUp, ShieldAlert, Sparkles, PieChart } from 'lucide-react';

interface AnalyticsDashboardProps {
  snapshot: OptionChainSnapshot | null;
  anomalies: OIAnomaly[];
  eventState: EventReactiveState | null;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  snapshot,
  anomalies,
  eventState
}) => {
  if (!snapshot) {
    return <div className="p-8 text-center text-slate-400 font-mono">Loading analytics feed...</div>;
  }

  // OI Distribution Data for Recharts
  const oiData = snapshot.strikes.map(s => ({
    strike: s.strikePrice,
    callOI: s.ce.oiAvailable !== false && s.ce.available !== false ? Math.round(s.ce.openInterest / 1000) : null, // in Thousands
    putOI: s.pe.oiAvailable !== false && s.pe.available !== false ? Math.round(s.pe.openInterest / 1000) : null,
    callIV: s.ce.ivAvailable !== false && s.ce.available !== false ? s.ce.iv : null,
    putIV: s.pe.ivAvailable !== false && s.pe.available !== false ? s.pe.iv : null
  }));

  // IV Skew Data
  const skewData = snapshot.strikes.map(s => ({
    strike: s.strikePrice,
    callIV: s.ce.ivAvailable !== false && s.ce.available !== false ? s.ce.iv : null,
    putIV: s.pe.ivAvailable !== false && s.pe.available !== false ? s.pe.iv : null,
    skewDiff: (s.pe.ivAvailable !== false && s.ce.ivAvailable !== false) ? Number((s.pe.iv - s.ce.iv).toFixed(2)) : null
  }));

  return (
    <div className="space-y-6 font-mono text-xs">
      {snapshot.isPartialData && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-300 font-mono text-xs flex items-center justify-between">
          <span>⚠️ <strong>Partial Data Warning:</strong> {snapshot.unavailableStrikeCount} option contract field(s) were unavailable. Aggregate metrics (Max Pain, PCR, Skew) are computed from available subset only.</span>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
            <span>Max Pain Strike</span>
            {snapshot.isPartialData && <span className="text-amber-400 text-[9px] font-bold">PARTIAL</span>}
          </div>
          <div className="text-xl font-black text-cyan-400 mt-1">₹{snapshot.maxPainStrike}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Minimizes option writers' payout</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
            <span>PCR (Open Interest)</span>
            {snapshot.isPartialData && <span className="text-amber-400 text-[9px] font-bold">PARTIAL</span>}
          </div>
          <div className={`text-xl font-black mt-1 ${snapshot.pcrOI >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {snapshot.pcrOI}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {snapshot.pcrOI > 1.2 ? 'Bullish Put Support' : (snapshot.pcrOI < 0.8 ? 'Bearish Call Overhead' : 'Neutral Equilibrium')}
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="text-slate-400 text-[10px] uppercase font-semibold">IV Rank / Percentile</div>
          <div className="text-xl font-black text-amber-400 mt-1">{snapshot.ivRank}% / {snapshot.ivPercentile}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">252-day relative volatility range</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="text-slate-400 text-[10px] uppercase font-semibold">Institutional Bias</div>
          <div className="text-base font-black text-teal-300 mt-1">
            {eventState?.institutionalBias || 'BALANCED'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">PE/CE Skew Divergence: {eventState?.peCeSkewDivergence}%</div>
        </div>
      </div>

      {/* Grid: OI Bar Chart & IV Skew Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Interest Bar Chart */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>Open Interest Distribution (Thousands)</span>
            </h3>
            <span className="text-[10px] text-slate-400">Green = Put OI | Red = Call OI</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={oiData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="strike" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                  formatter={(val: any) => [`${val}k Contracts`, '']}
                />
                <Bar dataKey="callOI" name="Call OI" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="putOI" name="Put OI" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* IV Skew Curve */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Implied Volatility Skew Curve (%)</span>
            </h3>
            <span className="text-[10px] text-slate-400">Put Smirk vs Call IV</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={skewData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="strike" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                  formatter={(val: any) => [`${val}%`, 'IV']}
                />
                <Line type="monotone" dataKey="callIV" name="Call IV" stroke="#f87171" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="putIV" name="Put IV" stroke="#34d399" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Statistically Significant Unusual OI Anomaly Detector Feed */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Unusual OI Anomaly Detector (Z-Score &gt; 2.0σ Threshold)</span>
          </h3>
          <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
            {anomalies.length} Anomalies Flagged
          </span>
        </div>

        {anomalies.length === 0 ? (
          <div className="p-8 text-center text-slate-500 italic">
            No statistical outliers (&gt;2.0σ) detected in current snapshot cycle.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {anomalies.map(anom => (
              <div key={anom.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${
                    anom.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {anom.severity} ({anom.zScore}σ)
                  </span>

                  <div>
                    <div className="font-bold text-slate-200">
                      {anom.symbol} {anom.strikePrice} {anom.type}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{anom.description}</div>
                  </div>
                </div>

                <div className="text-right font-mono text-[11px]">
                  <div className="text-slate-300">OI Chg: <strong className="text-emerald-400">+{anom.oiChange.toLocaleString('en-IN')}</strong></div>
                  <div className="text-slate-500 text-[10px]">Vol: {anom.volume.toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
