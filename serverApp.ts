/**
 * Option Chain Trading Platform - Full Stack Express Server
 * Serves deterministic option math engine, margin/basket execution API,
 * auto-indexed SQLite database, and Gemini AI narration layer.
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { dbEngine } from './src/server/db.js';
import { globalMarketFeed } from './src/server/engine/marketFeed.js';
import { activeProvider } from './src/server/engine/providers/index.js';
import { calculateOrderAndBasketMargin } from './src/server/engine/marginEngine.js';
import { globalBasketEngine } from './src/server/engine/basketEngine.js';
import { runOptionBacktest } from './src/server/engine/backtestEngine.js';
import { startFullHistoricalSync, getSyncStatus } from './src/server/engine/historicalService.js';
import { generateAiNarration } from './src/server/ai/narrator.js';
import { globalAutonomousEngine } from './src/server/engine/autonomousEngine.js';
import { globalStrategyPlatformEngine } from './src/server/engine/strategyPlatformEngine.js';
import { globalEma15mEngine } from './src/server/engine/ema15mEngine.js';
import { globalNotificationService } from './src/server/engine/notificationService.js';
import { PaperPosition, TradingPillarId, Ema15mInstrument } from './src/types.js';
import cookieParser from 'cookie-parser';
import { authRouter, attachUser, getUserFromRequest, requireAuth, requireSuperAdmin } from './src/server/auth.js';
import { quantRouter } from './src/quant/api/quantRouter.js';
import { performUpstoxTOTPLogin, getUpstoxAuthStatus, initializeUpstoxAutoRefreshCron, setManualAccessToken } from './src/server/engine/upstoxAuthService.js';
import { globalUpstoxStreamer } from './src/server/engine/upstoxStreamerV3.js';
import { PRIMARY_COVERAGE_SYMBOLS } from './src/shared/marketConfig.js';
import { quantScheduler } from './src/quant/scheduler/quantScheduler.js';
import { tradeReviewEngine } from './src/quant/learning/tradeReviewEngine.js';
import { liveExecutionService } from './src/server/engine/ema15m/liveExecutionService.js';
import { getNrmlLiveStatus } from './src/server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';
import {
  reviewNrmlBrokerReadOnly
} from './src/server/engine/ema15m/adaptiveNrmlBrokerSnapshotAudit.js';
import {reviewNrmlGttChildReadOnly} from
  './src/server/engine/ema15m/adaptiveNrmlGttChildLineageAudit.js';
import {reviewNrmlRestartReadOnly} from
  './src/server/engine/ema15m/adaptiveNrmlRestartQuarantine.js';
import {reviewBrokerExitFillReadOnly} from
  './src/server/engine/ema15m/adaptiveLiveExitSettlementAudit.js';
import {prepareDurableSellChildEvidence} from
  './src/server/engine/ema15m/adaptiveDurableSellChildEvidence.js';
import {previewDurableExitSettlement} from
  './src/server/engine/ema15m/adaptiveExitSettlementPreview.js';
import {fetchOriginalBuyTradeEvidenceReadOnly} from
  './src/server/engine/ema15m/adaptiveDurableBuyTradeEvidence.js';
import { getAdaptiveResearchPreview, type AdaptiveInstrument } from './src/server/engine/ema15m/adaptiveResearchService.js';

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(attachUser);
app.use('/api/auth', authRouter);
// Quant actions and EMA trade/account data require a verified login.
app.use('/api/quant', requireAuth as any, quantRouter);
app.use('/api/ema15m', requireAuth as any);

// Authenticate and attach user (with guest/session fallback for paper trading)
app.use(['/api/basket', '/api/autonomous'], requireAuth as any);

// Paper Trading Virtual Terminal Engine
const PAPER_VIRTUAL_CAPITAL = 1000000; // 10 Lakhs Initial Virtual Capital

async function getPaperPortfolioData(userId?: string | null, limit?: number, offset?: number) {
  const allPositions = dbEngine.loadAllPaperPositions(userId, limit, offset);
  const openPositions = allPositions.filter(p => p.status === 'OPEN');
  const closedPositions = allPositions.filter(p => p.status === 'CLOSED');

  // Group positions by strategyGroupId (fallback to id if missing)
  const groupsMap = new Map<string, PaperPosition[]>();
  for (const pos of allPositions) {
    const gid = pos.strategyGroupId || pos.id;
    if (!groupsMap.has(gid)) {
      groupsMap.set(gid, []);
    }
    groupsMap.get(gid)!.push(pos);
  }

  const groups: any[] = [];
  let winCount = 0;
  let lossCount = 0;

  for (const [gid, legs] of groupsMap.entries()) {
    const openLegs = legs.filter(l => l.status === 'OPEN');
    const closedLegs = legs.filter(l => l.status === 'CLOSED');
    let status: 'OPEN' | 'CLOSED' | 'PARTIAL' = 'OPEN';

    if (openLegs.length === 0) {
      status = 'CLOSED';
    } else if (closedLegs.length > 0) {
      status = 'PARTIAL';
    }

    const netPnl = legs.reduce((sum, l) => sum + (l.pnl || 0), 0);
    const earliestOpenedAt = legs.reduce((earliest, l) => (l.openedAt < earliest ? l.openedAt : earliest), legs[0]?.openedAt || new Date().toISOString());

    groups.push({
      strategyGroupId: gid,
      strategyName: legs[0]?.strategyName || 'Multi-Leg Strategy',
      symbol: legs[0]?.symbol || 'NIFTY',
      status,
      legs,
      netPnl: Number(netPnl.toFixed(2)),
      openedAt: earliestOpenedAt
    });

    if (status === 'CLOSED') {
      if (netPnl >= 0) {
        winCount++;
      } else {
        lossCount++;
      }
    }
  }

  const realizedPnl = Number(closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0).toFixed(2));
  const unrealizedPnl = Number(openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0).toFixed(2));

  let usedMargin = 0;
  if (openPositions.length > 0) {
    try {
      const marginReq = {
        symbol: openPositions[0].symbol,
        legs: openPositions.map(p => {
          const lSize = p.lotSize || 50;
          return {
            symbol: p.symbol,
            strikePrice: p.strikePrice,
            type: p.type,
            action: p.action,
            quantity: Math.max(1, Math.round(p.quantity / lSize)),
            lotSize: lSize,
            price: p.currentPrice,
            product: 'NRML' as const
          };
        }),
        userAvailableMargin: PAPER_VIRTUAL_CAPITAL + realizedPnl
      };
      const marginRes = await calculateOrderAndBasketMargin(marginReq);
      usedMargin = marginRes.basketMargin || marginRes.standaloneMargin || 0;
    } catch (e) {
      usedMargin = openPositions.reduce((sum, p) => sum + (p.entryPrice * p.quantity * 0.1), 0);
    }
  }

  const availableMargin = Math.max(0, Number((PAPER_VIRTUAL_CAPITAL + realizedPnl - usedMargin + unrealizedPnl).toFixed(2)));

  const ledger = {
    totalCapital: PAPER_VIRTUAL_CAPITAL,
    availableMargin,
    usedMargin: Number(usedMargin.toFixed(2)),
    unrealizedPnl,
    realizedPnl,
    winCount,
    lossCount
  };

  return {
    ledger,
    positions: openPositions,
    closedPositions,
    groups
  };
}

function updatePaperPositionsMTM(targetUserId?: string | null) {
  const openPositions = dbEngine.getAllOpenPaperPositionsForMtm(targetUserId);
  if (!openPositions || openPositions.length === 0) return;

  const toUpdate: Array<{ id: string; currentPrice: number; pnl: number }> = [];
  const toClose: Array<{ id: string; exitPrice: number; pnl: number; reason: string }> = [];

  for (const pos of openPositions) {
    try {
      const snap = globalMarketFeed.getSnapshot(pos.symbol);
      if (snap) {
        if (pos.strikePrice && pos.strikePrice > 0) {
          // Option contract lookup
          if (snap.strikes && snap.strikes.length > 0) {
            const row = snap.strikes.find(s => s.strikePrice === pos.strikePrice);
            if (row) {
              const contract = pos.type === 'CE' ? row.ce : row.pe;
              const isAvailable = !!contract && contract.available === true && contract.ltpAvailable === true;
              if (isAvailable && contract.ltp > 0) {
                pos.currentPrice = contract.ltp;
              }
            }
          }
        } else {
          // Equity / Future / Spot instrument lookup
          if (snap.spotPrice && snap.spotPrice > 0) {
            pos.currentPrice = snap.spotPrice;
          }
        }

        // Calculate PnL
        if (pos.currentPrice > 0) {
          if (pos.action === 'BUY') {
            pos.pnl = Number(((pos.currentPrice - pos.entryPrice) * pos.quantity).toFixed(2));
            pos.pnlPercent = pos.entryPrice > 0 ? Number((((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2)) : 0;
          } else {
            pos.pnl = Number(((pos.entryPrice - pos.currentPrice) * pos.quantity).toFixed(2));
            pos.pnlPercent = pos.entryPrice > 0 ? Number((((pos.entryPrice - pos.currentPrice) / pos.entryPrice) * 100).toFixed(2)) : 0;
          }
        }
      }
    } catch (e) {
      // Ignore calculation errors
    }

    // Auto SL / TP check with domain consistency guard
    let autoCloseReason: string | null = null;
    const isOption = pos.strikePrice && pos.strikePrice > 0;
    
    // Guard against corrupt spot SL placed on option premium (e.g. SL = 24800 on an option worth 100)
    const isSaneStopLoss = pos.stopLoss && pos.stopLoss > 0 && (!isOption || pos.stopLoss < pos.entryPrice * 3.5);
    const isSaneTarget = pos.targetPrice && pos.targetPrice > 0 && (!isOption || pos.targetPrice < pos.entryPrice * 10);

    if (isSaneStopLoss && pos.stopLoss && pos.currentPrice > 0) {
      if (pos.action === 'BUY' && pos.currentPrice <= pos.stopLoss) autoCloseReason = 'Stop Loss Hit';
      if (pos.action === 'SELL' && pos.currentPrice >= pos.stopLoss) autoCloseReason = 'Stop Loss Hit';
    }
    if (isSaneTarget && pos.targetPrice && pos.currentPrice > 0) {
      if (pos.action === 'BUY' && pos.currentPrice >= pos.targetPrice) autoCloseReason = 'Target Hit';
      if (pos.action === 'SELL' && pos.currentPrice <= pos.targetPrice) autoCloseReason = 'Target Hit';
    }

    if (autoCloseReason) {
      toClose.push({
        id: pos.id,
        exitPrice: pos.currentPrice,
        pnl: pos.pnl,
        reason: autoCloseReason
      });
      try {
        tradeReviewEngine.recordFromPaperPosition(
          pos,
          pos.currentPrice,
          pos.pnl,
          autoCloseReason,
          new Date().toISOString()
        );
      } catch (err) {
        console.error('[MTM AUTO-CLOSE] Error recording trade review:', err);
      }
    } else {
      toUpdate.push({
        id: pos.id,
        currentPrice: pos.currentPrice,
        pnl: pos.pnl
      });
    }
  }

  dbEngine.batchUpdatePaperPositionsMtm({ toUpdate, toClose });
}

// Background MTM interval every 5 seconds (5000ms)
setInterval(() => {
  try {
    updatePaperPositionsMTM();
  } catch (err) {
    console.error('Error in paper trading MTM loop:', err);
  }
}, 5000);

async function startServer() {
  // Initialize Auto-Indexed SQLite Database Engine
  await dbEngine.initialize();

  // -------------------------------------------------------------
  // API ENDPOINTS
  // -------------------------------------------------------------

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Task 4: Comprehensive System Health Endpoint (Extended for Phase I Background Collection)
  app.get('/api/system/health', (req, res) => {
    try {
      const mode = activeProvider.getProviderMode();
      const brokerStatus = globalMarketFeed.getBrokerStatus();
      const rowCounts = dbEngine.getTableRowCounts();
      const activeView = globalMarketFeed.getActiveView();
      const backgroundStatus = globalMarketFeed.getBackgroundCollectionStatus();
      const collectionCoverage = dbEngine.getSymbolCollectionCoverage();

      let subSources = {
        practiceEngine: mode === 'PRACTICE',
        nseOptionChain: mode === 'PRACTICE',
        upstoxBroker: mode === 'LIVE' && brokerStatus.isConnected
      };

      // Merge last capture time from memory with SQLite persistence stats per symbol
      const symbolHealth: Record<string, any> = {};
      const allSymbols = PRIMARY_COVERAGE_SYMBOLS;
      for (const sym of allSymbols) {
        const dbStats = collectionCoverage[sym] || { lastPersistedAt: null, totalChainRows: 0, totalTicks: 0, distinctDays: 0 };
        symbolHealth[sym] = {
          lastCapturedInMemory: backgroundStatus.lastCaptureTimes[sym] || null,
          lastPersistedAtDB: dbStats.lastPersistedAt,
          totalChainRows: dbStats.totalChainRows,
          totalSpotTicks: dbStats.totalTicks,
          distinctDaysHistory: dbStats.distinctDays,
          isActivelyViewed: globalMarketFeed.isSymbolActivelyViewed(sym)
        };
      }

      res.json({
        status: 'ok',
        mode,
        connectionStatus: {
          overallConnected: brokerStatus.isConnected,
          statusMessage: brokerStatus.message,
          subSources
        },
        activeView,
        backgroundCollection: {
          intervalPerSymbolSec: backgroundStatus.intervalPerSymbolSec,
          fullCycleSec: backgroundStatus.fullCycleSec,
          symbolCount: backgroundStatus.symbolCount,
          symbols: symbolHealth
        },
        lastRefresh: new Date().toISOString(),
        rowCounts,
        websocket: {
          enabled: mode === 'LIVE',
          connected: mode === 'LIVE' && brokerStatus.isConnected
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Task 1: Active View Endpoint for Frontend Polling Optimization
  app.post('/api/system/active-view', (req, res) => {
    try {
      const { symbol, expiry } = req.body;
      if (symbol) {
        globalMarketFeed.setActiveView(symbol, expiry);
      }
      res.json({ success: true, activeView: globalMarketFeed.getActiveView(symbol) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/system/active-view', (req, res) => {
    const symbol = req.query.symbol as string | undefined;
    res.json(globalMarketFeed.getActiveView(symbol));
  });

  // Helper to determine the effective public base URL for OAuth callbacks
  const getEffectiveBaseUrl = (req?: express.Request): string => {
    if (req) {
      const fProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const fHost = (req.headers['x-forwarded-host'] as string) || req.get('host');
      if (fHost && !fHost.includes('localhost') && !fHost.includes('0.0.0.0')) {
        return `${fProto}://${fHost}`;
      }
    }
    if (process.env.UPSTOX_REDIRECT_URI) {
      try {
        const u = new URL(process.env.UPSTOX_REDIRECT_URI);
        return `${u.protocol}//${u.host}`;
      } catch {}
    }
    if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL') && !process.env.APP_URL.includes('localhost')) {
      return process.env.APP_URL.replace(/\/$/, '');
    }
    return 'https://option-chain-trading-platform.ai.studio';
  };

  // Upstox Login Redirect Handler
  app.get('/api/upstox/login', requireSuperAdmin as any, (req, res) => {
    const apiKey = process.env.UPSTOX_API_KEY;
    const baseUrl = getEffectiveBaseUrl(req);
    const redirectUri = process.env.UPSTOX_REDIRECT_URI || `${baseUrl}/api/upstox/callback`;

    if (!apiKey) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px;">
            <h2 style="color: #f43f5e;">Missing UPSTOX_API_KEY</h2>
            <p>Please set <code>UPSTOX_API_KEY</code> and <code>UPSTOX_API_SECRET</code> environment variables first.</p>
          </body>
        </html>
      `);
    }

    const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(apiKey)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(authUrl);
  });

  // Upstox Authorize Route Alias (1-Click Fallback Redirect)
  app.get('/api/upstox/authorize', (req, res) => {
    res.redirect('/api/upstox/login');
  });

  // Upstox Login Callback Handler
  app.get('/api/upstox/callback', requireSuperAdmin as any, async (req, res) => {
    const code = req.query.code as string;
    const apiKey = process.env.UPSTOX_API_KEY;
    const apiSecret = process.env.UPSTOX_API_SECRET;
    const baseUrl = getEffectiveBaseUrl(req);
    const redirectUri = process.env.UPSTOX_REDIRECT_URI || `${baseUrl}/api/upstox/callback`;

    if (!code) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px;">
            <h2 style="color: #f43f5e;">Missing authorization code</h2>
            <p>Upstox login redirect did not supply a code parameter.</p>
          </body>
        </html>
      `);
    }

    if (!apiKey || !apiSecret) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px;">
            <h2 style="color: #f43f5e;">Missing UPSTOX_API_KEY or UPSTOX_API_SECRET</h2>
            <p>Please set <code>UPSTOX_API_KEY</code> and <code>UPSTOX_API_SECRET</code> environment variables first.</p>
          </body>
        </html>
      `);
    }

    try {
      const tokenRes = await fetch('https://api.upstox.com/v2/login/authorization/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          code,
          client_id: apiKey,
          client_secret: apiSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });

      const tokenJson: any = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(tokenJson.errors?.[0]?.message || tokenJson.message || 'Failed to exchange authorization code for access token');
      }

      const accessToken = tokenJson.access_token;

      // Automatically activate, validate, connect streamer, persist to .env, and notify Telegram
      await setManualAccessToken(accessToken);

      // Return instant 1-second auto-redirect back to terminal
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Upstox Connected</title>
            <meta http-equiv="refresh" content="2;url=/">
            <style>
              body {
                margin: 0;
                height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #020617;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                color: #f8fafc;
              }
              .card {
                background: #0f172a;
                border: 1px solid #10b981;
                border-radius: 16px;
                padding: 36px 44px;
                text-align: center;
                box-shadow: 0 25px 50px -12px rgba(16, 185, 129, 0.25);
                max-width: 460px;
              }
              .badge {
                display: inline-block;
                background: #064e3b;
                color: #34d399;
                font-weight: 700;
                font-size: 11px;
                padding: 4px 12px;
                border-radius: 9999px;
                text-transform: uppercase;
                margin-bottom: 16px;
                letter-spacing: 0.05em;
              }
              h1 { font-size: 20px; color: #10b981; margin: 0 0 8px; font-weight: 800; }
              p { color: #94a3b8; font-size: 13px; margin: 0 0 20px; line-height: 1.5; }
              .spinner {
                width: 28px;
                height: 28px;
                border: 3px solid #1e293b;
                border-top-color: #10b981;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 16px;
              }
              @keyframes spin { to { transform: rotate(360deg); } }
              a {
                display: inline-block;
                background: #10b981;
                color: #020617;
                font-weight: bold;
                text-decoration: none;
                padding: 9px 24px;
                border-radius: 8px;
                font-size: 12px;
                transition: opacity 0.2s;
              }
              a:hover { opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">1-Tap Fast Connect Success</div>
              <div class="spinner"></div>
              <h1>Upstox Streamer Connected!</h1>
              <p>WebSocket V3 Protobuf market feed is active.<br>Redirecting you to Delta Chain Terminal...</p>
              <a href="/">Return to Terminal Now</a>
            </div>
            <script>
              setTimeout(() => { window.location.replace('/'); }, 1200);
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px;">
            <h2 style="color: #f43f5e;">Upstox Session Generation Failed</h2>
            <p>Error: ${err.message || 'Invalid authorization code or credentials'}</p>
          </body>
        </html>
      `);
    }
  });

  // Upstox Auth Status (Credentials check, Token health, Expiry)
  app.get('/api/upstox/status', (req, res) => {
    const status = getUpstoxAuthStatus();
    res.json(status);
  });

  // Upstox V3 WebSocket Streamer Status (Zero-lag Protobuf stream metrics)
  app.get('/api/upstox/streamer-status', (req, res) => {
    res.json(globalUpstoxStreamer.getStatus());
  });

  // Upstox Automated TOTP Login Trigger (Executes headless TOTP refresh)
  app.post('/api/upstox/auto-login', requireSuperAdmin as any, async (req, res) => {
    try {
      const serverBaseUrl = getEffectiveBaseUrl(req);
      const result = await performUpstoxTOTPLogin(serverBaseUrl);
      if (result.success) {
        res.json({
          status: 'success',
          message: result.message,
          expiresAt: result.expiresAt
        });
      } else {
        res.status(result.error === 'MISSING_API_CREDENTIALS' || result.error === 'MISSING_TOTP_CREDENTIALS' ? 400 : 422).json({
          status: 'error',
          message: result.message,
          error: result.error,
          fallbackUrl: result.fallbackUrl
        });
      }
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err.message || 'Failed to execute automated TOTP login'
      });
    }
  });

  // Upstox Set Token Endpoint (Sync token from residential bridge daemon or manual input)
  app.post('/api/upstox/set-token', requireSuperAdmin as any, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = req.body.accessToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
      if (!token) {
        return res.status(400).json({ success: false, message: 'Missing accessToken in body or Bearer token in Authorization header' });
      }

      const result = await setManualAccessToken(token);
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get Live Option Chain Snapshot with Black-Scholes Greeks, Max Pain, PCR
  app.get('/api/option-chain', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'NIFTY';
      const expiry = req.query.expiry as string | undefined;
      const snapshot = await globalMarketFeed.getSnapshotAsync(symbol, expiry);
      res.json(snapshot);
    } catch (err: any) {
      console.warn('[OPTION CHAIN API WARN] Fallback to sync snapshot:', err?.message);
      try {
        const symbol = (req.query.symbol as string) || 'NIFTY';
        const expiry = req.query.expiry as string | undefined;
        const snapshot = globalMarketFeed.getSnapshot(symbol, expiry);
        res.json(snapshot);
      } catch (fallbackErr: any) {
        res.status(500).json({ error: fallbackErr.message });
      }
    }
  });

  // Get Statistically Significant Unusual OI Anomalies (>2.0σ)
  app.get('/api/anomalies', (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'NIFTY';
      const anomalies = globalMarketFeed.getAnomalies(symbol);
      res.json(anomalies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Event-Reactive Shock & IV Skew Divergence State
  app.get('/api/event-reactive-state', (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'NIFTY';
      const state = globalMarketFeed.getEventReactiveState(symbol);
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========================================================
  // 5-PILLAR PERSONAL AI TRADING PLATFORM REST API ENDPOINTS
  // ========================================================

  // 1. Get 5-Pillar Taxonomy and Strategy Blueprints
  app.get('/api/platform/taxonomy', (req, res) => {
    try {
      const taxonomy = globalStrategyPlatformEngine.getTaxonomy();
      res.json(taxonomy);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get Live Multi-Asset Universe Quotes & Indicators
  app.get('/api/platform/asset-universe', (req, res) => {
    try {
      const assetClass = req.query.assetClass as string | undefined;
      const assets = globalStrategyPlatformEngine.getAssetUniverse(assetClass);
      res.json(assets);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get Real-Time Strategy Scanner Signals
  app.get('/api/platform/signals', (req, res) => {
    try {
      const pillarId = req.query.pillar as TradingPillarId | undefined;
      const signals = globalStrategyPlatformEngine.getLiveSignals(pillarId);
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Get Sector Rotation Momentum Matrix
  app.get('/api/platform/sector-rotation', (req, res) => {
    try {
      const sectors = globalStrategyPlatformEngine.getSectorRotation();
      res.json(sectors);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. One-Click Execute Strategy Signal into Paper Trading
  app.post('/api/platform/execute-signal', async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const { signal } = req.body;
      if (!signal) {
        return res.status(400).json({ error: 'Signal object is required' });
      }

      const timestamp = new Date().toISOString();
      const strategyGroupId = `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const positionsCreated: PaperPosition[] = [];

      // If signal contains multi-leg options
      if (signal.legs && signal.legs.length > 0) {
        for (const leg of signal.legs) {
          const posId = `pos-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const legEntry = leg.entryPrice || leg.currentLtp || 100;
          // Calculate realistic option premium Stop Loss & Target (Options use premium points, not spot price)
          const optionSl = leg.action === 'BUY' 
            ? Number((legEntry * 0.65).toFixed(1)) 
            : Number((legEntry * 1.45).toFixed(1));
          const optionTarget = leg.action === 'BUY' 
            ? Number((legEntry * 1.50).toFixed(1)) 
            : Number((legEntry * 0.25).toFixed(1));

          const newPos: PaperPosition = {
            id: posId,
            strategyGroupId,
            legLabel: leg.customLabel || `${leg.action} ${leg.strikePrice} ${leg.type}`,
            symbol: signal.symbol,
            strategyName: `${signal.pillarName} - ${signal.strategyName}`,
            strikePrice: leg.strikePrice,
            type: leg.type,
            action: leg.action,
            quantity: leg.quantity * leg.lotSize,
            lotSize: leg.lotSize,
            entryPrice: legEntry,
            currentPrice: leg.currentLtp || legEntry,
            pnl: 0,
            pnlPercent: 0,
            stopLoss: optionSl,
            targetPrice: optionTarget,
            openedAt: timestamp,
            status: 'OPEN',
            expiry: leg.expiry || '2026-08-27',
            userId: userId || undefined
          };
          dbEngine.savePaperPosition(newPos, userId);
          positionsCreated.push(newPos);
        }
      } else {
        // Single instrument Equity / Future / Commodity position
        const posId = `pos-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const lotSize = signal.assetClass === 'COMMODITY' ? (signal.symbol === 'NATURALGAS' ? 1250 : signal.symbol === 'CRUDEOIL' ? 100 : signal.symbol === 'COPPER' ? 2500 : 1) : (signal.symbol === 'RELIANCE' ? 250 : signal.symbol === 'TCS' ? 175 : signal.symbol === 'TATAMOTORS' ? 575 : 100);
        const newPos: PaperPosition = {
          id: posId,
          strategyGroupId,
          legLabel: `${signal.direction} ${signal.symbol} @ ₹${signal.entryPrice}`,
          symbol: signal.symbol,
          strategyName: `${signal.pillarName} - ${signal.strategyName}`,
          strikePrice: 0,
          type: 'CE',
          action: signal.direction === 'SELL' ? 'SELL' : 'BUY',
          quantity: lotSize,
          lotSize,
          entryPrice: signal.entryPrice,
          currentPrice: signal.entryPrice,
          pnl: 0,
          pnlPercent: 0,
          stopLoss: signal.stopLoss,
          targetPrice: signal.target1,
          openedAt: timestamp,
          status: 'OPEN',
          expiry: '2026-08-27',
          userId: userId || undefined
        };
        dbEngine.savePaperPosition(newPos, userId);
        positionsCreated.push(newPos);
      }

      res.json({
        success: true,
        message: `Successfully executed signal '${signal.strategyName}' on ${signal.symbol} into Paper Trading Terminal.`,
        strategyGroupId,
        positions: positionsCreated
      });
    } catch (err: any) {
      console.error('Error executing platform signal:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Section 5A: Margin Calculator Endpoint (Order Margins & Basket Margin Check)
  app.post('/api/margin/check', async (req, res) => {
    try {
      const marginReq = req.body;
      const brokerProvider = globalMarketFeed.getBrokerClient();
      const result = await calculateOrderAndBasketMargin(marginReq, brokerProvider);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Section 5B: Basket Order Execution with Application-Level Atomicity & Fallback
  app.post('/api/basket/execute', async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const { strategyId, strategyName, symbol, legs, userAvailableMargin } = req.body;
      const portfolio = await getPaperPortfolioData(userId);
      const marginToUse = userAvailableMargin !== undefined ? Number(userAvailableMargin) : portfolio.ledger.availableMargin;
      const result = await globalBasketEngine.executeBasketOrder(
        strategyId,
        strategyName || 'Custom Strategy',
        symbol || 'NIFTY',
        legs,
        marginToUse,
        userId
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Executed Basket Orders History & Reconciliation Logs
  app.get('/api/basket/list', async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
      const baskets = globalBasketEngine.getAllBaskets(userId, limit, offset);
      const recon = await globalBasketEngine.runReconciliationCheck();
      res.json({ baskets, reconciliation: recon });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Historical Option Strategy Backtester
  app.post('/api/backtest/run', async (req, res) => {
    try {
      const config = req.body;
      const result = await runOptionBacktest(config);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Historical Batch Sync Endpoints (Jan 2024 - Present across 1m, 3m, 5m, 15m, 30m, 60m, day)
  app.post('/api/historical/sync-all', async (req, res) => {
    try {
      const status = await startFullHistoricalSync();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/historical/sync-status', (req, res) => {
    res.json(getSyncStatus());
  });

  // AI Interpretation & Narration Endpoint (Gemini @google/genai)
  app.post('/api/ai/narrate', async (req, res) => {
    try {
      const { symbol, userPrompt } = req.body;
      const narration = await generateAiNarration(symbol || 'NIFTY', userPrompt);
      res.json(narration);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Database Introspection API (Auto-Index & Migration Status)
  app.get('/api/db/schema', (req, res) => {
    try {
      const schema = dbEngine.getSchemaInfo();
      res.json(schema);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/db/migrations', (req, res) => {
    try {
      const migrations = dbEngine.getMigrationHistory();
      res.json(migrations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/db/export-ddl', (req, res) => {
    try {
      const ddl = dbEngine.exportDDLScript();
      res.type('text/plain').send(ddl);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Paper Trading Terminal API
  app.get('/api/paper-trading/portfolio', async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
      updatePaperPositionsMTM(userId);
      const portfolio = await getPaperPortfolioData(userId, limit, offset);
      res.json(portfolio);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // BUG 6 & BUG 5: /start endpoint replaces /order with margin gate and multi-leg group placement
  app.post('/api/paper-trading/start', async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const { strategyName, symbol, legs } = req.body;
      if (!legs || !Array.isArray(legs) || legs.length === 0) {
        return res.status(400).json({ error: 'At least one strategy leg is required' });
      }

      const currentPortfolio = await getPaperPortfolioData(userId);
      const userAvailableMargin = currentPortfolio.ledger.availableMargin;

      // Margin Check (BUG 5)
      const marginReq = {
        symbol: symbol || 'NIFTY',
        legs: legs.map((l: any) => ({
          symbol: symbol || 'NIFTY',
          strikePrice: Number(l.strikePrice),
          type: l.type,
          action: l.action,
          quantity: Number(l.quantity) || 1,
          lotSize: Number(l.lotSize) || 50,
          price: Number(l.currentLtp) || 100, // BUG 1 FIX: ALWAYS send currentLtp
          product: (l.product as 'MIS' | 'NRML') || 'NRML'
        })),
        userAvailableMargin
      };

      const marginResult = await calculateOrderAndBasketMargin(marginReq);
      if (!marginResult.hasSufficientMargin) {
        return res.status(400).json({
          error: `Insufficient virtual margin for paper trade. Required: ₹${marginResult.requiredMarginWithCushion.toLocaleString('en-IN')}, Available: ₹${userAvailableMargin.toLocaleString('en-IN')}`,
          marginResult
        });
      }

      // Generate ONE strategyGroupId for the whole call (BUG 4)
      const strategyGroupId = `group-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const createdPositions: PaperPosition[] = [];

      for (const l of legs) {
        const posId = `pos-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const lotSize = Number(l.lotSize) || 50;
        const totalQty = (Number(l.quantity) || 1) * lotSize;
        const entryPrice = Number(l.currentLtp) || 100; // BUG 1 FIX: entryPrice = currentLtp!

        const legLabel = l.legLabel || l.customLabel || `${l.action} ${l.type} ${l.strikePrice}`;

        const pos: PaperPosition = {
          id: posId,
          strategyGroupId,
          legLabel,
          symbol: symbol || 'NIFTY',
          strategyName: strategyName || (legs.length === 1 ? `Single ${l.type}` : `Multi-Leg Strategy (${legs.length} legs)`),
          strikePrice: Number(l.strikePrice),
          type: l.type,
          action: l.action,
          quantity: totalQty,
          lotSize,
          entryPrice,
          currentPrice: entryPrice,
          pnl: 0,
          pnlPercent: 0,
          status: 'OPEN',
          openedAt: new Date().toISOString(),
          expiry: l.expiry || 'CURRENT'
        };

        dbEngine.savePaperPosition(pos, userId);
        createdPositions.push(pos);
      }

      updatePaperPositionsMTM(userId);
      res.json({
        success: true,
        strategyGroupId,
        positions: createdPositions,
        marginResult
      });
    } catch (err: any) {
      console.error('Error in /api/paper-trading/start:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/paper-trading/close/:id - closes single leg
  app.post(['/api/paper-trading/close', '/api/paper-trading/close/:id'], async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const id = req.params.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Position ID is required' });
      }

      const exitPriceParam = req.body?.exitPrice;
      const closeReasonParam = req.body?.reason || 'Manual Square Off';

      const pos = dbEngine.getPaperPositionById(id, userId);
      if (!pos || pos.status !== 'OPEN') {
        return res.status(404).json({ error: 'Open paper position not found' });
      }

      const exitPrice = exitPriceParam !== undefined ? Number(exitPriceParam) : pos.currentPrice;
      const pnl = pos.action === 'BUY'
        ? (exitPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - exitPrice) * pos.quantity;

      const closed = dbEngine.closePaperPosition(id, exitPrice, Number(pnl.toFixed(2)), closeReasonParam, userId);
      if (closed) {
        try {
          tradeReviewEngine.recordFromPaperPosition(
            pos,
            exitPrice,
            Number(pnl.toFixed(2)),
            closeReasonParam,
            new Date().toISOString()
          );
        } catch (revErr) {
          console.error('[MANUAL CLOSE] Error recording trade review:', revErr);
        }
        updatePaperPositionsMTM(userId);
        const portfolio = await getPaperPortfolioData(userId);
        res.json({ success: true, portfolio });
      } else {
        res.status(500).json({ error: 'Failed to close position' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/paper-trading/close-group/:groupId - closes whole strategy
  app.post(['/api/paper-trading/close-group', '/api/paper-trading/close-group/:groupId'], async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const groupId = req.params.groupId || req.body?.groupId;
      if (!groupId) {
        return res.status(400).json({ error: 'Group ID is required' });
      }

      const allPositions = dbEngine.loadAllPaperPositions(userId);
      const groupLegs = allPositions.filter(p => (p.strategyGroupId === groupId || p.id === groupId) && p.status === 'OPEN');
      const reason = req.body?.reason || 'Manual Strategy Close';

      const closed = dbEngine.closePaperGroup(groupId, reason, userId);
      if (closed) {
        for (const leg of groupLegs) {
          try {
            tradeReviewEngine.recordFromPaperPosition(
              leg,
              leg.currentPrice,
              leg.pnl || 0,
              reason,
              new Date().toISOString()
            );
          } catch (revErr) {
            console.error('[GROUP CLOSE] Error recording leg trade review:', revErr);
          }
        }
        updatePaperPositionsMTM(userId);
        const portfolio = await getPaperPortfolioData(userId);
        res.json({ success: true, portfolio });
      } else {
        res.status(404).json({ error: 'No open legs found for strategy group' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH or POST risk endpoints (/api/paper-trading/update-sl-target or /api/paper-trading/:id/risk)
  app.all(['/api/paper-trading/update-sl-target', '/api/paper-trading/:id/risk'], async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const id = req.params.id || req.body?.id;
      const { stopLoss, targetPrice } = req.body;
      const pos = dbEngine.getPaperPositionById(id, userId);

      if (!pos) {
        return res.status(404).json({ error: 'Paper position not found' });
      }

      pos.stopLoss = stopLoss !== undefined ? (stopLoss ? Number(stopLoss) : undefined) : pos.stopLoss;
      pos.targetPrice = targetPrice !== undefined ? (targetPrice ? Number(targetPrice) : undefined) : pos.targetPrice;

      dbEngine.savePaperPosition(pos, userId);
      res.json({ success: true, position: pos });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/paper-trading/reset', async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      dbEngine.clearAllPaperPositions(userId);
      const portfolio = await getPaperPortfolioData(userId);
      res.json({ success: true, portfolio });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- PHASE J: AUTONOMOUS STRATEGY RUNNER API ENDPOINTS ---

  // Get Autonomous Runner System Health, Safety Limits & Active Status
  app.get('/api/autonomous/status', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const status = globalAutonomousEngine.getStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get All Autonomous Strategies
  app.get('/api/autonomous/strategies', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const strats = dbEngine.getAllAutonomousStrategies(userId);
      res.json(strats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create New Autonomous Strategy (Defaults to armed: false)
  app.post('/api/autonomous/strategies', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const stratData = req.body;
      const newStrat = {
        id: `auto-${Date.now()}`,
        name: stratData.name || 'Autonomous Strategy',
        symbol: stratData.symbol || 'NIFTY',
        armed: false, // RULE 2: Default armed: false on creation
        productType: stratData.productType || 'NRML',
        legs: stratData.legs || [],
        entryRules: stratData.entryRules || { all: [{ field: 'ivRank', operator: '>', value: 50 }] },
        adjustmentRules: stratData.adjustmentRules,
        exitRules: stratData.exitRules,
        maxPositionSize: stratData.maxPositionSize || 5,
        status: 'DISARMED',
        createdAt: new Date().toISOString()
      };
      dbEngine.saveAutonomousStrategy(newStrat, userId);
      dbEngine.addAutonomousLog({
        id: `log-${Date.now()}`,
        strategyId: newStrat.id,
        strategyName: newStrat.name,
        timestamp: new Date().toISOString(),
        eventType: 'DISARMED',
        details: { action: 'CREATED', armed: false, symbol: newStrat.symbol }
      });
      res.json(newStrat);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update / Arm / Disarm Autonomous Strategy
  app.put('/api/autonomous/strategies/:id', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const { id } = req.params;
      const existing = dbEngine.getAutonomousStrategy(id, userId);
      if (!existing) {
        return res.status(404).json({ error: 'Autonomous strategy not found' });
      }

      const updates = req.body;
      const wasArmed = existing.armed;
      const updatedStrat = {
        ...existing,
        ...updates,
        id // preserve id
      };

      if (updatedStrat.armed && updatedStrat.status === 'DISARMED') {
        updatedStrat.status = 'WATCHING';
      } else if (!updatedStrat.armed) {
        updatedStrat.status = 'DISARMED';
      }

      dbEngine.saveAutonomousStrategy(updatedStrat, userId);

      if (wasArmed !== updatedStrat.armed) {
        dbEngine.addAutonomousLog({
          id: `log-${Date.now()}`,
          strategyId: updatedStrat.id,
          strategyName: updatedStrat.name,
          timestamp: new Date().toISOString(),
          eventType: updatedStrat.armed ? 'ARMED' : 'DISARMED',
          details: { armed: updatedStrat.armed, status: updatedStrat.status }
        });
      }

      res.json(updatedStrat);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Autonomous Strategy
  app.delete('/api/autonomous/strategies/:id', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const { id } = req.params;
      const existing = dbEngine.getAutonomousStrategy(id, userId);
      dbEngine.deleteAutonomousStrategy(id, userId);
      dbEngine.addAutonomousLog({
        id: `log-${Date.now()}`,
        strategyId: id,
        strategyName: existing?.name || id,
        timestamp: new Date().toISOString(),
        eventType: 'DISARMED',
        details: { action: 'DELETED' }
      });
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global Kill Switch Endpoint
  app.post('/api/autonomous/kill-switch', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : 'ANONYMOUS';
      const reason = req.body?.reason || 'User clicked Kill Switch button';
      const result = globalAutonomousEngine.triggerKillSwitch(userId, reason);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset Global Kill Switch Endpoint
  app.post('/api/autonomous/kill-switch/reset', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : 'ANONYMOUS';
      globalAutonomousEngine.resetKillSwitch(userId);
      res.json({ success: true, message: 'Kill Switch reset. Individual strategies may now be armed.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Task 1: Simulated Circuit Breaker Verification Endpoint
  app.post('/api/autonomous/test-circuit-breaker', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : 'ANONYMOUS';
      const simulatedLoss = Number(req.body?.simulatedLoss) || -15000;
      dbEngine.addAutonomousLog({
        id: `log-test-${Date.now()}`,
        strategyId: 'SIMULATED_TEST',
        strategyName: 'Simulated Loss Test',
        timestamp: new Date().toISOString(),
        eventType: 'EXIT_TRIGGERED',
        details: { pnl: simulatedLoss, note: 'Simulated loss for circuit breaker verification' }
      }, userId);

      const dailyPnl = dbEngine.getDailyAutonomousPnl(userId);
      const status = globalAutonomousEngine.getStatus(userId);

      // Trigger kill switch if threshold is breached
      if (dailyPnl <= status.safetyLimits.dailyLossThreshold && !status.isKillSwitchEngaged) {
        globalAutonomousEngine.triggerKillSwitch(
          userId,
          `Daily Loss Circuit Breaker breached via test trigger: Today P&L ₹${dailyPnl.toLocaleString()} <= threshold ₹${status.safetyLimits.dailyLossThreshold.toLocaleString()}`
        );
      }

      const updatedStatus = globalAutonomousEngine.getStatus(userId);

      res.json({
        simulatedLossLogged: simulatedLoss,
        currentDailyAutonomousPnl: dailyPnl,
        isKillSwitchEngaged: updatedStatus.isKillSwitchEngaged,
        killSwitchReason: updatedStatus.killSwitchReason
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Task 2: System Margin API Endpoint (Fetches real margin from active provider)
  app.get('/api/system/margin', async (req, res) => {
    try {
      const marginInfo = await activeProvider.getAvailableMargin();
      res.json(marginInfo || { available: 1000000, source: 'PRACTICE' });
    } catch (err: any) {
      console.warn('[SYSTEM MARGIN WARN] Error getting provider margin, fallback to default:', err?.message);
      res.json({ available: 1000000, source: 'PRACTICE' });
    }
  });

  // Audit Logs Endpoint
  app.get('/api/autonomous/logs', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : null;
      const strategyId = req.query.strategyId as string | undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(1, Number(req.query.limit) || 100), 500) : 100;
      const offset = req.query.offset !== undefined ? Math.max(0, Number(req.query.offset) || 0) : 0;
      const logs = dbEngine.getAutonomousLogs(strategyId, limit, userId, offset);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========================================================
  // 15-MINUTE 23 EMA / 50 EMA CROSSOVER ALERT SYSTEM ROUTES
  // ========================================================

  // 1. Get Live Status of All 3 Monitored Instruments (NIFTY 50, BANK NIFTY, SENSEX)
  app.get('/api/ema15m/status', (req, res) => {
    try {
      const statusList = globalEma15mEngine.getAllStatus();
      const marketHours = globalEma15mEngine.getMarketHoursStatus();
      res.json({
        instruments: statusList,
        marketHours,
        isEngineRunning: true,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get 15-Minute Candles with Full Indicator Suite (EMA 23/50, RSI 14, VWAP, Bollinger Bands, ATR) for Charting
  app.get('/api/ema15m/candles', (req, res) => {
    try {
      const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase() as Ema15mInstrument;
      const limit = Number(req.query.limit) || 100;
      const timeframe = (req.query.timeframe as string || '15m').toLowerCase();
      const range = req.query.range as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const candles = globalEma15mEngine.getCandles(symbol, limit, timeframe, range, startDate, endDate);
      res.json(candles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2b. Force Sync Real Market Candles from Live Exchanges
  app.post('/api/ema15m/sync', requireAuth as any, async (req, res) => {
    try {
      const symbol = (req.body?.symbol || req.query?.symbol || 'NIFTY').toUpperCase() as Ema15mInstrument;
      const candles = await globalEma15mEngine.syncRealMarketData(symbol, 600);
      res.json({
        success: true,
        symbol,
        count: candles.length,
        latestPrice: candles[candles.length - 1]?.close,
        message: `Successfully synchronized ${candles.length} real market candles for ${symbol}`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Adaptive Swing v2 RESEARCH PREVIEW: bounded, read-only, no broker order actions.
  // Returns explicit NO_TRADE when sideways/uncertain; scenarios cannot arm LIVE.
  app.get('/api/ema15m/adaptive-preview', requireAuth as any, async (req, res) => {
    const instrument = String(req.query.instrument || 'NIFTY').toUpperCase();
    const scenario = req.query.bias === undefined ? undefined : String(req.query.bias).toUpperCase();
    if (!['NIFTY', 'BANKNIFTY', 'SENSEX'].includes(instrument) ||
        (scenario !== undefined && !['BULLISH', 'BEARISH'].includes(scenario))) {
      return res.status(400).json({ error: 'Invalid instrument or research scenario bias' });
    }
    try {
      res.setHeader('Cache-Control', 'no-store');
      const preview = await getAdaptiveResearchPreview(
        instrument as AdaptiveInstrument,
        scenario as 'BULLISH' | 'BEARISH' | undefined
      );
      res.json(preview);
    } catch (err: any) {
      console.error('[EMA ADAPTIVE] Read-only research preview failed:', err?.message || err);
      res.status(503).json({
        mode: 'RESEARCH_ONLY', executionAuthorized: false,
        error: 'Adaptive research temporarily unavailable'
      });
    }
  });

  // 3. Get Crossover Signal History with Optional Filtering
  app.get('/api/ema15m/signals', (req, res) => {
    try {
      const symbol = req.query.symbol as string | undefined;
      const signalType = req.query.signalType as string | undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(1, Number(req.query.limit) || 100), 500) : 100;
      const offset = req.query.offset !== undefined ? Math.max(0, Number(req.query.offset) || 0) : 0;
      const signals = dbEngine.getEma15mSignals(symbol, signalType, limit, offset);
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Run 15-Minute 23/50 EMA Strategy Backtester
  app.post('/api/ema15m/backtest', (req, res) => {
    try {
      const config = req.body;
      if (!config.instrument) {
        return res.status(400).json({ error: 'Instrument is required' });
      }
      const result = globalEma15mEngine.runBacktest(config);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Get Notification Settings (Sanitizes telegramBotToken for non-admin viewers)
  app.get('/api/ema15m/settings', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : 'GLOBAL';
      const settings = dbEngine.getEmaNotificationSettings(userId);
      const isPrivileged = user && user.role === 'SUPERADMIN';
      const sanitized = {
        ...settings,
        telegramBotToken: settings.telegramBotToken
          ? (isPrivileged ? settings.telegramBotToken : '••••••••••••')
          : ''
      };
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Phase90: allow operators to inspect the NRML live-mode request and
  // unresolved broker-native stop release conditions. Read-only; no orders.
  app.get('/api/ema15m/nrml-live-status', requireSuperAdmin as any, (req, res) => {
    const user = (req as any).user;
    const userId = user ? user.id : 'GLOBAL';
    const settings = dbEngine.getEmaNotificationSettings(userId);
    res.setHeader('Cache-Control', 'no-store');
    res.json(getNrmlLiveStatus(
      settings.upstoxProductType || 'MIS',
      settings.liveBrokerExecutionEnabled
    ));
  });

  // Phase91: SUPERADMIN read-only live broker snapshot REVIEW, never a stop
  // placement or live NRML release. Explicit expected account/lot is a
  // comparison target, not independent verification of source ownership.
  app.post('/api/ema15m/nrml-broker-review', requireSuperAdmin as any, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const {expectedAccountId,instrumentKey,expectedLongQuantity,lotSize} =
      req.body || {};
    if(typeof expectedAccountId!=='string'||expectedAccountId.length<1||
       expectedAccountId.length>128||
       typeof instrumentKey!=='string'||instrumentKey.length<1||
       instrumentKey.length>256||
       !Number.isSafeInteger(expectedLongQuantity)||expectedLongQuantity<=0||
       !Number.isSafeInteger(lotSize)||lotSize<=0||
       expectedLongQuantity%lotSize!==0)
      return res.status(400).json({
        error: 'Exact account, instrument and positive lot-multiple expected NRML long quantity required.'
      });
    // UpstoxProvider's safe getVerifiedNrmlPositionRows() returns null on
    // error; do NOT use generic getPositions() (empty on API failure).
    // No broker order placement/modification/cancellation method is called.
    const report=await reviewNrmlBrokerReadOnly(activeProvider as any,{
      expectedAccountId,instrumentKey,expectedLongQuantity,lotSize
    });
    return res.json(report);
  });

  // Phase92: exact GTT STOPLOSS rule -> generated order -> exchange ref
  // research diagnostic. SUPERADMIN only, read-only; no live release.
  app.post('/api/ema15m/nrml-gtt-child-review',
    requireSuperAdmin as any,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const {expectedAccountId,instrumentKey,gttOrderId,
      expectedLongQuantity,lotSize}=req.body||{};
    if(typeof expectedAccountId!=='string'||expectedAccountId.length<1||
       expectedAccountId.length>128||
       typeof instrumentKey!=='string'||instrumentKey.length<1||
       instrumentKey.length>256||
       typeof gttOrderId!=='string'||
       !/^GTT-[A-Za-z0-9-]{1,240}$/.test(gttOrderId)||
       !Number.isSafeInteger(expectedLongQuantity)||expectedLongQuantity<=0||
       !Number.isSafeInteger(lotSize)||lotSize<=0||
       expectedLongQuantity%lotSize!==0)
      return res.status(400).json({
        error:'Exact authenticated-account comparison target, option contract, GTT ID and positive lot-multiple quantity required.'
      });
    const report=await reviewNrmlGttChildReadOnly(activeProvider as any,{
      expectedAccountId,instrumentKey,gttOrderId,expectedLongQuantity,lotSize
    });
    return res.json(report);
  });

  // Phase95: durable local NRML position/entry journal against read-only
  // Upstox account positions, ordinary orderbook, and full GTT list after
  // restart. A review NEVER dispatches a BUY/SELL or retries unknown ACKs.
  app.post('/api/ema15m/nrml-restart-review',
    requireSuperAdmin as any,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const {positionId,expectedAccountId}=req.body||{};
    if(typeof positionId!=='string'||positionId.length<1||
       positionId.length>256||
       typeof expectedAccountId!=='string'||expectedAccountId.length<1||
       expectedAccountId.length>256)
      return res.status(400).json({
        error:'Exact durable position ID and expected broker account required.'
      });
    try{
      const positions=dbEngine.getOpenEmaLivePositions();
      const matches=positions.filter(p=>p.id===positionId);
      if(matches.length!==1||matches[0].productType!=='NRML'||
         matches[0].brokerAccountId!==expectedAccountId)
        return res.status(409).json({
          error:'No uniquely matching open NRML durable position and broker account.'
        });
      const p=matches[0];
      const entryAttempt=dbEngine.getEmaLiveOrderAttemptById(p.attemptId);
      const report=await reviewNrmlRestartReadOnly(activeProvider as any,{
        expectedAccountId,expectedPositionId:positionId,
        journalPositions:positions,entryAttempt
      });
      return res.json(report);
    }catch{
      return res.status(503).json({
        error:'Durable NRML journal or read-only broker review unavailable.'
      });
    }
  });

  // Phase98: SUPERADMIN read-only SELL-fill diagnostic. Neither an
  // Upstox placeOrder ACK nor even a consistent broker-reported trade set
  // authorises automatic CLOSED/P&L, NRML live BUY or duplicate SELL retry.
  app.post('/api/ema15m/live-exit-fill-review',
    requireSuperAdmin as any,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const {positionId,expectedAccountId}=req.body||{};
    if(typeof positionId!=='string'||positionId.length<1||
       positionId.length>256||
       typeof expectedAccountId!=='string'||expectedAccountId.length<1||
       expectedAccountId.length>256)
      return res.status(400).json({
        error:'Exact durable exit position and connected broker-account comparison target required.'
      });
    try{
      const matches=dbEngine.getOpenEmaLivePositions()
        .filter(p=>p.id===positionId);
      if(matches.length!==1||matches[0].status!=='EXIT_PENDING'||
         matches[0].brokerAccountId!==expectedAccountId||
         !matches[0].exitBrokerOrderId)
        return res.status(409).json({
          error:'No unique matching EXIT_PENDING broker-acknowledged position to inspect.'
        });
      const p=matches[0];
      // A position with previously recorded SELL fills requires a persisted
      // per-child requested size and lifecycle ledger, not a reconstructed
      // order quantity from a potentially already-updated cumulative field.
      if(p.exitFilledQuantity!==0||
         !Number.isSafeInteger(p.quantity)||p.quantity<=0||
         !Number.isSafeInteger(p.lotSize)||p.lotSize<=0||
         p.quantity%p.lotSize!==0||
         !p.brokerInstrumentKey)
        return res.status(409).json({
          error:'Original submitted SELL quantity or native option lot not independently reconstructable.'
        });
      const brokerAuth=typeof (activeProvider as any)?.getLiveConnectionStatus==='function'
        ?(activeProvider as any).getLiveConnectionStatus():null;
      if(brokerAuth?.isConnected!==true||
         brokerAuth?.userId!==expectedAccountId)
        return res.status(503).json({
          error:'Connected broker account could not be independently matched.'
        });
      const report=await reviewBrokerExitFillReadOnly(activeProvider as any,{
        instrumentKey:p.brokerInstrumentKey,
        product:p.productType,
        orderId:p.exitBrokerOrderId,
        requestedSellQuantity:p.quantity,
        lotSize:p.lotSize
      });
      return res.json(report);
    }catch{
      return res.status(503).json({
        error:'Read-only live exit fill evidence review unavailable.'
      });
    }
  });

  // Phase99: explicit SUPERADMIN local evidence capture. Reads actual Upstox
  // child, unique trades, full order book and latest native portfolio, then
  // appends immutable local trade IDs/child observation in one SQLite TX.
  // This route writes ONLY local diagnostic journal; never sends a broker
  // order, creates GTT, changes position CLOSED, books P&L or permits retry.
  app.post('/api/ema15m/live-exit-evidence-capture',
    requireSuperAdmin as any,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const {positionId,expectedAccountId}=req.body||{};
    if(typeof positionId!=='string'||positionId.length<1||
       positionId.length>128||
       typeof expectedAccountId!=='string'||expectedAccountId.length<1||
       expectedAccountId.length>128)
      return res.status(400).json({
        error:'Exact pending position and expected broker account required.'
      });
    try{
      const matches=dbEngine.getOpenEmaLivePositions()
        .filter(p=>p.id===positionId);
      if(matches.length!==1||matches[0].status!=='EXIT_PENDING'||
         matches[0].brokerAccountId!==expectedAccountId||
         !matches[0].exitBrokerOrderId||!matches[0].brokerInstrumentKey||
         matches[0].exitFilledQuantity!==0||
         !Number.isSafeInteger(matches[0].quantity)||
         !Number.isSafeInteger(matches[0].lotSize)||
         matches[0].quantity<=0||matches[0].lotSize<=0||
         matches[0].quantity%matches[0].lotSize!==0)
        return res.status(409).json({
          error:'Pending child original requested quantity/account/lot not reconstructable.'
        });
      const p=matches[0],provider=activeProvider as any;
      const auth=typeof provider?.getLiveConnectionStatus==='function'
        ?provider.getLiveConnectionStatus():null;
      if(auth?.isConnected!==true||auth?.userId!==expectedAccountId||
         ['getOrderDetails','getOrderTrades','getOrderBook',
          'getVerifiedLivePositionQuantity'].some(k=>typeof provider?.[k]!=='function'))
        return res.status(503).json({
          error:'Authenticated broker read-only evidence methods unavailable.'
        });
      const childId=p.exitBrokerOrderId!;
      const [order,trades,orderBook]=await Promise.all([
        provider.getOrderDetails(childId),provider.getOrderTrades(childId),
        provider.getOrderBook()
      ]);
      // Child fill must be observed BEFORE the last broker net GET.
      const brokerNetAfterTrades=await provider.getVerifiedLivePositionQuantity(
        p.brokerInstrumentKey,p.productType
      );
      const prepared=prepareDurableSellChildEvidence({
        positionId:p.id,accountId:expectedAccountId,
        request:{
          instrumentKey:p.brokerInstrumentKey,product:p.productType,
          orderId:childId,requestedSellQuantity:p.quantity,lotSize:p.lotSize
        },
        evidence:{order,trades,orderBook,brokerNetAfterTrades}
      });
      if(!prepared.ok)return res.status(409).json({
        state:'BROKER_EVIDENCE_CONFLICT_NOT_CAPTURED',
        reasonCode:prepared.reason,
        automaticClosureAuthorized:false,brokerWrites:0
      });
      // DB transaction repeats account/child/status/size checks atomically.
      // It never mutates ema_live_positions, realised P&L or broker state.
      const capture=dbEngine.appendEmaExitChildTradeEvidence(prepared.prepared);
      return res.status(capture.state==='EVIDENCE_CONFLICT'?409:200).json(capture);
    }catch{
      return res.status(503).json({
        error:'Local SELL evidence journal or broker read-only capture unavailable.'
      });
    }
  });

  // Phase100: read-only, intentionally non-authorising preview of durable
  // SELL child/trades and locally saved original BUY against a fresh broker
  // net snapshot. Never mutates local position/P&L, broker order or GTT.
  app.post('/api/ema15m/live-exit-settlement-preview',
    requireSuperAdmin as any,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const {positionId,expectedAccountId}=req.body||{};
    if(typeof positionId!=='string'||positionId.length<1||
       positionId.length>128||
       typeof expectedAccountId!=='string'||expectedAccountId.length<1||
       expectedAccountId.length>128)
      return res.status(400).json({
        error:'Valid durable position and expected broker account required.'
      });
    try{
      const positions=dbEngine.getOpenEmaLivePositions()
        .filter(p=>p.id===positionId);
      if(positions.length!==1||positions[0].status!=='EXIT_PENDING'||
         positions[0].brokerAccountId!==expectedAccountId||
         !positions[0].brokerInstrumentKey)
        return res.status(409).json({
          error:'Unique pending broker position and expected account could not be matched.'
        });
      const p=positions[0],provider=activeProvider as any;
      const conn=typeof provider?.getLiveConnectionStatus==='function'
        ?provider.getLiveConnectionStatus():null;
      if(conn?.isConnected!==true||conn?.userId!==expectedAccountId||
         typeof provider?.getVerifiedLivePositionQuantity!=='function')
        return res.status(503).json({
          error:'Authenticated broker net read unavailable.'
        });
      // Broker GET only. A later portfolio observation reduces stale-net
      // risk but does not make local/broker sources atomic.
      const freshBrokerNetQuantity=await provider.getVerifiedLivePositionQuantity(
        p.brokerInstrumentKey,p.productType
      );
      const raw=dbEngine.readEmaExitSettlementEvidence(positionId);
      // Never echo raw local broker IDs, trade IDs, prices or auth tokens.
      const result=previewDurableExitSettlement({
        positionId,accountId:expectedAccountId
      },{...raw,freshBrokerNetQuantity});
      return res.json(result);
    }catch{
      return res.status(503).json({
        error:'Read-only settlement preview currently unavailable.'
      });
    }
  });

  // Phase101: original BUY per-trade provenance, independent of later
  // SELL. Requires explicit SUPERADMIN action and authenticated account,
  // uses ONLY Upstox GET order/details, trades and order book; writes
  // private local immutable receipts, never broker orders or P&L/CLOSED.
  app.post('/api/ema15m/original-buy-evidence-capture',
    requireSuperAdmin as any,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const {positionId,expectedAccountId}=req.body||{};
    if(typeof positionId!=='string'||positionId.length<1||
       positionId.length>128||
       typeof expectedAccountId!=='string'||expectedAccountId.length<1||
       expectedAccountId.length>128)
      return res.status(400).json({
        error:'Original durable position and expected broker account required.'
      });
    try{
      const rows=dbEngine.getOpenEmaLivePositions()
        .filter(p=>p.id===positionId);
      if(rows.length!==1||rows[0].brokerAccountId!==expectedAccountId||
         !rows[0].brokerInstrumentKey||!rows[0].entryBrokerOrderId||
         !Number.isSafeInteger(rows[0].quantity)||
         !Number.isSafeInteger(rows[0].lotSize)||
         rows[0].quantity<=0||rows[0].lotSize<=0||
         rows[0].quantity%rows[0].lotSize!==0)
        return res.status(409).json({
          error:'No unique, attributable original option position and lot.'
        });
      const p=rows[0],attempt=dbEngine.getEmaLiveOrderAttemptById(p.attemptId);
      if(!attempt||attempt.brokerAccountId!==expectedAccountId||
         attempt.brokerInstrumentKey!==p.brokerInstrumentKey||
         attempt.brokerOrderId!==p.entryBrokerOrderId||
         attempt.orderStatus!=='FILLED'||
         attempt.filledQuantity!==p.quantity||
         attempt.requestedQuantity!==p.quantity||
         typeof attempt.averageFillPrice!=='number')
        return res.status(409).json({
          error:'Original fully filled BUY journal and exact broker child cannot be reconciled.'
        });
      const broker=activeProvider as any;
      const auth=typeof broker?.getLiveConnectionStatus==='function'
        ?broker.getLiveConnectionStatus():null;
      if(auth?.isConnected!==true||auth?.userId!==expectedAccountId)
        return res.status(503).json({
          error:'Connected broker account not verified.'
        });
      const prepared=await fetchOriginalBuyTradeEvidenceReadOnly(broker,{
        positionId:p.id,accountId:expectedAccountId,
        attemptId:p.attemptId,orderId:p.entryBrokerOrderId,
        instrumentKey:p.brokerInstrumentKey,
        product:p.productType,originalQuantity:p.quantity,
        lotSize:p.lotSize,entryFillPrice:attempt.averageFillPrice
      });
      if(!prepared.ok)return res.status(409).json({
        state:'ORIGINAL_BUY_EVIDENCE_NOT_CAPTURED',
        reasonCode:prepared.reason,
        automaticClosureAuthorized:false,
        realisedPnlWriteAuthorized:false,
        liveNrmlBuyAuthorized:false,brokerWrites:0
      });
      const capture=dbEngine.appendEmaOriginalBuyTradeEvidence(
        prepared.prepared
      );
      return res.status(capture.state==='BUY_RECEIPT_CONFLICT'?409:200)
        .json(capture);
    }catch{
      return res.status(503).json({
        error:'Original BUY read-only broker receipts or private journal unavailable.'
      });
    }
  });

  // 6. Save Notification Settings (Strictly requires authenticated user)
  app.post('/api/ema15m/settings', requireSuperAdmin as any, (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user ? user.id : 'GLOBAL';
      const settings = req.body;
      // A generic MIS live toggle must never silently arm NRML order routing.
      // A separate broker-native protective stop release does not exist yet.
      if (settings?.upstoxProductType === 'NRML' &&
          settings?.liveBrokerExecutionEnabled === true) {
        return res.status(409).json({
          error: 'NRML live BUY release blocked until broker-native stop/GTT child ACK, position reconciliation and independent risk signoff.',
          nrmlStatus: getNrmlLiveStatus('NRML', true)
        });
      }
      dbEngine.saveEmaNotificationSettings(settings, userId);
      if (userId !== 'GLOBAL') {
        dbEngine.saveEmaNotificationSettings(settings, 'GLOBAL');
      }
      const updated = dbEngine.getEmaNotificationSettings(userId);
      res.json({ success: true, settings: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Send Test Alert (Telegram or Email)
  app.post('/api/ema15m/test-notification', requireAuth as any, async (req, res) => {
    try {
      const { channel, target, botToken } = req.body;
      if (!channel || (channel !== 'TELEGRAM' && channel !== 'EMAIL')) {
        return res.status(400).json({ error: 'Channel must be TELEGRAM or EMAIL' });
      }
      const result = await globalNotificationService.testNotification(channel, target, botToken);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Trigger Mock Crossover for Testing / Verification (Isolated from live execution)
  app.post('/api/ema15m/mock-crossover', requireAuth as any, (req, res) => {
    try {
      const { symbol, targetType } = req.body;
      const inst = (symbol || 'NIFTY').toUpperCase() as Ema15mInstrument;
      const type = (targetType || 'BULLISH') as 'BULLISH' | 'BEARISH';
      const result = globalEma15mEngine.triggerMockCrossover(inst, type);
      res.json({
        success: true,
        message: `Triggered mock ${type} crossover on ${inst}`,
        ...result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Get Notification Dispatch Audit Logs
  app.get('/api/ema15m/notification-logs', (req, res) => {
    try {
      const signalId = req.query.signalId as string | undefined;
      const limit = Number(req.query.limit) || 50;
      const logs = dbEngine.getEmaNotificationLogs(signalId, limit);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Get EMA Paper Trading Positions & Trade History
  app.get('/api/ema15m/paper-trades', (req, res) => {
    try {
      const instrument = req.query.instrument as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(1, Number(req.query.limit) || 100), 500) : 100;
      const offset = req.query.offset !== undefined ? Math.max(0, Number(req.query.offset) || 0) : 0;
      const trades = dbEngine.getEmaPaperTrades(instrument, status, limit, offset);
      res.json(trades);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. Get EMA Paper Trading P&L Performance Summary
  app.get('/api/ema15m/paper-summary', (req, res) => {
    try {
      const summary = dbEngine.getEmaPaperTradingSummary();
      const statusList = globalEma15mEngine.getAllStatus();
      const dataSource = globalEma15mEngine.getDataSource();
      res.json({
        ...summary,
        dataSource: dataSource.source,
        dataSourceMessage: dataSource.message,
        instruments: statusList.map(s => ({
          instrument: s.instrument,
          currentPrice: s.currentPrice,
          activePaperTrade: s.activePaperTrade
        }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. Manually Square Off / Close an EMA Paper Trade (Pure simulation, NEVER touches broker)
  app.post('/api/ema15m/paper-trades/close', requireAuth as any, (req, res) => {
    try {
      const { id, exitPrice, reason } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Trade ID is required' });
      }
      const trades = dbEngine.getEmaPaperTrades('ALL', 'OPEN', 100);
      const trade = trades.find(t => t.id === id);
      if (!trade) {
        return res.status(404).json({ error: 'Open paper trade not found' });
      }

      const closePrice = exitPrice !== undefined ? Number(exitPrice) : trade.currentPrice;
      const closed = dbEngine.closeEmaPaperTrade(id, closePrice, reason || 'MANUAL_SQUARE_OFF');
      if (closed) {
        try {
          const grossPnl = (closePrice - trade.entryPrice) * (trade.quantity || 1);
          const netPnl = grossPnl - 40;
          tradeReviewEngine.recordFromEmaTrade(
            trade,
            closePrice,
            grossPnl,
            netPnl,
            reason || 'MANUAL_SQUARE_OFF',
            new Date().toISOString()
          );
        } catch (revErr) {
          console.error('[EMA CLOSE] Error recording trade review:', revErr);
        }
        const summary = dbEngine.getEmaPaperTradingSummary();
        res.json({ success: true, message: `Trade ${id} closed successfully @ ₹${closePrice}`, summary });
      } else {
        res.status(500).json({ error: 'Failed to close trade' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 13. Toggle EMA Automatic Paper Trading Setting
  app.post('/api/ema15m/paper-trades/toggle', requireSuperAdmin as any, (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user ? user.id : 'GLOBAL';
      const settings = dbEngine.getEmaNotificationSettings(userId);
      const enabled = req.body?.enabled === undefined ? !settings.autoPaperTradingEnabled : req.body.enabled;
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
      settings.autoPaperTradingEnabled = enabled;
      dbEngine.saveEmaNotificationSettings(settings, userId);
      if (userId !== 'GLOBAL') {
        const globalSettings = dbEngine.getEmaNotificationSettings('GLOBAL');
        globalSettings.autoPaperTradingEnabled = enabled;
        dbEngine.saveEmaNotificationSettings(globalSettings, 'GLOBAL');
      }
      const updated = dbEngine.getEmaNotificationSettings(userId);
      res.json({
        success: true,
        autoPaperTradingEnabled: updated.autoPaperTradingEnabled,
        settings: updated
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 14. Toggle Live Upstox Broker Execution (Independent pipeline - does not turn off paper trading)
  app.post('/api/ema15m/live-trading/toggle', requireSuperAdmin as any, (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user ? user.id : 'GLOBAL';
      const settings = dbEngine.getEmaNotificationSettings(userId);
      const enabled = req.body?.enabled === undefined ? !settings.liveBrokerExecutionEnabled : req.body.enabled;
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
      if (enabled && settings.upstoxProductType === 'NRML') {
        return res.status(409).json({
          error: 'NRML live trading requested but not armed: native broker protective SELL stop/GTT and child ACK remain unverified.',
          nrmlStatus: getNrmlLiveStatus('NRML', true)
        });
      }
      settings.liveBrokerExecutionEnabled = enabled;
      dbEngine.saveEmaNotificationSettings(settings, userId);
      if (userId !== 'GLOBAL') {
        const globalSettings = dbEngine.getEmaNotificationSettings('GLOBAL');
        globalSettings.liveBrokerExecutionEnabled = enabled;
        dbEngine.saveEmaNotificationSettings(globalSettings, 'GLOBAL');
      }
      dbEngine.logEmaExecution({
        id: `exec-toggle-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: enabled ? 'WARN' : 'INFO',
        stage: 'SAFETY_CHECK',
        instrument: 'ALL',
        message: enabled
          ? '⚠️ LIVE BROKER AUTO-TRADING ARMED: Real orders will execute on Upstox upon confirmed 15m candle close crossovers.'
          : '🛡️ LIVE BROKER AUTO-TRADING DISARMED: Real orders suppressed. Paper trading operates independently.'
      });
      const updated = dbEngine.getEmaNotificationSettings(userId);
      res.json({
        success: true,
        liveBrokerExecutionEnabled: updated.liveBrokerExecutionEnabled,
        settings: updated
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 15. Fetch EMA Execution Audit Logs
  app.get('/api/ema15m/execution-logs', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const instrument = req.query.instrument as string | undefined;
      const logs = dbEngine.getEmaExecutionLogs(limit, instrument);
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 16. Clear EMA Execution Audit Logs
  app.post('/api/ema15m/execution-logs/clear', requireSuperAdmin as any, (req, res) => {
    try {
      dbEngine.clearEmaExecutionLogs();
      res.json({ success: true, message: 'Execution logs cleared' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // DUAL EXECUTION: UPSTOX LIVE BROKER ENDPOINTS
  // -------------------------------------------------------------

  // 17. Live Execution Summary
  app.get('/api/ema15m/live-summary', (req, res) => {
    try {
      const summary = dbEngine.getEmaLiveTradingSummary();
      res.json({ success: true, summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 18. Live Broker Positions
  app.get('/api/ema15m/live-positions', (req, res) => {
    try {
      const instrument = req.query.instrument as string | undefined;
      const status = req.query.status as string | undefined;
      const positions = dbEngine.getEmaLivePositions(instrument, status);
      res.json({ success: true, positions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 19. Live Order Attempts (including rejections and 0 filled qty)
  app.get('/api/ema15m/live-attempts', (req, res) => {
    try {
      const instrument = req.query.instrument as string | undefined;
      const limit = Number(req.query.limit) || 100;
      const attempts = dbEngine.getEmaLiveOrderAttempts(instrument, limit);
      res.json({ success: true, attempts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 20. Manual Square-Off for Live Upstox Position (Executes real broker exit order)
  app.post('/api/ema15m/live-positions/close', requireSuperAdmin as any, async (req, res) => {
    try {
      const { id, reason } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Position ID is required' });
      }
      const exitResult = await liveExecutionService.requestLiveExit(id, reason || 'MANUAL_USER_EXIT');
      res.json({ success: true, ...exitResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 21. Structured Execution Events
  app.get('/api/ema15m/execution-events', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const stage = req.query.stage as string | undefined;
      const instrument = req.query.instrument as string | undefined;
      const events = dbEngine.getEmaExecutionEvents(limit, stage, instrument);
      res.json({ success: true, events });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // -------------------------------------------------------------
  // VITE DEVELOPMENT MIDDLEWARE / PRODUCTION STATIC FALLBACK
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Option Chain Trading Platform Server running on http://0.0.0.0:${PORT}`);
    initializeUpstoxAutoRefreshCron(process.env.APP_URL || `http://localhost:${PORT}`);
    if (process.env.UPSTOX_ACCESS_TOKEN) {
      console.log('[UPSTOX] Starting Upstox V3 Protobuf WebSocket Streamer...');
      globalUpstoxStreamer.connect(process.env.UPSTOX_ACCESS_TOKEN).catch(e => console.warn('[UPSTOX V3 STREAMER] Startup error:', e.message));
    }

    // Initialize background engines asynchronously without blocking port 3000 startup probe
    globalEma15mEngine.initialize().catch(err => {
      console.warn('[EMA 15M ENGINE] Async initialization note:', err.message);
    });
    quantScheduler.initialize().catch(err => {
      console.warn('[QUANT SCHEDULER] Async initialization note:', err.message);
    });
  });
}

process.on('uncaughtException', (err) => {
  console.error('[SERVER] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled rejection at:', promise, 'reason:', reason);
});

startServer().catch((err) => {
  console.error('Fatal error starting dev server:', err);
});
