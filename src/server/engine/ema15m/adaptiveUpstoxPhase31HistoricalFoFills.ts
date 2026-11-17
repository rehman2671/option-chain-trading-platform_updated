/**
 * Adaptive Swing v2 Phase31 — OFFLINE, operator-supplied historical F&O
 * trade pagination and settlement-gap RESEARCH audit.
 *
 * Upstox /v2/charges/historical-trades provides a date-range FO trade
 * history; ordinary /v2/order/history does NOT provide equivalent
 * historical order/stop lifecycle. A trade fill can explain a position
 * delta but NEVER proves stop ACK, trigger reliability or overnight cover.
 *
 * Zero HTTP, credential, filesystem, trading-engine, order or scheduler calls.
 */
import {createHash} from 'node:crypto';
import type {
  ReadOnlyExpectedPosition
} from './adaptiveReadOnlyNrmlProtectionAudit.js';

export type HistoricalFoExchange='NFO'|'BFO';
export type HistoricalOptionType='CE'|'PE';
export interface PinnedFoTradeIdentity {
  /** Independent operator reference, NOT broker authenticated here. */
  exchange:HistoricalFoExchange;
  symbol:string;
  optionType:HistoricalOptionType;
  strikePrice:number;
  expiry:string;
}
export interface HistoricalFoCapturePage {
  method:'GET';
  path:'/v2/charges/historical-trades';
  /** Exact operator-declared GET query, with no other filters. */
  query:{
    segment:'FO';start_date:string;end_date:string;
    page_number:number;page_size:number
  };
  httpStatus:200;
  capturedAt:string;
  response:unknown;
}
export interface OfflineHistoricalFoAuditInput {
  schemaVersion:'ADAPTIVE_UPSTOX_HISTORICAL_FO_V1';
  origin:'OPERATOR_SUPPLIED_UNVERIFIED';
  expected:ReadOnlyExpectedPosition;
  pinnedContract:PinnedFoTradeIdentity;
  startDate:string;
  endDate:string;
  asOf:string;
  maxCaptureAgeMinutes:number;
  /** Both quantities independently operator-declared, NOT broker attestations. */
  openingNetLongQuantity:number;
  closingNetLongQuantity:number;
  pages:HistoricalFoCapturePage[];
}
export type HistoricalFoAuditStatus=
  'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
  'HISTORICAL_FILLS_RECONCILED_UNVERIFIED';
export interface OfflineHistoricalFoAuditReport {
  mode:'OFFLINE_FO_HISTORICAL_FILL_RECONCILIATION';
  status:HistoricalFoAuditStatus;
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  protectedOvernight:false;
  nativeOrderInstruction:null;
  reasons:string[];
  operatorActions:string[];
  rangeSpansMultipleIndiaDates:boolean;
  sourceIdentityAuthenticated:false;
  nativeOrderHistoryVerified:false;
  historicallyExecutedFillsVerified:false;
  selectedContractDescriptorsMatched:boolean;
  openingNetQuantity:number|null;
  closingNetQuantity:number|null;
  computedClosingNetQuantity:number|null;
  totalFoRows:number;
  selectedOptionFillRows:number;
  selectedOptionMatchedWithoutInstrumentToken:number;
  pagesReviewed:number;
  paginationComplete:boolean;
  snapshotJsonChainSha256:string|null;
  warnings:string[];
}
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const id=(v:unknown):v is string=>
  typeof v==='string'&&v.trim().length>0&&v.length<=256;
