/**
 * Adaptive Swing v2 Phase43 — OFFLINE GTT trigger -> broker-reported child
 * order history -> trades -> externally signed exchange-ACK CLAIM.
 *
 * A signed operator/reviewer claim is NOT exchange-authenticated evidence.
 * Upstox exchange_order_id is a BROKER-REPORTED field, NOT independently
 * signed exchange-native acknowledgement. GTT is broker-conditional.
 *
 * This module has NO HTTP, tokens, auto orders, GTT writes, schedules or
 * trading engine dependency. Every path is production-unsafe and blocked.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {
  auditPhase40ArchivedChildHistory,hashPhase40OfflineArchive,
  type Phase40GttCapture,type Phase40OrderHistoryInput,
  type Phase40OrderHistoryPins
} from './adaptiveUpstoxPhase40OvernightStopAudit.js';

const HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_.|:/-]{1,150}$/;
const LOCAL=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v)
  .digest('hex');
const isId=(s:unknown):s is string=>
  typeof s==='string'&&ID.test(s);
const day=(s:string):number=>
  LOCAL.test(s)?Date.parse(s.replace(' ','T')+'+05:30'):NaN;
const moment=(s:unknown):number=>
  typeof s==='string'&&ISO.test(s)?Date.parse(s):NaN;
const istDate=(t:number)=>new Date(t+19800000).toISOString()
  .slice(0,10);
function strictBase64(v:unknown,limit:number):Buffer|null{
  if(typeof v!=='string'||v.length<4||v.length>limit*2||
    v.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    return null;
  const b=Buffer.from(v,'base64');
  return b.length<=limit&&b.toString('base64')===v?b:null;
}
export interface Phase43ArchiveTrade{
  order_id:string;
  exchange_order_id:string;
  trade_id:string;
  instrument_token:string;
  trading_symbol:string;
  product:'D';
  transaction_type:'SELL';
  quantity:number;
  average_price:number;
  exchange_timestamp:string;
}
export interface Phase43ArchivedOrderTrades{
  origin:'OPERATOR_ARCHIVED_UNVERIFIED';
  method:'GET';
  path:'/v2/order/trades';
  query:{order_id:string};
  capturedAt:string;
  httpStatus:200;
  response:{status:'success';data:Phase43ArchiveTrade[]};
}
export interface Phase43ExternalReviewerClaim{
  schemaVersion:'EXTERNAL_PHASE43_ORDER_ACK_REVIEWER_CLAIM_V1';
  issuer:'EXTERNAL_REVIEWER_NOT_EXCHANGE_OR_BROKER';
  accountScopeId:string;
  gttOrderId:string;
  childOrderId:string;
  claimedExchangeOrderId:string;
  instrumentKey:string;
  transactionType:'SELL';
  quantity:number;
  claimedStatus:'BROKER_ORDER_ID_PRESENT_NOT_NATIVE_ACK';
  claimedAt:string;
  reviewerSpkiDerBase64:string;
  signatureBase64:string;
}
export interface Phase43TriggerChainInput{
  schemaVersion:'ADAPTIVE_V2_PHASE43_GTT_CHILD_ORDER_CHAIN_V1';
  source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED';
  accountScopeId:string;
  gttOrderId:string;
  positionInstrumentKey:string;
  expectedLongQuantity:number;
  gttAfterTrigger:Phase40GttCapture;
  childHistory:Phase40OrderHistoryInput;
  childTrades:Phase43ArchivedOrderTrades;
  externalReviewer:Phase43ExternalReviewerClaim;
}
export interface Phase43ExternalSourcePins{
  schemaVersion:'INDEPENDENT_PHASE43_TRIGGER_CHILD_TRADE_CLAIM_PINS_V1';
  expectedAccountScopeId:string;
  expectedGttOrderId:string;
  expectedChildOrderId:string;
  expectedExchangeOrderId:string;
  expectedGttSha256:string;
  expectedHistorySha256:string;
  expectedTradesSha256:string;
  expectedTradeIds:string[];
  expectedReviewerSpkiSha256:string;
  expectedReviewChallengeSha256:string;
  expectedSessionDate:string;
  maxReviewDelayMinutes:number;
}
export interface Phase43StopChainReport{
  mode:'OFFLINE_GTT_CHILD_TRADES_AND_REVIEWER_CLAIM';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED'|
    'BROKER_REPORTED_CHILD_FILLED_REVIEWED_UNVERIFIED';
  reasonCodes:string[];
  matchingGttTriggeredChildOrder:boolean;
  brokerReportedChildExchangeOrderId:boolean;
  archivedOrderHistoryStages:number;
  archivedTradeRows:number;
  archivedFilledQuantity:number;
  archivedRemainingQuantity:number;
  reviewerSignatureVerified:boolean;
  independentExchangeSignedAcknowledgementVerified:false;
  officialBrokerOriginVerified:false;
  nativeExchangeRestingStopConfirmed:false;
  trueExchangeOrderLifecycleVerified:false;
  genuineExchangeTradeConfirmationVerified:false;
  continuousOvernightProtectionVerified:false;
  orderFillPriceGuaranteed:false;
  protectedOvernight:false;
  brokerStopInstalled:false;
  brokerAuthenticated:false;
  productionSafe:false;
  executionAuthorized:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const warnings=[
  'GTT_TRIGGERED_IS_NOT_A_STANDING_EXCHANGE_NATIVE_PROTECTIVE_STOP',
  'UPSTOX_CHILD_EXCHANGE_ORDER_ID_IS_BROKER_REPORTED_NOT_SIGNED_ACK',
  'EXTERNAL_REVIEWER_ED25519_SIGNATURE_PROVES_ONLY_SIGNING_OF_CLAIM',
  'REVIEWER_PUBLIC_KEY_PIN_NOT_AN_EXCHANGE_AUTHORITY_IDENTITY',
  'ORDER_HISTORY_IS_SINGLE_TRADING_DAY_AND_MAY_OMIT_PRIOR_CHANGES',
  'GET_ORDER_TRADES_ARE_BROKER_REPORTED_NOT_EXCHANGE_ATTESTED',
  'COMPLETE_CHILD_ORDER_IS_ALREADY_FILLED_NOT_A_STANDING_STOP',
  'PARTIAL_CHILD_FILL_LEAVES_REMAINING_POSITION_UNPROVEN',
  'GTT_CAN_FAIL_OR_REJECT_DURING_VOLATILITY_OR_MARKET_GAP',
  'NO_LIVE_NRML_GTT_WRITE_STOP_REPAIR_OR_POSITIONAL_15_15_EXIT'
];
const empty=():Phase43StopChainReport=>({
  mode:'OFFLINE_GTT_CHILD_TRADES_AND_REVIEWER_CLAIM',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  matchingGttTriggeredChildOrder:false,
  brokerReportedChildExchangeOrderId:false,
  archivedOrderHistoryStages:0,archivedTradeRows:0,
  archivedFilledQuantity:0,archivedRemainingQuantity:0,
  reviewerSignatureVerified:false,
  independentExchangeSignedAcknowledgementVerified:false,
  officialBrokerOriginVerified:false,
  nativeExchangeRestingStopConfirmed:false,
  trueExchangeOrderLifecycleVerified:false,
  genuineExchangeTradeConfirmationVerified:false,
  continuousOvernightProtectionVerified:false,
  orderFillPriceGuaranteed:false,
  protectedOvernight:false,brokerStopInstalled:false,
  brokerAuthenticated:false,productionSafe:false,
  executionAuthorized:false,nativeOrderInstruction:null,warnings
});
const fail=(status:Phase43StopChainReport['status'],reason:string,
  fields?:Partial<Phase43StopChainReport>):Phase43StopChainReport=>({
  ...empty(),...fields,status,reasonCodes:[reason]
});
/** Exact challenge/payload contract. Never embed UCC, prices or original
 * data in public reports. A reviewer can sign FALSE operator claims.
 */
