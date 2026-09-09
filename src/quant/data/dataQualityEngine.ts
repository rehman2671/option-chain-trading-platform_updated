import { QuantUnderlying, QuantOptionSnapshot, DataQualityReport } from '../types';

export class DataQualityEngine {
  public evaluateSnapshots(
    underlying: QuantUnderlying,
    snapshots: QuantOptionSnapshot[],
    latencyMs: number = 180
  ): DataQualityReport {
    const warnings: string[] = [];
    let checks = {
      priceFreshness: true,
      spreadAcceptable: true,
      oiConsistency: true,
      greeksComputed: true,
      bidAskOrderValid: true
    };

    if (!snapshots || snapshots.length === 0) {
      return {
        score: 0,
        status: 'DATA_INSUFFICIENT',
        latencyMs,
        checks: {
          priceFreshness: false,
          spreadAcceptable: false,
          oiConsistency: false,
          greeksComputed: false,
          bidAskOrderValid: false
        },
        warnings: ['No live snapshot data received from broker adapter.']
      };
    }

    let score = 100;
    const now = Date.now();

    // 1. Freshness check (< 5 seconds default per B6)
    const oldestTs = snapshots.reduce((min, s) => {
      const t = new Date(s.marketTs).getTime();
      return isNaN(t) ? min : Math.min(min, t);
    }, now);

    const stalenessSec = Math.max(0, Math.round((now - oldestTs) / 1000));
    if (stalenessSec > 5) {
      checks.priceFreshness = false;
      score -= 25;
      warnings.push(`Data staleness threshold exceeded: ${stalenessSec}s lag`);
    }

    // 2. Spread and Bid/Ask order validity
    let wideSpreadCount = 0;
    let invertedOrderCount = 0;

    for (const snap of snapshots) {
      if (snap.bid > 0 && snap.ask > 0) {
        if (snap.bid > snap.ask) {
          invertedOrderCount++;
        }
        const spreadPct = ((snap.ask - snap.bid) / snap.ask) * 100;
        if (spreadPct > 8.0) {
          wideSpreadCount++;
        }
      }
    }

    if (invertedOrderCount > 0) {
      checks.bidAskOrderValid = false;
      score -= 30;
      warnings.push(`Crossed bid/ask detected in ${invertedOrderCount} contracts`);
    }

    if (wideSpreadCount > snapshots.length * 0.15) {
      checks.spreadAcceptable = false;
      score -= 15;
      warnings.push(`Abnormal bid-ask spread across ${wideSpreadCount} active strikes`);
    }

    // 3. OI Consistency
    const zeroOiCount = snapshots.filter(s => s.oi === 0).length;
    if (zeroOiCount > snapshots.length * 0.40) {
      checks.oiConsistency = false;
      score -= 15;
      warnings.push(`High fraction (${zeroOiCount}) of zero-OI records detected`);
    }

    // 4. Greeks computation check
    const missingGreeks = snapshots.filter(s => s.delta === 0 && s.iv === 0).length;
    if (missingGreeks > snapshots.length * 0.20) {
      checks.greeksComputed = false;
      score -= 10;
      warnings.push(`Black-Scholes Greek models uncalibrated for ${missingGreeks} contracts`);
    }

    // Final score clamp
    score = Math.max(0, Math.min(100, score));

    const status = score >= 80 ? 'OK' : score >= 60 ? 'STALE' : score > 0 ? 'DATA_INSUFFICIENT' : 'BLOCKED';

    return {
      score,
      status,
      latencyMs,
      checks,
      warnings
    };
  }
}

export const dataQualityEngine = new DataQualityEngine();
