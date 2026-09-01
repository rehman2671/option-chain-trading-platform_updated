/**
 * Option Chain Trading Platform - Shared TypeScript Definitions
 */

export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  googleSub?: string;
  google_sub?: string;
  emailVerified: boolean;
  email_verified: number;
  createdAt?: string;
  created_at: string;
  lastLoginAt?: string;
  last_login_at?: string;
}

export interface AuthSessionState {
  authenticated: boolean;
  user: User | null;
  loading: boolean;
}

export type UnderlyingStyle = 'EUROPEAN' | 'AMERICAN';
export type OptionType = 'CE' | 'PE';
export type TradeAction = 'BUY' | 'SELL';

export type OIBuildupType = 
  | 'LONG_BUILDUP' 
  | 'SHORT_BUILDUP' 
  | 'SHORT_COVERING' 
  | 'LONG_UNWINDING' 
  | 'NEUTRAL';

export interface OptionContract {
  strikePrice: number;
  type: OptionType;
  ltp: number;
  change: number;
  pChange: number;
  volume: number;
  openInterest: number;
  changeInOI: number;
  pChangeInOI: number;
  iv: number; // Implied Volatility %
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  buildup: OIBuildupType;
  bidPrice: number;
  askPrice: number;
  available?: boolean;
  ltpAvailable?: boolean;
  oiAvailable?: boolean;
  volumeAvailable?: boolean;
  ivAvailable?: boolean;
}

export interface OptionStrikeRow {
  strikePrice: number;
  ce: OptionContract;
  pe: OptionContract;
  isAtm?: boolean;
  isMaxPain?: boolean;
}

export interface OptionChainSnapshot {
  symbol: string;
  style: UnderlyingStyle;
  stepSize?: number;
  spotPrice: number;
  underlyingChange: number;
  underlyingPChange: number;
  indiaVix: number;
  vixChange: number;
  expiries: string[];
  selectedExpiry: string;
  isWeeklyExpiry: boolean;
  maxPainStrike: number;
  pcrOI: number;
  pcrVolume: number;
  totalCeOI: number;
  totalPeOI: number;
  totalCeVolume: number;
  totalPeVolume: number;
  ivRank: number; // 0-100 percentile
  ivPercentile: number;
  timestamp: string;
  strikes: OptionStrikeRow[];
  isBrokerConnected?: boolean;
  brokerStatusMessage?: string;
  providerMode?: 'PRACTICE' | 'LIVE';
  isSpotLive?: boolean;
  isPartialData?: boolean;
  unavailableStrikeCount?: number;
  partialDataReason?: string;
}

export interface StrategyLeg {
  id: string;
  type: OptionType;
  action: TradeAction;
  strikePrice: number;
  expiry: string;
  quantity: number; // Lots or contracts
  lotSize: number;
  currentLtp: number;
  entryPrice?: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  product?: 'MIS' | 'NRML' | 'I' | 'D';
  customLabel?: string;
  isManuallyAdjusted?: boolean;
}

export interface StrategyPortfolio {
  id: string;
  name: string;
  symbol: string;
  expiry: string;
  legs: StrategyLeg[];
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  netDebitCredit: number; // Positive = Debit, Negative = Credit
  maxProfit: number | 'UNLIMITED';
  maxLoss: number | 'UNLIMITED';
  breakevenPoints: number[];
  riskRewardRatio: string;
}

export interface PayoffDataPoint {
  underlyingPrice: number;
  priceChangePercent: number;
  pnlAtExpiry: number;
  pnlToday: number;
}

export interface MarginCheckRequest {
  symbol: string;
  legs: {
    symbol: string;
    strikePrice: number;
    type: OptionType;
    action: TradeAction;
    quantity: number;
    lotSize: number;
    price: number;
    product?: 'MIS' | 'NRML' | 'I' | 'D';
  }[];
  userAvailableMargin: number;
  cushionPercent?: number; // e.g. 10%
}

export interface MarginCheckResult {
  standaloneMargin: number;
  basketMargin: number;
  hedgeBenefit: number;
  requiredMarginWithCushion: number;
  availableMargin: number;
  hasSufficientMargin: boolean;
  shortfall: number;
  safetyCushionAmount: number;
  recommendation: string;
}

export type BasketStatus = 
  | 'PENDING' 
  | 'MARGIN_CHECKING' 
  | 'EXECUTING' 
  | 'COMPLETED' 
  | 'PARTIAL_FAILED' 
  | 'FAILED' 
  | 'REVERTED';

export interface BasketLegExecution {
  legId: string;
  orderId?: string;
  strikePrice: number;
  type: OptionType;
  action: TradeAction;
  requestedQty: number;
  filledQty: number;
  avgFillPrice: number;
  status: 'PENDING' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  executionSeq: number; // Leg 1 (Long) placed before Leg 2 (Short)
  executedAt?: string;
  errorReason?: string;
  product?: 'MIS' | 'NRML' | 'I' | 'D';
}

