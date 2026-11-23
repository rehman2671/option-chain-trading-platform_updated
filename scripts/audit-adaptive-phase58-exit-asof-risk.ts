/**
 * Phase58 owner-private no-egress original source exit availability audit.
 * No broker, orders, GTT, exchange API, option source fetch or new trades.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase58MatchedOriginalExitAvailability,
  type Phase58Input,type Phase58IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase58MatchedExitAsOf.js';
const flag=(name:string):string|null=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(p:string|null,max:number):p is string{
  if(!p||!isAbsolute(p)||p.includes('\0')||p.length>1300)return false;
  try{
    const x=resolve(p),d=dirname(x),f=lstatSync(x),folder=lstatSync(d);
    return f.isFile()&&!f.isSymbolicLink()&&
      folder.isDirectory()&&!folder.isSymbolicLink()&&
      realpathSync(x)===x&&realpathSync(d)===d&&
      f.size>50&&f.size<=max&&
      (f.mode&0o077)===0&&(folder.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&folder.uid===process.getuid()));
  }catch{return false;}
}
const inputPath=flag('--private-phase58-original-holding-path'),
  pinsPath=flag('--private-phase58-independent-exit-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(inputPath,25_000_000)||
  !privateFile(pinsPath,1_000_000)){
  console.error('PHASE58_PRIVATE_OOS_SOURCE_HOLD_CALENDAR_AND_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase58-exit-asof-risk.ts --approve-isolated-offline-review --private-phase58-original-holding-path <OWNER_0600_JSON> --private-phase58-independent-exit-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(inputPath,'utf8')) as Phase58Input,
      pins=JSON.parse(readFileSync(pinsPath,'utf8')) as Phase58IndependentPins;
    const result=auditPhase58MatchedOriginalExitAvailability(input,pins);
    console.log(JSON.stringify({
      mode:result.mode,status:result.status,
      reasonCodes:result.reasonCodes,
      syntheticDataset:result.syntheticDataset,
      phase57Status:result.phase57Status,
      phase8ExitStatus:result.phase8ExitStatus,
      originalOosSessions:result.originalOosSessions,
      fullOriginalArmHorizonAttempts:result.fullOriginalArmHorizonAttempts,
      observedOriginalEntries:result.observedOriginalEntries,
      fullyAvailabilityAuditedAndPricedExitEntries:
        result.fullyAvailabilityAuditedAndPricedExitEntries,
      missingOriginalSelectedEntryL1Attempts:
        result.missingOriginalSelectedEntryL1Attempts,
      censoredOrUnpricedExitEntries:result.censoredOrUnpricedExitEntries,
      invalidOrNoncausalOriginalQuoteAvailabilityPaths:
        result.invalidOrNoncausalOriginalQuoteAvailabilityPaths,
      observedAdverseOvernightBidGapTransitions:
        result.observedAdverseOvernightBidGapTransitions,
      originalPhase8OvernightGapTriggers:
        result.originalPhase8OvernightGapTriggers,
      originalLicensedOptionL1Authenticated:
        result.originalLicensedOptionL1Authenticated,
      independentlyVerifiedSessionExpiryCalendar:
        result.independentlyVerifiedSessionExpiryCalendar,
      brokerMarketOrderFillOrStopAckVerified:
        result.brokerMarketOrderFillOrStopAckVerified,
      stopTriggerGuaranteedToLimitLoss:result.stopTriggerGuaranteedToLimitLoss,
      historicalReturnForecastOrProfitableRankingProven:
        result.historicalReturnForecastOrProfitableRankingProven,
      liveNrmlOrderAuthorized:result.liveNrmlOrderAuthorized,
      productionSafe:result.productionSafe,
      nativeOrderInstruction:result.nativeOrderInstruction
    },null,2));
    if(!result.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE58_PRIVATE_ORIGINAL_HOLD_PATH_REVIEW_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
