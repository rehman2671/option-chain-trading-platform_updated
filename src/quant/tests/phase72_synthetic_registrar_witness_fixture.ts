/**
 * All THREE signer roles are locally self-generated synthetic test keys.
 * A successful dossier NEVER verifies official exchange/registrar/witness
 * independence, trusted receipt time, or licensed historical data.
 */
import {
  createHash,generateKeyPairSync,sign as edSign
} from 'node:crypto';
import {
  makePhase71SyntheticCandidateSignedFixture
} from './phase71_synthetic_ed25519_calendar_fixture.js';
import {
  hashPhase72Evidence,
  type Phase72Input,type Phase72Pins,
  type Phase72CandidateRegistrarRoster,
  type Phase72CandidateWitnessReceipt
} from '../../server/engine/ema15m/adaptivePhase72IssuerKeyLifecycle.js';

const REGISTRY_PREFIX=Buffer.from(
  'ADAPTIVE_PHASE72_REGISTRAR_ISSUER_KEY_ROSTER_V1\n','utf8');
const WITNESS_PREFIX=Buffer.from(
  'ADAPTIVE_PHASE72_INDEPENDENT_CANDIDATE_RECEIPT_V1\n','utf8');
const sha=(b:Uint8Array)=>createHash('sha256').update(b)
  .digest('hex');
const bytes=(v:unknown)=>Buffer.from(JSON.stringify(v),'utf8');

