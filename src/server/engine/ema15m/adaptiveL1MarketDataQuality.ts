/**
 * Phase 10 — predeclared L1 market-data QUALITY audit on the Phase 8
 * ENTRY-FIRST OUT-OF-SAMPLE cohort.
 *
 * This measures observation availability, not profitability, liquidity
 * executable in size, historical vendor authenticity or future trading safety.
 * The source must first pass adaptiveVendorIngestion; this module additionally
 * checks the original feed EVENT/AVAILABLE clocks against the transformed L1.
 *
 * No broker/network/storage/order imports, no optimization or live activation.
 */
import type { DeclaredTradingSession } from './adaptiveSessionIntegrity.js';
import { buildAdaptiveEntryFirstCohort } from './adaptiveEntryFirstCohort.js';
import type { HistoricalComparisonInput, HistoricalArm,
  HistoricalExecutableQuote } from './historicalAdaptiveComparison.js';
import type { HorizonBucket } from './adaptiveOptionRanker.js';
import type { VendorExecutionL1 } from './adaptiveVendorIngestion.js';

const MINUTE=60_000;
const HORIZONS:HorizonBucket[]=['1W','2W','4W','8W'];
const ARMS:HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const time=(v:string)=>Date.parse(v);
const istDay=(ms:number)=>new Date(ms+330*MINUTE).toISOString().slice(0,10);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const percent=(n:number,d:number)=>d>0?Number((n/d*100).toFixed(2)):null;
const round=(n:number)=>Number(n.toFixed(2));
const uniq=(items:string[])=>[...new Set(items)];
const isDate=(v:string)=>/^\d{4}-\d\d-\d\d$/.test(v)&&
  Number.isFinite(time(v+'T00:00:00Z')) &&
  new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;

export interface AdaptiveMarketDataQualityPolicy {
  schemaVersion:'ADAPTIVE_MARKET_DATA_QUALITY_V1';
  /** This counts observed entries, not wins; tune before looking at OOS. */
  minimumObservedEntriesPerArmHorizon:number;
  minimumL1QuotesPerDeclaredSession:number;
  maximumWithinSessionQuoteGapMinutes:number;
  /** First quote after the fixed-hold due time cannot be later than this. */
  maximumFixedDueExitQuoteDelayMinutes:number;
  maximumSourceEventToAvailabilitySeconds:number;
  maximumBidAskSpreadBps:number;
  /** Fraction 0..1, e.g. 0.05 means 5% quotes permitted above max spread. */
  maximumWideSpreadQuoteFraction:number;
  minimumBidDepthMultipleOfLot:number;
  /** Fraction 0..1 of the holding path with sufficient bid depth. */
  minimumSufficientBidDepthQuoteFraction:number;
  /** Risk flag only. A large gap is genuine market evidence, not invalid data. */
  overnightAdverseBidGapAlertPercent:number;
}
export type L1PathDisposition=
  'SUFFICIENT_SOURCE_ATTESTED_OBSERVATIONS'|'MISSING_OR_UNRELIABLE_L1_PATH';
