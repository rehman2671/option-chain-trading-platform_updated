/**
 * Phase62 owner-private offline original native CSV with two detached source
 * receipt proofs. User must enforce no-network-egress outside this process.
 * No broker API, order, GTT, stop mutation or historical data download.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase62NativeCsvDualReceipts,
  type Phase62Input,type Phase62IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase62NativeCsvDualReceipts.js';
function flag(name:string):string|null{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
}
function privateOwnerFile(s:string|null,max:number):s is string{
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
const source=flag('--private-phase62-original-native-csv-package'),
  pinsPath=flag('--independent-phase62-csv-signer-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateOwnerFile(source,125_000_000)||
  !privateOwnerFile(pinsPath,2_000_000)){
  console.error('PHASE62_OWNER_PRIVATE_ORIGINAL_CSV_AND_DETACHED_RECEIPT_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase62-native-csv-receipts.ts --approve-isolated-offline-review --private-phase62-original-native-csv-package <OWNER_0600_JSON> --independent-phase62-csv-signer-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase62Input,
      pins=JSON.parse(readFileSync(pinsPath,'utf8')) as
        Phase62IndependentPins;
    const r=auditPhase62NativeCsvDualReceipts(input,pins);
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase61Status:r.phase61Status,syntheticDataset:r.syntheticDataset,
      nativeCsvQuoteRows:r.nativeCsvQuoteRows,
      rowsMatchingOriginalPhase61CustodyAndPhase50:
        r.rowsMatchingOriginalPhase61CustodyAndPhase50,
      distinctSourceInstruments:r.distinctSourceInstruments,
      publisherAndWitnessKeysDistinct:r.publisherAndWitnessKeysDistinct,
      publisherEd25519SignatureMathematicallyValid:
        r.publisherEd25519SignatureMathematicallyValid,
      witnessEd25519SignatureMathematicallyValid:
        r.witnessEd25519SignatureMathematicallyValid,
      claimedPublisherWitnessTimeOrderInternallyConsistent:
        r.claimedPublisherWitnessTimeOrderInternallyConsistent,
      nativeExchangeOrVendorExportAuthenticated:
        r.nativeExchangeOrVendorExportAuthenticated,
      independentPublisherIdentityVerified:
        r.independentPublisherIdentityVerified,
      independentWitnessIdentityVerified:
        r.independentWitnessIdentityVerified,
      independentSourceCaptureClockVerified:
        r.independentSourceCaptureClockVerified,
      independentlyLicensedHistoricalFnoL1Verified:
        r.independentlyLicensedHistoricalFnoL1Verified,
      bestContractExpiryRecommendationAuthorized:
        r.bestContractExpiryRecommendationAuthorized,
      originalNativeBrokerNrmlStopAckVerified:
        r.originalNativeBrokerNrmlStopAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!==
      'DESCRIPTIVE_TWO_CLAIMED_ED25519_SIGNATURES_AND_NATIVE_CSV_CONSISTENT_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE62_ORIGINAL_VENDOR_SOURCE_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
