/**
 * Main Application Header & Symbol Switcher Bar
 */

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  ShieldAlert, 
  BarChart3, 
  Layers, 
  Database, 
  Cpu, 
  PlayCircle, 
  History, 
  RefreshCw, 
  Zap, 
  Bot, 
  User as UserIcon, 
  LogOut, 
  LogIn, 
  Compass, 
  Radio,
  Pin,
  PinOff,
  PanelTopClose,
  PanelTopOpen
} from 'lucide-react';
import { OptionChainSnapshot, EventReactiveState } from '../types.js';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
  snapshot: OptionChainSnapshot | null;
  eventState: EventReactiveState | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentSymbol,
  onSymbolChange,
  snapshot,
  eventState,
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing
}) => {
  const { user, logout, setAuthModalOpen } = useAuth();

  // Header visibility and freeze/sticky preferences with local persistence
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dc_header_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isSticky, setIsSticky] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dc_header_sticky');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Persist preferences
  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('dc_header_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const toggleSticky = () => {
    setIsSticky(prev => {
      const next = !prev;
      try {
        localStorage.setItem('dc_header_sticky', String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut: Press 'H' (when not in an input/textarea) to toggle header collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          toggleCollapse();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const symbols = [
    { name: 'NIFTY', type: 'Index F&O', badge: 'Index' },
    { name: 'BANKNIFTY', type: 'Index F&O', badge: 'Index' },
    { name: 'FINNIFTY', type: 'Index F&O', badge: 'Index' },
    { name: 'MIDCPNIFTY', type: 'Index F&O', badge: 'Index' },
    { name: 'RELIANCE', type: 'Equity / F&O', badge: 'Stock' },
    { name: 'TCS', type: 'Equity / F&O', badge: 'Stock' },
    { name: 'HDFCBANK', type: 'Equity / F&O', badge: 'Stock' },
    { name: 'TATAMOTORS', type: 'Equity / F&O', badge: 'Stock' },
    { name: 'GOLD', type: 'MCX Commodity', badge: 'MCX' },
    { name: 'CRUDEOIL', type: 'MCX Commodity', badge: 'MCX' }
  ];

  const tabs = [
    { id: 'platform', label: 'AI Platform (5 Pillars)', icon: Compass },
    { id: 'ema15m', label: '15m EMA Alerts', icon: Radio },
    { id: 'chain', label: 'Option Chain', icon: BarChart3 },
    { id: 'strategy', label: 'Strategy & Payoff', icon: Layers },
    { id: 'analytics', label: 'OI & Skew Analytics', icon: Activity },
    { id: 'baskets', label: 'Basket Orders', icon: Zap },
    { id: 'autonomous', label: 'Auto Runner', icon: Bot },
    { id: 'paper', label: 'Paper Trading', icon: PlayCircle },
    { id: 'backtest', label: 'Backtester', icon: History },
    { id: 'ai', label: 'AI Narrator', icon: Cpu },
    { id: 'docs', label: 'DB & Docs', icon: Database }
  ];

  const activeTabObj = tabs.find(t => t.id === activeTab) || tabs[0];
  const ActiveIcon = activeTabObj.icon;

  return (
    <>
      {/* Collapsed State: Minimal Floating Bar to restore header */}
      {isCollapsed && (
        <div className="sticky top-2 z-50 max-w-7xl mx-auto px-4 flex items-center justify-between pointer-events-none transition-all duration-300">
          <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-full px-3 py-1.5 shadow-2xl flex items-center space-x-3 text-xs font-mono">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-bold text-cyan-400">DELTA_CHAIN</span>
            </div>

            <div className="h-3 w-px bg-slate-700" />

            <div className="flex items-center space-x-1">
              <span className="text-slate-400 font-bold">{currentSymbol}:</span>
              <span className="font-bold text-slate-100">
                ₹{snapshot ? snapshot.spotPrice.toLocaleString('en-IN') : '...'}
              </span>
              {snapshot && (
                <span className={`text-[10px] font-bold ${snapshot.underlyingPChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {snapshot.underlyingPChange >= 0 ? '+' : ''}{snapshot.underlyingPChange}%
                </span>
              )}
            </div>

            <div className="h-3 w-px bg-slate-700 hidden sm:block" />

            <div className="hidden sm:flex items-center space-x-1.5 text-slate-300">
              <ActiveIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] uppercase">{activeTabObj.label}</span>
            </div>

            <div className="h-3 w-px bg-slate-700" />

            {/* Expand Full Header Button */}
            <button
              onClick={toggleCollapse}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 text-[11px] font-bold transition-colors shadow-sm"
              title="Show Full Header & Navigation (Shortcut: Press 'H')"
            >
              <PanelTopOpen className="w-3.5 h-3.5" />
              <span>Show Header (H)</span>
            </button>
          </div>
        </div>
      )}

      {/* Full Header Navigation (Normal or Sticky) */}
      {!isCollapsed && (
        <header className={`bg-slate-900/90 border-b border-slate-800 text-slate-100 backdrop-blur-md transition-all duration-200 ${
          isSticky ? 'sticky top-0 z-50 shadow-lg' : 'relative z-20'
        }`}>
          {/* Top Ticker & Symbol Switcher Bar */}
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 px-2.5 py-1 rounded">
                <div className="w-5 h-5 bg-cyan-500 rounded flex items-center justify-center text-slate-950 font-black text-xs italic tracking-tighter">
                  DC
                </div>
                <span className="font-semibold text-slate-100 text-xs tracking-tight">
                  DELTA_CHAIN <span className="text-cyan-400 text-[10px] font-mono">v1.0-stable</span>
                </span>
              </div>

              <div className="hidden sm:flex items-center space-x-1.5 bg-slate-800/80 px-2 py-1 rounded border border-slate-700/60">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-mono uppercase text-slate-300">SYSTEM: ACTIVE</span>
              </div>

              {/* User Authentication Badge / Account Controls */}
              {user ? (
                <div className="flex items-center space-x-2 bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name || user.email} className="w-4 h-4 rounded-full" />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 text-blue-400" />
                  )}
                  <span className="text-[11px] font-mono text-slate-200 max-w-[120px] truncate" title={user.email}>
                    {user.name || user.email.split('@')[0]}
                  </span>
                  <button
                    onClick={logout}
                    className="p-0.5 text-slate-400 hover:text-rose-400 transition-colors ml-1"
                    title="Log Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold px-2.5 py-1 rounded transition-colors shadow-sm"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>SIGN IN / REGISTER</span>
                </button>
              )}
            </div>

            {/* Symbol Selector Pills */}
            <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
              {symbols.map(s => (
                <button
                  key={s.name}
                  onClick={() => {
                    onSymbolChange(s.name);
                    fetch('/api/system/active-view', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ symbol: s.name })
                    }).catch(() => {});
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono uppercase font-bold transition-all duration-150 flex items-center space-x-1.5 ${
                    currentSymbol === s.name
                      ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-500/60 shadow-sm'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border border-slate-800'
                  }`}
                >
                  <span>{s.name}</span>
                  <span className="text-[9px] opacity-70 px-1 bg-slate-950/80 rounded border border-slate-800 text-slate-400">
                    {s.badge}
                  </span>
                </button>
              ))}
            </div>

            {/* Live Market Price & Ticker & View Controls */}
            <div className="flex items-center space-x-2">
              {snapshot && (
                <div className="flex items-center space-x-2.5 text-[11px] font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  <div>
                    <span className="text-slate-500 uppercase font-semibold text-[10px]">{snapshot.symbol} SPOT: </span>
                    <span className={`font-bold text-xs ml-1 ${snapshot.isSpotLive === false ? 'text-amber-300 italic' : 'text-slate-100'}`}>
                      ₹{snapshot.spotPrice.toLocaleString('en-IN')}
                    </span>
                    <span className={`ml-1 font-bold ${snapshot.underlyingPChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {snapshot.underlyingPChange >= 0 ? '+' : ''}{snapshot.underlyingPChange}%
                    </span>
                    {snapshot.isSpotLive === false && (
                      <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] font-extrabold bg-amber-950/90 text-amber-300 border border-amber-500/70 uppercase tracking-tighter" title="Spot price is a static fallback or stale quote">
                        STALE / FALLBACK
                      </span>
                    )}
                  </div>
                  <div className="h-3 w-px bg-slate-800" />
                  <div>
                    <span className="text-slate-500 uppercase font-semibold text-[10px]">VIX: </span>
                    <span className="font-bold text-amber-400 ml-0.5">{snapshot.indiaVix}</span>
                  </div>
                  <div className="h-3 w-px bg-slate-800 hidden md:block" />
                  <div className="hidden md:block">
                    <span className="text-slate-500 uppercase font-semibold text-[10px]">MAX PAIN: </span>
                    <span className="font-bold text-cyan-400 ml-0.5">₹{snapshot.maxPainStrike}</span>
                  </div>
                  <div className="h-3 w-px bg-slate-800 hidden md:block" />
                  <div className="hidden md:block">
                    <span className="text-slate-500 uppercase font-semibold text-[10px]">PCR: </span>
                    <span className={`font-bold ml-0.5 ${snapshot.pcrOI >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {snapshot.pcrOI}
                    </span>
                  </div>

                  <button
                    onClick={onRefresh}
                    className={`p-1 hover:bg-slate-800 rounded transition-colors ${isRefreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`}
                    title="Refresh Market Feed"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* View Control Buttons: Sticky/Unfreeze & Hide/Collapse */}
              <div className="flex items-center space-x-1 bg-slate-950/90 border border-slate-800 rounded px-1.5 py-0.5">
                {/* Freeze / Unfreeze Scroll Toggle Button */}
                <button
                  onClick={toggleSticky}
                  className={`flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                    isSticky 
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-600/40 hover:bg-cyan-900' 
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title={isSticky ? "Frozen at top during scroll (Click to Unfreeze/Scroll naturally with page)" : "Scrolls naturally with page (Click to Freeze at top)"}
                >
                  {isSticky ? (
                    <>
                      <Pin className="w-3 h-3 text-cyan-400 fill-cyan-400/20" />
                      <span className="hidden sm:inline">Frozen (Sticky)</span>
                    </>
                  ) : (
                    <>
                      <PinOff className="w-3 h-3 text-slate-400" />
                      <span className="hidden sm:inline">Unfrozen (Normal)</span>
                    </>
                  )}
                </button>

                {/* Hide / Collapse Header Button */}
                <button
                  onClick={toggleCollapse}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700/60 hover:border-rose-500/50 transition-colors"
                  title="Hide Header to maximize chart / screen height (Shortcut: Press 'H')"
                >
                  <PanelTopClose className="w-3.5 h-3.5" />
                  <span>Hide (H)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Broker Connection Warning Strip if Disconnected */}
          {snapshot && snapshot.isBrokerConnected === false && (
            <div className="bg-rose-950/60 border-b border-rose-500/50 px-4 py-1.5 text-xs text-rose-300 flex items-center justify-between font-mono">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>
                  <strong>BROKER DISCONNECTED:</strong> {snapshot.brokerStatusMessage || 'Broker not connected — live data unavailable.'} Set UPSTOX_API_KEY and UPSTOX_ACCESS_TOKEN in environment variables to stream live data.
                </span>
              </div>
            </div>
          )}

          {/* Event-Reactive Alert Strip if Shock Event active */}
          {eventState?.isFastPollActive && (
            <div className="bg-amber-950/40 border-b border-amber-500/40 px-4 py-1 text-[11px] text-amber-300 flex items-center justify-between font-mono">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                <span>
                  <strong className="uppercase">EVENT-REACTIVE MODE:</strong> Spot shock ({eventState.lastShockMagnitude > 0 ? '+' : ''}{eventState.lastShockMagnitude}%) | Institutional Bias: <strong>{eventState.institutionalBias}</strong>
                </span>
              </div>
              <span>Cooldown: {eventState.cooldownRemainingSec}s</span>
            </div>
          )}

          {/* Main Navigation Tabs */}
          <nav className="max-w-7xl mx-auto px-4 flex items-center space-x-1 overflow-x-auto py-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-3 py-1.5 rounded text-[11px] font-mono uppercase font-bold tracking-wider flex items-center space-x-2 transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-cyan-400 border border-cyan-500/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </header>
      )}
    </>
  );
};
