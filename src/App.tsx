/**
 * Option Chain Trading Platform - Main Application Host
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { OptionChainTable } from './components/OptionChainTable.js';
import { StrategyBuilder } from './components/StrategyBuilder.js';
import { AnalyticsDashboard } from './components/AnalyticsDashboard.js';
import { BasketOrdersManager } from './components/BasketOrdersManager.js';
import { PaperTradingManager } from './components/PaperTradingManager.js';
import { BacktesterView } from './components/BacktesterView.js';
import { AutonomousRunnerView } from './components/AutonomousRunnerView.js';
import { PersonalAiPlatformView } from './components/PersonalAiPlatformView.js';
import { AiNarrationPanel } from './components/AiNarrationPanel.js';
import { DocumentationView } from './components/DocumentationView.js';
import { AuthModal } from './components/AuthModal.js';
import { useAuth } from './context/AuthContext.js';
import { OptionChainSnapshot, OIAnomaly, EventReactiveState, StrategyLeg, BasketOrderRecord } from './types.js';
import { Lock, LogIn, UserCheck } from 'lucide-react';
import { apiFetch } from './lib/api.js';

export default function App() {
  const { user, loading, setAuthModalOpen } = useAuth();
  const [currentSymbol, setCurrentSymbol] = useState<string>('NIFTY');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('chain');

  const [snapshot, setSnapshot] = useState<OptionChainSnapshot | null>(null);
  const [anomalies, setAnomalies] = useState<OIAnomaly[]>([]);
  const [eventState, setEventState] = useState<EventReactiveState | null>(null);
  
  const [strategyLegs, setStrategyLegs] = useState<StrategyLeg[]>([]);
  const [userAvailableMargin, setUserAvailableMargin] = useState<number>(1000000);
  const [userMarginSource, setUserMarginSource] = useState<'LIVE' | 'PRACTICE'>('PRACTICE');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Reference to track latest request ID to eliminate out-of-order latency jumps
  const latestRequestIdRef = React.useRef<number>(0);

  const fetchSystemMargin = async () => {
    try {
      const res = await apiFetch('/api/system/margin');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (typeof data.available === 'number') {
            setUserAvailableMargin(data.available);
          }
          if (data.source) {
            setUserMarginSource(data.source);
          }
        }
      }
    } catch {
      // Graceful handling during initial warmup or network transition
    }
  };

  const fetchMarketData = async (symbolOverride?: string, expiryOverride?: string) => {
    const sym = symbolOverride || currentSymbol;
    const exp = expiryOverride !== undefined ? expiryOverride : selectedExpiry;
    const reqId = ++latestRequestIdRef.current;

    setIsRefreshing(true);
    try {
      const expiryParam = exp ? `&expiry=${encodeURIComponent(exp)}` : '';
      const [snapResult, anomResult, eventResult] = await Promise.allSettled([
        apiFetch(`/api/option-chain?symbol=${encodeURIComponent(sym)}${expiryParam}`),
        apiFetch(`/api/anomalies?symbol=${encodeURIComponent(sym)}`),
        apiFetch(`/api/event-reactive-state?symbol=${encodeURIComponent(sym)}`)
      ]);

      // If a newer request was dispatched while this was fetching, drop stale response
      if (reqId !== latestRequestIdRef.current) {
        return;
      }

      if (snapResult.status === 'fulfilled' && snapResult.value.ok) {
        const contentType = snapResult.value.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const snapData: OptionChainSnapshot = await snapResult.value.json();
          if (snapData && reqId === latestRequestIdRef.current) {
            setSnapshot(snapData);
            if (snapData.selectedExpiry && snapData.selectedExpiry !== selectedExpiry && expiryOverride === undefined && !selectedExpiry) {
              setSelectedExpiry(snapData.selectedExpiry);
            }
          }
        }
      }

      if (anomResult.status === 'fulfilled' && anomResult.value.ok && reqId === latestRequestIdRef.current) {
        const contentType = anomResult.value.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const anomData: OIAnomaly[] = await anomResult.value.json();
          if (Array.isArray(anomData)) {
            setAnomalies(anomData);
          }
        }
      }

      if (eventResult.status === 'fulfilled' && eventResult.value.ok && reqId === latestRequestIdRef.current) {
        const contentType = eventResult.value.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const eventData: EventReactiveState = await eventResult.value.json();
          if (eventData) {
            setEventState(eventData);
          }
        }
      }
    } catch {
      // Graceful handling during server startup or reload
    } finally {
      if (reqId === latestRequestIdRef.current) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchSystemMargin();
    const marginInterval = setInterval(fetchSystemMargin, 10000);
    return () => clearInterval(marginInterval);
  }, []);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(() => fetchMarketData(), 3000);
    return () => clearInterval(interval);
  }, [currentSymbol, selectedExpiry]);

  const handleSymbolChange = (newSymbol: string) => {
    if (newSymbol === currentSymbol) return;
    setCurrentSymbol(newSymbol);
    setSelectedExpiry('');
    fetchMarketData(newSymbol, '');
  };

  const handleExpiryChange = (newExpiry: string) => {
    if (newExpiry === selectedExpiry) return;
    setSelectedExpiry(newExpiry);
    fetchMarketData(currentSymbol, newExpiry);
  };

  const handleAddLeg = (leg: StrategyLeg) => {
    setStrategyLegs(prev => [...prev, leg]);
    setActiveTab('strategy');
  };

  const handleBasketExecuted = (basket: BasketOrderRecord) => {
    if (basket.status === 'COMPLETED') {
      fetchSystemMargin();
      setStrategyLegs([]); // Clear legs after execution
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        currentSymbol={currentSymbol}
        onSymbolChange={handleSymbolChange}
        snapshot={snapshot}
        eventState={eventState}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={() => fetchMarketData()}
        isRefreshing={isRefreshing}
      />

      {/* Main Body View */}
      <main className="max-w-7xl mx-auto px-4 py-4 pb-12">
        {activeTab === 'platform' && (
          <PersonalAiPlatformView
            onSelectSymbol={handleSymbolChange}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'chain' && (
          <OptionChainTable
            snapshot={snapshot}
            onExpiryChange={handleExpiryChange}
            onAddLeg={handleAddLeg}
          />
        )}

        {activeTab === 'strategy' && (
          <StrategyBuilder
            snapshot={snapshot}
            selectedLegs={strategyLegs}
            onUpdateLegs={setStrategyLegs}
            userAvailableMargin={userAvailableMargin}
            onBasketExecuted={handleBasketExecuted}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            snapshot={snapshot}
            anomalies={anomalies}
            eventState={eventState}
          />
        )}

        {activeTab === 'baskets' && (
          !user && !loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-2xl">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Authentication Required</h3>
              <p className="text-slate-400 text-xs">
                Basket Execution & Order Reconciliation are tied to individual user accounts. Please log in or sign up to access your basket history.
              </p>
              <button
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-lg"
              >
                <LogIn className="w-4 h-4" />
                <span>Log In / Sign Up</span>
              </button>
            </div>
          ) : (
            <BasketOrdersManager />
          )
        )}

        {activeTab === 'autonomous' && (
          !user && !loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-2xl">
              <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Authentication Required</h3>
              <p className="text-slate-400 text-xs">
                Autonomous Strategy Runner & Circuit Breaker controls require user identity isolation. Please log in to manage your automated strategies.
              </p>
              <button
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-lg"
              >
                <LogIn className="w-4 h-4" />
                <span>Log In / Sign Up</span>
              </button>
            </div>
          ) : (
            <AutonomousRunnerView />
          )
        )}

        {activeTab === 'paper' && (
          !user && !loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-2xl">
              <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Authentication Required</h3>
              <p className="text-slate-400 text-xs">
                Paper Trading Virtual Capital, positions, and account ledger are isolated per user. Please log in to manage your virtual portfolio.
              </p>
              <button
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-lg"
              >
                <LogIn className="w-4 h-4" />
                <span>Log In / Sign Up</span>
              </button>
            </div>
          ) : (
            <PaperTradingManager
              snapshot={snapshot}
            />
          )
        )}

        {activeTab === 'backtest' && (
          <BacktesterView />
        )}

        {activeTab === 'ai' && (
          <AiNarrationPanel
            snapshot={snapshot}
          />
        )}

        {activeTab === 'docs' && (
          <DocumentationView />
        )}
      </main>

      {/* High Density Status Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800/80 px-4 py-1 flex items-center justify-between text-[10px] font-mono text-slate-400 z-40 backdrop-blur-sm">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span className="text-slate-300">STREAM: CONNECTED</span>
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline">ENGINE: <strong className="text-cyan-400">DETERMINISTIC_GREEKS_v2</strong></span>
          <span className="hidden md:inline text-slate-600">|</span>
          <span className="hidden md:inline">INDEX STATUS: <strong className="text-emerald-400">FULLY AUTO-INDEXED</strong></span>
        </div>
        <div className="flex items-center space-x-3 text-slate-500">
          <span>LATENCY: <strong className="text-slate-300">12ms</strong></span>
          <span>TLS 1.3</span>
          <span className="text-cyan-400">DELTA_CHAIN</span>
        </div>
      </footer>
      <AuthModal />
    </div>
  );
}
