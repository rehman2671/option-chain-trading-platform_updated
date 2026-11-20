/**
 * Phase66 — STANDALONE offline candidate historical option L1 preflight.
 *
 * Unlike Phase65, a new candidate vendor dataset is NOT required to match
 * the OLD synthetic Phase50-65 original source. Vendor acquisition begins
 * with separately preserved source CSV, its own complete listed CE/PE
 * decision catalog, sessions, predeclared untouched folds and OOS manifest.
 * No historical strategy executions are invented or re-bound automatically.
 *
 * Phase22 strict native CSV parser reused unchanged. All data, source time,
 * decision-time regime labels, claimed contracts and rights are operator
 * supplied; passing proves only internal completeness, NOT external vendor
 * identity, license, official expiry, trustworthy client receipt, profitability
 * or broker NRML stop/GTT safety.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {parseOriginalNativeL1Csv}
  from './adaptiveNativeL1CsvBridge.js';

const SHA=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const NUMBER=/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const MS_DAY=86400000,MS_MIN=60000,IST=330*MS_MIN;
const HORIZONS=['1W','2W','4W','8W'] as const;
type Horizon=typeof HORIZONS[number];
type OptionType='CE'|'PE';
export type Phase66ClaimedRegime=
  'TREND'|'RANGE'|'VOLATILE'|'MIXED'|'UNCLASSIFIED';
const HEADER=[
  'sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'
] as const;
const sha=(bytes:Uint8Array):string=>createHash('sha256')
  .update(bytes).digest('hex');
export const hashPhase66Evidence=(x:unknown):string=>sha(
  Buffer.from(JSON.stringify(x),'utf8'));
const integer=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const finite=(x:unknown,min:number,max:number):x is number=>
  typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const timestamp=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
const date=(s:unknown):number=>
  typeof s==='string'&&DATE.test(s)?Date.parse(s+'T00:00:00Z'):NaN;
const dayIst=(t:number):string=>new Date(t+IST).toISOString().slice(0,10);
const bucket=(days:number):Horizon|null=>
  days>=1&&days<8?'1W':days>=8&&days<18?'2W':
  days>=18&&days<36?'4W':days>=36&&days<=80?'8W':null;
function decode(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||!s.length||
    s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const raw=Buffer.from(s,'base64');
    return raw.length>16&&raw.length<=max&&
      raw.toString('base64')===s?raw:null;
  }catch{return null;}
}
function json<T>(bytes:Buffer):T|null{
  try{
    const v=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
    return v&&typeof v==='object'&&!Array.isArray(v)?v as T:null;
  }catch{return null;}
}
export interface Phase66OriginalFold{
  foldId:string;
  trainingStart:string;
  trainingEnd:string;
  testStart:string;
  testEnd:string;
}
export interface Phase66ListedContract{
  instrumentKey:string;
  optionType:OptionType;
  expiry:string;
  strikePrice:number;
  lotSize:number;
}
export interface Phase66OriginalDecision{
  sessionDate:string;
  decisionAt:string;
  claimedRegime:Phase66ClaimedRegime;
  originalEntryDisposition:'NO_ENTRY'|'ENTRY_CLAIMED';
  /** Entire candidate option universe, not just selected entry contracts. */
  originallyListedContracts:Phase66ListedContract[];
}
export interface Phase66OriginalCatalog{
  schemaVersion:'ADAPTIVE_PHASE66_NEW_VENDOR_ORIGINAL_OOS_CATALOG_V1';
  source:'OWNER_DECLARED_POINT_IN_TIME_CONTRACT_UNIVERSE_UNVERIFIED';
  folds:Phase66OriginalFold[];
  decisions:Phase66OriginalDecision[];
}
export interface Phase66Session{
  sessionDate:string;
  openAt:string;
  closeAt:string;
}
export interface Phase66Calendar{
  schemaVersion:'ADAPTIVE_PHASE66_NEW_VENDOR_DECLARED_SESSION_CALENDAR_V1';
  source:'OWNER_DECLARED_EXCHANGE_SESSIONS_UNVERIFIED';
  sessions:Phase66Session[];
}
export interface Phase66PrespecifiedPolicy{
  schemaVersion:'ADAPTIVE_PHASE66_NEW_VENDOR_PREDECLARED_OOS_QUALITY_POLICY_V1';
  source:'OWNER_PREREGISTERED_THRESHOLDS_UNVERIFIED';
  minimumIndependentTestFolds:number;
  minimumDistinctClaimedRegimes:number;
  minimumDecisionDatesPerClaimedRegime:number;
  maximumHoldCalendarDays:number;
  minimumTrainToFirstTestEmbargoCalendarDays:number;
  minimumOriginalQuotesDecisionToClose:number;
  maximumOriginalDecisionToCloseQuoteGapMinutes:number;
  minimumOriginalQuotesFirstNextOpen:number;
  firstNextOpenWindowMinutes:number;
  maximumOriginalBidAskSpreadPercent:number;
  minimumDisplayedBidAndAskLots:number;
  maximumClaimedEventToClientArrivalLagSeconds:number;
}
export interface Phase66NewVendorDelivery{
  schemaVersion:'ADAPTIVE_PHASE66_UNVERIFIED_NEW_VENDOR_DELIVERY_V1';
  claimedVendorProductReference:string;
  claimedLicenseReference:string;
  sourceCategory:'ORIGINAL_BEST_BID_ASK_DEPTH'|'TRADE_ONLY'|
    'EOD'|'RECONSTRUCTED_L1';
  claimedResearchLicenseScope:'INDEX_OPTION_L1_HISTORICAL_RESEARCH'|
    'UNVERIFIED_RIGHTS'|'NO_RESEARCH_RIGHTS';
  claimedClientReceiveClock:
    'CLAIMED_ORIGINAL_CLIENT_CLOCK_UNVERIFIED'|
    'LATER_HISTORICAL_DOWNLOAD_NO_ORIGINAL_CLIENT_CLOCK'|
    'REPLAY_AS_ORIGINAL_RECEIPT';
  declaredDatasetKind:'SYNTHETIC_FIXTURE'|
    'OWNER_SUPPLIED_MARKET_CANDIDATE_UNVERIFIED';
  deliveredAt:string;
  treatDownloadTimeAsOriginalAvailableAt:false;
}
export interface Phase66Input{
  schemaVersion:'ADAPTIVE_PHASE66_STANDALONE_VENDOR_L1_PREFLIGHT_V1';
  source:'NEW_OWNER_PRIVATE_VENDOR_CANDIDATE_UNVERIFIED';
  newVendorNativeL1CsvBase64:string;
  newVendorFullListedCatalogBase64:string;
  newVendorSessionCalendarBase64:string;
  claimedResearchEntitlementBytesBase64:string;
  delivery:Phase66NewVendorDelivery;
  policy:Phase66PrespecifiedPolicy;
}
export interface Phase66IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE66_NEW_VENDOR_SOURCE_AND_OOS_PINS_V1';
  expectedNewNativeCsvBytesSha256:string;
  expectedNewFullListedCatalogBytesSha256:string;
  expectedNewSessionCalendarBytesSha256:string;
  expectedClaimedEntitlementBytesSha256:string;
  expectedDeliveryDeclarationSha256:string;
  expectedPrespecifiedPolicySha256:string;
  /** Preserved before auditing option premium outcomes. */
  expectedOriginalOosDecisionAndFullListedManifestSha256:string;
  expectedNativeQuoteRows:number;
  expectedOriginalOosDecisions:number;
  expectedAllListedOosCePeContractPairs:number;
}
export interface Phase66CoverageCell{
  claimedRegime:Phase66ClaimedRegime;
  horizon:Horizon;
  optionType:OptionType;
  originalListedOosPairs:number;
  internallyCoveredPairs:number;
  missingPreCloseQuotePairs:number;
  missingFirstNextOpenPairs:number;
  excessiveQuoteGapPairs:number;
  excessiveSpreadPairs:number;
  missingDisplayedDepthPairs:number;
  lateOrNoncausalClaimedAvailableAtPairs:number;
  originalDecisionDaysWithContracts:number;
  sampleCannotAuthorizeTrade:true;
}
export interface Phase66Report{
  mode:'STANDALONE_NEW_VENDOR_ALL_LISTED_OOS_L1_PREFLIGHT';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_COVERAGE_INSUFFICIENT_UNVERIFIED'|
    'DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED';
  reasonCodes:string[];
  declaredSyntheticDataset:boolean|null;
  originalOosDecisionDays:number;
  originalIndependentTestFolds:number;
  distinctClaimedRegimes:number;
  noEntryOriginalOosDecisionDays:number;
  originalListedCePeHorizonPairs:number;
  nativeOriginalQuoteRows:number;
  originalListedPairsMeetingPrespecifiedSourceCoverage:number;
  originalListedPairsWithMissingSourceCoverage:number;
  quoteInstrumentsInOriginalListedCatalog:number;
  sourceQuoteInstrumentsUnknownToOriginalCatalog:number;
  declaredCalendarSessions:number;
  allFourHorizonBothCePePerDecisionPreserved:boolean;
  predeclaredEmbargoAndUntouchedFoldIsolationSatisfied:boolean;
  claimedClientSourceClockIndependentlyTrusted:false;
  independentlyVerifiedHistoricalL1ResearchLicence:false;
  independentlyAuthenticatedExchangeVendorProduct:false;
  officialContractExpiryMasterVerified:false;
  officialExchangeSessionCalendarVerified:false;
  historicalDataDownloadProvesPastStrategyReceipt:false;
  externallyVerifiedMarketRegimesAndStatisticalOosEdge:false;
  actualSourceBidAskIsExecutableFillProof:false;
  independentlyCalibratedIvThetaAndOvernightLoss:false;
  bestExpiryContractOrStrategyAuthorized:false;
  brokerNativeNrmlStopAndGttAckVerified:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  cells:Phase66CoverageCell[];
  externalEvidenceRequired:string[];
}
const NEED=[
  'ACTUAL_EXCHANGE_OR_LICENSED_VENDOR_ARCHIVE_PROVENANCE_AND_PRODUCT_IDENTIFICATION',
  'EXTERNAL_LEGAL_VERIFICATION_OF_INDEX_OPTION_HISTORICAL_L1_RESEARCH_RIGHTS',
  'INDEPENDENT_OFFICIAL_EXPIRY_LOT_AND_SESSION_MARKET_MASTER',
  'CONTEMPORANEOUS_STRATEGY_SIDE_CLIENT_RECEIPT_CLOCK_NOT_HISTORICAL_DOWNLOAD',
  'UNTOUCHED_MULTI_MARKET_CYCLE_OOS_AND_REGIME_LABELS_DERIVED_FROM_CAUSAL_DATA',
  'SOURCE_LIQUIDITY_SPREAD_SLIPPAGE_IV_THETA_AND_ZERO_RECOVERY_GAP_STRESS',
  'BROKER_NATIVE_NRML_GTT_STOP_CHILD_ORDER_EXCHANGE_ACK_AND_CANCEL_REPLACE_EVIDENCE'
];
function empty():Phase66Report{
  return {
    mode:'STANDALONE_NEW_VENDOR_ALL_LISTED_OOS_L1_PREFLIGHT',
    status:'INVALID_EVIDENCE',reasonCodes:[],declaredSyntheticDataset:null,
    originalOosDecisionDays:0,originalIndependentTestFolds:0,
    distinctClaimedRegimes:0,noEntryOriginalOosDecisionDays:0,
    originalListedCePeHorizonPairs:0,nativeOriginalQuoteRows:0,
    originalListedPairsMeetingPrespecifiedSourceCoverage:0,
    originalListedPairsWithMissingSourceCoverage:0,
    quoteInstrumentsInOriginalListedCatalog:0,
    sourceQuoteInstrumentsUnknownToOriginalCatalog:0,
    declaredCalendarSessions:0,
    allFourHorizonBothCePePerDecisionPreserved:false,
    predeclaredEmbargoAndUntouchedFoldIsolationSatisfied:false,
    claimedClientSourceClockIndependentlyTrusted:false,
    independentlyVerifiedHistoricalL1ResearchLicence:false,
    independentlyAuthenticatedExchangeVendorProduct:false,
    officialContractExpiryMasterVerified:false,
    officialExchangeSessionCalendarVerified:false,
    historicalDataDownloadProvesPastStrategyReceipt:false,
    externallyVerifiedMarketRegimesAndStatisticalOosEdge:false,
    actualSourceBidAskIsExecutableFillProof:false,
    independentlyCalibratedIvThetaAndOvernightLoss:false,
    bestExpiryContractOrStrategyAuthorized:false,
    brokerNativeNrmlStopAndGttAckVerified:false,
    executionAuthorized:false,productionSafe:false,
    nativeOrderInstruction:null,cells:[],externalEvidenceRequired:NEED
  };
}
const fail=(reason:string,status:Phase66Report['status']='INVALID_EVIDENCE',
  part?:Partial<Phase66Report>):Phase66Report=>({
  ...empty(),...part,status,reasonCodes:[reason]
});
function goodPolicy(p:Phase66PrespecifiedPolicy):boolean{
  return !!p&&p.schemaVersion===
    'ADAPTIVE_PHASE66_NEW_VENDOR_PREDECLARED_OOS_QUALITY_POLICY_V1'&&
    p.source==='OWNER_PREREGISTERED_THRESHOLDS_UNVERIFIED'&&
    integer(p.minimumIndependentTestFolds,2,20)&&
    integer(p.minimumDistinctClaimedRegimes,2,4)&&
    integer(p.minimumDecisionDatesPerClaimedRegime,2,1000)&&
    integer(p.maximumHoldCalendarDays,1,80)&&
    integer(p.minimumTrainToFirstTestEmbargoCalendarDays,1,365)&&
    p.minimumTrainToFirstTestEmbargoCalendarDays>=
      p.maximumHoldCalendarDays&&
    integer(p.minimumOriginalQuotesDecisionToClose,2,500)&&
    integer(p.maximumOriginalDecisionToCloseQuoteGapMinutes,1,60)&&
    integer(p.minimumOriginalQuotesFirstNextOpen,1,100)&&
    integer(p.firstNextOpenWindowMinutes,1,120)&&
    finite(p.maximumOriginalBidAskSpreadPercent,0.01,30)&&
    integer(p.minimumDisplayedBidAndAskLots,1,100)&&
    integer(p.maximumClaimedEventToClientArrivalLagSeconds,0,300);
}
function goodDelivery(d:Phase66NewVendorDelivery):boolean{
  return !!d&&d.schemaVersion===
      'ADAPTIVE_PHASE66_UNVERIFIED_NEW_VENDOR_DELIVERY_V1'&&
    Object.keys(d).length===9&&
    ID.test(d.claimedVendorProductReference??'')&&
    ID.test(d.claimedLicenseReference??'')&&
    d.sourceCategory==='ORIGINAL_BEST_BID_ASK_DEPTH'&&
    (d.claimedResearchLicenseScope===
      'INDEX_OPTION_L1_HISTORICAL_RESEARCH'||
      d.claimedResearchLicenseScope==='UNVERIFIED_RIGHTS')&&
    (d.claimedClientReceiveClock===
      'CLAIMED_ORIGINAL_CLIENT_CLOCK_UNVERIFIED'||
      d.claimedClientReceiveClock===
      'LATER_HISTORICAL_DOWNLOAD_NO_ORIGINAL_CLIENT_CLOCK')&&
    (d.declaredDatasetKind==='SYNTHETIC_FIXTURE'||
      d.declaredDatasetKind==='OWNER_SUPPLIED_MARKET_CANDIDATE_UNVERIFIED')&&
    d.treatDownloadTimeAsOriginalAvailableAt===false&&
    Number.isFinite(timestamp(d.deliveredAt));
}
export function originalPhase66DecisionManifest(
  catalog:Phase66OriginalCatalog
):string[]{
  const values:string[]=[];
  for(const f of catalog.folds){
    values.push('FOLD|'+[
      f.foldId,f.trainingStart,f.trainingEnd,f.testStart,f.testEnd
    ].join('|'));
  }
  for(const d of catalog.decisions){
    values.push('DECISION|'+[
      d.sessionDate,d.decisionAt,d.claimedRegime,d.originalEntryDisposition
    ].join('|'));
    for(const c of d.originallyListedContracts)
      values.push('LISTED|'+[
        d.sessionDate,d.decisionAt,c.instrumentKey,c.optionType,
        c.expiry,c.strikePrice,c.lotSize
      ].join('|'));
  }
  return values;
}
type L1={
  id:string;seq:number;instrument:string;event:number;arrival:number;
  bid:number;ask:number;bidQty:number;askQty:number
};
const k=(regime:Phase66ClaimedRegime,h:Horizon,type:OptionType)=>
  [regime,h,type].join('|');
