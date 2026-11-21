/**
 * Phase102: joint private BROKER-REPORTED original BUY and SELL trade-ID
 * reconciliation. Neither broker GETs nor SQLite journals are independent
 * exchange clearance, approved capital risk, final tax/fees, or P&L posting.
 *
 * This is a pure read-only preview, NEVER a live NRML BUY/SELL release.
 */
import {
  previewDurableExitSettlement,
  type SettlementPreviewSnapshot,
  type SettlementPreviewState
} from './adaptiveExitSettlementPreview.js';

type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>!!x&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const uint=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const positive=(x:unknown):x is number=>uint(x)&&x>0;
const paise=(x:unknown):number|null=>{
  if(typeof x!=='number'||!Number.isFinite(x)||x<=0)return null;
  const n=Math.round(x*100);
  return Number.isSafeInteger(n)&&Math.abs(n-x*100)<0.00001?n:null;
};
export interface JointReceiptInputs extends SettlementPreviewSnapshot{
  originalBuyReceipt:unknown;
  originalBuyTrades:unknown;
}
export type JointReceiptStatus =
  'SOURCE_MISSING_OR_UNVERIFIED'|
  'BUY_SELL_LEDGER_CONFLICT'|
  'BROKER_REPORTED_BUY_AND_SELL_PARTIAL_NOT_SETTLED'|
  'BROKER_REPORTED_BUY_AND_SELL_FLAT_NOT_CERTIFIED';
