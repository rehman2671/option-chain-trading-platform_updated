/**
 * Interactive In-App System Documentation, DDL Exporter & Database Migration Inspector
 */

import React, { useState, useEffect } from 'react';
import { DatabaseSchemaInfo, DatabaseMigrationStatus } from '../types.js';
import { Database, Download, CheckCircle2, ShieldCheck, Cpu, Code2, Layers, BookOpen, Activity, RefreshCw } from 'lucide-react';

export const DocumentationView: React.FC = () => {
  const [schemas, setSchemas] = useState<DatabaseSchemaInfo[]>([]);
  const [migrations, setMigrations] = useState<DatabaseMigrationStatus[]>([]);
  const [ddlScript, setDdlScript] = useState('');
  const [healthData, setHealthData] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<'platform_architecture' | 'collection' | 'db' | 'architecture' | 'margin' | 'basket' | 'api' | 'papertrading'>('platform_architecture');

  const safeFetchJson = async (url: string, setter: (data: any) => void) => {
    try {
      const res = await fetch(url);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setter(data);
      }
    } catch (err) {
      console.error(`Error fetching ${url}:`, err);
    }
  };

  const fetchHealth = () => {
    safeFetchJson('/api/system/health', setHealthData);
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);

    safeFetchJson('/api/db/schema', setSchemas);
    safeFetchJson('/api/db/migrations', setMigrations);

    fetch('/api/db/export-ddl')
      .then(res => res.ok ? res.text() : '')
      .then(data => { if (data) setDdlScript(data); })
      .catch(console.error);

    return () => clearInterval(interval);
  }, []);

  const handleDownloadDDL = () => {
    const blob = new Blob([ddlScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '001_initial_schema.sql';
    a.click();
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Sub Navigation Bar */}
      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center space-x-2 gap-y-2">
        <button
          onClick={() => setActiveSection('platform_architecture')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'platform_architecture' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span>5-Pillar Strategy Architecture</span>
        </button>

        <button
          onClick={() => setActiveSection('collection')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'collection' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Background Collection Health</span>
        </button>

        <button
          onClick={() => setActiveSection('db')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'db' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Auto-Index DB & Schema</span>
        </button>

        <button
          onClick={() => setActiveSection('architecture')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'architecture' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Architecture & Math</span>
        </button>

        <button
          onClick={() => setActiveSection('margin')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'margin' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Section 5A Margin Engine</span>
        </button>

        <button
          onClick={() => setActiveSection('basket')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'basket' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Section 5B Basket Atomicity</span>
        </button>

        <button
          onClick={() => setActiveSection('api')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'api' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>API Reference</span>
        </button>

        <button
          onClick={() => setActiveSection('papertrading')}
          className={`px-3 py-1.5 rounded-lg border font-bold flex items-center space-x-2 ${
            activeSection === 'papertrading' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
          <span>Paper Trading Lifecycle (Phase M)</span>
        </button>
      </div>

      {/* SECTION: 5-Pillar Strategy Architecture Documentation */}
      {activeSection === 'platform_architecture' && (
        <div className="space-y-6">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 shadow-xl">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <span>PERSONAL AI TRADING PLATFORM — TAXONOMY & ENGINE SPECIFICATION</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Full-spectrum algorithmic trading matrix spanning 5 asset classes and timeframe domains without duplicates or overlaps.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-cyan-300 leading-relaxed overflow-x-auto">
              <pre className="text-xs">{`PERSONAL AI TRADING PLATFORM
│
├── 1. EQUITY INTRADAY
│   ├── VWAP / Mean Reversion
│   ├── Momentum
│   ├── Breakout
│   ├── Volatility Expansion
│   └── Microstructure
│
├── 2. EQUITY SHORT-TERM / SWING
│   ├── Momentum
│   ├── Breakout
│   ├── Trend Following
│   └── Multi-Timeframe
│
├── 3. EQUITY LONG-TERM
│   ├── Trend Following
│   ├── Relative Strength
│   ├── Sector Rotation
│   └── Fundamental/Quality Layer
│
├── 4. F&O
│   ├── Futures Momentum
│   ├── Futures Breakout
│   ├── Volatility
│   ├── Options/OI
│   ├── IV/Greeks
│   └── Expiry-aware Strategies
│
└── 5. COMMODITIES
    ├── Trend Following
    ├── Breakout
    ├── Momentum
    ├── Volatility Expansion
    └── Multi-Timeframe`}</pre>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] pt-2">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-amber-400 text-xs">1. EQUITY INTRADAY (MIS)</h4>
                <p className="text-slate-300">
                  Operates within the 09:15 AM - 03:20 PM session with mandatory EOD auto square-off. Fuses tick-level order flow (Bid/Ask imbalance &gt; 65%), VWAP standard deviation bands (±1.8σ), 15m Opening Range Breakouts, and Keltner squeeze volatility expansion.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-emerald-400 text-xs">2. EQUITY SHORT-TERM / SWING (CNC)</h4>
                <p className="text-slate-300">
                  Holds delivery positions for 3 to 20 trading sessions. Employs Volatility Contraction Pattern (VCP) stage-2 breakouts, Daily/Weekly RSI momentum filter (&gt;55), and Elder&apos;s Triple Screen multi-timeframe confirmation (Weekly Macro + Daily Pullback + 1H Trigger).
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-blue-400 text-xs">3. EQUITY LONG-TERM (INVESTMENT)</h4>
                <p className="text-slate-300">
                  Focuses on multi-year compounders with strict fundamental &amp; technical shields: Positive 200-Day SMA slope + Golden Cross (50/200 EMA), Mansfield Relative Strength vs NIFTY 50 &gt; 0, Sector Rotation RRG top quadrants, and Fundamental Quality screens (ROCE &gt; 18%, D/E &lt; 0.5, Piotroski Score &gt;= 7).
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-cyan-400 text-xs">4. F&amp;O (FUTURES &amp; OPTIONS)</h4>
                <p className="text-slate-300">
                  Non-directional &amp; directional derivatives framework: Long/Short Buildup Open Interest tracking, Volume Profile Value Area (VAH/VAL) breakouts, IV Rank volatility regimes (Straddles/Strangles/Condors), Delta-neutral Greek hedging, and Thursday 0DTE theta acceleration capture.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 md:col-span-2">
                <h4 className="font-bold text-yellow-400 text-xs">5. COMMODITIES (MCX)</h4>
                <p className="text-slate-300">
                  Specialized models for MCX Gold, Silver, Crude Oil, Natural Gas, and Copper synchronized with international global benchmarks (COMEX, NYMEX WTI, LME). Tracks US market open momentum (06:30 PM IST), EIA inventory shocks, and multi-timeframe trend continuity.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 0: Continuous Background Collection Health (Phase I) */}
      {activeSection === 'collection' && (
        <div className="space-y-6">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Phase I — Continuous Background Data Collection & Backtesting Readiness</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Staggered round-robin background loop runs unconditionally on server process lifetime (1 symbol every 15s = 75s full cycle across all 5 symbols). Persists ticks & option chains for backtesting without relying on active browser views.
              </p>
            </div>

            <button
              onClick={fetchHealth}
              className="px-3 py-1.5 rounded-lg bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold hover:bg-cyan-900 flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Health Data</span>
            </button>
          </div>

          {/* Symbol Coverage Grid */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-xl space-y-4">
            <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between">
              <span>Per-Symbol Historical Dataset Health & Coverage</span>
              <span className="text-[10px] text-slate-400 font-normal">Provider Mode: <strong className="text-emerald-400">{healthData?.mode || 'PRACTICE'}</strong></span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                    <th className="py-2 px-3">Underlying Symbol</th>
                    <th className="py-2 px-3">Active View</th>
                    <th className="py-2 px-3">In-Memory Last Capture</th>
                    <th className="py-2 px-3">SQLite DB Last Persisted</th>
                    <th className="py-2 px-3 text-right">Option Chain Rows</th>
                    <th className="py-2 px-3 text-right">Spot Price Ticks</th>
                    <th className="py-2 px-3 text-right">Distinct Days</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {healthData?.backgroundCollection?.symbols ? (
                    Object.entries(healthData.backgroundCollection.symbols).map(([sym, stats]: [string, any]) => (
                      <tr key={sym} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-bold text-slate-200">{sym}</td>
                        <td className="py-2.5 px-3">
                          {stats.isActivelyViewed ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
                              LIVE VIEWED
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">Background</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {stats.lastCapturedInMemory ? new Date(stats.lastCapturedInMemory).toLocaleTimeString() : 'Pending...'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400">
                          {stats.lastPersistedAtDB ? new Date(stats.lastPersistedAtDB).toLocaleString() : 'No rows yet'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-200">
                          {stats.totalChainRows.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-300">
                          {stats.totalSpotTicks.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                          {stats.distinctDaysHistory} {stats.distinctDaysHistory === 1 ? 'day' : 'days'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {stats.totalChainRows > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              READY FOR BACKTEST
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              ACCUMULATING
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500">
                        Loading background collection statistics...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-[10px] text-slate-400">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-cyan-400 font-bold block mb-1">⏱️ Staggered Cadence</span>
                Round-robin capture runs 1 symbol every <strong>15 seconds</strong> (full cycle across all 5 symbols every <strong>75 seconds</strong>), completely preventing rate-limit blocks.
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-emerald-400 font-bold block mb-1">⚡ Server Lifetime Execution</span>
                Loop runs unconditionally in the Node.js server process (`MarketFeedEngine` constructor). Does not stop or pause when browser tabs are closed.
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-amber-400 font-bold block mb-1">🛡️ No-Fake-Data Persistence</span>
                Persists real option contracts to `option_chains` and real spot prices to `ticks`. Market closed or failed fetches mark `available: false` and render as N/A without synthetic placeholders.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: Database Auto-Index & Migration Manager */}
      {activeSection === 'db' && (
        <div className="space-y-6">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Auto-Indexed Database Engine & Schema Inspector</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Full auto-indexing on all queryable columns (`symbol`, `timestamp`, `strategy_id`, `z_score`, `expiry`) to ensure zero token overhead and low latency.
              </p>
            </div>

            <button
              onClick={handleDownloadDDL}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl flex items-center space-x-2 shadow-lg transition"
            >
              <Download className="w-4 h-4" />
              <span>Export Migration DDL SQL</span>
            </button>
          </div>

          {/* Applied Migrations Card */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-200">Migration Version Tracking</h4>
            <div className="divide-y divide-slate-800">
              {migrations.map(m => (
                <div key={m.version} className="py-2 flex items-center justify-between">
                  <span className="font-bold text-emerald-400">v{m.version}: {m.description}</span>
                  <span className="text-slate-400 text-[10px]">Applied: {m.applied_at}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Schema & Index Introspection Grid */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-200">Introspected Database Tables & Indexes</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schemas.map(table => (
                <div key={table.tableName} className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-slate-100 text-sm">{table.tableName}</span>
                    <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-emerald-400">
                      Rows: {table.rowCount}
                    </span>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Columns</div>
                    <div className="flex flex-wrap gap-1">
                      {table.columns.map(col => (
                        <span key={col.name} className="bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800 text-[10px]">
                          {col.name} ({col.type})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1 text-emerald-400">Auto-Indexes</div>
                    <div className="space-y-1">
                      {table.indexes.length === 0 ? (
                        <span className="text-slate-500 italic text-[10px]">Primary key index</span>
                      ) : (
                        table.indexes.map(idx => (
                          <div key={idx.name} className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[10px] text-cyan-300">
                            <strong>{idx.name}</strong> [{idx.columns.join(', ')}]
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Architecture & Math */}
      {activeSection === 'architecture' && (
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-6 shadow-xl leading-relaxed">
          <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
            System Architecture & Mathematical Specifications
          </h3>

          <div className="space-y-4 text-slate-300">
            <div>
              <h4 className="font-bold text-emerald-400 text-xs">1. "Algo First, AI Second" Design Philosophy</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                All option Greeks ($\Delta, \Gamma, \Theta, \nu, \rho$), Implied Volatility (Newton-Raphson), Max Pain, and PCR are computed deterministically inside low-latency TypeScript code. The Gemini AI layer functions purely as a narrative explanation layer that invokes tools to read pre-calculated numbers, completely preventing LLM hallucination of financial data.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-emerald-400 text-xs">2. European vs American Pricing Distinction</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                Index options (Nifty, BankNifty) use Black-Scholes European pricing. Stock options (Reliance, TCS, HDFC Bank) use American early-exercise adjustments (Bjerksund-Stensland 2002 model) to accurately price early exercise premiums.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-emerald-400 text-xs">3. Implied Volatility Solver</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                Uses Newton-Raphson iteration with a bisection method fallback. Back-solves market LTP to find exact IV percentage within a tolerance of $10^{-5}$.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: Section 5A Margin Engine */}
      {activeSection === 'margin' && (
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 shadow-xl leading-relaxed text-slate-300">
          <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
            Section 5A: Margin Calculator Specification
          </h3>

          <ul className="list-disc pl-5 space-y-2 text-[11px]">
            <li><strong>Mandatory Pre-Trade Gate:</strong> Margin is evaluated BEFORE placing any leg of an automated or manual strategy.</li>
            <li><strong>Basket Margin Benefit:</strong> Combines short options and protective long option legs to grant up to 55-65% margin discount on hedged multi-leg strategies.</li>
            <li><strong>Safety Cushion:</strong> Applies a 10-15% safety margin cushion above required SPAN to prevent MTM margin call rejections during intraday volatility spikes.</li>
            <li><strong>Fail-Closed Policy:</strong> If margin API calls fail or available funds are lower than required + cushion, order submission is blocked.</li>
          </ul>
        </div>
      )}

      {/* SECTION 4: Section 5B Basket Atomicity */}
      {activeSection === 'basket' && (
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 shadow-xl leading-relaxed text-slate-300">
          <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
            Section 5B: Basket Order Execution Atomicity & Fallback Specification
          </h3>

          <ul className="list-disc pl-5 space-y-2 text-[11px]">
            <li><strong>Sequenced Placement:</strong> Protective long option legs (BUY) are submitted and verified FILLED before short option legs (SELL) are placed, ensuring no unhedged exposure occurs.</li>
            <li><strong>Fill Status Polling:</strong> Verifies complete fill status of each leg before initiating subsequent sequence legs.</li>
            <li><strong>Partial Fill Fallback Engine:</strong> If any intermediate leg fails, the engine automatically cancels pending legs and triggers immediate exit offset orders for filled legs.</li>
            <li><strong>Broker Reconciliation:</strong> Background reconciliation job periodically compares internal database leg states against live exchange order books.</li>
          </ul>
        </div>
      )}

      {/* SECTION 5: API Reference */}
      {activeSection === 'api' && (
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 shadow-xl text-slate-300">
          <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
            REST API Endpoints Reference
          </h3>

          <div className="space-y-3 font-mono text-[11px]">
            <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
              <span className="text-emerald-400 font-bold">GET /api/option-chain?symbol=NIFTY</span>
              <div className="text-slate-400 text-[10px] mt-0.5">Returns live option chain snapshot with Black-Scholes greeks, Max Pain, PCR, and IV Rank.</div>
            </div>

            <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
              <span className="text-cyan-400 font-bold">POST /api/margin/check</span>
              <div className="text-slate-400 text-[10px] mt-0.5">Calculates order & basket margins with hedge discount benefit and cushion verification.</div>
            </div>

            <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
              <span className="text-cyan-400 font-bold">POST /api/basket/execute</span>
              <div className="text-slate-400 text-[10px] mt-0.5">Executes multi-leg strategy with application-level atomicity, sequencing, and fallback recovery.</div>
            </div>

            <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
              <span className="text-cyan-400 font-bold">POST /api/ai/narrate</span>
              <div className="text-slate-400 text-[10px] mt-0.5">Generates institutional market narrative via server-side Gemini @google/genai tool calling.</div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: Paper Trading Lifecycle (Phase M) */}
      {activeSection === 'papertrading' && (
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-5 shadow-xl text-slate-300">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span>Phase M — Complete Paper Trading Engine Lifecycle</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              Multi-leg strategy execution, grouped position management, strict fail-closed MTM pricing, auto-exits, and SQLite persistence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="font-bold text-cyan-400">1. Strategy Builder & Execution</div>
              <p className="text-slate-400">
                Legs built in the Strategy Builder are submitted via <code className="text-emerald-300">POST /api/paper-trading/start</code>. Each leg is assigned an entry price matching its current LTP and bound to a single shared <code className="text-amber-300">strategyGroupId</code> for atomic group tracking.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="font-bold text-cyan-400">2. Real-Time MTM & Strict Gate</div>
              <p className="text-slate-400">
                The background engine runs <code className="text-emerald-300">updatePaperPositionsMTM()</code> on every market feed cycle. MTM calculations strictly enforce fail-closed checks (<code className="text-amber-300">available === true && ltpAvailable === true</code>) to prevent invalid price jumps during market disconnections.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="font-bold text-cyan-400">3. Grouped Tracking & Portfolio Margin</div>
              <p className="text-slate-400">
                Positions are visually grouped under their strategy group ID in the Paper Trading Terminal. Portfolio margin utilization is dynamically recomputed using open leg lot sizes and the real SPAN/Basket margin engine.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="font-bold text-cyan-400">4. Auto-Exits & Square Off</div>
              <p className="text-slate-400">
                Supports per-leg Stop-Loss and Target Price auto-exits, individual leg square-off (<code className="text-emerald-300">POST /api/paper-trading/close</code>), and atomic strategy group square-off (<code className="text-emerald-300">POST /api/paper-trading/close-group</code>). Closed trades are persisted in SQLite <code className="text-amber-300">paper_positions</code> with exit reason and execution timestamps.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