export interface BasketOrderRecord {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  status: BasketStatus;
  createdAt: string;
  completedAt?: string;
  legs: BasketLegExecution[];
  marginRequired: number;
  marginAvailable: number;
  fallbackActionTriggered?: string;
  reconciliationStatus: 'IN_SYNC' | 'MISMATCH_DETECTED' | 'RESOLVED';
  reconciliationNotes?: string;
}

export interface OIAnomaly {
  id: string;
  timestamp: string;
  symbol: string;
  strikePrice: number;
  type: OptionType;
  zScore: number;
  oiChange: number;
  oiChangePercent: number;
  volume: number;
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  description: string;
}

export interface EventReactiveState {
  isFastPollActive: boolean;
  lastShockMagnitude: number;
  lastShockTimestamp?: string;
  peCeSkewDivergence: number; // PE IV - CE IV divergence
  cooldownRemainingSec: number;
  institutionalBias: 'BULLISH_HEDGING' | 'BEARISH_HEDGING' | 'BALANCED' | 'VOLATILITY_EXPANSION';
}

export interface PaperPosition {
  id: string;
  strategyGroupId?: string;
  legLabel?: string;
  symbol: string;
  strategyName: string;
  strikePrice: number;
  type: OptionType;
  action: TradeAction;
  quantity: number;
  lotSize?: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  stopLoss?: number;
  targetPrice?: number;
  openedAt: string;
  closedAt?: string;
  exitPrice?: number;
  exitReason?: string;
  status: 'OPEN' | 'CLOSED';
  expiry: string;
  userId?: string;
}

export interface PaperStrategyGroup {
  strategyGroupId: string;
  strategyName: string;
  symbol: string;
  status: 'OPEN' | 'CLOSED' | 'PARTIAL';
  legs: PaperPosition[];
  netPnl: number;
  openedAt: string;
}

export interface AccountLedger {
  totalCapital: number;
  availableMargin: number;
  usedMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  winCount: number;
  lossCount: number;
}

export interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  timeframePreset?: '1D' | '1W' | '1M' | '2M' | '3M' | '6M' | '1Y' | 'CUSTOM';
  candleInterval?: '1m' | '5m' | '15m' | '30m' | '60m' | '1d';
  initialCapital: number;
  strategyType: 'LONG_CALL' | 'SHORT_STRADDLE' | 'BULL_CALL_SPREAD' | 'IRON_CONDOR' | 'OI_BUILDUP_MOMENTUM';
  slippagePercent: number;
  targetProfitPercent: number;
  stopLossPercent: number;
}

export interface BacktestTrade {
  tradeId: string;
  entryDate: string;
  exitDate: string;
  strategy: string;
  underlyingEntry: number;
  underlyingExit: number;
  pnl: number;
  pnlPercent: number;
  result: 'WIN' | 'LOSS';
  reason: string;
}

export interface BacktestResult {
  config: BacktestConfig;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  totalProfit: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  profitFactor: number;
  equityCurve: { date: string; equity: number }[];
  trades: BacktestTrade[];
}

export interface DatabaseSchemaInfo {
  tableName: string;
  columns: { name: string; type: string; isNullable: boolean; primaryKey: boolean }[];
  indexes: { name: string; columns: string[]; isUnique: boolean }[];
  rowCount: number;
}

export interface DatabaseMigrationStatus {
  version: number;
  description: string;
  appliedAt: string;
}

export interface AiNarrationResponse {
  summary: string;
  marketStructure: string;
  greeksAssessment: string;
  actionableInsights: string[];
  keyRiskLevels: { support: number; resistance: number; maxPain: number };
}

// Phase J: Autonomous Strategy Runner Types
export type RuleOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

export interface SingleRule {
  field: string;
  operator: RuleOperator;
  value: number | string;
}

export interface RuleGroup {
  all?: (SingleRule | RuleGroup)[];
  any?: (SingleRule | RuleGroup)[];
}

export type AutonomousStrategyStatus = 'WATCHING' | 'IN_POSITION' | 'DISARMED' | 'ERROR';

export interface AutonomousStrategy {
  id: string;
  name: string;
  symbol: string;
  armed: boolean;
  productType: 'MIS' | 'NRML';
  legs: StrategyLeg[];
  entryRules: RuleGroup;
  adjustmentRules?: RuleGroup;
  exitRules?: RuleGroup;
  maxPositionSize: number; // lot count cap
  status: AutonomousStrategyStatus;
  createdAt: string;
  lastEvaluatedAt?: string;
  lastActionAt?: string;
  activeBasketId?: string;
  errorMessage?: string;
}

export type AutonomousLogEventType =
  | 'RULE_EVALUATED'
  | 'ENTRY_TRIGGERED'
  | 'ADJUSTMENT_TRIGGERED'
  | 'EXIT_TRIGGERED'
  | 'BLOCKED_BY_MARGIN'
  | 'BLOCKED_BY_LIMIT'
  | 'ERROR'
  | 'ARMED'
  | 'DISARMED'
  | 'KILL_SWITCH';

export interface AutonomousStrategyLog {
  id: string;
  strategyId: string;
  strategyName?: string;
  timestamp: string;
  eventType: AutonomousLogEventType;
  details: Record<string, any>;
}

