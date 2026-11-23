/**
 * Phase79 — frozen original all-listed CE/PE historical option price-path coverage.
 * OFFLINE RESEARCH ONLY. Native CSV, original listing catalog, sessions and
 * availableAt timestamps are operator supplied. Even internally complete
 * source coverage is NOT authentic data, a client receipt, a trading fill,
 * historical profits or permission to select 1W–8W options/route NRML orders.
 */
import {createHash} from 'node:crypto';
import {parseOriginalNativeL1Csv} from './adaptiveNativeL1CsvBridge.js';
import type {Phase66OriginalCatalog}
  from './adaptivePhase66StandaloneVendorPreflight.js';

export type Phase79Horizon='1W'|'2W'|'4W'|'8W';
export type Phase79Side='CE'|'PE';
export interface Phase79DeclaredSession{
  sessionDate:string;
  openAt:string;
  closeAt:string;
}
export interface Phase79Policy{
  source:'OWNER_PREDECLARED_QUOTE_AVAILABILITY_NOT_LIVE_TRADING';
  minBestBidAndAskDepthLots:number;
  maxDecisionQuoteAgeSeconds:number;
  maxClaimedEventToArrivalSeconds:number;
  closingBidWindowMinutes:number;
  nextOpenBidWindowMinutes:number;
  armingGainPremiumPoints:number;
  givebackAlertPremiumPoints:number;
  targetAlertPremiumPoints:number;
}
export interface Phase79Input{
  schemaVersion:'PHASE79_OFFLINE_ALL_ORIGINAL_LISTED_PREMIUM_PATH_V1';
  source:'PRIVATE_OPERATOR_SUPPLIED_NATIVE_OPTION_L1_NOT_AUTHENTICATED';
  datasetKind:'SYNTHETIC_FIXTURE'|'UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE';
  /** Exact raw vendor CSV byte stream; never log or publish. */
  originalNativeL1Csv:Uint8Array;
  /** Original frozen, exhaustive listed CE/PE options including NO_ENTRY. */
  originalCatalog:Phase66OriginalCatalog;
  /** Declared sessions are NOT an official authenticated exchange calendar. */
  declaredSessions:Phase79DeclaredSession[];
  policy:Phase79Policy;
}
export interface Phase79Pins{
  schemaVersion:'PHASE79_SEPARATELY_FROZEN_ORIGINAL_UNIVERSE_PINS_V1';
  expectedNativeCsvSha256:string;
  expectedOriginalCatalogSha256:string;
  expectedDeclaredSessionsSha256:string;
  expectedPolicySha256:string;
  expectedOriginalDecisionDates:number;
  expectedOriginalNoEntryDecisions:number;
  expectedOriginallyListedPairs:number;
  expectedOriginallyNoEntryPairs:number;
}
export interface Phase79Cell{
  claimedRegime:string;
  horizon:Phase79Horizon;
  side:Phase79Side;
  originalListedPairs:number;
  originalNoEntryPairs:number;
  originalEntryClaimedPairs:number;
  entryClaimedPairsMissingCausalQuotedAsk:number;
  entryClaimedPairsWithClaimedDecisionAsk:number;
  entryClaimedPairsWithUnmarketableDecisionBid:number;
  entryClaimedPairsWithDecisionSpreadAtLeastArmingGain:number;
  entryClaimedPairsWithObservedIlliquidBidUpdate:number;
  entryCandidateStaleLateQuoteObservationsIgnored:number;
  entryClaimedPairsWithUnderTargetQuotedGiveback:number;
  entryClaimedPairsWithFirstNextOpenQuotedGapThroughTrail:number;
  entryClaimedPairsWithUnresolvedOvernightCalendarTransition:number;
  entryClaimedPairsWithFirstBoundedNextOpenIlliquidBid:number;
  entryClaimedPairsMissingBoundedNextOpenAfterNewArmedPeak:number;
  originalPairsCensoredByMissingSessionCloseBid:number;
  missingDeclaredSessionCloseBidObservations:number;
  originalPairsWithPotentialUndeclaredWeekdays:number;
  potentialUndeclaredWeekdayObservations:number;
  entryClaimedPositionsActuallyExecuted:0;
  historicalMarketOriginAuthenticated:false;
  selectedBestContractOrHorizon:false;
}
export interface Phase79Report{
  mode:'OFFLINE_ORIGINAL_OPTION_PREMIUM_PATH_COVERAGE_NOT_EXECUTION';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING'|
    'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED';
  reasonCodes:string[];
  syntheticDataset:boolean|null;
  originalDecisionDates:number;
  originalNoEntryDecisions:number;
  originallyListedPairs:number;
  originallyNoEntryPairs:number;
  originalEntryClaimedPairs:number;
  parsedNativeQuoteRows:number;
  claimedAsOfEntryAskPairs:number;
  entryPairsMissingClaimedAsOfAsk:number;
  entryPairsWithUnmarketableDecisionBid:number;
  entryPairsWithDecisionSpreadAtLeastArmingGain:number;
  entryPairsWithObservedIlliquidBidUpdate:number;
  entryCandidateStaleLateQuoteObservationsIgnored:number;
  quotedUnderTargetPremiumGivebackPairs:number;
  quotedNextOpenGapThroughTrailPairs:number;
  entryPairsWithUnresolvedOvernightCalendarTransition:number;
  entryPairsWithFirstBoundedNextOpenIlliquidBid:number;
  entryPairsMissingBoundedNextOpenAfterNewArmedPeak:number;
  listedPairsWithMissingDeclaredSessionCloseBid:number;
  missingDeclaredSessionCloseBidObservations:number;
  originalPairsWithPotentialUndeclaredWeekdays:number;
  potentialUndeclaredWeekdayObservations:number;
  noEntryAlternativesNeverHypotheticalPurchases:true;
  sourceAndResearchLicenceIndependentlyAuthenticated:false;
  originalStrategyClientReceiveClockAuthenticated:false;
  officialExchangeExpiryAndSessionCalendarAuthenticated:false;
  actualEntryAndExitFillsVerified:false;
  quotedBidsAreNotExecutableStopFills:true;
  realOutOfSampleOptionReturnOrProfitabilityProven:false;
  noClaimedDataAutomaticallyBecomesBrokerPositions:true;
  fullPaidOptionPremiumDebitMayBeLost:true;
  nativeBrokerNrmlGttStopChildAckVerified:false;
  bestContractOrHorizonAuthorized:false;
  existingMis1515Unchanged:true;
  forced1515PositionalExit:false;
  nativeOrderInstruction:null;
  executionAuthorized:false;
  productionSafe:false;
  cells:Phase79Cell[];
  externalEvidenceRequired:string[];
}
const HEAD=['sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'] as const;
const SHA=/^[0-9a-f]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const DAY=/^\d{4}-\d\d-\d\d$/;
const SEC=1000,MIN=60000,IST=330*MIN;
const HORIZONS:Phase79Horizon[]=['1W','2W','4W','8W'];
const need=[
  'GENUINE_LICENSED_EXTERNAL_OPTION_L1_WITH_LEGALLY_VERIFIED_HISTORICAL_RESEARCH_SCOPE',
  'POINT_IN_TIME_INDEPENDENT_EXCHANGE_LOT_EXPIRY_SESSION_AND_HOLIDAY_MASTER',
  'ORIGINAL_STRATEGY_RECEIPT_CLOCK_IF_CAPTURED_CONTEMPORANEOUSLY',
  'ALL_LISTED_OPTIONS_CONTINUOUS_GENUINE_BID_ASK_DEPTH_THROUGH_LAST_TRADABLE_SESSION',
  'UNTOUCHED_MULTICYCLE_REGIME_OOS_WITH_IV_THETA_GAP_SPREAD_SLIPPAGE',
  'BROKER_NRML_GTT_CHILD_EXCHANGE_ACK_AND_ACTUAL_FILL_NONFILL_RECONCILIATION'
];
const digest=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
export const hashPhase79Object=(v:unknown)=>digest(JSON.stringify(v));
const integer=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const finite=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
/** Strict offset-local wall clock: Date.parse alone normalizes Feb 31 to Mar 3. */
const stamp=(v:unknown):number=>{
  if(typeof v!=='string'||!ISO.test(v))return NaN;
  const millis=Date.parse(v);
  if(!Number.isFinite(millis))return NaN;
  const zone=v.endsWith('Z')?'Z':v.slice(-6);
  let offset=0;
  if(zone!=='Z'){
    const hour=Number(zone.slice(1,3)),minute=Number(zone.slice(4,6));
    if(hour>23||minute>59)return NaN;
    offset=(zone[0]==='-'?-1:1)*(hour*60+minute)*MIN;
  }
  // Reconstruct the explicit local date/time, not the normalized UTC date.
  // Millisecond precision is deliberately left unchanged.
  const reconstructed=new Date(millis+offset).toISOString().slice(0,19);
  return reconstructed===v.slice(0,19)?millis:NaN;
};
const day=(v:unknown):v is string=>
  typeof v==='string'&&DAY.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&
  new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const istDay=(t:number)=>new Date(t+IST).toISOString().slice(0,10);
