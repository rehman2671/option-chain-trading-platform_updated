import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  bridgeAdaptiveNativeL1Csv,
  type NativeL1CsvColumnMap
} from '../../server/engine/ema15m/adaptiveNativeL1CsvBridge.js';
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


const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const H=[
  'sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'
];
function setup(){
  const f=fixture();
  f.raw.provenance.synthetic=false;
  f.raw.maximumOriginalFeedLatencySeconds=120;
  const known=f.raw.sessions[0].contracts.data[0].instrument_key;
  const quotes=f.calendar.days.filter(d=>d.kind==='TRADING').map(d=>{
    const q=f.raw.executionL1.find(q=>
      q.eventAt.slice(0,10)===d.sessionDate);
    const eventAt=q?.eventAt??at(d.sessionDate,
      d.sessionKind==='SPECIAL'?'18:30':'09:30');
    const availableAt=q?.availableAt??eventAt;
    return [
      q?.sourceRecordId??'FAKE_ORIGINAL_SOURCE_'+d.sessionDate,
      '1',q?.instrumentKey??known,eventAt,availableAt,
      '99','100','650','650'
    ];
  });
  f.raw.executionL1=[];
  const calBytes=Buffer.from(JSON.stringify(f.calendar));
  const columns=Object.fromEntries(H.map(h=>[h,h]));
  const map:NativeL1CsvColumnMap={
    schemaVersion:'ADAPTIVE_NATIVE_L1_CSV_BRIDGE_V1',
    datasetId:f.raw.provenance.datasetId,instrument:'NIFTY',exchange:'NSE',
    originalVendorCsvSha256:'0'.repeat(64),
    sourceProductCategory:'LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE',
    originalStrategyClockMode:'CAPTURED_AT_ORIGINAL_CLIENT_RECEIPT',
    priceUnit:'INR_PER_OPTION_UNIT',
    bidAskQuantityUnit:'UNDERLYING_UNITS_NOT_LOTS',
    originalSequenceScope:'PER_INSTRUMENT_PER_TRADING_SESSION',
    columns:columns as NativeL1CsvColumnMap['columns']
  };
  const values=()=>Buffer.from([
    H.join(','),...quotes.map(row=>row.join(','))
  ].join('\r\n')+'\r\n');
  const execute=(pinOverride?:string,sourceOverride?:Uint8Array)=>{
    const source=values();
    map.originalVendorCsvSha256=digest(source);
    f.raw.provenance.sourceArtifactSha256=digest(source);
    const originalBundleBytes=Buffer.from(JSON.stringify(f.raw));
    const mapping=Buffer.from(JSON.stringify(map));
    const result=bridgeAdaptiveNativeL1Csv(
      originalBundleBytes,sourceOverride??source,calBytes,mapping,
      pinOverride??digest(mapping));
    return {result,source,mapping,originalBundleBytes};
  };
  return {f,quotes,map,values,execute,calBytes};
}
describe('Phase22 offline original native option CSV importer, unverified source origin',()=>{
  it('imports all ORIGINAL rows with unchanged source times, prices and sizes, without brokerage execution or vendor authentication',()=>{
    const x=setup(),{result,source}=x.execute();
    const r=result.report;
    assert.equal(r.status,
      'CANDIDATE_L1_ROWS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED');
    assert.equal(r.scannedRows,9);
    assert.equal(r.convertedRows,9);
    assert.equal(r.tradingDaysRequired,9);
    assert.equal(r.tradingDaysWithL1,9);
    assert.equal(r.tradingDaysMissingL1,0);
    assert.equal(r.distinctContracts,5);
    assert.equal(r.originalVendorCsvSha256,digest(source));
    assert.equal(r.invalidQuoteRows,0);
    assert.equal(r.invalidOrReplayedClocks,0);
    assert.equal(result.derivedBundle!.executionL1[0].bid,99);
    assert.equal(result.derivedBundle!.executionL1[0].sourceSequence,1);
    assert.equal(result.derivedBundle!.executionL1[0].ask,100);
    assert.equal(result.derivedBundle!.executionL1[0].bidQty,650);
    assert.equal(result.derivedBundle!.executionL1[0].availableAt,
      x.quotes[0][4]);
    assert.equal(result.derivedBundle!.provenance.synthetic,false);
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.profitabilityProven,false);
    assert.equal(r.historicalEntitlementIndependentlyVerified,false);
    assert.equal(r.vendorAndExchangeAuthenticityProven,false);
    assert.equal(r.historicReceiptClockAuthenticated,false);
    assert.equal(r.realBrokerExecutionFillsAuthenticated,false);
    assert.equal(r.nativeBrokerStopsInstalled,false);
    assert.deepEqual(x.execute().result.report,r);
  });
  it('existing original quote rows must match EVERY original source CSV value, not favorable replacements',()=>{
    const x=setup(),first=x.execute();
    x.f.raw.executionL1=first.result.derivedBundle!.executionL1;
    const matches=x.execute().result;
    assert.equal(matches.report.status,
      'CANDIDATE_L1_ROWS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED');
    assert.equal(matches.report.matchedExistingBundleRows,9);
    x.f.raw.executionL1[0].bid=999;
    const altered=x.execute().result;
    assert.equal(altered.report.status,'REJECTED');
    assert.ok(altered.report.errors.includes(
      'CSV_AND_EXISTING_ORIGINAL_BUNDLE_L1_ROWS_DISAGREE'));
    assert.equal(altered.derivedBundle,null);
    const wrongSequence=setup();
    const original=wrongSequence.execute();
    wrongSequence.f.raw.executionL1=original.result.derivedBundle!.executionL1;
    wrongSequence.f.raw.executionL1[0].sourceSequence=99;
    const conflict=wrongSequence.execute().result;
    assert.equal(conflict.report.status,'REJECTED');
    assert.equal(conflict.derivedBundle,null);
  });
  it('missing trading date returns INCOMPLETE, never auto-fill an unseen +100 premium exit',()=>{
    const x=setup();x.quotes.splice(5,1);
    const {result}=x.execute();
    assert.equal(result.report.status,'INCOMPLETE_EVIDENCE');
    assert.equal(result.report.tradingDaysMissingL1,1);
    assert.equal(result.derivedBundle,null);
    assert.ok(result.report.blockers.includes(
      'EXCHANGE_TRADING_DAYS_WITHOUT_ORIGINAL_OPTION_L1'));
  });
  it('CSV with unknown option contract, after-expiry quote, or closed calendar day cannot import',()=>{
    const x=setup();x.quotes[0][2]='NSE_FO|99999999';
    let r=x.execute().result;
    assert.equal(r.report.unknownContractRows,1);
    assert.equal(r.report.status,'INCOMPLETE_EVIDENCE');
    assert.equal(r.derivedBundle,null);
    const y=setup();
    y.quotes[0][3]=at('2026-11-13','09:30');
    y.quotes[0][4]=at('2026-11-13','09:30');
    r=y.execute().result;
    assert.ok(r.report.unknownContractRows>=1);
    assert.equal(r.derivedBundle,null);
  });
  it('quote with future availableAt, malformed timezone or lag greater than predeclared cap cannot import',()=>{
    const x=setup();
    x.quotes[0][4]=at('2026-11-02','10:15');
    const r=x.execute().result;
    assert.ok(r.report.invalidOrReplayedClocks>0);
    assert.equal(r.report.status,'INCOMPLETE_EVIDENCE');
    const y=setup();
    y.quotes[0][4]='2026-11-02T09:41:00';
    assert.ok(y.execute().result.report.invalidOrReplayedClocks>0);
    const z=setup();
    z.quotes[0][4]='2026-11-02T09:39:00+05:30';
    assert.ok(z.execute().result.report.invalidOrReplayedClocks>0);
  });
  it('source sequence and event time must strictly increase for same contract and original session',()=>{
    const x=setup(),duplicate=[...x.quotes[0]];
    duplicate[0]='FAKE_EXTRA_ORIGINAL_L1_RECORD';
    duplicate[3]=at('2026-11-02','09:50');
    duplicate[4]=duplicate[3];
    x.quotes.splice(1,0,duplicate); // same source sequence 1
    assert.equal(x.execute().result.report.duplicateEventOrSequenceRows,1);
    duplicate[1]='2';
    duplicate[3]=at('2026-11-02','09:10');
    duplicate[4]=duplicate[3];
    assert.equal(x.execute().result.report.duplicateEventOrSequenceRows,1);
    duplicate[3]=at('2026-11-02','09:50');
    duplicate[4]=duplicate[3];
    const r=x.execute().result;
    assert.equal(r.report.status,
      'CANDIDATE_L1_ROWS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED');
    assert.equal(r.report.convertedRows,10);
  });
  it('no trade print, EOD bhavcopy or reconstructed feed may masquerade as native original L1',()=>{
    for(const type of ['HISTORICAL_TRADE_ONLY','END_OF_DAY_BHAVCOPY',
      'HISTORICAL_ORDER_TRADE_EVENTS'] as const){
      const x=setup();x.map.sourceProductCategory=type;
      const r=x.execute().result;
      assert.equal(r.report.status,'INCOMPLETE_EVIDENCE');
      assert.equal(r.derivedBundle,null);
      assert.ok(r.report.blockers.includes(
        'EOD_TRADE_PRINT_OR_RECONSTRUCTED_ORDER_EVENTS_NOT_ORIGINAL_NATIVE_L1'));
    }
  });
  it('late file import or simulated clock cannot masquerade as original strategy receipt',()=>{
    const x=setup();x.map.originalStrategyClockMode='LATER_FILE_IMPORT';
    assert.equal(x.execute().result.report.status,'INCOMPLETE_EVIDENCE');
    const y=setup();y.map.originalStrategyClockMode='HISTORICAL_REPLAY_ESTIMATE';
    assert.ok(y.execute().result.report.blockers.includes(
      'SOURCE_CLOCK_IS_REPLAY_OR_LATER_IMPORT_NOT_ORIGINAL_CLIENT_RECEIPT'));
  });
  it('unapproved vendor column mapping digest and tampered raw vendor CSV both reject',()=>{
    const x=setup();
    assert.ok(x.execute('0'.repeat(64)).result.report.errors.includes(
      'OUT_OF_BAND_ORIGINAL_CSV_COLUMN_MAPPING_SHA_PIN_MISMATCH'));
    const y=setup(),original=y.values();
    const modified=Buffer.from(original.toString().replace(',99,100,',',400,401,'));
    const r=y.execute(undefined,modified).result;
    assert.equal(r.report.status,'REJECTED');
    assert.ok(r.report.errors.includes(
      'ORIGINAL_VENDOR_CSV_ARCHIVE_BYTES_NOT_BOUND_TO_BUNDLE'));
  });
  it('mapping duplicated columns and changed units are REJECTED rather than silently guessed',()=>{
    const x=setup();x.map.columns.bid=x.map.columns.ask;
    assert.ok(x.execute().result.report.errors.includes(
      'INVALID_DUPLICATE_OR_AMBIGUOUS_CSV_COLUMN_MAPPING'));
    const y=setup();y.map.bidAskQuantityUnit='UNDERLYING_UNITS_NOT_LOTS';
    y.map.columns.ask='MISSING_ASK';
    assert.ok(y.execute().result.report.errors.includes(
      'MISSING_DUPLICATE_OR_MISMATCHED_ORIGINAL_CSV_HEADERS'));
    const z=setup();
    (z.map as unknown as {bidAskQuantityUnit:string}).
      bidAskQuantityUnit='LOTS_UNDERLYING_MISLABELED';
    assert.equal(z.execute().result.report.status,'REJECTED');
  });
  it('malformed CSV, inconsistent row widths and nonpositive ask/zero BID size are not repaired',()=>{
    const x=setup();const broken=Buffer.from(
      x.values().toString().replace(',99,100,',',99,100,,'));
    const r=x.execute(undefined,broken).result;
    assert.equal(r.report.status,'REJECTED'); // digest changed from original
    const y=setup();y.quotes[0][6]='50';
    assert.equal(y.execute().result.report.invalidQuoteRows,1);
    const z=setup();z.quotes[0][7]='0';
    assert.equal(z.execute().result.report.invalidQuoteRows,1);
  });
  it('malformed retained CSV syntax and inconsistent original column widths reject even with recomputed fake SHA',()=>{
    const a=setup();
    a.quotes[0][0]='"UNTERMINATED_FAKE_ORIGINAL_SOURCE';
    const first=a.execute().result;
    assert.equal(first.report.status,'REJECTED');
    assert.ok(first.report.errors.includes('MALFORMED_OR_OVERSIZED_ORIGINAL_CSV'));
    const b=setup();
    b.quotes[0].push('UNDECLARED_EXTRA_FIELD');
    const second=b.execute().result;
    assert.equal(second.report.status,'REJECTED');
    assert.ok(second.report.errors.includes('MALFORMED_OR_OVERSIZED_ORIGINAL_CSV'));
  });
  it('original quote cannot be resold on a calendar closed session or uploaded as an expired underlying symbol',()=>{
    const x=setup();
    x.quotes[0][3]=at('2026-11-01','09:30');
    x.quotes[0][4]=x.quotes[0][3];
    const r=x.execute().result;
    assert.equal(r.report.status,'INCOMPLETE_EVIDENCE');
    assert.ok(r.report.unknownContractRows>=1);
    assert.equal(r.report.executionAuthorized,false);
  });
  it('same original source ID or original eventAt cannot be reused in one instrument',()=>{
    const x=setup();const dup=[...x.quotes[0]];
    dup[1]='2';dup[0]='EXTRA_SAME_EVENT_ID';
    x.quotes.splice(1,0,dup);
    assert.equal(x.execute().result.report.duplicateEventOrSequenceRows,1);
    dup[3]=at('2026-11-02','09:50');dup[4]=dup[3];
    dup[0]=x.quotes[0][0];
    assert.equal(x.execute().result.report.duplicateEventOrSequenceRows,1);
  });
  it('a synthetic source with internally matching bytes remains blocked and never gains permission',()=>{
    const x=setup();x.f.raw.provenance.synthetic=true;
    const r=x.execute().result;
    assert.equal(r.report.status,'INCOMPLETE_EVIDENCE');
    assert.ok(r.report.blockers.includes(
      'SYNTHETIC_SOURCE_CANNOT_PROVE_ORIGINAL_OPTION_L1'));
    assert.equal(r.derivedBundle,null);
    assert.equal(r.report.executionAuthorized,false);
  });
});