export interface AutonomousRunnerStatus {
  isRunnerActive: boolean;
  isKillSwitchEngaged: boolean;
  killSwitchReason?: string;
  armedCount: number;
  inPositionCount: number;
  totalStrategies: number;
  dailyAutonomousPnl: number;
  safetyLimits: {
    maxConcurrentPositions: number;
    dailyLossThreshold: number;
    defaultCooldownSeconds: number;
    maxPositionSizeCap: number;
  };
  providerMode: 'PRACTICE' | 'LIVE';
  dryRunMode: boolean;
}

// ==========================================
// 5-PILLAR PERSONAL AI TRADING PLATFORM TYPES
// ==========================================

export type TradingPillarId =
  | 'EQUITY_INTRADAY'
  | 'EQUITY_SWING'
  | 'EQUITY_LONGTERM'
  | 'FNO'
  | 'COMMODITIES';

export type EquityIntradayStrategyId =
  | 'VWAP_MEAN_REVERSION'
  | 'MOMENTUM'
  | 'BREAKOUT'
  | 'VOLATILITY_EXPANSION'
  | 'MICROSTRUCTURE';

export type EquitySwingStrategyId =
  | 'MOMENTUM'
  | 'BREAKOUT'
  | 'TREND_FOLLOWING'
  | 'MULTI_TIMEFRAME';

export type EquityLongTermStrategyId =
  | 'TREND_FOLLOWING'
  | 'RELATIVE_STRENGTH'
  | 'SECTOR_ROTATION'
  | 'FUNDAMENTAL_QUALITY';

export type FnoStrategyId =
  | 'FUTURES_MOMENTUM'
  | 'FUTURES_BREAKOUT'
  | 'VOLATILITY'
  | 'OPTIONS_OI'
  | 'IV_GREEKS'
  | 'EXPIRY_AWARE';

export type CommoditiesStrategyId =
  | 'TREND_FOLLOWING'
  | 'BREAKOUT'
  | 'MOMENTUM'
  | 'VOLATILITY_EXPANSION'
  | 'MULTI_TIMEFRAME';

export type AnyStrategySubId =
  | EquityIntradayStrategyId
  | EquitySwingStrategyId
  | EquityLongTermStrategyId
  | FnoStrategyId
  | CommoditiesStrategyId;

export interface StrategyDescriptor {
  id: AnyStrategySubId;
  name: string;
  pillarId: TradingPillarId;
  pillarName: string;
  description: string;
  timeframe: string;
  holdingPeriod: string;
  keyIndicators: string[];
  riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  targetWinRate: string;
  rewardRiskRatio: string;
  rulesSummary: string[];
}

export interface TradingPillar {
  id: TradingPillarId;
  number: number;
  name: string;
  shortLabel: string;
  iconName: string;
  color: string;
  description: string;
  targetUniverse: string;
  strategies: StrategyDescriptor[];
}

export interface MultiAssetQuote {
  symbol: string;
  name: string;
  assetClass: 'EQUITY' | 'INDEX_FNO' | 'STOCK_FNO' | 'COMMODITY';
  exchange: 'NSE' | 'BSE' | 'MCX';
  ltp: number;
  change: number;
  pChange: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  volume: number;
  vwap?: number;
  rsi?: number;
  atr?: number;
  supertrend?: 'BULLISH' | 'BEARISH';
  ema9?: number;
  ema21?: number;
  ema50?: number;
  ema200?: number;
  lotSize: number;
  stepSize?: number;
  sector?: string;
  // Intraday / Microstructure
  orderFlowImbalance?: number; // -100 to +100 %
  bidAskRatio?: number;
  // Long-Term & Fundamentals
  rsVsBenchmark?: number; // Relative Strength (Mansfield)
  sectorRank?: number;
  qualityScore?: number; // 0-100
  roce?: number; // %
  debtToEquity?: number;
  // F&O metrics
  futuresOpenInterest?: number;
  oiChangePercent?: number;
  pcr?: number;
  maxPain?: number;
  ivPercentile?: number;
  // Commodity metrics
  basisSpread?: number;
  carryCost?: number;
}

export interface MarketSignal {
  id: string;
  timestamp: string;
  pillarId: TradingPillarId;
  pillarName: string;
  strategyId: AnyStrategySubId;
  strategyName: string;
  symbol: string;
  assetName: string;
  assetClass: 'EQUITY' | 'INDEX_FNO' | 'STOCK_FNO' | 'COMMODITY';
  direction: 'BUY' | 'SELL' | 'NEUTRAL_SPREAD';
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: string;
  confidenceScore: number; // 0-100 %
  status: 'ACTIVE' | 'TRIGGERED' | 'TARGET_HIT' | 'SL_HIT' | 'EXPIRED';
  rationale: string;
  technicalTriggers: string[];
  suggestedAction: string;
  legs?: StrategyLeg[];
}

export interface SectorRotationData {
  sector: string;
  benchmarkSymbol: string;
  change1D: number;
  change1W: number;
  change1M: number;
  relativeStrengthRank: number; // 1 to 10
  momentumPhase: 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';
  topPicks: string[];
}

