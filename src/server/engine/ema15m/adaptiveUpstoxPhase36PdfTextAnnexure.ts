/**
 * Phase36 — real, bounded Poppler pdftotext ECN annexure TEXT-LAYER
 * preflight, never OCR or an authenticated brokerage ledger.
 *
 * Private original PDF, pinned pdftotext executable, no network/shell.
 * A matched line does not independently prove ECN signed PDF content,
 * document completeness, real broker provenance, or order ACK/survival.
 */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {TextDecoder} from 'node:util';
import type {Phase33NoteTradeRow} from './adaptiveUpstoxPhase33ContractNoteReview.js';
import type {Phase35PdfsigReport} from './adaptiveUpstoxPhase35LocalPdfsig.js';

const SHA=/^[a-f0-9]{64}$/;
const MAX_PDF=2_000_000,MAX_BINARY=12_000_000,MAX_TEXT=200_000;
const BINARIES=['/usr/bin/pdftotext','/usr/local/bin/pdftotext'];
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const rowId=(s:unknown):s is string=>
  typeof s==='string'&&/^[A-Za-z0-9_.:/-]{1,100}$/.test(s);
const date=(s:unknown):s is string=>
  typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&
  Number.isFinite(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const digits=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
function fileAllowed(path:string,max:number,privateFile:boolean){
  if(typeof path!=='string'||!isAbsolute(path)||path.length>1300||
    path.includes('\0'))return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    if(!s.isFile()||s.isSymbolicLink()||realpathSync(p)!==p||
      s.size<12||s.size>max||(s.mode&0o022)!==0)return false;
    if(privateFile&&((s.mode&0o077)!==0||
      (typeof process.getuid==='function'&&s.uid!==process.getuid())))
      return false;
    if(!privateFile&&s.uid!==0&&
      typeof process.getuid==='function'&&s.uid!==process.getuid())
      return false;
    return true;
  }catch{return false;}
}
function parentAllowed(path:string){
  if(typeof path!=='string'||!isAbsolute(path))return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    return s.isDirectory()&&!s.isSymbolicLink()&&
      realpathSync(p)===p&&(s.mode&0o077)===0&&
      (typeof process.getuid!=='function'||s.uid===process.getuid());
  }catch{return false;}
}
export interface Phase36ExtractRequest {
  schemaVersion:'ADAPTIVE_V2_PHASE36_PRIVATE_ECN_TEXT_V1';
  originalPdfPath:string;
  expectedOriginalPdfSha256:string;
  pdftotextBinary:'/usr/bin/pdftotext'|'/usr/local/bin/pdftotext';
  expectedPdftotextBinarySha256:string;
  timeoutMs:number;
  annexureStartMarker:string;
  annexureEndMarker:string;
  selectedRows:Phase33NoteTradeRow[];
  /** Independently asserted: not proof of all trade rows in the PDF. */
  independentlyExpectedSelectedRowCount:number;
  operatorAuthorization:'APPROVED_NO_EGRESS_ECN_TEXT_EXTRACTION';
}
export interface Phase36TextProcessResult{
  exitCode:number|null;stdout:Uint8Array;stderr:Uint8Array;timedOut:boolean;
}
export type Phase36TextRunner=(binary:string,args:readonly string[],
  timeoutMs:number)=>Phase36TextProcessResult;
