import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,generateKeyPairSync,randomBytes,sign
} from 'node:crypto';
import {chmodSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  reviewPhase34CrossExchangeWap,
  type Phase34CrossExchangeInput
} from '../../server/engine/ema15m/adaptiveUpstoxPhase34CrossExchangeWap.js';
import {
  preparePhase34ExternalVerifierMessage,
  reviewPhase34ExternalPdfEvidence,
  verifyAndClaimPhase34ExternalReceiptOnce,
  type Phase34ExternalValidationInput,
  type Phase34IndependentVerifierPins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase34ExternalEcnReceiptGate.js';
import type {OfflineHistoricalFoAuditInput}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase31HistoricalFoFills.js';

const ACCOUNT='SYNTHETIC_PHASE34_UCC';
const DAY='2026-11-16';
const PDF=Buffer.from('%PDF-1.7\nSYNTHETIC FAKE DOCUMENT WITHOUT DIGITAL SIGNATURE\n%%EOF\n');
const hash=(x:Uint8Array|string)=>createHash('sha256').update(x).digest('hex');
const challenge='ab'.repeat(32),build='cd'.repeat(32),
  signerCert='ef'.repeat(32),issuerCa='12'.repeat(32);
const reviewer=generateKeyPairSync('ed25519');
const outsider=generateKeyPairSync('ed25519');
const pub=(key:typeof reviewer)=>key.publicKey.export({
  type:'spki',format:'der'}).toString('base64');
const pins:Phase34IndependentVerifierPins={
  schemaVersion:'EXTERNALLY_PINNED_PDF_VALIDATOR_POLICY_V1',
  expectedUcc:ACCOUNT,expectedOriginalPdfSha256:hash(PDF),
  expectedChallengeHex:challenge,
  expectedValidatorBuildSha256:build,
  expectedSignerCertificateSha256:signerCert,
  expectedIssuerCaCertificateSha256:issuerCa,
  allowedExchanges:['NFO','BFO'],
  verifierPublicKeySpkiDerBase64:pub(reviewer),
  verificationAsOf:'2026-11-17T10:02:00.000Z',
  maximumReceiptAgeMinutes:5
};
const trade=(exchange:'NFO'|'BFO',tradeId:string,
  side:'BUY'|'SELL',price:number)=>({
  exchange,segment:'FO',option_type:'CE',
  trade_id:tradeId,trade_date:DAY,
  transaction_type:side,
  symbol:'SYNTHETIC_COMMON_OPTION',strike_price:'24000.0',
  expiry:'2026-12-24',price,quantity:65,instrument_token:''
});
function foHistory(exchange:'NFO'|'BFO',
  rows:Array<Record<string,unknown>>,
  opening:number,closing:number):OfflineHistoricalFoAuditInput{
  return {
    schemaVersion:'ADAPTIVE_UPSTOX_HISTORICAL_FO_V1',
    origin:'OPERATOR_SUPPLIED_UNVERIFIED',
    expected:{
      accountScopeId:ACCOUNT,
      instrumentKey:exchange==='NFO'?'NSE_FO|SYN34_NFO':'BSE_FO|SYN34_BFO',
      productType:'NRML',lotSize:65,expiry:'2026-12-24',
      expectedNetLongQuantity:closing
    },
    pinnedContract:{
      exchange,symbol:'SYNTHETIC_COMMON_OPTION',
      optionType:'CE',strikePrice:24000,expiry:'2026-12-24'
    },
    startDate:DAY,endDate:DAY,
    asOf:'2026-11-17T10:00:00.000Z',
    maxCaptureAgeMinutes:5,
    openingNetLongQuantity:opening,
    closingNetLongQuantity:closing,
    pages:[{
      method:'GET',
      path:'/v2/charges/historical-trades',
      query:{segment:'FO',start_date:DAY,end_date:DAY,
        page_number:1,page_size:100},
      httpStatus:200,capturedAt:'2026-11-17T09:59:30.000Z',
      response:{
        status:'success',data:rows,
        meta_data:{page:{page_number:1,page_size:100,
          total_records:rows.length,total_pages:1}}
      }
    }]
  };
}
function noteRow(exchange:'NFO'|'BFO',tradeId:string,
  side:'BUY'|'SELL',price:string){
  return {
    exchange,tradeId,orderId:'SYNTHETIC_ONLY_ORDER_'+exchange,
    tradeDate:DAY,tradeTimeIst:'11:30:00',side,quantity:65,
    symbol:'SYNTHETIC_COMMON_OPTION',optionType:'CE' as const,
    strikePrice:24000,expiry:'2026-12-24',priceRupees:price
  };
}
function cross():Phase34CrossExchangeInput{
  const nfo=[
    trade('NFO','T1','BUY',250),
    trade('NFO','T2','BUY',251),
    trade('NFO','T3','SELL',254)
  ];
  const bfo=[trade('BFO','T1','BUY',253)];
  return {
    schemaVersion:'ADAPTIVE_V2_PHASE34_CROSS_EXCHANGE_FO_WAP_V1',
    source:'OPERATOR_PRIVATE_UNVERIFIED',
    scope:{
      expectedAccountScopeId:ACCOUNT,tradeDate:DAY,
      symbol:'SYNTHETIC_COMMON_OPTION',strikePrice:24000,
      optionType:'CE',expiry:'2026-12-24',
      expectedExchanges:['NFO','BFO'],
      commonContractEquivalence:'EXTERNALLY_REVIEW_REQUIRED'
    },
    historicalSources:[
      foHistory('NFO',nfo,65,130),
      foHistory('BFO',bfo,0,65)
    ],
    note:{
      schemaVersion:'ADAPTIVE_PHASE33_OPERATOR_TRANSCRIBED_NOTE_V1',
      source:'PRIVATE_ORIGINAL_PDF_UNVERIFIED',
      mediaType:'application/pdf',
      originalPdfBase64:PDF.toString('base64'),
      declaredUcc:ACCOUNT,documentReference:'SYNTHETIC_FAKE_ECN_34',
      tradeDate:DAY,
      selectedAnnexureRows:[
        noteRow('NFO','T1','BUY','250.0000'),
        noteRow('NFO','T2','BUY','251.0000'),
        noteRow('BFO','T1','BUY','253.0000'),
        noteRow('NFO','T3','SELL','254.0000')
      ],
      selectedWapSummaryRows:[
        {tradeDate:DAY,side:'BUY',totalQuantity:195,
          weightedAveragePriceRupees:'251.33',displayDecimals:2},
        {tradeDate:DAY,side:'SELL',totalQuantity:65,
          weightedAveragePriceRupees:'254.00',displayDecimals:2}
      ]
    }
  };
}
function unsigned():Phase34ExternalValidationInput{
  const c=cross();
  return {
    schemaVersion:'ADAPTIVE_V2_PHASE34_EXTERNAL_PDF_WAP_AUDIT_V1',
    crossExchange:c,
    externalVerifier:{
      schemaVersion:'EXTERNAL_PDF_VALIDATOR_CLAIMS_V1',
      signedAt:'2026-11-17T10:01:00.000Z',
      challengeHex:challenge,
      originalPdfSha256:hash(PDF),
      verifierBuildSha256:build,
      claimedBrokerSignerCertificateSha256:signerCert,
      claimedIssuerCaCertificateSha256:issuerCa,
      signatureCryptographicIntegrity:'PASS',
      signedByteCoverage:'ENTIRE_DOCUMENT_NO_UNSIGNED_UPDATES',
      signingCertificatePath:'TRUSTED_IN_EXTERNAL_CA_STORE',
      signingCertificateRevocation:'GOOD_AT_VALIDATION_TIME',
      qualifiedTimestamp:'INDEPENDENT_TSA_VALID',
      pdfAnnexureTranscriptSha256:
        hash(JSON.stringify(c.note.selectedAnnexureRows)),
      pdfConsolidatedWapTranscriptSha256:
        hash(JSON.stringify(c.note.selectedWapSummaryRows)),
      validatorSignatureBase64:''
    }
  };
}
function endorse(input:Phase34ExternalValidationInput){
  input.externalVerifier.pdfAnnexureTranscriptSha256=
    hash(JSON.stringify(input.crossExchange.note.selectedAnnexureRows));
  input.externalVerifier.pdfConsolidatedWapTranscriptSha256=
    hash(JSON.stringify(input.crossExchange.note.selectedWapSummaryRows));
  const prepared=preparePhase34ExternalVerifierMessage(input);
  assert.deepEqual(prepared.reasonCodes,[]);
  input.externalVerifier.validatorSignatureBase64=sign(null,
    Buffer.from(prepared.message),reviewer.privateKey).toString('base64');
  return input;
}
const sample=()=>endorse(unsigned());
function safe(report:ReturnType<typeof reviewPhase34ExternalPdfEvidence>){
  assert.equal(report.executionAuthorized,false);
  assert.equal(report.productionSafe,false);
  assert.equal(report.brokerAuthenticated,false);
  assert.equal(report.brokerStopInstalled,false);
  assert.equal(report.protectedOvernight,false);
  assert.equal(report.nativeOrderInstruction,null);
  assert.equal(report.pdfDigitalSignatureVerifiedByThisCode,false);
  assert.equal(report.brokerEcNissuerIndependentlyVerified,false);
  assert.equal(report.pdfAnnexureExtractedByThisCode,false);
  assert.equal(report.nativeOrderLifecycleVerified,false);
  const text=JSON.stringify(report);
  for(const privateText of [
    ACCOUNT,'SYN34_NFO','SYN34_BFO',
    'SYNTHETIC_ONLY_ORDER_NFO','SYNTHETIC_FAKE_ECN_34'
  ])assert.ok(!text.includes(privateText));
}
function reject(input:Phase34ExternalValidationInput,
  reason:string,trust=pins){
  const out=reviewPhase34ExternalPdfEvidence(input,trust);
  safe(out);
  assert.notEqual(out.status,'EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED');
  assert.deepEqual(out.reasons,[reason],JSON.stringify(out));
  return out;
}
describe('Phase34 common-contract F&O cross-exchange WAP',()=>{
  it('reconciles NFO and BFO trade-id collision using exchange-qualified identity',()=>{
    const r=reviewPhase34CrossExchangeWap(cross());
    assert.equal(r.status,'CROSS_EXCHANGE_WAP_MATCHED_OFFLINE_UNVERIFIED');
    assert.equal(r.historyExchangesReviewed,2);
    assert.equal(r.selectedFoFills,4);
    assert.equal(r.selectedAnnexureRowsMatched,4);
    assert.equal(r.summaryGroupsMatched,2);
    assert.equal(r.brokerStopInstalled,false);
    assert.equal(r.commonContractEquivalenceAuthenticated,false);
  });
  it('consolidated WAP must use BOTH exchanges and exact BUY/SELL quantities',()=>{
    const c=cross();
    c.note.selectedWapSummaryRows[0].weightedAveragePriceRupees='250.50';
    assert.equal(reviewPhase34CrossExchangeWap(c).reasons[0],
      'ECN_CONSOLIDATED_WAP_DIFFERS_FROM_FO_TRADE_VWAP');
    const c2=cross();c2.note.selectedWapSummaryRows[0].totalQuantity=130;
    assert.equal(reviewPhase34CrossExchangeWap(c2).reasons[0],
      'ECN_CONSOLIDATED_WAP_GROUP_SCOPE_OR_PRECISION_MISMATCH');
    const c3=cross();c3.note.selectedWapSummaryRows.pop();
    assert.equal(reviewPhase34CrossExchangeWap(c3).reasons[0],
      'MISSING_CONSOLIDATED_ECN_WAP_SIDE');
  });
  it('missing BFO complete history, duplicate exchange or missing annexure fail',()=>{
    const a=cross();a.historicalSources.pop();
    assert.equal(reviewPhase34CrossExchangeWap(a).status,'BLOCKED_OR_UNKNOWN');
    const b=cross();b.historicalSources[1]=structuredClone(b.historicalSources[0]);
    assert.equal(reviewPhase34CrossExchangeWap(b).reasons[0],
      'SOURCED_EXCHANGE_CONTRACT_OR_UCC_DISAGREES_WITH_SCOPE');
    const c=cross();c.note.selectedAnnexureRows.splice(2,1);
    assert.equal(reviewPhase34CrossExchangeWap(c).reasons[0],
      'MISSING_ECN_ANNEXURE_FILLS_FROM_ONE_OR_MORE_EXCHANGES');
  });
  it('wrong trade, quantity, price, contract, and source date fail',()=>{
    const a=cross();a.note.selectedAnnexureRows[2].priceRupees='249.0000';
    assert.equal(reviewPhase34CrossExchangeWap(a).reasons[0],
      'ECN_ANNEXURE_TRADE_QUANTITY_SIDE_OR_PRICE_MISMATCH');
    const b=cross();b.note.selectedAnnexureRows[2].tradeId='UNKNOWN';
    assert.equal(reviewPhase34CrossExchangeWap(b).reasons[0],
      'EXTRA_ECN_TRADE_NOT_IN_COMPLETE_FO_HISTORY');
    const c=cross();c.scope.expiry='2026-12-31';
    assert.equal(reviewPhase34CrossExchangeWap(c).reasons[0],
      'SOURCED_EXCHANGE_CONTRACT_OR_UCC_DISAGREES_WITH_SCOPE');
    const d=cross();d.historicalSources[1].startDate='2026-11-15';
    assert.equal(reviewPhase34CrossExchangeWap(d).reasons[0],
      'SOURCED_EXCHANGE_CONTRACT_OR_UCC_DISAGREES_WITH_SCOPE');
    const e=cross();e.note.selectedAnnexureRows[0].orderId='';
    assert.equal(reviewPhase34CrossExchangeWap(e).reasons[0],
      'UNMAPPABLE_OR_OUT_OF_SCOPE_ECN_ANNEXURE_ROW');
  });
  it('single exchange matching alone cannot be misreported as two-exchange coverage',()=>{
    const a=cross();a.scope.expectedExchanges=['NFO'];
    assert.equal(reviewPhase34CrossExchangeWap(a).status,'BLOCKED_OR_UNKNOWN');
    const b=cross();b.historicalSources[1].pages[0].response={
      status:'success',data:[],meta_data:{
        page:{page_number:1,page_size:100,total_records:0,total_pages:1}
      }
    };
    b.historicalSources[1].closingNetLongQuantity=0;
    b.historicalSources[1].expected.expectedNetLongQuantity=0;
    assert.equal(reviewPhase34CrossExchangeWap(b).reasons[0],
      'MISSING_EXCHANGE_TRADE_EVIDENCE_FOR_PINNED_COVERAGE');
  });
});
describe('Phase34 external independently PINNED PDF-validator receipt',()=>{
  it('synthetically signed asserted PAdES checks are never broker authentication',()=>{
    const result=reviewPhase34ExternalPdfEvidence(sample(),pins);
    safe(result);
    assert.equal(result.status,
      'EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED');
    assert.equal(result.externalVerifierSignatureValid,true);
    assert.equal(result.externalVerifierClaimsPadesValid,true);
    assert.equal(result.externalVerifierClaimsPdfTranscriptionMatched,true);
    assert.equal(result.reviewedExchanges,2);
    assert.ok(/^[0-9a-f]{64}$/.test(result.receiptMessageSha256!));
    // The synthetic PDF in this fixture has NO actual PDF signature.
    assert.equal(result.pdfDigitalSignatureVerifiedByThisCode,false);
    assert.equal(result.brokerEcNissuerIndependentlyVerified,false);
  });
  it('wrong pinned verifier, signer certificate, CA, tool build and nonce reject',()=>{
    const s=sample();
    reject(s,'EXTERNAL_VERIFIER_ED25519_RECEIPT_SIGNATURE_MISMATCH',{
      ...pins,verifierPublicKeySpkiDerBase64:pub(outsider)});
    for(const changed of [
      {expectedSignerCertificateSha256:'00'.repeat(32)},
      {expectedIssuerCaCertificateSha256:'11'.repeat(32)},
      {expectedValidatorBuildSha256:'22'.repeat(32)},
      {expectedChallengeHex:'33'.repeat(32)},
      {expectedOriginalPdfSha256:'44'.repeat(32)},
      {expectedUcc:'DIFFERENT_UCC'}
    ]){
      reject(sample(),'EXTERNAL_PDF_VERIFIER_INDEPENDENT_PINS_DO_NOT_MATCH',{
        ...pins,...changed});
    }
  });
  it('receipt false revocation or unsigned document cannot pass even if signed',()=>{
    const a=sample();
    a.externalVerifier.signingCertificateRevocation=
      'UNKNOWN' as 'GOOD_AT_VALIDATION_TIME';
    reject(a,'PDF_VALIDATOR_CLAIMS_NOT_STRICT_SUCCESS');
    const b=sample();
    b.externalVerifier.signedByteCoverage=
      'PARTIAL' as 'ENTIRE_DOCUMENT_NO_UNSIGNED_UPDATES';
    reject(b,'PDF_VALIDATOR_CLAIMS_NOT_STRICT_SUCCESS');
    const c=sample();
    c.externalVerifier.qualifiedTimestamp=
      'NO_TSA' as 'INDEPENDENT_TSA_VALID';
    reject(c,'PDF_VALIDATOR_CLAIMS_NOT_STRICT_SUCCESS');
  });
  it('mutations to PDF, transcript, history or attestation cannot reuse signature',()=>{
    const a=sample();
    a.crossExchange.note.originalPdfBase64=Buffer.from(
      '%PDF-1.7\nCHANGED\n%%EOF\n').toString('base64');
    reject(a,'EXTERNAL_RECEIPT_PDF_HASH_DISAGREES_WITH_ORIGINAL');
    const b=sample();
    b.crossExchange.note.selectedAnnexureRows[0].priceRupees='200.0000';
    reject(b,'EXTERNAL_PDF_TRANSCRIPT_HASH_DISAGREES_WITH_PRIVATE_ROWS');
    const c=sample();
    c.crossExchange.historicalSources[0].openingNetLongQuantity=0;
    reject(c,'EXTERNAL_VERIFIER_ED25519_RECEIPT_SIGNATURE_MISMATCH');
    const d=sample();
    d.externalVerifier.claimedBrokerSignerCertificateSha256='00'.repeat(32);
    reject(d,'EXTERNAL_PDF_VERIFIER_INDEPENDENT_PINS_DO_NOT_MATCH');
  });
  it('valid externally signed claim does NOT override incomplete cross exchange evidence',()=>{
    const s=unsigned();
    s.crossExchange.note.selectedWapSummaryRows[0]
      .weightedAveragePriceRupees='250.50';
    const r=reviewPhase34ExternalPdfEvidence(endorse(s),pins);
    safe(r);
    assert.equal(r.externalVerifierSignatureValid,true);
    assert.equal(r.status,'CROSS_EXCHANGE_FO_REJECTED');
    assert.deepEqual(r.reasons,['CROSS_EXCHANGE_WAP_OR_FO_COVERAGE_BLOCKED']);
  });
  it('stale/reversed time fails; signature fabricated from unpinned key rejected',()=>{
    reject(sample(),'EXTERNAL_PDF_VERIFIER_RECEIPT_STALE_OR_CLOCK_REVERSED',{
      ...pins,verificationAsOf:'2026-11-17T11:00:00.000Z'});
    const s=sample();
    s.externalVerifier.validatorSignatureBase64=sign(null,
      Buffer.from(preparePhase34ExternalVerifierMessage(s).message),
      outsider.privateKey).toString('base64');
    reject(s,'EXTERNAL_VERIFIER_ED25519_RECEIPT_SIGNATURE_MISMATCH');
  });
  it('atomic nonce claims are one use per owner-private durable registry',()=>{
    const dir=mkdtempSync(join(tmpdir(),'phase34-replay-'));
    chmodSync(dir,0o700);
    try{
      const sampleInput=sample();
      const first=verifyAndClaimPhase34ExternalReceiptOnce(
        sampleInput,pins,dir);
      safe(first.report);
      assert.equal(first.nonce.status,
        'CLAIMED_EXTERNAL_RECEIPT_OFFLINE_UNVERIFIED');
      const repeat=verifyAndClaimPhase34ExternalReceiptOnce(
        sampleInput,pins,dir);
      assert.equal(repeat.nonce.status,
        'NONCE_ALREADY_USED_OR_REGISTRY_WRITE_FAILED');
      const wrong=verifyAndClaimPhase34ExternalReceiptOnce(
        sampleInput,{...pins,expectedChallengeHex:'99'.repeat(32)},dir);
      assert.equal(wrong.nonce.status,
        'NOT_ELIGIBLE_FOR_OFFLINE_NONCE_CLAIM');
      chmodSync(dir,0o755);
      const bad=verifyAndClaimPhase34ExternalReceiptOnce(
        sample(),{...pins,expectedChallengeHex:challenge},dir);
      assert.equal(bad.nonce.status,
        'OWNER_PRIVATE_NONCE_REGISTRY_UNAVAILABLE');
    }finally{chmodSync(dir,0o700);
      rmSync(dir,{recursive:true,force:true});}
  });
});