export interface L1PathDiagnostic {
  foldIndex:number; arm:HistoricalArm; horizon:HorizonBucket;
  decisionAt:string;
  disposition:L1PathDisposition;
  reasons:string[];
  sessionsEvaluated:number;
  quoteCount:number;
  maximumWithinSessionGapMinutes:number|null;
  maximumSpreadBps:number|null;
  spreadBpsP95:number|null;
  wideSpreadQuotePercent:number|null;
  insufficientDepthQuotePercent:number|null;
  eventToAvailableLagSecondsP95:number|null;
  largestAdverseOvernightBidGapPercent:number|null;
  adverseOvernightGapAlertCount:number;
  firstFixedDueExitBidObservedAt:string|null;
}
export interface MarketDataQualityCell {
  foldIndex:number;arm:HistoricalArm;horizon:HorizonBucket;
  decisionCount:number;
  observedEntryCount:number;
  missingEntryCount:number;
  qualityPassCount:number;
  incompleteL1PathCount:number;
  noSignalOrIneligibleCount:number;
  adverseOvernightGapAlertCount:number;
  largestAdverseOvernightBidGapPercent:number|null;
  spreadBpsP95:number|null;
  eventToAvailableLagSecondsP95:number|null;
  /** Cannot measure profit or infer complete actual historical market sessions. */
  sufficientForDescriptiveQualityReview:boolean;
  /** All market-quality gates are advisory, never live release approval. */
  productionEligible:false;
}
export interface AdaptiveMarketDataQualityReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  empiricalProfitabilityProven:false;
  sourceAuthenticityIndependentlyVerified:false;
  exchangeCalendarIndependentlyVerified:false;
  originalAvailabilityClocksIndependentlyVerified:false;
  status:'REJECTED'|'INCOMPLETE_EVIDENCE'|'DESCRIPTIVE_ONLY';
  datasetId:string;
  synthetic:boolean;
  errors:string[];
  policy:AdaptiveMarketDataQualityPolicy|null;
  totalOutOfSampleDecisions:number;
  observedEntryCount:number;
  missingEntryCount:number;
  paths:L1PathDiagnostic[];
  cells:MarketDataQualityCell[];
  warnings:string[];
}
const warnings=[
  'SYNTHETIC_DATA_CANNOT_ESTABLISH_REAL_MARKET_PROFITABILITY',
  'SOURCE_ATTESTED_EVENT_AND_AVAILABLE_CLOCKS_ARE_NOT_INDEPENDENTLY_AUTHENTICATED',
  'EXCHANGE_CALENDAR_MUST_BE_AUDITED_AGAINST_OFFICIAL_HISTORY',
  'FUTURE_L1_NEVER_SELECTS_ENTRY_ONLY_PHASE8_ENTRY_FIRST_DECISIONS',
  'NO_FILLS_OR_PROFITS_ARE_INFERRED_FROM_BID_OR_ASK',
  'L1_DEPTH_IS_DISPLAYED_NOT_BROKER_CONFIRMED_EXECUTION',
  'LARGE_OVERNIGHT_PRICE_GAPS_ARE_PRESERVED_AND_FLAGGED_NOT_NORMALIZED',
  'OBSERVATION_DENSITY_CANNOT_PROVE_NO_INTRAGAP_REVERSAL',
  'POLICY_THRESHOLDS_MUST_BE_REGISTERED_BEFORE_INSPECTING_OOS_RESULTS',
  'STATUS_DESCRIPTIVE_ONLY_NEVER_MEANS_LIVE_TRADING_APPROVED'
];
function validPolicy(p:AdaptiveMarketDataQualityPolicy):boolean{
  return !!p&&p.schemaVersion==='ADAPTIVE_MARKET_DATA_QUALITY_V1'&&
    Number.isInteger(p.minimumObservedEntriesPerArmHorizon)&&
      p.minimumObservedEntriesPerArmHorizon>=1&&p.minimumObservedEntriesPerArmHorizon<=100000&&
    Number.isInteger(p.minimumL1QuotesPerDeclaredSession)&&
      p.minimumL1QuotesPerDeclaredSession>=2&&p.minimumL1QuotesPerDeclaredSession<=100000&&
    finite(p.maximumWithinSessionQuoteGapMinutes)&&
      p.maximumWithinSessionQuoteGapMinutes>=1&&p.maximumWithinSessionQuoteGapMinutes<=390&&
    finite(p.maximumFixedDueExitQuoteDelayMinutes)&&
      p.maximumFixedDueExitQuoteDelayMinutes>0&&p.maximumFixedDueExitQuoteDelayMinutes<=1440&&
    finite(p.maximumSourceEventToAvailabilitySeconds)&&
      p.maximumSourceEventToAvailabilitySeconds>=0&&
      p.maximumSourceEventToAvailabilitySeconds<=300&&
    finite(p.maximumBidAskSpreadBps)&&
      p.maximumBidAskSpreadBps>0&&p.maximumBidAskSpreadBps<=10000&&
    finite(p.maximumWideSpreadQuoteFraction)&&
      p.maximumWideSpreadQuoteFraction>=0&&p.maximumWideSpreadQuoteFraction<=1&&
    Number.isInteger(p.minimumBidDepthMultipleOfLot)&&
      p.minimumBidDepthMultipleOfLot>=1&&p.minimumBidDepthMultipleOfLot<=10&&
    finite(p.minimumSufficientBidDepthQuoteFraction)&&
      p.minimumSufficientBidDepthQuoteFraction>=0&&p.minimumSufficientBidDepthQuoteFraction<=1&&
    finite(p.overnightAdverseBidGapAlertPercent)&&
      p.overnightAdverseBidGapAlertPercent>0&&
      p.overnightAdverseBidGapAlertPercent<=100;
}
function percentile(sorted:number[],ratio:number):number|null{
  if(!sorted.length)return null;
  return round(sorted[Math.min(sorted.length-1,
    Math.ceil(ratio*sorted.length)-1)]);
}
interface Window {sessionDate:string;open:number;close:number}
function validateWindows(raw:DeclaredTradingSession[]|undefined):Window[]|null {
  if(!Array.isArray(raw)||!raw.length)return null;
  const result:Window[]=[];
  const ids=new Set<string>();
  let last='';
  for(const s of raw){
    const open=time(s?.openAt),close=time(s?.closeAt);
    if(!s||!isDate(s.sessionDate)||s.sessionDate<=last||
       !s.sourceRecordId?.trim()||ids.has(s.sourceRecordId)||
       !Number.isFinite(open)||!Number.isFinite(close)||
       close<=open||close-open>24*60*MINUTE||
       istDay(open)!==s.sessionDate||istDay(close)!==s.sessionDate)
      return null;
    ids.add(s.sourceRecordId);
    last=s.sessionDate;
    result.push({sessionDate:s.sessionDate,open,close});
  }
  return result;
}
const quoteKey=(key:string,at:string)=>key+'\n'+at;
/**
 * Uses the point-in-time entry-first cohort. Does NOT inspect Phase 3's future
 * fixed-hold survivor list, and never substitutes PnL for missing quotes.
 */
