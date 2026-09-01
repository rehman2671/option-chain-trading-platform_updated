/**
 * Paper Trading Terminal & Account Ledger Component
 * Fully functional with live MTM updates, Square Off, SL/TP setting, Reset & Trade History
 */

import React, { useState, useEffect } from 'react';
import { AccountLedger, PaperPosition, OptionChainSnapshot } from '../types.js';
import {
  PlayCircle,
  TrendingUp,
  DollarSign,
  PieChart,
  Shield,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Target,
  TrendingDown,
  History,
  Trash2,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { apiFetch } from '../lib/api.js';

interface PaperTradingManagerProps {
  snapshot: OptionChainSnapshot | null;
}

interface ClosedPosition extends PaperPosition {
  closedAt: string;
  exitPrice: number;
  exitReason: string;
  finalPnl: number;
}

interface PaperStrategyGroup {
  strategyGroupId: string;
  strategyName: string;
  symbol: string;
  status: 'OPEN' | 'CLOSED' | 'PARTIAL';
  legs: PaperPosition[];
  netPnl: number;
  openedAt: string;
}

export const PaperTradingManager: React.FC<PaperTradingManagerProps> = ({ snapshot }) => {
  const [ledger, setLedger] = useState<AccountLedger>({
    totalCapital: 1000000,
    availableMargin: 1000000,
    usedMargin: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    winCount: 0,
    lossCount: 0
  });

  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [groups, setGroups] = useState<PaperStrategyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [toast, setToast] = useState<string | null>(null);

  // SL/TP Edit Modal State
  const [editingPos, setEditingPos] = useState<PaperPosition | null>(null);
  const [slInput, setSlInput] = useState<string>('');
  const [tpInput, setTpInput] = useState<string>('');

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPortfolio = async () => {
    try {
      const res = await apiFetch('/api/paper-trading/portfolio');
      const data = await res.json();
      if (data.ledger) setLedger(data.ledger);
      if (data.positions) setPositions(data.positions);
      if (data.closedPositions) setClosedPositions(data.closedPositions);
      if (data.groups) setGroups(data.groups);
    } catch (e) {
      console.error('Error fetching paper portfolio:', e);
    }
  };

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSquareOffLeg = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/paper-trading/close/${id}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToastMsg('Leg Squared Off Successfully!');
        fetchPortfolio();
      }
    } catch (e) {
      console.error('Error closing paper position leg:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSquareOffGroup = async (groupId: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/paper-trading/close-group/${groupId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToastMsg('Entire Strategy Group Squared Off!');
        fetchPortfolio();
      }
    } catch (e) {
      console.error('Error closing strategy group:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPortfolio = async () => {
    if (!window.confirm('Are you sure you want to reset your Paper Trading account? All positions and P&L history will be cleared.')) return;
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/paper-trading/reset', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToastMsg('Paper Trading Account Reset to ₹10,00,000 Capital!');
        fetchPortfolio();
      }
    } catch (e) {
      console.error('Error resetting paper account:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSLTP = async () => {
    if (!editingPos) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/paper-trading/${editingPos.id}/risk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stopLoss: slInput ? Number(slInput) : null,
          targetPrice: tpInput ? Number(tpInput) : null
        })
      });
      const data = await res.json();
      if (data.success) {
        showToastMsg('Stop-Loss & Target Price Updated!');
        setEditingPos(null);
        fetchPortfolio();
      }
    } catch (e) {
      console.error('Error updating SL/TP:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const totalTrades = ledger.winCount + ledger.lossCount;
  const winRate = totalTrades > 0 ? Math.round((ledger.winCount / totalTrades) * 100) : 0;
  const netTotalPnl = ledger.realizedPnl + ledger.unrealizedPnl;

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-900 border border-emerald-500 text-emerald-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="font-bold">{toast}</span>
        </div>
      )}

      {/* Header Bar with Action Controls */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30 text-emerald-400">
            <PlayCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-100">Paper Trading Virtual Terminal</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Live MTM Engine • Simulated Order Execution Engine • ₹10,00,000 Initial Virtual Capital
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchPortfolio}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 flex items-center space-x-1.5 transition"
            title="Refresh Portfolio"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            <span className="font-bold">Sync</span>
          </button>

          <button
            onClick={handleResetPortfolio}
            className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-300 rounded-lg font-bold flex items-center space-x-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset Account</span>
          </button>
        </div>
      </div>

      {/* Account Ledger Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="text-slate-400 text-[10px] uppercase font-semibold">Total Virtual Capital</div>
          <div className="text-xl font-black text-slate-100 mt-1">₹{ledger.totalCapital.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Initial 10 Lakh Account</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="text-slate-400 text-[10px] uppercase font-semibold">Available Free Margin</div>
          <div className="text-xl font-black text-amber-300 mt-1">₹{Math.max(0, ledger.availableMargin).toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Used Margin: ₹{ledger.usedMargin.toLocaleString('en-IN')}</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="text-slate-400 text-[10px] uppercase font-semibold">Live MTM Unrealized P&L</div>
          <div className={`text-xl font-black mt-1 ${ledger.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {ledger.unrealizedPnl >= 0 ? '+' : ''}₹{ledger.unrealizedPnl.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Realized: ₹{ledger.realizedPnl.toLocaleString('en-IN')}</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
          <div className="text-slate-400 text-[10px] uppercase font-semibold">Win Rate & Closed Trades</div>
          <div className="text-xl font-black text-emerald-400 mt-1">
            {winRate}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{ledger.winCount} Wins / {ledger.lossCount} Losses ({totalTrades} total)</div>
        </div>
      </div>

      {/* Main Terminal Tabs & Content */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('positions')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-2 transition ${
                activeTab === 'positions'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Active Positions ({positions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-2 transition ${
                activeTab === 'history'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Closed Trades History ({closedPositions.length})</span>
            </button>
          </div>

          <span className="text-[10px] text-slate-400 flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live MTM Feed Active</span>
          </span>
        </div>

        {/* ACTIVE POSITIONS TAB */}
        {activeTab === 'positions' && (
          <div>
            {positions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 italic space-y-2">
                <p>No active paper positions open.</p>
                <p className="text-[10px] text-slate-600">
                  Execute orders directly from the <strong>Option Chain</strong> or <strong>Strategy Builder</strong> tabs.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.filter(g => g.status === 'OPEN' || g.status === 'PARTIAL').map((group) => {
                  const openLegsInGroup = group.legs.filter(l => l.status === 'OPEN');
                  if (openLegsInGroup.length === 0) return null;

                  return (
                    <div key={group.strategyGroupId} className="bg-slate-950/70 rounded-xl border border-slate-800 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center space-x-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
                            Group: {group.strategyName}
                          </span>
                          <span className="text-slate-300 font-bold">{group.symbol}</span>
                          <span className="text-slate-500 text-[10px]">ID: {group.strategyGroupId}</span>
                        </div>

                        <div className="flex items-center space-x-3">
                          <span className="text-slate-400 font-semibold">Group Net P&L:</span>
                          <span className={`font-black text-sm ${group.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {group.netPnl >= 0 ? '+' : ''}₹{group.netPnl.toLocaleString('en-IN')}
                          </span>
                          <button
                            onClick={() => handleSquareOffGroup(group.strategyGroupId)}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-[10px] transition shadow"
                          >
                            Close Strategy Group
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                              <th className="py-2">Leg Label</th>
                              <th className="py-2">Strike</th>
                              <th className="py-2">Type</th>
                              <th className="py-2">Action</th>
                              <th className="py-2 text-right">Qty</th>
                              <th className="py-2 text-right">Entry Price</th>
                              <th className="py-2 text-right">Current LTP</th>
                              <th className="py-2 text-center">SL / Target</th>
                              <th className="py-2 text-right">Unrealized P&L</th>
                              <th className="py-2 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {openLegsInGroup.map((pos) => (
                              <tr key={pos.id} className="hover:bg-slate-800/50">
                                <td className="py-2.5 font-bold text-slate-100">{pos.legLabel || `${pos.action} ${pos.type} ${pos.strikePrice}`}</td>
                                <td className="py-2.5 font-bold text-amber-300">{pos.strikePrice}</td>
                                <td className="py-2.5 font-bold text-slate-200">{pos.type}</td>
                                <td className="py-2.5">
                                  <span className={`px-2 py-0.5 rounded font-black ${
                                    pos.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                  }`}>
                                    {pos.action}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right font-mono">{pos.quantity}</td>
                                <td className="py-2.5 text-right font-bold text-slate-200">₹{pos.entryPrice}</td>
                                <td className="py-2.5 text-right font-bold text-cyan-300">₹{pos.currentPrice}</td>
                                <td className="py-2.5 text-center">
                                  <button
                                    onClick={() => {
                                      setEditingPos(pos);
                                      setSlInput(pos.stopLoss ? String(pos.stopLoss) : '');
                                      setTpInput(pos.targetPrice ? String(pos.targetPrice) : '');
                                    }}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-300 text-[10px] font-bold"
                                  >
                                    SL: {pos.stopLoss ? `₹${pos.stopLoss}` : '-'} | TP: {pos.targetPrice ? `₹${pos.targetPrice}` : '-'}
                                  </button>
                                </td>
                                <td className={`py-2.5 text-right font-black ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {pos.pnl >= 0 ? '+' : ''}₹{pos.pnl.toLocaleString('en-IN')}
                                  <div className="text-[9px] font-normal opacity-80">
                                    ({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent}%)
                                  </div>
                                </td>
                                <td className="py-2.5 text-center">
                                  <button
                                    onClick={() => handleSquareOffLeg(pos.id)}
                                    className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 rounded font-bold transition"
                                  >
                                    Square Off Leg
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CLOSED TRADES HISTORY TAB */}
        {activeTab === 'history' && (
          <div>
            {closedPositions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 italic">
                No closed trades in history yet. Squared off positions will appear here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                      <th className="py-2">Symbol</th>
                      <th className="py-2">Strike & Type</th>
                      <th className="py-2">Action</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">Entry</th>
                      <th className="py-2 text-right">Exit Price</th>
                      <th className="py-2 text-right">Realized P&L</th>
                      <th className="py-2">Exit Reason</th>
                      <th className="py-2 text-right">Closed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {closedPositions.map((pos) => (
                      <tr key={pos.id} className="hover:bg-slate-800/50">
                        <td className="py-2.5 font-bold text-slate-100">{pos.symbol}</td>
                        <td className="py-2.5 font-bold text-amber-300">{pos.strikePrice} {pos.type}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded font-black ${
                            pos.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {pos.action}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono">{pos.quantity}</td>
                        <td className="py-2.5 text-right font-bold text-slate-200">₹{pos.entryPrice}</td>
                        <td className="py-2.5 text-right font-bold text-cyan-300">₹{pos.exitPrice}</td>
                        <td className={`py-2.5 text-right font-black ${(pos.finalPnl ?? pos.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(pos.finalPnl ?? pos.pnl ?? 0) >= 0 ? '+' : ''}₹{(pos.finalPnl ?? pos.pnl ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">
                            {pos.exitReason}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-slate-500 text-[10px]">
                          {new Date(pos.closedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SL / TP MODAL */}
      {editingPos && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>Configure SL / Target Price</span>
              </h3>
              <button onClick={() => setEditingPos(null)} className="text-slate-400 hover:text-slate-200">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <div>Position: <strong>{editingPos.symbol} {editingPos.strikePrice} {editingPos.type} ({editingPos.action})</strong></div>
                <div>Entry Price: <strong>₹{editingPos.entryPrice}</strong> | Current LTP: <strong className="text-cyan-400">₹{editingPos.currentPrice}</strong></div>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1 font-bold">Stop-Loss Price (₹)</label>
                <input
                  type="number"
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-100 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1 font-bold">Target Profit Price (₹)</label>
                <input
                  type="number"
                  value={tpInput}
                  onChange={(e) => setTpInput(e.target.value)}
                  placeholder="e.g. 150"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-100 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingPos(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSLTP}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold"
              >
                Save Limits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
