import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {buildAdaptiveEvidenceWitnessPayload,auditAdaptiveSignedEvidenceWitness,
  type OperatorPinnedReviewerTrust,
  type ResearchEvidenceWitnessEnvelope} from
  '../../server/engine/ema15m/adaptiveSignedEvidenceWitness.js';
import type {IndependentlySuppliedCalendarEvidence} from
  '../../server/engine/ema15m/adaptiveCrossSourceCalendarAudit.js';
import type {VerifiedHistoricalBundleV1} from
  '../../server/engine/ema15m/adaptiveVendorIngestion.js';

const DAY=86_400_000;
const utcDay=(d:string)=>Date.parse(d+'T00:00:00Z');
const date=(n:number)=>new Date(n).toISOString().slice(0,10);
const at=(d:string,hour:string)=>d+'T'+hour+':00+05:30';
const documentBytes=Buffer.from('SYNTHETIC_SEPARATELY_SUPPLIED_CALENDAR_DOCUMENT_NOT_NSE_OR_BSE');
const docSha=createHash('sha256').update(documentBytes).digest('hex');
const SAMPLE_START='2026-11-01',SAMPLE_END='2026-11-12';
function fixture():{
  calendar:IndependentlySuppliedCalendarEvidence;
  raw:VerifiedHistoricalBundleV1;
  sourceBytes:Uint8Array;
}{
  const days:IndependentlySuppliedCalendarEvidence['days']=[];
  const windows:NonNullable<VerifiedHistoricalBundleV1['declaredExchangeSessions']>=[];
  for(let i=utcDay(SAMPLE_START);i<=utcDay(SAMPLE_END);i+=DAY){
    const d=date(i);
    const weekend=[0,6].includes(new Date(i).getUTCDay());
    if(weekend){
      days.push({
        sessionDate:d,kind:'CLOSED',
        closureReason:'WEEKEND',sourceRecordId:'SYNTH_DAY_'+d
      });
    }else{
      const special=d==='2026-11-05';
      const openAt=at(d,special?'18:00':'09:15');
      const closeAt=at(d,special?'19:00':'15:30');
      days.push({
        sessionDate:d,kind:'TRADING',
        sessionKind:special?'SPECIAL':'REGULAR',
        openAt,closeAt,sourceRecordId:'SYNTH_DAY_'+d
      });
      windows.push({
        sessionDate:d,openAt,closeAt,sourceRecordId:'VENDOR_SESSION_'+d
      });
    }
  }
  const calendar:IndependentlySuppliedCalendarEvidence={
    schemaVersion:'ADAPTIVE_CROSS_SOURCE_CALENDAR_V1',
    exchange:'NSE',issuerName:'SYNTHETIC_TEST_CALENDAR_DO_NOT_AUTHENTICATE',
    originalDocumentId:'FAKE_ARCHIVE_CALENDAR_2026_001',
    originalDocumentSha256:docSha,
    coverageStart:SAMPLE_START,coverageEnd:SAMPLE_END,days,
    contractExpiries:[{
      instrument:'NIFTY',expiryDate:'2026-11-12',
      sourceRecordId:'SYNTHETIC_EXPIRY_2026_11_12'
    }]
  };
  const sessions:VerifiedHistoricalBundleV1['sessions']=[];
  const quotes:VerifiedHistoricalBundleV1['executionL1']=[];
  for(const s of windows){
    if(s.sessionDate<'2026-11-02'||s.sessionDate>'2026-11-06')continue;
    const d=s.sessionDate,special=d==='2026-11-05';
    const eventAt=at(d,special?'18:20':'09:40');
    const availableAt=at(d,special?'18:21':'09:41');
    const decisionAt=at(d,special?'18:30':'09:50');
    sessions.push({
      sessionDate:d,decisionAt,underlyingCandles:[{
        timestamp:at(d,special?'18:00':'09:15'),
        open:25100,high:25120,low:25099,close:25115,isClosed:true
      }],
      contracts:{
        eventAt,availableAt,sourceRecordId:'VENDOR_CONTRACT_'+d,
        data:[{
          instrument_key:'NSE_FO|'+(100000+sessions.length),
          trading_symbol:'FAKE_NIFTY_CE_'+d,
          underlying_symbol:'NIFTY',underlying_key:'NSE_INDEX|Nifty 50',
          segment:'NSE_FO',instrument_type:'CE',
          strike_price:25100,expiry:'2026-11-12',lot_size:65,tick_size:.05
        }]
      },
      chains:[{
        eventAt,availableAt,sourceRecordId:'VENDOR_CHAIN_'+d,
        data:{expiry:'2026-11-12',rows:[]}
      }]
    });
    quotes.push({
      eventAt,availableAt,sourceRecordId:'VENDOR_L1_'+d,
      instrumentKey:'NSE_FO|'+(100000+sessions.length-1),
      bid:99,ask:100,bidQty:500,askQty:500
    });
  }
  const raw:VerifiedHistoricalBundleV1={
    schemaVersion:'ADAPTIVE_VERIFIED_L1_BUNDLE_V1',
    provenance:{
      datasetId:'SYNTHETIC_PHASE15_FIXTURE',
      vendor:'FAKE_VENDOR_FOR_TESTS',
      licenseOrEntitlementReference:'NOT_REAL_LICENSE',
      sourceArtifactSha256:'b'.repeat(64),
      collection:'ORIGINAL_EVENT_FEED_ARCHIVE',
      timestampBasis:'ORIGINAL_EXCHANGE_OR_VENDOR_EVENT_TIME',
      originalAvailabilityTimestampRecorded:true,
      synthetic:true,calendarSource:'FAKE_VENDOR_SESSIONS',
      expectedSessions:sessions.map(x=>x.sessionDate)
    },
    instrument:'NIFTY',underlyingKey:'NSE_INDEX|Nifty 50',
    sessions,executionL1:quotes,declaredExchangeSessions:windows,
    policy:{
      holdCalendarDays:{'1W':1,'2W':2,'4W':4,'8W':8},
      slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
      maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
      maxExitDelayDays:2,minCalendarDaysBeforeExpiry:2,
      folds:[{
        trainStart:'2026-11-02',trainEnd:'2026-11-03',
        testStart:'2026-11-04',testEnd:'2026-11-06'
      }]
    },
    maximumOriginalFeedLatencySeconds:3
  };
  return{raw,calendar,sourceBytes:documentBytes};
}


