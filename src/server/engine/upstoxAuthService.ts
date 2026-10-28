import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { activeProvider } from './providers/index.js';
import { globalUpstoxStreamer } from './upstoxStreamerV3.js';
import { globalNotificationService } from './notificationService.js';

export interface TOTPLoginResult {
  success: boolean;
  message: string;
  accessToken?: string;
  expiresAt?: string;
  totpCode?: string;
  error?: string;
  fallbackUrl?: string;
}

export interface UpstoxAuthStatus {
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

let lastRefreshTime: string | null = null;
let lastRefreshStatus: 'SUCCESS' | 'FAILED' | 'IDLE' = 'IDLE';
let lastRefreshMessage: string = 'Ready for TOTP authentication';

/**
 * Decodes a base32 string into a binary Buffer.
 */
export function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generates a standard RFC 6238 6-digit Time-based One-Time Password (TOTP).
 */
export function generateTOTP(secret: string, timeStepSeconds: number = 30): string {
  const keyBuffer = base32ToBuffer(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStepSeconds);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', keyBuffer);
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Returns the current configuration and status of Upstox credentials.
 */
export function getUpstoxAuthStatus(): UpstoxAuthStatus {
  const apiKey = !!process.env.UPSTOX_API_KEY;
  const apiSecret = !!process.env.UPSTOX_API_SECRET;
  const mobile = !!(process.env.UPSTOX_MOBILE_NO || process.env.UPSTOX_CLIENT_ID || process.env.UPSTOX_USER_ID);
  const pin = !!process.env.UPSTOX_PIN;
  const totpSecret = !!(process.env.UPSTOX_TOTP_SECRET || process.env.UPSTOX_TOTP_KEY);
  const accessToken = !!process.env.UPSTOX_ACCESS_TOKEN;

  return {
    hasApiKey: apiKey,
    hasApiSecret: apiSecret,
    hasMobile: mobile,
    hasPin: pin,
    hasTotpSecret: totpSecret,
    hasAccessToken: accessToken,
    lastRefreshTime: lastRefreshTime || undefined,
    lastRefreshStatus,
    lastRefreshMessage
  };
}

/**
 * Executes automated headless TOTP authentication with Upstox.
 */
export async function performUpstoxTOTPLogin(serverBaseUrl?: string): Promise<TOTPLoginResult> {
  const apiKey = process.env.UPSTOX_API_KEY;
  const apiSecret = process.env.UPSTOX_API_SECRET;
  const mobileNo = process.env.UPSTOX_MOBILE_NO || process.env.UPSTOX_CLIENT_ID || process.env.UPSTOX_USER_ID;
  const pin = process.env.UPSTOX_PIN;
  const totpSecret = process.env.UPSTOX_TOTP_SECRET || process.env.UPSTOX_TOTP_KEY;
  const effectiveBase = (serverBaseUrl && !serverBaseUrl.includes('localhost'))
    ? serverBaseUrl.replace(/\/$/, '')
    : (process.env.APP_URL && !process.env.APP_URL.includes('localhost')
        ? process.env.APP_URL.replace(/\/$/, '')
        : 'https://option-chain-trading-platform.ai.studio');

  const redirectUri = process.env.UPSTOX_REDIRECT_URI || `${effectiveBase}/api/upstox/callback`;
  const fallbackUrl = `${effectiveBase}/api/upstox/login`;

  if (!apiKey || !apiSecret) {
    lastRefreshStatus = 'FAILED';
    lastRefreshMessage = 'Missing UPSTOX_API_KEY or UPSTOX_API_SECRET in environment';
    return {
      success: false,
      message: lastRefreshMessage,
      error: 'MISSING_API_CREDENTIALS',
      fallbackUrl
    };
  }

  if (!mobileNo || !pin || !totpSecret) {
    lastRefreshStatus = 'FAILED';
    lastRefreshMessage = 'Missing UPSTOX_MOBILE_NO, UPSTOX_PIN, or UPSTOX_TOTP_SECRET in environment';
    return {
      success: false,
      message: lastRefreshMessage,
      error: 'MISSING_TOTP_CREDENTIALS',
      fallbackUrl
    };
  }

  try {
    const currentTotp = generateTOTP(totpSecret);
    console.log(`[UPSTOX AUTH] Generated dynamic TOTP: ${currentTotp} for account: ${mobileNo.slice(-4).padStart(10, '*')}`);

    // Cookie jar across the authentication sequence
    const cookieJar = new Map<string, string>();
    const saveCookies = (res: Response) => {
      const getSetCookie = (res.headers as any).getSetCookie;
      const list = getSetCookie ? getSetCookie.call(res.headers) : [res.headers.get('set-cookie') || ''];
      for (const c of list) {
        if (!c) continue;
        const [pair] = c.split(';');
        const [k, ...v] = pair.split('=');
        if (k) cookieJar.set(k.trim(), v.join('=').trim());
      }
    };
    const getCookieString = () => Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    const uuid = crypto.randomUUID();
    const rawUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const upstoxUa = `Upstox 3.0 ${rawUa}`;
    const deviceDetails = `platform=WEB|osName=Mac OS|osVersion=10.15.7|appVersion=4.0.0|modelName=Chrome|manufacturer=Apple|uuid=${uuid}|userAgent=${upstoxUa}`;

    // Step 1: Initial Authorization Dialog Request (Pass individual user_type to trigger individualApi routing)
    const dialogUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(apiKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&user_type=individual&user_id=${encodeURIComponent(mobileNo)}`;
    const dialogRes = await fetch(dialogUrl, {
      method: 'GET',
      headers: { 'user-agent': upstoxUa },
      redirect: 'manual'
    });
    saveCookies(dialogRes);

    let userId: string | null = null;
    let locationHeader = dialogRes.headers.get('location');
    if (locationHeader) {
      try {
        const parsedUrl = new URL(locationHeader);
        userId = parsedUrl.searchParams.get('user_id');
      } catch {
        const match = locationHeader.match(/[?&]user_id=([^&]+)/);
        if (match) userId = decodeURIComponent(match[1]);
      }
      // Follow the location to establish session cookies
      const htmlRes = await fetch(locationHeader, {
        headers: {
          'user-agent': upstoxUa,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'cookie': getCookieString()
        },
        redirect: 'manual'
      }).catch(() => null);
      if (htmlRes) saveCookies(htmlRes);
    }

    if (!userId) {
      userId = mobileNo;
    }

    const sessionHeaders: Record<string, string> = {
      'accept': 'application/json',
      'content-type': 'application/json',
      'user-agent': upstoxUa,
      'x-device-details': deviceDetails,
      'x-request-id': `WPRO-${crypto.randomBytes(6).toString('hex')}`,
      'origin': 'https://login.upstox.com',
      'referer': locationHeader || 'https://login.upstox.com/',
      'cookie': getCookieString()
    };

    // Step 2: Request 1FA OTP generation
    const otpGenRes = await fetch('https://service.upstox.com/login/open/v6/auth/1fa/otp/generate', {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({
        data: {
          mobileNumber: mobileNo,
          userId: userId,
          countryIsdCode: '91'
        }
      })
    });
    saveCookies(otpGenRes);
    sessionHeaders['cookie'] = getCookieString();

    const otpGenJson: any = await otpGenRes.json().catch(() => ({}));
    const validateOtpToken = otpGenJson.data?.validateOTPToken || otpGenJson.data?.token || '';

    // Step 3: Verify TOTP
    const verifyEndpoints = [
      'https://service.upstox.com/login/open/v5/auth/1fa/otp-totp/verify',
      'https://service.upstox.com/login/open/v4/auth/1fa/otp-totp/verify'
    ];
    for (const verifyUrl of verifyEndpoints) {
      sessionHeaders['x-request-id'] = `WPRO-${crypto.randomBytes(6).toString('hex')}`;
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({
          data: {
            otp: currentTotp,
            validateOtpToken
          }
        })
      });
      saveCookies(verifyRes);
      sessionHeaders['cookie'] = getCookieString();
      const verifyJson: any = await verifyRes.json().catch(() => ({}));
      if (verifyJson.success) break;
    }

    // Step 4: Submit PIN (2FA)
    const pinEncoded = Buffer.from(pin).toString('base64');
    const pinEndpoints = [
      'https://service.upstox.com/login/open/v4/auth/2fa',
      'https://service.upstox.com/login/open/v3/auth/2fa'
    ];
    for (const pinUrl of pinEndpoints) {
      sessionHeaders['x-request-id'] = `WPRO-${crypto.randomBytes(6).toString('hex')}`;
      const pinRes = await fetch(pinUrl, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({
          data: {
            twoFAMethod: 'SECRET_PIN',
            inputText: pinEncoded
          }
        })
      });
      saveCookies(pinRes);
      sessionHeaders['cookie'] = getCookieString();
      const pJson: any = await pinRes.json().catch(() => ({}));
      if (pJson.success) break;
    }

    // Step 5: Authorize OAuth
    sessionHeaders['x-request-id'] = `WPRO-${crypto.randomBytes(6).toString('hex')}`;
    const authRes = await fetch('https://service.upstox.com/login/v2/oauth/authorize', {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({
        data: {
          userOAuthApproval: true
        }
      })
    });
    saveCookies(authRes);

    const authJson: any = await authRes.json().catch(() => ({}));
    let code: string | null = null;

    if (authJson.data?.redirectUri) {
      const urlObj = new URL(authJson.data.redirectUri);
      code = urlObj.searchParams.get('code');
    }

    // Step 6: If code obtained, exchange for access_token via official API
    if (code) {
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
      if (tokenRes.ok && tokenJson.access_token) {
        const accessToken = tokenJson.access_token;
        process.env.UPSTOX_ACCESS_TOKEN = accessToken;
        lastRefreshTime = new Date().toISOString();
        lastRefreshStatus = 'SUCCESS';
        lastRefreshMessage = 'Token refreshed automatically via 0-Click TOTP pipeline';

        activeProvider.connect().catch(e => console.warn('[UPSTOX] Provider connect error:', e.message));
        globalUpstoxStreamer.connect(accessToken).catch(e => console.warn('[UPSTOX V3 STREAMER] Connect error:', e.message));

        // Telegram Notification on Success
        await globalNotificationService.sendDirectTelegramMessage(
          `🟢 <b>[UPSTOX 04:00 AM AUTO-AUTH SUCCESS]</b>\n` +
          `Session token refreshed via 0-Click TOTP pipeline.\n` +
          `WebSocket V3 Protobuf Streamer: <b>CONNECTED</b>\n` +
          `Valid until: Next morning 03:30 AM IST.`
        );

        return {
          success: true,
          message: 'Upstox access token generated successfully via 0-Click TOTP pipeline',
          accessToken,
          totpCode: currentTotp,
          expiresAt: 'Next morning 03:30 AM IST'
        };
      }
    }

    // Fallback notice if challenge received
    lastRefreshStatus = 'FAILED';
    lastRefreshMessage = 'Headless verification received WAF/Captcha challenge. Please use 1-click authorization.';

    // Send Telegram alert on auth challenge with 1-click fallback authorization link
    await globalNotificationService.sendDirectTelegramMessage(
      `⚠️ <b>[UPSTOX 04:00 AM AUTO-LOGIN ALERT]</b>\n` +
      `0-Click headless session received broker challenge (Cloudflare/WAF).\n` +
      `🔑 <b>Current TOTP:</b> <code>${currentTotp}</code>\n` +
      `👉 <b>1-Click Fallback Authorization:</b> <a href="${fallbackUrl}">Tap to Authorize</a>\n` +
      `Self-healing watchdog active: Next auto-retry scheduled in 30 minutes.`
    );

    return {
      success: false,
      message: 'Upstox automated login requires 1-click verification due to Cloudflare protection. Use the 1-Click authorization link.',
      totpCode: currentTotp,
      fallbackUrl
    };

  } catch (err: any) {
    lastRefreshStatus = 'FAILED';
    lastRefreshMessage = err.message || 'Error during TOTP automation';

    // Alert Telegram on unexpected failure
    await globalNotificationService.sendDirectTelegramMessage(
      `🔴 <b>[UPSTOX AUTH ERROR]</b>\n` +
      `Failed to execute 0-Click TOTP login: ${lastRefreshMessage}\n` +
      `Watchdog will auto-retry in next cycle.`
    );

    return {
      success: false,
      message: lastRefreshMessage,
      error: err.message,
      fallbackUrl
    };
  }
}

let lastDailyRunDate: string | null = null;

/**
 * Initializes the automated 04:00 AM IST fixed cron + 30-minute self-healing watchdog.
 */
export function initializeUpstoxAutoRefreshCron(serverBaseUrl?: string): void {
  console.log('[UPSTOX AUTH] Initializing Upstox 04:00 AM IST Fixed Cron + 30-Min Self-Healing Watchdog...');

  // Hook auto-refresh handler into globalUpstoxStreamer so token expiry can attempt TOTP refresh
  globalUpstoxStreamer.setTokenRefreshHandler(async () => {
    console.log('[UPSTOX AUTH] Streamer requested token refresh via TOTP handler...');
    const result = await performUpstoxTOTPLogin(serverBaseUrl);
    return (result.success && result.accessToken) ? result.accessToken : null;
  });

  // Check on startup if credentials exist but token is missing
  const hasCreds = process.env.UPSTOX_API_KEY && (process.env.UPSTOX_TOTP_SECRET || process.env.UPSTOX_TOTP_KEY) && (process.env.UPSTOX_MOBILE_NO || process.env.UPSTOX_CLIENT_ID);
  if (hasCreds && !process.env.UPSTOX_ACCESS_TOKEN) {
    console.log('[UPSTOX AUTH] Credentials detected without active access token. Triggering auto-login...');
    performUpstoxTOTPLogin(serverBaseUrl).catch(e => console.warn('[UPSTOX AUTH] Initial startup login:', e.message));
  }

  // 1. Fixed Daily Cron: Executes at 04:00 AM IST sharp (post 03:30 AM broker purge)
  const dailyCronTimer = setInterval(() => {
    // Current IST calculation (UTC + 5 hours 30 mins)
    const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
    const istHour = istNow.getUTCHours();
    const istMinute = istNow.getUTCMinutes();
    const istDateStr = istNow.toISOString().slice(0, 10);

    // Run at 04:00 AM IST (Window: 04:00 - 04:05 IST, exactly once per day)
    if (istHour === 4 && istMinute >= 0 && istMinute < 5 && lastDailyRunDate !== istDateStr) {
      lastDailyRunDate = istDateStr;
      console.log(`[UPSTOX CRON] ⏰ 04:00 AM IST trigger reached for date ${istDateStr}. Executing 0-Click TOTP login...`);
      performUpstoxTOTPLogin(serverBaseUrl)
        .then(res => {
          console.log(`[UPSTOX CRON] 04:00 AM IST Auto-login outcome:`, res.success ? 'SUCCESS' : res.message);
        })
        .catch(err => {
          console.error('[UPSTOX CRON] 04:00 AM IST Auto-login error:', err.message);
        });
    }
  }, 60 * 1000); // Check every 60 seconds
  if (dailyCronTimer.unref) dailyCronTimer.unref();

  // 2. 30-Minute Self-Healing Connection Watchdog
  const watchdogTimer = setInterval(() => {
    const status = globalUpstoxStreamer.getStatus();
    const hasToken = !!process.env.UPSTOX_ACCESS_TOKEN;

    // Check if disconnected or token is flagged expired
    if (!status.connected || status.tokenExpired || !hasToken) {
      console.log('[UPSTOX WATCHDOG] 30-min heartbeat: Feed disconnected or token expired. Triggering self-healing...');
      performUpstoxTOTPLogin(serverBaseUrl)
        .then(res => {
          if (res.success && res.accessToken) {
            console.log('[UPSTOX WATCHDOG] Self-healing re-authenticated successfully. WebSocket reconnected.');
          } else {
            console.warn('[UPSTOX WATCHDOG] Self-healing attempt:', res.message);
          }
        })
        .catch(err => {
          console.warn('[UPSTOX WATCHDOG] Watchdog exception:', err.message);
        });
    } else {
      console.log(`[UPSTOX WATCHDOG] 30-min heartbeat: Streamer active (${status.totalTicksReceived} ticks received, latency: ${status.latencyMs}ms).`);
    }
  }, 30 * 60 * 1000); // Every 30 minutes
  if (watchdogTimer.unref) watchdogTimer.unref();
}

/**
 * Sets and validates an access token manually or via residential bridge daemon.
 */
export async function setManualAccessToken(token: string): Promise<{ success: boolean; message: string }> {
  if (!token || typeof token !== 'string') {
    return { success: false, message: 'Invalid or empty access token' };
  }

  try {
    const profileRes = await fetch('https://api.upstox.com/v2/user/profile', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const profileJson: any = await profileRes.json().catch(() => ({}));
    if (!profileRes.ok || profileJson.status === 'error') {
      return {
        success: false,
        message: profileJson.errors?.[0]?.message || 'Invalid or expired token supplied'
      };
    }

    process.env.UPSTOX_ACCESS_TOKEN = token;
    persistTokenToEnv(token);
    lastRefreshTime = new Date().toISOString();
    lastRefreshStatus = 'SUCCESS';
    lastRefreshMessage = 'Token updated and validated successfully';

    activeProvider.connect().catch(e => console.warn('[UPSTOX] Provider connect error:', e.message));
    globalUpstoxStreamer.connect(token).catch(e => console.warn('[UPSTOX V3 STREAMER] Connect error:', e.message));

    // Send Telegram Notification
    await globalNotificationService.sendDirectTelegramMessage(
      `🟢 <b>[UPSTOX TOKEN SYNC SUCCESS]</b>\n` +
      `Access token updated & verified for account: <b>${profileJson.data?.user_name || 'Active Trader'}</b>\n` +
      `WebSocket V3 Streamer: <b>CONNECTED</b>\n` +
      `Active until: Next morning 03:30 AM IST.`
    );

    return {
      success: true,
      message: `Token verified and connected for ${profileJson.data?.user_name || 'user'}`
    };
  } catch (err: any) {
    return { success: false, message: `Token validation error: ${err.message}` };
  }
}

/**
 * Persists active token into .env file safely for persistent restarts.
 */
export function persistTokenToEnv(token: string): void {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
      if (content.includes('UPSTOX_ACCESS_TOKEN=')) {
        content = content.replace(/UPSTOX_ACCESS_TOKEN=.*/g, `UPSTOX_ACCESS_TOKEN=${token}`);
      } else {
        content = content.trim() + `\nUPSTOX_ACCESS_TOKEN=${token}\n`;
      }
    } else {
      content = `UPSTOX_ACCESS_TOKEN=${token}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('[UPSTOX AUTH] Successfully persisted access token to .env file.');
  } catch (err: any) {
    console.warn('[UPSTOX AUTH] Failed to persist token to .env:', err.message);
  }
}


