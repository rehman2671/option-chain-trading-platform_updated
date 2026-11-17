/**
 * Adaptive Swing v2 Phase34: pure offline *common-contract* cross-exchange WAP.
 *
 * A local match is NOT a genuine broker ECN, exchange trade, order ACK,
 * cross-exchange equivalence certificate or native NRML stop protection.
 * No trading engine, network, PDF parser, private key or order operation.
 */
import {
  auditOfflineHistoricalFoFills,
  type OfflineHistoricalFoAuditInput,
  type HistoricalFoExchange
} from './adaptiveUpstoxPhase31HistoricalFoFills.js';
import type {
  OfflineContractNoteRecord,Phase33NoteTradeRow
} from './adaptiveUpstoxPhase33ContractNoteReview.js';

const DEC=/^(0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const text=(v:unknown):v is string=>
  typeof v==='string'&&v.trim().length>0&&v.length<257;
function decimal4(value:unknown):bigint|null{
  const string=typeof value==='number'&&Number.isFinite(value)?
    String(value):value;
  if(typeof string!=='string'||!DEC.test(string))return null;
  const [whole,frac='']=string.split('.');
  return BigInt(whole)*10000n+BigInt(frac.padEnd(4,'0')||'0');
}
type Exchange='NFO'|'BFO';
type Side='BUY'|'SELL';
const group=(date:string,side:Side)=>date+'|'+side;
type Group={qty:bigint;value:bigint};
export interface Phase34CrossExchangeInput {
  schemaVersion:'ADAPTIVE_V2_PHASE34_CROSS_EXCHANGE_FO_WAP_V1';
  source:'OPERATOR_PRIVATE_UNVERIFIED';
  note:OfflineContractNoteRecord;
  historicalSources:OfflineHistoricalFoAuditInput[];
  scope:{
    expectedAccountScopeId:string;
    tradeDate:string;
    symbol:string;
    strikePrice:number;
    optionType:'CE'|'PE';
    expiry:string;
    /** Separately pinned expected exchange coverage; not broker proven. */
    expectedExchanges:Exchange[];
    /** An operator claim, NOT proof of genuinely fungible instruments. */
    commonContractEquivalence:'EXTERNALLY_REVIEW_REQUIRED';
  };
}
export interface Phase34CrossExchangeReport {
  mode:'OFFLINE_COMMON_CONTRACT_CROSS_EXCHANGE_WAP';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'CROSS_EXCHANGE_WAP_MATCHED_OFFLINE_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  nativeOrderInstruction:null;protectedOvernight:false;
  noteContentExtractedFromPdfByCode:false;
  commonContractEquivalenceAuthenticated:false;
  historicalExecutionSourceAuthenticated:false;
  actualOrderIdAndTimeMatched:false;
  reasons:string[];
  historyExchangesReviewed:number;
  selectedFoFills:number;
  selectedAnnexureRowsMatched:number;
  summaryGroupsMatched:number;
  warnings:string[];
}
const warnings=[
  'NSE_COMMON_CONTRACT_WAP_MAY_AGGREGATE_EXCHANGES_AND_BUY_SELL_SEPARATELY',
  'HISTORICAL_FO_PAGES_AND_CONTRACT_EQUIVALENCE_ARE_OPERATOR_SUPPLIED',
  'NFO_AND_BFO_INSTRUMENT_IDENTITIES_REQUIRE_SEPARATE_EXTERNAL_VALIDATION',
  'BROKER_ECN_PDF_CONTENT_AND_SIGNER_NOT_VERIFIED_BY_THIS_MODULE',
  'NATIVE_ORDER_ID_AND_TIME_NOT_IN_UPSTOX_HISTORICAL_FO_RESPONSE',
  'SAME_DAY_FO_FILLS_CANNOT_PROVE_ANY_OVERNIGHT_STOP_PROTECTION',
  'NO_TRADING_ORDERS_GTT_OR_15_15_NRML_AUTO_EXIT'
];
const base=():Phase34CrossExchangeReport=>({
  mode:'OFFLINE_COMMON_CONTRACT_CROSS_EXCHANGE_WAP',
  status:'INVALID_EVIDENCE',executionAuthorized:false,
  productionSafe:false,brokerAuthenticated:false,
  brokerStopInstalled:false,nativeOrderInstruction:null,
  protectedOvernight:false,noteContentExtractedFromPdfByCode:false,
  commonContractEquivalenceAuthenticated:false,
  historicalExecutionSourceAuthenticated:false,
  actualOrderIdAndTimeMatched:false,
  reasons:[],historyExchangesReviewed:0,selectedFoFills:0,
  selectedAnnexureRowsMatched:0,summaryGroupsMatched:0,warnings
});
const fail=(reason:string,partial?:Partial<Phase34CrossExchangeReport>)
  :Phase34CrossExchangeReport=>({
  ...base(),...partial,status:'BLOCKED_OR_UNKNOWN',reasons:[reason]
});
type Fill={exchange:Exchange;date:string;side:Side;
  quantity:number;price:bigint};
const unique=(xs:string[])=>xs.length===new Set(xs).size;
const day=(x:string)=>{
  if(typeof x!=='string'||!DATE.test(x))return false;
  const t=Date.parse(x+'T00:00:00Z');
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x;
};
function add(groups:Map<string,Group>,date:string,side:Side,
  qty:number,price:bigint){
  const g=groups.get(group(date,side))??{qty:0n,value:0n};
  g.qty+=BigInt(qty);
  g.value+=BigInt(qty)*price;
  groups.set(group(date,side),g);
}
function coversScope(
  x:{exchange?:unknown;symbol?:unknown;option_type?:unknown;
    optionType?:unknown;strike_price?:unknown;strikePrice?:unknown;
    expiry?:unknown},
  s:Phase34CrossExchangeInput['scope']
){
  return x.symbol===s.symbol&&
    (x.option_type??x.optionType)===s.optionType&&
    (x.strike_price??x.strikePrice)!==undefined&&
    Number(x.strike_price??x.strikePrice)===s.strikePrice&&
    x.expiry===s.expiry;
}
/** Exact per-trade matching across all DECLARED exchanges, then WAP.
 * The output always remains operator-provided offline evidence only.
 */
export function reviewPhase34CrossExchangeWap(
  input:Phase34CrossExchangeInput
):Phase34CrossExchangeReport{
  if(!input||input.schemaVersion!==
    'ADAPTIVE_V2_PHASE34_CROSS_EXCHANGE_FO_WAP_V1'||
    input.source!=='OPERATOR_PRIVATE_UNVERIFIED'||
    !input.scope||!input.note||!Array.isArray(input.historicalSources)||
    input.historicalSources.length<1||
    input.historicalSources.length>2||
    !Array.isArray(input.scope.expectedExchanges)||
    input.scope.expectedExchanges.length!==input.historicalSources.length||
    !input.scope.expectedExchanges.every(x=>x==='NFO'||x==='BFO')||
    !unique(input.scope.expectedExchanges)||
    !text(input.scope.expectedAccountScopeId)||
    !text(input.scope.symbol)||!day(input.scope.tradeDate)||
    !day(input.scope.expiry)||
    !['CE','PE'].includes(input.scope.optionType)||
    typeof input.scope.strikePrice!=='number'||
    !Number.isFinite(input.scope.strikePrice)||
    input.scope.strikePrice<=0||
    input.scope.commonContractEquivalence!=='EXTERNALLY_REVIEW_REQUIRED'||
    !Array.isArray(input.note.selectedAnnexureRows)||
    !Array.isArray(input.note.selectedWapSummaryRows)||
    input.note.selectedAnnexureRows.length<1||
    input.note.selectedAnnexureRows.length>2048||
    input.note.selectedWapSummaryRows.length<1||
    input.note.selectedWapSummaryRows.length>4||
    input.note.declaredUcc!==input.scope.expectedAccountScopeId||
    input.note.tradeDate!==input.scope.tradeDate)
    return fail('INVALID_COMMON_CONTRACT_EXCHANGE_COVERAGE_OR_SCOPE');
  const scope=input.scope;
  const seenSources=new Set<string>();
  const fills=new Map<string,Fill>();
  const historyGroups=new Map<string,Group>();
  const counts=new Map<string,number>();
  for(const source of input.historicalSources){
    if(!source||!source.expected||!source.pinnedContract)
      return fail('MISSING_CROSS_EXCHANGE_HISTORICAL_FO_COHORT');
    const ex=source.pinnedContract.exchange as HistoricalFoExchange;
    if(!scope.expectedExchanges.includes(ex)||seenSources.has(ex)||
      source.expected.accountScopeId!==scope.expectedAccountScopeId||
      source.startDate!==scope.tradeDate||
      source.endDate!==scope.tradeDate||
      source.pinnedContract.exchange!==ex||
      !coversScope({
        symbol:source.pinnedContract.symbol,
        optionType:source.pinnedContract.optionType,
        strikePrice:source.pinnedContract.strikePrice,
        expiry:source.pinnedContract.expiry
      },scope))
      return fail('SOURCED_EXCHANGE_CONTRACT_OR_UCC_DISAGREES_WITH_SCOPE');
    seenSources.add(ex);
    const validity=auditOfflineHistoricalFoFills(source);
    if(validity.status!=='HISTORICAL_FILLS_RECONCILED_UNVERIFIED'||
      !validity.paginationComplete)
      return fail('PHASE31_EXCHANGE_SPECIFIC_FO_AUDIT_NOT_PASSED');
    for(const page of source.pages){
      const response=page.response as {data:Array<Record<string,unknown>>};
      for(const row of response.data){
        if(!coversScope(row,scope)||row.exchange!==ex)continue;
        const tradeId=row.trade_id;
        if(!text(tradeId))
          return fail('UNMAPPABLE_EXCHANGE_FO_TRADE_IDENTIFIER');
        const k=ex+'|'+tradeId;
        if(fills.has(k))return fail('DUPLICATE_EXCHANGE_TRADE_IN_FO_COHORT');
        const price=decimal4(row.price);
        const quantity=row.quantity;
        if(price===null||!Number.isSafeInteger(quantity)||
          (quantity as number)<=0||
          !['BUY','SELL'].includes(String(row.transaction_type))||
          row.trade_date!==scope.tradeDate)
          return fail('INVALID_SELECTED_FO_PRICE_QUANTITY_OR_DATE');
        const side=row.transaction_type as Side;
        fills.set(k,{exchange:ex,date:scope.tradeDate,side,
          quantity:quantity as number,price});
        counts.set(ex,(counts.get(ex)??0)+1);
        add(historyGroups,scope.tradeDate,side,quantity as number,price);
      }
    }
  }
  if(seenSources.size!==scope.expectedExchanges.length||
    scope.expectedExchanges.some(x=>(counts.get(x)??0)<1))
    return fail('MISSING_EXCHANGE_TRADE_EVIDENCE_FOR_PINNED_COVERAGE');
  const observed=new Set<string>();
  const annexureGroups=new Map<string,Group>();
  for(const row of input.note.selectedAnnexureRows){
    if(!row||!['NFO','BFO'].includes(row.exchange)||
      !scope.expectedExchanges.includes(row.exchange)||
      !coversScope(row,scope)||!text(row.tradeId)||!text(row.orderId)||
      !TIME.test(row.tradeTimeIst??'')||
      row.tradeDate!==scope.tradeDate||
      !['BUY','SELL'].includes(row.side)||
      !Number.isSafeInteger(row.quantity)||row.quantity<=0)
      return fail('UNMAPPABLE_OR_OUT_OF_SCOPE_ECN_ANNEXURE_ROW');
    const k=row.exchange+'|'+row.tradeId;
    if(observed.has(k))return fail('DUPLICATED_ECN_EXCHANGE_TRADE_ID');
    observed.add(k);
    const fill=fills.get(k);
    if(!fill)return fail('EXTRA_ECN_TRADE_NOT_IN_COMPLETE_FO_HISTORY');
    const price=decimal4(row.priceRupees);
    if(price===null||row.quantity!==fill.quantity||
      price!==fill.price||row.side!==fill.side)
      return fail('ECN_ANNEXURE_TRADE_QUANTITY_SIDE_OR_PRICE_MISMATCH');
    add(annexureGroups,scope.tradeDate,row.side,row.quantity,price);
  }
  const progress={
    historyExchangesReviewed:seenSources.size,
    selectedFoFills:fills.size,
    selectedAnnexureRowsMatched:observed.size
  };
  if(observed.size!==fills.size)
    return fail('MISSING_ECN_ANNEXURE_FILLS_FROM_ONE_OR_MORE_EXCHANGES',
      progress);
  if(annexureGroups.size!==historyGroups.size)
    return fail('ECN_CROSS_EXCHANGE_SIDE_GROUP_COVERAGE_MISMATCH',progress);
  for(const [name,h] of historyGroups){
    const n=annexureGroups.get(name);
    if(!n||n.qty!==h.qty||n.value!==h.value)
      return fail('ECN_CROSS_EXCHANGE_ANNEXURE_VALUE_MISMATCH',progress);
  }
  const seenSummaries=new Set<string>();
  for(const summary of input.note.selectedWapSummaryRows){
    if(!summary||summary.tradeDate!==scope.tradeDate||
      !['BUY','SELL'].includes(summary.side)||
      ![2,4].includes(summary.displayDecimals)||
      !Number.isSafeInteger(summary.totalQuantity)||
      summary.totalQuantity<=0)
      return fail('INVALID_CONSOLIDATED_ECN_WAP_ROW',progress);
    const name=group(summary.tradeDate,summary.side);
    if(seenSummaries.has(name))
      return fail('DUPLICATE_CONSOLIDATED_ECN_WAP_SIDE',progress);
    seenSummaries.add(name);
    const h=historyGroups.get(name),printed=summary.weightedAveragePriceRupees;
    const value=decimal4(printed);
    if(!h||value===null||typeof printed!=='string'||
      (printed.split('.')[1]?.length??0)!==summary.displayDecimals||
      h.qty!==BigInt(summary.totalQuantity))
      return fail('ECN_CONSOLIDATED_WAP_GROUP_SCOPE_OR_PRECISION_MISMATCH',
        progress);
    const delta=value*h.qty-h.value;
    const magnitude=delta<0n?-delta:delta;
    const unit=summary.displayDecimals===2?100n:1n;
    if(magnitude*2n>unit*h.qty)
      return fail('ECN_CONSOLIDATED_WAP_DIFFERS_FROM_FO_TRADE_VWAP',
        progress);
  }
  if(seenSummaries.size!==historyGroups.size)
    return fail('MISSING_CONSOLIDATED_ECN_WAP_SIDE',progress);
  return {...base(),...progress,summaryGroupsMatched:seenSummaries.size,
    status:'CROSS_EXCHANGE_WAP_MATCHED_OFFLINE_UNVERIFIED'};
}
