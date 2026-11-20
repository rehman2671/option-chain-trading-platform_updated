import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase72CandidateIssuerKeyLifecycle,type Phase72Report
} from '../../server/engine/ema15m/adaptivePhase72IssuerKeyLifecycle.js';
import {
  makePhase72SyntheticKeyLifecycleFixture
} from './phase72_synthetic_registrar_witness_fixture.js';

const fixture=makePhase72SyntheticKeyLifecycleFixture;
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase72CandidateIssuerKeyLifecycle(f.input,f.pins);
function noRealAuthorityOrTrades(r:Phase72Report){
  assert.equal(r.candidateRegistrarRosterIsOfficial,false);
  assert.equal(r.candidateWitnessIndependentlyAuthenticated,false);
  assert.equal(r.candidateIssuerPublicKeyOfficiallyTrusted,false);
  assert.equal(r.historicalKeyRevocationIndependentlyVerified,false);
  assert.equal(r.actualIndependentPublicationClockVerified,false);
  assert.equal(r.officialExchangeHolidaysAndContractExpiryVerified,false);
  assert.equal(r.legalOptionHistoricalL1DataLicenseVerified,false);
  assert.equal(r.actualOriginalSourceClientAvailableAtTrusted,false);
  assert.equal(r.originalBidAskAreExecutableBrokerFills,false);
  assert.equal(r.unenteredListedOptionBecomesRealPosition,false);
  assert.equal(r.marketRegimeOosProfitabilityProven,false);
  assert.equal(r.ivThetaAndOvernightGapDebitLossCalibrated,false);
  assert.equal(r.wholeLongOptionPaidPremiumDebitProtected,false);
  assert.equal(r.recommendedOneToEightWeekHorizonAuthorized,false);
  assert.equal(r.brokerNativeNrmlGttStopChildExchangeAckVerified,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.ok(!JSON.stringify(r).includes('MOCK_L1_RECORD'));
  assert.ok(!JSON.stringify(r).includes('VENDOR_CANDIDATE_'));
}
function rejected(f:F,reason:string,
  status:Phase72Report['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);noRealAuthorityOrTrades(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase72 original OOS issuer key rotation and registrar/witness signatures without trust',()=>{
  it('candidate three-role Ed25519 cryptography and historical OOS archive lifecycle agree but no exchange key is authenticated',()=>{
    const f=fixture(),r=audit(f);noRealAuthorityOrTrades(r);
    assert.equal(r.status,
      'DESCRIPTIVE_THREE_ROLE_CRYPTO_CONSISTENCY_UNTRUSTED_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase71Status,
      'DESCRIPTIVE_CRYPTO_CONSISTENT_UNTRUSTED_ISSUER_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisions,4);
    assert.equal(r.originalNoEntryDays,2);
    assert.equal(r.originalListedCePePairs,32);
    assert.ok(r.originalArchiveCalendarDays>100);
    assert.equal(r.candidateRegistrarSignatureMathematicallyValid,true);
    assert.equal(r.candidateWitnessSignatureMathematicallyValid,true);
    assert.equal(r.candidateIssuerRegistrarWitnessKeysPairwiseDistinct,true);
    assert.equal(r.candidateIssuerKeyPresentActiveAtClaimedSigningTime,true);
    assert.equal(r.candidateRosterHasNonOverlappingActiveKeyWindows,true);
    assert.equal(r.candidateWitnessReceiptBindingsAndClaimedClockConsistent,
      true);
  });
  it('self-created three DIFFERENT role signing keys still do not authenticate official issuer, registrar or witness',()=>{
    const r=audit(fixture());noRealAuthorityOrTrades(r);
    assert.equal(r.candidateIssuerPublicKeyOfficiallyTrusted,false);
    assert.equal(r.candidateWitnessIndependentlyAuthenticated,false);
    assert.ok(r.externalEvidenceRequired.some(x=>
      x.includes('INDEPENDENT_OFFICIAL_EXCHANGE_ISSUER_KEY')));
  });
  it('mutating the raw key roster with re-pinned hash but old detached registrar signature fails cryptography',()=>{
    const f=fixture();
    f.roster.keys[0].effectiveThrough='2026-11-30T00:00:00.000Z';
    f.input.candidateRegistrarRosterRawBase64=Buffer.from(
      JSON.stringify(f.roster)).toString('base64');
    f.repin();
    rejected(f,'PHASE72_CANDIDATE_REGISTRAR_ED25519_SIGNATURE_INVALID',
      'INVALID_EVIDENCE');
  });
  it('tampering detached 64-byte witness signature and locally re-pinning cannot forge a receipt',()=>{
    const f=fixture();
    const b=Buffer.from(f.input.candidateWitnessDetachedSignatureBase64,
      'base64');b[15]^=8;
    f.input.candidateWitnessDetachedSignatureBase64=b.toString('base64');
    f.repin();
    rejected(f,'PHASE72_CANDIDATE_WITNESS_ED25519_SIGNATURE_INVALID',
      'INVALID_EVIDENCE');
  });
  it('a REGISTRAR-claimed REVOKED source signing key fails even when fake registrar re-signs its roster',()=>{
    const f=fixture();
    f.roster.keys[0].status='REVOKED';
    f.roster.keys[0].claimedRevokedAt='2025-11-30T00:00:00.000Z';
    f.resignAll();
    rejected(f,'PHASE72_SIGNING_ISSUER_KEY_ABSENT_INACTIVE_OR_REVOKED');
  });
  it('a source signing key marked SUSPENDED cannot be used for original OOS even with valid signature',()=>{
    const f=fixture();
    f.roster.keys[0].status='SUSPENDED';
    f.resignAll();
    rejected(f,'PHASE72_SIGNING_ISSUER_KEY_ABSENT_INACTIVE_OR_REVOKED');
  });
  it('ACTIVE source key with a separately asserted revocation instant is internally inconsistent and cannot bypass lifecycle gate',()=>{
    const f=fixture();
    f.roster.keys[0].claimedRevokedAt='2025-11-20T00:00:00.000Z';
    f.resignAll();
    rejected(f,'PHASE72_ROSTER_DUPLICATE_INVALID_KEY_EPOCH_OR_REVOCATION');
  });
  it('overlapping ACTIVE key epochs in the same roster are ambiguous even if the right signer key remains present',()=>{
    const f=fixture();
    f.roster.keys.push({
      ...f.roster.keys[0],claimedKeyId:'MOCK_SECOND_OVERLAPPING_KEY',
      spkiDerSha256:'f'.repeat(64)
    });
    f.resignAll();
    rejected(f,'PHASE72_ACTIVE_KEY_EPOCHS_OVERLAP_AMBIGUOUS_ROTATION');
  });
  it('nonoverlapping FUTURE key rotation epoch is only software-consistent, never independently issuer-authenticated',()=>{
    const f=fixture();
    f.roster.keys.push({
      ...f.roster.keys[0],
      claimedKeyId:'MOCK_FUTURE_ROTATED_KEY',
      spkiDerSha256:'f'.repeat(64),
      effectiveFrom:'2027-01-01T00:00:00.000Z',
      effectiveThrough:'2027-12-31T23:59:59.000Z'
    });
    f.resignAll();
    const r=audit(f);noRealAuthorityOrTrades(r);
    assert.equal(r.status,
      'DESCRIPTIVE_THREE_ROLE_CRYPTO_CONSISTENCY_UNTRUSTED_ONLY',
      JSON.stringify(r));
    assert.equal(r.candidateRosterHasNonOverlappingActiveKeyWindows,true);
    assert.equal(r.candidateIssuerPublicKeyOfficiallyTrusted,false);
  });
  it('registrar cannot reassign same issuer key ID to a different public key without failing issuer roster binding',()=>{
    const f=fixture();
    f.roster.keys[0].spkiDerSha256='c'.repeat(64);
    f.resignAll();
    rejected(f,'PHASE72_REGISTRAR_KEY_ID_SPKI_REBOUND_TO_OTHER_SIGNER');
  });
  it('duplicated original signing key identifier with separate epoch cannot silently make an ambiguous rotation authoritative',()=>{
    const f=fixture();
    f.roster.keys.push({
      ...f.roster.keys[0],effectiveFrom:'2027-01-01T00:00:00.000Z',
      effectiveThrough:'2027-12-01T00:00:00.000Z'
    });
    f.resignAll();
    rejected(f,'PHASE72_ROSTER_DUPLICATE_INVALID_KEY_EPOCH_OR_REVOCATION');
  });
  it('an owner-signed witness claiming receipt AFTER first original OOS decision cannot prove contemporaneous knowledge',()=>{
    const f=fixture();
    f.receipt.claimedObservedAt='2026-04-01T00:00:00.000Z';
    f.signWitness();f.repin();
    rejected(f,'PHASE72_CLAIMED_REGISTRY_WITNESS_ORIGINAL_OOS_ASOF_INVALID');
  });
  it('witness cannot claim to have received a manifest before its original signing instant, even with valid witness signature',()=>{
    const f=fixture();
    f.receipt.claimedObservedAt='2025-11-30T18:00:00.000Z';
    f.signWitness();f.repin();
    rejected(f,'PHASE72_CLAIMED_REGISTRY_WITNESS_ORIGINAL_OOS_ASOF_INVALID');
  });
  it('registrar roster retrospectively published AFTER original calendar was signed fails as-of lifecycle',()=>{
    const f=fixture();
    f.roster.claimedPublishedAt='2025-12-05T00:00:00.000Z';
    f.resignAll();
    rejected(f,'PHASE72_CLAIMED_REGISTRY_WITNESS_ORIGINAL_OOS_ASOF_INVALID');
  });
  it('witness cannot self-claim a DIFFERENT first OOS time after re-signing its receipt',()=>{
    const f=fixture();
    f.receipt.claimedFirstOriginalDecisionAt=
      new Date(Date.parse(f.receipt.claimedFirstOriginalDecisionAt)+86400000)
        .toISOString();
    f.signWitness();f.repin();
    rejected(f,'PHASE72_WITNESS_CLAIMED_FIRST_OOS_RECEIPT_TIMESTAMP_NOT_ORIGINAL');
  });
  it('validly re-signed witness receipt targeting another phase71 original manifest is a replay, not the same archive',()=>{
    const f=fixture();
    f.receipt.phase71SignedManifestRawSha256='1'.repeat(64);
    f.signWitness();f.repin();
    rejected(f,'PHASE72_WITNESS_RECEIPT_REPLAYS_OTHER_ORIGINAL_SOURCE');
  });
  it('witness receipt must bind the exact original calendar archive bytes and original issuer SPKI rather than only registry hash',()=>{
    const f=fixture();
    f.receipt.originalCalendarArchiveRawSha256='2'.repeat(64);
    f.signWitness();f.repin();
    rejected(f,'PHASE72_WITNESS_RECEIPT_REPLAYS_OTHER_ORIGINAL_SOURCE');
  });
  it('a forged registrar claimed ID cannot be legitimized by updating only its local witness ID/pin',()=>{
    const f=fixture();
    f.roster.claimedRegistrarId='FAKE_REPLACEMENT_REGISTRAR';
    f.receipt.claimedRegistrarId='FAKE_REPLACEMENT_REGISTRAR';
    f.resignAll();
    rejected(f,'PHASE72_CLAIMED_REGISTRAR_WITNESS_ISSUER_OR_SCOPE_INVALID');
  });
  it('self-claimed witness identity CAN be changed and re-signed with all local pins, but remains untrusted',()=>{
    const f=fixture();
    f.receipt.claimedWitnessId='OTHER_UNTRUSTED_TEST_WITNESS';
    f.pins.expectedClaimedWitnessId=f.receipt.claimedWitnessId;
    f.signWitness();f.repin();
    const r=audit(f);noRealAuthorityOrTrades(r);
    assert.equal(r.status,
      'DESCRIPTIVE_THREE_ROLE_CRYPTO_CONSISTENCY_UNTRUSTED_ONLY',
      JSON.stringify(r));
    assert.equal(r.candidateWitnessIndependentlyAuthenticated,false);
  });
  it('original NO_ENTRY decision denominator cannot be reduced to make unbought options into winning simulated trades',()=>{
    const f=fixture();
    f.pins.expectedOriginalNoEntryDays=1;
    rejected(f,'PHASE72_FULL_PARENT_OPTION_OOS_AND_SIGNING_GATE_NOT_READY');
  });
  it('future claimed key not yet active on original 2025 signing day cannot be a replayed historical valid issuer',()=>{
    const f=fixture();
    f.roster.keys[0].effectiveFrom='2026-01-01T00:00:00.000Z';
    f.resignAll();
    rejected(f,'PHASE72_SIGNING_ISSUER_KEY_ABSENT_INACTIVE_OR_REVOKED');
  });
  it('archived candidate signatures, even for a closed day, cannot protect entire long-option paid premium debit or prove GTT stop child ACK',()=>{
    const r=audit(fixture());noRealAuthorityOrTrades(r);
    assert.equal(r.wholeLongOptionPaidPremiumDebitProtected,false);
    assert.equal(r.originalBidAskAreExecutableBrokerFills,false);
    assert.equal(r.recommendedOneToEightWeekHorizonAuthorized,false);
    assert.equal(r.brokerNativeNrmlGttStopChildExchangeAckVerified,false);
  });
});