export interface Phase36TextReport{
  mode:'LOCAL_PDF_TEXT_LAYER_ANNEXURE_RECONCILIATION';
  status:'INVALID_PRECONDITION'|'PDF_TEXT_EXTRACTION_REJECTED'|
    'TEXT_LAYER_ROWS_MATCHED_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  realNativeExtraction:boolean;
  actualPdfTextCompared:boolean;
  extractedTradeRowsMatched:number;
  extractedSelectedTradeRowCoverageComplete:false;
  originalPdfSha256:string|null;
  textOutputSha256:string|null;
  digitalPdfSignatureVerifiedByThisModule:false;
  brokerIssuerAuthenticated:false;
  scannedPdfOcrPerformed:false;
  nativeStopHistoryVerified:false;
  reasons:string[];warnings:string[];
}
const warnings=[
  'POPPLER_TEXT_LAYER_ONLY_SCANNED_IMAGE_PDFS_FAIL_CLOSED_NO_OCR',
  'UNSTRUCTURED_PDF_TEXT_MAY_BE_INJECTED_OR_HIDDEN_AND_NOT_CANONICAL_ECN_ROWS',
  'ONE_ROW_PER_LINE_WITH_EXPLICIT_BOUNDARY_MARKERS_REQUIRED',
  'MATCHED_ROWS_DO_NOT_ESTABLISH_COMPLETENESS_OF_ORIGINAL_ECN_ANNEXURE',
  'EXTRACTED_TEXT_HAS_NO_INDEPENDENT_BROKER_SIGNER_OR_CERTIFICATE_LINK',
  'CERTIFICATE_IDENTITY_AND_FRESH_REVOCATION_NOT_CHECKED_BY_THIS_MODULE',
  'NO_EXCHANGE_NATIVE_ORDER_ACK_OR_OVERNIGHT_STOP_PROOF'
];
const initial=():Phase36TextReport=>({
  mode:'LOCAL_PDF_TEXT_LAYER_ANNEXURE_RECONCILIATION',
  status:'INVALID_PRECONDITION',executionAuthorized:false,
  productionSafe:false,brokerAuthenticated:false,
  brokerStopInstalled:false,protectedOvernight:false,
  nativeOrderInstruction:null,realNativeExtraction:false,
  actualPdfTextCompared:false,extractedTradeRowsMatched:0,
  extractedSelectedTradeRowCoverageComplete:false,
  originalPdfSha256:null,textOutputSha256:null,
  digitalPdfSignatureVerifiedByThisModule:false,
  brokerIssuerAuthenticated:false,scannedPdfOcrPerformed:false,
  nativeStopHistoryVerified:false,reasons:[],warnings
});
const fail=(code:string,
  status:Phase36TextReport['status']='PDF_TEXT_EXTRACTION_REJECTED',
  fields?:Partial<Phase36TextReport>):Phase36TextReport=>({
  ...initial(),...fields,status,reasons:[code]
});
const normalize=(x:string)=>x.normalize('NFKC').trim()
  .replace(/[\t ]+/g,' ');
const anchored=(value:string,line:string):boolean=>
  line.split(/\s+/).includes(value);
/**
 * Strict, intentionally narrow format: every selected contract trade must
 * have its fields on ONE extracted physical line, between two unique literal
 * markers. Rejects duplicate IDs, split/ambiguous rows and missing fields.
 */
