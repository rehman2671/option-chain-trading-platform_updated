/**
 * Phase74: separate a retrospectively downloaded option L1 archive from
 * point-in-time decision evidence.  Original eventAt/availableAt labels in
 * a later historical file are NOT proof a trading client saw those quotes.
 *
 * Full original Phase73->66 new vendor OOS source is re-audited, including
 * every unselected 1W/2W/4W/8W CE/PE and NO_ENTRY date.
 *
 * OFFLINE RESEARCH ONLY; no vendor, broker, NRML, native stop or GTT I/O.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase73HistoricalSourceReadiness,
  type Phase73Input,type Phase73Pins,type Phase73Report
} from './adaptivePhase73HistoricalL1LicenceReadiness.js';
import type {Phase66OriginalCatalog}
  from './adaptivePhase66StandaloneVendorPreflight.js';
import type {Phase73ClaimedSourceIntake}
  from './adaptivePhase73HistoricalL1LicenceReadiness.js';
import {parseOriginalNativeL1Csv}
  from './adaptiveNativeL1CsvBridge.js';

const SHA=/^[a-f0-9]{64}$/;
const DAY=86400000,MINUTE=60000;
type Horizon='1W'|'2W'|'4W'|'8W';
type OptionSide='CE'|'PE';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export const hashPhase74Evidence=(v:unknown):string=>
  sha(Buffer.from(JSON.stringify(v),'utf8'));
const integer=(v:unknown,lo:number,hi:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=lo&&v<=hi;
function decode(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||!s.length||s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>0&&b.length<=max&&b.toString('base64')===s?b:null;
  }catch{return null;}
}
function parse<T>(b:Buffer):T|null{
  try{
    const j=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
    return j&&typeof j==='object'&&!Array.isArray(j)?j as T:null;
  }catch{return null;}
}
const horizon=(expiry:string,decision:string):Horizon|null=>{
  const e=Date.parse(expiry+'T10:00:00Z'),d=Date.parse(decision);
  const days=(e-d)/DAY;
  return days>=1&&days<8?'1W':days>=8&&days<18?'2W':
    days>=18&&days<36?'4W':days>=36&&days<=80?'8W':null;
};
export interface Phase74PredeclaredCausalityPolicy{
  schemaVersion:'ADAPTIVE_PHASE74_RETROSPECTIVE_SOURCE_CAUSALITY_POLICY_V1';
  source:'OWNER_PRESPECIFIED_ASOF_ONLY_NOT_HISTORICAL_CLIENT_TRUST';
  maximumClaimedAsOfQuoteAgeMinutes:number;
  minimumClaimedDisplayedBidDepthLots:number;
  minimumClaimedDisplayedAskDepthLots:number;
  requireTrueContemporaneousSourceCaptureForLiveCausalClaims:true;
  allowRetrospectiveArchiveToImpersonateOriginalClientReceiveAt:false;
}
export interface Phase74Input{
  schemaVersion:'ADAPTIVE_PHASE74_RETRO_ARCHIVE_CAUSAL_DECISION_QUARANTINE_V1';
  source:'OFFLINE_ORIGINAL_L1_SOURCE_CLAIMED_CLOCKS_NOT_CLIENT_RECEIPTS';
  phase73:Phase73Input;
  phase73Pins:Phase73Pins;
  policy:Phase74PredeclaredCausalityPolicy;
}
export interface Phase74Pins{
  schemaVersion:'INDEPENDENT_PHASE74_ORIGINAL_ASOF_REPLAY_NONTRUST_PINS_V1';
  expectedPhase73InputSha256:string;
  expectedPhase73PinsSha256:string;
  expectedPolicySha256:string;
  expectedOriginalOosDecisions:number;
  expectedOriginalNoEntryDays:number;
  expectedOriginallyListedCePePairs:number;
  expectedOriginalNoEntryListedPairs:number;
  expectedOriginalNativeL1QuoteRows:number;
}
export interface Phase74Cell{
  claimedRegime:string;
  horizon:Horizon;
  optionType:OptionSide;
  originallyListedDecisionContractPairs:number;
  originallyNoEntryPairs:number;
  originallyEntryClaimedPairs:number;
  pairsWithClaimedAsOfL1BidAndAskBeforeDecision:number;
  pairsWithNoClaimedAsOfL1AtDecision:number;
  pairsWithQuoteEventAtOrBeforeDecisionButClaimedArrivalAfter:number;
  pairsWithFirstPostDecisionOptionQuote:number;
  pairsWhoseArchiveWasAcquiredAfterOriginalDecision:number;
  externallyVerifiedOriginalClientCapturePairs:0;
  decisionTimeAccessViaRetrospectivePackageProven:false;
  originalNoEntryNotAnActualBrokerPosition:true;
  quotesAreNotExecutedFills:true;
  fullPaidLongPremiumDebitLossStillPossible:true;
  indexTargetPointsNotEquivalentToOptionPremiumPoints:true;
}
export interface Phase74Report{
  mode:'OFFLINE_RETROSPECTIVE_L1_VERSUS_ORIGINAL_CAUSAL_DECISION_REPLAY';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_NO_CLAIMED_ASOF_QUOTES_RETROSPECTIVE_ONLY'|
    'DESCRIPTIVE_CLAIMED_ASOF_MARKS_BUT_CLIENT_CLOCK_UNVERIFIED';
  reasonCodes:string[];
  phase73Status:Phase73Report['status']|null;
  syntheticDataset:boolean|null;
  originalOosDecisionDays:number;
  originalNoEntryDays:number;
  originalListedCePePairs:number;
  originalNoEntryListedPairs:number;
  originalNativeL1QuoteRows:number;
  allSourceRowsInArchiveClaimedPriorToRetrospectiveReceipt:number;
  originallyListedPairsWithClaimedAsOfL1BidAndAsk:number;
  originallyListedPairsWithNoClaimedAsOfL1AtDecision:number;
  originallyListedPairsWithQuoteEventBeforeDecisionButAvailableLater:number;
  originallyListedPairsWithFirstPostDecisionQuote:number;
  originallyListedPairsWhoseArchiveReceivedAfterDecision:number;
  originalClientTimeReceiptsIndependentlyVerified:0;
  realOriginalExchangeClientMarketDataRightsVerified:false;
  officialExchangeContractExpiryAndSessionsVerified:false;
  originalSourceAvailableAtFromHistoricalFileNotTrusted:true;
  receiptOfBulkArchiveAfterDecisionCannotProveThenAvailable:true;
  retrospectiveResearchOnlyAfterRealLicenceAndSourceAuthentication:true;
  genuineCausalEntryBacktestFromThisPackageAuthorized:false;
  actualEntrySelectionOrExecutableOptionFillProven:false;
  originalNoEntryAlternativeWasNeverAnExecutedPosition:true;
  independentlyProvenMultiRegimeFullDurationReturns:false;
  index100PointGoalCannotBeInferredFromOptionL1Alone:true;
  fullLongOptionPaidPremiumLossRiskEliminated:false;
  bestOneToEightWeekExpiryAuthorized:false;
  brokerNrmlGttStopChildExchangeAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  cells:Phase74Cell[];
  externalEvidenceRequired:string[];
}
const NEED=[
  'GENUINELY_LICENSED_AUTHENTIC_NATIVE_OPTION_L1_SOURCE_AND_OUT_OF_BAND_VENDOR_IDENTITY',
  'ORIGINAL_CONTEMPORANEOUS_STRATEGY_SIDE_CLIENT_RECEIPT_PROVENANCE_IF_CAPTURED',
  'AUTHENTICATED_OFFICIAL_HISTORICAL_FO_CONTRACT_EXPIRY_TRADING_DAY_AND_LOT_MASTER',
  'COMPLETE_ORIGINAL_CE_PE_1W_2W_4W_8W_INTRADAY_AND_OVERNIGHT_MARKS',
  'REAL_UNTOUCHED_MULTICYCLE_OOS_AND_OPTION_IV_THETA_SPREAD_GAP_SLIPPAGE_FULL_DEBIT_STRESS',
  'BROKER_NRML_NATIVE_STOP_GTT_CHILD_EXCHANGE_ACK_AND_GAP_NONFILL'
];
function blank():Phase74Report{
  return {
    mode:'OFFLINE_RETROSPECTIVE_L1_VERSUS_ORIGINAL_CAUSAL_DECISION_REPLAY',
    status:'INVALID_EVIDENCE',reasonCodes:[],phase73Status:null,
    syntheticDataset:null,originalOosDecisionDays:0,
    originalNoEntryDays:0,originalListedCePePairs:0,
    originalNoEntryListedPairs:0,originalNativeL1QuoteRows:0,
    allSourceRowsInArchiveClaimedPriorToRetrospectiveReceipt:0,
    originallyListedPairsWithClaimedAsOfL1BidAndAsk:0,
    originallyListedPairsWithNoClaimedAsOfL1AtDecision:0,
    originallyListedPairsWithQuoteEventBeforeDecisionButAvailableLater:0,
    originallyListedPairsWithFirstPostDecisionQuote:0,
    originallyListedPairsWhoseArchiveReceivedAfterDecision:0,
    originalClientTimeReceiptsIndependentlyVerified:0,
    realOriginalExchangeClientMarketDataRightsVerified:false,
    officialExchangeContractExpiryAndSessionsVerified:false,
    originalSourceAvailableAtFromHistoricalFileNotTrusted:true,
    receiptOfBulkArchiveAfterDecisionCannotProveThenAvailable:true,
    retrospectiveResearchOnlyAfterRealLicenceAndSourceAuthentication:true,
    genuineCausalEntryBacktestFromThisPackageAuthorized:false,
    actualEntrySelectionOrExecutableOptionFillProven:false,
    originalNoEntryAlternativeWasNeverAnExecutedPosition:true,
    independentlyProvenMultiRegimeFullDurationReturns:false,
    index100PointGoalCannotBeInferredFromOptionL1Alone:true,
    fullLongOptionPaidPremiumLossRiskEliminated:false,
    bestOneToEightWeekExpiryAuthorized:false,
    brokerNrmlGttStopChildExchangeAckVerified:false,
    executionAuthorized:false,productionSafe:false,nativeOrderInstruction:null,
    cells:[],externalEvidenceRequired:NEED
  };
}
const fail=(reason:string,status:Phase74Report['status']='INVALID_EVIDENCE',
  fields?:Partial<Phase74Report>):Phase74Report=>({
  ...blank(),...fields,status,reasonCodes:[reason]
});
type Quote={
  event:number;claimedArrival:number;bid:number;ask:number;
  bidQty:number;askQty:number
};
function validPolicy(p:Phase74PredeclaredCausalityPolicy):boolean{
  return !!p&&p.schemaVersion===
      'ADAPTIVE_PHASE74_RETROSPECTIVE_SOURCE_CAUSALITY_POLICY_V1'&&
    p.source==='OWNER_PRESPECIFIED_ASOF_ONLY_NOT_HISTORICAL_CLIENT_TRUST'&&
    integer(p.maximumClaimedAsOfQuoteAgeMinutes,1,60)&&
    integer(p.minimumClaimedDisplayedBidDepthLots,1,100)&&
    integer(p.minimumClaimedDisplayedAskDepthLots,1,100)&&
    p.requireTrueContemporaneousSourceCaptureForLiveCausalClaims===true&&
    p.allowRetrospectiveArchiveToImpersonateOriginalClientReceiveAt===false;
}
export function auditPhase74RetrospectiveCausalReplay(
  input:Phase74Input,pins:Phase74Pins
):Phase74Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE74_RETRO_ARCHIVE_CAUSAL_DECISION_QUARANTINE_V1'||
    input.source!==
      'OFFLINE_ORIGINAL_L1_SOURCE_CLAIMED_CLOCKS_NOT_CLIENT_RECEIPTS'||
    !input.phase73||!input.phase73Pins||!validPolicy(input.policy)||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE74_ORIGINAL_ASOF_REPLAY_NONTRUST_PINS_V1'||
    ![pins.expectedPhase73InputSha256,
      pins.expectedPhase73PinsSha256,pins.expectedPolicySha256].every(x=>
      typeof x==='string'&&SHA.test(x))||
    hashPhase74Evidence(input.phase73)!==pins.expectedPhase73InputSha256||
    hashPhase74Evidence(input.phase73Pins)!==pins.expectedPhase73PinsSha256||
    hashPhase74Evidence(input.policy)!==pins.expectedPolicySha256||
    !integer(pins.expectedOriginalOosDecisions,2,100000)||
    !integer(pins.expectedOriginalNoEntryDays,0,100000)||
    !integer(pins.expectedOriginallyListedCePePairs,8,2000000)||
    !integer(pins.expectedOriginalNoEntryListedPairs,1,2000000)||
    !integer(pins.expectedOriginalNativeL1QuoteRows,1,10000000))
    return fail('PHASE74_ORIGINAL_RETRO_ARCHIVE_OR_PRESPECIFIED_CAUSAL_PINS_INVALID');
  let parent:Phase73Report;
  try{
    parent=auditPhase73HistoricalSourceReadiness(
      input.phase73,input.phase73Pins);
  }catch{return fail('PHASE73_SOURCE_RIGHTS_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE');}
  const partial:Partial<Phase74Report>={
    phase73Status:parent.status,syntheticDataset:parent.syntheticDataset
  };
  if(!parent.status.startsWith('DESCRIPTIVE_')||
    parent.originalOosDecisions!==pins.expectedOriginalOosDecisions||
    parent.originalNoEntryDays!==pins.expectedOriginalNoEntryDays||
    parent.originalAllListedCePePairs!==pins.expectedOriginallyListedCePePairs||
    parent.originalL1QuoteRows!==pins.expectedOriginalNativeL1QuoteRows)
    return fail('PHASE73_COMPLETE_ORIGINAL_OOS_SOURCE_NOT_READY',
      'INCOMPLETE_EVIDENCE',partial);
  const vendor=input.phase73.phase72.phase71.phase70.phase69.phase68
      .phase67.originalVendor;
  const csvBytes=decode(vendor.newVendorNativeL1CsvBase64,50_000_000),
    catalogBytes=decode(vendor.newVendorFullListedCatalogBase64,25_000_000),
    acquisitionBytes=decode(input.phase73.claimedSourceIntakeRawBase64,
      1_000_000);
  if(!csvBytes||!catalogBytes||!acquisitionBytes)
    return fail('PHASE74_ORIGINAL_QUOTE_CATALOG_ACQUISITION_BYTES_MISSING',
      'INCOMPLETE_EVIDENCE',partial);
  const catalog=parse<Phase66OriginalCatalog>(catalogBytes),
    acquisition=parse<Phase73ClaimedSourceIntake>(acquisitionBytes),
    rows=parseOriginalNativeL1Csv(csvBytes);
  if(!catalog||!acquisition||!rows||
    !Array.isArray(catalog.decisions))
    return fail('PHASE74_ORIGINAL_LISTED_COHORT_OR_L1_SOURCE_UNREADABLE',
      'INCOMPLETE_EVIDENCE',partial);
  const archiveReceipt=Date.parse(acquisition.claimedArchiveReceivedAt);
  if(!Number.isFinite(archiveReceipt))
    return fail('PHASE74_RETROSPECTIVE_ARCHIVE_RECEIPT_NOT_A_TIME',
      'INCOMPLETE_EVIDENCE',partial);
  const indexed=new Map<string,Quote[]>();
  let priorSourceRows=0;
  for(const row of rows.slice(1)){
    const quote:Quote={
      event:Date.parse(row[3]),
      claimedArrival:Date.parse(row[4]),
      bid:Number(row[5]),ask:Number(row[6]),
      bidQty:Number(row[7]),askQty:Number(row[8])
    };
    if(!Number.isFinite(quote.event)||
      !Number.isFinite(quote.claimedArrival)||
      quote.event>quote.claimedArrival||
      ![quote.bid,quote.ask,quote.bidQty,quote.askQty]
        .every(Number.isFinite))
      return fail('PHASE74_ORIGINAL_L1_QUOTE_CLOCK_OR_PRICE_INVALID',
        'INCOMPLETE_EVIDENCE',partial);
    if(quote.claimedArrival<archiveReceipt)priorSourceRows++;
    const a=indexed.get(row[2])??[];
    a.push(quote);indexed.set(row[2],a);
  }
  const cells=new Map<string,Phase74Cell>();
  let pairs=0,noEntry=0,asOf=0,notAsOf=0,
    eventEarlyButArrivalLate=0,postDecision=0,retroPairs=0;
  for(const decision of catalog.decisions){
    const dec=Date.parse(decision.decisionAt);
    if(!Number.isFinite(dec))
      return fail('PHASE74_ORIGINAL_DECISION_TIME_MISSING',
        'INCOMPLETE_EVIDENCE',partial);
    for(const c of decision.originallyListedContracts){
      const h=horizon(c.expiry,decision.decisionAt);
      if(!h)return fail('PHASE74_ORIGINAL_DECISION_EXPIRY_HORIZON_INVALID',
        'INCOMPLETE_EVIDENCE',partial);
      const key=[decision.claimedRegime,h,c.optionType].join('|');
      let cell=cells.get(key);
      if(!cell){
        cell={
          claimedRegime:decision.claimedRegime,horizon:h,
          optionType:c.optionType,
          originallyListedDecisionContractPairs:0,
          originallyNoEntryPairs:0,originallyEntryClaimedPairs:0,
          pairsWithClaimedAsOfL1BidAndAskBeforeDecision:0,
          pairsWithNoClaimedAsOfL1AtDecision:0,
          pairsWithQuoteEventAtOrBeforeDecisionButClaimedArrivalAfter:0,
          pairsWithFirstPostDecisionOptionQuote:0,
          pairsWhoseArchiveWasAcquiredAfterOriginalDecision:0,
          externallyVerifiedOriginalClientCapturePairs:0,
          decisionTimeAccessViaRetrospectivePackageProven:false,
          originalNoEntryNotAnActualBrokerPosition:true,
          quotesAreNotExecutedFills:true,
          fullPaidLongPremiumDebitLossStillPossible:true,
          indexTargetPointsNotEquivalentToOptionPremiumPoints:true
        };
        cells.set(key,cell);
      }
      pairs++;cell.originallyListedDecisionContractPairs++;
      if(decision.originalEntryDisposition==='NO_ENTRY'){
        noEntry++;cell.originallyNoEntryPairs++;
      }else cell.originallyEntryClaimedPairs++;
      const q=indexed.get(c.instrumentKey)??[];
      const claimedAsOf=q.some(x=>
        x.event<=dec&&x.claimedArrival<=dec&&
        dec-x.claimedArrival<=
          input.policy.maximumClaimedAsOfQuoteAgeMinutes*MINUTE&&
        x.bidQty>=c.lotSize*
          input.policy.minimumClaimedDisplayedBidDepthLots&&
        x.askQty>=c.lotSize*
          input.policy.minimumClaimedDisplayedAskDepthLots&&
        x.bid>0&&x.ask>=x.bid);
      if(claimedAsOf){
        asOf++;cell.pairsWithClaimedAsOfL1BidAndAskBeforeDecision++;
      }else{
        notAsOf++;cell.pairsWithNoClaimedAsOfL1AtDecision++;
      }
      if(q.some(x=>x.event<=dec&&x.claimedArrival>dec)){
        eventEarlyButArrivalLate++;
        cell.pairsWithQuoteEventAtOrBeforeDecisionButClaimedArrivalAfter++;
      }
      if(q.some(x=>x.claimedArrival>dec)){
        postDecision++;cell.pairsWithFirstPostDecisionOptionQuote++;
      }
      if(archiveReceipt>dec){
        retroPairs++;cell.pairsWhoseArchiveWasAcquiredAfterOriginalDecision++;
      }
    }
  }
  const fields:Partial<Phase74Report>={
    ...partial,originalOosDecisionDays:catalog.decisions.length,
    originalNoEntryDays:catalog.decisions.filter(d=>
      d.originalEntryDisposition==='NO_ENTRY').length,
    originalListedCePePairs:pairs,originalNoEntryListedPairs:noEntry,
    originalNativeL1QuoteRows:rows.length-1,
    allSourceRowsInArchiveClaimedPriorToRetrospectiveReceipt:priorSourceRows,
    originallyListedPairsWithClaimedAsOfL1BidAndAsk:asOf,
    originallyListedPairsWithNoClaimedAsOfL1AtDecision:notAsOf,
    originallyListedPairsWithQuoteEventBeforeDecisionButAvailableLater:
      eventEarlyButArrivalLate,
    originallyListedPairsWithFirstPostDecisionQuote:postDecision,
    originallyListedPairsWhoseArchiveReceivedAfterDecision:retroPairs,
    cells:[...cells.values()]
  };
  if(pairs!==pins.expectedOriginallyListedCePePairs||
    noEntry!==pins.expectedOriginalNoEntryListedPairs||
    fields.originalOosDecisionDays!==pins.expectedOriginalOosDecisions||
    fields.originalNoEntryDays!==pins.expectedOriginalNoEntryDays||
    fields.originalNativeL1QuoteRows!==pins.expectedOriginalNativeL1QuoteRows||
    retroPairs!==pairs||asOf+notAsOf!==pairs||
    [...cells.values()].reduce((n,c)=>
      n+c.originallyListedDecisionContractPairs,0)!==pairs)
    return fail('PHASE74_FROZEN_ORIGINAL_OOS_NO_ENTRY_OR_ARCHIVE_CAUSALITY_DISAGREES',
      'INCOMPLETE_EVIDENCE',fields);
  return {...blank(),...fields,
    status:asOf===0?
      'DESCRIPTIVE_NO_CLAIMED_ASOF_QUOTES_RETROSPECTIVE_ONLY':
      'DESCRIPTIVE_CLAIMED_ASOF_MARKS_BUT_CLIENT_CLOCK_UNVERIFIED',
    reasonCodes:[
      asOf===0?
        'NO_ORIGINAL_LISTED_PAIR_HAS_CLAIMED_AVAILABLE_ASOF_BID_ASK_AT_DECISION':
        'CLAIMED_ASOF_QUOTES_EXIST_BUT_NO_ACTUAL_STRATEGY_RECEIPT_PROVEN',
      eventEarlyButArrivalLate?
        'QUOTE_EVENT_AT_OR_BEFORE_DECISION_BUT_CLAIMED_ARRIVAL_AFTER_DECISION':
        'NO_EVENT_BEFORE_DECISION_CLAIMED_ARRIVAL_LOOKAHEAD_DETECTED',
      'BULK_ARCHIVE_DELIVERED_AFTER_ALL_ORIGINAL_DECISIONS',
      'RETROSPECTIVE_SOURCE_RECEIPT_NOT_ORIGINAL_TRADING_CLIENT_CAPTURE',
      'REAL_VENDOR_LICENCE_OFFICIAL_CALENDAR_ENTRIES_FILLS_PROFIT_STOP_ACK_UNVERIFIED'
    ]};
}
