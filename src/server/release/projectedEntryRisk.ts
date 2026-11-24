import {aggregatePortfolioGreekEvidence,type GreekMark,type PortfolioPosition} from './portfolioGreekEvidence.js';
import {validBrokerEntryIdentity,type BoundBrokerEntryEvidence,type BrokerEntryIdentity} from './boundBrokerEntryEvidence.js';

type Underlying=GreekMark['underlying'];
type Limits={netDelta:number;netGamma:number;netTheta:number;netVega:number;grossDelta:number;grossGamma:number;grossTheta:number;grossVega:number};
export interface ProjectedEntryInput {
  broker:BoundBrokerEntryEvidence;
  expected:BrokerEntryIdentity;
  sessionEpoch:string;
  // Must originate from trusted listed option identity and normalized per-unit marks.
  currentMarks:GreekMark[]; candidateMark:GreekMark;
  // Bounded long option BUY only. Worst-case premium at limit + explicit fee bound.
  limitPricePaise:number; maxFeesPaise:number; maxDailyLossPaise:number;
  // Server-configured limits in the same documented convention, never UI values.
  limits:Partial<Record<Underlying,Limits>>;
}
type Result={status:'WITHIN_INPUT_LIMITS';maxPremiumAndFeesPaise:number;reservationPaise:number;
  projected:Extract<ReturnType<typeof aggregatePortfolioGreekEvidence>,{status:'COMPLETE_INPUT_AGGREGATE'}>['byUnderlying'];
  orderAuthorized:false}|{status:'DENIED';reason:string;orderAuthorized:false};
const deny=(reason:string):Result=>({status:'DENIED',reason,orderAuthorized:false});
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
const nonnegative=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const paise=(n:number,up:boolean):number=>up?Math.ceil(n*100):Math.floor(n*100);
const fresh=(n:number,now:number)=>Number.isSafeInteger(n)&&n>0&&n<=now&&now-n<=15000;
const sameIdentity=(a:BrokerEntryIdentity,b:BrokerEntryIdentity)=>a.accountId===b.accountId&&a.authEpoch===b.authEpoch&&a.instrumentKey===b.instrumentKey&&a.quantity===b.quantity&&a.product===b.product;
const metrics=['netDelta','netGamma','netTheta','netVega','grossDelta','grossGamma','grossTheta','grossVega'] as const;
/** Pure advisory gate. Does not authenticate source, authorize dispatch, certify
 * NAV, cover market orders, or prove completeness of non-atomic broker reads. */
