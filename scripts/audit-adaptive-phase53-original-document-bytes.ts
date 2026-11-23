/**
 * Adaptive Swing v2 Phase53 — manually invoked owner-private ORIGINAL
 * document-byte custody audit. No API, broker, orders, GTT, or writes.
 * Original PDF/CSV bytes and signed receipt details never enter CLI output.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase53OriginalDocumentByteCustody,
  type Phase53Input,type Phase53IndependentPins,
  type Phase53DocumentRole
} from '../src/server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.js';
import type {Phase52Input,Phase52Pins}
  from '../src/server/engine/ema15m/adaptivePhase52DetachedSourceReceipts.js';

const arg=(name:string):string|null=>{
  const index=process.argv.indexOf(name);
  return index<0?null:process.argv[index+1]??null;
};
function ownerPrivateFile(input:string|null,max:number):input is string{
  if(!input||!isAbsolute(input)||input.includes('\0')||
    input.length>1300)return false;
  try{
    const path=resolve(input),parent=dirname(path),
      file=lstatSync(path),folder=lstatSync(parent);
    return file.isFile()&&!file.isSymbolicLink()&&
      folder.isDirectory()&&!folder.isSymbolicLink()&&
      realpathSync(path)===path&&realpathSync(parent)===parent&&
      file.size>30&&file.size<=max&&
      (file.mode&0o077)===0&&(folder.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (file.uid===process.getuid()&&folder.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-phase52-signed-source-dossier'),
  phase52Pins=arg('--private-phase52-independent-pins'),
  phase53Pins=arg('--private-phase53-document-byte-pins'),
  l1Document=arg('--private-original-l1-evidence-document'),
  calendarDocument=arg('--private-original-calendar-evidence-document');
const authorized=process.argv.includes('--approve-isolated-offline-review')&&
  ownerPrivateFile(source,25_000_000)&&
  ownerPrivateFile(phase52Pins,1_000_000)&&
  ownerPrivateFile(phase53Pins,1_000_000)&&
  ownerPrivateFile(l1Document,4_194_304)&&
  ownerPrivateFile(calendarDocument,4_194_304);
if(!authorized){
  console.error('PHASE53_OFFLINE_OWNER_PRIVATE_ORIGINAL_DOCUMENT_PRECONDITIONS_FAILED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase53-original-document-bytes.ts --approve-isolated-offline-review --private-phase52-signed-source-dossier <OWNER_0600_JSON> --private-phase52-independent-pins <OWNER_0600_JSON> --private-phase53-document-byte-pins <OWNER_0600_JSON> --private-original-l1-evidence-document <OWNER_0600_BINARY> --private-original-calendar-evidence-document <OWNER_0600_BINARY>');
  process.exitCode=2;
}else{
  try{
    const phase52=JSON.parse(readFileSync(source!,'utf8')) as Phase52Input,
      innerPins=JSON.parse(readFileSync(phase52Pins!,'utf8')) as Phase52Pins,
      pins=JSON.parse(readFileSync(phase53Pins!,'utf8')) as
        Phase53IndependentPins;
    const doc=(
      role:Phase53DocumentRole,file:string
    )=>{
      const receipt=phase52.receipts?.find(x=>x?.role===role);
      return {
        role,
        externalEvidenceReferenceId:
          receipt?.externalEvidenceReferenceId??'MISSING_REFERENCE',
        bytes:readFileSync(file)
      };
    };
    const input:Phase53Input={
      schemaVersion:'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1',
      source:'OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED',
      phase52,phase52Pins:innerPins,
      documents:[
        doc('ORIGINAL_OPTION_L1_REVIEWER',l1Document!),
        doc('SESSION_CALENDAR_REVIEWER',calendarDocument!)
      ]
    };
    const r=auditPhase53OriginalDocumentByteCustody(input,pins);
    // Only redacted counts and negative proof flags, never paths/PEM/receipts.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase52Status:r.phase52Status,
      datasetSynthetic:r.datasetSynthetic,
      verifiedDocumentRoles:r.verifiedDocumentRoles,
      distinctOriginalDocumentDigests:r.distinctOriginalDocumentDigests,
      claimedOriginalDocumentBytesVerified:r.claimedOriginalDocumentBytesVerified,
      declaredOosSessions:r.declaredOosSessions,
      originalOptionL1QuoteRows:r.originalOptionL1QuoteRows,
      fullOosArmHorizonAttempts:r.fullOosArmHorizonAttempts,
      externalDocumentIssuerAuthenticated:r.externalDocumentIssuerAuthenticated,
      originalDocumentCmsSignatureAuthenticated:
        r.originalDocumentCmsSignatureAuthenticated,
      independentVendorHistoricalLicenseVerified:
        r.independentVendorHistoricalLicenseVerified,
      sourceAvailableAtIndependentlyVerified:
        r.sourceAvailableAtIndependentlyVerified,
      strategyOosProfitabilityProven:r.strategyOosProfitabilityProven,
      genuineBrokerNativeStopAckVerified:r.genuineBrokerNativeStopAckVerified,
      nrmlOvernightProtectionProven:r.nrmlOvernightProtectionProven,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!=='ORIGINAL_DOCUMENT_BYTES_MATCH_SIGNED_RECEIPTS_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE53_PRIVATE_ORIGINAL_DOCUMENT_BYTES_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
