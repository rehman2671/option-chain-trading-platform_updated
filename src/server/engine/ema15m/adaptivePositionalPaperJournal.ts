/**
 * Adaptive v2 Phase 9 — OFFLINE simulated NRML positional journal.
 *
 * This is a deterministic, serializable "what would happen?" state machine.
 * Every apparent broker snapshot MUST be tagged SIMULATED_BROKER_FIXTURE.
 * NO Upstox imports, actual broker authentication, order routing, storage IO,
 * GTT creation, SL modification or live/paper-legacy engine integration.
 *
 * Hash chaining detects accidental file edits but is NOT a signed source.
 */
import { createHash } from 'node:crypto';
import type { DeclaredTradingSession } from './adaptiveSessionIntegrity.js';

export type MockProtectionStatus =
  'ACTIVE_NATIVE_SELL'|'ABSENT'|'UNKNOWN'|'CANCEL_PENDING'|'CANCELLED'|'FILLED'|'REJECTED';

export interface MockBrokerSnapshot {
  source:'SIMULATED_BROKER_FIXTURE';
  checkedAt:string;
  accountScopeId:string;
  instrumentKey:string;
  productType:'NRML'|'MIS';
  /** Complete hypothetical account view, not a single returned row. */
  accountView:'COMPLETE'|'PARTIAL';
  netLongQuantity:number;
  netShortQuantity:number;
  protectionStatus:MockProtectionStatus;
  protectedQuantity:number;
  protectionOrderId:string|null;
  stopTrigger:number|null;
  /** More than one outstanding SELL is never acceptable as "protected". */
  unresolvedOtherSellOrders:number;
}
export interface OfflineOptionBid {
  observedAt:string;
  instrumentKey:string;
  bid:number;
  ask:number;
  bidQty:number;
  askQty:number;
}

export type PositionalPaperEvent =
  | {kind:'OPEN_PAPER_NRML'; at:string; positionId:string;accountScopeId:string;
     instrumentKey:string;expiry:string;lotSize:number;quantity:number;
     entryAsk:number;initialStop:number}
  | {kind:'RECOVERY_STARTED';at:string}
  | {kind:'MOCK_BROKER_SNAPSHOT';at:string;snapshot:MockBrokerSnapshot}
  | {kind:'OPTION_L1_OBSERVED';at:string;quote:OfflineOptionBid}
  | {kind:'OPERATOR_EXIT_REVIEW_REQUESTED';at:string;requestId:string;
     quantity:number;reason:string}
  | {kind:'SIMULATED_EXIT_FILL';at:string;requestId:string;quantity:number;
     quoteObservedAt:string;bid:number};

export interface ChainedPositionalEvent {
  sequence:number;
  eventId:string;
  previousHash:string;
  hash:string;
  event:PositionalPaperEvent;
}
export interface PaperPositionalJournal {
  schemaVersion:'ADAPTIVE_POSITIONAL_PAPER_JOURNAL_V1';
  mode:'OFFLINE_PAPER_ONLY';
  entries:ChainedPositionalEvent[];
}
export interface PositionalPaperPolicy {
  maxSnapshotAgeMinutes:number;
  maxQuoteAgeMinutes:number;
  minDeclaredSessionsBeforeExpiry:number;
  maximumStressedLossINR:number;
  overnightGapStressPercent:number;
  /** Reject a fill if quote-to-event simulated latency exceeds this. */
  maxSimulatedFillDelaySeconds:number;
}
export type PaperLifecycleStatus =
  'INVALID_JOURNAL'|'WAITING_FOR_RECONCILIATION'|'BLOCKED_PROTECTION'|
  'EXIT_REVIEW'|'RECONCILED_PAPER_HOLD'|'PAPER_EXIT_REVIEW_PENDING'|
  'PAPER_PARTIAL_EXIT'|'PAPER_CLOSED_PENDING_RECONCILIATION'|
  'PAPER_CLOSED_RECONCILED';