const horizon=(expiry:string,decisionAt:string):Phase79Horizon|null=>{
  const days=(Date.parse(expiry+'T00:00:00Z')-
    Date.parse(istDay(Date.parse(decisionAt))+'T00:00:00Z'))/86400000;
  return days>=1&&days<8?'1W':days>=8&&days<18?'2W':
    days>=18&&days<36?'4W':days>=36&&days<=80?'8W':null;
};
interface Quote{
  instrument:string;sequence:number;event:number;available:number;bid:number;ask:number;
  bidQty:number;askQty:number;
}
function blank():Phase79Report{
  return {mode:'OFFLINE_ORIGINAL_OPTION_PREMIUM_PATH_COVERAGE_NOT_EXECUTION',
    status:'INVALID_EVIDENCE',reasonCodes:[],syntheticDataset:null,
    originalDecisionDates:0,originalNoEntryDecisions:0,
    originallyListedPairs:0,originallyNoEntryPairs:0,
    originalEntryClaimedPairs:0,parsedNativeQuoteRows:0,
    claimedAsOfEntryAskPairs:0,entryPairsMissingClaimedAsOfAsk:0,
    entryPairsWithUnmarketableDecisionBid:0,
    entryPairsWithDecisionSpreadAtLeastArmingGain:0,
    entryPairsWithObservedIlliquidBidUpdate:0,
    entryCandidateStaleLateQuoteObservationsIgnored:0,
    quotedUnderTargetPremiumGivebackPairs:0,
    quotedNextOpenGapThroughTrailPairs:0,
    entryPairsWithUnresolvedOvernightCalendarTransition:0,
    entryPairsWithFirstBoundedNextOpenIlliquidBid:0,
    entryPairsMissingBoundedNextOpenAfterNewArmedPeak:0,
    listedPairsWithMissingDeclaredSessionCloseBid:0,
    missingDeclaredSessionCloseBidObservations:0,
    originalPairsWithPotentialUndeclaredWeekdays:0,
    potentialUndeclaredWeekdayObservations:0,
    noEntryAlternativesNeverHypotheticalPurchases:true,
    sourceAndResearchLicenceIndependentlyAuthenticated:false,
    originalStrategyClientReceiveClockAuthenticated:false,
    officialExchangeExpiryAndSessionCalendarAuthenticated:false,
    actualEntryAndExitFillsVerified:false,quotedBidsAreNotExecutableStopFills:true,
    realOutOfSampleOptionReturnOrProfitabilityProven:false,
    noClaimedDataAutomaticallyBecomesBrokerPositions:true,
    fullPaidOptionPremiumDebitMayBeLost:true,
    nativeBrokerNrmlGttStopChildAckVerified:false,
    bestContractOrHorizonAuthorized:false,
    existingMis1515Unchanged:true,forced1515PositionalExit:false,
    nativeOrderInstruction:null,executionAuthorized:false,productionSafe:false,
    cells:[],externalEvidenceRequired:need
  };
}
function fail(reason:string,status:Phase79Report['status']='INVALID_EVIDENCE'):
  Phase79Report{return {...blank(),status,reasonCodes:[reason]};}
