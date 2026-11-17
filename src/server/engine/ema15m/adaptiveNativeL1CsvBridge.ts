/**
 * Phase 22: strict vendor-neutral OFFLINE native-L1 CSV bridge.
 *
 * Converts ORIGINAL separately retained CSV best bid/ask observations to the
 * existing VendorExecutionL1 shape WITHOUT synthesizing a receipt clock,
 * contract, market session, missing quote or favorable exit. Input metadata
 * and SHA pins are operator-supplied integrity assertions, NOT source proof.
 *
 * No broker/network access, no changes to positional NRML or MIS/15:15.
 */
import {createHash} from 'node:crypto';
import type {
  VerifiedHistoricalBundleV1,VendorExecutionL1
} from './adaptiveVendorIngestion.js';
import type {
  IndependentlySuppliedCalendarEvidence
} from './adaptiveCrossSourceCalendarAudit.js';

const MAX_CSV_BYTES=50*1024*1024,MAX_JSON_BYTES=1024*1024;
const MAX_ROWS=2_000_000,IST=330*60000;
const SHA=/^[a-f0-9]{64}$/;
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const istDay=(t:number)=>new Date(t+IST).toISOString().slice(0,10);
const time=(t:unknown):t is string=>
  typeof t==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(t)&&
  Number.isFinite(Date.parse(t));
const safe=(x:unknown):x is string=>typeof x==='string'&&
  /^[a-zA-Z0-9][a-zA-Z0-9._:/|+-]{2,127}$/.test(x);
const number=(x:string)=>/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(x)?
  Number(x):NaN;
