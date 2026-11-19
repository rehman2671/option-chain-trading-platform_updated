/**
 * Phase61 owner-private, offline original L1 archive custody and OOS review.
 *
 * IMPORTANT: JSONL quote envelope is NOT an authentic vendor-native capture.
 * This script reads private files; it does not grant license trust, broker
 * access, production approval, NRML stop ACK, or order/GTT rights.
 * Operator must enforce process-level NO NETWORK egress externally.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase61OriginalL1CustodyReadiness,
  type Phase61Input,type Phase61IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase61OriginalL1CustodyIntake.js';
const arg=(name:string):string|null=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)
    return false;
  try{
    const p=resolve(s),d=dirname(p),f=lstatSync(p),parent=lstatSync(d);
    return f.isFile()&&!f.isSymbolicLink()&&
      parent.isDirectory()&&!parent.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(d)===d&&
      f.size>64&&f.size<=max&&
      (f.mode&0o077)===0&&(parent.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&parent.uid===process.getuid()));
  }catch{return false;}
}
const original=arg('--private-phase61-original-source-archive-package'),
  pins=arg('--independent-phase61-source-archive-byte-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(original,90_000_000)||
  !privateFile(pins,2_000_000)){
  console.error('PHASE61_PRIVATE_ORIGINAL_L1_SOURCE_AND_INDEPENDENT_ARCHIVE_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase61-original-l1-custody.ts --approve-isolated-offline-review --private-phase61-original-source-archive-package <OWNER_0600_JSON> --independent-phase61-source-archive-byte-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(original,'utf8')) as Phase61Input;
    const pinned=JSON.parse(readFileSync(pins,'utf8')) as
      Phase61IndependentPins;
    const r=auditPhase61OriginalL1CustodyReadiness(input,pinned);
    // Only fixed aggregate counters/flags; never raw JSONL or source proofs.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase60Status:r.phase60Status,
      syntheticDataset:r.syntheticDataset,
      originalQuoteEnvelopeRows:r.originalQuoteEnvelopeRows,
      matchingOriginalPhase50QuoteRows:
        r.matchingOriginalPhase50QuoteRows,
      originalInstrumentCount:r.originalInstrumentCount,
      originalContractMasterDecisionSnapshots:
        r.originalContractMasterDecisionSnapshots,
      originalContractMasterListedRows:
        r.originalContractMasterListedRows,
      originalCalendarSessions:r.originalCalendarSessions,
      originalOosDecisions:r.originalOosDecisions,
      originalOosArmHorizonAttempts:r.originalOosArmHorizonAttempts,
      originalDistinctDecisionTimeRegimes:
        r.originalDistinctDecisionTimeRegimes,
      originalOosEvidenceCoverageSufficient:
        r.originalOosEvidenceCoverageSufficient,
      operatorClaimedLicenseDocumentBytesPinned:
        r.operatorClaimedLicenseDocumentBytesPinned,
      independentVendorSignedRawTransportValidated:
        r.independentVendorSignedRawTransportValidated,
      independentlyLicensedFnoHistoricalL1Verified:
        r.independentlyLicensedFnoHistoricalL1Verified,
      officialContractCatalogAndExpiryIssuerValidated:
        r.officialContractCatalogAndExpiryIssuerValidated,
      independentlyTrustedSourceAvailableAtClock:
        r.independentlyTrustedSourceAvailableAtClock,
      qualifiedProfitabilityOrBestHorizonRankingProven:
        r.qualifiedProfitabilityOrBestHorizonRankingProven,
      brokerNativeNrmlOvernightStopAckVerified:
        r.brokerNativeNrmlOvernightStopAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!=='DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE61_PRIVATE_SOURCE_CUSTODY_PACKAGE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
