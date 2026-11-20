import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  auditPhase61OriginalL1CustodyReadiness,
  phase61EnvelopeFromHistoricalQuotes,
  phase61OriginalQuoteJsonl,
  phase61ContractMasterSnapshot,
  phase61SessionSnapshot,
  hashPhase61Evidence,
  type Phase61Input,type Phase61IndependentPins,
  type Phase61L1CustodyRow
} from '../../server/engine/ema15m/adaptivePhase61OriginalL1CustodyIntake.js';
import {makePhase61OriginalProvenanceFixture}
  from './phase61_synthetic_source_custody_fixture.js';
const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const encoded=(v:unknown):string=>
  Buffer.from(JSON.stringify(v),'utf8').toString('base64');
function phase61Fixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
  const prior=makePhase61OriginalProvenanceFixture(variant);
  const history=prior.parent.f.historical;
  const archive=phase61OriginalQuoteJsonl(
    phase61EnvelopeFromHistoricalQuotes(history));
  const input:Phase61Input={
    schemaVersion:'ADAPTIVE_PHASE61_ORIGINAL_RAW_L1_CUSTODY_INTAKE_V1',
    source:'OWNER_PRIVATE_OPERATOR_CUSTODIED_ARCHIVES_UNVERIFIED',
    phase60:prior.input,phase60Pins:prior.pins,
    originalL1QuoteEnvelopeBase64:
      Buffer.from(archive,'utf8').toString('base64'),
    originalPointInTimeContractCatalogBase64:
      encoded(phase61ContractMasterSnapshot(history)),
    originalExtendedSessionCalendarBase64:
      encoded(phase61SessionSnapshot(prior.input)),
    operatorClaimedLicenseEntitlementEvidenceBase64:
      Buffer.from('SYNTHETIC NOT A REAL NSE OR VENDOR LICENSE DOCUMENT',
        'utf8').toString('base64')
  };
  const pins:Phase61IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE61_ORIGINAL_RAW_ARCHIVE_CUSTODY_PINS_V1',
    expectedPhase60InputSha256:'',
    expectedPhase60PinsSha256:'',
    expectedOriginalL1QuoteEnvelopeBytesSha256:'',
    expectedOriginalContractCatalogBytesSha256:'',
    expectedOriginalExtendedCalendarBytesSha256:'',
    expectedOriginalClaimedLicenseDocumentBytesSha256:'',
    expectedOriginalL1QuoteCount:history.executionQuotes.length,
    expectedOriginalHistoricalDecisionCount:history.decisions.length,
    expectedOriginalListedOptionContractRows:history.decisions.reduce(
      (n,d)=>n+d.listedContracts.length,0),
    expectedOriginalExtendedCalendarSessions:
      prior.input.phase59.phase58.exitSessions.length,
    maximumAllowedEventToAvailabilityLagSeconds:30
  };
  const repin=()=>{
    pins.expectedPhase60InputSha256=hashPhase61Evidence(input.phase60);
    pins.expectedPhase60PinsSha256=hashPhase61Evidence(input.phase60Pins);
    pins.expectedOriginalL1QuoteEnvelopeBytesSha256=sha(
      Buffer.from(input.originalL1QuoteEnvelopeBase64,'base64'));
    pins.expectedOriginalContractCatalogBytesSha256=sha(
      Buffer.from(input.originalPointInTimeContractCatalogBase64,'base64'));
    pins.expectedOriginalExtendedCalendarBytesSha256=sha(
      Buffer.from(input.originalExtendedSessionCalendarBase64,'base64'));
    pins.expectedOriginalClaimedLicenseDocumentBytesSha256=sha(
      Buffer.from(input.operatorClaimedLicenseEntitlementEvidenceBase64,
        'base64'));
  };
  const rows=()=>Buffer.from(input.originalL1QuoteEnvelopeBase64,'base64')
    .toString('utf8').trimEnd().split('\n')
    .map(x=>JSON.parse(x) as Phase61L1CustodyRow);
  const replaceRows=(v:Phase61L1CustodyRow[])=>{
    input.originalL1QuoteEnvelopeBase64=Buffer.from(
      phase61OriginalQuoteJsonl(v),'utf8').toString('base64');
  };
  repin();
  return {prior,history,input,pins,repin,rows,replaceRows};
}
import {
  phase62SignedMessage,hashPhase62Evidence,
  type Phase62SignedManifest,type Phase62Input,type Phase62IndependentPins
} from '../../server/engine/ema15m/adaptivePhase62NativeCsvDualReceipts.js';

