/**
 * Phase 23 — original historical option L1 CAPTURE CONTINUITY audit.
 *
 * Measures raw SOURCE event/available time density by independently supplied
 * trading date, and source sequence continuity per ORIGINAL contract/day.
 *
 * A quote gap does not prove packet loss: quiet/illiquid instruments can
 * legitimately be unchanged. A full set of observed quotes also does not
 * prove any missing packet was detected. This is a conservative research
 * coverage / marketability screen, NEVER a vendor/exchange authenticity proof,
 * a guaranteed bid fill, or a license/right to import live broker orders.
 */
import {createHash} from 'node:crypto';
import type {
  VerifiedHistoricalBundleV1,VendorExecutionL1
} from './adaptiveVendorIngestion.js';
import type {
  IndependentlySuppliedCalendarEvidence
} from './adaptiveCrossSourceCalendarAudit.js';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const SHA=/^[0-9a-f]{64}$/;
const IST=330*60_000,MIN=60_000;
const day=(t:number)=>new Date(t+IST).toISOString().slice(0,10);
const ms=(v:string)=>Date.parse(v);
const number=(n:unknown,min:number,max:number)=>
  typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const integer=(n:unknown,min:number,max:number)=>
  number(n,min,max)&&Number.isSafeInteger(n);
const date=(v:unknown):v is string=>typeof v==='string'&&
  /^\d{4}-\d{2}-\d{2}$/.test(v)&&
  Number.isFinite(ms(v+'T00:00:00Z'))&&
  new Date(ms(v+'T00:00:00Z')).toISOString().slice(0,10)===v;
const stamp=(v:unknown):v is string=>typeof v==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&
  Number.isFinite(ms(v));
const warnings=[
  'EVENT_GAPS_AND_QUIET_OPTION_QUOTES_CANNOT_DISTINGUISH_GENUINE_ILLIQUIDITY_FROM_MISSING_PACKETS',
  'SEQUENCE_CONTIGUITY_REQUIRES_VENDOR_DOCUMENTED_GAPLESS_PER_CONTRACT_SESSION_SEMANTICS',
  'AN_OBSERVED_FIRST_OR_LAST_QUOTE_DOES_NOT_PROVE_SOURCE_CAPTURE_AT_SESSION_EDGES',
  'BROAD_DAY_WINDOWS_DO_NOT_REPLACE_PHASE18_INDEX_VS_EXPIRY_CLASS_SESSION_CHECKS',
  'COVERED_QUOTES_ON_ONE_OPTION_CANNOT_PROVE_EVERY_LISTED_OPTION_HAS_L1',
  'ORIGINAL_SOURCE_L1_AND_RECORDED_CLIENT_RECEIPT_CLOCKS_NEED_INDEPENDENT_AUTHENTICATION',
  'SAMPLE_SIZE_AND_QUOTE_GAP_POLICY_MUST_BE_LOCKED_BEFORE_UNTOUCHED_OOS',
  'NO_HISTORY_LICENSE_NO_MARKET_PROFITABILITY_PROOF_NO_BROKER_ORDER_OR_NATIVE_STOP'
];

