import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  auditAdaptiveOriginalL1CaptureContinuity,
  validateOriginalL1CaptureContinuityPolicy,
  type OriginalL1CaptureContinuityPolicy
} from '../../server/engine/ema15m/adaptiveOriginalL1CaptureContinuity.js';
import type {VerifiedHistoricalBundleV1} from
  '../../server/engine/ema15m/adaptiveVendorIngestion.js';
import type {IndependentlySuppliedCalendarEvidence} from
  '../../server/engine/ema15m/adaptiveCrossSourceCalendarAudit.js';

const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const DAYS=['2026-11-02','2026-11-03','2026-11-04'];
const at=(d:string,minute:number,special=false)=>{
  const start=special?18*60:9*60+15;
  const all=start+minute;
  return d+'T'+String(Math.floor(all/60)).padStart(2,'0')+':'+
    String(all%60).padStart(2,'0')+':00+05:30';
};
const policy=():OriginalL1CaptureContinuityPolicy=>({
  schemaVersion:'ADAPTIVE_ORIGINAL_NATIVE_L1_CAPTURE_CONTINUITY_V1',
  minimumSourceEventsPerTradingDay:6,
  maximumSourceWideSilenceMinutes:5,
  maximumFirstSourceEventLagMinutes:0,
  maximumLastSourceEventLeadMinutes:0,
  minimumEventsPerObservedInstrumentDay:6,
  maximumPerInstrumentObservedSilenceMinutes:5,
  maximumEventToOriginalReceiptSeconds:5,
  originalSequenceSemantics:
    'VENDOR_ATTESTED_CONTIGUOUS_PER_INSTRUMENT_DAY'
});
function fixture(){
  const cal:IndependentlySuppliedCalendarEvidence={
    schemaVersion:'ADAPTIVE_CROSS_SOURCE_CALENDAR_V1',
    exchange:'NSE',
    issuerName:'SYNTHETIC_SCHEDULE_NOT_AUTHENTIC',
    originalDocumentId:'SYNTHETIC_ORIGINAL_DOC',
    originalDocumentSha256:'a'.repeat(64),
    coverageStart:DAYS[0],coverageEnd:DAYS[DAYS.length-1],
    days:DAYS.map((d,i)=>({
      sessionDate:d,kind:'TRADING' as const,
      sessionKind:i===2?'SPECIAL' as const:'REGULAR' as const,
      sourceRecordId:'SYNTH_CALENDAR_'+d,
      openAt:at(d,0,i===2),closeAt:at(d,30,i===2)
    })),
    contractExpiries:[{instrument:'NIFTY',expiryDate:'2026-11-12',
      sourceRecordId:'FAKE_ORIGINAL_EXPIRY'}]
  };
  const key='NSE_FO|100001';
  const contract={
    instrument_key:key,segment:'NSE_FO',
    underlying_symbol:'NIFTY',underlying_key:'NSE_INDEX|Nifty 50',
    trading_symbol:'SYNTHETIC_CALL_ONLY',instrument_type:'CE' as const,
    expiry:'2026-11-12',strike_price:25000,lot_size:65,tick_size:.05
  };
  const quotes:VerifiedHistoricalBundleV1['executionL1']=[];
  for(const [i,d] of DAYS.entries()){
    for(let k=0;k<=6;k++){
      const time=at(d,k*5,i===2);
      quotes.push({
        sourceRecordId:'FAKE_VENDOR_L1_'+i+'_'+k,
        sourceSequence:100+k,instrumentKey:key,
        eventAt:time,availableAt:time,bid:99+k,ask:100+k,
        bidQty:650,askQty:650
      });
    }
  }
  const raw:VerifiedHistoricalBundleV1={
    schemaVersion:'ADAPTIVE_VERIFIED_L1_BUNDLE_V1',
    provenance:{
      datasetId:'SYNTHETIC_PHASE23_SOURCE_COVERAGE',
      vendor:'FAKE_VENDOR_NO_LICENSE',
      licenseOrEntitlementReference:'FABRICATED_ENTITLEMENT',
      sourceArtifactSha256:'b'.repeat(64),
      collection:'LICENSED_HISTORICAL_L1',
      timestampBasis:'ORIGINAL_EXCHANGE_OR_VENDOR_EVENT_TIME',
      originalAvailabilityTimestampRecorded:true,
      synthetic:false,calendarSource:'SYNTHETIC_CALENDAR_NOT_ISSUER',
      expectedSessions:DAYS
    },
    instrument:'NIFTY',underlyingKey:'NSE_INDEX|Nifty 50',
    sessions:DAYS.map((d,i)=>{
      const early=at(d,0,i===2);
      return{
        sessionDate:d,decisionAt:at(d,10,i===2),
        underlyingCandles:[{timestamp:early,open:25000,
          high:25010,low:24990,close:25003,isClosed:true}],
        contracts:{
          eventAt:early,availableAt:early,
          sourceRecordId:'SYNTH_CONTRACT_'+d,data:[contract]
        },
        chains:[{
          eventAt:early,availableAt:early,
          sourceRecordId:'SYNTH_CHAIN_'+d,
          data:{expiry:'2026-11-12',rows:[]}
        }]
      };
    }),
    executionL1:quotes,
    maximumOriginalFeedLatencySeconds:5,
    policy:{
      holdCalendarDays:{'1W':1,'2W':2,'4W':4,'8W':8},
      slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
      maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
      maxExitDelayDays:2,minCalendarDaysBeforeExpiry:2,
      folds:[{trainStart:DAYS[0],trainEnd:DAYS[1],
        testStart:DAYS[2],testEnd:DAYS[2]}]
    }
  };
  const prespecified=policy();
  const audit=()=>{
    const bytes=Buffer.from(JSON.stringify(prespecified));
    return auditAdaptiveOriginalL1CaptureContinuity(
      Buffer.from(JSON.stringify(raw)),
      Buffer.from(JSON.stringify(cal)),
      bytes,digest(bytes));
  };
  return {raw,cal,prespecified,audit};
}
describe('Phase23 original L1 capture coverage, no false source or fill authentication',()=>{
  it('internally consistent but completely fabricated 3-day L1 source cannot become licensed or executable',()=>{
    const x=fixture(),r=x.audit();
    assert.equal(r.status,
      'OBSERVED_SOURCE_COVERAGE_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED');
    assert.equal(r.errors.length,0);
    assert.equal(r.blockers.length,0);
    assert.equal(r.expectedTradingDays,3);
    assert.equal(r.observedTradingDays,3);
    assert.equal(r.originalSourceEvents,21);
    assert.equal(r.sourceWideGapDays,0);
    assert.equal(r.sourceSequenceHoles,0);
    assert.equal(r.dayCoverage[2].numberOriginalSourceEvents,7);
    assert.equal(r.sourceOriginalityIndependentlyAuthenticated,false);
    assert.equal(r.vendorSequenceSemanticsIndependentlyAuthenticated,false);
    assert.equal(r.originalReceiptClockIndependentlyAuthenticated,false);
    assert.equal(r.nativeBrokerStopOrFillProven,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.deepEqual(x.audit(),r);
  });
  it('one legitimate-looking option quote per day is not sufficient L1 history',()=>{
    const x=fixture();
    x.raw.executionL1=x.raw.executionL1.filter(q=>
      q.sourceSequence===102);
    const r=x.audit();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.observedTradingDays,3);
    assert.equal(r.sourceWideGapDays,3);
    assert.equal(r.instrumentDaysInsufficientOrStale,3);
    assert.ok(r.blockers.includes('ORIGINAL_DAY_FEED_COVERAGE_OR_SEQUENCE_INCOMPLETE'));
  });
  it('a missing entire losing-date source does not disappear from the official trading calendar',()=>{
    const x=fixture();
    x.raw.executionL1=x.raw.executionL1.filter(q=>
      !q.eventAt.startsWith(DAYS[1]));
    const r=x.audit();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.expectedTradingDays,3);
    assert.equal(r.observedTradingDays,2);
    assert.equal(r.absentSourceTradingDays,1);
    assert.equal(r.dayCoverage.find(d=>d.sessionDate===DAYS[1])?.
      numberOriginalSourceEvents,0);
  });
  it('missing observed opening or closing edge quote is flagged, not interpolated',()=>{
    const x=fixture();
    x.raw.executionL1=x.raw.executionL1.filter(q=>
      !(q.eventAt.startsWith(DAYS[0])&&
        [100,106].includes(q.sourceSequence!)));
    const r=x.audit();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.sourceStartOrEndBlindDays,1);
    assert.equal(r.dayCoverage[0].firstEventBlindMinutes,5);
    assert.equal(r.dayCoverage[0].lastEventBlindMinutes,5);
  });
  it('a vendor-ATTESTED contiguous source sequence 100, 101, 104 is missing two original events',()=>{
    const x=fixture();
    x.raw.executionL1=x.raw.executionL1.filter(q=>
      !(q.eventAt.startsWith(DAYS[1])&&
        [102,103].includes(q.sourceSequence!)));
    const r=x.audit();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.sourceSequenceHoles,2);
    assert.ok(r.dayCoverage[1].reasons.includes(
      'DECLARED_CONTIGUOUS_SOURCE_SEQUENCE_HAS_MISSING_EVENTS'));
    assert.equal(r.sourceOriginalityIndependentlyAuthenticated,false);
  });
  it('vendor sequence only MONOTONIC has unknown packet-gap semantics, never proves gapless',()=>{
    const x=fixture();
    x.prespecified.originalSequenceSemantics=
      'MONOTONIC_ONLY_GAPS_UNINTERPRETABLE';
    x.raw.executionL1=x.raw.executionL1.filter(q=>
      !(q.eventAt.startsWith(DAYS[1])&&q.sourceSequence===103));
    const r=x.audit();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.sourceSequenceHoles,0);
    assert.equal(r.vendorSequenceSemanticsIndependentlyAuthenticated,false);
    assert.ok(r.dayCoverage[1].reasons.includes(
      'SOURCE_WIDE_ORIGINAL_L1_EVENT_SILENCE_TOO_LONG'));
  });
  it('original source sequence omitted, duplicated or going backwards cannot certify claimed contiguous feed',()=>{
    const x=fixture();
    delete x.raw.executionL1[0].sourceSequence;
    assert.equal(x.audit().status,'INCOMPLETE_EVIDENCE');
    assert.ok(x.audit().dayCoverage[0].reasons.includes(
      'ORIGINAL_L1_SOURCE_SEQUENCE_NOT_PRESERVED'));
    const y=fixture();
    y.raw.executionL1[2].sourceSequence=100;
    assert.ok(y.audit().dayCoverage[0].reasons.includes(
      'ORIGINAL_L1_SOURCE_SEQUENCE_NOT_MONOTONIC'));
  });
  it('vendor original receipt clock in FUTURE or beyond locked latency is rejected even with a BID',()=>{
    const x=fixture();
    x.raw.executionL1[0].availableAt=
      '2026-11-02T09:20:10+05:30';
    const r=x.audit();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.eventReceiptClockViolations,1);
    assert.ok(r.blockers.includes(
      'SOURCE_EVENT_TO_ORIGINAL_RECEIPT_CLOCK_VIOLATIONS'));
    const y=fixture();
    y.raw.executionL1[0].availableAt=
      '2026-11-02T09:14:59+05:30';
    assert.equal(y.audit().eventReceiptClockViolations,1);
  });
  it('wrong official trading date or expired CE/PE instrument quote cannot become a candidate',()=>{
    const x=fixture();
    x.raw.executionL1[0].eventAt='2026-11-01T09:15:00+05:30';
    x.raw.executionL1[0].availableAt=x.raw.executionL1[0].eventAt;
    const r=x.audit();
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.unknownOrExpiredInstrumentEvents,1);
    const y=fixture();
    y.raw.executionL1[0].instrumentKey='NSE_FO|999999';
    assert.equal(y.audit().unknownOrExpiredInstrumentEvents,1);
  });
  it('duplicate source ID or event/receipt timestamp is a hard gap in source integrity',()=>{
    const x=fixture();
    x.raw.executionL1[2].sourceRecordId=
      x.raw.executionL1[1].sourceRecordId;
    assert.equal(x.audit().duplicateSourceIdsOrClocks,1);
    assert.equal(x.audit().status,'INCOMPLETE_EVIDENCE');
    const y=fixture();
    y.raw.executionL1[2].eventAt=y.raw.executionL1[1].eventAt;
    y.raw.executionL1[2].availableAt=y.raw.executionL1[1].availableAt;
    assert.equal(y.audit().duplicateSourceIdsOrClocks,1);
  });
  it('tampered or posthoc changed source coverage policy cannot bypass out-of-band SHA pin',()=>{
    const x=fixture();
    const bytes=Buffer.from(JSON.stringify(x.prespecified));
    x.prespecified.minimumSourceEventsPerTradingDay=2;
    const r=auditAdaptiveOriginalL1CaptureContinuity(
      Buffer.from(JSON.stringify(x.raw)),Buffer.from(JSON.stringify(x.cal)),
      Buffer.from(JSON.stringify(x.prespecified)),digest(bytes));
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes(
      'ORIGINAL_CAPTURE_CONTINUITY_POLICY_NOT_INDEPENDENTLY_SHA_PINNED'));
    assert.equal(r.executionAuthorized,false);
  });
  it('invalid predeclared staleness/latency/semantics is rejected, not optimized on OOS',()=>{
    for(const value of [
      {...policy(),minimumSourceEventsPerTradingDay:1},
      {...policy(),maximumSourceWideSilenceMinutes:0},
      {...policy(),maximumEventToOriginalReceiptSeconds:301},
      {...policy(),originalSequenceSemantics:'AUTO_ASSUME_GAPLESS'}
    ]){
      assert.deepEqual(validateOriginalL1CaptureContinuityPolicy(
        value as OriginalL1CaptureContinuityPolicy),
        ['INVALID_PREDECLARED_ORIGINAL_L1_CAPTURE_CONTINUITY_POLICY']);
    }
  });
  it('special sessions use source-calendar clock times, not a hardcoded cash/index cutoff',()=>{
    const x=fixture();
    const special=x.audit().dayCoverage[2];
    assert.equal(special.sessionDate,DAYS[2]);
    assert.equal(special.firstEventBlindMinutes,0);
    assert.equal(special.lastEventBlindMinutes,0);
    assert.equal(special.maximumSourceWideSilenceMinutes,5);
    assert.equal(x.audit().status,
      'OBSERVED_SOURCE_COVERAGE_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED');
  });
});