export interface PaperReconciliationReport {
  mode:'OFFLINE_PAPER_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  orderInstruction:null;
  status:PaperLifecycleStatus;
  errors:string[];
  reasons:string[];
  paperRemainingQuantity:number;
  openExitRequestQuantity:number;
  lastSimulatedProtectionId:string|null;
  lastObservedBid:number|null;
  simulatedStressedLossINR:number|null;
  declaredTradingSessionsUntilExpiry:number|null;
  recoveredAfterRestart:boolean;
  journalTailHash:string|null;
  warnings:string[];
}
const warnings=[
  'SIMULATED_BROKER_FIXTURE_IS_NOT_REAL_BROKER_AUTHENTICATION',
  'HASH_CHAIN_INTEGRITY_IS_NOT_A_VENDOR_SIGNATURE_OR_IMMUTABLE_STORAGE',
  'NO_NATIVE_STOP_OR_GTT_CREATED_OR_MODIFIED',
  'NO_AUTOMATIC_NRML_ENTRY_OR_EXIT_OR_15_15_POSITIONAL_SQUARE_OFF',
  'NEXT_L1_BID_AND_DISPLAYED_DEPTH_DO_NOT_GUARANTEE_REAL_FILL',
  'SUPPLIED_EXCHANGE_CALENDAR_REQUIRES_INDEPENDENT_AUTHENTICATION'
];
const MS_MIN=60_000;
const ts=(value:unknown):number=>
  typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&
    /(Z|[+-]\d\d:\d\d)$/.test(value)?Date.parse(value):NaN;
const istDay=(ms:number):string=>
  new Date(ms+330*MS_MIN).toISOString().slice(0,10);
const finite=(x:unknown):x is number=>
  typeof x==='number'&&Number.isFinite(x);