export function auditAdaptiveL1MarketDataQuality(
  input:HistoricalComparisonInput,
  declaredSessions:DeclaredTradingSession[]|undefined,
  originalL1:VendorExecutionL1[],
  policy:AdaptiveMarketDataQualityPolicy
):AdaptiveMarketDataQualityReport{
  const base:AdaptiveMarketDataQualityReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    empiricalProfitabilityProven:false,
    sourceAuthenticityIndependentlyVerified:false,
    exchangeCalendarIndependentlyVerified:false,
    originalAvailabilityClocksIndependentlyVerified:false,
    status:'REJECTED',datasetId:input?.provenance?.datasetId??'INVALID',
    synthetic:input?.provenance?.synthetic??true,
    errors:[],policy:null,
    totalOutOfSampleDecisions:0,observedEntryCount:0,missingEntryCount:0,
    paths:[],cells:[],warnings
  };
  const errors:string[]=[];
  if(!validPolicy(policy))errors.push('INVALID_PREDECLARED_MARKET_QUALITY_POLICY');
  const windows=validateWindows(declaredSessions);
  if(!windows)errors.push('ORIGINAL_DECLARED_SESSION_WINDOWS_REQUIRED');
  const cohort=input?buildAdaptiveEntryFirstCohort(input):null;
  if(cohort?.status!=='ENTRY_COHORT_RECORDED')
    errors.push(...(cohort?.errors?.length?cohort.errors:['INVALID_ENTRY_FIRST_COHORT']));
  if(input?.provenance?.synthetic===false&&
     input.provenance.quoteTimestampQuality!=='SOURCE_ATTESTED_EVENT_TIME')
    errors.push('REAL_ORIGINAL_L1_CLOCK_QUALITY_UNVERIFIED');
  if(!Array.isArray(originalL1)||!originalL1.length)
    errors.push('ORIGINAL_L1_EVENT_CLOCK_RECORDS_REQUIRED');
  if(errors.length)return {...base,errors:uniq(errors)};
  const source=new Map<string,VendorExecutionL1>();
  const identifiers=new Set<string>();
  for(const v of originalL1){
    const observed=time(v?.availableAt),event=time(v?.eventAt);
    const key=v?.instrumentKey&&v?.availableAt?
      quoteKey(v.instrumentKey,v.availableAt):'';
    if(!v||!v.instrumentKey||!v.sourceRecordId?.trim()||!key||
       identifiers.has(v.sourceRecordId)||source.has(key)||
       !Number.isFinite(observed)||!Number.isFinite(event)||
       event>observed||!finite(v.bid)||!finite(v.ask)||
       !Number.isInteger(v.bidQty)||!Number.isInteger(v.askQty)||
       v.bid<=0||v.ask<=v.bid||v.bidQty<=0||v.askQty<=0){
      return {...base,errors:['INVALID_DUPLICATE_OR_UNCLOCKED_SOURCE_L1']};
    }
    identifiers.add(v.sourceRecordId);
    source.set(key,v);
  }
  const byKey=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of input.executionQuotes){
    const raw=source.get(quoteKey(q.instrumentKey,q.observedAt));
    if(!raw||raw.bid!==q.bid||raw.ask!==q.ask||
       raw.bidQty!==q.bidQty||raw.askQty!==q.askQty)
      return {...base,errors:['SOURCE_EVENT_AND_REPLAY_QUOTE_MISMATCH']};
    const arr=byKey.get(q.instrumentKey)??[];
    arr.push(q);byKey.set(q.instrumentKey,arr);
  }
  if(source.size!==input.executionQuotes.length)
    return {...base,errors:['SOURCE_AND_REPLAY_QUOTE_COUNTS_MISMATCH']};
  for(const qs of byKey.values())qs.sort((a,b)=>time(a.observedAt)-time(b.observedAt));
  const paths:L1PathDiagnostic[]=[];
  const allObserved=cohort!.attempts.filter(a=>a.disposition==='ENTRY_OBSERVED');
  for(const entry of allObserved){
    const started=time(entry.entryAt!);
    const due=time(entry.scheduledFixedHoldAt!);
    const latest=time(entry.lastEligibleFixedHoldExitAt!);
    const quantity=entry.quantity!;
    const rawQuotes=byKey.get(entry.instrumentKey!)??[];
    const matching=rawQuotes.filter(q=>
      time(q.observedAt)>=started&&time(q.observedAt)<=latest);
    // For data-quality review we look from ORIGINAL entry through the
    // PREDECLARED fixed exit window, never until a favorable hindsight exit.
    const reasons:string[]=[];
    const flag=(s:string)=>{if(!reasons.includes(s))reasons.push(s);};
    if(!Number.isFinite(started)||!Number.isFinite(due)||
       !Number.isFinite(latest)||started>=due||due>latest||quantity<=0)
      flag('INVALID_ENTRY_TO_EXIT_WINDOW');
    if(!matching.length||matching[0].observedAt!==entry.entryAt ||
       matching[0].ask!==entry.entryAsk ||
       matching[0].bid!==entry.entryBid)
      flag('ENTRY_L1_NOT_REPRODUCIBLE');
    // The FIRST observed quote at/after fixed due is the only market evidence
    // used for due-time quality. Later favorable quotes cannot replace it.
    const firstDue=matching.find(q=>time(q.observedAt)>=due)??null;
    if(!firstDue)flag('NO_L1_AT_FIXED_HOLD_DUE');
    else {
      if(time(firstDue.observedAt)-due>
         policy.maximumFixedDueExitQuoteDelayMinutes*MINUTE)
        flag('FIRST_DUE_EXIT_L1_TOO_LATE');
      if(firstDue.bidQty<quantity*policy.minimumBidDepthMultipleOfLot)
        flag('FIRST_DUE_EXIT_BID_DEPTH_INSUFFICIENT');
    }
    const overlap=windows!.filter(w=>w.close>=started&&w.open<=latest);
    if(!overlap.length||windows![windows!.length-1].close<latest)
      flag('ORIGINAL_CALENDAR_DOES_NOT_SPAN_EXIT_WINDOW');
    const relevant=new Set(overlap.map(w=>w.sessionDate));
    for(const q of matching){
      if(!relevant.has(istDay(time(q.observedAt))))
        flag('OPTION_L1_OUTSIDE_DECLARED_SESSIONS');
    }
    const spreadBps:number[]=[];
    const latencies:number[]=[];
    let wideCount=0,thinCount=0,sessionGapMax=0;
    for(const q of matching){
      const pct=2*(q.ask-q.bid)/(q.ask+q.bid)*10_000;
      spreadBps.push(pct);
      if(pct>policy.maximumBidAskSpreadBps)wideCount++;
      if(q.bidQty<quantity*policy.minimumBidDepthMultipleOfLot)thinCount++;
      const orig=source.get(quoteKey(q.instrumentKey,q.observedAt))!;
      const lag=(time(orig.availableAt)-time(orig.eventAt))/1000;
      latencies.push(lag);
      if(lag>policy.maximumSourceEventToAvailabilitySeconds)
        flag('ORIGINAL_EVENT_AVAILABILITY_LAG_TOO_LARGE');
    }
    if(matching.length){
      if(wideCount/matching.length>policy.maximumWideSpreadQuoteFraction)
        flag('EXCESS_WIDE_BID_ASK_SPREAD_OBSERVATIONS');
      if(1-thinCount/matching.length<
          policy.minimumSufficientBidDepthQuoteFraction)
        flag('INSUFFICIENT_DEPTH_THROUGHOUT_HOLD');
    }
    let pastSessionLastBid:number|null=null;
    let overnightAlerts=0,maxAdverseGap:number|null=null;
    for(const window of overlap){
      const low=Math.max(started,window.open);
      const high=Math.min(latest,window.close);
      const dayQuotes=matching.filter(q=>{
        const v=time(q.observedAt);return v>=low&&v<=high;
      });
      if(dayQuotes.length<policy.minimumL1QuotesPerDeclaredSession)
        flag('INCOMPLETE_PER_SESSION_L1_QUOTE_COVERAGE');
      const tickTimes=[low,...dayQuotes.map(q=>time(q.observedAt)),high];
      for(let i=1;i<tickTimes.length;i++){
        const gap=(tickTimes[i]-tickTimes[i-1])/MINUTE;
        sessionGapMax=Math.max(sessionGapMax,gap);
        if(gap>policy.maximumWithinSessionQuoteGapMinutes)
          flag('INTRASESSION_L1_OBSERVATION_GAP_TOO_WIDE');
      }
      if(dayQuotes.length&&pastSessionLastBid!==null){
        const adverse=(pastSessionLastBid-dayQuotes[0].bid)/
          pastSessionLastBid*100;
        maxAdverseGap=Math.max(maxAdverseGap??0,adverse);
        if(adverse>policy.overnightAdverseBidGapAlertPercent)
          overnightAlerts++;
      }
      if(dayQuotes.length)pastSessionLastBid=dayQuotes[dayQuotes.length-1].bid;
    }
    // The future window may include a day with no observations at all. That
    // must remain a missing-path failure, not an inferred holiday/zero loss.
    const spreadSorted=[...spreadBps].sort((a,b)=>a-b);
    const lagSorted=[...latencies].sort((a,b)=>a-b);
    paths.push({
      foldIndex:entry.foldIndex,arm:entry.arm,horizon:entry.horizon,
      decisionAt:entry.decisionAt,
      disposition:reasons.length?
        'MISSING_OR_UNRELIABLE_L1_PATH':'SUFFICIENT_SOURCE_ATTESTED_OBSERVATIONS',
      reasons,sessionsEvaluated:overlap.length,quoteCount:matching.length,
      maximumWithinSessionGapMinutes:overlap.length?round(sessionGapMax):null,
      maximumSpreadBps:spreadBps.length?round(Math.max(...spreadBps)):null,
      spreadBpsP95:percentile(spreadSorted,.95),
      wideSpreadQuotePercent:percent(wideCount,matching.length),
      insufficientDepthQuotePercent:percent(thinCount,matching.length),
      eventToAvailableLagSecondsP95:percentile(lagSorted,.95),
      largestAdverseOvernightBidGapPercent:maxAdverseGap===null?null:round(maxAdverseGap),
      adverseOvernightGapAlertCount:overnightAlerts,
      firstFixedDueExitBidObservedAt:firstDue?.observedAt??null
    });
  }
  const cells:MarketDataQualityCell[]=[];
  for(let foldIndex=0;foldIndex<input.policy.folds.length;foldIndex++)
    for(const arm of ARMS)for(const horizon of HORIZONS){
      const attempts=cohort!.attempts.filter(a=>a.foldIndex===foldIndex&&
        a.arm===arm&&a.horizon===horizon);
      const observed=attempts.filter(a=>a.disposition==='ENTRY_OBSERVED');
      const missing=attempts.filter(a=>
        a.disposition==='MISSING_EXECUTABLE_ENTRY_L1'||
        a.disposition==='UNUSABLE_UNDERLYING_HISTORY');
      const subset=paths.filter(p=>p.foldIndex===foldIndex&&p.arm===arm&&
        p.horizon===horizon);
      const passed=subset.filter(p=>
        p.disposition==='SUFFICIENT_SOURCE_ATTESTED_OBSERVATIONS');
      const spreads=subset.flatMap(p=>p.spreadBpsP95===null?[]:[p.spreadBpsP95]);
      const lags=subset.flatMap(p=>
        p.eventToAvailableLagSecondsP95===null?[]:[p.eventToAvailableLagSecondsP95]);
      const adverse=subset.flatMap(p=>
        p.largestAdverseOvernightBidGapPercent===null?[]:[
          p.largestAdverseOvernightBidGapPercent]);
      cells.push({
        foldIndex,arm,horizon,decisionCount:attempts.length,
        observedEntryCount:observed.length,missingEntryCount:missing.length,
        qualityPassCount:passed.length,
        incompleteL1PathCount:subset.length-passed.length,
        noSignalOrIneligibleCount:attempts.length-observed.length-missing.length,
        adverseOvernightGapAlertCount:subset.reduce((a,v)=>
          a+v.adverseOvernightGapAlertCount,0),
        largestAdverseOvernightBidGapPercent:adverse.length?
          round(Math.max(...adverse)):null,
        spreadBpsP95:percentile(spreads.sort((a,b)=>a-b),.95),
        eventToAvailableLagSecondsP95:percentile(lags.sort((a,b)=>a-b),.95),
        sufficientForDescriptiveQualityReview:observed.length>=
          policy.minimumObservedEntriesPerArmHorizon &&
          subset.length===observed.length &&
          passed.length===observed.length && missing.length===0,
        productionEligible:false
      });
    }
  const everyCell=!!cells.length&&cells.every(c=>
    c.sufficientForDescriptiveQualityReview);
  return{
    ...base,status:everyCell?'DESCRIPTIVE_ONLY':'INCOMPLETE_EVIDENCE',
    policy,totalOutOfSampleDecisions:cohort!.counts.testDecisions,
    observedEntryCount:allObserved.length,
    missingEntryCount:cohort!.counts.missingEntryCount,
    paths,cells
  };
}
