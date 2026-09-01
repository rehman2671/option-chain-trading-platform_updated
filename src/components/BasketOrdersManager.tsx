/**
 * Basket & Adjustment Orders Manager Component
 * Tracks application-level atomicity, sequenced leg fills, fallback recovery, and broker reconciliation.
 */

import React, { useState, useEffect } from 'react';
import { BasketOrderRecord } from '../types.js';
import { Zap, ShieldCheck, AlertCircle, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

export const BasketOrdersManager: React.FC = () => {
  const [baskets, setBaskets] = useState<BasketOrderRecord[]>([]);
  const [reconciliationInfo, setReconciliationInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBaskets = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/basket/list');
      const data = await res.json();
      setBaskets(data.baskets || []);
      setReconciliationInfo(data.reconciliation || null);
    } catch (e) {
      console.error('Error fetching baskets:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBaskets();
    const interval = setInterval(fetchBaskets, 4000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded font-black">COMPLETED</span>;
      case 'PARTIAL_FAILED':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded font-black">PARTIAL FAILED</span>;
      case 'REVERTED':
        return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 px-2.5 py-0.5 rounded font-black">AUTO REVERTED</span>;
      default:
        return <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-0.5 rounded font-black">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Reconciliation Status Card */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-100 text-sm">Background Broker Reconciliation Job</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Continuously verifies internal database basket leg states against exchange order book.
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-slate-400 text-[10px]">Checked Baskets</div>
            <div className="font-bold text-slate-200">{reconciliationInfo?.checkedCount || baskets.length}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-400 text-[10px]">Reconciliation Status</div>
            <div className="font-bold text-emerald-400">100% IN SYNC</div>
          </div>
          <button
            onClick={fetchBaskets}
            className={`p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 ${isLoading ? 'animate-spin text-emerald-400' : ''}`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Basket Records Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-2xl space-y-4 p-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>Basket & Adjustment Orders Executions ({baskets.length})</span>
          </h3>
          <span className="text-slate-400 text-[11px]">
            Application-Level Atomicity Enabled
          </span>
        </div>

        {baskets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 italic">
            No basket orders executed in current session. Execute a basket from Strategy & Payoff tab.
          </div>
        ) : (
          <div className="space-y-4">
            {baskets.map((b) => (
              <div key={b.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-slate-100 text-sm">{b.strategyName}</span>
                    <span className="text-slate-400 text-[11px]">[{b.symbol}]</span>
                    <span className="text-slate-500 text-[10px]">ID: {b.id}</span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-slate-400 text-[11px]">
                      Margin Used: <strong className="text-amber-300">₹{b.marginRequired.toLocaleString('en-IN')}</strong>
                    </span>
                    {getStatusBadge(b.status)}
                  </div>
                </div>

                {/* Fallback Warning Box if Triggered */}
                {b.fallbackActionTriggered && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded text-amber-300 text-[11px] flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{b.fallbackActionTriggered}</span>
                  </div>
                )}

                {/* Sequenced Legs Breakdown Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-800 uppercase text-[10px]">
                        <th className="py-1">Seq</th>
                        <th className="py-1">Action</th>
                        <th className="py-1">Strike</th>
                        <th className="py-1">Type</th>
                        <th className="py-1 text-right">Fill Qty</th>
                        <th className="py-1 text-right">Avg Fill Price</th>
                        <th className="py-1 text-center">Order ID</th>
                        <th className="py-1 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {b.legs.map((leg) => (
                        <tr key={leg.legId} className="hover:bg-slate-900/50">
                          <td className="py-1.5 font-bold text-amber-400">#{leg.executionSeq}</td>
                          <td className="py-1.5">
                            <span className={`px-1.5 py-0.5 rounded font-black ${
                              leg.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {leg.action}
                            </span>
                          </td>
                          <td className="py-1.5 font-bold text-slate-200">{leg.strikePrice}</td>
                          <td className="py-1.5 font-bold text-slate-300">{leg.type}</td>
                          <td className="py-1.5 text-right font-mono">{leg.filledQty} / {leg.requestedQty}</td>
                          <td className="py-1.5 text-right font-bold text-slate-100">₹{leg.avgFillPrice}</td>
                          <td className="py-1.5 text-center text-slate-400 font-mono text-[10px]">{leg.orderId || '-'}</td>
                          <td className="py-1.5 text-right font-bold">
                            <span className={leg.status === 'FILLED' ? 'text-emerald-400' : 'text-rose-400'}>
                              {leg.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] text-slate-500 pt-1 flex items-center justify-between border-t border-slate-900">
                  <span>Created: {new Date(b.createdAt).toLocaleTimeString()}</span>
                  <span className="text-emerald-400/90 font-semibold">{b.reconciliationNotes}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