const positive=(x:unknown):x is number=>finite(x)&&x>0;
const nonnegative=(x:unknown):x is number=>finite(x)&&x>=0;
const ident=(s:unknown)=>typeof s==='string'&&s.trim().length>0&&s.length<=256;
const validDate=(s:unknown):s is string=>
  typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&
  Number.isFinite(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const round=(v:number)=>Number(v.toFixed(2));
const digest=(previousHash:string,sequence:number,eventId:string,
  event:PositionalPaperEvent):string=>
  createHash('sha256').update(JSON.stringify({
    schemaVersion:'ADAPTIVE_POSITIONAL_PAPER_JOURNAL_V1',
    previousHash,sequence,eventId,event
  })).digest('hex');

export function emptyAdaptivePositionalPaperJournal():PaperPositionalJournal{
  return {schemaVersion:'ADAPTIVE_POSITIONAL_PAPER_JOURNAL_V1',
    mode:'OFFLINE_PAPER_ONLY',entries:[]};
}
/** This function ONLY appends to an immutable in-memory object. Caller must
 * separately and durably store the complete journal if it wants recovery. */
export function appendAdaptivePositionalPaperEvent(
  journal:PaperPositionalJournal,eventId:string,event:PositionalPaperEvent
):PaperPositionalJournal{
  if(!journal||journal.schemaVersion!=='ADAPTIVE_POSITIONAL_PAPER_JOURNAL_V1'||
      journal.mode!=='OFFLINE_PAPER_ONLY'||!Array.isArray(journal.entries)||
      !ident(eventId)||journal.entries.some(e=>e.eventId===eventId)||
      !event||!Number.isFinite(ts(event.at)))
    throw new Error('INVALID_OR_DUPLICATE_OFFLINE_PAPER_EVENT');
  const prior=journal.entries[journal.entries.length-1];
  const previousHash=prior?.hash??'GENESIS';
  const sequence=journal.entries.length+1;
  const item:ChainedPositionalEvent={
    sequence,eventId,previousHash,
    hash:digest(previousHash,sequence,eventId,event),event
  };
  return {...journal,entries:[...journal.entries,item]};
}
function checkPolicy(policy:PositionalPaperPolicy):string|null {
  if(!policy||!finite(policy.maxSnapshotAgeMinutes)||
      policy.maxSnapshotAgeMinutes<=0||policy.maxSnapshotAgeMinutes>60||
      !finite(policy.maxQuoteAgeMinutes)||policy.maxQuoteAgeMinutes<=0||
      policy.maxQuoteAgeMinutes>60||
      !Number.isInteger(policy.minDeclaredSessionsBeforeExpiry)||
      policy.minDeclaredSessionsBeforeExpiry<1||
      policy.minDeclaredSessionsBeforeExpiry>20||
      !positive(policy.maximumStressedLossINR)||
      !finite(policy.overnightGapStressPercent)||
      policy.overnightGapStressPercent<0||
      policy.overnightGapStressPercent>100||
      !positive(policy.maxSimulatedFillDelaySeconds)||
      policy.maxSimulatedFillDelaySeconds>60)
    return 'INVALID_PAPER_LIFECYCLE_POLICY';
  return null;
}
function sessionAudit(declared:DeclaredTradingSession[]|undefined,
  now:number,expiry:string):{valid:boolean;remaining:number;reason:string|null}{
  if(!Array.isArray(declared)||!declared.length)
    return {valid:false,remaining:0,reason:'EXCHANGE_SESSION_WINDOWS_REQUIRED'};
  let prior='',remaining=0;
  for(const s of declared){
    const open=ts(s?.openAt),close=ts(s?.closeAt);
    if(!s||!validDate(s.sessionDate)||!ident(s.sourceRecordId)||
        s.sessionDate<=prior||!Number.isFinite(open)||!Number.isFinite(close)||
        istDay(open)!==s.sessionDate||istDay(close)!==s.sessionDate||
        close<=open||close-open>24*60*MS_MIN)
      return {valid:false,remaining:0,reason:'INVALID_OR_UNSORTED_DECLARED_SESSION_WINDOWS'};
    prior=s.sessionDate;
    if(s.sessionDate>=istDay(now)&&s.sessionDate<=expiry&&close>now)
      remaining++;
  }
  const nowDay=istDay(now);
  // The calendar MUST extend to the expiry date (even if expiry is a holiday:
  // last declared session is then less than expiry, so the operator must verify
  // a special-session/holiday expiry schedule rather than silently assume it).
  if(declared[declared.length-1].sessionDate<expiry)
    return {valid:false,remaining,reason:'EXPIRY_SESSION_COVERAGE_UNVERIFIED'};
  if(nowDay>expiry)return {valid:true,remaining:0,reason:null};
  return {valid:true,remaining,reason:null};
}
interface JournalPosition {
  positionId:string;accountScopeId:string;instrumentKey:string;expiry:string;
  quantity:number;remaining:number;lotSize:number;entryAsk:number;
  initialStop:number;openedAt:number;
}
interface ExitRequest {
  requestId:string;remaining:number;at:number;
}

export function replayAdaptivePositionalPaperJournal(
  journal:PaperPositionalJournal,
  asOf:string,
  policy:PositionalPaperPolicy,
  declaredSessions:DeclaredTradingSession[]
):PaperReconciliationReport {
  const base:PaperReconciliationReport={
    mode:'OFFLINE_PAPER_ONLY',executionAuthorized:false,productionSafe:false,
    brokerAuthenticated:false,brokerStopInstalled:false,orderInstruction:null,
    status:'INVALID_JOURNAL',errors:[],reasons:[],
    paperRemainingQuantity:0,openExitRequestQuantity:0,
    lastSimulatedProtectionId:null,lastObservedBid:null,
    simulatedStressedLossINR:null,declaredTradingSessionsUntilExpiry:null,
    recoveredAfterRestart:false,journalTailHash:null,warnings
  };
  const errors:string[]=[];
  const evalAt=ts(asOf);
  if(!Number.isFinite(evalAt))errors.push('INVALID_EVALUATION_TIME');
  const badPolicy=checkPolicy(policy);
  if(badPolicy)errors.push(badPolicy);
  if(!journal||journal.schemaVersion!=='ADAPTIVE_POSITIONAL_PAPER_JOURNAL_V1'||
      journal.mode!=='OFFLINE_PAPER_ONLY'||!Array.isArray(journal.entries)||
      !journal.entries.length)
    errors.push('MISSING_OR_INVALID_OFFLINE_PAPER_JOURNAL');
  if(errors.length)return {...base,errors};
  let position:JournalPosition|null=null;
  let request:ExitRequest|null=null;
  let snapshot:MockBrokerSnapshot|null=null;
  let quote:OfflineOptionBid|null=null;
  let lastRestart=-Infinity;
  let priorTime=-Infinity;
  let previousHash='GENESIS';
  let filledQuoteTime=-Infinity;
  let exitFillCount=0;
  const seenIds=new Set<string>();
  for(let i=0;i<journal.entries.length;i++){
    const row=journal.entries[i];
    const event=row?.event;
    const t=ts(event?.at);
    if(!row||row.sequence!==i+1||!ident(row.eventId)||
       seenIds.has(row.eventId)||row.previousHash!==previousHash||
       !/^[0-9a-f]{64}$/.test(row.hash||'')||
       row.hash!==digest(previousHash,i+1,row.eventId,event)||
       !Number.isFinite(t)||t<priorTime||t>evalAt){
      errors.push('JOURNAL_ORDER_HASH_CLOCK_OR_EVENT_ID_INVALID');break;
    }
    if(i===0&&event.kind!=='OPEN_PAPER_NRML'){
      errors.push('PAPER_POSITION_MUST_START_WITH_OPEN_EVENT');break;
    }
    seenIds.add(row.eventId);
    previousHash=row.hash;
    priorTime=t;
    switch(event.kind){
      case 'OPEN_PAPER_NRML':{
        if(position||!ident(event.positionId)||!ident(event.accountScopeId)||
           !ident(event.instrumentKey)||!validDate(event.expiry)||
           istDay(t)>event.expiry||!Number.isInteger(event.lotSize)||
           event.lotSize<=0||!Number.isInteger(event.quantity)||
           event.quantity<=0||event.quantity%event.lotSize!==0||
           !positive(event.entryAsk)||!positive(event.initialStop)||
           event.initialStop>=event.entryAsk){
          errors.push('INVALID_OR_SECOND_PAPER_NRML_ENTRY');break;
        }
        position={
          positionId:event.positionId,accountScopeId:event.accountScopeId,
          instrumentKey:event.instrumentKey,expiry:event.expiry,
          quantity:event.quantity,remaining:event.quantity,lotSize:event.lotSize,
          entryAsk:event.entryAsk,initialStop:event.initialStop,openedAt:t
        };
        break;
      }
      case 'RECOVERY_STARTED':
        lastRestart=t;snapshot=null;quote=null;break;
      case 'MOCK_BROKER_SNAPSHOT':{
        if(!position){errors.push('SNAPSHOT_WITHOUT_PAPER_POSITION');break;}
        const s=event.snapshot,st=ts(s?.checkedAt);
        if(!s||s.source!=='SIMULATED_BROKER_FIXTURE'||
           !Number.isFinite(st)||st>t||st<lastRestart||
           st<position.openedAt||s.accountScopeId!==position.accountScopeId||
           s.instrumentKey!==position.instrumentKey||
           s.productType!=='NRML'||s.accountView!=='COMPLETE'||
           !Number.isInteger(s.netLongQuantity)||s.netLongQuantity<0||
           !Number.isInteger(s.netShortQuantity)||s.netShortQuantity<0||
           !Number.isInteger(s.protectedQuantity)||s.protectedQuantity<0||
           !Number.isInteger(s.unresolvedOtherSellOrders)||
           s.unresolvedOtherSellOrders<0||
           !['ACTIVE_NATIVE_SELL','ABSENT','UNKNOWN','CANCEL_PENDING',
             'CANCELLED','FILLED','REJECTED'].includes(s.protectionStatus)||
           (s.protectionOrderId!==null&&!ident(s.protectionOrderId))||
           (s.stopTrigger!==null&&!positive(s.stopTrigger))){
          errors.push('INVALID_OR_UNTRUSTED_SIMULATED_BROKER_SNAPSHOT');break;
        }
        if(snapshot&&st<=ts(snapshot.checkedAt)){
          errors.push('NONMONOTONIC_SIMULATED_BROKER_SNAPSHOT');break;
        }
        snapshot=s;break;
      }
      case 'OPTION_L1_OBSERVED':{
        if(!position){errors.push('QUOTE_WITHOUT_PAPER_POSITION');break;}
        const q=event.quote,qt=ts(q?.observedAt);
        if(!q||!Number.isFinite(qt)||qt>t||qt<lastRestart||
           qt<position.openedAt||q.instrumentKey!==position.instrumentKey||
           !positive(q.bid)||!positive(q.ask)||q.ask<=q.bid||
           !Number.isInteger(q.bidQty)||q.bidQty<=0||
           !Number.isInteger(q.askQty)||q.askQty<=0||
           (quote&&qt<=ts(quote.observedAt))){
          errors.push('INVALID_STALE_OR_WRONG_OPTION_L1');break;
        }
        quote=q;break;
      }
      case 'OPERATOR_EXIT_REVIEW_REQUESTED':{
        if(!position||position.remaining<=0||request||
           !ident(event.requestId)||!ident(event.reason)||
           !Number.isInteger(event.quantity)||event.quantity<=0||
           event.quantity>position.remaining||
           event.quantity%position.lotSize!==0){
          errors.push('INVALID_OR_DUPLICATE_OPERATOR_EXIT_REVIEW');break;
        }
        request={requestId:event.requestId,remaining:event.quantity,at:t};
        break;
      }
      case 'SIMULATED_EXIT_FILL':{
        if(!position||!request||event.requestId!==request.requestId||
           !Number.isInteger(event.quantity)||event.quantity<=0||
           event.quantity%position.lotSize!==0||
           event.quantity>request.remaining||
           event.quantity>position.remaining||
           !quote||event.quoteObservedAt!==quote.observedAt||
           !positive(event.bid)||Math.abs(event.bid-quote.bid)>1e-8||
           ts(quote.observedAt)<=request.at||
           ts(quote.observedAt)<=filledQuoteTime||
           t<ts(quote.observedAt)||
           t-ts(quote.observedAt)>policy.maxSimulatedFillDelaySeconds*1000||
           event.quantity>quote.bidQty){
          errors.push('SIMULATED_FILL_LACKS_POST_REQUEST_L1_OR_DEPTH');break;
        }
        position.remaining-=event.quantity;
        request.remaining-=event.quantity;
        filledQuoteTime=ts(quote.observedAt);
        exitFillCount++;
        if(request.remaining===0)request=null;
        break;
      }
      default:
        errors.push('UNKNOWN_JOURNAL_EVENT_KIND');
    }
    if(errors.length)break;
  }
  if(errors.length)return{...base,errors,journalTailHash:previousHash};
  if(!position)return{...base,errors:['PAPER_POSITION_NOT_FOUND']};
  const p:JournalPosition=position;
  const s:MockBrokerSnapshot|null=snapshot;
  const q:OfflineOptionBid|null=quote;
  const reasons:string[]=[];
  const calendar=sessionAudit(declaredSessions,evalAt,p.expiry);
  if(!calendar.valid)reasons.push(calendar.reason!);
  const brokerFresh=!!s&&evalAt-ts(s.checkedAt)<=
    policy.maxSnapshotAgeMinutes*MS_MIN;
  const quoteFresh=!!q&&evalAt-ts(q.observedAt)<=
    policy.maxQuoteAgeMinutes*MS_MIN;
  const recovered=!!s&&ts(s.checkedAt)>lastRestart&&brokerFresh;
  if(!brokerFresh)reasons.push('MOCK_BROKER_RECONCILIATION_MISSING_OR_STALE');
  if(!quoteFresh&&p.remaining>0)reasons.push('OPTION_BID_MISSING_OR_STALE');
  if(s&&(s.netLongQuantity!==p.remaining||s.netShortQuantity!==0))
    reasons.push('MOCK_BROKER_POSITION_QUANTITY_MISMATCH');
  if(s&&s.unresolvedOtherSellOrders>0)
    reasons.push('POTENTIALLY_DUPLICATE_SIMULATED_SELL_PENDING');
  const protectionActive=!!s&&s.protectionStatus==='ACTIVE_NATIVE_SELL'&&
    s.protectedQuantity===p.remaining&&s.protectedQuantity>0&&
    !!s.protectionOrderId&&!!s.stopTrigger&&
    s.unresolvedOtherSellOrders===0;
  if(p.remaining>0&&!protectionActive)
    reasons.push('SIMULATED_NATIVE_PROTECTION_UNCONFIRMED_OR_CANCEL_PENDING');
  const stressed=q?Math.max(0,(p.entryAsk-
    Math.max(0,q.bid*(1-policy.overnightGapStressPercent/100)))*p.remaining):null;
  if(stressed!==null&&stressed>policy.maximumStressedLossINR)
    reasons.push('SIMULATED_OVERNIGHT_STRESSED_LOSS_LIMIT_EXCEEDED');
  if(calendar.valid&&calendar.remaining<=policy.minDeclaredSessionsBeforeExpiry)
    reasons.push('EXPIRY_TRADING_SESSIONS_NEAR_OR_PASSED');
  const result:PaperReconciliationReport={
    ...base,errors:[],reasons,
    paperRemainingQuantity:p.remaining,openExitRequestQuantity:request?.remaining??0,
    lastSimulatedProtectionId:s?.protectionOrderId??null,
    lastObservedBid:q?.bid??null,
    simulatedStressedLossINR:stressed===null?null:round(stressed),
    declaredTradingSessionsUntilExpiry:calendar.valid?calendar.remaining:null,
    recoveredAfterRestart:recovered&&lastRestart!==-Infinity,
    journalTailHash:previousHash
  };
  // After a paper close we still need another fresh mock broker snapshot
  // confirming 0 quantity and no active/pending SELL before calling CLOSED.
  if(p.remaining===0){
    const clean=brokerFresh&&s?.netLongQuantity===0&&s?.netShortQuantity===0&&
      s?.unresolvedOtherSellOrders===0&&
      ['ABSENT','CANCELLED','FILLED','REJECTED'].includes(s?.protectionStatus??'')&&
      s?.protectedQuantity===0&&
      ts(s.checkedAt)>=priorTime;
    return{...result,status:clean?'PAPER_CLOSED_RECONCILED':
      'PAPER_CLOSED_PENDING_RECONCILIATION',
      reasons:clean?[]:[...reasons,'POST_EXIT_SIMULATED_BROKER_CLEARANCE_REQUIRED']};
  }
  if(!brokerFresh||!quoteFresh||!calendar.valid||
     (lastRestart!==-Infinity&&!recovered)||
     !!s&&(s.netLongQuantity!==p.remaining||s.netShortQuantity!==0))
    return{...result,status:'WAITING_FOR_RECONCILIATION'};
  if(request)return{...result,status:exitFillCount>0?'PAPER_PARTIAL_EXIT':
    'PAPER_EXIT_REVIEW_PENDING'};
  if(!protectionActive||s!.unresolvedOtherSellOrders>0)
    return{...result,status:'BLOCKED_PROTECTION'};
  if(reasons.includes('SIMULATED_OVERNIGHT_STRESSED_LOSS_LIMIT_EXCEEDED')||
     reasons.includes('EXPIRY_TRADING_SESSIONS_NEAR_OR_PASSED')||
     !!q&&q.bid<=Math.max(p.initialStop,s!.stopTrigger!))
    return{...result,status:'EXIT_REVIEW',reasons:reasons.concat(
      q&&q.bid<=Math.max(p.initialStop,s!.stopTrigger!)?[
        'OBSERVED_BID_AT_OR_BELOW_SIMULATED_STOP_REVIEW_ONLY']:[])};
  return{...result,status:'RECONCILED_PAPER_HOLD'};
}
