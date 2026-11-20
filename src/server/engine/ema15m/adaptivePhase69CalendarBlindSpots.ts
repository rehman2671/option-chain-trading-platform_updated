/**
 * Phase69 — original full-duration candidate weekdays vs DECLARED market
 * sessions, and option BID marks per original OOS listed contract.
 *
 * Phase68 can report all "declared" session closes covered when both
 * vendor and claimed issuer silently OMIT entire historical sessions.
 * This audit highlights Monday-Friday CANDIDATE dates absent from the
 * operator's declared calendar. These are NOT verified exchange sessions:
 * holidays, special weekend sessions, emergency closures and contracts
 * suspended from trading require independent official publisher proof.
 *
 * No real feed, fills, market profitability, ranked contracts, native NRML
 * orders, stops, GTT or positional 15:15 square-off.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase68OriginalDurationCensoring,
  type Phase68Input,type Phase68IndependentPins,type Phase68Report
} from './adaptivePhase68OriginalDurationCensoring.js';
import type {Phase66OriginalCatalog}
  from './adaptivePhase66StandaloneVendorPreflight.js';
import type {Phase67IssuerClaimedCalendar,Phase67IssuerClaimedMaster}
  from './adaptivePhase67IssuerCalendarCrosscheck.js';
import {parseOriginalNativeL1Csv}
  from './adaptiveNativeL1CsvBridge.js';

const SHA=/^[0-9a-f]{64}$/;
const DAY=86400000,MIN=60000;
const HORIZONS=['1W','2W','4W','8W'] as const;
type Horizon=typeof HORIZONS[number];
type Side='CE'|'PE';
type Regime='TREND'|'RANGE'|'VOLATILE'|'MIXED'|'UNCLASSIFIED';
const hash=(v:unknown)=>createHash('sha256')
  .update(JSON.stringify(v)).digest('hex');
export const hashPhase69Evidence=hash;
const numeric=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const ts=(s:unknown)=>typeof s==='string'?Date.parse(s):NaN;
const day=(s:string)=>Date.parse(s+'T00:00:00Z');
const dateString=(t:number)=>new Date(t).toISOString().slice(0,10);
const horizon=(days:number):Horizon|null=>
  days>=1&&days<8?'1W':days>=8&&days<18?'2W':
  days>=18&&days<36?'4W':days>=36&&days<=80?'8W':null;
const weekday=(dateMs:number)=>{
  const w=new Date(dateMs).getUTCDay();
  return w>=1&&w<=5;
};
function decode(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||!s.length||s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>16&&b.length<=max&&b.toString('base64')===s?b:null;
  }catch{return null;}
}
function json<T>(b:Buffer):T|null{
  try{
    const x=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
    return x&&typeof x==='object'&&!Array.isArray(x)?x as T:null;
  }catch{return null;}
}
export interface Phase69Policy{
  schemaVersion:'ADAPTIVE_PHASE69_PREREGISTERED_WEEKDAY_BLIND_SPOT_AUDIT_V1';
  source:'OFFLINE_OWNER_DECLARED_WEEKDAY_PROBE_NOT_EXCHANGE_VERIFIED';
  potentialSessionRule:'MON_FRI_CANDIDATES_INCLUDE_PUBLIC_HOLIDAYS_NOT_OFFICIAL';
  minimumOriginalCloseBidMarksPerDeclaredSession:number;
  maximumCloseBidAgeMinutes:number;
  minimumDisplayedBidDepthLots:number;
  maxCalendarDaysPerOriginalOptionPath:number;
  /** A hard software quality alert, not an exchange-holiday determination. */
  maximumUnexplainedWeekdayCandidateGapsPerPair:number;
}
export interface Phase69Input{
  schemaVersion:'ADAPTIVE_PHASE69_FULL_DURATION_CALENDAR_BLIND_SPOTS_V1';
  source:'OFFLINE_ORIGINAL_VENDOR_AND_ISSUER_L1_UNVERIFIED';
  phase68:Phase68Input;
  phase68Pins:Phase68IndependentPins;
  policy:Phase69Policy;
}
export interface Phase69Pins{
  schemaVersion:'INDEPENDENT_PHASE69_WEEKDAY_ACQUISITION_GAP_PINS_V1';
  expectedPhase68InputSha256:string;
  expectedPhase68PinsSha256:string;
  expectedPrespecifiedGapPolicySha256:string;
  expectedOriginalOosDecisions:number;
  expectedOriginalNoEntryDecisions:number;
  expectedAllOosListedCePePairs:number;
}
export interface Phase69Cell{
  claimedRegime:Regime;
  horizon:Horizon;
  optionType:Side;
  originalListedPairs:number;
  originalNoEntryPairs:number;
  originalEntryClaimedPairs:number;
  potentialWeekdayCandidateSlots:number;
  declaredExchangeLikeWeekdaySlots:number;
  undeclaredPotentialWeekdayCandidateSlots:number;
  distinctUnexplainedWeekdayCandidates:number;
  originalDeclaredSessionCloseBidSlots:number;
  missingOrStaleDeclaredCloseBidSlots:number;
  originalsWithPotentialCalendarBlindSpots:number;
  originalsWithAnyMissingOriginalCloseBid:number;
  originalsWithUnverifiedFullDurationEvidence:number;
  premiumRunupGivebackObservedAsQuoteOnlyPairs:number;
  overnightBidGapObservedAsQuoteOnlyPairs:number;
  noEntryNeverBrokerPosition:true;
  potentialWeekdayNotProvenRealExchangeSession:true;
  closeBidNotActualTradeFill:true;
}
export interface Phase69Report{
  mode:'OFFLINE_HORIZON_WEEKDAY_CALENDAR_AND_ORIGINAL_BID_ACQUISITION_GAPS';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY'|
    'DESCRIPTIVE_DECLARED_CLOSE_BID_SOURCE_GAPS_ONLY'|
    'DESCRIPTIVE_NO_DETECTED_WEEKDAY_GAPS_BUT_SOURCE_UNVERIFIED';
  reasonCodes:string[];
  phase68Status:Phase68Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisionDays:number;
  originalOosNoEntryDays:number;
  originalOosListedCePeContractPairs:number;
  originalAllListedPairsWithCalendarBlindSpots:number;
  originalPairsWithMissingDeclaredCloseBidMarks:number;
  originalPairsWithoutVerifiedCompleteFullDurationEvidence:number;
  totalUnexplainedPotentialWeekdayContractSlots:number;
  distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar:number;
  longestConsecutiveUnexplainedWeekdayRun:number;
  totalMissingOrStaleDeclaredSessionBidMarkSlots:number;
  originalPremiumGivebackQuoteOnlyAlerts:number;
  originalOvernightGapQuoteOnlyAlerts:number;
  candidateWeekdaysMayIncludeExchangeHolidaysOrClosures:true;
  declaredCalendarMayOmitSpecialWeekendSessions:true;
  sourceCandidateCalendarCompletenessOfficiallyVerified:false;
  exchangeOrVendorHistoricOptionL1EntitlementVerified:false;
  originalClientHistoricalAvailableAtTrusted:false;
  historicalUnenteredOptionNotActualPosition:true;
  fullyObservedSourceBidMarksNotExecutableFills:true;
  genuinePositionPnLOrStatisticalMultiregimeEdgeProven:false;
  optimalOneToEightWeekContractRecommended:false;
  completeLongPremiumDebitLossProtectionProven:false;
  brokerNrmlGttNativeStopChildExchangeAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  cells:Phase69Cell[];
  externalEvidenceRequired:string[];
}
const REQUIRED=[
  'INDEPENDENT_OFFICIAL_EXCHANGE_HISTORICAL_HOLIDAYS_SPECIAL_SESSION_AND_FULL_LISTED_TRADING_CALENDAR',
  'FULL_LEGALLY_LICENSED_ORIGINAL_OPTION_BID_ASK_DEPTH_FOR_EVERY_DECLARED_AND_VERIFIED_SESSION',
  'ORIGINAL_SOURCE_EVENT_AND_ACTUAL_CONTEMPORANEOUS_STRATEGY_RECEIPT_TIMES_IF_RECORDED',
  'UNTOUCHED_REAL_MULTIREGIME_OOS_ENTRY_EXIT_AND_OPTION_IV_THETA_SPREAD_SLIPPAGE_GAP_CALIBRATION',
  'ENTIRE_OPTION_PREMIUM_DEBIT_LOSS_AND_BROKER_NATIVE_NRML_STOP_GTT_NONFILL_LIFECYCLE'
];
function empty():Phase69Report{
  return {
    mode:'OFFLINE_HORIZON_WEEKDAY_CALENDAR_AND_ORIGINAL_BID_ACQUISITION_GAPS',
    status:'INVALID_EVIDENCE',reasonCodes:[],
    phase68Status:null,syntheticDataset:null,
    originalOosDecisionDays:0,originalOosNoEntryDays:0,
    originalOosListedCePeContractPairs:0,
    originalAllListedPairsWithCalendarBlindSpots:0,
    originalPairsWithMissingDeclaredCloseBidMarks:0,
    originalPairsWithoutVerifiedCompleteFullDurationEvidence:0,
    totalUnexplainedPotentialWeekdayContractSlots:0,
    distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar:0,
    longestConsecutiveUnexplainedWeekdayRun:0,
    totalMissingOrStaleDeclaredSessionBidMarkSlots:0,
    originalPremiumGivebackQuoteOnlyAlerts:0,
    originalOvernightGapQuoteOnlyAlerts:0,
    candidateWeekdaysMayIncludeExchangeHolidaysOrClosures:true,
    declaredCalendarMayOmitSpecialWeekendSessions:true,
    sourceCandidateCalendarCompletenessOfficiallyVerified:false,
    exchangeOrVendorHistoricOptionL1EntitlementVerified:false,
    originalClientHistoricalAvailableAtTrusted:false,
    historicalUnenteredOptionNotActualPosition:true,
    fullyObservedSourceBidMarksNotExecutableFills:true,
    genuinePositionPnLOrStatisticalMultiregimeEdgeProven:false,
    optimalOneToEightWeekContractRecommended:false,
    completeLongPremiumDebitLossProtectionProven:false,
    brokerNrmlGttNativeStopChildExchangeAckVerified:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    cells:[],externalEvidenceRequired:REQUIRED
  };
}
const fail=(reason:string,status:Phase69Report['status']='INVALID_EVIDENCE',
  part?:Partial<Phase69Report>):Phase69Report=>({
  ...empty(),...part,status,reasonCodes:[reason]
});
function validPolicy(p:Phase69Policy):boolean{
  return !!p&&p.schemaVersion===
    'ADAPTIVE_PHASE69_PREREGISTERED_WEEKDAY_BLIND_SPOT_AUDIT_V1'&&
    p.source==='OFFLINE_OWNER_DECLARED_WEEKDAY_PROBE_NOT_EXCHANGE_VERIFIED'&&
    p.potentialSessionRule===
      'MON_FRI_CANDIDATES_INCLUDE_PUBLIC_HOLIDAYS_NOT_OFFICIAL'&&
    numeric(p.minimumOriginalCloseBidMarksPerDeclaredSession,1,100)&&
    numeric(p.maximumCloseBidAgeMinutes,1,120)&&
    numeric(p.minimumDisplayedBidDepthLots,1,100)&&
    numeric(p.maxCalendarDaysPerOriginalOptionPath,56,100)&&
    numeric(p.maximumUnexplainedWeekdayCandidateGapsPerPair,0,20);
}
type OriginalQuote={
  event:number;arrival:number;bid:number;bidQty:number
};
const key=(regime:Regime,h:H,side:Side)=>[regime,h,side].join('|');
export function auditPhase69CalendarBlindSpots(
  input:Phase69Input,pins:Phase69Pins
):Phase69Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE69_FULL_DURATION_CALENDAR_BLIND_SPOTS_V1'||
    input.source!=='OFFLINE_ORIGINAL_VENDOR_AND_ISSUER_L1_UNVERIFIED'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE69_WEEKDAY_ACQUISITION_GAP_PINS_V1'||
    !input.phase68||!input.phase68Pins||!validPolicy(input.policy)||
    ![pins.expectedPhase68InputSha256,
      pins.expectedPhase68PinsSha256,
      pins.expectedPrespecifiedGapPolicySha256].every(v=>
      typeof v==='string'&&SHA.test(v))||
    hash(input.phase68)!==pins.expectedPhase68InputSha256||
    hash(input.phase68Pins)!==pins.expectedPhase68PinsSha256||
    hash(input.policy)!==pins.expectedPrespecifiedGapPolicySha256||
    !numeric(pins.expectedOriginalOosDecisions,2,100000)||
    !numeric(pins.expectedOriginalNoEntryDecisions,0,100000)||
    !numeric(pins.expectedAllOosListedCePePairs,8,100000)||
    pins.expectedOriginalNoEntryDecisions>pins.expectedOriginalOosDecisions)
    return fail('PHASE69_FULL_OOS_SOURCE_OR_PRESPECIFIED_PINS_INVALID');
  let phase68:Phase68Report;
  try{
    phase68=auditPhase68OriginalDurationCensoring(
      input.phase68,input.phase68Pins);
  }catch{return fail('PHASE68_FULL_HOLD_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const partial:Partial<Phase69Report>={
    phase68Status:phase68.status,
    syntheticDataset:phase68.syntheticDataset
  };
  if(!phase68.status.startsWith('DESCRIPTIVE_')||
    phase68.originalOosDecisionDays!==pins.expectedOriginalOosDecisions||
    phase68.originalOosNoEntryDays!==
      pins.expectedOriginalNoEntryDecisions||
    phase68.originalListedCePePairs!==
      pins.expectedAllOosListedCePePairs)
    return fail('PHASE68_ORIGINAL_FULL_OOS_LISTED_SOURCE_CENSORING_NOT_READY',
      'INCOMPLETE_EVIDENCE',partial);
  const issuer=input.phase68.phase67,
    vendor=issuer.originalVendor;
  const catBytes=decode(vendor.newVendorFullListedCatalogBase64,25_000_000),
    csvBytes=decode(vendor.newVendorNativeL1CsvBase64,50_000_000),
    masterBytes=decode(issuer.candidateIssuerMasterBase64,25_000_000),
    calendarBytes=decode(issuer.candidateIssuerCalendarBase64,10_000_000);
  if(!catBytes||!csvBytes||!masterBytes||!calendarBytes)
    return fail('PHASE69_FULL_ORIGINAL_SOURCE_BYTES_MISSING',
      'INCOMPLETE_EVIDENCE',partial);
  const catalog=json<Phase66OriginalCatalog>(catBytes),
    master=json<Phase67IssuerClaimedMaster>(masterBytes),
    calendar=json<Phase67IssuerClaimedCalendar>(calendarBytes),
    quotes=parseOriginalNativeL1Csv(csvBytes);
  if(!catalog||!master||!calendar||!quotes||
    !Array.isArray(catalog.decisions)||
    !Array.isArray(master.snapshots)||
    !Array.isArray(calendar.sessions))
    return fail('PHASE69_FULL_ORIGINAL_CATALOG_NOT_READABLE',
      'INCOMPLETE_EVIDENCE',partial);
  const sourceQuotes=new Map<string,OriginalQuote[]>();
  for(const row of quotes.slice(1)){
    const item:OriginalQuote={
      event:ts(row[3]),arrival:ts(row[4]),
      bid:Number(row[5]),bidQty:Number(row[7])
    };
    const arr=sourceQuotes.get(row[2])??[];
    arr.push(item);sourceQuotes.set(row[2],arr);
  }
  const sessionMap=new Map(calendar.sessions.map(s=>[s.sessionDate,s]));
  const expiryMap=new Map<string,{last:string;lot:number;expiry:string}>();
  for(const snapshot of master.snapshots)
    for(const c of snapshot.optionContracts)
      expiryMap.set(c.instrumentKey,{
        last:c.claimedLastTradingSessionDate,lot:c.lotSize,
        expiry:c.expiry
      });
  const out=new Map<string,Phase69Cell>();
  const absentByCell=new Map<string,Set<string>>();
  const allMissingDates=new Set<string>();
  let paired=0,pairsWithCalendarGaps=0,pairsWithMissingBid=0,
    totalUnlistedSlots=0,missingBids=0,
    maxUnlistedRun=0;
  for(const decision of catalog.decisions){
    for(const original of decision.originallyListedContracts){
      paired++;
      const maturity=expiryMap.get(original.instrumentKey);
      const start=day(decision.sessionDate),
        last=maturity?day(maturity.last):NaN;
      const daysFromOriginalToExpiry=(last-start)/DAY;
      const h=horizon(
        (day(original.expiry)+10*3600000-ts(decision.decisionAt))/DAY);
      if(!maturity||!h||!Number.isFinite(start)||
        !Number.isFinite(last)||daysFromOriginalToExpiry<0||
        daysFromOriginalToExpiry>
          input.policy.maxCalendarDaysPerOriginalOptionPath||
        original.lotSize!==maturity.lot||
        original.expiry!==maturity.expiry)
        return fail('PHASE69_ORIGINAL_EXPIRY_CATALOG_PATH_TOO_LONG_OR_CHANGED',
          'INCOMPLETE_EVIDENCE',partial);
      const k=key(decision.claimedRegime,h,original.optionType);
      let cell=out.get(k);
      if(!cell){
        cell={
          claimedRegime:decision.claimedRegime,horizon:h,
          optionType:original.optionType,
          originalListedPairs:0,originalNoEntryPairs:0,
          originalEntryClaimedPairs:0,
          potentialWeekdayCandidateSlots:0,
          declaredExchangeLikeWeekdaySlots:0,
          undeclaredPotentialWeekdayCandidateSlots:0,
          distinctUnexplainedWeekdayCandidates:0,
          originalDeclaredSessionCloseBidSlots:0,
          missingOrStaleDeclaredCloseBidSlots:0,
          originalsWithPotentialCalendarBlindSpots:0,
          originalsWithAnyMissingOriginalCloseBid:0,
          originalsWithUnverifiedFullDurationEvidence:0,
          premiumRunupGivebackObservedAsQuoteOnlyPairs:0,
          overnightBidGapObservedAsQuoteOnlyPairs:0,
          noEntryNeverBrokerPosition:true,
          potentialWeekdayNotProvenRealExchangeSession:true,
          closeBidNotActualTradeFill:true
        };
        out.set(k,cell);
      }
      cell.originalListedPairs++;
      if(decision.originalEntryDisposition==='NO_ENTRY')
        cell.originalNoEntryPairs++;
      else cell.originalEntryClaimedPairs++;
      let missingWeekdaysForPair=0,missingBidForPair=0,
        currentMissingRun=0;
      const qs=sourceQuotes.get(original.instrumentKey)??[];
      for(let t=start;t<=last;t+=DAY){
        const date=dateString(t),declared=sessionMap.get(date);
        if(weekday(t)){
          cell.potentialWeekdayCandidateSlots++;
          if(!declared){
            missingWeekdaysForPair++;totalUnlistedSlots++;
            currentMissingRun++;
            maxUnlistedRun=Math.max(maxUnlistedRun,currentMissingRun);
            cell.undeclaredPotentialWeekdayCandidateSlots++;
            const candidates=absentByCell.get(k)??new Set<string>();
            candidates.add(date);absentByCell.set(k,candidates);
            allMissingDates.add(date);
          }else{
            cell.declaredExchangeLikeWeekdaySlots++;
            currentMissingRun=0;
          }
        }
        if(!declared)continue;
        // All declared sessions, including a user-declared special SAT/SUN,
        // require a source quote mark. The "weekday" probe adds potentially
        // missing dates; it never silently deletes special sessions.
        cell.originalDeclaredSessionCloseBidSlots++;
        const close=ts(declared.closeAt),open=ts(declared.openAt);
        const count=qs.filter(q=>
          q.event>=open&&q.event<=close&&
          q.arrival>=q.event&&q.arrival<=close&&
          close-q.arrival<=input.policy.maximumCloseBidAgeMinutes*MIN&&
          q.bidQty>=original.lotSize*
            input.policy.minimumDisplayedBidDepthLots).length;
        if(count<input.policy.minimumOriginalCloseBidMarksPerDeclaredSession){
          missingBidForPair++;missingBids++;
          cell.missingOrStaleDeclaredCloseBidSlots++;
        }
      }
      if(missingWeekdaysForPair>
        input.policy.maximumUnexplainedWeekdayCandidateGapsPerPair){
        pairsWithCalendarGaps++;
        cell.originalsWithPotentialCalendarBlindSpots++;
      }
      if(missingBidForPair){
        pairsWithMissingBid++;cell.originalsWithAnyMissingOriginalCloseBid++;
      }
      if(missingWeekdaysForPair||missingBidForPair)
        cell.originalsWithUnverifiedFullDurationEvidence++;
    }
  }
  const output=[...out.entries()].map(([k,c])=>({
    ...c,distinctUnexplainedWeekdayCandidates:absentByCell.get(k)?.size??0,
    premiumRunupGivebackObservedAsQuoteOnlyPairs:
      phase68.cells.find(x=>key(x.claimedRegime,x.horizon,x.optionType)===k)
        ?.premiumRunupThenGivebackAlertPairs??0,
    overnightBidGapObservedAsQuoteOnlyPairs:
      phase68.cells.find(x=>key(x.claimedRegime,x.horizon,x.optionType)===k)
        ?.nextOpenAdverseBidGapAlertPairs??0
  }));
  const fields:Partial<Phase69Report>={
    ...partial,originalOosDecisionDays:catalog.decisions.length,
    originalOosNoEntryDays:catalog.decisions.filter(x=>
      x.originalEntryDisposition==='NO_ENTRY').length,
    originalOosListedCePeContractPairs:paired,
    originalAllListedPairsWithCalendarBlindSpots:pairsWithCalendarGaps,
    originalPairsWithMissingDeclaredCloseBidMarks:pairsWithMissingBid,
    originalPairsWithoutVerifiedCompleteFullDurationEvidence:paired,
    totalUnexplainedPotentialWeekdayContractSlots:totalUnlistedSlots,
    distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar:
      allMissingDates.size,
    longestConsecutiveUnexplainedWeekdayRun:maxUnlistedRun,
    totalMissingOrStaleDeclaredSessionBidMarkSlots:missingBids,
    originalPremiumGivebackQuoteOnlyAlerts:
      phase68.claimedEntryPairsWithPremiumRunupThenGivebackAlert,
    originalOvernightGapQuoteOnlyAlerts:
      phase68.claimedEntryPairsWithFirstNextOpenGapAlert,
    cells:output
  };
  if(paired!==pins.expectedAllOosListedCePePairs||
    fields.originalOosDecisionDays!==pins.expectedOriginalOosDecisions||
    fields.originalOosNoEntryDays!==pins.expectedOriginalNoEntryDecisions||
    output.reduce((n,x)=>n+x.originalListedPairs,0)!==paired)
    return fail('PHASE69_FROZEN_OOS_CONTRACT_OR_NO_ENTRY_DENOMINATOR_CHANGED',
      'INCOMPLETE_EVIDENCE',fields);
  // Even if there are no software-detectable missing sessions, there is
  // NEVER independent proof that the issuer's calendar is real or complete.
  const status:Phase69Report['status']=totalUnlistedSlots?
    'DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY':
    missingBids?
      'DESCRIPTIVE_DECLARED_CLOSE_BID_SOURCE_GAPS_ONLY':
      'DESCRIPTIVE_NO_DETECTED_WEEKDAY_GAPS_BUT_SOURCE_UNVERIFIED';
  return {...empty(),...fields,status,
    reasonCodes:[
      totalUnlistedSlots?
        'POTENTIAL_WEEKDAY_SOURCE_DATES_ABSENT_FROM_OPERATOR_CALENDAR':
        'NO_MONDAY_TO_FRIDAY_CANDIDATE_GAPS_DETECTED_NOT_OFFICIAL',
      missingBids?
        'ORIGINAL_DECLARED_SESSION_CLOSE_BID_MARKS_MISSING_OR_STALE':
        'CLAIMED_DECLARED_SESSION_CLOSE_BID_MARKS_PRESENT',
      'PUBLIC_HOLIDAYS_AND_SPECIAL_WEEKEND_EXCHANGE_SESSIONS_UNVERIFIED',
      'NO_VERIFIED_MARKET_DATA_RIGHTS_RECEIPT_CLOCK_FILLS_OR_TRADING_AUTHORITY'
    ]};
}
