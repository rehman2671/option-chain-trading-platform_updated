/**
 * Phase104 — full-range paginated F&O broker trade history vs immutable
 * original BUY and SELL trade-ID ledgers. GET-only, non-atomic, fail-closed.
 *
 * Official historical FO trades have trade_id / trade_date / exchange /
 * underlying / strike / expiry / option_type / BUY-SELL / price / quantity,
 * but DO NOT reliably provide original order_id or option instrument_token.
 * Therefore historical matches are BROKER-REPORTED corroboration, NEVER
 * independently signed exchange receipts, tax contract notes or settlement.
 */
type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>!!x&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const date=(x:unknown):x is string=>{
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const d=new Date(x+'T00:00:00.000Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
};
const pos=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const paise=(x:unknown):number|null=>{
  if(typeof x!=='number'||!Number.isFinite(x)||x<=0)return null;
  const n=Math.round(x*100);
  return Number.isSafeInteger(n)&&Math.abs(x*100-n)<0.00001?n:null;
};
const up=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
const num=(x:unknown):number|null=>{
  if(typeof x==='number'&&Number.isFinite(x))return x;
  if(typeof x==='string'&&/^\d+(?:\.\d+)?$/.test(x)){
    const n=Number(x);return Number.isFinite(n)?n:null;
  }
  return null;
};
export interface HistoricalFoScope{
  expectedAccountId:string;
  startDate:string;
  endDate:string;
  asOfDate:string;
  entryTradeDate:string;
  underlyingSymbol:string;
  optionType:'CE'|'PE';
  strikePrice:number;
  expiryDate:string;
  exchange:'NFO'|'BFO';
  originalBuyQuantity:number;
  exitedSellQuantity:number;
}
export interface HistoricalFoReceipt{
  tradeId:string;
  exchangeOrderId:string;
  quantity:number;
  price:number;
}
export type HistoricalFoStatus=
  'INVALID_HISTORICAL_FO_SCOPE'|
  'HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH'|
  'HISTORICAL_FO_SOURCE_INCOMPLETE'|
  'HISTORICAL_FO_TRADE_CONFLICT'|
  'BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED';
export interface HistoricalFoReport{
  state:HistoricalFoStatus;
  reasonCodes:readonly string[];
  requestedPageCount:number;
  retrievedTradeRowCount:number;
  matchedOriginalBuyTrades:number;
  matchedExitSellTrades:number;
  otherSameContractTrades:number;
  brokerHistoricalOrderIdPresent:false;
  brokerHistoricalInstrumentTokenPresent:false;
  historicalTradesIndependentlyCertified:false;
  signedContractNotesReconciled:false;
  actualBrokerChargesAndTaxesVerified:false;
  completeAccountWideExposureCertified:false;
  nativeProtectiveStopChildExchangeAckCertified:false;
  currentBrokerNetNotIndependentlyCertified:true;
  sourceEndpointsAtomic:false;
  netRealisedPnl:null;
  automaticClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Counts=Partial<Pick<HistoricalFoReport,'requestedPageCount'|
  'retrievedTradeRowCount'|'matchedOriginalBuyTrades'|
  'matchedExitSellTrades'|'otherSameContractTrades'>>;
const report=(state:HistoricalFoStatus,reasons:string[],
  counts:Counts={}):HistoricalFoReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  requestedPageCount:counts.requestedPageCount??0,
  retrievedTradeRowCount:counts.retrievedTradeRowCount??0,
  matchedOriginalBuyTrades:counts.matchedOriginalBuyTrades??0,
  matchedExitSellTrades:counts.matchedExitSellTrades??0,
  otherSameContractTrades:counts.otherSameContractTrades??0,
  brokerHistoricalOrderIdPresent:false,
  brokerHistoricalInstrumentTokenPresent:false,
  historicalTradesIndependentlyCertified:false,
  signedContractNotesReconciled:false,
  actualBrokerChargesAndTaxesVerified:false,
  completeAccountWideExposureCertified:false,
  nativeProtectiveStopChildExchangeAckCertified:false,
  currentBrokerNetNotIndependentlyCertified:true,
  sourceEndpointsAtomic:false,netRealisedPnl:null,
  automaticClosureAuthorized:false,realisedPnlWriteAuthorized:false,
  liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
});
const validScope=(s:HistoricalFoScope):boolean=>{
  if(!s||!id(s.expectedAccountId)||
     !date(s.startDate)||!date(s.endDate)||!date(s.asOfDate)||
     !date(s.entryTradeDate)||!date(s.expiryDate)||
     s.startDate!==s.entryTradeDate||
     s.endDate!==s.asOfDate||
     s.startDate>s.endDate||
     (new Date(s.endDate+'T00:00:00Z').getTime()-
       new Date(s.startDate+'T00:00:00Z').getTime())/86400000>120||
     !/^[A-Z0-9]{2,30}$/.test(s.underlyingSymbol)||
     !['CE','PE'].includes(s.optionType)||
     !Number.isFinite(s.strikePrice)||s.strikePrice<=0||
     !['NFO','BFO'].includes(s.exchange)||
     !pos(s.originalBuyQuantity)||
     !Number.isSafeInteger(s.exitedSellQuantity)||
     s.exitedSellQuantity<0||s.exitedSellQuantity>s.originalBuyQuantity)
    return false;
  return true;
};
const extractRows=(pages:unknown[]):{rows:Row[];reason:string|null}=>{
  if(!Array.isArray(pages)||pages.length<1||pages.length>20)
    return {rows:[],reason:'HISTORICAL_FO_PAGES_MISSING_OR_EXCEED_BOUNDED_LIMIT'};
  const rows:Row[]=[];
  let totalPages:number|null=null,totalRecords:number|null=null;
  for(let i=0;i<pages.length;i++){
    const p=pages[i];
    if(!obj(p)||p.status!=='success'||!Array.isArray(p.data)||
       !obj(p.meta_data)||!obj(p.meta_data.page))
      return {rows:[],reason:'HISTORICAL_FO_RESPONSE_OR_METADATA_MISSING'};
    const m=p.meta_data.page;
    if(!pos(m.page_number)||!pos(m.total_pages)||
       !pos(m.page_size)||!Number.isSafeInteger(m.total_records)||
       (m.total_records as number)<0||
       m.page_number!==i+1||m.total_pages>20||
       m.page_size>5000||p.data.length>m.page_size)
      return {rows:[],reason:'HISTORICAL_FO_PAGINATION_METADATA_INVALID'};
    if(totalPages===null){
      totalPages=m.total_pages;totalRecords=m.total_records as number;
    }else if(totalPages!==m.total_pages||totalRecords!==m.total_records)
      return {rows:[],reason:'HISTORICAL_FO_PAGINATION_SNAPSHOT_CHANGED'};
    if(rows.length+p.data.length>20000)
      return {rows:[],reason:'HISTORICAL_FO_TRADES_EXCEED_BOUNDED_LIMIT'};
    for(const one of p.data){
      if(!obj(one))return {rows:[],reason:'HISTORICAL_FO_TRADE_ROW_MALFORMED'};
      rows.push(one);
    }
  }
  if(totalPages!==pages.length||totalRecords!==rows.length)
    return {rows:[],reason:'HISTORICAL_FO_PAGE_COUNT_OR_TOTAL_RECORDS_INCOMPLETE'};
  return {rows,reason:null};
};
const receipts=(raw:unknown,side:'BUY'|'SELL'):
  {map:Map<string,HistoricalFoReceipt>;reason:string|null}=>{
  const found=new Map<string,HistoricalFoReceipt>();
  if(!Array.isArray(raw)||raw.length===0||raw.length>5000)
    return {map:found,reason:'DURABLE_'+side+'_TRADE_RECEIPTS_MISSING'};
  for(const t of raw){
    if(!obj(t)||!id(t.tradeId)||found.has(t.tradeId)||
       !id(t.exchangeOrderId)||!pos(t.quantity)||paise(t.price)===null)
      return {map:found,reason:'DURABLE_'+side+'_TRADE_RECEIPT_INVALID'};
    found.set(t.tradeId,{
      tradeId:t.tradeId,exchangeOrderId:t.exchangeOrderId,
      quantity:t.quantity,price:t.price
    });
  }
  return {map:found,reason:null};
};
/**
 * Deterministic account-history audit. all pages must be fully fetched.
 * Original BUY and SELL receipts are private immutable SQLite trade rows.
 */
