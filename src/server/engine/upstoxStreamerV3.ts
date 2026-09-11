/**
 * Upstox Market Data Feed V3 Protobuf WebSocket Streamer
 * Provides zero-lag, continuous sub-second tick-by-tick market streaming
 * Decodes Google Protocol Buffer binary packets into real-time spots, Greeks, and ticks.
 */

import WebSocket from 'ws';
import protobuf from 'protobufjs';
import path from 'path';
import { globalMarketFeed } from './marketFeed.js';
import { globalEma15mEngine } from './ema15mEngine.js';

export interface UpstoxStreamerStatus {
  connected: boolean;
  tokenExpired?: boolean;
  protocol: string;
  totalTicksReceived: number;
  lastTickTime: string | null;
  latencyMs: number;
  subscribedKeysCount: number;
  reconnectAttempts: number;
  lastError: string | null;
}

// Known instrument keys for NSE indices and equities
export const INSTRUMENT_KEY_MAP: Record<string, string> = {
  'NSE_INDEX|Nifty 50': 'NIFTY',
  'NSE_INDEX|Nifty Bank': 'BANKNIFTY',
  'BSE_INDEX|SENSEX': 'SENSEX',
  'NSE_INDEX|Nifty Fin Service': 'FINNIFTY',
  'NSE_INDEX|NIFTY MID SELECT': 'MIDCPNIFTY',
  'NSE_EQ|INE002A01018': 'RELIANCE',
  'NSE_EQ|INE040A01034': 'HDFCBANK',
  'NSE_EQ|INE467B01029': 'TCS',
  'NSE_INDEX|India VIX': 'INDIA_VIX'
};

export class UpstoxStreamerV3 {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private FeedResponseType: protobuf.Type | null = null;
  private subscribedKeys: Set<string> = new Set(Object.keys(INSTRUMENT_KEY_MAP));
  private totalTicksReceived: number = 0;
  private lastTickTime: string | null = null;
  private latencyMs: number = 0;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private isConnecting: boolean = false;
  private tokenExpired: boolean = false;
  private lastUsedToken: string | null = null;
  private isRefreshingToken: boolean = false;
  private tokenRefreshHandler: (() => Promise<string | null>) | null = null;

  constructor() {
    this.initProtobufSchema();
  }

  public setTokenRefreshHandler(handler: () => Promise<string | null>): void {
    this.tokenRefreshHandler = handler;
  }

  private isAuthError(errMessage: string, statusCode?: number): boolean {
    if (statusCode === 401 || statusCode === 403) return true;
    const msg = (errMessage || '').toLowerCase();
    return (
      msg.includes('invalid token') ||
      msg.includes('token expired') ||
      msg.includes('unauthorized') ||
      msg.includes('udapi100050') ||
      msg.includes('jwt expired') ||
      msg.includes('invalid_token') ||
      msg.includes('invalid access token')
    );
  }

  private initProtobufSchema(): void {
    try {
      const protoPath = path.join(process.cwd(), 'src', 'server', 'proto', 'MarketDataFeedV3.proto');
      const root = protobuf.loadSync(protoPath);
      this.FeedResponseType = root.lookupType('com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse');
      console.log('[UPSTOX V3 STREAMER] Protobuf schema loaded successfully.');
    } catch (err: any) {
      console.error('[UPSTOX V3 STREAMER] Error loading proto schema:', err.message);
      this.lastError = `Proto error: ${err.message}`;
    }
  }

