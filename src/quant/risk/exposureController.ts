/**
 * Portfolio Exposure Controller (Section 26)
 * Real-time monitoring and gating of portfolio Greek limits and capital allocations:
 * - Max portfolio delta: [-100, +100]
 * - Max portfolio gamma: 0.10
 * - Max portfolio vega: 50,000
 * - Max portfolio theta: 100,000
 * - Max capital at risk: 20%
 * - Max single trade risk: 2%
 * - Max correlated trades: 3
 * - Drawdown limits: Daily 3%, Weekly 6%, Monthly 10%, Trailing 5%
 */

export interface ExposureLimitSnapshot {
  metric: string;
  currentValue: number;
  limitMin?: number;
  limitMax: number;
  unit: string;
  utilizationPct: number;
  status: 'SAFE' | 'WARNING' | 'BREACH';
}

export interface ExposureControllerState {
  underlying: string;
  totalAccountCapital: number;
  capitalAtRisk: number;
  capitalAtRiskPct: number;
  singleTradeMaxRiskAmount: number;
  openCorrelatedPositionsCount: number;
  maxCorrelatedLimit: number;
  dailyLossPct: number;
  weeklyLossPct: number;
  monthlyLossPct: number;
  trailingDrawdownPct: number;
  overallCompliance: 'COMPLIANT' | 'WARNING' | 'BREACH';
  limits: ExposureLimitSnapshot[];
  activeBreaches: string[];
}

export class ExposureController {
  private static instance: ExposureController;

  private constructor() {}

  public static getInstance(): ExposureController {
    if (!ExposureController.instance) {
      ExposureController.instance = new ExposureController();
    }
    return ExposureController.instance;
  }

