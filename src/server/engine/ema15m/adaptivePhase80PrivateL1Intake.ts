/**
 * Phase80 — OWNER-PRIVATE, offline bridge from independently pinned original
 * market-data source files to Phase79's all-listed option premium-path audit.
 *
 * No vendor network access, no broker, no ingestion into production, no orders.
 * This module treats source declarations and hashes as OPERATOR CLAIMS,
 * not authenticated licences, client receipts, exchange calendars or fills.
 */
import {createHash} from 'node:crypto';
import {constants,closeSync,fstatSync,lstatSync,openSync,readFileSync,
  realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve,sep} from 'node:path';
import {
  auditPhase79OriginalPremiumPathCoverage,hashPhase79Object,
  type Phase79Input,type Phase79Pins,type Phase79Report
} from './adaptivePhase79OriginalPremiumPathCoverage.js';

const SHA=/^[a-f0-9]{64}$/;
const CATEGORIES=['NATIVE_OPTION_BEST_BID_ASK_DEPTH','TRADE_ONLY',
  'END_OF_DAY','RECONSTRUCTED_QUOTES'] as const;
const REGIMES=['TREND','RANGE','VOLATILE','MIXED','UNCLASSIFIED'] as const;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const stamp=(v:unknown):boolean=>typeof v==='string'&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&
  Number.isFinite(Date.parse(v));
const isMode=(v:unknown):v is Phase80SourceDeclaration['claimedAcquisitionMode']=>
  v==='RETROSPECTIVE_ARCHIVE'||v==='CONTEMPORANEOUS_CAPTURE'||v==='UNKNOWN';