export function evaluateProjectedEntryRisk(x:ProjectedEntryInput,now:number):Result{
  if(!x||!x.broker||!validBrokerEntryIdentity(x.expected)||!validBrokerEntryIdentity(x.broker.identity)||
    !sameIdentity(x.broker.identity,x.expected)||x.broker.source!=='UPSTOX_ACCOUNT_READS'||
    !Number.isSafeInteger(now)||!fresh(x.broker.observedAt,now)||!fresh(x.broker.receivedAt,now)||
    x.broker.receivedAt<x.broker.observedAt||typeof x.sessionEpoch!=='string'||!x.sessionEpoch||
    !positive(x.limitPricePaise)||!nonnegative(x.maxFeesPaise)||!positive(x.maxDailyLossPaise)||
    !Array.isArray(x.currentMarks)||!x.candidateMark||x.candidateMark.instrumentKey!==x.expected.instrumentKey||
    !x.limits||!Array.isArray(x.broker.reportedOptionPositions))return deny('CANDIDATE_EVIDENCE_INVALID');
  const s=x.broker.snapshot;
  if(!s||s.source!=='UPSTOX_LIVE'||Date.parse(s.checkedAt)!==x.broker.observedAt||
    ![s.availableMargin,s.usedMargin,s.requiredMargin,s.portfolioPnl].every(Number.isFinite)||
    s.availableMargin<0||s.usedMargin<0||s.requiredMargin<=0||!nonnegative(s.activePositions)||
    s.activePositions!==x.broker.reportedOptionPositions.length)return deny('CAPITAL_EVIDENCE_INVALID');
  const available=paise(s.availableMargin,false),used=paise(s.usedMargin,true),required=paise(s.requiredMargin,true);
  const capital=paise(s.availableMargin+s.usedMargin,false);
  const premium=x.limitPricePaise*x.expected.quantity+x.maxFeesPaise;
  if(!nonnegative(available)||!nonnegative(used)||!positive(required)||!positive(capital)||!positive(premium))
    return deny('CAPITAL_ARITHMETIC_INVALID');
  // Broker funds total is a margin proxy, NOT NAV. Retain the stricter risk bound.
  const reservation=Math.max(required,premium);
  if(reservation>available||BigInt(reservation)*100n>BigInt(capital)*2n)
    return deny('SINGLE_TRADE_OR_AVAILABLE_CAPITAL_LIMIT');
  if((BigInt(used)+BigInt(reservation))*100n>BigInt(capital)*20n)
    return deny('PROJECTED_MARGIN_LIMIT');
  const loss=paise(Math.max(0,-s.portfolioPnl),true);
  if(!nonnegative(loss)||loss>=x.maxDailyLossPaise||BigInt(loss)*100n>=BigInt(capital)*3n)
    return deny('REPORTED_PORTFOLIO_LOSS_LIMIT');
  const base={accountScope:x.expected.accountId,sessionEpoch:x.sessionEpoch,positionsObservedAt:x.broker.observedAt,
    completePositionSet:true,positions:x.broker.reportedOptionPositions,marks:x.currentMarks};
  const current=aggregatePortfolioGreekEvidence(base,x.expected.accountId,x.sessionEpoch,now);
  if(current.status!=='COMPLETE_INPUT_AGGREGATE'||current.activePositions!==s.activePositions)
    return deny('CURRENT_GREEKS_UNAVAILABLE');
  const candidateOnly=aggregatePortfolioGreekEvidence({...base,positions:[{instrumentKey:x.expected.instrumentKey,product:x.expected.product,
    netQuantity:x.expected.quantity}],marks:[x.candidateMark]},x.expected.accountId,x.sessionEpoch,now);
  if(candidateOnly.status!=='COMPLETE_INPUT_AGGREGATE')return deny('CANDIDATE_GREEKS_UNAVAILABLE');
  const previous=x.currentMarks.find(m=>m.instrumentKey===x.expected.instrumentKey);
  if(previous&&(['underlying','observedAt','sessionEpoch','convention','delta','gamma','theta','vega'] as const).some(k=>previous[k]!==x.candidateMark[k]))
    return deny('CANDIDATE_MARK_CONFLICT');
  const positions:PortfolioPosition[]=base.positions.map(p=>({...p}));
  const existing=positions.find(p=>p.instrumentKey===x.expected.instrumentKey&&p.product===x.expected.product);
  // This gate is an opening long BUY, never an implicit short-cover path.
  if(existing&&existing.netQuantity<0)return deny('EXISTING_SHORT_REQUIRES_SEPARATE_RECONCILIATION');
  if(existing){existing.netQuantity+=x.expected.quantity;if(!positive(existing.netQuantity))return deny('QUANTITY_OVERFLOW');}
  else positions.push({instrumentKey:x.expected.instrumentKey,product:x.expected.product,netQuantity:x.expected.quantity});
  if(positions.length>10)return deny('PROJECTED_POSITION_LIMIT');
  const projected=aggregatePortfolioGreekEvidence({...base,positions,marks:previous?x.currentMarks:[...x.currentMarks,x.candidateMark]},
    x.expected.accountId,x.sessionEpoch,now);
  if(projected.status!=='COMPLETE_INPUT_AGGREGATE')return deny('PROJECTED_GREEKS_UNAVAILABLE');
  for(const [underlying,totals] of Object.entries(projected.byUnderlying)){
    const limit=x.limits[underlying as Underlying];
    if(!limit||!metrics.every(k=>Number.isFinite(limit[k])&&limit[k]>0))return deny('GREEK_POLICY_UNAVAILABLE');
    if(metrics.some(k=>Math.abs(totals[k])>limit[k]))return deny('PROJECTED_GREEK_LIMIT');
  }
  return {status:'WITHIN_INPUT_LIMITS',maxPremiumAndFeesPaise:premium,reservationPaise:reservation,
    projected:projected.byUnderlying,orderAuthorized:false};
}
