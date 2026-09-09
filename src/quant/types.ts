/**
 * Quant Intelligence Module - Core Type Definitions
 * Covers Data Intelligence, Features, Regimes, Strategies, Tournament,
 * Position Recovery, Monte Carlo, Walk-Forward, and Risk Intelligence.
 */

export type QuantUnderlying = 'NIFTY' | 'BANKNIFTY' | 'SENSEX';

export type MarketRegimeType =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'BREAKOUT'
  | 'BREAKDOWN'
  | 'HIGH_VOL'
  | 'LOW_VOL'
  | 'VOL_EXPANSION'
  | 'VOL_COMPRESSION'
  | 'POSITIVE_GAMMA'
  | 'NEGATIVE_GAMMA'
  | 'EXPIRY'
  | 'EVENT'
  | 'GAP'
  | 'MEAN_REVERSION'
  | 'MIXED'
  | 'UNKNOWN';

export type StrategyFamily =
  | 'DIRECTIONAL_LONG'
  | 'DIRECTIONAL_SHORT'
  | 'NEUTRAL'
  | 'VOLATILITY_LONG'
  | 'VOLATILITY_SHORT'
  | 'EXPIRY_SPECIFIC'
  | 'DEFENSIVE'
  | 'SPREADS';

export type ExpiryProfile = 'CURRENT_WEEKLY' | 'NEXT_WEEKLY' | 'MONTHLY';

export type StrategyStatus =
  | 'DISCOVERED'
  | 'RESEARCH'
  | 'BACKTEST'
  | 'VALIDATION'
  | 'WALK_FORWARD'
  | 'OOS'
  | 'MONTE_CARLO'
  | 'PAPER'
  | 'SHADOW'
  | 'APPROVED'
  | 'LIVE'
  | 'MONITOR'
  | 'DEGRADED'
  | 'SUSPENDED';

export type RecoveryAction =
  | 'HOLD'
  | 'REDUCE'
  | 'EXIT'
  | 'HEDGE'
  | 'ROLL'
  | 'CONVERT'
  | 'REBALANCE'
  | 'REVERSE'
  | 'NO_ACTION';

export type ThesisState =
  | 'HEALTHY'
  | 'WEAKENING'
  | 'INVALIDATED'
  | 'REGIME_CHANGED'
  | 'SHOCK_EVENT';

export interface QuantOptionSnapshot {
  id?: number;
  marketTs: string;
  ingestionTs: string;
  underlying: QuantUnderlying;
  expiry: string;
  strike: number;
  optionType: 'CE' | 'PE';
  ltp: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  volume: number;
  oi: number;
  oiChange: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  source: string;
  dataQuality: 'OK' | 'DATA_INSUFFICIENT' | 'STALE';
  missingFields?: string[];
}

export interface DataQualityReport {
  score: number; // 0 to 100
  status: 'OK' | 'DATA_INSUFFICIENT' | 'STALE' | 'BLOCKED';
  latencyMs: number;
  checks: {
    priceFreshness: boolean;
    spreadAcceptable: boolean;
    oiConsistency: boolean;
    greeksComputed: boolean;
    bidAskOrderValid: boolean;
  };
  warnings: string[];
}

export interface QuantFeatureSnapshot {
  timestamp: string;
  underlying: QuantUnderlying;
  spotPrice: number;
  returns1m: number;
  returns5m: number;
  returns15m: number;
  returns1h: number;
  distVwapPct: number;
  distEma20Pct: number;
  distEma50Pct: number;
  atr: number;
  atrPercentile: number;
  rsi14: number;
  adx14: number;
  pcrOi: number;
  pcrVolume: number;
  atmIv: number;
  ivRank: number;
  ivPercentile: number;
  ivSkew: number;
  totalCallOi: number;
  totalPutOi: number;
  callOiChange: number;
  putOiChange: number;
  callWallStrike: number;
  putWallStrike: number;
  estimatedNetGamma: number;
  gammaFlipStrike: number;
  marketStructure: 'HH_HL' | 'LH_LL' | 'RANGE' | 'BOS_BULL' | 'BOS_BEAR';
}