export function auditHistoricalFoTradeHistory(s:HistoricalFoScope,args:{
  connectedAccountId:unknown;
  connected:unknown;
  pages:unknown;
  buyTrades:unknown;
  sellTrades:unknown;
}):HistoricalFoReport{
  if(!validScope(s))
    return report('INVALID_HISTORICAL_FO_SCOPE',
      ['INVALID_ACCOUNT_DATES_CONTRACT_OR_EXPECTED_QUANTITY']);
  if(args?.connected!==true||args.connectedAccountId!==s.expectedAccountId)
    return report('HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH',['BROKER_ACCOUNT_NOT_VERIFIED']);
  if(!Array.isArray(args.pages))
    return report('HISTORICAL_FO_SOURCE_INCOMPLETE',['HISTORICAL_FO_PAGE_SOURCE_UNAVAILABLE']);
  const fetched=extractRows(args.pages),counts:Counts={
    requestedPageCount:args.pages.length,
    retrievedTradeRowCount:fetched.rows.length
  };
  if(fetched.reason)
    return report('HISTORICAL_FO_SOURCE_INCOMPLETE',[fetched.reason],counts);
  const buys=receipts(args.buyTrades,'BUY');
  const sells=receipts(args.sellTrades,'SELL');
  if(buys.reason||sells.reason)
    return report('HISTORICAL_FO_SOURCE_INCOMPLETE',
      [buys.reason,sells.reason].filter((x):x is string=>!!x),counts);
  const buyQty=[...buys.map.values()].reduce((n,t)=>n+t.quantity,0);
  const sellQty=[...sells.map.values()].reduce((n,t)=>n+t.quantity,0);
  if(!Number.isSafeInteger(buyQty)||!Number.isSafeInteger(sellQty)||
     buyQty!==s.originalBuyQuantity||sellQty!==s.exitedSellQuantity)
    return report('HISTORICAL_FO_TRADE_CONFLICT',
      ['DURABLE_BUY_SELL_QUANTITIES_DISAGREE_WITH_REQUEST'],counts);
  for(const id0 of buys.map.keys()){
    if(sells.map.has(id0))return report('HISTORICAL_FO_TRADE_CONFLICT',
      ['BUY_SELL_IMMUTABLE_TRADE_ID_COLLISION'],counts);
  }
  const seen=new Set<string>();
  let buyFound=0,sellFound=0,untracked=0;
  const conflicts:string[]=[],missing:string[]=[];
  for(const r of fetched.rows){
    // FO docs may omit option instrument_token and order_id; do not
    // manufacture them. Identity is checked via exchange/symbol/option.
    if(!id(r.trade_id)||seen.has(r.trade_id)||r.segment!=='FO'||
       !date(r.trade_date)||r.trade_date<s.startDate||
       r.trade_date>s.endDate||!pos(r.quantity)||
       paise(r.price)===null||
       !['BUY','SELL'].includes(up(r.transaction_type))||
       !['NFO','BFO'].includes(up(r.exchange))){
      conflicts.push('INVALID_DUPLICATE_OR_OUT_OF_RANGE_HISTORICAL_FO_ROW');
      continue;
    }
    seen.add(r.trade_id);
    const expected=buys.map.get(r.trade_id)??sells.map.get(r.trade_id);
    const rowStrike=num(r.strike_price);
    const underlying=up(r.scrip_name||r.symbol);
    const sameContract=up(r.exchange)===s.exchange&&
      underlying===s.underlyingSymbol&&
      up(r.option_type)===s.optionType&&
      r.expiry===s.expiryDate&&rowStrike!==null&&
      Math.abs(rowStrike-s.strikePrice)<0.00001;
    if(expected){
      const side=buys.map.has(r.trade_id)?'BUY':'SELL';
      if(!sameContract||up(r.transaction_type)!==side||
         r.quantity!==expected.quantity||
         Math.round((r.price as number)*100)!==
           Math.round(expected.price*100))
        conflicts.push('HISTORICAL_TRADE_ID_CONTRACT_SIDE_SIZE_OR_PRICE_CONFLICT');
      else if(side==='BUY')buyFound++;
      else sellFound++;
      continue;
    }
    if(sameContract){
      untracked++;
      conflicts.push('ADDITIONAL_SAME_OPTION_TRADE_NOT_IN_IMMUTABLE_CHILD_LEDGER');
    }
  }
  counts.matchedOriginalBuyTrades=buyFound;
  counts.matchedExitSellTrades=sellFound;
  counts.otherSameContractTrades=untracked;
  if(buyFound!==buys.map.size||sellFound!==sells.map.size)
    missing.push('IMMUTABLE_BUY_OR_SELL_TRADE_ID_ABSENT_FROM_COMPLETE_HISTORICAL_PAGES');
  if(conflicts.length)
    return report('HISTORICAL_FO_TRADE_CONFLICT',[...conflicts,...missing],counts);
  if(missing.length)
    return report('HISTORICAL_FO_SOURCE_INCOMPLETE',missing,counts);
  return report('BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED',
    ['BROKER_HISTORY_DOES_NOT_PROVIDE_ORDER_ID_OR_EXCHANGE_SETTLEMENT_CERTIFICATE'],
    counts);
}
export interface HistoricalFoReadBroker{
  getLiveConnectionStatus():{isConnected:boolean;userId?:string};
  getHistoricalFoTradesPage(startDate:string,endDate:string,page:number,
    pageSize:number):Promise<unknown>;
}
/** Sequential bounded page reads with hard failure on meta change/missing. */
export async function reviewHistoricalFoTradeHistoryReadOnly(
  broker:HistoricalFoReadBroker,s:HistoricalFoScope,
  buyTrades:unknown,sellTrades:unknown
):Promise<HistoricalFoReport>{
  if(!validScope(s))
    return report('INVALID_HISTORICAL_FO_SCOPE',
      ['INVALID_ACCOUNT_DATES_CONTRACT_OR_EXPECTED_QUANTITY']);
  if(!broker||typeof broker.getLiveConnectionStatus!=='function'||
     typeof broker.getHistoricalFoTradesPage!=='function')
    return report('HISTORICAL_FO_SOURCE_INCOMPLETE',
      ['BROKER_HISTORICAL_FO_GET_METHOD_UNAVAILABLE']);
  let auth:ReturnType<HistoricalFoReadBroker['getLiveConnectionStatus']>;
  try{auth=broker.getLiveConnectionStatus();}
  catch{return report('HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH',
    ['BROKER_ACCOUNT_STATUS_UNAVAILABLE']);}
  if(auth?.isConnected!==true||auth.userId!==s.expectedAccountId)
    return report('HISTORICAL_FO_BROKER_ACCOUNT_MISMATCH',
      ['BROKER_ACCOUNT_NOT_VERIFIED']);
  const pages:unknown[]=[];let totalPages:number|null=null;
  try{
    for(let n=1;n<=20;n++){
      const raw=await broker.getHistoricalFoTradesPage(
        s.startDate,s.endDate,n,1000
      );
      if(!obj(raw)||!obj(raw.meta_data)||!obj(raw.meta_data.page)||
         !pos(raw.meta_data.page.total_pages)||
         raw.meta_data.page.total_pages>20)
        return report('HISTORICAL_FO_SOURCE_INCOMPLETE',
          ['HISTORICAL_FO_PAGE_TRANSPORT_OR_METADATA_FAILED']);
      if(totalPages===null)totalPages=raw.meta_data.page.total_pages;
      if(raw.meta_data.page.total_pages!==totalPages)
        return report('HISTORICAL_FO_SOURCE_INCOMPLETE',
          ['HISTORICAL_FO_PAGINATION_SNAPSHOT_CHANGED']);
      pages.push(raw);
      if(n===totalPages)break;
    }
  }catch{return report('HISTORICAL_FO_SOURCE_INCOMPLETE',
    ['HISTORICAL_FO_PAGE_TRANSPORT_OR_METADATA_FAILED']);}
  return auditHistoricalFoTradeHistory(s,{
    connected:true,connectedAccountId:auth.userId,
    pages,buyTrades,sellTrades
  });
}
