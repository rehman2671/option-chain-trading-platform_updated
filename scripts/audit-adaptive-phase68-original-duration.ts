/**
 * Phase68 owner-private offline multiweek L1 option mark censoring only.
 * Owner must enforce no-network-egress at OS/container level. No broker
 * order, GTT, native stop, positional square-off or remote feed access.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase68OriginalDurationCensoring,
  type Phase68Input,type Phase68IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase68OriginalDurationCensoring.js';
const arg=(key:string)=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
function ownerOnly(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const file=resolve(s),dir=dirname(file),
      f=lstatSync(file),p=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      p.isDirectory()&&!p.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(dir)===dir&&
      f.size>128&&f.size<=max&&
      (f.mode&0o077)===0&&(p.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&p.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-phase68-original-duration-dossier'),
  pinsPath=arg('--independent-phase68-locked-oos-risk-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerOnly(source,210_000_000)||!ownerOnly(pinsPath,2_000_000)){
  console.error('PHASE68_OWNER_ONLY_ORIGINAL_L1_DURATION_DOSSIER_AND_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase68-original-duration.ts --approve-isolated-offline-review --private-phase68-original-duration-dossier <OWNER_0600_JSON> --independent-phase68-locked-oos-risk-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase68Input,
      pins=JSON.parse(readFileSync(pinsPath,'utf8')) as
        Phase68IndependentPins;
    const r=auditPhase68OriginalDurationCensoring(input,pins);
    // Aggregated cell counts only; no quote prices, strike, date, symbol,
    // signed source, expiry, private path, account or vendor entitlement.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase67Status:r.phase67Status,
      syntheticDataset:r.syntheticDataset,
      originalOosDecisionDays:r.originalOosDecisionDays,
      originalOosNoEntryDays:r.originalOosNoEntryDays,
      originalOosEntryClaimedDays:r.originalOosEntryClaimedDays,
      originalListedCePePairs:r.originalListedCePePairs,
      originalLongOptionCandidatePairsWithCensoredHoldingEvidence:
        r.originalLongOptionCandidatePairsWithCensoredHoldingEvidence,
      originalPairsWithEveryDeclaredSessionBidMark:
        r.originalPairsWithEveryDeclaredSessionBidMark,
      originalClaimedEntryAskMarks:r.originalClaimedEntryAskMarks,
      originalNoEntryPairsPreserved:r.originalNoEntryPairsPreserved,
      originalClaimedEntryPairsWithoutEntryAsk:
        r.originalClaimedEntryPairsWithoutEntryAsk,
      claimedEntryPairsWithFirstNextOpenGapAlert:
        r.claimedEntryPairsWithFirstNextOpenGapAlert,
      claimedEntryPairsWithPremiumRunupThenGivebackAlert:
        r.claimedEntryPairsWithPremiumRunupThenGivebackAlert,
      missingDeclaredSessionQuoteMarks:
        r.missingDeclaredSessionQuoteMarks,
      cells:r.cells,
      declaredIssuerCalendarSessionCoverageIsNotIndependentlyComplete:
        r.declaredIssuerCalendarSessionCoverageIsNotIndependentlyComplete,
      underlyingIndex100PointTargetNotTestableFromOptionL1Alone:
        r.underlyingIndex100PointTargetNotTestableFromOptionL1Alone,
      independentlyTrustedHistoricalSourceReceiptClock:
        r.independentlyTrustedHistoricalSourceReceiptClock,
      actualMultiweekPositionExitProven:r.actualMultiweekPositionExitProven,
      independentMultiMarketRegimeProfitabilityEstablished:
        r.independentMultiMarketRegimeProfitabilityEstablished,
      fullPaidDebitLossProtectionProven:
        r.fullPaidDebitLossProtectionProven,
      brokerNativeOvernightNrmlGttStopAckVerified:
        r.brokerNativeOvernightNrmlGttStopAckVerified,
      optimalOneToEightWeekContractRecommendationAuthorized:
        r.optimalOneToEightWeekContractRecommendationAuthorized,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalEvidenceRequired:r.externalEvidenceRequired
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE68_UNVERIFIED_FULL_DURATION_SOURCE_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
