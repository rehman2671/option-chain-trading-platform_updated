/**
 * Stress Test Engine (Section 29)
 * Before execution simulate:
 * - Spot +0.5%, +1.0%, +2.0%
 * - Spot -0.5%, -1.0%, -2.0%
 * - IV +5, +10, -5, -10 points
 * - 1 day decay, 2 day decay
 * - Overnight gap (+/- 1.5% with 5 vol points)
 * - Extreme Black Swan shock (-3.0% spot, +15 IV)
 *
 * Calculates:
 * - Worst-case P&L
 * - Margin increase / surge requirement
 * - Greek changes (Delta, Gamma, Vega, Theta drift)
 * - Liquidation risk
 * - If stress test fails: auto-size reduction recommendation or rejection
 */

export interface StressScenarioResult {
  scenarioId: string;
  name: string;
  category: 'SPOT' | 'VOLATILITY' | 'DECAY' | 'GAP' | 'EXTREME';
  spotShiftPct: number;
  ivShiftPoints: number;
  decayDays: number;
  projectedPnl: number;
  marginRequired: number;
  marginSurgePct: number;
  deltaShift: number;
  gammaRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  liquidationRiskPct: number;
  verdict: 'PASS' | 'CAUTION' | 'FAIL';
  note: string;
}

export interface ComprehensiveStressReport {
  timestamp: string;
  underlying: string;
  baseMargin: number;
  worstCasePnl: number;
  maxMarginSurgePct: number;
  maxLiquidationRiskPct: number;
  stressTestPassed: boolean;
  recommendation: 'PROCEED_FULL_SIZE' | 'REDUCE_SIZE_50_PCT' | 'REJECT_TRADE';
  scenarios: StressScenarioResult[];
}

export class StressEngine {
  private static instance: StressEngine;

  private constructor() {}

  public static getInstance(): StressEngine {
    if (!StressEngine.instance) {
      StressEngine.instance = new StressEngine();
    }
    return StressEngine.instance;
  }

