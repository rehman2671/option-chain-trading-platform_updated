/**
 * Upstox Zero-Click Residential Bridge Daemon
 * 
 * Runs on local machine (residential IP) where Upstox Cloudflare WAF does NOT block OTP requests.
 * Automatically completes 2FA, retrieves access token, and pushes it to your cloud platform.
 * 
 * Usage:
 *   node scripts/upstox_zero_click.js
 *   node scripts/upstox_zero_click.js --app-url https://your-app.ai.studio
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

function base32ToBuffer(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
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

function generateTOTP(secret, timeStepSeconds = 30) {
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
  return (binary % 1000000).toString().padStart(6, '0');
}

async function runZeroClickResidentialSync() {
  const apiKey = process.env.UPSTOX_API_KEY;
  const apiSecret = process.env.UPSTOX_API_SECRET;
  const mobileNo = process.env.UPSTOX_MOBILE_NO || process.env.UPSTOX_CLIENT_ID || process.env.UPSTOX_USER_ID;
  const pin = process.env.UPSTOX_PIN;
  const totpSecret = process.env.UPSTOX_TOTP_SECRET || process.env.UPSTOX_TOTP_KEY;

  const appUrlArg = process.argv.find(a => a.startsWith('--app-url='));
  const appUrl = appUrlArg
    ? appUrlArg.split('=')[1].replace(/\/$/, '')
    : (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  const redirectUri = process.env.UPSTOX_REDIRECT_URI || `${appUrl}/api/upstox/callback`;

  console.log('====================================================');
  console.log('🚀 UPSTOX 0-CLICK RESIDENTIAL AUTHENTICATION DAEMON');
  console.log('====================================================');
  console.log(`Target Platform: ${appUrl}`);
  console.log(`Mobile: ${mobileNo ? mobileNo.slice(-4).padStart(10, '*') : 'MISSING'}`);

  if (!apiKey || !apiSecret || !mobileNo || !pin || !totpSecret) {
    console.error('❌ Missing credentials in .env (UPSTOX_API_KEY, UPSTOX_API_SECRET, UPSTOX_MOBILE_NO, UPSTOX_PIN, UPSTOX_TOTP_SECRET)');
    process.exit(1);
  }

  const currentTotp = generateTOTP(totpSecret);
  console.log(`🔑 Dynamic RFC-6238 TOTP Generated: ${currentTotp}`);

  const cookieJar = new Map();
  const saveCookies = (res) => {
    const getSetCookie = res.headers.getSetCookie;
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

  // 1. Initial Dialog
  console.log('Step 1: Requesting OAuth Authorization Dialog...');
  const dialogUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(apiKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&user_type=individual&user_id=${encodeURIComponent(mobileNo)}`;
  const dialogRes = await fetch(dialogUrl, {
    method: 'GET',
    headers: { 'user-agent': upstoxUa },
    redirect: 'manual'
  });
  saveCookies(dialogRes);

  let userId = null;
  const locationHeader = dialogRes.headers.get('location');
  if (locationHeader) {
    try {
      const parsedUrl = new URL(locationHeader);
      userId = parsedUrl.searchParams.get('user_id');
    } catch {
      const match = locationHeader.match(/[?&]user_id=([^&]+)/);
      if (match) userId = decodeURIComponent(match[1]);
    }
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
  if (!userId) userId = mobileNo;

  const sessionHeaders = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'user-agent': upstoxUa,
    'x-device-details': deviceDetails,
    'x-request-id': `WPRO-${crypto.randomBytes(6).toString('hex')}`,
    'origin': 'https://login.upstox.com',
    'referer': locationHeader || 'https://login.upstox.com/',
    'cookie': getCookieString()
  };

  // 2. Request OTP
  console.log('Step 2: Requesting 1FA OTP via residential connection...');
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

  const otpGenJson = await otpGenRes.json().catch(() => ({}));
  const validateOtpToken = otpGenJson.data?.validateOTPToken || otpGenJson.data?.token || '';

  // 3. Verify TOTP
  console.log('Step 3: Submitting dynamic TOTP...');
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
    const verifyJson = await verifyRes.json().catch(() => ({}));
    if (verifyJson.success) break;
  }

  // 4. Submit PIN (2FA)
  console.log('Step 4: Submitting 6-Digit PIN...');
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
    const pJson = await pinRes.json().catch(() => ({}));
    if (pJson.success) break;
  }

  // 5. Authorize OAuth
  console.log('Step 5: Authorizing OAuth Code...');
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

  const authJson = await authRes.json().catch(() => ({}));
  let code = null;
  if (authJson.data?.redirectUri) {
    const urlObj = new URL(authJson.data.redirectUri);
    code = urlObj.searchParams.get('code');
  }

  if (!code) {
    console.error('❌ Failed to retrieve authorization code. Details:', JSON.stringify(authJson));
    process.exit(1);
  }

  // 6. Token Exchange
  console.log(`Step 6: Exchanging Code for Access Token... Code: ${code.slice(0, 6)}...`);
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

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error('❌ Token exchange failed:', tokenJson);
    process.exit(1);
  }

  const accessToken = tokenJson.access_token;
  console.log('✅ Access Token retrieved successfully!');

  // 7. Push to Cloud Platform
  console.log(`Step 7: Pushing active token to cloud platform (${appUrl}/api/upstox/set-token)...`);
  const pushRes = await fetch(`${appUrl}/api/upstox/set-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ accessToken })
  });

  const pushJson = await pushRes.json().catch(() => ({}));
  if (pushRes.ok && pushJson.success) {
    console.log('🎉 SUCCESS! Upstox token synced to platform. Real-time Protobuf Streamer CONNECTED.');
  } else {
    console.log('⚠️ Token retrieved but push returned:', pushJson);
  }
}

runZeroClickResidentialSync().catch(err => {
  console.error('Fatal daemon error:', err);
});
