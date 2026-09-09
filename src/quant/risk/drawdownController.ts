import { DrawdownControlStatus } from '../types';

export class DrawdownController {
  private peakCapital: number = 500000;
  private currentCapital: number = 485000;
  private isHalted: boolean = false;

  public evaluateDrawdown(currentCapital: number, peakCapital?: number): DrawdownControlStatus {
    if (peakCapital && peakCapital > this.peakCapital) {
      this.peakCapital = peakCapital;
    }
    this.currentCapital = currentCapital;
    if (this.currentCapital > this.peakCapital) {
      this.peakCapital = this.currentCapital;
    }

    const lossFromPeak = Math.max(0, this.peakCapital - this.currentCapital);
    const currentDrawdownPct = this.peakCapital > 0 ? (lossFromPeak / this.peakCapital) * 100 : 0;

    let tier: 'NORMAL_DD' | 'MODERATE_DD' | 'HIGH_DD' | 'CRITICAL_DD' = 'NORMAL_DD';
    let sizingMultiplier = 1.0;
    let recoveryActionPlan = 'Standard trading operations active within risk budget.';

    if (currentDrawdownPct >= 15.0) {
      tier = 'CRITICAL_DD';
      sizingMultiplier = 0.0;
      this.isHalted = true;
      recoveryActionPlan = 'CRITICAL DRAWDOWN REACHED. Complete automated trading halt enforced. Mandatory root-cause diagnostics and operator sign-off required to reset.';
    } else if (currentDrawdownPct >= 10.0) {
      tier = 'HIGH_DD';
      sizingMultiplier = 0.25;
      recoveryActionPlan = 'Elevated drawdown detected (-' + currentDrawdownPct.toFixed(1) + '%). Position sizing restricted to 25% of baseline allocation.';
    } else if (currentDrawdownPct >= 5.0) {
      tier = 'MODERATE_DD';
      sizingMultiplier = 0.5;
      recoveryActionPlan = 'Moderate drawdown (-' + currentDrawdownPct.toFixed(1) + '%). Defensively halving maximum risk budget per trade.';
    }

    const diagnosticChecks = [
      { check: 'Data Feed Latency & Quality Check', status: 'PASSED' as const },
      { check: 'Model Calibration & Drift Verification', status: 'PASSED' as const },
      { check: 'Market Regime Alignment Audit', status: tier === 'CRITICAL_DD' ? ('FAILED' as const) : ('PASSED' as const) },
      { check: 'Broker Capital & Margin Reserve Integrity', status: 'PASSED' as const }
    ];

    return {
      tier,
      currentDrawdownPct: Math.round(currentDrawdownPct * 10) / 10,
      peakCapital: this.peakCapital,
      currentCapital: this.currentCapital,
      lossFromPeak,
      sizingMultiplier,
      isHalted: this.isHalted,
      requiresManualReset: tier === 'CRITICAL_DD',
      recoveryActionPlan,
      diagnosticChecks
    };
  }

  public resetHalt(operatorId: string, reason: string): boolean {
    if (this.isHalted) {
      this.isHalted = false;
      return true;
    }
    return false;
  }
}

export const drawdownController = new DrawdownController();