const sourceArchive=Buffer.from('TEST_ONLY_VENDOR_ARCHIVE_COMPLETELY_UNLICENSED_SYNTHETIC');
const sigSha=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
type WitnessPacket=ReturnType<typeof fresh>;
function fresh(){
  const f=fixture();
  // Simulate an adversary who marks a fully synthetic sample "real".
  // Even two valid locally minted signatures are NOT actual exchange proof.
  f.raw.provenance.synthetic=false;
  f.raw.provenance.sourceArtifactSha256=sigSha(sourceArchive);
  const keys=([
    ['CALENDAR_REVIEWER','REVIEWER_CALENDAR_001'],
    ['ORIGINAL_L1_REVIEWER','REVIEWER_ORIGINAL_L1_002']
  ] as const).map(([role,reviewerId])=>{
    const pair=generateKeyPairSync('ed25519');
    const publicKeySpkiPem=pair.publicKey.export({
      type:'spki',format:'pem'
    }).toString();
    const publicKeySpkiSha256=sigSha(pair.publicKey.export({
      type:'spki',format:'der'
    }) as Buffer);
    return {role,reviewerId,publicKeySpkiPem,publicKeySpkiSha256,
      privateKey:pair.privateKey};
  });
  const operatorTrust:OperatorPinnedReviewerTrust={
    schemaVersion:'ADAPTIVE_OPERATOR_PINNED_REVIEWERS_V1',
    trustSource:'OPERATOR_PINNED_UNVERIFIED',
    reviewers:keys.map(({role,reviewerId,publicKeySpkiPem,publicKeySpkiSha256})=>
      ({role,reviewerId,publicKeySpkiPem,publicKeySpkiSha256}))
  };
  const envelope:ResearchEvidenceWitnessEnvelope={
    schemaVersion:'ADAPTIVE_SIGNED_RESEARCH_EVIDENCE_V1',
    studyProtocolId:'SYNTHETIC_REVIEW_PROTOCOL_TEST_001',
    datasetId:f.raw.provenance.datasetId,instrument:f.raw.instrument,
    bundleSha256:'',vendorArtifactSha256:'',calendarManifestSha256:'',
    calendarDocumentSha256:'',calendarCoverageStart:f.calendar.coverageStart,
    calendarCoverageEnd:f.calendar.coverageEnd,witnesses:[]
  };
  const input={
    bundleBytes:Buffer.from(JSON.stringify(f.raw)),
    vendorArchiveBytes:Buffer.from(sourceArchive),
    calendarManifestBytes:Buffer.from(JSON.stringify(f.calendar)),
    calendarDocumentBytes:Buffer.from(documentBytes),
    operatorTrust,envelope
  };
  const obj={f,keys,input};
  reSign(obj);
  return obj;
}
function reSign(w:ReturnType<typeof fresh>){
  w.input.bundleBytes=Buffer.from(JSON.stringify(w.f.raw));
  w.input.calendarManifestBytes=Buffer.from(JSON.stringify(w.f.calendar));
  const e=w.input.envelope;
  e.bundleSha256=sigSha(w.input.bundleBytes);
  e.vendorArtifactSha256=sigSha(w.input.vendorArchiveBytes);
  e.calendarManifestSha256=sigSha(w.input.calendarManifestBytes);
  e.calendarDocumentSha256=sigSha(w.input.calendarDocumentBytes);
  e.calendarCoverageStart=w.f.calendar.coverageStart;
  e.calendarCoverageEnd=w.f.calendar.coverageEnd;
  const signingTime='2026-11-20T10:00:00.000Z';
  e.witnesses=w.keys.map(k=>{
    const witness={role:k.role,reviewerId:k.reviewerId,signedAt:signingTime};
    const signatureBase64=sign(null,
      buildAdaptiveEvidenceWitnessPayload(e,witness),
      k.privateKey).toString('base64');
    return {...witness,signatureBase64};
  });
}
const audit=(w:WitnessPacket)=>
  auditAdaptiveSignedEvidenceWitness(w.input);

