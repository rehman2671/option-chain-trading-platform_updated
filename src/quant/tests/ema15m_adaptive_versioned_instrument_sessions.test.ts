import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  auditAdaptiveVersionedInstrumentSessions,
  type VersionedInstrumentSessionEvidence,
  type VersionedInstrumentTradingDay
} from '../../server/engine/ema15m/adaptiveVersionedInstrumentSessionAudit.js';
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


const digest=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
function setup(){
  const f=fixture();
  // Full union envelope may extend later than INDEX observation hours,
  // but only versioned, per-instrument windows make specific quotes valid.
  for(const d of f.calendar.days)
    if(d.kind==='TRADING'&&d.sessionKind==='REGULAR')
      d.closeAt=at(d.sessionDate,'15:45');
  for(const s of f.raw.declaredExchangeSessions??[])
    if(s.sessionDate!=='2026-11-05')
      s.closeAt=at(s.sessionDate,'15:45');
  const manifestBytes=Buffer.from(JSON.stringify(f.calendar));
  const days=f.calendar.days.filter(
    (d):d is Extract<typeof d,{kind:'TRADING'}>=>d.kind==='TRADING');
  const versions:VersionedInstrumentSessionEvidence['versions']=[
    {versionId:'SYNTH_RULE_PRE_EFFECTIVE',sourceCircularId:'TEST_RULE_OLD',
      sourcePublishedAt:'2026-10-10T12:00:00+05:30',
      effectiveFrom:'2026-11-01',effectiveThrough:'2026-11-04'},
    {versionId:'SYNTH_RULE_NEW_EFFECTIVE',sourceCircularId:'TEST_RULE_NEW',
      sourcePublishedAt:'2026-11-03T12:00:00+05:30',
      effectiveFrom:'2026-11-05',effectiveThrough:'2026-11-12'}
  ];
  const tradingDays:VersionedInstrumentTradingDay[]=days.map(d=>{
    const normal=d.sessionKind==='REGULAR';
    const underlyingIndexWindows=[{
      openAt:d.openAt,closeAt:normal?at(d.sessionDate,'15:30'):d.closeAt
    }];
    const nonExpiringOptionWindows=[{
      openAt:d.openAt,closeAt:d.closeAt
    }];
    const expiringOptionWindows=[{
      openAt:d.openAt,closeAt:normal?at(d.sessionDate,'15:30'):d.closeAt
    }];
    return{
      sessionDate:d.sessionDate,
      versionId:d.sessionDate<'2026-11-05'?
        'SYNTH_RULE_PRE_EFFECTIVE':'SYNTH_RULE_NEW_EFFECTIVE',
      sourceRecordId:'SYNTH_VERSIONED_WINDOW_'+d.sessionDate,
      sessionKind:d.sessionKind,
      underlyingIndexWindows,nonExpiringOptionWindows,
      expiringOptionWindows
    };
  });
  const schedule:VersionedInstrumentSessionEvidence={
    schemaVersion:'ADAPTIVE_VERSIONED_INSTRUMENT_SESSIONS_V1',
    exchange:'NSE',instrument:'NIFTY',
    studyProtocolId:'SYNTHETIC_PHASE18_REVIEW',
    originalCalendarManifestSha256:digest(manifestBytes),
    originalCalendarDocumentSha256:f.calendar.originalDocumentSha256,
    coverageStart:f.calendar.coverageStart,coverageEnd:f.calendar.coverageEnd,
    versions,tradingDays
  };
  const report=()=>{
    const scheduleBytes=Buffer.from(JSON.stringify(schedule));
    return auditAdaptiveVersionedInstrumentSessions(
      f.raw,f.calendar,manifestBytes,schedule,scheduleBytes);
  };
  return {f,manifestBytes,schedule,report};
}
describe('Phase 18 effective-dated instrument-level index/option time split',()=>{
  it('fully source-consistent synthetic windows stay NONEXECUTABLE with no authenticity claim',()=>{
    const a=setup(),r=a.report();
    assert.equal(r.errors.length,0);
    assert.equal(r.blockers.length,0);
    assert.equal(r.status,'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED');
    assert.equal(r.tradingDaysCovered,9);
    assert.equal(r.tradingDaysExpected,9);
    assert.equal(r.ruleVersionsApplied,2);
    assert.equal(r.specialSessionsReviewed,1);
    assert.ok(r.expiryCutoffExceptionDays>=1);
    assert.equal(r.optionL1OutsideInstrumentHours,0);
    assert.equal(r.originalIndexCandlesOutsideInstrumentHours,0);
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.issuerAuthenticated,false);
    assert.equal(r.originalClockAuthenticated,false);
    assert.equal(r.brokerFillsAuthenticated,false);
    assert.equal(r.brokerProtectionInstalled,false);
    assert.deepEqual(r,a.report());
  });
  it('15:40 ORIGINAL option quote can be valid on non-expiry session while index closes 15:30',()=>{
    const a=setup();
    const source=a.f.raw.executionL1[0];
    a.f.raw.executionL1.push({
      ...source,eventAt:at('2026-11-04','15:40'),
      availableAt:at('2026-11-04','15:40'),
      sourceRecordId:'SYNTHETIC_NONEXPIRING_OPTION_AFTER_INDEX_CLOSE'
    });
    const r=a.report();
    assert.equal(r.status,'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED');
    assert.equal(r.optionL1OutsideInstrumentHours,0);
  });
  it('15:40 expiry-day option BID is blocked even if broad exchange envelope remains open',()=>{
    const a=setup(),source=a.f.raw.executionL1[0];
    a.f.raw.executionL1.push({
      ...source,eventAt:at('2026-11-12','15:40'),
      availableAt:at('2026-11-12','15:40'),
      sourceRecordId:'SYNTHETIC_ILLEGAL_EXPIRING_OPTION_LATE_PRINT'
    });
    const r=a.report();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.optionL1OutsideInstrumentHours,1);
    assert.ok(r.blockers.includes('ORIGINAL_OPTION_L1_OUTSIDE_ITS_EXPIRY_CLASS_SESSION'));
  });
  it('same expiring option original BID at 15:20 is permitted by the independent schedule',()=>{
    const a=setup(),source=a.f.raw.executionL1[0];
    a.f.raw.executionL1.push({
      ...source,eventAt:at('2026-11-12','15:20'),
      availableAt:at('2026-11-12','15:20'),
      sourceRecordId:'SYNTHETIC_VALID_EXPIRY_BID'
    });
    assert.equal(a.report().status,'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED');
  });
  it('an option cannot magically remain tradable the day AFTER its own expiry',()=>{
    const a=setup(),source=a.f.raw.executionL1[0];
    a.f.raw.executionL1.push({
      ...source,eventAt:at('2026-11-13','09:20'),
      availableAt:at('2026-11-13','09:20'),
      sourceRecordId:'SYNTHETIC_POST_EXPIRY_FABRICATED_PRINT'
    });
    const r=a.report();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.quotesAfterOwnContractExpiry,1);
    assert.ok(r.blockers.includes('SOURCE_QUOTED_AN_ALREADY_EXPIRED_OPTION'));
  });
  it('15:40 index decision and closed 15m candle are invalid despite a valid option window',()=>{
    const a=setup();
    const row=a.f.raw.sessions.find(x=>x.sessionDate==='2026-11-04')!;
    row.decisionAt=at('2026-11-04','15:40');
    row.underlyingCandles.push({
      timestamp:at('2026-11-04','15:30'),open:25000,
      high:25010,low:24990,close:25005,isClosed:true
    });
    const r=a.report();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.decisionClockOutsideIndexHours,1);
    assert.equal(r.originalIndexCandlesOutsideInstrumentHours,1);
    assert.ok(r.blockers.includes(
      'CLOSED_INDEX_CANDLE_OUTSIDE_INSTRUMENT_SPECIFIC_SESSION'));
  });
  it('an expired contract in the catalog or option chain after its own cutoff blocks review',()=>{
    const a=setup();
    const decision=a.f.raw.sessions[0];
    decision.contracts.eventAt=at('2026-11-02','15:40');
    decision.contracts.availableAt=at('2026-11-02','15:41');
    // Nov 2 is not expiry: this is valid for nonexpiring options.
    assert.equal(a.report().status,'SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED');
    const b=setup();
    const session=b.f.raw.sessions[0];
    session.chains[0].eventAt=at('2026-11-02','15:50');
    assert.equal(b.report().status,'INCOMPLETE_EVIDENCE');
    assert.ok(b.report().contractCatalogOrChainOutsideOptionHours>=1);
  });
  it('a schedule revision cannot be applied BEFORE its effective date',()=>{
    const a=setup();
    a.schedule.tradingDays.find(d=>d.sessionDate==='2026-11-04')!.
      versionId='SYNTH_RULE_NEW_EFFECTIVE';
    const r=a.report();
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('RULE_APPLIED_OUTSIDE_DECLARED_EFFECTIVE_DATE'));
  });
  it('retroactively published or overlapping circular versions cannot silently reinterpret quotes',()=>{
    const a=setup();
    a.schedule.versions[1].sourcePublishedAt='2026-11-08T10:00:00+05:30';
    assert.ok(a.report().errors.includes(
      'INVALID_DUPLICATE_OVERLAPPING_OR_RETROACTIVE_RULE_VERSION'));
    const b=setup();
    b.schedule.versions[1].effectiveFrom='2026-11-04';
    assert.ok(b.report().errors.includes(
      'INVALID_DUPLICATE_OVERLAPPING_OR_RETROACTIVE_RULE_VERSION'));
    const lateSameDay=setup();
    // The fake new rule can appear valid by calendar DATE, but cannot
    // retroactively legalize earlier session quotes if first published after
    // that source session opened (18:00 special session in this fixture).
    lateSameDay.schedule.versions[1].sourcePublishedAt=
      '2026-11-05T18:30:00+05:30';
    assert.ok(lateSameDay.report().errors.includes(
      'RULE_PUBLISHED_AFTER_ORIGINAL_SESSION_OPEN'));
  });
  it('skipped special session, swapped exchange and expired catalog key are fail-closed',()=>{
    const a=setup();
    a.schedule.tradingDays=a.schedule.tradingDays.filter(d=>
      d.sessionDate!=='2026-11-05');
    assert.ok(a.report().errors.includes(
      'OMITTED_OR_EXTRA_TRADING_DAY_IN_SEGMENT_RULE_LEDGER'));
    const b=setup();b.schedule.exchange='BSE';
    assert.ok(b.report().errors.includes(
      'SEGMENT_SESSION_NOT_BOUND_TO_SAME_INDEPENDENT_EXCHANGE_CALENDAR'));
    const c=setup();c.f.raw.executionL1[0].instrumentKey='UNKNOWN|FAKE';
    assert.equal(c.report().status,'INCOMPLETE_EVIDENCE');
    assert.equal(c.report().missingInstrumentContractExpiryMappings,1);
  });
  it('segment windows cannot escape the separate broad session or hide a gap/overlap',()=>{
    const a=setup();
    a.schedule.tradingDays[0].nonExpiringOptionWindows[0].closeAt=
      at('2026-11-02','16:00');
    assert.ok(a.report().errors.includes(
      'SEGMENT_SESSION_WINDOWS_OVERLAP_OR_ESCAPE_EXCHANGE_ENVELOPE'));
    const b=setup();
    const row=b.schedule.tradingDays[0];
    row.underlyingIndexWindows=[{
      openAt:at(row.sessionDate,'09:15'),
      closeAt:at(row.sessionDate,'12:00')
    },{
      openAt:at(row.sessionDate,'11:50'),
      closeAt:at(row.sessionDate,'15:30')
    }];
    assert.ok(b.report().errors.includes(
      'SEGMENT_SESSION_WINDOWS_OVERLAP_OR_ESCAPE_EXCHANGE_ENVELOPE'));
  });
  it('rejects segment source claiming a different raw calendar manifest SHA or silently swapped in-memory rules',()=>{
    const a=setup();
    a.schedule.originalCalendarManifestSha256='f'.repeat(64);
    assert.ok(a.report().errors.includes(
      'SEGMENT_SESSION_NOT_BOUND_TO_SAME_INDEPENDENT_EXCHANGE_CALENDAR'));
    const b=setup();
    const rawBytes=Buffer.from(JSON.stringify(b.schedule));
    b.schedule.tradingDays[0].versionId='ANOTHER_RULE';
    const r=auditAdaptiveVersionedInstrumentSessions(
      b.f.raw,b.f.calendar,b.manifestBytes,b.schedule,rawBytes);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('UNBOUND_IN_MEMORY_SEGMENT_MANIFEST'));
  });
});