const rowsColumns=[
  'sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'
] as const;
type Column=typeof rowsColumns[number];
export interface NativeL1CsvColumnMap {
  schemaVersion:'ADAPTIVE_NATIVE_L1_CSV_BRIDGE_V1';
  datasetId:string;
  instrument:'NIFTY'|'BANKNIFTY'|'SENSEX';
  exchange:'NSE'|'BSE';
  originalVendorCsvSha256:string;
  /** This is a user assertion, not independently authenticated proof. */
  sourceProductCategory:'CONTEMPORANEOUS_NATIVE_LEVEL1_CAPTURE'|
    'LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE'|'HISTORICAL_TRADE_ONLY'|
    'HISTORICAL_ORDER_TRADE_EVENTS'|'END_OF_DAY_BHAVCOPY';
  originalStrategyClockMode:'CAPTURED_AT_ORIGINAL_CLIENT_RECEIPT'|
    'HISTORICAL_REPLAY_ESTIMATE'|'LATER_FILE_IMPORT';
  priceUnit:'INR_PER_OPTION_UNIT';
  bidAskQuantityUnit:'UNDERLYING_UNITS_NOT_LOTS';
  originalSequenceScope:'PER_INSTRUMENT_PER_TRADING_SESSION';
  columns:Record<Column,string>;
}
export interface NativeL1CsvBridgeReport {
  mode:'OFFLINE_LICENSED_SOURCE_BRIDGE_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  profitabilityProven:false;
  vendorAndExchangeAuthenticityProven:false;
  historicReceiptClockAuthenticated:false;
  historicalEntitlementIndependentlyVerified:false;
  realBrokerExecutionFillsAuthenticated:false;
  nativeBrokerStopsInstalled:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|
    'CANDIDATE_L1_ROWS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED';
  datasetId:string|null;
  instrument:string|null;
  originalVendorCsvSha256:string|null;
  operatorPinnedMappingSha256:string|null;
  originalBundleSha256:string|null;
  scannedRows:number;
  convertedRows:number;
  existingBundleRows:number;
  matchedExistingBundleRows:number;
  distinctContracts:number;
  tradingDaysRequired:number;
  tradingDaysWithL1:number;
  tradingDaysMissingL1:number;
  invalidQuoteRows:number;
  invalidOrReplayedClocks:number;
  duplicateEventOrSequenceRows:number;
  unknownContractRows:number;
  errors:string[];
  blockers:string[];
  warnings:string[];
}
export interface NativeL1CsvBridgeResult{
  report:NativeL1CsvBridgeReport;
  /** ONLY in memory; never returned by the CLI or logged to public CI. */
  derivedBundle:VerifiedHistoricalBundleV1|null;
}
const WARN=[
  'ORIGINAL_CSV_SHA_AND_OUT_OF_BAND_MAPPING_PIN_DO_NOT_AUTHENTICATE_NSE_BSE_VENDOR_OR_LICENSE',
  'A_TYPED_ORIGINAL_CLIENT_RECEIPT_COLUMN_CANNOT_PROVE_A_REAL_HISTORICAL_CLIENT_LOG',
  'ORDER_TRADE_EVENTS_AND_BHAVCOPY_ARE_NOT_NATIVE_OPTION_BEST_BID_ASK',
  'OPTION_BID_TOP_OF_BOOK_DISPLAYED_QUANTITY_IS_NOT_GUARANTEED_BROKER_SELL_FILL',
  'SUPPLIED_CALENDAR_MAY_OMIT_UNFAVORABLE_DAYS_WITHOUT_INDEPENDENT_EXCHANGE_ISSUER_CHECK',
  'MISSING_OR_ZERO_OPTION_L1_DATES_NEVER_GET_FAKE_QUOTES_OR_ZERO_PNL',
  'DERIVED_BUNDLE_REQUIRES_ALL_EXISTING_PHASE5_TO21_AUDITS_AND_REAL_EXTERNAL_AUTHENTICATION',
  'NO_NRML_AUTOMATION_NO_MIS_15_15_CHANGE'
];
function base():NativeL1CsvBridgeReport{
  return{
    mode:'OFFLINE_LICENSED_SOURCE_BRIDGE_ONLY',
    executionAuthorized:false,productionSafe:false,
    profitabilityProven:false,vendorAndExchangeAuthenticityProven:false,
    historicReceiptClockAuthenticated:false,
    historicalEntitlementIndependentlyVerified:false,
    realBrokerExecutionFillsAuthenticated:false,
    nativeBrokerStopsInstalled:false,status:'REJECTED',
    datasetId:null,instrument:null,
    originalVendorCsvSha256:null,operatorPinnedMappingSha256:null,
    originalBundleSha256:null,
    scannedRows:0,convertedRows:0,existingBundleRows:0,
    matchedExistingBundleRows:0,distinctContracts:0,
    tradingDaysRequired:0,tradingDaysWithL1:0,tradingDaysMissingL1:0,
    invalidQuoteRows:0,invalidOrReplayedClocks:0,
    duplicateEventOrSequenceRows:0,unknownContractRows:0,
    errors:[],blockers:[],warnings:WARN
  };
}
function json<T>(raw:Uint8Array|null|undefined):T|null{
  if(!raw?.length||raw.length>MAX_JSON_BYTES)return null;
  try{
    const x=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    return x&&typeof x==='object'&&!Array.isArray(x)?x as T:null;
  }catch{return null;}
}
/** RFC4180-like quoted CSV, preserving embedded commas/newlines; no silent repairs. */
function parseCsv(raw:Uint8Array):string[][]|null{
  if(raw.length<2||raw.length>MAX_CSV_BYTES)return null;
  let src:string;
  try{src=new TextDecoder('utf-8',{fatal:true}).decode(raw);}
  catch{return null;}
  if(src.charCodeAt(0)===0xfeff)src=src.slice(1);
  if(src.includes('\0'))return null;
  const rows:string[][]=[];
  let fields:string[]=[],field='',quoted=false,afterQuote=false,fieldStarted=false;
  const finishField=()=>{
    fields.push(field);field='';afterQuote=false;fieldStarted=false;
  };
  const finishRow=()=>{
    if(fields.length>64||fields.length===0)throw Error('INVALID_COLUMN_COUNT');
    rows.push(fields);fields=[];
    if(rows.length>MAX_ROWS+1)throw Error('CSV_EXCEEDS_MAX_ROWS');
  };
  try{
    for(let i=0;i<src.length;i++){
      const c=src[i];
      if(quoted){
        if(c==='"'){
          if(src[i+1]==='"'){field+='"';i++;}
          else {quoted=false;afterQuote=true;}
        }else field+=c;
      }else if(c==='"'&&!fieldStarted&&!afterQuote){
        quoted=true;fieldStarted=true;
      }else if(c==='"'||(afterQuote&&c!==','&&c!=='\r'&&c!=='\n')){
        return null;
      }else if(c===','){finishField();}
      else if(c==='\r'||c==='\n'){
        if(c==='\r'){
          if(src[i+1]!=='\n')return null;
          i++;
        }
        finishField();finishRow();
      }else{
        field+=c;fieldStarted=true;
      }
      if(field.length>8192)return null;
    }
    if(quoted)return null;
    if(field.length||fieldStarted||afterQuote||fields.length){
      finishField();finishRow();
    }
    if(rows.length<2)return null;
    const count=rows[0].length;
    if(count<9||count>64||rows.some(r=>r.length!==count))return null;
    return rows;
  }catch{return null;}
}
const sameQuote=(a:VendorExecutionL1,b:VendorExecutionL1)=>
  a.sourceRecordId===b.sourceRecordId&&
  a.instrumentKey===b.instrumentKey&&a.eventAt===b.eventAt&&
  a.availableAt===b.availableAt&&a.bid===b.bid&&a.ask===b.ask&&
  a.bidQty===b.bidQty&&a.askQty===b.askQty;

