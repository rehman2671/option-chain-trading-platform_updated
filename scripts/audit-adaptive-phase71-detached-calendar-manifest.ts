/**
 * Phase71 original claimed issuer holiday-calendar detached signature
 * OFFLINE preflight. Requires two separately retained owner-only files.
 *
 * OS/container must block all network egress independently. This Node
 * program never authenticates exchange trust roots or contacts broker,
 * markets, vendor, NRML stop/GTT services.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase71DetachedIssuerCalendarManifest,
  type Phase71Input,type Phase71IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase71DetachedCalendarManifest.js';

const flag=(v:string)=>{
  const i=process.argv.indexOf(v);
  return i<0?null:process.argv[i+1]??null;
};
function owned(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const p=resolve(s),dir=dirname(p),a=lstatSync(p),b=lstatSync(dir);
    return a.isFile()&&!a.isSymbolicLink()&&
      b.isDirectory()&&!b.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(dir)===dir&&
      a.size>128&&a.size<=max&&
      (a.mode&0o077)===0&&(b.mode&0o077)===0&&
      (typeof process.getuid!=='function'&&true||
        (a.uid===process.getuid()&&b.uid===process.getuid()));
  }catch{return false;}
}
const source=flag('--private-phase71-original-manifest-dossier'),
  pins=flag('--independent-phase71-candidate-signing-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !owned(source,260_000_000)||!owned(pins,2_000_000)){
  console.error('PHASE71_PRIVATE_SIGNED_ORIGINAL_CALENDAR_AND_SEPARATE_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase71-detached-calendar-manifest.ts --approve-isolated-offline-review --private-phase71-original-manifest-dossier <OWNER_0600_JSON> --independent-phase71-candidate-signing-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase71Input,
      independent=JSON.parse(readFileSync(pins,'utf8')) as
        Phase71IndependentPins,
      r=auditPhase71DetachedIssuerCalendarManifest(input,independent);
    // No raw public key/SPKI, certificate, signature, original manifest,
    // issuer claims, market quote, option contract, private file path,
    // availability timestamp or legal entitlement content is printed.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      parentPhase70Status:r.parentPhase70Status,
      syntheticDataset:r.syntheticDataset,
      originalOosDecisions:r.originalOosDecisions,
      originalNoEntryDays:r.originalNoEntryDays,
      originallyListedCePePairs:r.originallyListedCePePairs,
      originalArchiveCalendarDays:r.originalArchiveCalendarDays,
      candidatePublicKeyDerShapeValid:r.candidatePublicKeyDerShapeValid,
      candidateDetachedEd25519SignatureCryptographicallyValid:
        r.candidateDetachedEd25519SignatureCryptographicallyValid,
      signedManifestExactOriginalCalendarHashMatched:
        r.signedManifestExactOriginalCalendarHashMatched,
      signedManifestBindsExactPhase70InputsAndPins:
        r.signedManifestBindsExactPhase70InputsAndPins,
      claimedManifestChronologyStructurallyCausal:
        r.claimedManifestChronologyStructurallyCausal,
      independentExchangeIssuerKeyTrustAnchorEstablished:
        r.independentExchangeIssuerKeyTrustAnchorEstablished,
      claimedSignerSelfSignedTestIsNotExchangeSignature:
        r.claimedSignerSelfSignedTestIsNotExchangeSignature,
      signedClaimedTimeIsNotIndependentTrustedTimestamp:
        r.signedClaimedTimeIsNotIndependentTrustedTimestamp,
      independentlyVerifiedOriginalExchangeCalendar:
        r.independentlyVerifiedOriginalExchangeCalendar,
      independentlyVerifiedVendorHistoricalOptionL1License:
        r.independentlyVerifiedVendorHistoricalOptionL1License,
      historicallyTrustedClientStrategyAvailableAt:
        r.historicallyTrustedClientStrategyAvailableAt,
      independentlyProvenMultiregimeProfitableStrategy:
        r.independentlyProvenMultiregimeProfitableStrategy,
      entirePaidLongOptionPremiumDebitLossEliminated:
        r.entirePaidLongOptionPremiumDebitLossEliminated,
      bestOneToEightWeekExpiryAuthorized:
        r.bestOneToEightWeekExpiryAuthorized,
      brokerNativeNrmlGttStopChildExchangeAckVerified:
        r.brokerNativeNrmlGttStopChildExchangeAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalRequirements:r.externalRequirements
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE71_ORIGINAL_DETACHED_MANIFEST_INTEGRITY_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