export interface OriginalL1CaptureContinuityPolicy{
  schemaVersion:'ADAPTIVE_ORIGINAL_NATIVE_L1_CAPTURE_CONTINUITY_V1';
  minimumSourceEventsPerTradingDay:number;
  maximumSourceWideSilenceMinutes:number;
  maximumFirstSourceEventLagMinutes:number;
  maximumLastSourceEventLeadMinutes:number;
  minimumEventsPerObservedInstrumentDay:number;
  maximumPerInstrumentObservedSilenceMinutes:number;
  maximumEventToOriginalReceiptSeconds:number;
  originalSequenceSemantics:
    'VENDOR_ATTESTED_CONTIGUOUS_PER_INSTRUMENT_DAY'|
    'MONOTONIC_ONLY_GAPS_UNINTERPRETABLE';
}
export interface OriginalL1CaptureDay {
  sessionDate:string;
  numberOriginalSourceEvents:number;
  originalContractsObserved:number;
  firstEventBlindMinutes:number|null;
  lastEventBlindMinutes:number|null;
  maximumSourceWideSilenceMinutes:number|null;
  perInstrumentCoverageViolations:number;
  originalSequenceHoles:number;
  eventReceiptClockViolations:number;
  failsPredeclaredCoverage:boolean;
  reasons:string[];
}
export interface OriginalL1CaptureContinuityReport{
  mode:'RESEARCH_ONLY_ORIGINAL_L1_COVERAGE';
  executionAuthorized:false;
  productionSafe:false;
  sourceOriginalityIndependentlyAuthenticated:false;
  vendorSequenceSemanticsIndependentlyAuthenticated:false;
  originalReceiptClockIndependentlyAuthenticated:false;
  nativeBrokerStopOrFillProven:false;
  profitabilityProven:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|
    'OBSERVED_SOURCE_COVERAGE_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED';
  datasetId:string|null;
  synthetic:boolean|null;
  originalBundleSha256:string|null;
  calendarManifestSha256:string|null;
  outOfBandPinnedPolicySha256:string|null;
  originalVendorArtifactSha256:string|null;
  policy:OriginalL1CaptureContinuityPolicy|null;
  errors:string[];
  blockers:string[];
  warnings:string[];
  expectedTradingDays:number;
  observedTradingDays:number;
  absentSourceTradingDays:number;
  originalSourceEvents:number;
  sourceWideGapDays:number;
  sourceStartOrEndBlindDays:number;
  instrumentDaysInsufficientOrStale:number;
  sourceSequenceHoles:number;
  eventReceiptClockViolations:number;
  invalidOriginalBestBidAskOrQuantity:number;
  duplicateSourceIdsOrClocks:number;
  unknownOrExpiredInstrumentEvents:number;
  dayCoverage:OriginalL1CaptureDay[];
}
export function validateOriginalL1CaptureContinuityPolicy(
  x:OriginalL1CaptureContinuityPolicy
):string[]{
  if(!x||x.schemaVersion!=='ADAPTIVE_ORIGINAL_NATIVE_L1_CAPTURE_CONTINUITY_V1'||
     !integer(x.minimumSourceEventsPerTradingDay,2,1000000)||
     !number(x.maximumSourceWideSilenceMinutes,.01,1440)||
     !number(x.maximumFirstSourceEventLagMinutes,0,1440)||
     !number(x.maximumLastSourceEventLeadMinutes,0,1440)||
     !integer(x.minimumEventsPerObservedInstrumentDay,2,1000000)||
     !number(x.maximumPerInstrumentObservedSilenceMinutes,.01,1440)||
     !number(x.maximumEventToOriginalReceiptSeconds,0,300)||
     !['VENDOR_ATTESTED_CONTIGUOUS_PER_INSTRUMENT_DAY',
       'MONOTONIC_ONLY_GAPS_UNINTERPRETABLE'].includes(
         x.originalSequenceSemantics))
    return ['INVALID_PREDECLARED_ORIGINAL_L1_CAPTURE_CONTINUITY_POLICY'];
  return [];
}
function base():OriginalL1CaptureContinuityReport{
  return{
    mode:'RESEARCH_ONLY_ORIGINAL_L1_COVERAGE',
    executionAuthorized:false,productionSafe:false,
    sourceOriginalityIndependentlyAuthenticated:false,
    vendorSequenceSemanticsIndependentlyAuthenticated:false,
    originalReceiptClockIndependentlyAuthenticated:false,
    nativeBrokerStopOrFillProven:false,profitabilityProven:false,
    status:'REJECTED',datasetId:null,synthetic:null,
    originalBundleSha256:null,calendarManifestSha256:null,
    outOfBandPinnedPolicySha256:null,originalVendorArtifactSha256:null,
    policy:null,errors:[],blockers:[],warnings,
    expectedTradingDays:0,observedTradingDays:0,absentSourceTradingDays:0,
    originalSourceEvents:0,sourceWideGapDays:0,
    sourceStartOrEndBlindDays:0,instrumentDaysInsufficientOrStale:0,
    sourceSequenceHoles:0,eventReceiptClockViolations:0,
    invalidOriginalBestBidAskOrQuantity:0,
    duplicateSourceIdsOrClocks:0,unknownOrExpiredInstrumentEvents:0,
    dayCoverage:[]
  };
}
function parsed<T>(data:Uint8Array|null|undefined,cap:number):T|null{
  if(!data?.length||data.length>cap)return null;
  try{
    const obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
    return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj as T:null;
  }catch{return null;}
}
/**
 * Input includes EXACT original source bundle bytes so mutable JS object
 * substitutions cannot be used to improve a derived quote path.
 *
 * Attests only internal consistency and explicitly cannot establish source
 * license/issuer, real receipt logs, or declared vendor sequence semantics.
 */
