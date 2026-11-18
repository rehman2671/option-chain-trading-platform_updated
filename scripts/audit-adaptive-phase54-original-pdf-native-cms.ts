/**
 * Phase54 manually approved offline owner-private original-PDF CMS audit.
 * It invokes native Phase37 OpenSSL verification for TWO exactly pinned
 * original PDFs. It never calls a broker/HTTP/GTT/order or grants trading.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase54OriginalPdfNativeCms,
  type Phase54Input,type Phase54IndependentPins,
  type Phase54PdfVerificationRequest
} from '../src/server/engine/ema15m/adaptivePhase54OriginalPdfNativeCms.js';
import type {
  Phase53Input,Phase53IndependentPins,Phase53DocumentRole
} from '../src/server/engine/ema15m/adaptivePhase53OriginalDocumentBytes.js';
import type {Phase52Input,Phase52Pins}
  from '../src/server/engine/ema15m/adaptivePhase52DetachedSourceReceipts.js';

function flag(key:string):string|null{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
}
function ownerFile(raw:string|null,max:number):raw is string{
  if(!raw||!isAbsolute(raw)||raw.includes('\0')||raw.length>1300)
    return false;
  try{
    const p=resolve(raw),dir=dirname(p),
      f=lstatSync(p),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(dir)===dir&&
      f.size>=64&&f.size<=max&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
interface ManualReviewPackage{
  schemaVersion:'ADAPTIVE_PHASE54_OWNER_PRIVATE_REVIEW_PACKAGE_V1';
  phase52:Phase52Input;
  phase52Pins:Phase52Pins;
  phase53Pins:Phase53IndependentPins;
  pdfDocuments:Phase54PdfVerificationRequest[];
}
const source=flag('--private-phase54-signed-source-review'),
  pins=flag('--independent-phase54-original-pdf-pins'),
  optionPdf=flag('--private-original-l1-evidence-pdf'),
  calendarPdf=flag('--private-original-calendar-evidence-pdf');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerFile(source,25_000_000)||!ownerFile(pins,1_000_000)||
  !ownerFile(optionPdf,2_000_000)||
  !ownerFile(calendarPdf,2_000_000)){
  console.error('PHASE54_PRIVATE_ORIGINAL_PDFS_AND_INDEPENDENT_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase54-original-pdf-native-cms.ts --approve-isolated-offline-review --private-phase54-signed-source-review <OWNER_0600_JSON> --independent-phase54-original-pdf-pins <OWNER_0600_JSON> --private-original-l1-evidence-pdf <OWNER_0600_PDF> --private-original-calendar-evidence-pdf <OWNER_0600_PDF>');
  process.exitCode=2;
}else{
  try{
    const pkg=JSON.parse(readFileSync(source!,'utf8')) as ManualReviewPackage,
      trust=JSON.parse(readFileSync(pins!,'utf8')) as
        Phase54IndependentPins;
    const byRole:Record<Phase53DocumentRole,string>={
      ORIGINAL_OPTION_L1_REVIEWER:optionPdf!,
      SESSION_CALENDAR_REVIEWER:calendarPdf!
    };
    if(pkg.schemaVersion!==
      'ADAPTIVE_PHASE54_OWNER_PRIVATE_REVIEW_PACKAGE_V1'||
      !Array.isArray(pkg.pdfDocuments)||
      pkg.pdfDocuments.length!==2||
      pkg.pdfDocuments.some(item=>
        !item||!Object.prototype.hasOwnProperty.call(byRole,item.role)||
        item.request?.originalPdfPath!==byRole[item.role]))
      throw Error('ORIGINAL_PDF_VERIFIER_SOURCE_SCOPE_MISMATCH');
    const phase53:Phase53Input={
      schemaVersion:'ADAPTIVE_PHASE53_ORIGINAL_DOCUMENT_BYTES_V1',
      source:'OFFLINE_OPERATOR_SUPPLIED_DOCUMENTS_UNVERIFIED',
      phase52:pkg.phase52,phase52Pins:pkg.phase52Pins,
      documents:([
        'ORIGINAL_OPTION_L1_REVIEWER','SESSION_CALENDAR_REVIEWER'
      ] as const).map(role=>({
        role,
        externalEvidenceReferenceId:
          pkg.phase52.receipts.find(r=>r.role===role)
            ?.externalEvidenceReferenceId??'MISSING_REFERENCE',
        bytes:readFileSync(byRole[role])
      }))
    };
    const input:Phase54Input={
      schemaVersion:'ADAPTIVE_PHASE54_SOURCE_PDF_NATIVE_CMS_JOIN_V1',
      source:'OFFLINE_PRIVATE_OPERATOR_PDF_AND_X509_UNVERIFIED',
      phase53,phase53Pins:pkg.phase53Pins,
      pdfDocuments:pkg.pdfDocuments
    };
    const r=auditPhase54OriginalPdfNativeCms(input,trust);
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase53Status:r.phase53Status,
      syntheticDataset:r.syntheticDataset,
      originalPdfDocumentsWithNativeCmsVerified:
        r.originalPdfDocumentsWithNativeCmsVerified,
      independentlyPinnedDistinctCmsSignerKeys:
        r.independentlyPinnedDistinctCmsSignerKeys,
      declaredOosSessions:r.declaredOosSessions,
      fullOosArmHorizonAttempts:r.fullOosArmHorizonAttempts,
      exactOriginalDocumentBytesJoined:r.exactOriginalDocumentBytesJoined,
      nativeCmsCryptoAndSignedByteRangesVerified:
        r.nativeCmsCryptoAndSignedByteRangesVerified,
      independentRealWorldIssuerIdentityVerified:
        r.independentRealWorldIssuerIdentityVerified,
      independentlyTrustedIssuerCertificateChainVerified:
        r.independentlyTrustedIssuerCertificateChainVerified,
      revocationAndTrustedTimestampVerified:
        r.revocationAndTrustedTimestampVerified,
      licensedOriginalOptionL1IndependentlyAuthenticated:
        r.licensedOriginalOptionL1IndependentlyAuthenticated,
      brokerNativeNrmlStopOrGttAckVerified:
        r.brokerNativeNrmlStopOrGttAckVerified,
      overnightRiskProtected:r.overnightRiskProtected,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!=='TWO_ORIGINAL_PDF_CMS_CRYPTO_VALID_ISSUERS_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE54_PRIVATE_ORIGINAL_PDF_NATIVE_CMS_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
