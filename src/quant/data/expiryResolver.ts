/**
 * Dynamic Expiry Resolver
 * Resolves current, next, monthly expiries, 0DTE, 1DTE, and exact DTE calculations.
 * Never hard-codes expiry dates.
 */

import { QuantUnderlying } from '../types.js';

export interface ExpiryResolution {
  currentExpiry: string;
  nextExpiry: string;
  monthlyExpiry: string;
  daysToCurrentExpiry: number;
  daysToMonthlyExpiry: number;
  is0DTE: boolean;
  is1DTE: boolean;
  isExpiryDay: boolean;
  allExpiries: string[];
}

export class ExpiryResolver {
  /**
   * Resolves expiries from available option chain snapshots or calendar logic
   */
  public static resolve(underlying: QuantUnderlying, availableDates: string[], referenceDate: Date = new Date()): ExpiryResolution {
    const todayStr = referenceDate.toISOString().split('T')[0];
    const sortedDates = Array.from(new Set(availableDates))
      .filter(d => d >= todayStr)
      .sort();

    if (sortedDates.length === 0) {
      // Fallback projection based on standard NSE/BSE expiry cycles
      // NIFTY: Thursday, BANKNIFTY: Wednesday, SENSEX: Friday
      const nextDate = new Date(referenceDate);
      const targetDay = underlying === 'SENSEX' ? 5 : underlying === 'BANKNIFTY' ? 3 : 4;
      const daysUntil = (targetDay - nextDate.getDay() + 7) % 7;
      nextDate.setDate(nextDate.getDate() + (daysUntil === 0 ? 0 : daysUntil));
      const projected = nextDate.toISOString().split('T')[0];
      sortedDates.push(projected);
    }

    const currentExpiry = sortedDates[0];
    const nextExpiry = sortedDates.length > 1 ? sortedDates[1] : currentExpiry;

    // Monthly expiry is typically the last Thursday (or Wednesday for BANKNIFTY) of the month
    const monthlyExpiry = sortedDates.find(d => {
      const parts = d.split('-');
      const expDate = new Date(d);
      const lastDayOfMonth = new Date(expDate.getFullYear(), expDate.getMonth() + 1, 0).getDate();
      return expDate.getDate() >= lastDayOfMonth - 7;
    }) || sortedDates[sortedDates.length - 1];

    const curExpTime = new Date(currentExpiry).getTime();
    const refTime = referenceDate.getTime();
    const diffDays = Math.max(0, Math.ceil((curExpTime - refTime) / (1000 * 60 * 60 * 24)));

    const monthExpTime = new Date(monthlyExpiry).getTime();
    const diffMonthDays = Math.max(0, Math.ceil((monthExpTime - refTime) / (1000 * 60 * 60 * 24)));

    return {
      currentExpiry,
      nextExpiry,
      monthlyExpiry,
      daysToCurrentExpiry: diffDays,
      daysToMonthlyExpiry: diffMonthDays,
      is0DTE: diffDays === 0,
      is1DTE: diffDays === 1,
      isExpiryDay: diffDays === 0,
      allExpiries: sortedDates
    };
  }
}
