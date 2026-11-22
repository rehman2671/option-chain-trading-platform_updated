/**
 * Phase109: read-only Upstox v3 MULTIPLE GTT ENTRY+STOPLOSS schema and
 * immutable original NRML BUY order/trade lineage diagnostic.
 *
 * Key gap: a standalone GTT STOPLOSS instruction is NOT a documented
 * MULTIPLE GTT. ENTRY must be the same original durable BUY order; placing
 * a NEW ENTRY could double exposure, and an existing independent BUY does
 * not become a generated GTT ENTRY after the fact. Never releases trading.
 */
type Row=Record<string,unknown>;
const obj=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const key=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=256;
const int=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const positive=(v:unknown):v is number=>int(v)&&v>0;
const price=(v:unknown):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>0;
const up=(v:unknown):string=>
  typeof v==='string'?v.trim().toUpperCase():'';

export interface GttEntryProvenanceScope{
  positionId:string;
  expectedAccountId:string;
  instrumentKey:string;
  gttOrderId:string;
  originalBuyOrderId:string;
  originalBuyExchangeOrderId:string;
  originalQuantity:number;
  lotSize:number;
}
export interface GttEntryProvenanceSources{
  gtt:unknown;
  originalBuyOrder:unknown;
  originalBuyTrades:unknown;
  immutableBuyTrades:unknown;
}
export type GttEntryProvenanceState=
  'INVALID_SCOPE'|
  'BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED'|
  'GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE'|
  'UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS'|
  'ORIGINAL_NRML_BUY_NOT_GENERATED_BY_GTT_ENTRY'|
  'ORIGINAL_BUY_CHILD_OR_IMMUTABLE_TRADE_CONFLICT'|
  'SCHEDULED_STOPLOSS_HAS_NO_EXCHANGE_CHILD'|
  'BROKER_GTT_ENTRY_AND_BUY_MATCH_NOT_PROTECTION_CERTIFIED';
export interface GttEntryProvenanceReport{
  state:GttEntryProvenanceState;
  reasonCodes:readonly string[];
  gttHasValidMultipleEntryStoplossSchema:boolean;
  exactOriginalBuyOrderLinkedToGttEntry:boolean;
  immutableOriginalBuyTradesMatchBroker:boolean;
  brokerReportedBuyTradeCount:number;
  gttStoplossScheduledWithoutChild:boolean;
  brokerReportedStoplossChildIdObserved:boolean;
  gttRequestPlacementSchemaProven:false;
  originalIndependentBuyCanBeAttachedToGttAfterFill:false;
  instrumentFnoGttEligibleIndependentlyVerified:false;
  edisOrOtherSellAuthorizationVerified:false;
  nativeStopOrderExchangeAckCertified:false;
  stopCoverageAndOvernightProtectionCertified:false;
  brokerSnapshotsAtomic:false;
  netRealisedPnlAuthorized:false;
  automaticPositionClosureAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Summary=Partial<Pick<GttEntryProvenanceReport,
  'gttHasValidMultipleEntryStoplossSchema'|
  'exactOriginalBuyOrderLinkedToGttEntry'|
  'immutableOriginalBuyTradesMatchBroker'|
  'brokerReportedBuyTradeCount'|
  'gttStoplossScheduledWithoutChild'|
  'brokerReportedStoplossChildIdObserved'>>;
const make=(state:GttEntryProvenanceState,reasons:string[],
  data:Summary={}):GttEntryProvenanceReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  gttHasValidMultipleEntryStoplossSchema:
    data.gttHasValidMultipleEntryStoplossSchema===true,
  exactOriginalBuyOrderLinkedToGttEntry:
    data.exactOriginalBuyOrderLinkedToGttEntry===true,
  immutableOriginalBuyTradesMatchBroker:
    data.immutableOriginalBuyTradesMatchBroker===true,
  brokerReportedBuyTradeCount:data.brokerReportedBuyTradeCount??0,
  gttStoplossScheduledWithoutChild:
    data.gttStoplossScheduledWithoutChild===true,
  brokerReportedStoplossChildIdObserved:
    data.brokerReportedStoplossChildIdObserved===true,
  gttRequestPlacementSchemaProven:false,
  originalIndependentBuyCanBeAttachedToGttAfterFill:false,
  instrumentFnoGttEligibleIndependentlyVerified:false,
  edisOrOtherSellAuthorizationVerified:false,
  nativeStopOrderExchangeAckCertified:false,
  stopCoverageAndOvernightProtectionCertified:false,
  brokerSnapshotsAtomic:false,netRealisedPnlAuthorized:false,
  automaticPositionClosureAuthorized:false,
  liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
});
const valid=(s:GttEntryProvenanceScope)=>!!s&&
  id(s.positionId)&&id(s.expectedAccountId)&&
  key(s.instrumentKey)&&(s.instrumentKey.startsWith('NSE_FO|')||
    s.instrumentKey.startsWith('BSE_FO|'))&&
  id(s.gttOrderId)&&s.gttOrderId.startsWith('GTT-')&&
  id(s.originalBuyOrderId)&&id(s.originalBuyExchangeOrderId)&&
  positive(s.lotSize)&&positive(s.originalQuantity)&&
  s.originalQuantity%s.lotSize===0;

