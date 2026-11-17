/**
 * Adaptive Swing v2 Phase33 — OFFLINE contract-note annexure + WAP audit.
 *
 * Privately obtained PDF bytes and manually transcribed annexure/summary
 * rows are OPERATOR SUPPLIED, NOT PARSED, SIGNATURE-VALIDATED BROKER NOTES.
 * Independent REVIEWER Ed25519 signing proves only key-possession approval
 * of the byte hash + transcription, NOT the broker's ECN/DSC signature.
 *
 * No network, secrets, account route, scheduler or live order instructions.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {
  auditOfflineHistoricalFoFills,
  type OfflineHistoricalFoAuditInput
} from './adaptiveUpstoxPhase31HistoricalFoFills.js';

const DOMAIN='ADAPTIVE_V2_PHASE33_OFFLINE_CONTRACT_NOTE_REVIEW_V1';
const HASH=/^[a-f0-9]{64}$/;
const DAY=/^\d{4}-\d\d-\d\d$/;
const CLOCK=/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const PRICE=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$/;
const DOC_MAX=2_000_000;
const warn=[
  'ORIGINAL_PDF_IS_OPERATOR_SUPPLIED_AND_PDF_DIGITAL_SIGNATURE_IS_NOT_VALIDATED',
  'REVIEWER_ED25519_SIGNATURE_IS_NOT_BROKER_ECN_CERTIFICATE_OR_EXCHANGE_ATTESTATION',
  'MANUALLY_TRANSCRIBED_ANNEXURE_WAP_ROWS_ARE_NOT_VERIFIED_PDF_CONTENT',
  'OFFICIAL_NSE_CONTRACT_NOTE_WAP_MAY_AGGREGATE_EXCHANGES_REQUIRING_EXTERNAL_REVIEW',
  'ORDER_ID_AND_TRADE_TIME_FROM_ANNEXURE_CANNOT_BE_VERIFIED_BY_FO_HISTORY_API',
  'MATCHED_FO_EXECUTIONS_DO_NOT_PROVE_NATIVE_STOP_CANCEL_REPLACE_OR_OVERNIGHT_PROTECTION',
  'NO_BROKER_ORDERS_GTT_OPERATIONS_OR_NRML_15_15_AUTO_EXIT'
];
const sha=(data:string|Uint8Array)=>createHash('sha256').update(data)
  .digest('hex');
const id=(x:unknown):x is string=>typeof x==='string'&&
  x.trim().length>0&&x.length<=256;
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const day=(x:unknown):x is string=>{
  if(typeof x!=='string'||!DAY.test(x))return false;
  const t=Date.parse(x+'T00:00:00Z');
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x;
};
const instant=(x:unknown):number=>
  typeof x==='string'&&CLOCK.test(x)?Date.parse(x):NaN;
function strictBase64(x:unknown,limit:number):Buffer|null{
  if(typeof x!=='string'||x.length<4||x.length>limit||
    x.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x))
    return null;
  const b=Buffer.from(x,'base64');
  return b.toString('base64')===x?b:null;
}
function four(value:unknown):bigint|null{
  const text=typeof value==='number'&&Number.isFinite(value)?
    String(value):value;
  if(typeof text!=='string'||!PRICE.test(text))return null;
  const [major,dec='']=text.split('.');
  return BigInt(major)*10000n+BigInt(dec.padEnd(4,'0')||'0');
}
const key=(r:{
  tradeDate:string;side:'BUY'|'SELL'
})=>r.tradeDate+'|'+r.side;
export interface Phase33NoteTradeRow {
  tradeId:string;
  orderId:string;
  tradeDate:string;
  /** Trade time transcribed from ECN annexure, not matched to history. */
  tradeTimeIst:string;
  exchange:'NFO'|'BFO';
  symbol:string;
  optionType:'CE'|'PE';
  strikePrice:number;
  expiry:string;
  side:'BUY'|'SELL';
  quantity:number;
  priceRupees:string;
}
export interface Phase33NoteSummaryRow {
  tradeDate:string;
  side:'BUY'|'SELL';
  totalQuantity:number;
  weightedAveragePriceRupees:string;
  /** NSE permits 2 or 4 display decimals, as chosen by member/client. */
  displayDecimals:2|4;
}
export interface OfflineContractNoteRecord {
  schemaVersion:'ADAPTIVE_PHASE33_OPERATOR_TRANSCRIBED_NOTE_V1';
  source:'PRIVATE_ORIGINAL_PDF_UNVERIFIED';
  mediaType:'application/pdf';
  originalPdfBase64:string;
  declaredUcc:string;
  /** Synthetic/local reference only; never emitted in the report. */
  documentReference:string;
  tradeDate:string;
  /** Annexure rows selected for the EXACT pinned FO contract. */
  selectedAnnexureRows:Phase33NoteTradeRow[];
  selectedWapSummaryRows:Phase33NoteSummaryRow[];
}
export interface Phase33DetachedReviewerSignature {
  signedAt:string;
  signatureBase64:string;
}
export interface Phase33OfflineNoteBundle {
  schemaVersion:'ADAPTIVE_PHASE33_CONTRACT_NOTE_HISTORY_REVIEW_V1';
  source:'OPERATOR_SUPPLIED_UNVERIFIED';
  historical:OfflineHistoricalFoAuditInput;
  note:OfflineContractNoteRecord;
  reviewer:Phase33DetachedReviewerSignature;
  challengeHex:string;
}
export interface Phase33ExternalReviewTrust {
  schemaVersion:'EXTERNALLY_PINNED_PHASE33_NOTE_REVIEW_V1';
  expectedUcc:string;
  expectedOriginalPdfSha256:string;
  expectedChallengeHex:string;
  reviewerPublicKeySpkiDerBase64:string;
  maximumReviewAgeMinutes:number;
  verificationAsOf:string;
}
export interface Phase33NoteReport {
  mode:'OFFLINE_CONTRACT_NOTE_FO_ANNEXURE_WAP_REVIEW';
  status:'INVALID_EVIDENCE'|'REVIEW_SIGNATURE_OR_TRUST_REJECTED'|
    'BLOCKED_OR_UNKNOWN'|'NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  protectedOvernight:false;
  pdfDigitalSignatureVerified:false;
  brokerNoteIssuerAuthenticated:false;
  noteContentExtractedFromPdfByCode:false;
  exchangeOrderAcknowledgementVerified:false;
  nativeOrderInstruction:null;
  reasons:string[];
  reviewerSignatureVerified:boolean;
  originalPdfBytesMatchedPinnedHash:boolean;
  annexureRowsReviewed:number;
  wapSummaryRowsReviewed:number;
  selectedFoHistoryTrades:number;
  reviewPayloadSha256:string|null;
  requiredExternalReviews:string[];
  warnings:string[];
}
const empty=():Phase33NoteReport=>({
  mode:'OFFLINE_CONTRACT_NOTE_FO_ANNEXURE_WAP_REVIEW',
  status:'INVALID_EVIDENCE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,pdfDigitalSignatureVerified:false,
  brokerNoteIssuerAuthenticated:false,
  noteContentExtractedFromPdfByCode:false,
  exchangeOrderAcknowledgementVerified:false,
  nativeOrderInstruction:null,reasons:[],
  reviewerSignatureVerified:false,
  originalPdfBytesMatchedPinnedHash:false,
  annexureRowsReviewed:0,wapSummaryRowsReviewed:0,
  selectedFoHistoryTrades:0,reviewPayloadSha256:null,
  requiredExternalReviews:[
    'VERIFY_ORIGINAL_ECN_PDF_DIGITAL_SIGNATURE_CA_CHAIN_AND_BROKER_ISSUER',
    'REVIEW_ANNEXURE_AND_WAP_TRANSCRIPTION_AGAINST_ACTUAL_PDF_VISUALLY',
    'OBTAIN_BROKER_EXCHANGE_NATIVE_ORDER_ACK_AMEND_CANCEL_HISTORY',
    'VERIFY_UCC_ACCOUNT_OWNERSHIP_AND_EXCHANGE_TRADE_AUTHENTICITY',
    'HUMAN_OWNED_OVERNIGHT_GAP_RISK_NO_AUTO_NRML_TRADING'
  ],warnings:warn
});
/** Prepared message contains hashes only. Never sign in this application. */
export function preparePhase33NoteReviewMessage(
  bundle:Omit<Phase33OfflineNoteBundle,'reviewer'>,
  reviewerSignedAt:string
):{message:string;pdfHash:string|null;reasonCodes:string[]}{
  const bad=(reason:string)=>({message:'',pdfHash:null,
    reasonCodes:[reason]});
  if(!bundle||bundle.schemaVersion!==
    'ADAPTIVE_PHASE33_CONTRACT_NOTE_HISTORY_REVIEW_V1'||
    bundle.source!=='OPERATOR_SUPPLIED_UNVERIFIED'||
    !HASH.test(bundle.challengeHex??'')||
    !bundle.historical||!bundle.note||
    bundle.note.schemaVersion!==
      'ADAPTIVE_PHASE33_OPERATOR_TRANSCRIBED_NOTE_V1'||
    bundle.note.source!=='PRIVATE_ORIGINAL_PDF_UNVERIFIED'||
    bundle.note.mediaType!=='application/pdf'||
    !id(bundle.note.declaredUcc)||!id(bundle.note.documentReference)||
    !day(bundle.note.tradeDate)||
    !Number.isFinite(instant(reviewerSignedAt))||
    !Array.isArray(bundle.note.selectedAnnexureRows)||
    !Array.isArray(bundle.note.selectedWapSummaryRows)||
    bundle.note.selectedAnnexureRows.length<1||
    bundle.note.selectedAnnexureRows.length>2048||
    bundle.note.selectedWapSummaryRows.length<1||
    bundle.note.selectedWapSummaryRows.length>16)
    return bad('INVALID_REVIEW_BUNDLE_OR_SCOPED_NOTE_FIELDS');
  const pdf=strictBase64(bundle.note.originalPdfBase64,
    Math.ceil(DOC_MAX/3)*4+4);
  if(!pdf||pdf.length<12||pdf.length>DOC_MAX||
    pdf.subarray(0,5).toString('ascii')!=='%PDF-'||
    !pdf.subarray(Math.max(0,pdf.length-1024))
      .toString('latin1').includes('%%EOF'))
    return bad('MISSING_MALFORMED_OR_OVERSIZED_ORIGINAL_PDF_BYTES');
  const pdfHash=sha(pdf);
  const transcription={
    schemaVersion:bundle.note.schemaVersion,
    mediaType:bundle.note.mediaType,
    declaredUccHash:sha(bundle.note.declaredUcc),
    documentReferenceHash:sha(bundle.note.documentReference),
    tradeDate:bundle.note.tradeDate,
    annexure:bundle.note.selectedAnnexureRows,
    wap:bundle.note.selectedWapSummaryRows
  };
  const digest=sha(JSON.stringify({
    domain:DOMAIN,
    challengeHex:bundle.challengeHex,
    pdfSha256:pdfHash,
    historicalSha256:sha(JSON.stringify(bundle.historical)),
    transcriptionSha256:sha(JSON.stringify(transcription))
  }));
  return {message:DOMAIN+'\nREVIEWER_ENDORSEMENT\n'+digest+
    '\n'+reviewerSignedAt,pdfHash,reasonCodes:[]};
}
type Group={q:bigint;weighted:bigint};
const issue=(r:Phase33NoteReport,code:string,
  status:Phase33NoteReport['status']='BLOCKED_OR_UNKNOWN')=>({
  ...r,status,reasons:[code]
});
/** Completely side-effect free evidence comparison; not a PDF parser. */
export function auditPhase33OfflineContractNote(
  bundle:Phase33OfflineNoteBundle,
  trust:Phase33ExternalReviewTrust
):Phase33NoteReport{
  const r=empty();
  if(!trust||trust.schemaVersion!==
    'EXTERNALLY_PINNED_PHASE33_NOTE_REVIEW_V1'||
    !id(trust.expectedUcc)||!HASH.test(
      trust.expectedOriginalPdfSha256??'')||
    !HASH.test(trust.expectedChallengeHex??'')||
    !Number.isInteger(trust.maximumReviewAgeMinutes)||
    trust.maximumReviewAgeMinutes<1||
    trust.maximumReviewAgeMinutes>1440||
    !Number.isFinite(instant(trust.verificationAsOf)))
    return issue(r,'INVALID_INDEPENDENT_REVIEW_TRUST_POLICY',
      'INVALID_EVIDENCE');
  const prep=preparePhase33NoteReviewMessage(bundle,
    bundle?.reviewer?.signedAt);
  if(prep.reasonCodes.length)
    return issue(r,prep.reasonCodes[0],'INVALID_EVIDENCE');
  if(bundle.challengeHex!==trust.expectedChallengeHex||
    bundle.historical.expected?.accountScopeId!==trust.expectedUcc||
    bundle.note.declaredUcc!==trust.expectedUcc||
    prep.pdfHash!==trust.expectedOriginalPdfSha256)
    return issue(r,'INDEPENDENT_PDF_HASH_CHALLENGE_OR_UCC_MISMATCH',
      'REVIEW_SIGNATURE_OR_TRUST_REJECTED');
  const signedAt=instant(bundle.reviewer.signedAt),
    verifiedAt=instant(trust.verificationAsOf),
    captureAt=instant(bundle.historical.asOf);
  if(!Number.isFinite(signedAt)||!Number.isFinite(captureAt)||
    captureAt>signedAt||signedAt>verifiedAt||
    verifiedAt-signedAt>trust.maximumReviewAgeMinutes*60000)
    return issue(r,'STALE_OR_REVERSED_REVIEW_CAPTURE_TIMELINE',
      'REVIEW_SIGNATURE_OR_TRUST_REJECTED');
  const der=strictBase64(trust.reviewerPublicKeySpkiDerBase64,300);
  const sig=strictBase64(bundle.reviewer.signatureBase64,200);
  if(!der||!sig||sig.length!==64)
    return issue(r,'MISSING_EXTERNAL_ED25519_REVIEWER_KEY_OR_SIGNATURE',
      'REVIEW_SIGNATURE_OR_TRUST_REJECTED');
  try{
    const pub=createPublicKey({key:der,format:'der',type:'spki'});
    if(pub.asymmetricKeyType!=='ed25519'||
      !verify(null,Buffer.from(prep.message,'utf8'),pub,sig))
      return issue(r,'EXTERNAL_REVIEWER_SIGNATURE_MISMATCH',
        'REVIEW_SIGNATURE_OR_TRUST_REJECTED');
  }catch{
    return issue(r,'EXTERNAL_REVIEWER_SIGNATURE_MISMATCH',
      'REVIEW_SIGNATURE_OR_TRUST_REJECTED');
  }
  const signed={...r,reviewerSignatureVerified:true,
    originalPdfBytesMatchedPinnedHash:true,
    reviewPayloadSha256:sha(prep.message)};
  const history=auditOfflineHistoricalFoFills(bundle.historical);
  if(history.status!=='HISTORICAL_FILLS_RECONCILED_UNVERIFIED'||
    !history.paginationComplete)
    return issue(signed,'PHASE31_HISTORY_NOT_SAFE_FOR_SAME_DAY_REVIEW');
  const h=bundle.historical;
  if(h.startDate!==h.endDate||h.startDate!==bundle.note.tradeDate||
    h.pinnedContract?.expiry!==h.expected?.expiry)
    return issue(signed,'CONTRACT_NOTE_DATE_OR_EXPIRY_OUTSIDE_FO_COHORT');
  const hist=new Map<string,{q:number;p:bigint;
    side:'BUY'|'SELL';tradeDate:string}>();
  const historyGroups=new Map<string,Group>();
  for(const page of h.pages){
    const body=page.response as {data:Record<string,unknown>[]};
    for(const item of body.data){
      if(item.exchange!==h.pinnedContract.exchange||
        item.symbol!==h.pinnedContract.symbol||
        item.option_type!==h.pinnedContract.optionType||
        item.expiry!==h.pinnedContract.expiry||
        Number(item.strike_price)!==h.pinnedContract.strikePrice)
        continue;
      const p=four(item.price);
      if(p===null||typeof item.trade_id!=='string'||
        hist.has(item.trade_id))
        return issue(signed,'HISTORICAL_SELECTED_OPTION_PRICE_OR_TRADE_ID_INVALID');
      const side=item.transaction_type as 'BUY'|'SELL';
      const q=item.quantity as number;
      hist.set(item.trade_id,{q,p,side,
        tradeDate:item.trade_date as string});
      const name=key({side,tradeDate:item.trade_date as string});
      const g=historyGroups.get(name)??{q:0n,weighted:0n};
      g.q+=BigInt(q);g.weighted+=p*BigInt(q);
      historyGroups.set(name,g);
    }
  }
  if(hist.size<1)return issue(signed,'NO_SELECTED_HISTORICAL_FO_TRADES_TO_MATCH');
  const seen=new Set<string>();
  const noteGroups=new Map<string,Group>();
  for(const noteRow of bundle.note.selectedAnnexureRows){
    if(!noteRow||!id(noteRow.tradeId)||!id(noteRow.orderId)||
      !TIME.test(noteRow.tradeTimeIst??'')||
      !day(noteRow.tradeDate)||!positive(noteRow.quantity)||
      !['BUY','SELL'].includes(noteRow.side)||
      !['NFO','BFO'].includes(noteRow.exchange)||
      !['CE','PE'].includes(noteRow.optionType)||
      !id(noteRow.symbol)||
      noteRow.quantity%h.expected.lotSize!==0)
      return issue(signed,'UNMAPPABLE_OR_NONLOT_CONTRACT_NOTE_ANNEXURE');
    if(seen.has(noteRow.tradeId))
      return issue(signed,'DUPLICATE_ANNEXURE_TRADE_ID');
    seen.add(noteRow.tradeId);
    if(noteRow.exchange!==h.pinnedContract.exchange||
      noteRow.symbol!==h.pinnedContract.symbol||
      noteRow.optionType!==h.pinnedContract.optionType||
      noteRow.strikePrice!==h.pinnedContract.strikePrice||
      noteRow.expiry!==h.pinnedContract.expiry||
      noteRow.tradeDate!==h.startDate)
      return issue(signed,'ANNEXURE_CONTRACT_EXPIRY_OR_TRADE_DATE_MISMATCH');
    const p=four(noteRow.priceRupees);
    if(p===null)return issue(signed,'ANNEXURE_TRADE_PRICE_PRECISION_INVALID');
    const source=hist.get(noteRow.tradeId);
    if(!source)return issue(signed,'EXTRA_ANNEXURE_TRADE_ID_ABSENT_IN_FO_HISTORY');
    if(source.q!==noteRow.quantity||source.p!==p||
      source.side!==noteRow.side||
      source.tradeDate!==noteRow.tradeDate)
      return issue(signed,'ANNEXURE_TRADE_SIDE_QUANTITY_OR_PRICE_MISMATCH');
    const name=key(noteRow);
    const g=noteGroups.get(name)??{q:0n,weighted:0n};
    g.q+=BigInt(noteRow.quantity);
    g.weighted+=p*BigInt(noteRow.quantity);
    noteGroups.set(name,g);
  }
  const matched={...signed,annexureRowsReviewed:seen.size,
    selectedFoHistoryTrades:hist.size};
  if(seen.size!==hist.size)
    return issue(matched,'MISSING_ANNEXURE_TRADES_FROM_FO_HISTORY');
  if(noteGroups.size!==historyGroups.size)
    return issue(matched,'ANNEXURE_BUY_SELL_GROUP_COVERAGE_MISMATCH');
  for(const [name,fromHistory] of historyGroups){
    const note=noteGroups.get(name);
    if(!note||note.q!==fromHistory.q||
      note.weighted!==fromHistory.weighted)
      return issue(matched,'ANNEXURE_GROUP_QUANTITY_OR_VALUE_MISMATCH');
  }
  const summaryKeys=new Set<string>();
  for(const wap of bundle.note.selectedWapSummaryRows){
    if(!wap||!day(wap.tradeDate)||
      !['BUY','SELL'].includes(wap.side)||
      !positive(wap.totalQuantity)||
      ![2,4].includes(wap.displayDecimals))
      return issue(matched,'INVALID_CONTRACT_NOTE_WAP_SUMMARY_ROW');
    const name=key(wap);
    if(summaryKeys.has(name))
      return issue(matched,'DUPLICATED_CONTRACT_NOTE_WAP_GROUP');
    summaryKeys.add(name);
    const g=historyGroups.get(name);
    const text=wap.weightedAveragePriceRupees;
    if(!g||!Number.isInteger(wap.totalQuantity)||
      g.q!==BigInt(wap.totalQuantity)||
      typeof text!=='string'||!PRICE.test(text)||
      (text.split('.')[1]?.length??0)!==wap.displayDecimals)
      return issue(matched,'CONTRACT_NOTE_WAP_SCOPE_QUANTITY_OR_PRECISION_MISMATCH');
    const price=four(text)!;
    // NSE allows two or four decimal display: half-a-display-unit rounding
    // tolerance, evaluated exactly as BigInt weighted value (no float).
    const units=wap.displayDecimals===2?100n:1n;
    const diff=price*g.q-g.weighted;
    const abs=diff<0n?-diff:diff;
    if(abs*2n>units*g.q)
      return issue(matched,'CONTRACT_NOTE_WAP_DIFFERS_FROM_EXECUTED_FO_VWAP');
  }
  const complete={...matched,wapSummaryRowsReviewed:summaryKeys.size};
  if(summaryKeys.size!==historyGroups.size)
    return issue(complete,'MISSING_CONTRACT_NOTE_WAP_GROUP');
  return {...complete,status:'NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED'};
}
