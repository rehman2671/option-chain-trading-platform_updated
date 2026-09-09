import React from 'react';
import { Layers, TrendingUp, TrendingDown, Target, Zap, ShieldAlert, BarChart3 } from 'lucide-react';
import { MarketStructureProfile, OptionFlowMetrics } from '../../quant/types';

interface FlowStructurePanelProps {
  structure: MarketStructureProfile | null;
  flow: OptionFlowMetrics | null;
  loading: boolean;
}

export const FlowStructurePanel: React.FC<FlowStructurePanelProps> = ({ structure, flow, loading }) => {
  if (!structure || !flow) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 font-mono">
        <Layers className="w-8 h-8 text-cyan-400 mx-auto mb-2 animate-pulse" />
        <div>Aggregating Market Structure Geometry and Real-time Option Flow...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">Trend Structure</div>
          <div className="text-lg font-bold text-cyan-400 mt-1">{structure.trendStructure}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Swing High/Low Pattern</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">Structure Break (BOS)</div>
          <div className={`text-lg font-bold mt-1 ${structure.breakOfStructure.includes('BULL') ? 'text-emerald-400' : 'text-slate-300'}`}>
            {structure.breakOfStructure}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">CHoCH: {structure.changeOfCharacter}</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">PCR OI / Vol</div>
          <div className="text-lg font-bold text-amber-400 mt-1">{flow.pcrOi} / {flow.pcrVolume}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Velocity: +{flow.pcrVelocity}/hr</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">Call Wall (Resist)</div>
          <div className="text-lg font-bold text-rose-400 mt-1">₹{flow.callWallStrike.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Peak Call OI Barrier</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">Put Wall (Support)</div>
          <div className="text-lg font-bold text-emerald-400 mt-1">₹{flow.putWallStrike.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Peak Put OI Barrier</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400 text-[11px]">Max Pain Pin Zone</div>
          <div className="text-lg font-bold text-purple-400 mt-1">₹{flow.maxPainStrike.toLocaleString()}</div>
          <div className="text-[10px] text-purple-300 mt-0.5">Pin Prob: {flow.pinningZone.probabilityPct}%</div>
        </div>
      </div>

      {/* Two Column Geometry and Flow Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Market Structure & Liquidity Clusters */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Target className="w-4 h-4 text-cyan-400" />
            <span>Market Geometry, Key Pivots & Liquidity Pools</span>
          </h3>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-slate-400">Previous Day High / Low</div>
              <div className="text-emerald-400 font-bold mt-1">PDH: ₹{structure.previousDayHigh}</div>
              <div className="text-rose-400 font-bold">PDL: ₹{structure.previousDayLow}</div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-slate-400">Opening Range (15m)</div>
              <div className="text-white font-bold mt-1">₹{structure.openingRangeLow} - ₹{structure.openingRangeHigh}</div>
              <div className="text-cyan-400 font-bold">State: {structure.openingRangeBreakout}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-300">Detected Liquidity Resting Pools:</div>
            {structure.liquidityZones.map((z, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                <span className={z.type === 'BUYSIDE_LIQUIDITY' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {z.type.replace('_', ' ')}: ₹{z.level || z.price}
                </span>
                <span className="text-[10px] text-slate-400">Cluster Vol: {(z.volumeCluster / 1000).toFixed(0)}k contracts</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-300">Key Supply & Demand Confluences:</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                <div className="font-bold text-emerald-300 mb-1">Support Zones</div>
                {structure.supportZones.map((s, i) => (
                  <div key={i} className="flex justify-between text-slate-300 text-[10px] py-0.5">
                    <span>₹{s.level}</span>
                    <span className="text-emerald-400 font-bold">{s.strength} ({s.touches}x)</span>
                  </div>
                ))}
              </div>

              <div className="p-2.5 bg-rose-950/20 border border-rose-500/30 rounded-xl">
                <div className="font-bold text-rose-300 mb-1">Resistance Zones</div>
                {structure.resistanceZones.map((r, i) => (
                  <div key={i} className="flex justify-between text-slate-300 text-[10px] py-0.5">
                    <span>₹{r.level}</span>
                    <span className="text-rose-400 font-bold">{r.strength} ({r.touches}x)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Option Flow Dynamics */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <span>Open Interest Flow Velocity & Strike Migration</span>
          </h3>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Aggregate Open Interest Balance:</span>
              <span className="font-bold text-cyan-400">{flow.oiMigration.direction.replace('_', ' ')}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">Total Call OI / Buildup</div>
                <div className="font-bold text-rose-400 text-sm mt-0.5">{(flow.totalCallOi / 100000).toFixed(1)} L</div>
                <div className="text-[10px] text-slate-500">Buildup: +{(flow.callOiBuildup / 100000).toFixed(1)} L</div>
              </div>

              <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">Total Put OI / Buildup</div>
                <div className="font-bold text-emerald-400 text-sm mt-0.5">{(flow.totalPutOi / 100000).toFixed(1)} L</div>
                <div className="text-[10px] text-slate-500">Buildup: +{(flow.putOiBuildup / 100000).toFixed(1)} L</div>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold text-slate-300">Anomalous Volume/OI Activity:</div>
              {flow.unusualVolumeStrikes.map((u, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded text-[11px]">
                  <span className="font-bold text-white">₹{u.strike} {u.optionType}</span>
                  <span className="text-amber-400 font-bold">{u.volumeToOiRatio}x Volume/OI Ratio</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-slate-200">Microstructure Summary:</div>
            <p>
              Dealer gamma flip positioned at ₹{structure.supportZones[0]?.level || 24000} creates an elastic volatility buffer.
              Option pinning target for current expiry sits tightly clustered at ₹{flow.maxPainStrike.toLocaleString()}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
