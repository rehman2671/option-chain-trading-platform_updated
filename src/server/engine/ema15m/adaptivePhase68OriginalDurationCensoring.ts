/**
 * Phase68: original multiweek long-option premium path CENSORING review.
 *
 * Phase66/67 confirm source/declared-issuer consistency only. An original
 * one-day/next-open quote sample must NEVER become 1W/2W/4W/8W maturity
 * evidence, executable stop proof, or an optimal expiry recommendation.
 *
 * Every originally listed option (including alternatives on NO_ENTRY days)
 * stays in the denominator. Only original decision-time ENTRY_CLAIMED dates
 * yield descriptive hypothetical ASK-to-BID marks, NOT executed trades.
 * Any alert thresholds here are OPTION PREMIUM points, NEVER underlying
 * NIFTY index points or a broker stop/limit instruction.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase67IssuerCalendarCrosscheck,
  type Phase67Input,type Phase67IndependentPins,type Phase67Report,
  type Phase67IssuerClaimedMaster,type Phase67IssuerClaimedCalendar
} from './adaptivePhase67IssuerCalendarCrosscheck.js';
import {
  type Phase66OriginalCatalog
} from './adaptivePhase66StandaloneVendorPreflight.js';
import {parseOriginalNativeL1Csv}
  from './adaptiveNativeL1CsvBridge.js';

const SHA=/^[a-f0-9]{64}$/;
const IST=330*60000, MIN=60000;
type H='1W'|'2W'|'4W'|'8W';
type Side='CE'|'PE';
type Regime='TREND'|'RANGE'|'VOLATILE'|'MIXED'|'UNCLASSIFIED';
const hash=(v:unknown)=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
export const hashPhase68Evidence=hash;
const t=(s:unknown)=>typeof s==='string'?Date.parse(s):NaN;
const d=(s:string)=>Date.parse(s+'T00:00:00Z');
const bucket=(days:number):H|null=>
  days>=1&&days<8?'1W':days>=8&&days<18?'2W':
  days>=18&&days<36?'4W':days>=36&&days<=80?'8W':null;
const num=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
function decode(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||!s.length||
    s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>16&&b.length<=max&&b.toString('base64')===s?b:null;
  }catch{return null;}
}
function parse<T>(buf:Buffer):T|null{
  try{
    const v=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(buf));
    return v&&typeof v==='object'&&!Array.isArray(v)?v as T:null;
  }catch{return null;}
}
type Quote={
  instrument:string;event:number;arrival:number;
  bid:number;ask:number;bidQty:number;askQty:number
};
export interface Phase68Policy{
  schemaVersion:'ADAPTIVE_PHASE68_PREDECLARED_PREMIUM_CENSORING_V1';
  source:'OWNER_PREREGISTERED_QUOTE_RESEARCH_UNVERIFIED';
  maxEntryAskOriginalArrivalLagMinutes:number;
  maxLastBidMarkAgeBeforeCloseMinutes:number;
  firstNextOpenWindowMinutes:number;
  minimumOriginalBidObservationsPerDeclaredSession:number;
  minimumBidDepthLotsForMarks:number;
  /** A descriptive alert in option PREMIUM points, NOT NIFTY index points. */
  premiumRunupAlertPoints:number;
  /** A descriptive alert in option PREMIUM points, NOT a stop-loss. */
  premiumGivebackAlertPoints:number;
  /** A descriptive gap in option PREMIUM points, NOT a fill. */
  overnightBidGapAlertPoints:number;
}
export interface Phase68Input{
  schemaVersion:'ADAPTIVE_PHASE68_OOS_MULTI_WEEK_OPTION_PREMIUM_CENSORSHIP_V1';
  source:'OFFLINE_ORIGINAL_L1_QUOTE_MARKS_UNVERIFIED';
  phase67:Phase67Input;
  phase67Pins:Phase67IndependentPins;
  policy:Phase68Policy;
}
export interface Phase68IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE68_ORIGINAL_DURATION_RISK_PINS_V1';
  expectedPhase67InputSha256:string;
  expectedPhase67PinsSha256:string;
  expectedCoverageAndPremiumAlertPolicySha256:string;
  expectedOriginalOosDecisions:number;
  expectedOriginallyListedCePePairs:number;
  expectedOriginalNoEntryDays:number;
  expectedOriginalEntryClaimedDays:number;
}
export interface Phase68Cell{
  claimedRegime:Regime;
  horizon:H;
  optionType:Side;
  originalListedPairs:number;
  originalNoEntryPairs:number;
  originalEntryClaimedPairs:number;
  originalClaimedEntryAskMarkPairs:number;
  missingOriginalEntryAskMarkPairs:number;
  declaredSessionBidPathCompletePairs:number;
  censoredBeforeDeclaredLastTradableSessionPairs:number;
  missingDeclaredTradingSessionBidMarks:number;
  nextOpenAdverseBidGapAlertPairs:number;
  premiumRunupThenGivebackAlertPairs:number;
  longOptionCanLoseEntirePaidPremium:true;
  originalIndex100PointObjectiveUnobservableWithoutUnderlyingIndexTape:true;
  originalQuoteIsNotAnExecutableBrokerFill:true;
}
export interface Phase68Report{
  mode:'OFFLINE_ORIGINAL_OOS_FULL_DURATION_CENSORING_AND_PREMIUM_REVERSAL';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_MULTIWEEK_MARKS_CENSORED_ONLY'|
    'DESCRIPTIVE_DECLARED_SESSION_MARKS_PRESENT_BUT_UNVERIFIED';
  reasonCodes:string[];
  phase67Status:Phase67Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisionDays:number;
  originalOosNoEntryDays:number;
  originalOosEntryClaimedDays:number;
  originalListedCePePairs:number;
  originalLongOptionCandidatePairsWithCensoredHoldingEvidence:number;
  originalPairsWithEveryDeclaredSessionBidMark:number;
  originalClaimedEntryAskMarks:number;
  originalNoEntryPairsPreserved:number;
  originalClaimedEntryPairsWithoutEntryAsk:number;
  claimedEntryPairsWithFirstNextOpenGapAlert:number;
  claimedEntryPairsWithPremiumRunupThenGivebackAlert:number;
  missingDeclaredSessionQuoteMarks:number;
  declaredIssuerCalendarSessionCoverageIsNotIndependentlyComplete:true;
  originalNoEntryNeverSimulatedAsBrokerTrade:true;
  underlyingIndex100PointTargetNotTestableFromOptionL1Alone:true;
  sourceAskAndBidMarksAreNotExecutedFills:true;
  independentlyTrustedHistoricalSourceReceiptClock:false;
  exchangeOrVendorLicensedHistoricalFeedAuthenticated:false;
  officialExchangeExpiryLotAndCalendarVerified:false;
  actualMultiweekPositionExitProven:false;
  independentMultiMarketRegimeProfitabilityEstablished:false;
  realOptionIvThetaAndSlippageCalibrated:false;
  fullPaidDebitLossProtectionProven:false;
  brokerNativeOvernightNrmlGttStopAckVerified:false;
  optimalOneToEightWeekContractRecommendationAuthorized:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  cells:Phase68Cell[];
  externalEvidenceRequired:string[];
}
const REQUIRED=[
  'LICENSED_ORIGINAL_HISTORICAL_OPTION_BID_ASK_DEPTH_THROUGH_ENTIRE_1W_2W_4W_8W_HOLD',
  'OFFICIALLY_VERIFIED_COMPLETE_EXCHANGE_TRADING_SESSION_AND_EXPIRY_CALENDAR',
  'TRUSTED_CONTEMPORANEOUS_STRATEGY_SOURCE_AVAILABLE_AT_NOT_ARCHIVE_DOWNLOAD',
  'REAL_PREDECLARED_POSITION_ENTRY_PARTIAL_PROFIT_TRAIL_AND_EXIT_POLICY',
  'IV_THETA_SPREAD_SLIPPAGE_MARKET_GAPS_AND_FULL_PREMIUM_DEBIT_STRESS',
  'UNTOUCHED_REAL_MULTIREGIME_OOS_AND_INDEPENDENT_REGIME_CLASSIFICATION',
  'BROKER_NATIVE_NRML_STOP_GTT_CHILD_EXCHANGE_ACK_AND_OVERNIGHT_GAP_NONFILL'
];
function empty():Phase68Report{
  return {
    mode:'OFFLINE_ORIGINAL_OOS_FULL_DURATION_CENSORING_AND_PREMIUM_REVERSAL',
    status:'INVALID_EVIDENCE',reasonCodes:[],
    phase67Status:null,syntheticDataset:null,
    originalOosDecisionDays:0,originalOosNoEntryDays:0,
    originalOosEntryClaimedDays:0,originalListedCePePairs:0,
    originalLongOptionCandidatePairsWithCensoredHoldingEvidence:0,
    originalPairsWithEveryDeclaredSessionBidMark:0,
    originalClaimedEntryAskMarks:0,originalNoEntryPairsPreserved:0,
    originalClaimedEntryPairsWithoutEntryAsk:0,
    claimedEntryPairsWithFirstNextOpenGapAlert:0,
    claimedEntryPairsWithPremiumRunupThenGivebackAlert:0,
    missingDeclaredSessionQuoteMarks:0,
    declaredIssuerCalendarSessionCoverageIsNotIndependentlyComplete:true,
    originalNoEntryNeverSimulatedAsBrokerTrade:true,
    underlyingIndex100PointTargetNotTestableFromOptionL1Alone:true,
    sourceAskAndBidMarksAreNotExecutedFills:true,
    independentlyTrustedHistoricalSourceReceiptClock:false,
    exchangeOrVendorLicensedHistoricalFeedAuthenticated:false,
    officialExchangeExpiryLotAndCalendarVerified:false,
    actualMultiweekPositionExitProven:false,
    independentMultiMarketRegimeProfitabilityEstablished:false,
    realOptionIvThetaAndSlippageCalibrated:false,
    fullPaidDebitLossProtectionProven:false,
    brokerNativeOvernightNrmlGttStopAckVerified:false,
    optimalOneToEightWeekContractRecommendationAuthorized:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    cells:[],externalEvidenceRequired:REQUIRED
  };
}
const fail=(reason:string,status:Phase68Report['status']='INVALID_EVIDENCE',
  fields?:Partial<Phase68Report>):Phase68Report=>({
  ...empty(),...fields,status,reasonCodes:[reason]
});
function validPolicy(p:Phase68Policy):boolean{
  return !!p&&p.schemaVersion===
      'ADAPTIVE_PHASE68_PREDECLARED_PREMIUM_CENSORING_V1'&&
    p.source==='OWNER_PREREGISTERED_QUOTE_RESEARCH_UNVERIFIED'&&
    integer(p.maxEntryAskOriginalArrivalLagMinutes,1,60)&&
    integer(p.maxLastBidMarkAgeBeforeCloseMinutes,1,60)&&
    integer(p.firstNextOpenWindowMinutes,1,120)&&
    integer(p.minimumOriginalBidObservationsPerDeclaredSession,1,1000)&&
    integer(p.minimumBidDepthLotsForMarks,1,100)&&
    num(p.premiumRunupAlertPoints,1,100000)&&
    num(p.premiumGivebackAlertPoints,1,100000)&&
    num(p.overnightBidGapAlertPoints,0.01,100000);
}
const groupKey=(r:Regime,h:H,s:Side)=>[r,h,s].join('|');
export function auditPhase68OriginalDurationCensoring(
  input:Phase68Input,pins:Phase68IndependentPins
):Phase68Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE68_OOS_MULTI_WEEK_OPTION_PREMIUM_CENSORSHIP_V1'||
    input.source!=='OFFLINE_ORIGINAL_L1_QUOTE_MARKS_UNVERIFIED'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE68_ORIGINAL_DURATION_RISK_PINS_V1'||
    !input.phase67||!input.phase67Pins||!validPolicy(input.policy)||
    ![pins.expectedPhase67InputSha256,
      pins.expectedPhase67PinsSha256,
      pins.expectedCoverageAndPremiumAlertPolicySha256].every(x=>
      typeof x==='string'&&SHA.test(x))||
    hash(input.phase67)!==pins.expectedPhase67InputSha256||
    hash(input.phase67Pins)!==pins.expectedPhase67PinsSha256||
    hash(input.policy)!==
      pins.expectedCoverageAndPremiumAlertPolicySha256||
    !integer(pins.expectedOriginalOosDecisions,2,100000)||
    !integer(pins.expectedOriginallyListedCePePairs,8,2000000)||
    !integer(pins.expectedOriginalNoEntryDays,0,100000)||
    !integer(pins.expectedOriginalEntryClaimedDays,0,100000)||
    pins.expectedOriginalNoEntryDays+
      pins.expectedOriginalEntryClaimedDays!==
      pins.expectedOriginalOosDecisions)
    return fail('PHASE68_ORIGINAL_QUOTE_UNIVERSE_OR_ALERT_POLICY_PINS_INVALID');
  let prior:Phase67Report;
  try{prior=auditPhase67IssuerCalendarCrosscheck(
    input.phase67,input.phase67Pins);}
  catch{return fail('PHASE67_ORIGINAL_ISSUER_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const parent:Partial<Phase68Report>={
    phase67Status:prior.status,syntheticDataset:prior.syntheticDataset
  };
  if(!prior.status.startsWith('DESCRIPTIVE_')||
    prior.originalOosDecisions!==pins.expectedOriginalOosDecisions||
    prior.originalAllListedCePeContractPairs!==
      pins.expectedOriginallyListedCePePairs)
    return fail('PHASE67_FULL_ORIGINAL_SOURCE_NOT_READY',
      'INCOMPLETE_EVIDENCE',parent);
  const vendor=input.phase67.originalVendor;
  const catalogBytes=decode(vendor.newVendorFullListedCatalogBase64,25_000_000),
    csv=decode(vendor.newVendorNativeL1CsvBase64,50_000_000),
    issuerMaster=decode(input.phase67.candidateIssuerMasterBase64,25_000_000),
    issuerCalendar=decode(input.phase67.candidateIssuerCalendarBase64,10_000_000);
  if(!catalogBytes||!csv||!issuerMaster||!issuerCalendar)
    return fail('PHASE68_ORIGINAL_CATALOG_QUOTE_AND_ISSUER_DATA_ABSENT',
      'INCOMPLETE_EVIDENCE',parent);
  const cat=parse<Phase66OriginalCatalog>(catalogBytes),
    master=parse<Phase67IssuerClaimedMaster>(issuerMaster),
    cal=parse<Phase67IssuerClaimedCalendar>(issuerCalendar),
    raw=parseOriginalNativeL1Csv(csv);
  if(!cat||!master||!cal||!raw||
    !Array.isArray(cat.decisions)||
    !Array.isArray(master.snapshots)||
    !Array.isArray(cal.sessions))
    return fail('PHASE68_ORIGINAL_CATALOG_MARKET_SOURCE_UNREADABLE',
      'INCOMPLETE_EVIDENCE',parent);
  const listings=new Map<string,{
    lastSession:string;expiry:string;lotSize:number
  }>();
  for(const snap of master.snapshots)
    for(const c of snap.optionContracts)
      listings.set(c.instrumentKey,{
        lastSession:c.claimedLastTradingSessionDate,
        expiry:c.expiry,lotSize:c.lotSize
      });
  const byInstrument=new Map<string,Quote[]>();
  for(const row of raw.slice(1)){
    const q:Quote={
      instrument:row[2],event:t(row[3]),arrival:t(row[4]),
      bid:Number(row[5]),ask:Number(row[6]),
      bidQty:Number(row[7]),askQty:Number(row[8])
    };
    const a=byInstrument.get(q.instrument)??[];
    a.push(q);byInstrument.set(q.instrument,a);
  }
  // Phase66/67 already validate original source sequence/clock and quote
  // trading-session boundaries. Preserve claimed availability of each mark.
  const cellMap=new Map<string,Phase68Cell>();
  let originalPairs=0,noEntry=0,claimedEntry=0,
    noEntryPairs=0,marks=0,missingEntry=0,censored=0,
    complete=0,gaps=0,reversals=0,missingSessions=0;
  const sessionOrder=cal.sessions.map(s=>s.sessionDate);
  for(const dec of cat.decisions){
    if(dec.originalEntryDisposition==='NO_ENTRY')noEntry++;
    else claimedEntry++;
    for(const c of dec.originallyListedContracts){
      originalPairs++;
      const h=bucket(
        (d(c.expiry)+10*3600000-t(dec.decisionAt))/86400000);
      const side=c.optionType;
      if(!h||!['CE','PE'].includes(side))
        return fail('PHASE68_ORIGINAL_OPTION_LISTING_HORIZON_INVALID',
          'INCOMPLETE_EVIDENCE',parent);
      const regime=dec.claimedRegime;
      const key=groupKey(regime,h,side);
      let cell=cellMap.get(key);
      if(!cell){
        cell={
          claimedRegime:regime,horizon:h,optionType:side,
          originalListedPairs:0,originalNoEntryPairs:0,
          originalEntryClaimedPairs:0,
          originalClaimedEntryAskMarkPairs:0,
          missingOriginalEntryAskMarkPairs:0,
          declaredSessionBidPathCompletePairs:0,
          censoredBeforeDeclaredLastTradableSessionPairs:0,
          missingDeclaredTradingSessionBidMarks:0,
          nextOpenAdverseBidGapAlertPairs:0,
          premiumRunupThenGivebackAlertPairs:0,
          longOptionCanLoseEntirePaidPremium:true,
          originalIndex100PointObjectiveUnobservableWithoutUnderlyingIndexTape:true,
          originalQuoteIsNotAnExecutableBrokerFill:true
        };cellMap.set(key,cell);
      }
      cell.originalListedPairs++;
      const listed=listings.get(c.instrumentKey);
      if(!listed||listed.expiry!==c.expiry||
        listed.lotSize!==c.lotSize)
        return fail('PHASE68_CLAIMED_EXPIRY_SOURCE_CHANGED_AFTER_AUDIT',
          'INCOMPLETE_EVIDENCE',parent);
      const quoteRows=byInstrument.get(c.instrumentKey)??[];
      const requiredSessions=sessionOrder.filter(date=>
        date>=dec.sessionDate&&date<=listed.lastSession);
      if(!requiredSessions.length||
        requiredSessions.at(-1)!==listed.lastSession)
        return fail('PHASE68_LAST_TRADABLE_SESSION_NOT_IN_CALENDAR',
          'INCOMPLETE_EVIDENCE',parent);
      let missing=0;
      const validBySession=new Map<string,Quote[]>();
      for(const sessionDate of requiredSessions){
        const session=cal.sessions.find(s=>s.sessionDate===sessionDate)!;
        const start=t(session.openAt),end=t(session.closeAt);
        const bids=quoteRows.filter(q=>
          q.event>=start&&q.event<=end&&q.arrival<=end&&
          q.bidQty>=c.lotSize*input.policy.minimumBidDepthLotsForMarks&&
          end-q.arrival<=input.policy.maxLastBidMarkAgeBeforeCloseMinutes*MIN);
        // A historical closing mark must be recent at that session's
        // close; one early morning BID does not certify an expiry exit.
        if(bids.length<
          input.policy.minimumOriginalBidObservationsPerDeclaredSession)
          missing++;
        validBySession.set(sessionDate,bids);
      }
      cell.missingDeclaredTradingSessionBidMarks+=missing;
      missingSessions+=missing;
      if(missing>0){
        censored++;
        cell.censoredBeforeDeclaredLastTradableSessionPairs++;
      }else{
        complete++;
        cell.declaredSessionBidPathCompletePairs++;
      }
      if(dec.originalEntryDisposition==='NO_ENTRY'){
        noEntry++; // placeholder overwritten via explicit day counter below
        noEntry--; // preserve independent NO_ENTRY day count, not pairs
        noEntryPairs++;cell.originalNoEntryPairs++;continue;
      }
      cell.originalEntryClaimedPairs++;
      const decisionTime=t(dec.decisionAt);
      const entry=quoteRows.find(q=>
        q.event>=decisionTime&&q.arrival>=q.event&&
        q.arrival<=decisionTime+
          input.policy.maxEntryAskOriginalArrivalLagMinutes*MIN&&
        q.askQty>=c.lotSize*
          input.policy.minimumBidDepthLotsForMarks);
      if(!entry){
        missingEntry++;cell.missingOriginalEntryAskMarkPairs++;continue;
      }
      marks++;cell.originalClaimedEntryAskMarkPairs++;
      const nextSession=cal.sessions.find(s=>s.sessionDate>dec.sessionDate);
      if(nextSession){
        const nextStart=t(nextSession.openAt),nextEnd=nextStart+
          input.policy.firstNextOpenWindowMinutes*MIN;
        const previous=quoteRows.filter(q=>
          q.event>=decisionTime&&
          q.event<=t(cal.sessions.find(s=>
            s.sessionDate===dec.sessionDate)!.closeAt)&&
          q.arrival<=t(cal.sessions.find(s=>
            s.sessionDate===dec.sessionDate)!.closeAt)&&
          q.bidQty>=c.lotSize);
        const opening=quoteRows.find(q=>
          q.event>=nextStart&&q.event<=nextEnd&&
          q.arrival<=nextEnd&&q.bidQty>=c.lotSize);
        if(opening&&previous.length){
          const lastBid=previous.at(-1)!.bid;
          if(lastBid-opening.bid>=
              input.policy.overnightBidGapAlertPoints){
            gaps++;cell.nextOpenAdverseBidGapAlertPairs++;
          }
        }
      }
      // Original option-premium path in BID marks only. The hypothetical
      // entry ASK is an observed quote, never an executable ask fill.
      let peak=entry.ask,peakObserved=false,reversed=false;
      for(const q of quoteRows){
        if(q.arrival<entry.arrival||q.event<entry.event||
          q.event>t(cal.sessions.find(s=>
            s.sessionDate===listed.lastSession)!.closeAt)||
          q.bidQty<c.lotSize)
          continue;
        if(q.bid>peak){peak=q.bid;}
        if(peak-entry.ask>=input.policy.premiumRunupAlertPoints)
          peakObserved=true;
        if(peakObserved&&peak-q.bid>=
            input.policy.premiumGivebackAlertPoints)
          reversed=true;
      }
      if(reversed){
        reversals++;cell.premiumRunupThenGivebackAlertPairs++;
      }
    }
  }
  const out=[...cellMap.values()];
  const fields:Partial<Phase68Report>={
    ...parent,originalOosDecisionDays:cat.decisions.length,
    originalOosNoEntryDays:cat.decisions.filter(d=>
      d.originalEntryDisposition==='NO_ENTRY').length,
    originalOosEntryClaimedDays:cat.decisions.filter(d=>
      d.originalEntryDisposition==='ENTRY_CLAIMED').length,
    originalListedCePePairs:originalPairs,
    originalLongOptionCandidatePairsWithCensoredHoldingEvidence:censored,
    originalPairsWithEveryDeclaredSessionBidMark:complete,
    originalClaimedEntryAskMarks:marks,
    originalNoEntryPairsPreserved:noEntryPairs,
    originalClaimedEntryPairsWithoutEntryAsk:missingEntry,
    claimedEntryPairsWithFirstNextOpenGapAlert:gaps,
    claimedEntryPairsWithPremiumRunupThenGivebackAlert:reversals,
    missingDeclaredSessionQuoteMarks:missingSessions,
    cells:out
  };
  if(cat.decisions.length!==pins.expectedOriginalOosDecisions||
    originalPairs!==pins.expectedOriginallyListedCePePairs||
    fields.originalOosNoEntryDays!==pins.expectedOriginalNoEntryDays||
    fields.originalOosEntryClaimedDays!==pins.expectedOriginalEntryClaimedDays||
    out.reduce((x,r)=>x+r.originalListedPairs,0)!==originalPairs||
    noEntryPairs+marks+missingEntry!==originalPairs)
    return fail('PHASE68_FROZEN_ORIGINAL_DECISION_OR_NO_ENTRY_DENOMINATOR_DISAGREES',
      'INCOMPLETE_EVIDENCE',fields);
  return {...empty(),...fields,
    status:censored>0?
      'DESCRIPTIVE_MULTIWEEK_MARKS_CENSORED_ONLY':
      'DESCRIPTIVE_DECLARED_SESSION_MARKS_PRESENT_BUT_UNVERIFIED',
    reasonCodes:censored>0?[
      'AT_LEAST_ONE_DECLARED_EXPIRY_SESSION_LACKS_ORIGINAL_ASOF_OPTION_BID',
      'NEXT_OPEN_QUOTES_DO_NOT_PROVE_1W_TO_8W_HOLDING_EXITS',
      'MARKET_ISSUER_LICENCE_RECEIPT_CLOCK_AND_ACTUAL_BROKER_FILL_UNVERIFIED'
    ]:[
      'ALL_DECLARED_SESSION_MARKS_EXIST_BUT_CALENDAR_AND_SOURCE_UNVERIFIED',
      'SOURCE_BID_MARKS_NOT_EXECUTED_OPTION_POSITION_EXITS'
    ]};
}
