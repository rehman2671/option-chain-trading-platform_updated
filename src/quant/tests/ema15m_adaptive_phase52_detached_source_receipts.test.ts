import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,generateKeyPairSync,sign
} from 'node:crypto';
import {
  auditPhase52DetachedSourceCalendarReceipts,hashPhase52Evidence,
  phase52ReceiptMessage,
  type Phase52Input,type Phase52Pins,type Phase52DetachedReceipt
} from '../../server/engine/ema15m/adaptivePhase52DetachedSourceReceipts.js';
import {hashPhase50Evidence,
  type Phase50IndependentPins,type Phase50MultifoldInput
} from '../../server/engine/ema15m/adaptivePhase50MultifoldL1AsOf.js';
import {hashPhase51Evidence,
  type Phase51Input,type Phase51IndependentPins
} from '../../server/engine/ema15m/adaptivePhase51DeclaredSessionOosLedger.js';
import {makePhase48SyntheticOosInput}
  from './phase48_synthetic_oos_fixture.js';

const digest=(b:Uint8Array|string)=>createHash('sha256').update(b)
  .digest('hex');
const iso=(n:number)=>new Date(n).toISOString();
const ms=(s:string)=>Date.parse(s);
type Role=Phase52DetachedReceipt['role'];
const ROLES:Role[]=[
  'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
];
function fixture(){
  const generated=makePhase48SyntheticOosInput('FLAT');
  const historical=generated.input;
  const dates=historical.decisions.map(x=>x.sessionDate);
  historical.executionQuotes.forEach(q=>{
    q.availableAt=iso(ms(q.observedAt)+2000);
  });
  historical.policy.folds=[
    {trainStart:dates[0],trainEnd:dates[0],
      testStart:dates[3],testEnd:dates[3]},
    {trainStart:dates[1],trainEnd:dates[1],
      testStart:dates[4],testEnd:dates[4]}
  ];
  const historicalInput:Phase50MultifoldInput={
    schemaVersion:'ADAPTIVE_PHASE50_MULTIFOLD_L1_ASOF_V1',
    source:'OFFLINE_OPERATOR_L1_UNVERIFIED',historical
  };
  const phase50Pins:Phase50IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE50_MULTIFOLD_L1_ASOF_PINS_V1',
    expectedStudyDatasetId:historical.provenance.datasetId,
    expectedOriginalHistoricalSha256:'',
    expectedOosSessionManifestSha256:'',
    expectedFoldCount:2,expectedOosTestDecisionCount:2,
    expectedOosAttemptCount:24,minimumDistinctOosDays:2,
    minimumOosFolds:2,minimumObservedEntries:4,
    maximumOriginalL1AvailabilityLagSeconds:30
  };
  const sessions=dates.map(day=>{
    const row=generated.sessions.find(x=>x.sessionDate===day)!;
    return {...row};
  });
  const phase51:Phase51Input={
    schemaVersion:'ADAPTIVE_PHASE51_OOS_SESSION_COVERAGE_V1',
    source:'OFFLINE_UNAUTHENTICATED_OPERATOR_EVIDENCE',
    phase50:historicalInput,phase50Pins,
    calendar:{
      schemaVersion:'ADAPTIVE_PHASE51_SESSION_LEDGER_V1',
      source:'OPERATOR_ASSERTED_EXCHANGE_SESSION_UNVERIFIED',
      sessions
    }
  };
  const phase51Pins:Phase51IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE51_SESSION_OOS_PINS_V1',
    expectedCalendarSha256:'',
    expectedPhase50InputSha256:'',
    expectedPhase50PinsSha256:'',
    expectedDeclaredSessionCount:5,
    expectedOriginalOosManifestSha256:'',
    expectedOriginalOosSessionCount:2,
    minimumOosSessionsPerFold:1
  };
  const pairs=ROLES.map(role=>{
    const keys=generateKeyPairSync('ed25519');
    const publicKeySpkiPem=keys.publicKey.export({
      type:'spki',format:'pem'
    }).toString();
    const der=keys.publicKey.export({type:'spki',format:'der'});
    return {role,keys,reviewerId:role==='ORIGINAL_OPTION_L1_REVIEWER'?
      'SYNTHETIC_VENDOR_REVIEWER':'SYNTHETIC_CALENDAR_REVIEWER',
      organizationId:role==='ORIGINAL_OPTION_L1_REVIEWER'?
      'SYNTHETIC_VENDOR_ORG':'SYNTHETIC_CALENDAR_ORG',
      publicKeySpkiPem,
      publicKeySpkiSha256:digest(der)
    };
  });
  const trustRegistry:Phase52Input['trustRegistry']={
    schemaVersion:'OPERATOR_PINNED_PHASE52_EXTERNAL_REVIEWERS_V1',
    trustSource:'OUT_OF_BAND_OPERATOR_PINNED_UNVERIFIED',
    reviewers:pairs.map(p=>({
      role:p.role,reviewerId:p.reviewerId,
      organizationId:p.organizationId,
      publicKeySpkiPem:p.publicKeySpkiPem,
      publicKeySpkiSha256:p.publicKeySpkiSha256
    }))
  };
  const receipt=(p:typeof pairs[number]):Phase52DetachedReceipt=>({
    schemaVersion:'ADAPTIVE_PHASE52_EXTERNAL_EVIDENCE_RECEIPT_V1',
    role:p.role,reviewerId:p.reviewerId,
    organizationId:p.organizationId,
    signedAt:'2026-10-01T10:00:00Z',
    datasetId:historical.provenance.datasetId,
    phase51InputSha256:'',
    phase51PinsSha256:'',
    historicalInputSha256:'',
    calendarLedgerSha256:'',
    oosSessionManifestSha256:'',
    oosDeclaredSessionCount:2,
    originalOptionL1RecordCount:historical.executionQuotes.length,
    externalEvidenceDocumentSha256:digest('SYNTHETIC_NOT_EXTERNAL_'+p.role),
    externalEvidenceReferenceId:'SYNTHETIC_UNVERIFIED_DOC_'+p.role,
    signatureBase64:''
  });
  const input:Phase52Input={
    schemaVersion:'ADAPTIVE_PHASE52_OFFLINE_EXTERNAL_SOURCE_REVIEW_V1',
    source:'OPERATOR_SUBMITTED_DETACHED_EVIDENCE_UNVERIFIED',
    phase51,phase51Pins,trustRegistry,
    receipts:pairs.map(receipt)
  };
  const pins:Phase52Pins={
    schemaVersion:'INDEPENDENT_PHASE52_EXACT_SOURCE_WITNESS_PINS_V1',
    expectedPhase51InputSha256:'',
    expectedPhase51PinsSha256:'',
    expectedRegistrySha256:'',
    expectedReceiptMessageSha256ByRole:{
      ORIGINAL_OPTION_L1_REVIEWER:'',
      SESSION_CALENDAR_REVIEWER:''
    },
    expectedDocumentSha256ByRole:{
      ORIGINAL_OPTION_L1_REVIEWER:'',
      SESSION_CALENDAR_REVIEWER:''
    }
  };
  const repinSource=()=>{
    const phase50Manifest:string[]=[],phase51Manifest:string[]=[];
    historical.policy.folds.forEach((f,i)=>{
      historical.decisions.forEach(d=>{
        if(d.sessionDate>=f.testStart&&d.sessionDate<=f.testEnd)
          phase50Manifest.push(i+'|'+d.sessionDate+'|'+d.decisionAt);
      });
      sessions.forEach(s=>{
        if(s.sessionDate>=f.testStart&&s.sessionDate<=f.testEnd)
          phase51Manifest.push(i+'|'+s.sessionDate);
      });
    });
    phase50Pins.expectedOriginalHistoricalSha256=
      hashPhase50Evidence(historical);
    phase50Pins.expectedOosSessionManifestSha256=
      hashPhase50Evidence(phase50Manifest);
    phase50Pins.expectedFoldCount=historical.policy.folds.length;
    phase50Pins.expectedOosTestDecisionCount=phase50Manifest.length;
    phase50Pins.expectedOosAttemptCount=phase50Manifest.length*12;
    phase51Pins.expectedCalendarSha256=hashPhase51Evidence(phase51.calendar);
    phase51Pins.expectedPhase50InputSha256=hashPhase51Evidence(historicalInput);
    phase51Pins.expectedPhase50PinsSha256=hashPhase51Evidence(phase50Pins);
    phase51Pins.expectedDeclaredSessionCount=sessions.length;
    phase51Pins.expectedOriginalOosSessionCount=phase51Manifest.length;
    phase51Pins.expectedOriginalOosManifestSha256=
      hashPhase51Evidence(phase51Manifest);
  };
  const resign=()=>{
    pins.expectedPhase51InputSha256=hashPhase52Evidence(phase51);
    pins.expectedPhase51PinsSha256=hashPhase52Evidence(phase51Pins);
    pins.expectedRegistrySha256=hashPhase52Evidence(trustRegistry);
    input.receipts.forEach(r=>{
      const p=pairs.find(x=>x.role===r.role)!;
      r.phase51InputSha256=hashPhase52Evidence(phase51);
      r.phase51PinsSha256=hashPhase52Evidence(phase51Pins);
      r.historicalInputSha256=hashPhase52Evidence(historical);
      r.calendarLedgerSha256=hashPhase52Evidence(phase51.calendar);
      r.oosSessionManifestSha256=
        phase51Pins.expectedOriginalOosManifestSha256;
      r.oosDeclaredSessionCount=phase51Pins.expectedOriginalOosSessionCount;
      r.originalOptionL1RecordCount=historical.executionQuotes.length;
      const msg=phase52ReceiptMessage(r);
      pins.expectedReceiptMessageSha256ByRole[r.role]=digest(msg);
      pins.expectedDocumentSha256ByRole[r.role]=r.externalEvidenceDocumentSha256;
      r.signatureBase64=sign(null,msg,p.keys.privateKey).toString('base64');
    });
  };
  repinSource();
  resign();
  return {input,pins,pairs,phase51,phase51Pins,
    historical,sessions,repinSource,resign};
}
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase52DetachedSourceCalendarReceipts(f.input,f.pins);
function blockFlags(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.externallyAuthenticatedVendor,false);
  assert.equal(r.exchangeCalendarIssuerAuthenticated,false);
  assert.equal(r.licensedHistoricalOptionL1IndependentlyVerified,false);
  assert.equal(r.sourceAvailableAtIndependentlyAuthenticated,false);
  assert.equal(r.reviewerKeyOwnershipIndependentlyVerified,false);
  assert.equal(r.trustedThirdPartyTimestampEstablished,false);
  assert.equal(r.nativeNrmlOvernightStopInstalled,false);
  assert.equal(r.actualBrokerOrderAckAuthenticated,false);
  assert.equal(r.unbiasedChronologicalOosProfitabilityProven,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
}
const rejected=(f:F,code:string,status:ReturnType<typeof audit>['status']=
  'INCOMPLETE_EVIDENCE')=>{
  const r=audit(f);blockFlags(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(code),JSON.stringify(r));
  return r;
};
describe('Phase52 offline detached signed full OOS source/calendar receipts',()=>{
  it('distinct Ed25519 signatures bind two synthetic OOS sessions and 24 attempts, not real source truth',()=>{
    const f=fixture(),r=audit(f);blockFlags(r);
    assert.equal(r.status,
      'CRYPTOGRAPHIC_BINDINGS_VALID_EXTERNAL_AUTHENTICATION_REQUIRED',
      JSON.stringify(r));
    assert.equal(r.datasetSynthetic,true);
    assert.equal(r.declaredOosSessions,2);
    assert.equal(r.fullOosArmHorizonDenominator,24);
    assert.equal(r.validDistinctDetachedWitnesses,2);
    assert.equal(r.distinctReviewerOrganizations,2);
  });
  it('unsigned or swapped original source receipt cannot claim an external review',()=>{
    const f=fixture();
    f.input.receipts[0].signatureBase64=f.input.receipts[1].signatureBase64;
    rejected(f,'DETACHED_REVIEW_SIGNATURE_INVALID');
  });
  it('source changed after signed pinned receipts fails without accepting repinned new data',()=>{
    const f=fixture(),q=f.historical.executionQuotes[0];
    q.ask+=1;
    f.repinSource(); // operator re-pins inner archives, but not Phase52 envelope
    rejected(f,
      'PRESPECIFIED_PHASE51_SOURCE_OR_REVIEWER_REGISTRY_PIN_MISMATCH',
      'INVALID_EVIDENCE');
  });
  it('self-resigning a deleted OOS day still fails independently required original ledger',()=>{
    const f=fixture(),missing=f.historical.policy.folds[1].testStart;
    f.historical.decisions=f.historical.decisions.filter(d=>
      d.sessionDate!==missing);
    f.historical.provenance.expectedSessions=
      f.historical.provenance.expectedSessions.filter(x=>x!==missing);
    f.repinSource();f.resign();
    const r=rejected(f,
      'NESTED_PHASE51_PHASE50_ORIGINAL_OOS_EVIDENCE_INCOMPLETE');
    assert.equal(r.declaredOosSessions,2);
    assert.equal(r.originalOosDecisions,1);
  });
  it('changed signed original calendar document hash cannot match prespecified external document pin',()=>{
    const f=fixture();
    f.input.receipts[1].externalEvidenceDocumentSha256='ff'.repeat(32);
    rejected(f,'DETACHED_RECEIPT_SCOPE_NOT_EXACT_OR_NOT_PREDECLARED');
  });
  it('attested source quote row count must match the exact historical L1 archive',()=>{
    const f=fixture();
    f.input.receipts[0].originalOptionL1RecordCount-=1;
    rejected(f,'DETACHED_RECEIPT_SCOPE_NOT_EXACT_OR_NOT_PREDECLARED');
  });
  it('signer registry key fingerprint mismatch is invalid, never vendor authentication',()=>{
    const f=fixture();
    f.input.trustRegistry.reviewers[0].publicKeySpkiSha256='aa'.repeat(32);
    f.pins.expectedRegistrySha256=hashPhase52Evidence(f.input.trustRegistry);
    rejected(f,'MALFORMED_OR_NONINDEPENDENT_SIGNER_REGISTRY_OR_RECEIPTS',
      'INVALID_EVIDENCE');
  });
  it('two signer roles cannot be represented by same organization',()=>{
    const f=fixture();
    f.input.trustRegistry.reviewers[1].organizationId=
      f.input.trustRegistry.reviewers[0].organizationId;
    f.pins.expectedRegistrySha256=hashPhase52Evidence(f.input.trustRegistry);
    rejected(f,'MALFORMED_OR_NONINDEPENDENT_SIGNER_REGISTRY_OR_RECEIPTS',
      'INVALID_EVIDENCE');
  });
  it('no signedAt date can be accepted as trusted external timestamp authority',()=>{
    const f=fixture();
    const r=audit(f);blockFlags(r);
    assert.equal(r.trustedThirdPartyTimestampEstablished,false);
    assert.ok(r.warnings.some(w=>w.includes('NOT_AN_INDEPENDENT_TRUSTED_TIMESTAMP')));
  });
  it('missing source availability fails deep Phase50 even if both roles sign the changed archive',()=>{
    const f=fixture(),d=f.historical.decisions.at(-1)!;
    const q=f.historical.executionQuotes.find(x=>
      d.listedContracts.some(c=>c.instrument_key===x.instrumentKey)&&
      ms(x.observedAt)>ms(d.decisionAt))!;
    delete q.availableAt;
    f.repinSource();f.resign();
    rejected(f,'NESTED_PHASE51_PHASE50_ORIGINAL_OOS_EVIDENCE_INCOMPLETE');
  });
});
