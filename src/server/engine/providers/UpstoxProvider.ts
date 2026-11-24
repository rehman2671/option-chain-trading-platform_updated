/**
 * Live Broker Data Provider (Upstox API v2)
 * Supports real Upstox quotes, option chain API, user profile, funds/margin, positions, and order placement
 */

import {
  IMarketDataProvider,
  DataProviderMode,
  ProviderHealthStatus,
  UnderlyingQuote,
  OptionContractQuote
} from './types.js';
import { PracticeModeProvider } from './PracticeModeProvider.js';
import type { BrokerRiskSnapshot } from '../ema15m/brokerRiskGate.js';
import { parseBrokerRiskResponse } from '../../release/brokerAccountRiskEvidence.js';
import {parseStrictQuoteSnapshotTime} from '../ema15m/adaptiveSellableOptionDepthReadOnly.js';
import {resolveUniqueBrokerNetPosition}
  from '../ema15m/adaptiveUniqueBrokerPositionEvidence.js';
import {
  guardExactBrokerGttGet,guardFullBrokerGttList,
  guardFullBrokerOrderBook,guardExactBrokerOrderTrades,
  guardFullBrokerPositionRows
} from '../ema15m/adaptiveUpstoxNativeReadCardinalityGuard.js';

export const COMMODITY_SYMBOLS = new Set(['GOLD', 'CRUDEOIL', 'SILVER', 'NATURALGAS', 'COPPER']);

export class UpstoxProvider implements IMarketDataProvider {
  private accessToken: string = '';
  private apiKey: string = '';
  private isConnected: boolean = false;
  private statusMessage: string = 'Initializing Upstox API v2...';
  private userName: string = '';
  private userId: string = '';
  // Monotonic local credential lifecycle marker for read-only F&O history.
  // Never expose a credential or token hash. Starts/finishes of connect()
  // invalidate any in-flight historical page sequence.
  private historicalFoAuthEpoch: number = 0;
  private practiceFallback: PracticeModeProvider = new PracticeModeProvider();

  private symbolInstrumentKeyMap: Record<string, string> = {
    'NIFTY': 'NSE_INDEX|Nifty 50',
    'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
    'SENSEX': 'BSE_INDEX|SENSEX',
    'FINNIFTY': 'NSE_INDEX|NIFTY FIN SERVICE',
    'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
    'RELIANCE': 'NSE_EQ|INE002A01018',
    'TCS': 'NSE_EQ|INE467B01029',
    'HDFCBANK': 'NSE_EQ|INE040A01034',
    'TATAMOTORS': 'NSE_EQ|INE155A01022',
    'INFY': 'NSE_EQ|INE009A01021',
    'SBIN': 'NSE_EQ|INE062A01020',
    'ICICIBANK': 'NSE_EQ|INE090A01021'
  };

  public isUpstoxLiveConnected(): boolean {
    return this.isConnected && !!this.accessToken;
  }

  public getLiveConnectionStatus(): { isConnected: boolean; message: string; userId?: string; userName?: string } {
    return {
      isConnected: this.isConnected && !!this.accessToken,
      message: this.statusMessage,
      userId: this.userId,
      userName: this.userName
    };
  }

  public getHistoricalFoAuthEpoch(): number {
    return this.historicalFoAuthEpoch;
  }

  /** Local authentication lifecycle generation shared by read-only FO/GTT
   * audits. A changing value invalidates cross-endpoint evidence. */
  public getBrokerAuthEpoch(): number {
    return this.historicalFoAuthEpoch;
  }

  /**
   * Native NRML/GTT read-only HTTP identity fence.
   * Captured bearer token is never logged. Any account, credential or
   * local generation change while a GET is in flight invalidates it.
   * The generation is local and NOT independent broker authentication.
   */
  private captureRiskReadIdentity():
    {authEpoch:number;accountId:string;bearerToken:string}|null{
    if(!this.isConnected||!this.accessToken||!this.userId||
       !Number.isSafeInteger(this.historicalFoAuthEpoch)||
       this.historicalFoAuthEpoch<1)return null;
    return {authEpoch:this.historicalFoAuthEpoch,accountId:this.userId,
      bearerToken:this.accessToken};
  }
  private currentRiskReadIdentity(
    s:{authEpoch:number;accountId:string;bearerToken:string}
  ):boolean{
    return this.isConnected&&!!this.accessToken&&
      this.historicalFoAuthEpoch===s.authEpoch&&
      this.userId===s.accountId&&this.accessToken===s.bearerToken;
  }

