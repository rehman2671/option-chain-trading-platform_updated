/**
 * OWNER-PRIVATE OFFLINE Phase72 registrar/witness/issuer key lifecycle
 * review. Requires external OS/container network isolation. No broker,
 * exchange, vendor, NRML order, native stop, GTT or 15:15 exit writer.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase72CandidateIssuerKeyLifecycle,
  type Phase72Input,type Phase72Pins
} from '../src/server/engine/ema15m/adaptivePhase72IssuerKeyLifecycle.js';
function flag(key:string):string|null{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
}
function ownerOnly(path:string|null,max:number):path is string{
  if(!path||!isAbsolute(path)||path.includes('\0')||path.length>1300)
    return false;
  try{
    const file=resolve(path),dir=dirname(file),
      f=lstatSync(file),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(dir)===dir&&
      f.size>128&&f.size<=max&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=flag('--private-phase72-key-lifecycle-dossier'),
  pins=flag('--independent-phase72-registrar-witness-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerOnly(source,265_000_000)||!ownerOnly(pins,2_000_000)){
  console.error('PHASE72_PRIVATE_THREE_ROLE_LIFECYCLE_AND_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase72-key-lifecycle.ts --approve-isolated-offline-review --private-phase72-key-lifecycle-dossier <OWNER_0600_JSON> --independent-phase72-registrar-witness-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase72Input,
      separate=JSON.parse(readFileSync(pins,'utf8')) as Phase72Pins,
      r=auditPhase72CandidateIssuerKeyLifecycle(input,separate);
    // No issuer/registrar/witness key, signature, identifier, exact time,
    // raw calendar, private quote, licensing bytes, strike or account.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase71Status:r.phase71Status,syntheticDataset:r.syntheticDataset,
      originalOosDecisions:r.originalOosDecisions,
      originalNoEntryDays:r.originalNoEntryDays,
      originalListedCePePairs:r.originalListedCePePairs,
      originalArchiveCalendarDays:r.originalArchiveCalendarDays,
      candidateRegistrarSignatureMathematicallyValid:
        r.candidateRegistrarSignatureMathematicallyValid,
      candidateWitnessSignatureMathematicallyValid:
        r.candidateWitnessSignatureMathematicallyValid,
      candidateIssuerRegistrarWitnessKeysPairwiseDistinct:
        r.candidateIssuerRegistrarWitnessKeysPairwiseDistinct,
      candidateIssuerKeyPresentActiveAtClaimedSigningTime:
        r.candidateIssuerKeyPresentActiveAtClaimedSigningTime,
      candidateRosterHasNonOverlappingActiveKeyWindows:
        r.candidateRosterHasNonOverlappingActiveKeyWindows,
      candidateWitnessReceiptBindingsAndClaimedClockConsistent:
        r.candidateWitnessReceiptBindingsAndClaimedClockConsistent,
      candidateRegistrarRosterIsOfficial:r.candidateRegistrarRosterIsOfficial,
      candidateWitnessIndependentlyAuthenticated:
        r.candidateWitnessIndependentlyAuthenticated,
      candidateIssuerPublicKeyOfficiallyTrusted:
        r.candidateIssuerPublicKeyOfficiallyTrusted,
      historicalKeyRevocationIndependentlyVerified:
        r.historicalKeyRevocationIndependentlyVerified,
      actualIndependentPublicationClockVerified:
        r.actualIndependentPublicationClockVerified,
      legalOptionHistoricalL1DataLicenseVerified:
        r.legalOptionHistoricalL1DataLicenseVerified,
      marketRegimeOosProfitabilityProven:
        r.marketRegimeOosProfitabilityProven,
      wholeLongOptionPaidPremiumDebitProtected:
        r.wholeLongOptionPaidPremiumDebitProtected,
      recommendedOneToEightWeekHorizonAuthorized:
        r.recommendedOneToEightWeekHorizonAuthorized,
      brokerNativeNrmlGttStopChildExchangeAckVerified:
        r.brokerNativeNrmlGttStopChildExchangeAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalEvidenceRequired:r.externalEvidenceRequired
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE72_ORIGINAL_REGISTRAR_KEY_LIFECYCLE_FAILED_CLOSED');
    process.exitCode=2;
  }
}
