import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  auditAdaptiveCrossSourceExchangeCalendar,
  type IndependentlySuppliedCalendarEvidence
} from '../../server/engine/ema15m/adaptiveCrossSourceCalendarAudit.js';
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
const run=(f:ReturnType<typeof fixture>)=>
  auditAdaptiveCrossSourceExchangeCalendar(f.raw,f.calendar,f.sourceBytes);

describe('Phase 15 separate-calendar cross-source evidence must never authorize trading',()=>{
  it('best case is only CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED',()=>{
    const f=fixture();
    const x=run(f),y=run(f);
    assert.deepEqual(x,y);
    assert.equal(x.status,'CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED');
    assert.equal(x.sourceChecksumMatched,true);
    assert.equal(x.originalCalendarDocumentSha256,docSha);
    assert.equal(x.coveredCalendarDays,12);
    assert.equal(x.coveredClosedDays,3);
    assert.equal(x.coveredTradingDays,9);
    assert.equal(x.specialSessionDays,1);
    assert.equal(x.sourceDecisionSessions,5);
    assert.equal(x.foldCoverage[0].expectedTradingDecisions,3);
    assert.equal(x.foldCoverage[0].observedTradingDecisions,3);
    assert.equal(x.executionAuthorized,false);
    assert.equal(x.productionSafe,false);
    assert.equal(x.profitabilityProven,false);
    assert.equal(x.exchangeCalendarIndependentlyAuthenticated,false);
    assert.equal(x.originalExpiryScheduleIndependentlyAuthenticated,false);
    assert.equal(x.sourceDocumentIssuerVerified,false);
    assert.equal(x.originalFeedClockIndependentlyAuthenticated,false);
  });
  it('separate original source bytes are mandatory; SHA match still is not authentication',()=>{
    const f=fixture();
    assert.deepEqual(
      auditAdaptiveCrossSourceExchangeCalendar(f.raw,f.calendar,null).errors,
      ['SEPARATELY_RETAINED_CALENDAR_SOURCE_DOCUMENT_REQUIRED']
    );
    const altered=auditAdaptiveCrossSourceExchangeCalendar(
      f.raw,f.calendar,Buffer.from('OTHER_FAKE_BYTES')
    );
    assert.equal(altered.status,'REJECTED');
    assert.ok(altered.errors.includes('CALENDAR_DOCUMENT_SHA256_MISMATCH'));
    f.raw.provenance.sourceArtifactSha256=docSha;
    const duplicated=run(f);
    assert.equal(duplicated.status,'REJECTED');
    assert.ok(duplicated.errors.includes(
      'CALENDAR_DOCUMENT_MUST_DIFFER_FROM_VENDOR_L1_ARTIFACT'));
  });
  it('an omitted entire vendor trading session cannot hide behind self-declared vendor calendar',()=>{
    const f=fixture();
    f.raw.declaredExchangeSessions=f.raw.declaredExchangeSessions!.filter(x=>
      x.sessionDate!=='2026-11-09'
    );
    const x=run(f);
    assert.equal(x.status,'INCOMPLETE_EVIDENCE');
    assert.equal(x.missingVendorTradingSessions,1);
    assert.ok(x.blockers.includes('VENDOR_OMITTED_CALENDAR_TRADING_SESSIONS'));
  });
  it('omitting a losing decision day and editing vendor expectedSessions still fails separate calendar',()=>{
    const f=fixture();
    f.raw.sessions=f.raw.sessions.filter(s=>s.sessionDate!=='2026-11-04');
    f.raw.provenance.expectedSessions=f.raw.sessions.map(s=>s.sessionDate);
    f.raw.executionL1=f.raw.executionL1.filter(q=>
      !q.sourceRecordId.includes('2026-11-04')
    );
    const x=run(f);
    assert.equal(x.status,'INCOMPLETE_EVIDENCE');
    assert.equal(x.missingDecisionSessions,1);
    assert.equal(x.foldCoverage[0].omittedExpectedTradingDecisions,1);
    assert.ok(x.blockers.includes('MISSING_ENTIRE_HISTORICAL_DECISION_SESSION'));
    assert.ok(x.blockers.includes('OOS_FOLD_MISSING_CALENDAR_TRADING_DECISIONS'));
  });
  it('legitimate closure days are not invented as missing trading observations',()=>{
    const f=fixture();
    const closed=f.calendar.days.filter(x=>x.kind==='CLOSED');
    assert.ok(closed.some(x=>x.sessionDate==='2026-11-07'));
    assert.ok(closed.some(x=>x.sessionDate==='2026-11-08'));
    const x=run(f);
    assert.equal(x.missingDecisionSessions,0);
    assert.equal(x.status,'CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED');
  });
  it('independently supplied special shorter/evening hours expose vendor false regular hours',()=>{
    const f=fixture();
    const s=f.raw.declaredExchangeSessions!.find(x=>
      x.sessionDate==='2026-11-05')!;
    s.openAt=at(s.sessionDate,'09:15');
    s.closeAt=at(s.sessionDate,'15:30');
    const x=run(f);
    assert.equal(x.status,'INCOMPLETE_EVIDENCE');
    assert.equal(x.mismatchedSessionWindows,1);
    assert.ok(x.blockers.includes(
      'VENDOR_OR_SPECIAL_SESSION_HOURS_DIFFER_FROM_SEPARATE_CALENDAR'
    ));
  });
  it('calendar declared closed but vendor traded is a blocked source conflict',()=>{
    const f=fixture();
    f.calendar.days=f.calendar.days.map(d=>d.sessionDate==='2026-11-04'?{
      sessionDate:d.sessionDate,kind:'CLOSED' as const,
      closureReason:'HOLIDAY' as const,sourceRecordId:d.sourceRecordId
    }:d);
    const x=run(f);
    assert.equal(x.status,'INCOMPLETE_EVIDENCE');
    assert.equal(x.extraVendorTradingSessions,1);
    assert.ok(x.blockers.includes('DECISION_ON_CALENDAR_CLOSED_OR_UNCOVERED_DATE'));
  });
  it('missing expiry schedule or expiry on a CLOSED date blocks all horizons',()=>{
    const f=fixture();
    f.calendar.contractExpiries=[];
    const x=run(f);
    assert.equal(x.status,'INCOMPLETE_EVIDENCE');
    assert.equal(x.missingContractExpiryReferences,5);
    assert.ok(x.blockers.includes(
      'POINT_IN_TIME_CONTRACT_EXPIRY_NOT_IN_SEPARATE_EXPIRY_SCHEDULE'));
    const y=fixture();
    for(const session of y.raw.sessions)
      session.contracts.data[0].expiry='2026-11-07';
    y.calendar.contractExpiries.push({
      instrument:'NIFTY',expiryDate:'2026-11-07',
      sourceRecordId:'SYNTHETIC_INVALID_WEEKEND_EXPIRY'
    });
    const z=run(y);
    assert.equal(z.nonTradingContractExpiryCount,5);
    assert.ok(z.blockers.includes('CONTRACT_EXPIRES_ON_NONTRADING_OR_UNCOVERED_DATE'));
  });
  it('a calendar that stops before 8W expiry cannot be accepted',()=>{
    const f=fixture();
    f.calendar.coverageEnd='2026-11-11';
    f.calendar.days=f.calendar.days.filter(x=>
      x.sessionDate<='2026-11-11'
    );
    const x=run(f);
    assert.equal(x.status,'INCOMPLETE_EVIDENCE');
    assert.ok(x.blockers.includes('EXPIRY_SCHEDULE_OUTSIDE_SEPARATE_CALENDAR_COVERAGE'));
    assert.ok(x.nonTradingContractExpiryCount>0);
  });
  it('out-of-session L1 or an original chain availability clock is not source-valid',()=>{
    const f=fixture();
    f.raw.executionL1[0].availableAt=at('2026-11-07','10:00');
    const x=run(f);
    assert.equal(x.status,'INCOMPLETE_EVIDENCE');
    assert.equal(x.optionL1OutsideCalendarCount,1);
    assert.ok(x.blockers.includes('ORIGINAL_L1_EVENT_OR_AVAILABILITY_OUTSIDE_SEPARATE_CALENDAR'));
    const y=fixture();
    y.raw.sessions[0].chains[0].availableAt=at('2026-11-07','10:00');
    const z=run(y);
    assert.ok(z.vendorSnapshotOrCandleOutsideCalendarCount>0);
    assert.ok(z.blockers.includes('VENDOR_CANDLE_OR_CHAIN_CLOCK_OUTSIDE_SEPARATE_CALENDAR'));
  });
  it('malformed, duplicate or unsorted day ledger is REJECTED',()=>{
    const f=fixture();
    f.calendar.days[1].sourceRecordId=f.calendar.days[0].sourceRecordId;
    const x=run(f);
    assert.equal(x.status,'REJECTED');
    assert.ok(x.errors.includes('INVALID_DUPLICATE_OR_UNSORTED_CALENDAR_DAY_EVIDENCE'));
    const g=fixture();
    g.calendar.days.splice(2,1);
    assert.ok(run(g).errors.includes('INCOMPLETE_DAY_BY_DAY_CALENDAR_LEDGER'));
  });
  it('wrong exchange instrument/underlying combination and uncovered OOS date fail closed',()=>{
    const f=fixture();
    f.calendar.exchange='BSE';
    const x=run(f);
    assert.equal(x.status,'REJECTED');
    assert.ok(x.errors.includes('EXCHANGE_AND_UNDERLYING_MARKET_MISMATCH'));
    const g=fixture();
    g.raw.policy.folds[0].testEnd='2026-11-19';
    const y=run(g);
    assert.equal(y.status,'INCOMPLETE_EVIDENCE');
    assert.ok(y.blockers.includes('OOS_FOLD_EXTENDS_OUTSIDE_SEPARATE_CALENDAR'));
  });
});