export function phase43ReviewerMessage(
  input:Phase43TriggerChainInput,
  pins:Phase43ExternalSourcePins
):Buffer{
  const r=input.externalReviewer;
  return Buffer.from(JSON.stringify({
    domain:'PHASE43_EXTERNAL_ORDER_LINK_REVIEW_V1',
    challengeSha256:pins.expectedReviewChallengeSha256,
    accountScopeId:r.accountScopeId,
    gttOrderId:r.gttOrderId,
    childOrderId:r.childOrderId,
    claimedExchangeOrderId:r.claimedExchangeOrderId,
    instrumentKey:r.instrumentKey,
    transactionType:r.transactionType,quantity:r.quantity,
    claimedStatus:r.claimedStatus,claimedAt:r.claimedAt,
    gttBodySha256:pins.expectedGttSha256,
    orderHistorySha256:pins.expectedHistorySha256,
    orderTradesSha256:pins.expectedTradesSha256
  }),'utf8');
}
function signedReview(input:Phase43TriggerChainInput,
  pins:Phase43ExternalSourcePins):boolean{
  const r=input.externalReviewer;
  if(!r||r.schemaVersion!==
      'EXTERNAL_PHASE43_ORDER_ACK_REVIEWER_CLAIM_V1'||
    r.issuer!=='EXTERNAL_REVIEWER_NOT_EXCHANGE_OR_BROKER'||
    r.accountScopeId!==pins.expectedAccountScopeId||
    r.gttOrderId!==pins.expectedGttOrderId||
    r.childOrderId!==pins.expectedChildOrderId||
    r.claimedExchangeOrderId!==pins.expectedExchangeOrderId||
    r.instrumentKey!==input.positionInstrumentKey||
    r.transactionType!=='SELL'||r.quantity!==input.expectedLongQuantity||
    r.claimedStatus!=='BROKER_ORDER_ID_PRESENT_NOT_NATIVE_ACK'||
    !Number.isFinite(moment(r.claimedAt)))
    return false;
  const spki=strictBase64(r.reviewerSpkiDerBase64,4096),
    sig=strictBase64(r.signatureBase64,128);
  if(!spki||!sig||sig.length!==64||
    sha(spki)!==pins.expectedReviewerSpkiSha256)return false;
  try{
    const pk=createPublicKey({key:spki,format:'der',type:'spki'});
    return pk.asymmetricKeyType==='ed25519'&&
      verify(null,phase43ReviewerMessage(input,pins),pk,sig);
  }catch{return false;}
}
export function auditPhase43TriggeredGttChildTrades(
  input:Phase43TriggerChainInput,
  pins:Phase43ExternalSourcePins
):Phase43StopChainReport{
  const h=input?.childHistory,g=input?.gttAfterTrigger,
    t=input?.childTrades;
  const rows=h?.history?.response?.data;
  if(!input||!pins||input.schemaVersion!==
      'ADAPTIVE_V2_PHASE43_GTT_CHILD_ORDER_CHAIN_V1'||
    input.source!=='OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED'||
    pins.schemaVersion!==
      'INDEPENDENT_PHASE43_TRIGGER_CHILD_TRADE_CLAIM_PINS_V1'||
    !isId(input.accountScopeId)||!isId(input.gttOrderId)||
    !input.gttOrderId.startsWith('GTT-')||
    !isId(input.positionInstrumentKey)||
    !Number.isSafeInteger(input.expectedLongQuantity)||
    input.expectedLongQuantity<=0||
    !isId(pins.expectedAccountScopeId)||
    !isId(pins.expectedGttOrderId)||
    !isId(pins.expectedChildOrderId)||
    !isId(pins.expectedExchangeOrderId)||
    pins.expectedAccountScopeId!==input.accountScopeId||
    pins.expectedGttOrderId!==input.gttOrderId||
    ![pins.expectedGttSha256,pins.expectedHistorySha256,
      pins.expectedTradesSha256,pins.expectedReviewerSpkiSha256,
      pins.expectedReviewChallengeSha256]
      .every(x=>typeof x==='string'&&HASH.test(x))||
    !Array.isArray(pins.expectedTradeIds)||
    pins.expectedTradeIds.length>64||
    pins.expectedTradeIds.some(x=>!isId(x))||
    new Set(pins.expectedTradeIds).size!==pins.expectedTradeIds.length||
    !/^\d{4}-\d\d-\d\d$/.test(pins.expectedSessionDate)||
    !Number.isSafeInteger(pins.maxReviewDelayMinutes)||
    pins.maxReviewDelayMinutes<1||pins.maxReviewDelayMinutes>1440||
    !g||!h||!t||!Array.isArray(rows)||
    hashPhase40OfflineArchive(g)!==pins.expectedGttSha256||
    hashPhase40OfflineArchive(h.history)!==pins.expectedHistorySha256||
    hashPhase40OfflineArchive(t)!==pins.expectedTradesSha256)
    return fail('INVALID_EVIDENCE','INVALID_SOURCE_SCOPE_OR_INDEPENDENT_ARCHIVE_PINS');

  const child=h.expected;
  const histPins:Phase40OrderHistoryPins={
    schemaVersion:'EXTERNALLY_PINNED_PHASE40_ORDER_HISTORY_V1',
    expectedAccountScopeId:pins.expectedAccountScopeId,
    expectedOrderId:pins.expectedChildOrderId,
    expectedHistorySha256:pins.expectedHistorySha256
  };
  if(child?.accountScopeId!==pins.expectedAccountScopeId||
    child?.childOrderId!==pins.expectedChildOrderId||
    child?.instrumentKey!==input.positionInstrumentKey||
    child?.quantity!==input.expectedLongQuantity||
    child?.productType!=='NRML'||child?.side!=='SELL')
    return fail('INVALID_EVIDENCE','CHILD_ORDER_POSITION_OR_ACCOUNT_SCOPE_MISMATCH');

  const history=auditPhase40ArchivedChildHistory(h,histPins);
  if(history.status!=='BROKER_REPORTED_OPEN_OR_COMPLETE_UNVERIFIED'||
    !history.brokerReportedExchangeOrderIdObserved||
    history.executionAuthorized!==false||
    history.actualExchangeAcknowledgementIndependentlyVerified!==false)
    return fail('BLOCKED_OR_UNKNOWN','PHASE40_CHILD_ORDER_REJECTED_CANCELLED_OR_AMBIGUOUS');

  if(g.origin!=='OPERATOR_ARCHIVED_UNVERIFIED'||
    g.method!=='GET'||g.path!=='/v3/order/gtt'||
    g.query?.gtt_order_id!==pins.expectedGttOrderId||
    g.httpStatus!==200||g.response?.status!=='success'||
    !Array.isArray(g.response.data)||
    g.response.data.length!==1||
    !Number.isFinite(moment(g.capturedAt))||
    istDate(moment(g.capturedAt))!==pins.expectedSessionDate)
    return fail('BLOCKED_OR_UNKNOWN','TRIGGERED_GTT_ARCHIVE_OR_SESSION_INVALID');
  const o=g.response.data[0];
  const stops=o?.rules?.filter(x=>x?.strategy==='STOPLOSS');
  if(!o||o.gtt_order_id!==pins.expectedGttOrderId||
    o.product!=='D'||o.instrument_token!==input.positionInstrumentKey||
    o.trading_symbol!==child.tradingSymbol||
    o.quantity!==input.expectedLongQuantity||
    !Array.isArray(stops)||stops.length!==1)
    return fail('BLOCKED_OR_UNKNOWN','TRIGGERED_GTT_CONTRACT_OR_STOP_RULE_MISMATCH');
  const stop=stops[0];
  if((stop.status==='COMPLETED'&&
      history.reportedTerminalStatus!=='complete')||
    (stop.status==='OPEN'&&history.reportedTerminalStatus!=='open')||
    !['TRIGGERED','OPEN','COMPLETED'].includes(stop.status)||
    stop.order_id!==pins.expectedChildOrderId||
    stop.transaction_type!=='SELL'||stop.trigger_type!=='BELOW'||
    !Number.isFinite(stop.trigger_price)||stop.trigger_price<=0)
    return fail('BLOCKED_OR_UNKNOWN','NO_EXACT_TRIGGERED_GTT_CHILD_LINK');
  const last=rows[rows.length-1];
  if(!last||last.exchange_order_id!==pins.expectedExchangeOrderId)
    return fail('BLOCKED_OR_UNKNOWN','BROKER_REPORTED_CHILD_EXCHANGE_ID_MISMATCH');

  // Check all important timestamps/IDs, not just Phase40 terminal state.
  let prev=-Infinity,prevFilled=-1,requestNumber=0;
  const historyDate=pins.expectedSessionDate;
  for(const r of rows){
    const ts=day(r.order_timestamp);
    const number=Number(r.order_request_id);
    if(!Number.isFinite(ts)||istDate(ts)!==historyDate||
      ts<prev||ts>moment(h.history.capturedAt)||
      !/^[1-9]\d{0,7}$/.test(r.order_request_id)||
      number<requestNumber||
      !Number.isSafeInteger(r.filled_quantity)||
      r.filled_quantity<prevFilled||
      (r.exchange_order_id!==null&&
        r.exchange_order_id!==pins.expectedExchangeOrderId)||
      (r.exchange_timestamp!==null&&
        (!Number.isFinite(day(r.exchange_timestamp))||
          istDate(day(r.exchange_timestamp))!==historyDate)))
      return fail('BLOCKED_OR_UNKNOWN',
        'NONMONOTONIC_CHILD_ORDER_HISTORY_OR_EXCHANGE_REFERENCE');
    prev=ts;prevFilled=r.filled_quantity;requestNumber=number;
  }
  if(prev>moment(g.capturedAt))
    return fail('BLOCKED_OR_UNKNOWN',
      'CHILD_ORDER_HISTORY_POSTDATES_TRIGGERED_GTT_OBSERVATION');

  if(t.origin!=='OPERATOR_ARCHIVED_UNVERIFIED'||
    t.method!=='GET'||t.path!=='/v2/order/trades'||
    t.query?.order_id!==pins.expectedChildOrderId||
    t.httpStatus!==200||t.response?.status!=='success'||
    !Array.isArray(t.response.data)||t.response.data.length>64||
    t.response.data.length!==pins.expectedTradeIds.length||
    !Number.isFinite(moment(t.capturedAt))||
    moment(t.capturedAt)<moment(h.history.capturedAt)||
    istDate(moment(t.capturedAt))!==historyDate)
    return fail('BLOCKED_OR_UNKNOWN','INVALID_OR_STALE_SAME_DAY_ORDER_TRADES_ARCHIVE');

  let filled=0,lastTrade=-Infinity;
  const unique=new Set<string>();
  for(const [index,trade] of t.response.data.entries()){
    const momentTrade=day(trade?.exchange_timestamp);
    if(!trade||!isId(trade.trade_id)||
      trade.trade_id!==pins.expectedTradeIds[index]||
      unique.has(trade.trade_id)||
      trade.order_id!==pins.expectedChildOrderId||
      trade.exchange_order_id!==pins.expectedExchangeOrderId||
      trade.instrument_token!==input.positionInstrumentKey||
      trade.trading_symbol!==child.tradingSymbol||
      trade.product!=='D'||trade.transaction_type!=='SELL'||
      !Number.isSafeInteger(trade.quantity)||trade.quantity<=0||
      !Number.isFinite(trade.average_price)||trade.average_price<=0||
      !Number.isFinite(momentTrade)||
      istDate(momentTrade)!==historyDate||
      momentTrade<lastTrade||
      momentTrade>moment(t.capturedAt))
      return fail('BLOCKED_OR_UNKNOWN','INVALID_OR_MISMATCHED_ORDER_TRADE_ROW');
    filled+=trade.quantity;
    if(!Number.isSafeInteger(filled)||filled>input.expectedLongQuantity)
      return fail('BLOCKED_OR_UNKNOWN','OVERFILLED_OR_OVERFLOWED_CHILD_TRADE_TOTAL');
    lastTrade=momentTrade;unique.add(trade.trade_id);
  }
  if(filled!==last.filled_quantity||
    (history.reportedTerminalStatus==='complete'&&
      filled!==input.expectedLongQuantity)||
    (history.reportedTerminalStatus==='open'&&
      filled===input.expectedLongQuantity))
    return fail('BLOCKED_OR_UNKNOWN','BROKER_ORDER_FILL_QUANTITY_DISAGREES_WITH_TRADES');
  const partial={
    matchingGttTriggeredChildOrder:true,
    brokerReportedChildExchangeOrderId:true,
    archivedOrderHistoryStages:rows.length,
    archivedTradeRows:t.response.data.length,
    archivedFilledQuantity:filled,
    archivedRemainingQuantity:input.expectedLongQuantity-filled
  };
  const now=moment(input.externalReviewer?.claimedAt);
  if(!Number.isFinite(now)||now<moment(t.capturedAt)||
    now-moment(t.capturedAt)>pins.maxReviewDelayMinutes*60000||
    !signedReview(input,pins))
    return fail('BLOCKED_OR_UNKNOWN',
      'EXTERNAL_SIGNED_REVIEWER_CLAIM_INVALID_OR_STALE',partial);
  return {...empty(),...partial,
    reviewerSignatureVerified:true,
    status:history.reportedTerminalStatus==='complete'?
      'BROKER_REPORTED_CHILD_FILLED_REVIEWED_UNVERIFIED':
      'BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED'};
}