export function matchPhase36ExtractedText(
  extracted:string,
  rows:Phase33NoteTradeRow[],
  startMarker:string,endMarker:string,
  expectedRows:number
):{ok:boolean;reason:string;matched:number}{
  const failed=(reason:string,matched=0)=>({ok:false,reason,matched});
  if(typeof extracted!=='string'||extracted.length<20||
    extracted.length>MAX_TEXT||extracted.includes('\uFFFD')||
    !Array.isArray(rows)||rows.length<1||rows.length>512||
    rows.length!==expectedRows||!Number.isSafeInteger(expectedRows)||
    !/^[A-Z][A-Z0-9 /_-]{5,80}$/.test(startMarker)||
    !/^[A-Z][A-Z0-9 /_-]{5,80}$/.test(endMarker)||
    startMarker===endMarker)return failed('INVALID_EXTRACTED_TEXT_OR_PINNED_ROW_SCOPE');
  const lines=extracted.split(/\r?\n/).map(normalize);
  const start=lines.reduce<number[]>((xs,line,i)=>
    line===startMarker?[...xs,i]:xs,[]);
  const end=lines.reduce<number[]>((xs,line,i)=>
    line===endMarker?[...xs,i]:xs,[]);
  if(start.length!==1||end.length!==1||end[0]<=start[0]+1)
    return failed('MISSING_DUPLICATE_OR_REVERSED_ANNEXURE_BOUNDARY');
  const annexure=lines.slice(start[0]+1,end[0]).filter(Boolean);
  if(annexure.length<rows.length||annexure.length>2048)
    return failed('MISSING_OR_EXCESSIVE_ANNEXURE_TEXT_LINES');
  const keys=new Set<string>();
  let matched=0;
  for(const row of rows){
    if(!row||!rowId(row.tradeId)||!rowId(row.orderId)||
      !date(row.tradeDate)||!date(row.expiry)||
      !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.tradeTimeIst)||
      !['NFO','BFO'].includes(row.exchange)||
      !['CE','PE'].includes(row.optionType)||
      !['BUY','SELL'].includes(row.side)||
      !rowId(row.symbol)||!digits(row.strikePrice)||
      row.strikePrice<=0||!Number.isSafeInteger(row.quantity)||
      row.quantity<=0||
      typeof row.priceRupees!=='string'||
      !/^\d{1,10}\.\d{2,4}$/.test(row.priceRupees))
      return failed('INVALID_TRANSCRIBED_ECN_ROW_PROFILE',matched);
    const key=row.exchange+'|'+row.tradeId;
    if(keys.has(key))return failed('DUPLICATE_INPUT_TRADE_ID',matched);
    keys.add(key);
    const needed=[
      row.tradeId,row.orderId,row.tradeDate,row.tradeTimeIst,
      row.exchange,row.symbol,row.optionType,
      String(row.strikePrice),row.expiry,row.side,
      String(row.quantity),row.priceRupees
    ];
    const matching=annexure.filter(line=>
      needed.every(token=>anchored(token,line)));
    if(matching.length!==1)
      return failed(matching.length===0?
        'MISSING_OR_SPLIT_TRADE_ANNEXURE_TEXT_ROW':
        'DUPLICATE_OR_AMBIGUOUS_TRADE_ANNEXURE_TEXT_ROW',matched);
    matched++;
  }
  return {ok:true,reason:'',matched};
}
export function nativePhase36TextRunner(
  binary:string,args:readonly string[],timeoutMs:number
):Phase36TextProcessResult{
  const result=spawnSync(binary,[...args],{
    shell:false,encoding:'buffer',timeout:timeoutMs,
    maxBuffer:MAX_TEXT+8192,
    windowsHide:true,
    env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',
      TZ:'UTC',HOME:'/nonexistent'}
  });
  return {exitCode:result.status,
    stdout:result.stdout instanceof Buffer?result.stdout:new Uint8Array(),
    stderr:result.stderr instanceof Buffer?result.stderr:new Uint8Array(),
    timedOut:!!result.error||!!result.signal};
}
export function auditPhase36ExtractedEcnText(
  request:Phase36ExtractRequest,
  signedPdf:Phase35PdfsigReport,
  runner:Phase36TextRunner=nativePhase36TextRunner
):Phase36TextReport{
  if(!request||request.schemaVersion!==
    'ADAPTIVE_V2_PHASE36_PRIVATE_ECN_TEXT_V1'||
    request.operatorAuthorization!==
    'APPROVED_NO_EGRESS_ECN_TEXT_EXTRACTION'||
    !BINARIES.includes(request.pdftotextBinary)||
    typeof request.expectedOriginalPdfSha256!=='string'||
    !SHA.test(request.expectedOriginalPdfSha256)||
    typeof request.expectedPdftotextBinarySha256!=='string'||
    !SHA.test(request.expectedPdftotextBinarySha256)||
    !Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<500||
    request.timeoutMs>10000||typeof runner!=='function')
    return fail('INVALID_EXTRACTION_CONSENT_OR_PINS','INVALID_PRECONDITION');
  if(!signedPdf||signedPdf.status!==
    'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED'||
    signedPdf.localToolActuallyExecuted!==true||
    signedPdf.originalPdfSha256!==request.expectedOriginalPdfSha256||
    signedPdf.executionAuthorized!==false||
    signedPdf.productionSafe!==false||
    signedPdf.brokerStopInstalled!==false||
    signedPdf.onlineOcspChecked!==false)
    return fail('PHASE35_NATIVE_SIGNATURE_PREFLIGHT_NOT_ACCEPTABLE',
      'INVALID_PRECONDITION');
  const pdf=request.originalPdfPath;
  if(!parentAllowed(dirname(pdf))||
    !fileAllowed(pdf,MAX_PDF,true)||
    !fileAllowed(request.pdftotextBinary,MAX_BINARY,false))
    return fail('PRIVATE_ORIGINAL_PDF_OR_PINNED_PDFTOTEXT_NOT_SECURE',
      'INVALID_PRECONDITION');
  let pdfBytes:Buffer,binaryBytes:Buffer;
  try{
    pdfBytes=readFileSync(pdf);
    binaryBytes=readFileSync(request.pdftotextBinary);
  }catch{return fail('PRIVATE_ECN_OR_TOOL_BYTES_UNREADABLE',
    'INVALID_PRECONDITION');}
  const pdfHash=sha(pdfBytes),binaryHash=sha(binaryBytes);
  if(pdfHash!==request.expectedOriginalPdfSha256||
    binaryHash!==request.expectedPdftotextBinarySha256||
    pdfBytes.subarray(0,5).toString('ascii')!=='%PDF-'||
    !pdfBytes.subarray(Math.max(0,pdfBytes.length-1024))
      .toString('latin1').includes('%%EOF'))
    return fail('PDF_OR_TEXT_TOOL_SHA256_MISMATCH','INVALID_PRECONDITION');
  const isNative=runner===nativePhase36TextRunner;
  let out:Phase36TextProcessResult;
  try{
    out=runner(request.pdftotextBinary,
      ['-layout','-enc','UTF-8','-nopgbrk',pdf,'-'],request.timeoutMs);
  }catch{return fail('TEXT_PROCESS_FAILED_WITHOUT_SENSITIVE_DETAILS');}
  if(!out||out.timedOut||out.exitCode!==0||
    !(out.stdout instanceof Uint8Array)||
    !(out.stderr instanceof Uint8Array)||
    out.stdout.length>MAX_TEXT||out.stderr.length>8192)
    return fail('TEXT_PROCESS_EXIT_TIMEOUT_OR_OUTPUT_BOUNDS_REJECTED',{
    } as Phase36TextReport['status']);
  let extracted:string;
  try{
    extracted=new TextDecoder('utf-8',{fatal:true}).decode(out.stdout);
  }catch{return fail('TEXT_EXTRACTION_NOT_STRICT_UTF8');}
  const matched=matchPhase36ExtractedText(extracted,request.selectedRows,
    request.annexureStartMarker,request.annexureEndMarker,
    request.independentlyExpectedSelectedRowCount);
  if(!matched.ok)return fail(matched.reason,'PDF_TEXT_EXTRACTION_REJECTED',
    {realNativeExtraction:isNative,
      originalPdfSha256:pdfHash,textOutputSha256:sha(out.stdout)});
  if(!isNative)return fail('MOCK_TEXT_NOT_ACTUAL_POPPLER_EXTRACTION',
    'PDF_TEXT_EXTRACTION_REJECTED');
  return {...initial(),status:'TEXT_LAYER_ROWS_MATCHED_UNVERIFIED',
    originalPdfSha256:pdfHash,textOutputSha256:sha(out.stdout),
    realNativeExtraction:true,actualPdfTextCompared:true,
    extractedTradeRowsMatched:matched.matched};
}
