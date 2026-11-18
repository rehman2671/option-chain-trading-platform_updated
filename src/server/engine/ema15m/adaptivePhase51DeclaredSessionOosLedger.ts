/**
 * Adaptive Swing v2 Phase51 — owner-supplied INDEPENDENT session ledger vs
 * source OOS historical decisions. Research-only, no broker/network/orders.
 *
 * A self-signed, self-supplied calendar can be false; passing an internal
 * ledger match is NOT an authentic NSE/BSE calendar or licensed L1 feed.
 */
import {createHash} from 'node:crypto';
import {
  auditPhase50MultifoldL1AsOfCoverage,
  type Phase50MultifoldInput,type Phase50IndependentPins,
  type Phase50MultifoldReport
} from './adaptivePhase50MultifoldL1AsOf.js';
import type {HistoricalComparisonInput,HistoricalDecision}
  from './historicalAdaptiveComparison.js';

const IST=330*60000;
const MS=(x:unknown):number=>typeof x==='string'?Date.parse(x):NaN;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const DAY=/^\d{4}-\d\d-\d\d$/;
const SHA=/^[0-9a-f]{64}$/;
const hash=(value:unknown):string=>createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const istDay=(t:number)=>Number.isFinite(t)?
  new Date(t+IST).toISOString().slice(0,10):null;
const safeInt=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const validDay=(x:unknown):x is string=>
  typeof x==='string'&&DAY.test(x)&&
  Number.isFinite(MS(x+'T00:00:00Z'))&&
  new Date(MS(x+'T00:00:00Z')).toISOString().slice(0,10)===x;
const validTime=(x:unknown)=>typeof x==='string'&&ISO.test(x)&&
  Number.isFinite(MS(x));
export const hashPhase51Evidence=hash;

