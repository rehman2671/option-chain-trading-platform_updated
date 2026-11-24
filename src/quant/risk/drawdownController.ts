import { DrawdownControlStatus } from '../types.js';

export class DrawdownController {
  private peakCapital: number = 500000;
  private currentCapital: number = 485000;
  private isTradingHalted: boolean = false;
  private userStates: Map<string, { peakCapital: number; currentCapital: number; isHalted: boolean }> = new Map();

  private resolveKey(userId?: string | null): string {
    return userId && userId.trim() ? userId.trim() : 'GLOBAL';
  }

  public isHalted(userId?: string | null): boolean {
    if (this.isTradingHalted) return true;
    if (userId) {
      const user = this.userStates.get(this.resolveKey(userId));
      if (user && user.isHalted) return true;
    }
    return false;
  }

  public getStatus(userId?: string | null): DrawdownControlStatus {
    const key = this.resolveKey(userId);
    const userState = this.userStates.get(key);
    const cap = userState ? userState.currentCapital : this.currentCapital;
    const peak = userState ? userState.peakCapital : this.peakCapital;
    return this.evaluateDrawdown(cap, peak, userId);
  }

  /** Read-only projection; a status request must never mutate the trading halt. */
  public readStatus(userId?: string | null): DrawdownControlStatus {
    const copy = new DrawdownController();
    copy.peakCapital = this.peakCapital;
    copy.currentCapital = this.currentCapital;
    copy.isTradingHalted = this.isTradingHalted;
    copy.userStates = new Map([...this.userStates].map(([key,state])=>[key,{...state}]));
    return copy.getStatus(userId);
  }

  public evaluateDrawdown(currentCapital: number, peakCapital?: number, userId?: string | null): DrawdownControlStatus {
    const key = this.resolveKey(userId);
    let userState = this.userStates.get(key);
    // Nonfinite or missing peak evidence must never become a safe numeric tier.
    // Retain the last valid observation and latch a halt; do not invent a new peak.
    if (!Number.isFinite(currentCapital) || (peakCapital !== undefined &&
        (!Number.isFinite(peakCapital) || peakCapital <= 0)) ||
        (!userState && peakCapital === undefined && currentCapital <= 0)) {
      if (!userState) {
        userState = {peakCapital:0,currentCapital:0,isHalted:true};
        this.userStates.set(key,userState);
      }
      userState.isHalted=true;
      if(key==='GLOBAL')this.isTradingHalted=true;
      const loss=Math.max(0,userState.peakCapital-userState.currentCapital);
      return {tier:'CRITICAL_DD',currentDrawdownPct:userState.peakCapital>0?Math.round(loss/userState.peakCapital*1000)/10:0,
        peakCapital:userState.peakCapital,currentCapital:userState.currentCapital,lossFromPeak:loss,
        sizingMultiplier:0,isHalted:true,requiresManualReset:true,
        recoveryActionPlan:'Invalid or unavailable drawdown inputs; halt latched. Last known values only; account evidence not verified.',diagnosticChecks:[]};
    }
    if (!userState) {
      userState = {
        peakCapital: peakCapital ?? currentCapital,
        currentCapital,
        isHalted: false
      };
      this.userStates.set(key, userState);
    }

    if (peakCapital && peakCapital > userState.peakCapital) {
      userState.peakCapital = peakCapital;
    }
    userState.currentCapital = currentCapital;
    if (userState.currentCapital > userState.peakCapital) {
      userState.peakCapital = userState.currentCapital;
    }

    // Also update global fallback
    if (key === 'GLOBAL') {
      this.peakCapital = userState.peakCapital;
      this.currentCapital = userState.currentCapital;
    }

    const lossFromPeak = Math.max(0, userState.peakCapital - userState.currentCapital);
    const currentDrawdownPct = userState.peakCapital > 0 ? (lossFromPeak / userState.peakCapital) * 100 : 0;

    let tier: 'NORMAL_DD' | 'MODERATE_DD' | 'HIGH_DD' | 'CRITICAL_DD' = 'NORMAL_DD';
    let sizingMultiplier = 1.0;
    let recoveryActionPlan = 'Standard trading operations active within risk budget.';

    if (currentDrawdownPct >= 15.0) {
      tier = 'CRITICAL_DD';
      sizingMultiplier = 0.0;
      userState.isHalted = true;
      if (key === 'GLOBAL') this.isTradingHalted = true;
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

    const halted = userState.isHalted || this.isTradingHalted;
    if (halted) {
      sizingMultiplier=0;
      recoveryActionPlan='Trading halt remains latched; verified recovery and authorized reset required.';
    }

    // No external diagnostic evidence is collected here; never fabricate PASS results.
    const diagnosticChecks: DrawdownControlStatus['diagnosticChecks'] = [];

    return {
      tier,
      currentDrawdownPct: Math.round(currentDrawdownPct * 10) / 10,
      peakCapital: userState.peakCapital,
      currentCapital: userState.currentCapital,
      lossFromPeak,
      sizingMultiplier,
      isHalted: halted,
      requiresManualReset: halted,
      recoveryActionPlan,
      diagnosticChecks
    };
  }

  public resetHalt(operatorId: string, reason: string, userId?: string | null): boolean {
    const key = this.resolveKey(userId);
    const userState = this.userStates.get(key);
    let reset = false;
    if (userState && userState.isHalted) {
      userState.isHalted = false;
      reset = true;
    }
    if (key === 'GLOBAL' && this.isTradingHalted) {
      this.isTradingHalted = false;
      reset = true;
    }
    return reset;
  }
}

export const drawdownController = new DrawdownController();
