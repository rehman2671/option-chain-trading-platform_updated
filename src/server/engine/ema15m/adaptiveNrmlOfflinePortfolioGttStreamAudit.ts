/**
 * Phase116 - OFFLINE ONLY Upstox portfolio WebSocket event continuity
 * research for existing filled NRML F&O long + GTT SINGLE ENTRY SELL.
 *
 * No socket connection, webhook route, broker orders, journal mutation or
 * live-release gate here. The caller-supplied event archive, auth context
 * and receive sequence are NOT independently authenticated or complete.
 * Public unauthenticated webhook payloads must never certify orders.
 *
 * Official WebSocket update_types include order/gtt_order/position;
 * order order_ref_id can correlate child to parent GTT. This is
 * broker-reported correlation ONLY, never signed exchange receipt.
 */
type Row=Record<string,unknown>;
const obj=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const ident=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const gttId=(v:unknown):v is string=>
  typeof v==='string'&&/^GTT-[A-Za-z0-9-]{1,124}$/.test(v);
const pos=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const uint=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const price=(v:unknown):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>0&&
  Number.isSafeInteger(Math.round(v*100))&&
  Math.abs(Math.round(v*100)-v*100)<0.00001;
const up=(v:unknown):string=>
  typeof v==='string'?v.trim().toUpperCase():'';
const iso=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
export interface PortfolioGttReplayScope{
  expectedAccountId:string;
  instrumentKey:string;
  gttOrderId:string;
  originalLongQuantity:number;
  lotSize:number;
  expectedAuthEpoch:number;
}
export interface PortfolioGttReplayEvent{
  sequence:number; // local recorder sequence, not asserted by Upstox
  capturedAt:string; // authenticated recorder UTC/offset timestamp
  captureAuthEpoch:number;
  connectedAccountId:string;
  transport:'AUTHENTICATED_UPSTOX_PORTFOLIO_WS'|'UNAUTHENTICATED_PUBLIC_WEBHOOK';
  payload:unknown;
}
export type PortfolioGttReplayState=
  'INVALID_SCOPE'|
  'STREAM_ARCHIVE_ABSENT_UNTRUSTED_OR_WEBHOOK'|
  'RECORDER_SEQUENCE_CLOCK_SESSION_OR_ACCOUNT_GAP'|
  'SAME_CONTRACT_OTHER_ORDER_OR_GTT_EVENT_CONFLICT'|
  'GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING'|
  'ORDER_REF_CHILD_SIDE_PRODUCT_OR_QUANTITY_CONFLICT'|
  'ORDER_UPDATE_FILL_OR_EXCHANGE_ID_CONFLICT'|
  'POSITION_STREAM_AFTER_CHILD_MISSING_OR_CONFLICT'|
  'BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION';
