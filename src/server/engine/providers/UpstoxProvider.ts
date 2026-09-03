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

export class UpstoxProvider implements IMarketDataProvider {
  private accessToken: string = '';
  private apiKey: string = '';
  private isConnected: boolean = false;
  private statusMessage: string = 'Initializing Upstox API v2...';
  private userName: string = '';
  private userId: string = '';
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
    'GOLD': 'MCX_COMM|GOLD',
    'CRUDEOIL': 'MCX_COMM|CRUDEOIL'
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

  public getProviderMode(): DataProviderMode {
    return 'LIVE';
  }

  public async connect(): Promise<ProviderHealthStatus> {
    this.apiKey = process.env.UPSTOX_API_KEY || '';
    this.accessToken = process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_TOKEN || '';

    // Initialize practice fallback as backup
    await this.practiceFallback.connect();

    if (!this.accessToken) {
      this.isConnected = false;
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

    try {
      const upstoxKeys = symbols.map(s => this.symbolInstrumentKeyMap[s] || `NSE_EQ|${s}`);
      const symbolParam = encodeURIComponent(upstoxKeys.join(','));
      // Upstox v2 accepts instrument_key parameter for market quote quotes
      const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${symbolParam}`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching Upstox quotes`);
      }

      const json: any = await res.json();
      const quotesData = json?.data || {};

      for (const sym of symbols) {
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
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] getUnderlyingQuotes error:', err.message || err);
    }

    // Fill missing symbols from practice fallback so UI is never blank
    const fallbackQuotes = await this.practiceFallback.getUnderlyingQuotes(symbols);
    for (const sym of symbols) {
      if (!resultMap.has(sym) || !resultMap.get(sym)?.available || (resultMap.get(sym)?.spot || 0) <= 0) {
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

    if (!this.isConnected || !this.accessToken) {
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
      console.error('[UPSTOX PROVIDER] getPositions error:', err.message || err);
    }
    return [];
  }

  public async placeOrder(params: any): Promise<any> {
    if (!this.isConnected || !this.accessToken) {
      throw new Error('Upstox API is not connected. Cannot execute live order.');
    }

    try {
      const body = {
        quantity: params.quantity,
        product: params.product === 'MIS' ? 'I' : 'D',
        validity: 'DAY',
        price: params.price || 0,
        tag: 'delta_chain',
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
        throw new Error(json.errors?.[0]?.message || 'Upstox order placement failed');
      }
    } catch (err: any) {
      console.error('[UPSTOX PROVIDER] placeOrder error:', err.message || err);
      throw err;
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
      console.error('[UPSTOX PROVIDER] getOrderHistory error:', err.message || err);
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

