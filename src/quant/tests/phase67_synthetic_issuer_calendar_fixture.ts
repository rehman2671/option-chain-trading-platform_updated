/**
 * Synthetic mock "issuer" master is generated from the synthetic vendor
 * catalog. The same operator can fabricate both sides: this fixture
 * illustrates byte/chronology consistency, NEVER genuine exchange proof.
 */
import {createHash} from 'node:crypto';
import {makePhase66IndependentSyntheticVendorFixture}
  from './phase66_synthetic_new_vendor_fixture.js';
import {
  hashPhase67Evidence,
  type Phase67Input,type Phase67IndependentPins,
  type Phase67IssuerClaimedMaster,type Phase67IssuerClaimedCalendar
} from '../../server/engine/ema15m/adaptivePhase67IssuerCalendarCrosscheck.js';

const digest=(x:Uint8Array)=>createHash('sha256')
  .update(x).digest('hex');
const encoded=(x:unknown)=>Buffer.from(JSON.stringify(x),'utf8')
  .toString('base64');
const iso=(d:string,m:number)=>new Date(
  Date.parse(d+'T00:00:00Z')+m*60000).toISOString();
export function makePhase67SyntheticIssuerCrosscheckFixture(){
  const vendor=makePhase66IndependentSyntheticVendorFixture();
  // Phase66's general owner policy contemplates 40 days; Phase67's stricter
  // full-expiry cross-source audit conservatively tests the entire 8W
  // listed option life (56 calendar days) unless a locked earlier exit exists.
  vendor.input.policy.maximumHoldCalendarDays=56;
  vendor.input.policy.minimumTrainToFirstTestEmbargoCalendarDays=56;
  vendor.repinOuter();
  const snapshots=vendor.catalog.decisions.map(d=>({
    originalOosSessionDate:d.sessionDate,
    originalDecisionAt:d.decisionAt,
    claimedMasterPublishedAt:iso(d.sessionDate,200),
    claimedMasterReceivedAt:iso(d.sessionDate,205),
    optionContracts:d.originallyListedContracts.map(c=>({
      ...c,
      claimedFirstListedAt:iso(d.sessionDate,180),
      claimedLastTradingSessionDate:c.expiry
    }))
  }));
  const issuerMaster:Phase67IssuerClaimedMaster={
    schemaVersion:'ADAPTIVE_PHASE67_SEPARATE_ISSUER_CANDIDATE_MASTER_V1',
    source:'OWNER_CUSTODIED_EXCHANGE_LIKE_RECORDS_NOT_ISSUER_VERIFIED',
    claimedIssuerReference:'SYNTHETIC_NOT_OFFICIAL_EXCHANGE_REFERENCE',
    snapshots
  };
  const allSessions=new Map(
    vendor.calendar.sessions.map(s=>[s.sessionDate,{...s}]));
  for(const s of snapshots){
    for(const c of s.optionContracts){
      const day=c.claimedLastTradingSessionDate;
      if(!allSessions.has(day))
        allSessions.set(day,{
          sessionDate:day,openAt:iso(day,225),
          closeAt:iso(day,600)
        });
    }
  }
  const issuerCalendar:Phase67IssuerClaimedCalendar={
    schemaVersion:'ADAPTIVE_PHASE67_SEPARATE_ISSUER_CANDIDATE_CALENDAR_V1',
    source:'OWNER_CUSTODIED_EXCHANGE_LIKE_CALENDAR_NOT_ISSUER_VERIFIED',
    claimedIssuerReference:issuerMaster.claimedIssuerReference,
    claimedCalendarPublishedAt:'2026-01-05T00:00:00.000Z',
    claimedCalendarReceivedAt:'2026-01-05T00:05:00.000Z',
    sessions:[...allSessions.values()].sort(
      (a,b)=>a.sessionDate.localeCompare(b.sessionDate))
  };
  const input:Phase67Input={
    schemaVersion:
      'ADAPTIVE_PHASE67_DUAL_SOURCE_CONTRACT_CALENDAR_RECONCILIATION_V1',
    source:'OWNER_PRIVATE_SEPARATE_EXCHANGE_CANDIDATES_UNVERIFIED',
    originalVendor:vendor.input,
    originalVendorPins:vendor.pins,
    candidateIssuerMasterBase64:encoded(issuerMaster),
    candidateIssuerCalendarBase64:encoded(issuerCalendar)
  };
  const distinct=new Set(vendor.catalog.decisions.flatMap(d=>
    d.originallyListedContracts.map(c=>c.instrumentKey)));
  const pins:Phase67IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE67_CANDIDATE_ISSUER_CROSSCHECK_PINS_V1',
    expectedPhase66InputSha256:'',
    expectedPhase66PinsSha256:'',
    expectedCandidateIssuerMasterBytesSha256:'',
    expectedCandidateIssuerCalendarBytesSha256:'',
    expectedClaimedIssuerReference:issuerMaster.claimedIssuerReference,
    expectedCompleteOriginalOosDecisions:vendor.catalog.decisions.length,
    expectedFullOosListedContractPairs:vendor.catalog.decisions.reduce(
      (n,d)=>n+d.originallyListedContracts.length,0),
    expectedDistinctOriginalListedInstruments:distinct.size,
    expectedIssuerCalendarSessions:issuerCalendar.sessions.length
  };
  const updateMaster=()=>{
    input.candidateIssuerMasterBase64=encoded(issuerMaster);
  };
  const updateCalendar=()=>{
    input.candidateIssuerCalendarBase64=encoded(issuerCalendar);
  };
  const repin=()=>{
    pins.expectedPhase66InputSha256=
      hashPhase67Evidence(input.originalVendor);
    pins.expectedPhase66PinsSha256=
      hashPhase67Evidence(input.originalVendorPins);
    pins.expectedCandidateIssuerMasterBytesSha256=digest(
      Buffer.from(input.candidateIssuerMasterBase64,'base64'));
    pins.expectedCandidateIssuerCalendarBytesSha256=digest(
      Buffer.from(input.candidateIssuerCalendarBase64,'base64'));
    // Do not independently rebase counts or claimed issuer identity.
  };
  repin();
  return {vendor,issuerMaster,issuerCalendar,input,pins,
    updateMaster,updateCalendar,repin};
}