export interface Phase80SourceDeclaration{
  schemaVersion:'PHASE80_PRIVATE_ORIGINAL_VENDOR_SOURCE_DECLARATION_V1';
  source:'OWNER_SUPPLIED_VENDOR_AND_LEGAL_RIGHTS_UNVERIFIED';
  datasetKind:'SYNTHETIC_FIXTURE'|'UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE';
  claimedSourceCategory:typeof CATEGORIES[number];
  claimedAcquisitionMode:'RETROSPECTIVE_ARCHIVE'|'CONTEMPORANEOUS_CAPTURE'|'UNKNOWN';
  claimedOfflineResearchRight:'OWNER_ASSERTS_LOCAL_RESEARCH_ALLOWED'|
    'RIGHTS_UNKNOWN_OR_NOT_GRANTED';
  /** Claimed package delivery is NOT the historical original client clock. */
  claimedArchiveDeliveredAt:string;
  originalClientReceiptClockIndependentlyVerified:false;
  genuineVendorAndResearchGrantIndependentlyVerified:false;
  officialExchangeCalendarIndependentlyVerified:false;
  brokerStopOrFillIndependentlyVerified:false;
  permittedToSendLiveTradingOrders:false;
}
export interface Phase80Input{
  schemaVersion:'PHASE80_PRIVATE_FILE_BACKED_L1_REVIEW_V1';
  sourceDeclaration:Phase80SourceDeclaration;
  phase79:Phase79Input;
}
export interface Phase80Pins{
  schemaVersion:'PHASE80_SEPARATE_OFFLINE_SOURCE_AND_OOS_PINS_V1';
  expectedSourceDeclarationSha256:string;
  phase79:Phase79Pins;
}
export interface Phase80Report{
  mode:'PHASE80_OWNER_PRIVATE_ORIGINAL_L1_COVERAGE_REVIEW_ONLY';
  status:'REJECTED_PRIVATE_EVIDENCE'|'BLOCKED_SOURCE_SCOPE'|
    'DESCRIPTIVE_RETROSPECTIVE_ONLY_NO_ORIGINAL_CLIENT_CAUSAL_PROOF'|
    'DESCRIPTIVE_CLAIMED_COVERAGE_NOT_AUTHENTICATED';
  reasonCodes:string[];
  phase79Status:Phase79Report['status']|null;
  syntheticDataset:boolean|null;
  originalDecisionDates:number;
  originalNoEntryDecisions:number;
  originallyListedPairs:number;
  originallyNoEntryPairs:number;
  parsedNativeQuoteRows:number;
  entryPairsMissingClaimedAsOfAsk:number;
  entryPairsWithUnmarketableDecisionBid:number;
  entryPairsWithDecisionSpreadAtLeastArmingGain:number;
  entryPairsWithObservedIlliquidBidUpdate:number;
  entryCandidateStaleLateQuoteObservationsIgnored:number;
  quotedUnderTargetPremiumGivebackPairs:number;
  quotedNextOpenGapThroughTrailPairs:number;
  entryPairsMissingBoundedNextOpenAfterNewArmedPeak:number;
  listedPairsWithMissingDeclaredSessionCloseBid:number;
  originalPairsWithPotentialUndeclaredWeekdays:number;
  potentialUndeclaredWeekdayObservations:number;
  claimedAcquisitionIsRetrospective:boolean|null;
  sourceCategoryIsOriginalNativeL1:boolean|null;
  /** Never include original CSV, tokens, date-level record IDs or vendor name. */
  claimedRegimeCells:Array<{
    claimedRegime:typeof REGIMES[number];horizon:'1W'|'2W'|'4W'|'8W';
    side:'CE'|'PE';originalListedPairs:number;originalNoEntryPairs:number;
    entryClaimedPairsMissingCausalQuotedAsk:number;
    entryClaimedPairsWithUnmarketableDecisionBid:number;
    entryClaimedPairsWithDecisionSpreadAtLeastArmingGain:number;
    entryClaimedPairsWithObservedIlliquidBidUpdate:number;
    entryCandidateStaleLateQuoteObservationsIgnored:number;
    entryClaimedPairsWithUnderTargetQuotedGiveback:number;
    entryClaimedPairsMissingBoundedNextOpenAfterNewArmedPeak:number;
    originalPairsCensoredByMissingSessionCloseBid:number;
    originalPairsWithPotentialUndeclaredWeekdays:number;
    potentialUndeclaredWeekdayObservations:number;
  }>;
  sourceLicenceOrVendorIndependentlyVerified:false;
  originalStrategyClientReceiptProofVerified:false;
  retrospectiveReceiptIsNotOriginalHistoricalClientClock:true;
  officialExchangeFOMasterVerified:false;
  actualOptionEntryOrExitFillVerified:false;
  optionStopOrGttNativeExchangeAckVerified:false;
  fullPaidLongOptionPremiumDebitMayBeLost:true;
  realMultiCycleOosProfitabilityProven:false;
  canRankOrBuyOneToEightWeekContracts:false;
  sourceFilesMayNeverBePublishedInRepository:true;
  existingMis1515Unchanged:true;
  forced1515NrmlExit:false;
  nativeOrderInstruction:null;
  executionAuthorized:false;
  productionSafe:false;
}
function base():Phase80Report{
  return {
    mode:'PHASE80_OWNER_PRIVATE_ORIGINAL_L1_COVERAGE_REVIEW_ONLY',
    status:'REJECTED_PRIVATE_EVIDENCE',reasonCodes:[],phase79Status:null,
    syntheticDataset:null,originalDecisionDates:0,originalNoEntryDecisions:0,
    originallyListedPairs:0,originallyNoEntryPairs:0,parsedNativeQuoteRows:0,
    entryPairsMissingClaimedAsOfAsk:0,
    entryPairsWithUnmarketableDecisionBid:0,
    entryPairsWithDecisionSpreadAtLeastArmingGain:0,
    entryPairsWithObservedIlliquidBidUpdate:0,
    entryCandidateStaleLateQuoteObservationsIgnored:0,
    quotedUnderTargetPremiumGivebackPairs:0,
    quotedNextOpenGapThroughTrailPairs:0,
    entryPairsMissingBoundedNextOpenAfterNewArmedPeak:0,
    listedPairsWithMissingDeclaredSessionCloseBid:0,
    originalPairsWithPotentialUndeclaredWeekdays:0,
    potentialUndeclaredWeekdayObservations:0,
    claimedAcquisitionIsRetrospective:null,
    sourceCategoryIsOriginalNativeL1:null,claimedRegimeCells:[],
    sourceLicenceOrVendorIndependentlyVerified:false,
    originalStrategyClientReceiptProofVerified:false,
    retrospectiveReceiptIsNotOriginalHistoricalClientClock:true,
    officialExchangeFOMasterVerified:false,actualOptionEntryOrExitFillVerified:false,
    optionStopOrGttNativeExchangeAckVerified:false,
    fullPaidLongOptionPremiumDebitMayBeLost:true,
    realMultiCycleOosProfitabilityProven:false,
    canRankOrBuyOneToEightWeekContracts:false,
    sourceFilesMayNeverBePublishedInRepository:true,
    existingMis1515Unchanged:true,forced1515NrmlExit:false,
    nativeOrderInstruction:null,executionAuthorized:false,productionSafe:false
  };
}
const fail=(reason:string,status:Phase80Report['status']='REJECTED_PRIVATE_EVIDENCE'):
  Phase80Report=>({...base(),status,reasonCodes:[reason]});