export function makePhase72SyntheticKeyLifecycleFixture(){
  const previous=makePhase71SyntheticCandidateSignedFixture();
  const reg=generateKeyPairSync('ed25519'),
    witness=generateKeyPairSync('ed25519');
  const issuerSpki=Buffer.from(
    previous.input.candidateSignerPublicSpkiDerBase64,'base64');
  const registrarKey=reg.publicKey.export({
    format:'der',type:'spki'}) as Buffer;
  const witnessKey=witness.publicKey.export({
    format:'der',type:'spki'}) as Buffer;
  const claimedIssuer=previous.manifest.claimedIssuerReference,
    claimedRegistrar='MOCK_OPERATOR_REGISTRAR_UNTRUSTED',
    claimedWitness='MOCK_OPERATOR_WITNESS_UNTRUSTED';
  const roster:Phase72CandidateRegistrarRoster={
    schemaVersion:'ADAPTIVE_PHASE72_CANDIDATE_REGISTRAR_ROSTER_V1',
    source:'OPERATOR_CUSTODIED_NOT_AUTHENTICATED_REGISTRAR',
    claimedRegistrarId:claimedRegistrar,
    claimedIssuerReference:claimedIssuer,
    claimedPublishedAt:'2025-11-30T00:00:00.000Z',
    claimedExpiresAt:'2027-01-01T00:00:00.000Z',
    keys:[{
      claimedKeyId:previous.manifest.claimedSignerKeyId,
      spkiDerSha256:sha(issuerSpki),
      allowedPurpose:'HISTORICAL_FO_EXCHANGE_LIKE_DAY_ARCHIVE_ONLY',
      effectiveFrom:'2025-01-01T00:00:00.000Z',
      effectiveThrough:'2026-12-31T23:59:59.000Z',
      status:'ACTIVE',claimedRevokedAt:null
    }]
  };
  const originalFirstDecision=new Date(Math.min(
    ...previous.parent.issuer.vendor.catalog.decisions.map(d=>
      Date.parse(d.decisionAt)))).toISOString();
  const receipt:Phase72CandidateWitnessReceipt={
    schemaVersion:'ADAPTIVE_PHASE72_CANDIDATE_OBSERVATION_RECEIPT_V1',
    source:'OPERATOR_CUSTODIED_NOT_TRUSTED_TIME_WITNESS',
    claimedWitnessId:claimedWitness,
    claimedRegistrarId:claimedRegistrar,
    claimedIssuerReference:claimedIssuer,
    claimedObservedAt:'2025-12-02T00:00:00.000Z',
    claimedFirstOriginalDecisionAt:originalFirstDecision,
    rosterRawSha256:'',
    phase71SignedManifestRawSha256:sha(Buffer.from(
      previous.input.claimedSignedManifestRawBase64,'base64')),
    originalCalendarArchiveRawSha256:sha(Buffer.from(
      previous.input.phase70.separatelySuppliedClaimedExchangeDayArchiveBase64,
      'base64')),
    targetIssuerSpkiDerSha256:sha(issuerSpki)
  };
  const input:Phase72Input={
    schemaVersion:'ADAPTIVE_PHASE72_CANDIDATE_KEY_LIFECYCLE_V1',
    source:'OFFLINE_THREE_ROLE_SIGNATURES_NO_ISSUER_TRUST',
    phase71:previous.input,
    phase71Pins:previous.pins,
    candidateRegistrarRosterRawBase64:'',
    candidateRegistrarDetachedSignatureBase64:'',
    candidateRegistrarPublicSpkiDerBase64:registrarKey.toString('base64'),
    candidateWitnessReceiptRawBase64:'',
    candidateWitnessDetachedSignatureBase64:'',
    candidateWitnessPublicSpkiDerBase64:witnessKey.toString('base64')
  };
  const pins:Phase72Pins={
    schemaVersion:'INDEPENDENT_PHASE72_CANDIDATE_REGISTRAR_WITNESS_PINS_V1',
    phase71InputSha256:'',phase71PinsSha256:'',
    registrarRosterRawSha256:'',
    registrarDetachedSignatureSha256:'',
    registrarPublicSpkiDerSha256:'',
    witnessReceiptRawSha256:'',
    witnessDetachedSignatureSha256:'',
    witnessPublicSpkiDerSha256:'',
    expectedClaimedIssuerReference:claimedIssuer,
    expectedClaimedRegistrarId:claimedRegistrar,
    expectedClaimedWitnessId:claimedWitness,
    expectedOriginalOosDecisions:4,
    expectedOriginalNoEntryDays:2,
    expectedListedCePePairs:32,
    expectedOriginalArchiveCalendarDays:
      previous.parent.archive.days.length
  };
  const signRoster=()=>{
    const raw=bytes(roster);
    input.candidateRegistrarRosterRawBase64=raw.toString('base64');
    input.candidateRegistrarDetachedSignatureBase64=edSign(null,
      Buffer.concat([REGISTRY_PREFIX,raw]),reg.privateKey)
      .toString('base64');
  };
  const signWitness=()=>{
    const raw=bytes(receipt);
    input.candidateWitnessReceiptRawBase64=raw.toString('base64');
    input.candidateWitnessDetachedSignatureBase64=edSign(null,
      Buffer.concat([WITNESS_PREFIX,raw]),witness.privateKey)
      .toString('base64');
  };
  const repin=()=>{
    pins.phase71InputSha256=hashPhase72Evidence(input.phase71);
    pins.phase71PinsSha256=hashPhase72Evidence(input.phase71Pins);
    const pairs=[
      ['registrarRosterRawSha256',input.candidateRegistrarRosterRawBase64],
      ['registrarDetachedSignatureSha256',
        input.candidateRegistrarDetachedSignatureBase64],
      ['registrarPublicSpkiDerSha256',
        input.candidateRegistrarPublicSpkiDerBase64],
      ['witnessReceiptRawSha256',input.candidateWitnessReceiptRawBase64],
      ['witnessDetachedSignatureSha256',
        input.candidateWitnessDetachedSignatureBase64],
      ['witnessPublicSpkiDerSha256',
        input.candidateWitnessPublicSpkiDerBase64]
    ] as const;
    for(const [name,b64] of pairs)
      pins[name]=sha(Buffer.from(b64,'base64'));
  };
  const resignAll=()=>{
    signRoster();
    receipt.rosterRawSha256=sha(Buffer.from(
      input.candidateRegistrarRosterRawBase64,'base64'));
    signWitness();repin();
  };
  resignAll();
  return {
    previous,roster,receipt,input,pins,signRoster,signWitness,
    repin,resignAll,registrarKey,witnessKey
  };
}
