/**
 * Deliberately owner-generated synthetic "issuer signing key", not an
 * official NSE/BSE exchange key. Signing fabricated holiday history and
 * matching operator pins proves ONLY Ed25519 cryptographic consistency.
 */
import {
  createHash,generateKeyPairSync,sign as edSign
} from 'node:crypto';
import {
  makePhase70SyntheticExchangeDayFixture
} from './phase70_synthetic_exchange_day_fixture.js';
import {
  hashPhase71Evidence,
  type Phase71Input,type Phase71IndependentPins,
  type Phase71CandidateSignedManifest
} from '../../server/engine/ema15m/adaptivePhase71DetachedCalendarManifest.js';
const BINDING=Buffer.from(
  'ADAPTIVE_PHASE71_HISTORIC_SESSION_ARCHIVE_ED25519_MANIFEST_V1\n','utf8');
const sha=(b:Uint8Array):string=>createHash('sha256')
  .update(b).digest('hex');
const jsonb=(v:unknown)=>Buffer.from(JSON.stringify(v),'utf8');
export function makePhase71SyntheticCandidateSignedFixture(){
  const parent=makePhase70SyntheticExchangeDayFixture();
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const candidateSpki=publicKey.export({format:'der',type:'spki'}) as Buffer;
  const manifest:Phase71CandidateSignedManifest={
    schemaVersion:'ADAPTIVE_PHASE71_DETACHED_CALENDAR_MANIFEST_V1',
    audience:'ADAPTIVE_V2_OFFLINE_RESEARCH_NONEXECUTABLE',
    purpose:'CLAIMED_FO_HISTORICAL_CALENDAR_HOLIDAY_EXCEPTION_DISTRIBUTION',
    signatureAlgorithm:'Ed25519',
    claimedIssuerReference:parent.archive.claimedIssuerReference,
    claimedArchiveReference:parent.archive.claimedArchiveReference,
    claimedSignerKeyId:'MOCK_LOCAL_ED25519_ISSUER_KEY_UNVERIFIED',
    claimedSignedAt:'2025-12-01T00:02:00.000Z',
    claimedSignerKeyEffectiveFrom:'2025-01-01T00:00:00.000Z',
    claimedSignerKeyEffectiveThrough:'2030-01-01T00:00:00.000Z',
    archiveCoveredFrom:parent.archive.coveredFrom,
    archiveCoveredThrough:parent.archive.coveredThrough,
    archiveRawSha256:parent.pins.expectedClaimedArchiveRawBytesSha256,
    phase70InputSha256:hashPhase71Evidence(parent.input),
    phase70PinsSha256:hashPhase71Evidence(parent.pins),
    originalCalendarDayRows:parent.archive.days.length
  };
  const input:Phase71Input={
    schemaVersion:'ADAPTIVE_PHASE71_SIGNED_CANDIDATE_CALENDAR_SOURCE_V1',
    source:'OWNER_PRIVATE_CANDIDATE_ED25519_SIGNER_UNTRUSTED',
    phase70:parent.input,phase70Pins:parent.pins,
    claimedSignedManifestRawBase64:'',
    claimedDetachedSignatureBase64:'',
    candidateSignerPublicSpkiDerBase64:candidateSpki.toString('base64')
  };
  const pins:Phase71IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE71_DETACHED_CANDIDATE_SOURCE_PINS_V1',
    expectedPhase70InputSha256:'',
    expectedPhase70PinsSha256:'',
    expectedManifestRawBytesSha256:'',
    expectedOriginalDayArchiveRawBytesSha256:'',
    expectedCandidateSignerSpkiDerSha256:'',
    expectedDetachedSignatureBytesSha256:'',
    expectedClaimedSignerKeyId:manifest.claimedSignerKeyId,
    expectedClaimedIssuerReference:manifest.claimedIssuerReference,
    expectedClaimedArchiveReference:manifest.claimedArchiveReference,
    expectedOriginalOosDecisions:4,
    expectedOriginalNoEntryDays:2,
    expectedOriginalListedCePePairs:32,
    expectedArchiveCalendarDays:parent.archive.days.length
  };
  const signManifest=()=>{
    const bytes=jsonb(manifest);
    input.claimedSignedManifestRawBase64=bytes.toString('base64');
    input.claimedDetachedSignatureBase64=edSign(null,
      Buffer.concat([BINDING,bytes]),privateKey).toString('base64');
  };
  const repin=()=>{
    pins.expectedPhase70InputSha256=hashPhase71Evidence(input.phase70);
    pins.expectedPhase70PinsSha256=hashPhase71Evidence(input.phase70Pins);
    pins.expectedManifestRawBytesSha256=sha(Buffer.from(
      input.claimedSignedManifestRawBase64,'base64'));
    pins.expectedOriginalDayArchiveRawBytesSha256=sha(Buffer.from(
      input.phase70.separatelySuppliedClaimedExchangeDayArchiveBase64,
      'base64'));
    pins.expectedCandidateSignerSpkiDerSha256=sha(Buffer.from(
      input.candidateSignerPublicSpkiDerBase64,'base64'));
    pins.expectedDetachedSignatureBytesSha256=sha(Buffer.from(
      input.claimedDetachedSignatureBase64,'base64'));
  };
  const rebindOriginalAndResign=()=>{
    parent.updateArchive();parent.repin();
    manifest.claimedIssuerReference=parent.archive.claimedIssuerReference;
    manifest.claimedArchiveReference=parent.archive.claimedArchiveReference;
    manifest.archiveCoveredFrom=parent.archive.coveredFrom;
    manifest.archiveCoveredThrough=parent.archive.coveredThrough;
    manifest.archiveRawSha256=parent.pins.expectedClaimedArchiveRawBytesSha256;
    manifest.phase70InputSha256=hashPhase71Evidence(parent.input);
    manifest.phase70PinsSha256=hashPhase71Evidence(parent.pins);
    manifest.originalCalendarDayRows=parent.archive.days.length;
    signManifest();repin();
  };
  signManifest();repin();
  return {parent,manifest,input,pins,signManifest,repin,
    rebindOriginalAndResign};
}