export function auditAdaptiveOriginalL1CaptureContinuity(
  originalBundleBytes:Uint8Array|null|undefined,
  originalCalendarManifestBytes:Uint8Array|null|undefined,
  originalPolicyBytes:Uint8Array|null|undefined,
  independentlyPinnedPolicySha256:string|null|undefined
):OriginalL1CaptureContinuityReport{
  const r=base();
  const reject=(code:string)=>{
    r.status='REJECTED';r.errors.push(code);return r;
  };
  const b=parsed<VerifiedHistoricalBundleV1>(originalBundleBytes,50*1024*1024);
  const c=parsed<IndependentlySuppliedCalendarEvidence>(
    originalCalendarManifestBytes,1024*1024);
  const p=parsed<OriginalL1CaptureContinuityPolicy>(
    originalPolicyBytes,64*1024);
  if(!b||!c||!p||
     b.schemaVersion!=='ADAPTIVE_VERIFIED_L1_BUNDLE_V1'||
     c.schemaVersion!=='ADAPTIVE_CROSS_SOURCE_CALENDAR_V1'||
     !Array.isArray(b.executionL1)||!Array.isArray(b.sessions)||
     !Array.isArray(c.days))
    return reject('MISSING_INVALID_OR_OVERSIZED_ORIGINAL_CAPTURE_AUDIT_FILES');
  r.originalBundleSha256=sha(originalBundleBytes!);
  r.calendarManifestSha256=sha(originalCalendarManifestBytes!);
  r.outOfBandPinnedPolicySha256=sha(originalPolicyBytes!);
  r.originalVendorArtifactSha256=b.provenance?.sourceArtifactSha256??null;
  r.datasetId=b.provenance?.datasetId??null;
  r.synthetic=b.provenance?.synthetic??null;
  if(!SHA.test(independentlyPinnedPolicySha256??'')||
     independentlyPinnedPolicySha256!==r.outOfBandPinnedPolicySha256)
    return reject('ORIGINAL_CAPTURE_CONTINUITY_POLICY_NOT_INDEPENDENTLY_SHA_PINNED');
  const errors=validateOriginalL1CaptureContinuityPolicy(p);
  if(errors.length)return reject(errors[0]);
  r.policy=p;
  if(!Number.isInteger(b.maximumOriginalFeedLatencySeconds)||
     b.maximumOriginalFeedLatencySeconds<0||
     b.maximumOriginalFeedLatencySeconds>300)
    return reject('UNBOUNDED_OR_INVALID_ORIGINAL_FEED_RECEIPT_LATENCY');
  if(!SHA.test(b.provenance?.sourceArtifactSha256??'')||
     !b.provenance?.datasetId||
     !['NIFTY','BANKNIFTY','SENSEX'].includes(b.instrument)||
     c.exchange!==(b.instrument==='SENSEX'?'BSE':'NSE'))
    return reject('CONTRACT_ORIGINAL_SOURCE_EXCHANGE_OR_DIGEST_INVALID');
  const window=new Map<string,{open:number;close:number}>();
  let previous='';
  for(const d of c.days){
    if(!d||!date(d.sessionDate)||d.sessionDate<=previous)
      return reject('DUPLICATE_UNSORTED_OR_INVALID_INDEPENDENT_CALENDAR_DATE');
    previous=d.sessionDate;
    if(d.kind==='TRADING'){
      if(!stamp(d.openAt)||!stamp(d.closeAt)||
         ms(d.closeAt)<=ms(d.openAt)||
         day(ms(d.openAt))!==d.sessionDate||
         day(ms(d.closeAt))!==d.sessionDate)
        return reject('INVALID_SOURCE_TRADING_SESSION_WINDOW');
      window.set(d.sessionDate,{open:ms(d.openAt),close:ms(d.closeAt)});
    }else if(d.kind!=='CLOSED')
      return reject('UNKNOWN_CALENDAR_DAY_KIND');
  }
  if(!window.size||window.size>3000||!date(c.coverageStart)||
     !date(c.coverageEnd)||c.days[0]?.sessionDate!==c.coverageStart||
     c.days[c.days.length-1]?.sessionDate!==c.coverageEnd)
    return reject('CALENDAR_TRADING_COVERAGE_INCOMPLETE_OR_UNBOUNDED');
  r.expectedTradingDays=window.size;
  const expiries=new Map<string,string>();
  const originalMetadataIds=new Set<string>();
  for(const session of b.sessions){
    if(session?.contracts?.sourceRecordId)
      originalMetadataIds.add(session.contracts.sourceRecordId);
    for(const chain of session?.chains??[]){
      if(chain?.sourceRecordId)originalMetadataIds.add(chain.sourceRecordId);
    }
    for(const contract of session?.contracts?.data??[]){
      if(typeof contract.instrument_key!=='string'||!date(contract.expiry)||
         (expiries.has(contract.instrument_key)&&
          expiries.get(contract.instrument_key)!==contract.expiry))
        return reject('ORIGINAL_OPTION_CONTRACT_KEY_EXPIRY_MISMATCH');
      expiries.set(contract.instrument_key,contract.expiry);
    }
  }
  if(!expiries.size)return reject('NO_POINT_IN_TIME_ORIGINAL_CONTRACT_CATALOG');
  const uniqueSourceIds=new Set<string>();
  const uniqueAvailability=new Set<string>();
  const uniqueEvents=new Set<string>();
  const byDay=new Map<string,VendorExecutionL1[]>();
  let clockErrors=0,dup=0,unknown=0,invalidQuotes=0;
  for(const q of b.executionL1){
    if(!q||typeof q.bid!=='number'||!Number.isFinite(q.bid)||
       typeof q.ask!=='number'||!Number.isFinite(q.ask)||
       q.bid<=0||q.ask<=q.bid||
       !Number.isSafeInteger(q.bidQty)||!Number.isSafeInteger(q.askQty)||
       q.bidQty<=0||q.askQty<=0){
      invalidQuotes++;continue;
    }
    const event=ms(q?.eventAt??''),available=ms(q?.availableAt??'');
    if(!q||!stamp(q.eventAt)||!stamp(q.availableAt)||
       event>available||available-event>
         Math.min(p.maximumEventToOriginalReceiptSeconds,
           b.maximumOriginalFeedLatencySeconds)*1000){
      clockErrors++;continue;
    }
    const d=day(event),arrDay=day(available);
    const expiry=expiries.get(q.instrumentKey);
    const w=window.get(d),wArrival=window.get(arrDay);
    if(!expiry||!w||!wArrival||d>expiry||arrDay>expiry||
       event<w.open||event>w.close||
       available<wArrival.open||available>wArrival.close){
      unknown++;continue;
    }
    const eventKey=q.instrumentKey+'|'+q.eventAt,
      availableKey=q.instrumentKey+'|'+q.availableAt;
    if(!q.sourceRecordId||originalMetadataIds.has(q.sourceRecordId)||
       uniqueSourceIds.has(q.sourceRecordId)||
       uniqueEvents.has(eventKey)||uniqueAvailability.has(availableKey)){
      dup++;continue;
    }
    uniqueSourceIds.add(q.sourceRecordId);
    uniqueEvents.add(eventKey);uniqueAvailability.add(availableKey);
    const group=byDay.get(d)??[];
    group.push(q);byDay.set(d,group);
  }
  r.originalSourceEvents=b.executionL1.length;
  r.eventReceiptClockViolations=clockErrors;
  r.invalidOriginalBestBidAskOrQuantity=invalidQuotes;
  r.duplicateSourceIdsOrClocks=dup;
  r.unknownOrExpiredInstrumentEvents=unknown;
  const blocker=(code:string)=>{
    if(!r.blockers.includes(code))r.blockers.push(code);
  };
  if(clockErrors)blocker('SOURCE_EVENT_TO_ORIGINAL_RECEIPT_CLOCK_VIOLATIONS');
  if(invalidQuotes)blocker('INVALID_OR_UNPRICED_ORIGINAL_OPTION_BID_ASK_OR_DEPTH');
  if(dup)blocker('DUPLICATE_ORIGINAL_VENDOR_L1_RECORD_OR_CLOCK');
  if(unknown)blocker('L1_QUOTE_OUTSIDE_ORIGINAL_EXCHANGE_OR_CONTRACT_SESSION');
  const dayCoverage:OriginalL1CaptureDay[]=[];
  let quoteDays=0,emptyDays=0,gapDays=0,blindDays=0,
    instrumentFailures=0,holes=0;
  for(const [dateKey,session] of window){
    const quotes=byDay.get(dateKey)??[];
    if(quotes.length)quoteDays++;
    else emptyDays++;
    quotes.sort((a,b)=>ms(a.eventAt)-ms(b.eventAt));
    const reasons:string[]=[];
    const flag=(s:string)=>{if(!reasons.includes(s))reasons.push(s);};
    if(quotes.length<p.minimumSourceEventsPerTradingDay)
      flag('SOURCE_DAY_L1_BELOW_PRESPECIFIED_MINIMUM');
    const times=quotes.map(q=>ms(q.eventAt));
    const edges=[session.open,...times,session.close];
    let maxGap=0;
    for(let i=1;i<edges.length;i++)
      maxGap=Math.max(maxGap,(edges[i]-edges[i-1])/MIN);
    const startLag=times.length?(times[0]-session.open)/MIN:null;
    const endLead=times.length?(session.close-times[times.length-1])/MIN:null;
    if(maxGap>p.maximumSourceWideSilenceMinutes){
      flag('SOURCE_WIDE_ORIGINAL_L1_EVENT_SILENCE_TOO_LONG');
      gapDays++;
    }
    if(startLag===null||endLead===null||
       startLag>p.maximumFirstSourceEventLagMinutes||
       endLead>p.maximumLastSourceEventLeadMinutes){
      flag('UNOBSERVED_OPEN_OR_CLOSE_OPTION_L1_CAPTURE_EDGE');
      blindDays++;
    }
    const instrumentQuotes=new Map<string,VendorExecutionL1[]>();
    for(const q of quotes){
      const items=instrumentQuotes.get(q.instrumentKey)??[];
      items.push(q);instrumentQuotes.set(q.instrumentKey,items);
    }
    let failures=0,dateHoles=0;
    for(const items of instrumentQuotes.values()){
      // Run ALL independent checks even when quote count is insufficient;
      // an early continue here would conceal vendor source-sequence holes.
      let instrumentIncomplete=
        items.length<p.minimumEventsPerObservedInstrumentDay;
      // A per-contract market can go quiet legitimately: this counts
      // observed silence as RISK, never labels it proven data packet loss.
      for(let i=1;i<items.length;i++){
        const diff=(ms(items[i].eventAt)-ms(items[i-1].eventAt))/MIN;
        if(diff>p.maximumPerInstrumentObservedSilenceMinutes){
          instrumentIncomplete=true;break;
        }
      }
      if(p.originalSequenceSemantics===
         'VENDOR_ATTESTED_CONTIGUOUS_PER_INSTRUMENT_DAY'){
        for(let i=0;i<items.length;i++){
          const seq=items[i].sourceSequence;
          if(!Number.isSafeInteger(seq)||seq!<=0){
            instrumentIncomplete=true;
            flag('ORIGINAL_L1_SOURCE_SEQUENCE_NOT_PRESERVED');
            break;
          }
          if(i>0){
            const prior=items[i-1].sourceSequence!;
            if(seq!<=prior){
              instrumentIncomplete=true;
              flag('ORIGINAL_L1_SOURCE_SEQUENCE_NOT_MONOTONIC');
              break;
            }
            if(seq!>prior+1){
              const jump=seq!-prior-1;
              dateHoles+=jump;holes+=jump;
              instrumentIncomplete=true;
              flag('DECLARED_CONTIGUOUS_SOURCE_SEQUENCE_HAS_MISSING_EVENTS');
            }
          }
        }
      }
      if(instrumentIncomplete)failures++;
    }
    instrumentFailures+=failures;
    if(failures)flag('UNOBSERVED_OR_STALE_PER_CONTRACT_OPTION_L1_PATH');
    if(dateHoles||failures)blocker('ORIGINAL_INSTRUMENT_L1_CONTINUITY_INCOMPLETE');
    if(reasons.length)blocker('ORIGINAL_DAY_FEED_COVERAGE_OR_SEQUENCE_INCOMPLETE');
    dayCoverage.push({
      sessionDate:dateKey,numberOriginalSourceEvents:quotes.length,
      originalContractsObserved:instrumentQuotes.size,
      firstEventBlindMinutes:startLag===null?null:Number(startLag.toFixed(2)),
      lastEventBlindMinutes:endLead===null?null:Number(endLead.toFixed(2)),
      maximumSourceWideSilenceMinutes:
        Number(maxGap.toFixed(2)),
      perInstrumentCoverageViolations:failures,
      originalSequenceHoles:dateHoles,
      eventReceiptClockViolations:quotes.filter(q=>
        ms(q.availableAt)-ms(q.eventAt)>
          p.maximumEventToOriginalReceiptSeconds*1000).length,
      failsPredeclaredCoverage:reasons.length>0,reasons
    });
  }
  r.observedTradingDays=quoteDays;
  r.absentSourceTradingDays=emptyDays;
  r.sourceWideGapDays=gapDays;
  r.sourceStartOrEndBlindDays=blindDays;
  r.instrumentDaysInsufficientOrStale=instrumentFailures;
  r.sourceSequenceHoles=holes;
  r.dayCoverage=dayCoverage;
  if(b.provenance.synthetic)blocker('SYNTHETIC_SOURCE_CANNOT_AUTHENTICATE_ORIGINAL_L1');
  if(!b.executionL1.length)blocker('NO_ORIGINAL_OPTION_L1_SOURCE_EVENTS');
  r.status=r.blockers.length?'INCOMPLETE_EVIDENCE':
    'OBSERVED_SOURCE_COVERAGE_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED';
  return r;
}
