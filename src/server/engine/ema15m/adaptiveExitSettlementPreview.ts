/**
 * Phase100: conservative read-only report from durable Phase99 broker-REPORTED
 * SELL child and trade evidence plus the locally persisted original BUY.
 *
 * No brokerage writes, SQLite mutations, approved CLOSED, realised/net P&L,
 * stop guarantee, production release, or NRML live BUY permission.
 */
type RecordShape=Record<string,unknown>;
const obj=(x:unknown):x is RecordShape=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const ident=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const nativeKey=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=256;
const positiveInt=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonnegative=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const money=(x:unknown):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>0&&
  Number.isSafeInteger(Math.round(x*100))&&
  Math.abs(x*100-Math.round(x*100))<0.00001;
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';

export interface SettlementPreviewSnapshot{
  position:unknown;
  entryAttempt:unknown;
  observations:unknown;
  trades:unknown;
  freshBrokerNetQuantity:unknown;
}
export type SettlementPreviewState=
  'RECONCILIATION_EVIDENCE_MISSING'|
  'RECONCILIATION_CONFLICT'|
  'BROKER_EXIT_ORDER_PENDING_NOT_SETTLED'|
  'BROKER_PARTIAL_EXIT_OBSERVED_NOT_SETTLED'|
  'BROKER_FLAT_OBSERVED_NOT_CERTIFIED';
