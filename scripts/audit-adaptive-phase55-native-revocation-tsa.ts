/**
 * Phase55 owner-approved no-egress offline original PDF + CRL/OCSP/RFC3161.
 * Uses native Phase37/38/39; NO broker, live position, GTT or order writes.
 *
 * The review-package JSON deliberately omits raw PDF bytes; this entrypoint
 * loads TWO actual owner-private PDF files and binds exact bytes to receipts.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase55NativeTwoSourceRevocationTsa,
  type Phase55Input,type Phase55IndependentPins,
  type Phase55SourceRevocationEvidence
} from '../src/server/engine/ema15m/adaptivePhase55NativeRevocationTsa.js';
import type {
  Phase54Input,Phase54IndependentPins,Phase54PdfVerificationRequest
} from '../src/server/engine/ema15m/adaptivePhase54OriginalPdfNativeCms.js';
import type {
  Phase53Input,Phase53IndependentPins,Phase53DocumentRole
} from '../src/server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.js';
import type {Phase52Input,Phase52Pins}
  from '../src/server/engine/ema15m/adaptivePhase52DetachedSourceReceipts.js';

const get=(name:string):string|null=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(path:string|null,max:number):path is string{
  if(!path||!isAbsolute(path)||path.includes('\0')||
    path.length>1300)return false;
  try{
    const p=resolve(path),d=dirname(p),
      file=lstatSync(p),folder=lstatSync(d);
    return file.isFile()&&!file.isSymbolicLink()&&
      folder.isDirectory()&&!folder.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(d)===d&&
      file.size>10&&file.size<=max&&
      (file.mode&0o077)===0&&(folder.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (file.uid===process.getuid()&&folder.uid===process.getuid()));
  }catch{return false;}
}
interface PrivatePackage{
  schemaVersion:'ADAPTIVE_PHASE55_PRIVATE_ORIGINAL_REVOCATION_DOSSIER_V1';
  phase52:Phase52Input;
  phase52Pins:Phase52Pins;
  phase53Pins:Phase53IndependentPins;
  phase54Pins:Phase54IndependentPins;
  pdfDocuments:Phase54PdfVerificationRequest[];
  revocation:Phase55SourceRevocationEvidence[];
}
const source=get('--private-phase55-source-revocation-package'),
  pins=get('--independent-phase55-revocation-pins'),
  l1=get('--private-original-l1-pdf'),
  cal=get('--private-original-calendar-pdf');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(source,25_000_000)||!privateFile(pins,1_000_000)||
  !privateFile(l1,2_000_000)||!privateFile(cal,2_000_000)){
  console.error('PHASE55_PRIVATE_ORIGINAL_DOCUMENTS_AND_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase55-native-revocation-tsa.ts --approve-isolated-offline-review --private-phase55-source-revocation-package <OWNER_0600_JSON> --independent-phase55-revocation-pins <OWNER_0600_JSON> --private-original-l1-pdf <OWNER_0600_PDF> --private-original-calendar-pdf <OWNER_0600_PDF>');
  process.exitCode=2;
}else{
  try{
    const pkg=JSON.parse(readFileSync(source!,'utf8')) as PrivatePackage,
      independent=JSON.parse(readFileSync(pins!,'utf8')) as
        Phase55IndependentPins;
    const paths:Record<Phase53DocumentRole,string>={
      ORIGINAL_OPTION_L1_REVIEWER:l1!,
      SESSION_CALENDAR_REVIEWER:cal!
    };
    if(pkg.schemaVersion!==
      'ADAPTIVE_PHASE55_PRIVATE_ORIGINAL_REVOCATION_DOSSIER_V1'||
      !Array.isArray(pkg.pdfDocuments)||
      pkg.pdfDocuments.length!==2||
      !Array.isArray(pkg.revocation)||pkg.revocation.length!==2||
      new Set(pkg.pdfDocuments.map(d=>d?.role)).size!==2||
      new Set(pkg.revocation.map(d=>d?.role)).size!==2)
      throw Error('INCOMPLETE_TWO_ORIGINAL_PDF_AND_REVOCATION_ROLES');
    for(const doc of pkg.pdfDocuments){
      if(!doc||!Object.prototype.hasOwnProperty.call(paths,doc.role)||
        doc.request?.originalPdfPath!==paths[doc.role])
        throw Error('ORIGINAL_PDF_PATH_SCOPE_MISMATCH');
    }
    for(const item of pkg.revocation){
      if(!item||!Object.prototype.hasOwnProperty.call(paths,item.role)||
        item.crlRequest?.originalPdfPath!==paths[item.role]||
        item.ocspRequest?.originalPdfPath!==paths[item.role]||
        !privateFile(item.crlRequest.privateRootCaPemPath,30000)||
        !privateFile(item.crlRequest.privateSignedCrlPemPath,128000)||
        !privateFile(item.ocspRequest.signedOcspDerPath,100000)||
        !privateFile(item.ocspRequest.signedTimestampResponseDerPath,150000)||
        !privateFile(item.ocspRequest.tsaSignerCertificatePemPath,30000))
        throw Error('ORIGINAL_CRL_OCSP_TSA_PRIVATE_FILE_PRECONDITION_FAILED');
    }
    const phase53:Phase53Input={
      schemaVersion:'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1',
      source:'OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED',
      phase52:pkg.phase52,phase52Pins:pkg.phase52Pins,
      documents:([
        'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
      ] as const).map(role=>({
        role,
        externalEvidenceReferenceId:pkg.phase52.receipts?.find(
          x=>x?.role===role)?.externalEvidenceReferenceId??'MISSING_REFERENCE',
        bytes:readFileSync(paths[role])
      }))
    };
    const phase54:Phase54Input={
      schemaVersion:'ADAPTIVE_PHASE54_SOURCE_PDF_NATIVE_CMS_JOIN_V1',
      source:'OFFLINE_PRIVATE_OPERATOR_PDF_AND_X509_UNVERIFIED',
      phase53,phase53Pins:pkg.phase53Pins,
      pdfDocuments:pkg.pdfDocuments
    };
    const input:Phase55Input={
      schemaVersion:'ADAPTIVE_PHASE55_TWO_SOURCE_OFFLINE_REVOCATION_TSA_V1',
      source:'OPERATOR_PRIVATE_OFFLINE_CRL_OCSP_TSA_UNVERIFIED',
      phase54,phase54Pins:pkg.phase54Pins,
      revocation:pkg.revocation
    };
    const report=auditPhase55NativeTwoSourceRevocationTsa(input,independent);
    console.log(JSON.stringify({
      mode:report.mode,status:report.status,
      reasonCodes:report.reasonCodes,
      phase54Status:report.phase54Status,
      datasetSynthetic:report.datasetSynthetic,
      expectedOosSessionCount:report.expectedOosSessionCount,
      fullOosAttemptDenominator:report.fullOosAttemptDenominator,
      originalPdfCmsDocumentsRevalidated:
        report.originalPdfCmsDocumentsRevalidated,
      nativeSignedCrlChainsRevalidated:
        report.nativeSignedCrlChainsRevalidated,
      nativeOfflineOcspAndRfc3161Revalidated:
        report.nativeOfflineOcspAndRfc3161Revalidated,
      independentIssuerIdentityAndEnrollmentVerified:
        report.independentIssuerIdentityAndEnrollmentVerified,
      genuinelyTrustedIssuerCaVerified:
        report.genuinelyTrustedIssuerCaVerified,
      actualOnlineRevocationAtCurrentTimeVerified:
        report.actualOnlineRevocationAtCurrentTimeVerified,
      independentlyTrustedTsaIdentityOrClockVerified:
        report.independentlyTrustedTsaIdentityOrClockVerified,
      originalOptionL1SourceAndLicenseIndependentlyVerified:
        report.originalOptionL1SourceAndLicenseIndependentlyVerified,
      untouchedOosOptionProfitabilityProven:
        report.untouchedOosOptionProfitabilityProven,
      brokerNrmlStopAckOrOvernightProtectionVerified:
        report.brokerNrmlStopAckOrOvernightProtectionVerified,
      executionAuthorized:report.executionAuthorized,
      productionSafe:report.productionSafe,
      nativeOrderInstruction:report.nativeOrderInstruction
    },null,2));
    if(report.status!==
      'TWO_NATIVE_OFFLINE_REVOCATION_AND_TSA_CHECKS_CONSISTENT_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE55_ORIGINAL_OFFLINE_REVOCATION_SOURCE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
