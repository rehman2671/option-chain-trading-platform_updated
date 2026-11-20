import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase63OriginalCaptureReceiptChain,
  type Phase63Report,phase63BuildClaimedReceiptLedger,
  hashPhase63Evidence
} from '../../server/engine/ema15m/adaptivePhase63CaptureReceiptChain.js';
import {makePhase63SyntheticCaptureFixture}
  from './phase63_synthetic_capture_receipt_fixture.js';

const fixture=makePhase63SyntheticCaptureFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase63OriginalCaptureReceiptChain(
  f.input,f.pins);
function untrusted(r:Phase63Report){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.contemporaneousReceiptClockIndependentlyAuthenticated,false);
  assert.equal(r.independentCollectorIdentityVerified,false);
  assert.equal(r.independentPublisherVendorIdentityVerified,false);
  assert.equal(r.independentlyLicensedHistoricalOptionL1Verified,false);
  assert.equal(r.originalNativeExchangeTransportAuthenticated,false);
  assert.equal(r.officialOptionContractExpirySessionCalendarVerified,false);
  assert.equal(r.independentlyTrustedReceiptTimeAuthorityVerified,false);
  assert.equal(r.originalMultiRegimeOosProfitableTradingProven,false);
  assert.equal(r.ivThetaOvernightGapCalibrationVerified,false);
  assert.equal(r.brokerNrmlNativeStopGttOvernightAcknowledged,false);
  assert.equal(r.historicalBestContractRankingAuthorized,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('BEGIN PRIVATE KEY'));
}
function fails(f:F,reason:string,
  status:Phase63Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);untrusted(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase63 exact original quote claimed-receipt chain and third untrusted Ed25519 signer',()=>{
  it('all original two-fold OOS L1 receipts, complete hash-chain and third genuine signature remain descriptive ONLY',()=>{
    const f=fixture(),r=audit(f);untrusted(r);
    assert.equal(r.status,
      'DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY',
      JSON.stringify(r));
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.phase62Status,
      'DESCRIPTIVE_TWO_CLAIMED_ED25519_SIGNATURES_AND_NATIVE_CSV_CONSISTENT_UNVERIFIED');
    assert.equal(r.originalNativeQuoteRows,
      f.parent.phase61.history.executionQuotes.length);
    assert.equal(r.chainedOriginalSourceQuoteReceipts,
      r.originalNativeQuoteRows);
    assert.equal(r.matchedOriginalQuotesAndClaimedAvailableAtReceipts,
      r.originalNativeQuoteRows);
    assert.ok(r.originalInstrumentCount>0);
    assert.equal(r.collectorKeyDistinctFromClaimedPublisherAndWitness,true);
    assert.equal(r.collectorEd25519SignatureMathematicallyValid,true);
    assert.equal(r.allOriginalReceiptHashesLinked,true);
    assert.equal(r.claimedStrategyReceiveTimeInternallyConsistent,true);
    assert.ok(r.reasonCodes.includes(
      'THIRD_OPERATOR_SIGNED_CHAIN_NOT_PROOF_OF_INDEPENDENT_RECEIPT_CLOCK'));
  });
  it('claimed strategy receipt is required to equal ORIGINAL Phase61/Phase50 availableAt, even after operator re-signs ledger',()=>{
    const f=fixture();
    const r=f.ledger.receipts[5];
    r.claimedStrategyReceivedAt=
      new Date(Date.parse(r.claimedStrategyReceivedAt)+60000).toISOString();
    f.replaceLedger(f.ledger);f.refreshSeal();f.signAndRepin();
    fails(f,'PHASE63_CLAIMED_CAPTURE_RECEIPT_DIFFERS_FROM_ORIGINAL_L1');
  });
  it('source option quote BID/ASK/full record digest cannot be quietly altered',()=>{
    const f=fixture();
    f.ledger.receipts[7].originalFullQuoteRecordSha256='a3'.repeat(32);
    f.replaceLedger(f.ledger);f.refreshSeal();f.signAndRepin();
    fails(f,'PHASE63_CLAIMED_CAPTURE_RECEIPT_DIFFERS_FROM_ORIGINAL_L1');
  });
  it('complete hash chain rejects reordered previous digest after even fresh third signature',()=>{
    const f=fixture();
    f.ledger.receipts[8].previousReceiptLinkSha256='a3'.repeat(32);
    f.replaceLedger(f.ledger);f.refreshSeal();f.signAndRepin();
    fails(f,'PHASE63_COMPLETE_ORIGINAL_RECEIPT_HASH_CHAIN_BROKEN');
  });
  it('dropped LAST original receipt is incomplete, not a harmless missing price or zero PnL',()=>{
    const f=fixture();
    f.ledger.receipts.pop();
    f.replaceLedger(f.ledger);f.refreshSeal();f.signAndRepin();
    fails(f,'PHASE63_COMPLETE_ORIGINAL_RECEIPT_COUNT_OR_SEED_INVALID');
  });
  it('duplicate original source ordinal cannot collapse OOS L1 denominator',()=>{
    const f=fixture();
    f.ledger.receipts[6].ordinal=6;
    f.replaceLedger(f.ledger);f.refreshSeal();f.signAndRepin();
    fails(f,'PHASE63_CLAIMED_CAPTURE_RECEIPT_DIFFERS_FROM_ORIGINAL_L1');
  });
  it('collector key same as claimed publisher gets rejected even with new matching key fingerprint',()=>{
    const f=fixture();
    f.input.collectorEd25519PublicSpkiDerBase64=
      f.input.phase62.publisherEd25519PublicKeySpkiDerBase64;
    f.repin();
    fails(f,'PHASE63_COLLECTOR_KEY_NOT_DISTINCT_FROM_SOURCE_WITNESS',
      'INVALID_EVIDENCE');
  });
  it('collector signature bit-flip rejected even if operator updates its independent hash pin',()=>{
    const f=fixture(),sig=Buffer.from(
      f.input.collectorDetachedSignatureBase64,'base64');
    sig[13]^=32;
    f.input.collectorDetachedSignatureBase64=sig.toString('base64');
    f.repin();
    fails(f,'PHASE63_COLLECTOR_SIGNATURE_NOT_VALID_FOR_EXACT_SOURCE',
      'INVALID_EVIDENCE');
  });
  it('altering source manifest while correctly re-signing collector cannot unbind a previously signed quote corpus',()=>{
    const f=fixture();
    f.input.captureSeal.signedPhase62ManifestSha256=
      'a1'.repeat(32);
    f.signAndRepin();
    fails(f,'PHASE63_COLLECTOR_SEAL_NOT_BOUND_TO_PHASE62_MANIFEST_CSV');
  });
  it('valid operator signatures can be issued later and never become an independent original timestamp',()=>{
    const f=fixture();
    f.input.captureSeal.collectorClaimedSignedAt=
      new Date(Date.parse(f.input.captureSeal.collectorClaimedSignedAt)+
        90*60000).toISOString();
    f.signAndRepin();
    const r=audit(f);untrusted(r);
    assert.equal(r.status,
      'DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY',
      JSON.stringify(r));
    assert.equal(r.independentlyTrustedReceiptTimeAuthorityVerified,false);
  });
  it('collector seal timestamp earlier than L1 claimed receipt end cannot be accepted as at-time proof',()=>{
    const f=fixture();
    f.input.captureSeal.collectorClaimedSignedAt='2020-01-01T00:00:00.000Z';
    f.signAndRepin();
    fails(f,'PHASE63_INDEPENDENT_FINAL_CHAIN_ROOT_OR_SEAL_TIME_MISMATCH');
  });
  it('changed independent seeded root without independent source pins fails',()=>{
    const f=fixture();
    f.pins.expectedInitialReceiptSeedSha256='ab'.repeat(32);
    fails(f,'PHASE63_COLLECTOR_SEAL_OR_INDEPENDENT_ROOT_INVALID',
      'INVALID_EVIDENCE');
  });
  it('changed original OOS trading day after re-pinning outer Phase62 cannot become valid source history',()=>{
    const f=fixture(),h=f.parent.phase61.history;
    const missing=h.policy.folds[1].testStart;
    h.decisions=h.decisions.filter(d=>d.sessionDate!==missing);
    h.provenance.expectedSessions=h.provenance.expectedSessions.filter(
      d=>d!==missing);
    f.repinAllNested();
    fails(f,'PHASE62_ORIGINAL_NATIVE_CSV_SOURCE_REAUDIT_INCOMPLETE');
  });
  it('synthetic observed option premium reversals and overnight gaps remain untrusted even with complete capture links',()=>{
    for(const variant of ['GIVEBACK','GAP'] as const){
      const f=fixture(variant),r=audit(f);untrusted(r);
      assert.equal(r.status,
        'DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY',
        JSON.stringify(r));
      assert.equal(r.historicalBestContractRankingAuthorized,false);
    }
  });
  it('recomputed claimed chain source can be constructed entirely by the operator, never evidence of genuine clock or licensing',()=>{
    const f=fixture();
    const rebuilt=phase63BuildClaimedReceiptLedger(
      f.parent.phase61.rows(),f.pins.expectedInitialReceiptSeedSha256);
    assert.equal(hashPhase63Evidence(rebuilt),
      hashPhase63Evidence(f.ledger));
    const r=audit(f);untrusted(r);
    assert.equal(r.independentlyLicensedHistoricalOptionL1Verified,false);
  });
});
