import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  auditPhase62NativeCsvDualReceipts,
  phase62SignedMessage,
  type Phase62Report
} from '../../server/engine/ema15m/adaptivePhase62NativeCsvDualReceipts.js';
import {makePhase62SyntheticDualSourceFixture}
  from './phase62_synthetic_native_csv_dual_receipt_fixture.js';
const SHA=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const fixture=makePhase62SyntheticDualSourceFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase62NativeCsvDualReceipts(f.input,f.pins);
function notProduction(r:Phase62Report){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.nativeExchangeOrVendorExportAuthenticated,false);
  assert.equal(r.independentPublisherIdentityVerified,false);
  assert.equal(r.independentWitnessIdentityVerified,false);
  assert.equal(r.independentSourceCaptureClockVerified,false);
  assert.equal(r.independentlyLicensedHistoricalFnoL1Verified,false);
  assert.equal(r.officialContractExpiryAndSessionMasterVerified,false);
  assert.equal(r.untouchedOosStrategyProfitabilityProven,false);
  assert.equal(r.ivThetaVegaCalibratedWithLicensedData,false);
  assert.equal(r.originalNativeBrokerNrmlStopAckVerified,false);
  assert.equal(r.bestContractExpiryRecommendationAuthorized,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('BEGIN PRIVATE KEY'));
}
function rejected(f:F,reason:string,
 status:Phase62Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);notProduction(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
const updateCsv=(f:F,csv:string)=>{
  f.input.originalNativeCsvBase64=Buffer.from(csv,'utf8').toString('base64');
  f.input.signedManifest.originalCsvSha256=
    SHA(Buffer.from(csv,'utf8'));
};
describe('Phase62 genuine Ed25519 crypto + native-format CSV original OOS evidence',()=>{
  it('TWO real mathematically signed but FAKE self-generated keys reconcile entire Phase61 source, with no licence or live order proof',()=>{
    const f=fixture(),r=audit(f);notProduction(r);
    assert.equal(r.status,
      'DESCRIPTIVE_TWO_CLAIMED_ED25519_SIGNATURES_AND_NATIVE_CSV_CONSISTENT_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.phase61Status,
      'DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY');
    assert.equal(r.publisherAndWitnessKeysDistinct,true);
    assert.equal(r.publisherEd25519SignatureMathematicallyValid,true);
    assert.equal(r.witnessEd25519SignatureMathematicallyValid,true);
    assert.equal(r.claimedPublisherWitnessTimeOrderInternallyConsistent,true);
    assert.equal(r.nativeCsvQuoteRows,f.phase61.history.executionQuotes.length);
    assert.equal(r.rowsMatchingOriginalPhase61CustodyAndPhase50,
      r.nativeCsvQuoteRows);
    assert.ok(r.distinctSourceInstruments>0);
  });
  it('native archive bytes changed without independent CSV pin reject despite intact original L1',()=>{
    const f=fixture(),raw=Buffer.from(f.input.originalNativeCsvBase64,'base64');
    raw[35]^=1;
    f.input.originalNativeCsvBase64=raw.toString('base64');
    rejected(f,'PHASE62_RAW_CSV_PUBLIC_KEYS_OR_DETACHED_SIGNATURE_PINS_DISAGREE',
      'INVALID_EVIDENCE');
  });
  it('operator regenerating two genuine signatures and independent pins for altered option BID still fails Phase61 row reconciliation',()=>{
    const f=fixture(),csv=Buffer.from(
      f.input.originalNativeCsvBase64,'base64').toString('utf8');
    const changed=csv.replace(/,99,100,/,',98,100,');
    assert.notEqual(changed,csv);
    updateCsv(f,changed);f.reSignAndRepin();
    const r=rejected(f,
      'PHASE62_NATIVE_VENDOR_CSV_ROW_DIFFERS_FROM_ORIGINAL_OOS_L1');
    assert.ok(r.rowsMatchingOriginalPhase61CustodyAndPhase50<
      f.phase61.history.executionQuotes.length);
  });
  it('publisher proof cannot be substituted as independent witness proof',()=>{
    const f=fixture();
    f.input.witnessDetachedSignatureBase64=
      f.input.publisherDetachedSignatureBase64;
    f.rePin();
    rejected(f,'PHASE62_DETACHED_ORIGINAL_SOURCE_OR_WITNESS_SIGNATURE_INVALID',
      'INVALID_EVIDENCE');
  });
  it('same Ed25519 SPKI key in both roles cannot satisfy independent-key gate even when hashes are repinned',()=>{
    const f=fixture();
    f.input.witnessEd25519PublicKeySpkiDerBase64=
      f.input.publisherEd25519PublicKeySpkiDerBase64;
    f.rePin();
    rejected(f,'PHASE62_CLAIMED_SOURCE_AND_WITNESS_MUST_HAVE_DIFFERENT_KEYS',
      'INVALID_EVIDENCE');
  });
  it('publisher signature bitflip is detected even if operator updates signature SHA pin',()=>{
    const f=fixture(),sig=Buffer.from(
      f.input.publisherDetachedSignatureBase64,'base64');
    sig[4]^=64;
    f.input.publisherDetachedSignatureBase64=sig.toString('base64');
    f.rePin();
    rejected(f,'PHASE62_DETACHED_ORIGINAL_SOURCE_OR_WITNESS_SIGNATURE_INVALID',
      'INVALID_EVIDENCE');
  });
  it('signed but changed source event time cannot replace original Phase61/Phase50 archive',()=>{
    const f=fixture(),csv=Buffer.from(
      f.input.originalNativeCsvBase64,'base64').toString('utf8');
    const token=f.phase61.history.executionQuotes[0].observedAt;
    assert.ok(csv.includes(token));
    updateCsv(f,csv.replace(token,'2026-01-01T00:00:00.000Z'));
    f.reSignAndRepin();
    rejected(f,'PHASE62_NATIVE_VENDOR_CSV_ROW_DIFFERS_FROM_ORIGINAL_OOS_L1');
  });
  it('lost native row never silently reduces complete OOS selected quote denominator',()=>{
    const f=fixture(),lines=Buffer.from(
      f.input.originalNativeCsvBase64,'base64').toString('utf8')
      .trimEnd().split('\n');
    updateCsv(f,lines.slice(0,-1).join('\n')+'\n');
    f.reSignAndRepin();
    rejected(f,'PHASE62_ORIGINAL_VENDOR_NATIVE_CSV_COLUMNS_OR_DENOMINATOR_INVALID');
  });
  it('signed manifest changed to omit Phase61 contract/archive bytes cannot silently preserve original evidence',()=>{
    const f=fixture();
    f.input.signedManifest.phase61ContractCatalogSha256='ac'.repeat(32);
    f.reSignAndRepin();
    rejected(f,'PHASE62_SIGNED_MANIFEST_NOT_BOUND_TO_ALL_PHASE61_ARCHIVES');
  });
  it('operator controls both claimed keypairs and can sign later dates, proving no vendor identity or trusted historical receipt clock',()=>{
    const f=fixture();
    const pub=Date.parse(f.input.signedManifest.publisherClaimedSignedAt);
    f.input.signedManifest.publisherClaimedSignedAt=
      new Date(pub+30*60000).toISOString();
    f.input.signedManifest.witnessClaimedReceivedAt=
      new Date(pub+45*60000).toISOString();
    f.reSignAndRepin();
    const r=audit(f);notProduction(r);
    assert.equal(r.status,
      'DESCRIPTIVE_TWO_CLAIMED_ED25519_SIGNATURES_AND_NATIVE_CSV_CONSISTENT_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.independentSourceCaptureClockVerified,false);
    assert.equal(r.independentPublisherIdentityVerified,false);
  });
  it('self-claimed witness receipt earlier than signed source time cannot pass even with two new valid signatures',()=>{
    const f=fixture();
    f.input.signedManifest.witnessClaimedReceivedAt=
      new Date(Date.parse(f.input.signedManifest.publisherClaimedSignedAt)-
        60000).toISOString();
    f.reSignAndRepin();
    rejected(f,'PHASE62_SELF_DECLARED_SIGNATURE_RECEIPT_CLOCK_INCOHERENT',
      'INVALID_EVIDENCE');
  });
  it('witness receipt outside independently pinned maximum lag cannot be relabeled timely',()=>{
    const f=fixture();
    f.input.signedManifest.witnessClaimedReceivedAt=
      new Date(Date.parse(f.input.signedManifest.publisherClaimedSignedAt)+
        5*3600000).toISOString();
    f.reSignAndRepin();
    rejected(f,'PHASE62_SELF_DECLARED_SIGNATURE_RECEIPT_CLOCK_INCOHERENT',
      'INVALID_EVIDENCE');
  });
  it('changing original OOS fold day even after nesting pins cannot pass the Phase61 audit',()=>{
    const f=fixture(),h=f.phase61.history;
    const missing=h.policy.folds[1].testStart;
    h.decisions=h.decisions.filter(d=>d.sessionDate!==missing);
    h.provenance.expectedSessions=
      h.provenance.expectedSessions.filter(d=>d!==missing);
    f.rePinAllNested();
    rejected(f,'PHASE61_ORIGINAL_SOURCE_OOS_OR_CUSTODY_NOT_COMPLETE');
  });
  it('quoted source-vendor CSV is still only an operator-supplied native format, not authenticated feed',()=>{
    const f=fixture(),r=audit(f);notProduction(r);
    assert.equal(r.nativeExchangeOrVendorExportAuthenticated,false);
    assert.ok(r.warnings.includes(
      'PHASE22_NATIVE_FORMAT_CSV_CAN_BE_BACKFILLED_FROM_PHASE61_JSONL'));
    assert.equal(phase62SignedMessage(
      'PUBLISHER',f.input.signedManifest).equals(
      phase62SignedMessage('RECEIPT_WITNESS',
        f.input.signedManifest)),false);
  });
});
