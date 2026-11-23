/**
 * Phase75 owner-private offline WHAT-IF option premium risk arithmetic.
 * It uses handcrafted scenarios, not actual historical option BID fills.
 * External OS/container no-network-egress is mandatory. No broker,
 * NRML order, trailing stop or GTT control is implemented.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase75CounterfactualPremiumStopStress,
  type Phase75Input,type Phase75Pins
} from '../src/server/engine/ema15m/adaptivePhase75CounterfactualPremiumStopStress.js';

const arg=(k:string)=>{
  const i=process.argv.indexOf(k);
  return i<0?null:process.argv[i+1]??null;
};
function owned(v:string|null,max:number):v is string{
  if(!v||!isAbsolute(v)||v.includes('\0')||v.length>1300)return false;
  try{
    const f=resolve(v),d=dirname(f),
      a=lstatSync(f),b=lstatSync(d);
    return a.isFile()&&!a.isSymbolicLink()&&
      b.isDirectory()&&!b.isSymbolicLink()&&
      realpathSync(f)===f&&realpathSync(d)===d&&
      a.size>128&&a.size<=max&&
      (a.mode&0o077)===0&&(b.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (a.uid===process.getuid()&&b.uid===process.getuid()));
  }catch{return false;}
}
const privateInput=arg('--private-phase75-counterfactual-premium-dossier'),
  privatePins=arg('--independent-phase75-scenario-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !owned(privateInput,285_000_000)||!owned(privatePins,2_000_000)){
  console.error('PHASE75_PRIVATE_PREMIUM_STRESS_DOSSIER_AND_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase75-premium-stress.ts --approve-isolated-offline-review --private-phase75-counterfactual-premium-dossier <OWNER_0600_JSON> --independent-phase75-scenario-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(privateInput,'utf8')) as Phase75Input,
      pins=JSON.parse(readFileSync(privatePins,'utf8')) as Phase75Pins,
      r=auditPhase75CounterfactualPremiumStopStress(input,pins);
    // Only aggregate hypothetical risk indicators; NO full scenario
    // raw BID/ASK, instrument keys, exact OOS dates, source timestamps,
    // private issuer/license paperwork, secrets or broker credentials.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      parentPhase74Status:r.parentPhase74Status,
      syntheticDataset:r.syntheticDataset,
      originalOosDecisions:r.originalOosDecisions,
      originalNoEntryDecisions:r.originalNoEntryDecisions,
      allOriginalListedCePePairs:r.allOriginalListedCePePairs,
      originalEntryClaimedListedPairs:r.originalEntryClaimedListedPairs,
      originalNoEntryListedPairs:r.originalNoEntryListedPairs,
      completeCounterfactualStressPaths:r.completeCounterfactualStressPaths,
      premiumRunupGivebackScenarioCount:r.premiumRunupGivebackScenarioCount,
      afterPeakBidBelowHypotheticalTrailCount:
        r.afterPeakBidBelowHypotheticalTrailCount,
      zeroDisplayedBidDepthOrFullDebitPaths:
        r.zeroDisplayedBidDepthOrFullDebitPaths,
      counterfactualObservedMarkLossExceedsBudget:
        r.counterfactualObservedMarkLossExceedsBudget,
      paidLongOptionDebitExceedsPerEntryBudget:
        r.paidLongOptionDebitExceedsPerEntryBudget,
      observedQuoteMarksAreNotExecutableFills:
        r.observedQuoteMarksAreNotExecutableFills,
      hypotheticalStopLevelCannotGuaranteeGapFill:
        r.hypotheticalStopLevelCannotGuaranteeGapFill,
      completePaidPremiumAndFeesMayBeLost:
        r.completePaidPremiumAndFeesMayBeLost,
      underlyingIndexPointsCannotBeDeductedFromOptionPremiumPoints:
        r.underlyingIndexPointsCannotBeDeductedFromOptionPremiumPoints,
      genuineOriginalLicensedMarketTapeVerified:
        r.genuineOriginalLicensedMarketTapeVerified,
      trueOriginalClientDecisionAsOfCaptureVerified:
        r.trueOriginalClientDecisionAsOfCaptureVerified,
      actualMultiRegimeOosStrategyProfitabilityProven:
        r.actualMultiRegimeOosStrategyProfitabilityProven,
      optionContractOrOneToEightWeekRankAuthorized:
        r.optionContractOrOneToEightWeekRankAuthorized,
      overnightBrokerNativeNrmlGttStopChildExchangeAckVerified:
        r.overnightBrokerNativeNrmlGttStopChildExchangeAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      cells:r.cells,externalEvidenceRequired:r.externalEvidenceRequired
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE75_OFFLINE_PREMIUM_STRESS_EVIDENCE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