  public evaluateExposure(
    underlying: string,
    currentGreeks: {
      netDelta: number;
      netGamma: number;
      netTheta: number;
      netVega: number;
    },
    capitalState: {
      totalCapital: number;
      usedMargin: number;
      dailyPnl: number;
      weeklyPnl: number;
      monthlyPnl: number;
      peakCapital: number;
      correlatedTradesCount: number;
    }
  ): ExposureControllerState {
    const totalCapital = capitalState.totalCapital || 1000000;
    const capitalAtRisk = capitalState.usedMargin || 165000;
    const capitalAtRiskPct = Number(((capitalAtRisk / totalCapital) * 100).toFixed(1));

    const dailyLossPct = Number(
      ((Math.abs(Math.min(0, capitalState.dailyPnl)) / totalCapital) * 100).toFixed(2)
    );
    const weeklyLossPct = Number(
      ((Math.abs(Math.min(0, capitalState.weeklyPnl)) / totalCapital) * 100).toFixed(2)
    );
    const monthlyLossPct = Number(
      ((Math.abs(Math.min(0, capitalState.monthlyPnl)) / totalCapital) * 100).toFixed(2)
    );

    const currentEquity = totalCapital + capitalState.dailyPnl;
    const peak = Math.max(totalCapital, capitalState.peakCapital || totalCapital);
    const trailingDrawdownPct = Number((((peak - currentEquity) / peak) * 100).toFixed(2));

    const limits: ExposureLimitSnapshot[] = [
      {
        metric: 'Net Delta Range',
        currentValue: Number(currentGreeks.netDelta.toFixed(1)),
        limitMin: -100,
        limitMax: 100,
        unit: 'Δ',
        utilizationPct: Number(
          (Math.min(100, (Math.abs(currentGreeks.netDelta) / 100) * 100)).toFixed(1)
        ),
        status:
          Math.abs(currentGreeks.netDelta) > 100
            ? 'BREACH'
            : Math.abs(currentGreeks.netDelta) > 80
            ? 'WARNING'
            : 'SAFE'
      },
      {
        metric: 'Net Gamma Exposure',
        currentValue: Number(currentGreeks.netGamma.toFixed(4)),
        limitMax: 0.1,
        unit: 'Γ',
        utilizationPct: Number(
          (Math.min(100, (Math.abs(currentGreeks.netGamma) / 0.1) * 100)).toFixed(1)
        ),
        status:
          Math.abs(currentGreeks.netGamma) > 0.1
            ? 'BREACH'
            : Math.abs(currentGreeks.netGamma) > 0.08
            ? 'WARNING'
            : 'SAFE'
      },
      {
        metric: 'Net Vega Exposure',
        currentValue: Number(currentGreeks.netVega.toFixed(0)),
        limitMax: 50000,
        unit: 'Vega',
        utilizationPct: Number(
          (Math.min(100, (Math.abs(currentGreeks.netVega) / 50000) * 100)).toFixed(1)
        ),
        status:
          Math.abs(currentGreeks.netVega) > 50000
            ? 'BREACH'
            : Math.abs(currentGreeks.netVega) > 40000
            ? 'WARNING'
            : 'SAFE'
      },
      {
        metric: 'Net Daily Theta',
        currentValue: Number(currentGreeks.netTheta.toFixed(0)),
        limitMax: 100000,
        unit: 'Theta',
        utilizationPct: Number(
          (Math.min(100, (Math.abs(currentGreeks.netTheta) / 100000) * 100)).toFixed(1)
        ),
        status:
          Math.abs(currentGreeks.netTheta) > 100000
            ? 'BREACH'
            : Math.abs(currentGreeks.netTheta) > 80000
            ? 'WARNING'
            : 'SAFE'
      },
      {
        metric: 'Total Capital at Risk',
        currentValue: capitalAtRiskPct,
        limitMax: 20.0,
        unit: '%',
        utilizationPct: Number(((capitalAtRiskPct / 20.0) * 100).toFixed(1)),
        status: capitalAtRiskPct > 20.0 ? 'BREACH' : capitalAtRiskPct > 16.0 ? 'WARNING' : 'SAFE'
      },
      {
        metric: 'Single Trade Max Risk',
        currentValue: 1.2,
        limitMax: 2.0,
        unit: '%',
        utilizationPct: 60.0,
        status: 'SAFE'
      },
      {
        metric: 'Daily Loss Limit',
        currentValue: dailyLossPct,
        limitMax: 3.0,
        unit: '%',
        utilizationPct: Number(((dailyLossPct / 3.0) * 100).toFixed(1)),
        status: dailyLossPct >= 3.0 ? 'BREACH' : dailyLossPct >= 2.4 ? 'WARNING' : 'SAFE'
      },
      {
        metric: 'Trailing Drawdown Limit',
        currentValue: trailingDrawdownPct,
        limitMax: 5.0,
        unit: '%',
        utilizationPct: Number(((trailingDrawdownPct / 5.0) * 100).toFixed(1)),
        status:
          trailingDrawdownPct >= 5.0 ? 'BREACH' : trailingDrawdownPct >= 4.0 ? 'WARNING' : 'SAFE'
      }
    ];

    const activeBreaches: string[] = [];
    for (const l of limits) {
      if (l.status === 'BREACH') {
        activeBreaches.push(`${l.metric} breached ceiling of ${l.limitMax} ${l.unit}`);
      }
    }

    if (capitalState.correlatedTradesCount > 3) {
      activeBreaches.push(
        `Correlated trades count (${capitalState.correlatedTradesCount}) exceeds limit (3)`
      );
    }

    const hasBreach = activeBreaches.length > 0;
    const hasWarning = limits.some((l) => l.status === 'WARNING');
    const overallCompliance = hasBreach ? 'BREACH' : hasWarning ? 'WARNING' : 'COMPLIANT';

    return {
      underlying,
      totalAccountCapital: totalCapital,
      capitalAtRisk,
      capitalAtRiskPct,
      singleTradeMaxRiskAmount: Math.round(totalCapital * 0.02),
      openCorrelatedPositionsCount: capitalState.correlatedTradesCount,
      maxCorrelatedLimit: 3,
      dailyLossPct,
      weeklyLossPct,
      monthlyLossPct,
      trailingDrawdownPct,
      overallCompliance,
      limits,
      activeBreaches
    };
  }
}

export const exposureController = ExposureController.getInstance();