const parsedNum=(s:string,min:number,max:number):number=>
  /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(s)&&finite(Number(s),min,max)?Number(s):NaN;
/** The source dates are strict YYYY-MM-DD, so lexicographic binary bounds work.
 * Counts are only over operator-declared sessions, NOT an official calendar. */
const lowerDay=(a:string[],key:string):number=>{
  let lo=0,hi=a.length;
  while(lo<hi){const mid=lo+Math.floor((hi-lo)/2);
    if(a[mid]<key)lo=mid+1;else hi=mid;
  }
  return lo;
};
const upperDay=(a:string[],key:string):number=>{
  let lo=0,hi=a.length;
  while(lo<hi){const mid=lo+Math.floor((hi-lo)/2);
    if(a[mid]<=key)lo=mid+1;else hi=mid;
  }
  return lo;
};
/** Candidate Monday–Friday dates only; NOT an authenticated exchange
 * schedule. This is calendar completeness suspicion, not verified trading. */
const candidateWeekdaysInclusive=(first:string,last:string):number=>{
  const from=Date.parse(first+'T00:00:00Z'),
    to=Date.parse(last+'T00:00:00Z');
  const days=Math.floor((to-from)/86400000)+1;
  if(days<=0)return 0;
  const full=Math.floor(days/7),tail=days%7;
  let total=full*5;
  const dow=new Date(from).getUTCDay();
  for(let i=0;i<tail;i++){
    const today=(dow+i)%7;
    if(today!==0&&today!==6)total++;
  }
  return total;
};
const isCalendarWeekday=(date:string):boolean=>{
  const dow=new Date(date+'T00:00:00Z').getUTCDay();
  return dow!==0&&dow!==6;
};
/** Candidate missing Mon-Fri dates strictly between two declared dates.
 * A real exchange holiday remains possible and requires issuer evidence. */
const interveningCandidateWeekdays=(from:string,to:string):number=>
  Math.max(0,candidateWeekdaysInclusive(from,to)-
    Number(isCalendarWeekday(from))-Number(isCalendarWeekday(to)));
