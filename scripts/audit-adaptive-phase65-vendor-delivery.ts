/**
 * Phase65 offline owner-private candidate vendor Level-1 data handoff review.
 * Strict file modes and SHA consistency do NOT establish vendor identity,
 * licensed use, original receive clocks, historical strategy profitability
 * or broker safety. No network use in this script; operator must enforce
 * network egress restrictions at OS/container boundary.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase65CandidateVendorDelivery,
  type Phase65Input,type Phase65IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase65VendorDeliveryIntake.js';

function flag(name:string):string|null{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
}
function ownerOnlyFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const p=resolve(s),d=dirname(p),f=lstatSync(p),parent=lstatSync(d);
    return f.isFile()&&!f.isSymbolicLink()&&
      parent.isDirectory()&&!parent.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(d)===d&&
      f.size>128&&f.size<=max&&
      (f.mode&0o077)===0&&(parent.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&parent.uid===process.getuid()));
  }catch{return false;}
}
const source=flag('--private-phase65-vendor-candidate-package'),
  pinsFile=flag('--independent-phase65-vendor-delivery-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerOnlyFile(source,210_000_000)||
  !ownerOnlyFile(pinsFile,2_000_000)){
  console.error('PHASE65_OWNER_ONLY_NATIVE_VENDOR_HANDOFF_AND_PIN_FILES_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase65-vendor-delivery.ts --approve-isolated-offline-review --private-phase65-vendor-candidate-package <OWNER_0600_JSON> --independent-phase65-vendor-delivery-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase65Input;
    const pins=JSON.parse(readFileSync(pinsFile,'utf8')) as
      Phase65IndependentPins;
    const r=auditPhase65CandidateVendorDelivery(input,pins);
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase64Status:r.phase64Status,syntheticDataset:r.syntheticDataset,
      originalOosDecisionDays:r.originalOosDecisionDays,
      originalArmHorizonAttempts:r.originalArmHorizonAttempts,
      allListedOriginalCePePairs:r.allListedOriginalCePePairs,
      allListedOriginalCePePairsWithSourceCoverage:
        r.allListedOriginalCePePairsWithSourceCoverage,
      completeOriginalOptionQuoteRows:r.completeOriginalOptionQuoteRows,
      candidateNativeOptionQuoteRows:r.candidateNativeOptionQuoteRows,
      candidateRowsMatchingOriginalSource:
        r.candidateRowsMatchingOriginalSource,
      originalListedCePeHorizonCoverageCells:
        r.originalListedCePeHorizonCoverageCells,
      candidateOriginalSessionCatalogBytesMatched:
        r.candidateOriginalSessionCatalogBytesMatched,
      quotedOriginalClientAvailableAtSupportedByIndependentDelivery:
        r.quotedOriginalClientAvailableAtSupportedByIndependentDelivery,
      archiveDownloadClockIsOriginalClientReceipt:
        r.archiveDownloadClockIsOriginalClientReceipt,
      independentVendorHistoricalDataIdentityAuthenticated:
        r.independentVendorHistoricalDataIdentityAuthenticated,
      historicalNseBseL1ResearchLicenseIndependentlyVerified:
        r.historicalNseBseL1ResearchLicenseIndependentlyVerified,
      realUntouchedMultiregimeOosOptionReturnsProven:
        r.realUntouchedMultiregimeOosOptionReturnsProven,
      bestExpiryOrContractRecommendationAuthorized:
        r.bestExpiryOrContractRecommendationAuthorized,
      brokerNrmlStopGttAckVerified:r.brokerNrmlStopGttAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalEvidenceStillRequired:r.externalEvidenceStillRequired
    },null,2));
    if(r.status!=='DESCRIPTIVE_OWNER_MATCHED_CANDIDATE_DELIVERY_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE65_VENDOR_DELIVERY_CANDIDATE_INTAKE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