const record=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const qty=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const date=(v:unknown):v is string=>{
  if(typeof v!=='string'||!datePattern.test(v))return false;
  const ms=Date.parse(v+'T00:00:00.000Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===v;
};
const clock=(v:unknown):number=>{
  if(typeof v!=='string'||
    !/^\d{4}-\d\d-\d\dT/.test(v)||
    !/(Z|[+-]\d\d:\d\d)$/.test(v))return NaN;
  return Date.parse(v);
};
const warnings=[
  'UPSTOX_POST_TRADE_FO_ROWS_ARE_NOT_NATIVE_STOP_ORDER_ACKNOWLEDGEMENTS',
  'UPSTOX_CURRENT_DAY_ORDER_HISTORY_AND_COMPLETED_GTT_HISTORY_REMAIN_INCOMPLETE',
  'FO_HISTORICAL_EXAMPLE_MAY_HAVE_EMPTY_INSTRUMENT_TOKEN_AND_NO_ORDER_ID',
  'OPERATOR_EXPORTED_PAGES_ACCOUNT_SCOPE_AND_TIME_NOT_BROKER_SIGNED',
  'HISTORICAL_FILL_MATCH_CAN_EXPLAIN_QUANTITY_NOT_STOP_SURVIVAL',
  'NO_INDEPENDENT_MARKET_CALENDAR_OR_EXPIRY_TIME_CERTIFICATION',
  'NO_NRML_ORDER_PLACEMENT_CANCEL_REPLACE_OR_15_15_AUTO_EXIT'
];
const base=():OfflineHistoricalFoAuditReport=>({
  mode:'OFFLINE_FO_HISTORICAL_FILL_RECONCILIATION',
  status:'INVALID_EVIDENCE',executionAuthorized:false,
  productionSafe:false,brokerAuthenticated:false,
  brokerStopInstalled:false,protectedOvernight:false,
  nativeOrderInstruction:null,reasons:[],operatorActions:[],
  rangeSpansMultipleIndiaDates:false,sourceIdentityAuthenticated:false,
  nativeOrderHistoryVerified:false,historicallyExecutedFillsVerified:false,
  selectedContractDescriptorsMatched:false,openingNetQuantity:null,
  closingNetQuantity:null,computedClosingNetQuantity:null,
  totalFoRows:0,selectedOptionFillRows:0,
  selectedOptionMatchedWithoutInstrumentToken:0,
  pagesReviewed:0,paginationComplete:false,
  snapshotJsonChainSha256:null,warnings
});
const digest=(value:string)=>createHash('sha256').update(value)
  .digest('hex');
const reasonActions=(reasons:string[]):string[]=>{
  const required=new Set<string>();
  if(reasons.length){
    required.add('FREEZE_NEW_NRML_ENTRIES_PENDING_INDEPENDENT_REVIEW');
    required.add('ESCALATE_TO_HUMAN_RISK_OPERATOR_NO_AUTO_ORDERS');
  }
  if(reasons.some(x=>x.includes('OVERNIGHT')||x.includes('HISTORICAL')||
    x.includes('ORDER_HISTORY')))
    required.add('REQUEST_BROKER_NATIVE_ORDER_AND_COMPLETED_GTT_HISTORY');
  if(reasons.some(x=>x.includes('EXPIRY')))
    required.add('REVIEW_EFFECTIVE_DATED_EXPIRY_CALENDAR_AND_MANUAL_EXIT_PLAN');
  if(reasons.some(x=>x.includes('PAGINATION')||x.includes('UNMAPPABLE')))
    required.add('RECOLLECT_ALL_FO_PAGES_WITH_AUTHORITATIVE_SOURCE_PROVENANCE');
  return [...required];
};
const reject=(reason:string,prior?:Partial<OfflineHistoricalFoAuditReport>)
  :OfflineHistoricalFoAuditReport=>{
  const reasons=[reason];
  return {...base(),...prior,status:'INVALID_EVIDENCE',
    reasons,operatorActions:reasonActions(reasons)};
};
function parseStrike(x:unknown):number|null{
  const n=typeof x==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(x)?
    Number(x):x;
  return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
}
const strictStatus=(x:unknown):x is 'success'=>x==='success';
/**
 * Only checks **internally consistent local operator snapshots**.
 * Rows for other contracts must be included, never pre-filtered out.
 */
export function auditOfflineHistoricalFoFills(
  input:OfflineHistoricalFoAuditInput
):OfflineHistoricalFoAuditReport{
  if(!input||input.schemaVersion!=='ADAPTIVE_UPSTOX_HISTORICAL_FO_V1'||
    input.origin!=='OPERATOR_SUPPLIED_UNVERIFIED'||!input.expected||
    input.expected.productType!=='NRML'||
    !/^(NSE_FO|BSE_FO)\|/.test(input.expected.instrumentKey)||
    !id(input.expected.accountScopeId)||
    !qty(input.expected.lotSize)||input.expected.lotSize===0||
    !qty(input.openingNetLongQuantity)||!qty(input.closingNetLongQuantity)||
    !date(input.startDate)||!date(input.endDate)||
    input.endDate<input.startDate||
    !Number.isFinite(clock(input.asOf))||
    !Number.isInteger(input.maxCaptureAgeMinutes)||
    input.maxCaptureAgeMinutes<1||input.maxCaptureAgeMinutes>30||
    !input.pinnedContract||
    !id(input.pinnedContract.symbol)||
    !date(input.pinnedContract.expiry)||
    !['CE','PE'].includes(input.pinnedContract.optionType)||
    !['NFO','BFO'].includes(input.pinnedContract.exchange)||
    !Number.isFinite(input.pinnedContract.strikePrice)||
    input.pinnedContract.strikePrice<=0||
    input.pinnedContract.expiry!==input.expected.expiry||
    (input.pinnedContract.exchange==='NFO'?
      !input.expected.instrumentKey.startsWith('NSE_FO|'):
      !input.expected.instrumentKey.startsWith('BSE_FO|'))||
    !Array.isArray(input.pages)||input.pages.length<1||
    input.pages.length>64)
    return reject('INVALID_FO_CONTRACT_RANGE_OR_BOUNDED_PAGINATION_ENVELOPE');
  const out=base();
  const reasons:string[]=[];
  const flag=(reason:string)=>{if(!reasons.includes(reason))reasons.push(reason);};
  const asOf=clock(input.asOf);
  const day= new Date(asOf+330*60_000).toISOString().slice(0,10);
  if(input.endDate>day)
    flag('HISTORICAL_FO_RANGE_ENDS_IN_FUTURE_IST');
  const multiDay=input.startDate<input.endDate;
  if(multiDay)
    flag('HISTORICAL_FILLS_CANNOT_PROVE_OVERNIGHT_NATIVE_STOP_CONTINUITY');
  const seen=new Set<string>();
  let totalRows=0,selected=0,blankInstrument=0,
    net=input.openingNetLongQuantity;
  let chain='ADAPTIVE_V2_PHASE31_UNAUTHENTICATED_FO_PAGE_CHAIN';
  let totalRecords:number|null=null,totalPages:number|null=null,
    pageSize:number|null=null;
  for(const [index,page] of input.pages.entries()){
    if(!page||page.method!=='GET'||
      page.path!=='/v2/charges/historical-trades'||
      page.httpStatus!==200||!page.query||
      page.query.segment!=='FO'||
      page.query.start_date!==input.startDate||
      page.query.end_date!==input.endDate||
      page.query.page_number!==index+1||
      !Number.isInteger(page.query.page_size)||
      page.query.page_size<1||page.query.page_size>1000||
      !Number.isFinite(clock(page.capturedAt))||
      clock(page.capturedAt)>asOf||
      asOf-clock(page.capturedAt)>
        input.maxCaptureAgeMinutes*60_000)
      return reject('MISSING_STALE_FILTERED_OR_NONSEQUENTIAL_FO_PAGE',{
        pagesReviewed:index,totalFoRows:totalRows});
    const body=page.response;
    if(!record(body)||!strictStatus(body.status)||
      !Array.isArray(body.data)||!body.data.every(record)||
      !record(body.meta_data)||!record(body.meta_data.page))
      return reject('MALFORMED_FO_HISTORY_RESPONSE_OR_PAGE_METADATA',{
        pagesReviewed:index,totalFoRows:totalRows});
    const m=body.meta_data.page as Record<string,unknown>;
    if(!qty(m.page_number)||!qty(m.page_size)||
      !qty(m.total_records)||!qty(m.total_pages)||
      m.page_number!==index+1||
      m.page_size!==page.query.page_size||
      m.total_pages!==Math.max(1,Math.ceil(m.total_records/m.page_size))||
      m.total_pages>64||
      (totalRecords!==null&&(m.total_records!==totalRecords||
        m.total_pages!==totalPages||m.page_size!==pageSize)))
      return reject('INCONSISTENT_FO_HISTORY_PAGINATION_TOTALS',{
        pagesReviewed:index,totalFoRows:totalRows});
    totalRecords=m.total_records;totalPages=m.total_pages;
    pageSize=m.page_size;
    const expectedCount=Math.max(0,Math.min(
      pageSize,totalRecords-index*pageSize));
    if(body.data.length!==expectedCount)
      return reject('INCOMPLETE_FO_HISTORY_PAGE_ROW_COUNT',{
        pagesReviewed:index,totalFoRows:totalRows});
    for(const row of body.data as Record<string,unknown>[]){
      totalRows++;
      if(row.segment!=='FO'||!id(row.trade_id)||
        !date(row.trade_date)||row.trade_date<input.startDate||
        row.trade_date>input.endDate||
        !['BUY','SELL'].includes(String(row.transaction_type))||
        !qty(row.quantity)||row.quantity===0||
        typeof row.price!=='number'||!Number.isFinite(row.price)||
        row.price<0||
        !['CE','PE'].includes(String(row.option_type))||
        !date(row.expiry)||!id(row.symbol)||
        !['NFO','BFO'].includes(String(row.exchange))||
        parseStrike(row.strike_price)===null||
        !(typeof row.instrument_token==='string')||
        row.instrument_token.length>256)
        return reject('UNMAPPABLE_OR_INVALID_HISTORICAL_FO_TRADE_ROW',{
          pagesReviewed:index,totalFoRows:totalRows});
      const uniqueKey=row.exchange+'|'+row.trade_id;
      if(seen.has(uniqueKey))
        return reject('DUPLICATED_FO_TRADE_ID_ACROSS_PAGES',{
          pagesReviewed:index,totalFoRows:totalRows});
      seen.add(uniqueKey);
      if(row.exchange!==input.pinnedContract.exchange||
        row.symbol!==input.pinnedContract.symbol||
        row.option_type!==input.pinnedContract.optionType||
        parseStrike(row.strike_price)!==
          input.pinnedContract.strikePrice||
        row.expiry!==input.pinnedContract.expiry)
        continue;
      if(row.instrument_token&&
        row.instrument_token!==input.expected.instrumentKey){
        flag('DESCRIPTOR_MATCH_WITH_CONFLICTING_OPTION_INSTRUMENT_KEY');
        continue;
      }
      if((row.quantity as number)%input.expected.lotSize!==0)
        flag('FO_TRADE_NOT_MULTIPLE_OF_INDEPENDENTLY_PINNED_LOT');
      if(!row.instrument_token)blankInstrument++;
      selected++;
      net+=(row.transaction_type==='BUY'?1:-1)*(row.quantity as number);
    }
    // Untrusted local hash chain: no signing and no actual broker GET made.
    chain=digest(chain+'\n'+JSON.stringify({
      query:page.query,at:page.capturedAt,response:page.response
    }));
  }
  if(totalRecords!==totalRows||
    totalPages!==input.pages.length)
    return reject('INCOMPLETE_FO_HISTORY_PAGINATION_COVERAGE',{
      pagesReviewed:input.pages.length,totalFoRows:totalRows});
  if(net!==input.closingNetLongQuantity)
    flag('HISTORICAL_FO_FILLS_DO_NOT_EXPLAIN_POSITION_DELTA');
  if(net<0)
    flag('HISTORICAL_RECONCILIATION_IMPLIES_UNEXPECTED_SHORT');
  // An FO historical trade (no order id in the provider example) cannot
  // prove a stop was acknowledged/cancelled/replaced by the exchange.
  // A multi-session date range ALWAYS raises human risk escalation.
  const status=reasons.length?'BLOCKED_OR_UNKNOWN':
    'HISTORICAL_FILLS_RECONCILED_UNVERIFIED';
  return {...out,status,reasons,operatorActions:reasonActions(reasons),
    rangeSpansMultipleIndiaDates:multiDay,
    selectedContractDescriptorsMatched:true,
    openingNetQuantity:input.openingNetLongQuantity,
    closingNetQuantity:input.closingNetLongQuantity,
    computedClosingNetQuantity:net,
    totalFoRows:totalRows,selectedOptionFillRows:selected,
    selectedOptionMatchedWithoutInstrumentToken:blankInstrument,
    pagesReviewed:input.pages.length,paginationComplete:true,
    snapshotJsonChainSha256:chain};
}