export interface Phase51DeclaredSession{
  sessionDate:string;
  openAt:string;
  closeAt:string;
  /** Identifies the *operator's* calendar document, not an issuer proof. */
  sourceRecordId:string;
}
export interface Phase51SessionLedger{
  schemaVersion:'ADAPTIVE_PHASE51_SESSION_LEDGER_V1';
  source:'OPERATOR_ASSERTED_EXCHANGE_SESSION_UNVERIFIED';
  sessions:Phase51DeclaredSession[];
}
export interface Phase51Input{
  schemaVersion:'ADAPTIVE_PHASE51_OOS_SESSION_COVERAGE_V1';
  source:'OFFLINE_UNAUTHENTICATED_OPERATOR_EVIDENCE';
  phase50:Phase50MultifoldInput;
  phase50Pins:Phase50IndependentPins;
  calendar:Phase51SessionLedger;
}
export interface Phase51IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE51_SESSION_OOS_PINS_V1';
  expectedCalendarSha256:string;
  expectedPhase50InputSha256:string;
  expectedPhase50PinsSha256:string;
  /** All original calendar dates, including no-signal sessions. */
  expectedDeclaredSessionCount:number;
  /** Dates assigned to one and only one OOS fold, with original decisionAt. */
  expectedOriginalOosManifestSha256:string;
  expectedOriginalOosSessionCount:number;
  minimumOosSessionsPerFold:number;
}
export interface Phase51FoldCoverage{
  foldIndex:number;
  declaredOosSessions:number;
  originalOosDecisions:number;
  missingOriginalDecisions:number;
  sourceDecisionOutsideDeclaredHours:number;
  staleOrOutOfSessionCatalogCaptures:number;
  staleOrOutOfSessionChainCaptures:number;
  sessionsMissingOriginalContractOrChainUniverse:number;
  sessionsWithNoOriginalAvailableOptionL1:number;
  entryAttemptsRetained:number;
  denominatorContainsNoTrade:true;
  issuerCalendarIndependentlyVerified:false;
}
export interface Phase51Report{
  mode:'OFFLINE_DECLARED_OOS_SESSION_CALENDAR_AND_L1_COVERAGE';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY';
  reasonCodes:string[];
  syntheticDataset:boolean|null;
  declaredCalendarSessions:number;
  originalDecisionSessions:number;
  declaredOosSessions:number;
  originalOosDecisions:number;
  missingOriginalSessions:number;
  decisionsNotInDeclaredCalendar:number;
  decisionsOutsideDeclaredSessionHours:number;
  staleOrOutOfSessionCatalogCaptures:number;
  staleOrOutOfSessionChainCaptures:number;
  sessionsMissingOriginalContractOrChainUniverse:number;
  sessionsWithNoOriginalAvailableOptionL1:number;
  fullPhase50OosAttemptDenominator:number;
  folds:Phase51FoldCoverage[];
  phase50Status:Phase50MultifoldReport['status']|null;
  independentlyAuthenticatedExchangeCalendar:false;
  originalLicensedL1IndependentlyAuthenticated:false;
  sourceOriginalAvailableAtIndependentlyVerified:false;
  independentlyAuthenticatedInstrumentCatalog:false;
  unbiasedOosProfitabilityProven:false;
  genuineBrokerOrderOrOvernightStopVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARNING=[
  'SESSION_LEDGER_IS_OPERATOR_ASSERTED_NOT_EXCHANGE_CALENDAR_AUTHENTICATION',
  'SELF_SUPPLIED_PINS_DO_NOT_ESTABLISH_CALENDAR_OR_VENDOR_LICENSE_PROVENANCE',
  'MISSING_TEST_DAYS_ARE_RETAINED_IN_INDEPENDENT_DECLARED_OOS_DENOMINATOR',
  'SILENT_MISSING_CHAINS_OR_OPTION_QUOTES_CANNOT_BE_CALLED_NO_SIGNAL_MARKET_DAYS',
  'FULL_PHASE50_ENTRY_FIRST_SOURCE_ASOF_REAUDIT_REQUIRED',
  'NO_GENUINE_ORDER_ACK_OR_NATIVE_NRML_STOP_OR_LIVE_PROFITABILITY_PROOF',
  'NO_NRML_15_15_FORCED_EXIT_AND_NO_NEW_BROKER_WRITES'
];
const blank=():Phase51Report=>({
  mode:'OFFLINE_DECLARED_OOS_SESSION_CALENDAR_AND_L1_COVERAGE',
  status:'INVALID_EVIDENCE',reasonCodes:[],syntheticDataset:null,
  declaredCalendarSessions:0,originalDecisionSessions:0,
  declaredOosSessions:0,originalOosDecisions:0,
  missingOriginalSessions:0,decisionsNotInDeclaredCalendar:0,
  decisionsOutsideDeclaredSessionHours:0,
  staleOrOutOfSessionCatalogCaptures:0,
  staleOrOutOfSessionChainCaptures:0,
  sessionsMissingOriginalContractOrChainUniverse:0,
  sessionsWithNoOriginalAvailableOptionL1:0,
  fullPhase50OosAttemptDenominator:0,folds:[],
  phase50Status:null,independentlyAuthenticatedExchangeCalendar:false,
  originalLicensedL1IndependentlyAuthenticated:false,
  sourceOriginalAvailableAtIndependentlyVerified:false,
  independentlyAuthenticatedInstrumentCatalog:false,
  unbiasedOosProfitabilityProven:false,
  genuineBrokerOrderOrOvernightStopVerified:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARNING
});
const invalid=(reason:string):Phase51Report=>({
  ...blank(),reasonCodes:[reason]
});
function validateLedger(ledger:Phase51SessionLedger):boolean{
  if(!ledger||ledger.schemaVersion!=='ADAPTIVE_PHASE51_SESSION_LEDGER_V1'||
    ledger.source!=='OPERATOR_ASSERTED_EXCHANGE_SESSION_UNVERIFIED'||
    !Array.isArray(ledger.sessions)||ledger.sessions.length<1||
    ledger.sessions.length>100000)return false;
  let previous='';
  for(const s of ledger.sessions){
    if(!s||!validDay(s.sessionDate)||s.sessionDate<=previous||
      !validTime(s.openAt)||!validTime(s.closeAt)||
      typeof s.sourceRecordId!=='string'||
      !/^[A-Za-z0-9_.:-]{4,120}$/.test(s.sourceRecordId)||
      MS(s.openAt)>=MS(s.closeAt)||
      MS(s.closeAt)-MS(s.openAt)>12*3600000||
      MS(s.closeAt)-MS(s.openAt)<30*60000||
      istDay(MS(s.openAt))!==s.sessionDate||
      istDay(MS(s.closeAt))!==s.sessionDate)return false;
    previous=s.sessionDate;
  }
  return true;
}
const between=(t:number,start:number,end:number)=>
  Number.isFinite(t)&&t>=start&&t<=end;
function checkDecision(d:HistoricalDecision,s:Phase51DeclaredSession){
  const start=MS(s.openAt),end=MS(s.closeAt);
  const decision=MS(d.decisionAt),catalog=MS(d.contractsCapturedAt);
  const outside=!between(decision,start,end);
  const catalogBad=!between(catalog,start,decision);
  const chainBad=!Array.isArray(d.chains)||
    d.chains.some(ch=>!ch||!between(MS(ch.capturedAt),start,decision));
  const universeMissing=!Array.isArray(d.listedContracts)||
    d.listedContracts.length===0||!Array.isArray(d.chains)||
    d.chains.length===0||d.chains.every(ch=>
      !Array.isArray(ch.rows)||ch.rows.length===0);
  return {outside,catalogBad,chainBad,universeMissing};
}
/**
 * Build OOS manifest from independently declared sessions, rather than
 * trusting a dataset that may already have removed losing/no-quote days.
 */
function manifest(h:HistoricalComparisonInput,calendar:Phase51DeclaredSession[]){
  const data:string[]=[];
  const seen=new Set<string>();
  for(let f=0;f<h.policy.folds.length;f++){
    const fold=h.policy.folds[f];
    for(const s of calendar){
      if(s.sessionDate>=fold.testStart&&s.sessionDate<=fold.testEnd){
        if(seen.has(s.sessionDate))return null;
        seen.add(s.sessionDate);
        // Date-only manifest is independent of historical decisions.
        // A missing original day remains visible as an unfilled ledger row.
        data.push(f+'|'+s.sessionDate);
      }
    }
  }
  return data;
}
export function auditPhase51DeclaredOosSessionCoverage(
  input:Phase51Input,pins:Phase51IndependentPins
):Phase51Report{
  if(!input||input.schemaVersion!=='ADAPTIVE_PHASE51_OOS_SESSION_COVERAGE_V1'||
    input.source!=='OFFLINE_UNAUTHENTICATED_OPERATOR_EVIDENCE'||
    !pins||pins.schemaVersion!=='INDEPENDENT_PHASE51_SESSION_OOS_PINS_V1'||
    ![pins.expectedCalendarSha256,pins.expectedPhase50InputSha256,
      pins.expectedPhase50PinsSha256,
      pins.expectedOriginalOosManifestSha256].every(x=>
      typeof x==='string'&&SHA.test(x))||
    !safeInt(pins.expectedDeclaredSessionCount,1,100000)||
    !safeInt(pins.expectedOriginalOosSessionCount,1,100000)||
    !safeInt(pins.minimumOosSessionsPerFold,1,1000)||
    !input.phase50||!input.phase50Pins||!input.calendar||
    !input.phase50.historical||
    hash(input.calendar)!==pins.expectedCalendarSha256||
    hash(input.phase50)!==pins.expectedPhase50InputSha256||
    hash(input.phase50Pins)!==pins.expectedPhase50PinsSha256)
    return invalid('PRESPECIFIED_ORIGINAL_SOURCE_OR_CALENDAR_PINS_INVALID');
  if(!validateLedger(input.calendar)||!Array.isArray(
    input.phase50.historical.decisions)||!Array.isArray(
    input.phase50.historical.provenance?.expectedSessions)||
    !Array.isArray(input.phase50.historical.executionQuotes)||
    !Array.isArray(input.phase50.historical.policy?.folds))
    return invalid('ORIGINAL_CALENDAR_OR_MARKET_DATA_SCHEMA_INVALID');
  const h=input.phase50.historical,ledger=input.calendar.sessions;
  if(h.decisions.some(d=>!d||typeof d.sessionDate!=='string')||
    h.executionQuotes.some(q=>!q||typeof q.instrumentKey!=='string'))
    return invalid('ORIGINAL_MARKET_SOURCE_RECORDS_MALFORMED');
  if(ledger.length!==pins.expectedDeclaredSessionCount)
    return invalid('DECLARED_SESSION_COUNT_CHANGED_FROM_PRESPECIFICATION');
  let oos:ReturnType<typeof manifest>;
  try{oos=manifest(h,ledger);}
  catch{return invalid('ORIGINAL_OOS_FOLD_SESSION_MANIFEST_MALFORMED');}
  if(!oos||oos.length!==pins.expectedOriginalOosSessionCount||
    hash(oos)!==pins.expectedOriginalOosManifestSha256)
    return invalid('ORIGINAL_OOS_FOLD_SESSION_MANIFEST_MISMATCH');
  const declared=new Set(ledger.map(s=>s.sessionDate));
  const decisions=new Map(h.decisions.map(d=>[d.sessionDate,d]));
  const missing=ledger.filter(s=>!decisions.has(s.sessionDate)).length;
  const extra=h.decisions.filter(d=>!declared.has(d.sessionDate)).length;
  const expected=h.provenance.expectedSessions;
  const provenanceMismatch=expected.length!==ledger.length||
    expected.some((day,i)=>day!==ledger[i].sessionDate);
  const foldCells:Phase51FoldCoverage[]=[];
  let inSession=0,missingOos=0,wrongHours=0,catalogBad=0,chainBad=0,
    universeMissing=0,noQuote=0;
  for(let fi=0;fi<h.policy.folds.length;fi++){
    const fold=h.policy.folds[fi],days=ledger.filter(s=>
      s.sessionDate>=fold.testStart&&s.sessionDate<=fold.testEnd);
    let count=0,missingDay=0,wrong=0,catalog=0,chain=0,universe=0,noL1=0;
    for(const s of days){
      const d=decisions.get(s.sessionDate);
      if(!d){missingDay++;continue;}
      count++;
      const flags=checkDecision(d,s);
      if(flags.outside)wrong++;
      if(flags.catalogBad)catalog++;
      if(flags.chainBad)chain++;
      if(flags.universeMissing)universe++;
      const contractKeys=new Set(
        (Array.isArray(d.listedContracts)?d.listedContracts:[])
          .filter(x=>x&&typeof x.instrument_key==='string')
          .map(x=>x.instrument_key));
      const sourceAvailable=h.executionQuotes.some(q=>
        contractKeys.has(q.instrumentKey)&&
        between(MS(q.observedAt),MS(d.decisionAt),MS(s.closeAt))&&
        Number.isFinite(MS(q.availableAt))&&
        MS(q.availableAt)>=MS(q.observedAt)&&
        MS(q.availableAt)<=MS(s.closeAt)&&
        q.bid>0&&q.ask>q.bid&&q.bidQty>0&&q.askQty>0);
      if(!sourceAvailable)noL1++;
    }
    if(days.length<pins.minimumOosSessionsPerFold)
      inSession++;
    missingOos+=missingDay;wrongHours+=wrong;catalogBad+=catalog;
    chainBad+=chain;universeMissing+=universe;noQuote+=noL1;
    foldCells.push({
      foldIndex:fi,declaredOosSessions:days.length,
      originalOosDecisions:count,missingOriginalDecisions:missingDay,
      sourceDecisionOutsideDeclaredHours:wrong,
      staleOrOutOfSessionCatalogCaptures:catalog,
      staleOrOutOfSessionChainCaptures:chain,
      sessionsMissingOriginalContractOrChainUniverse:universe,
      sessionsWithNoOriginalAvailableOptionL1:noL1,
      entryAttemptsRetained:count*12,
      denominatorContainsNoTrade:true,
      issuerCalendarIndependentlyVerified:false
    });
  }
  // Always independently replay Phase50; cached "green" report is not evidence.
  let base:Phase50MultifoldReport;
  try{base=auditPhase50MultifoldL1AsOfCoverage(
    input.phase50,input.phase50Pins);}
  catch{return invalid('PHASE50_ORIGINAL_MULTIFOLD_REAUDIT_EXCEPTION');}
  const report:Phase51Report={
    ...blank(),syntheticDataset:h.provenance.synthetic,
    declaredCalendarSessions:ledger.length,
    originalDecisionSessions:h.decisions.length,
    declaredOosSessions:oos.length,
    originalOosDecisions:foldCells.reduce((n,f)=>n+f.originalOosDecisions,0),
    missingOriginalSessions:missing,
    decisionsNotInDeclaredCalendar:extra,
    decisionsOutsideDeclaredSessionHours:wrongHours,
    staleOrOutOfSessionCatalogCaptures:catalogBad,
    staleOrOutOfSessionChainCaptures:chainBad,
    sessionsMissingOriginalContractOrChainUniverse:universeMissing,
    sessionsWithNoOriginalAvailableOptionL1:noQuote,
    fullPhase50OosAttemptDenominator:base.totalDecisionArmHorizonAttempts,
    folds:foldCells,phase50Status:base.status
  };
  const reasons:string[]=[];
  if(missing>0||missingOos>0||extra>0||provenanceMismatch)
    reasons.push('INDEPENDENT_DECLARED_SESSION_MISSING_FROM_HISTORICAL_SOURCE');
  if(inSession>0)reasons.push('UNDERPOWERED_OOS_DECLARED_SESSION_FOLD');
  if(wrongHours>0)reasons.push('OOS_DECISION_OUTSIDE_DECLARED_SESSION');
  if(catalogBad>0)reasons.push('OOS_ORIGINAL_CONTRACT_CAPTURE_OUTSIDE_SESSION');
  if(chainBad>0)reasons.push('OOS_OPTION_CHAIN_CAPTURE_OUTSIDE_SESSION');
  if(universeMissing>0)reasons.push('OOS_ORIGINAL_CONTRACT_OR_CHAIN_UNIVERSE_MISSING');
  if(noQuote>0)reasons.push('OOS_SESSION_HAS_NO_ORIGINAL_AVAILABLE_SELECTED_UNIVERSE_L1');
  if(base.status!=='DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY'||
    base.oosTestDecisionCount!==oos.length||
    base.totalDecisionArmHorizonAttempts!==oos.length*12||
    foldCells.some(f=>f.originalOosDecisions!==f.declaredOosSessions))
    reasons.push('FULL_ORIGINAL_PHASE50_OOS_DENOMINATOR_OR_ASOF_GATE_FAILED');
  return reasons.length?
    {...report,status:'INCOMPLETE_EVIDENCE',reasonCodes:reasons}:
    {...report,status:'DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY'};
}