  public getProviderMode(): DataProviderMode {
    return 'LIVE';
  }

  public async connect(): Promise<ProviderHealthStatus> {
    // Invalidate a pinned historical session BEFORE changing credentials.
    this.historicalFoAuthEpoch++;
    this.apiKey = process.env.UPSTOX_API_KEY || '';
    this.accessToken = process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_TOKEN || '';

    // Initialize practice fallback as backup
    await this.practiceFallback.connect();

    if (!this.accessToken) {
      this.isConnected = false;
      this.historicalFoAuthEpoch++;
      this.statusMessage = 'Upstox Token not set in .env. Real-time calibrated NSE/MCX Practice Mode active.';
      return {
        mode: 'LIVE',
        connected: false,
        message: this.statusMessage,
        subSources: {
          upstoxBroker: { connected: false, message: this.statusMessage }
        }
      };
    }

    try {
      const res = await fetch('https://api.upstox.com/v2/user/profile', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.isConnected = false;
          this.historicalFoAuthEpoch++;
          this.statusMessage = 'Upstox session expired or invalid (HTTP 401). Real-time calibrated market feed active.';
          console.warn(`[UPSTOX PROVIDER] ${this.statusMessage}`);
          return {
            mode: 'LIVE',
            connected: false,
            message: this.statusMessage,
            subSources: {
              upstoxBroker: { connected: false, message: this.statusMessage }
            }
          };
        }
        const errText = await res.text();
        throw new Error(`Upstox HTTP ${res.status}: ${errText}`);
      }

      const json: any = await res.json();
      if (json.status === 'success' && json.data) {
        this.isConnected = true;
        this.userId = json.data.user_id || '';
        this.userName = json.data.user_name || this.userId;
        this.statusMessage = `Connected to Upstox API v2 (${this.userName} - ${this.userId})`;
        console.log(`[UPSTOX PROVIDER] Successfully authenticated as ${this.userName}`);
      } else {
        this.isConnected = false;
        this.statusMessage = `Upstox auth warning: ${json.errors?.[0]?.message || 'Invalid session'}`;
        console.warn(`[UPSTOX PROVIDER] ${this.statusMessage}`);
      }
    } catch (err: any) {
      this.isConnected = false;
      this.statusMessage = `Upstox feed notice: ${err.message || err}. Real-time backup feed active.`;
      console.warn('[UPSTOX PROVIDER] Notice:', this.statusMessage);
    }