const flagCount=(r:Phase66CoverageCell,flags:{
  pre:boolean;post:boolean;gap:boolean;spread:boolean;depth:boolean;
  arrival:boolean
}):void=>{
  if(flags.pre)r.missingPreCloseQuotePairs++;
  if(flags.post)r.missingFirstNextOpenPairs++;
  if(flags.gap)r.excessiveQuoteGapPairs++;
  if(flags.spread)r.excessiveSpreadPairs++;
  if(flags.depth)r.missingDisplayedDepthPairs++;
  if(flags.arrival)r.lateOrNoncausalClaimedAvailableAtPairs++;
};
export function auditPhase66StandaloneVendorPreflight(
  input:Phase66Input,pins:Phase66IndependentPins
):Phase66Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE66_STANDALONE_VENDOR_L1_PREFLIGHT_V1'||
    input.source!=='NEW_OWNER_PRIVATE_VENDOR_CANDIDATE_UNVERIFIED'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE66_NEW_VENDOR_SOURCE_AND_OOS_PINS_V1'||
    !goodPolicy(input.policy)||!goodDelivery(input.delivery)||
    ![pins.expectedNewNativeCsvBytesSha256,
      pins.expectedNewFullListedCatalogBytesSha256,
      pins.expectedNewSessionCalendarBytesSha256,
      pins.expectedClaimedEntitlementBytesSha256,
      pins.expectedDeliveryDeclarationSha256,
      pins.expectedPrespecifiedPolicySha256,
      pins.expectedOriginalOosDecisionAndFullListedManifestSha256
    ].every(x=>typeof x==='string'&&SHA.test(x))||
    pins.expectedDeliveryDeclarationSha256!==hashPhase66Evidence(input.delivery)||
    pins.expectedPrespecifiedPolicySha256!==hashPhase66Evidence(input.policy)||
    !integer(pins.expectedNativeQuoteRows,1,300000)||
    !integer(pins.expectedOriginalOosDecisions,2,50000)||
    !integer(pins.expectedAllListedOosCePeContractPairs,8,2000000))
    return fail('PHASE66_NEW_VENDOR_SOURCE_POLICY_OR_INDEPENDENT_PINS_INVALID');
  const csv=decode(input.newVendorNativeL1CsvBase64,50_000_000),
    cat=decode(input.newVendorFullListedCatalogBase64,25_000_000),
    cal=decode(input.newVendorSessionCalendarBase64,10_000_000),
    licence=decode(input.claimedResearchEntitlementBytesBase64,1_000_000);
  if(!csv||!cat||!cal||!licence)
    return fail('PHASE66_VENDOR_SOURCE_CATALOG_SESSION_OR_ENTITLEMENT_BYTES_MISSING');
  if(sha(csv)!==pins.expectedNewNativeCsvBytesSha256||
    sha(cat)!==pins.expectedNewFullListedCatalogBytesSha256||
    sha(cal)!==pins.expectedNewSessionCalendarBytesSha256||
    sha(licence)!==pins.expectedClaimedEntitlementBytesSha256)
    return fail('PHASE66_NEW_VENDOR_SOURCE_BYTES_NOT_INDEPENDENTLY_PINNED');
  const catalog=json<Phase66OriginalCatalog>(cat),
    calendar=json<Phase66Calendar>(cal);
  if(!catalog||!calendar||
    catalog.schemaVersion!=='ADAPTIVE_PHASE66_NEW_VENDOR_ORIGINAL_OOS_CATALOG_V1'||
    catalog.source!=='OWNER_DECLARED_POINT_IN_TIME_CONTRACT_UNIVERSE_UNVERIFIED'||
    calendar.schemaVersion!==
      'ADAPTIVE_PHASE66_NEW_VENDOR_DECLARED_SESSION_CALENDAR_V1'||
    calendar.source!=='OWNER_DECLARED_EXCHANGE_SESSIONS_UNVERIFIED'||
    !Array.isArray(catalog.folds)||!Array.isArray(catalog.decisions)||
    !Array.isArray(calendar.sessions))
    return fail('PHASE66_NEW_VENDOR_CATALOG_OR_CALENDAR_SCHEMA_INVALID');
  if(hashPhase66Evidence(originalPhase66DecisionManifest(catalog))!==
      pins.expectedOriginalOosDecisionAndFullListedManifestSha256)
    return fail('PHASE66_ORIGINAL_OOS_FOLDS_DECISIONS_OR_LISTED_OPTIONS_CHANGED',
      'INCOMPLETE_EVIDENCE');
  if(catalog.folds.length>100||catalog.decisions.length>100000||
    calendar.sessions.length>100000||
    catalog.folds.length===0||catalog.decisions.length===0||
    calendar.sessions.length===0)
    return fail('PHASE66_VENDOR_SOURCE_CATALOG_OR_SESSION_SIZE_INVALID');
  const seenFolds=new Set<string>();
  let earliestTest=Infinity,priorTestEnd=-Infinity;
  for(const f of catalog.folds){
    const trainStart=date(f.trainingStart),trainEnd=date(f.trainingEnd),
      testStart=date(f.testStart),testEnd=date(f.testEnd);
    if(!ID.test(f.foldId??'')||seenFolds.has(f.foldId)||
      ![trainStart,trainEnd,testStart,testEnd].every(Number.isFinite)||
      trainStart>trainEnd||testStart>testEnd||
      trainEnd+input.policy.minimumTrainToFirstTestEmbargoCalendarDays*
        MS_DAY>=testStart||testStart<=priorTestEnd)
      return fail('PHASE66_ORIGINAL_OOS_FOLD_OVERLAP_OR_HOLD_EMBARGO_INVALID',
        'INCOMPLETE_EVIDENCE');
    earliestTest=Math.min(earliestTest,testStart);
    priorTestEnd=testEnd;
    seenFolds.add(f.foldId);
  }
  if(catalog.folds.some(f=>date(f.trainingEnd)+
        input.policy.minimumTrainToFirstTestEmbargoCalendarDays*MS_DAY>=
        earliestTest))
    return fail('PHASE66_FUTURE_OOS_TEST_DATA_ENTERED_ANOTHER_TRAINING_FOLD',
      'INCOMPLETE_EVIDENCE');
  const sessionMap=new Map<string,Phase66Session>();
  let priorClose=-Infinity;
  for(const s of calendar.sessions){
    const open=timestamp(s.openAt),close=timestamp(s.closeAt);
    if(!Number.isFinite(date(s.sessionDate))||
      !Number.isFinite(open)||!Number.isFinite(close)||
      dayIst(open)!==s.sessionDate||dayIst(close)!==s.sessionDate||
      open>=close||open<=priorClose||sessionMap.has(s.sessionDate))
      return fail('PHASE66_DECLARED_SESSIONS_OVERLAP_OR_HAVE_INVALID_CLOCKS',
        'INCOMPLETE_EVIDENCE');
    priorClose=close;sessionMap.set(s.sessionDate,s);
  }
  const rows=parseOriginalNativeL1Csv(csv);
  if(!rows||rows[0]?.length!==9||
    HEADER.some((h,i)=>rows[0][i]!==h)||
    rows.length!==pins.expectedNativeQuoteRows+1)
    return fail('PHASE66_STRICT_NATIVE_L1_COLUMNS_OR_ORIGINAL_DENOMINATOR_INVALID',
      'INCOMPLETE_EVIDENCE');
  const allQuotes=new Map<string,L1[]>();
  const recordIds=new Set<string>(),ordered=new Map<string,L1>();
  let lastEvent=-Infinity,lastGlobalArrival=-Infinity,firstEvent=Infinity,
    latestEvent=-Infinity,quotedRows=0;
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(r.length!==9||!ID.test(r[0])||!NUMBER.test(r[1])||
      ![r[5],r[6],r[7],r[8]].every(x=>NUMBER.test(x))||
      !Number.isFinite(timestamp(r[3]))||
      !Number.isFinite(timestamp(r[4])))
      return fail('PHASE66_ORIGINAL_L1_ROW_SCHEMA_OR_UTC_CLOCK_INVALID',
        'INCOMPLETE_EVIDENCE');
    const q:L1={
      id:r[0],seq:Number(r[1]),instrument:r[2],
      event:timestamp(r[3]),arrival:timestamp(r[4]),
      bid:Number(r[5]),ask:Number(r[6]),
      bidQty:Number(r[7]),askQty:Number(r[8])
    };
    if(!integer(q.seq,1,300000)||q.seq!==i||
      !ID.test(q.instrument)||recordIds.has(q.id)||
      !finite(q.bid,0.01,1e9)||!finite(q.ask,0.01,1e9)||
      q.ask<=q.bid||!integer(q.bidQty,0,1e9)||
      !integer(q.askQty,0,1e9)||q.arrival<q.event)
      return fail('PHASE66_L1_SOURCE_SEQUENCE_OR_SPREAD_QUANTITY_INVALID',
        'INCOMPLETE_EVIDENCE');
    const previous=ordered.get(q.instrument);
    if(previous&&(q.event<=previous.event||q.arrival<previous.arrival))
      return fail('PHASE66_ORIGINAL_QUOTE_EVENT_OR_RECEIPT_REORDERED',
        'INCOMPLETE_EVIDENCE');
    ordered.set(q.instrument,q);
    recordIds.add(q.id);
    const arr=allQuotes.get(q.instrument)??[];
    arr.push(q);allQuotes.set(q.instrument,arr);
    firstEvent=Math.min(firstEvent,q.event);
    latestEvent=Math.max(latestEvent,q.event);
    // File order across different instruments is not assumed to be
    // globally chronological, unlike strict per-instrument chronology.
    lastEvent=q.event;lastGlobalArrival=q.arrival;
    quotedRows++;
  }
  if(timestamp(input.delivery.deliveredAt)<latestEvent)
    return fail('PHASE66_ARCHIVE_DELIVERED_BEFORE_ITS_ORIGINAL_QUOTE_EVENTS',
      'INCOMPLETE_EVIDENCE');
  const decisionsByRegime=new Map<Phase66ClaimedRegime,Set<string>>();
  const seenDecisions=new Set<string>();
  const knownContracts=new Map<string,Phase66ListedContract>();
  const coverageCells=new Map<string,Phase66CoverageCell>();
  const cellDays=new Map<string,Set<string>>();
  let allPairs=0,covered=0,noEntries=0;
  let goodUniverse=true;
  for(const d of catalog.decisions){
    const decisionAt=timestamp(d.decisionAt),decisionDay=date(d.sessionDate);
    const foldMatches=catalog.folds.filter(f=>
      decisionDay>=date(f.testStart)&&decisionDay<=date(f.testEnd));
    const decisionKey=d.sessionDate+'|'+d.decisionAt;
    if(!Number.isFinite(decisionAt)||!Number.isFinite(decisionDay)||
      dayIst(decisionAt)!==d.sessionDate||foldMatches.length!==1||
      seenDecisions.has(decisionKey)||
      !['TREND','RANGE','VOLATILE','MIXED','UNCLASSIFIED'].includes(d.claimedRegime)||
      !['NO_ENTRY','ENTRY_CLAIMED'].includes(d.originalEntryDisposition)||
      !Array.isArray(d.originallyListedContracts)||
      d.originallyListedContracts.length>1000)
      return fail('PHASE66_ORIGINAL_TEST_DECISION_OR_REGIME_CATALOG_INVALID',
        'INCOMPLETE_EVIDENCE');
    seenDecisions.add(decisionKey);
    const regime=d.claimedRegime;
    const rd=decisionsByRegime.get(regime)??new Set<string>();
    rd.add(d.sessionDate);decisionsByRegime.set(regime,rd);
    if(d.originalEntryDisposition==='NO_ENTRY')noEntries++;
    const session=sessionMap.get(d.sessionDate);
    const next=calendar.sessions.find(s=>s.sessionDate>d.sessionDate);
    if(!session||!next||decisionAt<timestamp(session.openAt)||
      decisionAt>timestamp(session.closeAt))
      return fail('PHASE66_ORIGINAL_TEST_SESSION_OR_NEXT_OPEN_NOT_DECLARED',
        'INCOMPLETE_EVIDENCE');
    const allSides=new Set<string>(),listedOnce=new Set<string>();
    for(const c of d.originallyListedContracts){
      allPairs++;
      const expiry=date(c.expiry);
      const daysToExpiry=(expiry+10*3600000-decisionAt)/MS_DAY;
      const horizon=bucket(daysToExpiry);
      if(!ID.test(c.instrumentKey??'')||
        !['CE','PE'].includes(c.optionType)||
        !Number.isFinite(expiry)||!horizon||
        !finite(c.strikePrice,1,1e9)||
        !integer(c.lotSize,1,100000)||
        listedOnce.has(c.instrumentKey))
        return fail('PHASE66_ORIGINAL_LISTED_CE_PE_EXPIRY_LOT_INVALID',
          'INCOMPLETE_EVIDENCE');
      listedOnce.add(c.instrumentKey);
      allSides.add(horizon+'|'+c.optionType);
      const previous=knownContracts.get(c.instrumentKey);
      if(previous&&JSON.stringify(previous)!==JSON.stringify(c))
        return fail('PHASE66_ORIGINAL_LISTED_INSTRUMENT_REASSIGNED_CONTRACT',
          'INCOMPLETE_EVIDENCE');
      knownContracts.set(c.instrumentKey,c);
      const group=k(regime,horizon,c.optionType);
      let cell=coverageCells.get(group);
      if(!cell){
        cell={
          claimedRegime:regime,horizon,optionType:c.optionType,
          originalListedOosPairs:0,internallyCoveredPairs:0,
          missingPreCloseQuotePairs:0,missingFirstNextOpenPairs:0,
          excessiveQuoteGapPairs:0,excessiveSpreadPairs:0,
          missingDisplayedDepthPairs:0,
          lateOrNoncausalClaimedAvailableAtPairs:0,
          originalDecisionDaysWithContracts:0,
          sampleCannotAuthorizeTrade:true
        };
        coverageCells.set(group,cell);
      }
      cell.originalListedOosPairs++;
      const ds=cellDays.get(group)??new Set<string>();
      ds.add(d.sessionDate);cellDays.set(group,ds);
      const instrumentQuotes=allQuotes.get(c.instrumentKey)??[];
      const close=timestamp(session.closeAt),openNext=timestamp(next.openAt);
      const firstWindowEnd=openNext+
        input.policy.firstNextOpenWindowMinutes*MS_MIN;
      const pre=instrumentQuotes.filter(q=>
        q.event>=decisionAt&&q.event<=close);
      const post=instrumentQuotes.filter(q=>
        q.event>=openNext&&q.event<=firstWindowEnd);
      const flags={
        pre:pre.length<input.policy.minimumOriginalQuotesDecisionToClose,
        post:post.length<input.policy.minimumOriginalQuotesFirstNextOpen,
        gap:false,spread:false,depth:false,arrival:false
      };
      const times=[decisionAt,...pre.map(q=>q.event),close];
      flags.gap=times.slice(1).some((v,i)=>v-times[i]>
        input.policy.maximumOriginalDecisionToCloseQuoteGapMinutes*MS_MIN);
      const checked=[...pre,...post];
      let lastArrival=-Infinity;
      for(const q of checked){
        if((q.ask-q.bid)/q.ask*100>
            input.policy.maximumOriginalBidAskSpreadPercent)
          flags.spread=true;
        if(q.bidQty<c.lotSize*input.policy.minimumDisplayedBidAndAskLots||
          q.askQty<c.lotSize*input.policy.minimumDisplayedBidAndAskLots)
          flags.depth=true;
        const latestAllowed=q.event<=close?close:firstWindowEnd;
        if(q.arrival<q.event||
          q.arrival-q.event>
            input.policy.maximumClaimedEventToClientArrivalLagSeconds*1000||
          q.arrival>latestAllowed||q.arrival<lastArrival)
          flags.arrival=true;
        lastArrival=q.arrival;
      }
      flagCount(cell,flags);
      if(!Object.values(flags).some(Boolean)){
        cell.internallyCoveredPairs++;covered++;
      }
    }
    if(allSides.size!==8)goodUniverse=false;
  }
  const absent=Array.from(allQuotes.keys()).filter(
    key=>!knownContracts.has(key)).length;
  const output=[...coverageCells.values()].map(cell=>({
    ...cell,originalDecisionDaysWithContracts:
      cellDays.get(k(cell.claimedRegime,cell.horizon,cell.optionType))?.size??0
  }));
  const partial:Partial<Phase66Report>={
    declaredSyntheticDataset:
      input.delivery.declaredDatasetKind==='SYNTHETIC_FIXTURE',
    originalOosDecisionDays:seenDecisions.size,
    originalIndependentTestFolds:catalog.folds.length,
    distinctClaimedRegimes:decisionsByRegime.size,
    noEntryOriginalOosDecisionDays:noEntries,
    originalListedCePeHorizonPairs:allPairs,
    nativeOriginalQuoteRows:quotedRows,
    originalListedPairsMeetingPrespecifiedSourceCoverage:covered,
    originalListedPairsWithMissingSourceCoverage:allPairs-covered,
    quoteInstrumentsInOriginalListedCatalog:knownContracts.size,
    sourceQuoteInstrumentsUnknownToOriginalCatalog:absent,
    declaredCalendarSessions:calendar.sessions.length,
    allFourHorizonBothCePePerDecisionPreserved:goodUniverse,
    predeclaredEmbargoAndUntouchedFoldIsolationSatisfied:true,
    cells:output
  };
  if(quotedRows!==pins.expectedNativeQuoteRows||
    seenDecisions.size!==pins.expectedOriginalOosDecisions||
    allPairs!==pins.expectedAllListedOosCePeContractPairs||
    !goodUniverse||absent>0)
    return fail('PHASE66_ALL_ORIGINAL_OOS_DECISIONS_OPTION_PAIRS_OR_SOURCE_DENOMINATOR_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  if(covered!==allPairs)
    return fail('PHASE66_CANDIDATE_L1_SPREAD_DEPTH_CADENCE_OR_FIRST_OPEN_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',partial);
  const rich= catalog.folds.length>=
      input.policy.minimumIndependentTestFolds&&
    [...decisionsByRegime.entries()].filter(
      ([regime,days])=>regime!=='UNCLASSIFIED'&&
        days.size>=input.policy.minimumDecisionDatesPerClaimedRegime)
      .length>=input.policy.minimumDistinctClaimedRegimes;
  if(!rich)
    return {...empty(),...partial,
      status:'DESCRIPTIVE_COVERAGE_INSUFFICIENT_UNVERIFIED',
      reasonCodes:['INSUFFICIENT_UNTOUCHED_FOLDS_OR_CLAIMED_REGIME_OOS_DAYS']};
  return {...empty(),...partial,
    status:'DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED',
    reasonCodes:[
      'FULL_NEW_CANDIDATE_ORIGINAL_OOS_CE_PE_L1_COVERAGE_INTERNAL_ONLY',
      'NEW_CANDIDATE_NEVER_AUTOMATICALLY_REPLACES_PHASE50_65_SOURCE',
      'LICENSE_VENDOR_SOURCE_CLOCK_OFFICIAL_CONTRACTS_AND_STATISTICAL_EDGE_UNVERIFIED'
    ]};
}
