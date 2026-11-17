import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  auditPhase33OfflineContractNote,preparePhase33NoteReviewMessage,
  type Phase33OfflineNoteBundle,type Phase33ExternalReviewTrust
} from '../../server/engine/ema15m/adaptiveUpstoxPhase33ContractNoteReview.js';
import type {OfflineHistoricalFoAuditInput}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase31HistoricalFoFills.js';

const UCC='SYNTHETIC_PHASE33_PRIVATE_UCC';
const CONTRACT='NSE_FO|SYNTHETIC33';
const DATE='2026-11-16';
const PDF=Buffer.from('%PDF-1.7\n% Synthetic fake PDF; no broker signature\n%%EOF\n');
const HASH=createHash('sha256').update(PDF).digest('hex');
const originalKey=generateKeyPairSync('ed25519');
const wrongKey=generateKeyPairSync('ed25519');
const spki=(k:typeof originalKey)=>k.publicKey.export({
  type:'spki',format:'der'}).toString('base64');
const trust:Phase33ExternalReviewTrust={
  schemaVersion:'EXTERNALLY_PINNED_PHASE33_NOTE_REVIEW_V1',
  expectedUcc:UCC,expectedOriginalPdfSha256:HASH,
  expectedChallengeHex:'ab'.repeat(32),
  reviewerPublicKeySpkiDerBase64:spki(originalKey),
  maximumReviewAgeMinutes:5,
  verificationAsOf:'2026-11-17T10:02:00.000Z'
};
const fo=(id:string,side:'BUY'|'SELL',quantity:number,price:number,
  more:Record<string,unknown>={})=>({
  exchange:'NFO',segment:'FO',option_type:'CE',
  trade_id:id,trade_date:DATE,transaction_type:side,
  symbol:'NIFTY',strike_price:'24000.0',
  expiry:'2026-12-24',price,quantity,instrument_token:'',...more
});
const hRows=[
  fo('SYNTHETIC_T1','BUY',65,250),
  fo('SYNTHETIC_T2','BUY',65,251),
  fo('SYNTHETIC_T3','SELL',65,253)
];
function history():OfflineHistoricalFoAuditInput{
  return {
    schemaVersion:'ADAPTIVE_UPSTOX_HISTORICAL_FO_V1',
    origin:'OPERATOR_SUPPLIED_UNVERIFIED',
    expected:{
      accountScopeId:UCC,instrumentKey:CONTRACT,
      productType:'NRML',lotSize:65,expiry:'2026-12-24',
      expectedNetLongQuantity:195
    },
    pinnedContract:{
      exchange:'NFO',symbol:'NIFTY',optionType:'CE',
      strikePrice:24000,expiry:'2026-12-24'
    },
    startDate:DATE,endDate:DATE,
    asOf:'2026-11-17T10:00:00.000Z',
    maxCaptureAgeMinutes:5,openingNetLongQuantity:130,
    closingNetLongQuantity:195,pages:[{
      method:'GET',path:'/v2/charges/historical-trades',
      query:{segment:'FO',start_date:DATE,end_date:DATE,
        page_number:1,page_size:100},
      httpStatus:200,capturedAt:'2026-11-17T09:59:45.000Z',
      response:{status:'success',data:structuredClone(hRows),
        meta_data:{page:{page_number:1,page_size:100,
          total_records:3,total_pages:1}}}
    }]
  };
}
const annex=(tradeId:string,side:'BUY'|'SELL',
  priceRupees:string)=>({
  tradeId,orderId:'SYNTHETIC_ORDER_33',
  tradeDate:DATE,tradeTimeIst:'10:01:00',
  exchange:'NFO' as const,symbol:'NIFTY',
  optionType:'CE' as const,strikePrice:24000,
  expiry:'2026-12-24',side,quantity:65,priceRupees
});
function unsigned():Phase33OfflineNoteBundle{
  return {
    schemaVersion:'ADAPTIVE_PHASE33_CONTRACT_NOTE_HISTORY_REVIEW_V1',
    source:'OPERATOR_SUPPLIED_UNVERIFIED',
    historical:history(),challengeHex:'ab'.repeat(32),
    note:{
      schemaVersion:'ADAPTIVE_PHASE33_OPERATOR_TRANSCRIBED_NOTE_V1',
      source:'PRIVATE_ORIGINAL_PDF_UNVERIFIED',
      mediaType:'application/pdf',
      originalPdfBase64:PDF.toString('base64'),
      declaredUcc:UCC,documentReference:'SYNTHETIC_ECN_33',
      tradeDate:DATE,
      selectedAnnexureRows:[
        annex('SYNTHETIC_T1','BUY','250.0000'),
        annex('SYNTHETIC_T2','BUY','251.0000'),
        annex('SYNTHETIC_T3','SELL','253.0000')
      ],
      selectedWapSummaryRows:[
        {tradeDate:DATE,side:'BUY',totalQuantity:130,
          weightedAveragePriceRupees:'250.50',displayDecimals:2},
        {tradeDate:DATE,side:'SELL',totalQuantity:65,
          weightedAveragePriceRupees:'253.00',displayDecimals:2}
      ]
    },
    reviewer:{signedAt:'2026-11-17T10:01:00.000Z',signatureBase64:''}
  };
}
function resign(pkg:Phase33OfflineNoteBundle){
  const prepared=preparePhase33NoteReviewMessage(pkg,pkg.reviewer.signedAt);
  assert.deepEqual(prepared.reasonCodes,[]);
  pkg.reviewer.signatureBase64=sign(null,
    Buffer.from(prepared.message),originalKey.privateKey)
    .toString('base64');
  return pkg;
}
const sample=()=>resign(unsigned());
const audit=(pkg=sample(),external=trust)=>
  auditPhase33OfflineContractNote(pkg,external);
