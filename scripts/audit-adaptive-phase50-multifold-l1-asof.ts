/**
 * Phase50 owner-private MANUAL OFFLINE multi-fold historical option L1 audit.
 * No HTTP, Upstox order/GTT, login, broker credentials or trading imports.
 * Prints only counts and negative proof flags. No raw market or account data.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase50MultifoldL1AsOfCoverage,
  type Phase50MultifoldInput,type Phase50IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase50MultifoldL1AsOf.js';

const arg=(key:string):string|null=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
function ownerOnlyFile(raw:string|null):raw is string{
  if(!raw||!isAbsolute(raw)||raw.length>1300||raw.includes('\0'))
    return false;
  try{
    const file=resolve(raw),folder=dirname(file),
      f=lstatSync(file),d=lstatSync(folder);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(folder)===folder&&
      f.size>30&&f.size<=25_000_000&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-multifold-original-option-l1'),
  pins=arg('--independent-prespecified-multifold-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerOnlyFile(source)||!ownerOnlyFile(pins)){
  console.error('PHASE50_PRIVATE_OFFLINE_SOURCE_OR_PINS_PRECONDITIONS_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase50-multifold-l1-asof.ts --approve-isolated-offline-review --private-multifold-original-option-l1 <OWNER_0600_JSON> --independent-prespecified-multifold-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase50MultifoldInput;
    const lock=JSON.parse(readFileSync(pins,'utf8')) as Phase50IndependentPins;
    const r=auditPhase50MultifoldL1AsOfCoverage(input,lock);
    // Never print original option instrument, source archive path,
    // quote ticks, account UCC, policy secrets or source document bytes.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      syntheticDataset:r.syntheticDataset,
      oosFoldCount:r.oosFoldCount,distinctOosSessionDays:r.distinctOosSessionDays,
      oosTestDecisionCount:r.oosTestDecisionCount,
      totalDecisionArmHorizonAttempts:r.totalDecisionArmHorizonAttempts,
      originalObservedEntryAttempts:r.originalObservedEntryAttempts,
      missingOriginalSelectedContractEntries:
        r.missingOriginalSelectedContractEntries,
      exactSourceAvailableEntryAttempts:r.exactSourceAvailableEntryAttempts,
      uniqueExactSourceAvailableQuoteObservations:
        r.uniqueExactSourceAvailableQuoteObservations,
      entryUnavailableAtDecisionDeadline:r.entryUnavailableAtDecisionDeadline,
      originalSourceClockInvalidOrUnknown:r.originalSourceClockInvalidOrUnknown,
      originalAvailabilityOrderDisagreements:
        r.originalAvailabilityOrderDisagreements,
      foldArmHorizonCells:r.foldArmHorizonCells,
      originalLicensedL1IndependentlyAuthenticated:
        r.originalLicensedL1IndependentlyAuthenticated,
      vendorHistoricalLicenseIndependentlyVerified:
        r.vendorHistoricalLicenseIndependentlyVerified,
      trueOriginalAvailableAtVerified:r.trueOriginalAvailableAtVerified,
      unbiasedMultiFoldProfitabilityProven:r.unbiasedMultiFoldProfitabilityProven,
      brokerStopAckOrOvernightProtectionVerified:
        r.brokerStopAckOrOvernightProtectionVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!=='DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE50_OFFLINE_ORIGINAL_MARKET_SOURCE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
