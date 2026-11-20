/**
 * Offline owner-private original Phase63 strategy receipt chain audit.
 * Network egress isolation MUST be externally enforced; this code itself
 * never calls a broker, source feed, exchange, orders, NRML or GTT APIs.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase63OriginalCaptureReceiptChain,
  type Phase63Input,type Phase63IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase63CaptureReceiptChain.js';
const flag=(key:string)=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
function ownerOnly(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const p=resolve(s),d=dirname(p),
      f=lstatSync(p),parent=lstatSync(d);
    return f.isFile()&&!f.isSymbolicLink()&&
      parent.isDirectory()&&!parent.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(d)===d&&
      f.size>128&&f.size<=max&&
      (f.mode&0o077)===0&&(parent.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&parent.uid===process.getuid()));
  }catch{return false;}
}
const source=flag('--private-phase63-original-capture-chain'),
  pinsPath=flag('--independent-phase63-source-and-seal-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerOnly(source,145_000_000)||
  !ownerOnly(pinsPath,2_000_000)){
  console.error('PHASE63_OWNER_ONLY_SOURCE_RECEIPT_CHAIN_AND_PIN_FILES_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase63-capture-receipts.ts --approve-isolated-offline-review --private-phase63-original-capture-chain <OWNER_0600_JSON> --independent-phase63-source-and-seal-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase63Input,
      pins=JSON.parse(readFileSync(pinsPath,'utf8')) as
        Phase63IndependentPins;
    const r=auditPhase63OriginalCaptureReceiptChain(input,pins);
    // Redacted aggregate summary: no quote bytes, timestamps, source IDs,
    // raw signature/key materials, private filenames or account identifiers.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase62Status:r.phase62Status,syntheticDataset:r.syntheticDataset,
      originalNativeQuoteRows:r.originalNativeQuoteRows,
      chainedOriginalSourceQuoteReceipts:
        r.chainedOriginalSourceQuoteReceipts,
      matchedOriginalQuotesAndClaimedAvailableAtReceipts:
        r.matchedOriginalQuotesAndClaimedAvailableAtReceipts,
      originalInstrumentCount:r.originalInstrumentCount,
      collectorKeyDistinctFromClaimedPublisherAndWitness:
        r.collectorKeyDistinctFromClaimedPublisherAndWitness,
      collectorEd25519SignatureMathematicallyValid:
        r.collectorEd25519SignatureMathematicallyValid,
      allOriginalReceiptHashesLinked:r.allOriginalReceiptHashesLinked,
      claimedStrategyReceiveTimeInternallyConsistent:
        r.claimedStrategyReceiveTimeInternallyConsistent,
      contemporaneousReceiptClockIndependentlyAuthenticated:
        r.contemporaneousReceiptClockIndependentlyAuthenticated,
      independentCollectorIdentityVerified:
        r.independentCollectorIdentityVerified,
      independentlyLicensedHistoricalOptionL1Verified:
        r.independentlyLicensedHistoricalOptionL1Verified,
      originalMultiRegimeOosProfitableTradingProven:
        r.originalMultiRegimeOosProfitableTradingProven,
      brokerNrmlNativeStopGttOvernightAcknowledged:
        r.brokerNrmlNativeStopGttOvernightAcknowledged,
      historicalBestContractRankingAuthorized:
        r.historicalBestContractRankingAuthorized,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!=='DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE63_ORIGINAL_PRIVATE_CAPTURE_RECEIPT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
