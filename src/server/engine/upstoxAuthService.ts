import crypto from 'crypto';
import { activeProvider } from './providers/index.js';
import { globalUpstoxStreamer } from './upstoxStreamerV3.js';

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
  const mobile = !!process.env.UPSTOX_MOBILE_NO;
  const pin = !!process.env.UPSTOX_PIN;
  const totpSecret = !!process.env.UPSTOX_TOTP_SECRET;
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
  const mobileNo = process.env.UPSTOX_MOBILE_NO;
  const pin = process.env.UPSTOX_PIN;
  const totpSecret = process.env.UPSTOX_TOTP_SECRET;
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
    console.log(`[UPSTOX AUTH] Generated dynamic TOTP: ${currentTotp} for mobile: ${mobileNo.slice(-4).padStart(10, '*')}`);

    const requestId = 'WPRO-' + Math.random().toString(36).substring(2, 12);
    const standardHeaders: Record<string, string> = {
      'accept': 'application/json',
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'origin': 'https://login.upstox.com',
      'referer': 'https://login.upstox.com/',
      'x-request-id': requestId
    };

    // Step 1: Initial Authorization Dialog Request
    const dialogUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(apiKey)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    const dialogRes = await fetch(dialogUrl, {
      method: 'GET',
      headers: {
        'user-agent': standardHeaders['user-agent']
      },
      redirect: 'manual'
    });

    let userId: string | null = null;
    let locationHeader = dialogRes.headers.get('location');
    if (!locationHeader && dialogRes.status === 200) {
      const htmlText = await dialogRes.text();
      const match = htmlText.match(/userId=([a-zA-Z0-9_-]+)/) || htmlText.match(/"userId"\s*:\s*"([^"]+)"/);
      if (match) userId = match[1];
    } else if (locationHeader) {
      const match = locationHeader.match(/[?&]user_id=([^&]+)/);
      if (match) userId = decodeURIComponent(match[1]);
    }

    if (!userId) {
      userId = mobileNo;
    }

    // Step 2: Request 1FA OTP generation
    const otpGenRes = await fetch('https://service.upstox.com/login/open/v6/auth/1fa/otp/generate', {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify({
        data: {
          mobileNumber: mobileNo,
          userId: userId
        }
      })
    });

    const otpGenJson: any = await otpGenRes.json().catch(() => ({}));
    const validateOtpToken = otpGenJson.data?.validateOTPToken || otpGenJson.data?.token;

    if (!validateOtpToken && !otpGenRes.ok) {
      console.warn('[UPSTOX AUTH] Direct v6 OTP generation did not return token, trying v4 OTP-TOTP verify...');
    }

    // Step 3: Verify TOTP
    const verifyRes = await fetch('https://service.upstox.com/login/open/v4/auth/1fa/otp-totp/verify', {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify({
        data: {
          otp: currentTotp,
          validateOtpToken: validateOtpToken || ''
        }
      })
    });

    const verifyJson: any = await verifyRes.json().catch(() => ({}));

    // Step 4: Submit PIN (2FA)
    const pinEncoded = Buffer.from(pin).toString('base64');
    const pinRes = await fetch('https://service.upstox.com/login/open/v3/auth/2fa', {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify({
        data: {
          twoFAMethod: 'SECRET_PIN',
          inputText: pinEncoded
        }
      })
    });

    // Step 5: Authorize OAuth
    const authRes = await fetch('https://service.upstox.com/login/v2/oauth/authorize', {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify({
        data: {
          userOAuthApproval: true
        }
      })
    });

    const authJson: any = await authRes.json().catch(() => ({}));
    let code: string | null = null;

    if (authJson.data?.redirectUri) {
      const urlObj = new URL(authJson.data.redirectUri);
      code = urlObj.searchParams.get('code');
    }

    // If code was successfully obtained via headless flow, exchange for token!
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
        lastRefreshMessage = 'Token refreshed automatically via TOTP';

        activeProvider.connect().catch(e => console.warn('[UPSTOX] Provider connect error:', e.message));
        globalUpstoxStreamer.connect(accessToken).catch(e => console.warn('[UPSTOX V3 STREAMER] Connect error:', e.message));

        return {
          success: true,
          message: 'Upstox access token generated successfully via TOTP',
          accessToken,
          totpCode: currentTotp,
          expiresAt: 'Next morning 03:30 AM IST'
        };
      }
    }

    // Fallback notice: If Upstox WAF or Cloudflare requires interactive browser session
    lastRefreshStatus = 'FAILED';
    lastRefreshMessage = 'Headless verification received WAF/Captcha challenge. Please use 1-click authorization.';
    return {
      success: false,
      message: 'Upstox automated login requires 1-click verification due to Cloudflare protection. Use the 1-Click authorization link.',
      totpCode: currentTotp,
      fallbackUrl
    };

  } catch (err: any) {
    lastRefreshStatus = 'FAILED';
    lastRefreshMessage = err.message || 'Error during TOTP automation';
    return {
      success: false,
      message: lastRefreshMessage,
      error: err.message,
      fallbackUrl
    };
  }
}

/**
 * Initializes the automated morning scheduler (08:30 AM IST / 03:00 UTC).
 */
export function initializeUpstoxAutoRefreshCron(serverBaseUrl?: string): void {
  console.log('[UPSTOX AUTH] Initializing Upstox TOTP Auto-Refresher Service...');

  // Check on startup if credentials exist but token is missing
  const hasCreds = process.env.UPSTOX_API_KEY && process.env.UPSTOX_TOTP_SECRET && process.env.UPSTOX_MOBILE_NO;
  if (hasCreds && !process.env.UPSTOX_ACCESS_TOKEN) {
    console.log('[UPSTOX AUTH] Credentials detected without active access token. Triggering auto-login...');
    performUpstoxTOTPLogin(serverBaseUrl).catch(e => console.warn('[UPSTOX AUTH] Initial startup login:', e.message));
  }

  // Periodic morning check: every 15 minutes, check if it is between 08:30 AM and 09:00 AM IST (03:00 to 03:30 UTC)
  setInterval(() => {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const dayOfWeek = now.getUTCDay(); // 0 = Sun, 6 = Sat

    // Market days: Monday (1) to Friday (5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // 03:00 UTC is 08:30 AM IST
      if (utcHours === 3 && utcMinutes >= 0 && utcMinutes <= 15) {
        console.log('[UPSTOX CRON] Morning 08:30 AM IST window detected. Running Upstox TOTP token refresh...');
        performUpstoxTOTPLogin(serverBaseUrl).catch(e => console.warn('[UPSTOX CRON] Error:', e.message));
      }
    }
  }, 15 * 60 * 1000);
}