/** All original universe and market-data identity claims remain unauthenticated. */
export function auditPhase80PrivateOriginalL1(
  input:Phase80Input,pins:Phase80Pins
):Phase80Report{
  if(!input||input.schemaVersion!=='PHASE80_PRIVATE_FILE_BACKED_L1_REVIEW_V1'||
     !input.phase79||!input.sourceDeclaration||!pins||
     pins.schemaVersion!=='PHASE80_SEPARATE_OFFLINE_SOURCE_AND_OOS_PINS_V1'||
     !SHA.test(pins.expectedSourceDeclarationSha256)||!pins.phase79||
     hashPhase79Object(input.sourceDeclaration)!==pins.expectedSourceDeclarationSha256)
    return fail('PHASE80_MISSING_OR_TAMPERED_SOURCE_DECLARATION_AND_PINS');
  const s=input.sourceDeclaration;
  if(s.schemaVersion!=='PHASE80_PRIVATE_ORIGINAL_VENDOR_SOURCE_DECLARATION_V1'||
     s.source!=='OWNER_SUPPLIED_VENDOR_AND_LEGAL_RIGHTS_UNVERIFIED'||
     !['SYNTHETIC_FIXTURE','UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE']
       .includes(s.datasetKind)||
     !CATEGORIES.includes(s.claimedSourceCategory)||!isMode(s.claimedAcquisitionMode)||
     !stamp(s.claimedArchiveDeliveredAt)||
     !['OWNER_ASSERTS_LOCAL_RESEARCH_ALLOWED','RIGHTS_UNKNOWN_OR_NOT_GRANTED']
       .includes(s.claimedOfflineResearchRight)||
     s.originalClientReceiptClockIndependentlyVerified!==false||
     s.genuineVendorAndResearchGrantIndependentlyVerified!==false||
     s.officialExchangeCalendarIndependentlyVerified!==false||
     s.brokerStopOrFillIndependentlyVerified!==false||
     s.permittedToSendLiveTradingOrders!==false||
     s.datasetKind!==input.phase79.datasetKind)
    return fail('PHASE80_UNTRUSTED_SOURCE_DECLARATION_CLAIMS_VERIFIED_DATA');
  if(s.claimedSourceCategory!=='NATIVE_OPTION_BEST_BID_ASK_DEPTH'||
     s.claimedOfflineResearchRight!=='OWNER_ASSERTS_LOCAL_RESEARCH_ALLOWED'||
     s.claimedAcquisitionMode==='UNKNOWN')
    return fail('PHASE80_NON_NATIVE_L1_NO_RESEARCH_RIGHTS_OR_UNKNOWN_ACQUISITION',
      'BLOCKED_SOURCE_SCOPE');
  // Claimed regime names can come from vendor/operator input and MUST NOT
  // become an unbounded free-text sensitive field in the redacted output.
  if(!Array.isArray(input.phase79.originalCatalog?.decisions)||
     !input.phase79.originalCatalog.decisions.every(d=>
       d&&REGIMES.includes(d.claimedRegime)))
    return fail('PHASE80_UNKNOWN_OR_SENSITIVE_REGIME_LABEL');
  if(s.claimedAcquisitionMode==='RETROSPECTIVE_ARCHIVE'&&
     input.phase79.originalCatalog.decisions.some(d=>
       !stamp(d.decisionAt)||Date.parse(d.decisionAt)>=
         Date.parse(s.claimedArchiveDeliveredAt)))
    return fail('PHASE80_RETROSPECTIVE_ARCHIVE_DELIVERY_NOT_AFTER_DECISION');
  const p79=auditPhase79OriginalPremiumPathCoverage(input.phase79,pins.phase79);
  if(!p79.status.startsWith('DESCRIPTIVE_'))
    return {...fail('PHASE80_ORIGINAL_L1_PATH_AUDIT_NOT_COMPLETE',
      'BLOCKED_SOURCE_SCOPE'),phase79Status:p79.status,
      reasonCodes:['PHASE80_ORIGINAL_L1_PATH_AUDIT_NOT_COMPLETE',
        ...p79.reasonCodes]};
  // Even a contemporaneous label is self-asserted. Retrospective historic
  // availability can never become an authenticated original client receipt.
  const retrospective=s.claimedAcquisitionMode==='RETROSPECTIVE_ARCHIVE';
  const cells=p79.cells.map(c=>({
    claimedRegime:c.claimedRegime as typeof REGIMES[number],
    horizon:c.horizon,side:c.side,originalListedPairs:c.originalListedPairs,
    originalNoEntryPairs:c.originalNoEntryPairs,
    entryClaimedPairsMissingCausalQuotedAsk:
      c.entryClaimedPairsMissingCausalQuotedAsk,
    entryClaimedPairsWithUnmarketableDecisionBid:
      c.entryClaimedPairsWithUnmarketableDecisionBid,
    entryClaimedPairsWithDecisionSpreadAtLeastArmingGain:
      c.entryClaimedPairsWithDecisionSpreadAtLeastArmingGain,
    entryClaimedPairsWithObservedIlliquidBidUpdate:
      c.entryClaimedPairsWithObservedIlliquidBidUpdate,
    entryCandidateStaleLateQuoteObservationsIgnored:
      c.entryCandidateStaleLateQuoteObservationsIgnored,
    entryClaimedPairsWithUnderTargetQuotedGiveback:
      c.entryClaimedPairsWithUnderTargetQuotedGiveback,
    entryClaimedPairsMissingBoundedNextOpenAfterNewArmedPeak:
      c.entryClaimedPairsMissingBoundedNextOpenAfterNewArmedPeak,
    originalPairsCensoredByMissingSessionCloseBid:
      c.originalPairsCensoredByMissingSessionCloseBid,
    originalPairsWithPotentialUndeclaredWeekdays:
      c.originalPairsWithPotentialUndeclaredWeekdays,
    potentialUndeclaredWeekdayObservations:
      c.potentialUndeclaredWeekdayObservations
  }));
  return {...base(),
    status:retrospective?
      'DESCRIPTIVE_RETROSPECTIVE_ONLY_NO_ORIGINAL_CLIENT_CAUSAL_PROOF':
      'DESCRIPTIVE_CLAIMED_COVERAGE_NOT_AUTHENTICATED',
    reasonCodes:[
      'OPERATOR_SOURCE_DECLARATION_AND_SHA_PINS_NOT_VENDOR_AUTHENTICATION',
      ...(retrospective?['LATER_ARCHIVE_RECEIPT_CANNOT_RESTORE_CLIENT_DECISION_CLOCK']:
        ['CLAIMED_CONTEMPORANEOUS_CLIENT_RECEIPT_NOT_EXTERNALLY_ATTESTED']),
      ...p79.reasonCodes
    ],phase79Status:p79.status,
    syntheticDataset:p79.syntheticDataset,
    originalDecisionDates:p79.originalDecisionDates,
    originalNoEntryDecisions:p79.originalNoEntryDecisions,
    originallyListedPairs:p79.originallyListedPairs,
    originallyNoEntryPairs:p79.originallyNoEntryPairs,
    parsedNativeQuoteRows:p79.parsedNativeQuoteRows,
    entryPairsMissingClaimedAsOfAsk:p79.entryPairsMissingClaimedAsOfAsk,
    entryPairsWithUnmarketableDecisionBid:
      p79.entryPairsWithUnmarketableDecisionBid,
    entryPairsWithDecisionSpreadAtLeastArmingGain:
      p79.entryPairsWithDecisionSpreadAtLeastArmingGain,
    entryPairsWithObservedIlliquidBidUpdate:
      p79.entryPairsWithObservedIlliquidBidUpdate,
    entryCandidateStaleLateQuoteObservationsIgnored:
      p79.entryCandidateStaleLateQuoteObservationsIgnored,
    quotedUnderTargetPremiumGivebackPairs:p79.quotedUnderTargetPremiumGivebackPairs,
    quotedNextOpenGapThroughTrailPairs:p79.quotedNextOpenGapThroughTrailPairs,
    entryPairsMissingBoundedNextOpenAfterNewArmedPeak:
      p79.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,
    listedPairsWithMissingDeclaredSessionCloseBid:
      p79.listedPairsWithMissingDeclaredSessionCloseBid,
    originalPairsWithPotentialUndeclaredWeekdays:
      p79.originalPairsWithPotentialUndeclaredWeekdays,
    potentialUndeclaredWeekdayObservations:
      p79.potentialUndeclaredWeekdayObservations,
    claimedAcquisitionIsRetrospective:retrospective,
    sourceCategoryIsOriginalNativeL1:true,
    claimedRegimeCells:cells
  };
}

