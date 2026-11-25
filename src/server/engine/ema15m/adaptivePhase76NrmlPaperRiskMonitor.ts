/**
 * Phase76: deterministic OFFLINE, PAPER-ONLY NRML positional risk review.
 * Does not place/modify/cancel orders, infer fills, select contracts or roll
 * positions. Synthetic/manual BID observations cannot authenticate market data.
 */
export type Phase76Horizon = '1W'|'2W'|'4W'|'8W';
export type Phase76Side = 'CE'|'PE';
export type Phase76Alert =
  |'PAID_DEBIT_EXCEEDS_BUDGET'|'FULL_DEBIT_AT_RISK_EXCEEDS_BUDGET'
  |'STALE_OR_MISSING_QUOTE_REVIEW'|'BID_DEPTH_UNAVAILABLE_REVIEW'
  |'UNCONFIRMED_PREMIUM_SPIKE_IGNORED'|'PRE_TARGET_GIVEBACK_REVIEW'
  |'OVERNIGHT_GAP_THROUGH_TRAIL_REVIEW'|'TRAIL_BREACH_REVIEW'
  |'TARGET_MARK_REVIEW_NOT_EXIT'|'INDICATIVE_LOSS_BUDGET_REVIEW'
  |'EXPIRY_APPROACHING_REVIEW'|'EXPIRY_DAY_REVIEW'
  |'EXPIRY_PASSED_REVIEW';

export interface Phase76PaperPosition {
  source: 'HYPOTHETICAL_LONG_OPTION_NOT_BROKER_POSITION';
  instrumentKey: string;
  horizon: Phase76Horizon;
  optionType: Phase76Side;
  enteredAt: string;
  /** Operator-supplied, NOT authenticated against official exchange master. */
  assumedExchangeExpiryDateIST: string;
  lotSize: number;
  lots: number;
  assumedEntryAskPremiumPoints: number;
  assumedNonRecoverableFeesINR: number;
}
export interface Phase76PaperPolicy {
  source: 'PREREGISTERED_PAPER_ALERT_POLICY_NOT_EXECUTABLE_STOP';
  armGainPremiumPoints: number;
  givebackAlertPremiumPoints: number;
  targetAlertPremiumPoints: number;
  minimumConfirmGapSeconds: number;
  minimumBidDepthLotsForIndicativeMark: number;
  maximumQuoteAgeSeconds: number;
  maximumPaidDebitPlusFeesINR: number;
  maximumIndicativeLossINR: number;
  expiryReviewCalendarDays: number;
}
export interface Phase76PaperQuote {
  source: 'MANUAL_OR_SYNTHETIC_PAPER_MARK_NOT_VERIFIED_L1';
  /** Both timestamp fields must be real ISO 8601 offsets or Z. */
  observedAt: string;
  receivedAt: string;
  bestBidPremiumPoints: number|null;
  displayedBestBidDepthLots: number;
}
export interface Phase76PaperInput {
  mode: 'OFFLINE_NRML_PAPER_RISK_REVIEW_V1';
  evaluationAt: string;
  position: Phase76PaperPosition;
  policy: Phase76PaperPolicy;
  quotes: Phase76PaperQuote[];
}
export interface Phase76PaperReport {
  mode: 'OFFLINE_NRML_PAPER_RISK_REVIEW_V1';
  status: 'INVALID_INPUT'|'PAPER_REVIEW_REQUIRED'|'PAPER_MONITOR_ONLY';
  reasonCodes: string[];
  alerts: Phase76Alert[];
  assumedPaidDebitPlusFeesINR: number|null;
  /** Full possible premium loss even when the last quoted price was higher. */
  maximumLongOptionCashAtRiskINR: number|null;
  latestIndicativeBidMarkINR: number|null;
  latestIndicativePnLAfterFeesINR: number|null;
  confirmedPeakPremiumGainPoints: number|null;
  hypotheticalTrailAlertPremiumPoints: number|null;
  paperConfirmationCount: number;
  daysUntilClaimedExpiryIST: number|null;
  marketSourceAuthenticated: false;
  genuineBrokerPositionOrFillVerified: false;
  realBrokerStopOrGttAcknowledged: false;
  trailingAlertIsNotGuaranteedExit: true;
  existingMisIntradaySquareOffUnchanged: true;
  forced1515NrmlExit: false;
  automaticExpiryRoll: false;
  recommendedHorizonOrContract: null;
  realizedPnLINR: null;
  brokerOrderInstruction: null;
  liveExecutionAuthorized: false;
  productionSafe: false;
}
const validIso=(s:unknown):s is string=>{
  if(typeof s!=='string')return false;
  const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?(Z|([+-])(\d\d):(\d\d))$/.exec(s);
  if(!m)return false;
  const h=Number(m[5]??0),min=Number(m[6]??0),ms=Date.parse(s);
  if(!Number.isFinite(ms)||h>14||min>59||(h===14&&min!==0))return false;
  const offset=m[3]==='Z'?0:(m[4]==='+'?1:-1)*(60*h+min);
  return new Date(ms+offset*60000).toISOString().slice(0,23)===m[1]+'.'+(m[2]??'').padEnd(3,'0');
};
const finite=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const rounded=(n:number)=>Number(n.toFixed(2));
const millisDay=86400000;
const istDay=(ms:number)=>new Date(ms+330*60000).toISOString().slice(0,10);
const daysBetween=(a:string,b:string)=>
  Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/millisDay);
