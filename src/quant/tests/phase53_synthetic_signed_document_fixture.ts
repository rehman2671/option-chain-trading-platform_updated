/** Synthetic-only test fixture, never a licensed market record. */
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {hashPhase52Evidence,phase52ReceiptMessage,
  type Phase52Input,type Phase52Pins,type Phase52DetachedReceipt}
  from '../../server/engine/ema15m/adaptivePhase52DetachedSourceReceipts.js';
import {hashPhase50Evidence,
  type Phase50IndependentPins,type Phase50MultifoldInput}
  from '../../server/engine/ema15m/adaptivePhase50MultifoldL1AsOf.js';
import {hashPhase51Evidence,
  type Phase51Input,type Phase51IndependentPins}
  from '../../server/engine/ema15m/adaptivePhase51DeclaredSessionOosLedger.js';
import {makePhase48SyntheticOosInput}
  from './phase48_synthetic_oos_fixture.js';

const digest=(b:Uint8Array|string)=>createHash('sha256').update(b)
  .digest('hex');
const iso=(n:number)=>new Date(n).toISOString();
const ms=(s:string)=>Date.parse(s);
type Role=Phase52DetachedReceipt['role'];
const ROLES:Role[]=['ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'];

export function makePhase53SyntheticSignedFixture(){
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
    externalEvidenceDocumentSha256:digest(Buffer.from(('SYNTHETIC_NOT_EXTERNAL_'+p.role).repeat(3))),
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
    historical,sessions,repinSource,resign,
    originalDocuments:ROLES.map(role=>({
      role,externalEvidenceReferenceId:'SYNTHETIC_UNVERIFIED_DOC_'+role,
      bytes:Buffer.from(('SYNTHETIC_NOT_EXTERNAL_'+role).repeat(3))
    }))
  };
}