export interface MarketRegimeState {
  underlying: QuantUnderlying;
  asOf: string;
  primaryRegime: MarketRegimeType;
  secondaryRegime: MarketRegimeType;
  volatilityRegime: 'LOW_COMPRESSION' | 'NORMAL' | 'HIGH_EXPANDING';
  gammaRegime: 'POSITIVE_GAMMA' | 'NEGATIVE_GAMMA' | 'NEUTRAL';
  confidence: number;
  estimated: boolean;
  dataQuality: 'OK' | 'DATA_INSUFFICIENT' | 'STALE';
  rationale: string;
  keyLevels: {
    support: number;
    resistance: number;
    callWall: number;
    putWall: number;
    gammaFlip: number;
    expectedMove: number;
  };
}

export interface HistoricalEpisodeMatch {
  date: string;
  eventName: string;
  similarityPct: number;
  regime: string;
  forwardMove30mPct: number;
  forwardMoveEodPct: number;
  bestStrategy: string;
}

export interface HistoricalAnalogueResult {
  underlying: QuantUnderlying;
  sampleCount: number;
  periodLookback: string;
  similarityScore: number;
  patternSummary?: string;
  topEpisodes?: HistoricalEpisodeMatch[];
  outcomes: {
    horizon15m: { upProb: number; downProb: number; flatProb: number; expectedReturnPct: number };
    horizon30m: { upProb: number; downProb: number; flatProb: number; expectedReturnPct: number };
    horizon1h: { upProb: number; downProb: number; flatProb: number; expectedReturnPct: number };
    horizonEod: { upProb: number; downProb: number; flatProb: number; expectedReturnPct: number };
  };
  maxFavorableExcursionAvg: number;
  maxAdverseExcursionAvg: number;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: number;
  family: 'DIRECTIONAL' | 'SPREADS' | 'NEUTRAL' | 'VOLATILITY' | 'ADAPTIVE';
  status: StrategyStatus;
  description: string;
  targetRegimes: MarketRegimeType[];
  parameters: Record<string, any>;
  rules: {
    entry: string[];
    exit: string[];
    stopLossPct: number;
    targetPct: number;
    maxDte: number;
    strikeSelection: 'ATM' | 'OTM_1' | 'DELTA_25' | 'DELTA_15' | 'DYNAMIC';
  };
  riskBudget: {
    maxCapitalPerTrade: number;
    maxRiskPct: number;
    portfolioDeltaCap: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  strategyName: string;
  strategyVersion: number;
  periodStart: string;
  periodEnd: string;
  sampleSize: number;
  winRate: number;
  lossRate: number;
  totalGrossPnl: number;
  totalTransactionCosts: number;
  totalNetPnl: number;
  expectancyR: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdownPct: number;
  avgWin: number;
  avgLoss: number;
  consecutiveLossesMax: number;
  walkForwardPassed: boolean;
  oosSharpe: number;
  monteCarloP5: number;
  monteCarloP50: number;
  monteCarloP95: number;
  overfitWarning: boolean;
  deflatedSharpeScore: number;
  passedGates: boolean;
  failureReason?: string;
  trades?: Array<{
    id: string;
    entryTime: string;
    exitTime: string;
    direction: string;
    grossPnl: number;
    costs: number;
    netPnl: number;
    exitReason: string;
  }>;
}

export interface StrategyTournamentEntry {
  rank: number;
  strategyId: string;
  name: string;
  family: string;
  score: number; // 0 to 100
  regimeFitScore: number;
  historicalEdgeScore: number;
  robustnessScore: number;
  liquidityScore: number;
  riskRewardScore: number;
  expectedValue: string;
  historicalProbPct: number;
  recommendation: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID';
  structureDesc: string;
}

export interface QuantDecisionOutput {
  decisionId: string;
  timestamp: string;
  underlying: QuantUnderlying;
  marketState: {
    spotPrice: number;
    primaryRegime: MarketRegimeType;
    volatilityState: string;
    dataQuality: string;
  };
  action: 'ENTER' | 'NO_TRADE';
  strategy?: {
    id: string;
    name: string;
    version: number;
    structure: string;
    strikes: string;
    expiry: string;
    positionSizeLots: number;
  };
  metrics: {
    expectedValueR: number;
    historicalProbPct: number;
    riskScore: number;
    confidenceScore: number;
  };
  thesis: {
    coreArgument: string;
    invalidationConditions: string[];
    recoveryPlanSummary: string;
  };
  noTradeReason?: string;
}

export interface PositionRecoveryAnalysis {
  positionId: string;
  symbol: string;
  currentPnl: number;
  mfe: number;
  mae: number;
  currentThesisState: ThesisState;
  stateDescription: string;
  actionEvaluations: {
    action: RecoveryAction;
    expectedValue: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    marginImpact: number;
    feasibility: boolean;
    rationale: string;
  }[];
  recommendedAction: RecoveryAction;
  invalidationAlert: boolean;
}

export interface PortfolioRiskSnapshot {
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  usedMargin: number;
  availableMargin: number;
  marginUtilizationPct: number;
  worstCaseStressLoss: number;
  dailyDrawdownPct: number;
  riskLevel?: 'LOW' | 'MODERATE' | 'ELEVATED' | 'CRITICAL';
  killSwitchTriggered: boolean;
  killSwitchReason?: string;
  stressScenarios: Array<{
    scenarioName: string;
    spotShiftPct: number;
    ivShiftPoints: number;
    projectedPnl: number;
  }>;
}

export interface QuantAuditLogRecord {
  id?: number;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  reason?: string;
  createdAt: string;
}

export interface IvSurfaceProfile {
  underlying: QuantUnderlying;
  asOf: string;
  atmIv: number;
  delta25CallIv: number;
  delta25PutIv: number;
  delta10CallIv: number;
  delta10PutIv: number;
  callSkew: number; // 25D Call IV - ATM IV
  putSkew: number;  // 25D Put IV - ATM IV
  flySpread: number; // 25D Put IV + 25D Call IV - 2 * ATM IV
  termStructure: Array<{ expiry: string; daysToExpiry: number; atmIv: number; status: 'CONTANGO' | 'BACKWARDATION' | 'FLAT' }>;
  ivRank: number; // 0-100 percentile over 252 trading days
  ivPercentile: number; // 0-100
  regime: 'IV_RICH' | 'IV_CHEAP' | 'IV_EXPANDING' | 'IV_CONTRACTING';
  surfaceSkewAnomaly: boolean;
  termStructureInverted: boolean;
  expectedMove1D: number;
  expectedMoveExpiry: number;
}

export interface MarketStructureProfile {
  underlying: QuantUnderlying;
  asOf: string;
  trendStructure: 'HH_HL' | 'LH_LL' | 'SIDEWAYS_RANGE';
  lastSwingHigh: number;
  lastSwingLow: number;
  breakOfStructure: 'BOS_BULLISH' | 'BOS_BEARISH' | 'NONE';
  changeOfCharacter: 'CHOCH_BULLISH' | 'CHOCH_BEARISH' | 'NONE';
  supportZones: Array<{ level: number; strength: 'STRONG' | 'MODERATE'; touches: number }>;
  resistanceZones: Array<{ level: number; strength: 'STRONG' | 'MODERATE'; touches: number }>;
  liquidityZones: Array<{ price: number; type: 'BUYSIDE_LIQUIDITY' | 'SELLSIDE_LIQUIDITY'; volumeCluster: number }>;
  previousDayHigh: number;
  previousDayLow: number;
  previousWeekHigh: number;
  previousWeekLow: number;
  openingRangeHigh: number;
  openingRangeLow: number;
  openingRangeBreakout: 'BULLISH' | 'BEARISH' | 'INSIDE';
}

export interface OptionFlowMetrics {
  underlying: QuantUnderlying;
  asOf: string;
  totalCallOi: number;
  totalPutOi: number;
  callOiBuildup: number;
  putOiBuildup: number;
  callOiUnwinding: number;
  putOiUnwinding: number;
  pcrOi: number;
  pcrVolume: number;
  pcrVelocity: number;
  pcrAcceleration: number;
  callWallStrike: number;
  putWallStrike: number;
  maxPainStrike: number;
  pinningZone: { strike: number; probabilityPct: number };
  oiMigration: { direction: 'UPWARD_MIGRATION' | 'DOWNWARD_MIGRATION' | 'STABLE'; netShiftStrikes: number };
  unusualVolumeStrikes: Array<{ strike: number; optionType: 'CE' | 'PE'; volumeToOiRatio: number }>;
}

export interface WalkForwardResult {
  strategyId: string;
  windowsCount: number;
  inSampleSharpeAvg: number;
  outOfSampleSharpeAvg: number;
  efficiencyRatio: number; // OOS Sharpe / IS Sharpe
  stabilityPct: number;
  passed: boolean;
  windows: Array<{
    windowId: number;
    trainStart: string;
    trainEnd: string;
    testStart: string;
    testEnd: string;
    trainNetPnl: number;
    testNetPnl: number;
    testSharpe: number;
    status: 'PASSED' | 'FAILED';
  }>;
}

export interface MonteCarloResult {
  strategyId: string;
  simulationsCount: number;
  medianPnl: number;
  percentile5Pnl: number;
  percentile50Pnl: number;
  percentile95Pnl: number;
  maxDrawdownDistribution: { p5: number; p50: number; p95: number };
  riskOfRuinPct: number;
  worstCaseCapitalNeeded: number;
  maxConsecutiveLossesP95: number;
  confidenceInterval95: [number, number];
}

export interface OverfitAnalysisResult {
  strategyId: string;
  parameterStabilityScore: number; // 0 to 100
  deflatedSharpeScore: number;
  probabilityOfBacktestOverfit: number; // 0.0 to 1.0 (PBO)
  complexityPenalty: number;
  perturbedParameterPerformance: Array<{
    parameter: string;
    originalValue: any;
    perturbedValue: any;
    pnlImpactPct: number;
    isStable: boolean;
  }>;
  overfitRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  recommendation: 'PASS' | 'RESTRICT_ALLOCATION' | 'REJECT';
}

export interface StrategyHealthReport {
  strategyId: string;
  name: string;
  version: number;
  status: StrategyStatus;
  expectedMetrics: { winRate: number; expectancyR: number; maxDrawdownPct: number; slippagePct: number };
  actualMetrics: { winRate: number; expectancyR: number; currentDrawdownPct: number; slippagePct: number };
  degradationStatus: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL';
  healthScore: number; // 0-100
  actionRequired: 'NONE' | 'REDUCE_SIZE' | 'SUSPEND' | 'RESEARCH_MUTATION';
  alertMessages: string[];
}

export interface ModelDriftReport {
  underlying: QuantUnderlying;
  asOf: string;
  featureDriftDetected: boolean;
  regimeDriftDetected: boolean;
  calibrationErrorPct: number; // difference between predicted prob and realized frequency
  driftScore: number; // 0 to 1
  driftSeverity: 'NORMAL' | 'ELEVATED' | 'HIGH';
  monitoredFeatures: Array<{ feature: string; baselineMean: number; currentMean: number; driftZScore: number }>;
}

export interface AiHypothesisExperiment {
  id: string;
  hypothesisNumber: string;
  title: string;
  coreHypothesis: string;
  featureConditions: string[];
  proposedStructure: string;
  status: 'PROPOSED' | 'BACKTESTING' | 'VALIDATED' | 'REJECTED' | 'PROMOTED';
  backtestScore?: number;
  robustnessGrade?: 'A' | 'B' | 'C' | 'F';
  notes: string;
  createdAt: string;
}

export interface TradeConversionPlan {
  positionId: string;
  symbol: string;
  currentStructure: string;
  proposedStructure: string;
  targetLegs: Array<{ action: 'BUY' | 'SELL'; strike: number; optionType: 'CE' | 'PE'; lots: number; estimatedPremium: number }>;
  marginImpact: number;
  capitalRequired: number;
  netDeltaShift: number;
  maxUpsidePayoff: number;
  maxDownsideRisk: number;
  expectedValueR: number;
  feasibilityScore: number; // 0-100
  approvalStatus: 'ELIGIBLE' | 'BLOCKED_MARGIN' | 'BLOCKED_LIQUIDITY';
  rationale: string;
}

export interface HedgeEvaluationResult {
  positionId: string;
  symbol: string;
  hedgeType: 'DELTA_HEDGE' | 'GAMMA_HEDGE' | 'VEGA_HEDGE' | 'TAIL_RISK_HEDGE' | 'EVENT_HEDGE';
  recommendedInstrument: string;
  quantityLots: number;
  estimatedCost: number;
  riskReductionPct: number;
  costToProtectionRatio: number;
  urgency: 'IMMEDIATE' | 'EVALUATIVE' | 'OPTIONAL';
  rationale: string;
}

export interface ProfitLockStatus {
  state: 'NORMAL' | 'STRONG_PROFIT' | 'EXTREME_PROFIT';
  dailyRealizedPnl: number;
  dailyUnrealizedPnl: number;
  totalDailyPnl: number;
  targetPnlThreshold: number;
  extremePnlThreshold: number;
  riskReductionFactor: number; // 1.0 = normal, 0.5 = halved size, 0.0 = lock session
  trailingLockFloor: number;
  actionRecommendation: 'CONTINUE_NORMAL' | 'TIGHTEN_TRAILING_STOP' | 'PROTECT_GAINS_LOCK_SESSION';
  message: string;
}

export interface DrawdownControlStatus {
  tier: 'NORMAL_DD' | 'MODERATE_DD' | 'HIGH_DD' | 'CRITICAL_DD';
  currentDrawdownPct: number;
  peakCapital: number;
  currentCapital: number;
  lossFromPeak: number;
  sizingMultiplier: number; // 1.0 (Normal), 0.5 (Moderate), 0.25 (High), 0.0 (Halt)
  isHalted: boolean;
  requiresManualReset: boolean;
  recoveryActionPlan: string;
  diagnosticChecks: Array<{ check: string; status: 'PASSED' | 'FAILED' }>;
}

export interface MarketEventItem {
  id: string;
  name: string;
  category: 'RBI_POLICY' | 'FED_FOMC' | 'UNION_BUDGET' | 'CPI_INFLATION' | 'ELECTION' | 'GLOBAL_MACRO';
  date: string;
  impactLevel: 'HIGH' | 'EXTREME' | 'MODERATE';
  state: 'PRE_EVENT' | 'EVENT_DAY' | 'POST_EVENT' | 'NORMAL';
  impliedVolPremiumPct: number;
  tradingRestriction: 'HALT_STRADDLES' | 'LONG_VOL_ONLY' | 'REDUCE_SIZE' | 'NONE';
}

export interface TimeOfDayEdgeProfile {
  timeWindow: string; // e.g. "09:15-09:30"
  characteristic: string;
  historicalWinRatePct: number;
  avgMovePoints: number;
  recommendedStrategyFamily: string;
  cautionFlag: boolean;
}

export interface TradeReviewRecord {
  tradeId: string;
  symbol: string;
  strategyName: string;
  strategyVersion: number;
  entryTime: string;
  exitTime: string;
  entryThesis: string;
  exitReason: string;
  regimeAtEntry: MarketRegimeType;
  grossPnl: number;
  netPnl: number;
  slippageIncurred: number;
  maxFavorableExcursionR: number;
  maxAdverseExcursionR: number;
  thesisWasCorrect: boolean;
  timingWasOptimal: boolean;
  strikeSelectionWasOptimal: boolean;
  lessonsLearned: string;
}
