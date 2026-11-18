/**
 * Phase59 owner-private OFFLINE original option L1 cohort downside audit.
 * No network, exchange, broker, order, GTT, stop, or file mutation.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase59MatchedPremiumReversalGap,
  type Phase59Input,type Phase59IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase59PremiumGapCohortJoin.js';
const get=(key:string):string|null=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const p=resolve(s),parent=dirname(p),f=lstatSync(p),
      d=lstatSync(parent);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(parent)===parent&&
      f.size>=64&&f.size<=max&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=get('--private-phase59-original-option-cohort'),
  pinned=get('--independent-phase59-original-source-and-risk-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(source,25_000_000)||!privateFile(pinned,1_000_000)){
  console.error('PHASE59_PRIVATE_ORIGINAL_OOS_AND_INDEPENDENT_POLICY_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase59-premium-gap.ts --approve-isolated-offline-review --private-phase59-original-option-cohort <OWNER_0600_JSON> --independent-phase59-original-source-and-risk-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const original=JSON.parse(readFileSync(source,'utf8')) as Phase59Input,
      pins=JSON.parse(readFileSync(pinned,'utf8')) as
        Phase59IndependentPins;
    const result=auditPhase59MatchedPremiumReversalGap(original,pins);
    // No option instrument keys, original quotes, private paths, or accounts.
    console.log(JSON.stringify({
      mode:result.mode,status:result.status,
      reasonCodes:result.reasonCodes,
      phase58Status:result.phase58Status,
      syntheticDataset:result.syntheticDataset,
      originalOosDecisionSessions:result.originalOosDecisionSessions,
      originalArmHorizonAttempts:result.originalArmHorizonAttempts,
      originalEnteredOptionPaths:result.originalEnteredOptionPaths,
      distinctOriginalOptionEntryPathsAcrossAlternativeArms:
        result.distinctOriginalOptionEntryPathsAcrossAlternativeArms,
      fullyAuditedOriginalPreTriggerBidPaths:
        result.fullyAuditedOriginalPreTriggerBidPaths,
      firstRunupReversalBeforeCandidateTargetCount:
        result.firstRunupReversalBeforeCandidateTargetCount,
      overnightExposedOriginalEntries:result.overnightExposedOriginalEntries,
      exactFirstNextOpenGapRiskPaths:result.exactFirstNextOpenGapRiskPaths,
      originalSourceOrNextOpenCensoredPaths:
        result.originalSourceOrNextOpenCensoredPaths,
      originalPremiumStopOrGapCashBudgetAlerts:
        result.originalPremiumStopOrGapCashBudgetAlerts,
      originalOosArmHorizonDenominatorPreserved:
        result.originalOosArmHorizonDenominatorPreserved,
      originalExchangeL1IndependentlyLicensed:
        result.originalExchangeL1IndependentlyLicensed,
      brokerNativeNrmlStopOrGttAckVerified:
        result.brokerNativeNrmlStopOrGttAckVerified,
      optionBidGuaranteedExecutable:result.optionBidGuaranteedExecutable,
      strategyProfitabilityProven:result.strategyProfitabilityProven,
      executionAuthorized:result.executionAuthorized,
      productionSafe:result.productionSafe,
      nativeOrderInstruction:result.nativeOrderInstruction
    },null,2));
    if(!result.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE59_PRIVATE_ORIGINAL_PREMIUM_GAP_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
