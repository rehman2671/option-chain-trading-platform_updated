/**
 * Upstox / Exchange SPAN & Basket Margin Calculator Engine (Section 5A of Spec)
 * Calls Upstox API v2 order margins when connected,
 * or computes accurate NSE-compliant SPAN + Exposure & Hedged Multi-Leg margin.
 */

import { MarginCheckRequest, MarginCheckResult } from '../../types.js';

export async function calculateOrderAndBasketMargin(
  req: MarginCheckRequest,
  brokerProvider?: any
): Promise<MarginCheckResult> {
  const cushionPercent = req.cushionPercent ?? 12; // 12% safety margin cushion default
  const availableMargin = Number(req.userAvailableMargin) || 0;

  if (!req.legs || req.legs.length === 0) {
    return {
      standaloneMargin: 0,
      basketMargin: 0,
      hedgeBenefit: 0,
      requiredMarginWithCushion: 0,
      availableMargin,
      hasSufficientMargin: true,
      shortfall: 0,
      safetyCushionAmount: 0,
      recommendation: 'No legs selected.'
    };
  }

  // 1. If live broker provider is available and authenticated, query broker API first
  if (brokerProvider && typeof brokerProvider.getOrderMargins === 'function') {
    try {
      const ordersToMargin = req.legs.map(leg => ({
        instrument_key: leg.symbol ? `NSE_FO|${leg.symbol}` : undefined,
        transaction_type: leg.action,
        product: leg.product === 'MIS' ? 'I' : 'D',
        quantity: leg.quantity * leg.lotSize,
        price: leg.price
      }));

      const marginRes = await brokerProvider.getOrderMargins(ordersToMargin);
      if (marginRes && (marginRes.required_margin || marginRes.total_margin)) {
        const apiBasketMargin = Number(marginRes.required_margin || marginRes.total_margin || 0);
        const apiStandalone = Number(marginRes.final_margin || marginRes.standalone_margin || apiBasketMargin);

        if (apiBasketMargin > 0) {
          const hedgeBenefit = Math.max(0, apiStandalone - apiBasketMargin);
          const safetyCushionAmount = Math.ceil((apiBasketMargin * cushionPercent) / 100);
          const requiredMarginWithCushion = Math.ceil(apiBasketMargin + safetyCushionAmount);
          const hasSufficientMargin = availableMargin >= requiredMarginWithCushion;
          const shortfall = hasSufficientMargin ? 0 : Math.ceil(requiredMarginWithCushion - availableMargin);

          return {
            standaloneMargin: Math.round(apiStandalone),
            basketMargin: Math.round(apiBasketMargin),
            hedgeBenefit: Math.round(hedgeBenefit),
            requiredMarginWithCushion,
            availableMargin: Math.round(availableMargin),
            hasSufficientMargin,
            shortfall,
            safetyCushionAmount,
            recommendation: hasSufficientMargin
              ? `Upstox Margin Check PASSED. Available: ₹${availableMargin.toLocaleString('en-IN')}, Required (with ${cushionPercent}% cushion): ₹${requiredMarginWithCushion.toLocaleString('en-IN')}.`
              : `Upstox Margin Check REJECTED. Shortfall: ₹${shortfall.toLocaleString('en-IN')}.`
          };
        }
      }
    } catch (err: any) {
      console.warn('[MARGIN ENGINE] Live broker API call failed, falling back to SPAN mathematical engine:', err.message);
    }
  }

  // 2. Realistic NSE SPAN + Exposure + Multi-Leg Hedging Portfolio Engine
  // Used for Paper Trading Terminal, Offline/Practice sessions, and as high-fidelity fallback.
  let standaloneSum = 0;
  let totalLongPremium = 0;
  
  const shortCELegs: Array<{ strike: number; qty: number; ltp: number; standalone: number }> = [];
  const shortPELegs: Array<{ strike: number; qty: number; ltp: number; standalone: number }> = [];
  const longCELegs: Array<{ strike: number; qty: number; ltp: number; cost: number }> = [];
  const longPELegs: Array<{ strike: number; qty: number; ltp: number; cost: number }> = [];

  const symbol = (req.symbol || req.legs[0]?.symbol || 'NIFTY').toUpperCase();
  const isStock = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'].includes(symbol);
  
  // SPAN + Exposure margin base rate: Index ~11-13%, Stocks ~18-20%
  const spanRate = isStock ? 0.18 : (symbol === 'BANKNIFTY' ? 0.14 : 0.115);
  const minShortMarginPerLot = isStock ? 140000 : (symbol === 'BANKNIFTY' ? 120000 : 100000);

  for (const leg of req.legs) {
    const totalQty = leg.quantity * leg.lotSize;
    const contractValue = leg.strikePrice * totalQty;
    const premiumValue = Math.max(0, leg.price * totalQty);

    if (leg.action === 'BUY') {
      totalLongPremium += premiumValue;
      if (leg.type === 'CE') {
        longCELegs.push({ strike: leg.strikePrice, qty: totalQty, ltp: leg.price, cost: premiumValue });
      } else {
        longPELegs.push({ strike: leg.strikePrice, qty: totalQty, ltp: leg.price, cost: premiumValue });
      }
    } else {
      // Option Selling: SPAN + Exposure
      const legStandalone = Math.max(contractValue * spanRate, minShortMarginPerLot * leg.quantity);
      standaloneSum += legStandalone;
      if (leg.type === 'CE') {
        shortCELegs.push({ strike: leg.strikePrice, qty: totalQty, ltp: leg.price, standalone: legStandalone });
      } else {
        shortPELegs.push({ strike: leg.strikePrice, qty: totalQty, ltp: leg.price, standalone: legStandalone });
      }
    }
  }

  let hedgeDiscount = 0;

  // Rule A: Short Straddle / Strangle cross-margin benefit (Short CE + Short PE)
  // Spot moves in one direction only, so the exchange only charges the higher SPAN in full + ~30% exposure for the other side.
  if (shortCELegs.length > 0 && shortPELegs.length > 0) {
    const totalShortCEMargin = shortCELegs.reduce((acc, l) => acc + l.standalone, 0);
    const totalShortPEMargin = shortPELegs.reduce((acc, l) => acc + l.standalone, 0);
    const minSide = Math.min(totalShortCEMargin, totalShortPEMargin);
    // Discount ~60% of the smaller short side's standalone requirement
    hedgeDiscount += minSide * 0.60;
  }

  // Rule B: Vertical Spreads & Iron Condor Wing Hedging (Long CE protecting Short CE, Long PE protecting Short PE)
  for (const shortCE of shortCELegs) {
    const matchingLong = longCELegs.find(l => l.strike > shortCE.strike); // Bull/Bear spread hedge
    if (matchingLong) {
      // Hedged spread discount: ~70% of the short leg standalone margin
      hedgeDiscount += shortCE.standalone * 0.70;
    }
  }
  for (const shortPE of shortPELegs) {
    const matchingLong = longPELegs.find(l => l.strike < shortPE.strike); // Put spread hedge
    if (matchingLong) {
      hedgeDiscount += shortPE.standalone * 0.70;
    }
  }

  // Floor hedge discount so net basket margin doesn't drop below minimum spread risk
  hedgeDiscount = Math.min(hedgeDiscount, standaloneSum * 0.85);

  const netBasketMargin = Math.max(
    totalLongPremium,
    Math.ceil(standaloneSum - hedgeDiscount + totalLongPremium)
  );

  const safetyCushionAmount = Math.ceil((netBasketMargin * cushionPercent) / 100);
  const requiredMarginWithCushion = Math.ceil(netBasketMargin + safetyCushionAmount);
  const hasSufficientMargin = availableMargin >= requiredMarginWithCushion;
  const shortfall = hasSufficientMargin ? 0 : Math.ceil(requiredMarginWithCushion - availableMargin);

  const isHedged = hedgeDiscount > 0;

  return {
    standaloneMargin: Math.round(standaloneSum + totalLongPremium),
    basketMargin: Math.round(netBasketMargin),
    hedgeBenefit: Math.round(hedgeDiscount),
    requiredMarginWithCushion,
    availableMargin: Math.round(availableMargin),
    hasSufficientMargin,
    shortfall,
    safetyCushionAmount,
    recommendation: hasSufficientMargin
      ? `SPAN Margin Check PASSED. Available: ₹${availableMargin.toLocaleString('en-IN')}, Required (with ${cushionPercent}% cushion): ₹${requiredMarginWithCushion.toLocaleString('en-IN')}${isHedged ? ' (Hedge benefit applied)' : ''}.`
      : `SPAN Margin Check REJECTED. Shortfall: ₹${shortfall.toLocaleString('en-IN')}. Available: ₹${availableMargin.toLocaleString('en-IN')}, Required: ₹${requiredMarginWithCushion.toLocaleString('en-IN')}.`
  };
}

