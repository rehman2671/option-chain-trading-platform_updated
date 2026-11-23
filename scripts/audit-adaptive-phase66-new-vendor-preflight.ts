/**
 * Phase66 standalone vendor-candidate native-option L1 preflight.
 * Owner-private input and pins in separate 0600 files, 0700 directories;
 * process isolation/no network egress MUST be enforced outside Node.
 *
 * This script never contacts a vendor, exchange or broker, does not
 * download a historical data product, and never writes orders/GTT/stops.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase66StandaloneVendorPreflight,
  type Phase66Input,type Phase66IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase66StandaloneVendorPreflight.js';
const get=(flag:string):string|null=>{
  const i=process.argv.indexOf(flag);
  return i===-1?null:process.argv[i+1]??null;
};
function privateFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)
    return false;
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
const source=get('--private-phase66-new-vendor-dossier'),
  pinsPath=get('--independent-phase66-original-oos-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(source,160_000_000)||!privateFile(pinsPath,2_000_000)){
  console.error('PHASE66_PRIVATE_NEW_VENDOR_ARCHIVE_AND_PREREGISTERED_OOS_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase66-new-vendor-preflight.ts --approve-isolated-offline-review --private-phase66-new-vendor-dossier <OWNER_0600_JSON> --independent-phase66-original-oos-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase66Input,
      pins=JSON.parse(readFileSync(pinsPath,'utf8')) as
        Phase66IndependentPins;
    const r=auditPhase66StandaloneVendorPreflight(input,pins);
    // No source instrument IDs, quotes, strike prices, private file paths,
    // original availableAt events, vendor/license bytes or account details.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      declaredSyntheticDataset:r.declaredSyntheticDataset,
      originalOosDecisionDays:r.originalOosDecisionDays,
      originalIndependentTestFolds:r.originalIndependentTestFolds,
      distinctClaimedRegimes:r.distinctClaimedRegimes,
      noEntryOriginalOosDecisionDays:r.noEntryOriginalOosDecisionDays,
      originalListedCePeHorizonPairs:r.originalListedCePeHorizonPairs,
      nativeOriginalQuoteRows:r.nativeOriginalQuoteRows,
      originalListedPairsMeetingPrespecifiedSourceCoverage:
        r.originalListedPairsMeetingPrespecifiedSourceCoverage,
      originalListedPairsWithMissingSourceCoverage:
        r.originalListedPairsWithMissingSourceCoverage,
      sourceQuoteInstrumentsUnknownToOriginalCatalog:
        r.sourceQuoteInstrumentsUnknownToOriginalCatalog,
      allFourHorizonBothCePePerDecisionPreserved:
        r.allFourHorizonBothCePePerDecisionPreserved,
      predeclaredEmbargoAndUntouchedFoldIsolationSatisfied:
        r.predeclaredEmbargoAndUntouchedFoldIsolationSatisfied,
      cells:r.cells,
      independentlyVerifiedHistoricalL1ResearchLicence:
        r.independentlyVerifiedHistoricalL1ResearchLicence,
      claimedClientSourceClockIndependentlyTrusted:
        r.claimedClientSourceClockIndependentlyTrusted,
      independentlyAuthenticatedExchangeVendorProduct:
        r.independentlyAuthenticatedExchangeVendorProduct,
      officialContractExpiryMasterVerified:
        r.officialContractExpiryMasterVerified,
      externallyVerifiedMarketRegimesAndStatisticalOosEdge:
        r.externallyVerifiedMarketRegimesAndStatisticalOosEdge,
      actualSourceBidAskIsExecutableFillProof:
        r.actualSourceBidAskIsExecutableFillProof,
      bestExpiryContractOrStrategyAuthorized:
        r.bestExpiryContractOrStrategyAuthorized,
      brokerNativeNrmlStopAndGttAckVerified:
        r.brokerNativeNrmlStopAndGttAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalEvidenceRequired:r.externalEvidenceRequired
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE66_UNVERIFIED_VENDOR_CANDIDATE_PREFLIGHT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
