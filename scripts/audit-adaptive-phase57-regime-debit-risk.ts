/**
 * Phase57 manually initiated owner-private offline original option debit audit.
 * No API, network, broker order, native GTT, instrument orders or writes.
 * Logs only aggregate stress, not source prices, instrument IDs or file paths.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {
  auditPhase57RegimeHorizonDebitRisk,
  type Phase57Input,type Phase57IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase57RegimeHorizonDebitRisk.js';
const flag=(name:string)=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(p:string|null,max:number):p is string{
  if(!p||!isAbsolute(p)||p.includes('\0')||p.length>1300)return false;
  try{
    const x=resolve(p),dir=dirname(x),f=lstatSync(x),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(x)===x&&realpathSync(dir)===dir&&
      f.size>50&&f.size<=max&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=flag('--private-original-phase57-oos-risk-source'),
  pinned=flag('--private-prespecified-phase57-risk-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(source,25_000_000)||
  !privateFile(pinned,1_000_000)){
  console.error('PHASE57_PRIVATE_ORIGINAL_MARKET_SOURCE_AND_POLICY_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase57-regime-debit-risk.ts --approve-isolated-offline-review --private-original-phase57-oos-risk-source <OWNER_0600_JSON> --private-prespecified-phase57-risk-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase57Input;
    const pins=JSON.parse(readFileSync(pinned,'utf8')) as
      Phase57IndependentPins;
    const result=auditPhase57RegimeHorizonDebitRisk(input,pins);
    console.log(JSON.stringify({
      mode:result.mode,status:result.status,
      reasonCodes:result.reasonCodes,
      syntheticDataset:result.syntheticDataset,
      phase51Status:result.phase51Status,
      oosSessions:result.oosSessions,
      attemptedArmHorizonDecisions:result.attemptedArmHorizonDecisions,
      originalObservedEntries:result.originalObservedEntries,
      originalUnpricedSelectedOptionEntries:
        result.originalUnpricedSelectedOptionEntries,
      distinctObservedRegimes:result.distinctObservedRegimes,
      regimeDecisionCounts:result.regimeDecisionCounts,
      singleEntryDebitBudgetBreaches:result.singleEntryDebitBudgetBreaches,
      combinedFourHorizonDebitBudgetBreaches:
        result.combinedFourHorizonDebitBudgetBreaches,
      missingOrAmbiguousOriginalQuoteBindings:
        result.missingOrAmbiguousOriginalQuoteBindings,
      hypotheticalCapitalCanLoseEntirePremiumDebit:
        result.hypotheticalCapitalCanLoseEntirePremiumDebit,
      rankOrChooseBestHorizonAuthorized:result.rankOrChooseBestHorizonAuthorized,
      greekOrIvThetaShockStatisticallyCalibrated:
        result.greekOrIvThetaShockStatisticallyCalibrated,
      unbiasedMultiRegimeOosProfitabilityProven:
        result.unbiasedMultiRegimeOosProfitabilityProven,
      originalLicensedL1IndependentlyAuthenticated:
        result.originalLicensedL1IndependentlyAuthenticated,
      brokerFillOrNativeOvernightStopVerified:
        result.brokerFillOrNativeOvernightStopVerified,
      executionAuthorized:result.executionAuthorized,
      productionSafe:result.productionSafe,
      nativeOrderInstruction:result.nativeOrderInstruction
    },null,2));
    if(!result.status.startsWith('DESCRIPTIVE_'))
      process.exitCode=2;
  }catch{
    console.error('PHASE57_PRIVATE_ORIGINAL_RISK_EVIDENCE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
