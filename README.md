# DeltaChain AI - Options Trading Platform

DeltaChain AI is an institutional-grade options analytics, Greeks calculation, and basket execution platform.

## Zerodha Kite Connect Integration Guide

To connect live market data feed and place orders via Zerodha Kite Connect:

1. **Register Developer App**:
   - Create an account on [Zerodha Kite Connect Developer Console](https://kite.trade).
   - Create a new app and obtain your `API Key` (`KITE_API_KEY`) and `API Secret` (`KITE_API_SECRET`).
   - Set the Redirect URL in developer console to `http://localhost:3000/api/kite/callback` or your app URL.

2. **Generate Daily Access Token (`KITE_ACCESS_TOKEN`)**:
   - Open your browser and navigate to:
     `https://kite.zerodha.com/connect/login?api_key=YOUR_KITE_API_KEY&v=3`
   - Complete the Zerodha login and 2FA authentication.
   - Zerodha will redirect to your Redirect URL with a `request_token` parameter in the URL:
     `http://localhost:3000/api/kite/callback?request_token=XXXXXX&status=success`
   - Generate `access_token` using Zerodha API or POST request:
     ```bash
     curl -X POST https://api.kite.trade/session/token \
       -d "api_key=YOUR_KITE_API_KEY" \
       -d "request_token=YOUR_REQUEST_TOKEN" \
       -d "checksum=SHA256(api_key + request_token + api_secret)"
     ```
   - Copy the `access_token` returned from Zerodha response.

3. **Configure Environment Variables**:
   Set environment variables in your environment or `.env` file:
   ```env
   KITE_API_KEY="your_api_key"
   KITE_API_SECRET="your_api_secret"
   KITE_ACCESS_TOKEN="your_daily_access_token"
   ```

If `KITE_ACCESS_TOKEN` or `KITE_API_KEY` is not configured or invalid, the platform will display **"Broker not connected — live data unavailable"** instead of generating synthetic data.

---

## Implementation Status Tracker

| Phase | Feature Module | Status | Verification Details |
|---|---|---|---|
| **Phase A** | Option Chain & Greeks Engine | ✅ Completed | Real spot + NSE option chain + BS Greeks ($\Delta, \Gamma, \Theta, \nu$) |
| **Phase I** | Continuous Background Capture | ✅ Completed | Staggered 15s round-robin loop across 5 symbols |
| **Phase J** | Autonomous Strategy Runner | ✅ Completed | Full-auto execution, trailing SL, SQLite persistence |
| **Phase M** | Paper Trading Terminal & Multi-Leg Lifecycle | ✅ Verified | Multi-leg grouping, strict MTM availability check, group square-off, per-position lot size margin |

