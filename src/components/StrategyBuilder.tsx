/**
 * Multi-Leg Strategy Builder, Payoff Analyzer, Section 5A Margin Gate & Section 5B Basket Executor
 */

import React, { useState, useEffect } from 'react';
import { StrategyLeg, OptionChainSnapshot, MarginCheckResult, BasketOrderRecord, PayoffDataPoint } from '../types.js';
import { calculateEuropeanOptionGreeks, calculateAmericanOptionGreeks } from '../server/engine/blackScholes.js';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { Plus, Trash2, Zap, ShieldCheck, AlertCircle, ArrowUpRight, ArrowDownRight, RefreshCw, Clock, PlayCircle } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

interface StrategyBuilderProps {
  snapshot: OptionChainSnapshot | null;
  selectedLegs: StrategyLeg[];
  onUpdateLegs: (legs: StrategyLeg[]) => void;
  userAvailableMargin: number;
  onBasketExecuted?: (basket: BasketOrderRecord) => void;
}

export const StrategyBuilder: React.FC<StrategyBuilderProps> = ({
  snapshot,
  selectedLegs,
  onUpdateLegs,
  userAvailableMargin,
  onBasketExecuted
}) => {
  const [productType, setProductType] = useState<'NRML' | 'MIS'>('NRML');
  const [marginResult, setMarginResult] = useState<MarginCheckResult | null>(null);
  const [isCheckingMargin, setIsCheckingMargin] = useState(false);
  const [isExecutingBasket, setIsExecutingBasket] = useState(false);
  const [executionLog, setExecutionLog] = useState<BasketOrderRecord | null>(null);

  if (!snapshot) {
    return <div className="p-8 text-center text-slate-400 font-mono">Loading option snapshot...</div>;
  }

  const spot = snapshot.spotPrice;
  const lotSize = snapshot.symbol === 'NIFTY' ? 25 : (snapshot.symbol === 'BANKNIFTY' ? 15 : snapshot.symbol === 'TCS' ? 175 : snapshot.symbol === 'HDFCBANK' ? 550 : 250);

  // Symbol-aware strike interval (step size)
  const stepSize = snapshot.stepSize || (
    snapshot.symbol === 'BANKNIFTY' ? 100 :
    snapshot.symbol === 'RELIANCE' ? 20 :
    snapshot.symbol === 'HDFCBANK' ? 10 :
    snapshot.symbol === 'TCS' ? 50 : 50
  );

  // Helper to find closest strike row in snapshot strikes
  const findClosestRow = (targetK: number) => {
    if (!snapshot.strikes.length) return null;
    return snapshot.strikes.reduce((closest, curr) =>
      Math.abs(curr.strikePrice - targetK) < Math.abs(closest.strikePrice - targetK) ? curr : closest
    , snapshot.strikes[0]);
  };

  // Preset Strategy Loaders using symbol-aware step size
  const applyPreset = (presetName: string) => {
    const atmStrike = Math.round(spot / stepSize) * stepSize;
    let newLegs: StrategyLeg[] = [];

    if (presetName === 'SHORT_STRADDLE') {
      const row = findClosestRow(atmStrike);
      if (row) {
        newLegs = [
          { id: `leg-1-${Date.now()}`, type: 'CE', action: 'SELL', strikePrice: row.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: row.ce.ltp, entryPrice: row.ce.ltp, iv: row.ce.iv, delta: row.ce.delta, gamma: row.ce.gamma, theta: row.ce.theta, vega: row.ce.vega, product: productType, customLabel: `Sell Call ${row.strikePrice}` },
          { id: `leg-2-${Date.now()}`, type: 'PE', action: 'SELL', strikePrice: row.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: row.pe.ltp, entryPrice: row.pe.ltp, iv: row.pe.iv, delta: row.pe.delta, gamma: row.pe.gamma, theta: row.pe.theta, vega: row.pe.vega, product: productType, customLabel: `Sell Put ${row.strikePrice}` }
        ];
      }
    } else if (presetName === 'IRON_CONDOR') {
      const callShortK = atmStrike + (3 * stepSize);
      const callLongK = atmStrike + (6 * stepSize);
      const putShortK = atmStrike - (3 * stepSize);
      const putLongK = atmStrike - (6 * stepSize);

      const csRow = findClosestRow(callShortK);
      const clRow = findClosestRow(callLongK);
      const psRow = findClosestRow(putShortK);
      const plRow = findClosestRow(putLongK);

      if (csRow && clRow && psRow && plRow) {
        newLegs = [
          { id: `leg-1-${Date.now()}`, type: 'CE', action: 'SELL', strikePrice: csRow.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: csRow.ce.ltp, entryPrice: csRow.ce.ltp, iv: csRow.ce.iv, delta: csRow.ce.delta, gamma: csRow.ce.gamma, theta: csRow.ce.theta, vega: csRow.ce.vega, product: productType, customLabel: `Sell Call ${csRow.strikePrice}` },
          { id: `leg-2-${Date.now()}`, type: 'CE', action: 'BUY', strikePrice: clRow.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: clRow.ce.ltp, entryPrice: clRow.ce.ltp, iv: clRow.ce.iv, delta: clRow.ce.delta, gamma: clRow.ce.gamma, theta: clRow.ce.theta, vega: clRow.ce.vega, product: productType, customLabel: `Buy Call ${clRow.strikePrice}` },
          { id: `leg-3-${Date.now()}`, type: 'PE', action: 'SELL', strikePrice: psRow.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: psRow.pe.ltp, entryPrice: psRow.pe.ltp, iv: psRow.pe.iv, delta: psRow.pe.delta, gamma: psRow.pe.gamma, theta: psRow.pe.theta, vega: psRow.pe.vega, product: productType, customLabel: `Sell Put ${psRow.strikePrice}` },
          { id: `leg-4-${Date.now()}`, type: 'PE', action: 'BUY', strikePrice: plRow.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: plRow.pe.ltp, entryPrice: plRow.pe.ltp, iv: plRow.pe.iv, delta: plRow.pe.delta, gamma: plRow.pe.gamma, theta: plRow.pe.theta, vega: plRow.pe.vega, product: productType, customLabel: `Buy Put ${plRow.strikePrice}` }
        ];
      }
    } else if (presetName === 'BULL_CALL_SPREAD') {
      const longK = atmStrike;
      const shortK = atmStrike + (3 * stepSize);
      const lRow = findClosestRow(longK);
      const sRow = findClosestRow(shortK);

      if (lRow && sRow) {
        newLegs = [
          { id: `leg-1-${Date.now()}`, type: 'CE', action: 'BUY', strikePrice: lRow.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: lRow.ce.ltp, entryPrice: lRow.ce.ltp, iv: lRow.ce.iv, delta: lRow.ce.delta, gamma: lRow.ce.gamma, theta: lRow.ce.theta, vega: lRow.ce.vega, product: productType, customLabel: `Buy Call ${lRow.strikePrice}` },
          { id: `leg-2-${Date.now()}`, type: 'CE', action: 'SELL', strikePrice: sRow.strikePrice, expiry: snapshot.selectedExpiry, quantity: 1, lotSize, currentLtp: sRow.ce.ltp, entryPrice: sRow.ce.ltp, iv: sRow.ce.iv, delta: sRow.ce.delta, gamma: sRow.ce.gamma, theta: sRow.ce.theta, vega: sRow.ce.vega, product: productType, customLabel: `Sell Call ${sRow.strikePrice}` }
        ];
      }
    }

    onUpdateLegs(newLegs);
  };

  // Run Section 5A Margin Check when legs, productType or margin change
  useEffect(() => {
    if (selectedLegs.length === 0) {
      setMarginResult(null);
      return;
    }

    const checkMargin = async () => {
      setIsCheckingMargin(true);
      try {
        const res = await apiFetch('/api/margin/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: snapshot.symbol,
            legs: selectedLegs.map(l => ({
              symbol: snapshot.symbol,
              strikePrice: l.strikePrice,
              type: l.type,
              action: l.action,
              quantity: l.quantity,
              lotSize: l.lotSize,
              price: l.currentLtp,
              product: productType
            })),
            userAvailableMargin
          })
        });
        const data: MarginCheckResult = await res.json();
        setMarginResult(data);
      } catch (e) {
        console.error('Margin check failed:', e);
      } finally {
        setIsCheckingMargin(false);
      }
    };

    checkMargin();
  }, [selectedLegs, userAvailableMargin, snapshot.symbol, productType]);

  // Execute Basket Order via Section 5B Atomic Engine
  const handleExecuteBasket = async () => {
    if (selectedLegs.length === 0) return;
    setIsExecutingBasket(true);
    try {
      const res = await apiFetch('/api/basket/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: `strat-${Date.now()}`,
          strategyName: 'Multi-Leg Basket Strategy',
          symbol: snapshot.symbol,
          legs: selectedLegs.map(l => ({ ...l, product: productType })),
          userAvailableMargin
        })
      });
      const data: BasketOrderRecord = await res.json();
      setExecutionLog(data);
      if (onBasketExecuted) {
        onBasketExecuted(data);
      }
    } catch (e) {
      console.error('Basket execution error:', e);
    } finally {
      setIsExecutingBasket(false);
    }
  };

  const [isExecutingPaper, setIsExecutingPaper] = useState(false);
  const [paperFeedback, setPaperFeedback] = useState<{ type: 'success' | 'error'; message: string; groupId?: string } | null>(null);

  const handleExecutePaperStrategy = async () => {
    if (selectedLegs.length === 0 || !snapshot) return;
    setIsExecutingPaper(true);
    setPaperFeedback(null);
    try {
      const strategyName = selectedLegs.length === 1 ? `Single ${selectedLegs[0].type}` : `Multi-Leg Strategy (${selectedLegs.length} legs)`;
      const res = await apiFetch('/api/paper-trading/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: snapshot.symbol,
          strategyName,
          legs: selectedLegs.map(leg => ({
            type: leg.type,
            action: leg.action,
            strikePrice: leg.strikePrice,
            expiry: leg.expiry,
            quantity: leg.quantity,
            lotSize: leg.lotSize,
            currentLtp: leg.currentLtp,
            legLabel: leg.customLabel || `${leg.action} ${leg.type} ${leg.strikePrice}`,
            product: productType
          }))
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPaperFeedback({
          type: 'error',
          message: data.error || 'Margin shortfall or execution error'
        });
      } else {
        setPaperFeedback({
          type: 'success',
          message: `Strategy Executed in Paper Trading Terminal! (${selectedLegs.length} legs placed)`,
          groupId: data.strategyGroupId
        });
        onUpdateLegs([]); // Clear legs on success per A3 requirement
      }
    } catch (e: any) {
      console.error('Error executing paper strategy:', e);
      setPaperFeedback({
        type: 'error',
        message: e.message || 'Error executing paper strategy'
      });
    } finally {
      setIsExecutingPaper(false);
    }
  };

  // Portfolio Greeks Sum
  const netDelta = selectedLegs.reduce((sum, l) => sum + (l.delta * l.quantity * l.lotSize * (l.action === 'BUY' ? 1 : -1)), 0);
  const netGamma = selectedLegs.reduce((sum, l) => sum + (l.gamma * l.quantity * l.lotSize * (l.action === 'BUY' ? 1 : -1)), 0);
  const netTheta = selectedLegs.reduce((sum, l) => sum + (l.theta * l.quantity * l.lotSize * (l.action === 'BUY' ? 1 : -1)), 0);
  const netVega = selectedLegs.reduce((sum, l) => sum + (l.vega * l.quantity * l.lotSize * (l.action === 'BUY' ? 1 : -1)), 0);

  // Net Debit/Credit
  const netPremiumPerLot = selectedLegs.reduce((sum, l) => sum + (l.currentLtp * (l.action === 'BUY' ? -1 : 1)), 0);
  const isNetCredit = netPremiumPerLot >= 0;

  // Real Black-Scholes Time-Decay-Aware T+0 P&L Curve Calculation
  let daysToExpiry = 7;
  if (snapshot.selectedExpiry) {
    const expiryDate = new Date(`${snapshot.selectedExpiry}T15:30:00+05:30`);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    daysToExpiry = Math.max(0.05, diffMs / (1000 * 60 * 60 * 24));
  }
  const T_years = daysToExpiry / 365;
  const r = 0.065; // 6.5% RBI repo rate
  const q = 0.012; // 1.2% dividend yield
  const isAmerican = snapshot.style === 'AMERICAN';
  const pricer = isAmerican ? calculateAmericanOptionGreeks : calculateEuropeanOptionGreeks;

  // Check if all selected legs have valid non-zero IV for theoretical repricing
  let hasValidIVs = selectedLegs.length > 0;
  for (const leg of selectedLegs) {
    if (typeof leg.iv !== 'number' || leg.iv <= 0 || isNaN(leg.iv)) {
      hasValidIVs = false;
      break;
    }
  }

  const payoffData: PayoffDataPoint[] = [];
  const minSpot = spot * 0.93;
  const maxSpot = spot * 1.07;
  const step = (maxSpot - minSpot) / 40;

  for (let s = minSpot; s <= maxSpot; s += step) {
    let pnlAtExpiry = 0;
    let pnlToday = 0;

    for (const leg of selectedLegs) {
      const totalQty = leg.quantity * leg.lotSize;
      
      // 1. Expiry Payoff (Intrinsic Value)
      let legPayoutAtExpiry = 0;
      if (leg.type === 'CE') {
        legPayoutAtExpiry = Math.max(0, s - leg.strikePrice);
      } else {
        legPayoutAtExpiry = Math.max(0, leg.strikePrice - s);
      }

      if (leg.action === 'BUY') {
        pnlAtExpiry += (legPayoutAtExpiry - leg.currentLtp) * totalQty;
      } else {
        pnlAtExpiry += (leg.currentLtp - legPayoutAtExpiry) * totalQty;
      }

      // 2. Real T+0 Time-Decay-Aware Repricing via Black-Scholes
      if (hasValidIVs) {
        const sigma = leg.iv / 100;
        const isCall = leg.type === 'CE';
        const greeksAtS = pricer(s, leg.strikePrice, T_years, r, sigma, isCall, q);
        const theoreticalPrice = greeksAtS.price;

        if (leg.action === 'BUY') {
          pnlToday += (theoreticalPrice - leg.currentLtp) * totalQty;
        } else {
          pnlToday += (leg.currentLtp - theoreticalPrice) * totalQty;
        }
      }
    }

    payoffData.push({
      underlyingPrice: Math.round(s),
      priceChangePercent: Number((((s - spot) / spot) * 100).toFixed(1)),
      pnlAtExpiry: Math.round(pnlAtExpiry),
      pnlToday: hasValidIVs ? Math.round(pnlToday) : 0
    });
  }

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Preset Strategy Buttons & Product Selector Bar */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400 font-semibold">Presets ({snapshot.symbol} step {stepSize}):</span>
            <button onClick={() => applyPreset('SHORT_STRADDLE')} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg border border-slate-700 font-bold transition">
              Short Straddle
            </button>
            <button onClick={() => applyPreset('IRON_CONDOR')} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg border border-slate-700 font-bold transition">
              Iron Condor
            </button>
            <button onClick={() => applyPreset('BULL_CALL_SPREAD')} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg border border-slate-700 font-bold transition">
              Bull Call Spread
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Task 3: Product Type Selector (NRML vs MIS) */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-semibold px-1 text-[10px]">Product:</span>
            <button
              onClick={() => setProductType('NRML')}
              className={`px-2 py-0.5 rounded font-extrabold text-[10px] transition ${
                productType === 'NRML'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="NRML: Normal carry-forward position holding across days"
            >
              NRML (Carry Forward)
            </button>
            <button
              onClick={() => setProductType('MIS')}
              className={`px-2 py-0.5 rounded font-extrabold text-[10px] transition ${
                productType === 'MIS'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="MIS: Intraday margin leverage (auto-square off at 3:15 PM)"
            >
              MIS (Intraday)
            </button>
          </div>
        </div>

        <button onClick={() => onUpdateLegs([])} className="text-rose-400 hover:text-rose-300 text-xs font-semibold underline">
          Clear All Legs
        </button>
      </div>

      {/* Small Notice describing Product Type Choice */}
      <div className="text-[10px] text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-1.5">
        ℹ️ <strong>Selected Product Type ({productType}):</strong> {
          productType === 'MIS'
            ? 'MIS (Intraday) requires lower margin leverage but positions are auto-squared off by broker at 3:15 PM.'
            : 'NRML (Carry Forward) permits overnight position holding until option expiry date.'
        }
      </div>

      {/* Grid: Leg Table & Portfolio Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Legs Configurator Table */}
        <div className="lg:col-span-2 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Strategy Legs ({selectedLegs.length})</span>
            </h3>
            <span className="text-slate-400 text-[11px]">
              Net Premium: <strong className={isNetCredit ? 'text-emerald-400' : 'text-rose-400'}>
                {isNetCredit ? 'CREDIT' : 'DEBIT'} ₹{Math.abs(Math.round(netPremiumPerLot * lotSize)).toLocaleString('en-IN')}
              </strong>
            </span>
          </div>

          {selectedLegs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg">
              No strategy legs selected. Click "+B" or "+S" on the Option Chain or select a Preset above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800 pb-1 uppercase">
                    <th className="py-2">Action</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Strike Price</th>
                    <th className="py-2">Custom Label</th>
                    <th className="py-2">Lots</th>
                    <th className="py-2 text-right">LTP</th>
                    <th className="py-2 text-right">Delta</th>
                    <th className="py-2 text-right">Theta</th>
                    <th className="py-2 text-center">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {selectedLegs.map((leg, idx) => (
                    <tr key={leg.id} className="hover:bg-slate-800/40">
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded font-black ${
                          leg.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}>
                          {leg.action}
                        </span>
                      </td>
                      <td className="py-2 font-bold text-slate-200">{leg.type}</td>
                      <td className="py-2 font-bold text-amber-300">
                        <input
                          type="number"
                          step={stepSize}
                          value={leg.strikePrice}
                          onChange={(e) => {
                            const newStrike = Number(e.target.value);
                            if (!newStrike || isNaN(newStrike)) return;
                            const row = findClosestRow(newStrike);
                            if (row) {
                              const contract = leg.type === 'CE' ? row.ce : row.pe;
                              const updated = [...selectedLegs];
                              updated[idx] = {
                                ...leg,
                                strikePrice: row.strikePrice,
                                currentLtp: contract.ltp,
                                entryPrice: contract.ltp,
                                iv: contract.iv,
                                delta: contract.delta,
                                gamma: contract.gamma,
                                theta: contract.theta,
                                vega: contract.vega,
                                isManuallyAdjusted: true,
                                customLabel: leg.customLabel || `Adjusted ${leg.type} ${row.strikePrice}`
                              };
                              onUpdateLegs(updated);
                            }
                          }}
                          className="w-20 bg-slate-950 text-amber-300 border border-slate-700 px-2 py-1 rounded font-bold text-center"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="text"
                          value={leg.customLabel || ''}
                          placeholder={`${leg.action} ${leg.type} ${leg.strikePrice}`}
                          onChange={(e) => {
                            const updated = [...selectedLegs];
                            updated[idx] = {
                              ...leg,
                              customLabel: e.target.value
                            };
                            onUpdateLegs(updated);
                          }}
                          className="w-28 sm:w-36 bg-slate-950 text-slate-200 border border-slate-700 px-2 py-1 rounded text-xs"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={leg.quantity}
                          onChange={(e) => {
                            const updated = [...selectedLegs];
                            updated[idx].quantity = Math.max(1, Number(e.target.value));
                            onUpdateLegs(updated);
                          }}
                          className="w-14 bg-slate-950 text-slate-100 border border-slate-700 px-2 py-1 rounded text-center font-bold"
                        />
                      </td>
                      <td className="py-2 text-right text-slate-100 font-bold">₹{leg.currentLtp}</td>
                      <td className="py-2 text-right text-emerald-400">{leg.delta}</td>
                      <td className="py-2 text-right text-rose-400">{leg.theta}</td>
                      <td className="py-2 text-center">
                        <button
                          onClick={() => {
                            const updated = selectedLegs.filter((_, i) => i !== idx);
                            onUpdateLegs(updated);
                          }}
                          className="p-1 hover:bg-rose-500/20 text-rose-400 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section 5A Margin Gate Box */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Section 5A Margin Gate Verification ({productType})</span>
              </span>
              {marginResult && (
                <span className={`px-2.5 py-0.5 rounded font-black text-[10px] ${
                  marginResult.hasSufficientMargin ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                }`}>
                  {marginResult.hasSufficientMargin ? 'MARGIN PASSED' : 'REJECTED - SHORTFALL'}
                </span>
              )}
            </div>

            {marginResult ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-300">
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400">Standalone Margin</div>
                  <div className="font-bold text-slate-100 mt-0.5">₹{marginResult.standaloneMargin.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400">Hedge Discount</div>
                  <div className="font-bold text-emerald-400 mt-0.5">-₹{marginResult.hedgeBenefit.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400">Required + Cushion</div>
                  <div className="font-bold text-cyan-300 mt-0.5">₹{marginResult.requiredMarginWithCushion.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400">Available Capital</div>
                  <div className="font-bold text-amber-300 mt-0.5">₹{userAvailableMargin.toLocaleString('en-IN')}</div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 italic">Select legs to calculate SPAN & Basket margins.</div>
            )}

            {paperFeedback && (
              <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                paperFeedback.type === 'success' 
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' 
                  : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
              }`}>
                <div>
                  <span>{paperFeedback.type === 'success' ? '✅ ' : '❌ '}{paperFeedback.message}</span>
                  {paperFeedback.groupId && (
                    <span className="ml-2 font-mono text-[10px] bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded border border-emerald-500/30">
                      Group ID: {paperFeedback.groupId}
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => setPaperFeedback(null)} 
                  className="text-slate-400 hover:text-white font-bold text-sm ml-3"
                >
                  ×
                </button>
              </div>
            )}

            {/* Section 5B Execution Button */}
            <div className="pt-2 flex items-center justify-between">
              <div className="text-[10px] text-slate-400">
                *Application-level atomicity: Long legs executed before Short legs ({productType}).
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleExecutePaperStrategy}
                  disabled={selectedLegs.length === 0 || isExecutingPaper}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold px-4 py-2 rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 transition"
                >
                  {isExecutingPaper ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Placing Paper Strategy...</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4" />
                      <span>Paper Trade Strategy</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleExecuteBasket}
                  disabled={selectedLegs.length === 0 || !marginResult?.hasSufficientMargin || isExecutingBasket}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold px-5 py-2 rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 transition"
                >
                  {isExecutingBasket ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Executing Sequenced Basket ({productType})...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-white" />
                      <span>Execute Basket Order ({productType})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Portfolio Greeks & Risk Card */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-4 shadow-xl">
          <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
            Portfolio Greeks & Risk Profile
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Net Delta (Δ)</div>
              <div className={`text-base font-bold mt-1 ${netDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {netDelta.toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Net Gamma (Γ)</div>
              <div className="text-base font-bold text-slate-200 mt-1">{netGamma.toFixed(3)}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Net Theta (Θ)</div>
              <div className="text-base font-bold text-rose-400 mt-1">₹{Math.round(netTheta).toLocaleString('en-IN')}/day</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Net Vega (ν)</div>
              <div className="text-base font-bold text-cyan-400 mt-1">₹{Math.round(netVega).toLocaleString('en-IN')}/1% IV</div>
            </div>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-300">Risk Guidelines</div>
            <ul className="text-[11px] text-slate-400 space-y-1 list-disc pl-4">
              <li>Positive Theta indicates net time decay collection per day.</li>
              <li>Vega exposure increases risk during high-volatility event sessions.</li>
              <li>Keep Net Delta within ±50 to maintain directional neutrality.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Interactive Payoff Graph with Real Black-Scholes T+0 Curve */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2 gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <span>Interactive Payoff Graph (P&L vs Spot Price)</span>
            </h3>
            {hasValidIVs ? (
              <span className="text-[10px] text-amber-400 font-normal">
                ✓ T+0 Curve computed via Black-Scholes ({daysToExpiry.toFixed(1)} days to expiry, {snapshot.style} pricing)
              </span>
            ) : selectedLegs.length > 0 ? (
              <span className="text-[10px] text-amber-500 font-normal">
                ⚠️ T+0 Curve unavailable — Implied Volatility missing for one or more legs
              </span>
            ) : null}
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <span className="flex items-center space-x-1.5 text-emerald-400">
              <span className="w-3 h-0.5 bg-emerald-400 font-bold" />
              <span>Expiry P&L</span>
            </span>
            <span className="flex items-center space-x-1.5 text-amber-400">
              <span className="w-3 h-0.5 bg-amber-400" />
              <span>T+0 P&L</span>
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={payoffData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="underlyingPrice" stroke="#94a3b8" tick={{ fontSize: 10 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                formatter={(val: any, name: any) => [
                  `₹${Number(val).toLocaleString('en-IN')}`,
                  name === 'pnlAtExpiry' ? 'Expiry P&L' : 'T+0 Today P&L'
                ]}
                labelFormatter={(label) => `Spot Price: ₹${label}`}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5} />
              <ReferenceLine x={spot} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'SPOT', fill: '#f59e0b', fontSize: 10 }} />
              <Line type="monotone" dataKey="pnlAtExpiry" stroke="#10b981" strokeWidth={2.5} dot={false} name="pnlAtExpiry" />
              {hasValidIVs && (
                <Line type="monotone" dataKey="pnlToday" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="pnlToday" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Execution Feedback Modal / Card if Basket executed */}
      {executionLog && (
        <div className="bg-slate-900 border border-emerald-500/50 p-4 rounded-xl space-y-3 font-mono shadow-2xl">
          <div className="flex items-center justify-between text-emerald-400 font-bold">
            <span>Basket Execution Log: {executionLog.id}</span>
            <span className="text-xs bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/40">
              STATUS: {executionLog.status}
            </span>
          </div>

          <div className="text-xs text-slate-300">
            {executionLog.fallbackActionTriggered ? (
              <div className="p-2 bg-amber-500/10 text-amber-300 rounded border border-amber-500/30">
                {executionLog.fallbackActionTriggered}
              </div>
            ) : (
              <span>All legs placed in risk-reducing sequence and filled cleanly.</span>
            )}
          </div>

          <div className="text-[11px] text-slate-400">
            Reconciliation: {executionLog.reconciliationNotes}
          </div>
        </div>
      )}
    </div>
  );
};

