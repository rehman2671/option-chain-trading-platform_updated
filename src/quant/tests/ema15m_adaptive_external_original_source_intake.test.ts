import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  auditAdaptiveExternalOriginalSourceIntake,
  type ExternalOriginalSourceIntakeV1
} from '../../server/engine/ema15m/adaptiveExternalOriginalSourceIntake.js';
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


const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function build(complete:boolean){
  const f=fixture();
  // Phase15's calendar fixture intentionally sets a 3-second maximum even
  // though its fake snapshots are 60 seconds apart. This Phase21 fixture
  // explicitly models a source-declared 120-second allowed original lag.
  f.raw.maximumOriginalFeedLatencySeconds=120;
  const vendorArchiveBytes=Buffer.from('FAKE_VENDOR_ARCHIVE_NOT_AN_AUTHENTIC_L1_FEED');
  f.raw.provenance.sourceArtifactSha256=sha(vendorArchiveBytes);
  if(complete){
    // Deliberately NOT actual exchange data: this synthetic test simply
    // demonstrates that structural byte integrity can be faked by a caller.
    f.raw.provenance.synthetic=false;
    const first=f.raw.sessions[0].contracts.data[0].instrument_key;
    for(const d of f.calendar.days){
      if(d.kind!=='TRADING'||f.raw.executionL1.some(q=>
         q.eventAt.slice(0,10)===d.sessionDate))continue;
      const moment=at(d.sessionDate,d.sessionKind==='SPECIAL'?'18:30':'09:30');
      f.raw.executionL1.push({
        eventAt:moment,availableAt:moment,
        sourceRecordId:'FABRICATED_EXTRA_L1_'+d.sessionDate,
        instrumentKey:first,bid:110,ask:111,bidQty:650,askQty:650
      });
    }
  }
  const calendarManifestBytes=Buffer.from(JSON.stringify(f.calendar));
  const calendarDocumentBytes=f.sourceBytes;
  let bundleBytes=Buffer.from(JSON.stringify(f.raw));
  const calendarDays=f.calendar.days.filter(x=>x.kind==='TRADING');
  const intake:ExternalOriginalSourceIntakeV1={
    schemaVersion:'ADAPTIVE_EXTERNAL_ORIGINAL_SOURCE_INTAKE_V1',
    studyProtocolId:'TEST_ONLY_OFFLINE_PROTOCOL',
    datasetId:f.raw.provenance.datasetId,
    instrument:'NIFTY',exchange:'NSE',
    originalBundleSha256:sha(bundleBytes),
    originalVendorArchiveSha256:sha(vendorArchiveBytes),
    separatelySuppliedCalendarManifestSha256:sha(calendarManifestBytes),
    separatelySuppliedCalendarDocumentSha256:sha(calendarDocumentBytes),
    sourceProductCategory:complete?'LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE':'SYNTHETIC',
    quoteMethod:'ORIGINAL_NATIVE_BEST_BID_ASK_AND_BEST_LEVEL_QUANTITY',
    strategyAvailableAtMethod:'CAPTURED_AT_ORIGINAL_STRATEGY_RECEIPT',
    entitlementDocumentReferenceId:'FAKE_LICENSE_REFERENCE_NOT_AUTHENTICATION',
    originalSourceDeliveryReferenceId:'TEST_ONLY_SOURCE_DELIVERY_REFERENCE',
    contemporaneousCaptureEvidenceReferenceId:'TEST_ONLY_RECEIPT_LOG_REFERENCE',
    coverageStart:f.calendar.coverageStart,coverageEnd:f.calendar.coverageEnd,
    tradingDays:calendarDays.map(d=>({
      sessionDate:d.sessionDate,
      originalDeliveryRecordId:'FAKE_DELIVERY_RECORD_'+d.sessionDate,
      originalBestBidAskEvents:f.raw.executionL1.filter(q=>
        q.eventAt.slice(0,10)===d.sessionDate).length,
      originalStrategyDecisions:f.raw.sessions.filter(s=>
        s.sessionDate===d.sessionDate).length
    }))
  };
  const rebindBundle=()=>{
    bundleBytes=Buffer.from(JSON.stringify(f.raw));
    intake.originalBundleSha256=sha(bundleBytes);
  };
  const run=()=>auditAdaptiveExternalOriginalSourceIntake(
    f.raw,bundleBytes,vendorArchiveBytes,
    f.calendar,calendarManifestBytes,calendarDocumentBytes,
    intake,Buffer.from(JSON.stringify(intake))
  );
  return {f,intake,run,rebindBundle,bundleBytes,
    vendorArchiveBytes,calendarManifestBytes,calendarDocumentBytes};
}
describe('Phase21 offline source procurement intake, no false historical feed authenticity',()=>{
  it('complete but entirely fabricated and falsely non-synthetic declarations can ONLY be internally reconciled',()=>{
    const x=build(true),r=x.run();
    assert.equal(r.status,'SOURCE_DECLARATIONS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED');
    assert.equal(r.errors.length,0);
    assert.equal(r.blockers.length,0);
    assert.equal(r.expectedTradingDays,9);
    assert.equal(r.declaredTradingDays,9);
    assert.equal(r.sourceTradingDaysWithOriginalL1,9);
    assert.equal(r.sourceTradingDaysWithNoL1,0);
    assert.equal(r.totalSourceOptionL1Observations,9);
    assert.equal(r.originalLicensedL1IndependentlyAuthenticated,false);
    assert.equal(r.originalAvailabilityClockIndependentlyAuthenticated,false);
    assert.equal(r.historicalUsageEntitlementIndependentlyVerified,false);
    assert.equal(r.exchangeIssuerIndependentlyAuthenticated,false);
    assert.equal(r.reviewerIdentityIndependentlyAuthenticated,false);
    assert.equal(r.brokerNativeStopProtectionProven,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.deepEqual(x.run(),r);
    assert.equal(r.originalBundleSha256,x.intake.originalBundleSha256);
    assert.equal(r.calendarDocumentSha256,x.intake.separatelySuppliedCalendarDocumentSha256);
  });
  it('a source with missing 4 of 9 trading days is incomplete, not a clean five-day winner-only sample',()=>{
    const x=build(false),r=x.run();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.sourceTradingDaysWithNoL1,4);
    assert.equal(r.sourceTradingDaysWithOriginalL1,5);
    assert.ok(r.blockers.includes('EXCHANGE_TRADING_DAY_WITHOUT_ORIGINAL_OPTION_BEST_BID_ASK'));
    assert.ok(r.blockers.includes('SYNTHETIC_SOURCE_IS_NOT_LICENSED_HISTORICAL_OPTION_L1'));
  });
  it('NSE trade prints, EOD bhavcopy and proxy-as-BID cannot replace original option L1',()=>{
    for(const category of ['HISTORICAL_TRADE_ONLY','END_OF_DAY_BHAVCOPY'] as const){
      const x=build(true);x.intake.sourceProductCategory=category;
      assert.ok(x.run().blockers.includes('TRADE_OR_END_OF_DAY_DATA_IS_NOT_ORIGINAL_OPTION_L1'));
    }
    const x=build(true);
    x.intake.quoteMethod='TRADE_AS_PROXY_FOR_BID_ASK';
    assert.equal(x.run().status,'INCOMPLETE_EVIDENCE');
  });
  it('historical order/trade reconstruction is not independently recorded native best-bid/ask availability',()=>{
    const x=build(true);
    x.intake.sourceProductCategory='HISTORICAL_ORDER_TRADE_EVENTS';
    x.intake.quoteMethod='RECONSTRUCTED_BOOK_FROM_ALL_ORDER_MESSAGES';
    const r=x.run();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.ok(r.blockers.includes(
      'HISTORICAL_ORDER_EVENTS_NEED_FULL_BOOK_RECONSTRUCTION_AND_INDEPENDENT_CLOCK_AUDIT'));
  });
  it('a replay estimated availableAt or download timestamp is not a strategy-original receipt',()=>{
    const x=build(true);
    x.intake.strategyAvailableAtMethod='HISTORICAL_REPLAY_ESTIMATE';
    assert.ok(x.run().blockers.includes(
      'REPLAY_OR_DOWNLOAD_TIME_DOES_NOT_PROVE_ORIGINAL_STRATEGY_AVAILABILITY'));
    x.intake.strategyAvailableAtMethod='LATER_IMPORT_OR_FILE_DOWNLOAD_TIME';
    assert.equal(x.run().status,'INCOMPLETE_EVIDENCE');
  });
  it('tampered source vendor archive bytes reject original SHA binding even when the manifest is edited',()=>{
    const x=build(true);
    const changed=Buffer.from('MALICIOUS_DIFFERENT_VENDOR_SOURCE_BYTES');
    const a=auditAdaptiveExternalOriginalSourceIntake(
      x.f.raw,x.bundleBytes,changed,x.f.calendar,
      x.calendarManifestBytes,x.calendarDocumentBytes,x.intake,
      Buffer.from(JSON.stringify(x.intake)));
    assert.equal(a.status,'REJECTED');
    assert.ok(a.errors.includes(
      'ORIGINAL_VENDOR_BUNDLE_CALENDAR_OR_INTAKE_SOURCE_DIGEST_MISMATCH'));
  });
  it('source policy cannot replay different vendor quote objects against unchanged original bundle bytes',()=>{
    const x=build(true);
    x.f.raw.executionL1[0].bid=99999; // in-memory edit, original bytes unchanged
    const r=x.run();
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('SOURCE_BYTES_DIFFER_FROM_SUPPLIED_EVALUATION_OBJECTS'));
  });
  it('delivery ledger omission, unsorted trading days and reused delivery record IDs reject the package',()=>{
    const x=build(true);
    x.intake.tradingDays.pop();
    assert.ok(x.run().errors.includes('INTAKE_LEDGER_OMITS_OR_ADDS_EXCHANGE_TRADING_DAYS'));
    const y=build(true);
    const first=y.intake.tradingDays[0],second=y.intake.tradingDays[1];
    y.intake.tradingDays[0]=second;y.intake.tradingDays[1]=first;
    assert.ok(y.run().errors.includes(
      'INVALID_UNSORTED_OR_DUPLICATE_SOURCE_DELIVERY_SESSION_LEDGER'));
    const z=build(true);
    z.intake.tradingDays[2].originalDeliveryRecordId=
      z.intake.tradingDays[0].originalDeliveryRecordId;
    assert.equal(z.run().status,'REJECTED');
  });
  it('wrong BSE/NSE index, coverage or calendar document fingerprint is rejected',()=>{
    const x=build(true);x.intake.exchange='BSE';
    assert.ok(x.run().errors.includes(
      'INCOMPATIBLE_EXCHANGE_INSTRUMENT_DATASET_OR_CALENDAR_RANGE'));
    const y=build(true);
    y.intake.separatelySuppliedCalendarDocumentSha256='d'.repeat(64);
    assert.ok(y.run().errors.includes(
      'ORIGINAL_VENDOR_BUNDLE_CALENDAR_OR_INTAKE_SOURCE_DIGEST_MISMATCH'));
    const z=build(true);z.intake.coverageEnd='2026-11-10';
    assert.equal(z.run().status,'REJECTED');
  });
  it('a fake vendor session ledger cannot conceal actual zero quotes or change raw source counts',()=>{
    const x=build(true);
    x.intake.tradingDays[0].originalBestBidAskEvents=99;
    const r=x.run();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.countMismatches,1);
    assert.ok(r.blockers.includes('ORIGINAL_DAY_COUNT_MISMATCH_CANNOT_HIDE_MISSING_QUOTES'));
    const y=build(true);
    y.intake.tradingDays[0].originalStrategyDecisions=99;
    assert.equal(y.run().status,'INCOMPLETE_EVIDENCE');
  });
  it('unmapped original option key or impossible/duplicate event availability clock is incomplete',()=>{
    const x=build(true);
    x.f.raw.executionL1[0].instrumentKey='NSE_FO|MISSING_ORIGIN';
    x.rebindBundle();
    assert.equal(x.run().unrecognizedOriginalOptionContractKeys,1);
    assert.ok(x.run().blockers.includes(
      'ORIGINAL_OPTION_L1_WITHOUT_CONTEMPORANEOUS_CONTRACT_IDENTITY'));
    const y=build(true);
    y.f.raw.executionL1[1].sourceRecordId=y.f.raw.executionL1[0].sourceRecordId;
    y.rebindBundle();
    assert.equal(y.run().status,'INCOMPLETE_EVIDENCE');
    assert.ok(y.run().sourceOriginalClockViolations>=1);
    const z=build(true);
    z.f.raw.executionL1[0].availableAt='2026-11-02T08:00:00+05:30';
    z.rebindBundle();
    assert.ok(z.run().sourceOriginalClockViolations>=1);
  });
  it('source-provided original file bytes and independent original calendar document bytes are both mandatory',()=>{
    const x=build(true);
    const noArchive=auditAdaptiveExternalOriginalSourceIntake(
      x.f.raw,x.bundleBytes,null,x.f.calendar,x.calendarManifestBytes,
      x.calendarDocumentBytes,x.intake,Buffer.from(JSON.stringify(x.intake)));
    assert.equal(noArchive.status,'REJECTED');
    assert.ok(noArchive.errors.includes('MISSING_OR_MALFORMED_ORIGINAL_INTAKE_SOURCE_FILES'));
    const noCalendar=auditAdaptiveExternalOriginalSourceIntake(
      x.f.raw,x.bundleBytes,x.vendorArchiveBytes,x.f.calendar,x.calendarManifestBytes,
      null,x.intake,Buffer.from(JSON.stringify(x.intake)));
    assert.equal(noCalendar.status,'REJECTED');
  });
  it('manifest JSON bytes cannot hide a separately supplied edited in-memory provenance record',()=>{
    const x=build(true);
    const original=Buffer.from(JSON.stringify(x.intake));
    x.intake.originalSourceDeliveryReferenceId='SWAPPED_DELIVERY_RECORD_NOT_IN_FILE';
    const r=auditAdaptiveExternalOriginalSourceIntake(
      x.f.raw,x.bundleBytes,x.vendorArchiveBytes,
      x.f.calendar,x.calendarManifestBytes,x.calendarDocumentBytes,
      x.intake,original);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('INTAKE_MANIFEST_BYTES_DIFFER_FROM_EVALUATED_RECORDS'));
  });
});

