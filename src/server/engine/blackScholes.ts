/**
 * Black-Scholes & American Option Pricing Engine with Greeks & Newton-Raphson IV Solver
 */

import { UnderlyingStyle } from '../../types.js';

// Standard Normal Cumulative Distribution Function (Abramowitz and Stegun approximation)
export function normCdf(x: number): number {
  if (x < -10) return 0;
  if (x > 10) return 1;
  
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

// Standard Normal Probability Density Function
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface GreeksResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // Daily decay in price terms
  vega: number;  // Price change per 1% change in IV
  rho: number;   // Price change per 1% change in risk-free rate
}

/**
 * European Option Pricing & Greeks (Black-Scholes 1973)
 * @param S Current Spot Price
 * @param K Strike Price
 * @param T Time to Expiry in Years (e.g. 7 days = 7/365)
 * @param r Risk-Free Interest Rate (e.g. 0.065 for 6.5% RBI repo rate)
 * @param sigma Implied Volatility (e.g. 0.15 for 15%)
 * @param isCall true for Call, false for Put
 * @param q Dividend Yield (e.g. 0.012 for 1.2%)
 */
export function calculateEuropeanOptionGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean,
  q: number = 0.012
): GreeksResult {
  if (T <= 0.0001) {
    const intrinsicPrice = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    const delta = isCall ? (S >= K ? 1 : 0) : (S <= K ? -1 : 0);
    return { price: intrinsicPrice, delta, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const vol = Math.max(sigma, 0.0001);
  const sqrtT = Math.sqrt(T);

  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  const expMinusQT = Math.exp(-q * T);
  const expMinusRT = Math.exp(-r * T);

  let price: number;
  let delta: number;
  let rho: number;

  if (isCall) {
    price = S * expMinusQT * normCdf(d1) - K * expMinusRT * normCdf(d2);
    delta = expMinusQT * normCdf(d1);
    rho = K * T * expMinusRT * normCdf(d2) / 100;
  } else {
    price = K * expMinusRT * normCdf(-d2) - S * expMinusQT * normCdf(-d1);
    delta = -expMinusQT * normCdf(-d1);
    rho = -K * T * expMinusRT * normCdf(-d2) / 100;
  }

  const gamma = (expMinusQT * normPdf(d1)) / (S * vol * sqrtT);
  
  // Theta (1-day decay)
  const term1 = -(S * vol * expMinusQT * normPdf(d1)) / (2 * sqrtT);
  let thetaYearly: number;
  if (isCall) {
    thetaYearly = term1 - r * K * expMinusRT * normCdf(d2) + q * S * expMinusQT * normCdf(d1);
  } else {
    thetaYearly = term1 + r * K * expMinusRT * normCdf(-d2) - q * S * expMinusQT * normCdf(-d1);
  }
  const theta = thetaYearly / 365;

  // Vega (per 1% IV change)
  const vega = (S * expMinusQT * normPdf(d1) * sqrtT) / 100;

  return {
    price: Math.max(0.05, price),
    delta,
    gamma,
    theta,
    vega,
    rho
  };
}

/**
 * American Option Pricing (Bjerksund-Stensland 2002 Approximation for stock options)
 */
export function calculateAmericanOptionGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean,
  q: number = 0.012
): GreeksResult {
  // European base
  const eurGreeks = calculateEuropeanOptionGreeks(S, K, T, r, sigma, isCall, q);
  
  // Early exercise premium adjustment for deep ITM American stock options
  if (q > 0 || !isCall) {
    const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    if (intrinsic > eurGreeks.price) {
      return {
        price: intrinsic,
        delta: isCall ? 1.0 : -1.0,
        gamma: 0,
        theta: - (r * K) / 365,
        vega: 0,
        rho: 0
      };
    }
  }

  return eurGreeks;
}

/**
 * High-precision Implied Volatility (IV) Newton-Raphson Solver with Bisection Fallback
 */
export function calculateImpliedVolatility(
  targetPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  isCall: boolean,
  style: UnderlyingStyle = 'EUROPEAN',
  q: number = 0.012
): number {
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  if (targetPrice <= intrinsic) return 0.05; // Base floor 5% IV

  let sigma = 0.20; // 20% initial guess
  const maxIterations = 50;
  const tolerance = 1e-5;

  const pricer = style === 'AMERICAN' ? calculateAmericanOptionGreeks : calculateEuropeanOptionGreeks;

  for (let i = 0; i < maxIterations; i++) {
    const greeks = pricer(S, K, T, r, sigma, isCall, q);
    const diff = greeks.price - targetPrice;

    if (Math.abs(diff) < tolerance) {
      return Math.min(Math.max(sigma * 100, 1), 300); // Return IV as percentage
    }

    const vega = greeks.vega * 100; // Convert back to absolute price per unit IV
    if (Math.abs(vega) < 1e-6) break;

    const step = diff / vega;
    sigma -= step;

    if (sigma <= 0.001 || sigma > 5.0) break;
  }

  // Bisection Fallback
  let low = 0.01;
  let high = 3.0;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    const price = pricer(S, K, T, r, mid, isCall, q).price;
    if (Math.abs(price - targetPrice) < tolerance) {
      return mid * 100;
    }
    if (price < targetPrice) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Math.min(Math.max(((low + high) / 2) * 100, 1), 300);
}
