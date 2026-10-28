/**
 * Upstox Broker Integration & Connection Manager Modal
 * Features:
 * - Real-time WebSocket V3 Protobuf Streamer status & latency
 * - 1-Click Fast OAuth Authorization
 * - On-demand 0-Click Headless TOTP test
 * - Direct Access Token insertion & validation (/api/upstox/set-token)
 * - Local Residential Bridge daemon instructions
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Radio, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ExternalLink, 
  Key, 
  Terminal, 
  ShieldCheck, 
  Zap,
  Copy,
  Clock,
  Activity
} from 'lucide-react';

interface UpstoxBrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionChange?: () => void;
}

interface AuthStatus {
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasMobile: boolean;
  hasPin: boolean;
  hasTotpSecret: boolean;
  hasAccessToken: boolean;
  tokenExpiry?: string;
  lastRefreshTime?: string;
  lastRefreshStatus?: 'SUCCESS' | 'FAILED' | 'IDLE';
  lastRefreshMessage?: string;
}

interface StreamerStatus {
  connected: boolean;
  tokenExpired: boolean;
  protocol: string;
  totalTicksReceived: number;
  lastTickTime: string | null;
  latencyMs: number;
  subscribedKeysCount: number;
  reconnectAttempts: number;
  lastError?: string;
}

export const UpstoxBrokerModal: React.FC<UpstoxBrokerModalProps> = ({
  isOpen,
  onClose,
  onConnectionChange
}) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [streamerStatus, setStreamerStatus] = useState<StreamerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingLogin, setTestingLogin] = useState(false);
  const [loginTestResult, setLoginTestResult] = useState<any>(null);
  const [manualToken, setManualToken] = useState('');
  const [tokenSubmitting, setTokenSubmitting] = useState(false);
  const [tokenSubmitMessage, setTokenSubmitMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const fetchStatuses = async () => {
    try {
      setLoading(true);
      const [authRes, streamerRes] = await Promise.all([
        fetch('/api/upstox/status'),
        fetch('/api/upstox/streamer-status')
      ]);
      if (authRes.ok) setAuthStatus(await authRes.json());
      if (streamerRes.ok) setStreamerStatus(await streamerRes.json());
    } catch (e) {
      console.warn('Failed to fetch broker statuses:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatuses();
      const interval = setInterval(fetchStatuses, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    try {
      setTokenSubmitting(true);
      setTokenSubmitMessage(null);
      const res = await fetch('/api/upstox/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: manualToken.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTokenSubmitMessage({ success: true, text: data.message || 'Token updated and verified successfully!' });
        setManualToken('');
        fetchStatuses();
        if (onConnectionChange) onConnectionChange();
      } else {
        setTokenSubmitMessage({ success: false, text: data.message || 'Failed to validate token with Upstox API' });
      }
    } catch (err: any) {
      setTokenSubmitMessage({ success: false, text: err.message || 'Network error applying token' });
    } finally {
      setTokenSubmitting(false);
    }
  };

  const handleTriggerAutoLogin = async () => {
    try {
      setTestingLogin(true);
      setLoginTestResult(null);
      const res = await fetch('/api/upstox/auto-login', { method: 'POST' });
      const data = await res.json();
      setLoginTestResult({
        status: res.ok ? 'success' : 'error',
        ...data
      });
      fetchStatuses();
      if (onConnectionChange) onConnectionChange();
    } catch (err: any) {
      setLoginTestResult({
        status: 'error',
        message: err.message || 'Network error executing auto-login'
      });
    } finally {
      setTestingLogin(false);
    }
  };

  const copyLocalCommand = () => {
    navigator.clipboard.writeText('npm run auth:local');
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  if (!isOpen) return null;

  const isConnected = streamerStatus?.connected || (authStatus?.hasAccessToken && !streamerStatus?.tokenExpired);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden font-mono flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-lg ${isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                Upstox Broker Connection Manager
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                  {isConnected ? 'LIVE CONNECTED' : 'AUTHORIZATION REQUIRED'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">WebSocket V3 Protobuf Streamer & Automated 04:00 AM IST Session Pipeline</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto">

          {/* Real-Time Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Streamer Feed</span>
              <span className={`text-xs font-bold mt-1 flex items-center gap-1.5 ${streamerStatus?.connected ? 'text-emerald-400' : 'text-rose-400'}`}>
                <span className={`w-2 h-2 rounded-full ${streamerStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                {streamerStatus?.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Latency / Ticks</span>
              <span className="text-xs font-bold text-slate-200 mt-1 block">
                {streamerStatus?.latencyMs || 0}ms <span className="text-slate-500 font-normal">({streamerStatus?.totalTicksReceived || 0} ticks)</span>
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Token Expiry</span>
              <span className="text-xs font-bold text-amber-300 mt-1 block">
                03:30 AM IST <span className="text-slate-500 font-normal">(Daily)</span>
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Credentials</span>
              <span className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {authStatus?.hasTotpSecret ? 'TOTP Active' : 'API Key Only'}
              </span>
            </div>
          </div>

          {/* Quick Connect & 1-Click Fast Actions */}
          <div className="bg-slate-800/40 border border-slate-700/80 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Primary Actions
              </h3>
              <button 
                onClick={fetchStatuses} 
                disabled={loading}
                className="text-[11px] text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh State
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* 1-Click Authorization Button */}
              <a
                href="/api/upstox/authorize"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-lg shadow-lg shadow-amber-500/10 transition-all text-center"
              >
                <span>⚡ 1-Click Fast Connect</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              {/* Headless 0-Click Test Trigger */}
              <button
                onClick={handleTriggerAutoLogin}
                disabled={testingLogin}
                className="flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-xs py-2.5 px-4 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingLogin ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
                <span>{testingLogin ? 'Testing Headless Auth...' : 'Test 0-Click Refresh'}</span>
              </button>
            </div>

            {loginTestResult && (
              <div className={`mt-3 p-3 rounded-lg border text-[11px] space-y-1.5 ${loginTestResult.status === 'success' ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-950 border-amber-500/30 text-slate-300'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  {loginTestResult.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>{loginTestResult.message}</span>
                </div>
                {loginTestResult.totpCode && (
                  <p className="text-slate-400 text-[10px]">Active Dynamic TOTP: <code className="text-cyan-300 font-bold">{loginTestResult.totpCode}</code></p>
                )}
                {loginTestResult.fallbackUrl && (
                  <a href={loginTestResult.fallbackUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline inline-flex items-center gap-1 text-[11px]">
                    Open 1-Click Authorization Link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Option: Direct Access Token Injection */}
          <div className="bg-slate-800/40 border border-slate-700/80 p-4 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              Direct Access Token Apply
            </h3>
            <p className="text-[11px] text-slate-400">
              Have an active token from Upstox Developer Portal? Paste it below to connect the live feed immediately.
            </p>
            <form onSubmit={handleManualTokenSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste Upstox Bearer Access Token..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={tokenSubmitting || !manualToken.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors shrink-0"
              >
                {tokenSubmitting ? 'Verifying...' : 'Apply Token'}
              </button>
            </form>
            {tokenSubmitMessage && (
              <p className={`text-[11px] font-semibold ${tokenSubmitMessage.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {tokenSubmitMessage.text}
              </p>
            )}
          </div>

          {/* Option: Residential Zero-Click Bridge Daemon */}
          <div className="bg-slate-800/40 border border-slate-700/80 p-4 rounded-xl space-y-2.5">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Residential Zero-Click Sync (For 100% Unattended Auto-Login)
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              To bypass Upstox Cloudflare datacenter bot protection with zero manual clicks, run the residential sync daemon on your home PC or Mac:
            </p>
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2.5">
              <code className="text-emerald-400 text-xs">npm run auth:local</code>
              <button
                onClick={copyLocalCommand}
                className="p-1 rounded text-slate-400 hover:text-cyan-400 transition-colors"
                title="Copy Command"
              >
                {copiedCmd ? <span className="text-[10px] text-emerald-400 font-bold">Copied!</span> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              This executes 2FA locally from your residential IP, retrieves the token, and automatically syncs it to this server via <code className="text-slate-400">/api/upstox/set-token</code>.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Next Scheduled Cron: <b>04:00 AM IST</b></span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