export interface PortfolioGttReplayReport{
  state:PortfolioGttReplayState;
  reasonCodes:readonly string[];
  observedEventCount:number;
  brokerReportedGttUpdateCount:number;
  brokerReportedGeneratedSellOrderUpdateCount:number;
  brokerReportedLastSellFilledQuantity:number|null;
  brokerReportedLastSellPendingQuantity:number|null;
  brokerReportedLastStreamNetQuantity:number|null;
  brokerReportedGeneratedChildLimitOrder:boolean;
  brokerReportedVenueOrderReferenceObserved:boolean;
  brokerReportedOriginalLongNowFlat:boolean;
  capturedWebsocketHandshakeIndependentlyVerified:false;
  originalCompleteStreamHistoryAuthenticated:false;
  recorderClockAndSequenceIndependentlyCertified:false;
  publicWebhookCanCertifyExecution:false;
  childOrderRefIdIsNotVenueSignature:true;
  generatedSellIsNotExchangeNativeStop:true;
  brokerReportedSellFillIndependentlyCleared:false;
  continuousOvernightProtectionCertified:false;
  accountWidePositionAndChargesCertified:false;
  brokerCloseOnlyOrNoShortIndependentlyCertified:false;
  signedContractNotesAndTradeReceiptsVerified:false;
  automaticPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  duplicateSellRetryAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Counts=Partial<Pick<PortfolioGttReplayReport,
  'observedEventCount'|'brokerReportedGttUpdateCount'|
  'brokerReportedGeneratedSellOrderUpdateCount'|
  'brokerReportedLastSellFilledQuantity'|
  'brokerReportedLastSellPendingQuantity'|
  'brokerReportedLastStreamNetQuantity'|
  'brokerReportedGeneratedChildLimitOrder'|
  'brokerReportedVenueOrderReferenceObserved'|
  'brokerReportedOriginalLongNowFlat'>>;
const result=(state:PortfolioGttReplayState,reasons:string[],
  c:Counts={}):PortfolioGttReplayReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  observedEventCount:c.observedEventCount??0,
  brokerReportedGttUpdateCount:c.brokerReportedGttUpdateCount??0,
  brokerReportedGeneratedSellOrderUpdateCount:
    c.brokerReportedGeneratedSellOrderUpdateCount??0,
  brokerReportedLastSellFilledQuantity:
    c.brokerReportedLastSellFilledQuantity??null,
  brokerReportedLastSellPendingQuantity:
    c.brokerReportedLastSellPendingQuantity??null,
  brokerReportedLastStreamNetQuantity:
    c.brokerReportedLastStreamNetQuantity??null,
  brokerReportedGeneratedChildLimitOrder:
    c.brokerReportedGeneratedChildLimitOrder===true,
  brokerReportedVenueOrderReferenceObserved:
    c.brokerReportedVenueOrderReferenceObserved===true,
  brokerReportedOriginalLongNowFlat:
    c.brokerReportedOriginalLongNowFlat===true,
  capturedWebsocketHandshakeIndependentlyVerified:false,
  originalCompleteStreamHistoryAuthenticated:false,
  recorderClockAndSequenceIndependentlyCertified:false,
  publicWebhookCanCertifyExecution:false,
  childOrderRefIdIsNotVenueSignature:true,
  generatedSellIsNotExchangeNativeStop:true,
  brokerReportedSellFillIndependentlyCleared:false,
  continuousOvernightProtectionCertified:false,
  accountWidePositionAndChargesCertified:false,
  brokerCloseOnlyOrNoShortIndependentlyCertified:false,
  signedContractNotesAndTradeReceiptsVerified:false,
  automaticPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,duplicateSellRetryAuthorized:false,
  liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
});
const valid=(s:PortfolioGttReplayScope)=>!!s&&
  ident(s.expectedAccountId)&&gttId(s.gttOrderId)&&
  typeof s.instrumentKey==='string'&&s.instrumentKey.length<=256&&
  (s.instrumentKey.startsWith('NSE_FO|')||
   s.instrumentKey.startsWith('BSE_FO|'))&&
  pos(s.originalLongQuantity)&&pos(s.lotSize)&&
  s.originalLongQuantity%s.lotSize===0&&
  pos(s.expectedAuthEpoch);
