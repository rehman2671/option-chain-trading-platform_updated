import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  auditPhase53OriginalDocumentByteCustody,hashPhase53Evidence,
  type Phase53Input,type Phase53IndependentPins,type Phase53DocumentRole
} from '../../server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.js';
import {makePhase53SyntheticSignedFixture}
  from './phase53_synthetic_signed_document_fixture.js';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const roles:Phase53DocumentRole[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
function fixture(){
  const f=makePhase53SyntheticSignedFixture();
  const input:Phase53Input={
    schemaVersion:'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1',
    source:'OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED',
    phase52:f.input,phase52Pins:f.pins,
    documents:f.originalDocuments
  };
  const docSha=()=>Object.fromEntries(input.documents.map(d=>
    [d.role,sha(d.bytes)])) as Record<Phase53DocumentRole,string>;
  const docSizes=()=>Object.fromEntries(input.documents.map(d=>
    [d.role,d.bytes.length])) as Record<Phase53DocumentRole,number>;
  const pins:Phase53IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE53_DOCUMENT_BYTE_CUSTODY_PINS_V1',
    expectedPhase52InputSha256:hashPhase53Evidence(input.phase52),
    expectedPhase52PinsSha256:hashPhase53Evidence(input.phase52Pins),
    expectedDocumentSha256ByRole:docSha(),
    expectedDocumentByteLengthByRole:docSizes(),
    expectedDatasetId:f.historical.provenance.datasetId,
    expectedDeclaredOosSessions:2,
    expectedOriginalOptionL1QuoteRows:f.historical.executionQuotes.length,
    expectedFullOosArmHorizonAttempts:24
  };
  const repin=()=>{
    pins.expectedPhase52InputSha256=hashPhase53Evidence(input.phase52);
    pins.expectedPhase52PinsSha256=hashPhase53Evidence(input.phase52Pins);
    pins.expectedDocumentSha256ByRole=docSha();
    pins.expectedDocumentByteLengthByRole=docSizes();
  };
  return {...f,input,pins,repin};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase53OriginalDocumentByteCustody(f.input,f.pins);
function noTrade(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.externalDocumentIssuerAuthenticated,false);
  assert.equal(r.originalDocumentCmsSignatureAuthenticated,false);
  assert.equal(r.independentVendorHistoricalLicenseVerified,false);
  assert.equal(r.exchangeSessionIssuerAuthenticated,false);
  assert.equal(r.exchangeOriginalL1FeedAuthenticated,false);
  assert.equal(r.sourceAvailableAtIndependentlyVerified,false);
  assert.equal(r.reviewerIndependenceAndKeyCustodyVerified,false);
  assert.equal(r.originalDocumentExternalTrustedTimestampVerified,false);
  assert.equal(r.strategyOosProfitabilityProven,false);
  assert.equal(r.genuineBrokerNativeStopAckVerified,false);
  assert.equal(r.nrmlOvernightProtectionProven,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('SYNTHETIC_UNVERIFIED_DOC_'));
}
function rejected(f:F,reason:string,
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'='INCOMPLETE_EVIDENCE'){
  const r=audit(f);noTrade(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase53 original documentary byte custody behind signed OOS receipts',()=>{
  it('two distinct original synthetic files match independently pinned document hashes and signed receipts',()=>{
    const f=fixture(),r=audit(f);noTrade(r);
    assert.equal(r.status,'ORIGINAL_DOCUMENT_BYTES_MATCH_SIGNED_RECEIPTS_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase52Status,
      'CRYPTOGRAPHIC_BINDINGS_VALID_EXTERNAL_AUTHENTICATION_REQUIRED');
    assert.equal(r.datasetSynthetic,true);
    assert.equal(r.verifiedDocumentRoles,2);
    assert.equal(r.distinctOriginalDocumentDigests,2);
    assert.equal(r.declaredOosSessions,2);
    assert.equal(r.fullOosArmHorizonAttempts,24);
    assert.equal(r.originalOptionL1QuoteRows,
      f.historical.executionQuotes.length);
  });
  it('a completely missing document cannot pass based on typed hash alone',()=>{
    const f=fixture();
    f.input.documents=f.input.documents.slice(0,1);
    rejected(f,'ORIGINAL_DOCUMENT_SOURCE_OR_PREDECLARED_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
  it('byte flip with unchanged length does not pass even if declared hashes are unchanged',()=>{
    const f=fixture();
    const d=f.input.documents[0];
    d.bytes=Buffer.from(d.bytes);
    d.bytes[8]^=1;
    rejected(f,'ORIGINAL_DOCUMENT_BYTES_OR_REFERENCE_MISMATCH_SIGNED_EVIDENCE');
  });
  it('changing documentary evidence and locally repinning Phase53 cannot bypass Phase52 signed receipt',()=>{
    const f=fixture();
    const d=f.input.documents[0];
    d.bytes=Buffer.concat([d.bytes,Buffer.from('tampered')]);
    f.repin();
    rejected(f,'ORIGINAL_DOCUMENT_BYTES_OR_REFERENCE_MISMATCH_SIGNED_EVIDENCE');
  });
  it('wrong original external document reference fails despite matching source bytes',()=>{
    const f=fixture();
    f.input.documents[1].externalEvidenceReferenceId=
      'DIFFERENT_ORIGINAL_DOCUMENT_REFERENCE';
    rejected(f,'ORIGINAL_DOCUMENT_BYTES_OR_REFERENCE_MISMATCH_SIGNED_EVIDENCE');
  });
  it('two evidence roles cannot reuse the same original source document bytes',()=>{
    const f=fixture();
    f.input.documents[1].bytes=Buffer.from(f.input.documents[0].bytes);
    rejected(f,'DUPLICATED_EXTERNAL_DOCUMENT_BYTES_ACROSS_REVIEW_ROLES',
      'INVALID_EVIDENCE');
  });
  it('duplicate review role cannot replace a missing calendar document',()=>{
    const f=fixture();
    f.input.documents[1].role=roles[0];
    rejected(f,'DUPLICATED_OR_MISSING_DOCUMENT_ROLE','INVALID_EVIDENCE');
  });
  it('incorrect precommitted original quote count blocks despite good signatures',()=>{
    const f=fixture();
    f.pins.expectedOriginalOptionL1QuoteRows-=1;
    rejected(f,'PREDECLARED_ORIGINAL_OOS_DENOMINATOR_OR_L1_COUNT_MISMATCH');
  });
  it('deleted OOS trading session still fails after both synthetic reviewers re-sign inner archive',()=>{
    const f=fixture(),missing=f.historical.policy.folds[1].testStart;
    f.historical.decisions=f.historical.decisions.filter(d=>
      d.sessionDate!==missing);
    f.historical.provenance.expectedSessions=
      f.historical.provenance.expectedSessions.filter(s=>s!==missing);
    f.repinSource();f.resign();f.repin();
    const r=rejected(f,'PHASE52_SIGNED_ORIGINAL_SOURCE_OR_CALENDAR_REAUDIT_FAILED');
    assert.equal(r.declaredOosSessions,2);
  });
  it('source availableAt missing still fails despite intact signed original document bytes',()=>{
    const f=fixture(),d=f.historical.decisions.at(-1)!;
    const q=f.historical.executionQuotes.find(x=>
      d.listedContracts.some(c=>c.instrument_key===x.instrumentKey)&&
      Date.parse(x.observedAt)>Date.parse(d.decisionAt))!;
    delete q.availableAt;
    f.repinSource();f.resign();f.repin();
    rejected(f,'PHASE52_SIGNED_ORIGINAL_SOURCE_OR_CALENDAR_REAUDIT_FAILED');
  });
  it('tampered source plus unchanged Phase53 independent source pin is rejected before inner replay',()=>{
    const f=fixture();
    f.input.phase52.phase51.phase50.historical.executionQuotes[0].bid+=1;
    rejected(f,'ORIGINAL_DOCUMENT_SOURCE_OR_PREDECLARED_PINS_INVALID',
      'INVALID_EVIDENCE');
  });
});