    // The async authentication result also invalidates a historical
    // snapshot that began while profile verification was pending.
    this.historicalFoAuthEpoch++;
    return {
      mode: 'LIVE',
      connected: this.isConnected,
      message: this.statusMessage,
      subSources: {
        upstoxBroker: {
          connected: this.isConnected,
          lastRefresh: new Date().toISOString(),
          message: this.statusMessage
        }
      }
    };
  }

  public async getUnderlyingQuotes(symbols: string[]): Promise<Map<string, UnderlyingQuote>> {
    const resultMap = new Map<string, UnderlyingQuote>();

    // If Upstox isn't authenticated, use calibrated Practice feed
    if (!this.isConnected || !this.accessToken) {
      return this.practiceFallback.getUnderlyingQuotes(symbols);
    }

    // Separate symbols into equity/indices (supported by Upstox market-quote) and commodities
    const equitySymbols = symbols.filter(s => !COMMODITY_SYMBOLS.has(s));

    if (equitySymbols.length > 0) {
      try {
        const upstoxKeys = equitySymbols.map(s => this.symbolInstrumentKeyMap[s] || `NSE_EQ|${s}`);
        const symbolParam = encodeURIComponent(upstoxKeys.join(','));
        // Upstox v2 accepts instrument_key parameter for market quote quotes
        const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${symbolParam}`;

        const res = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        });

        if (res.ok) {
          const json: any = await res.json();
          const quotesData = json?.data || {};

          for (const sym of equitySymbols) {
            const upstoxKey = this.symbolInstrumentKeyMap[sym] || `NSE_EQ|${sym}`;
            const keyWithColon = upstoxKey.replace('|', ':');
            const altSensexKeys = sym === 'SENSEX' || sym === 'BSESENSEX'
              ? ['BSE_INDEX|SENSEX', 'BSE_INDEX:SENSEX', 'BSE_INDEX|Sensex', 'BSE_INDEX:Sensex', 'BSE_INDEX|BSE SENSEX', 'BSE_INDEX:BSE SENSEX', 'SENSEX', 'Sensex']
              : [];

            let quote = quotesData[upstoxKey] || quotesData[keyWithColon] || quotesData[upstoxKey.split('|')[1]];
            if (!quote && altSensexKeys.length > 0) {
              for (const k of altSensexKeys) {
                if (quotesData[k]) {
                  quote = quotesData[k];
                  break;
                }
              }
            }

            if (quote && typeof quote.last_price === 'number' && quote.last_price > 0) {
              resultMap.set(sym, {
                symbol: sym,
                spot: quote.last_price,
                prevClose: quote.ohlc?.close || quote.last_price,
                volume: quote.volume || 0,
                available: true,
                timestamp: new Date().toISOString(),
                source: 'UPSTOX_LIVE',
                exchangeTimestamp: Number.isFinite(Number(quote.last_trade_time)) &&
                  Number(quote.last_trade_time) > 0
                  ? new Date(Number(quote.last_trade_time)).toISOString()
                  : undefined
              });
            }
          }
        } else {
          console.warn(`[UPSTOX PROVIDER] Batch market quotes HTTP ${res.status}: falling back to calibrated feed`);
        }
      } catch (err: any) {
        console.warn('[UPSTOX PROVIDER] getUnderlyingQuotes warning:', err.message || err);
      }
    }

    // Fill missing symbols (including commodities and any unreturned symbols) from calibrated fallback
    const missingSymbols = symbols.filter(s => !resultMap.has(s) || !resultMap.get(s)?.available || (resultMap.get(s)?.spot || 0) <= 0);
    if (missingSymbols.length > 0) {
      const fallbackQuotes = await this.practiceFallback.getUnderlyingQuotes(missingSymbols);
      for (const sym of missingSymbols) {
        const fb = fallbackQuotes.get(sym);
        if (fb) {
          resultMap.set(sym, fb);
        }
      }
    }

    return resultMap;
  }

  public async getOptionChainQuotes(
    symbol: string,
    expiry: string,
    strikes: number[]
  ): Promise<Map<string, { ce: OptionContractQuote; pe: OptionContractQuote }>> {
    let resultMap = new Map<string, { ce: OptionContractQuote; pe: OptionContractQuote }>();

    // If Upstox isn't authenticated or is a commodity, delegate to calibrated fallback
    if (!this.isConnected || !this.accessToken || COMMODITY_SYMBOLS.has(symbol)) {
      return this.practiceFallback.getOptionChainQuotes(symbol, expiry, strikes);
    }

    try {
      const instKey = this.symbolInstrumentKeyMap[symbol] || `NSE_INDEX|${symbol}`;
      let formattedExpiry = expiry;
      if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        const d = new Date(expiry);
        if (!isNaN(d.getTime())) {
          formattedExpiry = d.toISOString().split('T')[0];
        }
      }

      // 1st Try: query with specific formattedExpiry
      let url = `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instKey)}${formattedExpiry ? `&expiry_date=${formattedExpiry}` : ''}`;
      let res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      // 2nd Try: If specific expiry returns 400 or empty, try without expiry_date parameter (defaults to nearest active)
      if (!res.ok) {
        url = `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instKey)}`;
        res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        });
      }

      if (res.ok) {
        const json: any = await res.json();
        const chainItems: any[] = json?.data || [];

        const targetStrikeSet = new Set(strikes.map(s => Math.round(s)));

        for (const item of chainItems) {
          const strike = Math.round(item.strike_price || 0);
          if (targetStrikeSet.size > 0 && !targetStrikeSet.has(strike)) {
            continue;
          }

          const call = item.call_options || {};
          const put = item.put_options || {};

          const callData = call.market_data || {};
          const putData = put.market_data || {};

          const callGreeks = call.option_greeks || {};
          const putGreeks = put.option_greeks || {};

          const ceQuote: OptionContractQuote = {
            strikePrice: strike,
            optionType: 'CE',
            ltp: Number(callData.ltp) || 0,
            oi: Number(callData.oi) || 0,
            volume: Number(callData.volume) || 0,
            changeInOI: Number(callData.oi || 0) - Number(callData.prev_oi || callData.oi || 0),
            pChangeInOI: callData.prev_oi && callData.prev_oi > 0
              ? Number((((callData.oi - callData.prev_oi) / callData.prev_oi) * 100).toFixed(2))
              : 0,
            iv: Number(callGreeks.iv) || 0,
            bidPrice: callData.bid_price ? Number(callData.bid_price) : undefined,
            askPrice: callData.ask_price ? Number(callData.ask_price) : undefined,
            ltpAvailable: typeof callData.ltp === 'number' && callData.ltp > 0,
            oiAvailable: typeof callData.oi === 'number',
            volumeAvailable: typeof callData.volume === 'number',
            changeInOIAvailable: true,
            ivAvailable: typeof callGreeks.iv === 'number' && callGreeks.iv > 0
          };

          const peQuote: OptionContractQuote = {
            strikePrice: strike,
            optionType: 'PE',
            ltp: Number(putData.ltp) || 0,
            oi: Number(putData.oi) || 0,
            volume: Number(putData.volume) || 0,
            changeInOI: Number(putData.oi || 0) - Number(putData.prev_oi || putData.oi || 0),
            pChangeInOI: putData.prev_oi && putData.prev_oi > 0
              ? Number((((putData.oi - putData.prev_oi) / putData.prev_oi) * 100).toFixed(2))
              : 0,
            iv: Number(putGreeks.iv) || 0,
            bidPrice: putData.bid_price ? Number(putData.bid_price) : undefined,
            askPrice: putData.ask_price ? Number(putData.ask_price) : undefined,
            ltpAvailable: typeof putData.ltp === 'number' && putData.ltp > 0,
            oiAvailable: typeof putData.oi === 'number',
            volumeAvailable: typeof putData.volume === 'number',
            changeInOIAvailable: true,
            ivAvailable: typeof putGreeks.iv === 'number' && putGreeks.iv > 0
          };

          resultMap.set(strike.toString(), { ce: ceQuote, pe: peQuote });
        }
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] getOptionChainQuotes error:', err.message || err);
    }

    // If Upstox returned no chain rows or failed, fallback to Practice generator so UI is populated
    if (resultMap.size === 0) {
      resultMap = await this.practiceFallback.getOptionChainQuotes(symbol, expiry, strikes);
    }

    return resultMap;
  }

  public async getAvailableMargin(): Promise<{ available: number; source: 'LIVE' | 'PRACTICE' }> {
    if (!this.isConnected || !this.accessToken) {
      return { available: 1000000, source: 'PRACTICE' };
    }

    try {
      const res = await fetch('https://api.upstox.com/v2/user/get-funds-and-margin', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const json: any = await res.json();
        const equityMargin = json?.data?.equity?.available_margin || json?.data?.sec?.available_margin;
        if (typeof equityMargin === 'number') {
          return { available: equityMargin, source: 'LIVE' };
        }
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] getAvailableMargin error:', err.message || err);
    }

    return { available: 1000000, source: 'PRACTICE' };
  }

  /**
   * Strict account snapshot for REAL EMA BUY gating. Unlike UI margin helpers,
   * this method NEVER substitutes practice funds or an empty portfolio on error.
   */
  public async getEmaBrokerRiskSnapshot(
    instrumentKey: string, quantity: number, product: 'MIS' | 'NRML'
  ): Promise<BrokerRiskSnapshot | null> {
    const session=this.captureRiskReadIdentity();
    if (!session || !/^(NSE_FO|BSE_FO)\|[0-9]+$/.test(instrumentKey) ||
        !Number.isSafeInteger(quantity) || quantity<=0 || !['MIS','NRML'].includes(product)) return null;
    const startedAt=Date.now();
    const headers={Authorization:'Bearer '+session.bearerToken,Accept:'application/json'};
    const signal=AbortSignal.timeout(12000);
    try {
      const [fundsRes,marginRes,positionsRes]=await Promise.all([
        fetch('https://api.upstox.com/v2/user/get-funds-and-margin',{headers,signal}),
        fetch('https://api.upstox.com/v2/charges/margin',{
          method:'POST',headers:{...headers,'Content-Type':'application/json'},signal,
          body:JSON.stringify({instruments:[{instrument_key:instrumentKey,quantity,
            transaction_type:'BUY',product:product==='MIS'?'I':'D'}]})
        }),
        fetch('https://api.upstox.com/v2/portfolio/short-term-positions',{headers,signal})
      ]);
      if(!fundsRes.ok||!marginRes.ok||!positionsRes.ok||!this.currentRiskReadIdentity(session))return null;
      const [funds,margin,portfolio]=await Promise.all([fundsRes.json(),marginRes.json(),positionsRes.json()]);
      if(!this.currentRiskReadIdentity(session))return null;
      return parseBrokerRiskResponse(funds,margin,portfolio,startedAt,Date.now());
    } catch {
      console.warn('[EMA BROKER RISK] Verified broker account evidence unavailable');
      return null;
    }
  }

  /**
   * Fail-closed exchange quantity lookup for EMA real SELL. This is intentionally
   * NOT the UI's getPositions() method, which returns [] on transport errors.
   */
  public async getVerifiedLivePositionQuantity(
    instrumentKey: string, product: 'MIS' | 'NRML'
  ): Promise<number | null> {
    const session=this.captureRiskReadIdentity();
    if(!session||!instrumentKey)return null;
    try {
      const res = await fetch('https://api.upstox.com/v2/portfolio/short-term-positions', {
        signal:AbortSignal.timeout(12_000), headers: { Authorization: 'Bearer ' + session.bearerToken, Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      const positions=guardFullBrokerPositionRows(json?.data);
      if (json?.status !== 'success' || !positions) return null;
      // Phase119: consume the same validated/normalized native rows,
      // including the official Upstox 'quantity' -> net_quantity alias.
      // Never fall back to the original unvalidated JSON account list.
      const result = resolveUniqueBrokerNetPosition(positions,instrumentKey,product);
      return result.verified ? result.netQuantity : null;
    } catch (err: any) {
      console.warn('[EMA BROKER] Read-only verified position lookup unavailable');
      return null;
    }
  }

  /**
   * Phase91: broker-authoritative position rows for NRML safety review.
   * Unlike the UI's getPositions(), a disconnection/HTTP error returns
   * null, NEVER an empty list that might be misread as no exposure.
   * Read-only: no broker order or GTT modifications.
   */
  public async getVerifiedNrmlPositionRows(): Promise<any[] | null> {
    const session=this.captureRiskReadIdentity();
    if(!session)return null;
    try {
      const res = await fetch('https://api.upstox.com/v2/portfolio/short-term-positions', {
        signal:AbortSignal.timeout(12_000), headers: {
          'Authorization': 'Bearer ' + session.bearerToken,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      return json?.status === 'success'
        ? guardFullBrokerPositionRows(json?.data) : null;
    } catch {
      return null;
    }
  }

  public async getPositions(): Promise<any> {
    if (!this.isConnected || !this.accessToken) return [];

    try {
      const res = await fetch('https://api.upstox.com/v2/portfolio/short-term-positions', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const json: any = await res.json();
        return json.data || [];
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] Read-only positions unavailable');
    }
    return [];
  }

  public async placeOrder(params: any): Promise<any> {
    // A staging demo must NEVER promote a direct provider call into a live
    // Upstox POST, even if credentials are injected after server startup.
    if((process.env.PAPER_STAGING_MODE==='1'||process.env.PAPER_RC_LOCKED==='1'))
      throw new Error('PAPER_STAGING_BROKER_ORDER_DISABLED');
    // Automated tests must use an injected fake broker. Never reach real Upstox orders.
    if (process.env.NODE_ENV === 'test') {
      throw new Error('REAL_UPSTOX_ORDER_DISABLED_IN_TEST');
    }
    if (!this.isConnected || !this.accessToken) {
      throw new Error('Upstox API is not connected. Cannot execute live order.');
    }

    try {
      const body = {
        quantity: params.quantity,
        product: params.product === 'MIS' ? 'I' : 'D',
        validity: 'DAY',
        price: params.price || 0,
        tag: params.tag || 'delta_chain',
        instrument_token: params.instrumentToken || params.tradingsymbol || params.symbol,
        order_type: params.orderType || 'MARKET',
        transaction_type: params.transactionType || params.action || 'BUY',
        disclosed_quantity: 0,
        trigger_price: 0,
        is_amo: false
      };

      const res = await fetch('https://api.upstox.com/v2/order/place', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const json: any = await res.json();
      if (json.status === 'success') {
        return json.data;
      } else {
        const err: any = new Error(json.errors?.[0]?.message || 'Upstox order placement failed');
        // Only an explicit broker-side terminal error is evidence of rejection.
        // Timeouts, rate limits and unexpected gateway failures have UNKNOWN outcome.
        err.isBrokerRejection = res.status >= 400 && res.status < 500 &&
          ![408, 409, 425, 429].includes(res.status) &&
          Array.isArray(json.errors) && json.errors.length > 0;
        err.httpStatus = res.status;
        throw err;
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] placeOrder error:', err.message || err);
      throw err;
    }
  }

  /** Listed, exchange-authoritative option contracts for one underlying.
   * Live EMA entry must never use a formatted trading symbol as instrument_key.
   */
  public async getOptionContracts(underlyingKey: string): Promise<any[]> {
    if (!this.isConnected || !this.accessToken) {
      throw new Error('UPSTOX_CONTRACT_LOOKUP_DISCONNECTED');
    }
    const url = `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(underlyingKey)}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`UPSTOX_CONTRACT_LOOKUP_HTTP_${res.status}`);
    const json: any = await res.json();
    if (json?.status !== 'success' || !Array.isArray(json?.data)) {
      throw new Error('UPSTOX_CONTRACT_LOOKUP_INVALID_RESPONSE');
    }
    return json.data;
  }

  /**
   * Research-only broker option-chain snapshot for a verified listed expiry.
   * This is a GET; it cannot place, modify or cancel any Upstox order.
   * WARNING: API chain does not include a verified exchange snapshot age.
   */
  public async getAdaptiveOptionChain(underlyingKey: string, expiryDate: string): Promise<any[] | null> {
    if (!this.isConnected || !this.accessToken ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(expiryDate)) return null;
    const permittedKeys = new Set([
      'NSE_INDEX|Nifty 50', 'NSE_INDEX|Nifty Bank', 'BSE_INDEX|SENSEX'
    ]);
    if (!permittedKeys.has(underlyingKey)) return null;
    try {
      const url = 'https://api.upstox.com/v2/option/chain?instrument_key=' +
        encodeURIComponent(underlyingKey) + '&expiry_date=' + encodeURIComponent(expiryDate);
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + this.accessToken, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000)
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      return json?.status === 'success' && Array.isArray(json?.data) ? json.data : null;
    } catch (err: any) {
      console.warn('[EMA ADAPTIVE] Read-only option-chain snapshot unavailable:',
        err?.message || String(err));
      return null;
    }
  }

  /**
   * Adapter-declared Upstox D5 option depth + LTP, NOT a native stop ACK,
   * protected exchange order or guaranteed executable best-bid volume.
   */
  public async getLiveOptionQuote(instrumentKey: string): Promise<{
    price:number;exchangeTimestamp:string;instrumentKey:string;
    source:'UPSTOX_FULL_MARKET_QUOTE_V3_LTP';
    bookSource:'UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5';
    snapshotTimestamp:string;
    bestBidPrice:number;bestBidQuantity:number;
    bestAskPrice:number;bestAskQuantity:number;
  } | null> {
    const session=this.captureRiskReadIdentity();
    if (!session || !/^(?:NSE_FO|BSE_FO)\|[A-Za-z0-9_-]{1,240}$/.test(instrumentKey))
      return null;
    try {
      const url = 'https://api.upstox.com/v3/market-quote/quotes?instrument_key=' +
        encodeURIComponent(instrumentKey);
      const res = await fetch(url, {
        signal:AbortSignal.timeout(12_000),
        headers: { 'Authorization': 'Bearer ' + session.bearerToken, 'Accept': 'application/json' }
      });
      if (!res.ok) return null;
      const payload: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      if (payload?.status !== 'success' || !payload?.data ||
          typeof payload.data!=='object'||Array.isArray(payload.data))
        return null;
      const quotes: any[] = Object.values(payload.data);
      // Duplicate matching instrument rows in the response are ambiguous.
      const matching=quotes.filter(q=>q?.instrument_token===instrumentKey);
      if(matching.length!==1)return null;
      const quote=matching[0];
      const price=quote?.last_price;
      const timestamp=Number(quote?.last_trade_time);
      const now=Date.now();
      if(typeof price!=='number'||!Number.isFinite(price)||price<=0||
         !Number.isSafeInteger(timestamp)||timestamp<946684800000||
         timestamp>=4102444800000||
         timestamp>now+5000||now-timestamp>30000)return null;
      // Full quote V3: timestamp is the quote SNAPSHOT, unlike
      // last_trade_time (which is the most recent executed trade).
      const snapshot=parseStrictQuoteSnapshotTime(quote?.timestamp);
      if(snapshot===null||snapshot>now+3000||now-snapshot>10_000||
         timestamp>snapshot+2000)return null;
      const bids=quote?.depth?.buy,asks=quote?.depth?.sell;
      if(!Array.isArray(bids)||!Array.isArray(asks)||
         bids.length<1||asks.length<1||bids.length>5||asks.length>5)
        return null;
      const bestBid=bids[0],bestAsk=asks[0];
      if(typeof bestBid?.price!=='number'||
         typeof bestAsk?.price!=='number'||
         !Number.isFinite(bestBid.price)||
         !Number.isFinite(bestAsk.price)||
         bestBid.price<=0||bestAsk.price<=0||
         bestBid.price>bestAsk.price||
         typeof bestBid.quantity!=='number'||
         typeof bestAsk.quantity!=='number'||
         !Number.isSafeInteger(bestBid.quantity)||
         !Number.isSafeInteger(bestAsk.quantity)||
         bestBid.quantity<=0||bestAsk.quantity<=0)return null;
      if(!this.currentRiskReadIdentity(session))return null;
      return {price,exchangeTimestamp:new Date(timestamp).toISOString(),
        instrumentKey,source:'UPSTOX_FULL_MARKET_QUOTE_V3_LTP',
        bookSource:'UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5',
        snapshotTimestamp:new Date(snapshot).toISOString(),
        bestBidPrice:bestBid.price,bestBidQuantity:bestBid.quantity,
        bestAskPrice:bestAsk.price,bestAskQuantity:bestAsk.quantity};
    } catch {
      console.warn('[UPSTOX] Exact live option last-trade quote unavailable');
      return null;
    }
  }

  /**
   * Authoritative CURRENT-DAY broker order book; returns null on any error.
   * Never interpret transport failure as an empty exchange order book.
   */
  /** Broker ACTIVE GTT rules are separate from normal exchange orders.
   * Null means unavailable/ambiguous: real MARKET SELL must fail closed.
   */
  public async getGttOrders(): Promise<any[] | null> {
    const session=this.captureRiskReadIdentity();
    if(!session)return null;
    try {
      const res = await fetch('https://api.upstox.com/v3/order/gtt', {
        signal:AbortSignal.timeout(12_000), headers: { Authorization: 'Bearer ' + session.bearerToken, Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      return json?.status === 'success'
        ? guardFullBrokerGttList(json?.data) : null;
    } catch (err: any) {
      console.warn('[UPSTOX] Read-only GTT order state unavailable');
      return null;
    }
  }

  /** Phase92: broker-native GTT details by its exact ID (read-only).
   * This API cannot retrieve completed GTTs. Null is UNKNOWN, not absent.
   */
  public async getGttOrderDetails(gttId: string): Promise<any[] | null> {
    const session=this.captureRiskReadIdentity();
    if (!session ||
        !/^GTT-[A-Za-z0-9-]{1,240}$/.test(gttId)) return null;
    try {
      const url = 'https://api.upstox.com/v3/order/gtt?gtt_order_id=' +
        encodeURIComponent(gttId);
      const res = await fetch(url, {
        signal:AbortSignal.timeout(12_000), headers: { Authorization: 'Bearer ' + session.bearerToken, Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      return json?.status === 'success'
        ? guardExactBrokerGttGet(json?.data,gttId) : null;
    } catch { return null; }
  }

  /** Phase92: read exact generated child exchange order details, never write.
   * Null on API error or missing order; never fabricate an ACK or fill.
   */
  public async getOrderDetails(orderId: string): Promise<any | null> {
    const session=this.captureRiskReadIdentity();
    if (!session ||
        !/^[A-Za-z0-9-]{1,128}$/.test(orderId)) return null;
    try {
      const url = 'https://api.upstox.com/v2/order/details?order_id=' +
        encodeURIComponent(orderId);
      const res = await fetch(url, {
        signal:AbortSignal.timeout(12_000), headers: { Authorization: 'Bearer ' + session.bearerToken, Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      // A syntactically valid HTTP 200 with data:{} is NOT a native
      // order ACK. Validate the exact requested order before exposing
      // the record to read-only GTT child/SELL reconciliation.
      const row: any = json?.data;
      return json?.status === 'success' && row &&
        !Array.isArray(row) && typeof row === 'object' &&
        row.order_id === orderId &&
        typeof row.instrument_token === 'string' &&
        row.instrument_token.length > 0 &&
        ['I', 'D', 'CO', 'MTF'].includes(row.product) &&
        ['BUY', 'SELL'].includes(row.transaction_type) &&
        ['MARKET', 'LIMIT', 'SL', 'SL-M'].includes(row.order_type) &&
        typeof row.status === 'string' && row.status.length > 0 &&
        Number.isSafeInteger(row.quantity) && row.quantity > 0 &&
        Number.isSafeInteger(row.filled_quantity) &&
        row.filled_quantity >= 0 &&
        Number.isSafeInteger(row.pending_quantity) &&
        row.pending_quantity >= 0 &&
        row.filled_quantity + row.pending_quantity <= row.quantity
        ? row : null;
    } catch { return null; }
  }

  public async getOrderBook(): Promise<any[] | null> {
    const session=this.captureRiskReadIdentity();
    if(!session)return null;
    try {
      const res = await fetch('https://api.upstox.com/v2/order/retrieve-all', {
        signal:AbortSignal.timeout(12_000), headers: { Authorization: 'Bearer ' + session.bearerToken, Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      return json?.status === 'success'
        ? guardFullBrokerOrderBook(json?.data) : null;
    } catch (err: any) {
      console.warn('[UPSTOX] Read-only order book unavailable');
      return null;
    }
  }

  /**
   * Phase104: full-account F&O trade HISTORY by date range and page.
   * Distinct from the current-day order book. F&O history does not give
   * authenticated order_id/instrument_token linkage for a specific option;
   * the read-only validator must match trade ID + option contract fields.
   * No broker order or local DB changes.
   */
  public async getHistoricalFoTradesPage(
    startDate:string,endDate:string,pageNumber:number,pageSize:number
  ):Promise<unknown|null>{
    const session=this.captureRiskReadIdentity();
    const date=/^\d{4}-\d{2}-\d{2}$/;
    if(!session||
       !date.test(startDate)||!date.test(endDate)||
       !Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>20||
       !Number.isSafeInteger(pageSize)||pageSize!==1000)
      return null;
    try{
      const params=new URLSearchParams({
        segment:'FO',start_date:startDate,end_date:endDate,
        page_number:String(pageNumber),page_size:String(pageSize)
      });
      const res=await fetch(
        'https://api.upstox.com/v2/charges/historical-trades?'+params.toString(),
        {signal:AbortSignal.timeout(12_000), headers:{Authorization:'Bearer '+session.bearerToken,
          Accept:'application/json'}}
      );
      if(!res.ok)return null;
      const payload:unknown=await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      if(!payload||typeof payload!=='object'||Array.isArray(payload))
        return null;
      const reply=payload as Record<string,unknown>;
      return reply.status==='success'&&Array.isArray(reply.data)&&
        reply.meta_data&&typeof reply.meta_data==='object'
        ?payload:null;
    }catch{return null;}
  }

  /** Individual broker-reported current-day order executions.
   * Refuse malformed IDs and unavailable sources; NEVER coerce to [].
   * A broker trade ID/order ID is sensitive and must not enter logs.
   */
  public async getOrderTrades(orderId: string): Promise<any[] | null> {
    const session=this.captureRiskReadIdentity();
    if (!session ||
        !/^[A-Za-z0-9-]{1,128}$/.test(orderId)) return null;
    try {
      const res = await fetch(
        'https://api.upstox.com/v2/order/trades?order_id=' + encodeURIComponent(orderId),
        { signal:AbortSignal.timeout(12_000), headers: { Authorization: 'Bearer ' + session.bearerToken, Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const json: any = await res.json();
      if(!this.currentRiskReadIdentity(session))return null;
      return json?.status === 'success'
        ? guardExactBrokerOrderTrades(json?.data,orderId) : null;
    } catch {
      // No order IDs, bearer token, user details or raw broker error in logs.
      console.warn('[UPSTOX] Read-only order trades unavailable');
      return null;
    }
  }

  public async getOrderHistory(orderId: string): Promise<any[]> {
    if (!this.isConnected || !this.accessToken) return [];

    try {
      const res = await fetch(`https://api.upstox.com/v2/order/history?order_id=${encodeURIComponent(orderId)}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const json: any = await res.json();
        return Array.isArray(json.data) ? json.data : (json.data ? [json.data] : []);
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] Read-only order history unavailable');
    }
    return [];
  }

  public async getOrderMargins(orders: Array<{ instrument_key?: string; quantity: number; transaction_type: string; product?: string }>): Promise<any> {
    if (!this.isConnected || !this.accessToken) return null;

    try {
      const instruments = orders.map(o => ({
        instrument_key: o.instrument_key || 'NSE_INDEX|Nifty 50',
        quantity: o.quantity,
        transaction_type: o.transaction_type,
        product: o.product === 'MIS' ? 'I' : 'D'
      }));

      const res = await fetch('https://api.upstox.com/v2/charges/margin', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ instruments })
      });

      if (res.ok) {
        const json: any = await res.json();
        return json.data;
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] getOrderMargins error:', err.message || err);
    }
    return null;
  }
}