  public runStressTest(
    underlying: string,
    spotPrice: number,
    positions: Array<{
      symbol: string;
      quantity: number;
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
      entryPrice: number;
      currentPrice: number;
    }>,
    allocatedCapital: number = 1000000
  ): ComprehensiveStressReport {
    let netDelta = 0;
    let netGamma = 0;
    let netTheta = 0;
    let netVega = 0;
    let baseMargin = 150000;

    for (const pos of positions) {
      const q = pos.quantity || 1;
      netDelta += (pos.delta || 0.35) * q;
      netGamma += (pos.gamma || 0.0015) * q;
      netTheta += (pos.theta || -15) * q;
      netVega += (pos.vega || 10) * q;
      baseMargin += Math.abs(pos.entryPrice * q * 0.15);
    }

    const scenariosDef = [
      {
        id: 'SPOT_UP_05',
        name: 'Spot +0.5% Drift',
        category: 'SPOT' as const,
        spotPct: 0.5,
        ivPoints: 0,
        decay: 0,
        note: 'Normal intraday drift up'
      },
      {
        id: 'SPOT_UP_10',
        name: 'Spot +1.0% Trend Rally',
        category: 'SPOT' as const,
        spotPct: 1.0,
        ivPoints: -1,
        decay: 0,
        note: 'Bullish expansion with mild IV drop'
      },
      {
        id: 'SPOT_UP_20',
        name: 'Spot +2.0% Aggressive Breakout',
        category: 'SPOT' as const,
        spotPct: 2.0,
        ivPoints: 2,
        decay: 0,
        note: 'Call side short pressure and gamma squeeze'
      },
      {
        id: 'SPOT_DN_05',
        name: 'Spot -0.5% Soft Dip',
        category: 'SPOT' as const,
        spotPct: -0.5,
        ivPoints: 1,
        decay: 0,
        note: 'Mild retest of VWAP/support'
      },
      {
        id: 'SPOT_DN_10',
        name: 'Spot -1.0% Trend Sell-off',
        category: 'SPOT' as const,
        spotPct: -1.0,
        ivPoints: 3,
        decay: 0,
        note: 'Put wall test and vol uptick'
      },
      {
        id: 'SPOT_DN_20',
        name: 'Spot -2.0% Deep Excursion',
        category: 'SPOT' as const,
        spotPct: -2.0,
        ivPoints: 6,
        decay: 0,
        note: 'Liquidity cascade towards Put Wall'
      },
      {
        id: 'IV_EXP_05',
        name: 'IV +5 Points Expansion',
        category: 'VOLATILITY' as const,
        spotPct: -0.2,
        ivPoints: 5,
        decay: 0,
        note: 'Pre-event or sudden index anxiety'
      },
      {
        id: 'IV_EXP_10',
        name: 'IV +10 Points Spike',
        category: 'VOLATILITY' as const,
        spotPct: -0.8,
        ivPoints: 10,
        decay: 0,
        note: 'Emergency geopolitical / RBI rate shock'
      },
      {
        id: 'IV_CRUSH_05',
        name: 'IV -5 Points Normalization',
        category: 'VOLATILITY' as const,
        spotPct: 0.2,
        ivPoints: -5,
        decay: 0,
        note: 'Post-announcement volatility crush'
      },
      {
        id: 'IV_CRUSH_10',
        name: 'IV -10 Points Collapse',
        category: 'VOLATILITY' as const,
        spotPct: 0.5,
        ivPoints: -10,
        decay: 0,
        note: 'Post-event euphoria and theta harvest'
      },
      {
        id: 'DECAY_1D',
        name: '1-Day Time Decay',
        category: 'DECAY' as const,
        spotPct: 0,
        ivPoints: 0,
        decay: 1,
        note: 'Overnight theta burn'
      },
      {
        id: 'DECAY_2D',
        name: '2-Day Weekend Decay',
        category: 'DECAY' as const,
        spotPct: 0,
        ivPoints: -1,
        decay: 2,
        note: 'Weekend holiday passage'
      },
      {
        id: 'GAP_UP_15',
        name: 'Overnight Gap Up +1.5%',
        category: 'GAP' as const,
        spotPct: 1.5,
        ivPoints: 3,
        decay: 1,
        note: 'Global cues overnight gap up + 1 day decay'
      },
      {
        id: 'GAP_DN_15',
        name: 'Overnight Gap Down -1.5%',
        category: 'GAP' as const,
        spotPct: -1.5,
        ivPoints: 5,
        decay: 1,
        note: 'Global selloff gap down + IV surge'
      },
      {
        id: 'BLACK_SWAN',
        name: 'Extreme Tail Event (-3.0% Spot, +15 IV)',
        category: 'EXTREME' as const,
        spotPct: -3.0,
        ivPoints: 15,
        decay: 1,
        note: 'Circuit breaker proximity shock'
      }
    ];

    let worstCasePnl = 0;
    let maxMarginSurgePct = 0;
    let maxLiquidationRiskPct = 0;

    const scenarios: StressScenarioResult[] = scenariosDef.map((def) => {
      const dS = (spotPrice * def.spotPct) / 100;
      // Second order Taylor approximation: dP = Delta * dS + 0.5 * Gamma * dS^2 + Vega * dIV + Theta * dt
      const pnl = Number(
        (
          netDelta * dS +
          0.5 * netGamma * Math.pow(dS, 2) +
          netVega * def.ivPoints +
          netTheta * def.decay
        ).toFixed(0)
      );

      const marginSurge = Math.max(
        0,
        Math.round(
          baseMargin *
            (1 + Math.abs(def.spotPct) * 0.12 + Math.max(0, def.ivPoints) * 0.035)
        )
      );
      const surgePct = Number((((marginSurge - baseMargin) / baseMargin) * 100).toFixed(1));

      let gammaRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (Math.abs(def.spotPct) >= 2.0 || def.id === 'BLACK_SWAN') {
        gammaRisk = 'CRITICAL';
      } else if (Math.abs(def.spotPct) >= 1.0 || def.ivPoints >= 10) {
        gammaRisk = 'HIGH';
      } else if (Math.abs(def.spotPct) >= 0.5) {
        gammaRisk = 'MODERATE';
      }

      const pnlDropPct = Math.abs(Math.min(0, pnl)) / allocatedCapital;
      const liquidationRiskPct = Number(
        Math.min(100, Math.max(0, pnlDropPct * 100 + (marginSurge > allocatedCapital * 0.8 ? 25 : 0))).toFixed(1)
      );

      let verdict: 'PASS' | 'CAUTION' | 'FAIL' = 'PASS';
      if (pnl < -allocatedCapital * 0.05 || liquidationRiskPct > 35) {
        verdict = 'FAIL';
      } else if (pnl < -allocatedCapital * 0.02 || liquidationRiskPct > 15) {
        verdict = 'CAUTION';
      }

      if (pnl < worstCasePnl) worstCasePnl = pnl;
      if (surgePct > maxMarginSurgePct) maxMarginSurgePct = surgePct;
      if (liquidationRiskPct > maxLiquidationRiskPct) maxLiquidationRiskPct = liquidationRiskPct;

      return {
        scenarioId: def.id,
        name: def.name,
        category: def.category,
        spotShiftPct: def.spotPct,
        ivShiftPoints: def.ivPoints,
        decayDays: def.decay,
        projectedPnl: pnl,
        marginRequired: marginSurge,
        marginSurgePct: surgePct,
        deltaShift: Number((netDelta + netGamma * dS).toFixed(2)),
        gammaRisk,
        liquidationRiskPct,
        verdict,
        note: def.note
      };
    });

    const failedCount = scenarios.filter((s) => s.verdict === 'FAIL').length;
    const cautionCount = scenarios.filter((s) => s.verdict === 'CAUTION').length;

    let recommendation: 'PROCEED_FULL_SIZE' | 'REDUCE_SIZE_50_PCT' | 'REJECT_TRADE' = 'PROCEED_FULL_SIZE';
    if (failedCount > 0 || worstCasePnl < -allocatedCapital * 0.05) {
      recommendation = 'REJECT_TRADE';
    } else if (cautionCount > 1 || worstCasePnl < -allocatedCapital * 0.02) {
      recommendation = 'REDUCE_SIZE_50_PCT';
    }

    return {
      timestamp: new Date().toISOString(),
      underlying,
      baseMargin,
      worstCasePnl,
      maxMarginSurgePct,
      maxLiquidationRiskPct,
      stressTestPassed: recommendation !== 'REJECT_TRADE',
      recommendation,
      scenarios
    };
  }
}

export const stressEngine = StressEngine.getInstance();
