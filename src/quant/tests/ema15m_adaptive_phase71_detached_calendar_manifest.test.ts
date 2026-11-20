import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {
  auditPhase71DetachedIssuerCalendarManifest,type Phase71Report
} from '../../server/engine/ema15m/adaptivePhase71DetachedCalendarManifest.js';
import {makePhase71SyntheticCandidateSignedFixture}
  from './phase71_synthetic_ed25519_calendar_fixture.js';

type F=ReturnType<typeof makePhase71SyntheticCandidateSignedFixture>;
const fixture=makePhase71SyntheticCandidateSignedFixture;
const audit=(f:F)=>auditPhase71DetachedIssuerCalendarManifest(f.input,f.pins);
function noIssuerOrTrade(r:Phase71Report){
  assert.equal(r.independentExchangeIssuerKeyTrustAnchorEstablished,false);
  assert.equal(r.claimedSignerSelfSignedTestIsNotExchangeSignature,true);
  assert.equal(r.signedClaimedTimeIsNotIndependentTrustedTimestamp,true);
  assert.equal(r.independentlyVerifiedOriginalExchangeCalendar,false);
  assert.equal(r.independentlyVerifiedVendorHistoricalOptionL1License,false);
  assert.equal(r.historicallyTrustedClientStrategyAvailableAt,false);
  assert.equal(r.originalOptionBidAskQuoteIsActualExecutionFill,false);
  assert.equal(r.originalNoEntryBecomesActualPosition,false);
  assert.equal(r.independentlyProvenMultiregimeProfitableStrategy,false);
  assert.equal(r.independentlyCalibratedIvThetaSpreadAndOvernightRisk,false);
  assert.equal(r.entirePaidLongOptionPremiumDebitLossEliminated,false);
  assert.equal(r.bestOneToEightWeekExpiryAuthorized,false);
  assert.equal(r.brokerNativeNrmlGttStopChildExchangeAckVerified,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD_'));
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
  assert.ok(!JSON.stringify(r).includes('MII'));
}
function rejects(f:F,reason:string,
  status:Phase71Report['status']='INVALID_EVIDENCE'){
  const r=audit(f);noIssuerOrTrade(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase71 detached Ed25519 candidate holiday archive source integrity only',()=>{
  it('cryptographically verifies original manifest bytes, exact source SHA and OOS pins while NEVER authenticating real issuer',()=>{
    const f=fixture(),r=audit(f);noIssuerOrTrade(r);
    assert.equal(r.status,
      'DESCRIPTIVE_CRYPTO_CONSISTENT_UNTRUSTED_ISSUER_ONLY',JSON.stringify(r));
    assert.equal(r.parentPhase70Status,
      'DESCRIPTIVE_CLAIMED_CLOSED_DAY_EXCEPTIONS_UNVERIFIED_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.candidatePublicKeyDerShapeValid,true);
    assert.equal(r.candidateDetachedEd25519SignatureCryptographicallyValid,true);
    assert.equal(r.signedManifestExactOriginalCalendarHashMatched,true);
    assert.equal(r.signedManifestBindsExactPhase70InputsAndPins,true);
    assert.equal(r.claimedManifestChronologyStructurallyCausal,true);
    assert.equal(r.originalOosDecisions,4);
    assert.equal(r.originalNoEntryDays,2);
    assert.equal(r.originallyListedCePePairs,32);
    assert.ok(r.originalArchiveCalendarDays>100);
  });
  it('a software-generated LOCAL Ed25519 key signing a fabricated third exchange archive is NOT official NSE/BSE identity',()=>{
    const r=audit(fixture());noIssuerOrTrade(r);
    assert.equal(r.independentExchangeIssuerKeyTrustAnchorEstablished,false);
    assert.ok(r.externalRequirements.some(x=>
      x.includes('AUTHENTICATED_EXCHANGE_ISSUER_PUBLIC_KEY')));
  });
  it('raw claimed day-archive tampering fails source hash even if owner republishes all independent SHA pins',()=>{
    const f=fixture();
    f.parent.archive.days.find(x=>x.sessionDate==='2026-03-02')!
      .status='EMERGENCY_CLOSED';
    f.parent.updateArchive();f.parent.repin();f.repin();
    const r=rejects(f,
      'PHASE71_SIGNED_MANIFEST_DOES_NOT_BIND_EXACT_DAY_ARCHIVE',
      'INCOMPLETE_EVIDENCE');
    assert.equal(r.candidateDetachedEd25519SignatureCryptographicallyValid,true);
    assert.equal(r.signedManifestExactOriginalCalendarHashMatched,false);
  });
  it('altered manifest raw bytes after detached signing and operator rehash fail cryptographic verification',()=>{
    const f=fixture();
    const m=Buffer.from(f.input.claimedSignedManifestRawBase64,'base64');
    m[m.length-3]^=1;
    f.input.claimedSignedManifestRawBase64=m.toString('base64');
    f.repin();
    rejects(f,'PHASE71_DETACHED_MANIFEST_SIGNATURE_NOT_CRYPTOGRAPHICALLY_VALID');
  });
  it('changed valid-looking 64-byte Ed25519 signature repinned locally fails verifier, not silently ignored',()=>{
    const f=fixture();
    const s=Buffer.from(f.input.claimedDetachedSignatureBase64,'base64');
    s[20]^=2;
    f.input.claimedDetachedSignatureBase64=s.toString('base64');
    f.repin();
    rejects(f,'PHASE71_DETACHED_MANIFEST_SIGNATURE_NOT_CRYPTOGRAPHICALLY_VALID');
  });
  it('substitute different key pair with fresh owner SPKI hash still invalidates original manifest signature',()=>{
    const f=fixture();
    const alternate=generateKeyPairSync('ed25519');
    f.input.candidateSignerPublicSpkiDerBase64=(
      alternate.publicKey.export({format:'der',type:'spki'}) as Buffer)
      .toString('base64');
    f.repin();
    rejects(f,'PHASE71_DETACHED_MANIFEST_SIGNATURE_NOT_CRYPTOGRAPHICALLY_VALID');
  });
  it('candidate public key must be strict 44-byte DER Ed25519 SPKI, not a modified PEM/RSA or arbitrary byte string',()=>{
    const f=fixture();
    const der=Buffer.from(f.input.candidateSignerPublicSpkiDerBase64,'base64');
    der[5]^=4;
    f.input.candidateSignerPublicSpkiDerBase64=der.toString('base64');
    f.repin();
    rejects(f,'PHASE71_CANDIDATE_ED25519_SPKI_OR_SIGNATURE_SHAPE_INVALID');
  });
  it('self-signing a fake manifest with wrong original archive hash is not a source binding',()=>{
    const f=fixture();
    f.manifest.archiveRawSha256='1'.repeat(64);
    f.signManifest();f.repin();
    rejects(f,'PHASE71_SIGNED_MANIFEST_DOES_NOT_BIND_EXACT_DAY_ARCHIVE',
      'INCOMPLETE_EVIDENCE');
  });
  it('fully resigned manifest replayed against different original OOS source cohort is rejected',()=>{
    const f=fixture();
    f.manifest.phase70InputSha256='2'.repeat(64);
    f.signManifest();f.repin();
    rejects(f,'PHASE71_SIGNED_MANIFEST_REPLAYS_OTHER_OOS_PARENT_SOURCE',
      'INCOMPLETE_EVIDENCE');
  });
  it('signature claimed created only AFTER original OOS decisions cannot be used as contemporaneous source proof',()=>{
    const f=fixture();
    f.manifest.claimedSignedAt='2026-05-05T00:00:00.000Z';
    f.signManifest();f.repin();
    rejects(f,'PHASE71_SIGNED_CLAIMED_TIME_KEY_WINDOW_OR_OOS_ASOF_NONCAUSAL',
      'INCOMPLETE_EVIDENCE');
  });
  it('claimed signed time before key not-before is noncausal even when private test key signs it',()=>{
    const f=fixture();
    f.manifest.claimedSignerKeyEffectiveFrom='2026-01-01T00:00:00.000Z';
    f.signManifest();f.repin();
    rejects(f,'PHASE71_SIGNED_CLAIMED_TIME_KEY_WINDOW_OR_OOS_ASOF_NONCAUSAL',
      'INCOMPLETE_EVIDENCE');
  });
  it('purpose/audience must be limited to nonexecuting calendar distribution, not authorization to place orders',()=>{
    const f=fixture();
    (f.manifest as {audience:string}).audience='BROKER_LIVE_ORDER_AUTHORITY';
    f.signManifest();f.repin();
    rejects(f,'PHASE71_DETACHED_MANIFEST_OR_SOURCE_IDENTITY_WRONG');
  });
  it('a manifest for a different claimed issuer cannot be substituted by self-repinning just the public key and signed manifest',()=>{
    const f=fixture();
    f.manifest.claimedIssuerReference='OWNER_CHANGED_TO_FAKE_EXCHANGE';
    f.pins.expectedClaimedIssuerReference=f.manifest.claimedIssuerReference;
    f.signManifest();f.repin();
    rejects(f,'PHASE71_DETACHED_MANIFEST_OR_SOURCE_IDENTITY_WRONG');
  });
  it('truncating a signed original day archive and fully resigning fake files remains invalid under parent original full OOS denominator',()=>{
    const f=fixture();
    f.parent.archive.days.splice(10,1);
    f.rebindOriginalAndResign();
    rejects(f,'PHASE71_ORIGINAL_FULL_OOS_ARCHIVE_SOURCE_DENOMINATORS_CHANGED',
      'INCOMPLETE_EVIDENCE');
  });
  it('independent no-entry count cannot be shrunk to turn original unentered options into fictitious positions',()=>{
    const f=fixture();
    f.pins.expectedOriginalNoEntryDays=1;
    rejects(f,'PHASE71_ORIGINAL_FULL_OOS_ARCHIVE_SOURCE_DENOMINATORS_CHANGED',
      'INCOMPLETE_EVIDENCE');
  });
  it('mutated source candidate signing key SHA pin cannot bypass pinned raw DER check',()=>{
    const f=fixture();
    f.pins.expectedCandidateSignerSpkiDerSha256='0'.repeat(64);
    rejects(f,'PHASE71_SIGNED_ORIGINAL_BYTES_OR_KEY_NOT_INDEPENDENTLY_PINNED');
  });
  it('owner can RE-SIGN an internally consistent invented closure with FAKE key and remain descriptive, never authentic issuer proof',()=>{
    const f=fixture();
    f.parent.archive.days.find(x=>x.sessionDate==='2026-03-02')!
      .status='EMERGENCY_CLOSED';
    f.rebindOriginalAndResign();
    const r=audit(f);noIssuerOrTrade(r);
    assert.equal(r.status,
      'DESCRIPTIVE_CRYPTO_CONSISTENT_UNTRUSTED_ISSUER_ONLY',JSON.stringify(r));
    assert.equal(r.independentlyVerifiedOriginalExchangeCalendar,false);
    assert.equal(r.genuineHistoricalOptionDataLicenseVerified,undefined);
  });
  it('a self-signed document cannot make an original L1 BID executable or eliminate 100 percent long-option paid debit loss',()=>{
    const r=audit(fixture());noIssuerOrTrade(r);
    assert.equal(r.originalOptionBidAskQuoteIsActualExecutionFill,false);
    assert.equal(r.entirePaidLongOptionPremiumDebitLossEliminated,false);
    assert.equal(r.brokerNativeNrmlGttStopChildExchangeAckVerified,false);
  });
});