export interface SettlementPreviewReport{
  state:SettlementPreviewState;
  reasonCodes:readonly string[];
  brokerReportedExitFilledQuantity:number;
  brokerReportedRemainingQuantity:number|null;
  distinctPersistedSellTradeCount:number;
  originalOptionQuantity:number|null;
  /** Calculated only from locally stored BUY fill and broker-REPORTED SELL
   * fills; NOT signed exchange settlement or tax/accounting advice. */
  indicativeGrossPremiumDifference:number|null;
  netRealisedPnl:null;
  brokerChargesVerified:false;
  originalBuyTradeIdsIndependentlyReconciled:false;
  externalOrdersAndGttFullyReconciled:false;
  brokerChildExchangeAckIndependentlyCertified:false;
  brokerReportsAtomic:false;
  automaticPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  liveNrmlBuyAuthorized:false;
  manualApprovalRequired:true;
  brokerWrites:0;
  localWrites:0;
}
const report=(state:SettlementPreviewState,reasons:string[],
  data:Partial<SettlementPreviewReport>={}):SettlementPreviewReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  brokerReportedExitFilledQuantity:data.brokerReportedExitFilledQuantity??0,
  brokerReportedRemainingQuantity:data.brokerReportedRemainingQuantity??null,
  distinctPersistedSellTradeCount:data.distinctPersistedSellTradeCount??0,
  originalOptionQuantity:data.originalOptionQuantity??null,
  indicativeGrossPremiumDifference:data.indicativeGrossPremiumDifference??null,
  netRealisedPnl:null,brokerChargesVerified:false,
  originalBuyTradeIdsIndependentlyReconciled:false,
  externalOrdersAndGttFullyReconciled:false,
  brokerChildExchangeAckIndependentlyCertified:false,
  brokerReportsAtomic:false,automaticPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,liveNrmlBuyAuthorized:false,
  manualApprovalRequired:true,brokerWrites:0,localWrites:0
});
export function previewDurableExitSettlement(
  expected:{positionId:string;accountId:string},
  source:SettlementPreviewSnapshot
):SettlementPreviewReport{
  const missing=(reason:string)=>report('RECONCILIATION_EVIDENCE_MISSING',[reason]);
  const conflict=(reasons:string[],data:Partial<SettlementPreviewReport>={})=>
    report('RECONCILIATION_CONFLICT',reasons,data);
  if(!expected||!ident(expected.positionId)||!ident(expected.accountId))
    return missing('INVALID_EXPECTED_POSITION_OR_ACCOUNT_SCOPE');
  if(!source||!obj(source.position)||!obj(source.entryAttempt)||
     !Array.isArray(source.observations)||!Array.isArray(source.trades))
    return missing('DURABLE_POSITION_ENTRY_OR_SELL_EVIDENCE_MISSING');
  const p=source.position,e=source.entryAttempt;
  if(p.id!==expected.positionId||p.brokerAccountId!==expected.accountId||
     !nativeKey(p.brokerInstrumentKey)||!ident(p.entryBrokerOrderId)||
     !ident(p.exitBrokerOrderId)||!ident(p.attemptId)||
     !['MIS','NRML'].includes(String(p.productType))||
     p.status!=='EXIT_PENDING'||!positiveInt(p.quantity)||
     !positiveInt(p.lotSize)||p.quantity%p.lotSize!==0||
     p.exitFilledQuantity!==0)
    return conflict(['DURABLE_PENDING_POSITION_OR_BROKER_SCOPE_CONFLICT']);
  if(e.id!==p.attemptId||e.brokerAccountId!==p.brokerAccountId||
     e.brokerInstrumentKey!==p.brokerInstrumentKey||
     e.brokerOrderId!==p.entryBrokerOrderId||
     e.orderStatus!=='FILLED'||e.requestedQuantity!==p.quantity||
     e.filledQuantity!==p.quantity||
     !money(e.averageFillPrice)||!money(p.entryPrice)||
     Math.abs(e.averageFillPrice-p.entryPrice)>0.011)
    return conflict(['ORIGINAL_BUY_ATTEMPT_OR_ENTRY_PRICE_NOT_RECONCILED']);
  if(source.observations.length===0)
    return missing('NO_DURABLE_BROKER_SELL_CHILD_OBSERVATIONS');
  if(source.observations.length>2000||source.trades.length>5000)
    return conflict(['DURABLE_SELL_EVIDENCE_SOURCE_OVER_LIMIT']);
  const reasons:string[]=[];
  const obs=source.observations;
  let previousFill=0,previousSequence=0,previousStatus='',previousExchangeId='';
  const end=obs[obs.length-1];
  if(!obj(end))return conflict(['INVALID_DURABLE_CHILD_OBSERVATION']);
  const baseData:Partial<SettlementPreviewReport>={
    originalOptionQuantity:p.quantity
  };
  for(const one of obs){
    if(!obj(one)||!positiveInt(one.observationId)||
       one.observationId<=previousSequence||
       one.positionId!==p.id||one.brokerOrderId!==p.exitBrokerOrderId||
       (previousExchangeId!==''&&one.exchangeOrderId!==previousExchangeId)||
       one.accountId!==p.brokerAccountId||
       one.instrumentKey!==p.brokerInstrumentKey||
       one.product!==p.productType||
       !ident(one.exchangeOrderId)||
       one.requestedQuantity!==p.quantity||
       !nonnegative(one.filledQuantity)||
       !nonnegative(one.pendingQuantity)||
       one.filledQuantity+one.pendingQuantity>p.quantity||
       one.filledQuantity<previousFill||
       !nonnegative(one.currentNetQuantity)||
       one.currentNetQuantity!==p.quantity-one.filledQuantity||
       !nonnegative(one.tradeCount))
      reasons.push('DURABLE_CHILD_IDENTITY_QUANTITY_OR_ORDERING_CONFLICT');
    if(obj(one)&&typeof one.brokerStatus!=='string')
      reasons.push('DURABLE_CHILD_STATUS_INVALID');
    if(obj(one)&&previousStatus&&
       ['COMPLETE','COMPLETED','FILLED','CANCELLED','CANCELED',
        'REJECTED','FAILED','EXPIRED'].includes(previousStatus)&&
       previousStatus!==upper(one.brokerStatus))
      reasons.push('DURABLE_CHILD_TERMINAL_STATUS_REWOUND');
    if(obj(one)&&positiveInt(one.observationId))
      previousSequence=one.observationId;
    if(obj(one)&&nonnegative(one.filledQuantity))
      previousFill=one.filledQuantity;
    if(obj(one))previousStatus=upper(one.brokerStatus);
    if(obj(one)&&ident(one.exchangeOrderId))
      previousExchangeId=one.exchangeOrderId;
  }
  if(!nonnegative(source.freshBrokerNetQuantity))
    return conflict([...reasons,'FRESH_BROKER_NET_UNAVAILABLE'],baseData);
  const lastFilled=end.filledQuantity,lastPending=end.pendingQuantity;
  const remaining=p.quantity-(nonnegative(lastFilled)?lastFilled:0);
  baseData.brokerReportedExitFilledQuantity=nonnegative(lastFilled)?lastFilled:0;
  baseData.brokerReportedRemainingQuantity=source.freshBrokerNetQuantity;
  if(!nonnegative(lastFilled)||!nonnegative(lastPending)||
     source.freshBrokerNetQuantity!==remaining)
    reasons.push('LATEST_BROKER_NET_DISAGREES_WITH_DURABLE_SELL_FILLS');
  const ids=new Set<string>();
  let sum=0,weightedSellPaise=0;
  for(const t of source.trades){
    if(!obj(t)||!ident(t.tradeId)||ids.has(t.tradeId)||
       t.exchangeOrderId!==end.exchangeOrderId||
       !positiveInt(t.quantity)||!money(t.price)){
      reasons.push('IMMUTABLE_SELL_TRADE_ID_PRICE_OR_REFERENCE_INVALID');
      continue;
    }
    ids.add(t.tradeId);
    sum+=t.quantity;
    weightedSellPaise+=Math.round(t.price*100)*t.quantity;
    if(!Number.isSafeInteger(sum)||!Number.isSafeInteger(weightedSellPaise))
      reasons.push('IMMUTABLE_SELL_TRADE_TOTAL_NUMERIC_OVERFLOW');
  }
  baseData.distinctPersistedSellTradeCount=ids.size;
  if(sum!==lastFilled||end.tradeCount!==ids.size)
    reasons.push('SELL_TRADE_SUM_OR_COUNT_DISAGREES_WITH_LAST_CHILD');
  const status=upper(end.brokerStatus);
  const full=['COMPLETE','COMPLETED','FILLED'].includes(status);
  const known=['OPEN','PENDING','TRIGGER PENDING','PARTIALLY FILLED',
    'CANCEL PENDING','MODIFY PENDING','COMPLETE','COMPLETED','FILLED',
    'CANCELLED','CANCELED','REJECTED','FAILED','EXPIRED'].includes(status);
  if(!known)reasons.push('UNKNOWN_LATEST_CHILD_LIFECYCLE_STATUS');
  if(['CANCELLED','CANCELED','REJECTED','FAILED','EXPIRED'].includes(status))
    reasons.push('TERMINAL_UNFILLED_OR_PARTIAL_CHILD_REQUIRES_MANUAL_RECONCILIATION');
  if(['OPEN','PENDING','TRIGGER PENDING','PARTIALLY FILLED',
      'CANCEL PENDING','MODIFY PENDING'].includes(status)&&
      lastFilled+lastPending!==p.quantity)
    reasons.push('ACTIVE_CHILD_FILLED_PLUS_PENDING_NOT_CONSERVED');
  if(full&&(lastFilled!==p.quantity||lastPending!==0))
    reasons.push('FULL_STATUS_DISAGREES_WITH_SELL_FILLED_OR_PENDING');
  if(!full&&lastFilled===p.quantity)
    reasons.push('FULL_SELL_QUANTITY_WITH_NONFINAL_CHILD_STATUS');
  if(lastFilled>0&&!(full||status==='PARTIALLY FILLED'))
    reasons.push('EXECUTED_SELL_WITH_UNRECONCILED_CHILD_STATUS');
  if(!full&&status==='PARTIALLY FILLED'&&
     (lastFilled===0||lastPending===0))
    reasons.push('PARTIAL_STATUS_WITHOUT_ACTIVE_REMAINDER');
  if(reasons.length)return conflict(reasons,baseData);
  if(lastFilled>0){
    const entryPaise=Math.round(e.averageFillPrice*100);
    const grossPaise=weightedSellPaise-entryPaise*lastFilled;
    if(Number.isSafeInteger(grossPaise))
      baseData.indicativeGrossPremiumDifference=grossPaise/100;
  }
  const unresolved=['BROKER_REPORTED_EVIDENCE_NOT_INDEPENDENTLY_CERTIFIED'];
  if(full&&lastFilled===p.quantity&&source.freshBrokerNetQuantity===0)
    return report('BROKER_FLAT_OBSERVED_NOT_CERTIFIED',unresolved,baseData);
  if(lastFilled>0)
    return report('BROKER_PARTIAL_EXIT_OBSERVED_NOT_SETTLED',unresolved,baseData);
  return report('BROKER_EXIT_ORDER_PENDING_NOT_SETTLED',unresolved,baseData);
}