describe('Phase 16 operator-pinned Ed25519 evidence bindings, no trading permission',()=>{
  it('valid two-role signatures bind source/ledger bytes; maximum means EXTERNAL review, NOT authenticity',()=>{
    const w=fresh();
    const r=audit(w),repeated=audit(w);
    assert.deepEqual(r,repeated);
    assert.equal(r.status,'SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED');
    assert.equal(r.sourceChecksumMatched,true);
    assert.equal(r.calendarChecksumMatched,true);
    assert.equal(r.reviewedExchangeCalendarConsistent,true);
    assert.equal(r.validDetachedWitnessCount,2);
    assert.equal(r.signedPayloadSha256ByRole.CALENDAR_REVIEWER?.length,64);
    assert.equal(r.pinnedKeyFingerprintByRole.ORIGINAL_L1_REVIEWER?.length,64);
    assert.equal(r.datasetId,'SYNTHETIC_PHASE15_FIXTURE');
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.nativeBrokerProtectionInstalled,false);
    assert.equal(r.exchangeIssuerAuthenticated,false);
    assert.equal(r.vendorDataOriginAuthenticated,false);
    assert.equal(r.originalAvailabilityClockAuthenticated,false);
    assert.equal(r.historicalLicenseIndependentlyVerified,false);
    assert.equal(r.reviewerIdentityIndependentlyAuthenticated,false);
    assert.equal(r.trustedTimestampEstablished,false);
    assert.ok(r.externalReviewChecklist.length>2);
  });
  it('rejects a different source archive, even with original signed envelope untouched',()=>{
    const w=fresh();
    w.input.vendorArchiveBytes=Buffer.from('TAMPERED');
    const r=audit(w);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('ORIGINAL_L1_ARCHIVE_SHA256_GATE_NOT_SATISFIED'));
    assert.equal(r.validDetachedWitnessCount,0);
  });
  it('rejects any derived bundle bit change, even if the separate archive is unchanged',()=>{
    const w=fresh();
    w.f.raw.provenance.datasetId='NEW_RESEARCH_DATASET';
    w.input.bundleBytes=Buffer.from(JSON.stringify(w.f.raw));
    const r=audit(w);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('SIGNED_ENVELOPE_NOT_BOUND_TO_EXACT_ORIGINAL_FILES'));
  });
  it('rejects an altered separate calendar manifest with formerly valid detached signatures',()=>{
    const w=fresh();
    w.f.calendar.issuerName='ANOTHER_CLAIMED_FAKE_ISSUER';
    w.input.calendarManifestBytes=Buffer.from(JSON.stringify(w.f.calendar));
    const r=audit(w);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('SIGNED_ENVELOPE_NOT_BOUND_TO_EXACT_ORIGINAL_FILES'));
  });
  it('valid re-signing cannot hide a complete missing OOS trading session in source bundle',()=>{
    const w=fresh();
    w.f.raw.sessions=w.f.raw.sessions.filter(s=>
      s.sessionDate!=='2026-11-04');
    w.f.raw.provenance.expectedSessions=w.f.raw.sessions.map(s=>s.sessionDate);
    reSign(w);
    const r=audit(w);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.equal(r.validDetachedWitnessCount,2);
    assert.ok(r.calendarBlockers.includes(
      'MISSING_ENTIRE_HISTORICAL_DECISION_SESSION'));
    assert.equal(r.executionAuthorized,false);
  });
  it('synthetic data self-signed by two reviewers remains blocked from REAL-market package',()=>{
    const w=fresh();
    w.f.raw.provenance.synthetic=true;
    reSign(w);
    const r=audit(w);
    assert.equal(r.status,'BLOCKED_INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes('SYNTHETIC_SOURCE_CANNOT_CLAIM_REAL_MARKET_REVIEW'));
    assert.equal(r.exchangeIssuerAuthenticated,false);
  });
  it('a wrong signature, role or claimed signing time is fail-closed',()=>{
    const wrong=fresh();
    wrong.input.envelope.witnesses[0].signatureBase64=
      Buffer.alloc(64,12).toString('base64');
    assert.ok(audit(wrong).errors.includes(
      'INVALID_DETACHED_ED25519_WITNESS_SIGNATURE'));
    const role=fresh();
    role.input.envelope.witnesses[1].role='CALENDAR_REVIEWER';
    assert.ok(audit(role).errors.includes(
      'INVALID_OR_NONCHRONOLOGICAL_DETACHED_WITNESS'));
    const timestamp=fresh();
    timestamp.input.envelope.witnesses[0].signedAt=
      '2026-10-01T00:00:00Z';
    assert.ok(audit(timestamp).errors.includes(
      'INVALID_OR_NONCHRONOLOGICAL_DETACHED_WITNESS'));
  });
  it('a public key replacement or duplicate role/key cannot fake reviewer separation',()=>{
    const wrong=fresh();
    wrong.input.operatorTrust.reviewers[0].publicKeySpkiSha256=
      'a'.repeat(64);
    assert.ok(audit(wrong).errors.includes(
      'WRONG_PINNED_KEY_FINGERPRINT_OR_SIGNER_REUSE'));
    const same=fresh();
    same.input.operatorTrust.reviewers[1].publicKeySpkiPem=
      same.input.operatorTrust.reviewers[0].publicKeySpkiPem;
    same.input.operatorTrust.reviewers[1].publicKeySpkiSha256=
      same.input.operatorTrust.reviewers[0].publicKeySpkiSha256;
    assert.ok(audit(same).errors.includes(
      'WRONG_PINNED_KEY_FINGERPRINT_OR_SIGNER_REUSE'));
    const reusedRole=fresh();
    reusedRole.input.operatorTrust.reviewers[1].role='CALENDAR_REVIEWER';
    assert.ok(audit(reusedRole).errors.includes(
      'MALFORMED_OR_DUPLICATE_PINNED_REVIEWER'));
  });
  it('rejects wrong or missing separate calendar document, even with plausible signatures',()=>{
    const missing=fresh();
    missing.input.calendarDocumentBytes=Buffer.from('WRONG_CALENDAR_DOC');
    const r=audit(missing);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('PHASE15_SEPARATE_CALENDAR_DOCUMENT_REJECTED'));
    const absent=fresh();
    (absent.input as {calendarDocumentBytes:Buffer|null}).
      calendarDocumentBytes=null;
    assert.equal(audit(absent).status,'REJECTED');
  });
  it('requires a separately pinned operator trust registry; a reviewer cannot self-declare it in a bundle',()=>{
    const w=fresh();
    const wrong={...w.input,operatorTrust:null};
    assert.equal(auditAdaptiveSignedEvidenceWitness(wrong).status,'REJECTED');
    assert.ok(auditAdaptiveSignedEvidenceWitness(wrong).errors.includes(
      'INVALID_OR_MISSING_OUT_OF_BAND_PINNED_REVIEWER_REGISTRY'));
    w.input.operatorTrust.trustSource='SELF_DECLARED' as
      OperatorPinnedReviewerTrust['trustSource'];
    assert.equal(audit(w).status,'REJECTED');
  });
  it('role/key pinned identity claims still cannot establish a real issuer or timestamp',()=>{
    const w=fresh();
    // Even a self-declared fake issuer is consistent with locally created signatures.
    w.f.calendar.issuerName='CLAIMED_OFFICIAL_EXCHANGE_UNVERIFIED';
    reSign(w);
    const r=audit(w);
    assert.equal(r.status,'SIGNED_BINDINGS_VALID_EXTERNAL_REVIEW_REQUIRED');
    assert.equal(r.exchangeIssuerAuthenticated,false);
    assert.equal(r.reviewerIdentityIndependentlyAuthenticated,false);
    assert.equal(r.trustedTimestampEstablished,false);
    assert.ok(r.warnings.some(s=>s.includes('FORGED_CALENDAR')));
  });
});