const validDay=(s:unknown):s is string=>typeof s==='string'&&
  /^\d{4}-\d{2}-\d{2}$/.test(s)&&
  Number.isFinite(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function empty(reason:string):Phase76PaperReport {
  return {
    mode:'OFFLINE_NRML_PAPER_RISK_REVIEW_V1',status:'INVALID_INPUT',
    reasonCodes:[reason], alerts:[],assumedPaidDebitPlusFeesINR:null,
    maximumLongOptionCashAtRiskINR:null,latestIndicativeBidMarkINR:null,
    latestIndicativePnLAfterFeesINR:null,confirmedPeakPremiumGainPoints:null,
    hypotheticalTrailAlertPremiumPoints:null,paperConfirmationCount:0,
    daysUntilClaimedExpiryIST:null,marketSourceAuthenticated:false,
    genuineBrokerPositionOrFillVerified:false,realBrokerStopOrGttAcknowledged:false,
    trailingAlertIsNotGuaranteedExit:true,existingMisIntradaySquareOffUnchanged:true,
    forced1515NrmlExit:false,automaticExpiryRoll:false,
    recommendedHorizonOrContract:null,realizedPnLINR:null,
    brokerOrderInstruction:null,liveExecutionAuthorized:false,productionSafe:false
  };
}
/** Pure computation; caller must separately enforce OS/container no-network-egress. */
export function reviewPhase76NrmlPaperRisk(input:Phase76PaperInput):Phase76PaperReport {
  if(!input||input.mode!=='OFFLINE_NRML_PAPER_RISK_REVIEW_V1'||
    !validIso(input.evaluationAt)||!input.position||!input.policy||
    !Array.isArray(input.quotes)||input.quotes.length>10000)
    return empty('INVALID_PAPER_INPUT_ENVELOPE');
  const p=input.position,k=input.policy,now=Date.parse(input.evaluationAt);
  if(p.source!=='HYPOTHETICAL_LONG_OPTION_NOT_BROKER_POSITION'||
    typeof p.instrumentKey!=='string'||!p.instrumentKey.trim()||
    p.instrumentKey.length>180||!['1W','2W','4W','8W'].includes(p.horizon)||
    !['CE','PE'].includes(p.optionType)||!validIso(p.enteredAt)||
    !validDay(p.assumedExchangeExpiryDateIST)||
    Date.parse(p.enteredAt)>now||
    istDay(Date.parse(p.enteredAt))>p.assumedExchangeExpiryDateIST||
    !integer(p.lotSize,1,10000)||!integer(p.lots,1,1000)||
    !finite(p.assumedEntryAskPremiumPoints,0.01,100000)||
    !finite(p.assumedNonRecoverableFeesINR,0,100000))
    return empty('INVALID_HYPOTHETICAL_POSITION');
  if(k.source!=='PREREGISTERED_PAPER_ALERT_POLICY_NOT_EXECUTABLE_STOP'||
    !finite(k.armGainPremiumPoints,0.01,100000)||
    !finite(k.givebackAlertPremiumPoints,0.01,100000)||
    !finite(k.targetAlertPremiumPoints,0.01,100000)||
    !(k.givebackAlertPremiumPoints<k.armGainPremiumPoints&&
      k.armGainPremiumPoints<k.targetAlertPremiumPoints)||
    !integer(k.minimumConfirmGapSeconds,1,86400)||
    !integer(k.minimumBidDepthLotsForIndicativeMark,1,1000)||
    !integer(k.maximumQuoteAgeSeconds,1,86400)||
    !finite(k.maximumPaidDebitPlusFeesINR,1,1e10)||
    !finite(k.maximumIndicativeLossINR,1,1e10)||
    !integer(k.expiryReviewCalendarDays,1,30))
    return empty('INVALID_PAPER_ALERT_POLICY');
  const qty=p.lotSize*p.lots;
  const paid=qty*p.assumedEntryAskPremiumPoints+p.assumedNonRecoverableFeesINR;
  if(!Number.isSafeInteger(qty)||!Number.isFinite(paid)||paid>1e11)
    return empty('HYPOTHETICAL_EXPOSURE_UNBOUNDED');
  const entered=Date.parse(p.enteredAt);
  const declaredDays=daysBetween(p.assumedExchangeExpiryDateIST,istDay(entered));
  const inferredHorizon:Phase76Horizon|null=
    declaredDays>=1&&declaredDays<8?'1W':
    declaredDays>=8&&declaredDays<18?'2W':
    declaredDays>=18&&declaredDays<36?'4W':
    declaredDays>=36&&declaredDays<=80?'8W':null;
  if(inferredHorizon!==p.horizon)
    return empty('DECLARED_HORIZON_DOES_NOT_MATCH_UNVERIFIED_EXPIRY');
  let prevReceived=entered-1,prevObserved=entered-1;
  for(const q of input.quotes){
    if(!q||q.source!=='MANUAL_OR_SYNTHETIC_PAPER_MARK_NOT_VERIFIED_L1'||
      !validIso(q.observedAt)||!validIso(q.receivedAt)||
      !integer(q.displayedBestBidDepthLots,0,100000)||
      !(q.bestBidPremiumPoints===null||
        finite(q.bestBidPremiumPoints,0,100000))||
      (q.bestBidPremiumPoints===null&&q.displayedBestBidDepthLots!==0))
      return empty('INVALID_PAPER_QUOTE');
    const obs=Date.parse(q.observedAt),recv=Date.parse(q.receivedAt);
    if(obs<entered||obs>recv||recv>now||
      obs<=prevObserved||recv<=prevReceived)
      return empty('NONCAUSAL_OR_NONMONOTONIC_PAPER_QUOTE');
    prevObserved=obs;prevReceived=recv;
  }
  const alerts=new Set<Phase76Alert>();
  if(paid>k.maximumPaidDebitPlusFeesINR){
    alerts.add('PAID_DEBIT_EXCEEDS_BUDGET');
    alerts.add('FULL_DEBIT_AT_RISK_EXCEEDS_BUDGET');
  }
  const days=daysBetween(p.assumedExchangeExpiryDateIST,istDay(now));
  if(days<0)alerts.add('EXPIRY_PASSED_REVIEW');
  else if(days===0)alerts.add('EXPIRY_DAY_REVIEW');
  else if(days<=k.expiryReviewCalendarDays)
    alerts.add('EXPIRY_APPROACHING_REVIEW');
  let pending:{at:number;bid:number}|null=null;
  let armed=false,peak:number|null=null,trail:number|null=null,confirmed=0;
  let previousUsable:{bid:number;day:string}|null=null;
  let lastGap=false;
  for(const q of input.quotes){
    const bid=q.bestBidPremiumPoints;
    const at=Date.parse(q.receivedAt);
    const usable=bid!==null&&q.displayedBestBidDepthLots>=
      Math.max(k.minimumBidDepthLotsForIndicativeMark,p.lots)&&
      at-Date.parse(q.observedAt)<=k.maximumQuoteAgeSeconds*1000;
    if(!usable){ pending=null;continue; }
    const previous=previousUsable;
    previousUsable={bid:bid!,day:istDay(Date.parse(q.observedAt))};
    if(!armed){
      if(bid!<p.assumedEntryAskPremiumPoints+k.armGainPremiumPoints){
        pending=null;continue;
      }
      if(!pending){pending={at,bid:bid!};continue;}
      if(at-pending.at>=k.minimumConfirmGapSeconds*1000){
        armed=true;confirmed+=2;peak=bid!;
        trail=Math.max(p.assumedEntryAskPremiumPoints,
          peak-k.givebackAlertPremiumPoints);
        // Do not promote the first unconfirmed spike to a peak.
      }
    }else{
      confirmed++;
      if(bid!>peak!){
        peak=bid!;
        trail=Math.max(trail!,peak-k.givebackAlertPremiumPoints);
      }
    }
    if(armed&&trail!==null&&bid!<=trail&&
      previous&&previous.day!==istDay(Date.parse(q.observedAt))&&
      bid!<p.assumedEntryAskPremiumPoints)
      lastGap=true;
  }
  const last=input.quotes.at(-1);
  const quoteFresh=!!last&&now-Date.parse(last.observedAt)<=
    k.maximumQuoteAgeSeconds*1000;
  const sufficientDepth=!!last&&last.bestBidPremiumPoints!==null&&
    last.displayedBestBidDepthLots>=Math.max(k.minimumBidDepthLotsForIndicativeMark,p.lots);
  const validCurrent=quoteFresh&&sufficientDepth;
  if(!quoteFresh)alerts.add('STALE_OR_MISSING_QUOTE_REVIEW');
  else if(!sufficientDepth)alerts.add('BID_DEPTH_UNAVAILABLE_REVIEW');
  if(!armed&&pending)alerts.add('UNCONFIRMED_PREMIUM_SPIKE_IGNORED');
  let mark:null|number=null,pnl:null|number=null;
  if(validCurrent&&days>=0){
    const bid=last!.bestBidPremiumPoints!;
    mark=rounded(bid*qty);
    pnl=rounded((bid-p.assumedEntryAskPremiumPoints)*qty-
      p.assumedNonRecoverableFeesINR);
    if(-pnl>k.maximumIndicativeLossINR)
      alerts.add('INDICATIVE_LOSS_BUDGET_REVIEW');
    if(armed&&trail!==null&&bid<=trail){
      alerts.add('TRAIL_BREACH_REVIEW');
      if(peak!-p.assumedEntryAskPremiumPoints<k.targetAlertPremiumPoints)
        alerts.add('PRE_TARGET_GIVEBACK_REVIEW');
      if(lastGap)alerts.add('OVERNIGHT_GAP_THROUGH_TRAIL_REVIEW');
    }
    if(armed&&peak!-p.assumedEntryAskPremiumPoints>=k.targetAlertPremiumPoints)
      alerts.add('TARGET_MARK_REVIEW_NOT_EXIT');
  }
  return {
    ...empty(''),status:alerts.size?'PAPER_REVIEW_REQUIRED':'PAPER_MONITOR_ONLY',
    reasonCodes:['PAPER_MARKS_NOT_ACTUAL_HISTORICAL_QUOTES_OR_BROKER_FILLS',
      'FULL_LONG_PREMIUM_DEBIT_REMAINS_AT_RISK',
      'ALL_ALERTS_REQUIRE_OPERATOR_REVIEW_NO_ORDER_WRITES'],
    alerts:[...alerts],assumedPaidDebitPlusFeesINR:rounded(paid),
    maximumLongOptionCashAtRiskINR:rounded(paid),
    latestIndicativeBidMarkINR:mark,latestIndicativePnLAfterFeesINR:pnl,
    confirmedPeakPremiumGainPoints:peak===null?null:
      rounded(peak-p.assumedEntryAskPremiumPoints),
    hypotheticalTrailAlertPremiumPoints:trail===null?null:rounded(trail),
    paperConfirmationCount:confirmed,daysUntilClaimedExpiryIST:days
  };
}
