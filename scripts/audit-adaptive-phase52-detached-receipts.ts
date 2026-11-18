/**
 * Adaptive Phase52 owner-private MANUAL offline detached original-data receipt
 * audit. No live broker, market API, order/GTT calls or source upload.
 * Only redacted aggregate fields are printed.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase52DetachedSourceCalendarReceipts,
  type Phase52Input,type Phase52Pins
} from '../src/server/engine/ema15m/adaptivePhase52DetachedSourceReceipts.js';

function arg(name:string):string|null{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
}
function privateOwnerFile(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.includes('\0')||p.length>1300)
    return false;
  try{
    const file=resolve(p),folder=dirname(file),
      f=lstatSync(file),d=lstatSync(folder);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(folder)===folder&&
      f.size>30&&f.size<=25_000_000&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
       (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-phase52-detached-receipt-dossier'),
  pins=arg('--independent-phase52-source-receipt-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateOwnerFile(source)||!privateOwnerFile(pins)){
  console.error('PHASE52_PRIVATE_OFFLINE_SOURCE_AND_INDEPENDENT_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase52-detached-receipts.ts --approve-isolated-offline-review --private-phase52-detached-receipt-dossier <OWNER_0600_JSON> --independent-phase52-source-receipt-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase52Input,
      trust=JSON.parse(readFileSync(pins,'utf8')) as Phase52Pins;
    const report=auditPhase52DetachedSourceCalendarReceipts(input,trust);
    console.log(JSON.stringify({
      mode:report.mode,status:report.status,
      reasonCodes:report.reasonCodes,
      datasetSynthetic:report.datasetSynthetic,
      phase51Status:report.phase51Status,
      declaredOosSessions:report.declaredOosSessions,
      originalOosDecisions:report.originalOosDecisions,
      originalOptionL1RecordCount:report.originalOptionL1RecordCount,
      fullOosArmHorizonDenominator:report.fullOosArmHorizonDenominator,
      validDistinctDetachedWitnesses:report.validDistinctDetachedWitnesses,
      distinctReviewerOrganizations:report.distinctReviewerOrganizations,
      externallyAuthenticatedVendor:report.externallyAuthenticatedVendor,
      exchangeCalendarIssuerAuthenticated:
        report.exchangeCalendarIssuerAuthenticated,
      licensedHistoricalOptionL1IndependentlyVerified:
        report.licensedHistoricalOptionL1IndependentlyVerified,
      sourceAvailableAtIndependentlyAuthenticated:
        report.sourceAvailableAtIndependentlyAuthenticated,
      reviewerKeyOwnershipIndependentlyVerified:
        report.reviewerKeyOwnershipIndependentlyVerified,
      trustedThirdPartyTimestampEstablished:
        report.trustedThirdPartyTimestampEstablished,
      nativeNrmlOvernightStopInstalled:report.nativeNrmlOvernightStopInstalled,
      executionAuthorized:report.executionAuthorized,
      productionSafe:report.productionSafe,
      nativeOrderInstruction:report.nativeOrderInstruction
    },null,2));
    if(report.status!==
      'CRYPTOGRAPHIC_BINDINGS_VALID_EXTERNAL_AUTHENTICATION_REQUIRED')
      process.exitCode=2;
  }catch{
    console.error('PHASE52_PRIVATE_OFFLINE_ATTESTATION_REVIEW_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
