/**
 * Dedicated Types for 15-Minute 23/50 EMA Strategy Engine
 * Strictly isolates Paper Execution from Live Broker Execution
 */

import { Ema15mInstrument } from '../../../types.js';

export type ExecutionMode = 'PAPER' | 'LIVE';

export type OrderStatus =
  | 'CREATED'
  | 'PRE_TRADE_REJECTED'
  | 'SUBMITTED'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type PositionStatus =
  | 'OPEN'
  | 'EXIT_REQUESTED'
  | 'EXIT_PENDING'
  | 'EXIT_FAILED'
  | 'PARTIALLY_CLOSED'
  | 'CLOSED';

export type MarketBias = 'BULLISH' | 'BEARISH';
export type PositionSide = 'BUY' | 'SELL';
export type OptionType = 'CE' | 'PE';

export interface EmaLiveOrderAttempt {
  id: string;
  signalId: string;
  executionMode: 'LIVE';
  instrument: Ema15mInstrument;
  brokerAccountId?: string;
  brokerInstrumentKey?: string;
  tradingsymbol: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  requestedQuantity: number;
  filledQuantity: number;
  averageFillPrice?: number;
  orderStatus: OrderStatus;
  brokerOrderId?: string;
  rejectionReason?: string;
  submittedAt?: string;
  lastBrokerUpdateAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmaLivePosition {
  id: string;
  attemptId: string;
  signalId: string;
  instrument: Ema15mInstrument;
  brokerAccountId?: string;
  brokerInstrumentKey?: string;
  tradingsymbol: string;
  optionType: OptionType;
  strikePrice: number;
  expiryDate: string;
  productType: 'MIS' | 'NRML';
  side: PositionSide;
  marketBias: MarketBias;
  entryBrokerOrderId: string;
  entryTimestamp: string;
  entryPrice: number;
  quantity: number;
  lotSize: number;
  currentPrice: number;
  unrealizedPnl: number;
  stopLoss: number;
  targetPrice: number;
  trailingStopLoss?: number;
  isTrailingActive?: boolean;
  status: PositionStatus;
  exitBrokerOrderId?: string;
  exitTimestamp?: string | null;
  exitPrice?: number | null;
  exitReason?: string | null;
  grossPnl: number;
  brokerage: number;
  netPnl: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmaExecutionEvent {
  id: string;
  eventId?: string;
  signalId?: string;
  executionId?: string;
  executionMode: 'PAPER' | 'LIVE' | 'SYSTEM';
  stage:
    | 'SIGNAL_DETECTED'
    | 'SIGNAL_CONFIRMED'
    | 'PAPER_ENTRY'
    | 'LIVE_PRE_TRADE_CHECK'
    | 'LIVE_ORDER_SUBMITTED'
    | 'LIVE_ORDER_REJECTED'
    | 'LIVE_ORDER_FILLED'
    | 'PAPER_STOP_LOSS'
    | 'PAPER_EXIT'
    | 'LIVE_EXIT_REQUESTED'
    | 'LIVE_EXIT_SUBMITTED'
    | 'LIVE_EXIT_FILLED'
    | 'LIVE_EXIT_FAILED'
    | 'FORCED_SQUARE_OFF';
  status: 'SUCCESS' | 'REJECTED' | 'FAILED' | 'PENDING' | 'INFO';
  instrument: string;
  brokerOrderId?: string;
  errorCode?: string;
  errorMessage?: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface DualExecutionResult {
  signalStatus: 'CONFIRMED' | 'SUPPRESSED';
  paper: {
    enabled: boolean;
    status: 'FILLED_SIMULATED' | 'SKIPPED' | 'FAILED' | 'HELD';
    tradeId?: string;
    positionStatus?: 'OPEN' | 'NONE';
    entryPrice?: number;
    message?: string;
  };
  live: {
    enabled: boolean;
    status: OrderStatus | 'SKIPPED' | 'HELD';
    brokerOrderId?: string;
    requestedQuantity: number;
    filledQuantity: number;
    positionCreated: boolean;
    positionId?: string;
    rejectionReason?: string;
    message?: string;
  };
}
