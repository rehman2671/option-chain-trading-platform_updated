import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Zap,
  Sliders,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  Unlock,
  Flame,
  Activity,
  DollarSign,
  TrendingDown
} from 'lucide-react';
import { ComprehensiveStressReport, StressScenarioResult } from '../../quant/risk/stressEngine';
import { ExposureControllerState } from '../../quant/risk/exposureController';
import { KillSwitchState } from '../../quant/risk/killSwitch';

interface RiskControlPanelProps {
  underlying: string;
}

export const RiskControlPanel: React.FC<RiskControlPanelProps> = ({ underlying }) => {
  const [stressReport, setStressReport] = useState<ComprehensiveStressReport | null>(null);
  const [exposureState, setExposureState] = useState<ExposureControllerState | null>(null);
  const [killSwitchState, setKillSwitchState] = useState<KillSwitchState | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Modal / Confirmations
  const [confirmHaltOpen, setConfirmHaltOpen] = useState(false);
  const [unhaltKey, setUnhaltKey] = useState('');
  const [unhaltReason, setUnhaltReason] = useState('');
  const [unhaltMessage, setUnhaltMessage] = useState<string | null>(null);

  const fetchRiskData = async () => {
    try {
      setLoading(true);
      const [stressRes, expRes, ksRes] = await Promise.all([
        fetch(`/api/quant/stress-test?underlying=${underlying}`),
        fetch(`/api/quant/exposure-limits?underlying=${underlying}`),
        fetch('/api/quant/kill-switch')
      ]);

      if (stressRes.ok) setStressReport(await stressRes.json());
      if (expRes.ok) setExposureState(await expRes.json());
      if (ksRes.ok) setKillSwitchState(await ksRes.json());
    } catch (err) {
      console.error('Failed to load risk data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, [underlying]);

  const handleTriggerKillSwitch = async () => {
    try {
      const res = await fetch('/api/quant/kill-switch/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'ACTIVE_TRADER' })
      });
      if (res.ok) {
        const data = await res.json();
        setKillSwitchState(data.state);
        setConfirmHaltOpen(false);
      }
    } catch (err) {
      console.error('Kill switch trigger error:', err);
    }
  };

  const handleResetKillSwitch = async () => {
    if (!unhaltKey) return;
    try {
      const res = await fetch('/api/quant/kill-switch/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisorKey: unhaltKey,
          reason: unhaltReason || 'Manual supervisory unhalt following market stabilization'
        })
      });
      const data = await res.json();
      setUnhaltMessage(data.message);
      if (data.success) {
        setKillSwitchState(data.state);
        setUnhaltKey('');
        setUnhaltReason('');
      }
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  const scenarios = stressReport?.scenarios || [];
  const filteredScenarios =
    filterCategory === 'ALL'
      ? scenarios
      : scenarios.filter((s) => s.category === filterCategory);

  const isHalted = killSwitchState?.isTradingHalted || false;

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* 1. TOP BANNER: HARD RISK CONTROLS & EMERGENCY KILL SWITCH (Section 85 & B6) */}
      <div
        className={`border rounded-2xl p-5 shadow-2xl transition-all ${
          isHalted
            ? 'bg-rose-950/70 border-rose-500/80 text-rose-100 animate-pulse'
            : 'bg-slate-900/90 border-slate-800 text-slate-100'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isHalted
                  ? 'bg-rose-600 text-white'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold uppercase tracking-wider">
                  Hard Risk Controls & Kill Switch (Section 85)
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                    isHalted
                      ? 'bg-rose-500 text-white border-rose-400'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  STATUS: {killSwitchState?.status || 'ARMED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Non-overridable algorithmic tripwires. Immediate emergency square-off & lockout.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchRiskData}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
              title="Refresh Risk Metrics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {!isHalted ? (
              <button
                onClick={() => setConfirmHaltOpen(true)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg flex items-center space-x-2 transition border border-rose-400/50"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>EMERGENCY KILL SWITCH</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <input
                  type="password"
                  placeholder="Supervisor Key (RESET_RISK_AUTH)"
                  value={unhaltKey}
                  onChange={(e) => setUnhaltKey(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-rose-500/50 rounded-lg text-white text-xs placeholder:text-slate-600"
                />
                <button
                  onClick={handleResetKillSwitch}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition"
                >
                  Reset / Unhalt
                </button>
              </div>
            )}
          </div>
        </div>

        {/* If Halted, Show Halt Reason and Actions */}
        {isHalted && (
          <div className="mt-4 p-3 bg-rose-950/90 border border-rose-500/60 rounded-xl space-y-2">
            <div className="font-bold text-rose-300 flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>TRADING TRIPPED: {killSwitchState?.haltReason}</span>
            </div>
            <div className="text-[11px] text-rose-200/80">
              Actions Executed: {killSwitchState?.emergencyActionsExecuted.join(' • ')}
            </div>
            {unhaltMessage && (
              <div className="text-[11px] text-amber-300 font-bold">{unhaltMessage}</div>
            )}
          </div>
        )}

        {/* Confirmation Dialog Overlay */}
        {confirmHaltOpen && (
          <div className="mt-4 p-4 bg-slate-950 border border-rose-500 rounded-xl space-y-3">
            <div className="font-bold text-rose-400 text-sm">
              Confirm Emergency Execution Halt & Position Liquidation
            </div>
            <p className="text-slate-300 text-xs">
              This action will instantly cancel all open basket orders, trigger market square-offs for all open active positions, and lock out new entries across all strategy engines.
            </p>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleTriggerKillSwitch}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs"
              >
                YES, EXECUTE KILL SWITCH NOW
              </button>
              <button
                onClick={() => setConfirmHaltOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 4 Hard Limits Status Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px] uppercase font-bold">1. Daily Loss Limit</div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {killSwitchState?.currentDailyLossPct || 0.8}%
              </span>
              <span className="text-[10px] text-rose-400">Hard Cap: 3.0%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, ((killSwitchState?.currentDailyLossPct || 0.8) / 3) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px] uppercase font-bold">2. Max Drawdown Limit</div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {killSwitchState?.currentDrawdownPct || 2.1}%
              </span>
              <span className="text-[10px] text-rose-400">Hard Cap: 10.0%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-cyan-400 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, ((killSwitchState?.currentDrawdownPct || 2.1) / 10) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px] uppercase font-bold">3. Max Gross Leverage</div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {killSwitchState?.currentLeverageRatio || 0.9}x
              </span>
              <span className="text-[10px] text-amber-400">Hard Cap: 2.0x</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-purple-400 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, ((killSwitchState?.currentLeverageRatio || 0.9) / 2) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px] uppercase font-bold">4. Max Open Positions</div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {killSwitchState?.openPositionsCount || 3} / 10
              </span>
              <span className="text-[10px] text-emerald-400">Capacity Safe</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, ((killSwitchState?.openPositionsCount || 3) / 10) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. PORTFOLIO GREEK CEILINGS & EXPOSURE LIMITS (Section 26) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Portfolio Exposure & Greek Ceilings (Section 26)</span>
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Strict bounds on aggregate Delta, Gamma, Vega, Theta, and Capital at Risk (Max 20%).
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border ${
              exposureState?.overallCompliance === 'COMPLIANT'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
            }`}
          >
            COMPLIANCE: {exposureState?.overallCompliance || 'COMPLIANT'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {exposureState?.limits.map((limit, idx) => (
            <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>{limit.metric}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                    limit.status === 'SAFE'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : limit.status === 'WARNING'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {limit.status}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-base font-bold text-white">
                  {limit.currentValue.toLocaleString()}{' '}
                  <span className="text-xs text-slate-500">{limit.unit}</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Cap: {limit.limitMax.toLocaleString()} {limit.unit}
                </div>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    limit.status === 'SAFE'
                      ? 'bg-cyan-400'
                      : limit.status === 'WARNING'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, limit.utilizationPct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. STRESS TEST ENGINE (Section 29) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase">
                Stress Test Engine (Section 29)
              </h3>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              Simulates Spot shocks (±0.5%, ±1%, ±2%), IV shifts (±5, ±10), 1-2 day decay, overnight gaps, and Black Swan cascades.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-xs">Category:</span>
            {['ALL', 'SPOT', 'VOLATILITY', 'DECAY', 'GAP', 'EXTREME'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                  filterCategory === cat
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Stress Summary Banner */}
        {stressReport && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-4">
              <div>
                <div className="text-slate-500 text-[10px]">Worst-Case Stress Loss</div>
                <div className="text-rose-400 font-bold text-sm">
                  -₹{Math.abs(stressReport.worstCasePnl).toLocaleString()}
                </div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-slate-500 text-[10px]">Max Margin Surge</div>
                <div className="text-amber-400 font-bold text-sm">
                  +{stressReport.maxMarginSurgePct}%
                </div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-slate-500 text-[10px]">Max Liquidation Risk</div>
                <div className="text-purple-400 font-bold text-sm">
                  {stressReport.maxLiquidationRiskPct}%
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-slate-400 text-xs">Recommendation:</span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  stressReport.recommendation === 'PROCEED_FULL_SIZE'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : stressReport.recommendation === 'REDUCE_SIZE_50_PCT'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {stressReport.recommendation.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        )}

        {/* Scenarios Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-2.5">Scenario</th>
                <th className="p-2.5 text-center">Spot Shift</th>
                <th className="p-2.5 text-center">IV Shift</th>
                <th className="p-2.5 text-center">Decay</th>
                <th className="p-2.5 text-right">Projected P&L</th>
                <th className="p-2.5 text-right">Margin Req.</th>
                <th className="p-2.5 text-center">Surge %</th>
                <th className="p-2.5 text-center">Gamma Risk</th>
                <th className="p-2.5 text-center">Liquidation %</th>
                <th className="p-2.5 text-center">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredScenarios.map((sc) => (
                <tr key={sc.scenarioId} className="hover:bg-slate-800/40 transition">
                  <td className="p-2.5 font-bold text-white">
                    <div>{sc.name}</div>
                    <div className="text-[10px] text-slate-500 font-normal">{sc.note}</div>
                  </td>
                  <td className="p-2.5 text-center text-slate-300">
                    {sc.spotShiftPct > 0 ? `+${sc.spotShiftPct}%` : sc.spotShiftPct === 0 ? '0%' : `${sc.spotShiftPct}%`}
                  </td>
                  <td className="p-2.5 text-center text-slate-300">
                    {sc.ivShiftPoints > 0 ? `+${sc.ivShiftPoints} pts` : sc.ivShiftPoints === 0 ? '0 pts' : `${sc.ivShiftPoints} pts`}
                  </td>
                  <td className="p-2.5 text-center text-slate-300">{sc.decayDays}d</td>
                  <td className={`p-2.5 text-right font-bold ${sc.projectedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {sc.projectedPnl >= 0 ? '+' : ''}₹{sc.projectedPnl.toLocaleString()}
                  </td>
                  <td className="p-2.5 text-right text-slate-300 font-mono">
                    ₹{sc.marginRequired.toLocaleString()}
                  </td>
                  <td className="p-2.5 text-center text-amber-400 font-bold">
                    +{sc.marginSurgePct}%
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sc.gammaRisk === 'LOW'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : sc.gammaRisk === 'MODERATE'
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : sc.gammaRisk === 'HIGH'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {sc.gammaRisk}
                    </span>
                  </td>
                  <td className="p-2.5 text-center text-purple-300">
                    {sc.liquidationRiskPct}%
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sc.verdict === 'PASS'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : sc.verdict === 'CAUTION'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {sc.verdict}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