/** All returned marks are observed operator-claimed quotes, never fills. */
export function auditPhase79OriginalPremiumPathCoverage(
  input:Phase79Input,pins:Phase79Pins
):Phase79Report{
  if(!input||input.schemaVersion!=='PHASE79_OFFLINE_ALL_ORIGINAL_LISTED_PREMIUM_PATH_V1'||
    input.source!=='PRIVATE_OPERATOR_SUPPLIED_NATIVE_OPTION_L1_NOT_AUTHENTICATED'||
    !['SYNTHETIC_FIXTURE','UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE']
      .includes(input.datasetKind)||
    !(input.originalNativeL1Csv instanceof Uint8Array)||
    input.originalNativeL1Csv.length>50*1024*1024||
    !input.originalCatalog||!Array.isArray(input.originalCatalog.decisions)||
    !Array.isArray(input.declaredSessions)||!input.policy||!pins)
    return fail('PHASE79_INVALID_SOURCE_ENVELOPE');
  const p=input.policy,catalog=input.originalCatalog;
  if(p.source!=='OWNER_PREDECLARED_QUOTE_AVAILABILITY_NOT_LIVE_TRADING'||
    !integer(p.minBestBidAndAskDepthLots,1,1000)||
    !integer(p.maxDecisionQuoteAgeSeconds,1,3600)||
    !integer(p.maxClaimedEventToArrivalSeconds,0,3600)||
    !integer(p.closingBidWindowMinutes,1,90)||
    !integer(p.nextOpenBidWindowMinutes,1,90)||
    !finite(p.armingGainPremiumPoints,0.01,100000)||
    !finite(p.givebackAlertPremiumPoints,0.01,100000)||
    !finite(p.targetAlertPremiumPoints,0.01,100000)||
    !(p.givebackAlertPremiumPoints<p.armingGainPremiumPoints&&
      p.armingGainPremiumPoints<p.targetAlertPremiumPoints)||
    pins.schemaVersion!=='PHASE79_SEPARATELY_FROZEN_ORIGINAL_UNIVERSE_PINS_V1'||
    ![pins.expectedNativeCsvSha256,pins.expectedOriginalCatalogSha256,
      pins.expectedDeclaredSessionsSha256,pins.expectedPolicySha256]
      .every(x=>typeof x==='string'&&SHA.test(x))||
    digest(input.originalNativeL1Csv)!==pins.expectedNativeCsvSha256||
    hashPhase79Object(catalog)!==pins.expectedOriginalCatalogSha256||
    hashPhase79Object(input.declaredSessions)!==pins.expectedDeclaredSessionsSha256||
    hashPhase79Object(p)!==pins.expectedPolicySha256||
    !integer(pins.expectedOriginalDecisionDates,1,100000)||
    !integer(pins.expectedOriginalNoEntryDecisions,0,100000)||
    !integer(pins.expectedOriginallyListedPairs,8,1000000)||
    !integer(pins.expectedOriginallyNoEntryPairs,1,1000000))
    return fail('PHASE79_POLICY_OR_SEPARATE_RAW_SOURCE_PINS_INVALID');
  if(catalog.schemaVersion!=='ADAPTIVE_PHASE66_NEW_VENDOR_ORIGINAL_OOS_CATALOG_V1'||
    catalog.source!=='OWNER_DECLARED_POINT_IN_TIME_CONTRACT_UNIVERSE_UNVERIFIED'||
    catalog.decisions.length!==pins.expectedOriginalDecisionDates||
    catalog.decisions.length>1000||
    input.declaredSessions.length<1||input.declaredSessions.length>1000)
    return fail('PHASE79_ORIGINAL_OOS_OR_SESSION_MANIFEST_INVALID');
  const sessions=new Map<string,{open:number;close:number}>();
  for(const s of input.declaredSessions){
    const o=s&&stamp(s.openAt),c=s&&stamp(s.closeAt);
    if(!s||!day(s.sessionDate)||!Number.isFinite(o)||!Number.isFinite(c)||
      o>=c||istDay(o)!==s.sessionDate||istDay(c)!==s.sessionDate||
      sessions.has(s.sessionDate))
      return fail('PHASE79_DUPLICATE_INVALID_OR_CROSS_DAY_SESSION');
    sessions.set(s.sessionDate,{open:o,close:c});
  }
  const raw=parseOriginalNativeL1Csv(input.originalNativeL1Csv);
  if(!raw||raw.length<2||HEAD.some((h,i)=>raw[0][i]!==h)||
    raw[0].length!==HEAD.length)
    return fail('PHASE79_NATIVE_L1_CSV_NOT_ORIGINAL_STRICT_FORMAT');
  const seenIds=new Set<string>(),seenSeq=new Set<string>();
  // Per-contract/per-session source sequence is distinct from delivery order.
  // Its event-time chronology must not be inverted by arbitrary CSV ordering
  // or by a self-pinned archive with contradictory vendor sequence numbers.
  const sourceSequences=new Map<string,Array<{sequence:number;event:number}>>();
  const quotes=new Map<string,Quote[]>();
  for(const row of raw.slice(1)){
    if(row.length!==HEAD.length||!row[0]||seenIds.has(row[0])||
      !/^[A-Za-z0-9_.:-]{1,120}$/.test(row[0])||
      !/^[A-Za-z0-9][A-Za-z0-9._:/|+-]{3,179}$/.test(row[2]))
      return fail('PHASE79_DUPLICATED_OR_MALFORMED_NATIVE_QUOTE');
    seenIds.add(row[0]);
    const event=stamp(row[3]),available=stamp(row[4]),
      bid=parsedNum(row[5],0,1e6),ask=parsedNum(row[6],0,1e6),
      bidQty=parsedNum(row[7],0,1e9),askQty=parsedNum(row[8],0,1e9);
    const sequence=parsedNum(row[1],1,Number.MAX_SAFE_INTEGER);
    if(!Number.isSafeInteger(sequence)||!Number.isInteger(bidQty)||
      !Number.isInteger(askQty)||!Number.isFinite(event)||
      !Number.isFinite(available)||!Number.isFinite(bid)||
      !Number.isFinite(ask)||!Number.isFinite(bidQty)||
      !Number.isFinite(askQty)||ask<bid||available<event||
      available-event>p.maxClaimedEventToArrivalSeconds*SEC)
      return fail('PHASE79_INVALID_NATIVE_BID_ASK_DEPTH_OR_SOURCE_CLOCK');
    const d=istDay(event),ses=sessions.get(d);
    if(!ses||event<ses.open||event>ses.close||
      seenSeq.has(JSON.stringify([d,row[2],sequence])))
      return fail('PHASE79_OUTSIDE_DECLARED_SESSION_OR_REPLAYED_SEQUENCE');
    seenSeq.add(JSON.stringify([d,row[2],sequence]));
    const scope=JSON.stringify([d,row[2]]);
    const sequenceRows=sourceSequences.get(scope)??[];
    sequenceRows.push({sequence,event});
    sourceSequences.set(scope,sequenceRows);
    const q={instrument:row[2],sequence,event,available,bid,ask,bidQty,askQty};
    const xs=quotes.get(row[2])??[];xs.push(q);quotes.set(row[2],xs);
  }
  for(const sequenceRows of sourceSequences.values()){
    sequenceRows.sort((a,b)=>a.sequence-b.sequence);
    if(sequenceRows.some((q,i)=>i>0&&
       q.event<sequenceRows[i-1].event))
      return fail('PHASE84_ORIGINAL_SOURCE_SEQUENCE_EVENT_CLOCK_INVERSION',
        'INCOMPLETE_EVIDENCE');
  }
  // Path observations must respect operator-claimed arrival order, NOT
  // re-sort a delayed quote into a hindsight event-time winning path.
  // This claimed clock is still NOT authenticated historical client access.
  for(const qs of quotes.values())qs.sort((a,b)=>
    a.available-b.available||a.event-b.event||a.sequence-b.sequence);
  // One causal source-state lookup per instrument + declared closing session.
  // This replaces the old per-(original decision,contract,session) linear
  // scan of the ENTIRE quote path, which grew explosively on large archives.
  // Choose latest event / sequence BEFORE testing usable BID and lot depth.
  const closingByInstrument=new Map<string,Map<string,Quote>>();
  for(const [instrument,qs] of quotes){
    const byDate=new Map<string,Quote>();
    for(const q of qs){
      const date=istDay(q.event),ses=sessions.get(date)!;
      if(q.event<ses.close-p.closingBidWindowMinutes*MIN||
         q.event>ses.close||q.available>ses.close)continue;
      const prior=byDate.get(date);
      if(!prior||q.event>prior.event||
         (q.event===prior.event&&q.sequence>prior.sequence)||
         (q.event===prior.event&&q.sequence===prior.sequence&&
          q.available>prior.available))
        byDate.set(date,q);
    }
    closingByInstrument.set(instrument,byDate);
  }
  // A source token's lot metadata is immutable across original decision
  // dates (Phase82). Its sorted usable closing-session dates are cached
  // exactly once. Counts then use O(log declared sessions) binary bounds.
  const usableClosingDates=new Map<string,{lot:number;dates:string[]}>();
  const validClosingDates=(instrument:string,lot:number):string[]=>{
    const cached=usableClosingDates.get(instrument);
    if(cached&&cached.lot===lot)return cached.dates;
    const dates=[...(closingByInstrument.get(instrument)??new Map())]
      .filter(([,q])=>q.bid>0&&
        q.bidQty>=p.minBestBidAndAskDepthLots*lot)
      .map(([date])=>date).sort();
    usableClosingDates.set(instrument,{lot,dates});
    return dates;
  };
  const groups=new Map<string,Phase79Cell>();
  const originalPairs=new Set<string>(),decisionDates=new Set<string>();
  // A source instrument token is one immutable option contract across ALL
  // original decisions. Otherwise two tenors/sides/strikes could silently
  // share one BID path and distort giveback, overnight gaps and OOS coverage.
  const contractIdentities=new Map<string,{
    optionType:Phase79Side;expiry:string;strikePrice:number;lotSize:number
  }>();
  let noEntryDecisions=0,total=0,noEntries=0,entries=0;
  let asOf=0,missingAsk=0,giveback=0,gap=0,missingNextOpen=0,
    illiquidBidPairs=0,unmarketableEntryBids=0,wideDecisionSpreads=0,
    staleQuoteObservations=0,censored=0,missingCloses=0,
    weekdayGapPairs=0,weekdayGapObservations=0,
    unresolvedOvernightTransitions=0,firstOpenIlliquidPairs=0;
  const sessionDates=[...sessions.keys()].sort();
  const weekdaySessionDates=sessionDates.filter(isCalendarWeekday);
  const adjacent=new Map<string,string>();
  for(let i=0;i<sessionDates.length-1;i++)
    adjacent.set(sessionDates[i],sessionDates[i+1]);
  // Do not treat the next AVAILABLE date as the next TRADING date if an
  // undeclared weekday lies in between. The missing day could be a holiday,
  // but without official evidence an overnight gap quote is not causal.
  const nextDeclaredSession=(date:string):string|null=>{
    const next=adjacent.get(date);
    return next&&interveningCandidateWeekdays(date,next)===0?next:null;
  };
  const unresolvedArmedFollowingSession=(date:string,expiry:string):boolean=>{
    const eligibleFutureWeekdays=candidateWeekdaysInclusive(date,expiry)-
      Number(isCalendarWeekday(date));
    if(eligibleFutureWeekdays<=0)return false;
    const next=adjacent.get(date);
    return !next||next>expiry||
      interveningCandidateWeekdays(date,next)>0;
  };
  for(const d of catalog.decisions){
    if(!d||!day(d.sessionDate)||decisionDates.has(d.sessionDate)||
      stamp(d.decisionAt)<0||!Number.isFinite(stamp(d.decisionAt))||
      istDay(stamp(d.decisionAt))!==d.sessionDate||
      !sessions.has(d.sessionDate)||
      stamp(d.decisionAt)<sessions.get(d.sessionDate)!.open||
      stamp(d.decisionAt)>sessions.get(d.sessionDate)!.close||
      !['NO_ENTRY','ENTRY_CLAIMED'].includes(d.originalEntryDisposition)||
      !Array.isArray(d.originallyListedContracts)||
      d.originallyListedContracts.length<8||
      d.originallyListedContracts.length>200)
      return fail('PHASE79_ORIGINAL_DECISION_OR_LISTED_UNIVERSE_INVALID');
    decisionDates.add(d.sessionDate);
    if(d.originalEntryDisposition==='NO_ENTRY')noEntryDecisions++;
    const originalHorizonSides=new Set<string>();
    for(const c of d.originallyListedContracts){
      const h=c&&horizon(c.expiry,d.decisionAt);
      if(!c||!day(c.expiry)||!h||!['CE','PE'].includes(c.optionType)||
        typeof c.instrumentKey!=='string'||c.instrumentKey.length>180||
        !/^[A-Za-z0-9][A-Za-z0-9._:/|+-]{3,179}$/.test(c.instrumentKey)||
        !integer(c.lotSize,1,10000)||
        !finite(c.strikePrice,0.01,100000000))
        return fail('PHASE79_OPTION_CONTRACT_LOT_EXPIRY_OR_SIDE_INVALID');
      const prior=contractIdentities.get(c.instrumentKey);
      if(prior&&(prior.expiry!==c.expiry||
         prior.optionType!==c.optionType||
         prior.strikePrice!==c.strikePrice||
         prior.lotSize!==c.lotSize))
        return fail('PHASE82_REUSED_CONTRACT_TOKEN_CONTRADICTS_EXPIRY_SIDE_STRIKE_OR_LOT',
          'INCOMPLETE_EVIDENCE');
      if(!prior)contractIdentities.set(c.instrumentKey,{
        optionType:c.optionType,expiry:c.expiry,strikePrice:c.strikePrice,
        lotSize:c.lotSize});
      originalHorizonSides.add(h+'-'+c.optionType);
      const k=JSON.stringify([d.sessionDate,c.instrumentKey]);
      if(originalPairs.has(k))return fail('PHASE79_DUPLICATED_ORIGINAL_LISTED_PAIR');
      originalPairs.add(k);
      const g=JSON.stringify([d.claimedRegime,h,c.optionType]);
      let cell=groups.get(g);
      if(!cell){
        cell={claimedRegime:d.claimedRegime,horizon:h,side:c.optionType,
          originalListedPairs:0,originalNoEntryPairs:0,
          originalEntryClaimedPairs:0,entryClaimedPairsMissingCausalQuotedAsk:0,
          entryClaimedPairsWithClaimedDecisionAsk:0,
          entryClaimedPairsWithUnmarketableDecisionBid:0,
          entryClaimedPairsWithDecisionSpreadAtLeastArmingGain:0,
          entryClaimedPairsWithObservedIlliquidBidUpdate:0,
          entryCandidateStaleLateQuoteObservationsIgnored:0,
          entryClaimedPairsWithUnderTargetQuotedGiveback:0,
          entryClaimedPairsWithFirstNextOpenQuotedGapThroughTrail:0,
          entryClaimedPairsWithUnresolvedOvernightCalendarTransition:0,
          entryClaimedPairsWithFirstBoundedNextOpenIlliquidBid:0,
          entryClaimedPairsMissingBoundedNextOpenAfterNewArmedPeak:0,
          originalPairsCensoredByMissingSessionCloseBid:0,
          missingDeclaredSessionCloseBidObservations:0,
          originalPairsWithPotentialUndeclaredWeekdays:0,
          potentialUndeclaredWeekdayObservations:0,
          entryClaimedPositionsActuallyExecuted:0,
          historicalMarketOriginAuthenticated:false,
          selectedBestContractOrHorizon:false};
        groups.set(g,cell);
      }
      total++;cell.originalListedPairs++;
      const noEntry=d.originalEntryDisposition==='NO_ENTRY';
      if(noEntry){noEntries++;cell.originalNoEntryPairs++;}
      else {entries++;cell.originalEntryClaimedPairs++;}
      const q=(quotes.get(c.instrumentKey)??[]);
      const dec=Date.parse(d.decisionAt);
      // Reconstruct the most recent operator-claimed exchange BOOK STATE
      // available by decision, including illiquid/zero-depth updates.
      // Do NOT cherry-pick an older ask that was superseded by no liquidity.
      const latestDecisionQuote=q.filter(x=>x.event<=dec&&x.available<=dec)
        .sort((a,b)=>b.event-a.event||b.sequence-a.sequence||
          b.available-a.available)[0];
      const entry=latestDecisionQuote&&
        dec-latestDecisionQuote.event<=p.maxDecisionQuoteAgeSeconds*SEC&&
        latestDecisionQuote.ask>0&&
        latestDecisionQuote.askQty>=p.minBestBidAndAskDepthLots*c.lotSize?
        latestDecisionQuote:undefined;
      // An original NO_ENTRY is never a purchased option, even with good quotes.
      if(!noEntry){
        if(!entry){missingAsk++;cell.entryClaimedPairsMissingCausalQuotedAsk++;}
        else {
          asOf++;cell.entryClaimedPairsWithClaimedDecisionAsk++;
          // Entry purchase-side ASK availability is NOT guaranteed
          // immediate sell-side liquidity. Audit the SAME as-of book state
          // without assuming a fill or inventing any BID after decision.
          const noUsableEntryBid=entry.bid<=0||
            entry.bidQty<p.minBestBidAndAskDepthLots*c.lotSize;
          if(noUsableEntryBid){
            unmarketableEntryBids++;
            cell.entryClaimedPairsWithUnmarketableDecisionBid++;
          }
          // The frozen arming threshold is already part of the separately
          // pinned policy. A displayed round-trip spread at least this large
          // is a severe quote-cost warning, NOT a PnL or executable cost.
          if(entry.ask-entry.bid>=p.armingGainPremiumPoints){
            wideDecisionSpreads++;
            cell.entryClaimedPairsWithDecisionSpreadAtLeastArmingGain++;
          }
          // A quote that arrived after the claimed session CLOSE was
          // NOT available to the algorithm during that tradable session,
          // regardless of its exchange-side event timestamp.
          const afterAll=q.filter(x=>x.event>dec&&x.available>dec&&
            istDay(x.event)<=c.expiry&&
            x.available<=sessions.get(istDay(x.event))!.close);
          // Apply every source update in claimed RECEIPT order first.
          // An older event that arrives after a newer event is a stale
          // snapshot: it cannot roll the book BACKWARD to fabricate a
          // +70-to-+20 reversal. A zero-depth/newer quote supersedes
          // the previous usable quote instead of being filtered away.
          const after:Quote[]=[];
          // First CAUSALLY RECEIVED bounded opening BOOK STATE, including
          // zero-BID and sub-lot updates. Do not cherry-pick a later
          // marketable quote as if it were the FIRST opening quote.
          const firstBoundedOpen=new Map<string,Quote>();
          let latestAppliedEvent=-Infinity,latestAppliedSeq=-Infinity;
          let sawIlliquidBid=false,ignoredStale=0;
          for(const x of afterAll){
            if(x.event<latestAppliedEvent||
               (x.event===latestAppliedEvent&&
                x.sequence<=latestAppliedSeq)){
              ignoredStale++;
              continue;
            }
            latestAppliedEvent=x.event;latestAppliedSeq=x.sequence;
            const openDay=istDay(x.event),session=sessions.get(openDay)!;
            if(!firstBoundedOpen.has(openDay)&&
               x.event>=session.open&&
               x.event<=session.open+p.nextOpenBidWindowMinutes*MIN&&
               x.available<=session.open+p.nextOpenBidWindowMinutes*MIN)
              firstBoundedOpen.set(openDay,x);
            if(x.bid<=0||x.bidQty<p.minBestBidAndAskDepthLots*c.lotSize){
              sawIlliquidBid=true;
              continue;
            }
            after.push(x);
          }
          if(sawIlliquidBid){
            illiquidBidPairs++;
            cell.entryClaimedPairsWithObservedIlliquidBidUpdate++;
          }
          if(ignoredStale){
            staleQuoteObservations+=ignoredStale;
            cell.entryCandidateStaleLateQuoteObservationsIgnored+=ignoredStale;
          }
          let peak=entry.ask, peakSession=d.sessionDate,seenGiveback=false,seenGap=false;
          let unresolvedArmedCalendar=false;
          const newArmedPeakNextOpens=new Set<string>();
          for(const x of after){
            const gain=peak-entry.ask;
            const next=istDay(x.event);
            // Compare the actual FIRST causally observable opening book
            // state only. A zero-BID/sublot first snapshot cannot be
            // overwritten by the second, tradable quote of that morning.
            const ses=sessions.get(next);
            if(!seenGap&&firstBoundedOpen.get(next)===x&&
               next===nextDeclaredSession(peakSession)&&ses&&
               x.event>=ses.open&&x.available>=ses.open&&
               x.event<=ses.open+p.nextOpenBidWindowMinutes*MIN&&
               x.available<=ses.open+p.nextOpenBidWindowMinutes*MIN&&
               gain>=p.armingGainPremiumPoints&&
               x.bid<peak-p.givebackAlertPremiumPoints){
              seenGap=true;
            }
            if(!seenGiveback&&gain>=p.armingGainPremiumPoints&&
               gain<p.targetAlertPremiumPoints&&
               x.bid<=peak-p.givebackAlertPremiumPoints)
              seenGiveback=true;
            if(x.bid>peak){
              peak=x.bid;peakSession=next;
              if(peak-entry.ask>=p.armingGainPremiumPoints){
                // A missing possible trading weekday between this armed
                // peak and the next listed date is not evidence of a safe
                // overnight gap (or a single-session next-open mark).
                if(unresolvedArmedFollowingSession(next,c.expiry))
                  unresolvedArmedCalendar=true;
                const following=nextDeclaredSession(next);
                if(following&&following<=c.expiry)
                  newArmedPeakNextOpens.add(following);
              }
            }
          }
          if(seenGiveback){giveback++;cell.entryClaimedPairsWithUnderTargetQuotedGiveback++;}
          if(seenGap){gap++;cell.entryClaimedPairsWithFirstNextOpenQuotedGapThroughTrail++;}
          if(unresolvedArmedCalendar){
            unresolvedOvernightTransitions++;
            cell.entryClaimedPairsWithUnresolvedOvernightCalendarTransition++;
          }
          // First bounded opening book is a receipt-ordered state, NOT the
          // first conveniently tradable BID after a zero/sublot snapshot.
          // Later liquidity recovery does not erase opening blackout risk.
          let missingBoundedOpen=false,firstOpenIlliquid=false;
          for(const day of newArmedPeakNextOpens){
            const first=firstBoundedOpen.get(day);
            const illiquid=!!first&&
              (first.bid<=0||
               first.bidQty<p.minBestBidAndAskDepthLots*c.lotSize);
            if(illiquid)firstOpenIlliquid=true;
            if(!first||illiquid)missingBoundedOpen=true;
          }
          if(missingBoundedOpen){
            missingNextOpen++;
            cell.entryClaimedPairsMissingBoundedNextOpenAfterNewArmedPeak++;
          }
          if(firstOpenIlliquid){
            firstOpenIlliquidPairs++;
            cell.entryClaimedPairsWithFirstBoundedNextOpenIlliquidBid++;
          }
        }
      }
      // Count every ORIGINAL listed alternative, including NO_ENTRY,
      // against operator-declared sessions, using immutable contract
      // closing-state index. An absent/zero/sublot closing BID is censored.
      // Missing entire unlisted weekdays remain an EXTERNAL calendar blocker.
      const start=lowerDay(sessionDates,d.sessionDate),
        end=upperDay(sessionDates,c.expiry),
        good=validClosingDates(c.instrumentKey,c.lotSize);
      let missed=end-start-
        (upperDay(good,c.expiry)-lowerDay(good,d.sessionDate));
      // No later session can silently extend the original expiry region.
      const latestDeclared=end>start?sessionDates[end-1]:undefined;
      // The original session list can omit intermediate WEEKDAYS and even
      // the final weekday before option expiry. Simply checking the closes
      // of DECLARED sessions cannot detect either omission. Calendar
      // holidays remain possible; mark these as candidate gaps, not proven
      // exchange-open days, pending independent official holiday evidence.
      const expectedWeekdays=candidateWeekdaysInclusive(
        d.sessionDate,c.expiry);
      const includedWeekdays=upperDay(weekdaySessionDates,c.expiry)-
        lowerDay(weekdaySessionDates,d.sessionDate);
      const undeclared=Math.max(0,expectedWeekdays-includedWeekdays);
      if(undeclared>0){
        weekdayGapPairs++;
        weekdayGapObservations+=undeclared;
        cell.originalPairsWithPotentialUndeclaredWeekdays++;
        cell.potentialUndeclaredWeekdayObservations+=undeclared;
      }
      if(!latestDeclared||
         (Date.parse(c.expiry+'T00:00:00Z')-
          Date.parse(latestDeclared+'T00:00:00Z'))/86400000>4)missed++;
      if(missed){censored++;cell.originalPairsCensoredByMissingSessionCloseBid++;
        missingCloses+=missed;
        cell.missingDeclaredSessionCloseBidObservations+=missed;}
    }
    if(HORIZONS.some(h=>!originalHorizonSides.has(h+'-CE')||
       !originalHorizonSides.has(h+'-PE')))
      return fail('PHASE79_ORIGINAL_DECISION_MISSING_HORIZON_OR_SIDE',
        'INCOMPLETE_EVIDENCE');
  }
  // CSV rows not in the original frozen universe must not be quietly
  // treated as if they were this decision catalog's complete source.
  // Expired option tokens also must not be recycled into another contract.
  for(const [instrument,observations] of quotes){
    const expected=contractIdentities.get(instrument);
    if(!expected)
      return fail('PHASE82_NATIVE_L1_ROW_OUTSIDE_FROZEN_LISTED_CONTRACT_UNIVERSE',
        'INCOMPLETE_EVIDENCE');
    if(observations.some(q=>istDay(q.event)>expected.expiry))
      return fail('PHASE82_NATIVE_L1_QUOTE_AFTER_DECLARED_OPTION_EXPIRY',
        'INCOMPLETE_EVIDENCE');
  }
  if(total!==pins.expectedOriginallyListedPairs||
    noEntries!==pins.expectedOriginallyNoEntryPairs||
    noEntryDecisions!==pins.expectedOriginalNoEntryDecisions||
    decisionDates.size!==pins.expectedOriginalDecisionDates||
    HORIZONS.some(h=>![...groups.values()].some(c=>c.horizon===h))||
    entries<1)
    return fail('PHASE79_FROZEN_ALL_LISTED_NO_ENTRY_DENOMINATOR_CHANGED',
      'INCOMPLETE_EVIDENCE');
  const reasons=['ORIGINAL_LISTED_OPTION_DENOMINATOR_PRESERVED',
    'NO_ENTRY_OPTIONS_NOT_PURCHASED',
    'RAW_VENDOR_AVAILABLE_AT_NOT_AUTHENTICATED_CLIENT_RECEIPT',
    'DISPLAYED_QUOTED_BID_IS_NOT_AN_EXECUTABLE_EXIT_OR_STOP_FILL'];
  if(missingAsk>0)reasons.push('ORIGINAL_ENTRY_CLAIMED_PAIRS_LACK_CAUSAL_QUOTED_ASK');
  if(unmarketableEntryBids>0)
    reasons.push('ENTRY_ASK_WITH_NO_SAME_SNAPSHOT_MARKETABLE_BID_EXIT_LIQUIDITY');
  if(wideDecisionSpreads>0)
    reasons.push('ENTRY_QUOTED_BID_ASK_SPREAD_AT_LEAST_FROZEN_ARMING_GAIN');
  if(illiquidBidPairs>0)reasons.push('POST_DECISION_NO_BID_OR_SUBLOT_DEPTH_CENSORS_EXIT_LIQUIDITY');
  if(staleQuoteObservations>0)reasons.push('OUT_OF_ORDER_LATE_STALE_QUOTE_EVENTS_EXCLUDED_FROM_PREMIUM_PATH');
  if(censored>0)reasons.push('MISSING_DECLARED_SESSION_CLOSE_BID_CENSORS_HOLDING_PATH');
  if(weekdayGapPairs>0)
    reasons.push('POTENTIAL_UNDECLARED_WEEKDAY_REQUIRES_OFFICIAL_HOLIDAY_CALENDAR');
  if(unresolvedOvernightTransitions>0)
    reasons.push('ARMED_OVERNIGHT_NEXT_OPEN_UNRESOLVED_BY_POTENTIAL_MISSING_SESSION');
  if(missingNextOpen>0)reasons.push('MISSING_FIRST_BOUNDED_NEXT_OPEN_BID_CENSORS_OVERNIGHT_GAP_INFERENCE');
  if(firstOpenIlliquidPairs>0)
    reasons.push('FIRST_CAUSALLY_OBSERVED_NEXT_OPEN_BID_ZERO_OR_SUBLOT_DEPTH');
  if(input.datasetKind==='SYNTHETIC_FIXTURE')reasons.push('SYNTHETIC_FIXTURE_NOT_REAL_MARKET_TAPE');
  return {...blank(),status:missingAsk||censored||missingNextOpen||
      weekdayGapPairs||unresolvedOvernightTransitions||firstOpenIlliquidPairs||
      unmarketableEntryBids||wideDecisionSpreads||
      illiquidBidPairs||staleQuoteObservations?
      'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING':
      'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED',
    reasonCodes:reasons,syntheticDataset:input.datasetKind==='SYNTHETIC_FIXTURE',
    originalDecisionDates:decisionDates.size,originalNoEntryDecisions:noEntryDecisions,
    originallyListedPairs:total,originallyNoEntryPairs:noEntries,
    originalEntryClaimedPairs:entries,parsedNativeQuoteRows:raw.length-1,
    claimedAsOfEntryAskPairs:asOf,entryPairsMissingClaimedAsOfAsk:missingAsk,
    entryPairsWithUnmarketableDecisionBid:unmarketableEntryBids,
    entryPairsWithDecisionSpreadAtLeastArmingGain:wideDecisionSpreads,
    entryPairsWithObservedIlliquidBidUpdate:illiquidBidPairs,
    entryCandidateStaleLateQuoteObservationsIgnored:staleQuoteObservations,
    quotedUnderTargetPremiumGivebackPairs:giveback,
    quotedNextOpenGapThroughTrailPairs:gap,
    entryPairsWithUnresolvedOvernightCalendarTransition:unresolvedOvernightTransitions,
    entryPairsWithFirstBoundedNextOpenIlliquidBid:firstOpenIlliquidPairs,
    entryPairsMissingBoundedNextOpenAfterNewArmedPeak:missingNextOpen,
    listedPairsWithMissingDeclaredSessionCloseBid:censored,
    missingDeclaredSessionCloseBidObservations:missingCloses,
    originalPairsWithPotentialUndeclaredWeekdays:weekdayGapPairs,
    potentialUndeclaredWeekdayObservations:weekdayGapObservations,
    cells:[...groups.values()].sort((a,b)=>
      JSON.stringify([a.claimedRegime,a.horizon,a.side])
        .localeCompare(JSON.stringify([b.claimedRegime,b.horizon,b.side])))
  };
}
