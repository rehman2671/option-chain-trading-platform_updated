import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ArrowRightLeft,
  Lock,
  Percent,
  CheckCircle2,
  TrendingDown,
  RefreshCw,
  SlidersHorizontal,
  Flame,
  Zap,
  RotateCcw,
  AlertTriangle,
  Shield,
  Activity,
  DollarSign
} from 'lucide-react';
import {
  TradeConversionPlan,
  HedgeEvaluationResult,
  ProfitLockStatus,
  DrawdownControlStatus
} from '../../quant/types';
import { RollOptionEvaluation } from '../../quant/position/rollEngine';
import { PositionMonitoringReport } from '../../quant/position/positionMonitor';
import { MarginRequirement } from '../../quant/adapters/marginAdapter';

interface Props {
  underlying: string;
}

export const AdvancedExecutionControlPanel: React.FC<Props> = ({ underlying }) => {
  const [conversions, setConversions] = useState<TradeConversionPlan[]>([]);
  const [hedges, setHedges] = useState<HedgeEvaluationResult[]>([]);
  const [profitLock, setProfitLock] = useState<ProfitLockStatus | null>(null);
  const [drawdown, setDrawdown] = useState<DrawdownControlStatus | null>(null);
  const [rolls, setRolls] = useState<RollOptionEvaluation[]>([]);
  const [monitors, setMonitors] = useState<PositionMonitoringReport[]>([]);
  const [marginInfo, setMarginInfo] = useState<MarginRequirement | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [convRes, hedgeRes, lockRes, ddRes, rollRes, monRes, marginRes] = await Promise.all([
        fetch(`/api/quant/conversions?symbol=${underlying}&structure=LONG_CALL`),
        fetch(`/api/quant/hedges?symbol=${underlying}&delta=0.52&gamma=-0.048`),
        fetch('/api/quant/profit-lock?realized=18500&unrealized=8200'),
        fetch('/api/quant/drawdown-status?currentCapital=485000&peakCapital=500000'),
        fetch(`/api/quant/roll-evaluation?underlying=${underlying}&loss=-1850`),
        fetch(`/api/quant/position-monitor?underlying=${underlying}`),
        fetch(`/api/quant/margin-check?underlying=${underlying}&structure=IRON_CONDOR&lots=1`)
      ]);

      if (convRes.ok) setConversions(await convRes.json());
      if (hedgeRes.ok) setHedges(await hedgeRes.json());
      if (lockRes.ok) setProfitLock(await lockRes.json());
      if (ddRes.ok) setDrawdown(await ddRes.json());
      if (rollRes.ok) setRolls(await rollRes.json());
      if (monRes.ok) setMonitors(await monRes.json());
      if (marginRes.ok) setMarginInfo(await marginRes.json());
    } catch (err) {
      console.error('Error fetching execution controls:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [underlying]);

  const handleResetHalt = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/quant/drawdown/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: 'lead_quant', reason: 'Operator manual inspection verified' })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <span>Advanced Execution Controls & Dynamic Defense</span>
          </h2>
          <p className="text-xs text-slate-400">
            Automated trade conversions, Greek hedge calibration, session profit lock, position roll defense, and drawdown gating.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs transition border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Controls</span>
        </button>
      </div>

      {/* Top Metrics: Profit Lock & Drawdown Controller */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profit Lock Status */}
        {profitLock && (
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Session Profit Lock</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  profitLock.state === 'EXTREME_PROFIT'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : profitLock.state === 'STRONG_PROFIT'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {profitLock.state}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">Realized P&L</div>
                <div className="text-emerald-400 font-bold mt-0.5">+₹{profitLock.dailyRealizedPnl.toLocaleString()}</div>
              </div>
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">Unrealized P&L</div>
                <div className="text-cyan-400 font-bold mt-0.5">+₹{profitLock.dailyUnrealizedPnl.toLocaleString()}</div>
              </div>
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">Trailing Lock Floor</div>
                <div className="text-amber-400 font-bold mt-0.5">₹{profitLock.trailingLockFloor.toLocaleString()}</div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs flex items-center justify-between">
              <span className="text-slate-400">Size Multiplier:</span>
              <span className="font-bold text-white font-mono">{profitLock.riskReductionFactor * 100}% of standard size</span>
            </div>
            <p className="text-[11px] text-slate-400">{profitLock.message}</p>
          </div>
        )}

        {/* Drawdown Controller Status */}
        {drawdown && (
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase flex items-center space-x-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Drawdown Governance & Circuit Gating</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  drawdown.isHalted
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                    : drawdown.tier === 'NORMAL_DD'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {drawdown.tier}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">Drawdown %</div>
                <div className="text-rose-400 font-bold mt-0.5">-{drawdown.currentDrawdownPct}%</div>
              </div>
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">Loss from Peak</div>
                <div className="text-rose-300 font-bold mt-0.5">-₹{drawdown.lossFromPeak.toLocaleString()}</div>
              </div>
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">Current Multiplier</div>
                <div className="text-cyan-400 font-bold mt-0.5">{drawdown.sizingMultiplier * 100}%</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-400">Automated Circuit Halt:</span>
              <div className="flex items-center space-x-2">
                <span className={`font-bold ${drawdown.isHalted ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {drawdown.isHalted ? 'TRADING HALTED' : 'NORMAL EXECUTION'}
                </span>
                {drawdown.isHalted && (
                  <button
                    onClick={handleResetHalt}
                    disabled={resetting}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition"
                  >
                    {resetting ? 'Resetting...' : 'Reset Halt'}
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">{drawdown.recoveryActionPlan}</p>
          </div>
        )}
      </div>

      {/* Margin Adapter & Portfolio Buffer */}
      {marginInfo && (
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-cyan-950 border border-cyan-500/40 rounded-xl text-cyan-300">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-slate-400">NSE SPAN & Exposure Margin Model ({marginInfo.strategyStructure})</div>
              <div className="text-white font-bold text-sm">
                Required Margin: ₹{marginInfo.totalMarginRequired.toLocaleString()} | Spread Hedge Benefit: +₹{marginInfo.benefitFromHedge.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-slate-400 text-[10px]">Margin Utilization</div>
              <div className="text-emerald-400 font-bold">{marginInfo.marginUtilizationPct}%</div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                marginInfo.isMarginSufficient
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              {marginInfo.isMarginSufficient ? 'MARGIN SUFFICIENT' : 'MARGIN DEFICIENT'}
            </span>
          </div>
        </div>
      )}

      {/* Active Position Monitor (Section 30) */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Adaptive Position Health Monitor & Greek Drift</span>
            </h3>
            <p className="text-xs text-slate-400">
              Real-time surveillance of open live/paper trades, MFE/MAE retracements, and thesis health.
            </p>
          </div>
          <span className="px-2.5 py-1 bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg font-bold">
            {monitors.length} Active Positions
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {monitors.map((m, idx) => (
            <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-xs">{m.symbol}</div>
                  <div className="text-[10px] text-slate-400">ID: {m.positionId} | DTE: {m.remainingDte}d</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-xs ${m.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {m.pnl >= 0 ? '+' : ''}₹{m.pnl} ({m.pnlPct}%)
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      m.thesisState === 'HEALTHY'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {m.thesisState} ({m.thesisHealthScore}/100)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-[10px] bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-400">Delta</span>
                  <div className="text-cyan-300 font-bold">{m.greeksExposure.delta}</div>
                </div>
                <div>
                  <span className="text-slate-400">Gamma</span>
                  <div className="text-purple-300 font-bold">{m.greeksExposure.gamma}</div>
                </div>
                <div>
                  <span className="text-slate-400">Theta</span>
                  <div className="text-emerald-300 font-bold">{m.greeksExposure.theta}</div>
                </div>
                <div>
                  <span className="text-slate-400">Vega</span>
                  <div className="text-amber-300 font-bold">{m.greeksExposure.vega}</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>MFE: <strong className="text-emerald-400">+{m.mfe} pts</strong></span>
                <span>MAE: <strong className="text-rose-400">{m.mae} pts</strong></span>
                <span className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-cyan-300 font-bold">
                  Rec: {m.recommendedIntervention}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade Conversions Section */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              <span>Research-Backed Trade Conversion Engine</span>
            </h3>
            <p className="text-xs text-slate-400">
              Transform naked or adverse positions into hedged spreads or winged iron flies to cap risk and finance decay.
            </p>
          </div>
          <span className="px-2.5 py-1 bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg font-bold">
            {conversions.length} Eligible Plans
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {conversions.map((plan, idx) => (
            <div
              key={idx}
              className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">{plan.currentStructure}</span>
                <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold">
                  {plan.feasibilityScore}/100 Feasible
                </span>
              </div>

              <div className="text-sm font-bold text-cyan-300 flex items-center space-x-1.5">
                <span>&rarr;</span>
                <span>{plan.proposedStructure}</span>
              </div>

              <div className="space-y-1.5 text-[11px] bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                <div className="flex justify-between">
                  <span className="text-slate-400">Margin Impact:</span>
                  <span className="text-emerald-400 font-bold">₹{plan.marginImpact.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Net Delta Shift:</span>
                  <span className="text-slate-200">{plan.netDeltaShift > 0 ? '+' : ''}{plan.netDeltaShift}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Expected EV:</span>
                  <span className="text-cyan-400 font-bold">+{plan.expectedValueR}R</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">{plan.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Defensive Roll Engine Section (Section 31) */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <RotateCcw className="w-4 h-4 text-purple-400" />
              <span>Defensive Strike & Expiry Roll Engine (Section 31)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Evaluate rolling options forward in time (calendar roll) or adjusting strikes (vertical/diagonal) to re-center delta and collect recovery credit.
            </p>
          </div>
          <span className="px-2.5 py-1 bg-purple-950/80 border border-purple-500/30 text-purple-300 text-xs rounded-lg font-bold">
            {rolls.length} Roll Blueprints
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rolls.map((r, i) => (
            <div key={i} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300">{r.rollType.replace('_', ' ')}</span>
                <span className="px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded text-[10px] font-bold">
                  {r.recommendationGrade}
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Target Strike / Expiry:</span>
                  <span className="text-white font-bold">{r.targetStrike} ({r.targetExpiry})</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Net Credit / Debit:</span>
                  <span className={r.netDebitCredit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {r.netDebitCredit >= 0 ? `+₹${r.netDebitCredit} Credit` : `-₹${Math.abs(r.netDebitCredit)} Debit`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Recovery Prob:</span>
                  <span className="text-emerald-400 font-bold">{r.probabilityOfRecoveryPct}%</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Expected Future EV:</span>
                  <span className="text-cyan-400 font-bold">+{r.expectedValueR}R</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-900">{r.thesisAdjustment}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Greek Hedges Section */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <span>Multi-Dimension Greek Hedges (Delta, Gamma, Vega, Tail Risk)</span>
          </h3>
          <p className="text-xs text-slate-400">
            Real-time hedge instrument sizing to balance net exposure against tail risk and curvature spikes.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">Hedge Dimension</th>
                <th className="p-3">Recommended Instrument</th>
                <th className="p-3 text-center">Lots</th>
                <th className="p-3 text-center">Est. Cost</th>
                <th className="p-3 text-center">Risk Reduction</th>
                <th className="p-3 text-center">Urgency</th>
                <th className="p-3">Hedging Thesis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {hedges.map((h, i) => (
                <tr key={i} className="hover:bg-slate-900/50">
                  <td className="p-3 font-bold text-white flex items-center space-x-2">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{h.hedgeType.replace('_', ' ')}</span>
                  </td>
                  <td className="p-3 text-cyan-300 font-mono">{h.recommendedInstrument}</td>
                  <td className="p-3 text-center text-white font-bold">{h.quantityLots}</td>
                  <td className="p-3 text-center text-slate-300">₹{h.estimatedCost.toLocaleString()}</td>
                  <td className="p-3 text-center text-emerald-400 font-bold">+{h.riskReductionPct}%</td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        h.urgency === 'IMMEDIATE'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : h.urgency === 'EVALUATIVE'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {h.urgency}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400 max-w-sm">{h.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