const statuses=new Set(['TRIGGERED','OPEN','COMPLETED']);
const childStatuses=new Set(['OPEN','PARTIALLY FILLED','COMPLETE','COMPLETED']);
/** No side effects and no identifiable values returned. */
export function auditPortfolioGttSellStreamReplay(
  s:PortfolioGttReplayScope,
  archive:unknown
):PortfolioGttReplayReport{
  if(!valid(s))return result('INVALID_SCOPE',
    ['NRML_INSTRUMENT_GTT_ACCOUNT_LOT_OR_CAPTURE_EPOCH_INVALID']);
  if(!Array.isArray(archive)||archive.length<3||archive.length>5000)
    return result('STREAM_ARCHIVE_ABSENT_UNTRUSTED_OR_WEBHOOK',
      ['BOUNDED_AUTHENTICATED_PORTFOLIO_WS_CAPTURE_MISSING']);
  // No user-pasted webhook data may be considered verified. Server-side
  // source custody still requires future independent review.
  if(archive.some(x=>!obj(x)||
      x.transport!=='AUTHENTICATED_UPSTOX_PORTFOLIO_WS'||
      !obj(x.payload)))
    return result('STREAM_ARCHIVE_ABSENT_UNTRUSTED_OR_WEBHOOK',
      ['PUBLIC_WEBHOOK_OR_MALFORMED_UNTRUSTED_EVENT_REJECTED']);
  let lastSeq:number|null=null,lastMs:number|null=null;
  for(const e of archive as PortfolioGttReplayEvent[]){
    if(!pos(e.sequence)||
       (lastSeq!==null&&e.sequence!==lastSeq+1)||
       typeof e.capturedAt!=='string'||!iso.test(e.capturedAt)||
       !Number.isFinite(Date.parse(e.capturedAt))||
       (lastMs!==null&&Date.parse(e.capturedAt)<=lastMs)||
       e.captureAuthEpoch!==s.expectedAuthEpoch||
       e.connectedAccountId!==s.expectedAccountId)
      return result('RECORDER_SEQUENCE_CLOCK_SESSION_OR_ACCOUNT_GAP',
        ['EVENT_RECORDER_CLOCK_SEQUENCE_ACCOUNT_OR_CREDENTIAL_EPOCH_CHANGED']);
    const p=e.payload as Row;
    if((p.user_id!==undefined&&p.user_id!==s.expectedAccountId)||
       (p.userId!==undefined&&p.userId!==s.expectedAccountId))
      return result('RECORDER_SEQUENCE_CLOCK_SESSION_OR_ACCOUNT_GAP',
        ['EVENT_ACCOUNT_FIELDS_DISAGREE_WITH_CAPTURE_ACCOUNT']);
    if(!['order','gtt_order','position','holding'].includes(
      String(p.update_type)))
      return result('STREAM_ARCHIVE_ABSENT_UNTRUSTED_OR_WEBHOOK',
        ['EVENT_UPDATE_TYPE_UNKNOWN']);
    lastSeq=e.sequence;lastMs=Date.parse(e.capturedAt);
  }
  const counts:Counts={observedEventCount:archive.length};
  let gttUpdates=0,orderUpdates=0;
  let childId:string|null=null,childEventLast=-1;
  let filled:number|null=null,pending:number|null=null;
  let exchangeId:string|null=null;
  let netAfter:number|null=null;
  let gttSeen=false,orderSeen=false;
  for(let i=0;i<archive.length;i++){
    const p=archive[i].payload as Row;
    const key=p.instrument_token??p.instrument_key;
    if(key!==s.instrumentKey)continue;
    if(p.product!=='D')
      return result('SAME_CONTRACT_OTHER_ORDER_OR_GTT_EVENT_CONFLICT',
        ['SAME_OPTION_OTHER_PRODUCT_EVENT_INVALID']);
    if(p.update_type==='gtt_order'){
      if(p.gtt_order_id!==s.gttOrderId)
        return result('SAME_CONTRACT_OTHER_ORDER_OR_GTT_EVENT_CONFLICT',
          ['OTHER_GTT_CAN_GENERATE_UNTRACKED_SAME_CONTRACT_ORDER']);
      if(p.type!=='SINGLE'||p.quantity!==s.originalLongQuantity||
         !Array.isArray(p.rules)||p.rules.length!==1||
         !obj(p.rules[0]))
        return result('GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING',
          ['SINGLE_GTT_OPTION_QUANTITY_OR_RULE_SCHEMA_MISMATCH']);
      const rule=p.rules[0];
      if(up(rule.strategy)!=='ENTRY'||
         up(rule.transaction_type)!=='SELL'||
         up(rule.trigger_type)!=='BELOW'||!price(rule.trigger_price))
        return result('GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING',
          ['GTT_ENTRY_SELL_BELOW_REQUIRED_NOT_MULTIPLE_BUY']);
      if(rule.order_id===null&&up(rule.status)==='SCHEDULED'){
        if(gttSeen)return result('GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING',
          ['GENERATED_GTT_CANNOT_REVERT_TO_SCHEDULED_NULL_CHILD']);
      }else if(statuses.has(up(rule.status))&&ident(rule.order_id)){
        if(childId!==null&&rule.order_id!==childId)
          return result('GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING',
            ['PARENT_GTT_GENERATED_MULTIPLE_SELL_ORDER_IDS']);
        childId=rule.order_id;gttSeen=true;
      }else return result('GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING',
        ['GTT_NO_GENERATED_SELL_CHILD_OR_CANCEL_FAILED_STATE']);
      gttUpdates++;
    }else if(p.update_type==='order'){
      if(p.order_ref_id!==s.gttOrderId||!ident(p.order_id))
        return result('SAME_CONTRACT_OTHER_ORDER_OR_GTT_EVENT_CONFLICT',
          ['OTHER_SAME_CONTRACT_ORDER_NOT_LINKED_TO_GTT']);
      if(childId===null||childId!==p.order_id)
        return result('ORDER_REF_CHILD_SIDE_PRODUCT_OR_QUANTITY_CONFLICT',
          ['SELL_CHILD_UPDATE_PRECEDES_OR_DISAGREES_WITH_GTT_GENERATION']);
      const f=p.filled_quantity,q=p.pending_quantity;
      const st=up(p.status);
      if(up(p.transaction_type)!=='SELL'||up(p.order_type)!=='LIMIT'||
         p.quantity!==s.originalLongQuantity||!uint(f)||!uint(q)||
         f+q!==s.originalLongQuantity||
         !childStatuses.has(st)||!price(p.price)||
         (st==='PARTIALLY FILLED'&&(f===0||q===0))||
         (st==='OPEN'&&q===0)||
         (['COMPLETE','COMPLETED'].includes(st)&&
           (f!==s.originalLongQuantity||q!==0)))
        return result('ORDER_REF_CHILD_SIDE_PRODUCT_OR_QUANTITY_CONFLICT',
          ['SELL_CHILD_SIDE_LIMIT_QTY_STATUS_OR_PRICE_INVALID']);
      if(filled!==null&&f<filled)
        return result('ORDER_UPDATE_FILL_OR_EXCHANGE_ID_CONFLICT',
          ['CHILD_CUMULATIVE_EXECUTIONS_REVERSED']);
      if(orderSeen&&exchangeId!==p.exchange_order_id)
        return result('ORDER_UPDATE_FILL_OR_EXCHANGE_ID_CONFLICT',
          ['CHILD_EXCHANGE_ID_CHANGED_DURING_CAPTURE']);
      if(!ident(p.exchange_order_id))
        return result('ORDER_UPDATE_FILL_OR_EXCHANGE_ID_CONFLICT',
          ['CHILD_EXCHANGE_ORDER_REFERENCE_NOT_OBSERVED']);
      filled=f;pending=q;orderSeen=true;
      exchangeId=p.exchange_order_id;childEventLast=i;
      netAfter=null;orderUpdates++;
    }else if(p.update_type==='position'&&orderSeen&&i>childEventLast){
      const n=p.quantity;
      if(!uint(n)||n>s.originalLongQuantity||
         n%s.lotSize!==0&&n!==0)
        return result('POSITION_STREAM_AFTER_CHILD_MISSING_OR_CONFLICT',
          ['POST_SELL_BROKER_NET_INVALID_OR_NONLOT']);
      netAfter=n;
    }
  }
  counts.brokerReportedGttUpdateCount=gttUpdates;
  counts.brokerReportedGeneratedSellOrderUpdateCount=orderUpdates;
  if(!gttSeen||!childId||gttUpdates===0)
    return result('GTT_SINGLE_SELL_EVENT_OR_CHILD_ID_MISSING',
      ['GENERATED_SELL_GTT_LINKED_PARENT_EVENT_ABSENT'],counts);
  if(!orderSeen||filled===null||pending===null||!exchangeId)
    return result('ORDER_REF_CHILD_SIDE_PRODUCT_OR_QUANTITY_CONFLICT',
      ['LINKED_LIMIT_SELL_ORDER_EVENT_ABSENT'],counts);
  counts.brokerReportedLastSellFilledQuantity=filled;
  counts.brokerReportedLastSellPendingQuantity=pending;
  if(netAfter===null||netAfter!==s.originalLongQuantity-filled||
     netAfter!==pending)
    return result('POSITION_STREAM_AFTER_CHILD_MISSING_OR_CONFLICT',
      ['POSITION_EVENT_AFTER_FINAL_CHILD_NOT_EQUAL_BUY_MINUS_SELL'],counts);
  counts.brokerReportedLastStreamNetQuantity=netAfter;
  return result('BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION',[
    'WEBSOCKET_EVENT_ORDER_REF_ID_MATCH_NOT_SIGNED_EXCHANGE_ACK',
    'LOCAL_RECORDER_SEQUENCE_NOT_BROKER_GUARANTEED_CONTINUITY',
    'WEBSOCKET_CANNOT_PROVE_OFFLINE_EVENTS_OR_CROSS_SESSION_TRADES',
    'NATIVE_GTT_TRIGGER_LIMIT_SELL_IS_NOT_EXCHANGE_STOP'
  ],{...counts,
    brokerReportedGeneratedChildLimitOrder:true,
    brokerReportedVenueOrderReferenceObserved:true,
    brokerReportedOriginalLongNowFlat:netAfter===0
  });
}
