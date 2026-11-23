/**
 * Phase60 manual owner-private OOS contract-duration evidence review.
 * Offline only, no broker, no network, no live order/GTT/NRML execution.
 * Redacts raw option instrument keys, quotes, source identities and paths.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase60HorizonRegimeSufficiency,
  type Phase60Input,type Phase60IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase60HorizonRegimeEvidenceSufficiency.js';
const flag=(name:string):string|null=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function ownerFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const p=resolve(s),dir=dirname(p),
      f=lstatSync(p),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(dir)===dir&&
      f.size>64&&f.size<=max&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const original=flag('--private-phase60-original-market-coverage'),
  pinsPath=flag('--independent-phase60-fold-and-coverage-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerFile(original,25_000_000)||
  !ownerFile(pinsPath,1_000_000)){
  console.error('PHASE60_PRIVATE_ORIGINAL_OOS_AND_COVERAGE_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase60-regime-duration-evidence.ts --approve-isolated-offline-review --private-phase60-original-market-coverage <OWNER_0600_JSON> --independent-phase60-fold-and-coverage-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(original,'utf8')) as Phase60Input;
    const pins=JSON.parse(readFileSync(pinsPath,'utf8')) as
      Phase60IndependentPins;
    const r=auditPhase60HorizonRegimeSufficiency(input,pins);
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase59Status:r.phase59Status,syntheticDataset:r.syntheticDataset,
      originalOosDecisionDays:r.originalOosDecisionDays,
      originalOosFolds:r.originalOosFolds,
      originalOosCalendarSpanDays:r.originalOosCalendarSpanDays,
      originalDistinctDecisionTimeRegimes:
        r.originalDistinctDecisionTimeRegimes,
      fullOriginalDecisionArmHorizonAttempts:
        r.fullOriginalDecisionArmHorizonAttempts,
      originalObservedEntries:r.originalObservedEntries,
      distinctOriginalSourcePathsAcrossArms:
        r.distinctOriginalSourcePathsAcrossArms,
      totalPerRegimeArmHorizonCells:r.totalPerRegimeArmHorizonCells,
      predeclaredCoverageQualifiedCells:
        r.predeclaredCoverageQualifiedCells,
      insufficientEvidenceCells:r.insufficientEvidenceCells,
      originalExpiryWindowOrHoldBufferMismatches:
        r.originalExpiryWindowOrHoldBufferMismatches,
      originalPremiumReversalObservations:
        r.originalPremiumReversalObservations,
      originalNextOpenGapOrDebitAlerts:r.originalNextOpenGapOrDebitAlerts,
      bestContractExpiryOrHorizonRankingAuthorized:
        r.bestContractExpiryOrHorizonRankingAuthorized,
      independentlyLicensedNseBseOptionL1Verified:
        r.independentlyLicensedNseBseOptionL1Verified,
      unbiasedUntouchedHistoricalProfitabilityProven:
        r.unbiasedUntouchedHistoricalProfitabilityProven,
      brokerNrmlStopOrGttAcknowledged:r.brokerNrmlStopOrGttAcknowledged,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE60_PRIVATE_OOS_DURATION_RESEARCH_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
