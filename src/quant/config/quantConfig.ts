/**
 * Quantitative Configuration Registry (Section 87 & Part B6)
 * Centralizes all numeric quantitative parameters, risk boundaries, validation gates,
 * slippage, statutory transaction costs, and data latency thresholds.
 */

export interface StatutoryCostConfig {
  brokeragePerOrderINR: number; // e.g. 20 INR per executed order
  sttOptionsSellTurnoverPct: number; // 0.0625% on option premium (sell side)
  exchangeTurnoverChargesPct: number; // 0.05% NSE
  sebiTurnoverChargesPct: number; // 0.0001%
  gstChargesPct: number; // 18% on (brokerage + SEBI + exchange)
  stampDutyBuyTurnoverPct: number; // 0.003% on buy premium
  effectiveDate: string;
}

export interface QuantSystemConfig {
  // Research & Validation Quality Gates (Section 89 & B6)
  minimumSampleSizeForValidation: number; // 100 trades
  minWalkForwardWindows: number; // 4 windows
  minOosPeriodFraction: number; // 0.25 (25% out-of-sample)
  monteCarloRuns: number; // 2000 iterations
  maxAcceptableDrawdownPct: number; // 20.0%
  minProfitFactorForProductionReady: number; // 1.3
  minSharpeForProductionReady: number; // 1.0

  // Execution & Slippage
  slippageAssumptionPctOfPremium: number; // 0.5% of premium
  dataStalenessThresholdSeconds: number; // 5 seconds
  optionChainSnapshotIntervalSeconds: number; // 3 seconds

  // Signal & Decision Thresholds
  confidenceThresholdForSignal: number; // 0.65 (65%)

  // Portfolio Greek Limits (Section 28 & B6)
  maxPortfolioDelta: number; // 250 units
  maxPortfolioGamma: number; // 1500 units
  maxPortfolioVega: number; // 4500 units
  maxPortfolioThetaDailyINR: number; // 25000 INR

  // Kill Switch & Drawdown (Section 35 & 77)
  killSwitchDailyLossLimitPct: number; // 3.0% of allocated capital
  maxAccountDrawdownHaltPct: number; // 15.0%

  // Costs
  statutoryCosts: StatutoryCostConfig;
}

export const DEFAULT_QUANT_CONFIG: QuantSystemConfig = {
  minimumSampleSizeForValidation: 100,
  minWalkForwardWindows: 4,
  minOosPeriodFraction: 0.25,
  monteCarloRuns: 2000,
  maxAcceptableDrawdownPct: 20.0,
  minProfitFactorForProductionReady: 1.3,
  minSharpeForProductionReady: 1.0,

  slippageAssumptionPctOfPremium: 0.5,
  dataStalenessThresholdSeconds: 5,
  optionChainSnapshotIntervalSeconds: 3,

  confidenceThresholdForSignal: 0.65,

  maxPortfolioDelta: 250,
  maxPortfolioGamma: 1500,
  maxPortfolioVega: 4500,
  maxPortfolioThetaDailyINR: 25000,

  killSwitchDailyLossLimitPct: 3.0,
  maxAccountDrawdownHaltPct: 15.0,

  statutoryCosts: {
    brokeragePerOrderINR: 20,
    sttOptionsSellTurnoverPct: 0.0625,
    exchangeTurnoverChargesPct: 0.05,
    sebiTurnoverChargesPct: 0.0001,
    gstChargesPct: 18.0,
    stampDutyBuyTurnoverPct: 0.003,
    effectiveDate: '2024-10-01'
  }
};

class QuantConfigRegistry {
  private config: QuantSystemConfig = { ...DEFAULT_QUANT_CONFIG };

  public getConfig(): QuantSystemConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<QuantSystemConfig>): QuantSystemConfig {
    this.config = {
      ...this.config,
      ...partial,
      statutoryCosts: {
        ...this.config.statutoryCosts,
        ...(partial.statutoryCosts || {})
      }
    };
    return this.getConfig();
  }

  public resetToDefault(): QuantSystemConfig {
    this.config = { ...DEFAULT_QUANT_CONFIG };
    return this.getConfig();
  }
}

export const quantConfigRegistry = new QuantConfigRegistry();