type Parsed={parent:Row;entry:Row;stop:Row};
function parseGtt(gtt:unknown,s:GttEntryProvenanceScope):Parsed|null{
  if(!Array.isArray(gtt)||gtt.length!==1||!obj(gtt[0]))return null;
  const p=gtt[0];
  if(p.type!=='MULTIPLE'||p.gtt_order_id!==s.gttOrderId||
     p.instrument_token!==s.instrumentKey||p.product!=='D'||
     p.quantity!==s.originalQuantity||
     !Array.isArray(p.rules)||
     (p.rules.length!==2&&p.rules.length!==3))return null;
  const strategies=new Set<string>();let entry:Row|null=null,stop:Row|null=null;
  for(const rule of p.rules){
    if(!obj(rule))return null;
    const strategy=up(rule.strategy);
    const side=up(rule.transaction_type),t=up(rule.trigger_type);
    if(!['ENTRY','TARGET','STOPLOSS'].includes(strategy)||
       strategies.has(strategy)||!price(rule.trigger_price)||
       !id(rule.status)||!['BUY','SELL'].includes(side)||
       (rule.order_id!==null&&rule.order_id!==undefined&&
        !id(rule.order_id)))return null;
    strategies.add(strategy);
    if(strategy==='ENTRY'){
      if(side!=='BUY'||!['IMMEDIATE','ABOVE','BELOW'].includes(t))
        return null;
      entry=rule;
    }else{
      if(side!=='SELL'||t!=='IMMEDIATE')return null;
      if(strategy==='STOPLOSS'){
        if(rule.trailing_gap!==null&&rule.trailing_gap!==undefined&&
           !price(rule.trailing_gap))return null;
        stop=rule;
      }
    }
  }
  if(!entry||!stop)return null;
  return {parent:p,entry,stop};
}
const pendingStop=new Set(['SCHEDULED','PENDING']);
const liveChildStop=new Set(['TRIGGERED','OPEN','COMPLETED']);
const filledEntry=new Set(['TRIGGERED','COMPLETED']);
const fullBuy=new Set(['COMPLETE','COMPLETED','FILLED']);
function fullBrokerOriginalBuy(s:GttEntryProvenanceScope,e:GttEntryProvenanceSources)
  :{ok:boolean;count:number}{
  if(!obj(e.originalBuyOrder)||!Array.isArray(e.originalBuyTrades)||
     !Array.isArray(e.immutableBuyTrades)||
     e.originalBuyTrades.length<1||
     e.originalBuyTrades.length>5000||
     e.originalBuyTrades.length!==e.immutableBuyTrades.length)
    return {ok:false,count:0};
  const o=e.originalBuyOrder;
  if(o.order_id!==s.originalBuyOrderId||
     // Upstox v2 order_ref_id links a generated GTT child to its
     // parent. Matching order ID alone is not sufficient lineage.
     o.order_ref_id!==s.gttOrderId||
     o.exchange_order_id!==s.originalBuyExchangeOrderId||
     o.instrument_token!==s.instrumentKey||o.product!=='D'||
     up(o.transaction_type)!=='BUY'||o.quantity!==s.originalQuantity||
     o.filled_quantity!==s.originalQuantity||o.pending_quantity!==0||
     !fullBuy.has(up(o.status)))
    return {ok:false,count:0};
  const expected=new Map<string,{quantity:number;price:number}>();
  let ledgerSum=0,ledgerPaise=0;
  for(const t of e.immutableBuyTrades){
    if(!obj(t)||!id(t.tradeId)||expected.has(t.tradeId)||
       t.exchangeOrderId!==s.originalBuyExchangeOrderId||
       !positive(t.quantity)||!price(t.price))
      return {ok:false,count:0};
    // Full immutable receipt should be a valid exact paise amount.
    const paise=Math.round(t.price*100);
    if(Math.abs(paise-t.price*100)>0.00001)
      return {ok:false,count:0};
    expected.set(t.tradeId,{quantity:t.quantity,price:paise});
    ledgerSum+=t.quantity;ledgerPaise+=t.quantity*paise;
    if(!Number.isSafeInteger(ledgerSum)||!Number.isSafeInteger(ledgerPaise))
      return {ok:false,count:0};
  }
  if(ledgerSum!==s.originalQuantity)return {ok:false,count:0};
  const seen=new Set<string>();let brokerSum=0,brokerPaise=0;
  for(const t of e.originalBuyTrades){
    if(!obj(t)||!id(t.trade_id)||seen.has(t.trade_id)||
       t.order_id!==s.originalBuyOrderId||
       t.exchange_order_id!==s.originalBuyExchangeOrderId||
       t.instrument_token!==s.instrumentKey||t.product!=='D'||
       up(t.transaction_type)!=='BUY'||!positive(t.quantity)||
       !price(t.average_price))
      return {ok:false,count:0};
    const expectedRow=expected.get(t.trade_id);
    const paise=Math.round(t.average_price*100);
    if(!expectedRow||t.quantity!==expectedRow.quantity||
       !Number.isSafeInteger(paise)||
       Math.abs(t.average_price*100-paise)>0.00001||
       paise!==expectedRow.price)return {ok:false,count:0};
    seen.add(t.trade_id);brokerSum+=t.quantity;
    brokerPaise+=t.quantity*paise;
    if(!Number.isSafeInteger(brokerSum)||!Number.isSafeInteger(brokerPaise))
      return {ok:false,count:0};
  }
  if(brokerSum!==s.originalQuantity||seen.size!==expected.size||
     ledgerPaise!==brokerPaise)return {ok:false,count:0};
  if(!price(o.average_price)||Math.abs(
    Math.round(o.average_price*100)-Math.round(ledgerPaise/ledgerSum))>1)
    return {ok:false,count:0};
  return {ok:true,count:seen.size};
}
export function auditGttEntryOriginalNrmlBuyProvenance(
  s:GttEntryProvenanceScope,e:GttEntryProvenanceSources
):GttEntryProvenanceReport{
  if(!valid(s))return make('INVALID_SCOPE',
    ['INVALID_POSITION_ACCOUNT_GTT_NATIVE_OPTION_BUY_OR_LOTS']);
  if(!e||!Array.isArray(e.gtt))
    return make('GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE',
      ['BROKER_GTT_PARENT_GET_UNAVAILABLE']);
  const parsed=parseGtt(e.gtt,s);
  if(!parsed)return make(
    'UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS',
    ['DOCUMENTED_MULTI_LEG_ENTRY_AND_STOPLOSS_SCHEMA_NOT_OBSERVED']);
  const base:Summary={gttHasValidMultipleEntryStoplossSchema:true};
  const entry=parsed.entry,stop=parsed.stop;
  // Critical: separately placed BUY cannot be presumed to be the GTT ENTRY.
  if(entry.order_id!==s.originalBuyOrderId||!filledEntry.has(up(entry.status)))
    return make('ORIGINAL_NRML_BUY_NOT_GENERATED_BY_GTT_ENTRY',
      ['GTT_ENTRY_CHILD_ID_OR_COMPLETION_DOES_NOT_MATCH_ORIGINAL_BUY'],base);
  base.exactOriginalBuyOrderLinkedToGttEntry=true;
  const b=fullBrokerOriginalBuy(s,e);
  if(!b.ok)return make('ORIGINAL_BUY_CHILD_OR_IMMUTABLE_TRADE_CONFLICT',
    ['BROKER_BUY_CHILD_TRADES_AND_DURABLE_BUY_RECEIPT_NOT_JOINTLY_MATCHED'],
    base);
  base.immutableOriginalBuyTradesMatchBroker=true;
  base.brokerReportedBuyTradeCount=b.count;
  if((stop.order_id===null||stop.order_id===undefined)&&
     pendingStop.has(up(stop.status))){
    base.gttStoplossScheduledWithoutChild=true;
    return make('SCHEDULED_STOPLOSS_HAS_NO_EXCHANGE_CHILD',
      ['GTT_STOPLOSS_NOT_TRIGGERED_NO_EXCHANGE_SELL_CHILD'],base);
  }
  if(!id(stop.order_id)||!liveChildStop.has(up(stop.status)))
    return make('UPSTOX_GTT_SCHEMA_INVALID_OR_NOT_MULTIPLE_ENTRY_STOPLOSS',
      ['GTT_STOPLOSS_CHILD_ID_OR_RULE_LIFECYCLE_UNRESOLVED'],base);
  base.brokerReportedStoplossChildIdObserved=true;
  return make('BROKER_GTT_ENTRY_AND_BUY_MATCH_NOT_PROTECTION_CERTIFIED',
    ['BROKER_REPORTED_GTT_ENTRY_NOT_NATIVE_STOP_EXCHANGE_ACK',
     'UPSTOX_MULTI_GET_SNAPSHOT_AND_SELL_COVERAGE_NOT_CERTIFIED'],base);
}