/** Six distinct, mode-0600 files in mode-0700 private directories OUTSIDE repo.
 * This checks local access permissions, not legal entitlement or file origin.
 * OS/container network egress MUST be independently disabled. */
export interface Phase80PrivatePaths{
  nativeCsv:string;catalogJson:string;sessionsJson:string;policyJson:string;
  sourceDeclarationJson:string;independentPinsJson:string;
}
export function readPhase80PrivateFileSet(
  paths:Phase80PrivatePaths,repositoryRoot:string
):{input:Phase80Input;pins:Phase80Pins}{
  const names=['nativeCsv','catalogJson','sessionsJson','policyJson',
    'sourceDeclarationJson','independentPinsJson'] as const;
  const caps=[50*1024*1024,2*1024*1024,2*1024*1024,128*1024,
    128*1024,128*1024];
  const repo=realpathSync(resolve(repositoryRoot));
  const visited=new Set<string>(),identities=new Set<string>();
  const buffers:Buffer[]=[];
  for(let i=0;i<names.length;i++){
    const candidate=paths?.[names[i]];
    if(typeof candidate!=='string'||!isAbsolute(candidate)||
       candidate.length>1500||candidate.includes('\0'))
      throw Error('PHASE80_PRIVATE_ABSOLUTE_FILES_REQUIRED');
    const file=resolve(candidate),parent=dirname(file);
    if(file===repo||file.startsWith(repo+sep)||
       parent===repo||parent.startsWith(repo+sep))
      throw Error('PHASE80_SOURCE_INSIDE_PUBLIC_REPOSITORY');
    const fs=lstatSync(file),ps=lstatSync(parent);
    if(!fs.isFile()||fs.isSymbolicLink()||!ps.isDirectory()||
       ps.isSymbolicLink()||realpathSync(file)!==file||
       realpathSync(parent)!==parent||
       (fs.mode&0o077)!==0||(ps.mode&0o077)!==0||
       fs.size<2||fs.size>caps[i]||
       (typeof process.getuid==='function'&&
         (fs.uid!==process.getuid()||ps.uid!==process.getuid())))
      throw Error('PHASE80_PRIVATE_FILE_PERMISSIONS_OR_SIZE_INVALID');
    const inode=`${fs.dev}:${fs.ino}`;
    if(visited.has(file)||identities.has(inode))
      throw Error('PHASE80_INPUT_FILES_MUST_BE_DISTINCT');
    visited.add(file);identities.add(inode);
    // O_NOFOLLOW + fstat mitigate direct symlink races between lstat/read.
    const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const now=fstatSync(fd);
      if(!now.isFile()||now.ino!==fs.ino||now.dev!==fs.dev||
         now.size!==fs.size||(now.mode&0o077)!==0)
        throw Error('PHASE80_PRIVATE_SOURCE_CHANGED_DURING_OPEN');
      const raw=readFileSync(fd);
      if(raw.length!==fs.size||raw.length>caps[i])
        throw Error('PHASE80_PRIVATE_SOURCE_CHANGED_DURING_READ');
      buffers.push(raw);
    }finally{closeSync(fd);}
  }
  const readJson=(b:Buffer):unknown=>JSON.parse(
    new TextDecoder('utf8',{fatal:true}).decode(b));
  const [csv,catalog,sessions,policy,declaration,pins]=buffers;
  const originalCatalog=readJson(catalog),
    declaredSessions=readJson(sessions),policyObj=readJson(policy),
    sourceDeclaration=readJson(declaration),pinsObj=readJson(pins);
  if(!obj(originalCatalog)||!Array.isArray(declaredSessions)||
     !obj(policyObj)||!obj(sourceDeclaration)||!obj(pinsObj))
    throw Error('PHASE80_MALFORMED_PRIVATE_SOURCE_JSON');
  const s=sourceDeclaration as unknown as Phase80SourceDeclaration;
  return {input:{schemaVersion:'PHASE80_PRIVATE_FILE_BACKED_L1_REVIEW_V1',
      sourceDeclaration:s,phase79:{
        schemaVersion:'PHASE79_OFFLINE_ALL_ORIGINAL_LISTED_PREMIUM_PATH_V1',
        source:'PRIVATE_OPERATOR_SUPPLIED_NATIVE_OPTION_L1_NOT_AUTHENTICATED',
        datasetKind:s.datasetKind,originalNativeL1Csv:csv,
        originalCatalog:originalCatalog as unknown as Phase79Input['originalCatalog'],
        declaredSessions:declaredSessions as Phase79Input['declaredSessions'],
        policy:policyObj as unknown as Phase79Input['policy']
      }},pins:pinsObj as unknown as Phase80Pins};
}
/** Thin runner produces only bounded redacted counters and fixed reason codes. */
export function reviewPhase80OwnerPrivateFiles(
  paths:Phase80PrivatePaths,repositoryRoot:string
):Phase80Report{
  try{
    const {input,pins}=readPhase80PrivateFileSet(paths,repositoryRoot);
    return auditPhase80PrivateOriginalL1(input,pins);
  }catch{
    // Never echo file paths, raw vendor errors, JSON parser text, quotes,
    // account identity or sensitive licensed source bytes.
    return fail('PHASE80_PRIVATE_FILE_ACCESS_OR_PARSE_REJECTED_REDACTED');
  }
}