function safe(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.pdfDigitalSignatureVerified,false);
  assert.equal(r.brokerNoteIssuerAuthenticated,false);
  assert.equal(r.noteContentExtractedFromPdfByCode,false);
  assert.equal(r.exchangeOrderAcknowledgementVerified,false);
  const text=JSON.stringify(r);
  for(const secret of [UCC,CONTRACT,'SYNTHETIC_T1',
    'SYNTHETIC_ORDER_33','SYNTHETIC_ECN_33'])
    assert.ok(!text.includes(secret),secret);
}
function blocked(p:Phase33OfflineNoteBundle,reason:string,
  trustPolicy=trust){
  const r=audit(p,trustPolicy);
  safe(r);
  assert.notEqual(r.status,'NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED');
  assert.ok(r.reasons.includes(reason),JSON.stringify(r.reasons));
  return r;
}
describe('Phase33 offline contract note PDF hash + annexure + WAP evidence',()=>{
  it('valid reviewer signature and same-day annexure + 2dp WAP remain UNVERIFIED',()=>{
    const r=audit();safe(r);
    assert.equal(r.status,'NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED');
    assert.equal(r.reviewerSignatureVerified,true);
    assert.equal(r.originalPdfBytesMatchedPinnedHash,true);
    assert.equal(r.annexureRowsReviewed,3);
    assert.equal(r.selectedFoHistoryTrades,3);
    assert.equal(r.wapSummaryRowsReviewed,2);
    assert.ok(/^[0-9a-f]{64}$/.test(r.reviewPayloadSha256!));
    assert.ok(r.requiredExternalReviews.includes(
      'VERIFY_ORIGINAL_ECN_PDF_DIGITAL_SIGNATURE_CA_CHAIN_AND_BROKER_ISSUER'));
  });
  it('two or four decimal NSE weighted-average can be rounded',()=>{
    const p=unsigned();
    p.note.selectedWapSummaryRows[0]={
      tradeDate:DATE,side:'BUY',totalQuantity:130,
      weightedAveragePriceRupees:'250.5000',displayDecimals:4
    };
    assert.equal(audit(resign(p)).status,
      'NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED');
  });
  it('wrong reviewer key, substituted signature and mutated transcript reject',()=>{
    blocked(sample(),'EXTERNAL_REVIEWER_SIGNATURE_MISMATCH',{
      ...trust,reviewerPublicKeySpkiDerBase64:spki(wrongKey)});
    const fake=sample();
    fake.note.selectedAnnexureRows[0].quantity=130;
    blocked(fake,'EXTERNAL_REVIEWER_SIGNATURE_MISMATCH');
    const mutated=sample();mutated.note.documentReference='REPLACED';
    blocked(mutated,'EXTERNAL_REVIEWER_SIGNATURE_MISMATCH');
  });
  it('external original PDF hash, nonce and account scope are separately pinned',()=>{
    blocked(sample(),'INDEPENDENT_PDF_HASH_CHALLENGE_OR_UCC_MISMATCH',{
      ...trust,expectedOriginalPdfSha256:'cd'.repeat(32)});
    blocked(sample(),'INDEPENDENT_PDF_HASH_CHALLENGE_OR_UCC_MISMATCH',{
      ...trust,expectedChallengeHex:'ef'.repeat(32)});
    blocked(sample(),'INDEPENDENT_PDF_HASH_CHALLENGE_OR_UCC_MISMATCH',{
      ...trust,expectedUcc:'OTHER_UCC'});
    const p=sample();p.note.declaredUcc='ANOTHER';
    blocked(p,'INDEPENDENT_PDF_HASH_CHALLENGE_OR_UCC_MISMATCH');
  });
  it('PDF bytes different or malformed cannot reuse pinned hash',()=>{
    const p=sample();p.note.originalPdfBase64=
      Buffer.from('%PDF-1.7\nOther\n%%EOF\n').toString('base64');
    blocked(p,'INDEPENDENT_PDF_HASH_CHALLENGE_OR_UCC_MISMATCH');
    const bad=sample();bad.note.originalPdfBase64='ZmFrZQ==';
    blocked(bad,'MISSING_MALFORMED_OR_OVERSIZED_ORIGINAL_PDF_BYTES');
  });
  it('stale/reversed reviewer approval fails even with a fresh local signature',()=>{
    const p=sample();
    blocked(p,'STALE_OR_REVERSED_REVIEW_CAPTURE_TIMELINE',{
      ...trust,verificationAsOf:'2026-11-17T11:00:00Z'});
    const q=unsigned();
    q.reviewer.signedAt='2026-11-17T09:59:00Z';
    blocked(resign(q),'STALE_OR_REVERSED_REVIEW_CAPTURE_TIMELINE');
  });
  it('missing/extra/duplicated annexure trade IDs fail closed even when signed',()=>{
    const missing=unsigned();missing.note.selectedAnnexureRows.pop();
    blocked(resign(missing),'MISSING_ANNEXURE_TRADES_FROM_FO_HISTORY');
    const extra=unsigned();extra.note.selectedAnnexureRows.push(
      annex('ABSENT_FROM_HISTORY','BUY','250.0000'));
    blocked(resign(extra),'EXTRA_ANNEXURE_TRADE_ID_ABSENT_IN_FO_HISTORY');
    const dup=unsigned();dup.note.selectedAnnexureRows[1].tradeId='SYNTHETIC_T1';
    blocked(resign(dup),'DUPLICATE_ANNEXURE_TRADE_ID');
  });
  it('trade quantity, price, side and effective FO expiry must equal history',()=>{
    const price=unsigned();
    price.note.selectedAnnexureRows[1].priceRupees='254.0000';
    blocked(resign(price),'ANNEXURE_TRADE_SIDE_QUANTITY_OR_PRICE_MISMATCH');
    const qty=unsigned();
    qty.note.selectedAnnexureRows[2].quantity=130;
    blocked(resign(qty),'ANNEXURE_TRADE_SIDE_QUANTITY_OR_PRICE_MISMATCH');
    const side=unsigned();
    side.note.selectedAnnexureRows[1].side='SELL';
    blocked(resign(side),'ANNEXURE_TRADE_SIDE_QUANTITY_OR_PRICE_MISMATCH');
    const expiry=unsigned();
    expiry.note.selectedAnnexureRows[0].expiry='2026-12-31';
    blocked(resign(expiry),'ANNEXURE_CONTRACT_EXPIRY_OR_TRADE_DATE_MISMATCH');
  });
  it('uncorroborated order ID and time require presence but never become authenticated',()=>{
    const blank=unsigned();
    blank.note.selectedAnnexureRows[0].orderId='';
    blocked(resign(blank),'UNMAPPABLE_OR_NONLOT_CONTRACT_NOTE_ANNEXURE');
    const time=unsigned();
    time.note.selectedAnnexureRows[0].tradeTimeIst='25:61:01';
    blocked(resign(time),'UNMAPPABLE_OR_NONLOT_CONTRACT_NOTE_ANNEXURE');
    const different=unsigned();
    different.note.selectedAnnexureRows[0].orderId='DIFFERENT_UNVERIFIED_ORDER';
    const r=audit(resign(different));
    assert.equal(r.status,'NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED');
    assert.equal(r.exchangeOrderAcknowledgementVerified,false);
  });
  it('WAP summary group quantity, rounding, duplicates and coverage fail closed',()=>{
    const wrongPrice=unsigned();
    wrongPrice.note.selectedWapSummaryRows[0]
      .weightedAveragePriceRupees='250.52';
    blocked(resign(wrongPrice),'CONTRACT_NOTE_WAP_DIFFERS_FROM_EXECUTED_FO_VWAP');
    const qty=unsigned();
    qty.note.selectedWapSummaryRows[0].totalQuantity=65;
    blocked(resign(qty),'CONTRACT_NOTE_WAP_SCOPE_QUANTITY_OR_PRECISION_MISMATCH');
    const missing=unsigned();missing.note.selectedWapSummaryRows.pop();
    blocked(resign(missing),'MISSING_CONTRACT_NOTE_WAP_GROUP');
    const duplicates=unsigned();
    duplicates.note.selectedWapSummaryRows.push({
      ...duplicates.note.selectedWapSummaryRows[0]});
    blocked(resign(duplicates),'DUPLICATED_CONTRACT_NOTE_WAP_GROUP');
    const prec=unsigned();
    prec.note.selectedWapSummaryRows[0].displayDecimals=4;
    blocked(resign(prec),'CONTRACT_NOTE_WAP_SCOPE_QUANTITY_OR_PRECISION_MISMATCH');
  });
  it('Phase31 invalid/overnight historical FO evidence is not promotable',()=>{
    const invalid=unsigned();
    invalid.historical.closingNetLongQuantity=260;
    blocked(resign(invalid),'PHASE31_HISTORY_NOT_SAFE_FOR_SAME_DAY_REVIEW');
    const multi=unsigned();
    multi.historical.endDate='2026-11-17';
    multi.historical.pages[0].query.end_date='2026-11-17';
    blocked(resign(multi),'PHASE31_HISTORY_NOT_SAFE_FOR_SAME_DAY_REVIEW');
  });
  it('valid reviewer signature can still sign fake PDF and false transcription',()=>{
    const r=audit(sample());
    // Synthetic PDF has NO broker DSC, and "rows" are not in PDF.
    assert.equal(r.status,'NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED');
    assert.equal(r.pdfDigitalSignatureVerified,false);
    assert.equal(r.noteContentExtractedFromPdfByCode,false);
    assert.equal(r.brokerNoteIssuerAuthenticated,false);
    assert.equal(r.executionAuthorized,false);
  });
});
