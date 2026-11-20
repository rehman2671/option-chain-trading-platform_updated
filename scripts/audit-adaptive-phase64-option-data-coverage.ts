/**
 * Phase64 offline acquisition-quality audit for ALL originally listed CE/PE.
 * The CLI contains no data download, network or broker action. OS-level
 * network isolation must be enforced independently by the operator.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase64OriginalListedL1AcquisitionCoverage,
  type Phase64Input,type Phase64IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase64OriginalListedL1Coverage.js';
const arg=(flag:string):string|null=>{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const file=resolve(s),folder=dirname(file),
      f=lstatSync(file),p=lstatSync(folder);
    return f.isFile()&&!f.isSymbolicLink()&&
      p.isDirectory()&&!p.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(folder)===folder&&
      f.size>128&&f.size<=max&&
      (f.mode&0o077)===0&&(p.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&p.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-phase64-original-listed-l1-package'),
  pinsFile=arg('--independent-phase64-all-listed-policy-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(source,160_000_000)||
  !privateFile(pinsFile,2_000_000)){
  console.error('PHASE64_OWNER_ONLY_ORIGINAL_L1_UNIVERSE_AND_COVERAGE_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase64-option-data-coverage.ts --approve-isolated-offline-review --private-phase64-original-listed-l1-package <OWNER_0600_JSON> --independent-phase64-all-listed-policy-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase64Input;
    const pins=JSON.parse(readFileSync(pinsFile,'utf8')) as
      Phase64IndependentPins;
    const r=auditPhase64OriginalListedL1AcquisitionCoverage(input,pins);
    // Aggregate only: never print contracts, strikes, raw exchange/vendor
    // source evidence, options BID/ASK, private docs, or account identities.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase63Status:r.phase63Status,syntheticDataset:r.syntheticDataset,
      originalOosDecisions:r.originalOosDecisions,
      originalEntryFirstArmHorizonAttempts:
        r.originalEntryFirstArmHorizonAttempts,
      fullOriginalListedOosContractPairs:r.fullOriginalListedOosContractPairs,
      sourceCoveredListedContractPairs:r.sourceCoveredListedContractPairs,
      sourceIncompleteListedContractPairs:r.sourceIncompleteListedContractPairs,
      originalDistinctObservedMarketRegimes:
        r.originalDistinctObservedMarketRegimes,
      originalOosTradingDays:r.originalOosTradingDays,
      rows:r.rows,
      additionalEvidenceRequired:r.additionalEvidenceRequired,
      independentRealVendorHistoricalL1LicenseVerified:
        r.independentRealVendorHistoricalL1LicenseVerified,
      independentSourceCaptureAtTimeVerified:
        r.independentSourceCaptureAtTimeVerified,
      officialExchangeContractExpiryMasterVerified:
        r.officialExchangeContractExpiryMasterVerified,
      sourceSpreadAndDisplayedDepthIsFillProof:
        r.sourceSpreadAndDisplayedDepthIsFillProof,
      bestOptionContractOrDurationRecommendationAuthorized:
        r.bestOptionContractOrDurationRecommendationAuthorized,
      brokerNativeNrmlStopGttFillAckVerified:
        r.brokerNativeNrmlStopGttFillAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE64_OWNER_ORIGINAL_OOS_OPTION_COVERAGE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
