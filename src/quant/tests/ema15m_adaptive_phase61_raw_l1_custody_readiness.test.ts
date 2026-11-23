import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
function fixture(variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'){
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
type F=ReturnType<typeof fixture>;
const audit=(f:F)=>auditPhase61OriginalL1CustodyReadiness(f.input,f.pins);
function noTrust(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.independentVendorSignedRawTransportValidated,false);
  assert.equal(r.independentlyLicensedFnoHistoricalL1Verified,false);
  assert.equal(r.officialContractCatalogAndExpiryIssuerValidated,false);
  assert.equal(r.exchangeSessionCalendarIssuerValidated,false);
  assert.equal(r.independentlyTrustedSourceAvailableAtClock,false);
  assert.equal(r.fullyObservedUnbiasedMultiregimeOosPerformanceProven,false);
  assert.equal(r.qualifiedProfitabilityOrBestHorizonRankingProven,false);
  assert.equal(r.brokerNativeNrmlOvernightStopAckVerified,false);
  assert.equal(r.originalOosEvidenceCoverageSufficient,false);
  assert.ok(!JSON.stringify(r).includes('NSE_FO|'));
  assert.ok(!JSON.stringify(r).includes('SYNTHETIC NOT A REAL'));
}
function rejected(f:F,reason:string,
  status:ReturnType<typeof audit>['status']='INCOMPLETE_EVIDENCE'){
  const r=audit(f);noTrust(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
  return r;
}
describe('Phase61 owner-custodied raw original L1 archive vs Phase60 OOS source',()=>{
  it('matches EVERY operator JSONL quote and the original catalog and exit calendar without authenticating a vendor or strategy',()=>{
    const f=fixture(),r=audit(f);noTrust(r);
    assert.equal(r.status,
      'DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY',
      JSON.stringify(r));
    assert.equal(r.phase60Status,'DESCRIPTIVE_COVERAGE_INSUFFICIENT_ONLY');
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.originalOosDecisions,2);
    assert.equal(r.originalOosArmHorizonAttempts,24);
    assert.equal(r.originalDistinctDecisionTimeRegimes,1);
    assert.equal(r.matchingOriginalPhase50QuoteRows,
      f.history.executionQuotes.length);
    assert.equal(r.originalQuoteEnvelopeRows,
      f.history.executionQuotes.length);
    assert.equal(r.originalContractMasterDecisionSnapshots,
      f.history.decisions.length);
    assert.equal(r.originalCalendarSessions,
      f.input.phase60.phase59.phase58.exitSessions.length);
    assert.equal(r.operatorClaimedLicenseDocumentBytesPinned,true);
    assert.equal(r.reasonCodes.includes(
      'INDEPENDENT_VENDOR_LICENSE_SOURCE_CLOCK_AND_ISSUER_TRUST_UNVERIFIED'),
      true);
  });
  it('a copied source archive with independently pinned original bytes altered is invalid',()=>{
    const f=fixture(),raw=Buffer.from(
      f.input.originalL1QuoteEnvelopeBase64,'base64');
    raw[0]^=1;
    f.input.originalL1QuoteEnvelopeBase64=raw.toString('base64');
    rejected(f,'ORIGINAL_PRIVATE_RAW_SOURCE_BYTE_HASH_DISAGREEMENT',
      'INVALID_EVIDENCE');
  });
  it('a changed historical original option ASK in self-supplied JSONL fails row-by-row even after a new SHA pin',()=>{
    const f=fixture(),v=f.rows();
    v[0].ask+=5;f.replaceRows(v);f.repin();
    const r=rejected(f,
      'ARCHIVED_RAW_L1_ROW_DIFFERS_FROM_ORIGINAL_BACKTEST_SOURCE');
    assert.equal(r.matchingOriginalPhase50QuoteRows,0);
  });
  it('duplicate original owner source record identifier is rejected after re-pinning all byte hashes',()=>{
    const f=fixture(),v=f.rows();
    v[1].sourceRecordId=v[0].sourceRecordId;
    f.replaceRows(v);f.repin();
    rejected(f,'ORIGINAL_L1_CLOCK_SPREAD_QUANTITY_OR_INSTRUMENT_INVALID');
  });
  it('dropping a historical L1 quote and repinning the provided file cannot change full source quote denominator',()=>{
    const f=fixture(),v=f.rows();
    f.replaceRows(v.slice(0,-1));f.repin();
    rejected(f,'ORIGINAL_CUSTODIED_QUOTE_ROW_COUNT_MISMATCH');
  });
  it('changed decision-time listed expiry catalog is incomplete even if vendor-document bytes are rehashed',()=>{
    const f=fixture(),cat=JSON.parse(Buffer.from(
      f.input.originalPointInTimeContractCatalogBase64,'base64')
      .toString('utf8')) as ReturnType<typeof phase61ContractMasterSnapshot>;
    cat[0].listedContracts[0].expiry='2027-01-01';
    f.input.originalPointInTimeContractCatalogBase64=encoded(cat);
    f.repin();
    rejected(f,'ORIGINAL_CONTRACT_MASTER_OR_SESSION_ARCHIVE_DISAGREEMENT');
  });
  it('changed last held exit session is incomplete even if the calendar file is repinned',()=>{
    const f=fixture(),cal=JSON.parse(Buffer.from(
      f.input.originalExtendedSessionCalendarBase64,'base64')
      .toString('utf8')) as ReturnType<typeof phase61SessionSnapshot>;
    cal[cal.length-1].sourceRecordId='BACKFILLED_SESSION';
    f.input.originalExtendedSessionCalendarBase64=encoded(cal);
    f.repin();
    rejected(f,'ORIGINAL_CONTRACT_MASTER_OR_SESSION_ARCHIVE_DISAGREEMENT');
  });
  it('self-provided opaque purported licence document can be rehashed but does NOT authenticate real F&O entitlement',()=>{
    const f=fixture();
    f.input.operatorClaimedLicenseEntitlementEvidenceBase64=
      Buffer.from('SECOND SELF ASSERTED DOCUMENT THAT PROVES NO LICENSE')
        .toString('base64');
    f.repin();
    const r=audit(f);noTrust(r);
    assert.equal(r.status,'DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY',
      JSON.stringify(r));
    assert.equal(r.operatorClaimedLicenseDocumentBytesPinned,true);
    assert.equal(r.independentlyLicensedFnoHistoricalL1Verified,false);
  });
  it('removing a pinned original OOS fold day makes Phase60 fail even with another operator-supplied archive',()=>{
    const f=fixture(),hist=f.history;
    const missing=hist.policy.folds[1].testStart;
    hist.decisions=hist.decisions.filter(d=>d.sessionDate!==missing);
    hist.provenance.expectedSessions=hist.provenance.expectedSessions
      .filter(d=>d!==missing);
    f.prior.repinSource();f.repin();
    rejected(f,'PHASE60_ORIGINAL_OOS_COHORT_OR_COVERAGE_REAUDIT_INCOMPLETE');
  });
  it('observed original premium giveback or next-open gap still remains a reportable downside, not profits',()=>{
    for(const variant of ['GIVEBACK','GAP'] as const){
      const f=fixture(variant),r=audit(f);noTrust(r);
      assert.equal(r.status,'DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY',
        JSON.stringify(r));
      assert.equal(r.phase60Status,'DESCRIPTIVE_DOWNSIDE_RISK_ALERT_ONLY');
      assert.equal(r.qualifiedProfitabilityOrBestHorizonRankingProven,false);
    }
  });
});
