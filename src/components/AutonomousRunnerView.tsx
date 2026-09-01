/**
 * Phase J: Autonomous Strategy Runner View (Full-Auto, Practice/DRY_RUN Scoped)
 * Autonomous management, structured rule builder, safety limits, global kill switch & audit trail.
 */

import React, { useState, useEffect } from 'react';
import {
  AutonomousStrategy,
  AutonomousStrategyLog,
  AutonomousRunnerStatus,
  StrategyLeg,
  RuleGroup,
  SingleRule,
  RuleOperator
} from '../types.js';
import {
  ShieldAlert,
  Zap,
  Power,
  RotateCcw,
  Plus,
  Play,
  Square,
  AlertTriangle,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  Lock,
  Layers
} from 'lucide-react';
import { apiFetch } from '../lib/api.js';

export const AutonomousRunnerView: React.FC = () => {
  const [status, setStatus] = useState<AutonomousRunnerStatus | null>(null);
  const [strategies, setStrategies] = useState<AutonomousStrategy[]>([]);
  const [logs, setLogs] = useState<AutonomousStrategyLog[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<AutonomousStrategy | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // New strategy form state
  const [name, setName] = useState('Nifty IV Breakout Bot');
  const [symbol, setSymbol] = useState('NIFTY');
  const [productType, setProductType] = useState<'MIS' | 'NRML'>('NRML');
  const [maxPositionSize, setMaxPositionSize] = useState(5);
  const [selectedPreset, setSelectedPreset] = useState<'SHORT_STRADDLE' | 'BULL_CALL_SPREAD' | 'SINGLE_LEG'>('SHORT_STRADDLE');

  // Entry Rule Builder State
  const [entryField, setEntryField] = useState('ivRank');
  const [entryOperator, setEntryOperator] = useState<RuleOperator>('>');
  const [entryValue, setEntryValue] = useState<string | number>(50);

  // Exit Rule Builder State
  const [exitField, setExitField] = useState('spotDistanceAtm');
  const [exitOperator, setExitOperator] = useState<RuleOperator>('>=');
  const [exitValue, setExitValue] = useState<string | number>(150);

  const safeFetchJson = async (url: string, setter: (data: any) => void) => {
    try {
      const res = await apiFetch(url);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setter(data);
      }
    } catch (err) {
      console.error(`Error fetching ${url}:`, err);
    }
  };

  const fetchData = () => {
    safeFetchJson('/api/autonomous/status', setStatus);
    safeFetchJson('/api/autonomous/strategies', setStrategies);
    safeFetchJson('/api/autonomous/logs', setLogs);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleArm = (strat: AutonomousStrategy) => {
    const newArmedState = !strat.armed;
    apiFetch(`/api/autonomous/strategies/${strat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ armed: newArmedState })
    })
      .then(res => res.json())
      .then(() => fetchData())
      .catch(console.error);
  };

  const handleKillSwitch = () => {
    if (!confirm('GLOBAL KILL SWITCH WARNING:\nThis will immediately disarm ALL autonomous strategies and halt all automated trading. Proceed?')) return;

    apiFetch('/api/autonomous/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'User activated Global Kill Switch from UI' })
    })
      .then(res => res.json())
      .then(() => fetchData())
      .catch(console.error);
  };

  const handleResetKillSwitch = () => {
    apiFetch('/api/autonomous/kill-switch/reset', {
      method: 'POST'
    })
      .then(res => res.json())
      .then(() => fetchData())
      .catch(console.error);
  };

  const handleDeleteStrategy = (id: string) => {
    if (!confirm('Delete this autonomous strategy definition?')) return;
    apiFetch(`/api/autonomous/strategies/${id}`, {
      method: 'DELETE'
    })
      .then(() => fetchData())
      .catch(console.error);
  };

  const handleCreateStrategy = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Build sample legs based on preset
    let legs: StrategyLeg[] = [];
    if (selectedPreset === 'SHORT_STRADDLE') {
      legs = [
        { id: 'leg-1', strikePrice: 23500, type: 'CE', action: 'SELL', quantity: 1, lotSize: 25, currentLtp: 140, expiry: 'CURRENT', iv: 15.2, delta: -0.5, gamma: 0, theta: 0, vega: 0, product: productType },
        { id: 'leg-2', strikePrice: 23500, type: 'PE', action: 'SELL', quantity: 1, lotSize: 25, currentLtp: 135, expiry: 'CURRENT', iv: 15.8, delta: 0.5, gamma: 0, theta: 0, vega: 0, product: productType }
      ];
    } else if (selectedPreset === 'BULL_CALL_SPREAD') {
      legs = [
        { id: 'leg-1', strikePrice: 23500, type: 'CE', action: 'BUY', quantity: 1, lotSize: 25, currentLtp: 140, expiry: 'CURRENT', iv: 15.2, delta: 0.5, gamma: 0, theta: 0, vega: 0, product: productType },
        { id: 'leg-2', strikePrice: 23700, type: 'CE', action: 'SELL', quantity: 1, lotSize: 25, currentLtp: 60, expiry: 'CURRENT', iv: 14.8, delta: -0.25, gamma: 0, theta: 0, vega: 0, product: productType }
      ];
    } else {
      legs = [
        { id: 'leg-1', strikePrice: 23500, type: 'CE', action: 'BUY', quantity: 1, lotSize: 25, currentLtp: 140, expiry: 'CURRENT', iv: 15.2, delta: 0.5, gamma: 0, theta: 0, vega: 0, product: productType }
      ];
    }

    const entryRules: RuleGroup = {
      all: [{ field: entryField, operator: entryOperator, value: isNaN(Number(entryValue)) ? entryValue : Number(entryValue) }]
    };

    const exitRules: RuleGroup = {
      all: [{ field: exitField, operator: exitOperator, value: isNaN(Number(exitValue)) ? exitValue : Number(exitValue) }]
    };

    apiFetch('/api/autonomous/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        symbol,
        productType,
        legs,
        entryRules,
        exitRules,
        maxPositionSize
      })
    })
      .then(res => res.json())
      .then(() => {
        setIsCreateModalOpen(false);
        setLoading(false);
        fetchData();
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* GLOBAL KILL SWITCH HEADER BANNER */}
      <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 shadow-xl ${
        status?.isKillSwitchEngaged
          ? 'bg-rose-950/90 border-rose-500 text-rose-100 animate-pulse'
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        <div className="flex items-center space-x-3">
          <div className={`p-2.5 rounded-lg border ${
            status?.isKillSwitchEngaged ? 'bg-rose-900/80 border-rose-400 text-rose-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
          }`}>
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center space-x-2">
              <span>Phase J — Autonomous Strategy Runner (Full-Auto)</span>
              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                {status?.providerMode === 'PRACTICE' ? 'PRACTICE MODE (DRY_RUN)' : 'LIVE MODE (UPSTOX)'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Deterministic rule engine evaluates snapshot analytics every 5s. Strictly zero LLM involvement in execution path.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {status?.isKillSwitchEngaged ? (
            <button
              onClick={handleResetKillSwitch}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center space-x-2 border border-emerald-400 shadow-lg"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RESET KILL SWITCH</span>
            </button>
          ) : (
            <button
              onClick={handleKillSwitch}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold flex items-center space-x-2 border border-rose-400 shadow-lg shadow-rose-950/50"
            >
              <Power className="w-4 h-4" />
              <span>GLOBAL KILL SWITCH</span>
            </button>
          )}

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center space-x-1.5 border border-cyan-400"
          >
            <Plus className="w-4 h-4" />
            <span>NEW STRATEGY</span>
          </button>
        </div>
      </div>

      {/* KILL SWITCH ACTIVE ALERT */}
      {status?.isKillSwitchEngaged && (
        <div className="bg-rose-950/60 border border-rose-500/60 rounded-xl p-4 flex items-center space-x-3 text-rose-300">
          <AlertTriangle className="w-6 h-6 flex-shrink-0 text-rose-400" />
          <div>
            <span className="font-extrabold block text-sm">GLOBAL KILL SWITCH ENGAGED</span>
            <span className="text-xs text-rose-200">
              Reason: {status.killSwitchReason || 'Manual user trigger'}. All strategies are currently disarmed and the runner is halted.
            </span>
          </div>
        </div>
      )}

      {/* SAFETY LIMITS & STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
          <div className="text-slate-400 font-medium flex items-center justify-between mb-2">
            <span>Daily Loss Circuit Breaker</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">
            ₹{status?.dailyAutonomousPnl ? status.dailyAutonomousPnl.toLocaleString() : '0'}
            <span className="text-xs text-slate-500 font-normal ml-1">/ -₹10,000 max</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Triggers global kill switch if daily loss exceeds threshold.</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
          <div className="text-slate-400 font-medium flex items-center justify-between mb-2">
            <span>Active Concurrent Positions</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-cyan-300">
            {status?.inPositionCount || 0}
            <span className="text-xs text-slate-500 font-normal ml-1">/ {status?.safetyLimits.maxConcurrentPositions || 3} max</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Global hard cap on open autonomous positions.</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
          <div className="text-slate-400 font-medium flex items-center justify-between mb-2">
            <span>Armed Strategies</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-amber-300">
            {status?.armedCount || 0}
            <span className="text-xs text-slate-500 font-normal ml-1">/ {status?.totalStrategies || 0} total</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Every strategy defaults to disarmed on creation.</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
          <div className="text-slate-400 font-medium flex items-center justify-between mb-2">
            <span>Trigger Cooldown / Debounce</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-300">
            {status?.safetyLimits.defaultCooldownSeconds || 60}s
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Minimum delay between actions per strategy to prevent oscillation.</p>
        </div>
      </div>

      {/* STRATEGIES MANAGEMENT TABLE */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Configured Autonomous Strategies</span>
          </h3>
          <span className="text-[11px] text-slate-400">Total: {strategies.length} strategies</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                <th className="py-2.5 px-3">Strategy Name</th>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Legs Setup</th>
                <th className="py-2.5 px-3">Entry Conditions</th>
                <th className="py-2.5 px-3 text-center">Armed State</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Last Evaluated</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-[11px]">
              {strategies.length > 0 ? (
                strategies.map(strat => (
                  <tr key={strat.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-200">{strat.name}</div>
                      <div className="text-[10px] text-slate-500">ID: {strat.id} • {strat.productType}</div>
                    </td>
                    <td className="py-3 px-3 font-bold text-cyan-400">{strat.symbol}</td>
                    <td className="py-3 px-3 text-slate-300">
                      {strat.legs.map((l, idx) => (
                        <span key={idx} className="inline-block mr-2 text-[10px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          <strong className={l.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{l.action}</strong>{' '}
                          {l.strikePrice} {l.type} x{l.quantity}
                        </span>
                      ))}
                    </td>
                    <td className="py-3 px-3 font-mono text-[10px] text-slate-400">
                      {strat.entryRules?.all ? (
                        strat.entryRules.all.map((r: any, i) => (
                          <div key={i}>
                            {r.field} {r.operator} {r.value}
                          </div>
                        ))
                      ) : (
                        <span>Custom Rule</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleToggleArm(strat)}
                        disabled={status?.isKillSwitchEngaged}
                        className={`px-3 py-1 rounded-full font-extrabold text-[10px] border transition-colors ${
                          strat.armed
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                        } ${status?.isKillSwitchEngaged ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {strat.armed ? 'ARMED ⚡' : 'DISARMED'}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {strat.status === 'WATCHING' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          WATCHING
                        </span>
                      )}
                      {strat.status === 'IN_POSITION' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                          IN POSITION
                        </span>
                      )}
                      {strat.status === 'DISARMED' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          DISARMED
                        </span>
                      )}
                      {strat.status === 'ERROR' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40" title={strat.errorMessage}>
                          ERROR
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">
                      {strat.lastEvaluatedAt ? new Date(strat.lastEvaluatedAt).toLocaleTimeString() : 'Pending...'}
                    </td>
                    <td className="py-3 px-3 text-center space-x-1">
                      <button
                        onClick={() => handleDeleteStrategy(strat.id)}
                        className="px-2 py-1 rounded bg-rose-950 text-rose-400 border border-rose-800 hover:bg-rose-900 text-[10px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    No autonomous strategies defined yet. Click "NEW STRATEGY" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AUDIT LOG TRAIL TABLE */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Autonomous Action & Audit Log Trail</span>
          </h3>
          <span className="text-[11px] text-slate-400">Recent {logs.length} logs</span>
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase sticky top-0 bg-slate-900">
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">Strategy</th>
                <th className="py-2 px-3">Event Type</th>
                <th className="py-2 px-3">Audit Details & Matched Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-[11px]">
              {logs.length > 0 ? (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-300">
                      {log.strategyName || log.strategyId}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {log.eventType === 'ENTRY_TRIGGERED' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          ENTRY TRIGGERED
                        </span>
                      )}
                      {log.eventType === 'EXIT_TRIGGERED' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          EXIT TRIGGERED
                        </span>
                      )}
                      {log.eventType === 'BLOCKED_BY_MARGIN' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          BLOCKED BY MARGIN
                        </span>
                      )}
                      {log.eventType === 'BLOCKED_BY_LIMIT' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          BLOCKED BY LIMIT
                        </span>
                      )}
                      {log.eventType === 'KILL_SWITCH' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-rose-600 text-white border border-rose-400">
                          KILL SWITCH
                        </span>
                      )}
                      {log.eventType === 'ARMED' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          ARMED
                        </span>
                      )}
                      {log.eventType === 'DISARMED' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          DISARMED
                        </span>
                      )}
                      {log.eventType === 'ERROR' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          ERROR
                        </span>
                      )}
                      {log.eventType === 'RULE_EVALUATED' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          EVALUATED
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-400 break-all">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    No autonomous audit logs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE STRATEGY MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-xl w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                <span>Create New Autonomous Strategy (Defaults to Disarmed)</span>
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStrategy} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Strategy Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Underlying Symbol</label>
                  <select
                    value={symbol}
                    onChange={e => setSymbol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                  >
                    <option value="NIFTY">NIFTY</option>
                    <option value="BANKNIFTY">BANKNIFTY</option>
                    <option value="RELIANCE">RELIANCE</option>
                    <option value="TCS">TCS</option>
                    <option value="HDFCBANK">HDFCBANK</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Leg Preset</label>
                  <select
                    value={selectedPreset}
                    onChange={e => setSelectedPreset(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                  >
                    <option value="SHORT_STRADDLE">Short Straddle</option>
                    <option value="BULL_CALL_SPREAD">Bull Call Spread</option>
                    <option value="SINGLE_LEG">Single Leg Buy</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Product Type</label>
                  <select
                    value={productType}
                    onChange={e => setProductType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                  >
                    <option value="NRML">NRML (Carry Forward)</option>
                    <option value="MIS">MIS (Intraday)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Max Lots Cap</label>
                  <input
                    type="number"
                    value={maxPositionSize}
                    min={1}
                    max={10}
                    onChange={e => setMaxPositionSize(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                <span className="text-cyan-400 font-bold block">Entry Rule Condition (AND)</span>
                <div className="grid grid-cols-3 gap-2">
                  <select value={entryField} onChange={e => setEntryField(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200">
                    <option value="ivRank">ivRank</option>
                    <option value="pcr">pcr</option>
                    <option value="spotDistanceAtm">spotDistanceAtm</option>
                    <option value="indiaVix">indiaVix</option>
                    <option value="oiBuildup">oiBuildup</option>
                  </select>

                  <select value={entryOperator} onChange={e => setEntryOperator(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200">
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value="==">==</option>
                  </select>

                  <input type="text" value={entryValue} onChange={e => setEntryValue(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200" />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                <span className="text-rose-400 font-bold block">Exit Rule Condition (AND)</span>
                <div className="grid grid-cols-3 gap-2">
                  <select value={exitField} onChange={e => setExitField(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200">
                    <option value="spotDistanceAtm">spotDistanceAtm</option>
                    <option value="ivRank">ivRank</option>
                    <option value="pcr">pcr</option>
                  </select>

                  <select value={exitOperator} onChange={e => setExitOperator(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200">
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                  </select>

                  <input type="text" value={exitValue} onChange={e => setExitValue(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200" />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded bg-cyan-600 text-white font-bold hover:bg-cyan-500"
                >
                  {loading ? 'Creating...' : 'Save Strategy (Disarmed)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