export function bridgeAdaptiveNativeL1Csv(
  originalBundleBytes:Uint8Array|null|undefined,
  originalVendorCsvBytes:Uint8Array|null|undefined,
  separateCalendarManifestBytes:Uint8Array|null|undefined,
  originalColumnMapBytes:Uint8Array|null|undefined,
  independentlyPinnedColumnMapSha256:string|null|undefined
):NativeL1CsvBridgeResult{
  const r=base();
  const reject=(msg:string):NativeL1CsvBridgeResult=>{
    r.errors.push(msg);r.status='REJECTED';
    return {report:r,derivedBundle:null};
  };
  if(!originalBundleBytes?.length||originalBundleBytes.length>MAX_CSV_BYTES||
     !originalVendorCsvBytes?.length||
     !separateCalendarManifestBytes?.length||
     !originalColumnMapBytes?.length)
    return reject('MISSING_OR_OVERSIZED_ORIGINAL_SOURCE_BRIDGE_FILES');
  const b=json<VerifiedHistoricalBundleV1>(originalBundleBytes);
  const cal=json<IndependentlySuppliedCalendarEvidence>(
    separateCalendarManifestBytes);
  const map=json<NativeL1CsvColumnMap>(originalColumnMapBytes);
  if(!b||!cal||!map||b.schemaVersion!=='ADAPTIVE_VERIFIED_L1_BUNDLE_V1'||
     cal.schemaVersion!=='ADAPTIVE_CROSS_SOURCE_CALENDAR_V1'||
     map.schemaVersion!=='ADAPTIVE_NATIVE_L1_CSV_BRIDGE_V1'||
     !Array.isArray(b.sessions)||!Array.isArray(b.executionL1)||
     !Array.isArray(cal.days))
    return reject('MALFORMED_OR_INCOMPATIBLE_ORIGINAL_NATIVE_L1_INPUT_SCHEMA');
  r.datasetId=b.provenance?.datasetId??null;
  r.instrument=b.instrument??null;
  r.originalBundleSha256=sha(originalBundleBytes);
  r.originalVendorCsvSha256=sha(originalVendorCsvBytes);
  r.operatorPinnedMappingSha256=sha(originalColumnMapBytes);
  r.existingBundleRows=b.executionL1.length;
  if(!SHA.test(independentlyPinnedColumnMapSha256??'')||
     r.operatorPinnedMappingSha256!==independentlyPinnedColumnMapSha256)
    return reject('OUT_OF_BAND_ORIGINAL_CSV_COLUMN_MAPPING_SHA_PIN_MISMATCH');
  if(!SHA.test(map.originalVendorCsvSha256??'')||
     map.originalVendorCsvSha256!==r.originalVendorCsvSha256||
     map.originalVendorCsvSha256!==b.provenance?.sourceArtifactSha256)
    return reject('ORIGINAL_VENDOR_CSV_ARCHIVE_BYTES_NOT_BOUND_TO_BUNDLE');
  if(!safe(map.datasetId)||map.datasetId!==b.provenance.datasetId||
     map.instrument!==b.instrument||
     map.exchange!==cal.exchange||
     map.exchange!==(b.instrument==='SENSEX'?'BSE':'NSE')||
     cal.coverageStart>cal.coverageEnd||
     !map.columns||map.priceUnit!=='INR_PER_OPTION_UNIT'||
     map.bidAskQuantityUnit!=='UNDERLYING_UNITS_NOT_LOTS'||
     map.originalSequenceScope!=='PER_INSTRUMENT_PER_TRADING_SESSION')
    return reject('SOURCE_INSTRUMENT_CALENDAR_OR_UNIT_MAPPING_INCOMPATIBLE');
  const mapped=rowsColumns.map(k=>map.columns[k]);
  if(mapped.some(v=>typeof v!=='string'||!v.trim()||v.length>128)||
     new Set(mapped).size!==mapped.length)
    return reject('INVALID_DUPLICATE_OR_AMBIGUOUS_CSV_COLUMN_MAPPING');
  const csv=parseCsv(originalVendorCsvBytes);
  if(!csv)return reject('MALFORMED_OR_OVERSIZED_ORIGINAL_CSV');
  const header=csv[0];
  if(header.some(h=>!h||h.length>128)||
     new Set(header).size!==header.length||
     mapped.some(v=>!header.includes(v)))
    return reject('MISSING_DUPLICATE_OR_MISMATCHED_ORIGINAL_CSV_HEADERS');
  if(![
    'CONTEMPORANEOUS_NATIVE_LEVEL1_CAPTURE',
    'LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE'
  ].includes(map.sourceProductCategory))
    r.blockers.push('EOD_TRADE_PRINT_OR_RECONSTRUCTED_ORDER_EVENTS_NOT_ORIGINAL_NATIVE_L1');
  if(map.originalStrategyClockMode!=='CAPTURED_AT_ORIGINAL_CLIENT_RECEIPT')
    r.blockers.push('SOURCE_CLOCK_IS_REPLAY_OR_LATER_IMPORT_NOT_ORIGINAL_CLIENT_RECEIPT');
  if(b.provenance.synthetic)
    r.blockers.push('SYNTHETIC_SOURCE_CANNOT_PROVE_ORIGINAL_OPTION_L1');
  const known=new Map<string,string>();
  const originalSessionSourceIds=new Set<string>();
  for(const s of b.sessions){
    if(!s||!Array.isArray(s.contracts?.data))
      return reject('MISSING_ORIGINAL_POINT_IN_TIME_OPTION_CONTRACT_CATALOG');
    if(s.contracts.sourceRecordId)originalSessionSourceIds.add(s.contracts.sourceRecordId);
    for(const c of s.chains??[]){
      if(c.sourceRecordId)originalSessionSourceIds.add(c.sourceRecordId);
    }
    for(const c of s.contracts.data){
      const k=c.instrument_key,e=c.expiry;
      if(typeof k!=='string'||typeof e!=='string'||(known.has(k)&&known.get(k)!==e))
        return reject('CONTRADICTORY_OR_UNUSABLE_ORIGINAL_CONTRACT_EXPIRY');
      known.set(k,e);
    }
  }
  r.distinctContracts=known.size;
  const trading=new Set(cal.days.filter(d=>d.kind==='TRADING').
    map(d=>d.sessionDate));
  r.tradingDaysRequired=trading.size;
  if(!trading.size||trading.size!==
      cal.days.filter(d=>d.kind==='TRADING').length)
    return reject('MISSING_OR_DUPLICATE_INDEPENDENT_TRADING_DATES');
  const col=Object.fromEntries(rowsColumns.map(k=>[
    k,header.indexOf(map.columns[k])
  ])) as Record<Column,number>;
  const ids=new Set<string>(originalSessionSourceIds),seenEvents=new Set<string>(),
    seenAvailable=new Set<string>(),seq=new Map<string,number>();
  const onDays=new Set<string>(),out:VendorExecutionL1[]=[];
  for(let i=1;i<csv.length;i++){
    r.scannedRows++;
    const row=csv[i],s=(k:Column)=>row[col[k]];
    const eventAt=s('eventAt'),availableAt=s('originalAvailableAt'),
      sourceRecordId=s('sourceRecordId'),instrumentKey=s('instrumentKey'),
      bid=number(s('bid')),ask=number(s('ask')),
      bidQty=number(s('bidQty')),askQty=number(s('askQty')),
      n=Number(s('sourceSequence'));
    if(!safe(sourceRecordId)||!safe(instrumentKey)||
       !Number.isFinite(bid)||!Number.isFinite(ask)||
       bid<=0||ask<=bid||!Number.isSafeInteger(bidQty)||
       !Number.isSafeInteger(askQty)||bidQty<=0||askQty<=0||
       !Number.isSafeInteger(n)||n<=0){
      r.invalidQuoteRows++;continue;
    }
    if(!time(eventAt)||!time(availableAt)||
       Date.parse(eventAt)>Date.parse(availableAt)||
       !Number.isInteger(b.maximumOriginalFeedLatencySeconds)||
       b.maximumOriginalFeedLatencySeconds<0||
       b.maximumOriginalFeedLatencySeconds>300||
       Date.parse(availableAt)-Date.parse(eventAt)>
         b.maximumOriginalFeedLatencySeconds*1000){
      r.invalidOrReplayedClocks++;continue;
    }
    const session=istDay(Date.parse(eventAt)),
      arrivalDay=istDay(Date.parse(availableAt)),expiry=known.get(instrumentKey);
    if(!expiry||session>expiry||arrivalDay>expiry){
      r.unknownContractRows++;continue;
    }
    if(!trading.has(session)||!trading.has(arrivalDay)){
      r.unknownContractRows++;continue;
    }
    const k=instrumentKey+'|'+session,
      eventKey=instrumentKey+'|'+eventAt,
      arrivalKey=instrumentKey+'|'+availableAt;
    if(ids.has(sourceRecordId)||seenEvents.has(eventKey)||
       seenAvailable.has(arrivalKey)||
       n<=(seq.get(k)??0)){
      r.duplicateEventOrSequenceRows++;continue;
    }
    seq.set(k,n);seenEvents.add(eventKey);seenAvailable.add(arrivalKey);
    ids.add(sourceRecordId);onDays.add(session);
    out.push({sourceRecordId,instrumentKey,eventAt,availableAt,
      bid,ask,bidQty,askQty});
  }
  r.convertedRows=out.length;
  r.tradingDaysWithL1=onDays.size;
  r.tradingDaysMissingL1=[...trading].filter(d=>!onDays.has(d)).length;
  if(!r.scannedRows||!r.convertedRows)
    r.blockers.push('NO_CONVERTIBLE_ORIGINAL_OPTION_L1_ROWS');
  if(r.invalidQuoteRows||r.invalidOrReplayedClocks||
     r.duplicateEventOrSequenceRows||r.unknownContractRows)
    r.blockers.push('INVALID_OR_MISSING_NATIVE_L1_ROWS_NOT_SILENTLY_DROPPED');
  if(r.tradingDaysMissingL1)
    r.blockers.push('EXCHANGE_TRADING_DAYS_WITHOUT_ORIGINAL_OPTION_L1');
  // Existing original bundle rows may be empty (import) OR must match the
  // ENTIRE source CSV exactly (verification). Never overwrite conflicting
  // original L1 with a more convenient BID or omit unfavorable exit rows.
  if(b.executionL1.length){
    const prior=new Map(b.executionL1.map(q=>[q.sourceRecordId,q]));
    if(prior.size!==b.executionL1.length||
       prior.size!==out.length||
       out.some(q=>!prior.has(q.sourceRecordId)||
         !sameQuote(q,prior.get(q.sourceRecordId)!)))
      return reject('CSV_AND_EXISTING_ORIGINAL_BUNDLE_L1_ROWS_DISAGREE');
    r.matchedExistingBundleRows=out.length;
  }
  if(r.blockers.length){
    r.status='INCOMPLETE_EVIDENCE';
    return {report:r,derivedBundle:null};
  }
  // No write or assertion of market authenticity. The candidate retains the
  // original provenance, original contract masters and source SHA. Downstream
  // Phase5–21 gates independently validate and can reject it.
  const derivedBundle:VerifiedHistoricalBundleV1={
    ...b,executionL1:out
  };
  r.status='CANDIDATE_L1_ROWS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED';
  return {report:r,derivedBundle};
}