export interface JointReceiptReport{
  state:JointReceiptStatus;
  reasonCodes:readonly string[];
  underlyingSellPreviewState:SettlementPreviewState;
  originalBuyTradeCount:number;
  matchedSellTradeCount:number;
  originalBuyQuantity:number|null;
  brokerReportedSellFilledQuantity:number;
  brokerReportedRemainingQuantity:number|null;
  indicativeGrossTradeDifference:number|null;
  chargesAndTaxesIndependentlyVerified:false;
  originalBuyExchangeExecutionsIndependentlyCertified:false;
  sellExchangeExecutionsIndependentlyCertified:false;
  externalAccountOrdersAndGttsReconciled:false;
  sourceSnapshotsAtomic:false;
  netRealisedPnl:null;
  automaticPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  liveNrmlBuyAuthorized:false;
  manualRiskSignoffRequired:true;
  brokerWrites:0;
  localWrites:0;
}
const result=(state:JointReceiptStatus,reasons:string[],
  underlyingSellPreviewState:SettlementPreviewState,
  data:Partial<JointReceiptReport>={}):JointReceiptReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  underlyingSellPreviewState,
  originalBuyTradeCount:data.originalBuyTradeCount??0,
  matchedSellTradeCount:data.matchedSellTradeCount??0,
  originalBuyQuantity:data.originalBuyQuantity??null,
  brokerReportedSellFilledQuantity:data.brokerReportedSellFilledQuantity??0,
  brokerReportedRemainingQuantity:data.brokerReportedRemainingQuantity??null,
  indicativeGrossTradeDifference:data.indicativeGrossTradeDifference??null,
  chargesAndTaxesIndependentlyVerified:false,
  originalBuyExchangeExecutionsIndependentlyCertified:false,
  sellExchangeExecutionsIndependentlyCertified:false,
  externalAccountOrdersAndGttsReconciled:false,
  sourceSnapshotsAtomic:false,netRealisedPnl:null,
  automaticPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,liveNrmlBuyAuthorized:false,
  manualRiskSignoffRequired:true,brokerWrites:0,localWrites:0
});
export function previewJointBuySellReceipts(
  expected:{positionId:string;accountId:string},
  source:JointReceiptInputs
):JointReceiptReport{
  const sell=previewDurableExitSettlement(expected,source);
  const base={
    matchedSellTradeCount:sell.distinctPersistedSellTradeCount,
    brokerReportedSellFilledQuantity:sell.brokerReportedExitFilledQuantity,
    brokerReportedRemainingQuantity:sell.brokerReportedRemainingQuantity
  };
  const missing=(reasons:string[])=>
    result('SOURCE_MISSING_OR_UNVERIFIED',reasons,sell.state,base);
  const conflict=(reasons:string[])=>
    result('BUY_SELL_LEDGER_CONFLICT',reasons,sell.state,base);
  if(sell.state==='RECONCILIATION_EVIDENCE_MISSING')
    return missing(['ORIGINAL_SELL_POSITION_ENTRY_OR_CHILD_LEDGER_MISSING']);
  if(sell.state==='RECONCILIATION_CONFLICT')
    return conflict(['SELL_CHILD_OR_PORTFOLIO_RECONCILIATION_CONFLICT']);
  if(sell.state==='BROKER_EXIT_ORDER_PENDING_NOT_SETTLED')
    return missing(['SELL_NOT_EXECUTED_YET_OR_ORIGINAL_BUY_NOT_ATTESTED']);
  if(!source||!obj(source.position)||!obj(source.entryAttempt)||
     !obj(source.originalBuyReceipt)||!Array.isArray(source.originalBuyTrades)||
     !Array.isArray(source.trades))
    return missing(['PRIVATE_ORIGINAL_BUY_ORDER_AND_TRADES_NOT_CAPTURED']);
  const p=source.position, e=source.entryAttempt,r=source.originalBuyReceipt;
  if(p.id!==expected.positionId||p.brokerAccountId!==expected.accountId||
     r.positionId!==p.id||r.accountId!==p.brokerAccountId||
     r.attemptId!==p.attemptId||r.orderId!==p.entryBrokerOrderId||
     r.instrumentKey!==p.brokerInstrumentKey||
     r.product!==p.productType||
     e.id!==p.attemptId||e.brokerOrderId!==r.orderId||
     e.brokerAccountId!==r.accountId||
     e.brokerInstrumentKey!==r.instrumentKey||
     e.orderStatus!=='FILLED'||!positive(p.quantity)||
     r.originalQuantity!==p.quantity||
     e.filledQuantity!==p.quantity||e.requestedQuantity!==p.quantity||
     !id(r.exchangeOrderId)||
     !positive(r.tradeCount)||
     r.tradeCount!==source.originalBuyTrades.length||
     !positive(p.lotSize)||p.quantity%p.lotSize!==0)
    return conflict(['IMMUTABLE_BUY_RECEIPT_ID_ACCOUNT_PRODUCT_OR_QUANTITY_DISAGREES_WITH_POSITION']);
  const entryPaise=paise(e.averageFillPrice);
  const storedBuyPaise=paise(r.brokerReportedAveragePrice);
  const journalEntryPaise=paise(p.entryPrice);
  if(entryPaise===null||storedBuyPaise===null||journalEntryPaise===null||
     Math.abs(entryPaise-storedBuyPaise)>1||
     Math.abs(journalEntryPaise-entryPaise)>1)
    return conflict(['ORIGINAL_BUY_ENTRY_PRICE_NOT_RECONCILED_TO_IMMUTABLE_TRADES']);
  const buyIds=new Set<string>();
  let totalBuy=0,totalBuyPaise=0;
  for(const t of source.originalBuyTrades){
    if(!obj(t)||!id(t.tradeId)||buyIds.has(t.tradeId)||
       t.exchangeOrderId!==r.exchangeOrderId||
       !positive(t.quantity))return conflict(['IMMUTABLE_BUY_TRADE_ID_OR_VENUE_CONFLICT']);
    const cents=paise(t.price);
    if(cents===null)return conflict(['IMMUTABLE_BUY_TRADE_PRICE_INVALID']);
    buyIds.add(t.tradeId);
    totalBuy+=t.quantity;totalBuyPaise+=t.quantity*cents;
    if(!Number.isSafeInteger(totalBuy)||!Number.isSafeInteger(totalBuyPaise))
      return conflict(['IMMUTABLE_BUY_TRADE_QUANTITY_OR_MONEY_OVERFLOW']);
  }
  if(totalBuy!==p.quantity||buyIds.size!==r.tradeCount||
     Math.abs(Math.round(totalBuyPaise/totalBuy)-entryPaise)>1||
     Math.abs(Math.round(totalBuyPaise/totalBuy)-storedBuyPaise)>1)
    return conflict(['ORIGINAL_BUY_TRADE_EXECUTIONS_DO_NOT_MATCH_FULL_ENTRY_OR_AVERAGE']);
  // Independently recompute SELL proceeds using the distinct immutable IDs,
  // rather than trusting the old preview's aggregate as a signed receipt.
  const sellIds=new Set<string>();let totalSell=0,totalSellPaise=0;
  for(const t of source.trades){
    if(!obj(t)||!id(t.tradeId)||sellIds.has(t.tradeId)||
       buyIds.has(t.tradeId)||!positive(t.quantity))
      return conflict(['IMMUTABLE_SELL_TRADE_ID_REPLAY_OR_BUY_SELL_COLLISION']);
    const cents=paise(t.price);
    if(cents===null)return conflict(['IMMUTABLE_SELL_TRADE_PRICE_INVALID']);
    sellIds.add(t.tradeId);
    totalSell+=t.quantity;totalSellPaise+=cents*t.quantity;
    if(!Number.isSafeInteger(totalSell)||!Number.isSafeInteger(totalSellPaise))
      return conflict(['IMMUTABLE_SELL_TRADE_QUANTITY_OR_MONEY_OVERFLOW']);
  }
  if(totalSell!==sell.brokerReportedExitFilledQuantity||
     totalSell<=0||totalSell>totalBuy)
    return conflict(['IMMUTABLE_BUY_SELL_EXECUTION_QUANTITIES_NOT_CONSERVED']);
  const remaining=totalBuy-totalSell;
  if(remaining!==sell.brokerReportedRemainingQuantity)
    return conflict(['CURRENT_BROKER_NET_NOT_CONSERVED_AFTER_ORIGINAL_BUY_AND_SELL']);
  // Paise arithmetic with full entry's weighted original BUY and the exact
  // SELL quantities. Only illustrative, not tax lots, brokerage or net P&L.
  const numerator=totalSellPaise*totalBuy-totalBuyPaise*totalSell;
  const denominator=totalBuy;
  if(!Number.isSafeInteger(numerator)||denominator<=0)
    return conflict(['INDICATIVE_GROSS_TRADE_DIFFERENCE_OVERFLOW']);
  const gross=Math.round(numerator/denominator)/100;
  if(!Number.isFinite(gross))
    return conflict(['INDICATIVE_GROSS_TRADE_DIFFERENCE_OVERFLOW']);
  const data={
    ...base,
    originalBuyTradeCount:buyIds.size,
    matchedSellTradeCount:sellIds.size,
    originalBuyQuantity:totalBuy,
    indicativeGrossTradeDifference:gross
  };
  return result(remaining===0?
    'BROKER_REPORTED_BUY_AND_SELL_FLAT_NOT_CERTIFIED':
    'BROKER_REPORTED_BUY_AND_SELL_PARTIAL_NOT_SETTLED',
    ['BROKER_REPORTED_TRADE_IDS_NOT_INDEPENDENT_EXCHANGE_OR_FEE_CERTIFICATION'],
    sell.state,data);
}