export function makePhase62SyntheticDualSourceFixture(
  variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'
){
  const phase61=phase61Fixture(variant),
    original=phase61.rows();
  const head=[
    'sourceRecordId','sourceSequence','instrumentKey','eventAt',
    'originalAvailableAt','bid','ask','bidQty','askQty'
  ];
  const csv=head.join(',')+'\n'+original.map(r=>[
    r.sourceRecordId,r.sourceSequence,r.instrumentKey,r.observedAt,
    r.availableAt,r.bid,r.ask,r.bidQty,r.askQty
  ].join(',')).join('\n')+'\n';
  const publisher=generateKeyPairSync('ed25519'),
    witness=generateKeyPairSync('ed25519');
  const pub=publisher.publicKey.export({type:'spki',format:'der'}),
    wit=witness.publicKey.export({type:'spki',format:'der'});
  const times=original.map(r=>Date.parse(r.observedAt));
  const now=Date.now();
  const manifest:Phase62SignedManifest={
    schemaVersion:'ADAPTIVE_PHASE62_NATIVE_CSV_DUAL_RECEIPT_MANIFEST_V1',
    sourceProductCategory:'CLAIMED_NATIVE_HISTORICAL_OPTION_TOP_OF_BOOK',
    originalCsvSha256:sha(Buffer.from(csv,'utf8')),
    phase61CustodyJsonlSha256:
      phase61.pins.expectedOriginalL1QuoteEnvelopeBytesSha256,
    phase61ContractCatalogSha256:
      phase61.pins.expectedOriginalContractCatalogBytesSha256,
    phase61ExtendedCalendarSha256:
      phase61.pins.expectedOriginalExtendedCalendarBytesSha256,
    claimedLicenseEvidenceSha256:
      phase61.pins.expectedOriginalClaimedLicenseDocumentBytesSha256,
    originalQuoteCount:original.length,
    firstOriginalEventAt:new Date(Math.min(...times)).toISOString(),
    lastOriginalEventAt:new Date(Math.max(...times)).toISOString(),
    claimedPublisherId:'SYNTHETIC_OPERATOR_PUBLISHER_NOT_NSE',
    claimedWitnessId:'SYNTHETIC_OPERATOR_WITNESS_NOT_VENDOR',
    publisherClaimedSignedAt:new Date(now-120000).toISOString(),
    witnessClaimedReceivedAt:new Date(now-60000).toISOString()
  };
  const input:Phase62Input={
    schemaVersion:'ADAPTIVE_PHASE62_NATIVE_CSV_TWO_DETACHED_RECEIPTS_V1',
    source:'OPERATOR_SUPPLIED_NATIVE_CSV_AND_CLAIMED_SIGNERS_UNVERIFIED',
    phase61:phase61.input,phase61Pins:phase61.pins,
    originalNativeCsvBase64:Buffer.from(csv,'utf8').toString('base64'),
    signedManifest:manifest,
    publisherEd25519PublicKeySpkiDerBase64:
      Buffer.from(pub).toString('base64'),
    witnessEd25519PublicKeySpkiDerBase64:
      Buffer.from(wit).toString('base64'),
    publisherDetachedSignatureBase64:'',
    witnessDetachedSignatureBase64:''
  };
  const pins:Phase62IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE62_NATIVE_CSV_RECEIPT_ROLE_PINS_V1',
    expectedPhase61InputSha256:'',
    expectedPhase61PinsSha256:'',
    expectedNativeCsvSha256:'',
    expectedSignedManifestSha256:'',
    expectedPublisherSpkiDerSha256:'',
    expectedWitnessSpkiDerSha256:'',
    expectedPublisherSignatureSha256:'',
    expectedWitnessSignatureSha256:'',
    expectedClaimedPublisherId:manifest.claimedPublisherId,
    expectedClaimedWitnessId:manifest.claimedWitnessId,
    expectedNativeCsvQuoteRows:original.length,
    maximumClaimedPublisherToWitnessLagHours:4
  };
  const reSign=()=>{
    input.publisherDetachedSignatureBase64=sign(
      null,phase62SignedMessage('PUBLISHER',input.signedManifest),
      publisher.privateKey).toString('base64');
    input.witnessDetachedSignatureBase64=sign(
      null,phase62SignedMessage('RECEIPT_WITNESS',input.signedManifest),
      witness.privateKey).toString('base64');
  };
  const rePin=()=>{
    pins.expectedPhase61InputSha256=hashPhase62Evidence(input.phase61);
    pins.expectedPhase61PinsSha256=hashPhase62Evidence(input.phase61Pins);
    pins.expectedNativeCsvSha256=sha(
      Buffer.from(input.originalNativeCsvBase64,'base64'));
    pins.expectedSignedManifestSha256=hashPhase62Evidence(
      input.signedManifest);
    pins.expectedPublisherSpkiDerSha256=sha(
      Buffer.from(input.publisherEd25519PublicKeySpkiDerBase64,'base64'));
    pins.expectedWitnessSpkiDerSha256=sha(
      Buffer.from(input.witnessEd25519PublicKeySpkiDerBase64,'base64'));
    pins.expectedPublisherSignatureSha256=sha(
      Buffer.from(input.publisherDetachedSignatureBase64,'base64'));
    pins.expectedWitnessSignatureSha256=sha(
      Buffer.from(input.witnessDetachedSignatureBase64,'base64'));
  };
  const reSignAndRepin=()=>{reSign();rePin();};
  reSignAndRepin();
  return {phase61,input,pins,rePin,reSign,reSignAndRepin,
    rePinAllNested:()=>{
      phase61.prior.repinSource();
      phase61.repin();
      reSignAndRepin();
    }};
}