  /**
   * Connect to Upstox V3 Market Data Feed WebSocket using the provided access token
   */
  public async connect(token?: string): Promise<boolean> {
    const accessToken = token || process.env.UPSTOX_ACCESS_TOKEN;
    if (!accessToken) {
      this.lastError = 'Missing UPSTOX_ACCESS_TOKEN';
      console.warn('[UPSTOX V3 STREAMER] Cannot connect: UPSTOX_ACCESS_TOKEN is not configured.');
      return false;
    }

    // If an explicit token was provided or it's different from the expired token, reset expiry
    if (token || (this.lastUsedToken && accessToken !== this.lastUsedToken)) {
      this.tokenExpired = false;
      this.reconnectAttempts = 0;
      this.lastUsedToken = accessToken;
    } else if (this.tokenExpired) {
      // Current token is already known to be invalid/expired. Do not retry with the same expired token.
      return false;
    } else {
      this.lastUsedToken = accessToken;
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return true;
    }

    this.isConnecting = true;
    this.lastError = null;

    try {
      console.log('[UPSTOX V3 STREAMER] Authorizing Market Data Feed V3...');
      const authRes = await fetch('https://api.upstox.com/v3/feed/market-data-feed/authorize', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      const authData: any = await authRes.json().catch(() => ({}));
      if (!authRes.ok || authData.status !== 'success' || !authData.data?.authorizedRedirectUri) {
        const errorMsg = authData.errors?.[0]?.message || authData.message || `HTTP ${authRes.status}: Failed to authorize WebSocket feed`;
        const authErr = new Error(errorMsg);
        if (this.isAuthError(errorMsg, authRes.status)) {
          (authErr as any).isAuthError = true;
        }
        throw authErr;
      }

      const wsUrl = authData.data.authorizedRedirectUri;
      console.log('[UPSTOX V3 STREAMER] Authorized. Connecting to WebSocket pipe...');

      this.cleanupSocket();

      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        followRedirects: true
      });

      this.ws.binaryType = 'nodebuffer';

      this.ws.on('open', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.tokenExpired = false;
        this.reconnectAttempts = 0;
        console.log('[UPSTOX V3 STREAMER] Continuous WebSocket connection established! Zero-lag stream active.');

        // Send initial subscription
        this.sendSubscription();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleBinaryMessage(data);
      });

      this.ws.on('error', (err: any) => {
        console.warn('[UPSTOX V3 STREAMER] Socket warning/error:', err.message);
        this.lastError = err.message;
      });

      this.ws.on('close', (code, reason) => {
        console.warn(`[UPSTOX V3 STREAMER] Socket closed (code ${code}): ${reason.toString()}`);
        this.isConnected = false;
        this.isConnecting = false;
        if (!this.tokenExpired) {
          this.scheduleReconnect();
        }
      });

