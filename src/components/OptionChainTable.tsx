/**
 * Real-Time High-Density Option Chain Component
 */

import React, { useState } from 'react';
import { OptionChainSnapshot, OptionStrikeRow, StrategyLeg, OptionType, TradeAction } from '../types.js';
import { Plus, Eye, EyeOff, ShieldAlert, Sparkles, Filter } from 'lucide-react';

interface OptionChainTableProps {
  snapshot: OptionChainSnapshot | null;
  onExpiryChange: (expiry: string) => void;
  onAddLeg: (leg: StrategyLeg) => void;
}

export const OptionChainTable: React.FC<OptionChainTableProps> = ({
  snapshot,
  onExpiryChange,
  onAddLeg
}) => {
  const [showGreeks, setShowGreeks] = useState(true);
  const [showBuildup, setShowBuildup] = useState(true);
  const [strikeRangeFilter, setStrikeRangeFilter] = useState<number>(10); // Number of strikes around ATM

  if (!snapshot || snapshot.strikes.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center font-mono shadow-xl">
        <Sparkles className="w-10 h-10 text-cyan-400 mx-auto mb-3 animate-pulse" />
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wide">Initializing Market Feed...</h3>
        <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
          {snapshot?.brokerStatusMessage || 'Fetching initial spot quotes and option chain data...'}
        </p>
      </div>
    );
  }

  if (snapshot.isBrokerConnected === false) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center font-mono shadow-xl">
        <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wide">Broker Disconnected — Live Data Unavailable</h3>
        <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
          {snapshot.brokerStatusMessage || 'Upstox v2 credentials (UPSTOX_API_KEY, UPSTOX_ACCESS_TOKEN) are not configured or access token is expired.'}
        </p>
        <div className="mt-4 p-3.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300 max-w-lg mx-auto text-left">
          <p className="font-bold text-cyan-400 mb-1.5">To enable live Upstox market feed:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>Authorize via <a href="/api/upstox/login" target="_blank" className="text-cyan-400 underline font-bold">/api/upstox/login</a> or Upstox Developer Portal.</li>
            <li>Configure <code className="text-emerald-400">UPSTOX_API_KEY</code> and <code className="text-emerald-400">UPSTOX_ACCESS_TOKEN</code> in environment variables.</li>
            <li>Stream live ticks and compute Black-Scholes Greeks on real Upstox market data.</li>
          </ol>
        </div>
      </div>
    );
  }

  // Filter strikes centered around ATM
  const atmIndex = snapshot.strikes.findIndex(s => s.isAtm);
  const startIdx = Math.max(0, atmIndex - strikeRangeFilter);
  const endIdx = Math.min(snapshot.strikes.length - 1, atmIndex + strikeRangeFilter);
  const visibleStrikes = snapshot.strikes.slice(startIdx, endIdx + 1);

  const getBuildupBadgeClass = (buildup: string) => {
    switch (buildup) {
      case 'LONG_BUILDUP': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'SHORT_BUILDUP': return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      case 'SHORT_COVERING': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'LONG_UNWINDING': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      default: return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const isContractAvailable = (contract: any, fieldKey: 'ltp' | 'oi' | 'volume' | 'iv') => {
    if (contract.available === false) return false;
    if (fieldKey === 'ltp' && contract.ltpAvailable === false) return false;
    if (fieldKey === 'oi' && contract.oiAvailable === false) return false;
    if (fieldKey === 'volume' && contract.volumeAvailable === false) return false;
    if (fieldKey === 'iv' && contract.ivAvailable === false) return false;
    return true;
  };

  const handleQuickAddLeg = (row: OptionStrikeRow, type: OptionType, action: TradeAction) => {
    const contract = type === 'CE' ? row.ce : row.pe;
    const lotSize = snapshot.symbol === 'NIFTY' ? 25 : (snapshot.symbol === 'BANKNIFTY' ? 15 : 250);
    const newLeg: StrategyLeg = {
      id: `leg-${type}-${action}-${row.strikePrice}-${Date.now()}`,
      type,
      action,
      strikePrice: row.strikePrice,
      expiry: snapshot.selectedExpiry,
      quantity: 1,
      lotSize,
      currentLtp: contract.ltp,
      entryPrice: contract.ltp,
      iv: contract.iv,
      delta: contract.delta,
      gamma: contract.gamma,
      theta: contract.theta,
      vega: contract.vega
    };
    onAddLeg(newLeg);
  };

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono text-xs shadow-md">
        <div className="flex items-center space-x-3">
          {/* Provider Mode Badge */}
          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
            snapshot.providerMode === 'PRACTICE'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          }`}>
            {snapshot.providerMode === 'PRACTICE' ? 'PRACTICE SIMULATION (Calibrated NSE Engine)' : 'UPSTOX V2 LIVE FEED'}
          </span>

          {snapshot.isSpotLive === false && (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-950/80 text-amber-300 border border-amber-500/60" title="Underlying spot price is a static fallback or stale quote">
              ⚠️ SPOT STALE
            </span>
          )}

          {snapshot.isPartialData && (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40" title={snapshot.partialDataReason}>
              ⚠️ PARTIAL DATA ({snapshot.unavailableStrikeCount} fields N/A)
            </span>
          )}

          <span className="text-slate-600">|</span>

          <label className="text-slate-400 font-semibold">Expiry Date:</label>
          <select
            value={snapshot.selectedExpiry}
            onChange={(e) => {
              const exp = e.target.value;
              onExpiryChange(exp);
              fetch('/api/system/active-view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: snapshot.symbol, expiry: exp })
              }).catch(() => {});
            }}
            className="bg-slate-950 text-emerald-400 font-bold px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
          >
            {snapshot.expiries.map(exp => (
              <option key={exp} value={exp}>
                {exp} {exp === snapshot.expiries[0] ? '(Weekly)' : '(Monthly)'}
              </option>
            ))}
          </select>

          <span className="text-slate-500">|</span>

          <span className="text-slate-400">
            Style: <strong className="text-slate-200">{snapshot.style}</strong>
          </span>
        </div>

        {/* Display Toggles */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowGreeks(!showGreeks)}
            className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 font-semibold transition-all ${
              showGreeks ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {showGreeks ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Greeks ({showGreeks ? 'ON' : 'OFF'})</span>
          </button>

          <button
            onClick={() => setShowBuildup(!showBuildup)}
            className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 font-semibold transition-all ${
              showBuildup ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>OI Buildup ({showBuildup ? 'ON' : 'OFF'})</span>
          </button>

          <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Strikes:</span>
            <select
              value={strikeRangeFilter}
              onChange={(e) => setStrikeRangeFilter(Number(e.target.value))}
              className="bg-transparent text-slate-200 focus:outline-none"
            >
              <option value={6}>±6 ATM</option>
              <option value={10}>±10 ATM</option>
              <option value={15}>±15 ATM (Full)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Option Chain Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto shadow-2xl">
        <table className="w-full text-left font-mono text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
              {/* CALLS HEADER */}
              <th colSpan={showGreeks ? 10 : 6} className="text-center py-2.5 bg-emerald-950/30 text-emerald-400 border-r border-slate-800 font-extrabold">
                CALL OPTIONS (CE)
              </th>
              {/* STRIKE HEADER */}
              <th className="text-center py-2.5 bg-slate-900 text-slate-100 font-black border-r border-slate-800 px-4">
                STRIKE
              </th>
              {/* PUTS HEADER */}
              <th colSpan={showGreeks ? 10 : 6} className="text-center py-2.5 bg-rose-950/30 text-rose-400 font-extrabold">
                PUT OPTIONS (PE)
              </th>
            </tr>
            <tr className="bg-slate-950/90 text-slate-400 text-[10px] border-b border-slate-800">
              {/* Call Columns */}
              <th className="py-2 px-2 text-right">OI</th>
              <th className="py-2 px-2 text-right">CHG OI</th>
              {showBuildup && <th className="py-2 px-2 text-center">BUILDUP</th>}
              <th className="py-2 px-2 text-right">VOL</th>
              <th className="py-2 px-2 text-right">IV %</th>
              {showGreeks && (
                <>
                  <th className="py-2 px-1 text-right text-emerald-400">Δ</th>
                  <th className="py-2 px-1 text-right text-emerald-400">Γ</th>
                  <th className="py-2 px-1 text-right text-emerald-400">Θ</th>
                  <th className="py-2 px-1 text-right text-emerald-400">ν</th>
                </>
              )}
              <th className="py-2 px-3 text-right bg-emerald-950/20 font-bold text-emerald-300 border-r border-slate-800">LTP</th>

              {/* Strike Column */}
              <th className="py-2 px-3 text-center font-bold bg-slate-900 text-slate-200 border-r border-slate-800">STRIKE</th>

              {/* Put Columns */}
              <th className="py-2 px-3 text-left bg-rose-950/20 font-bold text-rose-300 border-r border-slate-800">LTP</th>
              {showGreeks && (
                <>
                  <th className="py-2 px-1 text-left text-rose-400">Δ</th>
                  <th className="py-2 px-1 text-left text-rose-400">Γ</th>
                  <th className="py-2 px-1 text-left text-rose-400">Θ</th>
                  <th className="py-2 px-1 text-left text-rose-400">ν</th>
                </>
              )}
              <th className="py-2 px-2 text-left">IV %</th>
              <th className="py-2 px-2 text-left">VOL</th>
              {showBuildup && <th className="py-2 px-2 text-center">BUILDUP</th>}
              <th className="py-2 px-2 text-left">CHG OI</th>
              <th className="py-2 px-2 text-left">OI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {visibleStrikes.map((row) => {
              const isItmCe = row.strikePrice < snapshot.spotPrice;
              const isItmPe = row.strikePrice > snapshot.spotPrice;

              return (
                <tr
                  key={row.strikePrice}
                  className={`hover:bg-slate-800/80 transition-colors ${
                    row.isAtm ? 'bg-amber-500/10 font-semibold' : (row.isMaxPain ? 'bg-cyan-500/10' : '')
                  }`}
                >
                  {/* CALLS SIDE */}
                  <td className={`py-1.5 px-2 text-right ${isItmCe ? 'bg-emerald-950/15' : ''}`}>
                    {isContractAvailable(row.ce, 'oi') ? (
                      row.ce.openInterest.toLocaleString('en-IN')
                    ) : (
                      <span className="text-slate-600 italic font-normal">N/A</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right font-semibold">
                    {isContractAvailable(row.ce, 'oi') ? (
                      <span className={row.ce.changeInOI >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {row.ce.changeInOI >= 0 ? '+' : ''}{row.ce.changeInOI.toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic font-normal">N/A</span>
                    )}
                  </td>
                  {showBuildup && (
                    <td className="py-1.5 px-2 text-center">
                      {isContractAvailable(row.ce, 'oi') && isContractAvailable(row.ce, 'ltp') ? (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getBuildupBadgeClass(row.ce.buildup)}`}>
                          {row.ce.buildup.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic font-normal text-[9px]">N/A</span>
                      )}
                    </td>
                  )}
                  <td className="py-1.5 px-2 text-right text-slate-400">
                    {isContractAvailable(row.ce, 'volume') ? (
                      row.ce.volume.toLocaleString('en-IN')
                    ) : (
                      <span className="text-slate-600 italic font-normal">N/A</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right text-amber-300">
                    {isContractAvailable(row.ce, 'iv') ? (
                      `${row.ce.iv}%`
                    ) : (
                      <span className="text-slate-600 italic font-normal">N/A</span>
                    )}
                  </td>
                  {showGreeks && (
                    <>
                      <td className="py-1.5 px-1 text-right text-emerald-400">
                        {isContractAvailable(row.ce, 'iv') ? row.ce.delta : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                      <td className="py-1.5 px-1 text-right text-slate-400">
                        {isContractAvailable(row.ce, 'iv') ? row.ce.gamma : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                      <td className="py-1.5 px-1 text-right text-rose-400">
                        {isContractAvailable(row.ce, 'iv') ? row.ce.theta : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                      <td className="py-1.5 px-1 text-right text-cyan-400">
                        {isContractAvailable(row.ce, 'iv') ? row.ce.vega : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                    </>
                  )}
                  {/* CE LTP & Quick Add */}
                  <td className={`py-1.5 px-3 text-right font-bold text-slate-100 border-r border-slate-800 ${isItmCe ? 'bg-emerald-950/30' : ''}`}>
                    <div className="flex items-center justify-end space-x-1.5">
                      {isContractAvailable(row.ce, 'ltp') && (
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleQuickAddLeg(row, 'CE', 'BUY')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black shadow"
                            title="Add Long Call"
                          >
                            +B
                          </button>
                          <button
                            onClick={() => handleQuickAddLeg(row, 'CE', 'SELL')}
                            className="bg-rose-600 hover:bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black shadow"
                            title="Add Short Call"
                          >
                            +S
                          </button>
                        </div>
                      )}
                      <span>
                        {isContractAvailable(row.ce, 'ltp') ? `₹${row.ce.ltp}` : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </span>
                    </div>
                  </td>

                  {/* STRIKE PRICE COLUMN */}
                  <td className={`py-1.5 px-3 text-center font-extrabold text-slate-100 border-r border-slate-800 ${
                    row.isAtm ? 'bg-amber-500/20 text-amber-300' : (row.isMaxPain ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-950')
                  }`}>
                    <div className="flex items-center justify-center space-x-1">
                      <span>{row.strikePrice}</span>
                      {row.isAtm && <span className="text-[9px] bg-amber-500 text-slate-950 font-black px-1 rounded">ATM</span>}
                      {row.isMaxPain && <span className="text-[9px] bg-cyan-500 text-slate-950 font-black px-1 rounded">PAIN</span>}
                    </div>
                  </td>

                  {/* PUTS SIDE */}
                  {/* PE LTP & Quick Add */}
                  <td className={`py-1.5 px-3 text-left font-bold text-slate-100 border-r border-slate-800 ${isItmPe ? 'bg-rose-950/30' : ''}`}>
                    <div className="flex items-center justify-start space-x-1.5">
                      <span>
                        {isContractAvailable(row.pe, 'ltp') ? `₹${row.pe.ltp}` : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </span>
                      {isContractAvailable(row.pe, 'ltp') && (
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleQuickAddLeg(row, 'PE', 'BUY')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black shadow"
                            title="Add Long Put"
                          >
                            +B
                          </button>
                          <button
                            onClick={() => handleQuickAddLeg(row, 'PE', 'SELL')}
                            className="bg-rose-600 hover:bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black shadow"
                            title="Add Short Put"
                          >
                            +S
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  {showGreeks && (
                    <>
                      <td className="py-1.5 px-1 text-left text-rose-400">
                        {isContractAvailable(row.pe, 'iv') ? row.pe.delta : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                      <td className="py-1.5 px-1 text-left text-slate-400">
                        {isContractAvailable(row.pe, 'iv') ? row.pe.gamma : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                      <td className="py-1.5 px-1 text-left text-rose-400">
                        {isContractAvailable(row.pe, 'iv') ? row.pe.theta : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                      <td className="py-1.5 px-1 text-left text-cyan-400">
                        {isContractAvailable(row.pe, 'iv') ? row.pe.vega : <span className="text-slate-600 italic font-normal">N/A</span>}
                      </td>
                    </>
                  )}
                  <td className="py-1.5 px-2 text-left text-amber-300">
                    {isContractAvailable(row.pe, 'iv') ? `${row.pe.iv}%` : <span className="text-slate-600 italic font-normal">N/A</span>}
                  </td>
                  <td className="py-1.5 px-2 text-left text-slate-400">
                    {isContractAvailable(row.pe, 'volume') ? row.pe.volume.toLocaleString('en-IN') : <span className="text-slate-600 italic font-normal">N/A</span>}
                  </td>
                  {showBuildup && (
                    <td className="py-1.5 px-2 text-center">
                      {isContractAvailable(row.pe, 'oi') && isContractAvailable(row.pe, 'ltp') ? (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getBuildupBadgeClass(row.pe.buildup)}`}>
                          {row.pe.buildup.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic font-normal text-[9px]">N/A</span>
                      )}
                    </td>
                  )}
                  <td className="py-1.5 px-2 text-left font-semibold">
                    {isContractAvailable(row.pe, 'oi') ? (
                      <span className={row.pe.changeInOI >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {row.pe.changeInOI >= 0 ? '+' : ''}{row.pe.changeInOI.toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic font-normal">N/A</span>
                    )}
                  </td>
                  <td className={`py-1.5 px-2 text-left ${isItmPe ? 'bg-rose-950/15' : ''}`}>
                    {isContractAvailable(row.pe, 'oi') ? row.pe.openInterest.toLocaleString('en-IN') : <span className="text-slate-600 italic font-normal">N/A</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
