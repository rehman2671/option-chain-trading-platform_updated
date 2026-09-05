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
import { authRouter, attachUser, getUserFromRequest, requireAuth } from './src/server/auth.js';

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(attachUser);
app.use('/api/auth', authRouter);

// Authenticate and attach user (with guest/session fallback for paper trading)
app.use(['/api/basket', '/api/autonomous'], requireAuth as any);

// Paper Trading Virtual Terminal Engine
const PAPER_VIRTUAL_CAPITAL = 1000000; // 10 Lakhs Initial Virtual Capital

async function getPaperPortfolioData(userId?: string | null) {
  const allPositions = dbEngine.loadAllPaperPositions(userId);
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

function updatePaperPositionsMTM() {
  const openPositions = dbEngine.loadAllPaperPositions().filter(p => p.status === 'OPEN');

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
      dbEngine.closePaperPosition(pos.id, pos.currentPrice, pos.pnl, autoCloseReason, pos.userId);
    } else {
      dbEngine.savePaperPosition(pos, pos.userId);
    }
  }
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
  // Initialize 15-Minute 23/50 EMA Alert Engine
  await globalEma15mEngine.initialize();

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
      const allSymbols = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK'];
      for (const sym of allSymbols) {
        const dbStats = collectionCoverage[sym] || { lastPersistedAt: null, totalChainRows: 0, totalTicks: 0, distinctDays: 0 };
        symbolHealth[sym] = {
          lastCapturedInMemory: backgroundStatus.lastCaptureTimes[sym] || null,
          lastPersistedAtDB: dbStats.lastPersistedAt,
          totalChainRows: dbStats.totalChainRows,
          totalSpotTicks: dbStats.totalTicks,
          distinctDaysHistory: dbStats.distinctDays,
          isActivelyViewed: activeView.symbol === sym
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
      res.json({ success: true, activeView: globalMarketFeed.getActiveView() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/system/active-view', (req, res) => {
    res.json(globalMarketFeed.getActiveView());
  });

  // Upstox Login Redirect Handler
  app.get('/api/upstox/login', (req, res) => {
    const apiKey = process.env.UPSTOX_API_KEY;
    const redirectUri = process.env.UPSTOX_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/upstox/callback`;

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

  // Upstox Login Callback Handler
  app.get('/api/upstox/callback', async (req, res) => {
    const code = req.query.code as string;
    const apiKey = process.env.UPSTOX_API_KEY;
    const apiSecret = process.env.UPSTOX_API_SECRET;
    const redirectUri = process.env.UPSTOX_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/upstox/callback`;

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

      // Dynamically activate token in runtime environment
      process.env.UPSTOX_ACCESS_TOKEN = accessToken;
      activeProvider.connect().catch((e: any) => console.warn('[UPSTOX] Runtime connect error:', e.message));

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Upstox Access Token Generated</title>
            <style>
              body { font-family: ui-monospace, monospace; background: #090d16; color: #e2e8f0; padding: 40px; line-height: 1.6; }
              .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; max-width: 650px; margin: 0 auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
              h1 { color: #10b981; font-size: 20px; margin-top: 0; }
              .token-box { background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 16px; color: #38bdf8; font-weight: bold; word-break: break-all; font-size: 14px; margin: 20px 0; }
              .steps { font-size: 13px; color: #94a3b8; }
              .steps ol { padding-left: 20px; }
              .steps li { margin-bottom: 8px; }
              code { color: #a7f3d0; background: #064e3b; padding: 2px 6px; border-radius: 4px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Upstox v2 Authentication Successful</h1>
              <p>Your daily access token has been generated and activated successfully in runtime:</p>
              <div class="token-box">${accessToken}</div>
              <div class="steps">
                <p><strong>Next Steps:</strong></p>
                <ol>
                  <li>Copy the access token above.</li>
                  <li>Set <code>UPSTOX_ACCESS_TOKEN=${accessToken}</code> in your environment variables for persistent restarts.</li>
                  <li>Live Upstox market data is now active in memory.</li>
                </ol>
              </div>
            </div>
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
      const baskets = globalBasketEngine.getAllBaskets(userId);
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
      updatePaperPositionsMTM();
      const portfolio = await getPaperPortfolioData(userId);
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

      updatePaperPositionsMTM();
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

      const allPos = dbEngine.loadAllPaperPositions(userId);
      const pos = allPos.find(p => p.id === id && p.status === 'OPEN');
      if (!pos) {
        return res.status(404).json({ error: 'Open paper position not found' });
      }

      const exitPrice = exitPriceParam !== undefined ? Number(exitPriceParam) : pos.currentPrice;
      const pnl = pos.action === 'BUY'
        ? (exitPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - exitPrice) * pos.quantity;

      const closed = dbEngine.closePaperPosition(id, exitPrice, Number(pnl.toFixed(2)), closeReasonParam, userId);
      if (closed) {
        updatePaperPositionsMTM();
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

      const closed = dbEngine.closePaperGroup(groupId, req.body?.reason || 'Manual Strategy Close', userId);
      if (closed) {
        updatePaperPositionsMTM();
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
      const allPos = dbEngine.loadAllPaperPositions(userId);
      const pos = allPos.find(p => p.id === id);

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
      const limit = Number(req.query.limit) || 100;
      const logs = dbEngine.getAutonomousLogs(strategyId, limit, userId);
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
  app.post('/api/ema15m/sync', async (req, res) => {
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

  // 3. Get Crossover Signal History with Optional Filtering
  app.get('/api/ema15m/signals', (req, res) => {
    try {
      const symbol = req.query.symbol as string | undefined;
      const signalType = req.query.signalType as string | undefined;
      const limit = Number(req.query.limit) || 100;
      const signals = dbEngine.getEma15mSignals(symbol, signalType, limit);
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
        return res.status(400).json({ error: 'Instrument is required (NIFTY, BANKNIFTY, SENSEX)' });
      }
      const result = globalEma15mEngine.runBacktest(config);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Get Notification Settings
  app.get('/api/ema15m/settings', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : 'GLOBAL';
      const settings = dbEngine.getEmaNotificationSettings(userId);
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Save Notification Settings
  app.post('/api/ema15m/settings', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : 'GLOBAL';
      const settings = req.body;
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
  app.post('/api/ema15m/test-notification', async (req, res) => {
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

  // 8. Trigger Mock Crossover for Testing / Verification
  app.post('/api/ema15m/mock-crossover', (req, res) => {
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
      const limit = Number(req.query.limit) || 100;
      const trades = dbEngine.getEmaPaperTrades(instrument, status, limit);
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

  // 12. Manually Square Off / Close an EMA Paper Trade
  app.post('/api/ema15m/paper-trades/close', (req, res) => {
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
  app.post('/api/ema15m/paper-trades/toggle', (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const userId = user ? user.id : 'GLOBAL';
      const settings = dbEngine.getEmaNotificationSettings(userId);
      const enabled = req.body?.enabled !== undefined ? req.body.enabled : !settings.autoPaperTradingEnabled;
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


  // -------------------------------------------------------------
  // VITE DEVELOPMENT MIDDLEWARE / PRODUCTION STATIC FALLBACK
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
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