export interface GttEntryReadOnlyBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getBrokerAuthEpoch():number;
  getGttOrderDetails(id:string):Promise<unknown>;
  getOrderDetails(id:string):Promise<unknown>;
  getOrderTrades(id:string):Promise<unknown>;
}
/** All endpoints GET-only. Token/identity never included in the result. */
export async function reviewGttEntryOriginalNrmlBuyReadOnly(
  broker:GttEntryReadOnlyBroker,s:GttEntryProvenanceScope,
  immutableBuyTrades:unknown
):Promise<GttEntryProvenanceReport>{
  if(!valid(s))return make('INVALID_SCOPE',
    ['INVALID_POSITION_ACCOUNT_GTT_NATIVE_OPTION_BUY_OR_LOTS']);
  if(!broker||['getLiveConnectionStatus','getBrokerAuthEpoch',
    'getGttOrderDetails','getOrderDetails','getOrderTrades'].some(
      name=>typeof broker[name as keyof GttEntryReadOnlyBroker]!=='function'))
    return make('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
      ['BROKER_GTT_OR_BUY_GET_METHOD_UNAVAILABLE']);
  let epoch:number;
  try{
    const auth=broker.getLiveConnectionStatus();
    epoch=broker.getBrokerAuthEpoch();
    if(auth?.isConnected!==true||auth.userId!==s.expectedAccountId||
       !positive(epoch))
      return make('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
        ['BROKER_ACCOUNT_OR_LOCAL_SESSION_EPOCH_INVALID']);
  }catch{
    return make('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
      ['BROKER_ACCOUNT_OR_LOCAL_SESSION_EPOCH_INVALID']);
  }
  const unchanged=():boolean=>{
    try{
      const auth=broker.getLiveConnectionStatus();
      return auth?.isConnected===true&&auth.userId===s.expectedAccountId&&
        broker.getBrokerAuthEpoch()===epoch;
    }catch{return false;}
  };
  const lost=()=>make('BROKER_ACCOUNT_OR_AUTH_EPOCH_UNVERIFIED',
    ['BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_DURING_GTT_BUY_READ']);
  if(!unchanged())return lost();
  let first:unknown;
  try{first=await broker.getGttOrderDetails(s.gttOrderId);}
  catch{return make('GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE',
    ['BROKER_GTT_FIRST_READ_FAILED']);}
  if(!unchanged())return lost();
  // Do not fetch arbitrary BUY order IDs if the parent does not prove
  // exact original BUY linkage.
  const candidate=auditGttEntryOriginalNrmlBuyProvenance(s,{
    gtt:first,originalBuyOrder:null,originalBuyTrades:null,
    immutableBuyTrades
  });
  if(!candidate.gttHasValidMultipleEntryStoplossSchema||
     !candidate.exactOriginalBuyOrderLinkedToGttEntry)return candidate;
  let buyOrder:unknown,trades:unknown;
  try{
    [buyOrder,trades]=await Promise.all([
      broker.getOrderDetails(s.originalBuyOrderId),
      broker.getOrderTrades(s.originalBuyOrderId)
    ]);
  }catch{return make('GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE',
    ['BROKER_ORIGINAL_BUY_DETAILS_OR_TRADES_GET_FAILED']);}
  if(!unchanged())return lost();
  let last:unknown;
  try{last=await broker.getGttOrderDetails(s.gttOrderId);}
  catch{return make('GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE',
    ['BROKER_GTT_FINAL_READ_FAILED']);}
  if(!unchanged())return lost();
  if(JSON.stringify(first)!==JSON.stringify(last))
    return make('GTT_OR_BUY_BROKER_SOURCE_INCOMPLETE',
      ['GTT_PARENT_OR_ENTRY_STOPLOSS_RULE_CHANGED_BETWEEN_GETS']);
  return auditGttEntryOriginalNrmlBuyProvenance(s,{
    gtt:last,originalBuyOrder:buyOrder,originalBuyTrades:trades,
    immutableBuyTrades
  });
}
