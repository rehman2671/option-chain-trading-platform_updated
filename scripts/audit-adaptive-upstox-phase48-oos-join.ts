/**
 * Adaptive Swing v2 Phase48 owner-private MANUAL OFFLINE join.
 *
 * Full original underlying candles, chain snapshots, candidate universe,
 * point-in-time OOS decision attempts and source L1+Greeks are confidential.
 * No broker/API, outbound market access, GTT/order write, scheduler or live
 * research-to-trade promotion. CLI prints only safe aggregated counts.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase48OosEntryRiskCoverage,
  type Phase48EntryRiskJoinInput,type Phase48IndependentPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase48OosRiskJoin.js';

function arg(name:string):string|null{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
}
function owner0600(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.length>1300||p.includes('\0'))
    return false;
  try{
    const file=resolve(p),folder=dirname(file),
      f=lstatSync(file),d=lstatSync(folder);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(folder)===folder&&
      f.size>50&&f.size<=25_000_000&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const original=arg('--private-original-oos-and-greek-risk-archive'),
  pins=arg('--independent-original-oos-entry-join-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !owner0600(original)||!owner0600(pins)){
  console.error('PHASE48_PRIVATE_OFFLINE_ORIGINAL_OOS_JOIN_PRECONDITIONS_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase48-oos-join.ts --approve-isolated-offline-review --private-original-oos-and-greek-risk-archive <OWNER_0600_JSON> --independent-original-oos-entry-join-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(original,'utf8')) as
      Phase48EntryRiskJoinInput;
    const trust=JSON.parse(readFileSync(pins,'utf8')) as
      Phase48IndependentPins;
    const result=auditPhase48OosEntryRiskCoverage(input,trust);
    // Original detailed instrument keys, option quotes, IV/Greeks, strategy
    // decision timestamps, original licensed feed paths and UCC stay private.
    console.log(JSON.stringify({
      mode:result.mode,status:result.status,
      reasonCodes:result.reasonCodes,
      datasetSynthetic:result.datasetSynthetic,
      testDecisionCount:result.testDecisionCount,
      totalDecisionArmHorizonAttempts:
        result.totalDecisionArmHorizonAttempts,
      selectedOosEntries:result.selectedOosEntries,
      selectedEntriesWithOriginalQuotePath:
        result.selectedEntriesWithOriginalQuotePath,
      selectedEntriesWithoutOriginalQuotePath:
        result.selectedEntriesWithoutOriginalQuotePath,
      missingOriginalEntryL1Attempts:
        result.missingOriginalEntryL1Attempts,
      uniqueRiskPathsActuallyMatched:result.uniqueRiskPathsActuallyMatched,
      riskPathsUnmatchedToAnySelectedOosEntry:
        result.riskPathsUnmatchedToAnySelectedOosEntry,
      armHorizonCells:result.armHorizonCells.map(c=>({
        arm:c.arm,horizon:c.horizon,testDecisions:c.testDecisions,
        entryObserved:c.entryObserved,riskPathJoined:c.riskPathJoined,
        missingPointInTimeEntryL1:c.missingPointInTimeEntryL1,
        selectedEntryMissingMatchingOriginalPath:
          c.selectedEntryMissingMatchingOriginalPath
      })),
      originalLicensedL1IndependentlyAuthenticated:
        result.originalLicensedL1IndependentlyAuthenticated,
      chronologicalOosProfitabilityProven:
        result.chronologicalOosProfitabilityProven,
      nativeBrokerStopsInstalled:result.nativeBrokerStopsInstalled,
      protectedOvernight:result.protectedOvernight,
      executionAuthorized:result.executionAuthorized,
      productionSafe:result.productionSafe,
      nativeOrderInstruction:result.nativeOrderInstruction
    },null,2));
    if(result.status!==
      'DESCRIPTIVE_COMPLETE_SELECTED_ENTRY_COVERAGE_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE48_ORIGINAL_OFFLINE_OOS_SOURCE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