      return true;
    } catch (err: any) {
      this.isConnecting = false;
      this.isConnected = false;
      this.lastError = err.message;

      const isAuthFail = err.isAuthError || this.isAuthError(err.message);
      if (isAuthFail) {
        this.tokenExpired = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        console.warn(`[UPSTOX V3 STREAMER] Authentication notice: Upstox access token has expired or is invalid ("${err.message}"). Continuous streamer reconnect paused; calibrated market feed active.`);

        // Attempt automatic refresh via TOTP handler if registered
        if (this.tokenRefreshHandler && !this.isRefreshingToken) {
          this.isRefreshingToken = true;
          try {
            console.log('[UPSTOX V3 STREAMER] Triggering automatic TOTP token refresh...');
            const freshToken = await this.tokenRefreshHandler();
            if (freshToken) {
              console.log('[UPSTOX V3 STREAMER] Auto-refresh succeeded with fresh token. Reconnecting...');
              this.isRefreshingToken = false;
              return this.connect(freshToken);
            }
          } catch (refreshErr: any) {
            console.warn('[UPSTOX V3 STREAMER] Automatic token refresh failed:', refreshErr.message);
          } finally {
            this.isRefreshingToken = false;
          }
        }

        return false;
      }

      console.warn('[UPSTOX V3 STREAMER] Connection error:', err.message);
      this.scheduleReconnect();
      return false;
    }
  }

  /**
   * Sends subscription request for all registered instrument keys
   */
  private sendSubscription(keysToSubscribe?: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const keys = keysToSubscribe || Array.from(this.subscribedKeys);
    if (keys.length === 0) return;

    const subMsg = {
      guid: `guid-${Date.now()}`,
      method: 'sub',
      data: {
        mode: 'full',
        instrumentKeys: keys
      }
    };

    try {
      this.ws.send(Buffer.from(JSON.stringify(subMsg)));
      console.log(`[UPSTOX V3 STREAMER] Subscribed to ${keys.length} instruments in FULL mode.`);
    } catch (err: any) {
      console.error('[UPSTOX V3 STREAMER] Send subscription error:', err.message);
    }
  }

  /**
   * Dynamically add instrument keys to subscribe to (e.g. active option strikes)
   */
  public subscribeInstruments(keys: string[]): void {
    const newKeys: string[] = [];
    for (const k of keys) {
      if (!this.subscribedKeys.has(k)) {
        this.subscribedKeys.add(k);
        newKeys.push(k);
      }
    }
    if (newKeys.length > 0 && this.isConnected) {
      this.sendSubscription(newKeys);
    }
  }

  /**
   * Decodes incoming Google Protobuf binary buffer
   */
  private handleBinaryMessage(data: Buffer): void {
    if (!this.FeedResponseType) return;

    try {
      const decoded: any = this.FeedResponseType.decode(data);
      if (!decoded || !decoded.feeds) return;

      const now = Date.now();
      this.totalTicksReceived++;
      this.lastTickTime = new Date().toISOString();

      // Iterate through received instrument feeds
      for (const [instrumentKey, feedObj] of Object.entries<any>(decoded.feeds)) {
        let ltp = 0;
        let cp = 0;
        let volume = 0;
        let oi = 0;
        let ltt = 0;

        // Parse different feed unions
        if (feedObj.ltpc) {
          ltp = feedObj.ltpc.ltp || 0;
          cp = feedObj.ltpc.cp || 0;
          ltt = Number(feedObj.ltpc.ltt || 0);
        } else if (feedObj.fullFeed) {
          const ff = feedObj.fullFeed.marketFF || feedObj.fullFeed.indexFF;
          if (ff && ff.ltpc) {
            ltp = ff.ltpc.ltp || 0;
            cp = ff.ltpc.cp || 0;
            ltt = Number(ff.ltpc.ltt || 0);
          }
          if (ff && ff.vtt) volume = Number(ff.vtt || 0);
          if (ff && ff.oi) oi = Number(ff.oi || 0);
        } else if (feedObj.firstLevelWithGreeks) {
          const fl = feedObj.firstLevelWithGreeks;
          if (fl.ltpc) {
            ltp = fl.ltpc.ltp || 0;
            cp = fl.ltpc.cp || 0;
            ltt = Number(fl.ltpc.ltt || 0);
          }
          if (fl.vtt) volume = Number(fl.vtt || 0);
          if (fl.oi) oi = Number(fl.oi || 0);
        }

        if (ltp > 0) {
          // Calculate latency
          if (ltt > 0 && ltt < now) {
            this.latencyMs = now - ltt;
          }

          // Map instrument key to system symbol
          const symbol = INSTRUMENT_KEY_MAP[instrumentKey];
          if (symbol) {
            // Update spot in market feed and quant engines instantly!
            globalMarketFeed.updateLiveSpot(symbol, ltp, cp, volume);
          }
        }
      }
    } catch (err: any) {
      console.warn('[UPSTOX V3 STREAMER] Protobuf decode warning:', err.message);
    }
  }

  /**
   * Schedule reconnect with exponential backoff (max 30s)
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.tokenExpired) {
      // Do not attempt to reconnect with an expired/invalid token
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(30000, 3000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 6)));
    console.log(`[UPSTOX V3 STREAMER] Will attempt reconnect #${this.reconnectAttempts} in ${(delay / 1000).toFixed(1)}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (process.env.UPSTOX_ACCESS_TOKEN && !this.tokenExpired) {
        this.connect().catch(() => {});
      }
    }, delay);
  }

  private cleanupSocket(): void {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
  }

  public getStatus(): UpstoxStreamerStatus {
    return {
      connected: this.isConnected,
      tokenExpired: this.tokenExpired,
      protocol: 'WEBSOCKET_V3_PROTOBUF',
      totalTicksReceived: this.totalTicksReceived,
      lastTickTime: this.lastTickTime,
      latencyMs: this.latencyMs,
      subscribedKeysCount: this.subscribedKeys.size,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError
    };
  }
}

export const globalUpstoxStreamer = new UpstoxStreamerV3();
